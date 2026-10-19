import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { userName } from '../../core/helpers'
import { createException, reviewException } from '../../core/ops/control'
import type { Db, Exception, Id, LinkType } from '../../core/types'
import { L } from '../../i18n'
import { AlertList } from '../../ui/alerts'
import { ComboF, SelectF, TextF } from '../../ui/forms'
import { entityHref, runAction, useAlerts, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Page, Panel, Segmented, Status, Tabs } from '../../ui/kit'
import { type Col, DataTable } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'
import { targetLabel } from './ApprovalsPage'

type TabId = 'riskler' | 'istisnalar'

const MODULE_LABEL = (): Record<string, string> => ({ rentals: L('Kiralamalar', 'Rentals'), reservations: L('Rezervasyonlar', 'Reservations'), vehicles: L('Araçlar', 'Vehicles'), customers: L('Müşteriler', 'Customers'), finance: L('Finans', 'Finance'), cash: L('Kasa', 'Cash'), maintenance: L('Bakım', 'Maintenance'), damages: L('Hasar', 'Damage'), incidents: L('Olaylar', 'Incidents'), fines: L('Cezalar', 'Fines'), approvals: L('Onaylar', 'Approvals'), documents: L('Belgeler', 'Documents'), contracts: L('Sözleşmeler', 'Contracts'), tasks: L('Görevler', 'Tasks'), corporate: L('Kurumsal', 'Corporate'), rules: L('Kurallar', 'Rules') })

export function RisksPage() {
  const d = useDb()
  const can = useCan()
  const alerts = useAlerts()
  const [tab, setTab] = useUrlState('sekme', 'riskler')
  const [sev, setSev] = useUrlState('onem', 'all')
  const [mod, setMod] = useUrlState('modul', 'all')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const labels = MODULE_LABEL()
  const modules = [...new Set(alerts.map((a) => a.module))]
  const filtered = alerts.filter((a) => (sev === 'all' ? true : a.severity === sev)).filter((a) => (mod === 'all' ? true : a.module === mod))
  const exceptions = d.exceptions.filter((x) => (status === 'all' ? true : x.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const f = useFmt()
  const cols: Col<Exception>[] = [
    { id: 'no', header: L('İstisna', 'Exception'), cell: (x) => <span className="tnum whitespace-nowrap font-medium text-blue">{x.no}</span>, sort: (x) => x.no },
    { id: 'title', header: L('Başlık', 'Title'), cell: (x) => <span className="line-clamp-1 font-medium">{x.title}</span> },
    { id: 'src', header: L('Kaynak', 'Source'), cell: (x) => targetLabel(d, x.source), hideBelow: 'md' },
    { id: 'sev', header: L('Önem', 'Severity'), cell: (x) => <Status kind="severity" value={x.severity} />, hideBelow: 'md' },
    { id: 'when', header: L('Tarih', 'Date'), cell: (x) => <span className="tnum text-[13px]">{f.dt(x.createdAt)}</span>, hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (x) => <Status kind="exception" value={x.status} />, sort: (x) => x.status },
  ]
  const current = d.exceptions.find((x) => x.id === sel)
  return (
    <Page
      title={L('Riskler ve İstisnalar', 'Risks and Exceptions')}
      description={L('Riskler kayıtlardan türetilen açıklanabilir uyarılardır; gizli puan yoktur. İstisna kararı bir inceleme kaydıdır: kaynak kayıttaki işlem (kapatma, tahsilat) yine kaynakta yapılır.', 'Risks are explainable alerts derived from records; there is no hidden score. An exception decision is a review record: the action on the source (closing, charging) is still taken on the source.')}
      actions={can('risks:manage') ? <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('İstisna kaydet', 'Record exception')}</button> : undefined}
    >
      <Kpis items={[{ label: L('Kritik', 'Critical'), value: alerts.filter((a) => a.severity === 'critical').length, tone: alerts.some((a) => a.severity === 'critical') ? 'alert' : undefined }, { label: L('Uyarı', 'Warnings'), value: alerts.filter((a) => a.severity === 'warning').length }, { label: L('Açık istisna', 'Open exceptions'), value: d.exceptions.filter((x) => x.status === 'open').length, tone: d.exceptions.some((x) => x.status === 'open') ? 'hold' : undefined }]} />
      <Tabs<TabId> label={L('Risk bölümleri', 'Risk sections')} value={(tab as TabId) || 'riskler'} onChange={setTab} tabs={[{ id: 'riskler', label: L('Riskler', 'Risks'), count: alerts.length || undefined }, { id: 'istisnalar', label: L('İstisnalar', 'Exceptions'), count: d.exceptions.length || undefined }]} />
      {tab === 'istisnalar' ? (
        <>
          <FilterBar onReset={() => setStatus('all')} active={status !== 'all'}>
            <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'open', label: L('Açık', 'Open') }, { id: 'reviewed', label: L('İncelendi', 'Reviewed') }, { id: 'accepted', label: L('Kabul', 'Accepted') }, { id: 'rejected', label: L('Reddedildi', 'Rejected') }]} />
          </FilterBar>
          <DataTable rows={exceptions} cols={cols} rowKey={(x) => x.id} label={L('İstisna listesi', 'Exception list')} urlKey="is" defaultSort={{ id: 'no', dir: 'desc' }} onRowClick={(x) => setSel(x.id)} empty={<Empty title={L('İstisna yok', 'No exceptions')} />} />
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={L('Önem', 'Severity')} value={sev} onChange={setSev} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: 'critical', label: L('Kritik', 'Critical') }, { id: 'warning', label: L('Uyarı', 'Warning') }, { id: 'info', label: L('Bilgi', 'Info') }]} />
            <FilterSelect label={L('Modül', 'Module')} value={mod} onChange={setMod} options={[{ id: 'all', label: L('Tüm modüller', 'All modules') }, ...modules.map((m) => ({ id: m, label: labels[m] ?? m }))]} />
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Panel flush><AlertList alerts={filtered} empty={L('Bu filtrede risk yok.', 'No risks match this filter.')} /></Panel>
            <Panel title={L('Modüle göre', 'By module')}>
              <ul className="divide-y divide-line-soft text-[13.5px]">
                {modules.map((m) => <li key={m} className="flex justify-between py-2"><span>{labels[m] ?? m}</span><span className="tnum font-medium">{alerts.filter((a) => a.module === m).length}</span></li>)}
                {modules.length === 0 && <li className="py-2 text-ink-2">{L('Risk yok.', 'No risks.')}</li>}
              </ul>
            </Panel>
          </div>
        </div>
      )}
      {adding && <NewDialog onClose={() => setAdding(false)} />}
      {current && <Drawer x={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ x, onClose }: { x: Exception; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'reviewed' | 'accepted' | 'rejected'>(null)
  return (
    <RecordDrawer title={x.no} subtitle={x.title} onClose={onClose} error={error}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="exception" value={x.status} />],
        [L('Önem', 'Severity'), <Status key="v" kind="severity" value={x.severity} />],
        [L('Kaynak', 'Source'), <Link key="l" to={entityHref(x.source.type, x.source.id) as never} className="text-blue hover:underline">{targetLabel(d, x.source)}</Link>],
        [L('Karar', 'Decision'), x.decision ?? '—'],
        [L('İnceleyen', 'Reviewer'), x.reviewerId ? userName(d, x.reviewerId) : '—'],
      ]} />
      {can('risks:manage') && x.status === 'open' && (
        <DrawerSection title={L('Karar', 'Decide')}>
          <ActionRow>
            <ActBtn onClick={() => setDlg('reviewed')}>{L('İncelendi', 'Reviewed')}</ActBtn>
            <ActBtn onClick={() => setDlg('accepted')}>{L('Kabul', 'Accept')}</ActBtn>
            <ActBtn onClick={() => setDlg('rejected')}>{L('Reddet', 'Reject')}</ActBtn>
          </ActionRow>
          <p className="mt-2 text-[12.5px] text-ink-2">{L('Karar bir inceleme kaydıdır; kaynak kayıtta işlem yapmaz.', 'The decision is a review record; it takes no action on the source.')}</p>
        </DrawerSection>
      )}
      {dlg && <PromptDialog title={L('İstisna kararı', 'Exception decision')} description={L('Karar gerekçesi kayda geçer.', 'The reasoning is recorded.')} label={L('Gerekçe', 'Reasoning')} min={5} confirm={L('Kaydet', 'Save')} rows={3} run={(t) => act((s) => reviewException(s, x.id, dlg, t), L('İstisna kararı kaydedildi.', 'Exception decision recorded.')) as never} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function NewDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const [type, setType] = useState<'rental' | 'vehicle' | 'customer' | 'reservation'>('rental')
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [fields, setFields] = useState<Record<string, string>>({})
  const list = (t: typeof type): { id: Id; label: string; sub?: string }[] => {
    const db: Db = d
    return t === 'rental' ? db.rentals.map((r) => ({ id: r.id, label: r.no })) : t === 'vehicle' ? db.vehicles.map((v) => ({ id: v.id, label: v.plate, sub: `${v.make} ${v.model}` })) : t === 'customer' ? db.customers.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.name, sub: c.no })) : db.reservations.map((r) => ({ id: r.id, label: r.no }))
  }
  return (
    <FinanceDialog title={L('İstisna kaydet', 'Record exception')} description={L('Normal kuralın dışına çıkılan bir durumu kayda geçirir. Kaynak kayıt değişmez.', 'Records a situation that deviates from the normal rule. The source record does not change.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { if (!id) { setFields({ source: L('Kaynak kaydı seçin', 'Choose the source record') }); return L('Kaynak kaydı seçin.', 'Choose the source record.') } const r = runAction((s) => createException(s, { type: type as LinkType, id }, title, severity), L('İstisna kaydedildi.', 'Exception recorded.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <SelectF id="xc-t" label={L('Kaynak türü', 'Source type')} value={type} onChange={(v) => { setType(v as typeof type); setId('') }} options={[{ id: 'rental', label: L('Kiralama', 'Rental') }, { id: 'reservation', label: L('Rezervasyon', 'Reservation') }, { id: 'vehicle', label: L('Araç', 'Vehicle') }, { id: 'customer', label: L('Müşteri', 'Customer') }]} />
      <ComboF id="xc-s" label={L('Kaynak kayıt', 'Source record')} required items={list(type)} value={id} onChange={setId} error={fields.source} />
      <TextF id="xc-n" label={L('Başlık', 'Title')} required value={title} onChange={setTitle} error={fields.title} />
      <SelectF id="xc-v" label={L('Önem', 'Severity')} value={severity} onChange={(v) => setSeverity(v as typeof severity)} options={[{ id: 'low', label: L('Düşük', 'Low') }, { id: 'medium', label: L('Orta', 'Medium') }, { id: 'high', label: L('Yüksek', 'High') }]} />
    </FinanceDialog>
  )
}
