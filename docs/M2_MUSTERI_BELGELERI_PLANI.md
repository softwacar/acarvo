# ACARVO — M2: Kimlik, pasaport, ehliyet ve müşteri belgeleri — Nihai uygulama planı

Durum: **M2a–M2f test ortamında tamamlandı (11.10.2026, dal `musteriler-m2`); inceleme ve ana veritabanı geçişi onay bekliyor.** Ana veritabanına M2 migration'ı uygulanmaz; `.env` değiştirilmez; gerçek anahtar üretilmez. İlerleme: `docs/M2_GELISTIRME_RAPORU.md`.

## 0. Kesinleşen kararlar (kullanıcı sprint talimatı, 10.10.2026)

| # | Karar |
|---|---|
| K-1 | M1 `residency` korunur, verisi dönüştürülmez; **yeni müşterilerde zorunlu değildir** (alan boş bırakılabilir hale gelir). Ekranda "Eski ikamet sınıflandırması (M1)" olarak, ikamet ülkesi ve uyruktan ayrı gösterilir. Bir güncelleme isteği alanı göndermezse mevcut değer korunur (sessiz silme yok). |
| K-2 | `branches.country` boş eklenir; mevcut şubelere otomatik ülke atanmaz. Şubeler ekranından sahip girer; toplu atama önizleme + açık onay ister. |
| K-3 | Belge türleri: kimlik kartı, pasaport, sürücü belgesi, uluslararası sürücü belgesi, oturma izni, vize, giriş damgası, diğer. |
| K-4 | Müşteri belge dosyaları diskte şifreli saklanır. |
| K-5 | Gerçek anahtarları kullanıcı en sonda oluşturur; testler yalnız geçici sentetik anahtar kullanır. |
| K-6 | Hiçbir ülke için gereksinim kendiliğinden etkin değildir; şablonlar pasif taslaktır; Bosna-Hersek dahil doğrulanmamış zorunluluk oluşturulmaz. |
| K-7 | "Yönetim → Ayarlar → Müşteri Belge Gereksinimleri" ekranı M2'de yapılır. Aslının görülmesi ve kopyanın saklanması ayrı ayarlardır. |
| K-8 | Operasyon: ekler, açamaz/indiremez/numara göremez. Yönetici: görüntüler, indiremez, numara göremez. Sahip: görüntüler, indirir, gerekçeyle numara açar. Özel rollere yeni yetki verilmez. |
| K-9 | Numara açma: gerekçe zorunlu; kullanıcı başına saatte en fazla 30 (sunucuda, veritabanında; yeniden başlatma veya yeni oturumla aşılamaz); 30 sn sonra gizleme; geçmişe numara yazılmaz; kopyalama düğmesi yok. |
| K-10 | Müşteri profilinden otomatik (kesin ya da "ön") Yerli/Yabancı sınıflandırması üretilmez. 360° belge durumu, tanımlı politikalar için **her iki sınıfı yan yana** gösterir; karar kiralamada personelindir. Kiralama için yalnız saf öneri fonksiyonu ve anlık kayıt şeması hazırlanır. |
| K-11 | Süre uyarısı varsayılan 30 gün; şirket ayarından değiştirilebilir. |
| 12 | Ülke mevzuatı doğrulanmadan hiçbir zorunluluk yazılmaz; politikaları şirket sahibi tanımlar. |


Dayanak:
- Ana plan: `docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md` (§5 belgeler, §6 sürücüler, §9.3–9.5 yetki, anahtar ve sızıntı kuralları, §14 kararlar).
- M1 teknik notları: `docs/TEKNIK_UYGULAMA.md` §8.6.
- Spec: §9.2 Bölüm 2 belge durumu, §50 belge politikası, §69 sürücü uygunluğu, §83.3, §83.5 hassas belge izinleri, Part IV.
- Kullanıcının 10.10.2026 ikamet kararları (aşağıda §1).

M2'de yapılmayanlar:
- kiralama, rezervasyon ve sözleşme;
- kiralamadaki ikamet anlık kaydının uygulanması (yalnız veri modeli hazırlanır);
- sürücü uygunluk kuralları;
- kurumsal hesaplar (M3);
- birleştirme (M5);
- kişisel veri talepleri (M6).

Bölümlerin sonundaki **[Karar K-n]** işaretleri §13'teki kararlara bağlanır.

---

## 1. İkamet kararları ve M1 `residency` alanından geriye uyumlu geçiş

### 1.1 Alınan kararlar (10.10.2026)
1. Uyruk ve ikamet edilen ülke **ayrı** tutulur.
2. Kiralamada Yerli/Yabancı sınıflandırmasının referansı, **kiralamanın başladığı şubenin ülkesidir**.
3. Sınıflandırma uyruktan, telefondan veya isimden otomatik çıkarılmaz; **personel doğrular**.
4. Kiralamada belirlenen durum o kiralamanın **değişmeyen kaydında** saklanır.
5. Yabancı uyruklu ve oturma izni olan kişiler desteklenir; oturma izni **kendiliğinden bir hukuki statü sayılmaz**.
6. Belge gereksinimleri **ülkeye göre yapılandırılır**; doğrulanmamış bir belge her ülkede zorunlu sayılmaz.

### 1.2 Bugünkü durum (M1)
- `customers.residency` (`local` / `foreign`) zorunludur. M1'de referans ülke tanımsızdı; ekranda "Yerli (ikamet)" / "Yabancı (ikamet)" olarak görünür.
- `customers.nationality` (uyruk) ayrı bir alandır.
- **İkamet edilen ülke alanı yoktur.**
- **Şubelerin ülke alanı yoktur** (`branches`: ad, kod, saat dilimi, durum). Ülke yalnız şirkette tutulur (`companies.country`).
- Ana veritabanında müşteri yoktur. Test veritabanında 17 sentetik müşteri vardır.

### 1.3 Yeni model

| Kavram | Nerede | Kim belirler | Değişebilir mi |
|---|---|---|---|
| **Uyruk** | `customers.nationality` (var) | personel | evet (sürümlü) |
| **İkamet edilen ülke** | `customers.residence_country` (yeni, isteğe bağlı) | personel, kişinin beyanı veya belgesi | evet (sürümlü, işlem geçmişinde alan adı) |
| **Kiralamadaki Yerli/Yabancı** | ileride `rental_residency_snapshots` (Kiralama modülü) | personel kiralama başında **onaylar** | hayır, değişmeyen kayıt |
| **Şube ülkesi** | `branches.country` (yeni) | şirket sahibi | evet; kiralama anlık kaydı o anki değeri kopyalar |
| **M1 `residency`** | `customers.residency` (var) | — | aşağıdaki geçiş planına göre |

**Kiralamada (Kiralama modülünde uygulanacak, M2 yalnız veriyi hazırlar):**
- Sistem bir **öneri** gösterir: "İkamet ülkesi Almanya, şube ülkesi Bosna-Hersek → Yabancı (ikamet) önerilir".
  - Öneri yalnız personelin girdiği ikamet ülkesinden çıkar; uyruk, telefon veya isim hiç kullanılmaz.
  - İkamet ülkesi girilmemişse öneri yoktur.
- Personel Yerli veya Yabancı seçer ve onaylar.
- Anlık kayda şunlar yazılır:
  - seçilen durum;
  - şube ve şube ülkesi;
  - müşterinin o anki ikamet ülkesi ve uyruğu;
  - uygulanan belge politikası ve sürümü;
  - kullanılan belge sürümleri;
  - onaylayan personel ve zaman.
- Bu kayıt sonradan değişmez. Müşteri veya şube bilgisi değişse de eski kiralama değişmez.

**Oturma izni:**
- Bir belge türüdür (`residence_permit`): veren ülke, geçerlilik ve şifreli numara içerir.
- Hiçbir alanı kendiliğinden değiştirmez: ikamet ülkesini doldurmaz, Yerli yapmaz, bir statü kazandırmaz.
- Bir ülkenin politikası isterse "kimlik yerine kabul edilen belgeler" listesinde yer alabilir (§5). Bunu şirket sahibi bilerek tanımlar.

### 1.4 M1 `residency` alanı için geçiş planı (veriler ve anlamı sessizce değişmez) [K-1]

**Önerilen yol: koru, etiketle, kullanımdan aşamalı kaldır.**

1. **M2'de:**
   - Sütun ve değerler olduğu gibi kalır. Migration bu sütuna dokunmaz, veri dönüştürmez.
   - Ekranda adı "Kayıtlı ikamet sınıflandırması (M1, referans ülke belirtilmemiş)" olur.
   - Yeni kayıtlarda zorunlu olmaktan çıkar mı? **Hayır**, M2'de zorunlu kalır; API sözleşmesi değişmez. Formda "İkamet ettiği ülke" alanı eklenir.
   - İkisi birbirinden **hesaplanmaz**. Uyumsuz görünürse (ör. ikamet ülkesi Almanya, sınıflandırma Yerli) yalnız bilgi notu gösterilir; değer değişmez.
2. **Kiralama modülünde:**
   - Kiralamadaki sınıflandırma §1.3'teki gibi personel onayıyla belirlenir.
   - M1 `residency` değeri yalnız "önceki kayıtlı sınıflandırma" bilgisi olarak gösterilir; karar için kullanılmaz.
3. **Daha sonra** (ayrı onayla):
   - `residency` zorunluluktan çıkarılır, formdan kaldırılır;
   - mevcut değerler silinmez, salt okunur geçmiş bilgi olarak kalır.
   - Sütunun kaldırılması ancak açık onay ve yedekle yapılır.

Alternatifler:
- **(B)** M2'de `residency` zorunluluğunu hemen kaldırmak. Daha temiz, ama API ve ekran sözleşmesi şimdi değişir.
- **(C)** Mevcut değerleri ikamet ülkesine çevirmek. **Önermem:** M1'de referans ülke tanımsızdı; çeviri tahmin olur.

### 1.5 Şube ülkesi [K-2]
- Migration `branches.country` sütununu **boş (null)** ekler. Mevcut şubeler kendiliğinden doldurulmaz.
- Şube ülkesini yalnız şirket sahibi girer. Şubeler ekranına ülke seçimi eklenir; yeni izin `branches.manage` gerekir; değişiklik işlem geçmişine yazılır.
- Kolaylık için "Şirket ülkesini tüm boş şubelere uygula" eylemi önerilir: tek tıklama, onay sorusu, işlem geçmişi kaydı. Bu bir varsayım değil, sahibin açık eylemidir.
- Şube ülkesi boşken belge kontrol listesi o şube için "şube ülkesi tanımlanmamış" der. Şirket ülkesi sessizce yerine geçmez.

---

## 2. Belge türleri ve veri modeli (araç belgelerinden ayrı)

### 2.1 Belge türleri [K-3]

| Kod | Ad | Numara | Tarihler | Ek alanlar |
|---|---|---|---|---|
| `national_id` | Kimlik kartı | şifreli | veriliş, son geçerlilik (isteğe bağlı: süresiz kimlikler) | — |
| `passport` | Pasaport | şifreli | veriliş, son geçerlilik | — |
| `driving_license` | Sürücü belgesi | şifreli | veriliş, son geçerlilik, ilk veriliş | sınıflar (`B`, `BE`…) |
| `international_driving_permit` | Uluslararası sürücü belgesi | şifreli | veriliş, son geçerlilik | — |
| `residence_permit` | Oturma izni | şifreli | veriliş, son geçerlilik | izin türü serbest metin değil; yok (veri minimizasyonu) |
| `entry_record` | Giriş damgası / giriş kaydı | yok | giriş tarihi | giriş ülkesi; **kalış süresi hesaplanmaz** (ülkeye özgü hukuk) |
| `visa` | Vize | şifreli | başlangıç, bitiş | — |
| `other` | Diğer belge | isteğe bağlı şifreli | isteğe bağlı | kısa başlık |

Bu liste yalnız kayıt türleridir. Hangisinin zorunlu olduğu §5'teki ülke politikasıyla belirlenir.

### 2.2 Tablolar (yalnız ekleme; hepsi `company_id`, zorunlu RLS, 4 politika, bileşik yabancı anahtar)

**`customer_documents`**

| Alan | Açıklama |
|---|---|
| `id`, `company_id`, `customer_id` | `(company_id, customer_id) → customers` |
| `type`, `issuing_country` | §2.1; ISO 3166-1 |
| `title` | yalnız `other` için, en fazla 80 karakter |
| `number_ciphertext` (bytea), `number_key_id` | AES-256-GCM şifreli numara (§3) |
| `number_hint` | maskeli gösterim için son 2–4 karakter; kısa numarada daha az; en az 4 karakter her zaman gizli |
| `number_lookup`, `number_lookup_key_id` | şirket içi tam eşleşme HMAC'i (§3.3) |
| `issued_on`, `valid_from`, `valid_until`, `license_first_issued_on`, `entry_date` | takvim tarihleri (§9.1: çevrilmez) |
| `license_categories` | `text[]`, serbest kod listesi |
| `record_state` | `draft` / `active` / `voided`; geçersiz saymada sabit listeden neden |
| `verification` | `original_seen` / `copy_only` / `not_verified` + `verified_by` / `verified_at` |
| `renews_id` | yenileme zinciri (araç belgelerindeki yapı) |
| `locked_at` | ileride bir kiralama bu sürümü sabitlerse düzeltme yerine yeni kayıt |
| `version`, `created_by/at`, `updated_by/at` | sürüm çakışması ve denetim |

**`customer_files`** (ayrı depolama kaydı)
- `id`, `company_id`, `storage_key`, `kind` (`pdf` / `jpeg` / `png`), `size_bytes`, `pages`.
- `enc_key_id`, `ciphertext_sha256`: bütünlük için şifreli içeriğin özeti. Düz içeriğin özeti tutulmaz; özet, "bu belge sizde var mı" sorusuna cevap vermesin.
- `created_by`, `created_at`.

**`customer_document_files`** (değiştirilemez sürümler)
- `document_id`, `file_id`, `side` (`front` / `back` / `page`), `version_no`.
- Bir belgenin ön ve arka yüzü ayrı dosyalardır.

Araç belgeleriyle **tablo paylaşılmaz.** Paylaşılan yalnız koddur:
- içerik doğrulaması (PDF etkin içerik reddi, görsellerin yeniden kodlanıp EXIF/GPS silinmesi);
- zararlı dosya tarayıcısı kapısı;
- erişim izni deposu: kaynak türü alanıyla genelleştirilir (`vehicle_document_file` / `customer_document_file`).

**Veritabanı kuralları:**
- `(company_id, number_lookup)` geçersiz sayılmamış kayıtlarda kısmi tekildir. Aynı numara şirket içinde iki kişide etkin olamaz; iki farklı şirkette olabilir.
- Tetikleyici `company_id`, `customer_id` ve `type`'ın değişmesini engeller.
- `acarvo_app` rolü için yetkiler:
  - `customer_documents`: SELECT / INSERT / UPDATE;
  - dosya tabloları: SELECT / INSERT;
  - **DELETE hiçbir tabloda yok.**
- Belge numarası düz metin olarak hiçbir sütunda bulunmaz. Bunu bir test doğrular: veritabanının tamamı sentetik numara için taranır.

---

## 3. Hassas numaraların şifrelenmesi

### 3.1 Şifreleme
- AES-256-GCM, Node `crypto`, harici kütüphane yok.
- Kayıt başına 12 baytlık rastgele IV ve 16 baytlık doğrulama etiketi kullanılır.
- **Ek doğrulama verisi (AAD):** `company_id | document_id | "number"`. Şifreli değer başka bir satıra veya şirkete kopyalanırsa çözülemez.
- Saklama biçimi: `number_ciphertext = 0x01 (biçim) | IV | etiket | şifreli metin`, ve ayrı sütunda `number_key_id` (`k1`).
- Numara şifrelenmeden önce normalize edilir: boşluk ve tire atılır, büyük harfe çevrilir. Görüntülenen biçim personelin yazdığı haliyle şifrelenir.

### 3.2 Uygulama içi kurallar
- Şifre çözme yalnız iki yerde yapılır: `POST …/reveal-number` ve gerektiğinde M6 dışa aktarması. Liste, 360° ve normal belge yanıtları yalnız `number_hint` taşır.
- Çözülmüş değer:
  - hiçbir günlüğe, hata iletisine, işlem geçmişine, önbelleğe veya adrese yazılmaz;
  - yanıt `Cache-Control: no-store` taşır;
  - ön yüz değeri 30 saniye sonra bellekten siler; React Query önbelleğine yazılmaz.

### 3.3 Arama özeti (HMAC)
- `HMAC-SHA256(lookupKey, company_id | type | issuing_country | normalize(numara))`.
- Şirkete ve türe özgüdür; şirketler arasında karşılaştırılamaz.
- Yalnız tam eşleşme yapılır: şirket içinde mükerrer belge önerisi ve tam numarayla arama.
- Kısmi arama ve `LIKE` yoktur.

---

## 4. Şifreleme anahtarlarının kurulumu, ayrı yedeklenmesi ve yenilenmesi

### 4.1 Anahtarlar

| Ortam değişkeni | İçerik |
|---|---|
| `CUSTOMER_DATA_KEYS` | anahtar halkası: `k1:<base64 32 bayt>` (yenilemeden sonra `k1:…,k2:…`) |
| `CUSTOMER_DATA_KEY_ACTIVE` | yeni şifrelemelerde kullanılan anahtar kimliği (`k1`) |
| `CUSTOMER_LOOKUP_KEYS` / `CUSTOMER_LOOKUP_KEY_ACTIVE` | arama özeti için ayrı anahtar halkası |
| `CUSTOMER_FILE_ENCRYPTION` | `on` (öneri; §6 ve [K-4]) |

Veri anahtarı ile arama anahtarı ayrıdır: birinin sızması diğerini açığa çıkarmaz.

### 4.2 Oluşturma (sizin çalıştıracağınız betik)

```
node scripts/customer-keys.mjs generate --out "C:\Users\<siz>\Documents\acarvo-anahtarlar\customer-keys.env"
```

- Anahtarlar `crypto.randomBytes(32)` ile üretilir.
- **Ekrana anahtar yazılmaz.** Ekranda yalnız anahtar kimliği ve kısa parmak izi görünür (anahtarın SHA-256 özetinin ilk 8 karakteri, ör. `k1 · 3f9a1c22`); parmak izi anahtarı açığa çıkarmaz.
- Dosya proje klasörünün **dışına** yazılır. Betik proje klasörü içine yazmayı reddeder. Windows'ta dosya izinleri yalnız sizin kullanıcınızla sınırlandırılır.
- `.env`'e ekleme:
  - **öneri:** dosyadaki iki satırı kendiniz `.env`'e kopyalarsınız;
  - alternatif: `--append-env` bayrağıyla betik değeri göstermeden ekler. Bu bayrağı yalnız siz çalıştırırsınız.
- **Ben anahtar değerlerini görmem, okumam, sohbete yazmam; `.env` dosyasını düzenlemem.**

### 4.3 Doğrulama

```
node --env-file=.env scripts/customer-keys.mjs check
```

- Biçimi ve uzunluğu doğrular.
- Etkin anahtarın halkada olduğunu doğrular.
- Bellekte deneme şifreleme ve çözme yapar.
- Parmak izlerini gösterir.
- `--db` ile salt okunur sorguyla her anahtar kimliğiyle kaç kayıt şifrelendiğini sayar. Hiçbir değeri göstermez.
- API başlarken aynı denetimi yapar. Anahtar yoksa veya bozuksa:
  - geliştirmede belge numarası alanı kapanır ve ekranda "Şifreleme anahtarı yapılandırılmadı" uyarısı çıkar. Numarasız belge kaydı ve dosya yükleme, dosya şifrelemesi açıksa kapanır; bkz. [K-4];
  - üretimde `productionWarnings` uyarı verir ve numara ile dosya yazma `503` döner.

### 4.4 Ayrı yedekleme (sizin sorumluluğunuzda) [K-5]
- Anahtar dosyası **veritabanı yedeğinden ayrı** iki yerde saklanmalıdır. Örnek:
  1. şifreli bir parola yöneticisi;
  2. çevrim dışı şifreli bir USB veya ikinci bir güvenli konum.
- `backup-db.mjs` anahtarları yedeğe **katmaz**. Yedek raporu "anahtarlar ayrı yedeklenmeli; parmak izi k1 · 3f9a1c22" satırını yazar. Böylece hangi yedeğin hangi anahtarla açılacağı bilinir.
- **Anahtar kaybolursa** numaralar ve şifreli dosyalar geri açılamaz. Kalanlar: son karakterler, tarihler, türler, doğrulama bilgisi. Belgeler yeniden girilmelidir. Bu risk M2 kurulum ekranında ve teknik belgede açıkça yazılır.
- Geri yükleme provası: yedek ve anahtar dosyasıyla `acarvo_test` üzerinde betikli deneme (`check --db`). M2 sonunda bir kez yapılır.

### 4.5 Yenileme (rotation)
1. `generate --rotate` yeni anahtar ekler (`k2`). Siz `.env`'deki halkayı güncellersiniz ve etkin anahtarı `k2` yaparsınız. API yeniden başlar; yeni kayıtlar `k2` ile şifrelenir, eski kayıtlar `k1` ile okunmaya devam eder.
2. `node --env-file=.env scripts/customer-keys.mjs reencrypt --dry-run`, ardından gerçek çalıştırma:
   - **önce doğrulanmış yedek** alınır (yedek alınamazsa çalışmaz);
   - kayıtlar ve dosyalar küçük partiler halinde işlenir;
   - her parti kendi işleminde yapılır; yarıda kalırsa kaldığı yerden devam eder;
   - şirket başına işlem geçmişine özet yazılır (değer yok);
   - sonunda `check --db` hiçbir kaydın `k1` kullanmadığını göstermelidir.
3. `k1` halkadan çıkarılır ama yedek anahtar dosyasında belirlenen süre tutulur (eski yedekleri açabilmek için).
4. Arama anahtarı yenilemesi: aynı betik numaraları çözüp yeni özet üretir. Geçiş süresince iki özet anahtar kimliğiyle okunur.

Sızıntı şüphesinde aynı adımlar acil olarak uygulanır; kontrol listesi teknik belgede yer alır.

### 4.6 Test ortamı
- API ve tarayıcı testleri her çalıştırmada **kendi rastgele test anahtarlarını** üretir ve yalnız test API sürecine verir.
- Ana `.env`'deki anahtarlara dokunulmaz; testler onları okumaz.

---

## 5. Ülkeye göre yapılandırılabilir belge gereksinimleri [K-6, K-7]

**`document_requirement_policies`**: `company_id`, `country` (şube ülkesi), `residency_class` (`local` / `foreign`), `version`, `active`, `effective_from`, `created_by`. Bir politika değişmez; değişiklik yeni sürüm olarak açılır.

**`document_requirement_items`**: bir politikanın maddeleri.
- Her madde bir **seçenek grubudur**. Örnek: "Kimlik kartı **veya** oturma izni **veya** pasaport".
- `accepted_types[]`, `evidence` (`original_seen` / `copy_required` / `copy_optional`) ve `must_cover_rental` (bayrak; kontrolü Kiralama modülü yapar).

**Kurallar:**
- **Varsayılan politika yoktur.** Politika tanımlanmamış bir ülke için ekranda şu yazar: "Bu ülke için belge gereksinimi tanımlanmamış. Belgeler kaydedilebilir; zorunluluk gösterilmez."
- Spec'teki örnek, **hazır şablon** olarak sunulur:
  - Yerel: kimlik + ehliyet;
  - Yabancı: pasaport + giriş damgası + ehliyet.

  Şirket sahibi bir ülke için açıkça "Bu şablonla başla" demedikçe hiçbir yerde geçerli olmaz. Şablon ekranında "hukuken doğrulanmamıştır; ülke mevzuatına göre düzenleyin" uyarısı bulunur.
- `evidence`, bazı ülkelerde kimlik fotokopisi saklamanın kısıtlı olabileceği gerçeğine karşı esneklik sağlar. "Aslı görüldü" yeterli sayılabilir ve dosya yüklemek zorunlu olmaz. Hangi ülkede ne seçileceğine şirket sahibi hukuk danışmanıyla karar verir.
- **Ekran:** sahibe özel yeni bir sayfa: "Ayarlar → Müşteri belge gereksinimleri". Ülke listesi, Yerel/Yabancı sütunları, maddeler ve sürüm geçmişi yer alır. Yeni izin `settings.documents.manage` gerekir. Ayarlar modülünün ilk parçası olur. [K-7]

**Değerlendirme** (saf fonksiyon, tek doğru kaynak): kişinin belgeleri + politika + değerlendirme tarihi → madde başına şu durumlardan biri:
- `ok`;
- `expiring` (N gün);
- `expired`;
- `missing`;
- `unverified` (`original_seen` istenmiş ama doğrulanmamış);
- `copy_missing` (dosya istenmiş ama yok).

Hiçbir sonuç rezervasyonu engellemez (§9.2). Kiralamadaki engelleme Kiralama modülüne aittir.

---

## 6. Belge dosyalarının güvenli depolanması [K-4]

**Öneri: müşteri belge dosyaları diskte şifreli saklanır.** Araç belgeleri bugün şifresiz duruyor; kimlik görüntüsü ise numaradan daha hassastır.

- **Yükleme sırası:**
  1. boyut ve tür kontrolü (ilk baytlara göre);
  2. zararlı dosya tarayıcısı (üretimde zorunlu);
  3. görseller yeniden kodlanır (EXIF/GPS silinir); PDF'te etkin içerik reddedilir;
  4. **AES-256-GCM ile şifrelenir.** AAD: `company_id | file_id | "file"`. Anahtar halkası aynıdır, `enc_key_id` saklanır;
  5. depoya `customers/<şirket>/<yıl>/<uuid>.bin` olarak yazılır. Dosya adında kişisel veri ve uzantı yoktur.
- **Gösterim:**
  - Erişim izni modeli kullanılır: `POST /api/customer-files/:id/access`, ardından `GET`.
  - Sunucu dosyayı bellekte çözer ve akışla gönderir. `no-store`, `nosniff`, sandbox CSP ve `Content-Disposition` başlıkları uygulanır.
  - Küçük önizleme görselleri de saklanmaz; istendiğinde bellekte üretilir.
- **Boyut:** belge başına en fazla 10 MB; ön, arka ve ek sayfa sınırı 4 dosya.
- **Yedekler:** depolama klasörünün yedeği zaten şifreli içerik taşır.
- **Silme:** dosya fiziksel olarak silinmez. Belge geçersiz sayılsa da dosya kalır; temizleme M6 ve saklama kararlarına bağlıdır (otomatik silme yok).

Alternatif: araç belgeleri gibi şifresiz saklama. Daha basit, ama disk veya yedek kopyası ele geçerse kimlik görüntüleri açıkta olur. **Önermem.**

---

## 7. Yetkiler (ana plan §9.3 ile aynı, en az yetki) [K-8]

| İzin | Ne sağlar | Sahip | Yönetici | Operasyon |
|---|---|---|---|---|
| `customers.documents.read` | belge kayıtları, durum, maskeli numara, dosya **varlığı** (sayfa sayısı) | ✓ | ✓ | ✓ |
| `customers.documents.manage` | ekleme, düzeltme, dosya yükleme, doğrulama, yenileme, geçersiz sayma; numarayı **yazma** | ✓ | ✓ | ✓ |
| `customers.documents.view` | dosyayı tarayıcıda açma ("görüntüleme istendi" kaydı) | ✓ | ✓ | — |
| `customers.documents.download` | dosyayı indirme ("indirme istendi" kaydı) | ✓ | — | — |
| `customers.identity.reveal` | tam numarayı açma ("numara gösterildi" kaydı) | ✓ | — | — |
| `branches.manage` | şube ülkesini girme (§1.5) | ✓ | — | — |
| `settings.documents.manage` | belge gereksinimi politikaları (§5) | ✓ | — | — |

**Kurallar:**
- Hazır rollere `ROLE_PRESET_HISTORY` v4 ile eklenir. Değiştirilmiş hazır rollere ve özel rollere dokunulmaz.
- Yükleyen kişi, yüklediği dosyayı yükleme anında kendi cihazında görür. Sonradan açabilmesi için `view` izni gerekir.
- **Numarayı açma** ayrıca şunları ister [K-9]:
  - neden seçimi: sözleşme hazırlama, resmi makam talebi, belge doğrulama veya diğer; neden sabit listeden seçilir;
  - kullanıcı başına saatte 30 açma sınırı;
  - işlem geçmişine kim, ne zaman, hangi belge ve hangi nedenle bilgisi yazılır; **numara yazılmaz**.
- **Erişim:** şirket içi tüm şubelerde M1'deki gibidir. Hassas işlemler şubeye değil izne bağlıdır. Şirketler arası erişim yoktur; başka şirketin kaydı 404 döner.

---

## 8. Müşteri 360° Belgeler sekmesi tasarımı

V5 dili ve M1 müşteri dosyası düzeni korunur. Araç belgeleri sekmesinin kopyası olmaz; kişi belgesine göre düzenlenir.

**1. Üst özet: "Belge durumu"** (geniş ekranda tam genişlik kart)
- Bağlam satırı: "Bosna-Hersek şubeleri için · İkamet ettiği ülke: Almanya · Uyruk: Almanya".
- **Ön değerlendirme** [K-10]: "Yabancı (ikamet) olarak değerlendirilirse". Altında açıklama: "Kesin sınıflandırma kiralama başında personelce yapılır."
  - İkamet ülkesi girilmemişse iki sütun yan yana gösterilir: "Yerli olarak değerlendirilirse" ve "Yabancı olarak değerlendirilirse".
- Madde satırları: belge veya seçenek grubu, durum (yazı + simge; renk tek başına anlam taşımaz) ve kalan gün.
- Şirketin birden çok ülkede şubesi varsa ülke seçicisi bulunur.
- Politika yoksa dürüst bir boş durum ve sahibe "Belge gereksinimlerini tanımla" bağlantısı gösterilir.

**2. Belgeler listesi** (tür sırasıyla; geçersiz sayılanlar katlanmış "Geçmiş belgeler" bölümünde)
- Satır başlığı: tür ve veren ülke ("Pasaport · Almanya").
- Numara: "•••• 4821". Yanında yetkiye bağlı "Numarayı göster".
- Geçerlilik: "12.03.2027'ye kadar · 152 gün". 30 gün içinde ise turuncu "14 gün kaldı"; geçmişse kırmızı "Süresi doldu".
- Doğrulama: "Aslı görüldü · Selma Karić · 10.10.2026" veya "Doğrulanmadı".
- Dosyalar: "Ön yüz · Arka yüz". Yetkiye göre "Görüntüle" veya "İndir"; yetki yoksa "Dosya yüklü (2) · görüntüleme yetkiniz yok".
- Eylemler: Düzenle, Yeni dönem (yenileme), Geçersiz say (neden seçimiyle).

**3. Belge ekle / düzenle** (mevcut yan panel)
- Tür seçilince ilgili alanlar açılır.
- Numara alanı: `autocomplete="off"`, `spellcheck="false"`. Kaydettikten sonra numara bir daha formda gösterilmez; düzenlemede "Numarayı değiştir" ayrı bir alandır.
- Dosya bölümü: ön yüz, arka yüz ve ek sayfa. Politika "yalnız aslı görülsün" diyorsa dosya bölümü isteğe bağlı olarak işaretlenir.
- Not: "Numara şifreli saklanır; ekranlarda yalnız son karakterleri görünür."

**4. Numarayı göster**
- Önce neden seçimi istenir.
- Numara satır içinde 30 saniye görünür. Geri sayım ve "Gizle" düğmesi vardır. Kopyalama düğmesi yoktur [K-9].

**5. Diğer ekranlar**
- **Müşteriler listesi:** "Belgeler" sütununda en acil madde gösterilir (araç listesindeki desen). Filtreler: "Belge uyarısı" ve "Süresi dolmuş".
- **Müşteri başlığı:** "Kimlik ve ehliyet belgeleri" satırı M1'deki "Sonraki aşamada" yerine gerçek durumu gösterir.

**Ekran hedefleri:**
- **1440:** özet ve liste iki sütunlu düzende.
- **768:** tek sütun.
- **390:** maddeler alt alta; panel tam ekran; numara ve geri sayım satır içinde; sabit kaydetme alanı son alanları kapatmaz.

---

## 9. Geçerlilik tarihleri ve süre uyarıları [K-11]
- Tüm tarihler takvim tarihidir; saat dilimi çevrimi yapılmaz. "Bugün" sunucuda şirket saat diliminde hesaplanır (araç belgelerindeki `companyToday`).
- **Durumlar:**
  - **Geçerli**;
  - **Yaklaşıyor**: son geçerliliğe 30 gün veya daha az; önerilen varsayılan, politika maddesinde değiştirilebilir;
  - **Süresi dolmuş**;
  - **Süresiz**: son geçerlilik boş ve tür buna izin veriyorsa (kimlik, oturma izni);
  - **Başlamadı**: geçerlilik başlangıcı ileri bir tarihte.
- **Giriş kaydı:** yalnız giriş tarihi gösterilir. Kalış süresi veya vize süresi **hesaplanmaz** (ülkeye özgü hukuk).
- Kiralama tarihlerini kapsama kontrolü Kiralama modülünde yapılır. M2 bu kontrol için veriyi ve saf fonksiyonu hazırlar, testini yazar, ama hiçbir işlemi engellemez.
- Bildirim veya e-posta gönderilmez (§59CW). Uyarılar yalnız ekranda görünür.

---

## 10. Veri minimizasyonu, işlem geçmişi ve kişisel veri güvenliği

**Toplanmayanlar:**
- MRZ, belge fotoğrafından yüz görüntüsü, OCR ile otomatik okuma;
- doğum yeri, anne ve baba adı, kan grubu, belgedeki adres;
- izin türünün serbest metin açıklaması;
- kişisel numaralar (ör. JMBG, TC kimlik no) ayrı alan olarak.

**Kurallar:**
- **Zorunlu dosya yoktur.** Politika "dosya gerekli" demedikçe dosya yüklemek isteğe bağlıdır.
- **URL:** numara hiçbir zaman adres satırına girmez. Numarayla arama yalnız `POST` gövdesiyle yapılır (`/api/customers/document-lookup`), hız sınırlıdır ve yalnız tam eşleşme döner.
- **API yanıtları:** yalnız `number_hint`; tam numara yalnız reveal ucundan gelir.
- **Hata iletileri:** girilen değeri yansıtmaz. Tekillik çakışmasında genel bir ileti döner: "Bu belge numarası şirketinizde başka bir müşteride kayıtlı". Eşleşen kişi maskeli özetle, yalnız yetkili kullanıcıya gösterilir.
- **Günlükler:** M1'de kurulan kurallar (sorgu dizesi ve gövde yok, sorgu parametresi yok) geçerlidir. Ek olarak çözülen veri hiçbir değişkende günlüğe gitmez. Bunu otomatik testler doğrular.
- **İşlem geçmişi (`customer.document.*`):**
  - yazılanlar: tür, veren ülke, değişen alan adları, doğrulama, geçersiz sayma nedeni, dosya sürümü, görüntüleme ve indirme isteği, numara açma (neden ile);
  - **yazılmayanlar:** numara, numaranın son karakterleri, dosya içeriği, dosya adı.
- **Dosya adı:** yüklenen dosyanın özgün adı saklanmaz (çoğu zaman kişinin adını içerir). Yalnız tür ve sayfa bilgisi tutulur.
- **Otomatik silme yoktur.** Saklama süresi ve temizleme M6 ve hukuk kararlarına bağlıdır.

---

## 11. Veritabanı ve API özeti

**Migration'lar** (yalnız ekleme; `0014`–`0016` civarı):
1. `customers.residence_country` ve `branches.country`: boş sütunlar, mevcut veri değişmez;
2. belge tabloları ve RLS;
3. gereksinim politikası tabloları.

Uygulama sırası: test provası → dry-run → doğrulanmış yedek → ana veritabanı → parmak izi karşılaştırması. Ana veritabanına veri eklenmez; politika şablonu da otomatik eklenmez.

**API uçları** (hepsi `withCompany` + izin + CSRF):
- **Belgeler:**
  - `GET/POST /api/customers/:id/documents`; `PUT …/:docId`;
  - `POST …/:docId/verify`, `…/renew`, `…/void`;
  - `POST …/:docId/files` (yükleme hız sınırı mevcut 40/dk);
  - `POST …/:docId/reveal-number` (neden zorunlu; saatte 30);
  - `POST /api/customers/document-lookup`.
- **Dosyalar:** `POST /api/customer-files/:id/access` ve `GET /api/customer-files/:id` (izin, Fetch Metadata, mod).
- **Gereksinimler:** `GET/POST /api/settings/document-requirements` (sürüm açma); `GET /api/customers/:id/document-status?country=`.
- **Şubeler:** `PUT /api/branches/:id/country`; `POST /api/branches/apply-company-country`.

**Mükerrer önerisi:** aynı belge numarası (özet üzerinden) güçlü öneri olarak eklenir; neden metni "Aynı belge numarası". Yalnız `customers.documents.read` yetkilisine gösterilir.

---

## 12. Geliştirme aşamaları ve testler

**Her aşamada:**
- gerçek arka uç, PostgreSQL güvenliği ve ön yüz;
- mevcut **215 API ve 55 tarayıcı** testi korunur;
- typecheck ve build hatasız;
- ekranlar 1440, 768 ve 390'da incelenir;
- ana veritabanı migration'ı yalnız doğrulanmış yedekle yapılır.

| Aşama | İçerik | Ana testler |
|---|---|---|
| **M2a — Anahtar altyapısı** (migration yok) | şifreleme kitaplığı (AAD, anahtar halkası), HMAC, `customer-keys.mjs` (generate / check / rotate / reencrypt), başlangıç denetimi, test anahtarları, kurulum belgesi | gidiş-dönüş; AAD değişince çözülmeme; yanlış anahtar; eski anahtarla okuma; anahtar yokken güvenli kapanma; betiğin anahtarı ekrana basmaması ve proje içine yazmayı reddetmesi |
| **M2b — İkamet ülkesi ve şube ülkesi** | 2 boş sütun; formda "İkamet ettiği ülke"; 360°'ta üç ayrı bilgi (uyruk, ikamet ülkesi, M1 sınıflandırması); şube ülkesi ekranı ve `branches.manage`; "şirket ülkesini uygula" | mevcut kayıtların değişmemesi; ikamet ülkesinin hiçbir alandan hesaplanmaması; işlem geçmişi; yetkiler |
| **M2c — Belge kayıtları** | `customer_documents`; şifreli numara, ipucu ve özet; ekleme, düzeltme, doğrulama, yenileme, geçersiz sayma; geçerlilik durumları; mükerrer belge önerisi; numarayla arama | veritabanında düz numara olmaması (tam tarama); şirket içi tekillik ve şirketler arası serbestlik; özetin şirkete özgü olması; RLS ve izolasyon; DELETE yok; günlük, hata ve adreste numara olmaması; sürüm çakışması |
| **M2d — Şifreli dosyalar ve yetkiler** | yükleme, şifreleme ve depolama; erişim izni genelleştirme; view, download ve reveal ayrımı; reveal nedeni ve hız sınırı; rol yükseltme v4 | diskteki dosyanın şifreli olması (JPEG ve PDF başlığı bulunmaması); izin matrisi; Fetch Metadata; reveal işlem geçmişi (değersiz); hız sınırı; araç belgelerinin bozulmaması |
| **M2e — Gereksinim politikaları ve 360° sekmesi** | politika tabloları ve ayar ekranı; şablon; değerlendirme fonksiyonu; Belgeler sekmesi; liste sütunu ve filtre; başlıktaki durum satırı | politika yokken zorunluluk gösterilmemesi; seçenek grupları; evidence kuralları; ülke ve ikamet sınıfı; tarih durumları (şirket bugünü); tarayıcı akışları; erişilebilirlik; 390 |
| **M2f — Kalite ve ana veritabanı** | uçtan uca tarama, ekran görüntüleri, belge güncellemeleri, yedek ve anahtarla geri yükleme provası (test veritabanında), ana veritabanı migration'ları | tam test takımı; parmak izi; güvenlik anlık görüntüsü |

**Ana veritabanı için ön koşul:** M2c migration'ı ana veritabanına uygulanmadan önce sizin anahtarları oluşturup `.env`'e eklemeniz ve ayrı yedeklemeniz gerekir (§4.2–4.4). Ben `check` çıktısındaki parmak izleriyle doğrularım.

---

## 13. Onayınızı gerektiren kararlar

1. **K-1 M1 `residency` alanı:**
   - öneri **(A)**: korunur, "Kayıtlı ikamet sınıflandırması (M1, referans ülke belirtilmemiş)" olarak etiketlenir, M2'de zorunlu kalır; kiralamada yalnız bilgi olarak gösterilir; kaldırılması sonra ayrı onayla;
   - **(B)**: zorunluluk M2'de kaldırılır;
   - **(C)**: değerler ikamet ülkesine çevrilir (önermem).
2. **K-2 Şube ülkesi:** boş sütun, sahibin girmesi ve isteğe bağlı "şirket ülkesini tüm boş şubelere uygula" eylemi uygun mu? Ana veritabanındaki 4 şube için bu eylemi M2 sonunda siz mi yaparsınız, yoksa onayınızla ben mi?
3. **K-3 Belge türleri listesi:** §2.1 (uluslararası sürücü belgesi, vize ve diğer dahil) uygun mu?
4. **K-4 Dosya şifreleme:** müşteri belge dosyaları diskte şifreli saklansın mı (öneri), yoksa şifresiz mi?
5. **K-5 Anahtar yönetimi:**
   - anahtarı siz mi oluşturursunuz (öneri: betikle siz, proje dışına);
   - `.env`'e kendiniz mi eklersiniz (öneri) yoksa `--append-env` ile mi;
   - iki ayrı yedek yeri neresi olacak?
6. **K-6 Varsayılan belge politikası:** hiçbir ülkeye kendiliğinden politika uygulanmaz, spec örneği yalnız açıkça seçilen şablon olur (öneri). Uygun mu?
7. **K-7 Gereksinim ayar ekranı:** "Ayarlar → Müşteri belge gereksinimleri" M2'nin parçası olsun mu (öneri), yoksa politikalar M2'de yalnız veritabanı ve API düzeyinde kalıp ekran Ayarlar modülüne mi bırakılsın?
8. **K-8 Rol dağılımı:** §7 tablosu (Operasyon dosya açamaz; Yönetici yalnız görüntüler; indirme ve tam numara yalnız Sahip) onaylı haliyle kalsın mı?
9. **K-9 Numara açma:**
   - neden seçimi zorunlu olsun mu (öneri: evet);
   - saatte 30 sınırı uygun mu;
   - kopyalama düğmesi olmasın mı (öneri: olmasın)?
10. **K-10 360° ön değerlendirmesi:** ikamet ülkesi ile şube ülkesi karşılaştırılarak "Yabancı olarak değerlendirilirse" ön görünümü gösterilsin mi (öneri: evet, açıkça "kesin karar kiralamada personelce" notuyla), yoksa 360°'ta yalnız belgeler listelensin mi?
11. **K-11 Uyarı süresi:** "Yaklaşıyor" eşiği varsayılan 30 gün, politika maddesinde değiştirilebilir. Uygun mu?
12. **Hukuki içerik:** hangi ülke için hangi belgelerin zorunlu olduğu ve kimlik fotokopisi saklamanın serbest olup olmadığı ülke mevzuatına bağlıdır. Uygulama yalnız yapılandırma altyapısını sağlar. Bosna-Hersek için politikayı siz veya hukuk danışmanınız mı belirleyecek?

---

Planı ve kararları onayladığınızda M2a'dan başlayarak aşamaları sırayla geliştiririm. Ana veritabanına geçen her aşama öncesinde ve M2 sonunda onayınızı alırım.
