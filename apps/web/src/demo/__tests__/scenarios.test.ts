import { describe, expect, it } from 'vitest'
import { rentalFinance } from '../core/calc/finance'
import { SCENARIOS } from '../core/scenarios'
import { buildSeed } from '../core/seed'

// The guided scenarios must be preparable on any day: the seed is anchored to "today", so the fleet is busy in a
// different pattern every day.

describe('demo scenarios can be prepared on any anchor date', () => {
  const days = Array.from({ length: 21 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i, 8, 0, 0)))
  for (const anchor of days) {
    it(`anchor ${anchor.toISOString().slice(0, 10)}: all eight prepare cleanly, scenario 5 owes exactly 500 EUR`, () => {
      const base = buildSeed(anchor)
      for (const s of SCENARIOS) {
        const d = structuredClone(base)
        const r = s.prepare(d)
        expect(r.path.startsWith('/'), s.id).toBe(true)
      }
      const d = structuredClone(base)
      const s5 = SCENARIOS.find((x) => x.id === 's5')!
      const { path } = s5.prepare(d)
      const id = /kiralamalar\/([^?]+)/.exec(path)![1]!
      const f = rentalFinance(d, id)
      expect(f.chargesMinor).toBe(50000)
      expect(f.appliedMinor).toBe(0)
      expect(f.outstandingMinor).toBe(50000)
      expect(d.fxRates.some((x) => (x.base === 'USD' || x.quote === 'USD') && x.purpose === 'tender' && !x.validUntil)).toBe(false)
    })
  }
})
