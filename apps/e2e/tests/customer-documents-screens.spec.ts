import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, fixture } from './fixtures'

// Review screenshots of M2 (customer documents) on the test database with synthetic documents and per-run test keys.
// Opt-in: SCREENSHOTS=1 npx playwright test customer-documents-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'm2', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}
async function openDocuments(page: Page, name: string) {
  await page.goto('/musteriler')
  await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill(name)
  await page.getByRole('link', { name, exact: true }).click()
  await page.getByRole('tab', { name: /^Belgeler/ }).click()
  await expect(page.getByRole('region', { name: 'Belge kayıtları' })).toBeVisible()
}

test('documents tab, detail, upload, reveal at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDocuments(page, 'Ajla Testović')
  await expect(page.getByText('Ülke belge gereksinimlerine göre durum')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('01-belgeler-sekmesi-1440'), fullPage: true })

  await page.getByRole('button', { name: 'Kimlik kartı ayrıntıları' }).click()
  const sheet = page.getByRole('dialog', { name: 'Kimlik kartı' })
  await expect(sheet).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await sheet.getByRole('button', { name: 'Ön yüz yükle' }).click()
  await (await chooser).setFiles(fixture('foto-mavi.jpg'))
  await expect(sheet.getByText('sürüm 1')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('02-belge-ayrinti-1440') })

  await sheet.getByRole('button', { name: 'Numarayı göster' }).click()
  const reveal = page.getByRole('dialog', { name: 'Tam belge numarası' })
  await reveal.getByLabel('Neden').selectOption('document_check')
  await reveal.getByRole('button', { name: 'Numarayı göster' }).click()
  await expect(reveal.getByTestId('revealed-number')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('03-numara-acma-1440') })
  await reveal.getByRole('button', { name: 'Kapat' }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Belge ekle' }).first().click()
  const form = page.getByRole('dialog', { name: 'Belge ekle' })
  await form.getByLabel('Belge türü').selectOption('driving_license')
  await form.getByRole('button', { name: 'Belgeyi kaydet' }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('04-belge-ekle-hatalar-1440') })
})

test('documents tab at 768 and 390', async ({ page }) => {
  for (const [w, h] of [
    [768, 1024],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h })
    await openDocuments(page, 'Lena Beispiel')
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`05-belgeler-sekmesi-${w}`), fullPage: true })
    await page.getByRole('button', { name: 'Pasaport ayrıntıları' }).click()
    await settle(page)
    await page.screenshot({ path: out(`06-belge-ayrinti-${w}`) })
    await page.keyboard.press('Escape')
  }
})

test('settings and branches at 1440 and 390', async ({ page }) => {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/ayarlar')
    await expect(page.getByRole('heading', { name: 'Müşteri belge gereksinimleri' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`07-ayarlar-${w}`), fullPage: true })
    await page.goto('/subeler')
    await settle(page)
    await page.screenshot({ path: out(`08-subeler-${w}`), fullPage: true })
  }
})

test('operations user: may add, may not open files or numbers', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('selma'), viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  await openDocuments(page, 'Lena Beispiel')
  await page.getByRole('button', { name: 'Pasaport ayrıntıları' }).click()
  await settle(page)
  await page.screenshot({ path: out('09-operasyon-ayrinti-1440') })
  await ctx.close()
})
