import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { cashByCurrency, rentalFinance } from '../../core/calc/finance'
import { tenderForObligation } from '../../core/calc/fx'
import { fmt, parseAmount, toInput } from '../../core/money'
import { recordPayment, previewPayment } from '../../core/ops/finance'
import type { Cur, Id, PaymentMethod } from '../../core/types'
import { L } from '../../i18n'
import { MoneyF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb } from '../../ui/hooks'
import { FinanceDialog, Notice } from '../../ui/kit'
import { METHOD_LABEL } from '../../ui/status'

/**
 * One collection desk for every place a payment is taken (reservation advance, rental finance, Finance center).
 * A foreign currency needs a business rate; without it the line stays a form draft ("Awaiting Rate"): nothing is
 * stored and the outstanding amount does not move. Cash needs an open drawer of that currency.
 */
export function PaymentDialog({ rentalId, reservationId, kind = 'payment', onClose }: { rentalId?: Id; reservationId?: Id; kind?: 'payment' | 'advance'; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const rental = rentalId ? d.rentals.find((r) => r.id === rentalId) : undefined
  const reservation = reservationId ? d.reservations.find((r) => r.id === reservationId) : undefined
  const subject = (rental ?? reservation)!
  const obligationCur = subject.currency
  const customer = d.customers.find((c) => c.id === subject.customerId)
  const corp = subject.corporateId ? d.corporates.find((c) => c.id === subject.corporateId) : undefined
  const me = d.users.find((u) => u.id === d.session.userId)!
  const defaultBranch = (me.branchIds[0] && me.branchIds.includes(subject.pickupBranchId) ? subject.pickupBranchId : (me.branchIds[0] ?? subject.pickupBranchId)) as Id
  const [branch, setBranch] = useState<Id>(defaultBranch)
  const accepted = (d.settings.branchTender[branch] ?? d.settings.acceptedCurrencies) as Cur[]
  const [payerType, setPayerType] = useState<'customer' | 'corporate' | 'other'>('customer')
  const [otherName, setOtherName] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cur, setCur] = useState<Cur>(accepted.includes(obligationCur) ? obligationCur : (accepted[0] ?? obligationCur))
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const fin = rental ? rentalFinance(d, rental.id) : null
  const minor = parseAmount(amount, cur)
  const preview = useMemo(() => (minor && minor > 0 ? previewPayment(d, { tenderMinor: minor, tenderCur: cur, branchId: branch, obligationCur }) : null), [d, minor, cur, branch, obligationCur])
  const methods = METHOD_LABEL()
  const drawerOpen = d.drawers.find((x) => x.branchId === branch && x.currency === cur)?.status === 'open'
  const awaiting = preview && !preview.ok
  const payerName = payerType === 'customer' ? (customer?.name ?? '') : payerType === 'corporate' ? (corp?.name ?? '') : otherName
  const outstanding = fin?.outstandingMinor ?? 0
  const afterOutstanding = preview?.ok && fin ? Math.max(0, outstanding - preview.appliedMinor) : null

  const fillRest = () => {
    if (!fin) return
    const r = tenderForObligation(d.fxRates, { obligationMinor: outstanding, tender: cur, obligation: obligationCur, branchId: branch, at: d.clock.now })
    if (r.ok) setAmount(toInput(r.tenderMinor, cur))
    else setFields({ amount: r.message })
  }

  return (
    <FinanceDialog
      title={kind === 'advance' ? L('Kaparo / ön ödeme kaydet', 'Record advance payment') : L('Ödeme ekle', 'Add payment')}
      description={
        kind === 'advance'
          ? L('Kaparo rezervasyona bağlı, uygulanmamış bir ön ödemedir: gelir sayılmaz. Kiralamaya dönüşünce açıkça aktarılır, teslimde hesap kalemine mahsup edilir.', 'An advance is held against the reservation and not applied: it is not revenue. It is transferred explicitly on conversion and applied to the charge at delivery.')
          : L('Önce ödeyeni, yöntemi, para birimini ve tutarı girin; kur varsa uygulanan eşdeğer gösterilir. Gerçek POS veya banka işlemi yapılmaz: yalnız kayıt tutulur.', 'Enter payer, method, currency and amount; the applied equivalent is shown when a rate exists. No real POS or bank operation happens: only a record is kept.')
      }
      confirm={L('Ödemeyi kaydet', 'Record payment')}
      onClose={onClose}
      summary={
        fin
          ? [
              [L('Mevcut açık bakiye', 'Outstanding now'), fmt(outstanding, fin.cur)],
              [L('Bu ödemeden sonra', 'After this payment'), afterOutstanding === null ? L('Kur Bekleniyor: bakiye değişmez', 'Awaiting Rate: balance unchanged') : fmt(afterOutstanding, fin.cur)],
            ]
          : undefined
      }
      onSubmit={() => {
        if (!minor || minor <= 0) {
          setFields({ amount: L('Geçerli bir tutar girin', 'Enter a valid amount') })
          return L('Geçerli bir tutar girin.', 'Enter a valid amount.')
        }
        if (payerType === 'other' && otherName.trim().length < 3) {
          setFields({ payer: L('Ödeyenin adını yazın', 'Enter the payer name') })
          return L('Ödeyenin adını yazın.', 'Enter the payer name.')
        }
        if ((method === 'card' || method === 'transfer') && reference.trim().length < 3) {
          setFields({ reference: method === 'card' ? L('POS işlem referansı', 'POS reference') : L('Havale referansı', 'Transfer reference') })
          return method === 'card' ? L('Kart için POS fişindeki işlem referansını girin (kart numarası yazmayın).', 'Enter the POS slip reference for a card payment (never a card number).') : L('Havale referansını girin.', 'Enter the transfer reference.')
        }
        const r = runAction(
          (x) => recordPayment(x, { rentalId, reservationId, kind, payer: { type: payerType, id: payerType === 'customer' ? subject.customerId : payerType === 'corporate' ? subject.corporateId : undefined, name: payerName }, method, tenderMinor: minor, tenderCur: cur, branchId: branch, reference, note }),
          L('Ödeme demo ortamında kaydedildi (gerçek tahsilat yapılmadı).', 'Payment recorded in the demo (no real collection).'),
        )
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <SelectF id="pay-branch" label={L('Şube / kasa', 'Branch / register')} value={branch} onChange={(v) => { setBranch(v); const a = (d.settings.branchTender[v] ?? []) as Cur[]; if (!a.includes(cur)) setCur(a[0] ?? cur) }} options={d.branches.filter((b) => b.active).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))} />
      <SelectF id="pay-payer" label={L('Ödeyen', 'Payer')} value={payerType} onChange={(v) => setPayerType(v as typeof payerType)} options={[{ id: 'customer', label: `${L('Kiracı', 'Renter')}: ${customer?.name}` }, ...(corp ? [{ id: 'corporate', label: `${L('Kurumsal hesap', 'Corporate')}: ${corp.name}` }] : []), { id: 'other', label: L('Başka kişi veya kurum', 'Another person or company') }]} hint={L('Ödemeyi yapan kişi ile hukuken sorumlu kiracı aynı kabul edilmez.', 'The person who pays is not assumed to be the legally responsible renter.')} />
      {payerType === 'other' && <TextF id="pay-other" label={L('Ödeyenin adı', 'Payer name')} required value={otherName} onChange={setOtherName} error={fields.payer} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="pay-method" label={L('Yöntem', 'Method')} value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={Object.entries(methods).map(([id, label]) => ({ id, label }))} error={fields.method} />
        {(method === 'card' || method === 'transfer') && <TextF id="pay-ref" label={method === 'card' ? L('POS işlem referansı', 'POS reference') : L('Havale referansı', 'Transfer reference')} required value={reference} onChange={setReference} error={fields.reference} hint={L('POS’tan gerçekten geçirildiyse referansı yazın; ACARVO kart bilgisi almaz.', 'Enter the reference only if it really went through a POS; ACARVO takes no card data.')} />}
      </div>
      <MoneyF id="pay-amount" label={L('Tahsil edilen tutar', 'Amount tendered')} required amount={amount} onAmount={(v) => { setAmount(v); setFields({}) }} cur={cur} onCur={setCur} currencies={accepted} error={fields.amount ?? fields.currency} />
      {fin && outstanding > 0 && (
        <button type="button" onClick={fillRest} className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium hover:bg-ground">
          {L(`Kalanı öde (${fmt(outstanding, fin.cur)} karşılığı ${cur})`, `Pay the rest (${cur} for ${fmt(outstanding, fin.cur)})`)}
        </button>
      )}
      {preview?.ok && cur !== obligationCur && preview.snapshot && (
        <Notice tone="blue">
          <p className="font-medium">
            {fmt(minor!, cur)} → <span className="tnum">{fmt(preview.appliedMinor, obligationCur)}</span> {L('uygulanır', 'applied')}
          </p>
          <p className="mt-0.5 text-[12.5px]">
            {L('Kur', 'Rate')}: 1 {preview.snapshot.base} = {preview.snapshot.rate} {preview.snapshot.quote} ({preview.snapshot.direction === 'inverse' ? L('ters kur', 'inverse') : L('doğrudan', 'direct')}) · {L('işletmenin elle belirlediği kur; bu ödeme için sabitlenir, sonradan değişse de bu satır değişmez.', 'business-defined manual rate; pinned to this payment and unaffected by later changes.')}
          </p>
        </Notice>
      )}
      {awaiting && (
        <Notice tone="hold">
          <p className="font-medium">{L('Kur Bekleniyor', 'Awaiting Rate')}</p>
          <p className="mt-0.5">{preview.ok ? '' : preview.message}</p>
          {can('settings:fx') ? (
            <Link to={'/ayarlar?bolum=kurlar' as never} className="mt-1.5 inline-block text-[13px] font-medium text-blue hover:underline" onClick={onClose}>
              {L('Kur Ayarlarına git', 'Go to exchange-rate settings')}
            </Link>
          ) : (
            <p className="mt-1 text-[12.5px] text-ink-2">{L('Kuru yalnız Ayarlar → Döviz Kurları’na yetkili kullanıcı tanımlayabilir.', 'Only a user permitted for Settings → Exchange Rates can define the rate.')}</p>
          )}
          <p className="mt-1 text-[12.5px] text-ink-2">{L('Bu satır kaydedilmez ve bakiye değişmez.', 'This line is not stored and the balance does not change.')}</p>
        </Notice>
      )}
      {method === 'cash' && !drawerOpen && (
        <Notice tone="hold">
          {L(`Bu şubede ${cur} nakit kasası kapalı veya tanımsız: nakit tahsilat için önce `, `The ${cur} cash drawer of this branch is closed or missing: open a session in `)}
          <Link to={'/sube-kasalari' as never} className="font-medium text-blue hover:underline" onClick={onClose}>{L('Şube Kasaları', 'Branch Cash Registers')}</Link>
          {L('’ndan oturum açın.', ' first.')}
        </Notice>
      )}
      {method === 'cash' && drawerOpen && <p className="text-[12.5px] text-ink-3">{L(`Nakit ${cur} kasasına girer. Kasadaki beklenen: ${fmt(cashByCurrency(d, branch)[cur] ?? 0, cur)}.`, `Cash enters the ${cur} drawer. Expected in the drawer: ${fmt(cashByCurrency(d, branch)[cur] ?? 0, cur)}.`)}</p>}
      {method !== 'cash' && <p className="text-[12.5px] text-ink-3">{L('Kart ve havale fiziksel nakit kasasına eklenmez.', 'Card and bank transfer never enter the physical cash drawer.')}</p>}
      <TextF id="pay-note" label={L('Not (isteğe bağlı)', 'Note (optional)')} value={note} onChange={setNote} />
    </FinanceDialog>
  )
}
