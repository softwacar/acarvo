import { Storefront } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { fmt, sumByCur } from '../../core/money'
import { submitPartnerLead } from '../../core/ops/commercial'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import { commit } from '../../core/store'
import { L } from '../../i18n'
import { AreaF, DateTimeF, SelectF, TextF, branchOptions, classOptions } from '../../ui/forms'
import { runAction, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, FinanceDialog, Kpis, Notice, Panel, Status, Tabs } from '../../ui/kit'
import { byCurText } from '../fleet/common'
import { ContextFrame } from './ContextFrame'

// Partner Portal: an external context. A partner sees only its own leads, quotes, reservations and commission; customer
// contact details are never shown. Quote and lead exchange is a record in the demo: nothing is emailed or messaged.

type TabId = 'talepler' | 'rezervasyonlar' | 'komisyon'

export function PartnerPortal() {
  const d = useDb()
  const f = useFmt()
  const navigate = useNavigate()
  const [tab, setTab] = useUrlState('sekme', 'talepler')
  const [adding, setAdding] = useState(false)
  const partners = d.partners
  const partner = partners.find((p) => p.id === d.session.partnerId) ?? partners.find((p) => p.portalAccess) ?? partners[0]
  const back = () => { commit((x) => { x.session.context = 'company' }); void navigate({ to: '/' as never }) }
  if (!partner)
    return (
      <ContextFrame title={L('Partner Portalı', 'Partner Portal')} subtitle={L('Dış bağlam', 'External context')} icon={<Storefront size={20} />} actions={<button type="button" className={btnPrimary} onClick={back}>{L('Şirket paneline dön', 'Back to the company app')}</button>}>
        <Empty title={L('Tanımlı partner yok', 'No partners defined')} />
      </ContextFrame>
    )
  const leads = d.leads.filter((l) => l.partnerId === partner.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const reservations = d.reservations.filter((r) => r.partnerId === partner.id).sort((a, b) => b.pickupAt.localeCompare(a.pickupAt))
  const coms = d.commissions.filter((c) => c.partnerId === partner.id)
  const paid = new Set(d.partnerPayments.flatMap((x) => x.commissionIds))
  const pay = d.partnerPayments.filter((x) => x.partnerId === partner.id)
  const choose = (id: string) => commit((x) => { x.session.partnerId = id })
  return (
    <ContextFrame
      title={L('Partner Portalı', 'Partner Portal')}
      subtitle={`${partner.name} · ${L('dış bağlam', 'external context')}`}
      icon={<Storefront size={20} />}
      actions={<button type="button" className={btnSecondary} onClick={back}>{L('Şirket paneline dön', 'Back to the company app')}</button>}
    >
      <div className="max-w-sm">
        <SelectF id="pp-sel" label={L('Demo: partner olarak görüntüle', 'Demo: view as partner')} value={partner.id} onChange={choose} options={partners.map((p) => ({ id: p.id, label: `${p.name}${p.portalAccess ? '' : ` (${L('portal kapalı', 'portal off')})`}` }))} />
      </div>
      {!partner.portalAccess ? (
        <Notice tone="hold">{L('Bu partnerin portal erişimi kapalı. Şirket tarafında Partnerler ekranından açılır; kapalıyken talep gönderilemez.', 'This partner’s portal access is off. The company turns it on from the Partners screen; no lead can be submitted while it is off.')}</Notice>
      ) : (
        <>
          <Notice tone="blue">{L('Yalnız kendi talep, rezervasyon ve komisyonlarınızı görürsünüz. Müşteri telefon ve e-postası gösterilmez. Gönderilen talepler şirkete kayıt olarak düşer; e-posta veya mesaj gitmez.', 'You see only your own leads, reservations and commission. Customer phone and email are never shown. Submitted leads arrive at the company as records; no email or message is sent.')}</Notice>
          <Kpis items={[{ label: L('Taleplerim', 'My leads'), value: leads.length }, { label: L('Rezervasyonlarım', 'My reservations'), value: reservations.length }, { label: L('Doğan komisyon', 'Earned commission'), value: byCurText(sumByCur(coms, (c) => c.amount), fmt) }, { label: L('Ödenmemiş', 'Unpaid'), value: byCurText(sumByCur(coms.filter((c) => !paid.has(c.id)), (c) => c.amount), fmt), tone: 'hold' }]} />
          <Tabs<TabId> label={L('Portal bölümleri', 'Portal sections')} value={(tab as TabId) || 'talepler'} onChange={setTab} tabs={[{ id: 'talepler', label: L('Taleplerim', 'My leads'), count: leads.length }, { id: 'rezervasyonlar', label: L('Rezervasyonlarım', 'My reservations'), count: reservations.length }, { id: 'komisyon', label: L('Komisyon', 'Commission') }]} />
          {tab === 'rezervasyonlar' ? (
            <Panel flush>
              {reservations.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Rezervasyon yok.', 'No reservations.')}</p> : (
                <ul className="divide-y divide-line-soft">{reservations.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]"><span><span className="tnum font-medium">{r.no}</span> · {d.customers.find((c) => c.id === r.customerId)?.name}<span className="block text-[12.5px] text-ink-2">{d.classes.find((c) => c.id === r.classId)?.name} · {f.date(r.pickupAt, r.pickupBranchId)} → {f.date(r.returnAt, r.returnBranchId)}</span></span><Status kind="reservation" value={r.status} /></li>)}</ul>
              )}
            </Panel>
          ) : tab === 'komisyon' ? (
            <div className="space-y-4">
              <Panel title={L('Komisyon koşulum', 'My commission terms')}>
                <p className="text-[13.5px]">%{partner.commission.pct} · {({ delivered: L('teslimde doğar', 'earned at delivery'), returned: L('iadede doğar', 'earned at return'), closed: L('kapanışta doğar', 'earned at closure') })[partner.commission.trigger]} · {L('sürüm', 'version')} {partner.commission.version}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{L('Doğan komisyon ödenmiş sayılmaz; ödeme şirket tarafında kayıtla yapılır.', 'Earned commission is not paid; payment is recorded by the company.')}</p>
              </Panel>
              <Panel title={L('Komisyon kayıtları', 'Commission records')} flush>
                {coms.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Henüz doğan komisyon yok.', 'No commission earned yet.')}</p> : <ul className="divide-y divide-line-soft">{coms.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span>{d.rentals.find((r) => r.id === c.rentalId)?.no}<span className="block text-[12.5px] text-ink-2">{f.date(c.earnedAt)}</span></span><span className="flex items-center gap-2"><span className="tnum font-medium">{fmt(c.amount.minor, c.amount.cur)}</span><span className={paid.has(c.id) ? 'text-ok' : 'text-hold'}>{paid.has(c.id) ? L('Ödendi', 'Paid') : L('Ödenmedi', 'Unpaid')}</span></span></li>)}</ul>}
              </Panel>
              {pay.length > 0 && <Panel title={L('Ödemeler', 'Payments')} flush><ul className="divide-y divide-line-soft">{pay.map((x) => <li key={x.id} className="flex justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span>{x.reference}<span className="block text-[12.5px] text-ink-2">{f.date(x.paidAt)}</span></span><span className="tnum font-medium">{fmt(x.amount.minor, x.amount.cur)}</span></li>)}</ul></Panel>}
            </div>
          ) : (
            <Panel title={L('Taleplerim', 'My leads')} action={<button type="button" className={btnPrimary} onClick={() => setAdding(true)}>{L('Yeni talep gönder', 'Submit a lead')}</button>} flush>
              {leads.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Talep yok.', 'No leads.')}</p> : (
                <ul className="divide-y divide-line-soft">
                  {leads.map((l) => {
                    const quotes = d.quotes.filter((q) => q.leadId === l.id && q.status !== 'superseded')
                    return (
                      <li key={l.id} className="px-5 py-3 text-[13.5px]">
                        <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="tnum font-medium">{l.no}</span> · {l.name}</span><Status kind="lead" value={l.status} /></div>
                        <p className="text-[12.5px] text-ink-2">{d.classes.find((c) => c.id === l.classId)?.name} · {f.date(l.from, l.branchId)} → {f.date(l.to, l.branchId)}</p>
                        {quotes.map((q) => <p key={q.id} className="mt-1 text-[12.5px]">{q.no}: <span className="tnum font-medium">{fmt(q.price.grossMinor, q.price.cur)}</span> · <Status kind="quote" value={q.status} /></p>)}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          )}
        </>
      )}
      {adding && <LeadDialog partnerId={partner.id} onClose={() => setAdding(false)} />}
    </ContextFrame>
  )
}

function LeadDialog({ partnerId, onClose }: { partnerId: string; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [branch, setBranch] = useState(d.branches[0]!.id)
  const [from, setFrom] = useState(zonedIso(addDaysYmd(today, 10), '10:00', f.zone(d.branches[0]!.id)))
  const [to, setTo] = useState(zonedIso(addDaysYmd(today, 14), '10:00', f.zone(d.branches[0]!.id)))
  const [notes, setNotes] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Yeni talep gönder', 'Submit a lead')} description={L('Talep şirkete kayıt olarak düşer; şirket teklif hazırlar. Müşteriyle iletişimi siz sürdürürsünüz.', 'The lead reaches the company as a record; the company prepares a quote. You keep the customer relationship.')} confirm={L('Gönder', 'Submit')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => submitPartnerLead(s, partnerId, { name, phone, email, classId: cls, from, to, branchId: branch, notes }), L('Talep şirkete iletildi (kayıt olarak).', 'Lead delivered to the company (as a record).')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <TextF id="pl-n" label={L('Müşteri adı', 'Customer name')} required value={name} onChange={setName} error={fields.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="pl-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} />
        <TextF id="pl-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} />
        <SelectF id="pl-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
        <SelectF id="pl-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d)} />
        <DateTimeF id="pl-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={f.zone(branch)} />
        <DateTimeF id="pl-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={f.zone(branch)} error={fields.to} />
      </div>
      <AreaF id="pl-x" label={L('Not', 'Note')} value={notes} onChange={setNotes} rows={2} />
    </FinanceDialog>
  )
}
