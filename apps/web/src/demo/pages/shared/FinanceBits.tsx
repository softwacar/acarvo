import { ClockCounterClockwise, SealCheck, ShieldCheck } from '@phosphor-icons/react'
import { useState } from 'react'
import { advanceLedger, isReconciled, stageOf } from '../../core/calc/finance'
import { cancellationFee } from '../../core/calc/policy'
import { userName } from '../../core/helpers'
import { fmt, parseAmount, toInput } from '../../core/money'
import { requestApproval } from '../../core/ops/control'
import { settleAdvance, verifyDeposit, verifyPayment } from '../../core/ops/finance'
import { RISK_LABEL, type RiskLevel } from '../../core/risk'
import type { DepositRecord, Payment, Reservation } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, MoneyF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useMe } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, FinanceDialog, Link2, Pill, Status } from '../../ui/kit'
import { Sheet } from '../../ui/dialogs'
import { AdvanceStatus } from '../../ui/kit'
import { METHOD_LABEL } from '../../ui/status'

// Pieces of the single finance model (decision document M.1): record → verify → apply is one line; reconciliation is its own
// flag; the audit trail is the immutable event list. Risk levels are shown wherever an action needs a second person.

export function RiskBadge({ level }: { level: RiskLevel }) {
  const t = RISK_LABEL[level]
  return <Pill tone={level >= 2 ? 'alert' : level === 1 ? 'hold' : 'muted'}>{L(t.tr, t.en)}</Pill>
}

/** The three steps of one payment, plus the separate reconciliation flag. */
export function StageBadge({ p }: { p: Pick<Payment, 'status' | 'verifiedAt' | 'reconciledAt' | 'kind'> }) {
  const st = stageOf(p)
  const label = st === 'recorded' ? L('Kaydedildi · doğrulama bekliyor', 'Recorded · awaiting verification') : st === 'verified' ? L('Doğrulandı', 'Verified') : st === 'applied' ? L('Uygulandı', 'Applied') : L('İptal (ters kayıt)', 'Reversed')
  const tone = st === 'recorded' ? 'hold' : st === 'verified' ? 'blue' : st === 'applied' ? 'ok' : 'muted'
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Pill tone={tone}>{label}</Pill>
      {st === 'applied' && <Pill tone={isReconciled(p) ? 'ok' : 'muted'}>{isReconciled(p) ? L('Mutabık', 'Reconciled') : L('Mutabakat bekliyor', 'Reconciliation pending')}</Pill>}
    </span>
  )
}

/** "Verify" for somebody other than the person who recorded the line. The reason is written when the person cannot. */
export function VerifyButton({ p, dep }: { p?: Payment; dep?: DepositRecord }) {
  const can = useCan()
  const me = useMe()
  const rec = p?.recordedBy ?? dep?.by
  const done = !!(p?.verifiedAt ?? dep?.verifiedAt)
  if (done || (p && p.status === 'voided')) return null
  if (!can('finance:verify')) return null
  if (rec === me.id)
    return (
      <span className="text-[12px] text-ink-3" title={L('Kaydı açan kişi doğrulayamaz', 'The person who recorded it cannot verify it')}>
        {L('Başka yetkili doğrular', 'Another person verifies')}
      </span>
    )
  return (
    <button type="button" className={btnSmall} onClick={(e) => { e.stopPropagation(); runAction((s) => (p ? verifyPayment(s, p.id) : verifyDeposit(s, dep!.id)), L('Doğrulandı.', 'Verified.')) }}>
      <SealCheck size={14} /> {L('Doğrula', 'Verify')}
    </button>
  )
}

/** Opens the immutable list of events that mention a payment, deposit or reservation record. */
export function AuditButton({ needles, title }: { needles: string[]; title: string }) {
  const d = useDb()
  const f = useFmt()
  const [open, setOpen] = useState(false)
  const rows = d.events.filter((e) => needles.some((n) => n && (e.sourceId === n || e.summary.includes(n)))).sort((a, b) => b.at.localeCompare(a.at))
  return (
    <>
      <button type="button" className={btnSmall} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <ClockCounterClockwise size={14} /> {L('Denetim geçmişi', 'Audit trail')}
      </button>
      {open && (
        <Sheet title={title} subtitle={L('Değişmez olay geçmişi: ödeme uygulandıktan sonra bile yeni olaylar eklenebilir; hiçbiri silinmez.', 'Immutable event history: events can still be added after a payment is applied; none is ever deleted.')} onClose={() => setOpen(false)}>
          {rows.length === 0 ? (
            <p className="text-[13px] text-ink-2">{L('Olay yok.', 'No events.')}</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {rows.map((e) => (
                <li key={e.id} className="py-2.5 text-[13.5px]">
                  <p className="font-medium">{e.summary}</p>
                  <p className="tnum text-[12.5px] text-ink-2">{f.dt(e.at)} · {e.actorName}{e.reason ? ` · ${e.reason}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </Sheet>
      )}
    </>
  )
}

// ---------------------------------------------------------------- the advance (kaparo) ledger

function LedgerRow({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-[13.5px]">
      <span className={strong ? 'font-semibold' : ''}>{label}{note && <span className="block text-[12px] font-normal text-ink-2">{note}</span>}</span>
      <span className={`tnum whitespace-nowrap ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </li>
  )
}

/**
 * One advance with its five ledger lines: policy fee, customer receivable, real refund, remaining usable advance, history.
 * Money is never mixed: the policy fee is not a collection, a refund is not an expense, an advance is not a deposit.
 */
export function AdvanceLedgerCard({ p, reservation }: { p: Payment; reservation?: Reservation }) {
  const d = useDb()
  const f = useFmt()
  const can = useCan()
  const [dlg, setDlg] = useState<null | 'refund' | 'fee'>(null)
  const [err, setErr] = useState<string | null>(null)
  const l = advanceLedger(d, p)
  const refunds = d.refunds.filter((x) => x.paymentId === p.id)
  const closed = reservation && (reservation.status === 'cancelled' || reservation.status === 'no_show')
  const open = reservation && (reservation.status === 'pending' || reservation.status === 'confirmed')
  const preview = open && reservation ? cancellationFee(d, reservation, d.clock.now, 'cancel') : null
  const held = p.status === 'recorded' && l.remainingMinor > 0
  const adv = p.kind === 'advance'
  return (
    <div className="space-y-3 rounded-lg border border-line p-4" data-testid={`advance-${p.no}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="tnum font-medium">{p.no}</span> · {fmt(p.tender.minor, p.tender.cur)} · {METHOD_LABEL()[p.method]}
          <span className="block text-[12.5px] text-ink-2">{f.dt(p.recordedAt, p.branchId)} · {L('kaydeden', 'recorded by')} {userName(d, p.recordedBy)}{p.verifiedAt ? ` · ${L('doğrulayan', 'verified by')} ${userName(d, p.verifiedBy)}` : ''}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <AdvanceStatus p={p} />
          <StageBadge p={p} />
          <VerifyButton p={p} />
        </span>
      </div>

      {adv && (
        <ul className="divide-y divide-line-soft rounded-md bg-ground/60 px-3" aria-label={L('Kaparo defteri', 'Advance ledger')}>
          <LedgerRow label={L('Kaparo', 'Advance')} value={fmt(l.tenderMinor, l.cur)} />
          <LedgerRow label={L('Politika bedeli', 'Policy fee')} value={fmt(l.retainedMinor, l.cur)} note={p.policyFeeRule ?? (preview ? L(`İptal edilirse otomatik hesaplanır: ${fmt(preview.feeMinor, preview.cur)} (${preview.rule})`, `Computed automatically if cancelled: ${fmt(preview.feeMinor, preview.cur)} (${preview.rule})`) : undefined)} />
          <LedgerRow label={L('Müşteri alacağı', 'Customer receivable')} value={fmt(l.receivableMinor, l.cur)} note={l.receivableMinor > 0 ? L('Bedel kaparoyu aşıyor; fark müşteriden alınacak (burada tahsil edilmez).', 'The fee exceeds the advance; the difference is owed by the customer (not collected here).') : undefined} />
          <LedgerRow label={L('Gerçek iade', 'Real refund')} value={fmt(l.refundedMinor, l.cur)} note={l.pendingRefundMinor > 0 ? L(`${fmt(l.pendingRefundMinor, l.cur)} onay/ödeme bekliyor`, `${fmt(l.pendingRefundMinor, l.cur)} awaiting approval / payout`) : undefined} />
          <LedgerRow label={L('Kalan kullanılabilir kaparo', 'Remaining usable advance')} value={fmt(l.remainingMinor, l.cur)} strong note={l.remainingMinor > 0 ? L(`İade edilebilir: ${fmt(l.refundableMinor, l.cur)}`, `Refundable: ${fmt(l.refundableMinor, l.cur)}`) : undefined} />
        </ul>
      )}

      <p className="text-[12.5px] text-ink-2">
        {p.advanceState === 'unapplied' && L('Rezervasyonda tutuluyor; henüz hiçbir hesap kalemine uygulanmadı.', 'Held on the reservation; not applied to any charge yet.')}
        {p.advanceState === 'transferred' && L("Kiralamaya aktarıldı; Teslim'de oluşan kiralama bedeline bir kez uygulanacak.", 'Moved to the rental; it is applied once to the rental charge that arises at delivery.')}
        {p.advanceState === 'applied' && L(`Kiralama bedeline uygulandı (${fmt(p.appliedMinor, p.obligationCur)}).`, `Applied to the rental charge (${fmt(p.appliedMinor, p.obligationCur)}).`)}
        {p.advanceState === 'refunded' && L('Kalan tutar müşteriye iade edildi; hiçbir hesap kalemine uygulanmaz.', 'The remainder was paid back to the customer; it will not be applied to any charge.')}
        {p.advanceState === 'forfeited' && L('Kaparonun tamamı politika bedeli olarak tutuldu (şirket politikası).', 'The whole advance was kept as a policy fee (company policy).')}
      </p>

      {refunds.map((x) => (
        <p key={x.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
          {L('İade', 'Refund')} {x.no} · {fmt(x.amount.minor, x.amount.cur)} <Status kind="refund" value={x.status} />
          {x.approvalId && <Link2 type="approval" id={x.approvalId}>{L('Onay', 'Approval')}</Link2>}
        </p>
      ))}
      {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}

      <div className="flex flex-wrap gap-2">
        {adv && held && l.refundableMinor > 0 && can('approvals:request') && <button type="button" className={btnSecondary} onClick={() => setDlg('refund')}>{L('İade talep et', 'Request refund')}</button>}
        {adv && closed && p.policyFeeMinor === undefined && p.status === 'recorded' && can('finance:apply') && (
          <button type="button" className={btnSecondary} onClick={() => { const r = runAction((s) => settleAdvance(s, p.id), L('Politika bedeli şirket politikasına göre hesaplandı.', 'The policy fee was computed from the company policy.')); setErr(r.ok ? null : r.error) }}>
            <ShieldCheck size={14} /> {L('Politikayı uygula', 'Apply the policy')}
          </button>
        )}
        {adv && p.policyFeeMinor !== undefined && p.status !== 'refunded' && can('approvals:request') && (
          <button type="button" className={btnSecondary} onClick={() => setDlg('fee')}>{L('Politika bedeli sapması iste', 'Request a policy deviation')}</button>
        )}
        <AuditButton needles={[p.no, p.id]} title={`${L('Kaparo', 'Advance')} ${p.no}`} />
      </div>
      {dlg === 'refund' && <RefundAdvanceDialog p={p} onClose={() => setDlg(null)} />}
      {dlg === 'fee' && <FeeDeviationDialog p={p} onClose={() => setDlg(null)} />}
    </div>
  )
}

/** Full or partial refund of an advance: the amount may not exceed what is refundable; the request is a formal approval. */
export function RefundAdvanceDialog({ p, onClose }: { p: Payment; onClose: () => void }) {
  const d = useDb()
  const l = advanceLedger(d, p)
  const [amount, setAmount] = useState(toInput(l.refundableMinor, l.cur))
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const target = p.reservationId ? ({ type: 'reservation', id: p.reservationId } as const) : ({ type: 'rental', id: p.rentalId! } as const)
  return (
    <FinanceDialog
      title={L('Kaparo iadesi talebi', 'Advance refund request')}
      description={L(`İade edilebilir en fazla ${fmt(l.refundableMinor, l.cur)}. Tam veya kısmi iade istenebilir; kalan tutar kullanılabilir kalır. Talebi ikinci bir yetkili onaylar ve uygular (Onaylandı ≠ Uygulandı). Gerçek para hareketi yoktur: demo kaydıdır.`, `At most ${fmt(l.refundableMinor, l.cur)} is refundable. A full or partial refund can be requested; the rest stays usable. A second authorised person approves and applies it (Approved ≠ Applied). No real money moves: this is a demo record.`)}
      confirm={L('Talep et', 'Request')}
      onClose={onClose}
      summary={[[L('Kaparo', 'Advance'), fmt(l.tenderMinor, l.cur)], [L('Politika bedeli', 'Policy fee'), fmt(l.retainedMinor, l.cur)], [L('İade edilebilir', 'Refundable'), fmt(l.refundableMinor, l.cur)]]}
      onSubmit={() => {
        const minor = parseAmount(amount, l.cur)
        if (minor === null || minor <= 0) {
          setFields({ amount: L('Geçerli bir tutar girin', 'Enter a valid amount') })
          return L('Geçerli bir tutar girin.', 'Enter a valid amount.')
        }
        const r = runAction((s) => requestApproval(s, { type: 'refund', target, paymentId: p.id, requested: { minor, cur: l.cur }, reason }), L('İade talebi oluşturuldu; ikinci yetkili bekleniyor.', 'Refund requested; waiting for a second authorised person.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <MoneyF id="ra-a" label={L('İade tutarı', 'Refund amount')} amount={amount} onAmount={setAmount} cur={l.cur} onCur={() => undefined} currencies={[l.cur]} lockCurrency error={fields.amount} required />
      <AreaF id="ra-r" label={L('Gerekçe (en az 10 karakter)', 'Reason (at least 10 characters)')} required value={reason} onChange={setReason} error={fields.reason} rows={3} />
    </FinanceDialog>
  )
}

/** A deviation from the standard policy fee (waiver or reduction): a Financial Correction, risk level 2, needs an independent authorizer. */
export function FeeDeviationDialog({ p, onClose }: { p: Payment; onClose: () => void }) {
  const d = useDb()
  const l = advanceLedger(d, p)
  const [amount, setAmount] = useState(toInput(0, l.cur))
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Politika bedeli sapması', 'Policy fee deviation')}
      description={L('Standart politika bedelini personel değiştiremez. İndirim veya feragat Finansal Düzeltme olarak istenir (Seviye 2): bağımsız bir yetkili onaylar ve uygular.', 'Staff cannot change the standard policy fee. A reduction or waiver is requested as a Financial Correction (level 2): an independent authorizer approves and applies it.')}
      confirm={L('Talep et', 'Request')}
      onClose={onClose}
      summary={[[L('Bugünkü politika bedeli', 'Current policy fee'), fmt(l.retainedMinor, l.cur)]]}
      onSubmit={() => {
        const minor = parseAmount(amount, l.cur)
        if (minor === null || minor < 0 || minor >= l.retainedMinor) {
          setFields({ amount: L('Yeni bedel mevcut bedelden küçük olmalı', 'The new fee must be lower than the current one') })
          return L('Yeni bedel mevcut politika bedelinden küçük olmalı.', 'The new fee must be lower than the current policy fee.')
        }
        const target = { type: 'payment', id: p.id } as const
        const r = runAction((s) => requestApproval(s, { type: 'financial_correction', target, adjust: { paymentId: p.id, retainedMinor: minor }, requested: null, reason }), L('Düzeltme talebi oluşturuldu; bağımsız yetkili bekleniyor.', 'Correction requested; waiting for an independent authorizer.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <p className="flex items-center gap-2 text-[13px]"><RiskBadge level={2} /></p>
      <MoneyF id="fd-a" label={L('İstenen yeni politika bedeli', 'Requested new policy fee')} amount={amount} onAmount={setAmount} cur={l.cur} onCur={() => undefined} currencies={[l.cur]} lockCurrency error={fields.amount} required />
      <AreaF id="fd-r" label={L('Gerekçe (en az 10 karakter)', 'Reason (at least 10 characters)')} required value={reason} onChange={setReason} error={fields.reason} rows={3} />
    </FinanceDialog>
  )
}

export { btnPrimary }
