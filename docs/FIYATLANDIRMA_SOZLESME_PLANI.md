# ACARVO — Fiyatlandırma ve Sözleşme Yönetimi V1 Planı

- **Dal:** `fiyat-sozlesme-v1`
- **Klasör:** `C:\Users\soena\Desktop\acarvo-fs1`
- **Başlangıç:** `main` `f894b22` (ana veritabanı 31 migration)
- **Sınır:** Main'e birleştirme yok; ana veritabanına migration yok; Finans modülü yok (ödeme, depozito, borç, fatura, muhasebe yok).

**Kaynaklar (spec):**

| Bölüm | Konu |
|---|---|
| §9.2 Bölüm 6 | fiyat dökümü; fiyat değişirse 409 + açık onay |
| "Pricing currency rule" | tek işlem para birimi, otomatik dönüşüm yok |
| "Authoritative pricing snapshot provenance" | tarihsel görüntü |
| §49 | para |
| §59BH | sezon takvimi |
| §59CR | tek fiyat zinciri |
| §59J | sözleşme çıktıları |
| §66 | vergi |
| §67 | teklif ≠ ücret |
| §68 | süre ve gün hesabı |
| §76 | belge dili, PDF |
| §83.1–83.4 | şablon, sözleşme, imza |
| §85.3 | şablon editörü, numara |
| Kabul F | vergi, gün hesabı, kademeler |

---

## 1. Spec'ten çıkan kurallar

| Konu | Spec | V1 uygulaması |
|---|---|---|
| Fiyat zinciri | 1 sınıf tarifesi → 2 sezon → 3 kurumsal → 4 şube/tek yön → 5 ek hizmet → 6 km → 7 indirim → 8 toplam (§59CR) | Uygulanan adımlar: 1, 2, 5 (ek sürücü dahil), 7 ve vergi. Kurumsal anlaşma, tek yön ücreti, km şartları ve sigorta paketi bu sprintte yok; teklifte "uygulanmadı" diye listelenir |
| Para birimi | Teklif tek işlem para birimi taşır; bileşenler aynı para biriminde; dönüşüm yok; eksikse işlem bloke | Fiyat listesinin tek para birimi (ISO 4217). Ek hizmetler ve indirimler listeye bağlı, aynı para biriminde. Kur dönüşümü hiç yok |
| Küsurat | ISO üssü (JPY 0, KWD 3) | Tutarlar tam sayı alt birim (`bigint`). Para birimi üssü tabloda. Yuvarlama: alt birime, yarım yukarı (sıfırdan uzağa); her kalemde ayrı ve test edilmiş |
| Gün hesabı | "24 saatlik blok; kısmi blok yukarı; 0–60 dk tolerans; min 1 gün" önerilen demo varsayılanı, **evrensel değil** (§68) | Fiyat listesi başına **açık seçim**: `24 saatlik blok` veya `takvim günü` (başlangıç şubesinin saat dilimi); tolerans 0–180 dk; en az gün |
| Kademe | Günlük/haftalık/aylık; öncelik açık yapılandırma (§68) | Kademeler süre uzunluğuna göre: 1–6 gün, 7–29 gün, 30+ gün için ayrı günlük fiyat. Hangi kademenin seçildiği teklifte yazılır |
| Sezon | Tarih aralığı, sınıf (isteğe bağlı), kural, öncelik; çakışmada deterministik öncelik (§59BH) | Yüzde ayarı; her kiralama günü kendi takvim tarihine göre değerlendirilir. Eşit öncelikte çakışma bir yapılandırma hatasıdır ve teklif bloke olur |
| Vergi | Yapılandırılabilir; dahil/hariç; net/vergi/brüt; ülke adına oran varsayılmaz; "hukuki doğrulama gerekir" (§66) | Fiyat listesinde vergi ayarı: `tanımlı değil` / `fiyatlar vergi hariç` / `fiyatlar vergi dahil` + oran + etiket. Varsayılan "tanımlı değil": net toplam gösterilir, vergi ve brüt "hesaplanamadı" olur. Ek hizmet başına "vergiye tabi" ayrımı. Ekranda "oran hukuken doğrulanmadı" uyarısı |
| Teklif | Ön izlemedir, ücret (Charge) değildir; tarihsel görüntü değişmez (§67, provenance) | `price_quotes`: tarife ve sürümü, kalemler, motor sürümü, zaman. Yeni teklif eskisini "yerini aldı" yapar. Ödeme veya borç oluşmaz |
| Fiyat değişimi | 409 + yeni fiyat + açık onay (§9.2) | Kaydederken istemci ön izleme özetini gönderir. Sunucu yeniden hesaplar; farklıysa 409 `PRICE_CHANGED` ve yeni sonuç döner |
| Şablon | Şirket bazlı, dil ve sürüm; izinli dinamik alanlar; bilinmeyen alan basılmaz; zorunlu alanlar kilitli (§83.1, §85.3) | Düz metin gövde + izinli `{{alan}}` listesi. Bilinmeyen alan kaydedilemez. Zorunlu alanlar: sözleşme no, kiracı, araç, dönem, fiyat bölümü. Sürümler değişmez. HTML yok |
| Sözleşme | Taslak/düzenlenmiş/imzalı ayrı; sürüm değişince eski imza taşınmaz; geçmiş değişmez; konsept imza hukuki değildir (§83.2, §83.4) | Durumlar: Taslak → Kontrol bekliyor → Dışarıda işleme alındı; Arşivlendi; Yerini aldı. **E-imza durumu yok.** Değişmez içerik görüntüsü ve PDF |
| PDF | Gerçekten dosya üretiyorsa "PDF İndir"; hukuki imza sertifikası değildir (§85.3, §76) | Sunucuda PDF (pdf-lib + DejaVu Sans). Her sayfada "TASLAK — HUKUKİ ONAY BEKLİYOR" filigranı. İmza alanları boş; yetkili indirme, `no-store`, denetim kaydı |

## 2. Belirsiz ürün kararları (güvenli tarafta; onayınız gerekir)

- **F1 — Gün hesabı:** Fiyat listesi başına seçiliyor; zorunlu bir şirket varsayılanı yok. Yeni listede "24 saatlik blok, tolerans 0, en az 1 gün" önerisi görünür ama kaydedenin onayıyla geçerli olur.
- **F2 — Vergi:** Hiçbir oran hazır gelmiyor. Vergi ayarı yoksa teklif "vergi hesaplanamadı" durumunda kalıyor; brüt toplam ve hukuken kesin fiyat gösterilmiyor.
- **F3 — Kademe yorumu:** Kiralamanın toplam günü hangi kademeye düşerse bütün günler o kademenin günlük fiyatıyla hesaplanıyor (ör. 9 gün → 7–29 gün kademesi × 9). "7 gün paketi + 2 gün günlük" gibi karma hesap V1'de yok.
- **F4 — İndirim:** Teklif başına en fazla bir indirim; fiyat listesinde tanımlı olmak zorunda; serbest tutar yok. Spec'teki "Yüksek İndirim" onay akışı (Onay Merkezi) yok; bu yüzden indirimin üst sınırı listede tanımlı.
- **F5 — Sözleşme numarası:** Taslak kaydı oluşturulduğunda `S-000001` biçiminde ayrılıyor; ön izleme numara tüketmiyor. İptal edilen numara yeniden kullanılmıyor.
- **F6 — Şablon metni:** ACARVO hukuki sözleşme metni sağlamıyor. Örnek şablon yalnız "ÖRNEK — hukuki onay gerektirir" başlığıyla taslak olarak açılabiliyor.
- **F7 — Dışarıda işleme alındı:** Personelin beyanı (dış süreçte imzalandı/işlendi) ve dış referansla kaydediliyor. ACARVO bunu doğrulanmış imza olarak göstermiyor.
- **F8 — Teslim kapıları:** Teklif veya sözleşme taslağının varlığı teslimi serbest bırakmıyor. K1 dış süreç modu ve iki beyan aynen kalıyor. Nihai "teslim için ACARVO sözleşmesi zorunlu" kararı ayrı ürün onayına kaldı.
- **F9 — Yetkiler (en az yetki):**

  | Rol | Yetkiler |
  |---|---|
  | Sahip | tümü |
  | Yönetici | fiyat görme, teklif oluşturma, sözleşme görme/yönetme/indirme |
  | Operasyon | fiyat görme, teklif oluşturma, sözleşme görme ve taslak oluşturma |

  Fiyat listesi, vergi ve şablon yönetimi yalnız Sahip'te. Operasyon PDF indiremiyor (görüntüleme ve indirme ayrı yetki). Özel rollere dokunulmuyor.

## 3. Veri modeli (yalnız `acarvo_test`)

- **Fiyat listeleri ve bileşenleri:**
  - `price_lists`: ad, para birimi, durum (taslak/etkin/arşiv), gün yöntemi, tolerans, en az gün, geçerlilik tarihleri, şube (boş = tüm şubeler), öncelik, vergi ayarı, sürüm (`revision`, her değişiklikte artar), oluşturan ve değiştiren.
  - `price_list_rates`: liste × sınıf; üç kademe günlük fiyat.
  - `price_list_seasons`: ad, başlangıç ve bitiş tarihi, sınıf (isteğe bağlı), yüzde, öncelik, etkin.
  - `price_list_extras`: kod, ad, tür (standart / ek sürücü), fiyatlama (günlük / kiralama başına), fiyat, en fazla adet, vergiye tabi, etkin.
  - `price_list_discounts`: ad, tür (yüzde / sabit), değer, en az gün, etkin.
- **`price_quotes`:** `Q-000001`; rezervasyon **veya** kiralama; durum (teklif / yerini aldı); fiyat listesi ve sürümü; para birimi; plan zamanları; gün; girdiler; kalemler (kaynak kimlikleriyle); net, vergi, brüt; vergi durumu; motor sürümü; hesaplama zamanı; istek kimliği.
  - **Değişmez:** yalnız "yerini aldı" geçişi yapılabilir.
- **Sözleşme şablonları:**
  - `contract_templates`: ad, dil, ülke (isteğe bağlı).
  - `contract_template_versions`: sürüm no, gövde, durum (taslak / etkin / emekli), oluşturan. Etkin sürüm değişmez; tek etkin sürüm.
- **`contracts`:** `S-000001`.
  - Bağlantılar: kiralama, rezervasyon, teklif, şablon sürümü.
  - Durum ve sürüm (`revision`, önceki sözleşme).
  - Değişmez içerik görüntüsü (`content`): taraflar, araç, dönem, kalemler, işlenmiş metin. Kimlik ve ehliyet numarası yok.
  - Dış işleme beyanı ve referansı; oluşturan; durum geçmişi.
- **`contract_files`:** PDF; özel `contracts/` öneki; sha256; boyut; değişmez.
- **`contract_events`:** yalnız eklenir; görüntüleme ve indirme denetimi.
- **Hepsi:** zorunlu RLS, şirket bileşik yabancı anahtarlar, silme yetkisi yok.

## 4. Hesaplama motoru (tek yer: `packages/shared/src/pricing-engine.ts`)

- **Saf fonksiyon:** aynı girdi ve aynı kural sürümü aynı sonucu verir. API teklifleri yalnız sunucuda hesaplıyor; arayüz yalnız sunucunun ön izlemesini gösteriyor.
- **Süre:**
  - `24 saatlik blok`: `ceil((iade − alış − tolerans) / 24 saat)`, en az `min_days`.
  - `takvim günü`: başlangıç şubesinin saat diliminde alış ile iade arasındaki takvim günü sayısı (iade günü dahil değil; aynı gün = 1), en az `min_days`.
  - **DST:** süre anlık zamanlardan hesaplanıyor; günlerin takvim tarihi şubenin saat diliminde bulunuyor.
- **Günlük kalemler:** her ücretlendirilen günün tarihi = alış tarihi + n (şube saat diliminde). Sezon yüzdesi gün başına uygulanıyor ve aynı oranlar teklifte gruplanıyor.
- **Sıra:**
  1. temel (kademe fiyatı × gün, sezonlar);
  2. ek hizmetler (gün başına × gün veya sabit, × adet; ek sürücü: ek sürücü sayısı);
  3. indirim (yalnız temel kirada; yüzde veya sabit; temelden fazla olamaz);
  4. vergi (vergiye tabi kalemler üzerinden; hariçse eklenir, dahilse içinden ayrıştırılır);
  5. toplam.

## 5. API

| Grup | Uçlar |
|---|---|
| `/api/pricing` | `GET/POST /price-lists`, `GET/PUT /price-lists/:id` (sürüm kontrollü; tarifeler, sezonlar, ek hizmetler, indirimler ve vergi tek belge olarak), `POST /price-lists/:id/activate`, `/archive`, `POST /preview`, `GET /price-lists/:id/history` |
| Teklifler | `POST /api/reservations/:id/quotes`, `POST /api/rentals/:id/quotes` (önizleme özeti + istek kimliği), `GET .../quotes` |
| Şablonlar (`/api/contract-templates`) | liste; oluştur; sürüm taslağı kaydet; etkinleştir; ön izle (ÖRNEK verisiyle) |
| Sözleşmeler (`/api/contracts`) | `POST /api/rentals/:id/contracts` (taslak + PDF), `GET /api/contracts/:id`, `POST /:id/review`, `/external`, `/archive`, `/revise`, `GET /:id/pdf` (indirme yetkisi ve denetim), `GET /api/rentals/:id/contracts` |

## 6. Ekranlar

- **Yönetim → Fiyatlandırma** (`/fiyatlandirma`): liste; fiyat listesi düzenleyici (genel, tarifeler, sezonlar, ek hizmetler, indirimler, vergi, geçmiş); hesaplama önizlemesi.
- **Ayarlar → Sözleşme şablonları:** liste, sürüm düzenleyici, alan seçici, ÖRNEK ön izleme.
- **Rezervasyon 360° "Fiyat ve kiralama" ve Kiralama 360°:** teklif hesapla/kaydet, döküm, teklif geçmişi.
- **Kiralama 360° "Sözleşme" sekmesi:** taslak oluştur, PDF ön izleme ve indirme (yetkiye göre), durum geçmişi.
