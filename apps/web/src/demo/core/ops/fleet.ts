import { B } from '../../i18n'
import { checkVehicleAvailable, readinessOf } from '../calc/availability'
import { addHistory, fail, hasPerm, logEvent, meOf, need, nextId, nextNo, nowOf, notify, scopeBranches, userName } from '../helpers'
import { fmt } from '../money'
import { DAY } from '../time'
import type { Cur, Damage, Db, Expense, Fine, FuelLevel, Id, Incident, Iso, LinkType, Maintenance, Money, Task, TaskPriority, Transfer, Vehicle } from '../types'
import { postCharge } from './finance'

// Fleet and operations: maintenance, damage, incidents, fines, tasks, transfers, vehicle records.
// A finished maintenance does not make a vehicle Ready; solving an incident does not close its damage or fine;
// completing a task never completes the record it points to.

const vehicleOf = (d: Db, id: Id) => {
  const v = d.vehicles.find((x) => x.id === id)
  if (!v) fail(id ? B('Araç bulunamadı.', 'Vehicle not found.') : B('Araç seçin.', 'Choose a vehicle.'), { vehicle: id ? B('Araç bulunamadı', 'Vehicle not found') : B('Araç seçin', 'Choose a vehicle') })
  return v!
}

// --------------------------------------------------------------------------- vehicles

export interface VehicleInput {
  plate: string
  make: string
  model: string
  year: number
  color: string
  classId: Id
  homeBranchId: Id
  odometerKm: number
  fuelType: Vehicle['fuelType']
  vin: string
}

export function createVehicle(d: Db, input: VehicleInput): Vehicle {
  need(d, 'vehicles:manage', B('Araç ekleme', 'Adding a vehicle'))
  const plate = input.plate.trim().toUpperCase()
  const fields: Record<string, string> = {}
  if (plate.length < 4) fields.plate = B('Geçerli bir plaka girin', 'Enter a valid plate')
  if (d.vehicles.some((v) => v.plate === plate)) fields.plate = B('Bu plaka zaten kayıtlı', 'This plate is already registered')
  if (!input.make.trim()) fields.make = B('Marka gerekli', 'Make is required')
  if (!input.model.trim()) fields.model = B('Model gerekli', 'Model is required')
  if (!(input.year >= 1990 && input.year <= 2100)) fields.year = B('Geçerli bir yıl girin', 'Enter a valid year')
  if (!(input.odometerKm >= 0)) fields.odometerKm = B('Kilometre geçersiz', 'Invalid odometer')
  if (Object.keys(fields).length) fail(B('Formda eksik veya geçersiz alanlar var.', 'The form has missing or invalid fields.'), fields)
  const v: Vehicle = {
    id: nextId(d, 'v'),
    plate,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year,
    color: input.color.trim() || '—',
    classId: input.classId,
    homeBranchId: input.homeBranchId,
    location: input.homeBranchId,
    status: 'active',
    odometerKm: input.odometerKm,
    fuelType: input.fuelType,
    fuel: 'full',
    vin: input.vin.trim(),
    source: 'internal',
    readiness: { clean: false, fuelOk: true, checkedAt: null, checkedBy: null, note: B('Yeni araç: hazırlık kontrolü bekliyor', 'New vehicle: awaiting a readiness check') },
    tire: { type: 'all_season', mountedAt: nowOf(d), treadMm: 8 },
    service: { intervalKm: 15000, lastKm: input.odometerKm, lastAt: nowOf(d) },
    keys: { count: 2, holder: B('Şube anahtar dolabı', 'Branch key cabinet') },
  }
  d.vehicles.push(v)
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: v.odometerKm, at: nowOf(d), source: 'initial', by: meOf(d).id })
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: B('Filoya giriş', 'Added to the fleet') })
  logEvent(d, { module: 'vehicles', type: 'VehicleCreated', sourceType: 'vehicle', sourceId: v.id, summary: `${v.plate} filoya eklendi`, branchId: v.homeBranchId })
  return v
}

export function updateVehicle(d: Db, id: Id, patch: Partial<Pick<Vehicle, 'color' | 'homeBranchId' | 'vin' | 'status'>>): Vehicle {
  need(d, 'vehicles:manage', B('Araç düzenleme', 'Editing a vehicle'))
  const v = vehicleOf(d, id)
  const before = `${v.homeBranchId}/${v.status}`
  if (patch.status === 'out_of_service' && d.rentals.some((r) => r.vehicleId === id && r.status === 'delivered')) fail(B('Araç şu an müşteride; hizmet dışı yapılamaz.', 'The vehicle is with a customer right now; it cannot be put out of service.'))
  Object.assign(v, patch)
  logEvent(d, { module: 'vehicles', type: 'VehicleUpdated', sourceType: 'vehicle', sourceId: id, summary: B(`${v.plate} güncellendi`, `${v.plate} updated`), before, after: `${v.homeBranchId}/${v.status}` })
  return v
}

export function recordOdometer(d: Db, id: Id, km: number, source: 'manual' | 'maintenance' = 'manual'): void {
  need(d, 'vehicles:manage', B('Kilometre girişi', 'Odometer entry'))
  const v = vehicleOf(d, id)
  if (!Number.isInteger(km) || km < v.odometerKm) fail(B(`Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz. Düzeltme gerekiyorsa gerekçeli düzeltme kaydı açın.`, `The odometer cannot be below the current reading (${v.odometerKm}). If a correction is needed, open a correction record with a reason.`), { km: B('Geçersiz kilometre', 'Invalid odometer') })
  v.odometerKm = km
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: id, km, at: nowOf(d), source, by: meOf(d).id })
  logEvent(d, { module: 'vehicles', type: 'OdometerRecorded', sourceType: 'vehicle', sourceId: id, summary: `${v.plate} · ${km} km` })
}

export function recordLocation(d: Db, id: Id, location: string, reason: string): void {
  need(d, 'vehicles:manage', B('Konum güncelleme', 'Location update'))
  const v = vehicleOf(d, id)
  if (reason.trim().length < 3) fail(B('Konum güncelleme gerekçesi yazın.', 'Enter a reason for the location update.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  v.location = location
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: id, at: nowOf(d), location, reason })
  logEvent(d, { module: 'vehicles', type: 'LocationRecorded', sourceType: 'vehicle', sourceId: id, summary: B(`${v.plate} fiziksel konum: ${location}. Ana şube değişmedi.`, `${v.plate} physical location: ${location}. The home branch did not change.`), reason })
}

export function addVehicleDocument(d: Db, vehicleId: Id, kind: string, name: string, validUntil: string): void {
  need(d, 'documents:manage', B('Belge ekleme', 'Adding a document'))
  const v = vehicleOf(d, vehicleId)
  if (!name.trim()) fail(B('Belge adı gerekli.', 'A document name is required.'), { name: B('Belge adı gerekli', 'Document name is required') })
  const version = d.documents.filter((x) => x.ownerType === 'vehicle' && x.ownerId === vehicleId && x.kind === kind).length + 1
  d.documents.push({ id: nextId(d, 'doc'), ownerType: 'vehicle', ownerId: vehicleId, kind, name, version, validUntil: validUntil || undefined, placeholder: true, uploadedAt: nowOf(d), uploadedBy: meOf(d).id })
  logEvent(d, { module: 'documents', type: 'DocumentAdded', sourceType: 'vehicle', sourceId: vehicleId, summary: B(`${v.plate} · ${kind} v${version} (demo belge, dosya içermez)`, `${v.plate} · ${kind} v${version} (demo document, holds no file)`) })
}

// --------------------------------------------------------------------------- maintenance

export interface MaintenanceInput {
  vehicleId: Id
  type: Maintenance['type']
  plannedStart: Iso
  plannedEnd: Iso
  providerId?: Id
  reason: string
  damageId?: Id
}

export function planMaintenance(d: Db, input: MaintenanceInput): Maintenance {
  need(d, 'maintenance:manage', B('Bakım planlama', 'Planning maintenance'))
  const v = vehicleOf(d, input.vehicleId)
  if (Date.parse(input.plannedEnd) <= Date.parse(input.plannedStart)) fail(B('Bitiş, başlangıçtan sonra olmalı.', 'The end must be after the start.'), { end: B('Bitiş, başlangıçtan sonra olmalı', 'The end must be after the start') })
  if (input.reason.trim().length < 3) fail(B('Bakım gerekçesi yazın.', 'Enter a reason for the maintenance.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  const chk = checkVehicleAvailable(d, v, input.plannedStart, input.plannedEnd, nowOf(d))
  // A maintenance window must not collide with rentals or confirmed reservations of the same vehicle.
  const blocking = chk.conflicts.filter((c) => c.kind === 'rental' || c.kind === 'reservation' || c.kind === 'maintenance')
  if (blocking.length) fail(B(`${v.plate} bu aralıkta bakıma ayrılamaz: ${blocking.map((c) => c.label).join(', ')} ile çakışıyor. Önce çakışan kaydı çözün.`, `${v.plate} cannot be set aside for maintenance in this window: it conflicts with ${blocking.map((c) => c.label).join(', ')}. Resolve the conflicting record first.`), { start: B('Araç bu aralıkta müsait değil', 'The vehicle is not available in this window') }, 'CONFLICT')
  const m: Maintenance = { id: nextId(d, 'mn'), no: nextNo(d, 'B'), vehicleId: input.vehicleId, type: input.type, status: 'planned', plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, providerId: input.providerId, reason: input.reason, cost: null, damageId: input.damageId, history: [] }
  d.maintenance.push(m)
  addHistory(d, m.history, B('Planlandı', 'Planned'), B(`${v.plate} için bakım planlandı: araç bu aralıkta uygunluktan düşer.`, `Maintenance planned for ${v.plate}: the vehicle leaves availability in this window.`))
  logEvent(d, { module: 'maintenance', type: 'MaintenancePlanned', sourceType: 'maintenance', sourceId: m.id, summary: `${m.no} · ${v.plate}`, branchId: v.homeBranchId })
  return m
}

export function startMaintenance(d: Db, id: Id): void {
  need(d, 'maintenance:manage', 'Servise alma')
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || m.status !== 'planned') fail(B('Yalnız planlı bakım servise alınır.', 'Only planned maintenance can be started.'))
  const v = vehicleOf(d, m!.vehicleId)
  if (d.rentals.some((r) => r.vehicleId === v.id && r.status === 'delivered' && Date.parse(r.actualPickupAt ?? r.plannedPickupAt) <= Date.parse(nowOf(d)))) fail(B('Araç şu an müşteride; servise alınamaz.', 'The vehicle is with a customer right now; it cannot be taken into service.'))
  m!.status = 'in_progress'
  m!.actualStart = nowOf(d)
  v.location = d.providers.find((p) => p.id === m!.providerId) ? 'service' : v.location
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: B(`Bakım ${m!.no}`, `Maintenance ${m!.no}`), refType: 'maintenance', refId: m!.id })
  addHistory(d, m!.history, B('Servise alındı', 'Taken into service'), B(`${v.plate} servise alındı.`, `${v.plate} was taken into service.`))
  logEvent(d, { module: 'maintenance', type: 'MaintenanceStarted', sourceType: 'maintenance', sourceId: id, summary: B(`${m!.no} başladı`, `${m!.no} started`), before: 'planned', after: 'in_progress' })
}

export function completeMaintenance(d: Db, id: Id, input: { cost: Money | null; km?: number; tireTo?: 'summer' | 'winter' | 'all_season'; treadMm?: number }): void {
  need(d, 'maintenance:manage', B('Bakım tamamlama', 'Completing maintenance'))
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || m.status !== 'in_progress') fail(B('Yalnız devam eden bakım tamamlanır.', 'Only maintenance in progress can be completed.'))
  const v = vehicleOf(d, m!.vehicleId)
  if (input.km !== undefined) {
    if (input.km < v.odometerKm) fail(B(`Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz.`, `The odometer cannot be below the current reading (${v.odometerKm}).`), { km: B('Geçersiz kilometre', 'Invalid odometer') })
    v.odometerKm = input.km
    d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: input.km, at: nowOf(d), source: 'maintenance', refType: 'maintenance', refId: id, by: meOf(d).id })
  }
  m!.status = 'completed'
  m!.actualEnd = nowOf(d)
  m!.cost = input.cost
  m!.km = input.km
  if (m!.type === 'periodic' && input.km !== undefined) v.service = { ...v.service, lastKm: input.km, lastAt: nowOf(d) }
  if (m!.type === 'tire' && input.tireTo) {
    v.tire = { type: input.tireTo, mountedAt: nowOf(d), treadMm: input.treadMm ?? v.tire.treadMm }
    m!.tireSwap = { to: input.tireTo, treadMm: v.tire.treadMm }
  }
  v.location = v.homeBranchId
  // Service finished is not "Ready": the readiness check (clean, fuel, docs) is a separate step.
  v.readiness = { ...v.readiness, clean: false, checkedAt: null, checkedBy: null, note: B('Bakım sonrası hazırlık kontrolü bekliyor', 'Awaiting a readiness check after maintenance') }
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: B(`Bakım tamamlandı ${m!.no}`, `Maintenance completed ${m!.no}`), refType: 'maintenance', refId: id })
  addHistory(d, m!.history, B('Tamamlandı', 'Completed'), B(`Bakım tamamlandı${input.cost ? ` · ${fmt(input.cost.minor, input.cost.cur)}` : ''}. Araç otomatik hazır sayılmaz; hazırlık kontrolü gerekir.`, `Maintenance completed${input.cost ? ` · ${fmt(input.cost.minor, input.cost.cur)}` : ''}. The vehicle is not automatically ready; a readiness check is needed.`))
  // The service cost lives in the Maintenance record; the expense row is linked to it and its amount is locked.
  if (input.cost && input.cost.minor > 0 && !d.expenses.some((e) => e.sourceType === 'maintenance' && e.sourceId === id)) {
    d.expenses.push({ id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: 'Bakım ve servis', vendor: d.providers.find((p) => p.id === m!.providerId)?.name ?? 'Servis', branchId: v.homeBranchId, date: nowOf(d).slice(0, 10), amount: input.cost, status: 'posted', sourceType: 'maintenance', sourceId: id, note: B(`${m!.no} bakım kaydından`, `from maintenance record ${m!.no}`), createdBy: meOf(d).id })
  }
  logEvent(d, { module: 'maintenance', type: 'MaintenanceCompleted', sourceType: 'maintenance', sourceId: id, summary: B(`${m!.no} tamamlandı`, `${m!.no} completed`), before: 'in_progress', after: 'completed', cur: input.cost?.cur, minor: input.cost?.minor })
}

export function cancelMaintenance(d: Db, id: Id, reason: string): void {
  need(d, 'maintenance:manage', B('Bakım iptali', 'Cancelling maintenance'))
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || (m.status !== 'planned' && m.status !== 'in_progress')) fail(B('Bu bakım iptal edilemez.', 'This maintenance cannot be cancelled.'))
  if (reason.trim().length < 3) fail(B('İptal gerekçesi yazın.', 'Enter a reason for the cancellation.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  m!.status = 'cancelled'
  addHistory(d, m!.history, B('İptal edildi', 'Cancelled'), reason)
  logEvent(d, { module: 'maintenance', type: 'MaintenanceCancelled', sourceType: 'maintenance', sourceId: id, summary: `${m!.no} iptal`, reason })
}

// --------------------------------------------------------------------------- damage

export function createDamage(d: Db, input: { vehicleId: Id; rentalId?: Id; severity: Damage['severity']; area: string; description: string; photos: number; blocksVehicle: boolean; estimate?: Money }): Damage {
  need(d, 'damages:manage', B('Hasar bildirimi', 'Damage report'))
  const v = vehicleOf(d, input.vehicleId)
  if (input.description.trim().length < 5) fail(B('Hasar açıklamasını yazın.', 'Describe the damage.'), { description: 'En az 5 karakter' })
  const rental = input.rentalId ? d.rentals.find((r) => r.id === input.rentalId) : undefined
  const dm: Damage = {
    id: nextId(d, 'dm'),
    no: nextNo(d, 'H'),
    vehicleId: v.id,
    rentalId: input.rentalId,
    status: 'reported',
    severity: input.severity,
    area: input.area,
    description: input.description,
    photos: input.photos,
    blocksVehicle: input.blocksVehicle,
    estimate: input.estimate ?? null,
    insurance: rental?.coverageSnapshot ? { name: rental.coverageSnapshot.name, deductible: rental.coverageSnapshot.deductible } : undefined,
    liability: 'undetermined',
    createdAt: nowOf(d),
    createdBy: meOf(d).id,
    history: [],
  }
  d.damages.push(dm)
  addHistory(d, dm.history, 'Bildirildi', B('Hasar kaydı açıldı; bu bir bulgudur, müşteriye borç yazmaz.', 'Damage record opened; it is a finding and does not charge the customer.'))
  logEvent(d, { module: 'damages', type: 'DamageReported', sourceType: 'damage', sourceId: dm.id, summary: `${dm.no} · ${v.plate} · ${input.severity}`, branchId: v.homeBranchId })
  return dm
}

export function setDamageStatus(d: Db, id: Id, status: 'investigating' | 'closed', note = ''): void {
  need(d, 'damages:manage', B('Hasar durumu', 'Damage status'))
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail(B('Hasar bulunamadı.', 'Damage record not found.'))
  if (status === 'closed') {
    if (dm!.liability === 'undetermined') fail(B('Kapatmadan önce sorumluluk belirlenmeli.', 'Liability must be set before closing.'))
    if (dm!.blocksVehicle) fail(B('Araç engeli kalkmadan hasar kapatılamaz (engeli kaldırmak ikinci bir yetkili ister).', 'The damage cannot be closed while the vehicle block is in place (lifting the block needs a second authorised person).'))
  }
  dm!.status = status
  addHistory(d, dm!.history, status === 'closed' ? B('Kapatıldı', 'Closed') : B('İnceleniyor', 'Under investigation'), note || (status === 'closed' ? B('Hasar kapatıldı.', 'Damage file closed.') : B('İnceleme başladı.', 'Investigation started.')))
  logEvent(d, { module: 'damages', type: status === 'closed' ? 'DamageClosed' : 'DamageInvestigating', sourceType: 'damage', sourceId: id, summary: `${dm!.no} ${status}` })
}

/** Liability and the explainable money split: deductible to the renter, the rest expected from the insurer. */
export function setDamageLiability(d: Db, id: Id, liability: Damage['liability'], estimate: Money | null): void {
  need(d, 'damages:manage', 'Sorumluluk belirleme')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail(B('Hasar bulunamadı.', 'Damage record not found.'))
  if (liability === 'undetermined') fail(B('Bir sorumluluk seçin.', 'Choose a liability.'))
  if (liability !== 'company' && (!estimate || estimate.minor <= 0)) fail(B('Sorumluluk için onarım tahmini girin.', 'Enter a repair estimate for the liability.'), { estimate: B('Tahmin zorunlu', 'An estimate is required') })
  dm!.liability = liability
  dm!.estimate = estimate
  dm!.status = 'liability_set'
  addHistory(d, dm!.history, 'Sorumluluk belirlendi', liability === 'customer' ? B('Müşteri sorumlu (sigorta muafiyeti kadar).', 'The customer is liable (up to the insurance excess).') : liability === 'insurer' ? B('Sigorta/üçüncü taraf sorumlu.', 'Insurer / third party is liable.') : B('Şirket üstleniyor.', 'The company bears it.'))
  logEvent(d, { module: 'damages', type: 'LiabilitySet', sourceType: 'damage', sourceId: id, summary: `${dm!.no} sorumluluk: ${liability}`, cur: estimate?.cur, minor: estimate?.minor })
}

/** Amount the renter owes for a damage under the coverage snapshot (the deductible; the full estimate without coverage). */
export function customerShare(dm: Damage): Money | null {
  if (dm.liability !== 'customer' || !dm.estimate) return null
  if (dm.insurance) return { minor: Math.min(dm.estimate.minor, dm.insurance.deductible.minor), cur: dm.estimate.cur }
  return dm.estimate
}

/** One customer charge per damage (idempotent). The insurer recovery is a separate movement, not this charge. */
export function chargeDamageToCustomer(d: Db, id: Id): void {
  need(d, 'finance:record', B('Hasar ücreti', 'Damage charge'))
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail(B('Hasar bulunamadı.', 'Damage record not found.'))
  if (!dm!.rentalId) fail(B('Hasar bir kiralamaya bağlı değil.', 'The damage is not linked to a rental.'))
  const share = customerShare(dm!)
  if (!share) fail(B('Müşteri sorumluluğu belirlenmeden ücret yazılamaz.', 'A charge cannot be posted before customer liability is set.'))
  const rental = d.rentals.find((r) => r.id === dm!.rentalId)!
  if (share!.cur !== rental.currency) fail(B('Hasar tahmini kiralama para biriminde olmalı (kur dönüşümü yapılmaz).', 'The damage estimate must be in the rental currency (no conversion is made).'))
  if (dm!.chargeId) fail(B('Bu hasar için müşteri kalemi zaten yazıldı (tek kalem).', 'A customer charge was already posted for this damage (single charge).'))
  const c = postCharge(d, { rentalId: rental.id, kind: 'damage', label: B(`Hasar katılımı ${dm!.no}`, `Damage contribution ${dm!.no}`), amountMinor: share!.minor, key: `${rental.id}:damage:${dm!.id}`, sourceType: 'damage', sourceId: dm!.id })
  dm!.chargeId = c.id
  addHistory(d, dm!.history, B('Müşteri kalemi', 'Customer charge'), B(`${fmt(share!.minor, share!.cur)} hesap kalemi yazıldı (${c.no}).`, `${fmt(share!.minor, share!.cur)} charge posted (${c.no}).`))
}

export function recordInsurerRecovery(d: Db, id: Id, insurerRef: string, amount: Money, received: boolean): void {
  need(d, 'finance:record', B('Sigorta tahsilatı', 'Insurer collection'))
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail(B('Hasar bulunamadı.', 'Damage record not found.'))
  if (!insurerRef.trim()) fail(B('Sigorta dosya referansını girin.', 'Enter the insurer file reference.'), { ref: B('Referans zorunlu', 'A reference is required') })
  dm!.recovery = { insurerRef, amount, receivedAt: received ? nowOf(d) : undefined }
  addHistory(d, dm!.history, B('Sigorta geri ödemesi', 'Insurer recovery'), B(`${fmt(amount.minor, amount.cur)} · ${received ? B('alındı', 'received') : 'bekleniyor'} · ayrı finans hareketi, müşteri kalemi değil.`, `${fmt(amount.minor, amount.cur)} · ${received ? B('alındı', 'received') : 'bekleniyor'} · a separate finance movement, not a customer charge.`))
  logEvent(d, { module: 'finance', type: received ? 'InsurerRecoveryReceived' : 'InsurerRecoveryExpected', sourceType: 'damage', sourceId: id, summary: B(`${dm!.no} sigorta geri ödemesi`, `${dm!.no} insurer recovery`), cur: amount.cur, minor: amount.minor })
}

export function linkRepair(d: Db, id: Id, plannedStart: Iso, plannedEnd: Iso, providerId?: Id): Maintenance {
  need(d, 'maintenance:manage', B('Onarım planlama', 'Planning a repair'))
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail(B('Hasar bulunamadı.', 'Damage record not found.'))
  const m = planMaintenance(d, { vehicleId: dm!.vehicleId, type: 'repair', plannedStart, plannedEnd, providerId, reason: B(`Hasar onarımı ${dm!.no}`, `Damage repair ${dm!.no}`), damageId: id })
  dm!.repairMaintenanceId = m.id
  addHistory(d, dm!.history, B('Onarım bağlandı', 'Repair linked'), B(`${m.no} bakım kaydı bağlandı. Onarım maliyeti bakım kaydından gelir.`, `Maintenance record ${m.no} linked. The repair cost comes from the maintenance record.`))
  return m
}

export function unblockVehicle(d: Db, id: Id): void {
  need(d, 'damages:unblock', B('Engel kaldırma', 'Lifting a block'))
  const dm = d.damages.find((x) => x.id === id)
  if (!dm || !dm.blocksVehicle) fail(B('Bu hasarda açık engel yok.', 'This damage has no open block.'))
  // Four eyes: the person who reported the damage cannot lift its block.
  if (dm!.createdBy === meOf(d).id) fail(B('Hasarı bildiren kişi engeli kaldıramaz: ikinci bir yetkili gerekir (dört göz).', 'The person who reported the damage cannot lift the block: a second authorised person is needed (four eyes).'), {}, 'FOUR_EYES')
  dm!.blocksVehicle = false
  addHistory(d, dm!.history, B('Engel kaldırıldı', 'Block lifted'), B('Araç engeli kaldırıldı. Araç başka kayıtlar nedeniyle yine uygun olmayabilir; hazırlık ayrıca kontrol edilir.', 'The vehicle block was lifted. The vehicle may still be unavailable because of other records; readiness is checked separately.'))
  logEvent(d, { module: 'damages', type: 'BlockLifted', sourceType: 'damage', sourceId: id, summary: B(`${dm!.no} engeli kaldırıldı`, `${dm!.no} block lifted`) })
}

// --------------------------------------------------------------------------- incidents

export function createIncident(d: Db, input: { kind: Incident['kind']; severity: Incident['severity']; title: string; description: string; vehicleId?: Id; rentalId?: Id; ownerId: Id; links?: Incident['links'] }): Incident {
  need(d, 'incidents:manage', B('Olay kaydı', 'Incident record'))
  if (input.title.trim().length < 3) fail(B('Olay başlığı yazın.', 'Enter an incident title.'), { title: B('Başlık zorunlu', 'A title is required') })
  if (input.description.trim().length < 5) fail(B('Olay açıklaması yazın.', 'Describe the incident.'), { description: 'En az 5 karakter' })
  const inc: Incident = { id: nextId(d, 'inc'), no: nextNo(d, 'O'), kind: input.kind, severity: input.severity, status: 'open', title: input.title, description: input.description, vehicleId: input.vehicleId, rentalId: input.rentalId, ownerId: input.ownerId, evidence: [], links: input.links ?? [], createdAt: nowOf(d), createdBy: meOf(d).id, history: [] }
  if (input.vehicleId) inc.links.push({ type: 'vehicle', id: input.vehicleId })
  if (input.rentalId) inc.links.push({ type: 'rental', id: input.rentalId })
  d.incidents.push(inc)
  addHistory(d, inc.history, B('Açıldı', 'Opened'), B(`Olay açıldı; sorumlu: ${userName(d, input.ownerId)}.`, `Incident opened; owner: ${userName(d, input.ownerId)}.`))
  logEvent(d, { module: 'incidents', type: 'IncidentOpened', sourceType: 'incident', sourceId: inc.id, summary: `${inc.no} · ${input.title}` })
  if (input.ownerId !== meOf(d).id) notify(d, input.ownerId, B(`Size yeni bir olay atandı: ${inc.no}`, `A new incident was assigned to you: ${inc.no}`), { type: 'incident', id: inc.id })
  return inc
}

export function setIncidentStatus(d: Db, id: Id, status: Incident['status'], note: string): void {
  need(d, 'incidents:manage', B('Olay durumu', 'Incident status'))
  const inc = d.incidents.find((x) => x.id === id)
  if (!inc) fail(B('Olay bulunamadı.', 'Incident not found.'))
  if ((status === 'resolved' || status === 'closed') && note.trim().length < 5) fail(B('Çözüm / kapanış notunu yazın.', 'Enter the resolution / closing note.'), { note: B('Not zorunlu', 'A note is required') })
  if (status === 'closed' && inc!.status !== 'resolved') fail(B('Kapatmadan önce olay çözüldü olarak işaretlenmeli.', 'The incident must be marked resolved before it is closed.'))
  inc!.status = status
  if (status === 'resolved' || status === 'closed') inc!.resolution = note
  addHistory(d, inc!.history, { investigating: B('İnceleniyor', 'Under investigation'), resolved: B('Çözüldü', 'Resolved'), closed: B('Kapatıldı', 'Closed'), open: B('Yeniden açıldı', 'Reopened') }[status], note || '—')
  logEvent(d, { module: 'incidents', type: `Incident_${status}`, sourceType: 'incident', sourceId: id, summary: `${inc!.no} → ${status}`, reason: note })
}

export function addIncidentEvidence(d: Db, id: Id, label: string): void {
  need(d, 'incidents:manage', B('Kanıt ekleme', 'Adding evidence'))
  const inc = d.incidents.find((x) => x.id === id)
  if (!inc) fail(B('Olay bulunamadı.', 'Incident not found.'))
  if (!label.trim()) fail(B('Kanıt adı yazın.', 'Enter the evidence name.'), { label: B('Ad zorunlu', 'A name is required') })
  inc!.evidence.push({ id: nextId(d, 'evd'), label, at: nowOf(d) })
  addHistory(d, inc!.history, B('Kanıt eklendi', 'Evidence added'), B(`${label} (demo yer tutucu, dosya içermez)`, `${label} (demo placeholder, holds no file)`))
}

// --------------------------------------------------------------------------- fines

export function createFine(d: Db, input: { vehicleId: Id; occurredAt: Iso; kind: string; authorityRef: string; authority: string; amount: Money; dueDate: string }): Fine {
  need(d, 'fines:manage', B('Ceza kaydı', 'Fine record'))
  const ref = input.authorityRef.trim().toUpperCase()
  if (ref.length < 4) fail(B('Resmî referansı girin.', 'Enter the official reference.'), { ref: B('Referans zorunlu', 'A reference is required') })
  if (d.fines.some((f) => f.authorityRef === ref)) fail(B(`Bu resmî referans (${ref}) zaten kayıtlı: aynı ceza iki kez girilemez.`, `This official reference (${ref}) is already recorded: the same fine cannot be entered twice.`), { ref: B('Mükerrer referans', 'Duplicate reference') }, 'DUPLICATE')
  if (input.amount.minor <= 0) fail(B('Ceza tutarı sıfırdan büyük olmalı.', 'The fine amount must be greater than zero.'), { amount: B('Tutar zorunlu', 'Amount is required') })
  const at = Date.parse(input.occurredAt)
  // Suggestion only: the date overlaps this rental. A person confirms the assignment; nothing is assigned by itself.
  const cand = d.rentals.find((r) => r.vehicleId === input.vehicleId && r.status !== 'cancelled' && Date.parse(r.actualPickupAt ?? r.plannedPickupAt) <= at && at <= Date.parse(r.actualReturnAt ?? (r.status === 'delivered' ? nowOf(d) : r.plannedReturnAt)))
  const f: Fine = { id: nextId(d, 'fn'), no: nextNo(d, 'C'), vehicleId: input.vehicleId, occurredAt: input.occurredAt, kind: input.kind, authorityRef: ref, authority: input.authority, amount: input.amount, dueDate: input.dueDate, status: cand ? 'liability_pending' : 'recorded', suggestedRentalId: cand?.id, dispute: 'none', history: [] }
  d.fines.push(f)
  addHistory(d, f.history, 'Kaydedildi', cand ? B(`Tarih ${cand.no} kiralamasıyla örtüşüyor: atama önerisi (onay bekliyor).`, `The date overlaps rental ${cand.no}: assignment suggestion (awaiting confirmation).`) : B('Eşleşen kiralama bulunamadı.', 'No matching rental was found.'))
  logEvent(d, { module: 'fines', type: 'FineRecorded', sourceType: 'fine', sourceId: f.id, summary: `${f.no} · ${ref}`, cur: input.amount.cur, minor: input.amount.minor })
  return f
}

export function assignFine(d: Db, id: Id, rentalId: Id): void {
  need(d, 'fines:manage', B('Ceza ataması', 'Fine assignment'))
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail(B('Ceza bulunamadı.', 'Fine not found.'))
  const r = d.rentals.find((x) => x.id === rentalId)
  if (!r || r.vehicleId !== f!.vehicleId) fail(B('Kiralama bu aracın kiralaması değil.', 'The rental is not a rental of this vehicle.'))
  f!.rentalId = rentalId
  f!.status = 'assigned'
  addHistory(d, f!.history, B('Kiralamaya atandı', 'Assigned to a rental'), B(`${r!.no} sorumlu olarak atandı (elle onay).`, `${r!.no} was assigned as responsible (manual confirmation).`))
  logEvent(d, { module: 'fines', type: 'FineAssigned', sourceType: 'fine', sourceId: id, summary: `${f!.no} → ${r!.no}` })
}

/** Customer liability: one finance charge. Collecting from the customer is a different thing from paying the authority. */
export function chargeFineToCustomer(d: Db, id: Id): void {
  need(d, 'finance:record', B('Ceza ücreti', 'Fine charge'))
  const f = d.fines.find((x) => x.id === id)
  if (!f || !f.rentalId) fail(B('Önce cezayı bir kiralamaya atayın.', 'Assign the fine to a rental first.'))
  const r = d.rentals.find((x) => x.id === f!.rentalId)!
  if (f!.amount.cur !== r.currency) fail(B('Ceza para birimi kiralama para biriminden farklı: kur dönüşümü yapılmaz, elle kalem ekleyin.', 'The fine currency differs from the rental currency: no conversion is made; add a charge manually.'))
  if (f!.customerChargeId) fail(B('Bu ceza için müşteri kalemi zaten yazıldı.', 'A customer charge was already posted for this fine.'))
  const c = postCharge(d, { rentalId: r.id, kind: 'fine', label: B(`Trafik cezası ${f!.authorityRef}`, `Traffic fine ${f!.authorityRef}`), amountMinor: f!.amount.minor, key: `${r.id}:fine:${f!.id}`, sourceType: 'fine', sourceId: f!.id })
  f!.customerChargeId = c.id
  addHistory(d, f!.history, B('Müşteri kalemi', 'Customer charge'), B(`${fmt(f!.amount.minor, f!.amount.cur)} hesap kalemi yazıldı (${c.no}); resmî kuruma ödeme ayrı işlemdir.`, `${fmt(f!.amount.minor, f!.amount.cur)} charge posted (${c.no}); paying the authority is a separate action.`))
}

/** Authority settlement: the company paid the authority. Linked expense is created once; no customer collection here. */
export function payFineToAuthority(d: Db, id: Id): void {
  need(d, 'expenses:manage', B('Otorite ödemesi', 'Authority payment'))
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail(B('Ceza bulunamadı.', 'Fine not found.'))
  if (f!.authorityPaidAt) fail(B('Bu ceza zaten otoriteye ödenmiş.', 'This fine was already paid to the authority.'))
  f!.authorityPaidAt = nowOf(d)
  const v = vehicleOf(d, f!.vehicleId)
  const ex: Expense = { id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: 'Ceza (otorite ödemesi)', vendor: f!.authority, branchId: v.homeBranchId, date: nowOf(d).slice(0, 10), amount: f!.amount, status: 'posted', sourceType: 'fine', sourceId: f!.id, note: B(`${f!.no} otorite ödemesi`, `${f!.no} authority payment`), createdBy: meOf(d).id }
  d.expenses.push(ex)
  f!.expenseId = ex.id
  addHistory(d, f!.history, B('Otoriteye ödendi', 'Paid to the authority'), B(`${fmt(f!.amount.minor, f!.amount.cur)} otoriteye ödendi (şirket gideri ${ex.no}); müşteri tahsilatı değildir.`, `${fmt(f!.amount.minor, f!.amount.cur)} paid to the authority (company expense ${ex.no}); it is not a customer collection.`))
  logEvent(d, { module: 'fines', type: 'FineAuthorityPaid', sourceType: 'fine', sourceId: id, summary: B(`${f!.no} otoriteye ödendi`, `${f!.no} paid to the authority`), cur: f!.amount.cur, minor: f!.amount.minor })
}

export function setFineDispute(d: Db, id: Id, dispute: Fine['dispute']): void {
  need(d, 'fines:manage', B('İtiraz', 'Dispute'))
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail(B('Ceza bulunamadı.', 'Fine not found.'))
  f!.dispute = dispute
  addHistory(d, f!.history, B('İtiraz', 'Dispute'), B(`İtiraz durumu: ${dispute}`, `Dispute status: ${dispute}`))
}

export function closeFine(d: Db, id: Id): void {
  need(d, 'fines:manage', B('Ceza kapatma', 'Closing a fine'))
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail(B('Ceza bulunamadı.', 'Fine not found.'))
  if (!f!.authorityPaidAt && f!.dispute !== 'accepted') fail(B('Ceza otoriteye ödenmeden veya itiraz kabul edilmeden kapatılamaz.', 'The fine cannot be closed before it is paid to the authority or a dispute is accepted.'))
  f!.status = 'closed'
  addHistory(d, f!.history, B('Kapatıldı', 'Closed'), B('Ceza kaydı kapatıldı.', 'Fine record closed.'))
}

// --------------------------------------------------------------------------- tasks

export interface TaskInput {
  title: string
  description: string
  priority: TaskPriority
  dueAt: Iso
  ownerId?: Id
  recipientIds: Id[]
  pool: boolean
  branchId?: Id
  link?: { type: LinkType; id: Id }
}

export function createTask(d: Db, input: TaskInput): Task {
  need(d, 'tasks:manage', B('Görev oluşturma', 'Creating a task'))
  if (input.title.trim().length < 3) fail(B('Görev başlığı yazın.', 'Enter a task title.'), { title: B('Başlık zorunlu', 'A title is required') })
  if (!input.pool && !input.ownerId && input.recipientIds.length === 0) fail(B('Bir sorumlu seçin veya görevi açık havuza koyun.', 'Choose an owner or put the task in the open pool.'), { owner: B('Sorumlu veya havuz seçin', 'Choose an owner or the pool') })
  const t: Task = { id: nextId(d, 'tk'), no: nextNo(d, 'GR'), title: input.title, description: input.description, priority: input.priority, status: 'open', dueAt: input.dueAt, createdBy: meOf(d).id, createdAt: nowOf(d), ownerId: input.pool ? undefined : input.ownerId, recipientIds: input.recipientIds, pool: input.pool, branchId: input.branchId, link: input.link, history: [] }
  d.tasks.push(t)
  addHistory(d, t.history, B('Oluşturuldu', 'Created'), input.pool ? B('Açık havuza eklendi (uygun personel üstlenebilir).', 'Added to the open pool (an eligible employee can claim it).') : B(`Atandı: ${[input.ownerId, ...input.recipientIds].filter(Boolean).map((u) => userName(d, u as Id)).join(', ')}`, `Assigned: ${[input.ownerId, ...input.recipientIds].filter(Boolean).map((u) => userName(d, u as Id)).join(', ')}`))
  logEvent(d, { module: 'tasks', type: 'TaskAssigned', sourceType: 'task', sourceId: t.id, summary: `${t.no} · ${t.title}`, branchId: input.branchId })
  for (const u of new Set([input.ownerId, ...input.recipientIds].filter(Boolean) as Id[])) if (u !== meOf(d).id) notify(d, u, B(`Yeni görev: ${t.title}`, `New task: ${t.title}`), { type: 'task', id: t.id })
  return t
}

export function claimTask(d: Db, id: Id): void {
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail(B('Görev bulunamadı.', 'Task not found.'))
  if (!t!.pool || t!.ownerId) fail(B('Bu görev açık havuzda değil veya zaten üstlenilmiş.', 'This task is not in the open pool or was already claimed.'))
  const me = meOf(d)
  if (!hasPerm(d, 'tasks:view')) fail(B('Görevleri görme yetkiniz yok.', 'You do not have permission to view tasks.'))
  if (t!.branchId && !scopeBranches(d).includes(t!.branchId)) fail(B('Bu görev şubenizin kapsamında değil.', 'This task is outside your branch scope.'))
  t!.ownerId = me.id
  t!.pool = false
  t!.status = 'in_progress'
  addHistory(d, t!.history, B('Üstlenildi', 'Claimed'), B(`${me.name} görevi üstlendi.`, `${me.name} claimed the task.`))
  logEvent(d, { module: 'tasks', type: 'TaskClaimed', sourceType: 'task', sourceId: id, summary: B(`${t!.no} üstlenildi`, `${t!.no} claimed`) })
}

export function reassignTask(d: Db, id: Id, ownerId: Id): void {
  need(d, 'tasks:manage', B('Görev devri', 'Reassigning a task'))
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail(B('Görev bulunamadı.', 'Task not found.'))
  if (t!.status === 'done') fail(B('Tamamlanan görev devredilemez.', 'A completed task cannot be reassigned.'))
  const from = t!.ownerId
  t!.ownerId = ownerId
  t!.pool = false
  addHistory(d, t!.history, 'Devredildi', `${userName(d, from)} → ${userName(d, ownerId)}`)
  notify(d, ownerId, B(`Görev size devredildi: ${t!.title}`, `A task was reassigned to you: ${t!.title}`), { type: 'task', id })
}

export function setTaskStatus(d: Db, id: Id, status: Task['status']): void {
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail(B('Görev bulunamadı.', 'Task not found.'))
  const me = meOf(d)
  const mine = t!.ownerId === me.id || t!.recipientIds.includes(me.id)
  if (!mine && !hasPerm(d, 'tasks:manage')) fail(B('Bu görevi yalnız sorumlusu veya yönetici güncelleyebilir.', 'Only the task owner or a manager can update this task.'))
  t!.status = status
  t!.doneAt = status === 'done' ? nowOf(d) : undefined
  // Completing a task changes only the task. The linked rental / maintenance / incident keeps its own state.
  addHistory(d, t!.history, status === 'done' ? B('Tamamlandı', 'Completed') : B('Güncellendi', 'Updated'), status === 'done' ? B('Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.', 'Task completed. The linked record still needs its own action.') : B(`Durum: ${status}`, `Status: ${status}`))
  logEvent(d, { module: 'tasks', type: status === 'done' ? 'TaskCompleted' : 'TaskUpdated', sourceType: 'task', sourceId: id, summary: `${t!.no} → ${status}` })
}

// --------------------------------------------------------------------------- transfers

export function createTransfer(d: Db, input: { vehicleId: Id; toBranchId: Id; plannedAt: Iso; reason: string }): Transfer {
  need(d, 'vehicles:manage', 'Transfer talebi')
  const v = vehicleOf(d, input.vehicleId)
  if (v.location === input.toBranchId) fail(B('Araç zaten bu şubede.', 'The vehicle is already at this branch.'))
  const chk = readinessOf(d, v, nowOf(d))
  void chk
  if (d.damages.some((x) => x.vehicleId === v.id && x.blocksVehicle && x.status !== 'closed')) fail(B('Hasar engeli olan araç normal transferle gönderilemez.', 'A vehicle with a damage block cannot be sent by a normal transfer.'))
  const t: Transfer = { id: nextId(d, 'tr'), no: nextNo(d, 'T'), vehicleId: v.id, fromBranchId: v.location, toBranchId: input.toBranchId, status: 'requested', plannedAt: input.plannedAt, reason: input.reason }
  d.transfers.push(t)
  logEvent(d, { module: 'vehicles', type: 'TransferRequested', sourceType: 'transfer', sourceId: t.id, summary: `${t.no} · ${v.plate}` })
  return t
}
export function departTransfer(d: Db, id: Id): void {
  need(d, 'vehicles:manage', B('Transfer çıkışı', 'Transfer departure'))
  const t = d.transfers.find((x) => x.id === id)
  if (!t || t.status !== 'requested') fail(B('Transfer çıkışa hazır değil.', 'The transfer is not ready to depart.'))
  t!.status = 'in_transit'
  t!.departedAt = nowOf(d)
  vehicleOf(d, t!.vehicleId).location = 'transit'
}
export function arriveTransfer(d: Db, id: Id): void {
  need(d, 'vehicles:manage', B('Transfer varışı', 'Transfer arrival'))
  const t = d.transfers.find((x) => x.id === id)
  if (!t || t.status !== 'in_transit') fail(B('Transfer yolda değil.', 'The transfer is not in transit.'))
  t!.status = 'completed'
  t!.arrivedAt = nowOf(d)
  const v = vehicleOf(d, t!.vehicleId)
  // Physical location changes; the home branch does not (a transfer is not a home-branch change).
  v.location = t!.toBranchId
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: `Transfer ${t!.no}`, refType: 'transfer', refId: id })
}

export const FUEL_LABEL: Record<FuelLevel, string> = { empty: B('Boş', 'Empty'), quarter: '1/4', half: '1/2', three_quarters: '3/4', full: 'Dolu' }
export const overdueDays = (iso: string, now: string) => Math.floor((Date.parse(now) - Date.parse(iso)) / DAY)
export type { Cur }
