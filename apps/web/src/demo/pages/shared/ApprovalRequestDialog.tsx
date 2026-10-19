import { useState } from 'react'
import { approvalLabel, APPROVAL_TYPES, requestApproval } from '../../core/ops/control'
import { parseAmount } from '../../core/money'
import type { ApprovalType, Cur, Id, LinkType } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, MoneyF, TextF } from '../../ui/forms'
import { runAction, useDb } from '../../ui/hooks'
import { FinanceDialog } from '../../ui/kit'

/** One request form for the six formal approval types; the request does nothing until a second person decides and it is applied. */
export function ApprovalRequestDialog({ type, target, cur, onClose, hint }: { type: ApprovalType; target: { type: LinkType; id: Id }; cur?: Cur; onClose: () => void; hint?: string }) {
  const d = useDb()
  const def = APPROVAL_TYPES.find((x) => x.type === type)!
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Cur>(cur ?? d.settings.company.baseCurrency)
  const [pct, setPct] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={`${L('Onay talebi', 'Approval request')}: ${approvalLabel(type)}`}
      description={`${hint ?? ''} ${L('Talep tek başına bir işlem yapmaz: ikinci bir yetkili karar verir, sonra uygulanır (Onaylandı ≠ Uygulandı).', 'The request does nothing by itself: a second authorised person decides, then it is applied (Approved ≠ Applied).')}`.trim()}
      confirm={L('Talep et', 'Request')}
      onClose={onClose}
      summary={[[L('Uygulanınca', 'When applied'), def.applyHint]]}
      onSubmit={() => {
        const minor = def.needsAmount ? parseAmount(amount, currency) : null
        const r = runAction((s) => requestApproval(s, { type, target, reason, requested: minor === null ? null : { minor, cur: currency }, proposedPct: type === 'high_discount' ? Number(pct) : undefined }), L('Onay talebi oluşturuldu; ikinci yetkili bekleniyor.', 'Approval requested; waiting for a second authorised person.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      {def.needsAmount && <MoneyF id="ap-a" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={currency} onCur={setCurrency} currencies={d.settings.acceptedCurrencies} lockCurrency={!!cur} error={fields.amount} required />}
      {type === 'high_discount' && <TextF id="ap-p" label={L('İndirim yüzdesi (1–50)', 'Discount percent (1–50)')} required value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} error={fields.pct} />}
      <AreaF id="ap-r" label={L('Gerekçe (en az 10 karakter)', 'Reason (at least 10 characters)')} required value={reason} onChange={setReason} error={fields.reason} rows={3} />
    </FinanceDialog>
  )
}
