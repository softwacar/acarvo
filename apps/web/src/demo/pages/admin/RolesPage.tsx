import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { presetUpgradeAvailable, publishPresetVersion, saveRole, upgradeRolePreset } from '../../core/ops/control'
import { DemoConcept } from '../../ui/gate'
import { ALL_PERMS, PERM_MODULES } from '../../core/permissions'
import type { Role } from '../../core/types'
import { L, loc } from '../../i18n'
import { AreaF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, FinanceDialog, Kpis, Notice, Page, Panel } from '../../ui/kit'

export function RolesPage() {
  const d = useDb()
  const can = useCan()
  const [sel, setSel] = useUrlState('rol', d.roles[0]!.id)
  const [dlg, setDlg] = useState<null | 'new' | 'copy'>(null)
  const role = d.roles.find((r) => r.id === sel) ?? d.roles[0]!
  const manage = can('roles:manage')
  const editable = manage && role.id !== 'role-owner'
  const [draft, setDraft] = useState<{ id: string; perms: string[] } | null>(null)
  const perms = draft && draft.id === role.id ? draft.perms : role.perms.includes('*') ? ALL_PERMS : role.perms
  const dirty = !!draft && draft.id === role.id
  const toggle = (p: string) => setDraft({ id: role.id, perms: perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p] })
  const toggleModule = (ids: string[], on: boolean) => setDraft({ id: role.id, perms: on ? [...new Set([...perms, ...ids])] : perms.filter((x) => !ids.includes(x)) })
  const groups = [...new Set(PERM_MODULES.map((m) => m.group))]
  return (
    <Page
      title={L('Roller ve Yetkiler', 'Roles and Permissions')}
      description={L('Modül × eylem yetki matrisi. Sistem rolleri kopyalanarak özel role dönüştürülür; Sahip rolü değiştirilemez. Bu bir demo yetki simülasyonudur, sunucu güvenliği değildir.', 'A module × action permission matrix. System roles are copied into custom roles; the Owner role cannot be changed. This is a demo access simulation, not server security.')}
      actions={manage ? <button type="button" className={btnPrimary} onClick={() => setDlg('new')}><Plus size={16} /> {L('Yeni rol', 'New role')} <DemoConcept>V1.5</DemoConcept></button> : undefined}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label={L('Roller', 'Roles')}>
          <ul className="space-y-1.5">
            {d.roles.map((r) => (
              <li key={r.id}>
                <button type="button" aria-current={r.id === role.id} onClick={() => { setSel(r.id); setDraft(null) }} className={`w-full rounded-lg border px-3 py-2.5 text-left ${r.id === role.id ? 'border-blue bg-blue-soft' : 'border-line bg-surface hover:bg-line-soft'}`}>
                  <span className="block text-[13.5px] font-medium">{r.name} {r.system && <span className="ml-1 text-[11px] font-normal text-ink-2">{L('sistem', 'system')}</span>}</span>
                  <span className="block text-[12px] text-ink-2">{r.perms.includes('*') ? L('Tüm izinler', 'All permissions') : `${r.perms.length} ${L('izin', 'permissions')}`} · {d.users.filter((u) => u.roleId === r.id).length} {L('kullanıcı', 'users')}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-4">
          <Kpis items={[{ label: L('Rol', 'Role'), value: role.name }, { label: L('İzin', 'Permissions'), value: `${perms.length} / ${ALL_PERMS.length}` }, { label: L('Kullanıcı', 'Users'), value: d.users.filter((u) => u.roleId === role.id).length }]} />
          <p className="text-[13.5px] text-ink-2">{role.description}</p>
          <PresetNotice role={role} manage={manage} />
          {role.system && manage && <Notice tone="blue" action={<button type="button" className={btnSecondary} onClick={() => setDlg('copy')}>{L('Kopyala', 'Copy')}</button>}>{role.id === 'role-owner' ? L('Sahip rolü değiştirilemez.', 'The Owner role cannot be changed.') : L('Sistem rolü de düzenlenebilir; yine de özel bir kopya oluşturmak sistem rolünü korur.', 'A system role can be edited; creating a custom copy still keeps the system role intact.')}</Notice>}
          {groups.map((g) => (
            <Panel key={g} title={loc(g)} flush>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <tbody className="divide-y divide-line-soft">
                    {PERM_MODULES.filter((m) => m.group === g).map((m) => {
                      const ids = m.perms.map((p) => p.id)
                      const all = ids.every((i) => perms.includes(i))
                      return (
                        <tr key={m.key}>
                          <th scope="row" className="w-[200px] px-5 py-2.5 text-left font-medium"><label className="flex items-center gap-2"><input type="checkbox" disabled={!editable} checked={all} onChange={(e) => toggleModule(ids, e.target.checked)} aria-label={`${loc(m.label)}: ${L('tümü', 'all')}`} />{loc(m.label)}</label></th>
                          <td className="px-3 py-2.5"><span className="flex flex-wrap gap-x-5 gap-y-1">{m.perms.map((p) => <label key={p.id} className={`flex items-center gap-1.5 ${p.sensitive ? 'text-hold' : ''}`}><input type="checkbox" disabled={!editable} checked={perms.includes(p.id)} onChange={() => toggle(p.id)} />{loc(p.label)}{p.sensitive && <span className="text-[11px]">({L('hassas', 'sensitive')})</span>}</label>)}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
          {editable && (
            <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-md">
              <span className="text-[13px] text-ink-2">{dirty ? L('Kaydedilmemiş değişiklik var.', 'You have unsaved changes.') : L('Değişiklik yok.', 'No changes.')}</span>
              <span className="flex gap-2">
                <button type="button" className={btnSecondary} disabled={!dirty} onClick={() => setDraft(null)}>{L('Geri al', 'Discard')}</button>
                <button type="button" className={btnPrimary} disabled={!dirty} onClick={() => { const r = runAction((s) => saveRole(s, { id: role.id, name: role.name, description: role.description, perms }), L('Rol kaydedildi; etkilenen kullanıcıların izinleri güncellendi.', 'Role saved; affected users’ permissions were updated.')); if (r.ok) setDraft(null) }}>{L('Kaydet', 'Save')}</button>
              </span>
            </div>
          )}
        </div>
      </div>
      {dlg && <RoleDialog base={dlg === 'copy' ? role : null} basePerms={perms} onClose={() => setDlg(null)} onCreated={(id) => { setSel(id); setDraft(null) }} />}
    </Page>
  )
}

function RoleDialog({ base, basePerms, onClose, onCreated }: { base: Role | null; basePerms: string[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(base ? `${base.name} (kopya)` : '')
  const [desc, setDesc] = useState(base?.description ?? '')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={base ? L('Rolü kopyala', 'Copy role') : L('Yeni rol', 'New role')} description={base ? L('İzinler kopyalanır; sonra matriste düzenlenir.', 'Permissions are copied; edit them afterwards in the matrix.') : L('Boş bir rol oluşur; izinler matriste seçilir.', 'An empty role is created; choose permissions in the matrix.')} confirm={L('Oluştur', 'Create')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => saveRole(s, { name, description: desc, perms: base ? basePerms : [] }), L('Rol oluşturuldu.', 'Role created.')); if (!r.ok) { setFields(r.fields); return r.error } onCreated(r.value.id); onClose() }}>
      <TextF id="rl-n" label={L('Rol adı', 'Role name')} required value={name} onChange={setName} error={fields.name} />
      <AreaF id="rl-d" label={L('Açıklama', 'Description')} value={desc} onChange={setDesc} rows={2} />
    </FinanceDialog>
  )
}

/** Preset version of a ready role. A new version reaches only roles nobody customized; a customized role is never overwritten. */
function PresetNotice({ role, manage }: { role: Role; manage: boolean }) {
  const d = useDb()
  const [discard, setDiscard] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!role.system || role.id === 'role-owner') return null
  const available = presetUpgradeAvailable(d, role)
  return (
    <div className="space-y-2" data-testid={'preset-' + role.id}>
      <Notice
        tone={available ? 'hold' : 'blue'}
        action={
          manage && available ? (
            role.customized ? (
              <button type="button" className={btnSecondary} onClick={() => setDiscard(true)}>{L('Özelleştirmeyi at ve yükselt', 'Discard customization and upgrade')}</button>
            ) : (
              <button type="button" className={btnSecondary} onClick={() => { const r = runAction((s) => upgradeRolePreset(s, role.id), L('Rol ön ayarı yükseltildi.', 'Role preset upgraded.')); setErr(r.ok ? null : r.error) }}>{L('Ön ayarı yükselt', 'Upgrade the preset')}</button>
            )
          ) : undefined
        }
      >
        {L('Ön ayar sürümü', 'Preset version')} v{role.presetVersion ?? 1} ({L('güncel', 'current')} v{d.meta.presetVersion}) · {role.customized ? L('Bu rol özelleştirilmiş: yeni bir ön ayar izinlerinizi ezmez.', 'This role is customized: a new preset never overwrites your permissions.') : available ? L('Yeni ön ayar sürümü var.', 'A newer preset version exists.') : L('Güncel ön ayar.', 'Up to date.')}
      </Notice>
      {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}
      {manage && role.id === 'role-ops' && d.meta.presetVersion < 3 && (
        <button type="button" className={btnSecondary} onClick={() => runAction((s) => publishPresetVersion(s), L('Rol ön ayarı v3 yayımlandı (demo).', 'Role preset v3 published (demo).'))}>{L('Demo: yeni ön ayar sürümünü yayımla', 'Demo: publish a new preset version')}</button>
      )}
      {discard && <FinanceDialog title={L('Özelleştirmeyi at', 'Discard the customization')} description={L('Bu rolün elle değiştirilmiş izinleri ön ayara döner. Bu bilerek yapılır; otomatik olmaz.', 'The hand-edited permissions of this role go back to the preset. This is done on purpose; it never happens automatically.')} confirm={L('At ve yükselt', 'Discard and upgrade')} danger onClose={() => setDiscard(false)} onSubmit={() => { const r = runAction((s) => upgradeRolePreset(s, role.id, true), L('Ön ayar yükseltildi; özelleştirme atıldı.', 'Preset upgraded; customization discarded.')); if (!r.ok) return r.error; setDiscard(false) }} />}
    </div>
  )
}
