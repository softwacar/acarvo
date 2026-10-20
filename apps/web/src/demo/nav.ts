import { Bandaids, Buildings, CalendarBlank, CalendarCheck, CarProfile, ClipboardText, ClockCounterClockwise, Coins, FileText, GearSix, House, type Icon, Key, MapPin, Receipt, SealCheck, ShieldCheck, Tag, Tray, Users, Vault, Wrench } from '@phosphor-icons/react'
import { L } from './i18n'
import { GROUPS, type GroupKey, legacyOf, NAV_V1, profileLinks } from './core/modules'
import type { Db } from './core/types'

// The company sidebar is the V1 menu of the decision document (H.2): 6 groups, 21 links. The 36 legacy links of spec §4
// are not links any more; each one maps to a screen, a view or a tab of these 21 (core/modules.ts, LEGACY) and its old
// address redirects there. Platform Console and the Partner Portal are separate contexts and never appear here.

const ICON: Record<string, Icon> = {
  '': House,
  islerim: Tray,
  rezervasyonlar: CalendarCheck,
  kiralamalar: Key,
  takvim: CalendarBlank,
  gorevler: ClipboardText,
  araclar: CarProfile,
  'bakim-servis': Wrench,
  'hasar-ve-olaylar': Bandaids,
  musteriler: Users,
  'kurumsal-hesaplar': Buildings,
  fiyatlandirma: Tag,
  finans: Coins,
  masraflar: Receipt,
  'sube-kasalari': Vault,
  raporlar: FileText,
  'onay-merkezi': SealCheck,
  subeler: MapPin,
  kullanicilar: ShieldCheck,
  'islem-gecmisi': ClockCounterClockwise,
  ayarlar: GearSix,
}

export interface DemoNavItem {
  slug: string
  label: string
  icon: Icon
  perm: string
  group: GroupKey
  tier: 'basic' | 'advanced'
}
export interface DemoNavGroup {
  key: GroupKey
  label: string
  items: DemoNavItem[]
}

const itemOf = (n: (typeof NAV_V1)[number]): DemoNavItem => ({ slug: n.slug, label: L(n.tr, n.en), icon: ICON[n.slug] ?? GearSix, perm: n.perm, group: n.group, tier: n.tier })

/** All 21 links grouped (no profile or permission applied). */
export function demoNav(): DemoNavGroup[] {
  return GROUPS.map((g) => ({ key: g.key, label: L(g.tr, g.en), items: NAV_V1.filter((n) => n.group === g.key).map(itemOf) }))
}

/** The links the sidebar shows: the working profile decides what is shown by default; the permission decides who may see it. */
export function visibleNav(d: Db, can: (perm: string) => boolean): DemoNavGroup[] {
  const shown = new Set(profileLinks(d.settings.workspace, { activeBranches: d.branches.filter((b) => b.active).length }))
  return demoNav()
    .map((g) => ({ ...g, items: g.items.filter((i) => shown.has(i.slug) && can(i.perm)) }))
    .filter((g) => g.items.length > 0)
}

/** Screens the person may open that the profile keeps out of the sidebar (reachable from the user menu: nothing is lost). */
export function otherScreens(d: Db, can: (perm: string) => boolean): DemoNavItem[] {
  const shown = new Set(profileLinks(d.settings.workspace, { activeBranches: d.branches.filter((b) => b.active).length }))
  return demoNav().flatMap((g) => g.items).filter((i) => !shown.has(i.slug) && can(i.perm))
}

/** Nav item for a path segment; an old (legacy) segment resolves to the screen that now holds it. */
export function navItemOf(slug: string): DemoNavItem | undefined {
  const all = demoNav().flatMap((g) => g.items)
  const direct = all.find((i) => i.slug === slug)
  if (direct) return direct
  const leg = legacyOf(slug)
  if (leg?.to) {
    const target = leg.to.split('?')[0]!.replace(/^\//, '').split('/')[0] ?? ''
    return all.find((i) => i.slug === target)
  }
  return undefined
}
