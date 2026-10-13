import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of Rentals, handover and return V1 on the test database (synthetic data only).
// Opt-in: SCREENSHOTS=1 npx playwright test rentals-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'k1', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}
async function openRental(page: Page, no: string) {
  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill(no)
  await page.getByRole('row', { name: new RegExp(no) }).getByRole('link').first().click()
  await expect(page.getByRole('tablist', { name: 'Kiralama bölümleri' })).toBeVisible()
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`rental screens at ${w}`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/kiralamalar')
    await expect(page.getByRole('link', { name: 'Emir Primjerović' }).first()).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-liste-${w}`), fullPage: true })
    await page.getByRole('tab', { name: /Geciken/ }).click()
    await expect(page.getByRole('link', { name: 'Tarik Testić' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`02-geciken-${w}`), fullPage: true })

    await page.goto('/kiralamalar/yeni')
    await page.getByRole('button', { name: 'Kiralamayı hazırla' }).click()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`03-yeni-${w}`), fullPage: true })
    page.once('dialog', (d) => void d.accept())

    await openRental(page, 'K-000003')
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`04-360-teslim-bekliyor-${w}`), fullPage: true })
    await page.getByRole('link', { name: 'Teslim masası', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Teslim', exact: true })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`05-teslim-masasi-${w}`), fullPage: true })

    await openRental(page, 'K-000002')
    await settle(page)
    await page.screenshot({ path: out(`06-360-gecikmis-${w}`), fullPage: true })

    await openRental(page, 'K-000001')
    await page.getByRole('link', { name: 'İadeyi al', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'İade', exact: true })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`07-iade-${w}`), fullPage: true })

    await openRental(page, 'K-000005')
    await page.getByRole('link', { name: 'İade kontrolü ve kapanış', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'İade kontrolü ve kapanış' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`08-iade-kontrolu-${w}`), fullPage: true })

    await page.goto('/ayarlar')
    await expect(page.getByRole('region', { name: 'Kiralama çalışma modu' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`14-ayarlar-kiralama-modu-${w}`) })

    await openRental(page, 'K-000004')
    await settle(page)
    await page.screenshot({ path: out(`09-360-kapandi-genel-${w}`), fullPage: true })
    for (const [tab, name] of [
      ['Teslim', '10-360-teslim'],
      ['İade', '11-360-iade'],
      ['Hasar ve fotoğraflar', '12-360-hasar'],
      ['Geçmiş', '13-360-gecmis'],
    ] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`${name}-${w}`), fullPage: true })
    }
  })
}
