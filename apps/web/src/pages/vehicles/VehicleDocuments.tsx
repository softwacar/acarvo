import {
  type DocumentFileVersion,
  type DocumentTypeSummary,
  type DocumentTypeCode,
  type VehicleDocument,
  type VehicleDocumentDetail,
  type VehicleDocumentsResponse,
  MAX_DOCUMENT_IMAGE_MB,
  MAX_DOCUMENT_PDF_MB,
  documentFieldsSchema,
} from '@acarvo/shared'
import {
  ArrowSquareOut,
  CheckCircle,
  ClockCountdown,
  DotsThree,
  DownloadSimple,
  FileImage,
  FilePdf,
  Flask,
  Info,
  LockSimple,
  PencilSimpleLine,
  Plus,
  SpinnerGap,
  UploadSimple,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DropdownMenu } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import { describe, Field, Input, Textarea } from '@/components/fields'
import { toast } from '@/components/Toaster'
import { ApiRequestError, documentsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

const fmt = (d: string | null) => (d ? formatDate(d) : '—')
const range = (from: string | null, until: string | null) => (from || until ? `${fmt(from)} – ${until ? fmt(until) : 'süresiz'}` : '—')
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Row status of one type: icon + words, coloured only where it matters (V5: no badges). */
function SummaryStatus({ s, required }: { s: DocumentTypeSummary; required: boolean }) {
  const map: Record<DocumentTypeSummary['state'], { icon: typeof CheckCircle; text: ReactNode; tone: string }> = {
    valid: { icon: CheckCircle, text: 'Geçerli', tone: 'text-ok' },
    renewed: { icon: CheckCircle, text: <>Geçerli · yenisi {fmt(s.nextStartsOn)} tarihinde başlıyor</>, tone: 'text-ok' },
    expiring: {
      icon: Warning,
      text: (
        <>
          {s.daysLeft === 0 ? 'Bugün bitiyor' : `${s.daysLeft} gün kaldı`}
          {s.gapDays != null && s.gapDays > 0 && ` · yenisiyle arasında ${s.gapDays} gün boşluk`}
        </>
      ),
      tone: s.level === 'critical' ? 'text-alert' : 'text-hold',
    },
    expired: { icon: XCircle, text: 'Süresi dolmuş', tone: 'text-alert' },
    not_started: { icon: ClockCountdown, text: <>Henüz başlamadı · {fmt(s.nextStartsOn)}{required && ' · şu an geçerli belge yok'}</>, tone: required ? 'text-alert' : 'text-ink-2' },
    draft: { icon: PencilSimpleLine, text: required ? 'Eksik · taslak var' : 'Taslak', tone: required ? 'text-alert' : 'text-ink-2' },
    missing: { icon: WarningCircle, text: 'Eksik', tone: 'text-alert' },
    none: { icon: Info, text: 'Kayıt yok', tone: 'text-ink-3' },
  }
  const m = map[s.state]
  return (
    <span className={cn('inline-flex items-start gap-1.5 font-medium', m.tone, s.state === 'none' && 'font-normal')}>
      <m.icon size={16} weight={s.state === 'none' ? 'regular' : 'fill'} className="mt-[2px] shrink-0" />
      <span>{m.text}</span>
    </span>
  )
}

function DocStatusText({ d }: { d: VehicleDocument }) {
  const s = d.status
  const t: Record<string, [string, string]> = {
    voided: ['Geçersiz sayıldı', 'text-ink-3'],
    draft: [s.draftReason === 'missing_expiry' ? 'Taslak · tarih eksik' : 'Taslak', 'text-ink-2'],
    not_started: [`Henüz başlamadı · ${s.startsInDays} gün sonra`, 'text-ink-2'],
    expired: ['Süresi dolmuş', 'text-alert'],
    expiring: [s.daysLeft === 0 ? 'Bugün bitiyor' : `Yaklaşıyor · ${s.daysLeft} gün`, s.critical ? 'text-alert' : 'text-hold'],
    valid: ['Geçerli', 'text-ok'],
  }
  const [text, tone] = t[s.status]!
  return <span className={cn('font-medium', tone)}>{text}</span>
}

function FileLinks({ f, compact }: { f: DocumentFileVersion; compact?: boolean }) {
  const Icon = f.mimeType === 'application/pdf' ? FilePdf : FileImage
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 font-medium text-blue hover:bg-blue-soft"
        title={`${f.displayName} · ${size(f.sizeBytes)}`}
      >
        <Icon size={17} />
        {!compact && 'Görüntüle'}
      </a>
      <a
        href={f.downloadUrl}
        onClick={(e) => e.stopPropagation()}
        aria-label="İndir"
        className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink"
      >
        <DownloadSimple size={16} />
      </a>
    </span>
  )
}

type FormMode = { kind: 'create'; typeCode?: DocumentTypeCode } | { kind: 'edit'; doc: VehicleDocumentDetail } | { kind: 'renew'; doc: VehicleDocumentDetail }

/** Araç 360° → Belgeler ve riskler (spec §13.3 tab 6, §59C; docs §8.4). */
export function VehicleDocuments({ vehicleId, plate }: { vehicleId: string; plate: string }) {
  const session = useSession()
  const canManage = can(session, 'vehicles.documents.manage')
  const q = useQuery({ queryKey: ['vehicle-documents', session.company?.id, vehicleId], queryFn: () => documentsApi.list(vehicleId) })
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<FormMode | null>(null)

  if (!can(session, 'vehicles.documents.read')) {
    return (
      <section className="rounded-xl border border-line bg-surface p-6 text-ink-2">
        <LockSimple size={18} className="mb-2 text-ink-3" />
        Belgeleri görüntülemek için belge görüntüleme yetkisi gerekir.
      </section>
    )
  }
  if (q.isPending) return <div className="h-80 animate-pulse rounded-xl bg-line-soft/70" aria-busy="true" aria-label="Belgeler yükleniyor" />
  if (q.isError) return <section className="rounded-xl border border-alert/25 bg-alert-soft p-5 text-alert">{q.error.message}</section>
  const data = q.data
  const docById = (id: string | null) => data.documents.find((d) => d.id === id) ?? null
  const openRow = (t: VehicleDocumentsResponse['types'][number]) => {
    if (t.summary.shownId) setOpenId(t.summary.shownId)
    else if (canManage) setForm({ kind: 'create', typeCode: t.code })
  }
  const history = data.documents.filter((d) => !data.types.some((t) => t.summary.shownId === d.id || t.summary.nextId === d.id))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Belgeler ve süreler</h2>
              <p className="mt-0.5 text-[13px] text-ink-2">Durumlar {fmt(data.today)} tarihine göre, şirket saatiyle.</p>
            </div>
            {canManage && (
              <button type="button" onClick={() => setForm({ kind: 'create' })} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                <Plus size={15} weight="bold" />
                Belge ekle
              </button>
            )}
          </div>

          {/* Desktop and tablet: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead>
                <tr className="border-y border-line bg-ground/50 text-left text-[12.5px] text-ink-2">
                  <th className="h-10 px-5 font-medium">Belge</th>
                  <th className="h-10 px-3 font-medium">Numara</th>
                  <th className="h-10 px-3 font-medium">Geçerlilik</th>
                  <th className="h-10 px-3 font-medium">Durum</th>
                  <th className="h-10 px-3 font-medium">Dosya</th>
                  <th className="h-10 w-12 pr-4" aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {data.types.map((t) => {
                  const d = docById(t.summary.shownId)
                  return (
                    <tr key={t.code} onClick={() => openRow(t)} className={cn('border-b border-line-soft last:border-b-0', (d || canManage) && 'cursor-pointer hover:bg-blue-soft/30')}>
                      <td className="min-w-[150px] px-5 py-3">
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="block text-[12px] text-ink-3">{t.required ? 'Şirket için zorunlu' : 'İsteğe bağlı'}</span>
                      </td>
                      <td className="tnum px-3 py-3 whitespace-nowrap text-ink-2">{d?.documentNumber ?? '—'}</td>
                      <td className="tnum px-3 py-3 whitespace-nowrap text-ink">{d ? range(d.validFrom, d.validUntil) : '—'}</td>
                      <td className="max-w-[260px] px-3 py-3">
                        <SummaryStatus s={t.summary} required={t.required} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d?.latestFile ? (
                          <FileLinks f={d.latestFile} />
                        ) : d ? (
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-hold">
                            <WarningCircle size={15} /> Dosya yok
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {canManage && <RowMenu d={d} onOpen={() => d && setOpenId(d.id)} onCreate={() => setForm({ kind: 'create', typeCode: t.code })} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: cards */}
          <ul className="divide-y divide-line-soft border-t border-line md:hidden">
            {data.types.map((t) => {
              const d = docById(t.summary.shownId)
              return (
                <li key={t.code}>
                  <button type="button" onClick={() => openRow(t)} className="block w-full px-4 py-3 text-left">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-[12px] text-ink-3">{t.required ? 'Zorunlu' : 'İsteğe bağlı'}</span>
                    </span>
                    <span className="mt-1 block text-[13px]">
                      <SummaryStatus s={t.summary} required={t.required} />
                    </span>
                    {d && (
                      <span className="tnum mt-0.5 block text-[12.5px] text-ink-2">
                        {[d.validFrom || d.validUntil ? range(d.validFrom, d.validUntil) : null, d.documentNumber].filter(Boolean).join(' · ')}
                        {!d.latestFile && <span className="font-medium text-hold">{d.validFrom || d.validUntil || d.documentNumber ? ' · ' : ''}Dosya yok</span>}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <UploadPolicyNote policy={data.upload} />

        {history.length > 0 && (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Önceki ve diğer kayıtlar</h2>
            <p className="mt-0.5 mb-3 text-[13px] text-ink-2">Biten dönemler, taslaklar ve geçersiz sayılanlar silinmez.</p>
            <ul className="divide-y divide-line-soft">
              {history.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => setOpenId(d.id)} className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-left hover:text-blue-ink">
                    <span className="font-medium">
                      {data.types.find((t) => t.code === d.typeCode)?.name}
                      {d.documentNumber && <span className="font-normal text-ink-2"> · {d.documentNumber}</span>}
                    </span>
                    <span className="tnum text-[13px] text-ink-2">
                      {range(d.validFrom, d.validUntil)} · <DocStatusText d={d} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="min-w-0">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em]">Açık riskler</h2>
          <div className="grid place-items-center rounded-lg border border-dashed border-line px-6 py-8 text-center">
            <div>
              <WarningCircle size={22} className="mx-auto text-ink-3" />
              <p className="mt-2 font-medium">Henüz bağlı değil</p>
              <p className="mt-1 text-[13px] text-ink-2">Hasar, ceza ve olay kayıtları ilgili modüllerle bağlanacak.</p>
            </div>
          </div>
        </section>
      </div>

      {openId && (
        <DocumentDrawer
          vehicleId={vehicleId}
          plate={plate}
          docId={openId}
          typeName={(code) => data.types.find((t) => t.code === code)?.name ?? code}
          canManage={canManage}
          uploadsEnabled={data.upload.enabled}
          onOpen={setOpenId}
          onForm={(m) => {
            setOpenId(null)
            setForm(m)
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {form && (
        <DocumentForm
          vehicleId={vehicleId}
          mode={form}
          types={data.types}
          uploadsEnabled={data.upload.enabled}
          onDone={(id) => {
            setForm(null)
            setOpenId(id)
          }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

function UploadPolicyNote({ policy }: { policy: VehicleDocumentsResponse['upload'] }) {
  const session = useSession()
  if (!policy.enabled) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-alert/25 bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert">
        <LockSimple size={16} className="mt-px shrink-0" />
        {policy.reason}
      </p>
    )
  }
  if (policy.scanner === 'none' && session.environment !== 'production') {
    return (
      <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
        <Flask size={15} className="mt-px shrink-0 text-hold" />
        Geliştirme ortamı: zararlı dosya taraması yok, dosyalar yalnız içerik doğrulamasından geçer. Üretimde tarama olmadan yükleme kapalıdır.
      </p>
    )
  }
  return null
}

function RowMenu({ d, onOpen, onCreate }: { d: VehicleDocument | null; onOpen: () => void; onCreate: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Belge işlemleri" className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink">
        <DotsThree size={18} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-[200px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
          {d && (
            <DropdownMenu.Item onSelect={onOpen} className="flex h-9 cursor-pointer items-center rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
              Ayrıntılar ve geçmiş
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={onCreate} className="flex h-9 cursor-pointer items-center rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
            Bu türde yeni kayıt
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Sheet({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full animate-fade flex-col border-l border-line bg-surface shadow-xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Kapat" className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function useInvalidate(vehicleId: string) {
  const session = useSession()
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['vehicle-documents', session.company?.id, vehicleId] })
    void qc.invalidateQueries({ queryKey: ['vehicle-document'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-activity'] })
  }
}

function FileUpload({ vehicleId, docId, enabled, onUploaded }: { vehicleId: string; docId: string; enabled: boolean; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const start = async (file: File) => {
    setError(null)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const limit = (isPdf ? MAX_DOCUMENT_PDF_MB : MAX_DOCUMENT_IMAGE_MB) * 1024 * 1024
    if (file.size > limit) return setError(`Dosya ${isPdf ? MAX_DOCUMENT_PDF_MB : MAX_DOCUMENT_IMAGE_MB} MB sınırını aşıyor.`)
    setProgress(0)
    try {
      await documentsApi.upload(vehicleId, docId, file, (p) => setProgress(Math.min(p, 0.97)))
      toast('Dosya yüklendi.')
      onUploaded()
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Yükleme tamamlanamadı.')
    } finally {
      setProgress(null)
    }
  }
  if (!enabled) return null
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void start(f)
        }}
      />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void start(f)
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-dashed border-ink-3/40 px-4 py-3 text-left text-ink-2 transition-colors hover:border-blue hover:text-blue disabled:opacity-70"
      >
        {progress !== null ? <SpinnerGap size={20} className="shrink-0 animate-spin" /> : <UploadSimple size={20} className="shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{progress !== null ? 'Yükleniyor' : 'Dosya seçin veya sürükleyin'}</span>
          <span className="block text-[12px] text-ink-3">
            PDF (en fazla {MAX_DOCUMENT_PDF_MB} MB) · JPEG/PNG (en fazla {MAX_DOCUMENT_IMAGE_MB} MB). Eski sürümler korunur.
          </span>
        </span>
        {progress !== null && (
          <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-[13px] text-alert">
          <WarningCircle size={16} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function DocumentDrawer({
  vehicleId,
  plate,
  docId,
  typeName,
  canManage,
  uploadsEnabled,
  onOpen,
  onForm,
  onClose,
}: {
  vehicleId: string
  plate: string
  docId: string
  typeName: (code: string) => string
  canManage: boolean
  uploadsEnabled: boolean
  onOpen: (id: string) => void
  onForm: (m: FormMode) => void
  onClose: () => void
}) {
  const session = useSession()
  const invalidate = useInvalidate(vehicleId)
  const q = useQuery({ queryKey: ['vehicle-document', session.company?.id, docId], queryFn: () => documentsApi.get(vehicleId, docId) })
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const onErr = (e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'İşlem tamamlanamadı.')
  const activate = useMutation({ mutationFn: (v: number) => documentsApi.activate(vehicleId, docId, v), onSuccess: () => (toast('Belge etkinleştirildi.'), invalidate()), onError: onErr })
  const voidDoc = useMutation({
    mutationFn: (v: number) => documentsApi.void(vehicleId, docId, v, reason),
    onSuccess: () => {
      toast('Belge geçersiz sayıldı.')
      setVoiding(false)
      invalidate()
    },
    onError: onErr,
  })
  const d = q.data
  const editable = d && d.recordState !== 'voided' && !d.lockedAt

  return (
    <Sheet
      title={d ? typeName(d.typeCode) : 'Belge'}
      subtitle={d ? <>{plate} · <DocStatusText d={d} />{d.status.noFile && d.recordState !== 'voided' && <span className="font-medium text-hold"> · Dosya yok</span>}</> : undefined}
      onClose={onClose}
      footer={
        d && canManage && editable ? (
          voiding ? (
            <div className="w-full space-y-2">
              <label htmlFor="void-reason" className="block text-[13px] font-medium">
                Geçersiz sayma gerekçesi
              </label>
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. yanlış araca yüklendi" autoFocus />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setVoiding(false)} className="h-9 rounded-lg border border-line px-3 font-medium">
                  Vazgeç
                </button>
                <button type="button" disabled={reason.trim().length < 3 || voidDoc.isPending} onClick={() => voidDoc.mutate(d.version)} className="h-9 rounded-lg bg-alert px-3 font-medium text-white disabled:opacity-50">
                  Geçersiz say
                </button>
              </div>
            </div>
          ) : (
            <>
              {d.recordState === 'draft' && (
                <button type="button" disabled={activate.isPending} onClick={() => activate.mutate(d.version)} className="h-9 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink disabled:opacity-60">
                  Etkinleştir
                </button>
              )}
              {d.recordState === 'active' && !d.renewedById && (
                <button type="button" onClick={() => onForm({ kind: 'renew', doc: d })} className="h-9 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                  Yenile
                </button>
              )}
              <button type="button" onClick={() => onForm({ kind: 'edit', doc: d })} className="h-9 rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
                Düzelt
              </button>
              <button type="button" onClick={() => setVoiding(true)} className="ml-auto h-9 rounded-lg px-3 font-medium text-alert hover:bg-alert-soft">
                Geçersiz say
              </button>
            </>
          )
        ) : undefined
      }
    >
      {q.isPending ? (
        <div className="h-60 animate-pulse rounded-lg bg-line-soft/70" />
      ) : q.isError ? (
        <p className="text-alert">{q.error.message}</p>
      ) : (
        d && (
          <div className="space-y-6">
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/25 bg-alert-soft px-3 py-2 text-[13px] text-alert">
                <WarningCircle size={16} className="mt-px shrink-0" />
                {error}
              </p>
            )}
            {d.recordState === 'voided' && (
              <p className="rounded-lg border border-line bg-ground/60 px-3 py-2 text-[13px] text-ink-2">
                {formatDateTime(d.voidedAt!)} tarihinde {d.voidedByName ?? 'bir kullanıcı'} geçersiz saydı: “{d.voidedReason}”. Kayıt ve dosyaları korunur.
              </p>
            )}
            <dl className="divide-y divide-line-soft">
              {(
                [
                  ['Numara', d.documentNumber],
                  ['Düzenleyen kurum', d.issuer],
                  ['Düzenlenme tarihi', d.issuedOn && fmt(d.issuedOn)],
                  ['Geçerlilik', range(d.validFrom, d.validUntil)],
                  ['Not', d.notes],
                  ['Oluşturan', `${d.createdByName ?? '—'} · ${formatDateTime(d.createdAt)}`],
                ] as [string, ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                  <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
                  <dd className={cn('min-w-0 text-right font-medium', !v && 'font-normal text-ink-3')}>{v || 'Girilmemiş'}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h3 className="mb-2 font-semibold">Dosya</h3>
              {d.files[0] ? (
                <FilePreview f={d.files[0]} />
              ) : (
                <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-hold">
                  <WarningCircle size={16} /> Bu kayıtta dosya yok.
                </p>
              )}
              {canManage && d.recordState !== 'voided' && (
                <div className="mt-3">
                  <FileUpload vehicleId={vehicleId} docId={d.id} enabled={uploadsEnabled} onUploaded={invalidate} />
                </div>
              )}
            </section>

            {d.files.length > 1 && (
              <section>
                <h3 className="mb-2 font-semibold">Dosya sürümleri</h3>
                <ul className="divide-y divide-line-soft rounded-lg border border-line">
                  {d.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-[13px]">
                        <span className="font-medium">Sürüm {f.versionNo}</span>
                        <span className="text-ink-2">
                          {' '}
                          · {formatDateTime(f.createdAt)} · {f.uploadedByName ?? '—'} · {size(f.sizeBytes)}
                        </span>
                      </span>
                      <FileLinks f={f} compact />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {d.chain.length > 1 && (
              <section>
                <h3 className="mb-2 font-semibold">Dönemler</h3>
                <ol className="space-y-1">
                  {d.chain.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(c.id)}
                        aria-current={c.id === d.id ? 'true' : undefined}
                        className={cn('flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] hover:bg-ground', c.id === d.id && 'bg-ground font-medium')}
                      >
                        <span className="tnum">{range(c.validFrom, c.validUntil)}</span>
                        <span className="text-ink-2">{CHAIN_LABEL[c.status]}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )
      )}
    </Sheet>
  )
}

const CHAIN_LABEL: Record<string, string> = {
  voided: 'Geçersiz sayıldı',
  draft: 'Taslak',
  not_started: 'Henüz başlamadı',
  expired: 'Bitti',
  expiring: 'Yaklaşıyor',
  valid: 'Geçerli',
}

function FilePreview({ f }: { f: DocumentFileVersion }) {
  if (f.mimeType !== 'application/pdf') {
    return (
      <a href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line bg-ground">
        <img src={f.url} alt={`Belge görseli, sürüm ${f.versionNo}`} className="max-h-[320px] w-full object-contain" />
      </a>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-3">
      <FilePdf size={30} className="shrink-0 text-alert" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{f.displayName}</span>
        <span className="block text-[12.5px] text-ink-2">
          Sürüm {f.versionNo} · {f.pageCount} sayfa · {size(f.sizeBytes)}
        </span>
      </span>
      <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-medium hover:bg-ground">
        <ArrowSquareOut size={15} /> Aç
      </a>
      <a href={f.downloadUrl} aria-label="İndir" className="grid size-9 place-items-center rounded-lg border border-line hover:bg-ground">
        <DownloadSimple size={16} />
      </a>
    </div>
  )
}

interface FormValues {
  typeCode: string
  documentNumber: string
  issuer: string
  issuedOn: string
  validFrom: string
  validUntil: string
  notes: string
}

function DocumentForm({
  vehicleId,
  mode,
  types,
  uploadsEnabled,
  onDone,
  onClose,
}: {
  vehicleId: string
  mode: FormMode
  types: VehicleDocumentsResponse['types']
  uploadsEnabled: boolean
  onDone: (id: string) => void
  onClose: () => void
}) {
  const invalidate = useInvalidate(vehicleId)
  const src = mode.kind === 'create' ? null : mode.doc
  const [v, setV] = useState<FormValues>(() => ({
    typeCode: mode.kind === 'create' ? (mode.typeCode ?? '') : mode.doc.typeCode,
    documentNumber: mode.kind === 'edit' ? (src?.documentNumber ?? '') : '',
    issuer: src?.issuer ?? '',
    issuedOn: mode.kind === 'edit' ? (src?.issuedOn ?? '') : '',
    validFrom: mode.kind === 'edit' ? (src?.validFrom ?? '') : mode.kind === 'renew' && src?.validUntil ? nextDay(src.validUntil) : '',
    validUntil: mode.kind === 'edit' ? (src?.validUntil ?? '') : '',
    notes: mode.kind === 'edit' ? (src?.notes ?? '') : '',
  }))
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const type = types.find((t) => t.code === v.typeCode)
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: async (state: 'active' | 'draft') => {
      const parsed = documentFieldsSchema.safeParse(v)
      const fieldErrors: Record<string, string> = {}
      if (!parsed.success) for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message
      if (mode.kind === 'create' && !v.typeCode) fieldErrors.typeCode = 'Belge türü seçin'
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors)
        throw new Error('validation')
      }
      setErrors({})
      const body = { ...v, state }
      const doc =
        mode.kind === 'create'
          ? await documentsApi.create(vehicleId, body)
          : mode.kind === 'renew'
            ? await documentsApi.renew(vehicleId, mode.doc.id, body)
            : await documentsApi.update(vehicleId, mode.doc.id, { ...v, version: mode.doc.version })
      if (file && mode.kind !== 'edit') {
        try {
          await documentsApi.upload(vehicleId, doc.id, file)
        } catch (e) {
          // The record is saved; the file can be uploaded again from its panel.
          toast(`Kayıt oluşturuldu, ancak dosya yüklenemedi: ${e instanceof ApiRequestError ? e.message : 'bilinmeyen hata'}`)
        }
      }
      return doc
    },
    onSuccess: (doc) => {
      invalidate()
      toast(mode.kind === 'renew' ? 'Yeni dönem eklendi; önceki dönem bitişine kadar geçerli kalır.' : mode.kind === 'edit' ? 'Belge güncellendi.' : 'Belge eklendi.')
      onDone(doc.id)
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'validation') return
      if (e instanceof ApiRequestError) {
        setErrors(e.fields ?? {})
        setMessage(e.message)
      } else setMessage('Kaydedilemedi.')
    },
  })

  const title = mode.kind === 'create' ? 'Belge ekle' : mode.kind === 'renew' ? 'Belgeyi yenile' : 'Belgeyi düzelt'
  return (
    <Sheet
      title={title}
      subtitle={
        mode.kind === 'renew'
          ? `${type?.name}: yeni dönem ayrı kayıt olur; önceki dönem ${src?.validUntil ? fmt(src.validUntil) : ''} tarihine kadar geçerli kalır.`
          : mode.kind === 'edit'
            ? 'Yanlış girilen bilgileri düzeltin; eski ve yeni değer işlem geçmişine yazılır.'
            : 'Dosya isteğe bağlıdır; sonradan eklenebilir.'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" disabled={save.isPending} onClick={() => save.mutate('active')} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink disabled:opacity-60">
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            Kaydet
          </button>
          {mode.kind !== 'edit' && (
            <button type="button" disabled={save.isPending} onClick={() => save.mutate('draft')} className="h-10 rounded-lg border border-line px-4 font-medium text-ink hover:bg-ground disabled:opacity-60">
              Taslak olarak kaydet
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto h-10 rounded-lg px-3 font-medium text-ink-2 hover:bg-ground">
            Vazgeç
          </button>
        </>
      }
    >
      <form className="grid gap-x-4 gap-y-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate('active'))} noValidate>
        {message && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/25 bg-alert-soft px-3 py-2 text-[13px] text-alert sm:col-span-2">
            <WarningCircle size={16} className="mt-px shrink-0" />
            {message}
          </p>
        )}
        <Field id="typeCode" label="Belge türü" required error={errors.typeCode} className="sm:col-span-2">
          {mode.kind === 'create' ? (
            <select {...describe('typeCode', errors.typeCode)} value={v.typeCode} onChange={set('typeCode')} className="h-10 w-full rounded-lg border border-line bg-surface px-3">
              <option value="">Seçin</option>
              {types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-10 items-center rounded-lg border border-dashed border-line bg-ground/50 px-3 text-ink-2">{type?.name}</div>
          )}
        </Field>
        <Field id="documentNumber" label="Belge / poliçe numarası" error={errors.documentNumber}>
          <Input {...describe('documentNumber', errors.documentNumber)} value={v.documentNumber} onChange={set('documentNumber')} />
        </Field>
        <Field id="issuer" label="Düzenleyen kurum" error={errors.issuer}>
          <Input {...describe('issuer', errors.issuer)} value={v.issuer} onChange={set('issuer')} />
        </Field>
        <Field id="issuedOn" label="Düzenlenme tarihi" error={errors.issuedOn}>
          <Input {...describe('issuedOn', errors.issuedOn)} type="date" value={v.issuedOn} onChange={set('issuedOn')} />
        </Field>
        <div className="hidden sm:block" />
        <Field id="validFrom" label="Geçerlilik başlangıcı" error={errors.validFrom}>
          <Input {...describe('validFrom', errors.validFrom)} type="date" value={v.validFrom} onChange={set('validFrom')} />
        </Field>
        <Field
          id="validUntil"
          label="Son geçerlilik tarihi"
          required={type?.requiresExpiry}
          error={errors.validUntil}
          hint={type?.requiresExpiry ? 'Bu gün dahil geçerlidir. Bilinmiyorsa taslak olarak kaydedin.' : 'Bu türde zorunlu değil.'}
        >
          <Input {...describe('validUntil', errors.validUntil, true)} type="date" value={v.validUntil} onChange={set('validUntil')} />
        </Field>
        <Field id="notes" label="Not" error={errors.notes} className="sm:col-span-2">
          <Textarea {...describe('notes', errors.notes)} rows={2} value={v.notes} onChange={set('notes')} />
        </Field>
        {mode.kind !== 'edit' && uploadsEnabled && (
          <Field id="docFile" label="Dosya" hint={`PDF en fazla ${MAX_DOCUMENT_PDF_MB} MB, JPEG/PNG en fazla ${MAX_DOCUMENT_IMAGE_MB} MB.`} className="sm:col-span-2">
            <input
              id="docFile"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] file:mr-3 file:h-9 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:font-medium file:text-ink hover:file:bg-ground"
            />
          </Field>
        )}
      </form>
    </Sheet>
  )
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
