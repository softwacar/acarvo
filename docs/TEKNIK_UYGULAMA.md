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
- Sonraki parçalar: Araç 360° detay, belgeler, tanıtım fotoğrafı, kilometre/konum düzeltme kayıtları, filodan çıkış.

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
