import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Müşteriler M1 user flows on the test database (synthetic customers from the guarded test seed).

async function openCustomer(page: Page, name: string, status?: 'archived' | 'all') {
  await page.goto(status ? `/musteriler?status=${status}` : '/musteriler')
  await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill(name)
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

/** Same-origin API call with the page's own session, as another browser tab of the same user would make it. */
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

  test('creates a customer: required fields are explained together, then the new file opens', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(form.getByText('Ad veya soyaddan en az birini girin')).toBeVisible()
    await expect(form.getByText('Telefon veya e-postadan en az birini girin')).toBeVisible()
    await expect(form.getByText('Yerli veya yabancı müşteri seçin')).toBeVisible()

    await form.locator('#givenName').fill('Elma')
    await form.locator('#familyName').fill('Akış Testi')
    await form.getByRole('radio', { name: /Yabancı/ }).check()
    await form.locator('#nationality').selectOption('HR')
    await form.locator('#phone').fill('061 444 321')
    await expect(form.getByText('Kaydedilecek biçim: +387 61 444 321')).toBeVisible()
    await form.locator('#email').fill('Elma.Akis@Example.test')
    await form.locator('#city').fill('Split')
    await form.locator('#addressCountry').selectOption('HR')
    await form.locator('#createdBranchId').selectOption({ label: 'Mostar' })
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()

    await expect(page.getByRole('heading', { name: 'Elma Akış Testi' })).toBeVisible()
    await expect(page.getByText(/^M-0000\d\d$/).first()).toBeVisible()
    await expect(page.getByText('Yabancı müşteri · Hırvatistan uyruklu · Mostar şubesinde açıldı')).toBeVisible()
    await expect(page.getByRole('link', { name: '+387 61 444 321' })).toHaveAttribute('href', 'tel:+38761444321')
    await expect(page.getByRole('link', { name: 'elma.akis@example.test' })).toBeVisible()
    await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
    await expect(page.getByText('Müşteri kaydı oluşturuldu')).toBeVisible()
  })

  test('a single-name person can be saved', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.locator('#givenName').fill('Tekisimli')
    await form.getByRole('radio', { name: /Yerli/ }).check()
    await form.locator('#email').fill('tekisimli@example.test')
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(page.getByRole('heading', { name: 'Tekisimli', exact: true })).toBeVisible()
  })

  test('the same phone shows the existing customer and the reason; saving needs an explicit decision', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.locator('#givenName').fill('Tarik')
    await form.locator('#familyName').fill('İkinci Kayıt')
    await form.getByRole('radio', { name: /Yerli/ }).check()
    await form.locator('#phone').fill('+387 61 000 110')
    const panel = form.getByRole('region', { name: 'Benzer müşteri kayıtları' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Tarik Testić')).toBeVisible()
    await expect(panel.getByText('M-000010')).toBeVisible()
    await expect(panel.getByText(/Aynı telefon/)).toBeVisible()
    await expect(panel.getByText('+387 61 000 110')).toHaveCount(0)
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(form.getByRole('alert')).toContainText('Benzer kayıtları kontrol edin')
    await expect(page.getByRole('heading', { name: 'Tarik İkinci Kayıt' })).toHaveCount(0)
    await panel.getByRole('checkbox', { name: /farklı bir kişi/ }).check()
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(page.getByRole('heading', { name: 'Tarik İkinci Kayıt' })).toBeVisible()
    await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
    await expect(page.getByText(/ayrı kişi olarak kaydedildi: M-000010/)).toBeVisible()
  })

  test('a name alone is never suggested as a duplicate', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.locator('#givenName').fill('Lena')
    await form.locator('#familyName').fill('Beispiel')
    await form.locator('#email').fill('baska.lena@example.test')
    await page.waitForTimeout(1200)
    await expect(form.getByRole('region', { name: 'Benzer müşteri kayıtları' })).toHaveCount(0)
  })

  test('searches by name, number and phone; the search text never appears in the address bar', async ({ page }) => {
    await page.goto('/musteriler')
    const box = page.getByRole('searchbox', { name: 'Müşterilerde ara' })
    await box.fill('primjerovic')
    await expect(page.getByRole('link', { name: 'Emir Primjerović' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toHaveCount(0)
    await box.fill('062 000 102')
    await expect(page.getByRole('link', { name: 'Emir Primjerović' })).toBeVisible()
    await box.fill('M-000003')
    await expect(page.getByRole('link', { name: 'Lena Beispiel' })).toBeVisible()
    await expect(page.getByText('1 müşteri').first()).toBeVisible()
    expect(page.url()).not.toMatch(/062|primjer|M-000003/i)
    await page.getByLabel('Yerli veya yabancı').selectOption('foreign')
    await expect(page).toHaveURL(/residency=foreign/)
    await box.fill('')
    await expect(page.getByRole('link', { name: 'John Sample' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toHaveCount(0)
  })

  test('sorting and paging stay in the address bar', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'No', exact: true }).click()
    await expect(page).toHaveURL(/sort=customerNo/)
    await expect(page.locator('tbody tr').first()).toContainText('M-000001')
    await page.getByRole('button', { name: 'No', exact: true }).click()
    await expect(page).toHaveURL(/dir=desc/)
    await expect(page.locator('tbody tr').first()).not.toContainText('M-000001')
  })

  test('edits with an unsaved-changes guard; a newer save from elsewhere is shown and can be loaded', async ({ page }) => {
    await openCustomer(page, 'Selin Deneme')
    await page.getByRole('button', { name: 'Düzenle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Müşteriyi düzenle' })
    await form.locator('#city').fill('İzmir Örnek')
    await page.keyboard.press('Escape')
    const ask = form.getByRole('alertdialog', { name: 'Kaydedilmemiş değişiklikler' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Devam et' }).click()
    await expect(form.locator('#city')).toHaveValue('İzmir Örnek')

    // Another tab of the same company saves first.
    const id = page.url().split('/musteriler/')[1]!.split('?')[0]!
    const current = await page.evaluate(async (id) => (await (await fetch(`/api/customers/${id}`)).json()) as Record<string, unknown>, id)
    const other = await apiAs(page, 'PUT', `/customers/${id}`, {
      givenName: current.givenName,
      familyName: current.familyName,
      residency: current.residency,
      nationality: current.nationality,
      phone: current.phoneRaw,
      preferredLanguage: current.preferredLanguage,
      region: 'Başka sekme',
      version: current.version,
    })
    expect(other.status).toBe(200)

    await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    const conflict = form.getByRole('alert').filter({ hasText: 'siz düzenlerken' })
    await expect(conflict).toBeVisible()
    await expect(conflict).toContainText('Bölge')
    await conflict.getByRole('button', { name: 'Güncel bilgileri yükle' }).click()
    await expect(form.locator('#region')).toHaveValue('Başka sekme')
    await expect(form.locator('#city')).toHaveValue('')
    await form.locator('#city').fill('İzmir Örnek')
    await form.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    await expect(form).toHaveCount(0)
    await expect(page.getByText('İzmir Örnek')).toBeVisible()
    await expect(page.getByText('Başka sekme')).toBeVisible()
  })

  test('archives with a reason and restores; nothing is deleted and the history shows both', async ({ page }) => {
    await openCustomer(page, 'Amra Demović')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Müşteriyi arşivle' }).click()
    const dialog = page.getByRole('dialog', { name: 'Müşteriyi arşivle' })
    await dialog.getByRole('button', { name: 'Arşivle' }).click()
    await expect(dialog.getByText('Arşivleme nedeni seçin')).toBeVisible()
    await dialog.getByLabel('Neden').selectOption('inactive')
    await dialog.getByRole('button', { name: 'Arşivle' }).click()
    await expect(page.getByText('Arşivdeki kayıt düzenlenemez')).toBeVisible()
    await expect(page.getByText('Artık müşteri değil')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0)

    await page.goto('/musteriler')
    await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill('Demović')
    await expect(page.getByText('Aramaya uyan müşteri yok')).toBeVisible()
    await page.getByLabel('Durum').selectOption('archived')
    await page.getByRole('link', { name: 'Amra Demović' }).click()
    await page.getByRole('button', { name: 'Arşivden çıkar' }).first().click()
    await expect(page.getByText('Etkin müşteri')).toBeVisible()
    await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
    await expect(page.getByText('Müşteri arşivlendi')).toBeVisible()
    await expect(page.getByText('Müşteri arşivden çıkarıldı')).toBeVisible()
    await expect(page.getByText('Neden: Artık müşteri değil')).toBeVisible()
  })

  test('Müşteri 360°: tabs without data say so and show no sample records', async ({ page }) => {
    await openCustomer(page, 'Kenan Örnek')
    await expect(page).toHaveURL(/\/musteriler\/[0-9a-f-]{36}$/)
    for (const [tab, module] of [
      ['Belgeler', 'Müşteri belgeleri (M2)'],
      ['Rezervasyonlar', 'Rezervasyonlar'],
      ['Kiralamalar', 'Kiralamalar'],
      ['Cari ve tahsilatlar', 'Finans'],
      ['Görevler ve olaylar', 'Görevler ve Olay Merkezi'],
    ] as const) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
      const panel = page.getByRole('tabpanel')
      await expect(panel.getByRole('heading', { name: `${tab} henüz bağlı değil` })).toBeVisible()
      await expect(panel.getByText(module, { exact: true })).toBeVisible()
      await expect(panel.locator('table')).toHaveCount(0)
    }
    await expect(page).toHaveURL(/sekme=gorevler/)
    await page.reload()
    await expect(page.getByRole('tab', { name: /Görevler ve olaylar/ })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Kayıt geçmişi' }).click()
    await expect(page.getByText('Kişisel bilgilerin eski ve yeni değerleri geçmişe kopyalanmaz')).toBeVisible()
  })
})

test.describe('access', () => {
  test('a branch-limited user finds customers opened in other branches', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile('selma'), viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
    const page = await ctx.newPage()
    await openCustomer(page, 'Tarik Testić')
    await expect(page.getByText('Mostar şubesinde açıldı', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Düzenle' }).first()).toBeVisible()
    await ctx.close()
  })

  test('another company cannot see the customer, even with its address', async ({ browser }) => {
    const owner = await browser.newContext({ storageState: authFile('adnan'), locale: 'tr-TR' })
    const ownerPage = await owner.newPage()
    await openCustomer(ownerPage, 'Ajla Testović')
    const url = ownerPage.url()
    await owner.close()

    const ctx = await browser.newContext({ storageState: authFile('lejla'), locale: 'tr-TR' })
    const page = await ctx.newPage()
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Müşteri bulunamadı' })).toBeVisible()
    await expect(page.getByText('Ajla Testović')).toHaveCount(0)
    await page.goto('/musteriler')
    await expect(page.getByRole('link', { name: 'Dino Neretvić' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toHaveCount(0)
    await ctx.close()
  })

  test('1440 and 768: no sideways scrolling on the list and the file', async ({ browser }) => {
    for (const width of [1440, 768]) {
      const ctx = await browser.newContext({ storageState: authFile('adnan'), viewport: { width, height: 900 }, locale: 'tr-TR' })
      const page = await ctx.newPage()
      await page.goto('/musteriler')
      await expect(page.getByRole('link', { name: 'Ajla Testović' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await page.getByRole('link', { name: 'Ajla Testović' }).click()
      await expect(page.getByRole('heading', { name: 'Ajla Testović' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await ctx.close()
    }
  })
})
