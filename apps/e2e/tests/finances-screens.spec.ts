import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of Finance V1 (synthetic data; runs after finance.spec, which creates the records shown).
// Opt-in: SCREENSHOTS=1 npx playwright test finance.spec finances-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'fin1', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`finance screens at ${w}`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/finans')
    await expect(page.getByRole('region', { name: 'EUR' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-genel-${w}`), fullPage: true })
    for (const [tab, name] of [
      ['Bekleyen doğrulamalar', '02-bekleyen'],
      ['Tahsilatlar', '03-tahsilatlar'],
      ['Depozitolar', '04-depozitolar'],
      ['Depozito iadeleri', '05-iadeler'],
      ['Kiralama finans dosyaları', '06-dosyalar'],
      ['İşlem geçmişi', '07-gecmis'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('tabpanel')).toBeVisible()
      await page.waitForLoadState('networkidle')
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`${name}-${w}`), fullPage: true })
    }
    await page.goto('/kiralamalar?view=all')
    await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000002')
    await page.getByRole('row', { name: /K-000002/ }).getByRole('link').first().click()
    await page.getByRole('tab', { name: 'Finans', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Finans özeti' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`08-kiralama-finans-${w}`), fullPage: true })
    await page.getByRole('button', { name: 'Tahsilat kaydet' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: /^Nakit/ }).check()
    await settle(page)
    await page.screenshot({ path: out(`09-tahsilat-diyalogu-${w}`) })
    await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click()
    const detail = await page.evaluate(async () => (await (await fetch(location.pathname.replace('/kiralamalar/', '/api/rentals/'))).json()).customer.id as string)
    await page.goto(`/musteriler/${detail}?sekme=cari`)
    await expect(page.getByRole('link', { name: 'K-000002' }).first()).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`10-musteri-cari-${w}`), fullPage: true })
  })
}
