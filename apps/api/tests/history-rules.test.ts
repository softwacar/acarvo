import { currentOf, isInFuture, isLateEntry, largeJump, odometerNeighbours, odometerOrderProblem } from '@acarvo/shared'
import { describe, expect, it } from 'vitest'

const r = (id: string, km: number, occurredAt: string, effective = true) => ({ id, km, occurredAt, effective })

describe('odometer rules (docs §8.5.1)', () => {
  const readings = [r('a', 1000, '2026-09-01T08:00:00Z'), r('b', 1500, '2026-09-10T08:00:00Z'), r('x', 9999, '2026-09-05T08:00:00Z', false), r('c', 2000, '2026-09-20T08:00:00Z')]

  it('finds the effective neighbours of a moment, ignoring corrected readings', () => {
    const n = odometerNeighbours(readings, '2026-09-06T00:00:00Z')
    expect(n.previous?.id).toBe('a')
    expect(n.next?.id).toBe('b')
    expect(odometerNeighbours(readings, '2026-09-10T08:00:00Z').previous?.id).toBe('b')
    expect(odometerNeighbours(readings, '2026-09-25T00:00:00Z')).toMatchObject({ previous: { id: 'c' }, next: null })
    expect(odometerNeighbours(readings, '2026-09-15T00:00:00Z', 'b').previous?.id).toBe('a')
  })

  it('a value must stay between the previous and the next reading', () => {
    const n = odometerNeighbours(readings, '2026-09-06T00:00:00Z')
    expect(odometerOrderProblem(1200, n)).toBeNull()
    expect(odometerOrderProblem(1000, n)).toBeNull()
    expect(odometerOrderProblem(1500, n)).toBeNull()
    expect(odometerOrderProblem(999, n)).toBe('below_previous')
    expect(odometerOrderProblem(1501, n)).toBe('above_next')
  })

  it('large jump: over 20.000 km at once or over 1.500 km per day (at least one day)', () => {
    const prev = { km: 10_000, occurredAt: '2026-09-01T08:00:00Z' }
    expect(largeJump(prev, 30_000, '2026-09-30T08:00:00Z')).toBeNull()
    expect(largeJump(prev, 30_001, '2026-12-30T08:00:00Z')).toMatchObject({ deltaKm: 20_001 })
    expect(largeJump(prev, 11_600, '2026-09-01T09:00:00Z')).toMatchObject({ deltaKm: 1_600, perDay: 1_600 })
    expect(largeJump(prev, 11_500, '2026-09-01T09:00:00Z')).toBeNull()
    expect(largeJump(prev, 14_000, '2026-09-03T08:00:00Z')).toMatchObject({ perDay: 2_000 })
    expect(largeJump(null, 500_000, '2026-09-03T08:00:00Z')).toBeNull()
    expect(largeJump(prev, 9_000, '2026-09-03T08:00:00Z')).toBeNull()
  })

  it('late entries are those recorded more than 48 hours after the event; the future is refused', () => {
    expect(isLateEntry('2026-10-01T08:00:00Z', '2026-10-03T08:00:00Z')).toBe(false)
    expect(isLateEntry('2026-10-01T08:00:00Z', '2026-10-03T08:00:01Z')).toBe(true)
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(isInFuture('2026-10-10T12:04:00Z', now)).toBe(false)
    expect(isInFuture('2026-10-10T12:06:00Z', now)).toBe(true)
  })

  it('the current value is the latest effective record by event time, then entry time', () => {
    const items = [
      { id: '1', effective: true, occurredAt: '2026-09-01T08:00:00.000Z', recordedAt: '2026-09-01T08:00:00.000Z' },
      { id: '2', effective: true, occurredAt: '2026-09-10T08:00:00.000Z', recordedAt: '2026-09-10T08:00:00.000Z' },
      { id: '3', effective: true, occurredAt: '2026-09-05T08:00:00.000Z', recordedAt: '2026-10-01T08:00:00.000Z' },
      { id: '4', effective: false, occurredAt: '2026-09-20T08:00:00.000Z', recordedAt: '2026-09-20T08:00:00.000Z' },
    ]
    expect(currentOf(items)?.id).toBe('2')
    expect(currentOf([...items, { id: '5', effective: true, occurredAt: '2026-09-10T08:00:00.000Z', recordedAt: '2026-09-11T08:00:00.000Z' }])?.id).toBe('5')
    expect(currentOf([])).toBeNull()
  })
})
