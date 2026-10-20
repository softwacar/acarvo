// Visual usability audit (diagnostic only; no baselines). For every route and width it saves a screenshot and measures
// things a person would trip over: page-wide horizontal scroll, controls outside the viewport, tap targets under 24px,
// controls without a name, text cut off by its box (not by an intended ellipsis), tables wider than their container
// that are not in a scroll region.
// usage: node visual-audit.mjs <baseUrl> <outDir> [routeFilterRegex]
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const base = process.argv[2] ?? 'http://localhost:5174'
const out = process.argv[3] ?? './audit'
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null
mkdirSync(out, { recursive: true })
const ROUTES = ['/', '/komuta-merkezi', '/filo-asistani', '/rezervasyonlar', '/kiralamalar', '/takvim', '/gorevler', '/araclar', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu', '/musteriler', '/kurumsal-hesaplar', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma', '/onay-merkezi', '/kurallar', '/gelir-kontrolu', '/riskler-ve-istisnalar', '/kapasite-planlama', '/filo-analizi', '/firsatlar', '/raporlar', '/finans', '/masraflar', '/sube-kasalari', '/sozlesmeler', '/belge-merkezi', '/islem-gecmisi', '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/ayarlar', '/platform', '/partner', '/rezervasyonlar/yeni', '/rezervasyonlar/rsv22', '/kiralamalar/rn37', '/araclar/v1', '/musteriler/c3']
const WIDTHS = [1440, 1024, 768, 390]
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const report = []
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })
  const page = await ctx.newPage()
  for (const route of ROUTES) {
    if (filter && !filter.test(route)) continue
    await page.goto(base + route)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(350)
    const name = (route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')) + '-' + width
    await page.screenshot({ path: `${out}/${name}.png` })
    const m = await page.evaluate(() => {
      const vw = innerWidth
      const res = { overflowX: document.documentElement.scrollWidth - vw, offscreen: [], small: [], unnamed: [], clipped: [], wideTables: [] }
      const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
      const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      for (const e of document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem]')) {
        if (!visible(e)) continue
        const r = e.getBoundingClientRect()
        const inScroll = !!e.closest('[data-scroll-region], .overflow-x-auto, .overflow-auto, nav')
        if (r.right > vw + 1 && !inScroll) res.offscreen.push(label(e) || e.tagName)
        const isInlineLink = e.tagName === 'A' && getComputedStyle(e).display === 'inline'
        if ((r.width < 24 || r.height < 24) && !isInlineLink && e.type !== 'hidden' && !(e.type === 'checkbox' || e.type === 'radio')) res.small.push(`${label(e) || e.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`)
        if (!label(e) && !e.getAttribute('aria-labelledby') && !e.labels?.length && !e.querySelector('img[alt]')) res.unnamed.push(e.tagName + '.' + (e.className || '').toString().slice(0, 40))
      }
      for (const e of document.querySelectorAll('main *')) {
        if (!visible(e) || e.children.length) continue
        const s = getComputedStyle(e)
        if (s.overflow !== 'visible' && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim()) res.clipped.push(e.textContent.trim().slice(0, 50))
      }
      for (const t of document.querySelectorAll('main table')) {
        const p = t.closest('.overflow-x-auto, .overflow-auto, [data-scroll-region]')
        if (!p && t.getBoundingClientRect().right > vw + 1) res.wideTables.push((t.getAttribute('aria-label') || '').slice(0, 40) || 'table')
      }
      for (const k of ['offscreen', 'small', 'unnamed', 'clipped', 'wideTables']) res[k] = [...new Set(res[k])].slice(0, 8)
      return res
    })
    const bad = m.overflowX > 1 || m.offscreen.length || m.small.length || m.unnamed.length || m.clipped.length || m.wideTables.length
    if (bad) report.push({ route, width, ...m })
  }
  await ctx.close()
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1))
console.log(`findings: ${report.length} (route×width with something to look at) -> ${out}/report.json`)
await browser.close()
