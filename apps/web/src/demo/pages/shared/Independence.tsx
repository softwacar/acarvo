import { LockSimple, ShieldCheck, UsersThree } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { authorizersOf, independenceReport, type IndependenceRow, RISK_LABEL, verifiersOf } from '../../core/risk'
import { L, loc } from '../../i18n'
import { useDb } from '../../ui/hooks'
import { Notice, Panel, Pill } from '../../ui/kit'
import { RiskBadge } from './FinanceBits'

// "Who can do what with the people we have": the honest picture of independent approval (decision document K-4 / M.3 / M.4).
// It never changes a permission and never offers a fake second approver; where an action is locked it says why and how to open it.

const STATE = (s: IndependenceRow['state']) => (s === 'ok' ? { tone: 'ok' as const, text: L('Çalışır', 'Works') } : s === 'other' ? { tone: 'hold' as const, text: L('Başka kişi gerekir', 'Needs another person') } : { tone: 'alert' as const, text: L('Kilitli', 'Locked') })

export function IndependencePanel({ compact = false }: { compact?: boolean }) {
  const d = useDb()
  const rows = independenceReport(d)
  const authorizers = authorizersOf(d)
  const verifiers = verifiersOf(d)
  const locked = rows.filter((r) => r.state === 'locked')
  return (
    <Panel
      title={L('Bağımsız onay durumu', 'Independent approval status')}
      description={L('Mevcut kullanıcılarla hangi işlemler çalışır, hangileri bağımsız ikinci bir yetkili olmadığı için kilitli. Menü görünürlüğü bu durumu değiştirmez.', 'Which actions work with the current people and which are locked because there is no independent second authorizer. Menu visibility does not change this.')}
      action={<Link to={'/kullanicilar' as never} className="text-[13px] font-medium text-blue hover:underline">{L('Kullanıcılar ve Roller', 'Users & Roles')}</Link>}
    >
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1.5"><UsersThree size={15} /> {L('Onay yetkilisi', 'Authorizers')}: <span className="tnum font-medium text-ink">{authorizers.length}</span></span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} /> {L('Doğrulayıcı', 'Verifiers')}: <span className="tnum font-medium text-ink">{verifiers.length}</span></span>
        </p>
        {locked.length > 0 && (
          <Notice tone="alert">
            <span className="font-medium">{L('Kilitli işlemler', 'Locked actions')}:</span> {locked.map((r) => loc(r.label)).join(' · ')}. {L('Çözüm: ikinci bir Sahip/Yönetici veya dış muhasebeci kullanıcısı ekleyin. Tek kişilik işletmede kendini doğrulama (V1.5 adayı) bu işlemleri açmaz.', 'Fix: add a second Owner/Manager or an external accountant user. Self-verification for a one-person business (a V1.5 candidate) does not open these actions.')}
          </Notice>
        )}
        {!compact && (
          <ul className="divide-y divide-line-soft" aria-label={L('İşlem durumları', 'Action states')}>
            {rows.map((r) => {
              const st = STATE(r.state)
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]" data-testid={`ind-${r.id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{r.state === 'locked' && <LockSimple size={14} className="text-alert" />}{loc(r.label)} <RiskBadge level={r.level} /></span>
                    <span className="block text-[12.5px] text-ink-2">{loc(r.why)}</span>
                  </span>
                  <Pill tone={st.tone}>{st.text}</Pill>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-[12px] text-ink-3">
          {[0, 1, 2, 3].map((n) => `${L(RISK_LABEL[n as 0].tr, RISK_LABEL[n as 0].en)}`).join(' · ')}
        </p>
      </div>
    </Panel>
  )
}
