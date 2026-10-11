# ACARVO — M2 Geliştirme Raporu (Müşteri belgeleri)

Dal: `musteriler-m2` (worktree: `Desktop/acarvo-m2`; ana çalışma klasörü ve 3001/5173 sunucuları `main` üzerinde dokunulmadan çalışmaya devam eder).
Plan ve kararlar: `docs/M2_MUSTERI_BELGELERI_PLANI.md` §0.

Sınırlar: ana `acarvo` veritabanına M2 migration'ı uygulanmaz (yalnız dry-run), `.env` değiştirilmez, gerçek anahtar üretilmez, push yapılmaz, M3 ve sonrası başlamaz. Testler yalnız `acarvo_test` üzerinde ve geçici sentetik anahtarlarla çalışır.

## Aşama 0 — Hazırlık
- Dal ve worktree oluşturuldu; bağımlılıklar worktree'ye ayrıca kuruldu.
- Test yapılandırmaları `.env` konumunu `ACARVO_ENV_FILE` değişkeninden okuyabilir (ikinci worktree, `.env` kopyalanmadan çalışır). Davranış değişikliği yok: değişken yoksa eskisi gibi depo kökündeki `.env` kullanılır.
- Plan §0'a kesinleşen kararlar yazıldı.

## Aşama M2a — Şifreleme altyapısı (commit `6e5af33`)
- `apps/api/src/lib/customer-crypto.ts`:
  - AES-256-GCM; her şifrelemede 96 bit rastgele nonce ve 128 bit doğrulama etiketi.
  - Anahtar şirket başına HKDF-SHA256 ile türetilir.
  - Ek doğrulama verisi (AAD) = şirket + tür (numara/dosya) + kayıt kimliği. Başka kayda veya şirkete taşınan değer çözülmez.
  - Sürümlü anahtar halkası (`k1`, `k2`…); anahtar kimliği değerin yanında saklanır, yenilemeye hazırdır.
  - Ayrı ve şirkete özgü HMAC arama anahtarı.
  - Anahtar yoksa veya hatalıysa sistem kapalı kalır; şifresiz kayda geri dönüş yoktur.
- `scripts/customer-keys.mjs generate|rotate`:
  - anahtar dosyasını yalnız proje dışına yazar ve var olan dosyanın üzerine yazmaz;
  - Windows'ta dosyayı yalnız kullanıcıya açar;
  - ekrana yalnız anahtar kimliği ve parmak izi yazar.
- `backup-db.mjs` raporu anahtarların yedekte olmadığını ve parmak izlerini yazar.
- Testler her çalıştırmada geçici sentetik anahtar üretir; `.env`'deki anahtarlara dokunulmaz. Gerçek anahtar üretilmedi.
- Testler: `customer-crypto.test.ts` (13).

## Aşama M2b — İkamet ülkesi ve şube ülkesi
- **Migration `0014_residence_and_branch_country`** (yalnız ekleme ve gevşetme; veri değişmez):
  - `customers.residence_country` (boş);
  - `branches.country` (boş);
  - `customers.residency` NOT NULL kaldırıldı.
- **API:**
  - `residenceCountry` alanı; liste filtresi.
  - M1 sınıflandırması yeni kayıtlarda zorunlu değil. Güncelleme alanı göndermezse kayıtlı değer korunur.
  - Şube ülkesi uçları: `PUT /api/branches/:id/country`, `POST /api/branches/country/preview`, `POST /api/branches/country/apply` (açık onay zorunlu, eski önizlemeye karşı korumalı). Yeni izin `branches.manage`; her değişiklik işlem geçmişinde.
- **Kiralama hazırlığı:** `suggestRentalResidency(ikametÜlkesi, şubeÜlkesi)` (yalnız öneri; uyruk girdisi yok) ve `RentalResidencySnapshot` tipi. Kesin karar üretilmez.
- **Yetkiler:** M2 izinleri hazır rollere eklendi (`ROLE_PRESET_HISTORY` v4). Özel ve değiştirilmiş rollere dokunulmaz.
- **Arayüz:**
  - Form: "İkamet ettiği ülke"; eski zorunlu Yerli/Yabancı seçimi kaldırıldı. Eski değer düzenlemede salt okunur gösterilir ve korunur.
  - 360°: ikamet ülkesi, uyruk ve (varsa) "Eski sınıflandırma (M1)" ayrı gösterilir.
  - Liste: "İkamet ve uyruk" sütunu; ikamet ülkesi filtresi; M1 filtresi "Eski sınıflandırma (M1)" adıyla korundu.
  - Şubeler ekranı: ülke sütunu, sahibe satır içi düzenleme, toplu atama (önizleme + "Onayla ve uygula").
- **Test verisi (yalnız `acarvo_test`):** sentetik müşterilere ikamet ülkeleri, Drina şubelerine `BA`. Neretva boş bırakıldı (toplu atama testi için).
- **Mevcut testlerde karar gereği değişen beklentiler:**
  - M1 sınıflandırması artık zorunlu değil;
  - rol yükseltme listeleri M2 izinlerini içeriyor;
  - formda Yerli/Yabancı seçimi yok.
- **Testler:** API `customer-residence.test.ts` (8); tarayıcı `branches-residence.spec.ts` (5); güncellenen `customers.spec.ts`.
- **Not:** worktree'de `safe-migrate --test`, migrate komutunu varsayılan `.env` yoluyla çağırdığı için durdu. Yedek alınmıştı; migration test veritabanına doğru ayarlarla elle uygulandı. Ana veritabanı geçişi `main` klasöründen yapılacağından etkilenmez.

## Aşama M2c — Müşteri belge kayıtları
- **Migration `0015_customer_documents`:** `customer_documents`, `customer_files`, `customer_document_files`, `user_sensitive_actions` tabloları.
- **Migration `0016_customer_documents_rls`:**
  - üç belge tablosunda zorunlu RLS ve 4 politika;
  - tetikleyiciler:
    - şirket, müşteri, tür, oluşturma bilgisi ve yenileme bağı değişmez;
    - geçersiz sayılan dönem kesindir;
    - kilitli dönem düzeltilemez;
    - bir numara şirket içinde aynı anda yalnız bir müşteride etkindir; eşzamanlı kayıtlar sıraya alınır;
    - yenileme yalnız aynı müşteri ve türde yapılabilir;
  - çalışma rolüne DELETE verilmez; dosya ve sürüm tabloları yalnız eklemeye açıktır.
- Bütün belge tabloları bileşik `(company_id, id)` yabancı anahtarla bağlıdır; başka şirketin müşterisine belge bağlanamaz.
- **API** (`modules/customers/documents.ts`):
  - listeleme; ekleme;
  - düzeltme: sürüm çakışması kontrollü; yeni numara yazılırsa değişir, boş bırakılırsa korunur;
  - doğrulama (aslı görüldü / yalnız kopya);
  - yenileme: eski dönem değişmeden kalır; "numara aynı kalsın" seçeneği numarayı bellekte çözüp yeni kayıt için yeniden şifreler;
  - gerekçeli geçersiz sayma;
  - belge geçmişi;
  - tam numarayla şirket içi arama: HMAC ile, hız sınırlı, numara yanıtta yok.
- Yanıtlarda yalnız maskeli numara (`••••1001`) bulunur.
- Belge olayları müşterinin kayıt geçmişinde de görünür; değer içermez.
- Geçerlilik durumları: geçerli, yaklaşıyor (30 gün), süresi dolmuş, süresiz, başlamadı, yenilendi, geçersiz. "Bugün" şirket saat dilimine göre hesaplanır.
- Test verisi (yalnız `acarvo_test`): sentetik `TEST-…` numaralı belgeler, çalıştırmaya özgü anahtarla şifreli. Aynı sentetik numara iki şirkette bulunur; bu, şirketler arası eşleşme olmadığını test eder.
- Tarayıcı testleri için API sunucusu ve test sıfırlaması aynı çalıştırma anahtarını kullanır (`E2E_CUSTOMER_KEYS`).
- **Testler:** `customer-documents.test.ts` (19). Kapsam:
  - veritabanında ve işlem geçmişinde düz numara bulunmaması (tam tarama);
  - taşınan şifreli değerin çözülmemesi;
  - şirketler arası erişimin kapalı olması;
  - anahtar yokken numara kaydının reddedilmesi;
  - günlüklerde numara bulunmaması;
  - mükerrer numaranın başka şirketi hiç sorgulamaması.

