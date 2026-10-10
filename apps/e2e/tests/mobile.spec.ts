import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, openVehicle } from './fixtures'

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
