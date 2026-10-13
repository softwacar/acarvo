import {
  type AvailabilityVehicle,
  type CorporateListItem,
  type CustomerListItem,
  RESERVATION_CHANGE_REASONS,
  RESERVATION_SOURCES,
  type ReservationBranch,
  type ReservationChangeReason,
  type ReservationDetail,
  type ReservationSource,
  resolveWallTime,
} from '@acarvo/shared'
import { ArrowLeft, Buildings, Car, CheckCircle, Info, MagnifyingGlass, ShieldCheck, SpinnerGap, Star, Trash, UserPlus, WarningCircle, X } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, corporateApi, customersApi, reservationsApi, vehiclesApi } from '@/lib/api'
import { PERSON_ROLE_LABELS } from '@/lib/corporate-labels'
import { CHANGE_REASON_LABELS, formatDuration, formatLocal, NOT_CHECKED_LABELS, RESERVATION_SOURCE_LABELS } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { CustomerFormSheet } from '../customers/CustomerForm'
import { StatusBadge } from './ReservationParts'

type Person = Pick<CustomerListItem, 'id' | 'customerNo' | 'displayName' | 'phone' | 'email'>
type Account = Pick<CorporateListItem, 'id' | 'accountNo' | 'legalName'>

interface FormState {
  customer: Person | null
  account: Account | null
  booker: Person | null
  drivers: (Person & { isPrimary: boolean })[]
  pickupBranchId: string
  returnBranchId: string
  pickupLocal: string
  returnLocal: string
  pickupChoice?: 'earlier' | 'later'
  returnChoice?: 'earlier' | 'later'
  vehicleClassId: string
  vehicleId: string
  source: ReservationSource | ''
  note: string
  confirm: boolean
  changeReason: ReservationChangeReason | ''
}

const defaultTimes = () => {
  const d = new Date(Date.now() + 86_400_000)
  const day = d.toISOString().slice(0, 10)
  const ret = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  return { pickupLocal: `${day}T10:00`, returnLocal: `${ret}T10:00` }
}

function stateFrom(r: ReservationDetail): FormState {
  const person = (p: ReservationDetail['customer']): Person => ({ id: p.id, customerNo: p.customerNo, displayName: p.displayName, phone: p.phone, email: p.email })
  return {
    customer: person(r.customer),
    account: r.corporateAccount,
    booker: r.booker ? person(r.booker) : null,
    drivers: r.drivers.map((d) => ({ ...person(d), isPrimary: d.isPrimary })),
    pickupBranchId: r.pickupBranch.id,
    returnBranchId: r.returnBranch.id,
    pickupLocal: r.pickup.local,
    returnLocal: r.return.local,
    vehicleClassId: r.vehicleClass.id,
    vehicleId: r.vehicle?.id ?? '',
    source: r.source,
    note: r.note ?? '',
    confirm: false,
    changeReason: '',
  }
}

function Section({ n, title, hint, children, id }: { n: number; title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5">
      <h2 id={id} className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
        <span aria-hidden className="tnum grid size-6 place-items-center rounded-full bg-ground text-[12px] font-semibold text-ink-2">
          {n}
        </span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-[12.5px] text-ink-2">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Search the company's customers (body request: names never reach a URL) and pick one. */
function PersonSearch({ id, label, onPick, exclude = [], allowCreate }: { id: string; label: string; onPick: (p: Person) => void; exclude?: string[]; allowCreate?: boolean }) {
  const session = useSession()
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 250)
  const [creating, setCreating] = useState(false)
  const results = useQuery({ queryKey: ['customers', session.company?.id, 'reservation-pick', q], queryFn: () => customersApi.search({ q, status: 'active', pageSize: 25 }), enabled: q.length >= 2, placeholderData: keepPreviousData })
  return (
    <div>
      <Field id={id} label={label}>
        <div className="relative">
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input id={id} type="search" autoComplete="off" placeholder="Ad, müşteri no, telefon veya e-posta" value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
        </div>
      </Field>
      {q.length >= 2 && (
        <div className="mt-2 rounded-lg border border-line" aria-live="polite">
          {!results.data ? (
            <p className="p-3 text-[13px] text-ink-2">Aranıyor…</p>
          ) : results.data.items.length === 0 ? (
            <p className="p-3 text-[13px] text-ink-2">Bu aramaya uyan etkin müşteri yok.</p>
          ) : (
            <ul aria-label={`${label}: sonuçlar`} className="max-h-[260px] divide-y divide-line-soft overflow-y-auto">
              {results.data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={exclude.includes(c.id)}
                    onClick={() => {
                      onPick(c)
                      setText('')
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-ground disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{c.displayName}</span>
                      <span className="tnum block truncate text-[12.5px] text-ink-2">{[c.customerNo, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium text-blue">{exclude.includes(c.id) ? 'Eklendi' : 'Seç'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {allowCreate && can(session, 'customers.manage') && (
        <button type="button" onClick={() => setCreating(true)} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
          <UserPlus size={15} />
          Yeni müşteri kaydı aç
        </button>
      )}
      {creating && <CustomerFormSheet mode="create" onClose={() => setCreating(false)} onSaved={(c) => onPick(c)} />}
    </div>
  )
}

function Chip({ title, sub, onClear, clearLabel }: { title: string; sub?: string; onClear?: () => void; clearLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-blue/35 bg-blue-soft/25 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{title}</p>
        {sub && <p className="tnum truncate text-[12.5px] text-ink-2">{sub}</p>}
      </div>
      {onClear && (
        <button type="button" onClick={onClear} aria-label={clearLabel} className="grid size-8 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-surface hover:text-ink">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

function AccountSearch({ onPick }: { onPick: (a: Account) => void }) {
  const session = useSession()
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 250)
  const results = useQuery({ queryKey: ['corporate-accounts', session.company?.id, 'reservation-pick', q], queryFn: () => corporateApi.search({ q, pageSize: 25 }), enabled: q.length >= 2, placeholderData: keepPreviousData })
  return (
    <div>
      <Field id="account-search" label="Kurumsal hesap (isteğe bağlı)">
        <div className="relative">
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input id="account-search" type="search" autoComplete="off" placeholder="Unvan, hesap no veya vergi kimliği" value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
        </div>
      </Field>
      {q.length >= 2 && (
        <div className="mt-2 rounded-lg border border-line" aria-live="polite">
          {!results.data ? (
            <p className="p-3 text-[13px] text-ink-2">Aranıyor…</p>
          ) : results.data.items.length === 0 ? (
            <p className="p-3 text-[13px] text-ink-2">Bu aramaya uyan etkin kurumsal hesap yok.</p>
          ) : (
            <ul aria-label="Kurumsal hesap sonuçları" className="max-h-[220px] divide-y divide-line-soft overflow-y-auto">
              {results.data.items.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onPick(a)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-ground">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{a.legalName}</span>
                      <span className="tnum block text-[12.5px] text-ink-2">{a.accountNo}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium text-blue">Seç</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Wall-time check in the branch's zone (R4): never happened → error; happened twice → explicit choice. */
function TimeField({ id, label, value, onChange, branch, choice, onChoice, error }: { id: string; label: string; value: string; onChange: (v: string) => void; branch?: ReservationBranch; choice?: 'earlier' | 'later'; onChoice: (c?: 'earlier' | 'later') => void; error?: string }) {
  const res = branch && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? resolveWallTime(value, branch.timeZone) : null
  const own = res?.kind === 'nonexistent' ? `${formatLocal(value)} ${branch!.name} saatinde yaşanmadı: yaz saatine geçişte saatler ileri alındı. Gerçek saati girin.` : undefined
  const shownError = error ?? own
  return (
    <div>
      <Field id={id} label={label} required error={shownError} hint={branch ? `${branch.name} yerel saati (${branch.timeZone})` : undefined}>
        <Input type="datetime-local" step={300} {...describe(id, shownError, !!branch)} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
      {res?.kind === 'ambiguous' && (
        <fieldset className="mt-2 rounded-lg border border-hold/35 bg-hold-soft px-3 py-2.5 text-[13px]">
          <legend className="sr-only">Hangi saat?</legend>
          <p className="font-medium text-ink">Bu saat kış saatine geçişte iki kez yaşanıyor. Hangisi?</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {(['earlier', 'later'] as const).map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${id}-choice`} checked={choice === c} onChange={() => onChoice(c)} className="accent-[var(--ac-blue)]" />
                {c === 'earlier' ? 'İlki (yaz saati)' : 'İkincisi (kış saati)'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

function VehicleOption({ v, selected, onSelect, zone }: { v: AvailabilityVehicle; selected: boolean; onSelect: () => void; zone?: string }) {
  void zone
  const disabled = !v.available
  return (
    <label className={cn('flex min-h-14 items-start gap-3 rounded-lg border px-3 py-2.5', selected ? 'border-blue/45 bg-blue-soft/30' : 'border-line', disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-ground')}>
      <input type="radio" name="vehicle" checked={selected} disabled={disabled} onChange={onSelect} className="mt-1 accent-[var(--ac-blue)]" />
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-ground text-ink-3">
        <Car size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="tnum block font-medium text-ink">{v.plate}</span>
        <span className="block truncate text-[12.5px] text-ink-2">
          {v.make} {v.model} · {v.homeBranch.code}
          {v.atOtherBranch && ' · farklı şube'}
        </span>
        {v.status !== 'active' ? (
          <span className="block text-[12.5px] font-medium text-alert">Hizmet dışı</span>
        ) : v.conflicts.length ? (
          <span className="block text-[12.5px] font-medium text-alert">Dolu: {v.conflicts.map((c) => c.reservationNo).join(', ')}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ok">
            <CheckCircle size={13} weight="fill" /> Seçili dönemde onaylı rezervasyonu yok
          </span>
        )}
      </span>
    </label>
  )
}

/** Yeni rezervasyon / Rezervasyonu düzenle (spec §9.2). One form for both; the server decides and re-checks. */
export function ReservationFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams({ strict: false }) as { reservationId?: string }
  const session = useSession()
  const existing = useQuery({ queryKey: ['reservation', session.company?.id, params.reservationId], queryFn: () => reservationsApi.get(params.reservationId!), enabled: mode === 'edit', retry: false })
  if (mode === 'edit') {
    if (existing.isError) return <ErrorState message={existing.error.message} onRetry={() => existing.refetch()} />
    if (!existing.data) return <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Rezervasyon yükleniyor" />
    if (existing.data.status !== 'pending' && existing.data.status !== 'confirmed') {
      return (
        <StatePanel icon={Info} title="Bu rezervasyon değiştirilemez">
          <p>İptal edilmiş veya Gelmedi olarak işaretlenmiş rezervasyonlar geçmiş kaydı olarak korunur.</p>
        </StatePanel>
      )
    }
    return <ReservationForm key={existing.data.version} mode="edit" existing={existing.data} />
  }
  return <ReservationForm mode="create" />
}

function ReservationForm({ mode, existing }: { mode: 'create' | 'edit'; existing?: ReservationDetail }) {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const zone = session.company?.timezone
  const branches = useQuery({ queryKey: ['reservation-branches', session.company?.id], queryFn: () => reservationsApi.branches() })
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: () => vehiclesApi.classes() })
  const initial = useMemo<FormState>(() => {
    if (existing) return stateFrom(existing)
    const first = session.branches[0]?.id ?? ''
    return { customer: null, account: null, booker: null, drivers: [], pickupBranchId: first, returnBranchId: first, ...defaultTimes(), vehicleClassId: '', vehicleId: '', source: '', note: '', confirm: false, changeReason: '' }
  }, [existing, session.branches])
  const [f, setF] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  /** Form key → error keys it answers; a changed field drops its stale message. */
  const ERROR_KEYS: Partial<Record<keyof FormState, string[]>> = {
    customer: ['customerId'],
    account: ['corporateAccountId'],
    booker: ['bookerCustomerId'],
    pickupBranchId: ['pickupBranchId'],
    returnBranchId: ['returnBranchId'],
    pickupLocal: ['pickupLocal', 'pickupChoice'],
    returnLocal: ['returnLocal', 'returnChoice'],
    pickupChoice: ['pickupChoice'],
    returnChoice: ['returnChoice'],
    vehicleClassId: ['vehicleClassId', 'vehicleId'],
    vehicleId: ['vehicleId'],
    source: ['source'],
    note: ['note'],
    changeReason: ['changeReason'],
  }
  const set = (patch: Partial<FormState>) => {
    setF((x) => ({ ...x, ...patch }))
    const drop = Object.keys(patch).flatMap((k) => ERROR_KEYS[k as keyof FormState] ?? [])
    if (drop.length) {
      setErrors((e) => {
        if (!drop.some((k) => k in e)) return e
        const next = Object.fromEntries(Object.entries(e).filter(([k]) => !drop.includes(k)))
        if (!Object.keys(next).length) setServerError(null)
        return next
      })
    }
  }
  const [conflict, setConflict] = useState<ReservationDetail | null>(null)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useBlocker({ shouldBlockFn: () => dirty && !saved && !window.confirm('Girdiğiniz bilgiler kaydedilmedi. Sayfadan çıkılsın mı?') })

  const branchList = branches.data?.items ?? []
  const pickupBranch = branchList.find((b) => b.id === f.pickupBranchId)
  const returnBranch = branchList.find((b) => b.id === f.returnBranchId)
  const planBody = {
    vehicleClassId: f.vehicleClassId,
    pickupBranchId: f.pickupBranchId,
    returnBranchId: f.returnBranchId,
    pickupLocal: f.pickupLocal,
    returnLocal: f.returnLocal,
    pickupChoice: f.pickupChoice,
    returnChoice: f.returnChoice,
    excludeReservationId: existing?.id,
  }
  const probe = useDebounced(planBody, 350)
  const ready = !!(probe.vehicleClassId && probe.pickupBranchId && probe.returnBranchId && probe.pickupLocal && probe.returnLocal)
  const avail = useQuery({ queryKey: ['reservation-availability', session.company?.id, probe], queryFn: () => reservationsApi.availability(probe), enabled: ready, retry: false, placeholderData: keepPreviousData })
  const availError = avail.error instanceof ApiRequestError ? avail.error : null
  const selectedVehicle = avail.data?.vehicles.find((v) => v.id === f.vehicleId)
  const durationMinutes = avail.data && !availError ? Math.round((Date.parse(avail.data.return.at) - Date.parse(avail.data.pickup.at)) / 60_000) : null

  // A changed class drops a vehicle of another class.
  useEffect(() => {
    if (avail.data && f.vehicleId && !avail.data.vehicles.some((v) => v.id === f.vehicleId)) set({ vehicleId: '' })
  }, [avail.data, f.vehicleId])

  const accountPeople = useQuery({ queryKey: ['corporate-people', session.company?.id, f.account?.id], queryFn: () => corporateApi.people(f.account!.id), enabled: !!f.account && can(session, 'customers.read') })
  const activePeople = (accountPeople.data?.items ?? []).filter((p) => p.active)
  const scheduleChanged =
    !!existing &&
    (f.pickupLocal !== existing.pickup.local || f.returnLocal !== existing.return.local || f.pickupBranchId !== existing.pickupBranch.id || f.returnBranchId !== existing.returnBranch.id || f.vehicleClassId !== existing.vehicleClass.id || f.vehicleId !== (existing.vehicle?.id ?? ''))
  const needReason = existing?.status === 'confirmed' && scheduleChanged
  const canConfirm = can(session, 'reservations.confirm')

  const warnings: string[] = []
  if (!f.drivers.length) warnings.push('Sürücü eklenmedi; kiralama öncesi gerekecek.')
  if (f.account && accountPeople.data) {
    for (const d of f.drivers) if (!activePeople.some((p) => p.customer.id === d.id && p.roles.includes('authorized_driver'))) warnings.push(`${d.displayName} hesabın yetkili sürücüsü değil.`)
    if (f.booker && !activePeople.some((p) => p.customer.id === f.booker!.id)) warnings.push('Rezervasyonu yapan kişi hesapta kayıtlı değil.')
  }
  if (selectedVehicle?.atOtherBranch) warnings.push(`${selectedVehicle.plate} başka bir şubeye kayıtlı.`)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        customerId: f.customer?.id,
        corporateAccountId: f.account?.id,
        bookerCustomerId: f.booker?.id,
        drivers: f.drivers.map((d) => ({ customerId: d.id, isPrimary: d.isPrimary })),
        vehicleClassId: f.vehicleClassId,
        vehicleId: f.vehicleId || undefined,
        pickupBranchId: f.pickupBranchId,
        returnBranchId: f.returnBranchId,
        pickupLocal: f.pickupLocal,
        returnLocal: f.returnLocal,
        pickupChoice: f.pickupChoice,
        returnChoice: f.returnChoice,
        source: f.source,
        note: f.note,
      }
      return mode === 'create'
        ? reservationsApi.create({ ...body, confirm: f.confirm || undefined })
        : reservationsApi.update(existing!.id, { ...body, version: conflict?.version ?? existing!.version, changeReason: needReason ? f.changeReason : undefined })
    },
    onSuccess: (r) => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['reservations'] })
      void qc.invalidateQueries({ queryKey: ['reservation-timeline'] })
      qc.setQueryData(['reservation', session.company?.id, r.id], r)
      toast(mode === 'create' ? `${r.reservationNo} oluşturuldu (${r.status === 'confirmed' ? 'onaylı' : 'bekleyen'}).` : `${r.reservationNo} güncellendi.`)
      setTimeout(() => navigate({ to: '/rezervasyonlar/$reservationId', params: { reservationId: r.id } }), 0)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      if (e.code === 'VERSION_CONFLICT') return setConflict((e.details as { current: ReservationDetail }).current)
      setErrors(e.fields ?? {})
      setServerError(e.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    const next: Record<string, string> = {}
    if (!f.customer) next.customerId = 'Müşteri seçin'
    if (!f.vehicleClassId) next.vehicleClassId = 'Araç sınıfını seçin'
    if (!f.source) next.source = 'Rezervasyon kaynağını seçin'
    if (!f.pickupBranchId) next.pickupBranchId = 'Alış şubesini seçin'
    if (!f.returnBranchId) next.returnBranchId = 'İade şubesini seçin'
    if (needReason && !f.changeReason) next.changeReason = 'Değişiklik gerekçesini seçin'
    if (f.confirm && !f.vehicleId) next.vehicleId = 'Onay için belirli bir araç seçin'
    setErrors(next)
    setServerError(Object.keys(next).length ? 'Eksik alanları tamamlayın.' : null)
    if (!Object.keys(next).length) save.mutate()
  }

  const back = existing ? (
    <Link to="/rezervasyonlar/$reservationId" params={{ reservationId: existing.id }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      {existing.reservationNo}
    </Link>
  ) : (
    <Link to="/rezervasyonlar" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Rezervasyonlar
    </Link>
  )

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{mode === 'create' ? 'Yeni rezervasyon' : 'Rezervasyonu düzenle'}</h1>
        {existing && <StatusBadge status={existing.status} />}
      </div>
      {conflict && (
        <div role="alert" className="rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-3 text-[13px]">
          <p className="font-medium text-ink">Bu rezervasyon siz düzenlerken {conflict.updatedByName ?? 'başka bir kullanıcı'} tarafından güncellendi.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setF(stateFrom(conflict))} className="h-8 rounded-md border border-line bg-surface px-3 font-medium hover:bg-ground">
              Güncel bilgileri yükle
            </button>
            <button type="submit" className="h-8 rounded-md px-3 font-medium text-hold hover:bg-surface">
              Benim değişikliklerimi kaydet
            </button>
          </div>
        </div>
      )}
      {serverError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {serverError}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Section n={1} id="sec-customer" title="Müşteri" hint="Rezervasyon bir kişiyle çalışır; kişinin bilgileri kopyalanmaz.">
            {f.customer ? (
              <Chip title={f.customer.displayName} sub={[f.customer.customerNo, f.customer.phone, f.customer.email].filter(Boolean).join(' · ')} onClear={() => set({ customer: null })} clearLabel="Müşteriyi değiştir" />
            ) : (
              <PersonSearch id="customer-search" label="Müşteri" allowCreate onPick={(p) => set({ customer: p, drivers: f.drivers.length ? f.drivers : [{ ...p, isPrimary: true }] })} />
            )}
            {errors.customerId && <p className="text-[13px] text-alert">{errors.customerId}</p>}
            <p className="flex items-start gap-2 rounded-lg bg-ground/70 px-3 py-2.5 text-[12.5px] text-ink-2">
              <Info size={14} className="mt-[2px] shrink-0 text-ink-3" />
              Rezervasyon oluşturulabilir. Eksik belgeler kiralama başlamadan önce tamamlanmalıdır.
            </p>
          </Section>

          <Section n={2} id="sec-account" title="Kurumsal bağlam" hint="İsteğe bağlı. Kurumsal hesap ayrı ticari taraftır; kişinin kaydına gömülmez.">
            {f.account ? (
              <Chip title={f.account.legalName} sub={f.account.accountNo} onClear={() => set({ account: null, booker: null })} clearLabel="Kurumsal hesabı kaldır" />
            ) : can(session, 'corporate.read') ? (
              <AccountSearch onPick={(a) => set({ account: a })} />
            ) : (
              <p className="text-[13px] text-ink-2">Kurumsal hesapları görme yetkiniz yok.</p>
            )}
            {f.account && activePeople.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink">Hesabın kişileri</p>
                <ul className="divide-y divide-line-soft rounded-lg border border-line">
                  {activePeople.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-ink">{p.customer.displayName}</span>
                        <span className="ml-1.5 text-ink-2">{p.roles.map((r) => PERSON_ROLE_LABELS[r]).join(', ')}</span>
                      </span>
                      <button type="button" onClick={() => set({ booker: p.customer })} className="h-8 rounded-md px-2 font-medium text-blue hover:bg-ground">
                        Rezervasyonu yapan
                      </button>
                      <button
                        type="button"
                        disabled={f.drivers.some((d) => d.id === p.customer.id)}
                        onClick={() => set({ drivers: [...f.drivers, { ...p.customer, isPrimary: !f.drivers.length }] })}
                        className="h-8 rounded-md px-2 font-medium text-blue hover:bg-ground disabled:text-ink-3"
                      >
                        Sürücü ekle
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink">Rezervasyonu yapan kişi</p>
              {f.booker ? (
                <Chip title={f.booker.displayName} sub={f.booker.customerNo} onClear={() => set({ booker: null })} clearLabel="Rezervasyonu yapan kişiyi kaldır" />
              ) : (
                <PersonSearch id="booker-search" label="Rezervasyonu yapan (isteğe bağlı)" onPick={(p) => set({ booker: p })} />
              )}
            </div>
          </Section>

          <Section n={3} id="sec-drivers" title="Sürücüler" hint="Ana sürücü ve ek sürücüler müşteri kayıtlarından seçilir. Sürücü uygunluğu (yaş, ehliyet) Kiralamalar modülünde değerlendirilecek.">
            {f.drivers.length > 0 && (
              <ul className="divide-y divide-line-soft rounded-lg border border-line">
                {f.drivers.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{d.displayName}</span>
                      <span className="tnum ml-1.5 text-[12.5px] text-ink-2">{d.customerNo}</span>
                    </span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                      <input type="radio" name="primary-driver" checked={d.isPrimary} onChange={() => set({ drivers: f.drivers.map((x) => ({ ...x, isPrimary: x.id === d.id })) })} className="accent-[var(--ac-blue)]" />
                      {d.isPrimary ? (
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          <Star size={12} weight="fill" /> Ana sürücü
                        </span>
                      ) : (
                        'Ana sürücü yap'
                      )}
                    </label>
                    <button type="button" aria-label={`${d.displayName} sürücüsünü kaldır`} onClick={() => set({ drivers: f.drivers.filter((x) => x.id !== d.id) })} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-alert-soft hover:text-alert">
                      <Trash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {f.drivers.length < 6 && <PersonSearch id="driver-search" label={f.drivers.length ? 'Ek sürücü ekle' : 'Sürücü ekle'} exclude={f.drivers.map((d) => d.id)} onPick={(p) => set({ drivers: [...f.drivers, { ...p, isPrimary: !f.drivers.length }] })} />}
          </Section>

          <Section n={4} id="sec-plan" title="Kiralama planı" hint="Saatler şubenin yerel saatiyle girilir; alış ve iade şubeleri farklı saat dilimlerinde olabilir.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pickupBranchId" label="Alış şubesi" required error={errors.pickupBranchId}>
                <Select {...describe('pickupBranchId', errors.pickupBranchId)} value={f.pickupBranchId} onChange={(e) => set({ pickupBranchId: e.target.value, pickupChoice: undefined })}>
                  <option value="">Seçin</option>
                  {branchList
                    .filter((b) => b.inScope)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field id="returnBranchId" label="İade şubesi" required error={errors.returnBranchId}>
                <Select {...describe('returnBranchId', errors.returnBranchId)} value={f.returnBranchId} onChange={(e) => set({ returnBranchId: e.target.value, returnChoice: undefined })}>
                  <option value="">Seçin</option>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TimeField id="pickupLocal" label="Alış tarih ve saati" value={f.pickupLocal} onChange={(v) => set({ pickupLocal: v, pickupChoice: undefined })} branch={pickupBranch} choice={f.pickupChoice} onChoice={(c) => set({ pickupChoice: c })} error={errors.pickupLocal ?? errors.pickupChoice} />
              <TimeField id="returnLocal" label="İade tarih ve saati" value={f.returnLocal} onChange={(v) => set({ returnLocal: v, returnChoice: undefined })} branch={returnBranch} choice={f.returnChoice} onChoice={(c) => set({ returnChoice: c })} error={errors.returnLocal ?? errors.returnChoice} />
            </div>
            {f.pickupBranchId && f.returnBranchId && f.pickupBranchId !== f.returnBranchId && <p className="text-[12.5px] text-ink-2">Farklı şubeye iade (one-way). Ücret etkisi Fiyatlandırma modülüyle gelecek.</p>}
          </Section>

          <Section n={5} id="sec-vehicle" title="Araç" hint="Belirli araç seçerseniz onaylı rezervasyon yapılabilir. Yalnız sınıf seçilen rezervasyon bekleyen kalır.">
            <Field id="vehicleClassId" label="Araç sınıfı" required error={errors.vehicleClassId}>
              <Select {...describe('vehicleClassId', errors.vehicleClassId)} value={f.vehicleClassId} onChange={(e) => set({ vehicleClassId: e.target.value, vehicleId: '' })}>
                <option value="">Seçin</option>
                {classes.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {f.vehicleClassId && (
              <div role="radiogroup" aria-label="Araç seçimi" className="space-y-2">
                {availError ? (
                  <p className="text-[13px] text-alert">{availError.fields ? Object.values(availError.fields)[0] : availError.message}</p>
                ) : !avail.data ? (
                  <div className="h-20 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
                ) : (
                  <>
                    <label className={cn('flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5', !f.vehicleId ? 'border-blue/45 bg-blue-soft/30' : 'border-line hover:bg-ground')}>
                      <input type="radio" name="vehicle" checked={!f.vehicleId} onChange={() => set({ vehicleId: '', confirm: false })} className="mt-1 accent-[var(--ac-blue)]" />
                      <span>
                        <span className="block font-medium text-ink">Yalnız sınıf (araç sonra atanır)</span>
                        <span className="block text-[12.5px] text-ink-2">
                          Bilgi: sınıfta {avail.data.classSummary.activeVehicles} etkin araç, bu dönemde {avail.data.classSummary.overlappingConfirmed} onaylı rezervasyon. Kesin kapasite değildir; bu rezervasyon bekleyen kalır.
                        </span>
                      </span>
                    </label>
                    {avail.data.vehicles.map((v) => (
                      <VehicleOption key={v.id} v={v} zone={zone} selected={f.vehicleId === v.id} onSelect={() => set({ vehicleId: v.id })} />
                    ))}
                    <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                      <ShieldCheck size={14} className="mt-[2px] shrink-0 text-ink-3" />
                      Uygunluk yalnız araç durumu ve onaylı rezervasyonlara göre denetlendi. Henüz denetlenemeyen: {avail.data.notChecked.map((k) => NOT_CHECKED_LABELS[k]).join(', ')}.
                    </p>
                    <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                      <Info size={14} className="mt-[2px] shrink-0 text-ink-3" />
                      Rezervasyonlar arasında hazırlık süresi bırakılmaz: bir rezervasyonun bittiği anda başlayan rezervasyon kabul edilir. Bu, aracın temizlenmiş, kontrol edilmiş veya teslime hazır olduğu anlamına gelmez; hazırlık, temizlik, hasar ve teslim kontrolleri Teslim/İade modülüyle gelecek.
                    </p>
                  </>
                )}
                {errors.vehicleId && <p className="text-[13px] text-alert">{errors.vehicleId}</p>}
              </div>
            )}
          </Section>

          <Section n={6} id="sec-notes" title="Kaynak ve not">
            <Field id="source" label="Rezervasyon kaynağı" required error={errors.source}>
              <Select {...describe('source', errors.source)} value={f.source} onChange={(e) => set({ source: e.target.value as ReservationSource })}>
                <option value="">Seçin</option>
                {RESERVATION_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {RESERVATION_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="note" label="Not" error={errors.note} hint="Operasyon için kısa not. Kimlik veya kart numarası yazmayın.">
              <Textarea rows={3} {...describe('note', errors.note, true)} value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            {needReason && (
              <Field id="changeReason" label="Değişiklik gerekçesi" required error={errors.changeReason} hint="Onaylı rezervasyonun tarih, şube, sınıf veya aracı değişiyor; uygunluk yeniden denetlenir.">
                <Select {...describe('changeReason', errors.changeReason, true)} value={f.changeReason} onChange={(e) => set({ changeReason: e.target.value as ReservationChangeReason })}>
                  <option value="">Seçin</option>
                  {RESERVATION_CHANGE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {CHANGE_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Section>
        </div>

        <aside aria-label="Rezervasyon özeti" className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[15px] font-semibold">Özet</h2>
            <dl className="mt-3 space-y-2.5 text-[13.5px]">
              {(
                [
                  ['Müşteri', f.customer?.displayName ?? '—'],
                  ['Kurumsal', f.account ? f.account.legalName : '—'],
                  ['Sürücüler', f.drivers.length ? `${f.drivers.length} kişi` : '—'],
                  ['Alış', f.pickupLocal ? `${formatLocal(f.pickupLocal)} · ${pickupBranch?.code ?? ''}` : '—'],
                  ['İade', f.returnLocal ? `${formatLocal(f.returnLocal)} · ${returnBranch?.code ?? ''}` : '—'],
                  ['Süre', durationMinutes !== null && durationMinutes > 0 ? formatDuration(durationMinutes) : '—'],
                  ['Araç', selectedVehicle ? `${selectedVehicle.plate} · ${selectedVehicle.make} ${selectedVehicle.model}` : f.vehicleClassId ? `${classes.data?.items.find((c) => c.id === f.vehicleClassId)?.name ?? ''} · araç atanmadı` : '—'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-2">{k}</dt>
                  <dd className="tnum min-w-0 text-right font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2.5">
                <dt className="text-ink-2">Fiyat</dt>
                <dd className="text-right text-[12.5px] text-ink-2">Hesaplanmadı · Fiyatlandırma modülüyle gelecek</dd>
              </div>
            </dl>
            {warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 text-[12.5px] text-hold">
                    <WarningCircle size={14} className="mt-[2px] shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {mode === 'create' && canConfirm && (
              <label className={cn('mt-4 flex items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-[13.5px]', selectedVehicle?.available ? 'cursor-pointer' : 'opacity-60')}>
                <input type="checkbox" disabled={!selectedVehicle?.available} checked={f.confirm && !!selectedVehicle?.available} onChange={(e) => set({ confirm: e.target.checked })} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
                <span>
                  <span className="font-medium text-ink">Onaylı olarak oluştur</span>
                  <span className="block text-[12.5px] text-ink-2">{selectedVehicle?.available ? 'Onay yalnız araç ve zaman ayırmasıdır; uygunluk kayıtta yeniden denetlenir. Fiyat, ödeme, sözleşme veya kiralama oluşturulmaz.' : 'Onay için uygun bir araç seçin.'}</span>
                </span>
              </label>
            )}
            <button type="submit" disabled={save.isPending} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60">
              {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
              {mode === 'create' ? 'Rezervasyon oluştur' : 'Değişiklikleri kaydet'}
            </button>
            {mode === 'create' && <p className="mt-2 text-center text-[12px] text-ink-3">{f.confirm ? 'Onaylı olarak kaydedilecek.' : 'Bekleyen olarak kaydedilecek; bekleyen rezervasyon aracı tutmaz.'}</p>}
          </section>
          {f.account && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
              <Buildings size={14} className="mt-[2px] shrink-0 text-ink-3" />
              Kurumsal kredi limiti ve muafiyet politikası Finans ve Kiralama modülleriyle gelecek.
            </p>
          )}
        </aside>
      </div>
    </form>
  )
}
