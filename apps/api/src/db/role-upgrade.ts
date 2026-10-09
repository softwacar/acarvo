import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as s from './schema'
import { ROLE_PRESET_HISTORY, ROLE_PRESETS } from '../modules/auth/roles'

type OwnerDb = NodePgDatabase<typeof s>

const key = (perms: readonly string[]) => [...new Set(perms)].sort().join(',')

export interface RoleUpgradeResult {
  company: string
  role: string
  added: string[]
}

/**
 * Brings unmodified preset roles of existing companies up to the current preset. Idempotent:
 * a role already on the current preset, a custom role, or an edited preset is left as it is.
 * Only permissions are added; users, memberships and other roles are not touched.
 * Runs as the owner after migrations; each change is written to the company's audit log.
 */
export async function upgradePresetRoles(db: OwnerDb): Promise<RoleUpgradeResult[]> {
  const results: RoleUpgradeResult[] = []
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  for (const company of companies) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      const roles = (await tx.execute(sql`select id, name, permissions from roles for update`)).rows as { id: string; name: string; permissions: string[] }[]
      for (const role of roles) {
        const current = ROLE_PRESETS[role.name]
        if (!current || key(role.permissions) === key(current)) continue
        const matchesEarlier = ROLE_PRESET_HISTORY.some((h) => h.presets[role.name] && key(h.presets[role.name]!) === key(role.permissions))
        if (!matchesEarlier) continue
        const added = current.filter((p) => !role.permissions.includes(p))
        // Append only; nothing is removed even if a later preset drops a permission.
        await tx.execute(sql`update roles set permissions = permissions || array[${sql.join(added.map((p) => sql`${p}`), sql`, `)}]::text[] where id = ${role.id}`)
        await tx.execute(sql`insert into audit_log (company_id, actor_user_id, action, entity, entity_id, summary)
          values (${company.id}, null, 'role.preset_upgrade', 'role', ${role.id}, ${JSON.stringify({ role: role.name, added })}::jsonb)`)
        results.push({ company: company.name, role: role.name, added })
      }
    })
  }
  return results
}
