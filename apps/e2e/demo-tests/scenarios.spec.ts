import { expect, test, type Page } from '@playwright/test'
import { kpiValue, openDemo, runScenario, watch } from './fixtures'

// The eight guided demo scenarios, driven through the real screens (no direct state access).

async function addPayment(page: Page, o: { method: 'cash' | 'card' | 'transfer'; amount: string; cur: 'EUR' | 'BAM' | 'USD'; ref?: string; payer?: string }) {
  await page.getByRole('button', { name: 'Ödeme al' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('#pay-method').selectOption(o.method)
  if (o.ref) await dlg.locator('#pay-ref').fill(o.ref)
  await dlg.getByLabel('Para birimi').selectOption(o.cur)
  await dlg.locator('#pay-amount').fill(o.amount)
  return dlg
}

test.describe('scenario 5 · split payment (500 EUR)', () => {
  test('cash 100 EUR, card 200 BAM, USD waits for a rate, then 80 EUR, then 220 EUR transfer → 0; drawers stay separate', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    await runScenario(page, 5)
    await expect(page).toHaveURL(/\/kiralamalar\/rn\d+\?sekme=finans/)
    const rentalUrl = new URL(page.url()).pathname + new URL(page.url()).search
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')

    // 1 · 100 EUR cash
    let dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'EUR' })
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    expect(await kpiValue(page, 'Kalan')).toBe('400,00 EUR')

    // 2 · 200 BAM by card = 100 EUR
    dlg = await addPayment(page, { method: 'card', amount: '200', cur: 'BAM', ref: 'POS-S5-0001' })
    await expect(dlg.getByText(/100,00 EUR/).first()).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')

    // 3 · 100 USD without a rate: Awaiting Rate, nothing stored
    dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
    await expect(dlg.getByText('Kur Bekleniyor', { exact: true })).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg.getByRole('alert')).toBeVisible()
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
    expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')

    // Define 1 EUR = 1.25 USD in Settings → exchange rates
    await openDemo(page, '/ayarlar?bolum=kurlar')
    await page.getByRole('button', { name: 'Kur ekle' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('#fx-b').selectOption('EUR')
    await dlg.locator('#fx-q').selectOption('USD')
    await dlg.locator('#fx-r').fill('1,25')
    await dlg.getByLabel('Ters yönde otomatik kullanılabilir').check()
    await dlg.locator('#fx-n').fill('Demo senaryo kuru')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toBeHidden()

    // 4 · 100 USD now applies as 80 EUR
    await openDemo(page, rentalUrl) // full reload: the earlier payments and the new rate come back from the browser store
    expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')
    dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
    await expect(dlg.getByText(/80,00 EUR/).first()).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    expect(await kpiValue(page, 'Kalan')).toBe('220,00 EUR')

    // 5 · the rest by bank transfer
    dlg = await addPayment(page, { method: 'transfer', amount: '220', cur: 'EUR', ref: 'EFT-S5-0001' })
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    expect(await kpiValue(page, 'Kalan')).toBe('0,00 EUR')
    expect(w.apiRequests).toEqual([])
    expect(w.errors).toEqual([])
  })
})
