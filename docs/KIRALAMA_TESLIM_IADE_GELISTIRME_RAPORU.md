# ACARVO — Kiralama, Teslim ve İade V1 Geliştirme Raporu

- **Durum:** Son kontrollerden ve ürün kararlarından (K1–K3) sonra main'e ileri sarma ile birleştirildi; ana veritabanı 27 → 31 migration (doğrulanmış yedekle). GitHub'a push yapılmadı. Ayrıntı: en alttaki "Son kontrol ve main entegrasyonu" bölümü; K1 bölüm 2'deki ilk tanımın yerini alır.
- **Dal:** `kiralama-k1` · klasör `C:\Users\soena\Desktop\acarvo-k1` · başlangıç `main` `0013023`
- **Plan:** `docs/KIRALAMA_TESLIM_IADE_PLANI.md` (spec kuralları, K1–K9 ürün kararları, veri modeli, ortak araç tahsisi)

---

## 1. Tamamlanan özellikler

| Alan | Durum |
|---|---|
| Kiralama veri modeli | Numara `K-000001` (şirket içinde benzersiz, eşzamanlı güvenli sayaç), rezervasyon bağlantısı, müşteri, kurumsal hesap, tam bir ana sürücü + 0–5 ek sürücü, araç, başlangıç ve planlanan iade şubesi, planlanan ve gerçek zamanlar (her biri şubenin saat dilimiyle), durum, not, oluşturan/işlem yapan, durum olayları, işlem geçmişi |
| Rezervasyondan kiralama | Yalnız onaylı rezervasyon. Rezervasyon `converted` olur, kiralama `prepared` açılır; ikisi tek işlemde. Rezervasyon başına tek kiralama (benzersiz kısıt). Rezervasyonun kendi kaydı değişmeden kalır |
| Rezervasyonsuz kiralama | Spec §10.2'deki gibi destekleniyor; aynı araç, belge ve teslim kapıları geçerli |
| Durum makinesi | Teslim bekliyor → Aktif → İade alındı → Kapandı; Teslim bekliyor → İptal. Veritabanı tetikleyicisi ve API birlikte uyguluyor |
| Ortak araç uygunluğu | Rezervasyon ve kiralama tek kilit ve tek `vehicle_busy` tanımı kullanıyor (bölüm 3) |
| Belge kontrolü | Sürücü başına personel kararı, referans ülke, kural ve sürümü, belge kayıt kimlikleri; değişmez kayıt |
| Teslim | Km, beş sabit yakıt değeri, temizlik, genel durum, 8 maddelik kontrol listesi, teslim alan sürücü, gövde silueti üzerinde hasar işaretleri, 4–5 fotoğraf, not. Km ve konum kaydı aynı işlemde yazılıyor |
| Aktif kiralama | Gecikme süresi, etkilenebilecek rezervasyonlar, uzatma (yeniden denetimli), konum geçmişi |
| İade | Gerçek zaman ve şube, km ve yakıt, teslimle karşılaştırma. İade kontrolü sonradan tamamlanıyor: temizlik, kontrol listesi, işaretler, 4–5 fotoğraf |
| Hasar farkı | İade işareti teslimdeki işarete bağlanabiliyor; bağlanmayan işaret "yeni bulgu" sayılıyor. Kapanışta personel onayı alınıyor. Hasar dosyası veya ücret oluşturulmuyor |
| Ekranlar | Kiralamalar listesi, Yeni/Düzenle, Kiralama 360° (7 sekme), Teslim masası, İade ve kapanış |
| Diğer ekranlar | Rezervasyon 360°'ta "Kiralamaya dönüştür"; zaman çizelgesinde kiralama çubukları; Müşteri, Kurumsal Hesap ve Araç 360°'ta gerçek Kiralamalar sekmeleri |

## 2. Uygulanan iş kuralları ve ürün kararları

Spec kuralları plan dosyasının 1. bölümünde. Spec'te kesin olmayan konularda **güvenli tarafta** karar verildi; **main'e geçmeden önce onayınız gerekiyor**:

| Karar | Uygulama |
|---|---|
| **K1 — Sözleşme/fiyat yokken teslim** | Teslim yalnız personelin açık beyanıyla yapılıyor: "Sözleşme ve fiyat ACARVO dışında yönetiliyor". Beyan, kim ve ne zaman ile kaydediliyor. Ekranlarda her yerde "Hesaplanmadı / ACARVO'da yok" yazıyor. `RENTAL_EXTERNAL_TERMS_ALLOWED = false` yapılırsa teslim tamamen kapanıyor |
| **K2 — Gecikmiş araç** | Planlanan iade geçmiş ve araç dönmemişse kiralama aracı **iade edilene kadar** tutuyor. Bu sürede yeni onaylı rezervasyon ve kiralama reddediliyor. Mevcut çakışan rezervasyonlar uyarı olarak gösteriliyor; otomatik iptal yapılmıyor |
| **K3 — Referans ülke** | Başlangıç şubesinin ülkesi. Ülke yoksa belge kararı ve teslim engelleniyor; ülke tahmin edilmiyor |
| **K4 — Yerli/yabancı ve belge** | Sistem yalnız öneri gösteriyor: ikamet ülkesi ile referans ülke karşılaştırılıyor, uyruk kullanılmıyor. Kararı personel veriyor. Etkin kural varsa belgeler kiralama süresi boyunca geçerli olmadıkça "uygun" seçilemiyor. Kural yoksa karar "kural tanımsız, personel kontrolü" olarak kaydediliyor, "belge gerekmez" sonucu çıkarılmıyor. Kurumsal ilişki kontrolü kaldırmıyor |
| **K5 — Önceki iade kontrolü** | Önceki kiralamasının iade kontrolü bitmemiş araç teslim edilemiyor |
| **K6 — Yeni hasar** | Bulgu olarak kalıcı kaydediliyor ve personel onayı alınıyor. Hasar dosyası, sorumluluk, muafiyet veya ücret oluşturulmuyor |
| **K7 — Olağan dışı sonlar, araç değişimi** | Bu sürümde yok (çalıntı, pert, el koyma, §59BW araç değişimi). Teslimden sonra araç değiştirilemiyor |
| **K8 — Geç kayıt** | Teslim en çok 24 saat, iade en çok 72 saat geriye girilebiliyor; gelecek zaman girilemiyor |
| **K9 — Gecikme toleransı** | Tanımlı değil. Gecikme planlanan iadeden sayılıyor; ekranda bu açıkça yazıyor; ücret hesaplanmıyor |

Ek davranışlar:
- Hazırlık süresi yok (rezervasyon kararı D korunuyor).
- Kapanış operasyonel bir kapanıştır: bakiye, ödeme veya "araç hazır" anlamına gelmiyor.
- Planlanandan farklı şubeye iade:
  - aracın konumu o şube olarak kaydediliyor;
  - ana şubesi değişmiyor;
  - otomatik transfer yapılmıyor.

## 3. Rezervasyon–kiralama çakışma koruması (en kritik konu)

- **Tek kilit.** `vehicle_allocation_lock(şirket, araç)`, aynı araca yapılan bütün tahsis yazımlarını sıraya sokar. Kullananlar:
  - rezervasyon tetikleyicisi (0028'de `CREATE OR REPLACE` ile güncellendi; 0026 dosyası değişmedi);
  - kiralama tetikleyicisi;
  - API.
- **Tek tanım:** `vehicle_busy(...)`. Aracı tutanlar:
  - onaylı rezervasyon: `[alış, iade)`;
  - teslim bekleyen kiralama: plan;
  - aktif kiralama: `[gerçek teslim, planlanan iade)`, gecikmişse `[gerçek teslim, ∞)`;
  - iadesi alınmış veya kapanmış kiralama: `[teslim, gerçek iade)`.
- **Aynı tanımı kullananlar:**
  - API: rezervasyon onayı ve düzenleme; kiralama oluşturma, düzenleme, erken teslim ve uzatma;
  - rezervasyon ve kiralama müsaitlik ekranları;
  - zaman çizelgesi.

  Bu yüzden iki modül çelişen sonuç üretemez.
- **Dönüşüm sırası:** rezervasyon `converted` → kiralama eklenir, aynı işlemde. İşlem yarıda kalırsa ikisi birlikte geri alınır.
- **Testlerle doğrulanan senaryolar:**
  - her iki sırada çakışma, API'de ve doğrudan veritabanında;
  - aynı anda 3 oluşturma, 3 dönüşüm, 3 teslim ve 3 iade: her seferinde yalnız biri başarılı;
  - erken teslim;
  - uzatmanın rezervasyona çarpması;
  - gecikmiş aracın yeni rezervasyon ve kiralamayı engellemesi;
  - iptalin aracı serbest bırakması;
  - iadesi alınmış ama kontrolü bitmemiş aracın yeniden teslim edilememesi.

## 4. Güvenlik kontrolleri

**Şirket izolasyonu**
- 7 yeni tabloda zorunlu RLS ve dört politika.
- Bütün ilişkiler şirket bileşik yabancı anahtarıyla.
- Başka şirketin müşteri, sürücü, araç, rezervasyon veya kiralama kimliği kullanılamıyor (404/400); kayıt oluşmuyor.

**Şube kapsamı (API'de, mevcut mimari)**

| İşlem | Gereken şube kapsamı |
|---|---|
| Görme | başlangıç, planlanan iade veya gerçek iade şubesi |
| Hazırlama, düzenleme, iptal, uzatma, belge kararı, teslim | başlangıç şubesi |
| İade | gerçek iade şubesi |
| Kapanış | iade veya başlangıç şubesi |

Kapsam dışı kayıt "bulunamadı" görünür. SJJ ile sınırlı kullanıcının başka şubede iade alamadığı test edildi.

**Yetkiler**
- `rentals.read`, `rentals.manage`, `rentals.handover` (preset geçmişi v7).
- Sahip, Yönetici ve Operasyon bunları aldı. Özel rollere dokunulmadı.
- Operasyon'a belge görüntüleme veya numara açma yetkisi verilmedi.
- Belge kararı ayrıca `customers.documents.read` istiyor.

**Silme ve değişmezlik**
- Silme yetkisi yok.
- Olaylar ve belge kararları yalnız ekleniyor.
- Kesinleşmiş teslim/iade kontrolü, fotoğrafları ve işaretleri değişmiyor.
- Teslimden sonra araç, müşteri ve sürücüler değişmiyor.
- Kiralama kaynaklı km kayıtları el ile düzeltilemiyor (`SOURCE_OWNED`).

**Eşzamanlılık**
- Her durum değişikliği sürüm istiyor; eski ekran sessizce yazamıyor.
- İstek kimliği sayesinde ağ kesintisinde tekrar gönderilen istek ilk sonucu döndürüyor, ikinci kayıt üretmiyor.

**Fotoğraflar**
- İçerik denetleniyor; yeniden kodlandığı için EXIF ve konum bilgisi siliniyor (testle doğrulandı).
- Zararlı dosya taraması yapılıyor; üretimde tarayıcı yoksa yükleme kapalı kalıyor ve bu yüzden teslim de yapılamıyor.
- Ayrı `rentals/` öneki altında saklanıyor.
- Önbelleğe alınmadan, yetki denetimiyle sunuluyor.
- Kullanıcı başına dakikada 40 yükleme sınırı var.
- Kaldırma bir işarettir; dosya silinmiyor.

**Kişisel veri**
- Arama metni adres çubuğuna ve sunucu günlüğüne girmiyor.
- İşlem geçmişine ad, iletişim bilgisi, belge numarası veya not yazılmıyor (testle doğrulandı).
- Belge numaraları hiçbir kiralama yanıtında yok.
- M2 şifreleme düzeni değişmedi.

**Sınır:** Gerçek M2 anahtarları kurulmadığı için belge kararı personelin fiziksel kontrolüne dayanıyor ve ekranda böyle yazıyor.

## 5. Yeni migration dosyaları (yalnız `acarvo_test`'e uygulandı)

| Dosya | İçerik |
|---|---|
| `0027_rentals.sql` (Drizzle) | 7 tablo, kısıtlar, indeksler; `company_sequences` türüne `rental` eklendi |
| `0028_rentals_rls.sql` (elle) | RLS; `files`, `odometer_readings` ve `vehicle_location_events` izin listeleri genişletildi; kaynak bağlantı koruması; ortak tahsis fonksiyonları; rezervasyon araç korumasının yenisi; kiralama yaşam döngüsü ve kanıt korumaları; yetkiler |

- Mevcut migration dosyalarının hiçbiri değişmedi.
- Dosyalar dolu (26 KB ve 27 KB) ve LF satır sonlu. Boş şablon ancak dosya yazıldıktan sonra uygulandı.
- `safe-migrate --verify --test`: 29 migration, 46 tablonun 42'sinde RLS, sorun yok.
- Mevcut satırlar değişmedi; eski kayıtlar yalnız eski değerleri kullanıyor.

## 6. API uçları

`/api/rentals`:
- `POST /search`, `GET /branches`, `POST /availability`
- `GET /:id`, `GET /:id/history`
- `POST /`, `POST /from-reservation/:id`
- `PUT /:id`, `POST /:id/cancel`
- `PUT /:id/document-check`
- `PUT /:id/inspections/:kind`
- `POST /:id/inspections/:kind/photos?angle=`
- `DELETE /:id/inspections/:kind/photos/:photoId`
- `GET /:id/photos/:photoId`
- `POST /:id/deliver`, `POST /:id/extend`, `POST /:id/return`, `POST /:id/close`

İlgili listeler:
- `GET /api/customers/:id/rentals`
- `GET /api/corporate-accounts/:id/rentals`
- `GET /api/vehicles/:id/rentals`

**Değişen mevcut yanıtlar:**
- Rezervasyon müsaitliği ve çakışma hataları artık kiralamaları da içeriyor. Çakışmanın biçimi değişti: `reservationNo/pickupAt/returnAt` yerine `kind/refNo/startsAt/endsAt`.
- `notChecked` listesinden `rentals` çıktı.
- Zaman çizelgesine `rentalBars` eklendi.

## 7. Ekranlar

- **`/kiralamalar`:** 8 görünüm ve sayılar; geciken kiralama kırmızı ve süresiyle gösteriliyor.
- **`/kiralamalar/yeni`, `/kiralamalar/:id/duzenle`.**
- **`/kiralamalar/:id`:** Kiralama 360°. Üst bant, üç karar kartı (spec §85.4), gecikme uyarısı, 7 sekme, teslim/iade karşılaştırma tablosu ve önce/sonra hasar diyagramları.
- **`/kiralamalar/:id/teslim`:** Teslim masası. Kapı listesi; her engelin nedeni ve sonraki adımı yazıyor.
- **`/kiralamalar/:id/iade`:** İade kaydı, iade kontrolü ve kapanış.

## 8. Commit'ler (`kiralama-k1`)

1. `61b250d` — plan, veri modeli, migration'lar, yetkiler
2. `3da31ec` — ortak araç tahsisi, kiralama API'si, test verisi, API testleri, performans
3. `5686ecb` — ekranlar ve tarayıcı testleri
4. bu rapor

## 9. Testler (yalnız `acarvo_test`, yalnız sentetik veri)

| Kontrol | Önce | Şimdi |
|---|---|---|
| API | 361 | **391/391** (29 kiralama + 1 performans testi eklendi; 3 tam çalıştırma, biri soğuk başlangıç) |
| Tarayıcı | 96 geçti, 21 atlandı | **104 geçti, 24 isteğe bağlı atlandı** (6 kiralama akışı, 1 axe, 1 telefon; 3 isteğe bağlı ekran görüntüsü) |
| TypeScript (tüm çalışma alanları), üretim derlemesi | — | Hatasız |

**Güncellenen eski testler** (davranış değişikliğinden):
- tablo ve sayaç listeleri;
- yeni çakışma biçimi;
- `rentals` artık "denetlenemeyen" değil;
- müşteri, kurumsal hesap ve araç Kiralamalar sekmesi artık gerçek;
- rezervasyon ekran metinleri güncellendi (karar D ve E aynı).

**Kapsanan senaryolar:**
- şirket ve şube izolasyonu; RBAC;
- dönüşüm ve rezervasyonsuz kiralama;
- çift kiralama; rezervasyon/kiralama çakışmaları;
- eşzamanlı oluşturma, dönüşüm, teslim ve iade;
- km doğrulama: geçmişten düşük olamaz, iade teslimden düşük olamaz, büyük artış için gerekçe;
- yakıt;
- fotoğraflar: tür, sayı, metadata, yetki;
- hasar farkı ve yeni bulgu onayı;
- gecikme;
- DST: yaşanmayan saat reddi, iki kez yaşanan saatte seçim;
- belge kuralı, eksik ülke, belge yetkisi;
- işlem geçmişinde kişisel veri olmaması;
- tekrar gönderilen istek;
- veritabanı düzeyinde yaşam döngüsü ve değişmezlik;
- rezervasyon verisinin korunması.

**Aralıklı "Vitest failed to find the runner" sorunu:** Bu sprintte tekrarlamadı. Önbellek silinerek yapılan soğuk başlangıç dahil üç tam çalıştırmanın hepsi 391/391. Kök neden hâlâ doğrulanmadı; yapısal değişiklik yapılmadı; konu açık.

## 10. Performans (5.000 sentetik kiralama, ölçümler ms)

| İstek | Süre |
|---|---|
| Etkin, ilk sayfa | 58 |
| Tümü, 30. sayfa (100'lük) | 70 |
| Geciken | 20 |
| Ad araması | 43 |
| Numara | 28 |
| Plaka | 40 |
| Tarih aralığı | 21 |
| Ayrıntı | 25 |
| Fotoğraflı ayrıntı | 23 |
| Müsaitlik | 7 |
| 14 günlük çizelge | 12 |

Liste tek sorgu ve sayılar için bir sorgu. İndeksler: şirket+durum+alış, alış, iade, araç, müşteri, hesap, oluşturma.

## 11. Ekran görüntüleri

`apps/e2e/screenshots/k1/` (Git'e girmez), 1440/768/390 genişliklerde 13 ekran:
- liste ve geciken görünümü;
- yeni kiralama;
- teslim bekleyen 360°;
- teslim masası;
- gecikmiş 360°;
- iade;
- iade kontrolü;
- kapanmış 360° (genel, teslim, iade, hasar, geçmiş).

Hiçbirinde yatay taşma yok. Yeniden üretmek için: `SCREENSHOTS=1 npx playwright test rentals-screens`.

**Gözden geçirmede düzeltilenler:**
- Kayıt başlamamışken eksik alan sayısı "1" görünüyordu; şimdi doğru sayılıyor.
- Hasar diyagramı işaretlerin bulunduğu görünümle açılıyor.

## 12. Ana veritabanının korunması

- `safe-migrate --verify` (salt okunur) sonucu: **27 migration, 39 tablo; değişmedi**. Kiralamanın iki migration'ı yalnız "bekleyen" görünüyor; uygulanmadı.
- Ana veritabanına sentetik kiralama eklenmedi.
- Gerçek müşteri ve araç kayıtlarına dokunulmadı.
- `.env` değişmedi; gerçek anahtar üretilmedi.
- Şube ülkeleri doldurulmadı; ülke belge kuralları etkinleştirilmedi.
- Main klasörü temiz, `0013023`'te.

## 13. Eksik hukuki ve finansal bağımlılıklar (hangi nihai işlemi engelliyor)

| Eksik | Etki |
|---|---|
| Sözleşme modülü (şablon, sürüm, imza) | ACARVO'da sözleşme yok. Teslim yalnız "dışarıda yönetiliyor" beyanıyla (K1); kapatılırsa teslim tamamen kapanır |
| Fiyatlandırma / Finans | Fiyat, ödeme, depozito, uzatma ve gecikme ücreti, borç, fatura ve "finansal kapanış" yok; ekranlar "Hesaplanmadı" diyor |
| Gerçek M2 şifreleme anahtarları | Belge numaraları görüntülenmiyor; belge kararı personel kontrolüne dayanıyor |
| Ülke belge kuralları ve şube ülkeleri | Ülkesi tanımsız şubede belge kararı ve teslim engelli (ana veritabanında şube ülkeleri boş olabilir) |
| Hasar modülü | Yeni bulgu hasar dosyasına bağlanamıyor; sorumluluk ve ücret kararı yok |
| Bakım / Transfer | Hasardan bakım kaydı yok; farklı şubeye iade transfer değil |
| Olağan dışı sonlandırma (§71), araç değişimi (§59BW), sürücü yaş/ehliyet sınıfı politikası (§69) | Bu sürümde yok |

## 14. Main'e geçiş gereksinimleri

1. K1–K9 kararlarının onayı; özellikle **K1 (dış sözleşme beyanıyla teslim)** ve **K2 (gecikmiş araç süresiz tutulur)**.
2. Ana veritabanında şube ülkelerinin yetkili kişi tarafından girilmesi. Aksi hâlde teslim mümkün değil.
3. Main'e ileri sarma ile birleştirme; ardından `safe-migrate` (dry-run, doğrulanmış yedek, 27 → 29, `--verify`).
4. Birleştirmeden sonra main'de tüm testler; çalışan API'nin yeniden başlatılması.
5. Üretim ortamında dosya tarayıcısı (ClamAV). Yoksa fotoğraf yükleme, dolayısıyla teslim kapalı kalır.

## 15. Açık riskler

1. Aralıklı Vitest runner sorunu (bölüm 9).
2. Şube yetkisi veritabanında değil API'de. Kiralama uçlarında atlatma yolu bulunmadı ve testle denetlendi.
3. **K2'nin operasyonel etkisi:** Uzun gecikmede aracın ileri tarihli rezervasyonları onaylanamıyor. Bu güvenli ama katı bir karar.
4. **Planlanmamış şubeye iade:** Yalnız şube kapsamı olan bir kullanıcı, kapsamı dışındaki bir kiralamayı göremez. Planlanmamış bir şubeye iadeyi şirket genelinde yetkili kullanıcı veya önce yapılacak bir "iade şubesi değişikliği" çözer.
5. **Telefonda teslim masası:** Kapı listesi formun altında kalıyor. İleride yapışkan bir özet çubuğu düşünülebilir.
6. **Rezervasyon müsaitlik yanıtının biçimi değişti.** Web güncellendi; harici bir istemci yok.


---

## Son kontrol ve main entegrasyonu (13.10.2026)

### Ürün kararları (onaylandı) ve uygulanma

| Karar | Uygulama |
|---|---|
| **K1 — Dış sözleşme ve fiyat** | Şirket bazlı "Kiralama çalışma modu" (`company_rental_settings`). **Varsayılan kapalı**; satır yoksa da kapalı. Ayrıntılar aşağıda |
| **K2 — Geciken araç** | Korundu: fiilen iade edilmeyen araç, planlanan iade geçse bile dolu sayılıyor. Uyumsuz yeni onaylı rezervasyon ve kiralama reddediliyor; hata mesajında engelleyen kiralama numarası ve "iade gecikti" yazıyor. Bekleyen rezervasyon oluşturulabiliyor, ama yeni bir uyarı (`vehicle_held_by_overdue_rental`) uygunluğun kesin olmadığını söylüyor. Uyarı yalnız aynı şirketin kaydını gösteriyor (RLS). Gerçek iadeden sonra uygunluk yeniden hesaplanıyor; testle doğrulandı: iadeden sonra aynı rezervasyon onaylanabildi |
| **K3 — Şube ülkesi** | Ülke yoksa teslim engelli: API kapısı ve yeni veritabanı kısıtı `rentals_branch_country`. Ülke tahmin edilmiyor, otomatik atanmıyor. Yerli/yabancı yalnız ikamet ülkesinden öneriliyor; uyruk kullanılmıyor; kararı personel veriyor |

**K1 ayrıntıları**
- **Kim açabilir:** Yalnız yeni `settings.rentals.manage` yetkisi; yalnız Sahip hazır rolünde (preset geçmişi v8). Yönetici, Operasyon ve özel roller almadı.
- **Görünürlük:** Ayar Ayarlar sayfasında. Operasyon modu görüyor ama değiştiremiyor.
- **Değişiklik kaydı:** Açma onay penceresiyle yapılıyor. Her değişiklik sürüm kontrollü ve işlem geçmişine yazılıyor (`settings.rental_mode_update`: eski → yeni).
- **Şirket ayrımı:** RLS ile; şirketler birbirinin ayarını göremiyor.
- **Mod kapalıyken:** Hiçbir teslim tamamlanamıyor. Teslim masasında ve Kiralama 360°'ta neden açıkça yazıyor.
- **Mod açıkken teslim personeli şunları yapıyor:**
  1. Sözleşmenin ACARVO dışında düzenlendiğini ve işlemin dış süreçte tamamlandığını kontrol ettiğini beyan ediyor.
  2. Fiyatın ACARVO dışında belirlendiğini ve taraflarla dış süreçte ele alındığını ayrıca beyan ediyor.
  3. Dış sözleşme veya işlem referansını giriyor: 3–40 karakter; yalnız harf, rakam, boşluk ve `. / _ -`; ekranda "ad, telefon, kimlik numarası yazmayın" uyarısı var.
- **Kayıt:** Beyanlar kullanıcı ve zamanla kiralamaya yazılıyor (`external_terms_ack_*`, `external_pricing_ack_*`, `external_reference`). Referans işlem geçmişine kopyalanmıyor; geçmişte yalnız "kaydedildi" bilgisi var.
- **Gösterim:** Ekranlar beyanları "personel beyanı" olarak gösteriyor. "İmzalandı / ödendi / fiyat kesinleşti / hukuken uygun" gibi bir sonuç üretilmiyor.

**Veritabanı düzeyinde zorunlu** (0030; 0028'deki koruma fonksiyonları `CREATE OR REPLACE` ile güncellendi, 0028 dosyası değişmedi). Teslime geçiş şunlar olmadan reddediliyor:
- şirket modunun açık olması;
- iki beyan ve referans;
- şube ülkesi;
- ana sürücü;
- her sürücü için son plan değişikliğinden sonra verilmiş "uygun" belge kararı;
- tam doldurulmuş kesinleşmiş teslim kontrolü.

Ayrıca kontrol listesi yalnız tanımlı maddeleri ve yanıtları kabul ediyor.

### Son güvenlik incelemesi

**Kritik veya yüksek bulgu yok.** İnceleme sırasında, API'de zaten olan üç kapı veritabanına da eklendi; regresyon testleri yazıldı:
- belge kararı;
- kontrol listesinin tamlığı;
- şube ülkesi.

**A) Rezervasyon/kiralama çakışması**
- Rezervasyon onayı, kiralama oluşturma, düzenleme, erken teslim ve uzatma tek kilit ve tek `vehicle_busy` tanımını kullanıyor (veritabanı tetikleyicisi). Doğrudan kiralama da aynı korumadan geçiyor.
- Dönüşüm atomik ve rezervasyon başına tek kiralama (benzersiz kısıt).
- Uzatma çakışırsa uygulanmıyor.
- Geç iade aracı otomatik serbest bırakmıyor.
- Eşzamanlı 3'lü oluşturma, dönüşüm, teslim ve iade denemelerinin her birinde yalnız biri başarılı.
- Hata hâlinde işlem bütünüyle geri alınıyor: yarım kiralama veya teslim kalmıyor.
- PostgreSQL düzeyinde testlerle doğrulandı.

**B) Teslim ve iade**
- Eksik belge kararı ve eksik kontrol listesi API'de ve veritabanında engelleniyor.
- Km kayıtları kaynağına bağlı olarak tek işlemde yazılıyor:
  - geçmişle çelişen km reddediliyor;
  - iade km'si teslim km'sinden düşükse reddediliyor;
  - büyük artış için gerekçe isteniyor.
- Yakıt beş sabit değerle saklanıyor.
- Hasar işaretleri silinmiyor; kaldırma bir işarettir ve kesinleşen kontrol değişmiyor.
- İade iki kez tamamlanamıyor. Tekrar gönderilen istek ilk sonucu döndürüyor.

**C) Fotoğraf ve dosya**
- Özel `rentals/` önekinde, URL ile erişilemiyor.
- Şirket ve şube denetimiyle sunuluyor: `no-store`, `inline`, `vary: Cookie`.
- İçerik doğrulanıyor; yeniden kodlandığı için EXIF ve konum bilgisi siliniyor.
- Üretimde tarayıcı yoksa yükleme kapalı ("fail-closed"). Fotoğraf yoksa teslim veya kapanış tamamlanamıyor (veritabanında 4–5 fotoğraf kapısı).

**D) Şirket / şube / RBAC**
- Başka şirketin müşterisi, aracı, rezervasyonu, kurumsal hesabı ve sürücüsü kullanılamıyor.
- 8 kiralama tablosunda zorunlu RLS.
- Şube kapsamı bütün mutasyon uçlarında var. İade ve iade kontrolü taslağı, kiralamayı görme kapsamıyla sınırlı; iade kaydı gerçek iade şubesinin yetkisini istiyor.
- Özel roller değişmedi. Operasyon'a belge görüntüleme veya numara açma yetkisi verilmedi; belge kararı `customers.documents.read` istiyor.

**E) Kişisel veri ve denetim**
- Belge numaraları kayıtlara, işlem geçmişine ve yanıtlara girmiyor.
- Arama metni URL'de yok.
- İşlemi yapan personel ve zaman kayıtlı.
- Fiziksel silme yetkisi yok; olaylar ve belge kararları yalnız ekleniyor.

### Migration tutarlılığı
- Test veritabanında 31 kayıt var. Özetler dosyalarla aynı (`safe-migrate --verify --test`: sorun yok).
- Dört dosya dolu ve LF satır sonlu:

  | Dosya | Boyut |
  |---|---|
  | 0027 | 25.974 B |
  | 0028 | 27.077 B |
  | 0029 | 1.509 B |
  | 0030 | 12.975 B |

- Tek `DROP` ifadeleri, hemen yeniden eklenen genişletilmiş izin listesi kısıtları. `DELETE`, `UPDATE` veya `TRUNCATE` yok.
- Mevcut migration dosyalarının hiçbiri değişmedi.

### Git
- Birleştirmeden önce iki çalışma ağacı temizdi.
- Main, yalnız ileri sarma ile `0013023 → 295afb1`; bu rapor da aynı yolla eklendi.
- Push yapılmadı. `kiralama-k1` dalı ve `acarvo-k1` klasörü korunuyor.

### Ana veritabanı geçişi (27 → 31)
**Öncesi**
- `--verify`: yalnız 4 bekleyen (0027–0030). Dry-run aynı listeyi verdi.
- Salt okunur parmak izleri alındı: araç, km, konum, fotoğraf, dosya, belgeler, müşteriler, kurumsal, rezervasyon, roller, şubeler, sayaçlar, kullanıcılar ve şirketler.
- Rezervasyon entegrasyonundan beri tek değişiklik sizin işlemleriniz: bugün 14:38'de giriş ve 14:39'da bir rezervasyon oluşturma. Bu gerçek veri korundu.

**Doğrulanmış yedek:** `C:\Users\soena\Desktop\acarvo\backups\2026-10-13-18-29-16`

**Uygulama ve sonrası**
- `safe-migrate` durmadan geçti. `--verify`: 31 migration, 47 tablonun 43'ünde zorunlu RLS, sorun yok.
- Korunan veriler birebir aynı:
  - araçlar, km ve konum geçmişi, fotoğraflar, dosyalar, araç belgeleri;
  - müşteriler, müşteri belgeleri ve politikalar;
  - kurumsal hesaplar;
  - rezervasyonlar (sizin rezervasyonunuz dahil);
  - sayaçlar, şubeler, kullanıcılar, şirketler.
- Beklenen eklemeler:
  - roller: üç hazır role `rentals.*`, Sahip'e ayrıca `settings.rentals.manage`; silinen yetki 0;
  - şirket başına 3 rol yükseltme denetim kaydı;
  - 8 yeni tablo, 32 yeni politika, 22 yeni yetki.
- Mevcut politikaların ve yetkilerin hiçbiri değişmedi. Veritabanı rollerinin nitelikleri aynı.
- Tetikleyiciler (29) ve kısıtlar (781) test veritabanıyla birebir aynı. Fonksiyonlarda tek fark `customer_documents_guard`'ın CRLF yazımı; M2'den bilinen, zararsız.
- Kiralama, teslim veya iade kaydı eklenmedi; tablolar boş.

### Main'de testler (yalnız `acarvo_test`)

| Kontrol | Sonuç |
|---|---|
| API | **399/399** (8 yeni entegrasyon testi) |
| Tarayıcı | **106 geçti**, 24 isteğe bağlı atlandı (2 yeni K1 testi) |
| TypeScript, üretim derlemesi | Hatasız |
| RLS denetimi | Sorun yok |
| Ekran görüntüleri | 1440/768/390: Ayarlar, liste, yeni, 360°, teslim masası, iade, kapanış, hasar karşılaştırması, geciken; yatay taşma yok |

Aralıklı Vitest runner sorunu bu entegrasyonda görülmedi (4 tam çalıştırma); konu açık.

### Çalışan uygulama
- Main sunucuları main kodundan yeniden başlatıldı: API 3001 (sağlık: ok), web 5173.
- **Kiralamalar:** http://localhost:5173/kiralamalar
- **Ayarlar (kiralama modu):** http://localhost:5173/ayarlar
- Oturumsuz kiralama ve ayar istekleri reddediliyor (403 / 401).
- Ekranların içi sizin parolanızla açılmadı (parolanızı bilmiyorum). Aynı main kodu test veritabanında tarayıcı testleriyle doğrulandı.

### Gerçek operasyon öncesi eksik koşullar
1. **Şube ülkeleri:** Ana veritabanındaki 4 şubenin hiçbirinde ülke yok; teslim bu yüzden engelli (doğrulandı). Yetkili kişi Şubeler ekranından gerçek ülkeyi girmeli.
2. **Kiralama çalışma modu:** İki şirkette de kapalı (varsayılan). Dış süreçle çalışılacaksa şirket sahibi Ayarlar'dan açmalı.
3. **Belge kuralları:** Ülke belge kuralları ana veritabanında etkin değil. Karar bu yüzden "kural tanımsız, personel kontrolü" olarak kaydedilir; hangi belgelerin zorunlu olduğu hukuk danışmanıyla belirlenmeli.
4. **M2 anahtarları:** Gerçek şifreleme anahtarları yok; belge numarası ve belge dosyası işlemleri güvenli biçimde kapalı.
5. **Dosya taraması:** Üretim ortamında ClamAV yoksa fotoğraf yüklemesi, dolayısıyla teslim, kapalı kalır.
6. **Eksik modüller:** Sözleşme, fiyat, ödeme, depozito ve hasar dosyası modülleri yok. Ekranlar bunu her yerde açıkça söylüyor.

### Açık riskler
- **K2'nin katılığı:** Uzun gecikmede aracın ileri tarihli onayları bekler.
- **Şube yetkisi** veritabanında değil API'de (mevcut mimari).
- **Planlanmamış şubeye iade:** Yalnız kendi şubesine yetkili kullanıcı, kapsamı dışındaki kiralamayı göremez.
- **Telefonda teslim masası** formun altında kalıyor.
- **Dış referans alanı:** Biçimi sınırlı, ama personel yine de anlamlı bir ad yazabilir; ekrandaki uyarı ve eğitim gerekli.
- **Aralıklı Vitest runner sorunu.**
