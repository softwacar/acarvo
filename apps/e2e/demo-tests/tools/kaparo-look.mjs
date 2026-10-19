// Diagnostic: opens the advance story reservation, its Kaparo tab and the Finance advance tab; screenshots into the given folder.
// usage: node kaparo-look.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const base = process.argv[2] ?? 'http://localhost:5174'
const out = process.argv[3] ?? './shots'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })).newPage()
await page.goto(base + '/rezervasyonlar?q=Selma')
await page.waitForLoadState('networkidle')
await page.getByText('Selma Hodžić-Demo').first().click()
await page.waitForLoadState('networkidle')
console.log('url', page.url())
await page.getByRole('tab', { name: /Kaparo/ }).click().catch(async () => page.getByText('Kaparo', { exact: false }).first().click())
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/reservation-kaparo-tr.png` })
console.log((await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900))
await page.goto(base + '/finans?sekme=kaparo')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: `${out}/finance-kaparo-tr.png` })
console.log((await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900))
await browser.close()
