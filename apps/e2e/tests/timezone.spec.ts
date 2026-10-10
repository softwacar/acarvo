import { expect, test } from '@playwright/test'
import { authFile, openVehicle, sarajevoWallTime } from './fixtures'

// A user whose computer is in Istanbul (UTC+3 all year) records a reading for a Bosnian fleet (Europe/Sarajevo).
test.use({ storageState: authFile('adnan'), timezoneId: 'Europe/Istanbul' })

test('times are entered and shown in company time, whatever the computer zone', async ({ page }) => {
  await openVehicle(page, 'E63-A-847', 'Konum ve geçmiş')
  await page.getByRole('button', { name: 'Kilometre gir' }).click()
  const form = page.getByRole('dialog', { name: 'Kilometre gir' })
  await expect(form.getByText('Saat, şirket saatiyle (Europe/Sarajevo) girilir.')).toBeVisible()
  await expect(form.getByText('Bilgisayarınızın saat dilimi farklı (Europe/Istanbul).')).toBeVisible()
  // The default is "now" on the Sarajevo clock, not the Istanbul one.
  const value = await form.locator('#occurredAt').inputValue()
  expect([sarajevoWallTime(0), sarajevoWallTime(-60_000)]).toContain(value)

  // A back-dated reading, 30 hours ago in Sarajevo: not late (< 48 h), so no note is needed.
  const wall = sarajevoWallTime(-30 * 3_600_000)
  await form.locator('#occurredAt').fill(wall)
  await form.locator('#km').fill('70300')
  await expect(form.locator('#note')).not.toHaveAttribute('aria-invalid', 'true')
  await form.getByRole('button', { name: 'Kaydet' }).click()
  await expect(form).toHaveCount(0)

  // Shown with the same Sarajevo clock time that was typed.
  const [date, time] = wall.split('T')
  const shown = `${date!.slice(8, 10)}.${date!.slice(5, 7)}.${date!.slice(0, 4)} ${time}`
  await expect(page.getByText(shown).first()).toBeVisible()
  // Stored as the right instant.
  const href = page.url().split('?')[0]!
  const id = href.split('/').pop()!
  const history = await (await page.request.get(`/api/vehicles/${id}/history`)).json()
  const entry = history.odometer.find((o: { km: number }) => o.km === 70300)
  const back = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Sarajevo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(entry.occurredAt))
    .replace(' ', 'T')
  expect(back).toBe(wall)
  expect(entry.late).toBe(false)
})
