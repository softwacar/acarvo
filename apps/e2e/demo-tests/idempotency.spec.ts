import { expect, test } from '@playwright/test'
import { kpiValue, openDemo, runScenario } from './fixtures'

// Pressing a confirm button twice quickly must not write twice (spec: no duplicate payment, reservation or cash entry).

test.describe('double click', () => {
  test('a double-clicked payment is recorded once', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 5)
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')
    await page.getByRole('button', { name: 'Ödeme al' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#pay-method').selectOption('cash')
    await dlg.locator('#pay-amount').fill('10')
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).dblclick()
    await expect(dlg).toBeHidden()
    // a recorded payment is not applied yet: the balance drops only after a second person verifies it, and it was recorded once
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')
    await expect(page.getByText('10,00 EUR doğrulama bekliyor')).toBeVisible()
    await expect(page.getByText('Kaydedildi · doğrulama bekliyor')).toHaveCount(1)
  })

  test('a double-clicked cash movement is recorded once', async ({ page }) => {
    await openDemo(page, '/sube-kasalari')
    const drawer = page.getByRole('region', { name: 'SJJ · EUR kasası' })
    const before = (await drawer.innerText()).match(/([0-9.,]+) EUR/)![1]!
    await drawer.getByRole('button', { name: 'Hareket ekle' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#mv-k').selectOption('in')
    await dlg.locator('#mv-a').fill('25')
    await dlg.locator('#mv-r').fill('Çift tıklama denemesi')
    await dlg.getByRole('button', { name: 'Kaydet' }).dblclick()
    await expect(dlg).toBeHidden()
    const toNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
    const after = (await drawer.innerText()).match(/([0-9.,]+) EUR/)![1]!
    expect(toNumber(after)).toBeCloseTo(toNumber(before) + 25, 2)
  })

  test('a double-clicked reservation is saved once', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar/yeni?musteri=c3')
    await page.getByRole('button', { name: 'Bekleyen Kaydet' }).dblclick()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    const no = (await page.locator('h1').first().innerText()).trim()
    const n = Number(no.replace(/\D/g, ''))
    // the very next number must not exist: only one reservation was created by the double click
    await openDemo(page, `/rezervasyonlar/rsv${n + 1}`)
    await expect(page.getByText('Rezervasyon bulunamadı')).toBeVisible()
  })
})
