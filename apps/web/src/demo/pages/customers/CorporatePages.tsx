import { Plus } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { projectCorporateExposure, rentalFinance } from '../../core/calc/finance'
import { fmt, parseAmount, sumByCur, toInput } from '../../core/money'
import { createCorporate, setCreditLimit } from '../../core/ops/commercial'
import type { CorporateAccount } from '../../core/types'
import { L } from '../../i18n'
import { MoneyF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { BackLink, btnPrimary, btnSecondary, btnSmall, Empty, Facts, FilterBar, FinanceDialog, Kpis, Link2, Notice, Page, Panel, SearchBox, Status, Tabs } from '../../ui/kit'
import { CustomerLink } from '../../ui/domain'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { byCurText } from '../fleet/common'

export function CorporateListPage() {
  const d = useDb()
  const can = useCan()
  const navigate = useNavigate()
  const [q, setQ] = useUrlState('q')
  const [adding, setAdding] = useState(false)
  const rows = d.corporates.filter((c) => !q || `${c.no} ${c.name} ${c.taxId}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  const exposure = (c: CorporateAccount) => projectCorporateExposure(d, c.id)
  const cols: Col<CorporateAccount>[] = [
    { id: 'name', header: L('Hesap', 'Account'), cell: (c) => <Link to={`/kurumsal-hesaplar/${c.id}` as never} className="font-medium text-blue hover:underline">{c.name}</Link>, sort: (c) => c.name, csv: (c) => c.name },
    { id: 'no', header: L('No', 'No'), cell: (c) => <span className="tnum whitespace-nowrap">{c.no}</span>, hideBelow: 'md', csv: (c) => c.no },
    { id: 'tax', header: L('Vergi no', 'Tax ID'), cell: (c) => <span className="tnum">{c.taxId}</span>, hideBelow: 'lg', csv: (c) => c.taxId },
    { id: 'lim', header: L('Kredi limiti', 'Credit limit'), cell: (c) => exposure(c).filter((e) => e.limitMinor !== null).map((e) => fmt(e.limitMinor!, e.cur)).join(' · ') || <span className="text-hold">{L('Tanımsız', 'Not defined')}</span>, hideBelow: 'md' },
    { id: 'exp', header: L('Maruziyet', 'Exposure'), cell: (c) => exposure(c).filter((e) => e.exposureMinor > 0).map((e) => fmt(e.exposureMinor, e.cur)).join(' · ') || <span className="text-ink-3">—</span> },
    { id: 'st', header: L('Durum', 'Status'), cell: (c) => (c.status === 'active' ? L('Aktif', 'Active') : L('Arşiv', 'Archived')), hideBelow: 'lg' },
  ]
  return (
    <Page
      title={L('Kurumsal Hesaplar', 'Corporate Accounts')}
      description={L('Kredi limiti para birimi başınadır; tanımsız limit sınırsız demek değildir. Limit aşımı yalnız onaylı bir kurumsal kredi istisnasıyla geçilir.', 'Credit limits are per currency; an undefined limit is not unlimited. A limit breach is passed only with an approved corporate credit exception.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('kurumsal', cols, rows)}>CSV</button>
          {can('corporate:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Yeni hesap', 'New account')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Hesap', 'Accounts'), value: d.corporates.length }, { label: L('Limitsiz tanımlı', 'No limit defined'), value: d.corporates.filter((c) => Object.keys(c.creditLimits).length === 0).length, tone: 'hold', hint: L('Limit tanımlanmalı', 'A limit must be defined') }]} />
      <FilterBar onReset={() => setQ('')} active={q !== ''}>
        <SearchBox label={L('Kurumsal hesaplarda ara', 'Search accounts')} placeholder={L('Ad, no, vergi no…', 'Name, no, tax ID…')} value={q} onChange={setQ} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(c) => c.id} label={L('Kurumsal hesap listesi', 'Corporate account list')} urlKey="kh" defaultSort={{ id: 'name', dir: 'asc' }} onRowClick={(c) => void navigate({ to: `/kurumsal-hesaplar/${c.id}` as never })} empty={<Empty title={L('Kurumsal hesap yok', 'No accounts')} />} />
      {adding && <NewDialog onClose={() => setAdding(false)} onCreated={(id) => void navigate({ to: `/kurumsal-hesaplar/${id}` as never })} />}
    </Page>
  )
}

function NewDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [country, setCountry] = useState('BA')
  const [address, setAddress] = useState('')
  const [terms, setTerms] = useState('30')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Yeni kurumsal hesap', 'New corporate account')} description={L('Aynı vergi numarası iki hesapta kullanılamaz. Hesap açıldığında kredi limiti tanımsızdır; limit sonra para birimi başına girilir.', 'The same tax ID cannot be used twice. A new account has no credit limit; limits are set per currency afterwards.')} confirm={L('Oluştur', 'Create')} onClose={onClose}
      onSubmit={() => {
        const r = runAction((s) => { createCorporate(s, { name, taxId, country, address, paymentTermsDays: Number(terms) || 30 }); return s.corporates[s.corporates.length - 1]!.id }, L('Kurumsal hesap oluşturuldu.', 'Corporate account created.'))
        if (!r.ok) { setFields(r.fields); return r.error }
        onCreated(r.value)
        onClose()
      }}>
      <TextF id="co-n" label={L('Şirket adı', 'Company name')} required value={name} onChange={setName} error={fields.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="co-t" label={L('Vergi numarası', 'Tax ID')} required value={taxId} onChange={setTaxId} error={fields.taxId} />
        <TextF id="co-c" label={L('Ülke (ISO)', 'Country (ISO)')} value={country} onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))} />
      </div>
      <TextF id="co-a" label={L('Adres', 'Address')} value={address} onChange={setAddress} />
      <TextF id="co-p" label={L('Ödeme vadesi (gün)', 'Payment terms (days)')} value={terms} onChange={(v) => setTerms(v.replace(/\D/g, ''))} />
    </FinanceDialog>
  )
}

type TabId = 'ozet' | 'limit' | 'ekstre' | 'surucu'

export function Corporate360Page() {
  const { id } = useParams({ strict: false }) as { id: string }
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [tab, setTab] = useUrlState('sekme', 'ozet')
  const [dlg, setDlg] = useState<null | { kind: 'limit'; cur: string } | { kind: 'override' }>(null)
  const c = d.corporates.find((x) => x.id === id)
  if (!c)
    return (
      <div className="space-y-4">
        <BackLink to="/kurumsal-hesaplar" label={L('Kurumsal Hesaplar', 'Corporate Accounts')} />
        <Empty title={L('Hesap bulunamadı', 'Account not found')} />
      </div>
    )
  const exp = projectCorporateExposure(d, c.id)
  const agreement = d.agreements.find((a) => a.id === c.agreementId)
  const rentals = d.rentals.filter((r) => r.corporateId === c.id).sort((a, b) => b.plannedPickupAt.localeCompare(a.plannedPickupAt))
  const reservations = d.reservations.filter((r) => r.corporateId === c.id && ['pending', 'confirmed'].includes(r.status))
  const owed = sumByCur(rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)), (r) => ({ minor: rentalFinance(d, r.id).outstandingMinor, cur: r.currency }))
  const approvals = d.approvals.filter((a) => a.target.id === c.id)
  const undefinedCurs = d.settings.acceptedCurrencies.filter((cur) => c.creditLimits[cur] === undefined)
  return (
    <div className="space-y-4">
      <BackLink to="/kurumsal-hesaplar" label={L('Kurumsal Hesaplar', 'Corporate Accounts')} />
      <Page
        title={c.name}
        description={`${c.no} · ${L('vergi no', 'tax ID')} ${c.taxId} · ${c.country} · ${L('vade', 'terms')} ${c.paymentTermsDays} ${L('gün', 'days')}`}
        actions={
          <>
            {can('reservations:manage') && <Link to={'/rezervasyonlar/yeni' as never} className={btnSecondary}>{L('Rezervasyon oluştur', 'Create reservation')}</Link>}
            {can('approvals:request') && <button type="button" className={btnPrimary} onClick={() => setDlg({ kind: 'override' })}>{L('Kredi istisnası iste', 'Request credit exception')}</button>}
          </>
        }
      >
        <Kpis items={[{ label: L('Açık bakiye', 'Open balance'), value: byCurText(owed, fmt), hint: L('Para birimi başına', 'Per currency') }, { label: L('Aktif kiralama', 'Active rentals'), value: rentals.filter((r) => ['prepared', 'delivered'].includes(r.status)).length }, { label: L('Bekleyen rezervasyon', 'Open reservations'), value: reservations.length }]} />
        <Tabs<TabId> label={L('Hesap bölümleri', 'Account sections')} value={tab as TabId} onChange={setTab} tabs={[{ id: 'ozet', label: L('Özet', 'Overview') }, { id: 'limit', label: L('Kredi ve maruziyet', 'Credit and exposure') }, { id: 'ekstre', label: L('Ekstre', 'Statement') }, { id: 'surucu', label: L('Sürücüler', 'Drivers'), count: c.driverCustomerIds.length }]} />
        {tab === 'ozet' && (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel title={L('Hesap', 'Account')}>
              <Facts rows={[[L('Adres', 'Address'), c.address || '—'], [L('Anlaşma', 'Agreement'), agreement ? `${agreement.name} · %${agreement.discountPct}` : L('Anlaşma yok', 'None')], [L('Durum', 'Status'), c.status === 'active' ? L('Aktif', 'Active') : L('Arşiv', 'Archived')]]} />
            </Panel>
            <Panel title={L('İletişim kişileri', 'Contacts')}>
              {c.contacts.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Kişi yok.', 'No contacts.')}</p> : <ul className="divide-y divide-line-soft">{c.contacts.map((x) => <li key={x.email} className="py-2 text-[13.5px]"><span className="font-medium">{x.name}</span> · {x.role}<span className="block text-[12.5px] text-ink-2">{x.phone} · {x.email}</span></li>)}</ul>}
            </Panel>
            <Panel title={L('Onay talepleri', 'Approval requests')} className="lg:col-span-2">
              {approvals.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Bu hesap için talep yok.', 'No requests for this account.')}</p> : <ul className="divide-y divide-line-soft">{approvals.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]"><Link2 type="approval" id={a.id}>{a.no}</Link2><span className="text-ink-2">{a.reason}</span><Status kind="approval" value={a.status} /></li>)}</ul>}
            </Panel>
          </div>
        )}
        {tab === 'limit' && (
          <div className="space-y-4">
            {undefinedCurs.length > 0 && <Notice tone="hold">{L(`Limit tanımsız: ${undefinedCurs.join(', ')}. Tanımsız limit sınırsız sayılmaz; bu para biriminde kurumsal rezervasyon onaylanamaz.`, `No limit defined: ${undefinedCurs.join(', ')}. An undefined limit is not unlimited; a corporate reservation cannot be confirmed in that currency.`)}</Notice>}
            <Panel title={L('Para birimi başına limit ve maruziyet', 'Limit and exposure per currency')} description={L('Taahhüt = onaylı rezervasyon ve hazırlanan kiralama (henüz kalem yok). Alacak = kesilmiş kalemlerin açık tutarı. Teslim edilmiş kiralama bir kez, alacak olarak sayılır.', 'Committed = confirmed reservations and prepared rentals (no charge yet). Receivable = outstanding posted charges. A delivered rental is counted once, as receivable.')} flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13.5px]">
                  <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-5 py-2 font-medium">{L('Para birimi', 'Currency')}</th><th className="px-2 py-2 text-right font-medium">{L('Limit', 'Limit')}</th><th className="px-2 py-2 text-right font-medium">{L('Taahhüt', 'Committed')}</th><th className="px-2 py-2 text-right font-medium">{L('Alacak', 'Receivable')}</th><th className="px-2 py-2 text-right font-medium">{L('İstisna payı', 'Override')}</th><th className="px-2 py-2 text-right font-medium">{L('Kalan', 'Headroom')}</th><th className="px-5 py-2" /></tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {exp.map((e) => (
                      <tr key={e.cur}>
                        <td className="px-5 py-2.5 font-medium">{e.cur}</td>
                        <td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{e.limitMinor === null ? <span className="text-hold">{L('Tanımsız', 'Undefined')}</span> : fmt(e.limitMinor, e.cur)}</td>
                        <td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{fmt(e.committedMinor, e.cur)}</td>
                        <td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{fmt(e.postedReceivableMinor, e.cur)}</td>
                        <td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{e.overrideMinor ? fmt(e.overrideMinor, e.cur) : '—'}</td>
                        <td className={`tnum whitespace-nowrap px-2 py-2.5 text-right font-medium ${e.headroomMinor !== null && e.headroomMinor < 0 ? 'text-alert' : ''}`}>{e.headroomMinor === null ? '—' : fmt(e.headroomMinor, e.cur)}</td>
                        <td className="px-5 py-2.5 text-right">{can('corporate:manage') && <button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'limit', cur: e.cur })}>{L('Limit', 'Limit')}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {can('corporate:manage') && undefinedCurs.length > 0 && <div className="border-t border-line-soft px-5 py-3"><button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'limit', cur: undefinedCurs[0]! })}><Plus size={13} /> {L('Yeni para birimi limiti', 'Add a currency limit')}</button></div>}
            </Panel>
          </div>
        )}
        {tab === 'ekstre' && (
          <Panel title={L('Ekstre', 'Statement')} description={L('Kiralama bazında kalemler ve ödemeler; para birimleri karıştırılmaz.', 'Charges and payments per rental; currencies are never mixed.')} flush>
            {rentals.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Kiralama yok.', 'No rentals.')}</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13.5px]">
                <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-5 py-2 font-medium">{L('Kiralama', 'Rental')}</th><th className="px-2 py-2 font-medium">{L('Tarih', 'Date')}</th><th className="px-2 py-2 text-right font-medium">{L('Kalem', 'Charged')}</th><th className="px-2 py-2 text-right font-medium">{L('Ödenen', 'Paid')}</th><th className="px-5 py-2 text-right font-medium">{L('Kalan', 'Outstanding')}</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)).map((r) => { const x = rentalFinance(d, r.id); return <tr key={r.id}><td className="px-5 py-2.5"><Link2 type="rental" id={r.id}>{r.no}</Link2></td><td className="tnum px-2 py-2.5">{f.date(r.plannedPickupAt, r.pickupBranchId)}</td><td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{fmt(x.chargesMinor, x.cur)}</td><td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{fmt(x.appliedMinor, x.cur)}</td><td className="tnum whitespace-nowrap px-5 py-2.5 text-right font-medium">{fmt(x.outstandingMinor, x.cur)}</td></tr> })}
                </tbody>
              </table></div>
            )}
          </Panel>
        )}
        {tab === 'surucu' && (
          <Panel title={L('Yetkili sürücüler', 'Authorised drivers')}>
            {c.driverCustomerIds.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Tanımlı sürücü yok.', 'No drivers defined.')}</p> : <ul className="divide-y divide-line-soft">{c.driverCustomerIds.map((id) => <li key={id} className="py-2.5 text-[13.5px]"><CustomerLink c={d.customers.find((x) => x.id === id)} /></li>)}</ul>}
          </Panel>
        )}
      </Page>
      {dlg?.kind === 'limit' && <LimitDialog c={c} cur={dlg.cur} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'override' && <ApprovalRequestDialog type="corporate_credit_override" target={{ type: 'corporate', id: c.id }} onClose={() => setDlg(null)} hint={L('Limit aşımı için ek pay isteyin.', 'Request an extra allowance for a limit breach.')} />}
    </div>
  )
}

function LimitDialog({ c, cur: initial, onClose }: { c: CorporateAccount; cur: string; onClose: () => void }) {
  const d = useDb()
  const [cur, setCur] = useState(initial)
  const [amount, setAmount] = useState(c.creditLimits[initial] !== undefined ? toInput(c.creditLimits[initial]!, initial) : '')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Kredi limiti', 'Credit limit')} description={L('Limit para birimi başınadır. Boş bırakıp kaydetmek limiti "tanımsız" yapar (sınırsız değil).', 'The limit is per currency. Leaving it empty makes it "undefined" (not unlimited).')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => {
        const minor = amount.trim() === '' ? null : parseAmount(amount, cur)
        if (amount.trim() !== '' && minor === null) { setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') }); return L('Tutar geçersiz.', 'Invalid amount.') }
        const r = runAction((s) => setCreditLimit(s, c.id, cur, minor), L('Kredi limiti güncellendi.', 'Credit limit updated.'))
        if (!r.ok) return r.error
        onClose()
      }}>
      <MoneyF id="cl-a" label={L('Limit', 'Limit')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} error={fields.amount} />
    </FinanceDialog>
  )
}
