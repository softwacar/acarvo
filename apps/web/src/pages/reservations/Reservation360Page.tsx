import {
  RESERVATION_CANCEL_REASONS,
  RESERVATION_NO_SHOW_REASONS,
  RESERVATION_TABS,
  type ReservationActivityItem,
  type ReservationCancelReason,
  type ReservationDetail,
  type ReservationNoShowReason,
  type ReservationPerson,
  type ReservationTab,
} from '@acarvo/shared'
import { ArrowLeft, ArrowRight, Buildings, CalendarCheck, Car, CheckCircle, Coins, DotsThree, Info, Key, PencilSimple, ShieldCheck, SpinnerGap, Star, WarningCircle, XCircle } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Dialog, DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Field, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, rentalsApi, reservationsApi } from '@/lib/api'
import { countryName } from '@/lib/customer-labels'
import {
  CANCEL_REASON_LABELS,
  CHANGE_REASON_LABELS,
  formatDuration,
  formatMoment,
  NO_SHOW_REASON_LABELS,
  RESERVATION_SOURCE_LABELS,
  RESERVATION_STATUS_LABELS,
  WARNING_LABELS,
} from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { QuotePanel, QuoteSummary } from '../pricing/QuotePanel'
import { StatusBadge } from './ReservationParts'
import { listSearchToReturnTo } from './search'

const TAB_LABELS: Record<ReservationTab, string> = { genel: 'Genel', kisiler: 'Kişiler', arac: 'Araç', durum: 'Durum geçmişi', gecmis: 'İşlem geçmişi', fiyat: 'Fiyat teklifi' }
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

function useUpdated(id: string) {
  const session = useSession()
  const qc = useQueryClient()
  return (next?: ReservationDetail) => {
    if (next) qc.setQueryData(['reservation', session.company?.id, id], next)
    else void qc.invalidateQueries({ queryKey: ['reservation', session.company?.id, id] })
    void qc.invalidateQueries({ queryKey: ['reservations'] })
    void qc.invalidateQueries({ queryKey: ['reservation-timeline'] })
    void qc.invalidateQueries({ queryKey: ['reservation-history', session.company?.id, id] })
  }
}

/** Cancel / No-show with a reason and an optional note (§59BF: not the same thing; no automatic fee). */
function ReasonNoteDialog<T extends string>({ title, description, reasons, labels, confirm, onSubmit, onClose, danger }: { title: string; description: string; reasons: readonly T[]; labels: Record<T, string>; confirm: string; onSubmit: (reason: T, note: string) => Promise<unknown>; onClose: () => void; danger?: boolean }) {
  const returnFocus = useReturnFocus()
  const [reason, setReason] = useState<T | ''>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!reason) return setError('Bir neden seçin')
              setError(null)
              setPending(true)
              try {
                await onSubmit(reason, note)
              } catch (err) {
                setError(err instanceof ApiRequestError ? err.message : 'İşlem yapılamadı.')
              } finally {
                setPending(false)
              }
            }}
          >
            <Field id="r-reason" label="Neden" required error={error ?? undefined}>
              <Select id="r-reason" aria-invalid={error ? true : undefined} aria-describedby={error ? 'r-reason-error' : undefined} value={reason} onChange={(e) => setReason(e.target.value as T)}>
                <option value="">Seçin</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="r-note" label="Not (isteğe bağlı)">
              <Textarea id="r-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={pending} className={cn(btnPrimary, danger && 'bg-alert hover:bg-alert hover:opacity-90')}>
                {pending && <SpinnerGap size={16} className="animate-spin" />}
                {confirm}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Confirmed reservation → prepared rental (atomic on the server; once; a resent request returns the same rental). */
function ConvertDialog({ r, onClose }: { r: ReservationDetail; onClose: () => void }) {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const returnFocus = useReturnFocus()
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">Kiralamaya dönüştür</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {r.reservationNo} için “Teslim bekliyor” durumunda bir kiralama açılır. Araç ({r.vehicle?.plate}), dönem, şubeler, müşteri, kurumsal hesap ve sürücüler kiralamaya taşınır. Rezervasyon “Kiralamaya dönüştü” olur ve artık değiştirilemez; bilgileri kendi kaydında korunur.
          </Dialog.Description>
          <ul className="mt-3 space-y-1 rounded-lg bg-ground/70 px-3.5 py-2.5 text-[12.5px] text-ink-2">
            <li>Teslim ayrı bir adımdır: belge kararı, km, yakıt, kontrol listesi ve 4–5 fotoğraf teslim masasında alınır.</li>
            <li>Ödeme, depozito ve sözleşme oluşturulmaz. Rezervasyonun kayıtlı fiyat teklifi kiralamada görünür; plan aynı kaldıkça geçerlidir.</li>
          </ul>
          {error && (
            <p role="alert" className="mt-3 text-[13px] font-medium text-alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true)
                setError(null)
                try {
                  const rental = await rentalsApi.fromReservation(r.id, r.version, requestId)
                  qc.setQueryData(['rental', session.company?.id, rental.id], rental)
                  void qc.invalidateQueries({ queryKey: ['reservation', session.company?.id, r.id] })
                  void qc.invalidateQueries({ queryKey: ['reservations'] })
                  void qc.invalidateQueries({ queryKey: ['rentals'] })
                  toast(`${rental.rentalNo} hazırlandı; ${r.reservationNo} kiralamaya dönüştü.`)
                  onClose()
                  void navigate({ to: '/kiralamalar/$rentalId', params: { rentalId: rental.id } })
                } catch (e) {
                  setError(e instanceof ApiRequestError ? e.message : 'Dönüştürülemedi. Bağlantınızı kontrol edin; tekrar denediğinizde ikinci kiralama oluşmaz.')
                  void qc.invalidateQueries({ queryKey: ['reservation', session.company?.id, r.id] })
                } finally {
                  setPending(false)
                }
              }}
              className={btnPrimary}
            >
              {pending && <SpinnerGap size={16} className="animate-spin" />}
              Kiralamayı hazırla
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PersonCard({ p, role, primary }: { p: ReservationPerson; role: string; primary?: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
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
        {p.documents === null ? (
          <span className="text-ink-3">Belge durumu için yetki gerekli</span>
        ) : p.documents.total === 0 ? (
          <span className="text-hold">Belge kaydı yok</span>
        ) : p.documents.expired ? (
          <span className="font-medium text-alert">{p.documents.expired} belgenin süresi dolmuş</span>
        ) : p.documents.expiring ? (
          <span className="font-medium text-hold">{p.documents.expiring} belgenin süresi yaklaşıyor</span>
        ) : (
          <span className="text-ink-2">{p.documents.total} güncel belge kaydı</span>
        )}
        <Link to="/musteriler/$customerId" params={{ customerId: p.id }} search={{ sekme: 'belgeler' }} className="mt-0.5 block font-medium text-blue hover:underline">
          Belgeler
        </Link>
      </div>
    </li>
  )
}

const ACTION_TITLES: Record<string, string> = {
  'reservation.create': 'Rezervasyon oluşturuldu',
  'reservation.update': 'Rezervasyon değiştirildi',
  'reservation.confirm': 'Rezervasyon onaylandı',
  'reservation.cancel': 'Rezervasyon iptal edildi',
  'reservation.no_show': 'Gelmedi olarak işaretlendi',
}
const FIELD_LABELS: Record<string, string> = {
  pickupAt: 'Alış',
  returnAt: 'İade',
  pickupBranch: 'Alış şubesi',
  returnBranch: 'İade şubesi',
  vehicleClass: 'Araç sınıfı',
  vehicle: 'Araç',
  customer: 'Müşteri',
  corporateAccount: 'Kurumsal hesap',
  booker: 'Rezervasyonu yapan',
  source: 'Kaynak',
  drivers: 'Sürücüler',
}
const fmtValue = (field: string, v: unknown) => {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'pickupAt' || field === 'returnAt') return formatDateTime(String(v))
  if (field === 'source') return RESERVATION_SOURCE_LABELS[v as 'phone'] ?? String(v)
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return String(v)
}

function ActivityEntry({ e }: { e: ReservationActivityItem }) {
  const s = (e.summary ?? {}) as Record<string, unknown>
  const changes = (s.changes as Record<string, [unknown, unknown]> | undefined) ?? {}
  return (
    <li className="grid grid-cols-[20px_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 size-2.5 rounded-full border-2', e.action === 'reservation.create' ? 'border-blue bg-blue' : 'border-ink-3 bg-surface')} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{ACTION_TITLES[e.action] ?? e.action}</span>
          <span className="tnum text-[12.5px] text-ink-2">
            {formatDateTime(e.at)}
            {e.actorName && ` · ${e.actorName}`}
          </span>
        </div>
        {Object.entries(changes).map(([f, [a, b]]) => (
          <p key={f} className="text-[13px] text-ink-2">
            {FIELD_LABELS[f] ?? f}: {fmtValue(f, a)} → <span className="font-medium text-ink">{fmtValue(f, b)}</span>
          </p>
        ))}
        {s.noteChanged === true && <p className="text-[13px] text-ink-2">Not değiştirildi (içerik geçmişe kopyalanmaz).</p>}
        {typeof s.changeReason === 'string' && <p className="text-[13px] text-ink-2">Gerekçe: {CHANGE_REASON_LABELS[s.changeReason as 'other'] ?? s.changeReason}</p>}
        {typeof s.reason === 'string' && (
          <p className="text-[13px] text-ink-2">Neden: {CANCEL_REASON_LABELS[s.reason as ReservationCancelReason] ?? NO_SHOW_REASON_LABELS[s.reason as ReservationNoShowReason] ?? s.reason}</p>
        )}
        {e.action === 'reservation.create' && typeof s.vehicleClass === 'string' && (
          <p className="text-[13px] text-ink-2">
            {s.status === 'confirmed' ? 'Onaylı' : 'Bekleyen'} · {s.vehicleClass}
            {s.vehicle ? ` · ${s.vehicle}` : ''} · {RESERVATION_SOURCE_LABELS[s.source as 'phone'] ?? ''}
          </p>
        )}
      </div>
    </li>
  )
}

function Tabs({ tab, onTab }: { tab: ReservationTab; onTab: (t: ReservationTab) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = list.current
    const el = bar?.querySelector<HTMLElement>(`#rtab-${tab}`)
    if (bar && el) bar.scrollTo({ left: Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' })
  }, [tab])
  return (
    <div className="border-b border-line">
      <div ref={list} role="tablist" aria-label="Rezervasyon bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {RESERVATION_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`rtab-${t}`}
            aria-selected={t === tab}
            aria-controls="reservation-tabpanel"
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

/** Rezervasyon 360°: the reservation's operational file, with its price quote (Pricing V1). No payment, deposit or contract. */
export function Reservation360Page() {
  const session = useSession()
  const navigate = useNavigate()
  const zone = session.company?.timezone
  const { reservationId } = useParams({ from: '/app/rezervasyonlar/$reservationId' })
  const { sekme } = useSearch({ from: '/app/rezervasyonlar/$reservationId' })
  const tab: ReservationTab = sekme ?? 'genel'
  const q = useQuery({ queryKey: ['reservation', session.company?.id, reservationId], queryFn: () => reservationsApi.get(reservationId), retry: false })
  const history = useQuery({ queryKey: ['reservation-history', session.company?.id, reservationId], queryFn: () => reservationsApi.history(reservationId), enabled: tab === 'gecmis' })
  const updated = useUpdated(reservationId)
  const [dialog, setDialog] = useState<'cancel' | 'noShow' | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const converted = q.data?.status === 'converted'
  const rentalLink = useQuery({
    queryKey: ['reservation-rental', session.company?.id, reservationId],
    queryFn: () => rentalsApi.search({ view: 'all', q: q.data!.reservationNo, pageSize: 25 }),
    enabled: converted && can(session, 'rentals.read'),
  })
  const rental = rentalLink.data?.items.find((x) => x.reservation?.id === reservationId)
  const onTab = (t: ReservationTab) => void navigate({ to: '/rezervasyonlar/$reservationId', params: { reservationId }, search: t === 'genel' ? {} : { sekme: t }, replace: true, resetScroll: false })
  const confirm = useMutation({
    mutationFn: () => reservationsApi.confirm(reservationId, q.data!.version),
    onSuccess: (r) => {
      updated(r)
      setActionError(null)
      toast(`${r.reservationNo} onaylandı.`)
    },
    onError: (e) => {
      updated()
      setActionError(e instanceof ApiRequestError ? e.message : 'Onaylanamadı.')
    },
  })

  const back = (
    <Link to="/rezervasyonlar" search={listSearchToReturnTo()} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Rezervasyonlar
    </Link>
  )
  if (q.isError) {
    const e = q.error
    return (
      <div className="space-y-4">
        {back}
        {e instanceof ApiRequestError && e.status === 404 ? (
          <StatePanel icon={CalendarCheck} title="Rezervasyon bulunamadı">
            <p>Bu adresteki rezervasyon yok ya da yetki alanınızda değil.</p>
          </StatePanel>
        ) : (
          <ErrorState message={e.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (!q.data)
    return (
      <div aria-busy="true" aria-label="Rezervasyon yükleniyor" className="space-y-4">
        {back}
        <div className="h-[180px] animate-pulse rounded-xl bg-line-soft/70" />
      </div>
    )

  const r = q.data
  const active = r.status === 'pending' || r.status === 'confirmed'
  const canManage = can(session, 'reservations.manage')
  const canConfirm = can(session, 'reservations.confirm')
  const pickupPassed = Date.parse(r.pickup.at) <= Date.now()
  return (
    <div className="space-y-5">
      {back}
      <section aria-label="Rezervasyon özeti" className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4 p-5 sm:p-6">
          <span aria-hidden className={cn('grid size-14 shrink-0 place-items-center rounded-xl', active ? 'bg-blue-soft text-blue-ink' : 'bg-ground text-ink-3')}>
            <CalendarCheck size={26} />
          </span>
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[12.5px] font-semibold tracking-[0.03em] text-ink-2">{r.reservationNo}</span>
              <StatusBadge status={r.status} className="text-[13.5px]" />
              <span className="text-[13px] text-ink-2">{RESERVATION_SOURCE_LABELS[r.source]}</span>
            </div>
            <h1 className="mt-1.5 text-[26px] leading-tight font-semibold tracking-[-0.025em] break-words sm:text-[30px]">{r.customer.displayName}</h1>
            <p className="tnum mt-1 text-ink-2">
              {formatMoment(r.pickup, zone)} <ArrowRight size={13} className="inline" /> {formatMoment(r.return, zone)} · {formatDuration(r.durationMinutes)}
            </p>
          </div>
          {r.status === 'converted' && rental && (
            <Link to="/kiralamalar/$rentalId" params={{ rentalId: rental.id }} className={btnPrimary}>
              <Key size={16} /> Kiralamaya git · {rental.rentalNo}
            </Link>
          )}
          {active && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {r.status === 'confirmed' && can(session, 'rentals.manage') && (
                <button type="button" onClick={() => setConvertOpen(true)} className={btnPrimary}>
                  <Key size={16} />
                  Kiralamaya dönüştür
                </button>
              )}
              {r.status === 'pending' && canConfirm && (
                <button type="button" onClick={() => confirm.mutate()} disabled={confirm.isPending || !r.vehicle} title={!r.vehicle ? 'Önce belirli bir araç atayın' : undefined} className={btnPrimary}>
                  {confirm.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Onayla
                </button>
              )}
              {canManage && (
                <Link to="/rezervasyonlar/$reservationId/duzenle" params={{ reservationId: r.id }} className={(r.status === 'pending' && canConfirm) || (r.status === 'confirmed' && can(session, 'rentals.manage')) ? btnSecondary : btnPrimary}>
                  <PencilSimple size={16} />
                  Düzenle
                </Link>
              )}
              {canManage && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger aria-label="Diğer işlemler" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-line-soft hover:text-ink">
                    <DotsThree size={20} weight="bold" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-[250px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
                      <DropdownMenu.Item onSelect={() => setDialog('cancel')} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                        <XCircle size={16} /> Rezervasyonu iptal et
                      </DropdownMenu.Item>
                      {r.status === 'confirmed' && (
                        <DropdownMenu.Item disabled={!pickupPassed} onSelect={() => setDialog('noShow')} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[disabled]:cursor-default data-[disabled]:text-ink-3 data-[highlighted]:bg-ground">
                          <WarningCircle size={16} /> Gelmedi olarak işaretle
                          {!pickupPassed && <span className="ml-auto text-[11px]">alıştan sonra</span>}
                        </DropdownMenu.Item>
                      )}
                      <DropdownMenu.Separator className="my-1 h-px bg-line" />
                      <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">İlgili modüllerle açılacak</DropdownMenu.Label>
                      {['Kaparo al'].map((x) => (
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
        <div className="grid grid-cols-1 gap-x-6 border-t border-line-soft px-5 py-3 text-[13.5px] sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Araç</span>
            <span className="font-medium text-ink">{r.vehicle ? `${r.vehicle.plate} · ${r.vehicle.make} ${r.vehicle.model}` : <span className="text-hold">Araç atanmadı · {r.vehicleClass.name}</span>}</span>
          </div>
          <div className="py-1.5">
            <span className="block text-[12px] text-ink-2">Şubeler</span>
            <span className="font-medium text-ink">
              {r.pickupBranch.name}
              {r.returnBranch.id !== r.pickupBranch.id && ` → ${r.returnBranch.name}`}
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
            <span className="block text-[12px] text-ink-2">Fiyat</span>
            <QuoteSummary kind="reservation" targetId={r.id} />
          </div>
        </div>
        {r.status === 'cancelled' && (
          <p className="border-t border-line-soft bg-ground/60 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
            {r.cancelledAt && formatDateTime(r.cancelledAt)} · {r.cancelledByName ?? 'Kullanıcı bilgisi yok'} tarafından iptal edildi · Neden: <span className="font-medium text-ink">{r.cancelReason ? CANCEL_REASON_LABELS[r.cancelReason] : '—'}</span>
            {r.cancelNote && ` · ${r.cancelNote}`}
          </p>
        )}
        {r.status === 'no_show' && (
          <p className="border-t border-line-soft bg-alert-soft/50 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
            {r.noShowAt && formatDateTime(r.noShowAt)} · {r.noShowByName ?? 'Kullanıcı bilgisi yok'} tarafından Gelmedi olarak işaretlendi · Neden: <span className="font-medium text-ink">{r.noShowReason ? NO_SHOW_REASON_LABELS[r.noShowReason] : '—'}</span>
            {r.noShowNote && ` · ${r.noShowNote}`}. Otomatik ücret eklenmez.
          </p>
        )}
      </section>

      {actionError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {actionError}
        </p>
      )}
      {r.warnings.length > 0 && (
        <ul aria-label="Uyarılar" className="space-y-1.5 rounded-xl border border-hold/30 bg-hold-soft/60 px-4 py-3">
          {r.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="flex items-start gap-2 text-[13px] text-ink">
              <WarningCircle size={15} className="mt-[2px] shrink-0 text-hold" />
              <span>
                {WARNING_LABELS[w.code]}
                {w.subject && <span className="tnum text-ink-2"> ({w.subject})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Tabs tab={tab} onTab={onTab} />
        <div key={tab} id="reservation-tabpanel" role="tabpanel" aria-labelledby={`rtab-${tab}`} className="animate-fade pt-5">
          {tab === 'genel' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                <Panel title="Kiralama planı">
                  <Facts
                    rows={[
                      ['Alış', <span className="tnum">{formatMoment(r.pickup, zone)} · {r.pickupBranch.name}</span>],
                      ['İade', <span className="tnum">{formatMoment(r.return, zone)} · {r.returnBranch.name}</span>],
                      ['Süre', formatDuration(r.durationMinutes)],
                      ['Saat dilimi', r.pickup.timeZone === r.return.timeZone ? r.pickup.timeZone : `${r.pickup.timeZone} → ${r.return.timeZone}`],
                      ['Araç sınıfı', r.vehicleClass.name],
                      ['Araç', r.vehicle ? `${r.vehicle.plate} · ${r.vehicle.make} ${r.vehicle.model}` : 'Atanmadı'],
                    ]}
                  />
                </Panel>
                <Panel title="Not">{r.note ? <p className="whitespace-pre-line text-ink">{r.note}</p> : <p className="text-ink-2">Not yok.</p>}</Panel>
                <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                  <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
                  {r.status === 'converted' ? 'Bu rezervasyon kiralamaya dönüştü; teslim, iade ve kapanış kiralama kaydında izlenir. ' : r.status === 'confirmed' ? 'Onay, araç ve zaman ayırmasıdır. ' : ''}Fiyat teklifi “Fiyat teklifi” sekmesindedir; teklif ödeme değildir. Ödeme alınmadı ve sözleşme oluşturulmadı.
                </p>
              </div>
              <div className="min-w-0 space-y-5">
                <Panel title="Belge durumu">
                  <p className="text-[13.5px] text-ink">Rezervasyon oluşturulabilir. Eksik belgeler kiralama başlamadan önce tamamlanmalıdır.</p>
                  <p className="mt-2 text-[12.5px] text-ink-2">Kişilerin belge özeti Kişiler sekmesinde. Belge kararı kiralamanın teslim masasında her sürücü için ayrı verilir.</p>
                </Panel>
                <Panel title="Kayıt bilgisi">
                  <Facts
                    rows={[
                      ['Oluşturan', r.createdByName ?? 'Kullanıcı bilgisi yok'],
                      ['Oluşturulma', formatDateTime(r.createdAt)],
                      ['Onaylayan', r.confirmedByName ? `${r.confirmedByName} · ${formatDateTime(r.confirmedAt!)}` : null],
                      ['Son değişiklik', formatDateTime(r.updatedAt)],
                      ['Sürüm', String(r.version)],
                    ]}
                  />
                </Panel>
              </div>
            </div>
          )}
          {tab === 'kisiler' && (
            <Panel title="Müşteri, kurumsal hesap ve sürücüler">
              <ul className="divide-y divide-line-soft">
                <PersonCard p={r.customer} role="Müşteri" />
                {r.booker && <PersonCard p={r.booker} role="Rezervasyonu yapan" />}
                {r.drivers.map((d) => (
                  <PersonCard key={d.id} p={d} role="Sürücü" primary={d.isPrimary} />
                ))}
              </ul>
              {!r.drivers.length && <p className="mt-2 text-[13px] text-hold">Sürücü eklenmemiş.</p>}
              <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
                <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
                Belge numaraları ve görüntüleri burada gösterilmez; Müşteri 360° Belgeler sekmesinde yetkinize göre açılır.
              </p>
            </Panel>
          )}
          {tab === 'arac' && (
            <Panel title="Araç">
              {r.vehicle ? (
                <Facts
                  rows={[
                    ['Plaka', <Link to="/araclar/$vehicleId" params={{ vehicleId: r.vehicle.id }} className="tnum text-blue-ink hover:underline">{r.vehicle.plate}</Link>],
                    ['Marka / model', `${r.vehicle.make} ${r.vehicle.model}`],
                    ['Sınıf', r.vehicleClass.name],
                    ['Durum', r.vehicle.status === 'active' ? 'Etkin' : 'Hizmet dışı'],
                    ['Ana şube', r.vehicle.homeBranch.name],
                  ]}
                />
              ) : (
                <p className="flex items-start gap-2 text-ink-2">
                  <Car size={17} className="mt-0.5 shrink-0 text-ink-3" />
                  Yalnız araç sınıfı seçili ({r.vehicleClass.name}). Onay için Düzenle'den belirli bir araç atayın.
                </p>
              )}
              <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
                <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
                Rezervasyonlar arasında hazırlık süresi bırakılmaz: bir rezervasyonun bittiği anda başlayan rezervasyon kabul edilir. Bu, aracın temizlenmiş, kontrol edilmiş veya teslime hazır olduğu anlamına gelmez; temizlik, hasar ve teslim kontrolleri kiralamanın teslim masasında yapılır ve önceki iade kontrolü bitmemiş araç teslim edilemez.
              </p>
            </Panel>
          )}
          {tab === 'durum' && (
            <Panel title="Durum geçmişi">
              <ol className="divide-y divide-line-soft">
                {r.statusEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                    <span>
                      {e.fromStatus ? `${RESERVATION_STATUS_LABELS[e.fromStatus]} → ` : ''}
                      <span className="font-medium text-ink">{RESERVATION_STATUS_LABELS[e.toStatus]}</span>
                      {e.reason && <span className="text-ink-2"> · {CANCEL_REASON_LABELS[e.reason as ReservationCancelReason] ?? NO_SHOW_REASON_LABELS[e.reason as ReservationNoShowReason] ?? e.reason}</span>}
                      {e.note && <span className="text-ink-2"> · {e.note}</span>}
                    </span>
                    <span className="tnum text-[12.5px] text-ink-2">
                      {formatDateTime(e.at)}
                      {e.actorName && ` · ${e.actorName}`}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {tab === 'gecmis' && (
            <Panel title="İşlem geçmişi" action={<span className="text-[12.5px] text-ink-2">Eski ve yeni değerler, kim, ne zaman</span>}>
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
                Kişilerin adları, iletişim bilgileri ve notlar geçmişe kopyalanmaz; müşteri numarası, şube kodu, plaka ve saatler tutulur.
              </p>
            </Panel>
          )}
          {tab === 'fiyat' &&
            (can(session, 'pricing.read') ? (
              <QuotePanel kind="reservation" targetId={r.id} targetNo={r.reservationNo} open={r.status === 'pending' || r.status === 'confirmed'} />
            ) : (
              <StatePanel icon={Coins} title="Fiyat teklifini görme yetkiniz yok">
                <p>Fiyat teklifleri fiyat görüntüleme yetkisi olan kullanıcılara açıktır.</p>
              </StatePanel>
            ))}
        </div>
      </div>

      {convertOpen && <ConvertDialog r={r} onClose={() => setConvertOpen(false)} />}
      {dialog === 'cancel' && (
        <ReasonNoteDialog<ReservationCancelReason>
          title="Rezervasyonu iptal et"
          description={`${r.reservationNo} iptal edilir ve araç serbest kalır. Kayıt silinmez, geçmişte kalır.`}
          reasons={RESERVATION_CANCEL_REASONS}
          labels={CANCEL_REASON_LABELS}
          confirm="İptal et"
          danger
          onClose={() => setDialog(null)}
          onSubmit={async (reason, note) => {
            try {
              const next = await reservationsApi.cancel(r.id, r.version, reason, note || undefined)
              updated(next)
              toast(`${r.reservationNo} iptal edildi.`)
              setDialog(null)
            } catch (e) {
              updated()
              throw e
            }
          }}
        />
      )}
      {dialog === 'noShow' && (
        <ReasonNoteDialog<ReservationNoShowReason>
          title="Gelmedi olarak işaretle"
          description="Müşteri alış zamanını geçirdi ve aracı teslim almadı. Bu iptalle aynı değildir; otomatik ücret eklenmez."
          reasons={RESERVATION_NO_SHOW_REASONS}
          labels={NO_SHOW_REASON_LABELS}
          confirm="Gelmedi olarak işaretle"
          onClose={() => setDialog(null)}
          onSubmit={async (reason, note) => {
            try {
              const next = await reservationsApi.noShow(r.id, r.version, reason, note || undefined)
              updated(next)
              toast(`${r.reservationNo} Gelmedi olarak işaretlendi.`)
              setDialog(null)
            } catch (e) {
              updated()
              throw e
            }
          }}
        />
      )}
    </div>
  )
}
