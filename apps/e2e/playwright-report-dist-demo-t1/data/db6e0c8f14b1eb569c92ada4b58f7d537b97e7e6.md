# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 2 · reservation to handover >> choose a customer, see price and availability, save confirmed, convert, deliver at the Delivery Desk; vehicle and lists agree
- Location: demo-tests\scenarios.spec.ts:200:3

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
                          - combobox "Müşteri (zorunlu)" [ref=e235]: Nina Mock
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
                        - textbox "İade (zorunlu)" [active] [ref=e275]: 2026-10-21T11:00
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
                            - option "Yalnız sınıf (araç atanmadı)"
                            - option "M22-K-202 · Renault Clio" [selected]
                            - option "S11-K-102 · Škoda Fabia"
                            - option "S11-K-103 · Opel Corsa"
                            - 'option "DU 101-AB · Škoda Fabia — uygun değil: Kiralama K-000031" [disabled]'
                            - 'option "DU 102-AB · Opel Corsa — uygun değil: Bakım B-000007" [disabled]'
                            - 'option "M22-K-201 · Volkswagen Polo — uygun değil: Rezervasyon R-000008" [disabled]'
                            - 'option "S11-K-101 · Volkswagen Polo — uygun değil: Kiralama K-000028" [disabled]'
                            - 'option "S11-K-110 · Renault Clio — uygun değil: Transfer T-000043" [disabled]'
                      - paragraph [ref=e292]: "Araç konumu: Mostar Merkez · 50.600 km"
                  - region [ref=e293]:
                    - generic [ref=e295]:
                      - heading "Fiyat kalemleri" [level=2] [ref=e296]
                      - paragraph [ref=e297]: Sigorta, ekstra ve ücretler her para birimi için ayrı fiyat satırı kullanır; para birimleri arasında çeviri yapılmaz.
                    - generic [ref=e298]:
                      - generic [ref=e299]:
                        - generic [ref=e300]:
                          - generic [ref=e301]: Para birimi
                          - combobox "Para birimi" [ref=e303]:
                            - option "EUR" [selected]
                            - option "BAM"
                            - option "USD"
                        - generic [ref=e304]:
                          - generic [ref=e305]: Sigorta paketi
                          - combobox "Sigorta paketi" [ref=e307]:
                            - option "Paket yok" [selected]
                            - option "CDW Temel Koruma (7,00 EUR/gün)"
                            - option "SCDW Tam Koruma (12,00 EUR/gün)"
                      - group "Ekstralar" [ref=e308]:
                        - list [ref=e310]:
                          - listitem [ref=e311]:
                            - generic [ref=e312]:
                              - generic [ref=e313]: GPS navigasyon
                              - text: 5,00 EUR / gün
                            - spinbutton "GPS navigasyon adedi" [ref=e314]: "0"
                          - listitem [ref=e315]:
                            - generic [ref=e316]:
                              - generic [ref=e317]: Çocuk koltuğu
                              - text: 3,00 EUR / gün
                            - spinbutton "Çocuk koltuğu adedi" [ref=e318]: "0"
                          - listitem [ref=e319]:
                            - generic [ref=e320]:
                              - generic [ref=e321]: Kış lastiği / zincir takımı
                              - text: 20,00 EUR / kiralama
                            - spinbutton "Kış lastiği / zincir takımı adedi" [ref=e322]: "0"
                          - listitem [ref=e323]:
                            - generic [ref=e324]:
                              - generic [ref=e325]: Mobil Wi-Fi modem
                              - text: 4,00 EUR / gün
                            - spinbutton "Mobil Wi-Fi modem adedi" [ref=e326]: "0"
                  - region [ref=e327]:
                    - heading "Not ve kanal" [level=2] [ref=e330]
                    - generic [ref=e331]:
                      - generic [ref=e333]:
                        - generic [ref=e334]: Kanal
                        - combobox "Kanal" [ref=e336]:
                          - option "Telefon" [selected]
                          - option "Şubede"
                          - option "Web formu"
                          - option "Partner"
                          - option "Kurumsal"
                          - option "Teklif"
                      - generic [ref=e338]:
                        - generic [ref=e339]: Not
                        - textbox "Not" [ref=e340]
                  - generic [ref=e341]:
                    - generic [ref=e342]: "Bekleyen Kaydet: araç veya kapasite tutmaz. Kontrol Et ve Onayla: yetki, belirli araç, çakışma ve kredi kontrol edilir; biri başarısız olursa kayıt oluşmaz."
                    - generic [ref=e343]:
                      - button "Vazgeç" [ref=e344] [cursor=pointer]
                      - button "Bekleyen Kaydet" [ref=e345] [cursor=pointer]
                      - button "Kontrol Et ve Onayla" [ref=e346] [cursor=pointer]
                - complementary "Özet" [ref=e347]:
                  - region [ref=e348]:
                    - heading "Özet" [level=2] [ref=e351]
                    - generic [ref=e352]:
                      - generic [ref=e353]:
                        - generic [ref=e354]:
                          - term [ref=e355]: Süre
                          - definition [ref=e356]: 1 gün
                        - generic [ref=e357]:
                          - term [ref=e358]: Teslim
                          - definition [ref=e359]: 20.10.2026 11:00
                        - generic [ref=e360]:
                          - term [ref=e361]: İade
                          - definition [ref=e362]: 21.10.2026 11:00
                        - generic [ref=e363]:
                          - term [ref=e364]: Araç
                          - definition [ref=e365]: M22-K-202 · Renault Clio
                      - generic [ref=e367]:
                        - table [ref=e369]:
                          - rowgroup [ref=e370]:
                            - row [ref=e371]:
                              - columnheader "Kalem" [ref=e372]
                              - columnheader "Tutar" [ref=e373]
                          - rowgroup [ref=e374]:
                            - row [ref=e375]:
                              - cell "Ekonomi · günlük baz tarife" [ref=e376]
                              - cell "35,00 EUR" [ref=e377]
                          - rowgroup [ref=e378]:
                            - row [ref=e379]:
                              - cell "Net" [ref=e380]
                              - cell "29,91 EUR" [ref=e381]
                            - row [ref=e382]:
                              - cell "Örnek KDV %17 (dahil)" [ref=e383]
                              - cell "5,09 EUR" [ref=e384]
                            - row [ref=e385]:
                              - cell "Toplam (EUR)" [ref=e386]
                              - cell "35,00 EUR" [ref=e387]
                        - paragraph [ref=e388]: Fiyat sürümü rev-0 · 1 gün · tek işlem para birimi; fiyatlarda kur dönüşümü yoktur.
                  - region [ref=e389]:
                    - generic [ref=e391]:
                      - heading "Kontroller" [level=2] [ref=e392]
                      - paragraph [ref=e393]: Engel yok
                    - list [ref=e395]:
                      - listitem [ref=e396]:
                        - generic [ref=e399]:
                          - paragraph [ref=e400]: "Sürücü: Nina Mock"
                          - paragraph [ref=e401]: 26 yaş · ehliyet 7 yıl
                        - link "Kayda git" [ref=e402] [cursor=pointer]:
                          - /url: /musteriler/c19
                      - listitem [ref=e403]:
                        - generic [ref=e406]:
                          - paragraph [ref=e407]: Araç müsaitliği
                          - paragraph [ref=e408]: Seçilen aralıkta çakışma yok.
                        - link "Kayda git" [ref=e409] [cursor=pointer]:
                          - /url: /araclar/v12
                      - listitem [ref=e410]:
                        - generic [ref=e413]:
                          - paragraph [ref=e414]: Hazırlık (ayrı kavram)Uyarı
                          - paragraph [ref=e415]: 1 hazırlık engeli var; teslimden önce Teslim Masası'nda kapanmalı.
                        - link "Kayda git" [ref=e416] [cursor=pointer]:
                          - /url: /araclar/v12
                      - listitem [ref=e417]:
                        - generic [ref=e420]:
                          - paragraph [ref=e421]: Depozito politikası
                          - paragraph [ref=e422]: "Teslimde gerekli depozito: 150,00 EUR (gelir değildir)"
                  - paragraph [ref=e424]: Kaparo ve ödeme kayıt oluştuktan sonra alınır. Fiyat, kaydedildiği anda dondurulur ve sonraki fiyat listesi değişikliklerinden etkilenmez.
        - contentinfo [ref=e425]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
  - status
```

# Test source

```ts
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
  223 |         break
  224 |       }
  225 |     }
  226 |     expect(plate, 'a free vehicle exists for one day').not.toBe('')
  227 | 
  228 |     // price preview is shown before saving and the reservation is confirmed on save
  229 |     await expect(page.getByRole('complementary', { name: 'Özet' })).toContainText(/EUR|BAM/)
> 230 |     await page.getByRole('button', { name: 'Rezervasyonu kaydet' }).click()
      |                                                                     ^ Error: locator.click: Test timeout of 60000ms exceeded.
  231 |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  232 |     await expect(page.getByText('Bekliyor').first()).toBeVisible() // saved as pending: it holds no vehicle yet
  233 |     await page.getByRole('button', { name: 'Onayla', exact: true }).click()
  234 |     await expect(page.getByText('Onaylı').first()).toBeVisible()
  235 |     const reservationNo = (await page.locator('h1').first().innerText()).trim()
  236 | 
  237 |     // convert to a rental and open the Delivery Desk
  238 |     await page.getByRole('button', { name: 'Kiralamaya dönüştür' }).click()
  239 |     const dlg = page.getByRole('dialog')
  240 |     if (await dlg.count()) await dlg.getByRole('button', { name: /Dönüştür/ }).click()
  241 |     await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
  242 |     await expect(page.getByText('Hazırlanıyor').first()).toBeVisible()
  243 |     await page.getByRole('tab', { name: 'Teslim Masası' }).click()
  244 | 
  245 |     // the desk refuses until every check passes; then deliver
  246 |     await expect(page.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  247 |     await deliverAtDesk(page)
  248 | 
  249 |     // everything agrees: the vehicle is rented, the rentals list has it delivered, the reservation is converted
  250 |     await openDemo(page, `/kiralamalar?q=${encodeURIComponent(plate)}`)
  251 |     await expect(page.getByRole('row', { name: new RegExp(plate) }).getByText('Teslim edildi')).toBeVisible()
  252 |     await openDemo(page, `/araclar?q=${encodeURIComponent(plate)}`)
  253 |     await expect(page.getByRole('row', { name: new RegExp(plate) }).getByText('Kirada')).toBeVisible()
  254 |     await openDemo(page, '/rezervasyonlar?q=Nina%20Mock')
  255 |     await expect(page.getByRole('row', { name: new RegExp(reservationNo) }).getByText('Kiralamaya dönüştü')).toBeVisible()
  256 |     expect(w.apiRequests).toEqual([])
  257 |   })
  258 | })
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
```