import {
  CUSTOMER_DOCUMENT_TYPE_INFO,
  CUSTOMER_DOCUMENT_TYPES,
  CUSTOMER_DOCUMENT_VOID_REASONS,
  type CustomerDetail,
  type CustomerDocument,
  type CustomerDocumentFile,
  type CustomerDocumentSide,
  type CustomerDocumentType,
  NUMBER_REVEAL_REASONS,
  type RequirementItemResult,
} from '@acarvo/shared'
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  CheckCircle,
  Eye,
  EyeSlash,
  FileImage,
  FilePdf,
  Files,
  IdentificationCard,
  Info,
  LockSimple,
  type Icon,
  Plus,
  ShieldCheck,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
  XCircle,
  DownloadSimple,
  Prohibit,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, customerDocumentsApi } from '@/lib/api'
import {
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_STATE_LABELS,
  REQUIREMENT_STATE_TONE,
  REVEAL_REASON_LABELS,
  SIDE_LABELS,
  TONE_TEXT,
  type Tone,
  validityText,
  VERIFICATION_LABELS,
  VOID_REASON_LABELS,
} from '@/lib/customer-document-labels'
import { countryName, countryOptions, RESIDENCY_LABELS } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

// ---------------------------------------------------------------------------
// Shared bits

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-line-soft disabled:opacity-60'
const btnGhost = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-60'

const TONE_ICON: Record<Tone, Icon> = { ok: CheckCircle, hold: WarningCircle, alert: XCircle, muted: Info }

function useDocsKeys(customerId: string) {
  const session = useSession()
  return {
    list: ['customer-documents', session.company?.id, customerId],
    status: ['customer-document-status', session.company?.id, customerId],
    history: ['customer-document-history', session.company?.id],
  } as const
}

function usePermissions(customer: CustomerDetail) {
  const session = useSession()
  return {
    read: can(session, 'customers.documents.read'),
    manage: can(session, 'customers.documents.manage') && customer.status === 'active',
    view: can(session, 'customers.documents.view'),
    download: can(session, 'customers.documents.download'),
    reveal: can(session, 'customers.identity.reveal'),
    settings: can(session, 'settings.documents.manage'),
    branches: can(session, 'branches.manage'),
  }
}

const typeTitle = (d: Pick<CustomerDocument, 'type' | 'title'>) => (d.type === 'other' && d.title ? d.title : DOCUMENT_TYPE_LABELS[d.type])
const sizeText = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

// ---------------------------------------------------------------------------
// Requirement status (information only; the residency class is decided by staff at rental time)

function RequirementItemRow({ item }: { item: RequirementItemResult }) {
  const tone = REQUIREMENT_STATE_TONE[item.state]
  const Ico = TONE_ICON[tone]
  return (
    <li className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
      <Ico size={17} weight={tone === 'ok' ? 'fill' : 'regular'} className={cn('mt-px shrink-0', TONE_TEXT[tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-ink">{item.acceptedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(' veya ')}</p>
        {(item.originalSeenRequired || item.copyRequired) && (
          <p className="text-[12.5px] text-ink-3">{[item.originalSeenRequired && 'aslı görülmeli', item.copyRequired && 'kopyası saklanmalı'].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <span className={cn('shrink-0 text-right text-[13px] font-medium', TONE_TEXT[tone])}>
        {REQUIREMENT_STATE_LABELS[item.state]}
        {item.state === 'expiring' && item.daysLeft !== null && <span className="block text-[12px] font-normal">{item.daysLeft} gün</span>}
      </span>
    </li>
  )
}

function RequirementStatus({ customer }: { customer: CustomerDetail }) {
  const keys = useDocsKeys(customer.id)
  const perms = usePermissions(customer)
  const status = useQuery({ queryKey: keys.status, queryFn: () => customerDocumentsApi.status(customer.id) })
  if (status.isPending) return <div className="h-32 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Belge durumu yükleniyor" />
  if (status.isError) return <ErrorState message={`Belge durumu yüklenemedi. ${status.error.message}`} onRetry={() => status.refetch()} />
  const s = status.data
  return (
    <section aria-label="Belge durumu" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 py-3.5">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Ülke belge gereksinimlerine göre durum</h2>
        <span className="text-[12.5px] text-ink-2">
          Kayıtlı ikamet ülkesi: <span className="font-medium text-ink">{countryName(s.residenceCountry) ?? 'girilmemiş'}</span>
        </span>
      </div>
      {s.countries.length === 0 ? (
        <p className="flex items-start gap-2 px-5 py-4 text-[13.5px] text-ink-2">
          <Info size={16} className="mt-px shrink-0 text-ink-3" />
          <span>
            Şube ülkeleri tanımlanmadığı için ülke gereksinimleri değerlendirilemiyor.{' '}
            {perms.branches && (
              <Link to="/subeler" className="font-medium text-blue hover:underline">
                Şube ülkelerini girin
              </Link>
            )}
          </span>
        </p>
      ) : (
        <div className="divide-y divide-line-soft">
          {s.countries.map((c) => (
            <div key={c.country} className="px-5 py-4">
              <p className="mb-2.5 text-[13px] font-medium text-ink-2">
                {countryName(c.country)} şubeleri {c.branchCount > 0 && <span className="text-ink-3">· {c.branchCount} şube</span>}
              </p>
              {c.classes.length === 0 ? (
                <p className="text-[13.5px] text-ink-2">
                  Bu ülke için etkin belge gereksinimi yok. Belgeler kaydedilebilir; zorunluluk gösterilmez.{' '}
                  {perms.settings && (
                    <Link to="/ayarlar" className="font-medium text-blue hover:underline">
                      Gereksinimleri tanımla
                    </Link>
                  )}
                </p>
              ) : (
                <div className={cn('grid gap-3', c.classes.length > 1 && 'md:grid-cols-2')}>
                  {c.classes.map((cl) => (
                    <div key={cl.policyId} className="rounded-lg border border-line-soft bg-ground/40 px-3.5 py-3">
                      <p className="mb-2 text-[13px] font-semibold text-ink">
                        {RESIDENCY_LABELS[cl.residencyClass]} olarak değerlendirilirse <span className="font-normal text-ink-3">· sürüm {cl.version}</span>
                      </p>
                      <ul className="divide-y divide-line-soft text-[13.5px]">
                        {cl.items.map((item, i) => (
                          <RequirementItemRow key={i} item={item} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="flex items-start gap-1.5 border-t border-line-soft px-5 py-2.5 text-[12.5px] text-ink-2">
        <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Kiralamada Yerli/Yabancı (ikamet) kararını personel, kiralamanın başladığı şubenin ülkesine göre verir. Bu özet karar vermez ve hiçbir işlemi engellemez.
        {s.branchesWithoutCountry > 0 && ` Ülkesi tanımlanmamış ${s.branchesWithoutCountry} şube değerlendirmeye alınmadı.`}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Number reveal (owner role; reason; 30 seconds; no copy button)

function RevealDialog({ customerId, doc, onClose }: { customerId: string; doc: CustomerDocument; onClose: () => void }) {
  const returnFocus = useReturnFocus()
  const qc = useQueryClient()
  const keys = useDocsKeys(customerId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<{ number: string; until: number; remaining: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const reveal = useMutation({
    // The number is copied into local state only; nothing is kept in the query/mutation cache.
    gcTime: 0,
    mutationFn: () => customerDocumentsApi.reveal(customerId, doc.id, reason),
    onSuccess: (r) => {
      const start = Date.now()
      setNow(start)
      // The reveal is recorded in the document history (without the number).
      void qc.invalidateQueries({ queryKey: keys.history })
      setShown({ number: r.number, until: start + r.visibleSeconds * 1000, remaining: r.remainingThisHour })
      reveal.reset()
    },
    onError: (e) => setError(e instanceof ApiRequestError ? (e.fields?.reason ?? e.message) : 'Numara açılamadı.'),
  })
  useEffect(() => {
    if (!shown) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [shown])
  const left = shown ? Math.max(0, Math.ceil((shown.until - now) / 1000)) : 0
  // The number leaves memory when the time is up or the dialog closes.
  useEffect(() => {
    if (shown && left === 0) setShown((s) => (s ? { ...s, number: '' } : s))
  }, [left, shown])
  useEffect(() => () => setShown(null), [])
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">Tam belge numarası</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {typeTitle(doc)} · {countryName(doc.issuingCountry) ?? '—'}. Açma işlemi gerekçesiyle işlem geçmişine yazılır; numaranın kendisi yazılmaz.
          </Dialog.Description>
          {!shown ? (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!reason) return setError('Numarayı açma nedenini seçin')
                setError(null)
                reveal.mutate()
              }}
            >
              <Field id="reveal-reason" label="Neden" required error={error ?? undefined}>
                <Select id="reveal-reason" aria-invalid={error ? true : undefined} aria-describedby={error ? 'reveal-reason-error' : undefined} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Seçin</option>
                  {NUMBER_REVEAL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {REVEAL_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
                <button type="submit" disabled={reveal.isPending} className={btnPrimary}>
                  {reveal.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <Eye size={16} />}
                  Numarayı göster
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              {left > 0 ? (
                <div role="status" aria-live="polite" className="rounded-lg border border-line bg-ground/60 px-4 py-3">
                  <p className="tnum text-[22px] font-semibold tracking-[0.08em] break-all text-ink" data-testid="revealed-number">
                    {shown.number}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-2">{left} saniye sonra gizlenecek · bu saat içinde {shown.remaining} açma hakkınız kaldı</p>
                </div>
              ) : (
                <p role="status" className="flex items-center gap-2 rounded-lg bg-ground/60 px-4 py-3 text-[13.5px] text-ink-2">
                  <EyeSlash size={16} /> Numara gizlendi.
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                {left > 0 && (
                  <button type="button" onClick={() => setShown((s) => (s ? { ...s, number: '', until: 0 } : s))} className={btnSecondary}>
                    <EyeSlash size={15} /> Gizle
                  </button>
                )}
                <Dialog.Close className="h-9 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Kapat</Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------------------
// Void (reason from a fixed list; final)

function VoidDialog({ customerId, doc, onClose }: { customerId: string; doc: CustomerDocument; onClose: () => void }) {
  const qc = useQueryClient()
  const keys = useDocsKeys(customerId)
  const returnFocus = useReturnFocus()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => customerDocumentsApi.void(customerId, doc.id, { version: doc.version, reason, note: note || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.list })
      void qc.invalidateQueries({ queryKey: keys.status })
      toast(`${typeTitle(doc)} geçersiz sayıldı.`)
      onClose()
    },
    onError: (e) => setError(e instanceof ApiRequestError ? (e.fields?.reason ?? e.message) : 'Kaydedilemedi.'),
  })
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">Belgeyi geçersiz say</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {typeTitle(doc)} kaydı ve dosyaları silinmez; geçmişte “geçersiz sayıldı” olarak kalır. Bu işlem geri alınamaz.
          </Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason) return setError('Geçersiz sayma nedenini seçin')
              setError(null)
              save.mutate()
            }}
          >
            <Field id="void-reason" label="Neden" required error={error ?? undefined}>
              <Select id="void-reason" aria-invalid={error ? true : undefined} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Seçin</option>
                {CUSTOMER_DOCUMENT_VOID_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {VOID_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="void-note" label="Açıklama" hint="İsteğe bağlı. Belge numarası veya kişisel bilgi yazmayın.">
              <Textarea id="void-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={save.isPending} className={cn(btnPrimary, 'bg-alert hover:bg-alert/90')}>
                {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
                Geçersiz say
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------------------
// Add / correct / renew

interface FormState {
  type: string
  issuingCountry: string
  issuingAuthority: string
  title: string
  number: string
  keepNumber: boolean
  issuedOn: string
  validFrom: string
  validUntil: string
  licenseCategories: string
  licenseFirstIssuedOn: string
  entryDate: string
  note: string
  verification: string
}

function DocumentFormSheet({ customer, mode, doc, onClose, onSaved }: { customer: CustomerDetail; mode: 'create' | 'edit' | 'renew'; doc?: CustomerDocument; onClose: () => void; onSaved: (d: CustomerDocument) => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const keys = useDocsKeys(customer.id)
  const countries = useMemo(() => countryOptions(session.company?.country), [session.company?.country])
  const initial: FormState = {
    type: doc?.type ?? '',
    issuingCountry: doc?.issuingCountry ?? '',
    issuingAuthority: doc?.issuingAuthority ?? '',
    title: doc?.title ?? '',
    number: '',
    keepNumber: mode === 'renew' && !!doc?.maskedNumber,
    issuedOn: mode === 'edit' ? (doc?.issuedOn ?? '') : '',
    validFrom: mode === 'edit' ? (doc?.validFrom ?? '') : '',
    validUntil: mode === 'edit' ? (doc?.validUntil ?? '') : '',
    licenseCategories: doc?.licenseCategories.join(', ') ?? '',
    licenseFirstIssuedOn: doc?.licenseFirstIssuedOn ?? '',
    entryDate: mode === 'edit' ? (doc?.entryDate ?? '') : '',
    note: mode === 'edit' ? (doc?.note ?? '') : '',
    verification: 'not_verified',
  }
  const [v, setV] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<ReactNode>(null)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const type = v.type as CustomerDocumentType | ''
  const info = type ? CUSTOMER_DOCUMENT_TYPE_INFO[type] : null
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))
  const err = (k: string) => errors[k]

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        issuingCountry: v.issuingCountry,
        issuingAuthority: v.issuingAuthority,
        title: info?.title ? v.title : undefined,
        number: info?.number === 'none' || (mode === 'renew' && v.keepNumber) ? undefined : v.number,
        issuedOn: v.issuedOn,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        licenseCategories: info?.licence ? v.licenseCategories : undefined,
        licenseFirstIssuedOn: info?.licence ? v.licenseFirstIssuedOn : undefined,
        entryDate: info?.entryDate ? v.entryDate : undefined,
        note: v.note,
      }
      if (mode === 'create') return customerDocumentsApi.create(customer.id, { ...body, type: v.type, verification: v.verification })
      if (mode === 'edit') return customerDocumentsApi.update(customer.id, doc!.id, { ...body, version: doc!.version })
      return customerDocumentsApi.renew(customer.id, doc!.id, { ...body, verification: v.verification, keepNumber: v.keepNumber, version: doc!.version })
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: keys.list })
      void qc.invalidateQueries({ queryKey: keys.status })
      void qc.invalidateQueries({ queryKey: keys.history })
      void qc.invalidateQueries({ queryKey: ['customer-history', session.company?.id, customer.id] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
      toast(mode === 'create' ? `${typeTitle(d)} eklendi.` : mode === 'edit' ? `${typeTitle(d)} düzeltildi.` : `${typeTitle(d)} için yeni dönem açıldı.`)
      onSaved(d)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
      setErrors(e.fields ?? {})
      if (e.code === 'DOCUMENT_NUMBER_IN_USE') {
        const other = (e.details as { otherCustomer?: { customerNo: string; displayName: string } } | null)?.otherCustomer
        return setServerError(other ? `Bu belge numarası ${other.displayName} (${other.customerNo}) adlı müşteride kayıtlı. Aynı kişiyse belgeyi o kayda ekleyin.` : e.message)
      }
      if (e.code === 'VERSION_CONFLICT') {
        void qc.invalidateQueries({ queryKey: keys.list })
        return setServerError('Bu belge siz düzenlerken başka bir kullanıcı tarafından güncellendi. Paneli kapatıp güncel bilgilerle yeniden açın.')
      }
      setServerError(e.message)
    },
  })

  const title = mode === 'create' ? 'Belge ekle' : mode === 'edit' ? 'Belgeyi düzelt' : 'Yeni dönem aç'
  const subtitle = mode === 'create' ? `${customer.displayName} · ${customer.customerNo}` : `${typeTitle(doc!)} · ${countryName(doc!.issuingCountry) ?? '—'}`
  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      dirty={dirty && !save.isSuccess}
      footer={
        <>
          <button type="submit" form="customer-document-form" disabled={save.isPending} className={btnPrimary}>
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            {mode === 'create' ? 'Belgeyi kaydet' : mode === 'edit' ? 'Düzeltmeyi kaydet' : 'Yeni dönemi kaydet'}
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
            Vazgeç
          </button>
        </>
      }
    >
      <form
        id="customer-document-form"
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setServerError(null)
          if (mode === 'create' && !v.type) return setErrors({ type: 'Belge türünü seçin' })
          setErrors({})
          save.mutate()
        }}
      >
        {serverError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
            <WarningCircle size={17} className="mt-px shrink-0" />
            {serverError}
          </p>
        )}
        {mode === 'renew' && (
          <p className="flex items-start gap-2 rounded-lg bg-ground/70 px-3 py-2.5 text-[12.5px] text-ink-2">
            <Info size={14} className="mt-[2px] shrink-0 text-ink-3" />
            Önceki dönem ve dosyaları değişmeden kalır; yeni dönem ayrı bir kayıt olarak açılır.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'create' ? (
            <Field id="doc-type" label="Belge türü" required error={err('type')}>
              <Select {...describe('doc-type', err('type'))} value={v.type} onChange={set('type')}>
                <option value="">Seçin</option>
                {CUSTOMER_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                Belge türü <LockSimple size={13} className="text-ink-3" aria-label="değiştirilemez" />
              </p>
              <p className="flex h-10 items-center rounded-lg border border-dashed border-line bg-ground/50 px-3 text-ink-2">{DOCUMENT_TYPE_LABELS[doc!.type]}</p>
            </div>
          )}
          <Field id="doc-country" label={type === 'entry_record' ? 'Giriş yapılan ülke' : 'Düzenleyen ülke'} required={type !== 'other'} error={err('issuingCountry')}>
            <Select {...describe('doc-country', err('issuingCountry'))} value={v.issuingCountry} onChange={set('issuingCountry')}>
              <option value="">Seçin</option>
              <optgroup label="Sık kullanılanlar">
                {countries.frequent.map((c) => (
                  <option key={`f-${c.code}`} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Tüm ülkeler">
                {countries.all.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
        </div>
        {info?.title && (
          <Field id="doc-title" label="Belge adı" required error={err('title')}>
            <Input {...describe('doc-title', err('title'))} maxLength={80} value={v.title} onChange={set('title')} />
          </Field>
        )}
        {info && info.number !== 'none' && (
          <div className="space-y-2">
            {mode === 'renew' && doc?.maskedNumber && (
              <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-ink">
                <input type="checkbox" checked={v.keepNumber} onChange={(e) => setV((s) => ({ ...s, keepNumber: e.target.checked }))} className="size-4 accent-[var(--ac-blue)]" />
                Önceki dönemin numarası aynı kalsın ({doc.maskedNumber})
              </label>
            )}
            {!(mode === 'renew' && v.keepNumber) && (
              <Field
                id="doc-number"
                label={mode === 'edit' ? 'Yeni belge numarası' : 'Belge numarası'}
                required={mode !== 'edit' && info.number === 'required'}
                error={err('number')}
                hint={
                  mode === 'edit'
                    ? `Kayıtlı numara: ${doc?.maskedNumber ?? 'yok'}. Değiştirmek için yazın; boş bırakılırsa kayıtlı numara korunur.`
                    : 'Numara şifreli saklanır; ekranlarda yalnız son karakterleri görünür.'
                }
              >
                <Input {...describe('doc-number', err('number'), true)} autoComplete="off" spellCheck={false} maxLength={60} value={v.number} onChange={set('number')} />
              </Field>
            )}
          </div>
        )}
        <Field id="doc-authority" label="Düzenleyen kurum" hint="İsteğe bağlı (ör. emniyet müdürlüğü)." error={err('issuingAuthority')}>
          <Input {...describe('doc-authority', err('issuingAuthority'), true)} maxLength={120} value={v.issuingAuthority} onChange={set('issuingAuthority')} />
        </Field>
        {info?.entryDate ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="doc-entry" label="Giriş tarihi" required error={err('entryDate')}>
              <Input type="date" {...describe('doc-entry', err('entryDate'))} value={v.entryDate} onChange={set('entryDate')} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="doc-issued" label="Düzenlenme" error={err('issuedOn')}>
              <Input type="date" {...describe('doc-issued', err('issuedOn'))} value={v.issuedOn} onChange={set('issuedOn')} />
            </Field>
            <Field id="doc-from" label="Geçerlilik başlangıcı" error={err('validFrom')}>
              <Input type="date" {...describe('doc-from', err('validFrom'))} value={v.validFrom} onChange={set('validFrom')} />
            </Field>
            <Field id="doc-until" label="Son geçerlilik" error={err('validUntil')}>
              <Input type="date" {...describe('doc-until', err('validUntil'))} value={v.validUntil} onChange={set('validUntil')} />
            </Field>
          </div>
        )}
        {info?.licence && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="doc-categories" label="Sınıflar" hint="Virgülle ayırın, örneğin B, BE" error={err('licenseCategories')}>
              <Input {...describe('doc-categories', err('licenseCategories'), true)} value={v.licenseCategories} onChange={set('licenseCategories')} />
            </Field>
            <Field id="doc-first" label="İlk veriliş tarihi" error={err('licenseFirstIssuedOn')}>
              <Input type="date" {...describe('doc-first', err('licenseFirstIssuedOn'))} value={v.licenseFirstIssuedOn} onChange={set('licenseFirstIssuedOn')} />
            </Field>
          </div>
        )}
        {mode !== 'edit' && (
          <Field id="doc-verification" label="Doğrulama" hint="Belgenin aslını gördüyseniz işaretleyin. Daha sonra da işaretlenebilir.">
            <Select {...describe('doc-verification', undefined, true)} value={v.verification} onChange={set('verification')}>
              <option value="not_verified">{VERIFICATION_LABELS.not_verified}</option>
              <option value="original_seen">{VERIFICATION_LABELS.original_seen}</option>
              <option value="copy_only">{VERIFICATION_LABELS.copy_only}</option>
            </Select>
          </Field>
        )}
        <Field id="doc-note" label="Açıklama" hint="İsteğe bağlı. Belge numarası veya kişisel değerlendirme yazmayın." error={err('note')}>
          <Textarea {...describe('doc-note', err('note'), true)} rows={2} maxLength={300} value={v.note} onChange={set('note')} />
        </Field>
        <p className="flex items-start gap-2 border-t border-line-soft pt-4 text-[12.5px] text-ink-3">
          <ShieldCheck size={14} className="mt-[2px] shrink-0" />
          Dosyaları (ön yüz, arka yüz, ek sayfa) belge kaydedildikten sonra ayrıntı panelinden ekleyebilirsiniz; dosyalar şifreli saklanır.
        </p>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Files: view / download through short-lived grants; upload per side

function useFileActions() {
  const session = useSession()
  const qc = useQueryClient()
  // Each request is recorded in the document history; refresh it once the grant exists.
  const recorded = () => void qc.invalidateQueries({ queryKey: ['customer-document-history', session.company?.id] })
  const [busy, setBusy] = useState<string | null>(null)
  const fail = (e: unknown) => toast(e instanceof ApiRequestError ? e.message : 'Dosya açılamadı. Bağlantınızı kontrol edip yeniden deneyin.')
  const view = async (f: CustomerDocumentFile) => {
    // Open the tab inside the click so pop-up blockers allow it; point it at the file once the grant exists.
    const tab = window.open('', '_blank')
    setBusy(`${f.id}:view`)
    try {
      const { url } = await customerDocumentsApi.access(f.id, 'view')
      recorded()
      if (tab) {
        tab.opener = null
        tab.location.replace(url)
      } else toast('Tarayıcı yeni sekmeyi engelledi. Bu site için açılır pencerelere izin verip yeniden deneyin.')
    } catch (e) {
      tab?.close()
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  const download = async (f: CustomerDocumentFile) => {
    setBusy(`${f.id}:download`)
    try {
      const { url } = await customerDocumentsApi.access(f.id, 'download')
      recorded()
      const a = document.createElement('a')
      a.href = url
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  return { view, download, busy }
}

function FileRow({ f, perms }: { f: CustomerDocumentFile; perms: ReturnType<typeof usePermissions> }) {
  const files = useFileActions()
  const Ico = f.kind === 'pdf' ? FilePdf : FileImage
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0', !f.current && 'opacity-75')}>
      <Ico size={20} className="shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">
          {SIDE_LABELS[f.side]} <span className="font-normal text-ink-2">· sürüm {f.versionNo}</span>
          {!f.current && <span className="ml-1.5 text-[12.5px] font-normal text-ink-3">(eski sürüm)</span>}
        </p>
        <p className="text-[12.5px] text-ink-2">
          {f.kind.toUpperCase()} · {sizeText(f.sizeBytes)}
          {f.pages ? ` · ${f.pages} sayfa` : ''} · {formatDateTime(f.createdAt)}
          {f.uploadedByName && ` · ${f.uploadedByName}`}
        </p>
      </div>
      {perms.view || perms.download ? (
        <span className="flex gap-1">
          {perms.view && (
            <button type="button" onClick={() => void files.view(f)} disabled={files.busy !== null} className={btnSecondary} aria-label={`${SIDE_LABELS[f.side]} sürüm ${f.versionNo} görüntüle`}>
              {files.busy === `${f.id}:view` ? <SpinnerGap size={14} className="animate-spin" /> : <Eye size={14} />}
              Görüntüle
            </button>
          )}
          {perms.download && (
            <button type="button" onClick={() => void files.download(f)} disabled={files.busy !== null} className={btnSecondary} aria-label={`${SIDE_LABELS[f.side]} sürüm ${f.versionNo} indir`}>
              {files.busy === `${f.id}:download` ? <SpinnerGap size={14} className="animate-spin" /> : <DownloadSimple size={14} />}
              İndir
            </button>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[12.5px] text-ink-3">
          <LockSimple size={13} /> Açma yetkiniz yok
        </span>
      )}
    </li>
  )
}

function UploadButtons({ customerId, doc }: { customerId: string; doc: CustomerDocument }) {
  const qc = useQueryClient()
  const keys = useDocsKeys(customerId)
  const input = useRef<HTMLInputElement>(null)
  const [side, setSide] = useState<CustomerDocumentSide>('front')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pick = (s: CustomerDocumentSide) => {
    setSide(s)
    setError(null)
    input.current?.click()
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setProgress(0)
    try {
      await customerDocumentsApi.upload(customerId, doc.id, side, file, setProgress)
      void qc.invalidateQueries({ queryKey: keys.list })
      void qc.invalidateQueries({ queryKey: keys.status })
      void qc.invalidateQueries({ queryKey: keys.history })
      toast(`${SIDE_LABELS[side]} yüklendi ve şifreli saklandı.`)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Dosya yüklenemedi.')
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        {(['front', 'back', 'page'] as const).map((s) => (
          <button key={s} type="button" onClick={() => pick(s)} disabled={progress !== null} className={btnSecondary}>
            <UploadSimple size={14} />
            {SIDE_LABELS[s]} yükle
          </button>
        ))}
      </div>
      {progress !== null && (
        <p role="status" className="mt-2 text-[12.5px] text-ink-2">
          {SIDE_LABELS[side]} yükleniyor ve şifreleniyor… %{Math.round(progress * 100)}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-alert">
          {error}
        </p>
      )}
      <p className="mt-2 text-[12px] text-ink-3">PDF, JPEG veya PNG; en fazla 10 MB. Görsellerdeki konum ve cihaz bilgileri silinir.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel

const ACTION_TITLES: Record<string, string> = {
  'customer.document.create': 'Belge kaydı oluşturuldu',
  'customer.document.update': 'Belge bilgileri düzeltildi',
  'customer.document.verify': 'Doğrulama kaydedildi',
  'customer.document.renew': 'Yeni dönem açıldı',
  'customer.document.void': 'Belge geçersiz sayıldı',
  'customer.document.file_add': 'Dosya yüklendi',
  'customer.document.view_request': 'Görüntüleme istendi',
  'customer.document.download_request': 'İndirme istendi',
  'customer.document.number_reveal': 'Tam numara açıldı',
}
const FIELD_LABELS: Record<string, string> = {
  issuingCountry: 'düzenleyen ülke',
  issuingAuthority: 'kurum',
  title: 'belge adı',
  number: 'belge numarası',
  issuedOn: 'düzenlenme',
  validFrom: 'başlangıç',
  validUntil: 'son geçerlilik',
  licenseCategories: 'sınıflar',
  licenseFirstIssuedOn: 'ilk veriliş',
  entryDate: 'giriş tarihi',
  note: 'açıklama',
}

function DocumentHistory({ customerId, docId }: { customerId: string; docId: string }) {
  const session = useSession()
  const q = useQuery({ queryKey: ['customer-document-history', session.company?.id, docId], queryFn: () => customerDocumentsApi.history(customerId, docId) })
  if (q.isPending) return <div className="h-16 animate-pulse rounded-lg bg-line-soft/60" />
  if (q.isError) return <p className="text-[13px] text-alert">İşlem geçmişi yüklenemedi.</p>
  if (!q.data.items.length) return <p className="text-[13px] text-ink-2">Kayıtlı işlem yok (kayıt uygulama ekranları dışında oluşturulmuş olabilir).</p>
  return (
    <ol className="space-y-2">
      {q.data.items.map((a) => {
        const s = (a.summary ?? {}) as Record<string, unknown>
        const detail =
          a.action === 'customer.document.update'
            ? `Değişen: ${((s.fields as string[]) ?? []).map((f) => FIELD_LABELS[f] ?? f).join(', ')}`
            : a.action === 'customer.document.number_reveal'
              ? `Neden: ${REVEAL_REASON_LABELS[s.reason as keyof typeof REVEAL_REASON_LABELS] ?? s.reason}`
              : a.action === 'customer.document.void'
                ? `Neden: ${VOID_REASON_LABELS[s.reason as keyof typeof VOID_REASON_LABELS] ?? s.reason}`
                : a.action === 'customer.document.file_add' || a.action.endsWith('_request')
                  ? `${SIDE_LABELS[s.side as CustomerDocumentSide] ?? ''} · sürüm ${s.versionNo}`
                  : a.action === 'customer.document.verify'
                    ? VERIFICATION_LABELS[s.verification as keyof typeof VERIFICATION_LABELS]
                    : null
        return (
          <li key={a.id} className="text-[13px]">
            <span className="font-medium text-ink">{ACTION_TITLES[a.action] ?? a.action}</span>
            <span className="tnum text-ink-2">
              {' '}
              · {formatDateTime(a.at)}
              {a.actorName && ` · ${a.actorName}`}
            </span>
            {detail && <span className="block text-ink-2">{detail}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function DetailSheet({
  customer,
  doc,
  meta,
  onClose,
  onEdit,
  onRenew,
  onVoid,
  onReveal,
}: {
  customer: CustomerDetail
  doc: CustomerDocument
  meta: { keysConfigured: boolean; uploadsEnabled: boolean }
  onClose: () => void
  onEdit: () => void
  onRenew: () => void
  onVoid: () => void
  onReveal: () => void
}) {
  const perms = usePermissions(customer)
  const qc = useQueryClient()
  const keys = useDocsKeys(customer.id)
  const v = validityText(doc.validity, doc.validUntil, doc.validFrom)
  const active = doc.recordState === 'active'
  const editable = perms.manage && active
  const verify = useMutation({
    mutationFn: (verification: 'original_seen' | 'copy_only') => customerDocumentsApi.verify(customer.id, doc.id, doc.version, verification),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.list })
      void qc.invalidateQueries({ queryKey: keys.status })
      void qc.invalidateQueries({ queryKey: keys.history })
      toast('Doğrulama kaydedildi.')
    },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.'),
  })
  const facts: [string, ReactNode][] = [
    ['Düzenleyen ülke', countryName(doc.issuingCountry)],
    ['Düzenleyen kurum', doc.issuingAuthority],
    ...(doc.type === 'entry_record'
      ? ([['Giriş tarihi', doc.entryDate && formatDate(doc.entryDate)]] as [string, ReactNode][])
      : ([
          ['Düzenlenme', doc.issuedOn && formatDate(doc.issuedOn)],
          ['Geçerlilik başlangıcı', doc.validFrom && formatDate(doc.validFrom)],
          ['Son geçerlilik', doc.validUntil && formatDate(doc.validUntil)],
        ] as [string, ReactNode][])),
    ...(CUSTOMER_DOCUMENT_TYPE_INFO[doc.type].licence
      ? ([
          ['Sınıflar', doc.licenseCategories.join(', ') || null],
          ['İlk veriliş', doc.licenseFirstIssuedOn && formatDate(doc.licenseFirstIssuedOn)],
        ] as [string, ReactNode][])
      : []),
    ['Doğrulama', doc.verification === 'not_verified' ? VERIFICATION_LABELS.not_verified : `${VERIFICATION_LABELS[doc.verification]}${doc.verifiedByName ? ` · ${doc.verifiedByName}` : ''}${doc.verifiedAt ? ` · ${formatDate(doc.verifiedAt)}` : ''}`],
    ['Açıklama', doc.note],
    ['Kaydeden', doc.createdByName ?? <span className="font-normal text-ink-3">Kullanıcı bilgisi yok</span>],
  ]
  return (
    <Sheet
      title={typeTitle(doc)}
      subtitle={`${countryName(doc.issuingCountry) ?? 'Ülke girilmemiş'} · ${customer.displayName}`}
      onClose={onClose}
      footer={
        editable ? (
          <>
            <button type="button" onClick={onEdit} className={btnSecondary}>
              Düzelt
            </button>
            {!doc.renewedById && (
              <button type="button" onClick={onRenew} className={btnSecondary}>
                <ArrowsClockwise size={14} /> Yeni dönem
              </button>
            )}
            <button type="button" onClick={onVoid} className={cn(btnGhost, 'text-alert hover:bg-alert-soft hover:text-alert')}>
              <Prohibit size={14} /> Geçersiz say
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <section className="rounded-lg border border-line-soft bg-ground/40 px-4 py-3">
          <p className={cn('flex items-center gap-2 font-medium', TONE_TEXT[v.tone])}>
            {(() => {
              const Ico = TONE_ICON[v.tone]
              return <Ico size={17} />
            })()}
            {v.text}
          </p>
          {doc.recordState === 'voided' && (
            <p className="mt-1 text-[13px] text-ink-2">
              Neden: {doc.voidedReason ? VOID_REASON_LABELS[doc.voidedReason] : '—'}
              {doc.voidedNote && ` · ${doc.voidedNote}`}
              {doc.voidedByName && ` · ${doc.voidedByName}`}
            </p>
          )}
          {doc.maskedNumber !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line-soft pt-2">
              <span className="text-[13px] text-ink-2">Belge numarası</span>
              <span className="tnum font-semibold tracking-[0.06em] text-ink">{doc.maskedNumber}</span>
              {perms.reveal && meta.keysConfigured && (
                <button type="button" onClick={onReveal} className={btnGhost}>
                  <Eye size={14} /> Numarayı göster
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[14px] font-semibold">Bilgiler</h3>
          <dl className="divide-y divide-line-soft">
            {facts.map(([k, val]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
                <dd className={cn('min-w-0 text-right font-medium break-words', !val && 'font-normal text-ink-3')}>{val ?? 'Girilmemiş'}</dd>
              </div>
            ))}
          </dl>
          {editable && doc.verification !== 'original_seen' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => verify.mutate('original_seen')} disabled={verify.isPending} className={btnSecondary}>
                <CheckCircle size={14} /> Aslı görüldü olarak işaretle
              </button>
              {doc.verification !== 'copy_only' && (
                <button type="button" onClick={() => verify.mutate('copy_only')} disabled={verify.isPending} className={btnGhost}>
                  Yalnız kopyası görüldü
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[14px] font-semibold">Dosyalar</h3>
          {doc.files.length === 0 ? (
            <p className="mb-3 text-[13px] text-ink-2">Bu dönem için dosya yüklenmemiş.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line-soft">
              {doc.files.map((f) => (
                <FileRow key={f.id} f={f} perms={perms} />
              ))}
            </ul>
          )}
          {editable &&
            (meta.uploadsEnabled ? (
              <UploadButtons customerId={customer.id} doc={doc} />
            ) : (
              <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                <LockSimple size={14} className="mt-[2px] shrink-0 text-ink-3" />
                {meta.keysConfigured ? 'Dosya yükleme şu an kapalı (zararlı dosya taraması yapılandırılmamış).' : 'Dosya yükleme kapalı: şifreleme anahtarı yapılandırılmadı.'}
              </p>
            ))}
        </section>

        <section>
          <h3 className="mb-2 text-[14px] font-semibold">İşlem geçmişi</h3>
          <DocumentHistory customerId={customer.id} docId={doc.id} />
        </section>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// List

function DocumentCard({ doc, onOpen, onReveal, canReveal }: { doc: CustomerDocument; onOpen: () => void; onReveal: () => void; canReveal: boolean }) {
  const v = validityText(doc.validity, doc.validUntil, doc.validFrom)
  const current = doc.files.filter((f) => f.current)
  const sides = [...new Set(current.map((f) => SIDE_LABELS[f.side]))]
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', doc.validity.state === 'expired' ? 'bg-alert-soft text-alert' : 'bg-ground text-ink-2')}>
        <IdentificationCard size={20} />
      </span>
      <div className="min-w-0 flex-1 basis-[220px]">
        <button type="button" onClick={onOpen} className="text-left font-semibold text-ink hover:text-blue-ink hover:underline">
          {typeTitle(doc)}
          <span className="font-normal text-ink-2"> · {countryName(doc.issuingCountry) ?? 'ülke girilmemiş'}</span>
        </button>
        <p className={cn('mt-0.5 text-[13.5px] font-medium', TONE_TEXT[v.tone])}>{doc.type === 'entry_record' && doc.entryDate ? `Giriş: ${formatDate(doc.entryDate)}` : v.text}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
          {doc.maskedNumber !== null && <span className="tnum font-medium tracking-[0.05em] text-ink">{doc.maskedNumber}</span>}
          {doc.maskedNumber !== null && canReveal && (
            <button type="button" onClick={onReveal} className="font-medium text-blue hover:underline">
              Numarayı göster
            </button>
          )}
          <span>
            {VERIFICATION_LABELS[doc.verification]} · {sides.length ? sides.join(', ') : 'dosya yok'}
          </span>
        </p>
      </div>
      <button type="button" onClick={onOpen} className={btnGhost} aria-label={`${typeTitle(doc)} ayrıntıları`}>
        Ayrıntı <ArrowRight size={13} />
      </button>
    </li>
  )
}

type Panel = { kind: 'detail'; docId: string } | { kind: 'create' } | { kind: 'edit' | 'renew'; docId: string } | null

/** Müşteri 360° Belgeler: identity, passport and licence records of the person, with masked numbers and encrypted files. */
export function CustomerDocuments({ customer }: { customer: CustomerDetail }) {
  const perms = usePermissions(customer)
  const keys = useDocsKeys(customer.id)
  const list = useQuery({ queryKey: keys.list, queryFn: () => customerDocumentsApi.list(customer.id), enabled: perms.read })
  const [panel, setPanel] = useState<Panel>(null)
  const [revealing, setRevealing] = useState<CustomerDocument | null>(null)
  const [voiding, setVoiding] = useState<CustomerDocument | null>(null)
  const [showPast, setShowPast] = useState(false)

  if (!perms.read)
    return (
      <StatePanel icon={LockSimple} title="Belgeleri görme yetkiniz yok">
        <p>Müşteri belgelerini görüntülemek için yetki gerekir. Şirket yöneticinize başvurun.</p>
      </StatePanel>
    )
  if (list.isError) return <ErrorState message={`Belgeler yüklenemedi. ${list.error.message}`} onRetry={() => list.refetch()} />

  const items = list.data?.items ?? []
  const current = items.filter((d) => d.validity.state !== 'superseded' && d.validity.state !== 'voided')
  const past = items.filter((d) => d.validity.state === 'superseded' || d.validity.state === 'voided')
  const byId = (id: string) => items.find((d) => d.id === id)
  const meta = { keysConfigured: list.data?.keysConfigured ?? true, uploadsEnabled: list.data?.uploadsEnabled ?? false }
  const canAdd = perms.manage
  const detailDoc = panel && panel.kind !== 'create' ? byId(panel.docId) : undefined

  return (
    <div className="space-y-5">
      {list.data && !list.data.keysConfigured && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-hold/35 bg-hold-soft px-4 py-3 text-[13.5px] text-ink">
          <LockSimple size={17} className="mt-px shrink-0 text-hold" />
          Şifreleme anahtarı yapılandırılmadığı için belge numarası ve dosya kaydedilemiyor. Kayıtlı belgeler maskeli olarak görüntülenebilir.
        </p>
      )}
      <RequirementStatus customer={customer} />

      <section aria-label="Belge kayıtları" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            Belgeler <span className="tnum font-normal text-ink-3">{list.data ? current.length : ''}</span>
          </h2>
          {canAdd && (
            <button type="button" onClick={() => setPanel({ kind: 'create' })} className={cn(btnPrimary, 'h-9 px-3.5')}>
              <Plus size={15} weight="bold" />
              Belge ekle
            </button>
          )}
        </div>
        {!list.data ? (
          <div className="h-32 animate-pulse bg-line-soft/40" aria-busy="true" aria-label="Belgeler yükleniyor" />
        ) : current.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-lg bg-ground text-ink-2">
              <Files size={22} />
            </span>
            <p className="mt-3 font-semibold">Henüz geçerli belge kaydı yok</p>
            <p className="mt-1 max-w-[440px] text-[13.5px] text-ink-2">
              Kimlik, pasaport, sürücü belgesi, oturma izni veya giriş damgası ekleyebilirsiniz. Numaralar şifreli saklanır, ekranda maskeli görünür.
            </p>
            {canAdd && (
              <button type="button" onClick={() => setPanel({ kind: 'create' })} className={cn(btnPrimary, 'mt-4 h-9 px-3.5')}>
                <Plus size={15} weight="bold" /> Belge ekle
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {current.map((d) => (
              <DocumentCard key={d.id} doc={d} onOpen={() => setPanel({ kind: 'detail', docId: d.id })} onReveal={() => setRevealing(d)} canReveal={perms.reveal && meta.keysConfigured} />
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <div className="border-t border-line-soft">
            <button type="button" aria-expanded={showPast} onClick={() => setShowPast((s) => !s)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-[13.5px] font-medium text-ink-2 hover:bg-ground/60">
              <CaretDown size={13} className={cn('transition-transform', !showPast && '-rotate-90')} />
              Önceki dönemler ve geçersiz sayılanlar <span className="tnum text-ink-3">{past.length}</span>
            </button>
            {showPast && (
              <ul className="divide-y divide-line-soft border-t border-line-soft bg-ground/30">
                {past.map((d) => (
                  <DocumentCard key={d.id} doc={d} onOpen={() => setPanel({ kind: 'detail', docId: d.id })} onReveal={() => setRevealing(d)} canReveal={perms.reveal && meta.keysConfigured} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {panel?.kind === 'create' && <DocumentFormSheet customer={customer} mode="create" onClose={() => setPanel(null)} onSaved={(d) => setPanel({ kind: 'detail', docId: d.id })} />}
      {panel?.kind === 'detail' && detailDoc && (
        <DetailSheet
          customer={customer}
          doc={detailDoc}
          meta={meta}
          onClose={() => setPanel(null)}
          onEdit={() => setPanel({ kind: 'edit', docId: detailDoc.id })}
          onRenew={() => setPanel({ kind: 'renew', docId: detailDoc.id })}
          onVoid={() => setVoiding(detailDoc)}
          onReveal={() => setRevealing(detailDoc)}
        />
      )}
      {(panel?.kind === 'edit' || panel?.kind === 'renew') && detailDoc && (
        <DocumentFormSheet
          key={`${panel.kind}-${detailDoc.id}`}
          customer={customer}
          mode={panel.kind}
          doc={detailDoc}
          onClose={() => setPanel({ kind: 'detail', docId: detailDoc.id })}
          onSaved={(d) => setPanel({ kind: 'detail', docId: d.id })}
        />
      )}
      {revealing && <RevealDialog customerId={customer.id} doc={revealing} onClose={() => setRevealing(null)} />}
      {voiding && <VoidDialog customerId={customer.id} doc={voiding} onClose={() => setVoiding(null)} />}
    </div>
  )
}
