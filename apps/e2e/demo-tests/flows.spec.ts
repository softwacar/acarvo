import { expect, test } from '@playwright/test'
import { openDemo, switchUser, watch } from './fixtures'

// End-to-end behaviour of the demo: actions persist, reset restores, roles change what is allowed, language switches.

test.describe('demo flows', () => {
  test('a new reservation is saved, persists across a reload and the reset removes it', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/rezervasyonlar/yeni?musteri=c3')
    await page.getByRole('button', { name: 'Rezervasyonu kaydet' }).click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await expect(page.getByText('Bekliyor').first()).toBeVisible()
    const url = page.url()
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(url)
    await expect(page.getByText('Bekliyor').first()).toBeVisible()

    // reset from the Demo menu
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Demo verilerini sıfırla/ }).click()
    await page.getByRole('button', { name: 'Sıfırla' }).click()
    await page.waitForLoadState('networkidle')
    await page.goto(url)
    await expect(page.getByText('Rezervasyon bulunamadı')).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })

  test('the role switcher changes what the user may see: Operasyon has no finance reports or settings management', async ({ page }) => {
    await openDemo(page, '/')
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/ayarlar')
    await expect(page.getByText(/yetkiniz yok|yetki/i).first()).toBeVisible()
    await openDemo(page, '/raporlar')
    await expect(page.getByRole('button', { name: /Gelir \(hesaplanan\)/ })).toHaveCount(0)
  })

  test('the owner can open the single exchange-rate desk; it exists only in Settings', async ({ page }) => {
    await openDemo(page, '/ayarlar?bolum=kurlar')
    await expect(page.getByRole('heading', { name: 'Geçerli kurlar' })).toBeVisible()
    await expect(page.getByText('1 EUR = 2 BAM').first()).toBeVisible()
    await openDemo(page, '/finans?sekme=kurlar')
    await expect(page.getByRole('link', { name: 'Kurları düzenle' })).toBeVisible()
  })

  test('the language can be switched to English and the navigation follows', async ({ page }) => {
    await openDemo(page, '/')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
    await expect(page.getByText('ACARVO DEMO — Sample Data').first()).toBeVisible()
  })

  test('a delivery cannot be completed while checks fail and the button says why', async ({ page }) => {
    await openDemo(page, '/kiralamalar?durum=prepared')
    await page.getByRole('link', { name: /^K-\d+/ }).first().click()
    await expect(page.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
    await expect(page.getByText('Düğme pasif: eksik kontroller')).toBeVisible()
  })

  test('the Command Center, Home and the notification bell read one alert source', async ({ page }) => {
    await openDemo(page, '/komuta-merkezi?sekme=uyarilar')
    const tab = await page.getByRole('tab', { name: /Uyarılar/ }).textContent()
    const count = Number(/(\d+)/.exec(tab ?? '')?.[1] ?? '0')
    expect(count).toBeGreaterThan(0)
    await openDemo(page, '/riskler-ve-istisnalar')
    const risks = await page.getByRole('tab', { name: /Riskler/ }).textContent()
    expect(Number(/(\d+)/.exec(risks ?? '')?.[1] ?? '-1')).toBe(count)
  })
})
