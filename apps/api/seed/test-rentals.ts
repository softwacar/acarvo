import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { todayIn, wallTimeInstant } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import sharp from 'sharp'
import type * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>
const TEST_DATABASE = 'acarvo_test'
const H = 3_600_000

interface InspectionPlan {
  km: number
  fuel: string
  marks?: { view: string; x: number; y: number; category: string; existing?: number }[]
  photos?: boolean
}

interface Plan {
  customer: string
  drivers: string[]
  plate: string
  pickup: string
  ret: string
  /** Planned times: [days from today, wall time] in the branch zone, or hours relative to now. */
  start: [number, string] | { hours: number }
  end: [number, string] | { hours: number }
  state: 'prepared' | 'delivered' | 'returned' | 'closed'
  delivered?: { hours: number } & InspectionPlan
  returned?: { hours: number; branch: string } & InspectionPlan
  documentCheck?: boolean
}

/**
 * Synthetic rentals for the TEST database only (Rentals V1): synthetic customers and fleet, times relative to now so
 * states stay meaningful. Each one goes through the same steps as the API (prepared, drivers, document decision,
 * handover inspection with 4 photos, odometer and location entries, return, close), so every database guard applies.
 * Photos are generated test images written to the given storage folder (never real photos).
 */
const PLANS: Record<string, Plan[]> = {
  Drina: [
    {
      customer: 'Emir Primjerović',
      drivers: ['Emir Primjerović'],
      plate: 'T75-E-410',
      pickup: 'SAC',
      ret: 'SAC',
      start: { hours: -26 },
      end: { hours: 46 },
      state: 'delivered',
      documentCheck: true,
      delivered: { hours: -25, km: 12500, fuel: 'full', photos: true, marks: [{ view: 'left', x: 420, y: 560, category: 'scratch' }] },
    },
    {
      customer: 'Tarik Testić',
      drivers: ['Tarik Testić'],
      plate: 'O21-M-985',
      pickup: 'SAC',
      ret: 'SAC',
      start: { hours: -98 },
      end: { hours: -5 },
      state: 'delivered',
      documentCheck: true,
      delivered: { hours: -97, km: 14350, fuel: 'three_quarters', photos: true },
    },
    { customer: 'Ajla Testović', drivers: ['Ajla Testović'], plate: 'K14-E-763', pickup: 'SJJ', ret: 'SJJ', start: [1, '10:00'], end: [4, '10:00'], state: 'prepared' },
    {
      customer: 'Kenan Örnek',
      drivers: ['Kenan Örnek'],
      plate: 'T48-K-276',
      pickup: 'MST',
      ret: 'MST',
      start: { hours: -241 },
      end: { hours: -145 },
      state: 'closed',
      documentCheck: true,
      delivered: { hours: -240, km: 126800, fuel: 'full', photos: true, marks: [{ view: 'front', x: 300, y: 400, category: 'scratch' }] },
      returned: { hours: -144, branch: 'MST', km: 127520, fuel: 'half', photos: true, marks: [{ view: 'front', x: 305, y: 405, category: 'scratch', existing: 0 }, { view: 'rear', x: 700, y: 520, category: 'dent' }] },
    },
    {
      customer: 'John Sample',
      drivers: ['John Sample'],
      plate: 'E92-K-301',
      pickup: 'SAC',
      ret: 'SAC',
      start: { hours: -73 },
      end: { hours: -3 },
      state: 'returned',
      documentCheck: true,
      delivered: { hours: -72, km: 33900, fuel: 'full', photos: true },
      returned: { hours: -2, branch: 'SAC', km: 34480, fuel: 'quarter' },
    },
  ],
  Neretva: [{ customer: 'Dino Neretvić', drivers: ['Dino Neretvić'], plate: 'J66-E-193', pickup: 'MOC', ret: 'MOC', start: [2, '09:00'], end: [3, '09:00'], state: 'prepared' }],
}

const COLORS = [
  [52, 92, 160],
  [120, 124, 130],
  [70, 120, 90],
  [150, 110, 70],
  [110, 80, 140],
]

async function testPhoto(i: number) {
  const [r, g, b] = COLORS[i % COLORS.length]!
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="rgb(${r},${g},${b})"/>
    <text x="60" y="420" font-size="64" font-family="sans-serif" fill="white">ACARVO TEST FOTOĞRAFI ${i + 1}</text></svg>`
  const base = sharp(Buffer.from(svg))
  return { main: await base.clone().webp({ quality: 70 }).toBuffer(), thumb: await base.clone().resize(480, 360, { fit: 'cover' }).webp({ quality: 60 }).toBuffer() }
}

export async function ensureTestRentals(db: OwnerDb, storageDir?: string) {
  const name = ((await db.execute(sql`select current_database() as name`)).rows[0] as { name: string }).name
  if (name !== TEST_DATABASE) throw new Error(`Synthetic rentals are only loaded into ${TEST_DATABASE}; this connection is in "${name}". Nothing was added.`)
  const companies = (await db.execute(sql`select id, name, timezone from companies order by name`)).rows as { id: string; name: string; timezone: string }[]
  for (const company of companies) {
    const plans = PLANS[company.name.split(' ')[0]!] ?? []
    if (!plans.length) continue
    const written: string[] = []
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      if (((await tx.execute(sql`select count(*)::int n from rentals`)).rows[0] as { n: number }).n > 0) return
      const one = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as Record<string, string> | undefined
      const customerId = async (n: string) => (await one(sql`select id from customers where display_name = ${n}`))!.id!
      const staff = (await one(sql`select m.user_id as id from memberships m join users u on u.id = m.user_id where m.company_id = ${company.id} order by u.email limit 1`))!.id!
      const today = todayIn(company.timezone)
      const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
      const at = (v: Plan['start'], tz: string) => (Array.isArray(v) ? wallTimeInstant(`${day(v[0])}T${v[1]}`, tz, 'earlier')! : new Date(Date.now() + v.hours * H).toISOString())
      const ago = (hours: number) => new Date(Date.now() + hours * H).toISOString()
      let n = 0
      for (const p of plans) {
        n++
        const rentalNo = `K-${String(n).padStart(6, '0')}`
        const pb = (await one(sql`select id, timezone, country from branches where code = ${p.pickup}`))!
        const rb = (await one(sql`select id, timezone from branches where code = ${p.ret}`))!
        const v = (await one(sql`select id, class_id from vehicles where plate = ${p.plate}`))!
        const customer = await customerId(p.customer)
        const k = (await one(sql`insert into rentals (company_id, rental_no, status, origin, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
            planned_pickup_at, planned_return_at, pickup_timezone, return_timezone, created_by, updated_by, created_at)
          values (${company.id}, ${rentalNo}, 'prepared', 'direct', ${customer}, ${v.class_id}, ${v.id}, ${pb.id}, ${rb.id}, ${at(p.start, pb.timezone!)}, ${at(p.end, rb.timezone!)},
            ${pb.timezone}, ${rb.timezone}, ${staff}, ${staff}, ${p.delivered ? ago(p.delivered.hours - 2) : new Date().toISOString()})
          returning id`))!
        const created = p.delivered ? ago(p.delivered.hours - 2) : new Date().toISOString()
        await tx.execute(sql`insert into rental_events (company_id, rental_id, kind, to_status, data, actor_user_id, at) values (${company.id}, ${k.id}, 'created', 'prepared', '{"origin":"direct"}'::jsonb, ${staff}, ${created})`)
        for (const [i, d] of p.drivers.entries()) {
          await tx.execute(sql`insert into rental_drivers (company_id, rental_id, customer_id, is_primary, created_by) values (${company.id}, ${k.id}, ${await customerId(d)}, ${i === 0}, ${staff})`)
        }
        if (p.documentCheck) {
          for (const [i, d] of p.drivers.entries()) {
            const residence = (await one(sql`select residence_country from customers where display_name = ${d}`))!.residence_country
            const residency = residence && residence !== pb.country ? 'foreign' : 'local'
            const policy = await one(sql`select id, version from document_requirement_policies where country = ${pb.country} and residency_class = ${residency} and status = 'active'`)
            await tx.execute(sql`insert into rental_document_checks (company_id, rental_id, customer_id, driver_role, residency_class, reference_country, rule_status, policy_id, policy_version, decision, note, checked_by, checked_at)
              values (${company.id}, ${k.id}, ${await customerId(d)}, ${i === 0 ? 'primary' : 'additional'}, ${residency}, ${pb.country}, ${policy ? 'policy_applied' : 'no_policy'},
                ${policy?.id ?? null}, ${policy ? Number(policy.version) : null}, 'eligible', 'Test verisi: personel kontrolü', ${staff}, ${created})`)
          }
        }
        const checklist = JSON.stringify({ keys: 'ok', registration: 'ok', spare_wheel: 'ok', warning_triangle: 'ok', first_aid_kit: 'ok', lights: 'ok', tyres: 'ok', windscreen: 'ok' })
        const photos = async (inspectionId: string, count: number) => {
          for (let i = 0; i < count; i++) {
            const fileId = randomUUID()
            const year = new Date().getUTCFullYear()
            const main = `rentals/${company.id}/${year}/${fileId}.webp`
            const thumb = `rentals/${company.id}/${year}/${fileId}-thumb.webp`
            const img = await testPhoto(i)
            if (storageDir) {
              await mkdir(path.join(storageDir, path.dirname(main)), { recursive: true })
              await writeFile(path.join(storageDir, main), img.main)
              await writeFile(path.join(storageDir, thumb), img.thumb)
              written.push(main, thumb)
            }
            await tx.execute(sql`insert into files (id, company_id, kind, storage_key, thumb_key, mime_type, size_bytes, width, height, sha256, uploaded_by)
              values (${fileId}, ${company.id}, 'rental_inspection_photo', ${main}, ${thumb}, 'image/webp', ${img.main.length}, 1200, 800, ${'0'.repeat(64)}, ${staff})`)
            await tx.execute(sql`insert into rental_inspection_photos (company_id, inspection_id, file_id, angle, created_by) values (${company.id}, ${inspectionId}, ${fileId}, ${['front', 'rear', 'left', 'right'][i]!}, ${staff})`)
          }
        }
        const handoverMarks: string[] = []
        if (p.delivered) {
          const d = p.delivered
          const when = ago(d.hours)
          const insp = (await one(sql`insert into rental_inspections (company_id, rental_id, vehicle_id, kind, km, fuel, cleanliness, condition, checklist, counterpart_customer_id, notes, created_by, updated_by)
              values (${company.id}, ${k.id}, ${v.id}, 'handover', ${d.km}, ${d.fuel}, 'clean', 'good', ${checklist}::jsonb, ${customer}, 'Test verisi', ${staff}, ${staff}) returning id`))!
          if (d.photos) await photos(insp.id!, 4)
          for (const m of d.marks ?? []) {
            const row = (await one(sql`insert into rental_damage_marks (company_id, inspection_id, view, x_permille, y_permille, category, note, created_by)
              values (${company.id}, ${insp.id}, ${m.view}, ${m.x}, ${m.y}, ${m.category}, 'Test verisi', ${staff}) returning id`))!
            handoverMarks.push(row.id!)
          }
          const reading = (await one(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, recorded_by)
              values (${company.id}, ${v.id}, ${d.km}, 'rental_handover', 'rental_handover', ${insp.id}, ${when}, ${staff}) returning id`))!
          const loc = (await one(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, description, event_type, source_type, source_id, occurred_at, recorded_by)
              values (${company.id}, ${v.id}, 'with_customer', ${rentalNo}, 'rental_handover', 'rental_handover', ${insp.id}, ${when}, ${staff}) returning id`))!
          await tx.execute(sql`update rental_inspections set state = 'final', occurred_at = ${when}, branch_id = ${pb.id}, performed_by = ${staff}, odometer_reading_id = ${reading.id},
              location_event_id = ${loc.id}, finalized_at = ${when}, finalized_by = ${staff}, version = 2 where id = ${insp.id}`)
          await tx.execute(sql`update rentals set status = 'delivered', delivered_at = ${when}, delivered_by = ${staff}, external_terms_ack_at = ${when}, external_terms_ack_by = ${staff}, version = 2 where id = ${k.id}`)
          await tx.execute(sql`insert into rental_events (company_id, rental_id, kind, from_status, to_status, data, actor_user_id, at)
            values (${company.id}, ${k.id}, 'delivered', 'prepared', 'delivered', ${JSON.stringify({ km: d.km, fuel: d.fuel, deliveredAt: when, photos: d.photos ? 4 : 0 })}::jsonb, ${staff}, ${when})`)
        }
        if (p.returned) {
          const r = p.returned
          const when = ago(r.hours)
          const back = (await one(sql`select id, timezone from branches where code = ${r.branch}`))!
          const insp = (await one(sql`insert into rental_inspections (company_id, rental_id, vehicle_id, kind, km, fuel, occurred_at, branch_id, performed_by, counterpart_customer_id, created_by, updated_by)
              values (${company.id}, ${k.id}, ${v.id}, 'return', ${r.km}, ${r.fuel}, ${when}, ${back.id}, ${staff}, ${customer}, ${staff}, ${staff}) returning id`))!
          const reading = (await one(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, recorded_by)
              values (${company.id}, ${v.id}, ${r.km}, 'rental_return', 'rental_return', ${insp.id}, ${when}, ${staff}) returning id`))!
          const loc = (await one(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, event_type, source_type, source_id, occurred_at, recorded_by)
              values (${company.id}, ${v.id}, 'branch', ${back.id}, ${rentalNo}, 'rental_return', 'rental_return', ${insp.id}, ${when}, ${staff}) returning id`))!
          await tx.execute(sql`update rental_inspections set odometer_reading_id = ${reading.id}, location_event_id = ${loc.id}, version = 2 where id = ${insp.id}`)
          await tx.execute(sql`update rentals set status = 'returned', returned_at = ${when}, returned_by = ${staff}, actual_return_branch_id = ${back.id}, actual_return_timezone = ${back.timezone}, version = 3 where id = ${k.id}`)
          await tx.execute(sql`insert into rental_events (company_id, rental_id, kind, from_status, to_status, data, actor_user_id, at)
            values (${company.id}, ${k.id}, 'returned', 'delivered', 'returned', ${JSON.stringify({ km: r.km, fuel: r.fuel, returnedAt: when, usedKm: r.km - (p.delivered?.km ?? r.km) })}::jsonb, ${staff}, ${when})`)
          if (p.state === 'closed') {
            await tx.execute(sql`update rental_inspections set cleanliness = 'acceptable', condition = 'minor_issues', checklist = ${checklist}::jsonb, notes = 'Test verisi', version = 3 where id = ${insp.id}`)
            if (r.photos) await photos(insp.id!, 4)
            let findings = 0
            for (const m of r.marks ?? []) {
              if (m.existing === undefined) findings++
              await tx.execute(sql`insert into rental_damage_marks (company_id, inspection_id, view, x_permille, y_permille, category, note, existing_mark_id, created_by)
                values (${company.id}, ${insp.id}, ${m.view}, ${m.x}, ${m.y}, ${m.category}, 'Test verisi', ${m.existing === undefined ? null : handoverMarks[m.existing]!}, ${staff})`)
            }
            const closed = ago(r.hours + 1)
            await tx.execute(sql`update rental_inspections set state = 'final', finalized_at = ${closed}, finalized_by = ${staff},
                findings_acknowledged_at = ${findings ? closed : null}, findings_acknowledged_by = ${findings ? staff : null}, version = 4 where id = ${insp.id}`)
            await tx.execute(sql`update rentals set status = 'closed', closed_at = ${closed}, closed_by = ${staff}, version = 4 where id = ${k.id}`)
            await tx.execute(sql`insert into rental_events (company_id, rental_id, kind, from_status, to_status, data, actor_user_id, at)
              values (${company.id}, ${k.id}, 'closed', 'returned', 'closed', ${JSON.stringify({ photos: 4, newFindings: findings })}::jsonb, ${staff}, ${closed})`)
          }
        }
      }
      await tx.execute(sql`insert into company_sequences (company_id, kind, next_value) values (${company.id}, 'rental', ${n + 1})
        on conflict (company_id, kind) do update set next_value = excluded.next_value`)
    })
  }
}
