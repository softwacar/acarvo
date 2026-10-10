import { expect, test } from '@playwright/test'
import { authFile } from './fixtures'

test.use({ storageState: authFile('adnan') })

test('search and filters narrow the list and stay in the address', async ({ page }) => {
  await page.goto('/araclar')
  await page.getByLabel('Araçlarda ara').fill('Škoda')
  await expect(page.getByText('K40-M-526').first()).toBeVisible()
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await expect(page.getByText('E45-M-218')).toHaveCount(0)
  await page.getByLabel('Araçlarda ara').fill('')
  await page.getByLabel('Kullanım durumu').selectOption({ label: 'Hizmet dışı' })
  await expect(page.getByText('J27-K-615').first()).toBeVisible()
  await expect(page.getByText('A12-K-345')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Kullanım durumu')).toHaveValue('out_of_service')
})

async function fillNewVehicle(page: import('@playwright/test').Page, plate: string) {
  await page.goto('/araclar/yeni')
  await page.locator('#plate').fill(plate)
  await page.locator('#make').fill('Toyota')
  await page.locator('#model').fill('Yaris')
  await page.locator('#classId').selectOption({ index: 1 })
  await page.locator('#fuelType').selectOption('petrol')
  await page.locator('#transmission').selectOption('manual')
  const sjj = await page.locator('#homeBranchId option', { hasText: 'Sarajevo Aerodrom' }).getAttribute('value')
  await page.locator('#homeBranchId').selectOption(sjj!)
}

test('creates a vehicle and opens its 360° page', async ({ page }) => {
  await fillNewVehicle(page, 'T99-E-201')
  await page.locator('#initialOdometerKm').fill('1200')
  await page.getByRole('button', { name: 'Aracı kaydet' }).click()
  await expect(page.getByRole('tablist', { name: 'Araç bölümleri' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Toyota Yaris' })).toBeVisible()
  await expect(page.getByText('1.200 km').first()).toBeVisible()
})

test('a duplicate plate is refused with a clear message', async ({ page }) => {
  await fillNewVehicle(page, 'a12 k 345')
  await page.getByRole('button', { name: 'Aracı kaydet' }).click()
  await expect(page.getByText('Bu plaka zaten kayıtlı').first()).toBeVisible()
})

test('edit, then a stale second tab gets the version conflict dialog', async ({ page, context }) => {
  await page.goto('/araclar?q=M33-T-120')
  await page.getByRole('link', { name: 'M33-T-120 aracını düzenle' }).click()
  await expect(page.getByLabel('Renk')).toBeVisible()
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(other.getByLabel('Renk')).toBeVisible()
  await other.getByLabel('Renk').fill('Koyu turuncu')
  await other.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(other).not.toHaveURL(/duzenle/)
  await page.getByLabel('Renk').fill('Açık turuncu')
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bu araç başka biri tarafından güncellendi' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Koyu turuncu')).toBeVisible()
})
