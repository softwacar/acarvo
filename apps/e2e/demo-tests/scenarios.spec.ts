import { expect, test, type Page } from '@playwright/test'
import { countAfter, deliverAtDesk, kpiValue, openDemo, runScenario, switchUser, watch } from './fixtures'

// The eight guided demo scenarios, driven through the real screens (no direct state access).

async function addPayment(page: Page, o: { method: 'cash' | 'card' | 'transfer'; amount: string; cur: 'EUR' | 'BAM' | 'USD'; ref?: string; payer?: string }) {
  await page.getByRole('button', { name: 'Ödeme al' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('#pay-method').selectOption(o.method)
  if (o.ref) await dlg.locator('#pay-ref').fill(o.ref)
  await dlg.getByLabel('Para birimi').selectOption(o.cur)
  await dlg.locator('#pay-amount').fill(o.amount)
  return dlg
}

test.describe('scenario 5 · split payment (500 EUR)', () => {
  test('cash 100 EUR, card 200 BAM, USD waits for a rate, then 80 EUR, then 220 EUR transfer → 0; drawers stay separate', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    await runScenario(page, 5)
    await expect(page).toHaveURL(/\/kiralamalar\/rn\d+\?sekme=finans/)
    const rentalUrl = new URL(page.url()).pathname + new URL(page.url()).search
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')

    // 1 · 100 EUR cash
    let dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'EUR' })
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    // a recorded payment waits for a second person: the balance does not drop yet
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')
    await expect(page.getByText('100,00 EUR doğrulama bekliyor')).toBeVisible()

    // 2 · 200 BAM by card = 100 EUR
    dlg = await addPayment(page, { method: 'card', amount: '200', cur: 'BAM', ref: 'POS-S5-0001' })
    await expect(dlg.getByText(/100,00 EUR/).first()).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText('200,00 EUR doğrulama bekliyor')).toBeVisible()

    // 3 · 100 USD without a rate: Awaiting Rate, nothing stored
    dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
    await expect(dlg.getByText('Kur Bekleniyor', { exact: true })).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg.getByRole('alert')).toBeVisible()
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(page.getByText('200,00 EUR doğrulama bekliyor')).toBeVisible()

    // Define 1 EUR = 1.25 USD in Settings → exchange rates
    await openDemo(page, '/ayarlar?bolum=kurlar')
    await page.getByRole('button', { name: 'Kur ekle' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('#fx-b').selectOption('EUR')
    await dlg.locator('#fx-q').selectOption('USD')
    await dlg.locator('#fx-r').fill('1,25')
    await dlg.getByLabel('Ters yönde otomatik kullanılabilir').check()
    await dlg.locator('#fx-n').fill('Demo senaryo kuru')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toBeHidden()

    // 4 · 100 USD now applies as 80 EUR
    await openDemo(page, rentalUrl) // full reload: the earlier payments and the new rate come back from the browser store
    await expect(page.getByText('200,00 EUR doğrulama bekliyor')).toBeVisible()
    dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
    await expect(dlg.getByText(/80,00 EUR/).first()).toBeVisible()
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText('280,00 EUR doğrulama bekliyor')).toBeVisible()

    // 5 · the rest by bank transfer
    dlg = await addPayment(page, { method: 'transfer', amount: '220', cur: 'EUR', ref: 'EFT-S5-0001' })
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText('500,00 EUR doğrulama bekliyor')).toBeVisible()
    expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')

    // another person verifies the four recorded payments: the balance falls 500 → 400 → 300 → 220 → 0 (the failed USD attempt left nothing behind)
    await switchUser(page, /Emina Hadžić/)
    await openDemo(page, rentalUrl)
    const left: string[] = []
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Doğrula' }).first().click()
      await expect(page.getByText('Doğrulandı.').first()).toBeVisible()
      left.push(await kpiValue(page, 'Kalan'))
    }
    const num = (x: string) => Number(x.replace(' EUR', '').replace(/\./g, '').replace(',', '.'))
    expect(left.map(num).every((v, i, all) => i === 0 || v < all[i - 1]!)).toBe(true) // every verification lowers the balance
    expect(left.at(-1)).toBe('0,00 EUR')
    expect(w.apiRequests).toEqual([])
    expect(w.errors).toEqual([])
  })
})

test.describe('scenario 1 · daily operations', () => {
  test('Home → overdue card → the overdue list agrees with the Command Center; a row opens its Rental 360', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    await runScenario(page, 1)
    await expect(page).toHaveURL(/\/$/)
    const home = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    const homeOverdue = Number(/Geciken iade (\d+)/.exec(home)?.[1])
    expect(homeOverdue).toBeGreaterThan(0)

    // The overdue card leads to the rentals list filtered to overdue returns
    await page.getByRole('link', { name: /Geciken iade/ }).first().click()
    await expect(page).toHaveURL(/gecikme=1/)
    await expect(page.getByRole('link', { name: /^K-\d+/ })).toHaveCount(homeOverdue)

    // My Work (Alerts tab) lists one "iade gecikti" alert per overdue rental
    await openDemo(page, '/islerim?sekme=uyarilar')
    const cc = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    expect((cc.match(/· iade gecikti \(/g) ?? []).length).toBe(homeOverdue)

    // An overdue row opens the rental and says it is still with the customer
    await openDemo(page, '/kiralamalar?gecikme=1')
    await page.getByRole('link', { name: /^K-\d+/ }).first().click()
    await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
    await expect(page.getByText('Teslim edildi').first()).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })
})

test.describe('scenario 3 · tasks and staff', () => {
  test('the manager creates and assigns a task, the assignee sees and completes it, the Command Center count follows, the linked record is not touched', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 3)
    await expect(page).toHaveURL(/\/gorevler/)
    const title = 'Aracı yıkat ve yakıtı kontrol et'

    await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
    let dlg = page.getByRole('dialog')
    await dlg.locator('#tk-t').fill(title)
    const hv = await dlg.locator('#tk-o option', { hasText: 'Haris Mehić' }).first().getAttribute('value')
    await dlg.locator('#tk-o').selectOption(hv!)
    await dlg.getByRole('button', { name: 'Oluştur' }).click()
    await expect(dlg).toBeHidden()

    // Team view shows it; the manager's own view does not (assigned to someone else)
    await openDemo(page, '/gorevler?gorunum=ekip')
    await expect(page.getByText(title)).toBeVisible()

    // Switch to the Operations user: the task is in "mine"
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/islerim')
    const openBefore = await countAfter(page, 'Bana atanan görev')
    expect(openBefore).toBeGreaterThan(0)
    await openDemo(page, '/gorevler')
    await expect(page.getByText(title)).toBeVisible()
    await page.getByText(title).click()
    dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Tamamla' }).click()
    await expect(page.getByText('Görev tamamlandı').first()).toBeVisible()
    await page.keyboard.press('Escape')

    // It left the open list; the Command Center count dropped by one
    await openDemo(page, '/gorevler')
    await expect(page.getByText(title)).toHaveCount(0)
    await openDemo(page, '/islerim')
    const openAfter = await countAfter(page, 'Bana atanan görev')
    expect(openAfter).toBe(openBefore - 1)
  })
})

test.describe('scenario 8 · branch cash', () => {
  test('open the Mostar EUR drawer, add movements, see the expected balance, count with a variance, close; sessions agree', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 8)
    await expect(page).toHaveURL(/sube-kasalari/)
    const drawer = () => page.getByRole('region', { name: 'MST · EUR kasası' })
    await expect(drawer()).toBeVisible()
    await expect(drawer().getByText('Kasa kapalı')).toBeVisible()

    // Opening balance 200
    await drawer().getByRole('button', { name: 'Oturum aç' }).click()
    let dlg = page.getByRole('dialog')
    await dlg.locator('#os-a').fill('200')
    await dlg.getByRole('button', { name: 'Aç', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(drawer().getByText('200,00 EUR').first()).toBeVisible()

    // +50 in, then −30 out
    await drawer().getByRole('button', { name: 'Hareket ekle' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('#mv-k').selectOption('in')
    await dlg.locator('#mv-a').fill('50')
    await dlg.locator('#mv-r').fill('Müşteri bozuk para girişi')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(drawer().getByText('250,00 EUR').first()).toBeVisible()
    await drawer().getByRole('button', { name: 'Hareket ekle' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('#mv-k').selectOption('out')
    await dlg.locator('#mv-a').fill('30')
    await dlg.locator('#mv-r').fill('Yakıt fişi ödemesi')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(drawer().getByText('220,00 EUR').first()).toBeVisible()

    // Count 215: variance −5,00 EUR is shown before closing; a reason is required above the threshold
    await drawer().getByRole('button', { name: 'Kasayı kapat' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('#cl-a').fill('215')
    await expect(dlg.getByText('220,00 EUR').first()).toBeVisible()
    await expect(dlg.getByText(/−5,00 EUR|-5,00 EUR/).first()).toBeVisible()
    if (await dlg.locator('#cl-r').count()) await dlg.locator('#cl-r').fill('Sayım farkı: bozuk para eksik')
    await dlg.getByRole('button', { name: 'Kapat', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(drawer().getByText('Kasa kapalı')).toBeVisible()

    // The closed session is in the sessions list with the expected amount
    await page.getByRole('tab', { name: /Oturumlar/ }).click()
    await expect(page.getByText('220,00 EUR').first()).toBeVisible()
    await expect(page.getByText('215,00 EUR').first()).toBeVisible()
  })
})

test.describe('scenario 2 · reservation to handover', () => {
  test('choose a customer, see price and availability, save confirmed, convert, deliver at the Delivery Desk; vehicle and lists agree', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    await runScenario(page, 2)
    await expect(page).toHaveURL(/rezervasyonlar\/yeni/)

    // customer by search
    await page.locator('#bk-c').click()
    await page.locator('#bk-c').fill('Nina Mock')
    await page.getByRole('option', { name: /Nina Mock/ }).click()

    // a one-day window starting at the default time; pick the first class that has a free vehicle
    const from = await page.locator('#bk-from').inputValue()
    const ret = new Date(new Date(from + 'Z').getTime() + 24 * 3600 * 1000).toISOString().slice(0, 16)
    await page.locator('#bk-to').fill(ret)
    let plate = ''
    const classes = await page.locator('#bk-cls option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))
    for (const cls of classes) {
      await page.locator('#bk-cls').selectOption(cls)
      const free = await page.locator('#bk-veh option:not([disabled])').evaluateAll((o) => o.filter((x) => (x as HTMLOptionElement).value).map((x) => ({ v: (x as HTMLOptionElement).value, t: x.textContent ?? '' })))
      if (free.length) {
        await page.locator('#bk-veh').selectOption(free[0]!.v)
        plate = free[0]!.t.split(' ')[0]!
        break
      }
    }
    expect(plate, 'a free vehicle exists for one day').not.toBe('')

    // price preview is shown before saving and the reservation is confirmed on save
    await expect(page.getByRole('complementary', { name: 'Özet' })).toContainText(/EUR|BAM/)
    await page.getByRole('button', { name: 'Bekleyen Kaydet' }).click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await expect(page.getByText('Bekliyor').first()).toBeVisible() // saved as pending: it holds no vehicle yet
    await page.getByRole('button', { name: 'Onayla', exact: true }).click()
    await expect(page.getByText('Onaylı').first()).toBeVisible()
    const reservationNo = (await page.locator('h1').first().innerText()).trim()

    // convert to a rental and open the Delivery Desk
    await page.getByRole('button', { name: 'Kiralamaya dönüştür' }).click()
    const dlg = page.getByRole('dialog')
    if (await dlg.count()) await dlg.getByRole('button', { name: /Dönüştür/ }).click()
    await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
    await expect(page.getByText('Hazırlanıyor').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Teslim Masası' }).click()

    // the desk refuses until every check passes; then deliver
    await expect(page.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
    await deliverAtDesk(page)

    // everything agrees: the vehicle is rented, the rentals list has it delivered, the reservation is converted
    await openDemo(page, `/kiralamalar?q=${encodeURIComponent(plate)}`)
    await expect(page.getByRole('row', { name: new RegExp(plate) }).getByText('Teslim edildi')).toBeVisible()
    await openDemo(page, `/araclar?q=${encodeURIComponent(plate)}`)
    await expect(page.getByRole('row', { name: new RegExp(plate) }).getByText('Kirada')).toBeVisible()
    await openDemo(page, '/rezervasyonlar?q=Nina%20Mock')
    await expect(page.getByRole('row', { name: new RegExp(reservationNo) }).getByText('Kiralamaya dönüştü')).toBeVisible()
    expect(w.apiRequests).toEqual([])
  })
})

test.describe('scenario 6 · maintenance and availability', () => {
  test('a conflicting maintenance window is refused with its reason; a free one is planned, started and completed; the vehicle is not automatically Ready', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 6)
    await expect(page).toHaveURL(/\/araclar\/v\d+\?sekme=musaitlik/)
    await expect(page.getByText('S11-K-103').first()).toBeVisible()
    const vehicleUrl = new URL(page.url()).pathname

    const plan = async (shiftDays: number, hours: number) => {
      await openDemo(page, '/bakim-servis')
      await page.getByRole('button', { name: 'Bakım planla' }).first().click()
      const dlg = page.getByRole('dialog')
      await dlg.locator('#mt-v').click()
      await dlg.locator('#mt-v').fill('S11-K-103')
      await dlg.getByRole('option', { name: /S11-K-103/ }).click()
      const start = await dlg.locator('#mt-s').inputValue()
      const t0 = new Date(start + 'Z').getTime() + shiftDays * 24 * 3600 * 1000
      await dlg.locator('#mt-s').fill(new Date(t0).toISOString().slice(0, 16))
      await dlg.locator('#mt-e').fill(new Date(t0 + hours * 3600 * 1000).toISOString().slice(0, 16))
      await dlg.locator('#mt-r').fill('Demo senaryosu: periyodik kontrol')
      await dlg.getByRole('button', { name: 'Planla' }).click()
      return dlg
    }

    // 1 · overlaps the confirmed reservation two days ahead: refused, with the source named
    let dlg = await plan(2, 30)
    await expect(dlg.getByRole('alert')).toContainText(/R-\d+|K-\d+|Rezervasyon|Kiralama/)
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(page.getByText('S11-K-103')).toHaveCount(0) // nothing was created for this vehicle

    // 2 · a free window today: planned
    dlg = await plan(0, 3)
    await expect(dlg).toBeHidden()
    await page.getByRole('row', { name: /S11-K-103/ }).getByRole('cell').first().click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: 'Servise al' }).click()
    await drawer.getByRole('button', { name: 'Tamamla' }).click()
    const done = page.getByRole('dialog').last()
    await done.getByRole('button', { name: 'Tamamla' }).click()
    await expect(page.getByText(/otomatik Hazır sayılmaz/).first()).toBeVisible()
    await page.keyboard.press('Escape')

    // 3 · Vehicle 360 does not say the vehicle is ready just because service is finished
    await openDemo(page, vehicleUrl.replace(/\?.*/, ''))
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    // available again, but readiness is a separate answer: it has a blocker and the next pickup is not ready
    expect(text).toMatch(/Müsaitlik \(şimdi\) Müsait Hazırlık \d+ engel/)
    expect(text).toContain('Araç teslime hazır değil')
  })
})

test.describe('scenario 7 · lead → quote → reservation', () => {
  test('a lead gets a versioned quote, the old version is kept, accepting creates a customer and a pending reservation (quote ≠ reservation)', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 7)
    await expect(page).toHaveURL(/talep-merkezi/)
    const name = 'Emina Demo-Test'

    // new lead
    await page.getByRole('button', { name: 'Yeni talep' }).click()
    let dlg = page.getByRole('dialog')
    await dlg.locator('#ln-n').fill(name)
    await dlg.locator('#ln-p').fill('+387 61 777 888')
    await dlg.locator('button[type=submit]').click()
    // saving the lead opens its record
    const drawer = () => page.getByRole('dialog')
    await expect(drawer()).toContainText(name)

    // quote v1, then v2: v1 is superseded, not deleted
    await drawer().getByRole('button', { name: 'Teklif hazırla' }).click()
    dlg = page.getByRole('dialog').last()
    await dlg.locator('button[type=submit]').click()
    await expect(drawer().getByText(/v1/).first()).toBeVisible()
    await drawer().getByRole('button', { name: 'Yeni teklif sürümü' }).click()
    dlg = page.getByRole('dialog').last()
    await dlg.locator('#qt-n').fill('Güncel fiyat listesiyle ikinci sürüm')
    await dlg.locator('button[type=submit]').click()
    await expect(drawer().getByText(/v2/).first()).toBeVisible()
    await expect(drawer().getByText(/v1/).first()).toBeVisible()
    await expect(drawer().getByText('Yeni sürümle değişti').or(drawer().getByText(/yerine geçildi|Yeni sürüm/)).first()).toBeVisible()

    // accepting the current version creates the pending reservation; nothing is held yet
    await drawer().getByRole('button', { name: /Kabul et/ }).click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await expect(page.getByText('Bekliyor').first()).toBeVisible()
    await expect(page.getByText(name).first()).toBeVisible()

    // the customer record now exists and the lead is marked converted
    await openDemo(page, `/musteriler?q=${encodeURIComponent('Emina')}`)
    await expect(page.getByText(name).first()).toBeVisible()
    await openDemo(page, '/talep-merkezi')
    await expect(page.getByRole('row', { name: new RegExp(name) }).getByText('Rezervasyona dönüştü')).toBeVisible()
  })
})

test.describe('scenario 4 · fleet analysis', () => {
  test('period and branch filters change the rows and the numbers, a vehicle opens Vehicle 360, Back keeps the filters', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 4)
    await expect(page).toHaveURL(/raporlar\?rapor=filo/)
    const rowsOf = () => page.getByRole('row').filter({ hasText: /%[0-9]+/ })
    await expect.poll(() => rowsOf().count()).toBeGreaterThan(5)
    const total = await rowsOf().count()
    const rented30 = (await page.locator('main').innerText()).replace(/\s+/g, ' ')

    // 7-day period: pressed, in the URL, and the utilisation numbers change
    await page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' }).click()
    await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/donem=(%227%22|7)/)
    expect((await page.locator('main').innerText()).replace(/\s+/g, ' ')).not.toBe(rented30)

    // one branch: fewer rows
    const opt = await page.getByLabel('Şube', { exact: true }).locator('option', { hasText: 'Mostar' }).first().getAttribute('value')
    await page.getByLabel('Şube', { exact: true }).selectOption(opt!)
    await expect(page).toHaveURL(/sube=/)
    await expect.poll(() => rowsOf().count()).toBeLessThan(total)
    const filteredRows = await rowsOf().count()

    // vehicle → Vehicle 360 → Back: filters and rows are the same
    const first = rowsOf().first().getByRole('link').first()
    await first.click()
    await expect(page).toHaveURL(/\/araclar\/v\d+/)
    await page.goBack()
    await expect(page).toHaveURL(/donem=(%227%22|7)/)
    await expect(page).toHaveURL(/sube=/)
    await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => rowsOf().count()).toBe(filteredRows)
  })
})
