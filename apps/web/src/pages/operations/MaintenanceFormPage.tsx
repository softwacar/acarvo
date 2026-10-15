import { type AllocationConflict, MAINTENANCE_TYPES, type MaintenanceType } from '@acarvo/shared'
import { ArrowLeft, SpinnerGap } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ForbiddenState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, damagesApi, maintenanceApi, vehiclesApi } from '@/lib/api'
import { MAINTENANCE_TYPE_LABELS } from '@/lib/operation-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { btnGhost, btnPrimary, btnSecondary, ErrorLine, HoldList, newRequestId, Notice, Section, VehiclePicker } from './OpsParts'
import type { CreateSearch } from './search'

type Picked = { id: string; plate: string; text: string; homeBranchId?: string }

/** Bakım planla: a plan without conflicts holds the vehicle; with conflicts it is refused or kept pending (holds nothing). */
export function MaintenanceFormPage() {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const search = useSearch({ from: '/app/bakim-servis/yeni' }) as CreateSearch
  const branches = useQuery({ queryKey: ['ops-branches', session.company?.id], queryFn: () => maintenanceApi.branches() })
  const prefill = useQuery({ queryKey: ['vehicle', session.company?.id, search.arac], queryFn: () => vehiclesApi.get(search.arac!), enabled: !!search.arac, retry: false })
  const damage = useQuery({ queryKey: ['damage', session.company?.id, search.hasar], queryFn: () => damagesApi.get(search.hasar!), enabled: !!search.hasar && can(session, 'damage.read'), retry: false })
  const [vehicle, setVehicle] = useState<Picked | null>(null)
  const [branchId, setBranchId] = useState('')
  const [type, setType] = useState<MaintenanceType | ''>(search.hasar ? 'repair' : '')
  const [reason, setReason] = useState('')
  const [start, setStart] = useState('')
  const [startChoice, setStartChoice] = useState<'earlier' | 'later'>()
  const [end, setEnd] = useState('')
  const [endChoice, setEndChoice] = useState<'earlier' | 'later'>()
  const [provider, setProvider] = useState('')
  const [notes, setNotes] = useState('')
  const [requestId] = useState(newRequestId)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<AllocationConflict[] | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const v = prefill.data ?? damage.data?.vehicle
    if (v && !vehicle) {
      const home = 'homeBranchId' in v ? v.homeBranchId : undefined
      setVehicle({ id: v.id, plate: v.plate, text: `${v.make} ${v.model} · ${v.className}`, homeBranchId: home })
    }
    if (damage.data && !reason) setReason(`Hasar ${damage.data.damageNo} onarımı`)
  }, [prefill.data, damage.data, vehicle, reason])
  const inScope = (branches.data?.branches ?? []).filter((b) => b.inScope)
  useEffect(() => {
    if (!branchId && inScope.length) setBranchId(inScope.find((b) => b.id === vehicle?.homeBranchId)?.id ?? inScope[0]!.id)
  }, [branchId, inScope, vehicle])
  const branch = branches.data?.branches.find((b) => b.id === branchId)

  if (!can(session, 'maintenance.manage')) return <ForbiddenState message="Bakım planlama yetkiniz yok." />

  const submit = async (keepPending: boolean) => {
    const f: Record<string, string> = {}
    if (!vehicle) f.vehicleId = 'Araç seçin'
    if (!type) f.type = 'Bakım türünü seçin'
    if (reason.trim().length < 3) f.reason = 'Bakımın nedenini yazın'
    if (!start) f.plannedStartLocal = 'Planlanan başlangıcı girin'
    if (!end) f.plannedEndLocal = 'Planlanan bitişi girin'
    setFields(f)
    if (Object.keys(f).length) return
    setPending(true)
    setError(null)
    try {
      const m = await maintenanceApi.create({
        requestId,
        vehicleId: vehicle!.id,
        branchId,
        type,
        reason,
        plannedStartLocal: start,
        plannedStartChoice: startChoice,
        plannedEndLocal: end,
        plannedEndChoice: endChoice,
        providerName: provider || undefined,
        notes: notes || undefined,
        damageFileId: search.hasar,
        keepPending,
      })
      void qc.invalidateQueries({ queryKey: ['maintenance'] })
      void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
      toast(m.status === 'planned' ? `${m.maintenanceNo} planlandı; araç bu aralık için ayrıldı.` : `${m.maintenanceNo} onay bekleyen plan olarak kaydedildi; aracı tutmaz.`)
      void navigate({ to: '/bakim-servis/$maintenanceId', params: { maintenanceId: m.id } })
    } catch (e) {
      if (e instanceof ApiRequestError) {
        setError(e.message)
        setFields(e.fields ?? {})
        setConflicts(e.code === 'MAINTENANCE_CONFLICT' ? ((e.details as { conflicts: AllocationConflict[] }).conflicts ?? []) : null)
      } else setError('Kaydedilemedi.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        <Link to="/bakim-servis" className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
          <ArrowLeft size={14} />
          Bakım & Servis
        </Link>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">Bakım planla</h1>
        <p className="mt-1 text-ink-2">Plan, aracı yalnız çakışma yoksa ayırır. Planlamak aracı servise almak değildir; servise alma ayrı bir adımdır.</p>
      </div>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(false)
        }}
      >
        <Section title="Araç">
          <VehiclePicker value={vehicle} onChange={(v) => setVehicle(v)} error={fields.vehicleId} />
          {damage.data && (
            <p className="mt-3 text-[13px] text-ink-2">
              Bağlı hasar dosyası:{' '}
              <Link to="/hasar-kayitlari/$damageId" params={{ damageId: damage.data.id }} className="font-medium text-blue hover:underline">
                {damage.data.damageNo}
              </Link>
            </p>
          )}
        </Section>
        <Section title="Bakım">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="m-branch" label="Sorumlu şube" required error={fields.branchId}>
              <Select id="m-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {inScope.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="m-type" label="Tür" required error={fields.type}>
              <Select {...describe('m-type', fields.type)} value={type} onChange={(e) => setType(e.target.value as MaintenanceType)}>
                <option value="">Seçin</option>
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MAINTENANCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="m-reason" label="Neden" required error={fields.reason} className="sm:col-span-2">
              <Input {...describe('m-reason', fields.reason)} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Örn. 15.000 km periyodik bakım" />
            </Field>
            <TimeField id="m-start" label="Planlanan başlangıç" value={start} onChange={setStart} branch={branch ? { ...branch } : undefined} choice={startChoice} onChoice={setStartChoice} error={fields.plannedStartLocal ?? fields.plannedStartChoice} />
            <TimeField id="m-end" label="Planlanan bitiş" value={end} onChange={setEnd} branch={branch ? { ...branch } : undefined} choice={endChoice} onChoice={setEndChoice} error={fields.plannedEndLocal ?? fields.plannedEndChoice} />
            <Field id="m-provider" label="Servis sağlayıcı (isteğe bağlı)" hint="Araç dış serviste bakılacaksa adı. Servise alınırken konum olarak yazılır." className="sm:col-span-2">
              <Input {...describe('m-provider', undefined, true)} value={provider} maxLength={120} onChange={(e) => setProvider(e.target.value)} />
            </Field>
            <Field id="m-notes" label="Not (isteğe bağlı)" className="sm:col-span-2">
              <Textarea id="m-notes" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Section>
        {conflicts && conflicts.length > 0 && (
          <Notice>
            <p className="font-medium">Bu aralıkta araç başka kayıtlarla dolu. Plan, çakışan bir taahhüt oluşturamaz:</p>
            <div className="mt-2 rounded-md bg-surface/70 px-3">
              <HoldList holds={conflicts} />
            </div>
            <p className="mt-2">Tarihi değiştirebilir veya planı “onay bekleyen” olarak kaydedebilirsiniz. Onay bekleyen plan aracı tutmaz; rezervasyonlar otomatik iptal edilmez.</p>
            <button type="button" disabled={pending} onClick={() => void submit(true)} className={`${btnSecondary} mt-3`}>
              Onay bekleyen olarak kaydet
            </button>
          </Notice>
        )}
        {!conflicts && <ErrorLine error={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/bakim-servis" className={btnGhost}>
            Vazgeç
          </Link>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Planla
          </button>
        </div>
      </form>
    </div>
  )
}
