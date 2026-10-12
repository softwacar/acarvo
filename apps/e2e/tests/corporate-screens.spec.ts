import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Review screenshots of M3 (corporate accounts) on the test database with synthetic accounts.
// Opt-in: SCREENSHOTS=1 npx playwright test corporate-screens
test.skip(!process.env.SCREENSHOTS, 'screenshots only on request (SCREENSHOTS=1)')
test.use({ storageState: authFile('adnan') })

const out = (name: string) => path.join(import.meta.dirname, '..', 'screenshots', 'm3', `${name}.png`)
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}
async function open360(page: Page, name: string) {
  await page.goto('/kurumsal-hesaplar')
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`corporate screens at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/kurumsal-hesaplar')
    await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`01-liste-${w}`), fullPage: true })

    await page.getByRole('button', { name: 'Yeni kurumsal hesap' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni kurumsal hesap' })
    await form.getByRole('button', { name: 'Hesabı kaydet' }).click()
    await form.getByLabel('Resmi unvan').fill('Primjer Turizam d.o.o.')
    await form.locator('#taxValue').fill('TEST-PDV-200502')
    await expect(form.getByRole('region', { name: 'Benzer kurumsal hesaplar' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`02-yeni-hesap-benzer-${w}`) })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Kaydetmeden kapat' }).click()

    await open360(page, 'Örnek Lojistik d.o.o.')
    await settle(page)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: out(`03-360-genel-${w}`), fullPage: true })
    for (const [tab, name] of [
      [/^Adresler/, '04-adresler'],
      [/^Vergi bilgileri/, '05-vergi'],
      [/^Kişiler/, '06-kisiler'],
      [/^Sürücüler/, '07-suruculer'],
      ['Geçmiş', '08-gecmis'],
      ['Cari / Finans', '09-cari-bagli-degil'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await settle(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: out(`${name}-${w}`), fullPage: true })
    }
    await page.getByRole('tab', { name: /^Kişiler/ }).click()
    await page.getByRole('button', { name: 'Kişi bağla' }).click()
    const sheet = page.getByRole('dialog', { name: 'Kişi bağla' })
    await sheet.getByLabel('Müşterilerde ara').fill('Tarik')
    await sheet.getByRole('button', { name: /Tarik Testić/ }).click()
    await settle(page)
    await page.screenshot({ path: out(`10-kisi-bagla-${w}`) })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Kaydetmeden kapat' }).click()
    await page.getByRole('tab', { name: /^Adresler/ }).click()
    await page.getByRole('button', { name: 'Adres ekle' }).click()
    await settle(page)
    await page.screenshot({ path: out(`11-adres-ekle-${w}`) })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Hesabı arşivle' }).click()
    await settle(page)
    await page.screenshot({ path: out(`12-arsiv-${w}`) })
    await page.keyboard.press('Escape')
    // Empty state of a search and the archived account banner.
    await page.goto('/kurumsal-hesaplar')
    await page.getByRole('searchbox', { name: 'Kurumsal hesaplarda ara' }).fill('olmayan-firma-xyz')
    await expect(page.getByText('Aramaya uyan kurumsal hesap yok')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`13-bos-arama-${w}`) })
    await page.goto('/kurumsal-hesaplar?status=archived')
    await page.getByRole('link', { name: 'Stara Firma d.o.o.' }).click()
    await expect(page.getByText('Arşivdeki hesap düzenlenemez', { exact: false })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out(`14-arsivdeki-hesap-${w}`) })
  })
}
