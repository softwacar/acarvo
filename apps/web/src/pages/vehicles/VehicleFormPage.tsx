import {
  ACQUISITION_TYPES,
  CURRENCIES,
  FUEL_TYPES,
  TRANSMISSIONS,
  vehicleCreateSchema,
  vehicleInputSchema,
  type VehicleDetail,
} from '@acarvo/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowsClockwise, Buildings, Info, LockSimple, SpinnerGap, Truck, WarningCircle } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { type FieldErrors, type Resolver, useForm } from 'react-hook-form'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ErrorState, ForbiddenState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, vehiclesApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ACQUISITION_LABELS, FUEL_LABELS, formatDateTime, formatKm, LOCATION_LABELS, STATUS_LABELS, TRANSMISSION_LABELS } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { listSearchToReturnTo } from './search'

/** Every input is held as text; the shared schema turns it into the API shape on both sides. */
interface FormValues {
  plate: string
  vehicleCode: string
  make: string
  model: string
  trim: string
  modelYear: string
  classId: string
  color: string
  vin: string
  fuelType: string
  transmission: string
  seats: string
  homeBranchId: string
  status: string
  acquisitionType: string
  acquisitionDate: string
  acquisitionSeller: string
  acquisitionCost: string
  acquisitionCurrency: string
  acquisitionReference: string
  notes: string
  initialOdometerKm: string
  initialLocationBranchId: string
}

const FIELD_LABELS: Record<keyof FormValues, string> = {
  plate: 'Plaka',
  vehicleCode: 'Araç kodu',
  make: 'Marka',
  model: 'Model',
  trim: 'Donanım / paket',
  modelYear: 'Model yılı',
  classId: 'Araç sınıfı',
  color: 'Renk',
  vin: 'Şasi numarası (VIN)',
  fuelType: 'Yakıt',
  transmission: 'Vites',
  seats: 'Koltuk sayısı',
  homeBranchId: 'Ana şube',
  status: 'Kullanım durumu',
  acquisitionType: 'Edinim türü',
  acquisitionDate: 'Edinim tarihi',
  acquisitionSeller: 'Satıcı / kiralayan',
  acquisitionCost: 'Edinim tutarı',
  acquisitionCurrency: 'Para birimi',
  acquisitionReference: 'Fatura / sözleşme no',
  notes: 'Notlar',
  initialOdometerKm: 'Başlangıç kilometresi',
  initialLocationBranchId: 'Başlangıç konumu',
}

const toText = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const costText = (v: string | null) => (v ? v.replace('.', ',') : '')

function valuesFrom(v: VehicleDetail): FormValues {
  return {
    plate: v.plate,
    vehicleCode: toText(v.vehicleCode),
    make: v.make,
    model: v.model,
    trim: toText(v.trim),
    modelYear: toText(v.modelYear),
    classId: v.classId,
    color: toText(v.color),
    vin: toText(v.vin),
    fuelType: v.fuelType,
    transmission: v.transmission,
    seats: toText(v.seats),
    homeBranchId: v.homeBranchId,
    status: v.status,
    acquisitionType: toText(v.acquisitionType),
    acquisitionDate: toText(v.acquisitionDate),
    acquisitionSeller: toText(v.acquisitionSeller),
    acquisitionCost: costText(v.acquisitionCost),
    acquisitionCurrency: toText(v.acquisitionCurrency),
    acquisitionReference: toText(v.acquisitionReference),
    notes: toText(v.notes),
    initialOdometerKm: '',
    initialLocationBranchId: '',
  }
}

function Section({ title, description, children, aside }: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function ReadOnlyFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 font-medium">
        {label}
        <LockSimple size={13} className="text-ink-3" aria-label="salt okunur" />
      </div>
      <div className="flex min-h-10 items-center rounded-lg border border-dashed border-line bg-ground/50 px-3 text-ink-2">{children}</div>
    </div>
  )
}

interface ConflictState {
  current: VehicleDetail
  pending: Record<string, unknown>
}

/** Araç ekle / düzenle (spec §13.2). One page, grouped sections, server-validated. */
export function VehicleFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const session = useSession()
  const params = useParams({ strict: false }) as { vehicleId?: string }
  const vehicleId = mode === 'edit' ? params.vehicleId! : undefined
  const permission = mode === 'create' ? 'vehicles.create' : 'vehicles.update'
  const vehicle = useQuery({ queryKey: ['vehicle', session.company?.id, vehicleId], queryFn: () => vehiclesApi.get(vehicleId!), enabled: !!vehicleId })
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: vehiclesApi.classes })

  if (!can(session, permission)) {
    return <ForbiddenState message={mode === 'create' ? 'Araç ekleme yetkiniz yok.' : 'Araç düzenleme yetkiniz yok.'} />
  }
  if (vehicle.isError) {
    const e = vehicle.error
    return e instanceof ApiRequestError && e.status === 404 ? (
      <StatePanel icon={WarningCircle} title="Araç bulunamadı">
        <p>{e.message}</p>
        <Link to="/araclar" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
          Araçlara dön
        </Link>
      </StatePanel>
    ) : (
      <ErrorState message={e.message} onRetry={() => vehicle.refetch()} />
    )
  }
  if ((mode === 'edit' && !vehicle.data) || !classes.data) {
    return (
      <div aria-busy="true" aria-label="Form yükleniyor" className="space-y-4">
        <div className="h-9 w-64 animate-pulse rounded bg-line-soft" />
        <div className="h-72 animate-pulse rounded-xl bg-line-soft/70" />
      </div>
    )
  }
  return <VehicleForm key={vehicle.data?.version ?? 'new'} mode={mode} vehicle={vehicle.data} classes={classes.data.items} />
}

function VehicleForm({ mode, vehicle, classes }: { mode: 'create' | 'edit'; vehicle?: VehicleDetail; classes: { id: string; name: string }[] }) {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<{ message: string; link?: { id: string; plate: string } } | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [version, setVersion] = useState(vehicle?.version ?? 1)
  const [saved, setSaved] = useState(false)

  const defaults = useMemo<FormValues>(
    () =>
      vehicle
        ? valuesFrom(vehicle)
        : {
            ...Object.fromEntries(Object.keys(FIELD_LABELS).map((k) => [k, ''])),
            status: 'active',
            homeBranchId: session.branches.length === 1 ? session.branches[0]!.id : '',
            acquisitionCurrency: '',
          } as unknown as FormValues,
    [vehicle, session.branches],
  )
  const form = useForm<FormValues>({
    resolver: zodResolver(mode === 'create' ? vehicleCreateSchema : vehicleInputSchema) as unknown as Resolver<FormValues>,
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const { register, handleSubmit, formState, watch, setError, reset } = form
  const errors = formState.errors as FieldErrors<FormValues>
  const err = (k: keyof FormValues) => errors[k]?.message as string | undefined

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mode === 'create' ? vehiclesApi.create(body) : vehiclesApi.update(vehicle!.id, { ...body, version: body.version ?? version }),
    onSuccess: async (v) => {
      setSaved(true)
      qc.removeQueries({ queryKey: ['vehicles'] })
      qc.setQueryData(['vehicle', session.company?.id, v.id], v)
      toast(mode === 'create' ? `${v.plate} filoya eklendi.` : `${v.plate} kaydedildi.`)
      // A new vehicle may not match the previous filters, so show it directly; edits return to where the user was.
      await navigate({ to: '/araclar', search: mode === 'create' ? { q: v.plate } : listSearchToReturnTo() })
    },
    onError: (e, body) => {
      if (!(e instanceof ApiRequestError)) return setServerError({ message: 'Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.' })
      if (e.code === 'VERSION_CONFLICT') {
        const current = (e.details as { current: VehicleDetail }).current
        return setConflict({ current, pending: body })
      }
      for (const [k, m] of Object.entries(e.fields ?? {})) setError(k as keyof FormValues, { type: 'server', message: m }, { shouldFocus: true })
      const link = (e.code === 'DUPLICATE_PLATE' || e.code === 'DUPLICATE_CODE') && e.details ? (e.details as { id: string; plate: string }) : undefined
      setServerError({ message: e.message, link })
    },
  })

  const dirty = formState.isDirty && !saved
  const blocker = useBlocker({ shouldBlockFn: () => dirty && !save.isPending, enableBeforeUnload: () => dirty, withResolver: true })

  const submit = handleSubmit(
    (values) => {
      setServerError(null)
      save.mutate(values as unknown as Record<string, unknown>)
    },
    () => setServerError(null),
  )

  const errorList = Object.entries(errors).filter(([, v]) => v?.message) as [keyof FormValues, { message?: string }][]
  const plate = watch('plate')
  const make = watch('make')
  const model = watch('model')
  const cost = watch('acquisitionCost')
  useEffect(() => {
    // Suggest the company currency once an amount is typed, without overriding a choice.
    if (cost && !form.getValues('acquisitionCurrency') && session.company) form.setValue('acquisitionCurrency', session.company.currency)
  }, [cost, form, session.company])

  const exited = vehicle && (vehicle.status === 'sold' || vehicle.status === 'disposed')
  const title = mode === 'create' ? 'Yeni araç' : 'Aracı düzenle'

  return (
    <form onSubmit={submit} noValidate className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/araclar" search={listSearchToReturnTo()} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft size={14} />
            Araçlar
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{title}</h1>
            {mode === 'edit' && vehicle && <Plate plate={vehicle.plate} country={session.company?.country} size="md" />}
          </div>
          <p className="mt-1 text-ink-2">
            {mode === 'create'
              ? 'Kendi filonuza araç ekleyin. Yıldızlı alanlar zorunludur; diğerlerini daha sonra tamamlayabilirsiniz.'
              : `${vehicle!.make} ${vehicle!.model} · son değişiklik ${formatDateTime(vehicle!.updatedAt)}${vehicle!.updatedByName ? `, ${vehicle!.updatedByName}` : ''}`}
          </p>
        </div>
      </div>

      {(errorList.length > 0 && formState.isSubmitted) || serverError ? (
        <div role="alert" className="rounded-xl border border-alert/25 bg-alert-soft px-4 py-3 text-[13.5px] text-alert">
          <div className="flex items-start gap-2.5">
            <WarningCircle size={18} className="mt-px shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{serverError?.message ?? 'Kaydetmeden önce şu alanları düzeltin:'}</p>
              {serverError?.link && (
                <Link to="/araclar/$vehicleId/duzenle" params={{ vehicleId: serverError.link.id }} className="mt-1 inline-block font-medium underline underline-offset-2">
                  {serverError.link.plate} kaydını aç
                </Link>
              )}
              {errorList.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {errorList.map(([k, v]) => (
                    <li key={k}>
                      <button type="button" onClick={() => form.setFocus(k)} className="underline-offset-2 hover:underline">
                        {FIELD_LABELS[k]}: {v.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {exited && (
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-ink-2">
          <Info size={18} className="mt-px shrink-0 text-ink-3" />
          Bu araç filodan çıkmış ({STATUS_LABELS[vehicle!.status]}). Geçmiş kayıtları korumak için ana bilgileri düzenlenemez.
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <fieldset disabled={!!exited || save.isPending} className="min-w-0 space-y-5">
          <Section title="Araç kimliği" description="Plaka ve araç kodu şirket içinde tekildir.">
            <Field id="plate" label="Plaka" required error={err('plate')} hint="Örnek: A12-K-345">
              <Input {...describe('plate', err('plate'), true)} autoComplete="off" className="uppercase" {...register('plate')} />
            </Field>
            <Field id="vehicleCode" label="Araç kodu" error={err('vehicleCode')} hint="Şirket içi filo numarası">
              <Input {...describe('vehicleCode', err('vehicleCode'), true)} autoComplete="off" {...register('vehicleCode')} />
            </Field>
            <Field id="make" label="Marka" required error={err('make')}>
              <Input {...describe('make', err('make'))} {...register('make')} />
            </Field>
            <Field id="model" label="Model" required error={err('model')}>
              <Input {...describe('model', err('model'))} {...register('model')} />
            </Field>
            <Field id="trim" label="Donanım / paket" error={err('trim')}>
              <Input {...describe('trim', err('trim'))} {...register('trim')} />
            </Field>
            <Field id="modelYear" label="Model yılı" error={err('modelYear')}>
              <Input {...describe('modelYear', err('modelYear'))} inputMode="numeric" maxLength={4} {...register('modelYear')} />
            </Field>
            <Field id="classId" label="Araç sınıfı" required error={err('classId')}>
              <Select {...describe('classId', err('classId'))} {...register('classId')}>
                <option value="">Seçin</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="color" label="Renk" error={err('color')}>
              <Input {...describe('color', err('color'))} {...register('color')} />
            </Field>
            <Field id="vin" label="Şasi numarası (VIN)" error={err('vin')} hint="17 karakter" className="sm:col-span-2">
              <Input {...describe('vin', err('vin'), true)} autoComplete="off" maxLength={17} className="uppercase tracking-[0.04em]" {...register('vin')} />
            </Field>
          </Section>

          <Section title="Teknik özellikler">
            <Field id="fuelType" label="Yakıt" required error={err('fuelType')}>
              <Select {...describe('fuelType', err('fuelType'))} {...register('fuelType')}>
                <option value="">Seçin</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {FUEL_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="transmission" label="Vites" required error={err('transmission')}>
              <Select {...describe('transmission', err('transmission'))} {...register('transmission')}>
                <option value="">Seçin</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t} value={t}>
                    {TRANSMISSION_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="seats" label="Koltuk sayısı" error={err('seats')}>
              <Input {...describe('seats', err('seats'))} inputMode="numeric" maxLength={2} {...register('seats')} />
            </Field>
          </Section>

          <Section title="Kaynak ve şube" description="Ana şube, aracın bağlı olduğu ve yetkilerin uygulandığı şubedir; fiziksel konumdan ayrıdır.">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block font-medium">Kaynak</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border-[1.5px] border-blue bg-blue-soft/40 px-3.5 py-3">
                  <Buildings size={19} className="mt-px shrink-0 text-blue" />
                  <span>
                    <span className="block font-medium">Kendi filo</span>
                    <span className="block text-[13px] text-ink-2">Satın alma, leasing veya uzun dönem kiralama ile şirketin yönettiği araç.</span>
                  </span>
                </div>
                <div aria-disabled="true" className="flex items-start gap-3 rounded-lg border border-dashed border-line px-3.5 py-3 text-ink-3">
                  <Truck size={19} className="mt-px shrink-0" />
                  <span>
                    <span className="block font-medium text-ink-2">Dış kaynak (tedarikçi aracı)</span>
                    <span className="block text-[13px]">Araç Tedarikçileri ve tedarik dönemi modülüyle birlikte eklenecek.</span>
                  </span>
                </div>
              </div>
            </div>
            <Field id="homeBranchId" label="Ana şube" required error={err('homeBranchId')} hint={session.allBranches ? undefined : 'Yalnız yetkili olduğunuz şubeler listelenir.'}>
              <Select {...describe('homeBranchId', err('homeBranchId'), !session.allBranches)} {...register('homeBranchId')}>
                <option value="">Seçin</option>
                {session.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </Select>
            </Field>
            {mode === 'edit' && !exited ? (
              <Field id="status" label="Kullanım durumu" required error={err('status')} hint="Satış ve filodan çıkış ayrı, gerekçeli bir işlemle yapılacak.">
                <Select {...describe('status', err('status'), true)} {...register('status')}>
                  <option value="active">{STATUS_LABELS.active}</option>
                  <option value="out_of_service">{STATUS_LABELS.out_of_service}</option>
                </Select>
              </Field>
            ) : mode === 'edit' ? (
              <ReadOnlyFact label="Kullanım durumu">{STATUS_LABELS[vehicle!.status]}</ReadOnlyFact>
            ) : null}
          </Section>

          <Section title="Filoya giriş" description="Edinim bilgisi işletme geliri değildir; yalnız varsa doldurun.">
            <Field id="acquisitionType" label="Edinim türü" error={err('acquisitionType')}>
              <Select {...describe('acquisitionType', err('acquisitionType'))} {...register('acquisitionType')}>
                <option value="">Belirtilmedi</option>
                {ACQUISITION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {ACQUISITION_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="acquisitionDate" label="Edinim tarihi" error={err('acquisitionDate')}>
              <Input {...describe('acquisitionDate', err('acquisitionDate'))} type="date" {...register('acquisitionDate')} />
            </Field>
            <Field id="acquisitionSeller" label="Satıcı / kiralayan" error={err('acquisitionSeller')}>
              <Input {...describe('acquisitionSeller', err('acquisitionSeller'))} {...register('acquisitionSeller')} />
            </Field>
            <Field id="acquisitionReference" label="Fatura / sözleşme no" error={err('acquisitionReference')}>
              <Input {...describe('acquisitionReference', err('acquisitionReference'))} {...register('acquisitionReference')} />
            </Field>
            <Field id="acquisitionCost" label="Edinim tutarı" error={err('acquisitionCost') ?? err('acquisitionCurrency')} className="sm:col-span-2">
              <div className="flex max-w-[360px] gap-2">
                <Input
                  {...describe('acquisitionCost', err('acquisitionCost') ?? err('acquisitionCurrency'))}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="tnum text-right"
                  {...register('acquisitionCost')}
                />
                <Select aria-label="Para birimi" aria-invalid={err('acquisitionCurrency') ? true : undefined} className="w-[110px] shrink-0" {...register('acquisitionCurrency')}>
                  <option value="">Birim</option>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          </Section>

          {mode === 'create' ? (
            <Section title="Başlangıç kayıtları" description="Bu değerler aracın kilometre ve konum geçmişindeki ilk kayıtlar olur; sonradan bu formdan değiştirilmez.">
              <Field id="initialOdometerKm" label="Başlangıç kilometresi" error={err('initialOdometerKm')} hint="Boş bırakılırsa kilometre “doğrulanmadı” görünür.">
                <Input {...describe('initialOdometerKm', err('initialOdometerKm'), true)} inputMode="numeric" className="tnum" {...register('initialOdometerKm')} />
              </Field>
              <Field id="initialLocationBranchId" label="Başlangıç konumu" error={err('initialLocationBranchId')} hint="Aracın şu an bulunduğu şube.">
                <Select {...describe('initialLocationBranchId', err('initialLocationBranchId'), true)} {...register('initialLocationBranchId')}>
                  <option value="">Ana şube ile aynı</option>
                  {session.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </Select>
              </Field>
            </Section>
          ) : (
            <Section title="Kilometre ve konum" description="Geçmiş kayıtlarından türetilir. Düzeltmeler, Araç 360° geçmiş ekranıyla gerekçeli kayıt olarak yapılacak.">
              <ReadOnlyFact label="Güncel kilometre">
                {vehicle!.odometer ? (
                  <span>
                    <span className="tnum font-medium text-ink">{formatKm(vehicle!.odometer.km)}</span>
                    <span className="text-ink-3"> · {formatDateTime(vehicle!.odometer.at)}</span>
                  </span>
                ) : (
                  'Doğrulanmadı'
                )}
              </ReadOnlyFact>
              <ReadOnlyFact label="Son konum">
                {vehicle!.location ? (
                  <span>
                    <span className="font-medium text-ink">
                      {vehicle!.location.type === 'branch' ? vehicle!.location.branchName : LOCATION_LABELS[vehicle!.location.type]}
                    </span>
                    <span className="text-ink-3"> · {formatDateTime(vehicle!.location.at)}</span>
                  </span>
                ) : (
                  'Kayıt yok'
                )}
              </ReadOnlyFact>
            </Section>
          )}

          <section className="rounded-xl border border-line bg-surface p-5">
            <Field id="notes" label="Notlar" error={err('notes')}>
              <Textarea {...describe('notes', err('notes'))} rows={3} {...register('notes')} />
            </Field>
          </section>
        </fieldset>

        <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-sm lg:sticky lg:top-[88px] lg:inset-x-auto lg:bottom-auto lg:rounded-xl lg:border lg:p-5 lg:backdrop-blur-none">
          <div className="hidden lg:block">
            <p className="text-[12px] font-medium text-ink-3">Özet</p>
            <div className="mt-2.5 min-h-9">
              {plate?.trim() ? (
                <Plate plate={plate.trim().toLocaleUpperCase('tr')} country={session.company?.country} size="md" />
              ) : (
                <span className="text-ink-3">Plaka girilmedi</span>
              )}
            </div>
            <p className="mt-2 truncate font-medium">{[make, model].filter(Boolean).join(' ') || '—'}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">Kendi filo{mode === 'edit' ? ` · sürüm ${version}` : ''}</p>
            <hr className="my-4 border-line" />
          </div>
          <div className="flex gap-2 lg:flex-col">
            <button
              type="submit"
              disabled={save.isPending || !!exited}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue px-4 lg:flex-none font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60"
            >
              {save.isPending && <SpinnerGap size={17} className="animate-spin" />}
              {save.isPending ? 'Kaydediliyor' : mode === 'create' ? 'Aracı kaydet' : 'Değişiklikleri kaydet'}
            </button>
            <Link
              to="/araclar"
              search={listSearchToReturnTo()}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line px-4 font-medium text-ink-2 hover:bg-ground hover:text-ink lg:flex-none"
            >
              Vazgeç
            </Link>
          </div>
          {mode === 'edit' && formState.isDirty && <p className="mt-2 hidden text-[12.5px] text-ink-3 lg:block">Kaydedilmemiş değişiklikler var.</p>}
        </aside>
      </div>

      <Dialog.Root open={blocker.status === 'blocked'} onOpenChange={(o) => !o && blocker.reset?.()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-6 shadow-xl">
            <Dialog.Title className="text-[17px] font-semibold">Kaydedilmemiş değişiklikler</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-ink-2">Bu sayfadan çıkarsanız yaptığınız değişiklikler kaybolur.</Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => blocker.reset?.()} className="h-10 rounded-lg border border-line px-4 font-medium hover:bg-ground">
                Sayfada kal
              </button>
              <button type="button" onClick={() => blocker.proceed?.()} className="h-10 rounded-lg bg-alert px-4 font-medium text-white hover:opacity-90">
                Değişiklikleri bırak
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConflictDialog
        conflict={conflict}
        original={vehicle}
        classes={classes}
        onReload={() => {
          if (!conflict) return
          qc.setQueryData(['vehicle', session.company?.id, conflict.current.id], conflict.current)
          setVersion(conflict.current.version)
          reset(valuesFrom(conflict.current))
          setConflict(null)
          setServerError(null)
        }}
        onOverwrite={() => {
          if (!conflict) return
          setVersion(conflict.current.version)
          save.mutate({ ...conflict.pending, version: conflict.current.version })
          setConflict(null)
        }}
      />
    </form>
  )
}

const COMPARED: (keyof FormValues)[] = [
  'plate',
  'vehicleCode',
  'make',
  'model',
  'trim',
  'modelYear',
  'classId',
  'color',
  'vin',
  'fuelType',
  'transmission',
  'seats',
  'homeBranchId',
  'status',
  'acquisitionType',
  'acquisitionDate',
  'acquisitionSeller',
  'acquisitionCost',
  'acquisitionCurrency',
  'acquisitionReference',
  'notes',
]

/** Shows what the other person changed and lets the user choose; nothing is merged silently. */
function ConflictDialog({
  conflict,
  original,
  classes,
  onReload,
  onOverwrite,
}: {
  conflict: ConflictState | null
  original?: VehicleDetail
  classes: { id: string; name: string }[]
  onReload: () => void
  onOverwrite: () => void
}) {
  const session = useSession()
  if (!conflict || !original) return null
  const before = valuesFrom(original)
  const after = valuesFrom(conflict.current)
  const display = (k: keyof FormValues, v: string) => {
    if (!v) return '—'
    if (k === 'classId') return classes.find((c) => c.id === v)?.name ?? v
    if (k === 'homeBranchId') return session.branches.find((b) => b.id === v)?.name ?? v
    if (k === 'fuelType') return FUEL_LABELS[v as keyof typeof FUEL_LABELS]
    if (k === 'transmission') return TRANSMISSION_LABELS[v as keyof typeof TRANSMISSION_LABELS]
    if (k === 'status') return STATUS_LABELS[v as keyof typeof STATUS_LABELS]
    if (k === 'acquisitionType') return ACQUISITION_LABELS[v as keyof typeof ACQUISITION_LABELS]
    return v
  }
  const changed = COMPARED.filter((k) => before[k] !== after[k])
  return (
    <Dialog.Root open onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-hold-soft text-hold">
              <ArrowsClockwise size={20} />
            </span>
            <div>
              <Dialog.Title className="text-[17px] font-semibold">Bu araç başka biri tarafından güncellendi</Dialog.Title>
              <Dialog.Description className="mt-1 text-ink-2">
                Siz düzenlerken {conflict.current.updatedByName ?? 'başka bir kullanıcı'} {formatDateTime(conflict.current.updatedAt)} tarihinde kaydetti. Değişiklikleriniz
                henüz kaydedilmedi.
              </Dialog.Description>
            </div>
          </div>
          {changed.length > 0 && (
            <table className="mt-5 w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-ink-3">
                  <th className="py-2 pr-3 font-medium">Alan</th>
                  <th className="py-2 pr-3 font-medium">Açtığınız sürüm</th>
                  <th className="py-2 font-medium">Güncel sürüm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {changed.map((k) => (
                  <tr key={k}>
                    <td className="py-2 pr-3 text-ink-2">{FIELD_LABELS[k]}</td>
                    <td className="py-2 pr-3 text-ink-3 line-through decoration-ink-3/40">{display(k, before[k])}</td>
                    <td className="py-2 font-medium">{display(k, after[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onOverwrite} className="h-10 rounded-lg border border-line px-4 font-medium text-ink-2 hover:bg-ground hover:text-ink">
              Yine de benim değişikliklerimi kaydet
            </button>
            <button type="button" onClick={onReload} className={cn('h-10 rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink')}>
              Güncel kaydı yükle
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
