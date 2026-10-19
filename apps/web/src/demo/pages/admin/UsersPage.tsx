import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { hasPerm } from '../../core/helpers'
import { inviteUser, updateUser } from '../../core/ops/control'
import { ALL_PERMS, PERM_MODULES } from '../../core/permissions'
import type { DemoUser } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Notice, Page, SearchBox, Status } from '../../ui/kit'
import { type Col, DataTable } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer, useAct } from '../fleet/common'

const permLabel = (id: string) => { const m = PERM_MODULES.find((x) => x.perms.some((p) => p.id === id)); const p = m?.perms.find((x) => x.id === id); return `${m?.label ?? id} · ${p?.label ?? ''}` }

export function UsersPage() {
  const d = useDb()
  const can = useCan()
  const me = useMe()
  const [q, setQ] = useUrlState('q')
  const [role, setRole] = useUrlState('rol', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const rows = d.users.filter((u) => (role === 'all' ? true : u.roleId === role)).filter((u) => !q || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase()))
  const roleName = (id: string) => d.roles.find((r) => r.id === id)?.name ?? id
  const cols: Col<DemoUser>[] = [
    { id: 'name', header: L('Kullanıcı', 'User'), cell: (u) => <span className="font-medium text-blue">{u.name}{u.id === me.id && <span className="ml-2 rounded bg-blue-soft px-1.5 py-0.5 text-[11px] font-medium text-blue-ink">{L('Aktif demo kullanıcısı', 'Current demo user')}</span>}</span>, sort: (u) => u.name },
    { id: 'title', header: L('Ünvan', 'Title'), cell: (u) => u.title, hideBelow: 'md' },
    { id: 'role', header: L('Rol', 'Role'), cell: (u) => roleName(u.roleId), sort: (u) => roleName(u.roleId) },
    { id: 'br', header: L('Şube kapsamı', 'Branch scope'), cell: (u) => (u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : L('Tüm şubeler', 'All branches')), hideBelow: 'lg' },
    { id: 'ov', header: L('Kişisel istisna', 'Overrides'), cell: (u) => (u.grant.length + u.deny.length ? `+${u.grant.length} / −${u.deny.length}` : <span className="text-ink-3">—</span>), hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (u) => <Status kind="user" value={u.status} />, sort: (u) => u.status },
  ]
  const current = d.users.find((u) => u.id === sel)
  return (
    <Page
      title={L('Kullanıcılar', 'Users')}
      description={L('Demo yetki simülasyonu: rol, şube kapsamı ve kişisel istisna (ek izin / yasak). Bu, tarayıcıda çalışan bir gösterimdir; gerçek bir sunucu güvenliği değildir. Davet yalnız kayıt oluşturur, e-posta gönderilmez.', 'Demo access simulation: role, branch scope and personal overrides (extra grant / deny). This is a browser-side demonstration, not server security. An invitation only creates a record; no email is sent.')}
      actions={can('users:manage') ? <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Kullanıcı davet et', 'Invite user')}</button> : undefined}
    >
      <Kpis items={[{ label: L('Kullanıcı', 'Users'), value: d.users.length }, { label: L('Etkin', 'Active'), value: d.users.filter((u) => u.status === 'active').length }, { label: L('Davet kaydı', 'Invited'), value: d.users.filter((u) => u.status === 'invited').length }]} />
      <FilterBar onReset={() => { setQ(''); setRole('all') }} active={q !== '' || role !== 'all'}>
        <SearchBox label={L('Kullanıcılarda ara', 'Search users')} placeholder={L('Ad, e-posta, ünvan…', 'Name, email, title…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Rol', 'Role')} value={role} onChange={setRole} options={[{ id: 'all', label: L('Tümü', 'All') }, ...d.roles.map((r) => ({ id: r.id, label: r.name }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(u) => u.id} label={L('Kullanıcı listesi', 'User list')} urlKey="ku" defaultSort={{ id: 'name', dir: 'asc' }} onRowClick={(u) => setSel(u.id)} empty={<Empty title={L('Kullanıcı yok', 'No users')} />} />
      {adding && <InviteDialog onClose={() => setAdding(false)} />}
      {current && <Drawer u={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ u, onClose }: { u: DemoUser; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const { act, error } = useAct()
  const [editing, setEditing] = useState(false)
  const role = d.roles.find((r) => r.id === u.roleId)
  const effective = ALL_PERMS.filter((p) => hasPerm(d, p, u))
  return (
    <RecordDrawer title={u.name} subtitle={u.title} onClose={onClose} error={error}>
      <Facts single rows={[[L('E-posta', 'Email'), u.email], [L('Durum', 'Status'), <Status key="s" kind="user" value={u.status} />], [L('Rol', 'Role'), role?.name], [L('Şube kapsamı', 'Branch scope'), u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.name).join(', ') : L('Tüm şubeler', 'All branches')], [L('Etkin izin sayısı', 'Effective permissions'), `${effective.length} / ${ALL_PERMS.length}`]]} />
      {can('users:manage') && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={() => setEditing(true)}>{L('Rol, kapsam ve istisna', 'Role, scope and overrides')}</ActBtn>
            {u.status === 'active' ? <ActBtn onClick={() => act((s) => updateUser(s, u.id, { status: 'inactive' }), L('Kullanıcı pasifleştirildi.', 'User deactivated.'))}>{L('Pasifleştir', 'Deactivate')}</ActBtn> : <ActBtn onClick={() => act((s) => updateUser(s, u.id, { status: 'active' }), L('Kullanıcı etkinleştirildi.', 'User activated.'))}>{L('Etkinleştir', 'Activate')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Kişisel istisnalar', 'Personal overrides')}>
        {u.grant.length + u.deny.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('İstisna yok: yalnız rolün izinleri geçerli.', 'No overrides: only the role’s permissions apply.')}</p> : (
          <ul className="space-y-1 text-[13.5px]">{u.grant.map((p) => <li key={`g${p}`} className="text-ok">+ {permLabel(p)}</li>)}{u.deny.map((p) => <li key={`d${p}`} className="text-alert">− {permLabel(p)}</li>)}</ul>
        )}
      </DrawerSection>
      <DrawerSection title={L('Etkin izinler (önizleme)', 'Effective permissions (preview)')}>
        <ul className="grid gap-x-4 gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2">{effective.map((p) => <li key={p}>{permLabel(p)}</li>)}</ul>
      </DrawerSection>
      {editing && <EditDialog u={u} onClose={() => setEditing(false)} />}
    </RecordDrawer>
  )
}

function EditDialog({ u, onClose }: { u: DemoUser; onClose: () => void }) {
  const d = useDb()
  const [roleId, setRoleId] = useState(u.roleId)
  const [branchIds, setBranchIds] = useState<string[]>(u.branchIds)
  const [grant, setGrant] = useState(u.grant.join(', '))
  const [deny, setDeny] = useState(u.deny.join(', '))
  const parse = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const bad = [...parse(grant), ...parse(deny)].filter((p) => !ALL_PERMS.includes(p))
  return (
    <FinanceDialog title={`${L('Düzenle', 'Edit')}: ${u.name}`} description={L('Kişisel istisna izin kodlarıyla (modül:eylem) virgülle girilir. Yasak, rol izninden de güçlüdür. Son aktif Sahip pasifleştirilemez veya rolü değiştirilemez.', 'Personal overrides are permission codes (module:action) separated by commas. A deny beats the role. The last active Owner cannot be deactivated or changed.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { if (bad.length) return `${L('Geçersiz izin kodu', 'Invalid permission code')}: ${bad.join(', ')}`; const r = runAction((s) => updateUser(s, u.id, { roleId, branchIds, grant: parse(grant), deny: parse(deny) }), L('Kullanıcı güncellendi.', 'User updated.')); if (!r.ok) return r.error; onClose() }}>
      <SelectF id="ue-r" label={L('Rol', 'Role')} value={roleId} onChange={setRoleId} options={d.roles.map((r) => ({ id: r.id, label: r.name }))} />
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">{L('Şube kapsamı (boş = tüm şubeler)', 'Branch scope (empty = all branches)')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">{d.branches.map((b) => <CheckF key={b.id} id={`ue-b-${b.id}`} checked={branchIds.includes(b.id)} onChange={(v) => setBranchIds((x) => (v ? [...x, b.id] : x.filter((y) => y !== b.id)))}>{b.code}</CheckF>)}</div>
      </fieldset>
      <TextF id="ue-g" label={L('Ek izinler', 'Extra grants')} value={grant} onChange={setGrant} hint="örn. refund:approve" />
      <TextF id="ue-d" label={L('Yasaklar', 'Denies')} value={deny} onChange={setDeny} error={bad.length ? `${L('Geçersiz', 'Invalid')}: ${bad.join(', ')}` : undefined} />
    </FinanceDialog>
  )
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [roleId, setRoleId] = useState(d.roles.find((r) => !r.system)?.id ?? d.roles[1]!.id)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Kullanıcı davet et', 'Invite user')} description={L('Demo’da davet yalnız bir kayıt oluşturur; e-posta gönderilmez.', 'In the demo an invitation only creates a record; no email is sent.')} confirm={L('Davet kaydı oluştur', 'Create invitation record')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => inviteUser(s, { name, email, roleId, branchIds: [], title }), L('Davet kaydı oluşturuldu (e-posta gönderilmedi).', 'Invitation record created (no email sent).')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <TextF id="iv-n" label={L('Ad soyad', 'Full name')} required value={name} onChange={setName} error={fields.name} />
      <TextF id="iv-e" label={L('E-posta', 'Email')} required value={email} onChange={setEmail} error={fields.email} />
      <TextF id="iv-t" label={L('Ünvan', 'Title')} value={title} onChange={setTitle} />
      <SelectF id="iv-r" label={L('Rol', 'Role')} value={roleId} onChange={setRoleId} options={d.roles.map((r) => ({ id: r.id, label: r.name }))} />
      <Notice tone="blue">{L('Davet edilen kişi “Davet kaydı” durumunda kalır; Demo menüsünden kullanıcı değiştirirken yalnız etkin kullanıcılar seçilebilir.', 'The invited person stays in the “Invited” state; only active users can be chosen when switching users from the Demo menu.')}</Notice>
    </FinanceDialog>
  )
}
