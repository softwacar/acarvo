import { Plus } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { customerDocChecks } from '../../core/calc/policy'
import { fmt } from '../../core/money'
import { addWaitlist, convertWaitlist, setWaitlistStatus } from '../../core/ops/commercial'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Reservation } from '../../core/types'
import { L } from '../../i18n'
import { ComboF, DateTimeF, SelectF, TextF, branchOptions, classOptions } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Empty, FilterBar, FilterSelect, FinanceDialog, Kpis, Page, SearchBox, Status, Tabs } from '../../ui/kit'
import { DataTable, type Col, downloadCsv } from '../../ui/table'
import { CustomerLink, VehicleCell } from '../../ui/domain'
import { CHANNEL_LABEL, STATUS } from '../../ui/status'

export function ReservationsPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const { active } = useBranchScope()
  const [tab, setTab] = useUrlState('sekme', 'liste')
  const [q, setQ] = useUrlState('q')
  const [state, setState] = useUrlState('durum', 'all')
  const [assign, setAssign] = useUrlState('atama', 'all')
  const [channel, setChannel] = useUrlState('kanal', 'all')
  const [branch, setBranch] = useUrlState('sube', 'all')
  const channels = CHANNEL_LABEL()
  const now = d.clock.now

  const rows = useMemo(
    () =>
      d.reservations
        .filter((r) => active.includes(r.pickupBranchId) || active.includes(r.returnBranchId))
        .filter((r) => (state === 'all' ? true : r.status === state))
        .filter((r) => (assign === 'all' ? true : assign === 'class' ? !r.vehicleId : !!r.vehicleId))
        .filter((r) => (channel === 'all' ? true : r.channel === channel))
        .filter((r) => (branch === 'all' ? true : r.pickupBranchId === branch))
        .filter((r) => {
          if (!q) return true
          const c = d.customers.find((x) => x.id === r.customerId)
          const v = d.vehicles.find((x) => x.id === r.vehicleId)
          return `${r.no} ${c?.name} ${v?.plate}`.toLowerCase().includes(q.toLowerCase())
        })
        .sort((a, b) => b.pickupAt.localeCompare(a.pickupAt)),
    [d, active, state, assign, channel, branch, q],
  )
  const pending = d.reservations.filter((r) => r.status === 'pending').length
  const confirmedFuture = d.reservations.filter((r) => r.status === 'confirmed' && Date.parse(r.pickupAt) >= Date.parse(now)).length
  const classOnly = d.reservations.filter((r) => r.status === 'confirmed' && !r.vehicleId).length
  const noShow = d.reservations.filter((r) => r.status === 'no_show').length

  const advanceOf = (r: Reservation) => d.payments.filter((p) => (p.reservationId === r.id || p.rentalId === r.rentalId) && p.kind === 'advance' && p.status !== 'voided')
  const docState = (r: Reservation) => {
    const c = d.customers.find((x) => x.id === r.customerId)
    if (!c) return 'missing'
    const chk = customerDocChecks(d, c, now, r.returnAt)
    return chk.some((x) => x.state === 'missing') ? 'missing' : chk.some((x) => x.state === 'expired') ? 'expired' : chk.some((x) => x.state === 'expiring') ? 'expiring' : 'valid'
  }

  const cols: Col<Reservation>[] = [
    { id: 'no', header: L('Rezervasyon', 'Reservation'), cell: (r) => <Link to={`/rezervasyonlar/${r.id}` as never} className="font-medium text-blue hover:underline tnum">{r.no}</Link>, sort: (r) => r.no, csv: (r) => r.no },
    { id: 'cust', header: L('Müşteri', 'Customer'), cell: (r) => <CustomerLink c={d.customers.find((c) => c.id === r.customerId)} />, sort: (r) => d.customers.find((c) => c.id === r.customerId)?.name, csv: (r) => d.customers.find((c) => c.id === r.customerId)?.name ?? '' },
    { id: 'when', header: L('Teslim → iade', 'Pickup → return'), cell: (r) => <span className="tnum text-[13px]">{f.dt(r.pickupAt, r.pickupBranchId)} → {f.date(r.returnAt, r.returnBranchId)}<span className="ml-1.5 text-ink-3">{d.branches.find((b) => b.id === r.pickupBranchId)?.code}</span></span>, sort: (r) => r.pickupAt, csv: (r) => r.pickupAt },
    { id: 'veh', header: L('Araç / sınıf', 'Vehicle / class'), cell: (r) => (r.vehicleId ? <VehicleCell v={d.vehicles.find((v) => v.id === r.vehicleId)!} sub={false} /> : <span className="text-[12.5px] text-hold">{d.classes.find((c) => c.id === r.classId)?.name} · {L('araç atanmadı', 'no vehicle')}</span>), hideBelow: 'md' },
    { id: 'price', header: L('Fiyat', 'Price'), align: 'right', cell: (r) => (r.price ? <span className="tnum">{fmt(r.price.grossMinor, r.price.cur)}</span> : '—'), sort: (r) => r.price?.grossMinor, hideBelow: 'lg', csv: (r) => (r.price ? r.price.grossMinor : '') },
    { id: 'adv', header: L('Kaparo', 'Advance'), cell: (r) => { const a = advanceOf(r); return a.length ? <span className="tnum text-[13px]">{a.map((p) => fmt(p.tender.minor, p.tender.cur)).join(' + ')}</span> : <span className="text-ink-3">—</span> }, hideBelow: 'lg' },
    { id: 'doc', header: L('Belge', 'Docs'), cell: (r) => (r.status === 'converted' || r.status === 'cancelled' ? '' : <Status kind="doc" value={docState(r)} />), hideBelow: 'lg' },
    { id: 'ch', header: L('Kanal', 'Channel'), cell: (r) => channels[r.channel], hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (r) => <Status kind="reservation" value={r.status} />, sort: (r) => r.status, csv: (r) => r.status },
  ]
  const reset = () => {
    setQ('')
    setState('all')
    setAssign('all')
    setChannel('all')
    setBranch('all')
  }
  const on = q !== '' || state !== 'all' || assign !== 'all' || channel !== 'all' || branch !== 'all'

  return (
    <Page
      title={L('Rezervasyonlar', 'Reservations')}
      description={L('Pending, Confirmed ve Converted ayrı durumlardır. Yalnız sınıf rezervasyonu belirli bir araç tutmaz; Pending kapasite tutmaz.', 'Pending, Confirmed and Converted are separate states. A class-only reservation holds no specific vehicle; Pending holds no capacity.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('rezervasyonlar', cols, rows)}>CSV</button>
          {can('reservations:manage') && (
            <Link to={'/rezervasyonlar/yeni' as never} className={btnPrimary}>
              <Plus size={16} /> {L('Yeni rezervasyon', 'New reservation')}
            </Link>
          )}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Bekleyen', 'Pending'), value: pending, hint: L('Onay bekliyor; kapasite tutmaz', 'Awaiting confirmation; holds nothing'), tone: pending ? 'hold' : undefined, to: '/rezervasyonlar?durum=pending' },
          { label: L('Onaylı (yaklaşan)', 'Confirmed (upcoming)'), value: confirmedFuture, to: '/rezervasyonlar?durum=confirmed' },
          { label: L('Yalnız sınıf (onaylı)', 'Class-only (confirmed)'), value: classOnly, hint: L('Araç atanmalı', 'Needs a vehicle'), tone: classOnly ? 'hold' : undefined, to: '/rezervasyonlar?durum=confirmed&atama=class' },
          { label: L('Bekleme listesi', 'Waitlist'), value: d.waitlist.filter((w) => w.status === 'waiting').length, to: '/rezervasyonlar?sekme=bekleme' },
          { label: L('Gelmedi', 'No-show'), value: noShow },
        ]}
      />
      <Tabs tabs={[{ id: 'liste', label: L('Rezervasyonlar', 'Reservations') }, { id: 'bekleme', label: L('Bekleme listesi', 'Waitlist'), count: d.waitlist.filter((w) => w.status === 'waiting').length }]} value={tab as 'liste' | 'bekleme'} onChange={setTab} label={L('Rezervasyon görünümleri', 'Reservation views')} />
      {tab === 'bekleme' ? (
        <Waitlist />
      ) : (
        <>
          <FilterBar onReset={reset} active={on}>
            <SearchBox label={L('Rezervasyonlarda ara', 'Search reservations')} placeholder={L('No, müşteri, plaka…', 'No, customer, plate…')} value={q} onChange={setQ} />
            <FilterSelect label={L('Durum', 'Status')} value={state} onChange={setState} options={[{ id: 'all', label: L('Tüm durumlar', 'All statuses') }, ...Object.keys(STATUS.reservation!).map((k) => ({ id: k, label: STATUS.reservation![k]!().label }))]} />
            <FilterSelect label={L('Atama', 'Assignment')} value={assign} onChange={setAssign} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: 'class', label: L('Yalnız sınıf', 'Class-only') }, { id: 'vehicle', label: L('Araç atanmış', 'Vehicle assigned') }]} />
            <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
            <FilterSelect label={L('Kanal', 'Channel')} value={channel} onChange={setChannel} options={[{ id: 'all', label: L('Tüm kanallar', 'All channels') }, ...Object.entries(channels).map(([id, label]) => ({ id, label }))]} />
          </FilterBar>
          <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} label={L('Rezervasyon listesi', 'Reservation list')} urlKey="rez" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(r) => void navigate({ to: `/rezervasyonlar/${r.id}` as never })} empty={<Empty title={L('Bu filtrelerle rezervasyon yok', 'No reservations match')} />} />
        </>
      )}
    </Page>
  )
}

function Waitlist() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const rows = d.waitlist.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {can('reservations:manage') && (
          <button type="button" className={btnSecondary} onClick={() => setAdding(true)}>
            <Plus size={15} /> {L('Bekleme listesine ekle', 'Add to waitlist')}
          </button>
        )}
      </div>
      <DataTable
        rows={rows}
        rowKey={(w) => w.id}
        label={L('Bekleme listesi', 'Waitlist')}
        empty={<Empty title={L('Bekleme listesi boş', 'Waitlist is empty')} />}
        cols={[
          { id: 'c', header: L('Müşteri', 'Customer'), cell: (w) => <CustomerLink c={d.customers.find((c) => c.id === w.customerId)} /> },
          { id: 'cl', header: L('Sınıf', 'Class'), cell: (w) => d.classes.find((c) => c.id === w.classId)?.name },
          { id: 'b', header: L('Şube', 'Branch'), cell: (w) => d.branches.find((b) => b.id === w.branchId)?.code, hideBelow: 'md' },
          { id: 'w', header: L('Aralık', 'Window'), cell: (w) => <span className="tnum text-[13px]">{f.dt(w.from, w.branchId)} → {f.date(w.to, w.branchId)}</span> },
          { id: 'st', header: L('Durum', 'Status'), cell: (w) => <Status kind="waitlist" value={w.status} /> },
          {
            id: 'a',
            header: '',
            cell: (w) =>
              can('reservations:manage') && (w.status === 'waiting' || w.status === 'offered') ? (
                <span className="flex flex-wrap justify-end gap-1.5">
                  {w.status === 'waiting' && <button type="button" className={btnSmall} onClick={() => runAction((x) => setWaitlistStatus(x, w.id, 'offered'), L('Müşteriye teklif edildi olarak işaretlendi (mesaj gönderilmedi).', 'Marked as offered (no message was sent).'))}>{L('Teklif edildi', 'Offered')}</button>}
                  <button type="button" className={btnSmall} onClick={() => { const r = runAction((x) => convertWaitlist(x, w.id), L('Rezervasyon oluşturuldu (bekliyor).', 'Reservation created (pending).')); if (r.ok) void navigate({ to: `/rezervasyonlar/${r.value}` as never }); }}>{L('Rezervasyona dönüştür', 'Convert')}</button>
                  <button type="button" className={btnSmall} onClick={() => runAction((x) => setWaitlistStatus(x, w.id, 'expired'))}>{L('Süresi doldu', 'Expire')}</button>
                </span>
              ) : null,
            align: 'right',
          },
        ]}
      />
      {adding && <WaitlistDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

function WaitlistDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone()
  const [customer, setCustomer] = useState('')
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [branch, setBranch] = useState(d.branches[0]!.id)
  const [from, setFrom] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 2), '10:00', tz))
  const [to, setTo] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 5), '10:00', tz))
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Bekleme listesine ekle', 'Add to waitlist')}
      description={L('Kapasite açılırsa müşteriye elle haber verilir; mesaj otomatik gönderilmez.', 'If capacity opens up, a person informs the customer; no message is sent automatically.')}
      confirm={L('Ekle', 'Add')}
      onClose={onClose}
      onSubmit={() => {
        if (!customer) {
          setFields({ customer: L('Müşteri seçin', 'Choose a customer') })
          return L('Müşteri seçin.', 'Choose a customer.')
        }
        const r = runAction((x) => addWaitlist(x, { customerId: customer, classId: cls, branchId: branch, from, to, note }), L('Bekleme listesine eklendi (demo).', 'Added to the waitlist (demo).'))
        if (!r.ok) return r.error
        onClose()
      }}
    >
      <ComboF id="wl-c" label={L('Müşteri', 'Customer')} required items={d.customers.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.name, sub: c.no }))} value={customer} onChange={setCustomer} error={fields.customer} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="wl-cl" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
        <SelectF id="wl-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d)} />
        <DateTimeF id="wl-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={tz} />
        <DateTimeF id="wl-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={tz} />
      </div>
      <TextF id="wl-n" label={L('Not', 'Note')} value={note} onChange={setNote} />
    </FinanceDialog>
  )
}
