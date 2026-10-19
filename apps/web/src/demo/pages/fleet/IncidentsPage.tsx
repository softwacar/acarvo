import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { addIncidentEvidence, setIncidentStatus } from '../../core/ops/fleet'
import type { Incident } from '../../core/types'
import { L } from '../../i18n'
import { SelectF, TextF } from '../../ui/forms'
import { entityHref, runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Page, SearchBox, Status, Timeline } from '../../ui/kit'
import { VehicleCell } from '../../ui/domain'
import { INCIDENT_KIND_LABEL, STATUS } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { IncidentDialog } from '../shared/FleetDialogs'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from './common'
import { Link } from '@tanstack/react-router'
import { userName } from '../../core/helpers'

export function IncidentsPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const kinds = INCIDENT_KIND_LABEL()
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [kind, setKind] = useUrlState('tur', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const vOf = (i: Incident) => d.vehicles.find((v) => v.id === i.vehicleId)
  const scoped = d.incidents.filter((i) => !i.vehicleId || active.includes(vOf(i)!.homeBranchId))
  const rows = scoped
    .filter((i) => (status === 'all' ? true : i.status === status))
    .filter((i) => (kind === 'all' ? true : i.kind === kind))
    .filter((i) => !q || `${i.no} ${i.title} ${vOf(i)?.plate ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const openN = scoped.filter((i) => i.status === 'open' || i.status === 'investigating')
  const cols: Col<Incident>[] = [
    { id: 'no', header: L('Olay', 'Incident'), cell: (i) => <span className="tnum whitespace-nowrap font-medium text-blue">{i.no}</span>, sort: (i) => i.no, csv: (i) => i.no },
    { id: 'title', header: L('Başlık', 'Title'), cell: (i) => <span className="line-clamp-1 font-medium">{i.title}</span>, csv: (i) => i.title },
    { id: 'kind', header: L('Tür', 'Type'), cell: (i) => kinds[i.kind], hideBelow: 'md', csv: (i) => kinds[i.kind] },
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (i) => (vOf(i) ? <VehicleCell v={vOf(i)!} sub={false} /> : '—'), hideBelow: 'md', csv: (i) => vOf(i)?.plate ?? '' },
    { id: 'sev', header: L('Önem', 'Severity'), cell: (i) => <Status kind="severity" value={i.severity} />, hideBelow: 'lg', csv: (i) => i.severity },
    { id: 'own', header: L('Sorumlu', 'Owner'), cell: (i) => userName(d, i.ownerId), hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (i) => <Status kind="incident" value={i.status} />, sort: (i) => i.status, csv: (i) => i.status },
  ]
  const current = d.incidents.find((i) => i.id === sel)
  return (
    <Page
      title={L('Olay Merkezi', 'Incident Center')}
      description={L('Kaza, arıza, şikayet ve güvenlik olayları tek yerde; her olay sorumlusu, kanıtı ve bağlı kayıtlarıyla izlenir.', 'Accidents, breakdowns, complaints and safety events in one place; each incident has an owner, evidence and linked records.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('olaylar', cols, rows)}>CSV</button>
          {can('incidents:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Olay kaydı aç', 'Open incident')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Açık', 'Open'), value: openN.length, to: '/olay-merkezi?durum=open' },
          { label: L('Yüksek / kritik', 'High / critical'), value: openN.filter((i) => i.severity === 'high' || i.severity === 'critical').length, tone: openN.some((i) => i.severity === 'high' || i.severity === 'critical') ? 'alert' : undefined },
          { label: L('Çözüldü, kapanmadı', 'Resolved, not closed'), value: scoped.filter((i) => i.status === 'resolved').length },
          { label: L('Kanıtsız açık olay', 'Open without evidence'), value: openN.filter((i) => i.evidence.length === 0).length, tone: openN.some((i) => i.evidence.length === 0) ? 'hold' : undefined },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setStatus('all'); setKind('all') }} active={q !== '' || status !== 'all' || kind !== 'all'}>
        <SearchBox label={L('Olaylarda ara', 'Search incidents')} placeholder={L('Olay, başlık, plaka…', 'Incident, title, plate…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.keys(STATUS.incident!).map((k) => ({ id: k, label: STATUS.incident![k]!().label }))]} />
        <FilterSelect label={L('Tür', 'Type')} value={kind} onChange={setKind} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(kinds).map(([id, label]) => ({ id, label }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(i) => i.id} label={L('Olay listesi', 'Incident list')} urlKey="ol" defaultSort={{ id: 'no', dir: 'desc' }} onRowClick={(i) => setSel(i.id)} empty={<Empty title={L('Bu filtrelerle olay yok', 'No incidents match')} />} />
      {adding && <IncidentDialog onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
      {current && <Drawer i={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ i, onClose }: { i: Incident; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'status' | 'evidence'>(null)
  const v = d.vehicles.find((x) => x.id === i.vehicleId)
  const rental = d.rentals.find((x) => x.id === i.rentalId)
  const kinds = INCIDENT_KIND_LABEL()
  const manage = can('incidents:manage')
  return (
    <RecordDrawer title={i.no} subtitle={i.title} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="incident" value={i.status} />],
          [L('Tür', 'Type'), kinds[i.kind]],
          [L('Önem', 'Severity'), <Status key="sv" kind="severity" value={i.severity} />],
          [L('Sorumlu', 'Owner'), userName(d, i.ownerId)],
          [L('Araç', 'Vehicle'), v ? <Link2 key="v" type="vehicle" id={v.id}>{v.plate}</Link2> : '—'],
          [L('Kiralama', 'Rental'), rental ? <Link2 key="r" type="rental" id={rental.id}>{rental.no}</Link2> : '—'],
          [L('Açıklama', 'Description'), i.description],
          [L('Çözüm', 'Resolution'), i.resolution ?? '—'],
        ]}
      />
      {i.links.length > 0 && (
        <DrawerSection title={L('Bağlı kayıtlar', 'Linked records')}>
          <ul className="space-y-1 text-[13.5px]">{i.links.map((l) => <li key={`${l.type}${l.id}`}><Link to={entityHref(l.type, l.id) as never} className="text-blue hover:underline">{l.type} · {l.id}</Link></li>)}</ul>
        </DrawerSection>
      )}
      <DrawerSection title={`${L('Kanıt', 'Evidence')} (${i.evidence.length})`}>
        {i.evidence.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Kanıt eklenmedi.', 'No evidence added.')}</p> : <ul className="divide-y divide-line-soft text-[13.5px]">{i.evidence.map((e) => <li key={e.id} className="flex justify-between gap-3 py-1.5"><span>{e.label}</span><span className="tnum text-ink-2">{f.dt(e.at)}</span></li>)}</ul>}
        <p className="mt-1.5 text-[12px] text-ink-3">{L('Demo: dosya yüklenmez; kanıt etiketi kaydedilir.', 'Demo: no file is uploaded; the evidence label is recorded.')}</p>
      </DrawerSection>
      {manage && i.status !== 'closed' && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={() => setDlg('evidence')}>{L('Kanıt ekle', 'Add evidence')}</ActBtn>
            <ActBtn onClick={() => setDlg('status')}>{L('Durumu değiştir', 'Change status')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={i.history} /></DrawerSection>
      {dlg === 'evidence' && <PromptDialog title={L('Kanıt ekle', 'Add evidence')} description={L('Fotoğraf, tutanak veya belge etiketi.', 'Label of a photo, report or document.')} label={L('Kanıt etiketi', 'Evidence label')} min={3} rows={2} confirm={L('Ekle', 'Add')} run={(t) => act((s) => addIncidentEvidence(s, i.id, t), L('Kanıt eklendi.', 'Evidence added.')) as never} onClose={() => setDlg(null)} />}
      {dlg === 'status' && <StatusDialog i={i} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function StatusDialog({ i, onClose }: { i: Incident; onClose: () => void }) {
  const [st, setSt] = useState<Incident['status']>(i.status === 'open' ? 'investigating' : i.status === 'investigating' ? 'resolved' : 'closed')
  const [note, setNote] = useState('')
  return (
    <FinanceDialog
      title={L('Olay durumunu değiştir', 'Change incident status')}
      description={L('Çözüm ve kapanış için not ve kanıt gerekir.', 'A note and evidence are required to resolve and close.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((s) => setIncidentStatus(s, i.id, st, note), L('Olay durumu güncellendi.', 'Incident status updated.'))
        if (!r.ok) return r.error
        onClose()
      }}
    >
      <SelectF id="is-s" label={L('Yeni durum', 'New status')} value={st} onChange={(v) => setSt(v as Incident['status'])} options={Object.keys(STATUS.incident!).map((k) => ({ id: k, label: STATUS.incident![k]!().label }))} />
      <TextF id="is-n" label={L('Not / çözüm', 'Note / resolution')} required value={note} onChange={setNote} />
    </FinanceDialog>
  )
}
