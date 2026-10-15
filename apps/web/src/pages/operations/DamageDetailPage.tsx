import { DAMAGE_REPAIR_STATUSES, DAMAGE_SEVERITIES, DAMAGE_TYPES, type DamageDetail, type DamageRepairStatus } from '@acarvo/shared'
import { Bandaids, Prohibit, Truck, Wrench } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, damagesApi } from '@/lib/api'
import {
  DAMAGE_REPAIR_LABELS,
  DAMAGE_REVIEW_LABELS,
  DAMAGE_REVIEW_TONE,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_TYPE_LABELS,
  DAMAGE_USABILITY_LABELS,
  DAMAGE_VIEW_LABELS,
  MAINTENANCE_STATUS_LABELS,
} from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { btnPrimary, btnSecondary, DetailHeader, errorText, EventsList, Facts, HoldList, newRequestId, Notice, PhotoGrid, Section, StepDialog } from './OpsParts'

type Step = 'review' | 'repair' | 'block' | 'unblock' | 'edit'

function StepForm({ d, step, onClose, onDone }: { d: DamageDetail; step: Step; onClose: () => void; onDone: (next: DamageDetail) => void }) {
  const [requestId] = useState(newRequestId)
  const [text, setText] = useState('')
  const [review, setReview] = useState<'under_review' | 'assessed' | 'closed'>(d.reviewStatus === 'reported' ? 'under_review' : 'assessed')
  const [repair, setRepair] = useState<DamageRepairStatus>(d.repairStatus)
  const [usability, setUsability] = useState<'usable' | 'restricted'>('usable')
  const [edit, setEdit] = useState({ description: d.description, area: d.area ?? '', severity: d.severity, damageType: d.damageType, usability: d.usability === 'not_usable' ? undefined : d.usability })
  const [fields, setFields] = useState<Record<string, string>>({})
  const base = { version: d.version, requestId }
  const run = async (fn: () => Promise<DamageDetail>, message: string) => {
    try {
      onDone(await fn())
      toast(message)
    } catch (e) {
      if (e instanceof ApiRequestError) setFields(e.fields ?? {})
      return errorText(e)
    }
  }
  if (step === 'block')
    return (
      <StepDialog title="Aracı kullanılamaz işaretle" description="Bu andan itibaren araç için rezervasyon onaylanamaz ve teslim yapılamaz. Mevcut rezervasyonlar iptal edilmez; risk altında gösterilir." confirm="Kullanılamaz işaretle" danger onClose={onClose} onSubmit={() => run(() => damagesApi.step(d.id, 'block', { ...base, reason: text }), 'Araç kullanılamaz olarak işaretlendi.')}>
        <Field id="dm-reason" label="Gerekçe" required error={fields.reason}>
          <Textarea id="dm-reason" rows={3} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </Field>
      </StepDialog>
    )
  if (step === 'unblock')
    return (
      <StepDialog title="Hasar engelini kaldır" description="Engel kaldırılır ve geçmişte kalır. Araçta bakım veya transfer varsa onlar yine aracı tutar." confirm="Engeli kaldır" onClose={onClose} onSubmit={() => run(() => damagesApi.step(d.id, 'unblock', { ...base, reason: text, usability }), 'Engel kaldırıldı.')}>
        <Field id="dm-usability" label="Aracın yeni durumu" required>
          <Select id="dm-usability" value={usability} onChange={(e) => setUsability(e.target.value as 'usable' | 'restricted')}>
            <option value="usable">{DAMAGE_USABILITY_LABELS.usable}</option>
            <option value="restricted">{DAMAGE_USABILITY_LABELS.restricted}</option>
          </Select>
        </Field>
        <Field id="dm-unreason" label="Gerekçe" required error={fields.reason}>
          <Textarea id="dm-unreason" rows={3} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </Field>
      </StepDialog>
    )
  if (step === 'repair')
    return (
      <StepDialog title="Onarım durumu" description="Onarım durumu personel tarafından belirlenir; bakımın tamamlanması hasarı kendiliğinden onarıldı yapmaz." confirm="Kaydet" onClose={onClose} onSubmit={() => run(() => damagesApi.step(d.id, 'repair', { ...base, repairStatus: repair }), 'Onarım durumu kaydedildi.')}>
        <Field id="dm-repair" label="Onarım durumu" required>
          <Select id="dm-repair" value={repair} onChange={(e) => setRepair(e.target.value as DamageRepairStatus)}>
            {DAMAGE_REPAIR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DAMAGE_REPAIR_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </StepDialog>
    )
  if (step === 'edit')
    return (
      <StepDialog title="Hasar bilgilerini düzenle" description="Kullanılamaz durumu yalnız engel ile değişir." confirm="Kaydet" onClose={onClose} onSubmit={() => run(() => damagesApi.update(d.id, { ...base, ...edit }), 'Hasar bilgileri güncellendi.')}>
        <Field id="de-type" label="Hasar türü">
          <Select id="de-type" value={edit.damageType} onChange={(e) => setEdit({ ...edit, damageType: e.target.value as DamageDetail['damageType'] })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DAMAGE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="de-severity" label="Ağırlık">
          <Select id="de-severity" value={edit.severity} onChange={(e) => setEdit({ ...edit, severity: e.target.value as DamageDetail['severity'] })}>
            {DAMAGE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {DAMAGE_SEVERITY_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {edit.usability && (
          <Field id="de-usability" label="Kullanılabilirlik">
            <Select id="de-usability" value={edit.usability} onChange={(e) => setEdit({ ...edit, usability: e.target.value as 'usable' | 'restricted' })}>
              <option value="usable">{DAMAGE_USABILITY_LABELS.usable}</option>
              <option value="restricted">{DAMAGE_USABILITY_LABELS.restricted}</option>
            </Select>
          </Field>
        )}
        <Field id="de-area" label="Alan">
          <Input id="de-area" value={edit.area} maxLength={120} onChange={(e) => setEdit({ ...edit, area: e.target.value })} />
        </Field>
        <Field id="de-description" label="Açıklama" required error={fields.description}>
          <Textarea id="de-description" rows={3} value={edit.description} maxLength={2000} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
        </Field>
      </StepDialog>
    )
  return (
    <StepDialog title="İnceleme durumu" description="Kapatılan dosya değiştirilemez ve yeniden açılmaz; yeni bulgu için yeni dosya açılır. Engel açıkken dosya kapatılamaz." confirm="Kaydet" onClose={onClose} onSubmit={() => run(() => damagesApi.step(d.id, 'review', { ...base, reviewStatus: review, note: text || undefined }), 'İnceleme durumu kaydedildi.')}>
      <Field id="dm-review" label="Yeni durum" required>
        <Select id="dm-review" value={review} onChange={(e) => setReview(e.target.value as typeof review)}>
          {(['under_review', 'assessed', 'closed'] as const)
            .filter((s) => s !== d.reviewStatus)
            .map((s) => (
              <option key={s} value={s}>
                {DAMAGE_REVIEW_LABELS[s]}
              </option>
            ))}
        </Select>
      </Field>
      <Field id="dm-note" label={review === 'closed' ? 'Kapatma gerekçesi' : 'Değerlendirme notu (isteğe bağlı)'} required={review === 'closed'} error={fields.note}>
        <Textarea id="dm-note" rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      </Field>
    </StepDialog>
  )
}

export function DamageDetailPage() {
  const session = useSession()
  const qc = useQueryClient()
  const { damageId } = useParams({ from: '/app/hasar-kayitlari/$damageId' })
  const key = ['damage', session.company?.id, damageId]
  const q = useQuery({ queryKey: key, queryFn: () => damagesApi.get(damageId), retry: false })
  const [step, setStep] = useState<Step | null>(null)
  if (q.isError) {
    return (
      <div>
        {q.error instanceof ApiRequestError && q.error.status === 404 ? (
          <StatePanel icon={Bandaids} title="Hasar dosyası bulunamadı">
            <p>Bu adresteki kayıt yok ya da yetkili olduğunuz şubelerde değil.</p>
          </StatePanel>
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (!q.data) return <div aria-busy="true" aria-label="Hasar dosyası yükleniyor" className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
  const d = q.data
  const done = (next: DamageDetail) => {
    qc.setQueryData(key, next)
    void qc.invalidateQueries({ queryKey: ['damages'] })
    void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
    setStep(null)
  }
  const open = d.reviewStatus !== 'closed'
  const report = can(session, 'damage.report')
  const review = can(session, 'damage.review')
  const actions: ReactNode[] = []
  if (open && d.blocked && can(session, 'damage.unblock')) actions.push(<button key="u" type="button" className={btnPrimary} onClick={() => setStep('unblock')}>Engeli kaldır</button>)
  if (open && !d.blocked && report) actions.push(<button key="b" type="button" className={btnSecondary} onClick={() => setStep('block')}>Kullanılamaz işaretle</button>)
  if (open && review) actions.push(<button key="r" type="button" className={btnSecondary} onClick={() => setStep('review')}>İnceleme durumu</button>)
  if (open && review) actions.push(<button key="p" type="button" className={btnSecondary} onClick={() => setStep('repair')}>Onarım durumu</button>)
  if (open && report) actions.push(<button key="e" type="button" className={btnSecondary} onClick={() => setStep('edit')}>Düzenle</button>)
  return (
    <>
      <DetailHeader
        back="/hasar-kayitlari"
        backLabel="Hasar Kayıtları"
        number={d.damageNo}
        title={`${DAMAGE_TYPE_LABELS[d.damageType]} · ${DAMAGE_VIEW_LABELS[d.view]}${d.area ? ` · ${d.area}` : ''}`}
        status={{ label: DAMAGE_REVIEW_LABELS[d.reviewStatus], tone: DAMAGE_REVIEW_TONE[d.reviewStatus] }}
        hint="Bulgu kaydıdır; sorumluluk kararı, ücret, sigorta talebi veya depozito kesintisi oluşturulmaz."
        plate={d.vehicle.plate}
        vehicleId={d.vehicle.id}
        vehicleText={`${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.className}`}
        actions={actions}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {d.blocked && (
            <Notice tone="alert" icon={Prohibit}>
              <p className="font-medium">Araç kullanılamaz olarak işaretli. Rezervasyon onayı ve teslim engelli.</p>
              {d.atRisk.length > 0 && (
                <>
                  <p className="mt-1.5">Risk altındaki kayıtlar (otomatik iptal edilmez; yetkili kişi ele almalı):</p>
                  <div className="mt-1.5 rounded-md bg-surface/70 px-3">
                    <HoldList holds={d.atRisk} />
                  </div>
                </>
              )}
            </Notice>
          )}
          <Section title="Bulgu">
            <Facts
              rows={[
                ['Tespit', formatMoment(d.detected)],
                ['Şube', d.branch.name],
                ['Tespit yeri', d.locationText],
                ['Aracın tarafı', DAMAGE_VIEW_LABELS[d.view]],
                ['Alan', d.area],
                ['Tür', DAMAGE_TYPE_LABELS[d.damageType]],
                ['Ağırlık', DAMAGE_SEVERITY_LABELS[d.severity]],
                ['Kullanılabilirlik', DAMAGE_USABILITY_LABELS[d.usability]],
                ['Onarım', DAMAGE_REPAIR_LABELS[d.repairStatus]],
                ['Bildiren', `${d.createdByName ?? '—'} · ${formatDateTime(d.createdAt)}`],
              ]}
            />
            <p className="mt-3 text-[13.5px] whitespace-pre-line text-ink">{d.description}</p>
            {d.assessmentNote && <p className="mt-2 text-[13px] text-ink-2">Değerlendirme: {d.assessmentNote}</p>}
            {d.closeReason && <p className="mt-2 text-[13px] text-ink-2">Kapatma gerekçesi: {d.closeReason}</p>}
          </Section>
          <Section title="Fotoğraflar">
            <PhotoGrid photos={d.photos} canEdit={open && report} policy={d.uploadPolicy} label="Hasar" onUpload={async (f, p) => done(await damagesApi.uploadPhoto(d.id, f, p))} onRemove={async (id) => done(await damagesApi.removePhoto(d.id, id))} />
          </Section>
          <Section title="Engel geçmişi" description="Her engel dönemi, kimin neden koyduğu ve kaldırdığıyla saklanır.">
            {d.blocks.length ? (
              <ul className="divide-y divide-line-soft">
                {d.blocks.map((b) => (
                  <li key={b.id} className="py-2.5 text-[13px]">
                    <p className="font-medium text-ink">
                      {formatDateTime(b.startedAt)} → {b.endedAt ? formatDateTime(b.endedAt) : <span className="text-alert">sürüyor</span>}
                    </p>
                    <p className="text-ink-2">
                      Konuldu: {b.startReason}
                      {b.startedByName ? ` (${b.startedByName})` : ''}
                    </p>
                    {b.endReason && (
                      <p className="text-ink-2">
                        Kaldırıldı: {b.endReason}
                        {b.endedByName ? ` (${b.endedByName})` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-2">Bu dosya aracı hiç engellemedi.</p>
            )}
          </Section>
        </div>
        <div className="min-w-0 space-y-5">
          <Section title="Kaynak ve bağlantılar">
            <div className="space-y-2.5 text-[13px]">
              {d.rental ? (
                <p>
                  Kiralama{' '}
                  <Link to="/kiralamalar/$rentalId" params={{ rentalId: d.rental.id }} search={{ sekme: 'hasar' }} className="font-medium text-blue hover:underline">
                    {d.rental.rentalNo}
                  </Link>
                  {d.source && ` · ${d.source.inspectionKind === 'return' ? 'iade' : 'teslim'} kontrolündeki işaret (değiştirilmedi)`}
                </p>
              ) : (
                <p className="text-ink-2">Kiralamaya bağlı değil.</p>
              )}
              {d.maintenance.length > 0 && (
                <ul className="space-y-1">
                  {d.maintenance.map((m) => (
                    <li key={m.id}>
                      <Link to="/bakim-servis/$maintenanceId" params={{ maintenanceId: m.id }} className="font-medium text-blue hover:underline">
                        {m.maintenanceNo}
                      </Link>{' '}
                      <span className="text-ink-2">· {MAINTENANCE_STATUS_LABELS[m.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {open && can(session, 'transfers.repair') && (
                <Link to="/araclar/transferler/yeni" search={{ arac: d.vehicle.id, hasar: d.id }} className="flex items-center gap-1.5 font-medium text-blue hover:underline">
                  <Truck size={14} />
                  Onarım için taşıma başlat (çekici / taşıyıcı)
                </Link>
              )}
              {open && can(session, 'maintenance.manage') && (
                <Link to="/bakim-servis/yeni" search={{ arac: d.vehicle.id, hasar: d.id }} className="inline-flex items-center gap-1.5 font-medium text-blue hover:underline">
                  <Wrench size={14} />
                  Onarım için bakım planla
                </Link>
              )}
            </div>
          </Section>
          <Section title="Geçmiş">
            <EventsList events={d.events} />
          </Section>
        </div>
      </div>
      {step && <StepForm d={d} step={step} onClose={() => setStep(null)} onDone={done} />}
    </>
  )
}
