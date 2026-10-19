import { MagnifyingGlass } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { bucketNow, capacityCell, readinessOf } from '../../core/calc/availability'
import { customerDocChecks } from '../../core/calc/policy'
import { overdueReturns, utilisation } from '../../core/metrics'
import { addDaysYmd, dayOf, startOfDay } from '../../core/time'
import type { Db, Id, LinkType } from '../../core/types'
import { L } from '../../i18n'
import { DateF, SelectF, branchOptions, classOptions } from '../../ui/forms'
import { entityHref, useBranchScope, useDb, useUrlState } from '../../ui/hooks'
import { btnPrimary, DemoNote, Empty, Page, Panel } from '../../ui/kit'

// Fleet Assistant: a catalogue of ready-made questions answered by deterministic queries over the same records the other
// screens read. It is not an AI model and does not invent anything: every answer lists its source records.

interface Row {
  link: { type: LinkType; id: Id }
  primary: string
  secondary: string
}
interface Answer {
  summary: string
  rows: Row[]
  source: string
}
interface Query {
  id: string
  label: () => string
  words: string[]
  run: (d: Db, branches: Id[]) => Answer
}

const vOf = (d: Db, id: Id) => d.vehicles.find((v) => v.id === id)!
const inScope = (d: Db, branches: Id[]) => d.vehicles.filter((v) => v.status !== 'sold' && branches.includes(v.homeBranchId))

const QUERIES: Query[] = [
  {
    id: 'available',
    label: () => L('Şu an hangi araçlar müsait?', 'Which vehicles are available right now?'),
    words: ['müsait', 'musait', 'boş', 'bos', 'available', 'free'],
    run: (d, b) => {
      const list = inScope(d, b).filter((v) => bucketNow(d, v, d.clock.now) === 'available')
      return { summary: L(`${list.length} araç şu an müsait (kiralama, rezervasyon, bakım, hasar engeli veya transfer çakışması yok). Müsait olmak hazır olmak demek değildir.`, `${list.length} vehicle(s) are available right now (no rental, reservation, maintenance, damage block or transfer). Available does not mean ready.`), rows: list.map((v) => ({ link: { type: 'vehicle', id: v.id }, primary: `${v.plate} · ${v.make} ${v.model}`, secondary: `${d.branches.find((x) => x.id === v.homeBranchId)?.name} · ${readinessOf(d, v, d.clock.now).ready ? L('hazır', 'ready') : L('hazır değil', 'not ready')}` })), source: L('Araç müsaitlik bölümleri (hold kayıtları)', 'Vehicle availability buckets (holds)') }
    },
  },
  {
    id: 'tomorrow',
    label: () => L('Yarın teslim edilecek araçlar hazır mı?', 'Are tomorrow’s pickup vehicles ready?'),
    words: ['yarın', 'yarin', 'tomorrow', 'teslim', 'hazır', 'hazir', 'ready'],
    run: (d, b) => {
      const tz = d.settings.company.tz
      const ymd = addDaysYmd(dayOf(d.clock.now, tz), 1)
      const rows = d.rentals.filter((r) => r.status === 'prepared' && b.includes(r.pickupBranchId) && dayOf(r.plannedPickupAt, tz) === ymd)
      const res = d.reservations.filter((r) => r.status === 'confirmed' && r.vehicleId && b.includes(r.pickupBranchId) && dayOf(r.pickupAt, tz) === ymd)
      const items: Row[] = [
        ...rows.map((r) => { const v = vOf(d, r.vehicleId); const rd = readinessOf(d, v, d.clock.now); return { link: { type: 'rental' as const, id: r.id }, primary: `${r.no} · ${v.plate}`, secondary: rd.ready ? L('Araç hazır', 'Vehicle ready') : `${L('Hazır değil', 'Not ready')}: ${rd.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}` } }),
        ...res.map((r) => { const v = vOf(d, r.vehicleId!); const rd = readinessOf(d, v, d.clock.now); return { link: { type: 'reservation' as const, id: r.id }, primary: `${r.no} · ${v.plate}`, secondary: rd.ready ? L('Araç hazır', 'Vehicle ready') : `${L('Hazır değil', 'Not ready')}: ${rd.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}` } }),
      ]
      return { summary: L(`Yarın (${ymd}) ${items.length} araçlı teslim planlı.`, `${items.length} pickup(s) with an assigned vehicle are planned for tomorrow (${ymd}).`), rows: items, source: L('Hazırlanan kiralamalar ve onaylı, araç atanmış rezervasyonlar', 'Prepared rentals and confirmed reservations with an assigned vehicle') }
    },
  },
  {
    id: 'service',
    label: () => L('Periyodik bakımı gelen veya geçen araçlar', 'Vehicles due or overdue for periodic service'),
    words: ['bakım', 'bakim', 'servis', 'service', 'maintenance'],
    run: (d, b) => {
      const list = inScope(d, b).map((v) => ({ v, left: v.service.intervalKm - (v.odometerKm - v.service.lastKm) })).filter((x) => x.left < 1500).sort((a, c) => a.left - c.left)
      return { summary: L(`${list.length} araçta periyodik bakıma 1.500 km veya daha az kaldı ya da bakım gecikti.`, `${list.length} vehicle(s) have 1,500 km or less to the next service, or are overdue.`), rows: list.map(({ v, left }) => ({ link: { type: 'vehicle', id: v.id }, primary: `${v.plate} · ${v.make} ${v.model}`, secondary: left < 0 ? L(`${(-left).toLocaleString('tr-TR')} km gecikmiş`, `${(-left).toLocaleString('en-GB')} km overdue`) : L(`${left.toLocaleString('tr-TR')} km kaldı`, `${left.toLocaleString('en-GB')} km left`) })), source: L('Araç kilometre ve bakım aralığı kayıtları', 'Vehicle odometer and service-interval records') }
    },
  },
  {
    id: 'docs',
    label: () => L('Belgesi (ruhsat, sigorta, muayene) yakında bitecek veya bitmiş araçlar', 'Vehicles with expiring or expired documents'),
    words: ['belge', 'sigorta', 'muayene', 'ruhsat', 'document', 'insurance', 'expire'],
    run: (d, b) => {
      const rows: Row[] = []
      for (const v of inScope(d, b)) {
        const docs = d.documents.filter((x) => x.ownerType === 'vehicle' && x.ownerId === v.id && x.validUntil)
        for (const dc of docs) {
          const days = Math.floor((Date.parse(`${dc.validUntil}T23:59:59Z`) - Date.parse(d.clock.now)) / 86_400_000)
          if (days <= d.settings.docs.warnDays) rows.push({ link: { type: 'vehicle', id: v.id }, primary: `${v.plate} · ${dc.name ?? dc.kind}`, secondary: days < 0 ? L(`${-days} gün önce bitti`, `expired ${-days} day(s) ago`) : L(`${days} gün sonra bitiyor`, `expires in ${days} day(s)`) })
        }
      }
      return { summary: L(`${rows.length} araç belgesi süresi dolmuş veya ${d.settings.docs.warnDays} gün içinde dolacak.`, `${rows.length} vehicle document(s) have expired or expire within ${d.settings.docs.warnDays} days.`), rows, source: L('Belge Merkezi araç belgeleri', 'Document Center vehicle documents') }
    },
  },
  {
    id: 'overdue',
    label: () => L('Hangi iadeler gecikti?', 'Which returns are overdue?'),
    words: ['gecik', 'overdue', 'late', 'iade'],
    run: (d, b) => {
      const list = overdueReturns(d, b)
      return { summary: L(`${list.length} kiralamanın planlanan iade zamanı geçti ve araç hâlâ müşteride.`, `${list.length} rental(s) are past the planned return time with the vehicle still with the customer.`), rows: list.map((r) => ({ link: { type: 'rental', id: r.id }, primary: `${r.no} · ${vOf(d, r.vehicleId).plate}`, secondary: `${d.customers.find((c) => c.id === r.customerId)?.name} · ${Math.floor((Date.parse(d.clock.now) - Date.parse(r.plannedReturnAt)) / 3_600_000)} ${L('saat', 'h')}` })), source: L('Teslim edilmiş kiralamalar', 'Delivered rentals') }
    },
  },
  {
    id: 'idle',
    label: () => L('Son 30 günde en az kiralanan araçlar', 'Least-rented vehicles in the last 30 days'),
    words: ['az', 'atıl', 'atil', 'kullanılmayan', 'idle', 'least', 'utilisation', 'doluluk'],
    run: (d, b) => {
      const tz = d.settings.company.tz
      const to = d.clock.now
      const from = startOfDay(addDaysYmd(dayOf(to, tz), -30), tz)
      const list = inScope(d, b).map((v) => ({ v, u: utilisation(d, v, from, to) })).sort((a, c) => a.u.rate - c.u.rate).slice(0, 8)
      return { summary: L('Kiralanma oranı en düşük 8 araç (gerçek teslim–iade sürelerinden).', 'The 8 vehicles with the lowest rented share (from actual handover–return times).'), rows: list.map(({ v, u }) => ({ link: { type: 'vehicle', id: v.id }, primary: `${v.plate} · ${v.make} ${v.model}`, secondary: `${L('kiralama oranı', 'rented')} %${Math.round(u.rate * 100)} · ${u.rentals} ${L('kiralama', 'rental(s)')}` })), source: L('Kiralama, bakım ve hasar bloğu süreleri', 'Rental, maintenance and damage-block durations') }
    },
  },
  {
    id: 'notready',
    label: () => L('Hazır olmayan araçlar ve nedenleri', 'Vehicles that are not ready, and why'),
    words: ['hazır olmayan', 'hazir olmayan', 'not ready', 'engel', 'blocker', 'temiz'],
    run: (d, b) => {
      const list = inScope(d, b).map((v) => ({ v, r: readinessOf(d, v, d.clock.now) })).filter((x) => !x.r.ready)
      return { summary: L(`${list.length} araç hazır değil. Hazırlık, müsaitlikten ayrı bir kavramdır.`, `${list.length} vehicle(s) are not ready. Readiness is a separate concept from availability.`), rows: list.map(({ v, r }) => ({ link: { type: 'vehicle', id: v.id }, primary: `${v.plate} · ${v.make} ${v.model}`, secondary: r.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ') })), source: L('Araç hazırlık kontrolleri', 'Vehicle readiness checks') }
    },
  },
  {
    id: 'customers',
    label: () => L('Belgesi eksik veya süresi dolmuş müşteriler', 'Customers with missing or expired documents'),
    words: ['müşteri', 'musteri', 'customer', 'ehliyet', 'pasaport', 'passport'],
    run: (d) => {
      const rows: Row[] = []
      for (const c of d.customers.filter((x) => !x.archived)) {
        const bad = customerDocChecks(d, c, d.clock.now).filter((x) => x.state === 'missing' || x.state === 'expired')
        if (bad.length) rows.push({ link: { type: 'customer', id: c.id }, primary: c.name, secondary: bad.map((x) => `${x.kind} ${x.state === 'missing' ? L('eksik', 'missing') : L('süresi dolmuş', 'expired')}`).join(', ') })
      }
      return { summary: L(`${rows.length} müşterinin zorunlu belgesi eksik veya süresi dolmuş.`, `${rows.length} customer(s) have a missing or expired required document.`), rows, source: L('Müşteri belgeleri ve belge politikası', 'Customer documents and document policy') }
    },
  },
]

export function AssistantPage() {
  const d = useDb()
  const { active } = useBranchScope()
  const [qid, setQid] = useUrlState('soru')
  const [text, setText] = useState('')
  const [unknown, setUnknown] = useState(false)
  const query = QUERIES.find((x) => x.id === qid)
  const answer = query ? query.run(d, active) : null
  const ask = () => {
    const t = text.trim().toLowerCase()
    const hit = QUERIES.find((x) => x.words.some((w) => t.includes(w)))
    setUnknown(!hit && t !== '')
    if (hit) setQid(hit.id)
  }
  return (
    <Page
      title={L('Filo Asistanı', 'Fleet Assistant')}
      description={L('Hazır sorular, gerçek kayıtlar üzerinde deterministik sorgularla yanıtlanır. Yapay zekâ modeli değildir; her yanıt kaynağını gösterir.', 'Ready-made questions answered by deterministic queries over real records. It is not an AI model; every answer shows its source.')}
    >
      <form className="flex max-w-[720px] gap-2" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{L('Soru yazın', 'Type a question')}</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('Örn. yarın teslim edilecek araçlar hazır mı?', 'E.g. are tomorrow’s pickup vehicles ready?')} className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[14px]" />
        </label>
        <button type="submit" className={btnPrimary}>{L('Sor', 'Ask')}</button>
      </form>
      {unknown && <p role="status" className="text-[13px] text-alert">{L('Bu soruyu eşleştiremedim. Aşağıdaki hazır sorulardan birini seçin; serbest metin yalnız anahtar kelime eşleştirir.', 'I could not match this question. Choose one of the ready-made questions below; free text only matches keywords.')}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title={L('Hazır sorular', 'Ready-made questions')}>
          <ul className="space-y-1.5">
            {QUERIES.map((x) => (
              <li key={x.id}>
                <button type="button" aria-pressed={x.id === qid} onClick={() => { setQid(x.id); setUnknown(false) }} className={`w-full rounded-md border px-3 py-2 text-left text-[13.5px] ${x.id === qid ? 'border-blue bg-blue-soft text-blue-ink' : 'border-line hover:bg-line-soft'}`}>{x.label()}</button>
              </li>
            ))}
          </ul>
          <CapacityAsk />
        </Panel>
        <div className="min-w-0">
          {!answer ? (
            <Empty title={L('Bir soru seçin', 'Choose a question')}>{L('Sonuçlar burada, kaynak kayıtlarına bağlantılarla görünür.', 'Results appear here, linked to their source records.')}</Empty>
          ) : (
            <Panel title={query!.label()} description={answer.summary} flush>
              {answer.rows.length === 0 ? (
                <p className="px-4 py-5 text-[13px] text-ink-2 sm:px-5">{L('Bu sorgu için kayıt bulunamadı.', 'No records found for this query.')}</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {answer.rows.map((r, i) => (
                    <li key={`${r.link.id}-${i}`}>
                      <Link to={entityHref(r.link.type, r.link.id) as never} className="block px-4 py-2.5 hover:bg-ground/60 sm:px-5">
                        <span className="block text-[13.5px] font-medium">{r.primary}</span>
                        <span className="block text-[12.5px] text-ink-2">{r.secondary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-line-soft px-4 py-3 sm:px-5"><DemoNote>{L('Kaynak', 'Source')}: {answer.source}</DemoNote></div>
            </Panel>
          )}
        </div>
      </div>
    </Page>
  )
}

function CapacityAsk() {
  const d = useDb()
  const { active } = useBranchScope()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [branch, setBranch] = useState(active[0] ?? d.branches[0]!.id)
  const [from, setFrom] = useState(addDaysYmd(today, 1))
  const [to, setTo] = useState(addDaysYmd(today, 4))
  const [out, setOut] = useState<string | null>(null)
  const run = () => {
    const b = d.branches.find((x) => x.id === branch)!
    if (to < from) return setOut(L('Bitiş tarihi başlangıçtan önce olamaz.', 'The end date cannot be before the start date.'))
    const days: { day: string; n: number }[] = []
    for (let x = from, i = 0; x <= to && i < 60; x = addDaysYmd(x, 1), i++) days.push({ day: x, n: capacityCell(d, b, cls, x).available })
    const min = Math.min(...days.map((x) => x.n))
    setOut(min > 0 ? L(`${b.name} · ${d.classes.find((c) => c.id === cls)?.name}: seçilen günlerde en az ${min} araç müsait.`, `${b.name} · ${d.classes.find((c) => c.id === cls)?.name}: at least ${min} vehicle(s) free on the chosen days.`) : L(`Kapasite dolu: ${days.filter((x) => x.n <= 0).map((x) => x.day).join(', ')}.`, `Fully booked on: ${days.filter((x) => x.n <= 0).map((x) => x.day).join(', ')}.`))
  }
  return (
    <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
      <h3 className="text-[13px] font-semibold">{L('Sınıf müsaitliği sor', 'Ask class availability')}</h3>
      <SelectF id="as-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d, active)} />
      <SelectF id="as-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
      <div className="grid grid-cols-2 gap-3">
        <DateF id="as-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} />
        <DateF id="as-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} />
      </div>
      <button type="button" className={btnPrimary} onClick={run}>{L('Sorgula', 'Query')}</button>
      {out && <p role="status" className="text-[13px]">{out}</p>}
    </div>
  )
}
