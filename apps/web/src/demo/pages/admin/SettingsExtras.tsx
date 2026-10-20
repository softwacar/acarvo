import { useState } from 'react'
import { ALWAYS_VISIBLE, NAV_V1, PROFILES, type Profile, profileLinks } from '../../core/modules'
import { setWorkspace } from '../../core/ops/control'
import { L } from '../../i18n'
import { runAction, useDb } from '../../ui/hooks'
import { btnPrimary, Notice, Panel } from '../../ui/kit'
import { ContractTemplatesPanel } from '../records/ContractsPage'

// Settings sections that came out of the V1 product structure: the working profile (menu visibility only) and the
// contract templates (moved out of the old Contracts link). Rules, readiness and the cancellation policy follow.

const PROFILE_TEXT: Record<Profile, { tr: string; en: string; descTr: string; descEn: string }> = {
  simple: { tr: 'Sade', en: 'Simple', descTr: 'Küçük işletme: günlük işi yürüten temel ekranlar. Kasa, onay ve işlem geçmişi menüden çıkar ama Finans, İşlerim ve kullanıcı menüsünden erişilir.', descEn: 'Small business: the basic screens for the daily work. Cash, approvals and the audit trail leave the menu but stay reachable from Finance, My Work and the user menu.' },
  standard: { tr: 'Standart', en: 'Standard', descTr: 'Orta işletme: kurumsal hesaplar, şube kasaları, onay merkezi ve şubeler de menüde. İşlem geçmişi kullanıcı menüsünde.', descEn: 'Medium business: corporate accounts, branch cash, the approval center and branches are in the menu too. The audit trail is in the user menu.' },
  advanced: { tr: 'Gelişmiş', en: 'Advanced', descTr: 'Büyük işletme: 21 bağlantının tamamı menüde.', descEn: 'Large business: all 21 links are in the menu.' },
}

export function WorkspaceSection({ edit }: { edit: boolean }) {
  const d = useDb()
  const ws = d.settings.workspace
  const branches = d.branches.filter((b) => b.active).length
  const [profile, setProfile] = useState<Profile>(ws.profile)
  const effective = (p: Profile, hidden: string[], shown: string[]) => new Set(profileLinks({ profile: p, hidden, shown }, { activeBranches: branches }))
  const [on, setOn] = useState<Set<string>>(() => effective(ws.profile, ws.hidden, ws.shown))
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pick = (p: Profile) => {
    setProfile(p)
    setOn(effective(p, [], []))
  }
  const save = () => {
    const base = effective(profile, [], [])
    const hidden = NAV_V1.filter((n) => base.has(n.slug) && !on.has(n.slug)).map((n) => n.slug)
    const shown = NAV_V1.filter((n) => !base.has(n.slug) && on.has(n.slug)).map((n) => n.slug)
    const r = runAction((s) => setWorkspace(s, { profile, hidden, shown }), L('Çalışma profili kaydedildi; yalnız menü görünürlüğü değişti.', 'Working profile saved; only menu visibility changed.'))
    setErr(r.ok ? null : r.error)
    setMsg(r.ok ? L(`Menü şimdi ${effective(profile, hidden, shown).size} bağlantı gösteriyor.`, `The menu now shows ${effective(profile, hidden, shown).size} links.`) : null)
  }
  return (
    <Panel title={L('Çalışma profili ve menü', 'Working profile and menu')} description={L('Profil yalnız menüde nelerin görüneceğini belirler. Yetkileri, finansal güvenliği ve verileri değiştirmez; gizlenen bir ekran silinmez ve kullanıcı menüsünden açılır.', 'The profile only decides what the menu shows. It does not change permissions, financial safeguards or data; a hidden screen is not deleted and opens from the user menu.')}>
      <div className="space-y-5">
        <fieldset disabled={!edit} className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium">{L('Profil', 'Profile')}</legend>
          {PROFILES.map((p) => (
            <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${profile === p ? 'border-blue bg-blue-soft' : 'border-line bg-surface'}`}>
              <input type="radio" name="ws-profile" value={p} checked={profile === p} onChange={() => pick(p)} className="mt-1 size-4 accent-[var(--ac-blue)]" />
              <span>
                <span className="block text-[14px] font-medium">{L(PROFILE_TEXT[p].tr, PROFILE_TEXT[p].en)} <span className="tnum text-[12.5px] font-normal text-ink-2">· {effective(p, [], []).size} {L('bağlantı', 'links')}</span></span>
                <span className="block text-[12.5px] text-ink-2">{L(PROFILE_TEXT[p].descTr, PROFILE_TEXT[p].descEn)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset disabled={!edit}>
          <legend className="mb-1.5 text-[13px] font-medium">{L('Tek tek menü bağlantıları', 'Menu links one by one')}</legend>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {NAV_V1.map((n) => {
              const locked = ALWAYS_VISIBLE.has(n.slug)
              return (
                <li key={n.slug || 'home'}>
                  <label className="flex items-center gap-2.5 py-1 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={on.has(n.slug)}
                      disabled={locked || !edit}
                      onChange={(e) => setOn((cur) => { const next = new Set(cur); if (e.target.checked) next.add(n.slug); else next.delete(n.slug); return next })}
                      aria-label={`${L('Menüde göster', 'Show in menu')}: ${L(n.tr, n.en)}`}
                      className="size-4 accent-[var(--ac-blue)]"
                    />
                    <span className="flex-1">{L(n.tr, n.en)}</span>
                    <span className="text-[11.5px] text-ink-3">{locked ? L('her zaman görünür', 'always visible') : n.tier === 'basic' ? L('Temel', 'Basic') : L('Gelişmiş', 'Advanced')}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-2">{L('Görevler her profilde görünür; günlük işi kilitleyecek bağlantılar gizlenemez. Tek şubeli işletmede Şubeler bağlantısı otomatik gizlenir.', 'Tasks is visible in every profile; links that would lock the daily work cannot be hidden. In a single-branch business the Branches link is hidden automatically.')}</p>
        </fieldset>
        {err && <p role="alert" className="text-[13px] font-medium text-alert">{err}</p>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        {edit && (
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} onClick={save}>{L('Kaydet', 'Save')}</button>
          </div>
        )}
      </div>
    </Panel>
  )
}

export function ContractSection() {
  return (
    <Panel title={L('Sözleşme şablonları', 'Contract templates')} description={L('V1: ACARVO sözleşmeyi hazırlar (şablon, taslak, PDF, sürüm); gerekirse imza dış süreçte alınır. Doğrulanmamış bir e-imza veya ülke uygunluğu iddiası yoktur.', 'V1: ACARVO drafts the contract (template, draft, PDF, version); where needed the signature is taken in an external process. There is no unverified e-signature or country-compliance claim.')}>
      <ContractTemplatesPanel />
    </Panel>
  )
}
