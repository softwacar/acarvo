import { B } from '../i18n'
import { DEMO_ROLES } from './permissions'
/** Version of the saved demo state. Bump it whenever the seed or the data model changes: an older saved state is then replaced by a fresh seed. */
export const DB_SCHEMA = 5

import type { BaseRate, Branch, ContractTemplate, CorporateAgreement, Db, DemoUser, Extra, FxRate, InsurancePackage, Season, Settings, TaxRule, Tenant, VehicleClass } from './types'

// Static catalogues of the fictional company "Adriatic Demo Rent". Everything here is synthetic: names, tax numbers,
// phones and e-mail addresses do not belong to real people or companies. Rates, tax percentages and clause texts are
// demonstration values, not legal, tax or market advice.

export const CLASSES: VehicleClass[] = [
  { id: 'cl-eco', code: 'ECO', name: B('Ekonomi', 'Economy'), seats: 5, doors: 5, gearbox: 'manual' },
  { id: 'cl-cmp', code: 'CMP', name: B('Kompakt', 'Compact'), seats: 5, doors: 5, gearbox: 'manual' },
  { id: 'cl-suv', code: 'SUV', name: 'SUV', seats: 5, doors: 5, gearbox: 'auto' },
  { id: 'cl-prm', code: 'PRM', name: 'Premium', seats: 5, doors: 4, gearbox: 'auto' },
  { id: 'cl-van', code: 'VAN', name: B('Minibüs', 'Minibus'), seats: 9, doors: 5, gearbox: 'manual' },
]

export const BRANCHES: Branch[] = [
  { id: 'b-sjj', code: 'SJJ', name: B('Sarajevo Havalimanı', 'Sarajevo Airport'), city: 'Sarajevo', country: 'BA', tz: 'Europe/Sarajevo', currency: 'BAM', active: true, address: B('Kurta Schorka 36, Sarajevo (kurgusal adres)', 'Kurta Schorka 36, Sarajevo (fictional address)'), phone: '+387 33 000 101', classCapacity: { 'cl-eco': 8, 'cl-cmp': 6, 'cl-suv': 5, 'cl-prm': 3, 'cl-van': 2 } },
  { id: 'b-mst', code: 'MST', name: B('Mostar Merkez', 'Mostar Centre'), city: 'Mostar', country: 'BA', tz: 'Europe/Sarajevo', currency: 'BAM', active: true, address: B('Spanski trg 5, Mostar (kurgusal adres)', 'Spanski trg 5, Mostar (fictional address)'), phone: '+387 36 000 202', classCapacity: { 'cl-eco': 5, 'cl-cmp': 4, 'cl-suv': 4, 'cl-prm': 2, 'cl-van': 2 } },
  { id: 'b-dbv', code: 'DBV', name: B('Dubrovnik Havalimanı', 'Dubrovnik Airport'), city: 'Dubrovnik', country: 'HR', tz: 'Europe/Zagreb', currency: 'EUR', active: true, address: B('Zračna luka bb, Čilipi (kurgusal adres)', 'Zračna luka bb, Čilipi (fictional address)'), phone: '+385 20 000 303', classCapacity: { 'cl-eco': 5, 'cl-cmp': 4, 'cl-suv': 4, 'cl-prm': 3, 'cl-van': 2 } },
]

export const USERS: DemoUser[] = [
  { id: 'u-owner', name: 'Adnan Kovač', email: 'adnan.kovac@adriatic-demo.example', roleId: 'role-owner', branchIds: [], status: 'active', title: B('Şirket sahibi', 'Company owner'), grant: [], deny: [] },
  { id: 'u-mgr', name: 'Selma Karić', email: 'selma.karic@adriatic-demo.example', roleId: 'role-manager', branchIds: [], status: 'active', title: B('Operasyon müdürü', 'Operations manager'), grant: [], deny: [] },
  { id: 'u-mgr2', name: 'Dario Babić', email: 'dario.babic@adriatic-demo.example', roleId: 'role-manager', branchIds: ['b-dbv', 'b-mst'], status: 'active', title: B('Bölge yöneticisi', 'Regional manager'), grant: [], deny: [] },
  { id: 'u-acc', name: 'Emina Hadžić', email: 'emina.hadzic@adriatic-demo.example', roleId: 'role-accountant', branchIds: [], status: 'active', title: B('Muhasebe', 'Accounting'), grant: [], deny: [] },
  { id: 'u-ops1', name: 'Haris Mehić', email: 'haris.mehic@adriatic-demo.example', roleId: 'role-ops', branchIds: ['b-sjj'], status: 'active', title: B('Resepsiyon · SJJ', 'Front desk · SJJ'), grant: [], deny: [] },
  { id: 'u-ops2', name: 'Lejla Šehović', email: 'lejla.sehovic@adriatic-demo.example', roleId: 'role-ops', branchIds: ['b-mst'], status: 'active', title: B('Resepsiyon · MST', 'Front desk · MST'), grant: [], deny: [] },
  { id: 'u-ops3', name: 'Ivo Matić', email: 'ivo.matic@adriatic-demo.example', roleId: 'role-ops', branchIds: ['b-dbv'], status: 'active', title: B('Resepsiyon · DBV', 'Front desk · DBV'), grant: [], deny: [] },
  { id: 'u-fleet', name: 'Kenan Pašić', email: 'kenan.pasic@adriatic-demo.example', roleId: 'role-fleet', branchIds: ['b-sjj', 'b-mst'], status: 'active', title: B('Filo sorumlusu', 'Fleet officer'), grant: [], deny: [] },
  { id: 'u-old', name: B('Eski Personel (Demo)', 'Former Employee (Demo)'), email: 'eski.personel@adriatic-demo.example', roleId: 'role-ops', branchIds: ['b-sjj'], status: 'inactive', title: B('Ayrıldı', 'Left'), grant: [], deny: [] },
  { id: 'u-new', name: B('Yeni Davetli (Demo)', 'New Invitee (Demo)'), email: 'yeni.davetli@adriatic-demo.example', roleId: 'role-ops', branchIds: ['b-mst'], status: 'invited', title: B('Davet bekliyor', 'Awaiting invitation'), grant: [], deny: [] },
]

const CUR = ['EUR', 'BAM', 'USD'] as const
const rate = (classId: string, eur: number, bam: number, usd: number): BaseRate[] => [
  { id: `br-${classId}-EUR`, classId, cur: 'EUR', dailyMinor: eur },
  { id: `br-${classId}-BAM`, classId, cur: 'BAM', dailyMinor: bam },
  { id: `br-${classId}-USD`, classId, cur: 'USD', dailyMinor: usd },
]
// Every currency has its own explicit price row; the BAM and USD rows are not conversions of the EUR rows.
export const BASE_RATES: BaseRate[] = [...rate('cl-eco', 3500, 6900, 3800), ...rate('cl-cmp', 4500, 8900, 4900), ...rate('cl-suv', 6500, 12900, 7100), ...rate('cl-prm', 9500, 18900, 10400), ...rate('cl-van', 7500, 14900, 8200)]

export function seasons(year: number): Season[] {
  return [
    { id: `se-${year}-spring`, name: `Bahar tatili ${year}`, from: `${year}-04-01`, to: `${year}-04-15`, uplift: 10, active: true },
    { id: `se-${year}-summer`, name: `Yaz sezonu ${year}`, from: `${year}-06-01`, to: `${year}-09-15`, uplift: 25, active: true },
    { id: `se-${year}-newyear`, name: B(`Yılbaşı ${year}/${year + 1}`, `New Year ${year}/${year + 1}`), from: `${year}-12-20`, to: `${year + 1}-01-05`, uplift: 30, active: true },
  ]
}

export const AGREEMENTS: CorporateAgreement[] = [
  { id: 'ag-gold', name: B('Kurumsal Altın', 'Corporate Gold'), discountPct: 10, classOverrides: [{ classId: 'cl-suv', cur: 'EUR', dailyMinor: 5800 }, { classId: 'cl-suv', cur: 'BAM', dailyMinor: 11500 }], validFrom: '2020-01-01', validTo: '2099-12-31', active: true },
  { id: 'ag-silver', name: B('Kurumsal Gümüş', 'Corporate Silver'), discountPct: 5, classOverrides: [], validFrom: '2020-01-01', validTo: '2099-12-31', active: true },
]

export const EXTRAS: Extra[] = [
  { id: 'ex-gps', name: B('GPS navigasyon', 'GPS navigation'), kind: 'per_day', prices: { EUR: 500, BAM: 1000, USD: 550 }, active: true },
  { id: 'ex-seat', name: B('Çocuk koltuğu', 'Child seat'), kind: 'per_day', prices: { EUR: 300, BAM: 600, USD: 330 }, active: true },
  { id: 'ex-winter', name: B('Kış lastiği / zincir takımı', 'Winter tyres / chains set'), kind: 'per_rental', prices: { EUR: 2000, BAM: 4000, USD: 2200 }, active: true },
  { id: 'ex-wifi', name: B('Mobil Wi-Fi modem', 'Mobile Wi-Fi hotspot'), kind: 'per_day', prices: { EUR: 400, BAM: 800, USD: 440 }, active: true },
]

export const INSURANCE: InsurancePackage[] = [
  { id: 'in-cdw', name: B('CDW Temel Koruma', 'CDW Basic Cover'), code: 'CDW', coverage: B('Araç hasarı (muafiyet hariç). Cam, lastik ve alt takım hariçtir.', 'Vehicle damage (excess excluded). Glass, tyres and undercarriage are excluded.'), deductible: { EUR: 80000, BAM: 160000, USD: 88000 }, dailyPrice: { EUR: 700, BAM: 1400, USD: 770 }, depositEffect: { EUR: 0, BAM: 0, USD: 0 }, active: true },
  { id: 'in-scdw', name: B('SCDW Tam Koruma', 'SCDW Full Cover'), code: 'SCDW', coverage: B('Araç hasarı, cam ve lastik; muafiyet düşük. Depozito indirimi uygulanır.', 'Vehicle damage, glass and tyres; low excess. A deposit reduction applies.'), deductible: { EUR: 15000, BAM: 30000, USD: 16500 }, dailyPrice: { EUR: 1200, BAM: 2400, USD: 1320 }, depositEffect: { EUR: -10000, BAM: -20000, USD: -11000 }, active: true },
]

export const TAX_RULES: TaxRule[] = [
  { id: 'tx-ba', name: B('Örnek KDV %17', 'Sample VAT 17%'), ratePct: 17, mode: 'inclusive', country: 'BA', active: true, note: B('Demo oranı: gerçek vergi uyumu için profesyonel doğrulama gerekir.', 'Demo rate: professional validation is needed for real tax compliance.') },
  { id: 'tx-hr', name: B('Örnek KDV %25', 'Sample VAT 25%'), ratePct: 25, mode: 'exclusive', country: 'HR', active: true, note: B('Demo oranı: gerçek vergi uyumu için profesyonel doğrulama gerekir.', 'Demo rate: professional validation is needed for real tax compliance.') },
]

const clauses = (tr: boolean) =>
  tr
    ? [
        { id: 'c1', title: '1. Taraflar ve araç', body: 'Bu belge, kiracı ile kiralayan şirket arasındaki araç kiralama koşullarının demo (örnek) özetidir. Hukuki metin değildir.' },
        { id: 'c2', title: '2. Kullanım ve sürücüler', body: 'Araç yalnız sözleşmede adı geçen sürücüler tarafından kullanılabilir. Ek sürücü ücreti sözleşme fiyatına yansıtılır.' },
        { id: 'c3', title: '3. Sigorta ve muafiyet', body: 'Seçilen sigorta paketinin kapsamı ve muafiyeti kiralama anındaki sürüme göre sabitlenir.' },
        { id: 'c4', title: '4. Depozito', body: 'Depozito gelir değildir; iade koşulları teslim ve iade kayıtlarına göre değerlendirilir.' },
        { id: 'c5', title: '5. Teslim ve iade', body: 'Araç teslim edildiği yakıt ve durumla iade edilir. Farklar demo ücret politikasına göre hesaplanır.' },
      ]
    : [
        { id: 'c1', title: '1. Parties and vehicle', body: 'This document is a demo (sample) summary of the rental terms between the renter and the rental company. It is not legal text.' },
        { id: 'c2', title: '2. Use and drivers', body: 'The vehicle may be driven only by the drivers named in the agreement. Additional driver fees are reflected in the price.' },
        { id: 'c3', title: '3. Insurance and excess', body: 'The cover and excess of the chosen insurance package are frozen as of the time of rental.' },
        { id: 'c4', title: '4. Deposit', body: 'A deposit is not income; its return depends on the handover and return records.' },
        { id: 'c5', title: '5. Handover and return', body: 'The vehicle is returned with the fuel and condition it was handed over in. Differences follow the demo fee policy.' },
      ]

export const TEMPLATES: ContractTemplate[] = [
  { id: 'tp-tr', name: 'Kiralama Sözleşmesi (örnek şablon)', lang: 'tr', version: 2, clauses: clauses(true), active: true, seriesPrefix: 'SZ' },
  { id: 'tp-en', name: 'Rental Agreement (sample template)', lang: 'en', version: 1, clauses: clauses(false), active: true, seriesPrefix: 'RA' },
  { id: 'tp-bs', name: 'Ugovor o najmu (primjer predloška)', lang: 'bs', version: 1, clauses: clauses(true), active: true, seriesPrefix: 'UN' },
]

export function defaultSettings(): Settings {
  const byClass: Record<string, Record<string, number>> = {
    'cl-eco': { EUR: 15000, BAM: 30000, USD: 16500 },
    'cl-cmp': { EUR: 20000, BAM: 40000, USD: 22000 },
    'cl-suv': { EUR: 30000, BAM: 60000, USD: 33000 },
    'cl-prm': { EUR: 50000, BAM: 100000, USD: 55000 },
    'cl-van': { EUR: 30000, BAM: 60000, USD: 33000 },
  }
  return {
    company: { name: 'Adriatic Demo Rent', legalName: B('Adriatic Demo Rent d.o.o. (kurgusal şirket)', 'Adriatic Demo Rent d.o.o. (fictional company)'), country: 'BA', baseCurrency: 'EUR', taxId: 'DEMO-4200000000000', tz: 'Europe/Sarajevo', logoText: 'ADR', logoDataUrl: null, address: 'Zmaja od Bosne 12, Sarajevo (kurgusal adres)', email: 'info@adriatic-demo.example', phone: '+387 33 000 000' },
    locale: { lang: 'tr', firstDay: 1, dateOrder: 'dmy' },
    languages: ['tr', 'en', 'bs'],
    acceptedCurrencies: [...CUR],
    branchTender: { 'b-sjj': ['EUR', 'BAM', 'USD'], 'b-mst': ['EUR', 'BAM'], 'b-dbv': ['EUR', 'USD'] },
    duration: { dayMethod: 'calendar_day', graceMinutes: 59, minDays: 1, lateFeePerHourPct: 25, oneWayFee: { EUR: 2500, BAM: 5000, USD: 2700 }, fuelFeePerQuarter: { EUR: 1500, BAM: 3000, USD: 1650 }, kmPerDay: 300, kmOverageFee: { EUR: 25, BAM: 50, USD: 28 } },
    tiers: [
      { fromDays: 3, discountPct: 5 },
      { fromDays: 7, discountPct: 10 },
      { fromDays: 14, discountPct: 15 },
      { fromDays: 30, discountPct: 20 },
    ],
    defaultTaxId: 'tx-ba',
    driver: { minAge: 21, minLicenseYears: 1, youngDriverMaxAge: 24, youngDriverFee: { EUR: 1000, BAM: 2000, USD: 1100 }, additionalDriverDaily: { EUR: 500, BAM: 1000, USD: 550 }, maxAdditionalDrivers: 3 },
    deposit: { byClass, allowCardHold: true, allowedMethods: ['cash', 'card', 'transfer'] },
    payment: { allowOverpayment: false, advanceRequiredPct: 20, refundMethods: ['cash', 'transfer'] },
    cash: { requireCountOnClose: true, varianceReason: { EUR: 500, BAM: 1000, USD: 500 }, handoverRequired: true },
    docs: { requireForForeign: ['passport', 'driving_license'], requireForLocal: ['national_id', 'driving_license'], warnDays: 30 },
    contractLangs: ['tr', 'en', 'bs'],
    notify: [
      { id: 'overdue', label: B('Geciken iade uyarısı', 'Overdue return alert'), on: true },
      { id: 'pickup', label: B('Bugünkü teslim hatırlatması', 'Today\'s pickup reminder'), on: true },
      { id: 'docs', label: B('Belge süresi yaklaşıyor', 'Document expiry approaching'), on: true },
      { id: 'service', label: B('Periyodik bakım yaklaşıyor', 'Periodic service approaching'), on: true },
      { id: 'approval', label: B('Onay bekliyor', 'Awaiting approval'), on: true },
      { id: 'cash', label: B('Kasa farkı', 'Cash variance'), on: false },
    ],
    thresholds: { highDiscountPct: 15, refundAbove: { EUR: 10000, BAM: 20000, USD: 11000 }, depositExceptionAbove: { EUR: 10000, BAM: 20000, USD: 11000 }, corporateOverride: true },
    privacy: { retentionMonths: 60, maskIdentityRoles: ['role-ops', 'role-accountant'], auditRetentionMonths: 84 },
    alertThresholds: { overdueCriticalHours: 12, pickupLookaheadHours: 24, pickupCriticalHours: 4, serviceSoonKm: 1000 },
    // Company-defined cancellation policy: free until 48 h before pickup, a fixed fee (50 EUR) inside that window, 50 % of the total for a no-show. The fee is computed, never typed.
    cancellation: {
      freeHoursBefore: 48,
      lateFee: { kind: 'fixed', value: 0, fixed: { EUR: 5000, BAM: 10000, USD: 5500 } },
      noShowFee: { kind: 'percent_of_total', value: 50, fixed: { EUR: 10000, BAM: 20000, USD: 11000 } },
    },
    workspace: { profile: 'advanced', hidden: [], shown: [] },
    setup: { done: true, step: 8, draft: null },
  }
}

export function baseFxRates(): FxRate[] {
  // One business rate, defined and kept by the company itself (manual, never a market rate). No USD rate on purpose.
  return [
    { id: 'fx-eur-bam', base: 'EUR', quote: 'BAM', rate: 2, purpose: 'tender', scope: 'company', validFrom: '2024-01-01T00:00:00.000Z', validUntil: null, autoInverse: true, enteredBy: 'u-owner', enteredAt: '2024-01-01T09:00:00.000Z', note: B('İşletmenin elle belirlediği kur (örnek).', 'A rate set manually by the business (sample).') },
    { id: 'fx-eur-bam-refund', base: 'EUR', quote: 'BAM', rate: 2, purpose: 'refund', scope: 'company', validFrom: '2024-01-01T00:00:00.000Z', validUntil: null, autoInverse: true, enteredBy: 'u-owner', enteredAt: '2024-01-01T09:00:00.000Z', note: B('İade için aynı işletme kuru (örnek).', 'The same business rate for refunds (sample).') },
  ]
}

export const TENANTS: Tenant[] = [
  { id: 'tn-adriatic', name: 'Adriatic Demo Rent', country: 'BA', tz: 'Europe/Sarajevo', plan: 'professional', status: 'active', owner: 'Adnan Kovač', ownerEmail: 'adnan.kovac@adriatic-demo.example', branches: 3, users: 10, vehicles: 28, createdAt: '2025-03-04T09:00:00.000Z' },
  { id: 'tn-neretva', name: 'Neretva Rent (Demo)', country: 'BA', tz: 'Europe/Sarajevo', plan: 'starter', status: 'active', owner: 'Lejla Begić', ownerEmail: 'lejla.begic@neretva-demo.example', branches: 1, users: 3, vehicles: 4, createdAt: '2025-06-12T09:00:00.000Z' },
  { id: 'tn-sava', name: 'Sava Fleet (Demo)', country: 'RS', tz: 'Europe/Belgrade', plan: 'enterprise', status: 'active', owner: 'Marko Ilić', ownerEmail: 'marko.ilic@sava-demo.example', branches: 6, users: 34, vehicles: 112, createdAt: '2024-11-20T09:00:00.000Z' },
  { id: 'tn-adria-coast', name: 'Adria Coast Cars (Demo)', country: 'HR', tz: 'Europe/Zagreb', plan: 'professional', status: 'trial', owner: 'Petra Novak', ownerEmail: 'petra.novak@adria-coast-demo.example', branches: 2, users: 7, vehicles: 19, createdAt: '2026-09-28T09:00:00.000Z' },
  { id: 'tn-bosphorus', name: 'Boğaz Filo (Demo)', country: 'TR', tz: 'Europe/Istanbul', plan: 'professional', status: 'active', owner: 'Mehmet Demir', ownerEmail: 'mehmet.demir@bogaz-demo.example', branches: 4, users: 21, vehicles: 63, createdAt: '2025-01-15T09:00:00.000Z' },
  { id: 'tn-old', name: B('Eski Kiracı (Demo)', 'Former Tenant (Demo)'), country: 'BA', tz: 'Europe/Sarajevo', plan: 'starter', status: 'suspended', owner: B('Test Kullanıcı', 'Test User'), ownerEmail: 'test.kullanici@eski-demo.example', branches: 1, users: 1, vehicles: 2, createdAt: '2025-02-02T09:00:00.000Z' },
]

export const ROLES = DEMO_ROLES

export function emptyDb(anchor: string, nowIso: string): Db {
  return {
    meta: { schema: DB_SCHEMA, anchor, createdAt: nowIso, modified: false, rev: 0, presetVersion: 2 },
    clock: { now: nowIso },
    session: { userId: 'u-owner', branchId: 'all', lang: 'tr', context: 'company', partnerId: 'pt1', preview: false },
    counters: {},
    settings: defaultSettings(),
    branches: structuredClone(BRANCHES),
    users: structuredClone(USERS).map((u) => (u.status === 'invited' && !u.invite ? { ...u, invite: { createdAt: nowIso, expiresAt: new Date(Date.parse(nowIso) + 5 * 86_400_000).toISOString(), state: 'pending' as const, note: '' } } : u)),
    roles: structuredClone(ROLES),
    classes: structuredClone(CLASSES),
    vehicles: [],
    odometer: [],
    locations: [],
    customers: [],
    corporates: [],
    baseRates: structuredClone(BASE_RATES),
    seasons: [],
    agreements: structuredClone(AGREEMENTS),
    extras: structuredClone(EXTRAS),
    insurance: structuredClone(INSURANCE),
    taxRules: structuredClone(TAX_RULES),
    priceRevisions: [{ id: 'rev-0', at: '2025-03-04T09:00:00.000Z', by: 'u-owner', summary: B('İlk fiyat tarifesi (demo)', 'First price list (demo)') }],
    fxRates: baseFxRates(),
    reservations: [],
    waitlist: [],
    rentals: [],
    charges: [],
    payments: [],
    deposits: [],
    refunds: [],
    paymentPlans: [],
    drawers: [],
    cashSessions: [],
    cashMovements: [],
    expenses: [],
    tasks: [],
    providers: [
      { id: 'sp-1', name: 'Autoservis Hadžić', kind: 'workshop', city: 'Sarajevo' },
      { id: 'sp-2', name: 'Mostar Lastik Merkezi', kind: 'tire', city: 'Mostar' },
      { id: 'sp-3', name: 'Dubrovnik Auto Servis', kind: 'workshop', city: 'Dubrovnik' },
      { id: 'sp-4', name: B('Express Oto Yıkama', 'Express Car Wash'), kind: 'wash', city: 'Sarajevo' },
      { id: 'sp-5', name: B('Adria Çekici', 'Adria Towing'), kind: 'tow', city: 'Mostar' },
    ],
    maintenance: [],
    damages: [],
    incidents: [],
    fines: [],
    transfers: [],
    partners: [],
    commissions: [],
    partnerPayments: [],
    leads: [],
    quotes: [],
    suppliers: [],
    sourcing: [],
    externalVehicles: [],
    engagements: [],
    settlements: [],
    approvals: [],
    rules: [],
    exceptions: [],
    documents: [],
    templates: structuredClone(TEMPLATES),
    contracts: [],
    events: [],
    shifts: [],
    notifications: [],
    tenants: structuredClone(TENANTS),
  }
}

export const seasonsFor = seasons
