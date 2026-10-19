import { checkVehicleAvailable } from './calc/availability'
import { isRateActive } from './calc/fx'
import { fail, nowOf } from './helpers'
import { endFxRate } from './ops/control'
import { holdDeposit } from './ops/finance'
import { createRental, deliverRental, find, signContract, updateGate } from './ops/rentals'
import {L, B } from '../i18n'
import type { Db, PriceSnapshot, Rental } from './types'

// Guided demo scenarios (spec §81). Preparing a scenario only creates synthetic demo records in the demo state.

export interface Scenario {
  id: string
  title: () => string
  summary: () => string
  steps: () => string[]
  /** Returns the path to open. Runs on a copy of the demo state. */
  prepare: (d: Db) => { path: string; note?: string }
}

/** The §64.2 rental: delivered, exactly 500 EUR owed, no payments yet, no USD rate. */
export function prepareSplitPaymentRental(d: Db): Rental {
  const as = d.session.userId
  d.session.userId = 'u-owner'
  // Start from the written precondition: there is no USD business rate yet.
  for (const r of d.fxRates) if ((r.base === 'USD' || r.quote === 'USD') && r.purpose === 'tender' && isRateActive(r, nowOf(d))) endFxRate(d, r.id)
  const now = nowOf(d)
  // A demo fleet is busy: look for a free SJJ vehicle for 3, then 2, then 1 day starting now (a rental may be shorter, the money is the point).
  let days = 3
  let to = ''
  let veh: (typeof d.vehicles)[number] | undefined
  for (days = 3; days >= 1 && !veh; days--) {
    to = new Date(Date.parse(now) + days * 86_400_000).toISOString()
    const free = (v: (typeof d.vehicles)[number]) => v.homeBranchId === 'b-sjj' && v.source === 'internal' && v.status === 'active' && checkVehicleAvailable(d, v, now, to, now).ok
    veh = d.vehicles.find((v) => free(v) && v.classId === 'cl-cmp') ?? d.vehicles.find(free)
  }
  days += 1
  if (!veh) fail(B('Senaryo için SJJ şubesinde uygun araç bulunamadı.', 'No suitable vehicle was found at branch SJJ for the scenario.'))
  const v = veh!
  v.readiness = { clean: true, fuelOk: true, checkedAt: now, checkedBy: 'u-ops1', note: '' }
  v.fuel = 'full'
  const customer = d.customers.find((c) => c.name === 'Ajla Testović')!
  const rule = d.taxRules.find((t) => t.id === d.settings.defaultTaxId)!
  const gross = 50000
  const tax = rule.mode === 'inclusive' ? Math.round((gross * rule.ratePct) / (100 + rule.ratePct)) : Math.round((gross * rule.ratePct) / 100)
  const price: PriceSnapshot = {
    id: `ps-scn-${Date.now()}`,
    cur: 'EUR',
    days,
    lines: [{ kind: 'other', label: B('Kiralama bedeli (demo senaryosu: 500 EUR)', 'Rental charge (demo scenario: 500 EUR)'), qty: 1, unitMinor: rule.mode === 'inclusive' ? gross : gross - tax, totalMinor: rule.mode === 'inclusive' ? gross : gross - tax }],
    netMinor: gross - tax,
    taxLines: [{ ruleId: rule.id, name: rule.name, ratePct: rule.ratePct, mode: rule.mode, baseMinor: gross - tax, taxMinor: tax }],
    taxMinor: tax,
    grossMinor: gross,
    revisionId: d.priceRevisions[d.priceRevisions.length - 1]!.id,
    computedAt: now,
    blockers: [],
  }
  d.session.userId = 'u-ops1'
  const rental = createRental(d, { customerId: customer.id, drivers: [customer.id], vehicleId: v.id, classId: v.classId, pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', plannedPickupAt: now, plannedReturnAt: to, currency: 'EUR', extras: [], notes: B('Demo senaryosu: çoklu tahsilat (500 EUR)', 'Demo scenario: split payment (500 EUR)'), price })
  signContract(d, rental.id, customer.name, true)
  updateGate(d, rental.id, { docsChecked: true, driverOk: true })
  if (rental.deposit.required.minor > 0) holdDeposit(d, rental.id, 'card', 'Demo senaryosu')
  deliverRental(d, rental.id, { km: v.odometerKm, fuel: 'full', photos: 5, pins: [], note: '' })
  d.session.userId = as
  return find.rental(d, rental.id)!
}

export const SCENARIOS: Scenario[] = [
  {
    id: 's1',
    title: () => L('1 · Günlük operasyon', '1 · Daily operations'),
    summary: () => L('Ana Ekran → geciken iade → Kiralama 360° → Komuta Merkezi.', 'Home → overdue return → Rental 360° → Command Center.'),
    steps: () => [L('Ana Ekran\'da Geciken kartına tıklayın.', 'Click the Overdue card on Home.'), L('Kiralama 360°\'da gecikmeyi ve müşteriyi inceleyin.', 'Inspect the delay and the customer in Rental 360°.'), L('Komuta Merkezi\'nde aynı uyarıyı takip edin.', 'Follow the same alert in the Command Center.')],
    prepare: () => ({ path: '/' }),
  },
  {
    id: 's2',
    title: () => L('2 · Rezervasyondan teslime', '2 · Reservation to handover'),
    summary: () => L('Yeni rezervasyon → uygunluk ve fiyat → onay → kiralamaya dönüşüm → Teslim Masası.', 'New reservation → availability and price → confirm → convert → Delivery Desk.'),
    steps: () => [L('Yeni rezervasyon formunu açın, müşteri ve tarih seçin.', 'Open the new reservation form, choose a customer and dates.'), L('Araç uygunluğunu ve fiyat ön izlemesini görün.', 'See availability and the price preview.'), L('Onaylayın, kiralamaya dönüştürün, Teslim Masası\'nda teslimi tamamlayın.', 'Confirm, convert, and complete handover at the Delivery Desk.')],
    prepare: () => ({ path: '/rezervasyonlar/yeni' }),
  },
  {
    id: 's3',
    title: () => L('3 · Görev ve personel', '3 · Tasks and staff'),
    summary: () => L('Yönetici görev atar, Operasyon kullanıcısı üstlenir ve tamamlar.', 'The manager assigns a task; an Operations user claims and completes it.'),
    steps: () => [L('Yönetici olarak yeni görev oluşturun.', 'As the manager, create a task.'), L('Üstteki rol menüsünden Operasyon kullanıcısına geçin.', 'Switch to an Operations user in the role menu.'), L('Görevi tamamlayın: bağlı kayıt değişmez.', 'Complete it: the linked record does not change.')],
    prepare: (d) => {
      d.session.userId = 'u-mgr'
      return { path: '/gorevler' }
    },
  },
  {
    id: 's4',
    title: () => L('4 · Filo analizi', '4 · Fleet analysis'),
    summary: () => L('Dönem ve şube filtresi → kullanım → araç 360° → geri dönünce filtre korunur.', 'Period and branch filter → utilisation → Vehicle 360° → filters kept on return.'),
    steps: () => [L('Dönemi ve şubeyi seçin.', 'Pick the period and branch.'), L('Bir araca tıklayın.', 'Click a vehicle.'), L('Geri dönün: filtreler URL\'de korunur.', 'Go back: filters are kept in the URL.')],
    prepare: (d) => {
      d.session.userId = 'u-owner'
      return { path: '/filo-analizi' }
    },
  },
  {
    id: 's5',
    title: () => L('5 · Çoklu tahsilat (500 EUR)', '5 · Split payment (500 EUR)'),
    summary: () => L('3 kişi, 4 ödeme, 3 para birimi: kur olmadan USD uygulanmaz, Ayarlar\'dan kur tanımlanınca uygulanır.', '3 payers, 4 payments, 3 currencies: USD cannot be applied without a rate until it is defined in Settings.'),
    steps: () => [
      L('Kişi A: 100 EUR nakit, ardından 200 BAM kart (= 100 EUR). Kalan 300 EUR.', 'Person A: 100 EUR cash, then 200 BAM by card (= 100 EUR). 300 EUR left.'),
      L('Kişi B: 100 USD nakit: USD kuru yok, "Kur Bekleniyor". Kalan 300 EUR.', 'Person B: 100 USD cash: no USD rate, "Awaiting Rate". 300 EUR left.'),
      L('Ayarlar → Döviz Kurları: 1 EUR = 1,25 USD tanımlayın ve "ters yönde otomatik kullanılabilir" kutusunu işaretleyin (USD tahsilatı EUR borca ters yönden uygulanır). 100 USD = 80 EUR; kalan 220 EUR.', 'Settings → Exchange Rates: set 1 EUR = 1.25 USD and tick "may be used automatically in reverse" (a USD payment is applied to a EUR debt in the reverse direction). 100 USD = 80 EUR; 220 EUR left.'),
      L('Kişi C: 220 EUR banka havalesi. Kalan 0. Nakit yalnız EUR ve USD kasalarına girer.', 'Person C: 220 EUR bank transfer. 0 left. Cash enters only the EUR and USD drawers.'),
    ],
    prepare: (d) => {
      const r = prepareSplitPaymentRental(d)
      d.session.userId = 'u-owner'
      return { path: `/kiralamalar/${r.id}?sekme=finans`, note: B(`${r.no}: 500 EUR bakiye, USD kuru yok.`, `${r.no}: 500 EUR balance, no USD rate.`) }
    },
  },
  {
    id: 's6',
    title: () => L('6 · Bakım ve araç uygunluğu', '6 · Maintenance and availability'),
    summary: () => L('Aracı bakıma ayırın, çakışan rezervasyon onayını deneyin, bakım sonrası hazırlığı ayrıca kontrol edin.', 'Book a vehicle for service, try a conflicting confirmation, then check readiness separately.'),
    steps: () => [L('Araç 360° → Müsaitlik: bir aracın zaman çizelgesini görün.', 'Vehicle 360° → Availability: see a vehicle timeline.'), L('Bakım & Servis\'te çakışan aralık planlayın: neden gösterilir.', 'Plan an overlapping window in Maintenance: the reason is shown.'), L('Bakımı tamamlayın: araç hazır sayılmaz.', 'Complete the service: the vehicle is not Ready.')],
    prepare: (d) => {
      d.session.userId = 'u-fleet'
      const v = d.vehicles.find((x) => x.plate === 'S11-K-103')!
      return { path: `/araclar/${v.id}?sekme=musaitlik` }
    },
  },
  {
    id: 's7',
    title: () => L('7 · Müşteriden ticari talebe', '7 · Customer to lead and quote'),
    summary: () => L('Talep → versiyonlu teklif → kabul → rezervasyon; bağlantılar korunur.', 'Lead → versioned quote → accepted → reservation; links are kept.'),
    steps: () => [L('Talep Merkezi\'nde bir talep açın.', 'Open a lead in the Lead Center.'), L('Teklif hazırlayın, revize edin: eski sürüm korunur.', 'Prepare and revise a quote: the old version is kept.'), L('Teklifi kabul edin: rezervasyon oluşur.', 'Accept the quote: a reservation is created.')],
    prepare: () => ({ path: '/talep-merkezi' }),
  },
  {
    id: 's8',
    title: () => L('8 · Şube kasası', '8 · Branch cash register'),
    summary: () => L('Mostar EUR kasasını açın, hareket girin, sayın, farkı görün, devredin.', 'Open the Mostar EUR drawer, add movements, count, see the difference, hand over.'),
    steps: () => [L('Mostar EUR kasasında oturum açın (açılış bakiyesi girin).', 'Open a session on the Mostar EUR drawer (enter the opening balance).'), L('Bir nakit giriş/çıkış kaydedin; beklenen bakiye hesaplanır.', 'Record a cash in/out; the expected balance updates.'), L('Sayılan bakiyeyi girip kapatın; fark ve devir kaydı görünür.', 'Enter the counted balance and close; the difference and handover are recorded.')],
    prepare: (d) => {
      d.session.userId = 'u-mgr'
      return { path: '/sube-kasalari?sube=b-mst' }
    },
  },
]
