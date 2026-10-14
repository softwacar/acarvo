import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Finance on a phone (390 px): no sideways scrolling; money dialogs show their summary and need an explicit button.
test.use({ storageState: authFile('adnan') })

test('finance centre and the rental finance tab fit a phone; the payment dialog stays usable', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/finans')
  await expect(page.getByRole('heading', { name: 'Finans', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  for (const tab of ['Tahsilatlar', 'Depozitolar', 'Kiralama finans dosyaları']) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000002')
  await page.getByRole('row', { name: /K-000002/ }).getByRole('link').first().click()
  await page.getByRole('tab', { name: 'Finans', exact: true }).click()
  await expect(page.getByRole('tabpanel')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  const record = page.getByRole('button', { name: 'Tahsilat kaydet' })
  if (await record.count()) {
    await record.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Tahsilatı kaydet' })).toBeInViewport()
    await expectNoHorizontalOverflow(page)
    await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  }
})
