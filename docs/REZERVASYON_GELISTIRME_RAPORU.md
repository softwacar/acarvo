# ACARVO — Rezervasyon Yönetimi V1: geliştirme raporu

**Dal / klasör:** `rezervasyon-r1` / `C:\Users\soena\Desktop\acarvo-r1`. Başlangıç `main` `2b7c9fc`.
**Durum (13.10.2026):** Rezervasyon V1 main'e birleştirildi ve ana veritabanına uygulandı (27 migration). Ayrıntılar en alttaki "Son kontrol ve main entegrasyonu" bölümünde. Push yapılmadı.
**Plan:** `docs/REZERVASYON_YONETIMI_PLANI.md` (kurallar ve R1–R14 kararları).

## Özet

| Konu | Sonuç |
|---|---|
| API testleri | **357/357** (önce 335; 22 yeni) |
| Tarayıcı testleri | **94 geçti**, 21 isteğe bağlı atlandı (önce 83 geçen + 18 isteğe bağlı) |
| Ekran görüntüsü testleri | 3/3; 1440 / 768 / 390'da 33 görüntü (`apps/e2e/screenshots/r1/`) |
| Erişilebilirlik (axe) | Rezervasyon ekranlarında bulgu yok |
| TypeScript ve üretim derlemesi | Hatasız |
| Test veritabanı | 27 migration; `safe-migrate --verify --test`: sorun yok |
| Ana veritabanı | **Dokunulmadı:** 24 migration, rezervasyon tablosu yok (salt okunur doğrulandı) |

## 0. Başlangıç işleri

### Kurumsal mükerrer kontrolünün kalıcı sınırı
- **Yöntem:** M2 sayaç altyapısı yeniden kullanıldı. Migration `0024` yalnız izin verilen işlem türleri listesine `corporate_duplicate_check` ekliyor; mevcut satırlar etkilenmiyor.
- **Sınırlar:**

  | Kapsam | Pencere | En fazla |
  |---|---|---|
  | Kullanıcı, aktif şirkette | 10 dakika | 150 |
  | Kullanıcı, aktif şirkette | 1 saat | 500 |
  | Kullanıcı, tüm şirketler | 1 gün | 2000 |

- **Davranış:** Yeni oturum açmak veya sunucuyu yeniden başlatmak sınırı sıfırlamaz. Sınır aşılınca `429 DUPLICATE_CHECK_LIMIT` ve `Retry-After` döner. Dakikalık bellek sınırı, ani yük koruması olarak duruyor.
- **Şirket izolasyonu:** Sayaçlar şirket bazlı kural (RLS) altında; başka şirket sayılmaz, sayaçta değer saklanmaz.
- **Test:** regresyon testi eklendi.

### API testlerinin ilk çalıştırmada yüklenememesi
- **Hata:** "Vitest failed to find the runner"; 24 dosyanın hepsi "0 test" gösterdi.
- **Yeniden üretme:** Main klasöründe tip denetimi, web derlemesi ve test sırasıyla bir kez daha tetiklendi.
- **Denemeler** (toplam 9 çalıştırma; bunların hiçbirinde hata çıkmadı):
  - yeni klasörde soğuk başlangıç;
  - adımların ayrı ayrı çalıştırılması;
  - aynı sıranın 3 kez tekrarı;
  - kök klasörden ve alt klasörden çalıştırma;
  - sürücü harfinin küçük ve büyük yazılması.
- **Gözlem:** Hata yalnız birleştirme veya geçişten hemen sonraki ilk çalıştırmada görüldü; ikinci çalıştırmada her zaman geçti.
- **Değerlendirme:** Vitest'in, aynı modülün iki kopyasını yüklediğinde verdiği aralıklı bir hata. Tahmine dayalı bir değişiklik yapılmadı.
- **Öneri:** Hata görülürse testler bir kez yeniden çalıştırılmalı. Tekrarlanırsa `node_modules/.vite*` önbelleği temizlenerek kök nedenin izi sürülmeli. Açık risk olarak kaldı.

## 1. Spec'ten uygulanan kurallar
- **Yaşam döngüsü:** Bekleyen → Onaylı → (Kiralamaya dönüştü; yalnız Kiralama modülü yapacak). Uç durumlar: İptal ve Gelmedi.
  - Geçersiz geçişleri hem API hem veritabanı tetikleyicisi reddediyor; uç durumlar değiştirilemez.
- **Araç bloke etme:**
  - Bekleyen rezervasyon aracı bloke etmez; seçilen araç yalnız tercihtir.
  - Onaylı rezervasyon aracı [alış, iade) aralığında tutar.
  - Onaylama sırasında uygunluk aynı işlem içinde yeniden denetlenir; çakışma varsa 409 döner ve rezervasyon bekleyen kalır.
- **Çifte rezervasyon** veritabanında engelleniyor:
  - tetikleyici araç başına işlem kilidi alır;
  - çakışan onaylı rezervasyonu ve etkin olmayan aracı reddeder;
  - eşzamanlı onay testinde aynı araç için 3 kişiden yalnız biri başarılı oldu.
- **Kendi kaydı çakışma sayılmaz:** düzenlenen rezervasyon kendi aracıyla çakışmaz.
- **Belge eksikliği engellemez:** "Rezervasyon oluşturulabilir. Eksik belgeler kiralama başlamadan önce tamamlanmalıdır."
- **Kişi ve kurumsal hesap ayrı:** kişi bilgisi kopyalanmaz; rezervasyon müşteriye, rezervasyonu yapan kişiye ve sürücülere bağlantı tutar.
- **Kaynak (§59BQ):** Doğrudan / Gişe, Telefon, Web sitesi (elle kayıt), İş ortağı, Kurumsal, Tekrar gelen müşteri, Diğer. Sahte canlı kanal yok.
- **Gelmedi (§59BF):**
  - yalnız onaylı rezervasyonda ve alış zamanı geçtikten sonra işaretlenebilir;
  - gerekçe, not, kim ve ne zaman tutulur;
  - otomatik ücret eklenmez.
- **Değişiklik geçmişi (§59BU):** tarih, şube, sınıf, araç, müşteri, hesap, sürücü ve kaynak değişikliklerinde eski ve yeni değer, kim, ne zaman ve gerekçe tutulur. Ad, iletişim bilgisi ve not geçmişe kopyalanmaz.

## 2. Belirsiz kalan ürün kararları (güvenli varsayımlar; onayınızı bekler)

| # | Karar | Neden |
|---|---|---|
| R1 | **Yalnız sınıf seçilen rezervasyon onaylanamaz**; onay için belirli araç gerekir. Sınıf kapasitesi yalnız bilgi olarak, "kesin değil" etiketiyle gösterilir | Bakım, transfer, kiralama ve dış kaynak modülleri yok; aracın ileri tarihteki konumu bilinmiyor. Spec fazla rezervasyona izin vermiyor |
| R2 | Belirli araç uygunluğu yalnız ACARVO'daki bilgilerle denetlenir: araç durumu ve onaylı rezervasyonlar. Ekran, denetlenemeyenleri açıkça listeler | Var olmayan modüllerin verisi varmış gibi kabul edilmez |
| R3 | Rezervasyonlar arasında hazırlık payı yok: 10:00'da biten rezervasyondan sonra 10:00'da başlayan kabul edilir | Spec süre tanımlamıyor; Ayarlar ile ileride eklenebilir |
| R4 | Alış saati alış şubesinin, iade saati iade şubesinin saat diliminde girilir ve saklanır | Şubeler farklı ülkelerde olabilir |
| R5 | Yeni rezervasyonda alış zamanı en fazla 15 dakika geride olabilir | Geçmişe kayıt hatasını önlemek |
| R6 | Seçilen araç rezervasyonun sınıfından olmalı; üst sınıf vermek için sınıf değiştirilir | Spec'te üst sınıf kuralı yok |
| R7 | Onaylı rezervasyonun tarihi, şubesi, sınıfı veya aracı değişirse gerekçe zorunlu; onaylı rezervasyondan araç kaldırılamaz | Değişiklik geçmişi (§59BU) ve R1 |
| R8 | Gelmedi yalnız alış zamanından sonra işaretlenebilir | §59BF tanımı |
| R9 | Yetkiler: `reservations.read`, `reservations.manage`, `reservations.confirm`; Sahip, Yönetici ve Operasyon'a üçü de verildi. Özel roller değişmedi | Gişe personelinin anında onay verebilmesi. İsterseniz Operasyon'dan onay yetkisi kaldırılabilir |
| R10 | **Şube erişimi:** rezervasyonu, alış veya iade şubesi yetki alanında olan görür. Oluşturma ve değiştirme için alış şubesi yetki alanında olmalı. Araç listesi mevcut araç görünürlüğünü (ana şube) izler | Spec şube kuralını tanımlamıyor; en dar makul seçim |
| R11 | Kurumsal bağlamda yetkili olmayan sürücü veya hesapta kayıtlı olmayan rezervasyonu yapan kişi **uyarı** olarak gösterilir, engellenmez | Kurumsal muafiyet ve uygunluk politikası Kiralama modülüne ait |
| R12 | **Fiyat hesaplanmaz**; ekstralar, kaparo ve indirim yok. Ekranlarda "Hesaplanmadı · Fiyatlandırma modülüyle gelecek" yazar | Fiyatlandırma ve finans altyapısı yok; spec tek fiyat hattı istiyor (§59CR) |
| R13 | Numara `R-000042`, şirket içinde benzersiz | Mevcut numara düzeni |
| R14 | Müşterinin "Yerli/Yabancı" sınıfı listede gösterilmiyor; ikamet ülkesi gösteriliyor | M2 kararı: sınıfı kiralamada personel verir |

**Ayrıca yapılmayanlar:**
- araç profil fotoğrafı (kartlarda nötr simge var);
- "Dış kaynak" uygunluğu (§59AC);
- ön yüzde ayrı takvim (aylık) görünümü; 14 günlük araç zaman çizelgesi var.

## 3. Migration dosyaları
- **`0024_sensitive_actions_corporate_check.sql`:** sayaç türü listesine ekleme.
- **`0025_reservations.sql`:**
  - yeni tablolar: `reservations`, `reservation_drivers`, `reservation_status_events`;
  - `company_sequences` türüne `reservation` eklendi (yalnız izin listesi genişler).
- **`0026_reservations_rls.sql`:**
  - zorunlu RLS ve şirket bileşik yabancı anahtarları (müşteri, kurumsal hesap, araç, sınıf, şube);
  - yaşam döngüsü tetikleyicisi, araç ve çakışma tetikleyicisi, sürücü değiştirilemezlik tetikleyicisi;
  - DELETE yetkisi yok; durum olayları yalnız ekleme.
- **Dosya tutarlılığı:** Her dosyanın içeriği uygulanmadan önce denetlendi (boş şablon yok, LF satır sonu). Test veritabanındaki kayıtlar dosya özetleriyle uyumlu.

## 4. API uçları (`/api/reservations`)
- **Okuma:**
  - `POST /search`: metin istek gövdesinde; filtreler: durum, şirket günleri, şube, sınıf, araç, müşteri (sürücü ve rezervasyonu yapan dahil), hesap, araç ataması;
  - `POST /availability`, `POST /timeline`, `GET /branches`;
  - `GET /:id`, `GET /:id/history`.
- **Değişiklik:**
  - `POST /`, `PUT /:id`;
  - `POST /:id/confirm`, `POST /:id/cancel`, `POST /:id/no-show`.
- **360° listeleri:** `GET /api/customers/:id/reservations`, `GET /api/corporate-accounts/:id/reservations`, `GET /api/vehicles/:id/reservations`.

## 5. Yeni arayüzler
- **Rezervasyonlar listesi:** arama, durum, tarih, şube, sınıf ve araç ataması filtreleri, sıralama, sayfalama; 14 günlük **araç zaman çizelgesi**.
- **Yeni rezervasyon / düzenleme çalışma alanı:**
  - Müşteri: arama ya da aynı ekrandan yeni müşteri;
  - Kurumsal bağlam: hesabın kişilerinden rezervasyonu yapan veya sürücü seçme;
  - Sürücüler: ana sürücü dahil;
  - Kiralama planı: şube saatiyle, yaz saati uyarıları anında;
  - Araç: canlı uygunluk; dolu veya hizmet dışı araç seçilemez;
  - Kaynak ve not;
  - sağda sabit özet; kaydedilmemiş değişiklik uyarısı; sürüm çakışması.
- **Rezervasyon 360°:**
  - başlık: durum, dönem, araç, şubeler, hesap, "fiyat hesaplanmadı";
  - aksiyonlar: Onayla, Düzenle, İptal et, Gelmedi; ayrıca uyarılar;
  - sekmeler: Genel, Kişiler (belge özeti yalnız yetkiyle, numara yok), Araç, Durum geçmişi, İşlem geçmişi, Fiyat ve kiralama (bağlı değil).
- **360° bağlantıları:** Müşteri 360° ve Kurumsal Hesap 360°'taki "Rezervasyonlar" sekmeleri ve Araç 360° "Müsaitlik" sekmesi gerçek listeye bağlandı.

## 6. Testler
- **API** (`tests/reservations.test.ts` 20, `tests/reservations-performance.test.ts` 1, kurumsal sayaç 1):
  - liste, arama ve tarih filtresi;
  - şube yetkisi; başka şirket (bilinen kimlikle de 404, veritabanı yabancı anahtarı);
  - oluşturma ve doğrulama; numaraların eşzamanlılıkta ardışık olması;
  - yaz saati: var olmayan saat reddedilir; iki kez yaşanan saatte seçim istenir ve gerçek süre doğru hesaplanır;
  - farklı saat dilimli şube;
  - çakışma, sınır anları, 1 dakikalık çakışma;
  - bekleyen rezervasyonun bloke etmemesi, onayda yeniden denetim;
  - 3 kişinin eşzamanlı onayı; veritabanı tetikleyicisi; hizmet dışı araç;
  - uygunluk yanıtında müşteri verisi olmaması;
  - zaman çizelgesi;
  - düzenleme sürümü, gerekçe, onaylı rezervasyondan araç kaldırılamaması, başka rezervasyona kaydırılamaması;
  - iptal ve Gelmedi geçişleri, uç durumların değişmemesi;
  - kurumsal uyarılar; yetkilerin ayrılığı ve geri alınması;
  - 360° listeleri; geçmişte ve günlüklerde sızıntı; DELETE yetkisi yok.
- **Tarayıcı** (`reservations.spec.ts` 10, erişilebilirlik 1, telefon 1, isteğe bağlı ekran görüntüleri 3):
  - liste ve zaman çizelgesi;
  - uçtan uca onaylı oluşturma;
  - dolu aracın seçilememesi; yalnız sınıflı bekleyen → araç atama → onay;
  - yaz saati;
  - iptal ve Gelmedi; 360° bağlantıları;
  - 768 / 390; şube kısıtlı kullanıcı; başka şirketin gerçek kimliği.
- **Güncellenen eski testler:**
  - Müşteri ve Kurumsal 360° "Rezervasyonlar henüz bağlı değil" beklentileri, sekme artık gerçek olduğu için değişti;
  - izolasyon listesi;
  - numara sayacı sayısı.

## 7. Güvenlik kontrolleri
- **Veritabanı:**
  - zorunlu RLS, 4 politika, bileşik şirket anahtarları;
  - başka şirketin müşterisi veya aracı bağlanamıyor;
  - DELETE yok; durum olayları değiştirilemiyor;
  - kimlik sütunları değişmiyor.
- **Yetkiler:** okuma, yönetme ve onaylama ayrı; yetki geri alındığında bir sonraki istekte geçerli.
  - İletişim bilgisi `customers.read`, belge özeti `customers.documents.read`, kurumsal hesap adı `corporate.read` ister.
- **M2 korunuyor:** belge numarası, maskeli numara ve dosya rezervasyon yanıtlarında hiç yok.
- **Kişisel veri sızıntısı yok:** arama metni URL'de yok; geçmiş ve sunucu günlüğünde ad, iletişim bilgisi ve not yok (testli).

## 8. Performans
6.000 sentetik rezervasyonda ölçüldü:

| İstek | Süre |
|---|---|
| İlk sayfa | 49 ms |
| 100'lük 30. sayfa | 57 ms |
| Müşteri adı araması | 31 ms |
| Numara | 12 ms |
| Tarih aralığı | 9 ms |
| Uygunluk | 7 ms |
| 14 günlük çizelge | 5 ms |

Her liste isteği tek sorgu; satır başına ayrı sorgu (N+1) yok. Kullanılan indeksler: alış zamanı, durum + alış, araç + alış, müşteri, hesap ve oluşturulma.

## 9. Ekran görüntüleri
`apps/e2e/screenshots/r1/`: 11 görüntü × 1440 / 768 / 390.
- **Kapsam:** liste, zaman çizelgesi, boş form hataları, dolu araç, yaz saati seçimi, 360° Genel, Kişiler, Durum, Fiyat (bağlı değil), iptal diyaloğu, iptal edilmiş rezervasyon.
- **İncelemede düzeltilen:** form alanları doldurulduktan sonra eski hata mesajları kalıyordu; artık alan değişince temizleniyor.
- Zaman çizelgesi telefonda kart içinde yatay kayıyor; sayfa taşmıyor.

## 10. Git commit'leri

| Commit | İçerik |
|---|---|
| `7ca8d12` | Kurumsal mükerrer kontrolünün kalıcı sınırı |
| `490646a` | Plan |
| `dc492a1` | Veri modeli, migration'lar, API, testler |
| `9060a0c` | Ekranlar ve tarayıcı testleri |
| (bu rapor) | Rapor ve teknik not |

- Push yapılmadı.
- `.env` değiştirilmedi; gerçek anahtar üretilmedi.

## 11. Ana veritabanının korunma durumu
- Salt okunur doğrulandı: 24 migration, rezervasyon tablosu yok, `--verify` sorun yok.
- Ana veritabanına hiçbir migration uygulanmadı, hiçbir kayıt eklenmedi; gerçek müşteri ve araçlar değişmedi.
- **Not:** Test veritabanı artık 27 migration'da. Main dalındaki testler birleştirmeye kadar test veritabanında "migration sayısı" kontrolünden geçemez.

## 12. Main'e geçiş gereksinimleri (onayınızla)
1. **Kararlar:** R1–R14'ün onaylanması veya değiştirilmesi; özellikle R1 (sınıfla onay yok), R9 (Operasyon'un onay yetkisi), R10 (şube kuralı).
2. **Birleştirme:** dal gözden geçirilir; yalnız ileri sarma ile birleştirilir; testler test veritabanında çalıştırılır.
3. **Ana veritabanı:**
   1. önizleme: `safe-migrate --dry-run`; beklenen bekleyenler `0024`, `0025`, `0026`;
   2. doğrulanmış yedek alınıp uygulama: `safe-migrate`.
   3. Beklenen değişiklikler:
      - 3 yeni tablo;
      - sayaç ve numara sayacı kısıtlarının genişlemesi;
      - hazır rollere `reservations.*` yetkileri ve her şirkete 3 "rol yükseltme" geçmiş kaydı;
      - mevcut veride değişiklik yok.
4. **Doğrulama:** salt okunur `--verify`, öncesi ve sonrası parmak izi karşılaştırması; ana veritabanına örnek rezervasyon eklenmez.

## 13. Kiralama modülüne bırakılan işler
- Kiralamaya dönüştürme (`converted`): araç ve kapasite bırakma ile kiralama ataması tek işlemde yapılmalı.
- Sınıf rezervasyonunun kapasitesi ve sınıftan araca atomik atama (bakım, transfer ve kiralama blokları geldikten sonra).
- Sürücü uygunluğu (yaş, ehliyet yılı ve sınıfı) ve kurumsal muafiyet politikası.
- Teslim, iade, sözleşme, araç değişimi, uzatma.
- Fiyat dökümü, fiyat anlık görüntüsü, ekstralar, kaparo ve kurumsal kredi kullanımı (Fiyatlandırma ve Finans).
- Gelmedi ve iptal ücreti politikaları.

---

## Son kontrol ve main entegrasyonu (13.10.2026)

### Ürün kararları (onaylandı) ve uygulanma durumu

| Karar | Durum |
|---|---|
| A — Yalnız sınıfla bekleyen rezervasyon | Bekleyen oluşturulabilir. Belirli araç atanmadan onay verilmez (API 409 `VEHICLE_REQUIRED`, veritabanı kısıtı `reservations_confirmed_vehicle_check`). Sınıf sayısı "Bilgi … Kesin kapasite değildir" etiketiyle gösterilir. Önceden uygulanmıştı; değişiklik yok |
| B — Operasyon onaylayabilir | `reservations.confirm` Operasyon'da var. Onay uç noktası ayrıca alış şubesi yetkisini, sürümü ve aracı denetler. Şirket sınırı RLS ile korunur |
| C — Şube erişimi | Değişmedi: kullanıcı alış veya iade şubesi kapsamındaki rezervasyonları görür; yalnız kendi şubesinden başlatır ve değiştirir |
| D — Hazırlık süresi yok | Değişmedi. Form ve 360° Araç sekmesine yeni metin eklendi: "Rezervasyonlar arasında hazırlık süresi bırakılmaz … Bu, aracın temizlenmiş, kontrol edilmiş veya teslime hazır olduğu anlamına gelmez; hazırlık, temizlik, hasar ve teslim kontrolleri Teslim/İade modülüyle gelecek." |
| E — Fiyatlandırma | Fiyat "Hesaplanmadı". 360°'a yeni metin eklendi: "Onay, araç ve zaman ayırmasıdır. Bu rezervasyon için fiyat hesaplanmadı; ödeme alınmadı, sözleşme oluşturulmadı ve kiralama başlamadı." Onay kutusunda: "Fiyat, ödeme, sözleşme veya kiralama oluşturulmaz." Yanıltıcı ifade taraması temiz |

### Git ve migration ön kontrolü
- Birleştirmeden önce iki çalışma alanı da temizdi; `main` (`2b7c9fc`), `rezervasyon-r1`'in atasıydı.
- **Dosyalar:** Dal yalnız 3 yeni migration dosyası ekliyor (0024, 0025, 0026). Mevcut migration dosyalarından hiçbiri değişmedi; günlük dosyasında yalnız ekleme var.
- **Boş şablon kontrolü:** Üç dosya da dolu (563, 10.874 ve 6.325 karakter), LF satır sonlu, boş şablon yok. M3'teki olay tekrarlanmadı.
- **Test veritabanı:** 27 kaydın tamamı dosya özetleri ve günlük zamanlarıyla uyumlu. 0009 ve 0017, bilinen CRLF biçimi; içerik aynı.
- **Ana veritabanı:** bekleyen yalnız 0024, 0025, 0026.

### Son güvenlik incelemesi
**Kritik veya yüksek bulgu yok.** Yeni regresyon testleriyle doğrulananlar:

**Çifte rezervasyon** (koruma API'de ve veritabanı tetikleyicisinde; yalnız ön yüzde değil):
- Aynı araçta çakışan onaylı rezervasyon reddedilir.
- Aynı anda 3 kişinin onayı: yalnız biri başarılı olur.
- Tarih değiştirme ve onaylı rezervasyonda araç değiştirme aynı denetimden geçer; eski araç serbest kalır.
- İptal aracı serbest bırakır.
- Bekleyen rezervasyon aracı tutmaz.
- **Atlatma denemeleri:** istek gövdesine eklenen "durum" alanı yok sayılır. Doğrudan veritabanı güncellemesiyle bekleyeni çakışan onaylıya çevirmek de reddedilir.
- **Veritabanında [başlangıç, bitiş) sınırları:** birbirine değen aralıklar geçer, 1 dakikalık çakışma geçmez.

**Tarih ve saat:**
- Alış ve iade saatleri kendi şube saat dilimiyle saklanır ve gösterilir.
- Var olmayan saat reddedilir; iki kez yaşanan saatte seçim istenir.
- Bilgisayarı başka saat diliminde (New York) olan kullanıcı da şube saatini görür (yeni tarayıcı testi).

**Şirket ve şube izolasyonu:**
- Başka şirketin müşterisi, aracı, kurumsal hesabı, rezervasyonu yapan kişisi ve sürücüsü kullanılamaz (404); kayıt oluşmaz.
- Başka şirketin rezervasyonu gerçek kimlikle de açılamaz.
- Yetkisiz durum geçişleri engellenir.
- **Not:** Şube yetkisi, M1–M3'teki gibi API'de uygulanır; veritabanı şirket izolasyonunu ve durum kurallarını uygular.

**Kişisel veriler:**
- Arama metni URL'de yok; günlükte ve işlem geçmişinde ad, iletişim bilgisi ve not yok.
- Rezervasyon yanıtlarında belge numarası, maskeli numara ve dosya yok.

**Operasyonel sınırlar:**
- Hizmet dışı araç onaylanamaz.
- Bakım, transfer, kiralama, dış kaynak ve aracın ileri tarihteki konumu "Henüz denetlenemeyen" olarak listelenir.
- Belge kontrolü "doğrulandı" diye gösterilmez; yalnız kayıt sayıları görünür.

### API testlerindeki aralıklı sorun (açık tutuluyor)
- **Önceki kayıt:** "Vitest failed to find the runner". M3 entegrasyonundan sonraki ilk çalıştırmada görüldü ve rezervasyon sprintinde bir kez yeniden üretildi; bu ilk başarısızlıklar rapordan silinmedi.
- **Bu entegrasyonda:**
  - rezervasyon dalında önbellek (`node_modules/.vite*`) silinerek soğuk başlangıç: 361/361;
  - hemen tekrar: 361/361;
  - main'de birleştirmeden sonraki ilk çalıştırma: 361/361, runner hatası yok.
- Çıktılar oturumun not klasöründe saklandı.
- **Değerlendirme:** Hata test altyapısından (Vitest modül yükleme) geliyor; uygulama koduyla ilgili değil. Tekrarlamadığı için entegrasyonu engellemedi. Kök neden doğrulanmadı; yapısal değişiklik yapılmadı.

### Main'e birleştirme
- Yalnız ileri sarma ile birleştirildi: `2b7c9fc → 0cc4ca5`; bu rapor da aynı yolla eklendi.
- Push yapılmadı. `rezervasyon-r1` dalı ve `acarvo-r1` klasörü korunuyor.

### Ana veritabanı geçişi (24 → 27)
- **Öncesi:**
  - `--verify`: yalnız 3 bekleyen migration;
  - önizleme: 0024, 0025, 0026;
  - SQL: mevcut tablolarda yalnız iki izin listesi genişliyor (`user_sensitive_actions` türleri, `company_sequences` türleri); gerisi yeni tablolar ve yeni tablolara ait kurallar;
  - parmak izleri salt okunur alındı. M3 geçişinden bu yana veri değişmemişti.
- **Doğrulanmış yedek:** `C:\Users\soena\Desktop\acarvo\backups\2026-10-13-03-09-02`.
- **Uygulama:** safe-migrate durmadan geçti; `--verify`: "sorun yok" (39 tablo, 35'inde zorunlu RLS).
- **Migration kayıtları:** 27 kayıt; son üçünün özetleri dosyalarla ve test veritabanı kayıtlarıyla aynı.
- **Kurulan koruma test veritabanıyla birebir aynı:**

  | Nesne | Sayı |
  |---|---|
  | Kısıt (10'u şirket bileşik yabancı anahtarı) | 64 |
  | Tetikleyici ve tetikleyici fonksiyonu (çakışma koruması dahil) | 3 + 3 |
  | Politika | 12 |
  | Zorunlu RLS'li tablo | 3 |
  | Uygulama yetkisi | 8 |
  | Genişletilmiş izin listesi | 2 |

- **Mevcut veri:** müşteri kaydı (Drina, 1) içerik özetiyle aynı; şubeler, sayaçlar, araçlar, fotoğraflar, dosyalar, araç belgeleri, km ve konum kayıtları, kullanıcılar, şirketler ve M1/M2/M3 verileri değişmedi.
- **Beklenen değişiklikler:** her şirkette 3 hazır role `reservations.read`, `.manage`, `.confirm` eklendi (hiç yetki silinmedi); 3 "rol yükseltme" geçmiş kaydı düştü; 3 yeni tablo, 12 politika, 8 yetki ve 16 indeks eklendi.
- **Örnek veri:** ana veritabanına rezervasyon eklenmedi; rezervasyon tabloları boş.

### Birleştirmeden sonra main'de testler (yalnız `acarvo_test`)

| Kontrol | Sonuç |
|---|---|
| API | 361/361 (ilk çalıştırma) |
| Tarayıcı | 96 geçti, 21 isteğe bağlı atlandı |
| TypeScript ve üretim derlemesi | Hatasız |

### Çalışan uygulama
- Main sunucuları main klasöründen (dal `main`, `0cc4ca5`) çalışıyor: API 3001, web 5173.
- Geçiş sırasında, birleştirmeyle yeni kodu yüklemiş olan eski API süreci durduruldu; geçişten sonra yeniden başlatıldı.
- **Sağlık:** `{"status":"ok","database":"connected"}`.
- **Sayfalar:** `/rezervasyonlar`, `/rezervasyonlar/yeni`, `/rezervasyonlar/:id`, `/musteriler`, `/kurumsal-hesaplar` ve `/araclar` 200 dönüyor.
- **Oturumsuz API istekleri:** reddediliyor (403 / 401).
- **Sınır:** Ana uygulamaya kendi parolanızla girerek ekranların içi kontrol edilmedi; parolanız benim tarafımdan bilinmiyor. Aynı main kodunun bu ekranları (liste, yeni rezervasyon, 360°, Müşteri / Kurumsal / Araç 360° rezervasyon sekmeleri) test veritabanında tarayıcı testleriyle doğrulandı. Ana veritabanında rezervasyon olmadığı için listeler boş açılır; bu beklenen durum.

### Açık riskler
1. Aralıklı "Vitest failed to find the runner" sorunu (yukarıda).
2. Şube yetkisi veritabanında değil API'de uygulanıyor (mevcut mimari).
3. Sınıf kapasitesi, bakım, transfer ve kiralama blokları ilgili modüller gelene kadar denetlenemiyor; ekranda açıkça yazıyor.
4. Hazırlık süresi yok (karar D); fiziksel hazırlık Teslim/İade modülüne kaldı.
5. Gerçek şifreleme anahtarları henüz kurulmadı (M2); belge numarası ve dosya işlemleri kapalı.
