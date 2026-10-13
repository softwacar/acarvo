import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Runs in the "mobile" project (390 × 844, touch).
test.use({ storageState: authFile('adnan') })

test('phone: rental list, 360°, handover desk and return fit the screen; main actions stay large enough', async ({ page }) => {
  await page.goto('/kiralamalar')
  await expect(page.locator('tbody tr').filter({ hasText: 'K-000002' })).toContainText('Gecikmede')
  await expectNoHorizontalOverflow(page)
  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000003')
  await page.locator('tbody tr').filter({ hasText: 'K-000003' }).getByRole('link').first().click()
  await expect(page.getByRole('link', { name: 'Teslim masası', exact: true })).toBeInViewport()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('tab', { name: 'Geçmiş' }).click()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('link', { name: 'Teslim masası', exact: true }).click()
  const deliver = page.getByRole('button', { name: 'Teslimi tamamla' })
  await deliver.scrollIntoViewIfNeeded()
  expect((await deliver.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  const fuel = page.getByRole('radiogroup', { name: /Yakıt seviyesi/ }).getByText('Dolu')
  await fuel.scrollIntoViewIfNeeded()
  expect((await fuel.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  await expectNoHorizontalOverflow(page)
})
