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

## Aşama M2d — Şifreli dosyalar, yetkiler, numara açma ve anahtar yenileme
- **Yükleme** (`POST /api/customers/:id/documents/:docId/files?side=front|back|page`):
  - içerik ilk baytlardan tanınır; uzantıya ve tarayıcının bildirdiği türe güvenilmez;
  - PDF'te etkin içerik reddedilir; görseller yeniden kodlanır ve EXIF/GPS silinir;
  - dosya başına en fazla 10 MB, PDF en fazla 20 sayfa;
  - zararlı dosya taraması: üretimde tarayıcı yoksa yükleme kapalıdır;
  - dosya bellekte AES-256-GCM ile şifrelenip `customers/<şirket>/<yıl>/<uuid>.bin` olarak yazılır. Diskte düz kopya bulunmaz; kayıt yalnız şifreli içeriğin özetini tutar;
  - özgün dosya adı saklanmaz;
  - ön/arka yüz ve ek sayfa ayrı sürümlenir; eski sürümler korunur.
- **Görüntüleme ve indirme ayrı yetkilerdir:**
  - erişim izni modeli kullanılır (POST ile izin, ardından GET); izin oturum, şirket, dosya türü, dosya ve amaca bağlıdır; adreste anahtar veya belirteç yoktur;
  - Fetch Metadata denetimi, `no-store`, `nosniff` ve sandbox CSP;
  - her GET'te yetki yeniden denetlenir ve bütünlük (şifreli içeriğin özeti) kontrol edilir;
  - şirket değiştirme, çıkış ve yetki kaldırma erişimi hemen keser;
  - görüntüleme ve indirme istekleri işlem geçmişine yazılır (dosya adı ve içerik yazılmaz).
- **Rol matrisi** (testle doğrulandı):

  | Rol | Belge ekler | Görüntüler | İndirir | Tam numarayı görür |
  |---|---|---|---|---|
  | Operasyon | ✓ | — | — | — |
  | Yönetici | ✓ | ✓ | — | — |
  | Sahip | ✓ | ✓ | ✓ | ✓ (gerekçeyle) |

- **Tam numara açma** (`POST …/reveal-number`):
  - sabit listeden gerekçe zorunlu;
  - kullanıcı başına saatte en fazla 30; sayaç veritabanında tutulur (`user_sensitive_actions`), yeni oturum veya sunucu yeniden başlatma sınırı sıfırlamaz;
  - işlem geçmişine gerekçe yazılır, numara yazılmaz; yanıt önbelleğe alınmaz.
- **Anahtar yenileme:**
  - `lib/customer-key-rotation.ts` ve `npm run keys:reencrypt` (ana veritabanında önce doğrulanmış yedek, ardından küçük partiler; `--dry-run` yalnız sayar).
  - Geçersiz sayılmış ve kilitli belgeler de yenilenir. Migration `0017` buna yalnız şifreleme sütunları için izin verir; başka her değişiklik yine reddedilir.
  - Yarıda kesilen dosya yenilemesi bir sonraki çalıştırmada kurtarılır.
  - `npm run keys:check [-- --db]`: anahtarları ve (veritabanıyla) her değerin çözülebildiğini salt okunur doğrular; yalnız sayı ve parmak izi yazar.
- **Testler:**
  - `customer-document-files.test.ts` (12): diskte şifreli dosya; EXIF silme; sürümler; içerik reddi; zararlı dosya ve tarayıcı yok; rol matrisi; izin, oturum ve amaç bağı; çapraz site; şirket değiştirme, çıkış ve yetki kaldırma; başka şirket; taşınan şifreli dosya; numara açma ve sınırın yeniden başlatmaya dayanıklılığı;
  - `customer-key-rotation.test.ts` (5): deneme çalıştırması; partili yenileme; eski anahtar kaldırıldıktan sonra numara açma, dosya, arama ve tek numara kuralı; eski anahtarın artık açamaması; yarıda kesilen yenilemenin kurtarılması.
- **API toplamı:** 272/272.

## Aşama M2e — Ülke belge gereksinimleri ve Müşteri 360° Belgeler (commit `361418a`, `de0a838`)
- **Migration `0018`/`0019`:**
  - şirket uyarı günü ayarı (varsayılan 30);
  - ülke × Yerli/Yabancı (ikamet) için sürümlü politikalar; durum yalnız taslak → etkin → eski yönünde ilerler;
  - maddelerde alternatif belge türleri; "aslı görülmeli" ve "kopyası saklanmalı" ayrı ayarlar;
  - maddeler yalnız taslakta değişir (tetikleyici); zorunlu RLS.
- **Hiçbir ülke için kural kendiliğinden etkin değildir.** Spec örnekleri yalnız taslak başlatan pasif şablonlardır. Ana veritabanına politika eklenmez.
- **Ayarlar → Müşteri Belge Gereksinimleri** (yalnız Sahip):
  - "hukuken doğrulanmamıştır" uyarısı ve uyarı günü ayarı;
  - ülke başına Yerli/Yabancı sütunları;
  - taslak düzenleme;
  - etkinleştirme için mevzuat kontrolü onay kutusu zorunlu;
  - eski sürümler listelenir.
- **Müşteri 360° Belgeler sekmesi:**
  - durum özeti, şube ülkesi başına etkin politikaları **iki sınıf için yan yana** gösterir ve "karar personelindir" notu taşır; otomatik sınıflandırma yoktur;
  - belge listesi (maskeli numara, geçerlilik, doğrulama, dosyalar); önceki dönemler ve geçersiz sayılanlar katlanmış bölümde;
  - ayrıntı paneli: dosyalar, sürümler, görüntüleme/indirme, yükleme, doğrulama, işlem geçmişi;
  - ekleme, düzeltme ve yenileme formu;
  - gerekçeli, 30 saniyelik, kopyalama düğmesiz numara açma;
  - geçersiz sayma.
- Müşteri listesinde belge sorunları gösterilir ve filtrelenir; müşteri dosyası özetinde gerçek belge durumu yer alır.

## Aşama M2f — Entegrasyon ve kalite kontrolü

### Test sonuçları (yalnız `acarvo_test`, çalıştırmaya özgü sentetik anahtarlarla)

| | Önce (M1) | Şimdi |
|---|---|---|
| API (Vitest) | 215 | **283 / 283** |
| Tarayıcı (Playwright) | 55 geçen, 10 isteğe bağlı | **69 geçen**, 14 isteğe bağlı (ekran görüntüsü) |
| Tip kontrolü / üretim derlemesi | temiz | **temiz** |

- **Yeni API test dosyaları:**
  - `customer-crypto.test.ts` (13);
  - `customer-residence.test.ts` (8);
  - `customer-documents.test.ts` (20);
  - `customer-document-files.test.ts` (12);
  - `customer-key-rotation.test.ts` (5);
  - `document-requirements.test.ts` (10).
- **Yeni tarayıcı testleri:**
  - `branches-residence.spec.ts` (5);
  - `customer-documents.spec.ts` (7);
  - `mobile` (+1);
  - `a11y` (+1);
  - isteğe bağlı `customer-documents-screens.spec.ts`.
- Mevcut testlerde **karar gereği** değişen beklentiler:
  - M1 sınıflandırması artık zorunlu değil;
  - rol yükseltme listelerinde M2 izinleri var;
  - formda Yerli/Yabancı seçimi yok;
  - Belgeler sekmesi artık gerçek;
  - izolasyon tablosu listesi genişledi.

### İstenen güvenlik kontrolleri

Hepsi otomatik testle doğrulandı.

| Kontrol | Sonuç |
|---|---|
| Drina kullanıcısı Neretva müşteri belgelerini göremiyor; belge kimliğini bilmek erişim sağlamıyor | ✓ 404 |
| Operasyon yükler ama görüntüleyemez ve indiremez; Yönetici görüntüler ama indiremez; Sahip gerekçeyle numara açar | ✓ |
| Şifreli numara ve dosya doğru çözülüyor; başka kayda veya şirkete taşınan veri açılmıyor; yanlış anahtar başarısız | ✓ |
| Anahtar yenileme (partili, geçersiz sayılan ve kilitli dönemler dahil, yarıda kesilenin kurtarılması) | ✓ |
| Yetki kaldırma, şirket değiştirme ve çıkışta dosya erişimi hemen kesiliyor | ✓ |
| Görüntüleme ve indirme istekleri işlem geçmişinde; numara, dosya adı ve içerik yok | ✓ |
| Mükerrer numara kontrolü şirketler arasında veri sızdırmıyor (şirkete özgü HMAC) | ✓ |
| Belge süresi uyarıları şirket tarihiyle ve ayarlanabilir eşikle doğru | ✓ |
| İkamet ülkesi ve uyruk karışmıyor; birinden diğeri türetilmiyor | ✓ |
| Önceki belge ve dosya sürümleri korunuyor | ✓ |
| CSRF ve Origin kontrolleri (mevcut genel koruma; yeni uçlar aynı yoldan geçer) | ✓ |
| Üretimde zararlı dosya tarayıcısı yoksa yükleme reddediliyor | ✓ |
| Veritabanında, işlem geçmişinde ve günlüklerde düz numara yok; diskte düz dosya yok | ✓ (tam tarama) |

### Sprint içinde bulunan ve düzeltilen sorunlar
1. Numara açma ile dosya görüntüleme/indirme işlem geçmişine yazılıyordu ama açık panelde geçmiş yenilenmiyordu. Arayüz düzeltildi; tarayıcı testi yakaladı.
2. Numara açmada geri sayım ilk anda 31 saniye gösteriyordu; düzeltildi.
3. Geçersiz sayılan ve kilitli belgeler anahtar yenilemesini engelliyordu. Migration `0017` yalnız şifreleme sütunlarının değişmesine izin verir; başka her değişiklik yine reddedilir.
4. M1'den kalan rastgele başarısız olabilen bir test: işlem geçmişindeki rastgele kimlik "555" içerebiliyordu. Test tam değer arayacak şekilde düzeltildi.
5. Worktree'de `safe-migrate --test`, migrate komutunu varsayılan `.env` yoluyla çağırdığı için durdu. Yedek alınmıştı; test migration'ları doğru ayarlarla uygulandı. Ana veritabanı geçişi birleştirmeden sonra ana klasörden yapılacağı için etkilenmez.

### Ekran görüntüleri (`apps/e2e/screenshots/m2/`, yalnız test verisi)
- `01-belgeler-sekmesi-1440`
- `02-belge-ayrinti-1440`
- `03-numara-acma-1440`
- `04-belge-ekle-hatalar-1440`
- `05-belgeler-sekmesi-768` / `-390`
- `06-belge-ayrinti-768` / `-390`
- `07-ayarlar-1440` / `-390`
- `08-subeler-1440` / `-390`
- `09-operasyon-ayrinti-1440`: Operasyon kullanıcısında "Numarayı göster", Görüntüle ve İndir yok.
- M1 müşteri ekranları da güncel ikamet etiketleriyle yeniden alındı (`screenshots/musteriler/`).

### Ana veritabanına dokunulmadığının kontrolü
- `safe-migrate --dry-run` (salt okunur): ana `acarvo` veritabanında 14 migration uygulanmış; **bekleyenler:** `0014`–`0019`. **Hiçbiri uygulanmadı.**
- Salt okunur parmak izi karşılaştırması (M1 birleştirmesinden bu yana):
  - araçlar, fotoğraflar, belgeler, km/konum, kullanıcılar ve şirketler **aynı**;
  - müşteri sayısı 0;
  - tek fark, 10.10.2026 13:46'daki bir `auth.login` işlem geçmişi satırı (Adnan Kovač'ın girişi; kullanıcı işlemi).
- Ana veritabanına sentetik müşteri, belge veya politika eklenmedi. `.env` değiştirilmedi. Gerçek anahtar üretilmedi. Push yapılmadı.

## Üretime / ana veritabanına geçiş — sıra (onayınızla)
1. `musteriler-m2` dalını inceleyip `main`'e fast-forward ile alın (ana klasörde).
2. Ana klasörde:
   - `node --env-file=.env scripts/safe-migrate.mjs --dry-run` (bekleyenler `0014`–`0019`);
   - ardından `node --env-file=.env scripts/safe-migrate.mjs`: doğrulanmış yedek, migration, doğrulama;
   - sonrasında parmak izi karşılaştırması. Beklenen fark: hazır rollerin yeni izinleri ve bunların işlem geçmişi satırları.
3. Bu aşamada anahtar olmadan da uygulama çalışır. Belge numarası ve dosya kaydı kapalıdır ve ekranda bunu söyler.
4. **Son kullanıcı kurulumu bekliyor:** gerçek anahtarlar (aşağıda).
5. Şubeler ekranından 4 şubenin ülkesini girin (toplu atama önizleme ve onayla çalışır).
6. İsterseniz Ayarlar'dan ülke belge gereksinimlerini, hukuk danışmanınıza göre tanımlayın. Tanımlamazsanız hiçbir zorunluluk gösterilmez.
7. Üretim sunucusunda `MALWARE_SCANNER=clamav` olmadan belge yükleme kapalı kalır (bilinçli).

## Gerçek anahtar kurulumu — kullanıcı adımları
1. Proje klasörü dışında bir klasör seçin, örneğin `C:\Users\<siz>\Documents\acarvo-anahtarlar`.
2. Ana klasörde çalıştırın: `node scripts/customer-keys.mjs generate --out "C:\Users\<siz>\Documents\acarvo-anahtarlar\customer-keys.env"`. Ekranda yalnız `k1` ve kısa parmak izleri görünür.
3. Dosyadaki dört `CUSTOMER_*` satırını kopyalayıp `.env` dosyasına **kendiniz** ekleyin.
4. API sunucusunu yeniden başlatın. Günlükte "Customer data keys loaded: k1* …" satırı görünmelidir.
5. Doğrulama: `npm run keys:check --workspace @acarvo/api` (veri olduğunda `-- --db`).
6. Anahtar dosyasını veritabanı yedeğinden **ayrı iki yerde** saklayın (ör. parola yöneticisi ve şifreli USB). Anahtar kaybolursa numaralar ve belge dosyaları açılamaz.
7. Yenileme ve geri yükleme provası: `docs/TEKNIK_UYGULAMA.md` §8.7.2.

## Açık kalan riskler
- **Erişim izinleri sunucu belleğinde** tutulur (araç belgeleriyle aynı). Birden çok API sunucusu çalıştırılırsa ortak bir depo gerekir. Yeniden başlatmada izinler düşer; kullanıcı yeniden tıklar.
- **Çözülmüş veriler kısa süre süreç belleğinde bulunur** (Node'da bellek garantili olarak sıfırlanamaz). Açılan numara tarayıcıda 30 saniye görünür; ekran görüntüsü alınması teknik olarak engellenemez.
- **Operasyon yüklediği görüntüyü sonradan açamaz.** Yanlış dosya yüklenirse kontrolü Yönetici veya Sahip yapar.
- **Arama anahtarı yenilemesi sırasında** "bir numara tek müşteride" kuralı uygulamada eski ve yeni anahtarlarla denetlenir; veritabanı tetikleyicisi yalnız aynı anahtarlı özetleri karşılaştırır. Yenileme tamamlanınca fark kalmaz.
- **Dosya yenileme maliyeti:** tüm dosyalar tek veri anahtarıyla şifrelenir; anahtar yenilemede hepsi yeniden şifrelenir (partili ve kaldığı yerden devam eden).
- **Saklama süreleri ve dosya temizliği yok** (M6 ve hukuk kararı; otomatik silme yapılmaz).
- **Ülke politikaları hukuken doğrulanmamıştır;** sorumluluk şirkete aittir (ekranda yazılı).

## Kararınızı gerektiren konular
1. `musteriler-m2` dalının `main`'e alınması ve `0014`–`0019` migration'larının ana veritabanına uygulanması (yukarıdaki sıra).
2. Gerçek anahtarların oluşturulması ve iki ayrı yedek yeri.
3. Ana veritabanındaki 4 şubenin ülkesi: siz mi girersiniz, yoksa onayınızla ben mi (toplu atama önizlemesiyle)?
4. Bosna-Hersek için belge gereksinimi tanımlanacak mı? (Hukuk danışmanı; tanımlanmazsa zorunluluk gösterilmez.)
5. Eski M1 "Eski sınıflandırma (M1)" filtresi listede kalsın mı, kaldırılsın mı? Şu an kalıyor; veriye dokunulmuyor.
6. Yönetici rolünün belge görüntüsünü açabilmesi (plan K-8) uygun mu? Değiştirmek bir rol yükseltme sürümüyle yapılır; özel rollere dokunulmaz.

---

## Son güvenlik kontrolü ve main entegrasyonu (11–12.10.2026)

### Ürün kararları (uygulandı)
- **Yönetici:** belge görüntüsünü açabilir. İndiremez, tam numarayı göremez.
- **Operasyon:** belge ekleyebilir, kayıtlı görüntüyü açamaz.
- **Sahip:** indirebilir ve tam numarayı açabilir. Her açılışta gerekçe istenir, işlem geçmişine kayıt düşer (numara yazılmaz), kullanıcı başına saatte en fazla 30 açılış yapılabilir.
- **Eski M1 filtresi** kaldı. Her yerde "Eski M1 sınıflandırması" diye yazar, güncel ikamet sınıflandırması olmadığı belirtilir.
- **Şube ülkeleri** doldurulmadı (ana veritabanında 4 şubenin ülkesi boş).
- **Ülke politikaları:** hiçbiri etkinleştirilmedi; Bosna-Hersek için kural oluşturulmadı.
- **Etkinleştirme onayının metni:** "Bu kuralları şirketimizin kendi değerlendirmesiyle kontrol ettim. Bu işaret hukuki uygunluk onayı veya garantisi değildir; ACARVO mevzuata uygunluğu doğrulamaz."

### Güvenlik incelemesi (kritik veya yüksek bulgu yok)
**İncelenen alanlar:**
- **Şifreleme:** AES-256-GCM, rastgele nonce, kayda bağlı AAD, şirket başına türetilmiş anahtar.
- **Dosya güvenliği:** içerik doğrulama, şifreli saklama, bütünlük özeti, güvenli başlıklar.
- **Erişim:** izinler oturuma, şirkete, dosyaya ve amaca bağlıdır; çıkışta ve şirket değişiminde düşer.
- **Numara eşleştirme:** şirket içinde HMAC ile eşleşir; şirketler arası eşleşme yoktur.

**Düzeltilen orta ve düşük bulgular** (commit `d91caab`, testleriyle):
1. Dosya açma ve tam numara için `customers.documents.read` yetkisi de aranıyor. Bu yetkisi olmayan özel bir rol açamaz.
2. "Numara başka müşteride kayıtlı" yanıtı, diğer müşterinin adını yalnız `customers.read` yetkisi olana gösteriyor.
3. Açılan numara tarayıcının işlem önbelleğinde tutulmuyor.

**Bilinçli mimari tercihler:**
- Rol ayrımını API uygular. Veritabanı şirket izolasyonunu, değiştirilemezliği ve silme yasağını uygular.
- Belge ekleme uç noktasında hız sınırı yok. Yetkili bir kullanıcı şirket içinde bir numaranın kayıtlı olup olmadığını deneyerek öğrenebilir. Bu işlem kayıt oluşturur ve işlem geçmişine düşer.

### Git
- Birleştirmeden önce iki çalışma alanı da temizdi ve `main`, `musteriler-m2`'nin atasıydı.
- Birleştirme yalnız ileri sarma (`--ff-only`) ile yapıldı: `7cdf067 → d91caab`.
- Sonradan test tohumu düzeltmesi (`9afc1de`) ve bu rapor da aynı şekilde eklendi.
- Push yapılmadı. `musteriler-m2` dalı ve `acarvo-m2` çalışma alanı korunuyor.

### Ana veritabanı migration'ı (14 → 20)
1. **Önizleme:** bekleyen liste yalnız `0014`–`0019` idi.
2. **SQL incelemesi:** var olan tabloları yalnız `0014` etkiliyor. `customers.residency` zorunlu olmaktan çıkıyor ve iki boş sütun ekleniyor. Var olan veride UPDATE, DELETE veya INSERT yok.
3. **Önce/sonra parmak izi:** salt okunur; tablo başına sayı ve içerik özeti.
4. **Doğrulanmış yedek:** `C:\Users\soena\Desktop\acarvo\backups\2026-10-11-21-56-57` (şema, genel tablolar, şirket başına döküm, dosya deposu, `report.json`).
5. **Uygulama:** migration'lar uygulandı. Hazır roller yükseltildi: her şirkette 3 rol, 3 işlem geçmişi satırı (`role.preset_upgrade`).
6. **safe-migrate son denetimde durdu:** "new table without RLS: user_sensitive_actions".
   - Bu tablo tasarım gereği şirketten bağımsızdır: kullanıcı başına numara açma sayacı. Yalnız kullanıcı kimliği, işlem adı ve zaman tutar; müşteri verisi içermez. `users` ve `sessions` ile aynı sınıftadır.
   - Uygulama rolünün yalnız SELECT ve INSERT yetkisi vardır. Kayıt sayısı 0.
   - Geri yükleme yapılmadı, yıkıcı bir işlem yapılmadı. Yarım kalan doğrulama aşağıdaki gibi elle, salt okunur olarak tamamlandı.
   - safe-migrate'in izin listesine bu tabloyu eklemek bir güvenlik denetimini değiştirmek olduğu için size bırakıldı. Eklenmezse bir sonraki migration'da aynı uyarı yine çıkar.
7. **Sonuç:**
   - Migration sayısı 20.
   - Müşteriler aynı: her iki şirkette 0, içerik özeti değişmedi.
   - Araçlar, belgeler, fotoğraflar, km, konum, kullanıcılar ve şirketler değişmedi.
   - Şubelerde yalnız boş `country` sütunu eklendi; değerler aynı.
   - Rollere yalnız beklenen M2 yetkileri eklendi, hiç yetki silinmedi.
   - İşlem geçmişine yalnız rol yükseltme satırları eklendi.
   - RLS, politika, yetki ve indeks listelerinden hiçbir şey çıkmadı. Eklenenler:

     | Liste | Eklenen |
     |---|---|
     | Zorunlu RLS'li tablo | 6 |
     | Politika | 24 |
     | Tablo yetkisi | 19 (DELETE yalnız politika maddelerinde) |
     | İndeks | 20 |

   - Sentetik veri eklenmedi.

### Testler (main üzerinde; yalnız `acarvo_test`, çalıştırmaya özgü sentetik anahtarlarla)

| Kontrol | Sonuç |
|---|---|
| TypeScript (tüm paketler) | Hatasız |
| Üretim derlemesi (web) | Başarılı |
| API testleri | 285/285 |
| Tarayıcı testleri | 70 geçti; 15 isteğe bağlı ekran görüntüsü testi atlandı |
| Ekran görüntüsü testleri (ayrıca çalıştırıldı) | 8/8 |

### Bulunan sorunlar
- **Test tohumu:** sentetik belge tarihleri UTC gününe göre hesaplanıyordu. Yerel gece yarısı ile UTC gece yarısı arasında iki test 1 gün fark gördü. Uygulama doğru davranıyordu (şirket saat dilimi). Tohum `Europe/Sarajevo` gününe göre düzeltildi (`9afc1de`).
- **Sahipsiz geliştirme sunucusu:** durdurulan geliştirme sunucusundan kalan bir Vite işlemi 5173 portunu tutuyordu. Kapatıldı ve temiz şekilde yeniden başlatıldı.

### Anahtarsız güvenli davranış (doğrulandı)
- API günlüğü: "Customer document numbers and files are closed: Customer data keys are not configured". Anahtar değeri okunmadı ve yazdırılmadı; `.env` değiştirilmedi.
- M1 ekranları çalışıyor. M2 ekranları açılıyor.
- Belgeler sekmesinde "Şifreleme anahtarı yapılandırılmadığı için…" uyarısı görünüyor. "Numarayı göster" ve dosya yükleme gösterilmiyor.
- Numarasız belge kaydı ve düzeltme çalışıyor. Numara veya dosya gerektiren işlemler `503 CUSTOMER_KEYS_MISSING` döner. Şifresiz kayda geri dönüş yoktur.
- Ana veritabanında belge, dosya veya numara kaydı yok. Sunucuda test anahtarı yok; test anahtarları her test çalıştırmasında bellekte üretilir.

### Gerçek anahtarlar — sizin yapacaklarınız
1. **Oluşturma:** `node scripts/customer-keys.mjs generate --out "C:\Users\soena\Documents\acarvo-anahtarlar\customer-keys.env"`. Klasör proje dışında olmalı. Ekranda yalnız anahtar kimliği ve parmak izi görünür.
2. **Kurulum:** dosyadaki dört `CUSTOMER_*` satırını `.env`'e kendiniz ekleyin ve API'yi yeniden başlatın. Günlükte "Customer data keys loaded: k1 …" görünmeli.
3. **İki ayrı yedek:**
   - **(a) Parola yöneticisi kasası:** dosyanın içeriğini güvenli not olarak saklayın.
   - **(b) Ayrı şifreli USB:** örneğin BitLocker To Go ile şifrelenmiş bir USB'ye dosyanın kopyasını koyun.
   - Anahtarlar veritabanı yedeğiyle aynı yerde durmamalı. Anahtar kaybolursa numaralar ve dosyalar açılamaz.
4. **Kısa geri yükleme kontrolü:**
   - USB'deki ve kasadaki kopyanın, API günlüğündeki parmak iziyle aynı olduğunu karşılaştırın.
   - İlk gerçek belge kaydından sonra en son yedeği boş bir veritabanına geri yükleyip `keys:check -- --db` çalıştırın; hata sayısı 0 olmalı (`TEKNIK_UYGULAMA` §8.7.2).
5. **Kurulumdan sonra çalıştırılacak kontroller:**
   - `npm run keys:check --workspace @acarvo/api`: anahtar biçimi ve parmak izi.
   - `npm run keys:check --workspace @acarvo/api -- --db`: kayıtlı her değerin çözülebildiği, salt okunur olarak denetlenir.
6. **Test anahtarlarını ana veritabanında kullanmayın.** Testler anahtarlarını kendileri üretir.

### Son ekran kontrolü (1440 / 768 / 390)
- Belgeler sekmesi, belge ayrıntısı, numara açma, belge ekleme hataları, Ayarlar, Şubeler, Operasyon görünümü ve anahtarsız durum incelendi.
- Yatay taşma yok ve gerçek bir kullanım sorunu bulunmadı; yeniden tasarım yapılmadı.
- Kiralama ve cari sekmeleri "henüz bağlı değil" der; sahte özellik gösterilmez.

### Açık riskler (güncel)
- Önceki listedeki riskler geçerli.
- safe-migrate genel tablo uyarısı (yukarıda, 6. madde).
- Gerçek anahtarlar kurulana kadar belge numarası ve dosya kaydedilemez.
