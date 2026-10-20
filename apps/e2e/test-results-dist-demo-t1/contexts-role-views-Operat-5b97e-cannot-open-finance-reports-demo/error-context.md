# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contexts.spec.ts >> role views >> Operations sees customer contact details masked, the owner sees them in full, and Operations cannot open finance reports
- Location: demo-tests\contexts.spec.ts:92:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/\+387•••\d\d|\+387 •••|•••/).first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/\+387•••\d\d|\+387 •••|•••/).first() with timeout 8000ms
  - waiting for getByText(/\+387•••\d\d|\+387 •••|•••/).first()

```

```yaml
- note:
  - img
  - text: ACARVO DEMO — Örnek Veriler Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.
  - 'button "Demo zamanı: 20.10.2026 10:00"':
    - img
    - text: "Demo zamanı: 20.10.2026 10:00"
- complementary:
  - text: acarvo Filo operasyonu
  - navigation "Ana menü":
    - button "Genel 2" [expanded]:
      - text: Genel 2
      - img
    - list:
      - listitem:
        - link "Ana Ekran":
          - /url: /
          - img
          - text: Ana Ekran
      - listitem:
        - link "İşlerim":
          - /url: /islerim
          - img
          - text: İşlerim
    - button "Operasyon 7" [expanded]:
      - text: Operasyon 7
      - img
    - list:
      - listitem:
        - link "Rezervasyonlar":
          - /url: /rezervasyonlar
          - img
          - text: Rezervasyonlar
      - listitem:
        - link "Kiralamalar":
          - /url: /kiralamalar
          - img
          - text: Kiralamalar
      - listitem:
        - link "Takvim":
          - /url: /takvim
          - img
          - text: Takvim
      - listitem:
        - link "Görevler":
          - /url: /gorevler
          - img
          - text: Görevler
      - listitem:
        - link "Araçlar":
          - /url: /araclar
          - img
          - text: Araçlar
      - listitem:
        - link "Bakım & Servis":
          - /url: /bakim-servis
          - img
          - text: Bakım & Servis
      - listitem:
        - link "Hasar ve Olaylar":
          - /url: /hasar-ve-olaylar
          - img
          - text: Hasar ve Olaylar
    - button "Müşteri & Ticari 3" [expanded]:
      - text: Müşteri & Ticari 3
      - img
    - list:
      - listitem:
        - link "Müşteriler":
          - /url: /musteriler
          - img
          - text: Müşteriler
      - listitem:
        - link "Kurumsal Hesaplar":
          - /url: /kurumsal-hesaplar
          - img
          - text: Kurumsal Hesaplar
      - listitem:
        - link "Fiyatlandırma":
          - /url: /fiyatlandirma
          - img
          - text: Fiyatlandırma
    - button "Finans 3" [expanded]:
      - text: Finans 3
      - img
    - list:
      - listitem:
        - link "Finans":
          - /url: /finans
          - img
          - text: Finans
      - listitem:
        - link "Masraflar":
          - /url: /masraflar
          - img
          - text: Masraflar
      - listitem:
        - link "Şube Kasaları":
          - /url: /sube-kasalari
          - img
          - text: Şube Kasaları
    - button "Kontrol ve Raporlar 2" [expanded]:
      - text: Kontrol ve Raporlar 2
      - img
    - list:
      - listitem:
        - link "Raporlar":
          - /url: /raporlar
          - img
          - text: Raporlar
      - listitem:
        - link "Onay Merkezi":
          - /url: /onay-merkezi
          - img
          - text: Onay Merkezi
    - button "Yönetim 4" [expanded]:
      - text: Yönetim 4
      - img
    - list:
      - listitem:
        - link "Şubeler":
          - /url: /subeler
          - img
          - text: Şubeler
      - listitem:
        - link "Kullanıcılar ve Roller":
          - /url: /kullanicilar
          - img
          - text: Kullanıcılar ve Roller
      - listitem:
        - link "İşlem Geçmişi":
          - /url: /islem-gecmisi
          - img
          - text: İşlem Geçmişi
      - listitem:
        - link "Ayarlar":
          - /url: /ayarlar
          - img
          - text: Ayarlar
  - button "Demo kullanıcısı ve rol değiştir":
    - text: AK Adnan Kovač Sahip · Tüm şubeler
    - img
- banner:
  - navigation "Konum":
    - text: Müşteri & Ticari /
    - link "Müşteriler":
      - /url: /musteriler
    - text: / Ayrıntı
  - button "Ara (Ctrl K)":
    - img
    - text: Ara… Ctrl K
  - img
  - text: Şube filtresi
  - combobox "Şube filtresi":
    - option "Tüm şubeler" [selected]
    - option "SJJ · Sarajevo Havalimanı"
    - option "MST · Mostar Merkez"
    - option "DBV · Dubrovnik Havalimanı"
  - button "Bildirimler (14)":
    - img
    - text: 9+
  - button "Demo":
    - img
    - text: Demo
    - img
- main:
  - link "Müşteriler":
    - /url: /musteriler
    - img
    - text: Müşteriler
  - heading "Lejla Demić" [level=1]
  - paragraph: M-000003 Geçerli BA · yerli · 34 yaş
  - link "Rezervasyon oluştur":
    - /url: /rezervasyonlar/yeni?musteri=c3
  - link "Kiralama hazırla":
    - /url: /kiralamalar/yeni?musteri=c3
  - button "Diğer işlemler":
    - text: Diğer işlemler
    - img
  - tablist "Müşteri bölümleri":
    - tab "Özet" [selected]
    - tab "Rezervasyon ve kiralamalar2"
    - tab "Belgeler"
    - tab "Notlar ve iletişim0"
    - tab "Finans"
    - tab "Görevler"
    - tab "Kişisel veri"
  - region "Kişi":
    - heading "Kişi" [level=2]
    - term: Telefon
    - definition: +387 61 000 102
    - term: E-posta
    - definition: lejla3@example.test
    - term: Doğum tarihi
    - definition: 1992-01-21
    - term: Dil
    - definition: BS
    - term: İletişim tercihi
    - definition: Telefon
    - term: Kurumsal hesap
    - definition: Bireysel
  - region "Sürücü uygunluğu":
    - heading "Sürücü uygunluğu" [level=2]
    - paragraph: Ayarlar’daki yaş ve ehliyet kurallarına göre, bugünkü tarihle.
    - term: Ehliyet alım yılı
    - definition: 2012 (14 yıl)
    - term: Ehliyet geçerlilik
    - definition: 2029-10-24
    - term: Sonuç
    - definition: Uygun
  - region "Son kayıtlar":
    - heading "Son kayıtlar" [level=2]
    - list:
      - listitem:
        - link "K-000003":
          - /url: /kiralamalar/rn3
        - text: · S11-K-102 · 04.10.2026 Operasyonel kapandı
      - listitem:
        - link "R-000020":
          - /url: /rezervasyonlar/rsv20
        - text: · SUV · 29.10.2026 Bekliyor
- contentinfo: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
- status
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   | import { openDemo, runScenario, switchUser } from './fixtures'
  3   | 
  4   | // Platform Console and Partner Portal are separate contexts: no company-internal sensitive data in the first, only the
  5   | // signed-in partner's own records in the second. (Demo simulation of access, not server security.)
  6   | 
  7   | test.describe('platform console', () => {
  8   |   test('shows company accounts and plans but no rentals, customers, finance or documents of a company', async ({ page }) => {
  9   |     await openDemo(page, '/platform')
  10  |     const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  11  |     expect(text).toContain('Şirket hesapları')
  12  |     expect(text).not.toMatch(/K-0000\d\d|R-0000\d\d|T-0000\d\d/) // rental, reservation, payment numbers
  13  |     expect(text).not.toMatch(/Ajla Testović|Selma Hodžić|Nina Mock/) // customers of the demo company
  14  |     expect(text).not.toMatch(/\+387 61 000/) // customer phones
  15  |     expect(text).not.toMatch(/S11-K-10\d/) // plates
  16  |     await expect(page.getByRole('link', { name: /Rezervasyonlar|Kiralamalar|Finans/ })).toHaveCount(0)
  17  |   })
  18  | })
  19  | 
  20  | test.describe('partner portal', () => {
  21  |   test('a partner sees only its own leads, reservations and commission, and no customer contact data', async ({ page }) => {
  22  |     await openDemo(page, '/partner')
  23  |     const sel = page.locator('#pp-sel')
  24  |     const options = await sel.locator('option').evaluateAll((o) => o.map((x) => ({ v: (x as HTMLOptionElement).value, t: x.textContent ?? '' })))
  25  |     expect(options.length).toBeGreaterThan(1)
  26  |     const seen: Record<string, string[]> = {}
  27  |     for (const o of options) {
  28  |       await sel.selectOption(o.v)
  29  |       const tab = page.getByRole('tab', { name: /Rezervasyonlarım/ })
  30  |       if ((await tab.count()) === 0) {
  31  |         // portal closed for this partner: only the explanation is shown, no records at all
  32  |         await expect(page.getByText(/portal erişimi kapalı/)).toBeVisible()
  33  |         seen[o.t] = []
  34  |         continue
  35  |       }
  36  |       await tab.click()
  37  |       await page.waitForTimeout(150)
  38  |       const text = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ')
  39  |       seen[o.t] = [...new Set(text.match(/R-\d{6}/g) ?? [])]
  40  |       expect(text, `${o.t}: no customer phone or email`).not.toMatch(/\+387 6\d|@[a-z-]+\.(example|test)/)
  41  |       expect(text, `${o.t}: no finance or cash data of the company`).not.toMatch(/Kasa|Depozito|Hesap kalemi/)
  42  |     }
  43  |     // reservation numbers of one partner never appear for another
  44  |     const lists = Object.values(seen)
  45  |     for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) expect(lists[i]!.filter((n) => lists[j]!.includes(n))).toEqual([])
  46  |   })
  47  | 
  48  |   test('the partner portal never offers company screens, and leaving it returns to the company panel', async ({ page }) => {
  49  |     await openDemo(page, '/partner')
  50  |     await expect(page.getByRole('link', { name: 'Finans Merkezi' })).toHaveCount(0)
  51  |     await page.getByRole('link', { name: 'Şirket paneline dön' }).or(page.getByRole('button', { name: 'Şirket paneline dön' })).first().click()
  52  |     await expect(page).toHaveURL(/localhost:\d+\/$/)
  53  |   })
  54  | })
  55  | 
  56  | test.describe('consistency across screens', () => {
  57  |   test('a cash payment shows up in the rental, in Finance → Payments and in the branch drawer, with the same amount', async ({ page }) => {
  58  |     await openDemo(page, '/')
  59  |     await runScenario(page, 5)
  60  |     const rentalNo = (await page.locator('h1').first().innerText()).trim()
  61  |     await page.getByRole('button', { name: 'Ödeme al' }).first().click()
  62  |     const dlg = page.getByRole('dialog')
  63  |     await dlg.locator('#pay-method').selectOption('cash')
  64  |     await dlg.locator('#pay-amount').fill('42')
  65  |     await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  66  |     await expect(dlg).toBeHidden()
  67  |     await expect(page.getByText('42,00 EUR').first()).toBeVisible()
  68  | 
  69  |     await openDemo(page, '/finans?sekme=odemeler')
  70  |     await expect(page.getByRole('row', { name: new RegExp(rentalNo) }).filter({ hasText: '42,00 EUR' })).toHaveCount(1)
  71  | 
  72  |     await openDemo(page, '/sube-kasalari')
  73  |     const drawer = page.getByRole('region', { name: 'SJJ · EUR kasası' })
  74  |     await expect(drawer.getByText('+42,00 EUR')).toBeVisible()
  75  |     await expect(drawer.getByText(/Müşteri tahsilatı/)).toBeVisible()
  76  |   })
  77  | 
  78  |   test('the same vehicle reads the same in the list, Vehicle 360 and the rentals list', async ({ page }) => {
  79  |     await openDemo(page, '/araclar?q=S11-K-101')
  80  |     const row = page.getByRole('row', { name: /S11-K-101/ })
  81  |     const status = (await row.innerText()).replace(/\s+/g, ' ')
  82  |     expect(status).toContain('Kirada')
  83  |     await row.getByRole('link').first().click()
  84  |     await expect(page.getByText('Müsaitlik (şimdi)')).toBeVisible()
  85  |     await expect(page.getByText('Kirada').first()).toBeVisible()
  86  |     await openDemo(page, '/kiralamalar?q=S11-K-101')
  87  |     await expect(page.getByRole('row', { name: /S11-K-101/ }).getByText('Teslim edildi')).toBeVisible()
  88  |   })
  89  | })
  90  | 
  91  | test.describe('role views', () => {
  92  |   test('Operations sees customer contact details masked, the owner sees them in full, and Operations cannot open finance reports', async ({ page }) => {
  93  |     await openDemo(page, '/musteriler/c3')
  94  |     await expect(page.getByText(/\+387 61 000 1\d\d/).first()).toBeVisible()
  95  |     await switchUser(page, /Haris Mehić/)
  96  |     await openDemo(page, '/musteriler/c3')
> 97  |     await expect(page.getByText(/\+387•••\d\d|\+387 •••|•••/).first()).toBeVisible()
      |                                                                        ^ Error: expect(locator).toBeVisible() failed
  98  |     await expect(page.getByText(/\+387 61 000 1\d\d/)).toHaveCount(0)
  99  |     await openDemo(page, '/raporlar')
  100 |     await expect(page.getByRole('button', { name: /Gelir \(hesaplanan\)/ })).toHaveCount(0)
  101 |   })
  102 | })
  103 | 
```