// Interaction crawler for the demo (diagnostic tool, not a pass/fail test).
// For every route it clicks each visible, enabled button in the main area and records what happened:
// navigation, a dialog/sheet/menu opening, a visible content change, or NOTHING (an inert button).
// Dialogs are then closed with Escape; a dialog that does not close is reported. Runtime errors and API requests are reported.
// usage: node crawl.mjs <baseUrl> <outFile> [lang tr|en] [routeFilterRegex]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const base = process.argv[2] ?? 'http://localhost:5183'
const out = process.argv[3] ?? 'crawl.json'
const lang = process.argv[4] ?? 'tr'
const filter = process.argv[5] ? new RegExp(process.argv[5]) : null

const ROUTES = ['/', '/komuta-merkezi', '/filo-asistani', '/rezervasyonlar', '/rezervasyonlar/yeni', '/rezervasyonlar/rsv16', '/kiralamalar', '/kiralamalar/yeni', '/kiralamalar/rn37', '/kiralamalar/rn36', '/kiralamalar/rn41', '/takvim', '/gorevler', '/araclar', '/araclar/yeni', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu', '/musteriler', '/musteriler/c3', '/kurumsal-hesaplar', '/kurumsal-hesaplar/co1', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma', '/onay-merkezi', '/kurallar', '/gelir-kontrolu', '/riskler-ve-istisnalar', '/kapasite-planlama', '/filo-analizi', '/firsatlar', '/raporlar', '/finans', '/masraflar', '/sube-kasalari', '/sozlesmeler', '/belge-merkezi', '/islem-gecmisi', '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/ayarlar', '/platform', '/partner']

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })
const page = await ctx.newPage()
const apiReqs = []
const errors = []
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api')) apiReqs.push(u.pathname) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)))

const snap = () => page.evaluate(() => {
  const main = document.querySelector('main') ?? document.body
  const dlg = document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]').length
  const toast = document.querySelector('[role=status],[data-sonner-toast],.toast')?.textContent ?? ''
  return { url: location.pathname + location.search, text: (main.innerText || '').replace(/\d{2}:\d{2}/g, '').slice(0, 6000), dlg, toast }
})

if (lang === 'en') {
  await page.goto(base + '/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await page.getByRole('menuitem', { name: /Dil:/ }).click()
}

const findings = []
for (const route of ROUTES) {
  if (filter && !filter.test(route)) continue
  await page.goto(base + route)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
  const names = await page.evaluate(() => {
    const els = [...document.querySelectorAll('main button, main [role=tab], main a[href]')]
    return els.filter((e) => e.offsetParent !== null).map((e, i) => ({ i, tag: e.tagName, name: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true', title: e.getAttribute('title') || '', href: e.getAttribute('href') || '', active: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') === 'true' || e.getAttribute('aria-current') === 'page' || e.getAttribute('aria-pressed') === 'true' }))
  })
  console.log(route, 'candidates:', names.length)
  const seen = new Set()
  for (const n of names) {
    const key = `${n.tag}|${n.name}`
    if (seen.has(key) || n.name === '') continue
    seen.add(key)
    if (n.disabled) { findings.push({ route, name: n.name, kind: 'disabled', title: n.title }); continue }
    if (n.tag === 'A' && n.href && !n.href.startsWith('#')) continue // plain links are checked by the route sweep
    if (/^(Sıfırla|Reset)$/.test(n.name) || n.active) continue
    const before = await snap()
    const handle = await page.evaluateHandle(({ idx }) => { const els = [...document.querySelectorAll('main button, main [role=tab], main a[href]')].filter((e) => e.offsetParent !== null); return els[idx] }, { idx: n.i })
    const node = handle.asElement()
    if (!node) continue
    let downloaded = false
    const onDl = () => { downloaded = true }
    page.once('download', onDl)
    try { await node.click({ timeout: 4000 }) } catch (e) { findings.push({ route, name: n.name, kind: 'click-failed', detail: String(e).slice(0, 120) }); continue }
    await page.waitForTimeout(220)
    const after = await snap()
    const changed = downloaded || before.url !== after.url || before.dlg !== after.dlg || before.text !== after.text || before.toast !== after.toast
    if (!changed) findings.push({ route, name: n.name, kind: 'inert' })
    if (after.dlg > 0 || (after.dlg === 0 && before.dlg > 0)) {
      // dialog opened: Escape must close it
      if (after.dlg > before.dlg) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        const closed = await snap()
        if (closed.dlg > before.dlg) { findings.push({ route, name: n.name, kind: 'escape-does-not-close' }); await page.goto(base + route); await page.waitForLoadState('networkidle') }
      }
    }
    if (after.url !== before.url) { await page.goto(base + route); await page.waitForLoadState('networkidle') }
  }
}
writeFileSync(out, JSON.stringify({ lang, findings, errors: [...new Set(errors)], apiReqs }, null, 1))
console.log(`done: ${findings.length} findings, ${errors.length} errors, ${apiReqs.length} api requests -> ${out}`)
await browser.close()
