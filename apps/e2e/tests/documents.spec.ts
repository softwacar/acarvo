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

  // View: an explicit request opens the PDF in a new tab (private, inline, sandboxed); reloading it adds no audit entry.
  const [tab] = await Promise.all([page.waitForEvent('popup'), drawer.getByRole('button', { name: 'Aç', exact: true }).click()])
  const served = await tab.waitForResponse((r) => r.url().includes('/api/document-files/') && r.request().method() === 'GET')
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toBe('application/pdf')
  expect(served.headers()['content-disposition']).toMatch(/^inline;/)
  expect(served.headers()['content-security-policy']).toContain('sandbox')
  expect(served.headers()['cache-control']).toContain('no-store')
  expect(served.url()).not.toMatch(/token|grant|key=/i)
  await tab.reload()
  await tab.close()
  // Download: attachment with a server-made name.
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'İndir' }).click()])
  expect(download.suggestedFilename()).toMatch(/^T09-A-781_muayene_\d{4}-\d{2}-\d{2}_v1\.pdf$/)
  const vehicleId = page.url().split('?')[0]!.split('/').pop()!
  const activity = (await (await page.request.get(`/api/vehicles/${vehicleId}/activity`)).json()).items as { action: string }[]
  expect(activity.filter((a) => a.action === 'vehicle.document.view_request')).toHaveLength(1)
  expect(activity.filter((a) => a.action === 'vehicle.document.download_request')).toHaveLength(1)
  expect(activity.some((a) => a.action === 'vehicle.document.view' || a.action === 'vehicle.document.download')).toBe(false)

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

test('a link to a document from another site neither opens it nor writes an audit entry', async ({ page, context }) => {
  await openVehicle(page, 'T09-A-781', 'Belgeler ve riskler')
  await page.locator('tr', { hasText: 'Muayene' }).click()
  const drawer = page.getByRole('dialog', { name: 'Muayene' })
  // The user really opens it once (grant for this session).
  const [tab] = await Promise.all([page.waitForEvent('popup'), drawer.getByRole('button', { name: 'Aç', exact: true }).click()])
  const served = await tab.waitForResponse((r) => r.url().includes('/api/document-files/'))
  const fileUrl = served.url()
  await tab.close()
  const vehicleId = page.url().split('?')[0]!.split('/').pop()!
  const count = async () => ((await (await page.request.get(`/api/vehicles/${vehicleId}/activity`)).json()).items as { action: string }[]).filter((a) => a.action.startsWith('vehicle.document.')).length
  const before = await count()
  // Another site links to the file while the user's session and grant are still active.
  await context.route('https://kotu-site.example/**', (r) => r.fulfill({ contentType: 'text/html', body: `<a id="l" href="${fileUrl}">Belgeye bak</a>` }))
  const evil = await context.newPage()
  await evil.goto('https://kotu-site.example/')
  const [resp] = await Promise.all([evil.waitForResponse((r) => r.url() === fileUrl), evil.locator('#l').click()])
  expect(resp.status()).toBe(403)
  expect(await resp.text()).toContain('CROSS_SITE_REQUEST')
  await evil.close()
  expect(await count()).toBe(before)
})
