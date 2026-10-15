import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, openVehicle } from './fixtures'

// Maintenance, damage and transfers on a phone (390 px): no sideways scrolling; forms and pickers stay usable.
test.use({ storageState: authFile('adnan') })

test('lists, forms and the vehicle operation tabs fit a phone', async ({ page }) => {
  test.setTimeout(60_000)
  for (const [url, heading] of [
    ['/bakim-servis?view=all', 'Bakım & Servis'],
    ['/hasar-kayitlari?view=all', 'Hasar Kayıtları'],
    ['/araclar/transferler?view=all', 'Araç Transferleri'],
    ['/bakim-servis/yeni', 'Bakım planla'],
    ['/hasar-kayitlari/yeni', 'Hasar bildir'],
    ['/araclar/transferler/yeni', 'Transfer talebi'],
  ] as const) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectNoHorizontalOverflow(page)
  }
  await page.goto('/bakim-servis/yeni')
  await page.getByRole('searchbox', { name: 'Araç ara' }).fill('T48')
  await page.getByRole('list', { name: 'Araçlar' }).getByRole('button', { name: /T48-K-276/ }).click()
  await expect(page.getByText('T48-K-276').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await openVehicle(page, 'T48-K-276')
  await expect(page.getByRole('region', { name: 'Müsaitlik ve engeller' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  for (const tab of ['Bakım ve lastikler', 'Müsaitlik ve planlama', 'Belgeler ve riskler']) {
    await page.getByRole('tab', { name: tab }).click()
    await page.waitForLoadState('networkidle')
    await expectNoHorizontalOverflow(page)
  }
})
