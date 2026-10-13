import { currencyExponent, ISO_CURRENCIES, MAX_GRACE_MINUTES, minorToDecimal, parseAmount, type PriceListDetail, type PricingResult } from '@acarvo/shared'
import { ArrowLeft, Archive, CheckCircle, ClockCounterClockwise, Plus, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import { describe, Field, Input, Select } from '@/components/fields'
import { ErrorState, ForbiddenState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, branchesApi, pricingApi, vehiclesApi } from '@/lib/api'
import { DAY_METHOD_LABEL, TAX_MODE_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { PriceListStatusBadge } from './PricingPage'
import { PreviewResult } from './QuoteParts'

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'
const btnGhost = 'h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink'
const cell = 'h-9 text-[13.5px]'

// Form state keeps what the user typed (amounts as text); conversion to minor units happens on save.
interface RateRow { key: string; vehicleClassId: string; r1: string; r7: string; r30: string }
interface SeasonRow { key: string; name: string; startDate: string; endDate: string; vehicleClassId: string; percent: string; priority: string; active: boolean }
interface ExtraRow { key: string; code: string; name: string; kind: 'standard' | 'additional_driver'; mode: 'per_day' | 'per_rental'; price: string; maxQuantity: string; taxable: boolean; active: boolean }
interface DiscountRow { key: string; name: string; type: 'percent' | 'fixed'; value: string; minDays: string; active: boolean }
interface Form {
  name: string
  currency: string
  branchId: string
  validFrom: string
  validUntil: string
  priority: string
  dayMethod: 'rolling_24h' | 'calendar_day' | ''
  graceMinutes: string
  minDays: string
  taxMode: 'not_configured' | 'exclusive' | 'inclusive'
  taxRate: string
  taxLabel: string
  note: string
  rates: RateRow[]
  seasons: SeasonRow[]
  extras: ExtraRow[]
  discounts: DiscountRow[]
}
const k = () => crypto.randomUUID()
const pct = (bp: number) => (bp / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
/** "17" or "7,5" → basis points; null when not a number with at most two decimals. */
const toBp = (text: string, signed = false) => {
  const m = (signed ? /^([+-]?)(\d{1,4})(?:[.,](\d{1,2}))?$/ : /^()(\d{1,4})(?:[.,](\d{1,2}))?$/).exec(text.trim())
  if (!m) return null
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || 0)
  return m[1] === '-' ? -v : v
}
const money = (minor: number | null, currency: string) => (minor == null ? '' : minorToDecimal(minor, currency).replace('.', ','))

function fromDetail(d: PriceListDetail): Form {
  return {
    name: d.name,
    currency: d.currency,
    branchId: d.branch?.id ?? '',
    validFrom: d.validFrom ?? '',
    validUntil: d.validUntil ?? '',
    priority: String(d.priority),
    dayMethod: d.dayMethod,
    graceMinutes: String(d.graceMinutes),
    minDays: String(d.minDays),
    taxMode: d.taxMode,
    taxRate: d.taxRateBp == null ? '' : pct(d.taxRateBp),
    taxLabel: d.taxLabel ?? '',
    note: d.note ?? '',
    rates: d.rates.map((r) => ({ key: r.id, vehicleClassId: r.vehicleClassId, r1: money(r.rate1to6, d.currency), r7: money(r.rate7to29, d.currency), r30: money(r.rate30plus, d.currency) })),
    seasons: d.seasons.map((s) => ({ key: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, vehicleClassId: s.vehicleClassId ?? '', percent: (s.percentBp > 0 ? '+' : '') + pct(s.percentBp), priority: String(s.priority), active: s.active })),
    extras: d.extras.map((e) => ({ key: e.id, code: e.code, name: e.name, kind: e.kind, mode: e.mode, price: money(e.priceMinor, d.currency), maxQuantity: String(e.maxQuantity), taxable: e.taxable, active: e.active })),
    discounts: d.discounts.map((x) => ({ key: x.id, name: x.name, type: x.type, value: x.type === 'percent' ? pct(x.value) : money(x.value, d.currency), minDays: String(x.minDays), active: x.active })),
  }
}
const EMPTY: Form = {
  name: '',
  currency: '',
  branchId: '',
  validFrom: '',
  validUntil: '',
  priority: '0',
  dayMethod: '',
  graceMinutes: '0',
  minDays: '1',
  taxMode: 'not_configured',
  taxRate: '',
  taxLabel: '',
  note: '',
  rates: [],
  seasons: [],
  extras: [],
  discounts: [],
}

/** Client checks with Turkish messages, then the document the API expects. The server checks everything again. */
function toDocument(f: Form): { doc?: Record<string, unknown>; errors: Record<string, string> } {
  const e: Record<string, string> = {}
  const cur = f.currency
  const amount = (text: string, key: string, optional = false) => {
    if (!text.trim()) {
      if (!optional) e[key] = 'Tutar girin'
      return null
    }
    const v = cur ? parseAmount(text, cur) : null
    if (v == null) e[key] = currencyExponent(cur) === 0 ? 'Tam sayı girin' : `En fazla ${currencyExponent(cur)} ondalık basamak`
    return v
  }
  const int = (text: string, key: string, min: number, max: number) => {
    const n = Number(text)
    if (!/^\d+$/.test(text.trim()) || n < min || n > max) e[key] = `${min}–${max} arası tam sayı`
    return n
  }
  if (!f.name.trim()) e.name = 'Fiyat listesi adını girin'
  if (!cur) e.currency = 'Para birimini seçin'
  if (!f.dayMethod) e.dayMethod = 'Gün hesabı yöntemini seçin'
  if (f.validFrom && f.validUntil && f.validUntil < f.validFrom) e.validUntil = 'Bitiş başlangıçtan önce olamaz'
  const taxRateBp = f.taxMode === 'not_configured' ? null : toBp(f.taxRate)
  if (f.taxMode !== 'not_configured' && (taxRateBp == null || taxRateBp < 1 || taxRateBp > 10_000)) e.taxRate = 'Vergi oranını girin (ör. 17)'
  const rates = f.rates.map((r, i) => {
    if (!r.vehicleClassId) e[`rates.${i}.vehicleClassId`] = 'Sınıf seçin'
    return { vehicleClassId: r.vehicleClassId, rate1to6: amount(r.r1, `rates.${i}.rate1to6`), rate7to29: amount(r.r7, `rates.${i}.rate7to29`, true), rate30plus: amount(r.r30, `rates.${i}.rate30plus`, true) }
  })
  if (new Set(f.rates.map((r) => r.vehicleClassId)).size !== f.rates.length) e.rates = 'Bir araç sınıfı yalnız bir kez fiyatlandırılabilir'
  const seasons = f.seasons.map((s, i) => {
    if (!s.name.trim()) e[`seasons.${i}.name`] = 'Ad girin'
    if (!s.startDate) e[`seasons.${i}.startDate`] = 'Tarih seçin'
    if (!s.endDate) e[`seasons.${i}.endDate`] = 'Tarih seçin'
    else if (s.startDate && s.endDate < s.startDate) e[`seasons.${i}.endDate`] = 'Bitiş başlangıçtan önce'
    const percentBp = toBp(s.percent, true)
    if (percentBp == null || percentBp < -9000 || percentBp > 50000) e[`seasons.${i}.percentBp`] = '−90 ile +500 arası'
    return { name: s.name.trim(), startDate: s.startDate, endDate: s.endDate, vehicleClassId: s.vehicleClassId || null, percentBp, priority: int(s.priority, `seasons.${i}.priority`, 0, 1000), active: s.active }
  })
  const extras = f.extras.map((x, i) => {
    if (!/^[A-Z0-9_-]{2,20}$/.test(x.code)) e[`extras.${i}.code`] = '2–20 büyük harf, rakam, - _'
    if (!x.name.trim()) e[`extras.${i}.name`] = 'Ad girin'
    return { code: x.code, name: x.name.trim(), kind: x.kind, mode: x.mode, priceMinor: amount(x.price, `extras.${i}.priceMinor`), maxQuantity: int(x.maxQuantity, `extras.${i}.maxQuantity`, 1, 20), taxable: x.taxable, active: x.active }
  })
  if (new Set(f.extras.map((x) => x.code)).size !== f.extras.length) e.extras = 'Ek hizmet kodları tekil olmalı'
  const discounts = f.discounts.map((d, i) => {
    if (!d.name.trim()) e[`discounts.${i}.name`] = 'Ad girin'
    const value = d.type === 'percent' ? toBp(d.value) : amount(d.value, `discounts.${i}.value`)
    if (d.type === 'percent' && (value == null || value < 1 || value > 10_000)) e[`discounts.${i}.value`] = '%0,01–100'
    return { name: d.name.trim(), type: d.type, value, minDays: int(d.minDays, `discounts.${i}.minDays`, 1, 366), active: d.active }
  })
  const doc = {
    name: f.name.trim(),
    currency: cur,
    branchId: f.branchId || null,
    validFrom: f.validFrom || null,
    validUntil: f.validUntil || null,
    priority: int(f.priority, 'priority', 0, 1000),
    dayMethod: f.dayMethod,
    graceMinutes: int(f.graceMinutes, 'graceMinutes', 0, MAX_GRACE_MINUTES),
    minDays: int(f.minDays, 'minDays', 1, 30),
    taxMode: f.taxMode,
    taxRateBp,
    taxLabel: f.taxMode === 'not_configured' ? null : f.taxLabel.trim() || null,
    note: f.note.trim() || null,
    rates,
    seasons,
    extras,
    discounts,
  }
  return Object.keys(e).length ? { errors: e } : { doc, errors: e }
}

function Section({ title, description, children, action }: { title: string; description?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const id = `sec-${title.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-2">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small labelled control inside a repeated row (label visible on phones, hidden on wide tables). */
function Cell({ id, label, error, className, children }: { id: string; label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-[12px] text-ink-2">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[12px] text-alert">
          {error}
        </p>
      )}
    </div>
  )
}

const RemoveButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className="mt-5 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-alert-soft hover:text-alert">
    <Trash size={16} />
  </button>
)

export const NewPriceListPage = () => <PriceListEditorPage mode="create" />
export const EditPriceListPage = () => <PriceListEditorPage mode="edit" />

function PriceListEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const session = useSession()
  const params = useParams({ strict: false }) as { priceListId?: string }
  const id = mode === 'edit' ? params.priceListId! : null
  const q = useQuery({ queryKey: ['price-list', session.company?.id, id], queryFn: () => pricingApi.get(id!), enabled: !!id, retry: false })
  const back = (
    <Link to="/fiyatlandirma" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} /> Fiyatlandırma
    </Link>
  )
  if (!can(session, 'pricing.read') || (mode === 'create' && !can(session, 'pricing.manage'))) return <ForbiddenState />
  if (id && q.isError) {
    return (
      <div className="space-y-4">
        {back}
        {q.error instanceof ApiRequestError && q.error.status === 404 ? (
          <StatePanel icon={WarningCircle} title="Fiyat listesi bulunamadı">
            <p>Bu adreste fiyat listesi yok ya da şirketinize ait değil.</p>
          </StatePanel>
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (id && !q.data)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Fiyat listesi yükleniyor">
        {back}
        <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
      </div>
    )
  return <Editor key={q.data ? `${q.data.id}-${q.data.version}` : 'new'} detail={q.data ?? null} back={back} />
}

function Editor({ detail, back }: { detail: PriceListDetail | null; back: ReactNode }) {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const canManage = can(session, 'pricing.manage') && detail?.status !== 'archived'
  const initial = detail ? fromDetail(detail) : EMPTY
  const [f, setF] = useState<Form>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [confirm, setConfirm] = useState<'activate' | 'archive' | null>(null)
  // A ref, not state: navigation right after a save must not be blocked by a stale "dirty" check.
  const saved = useRef(false)
  const setSaved = (v: boolean) => {
    saved.current = v
  }
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useBlocker({ shouldBlockFn: () => dirty && !saved.current && !window.confirm('Fiyat listesinde kaydedilmemiş değişiklikler var. Sayfadan çıkılsın mı?'), enableBeforeUnload: () => dirty && !saved.current })
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: vehiclesApi.classes })
  const branches = useQuery({ queryKey: ['branches', session.company?.id], queryFn: branchesApi.list })
  const set = <K extends keyof Form>(key: K, v: Form[K]) => setF((p) => ({ ...p, [key]: v }))
  const setRow = <K extends 'rates' | 'seasons' | 'extras' | 'discounts'>(key: K, i: number, patch: Partial<Form[K][number]>) =>
    setF((p) => ({ ...p, [key]: p[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const removeRow = (key: 'rates' | 'seasons' | 'extras' | 'discounts', i: number) => setF((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }))
  const err = (key: string) => errors[key]
  const cur = f.currency || '—'
  const readOnly = !canManage

  const updated = (d: PriceListDetail) => {
    qc.setQueryData(['price-list', session.company?.id, d.id], d)
    void qc.invalidateQueries({ queryKey: ['price-lists', session.company?.id] })
    void qc.invalidateQueries({ queryKey: ['price-list-history', session.company?.id, d.id] })
  }
  const save = async () => {
    const { doc, errors: e } = toDocument(f)
    setErrors(e)
    setFormError(null)
    if (!doc) return setFormError('Bazı alanlar eksik veya hatalı. İşaretli alanları düzeltin.')
    setPending('save')
    try {
      if (!detail) {
        const created = await pricingApi.create(doc)
        setSaved(true)
        toast(`${created.name} oluşturuldu (taslak, revizyon 1).`)
        updated(created)
        void navigate({ to: '/fiyatlandirma/$priceListId', params: { priceListId: created.id }, replace: true })
      } else {
        const next = await pricingApi.save(detail.id, { ...doc, version: detail.version })
        setSaved(true)
        toast(`Kaydedildi: revizyon ${next.revision}. Önceki teklifler kendi revizyonlarını korur.`)
        updated(next)
      }
    } catch (x) {
      if (x instanceof ApiRequestError && x.code === 'VERSION_CONFLICT') setConflict(true)
      setErrors(x instanceof ApiRequestError && x.fields ? x.fields : {})
      setFormError(x instanceof Error ? x.message : 'Kaydedilemedi.')
    } finally {
      setPending(null)
    }
  }
  const lifecycle = async (action: 'activate' | 'archive') => {
    if (!detail) return
    setPending(action)
    setFormError(null)
    try {
      const next = action === 'activate' ? await pricingApi.activate(detail.id, detail.version) : await pricingApi.archive(detail.id, detail.version)
      updated(next)
      toast(action === 'activate' ? `${next.name} etkinleştirildi.` : `${next.name} arşivlendi.`)
      setConfirm(null)
    } catch (x) {
      if (x instanceof ApiRequestError && x.code === 'VERSION_CONFLICT') setConflict(true)
      setFormError(x instanceof Error ? x.message : 'İşlem yapılamadı.')
      setConfirm(null)
    } finally {
      setPending(null)
    }
  }
  const classOptions = classes.data?.items ?? []

  return (
    <div className="space-y-5 pb-24">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em] break-words">{detail ? detail.name : 'Yeni fiyat listesi'}</h1>
            {detail && <PriceListStatusBadge status={detail.status} />}
          </div>
          <p className="mt-1 text-ink-2">
            {detail
              ? `${detail.currency} · revizyon ${detail.revision} · ${detail.quoteCount} teklif bu listeyi kullandı · son değişiklik ${formatDateTime(detail.updatedAt)}${detail.updatedByName ? ` · ${detail.updatedByName}` : ''}`
              : 'Kaydedince taslak olarak oluşturulur; etkinleştirene kadar tekliflerde kullanılmaz.'}
          </p>
        </div>
        {detail && can(session, 'pricing.manage') && detail.status !== 'archived' && (
          <div className="flex flex-wrap gap-2">
            {detail.status === 'draft' && (
              <button type="button" className={btnSecondary} disabled={dirty || pending !== null} onClick={() => setConfirm('activate')}>
                <CheckCircle size={16} /> Etkinleştir…
              </button>
            )}
            <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => setConfirm('archive')}>
              <Archive size={16} /> Arşivle…
            </button>
          </div>
        )}
      </div>
      {detail?.status === 'archived' && <p className="rounded-lg border border-line bg-ground px-4 py-3 text-[13px] text-ink-2">Arşivdeki liste değiştirilemez ve yeni tekliflerde kullanılmaz. Eski teklifler kendi kalemlerini korur.</p>}
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-hold/30 bg-hold-soft px-4 py-3 text-[13px]">
          <WarningCircle size={17} className="shrink-0 text-hold" />
          <span className="min-w-0 flex-1 font-medium">Bu liste siz düzenlerken başka bir kullanıcı tarafından değiştirildi. Değişiklikleriniz kaydedilmedi.</span>
          <button
            type="button"
            className="h-8 rounded-md border border-line bg-surface px-3 font-medium hover:bg-ground"
            onClick={() => {
              setSaved(true)
              void qc.invalidateQueries({ queryKey: ['price-list', session.company?.id, detail?.id] })
            }}
          >
            Güncel listeyi yükle
          </button>
        </div>
      )}
      {formError && !conflict && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {formError}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <fieldset disabled={readOnly} className="min-w-0 space-y-5">
          <legend className="sr-only">Fiyat listesi</legend>
          <Section title="Genel">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pl-name" label="Ad" required error={err('name')}>
                <Input {...describe('pl-name', err('name'))} maxLength={80} value={f.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field id="pl-currency" label="Para birimi" required error={err('currency')} hint={detail ? 'Liste oluşturulduktan sonra değişmez.' : 'ISO 4217 kodu. Kur dönüşümü yapılmaz.'}>
                <Select {...describe('pl-currency', err('currency'), true)} value={f.currency} disabled={!!detail} onChange={(e) => set('currency', e.target.value)}>
                  <option value="">Seçin</option>
                  {ISO_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="pl-branch" label="Şube" hint="Boş: tüm şubelerde geçerli.">
                <Select {...describe('pl-branch', undefined, true)} value={f.branchId} onChange={(e) => set('branchId', e.target.value)}>
                  <option value="">Tüm şubeler</option>
                  {(branches.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="pl-priority" label="Öncelik" error={err('priority')} hint="Aynı gün ve şubede birden fazla liste uygunsa yüksek öncelikli olan kullanılır.">
                <Input {...describe('pl-priority', err('priority'), true)} inputMode="numeric" value={f.priority} onChange={(e) => set('priority', e.target.value)} />
              </Field>
              <Field id="pl-from" label="Geçerlilik başlangıcı" hint="Alış gününe göre (şubenin saatiyle).">
                <Input {...describe('pl-from', undefined, true)} type="date" value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
              </Field>
              <Field id="pl-until" label="Geçerlilik bitişi" error={err('validUntil')}>
                <Input {...describe('pl-until', err('validUntil'))} type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Gün hesabı" description="Sistem gün hesabını kendiliğinden seçmez; yöntem bu listede belirtilir.">
            <fieldset aria-describedby={err('dayMethod') ? 'pl-day-error' : undefined}>
              <legend className="mb-1.5 text-[13.5px] font-medium text-ink">
                Yöntem <span className="text-alert">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['rolling_24h', 'Her başlayan 24 saat bir gün sayılır (toleranstan sonra).'],
                    ['calendar_day', 'Alış şubesinin saatine göre alış ve iade tarihleri arasındaki gün farkı; aynı gün en az 1 gün. Örnek: 10 Ekim 23.00 – 11 Ekim 01.00 = 1 gün. Dokunulan her tarih ayrıca ücretlenmez.'],
                  ] as const
                ).map(([m, hint]) => (
                  <label key={m} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5', f.dayMethod === m ? 'border-blue bg-blue-soft/40' : 'border-line')}>
                    <input type="radio" name="dayMethod" value={m} checked={f.dayMethod === m} onChange={() => set('dayMethod', m)} className="mt-1 accent-blue" />
                    <span>
                      <span className="block font-medium text-ink">{DAY_METHOD_LABEL[m]}</span>
                      <span className="block text-[12.5px] text-ink-2">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {err('dayMethod') && (
                <p id="pl-day-error" className="mt-1.5 text-[13px] text-alert">
                  {err('dayMethod')}
                </p>
              )}
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="pl-grace" label="Tolerans (dakika)" error={err('graceMinutes')} hint={`24 saatlik dönemde, bu kadar dakikalık aşım yeni gün sayılmaz (en fazla ${MAX_GRACE_MINUTES}).`}>
                <Input {...describe('pl-grace', err('graceMinutes'), true)} inputMode="numeric" disabled={readOnly || f.dayMethod === 'calendar_day'} value={f.graceMinutes} onChange={(e) => set('graceMinutes', e.target.value)} />
              </Field>
              <Field id="pl-mindays" label="En az gün" error={err('minDays')}>
                <Input {...describe('pl-mindays', err('minDays'))} inputMode="numeric" value={f.minDays} onChange={(e) => set('minDays', e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Vergi" description="ACARVO vergi oranı tahmin etmez. Yapılandırılmazsa yalnız net toplam gösterilir.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="pl-taxmode" label="Vergi uygulaması">
                <Select id="pl-taxmode" value={f.taxMode} onChange={(e) => set('taxMode', e.target.value as Form['taxMode'])}>
                  {(['not_configured', 'exclusive', 'inclusive'] as const).map((m) => (
                    <option key={m} value={m}>
                      {TAX_MODE_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              {f.taxMode !== 'not_configured' && (
                <>
                  <Field id="pl-taxrate" label="Oran (%)" required error={err('taxRate') ?? err('taxRateBp')}>
                    <Input {...describe('pl-taxrate', err('taxRate') ?? err('taxRateBp'))} inputMode="decimal" value={f.taxRate} onChange={(e) => set('taxRate', e.target.value)} placeholder="ör. 17" />
                  </Field>
                  <Field id="pl-taxlabel" label="Vergi adı" hint="ör. PDV, KDV">
                    <Input {...describe('pl-taxlabel', undefined, true)} maxLength={40} value={f.taxLabel} onChange={(e) => set('taxLabel', e.target.value)} />
                  </Field>
                </>
              )}
            </div>
          </Section>

          <Section
            title="Sınıf tarifeleri"
            description={`Günlük fiyatlar (${cur}). Kademe toplam kiralama süresine göre seçilir; boş üst kademe bir alttakini kullanır.`}
            action={
              !readOnly && (
                <button type="button" className={btnSecondary} onClick={() => set('rates', [...f.rates, { key: k(), vehicleClassId: '', r1: '', r7: '', r30: '' }])}>
                  <Plus size={16} /> Sınıf ekle
                </button>
              )
            }
          >
            {err('rates') && <p className="mb-2 text-[13px] text-alert">{err('rates')}</p>}
            {f.rates.length === 0 ? (
              <p className="text-[13px] text-ink-2">Tarife yok. Etkinleştirmek için en az bir sınıf tarifesi gerekir.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {f.rates.map((r, i) => (
                  <li key={r.key} className="flex flex-wrap items-start gap-3 py-2.5">
                    <Cell id={`r-${r.key}-class`} label="Araç sınıfı" error={err(`rates.${i}.vehicleClassId`)} className="w-full sm:w-[180px]">
                      <Select {...describe(`r-${r.key}-class`, err(`rates.${i}.vehicleClassId`))} compact value={r.vehicleClassId} onChange={(e) => setRow('rates', i, { vehicleClassId: e.target.value })}>
                        <option value="">Seçin</option>
                        {classOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Cell>
                    {(
                      [
                        ['r1', '1–6 gün', 'rate1to6'],
                        ['r7', '7–29 gün', 'rate7to29'],
                        ['r30', '30+ gün', 'rate30plus'],
                      ] as const
                    ).map(([field, label, api]) => (
                      <Cell key={field} id={`r-${r.key}-${field}`} label={`${label} (${cur})`} error={err(`rates.${i}.${api}`)} className="w-[calc(33%-8px)] min-w-[96px] sm:w-[120px]">
                        <Input {...describe(`r-${r.key}-${field}`, err(`rates.${i}.${api}`))} className={cn(cell, 'tnum')} inputMode="decimal" value={r[field]} placeholder={field === 'r1' ? '0,00' : 'üst kademe yok'} onChange={(e) => setRow('rates', i, { [field]: e.target.value })} />
                      </Cell>
                    ))}
                    {!readOnly && <RemoveButton label="Tarifeyi kaldır" onClick={() => removeRow('rates', i)} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Sezonlar"
            description="Günlük fiyatı yüzde artırır veya azaltır; her gün için en yüksek öncelikli etkin sezon uygulanır. Aynı öncelikte çakışma hesaplanmaz."
            action={
              !readOnly && (
                <button type="button" className={btnSecondary} onClick={() => set('seasons', [...f.seasons, { key: k(), name: '', startDate: '', endDate: '', vehicleClassId: '', percent: '+10', priority: '0', active: true }])}>
                  <Plus size={16} /> Sezon ekle
                </button>
              )
            }
          >
            {f.seasons.length === 0 ? (
              <p className="text-[13px] text-ink-2">Sezon yok.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {f.seasons.map((s, i) => (
                  <li key={s.key} className="flex flex-wrap items-start gap-3 py-2.5">
                    <Cell id={`s-${s.key}-name`} label="Ad" error={err(`seasons.${i}.name`)} className="w-full sm:w-[150px]">
                      <Input {...describe(`s-${s.key}-name`, err(`seasons.${i}.name`))} className={cell} maxLength={80} value={s.name} onChange={(e) => setRow('seasons', i, { name: e.target.value })} />
                    </Cell>
                    <Cell id={`s-${s.key}-start`} label="Başlangıç" error={err(`seasons.${i}.startDate`)} className="w-[calc(50%-6px)] sm:w-[150px]">
                      <Input {...describe(`s-${s.key}-start`, err(`seasons.${i}.startDate`))} className={cell} type="date" value={s.startDate} onChange={(e) => setRow('seasons', i, { startDate: e.target.value })} />
                    </Cell>
                    <Cell id={`s-${s.key}-end`} label="Bitiş" error={err(`seasons.${i}.endDate`)} className="w-[calc(50%-6px)] sm:w-[150px]">
                      <Input {...describe(`s-${s.key}-end`, err(`seasons.${i}.endDate`))} className={cell} type="date" value={s.endDate} onChange={(e) => setRow('seasons', i, { endDate: e.target.value })} />
                    </Cell>
                    <Cell id={`s-${s.key}-class`} label="Sınıf" className="w-[calc(50%-6px)] sm:w-[140px]">
                      <Select id={`s-${s.key}-class`} compact value={s.vehicleClassId} onChange={(e) => setRow('seasons', i, { vehicleClassId: e.target.value })}>
                        <option value="">Tüm sınıflar</option>
                        {classOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Cell>
                    <Cell id={`s-${s.key}-pct`} label="Değişim (%)" error={err(`seasons.${i}.percentBp`)} className="w-[calc(25%-9px)] min-w-[84px] sm:w-[96px]">
                      <Input {...describe(`s-${s.key}-pct`, err(`seasons.${i}.percentBp`))} className={cn(cell, 'tnum')} inputMode="decimal" value={s.percent} onChange={(e) => setRow('seasons', i, { percent: e.target.value })} />
                    </Cell>
                    <Cell id={`s-${s.key}-prio`} label="Öncelik" error={err(`seasons.${i}.priority`)} className="w-[calc(25%-9px)] min-w-[72px] sm:w-[80px]">
                      <Input {...describe(`s-${s.key}-prio`, err(`seasons.${i}.priority`))} className={cn(cell, 'tnum')} inputMode="numeric" value={s.priority} onChange={(e) => setRow('seasons', i, { priority: e.target.value })} />
                    </Cell>
                    <label className="mt-6 flex items-center gap-1.5 text-[13px]">
                      <input type="checkbox" checked={s.active} onChange={(e) => setRow('seasons', i, { active: e.target.checked })} className="size-4 accent-blue" /> Etkin
                    </label>
                    {!readOnly && <RemoveButton label="Sezonu kaldır" onClick={() => removeRow('seasons', i)} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Ek hizmetler"
            description="Gün başına veya kiralama başına. “Ek sürücü” türü kayıttaki ek sürücü sayısına göre kendiliğinden eklenir."
            action={
              !readOnly && (
                <button type="button" className={btnSecondary} onClick={() => set('extras', [...f.extras, { key: k(), code: '', name: '', kind: 'standard', mode: 'per_day', price: '', maxQuantity: '1', taxable: true, active: true }])}>
                  <Plus size={16} /> Ek hizmet ekle
                </button>
              )
            }
          >
            {err('extras') && <p className="mb-2 text-[13px] text-alert">{err('extras')}</p>}
            {f.extras.length === 0 ? (
              <p className="text-[13px] text-ink-2">Ek hizmet yok.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {f.extras.map((x, i) => (
                  <li key={x.key} className="flex flex-wrap items-start gap-3 py-2.5">
                    <Cell id={`x-${x.key}-code`} label="Kod" error={err(`extras.${i}.code`)} className="w-[calc(40%-6px)] sm:w-[110px]">
                      <Input {...describe(`x-${x.key}-code`, err(`extras.${i}.code`))} className={cell} maxLength={20} value={x.code} onChange={(e) => setRow('extras', i, { code: e.target.value.toUpperCase() })} />
                    </Cell>
                    <Cell id={`x-${x.key}-name`} label="Ad" error={err(`extras.${i}.name`)} className="w-[calc(60%-6px)] sm:w-[160px]">
                      <Input {...describe(`x-${x.key}-name`, err(`extras.${i}.name`))} className={cell} maxLength={80} value={x.name} onChange={(e) => setRow('extras', i, { name: e.target.value })} />
                    </Cell>
                    <Cell id={`x-${x.key}-kind`} label="Tür" className="w-[calc(50%-6px)] sm:w-[130px]">
                      <Select id={`x-${x.key}-kind`} compact value={x.kind} onChange={(e) => setRow('extras', i, { kind: e.target.value as ExtraRow['kind'] })}>
                        <option value="standard">Ek hizmet</option>
                        <option value="additional_driver">Ek sürücü</option>
                      </Select>
                    </Cell>
                    <Cell id={`x-${x.key}-mode`} label="Ücret" className="w-[calc(50%-6px)] sm:w-[130px]">
                      <Select id={`x-${x.key}-mode`} compact value={x.mode} onChange={(e) => setRow('extras', i, { mode: e.target.value as ExtraRow['mode'] })}>
                        <option value="per_day">Gün başına</option>
                        <option value="per_rental">Kiralama başına</option>
                      </Select>
                    </Cell>
                    <Cell id={`x-${x.key}-price`} label={`Fiyat (${cur})`} error={err(`extras.${i}.priceMinor`)} className="w-[calc(50%-6px)] sm:w-[110px]">
                      <Input {...describe(`x-${x.key}-price`, err(`extras.${i}.priceMinor`))} className={cn(cell, 'tnum')} inputMode="decimal" value={x.price} onChange={(e) => setRow('extras', i, { price: e.target.value })} />
                    </Cell>
                    <Cell id={`x-${x.key}-max`} label="En çok adet" error={err(`extras.${i}.maxQuantity`)} className="w-[calc(50%-6px)] sm:w-[90px]">
                      <Input {...describe(`x-${x.key}-max`, err(`extras.${i}.maxQuantity`))} className={cn(cell, 'tnum')} inputMode="numeric" value={x.maxQuantity} onChange={(e) => setRow('extras', i, { maxQuantity: e.target.value })} />
                    </Cell>
                    <div className="mt-6 flex items-center gap-3 text-[13px]">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={x.taxable} onChange={(e) => setRow('extras', i, { taxable: e.target.checked })} className="size-4 accent-blue" /> Vergiye tabi
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={x.active} onChange={(e) => setRow('extras', i, { active: e.target.checked })} className="size-4 accent-blue" /> Etkin
                      </label>
                    </div>
                    {!readOnly && <RemoveButton label="Ek hizmeti kaldır" onClick={() => removeRow('extras', i)} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="İndirimler"
            description="Teklifte en fazla bir indirim seçilir ve yalnız kiralama bedeline uygulanır; tutarı aşamaz."
            action={
              !readOnly && (
                <button type="button" className={btnSecondary} onClick={() => set('discounts', [...f.discounts, { key: k(), name: '', type: 'percent', value: '', minDays: '1', active: true }])}>
                  <Plus size={16} /> İndirim ekle
                </button>
              )
            }
          >
            {f.discounts.length === 0 ? (
              <p className="text-[13px] text-ink-2">İndirim yok.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {f.discounts.map((d, i) => (
                  <li key={d.key} className="flex flex-wrap items-start gap-3 py-2.5">
                    <Cell id={`d-${d.key}-name`} label="Ad" error={err(`discounts.${i}.name`)} className="w-full sm:w-[180px]">
                      <Input {...describe(`d-${d.key}-name`, err(`discounts.${i}.name`))} className={cell} maxLength={80} value={d.name} onChange={(e) => setRow('discounts', i, { name: e.target.value })} />
                    </Cell>
                    <Cell id={`d-${d.key}-type`} label="Tür" className="w-[calc(50%-6px)] sm:w-[120px]">
                      <Select id={`d-${d.key}-type`} compact value={d.type} onChange={(e) => setRow('discounts', i, { type: e.target.value as DiscountRow['type'], value: '' })}>
                        <option value="percent">Yüzde</option>
                        <option value="fixed">Sabit tutar</option>
                      </Select>
                    </Cell>
                    <Cell id={`d-${d.key}-value`} label={d.type === 'percent' ? 'Oran (%)' : `Tutar (${cur})`} error={err(`discounts.${i}.value`)} className="w-[calc(50%-6px)] sm:w-[110px]">
                      <Input {...describe(`d-${d.key}-value`, err(`discounts.${i}.value`))} className={cn(cell, 'tnum')} inputMode="decimal" value={d.value} onChange={(e) => setRow('discounts', i, { value: e.target.value })} />
                    </Cell>
                    <Cell id={`d-${d.key}-min`} label="En az gün" error={err(`discounts.${i}.minDays`)} className="w-[calc(50%-6px)] sm:w-[90px]">
                      <Input {...describe(`d-${d.key}-min`, err(`discounts.${i}.minDays`))} className={cn(cell, 'tnum')} inputMode="numeric" value={d.minDays} onChange={(e) => setRow('discounts', i, { minDays: e.target.value })} />
                    </Cell>
                    <label className="mt-6 flex items-center gap-1.5 text-[13px]">
                      <input type="checkbox" checked={d.active} onChange={(e) => setRow('discounts', i, { active: e.target.checked })} className="size-4 accent-blue" /> Etkin
                    </label>
                    {!readOnly && <RemoveButton label="İndirimi kaldır" onClick={() => removeRow('discounts', i)} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Not">
            <Field id="pl-note" label="İç not (isteğe bağlı)">
              <Input {...describe('pl-note')} maxLength={500} value={f.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
          </Section>
        </fieldset>

        <div className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">
          {detail ? <PreviewPanel detail={detail} dirty={dirty} /> : <Section title="Önizleme">{<p className="text-[13px] text-ink-2">Önizleme liste kaydedildikten sonra yapılır.</p>}</Section>}
          {detail && <HistoryPanel id={detail.id} />}
        </div>
      </div>

      {canManage && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:left-[256px]">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-[13px] text-hold">Kaydedilmemiş değişiklikler var</span>}
            <Link to="/fiyatlandirma" className={btnGhost + ' inline-flex items-center'}>
              Vazgeç
            </Link>
            <button type="button" className={btnPrimary} disabled={pending !== null || (!!detail && !dirty)} onClick={save}>
              {pending === 'save' && <SpinnerGap size={16} className="animate-spin" />}
              {detail ? 'Yeni revizyon olarak kaydet' : 'Taslak olarak oluştur'}
            </button>
          </div>
        </div>
      )}
      {confirm && detail && (
        <ConfirmDialog
          title={confirm === 'activate' ? 'Fiyat listesini etkinleştir' : 'Fiyat listesini arşivle'}
          description={
            confirm === 'activate'
              ? `${detail.name} (revizyon ${detail.revision}) yeni tekliflerde kullanılabilir hale gelir. Vergi: ${TAX_MODE_LABEL[detail.taxMode]}${detail.taxRateBp != null ? ` %${pct(detail.taxRateBp)}` : ''}. Mevcut kayıtlara otomatik fiyat atanmaz.`
              : `${detail.name} yeni tekliflerde kullanılmaz ve bir daha değiştirilemez. Kayıtlı teklifler kendi kalemlerini korur.`
          }
          confirm={confirm === 'activate' ? 'Etkinleştir' : 'Arşivle'}
          pending={pending === confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => lifecycle(confirm)}
        />
      )}
    </div>
  )
}

function ConfirmDialog({ title, description, confirm, pending, onClose, onConfirm }: { title: string; description: string; confirm: string; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const returnFocus = useReturnFocus()
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close className={btnGhost}>Vazgeç</Dialog.Close>
            <button type="button" disabled={pending} onClick={onConfirm} className={btnPrimary}>
              {pending && <SpinnerGap size={16} className="animate-spin" />}
              {confirm}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Server preview of the saved revision: any class, branch and period, in the branch's own time. */
function PreviewPanel({ detail, dirty }: { detail: PriceListDetail; dirty: boolean }) {
  const session = useSession()
  const branches = useQuery({ queryKey: ['branches', session.company?.id], queryFn: branchesApi.list })
  const [form, setForm] = useState({ vehicleClassId: detail.rates[0]?.vehicleClassId ?? '', branchId: detail.branch?.id ?? '', pickupLocal: '', returnLocal: '', additionalDrivers: '0', choice: '' as '' | 'earlier' | 'later' })
  const [result, setResult] = useState<PricingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ambiguous, setAmbiguous] = useState(false)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<typeof form>) => {
    setForm((p) => ({ ...p, ...patch }))
    setResult(null)
  }
  const run = async () => {
    setError(null)
    if (!form.vehicleClassId || !form.branchId || !form.pickupLocal || !form.returnLocal) return setError('Sınıf, şube, alış ve iade zamanını girin.')
    setPending(true)
    try {
      setResult(
        await pricingApi.preview({
          priceListId: detail.id,
          vehicleClassId: form.vehicleClassId,
          pickupBranchId: form.branchId,
          returnBranchId: form.branchId,
          pickupLocal: form.pickupLocal,
          returnLocal: form.returnLocal,
          pickupChoice: form.choice || undefined,
          returnChoice: form.choice || undefined,
          additionalDrivers: Number(form.additionalDrivers) || 0,
          selectedExtras: [],
        }),
      )
      setAmbiguous(false)
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'AMBIGUOUS_TIME') setAmbiguous(true)
      setError(e instanceof ApiRequestError && e.fields ? `${e.message} ${Object.values(e.fields).join(' ')}` : e instanceof Error ? e.message : 'Önizleme yapılamadı.')
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Önizleme" description={`Kayıtlı revizyon ${detail.revision} ile hesaplanır; hiçbir şey kaydedilmez.`}>
      {dirty && <p className="mb-3 rounded-lg bg-hold-soft px-3 py-2 text-[12.5px] text-hold">Kaydedilmemiş değişiklikler önizlemeye yansımaz.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Field id="pv-class" label="Araç sınıfı">
          <Select id="pv-class" value={form.vehicleClassId} onChange={(e) => set({ vehicleClassId: e.target.value })}>
            <option value="">Seçin</option>
            {detail.rates.map((r) => (
              <option key={r.vehicleClassId} value={r.vehicleClassId}>
                {r.vehicleClassName}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pv-branch" label="Şube (saat dilimi buradan)">
          <Select id="pv-branch" value={form.branchId} onChange={(e) => set({ branchId: e.target.value })}>
            <option value="">Seçin</option>
            {(branches.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pv-pickup" label="Alış">
          <Input id="pv-pickup" type="datetime-local" value={form.pickupLocal} onChange={(e) => set({ pickupLocal: e.target.value })} />
        </Field>
        <Field id="pv-return" label="İade">
          <Input id="pv-return" type="datetime-local" value={form.returnLocal} onChange={(e) => set({ returnLocal: e.target.value })} />
        </Field>
        <Field id="pv-drivers" label="Ek sürücü sayısı">
          <Input id="pv-drivers" inputMode="numeric" value={form.additionalDrivers} onChange={(e) => set({ additionalDrivers: e.target.value })} />
        </Field>
        {ambiguous && (
          <Field id="pv-choice" label="Saat iki kez yaşandı: hangisi?">
            <Select id="pv-choice" value={form.choice} onChange={(e) => set({ choice: e.target.value as typeof form.choice })}>
              <option value="">Seçin</option>
              <option value="earlier">İlki (yaz saati)</option>
              <option value="later">İkincisi (kış saati)</option>
            </Select>
          </Field>
        )}
      </div>
      <button type="button" className={cn(btnSecondary, 'mt-3')} disabled={pending} onClick={run}>
        {pending && <SpinnerGap size={16} className="animate-spin" />}
        Önizle
      </button>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-alert">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-4 border-t border-line-soft pt-4">
          <PreviewResult result={result} />
        </div>
      )}
    </Section>
  )
}

function HistoryPanel({ id }: { id: string }) {
  const session = useSession()
  const q = useQuery({ queryKey: ['price-list-history', session.company?.id, id], queryFn: () => pricingApi.history(id) })
  return (
    <Section title="Revizyonlar">
      {q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="h-20 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : (
        <ol className="divide-y divide-line-soft">
          {q.data.revisions.map((r) => (
            <li key={r.revision} className="py-2.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <ClockCounterClockwise size={14} className="text-ink-3" /> Revizyon {r.revision}
                </span>
                <span className="text-[12.5px] text-ink-2">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="text-[12.5px] text-ink-2">
                {r.createdByName ?? 'Kullanıcı bilgisi yok'} · {r.counts.rates} sınıf, {r.counts.seasons} sezon, {r.counts.extras} ek hizmet, {r.counts.discounts} indirim · {TAX_MODE_LABEL[r.taxMode]}
                {r.taxRateBp != null && ` %${pct(r.taxRateBp)}`} · {r.counts.quotes} teklif
              </p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
