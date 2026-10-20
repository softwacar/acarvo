# ACARVO GLOBAL — Frontend Prototip V1 — İşlevsellik Tamamlama, Hata Düzeltme ve Kalite Kontrol Raporu

Dal: `frontend-prototip-v1` · Çalışma klasörü: `C:\Users\soena\Desktop\acarvo-demo-ui` · Demo adresi: `http://localhost:5174`
Durum: **main'e birleştirilmedi, GitHub'a gönderilmedi.** Birleştirme kararı sizde.

Bu belge dürüstlük esasına göre yazıldı: her sayı gerçekten çalıştırılan bir komuttan gelir. Tam turda geçmeyen ama tek başına yeniden koşunca geçen bir test "geçti" diye gösterilmedi; bu tür durumlar ayrıca yazıldı (G bölümü). Bu bir **üretim ürünü değildir**; tarayıcıda çalışan etkileşimli demo konseptidir.

Bu sprintte yeni backend, API, migration, şema, RLS veya izin gevşetmesi **yapılmadı**.

---

## A. Başlangıç durumu

| Konu | Durum |
|---|---|
| Sprint başı dal ucu | `1940822` (önceki sprintin son commit'i); main `44354d0` (değişmedi) |
| Çalışma klasörü | `C:\Users\soena\Desktop\acarvo-demo-ui` (ayrı worktree), dal `frontend-prototip-v1` |
| Ana klasör (`C:\Users\soena\Desktop\acarvo`) | 6 izlenen dosya silinmiş görünüyor: `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md`, `docs/BAKIM_HASAR_TRANSFER_V1_GELISTIRME_RAPORU.md`, `docs/FINANS_YONETIMI_V1_GELISTIRME_RAPORU.md`, `docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md`, `docs/OPERASYONEL_HAZIRLIK_DASHBOARD_RAPORU.md`, `docs/TEKNIK_UYGULAMA.md`. **Geri yüklenmedi, dokunulmadı**; dosyalar worktree'de duruyor. Sprint boyunca durum değişmedi. |
| Önceki sprintin sonuçları | demo birim 27, demo tarayıcı 237 (41 izolasyon + 6 akış + 38 erişilebilirlik + 152 düzen), gerçek API 534, gerçek tarayıcı 134 (önceki raporda E bölümü) |
| Önceki rapordan düzeltme | Önceki raporda `finance-performance` testinin "makine yükünden" 31 sn sürdüğü yazılmıştı. **Bu açıklama yanlıştı**; gerçek kök neden F-18'de (B bölümü). |

---

## B. Düzeltilen sorunlar

Hepsi bu sprintte bulundu. "Test" sütunu, hatayı yakalayan veya kalıcı olarak koruyan testtir.

| # | Sorun | Etkilenen ekran | Kök neden | Düzeltme | Test | Sonuç |
|---|---|---|---|---|---|---|
| 1 | Her sayfa yenilemede demo verisi sıfırlanıyordu (kayıtlar kayboluyordu) | tümü | Seed `meta.schema` değeri koda sabit `3` yazılıydı; şema sürümünü 4'e çıkarınca kaydedilmiş durum "başka sürüm" sayılıp her açılışta atıldı (bu sprintte ben getirdim, senaryo testi aynı sprintte yakaladı) | `DB_SCHEMA` tek yerde (`seed-base.ts`), seed bunu kullanıyor | `persistence.test.ts` (birim), `persistence.spec.ts` (6 test) | düzeldi |
| 2 | `?gecikme=1` gibi sayısal görünen URL değerleri yok sayılıyordu | Kiralamalar (geciken filtresi), dışarıdan gelen tüm bağlantılar | Yönlendirici `1`'i sayıya çeviriyor, `useUrlState` yalnız string kabul ediyordu | Sayı/boolean string'e çevriliyor (`ui/hooks.tsx`) | Senaryo 1 | düzeldi |
| 3 | Ana Ekran "Geciken iade" kartı var olmayan bir filtreye (`durum=overdue`) gidiyordu | Ana Ekran | Yanlış sorgu anahtarı | `gecikme=1` | Senaryo 1 | düzeldi |
| 4 | Ana Ekran "Açık görev" sayısı şube kapsamını yok sayıyor, yanlış görünüme bağlanıyordu (Komuta Merkezi ile farklı sayı) | Ana Ekran | Süzgeç ve bağlantı farkı | Şube kapsamı eklendi, ekip görünümüne bağlandı | Senaryo 3 (sayı eşleşmesi) | düzeldi |
| 5 | Kaparo durumu ham `unapplied` olarak görünüyordu | Rezervasyon 360, Finans, Kiralama 360 | `advance` için durum sözlüğü yoktu | Durum sözlüğü + tek `AdvanceStatus` rozeti (iki dilli) | `advance.spec.ts` | düzeldi |
| 6 | Kaparo yaşam döngüsü eksikti (iade ve politika bedeli yoktu) | Rezervasyon 360 | Yalnız tutuldu → aktarıldı → uygulandı vardı | İade (dört göz onayıyla) ve politika bedeli eklendi, tek kayıt, iki kez uygulanmaz (F bölümü) | `advance.test.ts` (10), `advance.spec.ts` (2) | tamam |
| 7 | Senaryo 5 bazı günlerde "uygun araç bulunamadı" hatası veriyordu | Demo menüsü → Senaryo 5 | Tohum veri "bugün" çapalı; araç uygunluğu her gün farklı, 3 günlük pencere hiç boş çıkmayabiliyordu | 3, 2, 1 günlük pencere deniyor | `scenarios.test.ts`: 21 ayrı gün × 8 senaryo | düzeldi |
| 8 | Senaryo 5 metni ters kur adımını anlatmıyordu; kur tanımlanınca USD yine "Kur Bekleniyor" kalıyordu | Senaryo 5 | USD → EUR ödeme, kuru ters yönde kullanır; "otomatik ters kullanım" işaretlenmeden kullanılmaz (doğru kural) | Senaryo adımı bu kutuyu işaretlemeyi söylüyor | Senaryo 5 testi | düzeldi |
| 9 | Senaryo bildirimi iki dili art arda gösteriyordu | Bildirim kutusu | İki dilli metin çözülmeden gösteriliyordu | `toast` metni çözüyor | Senaryo 5 | düzeldi |
| 10 | Filo Asistanı'nda boş soruyla "Sor" hiçbir şey yapmıyordu | Filo Asistanı | Boş giriş sessizce yok sayılıyordu | Açıklayıcı ipucu | gezgin aracı (crawl) | düzeldi |
| 11 | Takvim ve Kapasite'de "Bugün" düğmesi zaten bugündeyken işlevsizdi | Takvim, Kapasite | — | Pasif + nedeni | crawl | düzeldi |
| 12 | Bakım ve Hasar formlarında araç seçilmeden "Araç bulunamadı" genel hatası | Bakım, Hasar | Alan hatası yoktu | Alan hatası "Araç seçin" | crawl | düzeldi |
| 13 | Teslimi tamamla / Aracı iade al / Kaydet düğmeleri pasifken nedeni yalnız sayfada yazılıydı | Teslim Masası, İade, Yeni rezervasyon | `title` yoktu | Nedeni düğmede de yazılı | crawl | düzeldi |
| 14 | Kiralama başlığındaki "Teslim Masası" / "İade al" zaten o sekmedeyken işlevsizdi | Kiralama 360 | — | Pasif + nedeni | crawl | düzeldi |
| 15 | Dil değişince bütün ekran yeniden kuruluyor, yazılmış form girdileri kayboluyordu; üst çubuk, kenar çubuğu ve alt bilgi eski dilde kalıyordu | tümü | Kök öğede `key={dil}` | Yeniden kurma kaldırıldı; çerçeve dil durumuna abone | `persistence.spec.ts` (form girdisi korunur), `langswitch.mjs` (41 rota, iki yön: 0 eski dil kalıntısı) | düzeldi |
| 16 | Tarayıcı depolamayı reddettiğinde demo sessizce "kaydediliyor" gibi davranıyordu | tümü | Hata yutuluyordu | Üst bantta "Bu tarayıcıda kayıt yapılamıyor…" uyarısı | `persistence.spec.ts` | düzeldi |
| 17 | Cep genişliğinde (390 px): ekran yolu kesik ("K… / A…"), şube seçici kesik, tutar ile para birimi alt satıra bölünüyor, kayıt numaraları bölünüyor, 18–23 px'lik tıklama alanları, uzun araç adı kesik | üst çubuk, KPI şeritleri, Finans, tablolar, Araç 360 | — | Yol cepte gizlendi, seçici genişledi, tutarlar satır içinde bölünmüyor, numaralar tek satır, hedefler ≥24 px, ad satır atlıyor | `visual-audit.mjs` (ölçüm) + gözle inceleme | düzeldi |
| 18 | **Gerçek API testi `finance-performance` aralıklı düşüyordu** | gerçek uygulama testi | **Kök neden: test 3000 kiralama ekleyip `rentals` tablosunun istatistiklerini güncellemiyordu.** Veritabanı `rentals` için "1 satır" tahminiyle iç içe döngü seçiyor (4,5 milyon satır süzme) ve ilk sayfa 35–66 sn sürüyordu; otomatik analiz (autovacuum, dakikada bir) araya girince plan düzeliyordu. Makine yükü değildi. | Testin `analyze` listesine `rentals` eklendi (test kurulumu; üretim kodu değişmedi) | önceden en az 8 ölçümün hepsinde ilk sayfa 35–66 sn; düzeltmeden sonra 72 ms; 6 ardışık koşu geçti | düzeldi |
| 19 | **Gerçek tarayıcı `reservations.spec` 768/390 düzen testi aralıklı düşmüştü** | gerçek uygulama testi | **Yeniden üretilemedi:** boşta 10/10, 12 çekirdekte 12 CPU yakıcı altında 10/10 geçti (süre 2 katına çıktı, test geçti). Neden bilinmiyor. | Yalnız ölçüm sağlamlaştırıldı: yazı tipleri yüklenip iki kare çizildikten sonra ölçüyor; **tolerans eklenmedi, süre uzatılmadı** | tam turda 134/134 | **kök neden kanıtlanmadı** (I bölümünde) |
| 20 | Dil kapsamı eksikti: diyalog düğmeleri, kural motoru çıktıları, tohum veri açıklamaları, hata metinleri, ceza türleri | tümü | Metinler yalnız Türkçe yazılıydı | E bölümü | E bölümü | düzeldi |

---

## C. 36 ekran ve 2 bağlam kontrol tablosu

Gösterim: **●** = bu ekran için doğrudan etkileşim testi var · **○** = yalnız otomatik tarama (düğme gezgini, diyalog aracı, genel testler) · **–** = uygulanmaz.

Her satır için ortak (hepsinde ●) kontroller: **açılış + çalışma zamanı hatası yok + `/api` isteği yok** (isolation 41/41), **İngilizce'de Türkçe arayüz metni yok** (english.spec 40 test), **erişilebilirlik** (axe, ciddi/kritik ihlal yok), **duyarlılık** (1440/1024/768/390'da yatay sayfa kaydırması yok; ayrıca görsel denetim ölçümü). Bu yüzden tabloda yalnız ayırt edici sütunlar var.

| Ekran | Liste/arama/filtre | Temel işlemler | Formlar/diyaloglar | Kalıcılık | Ekranlar arası bağ |
|---|---|---|---|---|---|
| Ana Ekran | ○ | ● (kart → liste) | – | ○ | ● (S1) |
| Komuta Merkezi | ○ | ● | – | ○ | ● (S1, S3 sayı eşleşmesi) |
| Filo Asistanı | ○ | ○ | ○ (boş soru düzeltildi) | – | ○ |
| Rezervasyonlar | ● | ● (S2, kaparo) | ● | ● | ● |
| Kiralamalar | ● (gecikme filtresi) | ● (S2 teslim) | ● | ● | ● |
| Takvim | ○ | ○ | – | – | ○ |
| Görevler | ● | ● (S3) | ● | ● | ● |
| Araçlar | ● | ○ | ○ | ○ | ● (S2, tutarlılık) |
| Bakım ve Servis | ○ | ● (S6) | ● | ○ | ● (S6) |
| Olay Merkezi | ○ | ○ | ○ | ○ | ○ |
| Hasar Kayıtları | ○ | ○ | ○ | ○ | ○ |
| Ceza Modülü | ○ | ○ | ○ | ○ | ○ |
| Müşteriler | ● (arama) | ○ | ○ | ○ | ● (S7, maskeleme) |
| Kurumsal Hesaplar | ○ | ○ | ○ | ○ | ○ |
| Talep Merkezi | ○ | ● (S7) | ● | ○ | ● (S7) |
| Partnerler | ○ | ○ | ○ | ○ | ○ |
| Araç Tedarikçileri | ○ | ○ | ○ | ○ | ○ |
| Fiyatlandırma | ○ | ○ | ○ | ○ | ○ |
| Onay Merkezi | ● (sekme) | ● (kaparo iadesi: talep → onay → uygula) | ● | ○ | ● |
| Kurallar | ○ | ○ | ○ | ○ | ○ |
| Gelir Kontrolü | ○ | ○ | – | – | ○ |
| Riskler ve İstisnalar | ○ | ○ | ○ | ○ | ● (uyarı sayısı eşleşmesi, flows) |
| Kapasite Planlama | ○ | ○ (Bugün düzeltildi) | – | – | ○ |
| Filo Analizi | ● (dönem, şube) | ● (S4) | – | ● (URL) | ● (S4: 360 → geri) |
| Fırsatlar | ○ | ○ | – | – | ○ |
| Raporlar | ○ | ○ | – | – | ● (rol: Operasyon finans raporu göremez) |
| Finans | ● (sekmeler) | ● (S5 ödeme) | ● | ● | ● (tutarlılık, kaparo) |
| Masraflar | ○ | ○ | ○ | ○ | ○ |
| Şube Kasaları | ● | ● (S8, çift tık) | ● | ○ | ● (tutarlılık) |
| Sözleşmeler | ○ | ○ | ○ | ○ | ○ |
| Belge Merkezi | ○ | ○ | ○ | ○ | ○ |
| İşlem Geçmişi | ○ | – | – | – | ○ |
| Şubeler | ○ | ○ | ○ | ○ | – |
| Kullanıcılar | ○ | ○ | ○ | ○ | – |
| Roller ve Yetkiler | ○ | ○ | ○ | ○ | – |
| Ayarlar | ○ | ● (kur tanımı, S5) | ● | ● | ● |
| Platform Konsolu | ○ | ○ | ○ | ○ | ● (izolasyon) |
| Partner Portalı | ● (partner seçimi) | ○ | ○ | ○ | ● (izolasyon) |

**Dürüst not:** ○ olan ekranlar "çalışıyor" değil, "otomatik taramada bozuk bulunmadı" demektir. Düğme gezgini (`crawl.mjs`) her ekranda görünen tüm etkin düğmeleri tıkladı; diyalog aracı (`dialogs.mjs`) 82 diyalog/panel açtı, varsayılan değerlerle onayladı, hata/kapanma ve kaçış tuşunu denedi. Son koşu (Türkçe gezgin / İngilizce diyalog): **gezgin 21 bulgu, 0 çalışma zamanı hatası, 0 API isteği; diyalog 82 açıldı, 0 hata, 0 API isteği.** Gezginin kalan 21 bulgusu: 15 pasif düğme (ilk sayfada "Önceki sayfa", pasif ana eylemler; hepsi nedenli), 5 "işlevsiz" (rn37/rn36'da zaten o sekmedeyken ana düğme [düzeltildi, pasif], iki "Üst" [sayfa başı kaydırması, görsel değişiklik yok], "Yazdır" [tarayıcı yazdır penceresi]), 1 "tıklama başarısız" (`/rezervasyonlar` "Sonraki sayfa": tek başına denendiğinde çalışıyor, gezgin zamanlaması). Diyalog aracının tek işaretlisi Müşteri formu: İngilizce satırında "Bosanski / Türkçe" dil adları var; bunlar dillerin kendi adlarıdır, hata değil.

Bilinen tek tek denenmemiş: ○ ekranlarda arama kutusu, durum filtresi ve sayfalama elle tek tek sınanmadı (gezgin yalnız tıklar; sonucu doğrulamaz).

---

## D. 8 demo senaryosu (Demo menüsünden başlatılır, gerçek arayüz tıklamasıyla)

Test dosyası hepsi için `apps/e2e/demo-tests/scenarios.spec.ts` (kaparo ayrıca `advance.spec.ts`). Hepsi geçiyor (8/8). Senaryoların her gün çalıştığı birim testle 21 ayrı gün için doğrulandı (`scenarios.test.ts`).

| # | Senaryo | Durum | Geçen adımlar | Bulunan hata | Kalan boşluk |
|---|---|---|---|---|---|
| 1 | Günlük operasyon | ✔ | Ana Ekran → geciken iade kartı → liste (satır sayısı Ana Ekran ile aynı) → Komuta Merkezi sayısı aynı → satırdan Kiralama 360 | #2, #3 | "Bugün teslim" satırından kiralamaya gitme adımı tıklanmadı |
| 2 | Rezervasyondan teslime | ✔ | Müşteri arama → fiyat özeti → kaydet (Bekliyor, kapasite tutmaz) → Onayla → Kiralamaya dönüştür → Teslim Masası (pasif, nedenli) → 6 adım → Teslim edildi → araç listesinde "Kirada", kiralama listesinde "Teslim edildi", rezervasyonda "Kiralamaya dönüştü" | — | Fiyat önizlemesi yalnız "para birimi görünür" ile doğrulandı, tutar hesabı ayrıca birim testlerde |
| 3 | Görev ve personel | ✔ | Yönetici görev oluşturur ve atar → ekip görünümünde görünür → Operasyon kullanıcısına geçiş → "Bana" görünümünde görür → tamamlar → Komuta Merkezi açık görev sayısı bir azalır | #4 | "Bağlı kayıt kapanmaz" birim kodunda var, tarayıcıda ayrıca sınanmadı; şube kapsamı testi yalnız koşullu birim testi (tohumda uygun görev yoksa atlar) |
| 4 | Filo analizi | ✔ | Dönem 7 gün (basılı, URL'de), şube Mostar (satır azalır), araç → Araç 360 → Geri: filtreler ve satır sayısı aynı | — | Araç performans sütunlarının değerleri elle doğrulanmadı |
| 5 | Çoklu tahsilat | ✔ | 500 EUR bakiye → 100 EUR nakit (400) → 200 BAM kart (300, 100 EUR) → 100 USD kur yok: "Kur Bekleniyor", kaydedilmez, 300 → Ayarlar'da 1 EUR = 1,25 USD (+ters kullanım) → yenilemeden sonra 100 USD = 80 EUR (220) → 220 EUR havale (0) | #1, #7, #8, #9 | Kasaların birbirine karışmaması tarayıcıda değil, birim testte (`finance.test.ts`) doğrulanıyor |
| 6 | Bakım ve uygunluk | ✔ | Çakışan bakım penceresi reddedilir, nedeni (kayıt) yazılı → boş pencere planlanır → servise al → tamamla → Araç 360: **Müsait ama Hazırlık 1 engel, "Araç teslime hazır değil"** (otomatik Hazır olmaz) | — | Çakışan *rezervasyon onayı* denemesi tarayıcıda sınanmadı (bakım tarafı sınandı) |
| 7 | Talep → teklif → rezervasyon | ✔ | Yeni talep → teklif v1 → yeni sürüm v2 (v1 korunur) → kabul → rezervasyon (Bekliyor; teklif ≠ rezervasyon) → müşteri kaydı oluşur → talep "Rezervasyona dönüştü" | — | — |
| 8 | Şube kasası | ✔ | Mostar EUR kasası kapalı → açılış 200 → +50 → −30 → beklenen 220 → sayım 215 → fark −5 gösterilir, gerekçe → kapanış → Oturumlar'da 220 beklenen / 215 sayılan | — | — |

Ek tarayıcı testleri: çift tıklama (ödeme, kasa hareketi, rezervasyon tek kez), kalıcılık, bağlamlar/tutarlılık/rol (ayrıca G).

---

## E. İngilizce kapsamı

**Tamamlanan alanlar:** menü, başlıklar, sekmeler, KPI etiketleri, tablo başlıkları, filtreler, form alanları, düğmeler, diyalog ve panel başlıkları/açıklamaları/onay düğmeleri, doğrulama ve hata metinleri, boş durumlar, durum etiketleri, finans açıklamaları, görev/bakım/hasar durumları, demo uyarıları, senaryo metinleri, bildirimler, kural motoru çıktıları, tohum veri açıklamaları, erişilebilirlik etiketleri (`aria-label`), Platform Konsolu ve Partner Portalı.

**Çeviri sistemi (tek, tipli):**
- `L(tr, en)`: görüntüleme anında seçilen metin (3.473 kullanım).
- `B(tr, en)`: veritabanına yazılan veya kural ihlaliyle fırlatılan metin (963 kullanım). İki dil tek dizgede saklanır; dil değişince depodaki veri **kaybolmaz**, yalnız yeniden yansıtılır.
- `loc()` / `localize()`: çözücü; depo, seçilen dile göre önbellekli bir yansıma verir.
- Sözlük: `apps/web/scripts/i18n-dict/*.json` (1.072 giriş, 32'si "veri olarak aynen kalır").
- Demo'ya özel diyalog, yan panel, bildirim ve alan bileşenleri (`demo/ui/dialogs.tsx`): gerçek uygulama bileşenlerine dokunulmadı.
- Gerçek uygulama kodu İngilizce için değiştirilmedi.

**Eklenen testler:**
- `english.spec.ts`: **40 test**: 36 ekran + 2 bağlam İngilizce'de Türkçe arayüz metni taraması (Türkçe karakter ve sözcük listesi; kurgusal özel isimler hariç), kayıt ayrıntıları/sekmeler, 10 ana diyalog/panel.
- `langswitch.mjs` aracı: bir ekranda dili **yerinde** değiştirir, eski dilde kalan metin arar: **41 rota × iki yön: 0 kalıntı.**
- Dil değişiminde form girdisi, süzgeç ve veri korunur (`persistence.spec.ts`).

**Kalan boşluklar:**
1. Yasal/sözleşme şablon metni (örnek sözleşme maddeleri) ve kurgusal özel adlar Türkçe/yerel kalır: bunlar arayüz değil, veri.
2. Bosna dili yalnız sözleşme şablonlarında.
3. Taramanın "Türkçe sözcük" listesi sonludur; listede olmayan Türkçe bir sözcük yakalanmaz. Düzenli bir tam çeviri denetimi değildir.
4. Tarih biçimi İngilizce'de gg/aa/yyyy (en-GB).

---

## F. Kaparo (avans)

**Tohum veri** (yeniden tohumlama güvenli: aynı çapa tarihi aynı veriyi üretir, kopya yok — test edildi):
- Kurgusal müşteri **Selma Hodžić-Demo** (belgeleri tam, listenin sonuna eklendi, mevcut müşteri numaraları kaymadı).
- Onaylı rezervasyon, araç atanmış, **%20 kaparo** kart ile alınmış, durum **"Tutuluyor (uygulanmadı)"** — demoda kiralamaya dönüştürülmeye hazır.
- İptal edilmiş bir rezervasyonun kaparosu **dört göz iade onayıyla iade edildi** (talep eden ≠ onaylayan ≠ uygulayan).
- Gelmeyen bir müşterinin kaparosu **gerekçeyle politika bedeli olarak tutuldu**.

**Kural uyumu (spec §65):** Tutuluyor → Kiralamaya aktarıldı → Hesap kalemine uygulandı **ya da** İade edildi / Politika bedeli olarak tutuldu. Tek yetkili kayıt (aynı `Payment`), kaynak referansları paylaşılır. Dönüşümde kaparo **bir kez** kiralamaya taşınır ("Uygulanmamış" olarak); Teslim'de tek temel hesap kalemi doğar ve kaparo **bir kez** ona uygulanır; ikinci uygulama denemesi sonucu değiştirmez. Kaparo ≠ depozito ≠ ödeme, gelir sayılmaz. İade edilen veya politika bedeli olan kaparo hiçbir zaman hesap kalemine uygulanmaz ve ters kayıtla geri alınamaz.

**Finans bağlantısı:** Finans Merkezi → Kaparo sekmesi, Rezervasyon 360 → Kaparo sekmesinde "Finans Merkezi · Kaparo" bağlantısı, dönüşünce "Kiralama finansı" bağlantısı; her satırda iki dilli yaşam döngüsü açıklaması.

**Testler:** `advance.test.ts` (10 birim: tohum, yeniden tohumlama, dönüşüm, tek uygulama, iade, politika bedeli, korumalar), `advance.spec.ts` (2 tarayıcı: tutuluyor → dönüştür → Finans'ta "Kiralamaya aktarıldı", Uygulanmamış = kaparo tutarı → Teslim Masası → "Hesap kalemine uygulandı", Uygulanan = kaparo, Uygulanmamış 0; iade: talep → ikinci kullanıcı onay + uygula → "İade edildi").
**Sonuç:** tamam.

**İnsan kararı bekleyen noktalar:** (1) İade yalnız **tam** tutar; kısmi iade yok. (2) Politika bedeli şu an tek yetkili kararıyla (gerekçe ≥10 karakter, `finance:apply` yetkisi) veriliyor, dört göz yok; spec 6 resmi onay türü sayıyor ve politika bedeli bunlardan biri değil. İsterseniz bunu da resmi onaya bağlarız. (3) Politika bedeli gelire yazılmıyor (kaparo kaydında "tutuldu" olarak kalıyor); gelir kaydı kuralı ürün kararıdır.

---

## G. Test sayıları (gerçek, bu çalışma günü)

| Test | Önceki sprint sonu | Şimdi | Not |
|---|---|---|---|
| Demo birim (vitest) | 27 | **68 / 68** | +41: kaparo 10, senaryo hazırlığı 21 (21 ayrı gün), kalıcılık/sürümleme 2, rol/tarih/saat dilimi/saat 8 |
| Demo tarayıcı (Playwright) | 237 | **301 / 301** (tam tur, 15,2 dk) + 1 | 301 = 190 erişilebilirlik/düzen, 41 izolasyon, 40 İngilizce, 8 senaryo, 6 akış, 6 kalıcılık, 5 bağlam/tutarlılık, 3 çift tık, 2 kaparo. Turun ardından eklenen "rol görünümleri" testi (maskeleme, finans raporu) tek başına geçti (302. test); tam turda henüz koşmadı |
| Tip kontrolü (api, web, shared, e2e) | temiz | **temiz** | |
| Gerçek uygulama build | temiz | **temiz** | gerçek build'de demo izi yok (`Adriatic`, `ACARVO DEMO`, `DEMO_NO_API`, `acarvo-demo`, kurgusal ad: 0 dosya) |
| Demo build | temiz | **temiz** | |
| Gerçek API (`acarvo_test`) | 534 / 534 (ilkinde 533) | **534 / 534** | tam turda ilk koşuda geçti; ayrıca `finance-performance` düzeltmesi sonrası 6 ardışık koşu geçti |
| Gerçek tarayıcı (`acarvo_test`) | 134 / 134 (36 atlandı) | **134 geçti, 36 atlandı, 0 başarısız** (10,5 dk) | atlanan 36: isteğe bağlı ekran görüntüsü testleri (beklenen) |

**Tam turda düşüp tek başına geçen test var mı?** Sprint sırasında bir kez: ilk tam demo turunda iki erişilebilirlik testi (`/gelir-kontrolu`, `/riskler-ve-istisnalar`, `color-contrast: code`) düştü; tek başına koşunca geçti. O turun ortasında ben kaynak dosyaları düzenliyordum (Vite geçici olarak yarım bir dosyayı sayfaya yükledi; günlükte `usePersistFailed is not defined` hatası var), yani tur kirlendi. Sonraki iki tam tur (296 ve 301 test) **0 başarısız**. Kök nedeni kanıtlanmış değil, ama yeniden de çıkmadı. Bu sayıları "kararlı" diye işaretlemiyorum; üçüncü bir bağımsız tam tur önerilir.

Çalıştırma: demo birim `npm run test:demo -w @acarvo/web`; demo tarayıcı `npm run test:demo -w @acarvo/e2e` (kendi 5183 portu, `.env`/veritabanı/API gerekmez); gerçek testler `ACARVO_ENV_FILE=…` ile yalnız `acarvo_test`.

**Karar:** görsel regresyon taban görüntüleri bu sprintte **bilerek üretilmedi**: mevcut görünümü tasarım referansı olarak kilitlemek istemedik; son tasarım sprintine bırakıldı. Görsel denetim yalnızca tanı amaçlı ekran görüntüleri ve ölçümle yapıldı.

---

## H. Güvenlik

| Soru | Cevap |
|---|---|
| Ana veritabanı (`acarvo`) | **Dokunulmadı.** Migration yok, kayıt oluşturma/silme yok, demo verisi girmedi, sıfırlama yok. Gerçek testler yalnız `acarvo_test` (test yardımcıları ana veritabanını reddeder). Bu sprintte yazdığım tanı betiği de yalnız `acarvo_test`'e bağlandı ve silindi. |
| Backend, API, şema, migration, RLS, auth, müsaitlik motoru, finans kuralları | **Değişmedi.** `git diff main..HEAD -- apps/api packages`: yalnız `apps/api/tests/finance-performance.test.ts` (1 satır, test kurulumunda `analyze rentals`). `apps/api/src` farkı yok. |
| `.env` | Okunup yazdırılmadı, değiştirilmedi (`ACARVO_ENV_FILE` ile yalnız yol verildi). |
| Demo API izolasyonu | `api()` demoda hata fırlatır; `fetch`/XHR/`sendBeacon` engellenir; 41 ekran/bağlam + 8 senaryo + akış testleri: `/api` isteği 0. |
| Gerçek uygulamada değişen dosyalar | main'e göre: `.gitignore`, `apps/web/src/main.tsx`, `apps/web/src/lib/api.ts`, `apps/web/package.json`, `apps/web/vitest.demo.config.ts`, `apps/e2e/package.json`, `apps/e2e/playwright.demo.config.ts` (önceki sprint) + bu sprintte `apps/api/tests/finance-performance.test.ts` ve `apps/e2e/tests/fixtures.ts` (düzen ölçümü). |
| Normal modda demo verisi | Yok (build taraması 0). |
| Gerçek veriye zarar riski | Yok: gerçek 3001 API'si (ana veritabanına bağlı) ve 5173 sunucusu elle kapatılmadı, dokunulmadı; testler 3101/5181/5183/5174 portlarında. |
| Merge / GitHub push | **Yapılmadı.** |
| `reset --hard`, force, geçmiş yeniden yazma | Yok. Ana klasördeki 6 silinmiş dosya geri yüklenmedi. |

---

## I. Kalan boşluklar

**İşlevsel**
- Kaparo: kısmi iade yok; politika bedeli dört göz değil; gelire yazılmıyor (F).
- "Senaryoyu yeniden hazırla" düğmesi yok: "Hazırla ve aç" her basışta yeni kayıt kümesi üretir; yalnız tam sıfırlama başlangıca döner. Senaryo 5 her çalışmada yeni bir kiralama açar.
- Fiyatlandırmada değişmemiş değerle "kaydet" yeni sürüm üretir (değişiklik yok algılaması yapılmadı).
- Tek saat dilimi (Sarajevo/Mostar/Dubrovnik hepsi aynı kuşak): çoklu saat dilimi şube testi yok; yaz-kış saati geçişi birim testle (24→25 Ekim, 27/28 Mart) doğrulandı.

**Test kapsamı**
- C tablosundaki ○ ekranlarda arama/filtre/sayfalama sonucu elle tek tek doğrulanmadı.
- Cep (390 px) genişliğinde formların *etkileşimi* sınanmadı; yalnız düzen ölçüldü.
- Maskeleme yalnız Müşteri 360'ta test edildi; diğer yerlerdeki iletişim bilgileri için ayrı test yok.
- Kasa karışmaması, "bağlı kayıt kapanmaz", şube kapsamı: birim kodunda var, tarayıcıda ayrıca yok / koşullu.
- Gerçek `reservations.spec` düzen testinin aralıklı düşmesinin **kök nedeni kanıtlanmadı** (B-19).

**Bilerek ertelenen tasarım**
- Görsel regresyon taban görüntüleri ve genel yeniden tasarım (kapsam dışı; son tasarım sprinti).
- Kalan 20 px yüksekliğindeki metin bağlantıları (tablolardaki kayıt numaraları, geri bağlantıları): satır içi bağlantı sayıldı, 24 px'e çıkarılmadı.

**Gerçek backend gerektiren**
- Sunucu tarafı yetki, çok kullanıcılı eşzamanlılık, gerçek POS/banka/SMS/e-imza/belge saklama, kalıcı sunucu verisi, gerçek vergi/hukuk metni doğrulaması. Demo hiçbir yerde verinin kalıcı sunucu verisi olduğunu iddia etmiyor (üst bantta açık).

---

## J. Git

| Konu | Durum |
|---|---|
| Dal | `frontend-prototip-v1` |
| Sprint başı → şimdi | `1940822` → son commit `7dfe75a` (bu rapor ayrı commit'te) |
| Bu sprintte yeni commit | 10 (bu rapor 11. commit olarak eklenir) |
| Değişen dosyalar | 90 dosya, +7.727 / −1.021 (rapor hariç) (çoğu `apps/web/src/demo`, çeviri sözlüğü, demo testleri, araçlar) |
| main | `44354d0` (değişmedi) |
| Çalışma ağacı | temiz (rapor commit'inden sonra) |
| Birleştirme yapıldı mı | **Hayır** |
| GitHub'a gönderildi mi | **Hayır** |
| Geçmiş | korundu; hiçbir reset/rebase/force yok |
| Commit edilmeyenler | tanı araçlarının çıktı JSON'ları, tam tur günlükleri, ekran görüntüleri (`.gitignore`) |

Tanı araçları (commit edildi, test değil): `apps/e2e/demo-tests/tools/` altında `crawl.mjs` (düğme gezgini), `dialogs.mjs`, `entext.mjs`, `langswitch.mjs`, `visual-audit.mjs`, `kaparo-look.mjs`, `probe.mjs`.
