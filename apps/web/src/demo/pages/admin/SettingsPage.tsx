import { type ReactNode, useState } from 'react'
import { describeRate, isRateActive } from '../../core/calc/fx'
import { fail, userName } from '../../core/helpers'
import { currencyInfo, CURRENCIES, parseAmount, toInput } from '../../core/money'
import { addFxRate, endFxRate, saveSettings } from '../../core/ops/control'
import type { Cur, Db, FxRate } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, DateTimeF, SelectF, TextF, branchOptions } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSmall, FinanceDialog, Notice, Page, Panel } from '../../ui/kit'

// Settings: every section edits one part of the policy and saves through one action that writes an audit entry. Changes
// affect future transactions only; frozen price and rate snapshots never change. The exchange-rate desk exists only here.

const SECTIONS = () => [
  { id: 'sirket', label: L('Şirket', 'Company') },
  { id: 'bolge', label: L('Dil, bölge ve para birimleri', 'Language, region and currencies') },
  { id: 'kurlar', label: L('Döviz Kurları', 'Exchange Rates') },
  { id: 'sure', label: L('Süre ve ücret kuralları', 'Duration and fee rules') },
  { id: 'surucu', label: L('Sürücü politikası', 'Driver policy') },
  { id: 'depozito', label: L('Depozito politikası', 'Deposit policy') },
  { id: 'odeme', label: L('Ödeme politikası', 'Payment policy') },
  { id: 'kasa', label: L('Kasa politikası', 'Cash policy') },
  { id: 'belge', label: L('Belge politikası', 'Document policy') },
  { id: 'esik', label: L('Onay eşikleri', 'Approval thresholds') },
  { id: 'bildirim', label: L('Bildirimler', 'Notifications') },
  { id: 'gizlilik', label: L('Gizlilik', 'Privacy') },
]

export function SettingsPage() {
  const d = useDb()
  const can = useCan()
  const sections = SECTIONS()
  const [sec, setSec] = useUrlState('bolum', 'sirket')
  const cur = sections.find((s) => s.id === sec) ?? sections[0]!
  const edit = can('settings:manage')
  return (
    <Page
      title={L('Ayarlar', 'Settings')}
      description={L('Şirket politikaları tek yerde. Değişiklikler yalnız sonraki işlemleri etkiler; dondurulmuş fiyat ve kur kayıtları değişmez. Her değişiklik işlem geçmişine yazılır.', 'Company policies in one place. Changes affect future transactions only; frozen price and rate snapshots never change. Every change is written to the audit log.')}
    >
      {!edit && <Notice tone="blue">{L('Bu rolde ayarlar yalnız okunur (ayar yönetimi yetkisi yok).', 'Settings are read-only for this role (no settings-management permission).')}</Notice>}
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label={L('Ayar bölümleri', 'Settings sections')}>
          <ul className="space-y-1">
            {sections.map((s) => <li key={s.id}><button type="button" aria-current={s.id === cur.id} onClick={() => setSec(s.id)} className={`w-full rounded-lg px-3 py-2 text-left text-[13.5px] ${s.id === cur.id ? 'bg-blue-soft font-medium text-blue-ink' : 'text-ink-2 hover:bg-line-soft'}`}>{s.label}</button></li>)}
          </ul>
        </nav>
        <div className="min-w-0">
          {cur.id === 'kurlar' ? <FxDesk d={d} /> : <SectionForm key={cur.id} id={cur.id} title={cur.label} edit={edit} />}
        </div>
      </div>
    </Page>
  )
}

// ----------------------------------------------------------------------------------------------- generic section form

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1"><p className="text-[13px] font-medium">{label}</p>{children}</div>
}

function PerCur({ id, label, curs, value, onChange }: { id: string; label: string; curs: Cur[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <Field label={label}>
      <div className="grid gap-3 sm:grid-cols-3">{curs.map((c) => <TextF key={c} id={`${id}-${c}`} label={c} value={value[c] ?? ''} onChange={(v) => onChange({ ...value, [c]: v })} />)}</div>
    </Field>
  )
}

const toRec = (rec: Record<string, number>, curs: Cur[]): Record<string, string> => Object.fromEntries(curs.map((c) => [c, rec[c] !== undefined ? toInput(rec[c]!, c) : '']))
const fromRec = (txt: Record<string, string>, curs: Cur[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const c of curs) { const v = (txt[c] ?? '').trim(); if (v === '') continue; const m = parseAmount(v, c); if (m === null || m < 0) fail(`${c}: geçerli bir tutar girin.`); out[c] = m! }
  return out
}
const num = (s: string, label: string, min = 0, max = 100000): number => { const n = Number(s); if (!Number.isFinite(n) || n < min || n > max) fail(`${label}: ${min}–${max} arasında bir sayı girin.`); return n }

function SectionForm({ id, title, edit }: { id: string; title: string; edit: boolean }) {
  const d = useDb()
  const s = d.settings
  const curs = s.acceptedCurrencies
  const [err, setErr] = useState<string | null>(null)
  const save = (summary: string, mutate: (db: Db) => void) => { const r = runAction((x) => saveSettings(x, summary, mutate), L('Ayar kaydedildi; yalnız sonraki işlemleri etkiler.', 'Setting saved; it affects future transactions only.')); setErr(r.ok ? null : r.error) }
  const fieldset = (children: ReactNode, onSave: () => void) => (
    <Panel title={title}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave() }} noValidate>
        <fieldset disabled={!edit} className="space-y-4">{children}</fieldset>
        {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}
        {edit && <div className="flex justify-end"><button type="submit" className={btnPrimary}>{L('Kaydet', 'Save')}</button></div>}
      </form>
    </Panel>
  )
  // each section owns its state through a small component so hooks stay stable
  switch (id) {
    case 'sirket': return <Company fieldset={fieldset} save={save} />
    case 'bolge': return <Region fieldset={fieldset} save={save} />
    case 'sure': return <Duration fieldset={fieldset} save={save} curs={curs} />
    case 'surucu': return <Driver fieldset={fieldset} save={save} curs={curs} />
    case 'depozito': return <Deposit fieldset={fieldset} save={save} curs={curs} />
    case 'odeme': return <Payment fieldset={fieldset} save={save} />
    case 'kasa': return <Cash fieldset={fieldset} save={save} curs={curs} />
    case 'belge': return <Docs fieldset={fieldset} save={save} />
    case 'esik': return <Thresholds fieldset={fieldset} save={save} curs={curs} />
    case 'bildirim': return <Notify fieldset={fieldset} save={save} />
    case 'gizlilik': return <Privacy fieldset={fieldset} save={save} />
    default: return null
  }
}

interface SecProps {
  fieldset: (children: ReactNode, onSave: () => void) => ReactNode
  save: (summary: string, mutate: (db: Db) => void) => void
  curs?: Cur[]
}

function Company({ fieldset, save }: SecProps) {
  const d = useDb()
  const c = d.settings.company
  const [v, setV] = useState({ name: c.name, legalName: c.legalName, country: c.country, taxId: c.taxId, address: c.address, email: c.email, phone: c.phone, tz: c.tz, baseCurrency: c.baseCurrency })
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  return fieldset(
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="s-n" label={L('Ticari ad', 'Trade name')} value={v.name} onChange={set('name')} />
        <TextF id="s-l" label={L('Yasal ünvan', 'Legal name')} value={v.legalName} onChange={set('legalName')} />
        <TextF id="s-c" label={L('Ülke (ISO)', 'Country (ISO)')} value={v.country} onChange={(x) => set('country')(x.toUpperCase().slice(0, 2))} hint={L('Otomatik doldurulmaz; şirketin kendi bilgisidir.', 'Not auto-filled; it is the company’s own data.')} />
        <TextF id="s-t" label={L('Vergi numarası', 'Tax ID')} value={v.taxId} onChange={set('taxId')} />
        <TextF id="s-e" label={L('E-posta', 'Email')} value={v.email} onChange={set('email')} />
        <TextF id="s-p" label={L('Telefon', 'Phone')} value={v.phone} onChange={set('phone')} />
        <TextF id="s-tz" label={L('Saat dilimi (IANA)', 'Time zone (IANA)')} value={v.tz} onChange={set('tz')} hint="Europe/Sarajevo" />
        <SelectF id="s-b" label={L('Ana para birimi', 'Base currency')} value={v.baseCurrency} onChange={set('baseCurrency')} options={CURRENCIES.map((x) => ({ id: x.code, label: `${x.code} · ${L(x.tr, x.en)}` }))} />
      </div>
      <TextF id="s-a" label={L('Adres', 'Address')} value={v.address} onChange={set('address')} />
    </>,
    () => save('Şirket bilgileri', (db) => { try { new Intl.DateTimeFormat('en', { timeZone: v.tz }) } catch { fail('Geçersiz saat dilimi.') } Object.assign(db.settings.company, v) }),
  )
}

function Region({ fieldset, save }: SecProps) {
  const d = useDb()
  const s = d.settings
  const [first, setFirst] = useState(String(s.locale.firstDay))
  const [order, setOrder] = useState(s.locale.dateOrder)
  const [accepted, setAccepted] = useState<Cur[]>(s.acceptedCurrencies)
  const [tender, setTender] = useState<Record<string, Cur[]>>(s.branchTender)
  return fieldset(
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="r-f" label={L('Haftanın ilk günü', 'First day of the week')} value={first} onChange={setFirst} options={[{ id: '1', label: L('Pazartesi', 'Monday') }, { id: '0', label: L('Pazar', 'Sunday') }]} />
        <SelectF id="r-o" label={L('Tarih sırası', 'Date order')} value={order} onChange={(v) => setOrder(v as typeof order)} options={[{ id: 'dmy', label: L('Gün-Ay-Yıl', 'Day-Month-Year') }, { id: 'mdy', label: L('Ay-Gün-Yıl', 'Month-Day-Year') }]} />
      </div>
      <Field label={L('Kabul edilen para birimleri', 'Accepted currencies')}>
        <div className="flex flex-wrap gap-x-5 gap-y-1">{CURRENCIES.map((c) => <CheckF key={c.code} id={`r-c-${c.code}`} checked={accepted.includes(c.code)} onChange={(v) => setAccepted((x) => (v ? [...x, c.code] : x.filter((y) => y !== c.code)))}>{c.code}</CheckF>)}</div>
      </Field>
      <Field label={L('Şube bazında tahsilat para birimleri', 'Tender currencies per branch')}>
        <ul className="space-y-2">{d.branches.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]"><span className="w-20 font-medium">{b.code}</span>{accepted.map((c) => <CheckF key={c} id={`r-t-${b.id}-${c}`} checked={(tender[b.id] ?? accepted).includes(c)} onChange={(v) => setTender((t) => ({ ...t, [b.id]: v ? [...(t[b.id] ?? accepted), c] : (t[b.id] ?? accepted).filter((y) => y !== c) }))}>{c}</CheckF>)}</li>)}</ul>
      </Field>
    </>,
    () => save('Bölge ve para birimleri', (db) => { if (!accepted.length) fail('En az bir para birimi kabul edilmeli.'); if (!accepted.includes(db.settings.company.baseCurrency)) fail('Ana para birimi kabul edilen para birimleri arasında olmalı.'); db.settings.locale.firstDay = Number(first) as 0 | 1; db.settings.locale.dateOrder = order; db.settings.acceptedCurrencies = accepted; db.settings.branchTender = Object.fromEntries(Object.entries(tender).map(([b, cs]) => [b, cs.filter((c) => accepted.includes(c))])) }),
  )
}

function Duration({ fieldset, save, curs = [] }: SecProps) {
  const d = useDb().settings.duration
  const [method, setMethod] = useState(d.dayMethod)
  const [grace, setGrace] = useState(String(d.graceMinutes))
  const [minDays, setMinDays] = useState(String(d.minDays))
  const [late, setLate] = useState(String(d.lateFeePerHourPct))
  const [kmDay, setKmDay] = useState(String(d.kmPerDay))
  const [oneWay, setOneWay] = useState(toRec(d.oneWayFee, curs))
  const [fuel, setFuel] = useState(toRec(d.fuelFeePerQuarter, curs))
  const [kmFee, setKmFee] = useState(toRec(d.kmOverageFee, curs))
  return fieldset(
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="d-m" label={L('Gün sayma yöntemi', 'Day counting method')} value={method} onChange={(v) => setMethod(v as typeof method)} options={[{ id: 'calendar_day', label: L('Takvim günü', 'Calendar day') }, { id: 'hours_24', label: L('24 saatlik', '24-hour blocks') }]} />
        <TextF id="d-g" label={L('Tolerans (dakika)', 'Grace (minutes)')} value={grace} onChange={setGrace} />
        <TextF id="d-n" label={L('En az gün', 'Minimum days')} value={minDays} onChange={setMinDays} />
        <TextF id="d-l" label={L('Geç iade saat başına (günlük tarifenin %)', 'Late fee per hour (% of daily rate)')} value={late} onChange={setLate} />
        <TextF id="d-k" label={L('Günlük km hakkı', 'Included km per day')} value={kmDay} onChange={setKmDay} />
      </div>
      <PerCur id="d-ow" label={L('Tek yön ücreti', 'One-way fee')} curs={curs} value={oneWay} onChange={setOneWay} />
      <PerCur id="d-fu" label={L('Yakıt farkı (çeyrek başına)', 'Fuel difference (per quarter)')} curs={curs} value={fuel} onChange={setFuel} />
      <PerCur id="d-km" label={L('Km aşım ücreti (km başına)', 'Km overage fee (per km)')} curs={curs} value={kmFee} onChange={setKmFee} />
    </>,
    () => save('Süre ve ücret kuralları', (db) => { Object.assign(db.settings.duration, { dayMethod: method, graceMinutes: num(grace, 'Tolerans', 0, 720), minDays: num(minDays, 'En az gün', 1, 30), lateFeePerHourPct: num(late, 'Geç iade %', 0, 100), kmPerDay: num(kmDay, 'Km hakkı', 0, 5000), oneWayFee: fromRec(oneWay, curs), fuelFeePerQuarter: fromRec(fuel, curs), kmOverageFee: fromRec(kmFee, curs) }) }),
  )
}

function Driver({ fieldset, save, curs = [] }: SecProps) {
  const p = useDb().settings.driver
  const [minAge, setMinAge] = useState(String(p.minAge))
  const [minYears, setMinYears] = useState(String(p.minLicenseYears))
  const [youngMax, setYoungMax] = useState(String(p.youngDriverMaxAge))
  const [maxAdd, setMaxAdd] = useState(String(p.maxAdditionalDrivers))
  const [young, setYoung] = useState(toRec(p.youngDriverFee, curs))
  const [add, setAdd] = useState(toRec(p.additionalDriverDaily, curs))
  return fieldset(
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="dr-a" label={L('En düşük yaş', 'Minimum age')} value={minAge} onChange={setMinAge} />
        <TextF id="dr-y" label={L('En az ehliyet yılı', 'Minimum licence years')} value={minYears} onChange={setMinYears} />
        <TextF id="dr-m" label={L('Genç sürücü üst yaşı', 'Young-driver maximum age')} value={youngMax} onChange={setYoungMax} />
        <TextF id="dr-x" label={L('En fazla ek sürücü', 'Maximum additional drivers')} value={maxAdd} onChange={setMaxAdd} />
      </div>
      <PerCur id="dr-yf" label={L('Genç sürücü ücreti (kiralama başına)', 'Young-driver fee (per rental)')} curs={curs} value={young} onChange={setYoung} />
      <PerCur id="dr-af" label={L('Ek sürücü ücreti (günlük)', 'Additional driver fee (per day)')} curs={curs} value={add} onChange={setAdd} />
    </>,
    () => save('Sürücü politikası', (db) => { Object.assign(db.settings.driver, { minAge: num(minAge, 'Yaş', 16, 99), minLicenseYears: num(minYears, 'Ehliyet yılı', 0, 60), youngDriverMaxAge: num(youngMax, 'Genç sürücü yaşı', 16, 99), maxAdditionalDrivers: num(maxAdd, 'Ek sürücü', 0, 10), youngDriverFee: fromRec(young, curs), additionalDriverDaily: fromRec(add, curs) }) }),
  )
}

function Deposit({ fieldset, save, curs = [] }: SecProps) {
  const d = useDb()
  const p = d.settings.deposit
  const [methods, setMethods] = useState(p.allowedMethods)
  const [hold, setHold] = useState(p.allowCardHold)
  const [byClass, setByClass] = useState<Record<string, Record<string, string>>>(Object.fromEntries(d.classes.map((c) => [c.id, toRec(p.byClass[c.id] ?? {}, curs)])))
  const labels: Record<string, string> = { cash: L('Nakit', 'Cash'), card: L('Kart', 'Card'), transfer: L('Havale', 'Transfer'), other: L('Diğer', 'Other') }
  return fieldset(
    <>
      <Field label={L('İzin verilen depozito yöntemleri', 'Allowed deposit methods')}>
        <div className="flex flex-wrap gap-x-5">{(['cash', 'card', 'transfer', 'other'] as const).map((m) => <CheckF key={m} id={`dp-${m}`} checked={methods.includes(m)} onChange={(v) => setMethods((x) => (v ? [...x, m] : x.filter((y) => y !== m)))}>{labels[m]}</CheckF>)}</div>
      </Field>
      <CheckF id="dp-hold" checked={hold} onChange={setHold}>{L('Kart provizyonuna izin ver', 'Allow card holds')}</CheckF>
      <Field label={L('Sınıf bazında depozito (para birimi başına; satır yoksa o para biriminde depozito tanımsızdır)', 'Deposit per class (per currency; no row means undefined in that currency)')}>
        <div className="space-y-3">{d.classes.map((c) => <div key={c.id}><p className="mb-1 text-[12.5px] text-ink-2">{c.name}</p><div className="grid gap-3 sm:grid-cols-3">{curs.map((cu) => <TextF key={cu} id={`dp-${c.id}-${cu}`} label={cu} value={byClass[c.id]?.[cu] ?? ''} onChange={(v) => setByClass((s) => ({ ...s, [c.id]: { ...s[c.id], [cu]: v } }))} />)}</div></div>)}</div>
      </Field>
    </>,
    () => save('Depozito politikası', (db) => { if (!methods.length) fail('En az bir depozito yöntemi seçin.'); db.settings.deposit.allowedMethods = methods; db.settings.deposit.allowCardHold = hold; db.settings.deposit.byClass = Object.fromEntries(db.classes.map((c) => [c.id, fromRec(byClass[c.id] ?? {}, curs)])) }),
  )
}

function Payment({ fieldset, save }: SecProps) {
  const p = useDb().settings.payment
  const [over, setOver] = useState(p.allowOverpayment)
  const [pct, setPct] = useState(String(p.advanceRequiredPct))
  const [methods, setMethods] = useState(p.refundMethods)
  const labels: Record<string, string> = { cash: L('Nakit', 'Cash'), card: L('Kart', 'Card'), transfer: L('Havale', 'Transfer'), other: L('Diğer', 'Other') }
  return fieldset(
    <>
      <CheckF id="py-o" checked={over} onChange={setOver}>{L('Fazla ödemeye izin ver (fazlası iade adayı olarak görünür)', 'Allow overpayment (the excess shows as a refund candidate)')}</CheckF>
      <TextF id="py-p" label={L('Kaparo oranı (%)', 'Advance required (%)')} value={pct} onChange={setPct} />
      <Field label={L('İade yöntemleri', 'Refund methods')}><div className="flex flex-wrap gap-x-5">{(['cash', 'card', 'transfer', 'other'] as const).map((m) => <CheckF key={m} id={`py-${m}`} checked={methods.includes(m)} onChange={(v) => setMethods((x) => (v ? [...x, m] : x.filter((y) => y !== m)))}>{labels[m]}</CheckF>)}</div></Field>
    </>,
    () => save('Ödeme politikası', (db) => { Object.assign(db.settings.payment, { allowOverpayment: over, advanceRequiredPct: num(pct, 'Kaparo %', 0, 100), refundMethods: methods }) }),
  )
}

function Cash({ fieldset, save, curs = [] }: SecProps) {
  const p = useDb().settings.cash
  const [count, setCount] = useState(p.requireCountOnClose)
  const [handover, setHandover] = useState(p.handoverRequired)
  const [variance, setVariance] = useState(toRec(p.varianceReason, curs))
  return fieldset(
    <>
      <CheckF id="ca-c" checked={count} onChange={setCount}>{L('Kapanışta sayım zorunlu', 'Count required on close')}</CheckF>
      <CheckF id="ca-h" checked={handover} onChange={setHandover}>{L('Devir kaydı zorunlu', 'Handover record required')}</CheckF>
      <PerCur id="ca-v" label={L('Fark gerekçesi eşiği (bu tutarın üstü gerekçe ister)', 'Variance reason threshold (above this needs a reason)')} curs={curs} value={variance} onChange={setVariance} />
    </>,
    () => save('Kasa politikası', (db) => { Object.assign(db.settings.cash, { requireCountOnClose: count, handoverRequired: handover, varianceReason: fromRec(variance, curs) }) }),
  )
}

function Docs({ fieldset, save }: SecProps) {
  const p = useDb().settings.docs
  const kinds = [['national_id', L('Kimlik', 'ID card')], ['passport', L('Pasaport', 'Passport')], ['driving_license', L('Sürücü belgesi', 'Driving licence')]] as const
  const [foreign, setForeign] = useState(p.requireForForeign)
  const [local, setLocal] = useState(p.requireForLocal)
  const [warn, setWarn] = useState(String(p.warnDays))
  const group = (label: string, v: string[], set: (x: string[]) => void, pre: string) => <Field label={label}><div className="flex flex-wrap gap-x-5">{kinds.map(([k, l]) => <CheckF key={k} id={`${pre}-${k}`} checked={v.includes(k)} onChange={(on) => set(on ? [...v, k] : v.filter((y) => y !== k))}>{l}</CheckF>)}</div></Field>
  return fieldset(
    <>
      {group(L('Yabancı müşteri için zorunlu belgeler', 'Required documents for foreign customers'), foreign, setForeign, 'dc-f')}
      {group(L('Yerli müşteri için zorunlu belgeler', 'Required documents for local customers'), local, setLocal, 'dc-l')}
      <TextF id="dc-w" label={L('Süre uyarısı (gün)', 'Expiry warning (days)')} value={warn} onChange={setWarn} />
    </>,
    () => save('Belge politikası', (db) => { Object.assign(db.settings.docs, { requireForForeign: foreign, requireForLocal: local, warnDays: num(warn, 'Uyarı günü', 1, 365) }) }),
  )
}

function Thresholds({ fieldset, save, curs = [] }: SecProps) {
  const t = useDb().settings.thresholds
  const [pct, setPct] = useState(String(t.highDiscountPct))
  const [refund, setRefund] = useState(toRec(t.refundAbove, curs))
  const [dep, setDep] = useState(toRec(t.depositExceptionAbove, curs))
  const [corp, setCorp] = useState(t.corporateOverride)
  return fieldset(
    <>
      <p className="text-[13px] text-ink-2">{L('Eşikler, hangi işlemlerin Onay Merkezi’ne gitmesi gerektiğini belirler. İkinci onaylayıcı zorunluluğu (dört göz) ayar değildir; her zaman geçerlidir.', 'Thresholds decide which actions must go through the Approval Center. The second-approver rule (four eyes) is not a setting; it always applies.')}</p>
      <TextF id="th-p" label={L('Yüksek indirim eşiği (%)', 'High discount threshold (%)')} value={pct} onChange={setPct} />
      <PerCur id="th-r" label={L('İade onay eşiği', 'Refund approval threshold')} curs={curs} value={refund} onChange={setRefund} />
      <PerCur id="th-d" label={L('Depozito istisnası eşiği', 'Deposit exception threshold')} curs={curs} value={dep} onChange={setDep} />
      <CheckF id="th-c" checked={corp} onChange={setCorp}>{L('Kurumsal kredi limit aşımı yalnız onayla geçilir', 'A corporate credit-limit breach is passed only by approval')}</CheckF>
    </>,
    () => save('Onay eşikleri', (db) => { Object.assign(db.settings.thresholds, { highDiscountPct: num(pct, 'İndirim eşiği', 0, 100), refundAbove: fromRec(refund, curs), depositExceptionAbove: fromRec(dep, curs), corporateOverride: corp }) }),
  )
}

function Notify({ fieldset, save }: SecProps) {
  const n = useDb().settings.notify
  const [on, setOn] = useState(Object.fromEntries(n.map((x) => [x.id, x.on])))
  return fieldset(
    <>
      <p className="text-[13px] text-ink-2">{L('Bunlar uygulama içi bildirimlerdir. E-posta, SMS veya anlık mesaj gönderilmez; entegrasyon yoktur.', 'These are in-app notifications. No email, SMS or push message is sent; there is no integration.')}</p>
      <ul className="space-y-1.5">{n.map((x) => <li key={x.id}><CheckF id={`nf-${x.id}`} checked={!!on[x.id]} onChange={(v) => setOn((s) => ({ ...s, [x.id]: v }))}>{x.label}</CheckF></li>)}</ul>
    </>,
    () => save('Bildirimler', (db) => { for (const x of db.settings.notify) x.on = !!on[x.id] }),
  )
}

function Privacy({ fieldset, save }: SecProps) {
  const d = useDb()
  const p = d.settings.privacy
  const [months, setMonths] = useState(String(p.retentionMonths))
  const [audit, setAudit] = useState(String(p.auditRetentionMonths))
  const [mask, setMask] = useState(p.maskIdentityRoles)
  return fieldset(
    <>
      <div className="grid gap-4 sm:grid-cols-2"><TextF id="pv-m" label={L('Müşteri verisi saklama (ay)', 'Customer data retention (months)')} value={months} onChange={setMonths} /><TextF id="pv-a" label={L('İşlem geçmişi saklama (ay)', 'Audit retention (months)')} value={audit} onChange={setAudit} /></div>
      <Field label={L('İletişim bilgileri maskelenen roller', 'Roles that see masked contact details')}>
        <div className="flex flex-wrap gap-x-5">{d.roles.filter((r) => r.id !== 'role-owner').map((r) => <CheckF key={r.id} id={`pv-${r.id}`} checked={mask.includes(r.id)} onChange={(v) => setMask((x) => (v ? [...x, r.id] : x.filter((y) => y !== r.id)))}>{r.name}</CheckF>)}</div>
      </Field>
    </>,
    () => save('Gizlilik', (db) => { Object.assign(db.settings.privacy, { retentionMonths: num(months, 'Saklama', 1, 240), auditRetentionMonths: num(audit, 'Saklama', 1, 240), maskIdentityRoles: mask }) }),
  )
}

// ----------------------------------------------------------------------------------------------- the exchange-rate desk

function FxDesk({ d }: { d: Db }) {
  const can = useCan()
  const f = useFmt()
  const [adding, setAdding] = useState(false)
  const now = d.clock.now
  const active = d.fxRates.filter((r) => isRateActive(r, now))
  const past = d.fxRates.filter((r) => !isRateActive(r, now)).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))
  const edit = can('settings:fx')
  return (
    <div className="space-y-4">
      <Notice tone="blue">{L('Döviz kurları yalnız burada tanımlanır (tek kur masası). Kurlar işletmenin kendi belirlediği manuel orandır; piyasa veya merkez bankası kuru değildir. Kur yoksa o para biriminde tahsilat “Kur Bekleniyor” olur ve hiçbir şey kaydedilmez. Ödemeler kaydedildiği anda kuru dondurur; sonradan kur değişse eski ödemeler değişmez.', 'Exchange rates are defined only here (the single rate desk). Rates are manual business-defined values, not market or central-bank rates. With no rate, a payment in that currency is “Awaiting Rate” and nothing is stored. A payment pins its rate when recorded; later rate changes never alter earlier payments.')}</Notice>
      <Panel title={L('Geçerli kurlar', 'Active rates')} action={edit ? <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>{L('Kur ekle', 'Add rate')}</button> : undefined} flush>
        {active.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Geçerli kur yok. Yabancı para birimiyle tahsilat için kur tanımlayın.', 'No active rates. Define a rate to take payment in a foreign currency.')}</p> : (
          <ul className="divide-y divide-line-soft">{active.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]"><span><span className="font-medium">{describeRate(r)}</span><span className="block text-[12.5px] text-ink-2">{r.purpose} · {r.scope === 'company' ? L('şirket geneli', 'company-wide') : d.branches.find((b) => b.id === r.scope)?.code} · {f.dt(r.validFrom)} → {r.validUntil ? f.dt(r.validUntil) : L('süresiz', 'open-ended')} · {r.note}</span></span>{edit && <button type="button" className={btnSmall} onClick={() => runAction((s) => endFxRate(s, r.id), L('Kur sonlandırıldı; eski ödemeler değişmedi.', 'Rate ended; earlier payments did not change.'))}>{L('Sonlandır', 'End')}</button>}</li>)}</ul>
        )}
      </Panel>
      {past.length > 0 && <Panel title={L('Sonlanmış kurlar', 'Ended rates')} flush><ul className="divide-y divide-line-soft">{past.map((r) => <li key={r.id} className="px-5 py-2.5 text-[13.5px] text-ink-2">{describeRate(r)} · {r.validUntil ? f.dt(r.validUntil) : ''} · {userName(d, r.enteredBy)}</li>)}</ul></Panel>}
      {adding && <FxDialog onClose={() => setAdding(false)} />}
      <p className="text-[12.5px] text-ink-3">{L('Örnek: 1 EUR = 1,25 USD tanımlanınca 125 USD tahsilat 100 EUR eşdeğeri olarak uygulanır.', 'Example: once 1 EUR = 1.25 USD is defined, a 125 USD payment is applied as 100 EUR.')}</p>
    </div>
  )
}

function FxDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone()
  const curs = d.settings.acceptedCurrencies
  const [base, setBase] = useState<Cur>(curs[0] ?? 'EUR')
  const [quote, setQuote] = useState<Cur>(curs[1] ?? 'USD')
  const [rate, setRate] = useState('')
  const [purpose, setPurpose] = useState<FxRate['purpose']>('tender')
  const [scope, setScope] = useState('company')
  const [from, setFrom] = useState(d.clock.now)
  const [inverse, setInverse] = useState(false)
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Kur ekle', 'Add rate')} description={L('1 temel para birimi = kur × karşı para birimi. Aynı çift için aynı kapsamda iki geçerli kur olamaz; önce eskisini sonlandırın.', '1 base currency = rate × quote currency. The same pair cannot have two valid rates in one scope; end the old one first.')} confirm={L('Kuru kaydet', 'Save rate')} onClose={onClose}
      summary={[[L('Okunuşu', 'Reads as'), `1 ${base} = ${rate || '?'} ${quote}`], [L('Para birimleri', 'Currencies'), `${L(currencyInfo(base).tr, currencyInfo(base).en)} → ${L(currencyInfo(quote).tr, currencyInfo(quote).en)}`]]}
      onSubmit={() => {
        const r = runAction((s) => addFxRate(s, { base, quote, rate: Number(rate.replace(',', '.')), purpose, scope, validFrom: from, validUntil: null, autoInverse: inverse, note }), L('Kur kaydedildi; yeni işlemlerde kullanılır.', 'Rate saved; used for new transactions.'))
        if (!r.ok) { setFields(r.fields); return r.error }
        onClose()
      }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectF id="fx-b" label={L('Temel', 'Base')} value={base} onChange={setBase} options={curs.map((c) => ({ id: c, label: c }))} error={fields.base} />
        <SelectF id="fx-q" label={L('Karşı', 'Quote')} value={quote} onChange={setQuote} options={curs.map((c) => ({ id: c, label: c }))} error={fields.quote} />
        <TextF id="fx-r" label={L('Kur', 'Rate')} required value={rate} onChange={setRate} error={fields.rate} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="fx-p" label={L('Amaç', 'Purpose')} value={purpose} onChange={(v) => setPurpose(v as FxRate['purpose'])} options={[{ id: 'tender', label: L('Tahsilat', 'Tender') }, { id: 'refund', label: L('İade', 'Refund') }, { id: 'deposit', label: L('Depozito', 'Deposit') }, { id: 'report', label: L('Rapor', 'Report') }]} />
        <SelectF id="fx-s" label={L('Kapsam', 'Scope')} value={scope} onChange={setScope} options={[{ id: 'company', label: L('Şirket geneli', 'Company-wide') }, ...branchOptions(d)]} hint={L('Şube kuru şirket kurundan önceliklidir.', 'A branch rate beats the company rate.')} />
      </div>
      <DateTimeF id="fx-f" label={L('Geçerlilik başlangıcı', 'Valid from')} value={from} onChange={setFrom} tz={tz} error={fields.validUntil} />
      <CheckF id="fx-i" checked={inverse} onChange={setInverse}>{L('Ters yönde otomatik kullanılabilir (1 / kur)', 'May be used automatically in reverse (1 / rate)')}</CheckF>
      <TextF id="fx-n" label={L('Açıklama', 'Note')} required value={note} onChange={setNote} error={fields.note} />
    </FinanceDialog>
  )
}
