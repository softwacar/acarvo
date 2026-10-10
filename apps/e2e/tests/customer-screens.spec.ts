import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of Müşteriler M1 on the test database (synthetic customers only).
// Opt-in: SCREENSHOTS=1 npx playwright test customer-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'musteriler', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`customer screens at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/musteriler')
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-liste-${width}`), fullPage: true })

    await page.getByRole('link', { name: 'Ajla Testović' }).click()
    await expect(page.getByRole('heading', { name: 'Ajla Testović' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`02-musteri-360-${width}`), fullPage: true })

    await page.getByRole('button', { name: 'Düzenle' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Müşteriyi düzenle' })
    await expect(sheet).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`03-duzenle-${width}`) })
    await page.keyboard.press('Escape')

    await page.getByRole('main').getByRole('link', { name: 'Müşteriler' }).click()
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.locator('#givenName').fill('Ajla')
    await form.locator('#familyName').fill('Yeni')
    await form.locator('#phone').fill('061 000 101')
    await expect(form.getByRole('region', { name: 'Benzer müşteri kayıtları' })).toBeVisible()
    await form.getByRole('region', { name: 'Benzer müşteri kayıtları' }).scrollIntoViewIfNeeded()
    await settle(page)
    await page.screenshot({ path: out(`04-yeni-musteri-benzer-kayit-${width}`) })
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await settle(page)
    await page.screenshot({ path: out(`05-yeni-musteri-hatalar-${width}`) })
  })
}

test('list at 1280 with a long branch name (display-only change in the browser)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/api/customers/search', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.items[0].createdBranch.name = 'Sarajevo Međunarodni Aerodrom Dolasci Terminal B'
    await route.fulfill({ response: res, json: body })
  })
  await page.goto('/musteriler')
  await expect(page.getByRole('link', { name: 'Ajla Testović' })).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('10-liste-uzun-sube-adi-1280') })
})

test('customer 360 history, pending tab and archived state', async ({ page }) => {
  await page.goto('/musteriler')
  await page.getByLabel('Durum').selectOption('archived')
  await page.getByRole('link', { name: 'Haris Arhivić' }).click()
  await expect(page.getByText('Arşivdeki kayıt düzenlenemez')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('06-arsivdeki-musteri-1440'), fullPage: true })
  await page.getByRole('tab', { name: /Belgeler/ }).click()
  await settle(page)
  await page.screenshot({ path: out('07-belgeler-bekliyor-1440'), fullPage: true })
  await page.getByRole('button', { name: 'Arşivden çıkar' }).first().click()
  await expect(page.getByText('Etkin müşteri')).toBeVisible()
  await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
  await expect(page.getByText('Müşteri arşivden çıkarıldı')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('08-kayit-gecmisi-1440'), fullPage: true })
  await page.getByRole('button', { name: 'Diğer işlemler' }).click()
  await page.getByRole('menuitem', { name: 'Müşteriyi arşivle' }).click()
  await expect(page.getByRole('dialog', { name: 'Müşteriyi arşivle' })).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('09-arsivle-1440') })
})
