# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: advance.spec.ts >> advance (kaparo) >> a refund request needs a second person: requested, approved, applied; the advance ends as Refunded
- Location: demo-tests\advance.spec.ts:47:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('dialog').getByRole('button', { name: /Onayla/ })
    - locator resolved to <button disabled type="button" title="Kendi talebinizi onaylayamazsınız" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-line-soft disabled:opacity-60">Onayla</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    109 × waiting for element to be visible, enabled and stable
        - element is not enabled
      - retrying click action
        - waiting 500ms

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - generic [aria-hidden]:
        - note:
          - generic: ACARVO DEMO — Örnek Veriler
          - generic: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.
          - button: "Demo zamanı: 20.10.2026 10:00"
        - generic:
          - complementary:
            - generic:
              - generic:
                - generic: acarvo
                - generic: Filo operasyonu
            - navigation:
              - generic:
                - button [expanded]:
                  - generic: Genel
                  - generic: "2"
                - list:
                  - listitem:
                    - link:
                      - /url: /
                      - generic: Ana Ekran
                  - listitem:
                    - link:
                      - /url: /islerim
                      - generic: İşlerim
              - generic:
                - button [expanded]:
                  - generic: Operasyon
                  - generic: "7"
                - list:
                  - listitem:
                    - link:
                      - /url: /rezervasyonlar
                      - generic: Rezervasyonlar
                  - listitem:
                    - link:
                      - /url: /kiralamalar
                      - generic: Kiralamalar
                  - listitem:
                    - link:
                      - /url: /takvim
                      - generic: Takvim
                  - listitem:
                    - link:
                      - /url: /gorevler
                      - generic: Görevler
                  - listitem:
                    - link:
                      - /url: /araclar
                      - generic: Araçlar
                  - listitem:
                    - link:
                      - /url: /bakim-servis
                      - generic: Bakım & Servis
                  - listitem:
                    - link:
                      - /url: /hasar-ve-olaylar
                      - generic: Hasar ve Olaylar
              - generic:
                - button [expanded]:
                  - generic: Müşteri & Ticari
                  - generic: "3"
                - list:
                  - listitem:
                    - link:
                      - /url: /musteriler
                      - generic: Müşteriler
                  - listitem:
                    - link:
                      - /url: /kurumsal-hesaplar
                      - generic: Kurumsal Hesaplar
                  - listitem:
                    - link:
                      - /url: /fiyatlandirma
                      - generic: Fiyatlandırma
              - generic:
                - button [expanded]:
                  - generic: Finans
                  - generic: "3"
                - list:
                  - listitem:
                    - link:
                      - /url: /finans
                      - generic: Finans
                  - listitem:
                    - link:
                      - /url: /masraflar
                      - generic: Masraflar
                  - listitem:
                    - link:
                      - /url: /sube-kasalari
                      - generic: Şube Kasaları
              - generic:
                - button [expanded]:
                  - generic: Kontrol ve Raporlar
                  - generic: "2"
                - list:
                  - listitem:
                    - link:
                      - /url: /raporlar
                      - generic: Raporlar
                  - listitem:
                    - link:
                      - /url: /onay-merkezi
                      - generic: Onay Merkezi
              - generic:
                - button [expanded]:
                  - generic: Yönetim
                  - generic: "4"
                - list:
                  - listitem:
                    - link:
                      - /url: /subeler
                      - generic: Şubeler
                  - listitem:
                    - link:
                      - /url: /kullanicilar
                      - generic: Kullanıcılar ve Roller
                  - listitem:
                    - link:
                      - /url: /islem-gecmisi
                      - generic: İşlem Geçmişi
                  - listitem:
                    - link:
                      - /url: /ayarlar
                      - generic: Ayarlar
            - generic:
              - button:
                - generic: AK
                - generic:
                  - generic: Adnan Kovač
                  - generic: Sahip · Tüm şubeler
          - generic:
            - banner:
              - navigation:
                - generic: Kontrol ve Raporlar
                - generic: /
                - generic: Onay Merkezi
              - generic:
                - button:
                  - generic: Ara…
                  - generic: Ctrl K
                - generic:
                  - generic: Şube filtresi
                  - generic:
                    - combobox
                - button:
                  - generic: 9+
                - button:
                  - generic: Demo
            - main:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - heading [level=1]: Onay Merkezi
                      - paragraph: Altı resmî onay türü. Talep eden kişi kendi talebini onaylayamaz (dört göz); Onaylandı ile Uygulandı ayrı adımlardır ve her onay yalnız bir kez uygulanır.
                    - generic:
                      - button: CSV
                      - button: Yeni talep
                  - region:
                    - generic:
                      - generic: Karar bekleyen
                      - generic: "4"
                    - generic:
                      - generic: Benim kararımı bekleyen
                      - generic: "3"
                      - generic: Kendi talepleriniz hariç
                    - generic:
                      - generic: Onaylı, uygulanmadı
                      - generic: "1"
                    - generic:
                      - generic: Uygulanan
                      - generic: "2"
                  - tablist:
                    - tab [selected]: Karar bekleyen4
                    - tab: Onaylı, uygulanacak1
                    - tab: Tamamlanan
                    - tab: Tümü
                  - generic:
                    - generic:
                      - generic: Tür
                      - generic:
                        - combobox
                  - generic:
                    - generic:
                      - table:
                        - rowgroup:
                          - row:
                            - columnheader:
                              - button: Talep
                            - columnheader: Tür
                            - columnheader: İstenen
                            - columnheader: Talep eden
                            - columnheader:
                              - button: Tarih
                            - columnheader:
                              - button: Durum
                        - rowgroup:
                          - row:
                            - cell: ON-000008
                            - cell: İade
                            - cell: 39,80 EUR
                            - cell: Adnan Kovač
                            - cell: 20.10.2026 10:00
                            - cell:
                              - generic: Talep edildi
                          - row:
                            - cell: ON-000003
                            - cell: Depozito İstisnası
                            - cell: 150,00 EUR
                            - cell: Lejla Šehović
                            - cell: 19.10.2026 16:00
                            - cell:
                              - generic: Talep edildi
                          - row:
                            - cell: ON-000002
                            - cell: Yüksek İndirim
                            - cell:
                              - generic: "%18"
                            - cell: Haris Mehić
                            - cell: 19.10.2026 14:00
                            - cell:
                              - generic: Talep edildi
                          - row:
                            - cell: ON-000007
                            - cell: Yüksek İndirim
                            - cell:
                              - generic: "%20"
                            - cell: Lejla Šehović
                            - cell: 12.10.2026 10:00
                            - cell:
                              - generic: Talep edildi
            - contentinfo: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
      - status
  - dialog [ref=f2e2]:
    - generic [ref=f2e3]:
      - generic [ref=f2e4]:
        - heading "ON-000008" [level=2] [ref=f2e5]
        - paragraph [ref=f2e6]: İade
      - button "Kapat" [active] [ref=f2e7] [cursor=pointer]
    - generic [ref=f2e11]:
      - generic [ref=f2e12]:
        - generic [ref=f2e13]:
          - term [ref=f2e14]: Durum
          - definition [ref=f2e15]:
            - generic [ref=f2e16]: Talep edildi
        - generic [ref=f2e17]:
          - term [ref=f2e18]: Hedef
          - definition [ref=f2e19]:
            - link "R-000022" [ref=f2e20] [cursor=pointer]:
              - /url: /rezervasyonlar/rsv22
        - generic [ref=f2e21]:
          - term [ref=f2e22]: İstenen
          - definition [ref=f2e23]: 39,80 EUR
        - generic [ref=f2e24]:
          - term [ref=f2e25]: Gerekçe
          - definition [ref=f2e26]: Müşteri seyahatini erteledi, tam iade.
        - generic [ref=f2e27]:
          - term [ref=f2e28]: Talep eden
          - definition [ref=f2e29]: Adnan Kovač · 20.10.2026 10:00
        - generic [ref=f2e30]:
          - term [ref=f2e31]: Karar veren
          - definition [ref=f2e32]: —
        - generic [ref=f2e33]:
          - term [ref=f2e34]: Karar notu
          - definition [ref=f2e35]: —
        - generic [ref=f2e36]:
          - term [ref=f2e37]: Uygulayan
          - definition [ref=f2e38]: —
      - paragraph [ref=f2e39]: "Uygulanınca: İade tamamlanır; nakit iade ise şube kasasından çıkar."
      - generic [ref=f2e40]: "Bu talebi siz açtınız: onaylayamaz, reddedemez ve uygulayamazsınız (dört göz). Üstteki Demo menüsünden başka bir kullanıcıya geçip deneyin."
      - generic [ref=f2e44]:
        - heading "İşlemler" [level=3] [ref=f2e45]
        - generic [ref=f2e46]:
          - button "Onayla" [disabled] [ref=f2e47]
          - button "Reddet" [disabled] [ref=f2e48]
      - generic [ref=f2e49]:
        - heading "Geçmiş" [level=3] [ref=f2e50]
        - list [ref=f2e51]:
          - listitem [ref=f2e52]:
            - generic [ref=f2e55]:
              - paragraph [ref=f2e56]: Talep edildi
              - paragraph [ref=f2e57]: 20.10.2026 10:00 · Adnan Kovač
              - paragraph [ref=f2e58]: Müşteri seyahatini erteledi, tam iade.
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { deliverAtDesk, kpiValue, openDemo, switchUser, watch } from './fixtures'
  3  | 
  4  | // Advance (kaparo) as the user sees it: held on the reservation, moved to the rental on conversion, applied once at delivery;
  5  | // refunded through four-eyes approval; kept as a policy fee only after a cancellation or no-show.
  6  | 
  7  | const openStory = async (page: import('@playwright/test').Page) => {
  8  |   await openDemo(page, '/rezervasyonlar?q=Selma')
  9  |   await page.getByText('Selma Hodžić-Demo').first().click()
  10 |   await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  11 | }
  12 | 
  13 | test.describe('advance (kaparo)', () => {
  14 |   test('the story reservation shows a held advance; conversion moves it once; delivery applies it once to the charge', async ({ page }) => {
  15 |     const w = watch(page)
  16 |     await openStory(page)
  17 |     await page.getByRole('tab', { name: /Kaparo/ }).click()
  18 |     await expect(page.getByText('Tutuluyor (uygulanmadı)')).toBeVisible()
  19 |     await expect(page.getByText(/gelir değildir/).first()).toBeVisible()
  20 |     const amount = /T-\d+ · ([0-9.,]+ EUR)/.exec((await page.locator('main').innerText()).replace(/\s+/g, ' '))![1]!
  21 | 
  22 |     // the same advance is listed in Finance → Advances and links back
  23 |     await page.getByRole('link', { name: /Finans Merkezi · Kaparo/ }).click()
  24 |     await expect(page.getByText(amount).first()).toBeVisible()
  25 |     await page.goBack()
  26 | 
  27 |     // conversion: the advance moves to the rental, unapplied (there is no charge before delivery)
  28 |     await page.getByRole('button', { name: 'Kiralamaya dönüştür' }).click()
  29 |     const confirm = page.getByRole('dialog')
  30 |     if (await confirm.count()) await confirm.getByRole('button', { name: /Dönüştür/ }).click()
  31 |     await expect(page).toHaveURL(/\/kiralamalar\/rn\d+/)
  32 |     await page.getByRole('tab', { name: 'Finans' }).click()
  33 |     await expect(page.getByText('Kiralamaya aktarıldı').first()).toBeVisible()
  34 |     expect(await kpiValue(page, 'Uygulanmamış')).toBe(amount)
  35 |     expect(await kpiValue(page, 'Hesap kalemleri')).toBe('0,00 EUR')
  36 | 
  37 |     // delivery posts the one base charge and applies the advance to it, once
  38 |     await page.getByRole('tab', { name: 'Teslim Masası' }).click()
  39 |     await deliverAtDesk(page)
  40 |     await page.getByRole('tab', { name: 'Finans' }).click()
  41 |     await expect(page.getByText('Hesap kalemine uygulandı').first()).toBeVisible()
  42 |     expect(await kpiValue(page, 'Uygulanan')).toBe(amount)
  43 |     expect(await kpiValue(page, 'Uygulanmamış')).toBe('0,00 EUR')
  44 |     expect(w.apiRequests).toEqual([])
  45 |   })
  46 | 
  47 |   test('a refund request needs a second person: requested, approved, applied; the advance ends as Refunded', async ({ page }) => {
  48 |     await openStory(page)
  49 |     await page.getByRole('tab', { name: /Kaparo/ }).click()
  50 |     await page.getByRole('button', { name: 'İade talep et' }).click()
  51 |     const dlg = page.getByRole('dialog')
  52 |     await dlg.locator('#ap-r').fill('Müşteri seyahatini erteledi, tam iade.')
  53 |     await dlg.getByRole('button', { name: 'Talep et' }).click()
  54 |     await expect(dlg).toBeHidden()
  55 |     await expect(page.getByText(/Açık iade talebi var/)).toBeVisible()
  56 | 
  57 |     // the requester cannot decide: the open request shows no decision for them; a second user approves and applies
  58 |     await openDemo(page, '/onay-merkezi')
  59 |     await switchUser(page, /Selma Karić/)
  60 |     await openDemo(page, '/onay-merkezi')
  61 |     await page.getByRole('row', { name: /İade/ }).first().click()
  62 |     let drawer = page.getByRole('dialog')
> 63 |     await drawer.getByRole('button', { name: /Onayla/ }).click()
     |                                                          ^ Error: locator.click: Test timeout of 60000ms exceeded.
  64 |     await expect(drawer.getByText(/Onaylandı/).first()).toBeVisible()
  65 |     await drawer.getByRole('button', { name: /Uygula/ }).click()
  66 |     await expect(drawer.getByText(/Uygulandı/).first()).toBeVisible()
  67 |     await page.keyboard.press('Escape')
  68 | 
  69 |     // the advance now ends as Refunded on the reservation and in Finance; it is no longer held
  70 |     await openStory(page)
  71 |     await page.getByRole('tab', { name: /Kaparo/ }).click()
  72 |     await expect(page.getByText('İade edildi').first()).toBeVisible()
  73 |     await expect(page.getByText('Tutuluyor (uygulanmadı)')).toHaveCount(0)
  74 |     await expect(page.getByRole('button', { name: 'İade talep et' })).toHaveCount(0)
  75 |   })
  76 | })
  77 | 
```