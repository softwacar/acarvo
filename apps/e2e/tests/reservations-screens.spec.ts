import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of Reservations V1 on the test database. Opt-in: SCREENSHOTS=1 npx playwright test reservations-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'r1', `${name}.png`)
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`reservation screens at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/rezervasyonlar')
    await expect(page.getByRole('link', { name: 'Lena Beispiel' }).first()).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-liste-${w}`), fullPage: true })
    await page.getByRole('tab', { name: 'Zaman çizelgesi' }).click()
    await expect(page.getByRole('link', { name: 'R-000001, Onaylı' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`02-zaman-cizelgesi-${w}`), fullPage: true })

    await page.goto('/rezervasyonlar/yeni')
    await page.getByRole('button', { name: 'Rezervasyon oluştur' }).click()
    await settle(page)
    await page.screenshot({ path: out(`03-yeni-bos-hatalar-${w}`), fullPage: true })
    await page.getByLabel('Müşteri', { exact: true }).fill('Lena')
    await page.getByRole('list', { name: 'Müşteri: sonuçlar' }).getByRole('button', { name: /Lena Beispiel/ }).click()
    await page.getByLabel('Kurumsal hesap (isteğe bağlı)').fill('Örnek')
    await page.getByRole('list', { name: 'Kurumsal hesap sonuçları' }).getByRole('button', { name: /Örnek Lojistik/ }).click()
    await page.getByLabel('Alış tarih ve saati').fill(`${day(3)}T10:00`)
    await page.getByLabel('İade tarih ve saati').fill(`${day(4)}T10:00`)
    await page.getByLabel('Araç sınıfı').selectOption({ label: 'Orta' })
    await expect(page.getByRole('radiogroup', { name: 'Araç seçimi' })).toContainText('Dolu: R-000001')
    await page.getByLabel('Rezervasyon kaynağı').selectOption('corporate')
    await settle(page)
    await page.screenshot({ path: out(`04-yeni-dolu-arac-${w}`), fullPage: true })
    await page.getByLabel('Alış tarih ve saati').fill('2026-10-25T02:30')
    await expect(page.getByText('Bu saat kış saatine geçişte iki kez yaşanıyor. Hangisi?')).toBeVisible()
    await page.getByRole('region', { name: 'Kiralama planı' }).scrollIntoViewIfNeeded()
    await settle(page)
    await page.screenshot({ path: out(`05-yeni-yaz-saati-${w}`) })
    page.once('dialog', (d) => void d.accept())

    await page.goto('/rezervasyonlar?status=all')
    await page.getByRole('searchbox', { name: 'Rezervasyonlarda ara' }).fill('R-000003')
    await page.getByRole('row', { name: /R-000003/ }).getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: 'Lena Beispiel' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`06-360-genel-${w}`), fullPage: true })
    for (const [tab, name] of [
      ['Kişiler', '07-kisiler'],
      ['Durum geçmişi', '08-durum'],
      ['Fiyat ve kiralama', '09-fiyat-bagli-degil'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`${name}-${w}`), fullPage: true })
    }
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Rezervasyonu iptal et' }).click()
    await settle(page)
    await page.screenshot({ path: out(`10-iptal-${w}`) })
    await page.keyboard.press('Escape')
    await page.goto('/rezervasyonlar?status=cancelled')
    await page.getByRole('row', { name: /R-000004/ }).getByRole('link').first().click()
    await expect(page.getByText('İptal edildi').first()).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`11-iptal-edilmis-${w}`) })
  })
}
