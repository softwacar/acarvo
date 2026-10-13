import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, sarajevoWallTime } from './fixtures'

// Pricing and contracts V1 in the browser (acarvo_test, synthetic data only): price list editor with revisions,
// reservation and rental quotes, contract templates in Ayarlar, contract drafts with the draft PDF, permissions.

const DAY = 86_400_000
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
async function audit(page: Page, label: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), label).toEqual([])
}
async function ids(page: Page) {
  const orta = (await apiCall<{ items: { id: string; name: string }[] }>(page, 'GET', '/vehicle-classes')).items.find((c) => c.name === 'Orta')!.id
  const sjj = (await apiCall<{ items: { id: string; code: string }[] }>(page, 'GET', '/rentals/branches')).items.find((b) => b.code === 'SJJ')!.id
  const ajla = (await apiCall<{ items: { id: string }[] }>(page, 'POST', '/customers/search', { q: 'Ajla Testović' })).items[0]!.id
  return { orta, sjj, ajla }
}
/** An active list for the quote tests (priority 50: wins over lists other tests create at priority 0). */
async function ensurePriceList(page: Page) {
  const { items } = await apiCall<{ items: { id: string; name: string; status: string }[] }>(page, 'GET', '/pricing/price-lists')
  if (items.some((l) => l.name === 'E2E Teklif EUR' && l.status === 'active')) return
  const { orta } = await ids(page)
  const created = await apiCall<{ id: string }>(page, 'POST', '/pricing/price-lists', {
    name: 'E2E Teklif EUR',
    currency: 'EUR',
    priority: 50,
    dayMethod: 'rolling_24h',
    graceMinutes: 59,
    minDays: 1,
    taxMode: 'exclusive',
    taxRateBp: 1700,
    taxLabel: 'PDV',
    rates: [{ vehicleClassId: orta, rate1to6: 5000, rate7to29: 4500, rate30plus: null }],
    seasons: [],
    extras: [{ code: 'GPS', name: 'Navigasyon', kind: 'standard', mode: 'per_day', priceMinor: 500, maxQuantity: 1, taxable: true, active: true }],
    discounts: [],
  })
  await apiCall(page, 'POST', `/pricing/price-lists/${created.id}/activate`, { version: 1 })
}
/** A prepared rental far in the future on any free Orta vehicle (no seeded record is touched). */
async function newRental(page: Page, offsetDays: number) {
  const { orta, sjj, ajla } = await ids(page)
  const from = sarajevoWallTime(offsetDays * DAY).slice(0, 11) + '10:00'
  const to = sarajevoWallTime((offsetDays + 3) * DAY).slice(0, 11) + '10:00'
  const avail = await apiCall<{ vehicles: { id: string }[] }>(page, 'POST', '/rentals/availability', { vehicleClassId: orta, pickupBranchId: sjj, returnBranchId: sjj, pickupLocal: from, returnLocal: to })
  return apiCall<{ id: string; rentalNo: string }>(page, 'POST', '/rentals', {
    customerId: ajla,
    drivers: [{ customerId: ajla, isPrimary: true }],
    vehicleClassId: orta,
    vehicleId: avail.vehicles[0]!.id,
    pickupBranchId: sjj,
    returnBranchId: sjj,
    pickupLocal: from,
    returnLocal: to,
    requestId: crypto.randomUUID(),
  })
}
async function ensureTemplate(page: Page) {
  const { items } = await apiCall<{ items: { id: string; name: string; versions: { status: string; version: number }[] }[] }>(page, 'GET', '/settings/contract-templates')
  if (items.some((t) => t.versions.some((v) => v.status === 'active'))) return
  const t = await apiCall<{ id: string; versions: { version: number }[] }>(page, 'POST', '/settings/contract-templates', { name: 'E2E Kiralama TR', language: 'tr', fromSample: true })
  await apiCall(page, 'POST', `/settings/contract-templates/${t.id}/activate`, { version: t.versions[0]!.version })
}

test.describe('owner', () => {
  test.use({ storageState: authFile('adnan') })

  test('price list editor: validation, draft, activation, preview, new revision, unsaved-changes guard', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/fiyatlandirma')
    await expect(page.getByRole('heading', { name: 'Fiyatlandırma' })).toBeVisible()
    await page.getByRole('link', { name: /Yeni fiyat listesi|İlk fiyat listesini oluştur/ }).first().click()
    await page.getByRole('button', { name: 'Taslak olarak oluştur' }).click()
    await expect(page.getByRole('alert')).toContainText('Bazı alanlar eksik')
    await expect(page.getByText('Fiyat listesi adını girin')).toBeVisible()
    await expect(page.getByText('Gün hesabı yöntemini seçin')).toBeVisible()
    await page.locator('#pl-name').fill('Tarayıcı Liste BAM')
    await page.getByLabel('Para birimi').selectOption('BAM')
    await page.getByText('24 saatlik dönem', { exact: true }).click()
    await page.getByLabel('Vergi uygulaması').selectOption('exclusive')
    await page.getByLabel('Oran (%)').fill('17')
    await page.getByRole('button', { name: 'Sınıf ekle' }).click()
    await page.getByLabel('Araç sınıfı').selectOption({ label: 'Orta' })
    await page.getByLabel('1–6 gün (BAM)').fill('98,50')
    await page.getByRole('button', { name: 'Taslak olarak oluştur' }).click()
    await expect(page.getByText(/oluşturuldu \(taslak, revizyon 1\)/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tarayıcı Liste BAM' })).toBeVisible()
    await expect(page.getByText('Taslak', { exact: true }).first()).toBeVisible()
    await audit(page, 'fiyat listesi düzenleyici')

    await page.getByRole('button', { name: 'Etkinleştir…' }).click()
    await expect(page.getByRole('dialog')).toContainText('Mevcut kayıtlara otomatik fiyat atanmaz')
    await page.getByRole('dialog').getByRole('button', { name: 'Etkinleştir' }).click()
    await expect(page.getByText('Etkin', { exact: true }).first()).toBeVisible()

    // Server preview on the saved revision.
    await page.getByLabel('Şube (saat dilimi buradan)').selectOption({ label: 'Sarajevo Aerodrom (SJJ)' })
    await page.getByLabel('Alış', { exact: true }).fill(sarajevoWallTime(40 * DAY).slice(0, 11) + '10:00')
    await page.getByLabel('İade', { exact: true }).fill(sarajevoWallTime(42 * DAY).slice(0, 11) + '10:00')
    await page.getByRole('button', { name: 'Önizle' }).click()
    const preview = page.getByRole('table', { name: 'Önizleme kalemleri' })
    await expect(preview).toContainText('197,00 BAM')
    await expect(preview).toContainText('Brüt toplam')
    await expect(preview).toContainText('230,49 BAM')

    // Unsaved change: leaving asks first; saving makes revision 2.
    await page.getByLabel('1–6 gün (BAM)').fill('99,00')
    await expect(page.getByText('Kaydedilmemiş değişiklikler var')).toBeVisible()
    page.once('dialog', (d) => void d.dismiss())
    await page.getByRole('link', { name: 'Fiyatlandırma', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Tarayıcı Liste BAM' })).toBeVisible()
    await page.getByRole('button', { name: 'Yeni revizyon olarak kaydet' }).click()
    await expect(page.getByText(/Kaydedildi: revizyon 2/)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Revizyonlar' })).toContainText('Revizyon 2')
    await expect(page.getByRole('region', { name: 'Revizyonlar' })).toContainText('Revizyon 1')
    await expectNoHorizontalOverflow(page)
    await page.goto('/fiyatlandirma')
    await expect(page.getByRole('link', { name: 'Tarayıcı Liste BAM' })).toBeVisible()
    await audit(page, 'fiyatlandırma listesi')
  })

  test('reservation quote: preview, save, header summary; a quote is not a payment', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await ensurePriceList(page)
    const { orta, sjj } = await ids(page)
    const mirza = (await apiCall<{ items: { id: string }[] }>(page, 'POST', '/customers/search', { q: 'Mirza Uzorak' })).items[0]!.id
    const r = await apiCall<{ id: string; reservationNo: string }>(page, 'POST', '/reservations', {
      customerId: mirza,
      vehicleClassId: orta,
      pickupBranchId: sjj,
      returnBranchId: sjj,
      pickupLocal: sarajevoWallTime(70 * DAY).slice(0, 11) + '10:00',
      returnLocal: sarajevoWallTime(73 * DAY).slice(0, 11) + '10:00',
      source: 'phone',
    })
    await page.goto(`/rezervasyonlar/${r.id}?sekme=fiyat`)
    await expect(page.getByRole('region', { name: 'Geçerli fiyat teklifi' })).toContainText('Hesaplanmadı')
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('Hesaplanmadı')
    await page.getByRole('button', { name: 'Teklif hesapla' }).click()
    await page.getByRole('button', { name: 'Önizle' }).click()
    await expect(page.getByRole('table', { name: 'Önizleme kalemleri' })).toContainText('175,50 EUR')
    await page.getByLabel(/Navigasyon/).fill('1')
    await page.getByRole('button', { name: 'Önizle' }).click()
    await expect(page.getByRole('table', { name: 'Önizleme kalemleri' })).toContainText('193,05 EUR')
    await audit(page, 'teklif hesaplama')
    await page.getByRole('button', { name: 'Teklifi kaydet' }).click()
    await expect(page.getByText(/Q-\d{6} kaydedildi/)).toBeVisible()
    const current = page.getByRole('region', { name: 'Geçerli fiyat teklifi' })
    await expect(current).toContainText('E2E Teklif EUR')
    await expect(current.getByRole('table')).toContainText('193,05 EUR')
    await expect(page.getByRole('region', { name: 'Rezervasyon özeti' })).toContainText('193,05 EUR')
    await expect(page.getByText('ödeme, tahsilat, depozito, borç veya fatura değildir')).toBeVisible()
    await audit(page, 'rezervasyon fiyat teklifi')
  })

  test('contract template in Ayarlar: sample draft, required fields, activation with a statement', async ({ page }) => {
    await page.goto('/ayarlar')
    const section = page.getByRole('region', { name: 'Sözleşme şablonları' })
    await section.getByRole('button', { name: 'Yeni şablon' }).click()
    await page.getByLabel('Şablon adı').fill('Tarayıcı Şablon')
    await page.getByRole('dialog').getByRole('button', { name: 'Oluştur' }).click()
    await expect(page.getByText('Tarayıcı Şablon oluşturuldu (taslak).')).toBeVisible()
    const body = section.getByLabel(/Sürüm 1 metni/)
    await expect(body).toHaveValue(/ÖRNEK METİN — HUKUKİ ONAY GEREKTİRİR/)
    await expect(section.getByRole('list', { name: 'Şablon denetimi' })).toContainText('Zorunlu alanların hepsi var')
    await body.fill('Sözleşme {{contract.no}}')
    await expect(section.getByRole('list', { name: 'Şablon denetimi' })).toContainText('eksik zorunlu alanlar')
    await expect(section.getByRole('button', { name: 'Etkinleştir…' })).toBeDisabled()
    await body.fill('<b>{{contract.no}}</b> {{renter.name}} {{vehicle.plate}} {{period.pickup}} {{period.return}} {{price.table}}')
    await section.getByRole('button', { name: 'Taslağı kaydet' }).click()
    await expect(section.getByRole('alert')).toContainText('HTML')
    await body.fill('Sözleşme {{contract.no}} — {{renter.name}} — {{vehicle.plate}}\n{{period.pickup}} → {{period.return}}\n{{price.table}}')
    await section.getByRole('button', { name: 'Örnek verilerle önizle' }).click()
    await expect(section).toContainText('Sözleşme S-000000 — Örnek Müşteri — ORNEK 00')
    await section.getByRole('button', { name: 'Taslağı kaydet' }).click()
    await expect(page.getByText('Taslak kaydedildi.')).toBeVisible()
    await section.getByRole('button', { name: 'Etkinleştir…' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Etkinleştir' })).toBeDisabled()
    await dialog.getByRole('checkbox').check()
    await audit(page, 'şablon etkinleştirme')
    await dialog.getByRole('button', { name: 'Etkinleştir' }).click()
    await expect(page.getByText('Tarayıcı Şablon sürüm 1 etkinleştirildi.')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Yeni taslak sürüm aç' })).toBeVisible()
    await audit(page, 'ayarlar sözleşme şablonları')
  })

  test('rental contract: draft with "price not calculated", review, external statement, PDF download, new revision', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/kiralamalar')
    await ensureTemplate(page)
    const k = await newRental(page, 300)
    await page.goto(`/kiralamalar/${k.id}?sekme=sozlesme`)
    await expect(page.getByRole('heading', { name: 'Sözleşme taslağı yok' })).toBeVisible()
    const select = page.getByLabel('Şablon')
    if ((await select.inputValue()) === '') await select.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Taslak oluştur' }).click()
    await expect(page.getByText(/S-\d{6} taslağı oluşturuldu/)).toBeVisible()
    const view = page.getByRole('region', { name: /S-\d{6} · sürüm 1/ })
    await expect(view).toContainText('TASLAK — HUKUKİ ONAY BEKLİYOR')
    await expect(view.getByLabel('Sözleşme metni')).toContainText('Fiyat hesaplanmadı')
    await expect(view.getByLabel('Sözleşme metni')).toContainText('Ajla Testović')
    await audit(page, 'kiralama sözleşme taslağı')

    const download = page.waitForEvent('download')
    await view.getByRole('button', { name: 'PDF taslağı' }).click()
    expect((await download).suggestedFilename()).toMatch(/^sozlesme-taslagi_S-\d{6}_s1\.pdf$/)

    await view.getByRole('button', { name: 'Kontrole gönder' }).click()
    await expect(view.getByText('Kontrol bekliyor', { exact: true })).toBeVisible()
    await view.getByRole('button', { name: 'Dışarıda işleme alındı' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Beyanı kaydet' }).click()
    await expect(dialog.getByText('Beyanı onaylayın')).toBeVisible()
    await audit(page, 'dış beyan diyalogu')
    await dialog.getByRole('checkbox').check()
    await dialog.getByLabel('Dış referans').fill('KAGIT-2026/14')
    await dialog.getByRole('button', { name: 'Beyanı kaydet' }).click()
    await expect(view.getByText('Dışarıda işleme alındı', { exact: true })).toBeVisible()
    await expect(view).toContainText('Bu bir elektronik imza veya ACARVO doğrulaması değildir')
    await expect(page.getByText(/[İi]mzalandı/)).toHaveCount(0)

    // A quote for the rental, then a new revision that contains it; the first revision keeps its text.
    await page.getByRole('tab', { name: 'Fiyat teklifi' }).click()
    await ensurePriceList(page)
    await page.getByRole('button', { name: 'Teklif hesapla' }).click()
    await page.getByRole('button', { name: 'Önizle' }).click()
    await page.getByRole('button', { name: 'Teklifi kaydet' }).click()
    await expect(page.getByText(/Q-\d{6} kaydedildi/)).toBeVisible()
    await page.getByRole('tab', { name: 'Sözleşme' }).click()
    await page.getByRole('button', { name: 'Yeni sürüm' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Yeni sürüm oluştur' }).click()
    const v2 = page.getByRole('region', { name: /S-\d{6} · sürüm 2/ })
    await expect(v2.getByLabel('Sözleşme metni')).toContainText('Brüt toplam')
    await expect(page.getByRole('region', { name: 'Sözleşmeler ve sürümler' })).toContainText('Yeni sürümle değiştirildi')
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('operations user (Operasyon, SJJ)', () => {
  test.use({ storageState: authFile('selma') })
  test('reads prices and contracts but cannot change price lists or download contract PDFs', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await expect(page.getByRole('heading', { name: 'Fiyatlandırma' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Yeni fiyat listesi' })).toHaveCount(0)
    const lists = await apiCall<{ items: { id: string; name: string }[] }>(page, 'GET', '/pricing/price-lists')
    const any = lists.items[0]
    if (any) {
      await page.goto(`/fiyatlandirma/${any.id}`)
      await expect(page.getByRole('button', { name: 'Yeni revizyon olarak kaydet' })).toHaveCount(0)
      await expect(page.locator('#pl-name')).toBeDisabled()
    }
    await page.goto('/ayarlar')
    await expect(page.getByRole('region', { name: 'Sözleşme şablonları' })).toHaveCount(0)
    const rentals = await apiCall<{ items: { id: string; rentalNo: string }[] }>(page, 'POST', '/rentals/search', { view: 'all' })
    for (const r of rentals.items) {
      const c = await apiCall<{ items: { id: string }[] }>(page, 'GET', `/rentals/${r.id}/contracts`)
      if (!c.items.length) continue
      await page.goto(`/kiralamalar/${r.id}?sekme=sozlesme`)
      await expect(page.getByRole('region', { name: /S-\d{6} · sürüm/ })).toBeVisible()
      await expect(page.getByRole('button', { name: 'PDF taslağı' })).toHaveCount(0)
      break
    }
  })
})

test.describe('another company (Neretva owner)', () => {
  test.use({ storageState: authFile('lejla') })
  test('sees none of Drina’s price lists or templates', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await expect(page.getByRole('heading', { name: 'Fiyat listesi yok' })).toBeVisible()
    await page.goto('/ayarlar')
    await expect(page.getByRole('region', { name: 'Sözleşme şablonları' })).toContainText('Henüz şablon yok')
  })
})
