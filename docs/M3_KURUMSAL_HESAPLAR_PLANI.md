# ACARVO — M3 Kurumsal Hesaplar: geliştirme planı

**Dal / klasör:** `kurumsal-m3` / `C:\Users\soena\Desktop\acarvo-m3`. Başlangıç noktası `main` `3bda9dd` (22 migration, API 305, tarayıcı 71).

**Dayanak:**
- `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md`: §17 kişi ≠ kurumsal hesap, §59CS, §82.
- `docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md`: §2, §3, §7, §8, §9.2–9.3, §10, §12 ve §14'teki 10.10.2026 kararları.

**Sınır:**
- Bu planın uygulanması yalnız test veritabanında (`acarvo_test`) yapılır.
- Ana veritabanına M3 migration'ı uygulanmaz; main'e birleştirme yapılmaz.
- Finans, kredi limiti, rezervasyon ve kiralama bu aşamaya girmez.

## 0. Korunan onaylı kararlar
1. **Kişi ≠ kurumsal hesap.**
   - Kurumsal hesap ticari taraftır. Kişinin kimliği yalnız `customers` satırında durur.
   - Kurumsal hesap kişiye bağlantıyla referans verir; ad, telefon veya belge kopyalamaz.
2. **Tek kişi, tek kayıt — şirket içinde.**
   - Aynı kişi bireysel müşteri olabilir ve aynı anda birçok hesabın sürücüsü, iletişim kişisi veya rezervasyon sorumlusu olabilir. Bu rollerin hepsi aynı müşteri kaydını kullanır.
3. **Şirket izolasyonu.**
   - Ortak kurumsal havuz, şirketler arası eşleştirme ve öneri yoktur.
   - Zorunlu RLS ve bileşik `(company_id, …)` yabancı anahtarlar kullanılır.
   - Başka şirketin kimliği sorulduğunda API **404** döner.
4. **Numara:** `K-00042`. Şirket içinde benzersizdir, şube öneki yoktur. `company_sequences` (tür `corporate_account`, M1'de hazırlandı) satır kilidiyle üretilir.
5. **Yetkiler (plan §9.3):**

   | Yetki | Sahip | Yönetici | Operasyon |
   |---|---|---|---|
   | `corporate.read` | ✓ | ✓ | ✓ |
   | `corporate.manage` | ✓ | ✓ | — |

   - Hazır roller `ROLE_PRESET_HISTORY` v5 ile yükseltilir; özel roller değişmez.
6. **Finans modülüne kalanlar:** kredi limiti, kredi kullanımı, risk ve bakiye. 360°'taki ilgili sekme yalnız "henüz bağlı değil" der.
7. **Belge yetkileri ayrıdır.** Kurumsal hesap üyeliği hiçbir M2 belge yetkisi vermez.
8. **Silme yok.** Uygulama rolüne yeni tablolarda DELETE yetkisi verilmez; kayıtlar arşivlenir veya "kaldırıldı / sona erdi" olarak işaretlenir.

## 1. Bu aşamada verilen ürün kararları (raporda da listelenir)

| # | Konu | Karar | Neden |
|---|---|---|---|
| D1 | Hesap durumu | Yalnız `active` / `archived`. Plandaki `suspended` (askıya alma) eklenmedi | Askıya almanın etkisi rezervasyon ve kiralamada tanımlanacak; şimdi eklemek anlamsız bir durum yaratır. Sütun kısıtı ileride genişletilebilir |
| D2 | Vergi kimliği tekilliği | **Aynı hesapta** aynı (ülke, tür, değer) iki kez etkin olamaz (veritabanı). **Farklı hesaplarda** aynı değer engellenmez; güçlü mükerrer önerisi olarak gösterilir ve kullanıcı onayı istenir | Plan şirket içi kesin tekillik öneriyordu. Gerçekte aynı vergi kimliğiyle ayrı faturalanan birimler veya bağlı şirketler olabilir; kesin engel meşru kaydı imkânsız kılar. Otomatik birleştirme yok |
| D3 | Vergi kimliği geçerliliği | `not_checked` (Kontrol edilmedi), `checked_by_staff` (Personel belgeden kontrol etti), `no_longer_used` (Artık kullanılmıyor). "Geçerli / geçersiz" diye hukuki bir sonuç yok | Hukuki doğrulama yapılmadan kesin hüküm verilmez |
| D4 | Biçim denetimi | Yalnız uyarı: çok kısa değer; `VAT` türünde iki harfli ön ekin hesap ülkesinden farklı olması. Ülkeye özgü yasal format sabitlenmez | Doğrulanmamış ülke kuralı kodlanmaz |
| D5 | Vergi türleri | Serbest kod + öneri listesi: `VAT`, `PDV`, `JIB`, `PIB`, `OIB`, `VKN`, `TCKN`, `EIN`, `UID`, `USTID`, `SIRET`, `OTHER` | Uluslararası; tek ülkeye bağlı değil |
| D6 | İletişim kanalları | Ayrı tablo: telefon, e-posta, web sitesi, diğer. Her türde bir birincil kanal | "Birden fazla iletişim kanalı" |
| D7 | Adres türleri | `registered` (resmi), `billing` (fatura), `postal` (yazışma/iletişim), `other`. **Her türde tek birincil.** Türün ilk adresi otomatik birincil olur; birincil kaldırılırsa aynı türden en eski adres birincil olur ve kullanıcıya söylenir | Anlaşılır birincil seçimi |
| D8 | Kişi rolleri | `representative` (hesap yetkilisi), `contact` (iletişim kişisi), `booker` (rezervasyon sorumlusu), `authorized_driver` (yetkili sürücü), `billing_contact` (faturalama iletişim kişisi), `other` (diğer). Bir ilişkide birden çok rol olabilir | Kullanıcının istediği roller |
| D9 | İlişki geçmişi | İlişki sona erdirildiğinde satır silinmez (`ended_at`, gerekçe). Aynı kişi yeniden bağlanırsa yeni satır açılır. Aynı hesapta aynı kişiyle aynı anda tek **etkin** ilişki vardır (kısmi tekil indeks) | Eski ilişkiler korunur |
| D10 | Kişi bilgisi görünürlüğü | Bağlı kişilerin adları müşteri verisidir. Kişi listesini görmek için `corporate.read` **ve** `customers.read`; bağlamak için `corporate.manage` **ve** `customers.read` gerekir | En az yetki; kurumsal yetki müşteri verisine arka kapı olmaz |
| D11 | Sürücü belge özeti | Sürücüler sekmesinde ehliyet geçerliliği yalnız `customers.documents.read` olan kullanıcıya gösterilir: tarih ve durum. **Numara, maskeli numara ve dosya kurumsal API'de hiç yoktur** | M2 yetkileri atlatılamaz |
| D12 | Arşiv / geri alma gerekçesi | Arşiv: `inactive`, `duplicate`, `customer_request`, `entry_error`, `other`. Geri alma: `reactivated`, `archived_by_mistake`, `other`. Sabit liste olduğu için serbest metin geçmişe girmez | "Gerekçeli" arşiv ve geri alma |
| D13 | Arşivin etkisi | Hesap arşivlenince kişi ilişkileri olduğu gibi kalır; kişiler arşivlenmez. Arşivdeki hesapta düzenleme ve yeni bağlantı yapılamaz | "Kurumsal hesabı arşivlemek kişiyi arşivlemesin" |

## 2. Veri modeli (migration `0022` yapı, `0023` güvenlik)

Tablolarda her satır `company_id` taşır (zorunlu, değiştirilemez); zorunlu RLS ve 4 politika (`company_id = app_company_id()`) vardır.

| Tablo | Önemli sütunlar | Kısıtlar |
|---|---|---|
| `corporate_accounts` | `account_no`, `legal_name`, `legal_name_normalized`, `trade_name`, `country`, `registration_number`, `registration_authority`, `preferred_language`, `note`, `status`, arşiv alanları, `created_branch_id`, `version`, oluşturan/güncelleyen | `(company_id, account_no)` tekil; `account_no ~ '^K-[0-9]{5,}$'`; ülke ISO; arşiv tutarlılığı; `(company_id, created_branch_id)` → `branches` |
| `corporate_contact_channels` | `account_id`, `kind`, `value`, `value_normalized`, `label`, `is_primary`, `removed_at` | `(company_id, account_id)` → hesap; tür başına tek etkin birincil (kısmi tekil indeks) |
| `corporate_tax_ids` | `account_id`, `country`, `scheme`, `value`, `value_normalized`, `validity`, `note`, `is_primary`, `removed_at` | aynı hesapta (ülke, tür, değer) tek etkin kayıt; hesapta tek etkin birincil |
| `corporate_addresses` | `account_id`, `kind`, `label`, `line1`, `line2`, `city`, `region`, `postal_code`, `country`, `is_primary`, `removed_at` | tür başına tek etkin birincil |
| `corporate_account_people` | `account_id`, `customer_id`, `roles text[]`, `job_title`, `note`, `valid_from`, `valid_until`, `ended_at`, `ended_by`, `ended_reason`, `version` | `(company_id, customer_id)` → `customers`; aynı hesap ve kişi için tek etkin ilişki; roller boş olamaz ve listeden olmalı; `valid_until ≥ valid_from` |

**Tetikleyiciler:**
- Hesabın şirketi, numarası ve oluşturma bilgileri değişmez.
- Alt kayıtların hesabı değişmez.
- Kaldırılmış alt kayıt ve sona ermiş ilişki değiştirilemez.
- İlişkinin kişisi ve hesabı değişmez.

**Yetkiler:** uygulama rolüne SELECT, INSERT, UPDATE verilir; DELETE verilmez.

**İndeksler:**
- `(company_id, status, legal_name_normalized)`;
- `(company_id, created_at)`;
- vergi kimliği ve iletişim kanalında `(company_id, value_normalized)`;
- ilişkilerde `(company_id, customer_id)` ve `(company_id, account_id)`.

## 3. API (`/api/corporate-accounts`, hepsi `withCompany` + yetki + CSRF)

| Uç | Yetki | Not |
|---|---|---|
| `POST /search` | corporate.read | Gövdede arama metni (URL'de değil). Ad, kısa ad, numara, vergi kimliği, sicil no, e-posta ve telefon kanalı aranır. Ülke ve durum filtreleri, sıralama, sayfa |
| `POST /duplicate-check` | corporate.manage | Güçlü: aynı vergi kimliği, aynı e-posta veya telefon kanalı. Olası: aynı normalize unvan, aynı ülke + sicil no. Hız sınırlı |
| `GET /:id` | corporate.read | Hesap + kanallar + vergi kimlikleri + adresler + kişi sayıları |
| `POST /` | corporate.manage | Çekirdek alanlar + isteğe bağlı ilk kanal, adres ve vergi kimliği. Güçlü öneri varsa onay ister |
| `PUT /:id` | corporate.manage | Sürüm denetimi (409 + güncel kayıt) |
| `POST /:id/archive`, `/:id/restore` | corporate.manage | Gerekçeli |
| `POST/PUT /:id/channels[/:cid]`, `POST …/:cid/remove` | corporate.manage | |
| `POST/PUT /:id/tax-ids[/:tid]`, `POST …/:tid/remove` | corporate.manage | Uyarılar yanıtta döner |
| `POST/PUT /:id/addresses[/:aid]`, `POST …/:aid/remove`, `POST …/:aid/primary` | corporate.manage | |
| `GET /:id/people` | corporate.read + customers.read | Etkin ve eski ilişkiler; sürücüler için belge özeti (yalnız D11 koşuluyla) |
| `POST /:id/people`, `PUT …/:pid`, `POST …/:pid/end` | corporate.manage + customers.read | Kişi aynı şirkette ve etkin olmalı (başka şirketinki 404) |
| `GET /:id/history` | corporate.read | Hesap ve alt kayıt olayları; değerler kopyalanmaz |
| `GET /api/customers/:id/corporate-links` | customers.read + corporate.read | Müşteri 360° için kişinin kurumsal ilişkileri |

**İşlem geçmişi:**
- Kaydedilen olaylar: `corporate.create`, `corporate.update`, `corporate.archive`, `corporate.restore`, `corporate.channel.*`, `corporate.tax_id.*`, `corporate.address.*`, `corporate.person.link`, `corporate.person.update`, `corporate.person.end`.
- Özet yalnız numara, değişen alan adları, tür, ülke, roller ve gerekçe kodunu içerir.
- Vergi kimliği değeri, adres metni, telefon ve e-posta geçmişe kopyalanmaz.
- Kişi ilişkisi olayları özetinde `customerId` taşır; böylece Müşteri 360° geçmişinde de görünür.

## 4. Ekranlar (V5 tasarım dili, mevcut bileşenler)
- **Kurumsal Hesaplar listesi (`/kurumsal-hesaplar`):**
  - arama (metin URL'de tutulmaz), ülke ve durum filtreleri, sıralama ve sayfalama;
  - kolonlar: numara, unvan ve kısa ad, ülke, birincil vergi kimliği, birincil iletişim, kişi ve sürücü sayısı, durum;
  - telefonda yatay kaydırma olmaz.
- **Yeni hesap / düzenleme paneli (Sheet):**
  - gruplar: Kimlik, Ticari kayıt, İlk iletişim kanalları, İlk adres, İlk vergi kimliği, Not;
  - canlı mükerrer önerisi, kaydedilmemiş değişiklik uyarısı ve sürüm çakışması diyaloğu.
- **Kurumsal Hesap 360° (`/kurumsal-hesaplar/$id`):**
  - başlık: numara, unvan, ülke, durum, birincil iletişim, kişi ve sürücü sayısı;
  - sekmeler: Genel · Adresler · Vergi bilgileri · Kişiler · Sürücüler · Geçmiş · Rezervasyonlar · Kiralamalar · Cari/Finans;
  - son üç sekme dürüstçe "henüz bağlı değil" der.
- **Kişi bağlama diyaloğu:**
  - şirketin müşterilerinde arama ve seçim; roller, görev, geçerlilik tarihleri ve not;
  - kişi yoksa aynı ekrandan yeni müşteri kaydı açılır ve bağlanır.
- **İlişkiyi sona erdirme:** gerekçe ve tarih istenir; ilişki "Önceki ilişkiler" altında kalır.
- **Müşteri 360°:** "Kurumsal hesap bağlantıları" satırı ve Genel'de kişinin kurumsal ilişkileri listelenir (hesaba bağlantı).
- **Kenar menüsü:** Kurumsal Hesaplar `corporate.read` ile açılır.

## 5. Test planı
- **API:**
  - izolasyon: liste, kimlik, arama, mükerrer, başka şirketin kişi ve hesap kimliğiyle bağlantı (404 ve veritabanı yabancı anahtarı);
  - şube sınırlı kullanıcı;
  - RBAC matrisi;
  - eşzamanlı numara üretimi;
  - çoklu vergi kimliği ve adres, birincil kuralları;
  - bir kişinin birden çok hesabı, bir hesapta birden çok rol;
  - arşiv ve geri alma, ilişki sonlandırma ve müşterinin korunması;
  - mükerrer önerileri, sürüm çakışması;
  - işlem geçmişinde ve günlüklerde değer sızıntısı;
  - M2 belge yetkisinin atlatılamaması;
  - veritabanı düzeyi: DELETE yok, tetikleyiciler;
  - performans (binlerce sentetik hesapta arama ve sayfa).
- **Tarayıcı:**
  - oluşturma, mükerrer onayı, 360° sekmeleri, adres, vergi ve kanal ekleme;
  - kişi bağlama ve yeni kişi açma, rol değiştirme, ilişki sonlandırma, arşivleme;
  - kaydedilmemiş değişiklik, çakışma, yetkisiz kullanıcı;
  - 1440 / 768 / 390 taşma kontrolü ve erişilebilirlik (axe);
  - isteğe bağlı ekran görüntüleri.
- **Test verisi:** yalnız `acarvo_test`, sentetik ("Örnek Lojistik d.o.o.", `example.test`, `TEST-` vergi değerleri).

## 6. Uygulama sırası
1. Git ve worktree; M2 sayaç doğrulaması ve eksik test (Aşama 1).
2. Paylaşılan tipler ve şemalar → Drizzle şeması → `0022` / `0023` → yalnız `acarvo_test`; `safe-migrate --verify --test`.
3. API ve rol yükseltmesi → API testleri.
4. Arayüz → tarayıcı testleri → ekran görüntüleri ve 1440 / 768 / 390 incelemesi.
5. Performans ölçümü.
6. `docs/M3_GELISTIRME_RAPORU.md`, `TEKNIK_UYGULAMA` §8.8; her aşamada commit; push yok.
