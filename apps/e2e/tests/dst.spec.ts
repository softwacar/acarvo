import { expect, test } from '@playwright/test'
import { authFile, openVehicle } from './fixtures'

// Daylight saving changes in the company zone (Europe/Sarajevo), from a computer in Tokyo.
// 2025: 30 March 02:00–03:00 never happened; 26 October 02:00–03:00 happened twice.
test.use({ storageState: authFile('adnan'), timezoneId: 'Asia/Tokyo' })

test('never-happened times block saving; doubled times need an explicit choice that is stored exactly', async ({ page }) => {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/odometer')) posts.push(r.url())
  })
  await openVehicle(page, 'A05-J-418', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  // Normal time: no extra question.
  await expect(form.getByRole('radio', { name: /İlk|İkinci/ })).toHaveCount(0)
  await form.locator('#km').fill('20000')
  await form.locator('#note').fill('Saat geçişi testi')

  await form.locator('#occurredAt').fill('2025-03-30T02:30')
  await expect(form.locator('#occurredAt-error')).toContainText('30.03.2025 02:30 şirket saatinde (Europe/Sarajevo) yaşanmadı')
  await form.getByRole('button', { name: 'Kaydet' }).click()
  await expect(form).toBeVisible()
  expect(posts).toEqual([])

  await form.locator('#occurredAt').fill('2025-10-26T02:30')
  await expect(form.locator('#occurredAt-error')).toHaveCount(0)
  const earlier = form.getByRole('radio', { name: 'İlk 02:30 — yaz saati (UTC+2)' })
  const later = form.getByRole('radio', { name: 'İkinci 02:30 — kış saati (UTC+1)' })
  await expect(earlier).not.toBeChecked()
  await expect(later).not.toBeChecked()
  await form.getByRole('button', { name: 'Kaydet' }).click()
  await expect(form.getByRole('alert').filter({ hasText: 'İlk mi, ikinci mi olduğunu seçin.' })).toBeVisible()
  expect(posts).toEqual([])

  await later.check()
  await form.getByRole('button', { name: 'Kaydet' }).click()
  await expect(form).toHaveCount(0)
  expect(posts).toHaveLength(1)
  const id = page.url().split('?')[0]!.split('/').pop()!
  const history = await (await page.request.get(`/api/vehicles/${id}/history`)).json()
  const entry = history.odometer.find((o: { km: number }) => o.km === 20000)
  expect(entry.occurredAt).toBe('2025-10-26T01:30:00.000Z')
  await expect(page.getByText('26.10.2025 02:30').first()).toBeVisible()
})

test('changing the time clears an earlier choice', async ({ page }) => {
  await openVehicle(page, 'A05-J-418', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Konumu güncelle' }).click()
  const form = page.getByRole('dialog', { name: 'Konumu güncelle' })
  await form.locator('#occurredAt').fill('2025-10-26T02:10')
  await form.getByRole('radio', { name: /İlk 02:10/ }).check()
  await form.locator('#occurredAt').fill('2025-10-26T02:20')
  await expect(form.getByRole('radio', { name: /İlk 02:20/ })).not.toBeChecked()
  await expect(form.getByRole('radio', { name: /İkinci 02:20/ })).not.toBeChecked()
})
