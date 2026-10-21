import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { DOC_LABEL, type DocState } from '../../core/calc/policy'
import { userName } from '../../core/helpers'
import { addCustomerDocument } from '../../core/ops/commercial'
import { addVehicleDocument } from '../../core/ops/fleet'
import { addDaysYmd, dayOf } from '../../core/time'
import type { Db, DemoDocument } from '../../core/types'
import { L } from '../../i18n'
import { ComboF, DateF, SelectF, TextF } from '../../ui/forms'
import { entityHref, runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, DemoNote, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Page, SearchBox, Status } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { DrawerSection, RecordDrawer } from '../fleet/common'

const OWNER = () => ({ customer: L('Müşteri', 'Customer'), vehicle: L('Araç', 'Vehicle'), contract: L('Sözleşme', 'Contract'), rental: L('Kiralama', 'Rental'), maintenance: L('Bakım', 'Maintenance'), insurance: L('Sigorta', 'Insurance'), supplier: L('Tedarikçi', 'Supplier'), company: L('Şirket', 'Company') })

function ownerLabel(d: Db, x: DemoDocument): string {
  switch (x.ownerType) {
    case 'customer': return d.customers.find((c) => c.id === x.ownerId)?.name ?? x.ownerId
    case 'vehicle': return d.vehicles.find((v) => v.id === x.ownerId)?.plate ?? x.ownerId
    case 'rental': return d.rentals.find((r) => r.id === x.ownerId)?.no ?? x.ownerId
    case 'supplier': return d.suppliers.find((s) => s.id === x.ownerId)?.name ?? x.ownerId
    default: return x.ownerId
  }
}

function stateOf(d: Db, x: DemoDocument): DocState {
  if (!x.validUntil) return 'valid'
  const days = Math.floor((Date.parse(`${x.validUntil}T23:59:59Z`) - Date.parse(d.clock.now)) / 86_400_000)
  return days < 0 ? 'expired' : days <= d.settings.docs.warnDays ? 'expiring' : 'valid'
}

export function DocumentsPage() {
  const d = useDb()
  const can = useCan()
  const [q, setQ] = useUrlState('q')
  const [owner, setOwner] = useUrlState('sahip', 'all')
  const [state, setState] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const owners = OWNER()
  // Only the newest version of a document is "current"; older versions stay readable.
  const latest = (x: DemoDocument) => !d.documents.some((y) => y.ownerType === x.ownerType && y.ownerId === x.ownerId && y.kind === x.kind && y.version > x.version)
  const rows = d.documents
    .filter(latest)
    .filter((x) => (owner === 'all' ? true : x.ownerType === owner))
    .filter((x) => (state === 'all' ? true : stateOf(d, x) === state))
    .filter((x) => !q || `${x.name} ${ownerLabel(d, x)} ${x.kind}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.validUntil ?? '9999').localeCompare(b.validUntil ?? '9999'))
  const cols: Col<DemoDocument>[] = [
    { id: 'name', header: L('Belge', 'Document'), cell: (x) => <span className="font-medium text-blue">{DOC_LABEL[x.kind] ?? x.kind}</span>, sort: (x) => x.kind, csv: (x) => DOC_LABEL[x.kind] ?? x.kind },
    { id: 'owner', header: L('Sahibi', 'Owner'), cell: (x) => <span>{ownerLabel(d, x)} <span className="text-[12px] text-ink-2">({owners[x.ownerType]})</span></span>, csv: (x) => ownerLabel(d, x) },
    { id: 'ver', header: L('Sürüm', 'Version'), cell: (x) => `v${x.version}`, hideBelow: 'md' },
    { id: 'until', header: L('Geçerlilik', 'Valid until'), cell: (x) => <span className="tnum">{x.validUntil ?? '—'}</span>, sort: (x) => x.validUntil ?? '9999', csv: (x) => x.validUntil ?? '' },
    { id: 'st', header: L('Durum', 'Status'), cell: (x) => <Status kind="doc" value={stateOf(d, x)} />, csv: (x) => stateOf(d, x) },
  ]
  const all = d.documents.filter(latest)
  const current = d.documents.find((x) => x.id === sel)
  return (
    <Page
      title={L('Belge Merkezi', 'Document Center')}
      description={L('Tüm belgeler tek yerde: sahibine, sürümüne ve geçerlilik tarihine göre. Yeni sürüm eskisinin yerine geçer, eskisi saklanır. Demo belgeleri örnek kayıttır; dosya veya gerçek kişisel veri içermez.', 'All documents in one place: by owner, version and validity. A new version supersedes the old one, which is kept. Demo documents are placeholder records with no file or real personal data.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('belgeler', cols, rows)}>CSV</button>
          {can('documents:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Belge ekle', 'Add document')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Güncel belge', 'Current documents'), value: all.length }, { label: L('Süresi dolmuş', 'Expired'), value: all.filter((x) => stateOf(d, x) === 'expired').length, tone: all.some((x) => stateOf(d, x) === 'expired') ? 'alert' : undefined, to: '/belge-merkezi?durum=expired' }, { label: L('Süresi yaklaşan', 'Expiring'), value: all.filter((x) => stateOf(d, x) === 'expiring').length, tone: 'hold', to: '/belge-merkezi?durum=expiring' }]} />
      <FilterBar onReset={() => { setQ(''); setOwner('all'); setState('all') }} active={q !== '' || owner !== 'all' || state !== 'all'}>
        <SearchBox label={L('Belgelerde ara', 'Search documents')} placeholder={L('Belge, sahip…', 'Document, owner…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Sahip türü', 'Owner type')} value={owner} onChange={setOwner} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(owners).map(([id, label]) => ({ id, label }))]} />
        <FilterSelect label={L('Durum', 'Status')} value={state} onChange={setState} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'valid', label: L('Geçerli', 'Valid') }, { id: 'expiring', label: L('Süresi yaklaşıyor', 'Expiring') }, { id: 'expired', label: L('Süresi dolmuş', 'Expired') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} label={L('Belge listesi', 'Document list')} urlKey="bl" defaultSort={{ id: 'until', dir: 'asc' }} onRowClick={(x) => setSel(x.id)} empty={<Empty title={L('Bu filtrelerle belge yok', 'No documents match')} />} />
      {adding && <AddDialog onClose={() => setAdding(false)} />}
      {current && <Drawer x={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ x, onClose }: { x: DemoDocument; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const history = d.documents.filter((y) => y.ownerType === x.ownerType && y.ownerId === x.ownerId && y.kind === x.kind).sort((a, b) => b.version - a.version)
  return (
    <RecordDrawer title={DOC_LABEL[x.kind] ?? x.kind} subtitle={`v${x.version}`} onClose={onClose}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="doc" value={stateOf(d, x)} />],
        [L('Sahibi', 'Owner'), <Link key="o" to={entityHref(x.ownerType === 'customer' ? 'customer' : x.ownerType === 'vehicle' ? 'vehicle' : 'rental', x.ownerId) as never} className="text-blue hover:underline">{ownerLabel(d, x)}</Link>],
        [L('Ad', 'Name'), x.name],
        [L('Geçerlilik', 'Valid until'), x.validUntil ?? '—'],
        [L('Eklendi', 'Added'), `${f.dt(x.uploadedAt)} · ${userName(d, x.uploadedBy)}`],
      ]} />
      <DemoNote>{L('Örnek belge: dosya içermez, yalnız kayıt ve geçerlilik tarihi vardır.', 'Placeholder document: it holds no file, only a record and a validity date.')}</DemoNote>
      <DrawerSection title={L('Sürümler', 'Versions')}>
        <ul className="divide-y divide-line-soft text-[13.5px]">{history.map((h) => <li key={h.id} className="flex justify-between py-2"><span>v{h.version} · {h.name}</span><span className="tnum text-ink-2">{h.validUntil ?? '—'}</span></li>)}</ul>
      </DrawerSection>
    </RecordDrawer>
  )
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const [type, setType] = useState<'customer' | 'vehicle'>('customer')
  const [owner, setOwner] = useState('')
  const [kind, setKind] = useState('driving_license')
  const [until, setUntil] = useState(addDaysYmd(dayOf(d.clock.now, d.settings.company.tz), 365))
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const kinds = type === 'customer' ? ['national_id', 'passport', 'driving_license'] : ['insurance', 'registration', 'inspection']
  return (
    <FinanceDialog title={L('Belge ekle', 'Add document')} description={L('Demo’da dosya yüklenmez; örnek belge kaydı oluşur. Aynı türden yeni belge yeni sürüm olur.', 'No file is uploaded in the demo; a placeholder record is created. A new document of the same kind becomes a new version.')} confirm={L('Ekle', 'Add')} onClose={onClose}
      onSubmit={() => {
        if (!owner) { setFields({ owner: L('Sahibi seçin', 'Choose the owner') }); return L('Sahibi seçin.', 'Choose the owner.') }
        const r = runAction((s) => (type === 'customer' ? addCustomerDocument(s, owner, kind, until) : addVehicleDocument(s, owner, kind, name || `${DOC_LABEL[kind]} (örnek)`, until)), L('Belge eklendi (örnek).', 'Document added (placeholder).'))
        if (!r.ok) { setFields(r.fields); return r.error }
        onClose()
      }}>
      <SelectF id="ad-t" label={L('Sahip türü', 'Owner type')} value={type} onChange={(v) => { setType(v as typeof type); setOwner(''); setKind(v === 'customer' ? 'driving_license' : 'insurance') }} options={[{ id: 'customer', label: L('Müşteri', 'Customer') }, { id: 'vehicle', label: L('Araç', 'Vehicle') }]} />
      <ComboF id="ad-o" label={L('Sahibi', 'Owner')} required items={type === 'customer' ? d.customers.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.name, sub: c.no })) : d.vehicles.map((v) => ({ id: v.id, label: v.plate, sub: `${v.make} ${v.model}` }))} value={owner} onChange={setOwner} error={fields.owner} />
      <SelectF id="ad-k" label={L('Belge türü', 'Document type')} value={kind} onChange={setKind} options={kinds.map((k) => ({ id: k, label: DOC_LABEL[k] ?? k }))} />
      {type === 'vehicle' && <TextF id="ad-n" label={L('Belge adı', 'Document name')} value={name} onChange={setName} error={fields.name} />}
      <DateF id="ad-u" label={L('Geçerlilik tarihi', 'Valid until')} required value={until} onChange={setUntil} error={fields.validUntil} />
    </FinanceDialog>
  )
}
