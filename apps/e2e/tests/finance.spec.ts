import AxeBuilder from '@axe-core/playwright'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Finance V1 in the browser (acarvo_test, synthetic data): finance file, line from a quote, cash payment with the
// staff statement, verification by a second person, deposit and its return, finance centre, customer statement.
// Nothing here moves money.

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
/** The seeded overdue rental (handed over) with an active EUR list and a saved quote. */
async function prepare(page: Page) {
  const rentals = await apiCall<{ items: { id: string; rentalNo: string; vehicleClass: { id: string } }[] }>(page, 'POST', '/rentals/search', { view: 'all', q: 'K-000002' })
  const rental = rentals.items.find((r) => r.rentalNo === 'K-000002')!
  const detail = await apiCall<{ vehicleClass: { id: string } }>(page, 'GET', `/rentals/${rental.id}`)
  const lists = await apiCall<{ items: { name: string; status: string }[] }>(page, 'GET', '/pricing/price-lists')
  if (!lists.items.some((l) => l.name === 'E2E Finans EUR' && l.status === 'active')) {
    const l = await apiCall<{ id: string }>(page, 'POST', '/pricing/price-lists', {
      name: 'E2E Finans EUR',
      currency: 'EUR',
      priority: 90,
      dayMethod: 'calendar_day',
      graceMinutes: 0,
      minDays: 1,
      taxMode: 'exclusive',
      taxRateBp: 1700,
      taxLabel: 'PDV',
      rates: [{ vehicleClassId: detail.vehicleClass.id, rate1to6: 4000, rate7to29: 3500, rate30plus: null }],
      seasons: [],
      extras: [],
      discounts: [],
    })
    await apiCall(page, 'POST', `/pricing/price-lists/${l.id}/activate`, { version: 1 })
  }
  const quotes = await apiCall<{ items: { status: string; matchesPlan: boolean }[] }>(page, 'GET', `/rentals/${rental.id}/quotes`)
  if (!quotes.items.some((q) => q.status === 'quoted' && q.matchesPlan)) {
    const p = await apiCall<{ netMinor: number; grossMinor: number | null }>(page, 'POST', `/rentals/${rental.id}/quotes/preview`, {})
    await apiCall(page, 'POST', `/rentals/${rental.id}/quotes`, { requestId: crypto.randomUUID(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })
  }
  return rental.id
}
async function asUser(browser: Browser, who: 'kontrol' | 'selma') {
  const ctx = await browser.newContext({ storageState: authFile(who), locale: 'tr-TR', timezoneId: 'Europe/Sarajevo', viewport: { width: 1440, height: 900 } })
  return { ctx, page: await ctx.newPage() }
}

test.describe.configure({ mode: 'serial' })
test.use({ storageState: authFile('adnan') })
let rentalId = ''

test('finance file, line from a quote approved by a second person, cash payment recorded then verified', async ({ page, browser }) => {
  test.setTimeout(120_000)
  await page.goto('/kiralamalar')
  rentalId = await prepare(page)
  await page.goto(`/kiralamalar/${rentalId}?sekme=finans`)
  await expect(page.getByRole('heading', { name: 'Finans dosyası açılmadı' })).toBeVisible()
  await expect(page.getByText('ACARVO para tahsil etmez veya iade etmez')).toBeVisible()
  await audit(page, 'finans dosyası yok')
  await page.getByRole('button', { name: 'Finans dosyası aç' }).click()
  const open = page.getByRole('dialog')
  await expect(open.getByLabel('İşlem para birimi')).toHaveValue('EUR')
  await open.getByRole('radio', { name: /Müşteri:/ }).check()
  await audit(page, 'dosya açma diyaloğu')
  await open.getByRole('button', { name: 'Dosyayı aç' }).click()
  await expect(page.getByText('Finans dosyası açıldı.')).toBeVisible()
  const summary = page.getByRole('region', { name: 'Finans özeti' })
  await expect(summary).toContainText('Açık')
  await expect(summary).toContainText('Resmî fatura: ACARVO’da yok')

  await page.getByRole('button', { name: 'Tekliften kalem hazırla' }).click()
  await expect(page.getByRole('dialog')).toContainText('Kiralama planıyla uyumlu')
  await page.getByRole('dialog').getByRole('button', { name: 'Kalemi hazırla' }).click()
  await expect(page.getByText('Kalem hazırlandı; onay bekliyor.')).toBeVisible()
  const lines = page.getByRole('region', { name: 'İç hesap kalemleri' })
  await expect(lines.getByText('Onay bekliyor', { exact: true })).toBeVisible()
  // The preparer cannot approve their own line.
  await lines.getByRole('button', { name: 'Onayla' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('başka bir yetkili gerekli')
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click()

  const k = await asUser(browser, 'kontrol')
  await k.page.goto(`/kiralamalar/${rentalId}?sekme=finans`)
  await k.page.getByRole('region', { name: 'İç hesap kalemleri' }).getByRole('button', { name: 'Onayla' }).click()
  await k.page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click()
  await expect(k.page.getByRole('region', { name: 'İç hesap kalemleri' }).getByText('Kayıtlı', { exact: true })).toBeVisible()

  // Cash payment by the owner: needs the cash statement; it is a record waiting for verification.
  await page.reload()
  await page.getByRole('button', { name: 'Tahsilat kaydet' }).click()
  const pay = page.getByRole('dialog')
  await pay.getByRole('radio', { name: /^Nakit/ }).check()
  await pay.getByLabel(/^Tutar/).fill('50,00')
  await pay.getByRole('button', { name: 'Tahsilatı kaydet' }).click()
  await expect(pay.getByText('Nakdi teslim aldığınızı onaylayın')).toBeVisible()
  await pay.getByRole('checkbox', { name: /Bu nakdi kendim teslim aldım/ }).check()
  await expect(pay).toContainText('Doğrulama bekliyor')
  await audit(page, 'tahsilat diyaloğu')
  await pay.getByRole('button', { name: 'Tahsilatı kaydet' }).click()
  await expect(page.getByText('Tahsilat kaydedildi; doğrulama bekliyor.')).toBeVisible()
  const payments = page.getByRole('region', { name: 'Tahsilatlar' })
  await expect(payments.getByText('Doğrulama bekliyor', { exact: true })).toBeVisible()
  await expect(summary).toContainText('+ doğrulama bekleyen 50,00 EUR')

  await k.page.reload()
  await k.page.getByRole('region', { name: 'Tahsilatlar' }).getByRole('button', { name: 'Doğrula' }).click()
  await expect(k.page.getByRole('dialog')).toContainText('Paranın gerçekten geldiğini')
  await k.page.getByRole('dialog').getByRole('button', { name: 'Doğrula' }).click()
  await expect(k.page.getByRole('region', { name: 'Tahsilatlar' }).getByText('Doğrulandı', { exact: true })).toBeVisible()
  await expect(k.page.getByRole('region', { name: 'Finans özeti' })).toContainText('50,00 EUR')
  await audit(k.page, 'kiralama finans sekmesi')
  await k.ctx.close()
})

test('deposit in its own currency: reported, verified, returned through approval; never "provizyon alındı"', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await page.goto(`/kiralamalar/${rentalId}?sekme=finans`)
  await page.getByRole('button', { name: 'Depozito kaydı' }).click()
  const d = page.getByRole('dialog')
  await d.locator('#dn-amount').fill('200,00')
  await d.getByLabel('Para birimi').selectOption('BAM')
  await d.getByLabel('Yöntem').selectOption('external_card_hold')
  await expect(d).toContainText('ACARVO provizyon almaz')
  await d.getByLabel('Harici işlem referansı').fill('BLOKE-2026')
  await d.getByRole('button', { name: 'Alındığını bildir' }).click()
  await expect(page.getByText('Depozitonun alındığı bildirildi; doğrulama bekliyor.')).toBeVisible()
  await expect(page.getByText(/provizyon alındı/i)).toHaveCount(0)

  const k = await asUser(browser, 'kontrol')
  await k.page.goto(`/kiralamalar/${rentalId}?sekme=finans`)
  const deposits = k.page.getByRole('region', { name: 'Depozitolar' })
  await deposits.getByRole('button', { name: 'Doğrula' }).click()
  await k.page.getByRole('dialog').getByRole('button', { name: 'Doğrula' }).click()
  await expect(deposits.getByText('Doğrulandı (tutuluyor)')).toBeVisible()
  await expect(k.page.getByRole('region', { name: 'Finans özeti' })).toContainText('200,00 BAM')

  await page.reload()
  await page.getByRole('region', { name: 'Depozitolar' }).getByRole('button', { name: 'İade talebi' }).click()
  const r = page.getByRole('dialog')
  await expect(r).toContainText('İade edilebilir en fazla')
  await r.getByLabel(/^Tutar/).fill('200,00')
  await r.getByLabel('İade yöntemi').selectOption('bank_transfer')
  await r.getByLabel('Gerekçe').fill('Araç hasarsız iade edildi')
  await audit(page, 'iade talebi diyaloğu')
  await r.getByRole('button', { name: 'İade talebi oluştur' }).click()
  await expect(page.getByText('İade talebi oluşturuldu; onay bekliyor.')).toBeVisible()

  await k.page.reload()
  await deposits.getByRole('button', { name: 'Onayla' }).click()
  await expect(k.page.getByRole('dialog')).toContainText('para henüz gönderilmiş sayılmaz')
  await k.page.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click()
  await deposits.getByRole('button', { name: 'İadenin yapıldığını bildir' }).click()
  const c = k.page.getByRole('dialog')
  await expect(c).toContainText('ACARVO para göndermedi')
  await c.getByLabel('Harici iade referansı').fill('IADE-77')
  await c.getByRole('button', { name: 'Bildir' }).click()
  await expect(deposits.getByText('İade edildiği bildirildi')).toBeVisible()
  await expect(deposits).toContainText('tutulan 0,00 BAM')
  await expect(k.page.getByRole('region', { name: 'Finans geçmişi' })).toContainText('İadenin yapıldığı bildirildi')
  await k.ctx.close()
})

test('finance centre: per currency, pending queue, lists with filters; customer statement; Operasyon has no centre', async ({ page, browser }) => {
  await page.goto('/finans')
  await expect(page.getByRole('heading', { name: 'Finans', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'EUR' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'BAM' })).toBeVisible()
  await expect(page.getByText('resmî muhasebe defteri, vergi beyannamesi, fatura veya banka mutabakatı değildir')).toBeVisible()
  await audit(page, 'finans genel görünüm')
  await page.getByRole('tab', { name: 'Tahsilatlar' }).click()
  await expect(page.getByRole('row', { name: /K-000002/ }).first()).toBeVisible()
  await page.getByLabel('Durum').selectOption('verified')
  await expect(page.getByRole('row', { name: /Doğrulandı/ }).first()).toBeVisible()
  await audit(page, 'finans tahsilatlar')
  await page.getByRole('tab', { name: 'Depozitolar' }).click()
  await expect(page.getByRole('row', { name: /BAM/ }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Bekleyen doğrulamalar' }).click()
  await expect(page.getByRole('heading', { name: /Bekleyen doğrulama yok|Tahsilatlar \(/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Kiralama finans dosyaları' }).click()
  await expect(page.getByRole('link', { name: 'K-000002' }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'İşlem geçmişi' }).click()
  await expect(page.getByText('Tahsilat doğrulandı').first()).toBeVisible()
  await audit(page, 'finans işlem geçmişi')
  await expectNoHorizontalOverflow(page)

  // The customer's statement shows the file in its currency.
  const detail = await apiCall<{ customer: { id: string } }>(page, 'GET', `/rentals/${rentalId}`)
  await page.goto(`/musteriler/${detail.customer.id}?sekme=cari`)
  await expect(page.getByRole('link', { name: 'K-000002' }).first()).toBeVisible()
  await audit(page, 'müşteri cari')

  const s = await asUser(browser, 'selma')
  await s.page.goto('/finans')
  await expect(s.page.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible()
  await s.ctx.close()
})
