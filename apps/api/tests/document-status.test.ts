import { addDays, type DocumentForStatus, documentStatus, documentTypeSummary, type DocumentTypeRule, todayIn, vehicleDocumentsOverview } from '@acarvo/shared'
import { describe, expect, it } from 'vitest'

// Pure status rules (docs §8.4.3). No database involved.
const T = '2026-10-10'
const rule = (over: Partial<DocumentTypeRule> = {}): DocumentTypeRule => ({ code: 'inspection', name: 'Muayene', requiresExpiry: true, required: false, warnDays: 30, ...over })
let n = 0
const doc = (over: Partial<DocumentForStatus> = {}): DocumentForStatus => ({ id: `d${++n}`, recordState: 'active', validFrom: null, validUntil: null, fileCount: 1, ...over })

describe('single document status', () => {
  it('voided and draft never count as valid', () => {
    expect(documentStatus(doc({ recordState: 'voided', validUntil: addDays(T, 100) }), rule(), T).status).toBe('voided')
    const d = documentStatus(doc({ recordState: 'draft' }), rule(), T)
    expect(d).toMatchObject({ status: 'draft', draftReason: 'missing_expiry' })
    expect(documentStatus(doc({ recordState: 'draft', validUntil: addDays(T, 5) }), rule(), T).draftReason).toBeNull()
  })

  it('not started, expired, expiring, critical and valid; the end date is inclusive', () => {
    expect(documentStatus(doc({ validFrom: addDays(T, 3), validUntil: addDays(T, 400) }), rule(), T)).toMatchObject({ status: 'not_started', startsInDays: 3 })
    expect(documentStatus(doc({ validUntil: addDays(T, -1) }), rule(), T)).toMatchObject({ status: 'expired', daysLeft: -1, critical: true })
    expect(documentStatus(doc({ validUntil: T }), rule(), T)).toMatchObject({ status: 'expiring', daysLeft: 0, critical: true })
    expect(documentStatus(doc({ validUntil: addDays(T, 7) }), rule(), T)).toMatchObject({ status: 'expiring', critical: true })
    expect(documentStatus(doc({ validUntil: addDays(T, 8) }), rule(), T)).toMatchObject({ status: 'expiring', critical: false })
    expect(documentStatus(doc({ validUntil: addDays(T, 30) }), rule(), T).status).toBe('expiring')
    expect(documentStatus(doc({ validUntil: addDays(T, 31) }), rule(), T)).toMatchObject({ status: 'valid', daysLeft: 31 })
    expect(documentStatus(doc({ validUntil: addDays(T, 31) }), rule({ warnDays: 45 }), T).status).toBe('expiring')
    expect(documentStatus(doc(), rule({ code: 'registration', requiresExpiry: false }), T).status).toBe('valid')
  })

  it('a missing file is a separate warning that does not change the status', () => {
    expect(documentStatus(doc({ validUntil: addDays(T, 200), fileCount: 0 }), rule(), T)).toMatchObject({ status: 'valid', noFile: true })
  })

  it('today follows the company time zone', () => {
    const late = new Date('2026-10-09T22:30:00Z')
    expect(todayIn('Europe/Sarajevo', late)).toBe('2026-10-10')
    expect(todayIn('UTC', late)).toBe('2026-10-09')
  })
})

describe('type summary (one row per type)', () => {
  it('nothing recorded: missing if required, otherwise neutral', () => {
    expect(documentTypeSummary(rule({ required: true }), [], T)).toMatchObject({ state: 'missing', level: 'critical', uncoveredRequired: true })
    expect(documentTypeSummary(rule(), [], T)).toMatchObject({ state: 'none', level: 'neutral', uncoveredRequired: false })
  })

  it('a future renewal does not replace the period that covers today', () => {
    const current = doc({ validFrom: addDays(T, -355), validUntil: addDays(T, 10) })
    const next = doc({ validFrom: addDays(T, 11), validUntil: addDays(T, 376) })
    const s = documentTypeSummary(rule({ required: true }), [current, next], T)
    expect(s).toMatchObject({ state: 'renewed', level: 'ok', currentId: current.id, nextId: next.id, nextStartsOn: addDays(T, 11), daysLeft: 10 })
  })

  it('a gap before the next period keeps the warning and reports the gap', () => {
    const current = doc({ validUntil: addDays(T, 10) })
    const next = doc({ validFrom: addDays(T, 20), validUntil: addDays(T, 385) })
    expect(documentTypeSummary(rule(), [current, next], T)).toMatchObject({ state: 'expiring', level: 'warning', gapDays: 9 })
  })

  it('only a future period: not started, and uncovered today when required', () => {
    const next = doc({ validFrom: addDays(T, 5), validUntil: addDays(T, 370) })
    expect(documentTypeSummary(rule({ required: true }), [next], T)).toMatchObject({ state: 'not_started', level: 'critical', uncoveredRequired: true, shownId: next.id })
    expect(documentTypeSummary(rule(), [next], T)).toMatchObject({ state: 'not_started', level: 'neutral' })
  })

  it('expired, draft-only and voided-only rows', () => {
    const old = doc({ validUntil: addDays(T, -3) })
    expect(documentTypeSummary(rule({ required: true }), [old], T)).toMatchObject({ state: 'expired', level: 'critical', uncoveredRequired: true, daysLeft: -3 })
    expect(documentTypeSummary(rule({ required: true }), [doc({ recordState: 'draft' })], T)).toMatchObject({ state: 'draft', level: 'critical', uncoveredRequired: true })
    expect(documentTypeSummary(rule(), [doc({ recordState: 'voided', validUntil: addDays(T, 300) })], T)).toMatchObject({ state: 'none' })
  })

  it('when periods overlap, the one ending last is current', () => {
    const a = doc({ validFrom: addDays(T, -100), validUntil: addDays(T, 20) })
    const b = doc({ validFrom: addDays(T, -5), validUntil: addDays(T, 360) })
    expect(documentTypeSummary(rule(), [a, b], T)).toMatchObject({ state: 'valid', currentId: b.id })
  })

  it('vehicle overview puts the most urgent row first', () => {
    const rows = [
      documentTypeSummary(rule({ code: 'inspection' }), [doc({ validUntil: addDays(T, 12) })], T),
      documentTypeSummary(rule({ code: 'liability_insurance' }), [doc({ validUntil: addDays(T, -1) })], T),
      documentTypeSummary(rule({ code: 'registration', requiresExpiry: false }), [doc()], T),
      documentTypeSummary(rule({ code: 'other', requiresExpiry: false }), [], T),
    ]
    const o = vehicleDocumentsOverview(rows)
    expect(o).toMatchObject({ critical: 1, warning: 1, ok: 1 })
    expect(o.headline?.code).toBe('liability_insurance')
  })
})
