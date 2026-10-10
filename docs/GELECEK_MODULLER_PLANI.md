# ACARVO — Gelecek operasyon modülleri: bağımlılıklar, riskler ve önerilen sıra

Durum: hazırlık belgesi (11.10.2026 gecesi). **Kod yazılmadı.** Her modül, başlamadan önce kendi ayrıntılı uygulama planıyla (Araç Belgeleri §8.4 ve Km/Konum §8.5 gibi) onayınıza sunulacak.
Otorite: `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` (özellikle §9, §10, §14, §16–17, §30, §34, §59R, §59CF, §59CS, §59CZ, §62–72, Part II §II.5). Teknik kararlar: `docs/TEKNIK_UYGULAMA.md`.

## 1. Bugün elimizde olan temel

| Katman | Durum | Gelecek modüllerin kullanacağı bağlantı noktası |
|---|---|---|
| Şirket, şube, kullanıcı, rol, yetki | Hazır; RLS + şube kapsamı (`inScope`) | Her yeni tablo aynı desen: `company_id`, bileşik yabancı anahtar, 4 RLS politikası, uygulama rolüne yalnız gereken yetkiler |
| Araçlar ve Araç 360° | Hazır | Rezervasyon/kiralama/bakım/hasar aracı `vehicleId` ile okur; ikinci araç gerçeği tutulmaz (§59CS) |
| Km ve konum geçmişi | Hazır, yalnız eklenen olaylar | `source_type` / `source_id` sütunları kiralama teslim/iade, transfer, bakım ve tedarikçi olayları için hazır; kronoloji koruması veritabanında |
| Araç belgeleri | Hazır | `locked_at`: kiralama sözleşmesi bir belge sürümünü sabitlediğinde düzeltme yerine yeni dönem gerekir |
| Tanıtım fotoğrafları / özel dosya deposu | Hazır | Teslim/iade **kanıt fotoğrafları** ayrı, değiştirilemez bir tablo olacak (§59B); depolama modülü ve yetkili dosya sunumu yeniden kullanılır |
| İşlem geçmişi (audit) | Hazır | Her yeni değişiklik aynı `audit()` ile; kayıt bazında indeks hazırlandı (0011, onay bekliyor) |
| Testler | API 165, tarayıcı 34 | Her modül aynı yapıyla (izolasyon, şube, eşzamanlılık, tarayıcı akışı) |
| Saat dilimi | Hazır (§9.1) | Teslim/iade zamanları, kiralama süreleri ve geç iade hesapları aynı kuralla (anlar UTC, takvim tarihleri çevrilmez) |

## 2. Bağımlılık haritası

```
                     Ayarlar temeli (para birimleri, kurlar, vergi, sigorta paketleri, süre politikası)
                                   │
 Müşteriler + Kurumsal hesaplar ───┼──────────────┐
 (sürücü uygunluğu, kimlik belgeleri)             │
                                   ▼              ▼
                            Rezervasyonlar ──► Kiralamalar ──► Finans (tahsilat, depozito, kasalar, kapanış)
                            (müsaitlik/kapasite)   │  ▲
                                                   │  │ kanıt fotoğrafları, km/konum olayları, belge sabitleme
 Araçlar (hazır) ──► Araç transferi ───────────────┤  │
       │        └──► Bakım & Servis ───────────────┤  │ (müsaitlik blokları, hazırlık engelleri)
       │                                           ▼  │
       └──────────► Hasar kayıtları ◄──── teslim/iade incelemeleri
```

Okuma: ok yönündeki modül, kaynağındakine ihtiyaç duyar. Transfer ve Bakım para gerektirmez ve yalnız Araçlar'a dayanır. Rezervasyon ve kiralama hem Müşterilere hem Ayarlar temeline dayanır.

## 3. Modüller

### 3.1 Müşteriler ve Kurumsal Hesaplar (spec §16, §17, §59BR–BT, §69)
- **Amaç:** bireysel müşteri, sürücü uygunluğu (yaş, ehliyet geçmişi, belge geçerliliği), Yerel/Yabancı seçimi (asla tahmin edilmez), notlar ve kısıtlar. Kurumsal hesap ayrı ticari varlık: para birimi başına kredi limiti.
- **Tablolar (öneri):** `customers`, `customer_documents` (kimlik/ehliyet/pasaport; araç belgeleriyle aynı dönem ve dosya deseni), `corporate_accounts`, `corporate_credit_limits` (para birimi başına bir aktif limit), `customer_restrictions` (kara liste anlamı §59BS).
- **Araçlarla ilişki:** yok (doğrudan). Rezervasyon/kiralamanın önkoşulu.
- **Riskler:** **kişisel veri** (kimlik ve ehliyet görüntüleri). Saklama süresi, erişim kaydı, şifreleme ve silme talepleri hukuki karardır (spec Part IV). Mükerrer müşteri birleştirme (§59BT) dikkat ister.
- **Büyüklük:** orta. Para yok.

### 3.2 Ayarlar temeli: para birimleri, kurlar, vergi, sigorta paketleri, süre politikası (spec §59F, §62–63, §66, §68, §70, Part II Stage 1)
- **Amaç:** fiyat ve sözleşmeden önce gereken, yazılı ve sürümlü şirket politikaları. Kurlar yalnız elle girilir ve izlenir; fiyatlandırmada kur dönüşümü yoktur.
- **Tablolar:** `company_currencies`, `fx_rates` (elle girilen, zaman damgalı, değiştirilemez), `tax_rules`, `insurance_packages` + işlem para birimine göre fiyat satırları, `rental_duration_policies`, `deposit_policies`.
- **Riskler:** yanlış modellenirse tüm finans etkilenir. Her politika **sürümlü** olmalı; rezervasyon ve kiralama o anki sürümün kopyasını (snapshot) taşır.
- **Büyüklük:** orta. Spec bunu rezervasyondan önce istiyor (Stage 1).

### 3.3 Rezervasyonlar (spec §9, §59BF–BG, §59BU, §65)
- **Amaç:** `Pending → Confirmed → Converted | Cancelled | No-show`. Sınıf bazlı (class-only) veya belirli araçlı. `Pending` kapasite veya araç tutmaz. Onayda müsaitlik yeniden kontrol edilir. Kaparo burada kullanılabilir.
- **Ortak servis:** **Müsaitlik/Kapasite** (§59CS'te tek otorite). Kiralama, transfer ve bakım blokları da buradan okunur. Bu ayrı ve saf bir hesaplama katmanı olmalı (belge durum fonksiyonu gibi).
- **Araçlarla ilişki:** araç listesi ve 360° "Müsaitlik ve planlama" sekmesi bu modülle açılır. Araç kaydı değişmez.
- **Riskler:**
  - **çifte rezervasyon** (eşzamanlılık): veritabanında zaman aralığı çakışma kısıtı (`exclude using gist`) önerilir;
  - sınıf bazlıdan belirli araca dönüşümün tek işlemde (atomik) olması;
  - saat dilimi (şube saatiyle teslim).
- **Büyüklük:** büyük.

### 3.4 Kiralamalar (spec §10, §59B, §59L, §59BV–BY, §67–71, §83–85)
- **Amaç:**
  - yaşam döngüsü `Prepared → Delivered → Returned → Closed`, olağan dışı sonlar (§71);
  - Teslim Masası, sözleşme (logo, sürüm, imza), teslim ve iade incelemeleri (4–5 değiştirilemez kanıt fotoğrafı, gövde siluetinde hasar işaretleri);
  - uzatma, araç değişimi, erken/geç iade;
  - teslimde tek temel ücret (Charge) kaydı.
- **Mevcut modüllerle bağ:**
  - teslimde `rental_handover`, iadede `rental_return` km okuması ve konum olayı (teslimde "Müşteride", iadede iade şubesi); bu kayıtlar km/konum geçmişine `source_type/source_id` ile, aynı işlemde yazılır ve kaynağa bağlı kayıtlar yalnız kendi akışından düzeltilir (§8.5.6);
  - sözleşme bir belge sürümünü sabitler (`vehicle_documents.locked_at`);
  - kanıt fotoğrafları ayrı ve değiştirilemez; tanıtım galerisine karışmaz;
  - araç değişiminde her aracın km'si kendine yazılır.
- **Riskler:**
  - aynı teslimin iki kez yapılmaması ve tek ücret (idempotency);
  - sözleşme ve imzanın hukuki geçerliliği (Part IV);
  - kanıt fotoğraflarının saklanması;
  - çevrimdışı/yavaş bağlantıda yarım teslim.
- **Büyüklük:** en büyük modül; alt aşamalara bölünmeli (önce teslim/iade ve inceleme, sonra uzatma, değişim ve olağan dışı sonlar).

### 3.5 Finans (spec §30, §62–67, §72, §59BE, §59BZ, §59CA)
- **Amaç:**
  - çok para birimli, parçalı, çok ödeyenli tahsilat (`Recorded` / `Applied` ayrımı);
  - depozito (`Held / Applied / Released`), iade, şube kasaları ve vardiya mutabakatı, finansal kapanış;
  - para birimleri asla karışık toplanmaz.
- **Tablolar:** `charges`, `payments`, `payment_allocations` (benzersiz kaynak anahtarlarıyla tekrar uygulama engeli), `deposits` ve hareketleri, `cash_drawers`, `cash_sessions`, `refunds`.
- **Riskler:**
  - tutarlar tamsayı alt birimde ve ISO para birimiyle tutulmalı;
  - yuvarlama kuralları;
  - çifte uygulama;
  - **gerçek ödeme sağlayıcısı entegrasyonu yok** (kararınız gereği).
- **Büyüklük:** büyük. Rezervasyon kaparosu için gereken en küçük parçalar (ödeme kaydı, avans) rezervasyonla birlikte, ortak modelin üzerine yapılır.

### 3.6 Araç transferi (spec §59R, §59CF)
- **Amaç:** `Planned → In Transit → Completed | Cancelled`. Kaynak/hedef konum, planlanan ve gerçek çıkış/varış, başlangıç/bitiş km ve yakıt, görevli. **Ana şube değişmez.**
- **Mevcut modüllerle bağ:**
  - başlangıçta konum "Yolda" (`source_type = transfer`) ve km okuması `transfer_start`, varışta hedef şube ve `transfer_end`;
  - bekleyen **"Yolda" kararı** burada doğal olarak çözülür;
  - hedef şubenin aracı teslim alması (şube yetkisi) burada tanımlanır;
  - müsaitlik bloğu rezervasyonla birlikte devreye girer.
- **Riskler:** şubeler arası yetki (gönderen ve alan şube); iptal edilen transferin konumu.
- **Büyüklük:** küçük–orta. Para yok. Araç modülünü tamamlar.

### 3.7 Bakım ve Servis (spec §14, §59CI, §59O, §59BO, §59D)
- **Amaç:**
  - bakım kayıtları (planlı, açık, tamamlanan, geciken);
  - km veya süreye bağlı bakım şablonları ("hangisi önce gelirse");
  - lastik setleri ve değişimleri;
  - servis sağlayıcılar;
  - hazırlık (readiness) engelleri.
- **Mevcut modüllerle bağ:**
  - servise bırakmada konum "Serviste" (`source_type = maintenance`);
  - tamamlamada km okuması;
  - hatırlatmalar türetilmiş km'yi kullanır;
  - 360° "Bakım ve lastikler" sekmesi açılır.
- **Riskler:** maliyet kaydı. Gerçek servis maliyeti bakım kaydındadır; finansa gider olarak aktarılması Finans gelince bağlanır. Tutar şimdiden ISO para birimiyle tutulur.
- **Büyüklük:** orta. Para kaydı var ama tahsilat yok.

### 3.8 Hasar kayıtları (spec §34, §59BD, §83.4)
- **Amaç:** araç hasarı (konum, fotoğraf, ciddiyet), kaynağı (teslim/iade incelemesi, olay), onarımı (bağlı bakım kaydı), sigorta dosyası, müşteriye yansıtma (finans).
- **Mevcut modüllerle bağ:** araç 360° "Belgeler ve riskler" sekmesindeki **Açık riskler** paneli bununla açılır. Hasar, bir bakım veya onarım kaydıyla kapanır. Hazırlık engeli oluşturabilir.
- **Riskler:** tahsilat, onarım ve sigorta otoriteleri ayrı tutulmalı; aynı tutar iki kez yansıtılmamalı (§59CZ).
- **Büyüklük:** orta. En değerli hâli kiralama incelemeleriyle birlikte gelir.

## 4. Önerilen sıra

| Sıra | Modül | Neden şimdi |
|---|---|---|
| 1 | **Müşteriler + Kurumsal hesaplar** | Para içermez, tek başına değerli, rezervasyon ve kiralamanın önkoşulu. Kişisel veri kurallarını erken netleştirmek sonraki tüm modülleri kolaylaştırır. |
| 2 | **Araç transferi** (küçük) | Araç modülünü tamamlar, "Yolda" kararını çözer, km/konum olay altyapısının kaynak bağlantısını ilk kez gerçek bir modülle sınar; kiralama teslim/iadesinin küçük bir provasıdır. |
| 3 | **Bakım ve Servis** | Para tahsilatı yok. Araç 360°'ın bir sekmesini daha gerçek yapar ve hazırlık engelleri kiralamadan önce hazır olur. |
| 4 | **Ayarlar temeli** (para birimleri, kurlar, vergi, sigorta, süre ve depozito politikaları) | Fiyatlı her işlemden önce gerekli (spec Stage 1). |
| 5 | **Rezervasyonlar** + müsaitlik servisi + kaparo için gereken en küçük finans parçaları | İlk gelir akışı. Müsaitlik servisi transfer ve bakım bloklarını da kapsar. |
| 6 | **Kiralamalar** (alt aşamalarla) | En büyük ve en riskli. Önceki modüllerin hepsini kullanır. |
| 7 | **Finans** (tam) | Tahsilat masası, depozito, kasalar, kapanış. |
| 8 | **Hasar kayıtları** | Kiralama incelemeleri ve bakım hazır olunca tam değerine ulaşır. |

**Alternatif (gelir öncelikli):** 1 → 4 → 5 → 6 → 7, ardından 2, 3 ve 8. Gelir akışı daha erken gelir, ama kiralama başladığında transfer ve bakım engelleri eksik kalır ve "Yolda" kararı askıda kalır.

## 5. Kiralamaya başlamadan önce verilmesi gereken kararlar

1. Kişisel veri: müşteri kimlik/ehliyet görüntülerinin saklanma süresi, erişim kaydı ve silme süreci (spec Part IV).
2. Sözleşme şablonu ve elektronik imzanın hukuki geçerliliği; sözleşme dili ve numaralandırma.
3. Vergi kuralları (ülke bazında) ve fatura gerekip gerekmediği. V1'de fatura entegrasyonu yok.
4. Kanıt fotoğraflarının saklanma süresi ve boyut sınırları; depolama yeri (`STORAGE_DIR`) ve yedekleme.
5. Şube saat dilimi mi, şirket saat dilimi mi (gece raporu, karar 1).
6. Zararlı dosya tarayıcısının (ClamAV) üretim kurulumu. Müşteri belgeleri de bu kapıdan geçecek.

## 6. Ortak riskler ve önlemler

- **Çifte işlem** (iki kez teslim, iki kez ücret, iki kez ödeme uygulama): işlem başına kaynak anahtarı + benzersiz kısıt + araç/kiralama başına sıraya alma. Km/konumdaki `clientRequestId` ve kilit deseni yeniden kullanılır.
- **Tek gerçek ilkesi** (§59CS): müsaitlik, km, konum, fiyat ve bakiye tek yerde hesaplanır; diğer ekranlar okur.
- **Şube yetkisi:** araç görünürlüğü ana şubeye bağlı. Kiralama/rezervasyonda teslim ve iade şubesinin yetkisi ayrıca tanımlanmalı (ör. Mostar'da iade edilen Saraybosna aracı).
- **Para:** tamsayı alt birim, ISO kodu, karışık toplam yok, yuvarlama tek fonksiyonda.
- **Migration:** her modül yalnız ekleyen migration ile; `scripts/safe-migrate.mjs` ile önce test provası, sonra yedekli uygulama.
