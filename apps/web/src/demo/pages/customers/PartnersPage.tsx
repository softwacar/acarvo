import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { fmt, sumByCur } from '../../core/money'
import { createPartner, payPartnerCommission, setPortalAccess, updateCommissionTerms } from '../../core/ops/commercial'
import type { Partner } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FinanceDialog, Kpis, Link2, Page, SearchBox } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { ActBtn, ActionRow, byCurText, DrawerSection, RecordDrawer, useAct } from '../fleet/common'

const KIND = () => ({ hotel: L('Otel', 'Hotel'), agency: L('Acente', 'Agency'), travel: L('Seyahat', 'Travel'), corporate_broker: L('Kurumsal aracı', 'Corporate broker') })
const TRIGGER = () => ({ delivered: L('Teslimde doğar', 'Earned at delivery'), returned: L('İadede doğar', 'Earned at return'), closed: L('Kapanışta doğar', 'Earned at closure') })

export function PartnersPage() {
  const d = useDb()
  const can = useCan()
  const kinds = KIND()
  const [q, setQ] = useUrlState('q')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const paidIds = new Set(d.partnerPayments.flatMap((x) => x.commissionIds))
  const unpaidOf = (p: Partner) => d.commissions.filter((c) => c.partnerId === p.id && !paidIds.has(c.id))
  const rows = d.partners.filter((p) => !q || `${p.no} ${p.name}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  const cols: Col<Partner>[] = [
    { id: 'name', header: L('Partner', 'Partner'), cell: (p) => <span className="font-medium text-blue">{p.name}</span>, sort: (p) => p.name, csv: (p) => p.name },
    { id: 'kind', header: L('Tür', 'Type'), cell: (p) => kinds[p.kind], hideBelow: 'md', csv: (p) => p.kind },
    { id: 'terms', header: L('Komisyon', 'Commission'), cell: (p) => `%${p.commission.pct} · ${TRIGGER()[p.commission.trigger]}`, hideBelow: 'md' },
    { id: 'due', header: L('Ödenmemiş komisyon', 'Unpaid commission'), align: 'right', cell: (p) => <span className="tnum">{byCurText(sumByCur(unpaidOf(p), (c) => c.amount), fmt)}</span> },
    { id: 'portal', header: L('Portal', 'Portal'), cell: (p) => (p.portalAccess ? L('Açık', 'On') : <span className="text-ink-3">{L('Kapalı', 'Off')}</span>), hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (p) => (p.status === 'active' ? L('Aktif', 'Active') : L('Duraklatıldı', 'Paused')), hideBelow: 'lg' },
  ]
  const current = d.partners.find((p) => p.id === sel)
  return (
    <Page
      title={L('Partnerler', 'Partners')}
      description={L('Komisyon doğmak ile ödenmek ayrıdır: doğan komisyon ödeme kaydıyla kapanır, oran değişirse yalnız sonraki kiralamalar etkilenir.', 'Earned and paid commission are separate: earned commission closes with a payment record, and a rate change affects only later rentals.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('partnerler', cols, rows)}>CSV</button>
          {can('partners:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Yeni partner', 'New partner')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Partner', 'Partners'), value: d.partners.length }, { label: L('Ödenmemiş komisyon', 'Unpaid commission'), value: byCurText(sumByCur(d.commissions.filter((c) => !paidIds.has(c.id)), (c) => c.amount), fmt), hint: L('Para birimi başına', 'Per currency') }, { label: L('Portal açık', 'Portal on'), value: d.partners.filter((p) => p.portalAccess).length }]} />
      <FilterBar onReset={() => setQ('')} active={q !== ''}>
        <SearchBox label={L('Partnerlerde ara', 'Search partners')} placeholder={L('Ad veya no…', 'Name or no…')} value={q} onChange={setQ} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(p) => p.id} label={L('Partner listesi', 'Partner list')} urlKey="pt" defaultSort={{ id: 'name', dir: 'asc' }} onRowClick={(p) => setSel(p.id)} empty={<Empty title={L('Partner yok', 'No partners')} />} />
      {adding && <NewPartnerDialog onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
      {current && <Drawer p={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ p, onClose }: { p: Partner; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'terms' | 'pay' | 'adjust'>(null)
  const paidIds = new Set(d.partnerPayments.flatMap((x) => x.commissionIds))
  const coms = d.commissions.filter((c) => c.partnerId === p.id).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
  const payments = d.partnerPayments.filter((x) => x.partnerId === p.id)
  const leads = d.leads.filter((l) => l.partnerId === p.id)
  const manage = can('partners:manage')
  return (
    <RecordDrawer title={p.name} subtitle={`${p.no} · ${KIND()[p.kind]}`} onClose={onClose} error={error}>
      <Facts single rows={[
        [L('Komisyon', 'Commission'), `%${p.commission.pct} · ${TRIGGER()[p.commission.trigger]} · ${L('sürüm', 'version')} ${p.commission.version}`],
        [L('Kişi', 'Contact'), `${p.contact.name} · ${p.contact.email} · ${p.contact.phone}`],
        [L('Ülke', 'Country'), p.country],
        [L('Portal erişimi', 'Portal access'), p.portalAccess ? L('Açık', 'On') : L('Kapalı', 'Off')],
        [L('Talepler', 'Leads'), leads.length],
      ]} />
      {manage && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={() => setDlg('terms')}>{L('Komisyon koşulu', 'Commission terms')}</ActBtn>
            <ActBtn onClick={() => act((s) => setPortalAccess(s, p.id, !p.portalAccess), p.portalAccess ? L('Portal erişimi kapatıldı.', 'Portal access turned off.') : L('Portal erişimi açıldı (davet gönderilmez).', 'Portal access turned on (no invitation is sent).'))}>{p.portalAccess ? L('Portal erişimini kapat', 'Turn portal off') : L('Portal erişimini aç', 'Turn portal on')}</ActBtn>
            {can('approvals:request') && coms.length > 0 && <ActBtn onClick={() => setDlg('adjust')}>{L('Komisyon düzeltme talebi', 'Request commission adjustment')}</ActBtn>}
            {can('finance:apply') && coms.some((c) => !paidIds.has(c.id)) && <ActBtn onClick={() => setDlg('pay')}>{L('Komisyon öde', 'Pay commission')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Komisyon kayıtları', 'Commission records')}>
        {coms.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Henüz doğan komisyon yok.', 'No commission earned yet.')}</p> : (
          <ul className="divide-y divide-line-soft text-[13.5px]">
            {coms.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span><Link2 type="rental" id={c.rentalId}>{d.rentals.find((r) => r.id === c.rentalId)?.no}</Link2><span className="block text-[12.5px] text-ink-2">{f.date(c.earnedAt)}{c.status === 'adjusted' ? ` · ${L('düzeltildi', 'adjusted')}` : ''}</span></span><span className="flex items-center gap-2"><span className="tnum font-medium">{fmt(c.amount.minor, c.amount.cur)}</span><span className={`rounded border px-2 py-0.5 text-[12px] font-medium ${paidIds.has(c.id) ? 'border-ok/40 bg-ok-soft text-ok' : 'border-hold/40 bg-hold-soft text-hold'}`}>{paidIds.has(c.id) ? L('Ödendi', 'Paid') : L('Doğdu, ödenmedi', 'Earned, unpaid')}</span></span></li>)}
          </ul>
        )}
      </DrawerSection>
      {payments.length > 0 && <DrawerSection title={L('Komisyon ödemeleri', 'Commission payments')}><ul className="divide-y divide-line-soft text-[13.5px]">{payments.map((x) => <li key={x.id} className="flex justify-between gap-2 py-2"><span>{x.reference}<span className="block text-[12.5px] text-ink-2">{f.date(x.paidAt)}</span></span><span className="tnum font-medium">{fmt(x.amount.minor, x.amount.cur)}</span></li>)}</ul></DrawerSection>}
      {dlg === 'terms' && <TermsDialog p={p} onClose={() => setDlg(null)} />}
      {dlg === 'pay' && <PayDialog p={p} onClose={() => setDlg(null)} />}
      {dlg === 'adjust' && <AdjustDialog p={p} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function TermsDialog({ p, onClose }: { p: Partner; onClose: () => void }) {
  const [pct, setPct] = useState(String(p.commission.pct))
  const [trigger, setTrigger] = useState(p.commission.trigger)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Komisyon koşulu', 'Commission terms')} description={L('Yeni koşul yeni sürüm olur ve yalnız bundan sonra komisyon doğuracak kiralamalara uygulanır; doğmuş komisyonlar değişmez.', 'The new terms become a new version and apply only to rentals that earn from now on; earned commissions do not change.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => updateCommissionTerms(s, p.id, Number(pct), trigger), L('Komisyon koşulu güncellendi (yeni sürüm).', 'Commission terms updated (new version).')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <TextF id="tm-p" label={L('Oran (%)', 'Rate (%)')} required value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} error={fields.pct} />
      <SelectF id="tm-t" label={L('Ne zaman doğar', 'Earned when')} value={trigger} onChange={(v) => setTrigger(v as typeof trigger)} options={Object.entries(TRIGGER()).map(([id, label]) => ({ id, label }))} />
    </FinanceDialog>
  )
}

function PayDialog({ p, onClose }: { p: Partner; onClose: () => void }) {
  const d = useDb()
  const paid = new Set(d.partnerPayments.flatMap((x) => x.commissionIds))
  const open = d.commissions.filter((c) => c.partnerId === p.id && !paid.has(c.id))
  const [sel, setSel] = useState<string[]>(open.map((c) => c.id))
  const [ref, setRef] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Komisyon öde', 'Pay commission')} description={L('Ödeme bir finans kaydıdır; banka veya ödeme servisi çağrılmaz. Tek ödemede yalnız aynı para birimindeki komisyonlar toplanır.', 'The payment is a finance record; no bank or payment service is called. A single payment sums commissions of one currency only.')} confirm={L('Ödemeyi kaydet', 'Record payment')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => payPartnerCommission(s, p.id, sel, ref), L('Komisyon ödemesi kaydedildi.', 'Commission payment recorded.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <ul className="space-y-1.5">
        {open.map((c) => <li key={c.id}><CheckF id={`py-${c.id}`} checked={sel.includes(c.id)} onChange={(v) => setSel((x) => (v ? [...x, c.id] : x.filter((y) => y !== c.id)))}>{d.rentals.find((r) => r.id === c.rentalId)?.no} · {fmt(c.amount.minor, c.amount.cur)}</CheckF></li>)}
      </ul>
      <TextF id="py-r" label={L('Ödeme referansı', 'Payment reference')} required value={ref} onChange={setRef} error={fields.reference} />
    </FinanceDialog>
  )
}

function NewPartnerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Partner['kind']>('agency')
  const [country, setCountry] = useState('BA')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pct, setPct] = useState('10')
  const [trigger, setTrigger] = useState<Partner['commission']['trigger']>('closed')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Yeni partner', 'New partner')} description={L('Komisyon oranı 0–50 arasında olmalı. Portal erişimi varsayılan olarak kapalıdır.', 'The commission rate must be 0–50. Portal access is off by default.')} confirm={L('Oluştur', 'Create')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => createPartner(s, { name, kind, country, contactName: contact, email, phone, pct: Number(pct), trigger }), L('Partner oluşturuldu.', 'Partner created.')); if (!r.ok) { setFields(r.fields); return r.error } onCreated(r.value.id); onClose() }}>
      <TextF id="np-n" label={L('Partner adı', 'Partner name')} required value={name} onChange={setName} error={fields.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="np-k" label={L('Tür', 'Type')} value={kind} onChange={(v) => setKind(v as Partner['kind'])} options={Object.entries(KIND()).map(([id, label]) => ({ id, label }))} />
        <TextF id="np-c" label={L('Ülke (ISO)', 'Country (ISO)')} value={country} onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))} />
        <TextF id="np-cn" label={L('İletişim kişisi', 'Contact person')} value={contact} onChange={setContact} />
        <TextF id="np-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} />
        <TextF id="np-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} />
        <TextF id="np-pc" label={L('Komisyon (%)', 'Commission (%)')} value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} error={fields.pct} />
      </div>
      <SelectF id="np-t" label={L('Ne zaman doğar', 'Earned when')} value={trigger} onChange={(v) => setTrigger(v as typeof trigger)} options={Object.entries(TRIGGER()).map(([id, label]) => ({ id, label }))} />
    </FinanceDialog>
  )
}

function AdjustDialog({ p, onClose }: { p: Partner; onClose: () => void }) {
  const d = useDb()
  const coms = d.commissions.filter((c) => c.partnerId === p.id)
  const [id, setId] = useState('')
  const chosen = coms.find((c) => c.id === id)
  if (chosen) return <ApprovalRequestDialog type="partner_commission_adjustment" target={{ type: 'partner', id: chosen.id }} cur={chosen.amount.cur} onClose={onClose} hint={L('Doğmuş komisyon tutarını düzeltmek için talep açın; ödenmişse ödeme değişmez.', 'Open a request to correct an earned commission amount; a payment already made does not change.')} />
  return (
    <FinanceDialog title={L('Komisyon düzeltme talebi', 'Commission adjustment request')} description={L('Düzeltilecek komisyon kaydını seçin.', 'Choose the commission record to adjust.')} confirm={L('Devam', 'Continue')} onClose={onClose} onSubmit={() => (id ? undefined : L('Komisyon seçin.', 'Choose a commission.'))}>
      <SelectF id="aj-c" label={L('Komisyon', 'Commission')} value={id} onChange={setId} placeholder={L('Seçin', 'Choose')} options={coms.map((c) => ({ id: c.id, label: `${d.rentals.find((r) => r.id === c.rentalId)?.no} · ${fmt(c.amount.minor, c.amount.cur)}` }))} />
    </FinanceDialog>
  )
}
