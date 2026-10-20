# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 3 · tasks and staff >> the manager creates and assigns a task, the assignee sees and completes it, the Command Center count follows, the linked record is not touched
- Location: demo-tests\scenarios.spec.ts:106:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Aracı yıkat ve yakıtı kontrol et')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Aracı yıkat ve yakıtı kontrol et') with timeout 8000ms
  - waiting for getByText('Aracı yıkat ve yakıtı kontrol et')

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
    - text: SK Selma Karić Yönetici · Tüm şubeler
    - img
- banner:
  - navigation "Konum": Operasyon / Görevler
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
  - heading "Görevler" [level=1]
  - paragraph: "Görev bir kaydın yerine geçmez: görevi tamamlamak bağlı kiralama, bakım veya hasarı kapatmaz. Görevler yetkinize, şube kapsamınıza ve rolünüze göre görünür."
  - button "CSV"
  - button "Görev oluştur":
    - img
    - text: Görev oluştur
  - region "Özet": Bana atanan 1 Açık havuz 2 Üstlenebilirsiniz Geciken 1 Kapanan 1
  - tablist "Görev görünümleri":
    - tab "Bana atanan1"
    - tab "Açık havuz2"
    - tab "Tüm açık görevler13" [selected]
    - tab "Geciken1"
    - tab "Kapanan"
  - img
  - searchbox "Görevlerde ara"
  - text: Öncelik
  - combobox "Öncelik":
    - option "Tümü" [selected]
    - option "Acil"
    - option "Yüksek"
    - option "Normal"
  - table "Görev listesi":
    - rowgroup:
      - row "Seç Görev Başlık Öncelik Sorumlu Vade Durum":
        - columnheader "Seç"
        - columnheader "Görev":
          - button "Görev"
        - columnheader "Başlık"
        - columnheader "Öncelik"
        - columnheader "Sorumlu"
        - columnheader "Vade":
          - button "Vade":
            - text: Vade
            - img
        - columnheader "Durum":
          - button "Durum"
    - rowgroup:
      - row "Seç GR-000013 GR-000013 Geçen haftaki şikayet takibi Normal Lejla Šehović 18.10.2026 17:00Gecikti Açık":
        - cell "Seç GR-000013":
          - checkbox "Seç GR-000013"
        - cell "GR-000013"
        - cell "Geçen haftaki şikayet takibi"
        - cell "Normal"
        - cell "Lejla Šehović"
        - cell "18.10.2026 17:00Gecikti"
        - cell "Açık"
      - row "Seç GR-000001 GR-000001 Gecikmiş iade için müşteriyi arayın Acil Haris Mehić 20.10.2026 12:00 Açık":
        - cell "Seç GR-000001":
          - checkbox "Seç GR-000001"
        - cell "GR-000001"
        - cell "Gecikmiş iade için müşteriyi arayın"
        - cell "Acil"
        - cell "Haris Mehić"
        - cell "20.10.2026 12:00"
        - cell "Açık"
      - row "Seç GR-000002 GR-000002 Duster aracı yıkatın Yüksek Haris Mehić 20.10.2026 14:00 Açık":
        - cell "Seç GR-000002":
          - checkbox "Seç GR-000002"
        - cell "GR-000002"
        - cell "Duster aracı yıkatın"
        - cell "Yüksek"
        - cell "Haris Mehić"
        - cell "20.10.2026 14:00"
        - cell "Açık"
      - 'row "Seç GR-000003 GR-000003 Mostar şubesi: sınıf rezervasyonuna araç atayın Yüksek Lejla Šehović 20.10.2026 16:00 Açık"':
        - cell "Seç GR-000003":
          - checkbox "Seç GR-000003"
        - cell "GR-000003"
        - 'cell "Mostar şubesi: sınıf rezervasyonuna araç atayın"'
        - cell "Yüksek"
        - cell "Lejla Šehović"
        - cell "20.10.2026 16:00"
        - cell "Açık"
      - row "Seç GR-000008 GR-000008 Sportage hasar engeli ve yarınki rezervasyon Acil Lejla Šehović, Selma Karić 20.10.2026 17:00 Açık":
        - cell "Seç GR-000008":
          - checkbox "Seç GR-000008"
        - cell "GR-000008"
        - cell "Sportage hasar engeli ve yarınki rezervasyon"
        - cell "Acil"
        - cell "Lejla Šehović, Selma Karić"
        - cell "20.10.2026 17:00"
        - cell "Açık"
      - row "Seç GR-000012 GR-000012 Lastik değişimi planı (MST) Normal Kenan Pašić 21.10.2026 09:00 Açık":
        - cell "Seç GR-000012":
          - checkbox "Seç GR-000012"
        - cell "GR-000012"
        - cell "Lastik değişimi planı (MST)"
        - cell "Normal"
        - cell "Kenan Pašić"
        - cell "21.10.2026 09:00"
        - cell "Açık"
      - 'row "Seç GR-000007 GR-000007 DBV: Corolla sigorta belgesi süresi doldu Acil Ivo Matić 21.10.2026 12:00 Açık"':
        - cell "Seç GR-000007":
          - checkbox "Seç GR-000007"
        - cell "GR-000007"
        - 'cell "DBV: Corolla sigorta belgesi süresi doldu"'
        - cell "Acil"
        - cell "Ivo Matić"
        - cell "21.10.2026 12:00"
        - cell "Açık"
      - 'row "Seç GR-000014 GR-000014 Dubrovnik: transfer aracı yakıt kontrolü Normal Açık havuz 22.10.2026 10:00 Açık"':
        - cell "Seç GR-000014":
          - checkbox "Seç GR-000014"
        - cell "GR-000014"
        - 'cell "Dubrovnik: transfer aracı yakıt kontrolü"'
        - cell "Normal"
        - cell "Açık havuz"
        - cell "22.10.2026 10:00"
        - cell "Açık"
      - row "Seç GR-000004 GR-000004 Sağ arka kapı onarımı için servis teklifi alın Normal Dario Babić, Ivo Matić 22.10.2026 17:00 Açık":
        - cell "Seç GR-000004":
          - checkbox "Seç GR-000004"
        - cell "GR-000004"
        - cell "Sağ arka kapı onarımı için servis teklifi alın"
        - cell "Normal"
        - cell "Dario Babić, Ivo Matić"
        - cell "22.10.2026 17:00"
        - cell "Açık"
      - row "Seç GR-000006 GR-000006 Araç sigorta poliçelerini kontrol edin Yüksek Kenan Pašić 23.10.2026 17:00 Açık":
        - cell "Seç GR-000006":
          - checkbox "Seç GR-000006"
        - cell "GR-000006"
        - cell "Araç sigorta poliçelerini kontrol edin"
        - cell "Yüksek"
        - cell "Kenan Pašić"
        - cell "23.10.2026 17:00"
        - cell "Açık"
      - row "Seç GR-000011 GR-000011 Yeni sezon fiyat listesi toplantısı Normal Adnan Kovač 24.10.2026 11:00 Açık":
        - cell "Seç GR-000011":
          - checkbox "Seç GR-000011"
        - cell "GR-000011"
        - cell "Yeni sezon fiyat listesi toplantısı"
        - cell "Normal"
        - cell "Adnan Kovač"
        - cell "24.10.2026 11:00"
        - cell "Açık"
      - row "Seç GR-000005 GR-000005 Havalimanı otopark kartlarını yenileyin Normal Açık havuz 25.10.2026 17:00 Açık":
        - cell "Seç GR-000005":
          - checkbox "Seç GR-000005"
        - cell "GR-000005"
        - cell "Havalimanı otopark kartlarını yenileyin"
        - cell "Normal"
        - cell "Açık havuz"
        - cell "25.10.2026 17:00"
        - cell "Açık"
  - text: 1–12 / 13
  - button "Önceki sayfa" [disabled]:
    - img
  - text: 1 / 2
  - button "Sonraki sayfa":
    - img
- contentinfo: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
- status
```

# Test source

```ts
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
  62  |     await expect(dlg.getByText(/80,00 EUR/).first()).toBeVisible()
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
> 122 |     await expect(page.getByText(title)).toBeVisible()
      |                                         ^ Error: expect(locator).toBeVisible() failed
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
  163 |     // +50 in, then −30 out
  164 |     await drawer().getByRole('button', { name: 'Hareket ekle' }).click()
  165 |     dlg = page.getByRole('dialog')
  166 |     await dlg.locator('#mv-k').selectOption('in')
  167 |     await dlg.locator('#mv-a').fill('50')
  168 |     await dlg.locator('#mv-r').fill('Müşteri bozuk para girişi')
  169 |     await dlg.getByRole('button', { name: 'Kaydet' }).click()
  170 |     await expect(dlg).toBeHidden()
  171 |     await expect(drawer().getByText('250,00 EUR').first()).toBeVisible()
  172 |     await drawer().getByRole('button', { name: 'Hareket ekle' }).click()
  173 |     dlg = page.getByRole('dialog')
  174 |     await dlg.locator('#mv-k').selectOption('out')
  175 |     await dlg.locator('#mv-a').fill('30')
  176 |     await dlg.locator('#mv-r').fill('Yakıt fişi ödemesi')
  177 |     await dlg.getByRole('button', { name: 'Kaydet' }).click()
  178 |     await expect(dlg).toBeHidden()
  179 |     await expect(drawer().getByText('220,00 EUR').first()).toBeVisible()
  180 | 
  181 |     // Count 215: variance −5,00 EUR is shown before closing; a reason is required above the threshold
  182 |     await drawer().getByRole('button', { name: 'Kasayı kapat' }).click()
  183 |     dlg = page.getByRole('dialog')
  184 |     await dlg.locator('#cl-a').fill('215')
  185 |     await expect(dlg.getByText('220,00 EUR').first()).toBeVisible()
  186 |     await expect(dlg.getByText(/−5,00 EUR|-5,00 EUR/).first()).toBeVisible()
  187 |     if (await dlg.locator('#cl-r').count()) await dlg.locator('#cl-r').fill('Sayım farkı: bozuk para eksik')
  188 |     await dlg.getByRole('button', { name: 'Kapat', exact: true }).click()
  189 |     await expect(dlg).toBeHidden()
  190 |     await expect(drawer().getByText('Kasa kapalı')).toBeVisible()
  191 | 
  192 |     // The closed session is in the sessions list with the expected amount
  193 |     await page.getByRole('tab', { name: /Oturumlar/ }).click()
  194 |     await expect(page.getByText('220,00 EUR').first()).toBeVisible()
  195 |     await expect(page.getByText('215,00 EUR').first()).toBeVisible()
  196 |   })
  197 | })
  198 | 
  199 | test.describe('scenario 2 · reservation to handover', () => {
  200 |   test('choose a customer, see price and availability, save confirmed, convert, deliver at the Delivery Desk; vehicle and lists agree', async ({ page }) => {
  201 |     const w = watch(page)
  202 |     await openDemo(page, '/')
  203 |     await runScenario(page, 2)
  204 |     await expect(page).toHaveURL(/rezervasyonlar\/yeni/)
  205 | 
  206 |     // customer by search
  207 |     await page.locator('#bk-c').click()
  208 |     await page.locator('#bk-c').fill('Nina Mock')
  209 |     await page.getByRole('option', { name: /Nina Mock/ }).click()
  210 | 
  211 |     // a one-day window starting at the default time; pick the first class that has a free vehicle
  212 |     const from = await page.locator('#bk-from').inputValue()
  213 |     const ret = new Date(new Date(from + 'Z').getTime() + 24 * 3600 * 1000).toISOString().slice(0, 16)
  214 |     await page.locator('#bk-to').fill(ret)
  215 |     let plate = ''
  216 |     const classes = await page.locator('#bk-cls option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))
  217 |     for (const cls of classes) {
  218 |       await page.locator('#bk-cls').selectOption(cls)
  219 |       const free = await page.locator('#bk-veh option:not([disabled])').evaluateAll((o) => o.filter((x) => (x as HTMLOptionElement).value).map((x) => ({ v: (x as HTMLOptionElement).value, t: x.textContent ?? '' })))
  220 |       if (free.length) {
  221 |         await page.locator('#bk-veh').selectOption(free[0]!.v)
  222 |         plate = free[0]!.t.split(' ')[0]!
```