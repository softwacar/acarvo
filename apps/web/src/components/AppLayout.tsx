import { Buildings, CaretDown, Check, Flask, List, MapPin, SignOut, UserCircle, X } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { useEffect, useState } from 'react'
import { authApi, vehiclesApi } from '@/lib/api'
import { cn, initials } from '@/lib/utils'
import { findNavItem, NAV } from '@/nav'
import { can, sessionQuery, useSession } from '@/session'
import { Mark, Wordmark } from './Mark'

const COLLAPSED_KEY = 'acarvo.nav.collapsed'
const DEFAULT_COLLAPSED = ['Müşteri & Ticari', 'Kontrol & Analiz', 'Finans', 'Kayıtlar']

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT_COLLAPSED
  } catch {
    return DEFAULT_COLLAPSED
  }
}

function useCurrentSlug() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return pathname.replace(/^\//, '').split('/')[0] ?? ''
}

const menuContent =
  'z-50 min-w-[240px] rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)] animate-fade'
const menuItem =
  'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-ink-2 outline-none data-[highlighted]:bg-ground data-[highlighted]:text-ink'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession()
  const current = useCurrentSlug()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const activeGroup = NAV.find((g) => g.items.some((i) => i.slug === current))?.label

  const toggle = (label: string) => {
    const next = collapsed.includes(label) ? collapsed.filter((l) => l !== label) : [...collapsed, label]
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
  }

  return (
    <nav aria-label="Ana menü" className="flex-1 overflow-y-auto px-3 pt-3 pb-6 [scrollbar-color:var(--ac-line)_transparent] [scrollbar-width:thin]">
      {NAV.map((group) => {
        const items = group.items.filter((i) => can(session, i.permission))
        if (!items.length) return null
        const open = !collapsed.includes(group.label) || group.label === activeGroup
        return (
          <div key={group.label} className="mt-3 first:mt-0">
            <button
              type="button"
              onClick={() => toggle(group.label)}
              aria-expanded={open}
              className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-[12px] font-medium text-ink-3 hover:text-ink-2"
            >
              <span className="flex-1 text-left">{group.label}</span>
              <span className="tnum text-[11px] text-ink-3/80">{items.length}</span>
              <CaretDown size={11} className={cn('transition-transform', !open && '-rotate-90')} />
            </button>
            {open && (
              <ul className="mt-0.5 space-y-px">
                {items.map((it) => {
                  const on = it.slug === current
                  const Ico = it.icon
                  return (
                    <li key={it.slug}>
                      <Link
                        to={it.slug ? '/$module' : '/'}
                        params={it.slug ? { module: it.slug } : {}}
                        onClick={onNavigate}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'flex h-9 items-center gap-3 rounded-lg px-3 font-medium transition-colors',
                          on
                            ? 'relative bg-surface text-ink shadow-[0_0_0_1px_var(--ac-line),0_1px_2px_rgb(16_24_40/0.05)] before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-blue'
                            : 'text-ink-2 hover:bg-line-soft hover:text-ink',
                        )}
                      >
                        <Ico size={18} weight={on ? 'fill' : 'regular'} className={cn('shrink-0', on && 'text-blue')} />
                        <span className="flex-1 truncate">{it.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function UserMenu() {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: async () => {
      qc.setQueryData(sessionQuery.queryKey, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
      await navigate({ to: '/giris' })
    },
  })
  const branchText = session.allBranches ? 'Tüm şubeler' : session.branches.map((b) => b.name).join(', ') || 'Şube atanmamış'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none hover:bg-line-soft data-[state=open]:bg-line-soft">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ground text-[13px] font-semibold">{initials(session.user.name)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-medium">{session.user.name}</span>
          <span className="block truncate text-[12px] text-ink-3">{session.company?.roles.join(', ') ?? 'Şirket erişimi yok'} · {branchText}</span>
        </span>
        <CaretDown size={12} className="shrink-0 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={6} className={menuContent}>
          <div className="px-2.5 pt-1.5 pb-2 text-[12px] text-ink-3">{session.user.email}</div>
          <DropdownMenu.Item className={menuItem} onSelect={() => navigate({ to: '/profil' })}>
            <UserCircle size={17} /> Profil ve oturum
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={() => logout.mutate()}>
            <SignOut size={17} /> Çıkış yap
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function CompanySwitcher() {
  const session = useSession()
  const qc = useQueryClient()
  const switchCompany = useMutation({
    mutationFn: authApi.switchCompany,
    onSuccess: (info) => {
      qc.setQueryData(sessionQuery.queryKey, info)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })
  const name = session.company?.name ?? 'Şirket seçilmedi'

  if (session.memberships.length < 2) {
    return (
      <span className="flex h-10 min-w-0 items-center gap-2 px-1 font-medium text-ink">
        <Buildings size={17} className="shrink-0 text-ink-3" />
        <span className="truncate">{name}</span>
      </span>
    )
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-line px-3 font-medium text-ink outline-none hover:bg-ground data-[state=open]:bg-ground"
        aria-label={`Şirket: ${name}. Şirket değiştir`}
      >
        <Buildings size={17} className="shrink-0 text-ink-3" />
        <span className="truncate">{name}</span>
        <CaretDown size={12} className="shrink-0 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContent}>
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">Şirket değiştir</DropdownMenu.Label>
          {session.memberships.map((m) => {
            const on = m.companyId === session.company?.id
            return (
              <DropdownMenu.Item
                key={m.companyId}
                className={cn(menuItem, on && 'text-ink')}
                disabled={switchCompany.isPending}
                onSelect={() => !on && switchCompany.mutate(m.companyId)}
              >
                <span className="flex-1 truncate">{m.companyName}</span>
                {on && <Check size={15} className="text-blue" />}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const session = useSession()
  const current = useCurrentSlug()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const vehicleMatch = pathname.match(/^\/araclar\/([0-9a-f-]{36})(\/duzenle)?$/i)
  const vehicle = useQuery({
    queryKey: ['vehicle', session.company?.id, vehicleMatch?.[1]],
    queryFn: () => vehiclesApi.get(vehicleMatch![1]!),
    enabled: !!vehicleMatch,
    retry: false,
  })
  const item = current === 'profil' ? { group: 'Hesap', label: 'Profil ve oturum' } : findNavItem(current)
  const branchLabel = session.allBranches ? 'Tüm şubeler' : session.branches.length === 1 ? session.branches[0]!.name : `${session.branches.length} şube`

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
      <button type="button" aria-label="Menüyü aç" onClick={onMenu} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-line-soft lg:hidden">
        <List size={20} />
      </button>
      <nav aria-label="Konum" className="flex min-w-0 items-center gap-2 text-ink-3">
        {item && !vehicleMatch && <span className="hidden sm:inline">{item.group}</span>}
        {item && !vehicleMatch && <span className="hidden text-line sm:inline">/</span>}
        {vehicleMatch ? (
          <>
            <Link to="/araclar" className="hidden hover:text-ink sm:inline">
              Araçlar
            </Link>
            <span className="hidden text-line sm:inline">/</span>
            {vehicleMatch[2] && vehicle.data ? (
              <>
                <Link to="/araclar/$vehicleId" params={{ vehicleId: vehicle.data.id }} className="truncate hover:text-ink">
                  {vehicle.data.plate}
                </Link>
                <span className="text-line">/</span>
                <span className="truncate font-medium text-ink">Düzenle</span>
              </>
            ) : (
              <span className="tnum truncate font-medium text-ink">{vehicle.data?.plate ?? 'Araç'}</span>
            )}
          </>
        ) : (
          <span className="truncate font-medium text-ink">{item?.label ?? 'Sayfa bulunamadı'}</span>
        )}
      </nav>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {session.environment !== 'production' && (
          <span className="hidden items-center gap-1.5 px-2 text-[12px] font-medium text-hold md:flex" title="Bu ortamdaki şirketler, kişiler ve kayıtlar geliştirme amaçlı örnek veridir.">
            <Flask size={15} weight="bold" />
            Geliştirme verisi
          </span>
        )}
        {session.company && (
          <span className="hidden h-10 items-center gap-1.5 px-2 text-ink-2 sm:flex" title="Erişebildiğiniz şubeler">
            <MapPin size={16} className="text-ink-3" />
            {branchLabel}
          </span>
        )}
        <CompanySwitcher />
      </div>
    </header>
  )
}

/** Authenticated frame: §4 sidebar, top bar with company context, page outlet. */
export function AppLayout() {
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => setOpen(false), [pathname])
  // On sign-out (or a forced 401) the session is cleared just before the redirect to /giris:
  // render nothing in between instead of letting children ask for a session that is gone.
  const { data: session } = useQuery(sessionQuery)
  if (!session) return null

  return (
    <div className="flex min-h-dvh">
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col border-r border-line bg-rail transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
          <Mark />
          <Wordmark />
          <button type="button" aria-label="Menüyü kapat" onClick={() => setOpen(false)} className="ml-auto grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-line-soft lg:hidden">
            <X size={18} />
          </button>
        </div>
        <Sidebar onNavigate={() => setOpen(false)} />
        <div className="shrink-0 border-t border-line p-2">
          <UserMenu />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        {/^\/araclar\/(?!yeni$)[^/]+$/.test(pathname) ? (
          // Araç 360° is a full-width workspace with its own sticky bars, like the V5 design.
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        ) : (
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1200px]">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
