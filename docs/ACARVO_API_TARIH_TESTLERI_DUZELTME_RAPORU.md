# ACARVO — Gerçek API Tarih Bağımlı Testlerinin Düzeltilmesi

**Dal:** `fix/api-date-dependent-tests` (ana klasör `C:\Users\soena\Desktop\acarvo`, yeni klasör/worktree açılmadı) · **Başlangıç:** `main` = `origin/main` = `b9684c8`, çalışma ağacı temiz
**Kapsam:** yalnız testler ve test araçları. `apps/api/src`, `packages/`, migration, `.env`, frontend: **değişmedi** (`git diff main -- apps/api/src packages` boş).
Altı belge (`ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` ve 5 rapor) main'de duruyor; silme stash'i (`stash@{0}`) uygulanmadı, dokunulmadı.

## 1. Sonuç özeti

| Kontrol | Sonuç |
|---|---|
| 11 başarısız test (gerçek tarihte) | **11 / 11 düzeldi** (finance + rentals dosyaları: 55 / 55) |
| Gerçek API, 1. bağımsız tam tur | **543 / 543** geçti (39 dosya) |
| Gerçek API, 2. bağımsız tam tur | **543 / 543** geçti |
| Gerçek tarayıcı (API'den sonra, tek başına) | **134 geçti / 36 atlandı** |
| TypeScript (api, shared, web, e2e) | temiz |
| Normal web build | temiz |

543 = önceki 534 + yeni 9 tarih dayanıklılık testi. Hiçbir test silinmedi, atlanmadı (`.skip` yok), hiçbir beklenen tutar değiştirilmedi (11.700 EUR vb. aynı).

## 2. Kök neden (kanıtlı) — 11 testin tek tek nedeni

Önceki rapordaki "tarih bağımlılığı" teşhisini kabul etmeden önce yeniden kanıtladım:

**A. Finans testleri (10 test): tutar 11.700 yerine 17.550 çıkıyordu.** Testler kiralamayı "bugün+1 10:00 → bugün+3 10:00" (yerel saat) kurar ve fiyat listesi `rolling_24h` (geçen gerçek saat, yukarı yuvarlama, tolerans 0) kullanır. Bugün 22 Ekim 2026 iken pencere 23 Ekim 10:00 → 25 Ekim 10:00'dur ve **25 Ekim 03:00'teki saat geri alınışını** (Avrupa kış saati) kapsar: gerçek süre **49 saat** → 3 gün → 3 × 50 EUR = 150 + %17 = **175,50 EUR**. Diğer günlerde 48 saat → 2 gün → 117 EUR.
- Kanıt 1 (hesap): `@acarvo/shared` `billableDays` ile bugün=20/21/22/24/25 Ekim → 2/2/**3**/2/2 gün. Tüm 2026–2029 için süpürme (yeni test): bozulan tarihler yalnız her yıl iki gün (saat geri alma gününden 3 ve 2 gün önce: 22–23 Ekim 2026, 28–29 Ekim 2027, 26–27 Ekim 2028, 25–26 Ekim 2029).
- Kanıt 2 (yeniden üretim): test saati simülatörüyle (`ACARVO_TEST_NOW`) **orijinal** test dosyaları 22 Ekim 00:30'a getirilince **aynı 11 test aynı şekilde düştü**; 20 Ekim'de finance 26/26 geçti.
- Kanıt 3: eski main kodunda (`44354d0`) aynı iki dosya bugün aynı 11 hatayı verdi → birleştirmeden bağımsız.

| # | Test | Neden |
|---|---|---|
| 1 | a quote, a handover or a rental close never creates finance records… | teklif tutarı 17.550 (beklenen 11.700): yukarıdaki 49 saat |
| 2 | a quote becomes a pending line only by an authorised person… | `amountMinor` 17.550 ≠ 11.700 |
| 3 | four-eyes and handover… | `postedChargesMinor` 11.700 beklenirken 17.550 |
| 4 | cash needs the staff statement… | zincir: 2. testteki kalem oluşmadığı için `recordedPaymentsMinor` tutmadı |
| 5 | verification: Operasyon cannot… | zincir (aynı paylaşılan durum) |
| 6 | a third-party payer by name… | zincir: `[201, 201]` beklenen `[201, 409]` (tutar sınırı farklı) |
| 7 | reject and reverse… | zincir: önceki ödeme kaydı yok → `undefined.id` |
| 8 | a deposit in its own currency… | zincir |
| 9 | lists, pending queue and summary… | zincir (`reversed` durumu oluşmadı) |
| 10 | statements: the customer sees what she is responsible for… | doğrudan: `17550 to be 11700` |

Bu testlerin sıralı ve paylaşılan durumla çalıştığı (her test öncekinin kaydını kullanır) için 4–9 numaralılar bir önceki hatanın zincirleme sonucudur; kök neden hepsi için aynıdır ve düzeltme sonrası 26/26 geçmesiyle doğrulandı.

**B. `rentals.test.ts` — "a time that never happened… a doubled time…" (1 test):** test sabit tarih kullanıyordu (`2026-10-24T10:00 → 2026-10-25T02:30`, ayrıca `2027-03-27/28`). Aynı dosyadaki başka bir test aynı aracı (Duster) varsayılan pencereyle (bugün+1 … bugün+3) kiralıyor; 22 Ekim'de bu pencere 23–25 Ekim → `VEHICLE_UNAVAILABLE … K-000013` (409). Ek olarak sabit 2026 tarihi 25 Ekim'den sonra geçmişte kalacaktı (zamanla kendiliğinden bozulacak ikinci bir sorun).

**Gerçek uygulama kodu hatalı mı? Hayır.** `rolling_24h` yöntemi tanım gereği geçen süreyi sayar; 49 saatlik pencere 3 gündür. Üretim davranışı değiştirilmedi. *Ürün gözlemi (karar gerektirir, bu işte değiştirilmedi):* müşteri yaz/kış saati değişen bir haftada duvar saatiyle "aynı saat, iki gün sonra" kirasında `rolling_24h` ile fazladan bir gün ödüyor; `calendar_day` yöntemi bunu önler. Fiyat listesi yöntemi şirket tercihidir.

## 3. Yapılan değişiklikler

| Dosya | Değişiklik |
|---|---|
| `tests/finance.test.ts` | Finans test fiyat listesi `calendar_day` (günlük tarife, aynı 50 EUR + %17): bu testler finans kurallarını sınar, geçen-saat faturalamasını değil. Beklenen tutarlar aynı |
| `tests/rentals.test.ts` | DST testi sabit tarih yerine **bugünden 90+ gün sonraki gerçek ilkbahar ve sonbahar saat değişimlerini** saat dilimi kurallarından bulur (başka testlerin kiralamalarıyla çakışmaz, yıl geçse de geçerli); doğrudan veritabanı çakışma testi `now() + interval` (DB saati) yerine testin kullandığı günlerden türetilmiş zaman damgası kullanır (karışık saat kaynağı kalktı) |
| `tests/test-dates.ts` (yeni) | Saati okumayan yardımcılar: `addDays`, `nextClockChange(tz, gün, tür)`, `spansClockChange` |
| `tests/date-robustness.test.ts` (yeni, 9 test) | Veritabanı ve sistem saati olmadan **4 yılın her günü** üzerinde kontrol (aşağıda) |
| `tests/setup-clock.ts` (yeni) + `vitest.config.ts` | İsteğe bağlı test saati: `ACARVO_TEST_NOW=<an>` yalnız JavaScript saatini kaydırır; ayarlı değilse hiçbir şey değişmez |
| `scripts/test-dates.mjs` + `npm run test:dates` | Tarihe duyarlı dosyaları gerçek saatte ve 3 saat / 27 saat öncesine simüle edilmiş saatlerde (gece yarısı geçişi dahil) çalıştırır |

Finans hesaplama motoruna, fiyatlandırmaya, uygunluk kontrolüne ve diğer üretim koduna dokunulmadı.

## 4. Tarih, DST ve saat dilimi kontrolleri

**Her gün (veritabanısız, normal API setine dahil):** 2026-01-01 → 2029-12-31, 1.461 gün:
- Saat değişimleri gerçek AB tarihlerinde bulunuyor (2026-03-29, 2026-10-25, 2027-03-28, 2027-10-31 …); ilkbahar günündeki 02:30 "yok", sonbahar günündeki 02:30 "iki kez" ve "later" = 01:30 UTC.
- "Bugün+1 10:00 → bugün+3 10:00": `calendar_day` **her tarihte 2 gün**; `rolling_24h` = geçen saatin yukarı yuvarlaması, 3 gün **yalnız** sonbahar saat değişimini içeren günlerde (yılda 2 gün; kaçının olduğu listelendi).
- Yıl sonu, ay sonu, artık gün (29 Şubat 2028) gün aritmetiği; yerel gece yarısı kış/yaz ve saat değişimi gecelerinde `todayIn` doğru; sunucu saat diliminden bağımsız; ABD (New York) ve Tokyo saat dilimleri, UTC'de saat değişimi yok.

**Simüle edilen günlerle (veritabanlı, gerçek API):** gerçek saat, 3 saat önce (21 Ekim akşamı), 27 saat önce (20 Ekim, bir gece yarısı geçişi): finance, rentals, reservations, pricing-contracts, rentals-integration, dst, date-robustness → **137 / 137** (her üçünde). Ek olarak elle: 20 Ekim 09:00, 21 Ekim 12:00 (7 dosya 135/135), 21 Ekim 23:50 ve 22 Ekim 00:30 (time.test dahil 8 dosyada 147/148; tek düşen `time.test.ts` "sunucu New York'ta" simülasyon artefaktıdır: süreç saat dilimini değiştirir, gerçek saatte geçer) → tarihe duyarlı 7 dosyanın tümü geçti.

**Sınırlar (açık):** `ACARVO_TEST_NOW` yalnız JavaScript saatini kaydırır; PostgreSQL `now()` gerçek kalır ve tohum veri "gelecekteki odometre okuması"nı reddeder. Bu yüzden **yaklaşık bir günden fazla geri** simülasyon anlamlı değildir (51 saat geri: `now()` ile hesaplanan "gecikmiş kiralama" görünümleri ve odometre sırası uyuşmuyor, 4 test düştü — tarih hatası değil, saat kaynağı uyumsuzluğu); gelecek tarihler simüle edilemez. Yıl sonu / ay sonu / ilkbahar haftası gerçek veritabanlı testle değil, yukarıdaki veritabanısız süpürmeyle kapsanır. `time.test.ts` ("sunucu New York'ta") ve operations/readiness testleri `now()`/`clock_timestamp()` kullandığından simülasyonda artefakt verir (20 Ekim simülasyonunda 10 test düştü, hepsi saat kaynağı karışıklığı), bu yüzden simülasyona dahil edilmedi; gerçek saatte hepsi geçiyor. Diğer dosyalardaki `local()` tanımları göreli tarih kullanır; tutar bekleyenler (finance, pricing-contracts, rentals-integration, reservations) simülasyonda geçti; saat değişimi haftasında tutar bekleyen başka test bulunmadı.

## 5. Finans ve rezervasyon iş kurallarının korunması

Üretim kodu değişmediği için kurallar aynıdır; testler de aynı sonuçları doğrulamaya devam eder: rezervasyon ≠ kiralama, kaparo ≠ depozito, depozito ≠ gelir, kaydedilen ≠ uygulanan ödeme, operasyonel kapanış ≠ finansal kapanış, dört göz doğrulaması, kesin rezervasyonda uygunluk denetimi ve aynı araç çakışmasının reddi (rentals/reservations/finance testleri tam set içinde 543/543). Finans testinde yalnız fiyat listesinin gün sayma yöntemi değişti (test verisi); doğrulanan finans kuralları ve tutarlar (11.700 EUR vb.) aynı.

## 6. Test sonuçları (ayrıntı)

- Gerçek tarihte 11 test: 55/55 (finance + rentals).
- Tam gerçek API: **543/543**, iki bağımsız tur (arka arkaya, aynı veritabanında, hiçbir eşzamanlı koşu yok).
- `npm run test:dates` (gerçek + 3 s + 27 s): 3 × 137/137. (Betiğin ilk sürümündeki 51 saatlik tur anlamsız olduğu için kaldırıldı.)
- Gerçek tarayıcı (yalnız `acarvo_test`, API turlarından sonra tek başına): 134 geçti / 36 atlandı (başlangıçla aynı).
- Demo birim 178/178 ve demo tarayıcı 356/356: **yeniden koşulmadı**; frontend ve demo dosyaları bu çalışmada değişmedi (referans: önceki sprint sonuçları).

## 7. Gerçek veritabanının korunması

- Testlerden önce `.env` içindeki bağlantıların `acarvo_test` gösterdiği doğrulandı (parola yazdırılmadı); testlerin kendi korumaları (`db-guard`) çalışıyor. Ana `acarvo` veritabanına test, seed, reset, migration, silme, güncelleme **uygulanmadı**.
- API ve tarayıcı testleri **ardışık** koştu (önceki sprintteki eşzamanlı çalışma hatası tekrarlanmadı).
- Not: bu oturumda daha önce açtığım geliştirme sunucuları (API 3001, web 5173, demo 5174) ana `acarvo` veritabanına bağlı çalışıyor; testlerle ilgisi yok, testler ayrı süreç ve `acarvo_test` ile koşuyor.

## 8. Git

Dal `fix/api-date-dependent-tests`, commit bu raporla birlikte atıldı (son commit bilgisi aşağıdaki commit mesajında / `git log`). **`main`'e birleştirme yapılmadı, GitHub'a push yapılmadı.**

## 9. Main'e birleştirmeye hazır mı?

**Evet, hazır:** üretim kodu değişmedi; tam API 543/543 (iki tur), gerçek tarayıcı 134/36, TypeScript ve build temiz; değişiklikler yalnız testler ve test araçları. Birleştirme önerisi: fast-forward (`origin/main` bu dalın atasıdır). Karar bekleyenler: (1) `rolling_24h`'in saat değişimi haftasında fazladan gün faturalaması ürün açısından istenen davranış mı (şirket gün sayma yöntemi seçimi); (2) altı silinmiş belge kararı (stash'te duruyor).
