import { capacityCell, checkVehicleAvailable, fuelRank, readinessOf } from '../calc/availability'
import { projectCorporateExposure, projectCommission, rentalFinance } from '../calc/finance'
import { customerDocChecks, DOC_LABEL, evaluateDepositPolicy, evaluateDriverEligibility } from '../calc/policy'
import { priceQuote, type QuoteInput } from '../calc/pricing'
import { addHistory, fail, logEvent, meOf, need, nextId, nextNo, nowOf, notify, tzOf } from '../helpers'
import { fmt, roundHalf } from '../money'
import { addDaysYmd, dayOf, HOUR, startOfDay } from '../time'
import type { Contract, Customer, Db, FuelLevel, Id, Inspection, InspectionPin, Iso, Money, PriceSnapshot, Rental, Reservation, Vehicle } from '../types'
import { createDamage } from './fleet'
import { applyHeldAdvances, postCharge } from './finance'

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
  if (!row || row.limitMinor === null) fail(`${corp.name} için ${cur} kredi limiti tanımlı değil. Limit yoksa sınırsız sayılmaz: kurumsal hesapta ${cur} limiti tanımlayın.`)
  if (row!.headroomMinor !== null && addMinor > row!.headroomMinor) {
    fail(`${corp.name} ${cur} kredi limitini aşıyor (kalan ${fmt(row!.headroomMinor, cur)}, bu işlem ${fmt(addMinor, cur)}). Limit aşımı yalnız Onay Merkezi'nde "Kurumsal Kredi İstisnası" ile geçilir.`, {}, 'CREDIT_LIMIT')
  }
}

export function assertVehicleFree(d: Db, vehicleId: Id, from: Iso, to: Iso, exclude: { rentalId?: Id; reservationId?: Id } = {}): Vehicle {
  const v = find.vehicle(d, vehicleId)
  if (!v) fail('Araç bulunamadı.')
  const res = checkVehicleAvailable(d, v!, from, to, nowOf(d), exclude)
  if (!res.ok) fail(`${v!.plate} seçilen aralıkta uygun değil: ${res.conflicts.map((c) => c.label).join(', ')}.`, { vehicle: 'Araç uygun değil' }, 'CONFLICT')
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
    if (cell.available <= 0) fail(`${branch.name} · ${d.classes.find((c) => c.id === r.classId)?.name} sınıfı ${day} günü için kapasite yetersiz (müsait ${cell.available}).`, {}, 'CAPACITY')
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
  if (!(Date.parse(to) > Date.parse(from))) fail('İade zamanı teslim zamanından sonra olmalı.', { returnAt: 'İade, tesliminden sonra olmalı' })
}

export function createReservation(d: Db, input: ReservationInput): Reservation {
  need(d, 'reservations:manage', 'Rezervasyon oluşturma')
  validateWindow(input.pickupAt, input.returnAt)
  if (!find.customer(d, input.customerId)) fail('Müşteri seçin.', { customer: 'Müşteri seçin' })
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
  addHistory(d, res.history, 'Oluşturuldu', `Rezervasyon oluşturuldu (${input.vehicleId ? 'araç atanmış' : 'yalnız sınıf'}); Pending kapasite tutmaz.`)
  logEvent(d, { module: 'reservations', type: 'ReservationCreated', sourceType: 'reservation', sourceId: res.id, summary: `${res.no} oluşturuldu`, branchId: res.pickupBranchId, cur: res.currency, minor: snap.grossMinor })
  if (input.status === 'confirmed') confirmReservation(d, res.id)
  return res
}

export function repriceOf(d: Db, r: Reservation): PriceSnapshot {
  return snapshotFor(d, { classId: r.classId, from: r.pickupAt, to: r.returnAt, pickupBranchId: r.pickupBranchId, returnBranchId: r.returnBranchId, currency: r.currency, extras: r.extras, insuranceId: r.insuranceId, corporateId: r.corporateId, approvedDiscountPct: r.approvedDiscountPct }, { drivers: r.drivers.map((x) => x.customerId), customerId: r.customerId })
}

export function updateReservation(d: Db, id: Id, patch: Partial<Pick<ReservationInput, 'classId' | 'vehicleId' | 'pickupBranchId' | 'returnBranchId' | 'pickupAt' | 'returnAt' | 'extras' | 'insuranceId' | 'notes' | 'currency'>>, acknowledgePriceChange = false): Reservation {
  need(d, 'reservations:manage', 'Rezervasyon düzenleme')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status === 'converted' || r!.status === 'cancelled' || r!.status === 'no_show') fail('Bu rezervasyon artık düzenlenemez.')
  const next: Reservation = { ...r!, ...patch }
  validateWindow(next.pickupAt, next.returnAt)
  if (next.vehicleId && r!.status === 'confirmed') assertVehicleFree(d, next.vehicleId, next.pickupAt, next.returnAt, { reservationId: id })
  const old = r!.price
  const snap = repriceOf(d, next)
  if (snap.blockers.length) fail(`Fiyat hesaplanamadı: ${snap.blockers[0]}`)
  if (old && old.grossMinor !== snap.grossMinor && !acknowledgePriceChange) {
    fail(`Fiyat değişiyor: ${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}. Onaylamak için "yeni fiyatı kabul ediyorum" işaretleyin.`, {}, 'PRICE_CHANGE')
  }
  Object.assign(r!, patch)
  r!.price = snap
  addHistory(d, r!.history, 'Düzenlendi', `Plan/fiyat güncellendi${old && old.grossMinor !== snap.grossMinor ? ` (${fmt(old.grossMinor, old.cur)} → ${fmt(snap.grossMinor, snap.cur)}); önceki fiyat sürümü geçmişte kalır` : ''}.`)
  logEvent(d, { module: 'reservations', type: 'ReservationUpdated', sourceType: 'reservation', sourceId: id, summary: `${r!.no} düzenlendi`, before: old ? fmt(old.grossMinor, old.cur) : undefined, after: fmt(snap.grossMinor, snap.cur) })
  return r!
}

export function confirmReservation(d: Db, id: Id): Reservation {
  need(d, 'reservations:confirm', 'Rezervasyon onayı')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status !== 'pending') fail('Yalnız bekleyen (Pending) rezervasyon onaylanır.')
  if (r!.price?.blockers.length) fail(`Fiyat hesaplanamadı: ${r!.price.blockers[0]}`)
  if (r!.vehicleId) assertVehicleFree(d, r!.vehicleId, r!.pickupAt, r!.returnAt, { reservationId: id })
  else assertClassCapacity(d, r!, id)
  checkCorporateCredit(d, r!.corporateId, r!.currency, r!.price?.grossMinor ?? 0)
  r!.status = 'confirmed'
  addHistory(d, r!.history, 'Onaylandı', r!.vehicleId ? 'Rezervasyon onaylandı; araç tahsisi kapasite tutuyor.' : 'Rezervasyon onaylandı; yalnız sınıf: belirli bir araç tahsis edilmedi.')
  logEvent(d, { module: 'reservations', type: 'ReservationConfirmed', sourceType: 'reservation', sourceId: id, summary: `${r!.no} onaylandı`, before: 'pending', after: 'confirmed', branchId: r!.pickupBranchId })
  return r!
}

export function assignVehicle(d: Db, id: Id, vehicleId: Id): Reservation {
  need(d, 'reservations:manage', 'Araç atama')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status === 'converted' || r!.status === 'cancelled' || r!.status === 'no_show') fail('Bu rezervasyona araç atanamaz.')
  const v = assertVehicleFree(d, vehicleId, r!.pickupAt, r!.returnAt, { reservationId: id })
  if (v.classId !== r!.classId) fail('Seçilen araç rezervasyonun sınıfında değil.')
  r!.vehicleId = vehicleId
  addHistory(d, r!.history, 'Araç atandı', `${v.plate} atandı (sınıf rezervasyonu belirli araca bağlandı).`)
  logEvent(d, { module: 'reservations', type: 'VehicleAssigned', sourceType: 'reservation', sourceId: id, summary: `${r!.no} → ${v.plate}` })
  return r!
}

export function cancelReservation(d: Db, id: Id, reason: string): Reservation {
  need(d, 'reservations:manage', 'İptal')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status === 'converted') fail('Kiralamaya dönüşmüş rezervasyon iptal edilemez; kiralamayı iptal edin.')
  if (r!.status === 'cancelled') fail('Zaten iptal edilmiş.')
  if (reason.trim().length < 3) fail('İptal gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  r!.status = 'cancelled'
  r!.cancelReason = reason
  const held = d.payments.filter((p) => p.reservationId === id && p.kind === 'advance' && p.status === 'recorded')
  addHistory(d, r!.history, 'İptal edildi', reason + (held.length ? ` · ${held.length} kaparo tutuluyor: iade için Onay Merkezi'nde iade talebi açın.` : ''))
  logEvent(d, { module: 'reservations', type: 'ReservationCancelled', sourceType: 'reservation', sourceId: id, summary: `${r!.no} iptal`, reason, before: 'active', after: 'cancelled' })
  return r!
}

export function markNoShow(d: Db, id: Id): Reservation {
  need(d, 'reservations:manage', 'Gelmedi işlemi')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status !== 'confirmed') fail('Yalnız onaylı rezervasyon "gelmedi" yapılabilir.')
  if (Date.parse(r!.pickupAt) > Date.parse(nowOf(d))) fail('Teslim zamanı henüz gelmedi.')
  r!.status = 'no_show'
  addHistory(d, r!.history, 'Gelmedi', 'Müşteri gelmedi; araç tahsisi serbest bırakıldı. Kaparo otomatik gelir sayılmaz.')
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
  need(d, 'rentals:manage', 'Kiralama hazırlama')
  validateWindow(input.plannedPickupAt, input.plannedReturnAt)
  const vehicle = assertVehicleFree(d, input.vehicleId, input.plannedPickupAt, input.plannedReturnAt, { reservationId: input.reservationId })
  if (vehicle.classId !== input.classId) fail('Araç seçilen sınıfta değil.')
  const snap =
    input.price ??
    snapshotFor(d, { classId: input.classId, from: input.plannedPickupAt, to: input.plannedReturnAt, pickupBranchId: input.pickupBranchId, returnBranchId: input.returnBranchId, currency: input.currency, extras: input.extras, insuranceId: input.insuranceId, corporateId: input.corporateId, approvedDiscountPct: input.approvedDiscountPct }, { drivers: input.drivers, customerId: input.customerId })
  if (snap.blockers.length) fail(`Fiyat hesaplanamadı: ${snap.blockers[0]}`)
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
  addHistory(d, rental.history, 'Hazırlandı', `Kiralama hazırlandı · ${vehicle.plate}${input.reservationId ? ' · rezervasyondan dönüştürüldü' : ''}. Teslim için Teslim Masası kontrolleri gerekir.`)
  logEvent(d, { module: 'rentals', type: 'RentalCreated', sourceType: 'rental', sourceId: rental.id, summary: `${rental.no} hazırlandı · ${vehicle.plate}`, branchId: rental.pickupBranchId, cur: rental.currency, minor: snap.grossMinor })
  tryIssueContract(d, rental)
  return rental
}

export function convertReservation(d: Db, id: Id): Rental {
  need(d, 'rentals:manage', 'Kiralamaya dönüştürme')
  const r = find.reservation(d, id)
  if (!r) fail('Rezervasyon bulunamadı.')
  if (r!.status !== 'confirmed') fail('Yalnız onaylı rezervasyon kiralamaya dönüştürülür.')
  if (!r!.vehicleId) fail('Sınıf rezervasyonuna önce belirli bir araç atayın; tek tıkla sınıf kiralaması açılmaz.', { vehicle: 'Araç atayın' })
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
  addHistory(d, r!.history, 'Kiralamaya dönüştürüldü', `${rental.no} oluşturuldu. Kaparo ayrıca aktarılır; hesap kalemi Teslim'de doğar.`)
  logEvent(d, { module: 'reservations', type: 'ReservationConverted', sourceType: 'reservation', sourceId: id, summary: `${r!.no} → ${rental.no}`, before: 'confirmed', after: 'converted' })
  return rental
}

export function updateGate(d: Db, rentalId: Id, patch: Partial<Rental['gate']>): void {
  need(d, 'rentals:handover', 'Teslim kontrolü')
  const r = find.rental(d, rentalId)
  if (!r || r.status !== 'prepared') fail('Kiralama teslime hazır değil.')
  Object.assign(r!.gate, patch)
}

export function cancelRental(d: Db, id: Id, reason: string): void {
  need(d, 'rentals:manage', 'Kiralama iptali')
  const r = find.rental(d, id)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'prepared') fail('Yalnız teslim öncesi (hazırlanan) kiralama iptal edilir. Teslim edilmiş kiralama iade veya istisnai kapanış ile sonlanır.')
  if (reason.trim().length < 3) fail('İptal gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  r!.status = 'cancelled'
  r!.closeReason = reason
  addHistory(d, r!.history, 'İptal edildi', reason)
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
  need(d, 'contracts:manage', 'Sözleşme düzenleme')
  const rental = find.rental(d, rentalId)
  if (!rental) fail('Kiralama bulunamadı.')
  const tpl = d.templates.find((t) => t.id === templateId)
  if (!tpl) fail('Şablon bulunamadı.')
  if (!tpl!.seriesPrefix.trim()) fail('Şablonda sözleşme numara serisi tanımlı değil (Ayarlar → Sözleşme Dilleri).')
  const customer = find.customer(d, rental!.customerId)!
  const vehicle = find.vehicle(d, rental!.vehicleId)!
  const tz = tzOf(d, rental!.pickupBranchId)
  const prev = d.contracts.filter((c) => c.rentalId === rentalId).sort((a, b) => b.version - a.version)[0]
  if (prev?.status === 'signed') fail('İmzalı sözleşme değiştirilemez; yeni sürüm için önce kiralama koşullarını düzeltin ve yeni sürüm üretin (imza miras alınmaz).') // new version only via explicit reissue
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
      renterName: customer.name + (rental!.drivers.length > 1 ? ` + ${rental!.drivers.length - 1} ek sürücü` : ''),
      vehicle: `${vehicle.plate} · ${vehicle.make} ${vehicle.model} (${vehicle.year})`,
      period: `${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(rental!.plannedPickupAt))} → ${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(rental!.plannedReturnAt))}`,
      totals: price ? `${fmt(price.grossMinor, price.cur)} (KDV ${price.taxLines[0]?.mode === 'exclusive' ? 'hariç' : 'dahil'})` : 'Hesaplanmadı',
      coverage: rental!.coverageSnapshot ? `${rental!.coverageSnapshot.name} · muafiyet ${fmt(rental!.coverageSnapshot.deductible.minor, rental!.coverageSnapshot.deductible.cur)}` : 'Sigorta paketi seçilmedi',
      deposit: rental!.deposit.required.minor > 0 ? fmt(rental!.deposit.required.minor, rental!.deposit.required.cur) : 'Depozito yok',
    },
  }
  d.contracts.push(contract)
  rental!.contract = { id: contract.id, signed: false }
  addHistory(d, rental!.history, 'Sözleşme', `${contract.no} (sürüm ${contract.version}) üretildi; imza bekliyor.`)
  logEvent(d, { module: 'contracts', type: 'ContractIssued', sourceType: 'contract', sourceId: contract.id, summary: `${contract.no} v${contract.version} · ${rental!.no}` })
  return contract
}

/** In-person web signature: the renter signs on the staff device. This is internal capture, not an e-signature service. */
export function signContract(d: Db, rentalId: Id, signerName: string, confirmed: boolean): void {
  need(d, 'rentals:handover', 'Sözleşme imzası')
  const rental = find.rental(d, rentalId)
  const contract = d.contracts.find((c) => c.id === rental?.contract.id)
  if (!rental || !contract) fail('Önce sözleşme üretin.')
  if (contract!.status !== 'issued') fail('Bu sözleşme sürümü imzaya açık değil.')
  const customer = find.customer(d, rental!.customerId)!
  if (signerName.trim().toLowerCase() !== customer.name.toLowerCase()) fail(`İmza atan kişi kiracı adıyla ("${customer.name}") aynı olmalı.`, { signer: 'Kiracı adını yazın' })
  if (!confirmed) fail('Kiracının sözleşmeyi okuduğunu onaylayın.', { confirm: 'Onay gerekli' })
  contract!.status = 'signed'
  contract!.signedAt = nowOf(d)
  contract!.signedBy = signerName
  contract!.staffApprovedBy = meOf(d).id
  rental!.contract.signed = true
  rental!.contract.signedAt = nowOf(d)
  rental!.contract.signedBy = signerName
  addHistory(d, rental!.history, 'Sözleşme imzalandı', `${contract!.no} yüz yüze (cihaz üzerinde) imzalandı; personel onayı: ${meOf(d).name}.`)
  logEvent(d, { module: 'contracts', type: 'ContractSigned', sourceType: 'contract', sourceId: contract!.id, summary: `${contract!.no} imzalandı` })
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
  for (const c of drivers) for (const chk of customerDocChecks(d, c, now, r.plannedReturnAt)) if (chk.state === 'missing' || chk.state === 'expired') docIssues.push(`${c.name}: ${DOC_LABEL[chk.kind] ?? chk.kind} ${chk.state === 'missing' ? 'eksik' : 'geçersiz'}`)
  items.push({ key: 'docs', label: 'Sürücü belgeleri', ok: docIssues.length === 0 && r.gate.docsChecked, detail: docIssues.length ? docIssues.join(' · ') : r.gate.docsChecked ? 'Belgeler kontrol edildi (personel beyanı)' : 'Belgeler geçerli; personel kontrolünü işaretleyin', fix: { type: 'customer', id: r.customerId } })
  // 2. driver eligibility
  const elig = drivers.map((c) => ({ c, e: evaluateDriverEligibility(d, c, r.plannedPickupAt, r.plannedReturnAt) }))
  const bad = elig.filter((x) => !x.e.eligible)
  items.push({ key: 'driver', label: 'Sürücü uygunluğu (yaş, ehliyet yılı)', ok: bad.length === 0 && r.gate.driverOk, detail: bad.length ? bad.map((x) => `${x.c.name}: ${x.e.reasons.join(' ')}`).join(' · ') : r.gate.driverOk ? 'Uygun (personel beyanı)' : 'Uygun; personel onayını işaretleyin' })
  // 3. vehicle readiness
  const v = find.vehicle(d, r.vehicleId)!
  const ready = readinessOf(d, v, now)
  items.push({ key: 'ready', label: 'Araç hazırlığı', ok: ready.ready, detail: ready.ready ? 'Araç teslime hazır' : ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ') + ' sorunlu', fix: { type: 'vehicle', id: v.id, tab: 'kontroller' } })
  // 4. availability
  const free = checkVehicleAvailable(d, v, r.plannedPickupAt, r.plannedReturnAt, now, { rentalId: r.id, reservationId: r.reservationId })
  items.push({ key: 'avail', label: 'Araç uygunluğu', ok: free.ok, detail: free.ok ? 'Çakışan kayıt yok' : free.conflicts.map((c) => c.label).join(', '), fix: { type: 'vehicle', id: v.id, tab: 'musaitlik' } })
  // 5. contract
  const c = d.contracts.find((x) => x.id === r.contract.id)
  items.push({ key: 'contract', label: 'Sözleşme ve imza', ok: !!c && c.status === 'signed', detail: !c ? 'Sözleşme üretilmedi' : c.status === 'signed' ? `${c.no} imzalandı` : `${c.no} imza bekliyor`, fix: { type: 'tab', tab: 'sozlesme' } })
  // 6. deposit
  const need0 = r.deposit.required.minor > 0
  const depOk = !need0 || r.deposit.state === 'held' || r.deposit.state === 'waived'
  items.push({ key: 'deposit', label: 'Depozito kararı', ok: depOk, detail: !need0 ? 'Depozito gerekmiyor' : depOk ? (r.deposit.state === 'held' ? `${fmt(r.deposit.required.minor, r.deposit.required.cur)} tutuluyor` : 'Muaf (gerekçeli)') : `${fmt(r.deposit.required.minor, r.deposit.required.cur)} depozito alınmadı`, fix: { type: 'tab', tab: 'finans' } })
  // 7. handover evidence
  const km = draft?.km
  const ph = draft?.photos ?? 0
  items.push({ key: 'evidence', label: 'Teslim kanıtı (km, yakıt, 4–5 fotoğraf)', ok: km !== undefined && km >= v.odometerKm && !!draft?.fuel && ph >= 4, detail: km === undefined ? 'Kilometre girilmedi' : km < v.odometerKm ? `Kilometre mevcut değerden (${v.odometerKm}) küçük olamaz` : ph < 4 ? `Fotoğraf ${ph}/4` : 'Tamam' })
  return { items, canDeliver: items.every((i) => i.ok) }
}

export function setDepositWaiver(d: Db, rentalId: Id, reason: string): void {
  need(d, 'rentals:manage', 'Depozito muafiyeti')
  const r = find.rental(d, rentalId)
  if (!r || r.status !== 'prepared') fail('Kiralama teslime hazır değil.')
  if (!d.settings.thresholds.corporateOverride && reason.trim().length < 5) fail('Gerekçe yazın.')
  if (reason.trim().length < 5) fail('Muafiyet gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  r!.deposit.state = 'waived'
  r!.deposit.note = reason
  addHistory(d, r!.history, 'Depozito muaf', reason)
  logEvent(d, { module: 'rentals', type: 'DepositWaived', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} depozito muafiyeti`, reason })
}

export interface HandoverInput {
  km: number
  fuel: FuelLevel
  photos: number
  pins: InspectionPin[]
  note?: string
}

export function makeInspection(d: Db, input: HandoverInput): Inspection {
  const labels = ['Ön', 'Arka', 'Sol', 'Sağ', 'İç mekan', 'Kilometre göstergesi']
  return {
    at: nowOf(d),
    by: meOf(d).id,
    km: input.km,
    fuel: input.fuel,
    photos: Array.from({ length: input.photos }, (_, i) => ({ id: nextId(d, 'ph'), label: labels[i] ?? `Fotoğraf ${i + 1}`, tone: ['#cfd8ea', '#d9e4dc', '#eadfd0', '#e3d5e6', '#d6e5e8', '#ece6cf'][i % 6]! })),
    pins: input.pins,
    checks: {},
    note: input.note ?? '',
  }
}

export function deliverRental(d: Db, rentalId: Id, input: HandoverInput): Rental {
  need(d, 'rentals:handover', 'Araç teslimi')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'prepared') fail('Bu kiralama zaten teslim edilmiş veya kapanmış (tek teslim, tek hesap kalemi).')
  const desk = deliveryChecks(d, rentalId, { km: input.km, fuel: input.fuel, photos: input.photos })
  const blocker = desk.items.find((i) => !i.ok)
  if (blocker) fail(`Teslim yapılamaz: ${blocker.label} — ${blocker.detail}`, {}, 'DELIVERY_BLOCKED')
  const v = find.vehicle(d, r!.vehicleId)!
  r!.status = 'delivered'
  r!.actualPickupAt = nowOf(d)
  r!.handover = makeInspection(d, input)
  v.location = 'customer'
  v.odometerKm = input.km
  v.fuel = input.fuel
  d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km: input.km, at: nowOf(d), source: 'handover', refType: 'rental', refId: r!.id, by: meOf(d).id })
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: nowOf(d), location: 'customer', reason: `Teslim ${r!.no}`, refType: 'rental', refId: r!.id })
  // Delivered → exactly one base charge (idempotency key), then held advances are applied.
  const gross = r!.price?.grossMinor ?? 0
  postCharge(d, { rentalId, kind: 'base', label: `Kiralama bedeli · ${r!.price?.days ?? 0} gün (fiyat sürümü ${r!.price?.revisionId})`, amountMinor: gross, taxMinor: r!.price?.taxMinor ?? 0, key: `${rentalId}:delivered:base`, sourceType: 'rental', sourceId: rentalId })
  applyHeldAdvances(d, r!)
  addHistory(d, r!.history, 'Teslim edildi', `${v.plate} müşteriye teslim edildi · ${input.km} km · yakıt ${input.fuel}. Kiralama bedeli hesap kalemi olarak kaydedildi (bir kez).`)
  logEvent(d, { module: 'rentals', type: 'VehicleDelivered', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} teslim edildi · ${v.plate}`, before: 'prepared', after: 'delivered', branchId: r!.pickupBranchId })
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
    if (fee > 0) fees.push({ label: `Geç iade · ${hours} saat`, minor: fee })
  }
  const start = r.handover
  if (start) {
    const steps = fuelRank(start.fuel) - fuelRank(input.fuel)
    const row = d.settings.duration.fuelFeePerQuarter[r.currency]
    if (steps > 0 && row !== undefined) fees.push({ label: `Yakıt farkı · ${steps} çeyrek`, minor: steps * row })
    const driven = input.km - start.km
    const days = r.price?.days ?? 1
    const over = driven - days * d.settings.duration.kmPerDay
    const rate = d.settings.duration.kmOverageFee[r.currency]
    if (over > 0 && rate !== undefined) fees.push({ label: `Km aşımı · ${over} km`, minor: over * rate })
  }
  return fees
}

export function returnRental(d: Db, rentalId: Id, input: ReturnInput): Rental {
  need(d, 'rentals:handover', 'Araç iadesi')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'delivered') fail('Yalnız teslim edilmiş kiralama iade alınır.')
  const v = find.vehicle(d, r!.vehicleId)!
  const startKm = r!.handover?.km ?? v.odometerKm
  if (input.km < startKm) fail(`İade kilometresi teslim kilometresinden (${startKm}) küçük olamaz.`, { km: 'Geçersiz kilometre' })
  if (input.photos < 4) fail('İade kanıtı için en az 4 fotoğraf gerekir.', { photos: 'En az 4 fotoğraf' })
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
  d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: now, location: r!.returnBranchId, reason: `İade ${r!.no}`, refType: 'rental', refId: r!.id })
  for (const f of fees) {
    const kind = f.label.startsWith('Geç') ? 'late' : f.label.startsWith('Yakıt') ? 'fuel' : 'km'
    postCharge(d, { rentalId, kind, label: f.label, amountMinor: f.minor, key: `${rentalId}:returned:${kind}`, sourceType: 'rental', sourceId: rentalId })
  }
  let damageNote = ''
  if (input.openDamage) {
    const dmg = createDamage(d, { vehicleId: v.id, rentalId, severity: input.damageSeverity ?? 'minor', area: 'İade kontrolü', description: input.damageDescription || 'İade kontrolünde yeni bulgu', photos: input.photos, blocksVehicle: !!input.blocksVehicle })
    damageNote = ` Hasar dosyası ${dmg.no} açıldı (ücret otomatik yazılmadı).`
  }
  addHistory(d, r!.history, 'İade alındı', `${v.plate} iade alındı · ${input.km} km · yakıt ${input.fuel}.${fees.length ? ` Ek kalemler: ${fees.map((f) => `${f.label} ${fmt(f.minor, r!.currency)}`).join(', ')}.` : ''}${damageNote} Araç hazır değil: temizlik/hazırlık kontrolü gerekir.`)
  logEvent(d, { module: 'rentals', type: 'VehicleReturned', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} iade alındı · ${v.plate}`, before: 'delivered', after: 'returned', branchId: r!.returnBranchId })
  accrueCommission(d, r!, 'returned')
  return r!
}

export function closeOperational(d: Db, rentalId: Id): void {
  need(d, 'rentals:handover', 'Operasyonel kapanış')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'returned') fail('Yalnız iade alınmış kiralama operasyonel olarak kapatılır.')
  r!.status = 'closed'
  r!.closeKind = 'normal'
  addHistory(d, r!.history, 'Operasyonel kapanış', 'Kiralama operasyonel olarak kapandı. Finansal kapanış ayrıdır; borç otomatik silinmez.')
  logEvent(d, { module: 'rentals', type: 'RentalClosed', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} operasyonel kapandı`, before: 'returned', after: 'closed' })
  accrueCommission(d, r!, 'closed')
}

export function financialCloseChecks(d: Db, rentalId: Id): { items: { key: string; label: string; ok: boolean; detail: string }[]; canClose: boolean } {
  const r = find.rental(d, rentalId)
  const items: { key: string; label: string; ok: boolean; detail: string }[] = []
  if (!r) return { items, canClose: false }
  const f = rentalFinance(d, rentalId)
  items.push({ key: 'op', label: 'Operasyonel durum', ok: r.status === 'closed' || r.status === 'exception_closed' || r.status === 'loss_closed' || r.status === 'cancelled', detail: `Durum: ${({ prepared: 'Hazırlanıyor', delivered: 'Teslim edildi (araç müşteride)', returned: 'İade alındı, kapanmadı', closed: 'Kapandı', cancelled: 'İptal', exception_closed: 'İstisnai kapandı', loss_closed: 'Kayıp kapanışı' } as Record<string, string>)[r.status] ?? r.status}` })
  items.push({ key: 'outstanding', label: 'Açık bakiye', ok: f.outstandingMinor === 0, detail: f.outstandingMinor ? `${fmt(f.outstandingMinor, f.cur)} ödenmemiş` : 'Bakiye yok' })
  items.push({ key: 'unapplied', label: 'Uygulanmamış ödeme', ok: f.unappliedMinor === 0, detail: f.unappliedMinor ? `${fmt(f.unappliedMinor, f.cur)} uygulanmadı` : 'Yok' })
  const held = d.deposits.filter((x) => x.rentalId === rentalId && x.state === 'held')
  items.push({ key: 'deposit', label: 'Depozito çözümü', ok: held.length === 0, detail: held.length ? 'Tutulan depozito var: iade edin veya mahsup edin' : 'Çözüldü' })
  const openAppr = d.approvals.filter((a) => a.target.id === rentalId && (a.status === 'requested' || a.status === 'approved'))
  items.push({ key: 'approvals', label: 'Bekleyen onay', ok: openAppr.length === 0, detail: openAppr.length ? `${openAppr.length} onay tamamlanmadı` : 'Yok' })
  const refunds = d.refunds.filter((x) => x.rentalId === rentalId && (x.status === 'requested' || x.status === 'approved'))
  items.push({ key: 'refund', label: 'Sonuçlanmamış iade', ok: refunds.length === 0, detail: refunds.length ? `${refunds.length} iade bekliyor` : 'Yok' })
  return { items, canClose: items.every((i) => i.ok) }
}

export function closeFinancial(d: Db, rentalId: Id): void {
  need(d, 'finance:apply', 'Finansal kapanış')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  const chk = financialCloseChecks(d, rentalId)
  const bad = chk.items.find((i) => !i.ok)
  if (bad) fail(`Finansal kapanış yapılamaz: ${bad.label} — ${bad.detail}`)
  r!.financeStatus = 'closed'
  addHistory(d, r!.history, 'Finansal kapanış', 'Finans dosyası kapandı.')
  logEvent(d, { module: 'finance', type: 'FinanceClosed', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} finansal kapandı`, before: 'open', after: 'closed' })
}

export function reopenFinancial(d: Db, rentalId: Id, reason: string): void {
  need(d, 'finance:apply', 'Finansı yeniden açma')
  const r = find.rental(d, rentalId)
  if (!r || r.financeStatus !== 'closed') fail('Finans dosyası kapalı değil.')
  if (reason.trim().length < 5) fail('Yeniden açma gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  r!.financeStatus = 'open'
  addHistory(d, r!.history, 'Finans yeniden açıldı', reason)
  logEvent(d, { module: 'finance', type: 'FinanceReopened', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} finansı yeniden açıldı`, reason, before: 'closed', after: 'open' })
}

export function extendRental(d: Db, rentalId: Id, newReturnAt: Iso, note: string): Rental {
  need(d, 'rentals:manage', 'Kiralama uzatma')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'prepared' && r!.status !== 'delivered') fail('Yalnız hazırlanan veya teslim edilmiş kiralama uzatılır.')
  if (Date.parse(newReturnAt) <= Date.parse(r!.plannedReturnAt)) fail('Yeni iade zamanı mevcut planlanan iadeden sonra olmalı.', { returnAt: 'Daha geç bir zaman seçin' })
  if (note.trim().length < 3) fail('Uzatma gerekçesi yazın.', { note: 'Gerekçe zorunlu' })
  assertVehicleFree(d, r!.vehicleId, r!.plannedReturnAt, newReturnAt, { rentalId })
  const before = r!.price!
  const next = snapshotFor(d, { classId: r!.classId, from: r!.plannedPickupAt, to: newReturnAt, pickupBranchId: r!.pickupBranchId, returnBranchId: r!.returnBranchId, currency: r!.currency, extras: r!.extras, insuranceId: r!.insuranceId, corporateId: r!.corporateId, approvedDiscountPct: r!.approvedDiscountPct }, { drivers: r!.drivers.map((x) => x.customerId), customerId: r!.customerId })
  if (next.blockers.length) fail(`Uzatma fiyatı hesaplanamadı: ${next.blockers[0]}`)
  const delta = next.grossMinor - before.grossMinor
  const ext = { id: nextId(d, 'ex'), at: nowOf(d), by: meOf(d).id, fromReturn: r!.plannedReturnAt, toReturn: newReturnAt, deltaMinor: delta, note }
  r!.extensions.push(ext)
  r!.plannedReturnAt = newReturnAt
  r!.price = next
  if (r!.status === 'delivered' && delta > 0) postCharge(d, { rentalId, kind: 'other', label: `Uzatma farkı · ${ext.id}`, amountMinor: delta, key: `${rentalId}:ext:${ext.id}`, sourceType: 'rental', sourceId: rentalId })
  // The deposit and coverage are looked at together with the new period (spec §85.2).
  const dep = evaluateDepositPolicy(d, r!.classId, r!.insuranceId, r!.currency)
  addHistory(d, r!.history, 'Uzatıldı', `İade ${fmt(delta, r!.currency)} farkla uzatıldı (${note}). Sigorta ve depozito yeniden değerlendirildi${dep.ok && dep.required.minor !== r!.deposit.required.minor ? `: gerekli depozito ${fmt(dep.required.minor, dep.required.cur)}` : ': değişiklik yok'}.`)
  logEvent(d, { module: 'rentals', type: 'RentalExtended', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} uzatıldı`, cur: r!.currency, minor: delta, reason: note })
  return r!
}

export function swapVehicle(d: Db, rentalId: Id, newVehicleId: Id, reason: string): Rental {
  need(d, 'rentals:manage', 'Araç değişimi')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'prepared' && r!.status !== 'delivered') fail('Yalnız hazırlanan veya teslim edilmiş kiralamada araç değişir.')
  if (reason.trim().length < 3) fail('Değişim gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  if (newVehicleId === r!.vehicleId) fail('Aynı aracı seçtiniz.')
  const nv = assertVehicleFree(d, newVehicleId, r!.actualPickupAt ?? r!.plannedPickupAt, r!.plannedReturnAt, { rentalId })
  const ready = readinessOf(d, nv, nowOf(d))
  if (!ready.ready) fail(`${nv.plate} hazır değil: ${ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}.`, {}, 'NOT_READY')
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
  addHistory(d, r!.history, 'Araç değişti', `${old.plate} → ${nv.plate} (${reason}). Sigorta ve fiyat anlaşması korundu; fiyat farkı varsa elle kalem eklenir.`)
  logEvent(d, { module: 'rentals', type: 'VehicleSwapped', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no}: ${old.plate} → ${nv.plate}`, reason })
  return r!
}

export function exceptionClose(d: Db, rentalId: Id, kind: 'exception' | 'loss', reason: string): void {
  need(d, 'rentals:manage', 'İstisnai kapanış')
  const r = find.rental(d, rentalId)
  if (!r) fail('Kiralama bulunamadı.')
  if (r!.status !== 'delivered') fail('İstisnai kapanış yalnız teslim edilmiş (araç müşteride) kiralama için yapılır.')
  if (reason.trim().length < 10) fail('Gerekçeyi en az 10 karakterle açıklayın.', { reason: 'Gerekçe zorunlu' })
  r!.status = kind === 'loss' ? 'loss_closed' : 'exception_closed'
  r!.closeKind = kind
  r!.closeReason = reason
  r!.actualReturnAt = nowOf(d)
  const v = find.vehicle(d, r!.vehicleId)!
  if (kind === 'loss') {
    v.status = 'out_of_service'
    v.location = 'unknown'
  }
  addHistory(d, r!.history, kind === 'loss' ? 'Kayıp kapanışı' : 'İstisnai kapanış', `${reason}. Normal iade kanıtı zorlanmadı; borç ve depozito ayrıca çözülür.`)
  logEvent(d, { module: 'rentals', type: kind === 'loss' ? 'RentalLossClosed' : 'RentalExceptionClosed', sourceType: 'rental', sourceId: rentalId, summary: `${r!.no} ${kind === 'loss' ? 'kayıp' : 'istisnai'} kapandı`, reason, before: 'delivered' })
  notify(d, undefined, `${r!.no} istisnai kapandı: finans ve depozito çözümü bekliyor.`, { type: 'rental', id: rentalId }, 'warning')
}

// --------------------------------------------------------------------------- readiness actions (separate from maintenance)

export function markPrepared(d: Db, vehicleId: Id, note = ''): void {
  need(d, 'vehicles:manage', 'Hazırlık kaydı')
  const v = find.vehicle(d, vehicleId)
  if (!v) fail('Araç bulunamadı.')
  v!.readiness = { clean: true, fuelOk: fuelRank(v!.fuel) >= 2, checkedAt: nowOf(d), checkedBy: meOf(d).id, note }
  logEvent(d, { module: 'vehicles', type: 'VehiclePrepared', sourceType: 'vehicle', sourceId: vehicleId, summary: `${v!.plate} hazırlandı (temizlik kontrolü)` })
}
export function refuelVehicle(d: Db, vehicleId: Id, level: FuelLevel): void {
  need(d, 'vehicles:manage', 'Yakıt güncelleme')
  const v = find.vehicle(d, vehicleId)
  if (!v) fail('Araç bulunamadı.')
  v!.fuel = level
  v!.readiness.fuelOk = fuelRank(level) >= 2
  logEvent(d, { module: 'vehicles', type: 'VehicleRefuelled', sourceType: 'vehicle', sourceId: vehicleId, summary: `${v!.plate} yakıt: ${level}` })
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
  logEvent(d, { module: 'partners', type: 'CommissionEarned', sourceType: 'partner', sourceId: partner.id, summary: `${partner.name} · ${rental.no} komisyonu doğdu (ödenmedi)`, cur: rental.currency, minor: amount })
}

export const moneyOf = (minor: number, cur: string): Money => ({ minor, cur })
export const daysBetween = (d: Db, from: Iso, to: Iso, branchId: Id) => {
  const tz = tzOf(d, branchId)
  return Math.max(1, Math.round((Date.parse(startOfDay(dayOf(to, tz), tz)) - Date.parse(startOfDay(dayOf(from, tz), tz))) / 86_400_000))
}
