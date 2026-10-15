import { TRANSPORT_METHODS, type TransferPurpose, type TransportMethod } from '@acarvo/shared'
import { ArrowLeft, SpinnerGap } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { describe, Field, Input, Select } from '@/components/fields'
import { ForbiddenState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, transfersApi, vehicleOpsApi, vehiclesApi } from '@/lib/api'
import { DAMAGE_TYPE_LABELS, DAMAGE_VIEW_LABELS, TRANSPORT_METHOD_LABELS } from '@/lib/operation-labels'
import { can, useSession } from '@/session'
import { TimeField } from '../reservations/ReservationFormPage'
import { btnGhost, btnPrimary, ErrorLine, newRequestId, Notice, Section, VehiclePicker } from './OpsParts'
import type { CreateSearch } from './search'

/** Transfer talebi: from a branch of the user to another branch of the company. Holds nothing until approved. */
export function TransferFormPage() {
  const session = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const search = useSearch({ from: '/app/araclar/transferler/yeni' }) as CreateSearch
  const branches = useQuery({ queryKey: ['ops-branches', session.company?.id, 'transfer'], queryFn: () => transfersApi.branches() })
  const prefill = useQuery({ queryKey: ['vehicle', session.company?.id, search.arac], queryFn: () => vehiclesApi.get(search.arac!), enabled: !!search.arac, retry: false })
  const [vehicle, setVehicle] = useState<{ id: string; plate: string; text: string; homeBranchId?: string } | null>(null)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [dep, setDep] = useState('')
  const [depChoice, setDepChoice] = useState<'earlier' | 'later'>()
  const [arr, setArr] = useState('')
  const [arrChoice, setArrChoice] = useState<'earlier' | 'later'>()
  const [reason, setReason] = useState('')
  const [driver, setDriver] = useState('')
  const [purpose, setPurpose] = useState<TransferPurpose>(search.hasar ? 'repair' : 'operational')
  const [damageFileId, setDamageFileId] = useState(search.hasar ?? '')
  const [method, setMethod] = useState<TransportMethod | ''>('')
  const canRepair = can(session, 'transfers.repair')
  const ops = useQuery({ queryKey: ['vehicle-ops', session.company?.id, vehicle?.id], queryFn: () => vehicleOpsApi.get(vehicle!.id), enabled: !!vehicle && purpose === 'repair', retry: false })
  const openDamages = (ops.data?.damages ?? []).filter((d) => d.reviewStatus !== 'closed')
  const blocked = (ops.data?.damages ?? []).some((d) => d.blocked)
  const [requestId] = useState(newRequestId)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (prefill.data && !vehicle) setVehicle({ id: prefill.data.id, plate: prefill.data.plate, text: `${prefill.data.make} ${prefill.data.model} · ${prefill.data.className}`, homeBranchId: prefill.data.homeBranchId })
  }, [prefill.data, vehicle])
  const all = branches.data?.branches ?? []
  const inScope = all.filter((b) => b.inScope)
  // The vehicle's home branch when it is the user's (the physical location may differ; the user can change it).
  const homeId = vehicle?.homeBranchId
  const homeInScope = !!homeId && inScope.some((b) => b.id === homeId)
  useEffect(() => {
    if (homeInScope) setFromId(homeId!)
  }, [homeId, homeInScope])
  useEffect(() => {
    if (!fromId && inScope.length) setFromId(inScope[0]!.id)
  }, [fromId, inScope])
  const from = all.find((b) => b.id === fromId)
  const to = all.find((b) => b.id === toId)
  if (!can(session, 'transfers.request')) return <ForbiddenState message="Transfer talebi oluşturma yetkiniz yok." />
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        <Link to="/araclar/transferler" className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
          <ArrowLeft size={14} />
          Araç Transferleri
        </Link>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em]">Transfer talebi</h1>
        <p className="mt-1 text-ink-2">Talep aracı tutmaz. Onaylanınca araç planlanan aralıkta ayrılır; onaylı rezervasyonlarla çakışan veya sonraki kaydı başka şubede başlayan transfer onaylanmaz.</p>
      </div>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const f: Record<string, string> = {}
          if (!vehicle) f.vehicleId = 'Araç seçin'
          if (!toId) f.toBranchId = 'Varış şubesini seçin'
          if (toId && toId === fromId) f.toBranchId = 'Varış şubesi çıkış şubesinden farklı olmalı'
          if (!dep) f.plannedDepartureLocal = 'Planlanan çıkışı girin'
          if (!arr) f.plannedArrivalLocal = 'Planlanan varışı girin'
          if (reason.trim().length < 3) f.reason = 'Transferin nedenini yazın'
          if (purpose === 'repair' && !damageFileId) f.damageFileId = 'Taşımanın bağlı olduğu hasar dosyasını seçin'
          if (purpose === 'repair' && !method) f.transportMethod = 'Taşıma yöntemini seçin'
          setFields(f)
          if (Object.keys(f).length) return
          setPending(true)
          setError(null)
          try {
            const t = await transfersApi.create({ requestId, vehicleId: vehicle!.id, fromBranchId: fromId, toBranchId: toId, reason, plannedDepartureLocal: dep, plannedDepartureChoice: depChoice, plannedArrivalLocal: arr, plannedArrivalChoice: arrChoice, driverNote: driver || undefined, purpose, damageFileId: purpose === 'repair' ? damageFileId : undefined, transportMethod: purpose === 'repair' ? method : undefined })
            void qc.invalidateQueries({ queryKey: ['transfers'] })
            void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
            toast(`${t.transferNo} talebi oluşturuldu.`)
            void navigate({ to: '/araclar/transferler/$transferId', params: { transferId: t.id } })
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
          <VehiclePicker value={vehicle} onChange={(v) => setVehicle(v)} error={fields.vehicleId} />
        </Section>
        <Section title="Taşımanın türü">
          <fieldset>
            <legend className="sr-only">Taşımanın türü</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-[13.5px] has-[:checked]:border-blue/45 has-[:checked]:bg-blue-soft/30">
                <input type="radio" name="purpose" checked={purpose === 'operational'} onChange={() => setPurpose('operational')} className="mt-0.5 accent-[var(--ac-blue)]" />
                <span>
                  <span className="block font-medium">Normal transfer</span>
                  <span className="block text-[12.5px] text-ink-2">Kullanılabilir aracın şubeler arası taşınması. Kullanılamaz işaretli araç bu yolla çıkarılamaz.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-[13.5px] has-[:checked]:border-blue/45 has-[:checked]:bg-blue-soft/30 ${canRepair ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <input type="radio" name="purpose" disabled={!canRepair} checked={purpose === 'repair'} onChange={() => setPurpose('repair')} className="mt-0.5 accent-[var(--ac-blue)]" />
                <span>
                  <span className="block font-medium">Onarım amaçlı taşıma</span>
                  <span className="block text-[12.5px] text-ink-2">{canRepair ? 'Hasarlı aracın çekici veya taşıyıcıyla onarım yerine götürülmesi. Araç sürülmez.' : 'Bu taşıma için ayrı yetki gerekir.'}</span>
                </span>
              </label>
            </div>
          </fieldset>
          {purpose === 'repair' && (
            <div className="mt-4 space-y-4">
              <Notice tone="alert">
                Onarım amaçlı taşıma, aracın trafikte kendi gücüyle sürülebileceği anlamına gelmez. Araç yalnız beyan edilen çekici veya taşıyıcıyla taşınır; çıkışta bunu yetkili kişi beyan eder. ACARVO taşımayı ayrıca doğrulamaz. Varışta hasar dosyası açık, kullanım engeli olduğu gibi kalır.
              </Notice>
              <Field id="t-damage" label="Bağlı hasar dosyası" required error={fields.damageFileId}>
                <Select {...describe('t-damage', fields.damageFileId)} value={damageFileId} onChange={(e) => setDamageFileId(e.target.value)}>
                  <option value="">{vehicle ? (openDamages.length ? 'Seçin' : 'Bu aracın açık hasar dosyası yok') : 'Önce aracı seçin'}</option>
                  {openDamages.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.damageNo} · {DAMAGE_TYPE_LABELS[d.damageType]} · {DAMAGE_VIEW_LABELS[d.view]}
                      {d.blocked ? ' · kullanılamaz' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="t-method" label="Taşıma yöntemi" required error={fields.transportMethod}>
                <Select {...describe('t-method', fields.transportMethod)} value={method} onChange={(e) => setMethod(e.target.value as TransportMethod)}>
                  <option value="">Seçin</option>
                  {TRANSPORT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {TRANSPORT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {purpose === 'operational' && blocked && <p className="mt-3 text-[13px] text-alert">Bu araç kullanılamaz olarak işaretli; normal transfer onaylanamaz.</p>}
        </Section>
        <Section title="Güzergâh ve plan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="t-from" label="Çıkış şubesi" required error={fields.fromBranchId} hint="Yalnız yetkili olduğunuz şubeler.">
              <Select id="t-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {inScope.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="t-to" label="Varış şubesi" required error={fields.toBranchId}>
              <Select {...describe('t-to', fields.toBranchId)} value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Seçin</option>
                {all
                  .filter((b) => b.id !== fromId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <TimeField id="t-dep" label="Planlanan çıkış" value={dep} onChange={setDep} branch={from} choice={depChoice} onChoice={setDepChoice} error={fields.plannedDepartureLocal ?? fields.plannedDepartureChoice} />
            <TimeField id="t-arr" label="Planlanan varış" value={arr} onChange={setArr} branch={to} choice={arrChoice} onChoice={setArrChoice} error={fields.plannedArrivalLocal ?? fields.plannedArrivalChoice} />
            <Field id="t-reason" label="Neden" required error={fields.reason} className="sm:col-span-2">
              <Input {...describe('t-reason', fields.reason)} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Örn. hafta sonu SAC talebi" />
            </Field>
            <Field id="t-driver" label="Görevli / sürücü notu (isteğe bağlı)" hint="Kimlik numarası veya iletişim bilgisi yazmayın." className="sm:col-span-2">
              <Input {...describe('t-driver', undefined, true)} value={driver} maxLength={300} onChange={(e) => setDriver(e.target.value)} />
            </Field>
          </div>
        </Section>
        <ErrorLine error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/araclar/transferler" className={btnGhost}>
            Vazgeç
          </Link>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending && <SpinnerGap size={16} className="animate-spin" />}
            Talep oluştur
          </button>
        </div>
      </form>
    </div>
  )
}
