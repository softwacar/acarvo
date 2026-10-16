# Ana Kontrol Paneli + Operasyonel Hazırlık V1 — Geliştirme Raporu

| | |
|---|---|
| Dal | `operasyon-hazirlik-v1` |
| Çalışma ağacı | `C:\Users\soena\Desktop\acarvo-oh1` |
| Başlangıç | main `29b105d` (ana veritabanı 43 migration) |
| Durum | Test ortamında tamamlandı. Main'e birleştirilmedi, ana veritabanına migration uygulanmadı, push yapılmadı. |
| Plan | `docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md` |

---

## 1. Yapılanlar

| # | Özellik | Durum |
|---|---|---|
| 1 | **Ana Ekran** (`/`): gerçek kayıtlardan özet, şu anki filo durumu, bugün teslim/iade, gecikenler, önümüzdeki üç gün, dikkat gerektirenler, bakım/hasar/transfer sayıları, periyodik bakım, şube tablosu, para birimine göre finans | Tamam |
| 2 | **Operasyonel Hazırlık** (`/ayarlar/hazirlik`, yalnız Sahip): salt okunur kontrol listesi | Tamam |
| 3 | **Onarım taşıması kanıtı**: taşıyıcı adı ve sevk/iş emri referansı zorunlu; isteğe bağlı kanıt fotoğrafları | Tamam |
| 4 | **Fotoğraf erişim izni ve denetimi**: belge izni modeliyle; izin POST ile alınır ve bir kez geçmişe yazılır, GET hiçbir şey yazmaz | Tamam |
| 5 | **Hasar engeli için dört göz**: talep → farklı yetkili onay/ret; API ve PostgreSQL'de zorunlu | Tamam |
| 6 | **FN5**: (A) hareketsiz dosyada iki kişilik düzeltme; (B) hareketli dosyada düzeltme yok, "inceleme gerekli" | Tamam |
| 7 | Arayüz: V5 stili, 1440/768/390 ekran görüntüleri incelendi, erişilebilirlik (axe) | Tamam |
| 8 | Testler: API 518 → **529** (38 dosya, hepsi geçti), tarayıcı 127 → **134** | Tamam |

Sprint sırasında bulunan ve düzeltilen hatalar:
- Ana Ekran: tüm şubelere yetkili bir kullanıcı **başka şirketin şube kimliğini** URL'de verdiğinde istek 200 dönüyordu. Veri sızmıyordu (RLS sonuçları boş döndürüyordu) ama istek reddedilmiyordu. Artık 403.
- Ana Ekran: tek şube seçilince seçilebilir şube listesi de daralıyor, seçici kayboluyordu. Düzeltildi.
- Ana Ekran sunucu kodu: istekler arasında paylaşılan modül düzeyi bir dizi vardı (istekler arası karışma riski). Fonksiyon içine alındı.
- Fotoğraf GET'i başka şirket için 404 yerine 403 dönüyordu (kaydın varlığını ele veriyordu). İzin kontrolü görünürlük kontrolünden sonraya alındı.

## 2. Veri kaynakları (Ana Ekran)

Hepsi mevcut tablolardan, sabit sayıda küme sorgusuyla (kayıt başına sorgu yok). Tahmin, örnek veri veya kur dönüşümü yok.

| Bölüm | Kaynak | Yetki |
|---|---|---|
| Filo durumu (şimdi) | `vehicles` + ortak `vehicle_busy(now, now+1 sn)`; kovalar birbirini dışlar | `vehicles.read` |
| Bugün teslim | onaylı `reservations` (bugün alış) + `rentals` status `prepared` | `reservations.read` / `rentals.read` |
| Bugün iade, aktif kiralama | `rentals` status `delivered` | `rentals.read` |
| Gecikenler | alış zamanı geçmiş onaylı rezervasyon / hazır kiralama; iade zamanı geçmiş teslim edilmiş kiralama | aynı |
| Önümüzdeki üç gün | aynı kaynaklar, yarından itibaren 3 gün (şirket saat diliminde) | aynı |
| Bakım | `maintenance_records` (bakımda, onay bekleyen, geciken) | `maintenance.read` |
| Periyodik bakım | `maintenance_schedules` + son tamamlanan periyodik bakım + son km; ortak `classifyServiceDue` kuralı | `maintenance.read` |
| Hasar | `damage_files`, açık `damage_blocks`, bekleyen `damage_block_release_requests` | `damage.read` |
| Transfer | `vehicle_transfers` (yolda, şubeye gelen, geciken) | `transfers.read` |
| Finans | Finans Merkezi ile **aynı** `financeSummary` fonksiyonu + bekleyen onay sayıları | `finance.reports.read` |

**Müsaitlik tutarlılığı.** Filo kovaları rezervasyon ve kiralama ekranlarının kullandığı `vehicle_busy` fonksiyonundan gelir; ikinci bir uygunluk motoru yoktur. Ana Ekran yalnız **şu anı** gösterir ve bunu ekranda yazar. İleri tarih müsaitliği rezervasyon/kiralama ekranında tarih seçilerek görülür; ikisi karıştırılmaz.

Kovalar: Müsait · Rezervasyona ayrılmış · Kirada · Bakımda · Transferde · Kullanılamaz (hasar engeli veya hizmet dışı). Toplamları araç sayısına eşittir; testte doğrulanır.

## 3. Kapsam (şirket ve şube)

- Tüm sorgular RLS altında `withCompany` içinde çalışır.
- Şubeye sınırlı kullanıcı yalnız kendi şubelerinin rakamlarını görür.
- `?branchId=` yalnız kullanıcının kapsamındaki **ve bu şirkete ait** aktif şubeyi kabul eder; aksi halde 403 `BRANCH_FORBIDDEN`.
- Şube seçimi URL'de tutulur (`?sube=`).
- Yetkisi olmayan bölüm yanıtta **hiç yer almaz** (`null`). Sıfır gösterilmez, gizli sayı sızmaz.
- Listelerdeki müşteri adı yalnız rezervasyon/kiralama okuma yetkisi olanlara döner. Bakım, hasar ve transfer satırlarında müşteri adı yoktur.
- Her satır gerçek kayda bağlantıdır; kayıt ekranı kendi yetkisini ayrıca denetler.

## 4. Finans doğruluğu

- Finans Merkezi ile aynı `financeSummary` fonksiyonu kullanılır (repository'ye taşındı). İki ayrı hesap yoktur.
- Her para birimi ayrı satırdır. Dönüştürme ve toplama yapılmaz.
- Gösterilenler:
  - onaylı iç hesap kalemi;
  - doğrulanmış tahsilat;
  - doğrulama bekleyen tahsilat;
  - kalan;
  - tutulan depozito;
  - bekleyen onaylar (tahsilat, kalem/ters kayıt, depozito, depozito iadesi).
- Teklif gelir sayılmaz. Depozito tahsilat veya gelir sayılmaz.
- Ekrandaki uyarı: "İç işlem kayıtlarıdır; resmî muhasebe raporu veya gelir tablosu değildir. Para birimleri birbirine çevrilmez ve toplanmaz."
- Yetki `finance.reports.read`'tir (Finans Merkezi özetiyle aynı). Plan taslağında `finance.read` yazıyordu; kalem ayrıntısı görmeyen ama özet görmemesi gereken roller için daha dar olan `finance.reports.read` seçildi.

## 5. Operasyonel hazırlık kontrolleri

`GET /api/readiness`, yetki `readiness.read` (yalnız Sahip). Hiçbir kontrol veri değiştirmez, ayar açmaz, yetki vermez, anahtar üretmez, hukuki onay kaydetmez.

| Kontrol | Durumlar | Not |
|---|---|---|
| Şube ülkeleri | Hazır / Eksik | Eksik şubeler kodla listelenir; ülke tahmin edilmez |
| Şube saat dilimleri | Hazır / Eksik | Geçersiz IANA bölgesi |
| Müşteri belgesi anahtarları (M2) | Yapılandırılmış / Eksik | Yalnız "uygulama yükledi mi". Değer, kimlik, parmak izi, konum gösterilmez |
| Zararlı dosya taraması | Çalışıyor / Çalışmıyor / Doğrulanmadı / Eksik | ClamAV yoklaması. Tarayıcı yoksa geliştirmede "Doğrulanmadı", üretimde "Eksik" |
| Ülke belge kuralları | Yapılandırılmış / Eksik | Kural içeriğinin hukuki doğruluğu doğrulanmaz |
| Kiralama çalışma modu | Yapılandırılmış / Karar gerekli | Otomatik açılmaz |
| Fiyat listesi | Hazır / Eksik | |
| Vergi | Hazır / Eksik | Oran tahmin edilmez |
| Sözleşme şablonu | Hazır / Eksik | |
| Sözleşmenin hukuki onayı | Her zaman **Doğrulanmadı** | ACARVO hukuki onay üretmez |
| Dört göz yetkilileri | Hazır (≥2 kişi) / Eksik | Tahsilat ve depozito doğrulama, kalem onayı, depozito iadesi, FN5 düzeltmesi, hasar engeli kaldırma |
| Bekleyen kararlar | Karar gerekli / Hazır | Engel kaldırma, FN5, bakım planı, transfer talebi sayıları |

"Yapılandırılmış" (ayar girildi), "Çalışıyor" (hizmet şu an yanıt veriyor) ve "Doğrulanmadı/hukuken onaylı değil" ekranda ayrı rozetlerle gösterilir ve açıklanır.

## 6. Gerçek kullanım için eksik canlı koşullar

Test veritabanında görülenler. Main'de değerler farklı olabilir; birleştirmeden sonra hazırlık ekranı gösterecektir.

- Zararlı dosya tarayıcısı (ClamAV) kurulu değil; üretimde yükleme kapalı kalır.
- Etkin fiyat listesi ve vergi yapılandırması yok.
- Etkin sözleşme şablonu yok. Hukuki inceleme ACARVO dışında yapılmalı.
- Main'deki Drina'da yalnız 1 Sahip ve 1 Operasyon var, Yönetici yok. Bu yüzden **ikinci onaylayan kişi yok**:
  - hasar engeli kaldırılamaz;
  - finans doğrulamaları ve FN5 ikinci onayı yapılamaz.

  Sistem bu durumda sessizce kaldırmaz; hazırlık ekranında "Eksik" görünür (bkz. §22).
- Gerçek M2 anahtarlarının sunucuda olup olmadığı yalnız "yüklendi / yüklenmedi" olarak görünür.

## 7. Onarım taşıması kanıtı

- Onarım amaçlı taşımada **taşıyıcı firma/çekici adı** (2–120 karakter) ve **sevk/iş emri referansı** (2–60 karakter, izinli karakterler) zorunludur.
- Zorunluluk üç yerde uygulanır:
  - shared zod şeması;
  - API;
  - veritabanı insert koruması (`vehicle_transfers_carrier_required`).
- İki alan sonradan değiştirilemez.
- Normal transferde bu alanlar boş kalmak zorundadır (`vehicle_transfers_carrier_check`).
- Mevcut eski kayıtlar CHECK yerine insert korumasıyla etkilenmez.
- Ayrıca kaydedilen bilgiler: yöntem, gerekçe, bağlı hasar dosyası, talep eden, zaman ve çıkış beyanı (önceki sprintten).
- **Kanıt fotoğrafları** (isteğe bağlı):
  - Yalnız açık onarım taşımasına eklenir; en fazla 10 adet. Yetki `transfers.repair`.
  - Fotoğraflar güvenli dosya altyapısından geçer: özel depolama, içerik doğrulama, meta veri silme, tarama.
  - Görüntülemek için fotoğraf erişim izni gerekir.
- Ekranda referans "(beyan, doğrulanmadı)" olarak gösterilir. Sağlayıcı tarafından doğrulanmış izlenimi verilmez.
- Varışta hasar dosyası ve engel olduğu gibi kalır (tarayıcı testiyle doğrulandı).
- Kullanılamaz araç normal transferle hâlâ çıkamaz (önceki kural korunur, test edildi).

## 8. Fotoğraf güvenliği ve erişim denetimi

Kanıt fotoğrafları (kiralama teslim/iade, bakım, hasar, transfer) belge erişim izni modeline bağlandı.

1. `POST /api/photo-access {kind, id}`:
   - CSRF ve Origin koruması (genel eklenti).
   - İlgili okuma yetkisi ve kaydın şirket/şube görünürlüğü denetlenir.
   - Bu oturuma 10 dakikalık izin verilir.
   - Geçmişe **bir kez** `photo.access_granted` yazılır. Özet: kayıt no, fotoğraf sayısı, dakika.
   - Geçerli izin varsa aynısı döner (`reused`); ikinci kayıt yazılmaz.
2. Fotoğraf GET'leri izni ister; izin yoksa 403 `PHOTO_ACCESS_REQUIRED`.
   - GET **hiçbir geçmiş kaydı yazmaz**.
   - Yanıt `no-store` başlığıyla döner.
   - Başka şirketin kaydında önce 404 döner (kaydın varlığı ele verilmez).
3. İzin bellekte ve oturuma bağlıdır. Çıkış yapınca ya da yetki kaldırılınca erişim biter (API testinde doğrulandı). URL'de jeton, imza veya anahtar yoktur; günlüklere sızmaz.
4. Eski fotoğraflara dokunulmadı; yalnız erişim yolu değişti.
5. Arayüz: fotoğraf alanları izin alınınca görünür (`EvidenceGate`). Altında "izin … tarihine kadar verildi; izin işlem geçmişine kaydedildi" notu yer alır.

Araç tanıtım fotoğrafları kanıt değildir; önceki gibi kalır.

## 9. Hasar engeli: dört göz

**Akış:**
1. `POST /api/damages/:id/unblock-request` — talep. Gerekçe ve sonraki kullanılabilirlik (kullanılabilir/kısıtlı) girilir. Bir engel için tek açık talep olabilir.
2. `POST /api/damages/release-requests/:id/approve` — farklı bir `damage.unblock` yetkilisi onaylar:
   - araç kilidi alınır ve engelin hâlâ açık olduğu yeniden denetlenir;
   - talep onaylanır, engel aynı işlemde kapanır, kullanılabilirlik değişir.
3. `reject` — farklı kişi, gerekçe zorunlu.
4. `cancel` — yalnız talep eden.

**Veritabanı zorunluluğu (`0044`):**
- Bir engel ancak aynı işlemde (`decided_at = now()`) onaylanmış bir talep varsa kapanabilir. Kapatan kişi onaylayan kişidir ve talep edenden farklıdır (`damage_blocks_four_eyes`).
- Talep tablosunun kuralları:
  - yalnız `requested` olarak başlar;
  - kimlik alanları değişmez;
  - karar verilmiş talep değişmez;
  - onay/ret ikinci kişi tarafından verilir;
  - geri çekme yalnız talep eden kişi tarafından yapılır.
- Silme yok.

**Diğer kurallar:**
- Aynı araçta bakım, transfer veya başka bir engel varsa araç onlar nedeniyle tutulmaya devam eder (ortak `vehicle_busy`).
- Operasyon rolüne kaldırma yetkisi verilmedi. Özel rollere dokunulmadı.
- Normal bakım tamamlamada dört göz yok.
- İkinci yetkili yoksa engel kalkmaz. Hazırlık ekranı "Hasar engeli kaldırma onayı: Eksik" gösterir.
- Eşzamanlılık: aynı talebe iki onay → biri başarılı, diğeri reddedilir (API testi).

## 10. FN5 — ödeme sorumlusunun düzeltilmesi

**(A) Finansal hareketi olmayan dosya:**
1. `POST /api/rentals/:id/finance/responsible-corrections` (`finance.close`): hedef taraf (kiralamanın müşterisi veya kurumsal hesabı) ve gerekçe girilir.
2. Farklı bir finans yetkilisi `approve` eder. Onay anında hareket yeniden denetlenir, talep `applied` olur ve `rental_finances` aynı işlemde güncellenir.
3. `reject` (gerekçeli) ve `cancel` (yalnız talep eden) de vardır.

- Talep ve karar finans geçmişine ve denetim günlüğüne yazılır. Eski değer talep kaydında kalır.
- **Veritabanı (`rental_finances_guard`):** ödeme sorumlusu yalnız şu koşulların hepsi sağlanınca değişebilir:
  - aynı işlemde uygulanmış ve ikinci kişi tarafından onaylanmış bir düzeltme var, from = eski, to = yeni;
  - dosya kapalı değil;
  - dosyada hareket yok;
  - yeni taraf kiralamanın müşterisi/kurumsal hesabı.
- Bağlantılar yeniden doğrulanır.

**(B) Hareketi olan dosya** (herhangi bir iç hesap kalemi, tahsilat veya depozito; `finance_file_has_movement`):
- Talep 409 `FINANCE_CORRECTION_REVIEW` ile reddedilir. Onay anında hareket oluşmuşsa onay da reddedilir.
- Ekranda "İnceleme gerekli" ve nedeni gösterilir.
- Hiçbir kayıt taşınmaz, silinmez veya değiştirilmez; finans kayıtlarının değişmezliği korunur.
- Önerilen model (insan kararı, bu sprintte uygulanmadı): yanlış dosyadaki kalem ve tahsilatlar mevcut ters kayıt/iade akışlarıyla tek tek kapatılır, doğru sorumlu için yeni kayıtlar açılır. Bu, kimin neyi ne zaman düzelttiğini iz olarak bırakır. Otomatik toplu taşıma yapılmaz.

## 11. Migration'lar (yalnız `acarvo_test`; test veritabanı 46, main 43)

| Dosya | Tür | İçerik |
|---|---|---|
| `0043_readiness.sql` | drizzle | `vehicle_transfers.carrier_name`, `transport_reference` + CHECK; `transfer_photos`, `damage_block_release_requests`, `finance_responsible_corrections` tabloları |
| `0044_readiness_guards.sql` | elle | 3 tablo için zorunlu RLS (4 politika); `files_kind_check` + `transfer_photo`; `finance_file_has_movement`; `rental_finances_guard` (FN5); düzeltme ve engel talebi korumaları; `damage_blocks_guard` (dört göz); `vehicle_transfers_guard` (taşıyıcı zorunlu ve değişmez); `transfer_photos_guard`; silme yasağı tetikleyicileri; yetkiler |
| `0045_readiness_event_kinds.sql` | drizzle | hasar olaylarına `release_requested/rejected/cancelled`, transfer olaylarına `photo_added/removed` |

- Mevcut migration geçmişi değiştirilmedi. Boş migration yok.
- `safe-migrate --verify --test` tutarlı.
- Hazır roller: sürüm 12. Önceki hazır roller geçmişe kopyalandı; yalnız Sahip'e `readiness.read` eklendi.

## 12. API

| Uç | Yetki | Not |
|---|---|---|
| `GET /api/dashboard?branchId=` | oturum + bölüm başına okuma yetkisi | §2–4 |
| `GET /api/readiness` | `readiness.read` | §5 |
| `POST /api/photo-access` | kaydın okuma yetkisi | §8 |
| `POST /api/damages/:id/unblock-request` | `damage.unblock` | eski tek adımlı `/:id/unblock` kaldırıldı |
| `POST /api/damages/release-requests/:id/approve\|reject\|cancel` | `damage.unblock` | |
| `POST /api/rentals/:id/finance/responsible-corrections` | `finance.close` | |
| `POST /api/finance/responsible-corrections/:id/approve\|reject\|cancel` | `finance.close` | |
| `POST/DELETE /api/transfers/:id/photos[/:photoId]` | `transfers.repair` | |
| `GET /api/transfers/:id/photos/:photoId` | `transfers.read` + izin | |
| Kiralama, bakım ve hasar fotoğraf GET'leri | + izin | |

Detay yanıtlarına eklenenler:
- `DamageDetail.releaseRequests`;
- `TransferDetail.carrierName`, `transportReference`, `photos`, `uploadPolicy`;
- `RentalFinanceView.responsibleCorrections`, `correction {possible, blocker}`.

## 13. Ekranlar

- **Ana Ekran** (`/`):
  - başlıkta tarih, saat ve saat dilimi;
  - şube seçici ve yenile düğmesi (60 sn'de bir otomatik yenilenir);
  - tek şeritlik özet (her sayı listesine gider);
  - hazırlık notu (Sahip);
  - gecikenler, bugün teslim/iade, önümüzdeki üç gün, dikkat gerektirenler;
  - sağda filo çubuğu ve açıklamalar, bakım/hasar/transfer sayıları, periyodik bakım;
  - şube tablosu ve finans tablosu.

  Boş, yükleniyor, hata ve yetkisiz durumlarının hepsi vardır.
- **Operasyonel hazırlık** (`/ayarlar/hazirlik`): özet rozetleri, grup başına kontroller, "Yapılacak" satırı, ilgili ekran bağlantısı. Ayarlar sayfasında bağlantısı var.
- **Hasar ayrıntısı:**
  - "Engel kaldırma talebi" diyaloğu;
  - "ikinci onay bekliyor" paneli. Talep eden "Kendi talebinizi onaylayamazsınız" yazısını ve "Talebi geri çek" düğmesini görür; diğer yetkili "Onayla" ve "Reddet" düğmelerini görür;
  - talepler bölümü;
  - geçmişte okunur olay adları.
- **Transfer:** formda taşıyıcı ve referans alanları; ayrıntıda bu bilgiler ve "Taşıma kanıtı" fotoğraf bölümü.
- **Kiralama → Finans:** "Ödeme sorumlusu düzeltmesi" bölümü (talep, onay, ret, geri çekme, inceleme gerekli) ve finans geçmişi etiketleri.
- Menüde Ana Ekran artık gerçek ekran.

## 14. API testleri

**529 test, hepsi geçti** (önceki 518). 38 dosya.

Yeni `readiness.test.ts` (10 test):
- Ana Ekran sayılarının veritabanıyla eşleşmesi;
- şube kapsamı, başka şirketin şube kimliği → 403, şirket yalıtımı;
- finans yetkisi ve para birimlerinin ayrı kalması;
- müsaitlik kovalarının ortak `vehicle_busy` ile tutarlılığı;
- hazırlık yetkisi, anahtar değerinin sızmaması;
- fotoğraf izinleri: POST bir kez yazar, GET izin ister ve yazmaz, başka oturum/şirket/şube dışı kullanıcı alamaz, çıkış ve yetki kaldırma erişimi bitirir;
- dört göz: talep tek başına bir şey değiştirmez, kendi kendine onay yok, onayda yeniden denetim, diğer tutmalar sürer, veritabanı doğrudan kaldırmayı reddeder;
- FN5 A/B ve veritabanı koruması;
- onarım taşıması kanıtı;
- hasarlı aracın normal transferinin reddi.

Değişen testler:
- `operations.test.ts`: iki kişilik kaldırma yardımcısı, iki onayın eşzamanlılığı, taşıyıcı alanları.
- `rentals.test.ts`: fotoğraf öncesi izin.
- `operations-performance.test.ts`: sentetik engeller artık dört göz kuralıyla kaldırılıyor. Doğrudan güncelleme yeni veritabanı kuralınca doğru şekilde reddedildi.
- `dashboard-performance.test.ts`: yeni (§16).

## 15. Tarayıcı testleri

**134 test geçti, 0 hata.** 36 test atlandı: bunlar yalnız `SCREENSHOTS=1` ile çalışan ekran görüntüsü testleri. Tam çalıştırma 16 dakika sürdü; önceki 127 + 7 yeni test.

Yeni `dashboard.spec.ts` (7 test):
- Sahip Ana Ekranı: sayılar API ile aynı, filo toplamı, finans uyarısı, şube filtresi URL'de ve seçici kalıyor, axe;
- Operasyon kullanıcısı: yalnız SJJ, finans ve hazırlık yok, hazırlık sayfası yetkisiz;
- başka şirket: ayrı şubeler, yabancı şube kimliği 403;
- hazırlık sayfası: hukuki onay "Doğrulanmadı", anahtar değeri yok, değiştiren düğme yok, axe;
- FN5 A: talep → talep eden onaylayamaz → ikinci kişi uygular, axe;
- FN5 B: hareketten sonra "İnceleme gerekli", talep düğmesi yok;
- fotoğraf izni: izinsiz 403, kayıt açılınca izin ve 200 + no-store, tekrar açmak geçmiş yazmaz.

Güncellenen:
- `operations.spec.ts`: engel kaldırma talep + ikinci kişi onayı; onarım taşımasında taşıyıcı/referans ve kanıt bölümü.

Yeni `ops-oh-screens.spec.ts`: ekran görüntüleri, isteğe bağlı (`SCREENSHOTS=1`).

## 16. Performans

`dashboard-performance.test.ts` (acarvo_test, sentetik):
- 3.000 bekleyen rezervasyon, 3.000 bakım, 3.000 hasar dosyası (1.000 açık engel), 3.000 transfer.
- Isınmadan sonra:

| Ölçüm | Süre |
|---|---|
| Ana Ekran (tüm şirket) | ~61 ms |
| Ana Ekran (tek şube) | ~51 ms |
| Hazırlık | ~26 ms |

Eşik 2.500 ms. Sayılar veritabanıyla eşleşiyor. Önceki operasyon performans testi de geçiyor.

## 17. Ekran görüntüleri

`apps/e2e/screenshots/oh1/` (Git'e eklenmez). 1440, 768 ve 390 genişlikte 10'ar görüntü:
1. Ana Ekran
2. tek şube
3. hazırlık
4. hasar talep eden görünümü
5. onaylayan görünümü
6. onay diyaloğu
7. onarım taşıması formu hataları
8. onarım taşıması ayrıntısı
9. FN5 inceleme gerekli
10. Operasyon kullanıcısının Ana Ekranı

Her görüntüde yatay taşma kontrol edildi.

İncelemede bulunup düzeltilenler:
- geçmişte ham "release_requested" kodu görünüyordu;
- uzak tarihlerde yıl görünmüyordu;
- özet ipucu kesiliyordu.

## 18. Commit'ler (`operasyon-hazirlik-v1`)

| Commit | İçerik |
|---|---|
| `d0e339f` | Sunucu: Ana Ekran, hazırlık, fotoğraf izinleri, dört göz, FN5, taşıma kanıtı, migration 0043–0045, rol sürüm 12, testler |
| `576267a` | Ekranlar ve tarayıcı testleri; şube kapsamı düzeltmesi |
| `c1ff737` | Olay etiketleri, tarih yılı, ekran görüntüsü testi, performans verisinin dört göz uyumu |
| (son) | Bu rapor |

## 19. Ana veritabanı koruması

- Ana veritabanına bağlanılmadı, migration uygulanmadı, hiçbir kayıt değişmedi. Ana veritabanı 43 migration'da.
- Testler yalnız `acarvo_test` üzerinde ve yalnız sentetik veriyle çalıştı.
- `.env` değişmedi. Anahtar üretilmedi.
- Push ve main'e birleştirme yapılmadı.
- Main sunucuları (3001/5173) önceki oturum kapanınca durmuştu; main kodundan değiştirilmeden yeniden başlatıldı.

## 20. Main'e geçiş için gerekenler

1. Bu raporun ve aşağıdaki kararların (§22) onaylanması.
2. Main'e fast-forward birleştirme. Dal main'in üzerinde; çakışma beklenmiyor.
3. Ana veritabanının doğrulanmış yedeği, ardından `safe-migrate` ile 43 → 46.
4. Hazır rol yükseltmesi (sürüm 12): yalnız Sahip rolüne `readiness.read`. Şirket başına `role.preset_upgrade` denetim kaydı yazılır. Özel roller değişmez.
5. Birleştirme öncesi salt okunur ön kontrol:
   - açık hasar engeli sayısı (kaldırmak artık ikinci kişi ister);
   - `damage.unblock` ve finans dört göz yetkilisi sayısı;
   - onarım taşıması olarak açık transfer var mı (taşıyıcı alanları yalnız yeni kayıtlar için zorunlu; eskiler etkilenmez).
6. Birleştirme sonrası: tam API ve tarayıcı testleri; main'de Ana Ekran ve hazırlık ekranının kontrolü.
7. Uygulama kullanıcılarına bilgi: "Engeli kaldır" artık "Engel kaldırma talebi + ikinci onay"; kanıt fotoğrafları bir izinle açılıyor ve izin geçmişe yazılıyor.

## 21. Riskler ve sınırlar

- **İkinci yetkili eksikliği:** main'de Drina'nın Yönetici'si yok. Dört göz gerektiren adımlar ikinci kişi atanana kadar yapılamaz. Bu bilinçli bir davranış; hazırlık ekranında görünür.
- Fotoğraf izinleri sunucu belleğinde tutulur. Sunucu yeniden başlarsa izinler biter ve kullanıcı ekranı açınca yeniden izin alınır (yeni bir geçmiş kaydıyla). Birden çok sunucu örneğinde ortak depoya taşınmalı (belge izinleriyle aynı sınır).
- Ana Ekran 60 saniyede bir yenilenir; canlı akış değildir.
- "Önümüzdeki üç gün" ve listeler en fazla 12 satır gösterir. Tam liste ilgili ekrandadır.
- Şube tablosunda araç sayıları ana şubeye, teslim/iade sayıları kaydın şubesine göredir. Ekranda yazıyor ama yanlış okunabilir.
- FN5 (B) için ters kayıt + yeni dosya modeli tasarım olarak önerildi, uygulanmadı.
- Taşıyıcı referansı beyandır; ACARVO doğrulamaz.
- ClamAV olmadan üretimde yükleme kapalıdır.
- Bir API testinde (fotoğraf izni) bir kez fotoğraf yüklemesi başarısız oldu, tekrar çalıştırmada geçti. Nedeni görünmediği için teste yanıt kodu kontrolü eklendi; sonraki tam çalıştırmalarda tekrarlanmadı.

## 22. İnsan kararları

1. **İkinci onaylayan kişi:** Drina'ya (ve gerekiyorsa Neretva'ya) `damage.unblock` ve finans dört göz yetkisi olan ikinci bir kişi (ör. Yönetici) atanacak mı? Atanmazsa hasar engeli kaldırılamaz.
2. **FN5 (B) modeli:** hareketli dosyada "ters kayıt + yeni dosya" yaklaşımı onaylanıyor mu, yoksa hareketli dosyalar yalnız manuel incelemede mi kalsın?
3. Ana Ekran finans bölümü için `finance.reports.read` yeterli mi (Yönetici ve Sahip görür)?
4. Fotoğraf erişim izni süresi 10 dakika. Uygun mu?
5. Şube ülkeleri, vergi oranı, fiyat listesi, sözleşme şablonu ve hukuki onay: hazırlık ekranındaki "Eksik" ve "Doğrulanmadı" maddeleri yetkili kişilerce tamamlanmalı. Sistem bunları tahmin etmez veya açmaz.
6. Main'e birleştirme ve ana veritabanı migration'ı için onay.
