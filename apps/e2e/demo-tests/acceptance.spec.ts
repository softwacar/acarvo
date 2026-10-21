import { expect, test, type Page } from '@playwright/test'
import { openDemo, switchUser, watch } from './fixtures'

// Final acceptance of the Frontend V1 sprint: the ten items that were only partly covered (A4, A6, A7, B4, B5, C3, C6, D3) plus
// the two-tab task race. Everything runs in the browser demo; nothing here is a server guarantee.

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' })

// ---------------------------------------------------------------------------------------------------------------- A4
test.describe('A4 · deferred modules are not found by the normal search', () => {
  const DEFERRED_NAMES = ['Partnerler', 'Kurallar', 'Talep Merkezi', 'Fırsatlar', 'Filo Asistanı', 'Araç Tedarikçileri']
  for (const name of DEFERRED_NAMES)
    test(`searching "${name}" offers no deferred screen and the menu has no such link`, async ({ page }) => {
      await openDemo(page, '/')
      await page.keyboard.press('Control+k')
      const box = page.getByRole('combobox', { name: 'Ara' })
      await box.fill(name)
      await page.waitForTimeout(250)
      const options = await page.getByRole('option').allInnerTexts()
      expect(options.filter((o) => new RegExp(name, 'i').test(o)), `search results for "${name}"`).toEqual([])
      await page.keyboard.press('Escape')
      await expect(sidebar(page).getByRole('link', { name: new RegExp(name, 'i') })).toHaveCount(0)
    })
  test('control: a V1 screen is found by the same search', async ({ page }) => {
    await openDemo(page, '/')
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Ara' }).fill('Görevler')
    await expect(page.getByRole('option', { name: /Görevler/ }).first()).toBeVisible()
  })
  test('the preview does not put them into the menu either', async ({ page }) => {
    await openDemo(page, '/partnerler')
    await page.getByRole('button', { name: /Gelişmiş konsept ön izlemesini aç/ }).click()
    await expect(sidebar(page).getByRole('link')).toHaveCount(21)
    await expect(sidebar(page).getByRole('link', { name: /Partnerler/ })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------- A6
test.describe('A6 · old addresses keep their tab, view, filter and Back behaviour', () => {
  test('Roles and Permissions → Users and Roles, Roles tab; reload and Back keep the tab', async ({ page }) => {
    await openDemo(page, '/')
    await openDemo(page, '/roller-ve-yetkiler')
    await expect(page).toHaveURL(/\/kullanicilar\?sekme=roller/)
    await expect(page.getByRole('tab', { name: 'Roller' })).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('tab', { name: 'Roller' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Kullanıcılar' }).click()
    await expect(page.getByRole('tab', { name: 'Kullanıcılar' })).toHaveAttribute('aria-selected', 'true')
    // tab changes replace the history entry: Back leaves the screen for the one the person came from, never to a stale old address
    await page.goBack()
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })
  test('Fleet Analysis with a period → Reports, Fleet report, the period kept and pressed', async ({ page }) => {
    await openDemo(page, '/filo-analizi?donem=7')
    await expect(page).toHaveURL(/\/raporlar\?/)
    expect(page.url()).toContain('rapor=filo')
    expect(page.url()).toMatch(/donem=(%227%22|7)/)
    await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')
  })
  test('Contracts with a search → Rentals, Contracts view, the search kept', async ({ page }) => {
    await openDemo(page, '/sozlesmeler?q=Selma')
    await expect(page).toHaveURL(/\/kiralamalar\?/)
    expect(page.url()).toContain('gorunum=sozlesmeler')
    expect(page.url()).toContain('q=Selma')
    await expect(page.getByRole('searchbox').or(page.getByRole('textbox', { name: /ara/i })).first()).toHaveValue('Selma')
  })
  test('Revenue Control → Finance, Attention tab; a chosen tab survives a reload', async ({ page }) => {
    await openDemo(page, '/')
    await openDemo(page, '/gelir-kontrolu')
    await expect(page).toHaveURL(/\/finans\?sekme=dikkat/)
    await expect(page.getByRole('tab', { name: 'Dikkat' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: /^Ödemeler/ }).click()
    await expect(page.getByRole('tab', { name: /^Ödemeler/ })).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('tab', { name: /^Ödemeler/ })).toHaveAttribute('aria-selected', 'true')
  })
  test('Risks and Exceptions with a severity filter → My Work, Alerts tab, the filter kept', async ({ page }) => {
    await openDemo(page, '/riskler-ve-istisnalar?onem=critical')
    await expect(page).toHaveURL(/\/islerim\?/)
    expect(page.url()).toContain('sekme=uyarilar')
    expect(page.url()).toContain('onem=critical')
    await expect(page.getByRole('tab', { name: /Uyarılar/ })).toHaveAttribute('aria-selected', 'true')
  })
  test('Capacity Planning → Calendar capacity view, which is a V1.5 view: not active without the preview', async ({ page }) => {
    await openDemo(page, '/kapasite-planlama')
    await expect(page).toHaveURL(/\/takvim\?gorunum=kapasite/)
    await expect(page.getByText(/Kapasite — bu sürümde etkin değil/)).toBeVisible()
  })
  test('an old address does not trap the Back button: Back returns to where the person came from', async ({ page }) => {
    await openDemo(page, '/musteriler')
    await openDemo(page, '/komuta-merkezi')
    await expect(page).toHaveURL(/\/islerim/)
    await page.goBack()
    await expect(page).toHaveURL(/\/musteriler$/)
  })
  test('a record opened from the new screen and Back return to the same tab', async ({ page }) => {
    await openDemo(page, '/gelir-kontrolu')
    const link = page.locator('main a[href^="/kiralamalar/"], main a[href^="/rezervasyonlar/"]').first()
    if (await link.count()) {
      await link.click()
      await page.goBack()
      await expect(page).toHaveURL(/\/finans\?sekme=dikkat/)
      await expect(page.getByRole('tab', { name: 'Dikkat' })).toHaveAttribute('aria-selected', 'true')
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------- A7
test.describe('A7 · Calendar and Vehicle availability show the same holds', () => {
  test('the rental and the reservation that hold one vehicle are the same links on both screens', async ({ page }) => {
    await openDemo(page, '/kiralamalar?q=K-000028')
    const rentalHref = (await page.locator('main a[href^="/kiralamalar/rn"]').first().getAttribute('href'))!
    await openDemo(page, '/rezervasyonlar?q=R-000023')
    const reservationHref = (await page.locator('main a[href^="/rezervasyonlar/rsv"]').first().getAttribute('href'))!
    await openDemo(page, '/araclar?q=S11-K-101')
    const vehicleHref = (await page.locator('main a[href^="/araclar/v"]').first().getAttribute('href'))!

    await openDemo(page, `${vehicleHref}?sekme=musaitlik&gun=30`)
    for (const href of [rentalHref, reservationHref]) await expect(page.locator(`main a[href="${href}"]`), `Vehicle 360 → ${href}`).not.toHaveCount(0)

    await openDemo(page, '/takvim?gorunum=hafta')
    for (const href of [rentalHref]) await expect(page.locator(`main a[href="${href}"]`), `Calendar → ${href}`).not.toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------- B4
test.describe('B4 · the Approval Center knows exactly six types', () => {
  test('the request dialog offers the six formal types and no other', async ({ page }) => {
    await openDemo(page, '/onay-merkezi')
    await page.getByRole('button', { name: 'Yeni talep' }).first().click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByText('Yeni onay talebi')).toBeVisible()
    const options = (await dlg.getByLabel('Onay türü').locator('option').allInnerTexts()).map((o) => o.trim())
    expect(options).toEqual(['Yüksek İndirim', 'Depozito İstisnası', 'İade', 'Finansal Düzeltme', 'Kurumsal Kredi İstisnası', 'Partner Komisyon Düzeltmesi'])
  })
  for (const type of ['Yüksek İndirim', 'Depozito İstisnası', 'İade', 'Finansal Düzeltme', 'Kurumsal Kredi İstisnası', 'Partner Komisyon Düzeltmesi'])
    test(`${type}: a target can be chosen and the request form opens`, async ({ page }) => {
      await openDemo(page, '/onay-merkezi')
      await page.getByRole('button', { name: 'Yeni talep' }).first().click()
      const dlg = page.getByRole('dialog')
      await dlg.getByLabel('Onay türü').selectOption({ label: type })
      await dlg.locator('#nr-g').click()
      const option = page.getByRole('listbox').getByRole('option').first()
      await expect(option).toBeVisible()
      await option.click()
      await dlg.getByRole('button', { name: 'Devam' }).click()
      await expect(page.getByRole('dialog').getByText(`Onay talebi: ${type}`)).toBeVisible()
    })
  test('a High Discount request goes through request → another person approves → applied; My Work adds no seventh kind', async ({ page }) => {
    await openDemo(page, '/onay-merkezi')
    await page.getByRole('button', { name: 'Yeni talep' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Onay türü').selectOption({ label: 'Yüksek İndirim' })
    await dlg.locator('#nr-g').click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await dlg.getByRole('button', { name: 'Devam' }).click()
    const form = page.getByRole('dialog')
    await form.locator('#ap-p').fill('12')
    await form.locator('#ap-r').fill('Uzun süreli müşteri için yüzde on iki indirim.')
    await form.getByRole('button', { name: 'Talep et' }).click()
    await expect(form).toBeHidden()
    // the requester cannot decide their own request; another person approves, then applies (Approved ≠ Applied)
    await switchUser(page, /Selma Karić/)
    await openDemo(page, '/onay-merkezi')
    await page.getByRole('tab', { name: /Tümü/ }).click()
    await page.getByRole('row', { name: /Yüksek İndirim.*%12/ }).first().click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /Onayla/ }).click()
    await expect(drawer.getByText(/Onaylandı/).first()).toBeVisible()
    await drawer.getByRole('button', { name: /Uygula/ }).click()
    await expect(drawer.getByText(/Uygulandı/).first()).toBeVisible()
    await page.keyboard.press('Escape')
    // My Work lists approvals under the one kind "Onay": its kind filter has no per-type entry
    await openDemo(page, '/islerim')
    const kinds = await page.getByRole('button', { name: /^(Hepsi|Görevler|Onaylar|Müdahale)$/ }).allInnerTexts()
    expect(kinds).toEqual(['Hepsi', 'Görevler', 'Onaylar', 'Müdahale'])
  })
})

// ---------------------------------------------------------------------------------------------------------------- B5
test.describe('B5 · a person without finance permission learns nothing about money', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/')
    await switchUser(page, /Kenan Pašić/) // Fleet Officer: fleet, maintenance and damage only
  })
  test('Home has no finance block and no money amounts; the menu has no finance links', async ({ page }) => {
    await openDemo(page, '/')
    await expect(page.getByRole('heading', { name: /Finans/ })).toHaveCount(0)
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    expect(text).not.toMatch(/\d[\d.,]* (EUR|BAM|USD)/)
    for (const name of ['Finans', 'Masraflar', 'Şube Kasaları', 'Raporlar', 'Onay Merkezi']) await expect(sidebar(page).getByRole('link', { name, exact: true })).toHaveCount(0)
  })
  for (const route of ['/finans', '/finans?sekme=kaparo', '/masraflar', '/sube-kasalari', '/raporlar?rapor=finans', '/onay-merkezi', '/kiralamalar'])
    test(`${route} shows the reason and no data`, async ({ page }) => {
      await openDemo(page, route)
      await expect(page.getByText('Bu ekran için yetkiniz yok')).toBeVisible()
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      expect(text).not.toMatch(/\d[\d.,]* (EUR|BAM|USD)/)
      expect(text).not.toMatch(/T-0000\d\d|POS-DEMO/)
    })
  test('search finds no payment or advance reference', async ({ page }) => {
    await openDemo(page, '/')
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Ara' }).fill('POS-DEMO')
    await page.waitForTimeout(300)
    expect(await page.getByRole('option').allInnerTexts()).toEqual([])
    await page.getByRole('combobox', { name: 'Ara' }).fill('T-000041')
    await page.waitForTimeout(300)
    expect(await page.getByRole('option').allInnerTexts()).toEqual([])
  })
  test('My Work counts no approval and no payment alert; the bell shows no finance text', async ({ page }) => {
    await openDemo(page, '/islerim')
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    expect(text).not.toMatch(/Onay ON-\d+|ödeme|depozito|kaparo/i)
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    const bell = (await page.getByRole('menu').innerText()).replace(/\s+/g, ' ')
    expect(bell).not.toMatch(/\d[\d.,]* (EUR|BAM|USD)|ödeme|kaparo|depozito/i)
  })
})

// ---------------------------------------------------------------------------------------------------------------- C3
test.describe('C3 · a task is linked to each kind of record, and back', () => {
  const ADD = async (page: Page, title: string) => {
    await page.getByRole('button', { name: 'Görev ekle' }).click()
    const dlg = page.getByRole('dialog').last()
    await expect(dlg.getByTestId('task-link')).toBeVisible()
    const field = dlg.getByLabel(/Başlık/)
    await field.fill((await field.inputValue()) + title)
    await dlg.getByLabel('Sorumlu').selectOption({ label: 'Adnan Kovač — Şirket sahibi' })
    await dlg.getByRole('button', { name: 'Oluştur' }).click()
    await expect(page.getByTestId('task-link')).toHaveCount(0) // the task dialog closed
  }
  const CASES: { kind: string; open: (page: Page) => Promise<void>; back: RegExp }[] = [
    { kind: 'araç', open: async (p) => { await openDemo(p, '/araclar/v1?sekme=gorevler') }, back: /\/araclar\/v1/ },
    { kind: 'rezervasyon', open: async (p) => { await openDemo(p, '/rezervasyonlar/rsv23'); await p.getByRole('tab', { name: /^Görevler/ }).click() }, back: /\/rezervasyonlar\/rsv23/ },
    { kind: 'kiralama', open: async (p) => { await openDemo(p, '/kiralamalar/rn37'); await p.getByRole('tab', { name: /^Görevler/ }).click() }, back: /\/kiralamalar\/rn37/ },
    { kind: 'müşteri', open: async (p) => { await openDemo(p, '/musteriler/c3'); await p.getByRole('tab', { name: /^Görevler/ }).click() }, back: /\/musteriler\/c3/ },
    {
      kind: 'bakım',
      open: async (p) => {
        await openDemo(p, '/bakim-servis')
        await p.getByRole('row').nth(1).click()
      },
      back: /\/bakim-servis/,
    },
    {
      kind: 'hasar',
      open: async (p) => {
        await openDemo(p, '/hasar-ve-olaylar')
        await p.getByRole('row').nth(1).click()
      },
      back: /\/hasar-ve-olaylar/,
    },
  ]
  for (const c of CASES)
    test(`${c.kind}: created from the record, listed on it, listed in Görevler, and the link leads back`, async ({ page }) => {
      const w = watch(page)
      const title = `Bağlı görev denemesi (${c.kind})`
      await c.open(page)
      await ADD(page, title)
      await expect(page.getByText(title).first()).toBeVisible() // listed on the record itself
      await openDemo(page, '/gorevler?gorunum=ekip&q=' + encodeURIComponent(title))
      await page.getByText(title).first().click()
      const drawer = page.getByRole('dialog')
      const link = drawer.getByRole('link', { name: /.+/ }).filter({ hasNot: page.getByText('Kapat') }).last()
      await expect(drawer.getByText('Bağlı kayıt')).toBeVisible()
      await link.click()
      await expect(page).toHaveURL(c.back)
      expect(w.apiRequests).toEqual([])
    })
  test('completing the task leaves the record as it was (a rental stays rented / prepared)', async ({ page }) => {
    await openDemo(page, '/kiralamalar/rn37')
    const statusBefore = (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/(Hazırlanıyor|Teslim edildi|İade alındı|Kapandı|Operasyonel kapandı)/)?.[1]
    await page.getByRole('tab', { name: /^Görevler/ }).click()
    await ADD(page, 'Tamamlanınca kaydı değiştirmemeli')
    await openDemo(page, '/gorevler?q=' + encodeURIComponent('Tamamlanınca kaydı değiştirmemeli'))
    await page.getByText('Tamamlanınca kaydı değiştirmemeli').first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Tamamla' }).click()
    await expect(page.getByText('Görev tamamlandı').first()).toBeVisible()
    await openDemo(page, '/kiralamalar/rn37')
    const statusAfter = (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/(Hazırlanıyor|Teslim edildi|İade alındı|Kapandı|Operasyonel kapandı)/)?.[1]
    expect(statusAfter).toBe(statusBefore)
  })
})

// ---------------------------------------------------------------------------------------------------------------- C6
test.describe('C6 · task notifications reach the right person, in the app only', () => {
  const bell = async (page: Page) => {
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    const text = (await page.getByRole('menu').innerText()).replace(/\s+/g, ' ')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    return text
  }
  test('an assignment, a hand-over and a completion land in the inbox of the person concerned and nobody else', async ({ page }) => {
    const w = watch(page)
    const title = 'Bildirim denemesi görevi'
    await openDemo(page, '/gorevler')
    await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
    let dlg = page.getByRole('dialog')
    await dlg.locator('#tk-t').fill(title)
    await dlg.getByLabel('Sorumlu').selectOption({ label: 'Haris Mehić — Resepsiyon · SJJ' })
    await dlg.getByLabel(/Şube/).selectOption({ label: 'SJJ · Sarajevo Havalimanı' })
    await dlg.getByRole('button', { name: 'Oluştur' }).click()
    await expect(dlg).toBeHidden()
    expect(await bell(page)).not.toContain(title) // the creator is not notified of their own assignment

    await switchUser(page, /Lejla Šehović/)
    await openDemo(page, '/')
    expect(await bell(page)).not.toContain(title) // an uninvolved person gets nothing

    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/')
    expect(await bell(page)).toContain(`Size görev atandı: ${title}`)

    // Haris hands it over to Selma Karić; she is told, Haris is not
    await openDemo(page, '/gorevler?q=' + encodeURIComponent(title))
    await page.getByText(title).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Devret' }).click()
    dlg = page.getByRole('dialog').last()
    await dlg.getByLabel('Yeni sorumlu').selectOption({ label: 'Selma Karić — Operasyon müdürü' })
    await dlg.getByRole('button', { name: 'Devret' }).click()
    await expect(page.getByText('Görev devredildi.').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await switchUser(page, /Selma Karić/)
    await openDemo(page, '/')
    expect(await bell(page)).toContain(`Görev size devredildi: ${title}`)

    // Selma completes it; the creator (Adnan) is told
    await openDemo(page, '/gorevler?q=' + encodeURIComponent(title))
    await page.getByText(title).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Tamamla' }).click()
    await expect(page.getByText('Görev tamamlandı').first()).toBeVisible()
    await page.keyboard.press('Escape') // close the task drawer first
    await switchUser(page, /Adnan Kovač/)
    await openDemo(page, '/')
    expect(await bell(page)).toContain(`Görev tamamlandı: ${title}`)
    expect(w.apiRequests).toEqual([]) // in-app only: no e-mail or SMS service is contacted
  })
})

// ---------------------------------------------------------------------------------------------------------------- D3
test.describe('D3 · quick customer → reservation → reopen', () => {
  test('a customer created inside the reservation form is saved with the reservation and can be reopened', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/rezervasyonlar/yeni')
    await page.getByRole('button', { name: 'Yeni müşteri ekle' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#nc-n').fill('Hızlı Müşteri Deneme')
    await dlg.locator('#nc-p').fill('+387 61 555 123')
    if (await dlg.locator('#nc-d').count()) await dlg.locator('#nc-d').fill('1990-05-14')
    if (await dlg.locator('#nc-ly').count()) await dlg.locator('#nc-ly').fill('2012')
    await dlg.getByRole('button', { name: 'Müşteriyi oluştur' }).click()
    await expect(page.getByText('Müşteri oluşturuldu.').first()).toBeVisible()
    await expect(dlg).toBeHidden()
    // the form now carries the new customer; save the reservation as pending
    await expect(page.locator('#bk-c')).toHaveValue(/Hızlı Müşteri Deneme/)
    await page.getByRole('button', { name: 'Bekleyen Kaydet' }).click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    const url = page.url()
    await expect(page.getByText('Hızlı Müşteri Deneme').first()).toBeVisible()
    await expect(page.getByText('Bekliyor').first()).toBeVisible()
    // reopen after a full reload: the reservation and its customer are still there and linked
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(url)
    await expect(page.getByText('Hızlı Müşteri Deneme').first()).toBeVisible()
    await page.getByRole('link', { name: 'Hızlı Müşteri Deneme' }).first().click()
    await expect(page).toHaveURL(/\/musteriler\/c\d+/)
    await expect(page.getByRole('heading', { name: 'Hızlı Müşteri Deneme' })).toBeVisible()
    await page.getByRole('tab', { name: /Rezervasyon ve kiralamalar/ }).click()
    await expect(page.getByText(/R-\d+/).first()).toBeVisible()
    // the new customer is in the list too (one record, not two)
    await openDemo(page, '/musteriler?q=' + encodeURIComponent('Hızlı Müşteri'))
    await expect(page.getByRole('row').filter({ hasText: 'Hızlı Müşteri Deneme' })).toHaveCount(1)
    expect(w.apiRequests).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------- task race
test.describe('two tabs: the same pool task', () => {
  test('a second person with the task open sees it taken once the first person has claimed it, and can no longer claim it', async ({ page, context }) => {
    const title = 'Havalimanı otopark kartlarını yenileyin' // pool task of Sarajevo
    await openDemo(page, '/gorevler?gorunum=havuz&q=' + encodeURIComponent(title))
    await page.getByText(title).first().click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Üstlen' })).toBeVisible()

    const other = await context.newPage()
    await openDemo(other, '/')
    await switchUser(other, /Haris Mehić/)
    await openDemo(other, '/gorevler?gorunum=havuz&q=' + encodeURIComponent(title))
    await other.getByText(title).first().click()
    await expect(other.getByRole('dialog').getByRole('button', { name: 'Üstlen' })).toBeVisible()

    // the owner claims first
    await page.getByRole('dialog').getByRole('button', { name: 'Üstlen' }).click()
    await expect(page.getByText('Görevi üstlendiniz.').first()).toBeVisible()

    // the other tab adopts the saved state: it names the owner and offers no claim
    // a task that is taken is no longer one this person may claim: its drawer closes and its row leaves the pool
    await expect(other.getByRole('dialog')).toBeHidden({ timeout: 10_000 })
    await expect(other.getByText(title)).toHaveCount(0)
  })
})
