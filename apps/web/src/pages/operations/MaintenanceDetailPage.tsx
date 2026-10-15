import type { MaintenanceDetail } from '@acarvo/shared'
import { CarProfile, CheckCircle, Info, Wrench } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, maintenanceApi } from '@/lib/api'
import { MAINTENANCE_STATUS_HINT, MAINTENANCE_STATUS_LABELS, MAINTENANCE_STATUS_TONE, MAINTENANCE_TYPE_LABELS } from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { formatDateTime, formatKm } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { btnPrimary, btnSecondary, DetailHeader, errorText, EventsList, Facts, HoldList, newRequestId, Notice, PhotoGrid, Section, StepDialog } from './OpsParts'

type Step = 'approve' | 'start' | 'work-done' | 'return-to-work' | 'complete' | 'cancel' | 'end'

function StepForm({ m, step, onClose, onDone }: { m: MaintenanceDetail; step: Step; onClose: () => void; onDone: (next: MaintenanceDetail) => void }) {
  const session = useSession()
  const branches = useQuery({ queryKey: ['ops-branches', session.company?.id], queryFn: () => maintenanceApi.branches() })
  const branch = branches.data?.branches.find((b) => b.id === m.branch.id)
  const [requestId] = useState(newRequestId)
  const [local, setLocal] = useState('')
  const [choice, setChoice] = useState<'earlier' | 'later'>()
  const [endLocal, setEndLocal] = useState(m.plannedEnd.at > new Date().toISOString() ? m.plannedEnd.local : '')
  const [endChoice, setEndChoice] = useState<'earlier' | 'later'>()
  const [km, setKm] = useState('')
  const [jump, setJump] = useState('')
  const [needJump, setNeedJump] = useState(false)
  const [atProvider, setAtProvider] = useState(!!m.providerName)
  const [provider, setProvider] = useState(m.providerName ?? '')
  const [text, setText] = useState(step === 'work-done' ? (m.workDone ?? '') : '')
  const [parts, setParts] = useState(m.parts ?? '')
  const [returnBranchId, setReturnBranchId] = useState(m.branch.id)
  const [fields, setFields] = useState<Record<string, string>>({})
  const base = { version: m.version, requestId }
  const run = async (fn: () => Promise<MaintenanceDetail>, message: string) => {
    try {
      const next = await fn()
      onDone(next)
      toast(message)
    } catch (e) {
      if (e instanceof ApiRequestError) {
        setFields(e.fields ?? {})
        if (e.code === 'LARGE_JUMP_REASON_REQUIRED') setNeedJump(true)
      }
      return errorText(e)
    }
  }
  const timeField = (label: string, id: string) => (
    <TimeField optional id={id} label={label} value={local} onChange={setLocal} branch={branch} choice={choice} onChoice={setChoice} error={Object.entries(fields).find(([k]) => k.endsWith('Local') && k !== 'expectedEndLocal')?.[1]} />
  )
  const kmField = (label: string, required: boolean) => (
    <>
      <Field id="op-km" label={label} required={required} error={fields.km} hint="Aracın göstergesindeki kilometre; araç km geçmişine yazılır.">
        <Input inputMode="numeric" {...describe('op-km', fields.km, true)} value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {needJump && (
        <Field id="op-jump" label="Büyük artış gerekçesi" required error={fields.largeJumpReason}>
          <Input id="op-jump" value={jump} maxLength={300} onChange={(e) => setJump(e.target.value)} />
        </Field>
      )}
    </>
  )
  const nowHint = <p className="text-[12.5px] text-ink-3">Boş bırakılırsa şu an kaydedilir; en fazla 72 saat öncesi girilebilir.</p>

  if (step === 'approve')
    return (
      <StepDialog title="Bakım planını onayla" description="Onaylanan plan aracı planlanan aralıkta ayırır. Çakışan kayıt varsa onay yapılmaz." confirm="Onayla" onClose={onClose} onSubmit={() => run(() => maintenanceApi.step(m.id, 'approve', base), `${m.maintenanceNo} onaylandı.`)} summary={[['Plan', `${formatMoment(m.plannedStart)} → ${formatMoment(m.plannedEnd)}`]]} />
    )
  if (step === 'cancel' || step === 'return-to-work')
    return (
      <StepDialog
        title={step === 'cancel' ? 'Bakımı iptal et' : 'İşe geri gönder'}
        description={step === 'cancel' ? 'Plan iptal edilir ve araç serbest kalır. Kayıt silinmez.' : 'Kontrol sonucu iş yeniden başlar; araç bakımda kalır.'}
        confirm={step === 'cancel' ? 'İptal et' : 'İşe geri gönder'}
        danger={step === 'cancel'}
        onClose={onClose}
        onSubmit={() => run(() => maintenanceApi.step(m.id, step, { ...base, reason: text }), step === 'cancel' ? `${m.maintenanceNo} iptal edildi.` : `${m.maintenanceNo} işe geri gönderildi.`)}
      >
        <Field id="op-reason" label="Gerekçe" required error={fields.reason}>
          <Textarea id="op-reason" rows={3} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </Field>
      </StepDialog>
    )
  if (step === 'end')
    return (
      <StepDialog
        title="Beklenen bitişi değiştir"
        description="Yeni bitiş aracın diğer kayıtlarıyla yeniden denetlenir; çakışma varsa uygulanmaz."
        confirm="Kaydet"
        onClose={onClose}
        onSubmit={() => run(() => maintenanceApi.update(m.id, { ...base, plannedEndLocal: endLocal, plannedEndChoice: endChoice }), 'Beklenen bitiş güncellendi.')}
      >
        <TimeField id="op-end" label="Beklenen bitiş" value={endLocal} onChange={setEndLocal} branch={branch} choice={endChoice} onChoice={setEndChoice} error={fields.plannedEndLocal} />
      </StepDialog>
    )
  if (step === 'start')
    return (
      <StepDialog
        title="Servise al"
        description="Araç şu andan beklenen bitişe kadar bakımda sayılır ve kiralanamaz. Aktif kiralama, onaylı rezervasyon veya transfer çakışırsa servise alma yapılmaz; rezervasyonlar otomatik iptal edilmez."
        confirm="Servise al"
        onClose={onClose}
        onSubmit={() =>
          run(
            () =>
              maintenanceApi.step(m.id, 'start', {
                ...base,
                startedLocal: local || undefined,
                startedChoice: choice,
                expectedEndLocal: endLocal || undefined,
                expectedEndChoice: endChoice,
                atProvider,
                providerName: provider || undefined,
                km: km || undefined,
                largeJumpReason: jump || undefined,
              }),
            `${m.maintenanceNo}: araç servise alındı.`,
          )
        }
      >
        {timeField('Servise alındığı zaman', 'op-started')}
        {nowHint}
        <TimeField id="op-expected" label="Beklenen bitiş" value={endLocal} onChange={setEndLocal} branch={branch} choice={endChoice} onChoice={setEndChoice} error={fields.expectedEndLocal} />
        {kmField('Başlangıç kilometresi (isteğe bağlı)', false)}
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input type="checkbox" checked={atProvider} onChange={(e) => setAtProvider(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
          <span>Araç dış servise gidiyor (konumu servis sağlayıcı olarak kaydedilir)</span>
        </label>
        {atProvider && (
          <Field id="op-provider" label="Servis sağlayıcı" required error={fields.providerName}>
            <Input id="op-provider" value={provider} maxLength={120} onChange={(e) => setProvider(e.target.value)} />
          </Field>
        )}
      </StepDialog>
    )
  if (step === 'work-done')
    return (
      <StepDialog title="İş bitti" description="Yapılan iş kaydedilir ve bakım kontrole geçer. Araç kontrol tamamlanana kadar kiralanamaz." confirm="Kontrole gönder" onClose={onClose} onSubmit={() => run(() => maintenanceApi.step(m.id, 'work-done', { ...base, doneLocal: local || undefined, doneChoice: choice, workDone: text, parts: parts || undefined }), `${m.maintenanceNo} kontrol bekliyor.`)}>
        <Field id="op-work" label="Yapılan işler" required error={fields.workDone}>
          <Textarea id="op-work" rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field id="op-parts" label="Değişen parçalar (isteğe bağlı)">
          <Textarea id="op-parts" rows={2} value={parts} maxLength={2000} onChange={(e) => setParts(e.target.value)} />
        </Field>
        {timeField('İşin bittiği zaman', 'op-done')}
        {nowHint}
      </StepDialog>
    )
  return (
    <StepDialog
      title="Bakımı tamamla"
      description="Tamamlanan bakım değiştirilemez. Bakımın bitmesi aracın teslime hazır olduğu anlamına gelmez; teslim kontrolü ayrıca yapılır."
      confirm="Tamamla"
      onClose={onClose}
      onSubmit={() => run(() => maintenanceApi.step(m.id, 'complete', { ...base, completedLocal: local || undefined, completedChoice: choice, km, largeJumpReason: jump || undefined, returnBranchId: m.atProvider ? returnBranchId : undefined }), `${m.maintenanceNo} tamamlandı.`)}
      summary={m.startKm != null ? [['Başlangıç km', formatKm(m.startKm)]] : undefined}
    >
      {kmField('Tamamlanma kilometresi', true)}
      {timeField('Tamamlandığı zaman', 'op-completed')}
      {nowHint}
      {m.atProvider && (
        <Field id="op-return" label="Aracın döndüğü şube" required error={fields.returnBranchId} hint="Araç servis sağlayıcıdan bu şubeye döner; konum geçmişine yazılır.">
          <Select id="op-return" value={returnBranchId} onChange={(e) => setReturnBranchId(e.target.value)}>
            {branches.data?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </StepDialog>
  )
}

export function MaintenanceDetailPage() {
  const session = useSession()
  const qc = useQueryClient()
  const { maintenanceId } = useParams({ from: '/app/bakim-servis/$maintenanceId' })
  const key = ['maintenance-detail', session.company?.id, maintenanceId]
  const q = useQuery({ queryKey: key, queryFn: () => maintenanceApi.get(maintenanceId), retry: false })
  const [step, setStep] = useState<Step | null>(null)
  if (q.isError) {
    return (
      <div>
        {q.error instanceof ApiRequestError && q.error.status === 404 ? (
          <StatePanel icon={Wrench} title="Bakım kaydı bulunamadı">
            <p>Bu adresteki kayıt yok ya da yetkili olduğunuz şubelerde değil.</p>
          </StatePanel>
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (!q.data) return <div aria-busy="true" aria-label="Bakım kaydı yükleniyor" className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
  const m = q.data
  const done = (next: MaintenanceDetail) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['maintenance'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
    setStep(null)
  }
  const manage = can(session, 'maintenance.manage')
  const approve = can(session, 'maintenance.approve')
  const open = m.status !== 'completed' && m.status !== 'cancelled'
  const actions: ReactNode[] = []
  if (m.status === 'pending_approval' && approve) actions.push(<button key="a" type="button" className={btnPrimary} onClick={() => setStep('approve')}>Onayla</button>)
  if ((m.status === 'planned' || m.status === 'pending_approval') && manage) actions.push(<button key="s" type="button" className={m.status === 'planned' ? btnPrimary : btnSecondary} onClick={() => setStep('start')}>Servise al</button>)
  if (m.status === 'in_service' && manage) actions.push(<button key="w" type="button" className={btnPrimary} onClick={() => setStep('work-done')}>İş bitti</button>)
  if ((m.status === 'in_service' || m.status === 'awaiting_check') && manage) actions.push(<button key="e" type="button" className={btnSecondary} onClick={() => setStep('end')}>Beklenen bitişi değiştir</button>)
  if (m.status === 'awaiting_check' && approve) {
    actions.push(<button key="c" type="button" className={btnPrimary} onClick={() => setStep('complete')}>Tamamla</button>)
    actions.push(<button key="r" type="button" className={btnSecondary} onClick={() => setStep('return-to-work')}>İşe geri gönder</button>)
  }
  if ((m.status === 'planned' || m.status === 'pending_approval') && manage) actions.push(<button key="x" type="button" className={btnSecondary} onClick={() => setStep('cancel')}>İptal et</button>)
  return (
    <>
      <DetailHeader
        back="/bakim-servis"
        backLabel="Bakım & Servis"
        number={m.maintenanceNo}
        title={`${MAINTENANCE_TYPE_LABELS[m.type]} · ${m.reason}`}
        status={{ label: m.overdue ? `${MAINTENANCE_STATUS_LABELS[m.status]} · gecikti` : MAINTENANCE_STATUS_LABELS[m.status], tone: m.overdue ? 'alert' : MAINTENANCE_STATUS_TONE[m.status] }}
        hint={MAINTENANCE_STATUS_HINT[m.status]}
        plate={m.vehicle.plate}
        vehicleId={m.vehicle.id}
        vehicleText={`${m.vehicle.make} ${m.vehicle.model} · ${m.vehicle.className}`}
        actions={actions}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {m.overdue && (
            <Notice tone="alert">
              Planlanan bitiş ({formatMoment(m.plannedEnd)}) geçti ve bakım tamamlanmadı. Araç bitene kadar müsait sayılmaz.
            </Notice>
          )}
          {open && m.conflicts.length > 0 && (
            <Notice>
              <p className="font-medium">{m.status === 'pending_approval' ? 'Bu plan şu kayıtlarla çakıştığı için aracı tutmuyor:' : 'Planlanan aralıkta araçla çakışan kayıtlar:'}</p>
              <div className="mt-2 rounded-md bg-surface/70 px-3">
                <HoldList holds={m.conflicts} />
              </div>
              <p className="mt-2">Rezervasyonlar otomatik iptal edilmez. Çakışma çözülmeden plan onaylanamaz ve araç servise alınamaz.</p>
            </Notice>
          )}
          <Section title="Bakım bilgileri">
            <Facts
              rows={[
                ['Tür', MAINTENANCE_TYPE_LABELS[m.type]],
                ['Sorumlu şube', m.branch.name],
                ['Planlanan başlangıç', formatMoment(m.plannedStart)],
                ['Planlanan / beklenen bitiş', formatMoment(m.plannedEnd)],
                ['Servise alındı', m.actualStartAt ? `${formatDateTime(m.actualStartAt)}${m.startedByName ? ` · ${m.startedByName}` : ''}` : null],
                ['İş bitti', m.workDoneAt ? formatDateTime(m.workDoneAt) : null],
                ['Tamamlandı', m.completedAt ? `${formatDateTime(m.completedAt)}${m.completedByName ? ` · ${m.completedByName}` : ''}` : null],
                ['Başlangıç km', m.startKm != null ? formatKm(m.startKm) : null],
                ['Tamamlanma km', m.endKm != null ? formatKm(m.endKm) : null],
                ['Servis sağlayıcı', m.providerName ? `${m.providerName}${m.atProvider ? ' (araç serviste)' : ''}` : null],
                ['Onay', m.approvedAt ? `${formatDateTime(m.approvedAt)}${m.approvedByName ? ` · ${m.approvedByName}` : ''}` : null],
                ['Oluşturan', `${m.createdByName ?? '—'} · ${formatDateTime(m.createdAt)}`],
              ]}
            />
            {m.cancelReason && <p className="mt-3 text-[13px] text-ink-2">İptal gerekçesi: {m.cancelReason}</p>}
          </Section>
          <Section title="Yapılan iş">
            <Facts rows={[['Yapılan işler', m.workDone], ['Parçalar', m.parts], ['Not', m.notes]]} />
            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-2">
              <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
              Maliyet bu sürümde tutulmaz; masraf kaydı Masraflar modülüyle tek kaynaktan gelecek.
            </p>
          </Section>
          <Section title="Fotoğraflar" description="Servis raporu, parça veya iş fotoğrafları. Kayıt kapanınca değiştirilemez.">
            <PhotoGrid
              photos={m.photos}
              canEdit={open && manage}
              policy={m.uploadPolicy}
              label="Bakım"
              onUpload={async (f, p) => done(await maintenanceApi.uploadPhoto(m.id, f, p))}
              onRemove={async (id) => done(await maintenanceApi.removePhoto(m.id, id))}
            />
          </Section>
        </div>
        <div className="min-w-0 space-y-5">
          <Section title="Araç">
            <Link to="/araclar/$vehicleId" params={{ vehicleId: m.vehicle.id }} search={{ sekme: 'bakim' }} className="flex items-center gap-2 font-medium text-blue hover:underline">
              <CarProfile size={16} />
              Aracın bakım geçmişi
            </Link>
            {m.damageFile && (
              <p className="mt-3 text-[13px] text-ink-2">
                Bağlı hasar dosyası:{' '}
                <Link to="/hasar-kayitlari/$damageId" params={{ damageId: m.damageFile.id }} className="font-medium text-blue hover:underline">
                  {m.damageFile.damageNo}
                </Link>
                . Bakımın tamamlanması hasarı “onarıldı” yapmaz.
              </p>
            )}
            {m.status === 'completed' && (
              <p className="mt-3 flex items-start gap-1.5 text-[13px] text-ink-2">
                <CheckCircle size={15} className="mt-[3px] shrink-0 text-ok" />
                Teslimden önce aracın hazırlığı ve teslim kontrolü ayrıca yapılır.
              </p>
            )}
          </Section>
          <Section title="Geçmiş">
            <EventsList events={m.events} />
          </Section>
        </div>
      </div>
      {step && <StepForm m={m} step={step} onClose={() => setStep(null)} onDone={done} />}
    </>
  )
}
