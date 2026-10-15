import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, fixture, sarajevoWallTime } from './fixtures'

// Rentals, handover and return V1 in the browser, on acarvo_test with synthetic data (seed/test-rentals.ts).
test.use({ storageState: authFile('adnan') })

async function openRental(page: Page, no: string) {
  await page.goto('/kiralamalar?view=all')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill(no)
  await page.getByRole('row', { name: new RegExp(no) }).getByRole('link').first().click()
  await expect(page.getByRole('tablist', { name: 'Kiralama bölümleri' })).toBeVisible()
}
/** JSON call to the API from the signed-in page (session cookie + CSRF), for setting up this test's own records. */
async function apiCall<T = Record<string, unknown>>(page: Page, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const { token } = await (await fetch('/api/auth/csrf')).json()
      const res = await fetch(`/api${path}`, { method, headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-csrf-token': token }, body: method === 'GET' ? undefined : JSON.stringify(body) })
      if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
      return res.json()
    },
    { method, path, body },
  )
}
/** A plan in this test's own vehicle and time, so the seeded rentals and reservations other tests use stay untouched. */
async function plan(page: Page, plate: string, from: string, to: string) {
  const ajla = (await apiCall<{ items: { id: string }[] }>(page, 'POST', '/customers/search', { q: 'Ajla Testović' })).items[0]!.id
  const orta = (await apiCall<{ items: { id: string; name: string }[] }>(page, 'GET', '/vehicle-classes')).items.find((c) => c.name === 'Orta')!.id
  const sjj = (await apiCall<{ items: { id: string; code: string }[] }>(page, 'GET', '/rentals/branches')).items.find((b) => b.code === 'SJJ')!.id
  const avail = await apiCall<{ vehicles: { id: string; plate: string }[] }>(page, 'POST', '/rentals/availability', { vehicleClassId: orta, pickupBranchId: sjj, returnBranchId: sjj, pickupLocal: from, returnLocal: to })
  const vehicleId = avail.vehicles.find((v) => v.plate === plate)!.id
  return { customerId: ajla, vehicleClassId: orta, vehicleId, pickupBranchId: sjj, returnBranchId: sjj, pickupLocal: from, returnLocal: to }
}
async function answerChecklist(page: Page) {
  for (const item of ['Anahtar', 'Ruhsat ve araç belgeleri', 'Stepne / lastik tamir seti', 'Reflektör (üçgen)', 'İlk yardım çantası', 'Farlar ve sinyaller', 'Lastikler', 'Ön cam']) {
    await page.getByRole('group', { name: item }).getByText('Tamam', { exact: true }).click()
  }
}
async function uploadFour(page: Page, kind: 'handover' | 'return') {
  for (let i = 0; i < 4; i++) {
    await page.locator(`#${kind}-file`).setInputFiles(fixture(i % 2 ? 'foto-gri.jpg' : 'foto-mavi.jpg'))
    await expect(page.getByText(`${i + 1} / 4–5 fotoğraf`)).toBeVisible()
  }
}

test('list: views with counts, overdue rentals stand out, search text stays out of the address bar', async ({ page }) => {
  await page.goto('/kiralamalar')
  await expect(page.getByRole('tab', { name: /Geciken/ })).toContainText('1')
  await expect(page.getByRole('row', { name: /K-000002/ })).toContainText('Gecikmede')
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('Testić')
  await expect(page.getByRole('row')).toHaveCount(2)
  expect(page.url()).not.toContain('Test')
  await page.getByRole('tab', { name: /İade kontrolü/ }).click()
  await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('')
  await expect(page.getByRole('row', { name: /K-000005/ })).toBeVisible()
})

test('handover desk: document decision, km, fuel, checklist, marks and 4 photos, then one handover', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/kiralamalar')
  const p = await plan(page, 'O58-E-467', sarajevoWallTime(2 * 3_600_000), sarajevoWallTime(50 * 3_600_000))
  const rental = await apiCall<{ id: string; rentalNo: string }>(page, 'POST', '/rentals', { ...p, drivers: [{ customerId: p.customerId, isPrimary: true }], requestId: crypto.randomUUID() })
  await openRental(page, rental.rentalNo)
  await page.getByRole('link', { name: 'Teslim masası', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Teslim', exact: true })).toBeVisible()
  const desk = page.getByRole('complementary', { name: 'Teslim masası' })
  await expect(desk.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  // Staff decides: local (suggested), documents seen.
  await page.getByText('Belgeleri gördüm, uygun').click()
  await page.getByRole('button', { name: 'Belge kararını kaydet' }).click()
  await expect(page.getByText(/Kayıtlı karar: uygun · yerli · kural sürüm 1/)).toBeVisible()
  await page.getByLabel('Teslim kilometresi').fill('15100')
  await page.getByRole('radiogroup', { name: /Yakıt seviyesi/ }).getByText('3/4').click()
  await page.getByLabel('Temizlik').selectOption({ label: 'Temiz' })
  await page.getByLabel('Genel durum').selectOption({ label: 'İyi' })
  await page.getByLabel('Teslim alan sürücü').selectOption({ label: 'Ajla Testović (ana sürücü)' })
  await answerChecklist(page)
  await page.getByRole('button', { name: /Sol yan görünüme işaret ekle/ }).click()
  await page.getByLabel('İşaret 1 türü').selectOption({ label: 'Çizik · Sol yan' })
  await page.getByRole('button', { name: 'Taslağı kaydet' }).click()
  await expect(desk.getByText('Teslim kaydı (km, yakıt, kontrol listesi, teslim alan)').locator('..')).toContainText('Tamam')
  await uploadFour(page, 'handover')
  await expect(desk.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  await desk.getByText('Sözleşmenin ACARVO dışında düzenlendiğini', { exact: false }).click()
  await expect(desk.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  await desk.getByText('Fiyatın ACARVO dışında belirlendiğini', { exact: false }).click()
  await desk.getByLabel('Dış sözleşme / işlem referansı').fill('SZL-2026/118')
  await desk.getByRole('button', { name: 'Teslimi tamamla' }).click()
  await expect(page.getByText(rental.rentalNo + " teslim edildi.")).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Teslim', selected: true })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toContainText('15.100 km')
  await expect(page.getByRole('tabpanel')).toContainText('Kesinleşti')
  await expect(page.getByRole('tabpanel')).toContainText('SZL-2026/118')
  await expect(page.getByRole('tabpanel')).toContainText('kanıtı değildir')
  await expect(page.getByRole('img', { name: /Teslim fotoğrafı 1/ })).toBeVisible()
  // The vehicle's history shows the handover reading from its own source.
  await page.getByRole('link', { name: /O58-E-467/ }).first().click()
  await page.getByRole('tab', { name: 'Konum ve geçmiş' }).click()
  await expect(page.getByText('15.100 km').first()).toBeVisible()
})

test('return and close: km and fuel compared with the handover; new damage is a finding, not a charge', async ({ page }) => {
  test.setTimeout(90_000)
  await openRental(page, 'K-000001')
  await page.getByRole('link', { name: 'İadeyi al', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'İade', exact: true })).toBeVisible()
  await page.getByLabel('İade kilometresi').fill('12000')
  await page.getByRole('radiogroup', { name: /Yakıt seviyesi/ }).getByText('1/2').click()
  await expect(page.getByText('Teslimden düşük olamaz')).toBeVisible()
  await page.getByRole('button', { name: 'İadeyi al' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'teslim kilometresinden' })).toBeVisible()
  await page.getByLabel('İade kilometresi').fill('12820')
  await expect(page.getByText('320 km')).toBeVisible()
  await page.getByRole('button', { name: 'İadeyi al' }).click()
  await expect(page.getByRole('heading', { name: 'İade kontrolü ve kapanış' })).toBeVisible()
  await expect(page.getByText('12.820 km (320 km)')).toBeVisible()
  await page.locator('#return-clean').selectOption({ label: 'Kirli' })
  await page.locator('#return-cond').selectOption({ label: 'Küçük kusurlar var' })
  await answerChecklist(page)
  await page.getByRole('tab', { name: /Arka/ }).click()
  await page.getByRole('button', { name: /Arka görünüme işaret ekle/ }).click()
  await page.getByLabel('İşaret 1 türü').selectOption({ label: 'Göçük · Arka' })
  await uploadFour(page, 'return')
  const desk = page.getByRole('complementary', { name: 'İade masası' })
  await desk.getByRole('button', { name: 'Kontrolü tamamla ve kapat' }).isDisabled()
  await page.getByRole('button', { name: 'Taslağı kaydet' }).click()
  await expect(desk.getByText(/1 yeni bulgu var/)).toBeVisible()
  await expect(desk.getByRole('button', { name: 'Kontrolü tamamla ve kapat' })).toBeDisabled()
  await desk.getByText('Yeni hasar bulgularını gördüm').click()
  await desk.getByRole('button', { name: 'Kontrolü tamamla ve kapat' }).click()
  await expect(page.getByText('K-000001 kapatıldı.')).toBeVisible()
  await expect(page.getByText(/İadede 1 yeni bulgu var/)).toBeVisible()
  await expect(page.getByText(/her bulgu için hasar dosyası açılabilir; sorumluluk kararı, muafiyet veya ücret kendiliğinden oluşmaz/)).toBeVisible()
  await page.getByRole('tab', { name: 'Genel' }).click()
  await expect(page.getByRole('table')).toContainText('320 km kullanıldı')
})

test('a confirmed reservation becomes a rental from Rezervasyon 360°, once', async ({ page }) => {
  await page.goto('/rezervasyonlar')
  const p = await plan(page, 'M87-J-529', sarajevoWallTime(30 * 86_400_000), sarajevoWallTime(31 * 86_400_000))
  const res = await apiCall<{ id: string; reservationNo: string }>(page, 'POST', '/reservations', { ...p, source: 'phone', confirm: true })
  await page.goto('/rezervasyonlar/' + res.id)
  await page.getByRole('button', { name: 'Kiralamaya dönüştür' }).click()
  await expect(page.getByRole('dialog')).toContainText('Ödeme, depozito ve sözleşme oluşturulmaz.')
  await page.getByRole('button', { name: 'Kiralamayı hazırla' }).click()
  await expect(page.getByRole('tablist', { name: 'Kiralama bölümleri' })).toBeVisible()
  await expect(page.getByRole('link', { name: res.reservationNo })).toBeVisible()
  await page.getByRole('link', { name: res.reservationNo }).click()
  await expect(page.getByText('Kiralamaya dönüştü').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kiralamaya dönüştür' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Kiralamaya git/ })).toBeVisible()
})

test('overdue rental: the 360° says the vehicle stays held and no late fee is calculated', async ({ page }) => {
  await openRental(page, 'K-000002')
  await expect(page.getByRole('status').filter({ hasText: 'gecikti' })).toContainText('Araç fiilen iade edilene kadar bu kiralamada sayılır')
  await expect(page.getByRole('status').filter({ hasText: 'gecikti' })).toContainText('gecikme ücreti hesaplanmaz')
  // The header shows the price as a quote (or not calculated); a late fee is never added to it.
  await expect(page.getByRole('region', { name: 'Kiralama özeti' })).toContainText('Fiyat teklifi')
  await expect(page.getByRole('region', { name: 'Kiralama özeti' })).not.toContainText('Gecikme ücreti')
})

test.describe('branch scope', () => {
  test.use({ storageState: authFile('selma') })
  test('a user limited to SJJ sees only rentals of SJJ', async ({ page }) => {
    await page.goto('/kiralamalar?view=all')
    await expect(page.getByRole('row', { name: /K-000003/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /K-000002/ })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('K1: rental operating mode (company without the mode)', () => {
  test.use({ storageState: authFile('lejla') })
  test('off by default: the handover desk says why no handover is possible; the owner switches it on and off in Ayarlar', async ({ page }) => {
    await openRental(page, 'K-000001')
    await page.getByRole('link', { name: 'Teslim masası', exact: true }).click()
    const desk = page.getByRole('complementary', { name: 'Teslim masası' })
    await expect(desk).toContainText('Dış sözleşme ve fiyat modu kapalı')
    await expect(desk.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
    await expect(desk.getByLabel('Dış sözleşme / işlem referansı')).toHaveCount(0)
    await page.goto('/ayarlar')
    const section = page.getByRole('region', { name: 'Kiralama çalışma modu' })
    await expect(section).toContainText('Kapalı (varsayılan): teslim yapılamaz')
    await section.getByRole('button', { name: 'Modu aç…' }).click()
    await expect(page.getByRole('dialog')).toContainText('ACARVO sözleşmenin imzalandığını, ödemenin alındığını veya fiyatın kesinleştiğini göstermez')
    await page.getByRole('dialog').getByRole('button', { name: 'Modu aç' }).click()
    await expect(section).toContainText('Açık: teslim, personel beyanı ve dış referansla yapılır')
    await section.getByRole('button', { name: 'Modu kapat' }).click()
    await expect(section).toContainText('Kapalı (varsayılan)')
  })
})

test.describe('K1: operations staff', () => {
  test.use({ storageState: authFile('selma') })
  test('sees the mode but cannot change it', async ({ page }) => {
    await page.goto('/ayarlar')
    const section = page.getByRole('region', { name: 'Kiralama çalışma modu' })
    await expect(section).toContainText('Yalnız şirket sahibi değiştirebilir')
    await expect(section.getByRole('button')).toHaveCount(0)
  })
})
