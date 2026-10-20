# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 5 · split payment (500 EUR) >> cash 100 EUR, card 200 BAM, USD waits for a rate, then 80 EUR, then 220 EUR transfer → 0; drawers stay separate
- Location: demo-tests\scenarios.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').getByText(/80,00 EUR/).first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog').getByText(/80,00 EUR/).first() with timeout 8000ms
  - waiting for getByRole('dialog').getByText(/80,00 EUR/).first()

```

```yaml
- status
- dialog "Ödeme ekle":
  - heading "Ödeme ekle" [level=2]
  - paragraph: "Önce ödeyeni, yöntemi, para birimini ve tutarı girin; kur varsa uygulanan eşdeğer gösterilir. Gerçek POS veya banka işlemi yapılmaz: yalnız kayıt tutulur."
  - text: Şube / kasa
  - combobox "Şube / kasa":
    - option "SJJ · Sarajevo Havalimanı" [selected]
    - option "MST · Mostar Merkez"
    - option "DBV · Dubrovnik Havalimanı"
  - text: Ödeyen
  - combobox "Ödeyen":
    - 'option "Kiracı: Ajla Testović" [selected]'
    - option "Başka kişi veya kurum"
  - paragraph: Ödemeyi yapan kişi ile hukuken sorumlu kiracı aynı kabul edilmez.
  - text: Yöntem
  - combobox "Yöntem":
    - option "Nakit" [selected]
    - option "Kart (POS)"
    - option "Banka havalesi"
    - option "Diğer"
  - text: Tahsil edilen tutar (zorunlu)
  - textbox "Tahsil edilen tutar (zorunlu)": "100"
  - combobox "Para birimi":
    - option "EUR"
    - option "BAM"
    - option "USD" [selected]
  - button "Kalanı öde (300,00 EUR karşılığı USD)"
  - img
  - paragraph: Kur Bekleniyor
  - paragraph: USD → EUR için işletme kuru tanımlı değil (Kur Bekleniyor). Ayarlar → Döviz Kurları'ndan tanımlayın.
  - link "Kur Ayarlarına git":
    - /url: /ayarlar?bolum=kurlar
  - paragraph: Bu satır kaydedilmez ve bakiye değişmez.
  - paragraph: "Nakit USD kasasına girer. Kasadaki beklenen: 300,00 USD."
  - text: Not (isteğe bağlı)
  - textbox "Not (isteğe bağlı)"
  - term: Mevcut açık bakiye
  - definition: 300,00 EUR
  - term: Bu ödemeden sonra
  - definition: "Kur Bekleniyor: bakiye değişmez"
  - button "Vazgeç"
  - button "Ödemeyi kaydet"
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test'
  2   | import { countAfter, deliverAtDesk, kpiValue, openDemo, runScenario, switchUser, watch } from './fixtures'
  3   | 
  4   | // The eight guided demo scenarios, driven through the real screens (no direct state access).
  5   | 
  6   | async function addPayment(page: Page, o: { method: 'cash' | 'card' | 'transfer'; amount: string; cur: 'EUR' | 'BAM' | 'USD'; ref?: string; payer?: string }) {
  7   |   await page.getByRole('button', { name: 'Ödeme al' }).first().click()
  8   |   const dlg = page.getByRole('dialog')
  9   |   await dlg.locator('#pay-method').selectOption(o.method)
  10  |   if (o.ref) await dlg.locator('#pay-ref').fill(o.ref)
  11  |   await dlg.getByLabel('Para birimi').selectOption(o.cur)
  12  |   await dlg.locator('#pay-amount').fill(o.amount)
  13  |   return dlg
  14  | }
  15  | 
  16  | test.describe('scenario 5 · split payment (500 EUR)', () => {
  17  |   test('cash 100 EUR, card 200 BAM, USD waits for a rate, then 80 EUR, then 220 EUR transfer → 0; drawers stay separate', async ({ page }) => {
  18  |     const w = watch(page)
  19  |     await openDemo(page, '/')
  20  |     await runScenario(page, 5)
  21  |     await expect(page).toHaveURL(/\/kiralamalar\/rn\d+\?sekme=finans/)
  22  |     const rentalUrl = new URL(page.url()).pathname + new URL(page.url()).search
  23  |     expect(await kpiValue(page, 'Kalan')).toBe('500,00 EUR')
  24  | 
  25  |     // 1 · 100 EUR cash
  26  |     let dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'EUR' })
  27  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  28  |     await expect(dlg).toBeHidden()
  29  |     expect(await kpiValue(page, 'Kalan')).toBe('400,00 EUR')
  30  | 
  31  |     // 2 · 200 BAM by card = 100 EUR
  32  |     dlg = await addPayment(page, { method: 'card', amount: '200', cur: 'BAM', ref: 'POS-S5-0001' })
  33  |     await expect(dlg.getByText(/100,00 EUR/).first()).toBeVisible()
  34  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  35  |     await expect(dlg).toBeHidden()
  36  |     expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')
  37  | 
  38  |     // 3 · 100 USD without a rate: Awaiting Rate, nothing stored
  39  |     dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
  40  |     await expect(dlg.getByText('Kur Bekleniyor', { exact: true })).toBeVisible()
  41  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  42  |     await expect(dlg.getByRole('alert')).toBeVisible()
  43  |     await dlg.getByRole('button', { name: 'Vazgeç' }).click()
  44  |     expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')
  45  | 
  46  |     // Define 1 EUR = 1.25 USD in Settings → exchange rates
  47  |     await openDemo(page, '/ayarlar?bolum=kurlar')
  48  |     await page.getByRole('button', { name: 'Kur ekle' }).click()
  49  |     dlg = page.getByRole('dialog')
  50  |     await dlg.locator('#fx-b').selectOption('EUR')
  51  |     await dlg.locator('#fx-q').selectOption('USD')
  52  |     await dlg.locator('#fx-r').fill('1,25')
  53  |     await dlg.getByLabel('Ters yönde otomatik kullanılabilir').check()
  54  |     await dlg.locator('#fx-n').fill('Demo senaryo kuru')
  55  |     await dlg.getByRole('button', { name: 'Kaydet' }).click()
  56  |     await expect(dlg).toBeHidden()
  57  | 
  58  |     // 4 · 100 USD now applies as 80 EUR
  59  |     await openDemo(page, rentalUrl) // full reload: the earlier payments and the new rate come back from the browser store
  60  |     expect(await kpiValue(page, 'Kalan')).toBe('300,00 EUR')
  61  |     dlg = await addPayment(page, { method: 'cash', amount: '100', cur: 'USD' })
> 62  |     await expect(dlg.getByText(/80,00 EUR/).first()).toBeVisible()
      |                                                      ^ Error: expect(locator).toBeVisible() failed
  63  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  64  |     await expect(dlg).toBeHidden()
  65  |     expect(await kpiValue(page, 'Kalan')).toBe('220,00 EUR')
  66  | 
  67  |     // 5 · the rest by bank transfer
  68  |     dlg = await addPayment(page, { method: 'transfer', amount: '220', cur: 'EUR', ref: 'EFT-S5-0001' })
  69  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  70  |     await expect(dlg).toBeHidden()
  71  |     expect(await kpiValue(page, 'Kalan')).toBe('0,00 EUR')
  72  |     expect(w.apiRequests).toEqual([])
  73  |     expect(w.errors).toEqual([])
  74  |   })
  75  | })
  76  | 
  77  | test.describe('scenario 1 · daily operations', () => {
  78  |   test('Home → overdue card → the overdue list agrees with the Command Center; a row opens its Rental 360', async ({ page }) => {
  79  |     const w = watch(page)
  80  |     await openDemo(page, '/')
  81  |     await runScenario(page, 1)
  82  |     await expect(page).toHaveURL(/\/$/)
  83  |     const home = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  84  |     const homeOverdue = Number(/Geciken iade (\d+)/.exec(home)?.[1])
  85  |     expect(homeOverdue).toBeGreaterThan(0)
  86  | 
  87  |     // The overdue card leads to the rentals list filtered to overdue returns
  88  |     await page.getByRole('link', { name: /Geciken iade/ }).first().click()
  89  |     await expect(page).toHaveURL(/gecikme=1/)
  90  |     await expect(page.getByRole('link', { name: /^K-\d+/ })).toHaveCount(homeOverdue)
  91  | 
  92  |     // Command Center reads the same count
  93  |     await openDemo(page, '/komuta-merkezi')
  94  |     const cc = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  95  |     expect(Number(/Geciken iade (\d+)/.exec(cc)?.[1])).toBe(homeOverdue)
  96  | 
  97  |     // An overdue row opens the rental and says it is still with the customer
  98  |     await page.getByRole('link', { name: /^K-\d+/ }).first().click()
  99  |     await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
  100 |     await expect(page.getByText('Teslim edildi').first()).toBeVisible()
  101 |     expect(w.apiRequests).toEqual([])
  102 |   })
  103 | })
  104 | 
  105 | test.describe('scenario 3 · tasks and staff', () => {
  106 |   test('the manager creates and assigns a task, the assignee sees and completes it, the Command Center count follows, the linked record is not touched', async ({ page }) => {
  107 |     await openDemo(page, '/')
  108 |     await runScenario(page, 3)
  109 |     await expect(page).toHaveURL(/\/gorevler/)
  110 |     const title = 'Aracı yıkat ve yakıtı kontrol et'
  111 | 
  112 |     await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
  113 |     let dlg = page.getByRole('dialog')
  114 |     await dlg.locator('#tk-t').fill(title)
  115 |     const hv = await dlg.locator('#tk-o option', { hasText: 'Haris Mehić' }).first().getAttribute('value')
  116 |     await dlg.locator('#tk-o').selectOption(hv!)
  117 |     await dlg.getByRole('button', { name: 'Oluştur' }).click()
  118 |     await expect(dlg).toBeHidden()
  119 | 
  120 |     // Team view shows it; the manager's own view does not (assigned to someone else)
  121 |     await openDemo(page, '/gorevler?gorunum=ekip')
  122 |     await expect(page.getByText(title)).toBeVisible()
  123 | 
  124 |     // Switch to the Operations user: the task is in "mine"
  125 |     await switchUser(page, /Haris Mehić/)
  126 |     await openDemo(page, '/komuta-merkezi?sekme=devir')
  127 |     const openBefore = await countAfter(page, 'Açık görev')
  128 |     expect(openBefore).toBeGreaterThan(0)
  129 |     await openDemo(page, '/gorevler')
  130 |     await expect(page.getByText(title)).toBeVisible()
  131 |     await page.getByText(title).click()
  132 |     dlg = page.getByRole('dialog')
  133 |     await dlg.getByRole('button', { name: 'Tamamla' }).click()
  134 |     await expect(page.getByText('Görev tamamlandı').first()).toBeVisible()
  135 |     await page.keyboard.press('Escape')
  136 | 
  137 |     // It left the open list; the Command Center count dropped by one
  138 |     await openDemo(page, '/gorevler')
  139 |     await expect(page.getByText(title)).toHaveCount(0)
  140 |     await openDemo(page, '/komuta-merkezi?sekme=devir')
  141 |     const openAfter = await countAfter(page, 'Açık görev')
  142 |     expect(openAfter).toBe(openBefore - 1)
  143 |   })
  144 | })
  145 | 
  146 | test.describe('scenario 8 · branch cash', () => {
  147 |   test('open the Mostar EUR drawer, add movements, see the expected balance, count with a variance, close; sessions agree', async ({ page }) => {
  148 |     await openDemo(page, '/')
  149 |     await runScenario(page, 8)
  150 |     await expect(page).toHaveURL(/sube-kasalari/)
  151 |     const drawer = () => page.getByRole('region', { name: 'MST · EUR kasası' })
  152 |     await expect(drawer()).toBeVisible()
  153 |     await expect(drawer().getByText('Kasa kapalı')).toBeVisible()
  154 | 
  155 |     // Opening balance 200
  156 |     await drawer().getByRole('button', { name: 'Oturum aç' }).click()
  157 |     let dlg = page.getByRole('dialog')
  158 |     await dlg.locator('#os-a').fill('200')
  159 |     await dlg.getByRole('button', { name: 'Aç', exact: true }).click()
  160 |     await expect(dlg).toBeHidden()
  161 |     await expect(drawer().getByText('200,00 EUR').first()).toBeVisible()
  162 | 
```