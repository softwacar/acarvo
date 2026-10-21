import { Link } from '@tanstack/react-router'
import { fmt } from '../../core/money'
import type { DemoEvent } from '../../core/types'
import { L } from '../../i18n'
import { entityHref, useBranchScope, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnSecondary, Empty, Facts, FilterBar, FilterSelect, Kpis, Page, SearchBox } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { RecordDrawer } from '../fleet/common'

// The audit trail is append-only: every demo action that changes a record writes one event with who, when, what and why.
// Reading it never writes anything.

export function AuditPage() {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [mod, setMod] = useUrlState('modul', 'all')
  const [actor, setActor] = useUrlState('kisi', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const events = d.events.filter((e) => !e.branchId || active.includes(e.branchId))
  const modules = [...new Set(events.map((e) => e.module))].sort()
  const actors = [...new Set(events.map((e) => e.actorName))].sort()
  const rows = events
    .filter((e) => (mod === 'all' ? true : e.module === mod))
    .filter((e) => (actor === 'all' ? true : e.actorName === actor))
    .filter((e) => !q || `${e.summary} ${e.type} ${e.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.at.localeCompare(a.at))
  const cols: Col<DemoEvent>[] = [
    { id: 'when', header: L('Zaman', 'Time'), cell: (e) => <span className="tnum whitespace-nowrap text-[13px]">{f.dt(e.at, e.branchId)}</span>, sort: (e) => e.at, csv: (e) => e.at },
    { id: 'actor', header: L('Kişi', 'Actor'), cell: (e) => e.actorName, hideBelow: 'md', csv: (e) => e.actorName },
    { id: 'mod', header: L('Modül', 'Module'), cell: (e) => e.module, hideBelow: 'lg', csv: (e) => e.module },
    { id: 'type', header: L('Olay', 'Event'), cell: (e) => e.type, hideBelow: 'lg', csv: (e) => e.type },
    { id: 'sum', header: L('Özet', 'Summary'), cell: (e) => <span className="line-clamp-1">{e.summary}</span>, csv: (e) => e.summary },
    { id: 'amt', header: L('Tutar', 'Amount'), align: 'right', cell: (e) => (e.minor !== undefined && e.cur ? <span className="tnum whitespace-nowrap">{fmt(e.minor, e.cur)}</span> : <span className="text-ink-3">—</span>), hideBelow: 'md', csv: (e) => (e.minor ?? '') },
  ]
  const current = d.events.find((e) => e.id === sel)
  return (
    <Page
      title={L('İşlem Geçmişi', 'Audit Trail')}
      description={L('Kayıt değiştiren her işlem kim, ne zaman, ne ve neden bilgisiyle yazılır; kayıtlar silinmez veya düzenlenmez. Bu ekranı okumak hiçbir kayıt yazmaz.', 'Every action that changes a record is written with who, when, what and why; entries are never deleted or edited. Reading this screen writes nothing.')}
      actions={<button type="button" className={btnSecondary} onClick={() => downloadCsv('islem-gecmisi', cols, rows)}>CSV</button>}
    >
      <Kpis items={[{ label: L('Toplam olay', 'Events'), value: events.length }, { label: L('Gösterilen', 'Shown'), value: rows.length }, { label: L('Gerekçeli', 'With a reason'), value: events.filter((e) => e.reason).length }]} />
      <FilterBar onReset={() => { setQ(''); setMod('all'); setActor('all') }} active={q !== '' || mod !== 'all' || actor !== 'all'}>
        <SearchBox label={L('Geçmişte ara', 'Search audit trail')} placeholder={L('Özet, olay, gerekçe…', 'Summary, event, reason…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Modül', 'Module')} value={mod} onChange={setMod} options={[{ id: 'all', label: L('Tümü', 'All') }, ...modules.map((m) => ({ id: m, label: m }))]} />
        <FilterSelect label={L('Kişi', 'Actor')} value={actor} onChange={setActor} options={[{ id: 'all', label: L('Tümü', 'All') }, ...actors.map((a) => ({ id: a, label: a }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(e) => e.id} label={L('İşlem geçmişi', 'Audit trail')} urlKey="ig" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(e) => setSel(e.id)} empty={<Empty title={L('Bu filtrelerle olay yok', 'No events match')} />} />
      {current && (
        <RecordDrawer title={current.type} subtitle={current.summary} onClose={() => setSel('')}>
          <Facts single rows={[
            [L('Zaman', 'Time'), f.dt(current.at, current.branchId)],
            [L('Kişi', 'Actor'), current.actorName],
            [L('Modül', 'Module'), current.module],
            [L('Kaynak', 'Source'), current.sourceType === 'settings' || !current.sourceId ? current.sourceType : <Link key="l" to={entityHref(current.sourceType as never, current.sourceId) as never} className="text-blue hover:underline">{current.sourceType} · {current.sourceId}</Link>],
            [L('Önce', 'Before'), current.before ?? '—'],
            [L('Sonra', 'After'), current.after ?? '—'],
            [L('Gerekçe', 'Reason'), current.reason ?? '—'],
            [L('Tutar', 'Amount'), current.minor !== undefined && current.cur ? fmt(current.minor, current.cur) : '—'],
          ]} />
        </RecordDrawer>
      )}
    </Page>
  )
}
