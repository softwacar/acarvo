import {
  CHECKLIST_ITEMS,
  EXTENSION_CHANNELS,
  type ExtensionChannel,
  RENTAL_CANCEL_REASONS,
  RENTAL_TABS,
  type RentalActivityItem,
  type RentalCancelReason,
  type RentalDetail,
  type RentalGate,
  type RentalInspection,
  type RentalTab,
  type ContractStatus,
} from '@acarvo/shared'
import { ArrowLeft, ArrowRight, Buildings, CalendarCheck, CheckCircle, Clock, Coins, DotsThree, Info, Key, PencilSimple, ShieldCheck, SpinnerGap, Star, WarningCircle, XCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Dialog, DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Field, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, rentalsApi } from '@/lib/api'
import { countryName } from '@/lib/customer-labels'
import { formatDuration, formatMoment } from '@/lib/reservation-labels'
import {
  CHECKLIST_ANSWER_LABELS,
  CHECKLIST_LABELS,
  CLEANLINESS_LABELS,
  CONDITION_LABELS,
  EXTENSION_CHANNEL_LABELS,
  formatLate,
  FUEL_FRACTION,
  FUEL_LEVEL_LABELS,
  PHOTO_ANGLE_LABELS,
  RENTAL_CANCEL_REASON_LABELS,
  RENTAL_STATUS_LABELS,
} from '@/lib/rental-labels'
import { CONTRACT_STATUS_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'
import { formatDateTime, formatKm } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { RentalDamageFiles } from '../operations/RentalDamageFiles'
import { ContractPanel } from '../contracts/ContractPanel'
import { RentalFinancePanel } from '../finance/RentalFinancePanel'
import { QuotePanel, QuoteSummary } from '../pricing/QuotePanel'
import { DamageDiagram, draftOf } from './DamageDiagram'
import { Note, RentalStatusBadge } from './RentalParts'
import { listSearchToReturnTo } from './search'

const TAB_LABELS: Record<RentalTab, string> = { genel: 'Genel', kisiler: 'Müşteri ve sürücüler', arac: 'Araç ve rezervasyon', fiyat: 'Fiyat teklifi', sozlesme: 'Sözleşme', finans: 'Finans', teslim: 'Teslim', iade: 'İade', hasar: 'Hasar ve fotoğraflar', gecmis: 'Geçmiş' }
const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = `p-${title.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl>
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{v ?? <span className="font-normal text-ink-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One of the three decision cards (spec §85.4): Hazır / Kontrol gerekli / Bloke, with the reason and the next step. */
function DecisionCard({ title, state, children, action }: { title: string; state: 'ok' | 'attention' | 'blocked' | 'na'; children: ReactNode; action?: ReactNode }) {
  const label = { ok: 'Hazır', attention: 'Kontrol gerekli', blocked: 'Bloke', na: 'Bağlı değil' }[state]
  const tone = { ok: 'text-ok', attention: 'text-hold', blocked: 'text-alert', na: 'text-ink-2' }[state]
  const Icon = { ok: CheckCircle, attention: Info, blocked: XCircle, na: Info }[state]
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className={cn('inline-flex items-center gap-1 text-[12.5px] font-semibold', tone)}>
          <Icon size={14} weight={state === 'ok' ? 'fill' : 'regular'} /> {label}
        </span>
      </div>
      <div className="mt-1.5 flex-1 text-[13px] text-ink-2">{children}</div>
      {action && <div className="mt-2">{action}</div>}
    </section>
  )
}
const worst = (gates: RentalGate[]) => (gates.some((g) => g.state === 'blocked') ? 'blocked' : gates.some((g) => g.state === 'attention') ? 'attention' : 'ok')

function Tabs({ tab, onTab }: { tab: RentalTab; onTab: (t: RentalTab) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = list.current
    const el = bar?.querySelector<HTMLElement>(`#ktab-${tab}`)
    if (bar && el) bar.scrollTo({ left: Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' })
  }, [tab])
  return (
    <div className="border-b border-line">
      <div ref={list} role="tablist" aria-label="Kiralama bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {RENTAL_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`ktab-${t}`}
            aria-selected={t === tab}
            aria-controls="rental-tabpanel"
            onClick={() => onTab(t)}
            className={cn('relative h-11 shrink-0 px-3 font-medium whitespace-nowrap', t === tab ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {TAB_LABELS[t]}
            {t === tab && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function FuelGauge({ level }: { level: RentalInspection['fuel'] }) {
  if (!level) return <span className="text-ink-3">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="relative h-2 w-14 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full bg-blue" style={{ width: `${FUEL_FRACTION[level] * 100}%` }} />
      </span>
      {FUEL_LEVEL_LABELS[level]}
    </span>
  )
}

/** Read view of one final (or open) inspection: facts, checklist, marks and photos. */
function InspectionView({ i, reference, referenceLabel, title, zone }: { i: RentalInspection; reference?: RentalInspection['marks']; referenceLabel?: string; title: string; zone?: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={title} action={<span className={cn('text-[12.5px] font-medium', i.state === 'final' ? 'text-ok' : 'text-hold')}>{i.state === 'final' ? `Kesinleşti · ${formatDateTime(i.finalizedAt!)}` : 'Tamamlanmadı (taslak)'}</span>}>
        <Facts
          rows={[
            ['Zaman', i.occurred ? <span className="tnum">{formatMoment(i.occurred, zone)}</span> : null],
            ['Şube', i.branch?.name ?? null],
            ['Personel', i.performedByName],
            ['Kilometre', i.km != null ? <span className="tnum">{formatKm(i.km)}</span> : null],
            ['Yakıt', <FuelGauge level={i.fuel} />],
            ['Temizlik', i.cleanliness ? CLEANLINESS_LABELS[i.cleanliness] : null],
            ['Genel durum', i.condition ? CONDITION_LABELS[i.condition] : null],
            [i.kind === 'handover' ? 'Teslim alan' : 'Getiren', i.counterpart?.displayName ?? null],
          ]}
        />
        <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Kontrol listesi</h3>
        <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
          {CHECKLIST_ITEMS.map((c) => {
            const a = i.checklist[c]
            return (
              <li key={c} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5 text-[13px]">
                <span className="text-ink-2">{CHECKLIST_LABELS[c]}</span>
                <span className={cn('font-medium', !a ? 'text-ink-3' : a === 'issue' ? 'text-alert' : 'text-ink')}>{a ? CHECKLIST_ANSWER_LABELS[a] : 'Yanıtlanmadı'}</span>
              </li>
            )
          })}
        </ul>
        {i.notes && <p className="mt-3 text-[13px] whitespace-pre-line text-ink">{i.notes}</p>}
      </Panel>
      <div className="min-w-0 space-y-5">
        <Panel title="Hasar işaretleri">
          <DamageDiagram marks={i.marks.map(draftOf)} reference={reference} referenceLabel={referenceLabel} editable={false} linkable={i.kind === 'return'} />
        </Panel>
        <Panel title={`Fotoğraflar (${i.photos.length})`}>
          {i.photos.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {i.photos.map((p, n) => (
                <li key={p.id} className="overflow-hidden rounded-lg border border-line">
                  <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-ground">
                    <img src={p.thumbUrl} alt={`${i.kind === 'handover' ? 'Teslim' : 'İade'} fotoğrafı ${n + 1}: ${PHOTO_ANGLE_LABELS[p.angle]}`} className="size-full object-cover" loading="lazy" />
                  </a>
                  <p className="px-2 py-1 text-[12px] text-ink-2">
                    {n + 1}. {PHOTO_ANGLE_LABELS[p.angle]}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Fotoğraf yok.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

/** Teslim vs İade side by side (spec §59B, §59L). */
function Comparison({ r }: { r: RentalDetail }) {
  const h = r.handover
  const ret = r.return
  const used = h?.km != null && ret?.km != null ? ret.km - h.km : null
  const newFindings = ret ? ret.marks.filter((m) => !m.existingMarkId).length : 0
  const rows: [string, ReactNode, ReactNode, ReactNode][] = [
    ['Kilometre', h?.km != null ? formatKm(h.km) : '—', ret?.km != null ? formatKm(ret.km) : '—', used != null ? `${formatKm(used)} kullanıldı` : '—'],
    ['Yakıt', <FuelGauge level={h?.fuel ?? null} />, <FuelGauge level={ret?.fuel ?? null} />, h?.fuel && ret?.fuel ? (FUEL_FRACTION[ret.fuel] < FUEL_FRACTION[h.fuel] ? 'Daha az' : FUEL_FRACTION[ret.fuel] > FUEL_FRACTION[h.fuel] ? 'Daha fazla' : 'Aynı') : '—'],
    ['Temizlik', h?.cleanliness ? CLEANLINESS_LABELS[h.cleanliness] : '—', ret?.cleanliness ? CLEANLINESS_LABELS[ret.cleanliness] : '—', ''],
    ['Fotoğraf', String(h?.photos.length ?? 0), String(ret?.photos.length ?? 0), ''],
    ['İşaret', String(h?.marks.length ?? 0), String(ret?.marks.length ?? 0), ret ? `${newFindings} yeni bulgu` : '—'],
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-[12.5px] text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium" />
            <th scope="col" className="px-3 py-2 font-medium">
              Teslim
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              İade
            </th>
            <th scope="col" className="py-2 pl-3 font-medium">
              Fark
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map(([k, a, b, c]) => (
            <tr key={k}>
              <th scope="row" className="py-2 pr-3 font-normal text-ink-2">
                {k}
              </th>
              <td className="tnum px-3 py-2 font-medium">{a}</td>
              <td className="tnum px-3 py-2 font-medium">{b}</td>
              <td className={cn('tnum py-2 pl-3', k === 'İşaret' && newFindings ? 'font-medium text-alert' : 'text-ink-2')}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ACTION_TITLES: Record<string, string> = {
  'rental.create': 'Kiralama hazırlandı',
  'rental.update': 'Kiralama değiştirildi',
  'rental.cancel': 'Kiralama iptal edildi',
  'rental.document_check': 'Belge kararı kaydedildi',
  'rental.photo.add': 'Fotoğraf eklendi',
  'rental.photo.remove': 'Fotoğraf kaldırıldı',
  'rental.deliver': 'Araç teslim edildi',
  'rental.extend': 'İade zamanı değiştirildi',
  'rental.return': 'Araç iade alındı',
  'rental.close': 'Kiralama kapatıldı',
}
const EVENT_TITLES: Record<string, string> = {
  created: 'Hazırlandı',
  updated: 'Değiştirildi',
  document_check: 'Belge kararı',
  delivered: 'Teslim edildi',
  extended: 'İade zamanı değişti',
  returned: 'İade alındı',
  closed: 'Kapandı',
  cancelled: 'İptal edildi',
}

function ActivityEntry({ e }: { e: RentalActivityItem }) {
  const s = (e.summary ?? {}) as Record<string, unknown>
  const details: string[] = []
  if (typeof s.km === 'number') details.push(`${formatKm(s.km)}`)
  if (typeof s.fuel === 'string') details.push(`yakıt ${FUEL_LEVEL_LABELS[s.fuel as 'full'] ?? s.fuel}`)
  if (typeof s.usedKm === 'number') details.push(`${formatKm(s.usedKm)} kullanıldı`)
  if (typeof s.lateMinutes === 'number' && s.lateMinutes > 0) details.push(`${formatLate(s.lateMinutes)} gecikme`)
  if (typeof s.angle === 'string') details.push(`${s.inspection === 'return' ? 'iade' : 'teslim'} · ${PHOTO_ANGLE_LABELS[s.angle as 'front'] ?? s.angle}`)
  if (typeof s.toReturnAt === 'string') details.push(`yeni iade ${formatDateTime(s.toReturnAt)} · ${EXTENSION_CHANNEL_LABELS[s.channel as 'phone'] ?? ''} · fiyat hesaplanmadı`)
  if (typeof s.reason === 'string') details.push(`neden: ${RENTAL_CANCEL_REASON_LABELS[s.reason as 'other'] ?? s.reason}`)
  if (s.externalContractAck === true) details.push('sözleşme ve fiyatın ACARVO dışında yönetildiği beyan edildi (iki beyan, dış referans kayıtlı)')
  if (typeof s.newFindings === 'number' && s.newFindings > 0) details.push(`${s.newFindings} yeni bulgu onaylandı`)
  if (Array.isArray(s.drivers)) details.push((s.drivers as { customerNo: string; decision: string; ruleStatus: string }[]).map((d) => `${d.customerNo}: ${d.decision === 'eligible' ? 'uygun' : 'uygun değil'}${d.ruleStatus === 'no_policy' ? ' (kural tanımsız)' : ''}`).join(', '))
  const changes = (s.changes as Record<string, [unknown, unknown]> | undefined) ?? {}
  return (
    <li className="grid grid-cols-[20px_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 size-2.5 rounded-full border-2', e.action === 'rental.deliver' || e.action === 'rental.close' ? 'border-blue bg-blue' : 'border-ink-3 bg-surface')} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{ACTION_TITLES[e.action] ?? e.action}</span>
          <span className="tnum text-[12.5px] text-ink-2">
            {formatDateTime(e.at)}
            {e.actorName && ` · ${e.actorName}`}
          </span>
        </div>
        {details.length > 0 && <p className="text-[13px] text-ink-2">{details.join(' · ')}</p>}
        {Object.entries(changes).map(([f, [a, b]]) => (
          <p key={f} className="text-[13px] text-ink-2">
            {f}: {String(a ?? '—')} → <span className="font-medium text-ink">{String(b ?? '—')}</span>
          </p>
        ))}
      </div>
    </li>
  )
}

function useUpdated(id: string) {
  const session = useSession()
  const qc = useQueryClient()
  return (next?: RentalDetail) => {
    if (next) qc.setQueryData(['rental', session.company?.id, id], next)
    else void qc.invalidateQueries({ queryKey: ['rental', session.company?.id, id] })
    void qc.invalidateQueries({ queryKey: ['rentals'] })
    void qc.invalidateQueries({ queryKey: ['rental-history', session.company?.id, id] })
    void qc.invalidateQueries({ queryKey: ['reservation-timeline'] })
  }
}

/** §59BV: a new planned return, re-checked against reservations and rentals. Not "paid", not priced. */
function ExtendDialog({ r, onClose }: { r: RentalDetail; onClose: () => void }) {
  const session = useSession()
  const returnFocus = useReturnFocus()
  const updated = useUpdated(r.id)
  const branches = useQuery({ queryKey: ['rental-branches', session.company?.id], queryFn: () => rentalsApi.branches() })
  const [local, setLocal] = useState(r.plannedReturn.local)
  const [choice, setChoice] = useState<'earlier' | 'later' | undefined>()
  const [branchId, setBranchId] = useState(r.returnBranch.id)
  const [channel, setChannel] = useState<ExtensionChannel | ''>('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const branch = branches.data?.items.find((b) => b.id === branchId)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">İade zamanını değiştir</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">Yeni zaman, aracın diğer rezervasyon ve kiralamalarıyla yeniden denetlenir. Çakışma varsa değişiklik uygulanmaz. Fiyat etkisi hesaplanmaz.</Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!channel) return setFields({ channel: 'Talebin nereden geldiğini seçin' })
              setPending(true)
              setError(null)
              try {
                const next = await rentalsApi.extend(r.id, { version: r.version, requestId, returnLocal: local, returnChoice: choice, returnBranchId: branchId, channel })
                updated(next)
                toast(`${r.rentalNo}: planlanan iade güncellendi.`)
                onClose()
              } catch (err) {
                if (err instanceof ApiRequestError) {
                  setError(err.message)
                  setFields(err.fields ?? {})
                  if (err.code === 'VERSION_CONFLICT') updated()
                } else setError('Kaydedilemedi.')
              } finally {
                setPending(false)
              }
            }}
          >
            <Field id="ext-branch" label="İade şubesi" required error={fields.returnBranchId}>
              <Select id="ext-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.data?.items.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <TimeField id="ext-return" label="Yeni planlanan iade" value={local} onChange={setLocal} branch={branch} choice={choice} onChoice={setChoice} error={fields.returnLocal ?? fields.returnChoice} />
            <Field id="ext-channel" label="Talep nereden geldi?" required error={fields.channel}>
              <Select id="ext-channel" value={channel} onChange={(e) => setChannel(e.target.value as ExtensionChannel)}>
                <option value="">Seçin</option>
                {EXTENSION_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {EXTENSION_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            {error && (
              <p role="alert" className="text-[13px] font-medium text-alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={pending} className={btnPrimary}>
                {pending && <SpinnerGap size={16} className="animate-spin" />}
                Kaydet
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CancelDialog({ r, onClose }: { r: RentalDetail; onClose: () => void }) {
  const returnFocus = useReturnFocus()
  const updated = useUpdated(r.id)
  const [reason, setReason] = useState<RentalCancelReason | ''>('')
  const [note, setNote] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">Kiralamayı iptal et</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {r.rentalNo} iptal edilir ve araç serbest kalır. Kayıt silinmez.{r.reservation ? ` Bağlı rezervasyon (${r.reservation.reservationNo}) “Kiralamaya dönüştü” olarak kalır.` : ''}
          </Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!reason) return setError('Bir neden seçin')
              setPending(true)
              try {
                const next = await rentalsApi.cancel(r.id, { version: r.version, requestId, reason, note: note || undefined })
                updated(next)
                toast(`${r.rentalNo} iptal edildi.`)
                onClose()
              } catch (err) {
                setError(err instanceof ApiRequestError ? err.message : 'İptal edilemedi.')
                updated()
              } finally {
                setPending(false)
              }
            }}
          >
            <Field id="c-reason" label="Neden" required error={error ?? undefined}>
              <Select id="c-reason" value={reason} onChange={(e) => setReason(e.target.value as RentalCancelReason)}>
                <option value="">Seçin</option>
                {RENTAL_CANCEL_REASONS.map((x) => (
                  <option key={x} value={x}>
                    {RENTAL_CANCEL_REASON_LABELS[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="c-note" label="Not (isteğe bağlı)">
              <Textarea id="c-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={pending} className={cn(btnPrimary, 'bg-alert hover:bg-alert hover:opacity-90')}>
                {pending && <SpinnerGap size={16} className="animate-spin" />}
                İptal et
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The terms card text (F8): what exists in ACARVO and that it never releases the handover on its own. */
function termsText(r: RentalDetail) {
  const pricing = r.deliveryGates.find((g) => g.code === 'pricing')?.detail
  const contract = r.deliveryGates.find((g) => g.code === 'contract')?.detail
  const have = [pricing?.quoteNo ? `teklif ${pricing.quoteNo}${pricing.matchesPlan === 0 ? ' (güncel değil)' : ''}` : 'fiyat teklifi yok', contract?.contractNo ? `sözleşme taslağı ${contract.contractNo}` : 'sözleşme taslağı yok'].join(', ')
  return r.externalTermsMode
    ? `ACARVO’da: ${have}. Teklif ve taslak teslimi tek başına açmaz; şirket dış süreç modunda: teslimde iki beyan ve dış referans istenir. Ödeme ve depozito kaydı yok.`
    : `ACARVO’da: ${have}. Hukuki onay, imza ve ödeme süreci olmadığından bunlar teslimi açmaz ve şirketin dış sözleşme/fiyat modu kapalı; teslim yapılamaz. Modu yalnız şirket sahibi Ayarlar’dan açabilir.`
}

function ContractSummary({ gate, external }: { gate?: RentalGate; external: string | null }) {
  const d = gate?.detail
  if (d?.contractNo) {
    return (
      <span className="tnum font-medium text-ink">
        {d.contractNo} <span className="font-normal text-ink-2">· sürüm {d.revision} · {CONTRACT_STATUS_LABEL[d.status as ContractStatus] ?? d.status}</span>
      </span>
    )
  }
  return <span className="text-ink-2">{external ? `Dış referans ${external} (beyan)` : gate ? 'Taslak yok' : 'Sözleşme sekmesinde'}</span>
}

/** Kiralama 360°: the rental's operational file, with its price quote and contract drafts. Payment and deposit are not built. */
export function Rental360Page() {
  const session = useSession()
  const navigate = useNavigate()
  const zone = session.company?.timezone
  const { rentalId } = useParams({ from: '/app/kiralamalar/$rentalId' })
  const { sekme } = useSearch({ from: '/app/kiralamalar/$rentalId' })
  const tab: RentalTab = sekme ?? 'genel'
  const q = useQuery({ queryKey: ['rental', session.company?.id, rentalId], queryFn: () => rentalsApi.get(rentalId), retry: false })
  const history = useQuery({ queryKey: ['rental-history', session.company?.id, rentalId], queryFn: () => rentalsApi.history(rentalId), enabled: tab === 'gecmis' })
  const [dialog, setDialog] = useState<'extend' | 'cancel' | null>(null)
  const onTab = (t: RentalTab) => void navigate({ to: '/kiralamalar/$rentalId', params: { rentalId }, search: t === 'genel' ? {} : { sekme: t }, replace: true, resetScroll: false })

  const back = (
    <Link to="/kiralamalar" search={listSearchToReturnTo()} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Kiralamalar
    </Link>
  )
  if (q.isError) {
    const e = q.error
    return (
      <div className="space-y-4">
        {back}
        {e instanceof ApiRequestError && e.status === 404 ? (
          <StatePanel icon={Key} title="Kiralama bulunamadı">
            <p>Bu adresteki kiralama yok ya da yetki alanınızda değil.</p>
          </StatePanel>
        ) : (
          <ErrorState message={e.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (!q.data)
    return (
      <div aria-busy="true" aria-label="Kiralama yükleniyor" className="space-y-4">
        {back}
        <div className="h-[180px] animate-pulse rounded-xl bg-line-soft/70" />
      </div>
    )

  const r = q.data
  const canManage = can(session, 'rentals.manage')
  const canHandover = can(session, 'rentals.handover')
  const start = r.delivered ?? r.plannedPickup
  const end = r.returned ?? r.plannedReturn
  const minutes = Math.round((Date.parse(end.at) - Date.parse(start.at)) / 60_000)
  const docGates = r.deliveryGates.filter((g) => ['drivers', 'branch_country', 'documents'].includes(g.code))
  const vehicleGates = r.deliveryGates.filter((g) => ['vehicle_active', 'availability', 'previous_return_open', 'vehicle_operations', 'vehicle_location', 'handover_record', 'photos'].includes(g.code))
  const active = r.status === 'prepared' || r.status === 'delivered' || r.status === 'returned'

  return (
    <div className="space-y-5">
      {back}
      <section aria-label="Kiralama özeti" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4 p-5 sm:p-6">
          <span aria-hidden className={cn('grid size-14 shrink-0 place-items-center rounded-xl', active ? 'bg-blue-soft text-blue-ink' : 'bg-ground text-ink-3')}>
            <Key size={26} />
          </span>
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[12.5px] font-semibold tracking-[0.03em] text-ink-2">{r.rentalNo}</span>
              <RentalStatusBadge status={r.status} overdueMinutes={r.overdueMinutes} className="text-[13.5px]" />
              {r.reservation ? (
                <Link to="/rezervasyonlar/$reservationId" params={{ reservationId: r.reservation.id }} className="inline-flex items-center gap-1 text-[13px] text-blue-ink hover:underline">
                  <CalendarCheck size={13} /> {r.reservation.reservationNo}
                </Link>
              ) : (
                <span className="text-[13px] text-ink-2">Doğrudan kiralama</span>
              )}
            </div>
            <h1 className="mt-1.5 text-[26px] leading-tight font-semibold tracking-[-0.025em] break-words sm:text-[30px]">{r.customer.displayName}</h1>
            <p className="tnum mt-1 text-ink-2">
              {formatMoment(start, zone)} {r.delivered ? '(teslim)' : '(plan)'} <ArrowRight size={13} className="inline" /> {formatMoment(end, zone)} {r.returned ? '(iade)' : '(plan)'} · {formatDuration(Math.max(0, minutes))}
            </p>
          </div>
          {active && (canManage || canHandover) && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {r.status === 'prepared' && canHandover && (
                <Link to="/kiralamalar/$rentalId/teslim" params={{ rentalId: r.id }} className={btnPrimary}>
                  <Key size={16} /> Teslim masası
                </Link>
              )}
              {r.status === 'delivered' && canHandover && (
                <Link to="/kiralamalar/$rentalId/iade" params={{ rentalId: r.id }} className={btnPrimary}>
                  <Key size={16} /> İadeyi al
                </Link>
              )}
              {r.status === 'returned' && canHandover && (
                <Link to="/kiralamalar/$rentalId/iade" params={{ rentalId: r.id }} className={btnPrimary}>
                  <CheckCircle size={16} /> İade kontrolü ve kapanış
                </Link>
              )}
              {r.status === 'prepared' && canManage && (
                <Link to="/kiralamalar/$rentalId/duzenle" params={{ rentalId: r.id }} className={btnSecondary}>
                  <PencilSimple size={16} /> Düzenle
                </Link>
              )}
              {canManage && r.status !== 'returned' && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger aria-label="Diğer işlemler" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-line-soft hover:text-ink">
                    <DotsThree size={20} weight="bold" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-[260px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
                      <DropdownMenu.Item onSelect={() => setDialog('extend')} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                        <Clock size={16} /> {r.status === 'delivered' ? 'Süreyi uzat / iade zamanını değiştir' : 'İade zamanını değiştir'}
                      </DropdownMenu.Item>
                      {r.status === 'prepared' && (
                        <DropdownMenu.Item onSelect={() => setDialog('cancel')} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                          <XCircle size={16} /> Kiralamayı iptal et
                        </DropdownMenu.Item>
                      )}
                      <DropdownMenu.Separator className="my-1 h-px bg-line" />
                      <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">İlgili modüllerle açılacak</DropdownMenu.Label>
                      {['Araç değiştir', 'Olağan dışı sonlandır'].map((x) => (
                        <DropdownMenu.Item key={x} disabled className="flex h-8 items-center justify-between rounded-md px-2.5 text-[13.5px] text-ink-3 outline-none">
                          {x}
                          <span className="text-[11.5px]">yakında</span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-x-6 border-t border-line-soft px-5 py-3 text-[13.5px] sm:grid-cols-2 sm:px-6 xl:grid-cols-5">
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Araç</span>
            <Link to="/araclar/$vehicleId" params={{ vehicleId: r.vehicle.id }} className="tnum font-medium text-ink hover:text-blue-ink hover:underline">
              {r.vehicle.plate} · {r.vehicle.make} {r.vehicle.model}
            </Link>
          </div>
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Şubeler</span>
            <span className="font-medium text-ink">
              {r.pickupBranch.name}
              {(r.actualReturnBranch ?? r.returnBranch).id !== r.pickupBranch.id && ` → ${(r.actualReturnBranch ?? r.returnBranch).name}`}
            </span>
          </div>
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Kurumsal hesap</span>
            {r.corporateAccount ? (
              <Link to="/kurumsal-hesaplar/$accountId" params={{ accountId: r.corporateAccount.id }} className="inline-flex items-center gap-1 font-medium text-blue-ink hover:underline">
                <Buildings size={14} /> {r.corporateAccount.legalName}
              </Link>
            ) : (
              <span className="text-ink-3">Yok</span>
            )}
          </div>
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Fiyat teklifi</span>
            <QuoteSummary kind="rental" targetId={r.id} />
          </div>
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Sözleşme</span>
            <ContractSummary gate={r.deliveryGates.find((g) => g.code === 'contract')} external={r.externalTerms?.reference ?? null} />
          </div>
        </div>
        {r.status === 'cancelled' && (
          <p className="border-t border-line-soft bg-ground/60 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
            {r.cancelledAt && formatDateTime(r.cancelledAt)} · {r.cancelledByName ?? 'Kullanıcı bilgisi yok'} tarafından iptal edildi · Neden: <span className="font-medium text-ink">{r.cancelReason ? RENTAL_CANCEL_REASON_LABELS[r.cancelReason] : '—'}</span>
            {r.cancelNote && ` · ${r.cancelNote}`}
          </p>
        )}
      </section>

      {r.overdueMinutes != null && (
        <div role="status" className="rounded-xl border border-alert/30 bg-alert-soft/60 px-4 py-3 text-[13.5px]">
          <p className="flex items-start gap-2 font-medium text-alert">
            <WarningCircle size={17} className="mt-px shrink-0" />
            İade {formatLate(r.overdueMinutes)} gecikti. Araç fiilen iade edilene kadar bu kiralamada sayılır; yeni rezervasyon veya kiralamaya ayrılamaz.
          </p>
          {r.affectedReservations.length > 0 && (
            <p className="mt-1 pl-6 text-ink-2">
              Etkilenebilecek onaylı rezervasyonlar: <span className="tnum font-medium text-ink">{r.affectedReservations.map((a) => a.reservationNo).join(', ')}</span>. Otomatik iptal veya araç değişikliği yapılmaz.
            </p>
          )}
          <p className="mt-1 pl-6 text-[12.5px] text-ink-2">Gecikme toleransı tanımlı değil; gecikme ücreti hesaplanmaz. Otomatik görev oluşturulmaz.</p>
        </div>
      )}

      {r.status === 'prepared' && (
        <div className="grid gap-3 md:grid-cols-3">
          <DecisionCard
            title="Belgeler ve sürücüler"
            state={worst(docGates)}
            action={
              canHandover && (
                <Link to="/kiralamalar/$rentalId/teslim" params={{ rentalId: r.id }} className="text-[13px] font-medium text-blue hover:underline">
                  Belge kararına git
                </Link>
              )
            }
          >
            {r.drivers.length} sürücü · {r.documentChecks.length} karar kayıtlı.{' '}
            {docGates.find((g) => g.state === 'blocked') ? 'Teslim için her sürücüye belge kararı gerekli.' : docGates.find((g) => g.state === 'attention') ? 'Kural tanımsız; karar personel kontrolüne dayanıyor.' : 'Kararlar tamam.'}
          </DecisionCard>
          <DecisionCard
            title="Araç ve teslim hazırlığı"
            state={worst(vehicleGates)}
            action={
              canHandover && (
                <Link to="/kiralamalar/$rentalId/teslim" params={{ rentalId: r.id }} className="text-[13px] font-medium text-blue hover:underline">
                  Teslim masasını aç
                </Link>
              )
            }
          >
            {vehicleGates.filter((g) => g.state === 'blocked').length} engel, {vehicleGates.filter((g) => g.state === 'attention').length} uyarı. Km, yakıt, kontrol listesi ve 4–5 fotoğraf teslim masasında.
          </DecisionCard>
          <DecisionCard
            title="Fiyat, sözleşme ve depozito"
            state={r.externalTermsMode ? 'attention' : 'blocked'}
            action={
              <span className="flex flex-wrap gap-x-3">
                <button type="button" onClick={() => onTab('fiyat')} className="text-[13px] font-medium text-blue hover:underline">
                  Fiyat teklifi
                </button>
                <button type="button" onClick={() => onTab('sozlesme')} className="text-[13px] font-medium text-blue hover:underline">
                  Sözleşme taslağı
                </button>
              </span>
            }
          >
            {termsText(r)}
          </DecisionCard>
        </div>
      )}

      <div>
        <Tabs tab={tab} onTab={onTab} />
        <div key={tab} id="rental-tabpanel" role="tabpanel" aria-labelledby={`ktab-${tab}`} className="animate-fade pt-5">
          {tab === 'genel' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                <Panel title="Plan ve gerçekleşen">
                  <Facts
                    rows={[
                      ['Planlanan alış', <span className="tnum">{formatMoment(r.plannedPickup, zone)} · {r.pickupBranch.name}</span>],
                      ['Gerçek teslim', r.delivered ? <span className="tnum">{formatMoment(r.delivered, zone)} · {r.deliveredByName}</span> : null],
                      ['Planlanan iade', <span className={cn('tnum', r.overdueMinutes != null && 'text-alert')}>{formatMoment(r.plannedReturn, zone)} · {r.returnBranch.name}</span>],
                      ['Gerçek iade', r.returned ? <span className="tnum">{formatMoment(r.returned, zone)} · {r.actualReturnBranch?.name}</span> : null],
                      ['Kapanış', r.closedAt ? `${formatDateTime(r.closedAt)} · ${r.closedByName ?? ''}` : null],
                      ['Saat dilimi', r.plannedPickup.timeZone === r.plannedReturn.timeZone ? r.plannedPickup.timeZone : `${r.plannedPickup.timeZone} → ${r.plannedReturn.timeZone}`],
                    ]}
                  />
                </Panel>
                {(r.handover || r.return) && (
                  <Panel title="Teslim ve iade karşılaştırması">
                    <Comparison r={r} />
                  </Panel>
                )}
                <Panel title="Not">{r.note ? <p className="whitespace-pre-line text-ink">{r.note}</p> : <p className="text-ink-2">Not yok.</p>}</Panel>
              </div>
              <div className="min-w-0 space-y-5">
                <section className="rounded-xl border border-line bg-surface p-5">
                  <span className="grid size-10 place-items-center rounded-lg bg-ground text-ink-2">
                    <Coins size={20} />
                  </span>
                  <h2 className="mt-3 text-[15px] font-semibold">Fiyat, sözleşme ve finans</h2>
                  <p className="mt-1 text-[13px] text-ink-2">Fiyat teklifi, sözleşme taslağı ve finans kayıtları (iç hesap, tahsilat, depozito) kendi sekmelerindedir. ACARVO para tahsil etmez, fatura kesmez ve elektronik imza içermez.</p>
                  <button type="button" onClick={() => onTab('finans')} className="mt-2 text-[13px] font-medium text-blue hover:underline">
                    Finans sekmesine git
                  </button>
                </section>
                <Panel title="Kayıt bilgisi">
                  <Facts
                    rows={[
                      ['Oluşturan', r.createdByName ?? 'Kullanıcı bilgisi yok'],
                      ['Oluşturulma', formatDateTime(r.createdAt)],
                      ['Son değişiklik', formatDateTime(r.updatedAt)],
                      ['Sürüm', String(r.version)],
                    ]}
                  />
                </Panel>
              </div>
            </div>
          )}
          {tab === 'kisiler' && (
            <div className="space-y-5">
              <Panel title="Müşteri ve sürücüler">
                <ul className="divide-y divide-line-soft">
                  {[{ p: r.customer, role: 'Kiracı (müşteri)', primary: false }, ...r.drivers.map((d) => ({ p: d, role: d.isPrimary ? 'Ana sürücü' : 'Ek sürücü', primary: d.isPrimary }))].map(({ p, role, primary }, i) => (
                    <li key={`${p.id}-${i}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <span className="block text-[12px] text-ink-2">{role}</span>
                        <Link to="/musteriler/$customerId" params={{ customerId: p.id }} className="font-medium text-ink hover:text-blue-ink hover:underline">
                          {p.displayName}
                        </Link>
                        <span className="tnum ml-2 text-[12.5px] text-ink-2">{p.customerNo}</span>
                        {primary && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[12px] font-medium text-blue-ink">
                            <Star size={11} weight="fill" /> Ana sürücü
                          </span>
                        )}
                        <p className="tnum truncate text-[12.5px] text-ink-2">{[p.phone, p.email, p.residenceCountry && `İkamet: ${countryName(p.residenceCountry)}`].filter(Boolean).join(' · ') || ' '}</p>
                      </div>
                      <div className="text-[12.5px] sm:text-right">
                        {(() => {
                          const c = r.documentChecks.find((x) => x.customerId === p.id)
                          if (role.startsWith('Kiracı')) return null
                          if (!c) return <span className="text-hold">Belge kararı yok</span>
                          return (
                            <span className={c.decision === 'eligible' ? 'text-ok' : 'text-alert'}>
                              {c.decision === 'eligible' ? 'Uygun' : 'Uygun değil'} · {c.residencyClass === 'local' ? 'yerli' : 'yabancı'} · {c.ruleStatus === 'policy_applied' ? `kural sürüm ${c.policyVersion}` : 'kural tanımsız'}
                            </span>
                          )
                        })()}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              {r.documentChecks.length > 0 && (
                <Panel title="Kiralama dosyası: uygulanan belge kararı">
                  <ul className="divide-y divide-line-soft text-[13px]">
                    {r.documentChecks.map((c) => {
                      const p = r.drivers.find((d) => d.id === c.customerId)
                      return (
                        <li key={c.customerId} className="py-2.5">
                          <p className="font-medium text-ink">
                            {p?.displayName ?? c.customerId} · {c.driverRole === 'primary' ? 'ana sürücü' : 'ek sürücü'}
                          </p>
                          <p className="text-ink-2">
                            Referans ülke {c.referenceCountry ? countryName(c.referenceCountry) : '—'} · {c.residencyClass === 'local' ? 'yerli' : 'yabancı'} (personel kararı) · {c.ruleStatus === 'policy_applied' ? `kural sürüm ${c.policyVersion}, ${c.requiredItems.length} madde` : 'etkin kural yok'} · {c.documentCount} belge kaydı · {c.decision === 'eligible' ? 'uygun' : 'uygun değil'} · {c.checkedByName} · {formatDateTime(c.checkedAt)}
                          </p>
                          {c.note && <p className="text-ink-2">Not: {c.note}</p>}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
                    <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
                    Bu kayıt değişmez: müşteri belgeleri veya kurallar sonradan değişse de kiralamanın dosyası aynı kalır. Belge numarası tutulmaz; yalnız belge kayıtlarının kimlikleri.
                  </p>
                </Panel>
              )}
            </div>
          )}
          {tab === 'arac' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Araç">
                <Facts
                  rows={[
                    ['Plaka', <Link to="/araclar/$vehicleId" params={{ vehicleId: r.vehicle.id }} className="tnum text-blue-ink hover:underline">{r.vehicle.plate}</Link>],
                    ['Marka / model', `${r.vehicle.make} ${r.vehicle.model}`],
                    ['Sınıf', r.vehicleClass.name],
                    ['Durum', r.vehicle.status === 'active' ? 'Hizmette' : 'Hizmet dışı'],
                    ['Ana şube', r.vehicle.homeBranch.name],
                    ['Kayıtlı son km', r.vehicle.currentKm != null ? formatKm(r.vehicle.currentKm) : null],
                  ]}
                />
                <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">Teslim ve iade km’si aracın km geçmişine kendi kaynağıyla yazılır; elle düzeltilemez. İade başka şubede alınırsa aracın konumu o şube olur, ana şubesi değişmez.</p>
              </Panel>
              <Panel title="Rezervasyon">
                {r.reservation ? (
                  <Facts
                    rows={[
                      ['Rezervasyon', <Link to="/rezervasyonlar/$reservationId" params={{ reservationId: r.reservation.id }} className="tnum text-blue-ink hover:underline">{r.reservation.reservationNo}</Link>],
                      ['Durumu', 'Kiralamaya dönüştü'],
                    ]}
                  />
                ) : (
                  <p className="text-ink-2">Bu kiralama bir rezervasyondan oluşturulmadı (doğrudan kiralama).</p>
                )}
                <Note>Rezervasyonun alış ve iade bilgileri kendi kaydında korunur; kiralamadaki değişiklikler rezervasyonu değiştirmez.</Note>
              </Panel>
            </div>
          )}
          {tab === 'fiyat' &&
            (can(session, 'pricing.read') ? (
              <QuotePanel kind="rental" targetId={r.id} targetNo={r.rentalNo} open={r.status === 'prepared' || r.status === 'delivered'} />
            ) : (
              <StatePanel icon={Coins} title="Fiyat teklifini görme yetkiniz yok">
                <p>Fiyat teklifleri fiyat görüntüleme yetkisi olan kullanıcılara açıktır.</p>
              </StatePanel>
            ))}
          {tab === 'sozlesme' &&
            (can(session, 'contracts.read') ? (
              <ContractPanel rentalId={r.id} rentalNo={r.rentalNo} rentalOpen={r.status === 'prepared' || r.status === 'delivered'} />
            ) : (
              <StatePanel icon={Key} title="Sözleşmeleri görme yetkiniz yok">
                <p>Sözleşme taslakları sözleşme görüntüleme yetkisi olan kullanıcılara açıktır.</p>
              </StatePanel>
            ))}
          {tab === 'finans' &&
            (can(session, 'finance.read') ? (
              <RentalFinancePanel rentalId={r.id} />
            ) : (
              <StatePanel icon={Coins} title="Finans bilgilerini görme yetkiniz yok">
                <p>Kiralamanın finans bölümü finans görüntüleme yetkisi olan kullanıcılara açıktır.</p>
              </StatePanel>
            ))}
          {tab === 'teslim' &&
            (r.handover ? (
              <div className="space-y-5">
                {r.externalTerms && (
                  <Panel title="Dış sözleşme ve fiyat beyanları">
                    <Facts
                      rows={[
                        ['Sözleşme beyanı', formatDateTime(r.externalTerms.contractAckAt)],
                        ['Fiyat beyanı', formatDateTime(r.externalTerms.pricingAckAt)],
                        ['Dış referans', <span className="tnum">{r.externalTerms.reference}</span>],
                        ['Beyan eden', r.externalTerms.byName],
                      ]}
                    />
                    <Note>Bunlar personel beyanıdır; imzalı sözleşmenin, ödemenin, kesin fiyatın veya hukuki uygunluğun kanıtı değildir.</Note>
                  </Panel>
                )}
                <InspectionView i={r.handover} reference={r.previousReturnMarks} referenceLabel="Önceki iadedeki işaret" title="Teslim kaydı" zone={zone} />
              </div>
            ) : (
              <StatePanel icon={Key} title="Teslim kaydı yok">
                <p>{r.status === 'prepared' ? 'Teslim masasında km, yakıt, kontrol listesi ve fotoğraflar girildiğinde burada görünür.' : 'Bu kiralama teslim edilmedi.'}</p>
                {r.status === 'prepared' && canHandover && (
                  <Link to="/kiralamalar/$rentalId/teslim" params={{ rentalId: r.id }} className={cn(btnPrimary, 'mt-4')}>
                    Teslim masasını aç
                  </Link>
                )}
              </StatePanel>
            ))}
          {tab === 'iade' &&
            (r.return ? (
              <div className="space-y-5">
                <InspectionView i={r.return} reference={r.handover?.marks} referenceLabel="Teslimdeki işaret" title="İade kaydı" zone={zone} />
                <Panel title="Teslim / iade karşılaştırması">
                  <Comparison r={r} />
                </Panel>
              </div>
            ) : (
              <StatePanel icon={Key} title="İade kaydı yok">
                <p>{r.status === 'delivered' ? 'Araç iade alındığında km, yakıt ve kontrol burada görünür.' : 'Araç teslim edilmeden iade alınmaz.'}</p>
                {r.status === 'delivered' && canHandover && (
                  <Link to="/kiralamalar/$rentalId/iade" params={{ rentalId: r.id }} className={cn(btnPrimary, 'mt-4')}>
                    İadeyi al
                  </Link>
                )}
              </StatePanel>
            ))}
          {tab === 'hasar' && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Önce (teslim)">
                  {r.handover ? <DamageDiagram marks={r.handover.marks.map(draftOf)} reference={r.previousReturnMarks} referenceLabel="Önceki iadedeki işaret" editable={false} /> : <p className="text-ink-2">Teslim kaydı yok.</p>}
                </Panel>
                <Panel title="Sonra (iade)">
                  {r.return ? <DamageDiagram marks={r.return.marks.map(draftOf)} reference={r.handover?.marks} referenceLabel="Teslimdeki işaret" editable={false} linkable /> : <p className="text-ink-2">İade kaydı yok.</p>}
                </Panel>
              </div>
              {r.return && r.return.marks.some((m) => !m.existingMarkId) && (
                <p className="flex items-start gap-2 rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-2.5 text-[13px] text-ink">
                  <WarningCircle size={16} className="mt-px shrink-0 text-hold" />
                  İadede {r.return.marks.filter((m) => !m.existingMarkId).length} yeni bulgu var
                  {r.return.findingsAcknowledgedAt ? ` (${formatDateTime(r.return.findingsAcknowledgedAt)} tarihinde görüldüğü onaylandı)` : ''}. Kontrol kesinleşince her bulgu için hasar dosyası açılabilir; sorumluluk kararı, muafiyet veya ücret kendiliğinden oluşmaz.
                </p>
              )}
              <RentalDamageFiles rentalId={r.id} />
              <Panel title="Fotoğraflar">
                <div className="grid gap-5 lg:grid-cols-2">
                  {(['handover', 'return'] as const).map((k) => {
                    const i = k === 'handover' ? r.handover : r.return
                    return (
                      <div key={k}>
                        <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{k === 'handover' ? 'Teslim' : 'İade'}</h3>
                        {i?.photos.length ? (
                          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {i.photos.map((p, n) => (
                              <li key={p.id} className="overflow-hidden rounded-lg border border-line">
                                <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-ground">
                                  <img src={p.thumbUrl} alt={`${k === 'handover' ? 'Teslim' : 'İade'} fotoğrafı ${n + 1}: ${PHOTO_ANGLE_LABELS[p.angle]}`} className="size-full object-cover" loading="lazy" />
                                </a>
                                <p className="px-2 py-1 text-[12px] text-ink-2">{PHOTO_ANGLE_LABELS[p.angle]}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-ink-2">Fotoğraf yok.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>
          )}
          {tab === 'gecmis' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <Panel title="İşlem geçmişi" action={<span className="text-[12.5px] text-ink-2">Kim, ne zaman, ne yaptı</span>}>
                {history.isPending ? (
                  <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
                ) : history.isError ? (
                  <ErrorState message={history.error.message} onRetry={() => history.refetch()} />
                ) : history.data.items.length === 0 ? (
                  <p className="text-ink-2">Kayıt geçmişi yok (veri yüklemesiyle oluşturulmuş olabilir).</p>
                ) : (
                  <ol className="divide-y divide-line-soft">
                    {history.data.items.map((e) => (
                      <ActivityEntry key={e.id} e={e} />
                    ))}
                  </ol>
                )}
                <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
                  <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
                  Kişilerin adları, iletişim bilgileri, belge numaraları ve notlar geçmişe kopyalanmaz; numaralar, plaka, şube kodu, km ve saatler tutulur.
                </p>
              </Panel>
              <Panel title="Durum adımları">
                <ol className="divide-y divide-line-soft">
                  {r.events.map((e) => (
                    <li key={e.id} className="py-2 text-[13px]">
                      <span className="font-medium text-ink">{EVENT_TITLES[e.kind] ?? e.kind}</span>
                      {e.kind !== 'updated' && e.kind !== 'document_check' && e.kind !== 'extended' && <span className="text-ink-2"> · {RENTAL_STATUS_LABELS[e.toStatus]}</span>}
                      <span className="tnum block text-[12px] text-ink-2">
                        {formatDateTime(e.at)}
                        {e.actorName && ` · ${e.actorName}`}
                      </span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          )}
        </div>
      </div>

      {dialog === 'extend' && <ExtendDialog r={r} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelDialog r={r} onClose={() => setDialog(null)} />}
    </div>
  )
}
