# ACARVO — Teknik uygulama dokümanı

Bu doküman ACARVO'nun gerçek uygulamasının (frontend + backend + veritabanı) teknik kararlarını tanımlar.
Ürün ve UI/UX gereksinimlerinin tek otoritesi `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` dosyasıdır ve değiştirilmez.
Spesifikasyondaki "backend yok / demo state" ifadeleri konsept aşamasına aittir; gerçek uygulamada iş kuralları
burada tanımlanan backend'de uygulanır. Bir çelişkide ürün davranışı için spesifikasyon, teknik uygulama için bu doküman geçerlidir.

Görsel referans: `C:\Users\soena\Desktop\acarvo-arac360\` (Araç 360° V5). Önceki reddedilmiş tasarımlar kullanılmaz.

---

## 1. Geliştirme yaklaşımı

- Modül modül ilerlenir. Her modül arayüz + API + veritabanı + doğrulama + test ile birlikte tamamlanır.
- Henüz geliştirilmemiş modüller menüde görünür ama "henüz geliştirilmedi" olarak açıkça işaretlenir; uydurma veri gösterilmez.
- Prototiplerdeki örnek veriler (ör. "Emina Hadžić kirada") gerçek kayıt gibi gösterilmez. Gerçek uygulama yalnızca veritabanındaki kayıtları gösterir; geliştirme ortamındaki örnek veriler seed betiğiyle veritabanına yazılır ve arayüzde "Geliştirme verisi" ortam etiketi görünür.
- Gerçek ödeme, banka, e-posta/SMS veya harici servis entegrasyonu bu aşamada yoktur.

## 2. Teknoloji seçimleri

| Alan | Seçim | Gerekçe |
|---|---|---|
| Depo | npm workspaces monorepo | Ek araç gerektirmez; frontend, backend ve ortak paket tek yerde |
| Frontend | Vite, React 19, TypeScript | V5 prototipiyle aynı temel |
| UI | shadcn/ui (Radix), Tailwind v4, Phosphor ikonları, Outfit yazı tipi | V5 tasarım dili; bileşen kodu depoda |
| Yönlendirme | TanStack Router | Filtre/sekme durumu adreste, geri/ileri çalışır |
| Sunucu verisi | TanStack Query | Önbellek, yükleniyor/hata durumları |
| Formlar | react-hook-form + zod | Doğrulama şemaları backend ile ortak |
| Backend | Fastify 5, TypeScript | Hafif, olgun, resmi güvenlik eklentileri var |
| Veritabanı | PostgreSQL 18 | RLS ile veritabanı düzeyinde şirket izolasyonu |
| ORM / migration | Drizzle ORM, drizzle-kit | Tip güvenli, SQL'e yakın; migration'lar okunabilir SQL; RLS politikaları migration içinde |
| Doğrulama | zod (`packages/shared`) | Tek şema: API girişi, form, TypeScript tipi |
| Parola özeti | `@node-rs/argon2` (Argon2id) | OWASP önerisi, olgun native kütüphane |
| Güvenlik eklentileri | `@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/multipart` | Fastify ekibinin bakımını yaptığı resmi eklentiler |
| Dosya türü doğrulama | `file-type` | Uzantıya değil dosyanın gerçek içeriğine bakar |
| Test | Vitest (API, gerçek test veritabanı), Playwright (uçtan uca, ekran görüntüsü) | Gerçek veritabanı davranışı test edilir |
| Ortam ayarları | `.env` (Git dışı) + `.env.example`, açılışta zod ile doğrulama | Gizli bilgi kaynak koda girmez |

## 3. Klasör yapısı

```
acarvo/
  ACARVO_GLOBAL_WEB_UI_V1_SPEC.md      ürün spesifikasyonu (değişmez)
  docs/TEKNIK_UYGULAMA.md              bu doküman
  design/  web/                        mevcut tasarım notları ve ilk prototip (arşiv, silinmez)
  apps/
    api/
      src/
        app.ts  server.ts  env.ts
        db/        bağlantı havuzları, şema, tenant işlem yardımcıları
        plugins/   auth, csrf, rate limit, hata yönetimi
        modules/   auth/, companies/, vehicles/ ...
      migrations/  drizzle-kit SQL migration'ları (RLS politikaları dahil)
      seed/        geliştirme verisi
      tests/
    web/
      src/ routes/  features/  components/ui/  lib/
  packages/
    shared/        zod şemaları, yetki anahtarları, ortak tipler
  scripts/         yerel kurulum betikleri (parola sormak için etkileşimli)
  storage/         yerel dosya deposu (Git dışı)
  .env.example  .gitignore  package.json
```

## 4. Veri modeli: kullanıcı, şirket ve üyelik

Kullanıcı hesabı ile şirket üyeliği ayrıdır; bir kullanıcı birden fazla şirkete üye olabilir.

| Tablo | Kapsam | Açıklama |
|---|---|---|
| `users` | global | Kişi hesabı: e-posta (benzersiz, küçük harf), parola özeti, ad, durum, son giriş. Şirket bilgisi yok |
| `companies` | global | Kiracı (tenant): ad, ülke, saat dilimi, varsayılan para birimi, durum |
| `memberships` | şirket | `user_id` + `company_id` (benzersiz çift), durum (aktif / askıda / davet), katılma tarihi |
| `roles` | şirket | Şirkete özel roller; `permissions text[]` (ör. `vehicles.read`) |
| `membership_roles` | şirket | Üyeliğe rol atanması |
| `branches` | şirket | Şubeler: ad, kod, saat dilimi, durum |
| `membership_branches` | şirket | Üyeliğin erişebildiği şubeler (boşsa ve rol izin veriyorsa tüm şubeler) |
| `sessions` | global | Oturum: token özeti, kullanıcı, aktif şirket, oluşturma, son kullanım, mutlak bitiş, iptal zamanı, IP/tarayıcı özeti |
| `audit_log` | şirket | Kim, ne zaman, hangi kayıt, işlem, önce/sonra özeti (hassas alanlar hariç) |

- Etkin yetki = üyeliğin rollerindeki yetkilerin birleşimi; şube kapsamı `membership_branches` ile daraltılır. Yetki her API ucunda sunucuda kontrol edilir. Frontend aynı listeyi yalnızca menü ve düğmeleri göstermek için kullanır.
- Kullanıcı birden fazla şirkete üyeyse girişten sonra şirket seçer; aktif şirket oturumda tutulur. Şirket değiştirme üyelik sunucuda doğrulanarak yapılır.

## 5. Şirket izolasyonu (PostgreSQL RLS)

### 5.1 Veritabanı rolleri
| Rol | Yetki | Kullanım |
|---|---|---|
| `postgres` (süper kullanıcı) | Kurulumda kullanıcı tarafından parolası belirlenir | Yalnız ilk kurulum betiği; uygulama kullanmaz |
| `acarvo_owner` | Tabloların sahibi, `NOSUPERUSER NOBYPASSRLS` | Yalnız migration ve seed |
| `acarvo_app` | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, tablo sahibi değil; yalnız gerekli tablolarda `SELECT/INSERT/UPDATE/DELETE` | API çalışma zamanı bağlantısı |

Parolalar kurulum betiğinde rastgele üretilir ve yalnız yerel `.env` dosyasına yazılır.

### 5.2 Şirket bağlamı
- Her API isteği şirket verisine yalnız `withTenant(companyId, userId, fn)` yardımcısıyla erişir. Yardımcı bir transaction açar ve ilk komut olarak
  `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)` çalıştırır. Üçüncü parametre `true` olduğu için değer **yalnız o transaction içinde** geçerlidir; bağlantı havuza döndüğünde sızmaz.
- `companyId` istemciden alınmaz, sunucudaki oturumdan okunur.
- Bağlam ayarlanmamışsa `current_setting('app.company_id', true)` boş döner ve politikalar hiçbir satır göstermez (güvenli varsayılan).

### 5.3 Politikalar
- Şirket verisi tutan her tabloda `ENABLE ROW LEVEL SECURITY` ve `FORCE ROW LEVEL SECURITY`.
- Her tabloda dört ayrı politika: `SELECT` (`USING`), `INSERT` (`WITH CHECK`), `UPDATE` (`USING` + `WITH CHECK`), `DELETE` (`USING`); koşul `company_id = nullif(current_setting('app.company_id', true), '')::uuid`.
- `memberships` için ek okuma politikası: `user_id = app.user_id` (kullanıcı kendi üyeliklerini görebilir, şirket seçimi için).
- Global tablolar (`users`, `companies`, `sessions`) şirket verisi tutmaz; `acarvo_app` bunlarda yalnız gerekli sütunlara ve işlemlere yetkilidir.

### 5.4 Şirketler arası ilişki kısıtları
- Şirket tablolarında `UNIQUE (company_id, id)`.
- Şirket içi yabancı anahtarlar bileşik kurulur: ör. `vehicles (company_id, home_branch_id) REFERENCES branches (company_id, id)`. Böylece bir araç başka şirketin şubesine bağlanamaz; aynı kural fotoğraf, belge, km ve konum kayıtlarında da uygulanır.
- Plaka benzersizliği şirket içinde: `UNIQUE (company_id, plate_normalized)`.

### 5.5 Testler
İki şirketle (Drina Rent a Car, Neretva Rent) otomatik testler:
- A şirketinin oturumu B'nin aracını listeleyemez, okuyamaz, güncelleyemez, silemez (API 404).
- `company_id` gövdeye elle yazılsa da yok sayılır.
- Bağlam ayarlanmamış transaction'da şirket tablosu sorgusu 0 satır döner.
- B şirketinin şubesine bağlı araç eklemek veritabanı kısıtıyla reddedilir.
- `acarvo_app` rolünün süper kullanıcı, BYPASSRLS veya tablo sahibi olmadığı doğrulanır.

## 6. Kimlik doğrulama ve oturum

- **Parola:** Argon2id (`@node-rs/argon2`, OWASP parametreleri). Parola en az 12 karakter.
- **Oturum token'ı:** 256 bit rastgele değer (`crypto.randomBytes`); veritabanında yalnız SHA-256 özeti saklanır. Token sızan bir veritabanından oturum çalınamaz.
- **Çerez:** `__Host-acarvo_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, alan adı yok. Geliştirmede Vite, `/api` isteklerini API'ye vekil olarak iletir; tarayıcı için tek kaynak (same-origin) çalışılır.
- **CSRF:** `@fastify/csrf-protection` (çerez tabanlı gizli değer). Frontend token'ı `GET /api/auth/csrf` ile alır ve durum değiştiren her istekte `x-csrf-token` başlığıyla gönderir. Ayrıca `Origin` başlığı izinli kaynak listesiyle karşılaştırılır.
- **Giriş denemesi sınırı:** `@fastify/rate-limit`; giriş ucunda IP + e-posta başına 15 dakikada 5 deneme, aşılırsa 429. Hatalı girişlerde kullanıcı var/yok ayrımı yapılmaz.
- **Süre:** Boşta kalma süresi 8 saat (her istekte kaydırılır), mutlak süre 7 gün.
- **İptal:** Çıkış oturumu iptal eder; "tüm oturumları kapat"; parola değişimi ve üyeliğin askıya alınması ilgili oturumları iptal eder. İptal edilen oturum bir sonraki istekte geçersizdir.
- **Başlıklar:** `@fastify/helmet` ile güvenlik başlıkları.
- Platform yöneticisi ve Partner Portal bu aşamada yoktur.

## 7. Dosyalar (araç fotoğrafları ve belgeler)

- Geliştirmede yerel disk: `storage/<company_id>/<yıl>/<uuid>`; klasör Git dışındadır ve web sunucusundan doğrudan servis edilmez.
- Dosya kaydı veritabanında (`files`: company_id, sahip kaydı, tür, gerçek MIME, boyut, SHA-256, yükleyen, tarih) RLS ile korunur.
- İndirme yalnız `GET /api/files/:id` ucu üzerinden: oturum + yetki + RLS kontrolünden geçen kayıt okunur, sonra dosya akıtılır. Başka şirketin dosya kimliği 404 döner.
- Sınırlar: fotoğraf JPEG/PNG/WebP, en fazla 10 MB; belge PDF/JPEG/PNG, en fazla 20 MB. Tür, `file-type` ile içerikten doğrulanır; uzantıya güvenilmez. Dosya adları kullanıcıdan alınmaz, UUID kullanılır.
- Teslim kontrolü fotoğrafları değiştirilemez kanıttır (üzerine yazma yok, yalnız yeni kayıt). Tanıtım fotoğrafı araç başına en fazla 1 aktiftir.
- Depolama bir arayüz arkasındadır; üretimde S3 uyumlu servise geçiş bu arayüz değiştirilerek yapılır.

## 8. Araçlar modülü (1. modül) veri modeli

- `vehicle_classes` (şirket): ad, sıra.
- `vehicles` (şirket): plaka, normalize plaka, araç kodu, marka, model, donanım, model yılı, sınıf, kasa, yakıt, vites, koltuk, renk, şasi no, kaynak (`own` / `external`), edinim türü ve tarihi, ana şube, kullanım durumu (`active` / `out_of_service` / `disposed`), notlar, `version` (iyimser kilit), oluşturma/güncelleme bilgisi.
- `odometer_readings` (şirket): araç, km, olay türü, kaynak kayıt, zaman, giren kişi. Güncel km bu kayıtlardan türetilir; araç tablosunda elle düzenlenebilir km alanı yoktur. Yeni okuma bir öncekinden düşük olamaz (düzeltme ayrı, gerekçeli kayıt).
- `vehicle_location_events` (şirket): araç, konum türü (şube / yolda / serviste / müşteride / tedarikçide), şube, açıklama, zaman, kaynak.
- `vehicle_documents` (şirket): tür (muayene, trafik sigortası, kasko, ruhsat, diğer), referans no, başlangıç, bitiş, dosya.
- `vehicle_photos` (şirket): araç, dosya, tür (`profile` / `inspection`), açı, kaynak kayıt.

### 8.1 Birinci parça (uygulandı): liste, ekleme, düzenleme

- Tablolar: `vehicle_classes`, `vehicles`, `odometer_readings`, `vehicle_location_events` (migration 0002–0003). Hepsinde RLS zorunlu ve 4 politika var; araç sınıfı, ana şube ve olay kayıtları şirket içi bileşik yabancı anahtarlarla bağlıdır.
- Plaka şirket içinde tekildir (`plate_normalized`: büyük harf, yalnız harf ve rakam); araç kodu da şirket içinde tekildir (büyük/küçük harf duyarsız). Başka şirketteki aynı plaka serbesttir.
- `version` ile iyimser kilit: güncelleme satırı kilitler, sürüm uyuşmazsa 409 ve güncel kayıt döner. Arayüz farkları gösterir; kullanıcı güncel kaydı yükler veya bilerek üzerine yazar.
- Uygulama rolü araç silemez; kilometre ve konum tabloları yalnız eklenebilir (UPDATE/DELETE yetkisi yok). Güncel kilometre ve son konum en son olaydan türetilir; düzenleme formundan değiştirilmez.
- Şube yetkisi: şubeyle sınırlı kullanıcı yalnız ana şubesi kendi şubelerinden olan araçları listeler, açar, ekler ve düzenler; aracı yetkisi olmayan şubeye taşıyamaz.
- Kullanım durumu formda yalnız `Aktif` / `Hizmet dışı`. `Satıldı` / `Filodan çıktı` §59BM'deki ayrı, gerekçeli işlemle gelecek.
- Dış kaynak (tedarikçi) aracı, Araç Tedarikçileri ve tedarik dönemi modülüyle birlikte eklenecek; şimdilik yalnız kendi filo kaydı açılır.
- Oluşturma ve düzenleme `audit_log`'a yazılır (düzenlemede değişen alanların önceki/sonraki değeri).
- Sonraki parçalar: belgeler, tanıtım fotoğrafı, kilometre/konum düzeltme kayıtları, filodan çıkış.

### 8.2 Araç 360° — ilk, salt okunur sürüm (uygulandı)

Spec §13.3'e göre ayrım:

| Bölüm | Bu sürümde | Sonra |
|---|---|---|
| Üst bölüm | Plaka, araç kodu, marka/model/donanım/yıl/sınıf, kaynak, kullanım durumu, sürüm; bilgi şeridi: konum, kilometre, ana şube, filoya giriş, belgeler, son değişiklik; kaydırınca beliren kompakt durum çubuğu | Müsaitlik, hazırlık, aktif kiralama, sıradaki teslim, anahtar, yakıt (ilgili modüllerden) |
| Fotoğraf alanı | Tanıtım fotoğrafı için boş durum; teslim/iade kanıt fotoğraflarının ayrı olduğu açıklaması | Tanıtım fotoğrafı yükleme (en fazla 1 aktif); kanıt fotoğrafları kiralama kontrolleriyle |
| Hızlı işlemler | Aracı düzenle; diğer işlemler menüde “yakında” olarak, nedeniyle | Rezervasyon, kiralama, bakım, hasar, ceza, transfer, belge |
| 1 Genel bakış | Araç bilgileri, filoya giriş, son kayıtlar (km/konum olayları), notlar, bağlı kayıtlar listesi | Şu an / sıradaki / aksiyon gerektiriyor / kullanım özeti |
| 2–5, 7 | Dürüst “henüz bağlı değil” paneli ve sekmeye ne geleceği | Müsaitlik, kiralama geçmişi, durum ve kontroller, bakım ve lastikler, finans |
| 6 Belgeler ve riskler | Standart belge türleri “yüklenmedi”; açık riskler bağlı değil | Belge yükleme, süre takibi, hasar/ceza/olay bağlantıları |
| 8 Konum ve geçmiş | Kilometre geçmişi, konum geçmişi, kayıt (denetim) geçmişi — değişen alanların eski/yeni değeri | Düzeltme ve transfer kayıtları, tedarik dönemi geçmişi, filodan çıkış |

### 8.3 Tanıtım fotoğrafları (uygulandı)

- Kullanıcı kararı: araç başına en fazla **6 tanıtım fotoğrafı**, biri **ana fotoğraf**. Spec §13.1/§59X'teki “en fazla 1 aktif profil fotoğrafı” ana fotoğrafla karşılanır; diğerleri aynı tanıtım galerisinin parçasıdır.
- Tablolar: `files` (yalnız eklenir/silinir, değiştirilmez) ve `vehicle_promo_photos` (sıra 0–5, ertelenmiş tekil sıra kısıtı, araç başına tek ana fotoğraf için kısmi tekil indeks). İkisinde de RLS zorunlu. Teslim/iade kanıt fotoğrafları bu tabloları kullanmayacak; kendi değiştirilemez kayıtlarıyla gelecek.
- Doğrulama: dosya adı ve tarayıcının bildirdiği tür dikkate alınmaz; içerik `sharp` ile çözülür. Yalnız JPEG/PNG/WebP, en fazla 10 MB, en az 400×300 piksel, en fazla 60 MP; SVG, GIF ve çok sayfalı görseller reddedilir.
- Temizlik: kamera yönü uygulanır, görsel WebP olarak yeniden kodlanır (ana: en uzun kenar 2400 px, küçük: 480×360). Yeniden kodlama EXIF, GPS, XMP ve yorumları tamamen siler.
- Depolama: `storage/<company_id>/<yıl>/<uuid>.webp` (Git dışı, `STORAGE_DIR` ile değiştirilebilir). Sunucu dışında hiçbir adresten erişilemez; `GET /api/files/:id` oturum, `vehicles.read`, RLS ve aracın şube kapsamını her istekte kontrol ederek akıtır. Önbellek: `Cache-Control: private, no-store, max-age=0` (ETag/304 yok); başlık belirtilmemiş diğer tüm `/api` yanıtları da `no-store`. Tarayıcının geri/ileri önbelleğinden dönen sayfa yeniden yüklenir; böylece çıkış veya şirket değişikliğinden sonra eski görseller gösterilmez.
- Atıf: üçüncü taraf fotoğraflarda (ör. CC BY-SA) `attribution` alanı yazar, kaynak bağlantısı, lisans ve yapılan değişikliği tutar; galeride ve büyütme görünümünde seçili fotoğrafın altında gösterilir. Şirketin kendi fotoğraflarında boştur. Atıf girişi için arayüz henüz yok; geliştirme verisindeki Wikimedia Commons fotoğraflarının atfı doğrulanarak kaydedildi.
- İşlemler (`vehicles.photos.manage`): yükleme, sıralama, ana fotoğraf seçimi, kaldırma. Araç satırı kilitlenerek 6 sınırı yarış koşulunda da korunur. Ana fotoğraf kaldırılırsa ilk sıradaki ana olur. Her işlem `audit_log`'a yazılır ve Araç 360° kayıt geçmişinde görünür.

API: `GET /api/vehicles/:id/history` (vehicles.read) ve `GET /api/vehicles/:id/activity` (audit.read). İkisi de önce aracın şirket ve şube kapsamında görünür olduğunu doğrular; değilse 404. Sekme adres çubuğunda (`?sekme=`) tutulur.

### 8.4 Araç belgeleri — uygulama planı (onaylı, henüz uygulanmadı)

Kaynak: spec §59C (türler, alanlar, 30/15/7 gün uyarıları), §13.3 Sekme 6, §33 (Belge Merkezi ikinci depo değildir; belgenin asıl kaydı sahibinin altında kalır), §59F.4 (şirket tanımlı türler), §59D (readiness), §9 (kiralama dosyası belge sürümünü sabitler). Kullanıcı kararları: şirket bazlı zorunluluk, dosyasız kayıt, ayrı görüntüleme yetkisi, görüntüleme/indirme kaydı.

#### 8.4.1 Veri modeli

- `document_types` (global, RLS yok, uygulamaya yalnız SELECT): sistem türleri — `registration` Ruhsat (süresiz), `inspection` Muayene, `liability_insurance` Trafik sigortası, `comprehensive_insurance` Kasko / diğer poliçe, `roadside_assistance` Yol yardım, `other` Diğer. Alanlar: kod, ad, geçerlilik tarihi gerekli mi, sıra. Şirket verisi değildir.
- `company_document_type_settings` (şirket, RLS): şirketin bir tür için ayarı — zorunlu mu, uyarı günü. **Satır yoksa varsayılan: zorunlu değil, uyarı 30 gün.** Hiçbir türün hiçbir ülkede zorunlu olduğu varsayılmaz. Şirkete özel tür ekleme ve ayar ekranı Yönetim → Ayarlar ile gelecek.
- `vehicle_documents` (şirket, RLS): bir belge dönemi. Araç, tür, numara, düzenleyen kurum, düzenlenme tarihi, geçerlilik başlangıcı, son geçerlilik (dahil), not, `record_state` (`draft` / `active` / `voided`), `renews_id` (yenilediği önceki dönem, aynı şirket ve araç), geçersiz sayma gerekçesi/kişisi/zamanı, sürüm (iyimser kilit), oluşturan/değiştiren. Uygulama rolüne **DELETE yetkisi verilmez**; fiziksel silme yoktur.
- `vehicle_document_files` (şirket, RLS): değiştirilemez dosya sürümleri — belge, sürüm no (belge içinde tekil), depolama kaydı, yükleyen, tarih. Uygulama rolüne yalnız SELECT/INSERT.
- `document_files` (şirket, RLS): belge dosyalarının depolama kaydı (anahtar, gerçek tür, boyut, SHA-256, sayfa sayısı, temizlenmiş görünen ad). Tanıtım fotoğraflarının `files` tablosundan ayrıdır; o tabloya dokunulmaz. Yalnız SELECT/INSERT.
- Kısıtlar: bileşik şirket içi yabancı anahtarlar; `valid_from ≤ valid_until`; `active` kayıtta geçerlilik tarihi gereken türde `valid_until` dolu (veritabanı kontrolü + API doğrulaması); aynı dönemin iki kez yenilenememesi için `renews_id` üzerinde kısmi tekil indeks (geçersiz sayılmamış kayıtlar için).

#### 8.4.2 Yenileme (konu 1)

- Yenileme **önceki dönemi değiştirmez**. Yeni kayıt kendi tarihleriyle oluşturulur ve `renews_id` ile öncekine bağlanır; önceki dönem `active` kalır ve kendi son geçerlilik tarihine kadar geçerli sayılır. “Güncel belge” hangi kaydın bugünü kapsadığına göre **tarihten** hesaplanır; “yenilendi” bilgisi bir durum alanı olarak yazılmaz. Böylece gelecekte başlayacak yeni poliçe, bugün geçerli olan eskisini erken geçersiz kılamaz.
- Atomiklik: yenileme tek veritabanı işlemidir — önceki kayıt `FOR UPDATE` ile kilitlenir, aktif ve aynı araçta olduğu doğrulanır, yeni kayıt ve işlem geçmişi yazılır. Aynı dönemin eşzamanlı ikinci yenilemesi kısmi tekil indeksle reddedilir (409). Dosya, işlem tamamlandıktan sonra yeni kayda ayrı sürüm olarak yüklenir; dosya yüklemesi başarısız olsa bile önceki dönem ve yeni kaydın bilgileri bozulmaz (yeni kayıt “Dosya yok” uyarısıyla kalır).
- Tarihsel kayıtlar: önceki dönemler, tüm dosya sürümleri ve geçersiz sayılan kayıtlar silinmez ve değiştirilmez. Dosya sürümleri hiçbir koşulda güncellenmez. Bilgi düzeltmeleri (yanlış tarih/numara) yalnız `active`/`draft` kayıtta, sürüm kontrolüyle ve eski/yeni değer işlem geçmişine yazılarak yapılır. İleride bir kiralama belge sürümünü sabitlediğinde o kayıt kilitlenecek (`locked_at`), düzeltme yerine yeni dönem gerekecek; şema buna hazır tasarlanır.

#### 8.4.3 Durum hesaplama (konu 2)

Tek bir saf fonksiyonda (`packages/shared`) tanımlanır, API kullanır, arayüz yalnız gösterir. `T` = şirket saat diliminde bugünün tarihi; son geçerlilik günü dahildir.

Tek belge için (öncelik sırasıyla):

| Durum | Koşul | Geçerlilik sayılır mı |
|---|---|---|
| Geçersiz sayıldı | `record_state = voided` | Hayır, yalnız geçmişte görünür |
| Taslak | `record_state = draft` (eksik alanla kaydedildi veya henüz etkinleştirilmedi) | Hayır |
| — Tarih eksik | Taslağın etkinleşememe nedeni: geçerlilik tarihi gereken türde son tarih yok | Hayır |
| Henüz başlamadı | `active`, `T < valid_from` | Hayır (gelecek dönem) |
| Süresi dolmuş | `active`, son tarih var, `T > valid_until` | Hayır |
| Yaklaşıyor (n gün) | `active`, kalan gün ≤ uyarı günü (varsayılan 30; ≤7 kritik vurgu) | Evet |
| Geçerli | `active`, aralık içinde (süresiz türde başlangıç geçmişse) | Evet |

- **Dosya yok** ayrı bir uyarıdır; yukarıdaki durumu değiştirmez (ör. “Geçerli · Dosya yok”).
- Taslak etkinleştirme: geçerlilik tarihi gereken türde son tarih ve tutarlı tarih aralığı zorunlu. Dosya zorunlu değildir (dosyasız kayıt kararı).

Araç × tür özeti (Belgeler tablosundaki satır):
- **Güncel** = bugünü kapsayan `active` kayıtlar arasında son geçerlilik tarihi en geç olan. **Sıradaki** = başlangıcı ileride olan en erken `active` kayıt.
- Güncel varsa durum ondan gelir. Güncel “Yaklaşıyor” ise ve sıradaki kayıt güncelin bitişinin ertesi günü veya öncesinde başlıyorsa satır **“Geçerli · yenisi DD.MM’de başlıyor”** gösterir ve uyarı seviyesi düşer. Arada boşluk varsa **“Yaklaşıyor · yenisiyle arasında n gün boşluk”** uyarısı verilir.
- Güncel yoksa: sıradaki varsa “Henüz başlamadı (DD.MM)” ve tür zorunluysa ek olarak “Şu an geçerli belge yok” uyarısı; yalnız süresi dolmuş kayıt varsa “Süresi dolmuş”; yalnız taslak varsa “Taslak” (zorunluysa “Eksik · taslak var”); hiç kayıt yoksa zorunluysa **Eksik**, değilse **Kayıt yok** (nötr).
- Aynı fonksiyon araç düzeyinde özet üretir (360 bilgi şeridi, Genel bakış). Testler her satırı ve gün sınırını (son gün, ertesi gün, saat dilimi) kapsar.

#### 8.4.4 Dosya güvenliği (konu 3)

- Kabul: PDF (en fazla 20 MB, 50 sayfa), JPEG/PNG (en fazla 10 MB, 60 MP). Tür içerikten doğrulanır; uzantı ve tarayıcı türü yok sayılır.
- Görseller yeniden kodlanır (EXIF/GPS silinir; okunabilirlik için JPEG/PNG kalır).
- PDF içerik doğrulaması: kütüphaneyle yapı açılır; şifreli/parola korumalı, JavaScript, otomatik işlem (`OpenAction`/`AA` ile JS), `Launch`, gömülü dosya, XFA ve zengin medya içerenler reddedilir. Sunucu PDF'i işlemez/görüntüye çevirmez.
- **Zararlı dosya taraması — üretim koşulu:** yükleme akışında bir tarayıcı arayüzü (`scanFile`) bulunur; dosya yalnız “temiz” sonucundan sonra depoya yazılır. Ayar: `MALWARE_SCANNER=none|clamav`.
  - `NODE_ENV=production` iken tarayıcı `none` ise veya erişilemiyorsa belge yükleme uçları **503** döner (“Belge yükleme kapalı: zararlı dosya taraması yapılandırılmamış”); uygulama açılışta bunu günlüğe yazar. Kapalı varsayılan (fail-closed) uygulanır; mevcut belgelerin görüntülenmesi etkilenmez.
  - Tarama “zararlı” derse 422, tarayıcı yanıt vermezse 503; iki durumda da hiçbir şey kaydedilmez.
  - **Yerel geliştirme sınırlaması:** bu makinede antivirüs motoru yok; geliştirmede `MALWARE_SCANNER=none` ile yükleme açıktır ve dosyalar yalnız içerik doğrulamasından geçer. Bu durum arayüzde yalnız geliştirme ortamında küçük bir notla belirtilir. Üretime geçişte ClamAV (veya eşdeğeri) kurulumu zorunludur.
  - Testler: üretim + `none` → 503; sahte tarayıcı “zararlı” → 422 ve depoda dosya yok; “erişilemiyor” → 503.
- Depolama: mevcut özel depolama modülü, ayrı önek `storage/documents/<şirket>/<yıl>/<uuid>`; herkese açık adres yok.
- Sunum: `GET /api/document-files/:id` her istekte oturum → `vehicles.documents.read` → RLS → aracın şube kapsamı; değilse 404 (oturumsuz 401). Başlıklar: `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`, görüntülemede `Content-Security-Policy: sandbox`, indirmede `Content-Disposition: attachment` ve sunucunun ürettiği güvenli ad (ör. `A12-K-345_trafik-sigortasi_2027-03-14.pdf`). Tarayıcı PDF görüntüleyicisi bu başlıklarla çalışmazsa PDF yalnız indirme olarak sunulur. Her görüntüleme/indirme işlem geçmişine yazılır.

#### 8.4.5 Veri bütünlüğü (konu 4)

- **Migration yalnız ekler:** yeni tabloları, RLS'i, kısıtları, yetkileri ve global `document_types` satırlarını oluşturur. Mevcut şirket, rol, araç, fotoğraf veya dosya satırlarını **değiştirmez ve silmez**; mevcut tablolara sütun eklemez. Şirket ayarı satırı oluşturmaz (varsayılan “zorunlu değil”).
- **Yeni yetki** `vehicles.documents.read`: kod tarafında rol şablonlarına (yeni şirketler) eklenir. Mevcut rollere migration ile eklenmez; geliştirme verisinde seed betiği ekler, gerçek şirketlerde ileride Roller ve Yetkiler ekranından verilir.
- **Drina'nın örnek zorunlu belge ayarları** (ruhsat, muayene, trafik sigortası) yalnız geliştirme seed'inde oluşturulur: seed yalnız `NODE_ENV !== 'production'` iken ve yalnız geliştirme şirketleri (seed'in oluşturduğu adlar) için çalışır, yalnız ekleme yapar, mevcut ayar satırı varsa dokunmaz. Neretva için ayar oluşturulmaz. Testler kendi verisini `acarvo_test` üzerinde kurar.
- **Başarısız işlemler mevcut belgeyi bozmaz:**
  - Yükleme sırası: doğrulama ve tarama → depoya yazma → tek veritabanı işleminde dosya kaydı + sürüm satırı + işlem geçmişi. İşlem başarısız olursa depoya yazılan dosya silinir; belge kaydı, önceki sürümler ve güncel geçerli belge değişmeden kalır. Sürüm numarası belge satırı kilitlenerek verilir.
  - Yenileme tek işlemdir ve önceki dönemi değiştirmez (8.4.2); başarısız olursa hiçbir şey yazılmaz.
  - Geçersiz sayma yalnız seçilen kaydı etkiler, gerekçe ister, diğer dönemleri değiştirmez.
- Sıra: önce migration (ana ve test veritabanı), sonra API, en son arayüz.

#### 8.4.6 API, yetkiler, arayüz, testler

- Uçlar: `GET /api/document-types`; `GET /api/vehicles/:id/documents` (tür özeti + güncel/sıradaki); `GET …/documents/:docId` (detay, sürümler, önceki dönemler); `POST …/documents` (taslak veya aktif); `PUT …/:docId` (düzeltme, sürüm kontrolü); `POST …/:docId/activate`; `POST …/:docId/renew`; `POST …/:docId/void` (gerekçe); `POST …/:docId/files` (yeni sürüm); `GET /api/document-files/:id` (`?indir=1`).
- Yetkiler: görüntüleme `vehicles.documents.read`, değişiklik `vehicles.documents.manage`; hepsinde şube kapsamı ve CSRF.
- Arayüz: Araç 360° → Belgeler ve Riskler: V5 “Belgeler ve süreler” tablosu (tür başına satır, durum simge + metin, dosya bağlantıları, “⋯” menüsü), sağdan açılan ekleme/detay paneli, “Açık riskler” bağlı değil olarak kalır; bilgi şeridindeki “Belgeler” ve Genel bakış özeti gerçek veriden; 390 px'te tablo kart listesine döner.
- Testler: durum fonksiyonu tablosu ve gün sınırları; yenileme (gelecek dönem eskiyi geçersiz kılmaz, eşzamanlı yenileme 409, başarısız yükleme eskiyi bozmaz); PDF/görsel doğrulama ve zararlı içerik reddi; tarama koşulu (503/422); izolasyon (başka şirket/şube 404, oturumsuz 401, yetkisiz 403); `no-store`/`nosniff`; uygulama rolünün silme ve dosya güncelleme yapamaması; migration'ın mevcut satırları değiştirmediği (öncesi/sonrası sayım); işlem geçmişi.

#### 8.4.7 Kapsam

İlk sürüm: sistem türleri, taslak/aktif/geçersiz kayıtlar, yenileme, dosya sürümleri, güvenli görüntüleme/indirme, durum hesabı, 360 sekmesi ve özetleri, işlem geçmişi, tarama koşulu. Sonra: Ayarlar'da tür ve zorunluluk yönetimi, Belge Merkezi arama ekranı, Araçlar listesinde belge filtresi/uyarısı, ana ekran ve bildirim hatırlatmaları, readiness bağlantısı, kiralama dosyasına sürüm sabitleme (`locked_at`), dış kaynak/tedarikçi belgeleri, ClamAV kurulumu, PDF küçük resimleri, OCR, toplu yükleme.

Kiralama, rezervasyon, müsaitlik, bakım ve finans verileri ilgili modüller geliştirilince bağlanır. O zamana kadar Araç 360° bu bölümlerde açık bir "modül henüz geliştirilmedi" durumu gösterir; kirada/müsait durumu uydurulmaz.

## 9. API kuralları

- REST, JSON; tüm uçlar `/api` altında. Liste uçları sunucu tarafında arama, filtre, sıralama ve sayfalama yapar.
- Hata biçimi: `{ error: { code, message, fields? } }`; doğrulama 400, yetkisiz 401, yasak 403, bulunamadı 404, çakışma 409 (sürüm uyuşmazlığı veya mükerrer plaka), oran sınırı 429.
- Güncellemelerde `version` gönderilir; uyuşmazsa 409 ve güncel kayıt döner.
- Her değişiklik `audit_log`'a yazılır.

## 10. Git ve gizli bilgiler

- `.gitignore`: `.env*` (`.env.example` hariç), `node_modules`, `dist`, `storage/`, `*.log`, test çıktıları, Playwright raporları, `.playwright-mcp/`, yerel veritabanı dökümleri (`*.dump`, `*.sql.gz`, `pgdata/`), editör geçici dosyaları.
- Parolalar ve bağlantı bilgileri yalnız yerel `.env` dosyasındadır. Kurulum betiği gerekli parolaları kullanıcıya sorar (ekranda gösterilmez) veya rastgele üretir; hiçbir parola kaynak koda, loga veya sohbete yazılmaz.
- Mevcut prototipler ve tasarım dosyaları silinmez.

## 11. Aşamalar

1. **Temel altyapı:** monorepo, veritabanı rolleri, migration, RLS, giriş/oturum/CSRF/oran sınırı, şirket seçimi, uygulama kabuğu (7 kategori / 36 bağlantı), izolasyon testleri. Teslim: giriş yapılan çalışan uygulama + geçen testler.
2. **Araçlar ve Araç 360°:** liste, ekleme, düzenleme, detay (V5 tasarımı), belgeler, km ve konum geçmişi, tanıtım fotoğrafı yükleme, testler.
3. Sonraki modüller spesifikasyondaki öncelik sırasıyla (Rezervasyonlar, Kiralamalar, Finans ...).
