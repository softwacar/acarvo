# ACARVO — Müşteriler, Kurumsal Hesaplar, Sürücüler ve Müşteri 360° — Uygulama planı

Durum: **genel yaklaşım onaylandı (10.10.2026); kararlar işlendi (§14); M1 kapsamı onay bekliyor (§15).** Kod yazılmadı.

Kaynaklar:
- Spec (`ACARVO_GLOBAL_WEB_UI_V1_SPEC.md`):
  - müşteri ve kurumsal hesap: §16, §17, §82 (Müşteriler / Kurumsal Hesaplar workspace'leri);
  - belge ve sürücü: §50 belge politikası, §9.2 belge durumu, §69 sürücü uygunluğu, §83.3 birincil ve ek sürücü;
  - müşteri kayıtları: §59AX–AY iletişim geçmişi ve takip, §59BR–BT not/kısıt/birleştirme, §59CW iletişim sınırı;
  - gizlilik ve yetki: §77 gizlilik, §83.5 personel yetkileri ve hassas belge izni, Part IV açık hukuki kararlar.
- Teknik ve plan belgeleri: `docs/TEKNIK_UYGULAMA.md`, `docs/GELECEK_MODULLER_PLANI.md` §3.1.
- Mevcut şema ve test altyapısı.

---

## 1. Kapsam ve sınırlar

**Bu modülde:**
- bireysel müşteri (kişi) kaydı;
- kimlik / pasaport / giriş damgası / ehliyet belgeleri (şifreli numara, güvenli dosya);
- kurumsal hesaplar: unvan, uluslararası vergi ve sicil kimlikleri, adresler, kişiler ve roller;
- sürücü ilişkileri (bir kişi birden çok kurumsal hesapla ilişkili olabilir);
- Müşteri 360° ve Kurumsal Hesap 360°;
- iletişim geçmişi, operasyonel notlar ve tercihler, açıklanabilir kısıtlamalar;
- mükerrer kayıt önerisi ve onaylı birleştirme;
- kişisel veri talepleri için denetlenebilir altyapı (dışa aktarma, düzeltme, erişim kısıtlama, anonimleştirme).

**Bu modülde değil (bağlantı noktaları hazırlanır, veri uydurulmaz):**
- rezervasyon, kiralama, sözleşme, fatura ve tahsilat;
- **kurumsal kredi limiti, kredi kullanımı (exposure) ve finansal risk değerlendirmesi** → Finans modülü;
- açık bakiye ve ekstre → Finans modülü;
- kurumsal fiyat matrisi → Fiyatlandırma / Ayarlar temeli;
- **ülkeye özgü sürücü uygunluk kuralları** (yaş sınırı, ehliyet yılı, sınıf) → Kiralama modülü;
- gerçek SMS / WhatsApp / e-posta gönderimi (§59CW);
- müşteri portalı (§42, V1 dışı);
- otomatik silme veya saklama süresi uygulaması (§9.7).

**İlke (§17, §59CS): kişi ≠ kurumsal hesap.** Kurumsal hesap ticari taraftır: ödeyen ve fiyat bağlamı. Kişinin kimliği yalnız kişi kaydında tutulur. Kurumsal hesap kişilere bağlantıyla referans verir; kimlik bilgilerinin ikinci bir kopyasını tutmaz.

## 2. Şirket izolasyonu (karar 1)

**"Tek kişi, tek kayıt" ilkesi yalnız aynı ACARVO şirketi içinde geçerlidir.**

- Her müşteri, belge, kurumsal hesap ve ilişki satırı tek bir şirkete aittir (`company_id`, zorunlu, değiştirilemez).
- **Şirketler arasında:**
  - ortak müşteri havuzu yoktur;
  - ortak kişi kimliği, genel kişi tablosu veya şirketler arası eşleştirme anahtarı yoktur;
  - otomatik veya önerili eşleştirme yapılmaz.
- Aynı gerçek kişi iki farklı ACARVO şirketinde kiralama yaparsa iki ayrı, birbirinden habersiz kayıt olur. Birinin değişikliği, birleştirmesi veya anonimleştirmesi diğerini etkilemez.
- **Belge numarası özetleri (HMAC) şirkete özgüdür:** özet girdisine `company_id` katılır. Aynı numara iki şirkette farklı özet üretir; özetler şirketler arasında karşılaştırılamaz.
- **Veritabanı düzeyi:**
  - tüm yeni tablolarda `ENABLE` + `FORCE ROW LEVEL SECURITY` ve 4 politika (`company_id = app_company_id()`);
  - tüm ilişkiler bileşik yabancı anahtarla kurulur: `(company_id, customer_id) → customers(company_id, id)`. Başka şirketin kaydına bağlantı veritabanında imkânsızdır;
  - numaralar ve özetler `(company_id, …)` ile tekildir.
- **API düzeyi:**
  - her uç `withCompany` içinde çalışır;
  - başka şirketin kimliği sorulduğunda yanıt **404** olur (403 değil; kaydın varlığı da sızmaz);
  - mükerrer önerileri ve aramalar yalnız oturumdaki şirketin kayıtlarında yapılır.
- **Testler:** her yeni tablo izolasyon testleri listesine girer. Drina ve Neretva arasında liste, kimlik, arama, mükerrer kontrolü, bağlantı kurma ve belge dosyası erişimi denenir.

## 3. Alan modeli

```
customers (kişi)  ──< customer_documents ──< customer_document_files ──> customer_files (özel depo)
   │  ▲
   │  └── corporate_account_people (rol: yetkili sürücü / iletişim / fatura iletişimi / rezervasyon yapan)
   │                 │
   │                 ▼
   │        corporate_accounts ──< corporate_tax_ids
   │                            ──< corporate_addresses
   ├──< customer_communications    (manuel iletişim kaydı)
   ├──< customer_restrictions      (açıklanabilir kısıt, puan yok)
   ├──< customer_privacy_requests  (kişisel veri talepleri)
   └──  customer_merges            (birleştirme geçmişi)
```

Tablolarda her satır `company_id` taşır; şirketler arası ilişki yoktur (§2).

- **Tek kişi, tek kayıt (şirket içinde).** Aynı kişi bireysel müşteri olabilir ve aynı anda birden çok kurumsal hesabın yetkili sürücüsü, iletişim kişisi veya rezervasyon yapanı olabilir. Hepsi aynı `customers` satırını kullanır; kurumsal hesaplar kişiyi `corporate_account_people` ile rol vererek bağlar.
- **Müşteriler listesi:** yalnız kurumsal sürücü olan kişiler de bu listede görünür ve "kurumsal sürücü" filtresiyle ayrılabilir.
- **Sürücü ayrı bir varlık değildir.** Kiralama modülünde `rental_drivers` satırları kişiye referans verir (§11).

## 4. Bireysel müşteri alanları

Duyarlılık sınıfları:
- **N**: normal operasyon verisi.
- **K**: kişisel veri (ad, iletişim, adres, doğum tarihi).
- **H**: hassas kimlik verisi (belge numaraları, belge görüntüleri). Şifreli saklanır, maskeli gösterilir.

| Alan | Zorunlu mu | Neden gerekli | Sınıf | Kim görür |
|---|---|---|---|---|
| `customer_no` (`M-000123`) | otomatik | şirket içinde benzersiz, güvenli başvuru numarası (§14 karar 8) | N | `customers.read` |
| `given_name`, `family_name` | **en az biri zorunlu** (tek isimli kişiler: yalnız biri doldurulur) | kimlik, sözleşme | K | `customers.read` |
| `display_name` (türetilmiş) | — | listelerde | K | `customers.read` |
| `phone` (E.164 normalize) + `phone_raw` | **en az biri:** telefon veya e-posta | iletişim; mükerrer önerisi | K | `customers.read` |
| `email` (küçük harf normalize) | (yukarıdaki kural) | iletişim; mükerrer önerisi | K | `customers.read` |
| `residency`: `local` / `foreign` | **zorunlu, açık seçim** (§9.2) | hangi belgelerin beklendiği; **asla addan, ülkeden veya telefon kodundan tahmin edilmez** | N | `customers.read` |
| `nationality` (ISO 3166-1 alfa-2) | isteğe bağlı | yabancı müşteri belgeleri | K | `customers.read` |
| `date_of_birth` (takvim tarihi) | isteğe bağlı | kiralama modülündeki sürücü kontrolü için gerekebilir; bu modülde kural uygulanmaz (§6) | K | `customers.read`, yalnız 360°'ta; listede ve aramada yok |
| Adres (`line1`, `line2`, `city`, `postal_code`, `region`, `country`) | isteğe bağlı | sözleşme ve fatura; uluslararası serbest biçim, ülkeye göre zorunlu alan dayatılmaz | K | `customers.read` |
| `preferred_language`, `contact_preference` | isteğe bağlı | §59BR hizmet tercihi | N | `customers.read` |
| `operational_note` | isteğe bağlı | §59BR; kişilik veya risk yorumu **yasak** | N | `customers.read` |
| `status`: `active` / `archived` / `merged` / `anonymized` | otomatik | yaşam döngüsü; fiziksel silme yok | N | — |
| `processing_restricted` + gerekçe | otomatik | kişisel veri talebi (§9.6) | N | — |
| `merged_into_id`, `anonymized_at` | otomatik | birleştirme ve anonimleştirme | N | — |
| `created_branch_id` | otomatik | kaydın nerede açıldığı (bilgi amaçlı; erişimi sınırlamaz) | N | — |
| `version`, `created_by/at`, `updated_by/at` | otomatik | sürüm çakışması ve denetim | N | — |

**Bilinçli olarak toplanmayanlar:**
- cinsiyet, meslek, fotoğraf (belge görüntüsü dışında);
- kart bilgileri (Part IV: kart verisi saklanmaz);
- "risk puanı" (§16, §59BS);
- kişi kaydında kimlik numarası. Belge numaraları yalnız şifreli belge kaydında durur. Not alanına numara benzeri bir dizi yazılırsa kullanıcı uyarılır; bu yalnız bir ipucudur, kural değildir.

## 5. Kimlik, pasaport, giriş damgası ve ehliyet belgeleri

`customer_documents` araç belgelerinden **ayrı** bir kayıt türüdür. Aynı güvenlik altyapısı kullanılır, ama aynı tablo kullanılmaz.

| Alan | Açıklama |
|---|---|
| `type` | `national_id`, `passport`, `entry_stamp`, `residence_permit`, `driving_license`, `other` |
| `issuing_country` | ISO 3166-1 alfa-2 (`entry_stamp` için giriş ülkesi) |
| `number_ciphertext`, `number_key_id` | belge numarası, **uygulama düzeyinde şifreli** (AES-256-GCM, kayıt başına rastgele IV, kimlik doğrulama etiketi). `number_key_id` hangi anahtarla şifrelendiğini gösterir (anahtar yenileme için, §9.4) |
| `number_last4` | maskeli gösterim için (`••••1234`). Kısa numaralarda daha az hane gösterilir; en az 4 hane her zaman gizli kalır |
| `number_lookup` | HMAC-SHA256 (`company_id` + tür + ülke + normalize numara), ayrı bir anahtarla. Yalnız **şirket içi tam eşleşme** için; numara geri çözülemez |
| `issued_on`, `valid_until` | takvim tarihleri (§9.1: çevrilmez) |
| `license_first_issued_on` | ehliyetin ilk veriliş tarihi (belgede yazılıysa) |
| `license_categories` | ehliyet sınıfları (ör. `B`, `BE`); ülkeden bağımsız serbest kod listesi |
| `entry_date` | giriş damgası için |
| `record_state` | `draft` / `active` / `voided`; araç belgeleriyle aynı yaşam döngüsü, gerekçeli geçersiz sayma |
| `verified_by/at` | personelin belgeyi gözle doğruladığı (§69 "manual verification flag") |
| `locked_at` | ileride kiralama sözleşmesi bu sürümü sabitleyince düzeltme yerine yeni kayıt açılır (§50) |

- **Dosyalar:** `customer_files` (ayrı depolama kaydı) + `customer_document_files` (değiştirilemez sürümler). Özel depoda `customers/<şirket>/<yıl>/<uuid>`; dosya adında kişisel veri yok.
  - Araç belgeleriyle aynı içerik doğrulaması: PDF etkin içerik reddi, görsellerin yeniden kodlanıp EXIF/GPS bilgisinin silinmesi.
  - Zararlı dosya tarayıcısı kapısı: üretimde tarayıcı yoksa yükleme kapalı.
  - Gösterim ve indirme **erişim izni modeliyle** yapılır (§8.4.4): POST ile izin → GET; Fetch Metadata; istek kaydı. İzin deposuna "kaynak türü" eklenir (`vehicle_document` / `customer_document`). Görüntüleme ve indirme ayrı yetkilerdir (§9.3).
- **Belge kontrol listesi:** spec'teki ürün varsayılanından (§9.2, §50) saf bir fonksiyonla hesaplanır:
  - yerel kişi: kimlik + ehliyet; yabancı kişi: pasaport + giriş damgası + ehliyet;
  - durumlar: geçerli, süresi yaklaşıyor, süresi dolmuş, eksik, doğrulanmadı;
  - **bilgi amaçlıdır;** hiçbir işlemi engellemez. Eksik belge rezervasyonu engellemez (§9.2). Kiralama öncesi engelleme kararı Kiralama modülüne aittir.

## 6. Sürücüler (karar 5)

- **Tutulan bilgiler** (gerekli olduğu ölçüde):
  - doğum tarihi (kişide);
  - ehliyet: veren ülke, şifreli numara, sınıflar, veriliş, geçerlilik ve ilk veriliş tarihleri.
- **Gösterim yalnız gerçektir, karar değildir:** "Ehliyet 12.03.2027'ye kadar geçerli · ilk veriliş 2018".
- **Bu modülde sabitlenmeyenler:** minimum yaş, ehliyet yılı veya sınıf kuralları; "uygun / uygun değil" sonucu; ülkeye özgü kiralama uygunluğu.
  - Bunlar Kiralama modülünde, şirket politikası ve teslim/iade tarihleriyle birlikte değerlendirilecek (§69: Eligible / Review Required / Blocked).
  - Bu modülün veri modeli o değerlendirmeye yeterli bilgiyi sağlar, ama kendisi değerlendirme yapmaz.
- **Kurumsal muafiyet:** ileride Belge Gerekliliği politikasıyla gelir (Ayarlar + Kiralama). Bu modülde uygulanmaz.

## 7. Kurumsal hesaplar (karar 4)

| Tablo / alan | Açıklama |
|---|---|
| `corporate_accounts` | `account_no` (`K-00042`, şirket içinde benzersiz), `legal_name` (zorunlu), `trade_name`, `country` (ISO, zorunlu), `registration_number` (ülkeden bağımsız "sicil no", isteğe bağlı), `email`, `phone`, `status` (`active` / `suspended` / `archived`), `note`, `version` |
| `corporate_tax_ids` | **birden çok vergi kimliği:** `scheme` (serbest kod + öneri listesi: `VAT`, `PDV`, `JIB`, `VKN`, `EIN`…), `value` + `value_normalized` (boşluk, nokta ve tire temizlenir), `country`, `is_primary`. Tek ülkenin vergi yapısına bağlı değildir. **V1'de ülkeye özgü biçim denetimi yok;** yalnız normalizasyon ve şirket içi tekillik. Doğrulanmış şema listesi geldiğinde uyarı düzeyinde eklenebilir |
| `corporate_addresses` | `type` (`registered` / `billing` / `postal`), uluslararası serbest adres alanları (`line1`, `line2`, `city`, `postal_code`, `region`, `country`), `is_default_billing`. Faturalama ileride o anki adresin **kopyasını** alır; adres değişikliği eski faturayı değiştirmez |
| `corporate_account_people` | `customer_id` + `roles[]` (`authorized_driver`, `contact`, `billing_contact`, `booker`), `valid_from` / `valid_until`, `active`, `note`; `(company, corporate_account, customer)` tekil. **Bir kişinin birden çok kurumsal hesapla ilişkisi serbesttir** |

- Kurumsal hesaba Yerel/Yabancı atanmaz (§9.2).
- **Kredi limiti, kredi kullanımı ve finansal risk bu modülde yoktur.** Kurumsal Hesap 360°'taki ilgili sekme dürüstçe "Finans modülüyle gelecek" yazar.

## 8. Mükerrer kayıt önerisi (karar 6)

- **Kapsam:** yalnız oturumdaki şirketin kayıtları. Şirketler arası öneri yoktur.
- **Normalizasyon:**
  - telefon E.164 biçimine çevrilir; ülke kodu yoksa şirketin ülkesi varsayılır ve bu kullanıcıya gösterilir;
  - e-posta küçük harfe çevrilir;
  - ad Unicode NFC'ye, küçük harfe ve aksansız biçime getirilir.
- **Güçlü öneri** (uyarı + açık seçim):
  - aynı normalize telefon;
  - aynı e-posta;
  - aynı belge numarası (M2'den sonra). Karşılaştırma **yalnız sunucuda, HMAC özeti üzerinden** yapılır.
- **Olası öneri** (yalnız bilgi): aynı normalize ad + aynı doğum tarihi.
- **Hiçbir zaman:**
  - yalnız ad benzerliğinden kesin eşleşme;
  - otomatik birleştirme;
  - eşleşme nedenini gizleme.

  Kullanıcı nedeni görür ("aynı telefon"), sonra "Bu kişiyi kullan" ya da "Farklı kişi, yeni kayıt aç" seçer.
- **Hassas bilgiler açıkta kullanılmaz:**
  - mükerrer kontrolü `POST` gövdesiyle yapılır; URL'de telefon, e-posta veya belge numarası olmaz;
  - belge numarası veritabanında düz metin olarak karşılaştırılmaz, yalnız özet;
  - yanıt eşleşen kişiyi maskeli özetle döner: müşteri no, ad, maskeli telefon. Belge numarası hiçbir zaman dönmez;
  - "aynı belge numarası" nedeni yalnız `customers.documents.read` yetkisi olana gösterilir;
  - kontrol hız sınırlıdır (numara tahmini ve tarama önlenir).
- **Benzer ad araması (`pg_trgm`):** M5'e bırakıldı. O zamana kadar tam eşleşme ve normalize ad ön eki kullanılır. Eklentinin kurulması ayrıca onayınıza sunulacak (yönetici yetkisiyle bir kez `CREATE EXTENSION`).
- **Birleştirme** (§59BT, M5):
  1. yetkili kullanıcı ana kaydı ve mükerreri seçer;
  2. etkilenecekler önizlenir;
  3. çakışan alanlar için açık seçim istenir;
  4. onaydan sonra işlem tek veritabanı işleminde yapılır. Mükerrer kayıt `merged` olur ve `merged_into_id` ile ana kayda yönlenir; bağlı kayıtlar taşınır, hiçbir şey silinmez; işlem geçmişine yazılır.

## 9. Gizlilik ve güvenlik

### 9.1 Şirket izolasyonu
Bkz. §2. Ek olarak uygulama rolüne (`acarvo_app`) yeni tablolarda **DELETE yetkisi verilmez**. Değiştirilemez tablolarda (dosya sürümleri, birleştirme geçmişi, talep olayları) yalnız SELECT / INSERT verilir.

### 9.2 Şube erişimi (karar 2)
- Şirketin yetkili kullanıcıları şirketin müşteri ve kurumsal kayıtlarını **tüm şubeler arasında** bulabilir ve açabilir. Bunun nedeni, müşterinin bir şubede kiralayıp başka şubede iade edebilmesidir.
- Şube sınırlı kullanıcılar (ör. yalnız SJJ) da müşteri bulabilir ve kayıt açabilir. `created_branch_id` yalnız bilgi amaçlıdır.
- **Hassas bilgilere erişim şubeye değil göreve ve yetkiye bağlıdır** (§9.3).
- Şirketler arası erişim hiçbir yetkiyle mümkün değildir (§2).

### 9.3 Yetkiler (karar 3: en az yetki)

Hazır rollere yeni izinler, mevcut tekrarlanabilir yükseltme mekanizmasıyla eklenir (`ROLE_PRESET_HISTORY` yeni sürüm). Bu mekanizma:
- yalnız hiç değiştirilmemiş hazır rolleri günceller;
- **özel rollere kendiliğinden yeni erişim vermez;**
- mevcut kullanıcıları, şirketleri ve diğer yetkileri değiştirmez.

| İzin | Ne sağlar | Sahip | Yönetici | Operasyon |
|---|---|---|---|---|
| `customers.read` | liste ve 360° (belge numaraları maskeli) | ✓ | ✓ | ✓ |
| `customers.manage` | ekleme, düzenleme, arşivleme | ✓ | ✓ | ✓ |
| `customers.documents.read` | belge kayıtları, durumları, maskeli numara | ✓ | ✓ | ✓ |
| `customers.documents.manage` | belge ve dosya yükleme, düzeltme, doğrulama, geçersiz sayma | ✓ | ✓ | ✓ |
| `customers.documents.view` | belge **görüntüsünü** tarayıcıda açma (izin + "görüntüleme istendi" kaydı) | ✓ | ✓ | — |
| `customers.documents.download` | belge dosyasını **indirme** (izin + "indirme istendi" kaydı; §83.5 ayrı izin) | ✓ | — | — |
| `customers.identity.reveal` | tam belge numarasını görme ("numara gösterildi" kaydı) | ✓ | — | — |
| `customers.communications.manage` | iletişim kaydı ekleme | ✓ | ✓ | ✓ |
| `customers.restrictions.manage` | kısıt ekleme / kaldırma | ✓ | ✓ | — |
| `customers.merge` | birleştirme | ✓ | ✓ | — |
| `customers.privacy.manage` | kişisel veri talepleri: dışa aktarma, kısıtlama, anonimleştirme | ✓ | — | — |
| `corporate.read` | kurumsal hesaplar ve bağlı kişiler | ✓ | ✓ | ✓ |
| `corporate.manage` | kurumsal hesap ekleme, düzenleme, kişi bağlama | ✓ | ✓ | — |

**Gerekçe:**
- **Operasyon** teslim masasında fiziksel belgeyi zaten elinde görür. Belgeyi yükleyip "doğrulandı" işaretleyebilir. Yüklediği görüntüyü sonradan açması, indirmesi veya tam numarayı görmesi gerekmez.
- **Yönetici** belge doğrulamasını gözden geçirebilmek için görüntüyü tarayıcıda açabilir. Dosyayı indiremez ve tam numarayı göremez.
- Şirket sahibi gerekirse bu izinleri **özel bir rolle** belirli kişilere verebilir. Hazır roller ihtiyaçtan fazlasını içermez.

### 9.4 Şifreleme anahtarlarının yönetimi (karar 3)

İki ayrı gizli anahtar kullanılır:

| Anahtar | Amaç | Ortam değişkeni |
|---|---|---|
| Veri anahtarı | belge numaralarını şifrelemek ve çözmek (AES-256-GCM) | `CUSTOMER_DATA_KEYS` (anahtar halkası) + `CUSTOMER_DATA_KEY_ACTIVE` |
| Arama anahtarı | şirket içi tam eşleşme özeti (HMAC-SHA256) | `CUSTOMER_LOOKUP_KEY` |

- **Oluşturma:**
  - anahtarlar işletim sisteminin güvenli rastgele kaynağıyla (`crypto.randomBytes(32)`) üretilir;
  - `scripts/generate-customer-keys.mjs` anahtarları **ekrana yazmaz**. Yalnız sizin belirttiğiniz bir dosyaya, dar dosya izinleriyle yazar ve ekranda yalnız anahtar kimliğini gösterir (`k1`). Kopyalama ve yedekleme talimatını da verir;
  - **ben anahtar değerlerini görmem, sohbete yazmam ve `.env` dosyasına kendim eklemem.** Betiği siz çalıştırırsınız; `.env`'e eklemeyi siz yaparsınız ya da açıkça izin verirseniz betik değeri göstermeden ekler.
- **Saklama:**
  - anahtarlar yalnız ortam değişkeninde veya sunucunun gizli bilgi deposunda durur; veritabanında ve Git'te asla durmaz (`.env` zaten `.gitignore`'da);
  - uygulama anahtarları başlangıçta okur, biçim ve uzunluğu doğrular;
  - anahtar değeri hiçbir günlüğe, hata iletisine veya yanıta yazılmaz.
- **Anahtar yoksa:**
  - geliştirme ortamında belge numarası alanı kapalıdır ve "şifreleme anahtarı yapılandırılmadı" uyarısı görünür;
  - üretimde `productionWarnings` uyarı verir ve belge numarası kaydı reddedilir (503);
  - numarasız belge kaydı ve dosya yükleme çalışmaya devam eder;
  - test ortamı her çalıştırmada kendi geçici test anahtarını üretir (yalnız `acarvo_test`).
- **Yedekleme:**
  - anahtarlar **veritabanı yedeğinden ayrı** saklanmalıdır. Örneğin şifreli bir parola yöneticisinde ve ikinci bir güvenli yerde.
  - Veritabanı yedeği anahtar olmadan belge numaralarını açığa çıkarmaz.
  - **Anahtar kaybolursa** belge numaraları geri çözülemez. Yalnız son haneler ve özetler kalır; numaralar belgelerden yeniden girilmelidir. Bu risk M2'de ekranda ve teknik belgede açıkça yazılır.
  - `backup-db.mjs` anahtarları yedeğe katmaz. Yedek raporu "anahtarlar ayrı yedeklenmeli" hatırlatması içerir.
- **Yenileme (rotation):**
  1. yeni anahtar halkaya eklenir (`k2`) ve etkin anahtar `k2` yapılır. Yeni kayıtlar `k2` ile şifrelenir; eski kayıtlar `k1` ile okunmaya devam eder;
  2. `scripts/rotate-customer-keys.mjs` eski kayıtları **küçük partiler halinde** çözüp `k2` ile yeniden şifreler. Önce test provası ve doğrulanmış yedek gerekir; ilerleme kaydedilir ve işlem yarıda kalırsa kaldığı yerden devam eder;
  3. hiçbir kayıt `k1` kullanmıyorsa `k1` halkadan çıkarılır (ama güvenli yedekte bir süre tutulur);
  4. arama anahtarının yenilenmesi tüm özetlerin yeniden hesaplanmasını gerektirir: aynı betik, çözülen numaralardan yeni özet üretir. Geçiş süresince iki özet sütunuyla çalışılır.

  Anahtarın sızdığından şüphelenilirse aynı yol acil olarak uygulanır; adımlar teknik belgede bir kontrol listesi olarak yer alır.

### 9.5 Hassas değerlerin sızmaması (karar 3)
- **URL:**
  - telefon, e-posta, doğum tarihi veya belge numarası hiçbir uçta adres satırında taşınmaz. Mükerrer kontrolü ve belge numarasıyla arama `POST` gövdesiyle yapılır;
  - liste aramasındaki serbest metin (`q`) URL'de kalabilir; ama sunucu günlüğü **sorgu dizesini yazmaz**, yalnız yolu yazar (§9.5 günlükler).
- **API yanıtları:**
  - belge numarası varsayılan olarak `••••1234` biçiminde döner;
  - tam numara yalnız `POST …/reveal-number` ile, `customers.identity.reveal` yetkisi ve kayıtla gelir. Yanıt `Cache-Control: no-store` taşır;
  - ön yüz tam numarayı 30 saniye sonra gizler ve hiçbir önbelleğe veya yerel depoya yazmaz.
- **Hata iletileri:** doğrulama hataları alan adı ve kural döner, **girilen değeri asla geri yansıtmaz.** Veritabanı tekillik hataları genel bir iletiyle döner ("bu belge numarası bu şirkette başka bir kişide kayıtlı").
- **Uygulama günlükleri:**
  - istek gövdeleri yazılmaz; sorgu dizeleri yazılmaz;
  - Pino `redact` ile `authorization`, `cookie` ve gövde alanları gizlenir;
  - beklenmeyen hatalarda yığın izi yazılır, ama kişisel veri içeren değerler yazılmaz;
  - bu durum otomatik bir testle doğrulanır: test günlük çıktısını yakalayıp sentetik telefon, e-posta ve numaranın geçmediğini denetler.
- **İşlem geçmişi (audit):**
  - belge numaraları **hiçbir zaman** yazılmaz; yalnız `{ "documentNumber": "changed" }`;
  - "numara gösterildi", "görüntüleme istendi" ve "indirme istendi" kayıtları kim, ne zaman ve hangi belge bilgisini içerir, değeri içermez;
  - ad, telefon ve e-posta değişiklikleri denetim için eski ve yeni değerle yazılır (sınıf K, H değil). Bu kayıtların anonimleştirmedeki durumu §9.6'dadır.

### 9.6 Kişisel veri yaşam döngüsü (karar 7)

Amaç denetlenebilir bir **altyapı** kurmaktır. "Mevzuata uyumlu" iddiası yoktur (§77). Ülkeye özgü süreler ve kurallar kodlanmaz.

- **Talep kaydı:** `customer_privacy_requests` ve değiştirilemez `customer_privacy_request_events`.
  - Alanlar: tür (`export` / `rectification` / `restriction` / `erasure`), kanal, alınma zamanı, durum (`received` → `in_review` → `completed` / `rejected`), karar gerekçesi, işlemi yapan kişi, sonuç.
  - Her durum değişikliği olay olarak eklenir; geriye dönük değiştirilemez.
  - **Yasal süre kodlanmaz.** Gerekirse şirket bir "hedef tarih" alanını elle girer.
- **Dışa aktarma:** tek kişinin verisi (kişi, belge kayıtları — numaralar ancak talep kapsamında ve yetkiyle —, kurumsal bağlantılar, iletişim, talep geçmişi) JSON olarak üretilir. Dosyalar ayrıca listelenir. Talebe bağlanır ve kayda geçer. Toplu dışa aktarma yoktur.
- **Düzeltme:** normal düzenleme akışı; sürüm, işlem geçmişi ve talep bağlantısıyla.
- **Erişim kısıtlama:**
  - kişi kaydında `processing_restricted` bayrağı ve gerekçesi tutulur;
  - kayıt listede görünür ama düzenleme ve yeni işlem (ileride rezervasyon) uyarı verir ya da engellenir;
  - kaldırılması ayrı bir talep olayıdır.
- **Anonimleştirme** (silme talebine yanıt; geri alınamaz, önizleme + açık onay):
  - kişi kaydındaki ad, iletişim, adres, doğum tarihi ve not boşaltılır. Ad yerine "Anonim müşteri M-000123" yazılır;
  - belge kayıtlarındaki şifreli numaralar, son haneler ve özetler boşaltılır;
  - kayıt kimliği, müşteri numarası ve ilişkiler korunur (ileride kiralama ve muhasebe bütünlüğü için).
- **Otomatik silme yok:**
  - belge **dosyaları** anonimleştirmede silinmez. `retention_review` işaretiyle bekletilir ve görüntüleme izinleri kapatılır;
  - **işlem geçmişi** kayıtları değiştirilmez ve silinmez;
  - bunların ne zaman ve nasıl temizleneceği, saklama yükümlülükleri ve hukuk kararları belirlendikten sonra **ayrı ve açık bir işlemle** planlanacak;
  - saklama süreleri şirket ayarında yalnız bilgi alanı olarak durur ve hiçbir otomatik işlemi tetiklemez.
- **Aydınlatma ve rıza kaydı:** hangi metin sürümü, ne zaman, hangi kanalla sunuldu; rıza seçimi ve geri çekme kaydedilir. Hukuki dayanak modeli ayrı tutulur; rıza tek dayanak sayılmaz (§77). Metin içerikleri hukuk danışmanından gelir; uygulama metin uydurmaz.

## 10. Veritabanı ve API

**Tablolar** (hepsi `company_id` + zorunlu RLS + bileşik yabancı anahtar):
- `customers`, `company_sequences`;
- `customer_documents`, `customer_files`, `customer_document_files`;
- `corporate_accounts`, `corporate_tax_ids`, `corporate_addresses`, `corporate_account_people`;
- `customer_communications`, `customer_restrictions`, `customer_merges`;
- `customer_privacy_requests`, `customer_privacy_request_events`, `customer_privacy_notices`.

**Numaralar (karar 8):**
- `company_sequences (company_id, kind, next_value)` tablosu satır kilidiyle numara üretir; her şirketin sırası ayrıdır.
- `M-000123` ve `K-00042` biçimi; şube öneki yok. Sıra büyüdükçe hane sayısı genişler (`M-1000000`).
- `(company_id, customer_no)` ve `(company_id, account_no)` tekildir. İki şirkette aynı numara olabilir.
- Numara asla yeniden kullanılmaz (arşivlenen veya anonimleştirilen kayıt numarasını korur).

**Tekillik kuralları:**
- `customer_documents`: `(company_id, number_lookup)` kısmi tekil (geçersiz sayılmamış etkin kayıtlar). Aynı belge numarası şirket içinde iki kişide etkin olamaz; çakışma "olası mükerrer kişi" önerisine dönüşür.
- Telefon ve e-posta tekil **değildir** (aile üyeleri ortak telefon kullanabilir); yalnız öneri verilir.
- `corporate_tax_ids`: `(company_id, country, scheme, value_normalized)` tekil.
- `corporate_account_people`: `(company_id, corporate_account_id, customer_id)` tekil.

**Sürüm çakışması:** araçlarla aynı. Kayıtta `version` sütunu bulunur, istemci bunu gönderir; uyuşmazsa 409 ve güncel kayıt döner, araç formundaki çakışma diyaloğu gösterilir.

**API uçları** (hepsi `withCompany` + izin + CSRF; geçersiz veya başka şirkete ait kimlikte 404):
- **Müşteriler:**
  - `GET /api/customers` (arama, filtre, sayfa); `POST /api/customers`;
  - `GET /api/customers/:id`; `PUT /api/customers/:id`; `POST /api/customers/:id/archive`; `POST /api/customers/:id/restore`;
  - `POST /api/customers/duplicate-check` (gövdede telefon/e-posta/ad/doğum tarihi; yanıtta eşleşme nedeni ve maskeli özet);
  - `GET /api/customers/:id/history`.
- **Belgeler (M2):**
  - `GET/POST /api/customers/:id/documents`; `PUT …/:docId`; `POST …/:docId/verify`; `POST …/:docId/void`;
  - `POST …/:docId/files`; `POST …/:docId/reveal-number`;
  - `POST /api/customers/document-lookup` (tam numarayla şirket içi arama; gövdede);
  - `POST /api/customer-files/:id/access` + `GET /api/customer-files/:id`.
- **Kurumsal (M3):** `GET/POST /api/corporate-accounts`; `GET/PUT /api/corporate-accounts/:id`; `…/tax-ids`, `…/addresses`, `…/people` (bağla, rol değiştir, ilişkiyi bitir).
- **İletişim ve kısıtlar (M4):** `GET/POST /api/customers/:id/communications`; `GET/POST /api/customers/:id/restrictions`; `POST …/:rid/deactivate`.
- **Birleştirme (M5):** `POST /api/customers/merge/preview` → `POST /api/customers/merge`.
- **Kişisel veri talepleri (M6):** `GET/POST /api/customers/:id/privacy-requests`; `POST …/:reqId/events`; `POST …/:reqId/export`; `POST …/:reqId/anonymize/preview` → `POST …/:reqId/anonymize`.

**İşlem geçmişi:** `customer.*`, `corporate.*` ve `customer.privacy.*` eylemleri, §9.5 kurallarıyla. Kayıt bazındaki indeks (0011) bu sorguları da hızlandırır.

## 11. Gelecek modüllerin bağlanışı

| Modül | Müşteriye bağlantı |
|---|---|
| Rezervasyon | `customer_id` (kişi) + isteğe bağlı `corporate_account_id`, aynı şirketin bileşik anahtarıyla; belge kontrol listesi bilgi amaçlı; etkin kısıt veya erişim kısıtlaması uyarı |
| Kiralama | kiracı (kişi veya kurumsal ödeyen); `rental_drivers` (birincil 1, ek 0..N); **sürücü uygunluğu burada**, şirket politikasıyla (§6); belge sürüm sabitlemesi (`locked_at`); imzadan sonra sürücü değişikliği yeni sözleşme sürümü (§83.3); ödeyen kişi sürücü sayılmaz |
| Sözleşme | kişi, sürücü ve kurumsal adres bilgilerinin **o anki kopyası**; müşteri kaydı sonradan değişse de eski sözleşme değişmez; aydınlatma kaydı referansı |
| Finans | kurumsal kredi limiti, kredi kullanımı ve risk; açık bakiye; fatura alıcısı ve vergi kimliğinin kopyası |

## 12. Geliştirme aşamaları (karar 10)

**Her aşamada:**
- gerçek arka uç;
- PostgreSQL güvenliği: zorunlu RLS, 4 politika, bileşik yabancı anahtarlar, en az yetki;
- ön yüz (V5 tasarım sistemi);
- otomatik API ve tarayıcı testleri.

**Uygulama sırası:**
1. migration önce `acarvo_test` üzerinde (`safe-migrate --test`);
2. ana veritabanı için `--dry-run`;
3. **doğrulanmış yedek;** yedek alınamaz veya doğrulanamazsa ana veritabanına migration uygulanmaz;
4. migration ve doğrulama;
5. API, arayüz, testler.

Aşama sonunda mevcut 183 API ve 38 tarayıcı testinin tamamı ve yeni testler geçmelidir. Typecheck ve build hatasız olmalı, ekranlar 1440 / 768 / 390'da gözle incelenmeli. Ardından onayınız alınır.

| Aşama | İçerik | Ana testler |
|---|---|---|
| **M1 — Kişi kaydının temeli** | ayrıntılar §15 | §15 |
| **M2 — Kimlik ve ehliyet belgeleri** | belge kayıtları ve dosyaları; anahtar betikleri ve şifreleme (§9.4); maskeleme; şirket içi özet; "numarayı göster"; görüntüleme ve indirmenin ayrı yetkileri; erişim izni modelinin müşteri dosyalarına genişletilmesi; belge kontrol listesi; sürücü bilgilerinin gerçek gösterimi (kural yok) | veritabanında düz numara olmaması; maskeli yanıt; yetki ve kayıt; aynı numaranın şirket içinde iki kişide etkin olamaması ama iki şirkette olabilmesi; özetlerin şirketler arasında farklı olması; anahtar halkası ve eski anahtarla okuma; anahtar yokken güvenli kapanma; dosya güvenliği; Fetch Metadata; günlüklerde ve hata iletilerinde numara olmaması; tarayıcı akışları |
| **M3 — Kurumsal hesaplar ve sürücü ilişkileri** | kurumsal hesaplar, vergi kimlikleri, adresler; kişileri arayıp bağlama (mükerrer önleme); bir kişinin birden çok hesapla ilişkisi; Kurumsal Hesap 360° (kredi sekmesi "Finans modülüyle gelecek") | uluslararası vergi kimliği ve tekillik; şirketler arası bağlantının imkânsızlığı; rol ve geçerlilik; tarayıcı akışı |
| **M4 — İletişim, notlar, tercihler, kısıtlar** | manuel iletişim geçmişi (sahte gönderim durumu yok); tercihler; açıklanabilir kısıtlar | sahte durum olmaması; kısıtın uyarı olarak görünmesi; yetkiler |
| **M5 — Mükerrer önerisi ve birleştirme** | `pg_trgm` (onayınızla); ad + doğum tarihi önerisi; birleştirme önizlemesi, çakışma çözümü, atomik birleştirme | yalnız adın kesin eşleşme sayılmaması; şirketler arası öneri olmaması; birleştirmede veri kaybı olmaması; eşzamanlı birleştirme |
| **M6 — Kişisel veri yaşam döngüsü** | talep kaydı ve olayları; dışa aktarma; düzeltme bağlantısı; erişim kısıtlama; anonimleştirme önizlemesi ve uygulaması; aydınlatma/rıza kaydı | anonimleştirmeden sonra kişi kaydında kişisel veri kalmaması; dosya ve işlem geçmişinin **silinmemesi**; talep olaylarının değiştirilemezliği; yetkiler |

**Tahmini büyüklük:** M1 ve M2 en büyükleri; M3 orta; M4–M6 küçük ile orta.

## 13. Sentetik geliştirme ve test verisi (karar 9)

- **Gerçek kişi verisi kullanılmaz:**
  - adlar açıkça örnektir ("Ajla Testović", "Örnek Sürücü 03");
  - e-postalar yalnız `example.test`;
  - telefonlar örnek olduğu belli numara bloklarındandır;
  - belge numaraları `TEST-` önekli; belge görselleri kodla üretilir ve üzerlerinde "ÖRNEK — GERÇEK BELGE DEĞİLDİR" yazar.
- **İlk aşamada sentetik müşteriler yalnız `acarvo_test` veritabanına yüklenir.** Test tohum betiği veritabanı adı `acarvo_test` değilse **çalışmayı reddeder.**
- **Ana `acarvo` veritabanına izniniz olmadan örnek müşteri, kimlik veya ehliyet kaydı eklenmez.** Migration'lar ana veritabanına yalnız tablo yapısı ve yetki ekler, veri eklemez.
- Ana veritabanındaki ekranlar ilk açıldığında müşteri listesi boştur ve "Henüz müşteri yok" boş durumunu gösterir. Kayıtları siz arayüzden ekleyebilirsiniz.

## 14. İşlenen kararlar (10.10.2026)

| # | Konu | Karar | Planda |
|---|---|---|---|
| 1 | Şirket izolasyonu | "Tek kişi, tek kayıt" yalnız şirket içinde; ortak havuz, ortak kimlik veya şirketler arası eşleştirme yok; RLS, bileşik yabancı anahtarlar ve API buna göre | §2 |
| 2 | Şube erişimi | müşteriler şirket içinde şubeler arasında bulunabilir; hassas bilgiler görev ve yetkiye bağlı; şirketler arası erişim yok | §9.2 |
| 3 | Hassas bilgiler | numaralar şifreli; ekranda maskeli; tam numara, görüntüleme ve indirme ayrı yetki ve kayıtla; Yönetici ve Operasyon en az yetkiyle; URL, hata, günlük ve işlem geçmişinde açık değer yok; anahtar yönetimi planı | §5, §9.3–9.5 |
| 4 | Kurumsal hesaplar | bir kişi birden çok hesapla ilişkili olabilir; kredi limiti ve risk Finans'a kaldı; vergi kimliği ve adres uluslararası | §7 |
| 5 | Sürücüler | yaş ve ehliyet bilgisi tutulur; ülkeye özgü uygunluk kuralları sabitlenmez, Kiralama modülüne kaldı | §6 |
| 6 | Mükerrer kontrolü | yalnız şirket içi; yalnız ad benzerliğinden kesin eşleşme yok; otomatik birleştirme yok; hassas bilgiler yalnız sunucuda özetle; `pg_trgm` M5'te | §8 |
| 7 | Kişisel veri yaşam döngüsü | denetlenebilir talep altyapısı; otomatik silme yok; evrensel hukuk kuralı yok | §9.6 |
| 8 | Ad ve numaralar | ad ve soyad ayrı, en az biri zorunlu (tek isim desteklenir); `M-000123` / `K-00042`, şirket içinde benzersiz, şube öneki yok | §4, §10 |
| 9 | Geliştirme verisi | sentetik veri yalnız `acarvo_test`'e; ana veritabanına izinsiz örnek kayıt yok | §13 |
| 10 | Aşamalar | M1–M6 güncellendi; her aşamada gerçek arka uç, ön yüz, PostgreSQL güvenliği ve testler; yedeksiz migration yok | §12, §15 |

**İleride sorulacaklar (M1'i engellemez):**
- **M2 başında:** şifreleme anahtarlarının sizin tarafınızdan oluşturulup `.env`'e eklenmesi (§9.4) ve anahtarların ayrı yedeğinin nerede tutulacağı.
- **M5 başında:** `pg_trgm` eklentisinin kurulması.
- **M6 öncesi:** aydınlatma metni, hukuki dayanaklar ve saklama süreleri için hangi ülke(ler) adına hukuk danışmanlığı alınacağı. Bu belirlenmeden dosya veya işlem geçmişi temizliği planlanmaz.
- **Rol ayarı:** Operasyon'un belge görüntüsünü açması teslim masasında gerekli görülürse, bu hazır role değil şirket sahibinin vereceği özel bir role eklenmesi önerilir.

## 15. M1 — Kişi kaydının temeli: kapsam

M1 belge numarası içermez; bu yüzden şifreleme anahtarı gerektirmez.

### 15.1 Veritabanı
- **Migration'lar** (yalnız ekleyen):
  - `0012_customers`: tablolar ve indeksler;
  - `0013_customers_rls`: RLS, politikalar, yetkiler, tetikleyiciler.
- **`customers`** (§4 alanları):
  - `(company_id, id)` tekil; `(company_id, customer_no)` tekil;
  - `created_branch_id` → `branches(company_id, id)` bileşik yabancı anahtar;
  - `created_by` / `updated_by` → `users`;
  - denetimler: en az bir ad; en az bir iletişim; `residency` değer listesi; durum değer listesi; `merged_into_id` aynı şirkette.
  - İndeksler: `(company_id, status, display_name_normalized)`, `(company_id, phone_e164)`, `(company_id, email_normalized)`.
- **`company_sequences`:** `(company_id, kind)` birincil anahtar; satır kilidiyle numara üretimi.
- **Güvenlik:**
  - iki tabloda `ENABLE` + `FORCE ROW LEVEL SECURITY` ve 4 politika;
  - `acarvo_app` için `customers` üzerinde SELECT / INSERT / UPDATE, **DELETE yok**; `company_sequences` için SELECT / INSERT / UPDATE;
  - `company_id` değiştirilemez (tetikleyici).
- **Yetkiler:**
  - yeni izinler `customers.read` ve `customers.manage`;
  - `ROLE_PRESET_HISTORY` yeni sürümle Sahip, Yönetici ve Operasyon hazır rollerine eklenir;
  - tekrar çalıştırılabilir; değiştirilmiş veya özel rollere dokunmaz.
- **Ana veritabanında:** test provası → dry-run → doğrulanmış yedek → uygulama → doğrulama (şirket, kullanıcı, araç, fotoğraf, belge ve geçmiş verisinin parmak izi aynı kalmalı). Veri eklenmez.

### 15.2 API
- `GET /api/customers`:
  - arama: ad, müşteri no, telefon, e-posta;
  - filtreler: Yerel/Yabancı, durum (varsayılan etkin; arşiv dahil seçeneği);
  - sayfalama ve sıralama (ad, oluşturma tarihi).
- `POST /api/customers`: numara üretimi; normalizasyon; doğrulama.
- `GET /api/customers/:id`, `PUT /api/customers/:id`: `version` ile çakışma denetimi (409).
- `POST /api/customers/:id/archive`, `POST /api/customers/:id/restore`: gerekçeli; fiziksel silme yok.
- `POST /api/customers/duplicate-check`: aynı telefon veya e-posta güçlü öneri; aynı normalize ad + doğum tarihi olası öneri; yalnız ad eşleşmesi öneri üretmez. Hız sınırlıdır.
- `GET /api/customers/:id/history`: işlem geçmişi.
- **İşlem geçmişi eylemleri:** `customer.create`, `customer.update` (değişen alanlar), `customer.archive`, `customer.restore`.
- **Günlük kuralları:** istek gövdesi ve sorgu dizesi yazılmaz; doğrulama hataları değer yansıtmaz.

### 15.3 Kullanıcı ekranları (V5 tasarım sistemi)
- **Kenar çubuğundaki "Müşteriler" bağlantısı** etkinleşir. "Kurumsal Hesaplar" M3'e kadar mevcut pasif durumunda kalır.
- **Müşteriler listesi:**
  - sütunlar: ad + müşteri no, telefon, e-posta, Yerel/Yabancı, oluşturulduğu şube, durum. Kurumsal bağlantı ve belge durumu sütunları M2–M3'te eklenir;
  - arama, filtreler ve sayfalama; filtreler adreste;
  - boş durum ("Henüz müşteri yok" + "Müşteri ekle"), yükleniyor, hata ve tekrar dene, yetkisiz durumları.
- **Yeni müşteri / düzenle** (mevcut yan panel):
  - ad ve soyad (tek isim açıklaması), telefon, e-posta, Yerel/Yabancı (açık seçim, ön seçili değil), uyruk, doğum tarihi, adres, dil, iletişim tercihi, operasyonel not;
  - telefon/e-posta girildikten sonra **mükerrer önerisi** satır içinde görünür: eşleşme nedeni, maskeli özet, "Bu kişiyi aç" / "Farklı kişi, devam et";
  - kaydedilmemiş değişiklik uyarısı; sürüm çakışması diyaloğu.
- **Müşteri 360°:**
  - kompakt kimlik başlığı: ad, müşteri no, Yerel/Yabancı, dil, dokunulabilir telefon ve e-posta, durum. Eylemler: "Düzenle", "Arşivle" / "Geri al";
  - **sekmeler:**
    - Genel ve iletişim (gerçek veri);
    - Belgeler ("M2 ile gelecek");
    - Rezervasyonlar, Kiralamalar, Cari ve tahsilatlar, Görevler ve olaylar (dürüst "henüz bağlı değil" panelleri; sahte veri yok);
    - Geçmiş (gerçek işlem geçmişi);
  - sekme adreste; 390'da seçili sekme görünür.
- **Ekran hedefleri:**
  - **1440:** liste tam genişlik, tüm sütunlar; 360° ana içerik + 320–340 px yan bilgi;
  - **768:** tek sütun, tablo kart içinde yana kayar, sayfa kaymaz;
  - **390:** başlık iki satır, form tam ekran panel, dokunma hedefleri ≥ 36 px, yatay sayfa kayması yok.

### 15.4 Test hedefleri
Mevcut **183 API ve 38 tarayıcı testi** korunur ve geçer.

**Yeni API testleri** (hedef ≈ 35):
- **İzolasyon:** Neretva kullanıcısı Drina müşterisini liste, kimlik, arama, mükerrer kontrolü ve geçmiş üzerinden göremez (404). Bileşik yabancı anahtar başka şirketin şubesine bağlantıyı reddeder. İki tablo izolasyon testleri listesindedir.
- **Veritabanı güvenliği:** zorunlu RLS ve 4 politika; `acarvo_app` silme yapamaz; `company_id` değiştirilemez.
- **Şube:** yalnız SJJ yetkili kullanıcı (selma) başka şubede açılmış müşteriyi bulur ve açar.
- **Yetkiler:** `customers.read` olmadan 403; salt okuma yetkisiyle düzenleme 403; hazır rol yükseltmesi tekrar çalıştırılabilir; özel roller değişmez.
- **Numaralar:** sıralı ve şirket içinde benzersiz; **eşzamanlı oluşturmada çakışma yok**; iki şirket aynı `M-000001` numarasını kullanabilir; numara yeniden kullanılmaz.
- **Doğrulama:** tek isim kabul edilir; ad yoksa ve iletişim yoksa ret; Yerel/Yabancı seçilmeden ret; hata iletisi girilen değeri yansıtmaz.
- **Sürüm çakışması:** eski sürümle güncelleme 409 ve güncel kayıt döner.
- **Mükerrer önerisi:** aynı telefon ve aynı e-posta güçlü; ad + doğum tarihi olası; yalnız ad öneri üretmez; başka şirketin kaydı önerilmez; yanıt maskeli; hız sınırı çalışır; telefon/e-posta URL'de taşınmaz.
- **Arşiv:** arşivleme ve geri alma kayıtlıdır; kayıt silinmez.
- **Günlük:** yakalanan günlük çıktısında sentetik telefon, e-posta ve ad bulunmaz.
- **İşlem geçmişi:** eylemler doğru kişi ve değişen alanlarla yazılır.
- **Tohum koruması:** test tohum betiği `acarvo_test` dışındaki veritabanında çalışmayı reddeder.

**Yeni tarayıcı testleri** (hedef ≈ 10):
- liste, arama ve filtre (filtre adreste kalır);
- yeni müşteri oluşturma (tek isimli dahil);
- mükerrer önerisi görünür ve "Bu kişiyi aç" çalışır;
- düzenleme ve sürüm çakışması diyaloğu;
- kaydedilmemiş değişiklik uyarısı;
- arşivleme ve geri alma;
- 360° sekmeleri, bekleyen sekmelerde sahte veri olmaması;
- şube sınırlı kullanıcı müşteriyi bulur; başka şirketin kullanıcısı (lejla) Drina müşterisini görmez;
- 1440 / 768 / 390'da yatay taşma yok;
- yeni ekranlarda axe denetimi.

**Diğer:** typecheck ve build hatasız; ekran görüntüleri 1440 / 768 / 390'da incelenir ve onayınıza sunulur. `docs/TEKNIK_UYGULAMA.md`'ye müşteri bölümü eklenir.

### 15.5 M1'de yapılmayanlar
- belgeler ve şifreleme (M2);
- kurumsal hesaplar (M3);
- iletişim kayıtları ve kısıtlar (M4);
- benzer ad araması ve birleştirme (M5);
- kişisel veri talepleri (M6);
- rezervasyon, kiralama veya finans ile ilgili hiçbir geliştirme;
- ana veritabanına örnek veri.

---

M1 kapsamı onaylandığında yukarıdaki sırayla (test provası → yedek → ana veritabanı → API → arayüz → testler) başlanır ve M1 sonunda onayınız alınır.
