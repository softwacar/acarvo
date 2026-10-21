import { L } from '../../i18n'
import { useCan, useUrlState } from '../../ui/hooks'
import { Embedded, Tabs } from '../../ui/kit'
import { RolesPage } from './RolesPage'
import { UsersPage } from './UsersPage'

// "Kullanıcılar ve Roller": one administration screen with two views (decision document H.2). The role matrix keeps its own permission.

type TabId = 'kullanicilar' | 'roller'

export function UsersRolesPage() {
  const can = useCan()
  const [tabRaw, setTab] = useUrlState('sekme', 'kullanicilar')
  const tab: TabId = tabRaw === 'roller' && can('roles:view') ? 'roller' : 'kullanicilar'
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{L('Kullanıcılar ve Roller', 'Users & Roles')}</h1>
        <p className="mt-1 max-w-[860px] text-ink-2">{L('Kişiler, rolleri ve şube kapsamları. Dört hazır rol vardır: Sahip, Yönetici, Operasyon, Muhasebe. Yetki görünümü yalnız demo simülasyonudur; gerçek sunucu güvenliği değildir.', 'People, their roles and branch scope. There are four ready roles: Owner, Manager, Operations, Accounting. The permission view is a demo simulation only, not real server security.')}</p>
      </header>
      <Tabs<TabId>
        label={L('Kullanıcılar ve Roller bölümleri', 'Users & Roles sections')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'kullanicilar', label: L('Kullanıcılar', 'Users') },
          { id: 'roller', label: L('Roller', 'Roles'), hidden: !can('roles:view') },
        ]}
      />
      <Embedded>{tab === 'roller' ? <RolesPage /> : <UsersPage />}</Embedded>
    </div>
  )
}
