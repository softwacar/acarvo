import { todayIn, wallTimeInstant } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>
const TEST_DATABASE = 'acarvo_test'

interface Plan {
  customer: string
  account?: string
  booker?: string
  drivers?: string[]
  cls: string
  plate?: string
  pickup: string
  ret: string
  /** Days from today (company calendar) and wall time; negative hours relative to now for past pickups. */
  start: [number, string] | { hoursAgo: number }
  end: [number, string] | { hoursFromNow: number }
  status: 'pending' | 'confirmed' | 'cancelled'
  source: string
}

/**
 * Synthetic reservations for the TEST database only (Reservations V1): synthetic customers and fleet, times relative
 * to today so states stay meaningful. One confirmed reservation already passed its pickup (for the no-show flow).
 */
const PLANS: Record<string, Plan[]> = {
  Drina: [
    { customer: 'Ajla Testović', drivers: ['Ajla Testović'], cls: 'Orta', plate: 'A12-K-345', pickup: 'SJJ', ret: 'SJJ', start: [2, '10:00'], end: [5, '10:00'], status: 'confirmed', source: 'phone' },
    { customer: 'Emir Primjerović', cls: 'Kompakt', pickup: 'SAC', ret: 'MST', start: [3, '09:00'], end: [4, '18:00'], status: 'pending', source: 'direct_walk_in' },
    {
      customer: 'Lena Beispiel',
      account: 'Örnek Lojistik d.o.o.',
      booker: 'Ajla Testović',
      drivers: ['Lena Beispiel', 'Emir Primjerović'],
      cls: 'Kompakt',
      plate: 'E45-M-218',
      pickup: 'SJJ',
      ret: 'SJJ',
      start: [1, '08:30'],
      end: [8, '08:30'],
      status: 'confirmed',
      source: 'corporate',
    },
    { customer: 'Kenan Örnek', cls: 'Ekonomi', pickup: 'SJJ', ret: 'SJJ', start: [6, '12:00'], end: [9, '12:00'], status: 'cancelled', source: 'website' },
    { customer: 'Tarik Testić', drivers: ['Tarik Testić'], cls: 'Ekonomi', plate: 'K71-J-904', pickup: 'SAC', ret: 'SAC', start: { hoursAgo: 3 }, end: { hoursFromNow: 45 }, status: 'confirmed', source: 'returning_customer' },
  ],
  Neretva: [{ customer: 'Dino Neretvić', drivers: ['Dino Neretvić'], cls: 'SUV', plate: 'M21-O-650', pickup: 'MOC', ret: 'MOC', start: [2, '10:00'], end: [4, '10:00'], status: 'confirmed', source: 'phone' }],
}

export async function ensureTestReservations(db: OwnerDb) {
  const name = ((await db.execute(sql`select current_database() as name`)).rows[0] as { name: string }).name
  if (name !== TEST_DATABASE) throw new Error(`Synthetic reservations are only loaded into ${TEST_DATABASE}; this connection is in "${name}". Nothing was added.`)
  const companies = (await db.execute(sql`select id, name, timezone from companies order by name`)).rows as { id: string; name: string; timezone: string }[]
  for (const company of companies) {
    const plans = PLANS[company.name.split(' ')[0]!] ?? []
    if (!plans.length) continue
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      if (((await tx.execute(sql`select count(*)::int n from reservations`)).rows[0] as { n: number }).n > 0) return
      const one = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as Record<string, string> | undefined
      const customerId = async (n: string) => (await one(sql`select id from customers where display_name = ${n}`))!.id!
      const today = todayIn(company.timezone)
      const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
      let n = 0
      for (const p of plans) {
        n++
        const pb = (await one(sql`select id, timezone from branches where code = ${p.pickup}`))!
        const rb = (await one(sql`select id, timezone from branches where code = ${p.ret}`))!
        const at = (v: Plan['start'] | Plan['end'], tz: string) =>
          Array.isArray(v) ? wallTimeInstant(`${day(v[0])}T${v[1]}`, tz, 'earlier')! : new Date(Date.now() + ('hoursAgo' in v ? -v.hoursAgo : v.hoursFromNow) * 3_600_000).toISOString()
        const cls = (await one(sql`select id from vehicle_classes where name = ${p.cls}`))!.id!
        const vehicle = p.plate ? (await one(sql`select id from vehicles where plate = ${p.plate}`))!.id! : null
        const account = p.account ? (await one(sql`select id from corporate_accounts where legal_name = ${p.account}`))!.id! : null
        const row = (await one(sql`insert into reservations (company_id, reservation_no, status, source, customer_id, corporate_account_id, booker_customer_id, vehicle_class_id, vehicle_id,
            pickup_branch_id, return_branch_id, pickup_at, return_at, pickup_timezone, return_timezone, confirmed_at, cancel_reason, cancelled_at)
          values (${company.id}, ${`R-${String(n).padStart(6, '0')}`}, ${p.status === 'cancelled' ? 'pending' : p.status}, ${p.source}, ${await customerId(p.customer)}, ${account},
            ${p.booker ? await customerId(p.booker) : null}, ${cls}, ${vehicle}, ${pb.id}, ${rb.id}, ${at(p.start, pb.timezone!)}, ${at(p.end, rb.timezone!)}, ${pb.timezone}, ${rb.timezone},
            ${p.status === 'confirmed' ? new Date() : null}, null, null)
          returning id`))!
        await tx.execute(sql`insert into reservation_status_events (company_id, reservation_id, from_status, to_status) values (${company.id}, ${row.id}, null, ${p.status === 'cancelled' ? 'pending' : p.status})`)
        if (p.status === 'cancelled') {
          await tx.execute(sql`update reservations set status = 'cancelled', cancel_reason = 'customer_request', cancelled_at = now() where id = ${row.id}`)
          await tx.execute(sql`insert into reservation_status_events (company_id, reservation_id, from_status, to_status, reason) values (${company.id}, ${row.id}, 'pending', 'cancelled', 'customer_request')`)
        }
        for (const [i, d] of (p.drivers ?? []).entries()) {
          await tx.execute(sql`insert into reservation_drivers (company_id, reservation_id, customer_id, is_primary) values (${company.id}, ${row.id}, ${await customerId(d)}, ${i === 0})`)
        }
      }
      await tx.execute(sql`insert into company_sequences (company_id, kind, next_value) values (${company.id}, 'reservation', ${n + 1})`)
    })
  }
}
