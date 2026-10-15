import { DAMAGE_FILE_VIEWS, DAMAGE_SEVERITIES, DAMAGE_TYPES, DAMAGE_USABILITY, type DamageFileView, type DamageSeverity, type DamageType, type DamageUsability } from '@acarvo/shared'
import { ArrowLeft, SpinnerGap } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ForbiddenState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, damagesApi, rentalsApi, vehiclesApi } from '@/lib/api'
import { DAMAGE_SEVERITY_LABELS, DAMAGE_TYPE_LABELS, DAMAGE_USABILITY_LABELS, DAMAGE_VIEW_LABELS } from '@/lib/operation-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { btnGhost, btnPrimary, ErrorLine, newRequestId, Notice, Section, VehiclePicker } from './OpsParts'
import type { CreateSearch } from './search'

const FROM_MARK: Record<string, DamageType> = { scratch: 'scratch', dent: 'dent', crack: 'crack', stain: 'interior', missing_part: 'missing_part', other: 'other' }

/** Hasar bildir: a finding, optionally from a rental's final inspection mark (linked, never changed). */
export function DamageFormPage() {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const search = useSearch({ from: '/app/hasar-kayitlari/yeni' }) as CreateSearch
  const branches = useQuery({ queryKey: ['ops-branches', session.company?.id, 'damage'], queryFn: () => damagesApi.branches() })
  const rental = useQuery({ queryKey: ['rental', session.company?.id, search.kiralama], queryFn: () => rentalsApi.get(search.kiralama!), enabled: !!search.kiralama, retry: false })
  const candidates = useQuery({ queryKey: ['damage-candidates', session.company?.id, search.kiralama], queryFn: () => damagesApi.candidates(search.kiralama!), enabled: !!search.kiralama, retry: false })
  const vehicleId = search.arac ?? rental.data?.vehicle.id
  const prefill = useQuery({ queryKey: ['vehicle', session.company?.id, vehicleId], queryFn: () => vehiclesApi.get(vehicleId!), enabled: !!vehicleId, retry: false })
  const mark = candidates.data?.items.find((c) => c.markId === search.isaret)
  const [vehicle, setVehicle] = useState<{ id: string; plate: string; text: string; homeBranchId?: string } | null>(null)
  const [branchId, setBranchId] = useState('')
  const [detected, setDetected] = useState('')
  const [detectedChoice, setDetectedChoice] = useState<'earlier' | 'later'>()
  const [view, setView] = useState<DamageFileView | ''>('')
  const [area, setArea] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState<DamageType | ''>('')
  const [severity, setSeverity] = useState<DamageSeverity | ''>('')
  const [usability, setUsability] = useState<DamageUsability | ''>('')
  const [blockReason, setBlockReason] = useState('')
  const [description, setDescription] = useState('')
  const [requestId] = useState(newRequestId)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (prefill.data && !vehicle) setVehicle({ id: prefill.data.id, plate: prefill.data.plate, text: `${prefill.data.make} ${prefill.data.model} · ${prefill.data.className}` })
  }, [prefill.data, vehicle])
  useEffect(() => {
    if (mark && !type) {
      setType(FROM_MARK[mark.category] ?? 'other')
      setView(mark.view as DamageFileView)
      if (mark.note && !description) setDescription(mark.note)
    }
  }, [mark, type, description])
  const inScope = (branches.data?.branches ?? []).filter((b) => b.inScope)
  useEffect(() => {
    if (!branchId && inScope.length) setBranchId((rental.data && inScope.find((b) => b.id === (rental.data.actualReturnBranch ?? rental.data.returnBranch).id)?.id) ?? inScope[0]!.id)
  }, [branchId, inScope, rental.data])
  const branch = branches.data?.branches.find((b) => b.id === branchId)

  if (!can(session, 'damage.report')) return <ForbiddenState message="Hasar bildirme yetkiniz yok." />

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        <Link to="/hasar-kayitlari" className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
          <ArrowLeft size={14} />
          Hasar Kayıtları
        </Link>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">Hasar bildir</h1>
        <p className="mt-1 text-ink-2">Bulgu kaydı sorumluluk kararı değildir. Kusur, ücret, sigorta talebi veya depozito kesintisi oluşturulmaz.</p>
      </div>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const f: Record<string, string> = {}
          if (!vehicle) f.vehicleId = 'Araç seçin'
          if (!view) f.view = 'Aracın hangi tarafı olduğunu seçin'
          if (!type) f.damageType = 'Hasar türünü seçin'
          if (!severity) f.severity = 'Ağırlığı seçin'
          if (!usability) f.usability = 'Kullanılabilirliği seçin'
          if (description.trim().length < 5) f.description = 'Hasarı açıklayın (en az 5 karakter)'
          if (usability === 'not_usable' && blockReason.trim().length < 5) f.blockReason = 'Aracın neden kullanılamayacağını yazın'
          setFields(f)
          if (Object.keys(f).length) return
          setPending(true)
          setError(null)
          try {
            const d = await damagesApi.create({
              requestId,
              vehicleId: vehicle!.id,
              branchId,
              detectedLocal: detected || undefined,
              detectedChoice,
              locationText: location || undefined,
              view,
              area: area || undefined,
              description,
              damageType: type,
              severity,
              usability,
              rentalId: search.kiralama,
              sourceMarkId: search.isaret,
              blockReason: usability === 'not_usable' ? blockReason : undefined,
            })
            void qc.invalidateQueries({ queryKey: ['damages'] })
            void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
            void qc.invalidateQueries({ queryKey: ['damage-candidates'] })
            toast(d.blocked ? `${d.damageNo} açıldı; araç kullanılamaz olarak işaretlendi.` : `${d.damageNo} açıldı.`)
            void navigate({ to: '/hasar-kayitlari/$damageId', params: { damageId: d.id } })
          } catch (err) {
            if (err instanceof ApiRequestError) {
              setError(err.message)
              setFields(err.fields ?? {})
            } else setError('Kaydedilemedi.')
          } finally {
            setPending(false)
          }
        }}
      >
        <Section title="Araç">
          <VehiclePicker value={vehicle} onChange={(v) => !search.kiralama && setVehicle(v)} error={fields.vehicleId} />
          {rental.data && (
            <p className="mt-3 text-[13px] text-ink-2">
              Kiralama:{' '}
              <Link to="/kiralamalar/$rentalId" params={{ rentalId: rental.data.id }} search={{ sekme: 'hasar' }} className="font-medium text-blue hover:underline">
                {rental.data.rentalNo}
              </Link>
              {mark && ` · ${mark.inspectionKind === 'return' ? 'İade' : 'Teslim'} kontrolündeki işaret bağlanacak (işaret değiştirilmez).`}
            </p>
          )}
        </Section>
        <Section title="Bulgu">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="d-branch" label="Tespit edilen şube" required error={fields.branchId}>
              <Select id="d-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {inScope.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <TimeField optional id="d-detected" label="Tespit zamanı" value={detected} onChange={setDetected} branch={branch} choice={detectedChoice} onChoice={setDetectedChoice} error={fields.detectedLocal} />
              <p className="mt-1 text-[12.5px] text-ink-3">Boş bırakılırsa şu an kaydedilir.</p>
            </div>
            <Field id="d-view" label="Aracın tarafı" required error={fields.view}>
              <Select {...describe('d-view', fields.view)} value={view} onChange={(e) => setView(e.target.value as DamageFileView)}>
                <option value="">Seçin</option>
                {DAMAGE_FILE_VIEWS.map((v) => (
                  <option key={v} value={v}>
                    {DAMAGE_VIEW_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="d-area" label="Alan (isteğe bağlı)" hint="Örn. sağ ön çamurluk">
              <Input {...describe('d-area', undefined, true)} value={area} maxLength={120} onChange={(e) => setArea(e.target.value)} />
            </Field>
            <Field id="d-type" label="Hasar türü" required error={fields.damageType}>
              <Select {...describe('d-type', fields.damageType)} value={type} onChange={(e) => setType(e.target.value as DamageType)}>
                <option value="">Seçin</option>
                {DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DAMAGE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="d-severity" label="Ağırlık" required error={fields.severity}>
              <Select {...describe('d-severity', fields.severity)} value={severity} onChange={(e) => setSeverity(e.target.value as DamageSeverity)}>
                <option value="">Seçin</option>
                {DAMAGE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {DAMAGE_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="d-location" label="Tespit yeri (isteğe bağlı)" hint="Örn. SJJ otoparkı, yıkama alanı" className="sm:col-span-2">
              <Input {...describe('d-location', undefined, true)} value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field id="d-description" label="Açıklama" required error={fields.description} className="sm:col-span-2">
              <Textarea {...describe('d-description', fields.description)} rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        </Section>
        <Section title="Kullanılabilirlik" description="Kullanılamaz işaretlenen araç için yeni rezervasyon onaylanamaz ve teslim yapılamaz. Mevcut rezervasyonlar iptal edilmez; risk altında gösterilir.">
          <fieldset>
            <legend className="sr-only">Kullanılabilirlik</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DAMAGE_USABILITY.map((u) => (
                <label key={u} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-[13.5px] has-[:checked]:border-blue/45 has-[:checked]:bg-blue-soft/30">
                  <input type="radio" name="usability" value={u} checked={usability === u} onChange={() => setUsability(u)} className="accent-[var(--ac-blue)]" />
                  {DAMAGE_USABILITY_LABELS[u]}
                </label>
              ))}
            </div>
            {fields.usability && <p className="mt-1.5 text-[13px] text-alert">{fields.usability}</p>}
          </fieldset>
          {usability === 'not_usable' && (
            <div className="mt-4 space-y-3">
              <Notice tone="alert">Araç bu kayıtla birlikte kullanılamaz işaretlenir. Engeli yalnız yetkili kişi gerekçesiyle kaldırabilir.</Notice>
              <Field id="d-block" label="Kullanılamama gerekçesi" required error={fields.blockReason}>
                <Input {...describe('d-block', fields.blockReason)} value={blockReason} maxLength={300} onChange={(e) => setBlockReason(e.target.value)} />
              </Field>
            </div>
          )}
        </Section>
        <ErrorLine error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/hasar-kayitlari" className={btnGhost}>
            Vazgeç
          </Link>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Hasar dosyası aç
          </button>
        </div>
      </form>
    </div>
  )
}
