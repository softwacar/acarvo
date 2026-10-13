import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authFile } from './fixtures'

// Accessibility (axe, WCAG 2.1 A/AA) of the rental screens. Serious and critical findings fail the test.
test.use({ storageState: authFile('adnan') })

async function audit(page: Page, label: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  for (const v of result.violations) console.log(`[axe] ${label}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), label).toEqual([])
}
async function openRental(page: Page, no: string) {
  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill(no)
  await page.getByRole('row', { name: new RegExp(no) }).getByRole('link').first().click()
  await expect(page.getByRole('tablist', { name: 'Kiralama bölümleri' })).toBeVisible()
}

test('rental list, form, 360° tabs, handover desk, return and dialogs', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/kiralamalar')
  await expect(page.getByRole('row', { name: /K-000002/ })).toBeVisible()
  await audit(page, 'kiralamalar')
  await page.goto('/kiralamalar/yeni')
  await page.getByRole('button', { name: 'Kiralamayı hazırla' }).click()
  await audit(page, 'yeni kiralama')
  page.once('dialog', (d) => void d.accept())
  await openRental(page, 'K-000004')
  for (const tab of ['Genel', 'Müşteri ve sürücüler', 'Araç ve rezervasyon', 'Fiyat teklifi', 'Sözleşme', 'Teslim', 'İade', 'Hasar ve fotoğraflar', 'Geçmiş']) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await audit(page, `kiralama 360 ${tab}`)
  }
  await openRental(page, 'K-000003')
  await audit(page, 'teslim bekleyen 360')
  await page.getByRole('button', { name: 'Diğer işlemler' }).click()
  await page.getByRole('menuitem', { name: 'İade zamanını değiştir' }).click()
  await audit(page, 'uzatma diyalogu')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Teslim masası', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Teslim', exact: true })).toBeVisible()
  await audit(page, 'teslim masasi')
  await openRental(page, 'K-000005')
  await page.getByRole('link', { name: 'İade kontrolü ve kapanış', exact: true }).click()
  await audit(page, 'iade kontrolu')
})
