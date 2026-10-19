// Dialog exerciser (diagnostic tool). For every route it opens each dialog/sheet that a main-area button opens, then:
//   1. collects the dialog text (for the Turkish-leftover audit in English mode),
//   2. presses the confirm button with the default field values and records the outcome: closed | error:<text> | nothing,
//   3. closes with Escape and reports a dialog that stays open.
// usage: node dialogs.mjs <baseUrl> <outFile> [lang tr|en] [routeFilterRegex]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const base = process.argv[2] ?? 'http://localhost:5174'
const out = process.argv[3] ?? 'dialogs.json'
const lang = process.argv[4] ?? 'tr'
const filter = process.argv[5] ? new RegExp(process.argv[5]) : null
const ROUTES = ['/rezervasyonlar', '/rezervasyonlar/rsv16', '/rezervasyonlar/rsv12', '/kiralamalar/rn37', '/kiralamalar/rn36', '/kiralamalar/rn41', '/gorevler', '/araclar/v1', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu', '/musteriler', '/musteriler/c3', '/kurumsal-hesaplar', '/kurumsal-hesaplar/co1', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma', '/onay-merkezi', '/kurallar', '/riskler-ve-istisnalar', '/finans', '/masraflar', '/sube-kasalari', '/sozlesmeler', '/belge-merkezi', '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/platform', '/partner']
const TR_CHARS = /[çğıİöşüÇĞÖŞÜ]/
const TR_WORDS = /(?<![\p{L}])(ve|için|yok|bir|ile|değil|veya|kadar|olarak|henüz|zaten|yalnız|önce|sonra|Tümü|Hepsi|Durum|Kaydet|Vazgeç|Ekle|Sil|Düzenle|Kapat|Yeni|Müşteri|Araç|Kiralama|Rezervasyon|Gün|Şube|Tutar|Tarih|Gerekçe|Teslim|İade|Bakım|Hasar|Görev|Kasa|Ödeme|Onay|Talep|Belge|Fiyat|Sigorta|Depozito|Masraf)(?![\p{L}])/u
const NAMES = /(Müller|Örnek|Deneme|Fiktiv|Boğaz|Šehović|Hadžić|Kovač|Karić|Babić|Mehić|Matić|Pašić|Begić)/

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })).newPage()
const apiReqs = []
const errors = []
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api')) apiReqs.push(u.pathname) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)))
await page.goto(base + '/')
await page.waitForLoadState('networkidle')
if (lang === 'en') {
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await page.getByRole('menuitem', { name: /Dil:/ }).click()
  await page.waitForTimeout(300)
}

const dialogText = () => page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? (d.innerText || '').replace(/\s+/g, ' ') : null })
const leftovers = (t) => (t ?? '').split(/(?<=[.!?:])\s+|\s{2,}| · /).filter((l) => (TR_CHARS.test(l) || TR_WORDS.test(l)) && !NAMES.test(l))
const results = []
for (const route of ROUTES) {
  if (filter && !filter.test(route)) continue
  await page.goto(base + route)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
  const count = await page.evaluate(() => [...document.querySelectorAll('main button, header button')].filter((e) => e.offsetParent !== null).length)
  const seen = new Set()
  for (let i = 0; i < count; i++) {
    const info = await page.evaluate((idx) => { const els = [...document.querySelectorAll('main button, header button')].filter((e) => e.offsetParent !== null); const e = els[idx]; return e ? { name: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), disabled: e.disabled } : null }, i)
    if (!info || info.disabled || !info.name || seen.has(info.name)) continue
    seen.add(info.name)
    const handle = await page.evaluateHandle((idx) => [...document.querySelectorAll('main button, header button')].filter((e) => e.offsetParent !== null)[idx], i)
    const node = handle.asElement()
    if (!node) continue
    try { await node.click({ timeout: 3000 }) } catch { continue }
    await page.waitForTimeout(250)
    const text = await dialogText()
    if (text === null) {
      // not a dialog: restore the page if the click navigated away or opened a menu
      await page.keyboard.press('Escape').catch(() => {})
      const here = new URL(page.url())
      if (here.pathname + here.search !== route.replace(/^(?!\/)/, '/')) {
        if (!page.url().endsWith(route)) { await page.goto(base + route); await page.waitForLoadState('networkidle'); }
      }
      continue
    }
    const entry = { route, opener: info.name, title: text.slice(0, 80), leftovers: lang === 'en' ? leftovers(text) : [], outcome: '', errorText: '' }
    // confirm with defaults: the dialog's last button that is not a cancel/close
    const buttons = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].map((b, k) => ({ k, t: (b.textContent || '').trim(), dis: b.disabled, type: b.type })))
    const confirm = [...buttons].reverse().find((b) => !b.dis && b.type === 'submit') ?? [...buttons].reverse().find((b) => !b.dis && !/^(Vazgeç|Cancel|Kapat|Close)$/i.test(b.t) && b.t)
    if (confirm) {
      const before = text
      await page.evaluate((k) => document.querySelectorAll('[role=dialog] button')[k].click(), confirm.k)
      await page.waitForTimeout(450)
      const after = await dialogText()
      if (after === null) entry.outcome = 'closed'
      else {
        const alertText = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] [role=alert], [role=dialog] [aria-live], [role=dialog] .text-alert')].map((e) => e.textContent.trim()).filter(Boolean).join(' | '))
        entry.outcome = alertText || after !== before ? 'error' : 'nothing'
        entry.errorText = alertText
        if (lang === 'en') entry.leftovers.push(...leftovers(alertText))
      }
    } else entry.outcome = 'no-confirm-button'
    // close
    for (let t = 0; t < 3; t++) {
      if ((await dialogText()) === null) break
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }
    if ((await dialogText()) !== null) { entry.outcome += ' +STUCK'; await page.goto(base + route); await page.waitForLoadState('networkidle') }
    results.push(entry)
  }
}
writeFileSync(out, JSON.stringify({ lang, results, errors: [...new Set(errors)], apiReqs }, null, 1))
const bad = results.filter((r) => r.outcome === 'nothing' || r.outcome.includes('STUCK') || r.leftovers.length)
console.log(`dialogs exercised: ${results.length}; suspicious: ${bad.length}; errors: ${errors.length}; api: ${apiReqs.length} -> ${out}`)
await browser.close()
