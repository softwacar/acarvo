import { CaretRight } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { capacityCell, checkVehicleAvailable } from '../../core/calc/availability'
import { COUNTED_VEHICLE, rangeOfDays, utilisation } from '../../core/metrics'
import { fmt } from '../../core/money'
import { addDaysYmd, dayOf } from '../../core/time'
import type { Db, Id, Iso, LinkType } from '../../core/types'
import { L } from '../../i18n'
import { entityHref, useBranchScope, useDb, useUrlState } from '../../ui/hooks'
import { Empty, Kpis, Notice, Page, Panel, Segmented } from '../../ui/kit'

// Opportunities: deterministic suggestions from current records. Nothing here changes a price, sends a message or books
// anything; every row opens the record where a person acts.

type Kind = 'confirm' | 'waitlist' | 'assign' | 'quote' | 'idle' | 'upsell' | 'followup'
interface Opp {
  id: string
  kind: Kind
  title: string
  reason: string
  link: { type: LinkType; id: Id }
  value?: string
}

const KIND_LABEL = (): Record<Kind, string> => ({ confirm: L('Onaylanabilir rezervasyon', 'Confirmable reservation'), waitlist: L('Bekleme listesi eşleşmesi', 'Waitlist match'), assign: L('Araç atanabilir', 'Vehicle can be assigned'), quote: L('Süresi dolan teklif', 'Quote about to expire'), idle: L('Atıl araç', 'Idle vehicle'), upsell: L('Sigorta önerisi', 'Cover suggestion'), followup: L('Takip zamanı gelen müşteri', 'Customer follow-up due') })

function build(d: Db, branches: Id[]): Opp[] {
  const out: Opp[] = []
  const now = d.clock.now
  const nowMs = Date.parse(now)
  const days = (from: Iso, to: Iso, tz: string) => { const a: string[] = []; for (let x = dayOf(from, tz), i = 0; x <= dayOf(new Date(Date.parse(to) - 1).toISOString(), tz) && i < 60; x = addDaysYmd(x, 1), i++) a.push(x); return a }
  const free = (branchId: Id, classId: Id, from: Iso, to: Iso) => { const b = d.branches.find((x) => x.id === branchId)!; return days(from, to, b.tz).every((day) => capacityCell(d, b, classId, day).available > 0) }
  for (const r of d.reservations) {
    if (!branches.includes(r.pickupBranchId)) continue
    if (r.status === 'pending' && Date.parse(r.pickupAt) > nowMs && free(r.pickupBranchId, r.classId, r.pickupAt, r.returnAt)) out.push({ id: `c-${r.id}`, kind: 'confirm', title: r.no, reason: L('Bu dönem için sınıfta müsait araç var; onay bekliyor.', 'The class has free vehicles for this window; awaiting confirmation.'), link: { type: 'reservation', id: r.id }, value: r.price ? fmt(r.price.grossMinor, r.price.cur) : undefined })
    if (r.status === 'confirmed' && !r.vehicleId) {
      const cand = d.vehicles.find((v) => v.classId === r.classId && v.homeBranchId === r.pickupBranchId && COUNTED_VEHICLE(d, v) && checkVehicleAvailable(d, v, r.pickupAt, r.returnAt, now, { reservationId: r.id }).ok)
      if (cand) out.push({ id: `a-${r.id}`, kind: 'assign', title: r.no, reason: L(`${cand.plate} bu dönemde müsait; yalnız-sınıf rezervasyona atanabilir.`, `${cand.plate} is free for this window and can be assigned to the class-only reservation.`), link: { type: 'reservation', id: r.id } })
    }
  }
  for (const w of d.waitlist) if (w.status === 'waiting' && branches.includes(w.branchId) && free(w.branchId, w.classId, w.from, w.to)) out.push({ id: `w-${w.id}`, kind: 'waitlist', title: d.customers.find((c) => c.id === w.customerId)?.name ?? w.id, reason: L('İstediği dönemde artık müsait araç var; müşteriye elle haber verin.', 'There is now a free vehicle in the requested window; inform the customer manually.'), link: { type: 'customer', id: w.customerId } })
  for (const q of d.quotes) if (q.status === 'sent' && Date.parse(q.validUntil) > nowMs && Date.parse(q.validUntil) - nowMs < 48 * 3600_000) out.push({ id: `q-${q.id}`, kind: 'quote', title: `${q.no} · v${q.version}`, reason: L('Geçerlilik 48 saat içinde bitiyor.', 'Validity ends within 48 hours.'), link: { type: 'quote', id: q.id }, value: fmt(q.price.grossMinor, q.price.cur) })
  const range = rangeOfDays(d, 30)
  for (const v of d.vehicles) {
    if (!branches.includes(v.homeBranchId) || !COUNTED_VEHICLE(d, v)) continue
    const u = utilisation(d, v, range.from, range.to)
    if (u.rentals === 0 && v.status === 'active') out.push({ id: `i-${v.id}`, kind: 'idle', title: `${v.plate} · ${v.make} ${v.model}`, reason: L('Son 30 günde hiç kiralanmadı. Fiyat veya konumlandırmayı gözden geçirin (öneri; otomatik değişiklik yapılmaz).', 'Not rented in the last 30 days. Review price or positioning (a suggestion; nothing changes automatically).'), link: { type: 'vehicle', id: v.id } })
  }
  for (const r of d.rentals) if (r.status === 'prepared' && branches.includes(r.pickupBranchId) && !r.insuranceId && d.insurance.some((p) => p.active && p.dailyPrice[r.currency] !== undefined)) out.push({ id: `u-${r.id}`, kind: 'upsell', title: r.no, reason: L('Sigorta paketi seçilmemiş; teslimden önce müşteriye seçenekleri sunun.', 'No cover package chosen; offer the options before handover.'), link: { type: 'rental', id: r.id } })
  for (const c of d.customers) for (const l of c.contacts) if (l.followUpAt && !l.followUpDone && Date.parse(l.followUpAt) <= nowMs) out.push({ id: `f-${l.id}`, kind: 'followup', title: c.name, reason: l.summary, link: { type: 'customer', id: c.id } })
  return out
}

export function OpportunitiesPage() {
  const d = useDb()
  const { active } = useBranchScope()
  const [kind, setKind] = useUrlState('tur', 'all')
  const labels = KIND_LABEL()
  const all = build(d, active)
  const list = all.filter((o) => (kind === 'all' ? true : o.kind === kind))
  const count = (k: Kind) => all.filter((o) => o.kind === k).length
  return (
    <Page title={L('Fırsatlar', 'Opportunities')} description={L('Güncel kayıtlardan türetilen öneriler. Hiçbiri fiyat değiştirmez, mesaj göndermez veya rezervasyon yapmaz; her satır, işlemi bir kişinin yapacağı kayda gider.', 'Suggestions derived from current records. None of them changes a price, sends a message or books anything; each row opens the record where a person acts.')}>
      <Kpis items={[{ label: L('Toplam fırsat', 'Opportunities'), value: all.length }, { label: L('Onaylanabilir', 'Confirmable'), value: count('confirm') }, { label: L('Bekleme listesi eşleşmesi', 'Waitlist matches'), value: count('waitlist') }, { label: L('Atıl araç', 'Idle vehicles'), value: count('idle') }]} />
      <Segmented label={L('Tür', 'Type')} value={kind} onChange={setKind} options={[{ id: 'all', label: L('Hepsi', 'All') }, ...(Object.keys(labels) as Kind[]).filter((k) => count(k) > 0).map((k) => ({ id: k, label: `${labels[k]} (${count(k)})` }))]} />
      {list.length === 0 ? <Empty title={L('Şu an fırsat önerisi yok', 'No opportunities right now')} /> : (
        <Panel flush>
          <ul className="divide-y divide-line-soft">
            {list.map((o) => (
              <li key={o.id}>
                <Link to={entityHref(o.link.type, o.link.id) as never} className="group flex items-start gap-3 px-4 py-3 hover:bg-ground/60 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-blue-ink">{labels[o.kind]}</span>
                    <span className="block text-[13.5px] font-medium">{o.title}{o.value && <span className="tnum ml-2 text-ink-2">{o.value}</span>}</span>
                    <span className="block text-[12.5px] text-ink-2">{o.reason}</span>
                  </span>
                  <CaretRight size={14} className="mt-2 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Notice tone="blue">{L('“Atıl araç” önerisi yalnız bilgidir; fiyat politikası değişikliği Fiyatlandırma’da, onay gerektiriyorsa Onay Merkezi’nde yapılır.', 'The “idle vehicle” suggestion is informational only; a price change is made under Pricing, and through the Approval Center where required.')}</Notice>
    </Page>
  )
}
