import {
  CONTACT_PREFERENCES,
  CUSTOMER_LANGUAGES,
  customerCreateSchema,
  customerInputSchema,
  type CustomerDetail,
  type CustomerDuplicateMatch,
  normalizePhone,
  formatPhone,
} from '@acarvo/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowSquareOut, ArrowsClockwise, Info, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type FieldErrors, type Resolver, useForm, type UseFormRegister } from 'react-hook-form'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { toast } from '@/components/Toaster'
import { ApiRequestError, customersApi } from '@/lib/api'
import { CONTACT_PREFERENCE_LABELS, countryOptions, CUSTOMER_FIELD_LABELS, DUPLICATE_REASON_LABELS, languageName } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { useSession } from '@/session'

/** Every input is held as text; the shared schema turns it into the API shape on both sides. */
interface FormValues {
  givenName: string
  familyName: string
  residency: string
  nationality: string
  dateOfBirth: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  city: string
  postalCode: string
  region: string
  addressCountry: string
  preferredLanguage: string
  contactPreference: string
  operationalNote: string
  createdBranchId: string
}
type Key = keyof FormValues

const EMPTY: FormValues = {
  givenName: '',
  familyName: '',
  residency: '',
  nationality: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postalCode: '',
  region: '',
  addressCountry: '',
  preferredLanguage: '',
  contactPreference: '',
  operationalNote: '',
  createdBranchId: '',
}

const valuesFrom = (c: CustomerDetail): FormValues => ({
  givenName: c.givenName ?? '',
  familyName: c.familyName ?? '',
  residency: c.residency,
  nationality: c.nationality ?? '',
  dateOfBirth: c.dateOfBirth ?? '',
  phone: c.phoneRaw ?? '',
  email: c.email ?? '',
  addressLine1: c.addressLine1 ?? '',
  addressLine2: c.addressLine2 ?? '',
  city: c.city ?? '',
  postalCode: c.postalCode ?? '',
  region: c.region ?? '',
  addressCountry: c.addressCountry ?? '',
  preferredLanguage: c.preferredLanguage ?? '',
  contactPreference: c.contactPreference ?? '',
  operationalNote: c.operationalNote ?? '',
  createdBranchId: c.createdBranch?.id ?? '',
})

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line-soft pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      <div className="mt-3.5 space-y-4">{children}</div>
    </section>
  )
}

function CountrySelect({ id, label, register, name, error, companyCountry }: { id: string; label: string; register: UseFormRegister<FormValues>; name: Key; error?: string; companyCountry?: string | null }) {
  const { frequent, all } = useMemo(() => countryOptions(companyCountry), [companyCountry])
  return (
    <Field id={id} label={label} error={error}>
      <Select {...describe(id, error)} {...register(name)}>
        <option value="">Seçilmedi</option>
        <optgroup label="Sık kullanılanlar">
          {frequent.map((c) => (
            <option key={`f-${c.code}`} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Tüm ülkeler">
          {all.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </Select>
    </Field>
  )
}

/** Debounced copy of a value: duplicate suggestions are asked for once typing pauses. */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function DuplicatePanel({ matches, acknowledged, onAcknowledge, highlight }: { matches: CustomerDuplicateMatch[]; acknowledged: boolean; onAcknowledge: (v: boolean) => void; highlight: boolean }) {
  const strong = matches.some((m) => m.strength === 'strong')
  return (
    <div
      role="region"
      aria-label="Benzer müşteri kayıtları"
      className={cn('rounded-lg border px-3.5 py-3 text-[13px]', strong ? 'border-hold/35 bg-hold-soft' : 'border-line bg-ground/60', highlight && 'ring-3 ring-hold/25')}
    >
      <p className="flex items-start gap-2 font-medium text-ink">
        <WarningCircle size={17} className={cn('mt-px shrink-0', strong ? 'text-hold' : 'text-ink-3')} />
        {strong ? 'Bu bilgiler şirketinizdeki başka bir müşteride kayıtlı' : 'Benzer bir kayıt olabilir'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-surface/80 px-2.5 py-2">
            <span className="font-medium text-ink">{m.displayName}</span>
            <span className="tnum text-ink-2">{m.customerNo}</span>
            {m.status === 'archived' && <span className="text-ink-2">· arşivde</span>}
            <span className="basis-full text-ink-2">
              {m.reasons.map((r) => DUPLICATE_REASON_LABELS[r]).join(', ')}
              {[m.maskedPhone, m.maskedEmail].filter(Boolean).length > 0 && <span className="tnum"> · {[m.maskedPhone, m.maskedEmail].filter(Boolean).join(' · ')}</span>}
            </span>
            <a href={`/musteriler/${m.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-blue hover:underline">
              Kaydı yeni sekmede aç
              <ArrowSquareOut size={13} />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-2">Aynı kişiyse yeni kayıt açmayın, mevcut kaydı kullanın. Kayıtlar otomatik birleştirilmez; karar sizindir.</p>
      {strong && (
        <label className="mt-2.5 flex cursor-pointer items-start gap-2 font-medium text-ink">
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
          Kontrol ettim; bu farklı bir kişi, yine de kaydet
        </label>
      )}
    </div>
  )
}

/** Yeni müşteri / Müşteriyi düzenle, in the shared side panel. */
export function CustomerFormSheet({
  mode,
  customer,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  customer?: CustomerDetail
  onClose: () => void
  onSaved?: (c: CustomerDetail) => void
}) {
  // A reload after a conflict re-mounts the form on the newer record.
  const [base, setBase] = useState(customer)
  return <CustomerForm key={base?.version ?? 'new'} mode={mode} customer={base} onReload={setBase} onClose={onClose} onSaved={onSaved} />
}

function CustomerForm({
  mode,
  customer,
  onReload,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  customer?: CustomerDetail
  onReload: (c: CustomerDetail) => void
  onClose: () => void
  onSaved?: (c: CustomerDetail) => void
}) {
  const session = useSession()
  const qc = useQueryClient()
  const companyCountry = session.company?.country
  const defaults = useMemo<FormValues>(() => (customer ? valuesFrom(customer) : { ...EMPTY, createdBranchId: session.branches.length === 1 ? session.branches[0]!.id : '' }), [customer, session.branches])
  const form = useForm<FormValues>({
    resolver: zodResolver(mode === 'create' ? customerCreateSchema : customerInputSchema) as unknown as Resolver<FormValues>,
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const { register, handleSubmit, formState, watch, setError, setFocus } = form
  const errors = formState.errors as FieldErrors<FormValues>
  const err = (k: Key) => errors[k]?.message as string | undefined
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<CustomerDetail | null>(null)
  const [serverMatches, setServerMatches] = useState<CustomerDuplicateMatch[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [highlightDuplicates, setHighlightDuplicates] = useState(false)
  const [saved, setSaved] = useState(false)
  const duplicatesRef = useRef<HTMLDivElement>(null)

  // Duplicate suggestions: in edit mode only for what actually changed (the server asks for a decision only then).
  const [givenName, familyName, phone, email, dateOfBirth, note] = watch(['givenName', 'familyName', 'phone', 'email', 'dateOfBirth', 'operationalNote'])
  const changed = (k: Key, v: string) => mode === 'create' || v.trim() !== defaults[k].trim()
  const nameOrDobChanged = changed('givenName', givenName) || changed('familyName', familyName) || changed('dateOfBirth', dateOfBirth)
  const probe = useDebounced(
    {
      phone: changed('phone', phone) && phone.trim() ? phone.trim() : undefined,
      email: changed('email', email) && /.+@.+\..+/.test(email.trim()) ? email.trim() : undefined,
      givenName: nameOrDobChanged ? givenName.trim() || undefined : undefined,
      familyName: nameOrDobChanged ? familyName.trim() || undefined : undefined,
      dateOfBirth: nameOrDobChanged && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? dateOfBirth : undefined,
      excludeId: customer?.id,
    },
    600,
  )
  const probeUseful = !!(probe.phone || probe.email || ((probe.givenName || probe.familyName) && probe.dateOfBirth))
  const duplicates = useQuery({
    queryKey: ['customer-duplicates', session.company?.id, probe],
    queryFn: () => customersApi.duplicates(probe),
    enabled: probeUseful,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  })
  const matches = serverMatches ?? (probeUseful ? (duplicates.data?.matches ?? []) : [])
  const strongIds = matches
    .filter((m) => m.strength === 'strong')
    .map((m) => m.id)
    .join(',')
  // A new set of strong suggestions needs a new decision.
  useEffect(() => setAcknowledged(false), [strongIds])
  // Suggestions returned by a refused save are replaced by the live ones as soon as the contact data changes.
  const probeKey = JSON.stringify(probe)
  const firstProbe = useRef(probeKey)
  useEffect(() => {
    if (probeKey !== firstProbe.current) setServerMatches(null)
  }, [probeKey])

  const phonePreview = phone.trim() ? normalizePhone(phone, companyCountry) : null
  const noteHasNumber = /\d{7,}/.test(note.replace(/[\s-]/g, ''))

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (mode === 'create' ? customersApi.create(body) : customersApi.update(customer!.id, body)),
    onSuccess: (c) => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer-history', session.company?.id, c.id] })
      qc.removeQueries({ queryKey: ['customer-duplicates'] })
      qc.setQueryData(['customer', session.company?.id, c.id], c)
      toast(mode === 'create' ? `${c.displayName} kaydedildi (${c.customerNo}).` : `${c.displayName} güncellendi.`)
      onClose()
      onSaved?.(c)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      if (e.code === 'VERSION_CONFLICT') return setConflict((e.details as { current: CustomerDetail }).current)
      if (e.code === 'POSSIBLE_DUPLICATE') {
        setServerMatches((e.details as { matches: CustomerDuplicateMatch[] }).matches)
        setHighlightDuplicates(true)
        setTimeout(() => duplicatesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
        return setServerError(null)
      }
      for (const [k, m] of Object.entries(e.fields ?? {})) setError(k as Key, { type: 'server', message: m }, { shouldFocus: true })
      setServerError(e.message)
    },
  })

  const submit = handleSubmit(
    (values) => {
      setServerError(null)
      if (strongIds && !acknowledged) {
        setHighlightDuplicates(true)
        duplicatesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return setServerError('Benzer kayıtları kontrol edin: aynı kişiyse mevcut kaydı kullanın, farklı kişiyse onay kutusunu işaretleyin.')
      }
      const body: Record<string, unknown> = { ...values, duplicateAcknowledged: strongIds ? acknowledged : undefined }
      if (mode === 'edit') {
        delete body.createdBranchId
        body.version = conflict?.version ?? customer!.version
      }
      save.mutate(body)
    },
    () => setServerError(null),
  )

  useEffect(() => {
    if (mode === 'create') setTimeout(() => setFocus('givenName'), 50)
  }, [mode, setFocus])

  const conflictFields = conflict
    ? (Object.keys(EMPTY) as Key[]).filter((k) => k !== 'createdBranchId' && defaults[k] !== valuesFrom(conflict)[k]).map((k) => CUSTOMER_FIELD_LABELS[k] ?? k)
    : []

  return (
    <Sheet
      title={mode === 'create' ? 'Yeni müşteri' : 'Müşteriyi düzenle'}
      subtitle={mode === 'create' ? 'Kişi ve iletişim bilgileri' : `${customer!.displayName} · ${customer!.customerNo}`}
      onClose={onClose}
      dirty={formState.isDirty && !saved}
      footer={
        <>
          <button
            type="submit"
            form="customer-form"
            disabled={save.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60"
          >
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            {mode === 'create' ? 'Müşteriyi kaydet' : 'Değişiklikleri kaydet'}
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
            Vazgeç
          </button>
        </>
      }
    >
      <form id="customer-form" noValidate onSubmit={submit} className="space-y-6">
        {conflict && (
          <div role="alert" className="rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-3 text-[13px]">
            <p className="font-medium text-ink">
              Bu kayıt siz düzenlerken {conflict.updatedByName ?? 'başka bir kullanıcı'} tarafından {formatDateTime(conflict.updatedAt)} tarihinde güncellendi.
            </p>
            {conflictFields.length > 0 && <p className="mt-1 text-ink-2">Değişen alanlar: {conflictFields.join(', ')}</p>}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => onReload(conflict)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 font-medium hover:bg-ground">
                <ArrowsClockwise size={14} />
                Güncel bilgileri yükle
              </button>
              <button type="submit" className="h-8 rounded-md px-3 font-medium text-hold hover:bg-surface">
                Benim değişikliklerimi kaydet
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-2">Güncel bilgileri yüklerseniz bu paneldeki değişiklikleriniz silinir.</p>
          </div>
        )}
        {serverError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
            <WarningCircle size={17} className="mt-px shrink-0" />
            {serverError}
          </p>
        )}

        <Section title="Kimlik" hint="Tek isim kullanan kişilerde ad veya soyaddan yalnızca birini doldurun.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="givenName" label="Ad" error={err('givenName')}>
              <Input {...describe('givenName', err('givenName'))} autoComplete="off" {...register('givenName')} />
            </Field>
            <Field id="familyName" label="Soyad" error={err('familyName')}>
              <Input {...describe('familyName', err('familyName'))} autoComplete="off" {...register('familyName')} />
            </Field>
          </div>
          <fieldset aria-describedby={err('residency') ? 'residency-error residency-hint' : 'residency-hint'}>
            <legend className="mb-1.5 flex items-baseline gap-1 text-[13.5px] font-medium text-ink">
              İkamet durumu
              <span className="text-alert" aria-hidden>
                *
              </span>
              <span className="sr-only">(zorunlu)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['local', 'Yerli (ikamet)', 'Yerel ikamet eden müşteri'],
                  ['foreign', 'Yabancı (ikamet)', 'Yurt dışında ikamet eden müşteri'],
                ] as const
              ).map(([value, label, sub]) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-ink-3/50 has-[:checked]:border-blue has-[:checked]:bg-blue-soft/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-blue/20',
                    err('residency') ? 'border-alert' : 'border-line',
                  )}
                >
                  <input type="radio" value={value} {...register('residency')} className="mt-1 size-4 accent-[var(--ac-blue)]" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{label}</span>
                    <span className="block text-[12.5px] text-ink-2">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
            {err('residency') && (
              <p id="residency-error" className="mt-1.5 text-[13px] text-alert">
                {err('residency')}
              </p>
            )}
            {/* The meaning stays visible next to an error: this is residence, not citizenship. */}
            <p id="residency-hint" className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
              Vatandaşlık değil, ikamet sınıflandırmasıdır ve istenecek belgeleri belirler. Uyruktan, addan veya telefon kodundan tahmin edilmez; siz seçersiniz.
            </p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <CountrySelect id="nationality" label="Uyruk" name="nationality" register={register} error={err('nationality')} companyCountry={companyCountry} />
            <Field id="dateOfBirth" label="Doğum tarihi" error={err('dateOfBirth')}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...describe('dateOfBirth', err('dateOfBirth'))} {...register('dateOfBirth')} />
            </Field>
          </div>
        </Section>

        <Section title="İletişim" hint="Telefon veya e-postadan en az biri gerekli.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="phone"
              label="Telefon"
              error={err('phone')}
              hint={
                phone.trim()
                  ? phonePreview
                    ? `Kaydedilecek biçim: ${formatPhone(phonePreview)}`
                    : 'Numarayı ülke koduyla yazın, örneğin +387 61 123 456'
                  : `Ülke kodu yazılmazsa ${companyCountry ? 'şirket ülkesinin kodu' : 'ülke kodu'} kabul edilir.`
              }
            >
              <Input type="tel" inputMode="tel" autoComplete="off" {...describe('phone', err('phone'), true)} {...register('phone')} />
            </Field>
            <Field id="email" label="E-posta" error={err('email')}>
              <Input type="email" inputMode="email" autoComplete="off" {...describe('email', err('email'))} {...register('email')} />
            </Field>
          </div>
          {matches.length > 0 && (
            <div ref={duplicatesRef}>
              <DuplicatePanel
                matches={matches}
                acknowledged={acknowledged}
                onAcknowledge={(v) => {
                  setAcknowledged(v)
                  if (v) setHighlightDuplicates(false)
                }}
                highlight={highlightDuplicates && !acknowledged}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contactPreference" label="İletişim tercihi" error={err('contactPreference')}>
              <Select {...describe('contactPreference', err('contactPreference'))} {...register('contactPreference')}>
                <option value="">Belirtilmedi</option>
                {CONTACT_PREFERENCES.map((p) => (
                  <option key={p} value={p}>
                    {CONTACT_PREFERENCE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="preferredLanguage" label="Hizmet dili" error={err('preferredLanguage')}>
              <Select {...describe('preferredLanguage', err('preferredLanguage'))} {...register('preferredLanguage')}>
                <option value="">Belirtilmedi</option>
                {CUSTOMER_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Adres" hint="İsteğe bağlı. Uluslararası serbest biçim; ülkeye göre zorunlu alan yok.">
          <Field id="addressLine1" label="Adres" error={err('addressLine1')}>
            <Input autoComplete="off" {...describe('addressLine1', err('addressLine1'))} {...register('addressLine1')} />
          </Field>
          <Field id="addressLine2" label="Adres (2. satır)" error={err('addressLine2')}>
            <Input autoComplete="off" {...describe('addressLine2', err('addressLine2'))} {...register('addressLine2')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field id="city" label="Şehir" error={err('city')}>
              <Input autoComplete="off" {...describe('city', err('city'))} {...register('city')} />
            </Field>
            <Field id="postalCode" label="Posta kodu" error={err('postalCode')}>
              <Input autoComplete="off" {...describe('postalCode', err('postalCode'))} {...register('postalCode')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="region" label="Bölge / eyalet" error={err('region')}>
              <Input autoComplete="off" {...describe('region', err('region'))} {...register('region')} />
            </Field>
            <CountrySelect id="addressCountry" label="Ülke" name="addressCountry" register={register} error={err('addressCountry')} companyCountry={companyCountry} />
          </div>
        </Section>

        {mode === 'create' && session.branches.length > 1 && (
          <Section title="Kayıt">
            <Field id="createdBranchId" label="Kaydın açıldığı şube" error={err('createdBranchId')} hint="Bilgi amaçlıdır; müşteriyi şirketin tüm yetkili kullanıcıları bulabilir.">
              <Select {...describe('createdBranchId', err('createdBranchId'), true)} {...register('createdBranchId')}>
                <option value="">Belirtilmedi</option>
                {session.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Section>
        )}

        <Section title="Operasyonel not">
          <Field
            id="operationalNote"
            label="Not"
            error={err('operationalNote')}
            hint={
              noteHasNumber ? (
                <span className="font-medium text-hold">Not alanına kimlik, pasaport veya ehliyet numarası yazmayın.</span>
              ) : (
                'Hizmetle ilgili kısa bilgi (ör. teslimde önceden aranmak istiyor). Kişilik veya risk yorumu ve belge numarası yazmayın.'
              )
            }
          >
            <Textarea rows={3} {...describe('operationalNote', err('operationalNote'), true)} {...register('operationalNote')} />
          </Field>
        </Section>

        <p className="flex items-start gap-2 border-t border-line-soft pt-4 text-[12.5px] text-ink-3">
          <Info size={14} className="mt-[2px] shrink-0" />
          Kimlik, pasaport ve ehliyet numaraları bu formda istenmez; şifreli belge kaydıyla sonraki aşamada eklenecek.
        </p>
      </form>
    </Sheet>
  )
}
