// Performance measurement on acarvo_test only (not part of `npm test`).
// Run: npx tsx --env-file=../../.env tests/perf-measure.ts [vehicles=3000]
// Loads a large fleet into the test company "Drina", then times the main API reads and prints query plans.
// The next `npm test` run resets the test database anyway.
import { performance } from 'node:perf_hooks'
import { appPool, asOwner, Client, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

const N = Number(process.argv[2] ?? 3000)
const data = await resetDatabase()
const drina = data.companies.drina
const t0 = performance.now()
const branchIds = Object.values(data.drina.branches)
await asOwner(
  drina,
  `insert into vehicles (company_id, plate, plate_normalized, make, model, class_id, fuel_type, transmission, home_branch_id, created_at)
   select $1, 'P-' || lpad(n::text, 5, '0'), 'P' || lpad(n::text, 5, '0'), (array['Škoda','Toyota','Renault','Dacia','VW'])[1 + n % 5], 'Model ' || (n % 40),
     (select id from vehicle_classes order by name limit 1 offset (n % 3)), 'diesel', 'manual', ($2::uuid[])[1 + n % array_length($2::uuid[], 1)], now() - interval '200 days'
   from generate_series(1, $3) n`,
  [drina, branchIds, N],
)
// 10 readings per vehicle (initial + 9 manual), increasing over time; one location event each, 10% away from home.
await asOwner(
  drina,
  `insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, occurred_at)
   select $1, v.id, 10000 + k * 1500 + (abs(hashtext(v.id::text)) % 500), case when k = 0 then 'initial' else 'manual' end, case when k = 0 then 'vehicle_create' else 'manual' end,
     v.created_at + make_interval(days => k * 15)
   from vehicles v cross join generate_series(0, 9) k where v.plate like 'P-%' order by v.id, k`,
  [drina],
)
await asOwner(
  drina,
  `insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, event_type, source_type, occurred_at)
   select $1, v.id, 'branch', case when abs(hashtext(v.id::text)) % 10 = 0 then ($2::uuid[])[1] else v.home_branch_id end, 'initial', 'vehicle_create', v.created_at
   from vehicles v where v.plate like 'P-%'`,
  [drina, branchIds],
)
// Documents for half of the fleet: registration + inspection (some expiring soon, some expired).
await asOwner(
  drina,
  `insert into vehicle_documents (company_id, vehicle_id, type_code, record_state, valid_from, valid_until)
   select $1, v.id, t.code, 'active', current_date - 300, case when t.code = 'registration' then null else current_date + ((abs(hashtext(v.id::text)) % 120) - 20) end
   from vehicles v cross join (values ('registration'), ('inspection')) t(code)
   where v.plate like 'P-%' and abs(hashtext(v.id::text)) % 2 = 0`,
  [drina],
)
await asOwner(null, 'analyze')
const counts = (await asOwner(drina, `select (select count(*) from vehicles) v, (select count(*) from odometer_readings) r, (select count(*) from vehicle_documents) d`)).rows[0]
console.log(`Loaded in ${Math.round(performance.now() - t0)} ms:`, counts)

const app = await makeApp()
const adnan = new Client(app)
await adnan.login(EMAILS.adnan)
const selma = new Client(app)
await selma.login(EMAILS.selma)

async function time(label: string, c: Client, url: string, runs = 5) {
  await c.get(url) // warm
  const ms: number[] = []
  let res
  for (let i = 0; i < runs; i++) {
    const s = performance.now()
    res = await c.get(url)
    ms.push(performance.now() - s)
  }
  ms.sort((a, b) => a - b)
  const body = res!.json()
  console.log(`${label.padEnd(44)} median ${ms[Math.floor(runs / 2)]!.toFixed(1).padStart(7)} ms  status ${res!.statusCode}  ${body.total !== undefined ? `total ${body.total}` : ''}`)
}

const someId = ((await adnan.get('/api/vehicles?q=P-00010')).json().items as { id: string }[])[0]!.id
await time('list default (page 1, 25)', adnan, '/api/vehicles')
await time('list sorted by km desc', adnan, '/api/vehicles?sort=km&dir=desc')
await time('list search "toyota"', adnan, '/api/vehicles?q=toyota')
await time('list last page', adnan, `/api/vehicles?page=${Math.ceil(N / 25)}`)
await time('list documents=critical', adnan, '/api/vehicles?documents=critical')
await time('list documents=attention', adnan, '/api/vehicles?documents=attention')
await time('list location=away', adnan, '/api/vehicles?location=away')
await time('list (branch-limited user)', selma, '/api/vehicles')
await time('vehicle detail', adnan, `/api/vehicles/${someId}`)
await time('vehicle history', adnan, `/api/vehicles/${someId}/history`)
await time('vehicle documents', adnan, `/api/vehicles/${someId}/documents`)

const plan = await asOwner(
  drina,
  `explain (analyze, buffers, format text)
   select v.id, o.km, l.location_type from vehicles v
   left join lateral (select r.km from odometer_readings r where r.company_id = v.company_id and r.vehicle_id = v.id
     and not exists (select 1 from odometer_corrections oc where oc.company_id = r.company_id and oc.reading_id = r.id)
     order by r.occurred_at desc, r.created_at desc limit 1) o on true
   left join lateral (select e.location_type from vehicle_location_events e where e.company_id = v.company_id and e.vehicle_id = v.id
     and not exists (select 1 from vehicle_location_corrections lc where lc.company_id = e.company_id and lc.event_id = e.id)
     order by e.occurred_at desc, e.created_at desc limit 1) l on true
   order by o.km desc nulls last limit 25`,
)
console.log('\nPlan: list sorted by km')
for (const r of plan.rows) console.log('  ' + r['QUERY PLAN'])

await app.close()
await appPool.end()
await ownerPool.end()
