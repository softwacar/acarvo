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

### 8.4 Araç belgeleri — uygulama planı (onaylı, uygulandı 10.10.2026)

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
- Güncel varsa durum ondan gelir. Güncel “Yaklaşıyor” ise ve sıradaki kayıt güncelin bitişinin ertesi günü veya öncesinde başlıyorsa satır **“Geçerli · yenisi DD.MM.YYYY tarihinde başlıyor”** gösterir ve uyarı seviyesi düşer. Arada boşluk varsa **“Yaklaşıyor · yenisiyle arasında n gün boşluk”** uyarısı verilir.
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
- Sunum: `GET /api/document-files/:id` her istekte oturum → `vehicles.documents.read` → RLS → aracın şube kapsamı; değilse 404 (oturumsuz 401). Başlıklar: `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`, görüntülemede `Content-Security-Policy: sandbox`, indirmede `Content-Disposition: attachment` ve sunucunun ürettiği güvenli ad (ör. `A12-K-345_trafik-sigortasi_2027-03-14.pdf`). Chrome'da denendi: yerleşik PDF görüntüleyici `sandbox` başlığıyla PDF'i açıyor; bu yüzden görüntüleme açık bırakıldı (çalışmayan bir tarayıcıda “İndir” her zaman kullanılabilir). Her görüntüleme/indirme işlem geçmişine yazılır.

#### 8.4.5 Veri bütünlüğü (konu 4)

- **Migration yalnız ekler:** yeni tabloları, RLS'i, kısıtları, yetkileri ve global `document_types` satırlarını oluşturur. Mevcut şirket, rol, araç, fotoğraf veya dosya satırlarını **değiştirmez ve silmez**; mevcut tablolara sütun eklemez. Şirket ayarı satırı oluşturmaz (varsayılan “zorunlu değil”).
- **Yeni yetki** `vehicles.documents.read`: rol şablonlarına (Sahip, Yönetici, Operasyon) eklendi. Mevcut şirketlerdeki roller kullanıcı kararıyla tekrarlanabilir bir veri adımıyla yükseltilir (`src/db/role-upgrade.ts`, `npm run db:migrate` sonunda çalışır):
  - Bir rol yalnız adı bir şablonla aynıysa **ve** yetki kümesi o şablonun önceki bir sürümüyle (`ROLE_PRESET_HISTORY`) birebir aynıysa yükseltilir; yalnız eksik yetkiler eklenir, hiçbir yetki çıkarılmaz.
  - Elle değiştirilmiş şablon rolleri ve özel roller hiç değişmez; kullanıcılar, şirketler ve üyelikler değişmez.
  - Her şirket kendi RLS bağlamında, rol satırı kilitlenerek işlenir; her yükseltme `role.preset_upgrade` olarak işlem geçmişine yazılır. İkinci çalıştırma hiçbir şey yapmaz.
  - Ana veritabanında sonuç: iki şirketin 6 şablon rolüne yalnız `vehicles.documents.read` eklendi; tek fark işlem geçmişinde şirket başına 3 kayıt.
- **Yedek:** ana veritabanında migration'dan önce `node scripts/backup-db.mjs` çalıştırılır. Betik şema, global veri ve her şirket için kendi RLS bağlamında veri dökümü alır, satır sayılarını kaynakla karşılaştırarak doğrular ve özel depolamayı kopyalar; doğrulanmayan yedekle ana veritabanına migration uygulanmaz. Yedekler `backups/` altındadır (git dışı).
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

### 8.5 Araç kilometre ve konum yönetimi — uygulama planı (onaylı ve uygulandı 10.10.2026, kullanıcı kararlarıyla güncellendi)

Kaynak: spec §59CY (tek km gerçeği), §59CG (konum geçmişi, canlı GPS değil), §13.3 Sekme 8 (Konum & Geçmiş), §13.2 (bilgi şeridi: km ve fiziksel konum ayrı; "Km doğrulanmadı"), §59R (transfer ana şubeyi değiştirmez), §2 (şube bağlılığı ≠ fiziksel konum), §13.1 madde 3 (güncel değer serbest düzenlenmez; kaynak olay veya yetkili düzeltme). Mevcut mimari korunur: güncel km ve konum, yalnız ekleme yapılan olay tablolarından (`odometer_readings`, `vehicle_location_events`) **türetilir**; araç tablosunda düzenlenebilir km veya konum alanı açılmaz.

Kullanıcı kararları (10.10.2026): (1) şirket genelinde yetkili kullanıcı aracı herhangi bir şirket şubesinde kaydedebilir, şube sınırlı kullanıcı yalnız kendi şubelerine; bu kayıt transfer değildir ve transfer tamamlanmış gibi gösterilmez; (2) büyük km artışında ek onay **ve gerekçe**, API'de de zorunlu; (3) 48 saatten eski km girişinde açıklama zorunlu, geçmiş tarihli kayıt daha yeni doğru değeri güncel değer olarak değiştiremez; (4) **gösterge değişimi bu sürümde yok**, km'yi düşürecek her normal giriş engellenir, gösterge değişimi için ileride ayrı plan; (5) düzeltmeler gerekçeli yeni kayıt, düzeltilen kayıt yeniden düzeltilebilir (izlenebilir zincir); (6) eşzamanlı işlemler ve tekrarlanan gönderimler güvenli.

Mevcut durum (ana veritabanı, 10.10.2026, salt okuma sayımı): Drina'da 23 araç, 22 km okuması (bir aracın okuması yok → "Km doğrulanmadı"), 23 konum kaydı; Neretva'da 4 araç, 4 okuma, 4 konum. Kayıtların tümü araç oluşturulurken yazılan `initial` olaylarıdır. Uygulama rolünün bu tablolarda UPDATE/DELETE yetkisi yoktur ve böyle kalır.

#### 8.5.1 Kilometre kaydı

Veri modeli (yalnız ekleme):
- `odometer_readings` tablosuna **boş bırakılabilir yeni sütunlar** eklenir; mevcut satırlar değişmez: `source_type` (`vehicle_create`, `manual`, ileride `rental_handover`, `rental_return`, `vehicle_swap`, `maintenance`, `transfer_start`, `transfer_end`, `supplier_receive`, `supplier_return`), `source_id`, `client_request_id` (çift tıklama koruması; şirket içinde tekil), `jump_reason` (büyük artış gerekçesi). Kayıt zamanı mevcut `created_at`, olay zamanı mevcut `occurred_at` sütunudur; yeni zaman sütunu gerekmez. `event_type` izinli değerleri genişletilir: `initial`, `manual`, `correction` (kontrol kısıtı yeniden tanımlanır; mevcut değerler geçerli kalır). Mevcut `initial` satırlar `source_type` boş olduğunda “araç kaydı” olarak yorumlanır; veri güncellemesi yapılmaz.
- Yeni tablo `odometer_corrections` (şirket, RLS): düzeltilen okuma, eylem (`replace` = doğru değerle değiştir / `void` = hatalı say, yerine değer yok), **zorunlu gerekçe** (5–300 karakter), yapan, zaman, `client_request_id`. Düzeltilen okuma üzerinde **tekil** kısıt: bir okuma yalnız bir kez düzeltilir (eşzamanlı ikinci düzeltme 409). Sıra: önce düzeltme satırı yazılır (eski okuma geçerlilikten çıkar), `replace` ise ardından yerine geçen okuma `event_type = correction`, `source_type = correction`, `source_id = <düzeltme>` ve **eski okumanın olay zamanıyla** yazılır; böylece kronolojik kontrol eski okuma hesaba katılmadan yapılır. Yerine geçen okuma da gerekirse yeniden düzeltilebilir; zincir (ilk okuma → düzeltme → yeni okuma → düzeltme …) geçmişte izlenir.
- **Geçerli okuma** = düzeltme kaydı olmayan okuma. Güncel km = geçerli okumalar arasında olay zamanı en geç olan (eşitlikte kayıt zamanı). Bu kural tek bir saf fonksiyonda (`packages/shared`) ve aynı mantıkla veritabanı sorgusunda uygulanır; araç listesi, 360 bilgi şeridi ve Genel bakış aynı sonucu gösterir.

Giriş kuralları (API doğrular, veritabanı tetikleyicisi son güvencedir):
- Yetkili kullanıcı km, olay tarihi/saati (şirket saat diliminde girilir, `timestamptz` saklanır), açıklama girer. Kaynak manuel girişte `manual`; kullanıcı ve zaman sunucu tarafından yazılır, istemciden alınmaz.
- **Kronolojik tutarlılık:** yeni okuma, olay zamanındaki bir önceki geçerli okumadan düşük **ve** sonraki geçerli okumadan yüksek olamaz (`önceki ≤ km ≤ sonraki`). Böylece geçmiş tarihli bir giriş güncel km'yi düşüremez ve geçmişteki sırayı bozamaz (spec §59CY).
- **Gelecek tarih** reddedilir (sunucu saatine göre 5 dakika toleransla).
- **Geçmiş tarihli giriş:** izinli; 48 saatten eskiyse açıklama zorunlu ve kayıt “geç girildi” olarak işaretlenir (kayıt zamanı ile olay zamanı arasındaki fark görünür). Araç oluşturulmadan önceki bir tarihe giriş reddedilir.
- **Beklenmedik düşüş:** önceki geçerli okumadan düşük (veya sonraki geçerli okumadan yüksek) değer **hiçbir zaman kabul edilmez**; 422 `ODOMETER_OUT_OF_ORDER` döner ve çakışan okuma (km, tarih, giren) gösterilir. Tek meşru yol, önceki okuma hatalıysa onu gerekçeli düzeltmektir. **Gösterge değişimi bu sürümde yoktur**; yeni göstergenin değeri aracın gerçek toplam km'sinden farklı olabileceği için ileride ayrı planla ele alınacaktır.
- **Beklenmedik büyük artış:** engellenmez ama ek onay ve gerekçe ister: önceki geçerli okumadan bu yana günlük ortalama 1.500 km'yi (gün sayısı en az 1 alınır) veya tek seferde 20.000 km'yi aşan artışta form “Bu okuma bir öncekinden 25.400 km fazla” uyarısını ve gerekçe alanını gösterir. API aynı kontrolü yapar: gerekçe (`largeJumpReason`, 5–300 karakter) yoksa 422 `LARGE_JUMP_REASON_REQUIRED` döner; gerekçe `jump_reason` sütununda saklanır ve geçmişte görünür. Aynı kural düzeltmeyle girilen yeni değere de uygulanır. Eşikler sabit olarak başlar, ileride Ayarlar'a taşınabilir. Üst sınır mevcut kısıt (3.000.000 km).
- **Kaynağa bağlı okumalar** (ileride teslim/iade/bakım): bu ekrandan düzeltilmez; düzeltme kendi kaynağının akışıyla yapılır. V1'de tüm okumalar `initial`/`manual` olduğundan bu kural yalnız şemada hazırlanır.

Düzeltme kuralları:
- Yalnız `vehicles.history.correct` yetkisi; gerekçe zorunlu. Düzeltme, düzeltilen okumanın olay zamanını korur; zamanı yanlışsa okuma `void` edilip doğru zamanla yeni okuma girilir.
- `replace`: yeni değer, düzeltilen okumanın olay zamanında komşu geçerli okumalara göre aynı kronolojik kurala uyar (düzeltilen okuma hesaba katılmadan).
- `void`: okuma geçersiz sayılır. Sıralı bir diziden okuma çıkarmak sırayı bozmadığı için kalan geçmiş tutarlı kalır.
- Asıl okuma silinmez, değişmez; geçmişte üstü çizili görünür, yanında “Düzeltildi · gerekçe · kim · ne zaman” ve varsa yeni değer bulunur. Her düzeltme işlem geçmişine eski ve yeni değerle yazılır.

#### 8.5.2 Konum yönetimi

Veri modeli (yalnız ekleme):
- `vehicle_location_events` tablosuna boş bırakılabilir sütunlar: `source_type`, `source_id`, `reason` (değişiklik nedeni), `client_request_id`. `event_type` için izinli değerler kısıtla tanımlanır: `initial`, `manual`, `correction` (+ ileride kaynak olaylar). Mevcut satırlar (`initial`) değişmez.
- Yeni tablo `vehicle_location_corrections` (şirket, RLS): hatalı konum kaydı, eylem (`replace` / `void`), gerekçe, yapan, zaman, `client_request_id`; düzeltilen kayıt üzerinde tekil kısıt. Yerine geçen kayıt km'deki gibi düzeltmeye `source_id` ile bağlanır ve eski kaydın olay zamanını taşır; zincir izlenebilir.
- Güncel konum = düzeltilmemiş konum kayıtları arasında olay zamanı en geç olan. Önceki→sonraki geçişi bu sıradan türetilir; ayrıca saklanmaz.

Kurallar:
- **Ana şube ile fiziksel konum ayrıdır.** Konum değişikliği `vehicles.home_branch_id`'ye dokunmaz; ana şube yalnız araç düzenleme formundan (mevcut `vehicles.update` akışı, sürüm kontrolü ve işlem geçmişiyle) değişir. Arayüz ikisini her yerde ayrı etiketle gösterir (“Ana şube” / “Şu an bulunduğu yer”), ana şubede olmayan araçlar için “Ana şubesi dışında” notu düşer.
- Manuel girişte izinli konum türleri: **şubede** (şube seçilir) ve **serviste** (servis/yer adı zorunlu). **Yolda**, **müşteride** ve **tedarikçide** manuel seçilemez: bunlar ileride Transfer, teslim ve tedarikçi teslim alma olaylarından gelir; elle girilirse yarım kalmış bir transfer veya sahte kiralama durumu oluşurdu.
- **Bu kayıt transfer değildir.** Arayüzde ve geçmişte “Konum kaydı (elle)” olarak görünür; “transfer tamamlandı”, “teslim edildi” gibi bir ifade kullanılmaz. Formda “Ana şube değişmez; şubeler arası teslim ve transfer ileride Transfer modülünden yapılacak” notu yer alır.
- Değişiklik nedeni zorunlu (ör. “servise bırakıldı”, “sayımda farklı şubede bulundu”). Olay tarihi geçmiş olabilir; gelecek tarih reddedilir. Geçmiş tarihli kayıt yalnız en geç kayıt olursa güncel konumu değiştirir; arayüz kaydetmeden önce “Bu kayıt güncel konumu değiştirmeyecek; daha yeni bir konum kaydı var” bilgisini gösterir.
- Aynı konuma art arda giriş (ör. zaten Sarajevo Aerodrom'da iken yine Sarajevo Aerodrom) uyarıyla engellenir; yalnız açıklama ekleme amacı varsa kullanıcı not alanını kullanır.

#### 8.5.3 Yetkiler ve şube kapsamı

- Yeni yetkiler: `vehicles.odometer.record` (km okuması girme), `vehicles.location.record` (konum güncelleme), `vehicles.history.correct` (km/konum düzeltme; hassas). Görüntüleme mevcut `vehicles.read` ile.
- Şablonlar: Sahip ve Yönetici üçünü de alır; Operasyon kayıt yetkilerini alır, düzeltme yetkisini almaz. Mevcut şirketlerdeki **değiştirilmemiş** şablon rolleri, §8.4.5'teki aynı tekrarlanabilir yükseltme adımıyla (yeni `ROLE_PRESET_HISTORY` sürümü) güncellenir; özel ve elle değiştirilmiş roller, kullanıcılar ve şirketler değişmez.
- Şube kapsamı: araç, kullanıcının erişebildiği bir ana şubeye bağlı değilse tüm km/konum uçları **404** döner (varlığı sızdırılmaz). Konum hedefi bir şubeyse şube aynı şirkette ve aktif olmalıdır (bileşik yabancı anahtar + API kontrolü); başka şirketin şubesi seçilemez.
- **Hedef şube yetkisi (kullanıcı kararı):** şirket genelinde yetkili kullanıcı (Sahip/Yönetici, tüm şubeler) aracı herhangi bir aktif şirket şubesinde kaydedebilir. Şube sınırlı kullanıcı yalnız yetkili olduğu şubeleri hedef seçebilir; başka şube seçerse 403 `BRANCH_FORBIDDEN` döner ve arayüz şube listesinde yalnız izinli şubeleri gösterir. Düzeltmede de aynı kural yerine geçen kaydın şubesine ve düzeltilen kaydın şubesine uygulanır.
- Konum kaydı aracı hedef şube kullanıcılarına görünür yapmaz: görünürlük spec gereği ana şubeye (operasyonel/güvenlik şubesi) bağlı kalır. Gerçek şubeler arası teslim ve hedef şubenin karşılaması Transfer modülünde ele alınır.
- RLS: yeni tablolarda zorunlu RLS ve 4 politika; uygulama rolüne yalnız SELECT/INSERT. Şirket bağlamı her istekte `withCompany` ile kurulur.

#### 8.5.4 Eşzamanlılık, geçmiş tarih ve veri bütünlüğü

- **Araç başına sıraya alma:** her km/konum yazma işlemi tek veritabanı işleminde, araç kimliğinden türetilen işlem süreli kilitle (`pg_advisory_xact_lock`) sıraya alınır; veritabanı tetikleyicisi de aynı kilidi alır. İki kullanıcının aynı anda girdiği okumalar sırayla değerlendirilir, ikisi birden kronolojik kuralı delemez. Kilit araç kaydını kilitlemez; araç düzenlemeyi beklemeye almaz.
- **Bayat ekran koruması:** geçmiş yalnız eklendiği için kayıt sayısı geri gitmez; API her geçmiş yanıtında km ve konum için bir sürüm değeri (`okuma+düzeltme sayısı`) döner. Form bu değeri (`expectedVersion`) gönderir; bu arada başka bir kayıt veya düzeltme girildiyse 409 `HISTORY_CHANGED` döner ve güncel durum gösterilir (“Siz formu doldururken başka bir kayıt girildi”).
- **Çift tıklama:** istemci her gönderimde bir `clientRequestId` üretir; aynı kimlikle gelen ikinci istek yeni kayıt oluşturmaz, ilk sonucu döner.
- **Veritabanı tetikleyicileri** (API atlanırsa da geçerli): okuma eklemede kronolojik kural ve gelecek tarih; düzeltmede düzeltilen kaydın aynı araca ait olması; yerine geçen kaydın düzeltmeye ve eski olay zamanına bağlı olması; konum eklemede manuel türlerin sınırı ve şube zorunluluğu. Hata kodları API'de anlaşılır Türkçe iletilere çevrilir.
- **Silme/değiştirme yok:** olay ve düzeltme tablolarında UPDATE/DELETE yetkisi verilmez; düzeltme her zaman yeni satırdır. İşlem geçmişine (`audit_log`) her kayıt ve düzeltme yazılır.
- **Migration yalnız ekler:** yeni sütunlar boş bırakılabilir ve varsayılansızdır; yeni tablolar, kısıtlar, tetikleyiciler, RLS ve yetkiler eklenir. Mevcut araç, okuma ve konum satırları değişmez. `event_type` kontrol kısıtı genişletilirken mevcut değerlerin geçerli olduğu migration içinde doğrulanır.
- **Uygulama sırası** (belge modülündeki gibi): doğrulanmış yedek (`scripts/backup-db.mjs`; yedek doğrulanmazsa ana veritabanına migration uygulanmaz) → `acarvo_test` migration ve doğrulama → ana veritabanı migration + öncesi/sonrası sayım karşılaştırması → API → arayüz → testler ve tarayıcı kontrolü.

#### 8.5.5 Araç 360° entegrasyonu (Konum ve geçmiş sekmesi, V5 dili)

- Üstte iki panel: **Kilometre** (güncel değer, olay tarihi, kaynak, giren; okuma yoksa “Km doğrulanmadı”; “Kilometre gir” düğmesi) ve **Konum** (şu an bulunduğu yer, ne zamandan beri, neden; ayrı satırda ana şube; “Konumu güncelle” düğmesi). Düğmeler yalnız yetkisi olana görünür.
- **Kilometre geçmişi** tablosu: tarih, km, önceki okumaya göre fark, kaynak, giren, açıklama, “⋯” (Düzelt — yalnız düzeltme yetkisiyle). Düzeltilmiş satırlar üstü çizili ve gerekçeli; geç girilen kayıtlar “geç girildi”, büyük artışlar gerekçesiyle. 390 px'te kart listesine döner.
- **Konum geçmişi** zaman çizelgesi: önceki → sonraki konum, neden, kaynak, kim, ne zaman; düzeltilenler işaretli. “Canlı GPS değildir” açıklaması korunur.
- **İşlem geçmişi** mevcut haliyle kalır (değişen alanların eski/yeni değeri).
- Formlar belge modülündeki gibi sağdan açılan panelde: km formu önceki geçerli okumayı ve izinli aralığı gösterir, düşüş ve büyük artışı kaydetmeden önce açıklar; konum formu ana şubenin değişmeyeceğini açıkça yazar. Hatalar alan düzeyinde ve sade Türkçe.
- Bilgi şeridi, Genel bakış “Son kayıtlar” ve Araçlar listesi aynı türetilmiş değeri kullanmaya devam eder; araç düzenleme formunda km/konum alanı açılmaz.

#### 8.5.6 Gelecek modüllerle ilişki (bu aşamada geliştirilmez)

- **Kiralama teslim/iade:** teslimde `rental_handover`, iadede `rental_return` okuması ve konum olayı (teslimde “müşteride”, iadede iade şubesi) aynı işlemde, `source_type/source_id` ile yazılır; aynı kronolojik kurallar geçerlidir. Kaynağa bağlı okuma ancak kaynak akışından düzeltilir; fazla km ücreti bu okumalardan hesaplanır.
- **Araç değişimi (swap):** eski aracın iade ve yeni aracın teslim okumaları ayrı araçlara yazılır; bir aracın km'si diğerine taşınmaz.
- **Rezervasyon:** km/konum yazmaz; ileride beklenen konum projeksiyonu için yalnız okur.
- **Bakım:** servise bırakma konum olayı (“serviste”), bakım tamamlamada okuma; bakım ve lastik hatırlatmaları türetilmiş km'yi kullanır.
- **Transfer (§59R):** başlangıçta “yolda” konumu ve başlangıç okuması, varışta hedef şube konumu ve bitiş okuması; **ana şube değişmez**. Manuel “yolda” girişi Transfer modülü gelince bu akışa yönlendirilir.
- **Tedarikçi teslim alma/iade:** dış araçlarda “tedarikçide”/şube konumları ve muayene okumaları.
- **GPS:** V1 kapsamı dışında. İleride eklenirse ham konum verisi ayrı bir telemetri tablosunda tutulur ve yetkili konum geçmişinin yerine geçmez; yalnız öneri veya karşılaştırma olarak gösterilir.

#### 8.5.7 Test stratejisi

- **Mevcut 112 test korunur:** testler ayrı `acarvo_test` veritabanında çalışır; mevcut beklentiler değiştirilmez. Yalnız izolasyon testindeki RLS tablo listesine yeni tablolar eklenir. Araç oluşturma testleri, yeni sütunlar boş kaldığı için aynı sonucu vermelidir.
- **Saf fonksiyon testleri** (`packages/shared`): geçerli okumaların seçimi, güncel km, komşu okumalara göre izinli aralık, düzeltme zinciri, büyük artış eşiği, geç giriş işareti, güncel konum ve önceki→sonraki geçiş.
- **API testleri:**
  - km girişi, düşüşün reddi (önceki okuma bilgisiyle), geçmiş tarihli girişin komşular arasında kabulü ve sonrakini aşınca reddi, gelecek tarihin reddi, büyük artışta onay zorunluluğu
  - büyük artışta gerekçesiz isteğin API'de reddi (arayüz atlanmış olsa da), gerekçeyle kabulü ve saklanması
  - `replace` ve `void` düzeltmeleri, düzeltilen kaydın yeniden düzeltilmesi (zincir), aynı kaydın ikinci düzeltmesinin 409'u, düzeltme değerinin komşulara uymadığında reddi, düzeltme yetkisi
  - aynı anda iki okuma (biri 409 veya ikisi sırayla geçerli), bayat `expectedVersion` → 409, aynı `clientRequestId` → tek kayıt
  - konum: izinli türler, “yolda”/“müşteride”/“tedarikçide” manuel reddi, ana şubenin değişmediği, başka şirket şubesinin reddi, şube sınırlı kullanıcının yetkisiz şubeye kaydının 403'ü, şirket geneli kullanıcının başka şubeye kaydı, geçmiş tarihli konumun güncel konumu değiştirmemesi
  - izolasyon: Drina kullanıcısı → Neretva aracı 404; şube sınırlı kullanıcı → kapsam dışı araç 404; oturumsuz 401; CSRF 403; yetkisiz 403
  - veritabanı: uygulama rolünün UPDATE/DELETE yapamaması; tetikleyicinin doğrudan eklenen tutarsız okumayı reddetmesi
  - rol yükseltme: değiştirilmemiş şablonların yeni yetkileri alması, özel ve düzenlenmiş rollerin değişmemesi, ikinci çalıştırmanın etkisizliği
  - işlem geçmişi kayıtları
- **Migration kontrolü:** ana veritabanında öncesi/sonrası satır sayıları (araç, okuma, konum, kullanıcı, rol) karşılaştırılır; tek beklenen fark rol yükseltme işlem geçmişi satırlarıdır.
- **Tarayıcı:** 1440/768/390 px'te sekme, iki form, düzeltme akışı, düşüş ve büyük artış iletileri; yatay taşma ve panel kapatma ölçümü; onaylı V5 tasarımının bozulmadığı ekran görüntüleriyle doğrulanır.

#### 8.5.8 Kapsam

İlk sürüm: manuel km okuması, gerekçeli düzeltme ve düzeltme zinciri, büyük artış onayı, manuel konum güncelleme ve düzeltme, eşzamanlılık ve geçmiş tarih kuralları, 360 Konum ve geçmiş sekmesi, yetkiler ve rol yükseltme, testler. Sonra: gösterge değişimi (ayrı plan), kiralama teslim/iade, rezervasyon projeksiyonu, bakım, transfer, tedarikçi olayları, km eşiklerinin Ayarlar'a taşınması, Araçlar listesinde konum/km filtresi, GPS (V1 dışı).

## 9. API kuralları

- REST, JSON; tüm uçlar `/api` altında. Liste uçları sunucu tarafında arama, filtre, sıralama ve sayfalama yapar.
- Hata biçimi: `{ error: { code, message, fields? } }`; doğrulama 400, yetkisiz 401, yasak 403, bulunamadı 404, çakışma 409 (sürüm uyuşmazlığı veya mükerrer plaka), oran sınırı 429.
- Güncellemelerde `version` gönderilir; uyuşmazsa 409 ve güncel kayıt döner.
- Her değişiklik `audit_log`'a yazılır.

### 9.1 Zaman, tarih ve saat dilimleri

ACARVO uluslararası kullanılır; bilgisayarın saat dilimi hiçbir zaman saklanan veya gösterilen değeri değiştirmez. İki tür zaman vardır ve birbirine çevrilmez:

| Tür | Örnek | Veritabanı | API | Giriş ve gösterim |
|---|---|---|---|---|
| **An (instant)** | km okuması, konum kaydı, işlem geçmişi, oturum | `timestamptz` (UTC) | ISO 8601 UTC (`2026-10-08T12:30:00.000Z`) | Şirketin saat diliminde duvar saati (`companies.timezone`) |
| **Takvim tarihi** | belge geçerlilik günleri, edinim tarihi | `date` | `YYYY-MM-DD` | Olduğu gibi `GG.AA.YYYY`; hiçbir saat dilimi çevrimi yapılmaz |

- Ortak yardımcılar `packages/shared/src/time.ts`: `wallTimeToUtc` (şirket saatinde girilen değeri UTC ana çevirir), `utcToWallTime`, `timeZoneOffsetMs`, `isDateOnly`, `formatDateOnly`. Yalnız `Date.UTC` ve açık saat dilimli `Intl` kullanır; yerel saat API'si kullanmaz.
- Web: `formatDate`/`formatDateTime` anları oturumdaki şirket saat diliminde, takvim tarihlerini çevirmeden gösterir. Km/konum formlarındaki tarih-saat alanı şirket saatiyle doldurulur ve okunur; bilgisayarın saat dilimi farklıysa alanın altında belirtilir.
- **Yaz/kış saati:** ileri geçişte yaşanmayan saat (ör. 29.03.2026 02:30) geçişin hemen sonrasına alınır ve formda belirtilir; geri geçişte iki kez yaşanan saat (25.10.2026 02:30) ilk geçişi (yaz saati) olarak kaydedilir ve belirtilir.
- **Belgelerde "bugün"** sunucuda şirket saat dilimine göre hesaplanır (`todayIn`); gün farkları takvim günü olarak sayılır, yaz/kış geçişinden etkilenmez.
- **48 saat kuralı** gerçek geçen süreyle (iki UTC an arasındaki fark) ölçülür; saat dilimi veya yaz/kış geçişi sonucu değiştirmez.
- Sunucu iletilerindeki tarih-saat de şirket saat diliminde ve web ile aynı biçimdedir (`GG.AA.YYYY SS:dd`).
- Testler (`apps/api/tests/time.test.ts`) senaryoları bilgisayar saat dilimi Berlin, İstanbul, New York, Tokyo, UTC ve Honolulu iken çalıştırır.
- Açık karar: şubelerin de kendi `timezone` alanı var; şu an tüm giriş/gösterim şirket saat dilimini kullanır (bkz. gece raporu, bekleyen kararlar).

### 9.2 Otomatik testler

- **API testleri** (`npm test`, Vitest, `apps/api/tests`): yalnız `acarvo_test` üzerinde çalışır; bağlantı adresleri ana veritabanıyla aynıysa veya canlı bağlantı başka bir veritabanındaysa hiçbir veriye dokunmadan durur (`tests/db-guard.ts`).
- **Tarayıcı testleri** (`npm run test:e2e`, Playwright, `apps/e2e`):
  - Ayrı bir API (port 3101) ve web sunucusu (port 5181) başlatır; API `acarvo_test` ve geçici bir depolama klasörü kullanır. Geliştirme sunucularına (3001/5173) ve ana veritabanına dokunmaz; yapılandırma test adresleri `acarvo_test` değilse durur.
  - Her çalıştırmada `acarvo_test` aynı korumalı sıfırlamayla yeniden kurulur ve test kullanıcılarına **o çalıştırmaya özel rastgele bir parola** verilir; kişisel parola veya açık tarayıcı oturumu kullanılmaz. Tarayıcı Playwright'ın kendi Chromium'udur, her test temiz bir profil kullanır.
  - Giriş hız sınırı nedeniyle her test kullanıcısı bir kez giriş yapar (`auth.setup.ts`), oturum `apps/e2e/.auth/` altında saklanır (Git dışı).
  - API testleri ve tarayıcı testleri aynı test veritabanını sıfırladığı için **aynı anda çalıştırılmaz**.
  - Kapsam: giriş/çıkış, şirket değiştirme, liste arama/filtre, araç ekleme/düzenleme ve sürüm çakışması, 360° sekmeleri, fotoğraf yükleme/ana fotoğraf/sıralama/kaldırma, belge ekleme/görüntüleme/indirme/yenileme, km girişi ve düzeltme, konum, saat dilimi (tarayıcı İstanbul saatinde), şube sınırlı kullanıcı, telefon (390 px). Rapor: `apps/e2e/playwright-report/` (Git dışı).

## 10. Git ve gizli bilgiler

- `.gitignore`: `.env*` (`.env.example` hariç), `node_modules`, `dist`, `storage/`, `*.log`, test çıktıları, Playwright raporları, `.playwright-mcp/`, yerel veritabanı dökümleri (`*.dump`, `*.sql.gz`, `pgdata/`), editör geçici dosyaları.
- Parolalar ve bağlantı bilgileri yalnız yerel `.env` dosyasındadır. Kurulum betiği gerekli parolaları kullanıcıya sorar (ekranda gösterilmez) veya rastgele üretir; hiçbir parola kaynak koda, loga veya sohbete yazılmaz.
- Mevcut prototipler ve tasarım dosyaları silinmez.

## 11. Aşamalar

1. **Temel altyapı:** monorepo, veritabanı rolleri, migration, RLS, giriş/oturum/CSRF/oran sınırı, şirket seçimi, uygulama kabuğu (7 kategori / 36 bağlantı), izolasyon testleri. Teslim: giriş yapılan çalışan uygulama + geçen testler.
2. **Araçlar ve Araç 360°:** liste, ekleme, düzenleme, detay (V5 tasarımı), belgeler, km ve konum geçmişi, tanıtım fotoğrafı yükleme, testler.
3. Sonraki modüller spesifikasyondaki öncelik sırasıyla (Rezervasyonlar, Kiralamalar, Finans ...).

## 12. Güvenli dağıtım ve migration süreci

Sıra her zaman: **yedek → migration → doğrulama → kod**. Kod, migration'ı uygulanmamış bir veritabanına dağıtılmaz (Araç fotoğrafları aşamasında bu sıra bozulduğunda geçici 500 hataları görüldü).

1. **Prova:** `node --env-file=.env scripts/safe-migrate.mjs --test` — aynı süreci `acarvo_test` üzerinde çalıştırır.
2. **Ne uygulanacak:** `node --env-file=.env scripts/safe-migrate.mjs --dry-run` — ana veritabanında bekleyen migration'ları yalnız listeler (salt okuma).
3. **Uygulama:** `node --env-file=.env scripts/safe-migrate.mjs` — sırasıyla:
   - doğrulanmış yedek (`scripts/backup-db.mjs`: şema, global veri, her şirketin kendi RLS bağlamında verisi, satır sayısı karşılaştırması, özel depolama kopyası); doğrulanamazsa **durur**;
   - her tablonun (şirket tablolarında şirket bazında) satır sayısı fotoğrafı;
   - migration (Drizzle tek işlemde uygular; hata olursa veritabanı değişmez) + tekrarlanabilir rol şablonu yükseltmesi;
   - doğrulama: tüm migration'lar uygulanmış mı, hiçbir tabloda satır azalmış mı, RLS'li her tablo hâlâ RLS'li ve zorunlu mu, yeni tablo RLS'siz mi; sorun varsa yedek klasörünü ve geri yükleme adımlarını yazıp **sıfır olmayan kodla durur**.
4. **Kod dağıtımı** ancak bundan sonra.

Üretim ortamı ayarları (sunucu açılışta eksikleri uyarı olarak yazar, `productionWarnings`):
- `NODE_ENV=production`, `WEB_ORIGIN=https://…` (gerçek adres), `COOKIE_SECRET` (en az 32 karakter, gizli),
- `STORAGE_DIR` (kod dışında, yedeklenen kalıcı klasör),
- `TRUST_PROXY` (ters vekil sunucunun adresi; tanımlanmazsa `X-Forwarded-For` yok sayılır),
- `MALWARE_SCANNER=clamav` (+ `CLAMAV_HOST/PORT`); tanımlanmazsa belge yükleme kapalı kalır.
