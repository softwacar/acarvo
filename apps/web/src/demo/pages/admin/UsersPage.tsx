import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { hasPerm } from '../../core/helpers'
import { acceptInviteDemo, cancelInvite, completePasswordResetDemo, INVITE_DAYS, inviteState, inviteUser, requestPasswordReset, resendInvite, updateUser } from '../../core/ops/control'
import { ALL_PERMS, PERM_MODULES } from '../../core/permissions'
import type { DemoUser } from '../../core/types'
import { L, loc } from '../../i18n'
import { CheckF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Notice, Page, Pill, SearchBox, Status } from '../../ui/kit'
import { DemoConcept } from '../../ui/gate'
import { type Col, DataTable } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer, useAct } from '../fleet/common'

const permLabel = (id: string) => { const m = PERM_MODULES.find((x) => x.perms.some((p) => p.id === id)); const p = m?.perms.find((x) => x.id === id); return `${m ? loc(m.label) : id} · ${p ? loc(p.label) : ''}` }

const INVITE_TEXT = (s: ReturnType<typeof inviteState>) => (s === 'pending' ? L('Bekliyor', 'Pending') : s === 'expired' ? L('Süresi doldu', 'Expired') : s === 'cancelled' ? L('İptal', 'Cancelled') : s === 'accepted' ? L('Kabul edildi', 'Accepted') : '—')

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
  const authorizers = d.users.filter((u) => u.status === 'active' && hasPerm(d, 'approvals:decide', u)).length
  const cols: Col<DemoUser>[] = [
    { id: 'name', header: L('Kullanıcı', 'User'), cell: (u) => <span className="font-medium text-blue">{u.name}{u.id === me.id && <span className="ml-2 rounded bg-blue-soft px-1.5 py-0.5 text-[11px] font-medium text-blue-ink">{L('Aktif demo kullanıcısı', 'Current demo user')}</span>}</span>, sort: (u) => u.name },
    { id: 'title', header: L('Ünvan', 'Title'), cell: (u) => u.title, hideBelow: 'md' },
    { id: 'role', header: L('Rol', 'Role'), cell: (u) => roleName(u.roleId), sort: (u) => roleName(u.roleId) },
    { id: 'br', header: L('Şube kapsamı', 'Branch scope'), cell: (u) => (u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : L('Tüm şubeler', 'All branches')), hideBelow: 'lg' },
    { id: 'ov', header: L('Kişisel istisna', 'Overrides'), cell: (u) => (u.grant.length + u.deny.length ? `+${u.grant.length} / −${u.deny.length}` : <span className="text-ink-3">—</span>), hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (u) => <Status kind="user" value={u.status} />, sort: (u) => u.status },
    { id: 'inv', header: L('Davet', 'Invitation'), cell: (u) => { const s = inviteState(u, d.clock.now); return s === 'none' ? <span className="text-ink-3">—</span> : <Pill tone={s === 'pending' ? 'hold' : s === 'accepted' ? 'ok' : 'muted'}>{INVITE_TEXT(s)}</Pill> }, hideBelow: 'md' },
  ]
  const current = d.users.find((u) => u.id === sel)
  return (
    <Page
      title={L('Kullanıcılar', 'Users')}
      description={L('Rol, şube kapsamı ve kişisel istisna. Davet ve şifre sıfırlama bu demoda yalnız birer kayıt ve ekran önizlemesidir: e-posta gönderilmez, hesap ve jeton oluşmaz, gerçek kimlik doğrulama sonraki aşamadadır. Yetki görünümü yalnız demo simülasyonudur; gerçek sunucu güvenliği değildir.', 'Role, branch scope and personal overrides. Inviting and password reset are only a record and a screen preview in this demo: no email is sent, no account or token is created, and real authentication comes in a later stage. Permission views are a demo simulation, not real server security.')}
      actions={can('users:manage') ? <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Kullanıcı davet et', 'Invite user')}</button> : undefined}
    >
      <Kpis
        items={[
          { label: L('Kullanıcı', 'Users'), value: d.users.length },
          { label: L('Etkin', 'Active'), value: d.users.filter((u) => u.status === 'active').length },
          { label: L('Davet bekleyen', 'Invitations pending'), value: d.users.filter((u) => inviteState(u, d.clock.now) === 'pending').length },
          { label: L('Bağımsız onay yetkilisi', 'Independent authorizers'), value: authorizers, hint: L('Yüksek riskli işlemler için en az 2', 'At least 2 for high-risk actions'), tone: authorizers < 2 ? 'alert' : undefined },
        ]}
      />
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
  const f = useFmt()
  const { act, error } = useAct()
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState<null | 'invite' | 'reset'>(null)
  const role = d.roles.find((r) => r.id === u.roleId)
  const effective = ALL_PERMS.filter((p) => hasPerm(d, p, u))
  const inv = inviteState(u, d.clock.now)
  return (
    <RecordDrawer title={u.name} subtitle={u.title} onClose={onClose} error={error}>
      <Facts single rows={[[L('E-posta', 'Email'), u.email], [L('Durum', 'Status'), <Status key="s" kind="user" value={u.status} />], [L('Rol', 'Role'), role ? <>{role.name} <span className="text-[12px] text-ink-2">{role.presetVersion ? `v${role.presetVersion}` : ''}{role.customized ? ` · ${L('özelleştirilmiş', 'customized')}` : ''}</span></> : '—'], [L('Şube kapsamı', 'Branch scope'), u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.name).join(', ') : L('Tüm şubeler', 'All branches')], [L('Etkin izin sayısı', 'Effective permissions'), `${effective.length} / ${ALL_PERMS.length}`]]} />
      {can('users:manage') && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={() => setEditing(true)}>{L('Rol, kapsam ve istisna', 'Role, scope and overrides')}</ActBtn>
            {u.status === 'active' ? <ActBtn onClick={() => act((s) => updateUser(s, u.id, { status: 'inactive' }), L('Kullanıcı pasifleştirildi.', 'User deactivated.'))}>{L('Pasifleştir', 'Deactivate')}</ActBtn> : u.status === 'inactive' && inv !== 'cancelled' ? <ActBtn onClick={() => act((s) => updateUser(s, u.id, { status: 'active' }), L('Kullanıcı etkinleştirildi.', 'User activated.'))}>{L('Etkinleştir', 'Activate')}</ActBtn> : null}
            {u.status === 'active' && <ActBtn onClick={() => act((s) => requestPasswordReset(s, u.id), L('Şifre sıfırlama isteği kaydedildi (demo; e-posta ve jeton yok).', 'Password reset request recorded (demo; no email, no token).'))}>{L('Şifre sıfırlama iste', 'Request password reset')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      {u.invite && (
        <DrawerSection title={L('Davet', 'Invitation')}>
          <Facts single rows={[[L('Durum', 'Status'), INVITE_TEXT(inv)], [L('Oluşturuldu', 'Created'), f.dt(u.invite.createdAt)], [L('Geçerlilik', 'Valid until'), f.dt(u.invite.expiresAt)]]} />
          <div className="mt-2 flex flex-wrap gap-2">
            <ActBtn onClick={() => setPreview('invite')}>{L('Davet önizlemesi', 'Invitation preview')}</ActBtn>
            {can('users:manage') && u.status === 'invited' && <ActBtn onClick={() => act((s) => resendInvite(s, u.id), L('Davet yenilendi (demo; e-posta gönderilmedi).', 'Invitation renewed (demo; no email sent).'))}>{L('Daveti yenile', 'Renew invitation')}</ActBtn>}
            {can('users:manage') && u.status === 'invited' && <ActBtn onClick={() => act((s) => acceptInviteDemo(s, u.id), L('Davet kabul edildi (demo simülasyonu).', 'Invitation accepted (demo simulation).'))}>{L('Kabul ettir (demo)', 'Simulate acceptance (demo)')}</ActBtn>}
            {can('users:manage') && u.status === 'invited' && <ActBtn onClick={() => act((s) => cancelInvite(s, u.id), L('Davet iptal edildi.', 'Invitation cancelled.'))}>{L('Daveti iptal et', 'Cancel invitation')}</ActBtn>}
          </div>
        </DrawerSection>
      )}
      {u.resetRequest && (
        <DrawerSection title={L('Şifre sıfırlama', 'Password reset')}>
          <p className="text-[13.5px] text-ink-2">{L(`İstek ${f.dt(u.resetRequest.at)} tarihinde kaydedildi. Demoda jeton ve e-posta yoktur.`, `Request recorded ${f.dt(u.resetRequest.at)}. There is no token or email in the demo.`)}</p>
          <div className="mt-2 flex gap-2"><ActBtn onClick={() => setPreview('reset')}>{L('Kullanıcı ekranı önizlemesi', 'User screen preview')}</ActBtn></div>
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
      {preview === 'invite' && <InvitePreview u={u} onClose={() => setPreview(null)} />}
      {preview === 'reset' && <ResetPreview u={u} onClose={() => setPreview(null)} />}
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
  const f = useFmt()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [roleId, setRoleId] = useState(d.roles.find((r) => r.id === 'role-ops')?.id ?? d.roles[1]!.id)
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  const role = d.roles.find((r) => r.id === roleId)
  const expires = new Date(Date.parse(d.clock.now) + INVITE_DAYS * 86_400_000).toISOString()
  return (
    <FinanceDialog title={L('Kullanıcı davet et', 'Invite user')} description={L('Demoda davet yalnız bir kayıt oluşturur; e-posta gönderilmez, hesap açılmaz.', 'In the demo an invitation only creates a record; no email is sent and no account is opened.')} confirm={L('Davet kaydı oluştur', 'Create invitation record')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => inviteUser(s, { name, email, roleId, branchIds, title }), L('Davet kaydı oluşturuldu (e-posta gönderilmedi).', 'Invitation record created (no email sent).')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <TextF id="iv-n" label={L('Ad soyad', 'Full name')} required value={name} onChange={setName} error={fields.name} />
      <TextF id="iv-e" label={L('E-posta', 'Email')} required value={email} onChange={setEmail} error={fields.email} />
      <TextF id="iv-t" label={L('Ünvan', 'Title')} value={title} onChange={setTitle} />
      <SelectF id="iv-r" label={L('Rol', 'Role')} value={roleId} onChange={setRoleId} options={d.roles.map((r) => ({ id: r.id, label: r.name }))} error={fields.role} />
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">{L('Şube kapsamı (boş = tüm şubeler)', 'Branch scope (empty = all branches)')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">{d.branches.map((b) => <CheckF key={b.id} id={`iv-b-${b.id}`} checked={branchIds.includes(b.id)} onChange={(v) => setBranchIds((x) => (v ? [...x, b.id] : x.filter((y) => y !== b.id)))}>{b.code} · {b.name}</CheckF>)}</div>
      </fieldset>
      <div className="rounded-lg border border-line bg-ground/60 p-3 text-[13px]" aria-label={L('Davet önizlemesi', 'Invitation preview')} data-testid="invite-preview">
        <p className="mb-1 flex items-center gap-2 font-medium">{L('Davet önizlemesi', 'Invitation preview')} <DemoConcept>{L('Gönderilmez', 'Not sent')}</DemoConcept></p>
        <p>{L('Konu', 'Subject')}: {d.settings.company.name} — {L('ACARVO’ya davet edildiniz', 'You are invited to ACARVO')}</p>
        <p className="text-ink-2">{L(`Merhaba ${name || '…'}, ${d.settings.company.name} sizi “${role?.name ?? '…'}” rolüyle davet etti. Kapsam: ${branchIds.length ? branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : 'tüm şubeler'}. Bağlantı ${f.dt(expires)} tarihine kadar geçerlidir.`, `Hello ${name || '…'}, ${d.settings.company.name} invited you as “${role?.name ?? '…'}”. Scope: ${branchIds.length ? branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : 'all branches'}. The link is valid until ${f.dt(expires)}.`)}</p>
      </div>
      <Notice tone="blue">{L('Davet edilen kişi “Davet bekliyor” durumunda kalır; demo menüsünden kullanıcı değiştirirken yalnız etkin kullanıcılar seçilebilir.', 'The invited person stays in the “Invited” state; only active users can be chosen when switching users from the Demo menu.')}</Notice>
    </FinanceDialog>
  )
}

function InvitePreview({ u, onClose }: { u: DemoUser; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const role = d.roles.find((r) => r.id === u.roleId)
  return (
    <FinanceDialog title={L('Davet önizlemesi', 'Invitation preview')} description={L('Kişinin göreceği ileti; demoda gönderilmez.', 'The message the person would see; it is not sent in the demo.')} confirm={L('Kapat', 'Close')} onClose={onClose} onSubmit={() => onClose()}>
      <div className="rounded-lg border border-line p-3 text-[13.5px]">
        <p className="font-medium">{d.settings.company.name} — {L('ACARVO’ya davet edildiniz', 'You are invited to ACARVO')}</p>
        <p className="mt-1 text-ink-2">{L(`Merhaba ${u.name}, “${role?.name}” rolüyle davet edildiniz. Kapsam: ${u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : 'tüm şubeler'}.`, `Hello ${u.name}, you are invited as “${role?.name}”. Scope: ${u.branchIds.length ? u.branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : 'all branches'}.`)}</p>
        {u.invite && <p className="mt-1 text-[12.5px] text-ink-3">{L('Geçerlilik', 'Valid until')}: {f.dt(u.invite.expiresAt)}</p>}
      </div>
    </FinanceDialog>
  )
}

/** What the person would see after following a reset link. Nothing real happens: no password is stored, no token exists. */
function ResetPreview({ u, onClose }: { u: DemoUser; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)
  const rules = [
    { ok: pw.length >= 12, text: L('En az 12 karakter', 'At least 12 characters') },
    { ok: /[a-zA-Z]/.test(pw) && /\d/.test(pw), text: L('Harf ve rakam içerir', 'Contains letters and digits') },
    { ok: pw !== '' && pw === pw2, text: L('İki alan aynı', 'Both fields match') },
  ]
  return (
    <FinanceDialog
      title={L('Şifre sıfırlama ekranı (önizleme)', 'Password reset screen (preview)')}
      description={L('Bu yalnız ekran akışının önizlemesidir: parola hiçbir yerde saklanmaz, jeton ve e-posta yoktur. Gerçek kimlik doğrulama, güvenli jeton ve hesap kurtarma sonraki backend aşamasında geliştirilir.', 'This is only a preview of the screen flow: no password is stored anywhere and there is no token or email. Real authentication, secure tokens and account recovery are built in the next backend stage.')}
      confirm={done ? L('Kapat', 'Close') : L('Şifreyi kaydet (demo)', 'Save password (demo)')}
      onClose={onClose}
      onSubmit={() => {
        if (done) return onClose()
        if (!rules.every((r) => r.ok)) return L('Parola kurallarını sağlayın.', 'Meet the password rules.')
        const r = runAction((s) => completePasswordResetDemo(s, u.id), L('Demo: sıfırlama tamamlandı; parola saklanmadı.', 'Demo: reset completed; no password was stored.'))
        if (!r.ok) return r.error
        setDone(true)
        return L('Demo: sıfırlama tamamlandı; parola saklanmadı.', 'Demo: reset completed; no password was stored.')
      }}
    >
      <p className="text-[13.5px]"><span className="font-medium">{u.name}</span> · {u.email}</p>
      <TextF id="rs-p" label={L('Yeni parola', 'New password')} type="password" value={pw} onChange={setPw} />
      <TextF id="rs-p2" label={L('Parolayı tekrarlayın', 'Repeat the password')} type="password" value={pw2} onChange={setPw2} />
      <ul className="space-y-0.5 text-[12.5px]">{rules.map((r) => <li key={r.text} className={r.ok ? 'text-ok' : 'text-ink-3'}>{r.ok ? '✓' : '○'} {r.text}</li>)}</ul>
    </FinanceDialog>
  )
}

export { btnSecondary }
