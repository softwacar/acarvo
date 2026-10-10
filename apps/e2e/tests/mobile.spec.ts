import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, fixture, openVehicle } from './fixtures'

// Runs in the "mobile" project (390 × 844, touch).
test.use({ storageState: authFile('adnan') })

test('phone: list, 360° tabs, forms and side panels are usable without sideways scrolling', async ({ page }) => {
  await page.goto('/araclar')
  await expect(page.getByText('A12-K-345').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await openVehicle(page, 'O58-E-467')
  await expectNoHorizontalOverflow(page)
  await page.getByRole('tab', { name: /Konum ve geçmiş/ }).click()
  // The selected tab is scrolled into view in the horizontal tab bar.
  const visible = await page.evaluate(() => {
    const el = document.querySelector('[role=tab][aria-selected=true]')!
    const bar = el.parentElement!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.left >= bar.left - 1 && r.right <= bar.right + 1
  })
  expect(visible).toBe(true)
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  await expect(form).toBeVisible()
  const box = await form.boundingBox()
  expect(Math.round(box!.width)).toBe(390)
  await expect(form.getByRole('button', { name: 'Kaydet' })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)
  await page.getByRole('tab', { name: 'Belgeler ve riskler' }).click()
  await expect(page.getByRole('button', { name: 'Belge ekle' })).toBeVisible()
  await page.getByRole('button', { name: 'Belge ekle' }).click()
  const docForm = page.getByRole('dialog', { name: 'Belge ekle' })
  await expect(docForm).toBeVisible()
  await docForm.getByRole('button', { name: 'Kapat' }).click()
  await expect(docForm).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('phone: an image document is previewed, opened and downloaded; the preview is not recorded as a view', async ({ page }) => {
  await openVehicle(page, 'M33-T-120', 'Belgeler ve riskler')
  await page.getByRole('button', { name: 'Belge ekle' }).click()
  const form = page.getByRole('dialog', { name: 'Belge ekle' })
  await form.locator('#typeCode').selectOption('registration')
  await form.locator('#docFile').setInputFiles(fixture('foto-mavi.jpg'))
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Ruhsat' })
  await expect(drawer).toBeVisible()
  // Automatic preview in the panel (its own grant purpose).
  const preview = drawer.getByRole('img', { name: /Belge görseli/ })
  await expect(preview).toBeVisible({ timeout: 15_000 })
  expect(await preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await expectNoHorizontalOverflow(page)
  const [tab] = await Promise.all([page.waitForEvent('popup'), drawer.getByRole('button', { name: 'Aç', exact: true }).click()])
  const served = await tab.waitForResponse((r) => r.url().includes('/api/document-files/'))
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toBe('image/jpeg')
  await tab.close()
  const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'İndir' }).click()])
  expect(download.suggestedFilename()).toMatch(/^M33-T-120_ruhsat_.*_v1\.jpg$/)
  const vehicleId = page.url().split('?')[0]!.split('/').pop()!
  const actions = ((await (await page.request.get(`/api/vehicles/${vehicleId}/activity`)).json()).items as { action: string }[]).map((a) => a.action)
  expect(actions.filter((a) => a === 'vehicle.document.preview_request').length).toBeGreaterThanOrEqual(1)
  expect(actions.filter((a) => a === 'vehicle.document.view_request')).toHaveLength(1)
  expect(actions.filter((a) => a === 'vehicle.document.download_request')).toHaveLength(1)
})

test('phone: customer list, file, tabs and form fit the screen', async ({ page }) => {
  await page.goto('/musteriler')
  await expect(page.getByRole('link', { name: 'Ajla Testović' })).toBeVisible()
  // Number and phone sit under the name; nothing scrolls sideways.
  await expect(page.locator('tbody tr').first()).toContainText('M-0000')
  await expectNoHorizontalOverflow(page)
  await page.getByRole('link', { name: 'Ajla Testović' }).click()
  await expect(page.getByRole('heading', { name: 'Ajla Testović' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  const call = page.getByRole('link', { name: '+387 61 000 101' })
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(36)
  await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
  const visible = await page.evaluate(() => {
    const el = document.querySelector('[role=tab][aria-selected=true]')!
    const bar = el.parentElement!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.left >= bar.left - 1 && r.right <= bar.right + 1
  })
  expect(visible).toBe(true)
  await page.getByRole('button', { name: 'Düzenle' }).first().click()
  const form = page.getByRole('dialog', { name: 'Müşteriyi düzenle' })
  expect(Math.round((await form.boundingBox())!.width)).toBe(390)
  await expect(form.getByRole('button', { name: 'Değişiklikleri kaydet' })).toBeInViewport()
  await expectNoHorizontalOverflow(page)
})

test('phone: the fixed save bar of the customer panel never covers the last fields', async ({ page }) => {
  await page.goto('/musteriler')
  await page.getByRole('link', { name: 'Ajla Testović' }).click()
  await page.getByRole('button', { name: 'Düzenle' }).first().click()
  const form = page.getByRole('dialog', { name: 'Müşteriyi düzenle' })
  const save = form.getByRole('button', { name: 'Değişiklikleri kaydet' })
  // Scroll the panel body to its end, then compare the last field and closing note with the save bar.
  await form.locator('#operationalNote').scrollIntoViewIfNeeded()
  await form.locator('#customer-form').evaluate((el) => el.parentElement!.scrollTo({ top: el.parentElement!.scrollHeight }))
  const bar = (await save.locator('..').boundingBox())!
  for (const last of [form.locator('#operationalNote'), form.getByText('Kimlik, pasaport ve ehliyet numaraları bu formda istenmez', { exact: false })]) {
    const box = (await last.boundingBox())!
    expect(box.y + box.height, 'last fields stay above the save bar').toBeLessThanOrEqual(bar.y + 1)
    await expect(last).toBeInViewport()
  }
  await form.locator('#operationalNote').fill('Teslimde önceden aranmak istiyor')
  await expect(form.locator('#operationalNote')).toBeInViewport()
  await expect(save).toBeInViewport()
})
