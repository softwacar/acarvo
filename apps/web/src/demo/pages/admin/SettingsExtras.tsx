import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { cancellationFee } from '../../core/calc/policy'
import { fmt, parseAmount, toInput } from '../../core/money'
import { ALWAYS_VISIBLE, NAV_V1, PROFILES, type Profile, profileLinks } from '../../core/modules'
import { saveSettings, setWorkspace } from '../../core/ops/control'
import { PRODUCTION_PREREQUISITES, READY_LABEL, type ReadyState, readinessChecks } from '../../core/readiness'
import { L, loc } from '../../i18n'
import { SelectF, TextF } from '../../ui/forms'
import { runAction, useDb } from '../../ui/hooks'
import { btnPrimary, Notice, Panel, Pill } from '../../ui/kit'
import { IntegrityChecks } from '../analytics/RevenuePage'
import { ContractTemplatesPanel } from '../records/ContractsPage'
import { IndependencePanel } from '../shared/Independence'

// Settings sections that came out of the V1 product structure: the working profile (menu visibility only) and the
// contract templates (moved out of the old Contracts link). Rules, readiness and the cancellation policy follow.

const PROFILE_TEXT: Record<Profile, { tr: string; en: string; descTr: string; descEn: string }> = {
  simple: { tr: 'Sade', en: 'Simple', descTr: 'Küçük işletme: günlük işi yürüten temel ekranlar. Kasa, onay ve işlem geçmişi menüden çıkar ama Finans, İşlerim ve kullanıcı menüsünden erişilir.', descEn: 'Small business: the basic screens for the daily work. Cash, approvals and the audit trail leave the menu but stay reachable from Finance, My Work and the user menu.' },
  standard: { tr: 'Standart', en: 'Standard', descTr: 'Orta işletme: kurumsal hesaplar, şube kasaları, onay merkezi ve şubeler de menüde. İşlem geçmişi kullanıcı menüsünde.', descEn: 'Medium business: corporate accounts, branch cash, the approval center and branches are in the menu too. The audit trail is in the user menu.' },
  advanced: { tr: 'Gelişmiş', en: 'Advanced', descTr: 'Büyük işletme: 21 bağlantının tamamı menüde.', descEn: 'Large business: all 21 links are in the menu.' },
}

export function WorkspaceSection({ edit }: { edit: boolean }) {
  const d = useDb()
  const ws = d.settings.workspace
  const branches = d.branches.filter((b) => b.active).length
  const [profile, setProfile] = useState<Profile>(ws.profile)
  const effective = (p: Profile, hidden: string[], shown: string[]) => new Set(profileLinks({ profile: p, hidden, shown }, { activeBranches: branches }))
  const [on, setOn] = useState<Set<string>>(() => effective(ws.profile, ws.hidden, ws.shown))
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pick = (p: Profile) => {
    setProfile(p)
    setOn(effective(p, [], []))
  }
  const save = () => {
    const base = effective(profile, [], [])
    const hidden = NAV_V1.filter((n) => base.has(n.slug) && !on.has(n.slug)).map((n) => n.slug)
    const shown = NAV_V1.filter((n) => !base.has(n.slug) && on.has(n.slug)).map((n) => n.slug)
    const r = runAction((s) => setWorkspace(s, { profile, hidden, shown }), L('Çalışma profili kaydedildi; yalnız menü görünürlüğü değişti.', 'Working profile saved; only menu visibility changed.'))
    setErr(r.ok ? null : r.error)
    setMsg(r.ok ? L(`Menü şimdi ${effective(profile, hidden, shown).size} bağlantı gösteriyor.`, `The menu now shows ${effective(profile, hidden, shown).size} links.`) : null)
  }
  return (
    <Panel title={L('Çalışma profili ve menü', 'Working profile and menu')} description={L('Profil yalnız menüde nelerin görüneceğini belirler. Yetkileri, finansal güvenliği ve verileri değiştirmez; gizlenen bir ekran silinmez ve kullanıcı menüsünden açılır.', 'The profile only decides what the menu shows. It does not change permissions, financial safeguards or data; a hidden screen is not deleted and opens from the user menu.')}>
      <div className="space-y-5">
        <fieldset disabled={!edit} className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium">{L('Profil', 'Profile')}</legend>
          {PROFILES.map((p) => (
            <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${profile === p ? 'border-blue bg-blue-soft' : 'border-line bg-surface'}`}>
              <input type="radio" name="ws-profile" value={p} checked={profile === p} onChange={() => pick(p)} className="mt-1 size-4 accent-[var(--ac-blue)]" />
              <span>
                <span className="block text-[14px] font-medium">{L(PROFILE_TEXT[p].tr, PROFILE_TEXT[p].en)} <span className="tnum text-[12.5px] font-normal text-ink-2">· {effective(p, [], []).size} {L('bağlantı', 'links')}</span></span>
                <span className="block text-[12.5px] text-ink-2">{L(PROFILE_TEXT[p].descTr, PROFILE_TEXT[p].descEn)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset disabled={!edit}>
          <legend className="mb-1.5 text-[13px] font-medium">{L('Tek tek menü bağlantıları', 'Menu links one by one')}</legend>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {NAV_V1.map((n) => {
              const locked = ALWAYS_VISIBLE.has(n.slug)
              return (
                <li key={n.slug || 'home'}>
                  <label className="flex items-center gap-2.5 py-1 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={on.has(n.slug)}
                      disabled={locked || !edit}
                      onChange={(e) => setOn((cur) => { const next = new Set(cur); if (e.target.checked) next.add(n.slug); else next.delete(n.slug); return next })}
                      aria-label={`${L('Menüde göster', 'Show in menu')}: ${L(n.tr, n.en)}`}
                      className="size-4 accent-[var(--ac-blue)]"
                    />
                    <span className="flex-1">{L(n.tr, n.en)}</span>
                    <span className="text-[11.5px] text-ink-3">{locked ? L('her zaman görünür', 'always visible') : n.tier === 'basic' ? L('Temel', 'Basic') : L('Gelişmiş', 'Advanced')}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-2">{L('Görevler her profilde görünür; günlük işi kilitleyecek bağlantılar gizlenemez. Tek şubeli işletmede Şubeler bağlantısı otomatik gizlenir.', 'Tasks is visible in every profile; links that would lock the daily work cannot be hidden. In a single-branch business the Branches link is hidden automatically.')}</p>
        </fieldset>
        {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        {edit && (
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} onClick={save}>{L('Kaydet', 'Save')}</button>
          </div>
        )}
      </div>
    </Panel>
  )
}

export function ContractSection() {
  return (
    <Panel title={L('Sözleşme şablonları', 'Contract templates')} description={L('V1: ACARVO sözleşmeyi hazırlar (şablon, taslak, PDF, sürüm); gerekirse imza dış süreçte alınır. Doğrulanmamış bir e-imza veya ülke uygunluğu iddiası yoktur.', 'V1: ACARVO drafts the contract (template, draft, PDF, version); where needed the signature is taken in an external process. There is no unverified e-signature or country-compliance claim.')}>
      <ContractTemplatesPanel />
    </Panel>
  )
}

// ---------------------------------------------------------------- operational readiness

const READY_TONE: Record<ReadyState, 'ok' | 'alert' | 'muted' | 'hold' | 'blue'> = { ok: 'ok', missing: 'alert', operator: 'muted', legal: 'hold', info: 'blue' }

export function ReadinessSection() {
  const d = useDb()
  const checks = readinessChecks(d)
  const count = (s: ReadyState) => checks.filter((c) => c.state === s).length
  return (
    <div className="space-y-5">
      <Panel
        title={L('Operasyonel hazırlık', 'Operational readiness')}
        description={L('Gerçek bir şirketin çalışmaya başlamadan önce neyin hazır, neyin eksik, neyin sistem yöneticisi veya hukuk işi olduğu. Demoda sunucu/operatör adımları ve hukuki inceleme tamamlanmış gibi gösterilmez.', 'What is ready, missing, a system-administrator task or a legal task before a real company starts. In the demo, server/operator steps and legal review are never shown as done.')}
        action={<Link to={'/kurulum' as never} className="text-[13px] font-medium text-blue hover:underline">{L('Kurulum sihirbazı', 'Setup wizard')}</Link>}
      >
        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" data-testid="readiness-summary">
          <span><span className="font-semibold text-ok">{count('ok')}</span> {L('hazır', 'ready')}</span>
          <span><span className="font-semibold text-alert">{count('missing')}</span> {L('eksik', 'missing')}</span>
          <span><span className="font-semibold">{count('operator')}</span> {L('sistem yöneticisi işlemi', 'system administrator tasks')}</span>
          <span><span className="font-semibold text-hold">{count('legal')}</span> {L('hukuki inceleme', 'legal review')}</span>
        </p>
        <ul className="divide-y divide-line-soft" aria-label={L('Hazırlık kontrolleri', 'Readiness checks')}>
          {checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]" data-testid={'ready-' + c.key}>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{loc(c.label)}</span>
                <span className="block text-[12.5px] text-ink-2">{loc(c.detail)}</span>
              </span>
              <span className="flex items-center gap-2">
                {c.state === 'missing' && c.fixTo && <Link to={c.fixTo as never} className="text-[13px] font-medium text-blue hover:underline">{L('Düzelt', 'Fix')}</Link>}
                <Pill tone={READY_TONE[c.state]}>{L(READY_LABEL[c.state].tr, READY_LABEL[c.state].en)}</Pill>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <IndependencePanel />
      <IntegrityChecks />
      <Panel title={L('Üretim öncesi hukuki ve operasyonel hazırlık', 'Legal and operational readiness before production')} description={L('ACARVO hukuki uygunluk iddiasında bulunmaz. Aşağıdaki her madde ayrı bir uzman değerlendirmesi ister; bu demoda hiçbiri çözülmüş sayılmaz.', 'ACARVO makes no legal-compliance claim. Each item below needs a separate expert review; none is treated as solved in this demo.')}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-2">
          {PRODUCTION_PREREQUISITES.map((p) => <li key={p.key}>{L(p.tr, p.en)}</li>)}
        </ol>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- cancellation / advance policy

const KIND_TEXT = () => [{ id: 'percent_of_total', label: L('Toplamın yüzdesi', 'Percent of the total') }, { id: 'first_day', label: L('Bir günlük bedel', 'One day of the rental') }, { id: 'fixed', label: L('Sabit tutar', 'Fixed amount') }]

type RuleDraft = { kind: 'percent_of_total' | 'first_day' | 'fixed'; value: string; fixed: Record<string, string> }

export function CancellationSection({ edit }: { edit: boolean }) {
  const d = useDb()
  const p = d.settings.cancellation
  const curs = d.settings.acceptedCurrencies
  const draftOf = (r: typeof p.lateFee): RuleDraft => ({ kind: r.kind, value: String(r.value), fixed: Object.fromEntries(curs.map((c) => [c, r.fixed[c] !== undefined ? toInput(r.fixed[c]!, c) : ''])) })
  const [free, setFree] = useState(String(p.freeHoursBefore))
  const [late, setLate] = useState<RuleDraft>(draftOf(p.lateFee))
  const [noShow, setNoShow] = useState<RuleDraft>(draftOf(p.noShowFee))
  const [err, setErr] = useState<string | null>(null)
  const [simHours, setSimHours] = useState('24')
  const [simTotal, setSimTotal] = useState('600')
  const [simAdv, setSimAdv] = useState('200')
  const cur = d.settings.company.baseCurrency
  const build = (r: RuleDraft) => {
    const fixed: Record<string, number> = {}
    for (const c of curs) {
      const v = (r.fixed[c] ?? '').trim()
      if (v === '') continue
      const m = parseAmount(v, c)
      if (m === null || m < 0) throw new Error(c + ': ' + L('geçerli bir tutar girin', 'enter a valid amount'))
      fixed[c] = m
    }
    const value = Number(r.value)
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(L('Yüzde 0–100 arasında olmalı', 'The percentage must be between 0 and 100'))
    return { kind: r.kind, value, fixed }
  }
  const save = () => {
    try {
      const hours = Number(free)
      if (!Number.isFinite(hours) || hours < 0 || hours > 720) throw new Error(L('Ücretsiz iptal süresi 0–720 saat olmalı', 'The free-cancellation period must be 0–720 hours'))
      const lateFee = build(late)
      const noShowFee = build(noShow)
      const r = runAction((s) => saveSettings(s, 'İptal ve kaparo politikası', (db) => { db.settings.cancellation = { freeHoursBefore: hours, lateFee, noShowFee } }), L('Politika kaydedildi; yalnız sonraki iptallere uygulanır. Personel bedeli değiştiremez.', 'Policy saved; it applies only to later cancellations. Staff cannot change the fee.'))
      setErr(r.ok ? null : r.error)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const total = parseAmount(simTotal, cur) ?? 0
  const adv = parseAmount(simAdv, cur) ?? 0
  const fee = cancellationFee(d, { currency: cur, pickupAt: new Date(Date.parse(d.clock.now) + Number(simHours) * 3_600_000).toISOString(), price: { grossMinor: total, days: 3 } }, d.clock.now, 'cancel')
  const kept = Math.min(fee.feeMinor, adv)
  const refundable = Math.max(0, adv - kept)
  const receivable = Math.max(0, fee.feeMinor - adv)
  const ruleEditor = (id: string, title: string, r: RuleDraft, set: (x: RuleDraft) => void) => (
    <fieldset disabled={!edit} className="space-y-3 rounded-lg border border-line p-4">
      <legend className="px-1 text-[13.5px] font-medium">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id={id + '-k'} label={L('Hesaplama', 'Calculation')} value={r.kind} onChange={(v) => set({ ...r, kind: v as RuleDraft['kind'] })} options={KIND_TEXT()} />
        {r.kind === 'percent_of_total' && <TextF id={id + '-v'} label={L('Yüzde (%)', 'Percent (%)')} value={r.value} onChange={(v) => set({ ...r, value: v })} />}
      </div>
      {r.kind === 'fixed' && (
        <div className="grid gap-3 sm:grid-cols-3">{curs.map((c) => <TextF key={c} id={id + '-f-' + c} label={L('Sabit', 'Fixed') + ' ' + c} value={r.fixed[c] ?? ''} onChange={(v) => set({ ...r, fixed: { ...r.fixed, [c]: v } })} />)}</div>
      )}
    </fieldset>
  )
  return (
    <Panel title={L('İptal ve kaparo politikası', 'Cancellation and advance policy')} description={L('Şirket politikasını önceden tanımlar. İptal veya gelmemede bedel sistem tarafından otomatik hesaplanır; personel tutarı elle değiştiremez. Standart bedel yeni bir onay gerektirmez; sapma, feragat ve gerçek para iadesi yetki ve onaya tabidir.', 'The company defines the policy in advance. On a cancellation or no-show the fee is computed by the system; staff cannot type another amount. The standard fee needs no new approval; deviations, waivers and real refunds need permission and approval.')}>
      <div className="space-y-4">
        <fieldset disabled={!edit}>
          <TextF id="cp-free" label={L('Ücretsiz iptal: teslimden en az kaç saat önce', 'Free cancellation: at least how many hours before pickup')} value={free} onChange={setFree} />
        </fieldset>
        {ruleEditor('cp-late', L('Geç iptal bedeli (ücretsiz süre içinde)', 'Late-cancellation fee (inside the free period)'), late, setLate)}
        {ruleEditor('cp-ns', L('Gelmeme (no-show) bedeli', 'No-show fee'), noShow, setNoShow)}
        <div className="space-y-2 rounded-lg bg-ground/70 p-4" aria-label={L('Örnek hesap', 'Worked example')}>
          <p className="text-[13px] font-medium">{L('Örnek hesap (kaydetmeden önce deneyin)', 'Worked example (try it before saving)')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextF id="sim-h" label={L('İptal, teslime kaç saat kala', 'Cancelled how many hours before pickup')} value={simHours} onChange={setSimHours} />
            <TextF id="sim-t" label={L('Rezervasyon toplamı', 'Reservation total') + ' (' + cur + ')'} value={simTotal} onChange={setSimTotal} />
            <TextF id="sim-a" label={L('Alınan kaparo', 'Advance taken') + ' (' + cur + ')'} value={simAdv} onChange={setSimAdv} />
          </div>
          <p className="text-[13.5px]" data-testid="policy-sim">
            {L('Politika bedeli', 'Policy fee')} <span className="tnum font-semibold">{fmt(kept, cur)}</span> · {L('iade edilebilir', 'refundable')} <span className="tnum font-semibold">{fmt(refundable, cur)}</span>{receivable > 0 && <> · {L('müşteri alacağı', 'customer receivable')} <span className="tnum font-semibold">{fmt(receivable, cur)}</span></>}
            <span className="block text-[12.5px] text-ink-2">{fee.rule}</span>
          </p>
        </div>
        {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}
        {edit && <div className="flex justify-end"><button type="button" className={btnPrimary} onClick={save}>{L('Kaydet', 'Save')}</button></div>}
      </div>
    </Panel>
  )
}
