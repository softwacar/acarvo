import { createRequire } from 'node:module'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const b = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })).newPage()
await p.goto('http://localhost:5174/')
await p.waitForLoadState('networkidle')
const peek = () => p.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('acarvo-demo')
  q.onsuccess = () => {
    const tx = q.result.transaction('kv', 'readonly')
    const names = [...q.result.objectStoreNames]
    const st = tx.objectStore(names[0])
    const r = st.getAll()
    r.onsuccess = () => res({ names, n: r.result.length, rentals: r.result[0]?.rentals?.length, mod: r.result[0]?.meta?.modified, schema: r.result[0]?.meta?.schema })
    r.onerror = () => res('err')
  }
}))
console.log('after load', JSON.stringify(await peek()))
await p.getByRole('button', { name: 'Demo', exact: true }).click()
await p.getByRole('menuitem', { name: /Demo senaryoları/ }).click()
await p.getByRole('button', { name: /Hazırla ve aç/ }).nth(4).click()
await p.waitForTimeout(1500)
console.log('after scenario', JSON.stringify(await peek()), 'live', await p.evaluate(() => document.title))
await b.close()
