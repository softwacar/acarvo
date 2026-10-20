# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 4 · fleet analysis >> period and branch filters change the rows and the numbers, a vehicle opens Vehicle 360, Back keeps the filters
- Location: demo-tests\scenarios.spec.ts:356:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /filo-analizi/
Received string:  "http://localhost:5184/raporlar?rapor=filo"
Timeout: 8000ms

Call log:
  - Expect "toHaveURL" with timeout 8000ms
    19 × locator resolved to <html lang="tr">…</html>
       - unexpected value "http://localhost:5184/raporlar?rapor=filo"

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
  - navigation "Konum": Kontrol ve Raporlar / Raporlar
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
  - heading "Raporlar" [level=1]
  - paragraph: Sekiz rapor ailesi, ekranlarla aynı kayıtlardan üretilir. CSV tarayıcıda gerçek bir dosya olarak indirilir; yazdırma tarayıcı yazdırma penceresini kullanır. Finans raporları ayrı yetki ister.
  - button "CSV"
  - button "Yazdır":
    - img
    - text: Yazdır
  - navigation "Rapor aileleri":
    - list:
      - listitem:
        - button "Filo Kiralanma oranı, bakım ve boşta saat, araç başına gelir."
      - listitem:
        - button "Kiralama özeti Dönemde teslim planlanan kiralamalar."
      - listitem:
        - button "Gelir (hesaplanan) Kesilmiş hesap kalemleri, tür ve para birimi başına."
      - listitem:
        - button "Tahsilat ve bakiye Yönteme göre uygulanan ödemeler ve açık bakiyeler."
      - listitem:
        - button "Kasa oturumları Oturum bazında beklenen, sayılan ve fark."
    - paragraph: Gelişmiş raporlar (V1.5 / V2) Demo → Gelişmiş konsept ön izlemesiyle açılır.
  - heading "Filo Analizi" [level=2]
  - paragraph: "Araç bazında kullanım: kiralanan, bakımda, hasar bloğunda ve boşta geçen süre — gerçek teslim–iade, bakım ve hasar kayıtlarından. Gelir yalnız kiralama bedeli kalemidir, para birimi başına."
  - button "CSV"
  - group "Dönem":
    - button "7 gün"
    - button "30 gün" [pressed]
    - button "90 gün"
  - text: Şube
  - combobox "Şube":
    - option "Tüm şubeler" [selected]
    - option "SJJ · Sarajevo Havalimanı"
    - option "MST · Mostar Merkez"
    - option "DBV · Dubrovnik Havalimanı"
  - text: Sınıf
  - combobox "Sınıf":
    - option "Tüm sınıflar" [selected]
    - option "Ekonomi"
    - option "Kompakt"
    - option "SUV"
    - option "Premium"
    - option "Minibüs"
  - region "Özet": Ortalama kiralanma %27 Araç 26 Toplam km 13.500 Hiç kiralanmayan 1
  - region "Sınıfa göre ortalama kiralanma (%)":
    - heading "Sınıfa göre ortalama kiralanma (%)" [level=2]
    - group "Görünüm":
      - button "Grafik" [pressed]
      - button "Tablo"
    - list:
      - listitem: Ekonomi %328 araç
      - listitem: Kompakt %256 araç
      - listitem: SUV %235 araç
      - listitem: Premium %254 araç
      - listitem: Minibüs %263 araç
    - paragraph: "Kaynak: kiralama, bakım ve hasar bloğu süreleri"
  - table "Araç kullanım tablosu":
    - rowgroup:
      - row "Araç Kiralanma % Kiralama Km Bakım saati Hasar bloğu saati Boşta saat Kiralama geliri":
        - columnheader "Araç":
          - button "Araç"
        - columnheader "Kiralanma %":
          - button "Kiralanma %":
            - text: Kiralanma %
            - img
        - columnheader "Kiralama":
          - button "Kiralama"
        - columnheader "Km":
          - button "Km"
        - columnheader "Bakım saati":
          - button "Bakım saati"
        - columnheader "Hasar bloğu saati":
          - button "Hasar bloğu saati"
        - columnheader "Boşta saat":
          - button "Boşta saat"
        - columnheader "Kiralama geliri"
    - rowgroup:
      - row "Araç M22-K-205 Toyota RAV4 %48 2 400 0 0 371 2.049,60 BAM":
        - cell "Araç M22-K-205 Toyota RAV4":
          - link "Araç M22-K-205":
            - /url: /araclar/v15
            - text: M22-K-205
          - text: Toyota RAV4
        - cell "%48"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "371"
        - cell "2.049,60 BAM"
      - row "Araç DU 103-CD Škoda Octavia %46 2 400 0 0 385 283,50 EUR":
        - cell "Araç DU 103-CD Škoda Octavia":
          - link "Araç DU 103-CD":
            - /url: /araclar/v21
            - text: DU 103-CD
          - text: Škoda Octavia
        - cell "%46"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "385"
        - cell "283,50 EUR"
      - row "Araç S11-K-106 Volkswagen Tiguan %45 2 400 0 0 392 947,75 EUR":
        - cell "Araç S11-K-106 Volkswagen Tiguan":
          - link "Araç S11-K-106":
            - /url: /araclar/v6
            - text: S11-K-106
          - text: Volkswagen Tiguan
        - cell "%45"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "392"
        - cell "947,75 EUR"
      - row "Araç DU 106-EF Mercedes C 220 %41 2 400 0 0 419 1.657,50 EUR":
        - cell "Araç DU 106-EF Mercedes C 220":
          - link "Araç DU 106-EF":
            - /url: /araclar/v24
            - text: DU 106-EF
          - text: Mercedes C 220
        - cell "%41"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "419"
        - cell "1.657,50 EUR"
      - row "Araç M22-K-202 Renault Clio %41 2 800 3 0 416 930,45 BAM":
        - cell "Araç M22-K-202 Renault Clio":
          - link "Araç M22-K-202":
            - /url: /araclar/v12
            - text: M22-K-202
          - text: Renault Clio
        - cell "%41"
        - cell "2"
        - cell "800"
        - cell "3"
        - cell "0"
        - cell "416"
        - cell "930,45 BAM"
      - row "Araç S11-K-101 Volkswagen Polo %38 3 800 0 0 441 484,20 BAM · 133,00 EUR":
        - cell "Araç S11-K-101 Volkswagen Polo":
          - link "Araç S11-K-101":
            - /url: /araclar/v1
            - text: S11-K-101
          - text: Volkswagen Polo
        - cell "%38"
        - cell "3"
        - cell "800"
        - cell "0"
        - cell "0"
        - cell "441"
        - cell "484,20 BAM · 133,00 EUR"
      - row "Araç S11-K-109 Volkswagen Transporter %34 1 400 0 0 466 1.481,00 BAM":
        - cell "Araç S11-K-109 Volkswagen Transporter":
          - link "Araç S11-K-109":
            - /url: /araclar/v9
            - text: S11-K-109
          - text: Volkswagen Transporter
        - cell "%34"
        - cell "1"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "466"
        - cell "1.481,00 BAM"
      - row "Araç DU 102-AB Opel Corsa %34 2 800 0 0 467 402,50 EUR":
        - cell "Araç DU 102-AB Opel Corsa":
          - link "Araç DU 102-AB":
            - /url: /araclar/v20
            - text: DU 102-AB
          - text: Opel Corsa
        - cell "%34"
        - cell "2"
        - cell "800"
        - cell "0"
        - cell "0"
        - cell "467"
        - cell "402,50 EUR"
      - row "Araç DU 101-AB Škoda Fabia %34 2 400 0 0 468 342,50 EUR":
        - cell "Araç DU 101-AB Škoda Fabia":
          - link "Araç DU 101-AB":
            - /url: /araclar/v19
            - text: DU 101-AB
          - text: Škoda Fabia
        - cell "%34"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "468"
        - cell "342,50 EUR"
      - row "Araç S11-K-103 Opel Corsa %34 2 800 0 0 469 739,50 BAM":
        - cell "Araç S11-K-103 Opel Corsa":
          - link "Araç S11-K-103":
            - /url: /araclar/v3
            - text: S11-K-103
          - text: Opel Corsa
        - cell "%34"
        - cell "2"
        - cell "800"
        - cell "0"
        - cell "0"
        - cell "469"
        - cell "739,50 BAM"
      - row "Araç S11-K-102 Škoda Fabia %31 2 2.300 0 0 486 392,25 EUR":
        - cell "Araç S11-K-102 Škoda Fabia":
          - link "Araç S11-K-102":
            - /url: /araclar/v2
            - text: S11-K-102
          - text: Škoda Fabia
        - cell "%31"
        - cell "2"
        - cell "2.300"
        - cell "0"
        - cell "0"
        - cell "486"
        - cell "392,25 EUR"
      - row "Araç S11-K-108 BMW 320d %31 2 400 0 0 489 1.246,12 EUR":
        - cell "Araç S11-K-108 BMW 320d":
          - link "Araç S11-K-108":
            - /url: /araclar/v8
            - text: S11-K-108
          - text: BMW 320d
        - cell "%31"
        - cell "2"
        - cell "400"
        - cell "0"
        - cell "0"
        - cell "489"
        - cell "1.246,12 EUR"
  - text: 1–12 / 26
  - button "Önceki sayfa" [disabled]:
    - img
  - text: 1 / 3
  - button "Sonraki sayfa":
    - img
- contentinfo: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
- status
```

# Test source

```ts
  259 | 
  260 | test.describe('scenario 6 · maintenance and availability', () => {
  261 |   test('a conflicting maintenance window is refused with its reason; a free one is planned, started and completed; the vehicle is not automatically Ready', async ({ page }) => {
  262 |     await openDemo(page, '/')
  263 |     await runScenario(page, 6)
  264 |     await expect(page).toHaveURL(/\/araclar\/v\d+\?sekme=musaitlik/)
  265 |     await expect(page.getByText('S11-K-103').first()).toBeVisible()
  266 |     const vehicleUrl = new URL(page.url()).pathname
  267 | 
  268 |     const plan = async (shiftDays: number, hours: number) => {
  269 |       await openDemo(page, '/bakim-servis')
  270 |       await page.getByRole('button', { name: 'Bakım planla' }).first().click()
  271 |       const dlg = page.getByRole('dialog')
  272 |       await dlg.locator('#mt-v').click()
  273 |       await dlg.locator('#mt-v').fill('S11-K-103')
  274 |       await dlg.getByRole('option', { name: /S11-K-103/ }).click()
  275 |       const start = await dlg.locator('#mt-s').inputValue()
  276 |       const t0 = new Date(start + 'Z').getTime() + shiftDays * 24 * 3600 * 1000
  277 |       await dlg.locator('#mt-s').fill(new Date(t0).toISOString().slice(0, 16))
  278 |       await dlg.locator('#mt-e').fill(new Date(t0 + hours * 3600 * 1000).toISOString().slice(0, 16))
  279 |       await dlg.locator('#mt-r').fill('Demo senaryosu: periyodik kontrol')
  280 |       await dlg.getByRole('button', { name: 'Planla' }).click()
  281 |       return dlg
  282 |     }
  283 | 
  284 |     // 1 · overlaps the confirmed reservation two days ahead: refused, with the source named
  285 |     let dlg = await plan(2, 30)
  286 |     await expect(dlg.getByRole('alert')).toContainText(/R-\d+|K-\d+|Rezervasyon|Kiralama/)
  287 |     await dlg.getByRole('button', { name: 'Vazgeç' }).click()
  288 |     await expect(page.getByText('S11-K-103')).toHaveCount(0) // nothing was created for this vehicle
  289 | 
  290 |     // 2 · a free window today: planned
  291 |     dlg = await plan(0, 3)
  292 |     await expect(dlg).toBeHidden()
  293 |     await page.getByRole('row', { name: /S11-K-103/ }).getByRole('cell').first().click()
  294 |     const drawer = page.getByRole('dialog')
  295 |     await drawer.getByRole('button', { name: 'Servise al' }).click()
  296 |     await drawer.getByRole('button', { name: 'Tamamla' }).click()
  297 |     const done = page.getByRole('dialog').last()
  298 |     await done.getByRole('button', { name: 'Tamamla' }).click()
  299 |     await expect(page.getByText(/otomatik Hazır sayılmaz/).first()).toBeVisible()
  300 |     await page.keyboard.press('Escape')
  301 | 
  302 |     // 3 · Vehicle 360 does not say the vehicle is ready just because service is finished
  303 |     await openDemo(page, vehicleUrl.replace(/\?.*/, ''))
  304 |     const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  305 |     // available again, but readiness is a separate answer: it has a blocker and the next pickup is not ready
  306 |     expect(text).toMatch(/Müsaitlik \(şimdi\) Müsait Hazırlık \d+ engel/)
  307 |     expect(text).toContain('Araç teslime hazır değil')
  308 |   })
  309 | })
  310 | 
  311 | test.describe('scenario 7 · lead → quote → reservation', () => {
  312 |   test('a lead gets a versioned quote, the old version is kept, accepting creates a customer and a pending reservation (quote ≠ reservation)', async ({ page }) => {
  313 |     await openDemo(page, '/')
  314 |     await runScenario(page, 7)
  315 |     await expect(page).toHaveURL(/talep-merkezi/)
  316 |     const name = 'Emina Demo-Test'
  317 | 
  318 |     // new lead
  319 |     await page.getByRole('button', { name: 'Yeni talep' }).click()
  320 |     let dlg = page.getByRole('dialog')
  321 |     await dlg.locator('#ln-n').fill(name)
  322 |     await dlg.locator('#ln-p').fill('+387 61 777 888')
  323 |     await dlg.locator('button[type=submit]').click()
  324 |     // saving the lead opens its record
  325 |     const drawer = () => page.getByRole('dialog')
  326 |     await expect(drawer()).toContainText(name)
  327 | 
  328 |     // quote v1, then v2: v1 is superseded, not deleted
  329 |     await drawer().getByRole('button', { name: 'Teklif hazırla' }).click()
  330 |     dlg = page.getByRole('dialog').last()
  331 |     await dlg.locator('button[type=submit]').click()
  332 |     await expect(drawer().getByText(/v1/).first()).toBeVisible()
  333 |     await drawer().getByRole('button', { name: 'Yeni teklif sürümü' }).click()
  334 |     dlg = page.getByRole('dialog').last()
  335 |     await dlg.locator('#qt-n').fill('Güncel fiyat listesiyle ikinci sürüm')
  336 |     await dlg.locator('button[type=submit]').click()
  337 |     await expect(drawer().getByText(/v2/).first()).toBeVisible()
  338 |     await expect(drawer().getByText(/v1/).first()).toBeVisible()
  339 |     await expect(drawer().getByText('Yeni sürümle değişti').or(drawer().getByText(/yerine geçildi|Yeni sürüm/)).first()).toBeVisible()
  340 | 
  341 |     // accepting the current version creates the pending reservation; nothing is held yet
  342 |     await drawer().getByRole('button', { name: /Kabul et/ }).click()
  343 |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  344 |     await expect(page.getByText('Bekliyor').first()).toBeVisible()
  345 |     await expect(page.getByText(name).first()).toBeVisible()
  346 | 
  347 |     // the customer record now exists and the lead is marked converted
  348 |     await openDemo(page, `/musteriler?q=${encodeURIComponent('Emina')}`)
  349 |     await expect(page.getByText(name).first()).toBeVisible()
  350 |     await openDemo(page, '/talep-merkezi')
  351 |     await expect(page.getByRole('row', { name: new RegExp(name) }).getByText('Rezervasyona dönüştü')).toBeVisible()
  352 |   })
  353 | })
  354 | 
  355 | test.describe('scenario 4 · fleet analysis', () => {
  356 |   test('period and branch filters change the rows and the numbers, a vehicle opens Vehicle 360, Back keeps the filters', async ({ page }) => {
  357 |     await openDemo(page, '/')
  358 |     await runScenario(page, 4)
> 359 |     await expect(page).toHaveURL(/filo-analizi/)
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  360 |     const rowsOf = () => page.getByRole('row').filter({ hasText: /%[0-9]+/ })
  361 |     await expect.poll(() => rowsOf().count()).toBeGreaterThan(5)
  362 |     const total = await rowsOf().count()
  363 |     const rented30 = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  364 | 
  365 |     // 7-day period: pressed, in the URL, and the utilisation numbers change
  366 |     await page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' }).click()
  367 |     await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')
  368 |     await expect(page).toHaveURL(/donem=(%227%22|7)/)
  369 |     expect((await page.locator('main').innerText()).replace(/\s+/g, ' ')).not.toBe(rented30)
  370 | 
  371 |     // one branch: fewer rows
  372 |     const opt = await page.getByLabel('Şube', { exact: true }).locator('option', { hasText: 'Mostar' }).first().getAttribute('value')
  373 |     await page.getByLabel('Şube', { exact: true }).selectOption(opt!)
  374 |     await expect(page).toHaveURL(/sube=/)
  375 |     await expect.poll(() => rowsOf().count()).toBeLessThan(total)
  376 |     const filteredRows = await rowsOf().count()
  377 | 
  378 |     // vehicle → Vehicle 360 → Back: filters and rows are the same
  379 |     const first = rowsOf().first().getByRole('link').first()
  380 |     await first.click()
  381 |     await expect(page).toHaveURL(/\/araclar\/v\d+/)
  382 |     await page.goBack()
  383 |     await expect(page).toHaveURL(/donem=(%227%22|7)/)
  384 |     await expect(page).toHaveURL(/sube=/)
  385 |     await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')
  386 |     await expect.poll(() => rowsOf().count()).toBe(filteredRows)
  387 |   })
  388 | })
  389 | 
```