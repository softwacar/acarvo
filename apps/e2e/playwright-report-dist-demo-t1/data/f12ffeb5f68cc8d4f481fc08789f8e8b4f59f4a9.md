# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 1 · daily operations >> Home → overdue card → the overdue list agrees with the Command Center; a row opens its Rental 360
- Location: demo-tests\scenarios.spec.ts:78:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: NaN
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic [ref=f1e4]:
    - note [ref=f1e5]:
      - generic [ref=f1e6]: ACARVO DEMO — Örnek Veriler
      - generic [ref=f1e9]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.
      - 'button "Demo zamanı: 20.10.2026 10:00" [ref=f1e10] [cursor=pointer]'
    - generic [ref=f1e13]:
      - complementary [ref=f1e14]:
        - generic [ref=f1e21]:
          - generic [ref=f1e22]: acarvo
          - generic [ref=f1e23]: Filo operasyonu
        - navigation "Ana menü" [ref=f1e24]:
          - generic [ref=f1e25]:
            - button "Genel 2" [expanded] [ref=f1e26] [cursor=pointer]:
              - generic [ref=f1e27]: Genel
              - generic [ref=f1e28]: "2"
            - list [ref=f1e31]:
              - listitem [ref=f1e32]:
                - link "Ana Ekran" [ref=f1e33] [cursor=pointer]:
                  - /url: /
              - listitem [ref=f1e37]:
                - link "İşlerim" [ref=f1e38] [cursor=pointer]:
                  - /url: /islerim
          - generic [ref=f1e42]:
            - button "Operasyon 7" [expanded] [ref=f1e43] [cursor=pointer]:
              - generic [ref=f1e44]: Operasyon
              - generic [ref=f1e45]: "7"
            - list [ref=f1e48]:
              - listitem [ref=f1e49]:
                - link "Rezervasyonlar" [ref=f1e50] [cursor=pointer]:
                  - /url: /rezervasyonlar
              - listitem [ref=f1e54]:
                - link "Kiralamalar" [ref=f1e55] [cursor=pointer]:
                  - /url: /kiralamalar
              - listitem [ref=f1e59]:
                - link "Takvim" [ref=f1e60] [cursor=pointer]:
                  - /url: /takvim
              - listitem [ref=f1e64]:
                - link "Görevler" [ref=f1e65] [cursor=pointer]:
                  - /url: /gorevler
              - listitem [ref=f1e69]:
                - link "Araçlar" [ref=f1e70] [cursor=pointer]:
                  - /url: /araclar
              - listitem [ref=f1e74]:
                - link "Bakım & Servis" [ref=f1e75] [cursor=pointer]:
                  - /url: /bakim-servis
              - listitem [ref=f1e79]:
                - link "Hasar ve Olaylar" [ref=f1e80] [cursor=pointer]:
                  - /url: /hasar-ve-olaylar
          - generic [ref=f1e84]:
            - button "Müşteri & Ticari 3" [expanded] [ref=f1e85] [cursor=pointer]:
              - generic [ref=f1e86]: Müşteri & Ticari
              - generic [ref=f1e87]: "3"
            - list [ref=f1e90]:
              - listitem [ref=f1e91]:
                - link "Müşteriler" [ref=f1e92] [cursor=pointer]:
                  - /url: /musteriler
              - listitem [ref=f1e96]:
                - link "Kurumsal Hesaplar" [ref=f1e97] [cursor=pointer]:
                  - /url: /kurumsal-hesaplar
              - listitem [ref=f1e101]:
                - link "Fiyatlandırma" [ref=f1e102] [cursor=pointer]:
                  - /url: /fiyatlandirma
          - generic [ref=f1e106]:
            - button "Finans 3" [expanded] [ref=f1e107] [cursor=pointer]:
              - generic [ref=f1e108]: Finans
              - generic [ref=f1e109]: "3"
            - list [ref=f1e112]:
              - listitem [ref=f1e113]:
                - link "Finans" [ref=f1e114] [cursor=pointer]:
                  - /url: /finans
              - listitem [ref=f1e118]:
                - link "Masraflar" [ref=f1e119] [cursor=pointer]:
                  - /url: /masraflar
              - listitem [ref=f1e123]:
                - link "Şube Kasaları" [ref=f1e124] [cursor=pointer]:
                  - /url: /sube-kasalari
          - generic [ref=f1e128]:
            - button "Kontrol ve Raporlar 2" [expanded] [ref=f1e129] [cursor=pointer]:
              - generic [ref=f1e130]: Kontrol ve Raporlar
              - generic [ref=f1e131]: "2"
            - list [ref=f1e134]:
              - listitem [ref=f1e135]:
                - link "Raporlar" [ref=f1e136] [cursor=pointer]:
                  - /url: /raporlar
              - listitem [ref=f1e140]:
                - link "Onay Merkezi" [ref=f1e141] [cursor=pointer]:
                  - /url: /onay-merkezi
          - generic [ref=f1e145]:
            - button "Yönetim 4" [expanded] [ref=f1e146] [cursor=pointer]:
              - generic [ref=f1e147]: Yönetim
              - generic [ref=f1e148]: "4"
            - list [ref=f1e151]:
              - listitem [ref=f1e152]:
                - link "Şubeler" [ref=f1e153] [cursor=pointer]:
                  - /url: /subeler
              - listitem [ref=f1e157]:
                - link "Kullanıcılar ve Roller" [ref=f1e158] [cursor=pointer]:
                  - /url: /kullanicilar
              - listitem [ref=f1e162]:
                - link "İşlem Geçmişi" [ref=f1e163] [cursor=pointer]:
                  - /url: /islem-gecmisi
              - listitem [ref=f1e167]:
                - link "Ayarlar" [ref=f1e168] [cursor=pointer]:
                  - /url: /ayarlar
        - button "Demo kullanıcısı ve rol değiştir" [ref=f1e173] [cursor=pointer]:
          - generic [ref=f1e174]: AK
          - generic [ref=f1e175]:
            - generic [ref=f1e176]: Adnan Kovač
            - generic [ref=f1e177]: Sahip · Tüm şubeler
      - generic [ref=f1e180]:
        - banner [ref=f1e181]:
          - navigation "Konum" [ref=f1e182]:
            - generic [ref=f1e183]: Genel
            - generic [ref=f1e184]: /
            - generic [ref=f1e185]: İşlerim
          - generic [ref=f1e186]:
            - button "Ara (Ctrl K)" [ref=f1e187] [cursor=pointer]:
              - generic [ref=f1e190]: Ara…
              - generic [ref=f1e191]: Ctrl K
            - generic [ref=f1e192]:
              - generic [ref=f1e195]: Şube filtresi
              - combobox "Şube filtresi" [ref=f1e197]:
                - option "Tüm şubeler" [selected]
                - option "SJJ · Sarajevo Havalimanı"
                - option "MST · Mostar Merkez"
                - option "DBV · Dubrovnik Havalimanı"
            - button "Bildirimler (14)" [ref=f1e198] [cursor=pointer]:
              - generic [ref=f1e201]: 9+
            - button "Demo" [ref=f1e202] [cursor=pointer]
        - main [ref=f1e208]:
          - generic [ref=f1e210]:
            - generic [ref=f1e212]:
              - heading "İşlerim" [level=1] [ref=f1e213]
              - paragraph [ref=f1e214]: "Size düşen görevler, bekleyen onaylar ve müdahale gerektiren kayıtlar tek listede. İşlerim yeni bir kayıt deposu değildir: her satır kendi kaynağına gider; görev, onay ve uyarı kuralları kaynak ekranda işler."
            - region "Özet" [ref=f1e215]:
              - link "Bana atanan görev 1" [ref=f1e216] [cursor=pointer]:
                - /url: /gorevler?gorunum=bana
                - generic [ref=f1e217]: Bana atanan görev
                - generic [ref=f1e218]: "1"
              - link "Üstlenebileceğim 2 Açık havuz" [ref=f1e219] [cursor=pointer]:
                - /url: /gorevler?gorunum=havuz
                - generic [ref=f1e220]: Üstlenebileceğim
                - generic [ref=f1e221]: "2"
                - generic [ref=f1e222]: Açık havuz
              - link "Bekleyen onay 4" [ref=f1e223] [cursor=pointer]:
                - /url: /onay-merkezi
                - generic [ref=f1e224]: Bekleyen onay
                - generic [ref=f1e225]: "4"
              - generic [ref=f1e226]:
                - generic [ref=f1e227]: Müdahale gerektiren
                - generic [ref=f1e228]: "6"
            - tablist "İşlerim bölümleri" [ref=f1e229]:
              - tab "Bana Düşenler13" [selected] [ref=f1e230] [cursor=pointer]
              - tab "Uyarılar31" [ref=f1e231] [cursor=pointer]
            - generic [ref=f1e232]:
              - group "Tür" [ref=f1e234]:
                - button "Hepsi" [pressed] [ref=f1e235] [cursor=pointer]
                - button "Görevler" [ref=f1e236] [cursor=pointer]
                - button "Onaylar" [ref=f1e237] [cursor=pointer]
                - button "Müdahale" [ref=f1e238] [cursor=pointer]
              - list "Bana düşen işler" [ref=f1e241]:
                - listitem [ref=f1e242]:
                  - link "Uyarı DU 104-CD · Sigorta poliçesi süresi doldu Müdahale gerektiriyor · 3 gün önce doldu (2026-10-17). Araç teslim hazırlığında engel sayılır." [ref=f1e243] [cursor=pointer]:
                    - /url: /araclar/v22
                    - generic [ref=f1e245]:
                      - generic [ref=f1e246]:
                        - generic [ref=f1e247]: Uyarı
                        - generic [ref=f1e248]: DU 104-CD · Sigorta poliçesi süresi doldu
                      - generic [ref=f1e249]: Müdahale gerektiriyor · 3 gün önce doldu (2026-10-17). Araç teslim hazırlığında engel sayılır.
                - listitem [ref=f1e252]:
                  - link "Uyarı K-000035 · iade gecikti (DU 103-CD) Müdahale gerektiriyor · Ana Horvat · planlanan iade geçti (48 saat). Araç hâlâ müşteride." [ref=f1e253] [cursor=pointer]:
                    - /url: /kiralamalar/rn35
                    - generic [ref=f1e255]:
                      - generic [ref=f1e256]:
                        - generic [ref=f1e257]: Uyarı
                        - generic [ref=f1e258]: K-000035 · iade gecikti (DU 103-CD)
                      - generic [ref=f1e259]: Müdahale gerektiriyor · Ana Horvat · planlanan iade geçti (48 saat). Araç hâlâ müşteride.
                - listitem [ref=f1e262]:
                  - link "Uyarı K-000028 · iade gecikti (S11-K-101) Müdahale gerektiriyor · Tarik Testić · planlanan iade geçti (16 saat). Araç hâlâ müşteride." [ref=f1e263] [cursor=pointer]:
                    - /url: /kiralamalar/rn28
                    - generic [ref=f1e265]:
                      - generic [ref=f1e266]:
                        - generic [ref=f1e267]: Uyarı
                        - generic [ref=f1e268]: K-000028 · iade gecikti (S11-K-101)
                      - generic [ref=f1e269]: Müdahale gerektiriyor · Tarik Testić · planlanan iade geçti (16 saat). Araç hâlâ müşteride.
                - listitem [ref=f1e272]:
                  - 'link "Uyarı İade 24 saatten fazla gecikti · K-000035 Müdahale gerektiriyor · Kiralama iadesi 24 saatten fazla gecikti: kayıp/çalıntı değerlendirmesi için yetkiliye bildirin." [ref=f1e273] [cursor=pointer]':
                    - /url: /kiralamalar/rn35
                    - generic [ref=f1e275]:
                      - generic [ref=f1e276]:
                        - generic [ref=f1e277]: Uyarı
                        - generic [ref=f1e278]: İade 24 saatten fazla gecikti · K-000035
                      - generic [ref=f1e279]: "Müdahale gerektiriyor · Kiralama iadesi 24 saatten fazla gecikti: kayıp/çalıntı değerlendirmesi için yetkiliye bildirin."
                - listitem [ref=f1e282]:
                  - link "Uyarı K-000037 · teslim hazırlığı eksik (S11-K-104) Müdahale gerektiriyor · Ajla Testović · sözleşme imzasız · depozito alınmadı" [ref=f1e283] [cursor=pointer]:
                    - /url: /kiralamalar/rn37
                    - generic [ref=f1e285]:
                      - generic [ref=f1e286]:
                        - generic [ref=f1e287]: Uyarı
                        - generic [ref=f1e288]: K-000037 · teslim hazırlığı eksik (S11-K-104)
                      - generic [ref=f1e289]: Müdahale gerektiriyor · Ajla Testović · sözleşme imzasız · depozito alınmadı
                - listitem [ref=f1e292]:
                  - link "Uyarı R-000010 · araç çakışması (M22-K-206) Müdahale gerektiriyor · Hans Müller-Demo · Hasar engeli H-000044 ile çakışıyor. Alternatif araç atayın." [ref=f1e293] [cursor=pointer]:
                    - /url: /rezervasyonlar/rsv10
                    - generic [ref=f1e295]:
                      - generic [ref=f1e296]:
                        - generic [ref=f1e297]: Uyarı
                        - generic [ref=f1e298]: R-000010 · araç çakışması (M22-K-206)
                      - generic [ref=f1e299]: Müdahale gerektiriyor · Hans Müller-Demo · Hasar engeli H-000044 ile çakışıyor. Alternatif araç atayın.
                - listitem [ref=f1e302]:
                  - link "Onay ON-000007 · Uzun süreli rezervasyon için %20 indirim talebi. Kararınız bekleniyor · Karar bekliyor" [ref=f1e303] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap7
                    - generic [ref=f1e305]:
                      - generic [ref=f1e306]:
                        - generic [ref=f1e307]: Onay
                        - generic [ref=f1e308]: ON-000007 · Uzun süreli rezervasyon için %20 indirim talebi.
                      - generic [ref=f1e309]: Kararınız bekleniyor · Karar bekliyor
                - listitem [ref=f1e312]:
                  - link "Onay ON-000004 · Ödeme yanlış kiralamaya girilmiş; ters kayıt istiyorum. Uygulamanız bekleniyor · Onaylandı, uygulanmadı" [ref=f1e313] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap4
                    - generic [ref=f1e315]:
                      - generic [ref=f1e316]:
                        - generic [ref=f1e317]: Onay
                        - generic [ref=f1e318]: ON-000004 · Ödeme yanlış kiralamaya girilmiş; ters kayıt istiyorum.
                      - generic [ref=f1e319]: Uygulamanız bekleniyor · Onaylandı, uygulanmadı
                - listitem [ref=f1e322]:
                  - 'link "Onay ON-000002 · Sadık müşteri, geçen yıl 6 kiralama: %18 indirim talep ediliyor. Kararınız bekleniyor · Karar bekliyor" [ref=f1e323] [cursor=pointer]':
                    - /url: /onay-merkezi?kayit=ap2
                    - generic [ref=f1e325]:
                      - generic [ref=f1e326]:
                        - generic [ref=f1e327]: Onay
                        - generic [ref=f1e328]: "ON-000002 · Sadık müşteri, geçen yıl 6 kiralama: %18 indirim talep ediliyor."
                      - generic [ref=f1e329]: Kararınız bekleniyor · Karar bekliyor
                - listitem [ref=f1e332]:
                  - link "Onay ON-000003 · Kurumsal bağlantılı müşteri; depozito yarıya indirilsin. Kararınız bekleniyor · Karar bekliyor" [ref=f1e333] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap3
                    - generic [ref=f1e335]:
                      - generic [ref=f1e336]:
                        - generic [ref=f1e337]: Onay
                        - generic [ref=f1e338]: ON-000003 · Kurumsal bağlantılı müşteri; depozito yarıya indirilsin.
                      - generic [ref=f1e339]: Kararınız bekleniyor · Karar bekliyor
                - listitem [ref=f1e342]:
                  - 'link "Görev Dubrovnik: transfer aracı yakıt kontrolü Üstlenebilirsiniz · GR-000014 · açık havuz · 22.10.2026 10:00" [ref=f1e343] [cursor=pointer]':
                    - /url: /gorevler?kayit=tk14
                    - generic [ref=f1e345]:
                      - generic [ref=f1e346]:
                        - generic [ref=f1e347]: Görev
                        - generic [ref=f1e348]: "Dubrovnik: transfer aracı yakıt kontrolü"
                      - generic [ref=f1e349]: Üstlenebilirsiniz · GR-000014 · açık havuz · 22.10.2026 10:00
                  - button "Üstlen" [ref=f1e352] [cursor=pointer]
                - listitem [ref=f1e353]:
                  - link "Görev Yeni sezon fiyat listesi toplantısı Bana atandı · GR-000011 · normal öncelik · 24.10.2026 11:00" [ref=f1e354] [cursor=pointer]:
                    - /url: /gorevler?kayit=tk11
                    - generic [ref=f1e356]:
                      - generic [ref=f1e357]:
                        - generic [ref=f1e358]: Görev
                        - generic [ref=f1e359]: Yeni sezon fiyat listesi toplantısı
                      - generic [ref=f1e360]: Bana atandı · GR-000011 · normal öncelik · 24.10.2026 11:00
                  - button "Tamamla" [ref=f1e363] [cursor=pointer]
                - listitem [ref=f1e364]:
                  - link "Görev Havalimanı otopark kartlarını yenileyin Üstlenebilirsiniz · GR-000005 · açık havuz · 25.10.2026 17:00" [ref=f1e365] [cursor=pointer]:
                    - /url: /gorevler?kayit=tk5
                    - generic [ref=f1e367]:
                      - generic [ref=f1e368]:
                        - generic [ref=f1e369]: Görev
                        - generic [ref=f1e370]: Havalimanı otopark kartlarını yenileyin
                      - generic [ref=f1e371]: Üstlenebilirsiniz · GR-000005 · açık havuz · 25.10.2026 17:00
                  - button "Üstlen" [ref=f1e374] [cursor=pointer]
              - paragraph [ref=f1e375]:
                - text: Görevlerin tamamı için
                - link "Görevler" [ref=f1e376] [cursor=pointer]:
                  - /url: /gorevler
                - text: ·
                - link "Onay Merkezi" [ref=f1e377] [cursor=pointer]:
                  - /url: /onay-merkezi
        - contentinfo [ref=f1e378]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
  - status
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
> 95  |     expect(Number(/Geciken iade (\d+)/.exec(cc)?.[1])).toBe(homeOverdue)
      |                                                        ^ Error: expect(received).toBe(expected) // Object.is equality
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
```