# Ana Kontrol Paneli + Operasyonel Hazırlık V1 — Geliştirme Raporu

| | |
|---|---|
| Dal | `operasyon-hazirlik-v1` |
| Çalışma ağacı | `C:\Users\soena\Desktop\acarvo-oh1` |
| Başlangıç | main `29b105d` (ana veritabanı 43 migration) |
| Durum | **Main'e entegre edildi** (fast-forward). Ana veritabanı 43 → 47, doğrulanmış yedek `backups/2026-10-17-00-24-03`. Push yapılmadı. Son kararlar ve entegrasyon: bölüm **S** (sonda). Bölüm 1–22 geliştirme raporudur; S bölümüyle çelişen yerde S geçerlidir. |
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
   - Bu oturuma 5 dakikalık izin verilir (son karar; ilk sürümde 10 dakikaydı).
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
4. Fotoğraf erişim izni süresi: **karar verildi, 5 dakika** (bkz. S.7).
5. Şube ülkeleri, vergi oranı, fiyat listesi, sözleşme şablonu ve hukuki onay: hazırlık ekranındaki "Eksik" ve "Doğrulanmadı" maddeleri yetkili kişilerce tamamlanmalı. Sistem bunları tahmin etmez veya açmaz.
6. Main'e birleştirme ve ana veritabanı migration'ı için onay.


---

# S. Son ürün kararları, güvenlik denetimi ve main entegrasyonu (2026-10-17)

Kapsam: kullanıcının "Dashboard + Operasyonel Hazırlık V1 — son ürün kararları, güvenlik ve main entegrasyonu" talimatı. Bütün kontroller başarılı olduğu için entegrasyon tamamlandı. Kritik güvenlik açığı, migration tutarsızlığı, başarısız yedek, veri kaybı riski ya da açıklanamayan veri değişikliği bulunmadı.

## S.1 Ürün kararlarının uygulanma durumu

| Karar | Durum |
|---|---|
| A) Hasar engeli: iki farklı uygun yetkili; talep eden onaylayamaz; finans dört göz gevşetilmez; ikinci yetkili yoksa işlem engelli ve Hazırlık'ta görünür; gerçek kullanıcı/yetki değiştirilmez | Uygulandı. Main'de Drina'da `damage.unblock`, `finance.payments.verify` ve `finance.close` yetkilisi **1 kişi**: bu adımlar engelli kalır ve Hazırlık ekranında "Eksik" görünür. Neretva'da 2 kişi var. Kullanıcı, rol veya yetki atanmadı. |
| B) FN5: hareketsiz dosyada iki kişilik akış korunur; hareketli dosyada taşıma/ters kayıt/yeni dosya/değişiklik yok, "Yetkili incelemesi gerekli" | Uygulandı. Ek olarak, talep beklerken dosyada hareket oluşursa onay denemesi talebi gerekçesiyle **geçersiz (reddedildi)** olarak kapatır ve geçmişe yazar. |
| C) Dashboard finansı yalnız `finance.reports.read` | Uygulandı. Yetkisiz kullanıcıda finans sorguları hiç çalışmaz, yanıtta `finance: null` döner (API testi ve tarayıcı testi). |
| D) Fotoğraf izni 5 dakika; kullanıcı, oturum, şirket, kayıt ve amaca bağlı; GET'te güncel yetki; süre, yetki iptali ve oturum kapanışında geçersiz; GET denetim kaydı yazmaz; kayıt anlamı "Fotoğraf erişim izni verildi" | Uygulandı (S.7). |
| E) Doğrulanmış yedekten sonra main entegrasyonu | Uygulandı (S.13–S.18). |

## S.2 Dashboard veri doğruluğu

- Tüm sayılar gerçek tablolardan gelir. Filo kovaları ortak `vehicle_busy` ile şu ana göre hesaplanır; ikinci bir uygunluk motoru yoktur.
- API testlerinde doğrulananlar:
  - Toplam araç = kova toplamı = veritabanındaki aktif ve hizmet dışı araçlar. Bekleyen ve onaylı rezervasyonlar, aktif kiralama, bugünkü teslim/iade ve gecikenler veritabanı sayılarıyla eşleşir.
  - "Şimdi müsait" araçlar, rezervasyon uygunluğunun önümüzdeki dakikalar için verdiği sonuçla aynıdır.
  - Hasar engeli kalkınca araç, süren bakım nedeniyle yine "bakımda" görünür.
- Kavramlar ayrı tutulur:
  - Ana Ekran yalnız **şu anki** uygunluğu gösterir ve bunu ekranda yazar.
  - Gelecek tarihli uygunluk rezervasyon ekranındadır.
  - Fiziksel konum araç konum geçmişindedir; Ana Ekran konum göstermez.
- Performans: 3.000'er kayıtla tüm şirket ~61 ms, tek şube ~51 ms, Hazırlık ~26 ms.

## S.3 Finans yetkisi ve şirket/şube güvenliği

- Başka şirketin şube kimliği → **403** (yeniden doğrulandı). Hem tüm şubelere yetkili Drina sahibi Neretva şubesiyle denedi, hem Neretva sahibi Drina şubesiyle.
- Şubeye sınırlı kullanıcı yalnız kendi şubesini görür; kapsam dışı şube → 403.
- Başka şirketin araç, rezervasyon, kiralama, finans, bakım, hasar, transfer ve hazırlık verisi dönmez. Testler: RLS altında sorgular, Neretva yanıtında Drina plakaları ve adı yok, başka şirketin hazırlık listesi ayrı.
- Hazırlık yalnız `readiness.read` ile açılır (yalnız Sahip). Operasyon kullanıcısı API'de 403 alır, ekranda yetkisiz mesajı görür.
- Hiçbir yetki kontrolü yalnız arayüzde değildir.

## S.4 Operasyonel Hazırlık

Bölüm 5'teki kontroller geçerlidir. Yeni durum: Drina'da ikinci onay yetkilisi olmadığından şu maddeler "Eksik" görünür:
- tahsilat doğrulama;
- kalem onayı;
- depozito iadesi;
- FN5;
- hasar engeli kaldırma.

Yanında şu açıklama yer alır: "ikinci yetkili olmadan bu adım tamamlanamaz (kural gevşetilmez)".

Değişmeyen davranış:
- Anahtar değerleri okunmaz, yazılmaz, gösterilmez, günlüğe geçmez.
- Hukuki onay her zaman "Doğrulanmadı" kalır.
- Hiçbir ayar kendiliğinden değişmez.

## S.5 Hasar engeli dört göz denetimi (API + PostgreSQL)

| Durum | Sonuç |
|---|---|
| Talep oluşturma | Engel kalkmaz; tek açık talep olabilir |
| Farklı yetkilinin onayı | Engel kalkar, kullanılabilirlik değişir |
| Talep edenin kendi onayı | 403 `FOUR_EYES`; veritabanı da reddeder |
| Aynı talebe ikinci onay | 409 |
| Eşzamanlı iki onay (iki ayrı oturum) | Biri 200, diğeri 409; tek `unblocked` olayı |
| Onaylayanın yetkisi kaldırılınca | 403; talep "bekliyor" kalır |
| Başka şirket | 404 |
| Aynı şirkette kapsam dışı şubeden Yönetici | 404 |
| Onaydan sonra diğer tutmalar | Süren bakım aracı tutmaya devam eder; araç müsait görünmez |
| Onaysız doğrudan veritabanı kaldırması | Reddedilir (`damage_blocks_four_eyes`) |

Ek düzeltme (geçen sprintten kalma, aralıklı başarısız bir eşzamanlılık testi): hasar engelinin başlangıç zamanı artık araç kilidi alındıktan sonraki gerçek zamandır (`clock_timestamp()`), işlemin başladığı an değil. Böylece kilidi önce alan bir teslim, kayıtlı zamanda da her zaman engelden öncedir.

## S.6 FN5 düzeltme güvenliği

- Hareketsiz dosyada: talep → farklı finans yetkilisi onayı. Ödeme sorumlusu yalnız kiralamanın müşterisi veya kurumsal hesabı olabilir. Şirket ilişkileri bileşik yabancı anahtarlarla korunur; geçmiş ve denetim kaydı tutulur; sürüm çakışması 409 döner.
- **Eşzamanlılık:** her finansal hareket (kalem, tahsilat, depozito, iade) ve FN5 onayı aynı `rental_finances` satırını kilitler (`finance_open_file` ve `FOR UPDATE`). İkisi sıraya girer:
  - Hareket önce gelirse onay reddedilir ve talep geçersiz sayılır.
  - Onay önce gelirse düzeltme hareketten önce uygulanmış olur.

  Bu iki sonuç API testinde aynı anda gönderilerek doğrulandı. Veritabanı koruması (`rental_finances_guard`) güncelleme anında hareketi yeniden denetler.
- Hareketli dosyalar değişmez kalır. Finans V1 korumalarına (dört göz, kapanış, değişmezlik, geçmiş) dokunulmadı; tüm finans testleri geçiyor.
- **İleride ayrı ürün kararı gereken konu:** hareketli dosyada yanlış ödeme sorumlusunun düzeltilmesi. Öneri: ters kayıtlar ve iade akışlarıyla tek tek kapatma ve doğru sorumlu için yeni dosya; hepsi elle ve iki kişiyle. Uygulanmadı.

## S.7 Fotoğraf erişimi

- İzin süresi **5 dakika** (`PHOTO_ACCESS_TTL_MS`). Belge/PDF izin modeliyle aynı yapıdır.
- İzin şunlara bağlıdır: oturum, kullanıcı (yeni: GET'te kullanıcı da eşleşmeli), şirket, kayıt ve amaç (görüntüleme). Başka bir dosya türüyle eşleşmez (birim testi).
- **POST** `/api/photo-access`:
  - CSRF ve Origin koruması;
  - okuma yetkisi ve şirket/şube kapsamı denetlenir;
  - **bir** `photo.access_granted` kaydı yazılır. Ekranda "Fotoğraf erişim izni verildi" olarak okunur, "incelendi" denmez.
- **GET:**
  - izin ister, güncel okuma yetkisini ve kapsamı yeniden denetler;
  - `no-store` başlığıyla döner;
  - denetim kaydı yazmaz (testte üç GET sonrası kayıt sayısı aynı kaldı).
- İzin geçersiz olur:
  - süre dolunca (birim testinde tam 5. dakikada reddedilir);
  - oturum kapanınca;
  - yetki kaldırılınca (GET güncel yetkiyi istediği için eski izin işe yaramaz).
- Başka şirketin fotoğrafı: 404. URL'de jeton veya gizli bilgi yoktur.
- Arayüz izin dolunca, sayfa açık ve görünürse yeni izin ister. Her yeni izin bir kayıt daha yazar; geçerli izin yeniden kullanılınca kayıt yazılmaz.
- Eski fotoğraflar değiştirilmedi, yeniden sıkıştırılmadı, silinmedi (dosya deposu parmak izi önce/sonra aynı).

## S.8 Onarım taşıması kanıtları

- Taşıyıcı adı ve dış sevk/iş emri referansı oluşturmada zorunludur ve sonradan değiştirilemez.
- **Yeni:** taşıyıcı bilgisi eksik bir onarım taşıması **yola çıkamaz** (API 409 `TRANSPORT_EVIDENCE_MISSING` + veritabanı tetikleyicisi, migration 0046). Bu, kuraldan önce açılmış bir kaydı da kapsar. Main'de onarım taşıması yoktu.
- Yöntem, bağlı hasar dosyası, yetkili kullanıcı, zaman ve çıkış beyanı kaydedilir.
- Normal transferle kullanılamaz araç gönderme yasağı korunur.
- Taşıma tamamlanınca hasar engeli kendiliğinden kalkmaz.
- Taşıyıcı bilgisi ekranda "(beyan, doğrulanmadı)" olarak görünür.

## S.9 Son API test sayısı

**534 / 534** geçti, 38 dosya. Main üzerinde ana veritabanı geçişinden sonra çalıştırıldı.

5 yeni regresyon testi:
1. izin bağı ve 5 dakikalık süre (birim);
2. API'de 5 dakika ve GET'in kayıt yazmaması;
3. hasar dört göz: yetki iptali, şube kapsamı, başka şirket, eşzamanlı onay, diğer tutmalar;
4. FN5 yarışı;
5. kanıtsız eski onarım taşımasının çıkışı.

FN5 (B) testi, talebin geçersiz sayılmasını da doğrulayacak şekilde genişletildi.

Not: main'deki ilk tam çalıştırmada iki test düştü:
- Finans performans testi süre eşiğine takıldı (makine yükü). Tek başına geçti.
- Yukarıda düzeltilen zaman damgası testi.

Düzeltmeden sonra tam çalıştırma 534/534.

## S.10 Son tarayıcı test sayısı

**134 / 134** geçti (36 atlanan test yalnız `SCREENSHOTS=1` ile çalışan ekran görüntüsü testleri). Main üzerinde, ana veritabanı geçişinden sonra çalıştırıldı; süre 10,9 dakika.

Önceki iki tam çalıştırmada her birinde farklı bir test ortam kaynaklı nedenle düştü:
- dalda: mobil fiyat ekranı boş sayfa açtı (Vite'ın ilk yüklemesi);
- main'de: fiyat/sözleşme testinde sayfa içi istek ağ düzeyinde kesildi ("Failed to fetch").

İkisi de tek başına yeniden çalıştırıldığında geçti. Üçüncü tam çalıştırma hatasız tamamlandı.

Sunucu sağlık kontrolü: main sunucuları yeniden başlatıldıktan sonra API (3001) ve web (5173) yanıt veriyor (bkz. S.19).

Görsel kontroller 1440, 768 ve 390 genişlikte yenilendi (30 görüntü, `apps/e2e/screenshots/oh1/`) ve incelendi; yatay taşma yok.

## S.11 TypeScript ve derleme

4 projede (web, api, e2e, shared) TypeScript hatasız. Web üretim derlemesi başarılı. 500 kB üstü parça uyarısı önceden de vardı.

## S.12 RLS ve RBAC denetimi

- `safe-migrate --verify`:
  - ana veritabanı: 47/47 migration, 78 tablo, 74'ü RLS'li; RLS'siz 4 tablo bilinen genel tablolar;
  - test veritabanı: 47/47.

  Sorun yok.
- Önce/sonra güvenlik anlık görüntüsü (ana veritabanı):
  - kaldırılan politika ve yetki yok;
  - yalnız 3 yeni tablonun 12 politikası ve 9 yetkisi eklendi (SELECT, INSERT, UPDATE; **DELETE yok**);
  - mevcut tabloların RLS durumu değişmedi;
  - `acarvo_app` ve `acarvo_owner` rol özellikleri aynı.
- Hazır roller: yalnız iki şirketin **Sahip** rolüne `readiness.read` eklendi. Yönetici ve Operasyon değişmedi. Main'de özel rol yok.

## S.13 Migration dosyaları

| Dosya | İçerik | Yıkıcı işlem |
|---|---|---|
| `0043_readiness.sql` | 2 sütun (boş), 3 yeni tablo, bileşik şirket yabancı anahtarları, taşıyıcı CHECK | Yok |
| `0044_readiness_guards.sql` | RLS, korumalar, `files_kind_check` genişletmesi, silme yasağı | Yok (yeniden eklenen kısıt eskinin üst kümesi) |
| `0045_readiness_event_kinds.sql` | olay türü kısıtları genişletildi | Yok (eskinin üst kümesi) |
| `0046_repair_departure_evidence.sql` | onarım taşımasında çıkış kanıtı tetikleyicisi | Yok |

Ek kontroller:
- Boş SQL dosyası yok.
- Uygulanmış eski migration'lar değişmedi; doğrulama özet uyuşmazlığı bildirmedi.
- Snapshot zinciri ve journal tutarlı.
- Test veritabanı kayıtları dosyalarla eşleşiyor.
- Eski kayıtları değiştiren SQL yok.

## S.14 Main'e birleştirme sonucu

- `git merge --ff-only operasyon-hazirlik-v1`: başarılı. İki adımda yapıldı: önce `b3f3386`, ardından zaman damgası düzeltmesi `4366f22` ve bu rapor.
- Force, reset veya rebase kullanılmadı.
- Dal ve `acarvo-oh1` worktree korunuyor.
- Push yapılmadı.

## S.15 Son main commit'i

Bu raporun commit'i (main'in en son commit'i). Kod: `4366f22`.

## S.16 Ana veritabanı migration sayısı

**47** (43 + 4).

## S.17 Doğrulanmış yedek klasörü

`C:\Users\soena\Desktop\acarvo\backups\2026-10-17-00-24-03`. Döküm satır sayıları canlı sayılarla karşılaştırıldı; yedek doğrulandıktan sonra migration uygulandı.

## S.18 Mevcut gerçek verilerin korunması

Önce/sonra salt okunur parmak izi alındı: 71 şirket tablosu, her şirket için ayrı ayrı ve RLS bağlamında; ayrıca kullanıcılar, şirketler ve dosya deposu. Farklar **yalnız** şunlar:

- migration sayısı 43 → 47;
- iki şirkette Sahip rolü (+1 izin);
- iki şirkette +1 `role.preset_upgrade` denetim kaydı (Drina 30 → 31, Neretva 30 → 31);
- 3 yeni boş tablo.

Şunlar birebir aynı:
- araçlar (Drina 23, Neretva 4);
- tek gerçek rezervasyon;
- müşteriler, kurumsal hesaplar, fiyat ve sözleşme kayıtları;
- km ve konum geçmişi;
- dosyalar ve belgeler;
- kullanıcılar ve şirketler;
- diğer bütün denetim kayıtları;
- dosya deposu (adet, boyut, ad özeti).

Main'de finans, bakım, hasar ve transfer kaydı yoktu; bu yüzden etkilenen kayıt da yok. Ana veritabanına sentetik veri eklenmedi, otomatik test ana veritabanında çalışmadı. Gerçek kullanıcı hesabıyla test yapılmadı.

## S.19 Dashboard ekran adresi

`http://localhost:5173/` (Ana Ekran). Şube seçimiyle: `/?sube=<şube>`.

## S.20 Operasyonel Hazırlık ekran adresi

`http://localhost:5173/ayarlar/hazirlik` (yalnız Sahip). Ayarlar sayfasından da bağlantısı var.

## S.21 Açık kalan ürün ve teknik riskler

- **Drina'da ikinci yetkili yok:** hasar engeli kaldırma ve finans ikinci onayları ikinci bir uygun kişi atanana kadar yapılamaz (bilinçli karar).
- FN5 (B), yani hareketli dosyada düzeltme süreci, ayrı ürün kararı bekliyor.
- Fotoğraf ve belge izinleri sunucu belleğinde tutulur. Yeniden başlatmada biter; birden çok sunucu örneğinde ortak depo gerekir.
- Açık bir fotoğraf sayfası her 5 dakikada yeni izin isterse her izin bir geçmiş kaydı yazar. Bu dürüst ama kalabalık bir geçmiş üretebilir.
- Ana Ekran 60 saniyede bir yenilenir; canlı akış değildir. Listeler en fazla 12 satır gösterir.
- Aralıklı test zamanlamaları: makine yükünde finans performans testi ve Vite'ın ilk yüklemesindeki bir mobil test. Tek başına çalıştırınca geçiyorlar.
- Taşıyıcı referansı beyandır; ACARVO doğrulamaz.

## S.22 Gerçek işletme öncesi eksik koşullar

1. Drina'ya ikinci uygun yetkili (ör. Yönetici) atanması. ACARVO kendiliğinden yetki vermez.
2. Şube ülkeleri. Main'deki şubelerde ülke tanımlı değil; teslim bu yüzden kapalı.
3. Kiralama çalışma modu (dış sözleşme/fiyat) kararı.
4. Etkin fiyat listesi ve vergi oranı. Oran tahmin edilmez.
5. Sözleşme şablonu ve ACARVO dışında hukuki inceleme.
6. Ülke belge kuralları.
7. M2 müşteri belgesi şifreleme anahtarları. Yetkili kişi oluşturur; ACARVO üretmez.
8. ClamAV zararlı dosya tarayıcısı. Üretimde yükleme bu olmadan kapalı kalır.
9. Birden çok sunucu örneği planlanıyorsa izinler için ortak depo.
10. Yedeklerin düzenli alınması ve dışarıda saklanması.
