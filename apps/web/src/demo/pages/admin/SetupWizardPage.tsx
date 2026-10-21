import { CheckCircle, Circle, Plus, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CURRENCIES } from '../../core/money'
import { PROFILES, profileLinks, type Profile } from '../../core/modules'
import { readinessChecks, READY_LABEL } from '../../core/readiness'
import { CHECK_STEP, draftOf, finishSetup, initialDraft, previewOf, restartSetup, saveSetupDraft, type SetupDraft, SETUP_STEPS, type SetupStep, stepErrors } from '../../core/setup'
import { getLang, L, loc, localize } from '../../i18n'
import { CheckF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Notice, Page, Panel, Pill } from '../../ui/kit'
import { DemoConcept } from '../../ui/gate'

// First-run setup wizard (decision document L.8): nine steps with back / next, inputs that are never lost, field checks, a readiness
// check that says what is missing and why, and a clear line between what the demo can show and what a server operator or a lawyer must do.

const STEP_LABEL: Record<SetupStep, () => string> = {
  company: () => L('Şirket', 'Company'),
  branches: () => L('Şubeler', 'Branches'),
  profile: () => L('Çalışma profili', 'Working profile'),
  vehicle: () => L('İlk araç', 'First vehicle'),
  users: () => L('Kullanıcılar ve roller', 'Users and roles'),
  pricing: () => L('Temel fiyatlar', 'Base prices'),
  contract: () => L('Sözleşme', 'Contract'),
  policy: () => L('Ödeme ve iptal politikası', 'Payment and cancellation policy'),
  readiness: () => L('Hazırlık kontrolü', 'Readiness check'),
}

const PROFILE_TEXT: Record<Profile, () => string> = {
  simple: () => L('Sade: küçük işletme, 16 temel bağlantı', 'Simple: small business, 16 basic links'),
  standard: () => L('Standart: orta işletme, 20 bağlantı', 'Standard: medium business, 20 links'),
  advanced: () => L('Gelişmiş: büyük işletme, 21 bağlantının tamamı', 'Advanced: large business, all 21 links'),
}

export function SetupWizardPage() {
  const d = useDb()
  const can = useCan()
  const edit = can('settings:manage')
  const [draft, setDraft] = useState<SetupDraft>(() => draftOf(d))
  const [step, setStep] = useState<number>(Math.min(d.settings.setup.step, SETUP_STEPS.length - 1))
  const [showErrors, setShowErrors] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef(true)
  const latest = useRef<{ step: number; draft: SetupDraft }>({ step: 0, draft: undefined as unknown as SetupDraft })
  const current = SETUP_STEPS[step]!
  // The typed inputs are kept in the demo state (debounced), so a reload, a language switch or a step back loses nothing.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    latest.current = { step, draft }
    const t = setTimeout(() => runAction((s) => saveSetupDraft(s, step, draft)), 300)
    return () => clearTimeout(t)
  }, [draft, step])
  // Leaving the page (reload, close) must not lose the last typed value or the step the person is on.
  useEffect(() => {
    const flush = () => runAction((s) => saveSetupDraft(s, latest.current.step, latest.current.draft))
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])
  const errors = useMemo(() => localize(stepErrors(d, draft, current)), [d, draft, current, getLang()])
  const allErrors = useMemo(() => Object.fromEntries(SETUP_STEPS.map((s) => [s, localize(stepErrors(d, draft, s))])) as Record<SetupStep, Record<string, string>>, [d, draft, getLang()])
  const preview = useMemo(() => previewOf(d, draft), [d, draft])
  const checks = useMemo(() => readinessChecks(preview), [preview])
  const missing = checks.filter((c) => c.state === 'missing')
  const set = <K extends keyof SetupDraft>(k: K, v: SetupDraft[K]) => setDraft((x) => ({ ...x, [k]: v }))
  const go = (n: number) => {
    runAction((x) => saveSetupDraft(x, n, draft)) // the step is saved at once, the typed values with it
    setStep(n)
    setShowErrors(false)
    setError(null)
  }
  const next = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      return
    }
    go(Math.min(SETUP_STEPS.length - 1, step + 1))
  }
  const finish = () => {
    const bad = SETUP_STEPS.find((s) => Object.keys(allErrors[s]).length)
    if (bad) {
      setError(L(`“${STEP_LABEL[bad]()}” adımında eksik veya geçersiz alan var.`, `The “${STEP_LABEL[bad]()}” step has a missing or invalid field.`))
      go(SETUP_STEPS.indexOf(bad))
      setShowErrors(true)
      return
    }
    const r = runAction((s) => finishSetup(s, draft), L('Kurulum tamamlandı: demo şirketinin ayarları güncellendi. Sunucu ve hukuk adımları ayrıca yapılır.', 'Setup finished: the demo company settings were updated. Server and legal steps are done separately.'))
    if (!r.ok) {
      setError(r.error)
      return
    }
    setDone(true)
  }
  const e = (k: string) => (showErrors ? errors[k] : undefined)
  const classes = d.classes
  const branchChoices = draft.branches.filter((b) => b.active).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))

  if (done || d.settings.setup.done)
    return (
      <Page title={L('Kurulum sihirbazı', 'Setup wizard')} description={L('Kurulum bu demo şirketi için tamamlandı.', 'The setup is finished for this demo company.')}>
        <Notice tone="ok">
          {L('Kurulum tamamlandı. Ayarlar, çalışma profili ve temel fiyatlar güncellendi. Sunucu işleri (zararlı yazılım tarayıcısı, şifreleme anahtarı) ve hukuki inceleme yine de ayrıca yapılmalıdır.', 'The setup is finished. Settings, working profile and base prices were updated. Server tasks (malware scanner, encryption key) and legal review must still be done separately.')}
        </Notice>
        <div className="flex gap-2">
          {edit && <button type="button" className={btnSecondary} onClick={() => { runAction((s) => restartSetup(s), L('Kurulum sihirbazı yeniden başlatıldı (veriler korunur).', 'The setup wizard was restarted (data is kept).')); setDone(false); setDraft(initialDraft(d)); setStep(0) }}>{L('Sihirbazı yeniden başlat', 'Restart the wizard')}</button>}
        </div>
      </Page>
    )

  return (
    <Page
      title={L('Kurulum sihirbazı', 'Setup wizard')}
      description={L('Yeni bir rent-a-car şirketini dokuz adımda çalışır hale getirin. Bu bir önizlemedir: gerçek şirket oluşturulmaz, davet gönderilmez, veritabanı değişmez. Girdikleriniz adımlar arasında ve yenilemede kaybolmaz.', 'Make a new rent-a-car company ready in nine steps. This is a preview: no real company is created, no invitation is sent, no database changes. What you type is kept between steps and across a reload.')}
      actions={<DemoConcept>{L('Demo ön izlemesi', 'Demo preview')}</DemoConcept>}
    >
      {!edit && <Notice tone="blue">{L('Bu rolde sihirbaz yalnız okunur (ayar yönetimi yetkisi yok).', 'The wizard is read-only for this role (no settings-management permission).')}</Notice>}
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label={L('Kurulum adımları', 'Setup steps')}>
          <ol className="space-y-1">
            {SETUP_STEPS.map((s, i) => {
              const bad = Object.keys(allErrors[s]).length > 0 && s !== 'readiness'
              const on = i === step
              return (
                <li key={s}>
                  <button type="button" aria-current={on ? 'step' : undefined} onClick={() => go(i)} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px]', on ? 'bg-blue-soft font-medium text-blue-ink' : 'text-ink-2 hover:bg-line-soft')}>
                    {i < step && !bad ? <CheckCircle size={17} weight="fill" className="text-ok" /> : bad && i < step ? <WarningCircle size={17} weight="fill" className="text-hold" /> : <Circle size={17} />}
                    <span className="tnum text-[12px] text-ink-3">{i + 1}</span>
                    <span className="flex-1">{STEP_LABEL[s]()}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        <div className="min-w-0 space-y-4">
          <Panel title={`${step + 1}. ${STEP_LABEL[current]()}`}>
            <fieldset disabled={!edit} className="space-y-4">
              {current === 'company' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextF id="su-name" label={L('Ticari ad', 'Trade name')} required value={draft.company.name} onChange={(v) => set('company', { ...draft.company, name: v })} error={e('name')} />
                  <TextF id="su-legal" label={L('Yasal ünvan', 'Legal name')} value={draft.company.legalName} onChange={(v) => set('company', { ...draft.company, legalName: v })} />
                  <TextF id="su-country" label={L('Ülke (ISO)', 'Country (ISO)')} required value={draft.company.country} onChange={(v) => set('company', { ...draft.company, country: v.toUpperCase().slice(0, 2) })} error={e('country')} />
                  <TextF id="su-tax" label={L('Vergi numarası', 'Tax ID')} value={draft.company.taxId} onChange={(v) => set('company', { ...draft.company, taxId: v })} />
                  <TextF id="su-tz" label={L('Saat dilimi (IANA)', 'Time zone (IANA)')} required value={draft.company.tz} onChange={(v) => set('company', { ...draft.company, tz: v })} error={e('tz')} hint="Europe/Sarajevo" />
                  <SelectF id="su-cur" label={L('Ana para birimi', 'Base currency')} value={draft.company.baseCurrency} onChange={(v) => set('company', { ...draft.company, baseCurrency: v })} options={CURRENCIES.map((c) => ({ id: c.code, label: `${c.code} · ${L(c.tr, c.en)}` }))} error={e('baseCurrency')} />
                </div>
              )}
              {current === 'branches' && (
                <div className="space-y-4">
                  {e('branches') && <p role="alert" className="text-[13px] text-alert">{e('branches')}</p>}
                  {draft.branches.map((b, i) => {
                    const upd = (patch: Partial<typeof b>) => set('branches', draft.branches.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                    return (
                      <div key={b.id} className="rounded-lg border border-line p-4">
                        <div className="mb-3 flex items-center justify-between"><p className="text-[13.5px] font-medium">{b.code || L('Yeni şube', 'New branch')} {b.isNew && <Pill tone="blue">{L('yeni', 'new')}</Pill>}</p>{b.isNew && <button type="button" aria-label={L('Şubeyi kaldır', 'Remove branch')} className={btnSmall} onClick={() => set('branches', draft.branches.filter((_, j) => j !== i))}><X size={13} /></button>}</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextF id={`su-b${i}-n`} label={L('Şube adı', 'Branch name')} required value={b.name} onChange={(v) => upd({ name: v })} error={e(`b${i}.name`)} />
                          <TextF id={`su-b${i}-c`} label={L('Kod', 'Code')} required value={b.code} onChange={(v) => upd({ code: v.toUpperCase().slice(0, 4) })} error={e(`b${i}.code`)} />
                          <TextF id={`su-b${i}-ci`} label={L('Şehir', 'City')} value={b.city} onChange={(v) => upd({ city: v })} />
                          <TextF id={`su-b${i}-co`} label={L('Ülke (ISO)', 'Country (ISO)')} required value={b.country} onChange={(v) => upd({ country: v.toUpperCase().slice(0, 2) })} error={e(`b${i}.country`)} />
                          <TextF id={`su-b${i}-tz`} label={L('Saat dilimi', 'Time zone')} required value={b.tz} onChange={(v) => upd({ tz: v })} error={e(`b${i}.tz`)} />
                          <div className="flex items-end"><CheckF id={`su-b${i}-a`} checked={b.active} onChange={(v) => upd({ active: v })}>{L('Etkin', 'Active')}</CheckF></div>
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" className={btnSecondary} onClick={() => set('branches', [...draft.branches, { id: `b-new${draft.branches.length + 1}`, name: '', code: '', city: '', country: draft.company.country, tz: draft.company.tz, active: true, isNew: true }])}><Plus size={14} /> {L('Şube ekle', 'Add a branch')}</button>
                </div>
              )}
              {current === 'profile' && (
                <div className="space-y-2" role="radiogroup" aria-label={L('Çalışma profili', 'Working profile')}>
                  {PROFILES.map((p) => (
                    <label key={p} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5', draft.profile === p ? 'border-blue bg-blue-soft' : 'border-line')}>
                      <input type="radio" name="su-profile" checked={draft.profile === p} onChange={() => set('profile', p)} className="mt-1 size-4 accent-[var(--ac-blue)]" />
                      <span><span className="block text-[14px] font-medium">{PROFILE_TEXT[p]()}</span><span className="block text-[12.5px] text-ink-2">{L(`Menüde ${profileLinks({ profile: p, hidden: [], shown: [] }, { activeBranches: draft.branches.filter((b) => b.active).length }).length} bağlantı görünür; yetkiler ve veriler değişmez.`, `${profileLinks({ profile: p, hidden: [], shown: [] }, { activeBranches: draft.branches.filter((b) => b.active).length }).length} links are shown; permissions and data do not change.`)}</span></span>
                    </label>
                  ))}
                  <p className="text-[12.5px] text-ink-2">{L('Profil yalnız görünürlüktür. Görevler her profilde görünür.', 'The profile is only visibility. Tasks is visible in every profile.')}</p>
                </div>
              )}
              {current === 'vehicle' && (
                <div className="space-y-4">
                  <CheckF id="su-vskip" checked={draft.vehicle.skip} onChange={(v) => set('vehicle', { ...draft.vehicle, skip: v })}>{L('Bu adımı atla (araçlar sonra Araçlar ekranından eklenir)', 'Skip this step (vehicles are added later on the Vehicles screen)')}</CheckF>
                  {!draft.vehicle.skip && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextF id="su-vp" label={L('Plaka', 'Plate')} required value={draft.vehicle.plate} onChange={(v) => set('vehicle', { ...draft.vehicle, plate: v })} error={e('plate')} />
                      <TextF id="su-vm" label={L('Marka', 'Make')} required value={draft.vehicle.make} onChange={(v) => set('vehicle', { ...draft.vehicle, make: v })} error={e('make')} />
                      <TextF id="su-vmo" label={L('Model', 'Model')} required value={draft.vehicle.model} onChange={(v) => set('vehicle', { ...draft.vehicle, model: v })} error={e('model')} />
                      <TextF id="su-vy" label={L('Yıl', 'Year')} required value={draft.vehicle.year} onChange={(v) => set('vehicle', { ...draft.vehicle, year: v.replace(/\D/g, '').slice(0, 4) })} error={e('year')} />
                      <SelectF id="su-vc" label={L('Sınıf', 'Class')} value={draft.vehicle.classId} onChange={(v) => set('vehicle', { ...draft.vehicle, classId: v })} options={classes.map((c) => ({ id: c.id, label: c.name }))} error={e('classId')} />
                      <SelectF id="su-vb" label={L('Ana şube', 'Home branch')} value={draft.vehicle.branchId} onChange={(v) => set('vehicle', { ...draft.vehicle, branchId: v })} options={branchChoices} error={e('branchId')} />
                    </div>
                  )}
                </div>
              )}
              {current === 'users' && (
                <div className="space-y-4">
                  <p className="text-[13px] text-ink-2">{L('Davet yalnız bir kayıt oluşturur; e-posta gönderilmez, hesap açılmaz. Yüksek riskli işlemler için en az iki Sahip/Yönetici gerekir.', 'An invitation only creates a record; no email is sent and no account is opened. High-risk actions need at least two Owners/Managers.')}</p>
                  {draft.invites.map((u, i) => {
                    const upd = (patch: Partial<typeof u>) => set('invites', draft.invites.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                    return (
                      <div key={i} className="rounded-lg border border-line p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextF id={`su-u${i}-n`} label={L('Ad soyad', 'Full name')} required value={u.name} onChange={(v) => upd({ name: v })} error={e(`u${i}.name`)} />
                          <TextF id={`su-u${i}-e`} label={L('E-posta', 'Email')} required value={u.email} onChange={(v) => upd({ email: v })} error={e(`u${i}.email`)} />
                          <SelectF id={`su-u${i}-r`} label={L('Rol', 'Role')} value={u.roleId} onChange={(v) => upd({ roleId: v })} options={d.roles.map((r) => ({ id: r.id, label: r.name }))} error={e(`u${i}.role`)} />
                          <div className="flex items-end"><button type="button" className={btnSmall} onClick={() => set('invites', draft.invites.filter((_, j) => j !== i))}>{L('Kaldır', 'Remove')}</button></div>
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" className={btnSecondary} onClick={() => set('invites', [...draft.invites, { name: '', email: '', roleId: 'role-manager', branchIds: [] }])}><Plus size={14} /> {L('Kullanıcı ekle', 'Add a user')}</button>
                </div>
              )}
              {current === 'pricing' && (
                <div className="space-y-3">
                  <p className="text-[13px] text-ink-2">{L(`Günlük temel fiyat, ${draft.company.baseCurrency} cinsinden, sınıf başına. Sezon, ek hizmet ve vergi Fiyatlandırma ekranında detaylandırılır.`, `Daily base rate in ${draft.company.baseCurrency} per class. Seasons, extras and tax are detailed on the Pricing screen.`)}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {classes.map((c) => <TextF key={c.id} id={`su-p-${c.id}`} label={`${c.name} (${draft.company.baseCurrency}/${L('gün', 'day')})`} value={draft.pricing.daily[c.id] ?? ''} onChange={(v) => set('pricing', { daily: { ...draft.pricing.daily, [c.id]: v } })} error={e(`p.${c.id}`)} />)}
                  </div>
                </div>
              )}
              {current === 'contract' && (
                <div className="space-y-4">
                  <SelectF id="su-cl" label={L('Sözleşme dili (belge dili arayüz dilinden ayrıdır)', 'Contract language (the document language is separate from the interface language)')} value={draft.contract.lang} onChange={(v) => set('contract', { ...draft.contract, lang: v as 'tr' | 'en' | 'bs' })} options={[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }, { id: 'bs', label: 'Bosanski' }]} />
                  <Notice tone="hold">{L('ACARVO sözleşmeyi hazırlar (şablon, taslak, PDF, sürüm); imza gerekiyorsa dış süreçte alınır. Şablon metinleri örnektir ve hukuki geçerlilik için her ülkede avukat incelemesi gerekir. Bu demoda “incelendi” işaretlenemez.', 'ACARVO drafts the contract (template, draft, PDF, version); where a signature is needed it is taken in an external process. The template texts are samples and a lawyer must review them in each country. They cannot be marked reviewed in this demo.')}</Notice>
                  <CheckF id="su-legal-ack" checked={draft.contract.legalAck} onChange={(v) => set('contract', { ...draft.contract, legalAck: v })} error={e('legalAck')}>{L('Hukuki incelemenin ayrıca yapılacağını anladım.', 'I understand the legal review is done separately.')}</CheckF>
                </div>
              )}
              {current === 'policy' && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <TextF id="su-adv" label={L('Kaparo oranı (%)', 'Advance rate (%)')} value={draft.policy.advancePct} onChange={(v) => set('policy', { ...draft.policy, advancePct: v })} error={e('advancePct')} />
                    <TextF id="su-free" label={L('Ücretsiz iptal (teslimden saat önce)', 'Free cancellation (hours before pickup)')} value={draft.policy.freeHours} onChange={(v) => set('policy', { ...draft.policy, freeHours: v })} error={e('freeHours')} />
                    <TextF id="su-fee" label={`${L('Geç iptal bedeli', 'Late-cancellation fee')} (${draft.company.baseCurrency})`} value={draft.policy.lateFee} onChange={(v) => set('policy', { ...draft.policy, lateFee: v })} error={e('lateFee')} />
                  </div>
                  <p className="text-[12.5px] text-ink-2">{L('Bedel sistem tarafından otomatik hesaplanır; personel değiştiremez. Tahsilatlar kaydedildikten sonra başka bir yetkili doğrular; yüksek riskli işlemler bağımsız onay ister. Bunlar bu sihirbazda gevşetilemez.', 'The fee is computed by the system; staff cannot change it. Payments are verified by another authorized person after they are recorded; high-risk actions need an independent approval. None of this can be relaxed in this wizard.')}</p>
                </div>
              )}
              {current === 'readiness' && (
                <div className="space-y-3" data-testid="setup-readiness">
                  <p className="text-[13px] text-ink-2">{L('Girdiğiniz bilgilerle kurulum bittiğinde durum bu olur. Eksik bir madde için “Adıma dön” sizi ilgili adıma götürür.', 'This is the state after the setup with what you entered. For a missing item, “Back to the step” takes you to the right step.')}</p>
                  <ul className="divide-y divide-line-soft">
                    {checks.map((c) => (
                      <li key={c.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]" data-testid={`su-ready-${c.key}`}>
                        <span className="min-w-0 flex-1"><span className="font-medium">{loc(c.label)}</span><span className="block text-[12.5px] text-ink-2">{loc(c.detail)}</span></span>
                        <span className="flex items-center gap-2">
                          {c.state === 'missing' && CHECK_STEP[c.key] && <button type="button" className={btnSmall} onClick={() => go(SETUP_STEPS.indexOf(CHECK_STEP[c.key]!))}>{L('Adıma dön', 'Back to the step')}</button>}
                          <Pill tone={c.state === 'ok' ? 'ok' : c.state === 'missing' ? 'alert' : c.state === 'legal' ? 'hold' : c.state === 'info' ? 'blue' : 'muted'}>{L(READY_LABEL[c.state].tr, READY_LABEL[c.state].en)}</Pill>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {missing.length > 0 ? <Notice tone="alert">{L(`${missing.length} eksik madde var; kurulum tamamlanamaz.`, `${missing.length} item(s) missing; the setup cannot be finished.`)}</Notice> : <Notice tone="blue">{L('Eksik madde yok. Sistem yöneticisi ve hukuki maddeler bu demoda tamamlanmış sayılmaz; bunlar “Hazır” gösterilmez.', 'Nothing is missing. System-administrator and legal items are not treated as done in this demo; they are never shown as “Ready”.')}</Notice>}
                </div>
              )}
            </fieldset>
          </Panel>
          {error && <p role="alert" className="text-[13px] font-medium text-alert">{error}</p>}
          {showErrors && Object.keys(errors).length > 0 && <p role="alert" className="text-[13px] font-medium text-alert">{L('Devam etmeden önce işaretli alanları düzeltin.', 'Fix the marked fields before continuing.')}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12.5px] text-ink-3">{L('Girdiler otomatik saklanır.', 'Inputs are saved automatically.')}</span>
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} disabled={step === 0} onClick={() => go(step - 1)}>{L('Geri', 'Back')}</button>
              {step < SETUP_STEPS.length - 1 ? (
                <button type="button" className={btnPrimary} onClick={next}>{L('İleri', 'Next')}</button>
              ) : (
                <button type="button" className={btnPrimary} disabled={!edit || missing.length > 0} title={missing.length ? L('Eksik maddeler çözülmeli', 'Resolve the missing items first') : undefined} onClick={finish}>{L('Kurulumu tamamla', 'Finish the setup')}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
