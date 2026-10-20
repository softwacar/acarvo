import { describe, expect, it } from 'vitest'
import { hasPerm } from '../core/helpers'
import { ALWAYS_VISIBLE, DEFERRED, GATED_VIEWS, GROUPS, LEGACY, NAV_V1, profileLinks, type Profile } from '../core/modules'
import { buildSeed } from '../core/seed'
import type { Db } from '../core/types'
import { otherScreens, visibleNav } from '../nav'

// Product structure of the V1 demo (decision document H, I, K): 6 groups, 21 links, three working profiles, the 36 legacy
// links mapped one by one, and a menu that follows the person's permissions without ever losing a screen.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => {
  d.session.userId = id
}
const links = (d: Db) => visibleNav(d, (p) => hasPerm(d, p)).flatMap((g) => g.items.map((i) => i.slug))
const ws = (profile: Profile, hidden: string[] = [], shown: string[] = []) => ({ profile, hidden, shown })

describe('the V1 menu', () => {
  it('has 6 groups and 21 unique links', () => {
    expect(GROUPS.length).toBe(6)
    expect(NAV_V1.length).toBe(21)
    expect(new Set(NAV_V1.map((n) => n.slug)).size).toBe(21)
    for (const n of NAV_V1) expect(GROUPS.some((g) => g.key === n.group)).toBe(true)
  })
  it('keeps Tasks a standalone, basic link that can never be hidden', () => {
    const t = NAV_V1.find((n) => n.slug === 'gorevler')!
    expect(t.tier).toBe('basic')
    expect(t.group).toBe('operations')
    expect(ALWAYS_VISIBLE.has('gorevler')).toBe(true)
    expect(ALWAYS_VISIBLE.has('islerim')).toBe(true)
    for (const p of ['simple', 'standard', 'advanced'] as Profile[]) expect(profileLinks(ws(p, ['gorevler']), { activeBranches: 3 })).toContain('gorevler')
  })
  it('My Work is its own link and does not replace Tasks', () => {
    expect(NAV_V1.map((n) => n.slug)).toEqual(expect.arrayContaining(['islerim', 'gorevler']))
  })
})

describe('working profiles', () => {
  it('Simple shows 16, Standard 20, Advanced 21 links (visibility only)', () => {
    expect(profileLinks(ws('simple'), { activeBranches: 3 }).length).toBe(16)
    expect(profileLinks(ws('standard'), { activeBranches: 3 }).length).toBe(20)
    expect(profileLinks(ws('advanced'), { activeBranches: 3 }).length).toBe(21)
  })
  it('the owner can switch an advanced link on or a basic one off, but never an always-visible one', () => {
    expect(profileLinks(ws('simple', [], ['sube-kasalari']), { activeBranches: 3 })).toContain('sube-kasalari')
    expect(profileLinks(ws('advanced', ['masraflar']), { activeBranches: 3 })).not.toContain('masraflar')
    expect(profileLinks(ws('advanced', ['finans', 'ayarlar']), { activeBranches: 3 })).toEqual(expect.arrayContaining(['finans', 'ayarlar']))
  })
  it('a single-branch company does not need a Branches link in the sidebar', () => {
    expect(profileLinks(ws('advanced'), { activeBranches: 1 })).not.toContain('subeler')
  })
  it('the full-permission owner sees 21 links in the Advanced profile and 16 in Simple', () => {
    const d = mkDb()
    d.settings.workspace = ws('advanced')
    expect(links(d).length).toBe(21)
    d.settings.workspace = ws('simple')
    expect(links(d).length).toBe(16)
  })
  it('a hidden screen is never lost: the user menu lists what the profile keeps out of the sidebar', () => {
    const d = mkDb()
    d.settings.workspace = ws('simple')
    const other = otherScreens(d, (p) => hasPerm(d, p)).map((i) => i.slug)
    expect(other).toEqual(expect.arrayContaining(['sube-kasalari', 'onay-merkezi', 'islem-gecmisi']))
    expect(links(d).length + other.length).toBe(21)
  })
})

describe('the menu follows permissions', () => {
  it('Operations sees about a dozen links, always including Tasks and My Work, never users or settings', () => {
    const d = mkDb()
    as(d, 'u-ops1')
    const l = links(d)
    expect(l).toEqual(expect.arrayContaining(['gorevler', 'islerim', 'rezervasyonlar', 'kiralamalar']))
    expect(l).not.toContain('kullanicilar')
    expect(l).not.toContain('ayarlar')
    expect(l.length).toBeGreaterThanOrEqual(10)
    expect(l.length).toBeLessThanOrEqual(14)
    d.settings.workspace = ws('simple')
    expect(links(d).length).toBe(12)
  })
  it('Accounting sees finance, cash, expenses, reports and approvals, and keeps Tasks; no vehicles, no settings management', () => {
    const d = mkDb()
    as(d, 'u-acc')
    const l = links(d)
    expect(l).toEqual(expect.arrayContaining(['gorevler', 'islerim', 'finans', 'masraflar', 'sube-kasalari', 'raporlar', 'onay-merkezi']))
    expect(l).not.toContain('araclar')
    expect(l).not.toContain('kullanicilar')
    expect(hasPerm(d, 'vehicles:manage')).toBe(false)
    expect(hasPerm(d, 'maintenance:manage')).toBe(false)
    expect(hasPerm(d, 'finance:record')).toBe(true)
  })
  it('hiding a link never grants or removes a permission', () => {
    const d = mkDb()
    as(d, 'u-ops1')
    const before = hasPerm(d, 'finance:record')
    d.settings.workspace = ws('simple')
    expect(hasPerm(d, 'finance:record')).toBe(before)
  })
})

describe('the 36 legacy links', () => {
  it('are all mapped, one entry each', () => {
    expect(LEGACY.length).toBe(36)
    expect(new Set(LEGACY.map((l) => l.slug)).size).toBe(36)
    const kinds = (k: string) => LEGACY.filter((l) => l.kind === k).length
    expect(kinds('same') + kinds('redirect') + kinds('deferred') + kinds('record-screen')).toBe(36)
    expect(kinds('deferred')).toBe(6)
  })
  it('every redirect lands on one of the 21 screens', () => {
    const slugs = new Set(NAV_V1.map((n) => n.slug))
    for (const l of LEGACY.filter((x) => x.kind === 'redirect')) {
      const first = l.to!.split('?')[0]!.replace(/^\//, '').split('/')[0]!
      expect(slugs.has(first), `${l.slug} → ${l.to}`).toBe(true)
    }
    for (const l of LEGACY.filter((x) => x.kind === 'same')) expect(slugs.has(l.slug)).toBe(true)
  })
  it('the named merges are exact', () => {
    const to = (slug: string) => LEGACY.find((l) => l.slug === slug)?.to
    expect(to('komuta-merkezi')).toBe('/islerim')
    expect(to('riskler-ve-istisnalar')).toBe('/islerim?sekme=uyarilar')
    expect(to('kapasite-planlama')).toBe('/takvim?gorunum=kapasite')
    expect(to('filo-analizi')).toBe('/raporlar?rapor=filo')
    expect(to('gelir-kontrolu')).toBe('/finans?sekme=dikkat')
    expect(to('sozlesmeler')).toBe('/kiralamalar?gorunum=sozlesmeler')
    expect(to('roller-ve-yetkiler')).toBe('/kullanicilar?sekme=roller')
    expect(to('hasar-kayitlari')).toBe('/hasar-ve-olaylar')
  })
  it('V2 screens are deferred, not deleted: they stay in the router table and in the preview list', () => {
    expect(DEFERRED.map((l) => l.slug).sort()).toEqual(['arac-tedarikcileri', 'filo-asistani', 'firsatlar', 'kurallar', 'partnerler', 'talep-merkezi'])
    expect(GATED_VIEWS.length).toBeGreaterThanOrEqual(5)
  })
})
