import { expect, test } from '@playwright/test'
import { authFile, login } from './fixtures'

test('switching company shows only that company and its vehicles', async ({ page }) => {
  await login(page, 'adnan')
  await page.goto('/araclar')
  await expect(page.getByText('22 araç').first()).toBeVisible()
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await page.getByRole('button', { name: /Şirket: Drina Rent a Car/ }).click()
  await page.getByRole('menuitem', { name: /Neretva Rent/ }).click()
  await expect(page.getByRole('button', { name: /Şirket: Neretva Rent/ })).toBeVisible()
  await page.goto('/araclar')
  await expect(page.getByText('4 araç').first()).toBeVisible()
  await expect(page.getByText('M21-O-650').first()).toBeVisible()
  await expect(page.getByText('A12-K-345')).toHaveCount(0)
  await page.getByRole('button', { name: /Şirket: Neretva Rent/ }).click()
  await page.getByRole('menuitem', { name: /Drina Rent a Car/ }).click()
  await expect(page.getByRole('button', { name: /Şirket: Drina Rent a Car/ })).toBeVisible()
})

test('a vehicle address of another company opens as not found', async ({ browser }) => {
  const drina = await browser.newContext({ storageState: authFile('adnan') })
  const page = await drina.newPage()
  await page.goto('/araclar?q=A12-K-345')
  const href = await page.locator('tr', { hasText: 'A12-K-345' }).getByRole('link').first().getAttribute('href')
  const neretva = await browser.newContext({ storageState: authFile('lejla') })
  const other = await neretva.newPage()
  await other.goto(href!)
  await expect(other.getByRole('heading', { name: 'Araç bulunamadı' })).toBeVisible()
  await expect(other.getByText('Škoda Octavia')).toHaveCount(0)
  await drina.close()
  await neretva.close()
})
