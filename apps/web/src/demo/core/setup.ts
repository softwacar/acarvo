import { B } from '../i18n'
import { fail, logEvent, meOf, need, nowOf } from './helpers'
import { CURRENCIES, parseAmount, toInput } from './money'
import { PROFILES, type Profile } from './modules'
import { inviteUser, savePricing } from './ops/control'
import { createVehicle } from './ops/fleet'
import { readinessChecks, type ReadyCheck } from './readiness'
import type { Db, Id } from './types'

// First-run setup (decision document K-12 / L.8): nine steps that turn a new company into one that can work. This is a browser
// model of the screens: it never creates a real company, sends no invitation and changes no database. Server and operator steps
// (malware scanner, encryption key) and legal review are never marked done here.

export const SETUP_STEPS = ['company', 'branches', 'profile', 'vehicle', 'users', 'pricing', 'contract', 'policy', 'readiness'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export interface DraftBranch {
  id: Id
  name: string
  code: string
  city: string
  country: string
  tz: string
  active: boolean
  isNew?: boolean
}
export interface SetupDraft {
  company: { name: string; legalName: string; country: string; taxId: string; tz: string; baseCurrency: string }
  branches: DraftBranch[]
  profile: Profile
  vehicle: { skip: boolean; plate: string; make: string; model: string; year: string; classId: Id; branchId: Id; vin: string }
  invites: { name: string; email: string; roleId: Id; branchIds: Id[] }[]
  pricing: { daily: Record<Id, string> }
  contract: { lang: 'tr' | 'en' | 'bs'; legalAck: boolean }
  policy: { advancePct: string; freeHours: string; lateFee: string }
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function initialDraft(d: Db): SetupDraft {
  const s = d.settings
  const cur = s.company.baseCurrency
  return {
    company: { name: s.company.name, legalName: s.company.legalName, country: s.company.country, taxId: s.company.taxId, tz: s.company.tz, baseCurrency: cur },
    branches: d.branches.map((b) => ({ id: b.id, name: b.name, code: b.code, city: b.city, country: b.country, tz: b.tz, active: b.active })),
    profile: s.workspace.profile,
    vehicle: { skip: d.vehicles.length > 0, plate: '', make: '', model: '', year: String(new Date(d.clock.now).getUTCFullYear() - 1), classId: d.classes[0]?.id ?? '', branchId: d.branches[0]?.id ?? '', vin: '' },
    invites: [],
    pricing: { daily: Object.fromEntries(d.classes.map((c) => [c.id, d.baseRates.find((r) => r.classId === c.id && r.cur === cur) ? toInput(d.baseRates.find((r) => r.classId === c.id && r.cur === cur)!.dailyMinor, cur) : ''])) },
    contract: { lang: (s.contractLangs[0] as 'tr' | 'en' | 'bs') ?? 'tr', legalAck: false },
    policy: { advancePct: String(s.payment.advanceRequiredPct), freeHours: String(s.cancellation.freeHoursBefore), lateFee: toInput(s.cancellation.lateFee.fixed[cur] ?? 0, cur) },
  }
}
/** The saved draft (so nothing typed is lost between steps or a reload), or a fresh one from the current settings. */
export const draftOf = (d: Db): SetupDraft => (d.settings.setup.draft as SetupDraft | null) ?? initialDraft(d)

export function stepErrors(d: Db, draft: SetupDraft, step: SetupStep): Record<string, string> {
  const e: Record<string, string> = {}
  const need2 = (k: string, v: string, min: number, msg: string) => {
    if (v.trim().length < min) e[k] = msg
  }
  if (step === 'company') {
    need2('name', draft.company.name, 2, B('Ticari adı yazın', 'Enter the trade name'))
    if (!/^[A-Za-z]{2}$/.test(draft.company.country)) e.country = B('İki harfli ülke kodu (ISO) girin', 'Enter a two-letter country code (ISO)')
    if (!validTz(draft.company.tz)) e.tz = B('Geçerli bir saat dilimi girin (örn. Europe/Sarajevo)', 'Enter a valid time zone (e.g. Europe/Sarajevo)')
    if (!CURRENCIES.some((c) => c.code === draft.company.baseCurrency)) e.baseCurrency = B('Geçerli bir para birimi seçin', 'Choose a valid currency')
  }
  if (step === 'branches') {
    const active = draft.branches.filter((b) => b.active)
    if (active.length === 0) e.branches = B('En az bir etkin şube gerekir', 'At least one active branch is required')
    draft.branches.forEach((b, i) => {
      if (b.name.trim().length < 2) e[`b${i}.name`] = B('Şube adı gerekli', 'The branch name is required')
      if (!/^[A-Za-z]{2,4}$/.test(b.code)) e[`b${i}.code`] = B('2–4 harfli şube kodu', 'A 2–4 letter branch code')
      if (draft.branches.some((x, j) => j !== i && x.code.toUpperCase() === b.code.toUpperCase())) e[`b${i}.code`] = B('Şube kodu benzersiz olmalı', 'The branch code must be unique')
      if (!/^[A-Za-z]{2}$/.test(b.country)) e[`b${i}.country`] = B('İki harfli ülke kodu', 'A two-letter country code')
      if (!validTz(b.tz)) e[`b${i}.tz`] = B('Geçersiz saat dilimi', 'Invalid time zone')
    })
  }
  if (step === 'profile' && !PROFILES.includes(draft.profile)) e.profile = B('Bir çalışma profili seçin', 'Choose a working profile')
  if (step === 'vehicle' && !draft.vehicle.skip) {
    const v = draft.vehicle
    if (v.plate.trim().length < 4) e.plate = B('Geçerli bir plaka girin', 'Enter a valid plate')
    else if (d.vehicles.some((x) => x.plate === v.plate.trim().toUpperCase())) e.plate = B('Bu plaka zaten kayıtlı', 'This plate is already registered')
    if (!v.make.trim()) e.make = B('Marka gerekli', 'Make is required')
    if (!v.model.trim()) e.model = B('Model gerekli', 'Model is required')
    if (!(Number(v.year) >= 1990 && Number(v.year) <= 2100)) e.year = B('Geçerli bir yıl girin', 'Enter a valid year')
    if (!d.classes.some((c) => c.id === v.classId)) e.classId = B('Sınıf seçin', 'Choose a class')
    if (!draft.branches.some((b) => b.id === v.branchId)) e.branchId = B('Şube seçin', 'Choose a branch')
  }
  if (step === 'users') {
    draft.invites.forEach((u, i) => {
      if (u.name.trim().length < 3) e[`u${i}.name`] = B('Ad soyad girin', 'Enter a full name')
      if (!/^\S+@\S+\.\S+$/.test(u.email)) e[`u${i}.email`] = B('Geçerli bir e-posta girin', 'Enter a valid email')
      else if (d.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase()) || draft.invites.some((x, j) => j !== i && x.email.toLowerCase() === u.email.toLowerCase())) e[`u${i}.email`] = B('Bu e-posta zaten var', 'This email already exists')
      if (!d.roles.some((r) => r.id === u.roleId)) e[`u${i}.role`] = B('Rol seçin', 'Choose a role')
    })
  }
  if (step === 'pricing') {
    for (const c of d.classes) {
      const m = parseAmount(draft.pricing.daily[c.id] ?? '', draft.company.baseCurrency)
      if (m === null || m <= 0) e[`p.${c.id}`] = B('Günlük fiyatı girin', 'Enter the daily rate')
    }
  }
  if (step === 'contract' && !draft.contract.legalAck) e.legalAck = B('Hukuki incelemenin ayrıca yapılacağını onaylayın', 'Confirm that the legal review is done separately')
  if (step === 'policy') {
    const adv = Number(draft.policy.advancePct)
    if (!Number.isFinite(adv) || adv < 0 || adv > 100) e.advancePct = B('Kaparo yüzdesi 0–100 olmalı', 'The advance percentage must be 0–100')
    const free = Number(draft.policy.freeHours)
    if (!Number.isFinite(free) || free < 0 || free > 720) e.freeHours = B('Ücretsiz iptal süresi 0–720 saat', 'Free-cancellation period 0–720 hours')
    const fee = parseAmount(draft.policy.lateFee, draft.company.baseCurrency)
    if (fee === null || fee < 0) e.lateFee = B('Geçerli bir geç iptal bedeli girin', 'Enter a valid late-cancellation fee')
  }
  return e
}

/** Applies the whole draft to a database (call it on a copy for the readiness preview). Throws a readable error on the first invalid step. */
export function applyDraft(d: Db, draft: SetupDraft): void {
  for (const step of SETUP_STEPS) {
    const errs = stepErrors(d, draft, step)
    if (Object.keys(errs).length) fail(B(`Kurulum adımı eksik: ${step}.`, `Setup step incomplete: ${step}.`), errs)
  }
  const cur = draft.company.baseCurrency
  Object.assign(d.settings.company, { name: draft.company.name.trim(), legalName: draft.company.legalName.trim() || draft.company.name.trim(), country: draft.company.country.toUpperCase(), taxId: draft.company.taxId.trim(), tz: draft.company.tz, baseCurrency: cur })
  if (!d.settings.acceptedCurrencies.includes(cur)) d.settings.acceptedCurrencies.push(cur)
  for (const b of draft.branches) {
    const ex = d.branches.find((x) => x.id === b.id)
    if (ex) Object.assign(ex, { name: b.name.trim(), code: b.code.toUpperCase(), city: b.city.trim(), country: b.country.toUpperCase(), tz: b.tz, active: b.active })
    else {
      d.branches.push({ id: b.id, code: b.code.toUpperCase(), name: b.name.trim(), city: b.city.trim(), country: b.country.toUpperCase(), tz: b.tz, currency: cur, active: b.active, address: '', phone: '', classCapacity: {} })
      d.settings.branchTender[b.id] = [cur]
      d.drawers.push({ id: `dr-${b.code.toLowerCase()}-${cur}`, branchId: b.id, currency: cur, name: `${b.code.toUpperCase()} · ${cur}`, status: 'closed' })
    }
  }
  d.settings.workspace = { profile: draft.profile, hidden: [], shown: [] }
  if (!draft.vehicle.skip) {
    const v = draft.vehicle
    createVehicle(d, { plate: v.plate, make: v.make, model: v.model, year: Number(v.year), color: '', classId: v.classId, homeBranchId: v.branchId, odometerKm: 0, fuelType: 'petrol', vin: v.vin })
  }
  for (const u of draft.invites) inviteUser(d, { name: u.name, email: u.email, roleId: u.roleId, branchIds: u.branchIds, title: '' })
  savePricing(d, 'Kurulum sihirbazı: temel günlük fiyatlar', (db) => {
    for (const c of db.classes) {
      const minor = parseAmount(draft.pricing.daily[c.id] ?? '', cur)!
      const row = db.baseRates.find((r) => r.classId === c.id && r.cur === cur)
      if (row) row.dailyMinor = minor
      else db.baseRates.push({ id: `br-${c.id}-${cur}`, classId: c.id, cur, dailyMinor: minor })
    }
  })
  if (!d.settings.contractLangs.includes(draft.contract.lang)) d.settings.contractLangs.push(draft.contract.lang)
  d.settings.payment.advanceRequiredPct = Number(draft.policy.advancePct)
  d.settings.cancellation.freeHoursBefore = Number(draft.policy.freeHours)
  d.settings.cancellation.lateFee = { ...d.settings.cancellation.lateFee, kind: 'fixed', fixed: { ...d.settings.cancellation.lateFee.fixed, [cur]: parseAmount(draft.policy.lateFee, cur)! } }
}

/** Keeps the typed inputs so a reload, a back step or a language switch loses nothing. */
export function saveSetupDraft(d: Db, step: number, draft: SetupDraft): void {
  need(d, 'settings:view', B('Kurulum', 'Setup'))
  d.settings.setup.draft = draft as unknown as Record<string, unknown>
  d.settings.setup.step = step
}

export function finishSetup(d: Db, draft: SetupDraft): void {
  need(d, 'settings:manage', B('Kurulumu tamamlama', 'Finishing the setup'))
  const checks = readinessChecks(previewOf(d, draft))
  const missing = checks.filter((c) => c.state === 'missing')
  if (missing.length) fail(B(`Kurulum tamamlanamaz: ${missing.map((c) => c.label).join(', ')} eksik.`, `The setup cannot be finished: ${missing.map((c) => c.label).join(', ')} missing.`), {}, 'SETUP_INCOMPLETE')
  applyDraft(d, draft)
  d.settings.setup = { done: true, step: SETUP_STEPS.length - 1, completedAt: nowOf(d), draft: null }
  logEvent(d, { module: 'settings', type: 'SetupCompleted', sourceType: 'settings', sourceId: 'setup', summary: B(`Kurulum tamamlandı (${meOf(d).name}). Sunucu ve hukuk adımları ayrıca yapılır.`, `Setup finished (${meOf(d).name}). Server and legal steps are done separately.`) })
}

/** Starts the first-run experience again on the same data (the demo company stays; only the wizard state restarts). */
export function restartSetup(d: Db): void {
  need(d, 'settings:manage', B('Kurulumu yeniden başlatma', 'Restarting the setup'))
  d.settings.setup = { done: false, step: 0, draft: null }
}

/** The database as it would be after finishing, for the readiness preview. The real state is untouched. */
export function previewOf(d: Db, draft: SetupDraft): Db {
  const copy = structuredClone(d)
  try {
    applyDraft(copy, draft)
  } catch {
    // an incomplete draft previews as the current state; the step errors say what is missing
    return structuredClone(d)
  }
  return copy
}

/** Which wizard step fixes which readiness check. */
export const CHECK_STEP: Record<string, SetupStep> = {
  branch_countries: 'branches',
  branch_timezones: 'branches',
  document_rules: 'policy',
  price_lists: 'pricing',
  tax: 'pricing',
  contract_template: 'contract',
  rental_mode: 'contract',
  four_eyes: 'users',
  verifiers: 'users',
  cash_drawers: 'branches',
}

export type { ReadyCheck }
