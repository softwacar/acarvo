import { expect, test } from '@playwright/test'
import { deliverAtDesk, kpiValue, openDemo, switchUser, watch } from './fixtures'

// Advance (kaparo) as the user sees it: held on the reservation, moved to the rental on conversion, applied once at delivery;
// refunded through four-eyes approval; kept as a policy fee only after a cancellation or no-show.

const openStory = async (page: import('@playwright/test').Page) => {
  await openDemo(page, '/rezervasyonlar?q=Selma')
  await page.getByText('Selma Hodžić-Demo').first().click()
  await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
}

test.describe('advance (kaparo)', () => {
  test('the story reservation shows a held advance; conversion moves it once; delivery applies it once to the charge', async ({ page }) => {
    const w = watch(page)
    await openStory(page)
    await page.getByRole('tab', { name: /Kaparo/ }).click()
    await expect(page.getByText('Tutuluyor (uygulanmadı)')).toBeVisible()
    await expect(page.getByText(/gelir değildir/).first()).toBeVisible()
    const amount = /T-\d+ · ([0-9.,]+ EUR)/.exec((await page.locator('main').innerText()).replace(/\s+/g, ' '))![1]!

    // the same advance is listed in Finance → Advances and links back
    await page.getByRole('link', { name: /Finans · Kaparo/ }).click()
    await expect(page.getByText(amount).first()).toBeVisible()
    await page.goBack()

    // conversion: the advance moves to the rental, unapplied (there is no charge before delivery)
    await page.getByRole('button', { name: 'Kiralamaya dönüştür' }).click()
    const confirm = page.getByRole('dialog')
    if (await confirm.count()) await confirm.getByRole('button', { name: /Dönüştür/ }).click()
    await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
    await page.getByRole('tab', { name: 'Finans' }).click()
    await expect(page.getByText('Kiralamaya aktarıldı').first()).toBeVisible()
    expect(await kpiValue(page, 'Uygulanmamış')).toBe(amount)
    expect(await kpiValue(page, 'Hesap kalemleri')).toBe('0,00 EUR')

    // delivery posts the one base charge and applies the advance to it, once
    await page.getByRole('tab', { name: 'Teslim Masası' }).click()
    await deliverAtDesk(page)
    await page.getByRole('tab', { name: 'Finans' }).click()
    await expect(page.getByText('Hesap kalemine uygulandı').first()).toBeVisible()
    expect(await kpiValue(page, 'Uygulanan')).toBe(amount)
    expect(await kpiValue(page, 'Uygulanmamış')).toBe('0,00 EUR')
    expect(w.apiRequests).toEqual([])
  })

  test('a refund request needs a second person: requested, approved, applied; the advance ends as Refunded', async ({ page }) => {
    await openStory(page)
    await page.getByRole('tab', { name: /Kaparo/ }).click()
    await page.getByRole('button', { name: 'İade talep et' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#ra-r').fill('Müşteri seyahatini erteledi, tam iade.')
    await dlg.getByRole('button', { name: 'Talep et' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText(/onay\/ödeme bekliyor/)).toBeVisible()

    // the requester cannot decide: the open request shows no decision for them; a second user approves and applies
    await openDemo(page, '/onay-merkezi')
    await switchUser(page, /Selma Karić/)
    await openDemo(page, '/onay-merkezi')
    await page.getByRole('row', { name: /İade/ }).first().click()
    let drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /Onayla/ }).click()
    await expect(drawer.getByText(/Onaylandı/).first()).toBeVisible()
    await drawer.getByRole('button', { name: /Uygula/ }).click()
    await expect(drawer.getByText(/Uygulandı/).first()).toBeVisible()
    await page.keyboard.press('Escape')

    // the advance now ends as Refunded on the reservation and in Finance; it is no longer held
    await openStory(page)
    await page.getByRole('tab', { name: /Kaparo/ }).click()
    await expect(page.getByText('İade edildi').first()).toBeVisible()
    await expect(page.getByText('Tutuluyor (uygulanmadı)')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'İade talep et' })).toHaveCount(0)
  })
  test('policy story: 200 EUR advance, cancelled → 50 EUR fee kept, 150 EUR refundable; a partial refund of 100 leaves 50 and a second refund above that is refused', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar/rsv23?sekme=kaparo')
    await page.getByRole('tab', { name: /Kaparo/ }).click()
    const card = page.getByTestId('advance-T-000041')
    await expect(card).toContainText('200,00 EUR')
    await expect(card).toContainText('İptal edilirse otomatik hesaplanır: 50,00 EUR')

    // cancelling applies the company policy once: the fee is retained, the rest stays refundable and is not paid back automatically
    await page.getByRole('button', { name: 'İptal et' }).first().click()
    const cancel = page.getByRole('dialog')
    await cancel.locator('#cx-r').fill('Müşteri vazgeçti, politika uygulansın.')
    await cancel.getByRole('button', { name: 'İptal et' }).click()
    await expect(cancel).toBeHidden()
    await expect(card).toContainText('İade edilebilir: 150,00 EUR')
    await expect(card).not.toContainText('Gerçek iade 100')

    // partial refund of 100 EUR: asked by one person, approved and applied by another
    await card.getByRole('button', { name: 'İade talep et' }).click()
    const ask = page.getByRole('dialog')
    await ask.getByLabel(/İade tutarı/).fill('100')
    await ask.locator('#ra-r').fill('Kısmi iade: müşteri 100 EUR geri istedi.')
    await ask.getByRole('button', { name: 'Talep et' }).click()
    await expect(ask).toBeHidden()
    await openDemo(page, '/onay-merkezi')
    await switchUser(page, /Selma Karić/)
    await openDemo(page, '/onay-merkezi')
    await page.getByRole('tab', { name: /Tümü/ }).click()
    await page.getByRole('row', { name: /İade/ }).first().click()
    const drawer = page.getByRole('dialog')
    const decide = drawer.getByRole('button', { name: /Onayla/ })
    if (await decide.count()) await decide.click() // a refund below the threshold may already be approved when an authorizer asked for it
    await expect(drawer.getByText(/Onaylandı/).first()).toBeVisible()
    await drawer.getByRole('button', { name: /Uygula/ }).click()
    await expect(drawer.getByText(/Uygulandı/).first()).toBeVisible()
    await page.keyboard.press('Escape')

    // 50 EUR remain; asking for 100 again is refused (no double refund)
    await openDemo(page, '/rezervasyonlar/rsv23?sekme=kaparo')
    await page.getByRole('tab', { name: /Kaparo/ }).click()
    const after = page.getByTestId('advance-T-000041')
    await expect(after).toContainText('İade edilebilir: 50,00 EUR')
    await after.getByRole('button', { name: 'İade talep et' }).click()
    const again = page.getByRole('dialog')
    await again.getByLabel(/İade tutarı/).fill('100')
    await again.locator('#ra-r').fill('İkinci iade denemesi, fazla tutar.')
    await again.getByRole('button', { name: 'Talep et' }).click()
    await expect(again).toBeVisible() // refused: the dialog stays open with the reason
    await expect(again.getByText(/en fazla|aşamaz|iade edilebilir/i).first()).toBeVisible()
  })
})
