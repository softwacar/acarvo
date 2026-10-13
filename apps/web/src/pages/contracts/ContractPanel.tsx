import type { ContractDetail, ContractStatus } from '@acarvo/shared'
import { ArrowClockwise, Archive, DownloadSimple, FileText, PaperPlaneTilt, SealWarning, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useRef, useState } from 'react'
import { describe, Field, Input, Select } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, contractsApi, type RentalContractsResponse } from '@/lib/api'
import { CONTRACT_ARCHIVE_REASON_LABEL, CONTRACT_STATUS_LABEL, LANGUAGE_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { ReasonDialog } from '../corporate/ui'

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'
const OPEN: ContractStatus[] = ['draft', 'under_review', 'externally_processed']
const ARCHIVE_REASONS = ['entry_error', 'replaced_outside', 'rental_cancelled', 'other'] as const
type ArchiveReason = (typeof ARCHIVE_REASONS)[number]

const STATUS_TONE: Record<ContractStatus, string> = {
  draft: 'border-line bg-ground text-ink-2',
  under_review: 'border-hold/30 bg-hold-soft text-hold',
  externally_processed: 'border-blue/25 bg-blue-soft text-blue-ink',
  archived: 'border-line bg-ground text-ink-3',
  superseded: 'border-line bg-ground text-ink-3',
}
export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[12.5px] font-medium', STATUS_TONE[status])}>{CONTRACT_STATUS_LABEL[status]}</span>
}

const EVENT_LABEL: Record<string, string> = {
  created: 'Taslak oluşturuldu',
  review: 'Kontrole gönderildi',
  external: 'Dışarıda işleme alındı beyanı',
  archived: 'Arşivlendi',
  superseded: 'Yeni sürümle değiştirildi',
  viewed: 'Görüntülendi',
  downloaded: 'PDF indirildi',
}

/** Contracts of a rental (Contracts V1): drafts made from an active template, with an immutable text and a draft PDF. */
export function ContractPanel({ rentalId, rentalNo, rentalOpen }: { rentalId: string; rentalNo: string; rentalOpen: boolean }) {
  const session = useSession()
  const qc = useQueryClient()
  const key = ['rental-contracts', session.company?.id, rentalId]
  const list = useQuery({ queryKey: key, queryFn: () => contractsApi.forRental(rentalId), retry: false })
  const [selected, setSelected] = useState<string | null>(null)
  const canManage = can(session, 'contracts.manage')

  if (list.isPending) return <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Sözleşmeler yükleniyor" />
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
  const data = list.data
  const shownId = selected ?? data.items[0]?.id ?? null
  const hasOpen = data.items.some((c) => OPEN.includes(c.status))
  const refresh = (next?: ContractDetail) => {
    if (next) {
      qc.setQueryData(['contract', session.company?.id, next.id], next)
      setSelected(next.id)
    }
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: ['rental', session.company?.id, rentalId] })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {shownId ? (
          <ContractView key={shownId} id={shownId} templates={data.activeTemplates} canManage={canManage && rentalOpen} onChanged={refresh} />
        ) : (
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-start gap-3">
              <FileText size={22} className="mt-0.5 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">Sözleşme taslağı yok</h2>
                <p className="mt-0.5 text-[13px] text-ink-2">{rentalNo} için ACARVO’da sözleşme taslağı oluşturulmadı. İmzalı sözleşme kaydı ACARVO’da tutulmaz.</p>
              </div>
            </div>
            {canManage && rentalOpen && <CreateContract rentalId={rentalId} templates={data.activeTemplates} onCreated={refresh} />}
            {!rentalOpen && <p className="mt-3 text-[13px] text-ink-2">Kiralama kapandığı veya iptal edildiği için yeni taslak oluşturulamaz.</p>}
          </section>
        )}
        {shownId && canManage && rentalOpen && !hasOpen && (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[15px] font-semibold">Yeni sözleşme taslağı</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">Önceki sözleşmeler arşivlendi; yeni bir numara ile taslak açılabilir.</p>
            <CreateContract rentalId={rentalId} templates={data.activeTemplates} onCreated={refresh} />
          </section>
        )}
      </div>
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="contract-list" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="contract-list" className="mb-2 text-[15px] font-semibold">
            Sözleşmeler ve sürümler
          </h2>
          {data.items.length === 0 ? (
            <p className="text-[13px] text-ink-2">Kayıt yok.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === shownId ? 'true' : undefined}
                    onClick={() => setSelected(c.id)}
                    className={cn('w-full rounded-lg px-2 py-2 text-left hover:bg-ground', c.id === shownId && 'bg-blue-soft/60')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="tnum font-medium text-ink">
                        {c.contractNo} · s{c.revision}
                      </span>
                      <ContractStatusBadge status={c.status} />
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-2">
                      {formatDateTime(c.createdAt)} · {c.templateName} v{c.templateVersionNo} · {c.quoteNo ? `teklif ${c.quoteNo}` : 'fiyat hesaplanmadı'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-line bg-surface p-5 text-[13px] text-ink-2">
          <p className="flex items-start gap-2 font-medium text-ink">
            <SealWarning size={16} className="mt-px shrink-0 text-hold" /> ACARVO’da elektronik imza yok
          </p>
          <p className="mt-1.5">Taslak hukuki onay bekler. “Dışarıda işleme alındı” bir personel beyanıdır; imzanın doğrulandığı anlamına gelmez. Sözleşme ve teklif teslimi tek başına açmaz.</p>
        </section>
      </div>
    </div>
  )
}

function CreateContract({ rentalId, templates, onCreated }: { rentalId: string; templates: RentalContractsResponse['activeTemplates']; onCreated: (c: ContractDetail) => void }) {
  const [templateVersionId, setTemplateVersionId] = useState(templates.length === 1 ? templates[0]!.id : '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(crypto.randomUUID())
  if (!templates.length) {
    return (
      <p className="mt-3 rounded-lg bg-ground/70 px-3.5 py-2.5 text-[13px] text-ink-2">
        Etkin sözleşme şablonu yok. Şablonu şirket sahibi Ayarlar → Sözleşme şablonları bölümünde hazırlayıp etkinleştirir.
      </p>
    )
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!templateVersionId) return setError('Şablon seçin')
        setPending(true)
        setError(null)
        try {
          const c = await contractsApi.create(rentalId, templateVersionId, requestId.current)
          toast(`${c.contractNo} taslağı oluşturuldu.`)
          onCreated(c)
        } catch (err) {
          requestId.current = crypto.randomUUID()
          setError(err instanceof Error ? err.message : 'Taslak oluşturulamadı.')
        } finally {
          setPending(false)
        }
      }}
    >
      <Field id="c-template" label="Şablon" required error={error ?? undefined} className="min-w-[220px] flex-1">
        <Select {...describe('c-template', error ?? undefined)} value={templateVersionId} onChange={(e) => setTemplateVersionId(e.target.value)}>
          <option value="">Seçin</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {LANGUAGE_LABEL[t.language] ?? t.language}
              {t.country ? ` · ${t.country}` : ''} · sürüm {t.versionNo}
              {t.isSample ? ' · örnekten' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? <SpinnerGap size={16} className="animate-spin" /> : <FileText size={16} />}
        Taslak oluştur
      </button>
      <p className="w-full text-[12.5px] text-ink-2">Taslak; kiralama, kişiler, araç, dönem ve geçerli fiyat teklifinden o anki haliyle oluşturulur ve sonradan değişmez. Teklif yoksa “Fiyat hesaplanmadı” yazar.</p>
    </form>
  )
}

function ContractView({ id, templates, canManage, onChanged }: { id: string; templates: RentalContractsResponse['activeTemplates']; canManage: boolean; onChanged: (c?: ContractDetail) => void }) {
  const session = useSession()
  // Each open of a contract is logged by the server: load it once per selection, not on every focus.
  const q = useQuery({ queryKey: ['contract', session.company?.id, id], queryFn: () => contractsApi.get(id), staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false, retry: false })
  const [dialog, setDialog] = useState<'external' | 'archive' | 'revise' | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (q.isPending) return <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Sözleşme yükleniyor" />
  if (q.isError) {
    return q.error instanceof ApiRequestError && q.error.status === 404 ? (
      <StatePanel icon={FileText} title="Sözleşme bulunamadı">
        <p>Bu sözleşme yok ya da yetki alanınızda değil.</p>
      </StatePanel>
    ) : (
      <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
    )
  }
  const c = q.data
  const run = async (name: string, fn: () => Promise<ContractDetail | void>, done?: string) => {
    setPending(name)
    setError(null)
    try {
      const next = await fn()
      if (next) onChanged(next)
      if (done) toast(done)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem yapılamadı.')
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') onChanged()
      return false
    } finally {
      setPending(null)
    }
  }
  const open = OPEN.includes(c.status)
  return (
    <section aria-labelledby="contract-view" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="contract-view" className="tnum text-[17px] font-semibold">
              {c.contractNo} · sürüm {c.revision}
            </h2>
            <ContractStatusBadge status={c.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {c.template.name} · şablon sürümü {c.template.versionNo} · {c.quote ? `teklif ${c.quote.no}` : 'fiyat hesaplanmadı'} · {formatDateTime(c.createdAt)}
            {c.createdByName && ` · ${c.createdByName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.canDownload && (
            <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => run('pdf', () => contractsApi.downloadPdf(c.id), 'PDF taslağı indirildi.')}>
              {pending === 'pdf' ? <SpinnerGap size={16} className="animate-spin" /> : <DownloadSimple size={16} />}
              PDF taslağı
            </button>
          )}
          {canManage && c.status === 'draft' && (
            <button type="button" className={btnPrimary} disabled={pending !== null} onClick={() => run('review', () => contractsApi.review(c.id, c.version, crypto.randomUUID()), `${c.contractNo} kontrole gönderildi.`)}>
              {pending === 'review' ? <SpinnerGap size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
              Kontrole gönder
            </button>
          )}
          {canManage && c.status === 'under_review' && (
            <button type="button" className={btnPrimary} disabled={pending !== null} onClick={() => setDialog('external')}>
              Dışarıda işleme alındı
            </button>
          )}
          {canManage && open && (
            <>
              <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => setDialog('revise')}>
                <ArrowClockwise size={16} /> Yeni sürüm
              </button>
              <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => setDialog('archive')}>
                <Archive size={16} /> Arşivle
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {error}
        </p>
      )}
      {c.status === 'externally_processed' && (
        <p className="mx-5 mb-3 rounded-lg border border-blue/20 bg-blue-soft/60 px-3.5 py-2.5 text-[13px] text-ink">
          Personel beyanı: sözleşme ACARVO dışında işleme alındı · dış referans <span className="tnum font-medium">{c.externalReference}</span> · {c.externalAckAt && formatDateTime(c.externalAckAt)}
          {c.externalAckByName && ` · ${c.externalAckByName}`}. Bu bir elektronik imza veya ACARVO doğrulaması değildir.
        </p>
      )}
      <div className="border-t border-line-soft p-5">
        <p className="mb-2 rounded-md border border-hold/40 bg-hold-soft px-3 py-1.5 text-center text-[12.5px] font-semibold tracking-[0.02em] text-hold">TASLAK — HUKUKİ ONAY BEKLİYOR</p>
        <div tabIndex={0} aria-label="Sözleşme metni" className="max-h-[480px] overflow-y-auto rounded-lg border border-line-soft bg-ground/40 px-4 py-3 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-ink">
          {c.snapshot.renderedText || 'Şablon metni boş.'}
        </div>
        {!c.snapshot.quote && <p className="mt-2 text-[12.5px] text-hold">Fiyat hesaplanmadı: taslak bu kiralamanın geçerli bir fiyat teklifi olmadan oluşturuldu.</p>}
      </div>
      <div className="border-t border-line-soft p-5">
        <h3 className="mb-2 text-[13.5px] font-semibold">Sözleşme geçmişi</h3>
        <ol className="divide-y divide-line-soft">
          {c.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-[13px]">
              <span className="text-ink">
                {EVENT_LABEL[e.kind] ?? e.kind}
                {e.kind === 'archived' && typeof e.data?.reason === 'string' && <span className="text-ink-2"> · {CONTRACT_ARCHIVE_REASON_LABEL[e.data.reason] ?? e.data.reason}</span>}
                {e.kind === 'external' && typeof e.data?.externalReference === 'string' && <span className="text-ink-2"> · {e.data.externalReference}</span>}
              </span>
              <span className="tnum text-[12.5px] text-ink-2">
                {formatDateTime(e.at)}
                {e.actorName && ` · ${e.actorName}`}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {dialog === 'external' && (
        <ExternalDialog
          contractNo={c.contractNo}
          onClose={() => setDialog(null)}
          onSubmit={(ref) => run('external', () => contractsApi.external(c.id, { version: c.version, requestId: crypto.randomUUID(), externalAck: true, externalReference: ref }), 'Beyan kaydedildi.')}
        />
      )}
      {dialog === 'archive' && (
        <ReasonDialog<ArchiveReason>
          title="Sözleşmeyi arşivle"
          description={`${c.contractNo} sürüm ${c.revision} arşivlenir. Kayıt ve metni silinmez; geçmişte kalır.`}
          reasons={ARCHIVE_REASONS}
          labels={CONTRACT_ARCHIVE_REASON_LABEL as Record<ArchiveReason, string>}
          confirm="Arşivle"
          pending={pending === 'archive'}
          error={null}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            if (await run('archive', () => contractsApi.archive(c.id, { version: c.version, requestId: crypto.randomUUID(), reason }), `${c.contractNo} arşivlendi.`)) setDialog(null)
          }}
        />
      )}
      {dialog === 'revise' && (
        <ReviseDialog
          c={c}
          templates={templates}
          onClose={() => setDialog(null)}
          onSubmit={(templateVersionId) => run('revise', () => contractsApi.revise(c.id, { version: c.version, templateVersionId, requestId: crypto.randomUUID() }), 'Yeni sürüm oluşturuldu.')}
        />
      )}
    </section>
  )
}

function DialogShell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const returnFocus = useReturnFocus()
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ExternalDialog({ contractNo, onClose, onSubmit }: { contractNo: string; onClose: () => void; onSubmit: (reference: string) => Promise<boolean> }) {
  const [ack, setAck] = useState(false)
  const [ref, setRef] = useState('')
  const [errors, setErrors] = useState<{ ack?: string; ref?: string }>({})
  const [pending, setPending] = useState(false)
  return (
    <DialogShell title="Dışarıda işleme alındı" description={`${contractNo} için personel beyanı. ACARVO imzayı doğrulamaz; bu kayıt elektronik imza değildir.`} onClose={onClose}>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const next: typeof errors = {}
          if (!ack) next.ack = 'Beyanı onaylayın'
          if (!/^[A-Za-z0-9][A-Za-z0-9 ./_-]{2,39}$/.test(ref.trim())) next.ref = 'Dış referans 3–40 karakter: harf, rakam, boşluk ve . / _ -'
          setErrors(next)
          if (Object.keys(next).length) return
          setPending(true)
          const ok = await onSubmit(ref.trim())
          setPending(false)
          if (ok) onClose()
        }}
      >
        <div>
          <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-invalid={errors.ack ? true : undefined} aria-describedby={errors.ack ? 'ext-ack-error' : undefined} className="mt-1 size-4 accent-blue" />
            Bu sözleşmenin ACARVO dışındaki süreçte (ör. kâğıt veya şirketin kendi sistemi) işleme alındığını beyan ederim.
          </label>
          {errors.ack && (
            <p id="ext-ack-error" className="mt-1 text-[13px] text-alert">
              {errors.ack}
            </p>
          )}
        </div>
        <Field id="ext-ref" label="Dış referans" required error={errors.ref} hint="Dış süreçteki belge veya dosya numarası. Kişi adı veya kimlik numarası yazmayın.">
          <Input {...describe('ext-ref', errors.ref, true)} maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Beyanı kaydet
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

function ReviseDialog({ c, templates, onClose, onSubmit }: { c: ContractDetail; templates: RentalContractsResponse['activeTemplates']; onClose: () => void; onSubmit: (templateVersionId: string) => Promise<boolean> }) {
  const [tv, setTv] = useState(templates.find((t) => t.name === c.template.name)?.id ?? templates[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  return (
    <DialogShell
      title="Yeni sözleşme sürümü"
      description={`${c.contractNo} sürüm ${c.revision + 1} oluşturulur; sürüm ${c.revision} “yeni sürümle değiştirildi” olur ve metni aynen saklanır. Güncel kiralama bilgileri ve geçerli teklif kullanılır.`}
      onClose={onClose}
    >
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!tv) return
          setPending(true)
          const ok = await onSubmit(tv)
          setPending(false)
          if (ok) onClose()
        }}
      >
        {templates.length ? (
          <Field id="rev-template" label="Şablon" required>
            <Select id="rev-template" value={tv} onChange={(e) => setTv(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · sürüm {t.versionNo}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-[13px] text-hold">Etkin şablon yok; yeni sürüm oluşturulamaz.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
          <button type="submit" disabled={pending || !tv} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Yeni sürüm oluştur
          </button>
        </div>
      </form>
    </DialogShell>
  )
}
