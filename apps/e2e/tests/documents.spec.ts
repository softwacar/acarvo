import { expect, test } from '@playwright/test'
import { authFile, fixture, openVehicle } from './fixtures'

test.use({ storageState: authFile('adnan') })

/** Calendar date in Sarajevo, n days from today (documents use company-local dates). */
function sarajevoDate(days: number) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sarajevo' }).format(new Date())
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

test('add a document with a file, view and download it, then renew without a gap', async ({ page }) => {
  await openVehicle(page, 'T09-A-781', 'Belgeler ve riskler')
  await page.getByRole('button', { name: 'Belge ekle' }).click()
  const form = page.getByRole('dialog', { name: 'Belge ekle' })
  await form.locator('#typeCode').selectOption('inspection')
  await form.locator('#documentNumber').fill('E2E-MU-1')
  await form.locator('#validFrom').fill(sarajevoDate(-355))
  await form.locator('#validUntil').fill(sarajevoDate(10))
  await form.locator('#docFile').setInputFiles(fixture('test-muayene.pdf'))
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()

  const drawer = page.getByRole('dialog', { name: 'Muayene' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Yaklaşıyor · 10 gün')).toBeVisible()
  await expect(drawer.getByText('test-muayene.pdf')).toBeVisible({ timeout: 15_000 })

  // View: private, inline, sandboxed; download: attachment with a server-made name.
  const viewUrl = await drawer.getByRole('link', { name: 'Aç' }).getAttribute('href')
  const view = await page.request.get(viewUrl!)
  expect(view.status()).toBe(200)
  expect(view.headers()['content-type']).toBe('application/pdf')
  expect(view.headers()['content-disposition']).toMatch(/^inline;/)
  expect(view.headers()['content-security-policy']).toContain('sandbox')
  expect(view.headers()['cache-control']).toContain('no-store')
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('link', { name: 'İndir' }).click()])
  expect(download.suggestedFilename()).toMatch(/^T09-A-781_muayene_\d{4}-\d{2}-\d{2}_v1\.pdf$/)

  // Renew: the new period starts the day after the old one ends.
  await drawer.getByRole('button', { name: 'Yenile' }).click()
  const renew = page.getByRole('dialog', { name: 'Belgeyi yenile' })
  await expect(renew.locator('#validFrom')).toHaveValue(sarajevoDate(11))
  await renew.locator('#documentNumber').fill('E2E-MU-2')
  await renew.locator('#validUntil').fill(sarajevoDate(376))
  await renew.locator('#docFile').setInputFiles(fixture('test-muayene-yeni.pdf'))
  await renew.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Muayene' })).toBeVisible()
  await page.keyboard.press('Escape')
  const row = page.locator('tr', { hasText: 'Muayene' })
  await expect(row.getByText('Yenileme hazır')).toBeVisible()
  await expect(row.getByText(/Kesinti yok/)).toBeVisible()
})

test('an unknown document file address gives no access', async ({ page }) => {
  const res = await page.request.get('/api/document-files/00000000-0000-4000-8000-000000000000')
  expect(res.status()).toBe(404)
})
