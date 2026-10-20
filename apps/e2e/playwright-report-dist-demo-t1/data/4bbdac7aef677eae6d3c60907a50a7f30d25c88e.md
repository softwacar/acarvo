# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios.spec.ts >> scenario 7 · lead → quote → reservation >> a lead gets a versioned quote, the old version is kept, accepting creates a customer and a pending reservation (quote ≠ reservation)
- Location: demo-tests\scenarios.spec.ts:312:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Yeni talep' })

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
            - generic [ref=e183]: ACARVO
          - generic [ref=e184]:
            - button "Ara (Ctrl K)" [ref=e185] [cursor=pointer]:
              - generic [ref=e188]: Ara…
              - generic [ref=e189]: Ctrl K
            - generic [ref=e190]:
              - generic [ref=e193]: Şube filtresi
              - combobox "Şube filtresi" [ref=e195]:
                - option "Tüm şubeler" [selected]
                - option "SJJ · Sarajevo Havalimanı"
                - option "MST · Mostar Merkez"
                - option "DBV · Dubrovnik Havalimanı"
            - button "Bildirimler (14)" [ref=e196] [cursor=pointer]:
              - generic [ref=e199]: 9+
            - button "Demo" [ref=e200] [cursor=pointer]
        - main [ref=e206]:
          - generic [ref=e208]:
            - generic [ref=e209]:
              - generic [ref=e210]:
                - heading "Talep Merkezi — bu sürümde etkin değil" [level=1] [ref=e211]
                - paragraph [ref=e212]: Bu modül ürün haritasında var, ancak günlük V1 menüsünde değildir. Kodu ve demo verisi korunur; gerçek sisteme bağlı değildir.
              - generic [ref=e213]: V1.5
            - generic [ref=e215]:
              - paragraph [ref=e216]:
                - generic [ref=e217]: "Hedef sürüm:"
                - text: V1.5
              - paragraph [ref=e218]: Talepler ve Satış Teklifleri V1.5 kapsamındadır. V1’de talep kaynağı rezervasyondaki Kaynak alanı ve müşteri notuyla korunur.
              - generic [ref=e219]:
                - button "Gelişmiş konsept ön izlemesini aç" [ref=e220] [cursor=pointer]
                - link "Ana Ekran" [ref=e223] [cursor=pointer]:
                  - /url: /
              - paragraph [ref=e224]: "Ön izleme izole bir demo bağlamıdır: menüye bağlantı eklemez ve hazır ürün iddiası değildir."
        - contentinfo [ref=e225]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
  - status
```

# Test source

```ts
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
  230 |     await page.getByRole('button', { name: 'Rezervasyonu kaydet' }).click()
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
> 319 |     await page.getByRole('button', { name: 'Yeni talep' }).click()
      |                                                            ^ Error: locator.click: Test timeout of 60000ms exceeded.
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
  359 |     await expect(page).toHaveURL(/filo-analizi/)
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