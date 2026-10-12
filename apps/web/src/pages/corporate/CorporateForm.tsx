import {
  ADDRESS_KINDS,
  corporateCreateSchema,
  type CorporateDetail,
  type CorporateDuplicateMatch,
  corporateUpdateSchema,
  CUSTOMER_LANGUAGES,
  formatPhone,
  normalizePhone,
  TAX_SCHEME_SUGGESTIONS,
  TAX_VALIDITIES,
  taxIdWarnings,
} from '@acarvo/shared'
import { ArrowSquareOut, ArrowsClockwise, Info, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type FieldErrors, type Resolver, useForm, type UseFormRegister } from 'react-hook-form'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { toast } from '@/components/Toaster'
import { ApiRequestError, corporateApi } from '@/lib/api'
import { ADDRESS_KIND_LABELS, CORPORATE_DUPLICATE_REASON_LABELS, CORPORATE_FIELD_LABELS, TAX_VALIDITY_LABELS, TAX_WARNING_LABELS } from '@/lib/corporate-labels'
import { countryName, countryOptions, languageName } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { useSession } from '@/session'

/** Every input is held as text; the shared schema turns it into the API shape on both sides. */
interface FormValues {
  legalName: string
  tradeName: string
  country: string
  registrationNumber: string
  registrationAuthority: string
  preferredLanguage: string
  note: string
  createdBranchId: string
  phone: string
  email: string
  website: string
  addrKind: string
  addrLine1: string
  addrLine2: string
  addrCity: string
  addrPostalCode: string
  addrRegion: string
  addrCountry: string
  taxCountry: string
  taxScheme: string
  taxValue: string
  taxValidity: string
}
type Key = keyof FormValues
const CORE_KEYS: Key[] = ['legalName', 'tradeName', 'country', 'registrationNumber', 'registrationAuthority', 'preferredLanguage', 'note']

const emptyValues = (country: string): FormValues => ({
  legalName: '',
  tradeName: '',
  country,
  registrationNumber: '',
  registrationAuthority: '',
  preferredLanguage: '',
  note: '',
  createdBranchId: '',
  phone: '',
  email: '',
  website: '',
  addrKind: 'registered',
  addrLine1: '',
  addrLine2: '',
  addrCity: '',
  addrPostalCode: '',
  addrRegion: '',
  addrCountry: country,
  taxCountry: country,
  taxScheme: '',
  taxValue: '',
  taxValidity: 'not_checked',
})

const valuesFrom = (a: CorporateDetail): FormValues => ({
  ...emptyValues(a.country),
  legalName: a.legalName,
  tradeName: a.tradeName ?? '',
  country: a.country,
  registrationNumber: a.registrationNumber ?? '',
  registrationAuthority: a.registrationAuthority ?? '',
  preferredLanguage: a.preferredLanguage ?? '',
  note: a.note ?? '',
})

const filled = (...v: string[]) => v.some((x) => x.trim() !== '')

/** Form values → API body, and which form field each channel index came from (for error messages). */
function toBody(v: FormValues, mode: 'create' | 'edit') {
  const core = Object.fromEntries(CORE_KEYS.map((k) => [k, v[k]]))
  if (mode === 'edit') return { body: core, channelFields: [] as Key[] }
  const channelFields: Key[] = []
  const channels: { kind: string; value: string }[] = []
  for (const [kind, key] of [['phone', 'phone'], ['email', 'email'], ['website', 'website']] as const) {
    if (v[key].trim()) {
      channels.push({ kind, value: v[key] })
      channelFields.push(key)
    }
  }
  const address = filled(v.addrLine1, v.addrLine2, v.addrCity, v.addrPostalCode, v.addrRegion)
    ? { kind: v.addrKind, line1: v.addrLine1, line2: v.addrLine2, city: v.addrCity, postalCode: v.addrPostalCode, region: v.addrRegion, country: v.addrCountry }
    : undefined
  const taxId = filled(v.taxValue, v.taxScheme) ? { country: v.taxCountry, scheme: v.taxScheme, value: v.taxValue, validity: v.taxValidity } : undefined
  return { body: { ...core, createdBranchId: v.createdBranchId, channels, address, taxId }, channelFields }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** API / schema path ("channels.1.value", "address.city", "taxId.value") → form field. */
function fieldOf(path: (string | number)[], channelFields: Key[]): Key | null {
  const [head, second] = path
  if (head === 'channels') return channelFields[Number(second)] ?? 'phone'
  if (head === 'address') return `addr${cap(String(second))}` as Key
  if (head === 'taxId') return `tax${cap(String(second))}` as Key
  return (head as Key) ?? null
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line-soft pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      <div className="mt-3.5 space-y-4">{children}</div>
    </section>
  )
}

function CountrySelect({ id, label, name, register, error, companyCountry, required, hint }: { id: string; label: string; name: Key; register: UseFormRegister<FormValues>; error?: string; companyCountry?: string | null; required?: boolean; hint?: string }) {
  const { frequent, all } = useMemo(() => countryOptions(companyCountry), [companyCountry])
  return (
    <Field id={id} label={label} error={error} required={required} hint={hint}>
      <Select {...describe(id, error, !!hint)} {...register(name)}>
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

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function CorporateDuplicatePanel({ matches, acknowledged, onAcknowledge, highlight }: { matches: CorporateDuplicateMatch[]; acknowledged: boolean; onAcknowledge: (v: boolean) => void; highlight: boolean }) {
  const strong = matches.some((m) => m.strength === 'strong')
  return (
    <div role="region" aria-label="Benzer kurumsal hesaplar" className={cn('rounded-lg border px-3.5 py-3 text-[13px]', strong ? 'border-hold/35 bg-hold-soft' : 'border-line bg-ground/60', highlight && 'ring-3 ring-hold/25')}>
      <p className="flex items-start gap-2 font-medium text-ink">
        <WarningCircle size={17} className={cn('mt-px shrink-0', strong ? 'text-hold' : 'text-ink-3')} />
        {strong ? 'Bu bilgiler şirketinizdeki başka bir kurumsal hesapta kayıtlı' : 'Benzer bir kurumsal hesap olabilir'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-surface/80 px-2.5 py-2">
            <span className="font-medium text-ink">{m.legalName}</span>
            <span className="tnum text-ink-2">{m.accountNo}</span>
            <span className="text-ink-2">· {countryName(m.country)}</span>
            {m.status === 'archived' && <span className="text-ink-2">· arşivde</span>}
            <span className="basis-full text-ink-2">{m.reasons.map((r) => CORPORATE_DUPLICATE_REASON_LABELS[r]).join(', ')}</span>
            <a href={`/kurumsal-hesaplar/${m.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-blue hover:underline">
              Hesabı yeni sekmede aç
              <ArrowSquareOut size={13} />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-2">Aynı şirketse yeni hesap açmayın, mevcut hesabı kullanın. Hesaplar otomatik birleştirilmez; benzer ad tek başına kesin eşleşme değildir.</p>
      {strong && (
        <label className="mt-2.5 flex cursor-pointer items-start gap-2 font-medium text-ink">
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
          Kontrol ettim; bu ayrı bir hesap, yine de kaydet
        </label>
      )}
    </div>
  )
}

/** Yeni kurumsal hesap / Kurumsal hesabı düzenle, in the shared side panel. */
export function CorporateFormSheet({ mode, account, onClose, onSaved }: { mode: 'create' | 'edit'; account?: CorporateDetail; onClose: () => void; onSaved?: (a: CorporateDetail) => void }) {
  // A reload after a conflict re-mounts the form on the newer record.
  const [base, setBase] = useState(account)
  return <CorporateForm key={base?.version ?? 'new'} mode={mode} account={base} onReload={setBase} onClose={onClose} onSaved={onSaved} />
}

function CorporateForm({ mode, account, onReload, onClose, onSaved }: { mode: 'create' | 'edit'; account?: CorporateDetail; onReload: (a: CorporateDetail) => void; onClose: () => void; onSaved?: (a: CorporateDetail) => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const companyCountry = session.company?.country ?? ''
  const defaults = useMemo<FormValues>(
    () => (account ? valuesFrom(account) : { ...emptyValues(companyCountry), createdBranchId: session.branches.length === 1 ? session.branches[0]!.id : '' }),
    [account, companyCountry, session.branches],
  )
  const resolver: Resolver<FormValues> = async (values) => {
    const { body, channelFields } = toBody(values, mode)
    const r = (mode === 'create' ? corporateCreateSchema : corporateUpdateSchema.omit({ version: true, duplicateAcknowledged: true })).safeParse(body)
    if (r.success) return { values, errors: {} }
    const errors: Record<string, { type: string; message: string }> = {}
    for (const i of r.error.issues) {
      const f = fieldOf(i.path as (string | number)[], channelFields)
      if (f && !errors[f]) errors[f] = { type: 'schema', message: i.message }
    }
    return { values: {}, errors: errors as FieldErrors<FormValues> }
  }
  const form = useForm<FormValues>({ resolver, defaultValues: defaults, mode: 'onTouched' })
  const { register, handleSubmit, formState, watch, setError, setFocus } = form
  const errors = formState.errors as FieldErrors<FormValues>
  const err = (k: Key) => errors[k]?.message as string | undefined
  const [serverError, setServerError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<CorporateDetail | null>(null)
  const [serverMatches, setServerMatches] = useState<CorporateDuplicateMatch[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const [saved, setSaved] = useState(false)
  const duplicatesRef = useRef<HTMLDivElement>(null)

  const [legalName, country, registrationNumber, phone, email, taxValue, taxScheme, taxCountry] = watch(['legalName', 'country', 'registrationNumber', 'phone', 'email', 'taxValue', 'taxScheme', 'taxCountry'])
  const changed = (k: Key, v: string) => mode === 'create' || v.trim() !== defaults[k].trim()
  const probe = useDebounced(
    {
      legalName: changed('legalName', legalName) && legalName.trim().length >= 3 ? legalName.trim() : undefined,
      country: country || undefined,
      registrationNumber: changed('registrationNumber', registrationNumber) && registrationNumber.trim() ? registrationNumber.trim() : undefined,
      taxValue: mode === 'create' && taxValue.trim().length >= 3 ? taxValue.trim() : undefined,
      email: mode === 'create' && /.+@.+\..+/.test(email.trim()) ? email.trim() : undefined,
      phone: mode === 'create' && phone.replace(/\D/g, '').length >= 6 ? phone.trim() : undefined,
      excludeId: account?.id,
    },
    600,
  )
  const probeUseful = !!(probe.legalName || probe.registrationNumber || probe.taxValue || probe.email || probe.phone)
  const duplicates = useQuery({
    queryKey: ['corporate-duplicates', session.company?.id, probe],
    queryFn: () => corporateApi.duplicates(probe),
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
  useEffect(() => setAcknowledged(false), [strongIds])
  const probeKey = JSON.stringify(probe)
  const firstProbe = useRef(probeKey)
  useEffect(() => {
    if (probeKey !== firstProbe.current) setServerMatches(null)
  }, [probeKey])

  const phonePreview = phone.trim() ? normalizePhone(phone, companyCountry) : null
  const taxHints = taxValue.trim() && taxScheme.trim() ? taxIdWarnings(taxCountry, taxScheme.trim().toUpperCase(), taxValue) : []

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (mode === 'create' ? corporateApi.create(body) : corporateApi.update(account!.id, body)),
    onSuccess: (a) => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['corporate-accounts'] })
      void qc.invalidateQueries({ queryKey: ['corporate-history', session.company?.id, a.id] })
      qc.removeQueries({ queryKey: ['corporate-duplicates'] })
      qc.setQueryData(['corporate-account', session.company?.id, a.id], a)
      toast(mode === 'create' ? `${a.legalName} kaydedildi (${a.accountNo}).` : `${a.legalName} güncellendi.`)
      onClose()
      onSaved?.(a)
    },
    onError: (e, body) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      if (e.code === 'VERSION_CONFLICT') return setConflict((e.details as { current: CorporateDetail }).current)
      if (e.code === 'POSSIBLE_DUPLICATE') {
        setServerMatches((e.details as { matches: CorporateDuplicateMatch[] }).matches)
        setHighlight(true)
        setTimeout(() => duplicatesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
        return setServerError(null)
      }
      const { channelFields } = toBody(form.getValues(), mode)
      void body
      for (const [k, m] of Object.entries(e.fields ?? {})) {
        const f = fieldOf(k.split('.'), channelFields)
        if (f) setError(f, { type: 'server', message: m }, { shouldFocus: true })
      }
      setServerError(e.message)
    },
  })

  const submit = handleSubmit(
    (values) => {
      setServerError(null)
      if (strongIds && !acknowledged) {
        setHighlight(true)
        duplicatesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return setServerError('Benzer hesapları kontrol edin: aynı şirketse mevcut hesabı kullanın, ayrı bir hesapsa onay kutusunu işaretleyin.')
      }
      const { body } = toBody(values, mode)
      const out: Record<string, unknown> = { ...body, duplicateAcknowledged: strongIds ? acknowledged : undefined }
      if (mode === 'edit') out.version = conflict?.version ?? account!.version
      save.mutate(out)
    },
    () => setServerError(null),
  )

  useEffect(() => {
    if (mode === 'create') setTimeout(() => setFocus('legalName'), 50)
  }, [mode, setFocus])

  const conflictFields = conflict ? CORE_KEYS.filter((k) => defaults[k] !== valuesFrom(conflict)[k]).map((k) => CORPORATE_FIELD_LABELS[k] ?? k) : []

  return (
    <Sheet
      title={mode === 'create' ? 'Yeni kurumsal hesap' : 'Kurumsal hesabı düzenle'}
      subtitle={mode === 'create' ? 'Şirket bilgileri; kişiler ve sürücüler kayıttan sonra bağlanır' : `${account!.legalName} · ${account!.accountNo}`}
      onClose={onClose}
      dirty={formState.isDirty && !saved}
      footer={
        <>
          <button type="submit" form="corporate-form" disabled={save.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60">
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            {mode === 'create' ? 'Hesabı kaydet' : 'Değişiklikleri kaydet'}
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
            Vazgeç
          </button>
        </>
      }
    >
      <form id="corporate-form" noValidate onSubmit={submit} className="space-y-6">
        {conflict && (
          <div role="alert" className="rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-3 text-[13px]">
            <p className="font-medium text-ink">
              Bu hesap siz düzenlerken {conflict.updatedByName ?? 'başka bir kullanıcı'} tarafından {formatDateTime(conflict.updatedAt)} tarihinde güncellendi.
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

        <Section title="Şirket kimliği">
          <Field id="legalName" label="Resmi unvan" required error={err('legalName')} hint="Sicildeki tam unvan, örneğin “Örnek Lojistik d.o.o.”">
            <Input autoComplete="off" {...describe('legalName', err('legalName'), true)} {...register('legalName')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tradeName" label="Kısa / görünen ad" error={err('tradeName')}>
              <Input autoComplete="off" {...describe('tradeName', err('tradeName'))} {...register('tradeName')} />
            </Field>
            <CountrySelect id="country" label="Ülke" name="country" register={register} error={err('country')} companyCountry={companyCountry} required />
          </div>
        </Section>

        <Section title="Ticari kayıt" hint="İsteğe bağlı. Ülkeye göre biçim zorunlu tutulmaz.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="registrationNumber" label="Sicil / kayıt no" error={err('registrationNumber')}>
              <Input autoComplete="off" {...describe('registrationNumber', err('registrationNumber'))} {...register('registrationNumber')} />
            </Field>
            <Field id="registrationAuthority" label="Sicil makamı" error={err('registrationAuthority')}>
              <Input autoComplete="off" {...describe('registrationAuthority', err('registrationAuthority'))} {...register('registrationAuthority')} />
            </Field>
          </div>
        </Section>

        {mode === 'create' && (
          <>
            <Section title="İletişim" hint="İsteğe bağlı. Sonradan 360° ekranında başka kanallar da eklenebilir.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="phone"
                  label="Telefon"
                  error={err('phone')}
                  hint={phone.trim() ? (phonePreview ? `Kaydedilecek biçim: ${formatPhone(phonePreview)}` : 'Numarayı ülke koduyla yazın, örneğin +387 33 123 456') : 'Ülke kodu yazılmazsa şirket ülkesinin kodu kabul edilir.'}
                >
                  <Input type="tel" inputMode="tel" autoComplete="off" {...describe('phone', err('phone'), true)} {...register('phone')} />
                </Field>
                <Field id="email" label="E-posta" error={err('email')}>
                  <Input type="email" inputMode="email" autoComplete="off" {...describe('email', err('email'))} {...register('email')} />
                </Field>
              </div>
              <Field id="website" label="Web sitesi" error={err('website')}>
                <Input inputMode="url" autoComplete="off" placeholder="ornek.ba" {...describe('website', err('website'))} {...register('website')} />
              </Field>
            </Section>

            <Section title="Adres" hint="İsteğe bağlı. Fatura, yazışma ve diğer adresler 360° ekranında eklenir; her türde bir birincil adres olur.">
              <Field id="addrKind" label="Adres türü" error={err('addrKind')}>
                <Select {...describe('addrKind', err('addrKind'))} {...register('addrKind')}>
                  {ADDRESS_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ADDRESS_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="addrLine1" label="Açık adres" error={err('addrLine1')}>
                <Input autoComplete="off" {...describe('addrLine1', err('addrLine1'))} {...register('addrLine1')} />
              </Field>
              <Field id="addrLine2" label="Adres (2. satır)" error={err('addrLine2')}>
                <Input autoComplete="off" {...describe('addrLine2', err('addrLine2'))} {...register('addrLine2')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Field id="addrCity" label="Şehir" error={err('addrCity')}>
                  <Input autoComplete="off" {...describe('addrCity', err('addrCity'))} {...register('addrCity')} />
                </Field>
                <Field id="addrPostalCode" label="Posta kodu" error={err('addrPostalCode')}>
                  <Input autoComplete="off" {...describe('addrPostalCode', err('addrPostalCode'))} {...register('addrPostalCode')} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="addrRegion" label="Bölge / eyalet" error={err('addrRegion')}>
                  <Input autoComplete="off" {...describe('addrRegion', err('addrRegion'))} {...register('addrRegion')} />
                </Field>
                <CountrySelect id="addrCountry" label="Adres ülkesi" name="addrCountry" register={register} error={err('addrCountry')} companyCountry={companyCountry} />
              </div>
            </Section>

            <Section title="Vergi kimliği" hint="İsteğe bağlı. Farklı ülkelerden birden fazla vergi kimliği 360° ekranında eklenebilir.">
              <div className="grid gap-4 sm:grid-cols-2">
                <CountrySelect id="taxCountry" label="Vergi kimliğinin ülkesi" name="taxCountry" register={register} error={err('taxCountry')} companyCountry={companyCountry} />
                <Field id="taxScheme" label="Tür" error={err('taxScheme')} hint="Örneğin VAT, PDV, JIB, VKN">
                  <Input list="tax-schemes" autoComplete="off" {...describe('taxScheme', err('taxScheme'), true)} {...register('taxScheme')} />
                </Field>
              </div>
              <datalist id="tax-schemes">
                {TAX_SCHEME_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="taxValue"
                  label="Vergi kimliği"
                  error={err('taxValue')}
                  hint={taxHints.length ? <span className="font-medium text-hold">Uyarı: {taxHints.map((w) => TAX_WARNING_LABELS[w]).join('; ')}. Kayıt yine de yapılabilir.</span> : 'Biçim yalnız uyarı olarak denetlenir; geçerlilik hukuken doğrulanmaz.'}
                >
                  <Input autoComplete="off" {...describe('taxValue', err('taxValue'), true)} {...register('taxValue')} />
                </Field>
                <Field id="taxValidity" label="Kontrol durumu" error={err('taxValidity')}>
                  <Select {...describe('taxValidity', err('taxValidity'))} {...register('taxValidity')}>
                    {TAX_VALIDITIES.filter((v) => v !== 'no_longer_used').map((v) => (
                      <option key={v} value={v}>
                        {TAX_VALIDITY_LABELS[v]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Section>
          </>
        )}

        {matches.length > 0 && (
          <div ref={duplicatesRef}>
            <CorporateDuplicatePanel
              matches={matches}
              acknowledged={acknowledged}
              onAcknowledge={(v) => {
                setAcknowledged(v)
                if (v) setHighlight(false)
              }}
              highlight={highlight && !acknowledged}
            />
          </div>
        )}

        <Section title="Diğer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="preferredLanguage" label="Yazışma dili" error={err('preferredLanguage')}>
              <Select {...describe('preferredLanguage', err('preferredLanguage'))} {...register('preferredLanguage')}>
                <option value="">Belirtilmedi</option>
                {CUSTOMER_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </Select>
            </Field>
            {mode === 'create' && session.branches.length > 1 && (
              <Field id="createdBranchId" label="Kaydın açıldığı şube" error={err('createdBranchId')} hint="Bilgi amaçlıdır; hesabı şirketin tüm yetkili kullanıcıları bulabilir.">
                <Select {...describe('createdBranchId', err('createdBranchId'), true)} {...register('createdBranchId')}>
                  <option value="">Belirtilmedi</option>
                  {session.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field id="note" label="Not" error={err('note')} hint="Hesapla ilgili kısa operasyon bilgisi. Kredi limiti ve ödeme koşulları Finans modülüyle gelecek.">
            <Textarea rows={3} {...describe('note', err('note'), true)} {...register('note')} />
          </Field>
        </Section>

        <p className="flex items-start gap-2 border-t border-line-soft pt-4 text-[12.5px] text-ink-3">
          <Info size={14} className="mt-[2px] shrink-0" />
          Kurumsal hesap ticari taraftır. Kişiler ve sürücüler ayrı müşteri kaydı olarak tutulur ve hesaba rolleriyle bağlanır; bilgileri burada kopyalanmaz.
        </p>
      </form>
    </Sheet>
  )
}
