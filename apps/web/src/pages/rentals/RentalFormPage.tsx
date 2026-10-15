import type { CorporateListItem, CustomerListItem, RentalDetail } from '@acarvo/shared'
import { ArrowLeft, Buildings, Info, ShieldCheck, SpinnerGap, Star, Trash, WarningCircle } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { describe, Field, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, corporateApi, rentalsApi, vehiclesApi } from '@/lib/api'
import { PERSON_ROLE_LABELS } from '@/lib/corporate-labels'
import { formatDuration, formatLocal, NOT_CHECKED_LABELS } from '@/lib/reservation-labels'
import { can, useSession } from '@/session'
import { AccountSearch, Chip, PersonSearch, Section, TimeField, useDebounced, VehicleOption } from '../reservations/ReservationFormPage'
import { RentalStatusBadge } from './RentalParts'

type Person = Pick<CustomerListItem, 'id' | 'customerNo' | 'displayName' | 'phone' | 'email'>
type Account = Pick<CorporateListItem, 'id' | 'accountNo' | 'legalName'>

interface FormState {
  customer: Person | null
  account: Account | null
  drivers: (Person & { isPrimary: boolean })[]
  pickupBranchId: string
  returnBranchId: string
  pickupLocal: string
  returnLocal: string
  pickupChoice?: 'earlier' | 'later'
  returnChoice?: 'earlier' | 'later'
  vehicleClassId: string
  vehicleId: string
  note: string
}

/** Next full hour in the browser and two days later: a sensible walk-in default the user changes anyway. */
const defaultTimes = () => {
  const d = new Date(Date.now() + 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
  const ret = new Date(d.getTime() + 2 * 86_400_000)
  return { pickupLocal: `${day(d)}T${pad(d.getHours())}:00`, returnLocal: `${day(ret)}T${pad(d.getHours())}:00` }
}

function stateFrom(r: RentalDetail): FormState {
  const person = (p: RentalDetail['customer']): Person => ({ id: p.id, customerNo: p.customerNo, displayName: p.displayName, phone: p.phone, email: p.email })
  return {
    customer: person(r.customer),
    account: r.corporateAccount,
    drivers: r.drivers.map((d) => ({ ...person(d), isPrimary: d.isPrimary })),
    pickupBranchId: r.pickupBranch.id,
    returnBranchId: r.returnBranch.id,
    pickupLocal: r.plannedPickup.local,
    returnLocal: r.plannedReturn.local,
    vehicleClassId: r.vehicleClass.id,
    vehicleId: r.vehicle.id,
    note: r.note ?? '',
  }
}

/** Yeni kiralama (doğrudan, spec §10.2) / Kiralamayı düzenle (yalnız teslim bekleyen). The server decides and re-checks. */
export function RentalFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams({ strict: false }) as { rentalId?: string }
  const session = useSession()
  const existing = useQuery({ queryKey: ['rental', session.company?.id, params.rentalId], queryFn: () => rentalsApi.get(params.rentalId!), enabled: mode === 'edit', retry: false })
  if (mode === 'edit') {
    if (existing.isError) return <ErrorState message={existing.error.message} onRetry={() => existing.refetch()} />
    if (!existing.data) return <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Kiralama yükleniyor" />
    if (existing.data.status !== 'prepared') {
      return (
        <StatePanel icon={Info} title="Bu kiralama düzenlenemez">
          <p>Teslim edilmiş, kapanmış veya iptal edilmiş kiralamanın aracı, sürücüleri ve planı değişmez. Aktif kiralamada yalnız iade zamanı uzatılabilir.</p>
        </StatePanel>
      )
    }
    return <RentalForm key={existing.data.version} mode="edit" existing={existing.data} />
  }
  return <RentalForm mode="create" />
}

function RentalForm({ mode, existing }: { mode: 'create' | 'edit'; existing?: RentalDetail }) {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const zone = session.company?.timezone
  const branches = useQuery({ queryKey: ['rental-branches', session.company?.id], queryFn: () => rentalsApi.branches() })
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: () => vehiclesApi.classes() })
  const initial = useMemo<FormState>(() => {
    if (existing) return stateFrom(existing)
    const first = session.branches[0]?.id ?? ''
    return { customer: null, account: null, drivers: [], pickupBranchId: first, returnBranchId: first, ...defaultTimes(), vehicleClassId: '', vehicleId: '', note: '' }
  }, [existing, session.branches])
  const [f, setF] = useState<FormState>(initial)
  // One id per form: a resent create (double click, lost answer) returns the same rental.
  const [requestId] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<RentalDetail | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<FormState>) => {
    setF((x) => ({ ...x, ...patch }))
    setErrors((e) => {
      const drop = Object.keys(patch).flatMap((k) => (k === 'customer' ? ['customerId'] : k === 'drivers' ? ['drivers'] : k === 'pickupLocal' ? ['pickupLocal', 'pickupChoice'] : k === 'returnLocal' ? ['returnLocal', 'returnChoice'] : k === 'vehicleClassId' ? ['vehicleClassId', 'vehicleId'] : [k]))
      if (!drop.some((k) => k in e)) return e
      return Object.fromEntries(Object.entries(e).filter(([k]) => !drop.includes(k)))
    })
  }
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
    excludeRentalId: existing?.id,
  }
  const probe = useDebounced(planBody, 350)
  const ready = !!(probe.vehicleClassId && probe.pickupBranchId && probe.returnBranchId && probe.pickupLocal && probe.returnLocal)
  const avail = useQuery({ queryKey: ['rental-availability', session.company?.id, probe], queryFn: () => rentalsApi.availability(probe), enabled: ready, retry: false, placeholderData: keepPreviousData })
  const availError = avail.error instanceof ApiRequestError ? avail.error : null
  const selectedVehicle = avail.data?.vehicles.find((v) => v.id === f.vehicleId)
  const durationMinutes = avail.data && !availError ? Math.round((Date.parse(avail.data.return.at) - Date.parse(avail.data.pickup.at)) / 60_000) : null
  useEffect(() => {
    if (avail.data && f.vehicleId && !avail.data.vehicles.some((v) => v.id === f.vehicleId)) set({ vehicleId: '' })
  }, [avail.data, f.vehicleId])

  const accountPeople = useQuery({ queryKey: ['corporate-people', session.company?.id, f.account?.id], queryFn: () => corporateApi.people(f.account!.id), enabled: !!f.account && can(session, 'customers.read') })
  const activePeople = (accountPeople.data?.items ?? []).filter((p) => p.active)
  const warnings: string[] = []
  if (f.account && accountPeople.data) {
    for (const d of f.drivers) if (!activePeople.some((p) => p.customer.id === d.id && p.roles.includes('authorized_driver'))) warnings.push(`${d.displayName} hesabın yetkili sürücüsü olarak kayıtlı değil.`)
  }
  if (selectedVehicle?.atOtherBranch) warnings.push(`${selectedVehicle.plate} başka bir şubeye kayıtlı; teslimden önce aracın yerini kontrol edin.`)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        customerId: f.customer?.id,
        corporateAccountId: f.account?.id,
        drivers: f.drivers.map((d) => ({ customerId: d.id, isPrimary: d.isPrimary })),
        vehicleClassId: f.vehicleClassId,
        vehicleId: f.vehicleId,
        pickupBranchId: f.pickupBranchId,
        returnBranchId: f.returnBranchId,
        pickupLocal: f.pickupLocal,
        returnLocal: f.returnLocal,
        pickupChoice: f.pickupChoice,
        returnChoice: f.returnChoice,
        note: f.note,
      }
      return mode === 'create' ? rentalsApi.create({ ...body, requestId }) : rentalsApi.update(existing!.id, { ...body, version: conflict?.version ?? existing!.version })
    },
    onSuccess: (r) => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['rentals'] })
      void qc.invalidateQueries({ queryKey: ['reservation-timeline'] })
      qc.setQueryData(['rental', session.company?.id, r.id], r)
      toast(mode === 'create' ? `${r.rentalNo} hazırlandı; teslim bekliyor.` : `${r.rentalNo} güncellendi.`)
      setTimeout(() => navigate({ to: '/kiralamalar/$rentalId', params: { rentalId: r.id } }), 0)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      if (e.code === 'VERSION_CONFLICT') return setConflict((e.details as { current: RentalDetail }).current)
      setErrors(e.fields ?? {})
      setServerError(e.message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    const next: Record<string, string> = {}
    if (!f.customer) next.customerId = 'Müşteri seçin'
    if (!f.drivers.some((d) => d.isPrimary)) next.drivers = 'Ana sürücüyü seçin'
    if (!f.vehicleClassId) next.vehicleClassId = 'Araç sınıfını seçin'
    if (!f.vehicleId) next.vehicleId = 'Belirli bir araç seçin: kiralama yalnız sınıfla tutulmaz'
    if (!f.pickupBranchId) next.pickupBranchId = 'Başlangıç şubesini seçin'
    if (!f.returnBranchId) next.returnBranchId = 'İade şubesini seçin'
    setErrors(next)
    setServerError(Object.keys(next).length ? 'Eksik alanları tamamlayın.' : null)
    if (!Object.keys(next).length) save.mutate()
  }

  const back = existing ? (
    <Link to="/kiralamalar/$rentalId" params={{ rentalId: existing.id }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      {existing.rentalNo}
    </Link>
  ) : (
    <Link to="/kiralamalar" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Kiralamalar
    </Link>
  )

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{mode === 'create' ? 'Yeni kiralama' : 'Kiralamayı düzenle'}</h1>
        {existing && <RentalStatusBadge status={existing.status} />}
      </div>
      {mode === 'create' && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-2">
          <Info size={16} className="mt-px shrink-0 text-ink-3" />
          Rezervasyonsuz (doğrudan) kiralama. Onaylı bir rezervasyon varsa Rezervasyon 360° ekranından “Kiralamaya dönüştür” kullanın; böylece rezervasyon ve kiralama bağlı kalır.
        </p>
      )}
      {conflict && (
        <div role="alert" className="rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-3 text-[13px]">
          <p className="font-medium text-ink">Bu kiralama siz düzenlerken {conflict.updatedByName ?? 'başka bir kullanıcı'} tarafından güncellendi.</p>
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
          <Section n={1} id="sec-customer" title="Müşteri" hint="Mevcut müşteri kaydı kullanılır; aynı kişi için ikinci kayıt açılmaz.">
            {f.customer ? (
              <Chip title={f.customer.displayName} sub={[f.customer.customerNo, f.customer.phone, f.customer.email].filter(Boolean).join(' · ')} onClear={() => set({ customer: null })} clearLabel="Müşteriyi değiştir" />
            ) : (
              <PersonSearch id="customer-search" label="Müşteri" allowCreate onPick={(p) => set({ customer: p, drivers: f.drivers.length ? f.drivers : [{ ...p, isPrimary: true }] })} />
            )}
            {errors.customerId && <p className="text-[13px] text-alert">{errors.customerId}</p>}
          </Section>

          <Section n={2} id="sec-account" title="Kurumsal hesap" hint="İsteğe bağlı. Kurumsal ilişki belge kontrolünü kaldırmaz.">
            {f.account ? (
              <Chip title={f.account.legalName} sub={f.account.accountNo} onClear={() => set({ account: null })} clearLabel="Kurumsal hesabı kaldır" />
            ) : can(session, 'corporate.read') ? (
              <AccountSearch onPick={(a) => set({ account: a })} />
            ) : (
              <p className="text-[13px] text-ink-2">Kurumsal hesapları görme yetkiniz yok.</p>
            )}
            {f.account && activePeople.length > 0 && (
              <ul className="divide-y divide-line-soft rounded-lg border border-line">
                {activePeople.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{p.customer.displayName}</span>
                      <span className="ml-1.5 text-ink-2">{p.roles.map((r) => PERSON_ROLE_LABELS[r]).join(', ')}</span>
                    </span>
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
            )}
          </Section>

          <Section n={3} id="sec-drivers" title="Sürücüler" hint="Tam bir ana sürücü ve en fazla 5 ek sürücü. Ödeme yapan kişi kendiliğinden sürücü sayılmaz. Belge kararı kiralama açıldıktan sonra her sürücü için ayrı verilir.">
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
            {f.drivers.length < 6 && <PersonSearch id="driver-search" label={f.drivers.length ? 'Ek sürücü ekle' : 'Ana sürücü ekle'} exclude={f.drivers.map((d) => d.id)} onPick={(p) => set({ drivers: [...f.drivers, { ...p, isPrimary: !f.drivers.length }] })} />}
            {errors.drivers && <p className="text-[13px] text-alert">{errors.drivers}</p>}
          </Section>

          <Section n={4} id="sec-plan" title="Plan" hint="Planlanan alış ve iade; gerçek teslim ve iade zamanları işlem anında ayrıca kaydedilir. Saatler şubenin yerel saatidir.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pickupBranchId" label="Başlangıç şubesi" required error={errors.pickupBranchId}>
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
              <Field id="returnBranchId" label="Planlanan iade şubesi" required error={errors.returnBranchId}>
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
              <TimeField id="pickupLocal" label="Planlanan alış" value={f.pickupLocal} onChange={(v) => set({ pickupLocal: v, pickupChoice: undefined })} branch={pickupBranch} choice={f.pickupChoice} onChoice={(c) => set({ pickupChoice: c })} error={errors.pickupLocal ?? errors.pickupChoice} />
              <TimeField id="returnLocal" label="Planlanan iade" value={f.returnLocal} onChange={(v) => set({ returnLocal: v, returnChoice: undefined })} branch={returnBranch} choice={f.returnChoice} onChoice={(c) => set({ returnChoice: c })} error={errors.returnLocal ?? errors.returnChoice} />
            </div>
            {pickupBranch && !pickupBranch.country && (
              <p className="flex items-start gap-1.5 rounded-lg bg-hold-soft px-3 py-2 text-[12.5px] text-ink">
                <WarningCircle size={14} className="mt-[2px] shrink-0 text-hold" />
                Bu şubenin ülkesi tanımlı değil. Kiralama hazırlanabilir, ancak belge kuralı ülkeye göre uygulandığı için ülke girilmeden teslim yapılamaz.
              </p>
            )}
          </Section>

          <Section n={5} id="sec-vehicle" title="Araç" hint="Kiralama belirli bir araçla açılır. Uygunluk rezervasyonlarla aynı kuraldan gelir; kayıtta sunucu yeniden denetler.">
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
                ) : avail.data.vehicles.length === 0 ? (
                  <p className="text-[13px] text-ink-2">Bu sınıfta yetki alanınızda araç yok.</p>
                ) : (
                  <>
                    {avail.data.vehicles.map((v) => (
                      <VehicleOption key={v.id} v={v} zone={zone} selected={f.vehicleId === v.id} onSelect={() => set({ vehicleId: v.id })} />
                    ))}
                    <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                      <ShieldCheck size={14} className="mt-[2px] shrink-0 text-ink-3" />
                      Uygunluk araç durumu, onaylı rezervasyonlar, kiralamalar, bakımlar, hasar engelleri ve transferlere göre denetlendi. Henüz denetlenemeyen: {avail.data.notChecked.map((k) => NOT_CHECKED_LABELS[k]).join(', ')}.
                    </p>
                  </>
                )}
                {errors.vehicleId && <p className="text-[13px] text-alert">{errors.vehicleId}</p>}
              </div>
            )}
          </Section>

          <Section n={6} id="sec-notes" title="Not">
            <Field id="note" label="Not" error={errors.note} hint="Operasyon için kısa not. Kimlik, ehliyet veya kart numarası yazmayın.">
              <Textarea rows={3} {...describe('note', errors.note, true)} value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
          </Section>
        </div>

        <aside aria-label="Kiralama özeti" className="space-y-4 lg:sticky lg:top-4">
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
                  ['Araç', selectedVehicle ? `${selectedVehicle.plate} · ${selectedVehicle.make} ${selectedVehicle.model}` : '—'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-2">{k}</dt>
                  <dd className="tnum min-w-0 text-right font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2.5">
                <dt className="text-ink-2">Fiyat</dt>
                <dd className="text-right text-[12.5px] text-ink-2">Hesaplanmadı</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-2">Sözleşme</dt>
                <dd className="text-right text-[12.5px] text-ink-2">ACARVO’da yok</dd>
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
            <button type="submit" disabled={save.isPending} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60">
              {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
              {mode === 'create' ? 'Kiralamayı hazırla' : 'Değişiklikleri kaydet'}
            </button>
            <p className="mt-2 text-center text-[12px] text-ink-3">Kiralama “Teslim bekliyor” olarak açılır; araç bu dönem için ayrılır. Teslim ayrı bir adımdır.</p>
          </section>
          {f.account && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
              <Buildings size={14} className="mt-[2px] shrink-0 text-ink-3" />
              Kurumsal kredi limiti, muafiyet politikası ve fatura Finans modülüyle gelecek.
            </p>
          )}
        </aside>
      </div>
    </form>
  )
}
