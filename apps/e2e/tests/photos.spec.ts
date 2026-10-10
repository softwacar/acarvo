import { expect, test } from '@playwright/test'
import { fixture, authFile, openVehicle } from './fixtures'

test.use({ storageState: authFile('adnan') })

test('upload, make primary, reorder and remove promotional photos', async ({ page }) => {
  await openVehicle(page, 'E45-M-218')
  await page.locator('input[type="file"]').first().setInputFiles([fixture('foto-mavi.jpg'), fixture('foto-gri.jpg')])
  await expect(page.getByText('· 2/6')).toBeVisible({ timeout: 20_000 })
  // Images are served privately and never cached.
  const src = await page.getByRole('img').filter({ has: page.locator('[src*="/api/files/"]') }).or(page.locator('img[src*="/api/files/"]')).first().getAttribute('src')
  const res = await page.request.get(src!)
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toContain('no-store')
  await page.getByText('Fotoğrafları yönet').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Ana yap' }).click()
  await expect(page.getByText('Ana fotoğraf değiştirildi.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Fotoğraf 2 sola' }).click()
  await expect(dialog.getByRole('button', { name: 'Fotoğraf 1 sola' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Fotoğraf 2 kaldır' }).click()
  await dialog.getByRole('button', { name: 'Kaldır', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Fotoğraf 2 kaldır' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByText('· 1/6')).toBeVisible()
})

test('a file that is not an image is refused and nothing is added', async ({ page }) => {
  await openVehicle(page, 'K71-J-904')
  await page.locator('input[type="file"]').first().setInputFiles(fixture('test-muayene.pdf'))
  await expect(page.getByRole('alert').filter({ hasText: 'okunabilir bir fotoğraf değil' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Fotoğrafları yönet')).toHaveCount(0)
})
