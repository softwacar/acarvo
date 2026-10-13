# ACARVO — Kiralama, Teslim ve İade V1 Planı

Dal: `kiralama-k1` · Klasör: `C:\Users\soena\Desktop\acarvo-k1` · Başlangıç: `main` `0013023` (ana veritabanı 27 migration)

Kaynaklar: spec §10 (Kiralamalar), §59B/§59L (teslim/iade kaydı ve kabul), §59D (hazırlık), §59BV (uzatma), §59BW (araç değişimi), §59BX (erken/geç iade), §59BY (iptal), §59CY (tek km gerçeği), §59CZ (çapraz kurallar), §68–71, §83.2–83.4 (sözleşme, sürücü, hasar işareti, imza), §85.4 (Teslim Masası); mevcut `docs/TEKNIK_UYGULAMA.md`, `docs/REZERVASYON_*`, `docs/M2_*`, `docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md`, `docs/GELECEK_MODULLER_PLANI.md` §3.4.

Bu sprint test ortamında biter: main'e birleştirme yok, ana veritabanına migration yok, Finans / Bakım / Transfer / Hasar modülü yok.

---

## 1. Spec'ten çıkan kurallar

| Konu | Spec kuralı | V1 uygulaması |
|---|---|---|
| Yaşam döngüsü | Prepared → Delivered → Returned → Closed; Prepared → Cancelled; Delivered → Loss Closed / Exception Closed (§10.3, §71) | `prepared` (Teslim bekliyor), `delivered` (Aktif), `returned` (İade alındı, kontrol bekliyor), `closed` (Kapandı), `cancelled` (İptal). Olağan dışı sonlar (§71) bu sprintte yok: polis/sigorta kanıt akışı ve ayrı yetki kararı gerektirir (K7) |
| Araç | Kiralama sınıfla tutulmaz; belirli araç zorunlu (§10.2) | `vehicle_id NOT NULL` |
| Rezervasyondan dönüşüm | Belirli araç + yetkili müsaitlik; dönüşmüş rezervasyon yeniden kullanılmaz (§9) | Yalnız **onaylı** rezervasyon dönüşür; aynı işlemde rezervasyon `converted` olur, kiralama `prepared` açılır. Rezervasyon başına en fazla bir kiralama (benzersiz kısıt) |
| Rezervasyonsuz kiralama | Spec açıkça izin verir (§10.2) | Desteklenir; aynı araç ve belge kapıları geçerli |
| İptal | Yalnız `Prepared` iptal edilir; teslim edilmiş kiralama iptal edilmez (§59BY) | Veritabanı ve API'de uygulanır |
| Teslim kaydı | km, beş sabit yakıt değeri, 4–5 fotoğraf, görünür durum notu, anahtar/ekipman, personel, zaman (§59B, §10.3) | Hepsi; her kontrol maddesi açıkça yanıtlanmalı, varsayılan "tamam" yok |
| İade kaydı | Ayrı kayıt, ayrı 4–5 fotoğraf, yeni hasar; karşılaştırma (§59B, §59L) | İade (km, yakıt, zaman, şube) → İade kontrolü (fotoğraf, kontrol listesi, hasar farkı) → Kapanış |
| Kapanış | Returned → Closed yalnız iade kaydı ve 4–5 fotoğraf, anahtar/ekipman ve yeni hasar bağlantısı tamamsa; bakiye/finans/araç hazır olmak zorunda değil (§10.3) | Aynı kapılar. Hasar modülü olmadığı için yeni hasar "bulgu" olarak kaydedilir; hasar dosyası açılmış gibi gösterilmez (K6) |
| Km | Tek km gerçeği; teslim ve iade km olayıdır; geriye düşemez (§59CY) | Mevcut `odometer_readings` tablosuna `rental_handover` / `rental_return` olayı, aynı işlemde, kaynağı bağlı. Eski kayıtlar değişmez; kaynak bağlı kayıt el ile düzeltilemez (mevcut `SOURCE_OWNED` kuralı) |
| Konum | Konum olayları geçmişi | Teslimde "Müşteride", iadede gerçek iade şubesi. Aracın kayıtlı ana şubesi değişmez: bu bir transfer değildir |
| Yakıt | Yalnız Boş, 1/4, 1/2, 3/4, Dolu (§59B) | Aynı beş değer |
| Hasar işareti | Gövde silueti üstünde işaret; işaret tek başına hasar dosyası ya da ücret değildir (§83.4) | Görünüm (ön/arka/sol/sağ/üst) + konum + tür + not. İade işaretleri ayrı set; teslim işaretleri salt okunur referans |
| Geç iade | Planlanan / gerçek / fark; otomatik görev yok, otomatik ücret yok (§59BX) | Gecikme süresi gösterilir; ücret "Hesaplanmadı" |
| Uzatma | Yetkili müsaitlik denetimi; uzatma ödendi demek değildir (§59BV) | Yeni iade zamanı aynı ortak çakışma denetiminden geçer; gerekçe ve talep kanalı kaydedilir; fiyat etkisi "Hesaplanmadı" |
| Sözleşme | Taslak / düzenlenmiş / imzalı ayrı; konsept imza hukuki imza değildir (§83.2, §83.4) | Sözleşme modülü yok: ekranda "Sözleşme: ACARVO'da yok" olarak dürüstçe gösterilir; imza, PDF veya yasal geçerlilik iddiası yok (K1) |
| Fiyat / ödeme / depozito | Teslimde tek temel ücret (Base Charge) (§85.4) | Finans modülü yok: ücret, ödeme, depozito, borç ve fatura oluşturulmaz; "Hesaplanmadı" (K1) |
| Belgeler | Uygulanan belge gereksinimi kiralama dosyasına sabitlenir; sonradan değişmez (§10.3) | Kiralamaya özel belge kontrolü kaydı: personelin seçtiği Yerli/Yabancı, referans ülke, politika ve sürümü (varsa), kullanılan belge kayıt kimlikleri, personel kararı. Değiştirilemez (K3, K4) |

## 2. Kritik ürün kararları

Spec'te açık olmayan, bu sprintte **güvenli tarafta** verilmiş kararlar. Main'e geçmeden önce onayınız gerekir.

- **K1 — Sözleşme ve fiyat yokken teslim.** Sözleşme ve Finans modülleri yok. Teslim tamamen engellenirse teslim/iade hiç kullanılamaz. Bu yüzden teslim yalnız personelin açık beyanıyla yapılır: "Bu teslimde ACARVO'da sözleşme ve fiyat yoktur; ticari ve hukuki belgeler ACARVO dışında yönetilir." Beyan, kimin verdiği ve zamanı kaydedilir. Ekranlarda sözleşme ve fiyat her yerde "ACARVO'da yok / Hesaplanmadı" görünür. Ödeme alındı, borç, fatura veya imzalı sözleşme gösterilmez. *Alternatif:* teslim, sözleşme modülü gelene kadar tamamen kapalı. Bu tek sabitle açılıp kapanır (`RENTAL_EXTERNAL_TERMS_ALLOWED`).
- **K2 — Gecikmiş kiralamadaki araç.** Araç fiilen iade edilmediyse ve planlanan iade geçtiyse kiralama aracı **iade edilene kadar** tutar. Yeni onaylı rezervasyon ve yeni kiralama reddedilir. Çakışan mevcut onaylı rezervasyonlar "Gecikme nedeniyle etkilenebilir" uyarısıyla gösterilir; otomatik iptal veya yeniden atama yapılmaz.
- **K3 — Referans ülke.** Kiralama başlangıç şubesinin ülkesidir. Şubede ülke yoksa teslim engellenir ("Şube ülkesi tanımlı değil"); ülke tahmin edilmez, otomatik doldurulmaz.
- **K4 — Yerli/Yabancı ve belge kontrolü.** Sistem yalnız öneri gösterir (ikamet ülkesi ile referans ülkenin karşılaştırması; uyruk kullanılmaz). Nihai sınıflandırmayı personel seçer.
  - Ülke için etkin belge politikası **yoksa** sonuç "Belge kuralı tanımlı değil" olur, "belge gerekmez" sonucu çıkarılmaz. Teslim yalnız personelin her sürücü için "Belgeleri gördüm ve kontrol ettim" kararıyla mümkündür. Bu karar "Personel kontrolü (kural tanımsız)" olarak kaydedilir, "doğrulandı" olarak gösterilmez.
  - Etkin politika varsa gerekli türler ve müşterinin geçerli belge kayıtları (yalnız tür ve geçerlilik, numara yok) gösterilir. Eksik belge varsa personel "uygun" kararı veremez.
  - Kurumsal ilişki belge kontrolünü kaldırmaz.
- **K5 — Önceki iade kontrolü bitmemiş araç.** Aracın önceki kiralaması "İade alındı" durumunda kaldıysa (iade kontrolü ve fotoğraflar tamamlanmadıysa) yeni teslim engellenir. Spec §59D'deki "teslim hazırlığı tamam mı" sorusu böyle karşılanır.
- **K6 — Yeni hasar.** İade kontrolünde teslimde olmayan işaretler "yeni bulgu" olarak kaydedilir. Hasar modülü olmadığı için hasar dosyası açılmaz; sorumluluk, muafiyet ve ücret kararı verilmez. Kapanışta personel yeni bulguları gördüğünü onaylar; bulgular kiralamada kalıcı kalır.
- **K7 — Olağan dışı sonlar ve araç değişimi.** Çalıntı, pert, el koyma ve araç değişimi (§59BW) bu sprintte yok. Teslim edilmiş kiralamada araç değiştirilemez.
- **K8 — Gerçek zaman girişi.** Teslim ve iade zamanı varsayılan olarak şu andır. Personel geç kayıt için şube saatinde geçmiş bir zaman girebilir: teslimde en çok 24 saat, iadede en çok 72 saat geriye. Gelecek zaman girilemez; iade teslimden önce olamaz.
- **K9 — Gecikme toleransı.** Spec §68'deki tolerans ayarı henüz yok. Gecikme planlanan iadeden itibaren gösterilir; ekranda "Gecikme toleransı tanımlı değil" yazar.

## 3. Veri modeli (migration 0027 + 0028)

- `rentals`: `K-000001` biçiminde şirket içinde benzersiz numara (`company_sequences` türü `rental`).
  - Taraflar ve plan: rezervasyon (benzersiz, isteğe bağlı), müşteri, kurumsal hesap, sınıf, araç; başlangıç şubesi ve planlanan iade şubesi; planlanan alış ve iade zamanı, her biri kendi şubesinin saat dilimiyle.
  - Teslim: zaman, şube, eden, beyan (K1).
  - İade: zaman, şube, alan.
  - Kapanış ve iptal: kim, ne zaman, neden.
  - Ayrıca not, sürüm (iyimser eşzamanlılık) ve oluşturma isteği kimliği (idempotency).
- `rental_drivers`: tam bir ana sürücü, 0..5 ek sürücü. Kaldırma bir işarettir; kayıt silinmez.
- `rental_status_events`: yalnız eklenir; tekrar gönderilen istekler için istek kimliği benzersizdir.
- `rental_document_checks`: değiştirilemez kayıt (bkz. K4). Her sürücü için ayrı satır. İçerik:
  - sınıflandırma ve referans ülke;
  - politika ve sürümü;
  - kural durumu;
  - gerekli türler;
  - kullanılan belge kayıt kimlikleri;
  - personel kararı ve notu.

  Yeni karar yeni satırdır; geçerli olan en sonuncudur.
- `rental_inspections`: her kiralamada en fazla bir teslim ve bir iade kontrolü.
  - Durum: `draft` → `final`; kesinleşen kontrol değiştirilemez.
  - İçerik:
    - km;
    - yakıt;
    - temizlik;
    - genel durum;
    - kontrol listesi (her madde açık yanıt);
    - not;
    - teslim alan / eden sürücü;
    - km ve konum kayıtlarının bağlantısı.
- `rental_inspection_photos`: kontrol başına en fazla 5 etkin fotoğraf, açı etiketiyle. Taslakta kaldırma bir işarettir; dosya silinmez. Kesinleşen kontrolde değişmez.
- `rental_damage_marks`: görünüm, normalize x/y, tür, not ve isteğe bağlı fotoğraf bağlantısı. İade işareti teslimdeki bir işarete bağlanabilir (`existing_mark_id`); bağlı değilse yeni bulgudur.
- `files.kind`: `rental_inspection_photo` eklenir; dosyalar ayrı önekte durur.
- Mevcut tablolarda yalnız izin listeleri genişler:
  - `odometer_readings` ve `vehicle_location_events`: olay ve kaynak türlerine `rental_handover`, `rental_return` eklenir;
  - `company_sequences`: tür listesine `rental` eklenir.
- Hiçbir mevcut satır değişmez.

### 3.1 Ortak araç tahsisi koruması (en kritik konu)

Rezervasyon ve kiralama ayrı tablolardadır. Tek tablonun kısıtı iki tablo arasındaki çakışmayı yakalayamaz. Bu yüzden:

1. Tek kilit: `vehicle-allocation:{şirket}:{araç}` işlem kilidi. Rezervasyon tetikleyicisi (0028'de `CREATE OR REPLACE` ile güncellenir; 0026 dosyası değişmez), kiralama tetikleyicisi ve API aynı kilidi alır. Aynı araca yapılan bütün tahsis yazımları sıraya girer.
2. Tek tanım, `vehicle_busy(şirket, araç, başlangıç, bitiş, hariç rezervasyon, hariç kiralama)`; ikisi de SQL fonksiyonu:
   - onaylı rezervasyonlar: `[alış, iade)`;
   - `prepared` kiralama: `[planlanan alış, planlanan iade)`;
   - `delivered` kiralama: `[gerçek teslim, planlanan iade)`, planlanan iade geçmişse `[gerçek teslim, ∞)` (K2);
   - `returned` / `closed` kiralama: `[gerçek teslim, gerçek iade)`;
   - iptal edilmiş kiralama ve bekleyen, iptal edilmiş, gelmedi veya dönüşmüş rezervasyon: hiçbir şey tutmaz.
3. Hem rezervasyon onayı ve düzenlemesi hem kiralama oluşturma, düzenleme, erken teslim ve uzatma bu fonksiyondan geçer. Rezervasyonun müsaitlik ekranı da aynı fonksiyonu kullanır: iki modül çelişen sonuç üretemez.
4. Rezervasyondan dönüşümde önce rezervasyon `converted` olur, sonra kiralama eklenir; ikisi aynı işlemdedir. Kendi rezervasyonu kendisiyle çakışmaz; işlem yarıda kalırsa ikisi birden geri alınır.

## 4. API

`/api/rentals`:
- `POST /search` (arama metni gövdede)
- `GET /branches`
- `POST /availability`
- `GET /:id`
- `GET /:id/history`
- `POST /` (doğrudan kiralama)
- `POST /from-reservation/:reservationId`
- `PUT /:id` (yalnız `prepared`)
- `POST /:id/cancel`
- `PUT /:id/document-check`
- `PUT /:id/inspections/:kind`, kontrol taslağı (`kind`: handover / return)
- `POST /:id/inspections/:kind/photos`
- `DELETE /:id/inspections/:kind/photos/:photoId` (yalnız taslak; dosya silinmez)
- `GET /:id/photos/:photoId` (yetkili akış)
- `POST /:id/deliver`
- `POST /:id/extend`
- `POST /:id/return`
- `POST /:id/close`

İlgili listeler:
- `/api/customers/:id/rentals`
- `/api/corporate-accounts/:id/rentals`
- `/api/vehicles/:id/rentals`

Durum değiştiren her uç:
- sürüm ister (eski ekran sessizce yazamaz);
- istek kimliği alır (ağ kesintisinde tekrar gönderilen istek ikinci kayıt üretmez, aynı sonucu döner);
- şirket (RLS), yetki ve şube kapsamını denetler;
- işlem geçmişine yalnız numara, plaka ve şube kodu yazar; ad, iletişim bilgisi, belge numarası veya not yazmaz.

### Yetkiler (hazır roller, preset geçmişi v7)
- `rentals.read`, `rentals.manage` (oluştur, düzenle, iptal, uzat, belge kontrolü), `rentals.handover` (teslim, iade, kontrol, kapanış).
- Sahip, Yönetici ve Operasyon üçünü de alır. Özel rollere dokunulmaz.
- Operasyon'a yeni belge görüntüleme veya numara açma yetkisi verilmez.

### Şube kapsamı (mevcut kural: API'de)
- Görme: başlangıç, planlanan iade veya gerçek iade şubesi kapsamdaysa.
- Oluşturma, düzenleme, iptal, uzatma, belge kontrolü ve teslim: başlangıç şubesi.
- İade: gerçek iade şubesi.
- Kapanış: gerçek iade şubesi veya başlangıç şubesi.

## 5. Ekranlar

- **Kiralamalar listesi** (`/kiralamalar`):
  - görünümler: Aktif, Teslim bekleyen, Geciken, İade kontrolü bekleyen, Kapanan, Tümü;
  - filtreler: arama, şube, tarih, müşteri, araç;
  - sıralama ve sayfalama; telefonda kart düzeni.
- **Yeni kiralama**:
  - doğrudan (`/kiralamalar/yeni`) veya rezervasyondan (Rezervasyon 360°'tan "Kiralamaya dönüştür");
  - adımlar: müşteri, sürücüler, şubeler ve zaman, araç (ortak müsaitlik).
- **Kiralama 360°** (`/kiralamalar/:id`):
  - üst bant ve üç karar kartı: Belgeler ve sürücüler, Araç ve teslim hazırlığı, Fiyat / sözleşme / depozito ("ACARVO'da yok");
  - sekmeler: Genel, Müşteri ve sürücüler, Araç ve rezervasyon, Teslim, İade, Hasar ve fotoğraflar (önce/sonra), Geçmiş.
- **Teslim formu** (`/kiralamalar/:id/teslim`) ve **İade formu** (`/kiralamalar/:id/iade`):
  - km, yakıt, kontrol listesi, gövde siluetinde hasar işareti, 4–5 fotoğraf;
  - kapı listesi ve tek "Teslimi tamamla" / "İadeyi al" eylemi.
- Müşteri 360°, Kurumsal Hesap 360° ve Araç 360° ekranlarında Kiralamalar sekmesi gerçek listeyi gösterir.

## 6. Test planı (yalnız `acarvo_test`, yalnız sentetik veri)

**API:**
- Şirket ve şube izolasyonu; yetkiler.
- Dönüşüm ve doğrudan kiralama.
- Çakışmalar:
  - rezervasyon ↔ kiralama, her iki yönde;
  - eşzamanlı oluşturma, teslim ve iade;
  - erken teslim, uzatma, gecikme.
- Km ve yakıt.
- Fotoğraflar: tür, boyut, metadata, yetki.
- Hasar farkı.
- DST: olmayan saat reddi, iki kez yaşanan saat.
- Belge yetkileri; işlem geçmişinde kişisel veri olmaması.
- Yetkisiz geçişler.
- Tekrar gönderilen istekler.
- Rezervasyonun eski verilerinin korunması; veritabanı tetikleyicileri.
- 5.000 kiralamalık performans ölçümü.

**Tarayıcı:**
- liste;
- dönüşüm;
- teslim ve iade akışları;
- karşılaştırma;
- çakışma uyarıları;
- 1440/768/390 ekran görüntüleri;
- erişilebilirlik (axe) ve telefonda yatay taşma.
