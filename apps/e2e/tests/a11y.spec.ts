import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, openVehicle } from './fixtures'

// Accessibility (axe, WCAG 2.1 A/AA) and layout checks on the main screens.
// Serious and critical findings fail the test; the rest are printed for review.

async function audit(page: Page, label: string) {
  // Measure the settled screen: fade-in animations make text briefly low-contrast.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  for (const v of result.violations) {
    console.log(`[axe] ${label}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  }
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), label).toEqual([])
}

test('sign-in page', async ({ page }) => {
  await page.goto('/giris')
  await audit(page, 'giris')
})

test.describe('signed in', () => {
  test.use({ storageState: authFile('adnan') })

  test('vehicle list and form', async ({ page }) => {
    await page.goto('/araclar')
    await expect(page.getByText('A12-K-345').first()).toBeVisible()
    await audit(page, 'araclar')
    await page.goto('/araclar/yeni')
    await expect(page.locator('#plate')).toBeVisible()
    await audit(page, 'araclar/yeni')
  })

  test('vehicle 360 tabs, forms and side panels', async ({ page }) => {
    await openVehicle(page, 'A12-K-345')
    await audit(page, '360 genel')
    await page.getByRole('tab', { name: 'Belgeler ve riskler' }).click()
    await expect(page.getByRole('heading', { name: 'Belgeler ve süreler' })).toBeVisible()
    await audit(page, '360 belgeler')
    await page.getByRole('button', { name: 'Belge ekle' }).click()
    await expect(page.getByRole('dialog', { name: 'Belge ekle' })).toBeVisible()
    await audit(page, 'belge formu')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: /Konum ve geçmiş/ }).click()
    await expect(page.getByRole('heading', { name: 'Kilometre geçmişi' })).toBeVisible()
    await audit(page, '360 geçmiş')
    await page.getByRole('button', { name: 'Kilometre gir' }).click()
    await expect(page.getByRole('dialog', { name: 'Kilometre gir' })).toBeVisible()
    await audit(page, 'km formu')
  })

  test('customer list, file, form and archive dialog', async ({ page }) => {
    await page.goto('/musteriler')
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toBeVisible()
    await audit(page, 'musteriler')
    await page.getByRole('link', { name: 'Ajla Testović' }).click()
    await expect(page.getByRole('heading', { name: 'Ajla Testović' })).toBeVisible()
    await audit(page, 'musteri 360')
    await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
    await audit(page, 'musteri gecmis')
    await page.getByRole('button', { name: 'Düzenle' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Müşteriyi düzenle' })).toBeVisible()
    await audit(page, 'musteri duzenle')
    await page.keyboard.press('Escape')
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await form.locator('#phone').fill('+387 61 000 104')
    await expect(form.getByRole('region', { name: 'Benzer müşteri kayıtları' })).toBeVisible()
    await audit(page, 'yeni musteri hatalar ve benzer kayit')
  })

  test('side panels trap focus, close with Escape and give focus back', async ({ page }) => {
    await openVehicle(page, 'A12-K-345', 'Konum ve geçmiş')
    const opener = page.getByRole('button', { name: 'Konumu güncelle' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Konumu güncelle' })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  for (const width of [1440, 1024, 768, 390]) {
    test(`no sideways scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/araclar')
      await expect(page.getByText('A12-K-345').first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await page.goto('/araclar/yeni')
      await expect(page.locator('#plate')).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await openVehicle(page, 'A12-K-345')
      await expectNoHorizontalOverflow(page)
      for (const tab of ['Belgeler ve riskler', /Konum ve geçmiş/]) {
        await page.getByRole('tab', { name: tab }).click()
        await page.waitForTimeout(300)
        await expectNoHorizontalOverflow(page)
      }
    })
  }
})
