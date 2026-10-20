# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> demo flows >> a new reservation is saved, persists across a reload and the reset removes it
- Location: demo-tests\flows.spec.ts:7:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Rezervasyonu kaydet' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - note [ref=e5]:
      - generic [ref=e6]: ACARVO DEMO — Örnek Veriler
      - generic [ref=e9]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.
      - 'button "Demo zamanı: 20.10.2026 10:00" [ref=e10] [cursor=pointer]'
    - generic [ref=e13]:
      - complementary [ref=e14]:
        - generic [ref=e21]:
          - generic [ref=e22]: acarvo
          - generic [ref=e23]: Filo operasyonu
        - navigation "Ana menü" [ref=e24]:
          - generic [ref=e25]:
            - button "Genel 2" [expanded] [ref=e26] [cursor=pointer]:
              - generic [ref=e27]: Genel
              - generic [ref=e28]: "2"
            - list [ref=e31]:
              - listitem [ref=e32]:
                - link "Ana Ekran" [ref=e33] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e37]:
                - link "İşlerim" [ref=e38] [cursor=pointer]:
                  - /url: /islerim
          - generic [ref=e42]:
            - button "Operasyon 7" [expanded] [ref=e43] [cursor=pointer]:
              - generic [ref=e44]: Operasyon
              - generic [ref=e45]: "7"
            - list [ref=e48]:
              - listitem [ref=e49]:
                - link "Rezervasyonlar" [ref=e50] [cursor=pointer]:
                  - /url: /rezervasyonlar
              - listitem [ref=e54]:
                - link "Kiralamalar" [ref=e55] [cursor=pointer]:
                  - /url: /kiralamalar
              - listitem [ref=e59]:
                - link "Takvim" [ref=e60] [cursor=pointer]:
                  - /url: /takvim
              - listitem [ref=e64]:
                - link "Görevler" [ref=e65] [cursor=pointer]:
                  - /url: /gorevler
              - listitem [ref=e69]:
                - link "Araçlar" [ref=e70] [cursor=pointer]:
                  - /url: /araclar
              - listitem [ref=e74]:
                - link "Bakım & Servis" [ref=e75] [cursor=pointer]:
                  - /url: /bakim-servis
              - listitem [ref=e79]:
                - link "Hasar ve Olaylar" [ref=e80] [cursor=pointer]:
                  - /url: /hasar-ve-olaylar
          - generic [ref=e84]:
            - button "Müşteri & Ticari 3" [expanded] [ref=e85] [cursor=pointer]:
              - generic [ref=e86]: Müşteri & Ticari
              - generic [ref=e87]: "3"
            - list [ref=e90]:
              - listitem [ref=e91]:
                - link "Müşteriler" [ref=e92] [cursor=pointer]:
                  - /url: /musteriler
              - listitem [ref=e96]:
                - link "Kurumsal Hesaplar" [ref=e97] [cursor=pointer]:
                  - /url: /kurumsal-hesaplar
              - listitem [ref=e101]:
                - link "Fiyatlandırma" [ref=e102] [cursor=pointer]:
                  - /url: /fiyatlandirma
          - generic [ref=e106]:
            - button "Finans 3" [expanded] [ref=e107] [cursor=pointer]:
              - generic [ref=e108]: Finans
              - generic [ref=e109]: "3"
            - list [ref=e112]:
              - listitem [ref=e113]:
                - link "Finans" [ref=e114] [cursor=pointer]:
                  - /url: /finans
              - listitem [ref=e118]:
                - link "Masraflar" [ref=e119] [cursor=pointer]:
                  - /url: /masraflar
              - listitem [ref=e123]:
                - link "Şube Kasaları" [ref=e124] [cursor=pointer]:
                  - /url: /sube-kasalari
          - generic [ref=e128]:
            - button "Kontrol ve Raporlar 2" [expanded] [ref=e129] [cursor=pointer]:
              - generic [ref=e130]: Kontrol ve Raporlar
              - generic [ref=e131]: "2"
            - list [ref=e134]:
              - listitem [ref=e135]:
                - link "Raporlar" [ref=e136] [cursor=pointer]:
                  - /url: /raporlar
              - listitem [ref=e140]:
                - link "Onay Merkezi" [ref=e141] [cursor=pointer]:
                  - /url: /onay-merkezi
          - generic [ref=e145]:
            - button "Yönetim 4" [expanded] [ref=e146] [cursor=pointer]:
              - generic [ref=e147]: Yönetim
              - generic [ref=e148]: "4"
            - list [ref=e151]:
              - listitem [ref=e152]:
                - link "Şubeler" [ref=e153] [cursor=pointer]:
                  - /url: /subeler
              - listitem [ref=e157]:
                - link "Kullanıcılar ve Roller" [ref=e158] [cursor=pointer]:
                  - /url: /kullanicilar
              - listitem [ref=e162]:
                - link "İşlem Geçmişi" [ref=e163] [cursor=pointer]:
                  - /url: /islem-gecmisi
              - listitem [ref=e167]:
                - link "Ayarlar" [ref=e168] [cursor=pointer]:
                  - /url: /ayarlar
        - button "Demo kullanıcısı ve rol değiştir" [ref=e173] [cursor=pointer]:
          - generic [ref=e174]: AK
          - generic [ref=e175]:
            - generic [ref=e176]: Adnan Kovač
            - generic [ref=e177]: Sahip · Tüm şubeler
      - generic [ref=e180]:
        - banner [ref=e181]:
          - navigation "Konum" [ref=e182]:
            - generic [ref=e183]: Operasyon
            - generic [ref=e184]: /
            - link "Rezervasyonlar" [ref=e185] [cursor=pointer]:
              - /url: /rezervasyonlar
            - generic [ref=e186]: /
            - generic [ref=e187]: Ayrıntı
          - generic [ref=e188]:
            - button "Ara (Ctrl K)" [ref=e189] [cursor=pointer]:
              - generic [ref=e192]: Ara…
              - generic [ref=e193]: Ctrl K
            - generic [ref=e194]:
              - generic [ref=e197]: Şube filtresi
              - combobox "Şube filtresi" [ref=e199]:
                - option "Tüm şubeler" [selected]
                - option "SJJ · Sarajevo Havalimanı"
                - option "MST · Mostar Merkez"
                - option "DBV · Dubrovnik Havalimanı"
            - button "Bildirimler (14)" [ref=e200] [cursor=pointer]:
              - generic [ref=e203]: 9+
            - button "Demo" [ref=e204] [cursor=pointer]
        - main [ref=e210]:
          - generic [ref=e212]:
            - link "Rezervasyonlar" [ref=e213] [cursor=pointer]:
              - /url: /rezervasyonlar
            - generic [ref=e216]:
              - generic [ref=e218]:
                - heading "Yeni rezervasyon" [level=1] [ref=e219]
                - paragraph [ref=e220]: Rezervasyon bir kiralama değildir. Araç seçmezseniz yalnız sınıf rezervasyonu olur ve belirli bir aracı tutmaz.
              - generic [ref=e221]:
                - generic [ref=e222]:
                  - region [ref=e223]:
                    - heading "Müşteri" [level=2] [ref=e226]
                    - generic [ref=e227]:
                      - generic [ref=e228]:
                        - generic [ref=e229]:
                          - generic [ref=e230]:
                            - text: Müşteri
                            - generic [aria-hidden] [ref=e231]: "*"
                            - generic [ref=e232]: (zorunlu)
                          - combobox "Müşteri (zorunlu)" [ref=e235]: Lejla Demić
                        - button "Yeni müşteri ekle" [ref=e237] [cursor=pointer]
                        - generic [ref=e240]:
                          - generic [ref=e241]: Kurumsal hesap
                          - combobox "Kurumsal hesap" [ref=e243]:
                            - option "Bireysel" [selected]
                            - option "Neretva Logistics d.o.o."
                            - option "Drina Consulting d.o.o."
                            - option "Una Tours d.o.o."
                            - option "Bosna Pharma d.d."
                      - generic [ref=e245]:
                        - generic [ref=e246]: Ek sürücü ekle
                        - combobox "Ek sürücü ekle" [ref=e249]
                        - paragraph [ref=e250]: Ek sürücü ücreti günlük hesaplanır · en fazla 3
                  - region [ref=e251]:
                    - heading "Plan" [level=2] [ref=e254]
                    - generic [ref=e256]:
                      - generic [ref=e257]:
                        - generic [ref=e258]: Teslim şubesi
                        - combobox "Teslim şubesi" [ref=e260]:
                          - option "SJJ · Sarajevo Havalimanı" [selected]
                          - option "MST · Mostar Merkez"
                          - option "DBV · Dubrovnik Havalimanı"
                      - generic [ref=e261]:
                        - generic [ref=e262]: İade şubesi
                        - combobox "İade şubesi" [ref=e264]:
                          - option "SJJ · Sarajevo Havalimanı" [selected]
                          - option "MST · Mostar Merkez"
                          - option "DBV · Dubrovnik Havalimanı"
                      - generic [ref=e265]:
                        - generic [ref=e266]:
                          - text: Teslim
                          - generic [aria-hidden] [ref=e267]: "*"
                          - generic [ref=e268]: (zorunlu)
                        - textbox "Teslim (zorunlu)" [ref=e269]: 2026-10-20T11:00
                        - paragraph [ref=e270]: "Saat dilimi: Europe/Sarajevo"
                      - generic [ref=e271]:
                        - generic [ref=e272]:
                          - text: İade
                          - generic [aria-hidden] [ref=e273]: "*"
                          - generic [ref=e274]: (zorunlu)
                        - textbox "İade (zorunlu)" [ref=e275]: 2026-10-23T10:00
                        - paragraph [ref=e276]: "Saat dilimi: Europe/Sarajevo"
                  - region [ref=e277]:
                    - generic [ref=e279]:
                      - heading "Araç" [level=2] [ref=e280]
                      - paragraph [ref=e281]: İsteğe bağlı. Seçilirse onaylı rezervasyon o aracı tutar.
                    - generic [ref=e282]:
                      - generic [ref=e283]:
                        - generic [ref=e284]:
                          - generic [ref=e285]: Sınıf
                          - combobox "Sınıf" [ref=e287]:
                            - option "Ekonomi" [selected]
                            - option "Kompakt"
                            - option "SUV"
                            - option "Premium"
                            - option "Minibüs"
                        - generic [ref=e288]:
                          - generic [ref=e289]: Araç (isteğe bağlı)
                          - combobox "Araç (isteğe bağlı)" [ref=e291]:
                            - option "Yalnız sınıf (araç atanmadı)" [selected]
                            - option "M22-K-202 · Renault Clio"
                            - 'option "DU 101-AB · Škoda Fabia — uygun değil: Kiralama K-000031" [disabled]'
                            - 'option "DU 102-AB · Opel Corsa — uygun değil: Bakım B-000007" [disabled]'
                            - 'option "M22-K-201 · Volkswagen Polo — uygun değil: Rezervasyon R-000008" [disabled]'
                            - 'option "S11-K-101 · Volkswagen Polo — uygun değil: Kiralama K-000028" [disabled]'
                            - 'option "S11-K-102 · Škoda Fabia — uygun değil: Rezervasyon R-000017" [disabled]'
                            - 'option "S11-K-103 · Opel Corsa — uygun değil: Rezervasyon R-000005" [disabled]'
                            - 'option "S11-K-110 · Renault Clio — uygun değil: Transfer T-000043" [disabled]'
                      - generic [ref=e292]: Bu kayıt henüz belirli bir aracı ayırmaz. Araç seçilmezse yalnız “bekleyen” kaydedilebilir; onay için belirli bir araç gerekir.
                      - paragraph [ref=e296]: "Sınıf kapasitesi: seçili günlerde en az 1 araç müsait."
                  - region [ref=e297]:
                    - generic [ref=e299]:
                      - heading "Fiyat kalemleri" [level=2] [ref=e300]
                      - paragraph [ref=e301]: Sigorta, ekstra ve ücretler her para birimi için ayrı fiyat satırı kullanır; para birimleri arasında çeviri yapılmaz.
                    - generic [ref=e302]:
                      - generic [ref=e303]:
                        - generic [ref=e304]:
                          - generic [ref=e305]: Para birimi
                          - combobox "Para birimi" [ref=e307]:
                            - option "EUR" [selected]
                            - option "BAM"
                            - option "USD"
                        - generic [ref=e308]:
                          - generic [ref=e309]: Sigorta paketi
                          - combobox "Sigorta paketi" [ref=e311]:
                            - option "Paket yok" [selected]
                            - option "CDW Temel Koruma (7,00 EUR/gün)"
                            - option "SCDW Tam Koruma (12,00 EUR/gün)"
                      - group "Ekstralar" [ref=e312]:
                        - list [ref=e314]:
                          - listitem [ref=e315]:
                            - generic [ref=e316]:
                              - generic [ref=e317]: GPS navigasyon
                              - text: 5,00 EUR / gün
                            - spinbutton "GPS navigasyon adedi" [ref=e318]: "0"
                          - listitem [ref=e319]:
                            - generic [ref=e320]:
                              - generic [ref=e321]: Çocuk koltuğu
                              - text: 3,00 EUR / gün
                            - spinbutton "Çocuk koltuğu adedi" [ref=e322]: "0"
                          - listitem [ref=e323]:
                            - generic [ref=e324]:
                              - generic [ref=e325]: Kış lastiği / zincir takımı
                              - text: 20,00 EUR / kiralama
                            - spinbutton "Kış lastiği / zincir takımı adedi" [ref=e326]: "0"
                          - listitem [ref=e327]:
                            - generic [ref=e328]:
                              - generic [ref=e329]: Mobil Wi-Fi modem
                              - text: 4,00 EUR / gün
                            - spinbutton "Mobil Wi-Fi modem adedi" [ref=e330]: "0"
                  - region [ref=e331]:
                    - heading "Not ve kanal" [level=2] [ref=e334]
                    - generic [ref=e335]:
                      - generic [ref=e337]:
                        - generic [ref=e338]: Kanal
                        - combobox "Kanal" [ref=e340]:
                          - option "Telefon" [selected]
                          - option "Şubede"
                          - option "Web formu"
                          - option "Partner"
                          - option "Kurumsal"
                          - option "Teklif"
                      - generic [ref=e342]:
                        - generic [ref=e343]: Not
                        - textbox "Not" [ref=e344]
                  - generic [ref=e345]:
                    - generic [ref=e346]: "Bekleyen Kaydet: araç veya kapasite tutmaz. Kontrol Et ve Onayla: yetki, belirli araç, çakışma ve kredi kontrol edilir; biri başarısız olursa kayıt oluşmaz."
                    - generic [ref=e347]:
                      - button "Vazgeç" [ref=e348] [cursor=pointer]
                      - button "Bekleyen Kaydet" [ref=e349] [cursor=pointer]
                      - button "Kontrol Et ve Onayla" [disabled] [ref=e350]
                - complementary "Özet" [ref=e351]:
                  - region [ref=e352]:
                    - heading "Özet" [level=2] [ref=e355]
                    - generic [ref=e356]:
                      - generic [ref=e357]:
                        - generic [ref=e358]:
                          - term [ref=e359]: Süre
                          - definition [ref=e360]: 3 gün
                        - generic [ref=e361]:
                          - term [ref=e362]: Teslim
                          - definition [ref=e363]: 20.10.2026 11:00
                        - generic [ref=e364]:
                          - term [ref=e365]: İade
                          - definition [ref=e366]: 23.10.2026 10:00
                        - generic [ref=e367]:
                          - term [ref=e368]: Araç
                          - definition [ref=e369]: Yalnız sınıf
                      - generic [ref=e371]:
                        - table [ref=e373]:
                          - rowgroup [ref=e374]:
                            - row [ref=e375]:
                              - columnheader "Kalem" [ref=e376]
                              - columnheader "Tutar" [ref=e377]
                          - rowgroup [ref=e378]:
                            - row [ref=e379]:
                              - cell "Ekonomi · günlük baz tarife" [ref=e380]
                              - cell "105,00 EUR" [ref=e381]
                            - row [ref=e382]:
                              - cell "Süre kademesi (3+ gün) %5" [ref=e383]
                              - cell "-5,25 EUR" [ref=e384]
                          - rowgroup [ref=e385]:
                            - row [ref=e386]:
                              - cell "Net" [ref=e387]
                              - cell "85,26 EUR" [ref=e388]
                            - row [ref=e389]:
                              - cell "Örnek KDV %17 (dahil)" [ref=e390]
                              - cell "14,49 EUR" [ref=e391]
                            - row [ref=e392]:
                              - cell "Toplam (EUR)" [ref=e393]
                              - cell "99,75 EUR" [ref=e394]
                        - paragraph [ref=e395]: Fiyat sürümü rev-0 · 3 gün · tek işlem para birimi; fiyatlarda kur dönüşümü yoktur.
                  - region [ref=e396]:
                    - generic [ref=e398]:
                      - heading "Kontroller" [level=2] [ref=e399]
                      - paragraph [ref=e400]: Engel yok
                    - list [ref=e402]:
                      - listitem [ref=e403]:
                        - generic [ref=e406]:
                          - paragraph [ref=e407]: "Sürücü: Lejla Demić"
                          - paragraph [ref=e408]: 34 yaş · ehliyet 14 yıl
                        - link "Kayda git" [ref=e409] [cursor=pointer]:
                          - /url: /musteriler/c3
                      - listitem [ref=e410]:
                        - generic [ref=e413]:
                          - paragraph [ref=e414]: Depozito politikası
                          - paragraph [ref=e415]: "Teslimde gerekli depozito: 150,00 EUR (gelir değildir)"
                  - paragraph [ref=e417]: Kaparo ve ödeme kayıt oluştuktan sonra alınır. Fiyat, kaydedildiği anda dondurulur ve sonraki fiyat listesi değişikliklerinden etkilenmez.
        - contentinfo [ref=e418]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
  - status
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { openDemo, switchUser, watch } from './fixtures'
  3  | 
  4  | // End-to-end behaviour of the demo: actions persist, reset restores, roles change what is allowed, language switches.
  5  | 
  6  | test.describe('demo flows', () => {
  7  |   test('a new reservation is saved, persists across a reload and the reset removes it', async ({ page }) => {
  8  |     const w = watch(page)
  9  |     await openDemo(page, '/rezervasyonlar/yeni?musteri=c3')
> 10 |     await page.getByRole('button', { name: 'Rezervasyonu kaydet' }).click()
     |                                                                     ^ Error: locator.click: Test timeout of 60000ms exceeded.
  11 |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  12 |     await expect(page.getByText('Bekliyor').first()).toBeVisible()
  13 |     const url = page.url()
  14 |     await page.reload()
  15 |     await page.waitForLoadState('networkidle')
  16 |     await expect(page).toHaveURL(url)
  17 |     await expect(page.getByText('Bekliyor').first()).toBeVisible()
  18 | 
  19 |     // reset from the Demo menu
  20 |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  21 |     await page.getByRole('menuitem', { name: /Demo verilerini sıfırla/ }).click()
  22 |     await page.getByRole('button', { name: 'Sıfırla' }).click()
  23 |     await page.waitForLoadState('networkidle')
  24 |     await page.goto(url)
  25 |     await expect(page.getByText('Rezervasyon bulunamadı')).toBeVisible()
  26 |     expect(w.apiRequests).toEqual([])
  27 |   })
  28 | 
  29 |   test('the role switcher changes what the user may see: Operasyon has no finance reports or settings management', async ({ page }) => {
  30 |     await openDemo(page, '/')
  31 |     await switchUser(page, /Haris Mehić/)
  32 |     await openDemo(page, '/ayarlar')
  33 |     await expect(page.getByText(/yetkiniz yok|yetki/i).first()).toBeVisible()
  34 |     await openDemo(page, '/raporlar')
  35 |     await expect(page.getByRole('button', { name: /Gelir \(hesaplanan\)/ })).toHaveCount(0)
  36 |   })
  37 | 
  38 |   test('the owner can open the single exchange-rate desk; it exists only in Settings', async ({ page }) => {
  39 |     await openDemo(page, '/ayarlar?bolum=kurlar')
  40 |     await expect(page.getByRole('heading', { name: 'Geçerli kurlar' })).toBeVisible()
  41 |     await expect(page.getByText('1 EUR = 2 BAM').first()).toBeVisible()
  42 |     await openDemo(page, '/finans?sekme=kurlar')
  43 |     await expect(page.getByRole('link', { name: 'Kurları düzenle' })).toBeVisible()
  44 |   })
  45 | 
  46 |   test('the language can be switched to English and the navigation follows', async ({ page }) => {
  47 |     await openDemo(page, '/')
  48 |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  49 |     await page.getByRole('menuitem', { name: /Dil:/ }).click()
  50 |     await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
  51 |     await expect(page.getByText('ACARVO DEMO — Sample Data').first()).toBeVisible()
  52 |   })
  53 | 
  54 |   test('a delivery cannot be completed while checks fail and the button says why', async ({ page }) => {
  55 |     await openDemo(page, '/kiralamalar?durum=prepared')
  56 |     await page.getByRole('link', { name: /^K-\d+/ }).first().click()
  57 |     await expect(page.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  58 |     await expect(page.getByText('Düğme pasif: eksik kontroller')).toBeVisible()
  59 |   })
  60 | 
  61 |   test('the Command Center, Home and the notification bell read one alert source', async ({ page }) => {
  62 |     await openDemo(page, '/komuta-merkezi?sekme=uyarilar')
  63 |     const tab = await page.getByRole('tab', { name: /Uyarılar/ }).textContent()
  64 |     const count = Number(/(\d+)/.exec(tab ?? '')?.[1] ?? '0')
  65 |     expect(count).toBeGreaterThan(0)
  66 |     await openDemo(page, '/riskler-ve-istisnalar')
  67 |     const risks = await page.getByRole('tab', { name: /Riskler/ }).textContent()
  68 |     expect(Number(/(\d+)/.exec(risks ?? '')?.[1] ?? '-1')).toBe(count)
  69 |   })
  70 | })
  71 | 
```