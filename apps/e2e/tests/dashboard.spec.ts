import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// Ana Kontrol Paneli, Operasyonel Hazırlık, FN5 and evidence photo access in the browser (acarvo_test, synthetic data).
// Nothing here changes a setting, creates a key, records a legal approval or moves money.

async function apiCall<T = Record<string, unknown>>(page: Page, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
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
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), label).toEqual([])
}
const localDay = (days: number, time: string) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Sarajevo' }).format(d)}T${time}`
}

test.describe('Ana Ekran', () => {
  test.use({ storageState: authFile('adnan') })
  test('owner: real counts, fleet now, per-currency finance with its disclaimer, branch filter in the URL, readiness link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ana Ekran', level: 1 })).toBeVisible()
    const summary = page.getByRole('region', { name: 'Bugünün özeti' })
    await expect(summary).toContainText('Bugün teslim')
    await expect(summary).toContainText('Müsait araç (şimdi)')
    // Counts are the API's numbers, nothing invented.
    const d = await apiCall<{ counts: { activeRentals: number }; fleet: { total: number; buckets: Record<string, number> } }>(page, 'GET', '/dashboard')
    await expect(summary.getByRole('link', { name: /Aktif kiralama/ })).toContainText(String(d.counts.activeRentals))
    const fleet = page.getByRole('region', { name: /Filo durumu/ })
    await expect(fleet).toContainText(String(d.fleet.total))
    expect(Object.values(d.fleet.buckets).reduce((a, b) => a + b, 0)).toBe(d.fleet.total)
    await expect(fleet).toContainText('aynı müsaitlik kuralından gelir')
    const finance = page.getByRole('region', { name: /Finans · para birimine göre/ })
    await expect(finance).toContainText('Para birimleri birbirine çevrilmez ve toplanmaz')
    await expect(finance).toContainText('resmî muhasebe raporu veya gelir tablosu değildir')
    await expect(page.getByRole('link', { name: /Operasyonel hazırlık/ })).toBeVisible()
    // Branch filter: the choice lives in the URL; the branch table disappears for a single branch.
    await expect(page.getByRole('region', { name: 'Şubeler' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Şube' }).selectOption({ label: 'MST · Mostar' })
    await expect(page).toHaveURL(/sube=[0-9a-f-]{36}/)
    await expect(page.getByRole('region', { name: 'Şubeler' })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Şube' })).toBeVisible() // the choice stays available
    await expectNoHorizontalOverflow(page)
    await audit(page, 'ana ekran (tek şube)')
    await page.goto('/')
    await audit(page, 'ana ekran')
  })

  test('Operasyon user: only their branch and sections; no finance figures, no readiness', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: authFile('selma') })).newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ana Ekran', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Bugünün özeti' })).toBeVisible()
    await expect(page.getByRole('region', { name: /Finans · para birimine göre/ })).toHaveCount(0)
    await expect(page.getByText(/Doğrulanmış tahsilat/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Operasyonel hazırlık/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Şubeler' })).toHaveCount(0)
    const d = await apiCall<{ finance: unknown; scope: { branches: { code: string }[] } }>(page, 'GET', '/dashboard')
    expect(d.finance).toBeNull()
    expect(d.scope.branches.map((b) => b.code)).toEqual(['SJJ'])
    await page.goto('/ayarlar/hazirlik')
    await expect(page.getByText('Operasyonel hazırlık listesini yalnız şirket sahibi görür.')).toBeVisible()
    await page.context().close()
  })

  test('another company sees only its own figures', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: authFile('lejla') })).newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ana Ekran', level: 1 })).toBeVisible()
    const own = await apiCall<{ scope: { branches: { id: string }[] }; fleet: { total: number } }>(page, 'GET', '/dashboard')
    const drina = await (await browser.newContext({ storageState: authFile('adnan') })).newPage()
    await drina.goto('/')
    const other = await apiCall<{ scope: { branches: { id: string }[] } }>(drina, 'GET', '/dashboard')
    const otherIds = new Set(other.scope.branches.map((b) => b.id))
    expect(own.scope.branches.length).toBeGreaterThan(0)
    expect(own.scope.branches.some((b) => otherIds.has(b.id))).toBe(false)
    // A branch of the other company in the URL is refused, not silently widened.
    expect((await page.request.get(`/api/dashboard?branchId=${other.scope.branches[0]!.id}`)).status()).toBe(403)
    await drina.context().close()
    await page.context().close()
  })
})

test.describe('Operasyonel hazırlık', () => {
  test.use({ storageState: authFile('adnan') })
  test('read-only checklist: configured, working and legally approved are kept apart; no key values', async ({ page }) => {
    await page.goto('/ayarlar')
    await page.getByRole('link', { name: /Operasyonel hazırlık/ }).click()
    await expect(page.getByRole('heading', { name: 'Operasyonel hazırlık', level: 1 })).toBeVisible()
    const legal = page.locator('[data-check="contract_legal"]')
    await expect(legal).toContainText('Doğrulanmadı')
    await expect(page.locator('[data-check="customer_keys"]')).toContainText(/Yapılandırılmış|Eksik/)
    await expect(page.locator('[data-check="customer_keys"]')).toContainText('gösterilmez')
    await expect(page.getByText(/ikisi de hukuki uygunluk anlamına gelmez/)).toBeVisible()
    // No key material anywhere on the page.
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/)
    expect(text).not.toMatch(/CUSTOMER_|_KEY=/)
    await expect(page.getByRole('button', { name: /Etkinleştir|Onayla|Aç/ })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await audit(page, 'operasyonel hazırlık')
  })
})

test.describe.serial('FN5: responsible party correction', () => {
  test.use({ storageState: authFile('adnan') })
  let rentalId = ''

  test('without financial movement: requested by one person, the requester cannot approve, a second finance authority applies it', async ({ page, browser }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    const customers = await apiCall<{ items: { id: string; displayName: string }[] }>(page, 'POST', '/customers/search', { q: 'Testović' })
    const ajla = customers.items.find((c) => c.displayName === 'Ajla Testović')!
    const mirza = (await apiCall<{ items: { id: string; displayName: string }[] }>(page, 'POST', '/customers/search', { q: 'Uzorak' })).items.find((c) => c.displayName === 'Mirza Uzorak')!
    const v = (await apiCall<{ items: { id: string }[] }>(page, 'GET', `/vehicles?q=M62-A-238`)).items[0]!
    const vd = await apiCall<{ classId: string; homeBranchId: string }>(page, 'GET', `/vehicles/${v.id}`)
    const body = (customerId: string) => ({ customerId, drivers: [{ customerId, isPrimary: true }], vehicleClassId: vd.classId, vehicleId: v.id, pickupBranchId: vd.homeBranchId, returnBranchId: vd.homeBranchId, pickupLocal: localDay(300, '10:00'), returnLocal: localDay(301, '10:00') })
    const k = await apiCall<{ id: string; version: number }>(page, 'POST', '/rentals', { ...body(ajla.id), requestId: crypto.randomUUID() })
    rentalId = k.id
    await apiCall(page, 'POST', `/rentals/${k.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: crypto.randomUUID() })
    await apiCall(page, 'PUT', `/rentals/${k.id}`, { ...body(mirza.id), version: k.version })

    await page.goto(`/kiralamalar/${k.id}?sekme=finans`)
    const section = page.getByRole('region', { name: 'Ödeme sorumlusu düzeltmesi' })
    await section.getByRole('button', { name: 'Düzeltme talebi…' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#rc-to').selectOption({ label: 'Mirza Uzorak (kiralamanın müşterisi)' })
    await dlg.locator('#rc-reason').fill('Kiralama müşterisi düzeltildi')
    await dlg.getByRole('button', { name: 'Talebi gönder' }).click()
    await expect(section).toContainText('İkinci onay bekliyor')
    await expect(section).toContainText('Kendi talebinizi onaylayamazsınız.')
    await expect(section.getByRole('button', { name: 'Onayla' })).toHaveCount(0)
    await expect(page.getByText(/ödeme sorumlusu\s+Ajla Testović/)).toBeVisible()

    const kontrol = await (await browser.newContext({ storageState: authFile('kontrol') })).newPage()
    await kontrol.goto(`/kiralamalar/${k.id}?sekme=finans`)
    const ks = kontrol.getByRole('region', { name: 'Ödeme sorumlusu düzeltmesi' })
    await ks.getByRole('button', { name: 'Onayla' }).click()
    await kontrol.getByRole('dialog').getByRole('button', { name: 'Onayla ve uygula' }).click()
    await expect(ks).toContainText('Uygulandı')
    await expect(kontrol.getByText(/ödeme sorumlusu\s+Mirza Uzorak/)).toBeVisible()
    await expect(kontrol.getByRole('region', { name: 'Finans geçmişi' })).toContainText('Ödeme sorumlusu düzeltildi (ikinci onay)')
    await audit(kontrol, 'FN5 bölümü')
    await kontrol.context().close()
  })

  test('with a financial movement: no correction in place, "review required" with the reason', async ({ page }) => {
    await page.goto('/')
    await apiCall(page, 'POST', `/rentals/${rentalId}/finance/charges`, { kind: 'manual', description: 'E2E ek kalem', amount: '10,00', reason: 'E2E hareket testi', requestId: crypto.randomUUID() })
    await page.goto(`/kiralamalar/${rentalId}?sekme=finans`)
    const section = page.getByRole('region', { name: 'Ödeme sorumlusu düzeltmesi' })
    await expect(section).toContainText('İnceleme gerekli.')
    await expect(section).toContainText('kayıtlar değişmez kalır')
    await expect(section.getByRole('button', { name: 'Düzeltme talebi…' })).toHaveCount(0)
  })
})

test.describe('evidence photo access', () => {
  test.use({ storageState: authFile('adnan') })
  test('photos open only after this session was granted access; the grant is recorded once, opening photos records nothing', async ({ page }) => {
    await page.goto('/')
    const list = await apiCall<{ items: { id: string }[] }>(page, 'POST', '/rentals/search', { view: 'all' })
    let found: { id: string; url: string } | null = null
    for (const r of list.items) {
      const k = await apiCall<{ id: string; handover: { photos: { url: string }[] } | null }>(page, 'GET', `/rentals/${r.id}`)
      if (k.handover?.photos.length) {
        found = { id: k.id, url: k.handover.photos[0]!.url }
        break
      }
    }
    test.skip(!found, 'no rental with handover photos in this run')
    const { id, url } = found!
    // A fresh session has no grant: the photo is refused.
    const fresh = await page.context().browser()!.newContext({ storageState: authFile('kontrol') })
    const p2 = await fresh.newPage()
    await p2.goto('/')
    const before = await p2.request.get(url)
    expect(before.status()).toBe(403)
    expect((await before.json()).error.code).toBe('PHOTO_ACCESS_REQUIRED')
    // Opening the record asks for the grant; then the photo is served privately, never cached.
    await p2.goto(`/kiralamalar/${id}?sekme=teslim`)
    await expect(p2.getByText(/erişim izni verildi; izin işlem geçmişine kaydedildi/).first()).toBeVisible()
    const after = await p2.request.get(url)
    expect(after.status()).toBe(200)
    expect(after.headers()['cache-control']).toContain('no-store')
    expect(url).not.toMatch(/token|grant|key=/i)
    // Opening photos again writes no history: only the one "access granted" record.
    const history = async () => ((await apiCall<{ items: { action: string }[] }>(p2, 'GET', `/rentals/${id}/history`)).items ?? []).filter((h) => h.action === 'photo.access_granted').length
    const n = await history()
    for (let i = 0; i < 3; i++) expect((await p2.request.get(url)).status()).toBe(200)
    expect(await history()).toBe(n)
    await fresh.close()
  })
})
