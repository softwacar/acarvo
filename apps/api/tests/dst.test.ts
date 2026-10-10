import { randomUUID } from 'node:crypto'
import { utcToWallTime, type VehicleHistory } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Daylight saving changes in the company zone (Europe/Sarajevo), enforced by the API (docs §9.1):
// a wall time that never happened is refused; a wall time that happened twice needs an explicit choice.
// 2025: clocks went forward on 30 March (02:00 → 03:00) and back on 26 October (03:00 → 02:00).

let data: DevData
let app: FastifyInstance
let adnan: Client
let vehicleId: string
const ORIGINAL_TZ = process.env.TZ

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  vehicleId = ((await adnan.get('/api/vehicles?q=J58-O-142')).json().items as { id: string }[])[0]!.id
  // Test database only: registered early enough for the 2025 changes to be valid back-dated entries.
  await asOwner(data.companies.drina, `update vehicles set created_at = '2025-01-01T00:00:00Z' where id = $1`, [vehicleId])
})
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

const history = async () => (await adnan.get(`/api/vehicles/${vehicleId}/history`)).json() as VehicleHistory
async function km(body: Record<string, unknown>) {
  const h = await history()
  return adnan.post(`/api/vehicles/${vehicleId}/odometer`, { expectedVersion: h.odometerVersion, clientRequestId: randomUUID(), ...body })
}
async function place(body: Record<string, unknown>) {
  const h = await history()
  return adnan.post(`/api/vehicles/${vehicleId}/location`, {
    locationType: 'service_provider',
    description: 'Gece servisi',
    reason: 'Saat geçişi testi',
    expectedVersion: h.locationVersion,
    clientRequestId: randomUUID(),
    ...body,
  })
}

describe('odometer readings around daylight saving changes', () => {
  it('a time that never happened is refused with a field error, even with a choice, and nothing is written', async () => {
    const before = (await history()).odometer.length
    for (const extra of [{}, { ambiguousTime: 'earlier' }, { ambiguousTime: 'later' }]) {
      const res = await km({ km: 5_000, occurredAtLocal: '2025-03-30T02:30', note: 'Geç giriş', ...extra })
      expect(res.statusCode).toBe(422)
      expect(res.json().error).toMatchObject({ code: 'NONEXISTENT_TIME', fields: { occurredAt: expect.stringContaining('yaşanmadı') } })
    }
    expect((await history()).odometer).toHaveLength(before)
  })

  it('a doubled time without a choice is refused and offers two different instants', async () => {
    const before = (await history()).odometer.length
    const res = await km({ km: 5_000, occurredAtLocal: '2025-10-26T02:30', note: 'Geç giriş' })
    expect(res.statusCode).toBe(422)
    const err = res.json().error
    expect(err.code).toBe('AMBIGUOUS_TIME')
    expect(err.fields.ambiguousTime).toBeTruthy()
    expect(err.details.options).toEqual([
      { choice: 'earlier', iso: '2025-10-26T00:30:00.000Z', offset: 'UTC+2' },
      { choice: 'later', iso: '2025-10-26T01:30:00.000Z', offset: 'UTC+1' },
    ])
    expect((await history()).odometer).toHaveLength(before)
  })

  it('the explicit choice stores the right UTC instant; the two choices differ by an hour (server in New York)', async () => {
    process.env.TZ = 'America/New_York'
    const first = await km({ km: 5_000, occurredAtLocal: '2025-10-26T02:30', ambiguousTime: 'earlier', note: 'Servis fişinden' })
    expect(first.statusCode).toBe(201)
    const second = await km({ km: 5_010, occurredAtLocal: '2025-10-26T02:30', ambiguousTime: 'later', note: 'Servis fişinden' })
    expect(second.statusCode).toBe(201)
    const h = second.json().history as VehicleHistory
    const a = h.odometer.find((o) => o.id === first.json().id)!
    const b = h.odometer.find((o) => o.id === second.json().id)!
    expect(a.occurredAt).toBe('2025-10-26T00:30:00.000Z')
    expect(b.occurredAt).toBe('2025-10-26T01:30:00.000Z')
    expect(Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).toBe(3_600_000)
    // Chronology still applies between the two: the later 02:30 cannot be lower than the earlier one.
    const lower = await km({ km: 4_990, occurredAtLocal: '2025-10-26T02:45', ambiguousTime: 'later', note: 'Servis fişinden' })
    expect(lower.statusCode).toBe(422)
    expect(lower.json().error.code).toBe('ODOMETER_OUT_OF_ORDER')
    // The audit keeps what was typed and chosen.
    const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'vehicle.odometer.record' and entity_id = $1 order by created_at`, [vehicleId])
    expect(log.rows.map((r) => r.summary.ambiguousTime)).toEqual(['earlier', 'later'])
  })

  it('the 48-hour rule uses the resolved instant: an old doubled time still needs a note', async () => {
    const res = await km({ km: 5_020, occurredAtLocal: '2025-10-26T02:50', ambiguousTime: 'later' })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('NOTE_REQUIRED')
  })

  it('normal times through occurredAtLocal behave as before; exactly one time field is required', async () => {
    const wall = utcToWallTime(Date.now() - 2 * 3_600_000, 'Europe/Sarajevo')
    const ok = await km({ km: 9_900, occurredAtLocal: wall })
    expect(ok.statusCode).toBe(201)
    const entry = ok.json().history.odometer.find((o: { id: string }) => o.id === ok.json().id)
    expect(utcToWallTime(entry.occurredAt, 'Europe/Sarajevo')).toBe(wall)
    expect(entry.late).toBe(false)
    expect((await km({ km: 9_950, occurredAtLocal: wall, occurredAt: new Date().toISOString() })).statusCode).toBe(400)
    expect((await km({ km: 9_950 })).statusCode).toBe(400)
    expect((await km({ km: 9_950, occurredAtLocal: '2026-02-30T10:00' })).statusCode).toBe(400)
    // An explicit instant (with Z or an offset) is still accepted as before.
    expect((await km({ km: 9_960, occurredAt: new Date(Date.now() - 60_000).toISOString() })).statusCode).toBe(201)
  })
})

describe('location records around daylight saving changes (server in Tokyo)', () => {
  it('never-happened times are refused, doubled times need a choice, the choice is stored exactly', async () => {
    process.env.TZ = 'Asia/Tokyo'
    const before = (await history()).locations.length
    const gap = await place({ occurredAtLocal: '2025-03-30T02:15' })
    expect(gap.statusCode).toBe(422)
    expect(gap.json().error.code).toBe('NONEXISTENT_TIME')
    const ask = await place({ occurredAtLocal: '2025-10-26T02:15' })
    expect(ask.statusCode).toBe(422)
    expect(ask.json().error.code).toBe('AMBIGUOUS_TIME')
    expect((await history()).locations).toHaveLength(before)
    const chosen = await place({ occurredAtLocal: '2025-10-26T02:15', ambiguousTime: 'later' })
    expect(chosen.statusCode).toBe(201)
    expect(chosen.json().becameCurrent).toBe(false)
    const e = (chosen.json().history as VehicleHistory).locations.find((l) => l.id === chosen.json().id)!
    expect(e.occurredAt).toBe('2025-10-26T01:15:00.000Z')
  })
})
