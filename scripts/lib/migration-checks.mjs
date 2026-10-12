// Security checks shared by scripts/safe-migrate.mjs (after a migration and in --verify) and its tests.
// Pure functions over a snapshot; snapshotSecurity() reads the snapshot with plain catalogue queries (no writes).

/**
 * Tables without row level security on purpose, each fixed by name. They existed before M2 and hold no company rows:
 * companies (the tenants), users and sessions (sign-in across companies), document_types (shared catalogue).
 * There is no pattern and no automatic exemption: any other table without RLS is reported.
 */
export const KNOWN_GLOBAL_TABLES = Object.freeze(['companies', 'document_types', 'sessions', 'users'])

/**
 * The rate-limit counter table must stay exactly this narrow (migrations 0015, 0016, 0020, 0021): who, which company,
 * what kind, when; RLS forced; the app may only read and add rows (no UPDATE, DELETE or TRUNCATE), so no request can
 * reset or edit a counter. Any change to its columns, privileges or policies is reported until this spec is updated
 * deliberately together with a reviewed migration.
 */
export const SENSITIVE_ACTIONS_TABLE = 'user_sensitive_actions'
export const SENSITIVE_ACTIONS_SPEC = Object.freeze({
  columns: Object.freeze({ id: 'uuid', user_id: 'uuid', company_id: 'uuid', action: 'text', at: 'timestamp with time zone' }),
  appPrivileges: Object.freeze(['INSERT', 'SELECT']),
  policies: Object.freeze({ SELECT: 'user_sensitive_actions_select', INSERT: 'user_sensitive_actions_insert' }),
})
export const APP_ROLE = 'acarvo_app'

/** Reads what the checks need. `client` is a connected pg client (owner role); nothing is written. */
export async function snapshotSecurity(client) {
  const tables = (
    await client.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r' order by 1`)
  ).rows
  const rls = Object.fromEntries(tables.map((r) => [r.relname, { enabled: r.relrowsecurity, forced: r.relforcerowsecurity }]))
  const columns = (
    await client.query(`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [SENSITIVE_ACTIONS_TABLE])
  ).rows.map((r) => ({ name: r.column_name, type: r.data_type }))
  const privileges = (
    await client.query(`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = $1 and grantee = $2 order by 1`, [SENSITIVE_ACTIONS_TABLE, APP_ROLE])
  ).rows.map((r) => r.privilege_type)
  const policies = (await client.query(`select policyname, cmd from pg_policies where schemaname = 'public' and tablename = $1 order by 1`, [SENSITIVE_ACTIONS_TABLE])).rows.map((r) => ({
    name: r.policyname,
    cmd: r.cmd,
  }))
  const hasJournal = (await client.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as e`)).rows[0].e
  const migrations = hasJournal ? Number((await client.query('select count(*) n from drizzle.__drizzle_migrations')).rows[0].n) : 0
  return { rls, sensitive: { columns, privileges, policies }, migrations }
}

/** Problems of the counter table. An absent table (database before 0015) is not a problem. */
export function checkSensitiveActions(state) {
  const problems = []
  const t = SENSITIVE_ACTIONS_TABLE
  if (!state.rls[t]) return problems
  if (!state.rls[t].enabled || !state.rls[t].forced) problems.push(`${t}: row level security must be enabled and forced`)
  const spec = SENSITIVE_ACTIONS_SPEC
  const cols = Object.fromEntries(state.sensitive.columns.map((c) => [c.name, c.type]))
  for (const [name, type] of Object.entries(cols)) {
    if (!(name in spec.columns)) problems.push(`${t}: unexpected column "${name}" (the counter table holds no customer, document or other data)`)
    else if (spec.columns[name] !== type) problems.push(`${t}: column "${name}" is ${type}, expected ${spec.columns[name]}`)
  }
  for (const name of Object.keys(spec.columns)) if (!(name in cols)) problems.push(`${t}: column "${name}" is missing`)
  const privileges = [...new Set(state.sensitive.privileges)].sort()
  const extra = privileges.filter((p) => !spec.appPrivileges.includes(p))
  if (extra.length) problems.push(`${t}: ${APP_ROLE} must not have ${extra.join(', ')} (only SELECT and INSERT)`)
  const missing = spec.appPrivileges.filter((p) => !privileges.includes(p))
  if (missing.length) problems.push(`${t}: ${APP_ROLE} lacks ${missing.join(', ')}`)
  for (const p of state.sensitive.policies) {
    if (spec.policies[p.cmd] !== p.name) problems.push(`${t}: unexpected policy "${p.name}" for ${p.cmd} (only the reviewed SELECT and INSERT policies)`)
  }
  for (const [cmd, name] of Object.entries(spec.policies)) {
    if (!state.sensitive.policies.some((p) => p.cmd === cmd && p.name === name)) problems.push(`${t}: policy "${name}" (${cmd}) is missing`)
  }
  return problems
}

/** Problems of the database as it is now: unknown tables without RLS, RLS not forced, the counter table spec. */
export function checkCurrentState(state) {
  const problems = []
  for (const [t, r] of Object.entries(state.rls)) {
    if (!r.enabled && !KNOWN_GLOBAL_TABLES.includes(t)) problems.push(`table without RLS: ${t} (not one of the known global tables)`)
    if (r.enabled && !r.forced) problems.push(`RLS not forced on ${t}`)
  }
  return [...problems, ...checkSensitiveActions(state)]
}

/** Problems introduced by a migration: weakened RLS, new tables without RLS, plus the current-state checks. */
export function checkMigration(before, after) {
  const problems = []
  for (const [t, r] of Object.entries(before.rls)) {
    if (r.enabled && !(after.rls[t]?.enabled && after.rls[t]?.forced === r.forced)) problems.push(`RLS weakened on ${t}`)
  }
  const added = Object.keys(after.rls).filter((t) => !(t in before.rls) && !after.rls[t].enabled)
  for (const t of added) problems.push(`new table without RLS: ${t}`)
  // The same table is not reported twice.
  const current = checkCurrentState(after).filter((p) => !added.some((t) => p === `table without RLS: ${t} (not one of the known global tables)`))
  return [...problems, ...current]
}

/** Applied migrations compared with the project's journal. */
export function checkMigrationCount(applied, journalLength) {
  if (applied > journalLength) return [`the database has ${applied} migrations, the project ${journalLength} (wrong branch?)`]
  if (applied < journalLength) return [`${journalLength - applied} migration(s) pending (${applied} applied, ${journalLength} in the project)`]
  return []
}

/**
 * Row counts before and after a migration. Keys are "<table>" for tables without RLS and "<company> / <table>" for
 * company tables. A table that gains RLS moves from the first form to the second: its old total is then compared with the
 * sum over all companies, so a row that no company can see any more is reported as lost.
 */
export function checkRowCounts(before, after) {
  const problems = []
  for (const [k, n] of Object.entries(before)) {
    let m = after[k]
    if (m === undefined && !k.includes(' / ')) {
      const parts = Object.entries(after).filter(([a]) => a.endsWith(` / ${k}`))
      if (parts.length) m = parts.reduce((s, [, v]) => s + v, 0)
    }
    if (m === undefined) problems.push(`table disappeared: ${k}`)
    else if (m < n) problems.push(`rows lost: ${k} ${n} → ${m}`)
  }
  return problems
}
