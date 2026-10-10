import { randomUUID } from 'node:crypto'
import {
  addDays,
  daysBetween,
  documentStatus,
  formatDateOnly,
  isDateOnly,
  isLateEntry,
  timeZoneOffsetMs,
  todayIn,
  utcToWallTime,
  wallTimeToUtc,
} from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { appPool, Client, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// The computer's own time zone must never change what is stored or shown (docs §9.1).
// Node honours process.env.TZ changes at runtime, so each scenario runs under several zones.
const ORIGINAL_TZ = process.env.TZ
const COMPUTER_ZONES = ['Europe/Berlin', 'Europe/Istanbul', 'America/New_York', 'Asia/Tokyo', 'UTC']
function underZone<T>(zone: string, fn: () => T): T {
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  }
}
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('wall-clock time in the company zone', () => {
  it('Sarajevo wall time maps to the same instant whatever the computer zone', () => {
    for (const zone of COMPUTER_ZONES) {
      underZone(zone, () => {
        expect(wallTimeToUtc('2026-10-08T14:30', 'Europe/Sarajevo')).toEqual({ iso: '2026-10-08T12:30:00.000Z', note: null })
        expect(wallTimeToUtc('2026-12-08T14:30', 'Europe/Sarajevo')).toEqual({ iso: '2026-12-08T13:30:00.000Z', note: null })
        expect(utcToWallTime('2026-10-08T12:30:00.000Z', 'Europe/Sarajevo')).toBe('2026-10-08T14:30')
      })
    }
  })

  it('a user in Germany or Turkey entering a Bosnian branch time gets the Bosnian instant', () => {
    // Berlin happens to share Sarajevo's offset; Istanbul is one hour ahead in winter and summer alike.
    underZone('Europe/Istanbul', () => {
      const entered = wallTimeToUtc('2026-10-08T09:00', 'Europe/Sarajevo')!
      expect(entered.iso).toBe('2026-10-08T07:00:00.000Z')
      expect(utcToWallTime(entered.iso, 'Europe/Istanbul')).toBe('2026-10-08T10:00')
    })
  })

  it('spring forward: a missing time is moved past the jump and flagged', () => {
    const r = wallTimeToUtc('2026-03-29T02:30', 'Europe/Sarajevo')!
    expect(r.note).toBe('gap')
    expect(utcToWallTime(r.iso, 'Europe/Sarajevo')).toBe('2026-03-29T03:30')
    expect(wallTimeToUtc('2026-03-29T03:30', 'Europe/Sarajevo')).toEqual({ iso: '2026-03-29T01:30:00.000Z', note: null })
  })

  it('fall back: a doubled time takes its first occurrence and is flagged', () => {
    const r = wallTimeToUtc('2026-10-25T02:30', 'Europe/Sarajevo')!
    expect(r).toEqual({ iso: '2026-10-25T00:30:00.000Z', note: 'ambiguous' })
    expect(wallTimeToUtc('2026-10-25T03:30', 'Europe/Sarajevo')).toEqual({ iso: '2026-10-25T02:30:00.000Z', note: null })
  })

  it('offsets follow daylight saving; zones without it stay constant', () => {
    expect(timeZoneOffsetMs(Date.parse('2026-07-01T00:00:00Z'), 'Europe/Sarajevo')).toBe(2 * 3_600_000)
    expect(timeZoneOffsetMs(Date.parse('2026-01-01T00:00:00Z'), 'Europe/Sarajevo')).toBe(3_600_000)
    expect(timeZoneOffsetMs(Date.parse('2026-07-01T00:00:00Z'), 'Asia/Tokyo')).toBe(9 * 3_600_000)
    expect(timeZoneOffsetMs(Date.parse('2026-07-01T00:00:00Z'), 'America/New_York')).toBe(-4 * 3_600_000)
  })

  it('rejects malformed wall times', () => {
    expect(wallTimeToUtc('2026-02-30T10:00', 'Europe/Sarajevo')).toBeNull()
    expect(wallTimeToUtc('2026-10-08 10:00', 'Europe/Sarajevo')).toBeNull()
    expect(wallTimeToUtc('2026-10-08T24:00', 'Europe/Sarajevo')).toBeNull()
  })
})

describe('calendar dates are never shifted', () => {
  it('a document date stays the same day in every computer zone', () => {
    for (const zone of COMPUTER_ZONES) {
      underZone(zone, () => {
        expect(isDateOnly('2026-10-22')).toBe(true)
        expect(isDateOnly('2026-10-22T00:00:00Z')).toBe(false)
        expect(formatDateOnly('2026-10-22')).toBe('22.10.2026')
        expect(daysBetween('2026-10-10', '2026-10-22')).toBe(12)
        // Across the October daylight saving change: still whole days.
        expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
        expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
        expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
      })
    }
  })

  it('"today" for document status is the company date, not the computer date', () => {
    // 23:30 UTC on 9 October is already 10 October in Sarajevo and still 9 October in New York.
    const late = new Date('2026-10-09T23:30:00Z')
    expect(todayIn('Europe/Sarajevo', late)).toBe('2026-10-10')
    expect(todayIn('America/New_York', late)).toBe('2026-10-09')
    const rule = { code: 'inspection', name: 'Muayene', requiresExpiry: true, required: true, warnDays: 30 } as const
    const doc = { id: 'x', typeCode: 'inspection', recordState: 'active', validFrom: null, validUntil: '2026-10-09', fileCount: 1 } as const
    underZone('America/New_York', () => {
      expect(documentStatus(doc, rule, todayIn('Europe/Sarajevo', late)).status).toBe('expired')
    })
  })
})

describe('48-hour late entry rule', () => {
  it('counts real elapsed hours, independent of zones and daylight saving', () => {
    for (const zone of COMPUTER_ZONES) {
      underZone(zone, () => {
        expect(isLateEntry('2026-10-08T12:00:00Z', '2026-10-10T11:59:00Z')).toBe(false)
        expect(isLateEntry('2026-10-08T12:00:00Z', '2026-10-10T12:01:00Z')).toBe(true)
        // Night of 25 October has 25 hours in Sarajevo; 48 real hours end at 23:00 local, not midnight.
        expect(isLateEntry('2026-10-24T22:00:00Z', '2026-10-26T21:59:00Z')).toBe(false)
        expect(isLateEntry('2026-10-24T22:00:00Z', '2026-10-26T22:01:00Z')).toBe(true)
      })
    }
  })
})

describe('API with a different server/computer zone', () => {
  let app: FastifyInstance
  let adnan: Client
  beforeAll(async () => {
    await resetDatabase()
    app = await makeApp()
    adnan = new Client(app)
    expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  })
  afterAll(async () => {
    await app.close()
    await appPool.end()
    await ownerPool.end()
  })
  const idOf = async (plate: string) => ((await adnan.get(`/api/vehicles?q=${plate}`)).json().items as { id: string }[])[0]!.id

  it('stores the instant as sent and messages use company time, even when the server runs in New York', async () => {
    process.env.TZ = 'America/New_York'
    const id = await idOf('A12-K-345')
    const h = (await adnan.get(`/api/vehicles/${id}/history`)).json()
    // Seed reading: 1 July 2026 08:00 UTC = 10:00 in Sarajevo.
    const low = await adnan.post(`/api/vehicles/${id}/odometer`, { km: 1, occurredAt: new Date(Date.now() - 3_600_000).toISOString(), expectedVersion: h.odometerVersion, clientRequestId: randomUUID() })
    expect(low.statusCode).toBe(422)
    expect(low.json().error.message).toContain('01.07.2026 10:00')
    // A Sarajevo wall time entered from an Istanbul computer, 47 hours ago: not late, no note needed.
    const wall = utcToWallTime(Date.now() - 47 * 3_600_000, 'Europe/Sarajevo')
    const at = wallTimeToUtc(wall, 'Europe/Sarajevo')!.iso
    const ok = await adnan.post(`/api/vehicles/${id}/odometer`, { km: 48_300, occurredAt: at, expectedVersion: h.odometerVersion, clientRequestId: randomUUID() })
    expect(ok.statusCode).toBe(201)
    const entry = ok.json().history.odometer.find((o: { id: string }) => o.id === ok.json().id)
    expect(entry.occurredAt).toBe(at)
    expect(entry.late).toBe(false)
    // 49 hours ago: late, so a note is required.
    const h2 = ok.json().history
    const lateAt = wallTimeToUtc(utcToWallTime(Date.now() - 49 * 3_600_000, 'Europe/Sarajevo'), 'Europe/Sarajevo')!.iso
    const noNote = await adnan.post(`/api/vehicles/${id}/odometer`, { km: 48_250, occurredAt: lateAt, expectedVersion: h2.odometerVersion, clientRequestId: randomUUID() })
    expect(noNote.statusCode).toBe(422)
    expect(noNote.json().error.code).toBe('NOTE_REQUIRED')
  })

  it('calendar dates of documents come back unchanged', async () => {
    process.env.TZ = 'Pacific/Honolulu'
    const id = await idOf('A12-K-345')
    const res = await adnan.post(`/api/vehicles/${id}/documents`, { typeCode: 'inspection', validFrom: '2026-01-01', validUntil: '2026-12-31', state: 'active' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ validFrom: '2026-01-01', validUntil: '2026-12-31' })
    const v = (await adnan.get(`/api/vehicles/${id}`)).json()
    expect(v.acquisitionDate).toBe('2023-03-14')
  })
})

describe('database timestamps to ISO 8601', () => {
  it('parses Date objects and PostgreSQL text with whole-hour and half-hour offsets', async () => {
    const { toIso, toIsoOrNull } = await import('../src/lib/timestamps')
    expect(toIso(new Date('2026-10-09T20:41:23.500Z'))).toBe('2026-10-09T20:41:23.500Z')
    expect(toIso('2026-10-09 22:41:23.5+02')).toBe('2026-10-09T20:41:23.500Z')
    expect(toIso('2026-10-09 22:41:23+05:30')).toBe('2026-10-09T17:11:23.000Z')
    expect(toIso('2026-01-09 08:00:00-05')).toBe('2026-01-09T13:00:00.000Z')
    expect(toIsoOrNull(null)).toBeNull()
  })
})
