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
  if (!v) fail('Araç bulunamadı.')
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
  need(d, 'vehicles:manage', 'Araç ekleme')
  const plate = input.plate.trim().toUpperCase()
  const fields: Record<string, string> = {}
  if (plate.length < 4) fields.plate = 'Geçerli bir plaka girin'
  if (d.vehicles.some((v) => v.plate === plate)) fields.plate = 'Bu plaka zaten kayıtlı'
  if (!input.make.trim()) fields.make = 'Marka gerekli'
  if (!input.model.trim()) fields.model = 'Model gerekli'
  if (!(input.year >= 1990 && input.year <= 2100)) fields.year = 'Geçerli bir yıl girin'
  if (!(input.odometerKm >= 0)) fields.odometerKm = 'Kilometre geçersiz'
  if (Object.keys(fields).length) fail('Formda eksik veya geçersiz alanlar var.', fields)
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
    readiness: { clean: false, fuelOk: true, checkedAt: null, checkedBy: null, note: 'Yeni araç: hazırlık kontrolü bekliyor' },
    tire: { type: 'all_season', mountedAt: nowOf(d), treadMm: 8 },
    service: { intervalKm: 15000, lastKm: input.odometerKm, lastAt: nowOf(d) },
    keys: { count: 2, holder: 'Şube anahtar dolabı' },
  }
  d.vehicles.push(v)
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: v.odometerKm, at: nowOf(d), source: 'initial', by: meOf(d).id })
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: 'Filoya giriş' })
  logEvent(d, { module: 'vehicles', type: 'VehicleCreated', sourceType: 'vehicle', sourceId: v.id, summary: `${v.plate} filoya eklendi`, branchId: v.homeBranchId })
  return v
}

export function updateVehicle(d: Db, id: Id, patch: Partial<Pick<Vehicle, 'color' | 'homeBranchId' | 'vin' | 'status'>>): Vehicle {
  need(d, 'vehicles:manage', 'Araç düzenleme')
  const v = vehicleOf(d, id)
  const before = `${v.homeBranchId}/${v.status}`
  if (patch.status === 'out_of_service' && d.rentals.some((r) => r.vehicleId === id && r.status === 'delivered')) fail('Araç şu an müşteride; hizmet dışı yapılamaz.')
  Object.assign(v, patch)
  logEvent(d, { module: 'vehicles', type: 'VehicleUpdated', sourceType: 'vehicle', sourceId: id, summary: `${v.plate} güncellendi`, before, after: `${v.homeBranchId}/${v.status}` })
  return v
}

export function recordOdometer(d: Db, id: Id, km: number, source: 'manual' | 'maintenance' = 'manual'): void {
  need(d, 'vehicles:manage', 'Kilometre girişi')
  const v = vehicleOf(d, id)
  if (!Number.isInteger(km) || km < v.odometerKm) fail(`Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz. Düzeltme gerekiyorsa gerekçeli düzeltme kaydı açın.`, { km: 'Geçersiz kilometre' })
  v.odometerKm = km
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: id, km, at: nowOf(d), source, by: meOf(d).id })
  logEvent(d, { module: 'vehicles', type: 'OdometerRecorded', sourceType: 'vehicle', sourceId: id, summary: `${v.plate} · ${km} km` })
}

export function recordLocation(d: Db, id: Id, location: string, reason: string): void {
  need(d, 'vehicles:manage', 'Konum güncelleme')
  const v = vehicleOf(d, id)
  if (reason.trim().length < 3) fail('Konum güncelleme gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  v.location = location
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: id, at: nowOf(d), location, reason })
  logEvent(d, { module: 'vehicles', type: 'LocationRecorded', sourceType: 'vehicle', sourceId: id, summary: `${v.plate} fiziksel konum: ${location}. Ana şube değişmedi.`, reason })
}

export function addVehicleDocument(d: Db, vehicleId: Id, kind: string, name: string, validUntil: string): void {
  need(d, 'documents:manage', 'Belge ekleme')
  const v = vehicleOf(d, vehicleId)
  if (!name.trim()) fail('Belge adı gerekli.', { name: 'Belge adı gerekli' })
  const version = d.documents.filter((x) => x.ownerType === 'vehicle' && x.ownerId === vehicleId && x.kind === kind).length + 1
  d.documents.push({ id: nextId(d, 'doc'), ownerType: 'vehicle', ownerId: vehicleId, kind, name, version, validUntil: validUntil || undefined, placeholder: true, uploadedAt: nowOf(d), uploadedBy: meOf(d).id })
  logEvent(d, { module: 'documents', type: 'DocumentAdded', sourceType: 'vehicle', sourceId: vehicleId, summary: `${v.plate} · ${kind} v${version} (demo belge, dosya içermez)` })
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
  need(d, 'maintenance:manage', 'Bakım planlama')
  const v = vehicleOf(d, input.vehicleId)
  if (Date.parse(input.plannedEnd) <= Date.parse(input.plannedStart)) fail('Bitiş, başlangıçtan sonra olmalı.', { end: 'Bitiş, başlangıçtan sonra olmalı' })
  if (input.reason.trim().length < 3) fail('Bakım gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  const chk = checkVehicleAvailable(d, v, input.plannedStart, input.plannedEnd, nowOf(d))
  // A maintenance window must not collide with rentals or confirmed reservations of the same vehicle.
  const blocking = chk.conflicts.filter((c) => c.kind === 'rental' || c.kind === 'reservation' || c.kind === 'maintenance')
  if (blocking.length) fail(`${v.plate} bu aralıkta bakıma ayrılamaz: ${blocking.map((c) => c.label).join(', ')} ile çakışıyor. Önce çakışan kaydı çözün.`, { start: 'Araç bu aralıkta müsait değil' }, 'CONFLICT')
  const m: Maintenance = { id: nextId(d, 'mn'), no: nextNo(d, 'B'), vehicleId: input.vehicleId, type: input.type, status: 'planned', plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, providerId: input.providerId, reason: input.reason, cost: null, damageId: input.damageId, history: [] }
  d.maintenance.push(m)
  addHistory(d, m.history, 'Planlandı', `${v.plate} için bakım planlandı: araç bu aralıkta uygunluktan düşer.`)
  logEvent(d, { module: 'maintenance', type: 'MaintenancePlanned', sourceType: 'maintenance', sourceId: m.id, summary: `${m.no} · ${v.plate}`, branchId: v.homeBranchId })
  return m
}

export function startMaintenance(d: Db, id: Id): void {
  need(d, 'maintenance:manage', 'Servise alma')
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || m.status !== 'planned') fail('Yalnız planlı bakım servise alınır.')
  const v = vehicleOf(d, m!.vehicleId)
  if (d.rentals.some((r) => r.vehicleId === v.id && r.status === 'delivered' && Date.parse(r.actualPickupAt ?? r.plannedPickupAt) <= Date.parse(nowOf(d)))) fail('Araç şu an müşteride; servise alınamaz.')
  m!.status = 'in_progress'
  m!.actualStart = nowOf(d)
  v.location = d.providers.find((p) => p.id === m!.providerId) ? 'service' : v.location
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: `Bakım ${m!.no}`, refType: 'maintenance', refId: m!.id })
  addHistory(d, m!.history, 'Servise alındı', `${v.plate} servise alındı.`)
  logEvent(d, { module: 'maintenance', type: 'MaintenanceStarted', sourceType: 'maintenance', sourceId: id, summary: `${m!.no} başladı`, before: 'planned', after: 'in_progress' })
}

export function completeMaintenance(d: Db, id: Id, input: { cost: Money | null; km?: number; tireTo?: 'summer' | 'winter' | 'all_season'; treadMm?: number }): void {
  need(d, 'maintenance:manage', 'Bakım tamamlama')
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || m.status !== 'in_progress') fail('Yalnız devam eden bakım tamamlanır.')
  const v = vehicleOf(d, m!.vehicleId)
  if (input.km !== undefined) {
    if (input.km < v.odometerKm) fail(`Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz.`, { km: 'Geçersiz kilometre' })
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
  v.readiness = { ...v.readiness, clean: false, checkedAt: null, checkedBy: null, note: 'Bakım sonrası hazırlık kontrolü bekliyor' }
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: `Bakım tamamlandı ${m!.no}`, refType: 'maintenance', refId: id })
  addHistory(d, m!.history, 'Tamamlandı', `Bakım tamamlandı${input.cost ? ` · ${fmt(input.cost.minor, input.cost.cur)}` : ''}. Araç otomatik hazır sayılmaz; hazırlık kontrolü gerekir.`)
  // The service cost lives in the Maintenance record; the expense row is linked to it and its amount is locked.
  if (input.cost && input.cost.minor > 0 && !d.expenses.some((e) => e.sourceType === 'maintenance' && e.sourceId === id)) {
    d.expenses.push({ id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: 'Bakım ve servis', vendor: d.providers.find((p) => p.id === m!.providerId)?.name ?? 'Servis', branchId: v.homeBranchId, date: nowOf(d).slice(0, 10), amount: input.cost, status: 'posted', sourceType: 'maintenance', sourceId: id, note: `${m!.no} bakım kaydından`, createdBy: meOf(d).id })
  }
  logEvent(d, { module: 'maintenance', type: 'MaintenanceCompleted', sourceType: 'maintenance', sourceId: id, summary: `${m!.no} tamamlandı`, before: 'in_progress', after: 'completed', cur: input.cost?.cur, minor: input.cost?.minor })
}

export function cancelMaintenance(d: Db, id: Id, reason: string): void {
  need(d, 'maintenance:manage', 'Bakım iptali')
  const m = d.maintenance.find((x) => x.id === id)
  if (!m || (m.status !== 'planned' && m.status !== 'in_progress')) fail('Bu bakım iptal edilemez.')
  if (reason.trim().length < 3) fail('İptal gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  m!.status = 'cancelled'
  addHistory(d, m!.history, 'İptal edildi', reason)
  logEvent(d, { module: 'maintenance', type: 'MaintenanceCancelled', sourceType: 'maintenance', sourceId: id, summary: `${m!.no} iptal`, reason })
}

// --------------------------------------------------------------------------- damage

export function createDamage(d: Db, input: { vehicleId: Id; rentalId?: Id; severity: Damage['severity']; area: string; description: string; photos: number; blocksVehicle: boolean; estimate?: Money }): Damage {
  need(d, 'damages:manage', 'Hasar bildirimi')
  const v = vehicleOf(d, input.vehicleId)
  if (input.description.trim().length < 5) fail('Hasar açıklamasını yazın.', { description: 'En az 5 karakter' })
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
  addHistory(d, dm.history, 'Bildirildi', 'Hasar kaydı açıldı; bu bir bulgudur, müşteriye borç yazmaz.')
  logEvent(d, { module: 'damages', type: 'DamageReported', sourceType: 'damage', sourceId: dm.id, summary: `${dm.no} · ${v.plate} · ${input.severity}`, branchId: v.homeBranchId })
  return dm
}

export function setDamageStatus(d: Db, id: Id, status: 'investigating' | 'closed', note = ''): void {
  need(d, 'damages:manage', 'Hasar durumu')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail('Hasar bulunamadı.')
  if (status === 'closed') {
    if (dm!.liability === 'undetermined') fail('Kapatmadan önce sorumluluk belirlenmeli.')
    if (dm!.blocksVehicle) fail('Araç engeli kalkmadan hasar kapatılamaz (engeli kaldırmak ikinci bir yetkili ister).')
  }
  dm!.status = status
  addHistory(d, dm!.history, status === 'closed' ? 'Kapatıldı' : 'İnceleniyor', note || (status === 'closed' ? 'Hasar kapatıldı.' : 'İnceleme başladı.'))
  logEvent(d, { module: 'damages', type: status === 'closed' ? 'DamageClosed' : 'DamageInvestigating', sourceType: 'damage', sourceId: id, summary: `${dm!.no} ${status}` })
}

/** Liability and the explainable money split: deductible to the renter, the rest expected from the insurer. */
export function setDamageLiability(d: Db, id: Id, liability: Damage['liability'], estimate: Money | null): void {
  need(d, 'damages:manage', 'Sorumluluk belirleme')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail('Hasar bulunamadı.')
  if (liability === 'undetermined') fail('Bir sorumluluk seçin.')
  if (liability !== 'company' && (!estimate || estimate.minor <= 0)) fail('Sorumluluk için onarım tahmini girin.', { estimate: 'Tahmin zorunlu' })
  dm!.liability = liability
  dm!.estimate = estimate
  dm!.status = 'liability_set'
  addHistory(d, dm!.history, 'Sorumluluk belirlendi', liability === 'customer' ? 'Müşteri sorumlu (sigorta muafiyeti kadar).' : liability === 'insurer' ? 'Sigorta/üçüncü taraf sorumlu.' : 'Şirket üstleniyor.')
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
  need(d, 'finance:record', 'Hasar ücreti')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail('Hasar bulunamadı.')
  if (!dm!.rentalId) fail('Hasar bir kiralamaya bağlı değil.')
  const share = customerShare(dm!)
  if (!share) fail('Müşteri sorumluluğu belirlenmeden ücret yazılamaz.')
  const rental = d.rentals.find((r) => r.id === dm!.rentalId)!
  if (share!.cur !== rental.currency) fail('Hasar tahmini kiralama para biriminde olmalı (kur dönüşümü yapılmaz).')
  if (dm!.chargeId) fail('Bu hasar için müşteri kalemi zaten yazıldı (tek kalem).')
  const c = postCharge(d, { rentalId: rental.id, kind: 'damage', label: `Hasar katılımı ${dm!.no}`, amountMinor: share!.minor, key: `${rental.id}:damage:${dm!.id}`, sourceType: 'damage', sourceId: dm!.id })
  dm!.chargeId = c.id
  addHistory(d, dm!.history, 'Müşteri kalemi', `${fmt(share!.minor, share!.cur)} hesap kalemi yazıldı (${c.no}).`)
}

export function recordInsurerRecovery(d: Db, id: Id, insurerRef: string, amount: Money, received: boolean): void {
  need(d, 'finance:record', 'Sigorta tahsilatı')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail('Hasar bulunamadı.')
  if (!insurerRef.trim()) fail('Sigorta dosya referansını girin.', { ref: 'Referans zorunlu' })
  dm!.recovery = { insurerRef, amount, receivedAt: received ? nowOf(d) : undefined }
  addHistory(d, dm!.history, 'Sigorta geri ödemesi', `${fmt(amount.minor, amount.cur)} · ${received ? 'alındı' : 'bekleniyor'} · ayrı finans hareketi, müşteri kalemi değil.`)
  logEvent(d, { module: 'finance', type: received ? 'InsurerRecoveryReceived' : 'InsurerRecoveryExpected', sourceType: 'damage', sourceId: id, summary: `${dm!.no} sigorta geri ödemesi`, cur: amount.cur, minor: amount.minor })
}

export function linkRepair(d: Db, id: Id, plannedStart: Iso, plannedEnd: Iso, providerId?: Id): Maintenance {
  need(d, 'maintenance:manage', 'Onarım planlama')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm) fail('Hasar bulunamadı.')
  const m = planMaintenance(d, { vehicleId: dm!.vehicleId, type: 'repair', plannedStart, plannedEnd, providerId, reason: `Hasar onarımı ${dm!.no}`, damageId: id })
  dm!.repairMaintenanceId = m.id
  addHistory(d, dm!.history, 'Onarım bağlandı', `${m.no} bakım kaydı bağlandı. Onarım maliyeti bakım kaydından gelir.`)
  return m
}

export function unblockVehicle(d: Db, id: Id): void {
  need(d, 'damages:unblock', 'Engel kaldırma')
  const dm = d.damages.find((x) => x.id === id)
  if (!dm || !dm.blocksVehicle) fail('Bu hasarda açık engel yok.')
  // Four eyes: the person who reported the damage cannot lift its block.
  if (dm!.createdBy === meOf(d).id) fail('Hasarı bildiren kişi engeli kaldıramaz: ikinci bir yetkili gerekir (dört göz).', {}, 'FOUR_EYES')
  dm!.blocksVehicle = false
  addHistory(d, dm!.history, 'Engel kaldırıldı', 'Araç engeli kaldırıldı. Araç başka kayıtlar nedeniyle yine uygun olmayabilir; hazırlık ayrıca kontrol edilir.')
  logEvent(d, { module: 'damages', type: 'BlockLifted', sourceType: 'damage', sourceId: id, summary: `${dm!.no} engeli kaldırıldı` })
}

// --------------------------------------------------------------------------- incidents

export function createIncident(d: Db, input: { kind: Incident['kind']; severity: Incident['severity']; title: string; description: string; vehicleId?: Id; rentalId?: Id; ownerId: Id; links?: Incident['links'] }): Incident {
  need(d, 'incidents:manage', 'Olay kaydı')
  if (input.title.trim().length < 3) fail('Olay başlığı yazın.', { title: 'Başlık zorunlu' })
  if (input.description.trim().length < 5) fail('Olay açıklaması yazın.', { description: 'En az 5 karakter' })
  const inc: Incident = { id: nextId(d, 'inc'), no: nextNo(d, 'O'), kind: input.kind, severity: input.severity, status: 'open', title: input.title, description: input.description, vehicleId: input.vehicleId, rentalId: input.rentalId, ownerId: input.ownerId, evidence: [], links: input.links ?? [], createdAt: nowOf(d), createdBy: meOf(d).id, history: [] }
  if (input.vehicleId) inc.links.push({ type: 'vehicle', id: input.vehicleId })
  if (input.rentalId) inc.links.push({ type: 'rental', id: input.rentalId })
  d.incidents.push(inc)
  addHistory(d, inc.history, 'Açıldı', `Olay açıldı; sorumlu: ${userName(d, input.ownerId)}.`)
  logEvent(d, { module: 'incidents', type: 'IncidentOpened', sourceType: 'incident', sourceId: inc.id, summary: `${inc.no} · ${input.title}` })
  if (input.ownerId !== meOf(d).id) notify(d, input.ownerId, `Size yeni bir olay atandı: ${inc.no}`, { type: 'incident', id: inc.id })
  return inc
}

export function setIncidentStatus(d: Db, id: Id, status: Incident['status'], note: string): void {
  need(d, 'incidents:manage', 'Olay durumu')
  const inc = d.incidents.find((x) => x.id === id)
  if (!inc) fail('Olay bulunamadı.')
  if ((status === 'resolved' || status === 'closed') && note.trim().length < 5) fail('Çözüm / kapanış notunu yazın.', { note: 'Not zorunlu' })
  if (status === 'closed' && inc!.status !== 'resolved') fail('Kapatmadan önce olay çözüldü olarak işaretlenmeli.')
  inc!.status = status
  if (status === 'resolved' || status === 'closed') inc!.resolution = note
  addHistory(d, inc!.history, { investigating: 'İnceleniyor', resolved: 'Çözüldü', closed: 'Kapatıldı', open: 'Yeniden açıldı' }[status], note || '—')
  logEvent(d, { module: 'incidents', type: `Incident_${status}`, sourceType: 'incident', sourceId: id, summary: `${inc!.no} → ${status}`, reason: note })
}

export function addIncidentEvidence(d: Db, id: Id, label: string): void {
  need(d, 'incidents:manage', 'Kanıt ekleme')
  const inc = d.incidents.find((x) => x.id === id)
  if (!inc) fail('Olay bulunamadı.')
  if (!label.trim()) fail('Kanıt adı yazın.', { label: 'Ad zorunlu' })
  inc!.evidence.push({ id: nextId(d, 'evd'), label, at: nowOf(d) })
  addHistory(d, inc!.history, 'Kanıt eklendi', `${label} (demo yer tutucu, dosya içermez)`)
}

// --------------------------------------------------------------------------- fines

export function createFine(d: Db, input: { vehicleId: Id; occurredAt: Iso; kind: string; authorityRef: string; authority: string; amount: Money; dueDate: string }): Fine {
  need(d, 'fines:manage', 'Ceza kaydı')
  const ref = input.authorityRef.trim().toUpperCase()
  if (ref.length < 4) fail('Resmî referansı girin.', { ref: 'Referans zorunlu' })
  if (d.fines.some((f) => f.authorityRef === ref)) fail(`Bu resmî referans (${ref}) zaten kayıtlı: aynı ceza iki kez girilemez.`, { ref: 'Mükerrer referans' }, 'DUPLICATE')
  if (input.amount.minor <= 0) fail('Ceza tutarı sıfırdan büyük olmalı.', { amount: 'Tutar zorunlu' })
  const at = Date.parse(input.occurredAt)
  // Suggestion only: the date overlaps this rental. A person confirms the assignment; nothing is assigned by itself.
  const cand = d.rentals.find((r) => r.vehicleId === input.vehicleId && r.status !== 'cancelled' && Date.parse(r.actualPickupAt ?? r.plannedPickupAt) <= at && at <= Date.parse(r.actualReturnAt ?? (r.status === 'delivered' ? nowOf(d) : r.plannedReturnAt)))
  const f: Fine = { id: nextId(d, 'fn'), no: nextNo(d, 'C'), vehicleId: input.vehicleId, occurredAt: input.occurredAt, kind: input.kind, authorityRef: ref, authority: input.authority, amount: input.amount, dueDate: input.dueDate, status: cand ? 'liability_pending' : 'recorded', suggestedRentalId: cand?.id, dispute: 'none', history: [] }
  d.fines.push(f)
  addHistory(d, f.history, 'Kaydedildi', cand ? `Tarih ${cand.no} kiralamasıyla örtüşüyor: atama önerisi (onay bekliyor).` : 'Eşleşen kiralama bulunamadı.')
  logEvent(d, { module: 'fines', type: 'FineRecorded', sourceType: 'fine', sourceId: f.id, summary: `${f.no} · ${ref}`, cur: input.amount.cur, minor: input.amount.minor })
  return f
}

export function assignFine(d: Db, id: Id, rentalId: Id): void {
  need(d, 'fines:manage', 'Ceza ataması')
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail('Ceza bulunamadı.')
  const r = d.rentals.find((x) => x.id === rentalId)
  if (!r || r.vehicleId !== f!.vehicleId) fail('Kiralama bu aracın kiralaması değil.')
  f!.rentalId = rentalId
  f!.status = 'assigned'
  addHistory(d, f!.history, 'Kiralamaya atandı', `${r!.no} sorumlu olarak atandı (elle onay).`)
  logEvent(d, { module: 'fines', type: 'FineAssigned', sourceType: 'fine', sourceId: id, summary: `${f!.no} → ${r!.no}` })
}

/** Customer liability: one finance charge. Collecting from the customer is a different thing from paying the authority. */
export function chargeFineToCustomer(d: Db, id: Id): void {
  need(d, 'finance:record', 'Ceza ücreti')
  const f = d.fines.find((x) => x.id === id)
  if (!f || !f.rentalId) fail('Önce cezayı bir kiralamaya atayın.')
  const r = d.rentals.find((x) => x.id === f!.rentalId)!
  if (f!.amount.cur !== r.currency) fail('Ceza para birimi kiralama para biriminden farklı: kur dönüşümü yapılmaz, elle kalem ekleyin.')
  if (f!.customerChargeId) fail('Bu ceza için müşteri kalemi zaten yazıldı.')
  const c = postCharge(d, { rentalId: r.id, kind: 'fine', label: `Trafik cezası ${f!.authorityRef}`, amountMinor: f!.amount.minor, key: `${r.id}:fine:${f!.id}`, sourceType: 'fine', sourceId: f!.id })
  f!.customerChargeId = c.id
  addHistory(d, f!.history, 'Müşteri kalemi', `${fmt(f!.amount.minor, f!.amount.cur)} hesap kalemi yazıldı (${c.no}); resmî kuruma ödeme ayrı işlemdir.`)
}

/** Authority settlement: the company paid the authority. Linked expense is created once; no customer collection here. */
export function payFineToAuthority(d: Db, id: Id): void {
  need(d, 'expenses:manage', 'Otorite ödemesi')
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail('Ceza bulunamadı.')
  if (f!.authorityPaidAt) fail('Bu ceza zaten otoriteye ödenmiş.')
  f!.authorityPaidAt = nowOf(d)
  const v = vehicleOf(d, f!.vehicleId)
  const ex: Expense = { id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: 'Ceza (otorite ödemesi)', vendor: f!.authority, branchId: v.homeBranchId, date: nowOf(d).slice(0, 10), amount: f!.amount, status: 'posted', sourceType: 'fine', sourceId: f!.id, note: `${f!.no} otorite ödemesi`, createdBy: meOf(d).id }
  d.expenses.push(ex)
  f!.expenseId = ex.id
  addHistory(d, f!.history, 'Otoriteye ödendi', `${fmt(f!.amount.minor, f!.amount.cur)} otoriteye ödendi (şirket gideri ${ex.no}); müşteri tahsilatı değildir.`)
  logEvent(d, { module: 'fines', type: 'FineAuthorityPaid', sourceType: 'fine', sourceId: id, summary: `${f!.no} otoriteye ödendi`, cur: f!.amount.cur, minor: f!.amount.minor })
}

export function setFineDispute(d: Db, id: Id, dispute: Fine['dispute']): void {
  need(d, 'fines:manage', 'İtiraz')
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail('Ceza bulunamadı.')
  f!.dispute = dispute
  addHistory(d, f!.history, 'İtiraz', `İtiraz durumu: ${dispute}`)
}

export function closeFine(d: Db, id: Id): void {
  need(d, 'fines:manage', 'Ceza kapatma')
  const f = d.fines.find((x) => x.id === id)
  if (!f) fail('Ceza bulunamadı.')
  if (!f!.authorityPaidAt && f!.dispute !== 'accepted') fail('Ceza otoriteye ödenmeden veya itiraz kabul edilmeden kapatılamaz.')
  f!.status = 'closed'
  addHistory(d, f!.history, 'Kapatıldı', 'Ceza kaydı kapatıldı.')
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
  need(d, 'tasks:manage', 'Görev oluşturma')
  if (input.title.trim().length < 3) fail('Görev başlığı yazın.', { title: 'Başlık zorunlu' })
  if (!input.pool && !input.ownerId && input.recipientIds.length === 0) fail('Bir sorumlu seçin veya görevi açık havuza koyun.', { owner: 'Sorumlu veya havuz seçin' })
  const t: Task = { id: nextId(d, 'tk'), no: nextNo(d, 'GR'), title: input.title, description: input.description, priority: input.priority, status: 'open', dueAt: input.dueAt, createdBy: meOf(d).id, createdAt: nowOf(d), ownerId: input.pool ? undefined : input.ownerId, recipientIds: input.recipientIds, pool: input.pool, branchId: input.branchId, link: input.link, history: [] }
  d.tasks.push(t)
  addHistory(d, t.history, 'Oluşturuldu', input.pool ? 'Açık havuza eklendi (uygun personel üstlenebilir).' : `Atandı: ${[input.ownerId, ...input.recipientIds].filter(Boolean).map((u) => userName(d, u as Id)).join(', ')}`)
  logEvent(d, { module: 'tasks', type: 'TaskAssigned', sourceType: 'task', sourceId: t.id, summary: `${t.no} · ${t.title}`, branchId: input.branchId })
  for (const u of new Set([input.ownerId, ...input.recipientIds].filter(Boolean) as Id[])) if (u !== meOf(d).id) notify(d, u, `Yeni görev: ${t.title}`, { type: 'task', id: t.id })
  return t
}

export function claimTask(d: Db, id: Id): void {
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail('Görev bulunamadı.')
  if (!t!.pool || t!.ownerId) fail('Bu görev açık havuzda değil veya zaten üstlenilmiş.')
  const me = meOf(d)
  if (!hasPerm(d, 'tasks:view')) fail('Görevleri görme yetkiniz yok.')
  if (t!.branchId && !scopeBranches(d).includes(t!.branchId)) fail('Bu görev şubenizin kapsamında değil.')
  t!.ownerId = me.id
  t!.pool = false
  t!.status = 'in_progress'
  addHistory(d, t!.history, 'Üstlenildi', `${me.name} görevi üstlendi.`)
  logEvent(d, { module: 'tasks', type: 'TaskClaimed', sourceType: 'task', sourceId: id, summary: `${t!.no} üstlenildi` })
}

export function reassignTask(d: Db, id: Id, ownerId: Id): void {
  need(d, 'tasks:manage', 'Görev devri')
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail('Görev bulunamadı.')
  if (t!.status === 'done') fail('Tamamlanan görev devredilemez.')
  const from = t!.ownerId
  t!.ownerId = ownerId
  t!.pool = false
  addHistory(d, t!.history, 'Devredildi', `${userName(d, from)} → ${userName(d, ownerId)}`)
  notify(d, ownerId, `Görev size devredildi: ${t!.title}`, { type: 'task', id })
}

export function setTaskStatus(d: Db, id: Id, status: Task['status']): void {
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail('Görev bulunamadı.')
  const me = meOf(d)
  const mine = t!.ownerId === me.id || t!.recipientIds.includes(me.id)
  if (!mine && !hasPerm(d, 'tasks:manage')) fail('Bu görevi yalnız sorumlusu veya yönetici güncelleyebilir.')
  t!.status = status
  t!.doneAt = status === 'done' ? nowOf(d) : undefined
  // Completing a task changes only the task. The linked rental / maintenance / incident keeps its own state.
  addHistory(d, t!.history, status === 'done' ? 'Tamamlandı' : 'Güncellendi', status === 'done' ? 'Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.' : `Durum: ${status}`)
  logEvent(d, { module: 'tasks', type: status === 'done' ? 'TaskCompleted' : 'TaskUpdated', sourceType: 'task', sourceId: id, summary: `${t!.no} → ${status}` })
}

// --------------------------------------------------------------------------- transfers

export function createTransfer(d: Db, input: { vehicleId: Id; toBranchId: Id; plannedAt: Iso; reason: string }): Transfer {
  need(d, 'vehicles:manage', 'Transfer talebi')
  const v = vehicleOf(d, input.vehicleId)
  if (v.location === input.toBranchId) fail('Araç zaten bu şubede.')
  const chk = readinessOf(d, v, nowOf(d))
  void chk
  if (d.damages.some((x) => x.vehicleId === v.id && x.blocksVehicle && x.status !== 'closed')) fail('Hasar engeli olan araç normal transferle gönderilemez.')
  const t: Transfer = { id: nextId(d, 'tr'), no: nextNo(d, 'T'), vehicleId: v.id, fromBranchId: v.location, toBranchId: input.toBranchId, status: 'requested', plannedAt: input.plannedAt, reason: input.reason }
  d.transfers.push(t)
  logEvent(d, { module: 'vehicles', type: 'TransferRequested', sourceType: 'transfer', sourceId: t.id, summary: `${t.no} · ${v.plate}` })
  return t
}
export function departTransfer(d: Db, id: Id): void {
  need(d, 'vehicles:manage', 'Transfer çıkışı')
  const t = d.transfers.find((x) => x.id === id)
  if (!t || t.status !== 'requested') fail('Transfer çıkışa hazır değil.')
  t!.status = 'in_transit'
  t!.departedAt = nowOf(d)
  vehicleOf(d, t!.vehicleId).location = 'transit'
}
export function arriveTransfer(d: Db, id: Id): void {
  need(d, 'vehicles:manage', 'Transfer varışı')
  const t = d.transfers.find((x) => x.id === id)
  if (!t || t.status !== 'in_transit') fail('Transfer yolda değil.')
  t!.status = 'completed'
  t!.arrivedAt = nowOf(d)
  const v = vehicleOf(d, t!.vehicleId)
  // Physical location changes; the home branch does not (a transfer is not a home-branch change).
  v.location = t!.toBranchId
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: v.location, reason: `Transfer ${t!.no}`, refType: 'transfer', refId: id })
}

export const FUEL_LABEL: Record<FuelLevel, string> = { empty: 'Boş', quarter: '1/4', half: '1/2', three_quarters: '3/4', full: 'Dolu' }
export const overdueDays = (iso: string, now: string) => Math.floor((Date.parse(now) - Date.parse(iso)) / DAY)
export type { Cur }
