import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { userName } from '../../core/helpers'
import { fmt } from '../../core/money'
import { applyApproval, approvalLabel, APPROVAL_TYPES, decideApproval } from '../../core/ops/control'
import type { Approval, ApprovalType, Cur, Db, Id, LinkType } from '../../core/types'
import { L, loc } from '../../i18n'
import { ComboF, SelectF } from '../../ui/forms'
import { entityHref, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Notice, Page, Status, Tabs, Timeline } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { Link } from '@tanstack/react-router'

type TabId = 'bekleyen' | 'uygulanacak' | 'tamam' | 'hepsi'

export function ApprovalsPage() {
  const d = useDb()
  const can = useCan()
  const me = useMe()
  const f = useFmt()
  const [tab, setTab] = useUrlState('sekme', 'bekleyen')
  const [type, setType] = useUrlState('tur', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const views: Record<TabId, (a: Approval) => boolean> = {
    bekleyen: (a) => a.status === 'requested',
    uygulanacak: (a) => a.status === 'approved',
    tamam: (a) => a.status === 'applied' || a.status === 'rejected',
    hepsi: () => true,
  }
  const rows = d.approvals.filter(views[(tab as TabId) in views ? (tab as TabId) : 'bekleyen']).filter((a) => (type === 'all' ? true : a.type === type)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const count = (t: TabId) => d.approvals.filter(views[t]).length
  const mineToDecide = d.approvals.filter((a) => a.status === 'requested' && a.requesterId !== me.id).length
  const cols: Col<Approval>[] = [
    { id: 'no', header: L('Talep', 'Request'), cell: (a) => <span className="tnum whitespace-nowrap font-medium text-blue">{a.no}</span>, sort: (a) => a.no, csv: (a) => a.no },
    { id: 'type', header: L('Tür', 'Type'), cell: (a) => loc(approvalLabel(a.type)), csv: (a) => loc(approvalLabel(a.type)) },
    { id: 'amt', header: L('İstenen', 'Requested'), align: 'right', cell: (a) => (a.requested ? <span className="tnum whitespace-nowrap">{fmt(a.requested.minor, a.requested.cur)}</span> : a.proposedPct ? <span className="tnum">%{a.proposedPct}</span> : '—'), hideBelow: 'md' },
    { id: 'by', header: L('Talep eden', 'Requested by'), cell: (a) => userName(d, a.requesterId), hideBelow: 'lg' },
    { id: 'when', header: L('Tarih', 'Date'), cell: (a) => <span className="tnum text-[13px]">{f.dt(a.createdAt)}</span>, sort: (a) => a.createdAt, hideBelow: 'lg', csv: (a) => a.createdAt },
    { id: 'st', header: L('Durum', 'Status'), cell: (a) => <Status kind="approval" value={a.status} />, sort: (a) => a.status, csv: (a) => a.status },
  ]
  const current = d.approvals.find((a) => a.id === sel)
  return (
    <Page
      title={L('Onay Merkezi', 'Approval Center')}
      description={L('Altı resmî onay türü. Talep eden kişi kendi talebini onaylayamaz (dört göz); Onaylandı ile Uygulandı ayrı adımlardır ve her onay yalnız bir kez uygulanır.', 'Six formal approval types. The requester cannot approve their own request (four eyes); Approved and Applied are separate steps and each approval is applied only once.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('onaylar', cols, rows)}>CSV</button>
          {can('approvals:request') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Yeni talep', 'New request')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Karar bekleyen', 'Awaiting decision'), value: count('bekleyen'), tone: count('bekleyen') ? 'hold' : undefined }, { label: L('Benim kararımı bekleyen', 'Awaiting my decision'), value: mineToDecide, hint: L('Kendi talepleriniz hariç', 'Excluding your own requests') }, { label: L('Onaylı, uygulanmadı', 'Approved, not applied'), value: count('uygulanacak'), tone: count('uygulanacak') ? 'hold' : undefined }, { label: L('Uygulanan', 'Applied'), value: d.approvals.filter((a) => a.status === 'applied').length }]} />
      <Tabs<TabId> label={L('Onay görünümleri', 'Approval views')} value={(tab as TabId) || 'bekleyen'} onChange={setTab} tabs={[{ id: 'bekleyen', label: L('Karar bekleyen', 'Awaiting decision'), count: count('bekleyen') || undefined }, { id: 'uygulanacak', label: L('Onaylı, uygulanacak', 'Approved, to apply'), count: count('uygulanacak') || undefined }, { id: 'tamam', label: L('Tamamlanan', 'Completed') }, { id: 'hepsi', label: L('Tümü', 'All') }]} />
      <FilterBar onReset={() => setType('all')} active={type !== 'all'}>
        <FilterSelect label={L('Tür', 'Type')} value={type} onChange={setType} options={[{ id: 'all', label: L('Tümü', 'All') }, ...APPROVAL_TYPES.map((t) => ({ id: t.type, label: loc(t.label) }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(a) => a.id} label={L('Onay listesi', 'Approval list')} urlKey="on" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(a) => setSel(a.id)} empty={<Empty title={L('Bu görünümde talep yok', 'No requests in this view')} />} />
      {adding && <NewRequestDialog onClose={() => setAdding(false)} />}
      {current && <Drawer a={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ a, onClose }: { a: Approval; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const me = useMe()
  const f = useFmt()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'reject' | 'approve'>(null)
  const own = a.requesterId === me.id
  const hint = loc(APPROVAL_TYPES.find((x) => x.type === a.type)!.applyHint)
  return (
    <RecordDrawer title={a.no} subtitle={loc(approvalLabel(a.type))} onClose={onClose} error={error}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="approval" value={a.status} />],
        [L('Hedef', 'Target'), <Link key="t" to={entityHref(a.target.type, a.target.id) as never} className="text-blue hover:underline">{targetLabel(d, a.target)}</Link>],
        [L('İstenen', 'Requested'), a.requested ? fmt(a.requested.minor, a.requested.cur) : a.proposedPct ? `%${a.proposedPct}` : '—'],
        [L('Gerekçe', 'Reason'), a.reason],
        [L('Talep eden', 'Requested by'), `${userName(d, a.requesterId)} · ${f.dt(a.createdAt)}`],
        [L('Karar veren', 'Decided by'), a.reviewerId ? `${userName(d, a.reviewerId)} · ${a.decidedAt ? f.dt(a.decidedAt) : ''}` : '—'],
        [L('Karar notu', 'Decision note'), a.decisionNote || '—'],
        [L('Uygulayan', 'Applied by'), a.appliedBy ? `${userName(d, a.appliedBy)} · ${a.appliedAt ? f.dt(a.appliedAt) : ''}` : '—'],
      ]} />
      <p className="text-[13px] text-ink-2">{L('Uygulanınca', 'When applied')}: {hint}</p>
      {own && (a.status === 'requested' || a.status === 'approved') && <Notice tone="blue">{L('Bu talebi siz açtınız: onaylayamaz, reddedemez ve uygulayamazsınız (dört göz). Üstteki Demo menüsünden başka bir kullanıcıya geçip deneyin.', 'You opened this request: you cannot approve, reject or apply it (four eyes). Switch to another user from the Demo menu to continue.')}</Notice>}
      {(a.status === 'requested' || a.status === 'approved') && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {a.status === 'requested' && can('approvals:decide') && <ActBtn disabled={own} title={own ? L('Kendi talebinizi onaylayamazsınız', 'You cannot approve your own request') : undefined} onClick={() => act((s) => decideApproval(s, a.id, 'approve', ''), L('Onaylandı; henüz uygulanmadı.', 'Approved; not applied yet.'))}>{L('Onayla', 'Approve')}</ActBtn>}
            {a.status === 'requested' && can('approvals:decide') && <ActBtn disabled={own} title={own ? L('Kendi talebinizi reddedemezsiniz', 'You cannot reject your own request') : undefined} onClick={() => setDlg('reject')}>{L('Reddet', 'Reject')}</ActBtn>}
            {a.status === 'approved' && can('approvals:apply') && <ActBtn disabled={own} title={own ? L('Talebi açan kişi uygulayamaz', 'The requester cannot apply') : undefined} onClick={() => act((s) => applyApproval(s, a.id), L('Uygulandı: kaynak kayıt güncellendi.', 'Applied: the source record was updated.'))}>{L('Uygula', 'Apply')}</ActBtn>}
          </ActionRow>
          {a.status === 'requested' && !can('approvals:decide') && <p className="mt-2 text-[12.5px] text-ink-2">{L('Bu rolde karar yetkisi yok.', 'This role has no decision permission.')}</p>}
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={a.history} /></DrawerSection>
      {dlg === 'reject' && <PromptDialog title={L('Talebi reddet', 'Reject request')} description={L('Ret gerekçesi talep edene bildirilir.', 'The rejection reason is shown to the requester.')} label={L('Ret gerekçesi', 'Rejection reason')} min={5} confirm={L('Reddet', 'Reject')} danger rows={2} run={(t) => act((s) => decideApproval(s, a.id, 'reject', t), L('Talep reddedildi.', 'Request rejected.')) as never} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

export function targetLabel(d: Db, t: { type: LinkType; id: Id }): string {
  switch (t.type) {
    case 'reservation': return d.reservations.find((x) => x.id === t.id)?.no ?? t.id
    case 'rental': return d.rentals.find((x) => x.id === t.id)?.no ?? t.id
    case 'payment': return d.payments.find((x) => x.id === t.id)?.no ?? t.id
    case 'corporate': return d.corporates.find((x) => x.id === t.id)?.name ?? t.id
    case 'partner': { const cm = d.commissions.find((x) => x.id === t.id); return cm ? `${d.partners.find((p) => p.id === cm.partnerId)?.name} · ${d.rentals.find((r) => r.id === cm.rentalId)?.no}` : d.partners.find((x) => x.id === t.id)?.name ?? t.id }
    default: return t.id
  }
}

function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const [type, setType] = useState<ApprovalType>('high_discount')
  const [target, setTarget] = useState('')
  const [next, setNext] = useState<null | { type: ApprovalType; target: { type: LinkType; id: Id }; cur?: Cur }>(null)
  const items: Record<ApprovalType, { type: LinkType; list: { id: Id; label: string; sub?: string; cur?: Cur }[] }> = {
    high_discount: { type: 'reservation', list: [...d.reservations.filter((r) => ['pending', 'confirmed'].includes(r.status)).map((r) => ({ id: r.id, label: r.no, sub: d.customers.find((c) => c.id === r.customerId)?.name, cur: r.currency }))] },
    deposit_exception: { type: 'rental', list: d.rentals.filter((r) => r.status === 'prepared').map((r) => ({ id: r.id, label: r.no, sub: d.customers.find((c) => c.id === r.customerId)?.name, cur: r.currency })) },
    refund: { type: 'rental', list: d.rentals.filter((r) => r.status !== 'cancelled').map((r) => ({ id: r.id, label: r.no, sub: d.customers.find((c) => c.id === r.customerId)?.name, cur: r.currency })) },
    financial_correction: { type: 'payment', list: d.payments.filter((p) => p.status !== 'voided').map((p) => ({ id: p.id, label: p.no, sub: `${fmt(p.tender.minor, p.tender.cur)} · ${p.payer.name}` })) },
    corporate_credit_override: { type: 'corporate', list: d.corporates.map((c) => ({ id: c.id, label: c.name, sub: c.no })) },
    partner_commission_adjustment: { type: 'partner', list: d.commissions.map((c) => ({ id: c.id, label: `${d.partners.find((p) => p.id === c.partnerId)?.name} · ${d.rentals.find((r) => r.id === c.rentalId)?.no}`, sub: fmt(c.amount.minor, c.amount.cur), cur: c.amount.cur })) },
  }
  const it = items[type]
  if (next) return <ApprovalRequestDialog type={next.type} target={next.target} cur={next.cur} onClose={onClose} />
  return (
    <FinanceDialog title={L('Yeni onay talebi', 'New approval request')} description={L('Önce türü ve hedef kaydı seçin; ardından tutar ve gerekçe istenir.', 'Choose the type and target record first; then the amount and reason are requested.')} confirm={L('Devam', 'Continue')} onClose={onClose}
      onSubmit={() => { if (!target) return L('Hedef kaydı seçin.', 'Choose the target record.'); const c = it.list.find((x) => x.id === target); setNext({ type, target: { type: it.type, id: target }, cur: type === 'refund' || type === 'partner_commission_adjustment' ? c?.cur : undefined }) }}>
      <SelectF id="nr-t" label={L('Onay türü', 'Approval type')} value={type} onChange={(v) => { setType(v as ApprovalType); setTarget('') }} options={APPROVAL_TYPES.map((t) => ({ id: t.type, label: loc(t.label) }))} />
      <ComboF id="nr-g" label={L('Hedef kayıt', 'Target record')} items={it.list} value={target} onChange={setTarget} />
    </FinanceDialog>
  )
}
