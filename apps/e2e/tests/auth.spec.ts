import { expect, test } from '@playwright/test'
import { login, USERS } from './fixtures'

test('wrong password shows an error and stays on sign-in', async ({ page }) => {
  await page.goto('/giris')
  // An unknown address: the same message as a wrong password (no account enumeration), no lockout of real users.
  await page.getByLabel('E-posta').fill('olmayan.kisi@drina-demo.ba')
  await page.getByLabel('Parola', { exact: true }).fill('kesinlikle-yanlis')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByText('E-posta veya parola hatalı.')).toBeVisible()
  await expect(page).toHaveURL(/\/giris/)
})

test('a protected page asks to sign in and returns there afterwards', async ({ page }) => {
  await page.goto('/araclar')
  await expect(page).toHaveURL(/\/giris\?next=/)
  await page.getByLabel('E-posta').fill(USERS.adnan)
  await page.getByLabel('Parola', { exact: true }).fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page).toHaveURL(/\/araclar$/)
})

test('sign out ends the session; back navigation does not show data', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await login(page, 'adnan')
  await page.goto('/araclar')
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await page.getByRole('button', { name: /Adnan Kovač/ }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()
  await expect(page).toHaveURL(/\/giris/)
  await page.goBack()
  await expect(page).toHaveURL(/\/giris/)
  expect((await page.request.get('/api/vehicles')).status()).toBe(401)
  // Regression: the layout used to render once without a session and crash during sign-out.
  expect(errors.filter((e) => e.includes('useSession'))).toEqual([])
})
