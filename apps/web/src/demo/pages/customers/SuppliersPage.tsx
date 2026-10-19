import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { projectSupplierPayable } from '../../core/calc/finance'
import { fmt, parseAmount } from '../../core/money'
import { acceptOffer, addSupplierOffer, createSettlement, createSourcingRequest, createSupplier, paySettlement, receiveEngagement, returnEngagement } from '../../core/ops/commercial'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Engagement, FuelLevel, SourcingRequest, Supplier, SupplierSettlement } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, DateTimeF, MoneyF, SelectF, TextF, branchOptions, classOptions } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Empty, Facts, FinanceDialog, Kpis, Notice, Page, Panel, Status, Tabs } from '../../ui/kit'
import { FUEL_LABEL } from '../../ui/status'
import { type Col, DataTable } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer, useAct } from '../fleet/common'

type TabId = 'tedarikci' | 'talep' | 'gorevlendirme' | 'mutabakat'

export function SuppliersPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const [tab, setTab] = useUrlState('sekme', 'tedarikci')
  const [sel, setSel] = useUrlState('kayit')
  const [dlg, setDlg] = useState<null | 'supplier' | 'request'>(null)
  const manage = can('suppliers:manage')
  const openPayable = d.settlements.filter((s) => s.status === 'open')
  const supplierCols: Col<Supplier>[] = [
    { id: 'name', header: L('Tedarikçi', 'Supplier'), cell: (s) => <span className="font-medium text-blue">{s.name}</span>, sort: (s) => s.name },
    { id: 'no', header: L('No', 'No'), cell: (s) => <span className="tnum whitespace-nowrap">{s.no}</span>, hideBelow: 'md' },
    { id: 'contact', header: L('Kişi', 'Contact'), cell: (s) => s.contact.name, hideBelow: 'lg' },
    { id: 'terms', header: L('Koşullar', 'Terms'), cell: (s) => <span className="line-clamp-1">{s.terms}</span>, hideBelow: 'md' },
    { id: 'st', header: L('Durum', 'Status'), cell: (s) => (s.status === 'active' ? L('Aktif', 'Active') : L('Duraklatıldı', 'Paused')) },
  ]
  const reqCols: Col<SourcingRequest>[] = [
    { id: 'no', header: L('Talep', 'Request'), cell: (r) => <span className="tnum whitespace-nowrap font-medium text-blue">{r.no}</span>, sort: (r) => r.no },
    { id: 'cls', header: L('Sınıf', 'Class'), cell: (r) => d.classes.find((c) => c.id === r.classId)?.name },
    { id: 'reason', header: L('Gerekçe', 'Reason'), cell: (r) => <span className="line-clamp-1">{r.reason}</span>, hideBelow: 'md' },
    { id: 'offers', header: L('Teklif', 'Offers'), align: 'right', cell: (r) => r.offers.length },
    { id: 'st', header: L('Durum', 'Status'), cell: (r) => <Status kind="sourcing" value={r.status} /> },
  ]
  const engs = d.engagements
  return (
    <Page
      title={L('Araç Tedarikçileri', 'Vehicle Suppliers')}
      description={L('Teklif kabulü aracın alındığı anlamına gelmez: harici araç yalnız teslim alınınca ve kanıtlanınca kapasiteye girer. Tedarikçiye borç, mutabakat ödenince kapanır.', 'Accepting an offer does not mean the vehicle was received: an external vehicle counts toward capacity only once received with evidence. The supplier payable closes when the settlement is paid.')}
      actions={manage ? (
        <>
          <button type="button" className={btnSecondary} onClick={() => setDlg('supplier')}><Plus size={15} /> {L('Yeni tedarikçi', 'New supplier')}</button>
          <button type="button" className={btnPrimary} onClick={() => setDlg('request')}><Plus size={16} /> {L('Araç talebi', 'Sourcing request')}</button>
        </>
      ) : undefined}
    >
      <Kpis items={[{ label: L('Tedarikçi', 'Suppliers'), value: d.suppliers.length }, { label: L('Açık talep', 'Open requests'), value: d.sourcing.filter((r) => ['open', 'offered'].includes(r.status)).length }, { label: L('Aktif görevlendirme', 'Active engagements'), value: engs.filter((e) => ['confirmed', 'received'].includes(e.status)).length }, { label: L('Açık mutabakat', 'Open settlements'), value: openPayable.length, tone: openPayable.length ? 'hold' : undefined }]} />
      <Tabs<TabId> label={L('Tedarik bölümleri', 'Sourcing sections')} value={tab as TabId} onChange={setTab} tabs={[{ id: 'tedarikci', label: L('Tedarikçiler', 'Suppliers') }, { id: 'talep', label: L('Araç talepleri', 'Requests'), count: d.sourcing.length }, { id: 'gorevlendirme', label: L('Görevlendirmeler', 'Engagements'), count: engs.length }, { id: 'mutabakat', label: L('Mutabakat', 'Settlements'), count: openPayable.length || undefined }]} />
      {tab === 'tedarikci' && <DataTable rows={d.suppliers} cols={supplierCols} rowKey={(s) => s.id} label={L('Tedarikçi listesi', 'Supplier list')} urlKey="td" onRowClick={(s) => setSel(s.id)} empty={<Empty title={L('Tedarikçi yok', 'No suppliers')} />} />}
      {tab === 'talep' && <DataTable rows={d.sourcing.filter((r) => active.includes(r.branchId))} cols={reqCols} rowKey={(r) => r.id} label={L('Araç talepleri', 'Sourcing requests')} urlKey="tr" defaultSort={{ id: 'no', dir: 'desc' }} onRowClick={(r) => setSel(r.id)} empty={<Empty title={L('Araç talebi yok', 'No sourcing requests')} />} />}
      {tab === 'gorevlendirme' && <Engagements />}
      {tab === 'mutabakat' && <Settlements />}
      {dlg === 'supplier' && <SupplierDialog onClose={() => setDlg(null)} />}
      {dlg === 'request' && <RequestDialog onClose={() => setDlg(null)} />}
      {sel && d.sourcing.find((r) => r.id === sel) && <RequestDrawer r={d.sourcing.find((r) => r.id === sel)!} onClose={() => setSel('')} />}
      {sel && d.suppliers.find((s) => s.id === sel) && <SupplierDrawer s={d.suppliers.find((s) => s.id === sel)!} onClose={() => setSel('')} />}
    </Page>
  )
}

function SupplierDrawer({ s, onClose }: { s: Supplier; onClose: () => void }) {
  const d = useDb()
  const vehicles = d.externalVehicles.filter((v) => v.supplierId === s.id)
  return (
    <RecordDrawer title={s.name} subtitle={s.no} onClose={onClose}>
      <Facts single rows={[[L('Kişi', 'Contact'), `${s.contact.name} · ${s.contact.email} · ${s.contact.phone}`], [L('Ülke', 'Country'), s.country], [L('Koşullar', 'Terms'), s.terms], [L('Tutulan depozito', 'Deposit held'), fmt(s.depositHeld.minor, s.depositHeld.cur)]]} />
      <DrawerSection title={L('Harici araçlar', 'External vehicles')}>
        {vehicles.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Araç yok.', 'No vehicles.')}</p> : <ul className="divide-y divide-line-soft text-[13.5px]">{vehicles.map((v) => <li key={v.id} className="py-2">{v.plate} · {v.make} {v.model} ({v.year})</li>)}</ul>}
      </DrawerSection>
    </RecordDrawer>
  )
}

function RequestDrawer({ r, onClose }: { r: SourcingRequest; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [dlg, setDlg] = useState<null | 'offer' | { accept: string }>(null)
  const manage = can('suppliers:manage')
  return (
    <RecordDrawer title={r.no} subtitle={d.classes.find((c) => c.id === r.classId)?.name} onClose={onClose}>
      <Facts single rows={[[L('Durum', 'Status'), <Status key="s" kind="sourcing" value={r.status} />], [L('Dönem', 'Window'), `${f.date(r.from, r.branchId)} → ${f.date(r.to, r.branchId)}`], [L('Şube', 'Branch'), d.branches.find((b) => b.id === r.branchId)?.name], [L('Gerekçe', 'Reason'), r.reason]]} />
      {manage && ['open', 'offered'].includes(r.status) && <DrawerSection title={L('İşlemler', 'Actions')}><ActionRow><ActBtn onClick={() => setDlg('offer')}>{L('Tedarikçi teklifi ekle', 'Add supplier offer')}</ActBtn></ActionRow></DrawerSection>}
      <DrawerSection title={`${L('Teklifler', 'Offers')} (${r.offers.length})`}>
        {r.offers.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Teklif yok.', 'No offers.')}</p> : (
          <ul className="space-y-2">
            {r.offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-line p-3 text-[13.5px]">
                <div className="flex justify-between gap-2"><span className="font-medium">{d.suppliers.find((s) => s.id === o.supplierId)?.name}</span><span className="tnum font-medium">{fmt(o.dailyRate.minor, o.dailyRate.cur)} / {L('gün', 'day')}</span></div>
                <p className="text-[12.5px] text-ink-2">{o.vehicle} · {L('geçerlilik', 'valid until')} {f.date(o.validUntil)} · {o.status}</p>
                <p className="text-[12.5px] text-ink-2">{L('Tahmini borç', 'Projected payable')}: {fmt(projectSupplierPayable(o.dailyRate, r.from, r.to).minor, o.dailyRate.cur)}</p>
                {o.status === 'open' && r.status !== 'accepted' && manage && <div className="mt-2"><ActBtn onClick={() => setDlg({ accept: o.id })}>{L('Teklifi kabul et', 'Accept offer')}</ActBtn></div>}
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
      {r.engagementId && <Notice tone="blue">{L('Teklif kabul edildi: görevlendirme oluştu. Araç teslim alınana kadar kapasiteye girmez.', 'Offer accepted: an engagement exists. The vehicle does not count toward capacity until received.')}</Notice>}
      {dlg === 'offer' && <OfferDialog r={r} onClose={() => setDlg(null)} />}
      {dlg && typeof dlg === 'object' && <AcceptDialog r={r} offerId={dlg.accept} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function OfferDialog({ r, onClose }: { r: SourcingRequest; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone(r.branchId)
  const [sup, setSup] = useState(d.suppliers[0]?.id ?? '')
  const [veh, setVeh] = useState('')
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [valid, setValid] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 3), '18:00', tz))
  return (
    <FinanceDialog title={L('Tedarikçi teklifi', 'Supplier offer')} description={L('Tedarikçi teklifini elle girersiniz; tedarikçiye otomatik istek gitmez.', 'You enter the supplier’s offer manually; nothing is sent to the supplier automatically.')} confirm={L('Ekle', 'Add')} onClose={onClose}
      onSubmit={() => { const minor = parseAmount(amount, cur); if (minor === null || minor <= 0) return L('Geçerli bir günlük bedel girin.', 'Enter a valid daily rate.'); const x = runAction((s) => addSupplierOffer(s, r.id, { supplierId: sup, vehicle: veh, dailyRate: { minor, cur }, validUntil: valid }), L('Teklif eklendi.', 'Offer added.')); if (!x.ok) return x.error; onClose() }}>
      <SelectF id="of-s" label={L('Tedarikçi', 'Supplier')} value={sup} onChange={setSup} options={d.suppliers.map((s) => ({ id: s.id, label: s.name }))} />
      <TextF id="of-v" label={L('Araç tanımı', 'Vehicle description')} value={veh} onChange={setVeh} />
      <MoneyF id="of-a" label={L('Günlük bedel (maliyet)', 'Daily cost')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} />
      <DateTimeF id="of-t" label={L('Teklif geçerlilik', 'Offer valid until')} value={valid} onChange={setValid} tz={tz} />
    </FinanceDialog>
  )
}

function AcceptDialog({ r, offerId, onClose }: { r: SourcingRequest; offerId: string; onClose: () => void }) {
  const [plate, setPlate] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Teklifi kabul et', 'Accept offer')} description={L('Harici araç kaydı ve görevlendirme oluşur. Araç henüz teslim alınmadı: kapasiteye girmez.', 'An external vehicle record and an engagement are created. The vehicle is not received yet: it does not count toward capacity.')} confirm={L('Kabul et', 'Accept')} onClose={onClose}
      onSubmit={() => { const x = runAction((s) => acceptOffer(s, r.id, offerId, plate, make, model), L('Teklif kabul edildi; görevlendirme oluştu.', 'Offer accepted; engagement created.')); if (!x.ok) { setFields(x.fields); return x.error } onClose() }}>
      <TextF id="ac-p" label={L('Plaka', 'Plate')} required value={plate} onChange={setPlate} error={fields.plate} />
      <div className="grid gap-4 sm:grid-cols-2"><TextF id="ac-m" label={L('Marka', 'Make')} value={make} onChange={setMake} /><TextF id="ac-o" label={L('Model', 'Model')} value={model} onChange={setModel} /></div>
    </FinanceDialog>
  )
}

function Engagements() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [dlg, setDlg] = useState<null | { kind: 'receive' | 'return'; e: Engagement }>(null)
  const { act, error } = useAct()
  const manage = can('suppliers:manage')
  return (
    <div className="space-y-3">
      {error && <Notice tone="alert">{error}</Notice>}
      <Panel flush>
        {d.engagements.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Görevlendirme yok.', 'No engagements.')}</p> : (
          <ul className="divide-y divide-line-soft">
            {d.engagements.map((e) => {
              const v = d.externalVehicles.find((x) => x.id === e.externalVehicleId)
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                  <span><span className="tnum font-medium">{e.no}</span> · {v?.plate} {v?.make} {v?.model}<span className="block text-[12.5px] text-ink-2">{d.suppliers.find((s) => s.id === e.supplierId)?.name} · {f.date(e.from)} → {f.date(e.to)} · {fmt(e.dailyCost.minor, e.dailyCost.cur)}/{L('gün', 'day')}</span></span>
                  <span className="flex items-center gap-2"><Status kind="engagement" value={e.status} />
                    {manage && e.status === 'confirmed' && <button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'receive', e })}>{L('Teslim al', 'Receive')}</button>}
                    {manage && e.status === 'received' && <button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'return', e })}>{L('İade et', 'Return')}</button>}
                    {manage && e.status === 'returned' && !e.settlementId && <button type="button" className={btnSmall} onClick={() => act((s) => createSettlement(s, e.id), L('Mutabakat oluşturuldu.', 'Settlement created.'))}>{L('Mutabakat oluştur', 'Create settlement')}</button>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      {dlg && <InspectDialog kind={dlg.kind} e={dlg.e} onClose={() => setDlg(null)} />}
    </div>
  )
}

function InspectDialog({ kind, e, onClose }: { kind: 'receive' | 'return'; e: Engagement; onClose: () => void }) {
  const [km, setKm] = useState('')
  const [fuel, setFuel] = useState<FuelLevel>('full')
  const [photos, setPhotos] = useState('4')
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={kind === 'receive' ? L('Harici aracı teslim al', 'Receive external vehicle') : L('Harici aracı iade et', 'Return external vehicle')} description={kind === 'receive' ? L('Teslim alma kanıtı (km, yakıt, fotoğraf) kaydedilir; araç ancak bundan sonra kapasiteye girer.', 'Receipt evidence (km, fuel, photos) is recorded; only then does the vehicle count toward capacity.') : L('İade kanıtı kaydedilir; ardından tedarikçi mutabakatı oluşturulabilir.', 'Return evidence is recorded; then the supplier settlement can be created.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const fn = kind === 'receive' ? receiveEngagement : returnEngagement; const x = runAction((s) => fn(s, e.id, Number(km), fuel, Number(photos), note), kind === 'receive' ? L('Araç teslim alındı.', 'Vehicle received.') : L('Araç iade edildi.', 'Vehicle returned.')); if (!x.ok) { setFields(x.fields); return x.error } onClose() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="in-k" label={L('Kilometre', 'Odometer')} required value={km} onChange={(v) => setKm(v.replace(/\D/g, ''))} error={fields.km} />
        <SelectF id="in-f" label={L('Yakıt', 'Fuel')} value={fuel} onChange={(v) => setFuel(v as FuelLevel)} options={Object.entries(FUEL_LABEL()).map(([id, label]) => ({ id, label }))} />
        <TextF id="in-p" label={L('Fotoğraf adedi (örnek)', 'Photo count (sample)')} value={photos} onChange={(v) => setPhotos(v.replace(/\D/g, ''))} error={fields.photos} />
      </div>
      <AreaF id="in-n" label={L('Not', 'Note')} value={note} onChange={setNote} rows={2} />
    </FinanceDialog>
  )
}

function Settlements() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [pay, setPay] = useState<SupplierSettlement | null>(null)
  return (
    <>
      <Panel flush>
        {d.settlements.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Mutabakat yok.', 'No settlements.')}</p> : (
          <ul className="divide-y divide-line-soft">
            {d.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                <span>{d.suppliers.find((x) => x.id === s.supplierId)?.name}<span className="block text-[12.5px] text-ink-2">{d.engagements.find((e) => e.id === s.engagementId)?.no}{s.paidAt ? ` · ${f.date(s.paidAt)} · ${s.paymentRef}` : ''}</span></span>
                <span className="flex items-center gap-3"><span className="tnum font-medium">{fmt(s.payable.minor, s.payable.cur)}</span><span className={s.status === 'paid' ? 'text-ok' : 'text-hold'}>{s.status === 'paid' ? L('Ödendi', 'Paid') : L('Açık', 'Open')}</span>{s.status === 'open' && can('finance:apply') && <button type="button" className={btnSmall} onClick={() => setPay(s)}>{L('Ödendi kaydet', 'Record payment')}</button>}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {pay && <PayDialog s={pay} onClose={() => setPay(null)} />}
    </>
  )
}

function PayDialog({ s, onClose }: { s: SupplierSettlement; onClose: () => void }) {
  const [ref, setRef] = useState('')
  return (
    <FinanceDialog title={L('Tedarikçi ödemesi', 'Supplier payment')} description={L('Ödeme kaydı tutulur; banka işlemi yapılmaz. Tedarikçi borcu bu kayıtla kapanır.', 'The payment is recorded; no bank transaction is made. The supplier payable closes with this record.')} confirm={L('Kaydet', 'Record')} onClose={onClose} summary={[[L('Tutar', 'Amount'), fmt(s.payable.minor, s.payable.cur)]]}
      onSubmit={() => { const x = runAction((st) => paySettlement(st, s.id, ref), L('Tedarikçi ödemesi kaydedildi.', 'Supplier payment recorded.')); if (!x.ok) return x.error; onClose() }}>
      <TextF id="sp-r" label={L('Ödeme referansı', 'Payment reference')} required value={ref} onChange={setRef} />
    </FinanceDialog>
  )
}

function SupplierDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('BA')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState('')
  return (
    <FinanceDialog title={L('Yeni tedarikçi', 'New supplier')} description={L('Tedarikçi kaydı yalnız bilgi içerir; entegrasyon veya otomatik istek yoktur.', 'A supplier record holds information only; there is no integration or automatic request.')} confirm={L('Oluştur', 'Create')} onClose={onClose}
      onSubmit={() => { const x = runAction((s) => createSupplier(s, { name, country, contactName: contact, email, phone, terms }), L('Tedarikçi oluşturuldu.', 'Supplier created.')); if (!x.ok) return x.error; onClose() }}>
      <TextF id="su-n" label={L('Ad', 'Name')} required value={name} onChange={setName} />
      <div className="grid gap-4 sm:grid-cols-2"><TextF id="su-c" label={L('Ülke (ISO)', 'Country (ISO)')} value={country} onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))} /><TextF id="su-k" label={L('Kişi', 'Contact')} value={contact} onChange={setContact} /><TextF id="su-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} /><TextF id="su-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} /></div>
      <AreaF id="su-t" label={L('Koşullar', 'Terms')} value={terms} onChange={setTerms} rows={2} />
    </FinanceDialog>
  )
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const today = dayOf(d.clock.now, d.settings.company.tz)
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [branch, setBranch] = useState(active[0] ?? d.branches[0]!.id)
  const [from, setFrom] = useState(zonedIso(addDaysYmd(today, 5), '10:00', f.zone(active[0])))
  const [to, setTo] = useState(zonedIso(addDaysYmd(today, 12), '10:00', f.zone(active[0])))
  const [reason, setReason] = useState('')
  return (
    <FinanceDialog title={L('Araç talebi', 'Sourcing request')} description={L('Kapasite yetmediğinde dış tedarikçiden araç istenir; talep tek başına araç getirmez.', 'When capacity falls short a vehicle is requested from an outside supplier; a request alone brings no vehicle.')} confirm={L('Talep oluştur', 'Create request')} onClose={onClose}
      onSubmit={() => { const x = runAction((s) => createSourcingRequest(s, { classId: cls, from, to, branchId: branch, reason }), L('Araç talebi oluşturuldu.', 'Sourcing request created.')); if (!x.ok) return x.error; onClose() }}>
      <div className="grid gap-4 sm:grid-cols-2"><SelectF id="rq-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} /><SelectF id="rq-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d, active)} /><DateTimeF id="rq-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={f.zone(branch)} /><DateTimeF id="rq-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={f.zone(branch)} /></div>
      <AreaF id="rq-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} rows={2} />
    </FinanceDialog>
  )
}
