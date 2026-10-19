# ACARVO GLOBAL — Etkileşimli Frontend Prototip V1 — Geliştirme Raporu

Dal: `frontend-prototip-v1` · Çalışma klasörü: `C:\Users\soena\Desktop\acarvo-demo-ui` · Demo adresi: `http://localhost:5174`
Durum: **main'e birleştirilmedi, GitHub'a gönderilmedi.** Birleştirme için ayrı bir karar bekleniyor.

Bu belge dürüstlük esasına göre yazıldı. Her sayı gerçekten çalıştırılan bir komuttan gelir; yapılmayan veya eksik kalan işler H bölümünde açıkça yazılıdır. Bu bir **üretim ürünü değil**, rent-a-car sahiplerine gösterilecek etkileşimli bir prototiptir.

---

## A. Başlangıç durumu

| Konu | Durum |
|---|---|
| main başı | `44354d0` (değişmedi) |
| Gerçek uygulama | 12 modül, gerçek backend, gerçek veritabanı; dokunulmadı |
| Gerçek testler (başlangıç) | API 534, tarayıcı 134 (+36 isteğe bağlı ekran görüntüsü testi) |
| Ana klasör | 6 izlenen dosya silinmiş görünüyor (`ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` ve 5 doküman). **Geri yüklenmedi**; worktree'de duruyorlar |
| Eski deneme klasörleri | `acarvo-arac360`, `acarvo-pano-deneme`, `acarvo-tasko-deneme`: Windows'un tuttuğu birer dosya yüzünden silinemedi; yeniden başlatma sonrası elle silinmeli |

## B. 36 ekran

Hepsi yazıldı, rotalara bağlandı (otomatik testle doğrulandı), tarayıcıda hatasız açıldı (41 izolasyon testi) ve erişilebilirlik taramasından geçti (38/38).
"Elle görüntü" sütunu, ekran görüntüsünü ayrıca gözle incelediğim ekranları gösterir; diğerleri otomatik testlerle kapsanır.

| Grup | Ekran | Ana içerik | Elle görüntü |
|---|---|---|---|
| Genel | Ana Ekran | Bugün, filo bölümleri, finans (para birimi başına), uyarılar | ✔ |
| | Komuta Merkezi | Acil / Bugün / Uyarılar / Vardiya Devri | ✔ |
| | Filo Asistanı | 8 hazır deterministik soru + sınıf müsaitliği sorgusu (yapay zekâ değil; kaynak gösterir) | ✔ |
| Operasyon | Rezervasyonlar | Liste, bekleme listesi, yeni/düzenle (canlı fiyat, kontroller), 360, kaparo, araç ata, iptal | ✔ |
| | Kiralamalar | Liste, yeni, 360; Teslim Masası (6 adım), iade, sözleşme, sigorta/hasar, finans, uzatma, araç değişimi, istisnai kapanış | ✔ |
| | Takvim | Gün / Hafta (zaman çizelgesi) / Ay / Gündem | ✔ |
| | Görevler | 5 görünüm, açık havuz, üstlen, devret | ✔ |
| | Araçlar | Liste, ekle, 360 (8 sekme, müsaitlik çizelgesi) | ✔ |
| | Bakım ve Servis | Planla, servise al, tamamla (maliyet → kilitli masraf), iptal | — |
| | Olay Merkezi | Olay, kanıt, durum | — |
| | Hasar Kayıtları | Sorumluluk, müşteri payı, sigorta geri ödemesi, onarım, dört gözlü engel kaldırma | ✔ |
| | Ceza Modülü | Mükerrer referans engeli, atama önerisi (elle onay), müşteriden tahsil ≠ otoriteye ödeme | — |
| Müşteri ve Ticari | Müşteriler | Liste, 360, belge, kısıt (açık gerekçe), KVKK/GDPR talebi, birleştirme, rol bazlı maskeleme | ✔ |
| | Kurumsal Hesaplar | Para birimi başına kredi limiti/maruziyet, ekstre, kredi istisnası talebi | ✔ |
| | Talep Merkezi | Talep → teklif (sürümlü) → rezervasyon, hatırlatma, kayıp nedeni | ✔ |
| | Partnerler | Komisyon doğdu ≠ ödendi, koşul sürümü, portal erişimi, düzeltme talebi | — |
| | Araç Tedarikçileri | Talep, teklif, kabul ≠ teslim alma, harici araç, mutabakat | — |
| | Fiyatlandırma | Baz tarife, sezon, kademe, anlaşma, ekstra, sigorta, vergi, simülasyon, revizyonlar | ✔ |
| Kontrol ve Analiz | Onay Merkezi | 6 resmî tür, dört göz, Onaylandı ≠ Uygulandı | — |
| | Kurallar | Güvenli bildirim kataloğu, önizleme, sürüm geçmişi | — |
| | Gelir Kontrolü | 9 mutabakat kontrolü, aylık grafik | ✔ |
| | Riskler ve İstisnalar | Türetilmiş riskler + istisna kayıtları | — |
| | Kapasite Planlama | Şube × sınıf × gün matrisi | ✔ |
| | Filo Analizi | Araç başına kullanım, sınıf grafiği | — |
| | Fırsatlar | Deterministik öneriler (otomatik işlem yok) | ✔ |
| | Raporlar | 8 aile, gerçek CSV, yazdırma | ✔ |
| Finans | Finans Merkezi | Açık bakiye, ödemeler, kalemler, kaparo, depozito, iade, kurlar (salt okunur) | ✔ |
| | Masraflar | Kilitli kaynaklı masraf, nakit çıkış | — |
| | Şube Kasaları | Şube × para birimi kasa, oturum, sayım, fark gerekçesi | ✔ |
| Kayıtlar | Sözleşmeler | A4 belge, yazdır, yüz yüze imza, sürümler | ✔ |
| | Belge Merkezi | Sürümlü örnek belgeler, süre durumu | — |
| | İşlem Geçmişi | Salt okunur denetim kaydı, filtre, CSV | — |
| Yönetim | Şubeler | Düzenle, kapasite | — |
| | Kullanıcılar | Rol, şube kapsamı, kişisel istisna, etkin izin önizlemesi | — |
| | Roller ve Yetkiler | Modül × eylem matrisi | ✔ |
| | Ayarlar | 12 bölüm; **tek** Döviz Kurları masası burada | ✔ |
| Ayrı bağlam | Platform Konsolu (`/platform`) | Şirket hesapları, plan, durum; şirket verisini göremez | ✔ |
| | Partner Portalı (`/partner`) | Yalnız kendi talep/rezervasyon/komisyon; müşteri iletişimi gösterilmez | ✔ |

## C. Demo mimarisi

- **Ayrı mod:** `vite --mode demo --port 5174`. Gerçek uygulama yalnızca iki küçük yerde değişti: `main.tsx` (demo girişi yalnız demo modunda dinamik yüklenir) ve `lib/api.ts` (demo modunda `api()` hemen reddeder).
- **Gerçek API'ye istek gitmez (iki katman):** (1) `api()` kapalıdır; (2) `startDemo()` ağ koruması: aynı kaynağa `/api` için `fetch`, `XMLHttpRequest.open` ve `sendBeacon` engellenir, denemeler `window.__acarvoApiAttempts` listesine yazılır. Otomatik testle kanıtlandı (bkz. E).
- **Tek, tipli durum deposu:** tek `Db`; her işlem `commit(fn)` ile kopyada çalışır, hata verirse durum değişmez. Kalıcılık: IndexedDB (yedek: localStorage), şema sürümü `DB_SCHEMA = 3`, uyumsuz sürüm yeniden tohumlanır. Sayfa kapanırken anında yazılır.
- **Tek hesaplama katmanı:** para (tamsayı minor birim + ISO kod), kur, fiyat hattı, müsaitlik, hazırlık, finans, kasa, politika, uyarılar. Ekranlar bu fonksiyonları okur; aynı kiralama her ekranda aynı rakamı gösterir.
- **Seed gerçek işlemlerle kurulur:** tohum, ekranların kullandığı aynı işlemlerle üretilir; olaylar zamana göre sıralanır.
- **Kurgusal şirket:** "Adriatic Demo Rent": 3 şube (Saraybosna, Mostar, Dubrovnik), 25 iç + 3 harici araç, EUR/BAM/USD, 40 müşteri. Gerçek veri, gerçek e-posta veya anahtar yok (testle doğrulandı: yalnız `example/test/demo` alan adları).
- **Demo kontrolleri:** her ekranda "ACARVO DEMO — Örnek Veriler" bandı, Demo menüsünden sıfırlama, demo tarihi/saati, rol/kullanıcı değiştirici, şube filtresi, TR/EN dil anahtarı, senaryo listesi, Ctrl+K arama.
- **Yetki simülasyonu:** modül × eylem izinleri, rol + kişisel istisna + şube kapsamı. **Sunucu güvenliği değildir**; arayüzde böyle yazılıdır.

Temel iş kuralları (kodda ve testlerde): Rezervasyon ≠ kiralama; yalnız-sınıf rezervasyon araç tutmaz; Pending kapasite tutmaz; Müsaitlik ≠ Hazırlık ≠ konum; Operasyonel kapanış ≠ Finansal kapanış; Hesap kalemi ≠ Ödeme; Kaydedildi ≠ Uygulandı; Depozito gelir değil, iade gider değil; tek hesap kalemi (idempotency anahtarı); nakit yalnız kendi para biriminin açık kasasına girer; resmî 6 onay türü, dört göz, tek uygulama; fiyatlarda kur dönüşümü yok.

## D. Zorunlu senaryolar

Demo menüsündeki "Demo senaryoları" listesinde 8 yönlendirmeli senaryo vardır:
1. Günlük operasyon · 2. Rezervasyondan teslime · 3. Görev ve personel · 4. Filo analizi · 5. **Çoklu tahsilat (500 EUR)** · 6. Bakım ve araç uygunluğu · 7. Müşteriden ticari talebe · 8. Şube kasası.

**§64.2 bölünmüş ödeme (birim testi `finance.test.ts`, 11 testin biri):** 500 EUR borç → 100 EUR nakit (EUR kasasına girer) → 200 BAM kart = 100 EUR (kasaya girmez) → 100 USD: kur yok, **hiçbir şey kaydedilmez** ("Kur Bekleniyor"), borç 300 EUR → tek kur masasında 1 EUR = 1,25 USD tanımlanır → 100 USD = 80 EUR, kalan 220 EUR → 220 EUR havale → 0. Önceki ödemelerin kur anlık görüntüsü sonradan kur değişse de değişmez; nakit yalnız EUR ve USD kasasına, BAM kart ve havale hiçbir zaman nakit kasasına girmez.

## E. Testler (gerçek sayılar)

| Test | Sonuç | Not |
|---|---|---|
| Demo birim testleri (vitest) | **27 / 27** | §64.2 senaryosu, kur kuralları, kasa, idempotency, müsaitlik, 36 menü bağlantısının rotası, seed determinizmi ve kurgusal veri, dört göz, sözleşme sürümü, fiyat, yetki |
| Demo tarayıcı: izolasyon | **41 / 41** | 36 ekran + 2 bağlam: hiçbiri `/api`'ye istek atmadı, çalışma zamanı hatası yok; `fetch`/XHR/`sendBeacon` denemeleri engellendi, istek tarayıcıdan çıkmadı |
| Demo tarayıcı: akışlar | **6 / 6** | rezervasyon oluştur → yenile → kalıcı → sıfırla; rol değiştirme; tek kur masası; EN dili; Teslim Masası pasif düğme nedeni; tek uyarı kaynağı |
| Demo tarayıcı: erişilebilirlik (axe, WCAG 2.1 A/AA) | **38 / 38** | ciddi/kritik ihlal yok (taramada iki bulgu çıktı ve düzeltildi, bkz. G) |
| Demo tarayıcı: düzen | **152 / 152** | 38 sayfa × 1440, 1024, 768, 390: yatay sayfa kaydırması yok |
| Tip kontrolü (api, web, shared, e2e) | temiz | |
| Gerçek uygulama build | temiz | gerçek build'de demo kodu/verisi yok (arama boş) |
| Demo build (`build:demo`) | temiz | |
| Gerçek API testleri (`acarvo_test`) | **534 / 534** | ilk koşuda 533; `finance-performance` süre testi (3 sn sınırı) makine yükünden 31 sn sürdü, tek başına yeniden koşunca geçti. Backend'e dokunulmadı |
| Gerçek tarayıcı testleri (`acarvo_test`) | **134 / 134** | tam koşuda 133 geçti, 36 isteğe bağlı ekran görüntüsü testi atlandı (beklenen); `reservations.spec` içindeki bir düzen testi yük altında düştü, dosya tek başına yeniden koşunca 15/15 geçti. Gerçek uygulama ekranlarına dokunulmadı |

Testlerin yakaladığı ve düzeltilen gerçek hatalar: (1) son 250 ms'deki değişiklik yenilemede kayboluyordu; (2) 390 px'te üst çubuk yatay taşıyordu; (3) uyarı bandı renk kontrastı yetersizdi; (4) kasa hareket listesi klavye ile odaklanamıyordu. Ek olarak ekran incelemesinde çıkan küçük kusurlar (çift numaralı sözleşme maddeleri, ham durum metinleri, siyah araç şeması) giderildi.

Çalıştırma: `npm run test:demo -w @acarvo/web` (birim), `npm run test:demo -w @acarvo/e2e` (tarayıcı; kendi 5183 portunda sunucu açar, `.env`, veritabanı veya API gerekmez).

## F. Güvenlik kontrolleri

| Soru | Cevap |
|---|---|
| Ana veritabanına dokunuldu mu? | **Hayır.** Hiçbir migration çalıştırılmadı; bu çalışmanın hiçbir komutu ana veritabanına bağlanmadı. Gerçek testler yalnız `acarvo_test` ile çalıştı (test yardımcıları ana veritabanı ile aynı olmasını reddeder). Not: önceki isteğiniz üzerine açılan gerçek geliştirme API'si (3001) ana veritabanına bağlıdır ve açıktır; demo ona hiç istek atmaz ve bu çalışmada kullanılmadı |
| `.env` değiştirildi veya okunup yazdırıldı mı? | Hayır. Gerçek testler için yalnız `ACARVO_ENV_FILE` yoluyla var olan dosyayı kendi yapılandırmasıyla okudu; içerik yazdırılmadı |
| Backend, API, şema, migration, RLS, auth, müsaitlik motoru, finans kuralları? | **Değişmedi** (`git diff main..HEAD -- apps/api packages` boş) |
| Gerçek uygulamada değişen dosyalar | 7 dosya, 97 ekleme/31 silme: `main.tsx`, `lib/api.ts`, `web/package.json`, `vitest.demo.config.ts`, `e2e/package.json`, `playwright.demo.config.ts`, `.gitignore` |
| Demoya gerçek veri veya anahtar kopyalandı mı? | Hayır; tüm kayıtlar kurgusal |
| Normal modda demo verisi görünür mü? | Hayır; gerçek build'de demo dizgileri yok |
| main'e birleştirme / push? | Yapılmadı |
| `git reset --hard`, force, silinen kaydedilmemiş değişiklik? | Yok |

## G. Karar ve uygulama notları

- Gerçek ekranlar sunucu sözleşmelerine sıkı bağlı olduğundan, demoda 12 modül **mağaza güdümlü ekranlar olarak yeniden yazıldı**; gerçek kod yeniden yazılmadı.
- Demo, ağ üzerinden hiçbir şey göndermez: e-posta, SMS, banka, POS, e-imza, yapay zekâ, belge gönderimi **yoktur**; ilgili yerlerde "demo kaydı" olarak açıkça yazılıdır.
- Teklif "gönderme", davet, bildirim ve hatırlatmalar uygulama içi kayıttır.
- Platform Konsolu şirket kayıtlarını (kiralama, müşteri, finans) göstermez; yalnız şirket üst bilgisi.

## H. Eksikler ve sınırlar (dürüst liste)

1. **Dil kapsamı kısmi.** Menü, ekran başlıkları, durumlar ve ana mesajlar TR+EN; ancak bazı alan hata metinleri, kural motoru çıktıları, tohum verideki kayıt metinleri ve bazı ortak diyalog düğmeleri (ör. "Vazgeç") yalnız Türkçe. Bosna dili yalnız sözleşme şablonlarında.
2. **Tarayıcı testleri tüm işlem diyaloglarını tek tek sınamaz.** Akış testleri seçili senaryoları kapsar; diğer işlemler tip kontrolü, birim testleri ve ekran incelemesiyle doğrulandı.
3. **Elle ekran incelemesi** B tablosunda işaretli ekranlarda yapıldı; işaretsiz ekranlar otomatik testler (hata yok, erişilebilirlik, düzen) ile kapsanıyor ama görüntüleri ayrıca gözle incelenmedi.
4. **Görsel regresyon taban görüntüleri** (`toHaveScreenshot`) üretilmedi; onaylı bir tasarım referansı henüz kilitlenmedi.
5. **Kaparo örneği tohumda yok**; kaparo akışı rezervasyon ekranından denenir (senaryolarla gösterilir).
6. **Gerçek ürün farkları:** gerçek ödeme/banka/SMS/e-imza/belge saklama, çok kullanıcılı eşzamanlılık, sunucu tarafı yetki güvenliği demoda yoktur; vergi ve hukuki sözleşme metinleri **örnektir**, profesyonel doğrulama gerekir.
7. **Büyük paket uyarısı:** demo ve gerçek build'de 500 kB üstü parça uyarısı var (gerçek uygulamada önceden de vardı).
8. Ana klasördeki 6 silinmiş izlenen dosya geri yüklenmedi (A bölümüne bakın).

## I. İnsan kararları ve sonraki adım

- Bu dalın **main'e birleştirilip birleştirilmeyeceği** ayrı bir karardır; şu an birleştirilmedi.
- Birleştirilecekse önerilen sıra: gerçek tarayıcı testlerinin son sonucunu doğrula → dalı gözden geçir → fast-forward → main ile test.
- Gösterim öncesi önerilenler: tohum verideki bir kaparo örneğinin eklenmesi, EN dil kapsamının tamamlanması, görsel regresyon referanslarının onaylanması.
