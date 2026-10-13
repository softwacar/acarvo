import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Pricing and contracts on a phone (390 px): no sideways scrolling, controls reachable, tabs scroll into view.
test.use({ storageState: authFile('adnan') })

test('pricing list and editor, settings templates, quote and contract tabs fit a phone', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/fiyatlandirma')
  await expect(page.getByRole('heading', { name: 'Fiyatlandırma' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.goto('/fiyatlandirma/yeni')
  await page.getByRole('button', { name: 'Sınıf ekle' }).click()
  await page.getByRole('button', { name: 'Sezon ekle' }).click()
  await page.getByRole('button', { name: 'Ek hizmet ekle' }).click()
  await page.getByRole('button', { name: 'İndirim ekle' }).click()
  await expectNoHorizontalOverflow(page)
  // The save bar stays reachable at the bottom of the screen.
  await expect(page.getByRole('button', { name: 'Taslak olarak oluştur' })).toBeInViewport()
  page.once('dialog', (d) => void d.accept())
  await page.goto('/ayarlar')
  await expect(page.getByRole('region', { name: 'Sözleşme şablonları' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000003')
  await page.getByRole('row', { name: /K-000003/ }).getByRole('link').first().click()
  for (const tab of ['Fiyat teklifi', 'Sözleşme']) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    const visible = await page.evaluate(() => {
      const el = document.querySelector('[role=tab][aria-selected=true]')!
      const bar = el.parentElement!.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return r.left >= bar.left - 1 && r.right <= bar.right + 1
    })
    expect(visible, tab).toBe(true)
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
})
