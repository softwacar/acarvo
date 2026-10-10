import {
  type HistoryWriteResult,
  type LocationEntry,
  type LocationPlace,
  type ManualLocationType,
  type OdometerEntry,
  type VehicleDetail,
  type VehicleHistory,
  currentOf,
  isInFuture,
  isLateEntry,
  largeJump,
  odometerNeighbours,
  odometerOrderProblem,
  utcToWallTime,
  wallTimeToUtc,
} from '@acarvo/shared'
import { ArrowRight, Buildings, DotsThree, Gauge, Info, LockSimple, MapPin, Plus, SpinnerGap, Warning, WarningCircle, Wrench } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DropdownMenu } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { toast } from '@/components/Toaster'
import { ApiRequestError, historyApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatDateTime, formatKm, getDisplayTimeZone, LOCATION_LABELS } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

// Araç 360° → Konum ve geçmiş: odometer and physical location records (spec §13.3 tab 8, §59CY, §59CG; docs §8.5).

const nf = new Intl.NumberFormat('tr-TR')
/** datetime-local values are wall-clock times in the company's time zone, not the computer's (docs §9.1). */
const nowInput = () => utcToWallTime(Date.now(), getDisplayTimeZone())
const fromInput = (v: string) => wallTimeToUtc(v, getDisplayTimeZone())

/** Which clock the field uses, the computer's zone when it differs, and what happens around daylight saving changes. */
function TimeZoneHint({ value, base }: { value: string; base: string }) {
  const zone = getDisplayTimeZone()
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone
  const r = fromInput(value)
  return (
    <>
      {base} Saat, şirket saatiyle ({zone}) girilir.
      {own !== zone && <> Bilgisayarınızın saat dilimi farklı ({own}).</>}
      {r?.note === 'gap' && (
        <span className="mt-1 block font-medium text-hold">Bu saat yaz saatine geçişte yaşanmaz; {formatDateTime(r.iso)} olarak kaydedilir.</span>
      )}
      {r?.note === 'ambiguous' && <span className="mt-1 block font-medium text-hold">Bu saat kış saatine geçişte iki kez yaşanır; ilki (yaz saati) kullanılır.</span>}
    </>
  )
}
const newRequestId = () => crypto.randomUUID()

export function placeText(p: Pick<LocationPlace, 'type' | 'branchName' | 'description'>) {
  if (p.type === 'branch') return p.branchName ?? 'Şube'
  if (p.type === 'service_provider') return p.description ? `Serviste · ${p.description}` : 'Serviste'
  return LOCATION_LABELS[p.type]
}

const ODOMETER_SOURCE: Record<OdometerEntry['eventType'], string> = { initial: 'Araç kaydı', manual: 'Elle girildi', correction: 'Düzeltme' }
const LOCATION_SOURCE: Record<LocationEntry['eventType'], string> = { initial: 'Başlangıç konumu', manual: 'Konum kaydı (elle)', correction: 'Düzeltme' }
const CORRECTABLE = new Set([null, 'vehicle_create', 'manual', 'correction'])

function useApplyResult(vehicleId: string) {
  const session = useSession()
  const qc = useQueryClient()
  return (result: HistoryWriteResult) => {
    qc.setQueryData(['vehicle-history', session.company?.id, vehicleId], result.history)
    void qc.invalidateQueries({ queryKey: ['vehicle', session.company?.id, vehicleId] })
    void qc.invalidateQueries({ queryKey: ['vehicles'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-activity'] })
  }
}

/** Server errors: field messages, the banner text, and a fresh history when someone else wrote meanwhile. */
function useErrorHandler(vehicleId: string, setErrors: (e: Record<string, string>) => void, setMessage: (m: string | null) => void) {
  const session = useSession()
  const qc = useQueryClient()
  return (e: unknown) => {
    if (e instanceof Error && e.message === 'validation') return
    if (e instanceof ApiRequestError) {
      setErrors(e.fields ?? {})
      setMessage(e.message)
      if (e.code === 'HISTORY_CHANGED') {
        const fresh = (e.details as { history?: VehicleHistory } | undefined)?.history
        if (fresh) qc.setQueryData(['vehicle-history', session.company?.id, vehicleId], fresh)
        else void qc.invalidateQueries({ queryKey: ['vehicle-history', session.company?.id, vehicleId] })
      }
    } else setMessage('Kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin.')
  }
}

// ---------------------------------------------------------------------------
// Small parts

function Banner({ tone, children }: { tone: 'alert' | 'hold' | 'info'; children: ReactNode }) {
  const t = {
    alert: ['border-alert/25 bg-alert-soft text-alert', WarningCircle],
    hold: ['border-hold/30 bg-hold-soft text-ink', Warning],
    info: ['border-line bg-ground/60 text-ink-2', Info],
  } as const
  const [cls, Ico] = t[tone]
  return (
    <div role={tone === 'alert' ? 'alert' : undefined} className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-snug', cls)}>
      <Ico size={16} weight={tone === 'hold' ? 'fill' : 'regular'} className={cn('mt-px shrink-0', tone === 'hold' && 'text-hold')} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Choice<T extends string>({ name, value, options, onChange, label }: { name: string; value: T; options: [T, string, ReactNode?][]; onChange: (v: T) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13.5px] font-medium text-ink">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([v, title, hint]) => (
          <label
            key={v}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
              value === v ? 'border-blue bg-blue-soft/50' : 'border-line hover:border-ink-3/50',
            )}
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="mt-[3px] accent-blue" />
            <span className="min-w-0">
              <span className="block font-medium">{title}</span>
              {hint && <span className="block text-[12.5px] text-ink-2">{hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function FormFooter({ pending, onClose, label = 'Kaydet' }: { pending: boolean; onClose: () => void; label?: string }) {
  return (
    <>
      <button type="submit" form="history-form" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink disabled:opacity-60">
        {pending && <SpinnerGap size={16} className="animate-spin" />}
        {label}
      </button>
      <button type="button" onClick={onClose} className="ml-auto h-10 rounded-lg px-3 font-medium text-ink-2 hover:bg-ground">
        Vazgeç
      </button>
    </>
  )
}

function RowMenu({ onCorrect, label }: { onCorrect: () => void; label: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={label} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink">
        <DotsThree size={18} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-[180px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
          <DropdownMenu.Item onSelect={onCorrect} className="flex h-9 cursor-pointer items-center rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
            Düzelt
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function CorrectionNote({ c }: { c: NonNullable<OdometerEntry['correction']> }) {
  return (
    <span className="mt-0.5 block text-[12.5px] text-ink-2">
      <span className="font-medium text-ink">{c.action === 'void' ? 'Hatalı sayıldı' : 'Düzeltildi'}:</span> {c.reason}
      <span className="text-ink-3">
        {' '}
        · {c.byName ?? '—'} · {formatDateTime(c.at)}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section

type Modal =
  | { kind: 'km' }
  | { kind: 'location' }
  | { kind: 'kmFix'; entry: OdometerEntry }
  | { kind: 'locationFix'; entry: LocationEntry }

export function OdometerLocationSection({ v, history, isLoading }: { v: VehicleDetail; history?: VehicleHistory; isLoading: boolean }) {
  const session = useSession()
  const canKm = can(session, 'vehicles.odometer.record')
  const canLocation = can(session, 'vehicles.location.record')
  const canCorrect = can(session, 'vehicles.history.correct')
  const [modal, setModal] = useState<Modal | null>(null)
  const inMyBranches = (branchId: string | null) => !branchId || session.allBranches || session.branches.some((b) => b.id === branchId)

  const currentKm = history?.odometer.find((o) => o.id === history.currentOdometerId) ?? null
  const currentLoc = history?.locations.find((l) => l.id === history.currentLocationId) ?? null
  const away = currentLoc && (currentLoc.type !== 'branch' || currentLoc.branchId !== v.homeBranchId)

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
              <Gauge size={18} className="text-ink-3" />
              Kilometre
            </h2>
            {canKm && history && (
              <button type="button" onClick={() => setModal({ kind: 'km' })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                <Plus size={15} weight="bold" />
                Kilometre gir
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="mt-4 h-16 animate-pulse rounded-lg bg-line-soft/60" />
          ) : currentKm ? (
            <>
              <p className="tnum mt-3 text-[28px] font-semibold tracking-[-0.02em]">{formatKm(currentKm.km)}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Son okuma {formatDateTime(currentKm.occurredAt)} · {ODOMETER_SOURCE[currentKm.eventType]}
                {currentKm.recordedByName && ` · ${currentKm.recordedByName}`}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[22px] font-semibold text-ink-3">Doğrulanmadı</p>
              <p className="mt-0.5 text-[13px] text-ink-2">Bu araç için geçerli bir kilometre okuması yok.</p>
            </>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
              <MapPin size={18} className="text-ink-3" />
              Konum
            </h2>
            {canLocation && history && (
              <button type="button" onClick={() => setModal({ kind: 'location' })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 font-medium text-ink hover:bg-ground">
                Konumu güncelle
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="mt-4 h-16 animate-pulse rounded-lg bg-line-soft/60" />
          ) : currentLoc ? (
            <>
              <p className="mt-3 text-[22px] font-semibold tracking-[-0.01em]">{placeText(currentLoc)}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {formatDateTime(currentLoc.occurredAt)} tarihinden beri
                {currentLoc.reason && ` · ${currentLoc.reason}`}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[22px] font-semibold text-ink-3">Kayıt yok</p>
              <p className="mt-0.5 text-[13px] text-ink-2">Geçerli bir konum kaydı bulunmuyor.</p>
            </>
          )}
          <p className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3 text-[13px] text-ink-2">
            <Buildings size={15} className="shrink-0 text-ink-3" />
            Ana şube: <span className="font-medium text-ink">{v.homeBranchName}</span>
            {away && <span className="font-medium text-hold">· Ana şube dışında</span>}
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 pb-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Kilometre geçmişi</h2>
          <span className="text-[12.5px] text-ink-2">Güncel değer, düzeltilmemiş en son okumadır</span>
        </div>
        {isLoading ? (
          <div className="mx-5 mb-5 h-24 animate-pulse rounded-lg bg-line-soft/60" />
        ) : !history?.odometer.length ? (
          <p className="px-5 pb-5 text-ink-2">Kilometre kaydı yok. Kilometre doğrulanmadı.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[150px_120px_90px_minmax(0,1fr)_140px_40px] gap-3 border-y border-line bg-ground/50 px-5 py-2.5 text-[12.5px] font-medium text-ink-2 lg:grid">
              <span>Zaman</span>
              <span className="text-right">Kilometre</span>
              <span className="text-right">Fark</span>
              <span>Kaynak ve açıklama</span>
              <span>Giren</span>
              <span />
            </div>
            <ol className="divide-y divide-line-soft border-t border-line lg:border-t-0">
              {history.odometer.map((o) => (
                <li key={o.id} className={cn('grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-5 py-3 lg:grid-cols-[150px_120px_90px_minmax(0,1fr)_140px_40px] lg:items-start', !o.effective && 'bg-ground/40')}>
                  <span className="tnum text-[13px] text-ink-2 lg:text-ink">
                    {formatDateTime(o.occurredAt)}
                    {o.late && <span className="block text-[12px] font-medium text-hold">Geç girildi · {formatDateTime(o.recordedAt)}</span>}
                  </span>
                  <span className={cn('tnum row-span-2 text-right text-[15px] font-semibold lg:row-span-1 lg:text-[13.5px]', !o.effective && 'font-normal text-ink-3 line-through decoration-ink-3/50')}>
                    {formatKm(o.km)}
                    {o.id === history.currentOdometerId && <span className="block text-[11.5px] font-medium text-ok no-underline">Güncel</span>}
                  </span>
                  <span className="tnum hidden text-right text-[13px] text-ink-2 lg:block">{o.deltaKm != null ? (o.deltaKm === 0 ? '0' : `+${nf.format(o.deltaKm)}`) : '—'}</span>
                  <span className="col-span-2 min-w-0 text-[13px] lg:col-span-1">
                    <span className="font-medium">{ODOMETER_SOURCE[o.eventType]}</span>
                    <span className="text-ink-2 lg:hidden">{o.recordedByName && ` · ${o.recordedByName}`}{o.deltaKm != null && o.deltaKm > 0 && ` · +${nf.format(o.deltaKm)} km`}</span>
                    {o.corrects && (
                      <span className="block text-[12.5px] text-ink-2">
                        {formatKm(o.corrects.km)} yerine · {o.corrects.reason}
                      </span>
                    )}
                    {o.note && <span className="block text-[12.5px] text-ink-2">{o.note}</span>}
                    {o.jumpReason && (
                      <span className="block text-[12.5px] text-ink-2">
                        <span className="font-medium text-hold">Büyük artış:</span> {o.jumpReason}
                      </span>
                    )}
                    {o.correction && <CorrectionNote c={o.correction} />}
                  </span>
                  <span className="hidden truncate text-[13px] text-ink-2 lg:block">{o.recordedByName ?? '—'}</span>
                  <span className="hidden lg:block">
                    {canCorrect && o.effective && CORRECTABLE.has(o.sourceType) && <RowMenu label="Kilometre kaydı işlemleri" onCorrect={() => setModal({ kind: 'kmFix', entry: o })} />}
                  </span>
                  {canCorrect && o.effective && CORRECTABLE.has(o.sourceType) && (
                    <button type="button" onClick={() => setModal({ kind: 'kmFix', entry: o })} className="col-span-2 -mx-2 mt-0.5 inline-flex h-9 items-center justify-self-start rounded-md px-2 text-[13px] font-medium text-blue hover:bg-blue-soft lg:hidden">
                      Düzelt
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Konum geçmişi</h2>
          <span className="text-[12.5px] text-ink-2">Canlı GPS değildir · ana şubeyi değiştirmez</span>
        </div>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" />
        ) : !history?.locations.length ? (
          <p className="text-ink-2">Konum kaydı yok.</p>
        ) : (
          <ol className="divide-y divide-line-soft">
            {history.locations.map((l) => {
              const fixable = canCorrect && l.effective && CORRECTABLE.has(l.sourceType) && inMyBranches(l.branchId)
              return (
                <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                  <span className="tnum col-span-2 text-[13px] text-ink-2 sm:col-span-1">
                    {formatDateTime(l.occurredAt)}
                    {l.late && <span className="block text-[12px] font-medium text-hold">Geç girildi · {formatDateTime(l.recordedAt)}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('flex flex-wrap items-center gap-x-2 font-medium', !l.effective && 'font-normal text-ink-3 line-through decoration-ink-3/50')}>
                      {l.type === 'branch' ? <Buildings size={15} className="shrink-0 text-ink-3" /> : l.type === 'service_provider' ? <Wrench size={15} className="shrink-0 text-ink-3" /> : <MapPin size={15} className="shrink-0 text-ink-3" />}
                      {l.branchCode && <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em] no-underline">{l.branchCode}</span>}
                      {placeText(l)}
                      {l.id === history.currentLocationId && <span className="text-[11.5px] font-medium text-ok">Güncel</span>}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-2">
                      {LOCATION_SOURCE[l.eventType]}
                      {l.recordedByName && ` · ${l.recordedByName}`}
                      {l.previous && (
                        <>
                          {' · '}
                          {placeText(l.previous)} <ArrowRight size={11} className="inline text-ink-3" /> {placeText(l)}
                        </>
                      )}
                    </span>
                    {l.corrects && <span className="block text-[12.5px] text-ink-2">{placeText(l.corrects.place)} yerine</span>}
                    {l.reason && l.eventType !== 'correction' && <span className="block text-[12.5px] text-ink-2">Neden: {l.reason}</span>}
                    {l.eventType === 'correction' && l.reason && <span className="block text-[12.5px] text-ink-2">Gerekçe: {l.reason}</span>}
                    {l.correction && <CorrectionNote c={l.correction} />}
                  </span>
                  <span>{fixable && <RowMenu label="Konum kaydı işlemleri" onCorrect={() => setModal({ kind: 'locationFix', entry: l })} />}</span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <p className="flex items-start gap-1.5 text-[13px] text-ink-2">
        <LockSimple size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Kayıtlar silinmez ve değiştirilmez; düzeltmeler gerekçeli yeni kayıt olarak eklenir. Şubeler arası teslim ve transfer ileride Transfer modülüyle gelecek.
      </p>

      {history && modal?.kind === 'km' && <OdometerForm v={v} history={history} onClose={() => setModal(null)} />}
      {history && modal?.kind === 'location' && <LocationForm v={v} history={history} onClose={() => setModal(null)} />}
      {history && modal?.kind === 'kmFix' && <OdometerCorrectForm v={v} history={history} entry={modal.entry} onClose={() => setModal(null)} />}
      {history && modal?.kind === 'locationFix' && <LocationCorrectForm v={v} history={history} entry={modal.entry} onClose={() => setModal(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Forms

function OdometerForm({ v, history, onClose }: { v: VehicleDetail; history: VehicleHistory; onClose: () => void }) {
  const apply = useApplyResult(v.id)
  const requestId = useRef(newRequestId())
  const [km, setKm] = useState('')
  const [at, setAt] = useState(nowInput)
  const [note, setNote] = useState('')
  const [jumpReason, setJumpReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const onError = useErrorHandler(v.id, setErrors, setMessage)

  const kmNum = /^\d+$/.test(km.replace(/\D/g, '')) && km.trim() !== '' ? Number(km.replace(/\D/g, '')) : null
  const atIso = fromInput(at)?.iso ?? null
  const n = atIso ? odometerNeighbours(history.odometer, atIso) : { previous: null, next: null }
  const problem = kmNum != null ? odometerOrderProblem(kmNum, n) : null
  const jump = kmNum != null && atIso && !problem ? largeJump(n.previous, kmNum, atIso) : null
  const late = atIso ? isLateEntry(atIso) : false
  const current = currentOf(history.odometer)
  const backdated = !!(atIso && current && atIso < current.occurredAt)

  const save = useMutation({
    mutationFn: () => {
      const e: Record<string, string> = {}
      if (kmNum == null) e.km = 'Kilometre girin'
      else if (problem === 'below_previous') e.km = `Önceki okumadan (${formatKm(n.previous!.km)}) düşük olamaz`
      else if (problem === 'above_next') e.km = `Sonraki okumadan (${formatKm(n.next!.km)}) yüksek olamaz`
      if (!atIso) e.occurredAt = 'Tarih ve saat girin'
      else if (isInFuture(atIso)) e.occurredAt = 'Gelecekteki bir zaman girilemez'
      if (late && !note.trim()) e.note = '48 saatten eski kayıtlarda açıklama girin'
      if (jump && jumpReason.trim().length < 5) e.largeJumpReason = 'Gerekçe en az 5 karakter olmalı'
      setErrors(e)
      if (Object.keys(e).length) return Promise.reject(new Error('validation'))
      setMessage(null)
      return historyApi.recordOdometer(v.id, {
        km: kmNum,
        occurredAt: atIso,
        note: note.trim() || undefined,
        largeJumpReason: jump ? jumpReason.trim() : undefined,
        expectedVersion: history.odometerVersion,
        clientRequestId: requestId.current,
      })
    },
    onSuccess: (r) => {
      apply(r)
      toast(r.becameCurrent ? `Kilometre kaydedildi: ${formatKm(kmNum!)}.` : 'Okuma geçmişe eklendi; güncel kilometre değişmedi.')
      onClose()
    },
    onError,
  })

  return (
    <Sheet title="Kilometre gir" subtitle={`${v.plate} · yeni okuma ayrı kayıt olur; eski okumalar değişmez.`} onClose={onClose} footer={<FormFooter pending={save.isPending} onClose={onClose} />}>
      <form id="history-form" className="space-y-4" noValidate onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        {message && <Banner tone="alert">{message}</Banner>}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-ground/50 px-3.5 py-3 text-[13px]">
          <span>
            <span className="block text-ink-2">Güncel kilometre</span>
            <span className="tnum font-semibold">{current ? formatKm(current.km) : 'Doğrulanmadı'}</span>
          </span>
          <span>
            <span className="block text-ink-2">Okuma zamanı</span>
            <span className="tnum font-medium">{current ? formatDateTime(current.occurredAt) : '—'}</span>
          </span>
        </div>
        <Field id="km" label="Kilometre" required error={errors.km} hint={n.previous || n.next ? `Bu zaman için izinli aralık: ${n.previous ? formatKm(n.previous.km) : '0 km'} – ${n.next ? formatKm(n.next.km) : 'üst sınır yok'}` : undefined}>
          <Input {...describe('km', errors.km, true)} inputMode="numeric" autoComplete="off" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Örn. 48950" autoFocus />
        </Field>
        {problem && !errors.km && (
          <Banner tone="alert">
            {problem === 'below_previous'
              ? `Bu değer ${formatDateTime(n.previous!.occurredAt)} tarihli ${formatKm(n.previous!.km)} okumasından düşük. Kilometre geriye gidemez; önceki okuma hatalıysa onu düzeltin.`
              : `Bu değer daha sonraki ${formatDateTime(n.next!.occurredAt)} tarihli ${formatKm(n.next!.km)} okumasından yüksek.`}
          </Banner>
        )}
        <Field id="occurredAt" label="Okuma zamanı" required error={errors.occurredAt} hint={<TimeZoneHint value={at} base="Göstergenin okunduğu an; gelecek bir zaman girilemez." />}>
          <Input {...describe('occurredAt', errors.occurredAt, true)} type="datetime-local" value={at} max={nowInput()} onChange={(e) => setAt(e.target.value)} />
        </Field>
        {backdated && <Banner tone="info">Bu okuma geçmişe eklenecek. Daha yeni bir okuma olduğu için güncel kilometre değişmeyecek.</Banner>}
        {jump && (
          <div className="space-y-3 rounded-lg border border-hold/30 bg-hold-soft px-3.5 py-3">
            <p className="flex items-start gap-2 text-[13px]">
              <Warning size={16} weight="fill" className="mt-px shrink-0 text-hold" />
              <span>
                Bu okuma bir öncekinden <b className="tnum">{formatKm(jump.deltaKm)}</b> fazla (günlük ortalama {formatKm(jump.perDay)}). Doğruysa gerekçe girerek onaylayın.
              </span>
            </p>
            <Field id="largeJumpReason" label="Artış gerekçesi" required error={errors.largeJumpReason}>
              <Input {...describe('largeJumpReason', errors.largeJumpReason)} value={jumpReason} onChange={(e) => setJumpReason(e.target.value)} placeholder="Örn. uzun dönem kiralamadan döndü" />
            </Field>
          </div>
        )}
        <Field id="note" label="Açıklama" required={late} error={errors.note} hint={late ? 'Okuma 48 saatten eski; neden geç girildiğini yazın.' : 'İsteğe bağlı.'}>
          <Textarea {...describe('note', errors.note, true)} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

function LocationFields({
  type,
  setType,
  branchId,
  setBranchId,
  description,
  setDescription,
  errors,
  prefix = '',
}: {
  type: ManualLocationType
  setType: (t: ManualLocationType) => void
  branchId: string
  setBranchId: (v: string) => void
  description: string
  setDescription: (v: string) => void
  errors: Record<string, string>
  prefix?: string
}) {
  const session = useSession()
  return (
    <>
      <Choice
        name={`${prefix}type`}
        label="Araç nerede?"
        value={type}
        onChange={setType}
        options={[
          ['branch', 'Şubede', session.allBranches ? 'Şirketin herhangi bir şubesi' : 'Yetkili olduğunuz şubeler'],
          ['service_provider', 'Serviste', 'Servis veya bakım yeri'],
        ]}
      />
      {type === 'branch' ? (
        <Field id={`${prefix}branchId`} label="Şube" required error={errors.branchId} hint={session.allBranches ? undefined : 'Yalnız yetkili olduğunuz şubeler listelenir.'}>
          <Select {...describe(`${prefix}branchId`, errors.branchId, !session.allBranches)} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Seçin</option>
            {session.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field id={`${prefix}description`} label="Servis / yer adı" required error={errors.description}>
          <Input {...describe(`${prefix}description`, errors.description)} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Örn. Auto Servis Ilidža" maxLength={120} />
        </Field>
      )}
    </>
  )
}

function LocationForm({ v, history, onClose }: { v: VehicleDetail; history: VehicleHistory; onClose: () => void }) {
  const apply = useApplyResult(v.id)
  const requestId = useRef(newRequestId())
  const [type, setType] = useState<ManualLocationType>('branch')
  const [branchId, setBranchId] = useState('')
  const [description, setDescription] = useState('')
  const [at, setAt] = useState(nowInput)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const onError = useErrorHandler(v.id, setErrors, setMessage)
  const atIso = fromInput(at)?.iso ?? null
  const current = currentOf(history.locations)
  const backdated = !!(atIso && current && atIso < current.occurredAt)

  const save = useMutation({
    mutationFn: () => {
      const e: Record<string, string> = {}
      if (type === 'branch' && !branchId) e.branchId = 'Şube seçin'
      if (type === 'service_provider' && !description.trim()) e.description = 'Servisin veya yerin adını girin'
      if (!atIso) e.occurredAt = 'Tarih ve saat girin'
      else if (isInFuture(atIso)) e.occurredAt = 'Gelecekteki bir zaman girilemez'
      if (reason.trim().length < 3) e.reason = 'Değişiklik nedenini yazın'
      setErrors(e)
      if (Object.keys(e).length) return Promise.reject(new Error('validation'))
      setMessage(null)
      return historyApi.recordLocation(v.id, {
        locationType: type,
        branchId: type === 'branch' ? branchId : undefined,
        description: type === 'service_provider' ? description.trim() : undefined,
        reason: reason.trim(),
        occurredAt: atIso,
        expectedVersion: history.locationVersion,
        clientRequestId: requestId.current,
      })
    },
    onSuccess: (r) => {
      apply(r)
      toast(r.becameCurrent ? 'Konum kaydedildi.' : 'Konum geçmişe eklendi; güncel konum değişmedi.')
      onClose()
    },
    onError,
  })

  return (
    <Sheet title="Konumu güncelle" subtitle={`${v.plate} · aracın şu an fiziksel olarak bulunduğu yer.`} onClose={onClose} footer={<FormFooter pending={save.isPending} onClose={onClose} />}>
      <form id="history-form" className="space-y-4" noValidate onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        {message && <Banner tone="alert">{message}</Banner>}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-ground/50 px-3.5 py-3 text-[13px]">
          <span className="min-w-0">
            <span className="block text-ink-2">Şu an</span>
            <span className="block truncate font-semibold">{current ? placeText(current) : 'Kayıt yok'}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-ink-2">Ana şube</span>
            <span className="block truncate font-medium">{v.homeBranchName}</span>
          </span>
        </div>
        <LocationFields type={type} setType={setType} branchId={branchId} setBranchId={setBranchId} description={description} setDescription={setDescription} errors={errors} />
        <Field id="occurredAt" label="Ne zamandan beri" required error={errors.occurredAt} hint={<TimeZoneHint value={at} base="Gelecek bir zaman girilemez." />}>
          <Input {...describe('occurredAt', errors.occurredAt, true)} type="datetime-local" value={at} max={nowInput()} onChange={(e) => setAt(e.target.value)} />
        </Field>
        {backdated && <Banner tone="info">Bu kayıt geçmişe eklenecek. Daha yeni bir konum kaydı olduğu için güncel konum değişmeyecek.</Banner>}
        <Field id="reason" label="Değişiklik nedeni" required error={errors.reason}>
          <Input {...describe('reason', errors.reason)} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. servise bırakıldı, sayımda bu şubede bulundu" maxLength={300} />
        </Field>
        <Banner tone="info">
          Bu bir konum kaydıdır, transfer değildir. Ana şube (<b className="font-medium text-ink">{v.homeBranchName}</b>) değişmez. Şubeler arası teslim ve transfer ileride Transfer modülünden yapılacak.
        </Banner>
      </form>
    </Sheet>
  )
}

function OdometerCorrectForm({ v, history, entry, onClose }: { v: VehicleDetail; history: VehicleHistory; entry: OdometerEntry; onClose: () => void }) {
  const apply = useApplyResult(v.id)
  const requestId = useRef(newRequestId())
  const [action, setAction] = useState<'replace' | 'void'>('replace')
  const [km, setKm] = useState('')
  const [reason, setReason] = useState('')
  const [jumpReason, setJumpReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const onError = useErrorHandler(v.id, setErrors, setMessage)
  const n = odometerNeighbours(history.odometer, entry.occurredAt, entry.id)
  const kmNum = km.trim() !== '' && /^\d+$/.test(km.replace(/\D/g, '')) ? Number(km.replace(/\D/g, '')) : null
  const problem = action === 'replace' && kmNum != null ? odometerOrderProblem(kmNum, n) : null
  const jump = action === 'replace' && kmNum != null && !problem ? largeJump(n.previous, kmNum, entry.occurredAt) : null

  const save = useMutation({
    mutationFn: () => {
      const e: Record<string, string> = {}
      if (action === 'replace') {
        if (kmNum == null) e.km = 'Doğru kilometreyi girin'
        else if (kmNum === entry.km) e.km = 'Yeni değer eskisiyle aynı'
        else if (problem) e.km = `İzinli aralık dışında (${n.previous ? formatKm(n.previous.km) : '0 km'} – ${n.next ? formatKm(n.next.km) : 'üst sınır yok'})`
        if (jump && jumpReason.trim().length < 5) e.largeJumpReason = 'Gerekçe en az 5 karakter olmalı'
      }
      if (reason.trim().length < 5) e.reason = 'Gerekçe en az 5 karakter olmalı'
      setErrors(e)
      if (Object.keys(e).length) return Promise.reject(new Error('validation'))
      setMessage(null)
      return historyApi.correctOdometer(v.id, entry.id, {
        action,
        km: action === 'replace' ? kmNum : undefined,
        reason: reason.trim(),
        largeJumpReason: jump ? jumpReason.trim() : undefined,
        expectedVersion: history.odometerVersion,
        clientRequestId: requestId.current,
      })
    },
    onSuccess: (r) => {
      apply(r)
      toast(action === 'replace' ? 'Kilometre kaydı düzeltildi; eski değer geçmişte gerekçesiyle duruyor.' : 'Okuma hatalı sayıldı; geçmişte gerekçesiyle duruyor.')
      onClose()
    },
    onError,
  })

  return (
    <Sheet title="Kilometre kaydını düzelt" subtitle="Hatalı kayıt silinmez; geçmişte üstü çizili ve gerekçesiyle görünür." onClose={onClose} footer={<FormFooter pending={save.isPending} onClose={onClose} label="Düzeltmeyi kaydet" />}>
      <form id="history-form" className="space-y-4" noValidate onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        {message && <Banner tone="alert">{message}</Banner>}
        <div className="rounded-lg border border-line bg-ground/50 px-3.5 py-3 text-[13px]">
          <span className="block text-ink-2">Düzeltilecek kayıt</span>
          <span className="tnum block font-semibold">{formatKm(entry.km)}</span>
          <span className="block text-ink-2">
            {formatDateTime(entry.occurredAt)} · {ODOMETER_SOURCE[entry.eventType]}
            {entry.recordedByName && ` · ${entry.recordedByName}`}
          </span>
        </div>
        <Choice
          name="action"
          label="Ne yapılacak?"
          value={action}
          onChange={setAction}
          options={[
            ['replace', 'Doğru değeri gir', 'Aynı zaman için doğru kilometre'],
            ['void', 'Hatalı say', 'Yerine değer girilmez'],
          ]}
        />
        {action === 'replace' && (
          <Field id="fixKm" label="Doğru kilometre" required error={errors.km} hint={`İzinli aralık: ${n.previous ? formatKm(n.previous.km) : '0 km'} – ${n.next ? formatKm(n.next.km) : 'üst sınır yok'}`}>
            <Input {...describe('fixKm', errors.km, true)} inputMode="numeric" autoComplete="off" value={km} onChange={(e) => setKm(e.target.value)} />
          </Field>
        )}
        {jump && (
          <div className="space-y-3 rounded-lg border border-hold/30 bg-hold-soft px-3.5 py-3">
            <p className="flex items-start gap-2 text-[13px]">
              <Warning size={16} weight="fill" className="mt-px shrink-0 text-hold" />
              <span>
                Yeni değer bir önceki okumadan <b className="tnum">{formatKm(jump.deltaKm)}</b> fazla. Doğruysa gerekçe girin.
              </span>
            </p>
            <Field id="largeJumpReason" label="Artış gerekçesi" required error={errors.largeJumpReason}>
              <Input {...describe('largeJumpReason', errors.largeJumpReason)} value={jumpReason} onChange={(e) => setJumpReason(e.target.value)} />
            </Field>
          </div>
        )}
        <Field id="reason" label="Düzeltme gerekçesi" required error={errors.reason}>
          <Textarea {...describe('reason', errors.reason)} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. gösterge yanlış okundu" maxLength={300} />
        </Field>
      </form>
    </Sheet>
  )
}

function LocationCorrectForm({ v, history, entry, onClose }: { v: VehicleDetail; history: VehicleHistory; entry: LocationEntry; onClose: () => void }) {
  const apply = useApplyResult(v.id)
  const requestId = useRef(newRequestId())
  const [action, setAction] = useState<'replace' | 'void'>('replace')
  const [type, setType] = useState<ManualLocationType>('branch')
  const [branchId, setBranchId] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const onError = useErrorHandler(v.id, setErrors, setMessage)

  const save = useMutation({
    mutationFn: () => {
      const e: Record<string, string> = {}
      if (action === 'replace') {
        if (type === 'branch' && !branchId) e.branchId = 'Şube seçin'
        if (type === 'service_provider' && !description.trim()) e.description = 'Servisin veya yerin adını girin'
      }
      if (reason.trim().length < 5) e.reason = 'Gerekçe en az 5 karakter olmalı'
      setErrors(e)
      if (Object.keys(e).length) return Promise.reject(new Error('validation'))
      setMessage(null)
      return historyApi.correctLocation(v.id, entry.id, {
        action,
        locationType: action === 'replace' ? type : undefined,
        branchId: action === 'replace' && type === 'branch' ? branchId : undefined,
        description: action === 'replace' && type === 'service_provider' ? description.trim() : undefined,
        reason: reason.trim(),
        expectedVersion: history.locationVersion,
        clientRequestId: requestId.current,
      })
    },
    onSuccess: (r) => {
      apply(r)
      toast('Konum kaydı düzeltildi; eski kayıt geçmişte gerekçesiyle duruyor.')
      onClose()
    },
    onError,
  })

  return (
    <Sheet title="Konum kaydını düzelt" subtitle="Hatalı kayıt silinmez; geçmişte üstü çizili ve gerekçesiyle görünür." onClose={onClose} footer={<FormFooter pending={save.isPending} onClose={onClose} label="Düzeltmeyi kaydet" />}>
      <form id="history-form" className="space-y-4" noValidate onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        {message && <Banner tone="alert">{message}</Banner>}
        <div className="rounded-lg border border-line bg-ground/50 px-3.5 py-3 text-[13px]">
          <span className="block text-ink-2">Düzeltilecek kayıt</span>
          <span className="block font-semibold">{placeText(entry)}</span>
          <span className="block text-ink-2">
            {formatDateTime(entry.occurredAt)} · {LOCATION_SOURCE[entry.eventType]}
            {entry.recordedByName && ` · ${entry.recordedByName}`}
          </span>
        </div>
        <Choice
          name="action"
          label="Ne yapılacak?"
          value={action}
          onChange={setAction}
          options={[
            ['replace', 'Doğru konumu gir', 'Aynı zaman için doğru yer'],
            ['void', 'Hatalı say', 'Yerine konum girilmez'],
          ]}
        />
        {action === 'replace' && (
          <LocationFields type={type} setType={setType} branchId={branchId} setBranchId={setBranchId} description={description} setDescription={setDescription} errors={errors} prefix="fix-" />
        )}
        <Field id="reason" label="Düzeltme gerekçesi" required error={errors.reason}>
          <Textarea {...describe('reason', errors.reason)} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. yanlış şube seçilmiş" maxLength={300} />
        </Field>
      </form>
    </Sheet>
  )
}
