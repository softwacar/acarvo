import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, openVehicle } from './fixtures'

// Review screenshots of Maintenance, Damage and Transfers V1 (synthetic data; runs after operations.spec, which
// creates the records shown). Opt-in: SCREENSHOTS=1 npx playwright test operations.spec ops-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'bht1', `${name}.png`)
async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: out(name), fullPage })
}
async function openFirst(page: Page, list: string) {
  await page.goto(list)
  await page.locator('tbody tr').first().getByRole('link').first().click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`operations screens at ${w}`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/bakim-servis?view=all')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await shot(page, `01-bakim-liste-${w}`)
    await page.goto('/bakim-servis/yeni')
    await page.getByRole('button', { name: 'Planla' }).click()
    await shot(page, `02-bakim-planla-${w}`)
    await openFirst(page, '/bakim-servis?view=all')
    await shot(page, `03-bakim-ayrinti-${w}`)
    await page.goto('/hasar-kayitlari?view=all')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await shot(page, `04-hasar-liste-${w}`)
    await page.goto('/hasar-kayitlari/yeni')
    await page.getByRole('radio', { name: 'Kullanılamaz' }).check()
    await shot(page, `05-hasar-bildir-${w}`)
    await openFirst(page, '/hasar-kayitlari?view=all')
    await shot(page, `06-hasar-ayrinti-${w}`)
    const step = page.getByRole('button', { name: 'Kullanılamaz işaretle' })
    if (await step.count()) {
      await step.click()
      await shot(page, `07-hasar-engel-diyalogu-${w}`, false)
      await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click()
    }
    await page.goto('/araclar/transferler?view=all')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await shot(page, `08-transfer-liste-${w}`)
    await page.goto('/araclar/transferler/yeni')
    await shot(page, `09-transfer-talebi-${w}`)
    await page.getByRole('radio', { name: /Onarım amaçlı taşıma/ }).check()
    await shot(page, `09b-onarim-tasimasi-formu-${w}`)
    await page.goto('/araclar/transferler?view=all')
    await page.getByRole('row', { name: /onarım taşıması/ }).getByRole('link').first().click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot(page, `09c-onarim-tasimasi-ayrinti-${w}`)
    await openFirst(page, '/araclar/transferler?view=all')
    await shot(page, `10-transfer-ayrinti-${w}`)
    await openVehicle(page, 'T48-K-276')
    await shot(page, `11-arac-genel-${w}`)
    await page.getByRole('tab', { name: 'Bakım ve lastikler' }).click()
    await shot(page, `12-arac-bakim-${w}`)
    await page.getByRole('tab', { name: 'Müsaitlik ve planlama' }).click()
    await shot(page, `13-arac-musaitlik-${w}`)
    await openVehicle(page, 'O03-J-874', 'Belgeler ve riskler')
    await shot(page, `14-arac-riskler-${w}`)
    await page.goto('/kiralamalar?view=all')
    await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000004')
    await page.getByRole('row', { name: /K-000004/ }).getByRole('link').first().click()
    await page.getByRole('tab', { name: 'Hasar ve fotoğraflar' }).click()
    await expect(page.getByRole('region', { name: 'Hasar dosyaları' })).toBeVisible()
    await shot(page, `15-kiralama-hasar-${w}`)
  })
}
