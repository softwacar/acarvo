import { EvidenceGate } from '@/components/EvidenceGate'
import {
  CHECKLIST_ANSWERS,
  CHECKLIST_ITEMS,
  type ChecklistAnswer,
  type ChecklistItem,
  CLEANLINESS_LEVELS,
  type Cleanliness,
  CONDITION_LEVELS,
  FUEL_LEVELS,
  type FuelLevel,
  HANDOVER_BACKDATE_HOURS,
  INSPECTION_MAX_PHOTOS,
  INSPECTION_MIN_PHOTOS,
  PHOTO_ANGLES,
  type PhotoAngle,
  type RentalDetail,
  type RentalInspection,
  RETURN_BACKDATE_HOURS,
  type VehicleCondition,
} from '@acarvo/shared'
import { ArrowLeft, Camera, CheckCircle, Info, Key, ShieldCheck, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, rentalsApi } from '@/lib/api'
import { countryName } from '@/lib/customer-labels'
import { DOCUMENT_TYPE_LABELS } from '@/lib/customer-document-labels'
import { formatMoment } from '@/lib/reservation-labels'
import {
  CHECKLIST_ANSWER_LABELS,
  CHECKLIST_LABELS,
  CLEANLINESS_LABELS,
  CONDITION_LABELS,
  FUEL_FRACTION,
  FUEL_LEVEL_LABELS,
  PHOTO_ANGLE_LABELS,
} from '@/lib/rental-labels'
import { cn } from '@/lib/utils'
import { formatKm } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { DamageDiagram, draftOf, type MarkDraft } from './DamageDiagram'
import { GateList, Note, OverdueLine, RentalStatusBadge } from './RentalParts'

type Kind = 'handover' | 'return'

interface Draft {
  km: string
  fuel: FuelLevel | ''
  cleanliness: Cleanliness | ''
  condition: VehicleCondition | ''
  checklist: Partial<Record<ChecklistItem, ChecklistAnswer>>
  notes: string
  counterpartCustomerId: string
  marks: MarkDraft[]
}

const draftFrom = (i: RentalInspection | null): Draft => ({
  km: i?.km != null ? String(i.km) : '',
  fuel: i?.fuel ?? '',
  cleanliness: i?.cleanliness ?? '',
  condition: i?.condition ?? '',
  checklist: i?.checklist ?? {},
  notes: i?.notes ?? '',
  counterpartCustomerId: i?.counterpart?.id ?? '',
  marks: (i?.marks ?? []).map(draftOf),
})

function Block({ title, hint, children, id, aside }: { title: string; hint?: ReactNode; children: ReactNode; id: string; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {aside}
      </div>
      {hint && <p className="mt-1 text-[12.5px] text-ink-2">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/** The five fixed fuel levels (spec §59B), as a radio group with a small gauge. */
function FuelPicker({ id, value, onChange, disabled }: { id: string; value: FuelLevel | ''; onChange: (v: FuelLevel) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-5 gap-1.5">
      {FUEL_LEVELS.map((f) => (
        <label key={f} className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[13px] font-medium', value === f ? 'border-blue/50 bg-blue-soft/40 text-blue-ink' : 'border-line text-ink hover:bg-ground', disabled && 'cursor-default opacity-60')}>
          <input type="radio" name={id} value={f} checked={value === f} disabled={disabled} onChange={() => onChange(f)} className="sr-only" />
          <span aria-hidden className="relative h-2 w-full max-w-[44px] overflow-hidden rounded-full bg-line">
            <span className="absolute inset-y-0 left-0 rounded-full bg-current" style={{ width: `${FUEL_FRACTION[f] * 100}%` }} />
          </span>
          {FUEL_LEVEL_LABELS[f]}
        </label>
      ))}
    </div>
  )
}

function Checklist({ value, onChange, disabled }: { value: Draft['checklist']; onChange: (v: Draft['checklist']) => void; disabled?: boolean }) {
  return (
    <div className="divide-y divide-line-soft rounded-lg border border-line">
      {CHECKLIST_ITEMS.map((item) => (
        <fieldset key={item} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5">
          <legend className="float-left min-w-[180px] flex-1 text-[13.5px] font-medium text-ink">{CHECKLIST_LABELS[item]}</legend>
          <div className="flex flex-wrap gap-1">
            {CHECKLIST_ANSWERS.map((a) => (
              <label key={a} className={cn('inline-flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-[12.5px] font-medium', value[item] === a ? (a === 'issue' ? 'border-alert/50 bg-alert-soft text-alert' : 'border-blue/50 bg-blue-soft/40 text-blue-ink') : 'border-line text-ink-2 hover:bg-ground', disabled && 'cursor-default opacity-60')}>
                <input type="radio" name={`chk-${item}`} checked={value[item] === a} disabled={disabled} onChange={() => onChange({ ...value, [item]: a })} className="sr-only" />
                {CHECKLIST_ANSWER_LABELS[a]}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

/** 4–5 real evidence photos (spec §59B). Uploaded at once to the open inspection; removal leaves a record. */
function PhotoPanel({ r, kind, inspection, onUpdated }: { r: RentalDetail; kind: Kind; inspection: RentalInspection | null; onUpdated: (d: RentalDetail) => void }) {
  const photos = inspection?.photos ?? []
  const [angle, setAngle] = useState<PhotoAngle | ''>(() => (PHOTO_ANGLES.find((a) => !photos.some((p) => p.angle === a)) ?? 'other') as PhotoAngle)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const full = photos.length >= INSPECTION_MAX_PHOTOS
  const closed = !r.uploadPolicy.enabled
  const upload = async (file: File) => {
    if (!angle) return setError('Önce fotoğrafın açısını seçin.')
    setError(null)
    setProgress(0)
    try {
      const next = await rentalsApi.uploadPhoto(r.id, kind, angle, file, setProgress)
      onUpdated(next)
      const used = new Set((kind === 'handover' ? next.handover : next.return)?.photos.map((p) => p.angle))
      setAngle((PHOTO_ANGLES.find((a) => !used.has(a)) ?? 'other') as PhotoAngle)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Fotoğraf yüklenemedi.')
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="space-y-3">
      <EvidenceGate kind="rental" id={r.id} count={photos.length}>
      <ul aria-label="Fotoğraflar" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {photos.map((p, i) => (
          <li key={p.id} className="overflow-hidden rounded-lg border border-line bg-ground">
            <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3]">
              <img src={p.thumbUrl} alt={`Fotoğraf ${i + 1}: ${PHOTO_ANGLE_LABELS[p.angle]}`} className="size-full object-cover" loading="lazy" />
            </a>
            <div className="flex items-center justify-between gap-1 px-2 py-1 text-[12px]">
              <span className="truncate font-medium text-ink">
                {i + 1}. {PHOTO_ANGLE_LABELS[p.angle]}
              </span>
              <button
                type="button"
                aria-label={`Fotoğraf ${i + 1}'i kaldır`}
                onClick={async () => {
                  try {
                    onUpdated(await rentalsApi.removePhoto(r.id, kind, p.id))
                  } catch (e) {
                    setError(e instanceof ApiRequestError ? e.message : 'Kaldırılamadı.')
                  }
                }}
                className="grid size-7 place-items-center rounded text-ink-2 hover:bg-alert-soft hover:text-alert"
              >
                <Trash size={14} />
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: Math.max(0, INSPECTION_MIN_PHOTOS - photos.length) }, (_, i) => (
          <li key={`e-${i}`} aria-hidden className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-ink-3">
            <Camera size={22} />
          </li>
        ))}
      </ul>
      </EvidenceGate>
      <p className={cn('tnum text-[13px] font-medium', photos.length >= INSPECTION_MIN_PHOTOS ? 'text-ok' : 'text-hold')}>
        {photos.length} / {INSPECTION_MIN_PHOTOS}–{INSPECTION_MAX_PHOTOS} fotoğraf
      </p>
      {closed ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-hold-soft px-3 py-2 text-[13px] text-ink">
          <WarningCircle size={15} className="mt-[2px] shrink-0 text-hold" />
          {r.uploadPolicy.reason} Fotoğraf olmadan {kind === 'handover' ? 'teslim' : 'kapanış'} yapılamaz.
        </p>
      ) : (
        !full && (
          <div className="flex flex-wrap items-end gap-2">
            <Field id={`${kind}-angle`} label="Açı" className="w-[150px]">
              <Select id={`${kind}-angle`} compact value={angle} onChange={(e) => setAngle(e.target.value as PhotoAngle)}>
                {PHOTO_ANGLES.map((a) => (
                  <option key={a} value={a}>
                    {PHOTO_ANGLE_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <input ref={input} id={`${kind}-file`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <label htmlFor={`${kind}-file`} className={cn('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-ground', progress !== null && 'pointer-events-none opacity-60')}>
              {progress !== null ? <SpinnerGap size={15} className="animate-spin" /> : <Camera size={15} />}
              {progress !== null ? `Yükleniyor %${Math.round(progress * 100)}` : 'Fotoğraf ekle'}
            </label>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="text-[13px] text-alert">
          {error}
        </p>
      )}
      <Note>Fotoğraflar özel depoda saklanır; konum ve kamera bilgileri (EXIF) silinir. Tanıtım fotoğrafı değildir, kanıt olarak değiştirilemez.</Note>
    </div>
  )
}

/** Staff's document decision per driver (K3, K4): the system suggests, staff decides; never "verified" by the system. */
function DocumentDecisions({ r, onUpdated }: { r: RentalDetail; onUpdated: (d: RentalDetail) => void }) {
  const session = useSession()
  const ctx = r.documentContext
  const initial = useMemo(
    () =>
      Object.fromEntries(
        r.drivers.map((d) => {
          const c = r.documentChecks.find((x) => x.customerId === d.id)
          const s = ctx?.drivers.find((x) => x.customerId === d.id)?.suggestedResidency
          return [d.id, { residencyClass: c?.residencyClass ?? s ?? '', decision: c?.decision ?? '', note: c?.note ?? '' }]
        }),
      ) as Record<string, { residencyClass: 'local' | 'foreign' | ''; decision: 'eligible' | 'not_eligible' | ''; note: string }>,
    [r, ctx],
  )
  const [f, setF] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => rentalsApi.documentCheck(r.id, { version: r.version, drivers: r.drivers.map((d) => ({ customerId: d.id, ...f[d.id]!, note: f[d.id]!.note || undefined })) }),
    onSuccess: (next) => {
      setError(null)
      setFieldErrors({})
      onUpdated(next)
      toast('Belge kararı kaydedildi.')
    },
    onError: (e) => {
      setError(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.')
      setFieldErrors(e instanceof ApiRequestError ? (e.fields ?? {}) : {})
    },
  })
  if (!ctx) return <Note tone="warn">Belge kararı için müşteri belgelerini görme yetkisi gerekir. Yetkili bir kişi kararı verebilir.</Note>
  if (!can(session, 'rentals.manage')) return <Note tone="warn">Belge kararı vermek için kiralama yönetme yetkisi gerekir.</Note>
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink">
        Referans ülke (başlangıç şubesi): <span className="font-medium">{ctx.referenceCountry ? countryName(ctx.referenceCountry) : <span className="text-alert">tanımlı değil</span>}</span>
      </p>
      {r.drivers.map((d, i) => {
        const dc = ctx.drivers.find((x) => x.customerId === d.id)
        const v = f[d.id]!
        const policy = v.residencyClass ? ctx.policies[v.residencyClass] : null
        const missing = policy ? policy.items.filter((it) => !it.acceptedTypes.some((t) => dc?.validTypes.includes(t))) : []
        const recorded = r.documentChecks.find((x) => x.customerId === d.id)
        return (
          <fieldset key={d.id} className="rounded-lg border border-line p-3.5">
            <legend className="px-1 text-[13.5px] font-semibold text-ink">
              {d.displayName} <span className="tnum font-normal text-ink-2">{d.customerNo}</span> · {d.isPrimary ? 'Ana sürücü' : 'Ek sürücü'}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[12.5px] text-ink-2">
                  Öneri: {dc?.suggestedResidency ? (dc.suggestedResidency === 'local' ? 'Yerli' : 'Yabancı') : 'ikamet ülkesi bilinmiyor'} · uyruktan sınıflandırma yapılmaz
                </p>
                <div role="radiogroup" aria-label={`${d.displayName}: yerli veya yabancı`} className="mt-1.5 flex gap-1.5">
                  {(['local', 'foreign'] as const).map((c) => (
                    <label key={c} className={cn('inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium', v.residencyClass === c ? 'border-blue/50 bg-blue-soft/40 text-blue-ink' : 'border-line text-ink-2 hover:bg-ground')}>
                      <input type="radio" name={`res-${d.id}`} checked={v.residencyClass === c} onChange={() => setF({ ...f, [d.id]: { ...v, residencyClass: c } })} className="sr-only" />
                      {c === 'local' ? 'Yerli' : 'Yabancı'}
                    </label>
                  ))}
                </div>
              </div>
              <div className="text-[12.5px]">
                {!v.residencyClass ? (
                  <span className="text-ink-2">Sınıflandırmayı seçince uygulanacak kural görünür.</span>
                ) : policy ? (
                  <>
                    <span className="font-medium text-ink">Kural (sürüm {policy.version}):</span>
                    <ul className="mt-1 space-y-0.5">
                      {policy.items.map((it, k) => {
                        const ok = it.acceptedTypes.some((t) => dc?.validTypes.includes(t))
                        return (
                          <li key={k} className={cn('flex items-start gap-1', ok ? 'text-ok' : 'text-alert')}>
                            {ok ? <CheckCircle size={13} weight="fill" className="mt-[2px] shrink-0" /> : <WarningCircle size={13} className="mt-[2px] shrink-0" />}
                            {it.acceptedTypes.map((t) => DOCUMENT_TYPE_LABELS[t as 'passport'] ?? t).join(' veya ')}
                            {!ok && ' · kiralama süresince geçerli kayıt yok'}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                ) : (
                  <span className="text-hold">Bu ülke ve sınıflandırma için etkin belge kuralı tanımlı değil. Bu, “belge gerekmez” anlamına gelmez; karar personel kontrolüne dayanır.</span>
                )}
                {dc && dc.expiringInPeriod.length > 0 && <p className="mt-1 text-hold">Kiralama içinde süresi biten: {dc.expiringInPeriod.map((t) => DOCUMENT_TYPE_LABELS[t as 'passport'] ?? t).join(', ')}</p>}
                <Link to="/musteriler/$customerId" params={{ customerId: d.id }} search={{ sekme: 'belgeler' }} className="mt-1 inline-block font-medium text-blue hover:underline">
                  Belgeleri aç
                </Link>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`${d.displayName}: belge kararı`}>
              {(['eligible', 'not_eligible'] as const).map((c) => (
                <label key={c} className={cn('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium', v.decision === c ? (c === 'eligible' ? 'border-ok/50 bg-ok-soft text-ok' : 'border-alert/50 bg-alert-soft text-alert') : 'border-line text-ink-2 hover:bg-ground', c === 'eligible' && missing.length > 0 && 'opacity-50')}>
                  <input type="radio" name={`dec-${d.id}`} disabled={c === 'eligible' && missing.length > 0} checked={v.decision === c} onChange={() => setF({ ...f, [d.id]: { ...v, decision: c } })} className="sr-only" />
                  {c === 'eligible' ? 'Belgeleri gördüm, uygun' : 'Uygun değil'}
                </label>
              ))}
              {fieldErrors[`drivers.${i}.decision`] && <span className="text-[12.5px] text-alert">{fieldErrors[`drivers.${i}.decision`]}</span>}
            </div>
            <Input aria-label={`${d.displayName}: not`} placeholder="Not (isteğe bağlı; belge numarası yazmayın)" maxLength={500} value={v.note} onChange={(e) => setF({ ...f, [d.id]: { ...v, note: e.target.value } })} className="mt-2 h-9 text-[13.5px]" />
            {recorded && (
              <p className="mt-1.5 text-[12px] text-ink-2">
                Kayıtlı karar: {recorded.decision === 'eligible' ? 'uygun' : 'uygun değil'} · {recorded.residencyClass === 'local' ? 'yerli' : 'yabancı'} · {recorded.ruleStatus === 'policy_applied' ? `kural sürüm ${recorded.policyVersion}` : 'kural tanımsız, personel kontrolü'} · {recorded.checkedByName}
              </p>
            )}
          </fieldset>
        )
      })}
      {error && (
        <p role="alert" className="text-[13px] text-alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending || r.drivers.some((d) => !f[d.id]?.residencyClass || !f[d.id]?.decision)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink hover:bg-ground disabled:opacity-50"
      >
        {save.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        Belge kararını kaydet
      </button>
      <Note>Kayıtlı karar değişmez; yeni karar yeni kayıttır. Gerçek şifreleme anahtarları kurulana kadar belge numaraları görüntülenmez; karar personelin fiziksel kontrolüne dayanır.</Note>
    </div>
  )
}

export function HandoverPage() {
  return <InspectionRoute kind="handover" />
}
export function ReturnPage() {
  return <InspectionRoute kind="return" />
}

function InspectionRoute({ kind }: { kind: Kind }) {
  const session = useSession()
  const { rentalId } = useParams({ strict: false }) as { rentalId: string }
  const q = useQuery({ queryKey: ['rental', session.company?.id, rentalId], queryFn: () => rentalsApi.get(rentalId), retry: false })
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  if (!q.data) return <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Kiralama yükleniyor" />
  const r = q.data
  const open = kind === 'handover' ? r.status === 'prepared' : r.status === 'delivered' || r.status === 'returned'
  if (!open) {
    return (
      <div className="space-y-4">
        <Link to="/kiralamalar/$rentalId" params={{ rentalId: r.id }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
          <ArrowLeft size={14} /> {r.rentalNo}
        </Link>
        <StatePanel icon={Key} title={kind === 'handover' ? 'Teslim bu aşamada yapılamaz' : 'İade bu aşamada yapılamaz'}>
          <p>{kind === 'handover' ? 'Kiralama teslim edilmiş, kapanmış veya iptal edilmiş. Teslim kaydı Kiralama 360° Teslim sekmesinde.' : 'İade, araç teslim edildikten sonra ve kiralama kapanmadan yapılır.'}</p>
        </StatePanel>
      </div>
    )
  }
  if (!can(session, 'rentals.handover')) return <StatePanel icon={Key} title="Yetki gerekli"><p>Teslim ve iade işlemleri için yetkiniz yok.</p></StatePanel>
  return <Workspace key={`${kind}-${r.id}`} r={r} kind={kind} />
}

function Workspace({ r, kind }: { r: RentalDetail; kind: Kind }) {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const zone = session.company?.timezone
  const inspection = kind === 'handover' ? r.handover : r.return
  const [initial, setInitial] = useState(() => draftFrom(inspection))
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  useBlocker({ shouldBlockFn: () => dirty && !done && !window.confirm('Kaydedilmemiş kontrol bilgileri var. Sayfadan çıkılsın mı?') })
  const branches = useQuery({ queryKey: ['rental-branches', session.company?.id], queryFn: () => rentalsApi.branches() })
  const onUpdated = (next: RentalDetail) => {
    qc.setQueryData(['rental', session.company?.id, r.id], next)
    void qc.invalidateQueries({ queryKey: ['rentals'] })
  }
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }))
    setFieldErrors({})
  }

  const saveDraft = async () => {
    const body = {
      inspectionVersion: inspection?.version ?? 0,
      km: kind === 'handover' ? d.km || undefined : undefined,
      fuel: kind === 'handover' ? d.fuel || undefined : undefined,
      cleanliness: d.cleanliness || undefined,
      condition: d.condition || undefined,
      checklist: d.checklist,
      notes: d.notes,
      counterpartCustomerId: d.counterpartCustomerId || undefined,
      marks: d.marks
        .filter((m) => m.category)
        .map((m) => ({ id: m.id, view: m.view, x: m.x, y: m.y, category: m.category, note: m.note || undefined, photoId: m.photoId || undefined, existingMarkId: m.existingMarkId || undefined })),
    }
    const next = await rentalsApi.saveInspection(r.id, kind, body)
    onUpdated(next)
    const fresh = draftFrom(kind === 'handover' ? next.handover : next.return)
    setInitial(fresh)
    setD(fresh)
    return next
  }
  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      setError(null)
      toast('Kontrol taslağı kaydedildi.')
    },
    onError: (e) => {
      setError(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.')
      setFieldErrors(e instanceof ApiRequestError ? (e.fields ?? {}) : {})
    },
  })
  const untyped = d.marks.filter((m) => !m.category).length
  const title = kind === 'handover' ? 'Teslim' : r.status === 'delivered' ? 'İade' : 'İade kontrolü ve kapanış'
  const pickupBranch = branches.data?.items.find((b) => b.id === r.pickupBranch.id)

  return (
    <div className="space-y-5">
      <Link to="/kiralamalar/$rentalId" params={{ rentalId: r.id }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> {r.rentalNo}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[12.5px] font-semibold text-ink-2">{r.rentalNo}</span>
        <RentalStatusBadge status={r.status} overdueMinutes={r.overdueMinutes} />
      </div>
      <p className="tnum -mt-3 text-ink-2">
        {r.customer.displayName} · {r.vehicle.plate} {r.vehicle.make} {r.vehicle.model} · {kind === 'handover' ? `Planlanan alış ${formatMoment(r.plannedPickup, zone)} · ${r.pickupBranch.name}` : `Teslim ${r.delivered ? formatMoment(r.delivered, zone) : '—'} · planlanan iade ${formatMoment(r.plannedReturn, zone)}`}
      </p>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {kind === 'handover' && (
            <Block id="b-docs" title="1. Sürücüler ve belgeler" hint="Her sürücü için ayrı karar. Sistem yalnız öneri gösterir; yerli/yabancı sınıflandırmasını ve belge kararını personel verir.">
              <DocumentDecisions key={r.version} r={r} onUpdated={onUpdated} />
            </Block>
          )}
          {kind === 'return' && r.status === 'delivered' && <ReturnRecord r={r} onUpdated={onUpdated} branches={branches.data?.items ?? []} />}
          {kind === 'return' && r.status === 'returned' && r.return && <ReturnSummary r={r} />}

          <Block
            id="b-record"
            title={kind === 'handover' ? '2. Araç, kilometre ve yakıt' : 'İade kontrolü: temizlik ve genel durum'}
            hint={kind === 'handover' ? `Aracın kayıtlı son kilometresi: ${r.vehicle.currentKm != null ? formatKm(r.vehicle.currentKm) : 'kayıt yok'}. Teslim km bundan düşük olamaz.` : 'İade km ve yakıtı iade kaydında alınır.'}
          >
            {kind === 'handover' && (
              <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                <Field id="h-km" label="Teslim kilometresi" required error={fieldErrors.km}>
                  <Input type="number" inputMode="numeric" min={0} step={1} {...describe('h-km', fieldErrors.km)} value={d.km} onChange={(e) => set({ km: e.target.value })} />
                </Field>
                <div>
                  <p id="h-fuel-label" className="mb-1.5 text-[13.5px] font-medium text-ink">
                    Yakıt seviyesi <span className="text-alert">*</span>
                  </p>
                  <FuelPicker id="h-fuel" value={d.fuel} onChange={(fuel) => set({ fuel })} />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id={`${kind}-clean`} label="Temizlik" required>
                <Select id={`${kind}-clean`} value={d.cleanliness} onChange={(e) => set({ cleanliness: e.target.value as Cleanliness })}>
                  <option value="">Seçin</option>
                  {CLEANLINESS_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {CLEANLINESS_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`${kind}-cond`} label="Genel durum" required>
                <Select id={`${kind}-cond`} value={d.condition} onChange={(e) => set({ condition: e.target.value as VehicleCondition })}>
                  <option value="">Seçin</option>
                  {CONDITION_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`${kind}-cp`} label={kind === 'handover' ? 'Teslim alan sürücü' : 'Aracı getiren sürücü'} required={kind === 'handover'} error={fieldErrors.counterpartCustomerId}>
                <Select id={`${kind}-cp`} value={d.counterpartCustomerId} onChange={(e) => set({ counterpartCustomerId: e.target.value })}>
                  <option value="">{kind === 'handover' ? 'Seçin' : 'Bilinmiyor / seçilmedi'}</option>
                  {r.drivers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                      {x.isPrimary ? ' (ana sürücü)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Block>

          <Block id="b-check" title={kind === 'handover' ? '3. Anahtar, ekipman ve kontrol listesi' : 'Anahtar, ekipman ve kontrol listesi'} hint="Her madde açıkça yanıtlanmalı; hiçbir madde kendiliğinden “tamam” sayılmaz.">
            <Checklist value={d.checklist} onChange={(checklist) => set({ checklist })} />
          </Block>

          <Block
            id="b-marks"
            title={kind === 'handover' ? '4. Görünür hasar ve işaretler' : 'Hasar işaretleri (önce / sonra)'}
            hint={kind === 'handover' ? 'Teslimde görülen hasarları işaretleyin. Aracın önceki iadesindeki işaretler referans olarak gösterilir.' : 'Teslim işaretleri salt okunur referanstır (T). Her iade işaretini, teslimdeki bir işaretle aynıysa ona bağlayın; bağlanmayan işaret yeni bulgudur.'}
          >
            <DamageDiagram
              marks={d.marks}
              onChange={(marks) => set({ marks })}
              reference={kind === 'handover' ? r.previousReturnMarks : (r.handover?.marks ?? [])}
              referenceLabel={kind === 'handover' ? 'Önceki iadedeki işaret' : 'Teslimdeki işaret'}
              photos={inspection?.photos ?? []}
              editable
              linkable={kind === 'return'}
            />
            {untyped > 0 && <p className="text-[12.5px] text-hold">{untyped} işaretin türü seçilmedi; türü olmayan işaret kaydedilmez.</p>}
          </Block>

          <Block id="b-photos" title={kind === 'handover' ? '5. Teslim fotoğrafları' : 'İade fotoğrafları'} hint="En az 4, en fazla 5 gerçek fotoğraf: ön, arka, sol, sağ ve isteğe bağlı iç/ek açı. Açı adları kanıtın yerine geçmez.">
            <PhotoPanel r={r} kind={kind} inspection={inspection} onUpdated={onUpdated} />
          </Block>

          <Block id="b-notes" title="Not">
            <Field id={`${kind}-notes`} label="Görünür durum notu" hint="Kimlik, ehliyet veya kart numarası yazmayın.">
              <Textarea id={`${kind}-notes`} rows={3} maxLength={2000} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </Block>
        </div>

        <aside aria-label={kind === 'handover' ? 'Teslim masası' : 'İade masası'} className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Kontrol taslağı</h2>
              <span className={cn('text-[12.5px] font-medium', dirty ? 'text-hold' : 'text-ok')}>{dirty ? 'Kaydedilmemiş değişiklik var' : inspection ? 'Kaydedildi' : 'Henüz kaydedilmedi'}</span>
            </div>
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !dirty} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink hover:bg-ground disabled:opacity-50">
              {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
              Taslağı kaydet
            </button>
            <p className="mt-2 text-[12px] text-ink-3">Taslak bir durum değişikliği değildir. Fotoğraflar eklendiği anda kaydedilir.</p>
          </section>
          {kind === 'handover' ? (
            <HandoverDesk r={r} dirty={dirty} saveDraft={saveDraft} onDone={() => setDone(true)} pickupBranch={pickupBranch} navigate={navigate} onUpdated={onUpdated} />
          ) : r.status === 'returned' ? (
            <CloseDesk r={r} dirty={dirty} saveDraft={saveDraft} onDone={() => setDone(true)} navigate={navigate} onUpdated={onUpdated} />
          ) : (
            <section className="rounded-xl border border-line bg-surface p-5 text-[13px] text-ink-2">
              <h2 className="text-[15px] font-semibold text-ink">Adımlar</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>İade kaydı: gerçek zaman, şube, km ve yakıt (soldaki ilk bölüm).</li>
                <li>İade kontrolü: temizlik, kontrol listesi, işaretler ve 4–5 fotoğraf.</li>
                <li>Kontrolü tamamla ve kiralamayı kapat.</li>
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

/** Step 1 of a return (delivered → returned): real time and branch, km and fuel; one odometer and one location entry. */
function ReturnRecord({ r, onUpdated, branches }: { r: RentalDetail; onUpdated: (d: RentalDetail) => void; branches: { id: string; name: string; code: string; timeZone: string; country: string | null; inScope: boolean }[] }) {
  const session = useSession()
  const zone = session.company?.timezone
  const inScope = branches.filter((b) => b.inScope)
  const [branchId, setBranchId] = useState(() => (inScope.some((b) => b.id === r.returnBranch.id) ? r.returnBranch.id : (inScope[0]?.id ?? '')))
  const [when, setWhen] = useState<'now' | 'late'>('now')
  const [local, setLocal] = useState('')
  const [choice, setChoice] = useState<'earlier' | 'later' | undefined>()
  const [km, setKm] = useState('')
  const [fuel, setFuel] = useState<FuelLevel | ''>('')
  const [counterpart, setCounterpart] = useState('')
  const [jumpReason, setJumpReason] = useState('')
  const [needJump, setNeedJump] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const branch = branches.find((b) => b.id === branchId)
  const hk = r.handover?.km ?? null
  const used = km && hk != null ? Number(km) - hk : null
  const submit = useMutation({
    mutationFn: () =>
      rentalsApi.returnVehicle(r.id, {
        version: r.version,
        requestId,
        returnBranchId: branchId,
        returnedLocal: when === 'late' ? local : undefined,
        returnedChoice: when === 'late' ? choice : undefined,
        km: km === '' ? undefined : Number(km),
        fuel: fuel || undefined,
        counterpartCustomerId: counterpart || undefined,
        largeJumpReason: needJump ? jumpReason : undefined,
      }),
    onSuccess: (next) => {
      onUpdated(next)
      toast(`${next.rentalNo}: iade alındı. Şimdi iade kontrolünü tamamlayın.`)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setError('İade kaydedilemedi. Bağlantınızı kontrol edin; tekrar gönderdiğinizde ikinci kayıt oluşmaz.')
      if (e.code === 'LARGE_JUMP_REASON_REQUIRED') setNeedJump(true)
      if (e.code === 'VERSION_CONFLICT') setRequestId(crypto.randomUUID())
      setError(e.message)
      setFieldErrors(e.fields ?? {})
    },
  })
  return (
    <Block id="b-return" title="1. İade kaydı" hint="Aracın gerçekten geri geldiği zaman ve şube. Planlanan iade saati geçti diye araç boş sayılmaz; iade kaydıyla serbest kalır.">
      {r.overdueMinutes != null && <OverdueLine minutes={r.overdueMinutes} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ret-branch" label="İade şubesi" required error={fieldErrors.returnBranchId}>
          <Select id="ret-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {inScope.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === r.returnBranch.id ? ' (planlanan)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1.5 text-[13.5px] font-medium text-ink">İade zamanı</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="İade zamanı">
            {(['now', 'late'] as const).map((w) => (
              <label key={w} className={cn('inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium', when === w ? 'border-blue/50 bg-blue-soft/40 text-blue-ink' : 'border-line text-ink-2 hover:bg-ground')}>
                <input type="radio" name="ret-when" checked={when === w} onChange={() => setWhen(w)} className="sr-only" />
                {w === 'now' ? 'Şimdi' : 'Daha önce geldi'}
              </label>
            ))}
          </div>
        </div>
      </div>
      {when === 'late' && (
        <TimeField id="returnedLocal" label={`Gerçek iade (en çok ${RETURN_BACKDATE_HOURS} saat önce)`} value={local} onChange={setLocal} branch={branch} choice={choice} onChoice={setChoice} error={fieldErrors.returnedLocal ?? fieldErrors.returnedChoice} />
      )}
      {branch && branch.id !== r.returnBranch.id && <Note tone="warn">Planlanandan farklı şubeye iade. Araç bu şubede kayıt edilir; ana şubesi değişmez ve otomatik transfer yapılmaz.</Note>}
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field id="ret-km" label="İade kilometresi" required error={fieldErrors.km} hint={hk != null ? `Teslim: ${formatKm(hk)}` : undefined}>
          <Input type="number" inputMode="numeric" min={hk ?? 0} {...describe('ret-km', fieldErrors.km, hk != null)} value={km} onChange={(e) => setKm(e.target.value)} />
        </Field>
        <div>
          <p id="ret-fuel-label" className="mb-1.5 text-[13.5px] font-medium text-ink">
            Yakıt seviyesi <span className="text-alert">*</span>
          </p>
          <FuelPicker id="ret-fuel" value={fuel} onChange={setFuel} />
        </div>
      </div>
      <Field id="ret-cp" label="Aracı getiren sürücü (isteğe bağlı)">
        <Select id="ret-cp" value={counterpart} onChange={(e) => setCounterpart(e.target.value)}>
          <option value="">Bilinmiyor / seçilmedi</option>
          {r.drivers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-ground/70 p-3 text-[13px]">
        <div>
          <dt className="text-ink-2">Teslim km</dt>
          <dd className="tnum font-medium">{hk != null ? formatKm(hk) : '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Kullanılan</dt>
          <dd className={cn('tnum font-medium', used != null && used < 0 && 'text-alert')}>{used != null ? (used < 0 ? 'Teslimden düşük olamaz' : formatKm(used)) : '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Yakıt</dt>
          <dd className="font-medium">
            {r.handover?.fuel ? FUEL_LEVEL_LABELS[r.handover.fuel] : '—'} → {fuel ? FUEL_LEVEL_LABELS[fuel] : '—'}
          </dd>
        </div>
      </dl>
      {needJump && (
        <Field id="ret-jump" label="Büyük km artışı gerekçesi" required error={fieldErrors.largeJumpReason}>
          <Input id="ret-jump" value={jumpReason} maxLength={300} onChange={(e) => setJumpReason(e.target.value)} />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-alert">
          {error}
        </p>
      )}
      <button type="button" onClick={() => submit.mutate()} disabled={submit.isPending || !branchId || km === '' || !fuel} className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue px-5 font-medium text-white hover:bg-blue-ink disabled:opacity-60">
        {submit.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <Key size={16} />}
        İadeyi al
      </button>
      <p className="text-[12px] text-ink-3">Aracın km ve konum geçmişine aynı işlemde kaydedilir. Gecikme ücreti hesaplanmaz{zone ? '' : ''}.</p>
    </Block>
  )
}

function ReturnSummary({ r }: { r: RentalDetail }) {
  const session = useSession()
  const ret = r.return!
  const hk = r.handover?.km
  return (
    <Block id="b-return-done" title="1. İade kaydı alındı">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-4">
        <div>
          <dt className="text-[12px] text-ink-2">Gerçek iade</dt>
          <dd className="tnum font-medium">{r.returned ? formatMoment(r.returned, session.company?.timezone) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-2">Şube</dt>
          <dd className="font-medium">{r.actualReturnBranch?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-2">Km (kullanılan)</dt>
          <dd className="tnum font-medium">
            {ret.km != null ? formatKm(ret.km) : '—'}
            {ret.km != null && hk != null && <span className="text-ink-2"> ({formatKm(ret.km - hk)})</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-2">Yakıt</dt>
          <dd className="font-medium">
            {r.handover?.fuel ? FUEL_LEVEL_LABELS[r.handover.fuel] : '—'} → {ret.fuel ? FUEL_LEVEL_LABELS[ret.fuel] : '—'}
          </dd>
        </div>
      </dl>
      <Note>Araç iade alındı ve bu andan itibaren yeni rezervasyon veya kiralamaya ayrılabilir. Kiralama, iade kontrolü tamamlanınca kapanır; tamamlanmadan araç yeniden teslim edilemez.</Note>
    </Block>
  )
}

type Nav = ReturnType<typeof useNavigate>

/** Teslim Masası (spec §85.4): the gates, the staff statement about contract and price, and one final action. */
function HandoverDesk({ r, dirty, saveDraft, onDone, pickupBranch, navigate, onUpdated }: { r: RentalDetail; dirty: boolean; saveDraft: () => Promise<RentalDetail>; onDone: () => void; pickupBranch?: { id: string; name: string; code: string; timeZone: string; inScope: boolean }; navigate: Nav; onUpdated: (d: RentalDetail) => void }) {
  const [contractAck, setContractAck] = useState(false)
  const [pricingAck, setPricingAck] = useState(false)
  const [reference, setReference] = useState('')
  const [when, setWhen] = useState<'now' | 'late'>('now')
  const [local, setLocal] = useState('')
  const [choice, setChoice] = useState<'earlier' | 'later' | undefined>()
  const [needJump, setNeedJump] = useState(false)
  const [jumpReason, setJumpReason] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const blocking = r.deliveryGates.filter((g) => g.state === 'blocked')
  const statementsReady = r.externalTermsMode && contractAck && pricingAck && reference.trim().length >= 3
  const go = useMutation({
    mutationFn: async () => {
      const current = dirty ? await saveDraft() : r
      return rentalsApi.deliver(r.id, {
        version: current.version,
        inspectionVersion: current.handover?.version,
        requestId,
        deliveredLocal: when === 'late' ? local : undefined,
        deliveredChoice: when === 'late' ? choice : undefined,
        externalContractAck: contractAck,
        externalPricingAck: pricingAck,
        externalReference: reference.trim() || undefined,
        largeJumpReason: needJump ? jumpReason : undefined,
      })
    },
    onSuccess: (next) => {
      onDone()
      onUpdated(next)
      toast(`${next.rentalNo} teslim edildi.`)
      setTimeout(() => navigate({ to: '/kiralamalar/$rentalId', params: { rentalId: next.id }, search: { sekme: 'teslim' } }), 0)
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setError('Teslim kaydedilemedi. Bağlantınızı kontrol edin; tekrar gönderdiğinizde ikinci teslim oluşmaz.')
      if (e.code === 'LARGE_JUMP_REASON_REQUIRED') setNeedJump(true)
      if (e.code === 'VERSION_CONFLICT' || e.code === 'INSPECTION_CONFLICT') {
        const cur = (e.details as { current?: RentalDetail } | undefined)?.current
        if (cur) onUpdated(cur)
        setRequestId(crypto.randomUUID())
      }
      setError(e.message)
      setFieldErrors(e.fields ?? {})
    },
  })
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Teslim masası</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-2">Son kaydedilmiş duruma göre. Teslimde sunucu hepsini yeniden denetler.</p>
      <GateList gates={r.deliveryGates} className="mt-2" />
      {dirty && <p className="mt-2 text-[12.5px] text-hold">Kaydedilmemiş değişiklikler teslimden önce otomatik kaydedilir.</p>}
      <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Teslim zamanı">
          {(['now', 'late'] as const).map((w) => (
            <label key={w} className={cn('inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium', when === w ? 'border-blue/50 bg-blue-soft/40 text-blue-ink' : 'border-line text-ink-2 hover:bg-ground')}>
              <input type="radio" name="del-when" checked={when === w} onChange={() => setWhen(w)} className="sr-only" />
              {w === 'now' ? 'Teslim şimdi' : 'Daha önce teslim edildi'}
            </label>
          ))}
        </div>
        {when === 'late' && <TimeField id="deliveredLocal" label={`Gerçek teslim (en çok ${HANDOVER_BACKDATE_HOURS} saat önce)`} value={local} onChange={setLocal} branch={pickupBranch} choice={choice} onChoice={setChoice} error={fieldErrors.deliveredLocal ?? fieldErrors.deliveredChoice} />}
        {needJump && (
          <Field id="del-jump" label="Büyük km artışı gerekçesi" required error={fieldErrors.largeJumpReason}>
            <Input id="del-jump" value={jumpReason} maxLength={300} onChange={(e) => setJumpReason(e.target.value)} />
          </Field>
        )}
        {r.externalTermsMode ? (
          <fieldset className="space-y-2 rounded-lg border border-hold/35 bg-hold-soft/40 px-3 py-3 text-[13px]">
            <legend className="px-1 text-[13px] font-semibold text-ink">Dış sözleşme ve fiyat beyanları</legend>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={contractAck} onChange={(e) => setContractAck(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
              <span className="text-ink">Sözleşmenin ACARVO dışında düzenlendiğini ve işlemin dış süreçte tamamlandığını kontrol ettim.</span>
            </label>
            {fieldErrors.externalContractAck && <p className="text-[12.5px] text-alert">{fieldErrors.externalContractAck}</p>}
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={pricingAck} onChange={(e) => setPricingAck(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
              <span className="text-ink">Fiyatın ACARVO dışında belirlendiğini ve taraflarla dış süreçte ele alındığını kontrol ettim.</span>
            </label>
            {fieldErrors.externalPricingAck && <p className="text-[12.5px] text-alert">{fieldErrors.externalPricingAck}</p>}
            <Field id="ext-ref" label="Dış sözleşme / işlem referansı" required error={fieldErrors.externalReference} hint="Örn. SZL-2026/118. Müşteri adı, telefon veya kimlik numarası yazmayın.">
              <Input id="ext-ref" value={reference} maxLength={40} autoComplete="off" onChange={(e) => setReference(e.target.value)} className="h-9 text-[13.5px]" />
            </Field>
            <p className="text-[12px] text-ink-2">Beyanlar adınız ve zamanla kaydedilir. ACARVO imzalı sözleşme, ödeme, kesin fiyat veya hukuki uygunluk sonucu üretmez.</p>
          </fieldset>
        ) : (
          <p className="flex items-start gap-1.5 rounded-lg border border-alert/30 bg-alert-soft px-3 py-2.5 text-[13px] text-ink">
            <WarningCircle size={15} className="mt-[2px] shrink-0 text-alert" />
            Dış sözleşme ve fiyat modu kapalı. ACARVO’da sözleşme ve fiyat modülü olmadığı için teslim yapılamaz; modu yalnız şirket sahibi Ayarlar’dan açabilir.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] font-medium text-alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => go.mutate()}
          disabled={go.isPending || blocking.length > 0 || !statementsReady}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-50"
        >
          {go.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <Key size={16} />}
          Teslimi tamamla
        </button>
        {blocking.length > 0 && <p className="text-center text-[12px] text-alert">{blocking.length} engel kaldırılmadan teslim yapılamaz.</p>}
      </div>
    </section>
  )
}

/** Close (returned → closed): the return check is complete and new findings were seen; no damage case or charge. */
function CloseDesk({ r, dirty, saveDraft, onDone, navigate, onUpdated }: { r: RentalDetail; dirty: boolean; saveDraft: () => Promise<RentalDetail>; onDone: () => void; navigate: Nav; onUpdated: (d: RentalDetail) => void }) {
  const [ack, setAck] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const findings = r.closeGates.find((g) => g.code === 'findings')
  const hasFindings = findings?.state === 'attention'
  const blocking = r.closeGates.filter((g) => g.state === 'blocked')
  const go = useMutation({
    mutationFn: async () => {
      const current = dirty ? await saveDraft() : r
      return rentalsApi.close(r.id, { version: current.version, inspectionVersion: current.return?.version, requestId, findingsAcknowledged: ack || undefined })
    },
    onSuccess: (next) => {
      onDone()
      onUpdated(next)
      toast(`${next.rentalNo} kapatıldı.`)
      setTimeout(() => navigate({ to: '/kiralamalar/$rentalId', params: { rentalId: next.id }, search: { sekme: 'hasar' } }), 0)
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && (e.code === 'VERSION_CONFLICT' || e.code === 'INSPECTION_CONFLICT')) {
        const cur = (e.details as { current?: RentalDetail } | undefined)?.current
        if (cur) onUpdated(cur)
        setRequestId(crypto.randomUUID())
      }
      setError(e instanceof ApiRequestError ? e.message : 'Kapatılamadı. Bağlantınızı kontrol edin; tekrar gönderdiğinizde ikinci kayıt oluşmaz.')
    },
  })
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Kapanış</h2>
      <GateList gates={r.closeGates} kind="return" className="mt-2" />
      {dirty && <p className="mt-2 text-[12.5px] text-hold">Kaydedilmemiş değişiklikler kapanıştan önce otomatik kaydedilir.</p>}
      <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
        {hasFindings && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-hold/35 bg-hold-soft/50 px-3 py-2.5 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
            <span>
              <span className="font-medium text-ink">Yeni hasar bulgularını gördüm</span>
              <span className="block text-[12.5px] text-ink-2">Bulgular kiralamada kalıcı kalır. Kapatmadan sonra her bulgu için Hasar Kayıtları’nda dosya açılabilir; sorumluluk, muafiyet veya ücret kendiliğinden oluşmaz.</span>
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-[13px] font-medium text-alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => go.mutate()}
          disabled={go.isPending || blocking.length > 0 || (hasFindings && !ack)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-50"
        >
          {go.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          Kontrolü tamamla ve kapat
        </button>
        <Note>Kapanış operasyoneldir: bakiye, ödeme veya “finansal kapanış” anlamına gelmez; aracın bir sonraki teslime hazır olduğunu da söylemez.</Note>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-3">
        <Info size={13} className="mt-[2px] shrink-0" />
        Dosya taraması: {r.uploadPolicy.enabled ? 'yüklemeler açık' : 'yüklemeler kapalı'}.
      </p>
    </section>
  )
}
