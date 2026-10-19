import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { fmt, parseAmount, sumByCur } from '../../core/money'
import { assignFine, chargeFineToCustomer, closeFine, createFine, payFineToAuthority, setFineDispute } from '../../core/ops/fleet'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Fine } from '../../core/types'
import { L } from '../../i18n'
import { ComboF, DateF, DateTimeF, MoneyF, SelectF, TextF } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Page, SearchBox, Status, Timeline } from '../../ui/kit'
import { VehicleCell } from '../../ui/domain'
import { STATUS } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { vehicleItems } from '../shared/FleetDialogs'
import { ActBtn, ActionRow, byCurText, DrawerSection, RecordDrawer, useAct } from './common'

export function FinesPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const vOf = (x: Fine) => d.vehicles.find((v) => v.id === x.vehicleId)!
  const scoped = d.fines.filter((x) => active.includes(vOf(x).homeBranchId))
  const rows = scoped
    .filter((x) => (status === 'all' ? true : x.status === status))
    .filter((x) => !q || `${x.no} ${x.authorityRef} ${vOf(x).plate} ${x.authority}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const openFines = scoped.filter((x) => x.status !== 'closed')
  const unpaid = openFines.filter((x) => !x.authorityPaidAt)
  const cols: Col<Fine>[] = [
    { id: 'no', header: L('Kayıt', 'Record'), cell: (x) => <span className="tnum whitespace-nowrap font-medium text-blue">{x.no}</span>, sort: (x) => x.no, csv: (x) => x.no },
    { id: 'ref', header: L('Resmî referans', 'Official reference'), cell: (x) => <span className="tnum">{x.authorityRef}</span>, hideBelow: 'md', csv: (x) => x.authorityRef },
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (x) => <VehicleCell v={vOf(x)} sub={false} />, csv: (x) => vOf(x).plate },
    { id: 'when', header: L('Tarih', 'Date'), cell: (x) => <span className="tnum">{f.date(x.occurredAt, vOf(x).homeBranchId)}</span>, sort: (x) => x.occurredAt, hideBelow: 'lg', csv: (x) => x.occurredAt },
    { id: 'rental', header: L('Kiralama', 'Rental'), cell: (x) => (x.rentalId ? <Link2 type="rental" id={x.rentalId}>{d.rentals.find((r) => r.id === x.rentalId)?.no}</Link2> : x.suggestedRentalId ? <span className="text-hold">{L('Öneri var', 'Suggested')}</span> : <span className="text-ink-3">—</span>), hideBelow: 'md' },
    { id: 'amt', header: L('Tutar', 'Amount'), align: 'right', cell: (x) => <span className="tnum">{fmt(x.amount.minor, x.amount.cur)}</span>, csv: (x) => x.amount.minor },
    { id: 'st', header: L('Durum', 'Status'), cell: (x) => <Status kind="fine" value={x.status} />, sort: (x) => x.status, csv: (x) => x.status },
  ]
  const current = d.fines.find((x) => x.id === sel)
  return (
    <Page
      title={L('Ceza Modülü', 'Fines')}
      description={L('Trafik cezasının kiralamaya atanması elle onaylanır. Müşteriden tahsil etmek ile resmî kuruma ödemek ayrı işlemlerdir.', 'Assigning a fine to a rental is confirmed by a person. Collecting from the customer and paying the authority are separate actions.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('cezalar', cols, rows)}>CSV</button>
          {can('fines:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Ceza kaydet', 'Record fine')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Açık ceza', 'Open fines'), value: openFines.length },
          { label: L('Atama bekleyen', 'Awaiting assignment'), value: openFines.filter((x) => !x.rentalId).length, tone: openFines.some((x) => !x.rentalId) ? 'hold' : undefined },
          { label: L('Otoriteye ödenmemiş', 'Unpaid to authority'), value: byCurText(sumByCur(unpaid, (x) => x.amount), fmt), hint: L('Para birimi başına', 'Per currency') },
          { label: L('İtirazda', 'Disputed'), value: openFines.filter((x) => x.dispute === 'filed').length },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setStatus('all') }} active={q !== '' || status !== 'all'}>
        <SearchBox label={L('Cezalarda ara', 'Search fines')} placeholder={L('Kayıt, referans, plaka…', 'Record, reference, plate…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.keys(STATUS.fine!).map((k) => ({ id: k, label: STATUS.fine![k]!().label }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} label={L('Ceza listesi', 'Fine list')} urlKey="cz" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(x) => setSel(x.id)} empty={<Empty title={L('Bu filtrelerle ceza yok', 'No fines match')} />} />
      {adding && <NewFineDialog onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
      {current && <Drawer x={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ x, onClose }: { x: Fine; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const v = d.vehicles.find((y) => y.id === x.vehicleId)!
  const rental = d.rentals.find((r) => r.id === x.rentalId)
  const suggested = d.rentals.find((r) => r.id === x.suggestedRentalId)
  const charge = d.charges.find((c) => c.id === x.customerChargeId)
  const expense = d.expenses.find((e) => e.id === x.expenseId)
  const manage = can('fines:manage')
  const closed = x.status === 'closed'
  const disputes = { none: L('Yok', 'None'), filed: L('İtiraz edildi', 'Filed'), accepted: L('Kabul edildi', 'Accepted'), rejected: L('Reddedildi', 'Rejected') }
  return (
    <RecordDrawer title={x.no} subtitle={`${x.authorityRef} · ${v.plate}`} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="fine" value={x.status} />],
          [L('Araç', 'Vehicle'), <Link2 key="v" type="vehicle" id={v.id}>{v.plate}</Link2>],
          [L('Kurum', 'Authority'), x.authority],
          [L('Tür', 'Type'), x.kind],
          [L('İhlal zamanı', 'Violation time'), f.dt(x.occurredAt, v.homeBranchId)],
          [L('Son ödeme', 'Due date'), x.dueDate],
          [L('Tutar', 'Amount'), fmt(x.amount.minor, x.amount.cur)],
          [L('Sorumlu kiralama', 'Responsible rental'), rental ? <Link2 key="r" type="rental" id={rental.id}>{rental.no}</Link2> : suggested ? `${L('Öneri', 'Suggestion')}: ${suggested.no} (${L('onay bekliyor', 'awaiting confirmation')})` : '—'],
          [L('Müşteri kalemi', 'Customer charge'), charge ? `${charge.no} · ${fmt(charge.amountMinor, charge.cur)}` : '—'],
          [L('Otoriteye ödeme', 'Authority payment'), x.authorityPaidAt ? `${f.date(x.authorityPaidAt)} · ${expense?.no ?? ''}` : L('Ödenmedi', 'Not paid')],
          [L('İtiraz', 'Dispute'), disputes[x.dispute]],
        ]}
      />
      {manage && !closed && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {!x.rentalId && suggested && <ActBtn onClick={() => act((s) => assignFine(s, x.id, suggested.id), L('Ceza kiralamaya atandı (elle onay).', 'Fine assigned to the rental (manual confirmation).'))}>{L(`${suggested.no} kiralamasına ata`, `Assign to ${suggested.no}`)}</ActBtn>}
            {x.rentalId && !x.customerChargeId && can('finance:record') && <ActBtn onClick={() => act((s) => chargeFineToCustomer(s, x.id), L('Müşteri kalemi yazıldı; otoriteye ödeme ayrı işlemdir.', 'Customer charge posted; paying the authority is a separate action.'))}>{L('Müşteriden tahsil kalemi yaz', 'Post customer charge')}</ActBtn>}
            {!x.authorityPaidAt && can('expenses:manage') && <ActBtn onClick={() => act((s) => payFineToAuthority(s, x.id), L('Otoriteye ödendi; şirket gideri oluştu.', 'Paid to the authority; a company expense was created.'))}>{L('Otoriteye ödendi', 'Paid to authority')}</ActBtn>}
            {x.dispute === 'none' && <ActBtn onClick={() => act((s) => setFineDispute(s, x.id, 'filed'), L('İtiraz kaydedildi.', 'Dispute recorded.'))}>{L('İtiraz et', 'File dispute')}</ActBtn>}
            {x.dispute === 'filed' && <ActBtn onClick={() => act((s) => setFineDispute(s, x.id, 'accepted'), L('İtiraz kabul edildi.', 'Dispute accepted.'))}>{L('İtiraz kabul edildi', 'Dispute accepted')}</ActBtn>}
            {x.dispute === 'filed' && <ActBtn onClick={() => act((s) => setFineDispute(s, x.id, 'rejected'), L('İtiraz reddedildi.', 'Dispute rejected.'))}>{L('İtiraz reddedildi', 'Dispute rejected')}</ActBtn>}
            <ActBtn onClick={() => act((s) => closeFine(s, x.id), L('Ceza kaydı kapandı.', 'Fine record closed.'))}>{L('Kapat', 'Close')}</ActBtn>
          </ActionRow>
          {!x.rentalId && !suggested && <p className="mt-2 text-[12.5px] text-ink-2">{L('Tarih hiçbir kiralamayla örtüşmüyor: otomatik atama yapılmaz.', 'The date overlaps no rental: nothing is assigned automatically.')}</p>}
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={x.history} /></DrawerSection>
    </RecordDrawer>
  )
}

function NewFineDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone()
  const [vid, setVid] = useState('')
  const [at, setAt] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), -2), '12:00', tz))
  const [kind, setKind] = useState('Hız ihlali')
  const [ref, setRef] = useState('')
  const [authority, setAuthority] = useState('')
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [due, setDue] = useState(addDaysYmd(dayOf(d.clock.now, tz), 20))
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Ceza kaydet', 'Record fine')}
      description={L('Aynı resmî referans iki kez girilemez. Tarih bir kiralamayla örtüşürse atama önerilir; atamayı bir kişi onaylar.', 'The same official reference cannot be entered twice. If the date overlaps a rental an assignment is suggested; a person confirms it.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const minor = parseAmount(amount, cur)
        if (minor === null) {
          setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') })
          return L('Tutar geçersiz.', 'Invalid amount.')
        }
        if (!vid) {
          setFields({ vehicle: L('Araç seçin', 'Choose a vehicle') })
          return L('Araç seçin.', 'Choose a vehicle.')
        }
        const r = runAction((s) => createFine(s, { vehicleId: vid, occurredAt: at, kind, authorityRef: ref, authority, amount: { minor, cur }, dueDate: due }), L('Ceza kaydedildi.', 'Fine recorded.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onCreated(r.value.id)
        onClose()
      }}
    >
      <ComboF id="fn-v" label={L('Araç', 'Vehicle')} required items={vehicleItems(d)} value={vid} onChange={setVid} error={fields.vehicle} />
      <DateTimeF id="fn-t" label={L('İhlal zamanı', 'Violation time')} value={at} onChange={setAt} tz={tz} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="fn-r" label={L('Resmî referans', 'Official reference')} required value={ref} onChange={setRef} error={fields.ref} />
        <TextF id="fn-a" label={L('Kurum', 'Authority')} value={authority} onChange={setAuthority} />
      </div>
      <SelectF id="fn-k" label={L('Tür', 'Type')} value={kind} onChange={setKind} options={['Hız ihlali', 'Park ihlali', 'Kırmızı ışık', 'Geçiş ücreti', 'Diğer'].map((x) => ({ id: x, label: x }))} />
      <MoneyF id="fn-m" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} error={fields.amount} />
      <DateF id="fn-d" label={L('Son ödeme tarihi', 'Due date')} value={due} onChange={setDue} />
    </FinanceDialog>
  )
}
