import { B, L } from '../../i18n'
import { capacityCell, checkVehicleAvailable, fuelRank, readinessOf } from '../calc/availability'
import { projectCorporateExposure, projectCommission, rentalFinance } from '../calc/finance'
import { customerDocChecks, DOC_LABEL, evaluateDepositPolicy, evaluateDriverEligibility } from '../calc/policy'
import { priceQuote, type QuoteInput } from '../calc/pricing'
import { addHistory, fail, logEvent, meOf, need, nextId, nextNo, nowOf, notify, tzOf } from '../helpers'
import { fmt, roundHalf } from '../money'
import { addDaysYmd, dayOf, HOUR, startOfDay } from '../time'
import type { Contract, Customer, Db, FuelLevel, Id, Inspection, InspectionPin, Iso, Money, PriceSnapshot, Rental, Reservation, Vehicle } from '../types'
import { createDamage } from './fleet'
import { applyHeldAdvances, postCharge, applyCancellationPolicy } from './finance'

// Reservation and rental operations. A reservation is not a rental; a class-only reservation does not hold a vehicle;
// operational Closed is not Financially Closed; a finished maintenance or return does not make a vehicle Ready.

export const find = {
  vehicle: (d: Db, id: Id) => d.vehicles.find((v) => v.id === id),
  customer: (d: Db, id: Id) => d.customers.find((c) => c.id === id),
  reservation: (d: Db, id: Id) => d.reservations.find((r) => r.id === id),
  rental: (d: Db, id: Id) => d.rentals.find((r) => r.id === id),
}

export function snapshotFor(d: Db, input: QuoteInput, extra: { drivers?: Id[]; customerId?: Id } = {}): PriceSnapshot {
  const q: QuoteInput = { ...input }
  if (extra.drivers && extra.customerId) {
    const others = extra.drivers.filter((x) => x !== extra.customerId)
    q.additionalDrivers = others.length
    const primary = find.customer(d, extra.customerId)
    if (primary) q.youngDriver = evaluateDriverEligibility(d, primary, input.from, input.to).youngDriver
  }
  return priceQuote(d, q, nowOf(d), nextId(d, 'ps'))
}

// --------------------------------------------------------------------------- credit and availability gates

function checkCorporateCredit(d: Db, corporateId: Id | undefined, cur: string, addMinor: number): void {
  if (!corporateId) return
  const corp = d.corporates.find((c) => c.id === corporateId)
  if (!corp) return
  const row = projectCorporateExposure(d, corporateId).find((e) => e.cur === cur)
  if (!row || row.limitMinor === null) fail(B(`${corp.name} için ${cur} kredi limiti tanımlı değil. Limit yoksa sınırsız sayılmaz: kurumsal hesapta ${cur} limiti tanımlayın.`, `No ${cur} credit limit is defined for ${corp.name}. A missing limit does not mean unlimited: define a ${cur} limit on the corporate account.`))
  if (row!.headroomMinor !== null && addMinor > row!.headroomMinor) {
    fail(B(`${corp.name} ${cur} kredi limitini aşıyor (kalan ${fmt(row!.headroomMinor, cur)}, bu işlem ${fmt(addMinor, cur)}). Limit aşımı yalnız Onay Merkezi'nde "Kurumsal Kredi İstisnası" ile geçilir.`, `${corp.name} exceeds its ${cur} credit limit (remaining ${fmt(row!.headroomMinor, cur)}, this transaction ${fmt(addMinor, cur)}). A limit breach is passed only through a "Corporate Credit Exception" in the Approval Center.`), {}, 'CREDIT_LIMIT')
  }
}

export function assertVehicleFree(d: Db, vehicleId: Id, from: Iso, to: Iso, exclude: { rentalId?: Id; reservationId?: Id } = {}): Vehicle {
  const v = find.vehicle(d, vehicleId)
  if (!v) fail(B('Araç bulunamadı.', 'Vehicle not found.'))
  const res = checkVehicleAvailable(d, v!, from, to, nowOf(d), exclude)
  if (!res.ok) fail(B(`${v!.plate} seçilen aralıkta uygun değil: ${res.conflicts.map((c) => c.label).join(', ')}.`, `${v!.plate} is not available in the chosen window: ${res.conflicts.map((c) => c.label).join(', ')}.`), { vehicle: B('Araç uygun değil', 'Vehicle not available') }, 'CONFLICT')
  return v!
}

function assertClassCapacity(d: Db, r: { classId: Id; pickupBranchId: Id; pickupAt: Iso; returnAt: Iso }, excludeResId?: Id): void {
  const branch = d.branches.find((b) => b.id === r.pickupBranchId)!
  const tmp = d.reservations.filter((x) => x.id === excludeResId)
  void tmp
  const first = dayOf(r.pickupAt, branch.tz)
  const last = dayOf(new Date(Date.parse(r.returnAt) - 1).toISOString(), branch.tz)
  for (let day = first; day <= last; day = addDaysYmd(day, 1)) {
    const cell = capacityCell({ ...d, reservations: d.reservations.filter((x) => x.id !== excludeResId) }, branch, r.classId, day)
    if (cell.available <= 0) fail(B(`${branch.name} · ${d.classes.find((c) => c.id === r.classId)?.name} sınıfı ${day} günü için kapasite yetersiz (müsait ${cell.available}).`, `${branch.name} · class ${d.classes.find((c) => c.id === r.classId)?.name} has insufficient capacity for ${day} (free ${cell.available}).`), {}, 'CAPACITY')
  }
}

// --------------------------------------------------------------------------- reservations

export interface ReservationInput {
  customerId: Id
  corporateId?: Id
  classId: Id
  vehicleId?: Id
  pickupBranchId: Id
  returnBranchId: Id
  pickupAt: Iso
  returnAt: Iso
  currency: string
  extras: { extraId: Id; qty: number }[]
  insuranceId?: Id
  drivers?: Id[]
  channel: Reservation['channel']
  partnerId?: Id
  leadId?: Id
  quoteId?: Id
  notes?: string
  status?: 'pending' | 'confirmed'
}

export function validateWindow(from: Iso, to: Iso): void {
  if (!(Date.parse(to) > Date.parse(from))) fail(B('İade zamanı teslim zamanından sonra olmalı.', 'The return time must be after the pickup time.'), { returnAt: B('İade, tesliminden sonra olmalı', 'Return must be after pickup') })
}

export function createReservation(d: Db, input: ReservationInput): Reservation {
  need(d, 'reservations:manage', B('Rezervasyon oluşturma', 'Creating a reservation'))
  validateWindow(input.pickupAt, input.returnAt)
  if (!find.customer(d, input.customerId)) fail(B('Müşteri seçin.', 'Choose a customer.'), { customer: B('Müşteri seçin', 'Choose a customer') })
  const snap = snapshotFor(d, { ...input, from: input.pickupAt, to: input.returnAt }, { drivers: input.drivers ?? [input.customerId], customerId: input.customerId })
  const res: Reservation = {
    id: nextId(d, 'rsv'),
    no: nextNo(d, 'R'),
    status: 'pending',
    customerId: input.customerId,
    corporateId: input.corporateId,
    classId: input.classId,
    vehicleId: input.vehicleId,
    pickupBranchId: input.pickupBranchId,
    returnBranchId: input.returnBranchId,
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    currency: input.currency,
    extras: input.extras,
    insuranceId: input.insuranceId,
    drivers: (input.drivers ?? [input.customerId]).map((c, i) => ({ customerId: c, primary: i === 0 || c === input.customerId })).filter((x, i, a) => a.findIndex((y) => y.customerId === x.customerId) === i),
    price: snap,
    channel: input.channel,
    partnerId: input.partnerId,
    leadId: input.leadId,
    quoteId: input.quoteId,
    notes: input.notes ?? '',
    createdAt: nowOf(d),
    createdBy: meOf(d).id,
    history: [],
  }
  d.reservations.push(res)
  addHistory(d, res.history, B('Oluşturuldu', 'Created'), B(`Rezervasyon oluşturuldu (${input.vehicleId ? B('araç atanmış', 'vehicle assigned') : B('yalnız sınıf', 'class-only')}); Pending kapasite tutmaz.`, `Reservation created (${input.vehicleId ? B('araç atanmış', 'vehicle assigned') : B('yalnız sınıf', 'class-only')}); Pending holds no capacity.`))
  logEvent(d, { module: 'reservations', type: 'ReservationCreated', sourceType: 'reservation', sourceId: res.id, summary: B(`${res.no} oluşturuldu`, `${res.no} created`), branchId: res.pickupBranchId, cur: res.currency, minor: snap.grossMinor })
  if (input.status === 'confirmed') confirmReservation(d, res.id)
  return res
}

export function repriceOf(d: Db, r: Reservation): PriceSnapshot {
  return snapshotFor(d, { classId: r.classId, from: r.pickupAt, to: r.returnAt, pickupBranchId: r.pickupBranchId, returnBranchId: r.returnBranchId, currency: r.currency, extras: r.extras, insuranceId: r.insuranceId, corporateId: r.corporateId, approvedDiscountPct: r.approvedDiscountPct }, { drivers: r.drivers.map((x) => x.customerId), customerId: r.customerId })
}

export function updateReservation(d: Db, id: Id, patch: Partial<Pick<ReservationInput, 'classId' | 'vehicleId' | 'pickupBranchId' | 'returnBranchId' | 'pickupAt' | 'returnAt' | 'extras' | 'insuranceId' | 'notes' | 'currency'>>, acknowledgePriceChange = false): Reservation {
  need(d, 'reservations:manage', B('Rezervasyon düzenleme', 'Editing a reservation'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status === 'converted' || r!.status === 'cancelled' || r!.status === 'no_show') fail(B('Bu rezervasyon artık düzenlenemez.', 'This reservation can no longer be edited.'))
  const next: Reservation = { ...r!, ...patch }
  validateWindow(next.pickupAt, next.returnAt)
  if (next.vehicleId && r!.status === 'confirmed') assertVehicleFree(d, next.vehicleId, next.pickupAt, next.returnAt, { reservationId: id })
  const old = r!.price
  const snap = repriceOf(d, next)
  if (snap.blockers.length) fail(B(`Fiyat hesaplanamadı: ${snap.blockers[0]}`, `The price cannot be calculated: ${snap.blockers[0]}`))
  if (old && old.grossMinor !== snap.grossMinor && !acknowledgePriceChange) {
    fail(B(`Fiyat değişiyor: ${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}. Onaylamak için "yeni fiyatı kabul ediyorum" işaretleyin.`, `The price changes: ${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}. Tick "I accept the new price" to confirm.`), {}, 'PRICE_CHANGE')
  }
  Object.assign(r!, patch)
  r!.price = snap
  addHistory(d, r!.history, B('Düzenlendi', 'Edited'), B(`Plan/fiyat güncellendi${old && old.grossMinor !== snap.grossMinor ? B(` (${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}); önceki fiyat sürümü geçmişte kalır`, ` (${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}); the previous price version stays in the history`) : ''}.`, `Plan/price updated${old && old.grossMinor !== snap.grossMinor ? B(` (${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}); önceki fiyat sürümü geçmişte kalır`, ` (${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}); the previous price version stays in the history`) : ''}.`))
  logEvent(d, { module: 'reservations', type: 'ReservationUpdated', sourceType: 'reservation', sourceId: id, summary: B(`${r!.no} düzenlendi`, `${r!.no} edited`), before: old ? fmt(old.grossMinor, old.cur) : undefined, after: fmt(snap.grossMinor, snap.cur) })
  return r!
}

export function confirmReservation(d: Db, id: Id): Reservation {
  need(d, 'reservations:confirm', B('Rezervasyon onayı', 'Confirming a reservation'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status !== 'pending') fail(B('Yalnız bekleyen (Pending) rezervasyon onaylanır.', 'Only a pending reservation can be confirmed.'))
  if (r!.price?.blockers.length) fail(B(`Fiyat hesaplanamadı: ${r!.price.blockers[0]}`, `The price cannot be calculated: ${r!.price.blockers[0]}`))
  if (r!.vehicleId) assertVehicleFree(d, r!.vehicleId, r!.pickupAt, r!.returnAt, { reservationId: id })
  // V1: a confirmation is tied to a specific vehicle. A class request stays pending and holds nothing; class capacity is the V1.5 concept (preview only).
  else if (d.session.preview) assertClassCapacity(d, r!, id)
  else fail(B('Onay için belirli bir araç seçin. Sınıf bazlı kayıt yalnız “bekleyen” kalır ve henüz belirli bir aracı ayırmaz (sınıf kapasitesi V1.5).', 'Choose a specific vehicle to confirm. A class-based record stays pending and does not reserve a specific vehicle yet (class capacity is V1.5).'), { vehicle: B('Onay için belirli araç gerekir', 'A specific vehicle is needed to confirm') }, 'VEHICLE_REQUIRED')
  checkCorporateCredit(d, r!.corporateId, r!.currency, r!.price?.grossMinor ?? 0)
  r!.status = 'confirmed'
  addHistory(d, r!.history, B('Onaylandı', 'Approved'), r!.vehicleId ? B('Rezervasyon onaylandı; araç tahsisi kapasite tutuyor.', 'Reservation confirmed; the vehicle allocation holds capacity.') : B('Rezervasyon onaylandı; yalnız sınıf: belirli bir araç tahsis edilmedi.', 'Reservation confirmed; class-only: no specific vehicle allocated.'))
  logEvent(d, { module: 'reservations', type: 'ReservationConfirmed', sourceType: 'reservation', sourceId: id, summary: B(`${r!.no} onaylandı`, `${r!.no} confirmed`), before: 'pending', after: 'confirmed', branchId: r!.pickupBranchId })
  return r!
}

export function assignVehicle(d: Db, id: Id, vehicleId: Id): Reservation {
  need(d, 'reservations:manage', B('Araç atama', 'Assigning a vehicle'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status === 'converted' || r!.status === 'cancelled' || r!.status === 'no_show') fail(B('Bu rezervasyona araç atanamaz.', 'A vehicle cannot be assigned to this reservation.'))
  const v = assertVehicleFree(d, vehicleId, r!.pickupAt, r!.returnAt, { reservationId: id })
  if (v.classId !== r!.classId) fail(B('Seçilen araç rezervasyonun sınıfında değil.', 'The chosen vehicle is not in the reservation\'s class.'))
  r!.vehicleId = vehicleId
  addHistory(d, r!.history, B('Araç atandı', 'Vehicle assigned'), B(`${v.plate} atandı (sınıf rezervasyonu belirli araca bağlandı).`, `${v.plate} assigned (the class reservation is now tied to a specific vehicle).`))
  logEvent(d, { module: 'reservations', type: 'VehicleAssigned', sourceType: 'reservation', sourceId: id, summary: `${r!.no} → ${v.plate}` })
  return r!
}

export function cancelReservation(d: Db, id: Id, reason: string): Reservation {
  need(d, 'reservations:manage', B('İptal', 'Cancellation'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status === 'converted') fail(B('Kiralamaya dönüşmüş rezervasyon iptal edilemez; kiralamayı iptal edin.', 'A reservation that became a rental cannot be cancelled; cancel the rental.'))
  if (r!.status === 'cancelled') fail(B('Zaten iptal edilmiş.', 'Already cancelled.'))
  if (reason.trim().length < 3) fail(B('İptal gerekçesi yazın.', 'Enter a reason for the cancellation.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  r!.status = 'cancelled'
  r!.cancelReason = reason
  const held = d.payments.filter((p) => p.reservationId === id && p.kind === 'advance' && p.status === 'recorded')
  addHistory(d, r!.history, B('İptal edildi', 'Cancelled'), reason + (held.length ? B(` · ${held.length} kaparo tutuluyor: politika bedeli otomatik hesaplandı, kalanın iadesi için talep açın.`, ` · ${held.length} advance(s) held: the policy fee was computed automatically; open a refund request for the rest.`) : ''))
  applyCancellationPolicy(d, id, 'cancel')
  logEvent(d, { module: 'reservations', type: 'ReservationCancelled', sourceType: 'reservation', sourceId: id, summary: `${r!.no} iptal`, reason, before: 'active', after: 'cancelled' })
  return r!
}

export function markNoShow(d: Db, id: Id): Reservation {
  need(d, 'reservations:manage', B('Gelmedi işlemi', 'No-show action'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status !== 'confirmed') fail(B('Yalnız onaylı rezervasyon "gelmedi" yapılabilir.', 'Only a confirmed reservation can be marked as a no-show.'))
  if (Date.parse(r!.pickupAt) > Date.parse(nowOf(d))) fail(B('Teslim zamanı henüz gelmedi.', 'The pickup time has not come yet.'))
  r!.status = 'no_show'
  addHistory(d, r!.history, 'Gelmedi', B('Müşteri gelmedi; araç tahsisi serbest bırakıldı. Kaparo otomatik gelir sayılmaz; gelmeme politika bedeli otomatik hesaplanır.', 'The customer did not show up; the vehicle hold was released. An advance does not automatically become revenue; the no-show policy fee is computed automatically.'))
  applyCancellationPolicy(d, id, 'no_show')
  logEvent(d, { module: 'reservations', type: 'ReservationNoShow', sourceType: 'reservation', sourceId: id, summary: `${r!.no} gelmedi`, before: 'confirmed', after: 'no_show' })
  return r!
}

// --------------------------------------------------------------------------- rentals

function coverageOf(d: Db, insuranceId: Id | undefined, cur: string): Rental['coverageSnapshot'] {
  const p = insuranceId ? d.insurance.find((x) => x.id === insuranceId) : undefined
  if (!p) return undefined
  return { name: p.name, code: p.code, deductible: { minor: p.deductible[cur] ?? 0, cur }, dailyPrice: { minor: p.dailyPrice[cur] ?? 0, cur } }
}

export interface RentalInput {
  reservationId?: Id
  customerId: Id
  corporateId?: Id
  drivers: Id[]
  vehicleId: Id
  classId: Id
  pickupBranchId: Id
  returnBranchId: Id
  plannedPickupAt: Iso
  plannedReturnAt: Iso
  currency: string
  extras: { extraId: Id; qty: number }[]
  insuranceId?: Id
  notes?: string
  price?: PriceSnapshot | null
  approvedDiscountPct?: number
}

export function createRental(d: Db, input: RentalInput): Rental {
  need(d, 'rentals:manage', B('Kiralama hazırlama', 'Preparing a rental'))
  validateWindow(input.plannedPickupAt, input.plannedReturnAt)
  const vehicle = assertVehicleFree(d, input.vehicleId, input.plannedPickupAt, input.plannedReturnAt, { reservationId: input.reservationId })
  if (vehicle.classId !== input.classId) fail(B('Araç seçilen sınıfta değil.', 'The vehicle is not in the chosen class.'))
  const snap =
    input.price ??
    snapshotFor(d, { classId: input.classId, from: input.plannedPickupAt, to: input.plannedReturnAt, pickupBranchId: input.pickupBranchId, returnBranchId: input.returnBranchId, currency: input.currency, extras: input.extras, insuranceId: input.insuranceId, corporateId: input.corporateId, approvedDiscountPct: input.approvedDiscountPct }, { drivers: input.drivers, customerId: input.customerId })
  if (snap.blockers.length) fail(B(`Fiyat hesaplanamadı: ${snap.blockers[0]}`, `The price cannot be calculated: ${snap.blockers[0]}`))
  if (!input.reservationId) checkCorporateCredit(d, input.corporateId, input.currency, snap.grossMinor)
  const dep = evaluateDepositPolicy(d, input.classId, input.insuranceId, input.currency)
  const rental: Rental = {
    id: nextId(d, 'rn'),
    no: nextNo(d, 'K'),
    status: 'prepared',
    financeStatus: 'open',
    reservationId: input.reservationId,
    customerId: input.customerId,
    corporateId: input.corporateId,
    drivers: input.drivers.map((c, i) => ({ customerId: c, primary: i === 0 })),
    vehicleId: input.vehicleId,
    classId: input.classId,
    pickupBranchId: input.pickupBranchId,
    returnBranchId: input.returnBranchId,
    plannedPickupAt: input.plannedPickupAt,
    plannedReturnAt: input.plannedReturnAt,
    currency: input.currency,
    extras: input.extras,
    insuranceId: input.insuranceId,
    coverageSnapshot: coverageOf(d, input.insuranceId, input.currency),
    price: snap,
    approvedDiscountPct: input.approvedDiscountPct,
    deposit: { required: dep.ok ? dep.required : { minor: 0, cur: input.currency }, state: dep.ok && dep.required.minor > 0 ? 'requested' : 'none', note: dep.message ?? '' },
    contract: { signed: false },
    extensions: [],
    swaps: [],
    gate: { docsChecked: false, driverOk: false, note: '' },
    notes: input.notes ?? '',
    createdAt: nowOf(d),
    createdBy: meOf(d).id,
    history: [],
  }
  d.rentals.push(rental)
  addHistory(d, rental.history, B('Hazırlandı', 'Prepared'), B(`Kiralama hazırlandı · ${vehicle.plate}${input.reservationId ? B(' · rezervasyondan dönüştürüldü', ' · converted from a reservation') : ''}. Teslim için Teslim Masası kontrolleri gerekir.`, `Rental prepared · ${vehicle.plate}${input.reservationId ? B(' · rezervasyondan dönüştürüldü', ' · converted from a reservation') : ''}. Handover needs the Delivery Desk checks.`))
  logEvent(d, { module: 'rentals', type: 'RentalCreated', sourceType: 'rental', sourceId: rental.id, summary: B(`${rental.no} hazırlandı · ${vehicle.plate}`, `${rental.no} prepared · ${vehicle.plate}`), branchId: rental.pickupBranchId, cur: rental.currency, minor: snap.grossMinor })
  tryIssueContract(d, rental)
  return rental
}

export function convertReservation(d: Db, id: Id): Rental {
  need(d, 'rentals:manage', B('Kiralamaya dönüştürme', 'Converting to a rental'))
  const r = find.reservation(d, id)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  if (r!.status !== 'confirmed') fail(B('Yalnız onaylı rezervasyon kiralamaya dönüştürülür.', 'Only a confirmed reservation can be converted to a rental.'))
  if (!r!.vehicleId) fail(B('Sınıf rezervasyonuna önce belirli bir araç atayın; tek tıkla sınıf kiralaması açılmaz.', 'Assign a specific vehicle to the class reservation first; a class rental is never opened with one click.'), { vehicle: B('Araç atayın', 'Assign a vehicle') })
  const rental = createRental(d, {
    reservationId: id,
    customerId: r!.customerId,
    corporateId: r!.corporateId,
    drivers: r!.drivers.map((x) => x.customerId),
    vehicleId: r!.vehicleId!,
    classId: r!.classId,
    pickupBranchId: r!.pickupBranchId,
    returnBranchId: r!.returnBranchId,
    plannedPickupAt: r!.pickupAt,
    plannedReturnAt: r!.returnAt,
    currency: r!.currency,
    extras: r!.extras,
    insuranceId: r!.insuranceId,
    notes: r!.notes,
    price: r!.price,
    approvedDiscountPct: r!.approvedDiscountPct,
  })
  r!.status = 'converted'
  r!.rentalId = rental.id
  for (const p of d.payments.filter((x) => x.reservationId === id && x.kind === 'advance' && x.status === 'recorded')) {
    p.rentalId = rental.id
    p.advanceState = 'transferred'
  }
  addHistory(d, r!.history, B('Kiralamaya dönüştürüldü', 'Converted to a rental'), B(`${rental.no} oluşturuldu. Kaparo ayrıca aktarılır; hesap kalemi Teslim'de doğar.`, `${rental.no} created. The advance is transferred separately; the charge arises at handover.`))
  logEvent(d, { module: 'reservations', type: 'ReservationConverted', sourceType: 'reservation', sourceId: id, summary: `${r!.no} → ${rental.no}`, before: 'confirmed', after: 'converted' })
  return rental
}

export function updateGate(d: Db, rentalId: Id, patch: Partial<Rental['gate']>): void {
  need(d, 'rentals:handover', B('Teslim kontrolü', 'Handover check'))
  const r = find.rental(d, rentalId)
  if (!r || r.status !== 'prepared') fail(B('Kiralama teslime hazır değil.', 'The rental is not ready for handover.'))
  Object.assign(r!.gate, patch)
}

export function cancelRental(d: Db, id: Id, reason: string): void {
  need(d, 'rentals:manage', B('Kiralama iptali', 'Cancelling a rental'))
  const r = find.rental(d, id)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'prepared') fail(B('Yalnız teslim öncesi (hazırlanan) kiralama iptal edilir. Teslim edilmiş kiralama iade veya istisnai kapanış ile sonlanır.', 'Only a rental before handover (prepared) can be cancelled. A delivered rental ends by return or exception closure.'))
  if (reason.trim().length < 3) fail(B('İptal gerekçesi yazın.', 'Enter a reason for the cancellation.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  r!.status = 'cancelled'
  r!.closeReason = reason
  addHistory(d, r!.history, B('İptal edildi', 'Cancelled'), reason)
  logEvent(d, { module: 'rentals', type: 'RentalCancelled', sourceType: 'rental', sourceId: id, summary: `${r!.no} iptal`, reason, before: 'prepared', after: 'cancelled' })
}

// --------------------------------------------------------------------------- contract (internal, in-person signature)

export function tryIssueContract(d: Db, rental: Rental): Contract | null {
  const customer = find.customer(d, rental.customerId)
  const lang = customer?.language ?? 'en'
  const tpl = d.templates.find((t) => t.active && t.lang === lang) ?? d.templates.find((t) => t.active)
  if (!tpl) return null
  return issueContract(d, rental.id, tpl.id)
}

export function issueContract(d: Db, rentalId: Id, templateId: Id): Contract {
  need(d, 'contracts:manage', B('Sözleşme düzenleme', 'Editing a contract'))
  const rental = find.rental(d, rentalId)
  if (!rental) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  const tpl = d.templates.find((t) => t.id === templateId)
  if (!tpl) fail(B('Şablon bulunamadı.', 'Template not found.'))
  if (!tpl!.seriesPrefix.trim()) fail(B('Şablonda sözleşme numara serisi tanımlı değil (Ayarlar → Sözleşme Dilleri).', 'The template has no contract number series (Settings → Contract Languages).'))
  const customer = find.customer(d, rental!.customerId)!
  const vehicle = find.vehicle(d, rental!.vehicleId)!
  const tz = tzOf(d, rental!.pickupBranchId)
  const prev = d.contracts.filter((c) => c.rentalId === rentalId).sort((a, b) => b.version - a.version)[0]
  if (prev?.status === 'signed') fail(B('İmzalı sözleşme değiştirilemez; yeni sürüm için önce kiralama koşullarını düzeltin ve yeni sürüm üretin (imza miras alınmaz).', 'A signed contract cannot be changed; to issue a new version first correct the rental terms and issue a new version (the signature is not inherited).')) // new version only via explicit reissue
  if (prev) prev.status = 'superseded'
  const price = rental!.price
  const contract: Contract = {
    id: nextId(d, 'ct'),
    no: nextNo(d, tpl!.seriesPrefix),
    rentalId,
    templateId: tpl!.id,
    templateVersion: tpl!.version,
    version: (prev?.version ?? 0) + 1,
    lang: tpl!.lang,
    status: 'issued',
    issuedAt: nowOf(d),
    issuedBy: meOf(d).id,
    snapshot: {
      title: tpl!.name,
      clauses: tpl!.clauses.map((c) => ({ title: c.title, body: c.body })),
      renterName: customer.name + (rental!.drivers.length > 1 ? B(` + ${rental!.drivers.length - 1} ek sürücü`, ` + ${rental!.drivers.length - 1} additional driver(s)`) : ''),
      vehicle: `${vehicle.plate} · ${vehicle.make} ${vehicle.model} (${vehicle.year})`,
      period: `${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(rental!.plannedPickupAt))} → ${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(rental!.plannedReturnAt))}`,
      totals: price ? `${fmt(price.grossMinor, price.cur)} (KDV ${price.taxLines[0]?.mode === 'exclusive' ? B('hariç', 'excl.') : 'dahil'})` : B('Hesaplanmadı', 'Not calculated'),
      coverage: rental!.coverageSnapshot ? `${rental!.coverageSnapshot.name} · muafiyet ${fmt(rental!.coverageSnapshot.deductible.minor, rental!.coverageSnapshot.deductible.cur)}` : B('Sigorta paketi seçilmedi', 'No cover package chosen'),
      deposit: rental!.deposit.required.minor > 0 ? fmt(rental!.deposit.required.minor, rental!.deposit.required.cur) : B('Depozito yok', 'No deposit'),
    },
  }
  d.contracts.push(contract)
  rental!.contract = { id: contract.id, signed: false }
  addHistory(d, rental!.history, B('Sözleşme', 'Contract'), B(`${contract.no} (sürüm ${contract.version}) üretildi; imza bekliyor.`, `${contract.no} (version ${contract.version}) issued; awaiting signature.`))
  logEvent(d, { module: 'contracts', type: 'ContractIssued', sourceType: 'contract', sourceId: contract.id, summary: `${contract.no} v${contract.version} · ${rental!.no}` })
  return contract
}

/** In-person web signature: the renter signs on the staff device. This is internal capture, not an e-signature service. */
export function signContract(d: Db, rentalId: Id, signerName: string, confirmed: boolean): void {
  need(d, 'rentals:handover', B('Sözleşme imzası', 'Contract signature'))
  const rental = find.rental(d, rentalId)
  const contract = d.contracts.find((c) => c.id === rental?.contract.id)
  if (!rental || !contract) fail(B('Önce sözleşme üretin.', 'Issue a contract first.'))
  if (contract!.status !== 'issued') fail(B('Bu sözleşme sürümü imzaya açık değil.', 'This contract version is not open for signature.'))
  const customer = find.customer(d, rental!.customerId)!
  if (signerName.trim().toLowerCase() !== customer.name.toLowerCase()) fail(B(`İmza atan kişi kiracı adıyla ("${customer.name}") aynı olmalı.`, `The signer must match the renter's name ("${customer.name}").`), { signer: B('Kiracı adını yazın', 'Enter the renter\'s name') })
  if (!confirmed) fail(B('Kiracının sözleşmeyi okuduğunu onaylayın.', 'Confirm that the renter has read the contract.'), { confirm: B('Onay gerekli', 'Confirmation required') })
  contract!.status = 'signed'
  contract!.signedAt = nowOf(d)
  contract!.signedBy = signerName
  contract!.staffApprovedBy = meOf(d).id
  rental!.contract.signed = true
  rental!.contract.signedAt = nowOf(d)
  rental!.contract.signedBy = signerName
  addHistory(d, rental!.history, B('Sözleşme imzalandı', 'Contract signed'), B(`${contract!.no} yüz yüze (cihaz üzerinde) imzalandı; personel onayı: ${meOf(d).name}.`, `${contract!.no} signed in person (on the device); staff approval: ${meOf(d).name}.`))
  logEvent(d, { module: 'contracts', type: 'ContractSigned', sourceType: 'contract', sourceId: contract!.id, summary: B(`${contract!.no} imzalandı`, `${contract!.no} signed`) })
}

// --------------------------------------------------------------------------- delivery desk

export interface DeskItem {
  key: string
  label: string
  ok: boolean
  detail: string
  /** Where to fix it. */
  fix?: { type: 'vehicle' | 'customer' | 'rental' | 'maintenance' | 'damage' | 'tab'; id?: Id; tab?: string }
}

export function driversOf(d: Db, r: Rental): Customer[] {
  return r.drivers.map((x) => find.customer(d, x.customerId)).filter((x): x is Customer => !!x)
}

export function deliveryChecks(d: Db, rentalId: Id, draft?: { km?: number; fuel?: FuelLevel; photos?: number }): { items: DeskItem[]; canDeliver: boolean } {
  const r = find.rental(d, rentalId)
  if (!r) return { items: [], canDeliver: false }
  const items: DeskItem[] = []
  const drivers = driversOf(d, r)
  const now = nowOf(d)
  // 1. documents of every driver
  const docIssues: string[] = []
  for (const c of drivers) for (const chk of customerDocChecks(d, c, now, r.plannedReturnAt)) if (chk.state === 'missing' || chk.state === 'expired') docIssues.push(`${c.name}: ${DOC_LABEL[chk.kind] ?? chk.kind} ${chk.state === 'missing' ? 'eksik' : L('geçersiz', 'invalid')}`)
  items.push({ key: 'docs', label: L('Sürücü belgeleri', 'Driver documents'), ok: docIssues.length === 0 && r.gate.docsChecked, detail: docIssues.length ? docIssues.join(' · ') : r.gate.docsChecked ? L('Belgeler kontrol edildi (personel beyanı)', 'Documents checked (staff statement)') : L('Belgeler geçerli; personel kontrolünü işaretleyin', 'Documents are valid; tick the staff check'), fix: { type: 'customer', id: r.customerId } })
  // 2. driver eligibility
  const elig = drivers.map((c) => ({ c, e: evaluateDriverEligibility(d, c, r.plannedPickupAt, r.plannedReturnAt) }))
  const bad = elig.filter((x) => !x.e.eligible)
  items.push({ key: 'driver', label: L('Sürücü uygunluğu (yaş, ehliyet yılı)', 'Driver eligibility (age, licence years)'), ok: bad.length === 0 && r.gate.driverOk, detail: bad.length ? bad.map((x) => `${x.c.name}: ${x.e.reasons.join(' ')}`).join(' · ') : r.gate.driverOk ? L('Uygun (personel beyanı)', 'Eligible (staff statement)') : L('Uygun; personel onayını işaretleyin', 'Eligible; tick the staff confirmation') })
  // 3. vehicle readiness
  const v = find.vehicle(d, r.vehicleId)!
  const ready = readinessOf(d, v, now)
  items.push({ key: 'ready', label: L('Araç hazırlığı', 'Vehicle readiness'), ok: ready.ready, detail: ready.ready ? L('Araç teslime hazır', 'Vehicle is ready for handover') : ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ') + ' sorunlu', fix: { type: 'vehicle', id: v.id, tab: 'kontroller' } })
  // 4. availability
  const free = checkVehicleAvailable(d, v, r.plannedPickupAt, r.plannedReturnAt, now, { rentalId: r.id, reservationId: r.reservationId })
  items.push({ key: 'avail', label: L('Araç uygunluğu', 'Vehicle availability'), ok: free.ok, detail: free.ok ? L('Çakışan kayıt yok', 'No conflicting record') : free.conflicts.map((c) => c.label).join(', '), fix: { type: 'vehicle', id: v.id, tab: 'musaitlik' } })
  // 5. contract
  const c = d.contracts.find((x) => x.id === r.contract.id)
  items.push({ key: 'contract', label: L('Sözleşme ve imza', 'Contract and signature'), ok: !!c && c.status === 'signed', detail: !c ? L('Sözleşme üretilmedi', 'No contract issued') : c.status === 'signed' ? L(`${c.no} imzalandı`, `${c.no} signed`) : `${c.no} imza bekliyor`, fix: { type: 'tab', tab: 'sozlesme' } })
  // 6. deposit
  const need0 = r.deposit.required.minor > 0
  const depOk = !need0 || r.deposit.state === 'held' || r.deposit.state === 'waived'
  items.push({ key: 'deposit', label: L('Depozito kararı', 'Deposit decision'), ok: depOk, detail: !need0 ? L('Depozito gerekmiyor', 'No deposit required') : depOk ? (r.deposit.state === 'held' ? `${fmt(r.deposit.required.minor, r.deposit.required.cur)} tutuluyor` : L('Muaf (gerekçeli)', 'Waived (with a reason)')) : L(`${fmt(r.deposit.required.minor, r.deposit.required.cur)} depozito alınmadı`, `${fmt(r.deposit.required.minor, r.deposit.required.cur)} deposit not taken`), fix: { type: 'tab', tab: 'finans' } })
  // 7. handover evidence
  const km = draft?.km
  const ph = draft?.photos ?? 0
  items.push({ key: 'evidence', label: L('Teslim kanıtı (km, yakıt, 4–5 fotoğraf)', 'Handover evidence (km, fuel, 4–5 photos)'), ok: km !== undefined && km >= v.odometerKm && !!draft?.fuel && ph >= 4, detail: km === undefined ? 'Kilometre girilmedi' : km < v.odometerKm ? L(`Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz`, `The odometer cannot be below the current reading (${v.odometerKm})`) : ph < 4 ? L(`Fotoğraf ${ph}/4`, `Photos ${ph}/4`) : 'Tamam' })
  return { items, canDeliver: items.every((i) => i.ok) }
}

export function setDepositWaiver(d: Db, rentalId: Id, reason: string): void {
  need(d, 'rentals:manage', B('Depozito muafiyeti', 'Deposit waiver'))
  const r = find.rental(d, rentalId)
  if (!r || r.status !== 'prepared') fail(B('Kiralama teslime hazır değil.', 'The rental is not ready for handover.'))
  if (!d.settings.thresholds.corporateOverride && reason.trim().length < 5) fail(B('Gerekçe yazın.', 'Enter a reason.'))
  if (reason.trim().length < 5) fail(B('Muafiyet gerekçesi yazın.', 'Enter a reason for the waiver.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  r!.deposit.state = 'waived'
  r!.deposit.note = reason
  addHistory(d, r!.history, B('Depozito muaf', 'Deposit waived'), reason)
  logEvent(d, { module: 'rentals', type: 'DepositWaived', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} depozito muafiyeti`, `${r!.no} deposit waiver`), reason })
}

export interface HandoverInput {
  km: number
  fuel: FuelLevel
  photos: number
  pins: InspectionPin[]
  note?: string
}

export function makeInspection(d: Db, input: HandoverInput): Inspection {
  const labels = [B('Ön', 'Front'), 'Arka', 'Sol', B('Sağ', 'Right'), B('İç mekan', 'Interior'), B('Kilometre göstergesi', 'Odometer')]
  return {
    at: nowOf(d),
    by: meOf(d).id,
    km: input.km,
    fuel: input.fuel,
    photos: Array.from({ length: input.photos }, (_, i) => ({ id: nextId(d, 'ph'), label: labels[i] ?? B(`Fotoğraf ${i + 1}`, `Photo ${i + 1}`), tone: ['#cfd8ea', '#d9e4dc', '#eadfd0', '#e3d5e6', '#d6e5e8', '#ece6cf'][i % 6]! })),
    pins: input.pins,
    checks: {},
    note: input.note ?? '',
  }
}

export function deliverRental(d: Db, rentalId: Id, input: HandoverInput): Rental {
  need(d, 'rentals:handover', B('Araç teslimi', 'Vehicle handover'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'prepared') fail(B('Bu kiralama zaten teslim edilmiş veya kapanmış (tek teslim, tek hesap kalemi).', 'This rental was already delivered or closed (one handover, one charge).'))
  const desk = deliveryChecks(d, rentalId, { km: input.km, fuel: input.fuel, photos: input.photos })
  const blocker = desk.items.find((i) => !i.ok)
  if (blocker) fail(B(`Teslim yapılamaz: ${blocker.label} — ${blocker.detail}`, `Handover is not possible: ${blocker.label} — ${blocker.detail}`), {}, 'DELIVERY_BLOCKED')
  const v = find.vehicle(d, r!.vehicleId)!
  r!.status = 'delivered'
  r!.actualPickupAt = nowOf(d)
  r!.handover = makeInspection(d, input)
  v.location = 'customer'
  v.odometerKm = input.km
  v.fuel = input.fuel
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: input.km, at: nowOf(d), source: 'handover', refType: 'rental', refId: r!.id, by: meOf(d).id })
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: 'customer', reason: B(`Teslim ${r!.no}`, `Handover ${r!.no}`), refType: 'rental', refId: r!.id })
  // Delivered → exactly one base charge (idempotency key), then held advances are applied.
  const gross = r!.price?.grossMinor ?? 0
  postCharge(d, { rentalId, kind: 'base', label: B(`Kiralama bedeli · ${r!.price?.days ?? 0} gün (fiyat sürümü ${r!.price?.revisionId})`, `Rental charge · ${r!.price?.days ?? 0} day(s) (price version ${r!.price?.revisionId})`), amountMinor: gross, taxMinor: r!.price?.taxMinor ?? 0, key: `${rentalId}:delivered:base`, sourceType: 'rental', sourceId: rentalId })
  applyHeldAdvances(d, r!)
  addHistory(d, r!.history, B('Teslim edildi', 'Delivered'), B(`${v.plate} müşteriye teslim edildi · ${input.km} km · yakıt ${input.fuel}. Kiralama bedeli hesap kalemi olarak kaydedildi (bir kez).`, `${v.plate} handed to the customer · ${input.km} km · fuel ${input.fuel}. The rental charge was posted once.`))
  logEvent(d, { module: 'rentals', type: 'VehicleDelivered', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} teslim edildi · ${v.plate}`, `${r!.no} delivered · ${v.plate}`), before: 'prepared', after: 'delivered', branchId: r!.pickupBranchId })
  accrueCommission(d, r!, 'delivered')
  return r!
}

// --------------------------------------------------------------------------- return, extension, swap, closing

export interface ReturnInput extends HandoverInput {
  openDamage?: boolean
  damageDescription?: string
  damageSeverity?: 'minor' | 'moderate' | 'severe'
  blocksVehicle?: boolean
}

export function previewReturnFees(d: Db, r: Rental, input: { km: number; fuel: FuelLevel }, at: Iso): { label: string; minor: number }[] {
  const fees: { label: string; minor: number }[] = []
  const grace = d.settings.duration.graceMinutes * 60_000
  const late = Date.parse(at) - Date.parse(r.plannedReturnAt) - grace
  const dailyBase = r.price?.lines.find((l) => l.kind === 'base')?.unitMinor ?? 0
  if (late > 0 && dailyBase > 0) {
    const hours = Math.ceil(late / HOUR)
    const fullDays = Math.floor(hours / 24)
    const rem = hours % 24
    const fee = fullDays * dailyBase + Math.min(dailyBase, roundHalf((dailyBase * d.settings.duration.lateFeePerHourPct * rem) / 100))
    if (fee > 0) fees.push({ label: L(`Geç iade · ${hours} saat`, `Late return · ${hours} h`), minor: fee })
  }
  const start = r.handover
  if (start) {
    const steps = fuelRank(start.fuel) - fuelRank(input.fuel)
    const row = d.settings.duration.fuelFeePerQuarter[r.currency]
    if (steps > 0 && row !== undefined) fees.push({ label: L(`Yakıt farkı · ${steps} çeyrek`, `Fuel difference · ${steps} quarter(s)`), minor: steps * row })
    const driven = input.km - start.km
    const days = r.price?.days ?? 1
    const over = driven - days * d.settings.duration.kmPerDay
    const rate = d.settings.duration.kmOverageFee[r.currency]
    if (over > 0 && rate !== undefined) fees.push({ label: L(`Km aşımı · ${over} km`, `Km overage · ${over} km`), minor: over * rate })
  }
  return fees
}

export function returnRental(d: Db, rentalId: Id, input: ReturnInput): Rental {
  need(d, 'rentals:handover', B('Araç iadesi', 'Vehicle return'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'delivered') fail(B('Yalnız teslim edilmiş kiralama iade alınır.', 'Only a delivered rental can be received back.'))
  const v = find.vehicle(d, r!.vehicleId)!
  const startKm = r!.handover?.km ?? v.odometerKm
  if (input.km < startKm) fail(B(`İade kilometresi teslim kilometresinden (${startKm}) küçük olamaz.`, `The return odometer cannot be below the handover reading (${startKm}).`), { km: B('Geçersiz kilometre', 'Invalid odometer') })
  if (input.photos < 4) fail(B('İade kanıtı için en az 4 fotoğraf gerekir.', 'At least 4 photos are needed as return evidence.'), { photos: B('En az 4 fotoğraf', 'At least 4 photos') })
  const now = nowOf(d)
  const fees = previewReturnFees(d, r!, input, now)
  r!.status = 'returned'
  r!.actualReturnAt = now
  r!.ret = makeInspection(d, input)
  v.location = r!.returnBranchId
  v.odometerKm = input.km
  v.fuel = input.fuel
  // A returned vehicle is not automatically ready: it needs cleaning and a readiness check.
  v.readiness = { ...v.readiness, clean: false, checkedAt: null, checkedBy: null, fuelOk: fuelRank(input.fuel) >= 2 }
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: input.km, at: now, source: 'return', refType: 'rental', refId: r!.id, by: meOf(d).id })
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: now, location: r!.returnBranchId, reason: B(`İade ${r!.no}`, `Return ${r!.no}`), refType: 'rental', refId: r!.id })
  for (const f of fees) {
    const kind = f.label.startsWith('Geç') ? 'late' : f.label.startsWith('Yakıt') ? 'fuel' : 'km'
    postCharge(d, { rentalId, kind, label: f.label, amountMinor: f.minor, key: `${rentalId}:returned:${kind}`, sourceType: 'rental', sourceId: rentalId })
  }
  let damageNote = ''
  if (input.openDamage) {
    const dmg = createDamage(d, { vehicleId: v.id, rentalId, severity: input.damageSeverity ?? 'minor', area: B('İade kontrolü', 'Return inspection'), description: input.damageDescription || B('İade kontrolünde yeni bulgu', 'New finding at the return inspection'), photos: input.photos, blocksVehicle: !!input.blocksVehicle })
    damageNote = B(` Hasar dosyası ${dmg.no} açıldı (ücret otomatik yazılmadı).`, ` Damage file ${dmg.no} opened (no charge was posted automatically).`)
  }
  addHistory(d, r!.history, B('İade alındı', 'Returned'), B(`${v.plate} iade alındı · ${input.km} km · yakıt ${input.fuel}.${fees.length ? ` Ek kalemler: ${fees.map((f) => `${f.label} ${fmt(f.minor, r!.currency)}`).join(', ')}.` : ''}${damageNote} Araç hazır değil: temizlik/hazırlık kontrolü gerekir.`, `${v.plate} returned · ${input.km} km · fuel ${input.fuel}.${fees.length ? ` Ek kalemler: ${fees.map((f) => `${f.label} ${fmt(f.minor, r!.currency)}`).join(', ')}.` : ''}${damageNote} The vehicle is not ready: cleaning and a readiness check are needed.`))
  logEvent(d, { module: 'rentals', type: 'VehicleReturned', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} iade alındı · ${v.plate}`, `${r!.no} returned · ${v.plate}`), before: 'delivered', after: 'returned', branchId: r!.returnBranchId })
  accrueCommission(d, r!, 'returned')
  return r!
}

export function closeOperational(d: Db, rentalId: Id): void {
  need(d, 'rentals:handover', B('Operasyonel kapanış', 'Operational closure'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'returned') fail(B('Yalnız iade alınmış kiralama operasyonel olarak kapatılır.', 'Only a returned rental can be closed operationally.'))
  r!.status = 'closed'
  r!.closeKind = 'normal'
  addHistory(d, r!.history, B('Operasyonel kapanış', 'Operational closure'), B('Kiralama operasyonel olarak kapandı. Finansal kapanış ayrıdır; borç otomatik silinmez.', 'The rental was closed operationally. Financial closure is separate; the debt is not erased automatically.'))
  logEvent(d, { module: 'rentals', type: 'RentalClosed', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} operasyonel kapandı`, `${r!.no} closed operationally`), before: 'returned', after: 'closed' })
  accrueCommission(d, r!, 'closed')
}

export function financialCloseChecks(d: Db, rentalId: Id): { items: { key: string; label: string; ok: boolean; detail: string }[]; canClose: boolean } {
  const r = find.rental(d, rentalId)
  const items: { key: string; label: string; ok: boolean; detail: string }[] = []
  if (!r) return { items, canClose: false }
  const f = rentalFinance(d, rentalId)
  items.push({ key: 'op', label: L('Operasyonel durum', 'Operational status'), ok: r.status === 'closed' || r.status === 'exception_closed' || r.status === 'loss_closed' || r.status === 'cancelled', detail: L(`Durum: ${({ prepared: L('Hazırlanıyor', 'Preparing'), delivered: L('Teslim edildi (araç müşteride)', 'Delivered (vehicle with the customer)'), returned: L('İade alındı, kapanmadı', 'Returned, not closed'), closed: L('Kapandı', 'Closed'), cancelled: L('İptal', 'Cancellation'), exception_closed: L('İstisnai kapandı', 'Closed as an exception'), loss_closed: L('Kayıp kapanışı', 'Closed as a loss') } as Record<string, string>)[r.status] ?? r.status}`, `Status: ${({ prepared: L('Hazırlanıyor', 'Preparing'), delivered: L('Teslim edildi (araç müşteride)', 'Delivered (vehicle with the customer)'), returned: L('İade alındı, kapanmadı', 'Returned, not closed'), closed: L('Kapandı', 'Closed'), cancelled: L('İptal', 'Cancellation'), exception_closed: L('İstisnai kapandı', 'Closed as an exception'), loss_closed: L('Kayıp kapanışı', 'Closed as a loss') } as Record<string, string>)[r.status] ?? r.status}`) })
  items.push({ key: 'outstanding', label: L('Açık bakiye', 'Open balance'), ok: f.outstandingMinor === 0, detail: f.outstandingMinor ? L(`${fmt(f.outstandingMinor, f.cur)} ödenmemiş`, `${fmt(f.outstandingMinor, f.cur)} unpaid`) : L('Bakiye yok', 'No balance') })
  items.push({ key: 'unapplied', label: L('Uygulanmamış ödeme', 'Unapplied payment'), ok: f.unappliedMinor === 0, detail: f.unappliedMinor ? L(`${fmt(f.unappliedMinor, f.cur)} uygulanmadı`, `${fmt(f.unappliedMinor, f.cur)} not applied`) : L('Yok', 'None') })
  const held = d.deposits.filter((x) => x.rentalId === rentalId && x.state === 'held')
  items.push({ key: 'deposit', label: L('Depozito çözümü', 'Deposit resolution'), ok: held.length === 0, detail: held.length ? L('Tutulan depozito var: iade edin veya mahsup edin', 'A deposit is held: release it or apply it to the balance') : L('Çözüldü', 'Resolved') })
  const openAppr = d.approvals.filter((a) => a.target.id === rentalId && (a.status === 'requested' || a.status === 'approved'))
  items.push({ key: 'approvals', label: L('Bekleyen onay', 'Pending approval'), ok: openAppr.length === 0, detail: openAppr.length ? L(`${openAppr.length} onay tamamlanmadı`, `${openAppr.length} approval(s) not completed`) : L('Yok', 'None') })
  const refunds = d.refunds.filter((x) => x.rentalId === rentalId && (x.status === 'requested' || x.status === 'approved'))
  items.push({ key: 'refund', label: L('Sonuçlanmamış iade', 'Unresolved refund'), ok: refunds.length === 0, detail: refunds.length ? L(`${refunds.length} iade bekliyor`, `${refunds.length} refund(s) pending`) : L('Yok', 'None') })
  return { items, canClose: items.every((i) => i.ok) }
}

export function closeFinancial(d: Db, rentalId: Id): void {
  need(d, 'finance:apply', B('Finansal kapanış', 'Financial closure'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  const chk = financialCloseChecks(d, rentalId)
  const bad = chk.items.find((i) => !i.ok)
  if (bad) fail(B(`Finansal kapanış yapılamaz: ${bad.label} — ${bad.detail}`, `Financial closure is not possible: ${bad.label} — ${bad.detail}`))
  r!.financeStatus = 'closed'
  addHistory(d, r!.history, B('Finansal kapanış', 'Financial closure'), B('Finans dosyası kapandı.', 'The finance file was closed.'))
  logEvent(d, { module: 'finance', type: 'FinanceClosed', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} finansal kapandı`, `${r!.no} financially closed`), before: 'open', after: 'closed' })
}

export function reopenFinancial(d: Db, rentalId: Id, reason: string): void {
  need(d, 'finance:apply', B('Finansı yeniden açma', 'Reopening finance'))
  const r = find.rental(d, rentalId)
  if (!r || r.financeStatus !== 'closed') fail(B('Finans dosyası kapalı değil.', 'The finance file is not closed.'))
  if (reason.trim().length < 5) fail(B('Yeniden açma gerekçesi yazın.', 'Enter a reason for reopening.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  r!.financeStatus = 'open'
  addHistory(d, r!.history, B('Finans yeniden açıldı', 'Finance reopened'), reason)
  logEvent(d, { module: 'finance', type: 'FinanceReopened', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} finansı yeniden açıldı`, `${r!.no} finance reopened`), reason, before: 'closed', after: 'open' })
}

export function extendRental(d: Db, rentalId: Id, newReturnAt: Iso, note: string): Rental {
  need(d, 'rentals:manage', B('Kiralama uzatma', 'Extending a rental'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'prepared' && r!.status !== 'delivered') fail(B('Yalnız hazırlanan veya teslim edilmiş kiralama uzatılır.', 'Only a prepared or delivered rental can be extended.'))
  if (Date.parse(newReturnAt) <= Date.parse(r!.plannedReturnAt)) fail(B('Yeni iade zamanı mevcut planlanan iadeden sonra olmalı.', 'The new return time must be after the current planned return.'), { returnAt: B('Daha geç bir zaman seçin', 'Choose a later time') })
  if (note.trim().length < 3) fail(B('Uzatma gerekçesi yazın.', 'Enter a reason for the extension.'), { note: B('Gerekçe zorunlu', 'A reason is required') })
  assertVehicleFree(d, r!.vehicleId, r!.plannedReturnAt, newReturnAt, { rentalId })
  const before = r!.price!
  const next = snapshotFor(d, { classId: r!.classId, from: r!.plannedPickupAt, to: newReturnAt, pickupBranchId: r!.pickupBranchId, returnBranchId: r!.returnBranchId, currency: r!.currency, extras: r!.extras, insuranceId: r!.insuranceId, corporateId: r!.corporateId, approvedDiscountPct: r!.approvedDiscountPct }, { drivers: r!.drivers.map((x) => x.customerId), customerId: r!.customerId })
  if (next.blockers.length) fail(B(`Uzatma fiyatı hesaplanamadı: ${next.blockers[0]}`, `The extension price cannot be calculated: ${next.blockers[0]}`))
  const delta = next.grossMinor - before.grossMinor
  const ext = { id: nextId(d, 'ex'), at: nowOf(d), by: meOf(d).id, fromReturn: r!.plannedReturnAt, toReturn: newReturnAt, deltaMinor: delta, note }
  r!.extensions.push(ext)
  r!.plannedReturnAt = newReturnAt
  r!.price = next
  if (r!.status === 'delivered' && delta > 0) postCharge(d, { rentalId, kind: 'other', label: B(`Uzatma farkı · ${ext.id}`, `Extension difference · ${ext.id}`), amountMinor: delta, key: `${rentalId}:ext:${ext.id}`, sourceType: 'rental', sourceId: rentalId })
  // The deposit and coverage are looked at together with the new period (spec §85.2).
  const dep = evaluateDepositPolicy(d, r!.classId, r!.insuranceId, r!.currency)
  addHistory(d, r!.history, B('Uzatıldı', 'Extended'), B(`İade ${fmt(delta, r!.currency)} farkla uzatıldı (${note}). Sigorta ve depozito yeniden değerlendirildi${dep.ok && dep.required.minor !== r!.deposit.required.minor ? B(`: gerekli depozito ${fmt(dep.required.minor, dep.required.cur)}`, `: required deposit ${fmt(dep.required.minor, dep.required.cur)}`) : B(': değişiklik yok', ': no change')}.`, `Return extended with a difference of ${fmt(delta, r!.currency)} (${note}). Cover and deposit were re-evaluated${dep.ok && dep.required.minor !== r!.deposit.required.minor ? B(`: gerekli depozito ${fmt(dep.required.minor, dep.required.cur)}`, `: required deposit ${fmt(dep.required.minor, dep.required.cur)}`) : B(': değişiklik yok', ': no change')}.`))
  logEvent(d, { module: 'rentals', type: 'RentalExtended', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} uzatıldı`, `${r!.no} extended`), cur: r!.currency, minor: delta, reason: note })
  return r!
}

export function swapVehicle(d: Db, rentalId: Id, newVehicleId: Id, reason: string): Rental {
  need(d, 'rentals:manage', B('Araç değişimi', 'Vehicle swap'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'prepared' && r!.status !== 'delivered') fail(B('Yalnız hazırlanan veya teslim edilmiş kiralamada araç değişir.', 'The vehicle can be swapped only on a prepared or delivered rental.'))
  if (reason.trim().length < 3) fail(B('Değişim gerekçesi yazın.', 'Enter a reason for the swap.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  if (newVehicleId === r!.vehicleId) fail(B('Aynı aracı seçtiniz.', 'You chose the same vehicle.'))
  const nv = assertVehicleFree(d, newVehicleId, r!.actualPickupAt ?? r!.plannedPickupAt, r!.plannedReturnAt, { rentalId })
  const ready = readinessOf(d, nv, nowOf(d))
  if (!ready.ready) fail(B(`${nv.plate} hazır değil: ${ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}.`, `${nv.plate} is not ready: ${ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}.`), {}, 'NOT_READY')
  const old = find.vehicle(d, r!.vehicleId)!
  r!.swaps.push({ id: nextId(d, 'sw'), at: nowOf(d), by: meOf(d).id, fromVehicleId: old.id, toVehicleId: nv.id, reason })
  r!.vehicleId = nv.id
  if (nv.classId !== r!.classId) r!.classId = nv.classId
  if (r!.status === 'delivered') {
    old.location = r!.pickupBranchId
    old.readiness = { ...old.readiness, clean: false, checkedAt: null, checkedBy: null }
    nv.location = 'customer'
  }
  // Coverage and prior price snapshot are kept; any class price difference is a separate, explicit finance step.
  addHistory(d, r!.history, B('Araç değişti', 'Vehicle swapped'), B(`${old.plate} → ${nv.plate} (${reason}). Sigorta ve fiyat anlaşması korundu; fiyat farkı varsa elle kalem eklenir.`, `${old.plate} → ${nv.plate} (${reason}). Cover and the price agreement are kept; any price difference is added manually as a charge.`))
  logEvent(d, { module: 'rentals', type: 'VehicleSwapped', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no}: ${old.plate} → ${nv.plate}`, reason })
  return r!
}

export function exceptionClose(d: Db, rentalId: Id, kind: 'exception' | 'loss', reason: string): void {
  need(d, 'rentals:manage', B('İstisnai kapanış', 'Exception closure'))
  const r = find.rental(d, rentalId)
  if (!r) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  if (r!.status !== 'delivered') fail(B('İstisnai kapanış yalnız teslim edilmiş (araç müşteride) kiralama için yapılır.', 'Exception closure applies only to a delivered rental (vehicle with the customer).'))
  if (reason.trim().length < 10) fail(B('Gerekçeyi en az 10 karakterle açıklayın.', 'Explain the reason in at least 10 characters.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  r!.status = kind === 'loss' ? 'loss_closed' : 'exception_closed'
  r!.closeKind = kind
  r!.closeReason = reason
  r!.actualReturnAt = nowOf(d)
  const v = find.vehicle(d, r!.vehicleId)!
  if (kind === 'loss') {
    v.status = 'out_of_service'
    v.location = 'unknown'
  }
  addHistory(d, r!.history, kind === 'loss' ? B('Kayıp kapanışı', 'Closed as a loss') : B('İstisnai kapanış', 'Exception closure'), B(`${reason}. Normal iade kanıtı zorlanmadı; borç ve depozito ayrıca çözülür.`, `${reason}. Normal return evidence was not forced; debt and deposit are resolved separately.`))
  logEvent(d, { module: 'rentals', type: kind === 'loss' ? 'RentalLossClosed' : 'RentalExceptionClosed', sourceType: 'rental', sourceId: rentalId, summary: B(`${r!.no} ${kind === 'loss' ? B('kayıp', 'loss') : B('istisnai', 'exception')} kapandı`, `${r!.no} closed as ${kind === 'loss' ? B('kayıp', 'loss') : B('istisnai', 'exception')}`), reason, before: 'delivered' })
  notify(d, undefined, B(`${r!.no} istisnai kapandı: finans ve depozito çözümü bekliyor.`, `${r!.no} closed as an exception: finance and deposit resolution pending.`), { type: 'rental', id: rentalId }, 'warning')
}

// --------------------------------------------------------------------------- readiness actions (separate from maintenance)

export function markPrepared(d: Db, vehicleId: Id, note = ''): void {
  need(d, 'vehicles:manage', B('Hazırlık kaydı', 'Readiness record'))
  const v = find.vehicle(d, vehicleId)
  if (!v) fail(B('Araç bulunamadı.', 'Vehicle not found.'))
  v!.readiness = { clean: true, fuelOk: fuelRank(v!.fuel) >= 2, checkedAt: nowOf(d), checkedBy: meOf(d).id, note }
  logEvent(d, { module: 'vehicles', type: 'VehiclePrepared', sourceType: 'vehicle', sourceId: vehicleId, summary: B(`${v!.plate} hazırlandı (temizlik kontrolü)`, `${v!.plate} prepared (cleaning check)`) })
}
export function refuelVehicle(d: Db, vehicleId: Id, level: FuelLevel): void {
  need(d, 'vehicles:manage', B('Yakıt güncelleme', 'Fuel update'))
  const v = find.vehicle(d, vehicleId)
  if (!v) fail(B('Araç bulunamadı.', 'Vehicle not found.'))
  v!.fuel = level
  v!.readiness.fuelOk = fuelRank(level) >= 2
  logEvent(d, { module: 'vehicles', type: 'VehicleRefuelled', sourceType: 'vehicle', sourceId: vehicleId, summary: B(`${v!.plate} yakıt: ${level}`, `${v!.plate} fuel: ${level}`) })
}

// --------------------------------------------------------------------------- partner commission (earned ≠ paid)

export function accrueCommission(d: Db, rental: Rental, stage: 'delivered' | 'returned' | 'closed'): void {
  const res = rental.reservationId ? find.reservation(d, rental.reservationId) : undefined
  const partner = res?.partnerId ? d.partners.find((p) => p.id === res.partnerId) : undefined
  if (!partner || partner.commission.trigger !== stage) return
  if (d.commissions.some((c) => c.rentalId === rental.id && c.partnerId === partner.id)) return
  const base = rental.price?.netMinor ?? 0
  const amount = projectCommission(partner.commission.pct, base)
  d.commissions.push({ id: nextId(d, 'cm'), partnerId: partner.id, rentalId: rental.id, base: { minor: base, cur: rental.currency }, amount: { minor: amount, cur: rental.currency }, status: 'earned', earnedAt: nowOf(d) })
  logEvent(d, { module: 'partners', type: 'CommissionEarned', sourceType: 'partner', sourceId: partner.id, summary: B(`${partner.name} · ${rental.no} komisyonu doğdu (ödenmedi)`, `${partner.name} · commission for ${rental.no} earned (unpaid)`), cur: rental.currency, minor: amount })
}

export const moneyOf = (minor: number, cur: string): Money => ({ minor, cur })
export const daysBetween = (d: Db, from: Iso, to: Iso, branchId: Id) => {
  const tz = tzOf(d, branchId)
  return Math.max(1, Math.round((Date.parse(startOfDay(dayOf(to, tz), tz)) - Date.parse(startOfDay(dayOf(from, tz), tz))) / 86_400_000))
}
