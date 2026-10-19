import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { checkVehicleAvailable } from '../../core/calc/availability'
import { customerDocChecks, evaluateDriverEligibility } from '../../core/calc/policy'
import { fmt } from '../../core/money'
import { assignVehicle, cancelReservation, confirmReservation, convertReservation, markNoShow } from '../../core/ops/rentals'
import { forfeitAdvance } from '../../core/ops/finance'
import type { Payment, Reservation } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, SelectF } from '../../ui/forms'
import { CustomerLink, PriceBreakdown, VehicleCell } from '../../ui/domain'
import { runAction, useCan, useDb, useFmt } from '../../ui/hooks'
import { AdvanceStatus, BackLink, btnPrimary, btnSecondary, Empty, Facts, FinanceDialog, Link2, Notice, Page, Panel, Status, Tabs, Timeline } from '../../ui/kit'
import { CHANNEL_LABEL, METHOD_LABEL } from '../../ui/status'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { PaymentDialog } from '../shared/PaymentDialog'

export function Reservation360Page() {
  const { id } = useParams({ strict: false }) as { id: string }
  const d = useDb()
  const r = d.reservations.find((x) => x.id === id)
  if (!r)
    return (
      <div className="space-y-4">
        <BackLink to="/rezervasyonlar" label={L('Rezervasyonlar', 'Reservations')} />
        <Empty title={L('Rezervasyon bulunamadı', 'Reservation not found')} action={<Link to={'/rezervasyonlar' as never} className={btnSecondary}>{L('Listeye dön', 'Back to list')}</Link>} />
      </div>
    )
  return <Detail r={r} />
}

type Dlg = null | 'assign' | 'cancel' | 'advance' | 'noshow'
type AdvAct = null | { kind: 'refund' | 'forfeit'; p: Payment }

function Detail({ r }: { r: Reservation }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'ozet' | 'kaparo' | 'gecmis'>('ozet')
  const [dlg, setDlg] = useState<Dlg>(null)
  const [advAct, setAdvAct] = useState<AdvAct>(null)
  const [error, setError] = useState<string | null>(null)
  const channels = CHANNEL_LABEL()
  const customer = d.customers.find((c) => c.id === r.customerId)
  const vehicle = d.vehicles.find((v) => v.id === r.vehicleId)
  const cls = d.classes.find((c) => c.id === r.classId)
  const corp = d.corporates.find((c) => c.id === r.corporateId)
  const ins = d.insurance.find((p) => p.id === r.insuranceId)
  const rental = d.rentals.find((x) => x.id === r.rentalId)
  const open = r.status === 'pending' || r.status === 'confirmed'
  const advances = d.payments.filter((p) => (p.reservationId === r.id || (r.rentalId && p.rentalId === r.rentalId)) && p.kind === 'advance')

  const act = (fn: Parameters<typeof runAction<unknown>>[0], msg: string) => {
    const x = runAction(fn, msg)
    setError(x.ok ? null : x.error)
    return x
  }

  const driverRows = r.drivers.map((x) => {
    const c = d.customers.find((y) => y.id === x.customerId)
    const e = c ? evaluateDriverEligibility(d, c, r.pickupAt, r.returnAt) : null
    const docs = c ? customerDocChecks(d, c, r.pickupAt, r.returnAt) : []
    return { x, c, e, docs }
  })
  const vehicleOk = vehicle ? checkVehicleAvailable(d, vehicle, r.pickupAt, r.returnAt, d.clock.now, { reservationId: r.id }) : null

  return (
    <div className="space-y-4">
      <BackLink to="/rezervasyonlar" label={L('Rezervasyonlar', 'Reservations')} />
      <Page
        title={r.no}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Status kind="reservation" value={r.status} />
            {!r.vehicleId && open && <span className="rounded border border-hold/40 bg-hold-soft px-2 py-0.5 text-[12px] font-medium text-hold">{L('Yalnız sınıf', 'Class-only')}</span>}
            <span>{`${customer?.name ?? '—'} · ${cls?.name} · ${f.dt(r.pickupAt, r.pickupBranchId)} → ${f.dt(r.returnAt, r.returnBranchId)}`}</span>
          </span>
        }
        actions={
          <>
            {open && can('reservations:confirm') && r.status === 'pending' && (
              <button type="button" className={btnPrimary} onClick={() => act((x) => confirmReservation(x, r.id), L('Rezervasyon onaylandı.', 'Reservation confirmed.'))}>{L('Onayla', 'Confirm')}</button>
            )}
            {r.status === 'confirmed' && can('rentals:manage') && (
              <button
                type="button"
                className={btnPrimary}
                disabled={!r.vehicleId}
                title={r.vehicleId ? undefined : L('Önce araç atayın', 'Assign a vehicle first')}
                onClick={() => {
                  const x = act((s) => convertReservation(s, r.id), L('Kiralama hazırlandı; Teslim Masası kontrolleri bekliyor.', 'Rental prepared; Delivery Desk checks pending.'))
                  if (x.ok) void navigate({ to: `/kiralamalar/${(x.value as { id: string }).id}` as never })
                }}
              >
                {L('Kiralamaya dönüştür', 'Convert to rental')}
              </button>
            )}
            {open && can('reservations:manage') && <Link to={`/rezervasyonlar/${r.id}/duzenle` as never} className={btnSecondary}>{L('Düzenle', 'Edit')}</Link>}
            {open && can('reservations:manage') && <button type="button" className={btnSecondary} onClick={() => setDlg('assign')}>{r.vehicleId ? L('Aracı değiştir', 'Change vehicle') : L('Araç ata', 'Assign vehicle')}</button>}
            {open && can('finance:record') && <button type="button" className={btnSecondary} onClick={() => setDlg('advance')}>{L('Kaparo al', 'Take advance')}</button>}
            {open && can('reservations:manage') && <button type="button" className={btnSecondary} onClick={() => setDlg('cancel')}>{L('İptal et', 'Cancel')}</button>}
            {r.status === 'confirmed' && can('reservations:manage') && Date.parse(r.pickupAt) < Date.parse(d.clock.now) && <button type="button" className={btnSecondary} onClick={() => setDlg('noshow')}>{L('Gelmedi', 'No-show')}</button>}
          </>
        }
      >
        {error && <Notice tone="alert">{error}</Notice>}
        {r.status === 'converted' && rental && (
          <Notice tone="blue" action={<Link2 type="rental" id={rental.id}>{rental.no}</Link2>}>
            {L('Bu rezervasyon kiralamaya dönüştü. Teslim ve finans artık kiralamada yönetilir.', 'This reservation became a rental. Delivery and finance are now managed on the rental.')}
          </Notice>
        )}
        {r.status === 'pending' && <Notice tone="hold">{L('Bekleyen rezervasyon kapasite veya araç tutmaz. Onaylanınca araç/kapasite kontrolü yapılır.', 'A pending reservation holds no capacity or vehicle. Confirming checks vehicle/capacity.')}</Notice>}
        {r.status === 'confirmed' && !r.vehicleId && <Notice tone="hold" action={can('reservations:manage') ? <button type="button" className={btnSecondary} onClick={() => setDlg('assign')}>{L('Araç ata', 'Assign vehicle')}</button> : undefined}>{L('Yalnız sınıf rezervasyonu: belirli bir araç yok. Kiralamaya dönüştürmek için önce araç atanmalı.', 'Class-only reservation: no specific vehicle. Assign a vehicle before converting to a rental.')}</Notice>}
        {r.status === 'cancelled' && <Notice tone="alert">{L('İptal edildi', 'Cancelled')}: {r.cancelReason}</Notice>}

        <Tabs tabs={[{ id: 'ozet', label: L('Özet', 'Overview') }, { id: 'kaparo', label: L('Kaparo', 'Advance'), count: advances.length }, { id: 'gecmis', label: L('Geçmiş', 'History'), count: r.history.length }]} value={tab} onChange={setTab} label={L('Rezervasyon bölümleri', 'Reservation sections')} />

        {tab === 'ozet' && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
            <div className="space-y-5">
              <Panel title={L('Rezervasyon', 'Reservation')}>
                <Facts
                  rows={[
                    [L('Müşteri', 'Customer'), <CustomerLink key="c" c={customer} />],
                    [L('Kurumsal hesap', 'Corporate'), corp ? <Link2 key="k" type="corporate" id={corp.id}>{corp.name}</Link2> : L('Bireysel', 'Individual')],
                    [L('Sınıf', 'Class'), cls?.name],
                    [L('Araç', 'Vehicle'), vehicle ? <VehicleCell key="v" v={vehicle} /> : <span key="v" className="text-hold">{L('Atanmadı', 'Not assigned')}</span>],
                    [L('Teslim', 'Pickup'), `${f.dt(r.pickupAt, r.pickupBranchId)} · ${d.branches.find((b) => b.id === r.pickupBranchId)?.name}`],
                    [L('İade', 'Return'), `${f.dt(r.returnAt, r.returnBranchId)} · ${d.branches.find((b) => b.id === r.returnBranchId)?.name}`],
                    [L('Sigorta', 'Coverage'), ins ? ins.name : L('Paket yok', 'None')],
                    [L('Ekstralar', 'Extras'), r.extras.length ? r.extras.map((e) => `${d.extras.find((x) => x.id === e.extraId)?.name} × ${e.qty}`).join(', ') : '—'],
                    [L('Kanal', 'Channel'), channels[r.channel]],
                    [L('Not', 'Note'), r.notes || '—'],
                  ]}
                />
              </Panel>
              <Panel title={L('Sürücüler ve belgeler', 'Drivers and documents')} description={L('Kontroller kiralama süresine göre yapılır.', 'Checks are made against the rental period.')}>
                <ul className="divide-y divide-line-soft">
                  {driverRows.map(({ x, c, e, docs }) => (
                    <li key={x.customerId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                      <span>
                        <CustomerLink c={c} /> {x.primary && <span className="ml-1 text-[12px] text-ink-2">({L('asıl', 'primary')})</span>}
                        <span className="mt-0.5 block text-[12.5px] text-ink-2">{e?.ok ? L('Sürücü kuralları ve belgeler uygun', 'Driver rules and documents OK') : [...(e?.reasons ?? []), ...(e?.docReasons ?? [])].join(' ')}</span>
                      </span>
                      <span className="flex gap-1.5">{docs.map((dc) => <Status key={dc.kind} kind="doc" value={dc.state} />)}</span>
                    </li>
                  ))}
                </ul>
                {vehicleOk && !vehicleOk.ok && open && <Notice tone="alert">{L('Atanan araç artık uygun değil', 'Assigned vehicle is no longer available')}: {vehicleOk.conflicts.map((c) => c.label).join(', ')}</Notice>}
              </Panel>
            </div>
            <Panel title={L('Fiyat', 'Price')} description={r.price ? L('Kaydedildiği anda dondurulmuş fiyat sürümü', 'Price version frozen when saved') : undefined}>
              <PriceBreakdown price={r.price} />
            </Panel>
          </div>
        )}

        {tab === 'kaparo' && (
          <Panel title={L('Kaparo', 'Advance')} description={L("Kaparo (avans) gelir değildir; rezervasyon kiralamaya dönüşünce aktarılır, Teslim'de hesap kalemine bir kez uygulanır. Depozito ve ödeme ile karıştırılmaz.", 'An advance is not revenue; it moves to the rental when the reservation is converted and is applied to the charge once at delivery. It is not a deposit and not an ordinary payment.')} action={open && can('finance:record') ? <button type="button" className={btnPrimary} onClick={() => setDlg('advance')}>{L('Kaparo al', 'Take advance')}</button> : undefined}>
            {advances.length === 0 ? (
              <Empty title={L('Kaparo kaydı yok', 'No advance recorded')} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {advances.map((p) => {
                  const refunds = d.refunds.filter((x) => x.paymentId === p.id)
                  const openRefund = refunds.find((x) => x.status === 'requested' || x.status === 'approved')
                  const held = p.status === 'recorded'
                  const closed = r.status === 'cancelled' || r.status === 'no_show'
                  return (
                    <li key={p.id} className="space-y-2 py-3 text-[13.5px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="tnum font-medium">{p.no}</span> · {fmt(p.tender.minor, p.tender.cur)}
                          <span className="block text-[12.5px] text-ink-2">{f.dt(p.recordedAt, p.branchId)} · {METHOD_LABEL()[p.method]}{p.tender.cur !== p.obligationCur ? ` · ${L('eşdeğer', 'equiv.')} ${fmt(p.appliedMinor, p.obligationCur)}` : ''}</span>
                        </span>
                        <AdvanceStatus p={p} />
                      </div>
                      <p className="text-[12.5px] text-ink-2">
                        {p.advanceState === 'unapplied' && L('Rezervasyonda tutuluyor; henüz hiçbir hesap kalemine uygulanmadı.', 'Held on the reservation; not applied to any charge yet.')}
                        {p.advanceState === 'transferred' && L("Kiralamaya aktarıldı; Teslim'de oluşan kiralama bedeline bir kez uygulanacak.", 'Moved to the rental; it is applied once to the rental charge that arises at delivery.')}
                        {p.advanceState === 'applied' && L(`Kiralama bedeline uygulandı (${fmt(p.appliedMinor, p.obligationCur)}).`, `Applied to the rental charge (${fmt(p.appliedMinor, p.obligationCur)}).`)}
                        {p.advanceState === 'refunded' && L('Müşteriye iade edildi; hiçbir hesap kalemine uygulanmaz.', 'Paid back to the customer; it will not be applied to any charge.')}
                        {p.advanceState === 'forfeited' && L(`Politika bedeli olarak tutuldu: ${p.forfeitReason ?? ''}`, `Kept as a policy fee: ${p.forfeitReason ?? ''}`)}
                      </p>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                        {rental && <Link2 type="rental" id={rental.id}>{L('Kiralama', 'Rental')} {rental.no}</Link2>}
                        {rental && <Link to={`/kiralamalar/${rental.id}?sekme=finans` as never} className="font-medium text-blue hover:underline">{L('Kiralama finansı', 'Rental finance')}</Link>}
                        <Link to={'/finans?sekme=kaparo' as never} className="font-medium text-blue hover:underline">{L('Finans Merkezi · Kaparo', 'Finance Center · Advances')}</Link>
                      </p>
                      {refunds.map((x) => (
                        <p key={x.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                          {L('İade', 'Refund')} {x.no} <Status kind="refund" value={x.status} />
                        </p>
                      ))}
                      {held && !openRefund && (
                        <div className="flex flex-wrap gap-2">
                          {can('approvals:request') && <button type="button" className={btnSecondary} onClick={() => setAdvAct({ kind: 'refund', p })}>{L('İade talep et', 'Request refund')}</button>}
                          {closed && p.advanceState === 'unapplied' && can('finance:apply') && <button type="button" className={btnSecondary} onClick={() => setAdvAct({ kind: 'forfeit', p })}>{L('Politika bedeli olarak tut', 'Keep as policy fee')}</button>}
                        </div>
                      )}
                      {openRefund && <p className="text-[12.5px] font-medium text-hold">{L("Açık iade talebi var: Onay Merkezi'nde ikinci yetkili karar verir.", 'A refund request is open: a second authorised person decides in the Approval Center.')}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        )}

        {tab === 'gecmis' && (
          <Panel title={L('Geçmiş', 'History')}>
            <Timeline entries={r.history} />
          </Panel>
        )}
      </Page>

      {advAct?.kind === 'refund' && <ApprovalRequestDialog type="refund" target={{ type: 'reservation', id: r.id }} paymentId={advAct.p.id} amount={advAct.p.tender} onClose={() => setAdvAct(null)} hint={L(`${advAct.p.no} kaparosu tahsil edilen tutarın tamamı kadar iade edilir.`, `Advance ${advAct.p.no} is paid back in full, in the amount that was taken.`)} />}
      {advAct?.kind === 'forfeit' && <ForfeitDialog p={advAct.p} onClose={() => setAdvAct(null)} />}
      {dlg === 'advance' && <PaymentDialog reservationId={r.id} kind="advance" onClose={() => setDlg(null)} />}
      {dlg === 'assign' && <AssignDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'cancel' && <CancelDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'noshow' && (
        <FinanceDialog
          title={L('Gelmedi olarak işaretle', 'Mark as no-show')}
          description={L('Araç tahsisi serbest kalır. Alınan kaparo otomatik gelir sayılmaz; iade veya mahsup için Onay Merkezi kullanılır.', 'The vehicle hold is released. A taken advance does not become revenue automatically; use the Approval Center for refund or offset.')}
          confirm={L('Gelmedi', 'No-show')}
          danger
          onClose={() => setDlg(null)}
          onSubmit={() => {
            const x = runAction((s) => markNoShow(s, r.id), L('Gelmedi olarak işaretlendi.', 'Marked as no-show.'))
            if (!x.ok) return x.error
            setDlg(null)
          }}
        />
      )}
    </div>
  )
}

function AssignDialog({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const d = useDb()
  const [vehicleId, setVehicleId] = useState(r.vehicleId ?? '')
  const choices = d.vehicles
    .filter((v) => v.classId === r.classId && v.status !== 'sold')
    .map((v) => ({ v, res: checkVehicleAvailable(d, v, r.pickupAt, r.returnAt, d.clock.now, { reservationId: r.id }) }))
    .sort((a, b) => Number(b.res.ok) - Number(a.res.ok))
  return (
    <FinanceDialog
      title={r.vehicleId ? L('Aracı değiştir', 'Change vehicle') : L('Araç ata', 'Assign vehicle')}
      description={L('Yalnız sınıf rezervasyonu belirli bir araca bağlanır. Müsait olmayan araçlar nedeniyle birlikte gösterilir.', 'A class-only reservation is tied to a specific vehicle. Unavailable vehicles are shown with their reason.')}
      confirm={L('Ata', 'Assign')}
      onClose={onClose}
      onSubmit={() => {
        if (!vehicleId) return L('Araç seçin.', 'Choose a vehicle.')
        const x = runAction((s) => assignVehicle(s, r.id, vehicleId), L('Araç atandı.', 'Vehicle assigned.'))
        if (!x.ok) return x.error
        onClose()
      }}
    >
      <SelectF id="as-v" label={L('Araç', 'Vehicle')} value={vehicleId} onChange={setVehicleId} placeholder={L('Araç seçin', 'Choose a vehicle')} options={choices.map(({ v, res }) => ({ id: v.id, label: `${v.plate} · ${v.make} ${v.model}${res.ok ? '' : ` — ${L('uygun değil', 'unavailable')}: ${res.conflicts.map((c) => c.label).join(', ')}`}`, disabled: !res.ok }))} />
    </FinanceDialog>
  )
}

function CancelDialog({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const d = useDb()
  const held = d.payments.filter((p) => p.reservationId === r.id && p.kind === 'advance' && p.status === 'recorded')
  return (
    <FinanceDialog
      title={L('Rezervasyonu iptal et', 'Cancel reservation')}
      description={L('İptal gerekçesi kayıt altına alınır. Alınmış kaparo otomatik iade edilmez ve gelir olmaz.', 'The reason is recorded. A taken advance is not refunded automatically and does not become revenue.')}
      confirm={L('İptal et', 'Cancel reservation')}
      danger
      onClose={onClose}
      summary={held.length ? [[L('Tutulan kaparo', 'Held advance'), held.map((p) => fmt(p.tender.minor, p.tender.cur)).join(' + ')]] : undefined}
      onSubmit={() => {
        const x = runAction((s) => cancelReservation(s, r.id, reason), L('Rezervasyon iptal edildi.', 'Reservation cancelled.'))
        if (!x.ok) {
          setErr(x.fields.reason)
          return x.error
        }
        onClose()
      }}
    >
      <AreaF id="cx-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={err} rows={3} />
    </FinanceDialog>
  )
}

function ForfeitDialog({ p, onClose }: { p: Payment; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  return (
    <FinanceDialog
      title={L('Kaparoyu politika bedeli olarak tut', 'Keep the advance as a policy fee')}
      description={L('Yalnız iptal veya gelmeme sonrası, açık bir gerekçeyle. Tutar iade edilmez ve hiçbir hesap kalemine uygulanmaz; karar kayıt altına alınır.', 'Only after a cancellation or no-show, with a visible reason. The amount is not refunded and is never applied to a charge; the decision is recorded.')}
      confirm={L('Politika bedeli olarak tut', 'Keep as policy fee')}
      danger
      onClose={onClose}
      summary={[[L('Kaparo', 'Advance'), `${p.no} · ${fmt(p.tender.minor, p.tender.cur)}`]]}
      onSubmit={() => {
        const x = runAction((s) => forfeitAdvance(s, p.id, reason), L('Kaparo politika bedeli olarak tutuldu.', 'The advance was kept as a policy fee.'))
        if (!x.ok) {
          setErr(x.fields.reason)
          return x.error
        }
        onClose()
      }}
    >
      <AreaF id="ff-r" label={L('Gerekçe (en az 10 karakter)', 'Reason (at least 10 characters)')} required value={reason} onChange={setReason} error={err} rows={3} />
    </FinanceDialog>
  )
}
