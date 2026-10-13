import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

let data: DevData
let app: FastifyInstance

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

const codes = (rows: { code: string }[]) => rows.map((r) => r.code).sort()

describe('runtime database role', () => {
  it('is not superuser, cannot bypass RLS and cannot create roles or databases', async () => {
    const { rows } = await appPool.query(
      `select current_user as name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user`,
    )
    expect(rows[0]).toEqual({ name: 'acarvo_app', rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false })
  })

  it('owns no table', async () => {
    const { rows } = await appPool.query(`select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`)
    expect(rows).toEqual([])
  })

  it('every table with company_id has RLS enabled and forced, with SELECT/INSERT/UPDATE/DELETE policies', async () => {
    const { rows } = await appPool.query(`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             coalesce((select array_agg(distinct p.cmd order by p.cmd) from pg_policies p
                       where p.schemaname = 'public' and p.tablename = c.relname), '{}') as cmds
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'company_id')
      order by 1`)
    expect(rows.map((r) => r.table)).toEqual([
      'audit_log',
      'branches',
      'company_document_type_settings',
      'company_rental_settings',
      'company_sequences',
      'contract_events',
      'contract_files',
      'contract_template_versions',
      'contract_templates',
      'contracts',
      'corporate_account_people',
      'corporate_accounts',
      'corporate_addresses',
      'corporate_contact_channels',
      'corporate_tax_ids',
      'customer_document_files',
      'customer_document_settings',
      'customer_documents',
      'customer_files',
      'customers',
      'document_files',
      'document_requirement_items',
      'document_requirement_policies',
      'files',
      'membership_branches',
      'membership_roles',
      'memberships',
      'odometer_corrections',
      'odometer_readings',
      'price_list_discounts',
      'price_list_extras',
      'price_list_rates',
      'price_list_revisions',
      'price_list_seasons',
      'price_lists',
      'price_quotes',
      'rental_damage_marks',
      'rental_document_checks',
      'rental_drivers',
      'rental_events',
      'rental_inspection_photos',
      'rental_inspections',
      'rentals',
      'reservation_drivers',
      'reservation_status_events',
      'reservations',
      'roles',
      'user_sensitive_actions',
      'vehicle_classes',
      'vehicle_document_files',
      'vehicle_documents',
      'vehicle_location_corrections',
      'vehicle_location_events',
      'vehicle_promo_photos',
      'vehicles',
    ])
    for (const r of rows) {
      // Rate-limit counters are append-only: no UPDATE or DELETE policy, so no one can reset them.
      const cmds = r.table === 'user_sensitive_actions' ? ['INSERT', 'SELECT'] : ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
      expect(r, r.table).toMatchObject({ enabled: true, forced: true, cmds })
    }
  })
})

describe('row-level isolation in the database', () => {
  it('sees nothing without a company context', async () => {
    const rows = await asApp(null, async (c) => (await c.query('select id from branches')).rows)
    expect(rows).toEqual([])
  })

  it('sees only the current company rows', async () => {
    const drina = await asApp(data.companies.drina, async (c) => (await c.query('select code from branches')).rows)
    const neretva = await asApp(data.companies.neretva, async (c) => (await c.query('select code from branches')).rows)
    expect(codes(drina)).toEqual(['MST', 'SAC', 'SJJ'])
    expect(codes(neretva)).toEqual(['MOC'])
  })

  it('cannot read another company row even by id', async () => {
    const rows = await asApp(data.companies.drina, async (c) => (await c.query('select id from branches where id = $1', [data.neretva.branches.MOC])).rows)
    expect(rows).toEqual([])
  })

  it('cannot insert a row for another company', async () => {
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into branches (company_id, name, code, timezone) values ($1, 'Sızma', 'XXX', 'Europe/Sarajevo')`, [data.companies.neretva]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('cannot update or delete another company row', async () => {
    const result = await asApp(data.companies.drina, async (c) => {
      const upd = await c.query(`update branches set name = 'Ele geçirildi' where id = $1`, [data.neretva.branches.MOC])
      const del = await c.query(`delete from branches where id = $1`, [data.neretva.branches.MOC])
      return { updated: upd.rowCount, deleted: del.rowCount }
    })
    expect(result).toEqual({ updated: 0, deleted: 0 })
    const { rows } = await asApp(data.companies.neretva, (c) => c.query('select name from branches where id = $1', [data.neretva.branches.MOC]))
    expect(rows[0].name).toBe('Mostar Centar')
  })

  it('cannot move its own row to another company', async () => {
    await expect(
      asApp(data.companies.drina, (c) => c.query(`update branches set company_id = $1 where id = $2`, [data.companies.neretva, data.drina.branches.SJJ])),
    ).rejects.toThrow(/row-level security/)
  })

  it('rejects links between rows of different companies (composite foreign keys)', async () => {
    const lejlaMembership = data.neretva.memberships[data.users.lejla.id]
    await expect(
      asApp(data.companies.neretva, (c) =>
        c.query(`insert into membership_branches (company_id, membership_id, branch_id) values ($1, $2, $3)`, [
          data.companies.neretva,
          lejlaMembership,
          data.drina.branches.SJJ,
        ]),
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('cannot alter the audit log or global tables', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query(`delete from audit_log`))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update audit_log set action = 'x'`))).rejects.toThrow(/permission denied/)
    await expect(
      asApp(null, (c) => c.query(`insert into companies (name, country, timezone, currency) values ('X', 'BA', 'UTC', 'EUR')`)),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('isolation through the API', () => {
  it('requires a session', async () => {
    const res = await new Client(app).get('/api/branches')
    expect(res.statusCode).toBe(401)
  })

  it('Neretva user sees only Neretva branches', async () => {
    const lejla = new Client(app)
    const login = await lejla.login(EMAILS.lejla)
    expect(login.statusCode).toBe(200)
    expect(login.json().company.name).toBe('Neretva Rent')
    expect(codes((await lejla.get('/api/branches')).json().items)).toEqual(['MOC'])
  })

  it('Neretva user cannot switch into Drina', async () => {
    const lejla = new Client(app)
    await lejla.login(EMAILS.lejla)
    const res = await lejla.post('/api/auth/switch-company', { companyId: data.companies.drina })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('NO_COMPANY_ACCESS')
    expect(codes((await lejla.get('/api/branches')).json().items)).toEqual(['MOC'])
  })

  it('a member of both companies sees each company only after switching', async () => {
    const adnan = new Client(app)
    const login = (await adnan.login(EMAILS.adnan)).json()
    expect(login.company.name).toBe('Drina Rent a Car')
    expect(login.memberships.map((m: { companyName: string }) => m.companyName)).toEqual(['Drina Rent a Car', 'Neretva Rent'])
    expect(codes((await adnan.get('/api/branches')).json().items)).toEqual(['MST', 'SAC', 'SJJ'])

    const switched = await adnan.post('/api/auth/switch-company', { companyId: data.companies.neretva })
    expect(switched.statusCode).toBe(200)
    expect(switched.json().company.roles).toEqual(['Yönetici'])
    expect(codes((await adnan.get('/api/branches')).json().items)).toEqual(['MOC'])
  })

  it('a branch-limited user sees only assigned branches and role permissions', async () => {
    const selma = new Client(app)
    const info = (await selma.login(EMAILS.selma)).json()
    expect(info.allBranches).toBe(false)
    expect(info.permissions).not.toContain('vehicles.create')
    expect(codes((await selma.get('/api/branches')).json().items)).toEqual(['SJJ'])
  })
})
