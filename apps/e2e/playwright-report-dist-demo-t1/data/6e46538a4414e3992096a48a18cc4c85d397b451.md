# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.ts >> persistence >> an unfinished form keeps its inputs when the language is switched
- Location: demo-tests\persistence.spec.ts:80:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Save reservation' })
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Save reservation' }) with timeout 8000ms
  - waiting for getByRole('button', { name: 'Save reservation' })

```

```yaml
- note:
  - img
  - text: ACARVO DEMO — Sample Data Interactive product concept. Payments and records are simulated in the demo; there is no real POS, bank or document delivery.
  - 'button "Demo time: 20/10/2026 10:00"':
    - img
    - text: "Demo time: 20/10/2026 10:00"
- complementary:
  - text: acarvo Filo operasyonu
  - navigation "Main menu":
    - button "General 2" [expanded]:
      - text: General 2
      - img
    - list:
      - listitem:
        - link "Home":
          - /url: /
          - img
          - text: Home
      - listitem:
        - link "My Work":
          - /url: /islerim
          - img
          - text: My Work
    - button "Operations 7" [expanded]:
      - text: Operations 7
      - img
    - list:
      - listitem:
        - link "Reservations":
          - /url: /rezervasyonlar
          - img
          - text: Reservations
      - listitem:
        - link "Rentals":
          - /url: /kiralamalar
          - img
          - text: Rentals
      - listitem:
        - link "Calendar":
          - /url: /takvim
          - img
          - text: Calendar
      - listitem:
        - link "Tasks":
          - /url: /gorevler
          - img
          - text: Tasks
      - listitem:
        - link "Vehicles":
          - /url: /araclar
          - img
          - text: Vehicles
      - listitem:
        - link "Maintenance & Service":
          - /url: /bakim-servis
          - img
          - text: Maintenance & Service
      - listitem:
        - link "Damage & Incidents":
          - /url: /hasar-ve-olaylar
          - img
          - text: Damage & Incidents
    - button "Customers & Commercial 3" [expanded]:
      - text: Customers & Commercial 3
      - img
    - list:
      - listitem:
        - link "Customers":
          - /url: /musteriler
          - img
          - text: Customers
      - listitem:
        - link "Corporate Accounts":
          - /url: /kurumsal-hesaplar
          - img
          - text: Corporate Accounts
      - listitem:
        - link "Pricing":
          - /url: /fiyatlandirma
          - img
          - text: Pricing
    - button "Finance 3" [expanded]:
      - text: Finance 3
      - img
    - list:
      - listitem:
        - link "Finance":
          - /url: /finans
          - img
          - text: Finance
      - listitem:
        - link "Expenses":
          - /url: /masraflar
          - img
          - text: Expenses
      - listitem:
        - link "Branch Cash Registers":
          - /url: /sube-kasalari
          - img
          - text: Branch Cash Registers
    - button "Control & Reports 2" [expanded]:
      - text: Control & Reports 2
      - img
    - list:
      - listitem:
        - link "Reports":
          - /url: /raporlar
          - img
          - text: Reports
      - listitem:
        - link "Approval Center":
          - /url: /onay-merkezi
          - img
          - text: Approval Center
    - button "Administration 4" [expanded]:
      - text: Administration 4
      - img
    - list:
      - listitem:
        - link "Branches":
          - /url: /subeler
          - img
          - text: Branches
      - listitem:
        - link "Users & Roles":
          - /url: /kullanicilar
          - img
          - text: Users & Roles
      - listitem:
        - link "Audit Trail":
          - /url: /islem-gecmisi
          - img
          - text: Audit Trail
      - listitem:
        - link "Settings":
          - /url: /ayarlar
          - img
          - text: Settings
  - button "Switch demo user and role":
    - text: AK Adnan Kovač Owner · All branches
    - img
- banner:
  - navigation "Location":
    - text: Operations /
    - link "Reservations":
      - /url: /rezervasyonlar
    - text: / Detail
  - button "Search (Ctrl K)":
    - img
    - text: Search… Ctrl K
  - img
  - text: Branch filter
  - combobox "Branch filter":
    - option "All branches" [selected]
    - option "SJJ · Sarajevo Airport"
    - option "MST · Mostar Centre"
    - option "DBV · Dubrovnik Airport"
  - button "Notifications (14)":
    - img
    - text: 9+
  - button "Demo":
    - img
    - text: Demo
    - img
- main:
  - link "Reservations":
    - /url: /rezervasyonlar
    - img
    - text: Reservations
  - heading "New reservation" [level=1]
  - paragraph: A reservation is not a rental. Without a vehicle it is class-only and holds no specific vehicle.
  - region "Customer":
    - heading "Customer" [level=2]
    - text: Customer (required)
    - combobox "Customer (required)"
    - button "Add a new customer":
      - img
      - text: Add a new customer
    - text: Corporate account
    - combobox "Corporate account":
      - option "Individual" [selected]
      - option "Neretva Logistics d.o.o."
      - option "Drina Consulting d.o.o."
      - option "Una Tours d.o.o."
      - option "Bosna Pharma d.d."
    - text: Add additional driver
    - combobox "Add additional driver"
    - paragraph: Additional driver fee is charged per day · max 3
  - region "Plan":
    - heading "Plan" [level=2]
    - text: Pickup branch
    - combobox "Pickup branch":
      - option "SJJ · Sarajevo Airport" [selected]
      - option "MST · Mostar Centre"
      - option "DBV · Dubrovnik Airport"
    - text: Return branch
    - combobox "Return branch":
      - option "SJJ · Sarajevo Airport" [selected]
      - option "MST · Mostar Centre"
      - option "DBV · Dubrovnik Airport"
    - text: Pickup (required)
    - textbox "Pickup (required)": 2026-10-20T11:00
    - paragraph: "Time zone: Europe/Sarajevo"
    - text: Return (required)
    - textbox "Return (required)": 2026-10-23T10:00
    - paragraph: "Time zone: Europe/Sarajevo"
  - region "Vehicle":
    - heading "Vehicle" [level=2]
    - paragraph: Optional. If chosen, a confirmed reservation holds that vehicle.
    - text: Class
    - combobox "Class":
      - option "Economy" [selected]
      - option "Compact"
      - option "SUV"
      - option "Premium"
      - option "Minibus"
    - text: Vehicle (optional)
    - combobox "Vehicle (optional)":
      - option "Class-only (no vehicle)" [selected]
      - option "M22-K-202 · Renault Clio"
      - 'option "DU 101-AB · Škoda Fabia — unavailable: Rental K-000031" [disabled]'
      - 'option "DU 102-AB · Opel Corsa — unavailable: Maintenance B-000007" [disabled]'
      - 'option "M22-K-201 · Volkswagen Polo — unavailable: Reservation R-000008" [disabled]'
      - 'option "S11-K-101 · Volkswagen Polo — unavailable: Rental K-000028" [disabled]'
      - 'option "S11-K-102 · Škoda Fabia — unavailable: Reservation R-000017" [disabled]'
      - 'option "S11-K-103 · Opel Corsa — unavailable: Reservation R-000005" [disabled]'
      - 'option "S11-K-110 · Renault Clio — unavailable: Transfer T-000043" [disabled]'
    - img
    - text: This record does not reserve a specific vehicle yet. Without a vehicle it can only be saved as pending; a specific vehicle is needed to confirm.
    - paragraph: "Class capacity: at least 1 vehicle(s) free on the chosen days."
  - region "Price items":
    - heading "Price items" [level=2]
    - paragraph: Insurance, extras and fees use explicit rows per currency; prices are never converted between currencies.
    - text: Currency
    - combobox "Currency":
      - option "EUR" [selected]
      - option "BAM"
      - option "USD"
    - text: Coverage package
    - combobox "Coverage package":
      - option "No package" [selected]
      - option "CDW Basic Cover (7.00 EUR/day)"
      - option "SCDW Full Cover (12.00 EUR/day)"
    - group "Extras":
      - text: Extras
      - list:
        - listitem:
          - text: GPS navigation 5.00 EUR / day
          - spinbutton "GPS navigation quantity": "0"
        - listitem:
          - text: Child seat 3.00 EUR / day
          - spinbutton "Child seat quantity": "0"
        - listitem:
          - text: Winter tyres / chains set 20.00 EUR / rental
          - spinbutton "Winter tyres / chains set quantity": "0"
        - listitem:
          - text: Mobile Wi-Fi hotspot 4.00 EUR / day
          - spinbutton "Mobile Wi-Fi hotspot quantity": "0"
  - region "Channel and note":
    - heading "Channel and note" [level=2]
    - text: Channel
    - combobox "Channel":
      - option "Phone" [selected]
      - option "Walk-in"
      - option "Web form"
      - option "Partner"
      - option "Corporate"
      - option "Quote"
    - text: Note
    - textbox "Note": Müşteri çocuk koltuğu istiyor
  - text: "Save as Pending: holds no vehicle or capacity. Check and Confirm: permission, a specific vehicle, conflicts and credit are checked; if one fails nothing is saved."
  - button "Cancel"
  - button "Save as Pending" [disabled]
  - button "Check and Confirm" [disabled]
  - paragraph: Choose a customer to save.
  - complementary "Summary":
    - region "Summary":
      - heading "Summary" [level=2]
      - term: Duration
      - definition: 3 day(s)
      - term: Pickup
      - definition: 20/10/2026 11:00
      - term: Return
      - definition: 23/10/2026 10:00
      - term: Vehicle
      - definition: Class-only
      - table:
        - rowgroup:
          - row "Line Amount":
            - columnheader "Line"
            - columnheader "Amount"
        - rowgroup:
          - row "Economy · daily base rate 105.00 EUR":
            - cell "Economy · daily base rate"
            - cell "105.00 EUR"
          - row "Length tier (3+ days) 5% -5.25 EUR":
            - cell "Length tier (3+ days) 5%"
            - cell "-5.25 EUR"
        - rowgroup:
          - row "Net 85.26 EUR":
            - cell "Net"
            - cell "85.26 EUR"
          - row "Sample VAT 17% (incl.) 14.49 EUR":
            - cell "Sample VAT 17% (incl.)"
            - cell "14.49 EUR"
          - row "Total (EUR) 99.75 EUR":
            - cell "Total (EUR)"
            - cell "99.75 EUR"
      - paragraph: Price version rev-0 · 3 days · single transaction currency; pricing never converts currencies.
    - region "Checks":
      - heading "Checks" [level=2]
      - paragraph: No blockers
      - list:
        - listitem:
          - img
          - paragraph: Deposit policy
          - paragraph: "Deposit required at delivery: 150.00 EUR (not revenue)"
    - paragraph: Advance and payments are taken after the record exists. The price is frozen when saved and is not affected by later price-list changes.
- contentinfo: Interactive product concept. Payments and records are simulated in the demo; there is no real POS, bank, document delivery or legal compliance integration.
- status
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test'
  2   | import { openDemo, switchUser, watch } from './fixtures'
  3   | 
  4   | // Demo state lives in this browser only. These tests pin down when it is saved, what a reload brings back and what the
  5   | // reset removes; none of them asks the API.
  6   | 
  7   | const createTask = async (page: Page, title: string) => {
  8   |   await openDemo(page, '/gorevler?gorunum=ekip')
  9   |   await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
  10  |   const dlg = page.getByRole('dialog')
  11  |   await dlg.locator('#tk-t').fill(title)
  12  |   await dlg.locator('#tk-m').selectOption('pool')
  13  |   await dlg.getByRole('button', { name: 'Oluştur' }).click()
  14  |   await expect(dlg).toBeHidden()
  15  | }
  16  | 
  17  | test.describe('persistence', () => {
  18  |   test('a new record is still there after an immediate reload; an edit too', async ({ page }) => {
  19  |     const w = watch(page)
  20  |     const title = 'Kalıcılık denemesi görevi'
  21  |     await createTask(page, title)
  22  |     await page.reload() // immediately: the last action must have been flushed
  23  |     await page.waitForLoadState('networkidle')
  24  |     await expect(page.getByText(title)).toBeVisible()
  25  | 
  26  |     // edit: claim it, reload straight away
  27  |     await page.getByText(title).click()
  28  |     await page.getByRole('dialog').getByRole('button', { name: 'Üstlen' }).click()
  29  |     await page.keyboard.press('Escape')
  30  |     await page.reload()
  31  |     await page.waitForLoadState('networkidle')
  32  |     await openDemo(page, '/gorevler')
  33  |     await expect(page.getByText(title)).toBeVisible() // now owned by the signed-in demo user, so it is in "mine"
  34  |     expect(w.apiRequests).toEqual([])
  35  |   })
  36  | 
  37  |   test('the reset brings back the seed: a created record disappears, the seeded advance story is there again', async ({ page }) => {
  38  |     const title = 'Sıfırlanınca kaybolacak görev'
  39  |     await createTask(page, title)
  40  |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  41  |     await page.getByRole('menuitem', { name: /Demo verilerini sıfırla/ }).click()
  42  |     await page.getByRole('button', { name: 'Sıfırla' }).click()
  43  |     await page.waitForLoadState('networkidle')
  44  |     await openDemo(page, '/gorevler?gorunum=ekip')
  45  |     await expect(page.getByText(title)).toHaveCount(0)
  46  |     await openDemo(page, '/rezervasyonlar?q=Selma')
  47  |     await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
  48  |   })
  49  | 
  50  |   test('signed-in role and language survive a reload', async ({ page }) => {
  51  |     await openDemo(page, '/')
  52  |     await switchUser(page, /Haris Mehić/)
  53  |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  54  |     await page.getByRole('menuitem', { name: /Dil:/ }).click()
  55  |     await page.waitForLoadState('networkidle')
  56  |     await page.reload()
  57  |     await page.waitForLoadState('networkidle')
  58  |     await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
  59  |     await expect(page.getByRole('button', { name: /Switch demo user/ })).toContainText('Haris Mehić')
  60  |   })
  61  | 
  62  |   test('filters live in the URL: they survive Back/Forward, a reload and a language switch', async ({ page }) => {
  63  |     await openDemo(page, '/rezervasyonlar?q=Selma')
  64  |     await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
  65  |     await page.getByText('Selma Hodžić-Demo').first().click()
  66  |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  67  |     await page.goBack()
  68  |     await expect(page).toHaveURL(/q=Selma/)
  69  |     await page.goForward()
  70  |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  71  |     await page.goBack()
  72  |     await page.reload()
  73  |     await expect(page.getByRole('searchbox').or(page.getByRole('textbox', { name: /ara/i })).first()).toHaveValue('Selma')
  74  |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  75  |     await page.getByRole('menuitem', { name: /Dil:/ }).click()
  76  |     await expect(page).toHaveURL(/q=Selma/)
  77  |     await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
  78  |   })
  79  | 
  80  |   test('an unfinished form keeps its inputs when the language is switched', async ({ page }) => {
  81  |     await openDemo(page, '/rezervasyonlar/yeni')
  82  |     await page.locator('#bk-note').fill('Müşteri çocuk koltuğu istiyor')
  83  |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  84  |     await page.getByRole('menuitem', { name: /Dil:/ }).click()
> 85  |     await expect(page.getByRole('button', { name: 'Save reservation' })).toBeVisible()
      |                                                                          ^ Error: expect(locator).toBeVisible() failed
  86  |     await expect(page.locator('#bk-note')).toHaveValue('Müşteri çocuk koltuğu istiyor')
  87  |   })
  88  | 
  89  |   test('when the browser refuses to store anything the demo says so instead of pretending the data is saved', async ({ page, context }) => {
  90  |     await context.addInitScript(() => {
  91  |       const refuse = () => { throw new DOMException('blocked', 'SecurityError') }
  92  |       Object.defineProperty(window, 'indexedDB', { value: { open: refuse } })
  93  |       Storage.prototype.setItem = refuse
  94  |     })
  95  |     await openDemo(page, '/gorevler?gorunum=ekip')
  96  |     await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
  97  |     const dlg = page.getByRole('dialog')
  98  |     await dlg.locator('#tk-t').fill('Kaydedilemeyen görev')
  99  |     await dlg.locator('#tk-m').selectOption('pool')
  100 |     await dlg.getByRole('button', { name: 'Oluştur' }).click()
  101 |     await expect(page.getByRole('alert').filter({ hasText: /kayıt yapılamıyor/ })).toBeVisible()
  102 |     await expect(page.getByText('Kaydedilemeyen görev')).toBeVisible() // the tab itself keeps working
  103 |   })
  104 | })
  105 | 
```