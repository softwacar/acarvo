import { describe, expect, it } from 'vitest'
import { DemoError } from '../core/helpers'
import { acceptInviteDemo, cancelInvite, completePasswordResetDemo, INVITE_DAYS, inviteState, inviteUser, presetUpgradeAvailable, publishPresetVersion, requestPasswordReset, resendInvite, saveRole, upgradeRolePreset } from '../core/ops/control'
import { closeSession, openSession } from '../core/ops/finance'
import { readinessChecks } from '../core/readiness'
import { buildSeed } from '../core/seed'
import { applyDraft, draftOf, finishSetup, initialDraft, restartSetup, saveSetupDraft, SETUP_STEPS, stepErrors } from '../core/setup'
import type { Db } from '../core/types'

// Administration (decision document J, K-11, K-12, L.8): invitations, password reset records, role preset versions that never overwrite a
// customized role, the first-run setup with a readiness check that does not pretend, and the critical cash variance.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => {
  d.session.userId = id
}
const err = (fn: () => unknown): DemoError | null => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DemoError) return e
    throw e
  }
  return null
}
const day = 86_400_000

describe('invitations and password reset (records only)', () => {
  it('an invitation is a pending record with an expiry; nothing is sent and no account exists', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const n = d.users.length
    inviteUser(d, { name: 'Nova Osoba', email: 'nova.osoba@example.invalid', roleId: 'role-accountant', branchIds: ['b-sjj'], title: 'Muhasebe' })
    const u = d.users.at(-1)!
    expect(d.users.length).toBe(n + 1)
    expect(u.status).toBe('invited')
    expect(inviteState(u, d.clock.now)).toBe('pending')
    expect(Date.parse(u.invite!.expiresAt) - Date.parse(u.invite!.createdAt)).toBe(INVITE_DAYS * day)
    expect(u.branchIds).toEqual(['b-sjj'])
  })
  it('role and branch scope must exist; the e-mail must be new; only people who manage users can invite', () => {
    const d = mkDb()
    as(d, 'u-owner')
    expect(err(() => inviteUser(d, { name: 'X Y Z', email: 'x@y.invalid', roleId: 'role-yok', branchIds: [], title: '' }))?.fields.role).toBeTruthy()
    expect(err(() => inviteUser(d, { name: 'X Y Z', email: 'x@y.invalid', roleId: 'role-ops', branchIds: ['b-yok'], title: '' }))?.fields.branches).toBeTruthy()
    expect(err(() => inviteUser(d, { name: 'Selma K', email: d.users[0]!.email, roleId: 'role-ops', branchIds: [], title: '' }))?.fields.email).toBeTruthy()
    as(d, 'u-mgr')
    expect(err(() => inviteUser(d, { name: 'X Y Z', email: 'x@y.invalid', roleId: 'role-ops', branchIds: [], title: '' }))?.code).toBe('FORBIDDEN')
  })
  it('an unaccepted invitation expires with the demo clock; it can be renewed, cancelled or accepted (simulation)', () => {
    const d = mkDb()
    as(d, 'u-owner')
    inviteUser(d, { name: 'Nova Osoba', email: 'nova.osoba@example.invalid', roleId: 'role-ops', branchIds: [], title: '' })
    const u = d.users.at(-1)!
    d.clock.now = new Date(Date.parse(d.clock.now) + (INVITE_DAYS + 1) * day).toISOString()
    expect(inviteState(u, d.clock.now)).toBe('expired')
    expect(err(() => acceptInviteDemo(d, u.id))?.message).toMatch(/süresi|expired/)
    resendInvite(d, u.id)
    expect(inviteState(u, d.clock.now)).toBe('pending')
    acceptInviteDemo(d, u.id)
    expect(u.status).toBe('active')
    expect(inviteState(u, d.clock.now)).toBe('accepted')
    // cancelling a pending invitation deactivates the placeholder
    inviteUser(d, { name: 'Iko Osoba', email: 'iko.osoba@example.invalid', roleId: 'role-ops', branchIds: [], title: '' })
    const v = d.users.at(-1)!
    cancelInvite(d, v.id)
    expect(inviteState(v, d.clock.now)).toBe('cancelled')
    expect(v.status).toBe('inactive')
  })
  it('a password reset is requested only for an active user and leaves a record, never a token or a password', () => {
    const d = mkDb()
    as(d, 'u-owner')
    expect(err(() => requestPasswordReset(d, 'u-new'))).not.toBeNull() // invited, not active
    requestPasswordReset(d, 'u-ops1')
    const u = d.users.find((x) => x.id === 'u-ops1')!
    expect(u.resetRequest).toBeTruthy()
    expect(JSON.stringify(u)).not.toMatch(/token|password|parola/i)
    completePasswordResetDemo(d, 'u-ops1')
    expect(u.resetRequest).toBeUndefined()
    expect(d.events.some((e) => e.type === 'PasswordResetCompletedDemo')).toBe(true)
  })
})

describe('role presets never overwrite a customized role', () => {
  it('editing a ready role marks it customized; a new preset version reaches only roles nobody customized', () => {
    const d = mkDb()
    as(d, 'u-owner')
    expect(presetUpgradeAvailable(d, d.roles.find((r) => r.id === 'role-ops')!)).toBe(false)
    publishPresetVersion(d)
    expect(d.meta.presetVersion).toBe(3)
    const ops = d.roles.find((r) => r.id === 'role-ops')!
    const acc = d.roles.find((r) => r.id === 'role-accountant')!
    expect(presetUpgradeAvailable(d, ops)).toBe(true)
    // the accountant role was edited by hand: it is now customized
    saveRole(d, { id: acc.id, name: acc.name, description: acc.description, perms: [...acc.perms, 'audit:view'] })
    expect(acc.customized).toBe(true)
    const accBefore = JSON.stringify(acc.perms)
    expect(err(() => upgradeRolePreset(d, acc.id))?.code).toBe('CUSTOMIZED')
    expect(JSON.stringify(acc.perms)).toBe(accBefore) // unchanged
    // the untouched operations role takes the new preset
    expect(ops.perms).not.toContain('reports:view')
    upgradeRolePreset(d, ops.id)
    expect(ops.perms).toContain('reports:view')
    expect(ops.presetVersion).toBe(3)
    expect(ops.customized).toBe(false)
  })
  it('the Owner role is never upgraded or changed', () => {
    const d = mkDb()
    as(d, 'u-owner')
    publishPresetVersion(d)
    expect(presetUpgradeAvailable(d, d.roles.find((r) => r.id === 'role-owner')!)).toBe(false)
    expect(err(() => saveRole(d, { id: 'role-owner', name: 'Sahip', description: '', perms: [] }))).not.toBeNull()
  })
})

describe('first-run setup', () => {
  it('the demo company is set up; restarting the wizard keeps all data', () => {
    const d = mkDb()
    expect(d.settings.setup.done).toBe(true)
    as(d, 'u-owner')
    const vehicles = d.vehicles.length
    restartSetup(d)
    expect(d.settings.setup.done).toBe(false)
    expect(d.vehicles.length).toBe(vehicles)
  })
  it('each step checks its own fields and says what is wrong', () => {
    const d = mkDb()
    const draft = initialDraft(d)
    expect(Object.keys(stepErrors(d, draft, 'company'))).toEqual([])
    draft.company.name = ''
    draft.company.tz = 'Not/AZone'
    draft.company.country = 'B'
    expect(Object.keys(stepErrors(d, draft, 'company')).sort()).toEqual(['country', 'name', 'tz'])
    draft.branches[0]!.code = draft.branches[1]!.code
    expect(stepErrors(d, draft, 'branches')['b0.code']).toBeTruthy()
    draft.vehicle.skip = false
    expect(Object.keys(stepErrors(d, draft, 'vehicle')).length).toBeGreaterThan(2)
    draft.contract.legalAck = false
    expect(stepErrors(d, draft, 'contract').legalAck).toBeTruthy()
  })
  it('the typed draft is kept in the demo state, so a reload or a step back loses nothing', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const draft = initialDraft(d)
    draft.company.name = 'Yeni Rent d.o.o.'
    saveSetupDraft(d, 3, draft)
    expect(d.settings.setup.step).toBe(3)
    expect(draftOf(d).company.name).toBe('Yeni Rent d.o.o.')
  })
  it('finishing applies every step to the demo company: profile, branches, vehicle, invitations, base prices, policy', () => {
    const d = mkDb()
    as(d, 'u-owner')
    restartSetup(d)
    const draft = initialDraft(d)
    draft.company.name = 'Yeni Rent d.o.o.'
    draft.profile = 'simple'
    draft.branches.push({ id: 'b-new1', name: 'Tuzla Merkez', code: 'TZL', city: 'Tuzla', country: 'BA', tz: 'Europe/Sarajevo', active: true, isNew: true })
    draft.vehicle = { skip: false, plate: 'TZ 101-AA', make: 'Skoda', model: 'Fabia', year: '2024', classId: d.classes[0]!.id, branchId: 'b-new1', vin: '' }
    draft.invites = [{ name: 'Muhasebe Kisi', email: 'muhasebe.kisi@example.invalid', roleId: 'role-accountant', branchIds: [] }]
    draft.pricing.daily[d.classes[0]!.id] = '19,00'
    draft.contract.legalAck = true
    draft.policy = { advancePct: '25', freeHours: '72', lateFee: '60,00' }
    const vehicles = d.vehicles.length
    finishSetup(d, draft)
    expect(d.settings.setup.done).toBe(true)
    expect(d.settings.company.name).toBe('Yeni Rent d.o.o.')
    expect(d.settings.workspace.profile).toBe('simple')
    expect(d.branches.some((b) => b.id === 'b-new1')).toBe(true)
    expect(d.drawers.some((x) => x.branchId === 'b-new1')).toBe(true)
    expect(d.vehicles.length).toBe(vehicles + 1)
    expect(d.users.at(-1)!.email).toBe('muhasebe.kisi@example.invalid')
    expect(d.baseRates.find((r) => r.classId === d.classes[0]!.id && r.cur === 'EUR')!.dailyMinor).toBe(1900)
    expect(d.settings.payment.advanceRequiredPct).toBe(25)
    expect(d.settings.cancellation.freeHoursBefore).toBe(72)
    expect(d.settings.cancellation.lateFee.fixed.EUR).toBe(6000)
    expect(d.events.some((e) => e.type === 'SetupCompleted')).toBe(true)
  })
  it('an invalid step refuses the whole setup and names the step', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const draft = initialDraft(d)
    draft.pricing.daily[d.classes[0]!.id] = ''
    expect(err(() => applyDraft(d, draft))?.message).toContain('pricing')
    expect(SETUP_STEPS.length).toBe(9)
  })
})

describe('readiness does not pretend', () => {
  it('server / operator steps and the legal review are never "ready" in the demo', () => {
    const d = mkDb()
    const by = (k: string) => readinessChecks(d).find((c) => c.key === k)!
    expect(by('malware_scanner').state).toBe('operator')
    expect(by('customer_keys').state).toBe('operator')
    expect(by('contract_legal').state).toBe('legal')
  })
  it('one authorizer is reported as missing with the consequence; two are ready', () => {
    const d = mkDb()
    expect(readinessChecks(d).find((c) => c.key === 'four_eyes')!.state).toBe('ok')
    for (const u of d.users) if (!['u-owner', 'u-ops1'].includes(u.id)) u.status = 'inactive'
    const c = readinessChecks(d).find((x) => x.key === 'four_eyes')!
    expect(c.state).toBe('missing')
    expect(c.detail).toMatch(/kilitli|locked/)
  })
})

describe('cash: a critical variance needs somebody with approval authority', () => {
  it('the accountant counts and closes a small variance, but not a critical one; the owner can', () => {
    const d = mkDb()
    const dr = d.drawers.find((x) => x.currency === 'EUR' && x.status === 'closed') ?? d.drawers.find((x) => x.currency === 'EUR')!
    as(d, 'u-owner')
    if (dr.status === 'closed') openSession(d, dr.id, 10000)
    as(d, 'u-acc')
    const limit = d.settings.cash.varianceReason.EUR!
    const expected = 10000
    expect(err(() => closeSession(d, dr.id, expected + limit * 6, 'Kasa farkı büyük, sayım tekrarlandı'))?.code).toBe('CRITICAL_VARIANCE')
    as(d, 'u-owner')
    closeSession(d, dr.id, expected + limit * 6, 'Kasa farkı büyük, sayım tekrarlandı')
    expect(dr.status).toBe('closed')
  })
})
