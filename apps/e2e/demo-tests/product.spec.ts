import { expect, test, type Page } from '@playwright/test'
import { MENU_ROUTES, openDemo, switchUser, watch } from './fixtures'

// The V1 product structure as a person meets it: working profiles, My Work parity with Home, the two reservation actions,
// users and roles, the first-run wizard, finance stages and the branch cash day-end. Everything runs in the browser demo only.

const sidebarLinks = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')

const count = async (page: Page, re: RegExp) => Number(re.exec((await page.locator('main').innerText()).replace(/\s+/g, ' '))?.[1] ?? '-1')

test.describe('menu profiles', () => {
  test('Advanced shows all 21 links; Simple shows 16 and nothing is locked: hidden screens open from the user menu and by address', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    await expect(sidebarLinks(page)).toHaveCount(MENU_ROUTES.length) // the demo company starts on the Advanced profile with three branches
    await openDemo(page, '/ayarlar?bolum=calisma')
    await page.getByRole('radio', { name: /^Sade/ }).check()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Çalışma profili kaydedildi').first()).toBeVisible()
    await expect(sidebarLinks(page)).toHaveCount(16)
    for (const gone of ['Onay Merkezi', 'Şube Kasaları', 'İşlem Geçmişi', 'Kurumsal Hesaplar'])
      await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: gone })).toHaveCount(0)
    // work is not locked: the hidden screens stay reachable by address and from the user menu
    await openDemo(page, '/onay-merkezi')
    await expect(page.getByRole('heading', { name: 'Onay Merkezi' }).first()).toBeVisible()
    await page.getByRole('button', { name: /Demo kullanıcısı/ }).click()
    await expect(page.getByRole('menuitem', { name: /İşlem Geçmişi/ })).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })
})

test.describe('My Work', () => {
  test('the counter on Home equals the list on My Work for the owner and for Operations', async ({ page }) => {
    await openDemo(page, '/')
    const home = await count(page, /Bana düşen işler (\d+)/)
    await openDemo(page, '/islerim')
    expect(await count(page, /Bana Düşenler ?(\d+)/)).toBe(home)
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/')
    const homeOps = await count(page, /Bana düşen işler (\d+)/)
    await openDemo(page, '/islerim')
    expect(await count(page, /Bana Düşenler ?(\d+)/)).toBe(homeOps)
  })
  test('approvals appear in My Work only as the six formal types: no seventh type is invented', async ({ page }) => {
    await openDemo(page, '/islerim?sekme=bana&tur=approval')
    await expect(page.getByRole('heading', { name: 'İşlerim' })).toBeVisible()
    await expect(page.getByText(/Ek onay tipi|Yedinci/i)).toHaveCount(0)
  })
})

test.describe('reservations', () => {
  test('two actions: Bekleyen Kaydet holds nothing, Kontrol Et ve Onayla needs a specific vehicle', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar/yeni?musteri=c3')
    await expect(page.getByText('Bu kayıt henüz belirli bir aracı ayırmaz').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bekleyen Kaydet' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Kontrol Et ve Onayla' })).toBeDisabled()
    await page.getByRole('button', { name: 'Bekleyen Kaydet' }).click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await expect(page.getByText('Bekliyor').first()).toBeVisible()
  })
  test('a customer can be added from the reservation form without leaving it', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar/yeni')
    await page.getByRole('button', { name: 'Yeni müşteri ekle' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /Vazgeç|Kapat/ }).first().click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/yeni/)
  })
})

test.describe('users and roles', () => {
  test('an invitation is only a record in the demo; the role tab lists the four roles', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/kullanicilar')
    await page.getByRole('button', { name: 'Kullanıcı davet et' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByText('e-posta gönderilmez, hesap açılmaz')).toBeVisible()
    await dlg.getByLabel(/Ad soyad/).fill('Test Davetli')
    await dlg.getByLabel(/E-posta/).fill('davetli@adriatic-demo.example')
    await dlg.getByRole('button', { name: 'Davet kaydı oluştur' }).click()
    await expect(page.getByText('Davet kaydı oluşturuldu (e-posta gönderilmedi).').first()).toBeVisible()
    await openDemo(page, '/kullanicilar?sekme=roller')
    for (const role of ['Sahip', 'Yönetici', 'Operasyon', 'Muhasebe']) await expect(page.getByText(role).first()).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })
})

test.describe('first-run wizard', () => {
  test('nine steps with back and forward, validation, persistence across a reload and a readiness check that never shows operator work as done', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/kurulum')
    await page.getByRole('button', { name: 'Sihirbazı yeniden başlat' }).click()
    const steps = page.getByRole('navigation', { name: 'Kurulum adımları' })
    await expect(steps).toBeVisible()
    await expect(page.getByText('Demo ön izlemesi').first()).toBeVisible()
    // step 1 validation: an empty trade name keeps the person on the step
    const name = page.getByLabel(/Ticari ad/)
    const original = await name.inputValue()
    await name.fill('')
    await page.getByRole('button', { name: 'İleri' }).click()
    await expect(page.getByRole('button', { name: 'Geri' })).toBeDisabled()
    await name.fill(original || 'Adriatic Demo Rent')
    await page.getByRole('button', { name: 'İleri' }).click()
    await expect(page.getByRole('button', { name: 'Geri' })).toBeEnabled()
    // forward to the end, back one step, forward again
    for (let i = 0; i < 7; i++) {
      // the contract step wants the legal review acknowledged: the demo never marks it as done
      const ack = page.getByRole('checkbox', { name: /Hukuki incelemenin ayrıca/ })
      if (await ack.count()) await ack.check()
      await page.getByRole('button', { name: 'İleri' }).click()
    }
    await expect(page.getByRole('heading', { name: /9\. Hazırlık kontrolü/ })).toBeVisible()
    await page.getByRole('button', { name: 'Geri' }).click()
    await expect(page.getByRole('heading', { name: /8\. Ödeme ve iptal politikası/ })).toBeVisible()
    await page.getByRole('button', { name: 'İleri' }).click()
    // reload keeps the step
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /9\. Hazırlık kontrolü/ })).toBeVisible()
    // server and legal items are never "done" in the demo
    await expect(page.getByText('Sistem yöneticisi işlemi').first()).toBeVisible()
    await expect(page.getByText('Müşteri kimlik verisi şifreleme anahtarı')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kurulumu tamamla' })).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })
})

test.describe('wizard in English', () => {
  test('validation messages follow the language: no raw or Turkish text at the contract step', async ({ page }) => {
    await openDemo(page, '/kurulum')
    await page.getByRole('button', { name: 'Sihirbazı yeniden başlat' }).click()
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: /7. Contract/ })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Confirm that the legal review is done separately')).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(/[⁡⁢⁣]/) // no bilingual markers leak into the text
  })
})

test.describe('finance stages and branch cash', () => {
  test('the Advances tab keeps the advance ledger apart from revenue: a held 200 EUR advance shows the policy fee that would apply', async ({ page }) => {
    await openDemo(page, '/finans?sekme=kaparo')
    const card = page.getByTestId('advance-T-000041')
    await expect(card.getByRole('list', { name: 'Kaparo defteri' })).toBeVisible()
    await expect(card).toContainText('200,00 EUR')
    await expect(card).toContainText('İptal edilirse otomatik hesaplanır: 50,00 EUR')
    await expect(card).toContainText('Rezervasyonda tutuluyor; henüz hiçbir hesap kalemine uygulanmadı.')
    await expect(page.getByText('gelir değildir').first()).toBeVisible()
  })
  test('the Attention tab is the old revenue-control screen and the old address lands there', async ({ page }) => {
    await openDemo(page, '/gelir-kontrolu')
    await expect(page).toHaveURL(/\/finans\?sekme=dikkat/)
    await expect(page.getByRole('tab', { name: 'Dikkat' })).toHaveAttribute('aria-selected', 'true')
  })
  test('the day-end summary names what blocks the day and never adds currencies together', async ({ page }) => {
    await openDemo(page, '/sube-kasalari?sekme=gunsonu')
    await expect(page.getByRole('tab', { name: 'Gün sonu özeti' })).toHaveAttribute('aria-selected', 'true')
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    expect(text).toContain('Gün sonu kontrolü')
    expect(text).toMatch(/kasa hâlâ açık: sayıp kapatın/)
    expect(text).not.toMatch(/Toplam \(tüm para birimleri\)/)
  })
  test('Masraflar: an expense belongs to a branch, a vehicle or the business; maintenance and fine costs come from their source records only', async ({ page }) => {
    await openDemo(page, '/masraflar')
    await page.getByRole('button', { name: 'Masraf ekle' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    const link = dlg.getByLabel('Neye ait')
    for (const option of ['Şubeyle ilişkili', 'Araçla ilişkili', 'Genel işletme masrafı']) await expect(link.getByRole('option', { name: option })).toHaveCount(1)
    await expect(dlg.getByText('Kaynak işlemden gelen masraflar (bakım, ceza) buradan eklenmez.')).toBeVisible()
  })
})

test.describe('maturity labels', () => {
  test('every menu screen says once, at page level, whether it is real, partly real or a demo concept', async ({ page }) => {
    await openDemo(page, '/')
    for (const route of MENU_ROUTES) {
      await openDemo(page, route)
      const badge = page.getByTestId('maturity-badge')
      await expect(badge, route).toBeVisible()
      await expect(badge, route).toHaveText(/Gerçek sistemde mevcut|Kısmen gerçek|Demo konsepti · V1 hedefi/)
    }
  })
})
