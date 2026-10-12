import {
  ADDRESS_KINDS,
  addressInputSchema,
  CHANNEL_KINDS,
  channelInputSchema,
  type CorporateAddress,
  type CorporateChannel,
  type CorporateDetail,
  type CorporateDuplicateMatch,
  type CorporateTaxId,
  TAX_SCHEME_SUGGESTIONS,
  TAX_VALIDITIES,
  taxIdInputSchema,
  taxIdWarnings,
} from '@acarvo/shared'
import { EnvelopeSimple, Globe, Info, LinkSimple, MapPin, PencilSimple, Phone, Plus, Receipt, SpinnerGap, Star, Trash, WarningCircle } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { type ReactNode, useMemo, useState } from 'react'
import type { z } from 'zod'
import { describe, Field, Input, Select } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, corporateApi } from '@/lib/api'
import { ADDRESS_KIND_LABELS, CHANNEL_KIND_LABELS, TAX_VALIDITY_LABELS, TAX_WARNING_LABELS } from '@/lib/corporate-labels'
import { countryName, countryOptions } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'
import { btnPrimary, Panel, useAccountUpdated } from './ui'
import { CorporateDuplicatePanel } from './CorporateForm'

type RecordKind = 'channels' | 'tax-ids' | 'addresses'
type Values = Record<string, string>

const CHANNEL_ICONS = { phone: Phone, email: EnvelopeSimple, website: Globe, other: LinkSimple }

const PrimaryBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-md bg-blue-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-blue-ink">
    <Star size={11} weight="fill" />
    Birincil
  </span>
)

function CountryField({ id, label, value, onChange, error, required }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean }) {
  const session = useSession()
  const { frequent, all } = useMemo(() => countryOptions(session.company?.country), [session.company?.country])
  return (
    <Field id={id} label={label} error={error} required={required}>
      <Select {...describe(id, error)} value={value} onChange={(e) => onChange(e.target.value)}>
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

const SCHEMAS: Record<RecordKind, z.ZodType> = { channels: channelInputSchema, 'tax-ids': taxIdInputSchema, addresses: addressInputSchema }
const TITLES: Record<RecordKind, [string, string]> = {
  channels: ['İletişim kanalı ekle', 'İletişim kanalını düzenle'],
  'tax-ids': ['Vergi kimliği ekle', 'Vergi kimliğini düzenle'],
  addresses: ['Adres ekle', 'Adresi düzenle'],
}

/** Add / edit one channel, tax id or address in the side panel. Validated by the shared schema; the server decides. */
function RecordSheet({ a, kind, record, onClose }: { a: CorporateDetail; kind: RecordKind; record?: CorporateChannel | CorporateTaxId | CorporateAddress; onClose: () => void }) {
  const updated = useAccountUpdated(a.id)
  const initial = useMemo((): Values => {
    const r = (record ?? {}) as Record<string, unknown>
    const s = (k: string, d = '') => (r[k] == null ? d : String(r[k]))
    if (kind === 'channels') return { kind: s('kind', 'phone'), value: record ? s('value') : '', label: s('label') }
    if (kind === 'tax-ids') return { country: s('country', a.country), scheme: s('scheme'), value: s('value'), validity: s('validity', 'not_checked'), note: s('note') }
    return { kind: s('kind', 'billing'), label: s('label'), line1: s('line1'), line2: s('line2'), city: s('city'), postalCode: s('postalCode'), region: s('region'), country: s('country', a.country) }
  }, [a.country, kind, record])
  const [v, setV] = useState<Values>(initial)
  const [primary, setPrimary] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [matches, setMatches] = useState<CorporateDuplicateMatch[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || primary
  const set = (k: string) => (val: string) => {
    setV((p) => ({ ...p, [k]: val }))
    if (k === 'value' || k === 'kind') setMatches(null)
  }
  const err = (k: string) => errors[k]

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (record ? corporateApi.updateRecord(a.id, kind, record.id, { ...body, version: record.version }) : corporateApi.addRecord(a.id, kind, body)),
    onSuccess: (next) => {
      setSaved(true)
      updated(next)
      toast(record ? 'Kayıt güncellendi.' : 'Kayıt eklendi.')
      onClose()
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      if (e.code === 'POSSIBLE_DUPLICATE') {
        setServerError(null)
        return setMatches((e.details as { matches: CorporateDuplicateMatch[] }).matches)
      }
      if (e.code === 'VERSION_CONFLICT') updated()
      setErrors(e.fields ?? {})
      setServerError(e.message)
    },
  })

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    setServerError(null)
    const body: Record<string, unknown> = { ...v, ...(primary ? { isPrimary: true } : {}) }
    const r = SCHEMAS[kind].safeParse(body)
    if (!r.success) {
      const next: Record<string, string> = {}
      for (const i of r.error.issues) next[String(i.path[0])] ??= i.message
      return setErrors(next)
    }
    setErrors({})
    if (matches?.some((m) => m.strength === 'strong') && !acknowledged) return setServerError('Benzer hesapları kontrol edin; ayrı bir şirketse onay kutusunu işaretleyin.')
    save.mutate({ ...body, ...(acknowledged ? { duplicateAcknowledged: true } : {}) })
  }

  const isPrimaryNow = !!(record as { isPrimary?: boolean } | undefined)?.isPrimary
  const hints = kind === 'tax-ids' && v.value && v.scheme ? taxIdWarnings(v.country, v.scheme.trim().toUpperCase(), v.value) : []
  return (
    <Sheet
      title={TITLES[kind][record ? 1 : 0]}
      subtitle={`${a.legalName} · ${a.accountNo}`}
      onClose={onClose}
      dirty={dirty && !saved}
      footer={
        <>
          <button type="submit" form="record-form" disabled={save.isPending} className={btnPrimary}>
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            Kaydet
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
            Vazgeç
          </button>
        </>
      }
    >
      <form id="record-form" noValidate onSubmit={submit} className="space-y-4">
        {serverError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
            <WarningCircle size={17} className="mt-px shrink-0" />
            {serverError}
          </p>
        )}
        {kind === 'channels' && (
          <>
            <Field id="ch-kind" label="Tür" required error={err('kind')}>
              <Select {...describe('ch-kind', err('kind'))} value={v.kind} onChange={(e) => set('kind')(e.target.value)}>
                {CHANNEL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CHANNEL_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="ch-value" label={CHANNEL_KIND_LABELS[v.kind as 'phone'] ?? 'Değer'} required error={err('value')} hint={v.kind === 'phone' ? 'Ülke kodu yazılmazsa şirket ülkesinin kodu kabul edilir.' : undefined}>
              <Input {...describe('ch-value', err('value'), v.kind === 'phone')} autoComplete="off" value={v.value} onChange={(e) => set('value')(e.target.value)} />
            </Field>
            <Field id="ch-label" label="Etiket" error={err('label')} hint="İsteğe bağlı, örneğin “Muhasebe” veya “Filo yönetimi”">
              <Input {...describe('ch-label', err('label'), true)} autoComplete="off" value={v.label} onChange={(e) => set('label')(e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'tax-ids' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <CountryField id="tax-country" label="Ülke" required value={v.country} onChange={set('country')} error={err('country')} />
              <Field id="tax-scheme" label="Tür" required error={err('scheme')} hint="Örneğin VAT, PDV, JIB, VKN, EIN">
                <Input list="record-tax-schemes" {...describe('tax-scheme', err('scheme'), true)} autoComplete="off" value={v.scheme} onChange={(e) => set('scheme')(e.target.value)} />
              </Field>
            </div>
            <datalist id="record-tax-schemes">
              {TAX_SCHEME_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Field
              id="tax-value"
              label="Vergi kimliği"
              required
              error={err('value')}
              hint={hints.length ? <span className="font-medium text-hold">Uyarı: {hints.map((w) => TAX_WARNING_LABELS[w]).join('; ')}. Kayıt yine de yapılabilir.</span> : 'Biçim yalnız uyarı olarak denetlenir; numaranın geçerliliği hukuken doğrulanmaz.'}
            >
              <Input {...describe('tax-value', err('value'), true)} autoComplete="off" value={v.value} onChange={(e) => set('value')(e.target.value)} />
            </Field>
            <Field id="tax-validity" label="Kontrol durumu" error={err('validity')}>
              <Select {...describe('tax-validity', err('validity'))} value={v.validity} onChange={(e) => set('validity')(e.target.value)}>
                {TAX_VALIDITIES.map((x) => (
                  <option key={x} value={x}>
                    {TAX_VALIDITY_LABELS[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="tax-note" label="Açıklama" error={err('note')}>
              <Input {...describe('tax-note', err('note'))} autoComplete="off" value={v.note} onChange={(e) => set('note')(e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'addresses' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ad-kind" label="Adres türü" required error={err('kind')}>
                <Select {...describe('ad-kind', err('kind'))} value={v.kind} onChange={(e) => set('kind')(e.target.value)}>
                  {ADDRESS_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ADDRESS_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="ad-label" label="Etiket" error={err('label')}>
                <Input {...describe('ad-label', err('label'))} autoComplete="off" placeholder="örneğin Merkez ofis" value={v.label} onChange={(e) => set('label')(e.target.value)} />
              </Field>
            </div>
            <Field id="ad-line1" label="Açık adres" required error={err('line1')}>
              <Input {...describe('ad-line1', err('line1'))} autoComplete="off" value={v.line1} onChange={(e) => set('line1')(e.target.value)} />
            </Field>
            <Field id="ad-line2" label="Adres (2. satır)" error={err('line2')}>
              <Input {...describe('ad-line2', err('line2'))} autoComplete="off" value={v.line2} onChange={(e) => set('line2')(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <Field id="ad-city" label="Şehir" required error={err('city')}>
                <Input {...describe('ad-city', err('city'))} autoComplete="off" value={v.city} onChange={(e) => set('city')(e.target.value)} />
              </Field>
              <Field id="ad-postal" label="Posta kodu" error={err('postalCode')}>
                <Input {...describe('ad-postal', err('postalCode'))} autoComplete="off" value={v.postalCode} onChange={(e) => set('postalCode')(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ad-region" label="Bölge / eyalet" error={err('region')}>
                <Input {...describe('ad-region', err('region'))} autoComplete="off" value={v.region} onChange={(e) => set('region')(e.target.value)} />
              </Field>
              <CountryField id="ad-country" label="Ülke" required value={v.country} onChange={set('country')} error={err('country')} />
            </div>
          </>
        )}
        {!isPrimaryNow && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-[13.5px]">
            <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
            <span>
              <span className="font-medium text-ink">Birincil yap</span>
              <span className="block text-[12.5px] text-ink-2">
                {kind === 'tax-ids' ? 'Hesabın birincil vergi kimliği olur; öncekinin işareti kalkar.' : 'Bu türün birincil kaydı olur; aynı türdeki öncekinin işareti kalkar. Türün ilk kaydı kendiliğinden birincildir.'}
              </span>
            </span>
          </label>
        )}
        {matches && matches.length > 0 && <CorporateDuplicatePanel matches={matches} acknowledged={acknowledged} onAcknowledge={setAcknowledged} highlight={!acknowledged} />}
      </form>
    </Sheet>
  )
}

function RemoveDialog({ a, kind, record, title, onClose }: { a: CorporateDetail; kind: RecordKind; record: { id: string; version: number; isPrimary: boolean }; title: string; onClose: () => void }) {
  const updated = useAccountUpdated(a.id)
  const returnFocus = useReturnFocus()
  const [error, setError] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: () => corporateApi.removeRecord(a.id, kind, record.id, record.version),
    onSuccess: (next) => {
      updated(next)
      toast(record.isPrimary && next.promotedAddressId !== null ? 'Kayıt kaldırıldı; aynı türden en eski kayıt birincil yapıldı.' : 'Kayıt kaldırıldı.')
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') updated()
      setError(e instanceof ApiRequestError ? e.message : 'Kaldırılamadı. Bağlantınızı kontrol edin.')
    },
  })
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            Kayıt hesaptan kaldırılır ama silinmez; kaldırma işlemi geçmişte görünür.
            {record.isPrimary && ' Bu kayıt birincil: aynı türden en eski kayıt birincil yapılır.'}
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-[13px] font-medium text-alert">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
            <button type="button" onClick={() => m.mutate()} disabled={m.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-alert px-4 font-medium text-white hover:opacity-90 disabled:opacity-60">
              {m.isPending && <SpinnerGap size={16} className="animate-spin" />}
              Kaldır
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RowActions({ editable, label, onEdit, onRemove }: { editable: boolean; label: string; onEdit: () => void; onRemove: () => void }) {
  if (!editable) return null
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" onClick={onEdit} aria-label={`${label} düzenle`} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
        <PencilSimple size={16} />
      </button>
      <button type="button" onClick={onRemove} aria-label={`${label} kaldır`} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-alert-soft hover:text-alert">
        <Trash size={16} />
      </button>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
      <Plus size={14} weight="bold" />
      {label}
    </button>
  )
}

function useRecordDialogs(a: CorporateDetail, kind: RecordKind, removeTitle: string) {
  const [editing, setEditing] = useState<CorporateChannel | CorporateTaxId | CorporateAddress | 'new' | null>(null)
  const [removing, setRemoving] = useState<{ id: string; version: number; isPrimary: boolean } | null>(null)
  const dialogs: ReactNode = (
    <>
      {editing && <RecordSheet a={a} kind={kind} record={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog a={a} kind={kind} record={removing} title={removeTitle} onClose={() => setRemoving(null)} />}
    </>
  )
  return { add: () => setEditing('new'), edit: setEditing, remove: setRemoving, dialogs }
}

export function ChannelsPanel({ a, editable }: { a: CorporateDetail; editable: boolean }) {
  const d = useRecordDialogs(a, 'channels', 'İletişim kanalını kaldır')
  return (
    <Panel title="İletişim kanalları" action={editable ? <AddButton label="Kanal ekle" onClick={d.add} /> : undefined}>
      {a.channels.length ? (
        <ul className="divide-y divide-line-soft">
          {a.channels.map((c) => {
            const Ico = CHANNEL_ICONS[c.kind]
            const href = c.kind === 'phone' ? `tel:${c.value.replace(/\s/g, '')}` : c.kind === 'email' ? `mailto:${c.value}` : undefined
            return (
              <li key={c.id} className="flex min-h-12 items-center gap-3 py-2">
                <Ico size={17} className="shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {href ? (
                      <a href={href} className="tnum font-medium break-all text-blue-ink hover:underline">
                        {c.value}
                      </a>
                    ) : (
                      <span className="font-medium break-all text-ink">{c.value}</span>
                    )}
                    {c.isPrimary && <PrimaryBadge />}
                  </div>
                  <span className="text-[12.5px] text-ink-2">{[CHANNEL_KIND_LABELS[c.kind], c.label].filter(Boolean).join(' · ')}</span>
                </div>
                <RowActions editable={editable} label={`${CHANNEL_KIND_LABELS[c.kind]} ${c.value}`} onEdit={() => d.edit(c)} onRemove={() => d.remove(c)} />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-ink-2">İletişim kanalı girilmemiş.</p>
      )}
      {d.dialogs}
    </Panel>
  )
}

export function AddressesTab({ a, editable }: { a: CorporateDetail; editable: boolean }) {
  const d = useRecordDialogs(a, 'addresses', 'Adresi kaldır')
  return (
    <Panel title="Adresler" id="addresses-title" action={editable ? <AddButton label="Adres ekle" onClick={d.add} /> : undefined}>
      {a.addresses.length ? (
        <div className="space-y-5">
          {ADDRESS_KINDS.filter((k) => a.addresses.some((x) => x.kind === k)).map((k) => (
            <div key={k}>
              <h3 className="mb-2 text-[12.5px] font-semibold tracking-[0.01em] text-ink-2">{ADDRESS_KIND_LABELS[k]}</h3>
              <ul className="grid gap-3 md:grid-cols-2">
                {a.addresses
                  .filter((x) => x.kind === k)
                  .map((x) => (
                    <li key={x.id} className={cn('flex gap-3 rounded-lg border p-3.5', x.isPrimary ? 'border-blue/35 bg-blue-soft/25' : 'border-line')}>
                      <MapPin size={17} className="mt-0.5 shrink-0 text-ink-3" />
                      <address className="min-w-0 flex-1 text-[13.5px] leading-relaxed not-italic">
                        <span className="flex flex-wrap items-center gap-2">
                          {x.label && <span className="font-medium text-ink">{x.label}</span>}
                          {x.isPrimary && <PrimaryBadge />}
                        </span>
                        <span className="block break-words text-ink">{[x.line1, x.line2].filter(Boolean).join(', ')}</span>
                        <span className="block text-ink-2">{[[x.postalCode, x.city].filter(Boolean).join(' '), x.region, countryName(x.country)].filter(Boolean).join(' · ')}</span>
                      </address>
                      <RowActions editable={editable} label={`${ADDRESS_KIND_LABELS[x.kind]} ${x.city}`} onEdit={() => d.edit(x)} onRemove={() => d.remove(x)} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-ink-2">
          <MapPin size={16} className="text-ink-3" />
          Adres girilmemiş.
        </p>
      )}
      <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Her adres türünde bir birincil adres olur. Faturalama ileride o anki fatura adresinin kopyasını alır; adresi değiştirmek eski belgeleri değiştirmez.
      </p>
      {d.dialogs}
    </Panel>
  )
}

export function TaxIdsTab({ a, editable }: { a: CorporateDetail; editable: boolean }) {
  const d = useRecordDialogs(a, 'tax-ids', 'Vergi kimliğini kaldır')
  return (
    <Panel title="Vergi bilgileri" action={editable ? <AddButton label="Vergi kimliği ekle" onClick={d.add} /> : undefined}>
      {a.taxIds.length ? (
        <ul className="divide-y divide-line-soft">
          {a.taxIds.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-3">
              <Receipt size={17} className="mt-0.5 shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tnum font-medium break-all text-ink">{t.value}</span>
                  {t.isPrimary && <PrimaryBadge />}
                </div>
                <p className="text-[12.5px] text-ink-2">
                  {t.scheme} · {countryName(t.country)} · {TAX_VALIDITY_LABELS[t.validity]}
                  {t.note && ` · ${t.note}`}
                </p>
                {t.warnings.length > 0 && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-hold">
                    <WarningCircle size={14} className="mt-[2px] shrink-0" />
                    {t.warnings.map((w) => TAX_WARNING_LABELS[w]).join('; ')} (yalnız uyarı)
                  </p>
                )}
              </div>
              <RowActions editable={editable} label={`${t.scheme} ${t.value}`} onEdit={() => d.edit(t)} onRemove={() => d.remove(t)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">Vergi kimliği girilmemiş.</p>
      )}
      <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Farklı ülkelerden birden fazla vergi kimliği eklenebilir. ACARVO bir vergi numarasının hukuken geçerli olup olmadığına karar vermez; kontrol durumu personelin yaptığı kontrolü gösterir.
      </p>
      {d.dialogs}
    </Panel>
  )
}
