import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of the dashboard sprint (synthetic data; runs after dashboard.spec and operations.spec, which
// create the records shown). Opt-in: SCREENSHOTS=1 npx playwright test dashboard.spec operations.spec ops-oh-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'oh1', `${name}.png`)
async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: out(name), fullPage })
}
async function apiCall<T = Record<string, unknown>>(page: Page, method: 'GET' | 'POST', p: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, p, body }) => {
      const { token } = await (await fetch('/api/auth/csrf')).json()
      const res = await fetch(`/api${p}`, { method, headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-csrf-token': token }, body: method === 'GET' ? undefined : JSON.stringify(body) })
      if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`)
      return res.json()
    },
    { method, p, body },
  )
}

/** A damage file with a block and a pending release request by adnan (created once per run). */
async function pendingRelease(page: Page) {
  const list = await apiCall<{ items: { id: string; damageNo: string; vehicle: { plate: string } }[] }>(page, 'POST', '/damages/search', { view: 'all', q: 'K14-E-763' })
  const existing = list.items[0]
  if (existing) return existing.id
  const v = (await apiCall<{ items: { id: string; homeBranch: { id: string } }[] }>(page, 'GET', '/vehicles?q=K14-E-763')).items[0]!
  const d = await apiCall<{ id: string; version: number }>(page, 'POST', '/damages', {
    requestId: crypto.randomUUID(),
    vehicleId: v.id,
    branchId: v.homeBranch.id,
    view: 'rear',
    description: 'Arka tampon kırık, park sensörü çalışmıyor',
    damageType: 'other',
    severity: 'severe',
    usability: 'not_usable',
    blockReason: 'Sensör arızası nedeniyle güvenli değil',
  })
  await apiCall(page, 'POST', `/damages/${d.id}/unblock-request`, { version: d.version, requestId: crypto.randomUUID(), reason: 'Tampon ve sensör değiştirildi, test sürüşü yapıldı', usability: 'usable' })
  return d.id
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`dashboard sprint screens at ${w}`, async ({ page, browser }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Bugünün özeti' })).toBeVisible()
    await shot(page, `01-ana-ekran-${w}`)
    await page.getByRole('combobox', { name: 'Şube' }).selectOption({ index: 1 })
    await expect(page).toHaveURL(/sube=/)
    await shot(page, `02-ana-ekran-tek-sube-${w}`)
    await page.goto('/ayarlar/hazirlik')
    await expect(page.getByRole('heading', { name: 'Operasyonel hazırlık', level: 1 })).toBeVisible()
    await shot(page, `03-operasyonel-hazirlik-${w}`)

    const damageId = await pendingRelease(page)
    await page.goto(`/hasar-kayitlari/${damageId}`)
    await expect(page.getByText('Engel kaldırma talebi ikinci onay bekliyor.')).toBeVisible()
    await shot(page, `04-hasar-talep-eden-gorunumu-${w}`)
    const kontrol = await (await browser.newContext({ storageState: authFile('kontrol'), viewport: { width: w, height: h } })).newPage()
    await kontrol.goto(`/hasar-kayitlari/${damageId}`)
    await expect(kontrol.getByRole('button', { name: 'Onayla', exact: true })).toBeVisible()
    await shot(kontrol, `05-hasar-onaylayan-gorunumu-${w}`)
    await kontrol.getByRole('button', { name: 'Onayla', exact: true }).click()
    await expect(kontrol.getByRole('dialog')).toBeVisible()
    await shot(kontrol, `06-hasar-onay-diyalogu-${w}`, false)

    await page.goto('/araclar/transferler/yeni')
    await page.getByRole('radio', { name: /Onarım amaçlı taşıma/ }).check()
    await page.getByRole('button', { name: 'Talep oluştur' }).click()
    await shot(page, `07-onarim-tasimasi-formu-hatalar-${w}`)
    await page.goto('/araclar/transferler?view=all')
    await page.getByRole('row', { name: /onarım taşıması/ }).getByRole('link').first().click()
    await expect(page.getByRole('region', { name: 'Taşıma kanıtı' })).toBeVisible()
    await shot(page, `08-onarim-tasimasi-ayrinti-${w}`)

    const rentals = await apiCall<{ items: { id: string }[] }>(page, 'POST', '/rentals/search', { view: 'all', q: 'M62-A-238' })
    if (rentals.items[0]) {
      await kontrol.goto(`/kiralamalar/${rentals.items[0].id}?sekme=finans`)
      await expect(kontrol.getByRole('region', { name: 'Ödeme sorumlusu düzeltmesi' })).toBeVisible()
      await shot(kontrol, `09-fn5-inceleme-gerekli-${w}`)
    }
    await kontrol.context().close()

    const selma = await (await browser.newContext({ storageState: authFile('selma'), viewport: { width: w, height: h } })).newPage()
    await selma.goto('/')
    await expect(selma.getByRole('heading', { name: 'Ana Ekran', level: 1 })).toBeVisible()
    await shot(selma, `10-ana-ekran-operasyon-${w}`)
    await selma.context().close()
  })
}
