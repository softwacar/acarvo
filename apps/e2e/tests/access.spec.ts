import { expect, test } from '@playwright/test'
import { authFile, openVehicle } from './fixtures'

// Selma: Operasyon in Drina, limited to Sarajevo Aerodrom (SJJ). No vehicle create/edit, no history corrections.
test.use({ storageState: authFile('selma') })

test('a branch-limited user sees only her branch and cannot open other vehicles by address', async ({ page, browser }) => {
  await page.goto('/araclar')
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await expect(page.getByText('K71-J-904')).toHaveCount(0)
  const owner = await browser.newContext({ storageState: authFile('adnan') })
  const ownerPage = await owner.newPage()
  await ownerPage.goto('/araclar?q=K71-J-904')
  const href = await ownerPage.locator('tr', { hasText: 'K71-J-904' }).getByRole('link').first().getAttribute('href')
  await owner.close()
  await page.goto(href!)
  await expect(page.getByRole('heading', { name: 'Araç bulunamadı' })).toBeVisible()
  const id = href!.split('/').pop()
  expect((await page.request.get(`/api/vehicles/${id}/history`)).status()).toBe(404)
  expect((await page.request.get(`/api/vehicles/${id}/documents`)).status()).toBe(404)
})

test('without permission, create and correction are not offered; branch choice is limited', async ({ page }) => {
  await page.goto('/araclar/yeni')
  await expect(page.getByText('Araç ekleme yetkiniz yok.')).toBeVisible()
  await openVehicle(page, 'A12-K-345', 'Konum ve geçmiş')
  await expect(page.getByRole('button', { name: 'Kilometre gir' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kilometre kaydı işlemleri' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Konumu güncelle' }).click()
  const form = page.getByRole('dialog', { name: 'Konumu güncelle' })
  const options = await form.locator('#branchId option').allInnerTexts()
  expect(options).toEqual(['Seçin', 'Sarajevo Aerodrom (SJJ)'])
  await expect(form.getByText('Yalnız yetkili olduğunuz şubeler listelenir.')).toBeVisible()
})
