import { useState } from 'react'
import { approvalLabel, APPROVAL_TYPES, requestApproval } from '../../core/ops/control'
import { parseAmount, toInput } from '../../core/money'
import type { ApprovalType, Cur, Id, LinkType, Money } from '../../core/types'
import { L, loc } from '../../i18n'
import { AreaF, MoneyF, TextF } from '../../ui/forms'
import { runAction, useDb, useMe } from '../../ui/hooks'
import { FinanceDialog, Notice } from '../../ui/kit'
import { approvalRisk, level2Blocker, STARTER_MUST_AUTHORIZE } from '../../core/risk'
import { RiskBadge } from './FinanceBits'

/** One request form for the six formal approval types; the request does nothing until a second person decides and it is applied. */
export function ApprovalRequestDialog({ type, target, cur, onClose, hint, paymentId, amount: fixed }: { type: ApprovalType; target: { type: LinkType; id: Id }; cur?: Cur; onClose: () => void; hint?: string; paymentId?: Id; amount?: Money }) {
  const d = useDb()
  const def = APPROVAL_TYPES.find((x) => x.type === type)!
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState(fixed ? toInput(fixed.minor, fixed.cur) : '')
  const [currency, setCurrency] = useState<Cur>(fixed?.cur ?? cur ?? d.settings.company.baseCurrency)
  const [pct, setPct] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const me = useMe()
  const parsed = def.needsAmount ? parseAmount(amount, currency) : null
  const risk = approvalRisk(d, type, parsed ? { minor: parsed, cur: currency } : fixed ?? null)
  const lock = risk >= 2 ? level2Blocker(d, me.id, STARTER_MUST_AUTHORIZE.has(type)) : null
  return (
    <FinanceDialog
      title={`${L('Onay talebi', 'Approval request')}: ${loc(approvalLabel(type))}`}
      description={`${hint ?? ''} ${L('Talep tek başına bir işlem yapmaz: ikinci bir yetkili karar verir, sonra uygulanır (Onaylandı ≠ Uygulandı).', 'The request does nothing by itself: a second authorised person decides, then it is applied (Approved ≠ Applied).')}`.trim()}
      confirm={L('Talep et', 'Request')}
      onClose={onClose}
      summary={[[L('Uygulanınca', 'When applied'), loc(def.applyHint)]]}
      onSubmit={() => {
        const minor = def.needsAmount ? parseAmount(amount, currency) : null
        const r = runAction((s) => requestApproval(s, { type, target, reason, requested: minor === null ? null : { minor, cur: currency }, proposedPct: type === 'high_discount' ? Number(pct) : undefined, paymentId }), L('Onay talebi oluşturuldu; ikinci yetkili bekleniyor.', 'Approval requested; waiting for a second authorised person.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-[13px]"><RiskBadge level={risk} /> <span className="text-ink-2">{risk >= 2 ? L('Bağımsız bir yetkili onaylar; şirket politikasıyla gevşetilemez.', 'An independent authorizer approves; no company policy can relax it.') : L('Başka bir yetkili karar verir.', 'Another authorized person decides.')}</span></p>
        {lock && <Notice tone="alert">{lock}</Notice>}
      </div>
      {def.needsAmount && <MoneyF id="ap-a" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={currency} onCur={setCurrency} currencies={d.settings.acceptedCurrencies} lockCurrency={!!cur || !!fixed} error={fields.amount} required />}
      {type === 'high_discount' && <TextF id="ap-p" label={L('İndirim yüzdesi (1–50)', 'Discount percent (1–50)')} required value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} error={fields.pct} />}
      <AreaF id="ap-r" label={L('Gerekçe (en az 10 karakter)', 'Reason (at least 10 characters)')} required value={reason} onChange={setReason} error={fields.reason} rows={3} />
    </FinanceDialog>
  )
}
