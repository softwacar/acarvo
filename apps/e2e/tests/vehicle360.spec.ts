import { expect, test } from '@playwright/test'
import { authFile, openVehicle } from './fixtures'

test.use({ storageState: authFile('adnan') })

test('tabs live in the address and unknown vehicles are handled', async ({ page }) => {
  await openVehicle(page, 'A12-K-345')
  await expect(page.getByRole('tab', { name: 'Genel bakış' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Belgeler ve riskler' }).click()
  await expect(page).toHaveURL(/sekme=belgeler/)
  await expect(page.getByRole('heading', { name: 'Belgeler ve süreler' })).toBeVisible()
  await page.getByRole('tab', { name: /Konum ve geçmiş/ }).click()
  await expect(page.getByRole('heading', { name: 'Kilometre geçmişi' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: /Konum ve geçmiş/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Bakım ve lastikler' }).click()
  await expect(page.getByText('henüz bağlı değil').first()).toBeVisible()
  await page.goto('/araclar/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('heading', { name: 'Araç bulunamadı' })).toBeVisible()
  await page.goto('/araclar/not-a-uuid')
  await expect(page.getByRole('heading', { name: 'Araç bulunamadı' })).toBeVisible()
})
