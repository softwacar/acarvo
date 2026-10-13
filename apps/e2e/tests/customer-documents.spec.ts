import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, fixture, login } from './fixtures'

// M2 user flows on the test database: synthetic documents ("TEST-…"), per-run synthetic keys, synthetic policies.

async function openDocuments(page: Page, name: string) {
  await page.goto('/musteriler')
  await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill(name)
  await page.getByRole('link', { name, exact: true }).click()
  await page.getByRole('tab', { name: /^Belgeler/ }).click()
  await expect(page.getByRole('region', { name: 'Belge kayıtları' })).toBeVisible()
}

test.describe('as the owner', () => {
  test.use({ storageState: authFile('adnan') })

  test('adds a passport: the number is stored, shown masked, and opened only with a reason for 30 seconds', async ({ page }) => {
    await page.clock.install()
    await openDocuments(page, 'Sara Probić')
    await expect(page.getByText('Henüz geçerli belge kaydı yok')).toBeVisible()
    await page.getByRole('button', { name: 'Belge ekle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Belge ekle' })
    await form.getByLabel('Belge türü').selectOption('passport')
    await form.getByLabel('Düzenleyen ülke').selectOption('BA')
    await form.getByLabel('Belge numarası').fill('test-pp 4455 66')
    await form.getByLabel('Son geçerlilik').fill('2034-03-01')
    await form.getByLabel('Doğrulama').selectOption('original_seen')
    await form.getByRole('button', { name: 'Belgeyi kaydet' }).click()
    // Saving opens the new document's detail panel.
    const detail = page.getByRole('dialog', { name: 'Pasaport' })
    await expect(detail).toBeVisible()
    await expect(detail.getByText('••••5566')).toBeVisible()
    await expect(page.getByText('TESTPP445566')).toHaveCount(0)
    await detail.getByRole('button', { name: 'Numarayı göster' }).click()
    const reveal = page.getByRole('dialog', { name: 'Tam belge numarası' })
    await reveal.getByRole('button', { name: 'Numarayı göster' }).click()
    await expect(reveal.getByText('Numarayı açma nedenini seçin')).toBeVisible()
    await reveal.getByLabel('Neden').selectOption('contract_preparation')
    await reveal.getByRole('button', { name: 'Numarayı göster' }).click()
    await expect(reveal.getByTestId('revealed-number')).toHaveText('TESTPP445566')
    await expect(reveal.getByRole('button', { name: /kopyala/i })).toHaveCount(0)
    await page.clock.fastForward(31_000)
    await expect(reveal.getByText('Numara gizlendi.')).toBeVisible()
    await expect(page.getByText('TESTPP445566')).toHaveCount(0)
    await reveal.getByRole('button', { name: 'Kapat' }).click()
    await expect(detail.getByText('Tam numara açıldı')).toBeVisible()
  })

  test('uploads a front side encrypted, views it in a new tab and downloads it', async ({ page }) => {
    await openDocuments(page, 'Ajla Testović')
    await page.getByRole('button', { name: 'Kimlik kartı ayrıntıları' }).click()
    const detail = page.getByRole('dialog', { name: 'Kimlik kartı' })
    const chooser = page.waitForEvent('filechooser')
    await detail.getByRole('button', { name: 'Ön yüz yükle' }).click()
    await (await chooser).setFiles(fixture('foto-mavi.jpg'))
    await expect(page.getByText('Ön yüz yüklendi ve şifreli saklandı.')).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Ön yüz sürüm 1 görüntüle' })).toBeVisible()
    const popup = page.waitForEvent('popup')
    await detail.getByRole('button', { name: 'Ön yüz sürüm 1 görüntüle' }).click()
    const tab = await popup
    const response = await tab.waitForResponse((r) => r.url().includes('/api/customer-files/'))
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/jpeg')
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(tab.url()).not.toMatch(/token|key=/i)
    await tab.close()
    const download = page.waitForEvent('download')
    await detail.getByRole('button', { name: 'Ön yüz sürüm 1 indir' }).click()
    expect((await download).suggestedFilename()).toBe('kimlik_front_v1.jpg')
    await expect(detail.getByText('Görüntüleme istendi')).toBeVisible()
    await expect(detail.getByText('İndirme istendi')).toBeVisible()
  })

  test('a renewal keeps the previous period; voiding moves a record to the past list', async ({ page }) => {
    await openDocuments(page, 'Ajla Testović')
    await page.getByRole('button', { name: 'Sürücü belgesi ayrıntıları' }).click()
    await page.getByRole('dialog', { name: 'Sürücü belgesi' }).getByRole('button', { name: 'Yeni dönem' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni dönem aç' })
    await expect(form.getByLabel(/Önceki dönemin numarası aynı kalsın/)).toBeChecked()
    await form.getByLabel('Düzenleyen ülke').selectOption('BA')
    await form.getByLabel('Son geçerlilik').fill('2036-05-01')
    await form.getByRole('button', { name: 'Yeni dönemi kaydet' }).click()
    await expect(page.getByText('Sürücü belgesi için yeni dönem açıldı.')).toBeVisible()
    await page.keyboard.press('Escape')
    const docs = page.getByRole('region', { name: 'Belge kayıtları' })
    await expect(docs.getByText('01.05.2036 tarihine kadar geçerli')).toBeVisible()
    await docs.getByRole('button', { name: /Önceki dönemler/ }).click()
    await expect(docs.getByText('Yenilendi · önceki dönem')).toBeVisible()

    await page.getByRole('button', { name: 'Belge ekle' }).first().click()
    const add = page.getByRole('dialog', { name: 'Belge ekle' })
    await add.getByLabel('Belge türü').selectOption('visa')
    await add.getByLabel('Düzenleyen ülke').selectOption('DE')
    await add.getByRole('button', { name: 'Belgeyi kaydet' }).click()
    const visa = page.getByRole('dialog', { name: 'Vize' })
    await visa.getByRole('button', { name: 'Geçersiz say' }).click()
    const dialog = page.getByRole('dialog', { name: 'Belgeyi geçersiz say' })
    await dialog.getByLabel('Neden').selectOption('entry_error')
    await dialog.getByRole('button', { name: 'Geçersiz say' }).click()
    await expect(page.getByText('Vize geçersiz sayıldı.')).toBeVisible()
  })

  test('requirements: a draft from the passive example becomes active only after explicit confirmation', async ({ page }) => {
    await page.goto('/ayarlar')
    await expect(page.getByText('Bu kurallar hukuken doğrulanmış değildir', { exact: false })).toBeVisible()
    const draft = page.getByRole('group', { name: 'Bosna-Hersek Yabancı (ikamet) taslak' })
    await draft.getByRole('button', { name: 'Taslağı sil' }).click()
    await expect(draft).toHaveCount(0)
    const foreign = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Yabancı (ikamet)', level: 4 }) }).last()
    await foreign.getByRole('button', { name: 'Örnek şablondan taslak' }).click()
    const fromTemplate = page.getByRole('group', { name: 'Bosna-Hersek Yabancı (ikamet) taslak' })
    await expect(fromTemplate.getByText('örnek şablondan')).toBeVisible()
    await fromTemplate.getByRole('button', { name: 'Etkinleştir' }).click()
    const confirm = page.getByRole('dialog', { name: 'Gereksinimi etkinleştir' })
    await expect(confirm.getByRole('button', { name: 'Etkinleştir' })).toBeDisabled()
    await expect(confirm.getByText('hukuki uygunluk onayı veya garantisi değildir', { exact: false })).toBeVisible()
    await confirm.getByLabel(/kendi değerlendirmesiyle kontrol ettim/).check()
    await confirm.getByRole('button', { name: 'Etkinleştir' }).click()
    await expect(page.getByText('Yabancı (ikamet) sürüm 2 etkinleştirildi.', { exact: false })).toBeVisible()

    await openDocuments(page, 'Lena Beispiel')
    const status = page.getByRole('region', { name: 'Belge durumu' })
    await expect(status.getByText('Yerli (ikamet) olarak değerlendirilirse')).toBeVisible()
    await expect(status.getByText('Yabancı (ikamet) olarak değerlendirilirse')).toBeVisible()
    await expect(status.getByText('Bu özet karar vermez', { exact: false })).toBeVisible()
  })

  test('the customer list shows document problems and filters on them', async ({ page }) => {
    await page.goto('/musteriler')
    await expect(page.locator('tbody tr', { hasText: 'John Sample' })).toContainText('1 belge süresi dolmuş')
    await page.getByLabel('Belge durumu').selectOption('expired')
    await expect(page).toHaveURL(/documents=expired/)
    await expect(page.getByRole('link', { name: 'John Sample' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mirza Uzorak' })).toHaveCount(0)
  })
})

test.describe('as operations (Operasyon)', () => {
  test.use({ storageState: authFile('selma') })

  test('adds a document but cannot open files or full numbers; settings are not available', async ({ page }) => {
    await openDocuments(page, 'Mirza Uzorak')
    await page.getByRole('button', { name: 'Belge ekle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Belge ekle' })
    await form.getByLabel('Belge türü').selectOption('driving_license')
    await form.getByLabel('Düzenleyen ülke').selectOption('BA')
    await form.getByLabel('Belge numarası').fill('TEST-OPS-901')
    await form.getByRole('button', { name: 'Belgeyi kaydet' }).click()
    const detail = page.getByRole('dialog', { name: 'Sürücü belgesi' })
    await expect(detail.getByText('••••S901')).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Numarayı göster' })).toHaveCount(0)
    const chooser = page.waitForEvent('filechooser')
    await detail.getByRole('button', { name: 'Ön yüz yükle' }).click()
    await (await chooser).setFiles(fixture('foto-gri.jpg'))
    await expect(detail.getByText('Dosya yüklendi')).toBeVisible()
    await expect(detail.getByText('Açma yetkiniz yok')).toBeVisible()
    await expect(detail.getByRole('button', { name: /görüntüle|indir/i })).toHaveCount(0)
    await page.goto('/ayarlar')
    // Document requirement settings stay owner-only; since Rentals V1 the rental mode is shown read-only.
    await expect(page.getByRole('heading', { name: 'Müşteri belge gereksinimleri' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Kiralama çalışma modu' })).toContainText('Yalnız şirket sahibi değiştirebilir')
  })
})

test('1440 and 768: documents tab and settings without sideways scrolling', async ({ browser }) => {
  for (const width of [1440, 768]) {
    const ctx = await browser.newContext({ storageState: authFile('adnan'), viewport: { width, height: 900 }, locale: 'tr-TR' })
    const page = await ctx.newPage()
    await openDocuments(page, 'Lena Beispiel')
    await expectNoHorizontalOverflow(page)
    await page.goto('/ayarlar')
    await expect(page.getByRole('heading', { name: 'Müşteri belge gereksinimleri' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await ctx.close()
  }
})

test('as a manager (Yönetici): may view a document image, but not download it or open the full number', async ({ browser }) => {
  // Neretva's owner uploads a front side for the synthetic customer Dino.
  const ownerCtx = await browser.newContext({ storageState: authFile('lejla'), viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
  const owner = await ownerCtx.newPage()
  await openDocuments(owner, 'Dino Neretvić')
  await owner.getByRole('button', { name: 'Kimlik kartı ayrıntıları' }).click()
  const ownerDetail = owner.getByRole('dialog', { name: 'Kimlik kartı' })
  const chooser = owner.waitForEvent('filechooser')
  await ownerDetail.getByRole('button', { name: 'Ön yüz yükle' }).click()
  await (await chooser).setFiles(fixture('foto-mavi.jpg'))
  await expect(ownerDetail.getByRole('button', { name: 'Ön yüz sürüm 1 indir' })).toBeVisible()
  await ownerCtx.close()

  // Adnan is a Yönetici in Neretva: a separate, fresh session (the stored Drina session is not touched).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  await login(page, 'adnan')
  const switched = await page.evaluate(async (companyName) => {
    const csrf = ((await (await fetch('/api/auth/csrf')).json()) as { token: string }).token
    const session = (await (await fetch('/api/auth/session')).json()) as { memberships: { companyId: string; companyName: string }[] }
    const target = session.memberships.find((m) => m.companyName === companyName)!
    return (await fetch('/api/auth/switch-company', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ companyId: target.companyId }) })).status
  }, 'Neretva Rent')
  expect(switched).toBe(200)
  await openDocuments(page, 'Dino Neretvić')
  await page.getByRole('button', { name: 'Kimlik kartı ayrıntıları' }).click()
  const detail = page.getByRole('dialog', { name: 'Kimlik kartı' })
  await expect(detail.getByRole('button', { name: 'Ön yüz sürüm 1 görüntüle' })).toBeVisible()
  await expect(detail.getByRole('button', { name: /indir/i })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Numarayı göster' })).toHaveCount(0)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: path.join(import.meta.dirname, '..', 'screenshots', 'm2', '10-yonetici-ayrinti-1440.png') })
  await ctx.close()
})

test.describe('number check limit', () => {
  test.use({ storageState: authFile('adnan') })

  test('over the limit the form says why and how long to wait, and keeps what was typed (simulated 429)', async ({ page }) => {
    // The limit itself is tested against the database in the API tests; here only how the screen answers it.
    await page.route('**/api/customers/*/documents', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 429,
        headers: { 'retry-after': '420' },
        json: { error: { code: 'DOCUMENT_NUMBER_LIMIT', message: 'Kısa sürede çok sayıda belge numarası girildi. Güvenlik nedeniyle numara içeren işlemler geçici olarak durduruldu; yaklaşık 7 dakika sonra tekrar deneyin. Numarasız işlemler devam edebilir.', details: { retryAfterSeconds: 420 } } },
      })
    })
    await openDocuments(page, 'Emir Primjerović')
    await page.getByRole('button', { name: 'Belge ekle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Belge ekle' })
    await form.getByLabel('Belge türü').selectOption('passport')
    await form.getByLabel('Düzenleyen ülke').selectOption('BA')
    await form.getByLabel('Belge numarası').fill('TEST-LIMIT-1')
    await form.getByLabel('Son geçerlilik').fill('2034-03-01')
    await form.getByRole('button', { name: 'Belgeyi kaydet' }).click()
    await expect(form.getByText('yaklaşık 7 dakika sonra tekrar deneyin', { exact: false })).toBeVisible()
    await expect(form.getByLabel('Belge numarası')).toHaveValue('TEST-LIMIT-1')
    await expect(form).toBeVisible()
  })
})
