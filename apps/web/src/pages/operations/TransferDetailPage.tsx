import { FUEL_LEVELS, type FuelLevel, type TransferDetail } from '@acarvo/shared'
import { ArrowLeft, ArrowRight, MapPin, SpinnerGap, Truck } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ErrorState, ForbiddenState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, transfersApi } from '@/lib/api'
import { TRANSFER_STATUS_HINT, TRANSFER_STATUS_LABELS, TRANSFER_STATUS_TONE } from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { FUEL_LEVEL_LABELS } from '@/lib/rental-labels'
import { formatDateTime, formatKm, LOCATION_LABELS } from '@/lib/vehicle-labels'
import { useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { BranchCode, btnGhost, btnPrimary, btnSecondary, DetailHeader, ErrorLine, errorText, EventsList, Facts, HoldList, newRequestId, Notice, Section, StepDialog } from './OpsParts'

const useTransfer = (id: string) => {
  const session = useSession()
  const key = ['transfer', session.company?.id, id]
  return { key, q: useQuery({ queryKey: key, queryFn: () => transfersApi.get(id), retry: false }) }
}

/** Km, fuel, real time and a note: the facts of a departure or an arrival (written to the vehicle history atomically). */
function useMovement(t: TransferDetail, kind: 'depart' | 'receive') {
  const session = useSession()
  const branches = useQuery({ queryKey: ['ops-branches', session.company?.id, 'transfer'], queryFn: () => transfersApi.branches() })
  const branch = branches.data?.branches.find((b) => b.id === (kind === 'depart' ? t.fromBranch.id : t.toBranch.id))
  const [requestId] = useState(newRequestId)
  const [local, setLocal] = useState('')
  const [choice, setChoice] = useState<'earlier' | 'later'>()
  const [km, setKm] = useState('')
  const [fuel, setFuel] = useState<FuelLevel | ''>('')
  const [note, setNote] = useState('')
  const [jump, setJump] = useState('')
  const [needJump, setNeedJump] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const body = () => ({
    version: t.version,
    requestId,
    km,
    fuel,
    note: note || undefined,
    largeJumpReason: jump || undefined,
    ...(kind === 'depart' ? { departedLocal: local || undefined, departedChoice: choice } : { arrivedLocal: local || undefined, arrivedChoice: choice }),
  })
  const submit = async () => {
    try {
      return { next: await transfersApi.step(t.id, kind, body()) }
    } catch (e) {
      if (e instanceof ApiRequestError) {
        setFields(e.fields ?? {})
        if (e.code === 'LARGE_JUMP_REASON_REQUIRED') setNeedJump(true)
      }
      return { error: errorText(e) }
    }
  }
  const timeKey = kind === 'depart' ? 'departedLocal' : 'arrivedLocal'
  const form = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mv-km" label={kind === 'depart' ? 'Çıkış kilometresi' : 'Varış kilometresi'} required error={fields.km} hint={kind === 'receive' && t.departureKm != null ? `Çıkışta ${formatKm(t.departureKm)}; daha düşük olamaz.` : 'Göstergedeki kilometre.'}>
          <Input inputMode="numeric" {...describe('mv-km', fields.km, true)} value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field id="mv-fuel" label="Yakıt" required error={fields.fuel}>
          <Select {...describe('mv-fuel', fields.fuel)} value={fuel} onChange={(e) => setFuel(e.target.value as FuelLevel)}>
            <option value="">Seçin</option>
            {FUEL_LEVELS.map((f) => (
              <option key={f} value={f}>
                {FUEL_LEVEL_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {needJump && (
        <Field id="mv-jump" label="Büyük artış gerekçesi" required error={fields.largeJumpReason}>
          <Input id="mv-jump" value={jump} maxLength={300} onChange={(e) => setJump(e.target.value)} />
        </Field>
      )}
      <div>
        <TimeField optional id="mv-time" label={kind === 'depart' ? 'Çıkış zamanı' : 'Varış zamanı'} value={local} onChange={setLocal} branch={branch} choice={choice} onChoice={setChoice} error={fields[timeKey]} />
        <p className="mt-1 text-[12.5px] text-ink-3">Boş bırakılırsa şu an kaydedilir; en fazla 72 saat öncesi girilebilir.</p>
      </div>
      <Field id="mv-note" label="Not (isteğe bağlı)" hint={kind === 'receive' ? 'Aracın durumu; yeni bir hasar görürseniz ayrıca hasar dosyası açın.' : undefined}>
        <Textarea id="mv-note" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </>
  )
  return { form, submit }
}

function DepartDialog({ t, onClose, onDone }: { t: TransferDetail; onClose: () => void; onDone: (n: TransferDetail) => void }) {
  const mv = useMovement(t, 'depart')
  return (
    <StepDialog
      title="Yola çıkar"
      description="Araç “yolda” olarak kaydedilir; varış şubesi teslim alana kadar orada sayılmaz. Km ve konum aracın geçmişine aynı anda yazılır."
      confirm="Yola çıkar"
      onClose={onClose}
      onSubmit={async () => {
        const r = await mv.submit()
        if (r.error) return r.error
        onDone(r.next!)
        toast(`${t.transferNo}: araç yola çıktı.`)
      }}
      summary={[['Güzergâh', `${t.fromBranch.code} → ${t.toBranch.code}`], ['Planlanan varış', formatMoment(t.plannedArrival)]]}
    >
      {mv.form}
    </StepDialog>
  )
}

function SimpleStep({ t, step, onClose, onDone }: { t: TransferDetail; step: 'approve' | 'cancel'; onClose: () => void; onDone: (n: TransferDetail) => void }) {
  const [requestId] = useState(newRequestId)
  const [reason, setReason] = useState('')
  const run = async () => {
    try {
      onDone(await transfersApi.step(t.id, step, { version: t.version, requestId, ...(step === 'cancel' ? { reason } : {}) }))
      toast(step === 'approve' ? `${t.transferNo} onaylandı.` : `${t.transferNo} iptal edildi.`)
    } catch (e) {
      return errorText(e)
    }
  }
  return step === 'approve' ? (
    <StepDialog title="Transferi onayla" description="Araç planlanan aralıkta transfer için ayrılır. Onaylı rezervasyon, kiralama, bakım veya başka transfer çakışırsa ya da aracın sonraki kaydı başka şubede başlıyorsa onay yapılmaz." confirm="Onayla" onClose={onClose} onSubmit={run} summary={[['Güzergâh', `${t.fromBranch.name} → ${t.toBranch.name}`], ['Plan', `${formatMoment(t.plannedDeparture)} → ${formatMoment(t.plannedArrival)}`]]} />
  ) : (
    <StepDialog title="Transferi iptal et" description="Yola çıkmamış transfer iptal edilir; kayıt silinmez." confirm="İptal et" danger onClose={onClose} onSubmit={run}>
      <Field id="tc-reason" label="Gerekçe" required>
        <Textarea id="tc-reason" rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </StepDialog>
  )
}

function NotFound({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div>
      {error instanceof ApiRequestError && error.status === 404 ? (
        <StatePanel icon={Truck} title="Transfer bulunamadı">
          <p>Bu adresteki transfer yok ya da çıkış veya varış şubesi yetkili olduğunuz şubeler arasında değil.</p>
        </StatePanel>
      ) : (
        <ErrorState message={error.message} onRetry={retry} />
      )}
    </div>
  )
}

export function TransferDetailPage() {
  const qc = useQueryClient()
  const { transferId } = useParams({ from: '/app/araclar/transferler/$transferId' })
  const { key, q } = useTransfer(transferId)
  const [step, setStep] = useState<'approve' | 'cancel' | 'depart' | null>(null)
  if (q.isError) return <NotFound error={q.error} retry={() => q.refetch()} />
  if (!q.data) return <div aria-busy="true" aria-label="Transfer yükleniyor" className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
  const t = q.data
  const done = (next: TransferDetail) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['transfers'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
    setStep(null)
  }
  const actions: ReactNode[] = []
  if (t.can.approve) actions.push(<button key="a" type="button" className={btnPrimary} onClick={() => setStep('approve')}>Onayla</button>)
  if (t.can.depart) actions.push(<button key="d" type="button" className={btnPrimary} onClick={() => setStep('depart')}>Yola çıkar</button>)
  if (t.can.receive)
    actions.push(
      <Link key="r" to="/araclar/transferler/$transferId/teslim-al" params={{ transferId: t.id }} className={btnPrimary}>
        Teslim al
      </Link>,
    )
  if (t.can.cancel) actions.push(<button key="c" type="button" className={btnSecondary} onClick={() => setStep('cancel')}>İptal et</button>)
  const loc = t.currentLocation
  return (
    <>
      <DetailHeader
        back="/araclar/transferler"
        backLabel="Araç Transferleri"
        number={t.transferNo}
        title={`${t.fromBranch.name} → ${t.toBranch.name}`}
        status={{ label: t.late ? 'Yolda · gecikti' : TRANSFER_STATUS_LABELS[t.status], tone: t.late ? 'alert' : TRANSFER_STATUS_TONE[t.status] }}
        hint={TRANSFER_STATUS_HINT[t.status]}
        plate={t.vehicle.plate}
        vehicleId={t.vehicle.id}
        vehicleText={`${t.vehicle.make} ${t.vehicle.model} · ${t.vehicle.className}`}
        actions={actions}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {t.late && <Notice tone="alert">Planlanan varış ({formatMoment(t.plannedArrival)}) geçti ve araç teslim alınmadı. Gecikmiş transfer aracı müsait yapmaz; araç teslim alınana kadar ayrılı kalır.</Notice>}
          {t.status === 'in_transit' && !t.can.receive && <Notice tone="blue">Teslim alma yalnız varış şubesinin ({t.toBranch.code}) yetkili personeli tarafından yapılır.</Notice>}
          {(t.conflicts.length > 0 || t.nextCommitmentConflict) && (
            <Notice>
              {t.conflicts.length > 0 && (
                <>
                  <p className="font-medium">Planlanan aralıkta araçla çakışan kayıtlar:</p>
                  <div className="mt-1.5 rounded-md bg-surface/70 px-3">
                    <HoldList holds={t.conflicts} />
                  </div>
                </>
              )}
              {t.nextCommitmentConflict && (
                <p className={t.conflicts.length ? 'mt-2' : ''}>
                  Aracın varıştan sonraki ilk kaydı (<span className="tnum font-medium">{t.nextCommitmentConflict}</span>) başka bir şubeden başlıyor.
                </p>
              )}
              <p className="mt-2">Bu durumda transfer onaylanamaz veya yola çıkarılamaz. Rezervasyonlar otomatik iptal edilmez.</p>
            </Notice>
          )}
          <Section title="Plan">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[13.5px]">
              <BranchCode code={t.fromBranch.code} />
              <ArrowRight size={13} aria-label="→" />
              <BranchCode code={t.toBranch.code} />
              <span className="text-ink-2">· {t.reason}</span>
            </div>
            <Facts
              rows={[
                ['Planlanan çıkış', `${formatMoment(t.plannedDeparture)} (${t.fromBranch.code})`],
                ['Planlanan varış', `${formatMoment(t.plannedArrival)} (${t.toBranch.code})`],
                ['Görevli / sürücü notu', t.driverNote],
                ['Talep eden', `${t.requestedByName ?? '—'} · ${formatDateTime(t.createdAt)}`],
                ['Onay', t.approvedAt ? `${formatDateTime(t.approvedAt)}${t.approvedByName ? ` · ${t.approvedByName}` : ''}` : null],
              ]}
            />
            {t.cancelReason && <p className="mt-3 text-[13px] text-ink-2">İptal gerekçesi: {t.cancelReason}</p>}
          </Section>
          <Section title="Çıkış ve varış">
            <Facts
              rows={[
                ['Çıkış', t.departedAt ? `${formatDateTime(t.departedAt)}${t.departedByName ? ` · ${t.departedByName}` : ''}` : null],
                ['Çıkış km / yakıt', t.departureKm != null ? `${formatKm(t.departureKm)} · ${FUEL_LEVEL_LABELS[t.departureFuel!]}` : null],
                ['Varış', t.arrivedAt ? `${formatDateTime(t.arrivedAt)}${t.receivedByName ? ` · ${t.receivedByName}` : ''}` : null],
                ['Varış km / yakıt', t.arrivalKm != null ? `${formatKm(t.arrivalKm)} · ${FUEL_LEVEL_LABELS[t.arrivalFuel!]}` : null],
                ['Yolda kat edilen', t.arrivalKm != null && t.departureKm != null ? formatKm(t.arrivalKm - t.departureKm) : null],
              ]}
            />
            {(t.departureNote || t.arrivalNote) && (
              <div className="mt-3 space-y-1 text-[13px] text-ink-2">
                {t.departureNote && <p>Çıkış notu: {t.departureNote}</p>}
                {t.arrivalNote && <p>Varış notu: {t.arrivalNote}</p>}
              </div>
            )}
          </Section>
        </div>
        <div className="min-w-0 space-y-5">
          <Section title="Aracın kayıtlı konumu">
            {loc ? (
              <p className="flex items-start gap-2 text-[13.5px]">
                <MapPin size={16} className="mt-0.5 shrink-0 text-ink-3" />
                <span>
                  <span className="font-medium text-ink">
                    {LOCATION_LABELS[loc.type as keyof typeof LOCATION_LABELS] ?? loc.type}
                    {loc.branchCode ? ` · ${loc.branchCode}` : ''}
                  </span>
                  <span className="tnum block text-[12.5px] text-ink-2">{formatDateTime(loc.at)}</span>
                </span>
              </p>
            ) : (
              <p className="text-[13px] text-ink-2">Konum kaydı yok.</p>
            )}
            <p className="mt-3 text-[12.5px] text-ink-2">Canlı konum değildir; aracın konum geçmişindeki son kayıttır. Ana şube transferle değişmez.</p>
          </Section>
          <Section title="Geçmiş">
            <EventsList events={t.events} />
          </Section>
        </div>
      </div>
      {step === 'depart' && <DepartDialog t={t} onClose={() => setStep(null)} onDone={done} />}
      {(step === 'approve' || step === 'cancel') && <SimpleStep t={t} step={step} onClose={() => setStep(null)} onDone={done} />}
    </>
  )
}

/** Varışta teslim alma: a focused page for the destination branch (phone friendly). */
export function TransferReceivePage() {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { transferId } = useParams({ from: '/app/araclar/transferler/$transferId/teslim-al' })
  const { key, q } = useTransfer(transferId)
  if (q.isError) return <NotFound error={q.error} retry={() => q.refetch()} />
  if (!q.data) return <div aria-busy="true" aria-label="Transfer yükleniyor" className="mx-auto h-64 max-w-[720px] animate-pulse rounded-xl bg-line-soft/60" />
  return <ReceiveForm t={q.data} onDone={(next) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['transfers'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
    toast(`${next.transferNo}: araç ${next.toBranch.code} şubesinde teslim alındı.`)
    void navigate({ to: '/araclar/transferler/$transferId', params: { transferId: next.id } })
  }} country={session.company?.country} />
}

function ReceiveForm({ t, onDone, country }: { t: TransferDetail; onDone: (n: TransferDetail) => void; country?: string }) {
  const mv = useMovement(t, 'receive')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (!t.can.receive) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4">
        <ForbiddenState message={t.status === 'in_transit' ? `Teslim alma yalnız varış şubesinin (${t.toBranch.code}) yetkili personeli tarafından yapılır.` : `Bu transfer teslim alınacak durumda değil (${TRANSFER_STATUS_LABELS[t.status]}).`} />
        <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} className={btnSecondary}>
          Transfere dön
        </Link>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-[720px] space-y-5">
      <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
        <ArrowLeft size={14} />
        {t.transferNo}
      </Link>
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Varışta teslim al</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
          <Plate plate={t.vehicle.plate} country={country} />
          <span>
            {t.vehicle.make} {t.vehicle.model}
          </span>
          <span className="flex items-center gap-1.5">
            · <BranchCode code={t.fromBranch.code} /> <ArrowRight size={12} aria-label="→" /> <BranchCode code={t.toBranch.code} />
          </span>
        </div>
      </div>
      <Notice tone="blue">Teslim alınca araç {t.toBranch.name} şubesinde kayıtlı olur; km ve konum geçmişe aynı anda yazılır. Aracın ana şubesi değişmez.</Notice>
      <form
        className="space-y-4 rounded-xl border border-line bg-surface p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          setError(null)
          const r = await mv.submit()
          setPending(false)
          if (r.error) setError(r.error)
          else onDone(r.next!)
        }}
      >
        <Facts rows={[['Çıkış', t.departedAt ? formatDateTime(t.departedAt) : null], ['Çıkış km / yakıt', t.departureKm != null ? `${formatKm(t.departureKm)} · ${FUEL_LEVEL_LABELS[t.departureFuel!]}` : null], ['Planlanan varış', formatMoment(t.plannedArrival)]]} />
        {mv.form}
        <ErrorLine error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} className={btnGhost}>
            Vazgeç
          </Link>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Teslim al
          </button>
        </div>
      </form>
    </div>
  )
}
