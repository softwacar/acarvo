import { useState } from 'react'
import { parseAmount } from '../../core/money'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import { createTask, recordBranch, recordLabel } from '../../core/ops/tasks'
import { addVehicleDocument, arriveTransfer, createDamage, createIncident, createTransfer, departTransfer, planMaintenance, recordLocation, recordOdometer, createVehicle } from '../../core/ops/fleet'
import type { Db, Id, LinkType, TaskPriority } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, CheckF, ComboF, DateF, DateTimeF, MoneyF, type PickItem, SelectF, TextF, branchOptions, classOptions, userOptions } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useMe } from '../../ui/hooks'
import { FinanceDialog, Notice } from '../../ui/kit'
import { DOC_LABEL } from '../../core/calc/policy'
import { INCIDENT_KIND_LABEL, MAINT_TYPE_LABEL } from '../../ui/status'

export const vehicleItems = (d: Db, ids?: Id[]): PickItem[] =>
  d.vehicles
    .filter((v) => v.status !== 'sold' && (!ids || ids.includes(v.id)))
    .map((v) => ({ id: v.id, label: v.plate, sub: `${v.make} ${v.model} · ${d.branches.find((b) => b.id === v.homeBranchId)?.code}${v.source === 'external' ? ' · ' + L('dış araç', 'external') : ''}` }))

export function MaintenanceDialog({ vehicleId, damageId, onClose }: { vehicleId?: Id; damageId?: Id; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const [vid, setVid] = useState(vehicleId ?? '')
  const tz = f.zone(d.vehicles.find((v) => v.id === vid)?.homeBranchId)
  const base = d.clock.now
  const [type, setType] = useState<'periodic' | 'repair' | 'tire' | 'cleaning' | 'inspection'>(damageId ? 'repair' : 'periodic')
  const [start, setStart] = useState(zonedIso(addDaysYmd(dayOf(base, tz), 1), '09:00', tz))
  const [end, setEnd] = useState(zonedIso(addDaysYmd(dayOf(base, tz), 1), '17:00', tz))
  const [provider, setProvider] = useState('')
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const types = MAINT_TYPE_LABEL()
  return (
    <FinanceDialog
      title={L('Bakım planla', 'Plan maintenance')}
      description={L('Planlanan aralıkta araç uygunluktan düşer. Çakışan kiralama veya onaylı rezervasyon varsa neden gösterilir ve kayıt oluşmaz.', 'The vehicle leaves availability during the window. If it collides with a rental or confirmed reservation the reason is shown and nothing is created.')}
      confirm={L('Planla', 'Plan')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => planMaintenance(x, { vehicleId: vid, type, plannedStart: start, plannedEnd: end, providerId: provider || undefined, reason, damageId }), L('Bakım planlandı (demo).', 'Maintenance planned (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <ComboF id="mt-v" label={L('Araç', 'Vehicle')} required items={vehicleItems(d)} value={vid} onChange={setVid} error={fields.vehicle} />
      <SelectF id="mt-t" label={L('Tür', 'Type')} value={type} onChange={(v) => setType(v as typeof type)} options={Object.entries(types).map(([id, label]) => ({ id, label }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeF id="mt-s" label={L('Planlanan başlangıç', 'Planned start')} value={start} onChange={setStart} tz={tz} required error={fields.start} />
        <DateTimeF id="mt-e" label={L('Planlanan bitiş', 'Planned end')} value={end} onChange={setEnd} tz={tz} required error={fields.end} />
      </div>
      <SelectF id="mt-p" label={L('Servis sağlayıcı', 'Service provider')} value={provider} onChange={setProvider} placeholder={L('Seçilmedi', 'Not chosen')} options={d.providers.map((p) => ({ id: p.id, label: `${p.name} · ${p.city}` }))} />
      <AreaF id="mt-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={fields.reason} />
    </FinanceDialog>
  )
}

export function DamageDialog({ vehicleId, rentalId, onClose, onCreated }: { vehicleId?: Id; rentalId?: Id; onClose: () => void; onCreated?: (id: Id) => void }) {
  const d = useDb()
  const rental = rentalId ? d.rentals.find((r) => r.id === rentalId) : undefined
  const [vid, setVid] = useState(vehicleId ?? rental?.vehicleId ?? '')
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor')
  const [area, setArea] = useState('')
  const [desc, setDesc] = useState('')
  const [blocks, setBlocks] = useState(false)
  const [amount, setAmount] = useState('')
  const cur = rental?.currency ?? d.settings.company.baseCurrency
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Hasar bildir', 'Report damage')}
      description={L('Hasar kaydı bir bulgudur: müşteriye otomatik borç yazmaz, sorumluluk ve ücret ayrı adımlardır.', 'A damage record is a finding: it never charges the customer by itself; liability and fees are separate steps.')}
      confirm={L('Hasar dosyası aç', 'Open damage file')}
      onClose={onClose}
      onSubmit={() => {
        const minor = amount.trim() ? parseAmount(amount, cur) : null
        if (amount.trim() && minor === null) return L('Tahmin tutarı geçersiz.', 'The estimate is not a valid amount.')
        const r = runAction((x) => createDamage(x, { vehicleId: vid, rentalId, severity, area, description: desc, photos: 4, blocksVehicle: blocks, estimate: minor ? { minor, cur } : undefined }), L('Hasar dosyası açıldı (demo).', 'Damage file opened (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onCreated?.(r.value.id)
        onClose()
      }}
    >
      <ComboF id="dm-v" label={L('Araç', 'Vehicle')} required items={vehicleItems(d)} value={vid} onChange={setVid} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="dm-sev" label={L('Ağırlık', 'Severity')} value={severity} onChange={(v) => setSeverity(v as typeof severity)} options={[{ id: 'minor', label: L('Hafif', 'Minor') }, { id: 'moderate', label: L('Orta', 'Moderate') }, { id: 'severe', label: L('Ağır', 'Severe') }]} />
        <TextF id="dm-area" label={L('Bölge', 'Area')} value={area} onChange={setArea} placeholder={L('Ön tampon, sağ kapı…', 'Front bumper, right door…')} />
      </div>
      <AreaF id="dm-desc" label={L('Açıklama', 'Description')} required value={desc} onChange={setDesc} error={fields.description} />
      <MoneyF id="dm-est" label={L('Onarım tahmini (isteğe bağlı)', 'Repair estimate (optional)')} amount={amount} onAmount={setAmount} cur={cur} onCur={() => undefined} currencies={[cur]} lockCurrency hint={L('Kiralama bağlıysa kiralama para birimi kullanılır.', 'With a rental, the rental currency is used.')} />
      <CheckF id="dm-block" checked={blocks} onChange={setBlocks}>
        {L('Araç kullanılamaz: hasar engeli koy (engeli kaldırmak ikinci bir yetkili ister).', 'Vehicle unusable: set a damage block (lifting it needs a second authorised person).')}
      </CheckF>
      {rental && <Notice tone="blue">{L(`Kiralama ${rental.no} ile ilişkilendirilecek; sigorta paketi snapshot'ı hasar dosyasına kopyalanır.`, `Linked to rental ${rental.no}; its insurance snapshot is copied into the damage file.`)}</Notice>}
    </FinanceDialog>
  )
}

export function IncidentDialog({ vehicleId, rentalId, onClose, onCreated }: { vehicleId?: Id; rentalId?: Id; onClose: () => void; onCreated?: (id: Id) => void }) {
  const d = useDb()
  const [kind, setKind] = useState<'accident' | 'breakdown' | 'theft' | 'complaint' | 'safety' | 'other'>('breakdown')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [vid, setVid] = useState(vehicleId ?? '')
  const [owner, setOwner] = useState(d.session.userId)
  const [fields, setFields] = useState<Record<string, string>>({})
  const kinds = INCIDENT_KIND_LABEL()
  return (
    <FinanceDialog
      title={L('Olay kaydı aç', 'Open an incident')}
      description={L('Olay; hasar, ceza veya sigorta kaydıyla aynı şey değildir. İlişkili kayıtlar ayrıca bağlanır ve olayı çözmek onları otomatik kapatmaz.', 'An incident is not a damage, fine or insurance record. Related records are linked separately and resolving an incident never closes them.')}
      confirm={L('Olay aç', 'Open incident')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => createIncident(x, { kind, severity, title, description: desc, vehicleId: vid || undefined, rentalId, ownerId: owner }), L('Olay kaydı açıldı (demo).', 'Incident opened (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onCreated?.(r.value.id)
        onClose()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="in-k" label={L('Tür', 'Kind')} value={kind} onChange={(v) => setKind(v as typeof kind)} options={Object.entries(kinds).map(([id, label]) => ({ id, label }))} />
        <SelectF id="in-s" label={L('Şiddet', 'Severity')} value={severity} onChange={(v) => setSeverity(v as typeof severity)} options={[{ id: 'low', label: L('Düşük', 'Low') }, { id: 'medium', label: L('Orta', 'Medium') }, { id: 'high', label: L('Yüksek', 'High') }, { id: 'critical', label: L('Kritik', 'Critical') }]} />
      </div>
      <TextF id="in-t" label={L('Başlık', 'Title')} required value={title} onChange={setTitle} error={fields.title} />
      <AreaF id="in-d" label={L('Açıklama', 'Description')} required value={desc} onChange={setDesc} error={fields.description} />
      <ComboF id="in-v" label={L('İlgili araç (isteğe bağlı)', 'Related vehicle (optional)')} items={vehicleItems(d)} value={vid} onChange={setVid} />
      <SelectF id="in-o" label={L('Sorumlu personel', 'Responsible staff')} value={owner} onChange={setOwner} options={userOptions(d)} />
    </FinanceDialog>
  )
}

export function TaskDialog({ link, onClose, defaultTitle = '' }: { link?: { type: LinkType; id: Id }; onClose: () => void; defaultTitle?: string }) {
  const d = useDb()
  const f = useFmt()
  const me = useMe()
  const manage = useCan()('tasks:manage')
  const tz = f.zone()
  const [title, setTitle] = useState(defaultTitle)
  const [desc, setDesc] = useState('')
  const [prio, setPrio] = useState<TaskPriority>('normal')
  const [due, setDue] = useState(zonedIso(dayOf(d.clock.now, tz), '17:00', tz))
  const [mode, setMode] = useState<'one' | 'many' | 'pool'>(manage ? 'one' : 'one')
  const [owner, setOwner] = useState(manage ? '' : me.id)
  const [many, setMany] = useState<string[]>([])
  const [branch, setBranch] = useState(link ? (recordBranch(d, link) ?? '') : '')
  const [roles, setRoles] = useState<string[]>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  const staff = manage ? userOptions(d) : userOptions(d).filter((u) => u.id === me.id)
  return (
    <FinanceDialog
      title={L('Görev oluştur', 'Create task')}
      description={L('Görevi tamamlamak yalnız görevi değiştirir; bağlı kiralama, bakım veya hasar kaydı ayrıca işlem gerektirir.', 'Completing a task changes only the task; the linked rental, maintenance or damage record still needs its own action.')}
      confirm={L('Oluştur', 'Create')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => createTask(x, { title, description: desc, priority: prio, dueAt: due, ownerId: mode === 'one' ? owner || undefined : undefined, recipientIds: mode === 'many' ? many : [], pool: mode === 'pool', poolRoleIds: mode === 'pool' ? roles : undefined, branchId: branch || undefined, link }), L('Görev oluşturuldu (demo).', 'Task created (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      {link && (
        <Notice tone="blue">
          {L('Bağlı kayıt', 'Linked record')}: <span className="font-medium" data-testid="task-link">{recordLabel(d, link)}</span> · {L('kayıt görevden değişmez.', 'the record is not changed by the task.')}
        </Notice>
      )}
      <TextF id="tk-t" label={L('Başlık', 'Title')} required value={title} onChange={setTitle} error={fields.title} />
      <AreaF id="tk-d" label={L('Açıklama', 'Description')} value={desc} onChange={setDesc} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="tk-p" label={L('Öncelik', 'Priority')} value={prio} onChange={(v) => setPrio(v as TaskPriority)} options={[{ id: 'urgent', label: L('Acil', 'Urgent') }, { id: 'high', label: L('Yüksek', 'High') }, { id: 'normal', label: L('Normal', 'Normal') }]} />
        <DateTimeF id="tk-due" label={L('Son tarih', 'Due')} value={due} onChange={setDue} tz={tz} error={fields.due} />
      </div>
      <SelectF id="tk-m" label={L('Kime', 'Assign to')} value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ id: 'one', label: manage ? L('Tek personel (sorumlu)', 'One person (owner)') : L('Kendime', 'Myself') }, ...(manage ? [{ id: 'many', label: L('Birden çok personele duyur', 'Announce to several people') }] : []), { id: 'pool', label: L('Açık havuz: uygun personel üstlenir', 'Open pool: eligible staff claim it') }]} />
      {mode === 'one' && <SelectF id="tk-o" label={L('Sorumlu', 'Owner')} value={owner} onChange={setOwner} placeholder={L('Seçin', 'Choose')} options={staff} error={fields.owner} />}
      {mode === 'many' && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13.5px] font-medium">{L('Alıcılar', 'Recipients')}</legend>
          {staff.map((s) => (
            <CheckF key={s.id} id={`tk-r-${s.id}`} checked={many.includes(s.id)} onChange={(v) => setMany(v ? [...many, s.id] : many.filter((x) => x !== s.id))}>
              {s.label}
            </CheckF>
          ))}
        </fieldset>
      )}
      <SelectF id="tk-b" label={L('Şube (isteğe bağlı)', 'Branch (optional)')} value={branch} onChange={setBranch} placeholder={L('Tüm şubeler', 'All branches')} options={branchOptions(d)} error={fields.branch} hint={mode === 'pool' ? L('Havuzdaki görevi yalnız bu şubenin kapsamındaki personel görür ve üstlenir.', 'Only staff in this branch’s scope see and claim a pool task.') : undefined} />
      {mode === 'pool' && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13.5px] font-medium">{L('Rol filtresi (boş = her uygun rol)', 'Role filter (empty = every eligible role)')}</legend>
          <div className="flex flex-wrap gap-x-5">
            {d.roles.map((r) => (
              <CheckF key={r.id} id={`tk-role-${r.id}`} checked={roles.includes(r.id)} onChange={(v) => setRoles(v ? [...roles, r.id] : roles.filter((x) => x !== r.id))}>
                {r.name}
              </CheckF>
            ))}
          </div>
        </fieldset>
      )}
    </FinanceDialog>
  )
}

export function TransferDialog({ vehicleId, onClose }: { vehicleId: Id; onClose: () => void }) {
  const d = useDb()
  const v = d.vehicles.find((x) => x.id === vehicleId)!
  const f = useFmt()
  const [to, setTo] = useState('')
  const [at, setAt] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, f.zone()), 1), '08:00', f.zone()))
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={`${L('Transfer talebi', 'Transfer request')} · ${v.plate}`}
      description={L('Transfer fiziksel konumu değiştirir; aracın ana şubesi değişmez.', 'A transfer changes the physical location; the vehicle\'s home branch does not change.')}
      confirm={L('Talep oluştur', 'Create request')}
      onClose={onClose}
      onSubmit={() => {
        if (!to) {
          setFields({ to: L('Hedef şube seçin', 'Choose a destination') })
          return L('Hedef şubeyi seçin.', 'Choose the destination branch.')
        }
        const r = runAction((x) => createTransfer(x, { vehicleId, toBranchId: to, plannedAt: at, reason }), L('Transfer talebi oluşturuldu (demo).', 'Transfer requested (demo).'))
        if (!r.ok) return r.error
        onClose()
      }}
    >
      <SelectF id="tr-to" label={L('Hedef şube', 'Destination branch')} required value={to} onChange={setTo} placeholder={L('Seçin', 'Choose')} options={branchOptions(d).filter((b) => b.id !== v.location)} error={fields.to} />
      <DateTimeF id="tr-at" label={L('Planlanan çıkış', 'Planned departure')} value={at} onChange={setAt} tz={f.zone()} />
      <TextF id="tr-r" label={L('Gerekçe', 'Reason')} value={reason} onChange={setReason} />
    </FinanceDialog>
  )
}

export function TransferActions({ id }: { id: Id }) {
  const d = useDb()
  const t = d.transfers.find((x) => x.id === id)
  if (!t) return null
  return (
    <span className="inline-flex gap-1.5">
      {t.status === 'requested' && (
        <button type="button" className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium hover:bg-ground" onClick={() => runAction((x) => departTransfer(x, id), L('Transfer yola çıktı (demo).', 'Transfer departed (demo).'))}>
          {L('Yola çıkar', 'Depart')}
        </button>
      )}
      {t.status === 'in_transit' && (
        <button type="button" className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium hover:bg-ground" onClick={() => runAction((x) => arriveTransfer(x, id), L('Varışta teslim alındı (demo).', 'Received at destination (demo).'))}>
          {L('Varışta teslim al', 'Receive')}
        </button>
      )}
    </span>
  )
}

export function VehicleDocDialog({ vehicleId, onClose }: { vehicleId: Id; onClose: () => void }) {
  const [kind, setKind] = useState('insurance')
  const [name, setName] = useState('')
  const [until, setUntil] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Araç belgesi ekle', 'Add vehicle document')}
      description={L('Demo belgesi: dosya içeriği alınmaz, yalnız tür, ad ve geçerlilik tarihi kaydedilir. Belgenin sahibi bu araç kaydıdır; Belge Merkezi yalnız dizin gösterir.', 'Demo document: no file content is taken, only type, name and validity. The vehicle record owns it; the Document Center only indexes it.')}
      confirm={L('Ekle', 'Add')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => addVehicleDocument(x, vehicleId, kind, name, until), L('Belge eklendi (demo).', 'Document added (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <SelectF id="vd-k" label={L('Tür', 'Type')} value={kind} onChange={setKind} options={['registration', 'insurance', 'inspection'].map((k) => ({ id: k, label: DOC_LABEL[k]! }))} />
      <TextF id="vd-n" label={L('Belge adı', 'Name')} required value={name} onChange={setName} error={fields.name} />
      <DateF id="vd-u" label={L('Geçerlilik sonu', 'Valid until')} value={until} onChange={setUntil} />
    </FinanceDialog>
  )
}

export function OdometerDialog({ vehicleId, onClose }: { vehicleId: Id; onClose: () => void }) {
  const d = useDb()
  const v = d.vehicles.find((x) => x.id === vehicleId)!
  const [km, setKm] = useState(String(v.odometerKm))
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={`${L('Kilometre kaydı', 'Odometer reading')} · ${v.plate}`}
      description={L('Tek kilometre gerçeği: değer geri gidemez. Hata düzeltmesi gerekçeli düzeltme kaydıyla yapılır.', 'One odometer truth: the value cannot go backwards. Mistakes are corrected with a reasoned correction record.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => recordOdometer(x, vehicleId, Number(km)), L('Kilometre kaydedildi (demo).', 'Odometer saved (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <TextF id="od-km" type="number" label={L('Kilometre', 'Kilometres')} required value={km} onChange={setKm} error={fields.km} hint={`${L('Mevcut', 'Current')}: ${v.odometerKm.toLocaleString('tr')} km`} />
    </FinanceDialog>
  )
}

export function LocationDialog({ vehicleId, onClose }: { vehicleId: Id; onClose: () => void }) {
  const d = useDb()
  const v = d.vehicles.find((x) => x.id === vehicleId)!
  const [loc, setLoc] = useState(v.location)
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={`${L('Fiziksel konum', 'Physical location')} · ${v.plate}`}
      description={L('Fiziksel konum, ana şubeden ayrıdır; konumu değiştirmek ana şubeyi değiştirmez.', 'The physical location is separate from the home branch; changing it does not change the home branch.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => recordLocation(x, vehicleId, loc, reason), L('Konum kaydedildi (demo).', 'Location saved (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <SelectF id="lc-l" label={L('Konum', 'Location')} value={loc} onChange={setLoc} options={[...branchOptions(d), { id: 'service', label: L('Serviste', 'At service') }, { id: 'transit', label: L('Yolda', 'In transit') }]} />
      <TextF id="lc-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={fields.reason} />
    </FinanceDialog>
  )
}

export function VehicleFormFields({ onDone }: { onDone: (id: Id) => void }) {
  const d = useDb()
  const [f, setF] = useState({ plate: '', make: '', model: '', year: String(new Date().getFullYear()), color: '', classId: d.classes[0]!.id, homeBranchId: d.branches[0]!.id, odometerKm: '0', fuelType: 'petrol' as const, vin: '' })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const r = runAction((x) => createVehicle(x, { ...f, year: Number(f.year), odometerKm: Number(f.odometerKm) }), L('Araç filoya eklendi (demo).', 'Vehicle added to the fleet (demo).'))
        if (!r.ok) {
          setFields(r.fields)
          setError(r.error)
          return
        }
        onDone(r.value.id)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="vf-plate" label={L('Plaka', 'Plate')} required value={f.plate} onChange={(v) => set('plate', v)} error={fields.plate} />
        <TextF id="vf-vin" label={L('Şasi no (VIN)', 'VIN')} value={f.vin} onChange={(v) => set('vin', v)} />
        <TextF id="vf-make" label={L('Marka', 'Make')} required value={f.make} onChange={(v) => set('make', v)} error={fields.make} />
        <TextF id="vf-model" label={L('Model', 'Model')} required value={f.model} onChange={(v) => set('model', v)} error={fields.model} />
        <TextF id="vf-year" type="number" label={L('Model yılı', 'Year')} required value={f.year} onChange={(v) => set('year', v)} error={fields.year} />
        <TextF id="vf-color" label={L('Renk', 'Colour')} value={f.color} onChange={(v) => set('color', v)} />
        <SelectF id="vf-class" label={L('Sınıf', 'Class')} value={f.classId} onChange={(v) => set('classId', v)} options={classOptions(d)} />
        <SelectF id="vf-branch" label={L('Ana şube', 'Home branch')} value={f.homeBranchId} onChange={(v) => set('homeBranchId', v)} options={branchOptions(d)} hint={L('Ana şube, fiziksel konumdan ayrıdır.', 'The home branch is separate from the physical location.')} />
        <TextF id="vf-km" type="number" label={L('Başlangıç kilometresi', 'Initial odometer')} required value={f.odometerKm} onChange={(v) => set('odometerKm', v)} error={fields.odometerKm} />
        <SelectF id="vf-fuel" label={L('Yakıt türü', 'Fuel type')} value={f.fuelType} onChange={(v) => set('fuelType', v as typeof f.fuelType)} options={[{ id: 'petrol', label: L('Benzin', 'Petrol') }, { id: 'diesel', label: L('Dizel', 'Diesel') }, { id: 'hybrid', label: L('Hibrit', 'Hybrid') }, { id: 'electric', label: L('Elektrik', 'Electric') }]} />
      </div>
      {error && <Notice tone="alert">{error}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink">
          {L('Aracı kaydet', 'Save vehicle')}
        </button>
      </div>
      <p className="text-[12.5px] text-ink-3">{L('Yeni araç hazırlık kontrolü bekler; hiçbir finansal kayıt oluşmaz.', 'A new vehicle awaits its readiness check; no financial record is created.')}</p>
    </form>
  )
}
