import { expect, test } from '@playwright/test'
import { authFile, openVehicle } from './fixtures'

test.use({ storageState: authFile('adnan') })

test('a failing history request says so and can be retried (not "no records")', async ({ page }) => {
  let fail = true
  await page.route('**/api/vehicles/*/history', (route) =>
    fail ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Sunucu hatası.' } }) }) : route.continue(),
  )
  await openVehicle(page, 'J58-O-142')
  await expect(page.getByText('Son kayıtlar yüklenemedi.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: /Konum ve geçmiş/ }).click()
  await expect(page.getByText(/Kilometre ve konum geçmişi yüklenemedi/)).toBeVisible()
  await expect(page.getByText('Kilometre kaydı yok')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Tekrar dene' }).click()
  await expect(page.getByRole('heading', { name: 'Kilometre geçmişi' })).toBeVisible()
})

test('closing a side panel with unsaved input asks first', async ({ page }) => {
  await openVehicle(page, 'J58-O-142', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  await form.locator('#km').fill('10100')
  await page.keyboard.press('Escape')
  const ask = form.getByRole('alertdialog', { name: 'Kaydedilmemiş değişiklikler' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Devam et' }).click()
  await expect(form.locator('#km')).toHaveValue('10100')
  await form.getByRole('button', { name: 'Kapat' }).click()
  await ask.getByRole('button', { name: 'Kaydetmeden kapat' }).click()
  await expect(form).toHaveCount(0)
  // An untouched panel closes at once.
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Kilometre gir' })).toHaveCount(0)
})
