import { rentalFinance } from './calc/finance'
import { addHistory, logEvent, nextId, nextNo } from './helpers'
import { addDaysYmd, dayOf, zonedIso } from './time'
import { acceptOffer, addSupplierOffer, addWaitlist, createLead, createPartner, createQuote, createSettlement, createSourcingRequest, createSupplier, paySettlement, payPartnerCommission, receiveEngagement, returnEngagement, setLeadStatus } from './ops/commercial'
import { applyApproval, createException, createExpense, decideApproval, requestApproval, saveRule } from './ops/control'
import { addIncidentEvidence, chargeDamageToCustomer, chargeFineToCustomer, assignFine, createDamage, createFine, createIncident, createTask, claimTask, completeMaintenance, linkRepair, payFineToAuthority, planMaintenance, recordInsurerRecovery, setDamageLiability, setIncidentStatus, setTaskStatus, startMaintenance } from './ops/fleet'
import { closeSession, holdDeposit, manualCashMove, openSession, recordPayment, releaseDeposit } from './ops/finance'
import { closeFinancial, closeOperational, confirmReservation, convertReservation, createReservation, deliverRental, exceptionClose, find, returnRental, signContract, updateGate, cancelReservation, markNoShow, createRental } from './ops/rentals'
import { type DbSeedCtx, customersData } from './seed-data'
import { emptyDb, seasonsFor } from './seed-base'
import type { Cur, Customer, Db, DemoDocument, FuelLevel, Id, Vehicle } from './types'

// Builds the demo world through the same operations the screens use, so every number is consistent. The clock is
// moved through the past while history is created and ends at "today 10:00" (demo time).

const TZ = 'Europe/Sarajevo'

export function buildSeed(real: Date): Db {
  const today = dayOf(real.toISOString(), TZ)
  const T = (off: number, hm = '10:00', zone = TZ) => zonedIso(addDaysYmd(today, off), hm, zone)
  const NOW = T(0, '10:00')
  const d = emptyDb(today, NOW)
  const year = Number(today.slice(0, 4))
  d.seasons = [...seasonsFor(year - 1), ...seasonsFor(year), ...seasonsFor(year + 1)]
  const setNow = (iso: string) => {
    d.clock.now = iso
  }
  const as = (id: string) => {
    d.session.userId = id
  }
  const ctx: DbSeedCtx = { d, T, today }

  // ------------------------------------------------------------------ customers, corporate accounts, documents
  const cust: Customer[] = customersData(ctx)
  const C = (n: number) => cust[n - 1]!
  setNow(T(-400, '09:00'))
  seedCorporates(d, C)

  // ------------------------------------------------------------------ vehicles (25 internal + 3 external) with documents
  const V = seedVehicles(d, T)
  const veh = (n: number): Vehicle => V[n - 1]!
  seedVehicleDocs(d, T, V)

  // ------------------------------------------------------------------ drawers and cash sessions
  seedDrawers(d, T, as, setNow)

  // ------------------------------------------------------------------ users per branch used while creating history
  const opsFor = (b: string) => (b === 'b-sjj' ? 'u-ops1' : b === 'b-mst' ? 'u-ops2' : 'u-ops3')

  const ensureReady = (v: Vehicle) => {
    v.readiness = { clean: true, fuelOk: true, checkedAt: d.clock.now, checkedBy: 'u-ops1', note: '' }
    v.fuel = 'full'
  }

  interface RSpec {
    c: number
    v: number
    from: [number, string]
    to: [number, string]
    cur: Cur
    ins?: string
    extras?: { extraId: string; qty: number }[]
    corp?: string
    drivers?: number[]
    deposit?: 'card' | 'cash' | 'none'
    /** returned at (offset, time); omitted = still out */
    retAt?: [number, string]
    retFuel?: FuelLevel
    kmDriven?: number
    pay?: 'full' | 'none' | 'part'
    payMethod?: 'cash' | 'card' | 'transfer'
    payCur?: Cur
    close?: boolean
    partnerId?: string
    viaReservation?: boolean
    pickupBranch?: string
    returnBranch?: string
    stopAt?: 'prepared' | 'delivered' | 'returned'
  }

  const rentals: Record<string, string> = {}
  const mk = (key: string, s: RSpec) => {
    const vh = veh(s.v)
    const cu = C(s.c)
    const pb = s.pickupBranch ?? vh.homeBranchId
    const rb = s.returnBranch ?? pb
    const user = opsFor(pb)
    const from = T(s.from[0], s.from[1])
    const to = T(s.to[0], s.to[1])
    as(user)
    setNow(zonedIso(addDaysYmd(today, s.from[0] - (s.viaReservation ? 6 : 0)), '15:00', TZ))
    let reservationId: Id | undefined
    if (s.viaReservation) {
      const r = createReservation(d, { customerId: cu.id, corporateId: s.corp, classId: vh.classId, vehicleId: vh.id, pickupBranchId: pb, returnBranchId: rb, pickupAt: from, returnAt: to, currency: s.cur, extras: s.extras ?? [], insuranceId: s.ins, drivers: [cu.id, ...(s.drivers ?? []).map((n) => C(n).id)], channel: s.partnerId ? 'partner' : s.corp ? 'corporate' : 'phone', partnerId: s.partnerId })
      as('u-mgr')
      confirmReservation(d, r.id)
      as(user)
      reservationId = r.id
      setNow(zonedIso(addDaysYmd(today, s.from[0]), '08:00', TZ))
      const rn = convertReservation(d, r.id)
      rentals[key] = rn.id
    } else {
      setNow(zonedIso(addDaysYmd(today, s.from[0]), '08:00', TZ))
      ensureReady(vh)
      const rn = createRental(d, { customerId: cu.id, corporateId: s.corp, drivers: [cu.id, ...(s.drivers ?? []).map((n) => C(n).id)], vehicleId: vh.id, classId: vh.classId, pickupBranchId: pb, returnBranchId: rb, plannedPickupAt: from, plannedReturnAt: to, currency: s.cur, extras: s.extras ?? [], insuranceId: s.ins })
      rentals[key] = rn.id
    }
    void reservationId
    const r = find.rental(d, rentals[key]!)!
    if (s.stopAt === 'prepared') return r
    ensureReady(vh)
    setNow(from)
    const sig = d.contracts.find((x) => x.id === r.contract.id)
    if (sig && sig.status !== 'signed') signContract(d, r.id, cu.name, true)
    updateGate(d, r.id, { docsChecked: true, driverOk: true })
    if (r.deposit.required.minor > 0) {
      const dm = s.deposit ?? 'card'
      if (dm === 'none') {
        as('u-mgr')
        d.rentals.find((x) => x.id === r.id)!.deposit.state = 'waived'
        as(user)
      } else holdDeposit(d, r.id, dm, 'Teslimde alındı')
    }
    const startKm = vh.odometerKm
    deliverRental(d, r.id, { km: startKm, fuel: 'full', photos: 5, pins: [], note: '' })
    // payment lines after delivery
    const pay = s.pay ?? 'full'
    if (pay !== 'none') {
      const f = rentalFinance(d, r.id)
      const target = pay === 'full' ? f.outstandingMinor : Math.floor(f.outstandingMinor * 0.4)
      const method = s.payMethod ?? 'card'
      const payCur = s.payCur ?? s.cur
      setNow(new Date(Date.parse(from) + 3_600_000).toISOString())
      const amount = payCur === s.cur ? target : Math.round(target * 2)
      recordPayment(d, { rentalId: r.id, kind: 'payment', payer: { type: s.corp ? 'corporate' : 'customer', id: s.corp ?? cu.id, name: s.corp ? (d.corporates.find((x) => x.id === s.corp)?.name ?? cu.name) : cu.name }, method, tenderMinor: amount, tenderCur: payCur, branchId: pb, reference: method === 'card' ? `POS-${r.id.toUpperCase()}` : '' })
    }
    if (!s.retAt) return r
    setNow(T(s.retAt[0], s.retAt[1]))
    as(opsFor(rb))
    returnRental(d, r.id, { km: startKm + (s.kmDriven ?? 400), fuel: s.retFuel ?? 'full', photos: 5, pins: [], note: '' })
    if (s.stopAt === 'returned') return r
    if (s.close) {
      as('u-ops1')
      closeOperational(d, r.id)
      as('u-owner')
      for (const dep of d.deposits.filter((x) => x.rentalId === r.id && x.state === 'held')) releaseDeposit(d, dep.id, 'released')
      closeFinancial(d, r.id)
    }
    return r
  }

  // ------------------------------------------------------------------ past rentals (history for analytics and statements)
  // Ordering matters per vehicle: oldest first. Each uses its own day window, none overlaps a current or future block.
  const past: [string, RSpec][] = [
    ['p1', { c: 1, v: 1, from: [-22, '09:00'], to: [-18, '10:00'], cur: 'BAM', ins: 'in-cdw', retAt: [-18, '09:40'], close: true, payMethod: 'cash', viaReservation: true }],
    ['p2', { c: 2, v: 1, from: [-12, '10:00'], to: [-8, '10:00'], cur: 'EUR', retAt: [-8, '09:30'], close: true, payMethod: 'card' }],
    ['p3', { c: 3, v: 2, from: [-16, '11:00'], to: [-12, '11:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-12, '10:50'], close: true, payMethod: 'card' }],
    ['p4', { c: 4, v: 3, from: [-28, '09:00'], to: [-22, '09:00'], cur: 'BAM', ins: 'in-cdw', retAt: [-22, '08:50'], close: true, payMethod: 'cash' }],
    ['p5', { c: 5, v: 3, from: [-15, '14:00'], to: [-11, '12:00'], cur: 'BAM', retAt: [-11, '11:40'], close: true, payMethod: 'cash' }],
    ['p6', { c: 6, v: 4, from: [-22, '10:00'], to: [-18, '10:00'], cur: 'EUR', ins: 'in-cdw', extras: [{ extraId: 'ex-gps', qty: 1 }], retAt: [-18, '10:20'], close: true, payMethod: 'card' }],
    ['p7', { c: 7, v: 4, from: [-9, '09:00'], to: [-5, '09:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-5, '08:30'], close: true, payMethod: 'card' }],
    ['p8', { c: 9, v: 5, from: [-14, '10:00'], to: [-8, '10:00'], cur: 'EUR', ins: 'in-cdw', retAt: [-8, '09:20'], close: true, payMethod: 'card' }],
    ['p9', { c: 12, v: 6, from: [-26, '09:00'], to: [-18, '12:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-18, '11:30'], close: true, payMethod: 'card' }],
    ['p10', { c: 15, v: 7, from: [-10, '10:00'], to: [-7, '10:00'], cur: 'BAM', retAt: [-7, '09:50'], close: true, payMethod: 'cash' }],
    ['p11', { c: 13, v: 8, from: [-14, '09:00'], to: [-6, '09:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-6, '08:40'], close: true, payMethod: 'card' }],
    ['p12', { c: 17, v: 9, from: [-24, '08:00'], to: [-14, '08:00'], cur: 'BAM', ins: 'in-cdw', retAt: [-14, '07:50'], close: true, payMethod: 'cash' }],
    ['p13', { c: 8, v: 10, from: [-26, '10:00'], to: [-21, '10:00'], cur: 'EUR', retAt: [-21, '10:15'], close: true, payMethod: 'card' }],
    ['p14', { c: 21, v: 11, from: [-10, '10:00'], to: [-5, '10:00'], cur: 'BAM', retAt: [-5, '09:45'], close: true, payMethod: 'cash' }],
    ['p15', { c: 22, v: 12, from: [-19, '09:00'], to: [-12, '09:00'], cur: 'BAM', ins: 'in-cdw', retAt: [-12, '08:50'], close: true, payMethod: 'cash' }],
    ['p16', { c: 11, v: 13, from: [-16, '10:00'], to: [-10, '10:00'], cur: 'BAM', retAt: [-10, '10:30'], close: true, payMethod: 'cash' }],
    ['p17', { c: 14, v: 14, from: [-10, '09:00'], to: [-6, '09:00'], cur: 'BAM', ins: 'in-scdw', retAt: [-6, '08:55'], close: true, payMethod: 'cash' }],
    ['p18', { c: 16, v: 15, from: [-24, '10:00'], to: [-16, '10:00'], cur: 'BAM', retAt: [-16, '09:30'], close: true, payMethod: 'cash' }],
    ['p19', { c: 18, v: 17, from: [-17, '10:00'], to: [-10, '10:00'], cur: 'BAM', ins: 'in-scdw', retAt: [-10, '09:40'], close: true, payMethod: 'cash' }],
    ['p20', { c: 19, v: 18, from: [-14, '09:00'], to: [-7, '09:00'], cur: 'BAM', retAt: [-7, '08:40'], close: true, payMethod: 'cash' }],
    ['p21', { c: 20, v: 19, from: [-20, '10:00'], to: [-14, '10:00'], cur: 'EUR', retAt: [-14, '10:30'], close: true, payMethod: 'card' }],
    ['p22', { c: 10, v: 20, from: [-15, '09:00'], to: [-9, '09:00'], cur: 'EUR', ins: 'in-cdw', retAt: [-9, '08:30'], close: true, payMethod: 'card' }],
    ['p23', { c: 23, v: 22, from: [-12, '10:00'], to: [-7, '10:00'], cur: 'EUR', retAt: [-7, '09:30'], close: true, payMethod: 'card' }],
    ['p24', { c: 24, v: 23, from: [-9, '09:00'], to: [-5, '09:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-5, '08:30'], close: true, payMethod: 'card' }],
    ['p25', { c: 25, v: 24, from: [-20, '10:00'], to: [-10, '10:00'], cur: 'EUR', ins: 'in-scdw', retAt: [-10, '09:30'], close: true, payMethod: 'card' }],
    ['p26', { c: 26, v: 25, from: [-12, '08:00'], to: [-6, '08:00'], cur: 'EUR', retAt: [-6, '08:20'], close: true, payMethod: 'card' }],
    ['p27', { c: 27, v: 21, from: [-32, '10:00'], to: [-25, '10:00'], cur: 'EUR', ins: 'in-cdw', retAt: [-25, '09:30'], close: true, payMethod: 'card' }],
  ]
  for (const [k, s] of past) mk(k, s)

  // a rental on the external vehicle during its earlier, returned engagement (supplier shows past use)
  seedSuppliers(d, T, as, setNow, veh)

  // ------------------------------------------------------------------ current rentals (the live operation)
  // Rd1: SJJ Polo, delivered 3 days ago, planned return yesterday 18:00 → overdue
  mk('rd1', { c: 6, v: 1, from: [-3, '09:00'], to: [-1, '18:00'], cur: 'BAM', ins: 'in-cdw', pay: 'part', payMethod: 'cash', stopAt: 'delivered' })
  // Rd2: SJJ Tiguan, return due today 17:00
  mk('rd2', { c: 7, v: 6, from: [-5, '10:00'], to: [0, '17:00'], cur: 'EUR', ins: 'in-scdw', extras: [{ extraId: 'ex-seat', qty: 1 }], pay: 'part', payMethod: 'card', stopAt: 'delivered', viaReservation: true })
  // Rd3: MST Corolla, due today 13:00
  mk('rd3', { c: 13, v: 13, from: [-2, '10:00'], to: [0, '13:00'], cur: 'BAM', ins: 'in-cdw', pay: 'full', payMethod: 'cash', stopAt: 'delivered' })
  // Rd4: DBV Fabia, due today 11:30
  mk('rd4', { c: 12, v: 19, from: [-4, '12:00'], to: [0, '11:30'], cur: 'EUR', pay: 'full', payMethod: 'card', stopAt: 'delivered' })
  // Rd5: SJJ BMW, corporate Neretva Logistics, until +4d
  mk('rd5', { c: 4, v: 8, from: [-1, '09:00'], to: [4, '09:00'], cur: 'EUR', ins: 'in-scdw', corp: 'co1', pay: 'none', stopAt: 'delivered', viaReservation: true })
  // Rd6: MST RAV4 until +2d, USD? no: EUR with partial payment
  mk('rd6', { c: 9, v: 15, from: [-6, '10:00'], to: [2, '12:00'], cur: 'BAM', ins: 'in-scdw', pay: 'part', payMethod: 'cash', stopAt: 'delivered' })
  // Rd7: DBV Mercedes until +5d
  mk('rd7', { c: 10, v: 24, from: [-2, '10:00'], to: [5, '10:00'], cur: 'EUR', ins: 'in-scdw', pay: 'part', payMethod: 'card', stopAt: 'delivered', viaReservation: true })
  // Rd8: DBV Octavia delivered 9 days ago, planned return 2 days ago → second overdue
  mk('rd8', { c: 11, v: 21, from: [-9, '10:00'], to: [-2, '10:00'], cur: 'EUR', pay: 'part', payMethod: 'card', stopAt: 'delivered' })
  // Rd9: DBV external Volvo (received), until +3d
  seedExternalReceive(d, T, as, setNow, veh)
  mk('rd9', { c: 25, v: 27, from: [-1, '10:00'], to: [3, '10:00'], cur: 'EUR', ins: 'in-scdw', pay: 'part', payMethod: 'card', stopAt: 'delivered' })
  // Prepared (today pickups)
  ensureReady(veh(4))
  mk('rp1', { c: 1, v: 4, from: [0, '12:00'], to: [3, '12:00'], cur: 'BAM', ins: 'in-cdw', stopAt: 'prepared', viaReservation: false })
  mk('rp2', { c: 2, v: 7, from: [0, '15:30'], to: [5, '15:30'], cur: 'EUR', ins: 'in-scdw', stopAt: 'prepared', extras: [{ extraId: 'ex-gps', qty: 1 }] })
  // Returned, finance still open
  mk('rr1', { c: 20, v: 2, from: [-6, '10:00'], to: [-1, '12:00'], cur: 'EUR', ins: 'in-cdw', retAt: [-1, '14:00'], retFuel: 'half', kmDriven: 1900, pay: 'part', payMethod: 'card', stopAt: 'returned' })
  mk('rr2', { c: 22, v: 12, from: [-7, '10:00'], to: [-2, '10:00'], cur: 'BAM', ins: 'in-cdw', retAt: [-2, '09:00'], pay: 'full', payMethod: 'cash', stopAt: 'returned' })
  mk('rr3', { c: 15, v: 20, from: [-5, '10:00'], to: [-1, '10:00'], cur: 'EUR', ins: 'in-cdw', retAt: [-1, '09:40'], pay: 'full', payMethod: 'card', stopAt: 'returned' })
  // Exception closed (customer left the vehicle after a breakdown)
  mk('rx1', { c: 18, v: 10, from: [-14, '10:00'], to: [-9, '10:00'], cur: 'EUR', pay: 'full', payMethod: 'card', stopAt: 'delivered' })
  setNow(T(-12, '15:00'))
  as('u-mgr')
  exceptionClose(d, rentals.rx1!, 'exception', 'Müşteri araç arızası sonrası aracı yetkili serviste bıraktı; normal iade yapılamadı.')
  find.vehicle(d, veh(10).id)!.location = veh(10).homeBranchId
  rentalFinance(d, rentals.rx1!)

  // ------------------------------------------------------------------ future and special reservations
  seedReservations(d, T, as, setNow, veh, C)

  // ------------------------------------------------------------------ operations records: maintenance, damages, incidents, fines, tasks, transfers
  seedOperations(d, T, as, setNow, veh, C, rentals)

  // ------------------------------------------------------------------ commercial: partners, leads, quotes
  seedCommercial(d, T, as, setNow, veh, C, rentals)

  // ------------------------------------------------------------------ finance extras, approvals, rules, exceptions, expenses
  seedControl(d, T, as, setNow, veh, C, rentals)

  // ------------------------------------------------------------------ final state: demo time, readiness of idle vehicles
  setNow(NOW)
  as('u-owner')
  const dirty = new Set([2, 7, 10, 12, 16, 20].map((n) => veh(n).id))
  for (const v of d.vehicles) {
    if (v.source === 'external') continue
    if (!dirty.has(v.id)) {
      v.readiness = { clean: true, fuelOk: true, checkedAt: T(-1, '17:00'), checkedBy: 'u-ops1', note: '' }
      if (v.fuel === 'empty' || v.fuel === 'quarter') v.fuel = 'half'
    }
  }
  veh(7).readiness = { clean: false, fuelOk: true, checkedAt: null, checkedBy: null, note: 'Yıkama bekliyor' }
  veh(2).fuel = 'half'
  d.events.sort((a, b) => a.at.localeCompare(b.at))
  d.notifications.sort((a, b) => b.at.localeCompare(a.at))
  d.meta.modified = false
  return d
}

// ------------------------------------------------------------------------- pieces

function seedCorporates(d: Db, C: (n: number) => Customer) {
  const mkc = (no: number, name: string, tax: string, country: string, limits: Record<string, number>, agreement: string | undefined, drivers: number[], terms: number) => {
    const id = `co${no}`
    d.corporates.push({ id, no: nextNo(d, 'KH'), name, taxId: tax, country, address: `${name} · kurgusal adres`, contacts: [{ name: 'Finans Sorumlusu', role: 'Finans', phone: '+387 61 000 0' + no + '0', email: `finans@${name.split(' ')[0]!.toLowerCase()}-demo.example` }], creditLimits: limits, overrides: [], agreementId: agreement, driverCustomerIds: drivers.map((n) => C(n).id), paymentTermsDays: terms, status: 'active' })
    for (const n of drivers) C(n).corporateId = id
  }
  mkc(1, 'Neretva Logistics d.o.o.', 'DEMO-4300000000011', 'BA', { EUR: 2000000, BAM: 1000000 }, 'ag-gold', [4, 5], 30)
  mkc(2, 'Drina Consulting d.o.o.', 'DEMO-4300000000022', 'BA', { EUR: 800000, BAM: 600000 }, 'ag-silver', [2], 15)
  mkc(3, 'Una Tours d.o.o.', 'DEMO-4300000000033', 'BA', { EUR: 250000 }, 'ag-silver', [21, 22], 30)
  mkc(4, 'Bosna Pharma d.d.', 'DEMO-4300000000044', 'BA', { BAM: 1200000 }, undefined, [19], 45)
}

const VEHICLES: [string, string, number, string, string, 'SJJ' | 'MST' | 'DBV', string, number, 'petrol' | 'diesel' | 'hybrid' | 'electric'][] = [
  ['S11-K-101', 'Volkswagen Polo', 2023, 'Beyaz', 'cl-eco', 'SJJ', 'ECO', 41200, 'petrol'],
  ['S11-K-102', 'Škoda Fabia', 2022, 'Gümüş', 'cl-eco', 'SJJ', 'ECO', 58200, 'petrol'],
  ['S11-K-103', 'Opel Corsa', 2023, 'Kırmızı', 'cl-eco', 'SJJ', 'ECO', 33400, 'petrol'],
  ['S11-K-104', 'Volkswagen Golf', 2023, 'Mavi', 'cl-cmp', 'SJJ', 'CMP', 29800, 'diesel'],
  ['S11-K-105', 'Škoda Octavia', 2022, 'Siyah', 'cl-cmp', 'SJJ', 'CMP', 72100, 'diesel'],
  ['S11-K-106', 'Volkswagen Tiguan', 2023, 'Gri', 'cl-suv', 'SJJ', 'SUV', 38900, 'diesel'],
  ['S11-K-107', 'Dacia Duster', 2022, 'Turuncu', 'cl-suv', 'SJJ', 'SUV', 61300, 'diesel'],
  ['S11-K-108', 'BMW 320d', 2023, 'Siyah', 'cl-prm', 'SJJ', 'PRM', 27600, 'diesel'],
  ['S11-K-109', 'Volkswagen Transporter', 2021, 'Beyaz', 'cl-van', 'SJJ', 'VAN', 98500, 'diesel'],
  ['S11-K-110', 'Renault Clio', 2022, 'Sarı', 'cl-eco', 'SJJ', 'ECO', 52100, 'petrol'],
  ['M22-K-201', 'Volkswagen Polo', 2023, 'Gri', 'cl-eco', 'MST', 'ECO', 36700, 'petrol'],
  ['M22-K-202', 'Renault Clio', 2022, 'Beyaz', 'cl-eco', 'MST', 'ECO', 49800, 'petrol'],
  ['M22-K-203', 'Toyota Corolla', 2023, 'Gümüş', 'cl-cmp', 'MST', 'CMP', 31500, 'hybrid'],
  ['M22-K-204', 'Volkswagen Golf', 2022, 'Siyah', 'cl-cmp', 'MST', 'CMP', 64400, 'petrol'],
  ['M22-K-205', 'Toyota RAV4', 2023, 'Beyaz', 'cl-suv', 'MST', 'SUV', 40700, 'hybrid'],
  ['M22-K-206', 'Kia Sportage', 2022, 'Kırmızı', 'cl-suv', 'MST', 'SUV', 55900, 'diesel'],
  ['M22-K-207', 'Audi A4', 2022, 'Gri', 'cl-prm', 'MST', 'PRM', 59100, 'diesel'],
  ['M22-K-208', 'Mercedes Vito', 2021, 'Beyaz', 'cl-van', 'MST', 'VAN', 87300, 'diesel'],
  ['DU 101-AB', 'Škoda Fabia', 2023, 'Beyaz', 'cl-eco', 'DBV', 'ECO', 30200, 'petrol'],
  ['DU 102-AB', 'Opel Corsa', 2022, 'Mavi', 'cl-eco', 'DBV', 'ECO', 47800, 'petrol'],
  ['DU 103-CD', 'Škoda Octavia', 2023, 'Gri', 'cl-cmp', 'DBV', 'CMP', 35100, 'diesel'],
  ['DU 104-CD', 'Toyota Corolla', 2022, 'Siyah', 'cl-cmp', 'DBV', 'CMP', 53600, 'hybrid'],
  ['DU 105-EF', 'Volkswagen Tiguan', 2023, 'Mavi', 'cl-suv', 'DBV', 'SUV', 33900, 'diesel'],
  ['DU 106-EF', 'Mercedes C 220', 2023, 'Siyah', 'cl-prm', 'DBV', 'PRM', 24200, 'diesel'],
  ['DU 107-GH', 'Volkswagen Transporter', 2022, 'Beyaz', 'cl-van', 'DBV', 'VAN', 71800, 'diesel'],
]

function seedVehicles(d: Db, T: (o: number, hm?: string, z?: string) => string): Vehicle[] {
  const out: Vehicle[] = []
  const bid = (c: string) => (c === 'SJJ' ? 'b-sjj' : c === 'MST' ? 'b-mst' : 'b-dbv')
  VEHICLES.forEach((r, i) => {
    const [plate, model, year, color, cls, br, , km, fuel] = r
    const [make, ...rest] = model.split(' ')
    const v: Vehicle = {
      id: nextId(d, 'v'),
      plate,
      make: make!,
      model: rest.join(' '),
      year,
      color,
      classId: cls,
      homeBranchId: bid(br),
      location: bid(br),
      status: 'active',
      odometerKm: km,
      fuelType: fuel,
      fuel: 'full',
      vin: `DEMOVIN${String(1000 + i)}XX`,
      source: 'internal',
      readiness: { clean: true, fuelOk: true, checkedAt: T(-30), checkedBy: 'u-ops1', note: '' },
      tire: { type: 'all_season', mountedAt: T(-120), treadMm: 6 + (i % 3) },
      service: { intervalKm: 15000, lastKm: km - 4000 - (i % 5) * 1500, lastAt: T(-90 - i) },
      keys: { count: 2, holder: 'Şube anahtar dolabı' },
    }
    d.vehicles.push(v)
    out.push(v)
    d.odometer.push({ id: nextId(d, 'od'), vehicleId: v.id, km, at: T(-200), source: 'initial', by: 'u-owner' })
    d.locations.push({ id: nextId(d, 'lc'), vehicleId: v.id, at: T(-200), location: v.location, reason: 'Filoya giriş' })
  })
  // Service due examples: v5 (km over) and v9 are due; v16 close to due.
  out[4]!.service.lastKm = out[4]!.odometerKm - 16200
  out[8]!.service.lastKm = out[8]!.odometerKm - 15400
  // Tires: a winter set on a summer day is a warning example; a worn set another
  out[2]!.tire = { type: 'winter', mountedAt: T(-200), treadMm: 5 }
  out[13]!.tire = { type: 'summer', mountedAt: T(-300), treadMm: 2 }
  // external vehicles
  const ext: [string, string, string, number, string, string, string, number][] = [
    ['S11-X-901', 'Hyundai Tucson', 'cl-suv', 2024, 'b-sjj', 'su1', 'Beyaz', 18200],
    ['DU 901-XY', 'Volvo S90', 'cl-prm', 2024, 'b-dbv', 'su2', 'Siyah', 12400],
    ['M22-X-902', 'Ford Tourneo', 'cl-van', 2023, 'b-mst', 'su3', 'Gri', 33800],
  ]
  ext.forEach(([plate, model, cls, year, br, sup, color, km], i) => {
    const xv = { id: `xv${i + 1}`, supplierId: sup, plate, make: model.split(' ')[0]!, model: model.split(' ').slice(1).join(' '), classId: cls, year }
    d.externalVehicles.push(xv)
    d.counters.xv = Math.max(d.counters.xv ?? 0, i + 1)
    const v: Vehicle = {
      id: nextId(d, 'v'),
      plate,
      make: xv.make,
      model: xv.model,
      year,
      color,
      classId: cls,
      homeBranchId: br,
      location: sup,
      status: 'active',
      odometerKm: km,
      fuelType: 'petrol',
      fuel: 'full',
      vin: `DEMOEXT${i}XX`,
      source: 'external',
      externalVehicleId: xv.id,
      readiness: { clean: true, fuelOk: true, checkedAt: T(-5), checkedBy: 'u-ops1', note: '' },
      tire: { type: 'all_season', mountedAt: T(-60), treadMm: 7 },
      service: { intervalKm: 15000, lastKm: km - 3000, lastAt: T(-60) },
      keys: { count: 0, holder: 'Tedarikçi' },
    }
    d.vehicles.push(v)
    out.push(v)
  })
  return out
}

function seedVehicleDocs(d: Db, T: (o: number, hm?: string, z?: string) => string, V: Vehicle[]) {
  const ymd = (off: number) => T(off, '12:00').slice(0, 10)
  let n = 0
  const add = (v: Vehicle, kind: string, validOff: number) => {
    const doc: DemoDocument = { id: nextId(d, 'doc'), ownerType: 'vehicle', ownerId: v.id, kind, name: `${kind} · ${v.plate} (örnek belge)`, version: 1, validUntil: ymd(validOff), placeholder: true, uploadedAt: T(-100), uploadedBy: 'u-ops1' }
    d.documents.push(doc)
    n++
  }
  V.forEach((v, i) => {
    if (v.source === 'external') {
      add(v, 'insurance', 200)
      return
    }
    add(v, 'registration', 300 + i * 4)
    add(v, 'insurance', 90 + i * 7)
    add(v, 'inspection', 120 + i * 9)
  })
  // exceptions: v22 insurance expired 3 days ago, v14 inspection expiring in 12 days
  const set = (v: Vehicle, kind: string, off: number) => {
    const doc = d.documents.find((x) => x.ownerId === v.id && x.kind === kind)!
    doc.validUntil = ymd(off)
  }
  set(V[21]!, 'insurance', -3)
  set(V[13]!, 'inspection', 12)
  set(V[5]!, 'insurance', 18)
  void n
}

function seedDrawers(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void) {
  const mk = (branch: string, cur: Cur, name: string) => d.drawers.push({ id: `dr-${branch}-${cur}`, branchId: `b-${branch}`, currency: cur, name, status: 'closed' })
  mk('sjj', 'EUR', 'SJJ · EUR kasası')
  mk('sjj', 'BAM', 'SJJ · BAM kasası')
  mk('sjj', 'USD', 'SJJ · USD kasası')
  mk('mst', 'BAM', 'MST · BAM kasası')
  mk('mst', 'EUR', 'MST · EUR kasası')
  mk('dbv', 'EUR', 'DBV · EUR kasası')
  as('u-owner')
  // A few closed shifts for history (with a small count difference on one of them)
  const closed: [string, number, number, number, string, string][] = [
    ['dr-sjj-EUR', -58, 50000, 50000, '', 'Vardiya sorunsuz kapandı'],
    ['dr-sjj-EUR', -57, 50000, 49800, 'Para üstü hatası (2,00 EUR eksik)', 'Fark yöneticiye bildirildi'],
    ['dr-sjj-BAM', -57, 100000, 100000, '', ''],
    ['dr-mst-BAM', -58, 80000, 80000, '', ''],
  ]
  for (const [id, off, open, counted, reason, note] of closed) {
    setNow(T(off, '08:00'))
    openSession(d, id, open)
    setNow(T(off, '18:00'))
    closeSession(d, id, counted, reason, 'u-mgr', note)
  }
  // Sessions open now (long enough ago to cover the history of cash payments)
  setNow(T(-45, '08:00'))
  openSession(d, 'dr-sjj-EUR', 50000)
  openSession(d, 'dr-sjj-BAM', 100000)
  openSession(d, 'dr-sjj-USD', 30000)
  openSession(d, 'dr-mst-BAM', 80000)
  openSession(d, 'dr-dbv-EUR', 70000)
  // dr-mst-EUR stays closed: the shift-open scenario opens it
}

function seedSuppliers(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle) {
  as('u-owner')
  setNow(T(-60, '09:00'))
  createSupplier(d, { name: 'Balkan Fleet Partners d.o.o.', country: 'BA', contactName: 'Amar Delić (Demo)', email: 'amar@balkanfleet-demo.example', phone: '+387 61 000 901', terms: '30 gün vadeli, günlük bedel' })
  createSupplier(d, { name: 'Coast Cars Supply d.o.o.', country: 'HR', contactName: 'Mia Perić (Demo)', email: 'mia@coastcars-demo.example', phone: '+385 91 000 902', terms: 'Aylık mutabakat' })
  createSupplier(d, { name: 'Herzegovina Auto Supply', country: 'BA', contactName: 'Ivan Jurić (Demo)', email: 'ivan@hercegovina-demo.example', phone: '+387 63 000 903', terms: 'Haftalık mutabakat' })
  // ids su1..su3 were used in the external vehicle masters
  d.suppliers.forEach((s, i) => (s.id = `su${i + 1}`))
  void veh
  // Past engagement for v26: requested, offered, accepted, received, returned, settled and paid
  setNow(T(-45, '09:00'))
  const sr = createSourcingRequest(d, { classId: 'cl-suv', from: T(-40, '08:00'), to: T(-30, '18:00'), branchId: 'b-sjj', reason: 'Yaz sezonu talep artışı' })
  addSupplierOffer(d, sr.id, { supplierId: 'su1', vehicle: 'Hyundai Tucson 2024', dailyRate: { minor: 3800, cur: 'EUR' }, validUntil: T(-38, '18:00') })
  const eg = acceptOffer(d, sr.id, d.sourcing[0]!.offers[0]!.id, 'S11-X-901', 'Hyundai', 'Tucson')
  setNow(T(-40, '08:30'))
  receiveEngagement(d, eg.id, 17500, 'full', 5, 'Teslim alındı, hasar yok')
  setNow(T(-30, '18:30'))
  returnEngagement(d, eg.id, 18200, 'full', 5, 'İade edildi')
  setNow(T(-28, '10:00'))
  createSettlement(d, eg.id)
  setNow(T(-20, '10:00'))
  paySettlement(d, d.settlements[0]!.id, 'EFT-DEMO-0042')
  // Future engagement for the same external master (confirmed, not received): not deliverable yet
  setNow(T(-3, '09:00'))
  const sr2 = createSourcingRequest(d, { classId: 'cl-suv', from: T(8, '08:00'), to: T(20, '18:00'), branchId: 'b-sjj', reason: 'Kurumsal etkinlik dönemi' })
  addSupplierOffer(d, sr2.id, { supplierId: 'su1', vehicle: 'Hyundai Tucson 2024', dailyRate: { minor: 4000, cur: 'EUR' }, validUntil: T(5, '18:00') })
  acceptOffer(d, sr2.id, d.sourcing[1]!.offers[0]!.id, 'S11-X-901', 'Hyundai', 'Tucson')
  // v28: confirmed engagement for later this month, a second open request awaiting offers
  const sr3 = createSourcingRequest(d, { classId: 'cl-van', from: T(3, '08:00'), to: T(15, '18:00'), branchId: 'b-mst', reason: 'Grup transferi' })
  addSupplierOffer(d, sr3.id, { supplierId: 'su3', vehicle: 'Ford Tourneo 2023', dailyRate: { minor: 6500, cur: 'EUR' }, validUntil: T(2, '18:00') })
  acceptOffer(d, sr3.id, d.sourcing[2]!.offers[0]!.id, 'M22-X-902', 'Ford', 'Tourneo')
  createSourcingRequest(d, { classId: 'cl-prm', from: T(10, '08:00'), to: T(17, '18:00'), branchId: 'b-dbv', reason: 'Düğün transferi talebi (teklif bekleniyor)' })
}

function seedExternalReceive(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle) {
  as('u-owner')
  setNow(T(-8, '09:00'))
  const sr = createSourcingRequest(d, { classId: 'cl-prm', from: T(-6, '08:00'), to: T(9, '18:00'), branchId: 'b-dbv', reason: 'Premium sınıf kapasitesi' })
  addSupplierOffer(d, sr.id, { supplierId: 'su2', vehicle: 'Volvo S90 2024', dailyRate: { minor: 6800, cur: 'EUR' }, validUntil: T(-7, '18:00') })
  const sr0 = d.sourcing.find((x) => x.id === sr.id)!
  const eg = acceptOffer(d, sr.id, sr0.offers[0]!.id, 'DU 901-XY', 'Volvo', 'S90')
  setNow(T(-5, '09:00'))
  receiveEngagement(d, eg.id, veh(27).odometerKm, 'full', 5, 'Teslim alındı, hasarsız')
  veh(27).readiness = { clean: true, fuelOk: true, checkedAt: T(-5, '10:00'), checkedBy: 'u-ops3', note: '' }
}

function seedReservations(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle, C: (n: number) => Customer) {
  const mk = (c: number, v: number | null, cls: string, br: string, from: [number, string], to: [number, string], cur: Cur, o: { ins?: string; extras?: { extraId: string; qty: number }[]; corp?: string; status?: 'pending' | 'confirmed'; created?: number; channel?: 'phone' | 'walk_in' | 'web_form' | 'partner' | 'corporate' | 'quote'; by?: string; partnerId?: string; drivers?: number[] } = {}) => {
    as(o.by ?? (br === 'b-sjj' ? 'u-ops1' : br === 'b-mst' ? 'u-ops2' : 'u-ops3'))
    setNow(T(o.created ?? -2, '11:00'))
    const r = createReservation(d, { customerId: C(c).id, corporateId: o.corp, classId: cls, vehicleId: v ? veh(v).id : undefined, pickupBranchId: br, returnBranchId: br, pickupAt: T(from[0], from[1]), returnAt: T(to[0], to[1]), currency: cur, extras: o.extras ?? [], insuranceId: o.ins, drivers: [C(c).id, ...(o.drivers ?? []).map((n) => C(n).id)], channel: o.channel ?? 'phone', partnerId: o.partnerId })
    if (o.status !== 'pending') {
      as('u-mgr')
      confirmReservation(d, r.id)
    }
    return r
  }
  // Confirmed with a specific vehicle (future)
  mk(5, 3, 'cl-eco', 'b-sjj', [2, '10:00'], [6, '10:00'], 'BAM', { ins: 'in-cdw', channel: 'web_form' })
  mk(17, 5, 'cl-cmp', 'b-sjj', [1, '09:00'], [4, '09:00'], 'EUR', { ins: 'in-scdw', channel: 'web_form' })
  mk(21, 9, 'cl-van', 'b-sjj', [3, '09:00'], [10, '18:00'], 'EUR', { corp: 'co3', channel: 'corporate', drivers: [22] })
  mk(20, 11, 'cl-eco', 'b-mst', [1, '10:00'], [3, '10:00'], 'BAM', { ins: 'in-cdw' })
  mk(14, 14, 'cl-cmp', 'b-mst', [5, '10:00'], [9, '10:00'], 'BAM', { ins: 'in-scdw' })
  mk(8, 16, 'cl-suv', 'b-mst', [1, '09:30'], [4, '09:30'], 'EUR', { ins: 'in-scdw' }) // later conflicts with a damage block (a demonstrated risk)
  mk(16, 22, 'cl-cmp', 'b-dbv', [2, '10:00'], [7, '10:00'], 'EUR', { ins: 'in-cdw' })
  mk(9, 23, 'cl-suv', 'b-dbv', [1, '10:00'], [6, '10:00'], 'EUR', { ins: 'in-scdw' })
  mk(23, 25, 'cl-van', 'b-dbv', [4, '10:00'], [11, '10:00'], 'EUR')
  // Class-only reservations (demand without a vehicle)
  mk(19, null, 'cl-eco', 'b-mst', [0, '18:00'], [2, '18:00'], 'BAM', { ins: 'in-cdw', created: -1 })
  mk(21, null, 'cl-suv', 'b-sjj', [1, '12:00'], [5, '12:00'], 'BAM', { corp: 'co4', channel: 'corporate' })
  mk(24, null, 'cl-prm', 'b-dbv', [4, '10:00'], [8, '10:00'], 'EUR', { ins: 'in-scdw' })
  mk(28, 2, 'cl-eco', 'b-sjj', [3, '09:00'], [6, '09:00'], 'EUR', { ins: 'in-cdw', channel: 'web_form' }) // passport missing: document gate at delivery
  // Pending (hold nothing)
  mk(12, null, 'cl-eco', 'b-sjj', [6, '10:00'], [9, '10:00'], 'EUR', { status: 'pending', created: -1 })
  mk(13, null, 'cl-cmp', 'b-dbv', [7, '10:00'], [12, '10:00'], 'EUR', { status: 'pending', created: 0 })
  mk(3, null, 'cl-suv', 'b-mst', [9, '10:00'], [14, '10:00'], 'BAM', { status: 'pending', created: -3 })
  mk(15, 19, 'cl-eco', 'b-dbv', [10, '10:00'], [13, '10:00'], 'EUR', { status: 'pending', created: -4 })
  // Cancelled and no-show
  const cx = mk(1, null, 'cl-eco', 'b-sjj', [-4, '10:00'], [-1, '10:00'], 'BAM', { created: -10 })
  as('u-ops1')
  setNow(T(-6, '12:00'))
  cancelReservation(d, cx.id, 'Müşteri uçuşunu iptal etti')
  const cx2 = mk(2, null, 'cl-cmp', 'b-mst', [3, '10:00'], [6, '10:00'], 'EUR', { created: -2, status: 'pending' })
  setNow(T(-1, '10:00'))
  cancelReservation(d, cx2.id, 'Fiyat uygun bulunmadı')
  const ns = mk(16, null, 'cl-eco', 'b-dbv', [-2, '10:00'], [1, '10:00'], 'EUR', { created: -8 })
  setNow(T(-1, '18:00'))
  as('u-ops3')
  markNoShow(d, ns.id)
  // waitlist
  as('u-ops1')
  setNow(T(-1, '16:00'))
  addWaitlist(d, { customerId: C(3).id, classId: 'cl-suv', branchId: 'b-sjj', from: T(2, '10:00'), to: T(6, '10:00'), note: 'SUV müsait olursa arayın' })
  addWaitlist(d, { customerId: C(7).id, classId: 'cl-prm', branchId: 'b-sjj', from: T(4, '10:00'), to: T(8, '10:00'), note: 'Premium sınıf bekliyor' })
  addWaitlist(d, { customerId: C(13).id, classId: 'cl-eco', branchId: 'b-mst', from: T(1, '10:00'), to: T(3, '10:00'), note: '' })
}

function seedOperations(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle, C: (n: number) => Customer, rentals: Record<string, string>) {
  void C
  // Maintenance
  as('u-fleet')
  setNow(T(-6, '10:00'))
  const m1 = planMaintenance(d, { vehicleId: veh(17).id, type: 'periodic', plannedStart: T(-1, '09:00'), plannedEnd: T(0, '16:00'), providerId: 'sp-1', reason: '60.000 km periyodik bakım' })
  setNow(T(-1, '09:00'))
  startMaintenance(d, m1.id)
  setNow(T(-2, '10:00'))
  planMaintenance(d, { vehicleId: veh(18).id, type: 'tire', plannedStart: T(1, '09:00'), plannedEnd: T(1, '17:00'), providerId: 'sp-2', reason: 'Mevsimlik lastik değişimi' })
  // completed ones for history and costs
  setNow(T(-20, '09:00'))
  const m3 = planMaintenance(d, { vehicleId: veh(12).id, type: 'cleaning', plannedStart: T(-19, '09:00'), plannedEnd: T(-19, '12:00'), providerId: 'sp-4', reason: 'Derin temizlik' })
  setNow(T(-19, '09:00'))
  startMaintenance(d, m3.id)
  setNow(T(-19, '12:00'))
  completeMaintenance(d, m3.id, { cost: { minor: 3000, cur: 'EUR' } })
  setNow(T(-35, '09:00'))
  const m4 = planMaintenance(d, { vehicleId: veh(22).id, type: 'tire', plannedStart: T(-34, '09:00'), plannedEnd: T(-34, '15:00'), providerId: 'sp-3', reason: 'Yaz lastiği takımı' })
  setNow(T(-34, '09:00'))
  startMaintenance(d, m4.id)
  setNow(T(-34, '15:00'))
  completeMaintenance(d, m4.id, { cost: { minor: 12000, cur: 'EUR' }, tireTo: 'summer', treadMm: 8 })
  setNow(T(-50, '09:00'))
  const m5 = planMaintenance(d, { vehicleId: veh(8).id, type: 'periodic', plannedStart: T(-49, '09:00'), plannedEnd: T(-49, '17:00'), providerId: 'sp-1', reason: '20.000 km bakımı' })
  setNow(T(-49, '09:00'))
  startMaintenance(d, m5.id)
  setNow(T(-49, '17:00'))
  completeMaintenance(d, m5.id, { cost: { minor: 18500, cur: 'EUR' }, km: veh(8).odometerKm })

  // Damages
  as('u-ops1')
  setNow(T(-1, '16:00'))
  // v16: severe damage found after a rental was closed yesterday; it blocks the vehicle and a confirmed reservation tomorrow is now at risk
  const pastR = find.rental(d, rentals.p14!)
  void pastR
  const dm1 = createDamage(d, { vehicleId: veh(16).id, severity: 'severe', area: 'Ön tampon ve far', description: 'Park halinde çarpma: ön tampon kırık, sol far çatlak.', photos: 5, blocksVehicle: true, estimate: { minor: 185000, cur: 'EUR' } })
  as('u-fleet')
  linkRepair(d, dm1.id, T(5, '09:00'), T(7, '17:00'), 'sp-1')
  // v20: minor damage found at return of rr3
  as('u-ops3')
  setNow(T(-1, '09:50'))
  const dm2 = createDamage(d, { vehicleId: veh(20).id, rentalId: rentals.rr3, severity: 'moderate', area: 'Sağ arka kapı', description: 'İade kontrolünde sağ arka kapıda çizik ve göçük bulundu.', photos: 5, blocksVehicle: false, estimate: { minor: 96000, cur: 'EUR' } })
  as('u-mgr2')
  setDamageLiability(d, dm2.id, 'customer', { minor: 96000, cur: 'EUR' })
  chargeDamageToCustomer(d, dm2.id)
  recordInsurerRecovery(d, dm2.id, 'SIG-DEMO-7781', { minor: 16000, cur: 'EUR' }, false)
  // older damage with insurer liability and repair completed
  as('u-ops2')
  setNow(T(-25, '14:00'))
  const dm3 = createDamage(d, { vehicleId: veh(15).id, rentalId: rentals.p18, severity: 'minor', area: 'Ön tampon', description: 'Park sensörü çevresinde küçük çizik.', photos: 4, blocksVehicle: false, estimate: { minor: 24000, cur: 'BAM' } })
  as('u-mgr2')
  setDamageLiability(d, dm3.id, 'company', { minor: 24000, cur: 'BAM' })
  d.damages.find((x) => x.id === dm3.id)!.status = 'closed'
  addHistory(d, d.damages.find((x) => x.id === dm3.id)!.history, 'Kapatıldı', 'Şirket üstlendi; kapatıldı.')
  // Repair maintenance for dm2 (planned)
  as('u-fleet')
  setNow(T(-1, '10:30'))
  linkRepair(d, dm2.id, T(1, '09:00'), T(2, '17:00'), 'sp-3')

  // Incidents
  as('u-ops1')
  setNow(T(-2, '14:00'))
  const in1 = createIncident(d, { kind: 'breakdown', severity: 'medium', title: 'Müşteri yolda akü arızası bildirdi', description: 'Kiracı otobanda aracın çalışmadığını bildirdi; çekici yönlendirildi.', vehicleId: veh(1).id, rentalId: rentals.rd1, ownerId: 'u-mgr' })
  addIncidentEvidence(d, in1.id, 'Müşteri telefon notu')
  as('u-mgr')
  setIncidentStatus(d, in1.id, 'investigating', 'Servis ile görüşüldü')
  as('u-ops3')
  setNow(T(-1, '10:30'))
  createIncident(d, { kind: 'accident', severity: 'high', title: 'Park halindeki araç hasar gördü', description: 'Havalimanı otoparkında bir araç ön tampondan hasar aldı.', vehicleId: veh(16).id, ownerId: 'u-mgr2', links: [{ type: 'damage', id: dm1.id }] })
  as('u-ops2')
  setNow(T(-6, '12:00'))
  const in3 = createIncident(d, { kind: 'complaint', severity: 'low', title: 'Temizlik şikayeti', description: 'Müşteri aracın iç temizliğinden memnun kalmadı.', vehicleId: veh(11).id, ownerId: 'u-ops2' })
  as('u-mgr')
  setIncidentStatus(d, in3.id, 'resolved', 'Müşteriye özür ve bir sonraki kiralamada hizmet indirimi önerildi.')
  as('u-ops1')
  setNow(T(-12, '09:00'))
  const in4 = createIncident(d, { kind: 'safety', severity: 'critical', title: 'Fren uyarı lambası yandı', description: 'Teslim öncesi kontrolde fren uyarı lambası yandı; araç servise yönlendirildi.', vehicleId: veh(10).id, ownerId: 'u-fleet' })
  as('u-mgr')
  setIncidentStatus(d, in4.id, 'resolved', 'Fren balataları değiştirildi, test sürüşü tamam.')
  as('u-mgr2')
  setIncidentStatus(d, in4.id, 'closed', 'Servis faturası kontrol edildi.')
  as('u-ops1')
  setNow(T(0, '08:30'))
  createIncident(d, { kind: 'theft', severity: 'high', title: 'Anahtar kaybı şüphesi', description: 'Şube anahtar dolabında bir yedek anahtar eksik görünüyor.', ownerId: 'u-mgr' })

  // Fines
  as('u-mgr')
  setNow(T(-1, '10:00'))
  const f1 = createFine(d, { vehicleId: veh(1).id, occurredAt: T(-2, '14:20'), kind: 'Hız ihlali', authorityRef: 'BA-2026-778123', authority: 'Sarajevo Kanton Polisi (kurgusal)', amount: { minor: 6000, cur: 'BAM' }, dueDate: T(25, '12:00').slice(0, 10) })
  void f1
  setNow(T(-15, '09:00'))
  const f2 = createFine(d, { vehicleId: veh(6).id, occurredAt: T(-4, '08:10'), kind: 'Park ihlali', authorityRef: 'BA-2026-778050', authority: 'Sarajevo Belediyesi (kurgusal)', amount: { minor: 3000, cur: 'EUR' }, dueDate: T(10, '12:00').slice(0, 10) })
  as('u-mgr')
  assignFine(d, f2.id, rentals.rd2!)
  setNow(T(-3, '11:00'))
  chargeFineToCustomer(d, f2.id)
  as('u-acc')
  payFineToAuthority(d, f2.id)
  as('u-mgr2')
  setNow(T(-9, '10:00'))
  const f3 = createFine(d, { vehicleId: veh(24).id, occurredAt: T(-10, '17:45'), kind: 'Kırmızı ışık', authorityRef: 'HR-2026-33410', authority: 'Dubrovnik Polis Müdürlüğü (kurgusal)', amount: { minor: 15000, cur: 'EUR' }, dueDate: T(12, '12:00').slice(0, 10) })
  void f3
  setNow(T(-2, '11:00'))
  createFine(d, { vehicleId: veh(23).id, occurredAt: T(-30, '11:00'), kind: 'Hız ihlali', authorityRef: 'HR-2026-33002', authority: 'Dubrovnik Polis Müdürlüğü (kurgusal)', amount: { minor: 9000, cur: 'EUR' }, dueDate: T(2, '12:00').slice(0, 10) })
  as('u-mgr2')
  setNow(T(-1, '09:30'))
  createFine(d, { vehicleId: veh(15).id, occurredAt: T(-3, '13:05'), kind: 'Şerit ihlali', authorityRef: 'BA-2026-778400', authority: 'Hersek-Neretva Kanton Polisi (kurgusal)', amount: { minor: 4000, cur: 'BAM' }, dueDate: T(18, '12:00').slice(0, 10) })

  // Tasks
  as('u-mgr')
  const mkTask = (title: string, desc: string, prio: 'urgent' | 'high' | 'normal', due: [number, string], o: { owner?: string; recipients?: string[]; pool?: boolean; branch?: string; link?: { type: 'vehicle' | 'rental' | 'maintenance' | 'incident' | 'reservation' | 'damage' | 'fine'; id: string }; created?: number } = {}) => {
    setNow(T(o.created ?? -1, '09:00'))
    return createTask(d, { title, description: desc, priority: prio, dueAt: T(due[0], due[1]), ownerId: o.owner, recipientIds: o.recipients ?? [], pool: !!o.pool, branchId: o.branch, link: o.link })
  }
  mkTask('Gecikmiş iade için müşteriyi arayın', 'K-… kiralaması planlanan iadeyi geçti. Müşteriyle iletişime geçip yeni iade zamanını not edin.', 'urgent', [0, '12:00'], { owner: 'u-ops1', branch: 'b-sjj', link: { type: 'rental', id: rentals.rd1! } })
  mkTask('Duster aracı yıkatın', 'Bugün 15:30 teslim öncesi araç temizliği.', 'high', [0, '14:00'], { owner: 'u-ops1', branch: 'b-sjj', link: { type: 'vehicle', id: veh(7).id } })
  mkTask('Mostar şubesi: sınıf rezervasyonuna araç atayın', 'Bugün 18:00 teslim edilecek Ekonomi sınıfı rezervasyona belirli araç atanmalı.', 'high', [0, '16:00'], { owner: 'u-ops2', branch: 'b-mst' })
  const t4 = mkTask('Sağ arka kapı onarımı için servis teklifi alın', 'Hasar dosyası bağlı onarım için iki servisten teklif alın.', 'normal', [2, '17:00'], { recipients: ['u-fleet', 'u-mgr2'], branch: 'b-dbv', link: { type: 'damage', id: dm2.id } })
  void t4
  mkTask('Havalimanı otopark kartlarını yenileyin', 'Yıllık otopark erişim kartı yenileme.', 'normal', [5, '17:00'], { pool: true, branch: 'b-sjj' })
  const pool = mkTask('Araç sigorta poliçelerini kontrol edin', 'Süresi yaklaşan poliçelerin listesini çıkarıp yenileme teklifi isteyin.', 'high', [3, '17:00'], { pool: true })
  as('u-fleet')
  claimTask(d, pool.id)
  as('u-mgr')
  mkTask('DBV: Corolla sigorta belgesi süresi doldu', 'Reservasyon +2 gün: poliçe yenilenmeden teslim yapılamaz.', 'urgent', [1, '12:00'], { owner: 'u-ops3', branch: 'b-dbv', link: { type: 'vehicle', id: veh(22).id } })
  mkTask('Sportage hasar engeli ve yarınki rezervasyon', 'Araç hasar engelinde; yarınki rezervasyon için alternatif araç bulun.', 'urgent', [0, '17:00'], { recipients: ['u-ops2', 'u-mgr'], branch: 'b-mst', link: { type: 'reservation', id: d.reservations.find((r) => r.vehicleId === veh(16).id && r.status === 'confirmed')?.id ?? d.reservations[0]!.id } })
  mkTask('Haftalık kasa sayımı', 'Tüm şubelerde nakit kasası sayımı.', 'normal', [6, '17:00'], { recipients: ['u-ops1', 'u-ops2', 'u-ops3'] })
  const done1 = mkTask('Müşteri sözleşme kopyalarını arşivleyin', 'Geçen haftanın kapanan kiralamaları.', 'normal', [-1, '17:00'], { owner: 'u-ops1', created: -4 })
  as('u-ops1')
  setNow(T(-1, '16:00'))
  setTaskStatus(d, done1.id, 'done')
  as('u-mgr')
  mkTask('Yeni sezon fiyat listesi toplantısı', 'Yaz sezonu tarifelerini gözden geçirin.', 'normal', [4, '11:00'], { owner: 'u-owner' })
  mkTask('Lastik değişimi planı (MST)', 'Vito için lastik değişimi yarın.', 'normal', [1, '09:00'], { owner: 'u-fleet', branch: 'b-mst', link: { type: 'maintenance', id: m1.id } })
  mkTask('Geçen haftaki şikayet takibi', 'Temizlik şikayeti müşterisini arayın.', 'normal', [-2, '17:00'], { owner: 'u-ops2', created: -5, branch: 'b-mst' })
  mkTask('Dubrovnik: transfer aracı yakıt kontrolü', 'Gelen araç yakıt seviyesini kayda geçirin.', 'normal', [2, '10:00'], { pool: true, branch: 'b-dbv' })

  // Transfer in transit (v10 SJJ -> MST)
  as('u-ops1')
  setNow(T(0, '08:00'))
  d.transfers.push({ id: nextId(d, 'tr'), no: nextNo(d, 'T'), vehicleId: veh(10).id, fromBranchId: 'b-sjj', toBranchId: 'b-mst', status: 'in_transit', plannedAt: T(0, '08:00'), departedAt: T(0, '08:10'), reason: 'MST şube talebi (yoğunluk)' })
  veh(10).location = 'transit'
  d.transfers.push({ id: nextId(d, 'tr'), no: nextNo(d, 'T'), vehicleId: veh(14).id, fromBranchId: 'b-mst', toBranchId: 'b-sjj', status: 'completed', plannedAt: T(-9, '09:00'), departedAt: T(-9, '09:10'), arrivedAt: T(-9, '12:40'), reason: 'Sezon dengeleme' })
  logEvent(d, { module: 'vehicles', type: 'TransferDeparted', sourceType: 'transfer', sourceId: d.transfers[0]!.id, summary: `${d.transfers[0]!.no} yolda`, at: T(0, '08:10') })
}

function seedCommercial(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle, C: (n: number) => Customer, rentals: Record<string, string>) {
  void veh
  as('u-mgr')
  setNow(T(-90, '10:00'))
  createPartner(d, { name: 'Grand Hotel Sarajevo (Demo)', kind: 'hotel', country: 'BA', contactName: 'Resepsiyon Müdürü', email: 'resepsiyon@grandhotel-demo.example', phone: '+387 33 000 801', pct: 8, trigger: 'delivered' })
  createPartner(d, { name: 'Adria Travel Agency (Demo)', kind: 'agency', country: 'HR', contactName: 'Operasyon', email: 'ops@adriatravel-demo.example', phone: '+385 20 000 802', pct: 10, trigger: 'returned' })
  createPartner(d, { name: 'Balkan Tours Online (Demo)', kind: 'travel', country: 'BA', contactName: 'Satış', email: 'sales@balkantours-demo.example', phone: '+387 36 000 803', pct: 12, trigger: 'closed' })
  createPartner(d, { name: 'Corporate Broker Hub (Demo)', kind: 'corporate_broker', country: 'BA', contactName: 'Hesap Yöneticisi', email: 'hub@corpbroker-demo.example', phone: '+387 33 000 804', pct: 6, trigger: 'delivered' })
  d.partners[0]!.portalAccess = true
  d.partners[1]!.portalAccess = true
  // Partner-sourced rentals (reservation channel partner): two earned commissions, one paid
  as('u-ops1')
  const pr1 = (c: number, v: number, off: number, partner: string) => {
    setNow(T(off - 5, '10:00'))
    const r = createReservation(d, { customerId: C(c).id, classId: veh(v).classId, vehicleId: veh(v).id, pickupBranchId: veh(v).homeBranchId, returnBranchId: veh(v).homeBranchId, pickupAt: T(off, '10:00'), returnAt: T(off + 3, '10:00'), currency: 'EUR', extras: [], insuranceId: 'in-cdw', channel: 'partner', partnerId: partner })
    as('u-mgr')
    confirmReservation(d, r.id)
    as('u-ops1')
    return r
  }
  void pr1
  void rentals

  // Leads (Talep Merkezi)
  as('u-ops1')
  const ld = (name: string, source: 'web_form' | 'phone' | 'partner' | 'walk_in' | 'referral', cls: string, from: number, to: number, br: string, owner: string, o: { partner?: string; notes?: string; created?: number } = {}) => {
    setNow(T(o.created ?? -3, '12:00'))
    return createLead(d, { source, partnerId: o.partner, name, phone: '+387 61 555 0' + String(10 + d.leads.length), email: `${name.split(' ')[0]!.toLowerCase()}@lead-demo.example`, classId: cls, from: T(from, '10:00'), to: T(to, '10:00'), branchId: br, ownerId: owner, notes: o.notes ?? '' })
  }
  const l1 = ld('Petar Lead-Demo', 'web_form', 'cl-suv', 10, 17, 'b-sjj', 'u-ops1', { notes: 'Aile tatili, 5 kişi' })
  const l2 = ld('Olivia Demo-Lead', 'partner', 'cl-prm', 12, 15, 'b-dbv', 'u-ops3', { partner: 'pt2', notes: 'Düğün konukları' })
  const l3 = ld('Marta Lead-Test', 'phone', 'cl-eco', 6, 9, 'b-mst', 'u-ops2')
  const l4 = ld('Stefan Prospekt', 'walk_in', 'cl-cmp', 4, 8, 'b-sjj', 'u-ops1', { created: -6 })
  const l5 = ld('Nadia Beispiel-Lead', 'referral', 'cl-van', 14, 21, 'b-sjj', 'u-mgr', { notes: 'Grup tur' })
  ld('Joao Lead-Demo', 'web_form', 'cl-eco', 9, 12, 'b-dbv', 'u-ops3')
  ld('Eda Örnek-Talep', 'web_form', 'cl-suv', 20, 27, 'b-sjj', 'u-ops1')
  ld('Viktor Lead-Test', 'phone', 'cl-cmp', 3, 5, 'b-mst', 'u-ops2', { created: -9 })
  ld('Sara Demo-Prospekt', 'partner', 'cl-eco', 15, 20, 'b-dbv', 'u-ops3', { partner: 'pt3' })
  ld('Luka Deneme-Lead', 'walk_in', 'cl-prm', 8, 10, 'b-sjj', 'u-ops1', { created: -2 })
  as('u-ops1')
  setNow(T(-2, '15:00'))
  d.leads[0]!.status = 'contacted'
  const q1 = createQuote(d, l1.id, { classId: 'cl-suv', from: T(10, '10:00'), to: T(17, '10:00'), insuranceId: 'in-cdw', extras: [{ extraId: 'ex-seat', qty: 2 }], currency: 'EUR', validUntil: T(5, '18:00'), note: 'İlk teklif' })
  void q1
  setNow(T(-1, '11:00'))
  const q2 = createQuote(d, l1.id, { classId: 'cl-suv', from: T(10, '10:00'), to: T(17, '10:00'), insuranceId: 'in-scdw', extras: [{ extraId: 'ex-seat', qty: 2 }], currency: 'EUR', validUntil: T(5, '18:00'), note: 'Tam koruma ile revize teklif (v2)' })
  void q2
  as('u-ops3')
  setNow(T(-2, '16:00'))
  createQuote(d, l2.id, { classId: 'cl-prm', from: T(12, '10:00'), to: T(15, '10:00'), insuranceId: 'in-scdw', extras: [], currency: 'EUR', validUntil: T(6, '18:00'), note: 'Partner talebi' })
  as('u-ops2')
  setNow(T(-1, '10:00'))
  createQuote(d, l3.id, { classId: 'cl-eco', from: T(6, '10:00'), to: T(9, '10:00'), insuranceId: undefined, extras: [], currency: 'BAM', validUntil: T(2, '18:00'), note: '' })
  setLeadStatus(d, l4.id, 'lost', 'Rakip daha ucuz teklif verdi')
  as('u-mgr')
  createQuote(d, l5.id, { classId: 'cl-van', from: T(14, '10:00'), to: T(21, '10:00'), insuranceId: 'in-cdw', extras: [], currency: 'EUR', validUntil: T(7, '18:00'), note: 'Grup indirimi için onay gerekebilir' })
  // earned commissions via direct records tied to real rentals (partner pt1 / pt2)
  const closed = d.rentals.filter((r) => r.status === 'closed')
  const c1 = closed[0]!
  const c2 = closed[1]!
  const c3 = closed[2]!
  setNow(T(-10, '10:00'))
  const mkc = (rid: string, pid: string, pct: number) => {
    const r = d.rentals.find((x) => x.id === rid)!
    const base = r.price?.netMinor ?? 0
    const amount = Math.round((base * pct) / 100)
    d.commissions.push({ id: nextId(d, 'cm'), partnerId: pid, rentalId: rid, base: { minor: base, cur: r.currency }, amount: { minor: amount, cur: r.currency }, status: 'earned', earnedAt: T(-10, '10:00') })
    const res = d.reservations.find((x) => x.rentalId === rid)
    if (res) res.partnerId = pid
  }
  mkc(c1.id, 'pt1', 8)
  mkc(c2.id, 'pt2', 10)
  mkc(c3.id, 'pt2', 10)
  as('u-acc')
  setNow(T(-4, '10:00'))
  payPartnerCommission(d, 'pt2', [d.commissions[1]!.id], 'EFT-DEMO-PT2-01')
}

function seedControl(d: Db, T: (o: number, hm?: string, z?: string) => string, as: (u: string) => void, setNow: (i: string) => void, veh: (n: number) => Vehicle, C: (n: number) => Customer, rentals: Record<string, string>) {
  void C
  // Payment plan for a corporate rental (planned instalments are not collected money)
  d.paymentPlans.push({ id: nextId(d, 'pl'), rentalId: rentals.rd5!, dueAt: T(10, '12:00'), amount: { minor: 150000, cur: 'EUR' }, payerName: 'Neretva Logistics d.o.o.', method: 'transfer', status: 'planned', paymentIds: [] })
  d.paymentPlans.push({ id: nextId(d, 'pl'), rentalId: rentals.rd5!, dueAt: T(-1, '12:00'), amount: { minor: 50000, cur: 'EUR' }, payerName: 'Neretva Logistics d.o.o.', method: 'transfer', status: 'overdue', paymentIds: [] })

  // Approvals in several states
  as('u-ops1')
  setNow(T(-1, '14:00'))
  const a1 = requestApproval(d, { type: 'high_discount', target: { type: 'rental', id: rentals.rp1! }, reason: 'Sadık müşteri, geçen yıl 6 kiralama: %18 indirim talep ediliyor.', requested: null, proposedPct: 18 })
  void a1
  as('u-ops2')
  setNow(T(-1, '16:00'))
  requestApproval(d, { type: 'deposit_exception', target: { type: 'rental', id: rentals.rp2! }, reason: 'Kurumsal bağlantılı müşteri; depozito yarıya indirilsin.', requested: { minor: 15000, cur: 'EUR' } })
  as('u-ops3')
  setNow(T(-2, '12:00'))
  const a3 = requestApproval(d, { type: 'financial_correction', target: { type: 'payment', id: d.payments.find((p) => p.rentalId === rentals.rd4 && p.status === 'applied')?.id ?? d.payments[0]!.id }, reason: 'Ödeme yanlış kiralamaya girilmiş; ters kayıt istiyorum.', requested: null })
  as('u-mgr2')
  setNow(T(-2, '15:00'))
  decideApproval(d, a3.id, 'approve', 'Evrak kontrol edildi.')
  as('u-ops1')
  setNow(T(-3, '10:00'))
  const a4 = requestApproval(d, { type: 'corporate_credit_override', target: { type: 'corporate', id: 'co3' }, reason: 'Una Tours kredi limiti dolmak üzere; etkinlik kiralaması için ek pay.', requested: { minor: 100000, cur: 'EUR' } })
  as('u-mgr')
  setNow(T(-3, '14:00'))
  decideApproval(d, a4.id, 'approve', 'Yıllık anlaşma yenileme sürecinde.')
  as('u-owner')
  setNow(T(-3, '15:00'))
  applyApproval(d, a4.id)
  as('u-ops1')
  setNow(T(-6, '10:00'))
  const a5 = requestApproval(d, { type: 'partner_commission_adjustment', target: { type: 'partner', id: d.commissions[0]!.id }, reason: 'Sözleşmedeki özel kampanya oranı uygulanmamış; düzeltme.', requested: { minor: Math.round(d.commissions[0]!.amount.minor * 1.25), cur: d.commissions[0]!.amount.cur } })
  as('u-mgr')
  setNow(T(-5, '10:00'))
  decideApproval(d, a5.id, 'reject', 'Kampanya bu sözleşme dönemine uygulanmıyor.')
  as('u-ops2')
  setNow(T(-8, '10:00'))
  const a6 = requestApproval(d, { type: 'high_discount', target: { type: 'reservation', id: d.reservations.find((r) => r.status === 'pending')!.id }, reason: 'Uzun süreli rezervasyon için %20 indirim talebi.', requested: null, proposedPct: 20 })
  void a6
  // Applied history example: an approved and applied deposit exception is not repeatable
  // Rules
  as('u-owner')
  setNow(T(-30, '10:00'))
  saveRule(d, { name: 'İade 12 saatten fazla gecikti', conditions: [{ field: 'rental.overdueHours', op: '>=', value: 12 }], join: 'AND', action: 'alert', severity: 'critical', message: 'Kiralama iadesi 12 saatten fazla gecikti: müşteriyle iletişime geçin.', status: 'active' })
  saveRule(d, { name: 'Rezervasyon 24 saattir onaysız', conditions: [{ field: 'reservation.pendingHours', op: '>=', value: 24 }], join: 'AND', action: 'review_flag', severity: 'warning', message: 'Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin.', status: 'active' })
  saveRule(d, { name: 'Periyodik bakım 500 km aşıldı', conditions: [{ field: 'vehicle.serviceKmOver', op: '>=', value: 500 }], join: 'AND', action: 'alert', severity: 'warning', message: 'Aracın periyodik bakımı gecikti.', status: 'active' })
  saveRule(d, { name: 'Araç belgesi 15 günden az', conditions: [{ field: 'vehicle.docDaysLeft', op: '<=', value: 15 }], join: 'AND', action: 'review_flag', severity: 'warning', message: 'Araç belgesinin süresi dolmak üzere.', status: 'active' })
  saveRule(d, { name: 'Büyük açık bakiye (taslak)', conditions: [{ field: 'rental.outstandingMinor', op: '>=', value: 100000 }], join: 'AND', action: 'alert', severity: 'info', message: 'Yüksek açık bakiye.', status: 'draft' })
  const archived = saveRule(d, { name: 'Eski kasa farkı kuralı', conditions: [{ field: 'cash.varianceMinor', op: '>=', value: 500 }], join: 'AND', action: 'alert', severity: 'info', message: 'Kasa farkı.', status: 'archived' })
  void archived
  // Exceptions
  as('u-mgr')
  setNow(T(-1, '17:00'))
  createException(d, { type: 'rental', id: rentals.rx1! }, 'Servis sonrası iadesiz kapanan kiralama: depozito çözümü incelensin', 'high')
  createException(d, { type: 'damage', id: d.damages[0]!.id }, 'Hasar engeli altındaki araç için yarınki rezervasyon alternatifi', 'medium')
  createException(d, { type: 'vehicle', id: veh(22).id }, 'Süresi dolmuş sigorta ile planlı kiralama', 'high')
  setNow(T(-4, '17:00'))
  createException(d, { type: 'rental', id: rentals.p14! }, 'Eski gecikme istisnası (örnek)', 'low')
  d.exceptions[3]!.status = 'accepted'
  d.exceptions[3]!.decision = 'Müşteri iletişimi tamamlandı; ek işlem yok.'
  d.exceptions[3]!.reviewerId = 'u-mgr'
  // Expenses (manual, independent operational costs)
  as('u-acc')
  const ex = (off: number, cat: string, vendor: string, br: string, minor: number, cur: Cur, note: string, post = true) => {
    setNow(T(off, '12:00'))
    createExpense(d, { category: cat, vendor, branchId: br, date: T(off, '12:00').slice(0, 10), amount: { minor, cur }, note, post })
  }
  ex(-1, 'Yakıt', 'Petrol Demo d.o.o.', 'b-sjj', 8400, 'BAM', 'Şube araçları yakıt (örnek)')
  ex(-3, 'Temizlik', 'Express Oto Yıkama', 'b-sjj', 4500, 'EUR', 'Haftalık yıkama paketi')
  ex(-5, 'Yol yardım / çekici', 'Adria Çekici', 'b-mst', 12000, 'BAM', 'Müşteri aracı çekimi')
  ex(-8, 'Kira ve işletme', 'Havalimanı İşletme (Demo)', 'b-sjj', 85000, 'EUR', 'Aylık ofis ve otopark kirası')
  ex(-9, 'Sigorta primi', 'Demo Sigorta A.Ş.', 'b-dbv', 64000, 'EUR', 'Filo poliçesi taksiti')
  ex(-12, 'Diğer', 'Kırtasiye Demo', 'b-mst', 3200, 'BAM', '')
  ex(-2, 'Yakıt', 'Petrol Demo d.o.o.', 'b-dbv', 6200, 'EUR', '', false)
  ex(-4, 'Temizlik', 'Express Oto Yıkama', 'b-dbv', 3800, 'EUR', 'Taslak: fatura bekleniyor', false)
  // Extra shift events and notifications
  d.shifts.push({ id: nextId(d, 'sh'), branchId: 'b-sjj', userId: 'u-ops1', openedAt: T(0, '08:00') })
  d.shifts.push({ id: nextId(d, 'sh'), branchId: 'b-sjj', userId: 'u-old', openedAt: T(-1, '08:00'), closedAt: T(-1, '18:00'), handoverToId: 'u-ops1', handoverNote: 'Kasa sayıldı; USD kasasında 20 USD bozuk para notu.' })
  setNow(T(0, '10:00'))
  manualCashMove(d, 'dr-sjj-EUR', 'in', 5000, 'Yedek para girişi (örnek)')
}
