import { Plus } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { rentalFinance } from '../../core/calc/finance'
import { customerDocChecks } from '../../core/calc/policy'
import { fmt, sumByCur } from '../../core/money'
import { createCustomer, findDuplicates } from '../../core/ops/commercial'
import { addDaysYmd, dayOf } from '../../core/time'
import type { Customer } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, DateF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, FilterBar, FilterSelect, FinanceDialog, Kpis, Notice, Page, SearchBox, Status } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { byCurText } from '../fleet/common'

export function docStateOf(d: ReturnType<typeof useDb>, c: Customer) {
  const chk = customerDocChecks(d, c, d.clock.now)
  return chk.some((x) => x.state === 'missing') ? 'missing' : chk.some((x) => x.state === 'expired') ? 'expired' : chk.some((x) => x.state === 'expiring') ? 'expiring' : 'valid'
}

export function CustomersPage() {
  const d = useDb()
  const can = useCan()
  const navigate = useNavigate()
  const [q, setQ] = useUrlState('q')
  const [country, setCountry] = useUrlState('ulke', 'all')
  const [res, setRes] = useUrlState('ikamet', 'all')
  const [doc, setDoc] = useUrlState('belge', 'all')
  const [flag, setFlag] = useUrlState('kisit', 'all')
  const [adding, setAdding] = useState(false)
  const people = d.customers.filter((c) => !c.archived)
  const countries = [...new Set(people.map((c) => c.country))].sort()
  const info = useMemo(() => new Map(people.map((c) => [c.id, { doc: docStateOf(d, c), open: d.rentals.filter((r) => r.customerId === c.id && ['delivered', 'prepared'].includes(r.status)).length }])), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = people
    .filter((c) => (country === 'all' ? true : c.country === country))
    .filter((c) => (res === 'all' ? true : c.residency === res))
    .filter((c) => (doc === 'all' ? true : info.get(c.id)?.doc === doc))
    .filter((c) => (flag === 'all' ? true : c.restrictions.length > 0))
    .filter((c) => !q || `${c.no} ${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const cols: Col<Customer>[] = [
    { id: 'name', header: L('Müşteri', 'Customer'), cell: (c) => <Link to={`/musteriler/${c.id}` as never} className="font-medium text-blue hover:underline">{c.name}</Link>, sort: (c) => c.name, csv: (c) => c.name },
    { id: 'no', header: L('No', 'No'), cell: (c) => <span className="tnum whitespace-nowrap">{c.no}</span>, hideBelow: 'md', csv: (c) => c.no },
    { id: 'country', header: L('Ülke', 'Country'), cell: (c) => `${c.country} · ${c.residency === 'foreign' ? L('yabancı', 'foreign') : L('yerli', 'local')}`, hideBelow: 'md', csv: (c) => c.country },
    { id: 'phone', header: L('Telefon', 'Phone'), cell: (c) => <span className="tnum">{c.phone}</span>, hideBelow: 'lg', csv: (c) => c.phone },
    { id: 'doc', header: L('Belgeler', 'Documents'), cell: (c) => <Status kind="doc" value={info.get(c.id)!.doc} />, hideBelow: 'md', csv: (c) => info.get(c.id)!.doc },
    { id: 'open', header: L('Açık kiralama', 'Open rentals'), align: 'right', cell: (c) => info.get(c.id)!.open || <span className="text-ink-3">—</span>, hideBelow: 'lg' },
    { id: 'rs', header: L('Kısıt', 'Restrictions'), cell: (c) => (c.restrictions.length ? <span className="rounded border border-hold/40 bg-hold-soft px-1.5 py-0.5 text-[11.5px] font-medium text-hold">{c.restrictions.length}</span> : <span className="text-ink-3">—</span>), hideBelow: 'lg' },
  ]
  const unpaid = sumByCur(d.rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)), (r) => ({ minor: rentalFinance(d, r.id).outstandingMinor, cur: r.currency }))
  return (
    <Page
      title={L('Müşteriler', 'Customers')}
      description={L('Kişisel veriler rol ve amaca göre gösterilir. Kısıtlamalar yalnız açık gerekçeyle konur; gizli puan veya kara liste yoktur.', 'Personal data is shown by role and purpose. Restrictions need a visible reason; there is no hidden score or blacklist.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('musteriler', cols, rows)}>CSV</button>
          {can('customers:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Yeni müşteri', 'New customer')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Müşteri', 'Customers'), value: people.length },
          { label: L('Belgesi eksik/dolmuş', 'Docs missing/expired'), value: people.filter((c) => ['missing', 'expired'].includes(info.get(c.id)!.doc)).length, tone: 'hold', to: '/musteriler?belge=missing' },
          { label: L('Kısıtlı', 'With restrictions'), value: people.filter((c) => c.restrictions.length).length, to: '/musteriler?kisit=1' },
          { label: L('Açık bakiye', 'Open balances'), value: byCurText(unpaid, fmt), hint: L('Para birimi başına', 'Per currency') },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setCountry('all'); setRes('all'); setDoc('all'); setFlag('all') }} active={q !== '' || country !== 'all' || res !== 'all' || doc !== 'all' || flag !== 'all'}>
        <SearchBox label={L('Müşterilerde ara', 'Search customers')} placeholder={L('Ad, no, telefon, e-posta…', 'Name, no, phone, email…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Ülke', 'Country')} value={country} onChange={setCountry} options={[{ id: 'all', label: L('Tümü', 'All') }, ...countries.map((c) => ({ id: c, label: c }))]} />
        <FilterSelect label={L('İkamet', 'Residency')} value={res} onChange={setRes} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'local', label: L('Yerli', 'Local') }, { id: 'foreign', label: L('Yabancı', 'Foreign') }]} />
        <FilterSelect label={L('Belge', 'Documents')} value={doc} onChange={setDoc} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'valid', label: L('Geçerli', 'Valid') }, { id: 'expiring', label: L('Süresi yaklaşıyor', 'Expiring') }, { id: 'expired', label: L('Süresi dolmuş', 'Expired') }, { id: 'missing', label: L('Eksik', 'Missing') }]} />
        <FilterSelect label={L('Kısıt', 'Restriction')} value={flag} onChange={setFlag} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: '1', label: L('Kısıtlı olanlar', 'Restricted only') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(c) => c.id} label={L('Müşteri listesi', 'Customer list')} urlKey="mu" defaultSort={{ id: 'name', dir: 'asc' }} onRowClick={(c) => void navigate({ to: `/musteriler/${c.id}` as never })} empty={<Empty title={L('Bu filtrelerle müşteri yok', 'No customers match')} />} />
      {adding && <NewCustomerDialog onClose={() => setAdding(false)} onCreated={(id) => void navigate({ to: `/musteriler/${id}` as never })} />}
    </Page>
  )
}

function NewCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const d = useDb()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('1990-01-01')
  const [country, setCountry] = useState('BA')
  const [residency, setResidency] = useState<'local' | 'foreign'>('local')
  const [lang, setLang] = useState<'tr' | 'en' | 'bs'>('bs')
  const [licYear, setLicYear] = useState('2012')
  const [licUntil, setLicUntil] = useState(addDaysYmd(dayOf(d.clock.now, d.settings.company.tz), 365 * 5))
  const [ack, setAck] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const dups = name.trim().length >= 3 || phone.trim().length >= 7 ? findDuplicates(d, { name, phone, email, dob }) : []
  return (
    <FinanceDialog
      title={L('Yeni müşteri', 'New customer')}
      description={L('Mükerrer kayıt kontrolü yazarken çalışır. Belgeler müşteri oluştuktan sonra Belgeler sekmesinden eklenir.', 'Duplicate detection runs as you type. Documents are added after creation from the Documents tab.')}
      confirm={L('Müşteriyi oluştur', 'Create customer')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((s) => createCustomer(s, { name, phone, email, country, residency, dob, language: lang, licenseYear: Number(licYear), licenseValidUntil: licUntil }, ack), L('Müşteri oluşturuldu.', 'Customer created.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onCreated(r.value.id)
        onClose()
      }}
    >
      <TextF id="nc-n" label={L('Ad soyad', 'Full name')} required value={name} onChange={setName} error={fields.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="nc-p" label={L('Telefon', 'Phone')} required value={phone} onChange={setPhone} error={fields.phone} />
        <TextF id="nc-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} error={fields.email} />
        <DateF id="nc-d" label={L('Doğum tarihi', 'Date of birth')} required value={dob} onChange={setDob} error={fields.dob} />
        <SelectF id="nc-l" label={L('Dil', 'Language')} value={lang} onChange={(v) => setLang(v as typeof lang)} options={[{ id: 'bs', label: 'Bosanski' }, { id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }]} />
        <TextF id="nc-c" label={L('Ülke (ISO)', 'Country (ISO)')} value={country} onChange={(v) => setCountry(v.toUpperCase().slice(0, 2))} />
        <SelectF id="nc-r" label={L('İkamet', 'Residency')} value={residency} onChange={(v) => setResidency(v as typeof residency)} options={[{ id: 'local', label: L('Yerli', 'Local') }, { id: 'foreign', label: L('Yabancı', 'Foreign') }]} />
        <TextF id="nc-ly" label={L('Ehliyet alım yılı', 'Licence issued (year)')} value={licYear} onChange={(v) => setLicYear(v.replace(/\D/g, '').slice(0, 4))} />
        <DateF id="nc-lu" label={L('Ehliyet geçerlilik', 'Licence valid until')} value={licUntil} onChange={setLicUntil} />
      </div>
      {dups.length > 0 && (
        <Notice tone="hold">
          <p className="font-medium">{L('Benzer kayıt bulundu', 'Similar record found')}</p>
          <ul className="mt-1 list-disc pl-5">{dups.map((x) => <li key={x.customer.id}>{x.customer.name} — {x.reason}</li>)}</ul>
          <div className="mt-2"><CheckF id="nc-ack" checked={ack} onChange={setAck}>{L('Mükerrer uyarısını gördüm, yine de oluştur', 'I saw the duplicate warning, create anyway')}</CheckF></div>
        </Notice>
      )}
    </FinanceDialog>
  )
}
