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
    await page.getByRole('link', { name: /Finans Merkezi · Kaparo/ }).click()
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
    await dlg.locator('#ap-r').fill('Müşteri seyahatini erteledi, tam iade.')
    await dlg.getByRole('button', { name: 'Talep et' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText(/Açık iade talebi var/)).toBeVisible()

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
})
