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

  test('customer documents tab, detail panel and requirement settings', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill('Ajla Testović')
    await page.getByRole('link', { name: 'Ajla Testović' }).click()
    await page.getByRole('tab', { name: /^Belgeler/ }).click()
    await expect(page.getByRole('region', { name: 'Belge kayıtları' })).toBeVisible()
    await audit(page, 'musteri belgeler')
    await page.getByRole('button', { name: 'Kimlik kartı ayrıntıları' }).click()
    await expect(page.getByRole('dialog', { name: 'Kimlik kartı' })).toBeVisible()
    await audit(page, 'belge ayrinti')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Belge ekle' }).first().click()
    await page.getByRole('dialog', { name: 'Belge ekle' }).getByLabel('Belge türü').selectOption('passport')
    await audit(page, 'belge ekle')
    await page.goto('/ayarlar')
    await expect(page.getByRole('heading', { name: 'Müşteri belge gereksinimleri' })).toBeVisible()
    await audit(page, 'ayarlar')
    await page.goto('/subeler')
    await audit(page, 'subeler')
  })

  test('corporate list, 360° tabs, forms, link panel and dialogs', async ({ page }) => {
    await page.goto('/kurumsal-hesaplar')
    await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
    await audit(page, 'kurumsal hesaplar')
    await page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' }).click()
    await expect(page.getByRole('heading', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
    await audit(page, 'kurumsal 360 genel')
    for (const [tab, label] of [
      [/^Adresler/, 'adresler'],
      [/^Vergi bilgileri/, 'vergi'],
      [/^Sürücüler/, 'suruculer'],
      ['Geçmiş', 'gecmis'],
      ['Cari / Finans', 'cari bekliyor'],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await audit(page, `kurumsal ${label}`)
    }
    await page.getByRole('tab', { name: /^Kişiler/ }).click()
    await page.getByRole('button', { name: 'Kişi bağla' }).click()
    await page.getByRole('dialog', { name: 'Kişi bağla' }).getByLabel('Müşterilerde ara').fill('Tarik')
    await expect(page.getByRole('list', { name: 'Arama sonuçları' })).toBeVisible()
    await audit(page, 'kisi bagla')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Hesabı arşivle' }).click()
    await audit(page, 'arsiv diyalogu')
    await page.keyboard.press('Escape')
    await page.goto('/kurumsal-hesaplar')
    await page.getByRole('button', { name: 'Yeni kurumsal hesap' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni kurumsal hesap' })
    await form.getByRole('button', { name: 'Hesabı kaydet' }).click()
    await form.locator('#email').fill('info@ornek-lojistik.example.test')
    await expect(form.getByRole('region', { name: 'Benzer kurumsal hesaplar' })).toBeVisible()
    await audit(page, 'yeni kurumsal hesap hatalar ve benzer kayit')
  })

  test('reservation list, timeline, new reservation, 360° and dialogs', async ({ page }) => {
    await page.goto('/rezervasyonlar')
    await expect(page.getByRole('link', { name: 'Lena Beispiel' }).first()).toBeVisible()
    await audit(page, 'rezervasyonlar')
    await page.getByRole('tab', { name: 'Zaman çizelgesi' }).click()
    await expect(page.getByRole('link', { name: 'R-000001, Onaylı' })).toBeVisible()
    await audit(page, 'zaman cizelgesi')
    await page.goto('/rezervasyonlar/yeni')
    await page.getByRole('button', { name: 'Rezervasyon oluştur' }).click()
    await page.getByLabel('Araç sınıfı').selectOption({ label: 'Orta' })
    await expect(page.getByRole('radiogroup', { name: 'Araç seçimi' })).toBeVisible()
    await page.getByLabel('Alış tarih ve saati').fill('2026-10-25T02:30')
    await expect(page.getByText('Bu saat kış saatine geçişte iki kez yaşanıyor. Hangisi?')).toBeVisible()
    await audit(page, 'yeni rezervasyon')
    page.once('dialog', (d) => void d.accept())
    await page.goto('/rezervasyonlar?status=all')
    await page.getByRole('searchbox', { name: 'Rezervasyonlarda ara' }).fill('R-000003')
    await page.getByRole('row', { name: /R-000003/ }).getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: 'Lena Beispiel' })).toBeVisible()
    await audit(page, 'rezervasyon 360')
    for (const tab of ['Kişiler', 'Araç', 'Durum geçmişi', 'İşlem geçmişi', 'Fiyat teklifi']) {
      await page.getByRole('tab', { name: tab }).click()
      await audit(page, `rezervasyon ${tab}`)
    }
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Rezervasyonu iptal et' }).click()
    await audit(page, 'iptal diyalogu')
    await page.keyboard.press('Escape')
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
