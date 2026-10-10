import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, openVehicle, sarajevoWallTime } from './fixtures'

// Review screenshots of the night sprint changes, on the test database. Opt-in: SCREENSHOTS=1 npx playwright test screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test('vehicle list: document warnings, filters, phone table', async ({ page }) => {
  await page.goto('/araclar')
  await expect(page.getByText('Ruhsat eksik').first()).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('01-liste-belge-uyarilari-1440') })
  await page.getByLabel('Belgeler').selectOption('critical')
  await page.getByLabel('Güncel konum').selectOption('away')
  await expect(page.getByText('K40-M-526').first()).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('02-liste-filtreler-1440') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/araclar')
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('03-liste-telefon-390') })
})

test('odometer form in company time from an Istanbul computer', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('adnan'), timezoneId: 'Europe/Istanbul', viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  await openVehicle(page, 'A39-T-657', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  await form.locator('#km').fill('88900')
  await form.locator('#occurredAt').fill(sarajevoWallTime(-26 * 3_600_000))
  await settle(page)
  await page.screenshot({ path: out('04-km-formu-saat-dilimi-1440') })
  await page.keyboard.press('Escape')
  await expect(form.getByRole('alertdialog')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('05-kaydedilmemis-degisiklik-sorusu-1440') })
  await ctx.close()
})

test('history load error and location form on a phone', async ({ page }) => {
  await page.route('**/api/vehicles/*/history', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Sunucu hatası.' } }) }))
  await openVehicle(page, 'A39-T-657', 'Konum ve geçmiş')
  await expect(page.getByText(/geçmişi yüklenemedi/)).toBeVisible({ timeout: 15_000 })
  await settle(page)
  await page.screenshot({ path: out('06-gecmis-yuklenemedi-1440') })
  await page.unroute('**/api/vehicles/*/history')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Tekrar dene' }).click()
  await page.getByRole('button', { name: 'Konumu güncelle' }).click()
  await expect(page.getByRole('dialog', { name: 'Konumu güncelle' })).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('07-konum-formu-telefon-390') })
})

test('daylight saving: never-happened time and doubled-time choice', async ({ page }) => {
  await openVehicle(page, 'A05-J-418', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  await form.locator('#km').fill('20000')
  await form.locator('#occurredAt').fill('2025-03-30T02:30')
  await settle(page)
  await page.screenshot({ path: out('08-yasanmayan-saat-1440') })
  await form.locator('#occurredAt').fill('2025-10-26T02:30')
  await settle(page)
  await page.screenshot({ path: out('09-iki-kez-yasanan-saat-secimi-1440') })
})
