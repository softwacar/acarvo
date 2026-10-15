# Bakım + Hasar + Araç Transferi V1 — Plan

Dal: `operasyon-bht-v1` (çalışma ağacı `C:\Users\soena\Desktop\acarvo-bht1`, başlangıç `ceace28`).
Testler yalnız `acarvo_test` üzerinde ve sentetik verilerle çalışır. Ana veritabanına migration uygulanmaz, main'e birleştirme yapılmaz.

Dayanak:
- Spec bölümleri: §13.3 Sekme 2 (Müsaitlik & Planlama), Sekme 5 (Bakım & Lastikler), Sekme 6 (Belgeler & Riskler), §59N (Hazırlık), §59R (Araç transfer operasyonu), Kiralama 360° "Hasar / Ceza".
- Raporlar: TEKNIK_UYGULAMA, KIRALAMA_TESLIM_IADE (§3.1 ortak araç tahsisi), REZERVASYON, FINANS.

## 1. Temel karar: tek uygunluk motoru

Uygunluk için ayrı bir motor yazılmaz. Bugünkü yapı genişletilir:
- `vehicle_allocation_lock(company, vehicle)`: araç başına tek işlem kilidi.
- `vehicle_busy(...)`: "aracı bu aralıkta ne tutuyor" sorusunun tek tanımı.

Yeni kayıt türleri (bakım, hasar engeli, transfer) aynı fonksiyona eklenir. Bütün yazma yolları (API ve veritabanı tetikleyicileri) aynı kilidi ve aynı fonksiyonu kullanır.

### 1.1 `vehicle_busy` türleri

| tür | aracı tutan durum | aralık |
|---|---|---|
| `reservation` | onaylı | [alış, iade) — değişmedi |
| `rental` | hazırlandı / teslim / iade / kapandı | `rental_occupancy` — değişmedi (K2) |
| `maintenance` | `planned` | [planlanan başlangıç, planlanan bitiş) |
| `maintenance` | `in_service`, `awaiting_check` | [gerçek başlangıç, planlanan bitiş); planlanan bitiş geçtiyse açık uçlu |
| `maintenance` | `completed` | [gerçek başlangıç, tamamlanma) — geçmiş |
| `damage` | hasar engeli açık | [engel başlangıcı, engel bitişi); açık engel açık uçludur |
| `transfer` | `approved` | [planlanan çıkış, planlanan varış) |
| `transfer` | `in_transit` | [gerçek çıkış, planlanan varış); planlanan varış geçtiyse açık uçlu |
| `transfer` | `completed` | [gerçek çıkış, gerçek varış) — geçmiş |

Aracı tutmayan durumlar:
- `maintenance`: `pending_approval` ve `cancelled`;
- `transfer`: `requested` ve `cancelled`;
- `reservation`: `pending`.

Açık uçlu tutuş, kiralamadaki K2 kuralının aynısıdır: gecikmiş bakım veya transfer aracı müsait göstermez.

Fonksiyon imzası:
- `vehicle_busy` 8 parametreli olur: hariç tutulan rezervasyon, kiralama, bakım ve transfer.
- Eski 6 parametreli sürüm aynı fonksiyonu çağıran ince bir sarmalayıcı olarak kalır. Mevcut çağrılar değişmeden çalışır.
- Sütunlar aynı kalır: `kind`, `ref_id`, `ref_no`, `status`, `starts_at`, `ends_at`. Yalnız yeni `kind` değerleri gelir.

### 1.2 Hangi kayıt neyi engeller (çakışma matrisi)

| yeni bağlılık → / mevcut tutuş ↓ | rezervasyon onayı | kiralama hazırlama / teslim / uzatma | bakım planı (`planned`) ve bakıma alma | transfer onayı / çıkışı |
|---|---|---|---|---|
| onaylı rezervasyon | engeller | engeller | engeller | engeller |
| kiralama | engeller | engeller | engeller | engeller |
| bakım tutuşu | engeller | engeller | engeller | engeller |
| hasar engeli | engeller | engeller | **engellemez** (onarım için bakım gerekir) | **engellemez** (onarım şubesine taşıma); uyarı gösterilir |
| transfer tutuşu | engeller | engeller | engeller | engeller |

- Veritabanı tetikleyicileri bu matrisi uygular ve her durumda ayrı bir kısıt adıyla hata verir (örneğin `reservations_vehicle_maintenance`, `rentals_vehicle_damage`, `maintenance_vehicle_reserved`, `transfers_vehicle_rented`). API bu adları Türkçe hata mesajlarına çevirir.
- Değişmemiş mevcut bağlılıklar yeniden denetlenmez. Bu bugünkü kuralın aynısıdır. Sonuç olarak yeni bir hasar engeli mevcut onaylı rezervasyonları iptal etmez, geçersiz de kılmaz. Bu rezervasyonlar "risk altında" diye gösterilir. Teslim yine engellenir, çünkü teslim durumu değiştirir ve yeniden denetlenir.

### 1.3 Konum sürekliliği (transfer ↔ rezervasyon/kiralama)

Bir transfer, sonraki onaylı bir bağlılığı sessizce imkânsız kılamaz:
- Transfer onaylanırken veya çıkışı yapılırken, aracın planlanan varıştan sonraki ilk onaylı rezervasyonuna veya hazırlanan kiralamasına bakılır. Bunun alış şubesi varış şubesi değilse transfer reddedilir (`transfers_next_commitment_branch`).
- Tersi de aynı kurala bağlıdır: rezervasyon onaylanırken veya kiralama hazırlanırken, alıştan önceki son onaylı ya da yoldaki transferin varış şubesi alış şubesi değilse kayıt reddedilir (`reservations_vehicle_transfer_location`, `rentals_vehicle_transfer_location`).

Bu kurallar yalnız transfer varken devreye girer. Bugünkü rezervasyon ve kiralama davranışı değişmez.

Hiçbir rezervasyon otomatik iptal edilmez.

### 1.4 Eşzamanlılık

- Her yeni yazma yolu, kontrolden önce `vehicle_allocation_lock` alır. Bu yollar: bakım planla, onayla, bakıma al; hasar engeli; transfer onayla ve çıkış.
- Aynı kilit veritabanı tetikleyicisinde de alınır. Böylece API'yi atlayan doğrudan bir SQL yazımı bile aynı sırayla bekler.
- Km ve konum yazımı mevcut `lock_vehicle_history` kilidiyle sıralanır.

## 2. Bakım

### 2.1 Veri modeli

`maintenance_records` tablosu:
- Kimlik ve bağlam: şirket bazında `B-000001` numarası, araç, sorumlu şube, tür (`periodic`, `repair`, `tire`, `inspection`, `other`), neden.
- Bağlantılar: bağlı hasar dosyası (isteğe bağlı), servis sağlayıcı adı.
- Zamanlar: planlanan başlangıç ve bitiş (şube saat dilimi), gerçek başlangıç, iş bitişi (`work_done_at`), tamamlanma.
- Durum: `pending_approval`, `planned`, `in_service`, `awaiting_check`, `completed`, `cancelled`.
- Km: başlangıç km, tamamlanma km; ikisinin de km geçmişindeki okuma bağlantısı.
- Konum: servise gidiş ve dönüş konum olayı bağlantıları.
- İş: yapılan işler, parçalar (serbest metin), notlar.
- Kişiler ve iptal: personel alanları, iptal nedeni.
- Teknik: `version`, `client_request_id`.

`maintenance_events` tablosu yalnız ekleme alır (append-only). Her durum değişikliği burada tutulur.

`maintenance_photos`, fotoğrafları mevcut `files` tablosuna bağlar. `files.kind` değerine `maintenance_photo` eklenir.

`maintenance_schedules` tablosu araç başına bir kayıttır: km aralığı ve/veya ay aralığı. Bunlar uyarıdır; engel değildir.

### 2.2 Kurallar

- **Planlama ≠ servise alma.**
  - Plan oluşturulurken çakışma yoksa durum `planned` olur ve aracı planlanan aralıkta tutar.
  - Çakışma varsa API 409 döner ve çakışan kayıtları listeler. Kullanıcı açıkça isterse plan **`pending_approval`** olarak kaydedilir. Bu durum aracı tutmaz ve çakışma nedenleri görünür kalır.
  - Bakım onayı (`maintenance.approve`) `pending_approval` kaydını `planned` yapar. Onay anında çakışma yeniden denetlenir.
- **Bakıma alma:** `planned` veya `pending_approval` durumundan `in_service` durumuna geçilir.
  - Gerçek başlangıç zamanı geçmişe en fazla 72 saat girilebilir, gelecek olamaz. DST kuralları kiralamadakiyle aynıdır.
  - Aktif kiralama, yoldaki transfer, onaylı rezervasyon veya başka bir bakım çakışırsa reddedilir.
  - İsteğe bağlı başlangıç km'si atomik olarak km geçmişine yazılır.
  - "Servis sağlayıcıda" seçilirse `service_provider` konum olayı yazılır.
- **İş bitti:** `in_service` → `awaiting_check`. Araç hâlâ tutulur.
- **Tamamla:** `awaiting_check` → `completed`.
  - `maintenance.approve` yetkisi gerekir.
  - Tamamlanma km'si zorunludur. Başlangıç km'sinden düşük olamaz ve km geçmişine atomik yazılır.
  - Araç servis sağlayıcıdaysa dönüş şubesi zorunludur ve `branch` konum olayı yazılır.
  - Tamamlanan kayıt değişmez.
- **Tamamlanma ≠ teslime hazır.** Teslim kapıları ayrı kalır (kontrol, fotoğraf, belge). Bakım sonrası henüz teslim kontrolü yapılmamışsa teslim masasında "Bakım sonrası kontrol" dikkat maddesi gösterilir.
- **İptal:** yalnız `pending_approval` veya `planned` durumunda, gerekçeyle.
- Silme yoktur.

### 2.3 Periyodik bakım

Periyodik bakım yalnız gerçek kayıtlardan hesaplanır:
- son tamamlanan `periodic` bakımın tarihi ve km'si;
- aracın geçerli km'si (km geçmişinin son etkin okuması);
- araç bakım planı.

Sonuç `ok`, `due_soon` veya `overdue` olur. Kayıt yoksa "Henüz bakım kaydı yok" yazılır ve sahte bir tarih gösterilmez. Bu sonuç uyarıdır, hiçbir işlemi engellemez.

## 3. Hasar

### 3.1 Veri modeli

`damage_files` tablosu:
- Kimlik: şirket bazında `H-000001` numarası, araç, şube (tespit yeri).
- Kaynak bağlantıları (isteğe bağlı): kiralama, kontrol (teslim veya iade), kaynak işaret (`rental_damage_marks`).
- Tespit: tespit zamanı, konum açıklaması.
- Araç üzerindeki yer: görünüm (ön, arka, sol, sağ, üst, iç) ve alan metni.
- Nitelik: açıklama, tür (`scratch`, `dent`, `crack`, `glass`, `tire`, `mechanical`, `interior`, `missing_part`, `other`), ağırlık (`minor`, `moderate`, `severe`), kullanılabilirlik (`usable`, `restricted`, `not_usable`).
- İnceleme durumu: `reported`, `under_review`, `assessed`, `closed`.
- Onarım durumu: `not_needed`, `pending`, `in_repair`, `repaired`.
- Onarım bakımı bağlantısı, personel alanları, `version`, `client_request_id`.

Diğer tablolar:
- `damage_blocks`: hasar engeli dönemleri (başlangıç, kim, neden; bitiş, kim, neden).
- `damage_events`: yalnız ekleme alır.
- `damage_photos`: `files` tablosuna bağlanır (`damage_photo`).

### 3.2 Kurallar

- **Bulgu ≠ sorumluluk.** Kayıtta kusur, ücret, sigorta talebi, depozito kesintisi veya borç alanı yoktur. Arayüz bunu açıkça yazar.
- **Kaynak işarete bağlantı:**
  - Bağlantı mevcut teslim veya iade işaretine yapılır. İşaret ve kontrol kayıtları değiştirilmez.
  - Aynı işaretten ikinci dosya açılamaz: `(company_id, source_mark_id)` alanında kısmi tekil indeks vardır.
  - İşaret yalnız kesinleşmiş bir kontrole ait olabilir. Kontrol kiralamaya, kiralama araca ait olmalıdır. Bu tutarlılık veritabanında denetlenir.
- **Engel:**
  - Dosya `not_usable` kullanılabilirlikle açılırsa engel aynı işlemde başlar.
  - Sonradan da engel konabilir (`damage.report`).
  - Engeli kaldırmak `damage.unblock` yetkisi ve gerekçe ister; işlem geçmişe yazılır.
  - Engel kalksa da bakım veya transfer tutuşu sürerse araç yine müsait değildir, çünkü her tutuş ayrıdır.
- Hafif hasar (`usable` / `restricted`) hiçbir rezervasyonu iptal etmez ve engel koymaz. Teslim masasında yalnız "açık hasar dosyası" dikkat maddesi çıkar.
- Onarım için bakım kaydı açılabilir (tür `repair`, bağlı hasar dosyası). Onarım durumu elle güncellenir. Bakım tamamlanınca "onarıldı" otomatik işaretlenmez; bunu personel karar verir.
- Silme yoktur. Kapatılan dosya yeniden açılmaz; yeni bulgu için yeni dosya açılır.

## 4. Araç transferi

### 4.1 Veri modeli

`vehicle_transfers` tablosu:
- Kimlik: şirket bazında `T-000001` numarası, araç.
- Güzergâh: çıkış şubesi, varış şubesi.
- Kişiler: talep eden, onaylayan, teslim eden (çıkış), teslim alan (varış).
- Zamanlar: planlanan çıkış ve varış (iki şubenin kendi saat dilimiyle), gerçek çıkış ve varış.
- Durum: `requested`, `approved`, `in_transit`, `completed`, `cancelled`.
- Km: çıkış km ve varış km; ikisinin de okuma ve konum olayı bağlantıları.
- Diğer: neden, sürücü/personel notu, teslim notları, iptal nedeni, `version`, `client_request_id`.

`transfer_events` tablosu yalnız ekleme alır.

### 4.2 Kurallar

- **Akış:** talep → onay → çıkış (yolda) → varışta teslim alma (= tamamlanma).
  - İptal yalnız `requested` veya `approved` durumunda, gerekçeyle yapılır. Çıkıştan sonra iptal yoktur. Gecikme gerçek bir durumdur ve açık uçlu tutuş olarak görünür.
- **Yolda ≠ varmış:**
  - Çıkışta `in_transit` konum olayı ve çıkış km'si atomik olarak yazılır. Varış şubesi o anda konum olarak yazılmaz.
  - Varışta `branch` (varış şubesi) konum olayı ve varış km'si atomik olarak yazılır. Varış km'si çıkış km'sinden küçük olamaz; bu hem veritabanında hem km geçmişi kuralıyla denetlenir.
- Ana şube (`home_branch_id`) değişmez (spec §59R).
- Aktif kiralamadaki, bakımdaki veya başka transferdeki araç transfer edilemez. Gerekçe matristedir.
- Transfer sırasında yeni kiralama, rezervasyon onayı veya teslim yapılamaz.
- **Şube kapsamı:**
  - Talep, onay, çıkış ve iptal çıkış şubesinin işidir. Teslim alma varış şubesinin işidir.
  - Yalnız çıkış şubesine yetkili kullanıcı varış adına teslim alamaz. Bu kural API'de ve şube kontrolünde uygulanır.
  - Şubeler aynı şirkete ait olmalıdır (bileşik FK). Çıkış ve varış şubesi aynı olamaz.
- **Rezervasyon çakışması:** transfer onaylı rezervasyonları sessizce geçersiz kılmaz. Kural §1.3'tedir. Ret gerekçesi rezervasyon numarasıyla verilir; rezervasyon otomatik iptal edilmez.

## 5. Km, konum ve saat

- Kaynak listeleri genişletilir:
  - km olay ve kaynak türleri: `maintenance_start`, `maintenance_end`, `transfer_departure`, `transfer_arrival`;
  - konum olay ve kaynak türleri: aynı adlar.
- Yeni kaynak tetikleyicisi şunları denetler:
  - olay türü ile kaynak türü aynıdır;
  - kaynak, aynı aracın uygun durumdaki bakım veya transfer kaydıdır;
  - transfer çıkışı `in_transit`, varışı `branch` (varış şubesi) olur;
  - bakım gidişi `service_provider` olur.
- Km kuralları bugünkü guard'ın aynısıdır: kronoloji, büyük artış gerekçesi (`LARGE_JUMP_REASON_REQUIRED`) ve gelecek zaman yasağı. Düzeltmeler mevcut düzeltme akışıyla yapılır; bu kaynaklar "Konum ve geçmiş" ekranında düzeltilemez, bunu mevcut kural zaten sağlıyor.
- Planlanan zamanlar şubenin duvar saatiyle girilir:
  - yaşanmamış saat reddedilir;
  - iki kez yaşanan saatte seçim zorunludur.
  Kiralamadaki `resolveLocal` ve `actualTime` ortak bir yardımcıya (`lib/branch-time.ts`) taşınır. Kiralama davranışı değişmez.

## 6. Yetkiler ve hazır roller (ön ayar sürüm 11)

Yeni yetkiler:
- `maintenance.read`, `maintenance.manage`, `maintenance.approve`;
- `damage.read`, `damage.report`, `damage.review`, `damage.unblock`;
- `transfers.read`, `transfers.request`, `transfers.approve`, `transfers.execute`.

Rollere dağılım:
- **Sahip / Yönetici:** hepsi.
- **Operasyon:** okuma yetkileri ile `maintenance.manage`, `damage.report`, `transfers.request`, `transfers.execute`. Onay, inceleme ve engel kaldırma yoktur.

Yükseltme yalnız değiştirilmemiş hazır rollere uygulanır (mevcut mekanizma). Özel roller değişmez.

## 7. Güvenlik

- Yeni tablolarda zorunlu RLS ve 4 politika bulunur. Şirket içi bütün FK'ler bileşiktir `(company_id, id)`.
- Silme yoktur: çalışma zamanı rolüne DELETE yetkisi verilmez ve ayrıca silme tetikleyicisi vardır. Olay tabloları yalnız SELECT ve INSERT alır.
- Kimlik alanları değişmez: araç, numara, şubeler, kaynak bağlantıları, oluşturan kişi. Tamamlanan veya kapanan kayıt değişmez.
- Fotoğraflar mevcut güvenli dosya yolunu izler:
  - içerik doğrulanır;
  - yeniden kodlanır ve meta veri temizlenir;
  - tarayıcıdan geçer (yapılandırılmamışsa üretimde yükleme kapalıdır; sahte ClamAV yok);
  - özel depoda tutulur (`maintenance/…`, `damages/…` önekleri);
  - yetki ve şube kontrolüyle akıtılır; önbellek yoktur.
- İşlem geçmişine (audit) kişisel veri yazılmaz.

## 8. Finans sınırı

Bu modüller fatura, borç, depozito kesintisi, sigorta talebi, otomatik tazminat veya finans kalemi oluşturmaz. Finans V1 tetikleyicileri ve korumaları değişmez.

Bakım maliyeti V1'de tutulmaz. Spec "kaynak bağlantılı maliyet tek kez" ister; bu, Masraflar modülüyle birlikte ele alınır.

FN5 (yanlış ödeme sorumlusu) için yalnız güvenli bir tasarım önerisi raporda yer alır. Finans kayıtlarına dokunulmaz.

## 9. Arayüz

- **Bakım & Servis** (`/bakim-servis`): liste ile arama, filtre, sıralama ve sayfalama; oluşturma; ayrıntı ve işlemler; geçmiş.
- **Hasar Kayıtları** (`/hasar-kayitlari`): liste, oluşturma (kiralamadan ön dolu bağlantıyla), ayrıntı, engel ve kaldırma, fotoğraflar, geçmiş.
- **Araç Transferleri:** Operasyon grubuna eklenir. Spec §59R ayrı bir transfer operasyonu tarif eder; sidebar'da yeri yoktur, bu yüzden bağlantı "Bakım & Servis" altında değil, Araçlar modülünün içinde `/araclar/transferler` olarak açılır. Liste, talep, ayrıntı ve teslim alma ekranı bulunur.
- **Araç 360°:**
  - Genel bakışta "Şu an": müsaitlik engelleri ve nedenleri.
  - Müsaitlik sekmesi: bakım, hasar ve transfer blokları.
  - Bakım sekmesi: kayıtlar ve periyodik bakım.
  - Belgeler ve riskler sekmesi: hasar dosyaları.
  - Transferler ve konum. V5 tasarım dili korunur.
- **Kiralama 360° Hasar sekmesi:** iade bulguları ve bağlı dosyalar; işaretten "Hasar dosyası aç".

## 10. Testler

- **API:** yaşam döngüleri, çakışma matrisi, konum sürekliliği, km ve konum atomikliği, DST, kapsam, yetki, RLS ve izolasyon.
- **Eşzamanlılık:** aynı araç için paralel olarak:
  - rezervasyon onayı ↔ bakım planı;
  - kiralama teslimi ↔ hasar engeli;
  - transfer çıkışı ↔ kiralama teslimi;
  - transfer onayı ↔ rezervasyon onayı;
  - bakıma alma ↔ teslim;
  - iki varışta teslim alma.
- **Performans:** binlerce kayıtla liste ve `vehicle_busy`.
- **Tarayıcı:** liste, oluşturma ve ayrıntı akışları; erişilebilirlik (axe); telefon görünümü; 1440 / 768 / 390 ekran görüntüleri.

Mevcut 480 API ve 118 tarayıcı testi korunur.

## 11. Migration'lar (yalnız test veritabanı)

- `0037_operations`: tablolar (drizzle-kit).
- `0038_operations_rls`: RLS, guard'lar, `vehicle_busy` genişlemesi, değiştirilen rezervasyon ve kiralama araç guard'ları, km ve konum kaynak listeleri, dosya türleri, sıra türleri, yetkiler (GRANT).

Mevcut migration dosyaları değiştirilmez.
