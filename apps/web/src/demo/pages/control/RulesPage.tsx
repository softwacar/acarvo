import { Plus, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { evaluateRule } from '../../core/calc/alerts'
import { userName } from '../../core/helpers'
import { RULE_FIELDS, saveRule, setRuleStatus } from '../../core/ops/control'
import type { Rule } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, Empty, Facts, FinanceDialog, Kpis, Link2, Notice, Page, Status } from '../../ui/kit'
import { type Col, DataTable } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer, useAct } from '../fleet/common'

const FIELD_LABEL = (f: string) => RULE_FIELDS.find((x) => x.field === f)

export function RulesPage() {
  const d = useDb()
  const can = useCan()
  const [sel, setSel] = useUrlState('kayit')
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const manage = can('rules:manage')
  const cols: Col<Rule>[] = [
    { id: 'name', header: L('Kural', 'Rule'), cell: (r) => <span className="font-medium text-blue">{r.name}</span>, sort: (r) => r.name },
    { id: 'cond', header: L('Koşul', 'Condition'), cell: (r) => <span className="line-clamp-1 text-[13px]">{r.conditions.map((c) => `${FIELD_LABEL(c.field)?.label ?? c.field} ${c.op} ${c.value}`).join(r.join === 'AND' ? ' ve ' : ' veya ')}</span>, hideBelow: 'md' },
    { id: 'act', header: L('Eylem', 'Action'), cell: (r) => (r.action === 'alert' ? L('Uyarı', 'Alert') : L('İnceleme işareti', 'Review flag')), hideBelow: 'lg' },
    { id: 'sev', header: L('Önem', 'Severity'), cell: (r) => ({ info: L('Bilgi', 'Info'), warning: L('Uyarı', 'Warning'), critical: L('Kritik', 'Critical') })[r.severity], hideBelow: 'lg' },
    { id: 'now', header: L('Şu an', 'Now'), align: 'right', cell: (r) => (r.status === 'active' ? evaluateRule(d, r).length : <span className="text-ink-3">—</span>), hideBelow: 'md' },
    { id: 'v', header: L('Sürüm', 'Version'), cell: (r) => `v${r.version}`, hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (r) => <Status kind="rule" value={r.status} />, sort: (r) => r.status },
  ]
  const current = d.rules.find((r) => r.id === sel)
  return (
    <Page
      title={L('Kurallar', 'Rules')}
      description={L('Kurallar yalnız güvenli bir bildirim ve inceleme kataloğundan çalışır: uyarı üretir veya inceleme işareti koyar. Fiyat, vergi, kur, depozito ve izin politikalarını değiştirmez, para hareketi yapmaz.', 'Rules run only from a safe notification and review catalogue: they raise alerts or review flags. They never change price, tax, rate, deposit or permission policies and never move money.')}
      actions={manage ? <button type="button" className={btnPrimary} onClick={() => setEditing('new')}><Plus size={16} /> {L('Yeni kural', 'New rule')}</button> : undefined}
    >
      <Kpis items={[{ label: L('Aktif kural', 'Active rules'), value: d.rules.filter((r) => r.status === 'active').length }, { label: L('Taslak', 'Draft'), value: d.rules.filter((r) => r.status === 'draft').length }, { label: L('Şu an üretilen uyarı', 'Alerts raised now'), value: d.rules.filter((r) => r.status === 'active').reduce((a, r) => a + evaluateRule(d, r).length, 0) }]} />
      <DataTable rows={d.rules} cols={cols} rowKey={(r) => r.id} label={L('Kural listesi', 'Rule list')} urlKey="ku" onRowClick={(r) => setSel(r.id)} empty={<Empty title={L('Kural yok', 'No rules')} />} />
      {current && <Drawer r={current} onClose={() => setSel('')} onEdit={() => setEditing(current)} />}
      {editing && <Editor r={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

function Drawer({ r, onClose, onEdit }: { r: Rule; onClose: () => void; onEdit: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const hits = r.status === 'active' ? evaluateRule(d, r) : []
  return (
    <RecordDrawer title={r.name} subtitle={`v${r.version}`} onClose={onClose} error={error}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="rule" value={r.status} />],
        [L('Koşullar', 'Conditions'), r.conditions.map((c) => `${FIELD_LABEL(c.field)?.label ?? c.field} ${c.op} ${c.value} ${FIELD_LABEL(c.field)?.unit ?? ''}`).join(r.join === 'AND' ? ' VE ' : ' VEYA ')],
        [L('Eylem', 'Action'), r.action === 'alert' ? L('Uyarı üret', 'Raise alert') : L('İnceleme işareti koy', 'Set review flag')],
        [L('Mesaj', 'Message'), r.message],
      ]} />
      {can('rules:manage') && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={onEdit}>{L('Düzenle (yeni sürüm)', 'Edit (new version)')}</ActBtn>
            {r.status !== 'active' && <ActBtn onClick={() => act((s) => setRuleStatus(s, r.id, 'active'), L('Kural etkinleştirildi.', 'Rule activated.'))}>{L('Etkinleştir', 'Activate')}</ActBtn>}
            {r.status === 'active' && <ActBtn onClick={() => act((s) => setRuleStatus(s, r.id, 'draft'), L('Kural taslağa alındı.', 'Rule set to draft.'))}>{L('Taslağa al', 'Set to draft')}</ActBtn>}
            {r.status !== 'archived' && <ActBtn onClick={() => act((s) => setRuleStatus(s, r.id, 'archived'), L('Kural arşivlendi.', 'Rule archived.'))}>{L('Arşivle', 'Archive')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={`${L('Şu an eşleşenler', 'Currently matching')} (${hits.length})`}>
        {r.status !== 'active' ? <p className="text-[13.5px] text-ink-2">{L('Kural aktif değil.', 'The rule is not active.')}</p> : hits.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Eşleşen kayıt yok.', 'No matching records.')}</p> : <ul className="divide-y divide-line-soft text-[13.5px]">{hits.map((h) => <li key={h.id} className="py-2"><Link2 type={h.link.type} id={h.link.id}>{h.title}</Link2></li>)}</ul>}
      </DrawerSection>
      <DrawerSection title={L('Sürüm geçmişi', 'Version history')}>
        {r.versions.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Önceki sürüm yok.', 'No earlier versions.')}</p> : <ul className="divide-y divide-line-soft text-[13.5px]">{[...r.versions].reverse().map((v, i) => <li key={i} className="py-2">{v.summary}<span className="block text-[12.5px] text-ink-2">{f.dt(v.at)} · {userName(d, v.by)}</span></li>)}</ul>}
      </DrawerSection>
    </RecordDrawer>
  )
}

function Editor({ r, onClose }: { r: Rule | null; onClose: () => void }) {
  const d = useDb()
  const [name, setName] = useState(r?.name ?? '')
  const [conds, setConds] = useState<Rule['conditions']>(r?.conditions ?? [{ field: RULE_FIELDS[0]!.field, op: '>=', value: 12 }])
  const [join, setJoin] = useState<Rule['join']>(r?.join ?? 'AND')
  const [action, setAction] = useState<Rule['action']>(r?.action ?? 'alert')
  const [severity, setSeverity] = useState<Rule['severity']>(r?.severity ?? 'warning')
  const [message, setMessage] = useState(r?.message ?? '')
  const [status, setStatus] = useState<Rule['status']>(r?.status ?? 'draft')
  const [fields, setFields] = useState<Record<string, string>>({})
  const draft: Rule = { id: r?.id ?? 'preview', name: name || 'önizleme', status: 'active', version: 0, conditions: conds.map((c) => ({ ...c, value: Number(c.value) })), join, action, severity, message, versions: [] }
  const preview = conds.length ? evaluateRule(d, draft).length : 0
  const setCond = (i: number, patch: Partial<Rule['conditions'][number]>) => setConds((x) => x.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <FinanceDialog
      title={r ? L('Kuralı düzenle', 'Edit rule') : L('Yeni kural', 'New rule')}
      description={L('Kaydetmek yeni bir sürüm üretir; etkinleştirme ayrı bir seçimdir. Kural, eşleşen kayıtlar için uyarı veya inceleme işareti üretir; başka bir şey yapmaz.', 'Saving creates a new version; activation is a separate choice. A rule raises an alert or review flag for matching records and does nothing else.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const x = runAction((s) => saveRule(s, { id: r?.id, name, conditions: conds.map((c) => ({ ...c, value: Number(c.value) })), join, action, severity, message, status }), L('Kural kaydedildi.', 'Rule saved.'))
        if (!x.ok) {
          setFields(x.fields)
          return x.error
        }
        onClose()
      }}
    >
      <TextF id="ru-n" label={L('Kural adı', 'Rule name')} required value={name} onChange={setName} error={fields.name} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium">{L('Koşullar', 'Conditions')}</legend>
        {conds.map((c, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_90px_36px] items-end gap-2">
            <SelectF id={`ru-f${i}`} label={i === 0 ? L('Alan', 'Field') : ''} value={c.field} onChange={(v) => setCond(i, { field: v })} options={RULE_FIELDS.map((f) => ({ id: f.field, label: `${f.label} (${f.unit})` }))} />
            <SelectF id={`ru-o${i}`} label={i === 0 ? L('İşlem', 'Op') : ''} value={c.op} onChange={(v) => setCond(i, { op: v as Rule['conditions'][number]['op'] })} options={['>', '>=', '=', '<=', '<'].map((o) => ({ id: o, label: o }))} />
            <TextF id={`ru-v${i}`} label={i === 0 ? L('Değer', 'Value') : ''} value={String(c.value)} onChange={(v) => setCond(i, { value: v.replace(/[^\d.-]/g, '') })} />
            <button type="button" className="mb-1 grid size-9 place-items-center rounded-md text-ink-2 hover:bg-line-soft disabled:opacity-40" aria-label={L('Koşulu sil', 'Remove condition')} disabled={conds.length === 1} onClick={() => setConds((x) => x.filter((_, j) => j !== i))}><Trash size={15} /></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-[13px] font-medium text-blue hover:underline" onClick={() => setConds((x) => [...x, { field: RULE_FIELDS[0]!.field, op: '>=', value: 1 }])}>+ {L('Koşul ekle', 'Add condition')}</button>
          {conds.length > 1 && <span className="ml-auto w-44"><SelectF id="ru-j" label="" value={join} onChange={(v) => setJoin(v as Rule['join'])} options={[{ id: 'AND', label: L('Hepsi sağlanmalı (VE)', 'All must match (AND)') }, { id: 'OR', label: L('Biri yeterli (VEYA)', 'Any may match (OR)') }]} /></span>}
        </div>
        {fields.conditions && <p role="alert" className="text-[12.5px] text-alert">{fields.conditions}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectF id="ru-a" label={L('Eylem', 'Action')} value={action} onChange={(v) => setAction(v as Rule['action'])} options={[{ id: 'alert', label: L('Uyarı üret', 'Raise alert') }, { id: 'review_flag', label: L('İnceleme işareti', 'Review flag') }]} />
        <SelectF id="ru-s" label={L('Önem', 'Severity')} value={severity} onChange={(v) => setSeverity(v as Rule['severity'])} options={[{ id: 'info', label: L('Bilgi', 'Info') }, { id: 'warning', label: L('Uyarı', 'Warning') }, { id: 'critical', label: L('Kritik', 'Critical') }]} />
        <SelectF id="ru-st" label={L('Durum', 'Status')} value={status} onChange={(v) => setStatus(v as Rule['status'])} options={[{ id: 'draft', label: L('Taslak', 'Draft') }, { id: 'active', label: L('Aktif', 'Active') }]} />
      </div>
      <AreaF id="ru-m" label={L('Uyarı mesajı', 'Alert message')} required value={message} onChange={setMessage} error={fields.message} rows={2} />
      <Notice tone="blue">{L(`Önizleme: bu kural şu an ${preview} kayıtla eşleşiyor.`, `Preview: this rule matches ${preview} record(s) right now.`)}</Notice>
    </FinanceDialog>
  )
}
