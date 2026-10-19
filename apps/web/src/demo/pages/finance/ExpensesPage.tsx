import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { userName } from '../../core/helpers'
import { fmt, parseAmount, sumByCur } from '../../core/money'
import { createExpense, EXPENSE_CATEGORIES, postExpense, voidExpense } from '../../core/ops/control'
import { dayOf } from '../../core/time'
import type { Expense } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, CheckF, DateF, MoneyF, SelectF, TextF, branchOptions } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Page, SearchBox, Status } from '../../ui/kit'
import { expenseCategoryLabel } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, byCurText, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'

export function ExpensesPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [cat, setCat] = useUrlState('kategori', 'all')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const scoped = d.expenses.filter((e) => active.includes(e.branchId))
  const rows = scoped
    .filter((e) => (cat === 'all' ? true : e.category === cat))
    .filter((e) => (status === 'all' ? true : e.status === status))
    .filter((e) => !q || `${e.no} ${e.vendor} ${e.category}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))
  const posted = scoped.filter((e) => e.status === 'posted')
  const cols: Col<Expense>[] = [
    { id: 'no', header: L('Masraf', 'Expense'), cell: (e) => <span className="tnum whitespace-nowrap font-medium text-blue">{e.no}</span>, sort: (e) => e.no, csv: (e) => e.no },
    { id: 'date', header: L('Tarih', 'Date'), cell: (e) => <span className="tnum">{e.date}</span>, sort: (e) => e.date, csv: (e) => e.date },
    { id: 'vendor', header: L('Alıcı', 'Vendor'), cell: (e) => e.vendor, csv: (e) => e.vendor },
    { id: 'cat', header: L('Kategori', 'Category'), cell: (e) => expenseCategoryLabel(e.category), hideBelow: 'md', csv: (e) => expenseCategoryLabel(e.category) },
    { id: 'amt', header: L('Tutar', 'Amount'), align: 'right', cell: (e) => <span className={`tnum whitespace-nowrap ${e.status === 'voided' ? 'text-ink-3 line-through' : ''}`}>{fmt(e.amount.minor, e.amount.cur)}</span>, sort: (e) => e.amount.minor, csv: (e) => e.amount.minor },
    { id: 'st', header: L('Durum', 'Status'), cell: (e) => <Status kind="expense" value={e.status} />, csv: (e) => e.status },
  ]
  const current = d.expenses.find((e) => e.id === sel)
  return (
    <Page
      title={L('Masraflar', 'Expenses')}
      description={L('İade, depozito ve komisyon masraf değildir. Bakım ve ceza masrafları kaynak kayıttan gelir ve burada kilitlidir. Toplamlar para birimi başınadır.', 'Refunds, deposits and commissions are not expenses. Maintenance and fine expenses come from their source record and are locked here. Totals are per currency.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('masraflar', cols, rows)}>CSV</button>
          {can('expenses:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Masraf ekle', 'Add expense')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Kaydedilen masraf', 'Posted expenses'), value: byCurText(sumByCur(posted, (e) => e.amount), fmt), hint: L('Para birimi başına', 'Per currency') }, { label: L('Taslak', 'Drafts'), value: scoped.filter((e) => e.status === 'draft').length }, { label: L('Kaynağa bağlı', 'Source-linked'), value: scoped.filter((e) => e.sourceType).length }]} />
      <FilterBar onReset={() => { setQ(''); setCat('all'); setStatus('all') }} active={q !== '' || cat !== 'all' || status !== 'all'}>
        <SearchBox label={L('Masraflarda ara', 'Search expenses')} placeholder={L('No, alıcı, kategori…', 'No, vendor, category…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Kategori', 'Category')} value={cat} onChange={setCat} options={[{ id: 'all', label: L('Tümü', 'All') }, ...EXPENSE_CATEGORIES.map((c) => ({ id: c, label: expenseCategoryLabel(c) }))]} />
        <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'draft', label: L('Taslak', 'Draft') }, { id: 'posted', label: L('Kaydedildi', 'Posted') }, { id: 'voided', label: L('İptal', 'Voided') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(e) => e.id} label={L('Masraf listesi', 'Expense list')} urlKey="ms" defaultSort={{ id: 'date', dir: 'desc' }} onRowClick={(e) => setSel(e.id)} empty={<Empty title={L('Bu filtrelerle masraf yok', 'No expenses match')} />} />
      {adding && <NewDialog onClose={() => setAdding(false)} />}
      {current && <Drawer e={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ e, onClose }: { e: Expense; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const { act, error } = useAct()
  const [voiding, setVoiding] = useState(false)
  const manage = can('expenses:manage')
  const source = e.sourceType === 'maintenance' ? d.maintenance.find((m) => m.id === e.sourceId) : e.sourceType === 'fine' ? d.fines.find((x) => x.id === e.sourceId) : undefined
  return (
    <RecordDrawer title={e.no} subtitle={e.vendor} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="expense" value={e.status} />],
          [L('Kategori', 'Category'), expenseCategoryLabel(e.category)],
          [L('Tutar', 'Amount'), fmt(e.amount.minor, e.amount.cur)],
          [L('Tarih', 'Date'), e.date],
          [L('Şube', 'Branch'), d.branches.find((b) => b.id === e.branchId)?.name],
          [L('Kaynak', 'Source'), e.sourceType && source ? <Link2 key="src" type={e.sourceType === 'maintenance' ? 'maintenance' : 'fine'} id={e.sourceId!}>{(source as { no: string }).no}</Link2> : L('Elle girildi', 'Entered manually')],
          [L('Kaydeden', 'Created by'), userName(d, e.createdBy)],
          [L('Not', 'Note'), e.note || '—'],
          ...(e.voidReason ? [[L('İptal gerekçesi', 'Void reason'), e.voidReason] as [string, string]] : []),
        ]}
      />
      {e.sourceType && <p className="text-[13px] text-ink-2">{L('Bu masraf kaynak kayıttan gelir ve burada değiştirilemez; kaynak kaydı düzeltin.', 'This expense comes from its source record and cannot be changed here; correct the source record.')}</p>}
      {manage && !e.sourceType && e.status !== 'voided' && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {e.status === 'draft' && <ActBtn onClick={() => act((s) => postExpense(s, e.id), L('Masraf kaydedildi.', 'Expense posted.'))}>{L('Kaydet (işle)', 'Post')}</ActBtn>}
            <ActBtn onClick={() => setVoiding(true)}>{L('İptal et', 'Void')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      {voiding && <PromptDialog title={L('Masrafı iptal et', 'Void expense')} description={L('Silinmez; gerekçeyle iptal olarak kalır.', 'Not deleted; it stays as voided with a reason.')} label={L('Gerekçe', 'Reason')} confirm={L('İptal et', 'Void')} danger rows={2} run={(t) => act((s) => voidExpense(s, e.id, t), L('Masraf iptal edildi.', 'Expense voided.')) as never} onClose={() => setVoiding(false)} />}
    </RecordDrawer>
  )
}

function NewDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const { active } = useBranchScope()
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]!)
  const [vendor, setVendor] = useState('')
  const [branch, setBranch] = useState(active[0] ?? d.branches[0]!.id)
  const [date, setDate] = useState(dayOf(d.clock.now, d.settings.company.tz))
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [note, setNote] = useState('')
  const [post, setPost] = useState(true)
  const [cash, setCash] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const drawer = d.drawers.find((x) => x.branchId === branch && x.currency === cur)
  return (
    <FinanceDialog
      title={L('Masraf ekle', 'Add expense')}
      description={L('Nakit ödenen masraf açık kasadan çıkar; kart veya havale ile ödenen masraf kasayı etkilemez.', 'A cash-paid expense leaves an open drawer; a card or transfer expense does not touch the drawer.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const minor = parseAmount(amount, cur)
        if (minor === null) {
          setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') })
          return L('Tutar geçersiz.', 'Invalid amount.')
        }
        const r = runAction((s) => createExpense(s, { category, vendor, branchId: branch, date, amount: { minor, cur }, note, post, cashDrawerId: cash && post ? drawer?.id : undefined }), L('Masraf kaydedildi.', 'Expense saved.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="ex-c" label={L('Kategori', 'Category')} value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ id: c, label: expenseCategoryLabel(c) }))} error={fields.category} />
        <SelectF id="ex-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d, active)} />
        <TextF id="ex-v" label={L('Alıcı / tedarikçi', 'Vendor')} required value={vendor} onChange={setVendor} error={fields.vendor} />
        <DateF id="ex-d" label={L('Tarih', 'Date')} required value={date} onChange={setDate} error={fields.date} />
      </div>
      <MoneyF id="ex-a" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} error={fields.amount} />
      <AreaF id="ex-n" label={L('Not', 'Note')} value={note} onChange={setNote} rows={2} />
      <CheckF id="ex-p" checked={post} onChange={setPost}>{L('Hemen kaydet (işaretlenmezse taslak)', 'Post now (draft if unticked)')}</CheckF>
      {post && drawer && <CheckF id="ex-cash" checked={cash} onChange={setCash}>{L(`Nakit ödendi: ${drawer.name} kasasından çıksın`, `Paid in cash: take it out of ${drawer.name}`)}</CheckF>}
    </FinanceDialog>
  )
}
