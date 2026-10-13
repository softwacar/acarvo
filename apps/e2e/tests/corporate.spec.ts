import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// M3 Kurumsal Hesaplar on the test database (synthetic accounts from the guarded test seed).

async function openAccount(page: Page, name: string, status?: 'archived' | 'all') {
  await page.goto(status ? `/kurumsal-hesaplar?status=${status}` : '/kurumsal-hesaplar')
  await page.getByRole('searchbox', { name: 'Kurumsal hesaplarda ara' }).fill(name)
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

/** Same-origin API call with the page's own session (another tab of the same user). */
async function apiAs(page: Page, method: 'POST' | 'PUT', path: string, body: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf = ((await (await fetch('/api/auth/csrf')).json()) as { token: string }).token
      const res = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    },
    { method, path, body },
  )
}

test.describe('as the owner', () => {
  test.use({ storageState: authFile('adnan') })

  test('list: active accounts with tax id, contact and people; search by tax id; archived on request', async ({ page }) => {
    await page.goto('/kurumsal-hesaplar')
    const row = page.getByRole('row', { name: /Örnek Lojistik d\.o\.o\./ })
    await expect(row).toContainText('K-00001')
    await expect(row).toContainText('TEST-PDV-200501')
    await expect(row).toContainText('3 kişi · 2 sürücü')
    await page.getByRole('searchbox', { name: 'Kurumsal hesaplarda ara' }).fill('200502')
    await expect(page.getByRole('link', { name: 'Primjer Turizam d.o.o.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toHaveCount(0)
    // The search text never reaches the address bar.
    expect(page.url()).not.toContain('200502')
    await page.getByRole('searchbox', { name: 'Kurumsal hesaplarda ara' }).fill('')
    await page.getByLabel('Durum').selectOption('archived')
    await expect(page.getByRole('link', { name: 'Stara Firma d.o.o.' })).toBeVisible()
  })

  test('creates an account: required fields explained, duplicate tax id needs a decision, then the 360° opens', async ({ page }) => {
    await page.goto('/kurumsal-hesaplar')
    await page.getByRole('button', { name: 'Yeni kurumsal hesap' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni kurumsal hesap' })
    await form.getByRole('button', { name: 'Hesabı kaydet' }).click()
    await expect(form.getByText('Resmi unvanı girin')).toBeVisible()
    await form.getByLabel('Resmi unvan').fill('Akış Testi Turizam d.o.o.')
    await form.getByLabel('Telefon').fill('033 000 909')
    await expect(form.getByText('Kaydedilecek biçim: +387 33 000 909')).toBeVisible()
    await form.getByLabel('Açık adres').fill('Test Sokak 9')
    await form.getByLabel('Şehir').fill('Sarajevo')
    await form.getByLabel('Tür', { exact: true }).fill('PDV')
    await form.locator('#taxValue').fill('TEST-PDV-200502')
    const panel = form.getByRole('region', { name: 'Benzer kurumsal hesaplar' })
    await expect(panel).toContainText('Primjer Turizam d.o.o.')
    await expect(panel).toContainText('Aynı vergi kimliği')
    await form.getByRole('button', { name: 'Hesabı kaydet' }).click()
    await expect(form.getByRole('alert')).toContainText('Benzer hesapları kontrol edin')
    await panel.getByLabel('Kontrol ettim; bu ayrı bir hesap, yine de kaydet').check()
    await form.getByRole('button', { name: 'Hesabı kaydet' }).click()
    await expect(page.getByRole('heading', { name: 'Akış Testi Turizam d.o.o.' })).toBeVisible()
    await expect(page.getByText('K-0000', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '+387 33 000 909' }).first()).toBeVisible()
    // Reservations (V1) and rentals (Rentals V1) are real; finance still says it is not connected.
    await page.getByRole('tab', { name: 'Rezervasyonlar' }).click()
    await expect(page.getByText('Bu kurumsal hesapla yapılmış rezervasyon yok.')).toBeVisible()
    await page.getByRole('tab', { name: 'Kiralamalar' }).click()
    await expect(page.getByText('Bu kurumsal hesapla yapılmış kiralama yok.')).toBeVisible()
    for (const tab of ['Cari / Finans']) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('heading', { name: `${tab} henüz bağlı değil` })).toBeVisible()
    }
  })

  test('360°: addresses with one primary per kind, tax ids with hints, channels; removal keeps history', async ({ page }) => {
    await openAccount(page, 'Muster Consulting GmbH')
    await page.getByRole('tab', { name: /^Adresler/ }).click()
    await page.getByRole('button', { name: 'Adres ekle' }).click()
    let sheet = page.getByRole('dialog', { name: 'Adres ekle' })
    await sheet.getByLabel('Açık adres').fill('Rechnungsweg 7')
    await sheet.getByLabel('Şehir').fill('Berlin')
    await sheet.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Rechnungsweg 7')).toBeVisible()
    // The first billing address became primary on its own; a second one is made primary explicitly.
    await page.getByRole('button', { name: 'Adres ekle' }).click()
    sheet = page.getByRole('dialog', { name: 'Adres ekle' })
    await sheet.getByLabel('Açık adres').fill('Zweite Straße 2')
    await sheet.getByLabel('Şehir').fill('Hamburg')
    await sheet.getByText('Birincil yap').click()
    await sheet.getByRole('button', { name: 'Kaydet' }).click()
    const billing = page.locator('li', { hasText: 'Zweite Straße 2' })
    await expect(billing).toContainText('Birincil')
    await expect(page.locator('li', { hasText: 'Rechnungsweg 7' })).not.toContainText('Birincil')
    await page.getByRole('button', { name: 'Fatura adresi Hamburg kaldır' }).click()
    await expect(page.getByRole('dialog', { name: 'Adresi kaldır' })).toContainText('en eski kayıt birincil yapılır')
    await page.getByRole('dialog', { name: 'Adresi kaldır' }).getByRole('button', { name: 'Kaldır' }).click()
    await expect(page.locator('li', { hasText: 'Rechnungsweg 7' })).toContainText('Birincil')

    await page.getByRole('tab', { name: /^Vergi bilgileri/ }).click()
    await page.getByRole('button', { name: 'Vergi kimliği ekle' }).click()
    sheet = page.getByRole('dialog', { name: 'Vergi kimliği ekle' })
    await sheet.locator('#tax-scheme').fill('VAT')
    await sheet.locator('#tax-value').fill('ATU12345678')
    await expect(sheet.getByText('Baştaki ülke kodu seçilen ülkeyle uyuşmuyor olabilir', { exact: false })).toBeVisible()
    await sheet.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('ATU12345678')).toBeVisible()
    await expect(page.getByText('(yalnız uyarı)')).toBeVisible()

    await page.getByRole('tab', { name: 'Geçmiş' }).click()
    await expect(page.getByText('Adres kaldırıldı')).toBeVisible()
    await expect(page.getByText('Vergi kimliği eklendi')).toBeVisible()
    await expect(page.getByRole('tabpanel')).not.toContainText('ATU12345678')
    await expect(page.getByRole('tabpanel')).not.toContainText('Rechnungsweg')
  })

  test('people: link an existing customer with several roles, change roles, end the link; the customer file shows the links', async ({ page }) => {
    await openAccount(page, 'Örnek Lojistik d.o.o.')
    await page.getByRole('tab', { name: /^Kişiler/ }).click()
    await expect(page.getByText('Ajla Testović')).toBeVisible()
    await page.getByRole('button', { name: 'Kişi bağla' }).click()
    const sheet = page.getByRole('dialog', { name: 'Kişi bağla' })
    await sheet.getByLabel('Müşterilerde ara').fill('Ajla')
    await expect(sheet.getByRole('button', { name: /Ajla Testović.*Zaten bağlı/ })).toBeDisabled()
    await sheet.getByLabel('Müşterilerde ara').fill('Nina Probna')
    await sheet.getByRole('button', { name: /Nina Probna/ }).click()
    await sheet.getByRole('button', { name: 'Bağla' }).click()
    await expect(sheet.getByText('En az bir rol seçin')).toBeVisible()
    await sheet.getByLabel('İletişim kişisi').check()
    await sheet.getByLabel('Rezervasyon sorumlusu').check()
    await sheet.getByLabel('Görevi').fill('Satın alma')
    await sheet.getByRole('button', { name: 'Bağla' }).click()
    const row = page.locator('li', { hasText: 'Nina Probna' })
    await expect(row).toContainText('İletişim kişisi')
    await expect(row).toContainText('Rezervasyon sorumlusu')
    await row.getByRole('button', { name: 'Nina Probna rollerini düzenle' }).click()
    const edit = page.getByRole('dialog', { name: 'Kişinin rollerini düzenle' })
    await edit.getByLabel('Yetkili sürücü').check()
    await edit.getByRole('button', { name: 'Kaydet' }).click()
    await expect(row).toContainText('Yetkili sürücü')
    await page.getByRole('tab', { name: /^Sürücüler/ }).click()
    await expect(page.locator('li', { hasText: 'Nina Probna' })).toContainText('Ehliyet kaydı yok')
    await expect(page.locator('li', { hasText: 'Ajla Testović' })).toContainText('Ehliyet süresi yaklaşıyor')
    await page.locator('li', { hasText: 'Nina Probna' }).getByRole('button', { name: 'Sona erdir' }).click()
    const end = page.getByRole('dialog', { name: 'İlişkiyi sona erdir' })
    await expect(end).toContainText('müşteri kaydı silinmez')
    await end.getByLabel('Neden').selectOption('left_company')
    await end.getByRole('button', { name: 'Sona erdir' }).click()
    await page.getByRole('button', { name: /Önceki ilişkiler/ }).click()
    await expect(page.locator('li', { hasText: 'Nina Probna' })).toContainText('Şirketten ayrıldı')
    // The person's file: still active, with the account in its corporate links.
    await page.locator('li', { hasText: 'Ajla Testović' }).getByRole('link', { name: 'Ajla Testović' }).click()
    await expect(page.getByRole('heading', { name: 'Ajla Testović' })).toBeVisible()
    const links = page.getByRole('region', { name: 'Kurumsal ilişkiler' })
    await expect(links).toContainText('Örnek Lojistik d.o.o.')
    await expect(links).toContainText('Primjer Turizam d.o.o.')
    await expect(links).toContainText('Rezervasyon sorumlusu')
  })

  test('a person who is not on file yet is opened as a customer from the link panel, then linked', async ({ page }) => {
    await openAccount(page, 'Primjer Turizam d.o.o.')
    await page.getByRole('tab', { name: /^Sürücüler/ }).click()
    await page.getByRole('button', { name: 'Sürücü bağla' }).click()
    const sheet = page.getByRole('dialog', { name: 'Kişi bağla' })
    await sheet.getByLabel('Müşterilerde ara').fill('Yeni Sürücü Akış')
    await expect(sheet.getByText('Bu aramaya uyan etkin müşteri yok.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Kişi kayıtlı değil: yeni müşteri kaydı aç' }).click()
    const customer = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await customer.locator('#givenName').fill('Yeni Sürücü')
    await customer.locator('#familyName').fill('Akış')
    await customer.locator('#email').fill('yeni.surucu.akis@example.test')
    await customer.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(sheet.getByText('Yeni Sürücü Akış')).toBeVisible()
    await expect(sheet.getByLabel('Yetkili sürücü')).toBeChecked()
    await sheet.getByRole('button', { name: 'Bağla' }).click()
    await expect(page.locator('li', { hasText: 'Yeni Sürücü Akış' })).toContainText('Yetkili sürücü')
  })

  test('archive with a reason keeps people; restore with a reason', async ({ page }) => {
    await openAccount(page, 'Primjer Turizam d.o.o.')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Hesabı arşivle' }).click()
    const dialog = page.getByRole('dialog', { name: 'Kurumsal hesabı arşivle' })
    await dialog.getByRole('button', { name: 'Arşivle' }).click()
    await expect(dialog.getByText('Bir neden seçin')).toBeVisible()
    await dialog.getByLabel('Neden').selectOption('inactive')
    await dialog.getByRole('button', { name: 'Arşivle' }).click()
    await expect(page.getByText('Arşivdeki hesap düzenlenemez; kişi bağlantıları ve müşteri kayıtları korunur.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Arşivden çıkar' }).click()
    const restore = page.getByRole('dialog', { name: 'Arşivden çıkar' })
    await restore.getByLabel('Neden').selectOption('archived_by_mistake')
    await restore.getByRole('button', { name: 'Arşivden çıkar' }).click()
    await expect(page.getByText('Etkin kurumsal hesap')).toBeVisible()
    await page.getByRole('tab', { name: 'Geçmiş' }).click()
    await expect(page.getByText('Neden: Yanlışlıkla arşivlenmişti')).toBeVisible()
  })

  test('unsaved changes are not lost silently; a version conflict offers to reload', async ({ page }) => {
    await openAccount(page, 'Muster Consulting GmbH')
    await page.getByRole('button', { name: 'Düzenle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Kurumsal hesabı düzenle' })
    await form.getByLabel('Kısa / görünen ad').fill('Muster')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog', { name: 'Kaydedilmemiş değişiklikler' })).toBeVisible()
    await page.getByRole('button', { name: 'Devam et' }).click()
    const id = page.url().split('/').pop()!.split('?')[0]!
    const current = (await page.evaluate(async (id) => (await (await fetch(`/api/corporate-accounts/${id}`)).json()) as { version: number }, id)).version
    expect((await apiAs(page, 'PUT', `/corporate-accounts/${id}`, { legalName: 'Muster Consulting GmbH', country: 'DE', note: 'Başka sekmeden', version: current })).status).toBe(200)
    await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    await expect(form.getByRole('alert')).toContainText('Bu hesap siz düzenlerken')
    await expect(form.getByRole('alert')).toContainText('Not')
    await form.getByRole('button', { name: 'Güncel bilgileri yükle' }).click()
    await expect(form.getByLabel('Not')).toHaveValue('Başka sekmeden')
  })

  test('768 and 390: list, 360° tabs and panels without sideways scrolling', async ({ page }) => {
    for (const [w, h] of [
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/kurumsal-hesaplar')
      await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' }).click()
      await expect(page.getByRole('heading', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      for (const tab of [/^Adresler/, /^Vergi bilgileri/, /^Kişiler/, /^Sürücüler/, 'Geçmiş']) {
        await page.getByRole('tab', { name: tab }).click()
        await expectNoHorizontalOverflow(page)
      }
      await page.getByRole('tab', { name: /^Kişiler/ }).click()
      await page.getByRole('button', { name: 'Kişi bağla' }).click()
      const sheet = page.getByRole('dialog', { name: 'Kişi bağla' })
      if (w === 390) expect(Math.round((await sheet.boundingBox())!.width)).toBe(390)
      await expect(sheet.getByRole('button', { name: 'Bağla' })).toBeInViewport()
      await expectNoHorizontalOverflow(page)
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('as operations (read only)', () => {
  test.use({ storageState: authFile('selma') })

  test('sees accounts and people, cannot create, edit, link or archive', async ({ page }) => {
    await page.goto('/kurumsal-hesaplar')
    await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yeni kurumsal hesap' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' }).click()
    await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0)
    await page.getByRole('tab', { name: /^Kişiler/ }).click()
    await expect(page.getByText('Ajla Testović')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kişi bağla' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sona erdir' })).toHaveCount(0)
  })
})

test.describe('another company', () => {
  test.use({ storageState: authFile('lejla') })

  test('a real Drina account address opens as "not found" in Neretva', async ({ page, browser }) => {
    // The id is read with the Drina owner's session, then opened with Lejla's.
    const drina = await browser.newContext({ storageState: authFile('adnan') })
    const drinaPage = await drina.newPage()
    await drinaPage.goto('/kurumsal-hesaplar')
    const drinaId = await drinaPage.evaluate(async () => {
      const csrf = ((await (await fetch('/api/auth/csrf')).json()) as { token: string }).token
      const res = await fetch('/api/corporate-accounts/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ q: 'K-00001' }) })
      return ((await res.json()) as { items: { id: string }[] }).items[0]!.id
    })
    await drina.close()
    await page.goto('/kurumsal-hesaplar')
    await expect(page.getByRole('link', { name: 'Neretva Örnek Trgovina d.o.o.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' })).toHaveCount(0)
    await page.goto(`/kurumsal-hesaplar/${drinaId}`)
    await expect(page.getByRole('heading', { name: 'Kurumsal hesap bulunamadı' })).toBeVisible()
    await expect(page.getByText('Örnek Lojistik')).toHaveCount(0)
  })
})
