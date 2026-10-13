import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of Pricing and contracts V1 on the test database (synthetic data only). Runs after
// pricing-contracts.spec (which creates the lists, quotes, template and contracts it shows).
// Opt-in: SCREENSHOTS=1 npx playwright test pricing-contracts pricing-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'fs1', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}
async function json<T>(page: Page, url: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ url, body }) => {
      const { token } = await (await fetch('/api/auth/csrf')).json()
      const res = await fetch(`/api${url}`, body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) } : {})
      return res.json()
    },
    { url, body },
  )
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`pricing and contract screens at ${w}`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/fiyatlandirma')
    await expect(page.getByRole('link', { name: 'E2E Teklif EUR' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-liste-${w}`), fullPage: true })

    await page.getByRole('link', { name: 'E2E Teklif EUR' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Teklif EUR' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`02-duzenleyici-${w}`), fullPage: true })

    await page.goto('/fiyatlandirma/yeni')
    await page.getByRole('button', { name: 'Taslak olarak oluştur' }).click()
    await settle(page)
    await page.screenshot({ path: out(`03-yeni-dogrulama-${w}`), fullPage: true })
    page.once('dialog', (d) => void d.accept())

    // The reservation and the rental with a quote and contracts from pricing-contracts.spec.
    const rentals = await json<{ items: { id: string }[] }>(page, '/rentals/search', { view: 'all', pageSize: 100 })
    let rentalId: string | null = null
    for (const r of rentals.items) {
      const c = await json<{ items: unknown[] }>(page, `/rentals/${r.id}/contracts`)
      if (c.items.length >= 2) {
        rentalId = r.id
        break
      }
    }
    const reservations = await json<{ items: { id: string }[] }>(page, '/reservations/search', { status: 'all', pageSize: 100 })
    let reservationId: string | null = null
    for (const r of reservations.items) {
      const q = await json<{ items: unknown[] }>(page, `/reservations/${r.id}/quotes`)
      if (q.items.length) {
        reservationId = r.id
        break
      }
    }
    if (reservationId) {
      await page.goto(`/rezervasyonlar/${reservationId}?sekme=fiyat`)
      await expect(page.getByRole('region', { name: 'Geçerli fiyat teklifi' })).toBeVisible()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`04-rezervasyon-teklif-${w}`), fullPage: true })
      await page.getByRole('button', { name: 'Yeniden hesapla' }).click()
      await page.getByRole('button', { name: 'Önizle' }).click()
      await expect(page.getByRole('table', { name: 'Önizleme kalemleri' })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: out(`05-teklif-hesaplama-${w}`), fullPage: true })
    }
    if (rentalId) {
      await page.goto(`/kiralamalar/${rentalId}`)
      await expect(page.getByRole('tablist', { name: 'Kiralama bölümleri' })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: out(`06-kiralama-360-${w}`), fullPage: true })
      await page.getByRole('tab', { name: 'Fiyat teklifi' }).click()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`07-kiralama-teklif-${w}`), fullPage: true })
      await page.getByRole('tab', { name: 'Sözleşme' }).click()
      await expect(page.getByRole('region', { name: /S-\d{6} · sürüm 2/ })).toBeVisible()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`08-sozlesme-${w}`), fullPage: true })
      await page.getByRole('button', { name: 'Arşivle' }).click()
      await settle(page)
      await page.screenshot({ path: out(`09-arsivle-diyalogu-${w}`) })
      await page.keyboard.press('Escape')
    }

    await page.goto('/ayarlar')
    const section = page.getByRole('region', { name: 'Sözleşme şablonları' })
    await expect(section).toBeVisible()
    const draft = section.getByRole('button', { name: 'Yeni taslak sürüm aç' })
    if (await draft.count()) await draft.first().click()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await section.screenshot({ path: out(`10-ayarlar-sablonlar-${w}`) })
  })
}
