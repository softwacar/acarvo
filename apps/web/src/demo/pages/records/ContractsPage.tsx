import { useState } from 'react'
import { userName } from '../../core/helpers'
import { signContract } from '../../core/ops/rentals'
import type { Contract } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Page, SearchBox, Status, Tabs } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { RecordDrawer, DrawerSection } from '../fleet/common'
import { ContractSheet, PrintButton } from '../shared/ContractSheet'

export function ContractsPage() {
  const d = useDb()
  const f = useFmt()
  const [tab, setTab] = useUrlState('sekme', 'sozlesmeler')
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const rentalOf = (c: Contract) => d.rentals.find((r) => r.id === c.rentalId)
  const rows = d.contracts
    .filter((c) => (status === 'all' ? true : c.status === status))
    .filter((c) => !q || `${c.no} ${rentalOf(c)?.no} ${d.customers.find((x) => x.id === rentalOf(c)?.customerId)?.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const cols: Col<Contract>[] = [
    { id: 'no', header: L('Sözleşme', 'Contract'), cell: (c) => <span className="tnum whitespace-nowrap font-medium text-blue">{c.no} · v{c.version}</span>, sort: (c) => c.no, csv: (c) => c.no },
    { id: 'rental', header: L('Kiralama', 'Rental'), cell: (c) => <Link2 type="rental" id={c.rentalId}>{rentalOf(c)?.no}</Link2>, csv: (c) => rentalOf(c)?.no ?? '' },
    { id: 'renter', header: L('Kiracı', 'Renter'), cell: (c) => c.snapshot.renterName, hideBelow: 'md', csv: (c) => c.snapshot.renterName },
    { id: 'lang', header: L('Dil', 'Language'), cell: (c) => c.lang.toUpperCase(), hideBelow: 'lg' },
    { id: 'when', header: L('Üretildi', 'Issued'), cell: (c) => <span className="tnum text-[13px]">{f.dt(c.issuedAt)}</span>, sort: (c) => c.issuedAt, hideBelow: 'lg', csv: (c) => c.issuedAt },
    { id: 'st', header: L('Durum', 'Status'), cell: (c) => <Status kind="contract" value={c.status} />, sort: (c) => c.status, csv: (c) => c.status },
  ]
  const current = d.contracts.find((c) => c.id === sel)
  return (
    <Page
      title={L('Sözleşmeler', 'Contracts')}
      description={L('Üretilen sözleşme metni dondurulur; imzalı sürüm değişmez. Koşullar değişirse yeni sürüm üretilir ve imza yeni sürüme taşınmaz. İmza, personel cihazında yüz yüze alınır (e-imza servisi yoktur).', 'The issued contract text is frozen; a signed version is immutable. If terms change a new version is issued and the signature is not carried over. The signature is captured in person on a staff device (there is no e-signature service).')}
      actions={<button type="button" className={btnSecondary} onClick={() => downloadCsv('sozlesmeler', cols, rows)}>CSV</button>}
    >
      <Kpis items={[{ label: L('İmza bekleyen', 'Awaiting signature'), value: d.contracts.filter((c) => c.status === 'issued').length, tone: d.contracts.some((c) => c.status === 'issued') ? 'hold' : undefined, to: '/sozlesmeler?durum=issued' }, { label: L('İmzalı', 'Signed'), value: d.contracts.filter((c) => c.status === 'signed').length }, { label: L('Yerine geçilen sürüm', 'Superseded'), value: d.contracts.filter((c) => c.status === 'superseded').length }]} />
      <Tabs tabs={[{ id: 'sozlesmeler', label: L('Sözleşmeler', 'Contracts'), count: d.contracts.length }, { id: 'sablonlar', label: L('Şablonlar', 'Templates'), count: d.templates.length }]} value={tab as 'sozlesmeler' | 'sablonlar'} onChange={setTab} label={L('Sözleşme bölümleri', 'Contract sections')} />
      {tab === 'sablonlar' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {d.templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[14.5px] font-semibold">{t.name} <span className="text-[12px] font-normal text-ink-2">({t.lang.toUpperCase()} · v{t.version}{t.active ? '' : ` · ${L('pasif', 'inactive')}`})</span></p>
              <p className="text-[12.5px] text-ink-2">{L('Seri', 'Series')}: {t.seriesPrefix || '—'} · {t.clauses.length} {L('madde', 'clauses')}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">{t.clauses.map((c) => <li key={c.id}>{c.title}</li>)}</ol>
            </div>
          ))}
          <p className="text-[12.5px] text-ink-2 md:col-span-2">{L('Şablonlar Ayarlar → Sözleşme Dilleri’nde yönetilir. Hukuki geçerlilik için avukat incelemesi gerekir; demo metinleri örnektir.', 'Templates are managed in Settings → Contract Languages. Legal validity needs a lawyer’s review; the demo texts are samples.')}</p>
        </div>
      ) : (
        <>
          <FilterBar onReset={() => { setQ(''); setStatus('all') }} active={q !== '' || status !== 'all'}>
            <SearchBox label={L('Sözleşmelerde ara', 'Search contracts')} placeholder={L('No, kiralama, kiracı…', 'No, rental, renter…')} value={q} onChange={setQ} />
            <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'issued', label: L('İmza bekliyor', 'Awaiting signature') }, { id: 'signed', label: L('İmzalı', 'Signed') }, { id: 'superseded', label: L('Yerine geçildi', 'Superseded') }]} />
          </FilterBar>
          <DataTable rows={rows} cols={cols} rowKey={(c) => c.id} label={L('Sözleşme listesi', 'Contract list')} urlKey="sz" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(c) => setSel(c.id)} empty={<Empty title={L('Sözleşme yok', 'No contracts')} />} />
        </>
      )}
      {current && <Drawer c={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ c, onClose }: { c: Contract; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [signing, setSigning] = useState(false)
  const rental = d.rentals.find((r) => r.id === c.rentalId)
  return (
    <RecordDrawer title={c.no} subtitle={`v${c.version} · ${c.lang.toUpperCase()}`} onClose={onClose}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="contract" value={c.status} />],
        [L('Kiralama', 'Rental'), <Link2 key="r" type="rental" id={c.rentalId}>{rental?.no}</Link2>],
        [L('Üreten', 'Issued by'), `${userName(d, c.issuedBy)} · ${f.dt(c.issuedAt)}`],
        [L('İmza', 'Signature'), c.status === 'signed' ? `${c.signedBy} · ${c.signedAt ? f.dt(c.signedAt) : ''}` : '—'],
        [L('Şablon', 'Template'), `${d.templates.find((t) => t.id === c.templateId)?.name} v${c.templateVersion}`],
      ]} />
      <div className="flex flex-wrap gap-2">
        {c.status === 'issued' && can('rentals:handover') && <button type="button" className={btnPrimary} onClick={() => setSigning(true)}>{L('Kiracı imzalasın', 'Renter signs')}</button>}
        <PrintButton />
      </div>
      <DrawerSection title={L('Belge', 'Document')}><div className="overflow-x-auto"><ContractSheet c={c} /></div></DrawerSection>
      {signing && rental && <SignDialog rentalId={rental.id} onClose={() => setSigning(false)} />}
    </RecordDrawer>
  )
}

function SignDialog({ rentalId, onClose }: { rentalId: string; onClose: () => void }) {
  const d = useDb()
  const r = d.rentals.find((x) => x.id === rentalId)!
  const c = d.customers.find((x) => x.id === r.customerId)!
  const [name, setName] = useState('')
  const [ok, setOk] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Sözleşme imzası (yüz yüze)', 'Contract signature (in person)')} description={L('Kiracı imzayı personel cihazında atar; e-imza servisi değildir.', 'The renter signs on the staff device; this is not an e-signature service.')} confirm={L('İmzayı kaydet', 'Record signature')} onClose={onClose}
      onSubmit={() => { const x = runAction((s) => signContract(s, rentalId, name, ok), L('Sözleşme imzalandı (demo).', 'Contract signed (demo).')); if (!x.ok) { setFields(x.fields); return x.error } onClose() }}>
      <TextF id="cs-n" label={L('İmzalayan adı', 'Signer name')} required value={name} onChange={setName} error={fields.signer} hint={`${L('Kiracı', 'Renter')}: ${c.name}`} />
      <CheckF id="cs-ok" checked={ok} onChange={setOk} error={fields.confirm}>{L('Kiracı sözleşmeyi okuduğunu ve kabul ettiğini beyan etti.', 'The renter stated they have read and accepted the contract.')}</CheckF>
    </FinanceDialog>
  )
}
