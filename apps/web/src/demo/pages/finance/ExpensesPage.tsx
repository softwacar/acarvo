import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { SOURCE_CATEGORIES, vehicleCost } from '../../core/calc/cost'
import { userName } from '../../core/helpers'
import { fmt, parseAmount, sumByCur } from '../../core/money'
import { createExpense, EXPENSE_CATEGORIES, postExpense, voidExpense } from '../../core/ops/control'
import { dayOf } from '../../core/time'
import type { Db, Expense, ExpenseLink } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, CheckF, ComboF, DateF, MoneyF, SelectF, TextF, branchOptions } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Notice, Page, SearchBox, Status } from '../../ui/kit'
import { expenseCategoryLabel } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, byCurText, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'
import { vehicleItems } from '../shared/FleetDialogs'

// Expenses (decision document K-17): every expense says what it belongs to — a vehicle, a branch, the business in general, or a
// source record (maintenance, fines). A source expense is a locked mirror of its record, so the same cost is never counted twice.

const LINK_LABEL = (): Record<ExpenseLink, string> => ({ vehicle: L('Araç', 'Vehicle'), branch: L('Şube', 'Branch'), general: L('Genel işletme', 'General'), source: L('Kaynak işlem', 'Source record') })

function linkText(d: Db, e: Expense): string {
  if (e.link === 'vehicle') return `${LINK_LABEL().vehicle}: ${d.vehicles.find((v) => v.id === e.vehicleId)?.plate ?? '—'}`
  if (e.link === 'source') return `${LINK_LABEL().source}: ${e.sourceType === 'maintenance' ? L('Bakım', 'Maintenance') : e.sourceType === 'fine' ? L('Ceza', 'Fine') : e.sourceType}${e.vehicleId ? ` · ${d.vehicles.find((v) => v.id === e.vehicleId)?.plate}` : ''}`
  if (e.link === 'general') return LINK_LABEL().general
  return `${LINK_LABEL().branch}: ${d.branches.find((b) => b.id === e.branchId)?.code ?? '—'}`
}

export function ExpensesPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [cat, setCat] = useUrlState('kategori', 'all')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [link, setLink] = useUrlState('bag', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const scoped = d.expenses.filter((e) => active.includes(e.branchId))
  const rows = scoped
    .filter((e) => (cat === 'all' ? true : e.category === cat))
    .filter((e) => (status === 'all' ? true : e.status === status))
    .filter((e) => (link === 'all' ? true : e.link === link))
    .filter((e) => !q || `${e.no} ${e.vendor} ${e.category}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))
  const posted = scoped.filter((e) => e.status === 'posted')
  const cols: Col<Expense>[] = [
    { id: 'no', header: L('Masraf', 'Expense'), cell: (e) => <span className="tnum whitespace-nowrap font-medium text-blue">{e.no}</span>, sort: (e) => e.no, csv: (e) => e.no },
    { id: 'date', header: L('Tarih', 'Date'), cell: (e) => <span className="tnum">{e.date}</span>, sort: (e) => e.date, csv: (e) => e.date },
    { id: 'vendor', header: L('Alıcı', 'Vendor'), cell: (e) => e.vendor, csv: (e) => e.vendor },
    { id: 'link', header: L('Bağlı olduğu', 'Belongs to'), cell: (e) => linkText(d, e), hideBelow: 'md', csv: (e) => linkText(d, e) },
    { id: 'cat', header: L('Kategori', 'Category'), cell: (e) => expenseCategoryLabel(e.category), hideBelow: 'lg', csv: (e) => expenseCategoryLabel(e.category) },
    { id: 'amt', header: L('Tutar', 'Amount'), align: 'right', cell: (e) => <span className={`tnum whitespace-nowrap ${e.status === 'voided' ? 'text-ink-3 line-through' : ''}`}>{fmt(e.amount.minor, e.amount.cur)}</span>, sort: (e) => e.amount.minor, csv: (e) => e.amount.minor },
    { id: 'st', header: L('Durum', 'Status'), cell: (e) => <Status kind="expense" value={e.status} />, csv: (e) => e.status },
  ]
  const current = d.expenses.find((e) => e.id === sel)
  return (
    <Page
      title={L('Masraflar', 'Expenses')}
      description={L('Her masraf neye ait olduğunu söyler: araç, şube, genel işletme ya da kaynak işlem. İade, depozito ve komisyon masraf değildir. Bakım ve ceza masrafları kaynak kayıttan gelir, burada kilitlidir ve ikinci bir gider olarak sayılmaz. Toplamlar para birimi başınadır.', 'Every expense says what it belongs to: a vehicle, a branch, the business in general, or a source record. Refunds, deposits and commissions are not expenses. Maintenance and fine expenses come from their source record, are locked here and are never counted as a second cost. Totals are per currency.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('masraflar', cols, rows)}>CSV</button>
          {can('expenses:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Masraf ekle', 'Add expense')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Kaydedilen masraf', 'Posted expenses'), value: byCurText(sumByCur(posted, (e) => e.amount), fmt), hint: L('Para birimi başına', 'Per currency') },
          { label: L('Taslak', 'Drafts'), value: scoped.filter((e) => e.status === 'draft').length },
          { label: L('Kaynak işlemden', 'From a source record'), value: scoped.filter((e) => e.link === 'source').length, hint: L('Bakım, ceza; kilitli', 'Maintenance, fines; locked') },
          { label: L('Araca bağlı', 'Vehicle-linked'), value: scoped.filter((e) => e.link === 'vehicle').length },
          { label: L('Genel işletme', 'General'), value: scoped.filter((e) => e.link === 'general').length },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setCat('all'); setStatus('all'); setLink('all') }} active={q !== '' || cat !== 'all' || status !== 'all' || link !== 'all'}>
        <SearchBox label={L('Masraflarda ara', 'Search expenses')} placeholder={L('No, alıcı, kategori…', 'No, vendor, category…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Bağlı olduğu', 'Belongs to')} value={link} onChange={setLink} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(LINK_LABEL()).map(([id, label]) => ({ id, label }))]} />
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
  const vehicle = d.vehicles.find((v) => v.id === e.vehicleId)
  const cost = vehicle ? vehicleCost(d, vehicle.id) : null
  return (
    <RecordDrawer title={e.no} subtitle={e.vendor} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="expense" value={e.status} />],
          [L('Bağlı olduğu', 'Belongs to'), linkText(d, e)],
          [L('Kategori', 'Category'), expenseCategoryLabel(e.category)],
          [L('Tutar', 'Amount'), fmt(e.amount.minor, e.amount.cur)],
          [L('Tarih', 'Date'), e.date],
          [L('Şube', 'Branch'), d.branches.find((b) => b.id === e.branchId)?.name],
          [L('Araç', 'Vehicle'), vehicle ? <Link2 key="v" type="vehicle" id={vehicle.id}>{vehicle.plate} · {vehicle.make} {vehicle.model}</Link2> : '—'],
          [L('Kaynak', 'Source'), e.sourceType && source ? <Link2 key="src" type={e.sourceType === 'maintenance' ? 'maintenance' : 'fine'} id={e.sourceId!}>{(source as { no: string }).no}</Link2> : L('Elle girildi', 'Entered manually')],
          [L('Kaydeden', 'Created by'), userName(d, e.createdBy)],
          [L('Not', 'Note'), e.note || '—'],
          ...(e.voidReason ? [[L('İptal gerekçesi', 'Void reason'), e.voidReason] as [string, string]] : []),
        ]}
      />
      {e.sourceType && <Notice tone="blue">{L('Bu masraf kaynak kayıttan gelir ve burada değiştirilemez; kaynak kaydı düzeltin. Araç maliyetinde yalnız bir kez sayılır (bakım kaydından).', 'This expense comes from its source record and cannot be changed here; correct the source record. It is counted once in the vehicle cost (from the maintenance record).')}</Notice>}
      {cost && Object.keys(cost.byCur).length > 0 && (
        <p className="text-[13px] text-ink-2">{L('Bu aracın tanımlı maliyeti', 'Defined cost of this vehicle')}: {Object.entries(cost.byCur).map(([c, v]) => fmt(v.total, c)).join(' · ')}</p>
      )}
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
  const categories = EXPENSE_CATEGORIES.filter((c) => !SOURCE_CATEGORIES.includes(c))
  const [category, setCategory] = useState(categories[0]!)
  const [bind, setBind] = useState<'vehicle' | 'branch' | 'general'>('branch')
  const [vehicleId, setVehicleId] = useState('')
  const [vendor, setVendor] = useState('')
  const [branch, setBranch] = useState(active[0] ?? d.branches[0]!.id)
  const [date, setDate] = useState(dayOf(d.clock.now, d.settings.company.tz))
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [note, setNote] = useState('')
  const [post, setPost] = useState(true)
  const [cash, setCash] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const vehicle = d.vehicles.find((v) => v.id === vehicleId)
  const effectiveBranch = bind === 'vehicle' && vehicle ? vehicle.homeBranchId : branch
  const drawer = d.drawers.find((x) => x.branchId === effectiveBranch && x.currency === cur)
  return (
    <FinanceDialog
      title={L('Masraf ekle', 'Add expense')}
      description={L('Masrafın neye ait olduğunu seçin. Bakım maliyeti ve ceza ödemesi kaynak kayıttan gelir; burada ayrıca girilmez. Nakit ödenen masraf açık kasadan çıkar; kart veya havale ile ödenen kasayı etkilemez.', 'Choose what the expense belongs to. Maintenance cost and fine payments come from their source record and are not entered again here. A cash-paid expense leaves an open drawer; a card or transfer expense does not touch the drawer.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const minor = parseAmount(amount, cur)
        if (minor === null) {
          setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') })
          return L('Tutar geçersiz.', 'Invalid amount.')
        }
        const r = runAction((s) => createExpense(s, { category, vendor, branchId: effectiveBranch, date, amount: { minor, cur }, note, post, cashDrawerId: cash && post ? drawer?.id : undefined, link: bind, vehicleId: bind === 'vehicle' ? vehicleId || undefined : undefined }), L('Masraf kaydedildi.', 'Expense saved.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <SelectF id="ex-bind" label={L('Neye ait', 'Belongs to')} value={bind} onChange={(v) => setBind(v as typeof bind)} options={[{ id: 'branch', label: L('Şubeyle ilişkili', 'Branch') }, { id: 'vehicle', label: L('Araçla ilişkili', 'Vehicle') }, { id: 'general', label: L('Genel işletme masrafı', 'General business expense') }]} hint={L('Kaynak işlemden gelen masraflar (bakım, ceza) buradan eklenmez.', 'Expenses that come from a source record (maintenance, fines) are not added here.')} />
      {bind === 'vehicle' && <ComboF id="ex-veh" label={L('Araç', 'Vehicle')} required items={vehicleItems(d)} value={vehicleId} onChange={setVehicleId} error={fields.vehicle} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="ex-c" label={L('Kategori', 'Category')} value={category} onChange={setCategory} options={categories.map((c) => ({ id: c, label: expenseCategoryLabel(c) }))} error={fields.category} />
        {bind !== 'vehicle' && <SelectF id="ex-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d, active)} />}
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
