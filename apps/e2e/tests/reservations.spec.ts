import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Reservations V1 on the test database (synthetic reservations from the guarded test seed).

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

async function openReservation(page: Page, no: string, status?: string) {
  await page.goto(status ? `/rezervasyonlar?status=${status}` : '/rezervasyonlar')
  await page.getByRole('searchbox', { name: 'Rezervasyonlarda ara' }).fill(no)
  await page.getByRole('row', { name: new RegExp(no) }).getByRole('link').first().click()
  await expect(page.getByText(no).first()).toBeVisible()
}

async function pickCustomer(page: Page, search: string, name: string) {
  await page.getByLabel('Müşteri', { exact: true }).fill(search)
  await page.getByRole('list', { name: 'Müşteri: sonuçlar' }).getByRole('button', { name: new RegExp(name) }).click()
}

test.describe('as the owner', () => {
  test.use({ storageState: authFile('adnan') })

  test('list: active reservations by pickup with vehicle, branch and status; search; cancelled on request; timeline', async ({ page }) => {
    await page.goto('/rezervasyonlar')
    const row = page.getByRole('row', { name: /R-000003/ })
    await expect(row).toContainText('Lena Beispiel')
    await expect(row).toContainText('E45-M-218')
    await expect(row).toContainText('Onaylı')
    await expect(page.getByRole('row', { name: /R-000002/ })).toContainText('Araç atanmadı')
    await page.getByRole('searchbox', { name: 'Rezervasyonlarda ara' }).fill('a12-k')
    await expect(page.getByRole('row', { name: /R-000001/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /R-000003/ })).toHaveCount(0)
    expect(page.url()).not.toContain('a12')
    await page.getByRole('searchbox', { name: 'Rezervasyonlarda ara' }).fill('')
    await page.getByLabel('Durum').selectOption('cancelled')
    await expect(page.getByRole('row', { name: /R-000004/ })).toContainText('İptal edildi')
    await page.getByRole('tab', { name: 'Zaman çizelgesi' }).click()
    await expect(page.getByRole('link', { name: 'R-000001, Onaylı' })).toBeVisible()
    await expect(page.getByText('Bekleyen (aracı tutmaz)')).toBeVisible()
  })

  test('creates a confirmed reservation end to end: customer, driver, plan, available vehicle, confirm; the 360° shows it', async ({ page }) => {
    await page.goto('/rezervasyonlar/yeni')
    await page.getByRole('button', { name: 'Rezervasyon oluştur' }).click()
    await expect(page.getByRole('alert')).toContainText('Eksik alanları tamamlayın')
    await pickCustomer(page, 'Nina', 'Nina Probna')
    await expect(page.getByRole('region', { name: 'Sürücüler' })).toContainText('Ana sürücü')
    await page.getByLabel('Alış tarih ve saati').fill(`${day(30)}T09:00`)
    await page.getByLabel('İade tarih ve saati').fill(`${day(33)}T09:00`)
    await page.getByLabel('Araç sınıfı').selectOption({ label: 'Orta' })
    const vehicles = page.getByRole('radiogroup', { name: 'Araç seçimi' })
    await expect(vehicles).toContainText('Kesin kapasite değildir')
    await vehicles.getByRole('radio', { name: /A12-K-345/ }).check()
    await expect(page.getByRole('complementary', { name: 'Rezervasyon özeti' })).toContainText('3 gün')
    await page.getByLabel('Rezervasyon kaynağı').selectOption('phone')
    await page.getByText('Onaylı olarak oluştur').click()
    await page.getByRole('button', { name: 'Rezervasyon oluştur' }).click()
    await expect(page.getByRole('heading', { name: 'Nina Probna' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('Onaylı')
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('A12-K-345')
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('Hesaplanmadı')
    await page.getByRole('tab', { name: 'Durum geçmişi' }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Onaylı')
  })

  test('a busy vehicle cannot be chosen; a class-only reservation stays pending until a vehicle is assigned, then it is confirmed', async ({ page }) => {
    await openReservation(page, 'R-000001')
    const r1Pickup = await page.getByRole('region', { name: 'Rezervasyon özeti' }).locator('p.tnum').first().innerText()
    expect(r1Pickup).toContain('10:00')
    await page.goto('/rezervasyonlar/yeni')
    await pickCustomer(page, 'Tarik', 'Tarik Testić')
    // Same days as R-000001 (seed: day +2 10:00 to day +5 10:00 company time).
    await page.getByLabel('Alış tarih ve saati').fill(`${day(3)}T10:00`)
    await page.getByLabel('İade tarih ve saati').fill(`${day(4)}T10:00`)
    await page.getByLabel('Araç sınıfı').selectOption({ label: 'Orta' })
    const busy = page.getByRole('radiogroup', { name: 'Araç seçimi' }).getByRole('radio', { name: /A12-K-345/ })
    await expect(busy).toBeDisabled()
    await expect(page.getByRole('radiogroup', { name: 'Araç seçimi' })).toContainText('Dolu: R-000001')
    await page.getByLabel('Rezervasyon kaynağı').selectOption('direct_walk_in')
    await page.getByRole('button', { name: 'Rezervasyon oluştur' }).click()
    const header = page.getByRole('region', { name: 'Rezervasyon özeti' })
    await expect(header).toContainText('Bekleyen')
    await expect(page.getByRole('list', { name: 'Uyarılar' })).toContainText('Onaylamak için belirli bir araç atayın')
    await expect(page.getByRole('button', { name: 'Onayla' })).toBeDisabled()
    await page.getByRole('link', { name: 'Düzenle' }).click()
    // The first enabled vehicle (index 0 is "class only").
    await page.getByRole('radiogroup', { name: 'Araç seçimi' }).locator('input[name="vehicle"]:not([disabled])').nth(1).check()
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    await expect(header).toContainText('Bekleyen')
    await page.getByRole('button', { name: 'Onayla' }).click()
    await expect(header).toContainText('Onaylı')
  })

  test('daylight saving: a skipped time is refused in the form; a doubled time asks which one', async ({ page }) => {
    await page.goto('/rezervasyonlar/yeni')
    await page.getByLabel('Alış tarih ve saati').fill('2027-03-28T02:30')
    await expect(page.getByText('yaz saatine geçişte saatler ileri alındı', { exact: false })).toBeVisible()
    await page.getByLabel('Alış tarih ve saati').fill('2026-10-25T02:30')
    await expect(page.getByText('Bu saat kış saatine geçişte iki kez yaşanıyor. Hangisi?')).toBeVisible()
    await page.getByLabel('İkincisi (kış saati)').check()
    await expect(page.getByLabel('İkincisi (kış saati)')).toBeChecked()
  })

  test('cancel with a reason keeps the record; no-show only after pickup; the history shows who and why', async ({ page }) => {
    await openReservation(page, 'R-000002')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: 'Rezervasyonu iptal et' }).click()
    const dialog = page.getByRole('dialog', { name: 'Rezervasyonu iptal et' })
    await dialog.getByRole('button', { name: 'İptal et' }).click()
    await expect(dialog.getByText('Bir neden seçin')).toBeVisible()
    await dialog.getByLabel('Neden').selectOption('customer_request')
    await dialog.getByLabel('Not (isteğe bağlı)').fill('Müşteri telefonla iptal etti')
    await dialog.getByRole('button', { name: 'İptal et' }).click()
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('İptal edildi')
    await expect(page.getByText('Neden: Müşterinin talebi', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Düzenle' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'İşlem geçmişi' }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Rezervasyon iptal edildi')

    await openReservation(page, 'R-000005')
    await page.getByRole('button', { name: 'Diğer işlemler' }).click()
    await page.getByRole('menuitem', { name: /Gelmedi olarak işaretle/ }).click()
    const ns = page.getByRole('dialog', { name: 'Gelmedi olarak işaretle' })
    await expect(ns).toContainText('otomatik ücret eklenmez')
    await ns.getByLabel('Neden').selectOption('unreachable')
    await ns.getByRole('button', { name: 'Gelmedi olarak işaretle' }).click()
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('Gelmedi')
  })

  test('customer, corporate account and vehicle 360° show their reservations', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill('Lena Beispiel')
    await page.getByRole('link', { name: 'Lena Beispiel', exact: true }).click()
    await page.getByRole('tab', { name: 'Rezervasyonlar' }).click()
    await expect(page.getByRole('link', { name: /R-000003/ })).toBeVisible()
    await page.goto('/kurumsal-hesaplar')
    await page.getByRole('link', { name: 'Örnek Lojistik d.o.o.' }).click()
    await page.getByRole('tab', { name: 'Rezervasyonlar' }).click()
    await expect(page.getByRole('link', { name: /R-000003/ })).toBeVisible()
    await page.getByRole('link', { name: /R-000003/ }).click()
    await expect(page.getByRole('heading', { name: 'Lena Beispiel' })).toBeVisible()
    await page.getByRole('tab', { name: 'Araç' }).click()
    await page.getByRole('link', { name: 'E45-M-218' }).click()
    await page.getByRole('tab', { name: /Müsaitlik/ }).click()
    await expect(page.getByRole('link', { name: /R-000003/ })).toBeVisible()
  })

  test('768 and 390: list, timeline, form and 360° without sideways scrolling', async ({ page }) => {
    for (const [w, h] of [
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/rezervasyonlar')
      await expect(page.getByRole('link', { name: 'Lena Beispiel' }).first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await page.getByRole('tab', { name: 'Zaman çizelgesi' }).click()
      await expect(page.getByRole('region', { name: 'Araç zaman çizelgesi' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await page.goto('/rezervasyonlar/yeni')
      await expect(page.getByRole('button', { name: 'Rezervasyon oluştur' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await openReservation(page, 'R-000003')
      await expectNoHorizontalOverflow(page)
      for (const tab of ['Kişiler', 'Araç', 'Durum geçmişi', 'İşlem geçmişi', 'Fiyat ve kiralama']) {
        await page.getByRole('tab', { name: tab }).click()
        await expectNoHorizontalOverflow(page)
      }
    }
  })
})

test.describe('branch-limited operations user', () => {
  test.use({ storageState: authFile('selma') })

  test('sees reservations of her branch only and starts new ones only there', async ({ page }) => {
    await page.goto('/rezervasyonlar?status=all')
    await expect(page.getByRole('row', { name: /R-000003/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /R-000002/ })).toHaveCount(0)
    await page.goto('/rezervasyonlar/yeni')
    const pickup = page.getByLabel('Alış şubesi')
    await expect(pickup.locator('option')).toHaveText(['Seçin', 'Sarajevo Aerodrom'])
    expect(await page.getByLabel('İade şubesi').locator('option').count()).toBeGreaterThan(2)
  })
})

test.describe('another company', () => {
  test.use({ storageState: authFile('lejla') })

  test('a real Drina reservation address opens as "not found"', async ({ page, browser }) => {
    const drina = await browser.newContext({ storageState: authFile('adnan') })
    const p = await drina.newPage()
    await p.goto('/rezervasyonlar')
    const id = await p.evaluate(async () => {
      const csrf = ((await (await fetch('/api/auth/csrf')).json()) as { token: string }).token
      const res = await fetch('/api/reservations/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ q: 'R-000003' }) })
      return ((await res.json()) as { items: { id: string }[] }).items[0]!.id
    })
    await drina.close()
    await page.goto(`/rezervasyonlar/${id}`)
    await expect(page.getByRole('heading', { name: 'Rezervasyon bulunamadı' })).toBeVisible()
    await expect(page.getByText('Lena')).toHaveCount(0)
  })
})
