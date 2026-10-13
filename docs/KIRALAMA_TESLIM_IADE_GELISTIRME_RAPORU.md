# ACARVO — Kiralama, Teslim ve İade V1 Geliştirme Raporu

- **Durum:** Test ortamında tamamlandı. Main'e birleştirilmedi, ana veritabanına migration uygulanmadı, GitHub'a push yapılmadı.
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
