# ACARVO — Fiyatlandırma ve Sözleşme Yönetimi V1 Geliştirme Raporu

Tarih: 13.10.2026 · Dal: `fiyat-sozlesme-v1` (çalışma kopyası `acarvo-fs1`) · Plan: `docs/FIYATLANDIRMA_SOZLESME_PLANI.md`

Durum: **main'e entegre edildi; ana veritabanı 34 migration** (ayrıntılar en sondaki "Son inceleme ve main entegrasyonu" bölümünde). GitHub'a gönderilmedi, `.env` değiştirilmedi, finans modülüne geçilmedi. Otomatik testler yalnız `acarvo_test` üzerinde, sentetik verilerle çalıştı.

---

## 1. Tamamlanan özellikler

**Fiyatlandırma**
- Fiyat listeleri: ad, ISO 4217 para birimi (180 kod, kur dönüşümü yok), şube (veya tüm şubeler), geçerlilik tarihleri, öncelik, durum (Taslak / Etkin / Arşivde), oluşturan/değiştiren, zaman.
- Her kaydetme **yeni ve değişmez bir revizyon**dur (sınıf tarifeleri, sezonlar, ek hizmetler, indirimler, vergi, gün hesabı dahil). Eski revizyonlar okunabilir kalır; revizyon geçmişi kimin, ne zaman, kaç kural ve kaç teklif olduğunu gösterir.
- Sınıf tarifeleri: 1–6 / 7–29 / 30+ gün kademeleri (boş üst kademe alttakini kullanır).
- Sezonlar: tarih aralığı, sınıf (veya tümü), yüzde artış/azalış, öncelik, etkin/pasif. Aynı öncelikte çakışan sezonlar hesaplanmaz, sorun olarak gösterilir.
- Ek hizmetler: gün başına / kiralama başına, en çok adet, vergiye tabi mi, etkin mi. "Ek sürücü" türü kayıttaki ek sürücü sayısına göre kendiliğinden eklenir.
- İndirimler: yüzde veya sabit tutar, en az gün; teklif başına en fazla bir indirim, yalnız kiralama bedeline, tutarı aşamaz.
- Vergi: yapılandırılmadı / fiyatlara hariç / fiyatlara dahil; oran ve vergi adı (ör. PDV). Oran tahmin edilmez. Yapılandırılmamışsa yalnız net toplam gösterilir, brüt "hesaplanmadı" olarak kalır.
- Para: tamsayı minor birim, ISO üsleri (0, 2, 3, 4), kesin ondalık ayrıştırma, "sıfırdan uzağa yarım" yuvarlama; testli.
- Hesaplama motoru (`packages/shared/src/pricing-engine.ts`, sürüm `pe-1`): sunucuda çalışır, açıklanabilir (her satırda kaynak kural, revizyon, gün, oran), deterministik, saat dilimi ve yaz/kış saati doğru. Gün hesabı listede seçilir: **24 saatlik dönem (tolerans dakikasıyla)** veya **alış şubesinin saatine göre takvim günü**; sistem sessizce birini zorlamaz.
- Önizleme: fiyat listesi ekranında kayıtlı revizyonla (sınıf, şube, alış/iade, ek sürücü); belirsiz saat (kış saatine geçiş) için seçim istenir, yaşanmamış saat reddedilir.

**Teklifler (rezervasyon ve kiralama)**
- Önizle → kaydet. Kaydedilen teklif liste ve revizyonu, hesap zamanını, gün sayısını, kademeyi, gün yöntemini, girdileri ve satırları dondurur; sonradan değişmez.
- Kaydederken kullanıcının gördüğü toplam gönderilir; sunucuda farklıysa **409 PRICE_CHANGED** ve yeni sonuç döner, kullanıcı yeni fiyatı görüp yeniden onaylar.
- `requestId` ile tekrar gönderim güvenlidir (aynı teklif döner).
- Yeni teklif öncekini "yerine yenisi kaydedildi" yapar (bir kez, geri alınamaz). Bir kayıtta en fazla bir geçerli teklif.
- Plan (tarih, saat, sınıf) veya ek sürücü sayısı değişince teklif **"güncel değil"** olarak işaretlenir; otomatik yeniden hesaplanmaz, sözleşmede kullanılmaz.
- Kiralama, rezervasyonun geçerli teklifini (plan aynıysa) gösterir. Teklif ödeme, tahsilat, depozito, borç veya fatura değildir.
- Hiçbir mevcut kayda kendiliğinden fiyat atanmaz; liste yoksa her yerde "Hesaplanmadı" yazar.

**Sözleşmeler**
- Şablonlar (Ayarlar → Sözleşme şablonları, yalnız Sahip): şirkete özel, dil (tr, bs, en, de, hr, sr) ve isteğe bağlı ülke, sürümlü (Taslak → Etkin → Kullanımdan kalktı). Düz metin; yalnız izinli `{{alan}}` adları; HTML, bağlantı, dış kaynak, tanımsız alan ve hatalı süslü parantez reddedilir. Zorunlu alanlar (sözleşme no, kiracı, plaka, alış, iade, fiyat tablosu) olmadan etkinleştirilemez (API ve veritabanı). ACARVO örnek metni "ÖRNEK METİN — HUKUKİ ONAY GEREKTİRİR" işaretlidir ve hukuki hüküm içermez. Etkinleştirme açık bir onay kutusu ister. Önizleme yalnız kurgusal örnek verilerle yapılır.
- Sözleşme taslağı (Kiralama 360° → Sözleşme): numara `S-000001`, sürüm, kiralama, rezervasyon, müşteri, kurumsal hesap, sürücüler (ad ve müşteri numarası; kimlik numarası, adres, telefon kopyalanmaz), araç, dönem (şube saatiyle), kullanılan teklif, şablon ve sürümü, durum, oluşturan, zaman. İçerik oluşturulduğu anda dondurulur.
- Fiyat yoksa metinde açıkça "Fiyat hesaplanmadı" yazar; hiçbir tutar uydurulmaz.
- Yaşam döngüsü: **Taslak → Kontrol bekliyor → Dışarıda işleme alındı**; açık sözleşme **Arşivlendi** (neden zorunlu) veya **Yeni sürümle değiştirildi** olur. İmzalı durumu yoktur. "Dışarıda işleme alındı" bir personel beyanı + dış referanstır (ad/kimlik numarası yazılmaması uyarısıyla), elektronik imza değildir.
- Yeni sürüm: önceki sürüm aynı metniyle saklanır, yeni sürüm güncel kiralama bilgileri ve geçerli teklifle oluşur. Fiziksel silme yok.
- PDF taslağı: her sayfada üst bant ve çapraz filigran "TASLAK — HUKUKİ ONAY BEKLİYOR", alt bilgi "ACARVO taslağıdır. İmza, ödeme, fatura veya hukuki onay içermez.", imza alanı yok, DejaVu Sans ile Türkçe/Boşnakça karakterler, belge özelliklerinde kişisel veri yok. Özel depoda rastgele dosya adıyla tutulur; SHA-256 bütünlük kontrolü.
- PDF erişimi araç ve müşteri belgeleriyle aynı modeldir (bkz. "Son inceleme"): açma veya indirme isteği CSRF denetimli bir POST ile bir kez kaydedilir ve kısa süreli izin verir; dosyayı sunan GET hiçbir kayıt yazmaz. Açma `contracts.read`, indirme ayrıca `contracts.download` ister; `no-store`, `nosniff`, `sandbox` CSP; dosya adı yalnız sözleşme numarası ve sürüm.

**Ekranlar**
- Fiyatlandırma listesi ve fiyat listesi düzenleyici (doğrulama, kaydedilmemiş değişiklik koruması, eşzamanlı değişiklik uyarısı, etkinleştirme/arşivleme onayları, önizleme, revizyonlar, yetkisiz/boş/hata durumları).
- Rezervasyon 360° "Fiyat teklifi" sekmesi ve başlık özeti; Kiralama 360° "Fiyat teklifi" ve "Sözleşme" sekmeleri, başlık özetleri, güncellenen karar kartı.
- Ayarlar → Sözleşme şablonları (alan ekleme düğmeleri, canlı denetim, önizleme, etkinleştirme).

## 2. Uygulanan kurallar ve ürün kararları (F1–F9)

| Karar | Uygulama | Onay durumu |
|---|---|---|
| F1 Gün hesabı | Liste başına zorunlu seçim; düzenleyicide önceden seçili yöntem yok (planda öneri vardı, daha güvenli olanı uygulandı) | Ürün onayı bekliyor |
| F2 Vergi | Hazır oran yok; yapılandırılmamışsa brüt hesaplanmaz | Hukuki/mali onay bekliyor |
| F3 Kademe | Toplam süre kademesi tüm günlere uygulanır | Ürün onayı bekliyor |
| F4 İndirim | En fazla bir, listede tanımlı, bedeli aşamaz; onay akışı yok | Ürün onayı bekliyor |
| F5 Sözleşme no | Taslak oluşunca `S-` numarası ayrılır, yeniden kullanılmaz; sürümler aynı numarayla | Uygulandı |
| F6 Şablon metni | ACARVO hukuki metin vermez; örnek işaretli | Hukuki onay bekliyor |
| F7 Dış işlem | Beyan + dış referans; e-imza değildir | Uygulandı |
| F8 Teslim | Teklif/sözleşme teslimi açmaz; K1 dış mod ve iki beyan aynen geçerli; kapılar "Dikkat" olarak teklif/sözleşmeyi gösterir | Nihai karar ayrı ürün onayına bırakıldı |
| F9 Yetkiler | Aşağıda | Uygulandı |

Uygulanmayan fiyat adımları (teklifte "hesaba katılmayanlar" olarak yazılır): kurumsal anlaşma fiyatı, tek yön ücreti, km sınırı/aşımı, sigorta paketi.

## 3. Rezervasyon–kiralama çakışma koruması

Fiyat ve sözleşme modülü araç ayırma koruması (`vehicle_allocation_lock`, `vehicle_busy()`, gecikmiş kiralama) üzerinde hiçbir değişiklik yapmadı. Teklif yalnız okuma yapar; kiralama ve rezervasyon testleri (çakışma, gecikme, K1/K2/K3) değişmeden geçti.

## 4. Güvenlik

- **Şirket yalıtımı:** 12 yeni tablonun hepsinde zorunlu RLS ve 4 politika; tüm yabancı anahtarlar `(company_id, id)` bileşik. Başka şirketin listesi, teklifi, şablonu, sözleşmesi ve PDF'i görünmez (404); uygulama rolüyle doğrudan sorgu da boş döner (testli).
- **Veritabanı kuralları:** fiyat listesi yaşam döngüsü; revizyonlar ileri doğru ve parçaları yalnız kendi revizyonuyla aynı işlemde yazılabilir; teklif yalnız etkin listenin güncel revizyonuyla, hedefin kendi planı ve sınıfıyla, kendi para biriminde oluşturulur ve yalnız bir kez "yerine yenisi" olabilir; şablon sürümü yalnız taslakken değişir, zorunlu alanlar olmadan etkinleşmez; sözleşme yalnız etkin şablondan, hazırlanan/kirada kiralama için, içerik ve kaynakları değişmez, dış beyan değişmez, arşiv/yenilenmiş durumu kesindir, imzalı durum yoktur. 0033 ile revizyonlar, parçalar, şablonlar, dosyalar ve olaylar her rol için değişmez; listeler, teklifler, şablon sürümleri ve sözleşmeler silinemez.
- **En az yetki (preset geçmişi v9):** Sahip tümü; Yönetici fiyat görme/teklif, sözleşme görme/yönetme/indirme; Operasyon fiyat görme/teklif, sözleşme görme/taslak (PDF indiremez). Liste, vergi ve şablon yönetimi yalnız Sahip. Özel rollere dokunulmadı. Şube kapsamı: başka şubenin rezervasyon/kiralamasına teklif veya sözleşme işlemi yapılamaz.
- **Kişisel veri:** sözleşme içeriğine kimlik/belge numarası, doğum tarihi, adres, telefon, e-posta kopyalanmaz (testli); işlem geçmişinde müşteri adı yok (testli); URL'lerde ve dosya adlarında kişisel veri yok; PDF meta verisi nötr. M2 şifrelemesine dokunulmadı; gerçek anahtar üretilmedi.
- **İstek güvenliği:** CSRF, sürüm kontrolü (409), `requestId` ile tekrar koruması, şablonda HTML/bağlantı/dış kaynak yasağı, PDF tarafında kontrol karakteri temizliği.

## 5. Migration dosyaları (yalnız `acarvo_test`'e uygulandı)

| Dosya | İçerik |
|---|---|
| `0031_pricing_contracts.sql` | 12 tablo, indeksler, sıra türleri `price_quote` ve `contract` (yalnız ekleme; tek DROP sıra türü kontrolünün yeniden tanımı) |
| `0032_pricing_contracts_rls.sql` | RLS, koruma tetikleyicileri, uygulama rolü yetkileri |
| `0033_pricing_contracts_history.sql` | Geçmiş tabloları için her rolde değişmezlik ve silme yasağı |

`acarvo_test`: 34 migration, `safe-migrate --verify --test` sorun yok. Ana veritabanı 31 migration'da, dokunulmadı.

## 6. API uçları

| Uç | Yetki |
|---|---|
| `GET/POST /api/pricing/price-lists`, `GET/PUT /api/pricing/price-lists/:id`, `POST …/activate`, `POST …/archive`, `GET …/history` | okuma `pricing.read`, yazma `pricing.manage` |
| `POST /api/pricing/preview` | `pricing.read` |
| `GET/POST /api/reservations/:id/quotes`, `POST …/quotes/preview` (kiralama için aynısı `/api/rentals/:id/quotes`) | `pricing.read` / kaydetme `pricing.quote` + kaydın okuma yetkisi ve şube kapsamı |
| `GET/POST /api/settings/contract-templates`, `PUT/POST …/:id/draft`, `POST …/:id/activate`, `POST …/preview` | `settings.contracts.manage` (liste ve önizleme `contracts.read`) |
| `GET/POST /api/rentals/:id/contracts`, `GET /api/contracts/:id`, `POST …/review`, `…/external`, `…/archive`, `…/revise` | `contracts.read` / `contracts.manage` |
| `POST /api/contracts/:id/access` (`mode`: view / download) | `contracts.read` (+ `contracts.download` indirme için) |
| `GET /api/contracts/:id/pdf[?indir=1]` | yalnız geçerli erişim izniyle; yetkiler yeniden denetlenir |

## 7. Ekranlar

`/fiyatlandirma`, `/fiyatlandirma/yeni`, `/fiyatlandirma/:id`; Rezervasyon 360° Fiyat teklifi; Kiralama 360° Fiyat teklifi ve Sözleşme; Ayarlar → Sözleşme şablonları. Menüde Fiyatlandırma artık `pricing.read` ile açık. V5 tasarım dili korundu (aynı yüzeyler, tipografi, renk ve durum dili).

## 8. Commit'ler (`fiyat-sozlesme-v1`)

| Commit | İçerik |
|---|---|
| `818c6a1` | Plan, para birimi ve yuvarlama, hesaplama motoru, şemalar, yazı tipleri, motor testleri |
| `267828b` | Veri modeli 0031/0032, yetkiler (preset geçmişi v9) |
| `3408a0b` | API: fiyat listeleri, önizleme, teklifler, şablonlar, sözleşmeler, PDF, 0033, teslim kapısı ayrıntıları, API testleri |
| `70e304f` | Arayüz, sürücü sayısı uyumu, tarayıcı testleri, performans testi, ekran görüntüleri, bu rapor |

## 9. Testler (yalnız `acarvo_test`, sentetik veri)

| Takım | Önce (main) | Şimdi | Yeni |
|---|---|---|---|
| API (Vitest) | 399 | **438** | +39: motor 11, fiyat/sözleşme akışları 27, performans 1 |
| Tarayıcı (Playwright) | 106 (+24 isteğe bağlı) | **113** (+27 isteğe bağlı) | +7: liste düzenleyici, rezervasyon teklifi, şablon, kiralama sözleşmesi + PDF, Operasyon yetkisi, başka şirket, telefon; +3 ekran görüntüsü |

Kapsanan başlıca senaryolar: doğrulama (para birimi, vergi oranı, yinelenen sınıf, başka şirketin sınıfı); boş listenin etkinleşmemesi; şirketler arası görünmezlik (API ve doğrudan veritabanı); sunucu hesabı (gün, kademe, ek hizmet, ek sürücü, vergi); tolerans; sürüm çakışması; para biriminin değişmemesi; revizyon ve parçalarının değişmezliği; liste yokken "Hesaplanmadı" ve teklif reddi; 409 PRICE_CHANGED; tekrar gönderim; yerine yenisi; liste revizyonunun eski teklifi değiştirmemesi; plan değişince "güncel değil"; teklifin değişmezliği ve ödeme alanı olmaması; hedef plan/sınıf uyumu; şube kapsamı; vergisiz brüt hesaplanmaması; şablonda HTML/bağlantı/tanımsız alan/süslü parantez reddi; zorunlu alan olmadan etkinleşmeme (API ve veritabanı); etkin sürümün değişmezliği; tek taslak; kurgusal önizleme; sözleşme anlık görüntüsünde kimlik verisi olmaması; "Fiyat hesaplanmadı"; tek açık sözleşme; PDF başlıkları, ayrı indirme yetkisi, nötr dosya adı, olay ve işlem geçmişi (müşteri adı yok); yaşam döngüsü, imzalı durum yokluğu, içerik/dış beyan değişmezliği, silme yasağı; yeni sürüm; teslim kapılarının "Dikkat" kalması; arşiv nedeni ve kesinliği; tarayıcıda kaydedilmemiş değişiklik koruması, PDF indirme, erişilebilirlik (axe, ciddi/kritik ihlal yok), 390 px'te yatay taşma yok.

Bu sprintte güncellenen eski tarayıcı beklentileri (bilerek değişen metinler): "Fiyat ve kiralama" sekmesi → "Fiyat teklifi"; kiralama başlığındaki fiyat alanı; dönüştürme diyaloğu ve rezervasyon genel notu; kiralama erişilebilirlik turuna iki yeni sekme.

## 10. Performans

Sentetik hacim: 201 fiyat listesi; 100 sezon + 50 ek hizmetli, 20 revizyonlu bir liste; 90 günlük teklif (20 ek hizmet); 30 sürümlü sözleşme. Tek istek süreleri (ms, yerel makine):

| İşlem | ms |
|---|---|
| 201 fiyat listesi | 12 |
| Ağır liste ayrıntısı | 6 |
| 20 revizyonluk geçmiş | 5 |
| Önizleme (90 gün, 100 sezon, 20 ek hizmet) | 9 |
| Kiralama teklif önizleme / kaydetme | 7 / 21 |
| Sözleşme taslağı + PDF üretimi | 344 |
| Kiralamanın sözleşmeleri (30 sürüm) | 6 |
| Sözleşme ayrıntısı / PDF indirme | 8 / 10 |
| Kiralama ayrıntısı (kapılar dahil) | 30 |

Listeler ve ayrıntılar sabit sayıda sorgu (N+1 yok; sayımlar alt sorgu). İndeksler: teklifler (rezervasyon, kiralama, liste), sözleşmeler (kiralama, açık sözleşme tekilliği), olaylar (sözleşme, zaman), istek kimlikleri. PDF yazı tipi süreç başına bir kez yüklenir. Web: Fiyatlandırma, teklif ve sözleşme ekranları ayrı yüklenen parçalardır; paylaşılan paket `sideEffects: false` ile işaretlendi, ana JS paketi main'e göre +15 kB.

## 11. Ekran görüntüleri

`apps/e2e/screenshots/fs1/` (Git dışında; yeniden üretmek için `SCREENSHOTS=1 npx playwright test pricing-contracts pricing-screens`), 1440 / 768 / 390: 01 liste, 02 düzenleyici, 03 yeni liste doğrulama, 04 rezervasyon teklifi, 05 teklif hesaplama, 06 kiralama 360°, 07 kiralama teklifi, 08 sözleşme, 09 arşivleme diyaloğu, 10 Ayarlar şablonlar. Hepsi gözle incelendi; yatay taşma yok. İnceleme sırasında bulunan ve düzeltilen: dar ekranda teklif tablosunun yatay kayması (miktar × birim artık kalemin altında), kayıt sonrası yönlendirmenin "kaydedilmemiş değişiklik" korumasına takılması.

## 12. Ana veritabanının korunması

Ana veritabanına bağlanılmadı, migration uygulanmadı, sentetik fiyat/sözleşme/ödeme verisi eklenmedi. Ana sunucular (3001/5173) main'den çalışmaya devam ediyor; bu dal onlara yüklenmedi.

## 13. Eksik hukuki, mali ve ürün bağımlılıkları

- Ülke/şirket bazında **hukuken onaylı sözleşme metni** (F6) — ACARVO örnek metni kullanılamaz.
- **Vergi oranları ve vergi uygulaması** (KDV/PDV, dahil/hariç, ek hizmet istisnaları) için mali müşavir onayı (F2).
- **Elektronik imza sağlayıcısı** seçimi: altyapı hazır (sözleşme durum makinesi, olaylar, değişmez içerik), entegrasyon yapılmadı; "imzalı" durumu bilerek yok.
- **Teslimde ACARVO sözleşmesinin zorunlu olup olmayacağı** (F8): ayrı ürün kararı.
- Kurumsal anlaşma fiyatı, tek yön ücreti, km şartları, sigorta paketleri, yüksek indirim onay akışı.
- Finans modülü (ödeme, depozito, tahsilat, fatura) — bilerek yapılmadı.

## 14. Main'e geçiş gereksinimleri

1. F1–F4 ve F8 kararlarının onayı; şablon ve vergi için hukuki/mali onay.
2. `safe-migrate` ile doğrulanmış yedekten sonra ana veritabanına 0031–0033.
3. Preset geçmişi v9'un ana veritabanında yalnız değiştirilmemiş Sahip/Yönetici/Operasyon rollerini yükseltmesinin kontrolü.
4. Üretimde PDF depolama dizininin yedek kapsamına alınması.
5. Mevcut kayıtlara fiyat atanmayacağının ve listelerin şirket tarafından girileceğinin kullanıcıya duyurulması.

## 15. Açık riskler

- PDF tek yazı tipine (DejaVu Sans) bağlı; Kiril alfabesi destekli ama Arapça vb. desteklenmez.
- Teklif "güncel değil" uyarısı dönem, sınıf ve ek sürücü sayısına bakar; alış şubesi değişikliği (farklı liste seçilmesine yol açabilir) ayrıca uyarı üretmez — teklif kendi listesini ve revizyonunu açıkça gösterir.
- İsteğe bağlı teslim masası mobil iyileştirmesi bu sprintte yapılmadı (mevcut düzen ve regresyon testleri korunuyor).

---

## Son inceleme ve main entegrasyonu (14.10.2026)

### 1. Ürün kararları

| Karar | Durum |
|---|---|
| F1 Gün hesabı | Uygulandı. Yöntem liste başına zorunlu seçilir, önceden seçili değildir (API seçimsiz listeyi reddeder; testli). **Takvim günü tanımı:** alış şubesinin saat dilimine göre alış ve iade tarihleri arasındaki gün farkı; aynı yerel tarih en az 1 gün; dokunulan her tarih ayrıca ücretlenmez (10 Ekim 23.00 – 11 Ekim 01.00 = 1 gün). 24 saatlik blok yöntemi değişmedi. Mevcut liste ve teklif yok, geriye dönük dönüşüm yapılmadı. |
| F2 Vergi | Uygulandı. Oran tahmin edilmez; yapılandırılmamışsa yalnız net gösterilir ve "vergiler dahil kesin fiyat değildir" yazar. Teklifte oran, dahil/hariç ve yuvarlama kuralı açıkça yazılır. |
| F3 Kademeler | Uygulandı. Toplam süreye karşılık gelen tek kademe; 6/7 ve 29/30 sınırları iki gün yöntemiyle testli; karma kademe yok. Spec'te farklı ve açık bir kademe kuralı bulunmadı (spec yalnız gün hesabı için 24 saatlik blok önerisi içerir). |
| F4 İndirimler | Uygulandı. Teklif başına tek indirim (motor girdisi tek kimlik; API dizi kabul etmez; testli); yalnız kiralama bedeline, açıklama satırıyla; bedeli aşamaz, negatif toplam oluşmaz; kur dönüşümü yok; kaydedilmiş teklif değişmez. İndirimi uygulayan kullanıcı `pricing.quote` ve kaydın şube kapsamıyla denetlenir. |
| F6 Sözleşme metni | Uygulandı. Örnek metin işaretli, etkinleştirme açık beyan ister, PDF'te "TASLAK — HUKUKİ ONAY BEKLİYOR" her sayfada; imzalı durum yok. |
| F8 Teslim | Uygulandı. K1 dış mod varsayılan kapalı, yalnız Sahip açar; iki beyan ve dış referans zorunlu; sözleşme taslağı veya teklif teslimi açmaz (kapılar "Dikkat"). |

### 2. Kapatılan güvenlik açığı: GET ile sahte görüntüleme kaydı

Önceki sürümde sözleşme ayrıntısı (GET) her açılışta "görüntülendi" olayı, PDF GET'i "indirildi" olayı yazıyordu; bağlantıyı tetikleyen her istek kayıt üretebiliyordu. Araç ve müşteri belgelerindeki mevcut erişim izni altyapısı (`lib/document-access.ts`, yeni tür `contract_pdf`) kullanılarak düzeltildi:

1. `POST /api/contracts/:id/access` (`view` / `download`): Origin ve CSRF (genel istek koruması), oturum, aktif şirket, şube kapsamı, `contracts.read` ve indirme için `contracts.download` denetlenir. Ancak bunlardan sonra sözleşme geçmişine (`viewed` / `downloaded`) ve işlem geçmişine (`contract.pdf_view` / `contract.download`) **bir kez** yazılır.
2. Oturuma, kullanıcıya, şirkete, sözleşmeye ve amaca bağlı 2 dakikalık izin oluşturulur; URL'de gizli bilgi yoktur.
3. `GET /api/contracts/:id/pdf` yalnız eşleşen izinle sunar; oturum, şirket, kapsam ve güncel yetkiler her istekte yeniden denetlenir; başka siteden gelen istek reddedilir; **hiçbir kayıt yazmaz** (yeniden yükleme ve PDF görüntüleyici yeni kayıt üretmez).
4. Görüntüleme izni indirmeye yetmez (`?indir=1` 403).
5. Oturum kapanması, yetkinin kaldırılması (her GET'te denetlenir) ve şirket değişimi eski izni geçersiz kılar.
6. Sözleşme ayrıntısı GET'i artık yalnız okur; kayıt yazmaz.
7. Ekranda "PDF taslağını aç" (`contracts.read`) ve "PDF indir" (`contracts.download`) ayrı düğmelerdir.

### 3. Eklenen testler

API (+15): GET'in kayıt yazmadığı, izinsiz dosyanın reddi, CSRF'siz POST'un kayıt/izin üretmediği, tek kayıt + tekrar açmada yeni kayıt olmaması, görüntüleme izninin indirmeye yetmemesi, başka siteden isteğin reddi, Operasyon'un açıp indirememesi, başka şirketin 404 alması, oturum kapanınca/yetki kaldırılınca/şirket değişince iznin bitmesi; motor: 6/7 ve 29/30 sınırları (iki yöntem), takvim günü tanımı ve DST geceleri, şube saat dilimi, sezon sınır günleri, tek indirim ve negatif toplam olmaması, 0/2/3 küsuratlı para birimlerinde yuvarlama, eksik vergi; API: gün yöntemi seçilmemesi, indirim dizisinin reddi, eşzamanlı liste düzenleme (biri 200, biri 409 + güncel liste), eşzamanlı teklif kaydı (tek geçerli teklif), teklifin rezervasyona ve ödemeye dokunmaması, eski sözleşme sürümünün PDF dosyasının korunması ve değiştirilememesi, sunucu günlüklerinde kişisel veri olmaması. Tarayıcı: PDF açma (sunulan yanıt satır içi, no-store), görüntüleme izniyle indirmenin reddi, indirme, geçmişte tek kayıt; Operasyon'da yalnız açma düğmesi.

### 4. Fiyatlandırma doğruluğu

Kayan nokta kullanılmıyor (tamsayı küsurat birimi, BigInt); ISO küsurat basamakları (0/2/3/4); yuvarlama her kalemde ve vergide bir kez, yarım değerler sıfırdan uzağa; sıra: taban → sezonlar → ek hizmetler → indirim (yalnız taban + sezona, en fazla bedel kadar) → vergi (yalnız vergiye tabi kalemlere; hariç: net + vergi, dahil: tutarın içinden ayrılır); negatif toplam imkânsız; eksik tarife "sınıfın tarifesi yok" sorunu; eşit öncelikli sezon çakışması hesaplanmaz; aynı girdi aynı sonucu verir; kaydedilmiş teklif ve revizyonlar değişmez (veritabanı); dönem, sınıf veya ek sürücü sayısı değişince teklif "güncel değil" olur (rezervasyon ve kiralama, testli); farklı para birimleri hiçbir yerde birleştirilmez (bir liste tek para birimi; kur dönüşümü yok).

### 5. Sözleşme ve PDF güvenliği

Şablonlar şirkete özel (RLS + bileşik FK; başka şirketin şablonu/kiralaması görünmez ve kullanılamaz); yalnız izinli alanlar; HTML, script, bağlantı ve dış kaynak reddedilir; PDF üretimi düz metinle, yalnız sabit yoldaki yazı tipleriyle (ağ ve kullanıcı kaynaklı dosya erişimi yok); dosyalar özel depoda rastgele adla, SHA-256 bütünlükle; görüntüleme ve indirme yetkileri gerçekten ayrı ve her GET'te yeniden denetleniyor; içerik, dış beyan ve dosyalar değişmez; eski sürümler ve PDF'leri korunur; işlem geçmişi ve günlüklerde kişisel veri yok.

### 6. PostgreSQL ve migration tutarlılığı

- `acarvo_test`: 34 migration; 34 dosyanın SHA-256 özeti veritabanındaki kayıtla aynı (0009 ve 0017 yalnız satır sonu farkı, bilinen ve zararsız). Boş veya yarım migration yok (0031: 72, 0032: 19, 0033: 3 ifade).
- Ana veritabanı (geçiş öncesi, salt okunur): 31 kayıt; 0000–0030 dosyalarla aynı; yalnız 0031–0033 bekliyor. Uygulanmış eski migration dosyalarında değişiklik yok (`git diff f894b22` yalnız ekleme).
- Yeni SQL yalnız yeni tablolara dokunuyor; mevcut tablolarda tek değişiklik `company_sequences_kind_check` kısıtının genişletilmesi (mevcut değerler geçerli kalır). Satır güncelleyen/silen ifade yok.
- 12 yeni tablonun hepsinde zorunlu RLS + 4 politika; 43 yabancı anahtarın tamamı şirket bileşenli (kullanıcı ve şirket tabloları hariç); uygulama rolünde DELETE yok, ekleme-yalnız tablolarda UPDATE yok.
- Rol izinleri migration ile değil, başlangıçtaki preset yükseltmesiyle (v9) yalnız değiştirilmemiş hazır rollere eklenir; özel rollere dokunulmaz.

### 7. Main entegrasyonu

| Konu | Sonuç |
|---|---|
| Git | İki çalışma ağacı temizdi; main (`f894b22`) dalın atasıydı; yalnız fast-forward. Force, reset veya rebase yok. GitHub'a gönderilmedi. Dal `fiyat-sozlesme-v1` ve `acarvo-fs1` korunuyor. |
| Son main commit'i | Bu raporu güncelleyen commit (kod: `506386e`) |
| Ana sunucular | Kod değişince yeniden başlamaması için geçişten önce durduruldu, geçişten sonra main kodundan yeniden başlatıldı |
| Geçiş öncesi | `safe-migrate --verify`: yalnız 3 bekleyen migration; `--dry-run`: 0031, 0032, 0033; satır sayıları ve içerik özetleri (şirket bazında 50 tablo, kullanıcılar, şirketler, oturumlar, dosya deposu) alındı |
| Doğrulanmış yedek | `C:\Users\soena\Desktop\acarvo\backups\2026-10-13-23-53-12` (yedekteki satır sayıları canlı sayılarla karşılaştırılarak doğrulandı) |
| Ana veritabanı | 31 → **34** migration; `safe-migrate --verify`: sorun yok (59 tablo, 55'i RLS'li) |
| Güvenlik karşılaştırması | 48 yeni politika (12 × 4), 28 yeni uygulama rolü yetkisi, 42 yeni indeks; kaldırılan politika, yetki, indeks yok; RLS ayarı değişen tablo yok; veritabanı rolleri aynı |
| Rol izinleri | Yalnız değiştirilmemiş hazır roller yükseltildi (her iki şirkette): Sahip +7 (fiyat görme/teklif/yönetme, sözleşme görme/yönetme/indirme, şablon yönetimi), Yönetici +5, Operasyon +4 (fiyat görme/teklif, sözleşme görme/yönetme; indirme yok). Özel rol yok, başka izin değişmedi |
| Mevcut gerçek veriler | **Korundu.** Müşteriler, araçlar, sınıflar, rezervasyonlar ve sürücüleri, kiralamalar ve tüm alt kayıtları, araç/müşteri belgeleri, dosyalar, fotoğraflar, km ve konum geçmişi, şubeler, üyelikler, kullanıcılar, şirketler, oturumlar, sıra sayaçları ve dosya deposu (16 dosya) birebir aynı. Tek ekleme: şirket başına 3 `role.preset_upgrade` işlem geçmişi kaydı (sistem) |
| Sentetik veri | Ana veritabanına fiyat listesi, teklif, şablon veya sözleşme eklenmedi (yeni tabloların hepsi boş) |
| Testler (main, yalnız `acarvo_test`) | API **453** / 453; tarayıcı **113** geçti (+27 isteğe bağlı ekran görüntüsü testi) |
| TypeScript ve build | 4 proje hatasız; üretim derlemesi başarılı (ana paket main öncesine göre ~+15 kB) |
| Çalışan uygulama | API http://localhost:3001 sağlıklı (`/api/health` → veritabanı bağlı); web http://localhost:5173 açılıyor; fiyat API'si oturumsuz isteği 401 ile reddediyor |

**Ekran adresleri:** Fiyatlandırma http://localhost:5173/fiyatlandirma (yeni liste: `/fiyatlandirma/yeni`), rezervasyon teklifi `/rezervasyonlar/<id>?sekme=fiyat`, kiralama teklifi `/kiralamalar/<id>?sekme=fiyat`, sözleşme `/kiralamalar/<id>?sekme=sozlesme`, şablonlar http://localhost:5173/ayarlar (yalnız Sahip). Ana veritabanında henüz fiyat listesi ve şablon yok: ekranlar "Fiyat listesi yok" / "Henüz şablon yok" ve teklif/sözleşmede "Hesaplanmadı" gösterir; örnek veri gösterilmez. İçerik doğrulaması gerçek hesabınla değil, test veritabanındaki tarayıcı testleriyle yapıldı.

### 8. Açık riskler

- Erişim izinleri API sürecinin belleğinde: yeniden başlatmada düşer (kullanıcı tekrar tıklar); birden fazla API örneği için ortak depo gerekir (araç ve müşteri belgeleriyle aynı bilinen sınır).
- Operasyon PDF'i tarayıcıda açabilir; tarayıcının kendi kaydet düğmesi teknik olarak engellenemez. "İndirme" yetkisi ACARVO'nun indirme düğmesini ve ek dosyasını yönetir (belge modülleriyle aynı yaklaşım).
- Hukuki onaylı sözleşme metni, vergi oranlarının mali onayı ve e-imza entegrasyonu yok; gerçek kiralamanın tüm hukuki ve operasyonel ön koşulları bu modülle tamamlanmış sayılmaz.
- Ana veritabanındaki 4 şubenin ülkesi boş ve dış sözleşme/fiyat modu kapalı: teslim bilerek yapılamıyor (değiştirilmedi).
- Alış şubesi değişikliği teklif için ayrıca "güncel değil" uyarısı üretmez (teklif kendi listesini ve revizyonunu gösterir).
- PDF yazı tipi DejaVu Sans: Latin ve Kiril desteklenir; Arapça vb. desteklenmez.

### 9. Finans modülüne devredilecek işler

Ödeme ve tahsilat (teklif tutarına bağlanarak, kur kuralıyla), depozito/ön provizyon, borç ve cari hesap, fatura ve vergi belgeleri (onaylı vergi oranları ile), iade ve kredi notu, gecikme/km/hasar ücretleri, kurumsal anlaşma fiyatları, tek yön ücreti ve sigorta paketleri; teslimde "ödeme alındı" kapısının gerçek finans kaydına bağlanması. Teklifler bunun için değişmez kaynak olarak hazır (liste, revizyon, kalemler, vergi durumu); teklif hiçbir zaman ödeme veya borç kaydı sayılmamalı.
