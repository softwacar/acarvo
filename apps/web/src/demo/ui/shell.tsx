import { Bell, CaretDown, CaretRight, Check, ClockCounterClockwise, Flask, Globe, List, MagnifyingGlass, MapPin, Play, Question, ShieldStar, Storefront, Swap, UserCircle, X } from '@phosphor-icons/react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Dialog, DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Mark, Wordmark } from '@/components/Mark'
import { Sheet } from './dialogs'
import { toast } from './dialogs'
import { useReturnFocus } from '@/components/useReturnFocus'
import { cn, initials } from '@/lib/utils'
import { L, setLangGlobal } from '../i18n'
import { demoNav, navItemOf, otherScreens, visibleNav } from '../nav'
import { DEFERRED, GATED_VIEWS, LEGACY } from '../core/modules'
import { setConceptPreview } from '../core/ops/control'
import { ScopeBadge } from './gate'
import { inboxOf } from '../core/inbox'
import { SCENARIOS } from '../core/scenarios'
import { searchAll } from '../core/search'
import { commit, resetDemo, usePersistFailed } from '../core/store'
import { markNotificationsRead, setBranchFilter, setClock, setLanguage, switchUser } from '../core/ops/control'
import { DAY, HOUR, zonedIso, dayOf, addDaysYmd } from '../core/time'
import { entityHref, runAction, useAlerts, useCan, useDb, useFmt, useMe } from './hooks'
import { btnGhost, btnPrimary, btnSecondary, FinanceDialog, Notice } from './kit'
import { DateTimeF } from './forms'

const COLLAPSED_KEY = 'acarvo.demo.nav.collapsed'
const DEFAULT_COLLAPSED: string[] = []
const menuContent = 'z-50 min-w-[250px] max-w-[92vw] rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)] animate-fade'
const menuItem = 'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-ink-2 outline-none data-[highlighted]:bg-ground data-[highlighted]:text-ink'

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT_COLLAPSED
  } catch {
    return DEFAULT_COLLAPSED
  }
}
const useSlug = () => useRouterState({ select: (s) => s.location.pathname }).replace(/^\//, '').split('/')[0] ?? ''

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const can = useCan()
  const current = useSlug()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const d = useDb()
  const groups = visibleNav(d, can)
  const activeGroup = groups.find((g) => g.items.some((i) => i.slug === current))?.key
  const toggle = (key: string) => {
    const next = collapsed.includes(key) ? collapsed.filter((l) => l !== key) : [...collapsed, key]
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
  }
  return (
    <nav aria-label={L('Ana menü', 'Main menu')} className="flex-1 overflow-y-auto px-3 pt-3 pb-6 [scrollbar-color:var(--ac-line)_transparent] [scrollbar-width:thin]">
      {groups.map((g) => {
        const items = g.items
        const open = !collapsed.includes(g.key) || g.key === activeGroup
        return (
          <div key={g.key} className="mt-3 first:mt-0">
            <button type="button" onClick={() => toggle(g.key)} aria-expanded={open} className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-[12px] font-medium text-ink-3 hover:text-ink-2">
              <span className="flex-1 text-left">{g.label}</span>
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
                        to={(it.slug ? `/${it.slug}` : '/') as never}
                        onClick={onNavigate}
                        aria-current={on ? 'page' : undefined}
                        className={cn('flex h-9 items-center gap-3 rounded-lg px-3 font-medium transition-colors', on ? 'relative bg-surface text-ink shadow-[0_0_0_1px_var(--ac-line),0_1px_2px_rgb(16_24_40/0.05)] before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-blue' : 'text-ink-2 hover:bg-line-soft hover:text-ink')}
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

// ---------------------------------------------------------------- user (role) switcher

function UserMenu() {
  const d = useDb()
  const me = useMe()
  const can = useCan()
  const others = otherScreens(d, can)
  const role = d.roles.find((r) => r.id === me.roleId)
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={L('Demo kullanıcısı ve rol değiştir', 'Switch demo user and role')} className="flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none hover:bg-line-soft data-[state=open]:bg-line-soft">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ground text-[13px] font-semibold">{initials(me.name)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-medium">{me.name}</span>
          <span className="block truncate text-[12px] text-ink-3">{role?.name} · {me.branchIds.length ? me.branchIds.map((b) => d.branches.find((x) => x.id === b)?.code).join(', ') : L('Tüm şubeler', 'All branches')}</span>
        </span>
        <Swap size={14} className="shrink-0 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={6} className={cn(menuContent, 'max-h-[70vh] overflow-y-auto')}>
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">{L('Demo kullanıcısı (rol simülasyonu)', 'Demo user (role simulation)')}</DropdownMenu.Label>
          {d.users.filter((u) => u.status === 'active').map((u) => (
            <DropdownMenu.Item
              key={u.id}
              className={menuItem}
              onSelect={() => {
                const r = runAction((x) => switchUser(x, u.id), `${u.name} ${L('olarak devam ediyorsunuz (demo).', 'is now the acting demo user.')}`)
                if (!r.ok) toast(r.error)
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{u.name}</span>
                <span className="block truncate text-[12px] text-ink-3">{d.roles.find((r) => r.id === u.roleId)?.name} · {u.title}</span>
              </span>
              {u.id === me.id && <Check size={15} className="text-blue" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {others.length > 0 && (
            <>
              <DropdownMenu.Label className="px-2.5 pt-1 pb-0.5 text-[12px] text-ink-3">{L('Menüde gizli ekranlar (çalışma profili)', 'Screens hidden from the menu (working profile)')}</DropdownMenu.Label>
              {others.map((o) => (
                <DropdownMenu.Item key={o.slug} className={menuItem} onSelect={() => navigate({ to: (o.slug ? '/' + o.slug : '/') as never })}>
                  <o.icon size={17} /> {o.label}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          {can('users:view') && (
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate({ to: '/kullanicilar' as never })}>
              <UserCircle size={17} /> {L('Kullanıcılar ve roller', 'Users and roles')}
            </DropdownMenu.Item>
          )}
          <p className="px-2.5 py-2 text-[11.5px] leading-snug text-ink-3">{L('Yetki görünümü yalnız demo arayüz simülasyonudur; gerçek sunucu güvenliği değildir.', 'Permission views are a demo UI simulation, not real server security.')}</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ---------------------------------------------------------------- header controls

function BranchFilter() {
  const d = useDb()
  const me = useMe()
  const scope = me.branchIds.length ? d.branches.filter((b) => me.branchIds.includes(b.id)) : d.branches
  if (scope.length < 2) {
    return (
      <span className="hidden h-10 items-center gap-1.5 px-2 text-ink-2 md:flex">
        <MapPin size={16} className="text-ink-3" /> {scope[0]?.name}
      </span>
    )
  }
  return (
    <label className="flex items-center gap-1.5 text-ink-2">
      <MapPin size={16} className="hidden text-ink-3 sm:block" />
      <span className="sr-only">{L('Şube filtresi', 'Branch filter')}</span>
      <span className="relative block">
        <select
          aria-label={L('Şube filtresi', 'Branch filter')}
          value={d.session.branchId}
          onChange={(e) => runAction((x) => setBranchFilter(x, e.target.value))}
          className="h-10 max-w-[124px] appearance-none sm:max-w-[170px] rounded-lg border border-line bg-surface pr-6 pl-2.5 sm:pr-7 sm:pl-3 text-[13px] sm:text-[13.5px] text-ink outline-none hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
        >
          <option value="all">{L('Tüm şubeler', 'All branches')}</option>
          {scope.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </select>
        <CaretDown size={12} aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-3" />
      </span>
    </label>
  )
}

function Notifications() {
  const d = useDb()
  const me = useMe()
  const alerts = useAlerts()
  const f = useFmt()
  const myLate = inboxOf(d).mine.filter((i) => i.kind === 'task' && i.overdue && i.reason === 'assigned').slice(0, 3)
  const stored = d.notifications.filter((n) => !n.userId || n.userId === me.id).slice(0, 8)
  const unread = stored.filter((n) => !n.read).length
  const crit = alerts.filter((a) => a.severity === 'critical' && a.kind !== 'task_overdue').length
  const count = unread + crit + myLate.length
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={`${L('Bildirimler', 'Notifications')}${count ? ` (${count})` : ''}`} className="relative grid size-10 place-items-center rounded-lg border border-line text-ink-2 outline-none hover:bg-ground data-[state=open]:bg-ground">
        <Bell size={18} />
        {count > 0 && <span className="tnum absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-full bg-alert px-1 text-[10.5px] font-semibold text-white">{count > 9 ? '9+' : count}</span>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={cn(menuContent, 'max-h-[72vh] w-[380px] overflow-y-auto')}>
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
            <span className="text-[12px] font-medium text-ink-3">{L('Bildirimler', 'Notifications')}</span>
            {unread > 0 && (
              <button type="button" className="text-[12px] font-medium text-blue hover:underline" onClick={() => runAction((x) => markNotificationsRead(x))}>
                {L('Okundu say', 'Mark read')}
              </button>
            )}
          </div>
          <p className="px-2.5 pb-1.5 text-[11.5px] leading-snug text-ink-3">{L('Uyarılar kayıtlardan hesaplanır; e-posta veya SMS gönderilmez.', 'Alerts are derived from records; no e-mail or SMS is sent.')}</p>
          {myLate.map((i) => (
            <DropdownMenu.Item key={i.key} asChild>
              <Link to={entityHref(i.link.type, i.link.id) as never} className={cn(menuItem, 'items-start')}>
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-alert" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{L('Görev gecikti', 'Task overdue')}: {i.title}</span>
                  <span className="block text-[12px] text-ink-3">{i.detail}</span>
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}
          {alerts.filter((a) => a.kind !== 'task_overdue' || !myLate.length).slice(0, 6).map((a) => (
            <DropdownMenu.Item key={a.id} asChild>
              <Link to={entityHref(a.link.type, a.link.id) as never} className={cn(menuItem, 'items-start')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-alert' : a.severity === 'warning' ? 'bg-hold' : 'bg-blue')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{a.title}</span>
                  <span className="block text-[12px] text-ink-3">{a.detail.slice(0, 80)}</span>
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}
          {stored.map((n) => (
            <DropdownMenu.Item key={n.id} asChild>
              <Link to={(n.link ? entityHref(n.link.type, n.link.id) : '/') as never} className={cn(menuItem, 'items-start', !n.read && 'bg-blue-soft/50')}>
                <ClockCounterClockwise size={15} className="mt-0.5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{n.text}</span>
                  <span className="tnum block text-[12px] text-ink-3">{f.dt(n.at)}</span>
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item asChild>
            <Link to={'/islerim?sekme=uyarilar' as never} className={cn(menuItem, 'justify-center font-medium text-blue')}>
              {L('Tüm uyarılar (İşlerim)', 'All alerts (My Work)')}
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ---------------------------------------------------------------- global search (Ctrl/⌘ + K)

function SearchPalette({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const returnFocus = useReturnFocus()
  const hits = useMemo(() => searchAll(d, q), [d, q])
  const pages = useMemo(
    () =>
      q.trim().length < 1
        ? []
        : [
            ...demoNav()
              .flatMap((g) => g.items)
              .filter((i) => can(i.perm) && i.label.toLowerCase().includes(q.trim().toLowerCase()))
              .map((i) => ({ slug: i.slug, label: i.label, href: i.slug ? '/' + i.slug : '/', moved: false })),
            ...LEGACY.filter((l) => l.kind !== 'same' && l.kind !== 'deferred' && L(l.tr, l.en).toLowerCase().includes(q.trim().toLowerCase())).map((l) => ({ slug: l.slug, label: L(l.tr, l.en), href: l.kind === 'record-screen' ? '/' + l.slug : (l.to ?? '/'), moved: true })),
          ].slice(0, 6),
    [q, can],
  )
  const rows = [...pages.map((p) => ({ key: `p-${p.slug}-${p.moved ? 'm' : 'n'}`, title: p.label, sub: p.moved ? L('Sayfa · yeni yerinde açılır', 'Page · opens at its new place') : L('Sayfa', 'Page'), href: p.href })), ...hits.map((h) => ({ key: `${h.type}-${h.id}`, title: h.title, sub: `${h.group} · ${h.sub}`, href: entityHref(h.type, h.id) }))]
  const go = (href: string) => {
    onClose()
    void navigate({ to: href as never })
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-[12vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl border border-line bg-surface shadow-xl outline-none">
          <Dialog.Title className="sr-only">{L('Genel arama', 'Global search')}</Dialog.Title>
          <Dialog.Description className="sr-only">{L('Plaka, müşteri, kiralama veya sayfa adı yazın.', 'Type a plate, customer, rental or page name.')}</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <MagnifyingGlass size={18} className="text-ink-3" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-label={L('Ara', 'Search')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setHi(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHi((h) => Math.min(rows.length - 1, h + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHi((h) => Math.max(0, h - 1))
                } else if (e.key === 'Enter' && rows[hi]) go(rows[hi]!.href)
              }}
              placeholder={L('Plaka, müşteri, kiralama no, sayfa…', 'Plate, customer, rental no, page…')}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
          </div>
          <ul id="search-results" role="listbox" aria-label={L('Sonuçlar', 'Results')} className="max-h-[50vh] overflow-y-auto p-1.5">
            {rows.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-3">{q.trim().length < 2 ? L('En az 2 karakter yazın.', 'Type at least 2 characters.') : L('Sonuç yok (yetkiniz ve şube kapsamınız içinde).', 'No results (within your permissions and branch scope).')}</li>}
            {rows.map((r, i) => (
              <li key={r.key} role="option" aria-selected={i === hi}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => go(r.href)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === hi && 'bg-ground')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{r.sub}</span>
                  </span>
                  <CaretRight size={13} className="text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------- demo menu: date, scenarios, reset, context, language

function ClockDialog({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const tz = d.settings.company.tz
  const [value, setValue] = useState(d.clock.now)
  const [error, setError] = useState<string | null>(null)
  const anchor = zonedIso(d.meta.anchor, '10:00', tz)
  return (
    <FinanceDialog
      title={L('Demo tarihi ve saati', 'Demo date and time')}
      description={L('Geciken, yaklaşan ve “bugün” hesapları seçilen demo anına göre yeniden hesaplanır. Arka planda çalışan iş yoktur.', 'Overdue, upcoming and "today" are recalculated for the chosen demo moment. No background job runs.')}
      confirm={L('Uygula', 'Apply')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((x) => setClock(x, value), L('Demo tarihi güncellendi.', 'Demo date updated.'))
        if (!r.ok) return r.error
        onClose()
        setError(null)
      }}
    >
      <DateTimeF id="clock" label={L('Demo anı', 'Demo moment')} value={value} onChange={setValue} tz={tz} />
      <div className="flex flex-wrap gap-2">
        {[
          [L('Başlangıç anı', 'Start moment'), () => setValue(anchor)],
          ['+1 ' + L('saat', 'hour'), () => setValue(new Date(Date.parse(value) + HOUR).toISOString())],
          ['+1 ' + L('gün', 'day'), () => setValue(new Date(Date.parse(value) + DAY).toISOString())],
          ['−1 ' + L('gün', 'day'), () => setValue(new Date(Date.parse(value) - DAY).toISOString())],
          [L('Yarın 09:00', 'Tomorrow 09:00'), () => setValue(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 1), '09:00', tz))],
        ].map(([label, fn]) => (
          <button key={label as string} type="button" onClick={fn as () => void} className="h-8 rounded-md border border-line px-2.5 text-[13px] font-medium hover:bg-ground">
            {label as string}
          </button>
        ))}
      </div>
      {error && <p className="text-[13px] text-alert">{error}</p>}
    </FinanceDialog>
  )
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <FinanceDialog
      title={L('Demo verilerini sıfırla', 'Reset demo data')}
      description={L('Tarayıcıda saklanan bütün demo kayıtları silinir ve başlangıç senaryosu yeniden yüklenir. Gerçek ACARVO kayıtları ve veritabanı etkilenmez: bu veriler hiçbir zaman sunucuya gönderilmedi.', 'All demo records stored in this browser are discarded and the starting scenario is reloaded. Real ACARVO records and the database are not affected: this data was never sent to a server.')}
      confirm={L('Sıfırla', 'Reset')}
      danger
      onClose={onClose}
      onSubmit={async () => {
        await resetDemo()
        toast(L('Demo başlangıç senaryosuna döndü.', 'Demo returned to the starting scenario.'))
        onClose()
        void navigate({ to: '/' as never })
      }}
    />
  )
}

function ScenarioSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title={L('Demo senaryoları', 'Demo scenarios')} subtitle={L('Sunum için hazır akışlar. “Hazırla” yalnız demo kayıtlarını oluşturur.', 'Ready-made flows for a presentation. "Prepare" only creates demo records.')} onClose={onClose}>
      <div className="space-y-4">
        {error && <Notice tone="alert">{error}</Notice>}
        {SCENARIOS.map((s) => (
          <article key={s.id} className="rounded-xl border border-line p-4">
            <h3 className="font-semibold">{s.title()}</h3>
            <p className="mt-0.5 text-[13px] text-ink-2">{s.summary()}</p>
            <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
              {s.steps().map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ol>
            <button
              type="button"
              className={cn(btnSecondary, 'mt-3 h-9')}
              onClick={() => {
                const r = runAction((d) => s.prepare(d))
                if (!r.ok) return setError(r.error)
                setError(null)
                onClose()
                if (r.value.note) toast(r.value.note)
                void navigate({ to: r.value.path as never })
              }}
            >
              <Play size={14} weight="fill" /> {L('Hazırla ve aç', 'Prepare and open')}
            </button>
          </article>
        ))}
      </div>
    </Sheet>
  )
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <FinanceDialog
      title={L('Bu demo hakkında', 'About this demo')}
      description={L('Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.', 'Interactive product concept. Payments and records are simulated in the demo; there is no real POS, bank, document delivery or legal compliance integration.')}
      confirm={L('Anladım', 'Got it')}
      onClose={onClose}
      onSubmit={() => onClose()}
    >
      <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-ink-2">
        <li>{L('Veriler yalnız bu tarayıcıda saklanır; sunucuya gönderilmez. Gerçek ACARVO uygulamasından tamamen ayrıdır.', 'Data stays in this browser only and is never sent to a server. It is completely separate from the real ACARVO application.')}</li>
        <li>{L('Şirket, kişi, plaka, telefon ve e-posta bilgileri kurgusaldır.', 'Company, people, plates, phones and e-mails are fictional.')}</li>
        <li>{L('Kurlar işletmenin elle belirlediği örnek kurlardır; vergi oranları ve sözleşme metinleri hukuki veya mali tavsiye değildir.', 'Rates are sample business-defined rates; tax rates and contract texts are not legal or tax advice.')}</li>
        <li>{L('Yetki görünümleri yalnız arayüz simülasyonudur. Yapay zekâ, SMS, e-posta veya e-imza hizmeti yoktur.', 'Permission views are a UI simulation only. There is no AI, SMS, e-mail or e-signature service.')}</li>
      </ul>
    </FinanceDialog>
  )
}

type DemoDialog = 'clock' | 'reset' | 'scenarios' | 'about' | 'search' | 'preview' | null

function PreviewSheet({ onClose }: { onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const navigate = useNavigate()
  const on = d.session.preview
  const go = (to: string) => {
    onClose()
    void navigate({ to: to as never })
  }
  return (
    <Sheet title={L('Gelişmiş konsept ön izlemesi', 'Advanced concept preview')} subtitle={L('V1.5 ve V2 ekranları kodda korunur; ürünün parçası değildir ve menüye bağlantı eklemez.', 'V1.5 and V2 screens are kept in the code; they are not part of the product and add no menu link.')} onClose={onClose}>
      <div className="space-y-4">
        <Notice tone={on ? 'hold' : 'blue'}>{on ? L('Ön izleme açık: V1.5 / V2 ekranları “Demo konsepti” bandıyla açılır. Çalışan işlemler yalnız tarayıcıdaki demo kaydını değiştirir.', 'Preview is on: V1.5 / V2 screens open under a “Demo concept” banner. Working actions only change the demo record in this browser.') : L('Ön izleme kapalı: bu ekranlar “bu sürümde etkin değil” sayfası gösterir.', 'Preview is off: these screens show a “not active in this version” page.')}</Notice>
        {can('preview:use') ? (
          <button type="button" className={on ? btnSecondary : btnPrimary} onClick={() => runAction((x) => setConceptPreview(x, !on), on ? L('Konsept ön izlemesi kapatıldı.', 'Concept preview is off.') : L('Gelişmiş konsept ön izlemesi açık (demo).', 'Advanced concept preview is on (demo).'))}>
            {on ? L('Ön izlemeyi kapat', 'Turn the preview off') : L('Ön izlemeyi aç', 'Turn the preview on')}
          </button>
        ) : (
          <p className="text-[13px] text-ink-2">{L('Ön izleme yetkisi yok: Sahip veya Yönetici demo rolüne geçin.', 'No preview permission: switch to the Owner or Manager demo role.')}</p>
        )}
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {[...DEFERRED.map((l) => ({ key: l.slug, label: L(l.tr, l.en), scope: l.scope, note: L(l.noteTr ?? '', l.noteEn ?? ''), to: '/' + l.slug })), ...GATED_VIEWS.map((g) => ({ key: g.id, label: L(g.tr, g.en), scope: g.scope, note: L(g.noteTr, g.noteEn), to: g.to }))].map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-medium">{it.label} <ScopeBadge scope={it.scope} /></span>
                <span className="mt-0.5 block text-[12.5px] text-ink-2">{it.note}</span>
              </span>
              <button type="button" className={btnSecondary} disabled={!on} title={on ? undefined : L('Önce ön izlemeyi açın', 'Turn the preview on first')} onClick={() => go(it.to)}>{L('Aç', 'Open')}</button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}

function DemoMenu({ open }: { open: (d: DemoDialog) => void }) {
  const d = useDb()
  const navigate = useNavigate()
  const lang = d.session.lang
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Demo" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-hold/40 bg-hold-soft px-3 text-[13px] font-medium text-hold outline-none hover:bg-hold-soft/70 data-[state=open]:bg-hold-soft/70">
        <Flask size={15} weight="bold" /> <span className="hidden sm:inline">Demo</span> <CaretDown size={11} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContent}>
          <DropdownMenu.Item className={menuItem} onSelect={() => open('scenarios')}>
            <Play size={16} /> {L('Demo senaryoları', 'Demo scenarios')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => open('clock')}>
            <ClockCounterClockwise size={16} /> {L('Demo tarihi ve saati', 'Demo date and time')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() => {
              const next = lang === 'tr' ? 'en' : 'tr'
              setLangGlobal(next)
              commit((x) => setLanguage(x, next))
            }}
          >
            <Globe size={16} /> {L('Dil: Türkçe → English', 'Language: English → Türkçe')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => open('preview')}>
            <Flask size={16} /> {L('Gelişmiş konsept ön izlemesi', 'Advanced concept preview')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Label className="px-2.5 pt-1 pb-0.5 text-[12px] text-ink-3">{L('Bağlam', 'Context')}</DropdownMenu.Label>
          <DropdownMenu.Item className={menuItem} onSelect={() => { commit((x) => { x.session.context = 'platform' }); void navigate({ to: '/platform' as never }) }}>
            <ShieldStar size={16} /> {L('Platform Konsolu (Süper Yönetici)', 'Platform Console (Super Admin)')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => { commit((x) => { x.session.context = 'partner' }); void navigate({ to: '/partner' as never }) }}>
            <Storefront size={16} /> {L('Partner Portalı (dış bağlam)', 'Partner Portal (external context)')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={() => open('about')}>
            <Question size={16} /> {L('Bu demo hakkında', 'About this demo')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cn(menuItem, 'text-alert data-[highlighted]:text-alert')} onSelect={() => open('reset')}>
            <X size={16} /> {L('Demo verilerini sıfırla', 'Reset demo data')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function DemoBanner({ onClock }: { onClock: () => void }) {
  const d = useDb()
  const f = useFmt()
  const saveFailed = usePersistFailed()
  return (
    <div role="note" className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hold/25 bg-hold-soft px-4 py-1.5 text-[12.5px] text-hold lg:px-6">
      <span className="inline-flex items-center gap-1.5 font-semibold tracking-[0.01em]">
        <Flask size={14} weight="bold" /> {L('ACARVO DEMO — Örnek Veriler', 'ACARVO DEMO — Sample Data')}
      </span>
      <span className="hidden min-w-0 flex-1 truncate text-hold lg:inline">{L('Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.', 'Interactive product concept. Payments and records are simulated in the demo; there is no real POS, bank or document delivery.')}</span>
      {saveFailed && (
        <span role="alert" className="font-semibold text-alert">
          {L('Bu tarayıcıda kayıt yapılamıyor: değişiklikler yalnız bu sekmede kalır, sayfayı yenileyince kaybolur.', 'This browser cannot save: changes stay in this tab only and are lost when the page is reloaded.')}
        </span>
      )}
      <button type="button" onClick={onClock} className="tnum ml-auto inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium hover:bg-hold/10" title={L('Demo tarihini değiştir', 'Change the demo date')} data-testid="demo-clock">
        <ClockCounterClockwise size={13} /> {L('Demo zamanı', 'Demo time')}: {f.dt(d.clock.now)}
      </button>
    </div>
  )
}

function TopBar({ onMenu, open }: { onMenu: () => void; open: (d: DemoDialog) => void }) {
  const slug = useSlug()
  const item = navItemOf(slug)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const detail = pathname.split('/').length > 2
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur-sm sm:gap-3 sm:px-4 lg:px-6">
      <button type="button" aria-label={L('Menüyü aç', 'Open menu')} onClick={onMenu} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-line-soft lg:hidden">
        <List size={20} />
      </button>
      <nav aria-label={L('Konum', 'Location')} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-ink-3 max-sm:*:hidden">
        {item && <span className="hidden sm:inline">{demoNav().find((g) => g.key === item.group)?.label ?? item.group}</span>}
        {item && <span className="hidden text-line sm:inline">/</span>}
        {item ? (
          detail ? (
            <Link to={(item.slug ? `/${item.slug}` : '/') as never} className="hidden truncate py-1 hover:text-ink sm:inline">
              {item.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-ink">{item.label}</span>
          )
        ) : (
          <span className="truncate font-medium text-ink">ACARVO</span>
        )}
        {item && detail && <span className="hidden text-line sm:inline">/</span>}
        {item && detail && <span className="truncate font-medium text-ink">{L('Ayrıntı', 'Detail')}</span>}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={() => open('search')} aria-label={L('Ara (Ctrl K)', 'Search (Ctrl K)')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-2.5 sm:px-3 text-ink-3 hover:bg-ground">
          <MagnifyingGlass size={16} />
          <span className="hidden md:inline">{L('Ara…', 'Search…')}</span>
          <kbd className="hidden rounded border border-line px-1.5 text-[11px] lg:inline">Ctrl K</kbd>
        </button>
        <BranchFilter />
        <Notifications />
        <DemoMenu open={open} />
      </div>
    </header>
  )
}

/** Company application frame: demo banner, §4 sidebar, top bar, page outlet. */
export function DemoShell() {
  // Subscribing to the projected state makes the whole frame re-render when the language changes (nothing is re-mounted).
  void useDb().session.lang
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<DemoDialog>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => setMenu(false), [pathname])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setDialog('search')
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const wide = /^\/araclar\/[^/]+$/.test(pathname) && !pathname.endsWith('/yeni')
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner onClock={() => setDialog('clock')} />
      <div className="flex min-h-0 flex-1">
        {menu && <div aria-hidden className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMenu(false)} />}
        <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col border-r border-line bg-rail transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
            <Mark />
            <Wordmark />
            <button type="button" aria-label={L('Menüyü kapat', 'Close menu')} onClick={() => setMenu(false)} className="ml-auto grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-line-soft lg:hidden">
              <X size={18} />
            </button>
          </div>
          <Sidebar onNavigate={() => setMenu(false)} />
          <div className="shrink-0 border-t border-line p-2">
            <UserMenu />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMenu(true)} open={setDialog} />
          <main className={cn('min-w-0 flex-1', wide ? '' : 'px-4 py-6 sm:px-6 lg:px-8 lg:py-8')}>
            {wide ? <Outlet /> : <div className="mx-auto max-w-[1240px]"><Outlet /></div>}
          </main>
          <footer className="border-t border-line px-4 py-3 text-[12px] text-ink-3 lg:px-8">{L('Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.', 'Interactive product concept. Payments and records are simulated in the demo; there is no real POS, bank, document delivery or legal compliance integration.')}</footer>
        </div>
      </div>
      {dialog === 'clock' && <ClockDialog onClose={() => setDialog(null)} />}
      {dialog === 'reset' && <ResetDialog onClose={() => setDialog(null)} />}
      {dialog === 'scenarios' && <ScenarioSheet onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog === 'search' && <SearchPalette onClose={() => setDialog(null)} />}
      {dialog === 'preview' && <PreviewSheet onClose={() => setDialog(null)} />}
    </div>
  )
}

/** Wraps a screen: shows a clear message when the acting demo user lacks the view permission. */
export function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const can = useCan()
  if (can(perm)) return <>{children}</>
  return (
    <div className="mx-auto max-w-[520px] rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <h1 className="text-[17px] font-semibold">{L('Bu ekran için yetkiniz yok', 'You do not have access to this screen')}</h1>
      <p className="mt-1.5 text-ink-2">{L('Demo rolünüz bu ekranı görüntülemeye izin vermiyor. Sol alttaki kullanıcı menüsünden başka bir demo rolüne geçerek deneyebilirsiniz.', 'Your demo role does not allow viewing this screen. Use the user menu at the bottom left to try another demo role.')}</p>
      <p className="mt-3 text-[12px] text-ink-3">{L('Yetki kontrolü yalnız demo arayüz simülasyonudur.', 'Permission checks are a demo UI simulation only.')} ({perm})</p>
    </div>
  )
}
export { btnGhost, btnPrimary }
