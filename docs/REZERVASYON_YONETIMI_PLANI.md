# ACARVO — Rezervasyon Yönetimi V1: geliştirme planı

**Dal / klasör:** `rezervasyon-r1` / `C:\Users\soena\Desktop\acarvo-r1`. Başlangıç `main` `2b7c9fc` (24 migration, API 335, tarayıcı 83).

**Dayanak:**
- Spec: §9 (liste, yeni rezervasyon, detay, sınıftan araca atama, yaşam döngüsü), §59AC (uygunluk), §59BF (Gelmedi), §59BQ (kaynak), §59BU (değişiklik geçmişi), §78.1.
- `GELECEK_MODULLER_PLANI.md` §3.3.

**Sınır:**
- Yalnız `acarvo_test` kullanılır; ana veritabanına migration uygulanmaz, main'e birleştirme yapılmaz.
- Kiralama, teslim, iade, fiyatlandırma ve finans bu aşamaya girmez.

## 0. Başlangıç işleri
1. **Kurumsal mükerrer kontrolü** kalıcı sınırla korunur: M2 sayaç altyapısı, yeni tür `corporate_duplicate_check` (migration `0024`).
2. **API testlerinin ilk çalıştırmada yüklenememesi** ("Vitest failed to find the runner") araştırılır ve rapora yazılır.

## 1. Spec'ten alınan kurallar
- **Yaşam döngüsü:** Bekleyen (Pending) → Onaylı (Confirmed) → Kiralamaya dönüştü (Converted). Uç durumlar: İptal (Cancelled) ve Gelmedi (No-show). Dönüşmüş rezervasyon yeniden kullanılmaz.
- **Bekleyen** rezervasyon hiçbir aracı veya kapasiteyi bloke etmez; seçilen araç yalnız tercihtir.
- **Onaylı** rezervasyon aracı bloke eder. Bekleyenden onaylıya geçişte uygunluk aynı işlem içinde yeniden doğrulanır; çakışma varsa 409 döner ve rezervasyon bekleyen kalır.
- **Kapasite:** İptal ve Gelmedi kapasiteyi bırakır. Fazla rezervasyon (overbooking) yoktur.
- **Uygunluk kendi kaydıyla çakışmaz:** düzenlenen rezervasyon kendi aracını çakışma saymaz.
- **Belge eksikliği engellemez.** Ekranda şu mesaj gösterilir: "Rezervasyon oluşturulabilir. Eksik belgeler kiralama başlamadan önce tamamlanmalıdır."
- **Kişi ve kurumsal hesap ayrıdır.** Rezervasyon bir müşteriyle çalışır; gerekirse ayrıca kurumsal hesap bağlamı taşır. Kişi bilgisi kopyalanmaz.
- **Kaynak (§59BQ):** Doğrudan / Gişe, Telefon, Web sitesi (yalnız elle kayıt), İş ortağı, Kurumsal, Tekrar gelen müşteri, Diğer. Sahte canlı kanal yoktur.
- **Gelmedi (§59BF):** gerekçe, işaretleyen kişi, zaman ve not tutulur; iptalle aynı değildir; otomatik ceza eklenmez.
- **Değişiklik geçmişi (§59BU):** tarih, şube, sınıf ve araç değişikliklerinde eski değer, yeni değer, kim, ne zaman ve gerekçe okunur biçimde tutulur.

## 2. Bu aşamada verilen kararlar (güvenli varsayımlar, raporda)

| # | Konu | Karar |
|---|---|---|
| R1 | Sınıf kapasitesi | Bakım, transfer, kiralama ve dış kaynak modülleri yok; aracın gelecekteki konumu bilinmiyor. Bu yüzden **yalnız sınıf seçilen rezervasyon onaylanamaz**, bekleyen kalır. Onay için belirli araç atanır. Sınıftaki etkin araç ve çakışan onaylı rezervasyon sayısı yalnız **bilgi amaçlı, "kesin değil"** etiketiyle gösterilir |
| R2 | Belirli araç uygunluğu | ACARVO'da bulunan bilgilerle denetlenir: araç etkin mi ve aynı araçta çakışan onaylı rezervasyon var mı. Eksik modüller ekranda "denetlenemedi" olarak açıkça yazar |
| R3 | Zaman sınırı | Aralık [alış, iade): 10:00'da biten rezervasyondan sonra 10:00'da başlayan çakışmaz. Hazırlık payı (buffer) tanımlı değil; Ayarlar ile ileride eklenir |
| R4 | Saat dilimi | Alış saati alış şubesinin, iade saati iade şubesinin saat diliminde girilir. Kullanılan saat dilimi rezervasyonda saklanır. Var olmayan saat reddedilir; iki kez yaşanan saatte seçim istenir |
| R5 | Geçmiş tarih | Yeni rezervasyonda alış zamanı 15 dakikadan daha geride olamaz. Düzenlemede, değişen alış zamanına aynı kural uygulanır |
| R6 | Sınıf ve araç | Rezervasyonda araç sınıfı zorunludur. Seçilen araç bu sınıftan olmalıdır; üst sınıf vermek için sınıf değiştirilir |
| R7 | Durum değiştirme | Onaylı rezervasyonun tarihi, şubesi, sınıfı veya aracı değişirse gerekçe zorunludur ve uygunluk yeniden denetlenir. Onaylı rezervasyondan araç kaldırılamaz |
| R8 | Gelmedi | Yalnız onaylı rezervasyonda ve alış zamanı geçtikten sonra işaretlenebilir |
| R9 | Yetkiler | `reservations.read` (Sahip, Yönetici, Operasyon); `reservations.manage`: oluşturma, düzenleme, iptal, Gelmedi (Sahip, Yönetici, Operasyon); `reservations.confirm`: onaylama (Sahip, Yönetici, Operasyon). Hazır roller v6 ile güncellenir; özel roller değişmez |
| R10 | Şube erişimi | Rezervasyonu, alış veya iade şubesi yetki alanında olan kullanıcı görür (tüm şubeli kullanıcı hepsini görür). Oluşturma ve değiştirme için alış şubesi yetki alanında olmalıdır. Araç listesi mevcut araç görünürlüğünü (ana şube) izler |
| R11 | Kurumsal bağlam | Kurumsal hesap seçildiğinde etkin olmalıdır. Sürücü hesabın "yetkili sürücüsü" değilse veya rezervasyon yapan kişi hesapta kayıtlı değilse **uyarı** gösterilir, engellenmez (muafiyet politikası Kiralama modülünde) |
| R12 | Fiyat | Fiyatlandırma modülü yok: fiyat **hesaplanmaz**, "Fiyatlandırma modülüyle gelecek" yazar. Ekstralar, kaparo ve indirim yoktur |
| R13 | Numara | `R-000042`; şirket içinde benzersiz, şube öneki yok. `company_sequences` türüne `reservation` eklenir (yalnız izin listesi genişler) |
| R14 | Kişisel veri | Arama metni gövdede gider. İşlem geçmişinde ad, telefon ve not yoktur; müşteri numarası, şube kodu, plaka ve saatler vardır |

## 3. Veri modeli (migration'lar `0025` yapı, `0026` güvenlik)

| Tablo | İçerik |
|---|---|
| `reservations` | `reservation_no`, `status`, `source`, `customer_id`, `corporate_account_id`, `booker_customer_id`, `vehicle_class_id`, `vehicle_id`, `pickup_branch_id`, `return_branch_id`, `pickup_at`, `return_at`, `pickup_timezone`, `return_timezone`, `note`, onay, iptal ve Gelmedi alanları, `version`, oluşturan/güncelleyen |
| `reservation_drivers` | `customer_id`, `is_primary`, `removed_at` (silinmez); rezervasyonda tek etkin birincil sürücü |
| `reservation_status_events` | `from_status`, `to_status`, `reason`, `note`, kim, ne zaman; yalnız ekleme |

**Kurallar:**
- Zorunlu RLS, şirket bileşik yabancı anahtarları (müşteri, kurumsal hesap, araç, sınıf, şube); DELETE yetkisi yok.
- **Çakışma tetikleyicisi:**
  - onaylı ve araçlı satırda araç başına danışma kilidi alınır;
  - çakışan onaylı rezervasyon varsa ret;
  - araç etkin değilse ret.
- **Durum tetikleyicisi:** yalnız izinli geçişler; uç durumlar değişmez; kimlik sütunları değişmez.

## 4. API (`/api/reservations`)
- **Liste, uygunluk, ayrıntı:**
  - `POST /search`: metin, durum, tarih aralığı, şube, sınıf, araç, müşteri, kurumsal hesap, araç atanmış mı; sıralama ve sayfa;
  - `POST /availability`: sınıf, şubeler ve yerel saatler → araçlar (uygun/çakışmalı, müşteri bilgisi olmadan), bilgi amaçlı sınıf özeti, denetlenemeyenler listesi;
  - `GET /:id`, `GET /:id/history`.
- **Değişiklikler:**
  - `POST /` (bekleyen, ya da yetki ve araç varsa doğrudan onaylı), `PUT /:id` (sürüm, gerekçe);
  - `POST /:id/confirm`, `POST /:id/cancel`, `POST /:id/no-show`.
- **Diğer modüllerden:** `GET /api/customers/:id/reservations`, `GET /api/corporate-accounts/:id/reservations`.

## 5. Ekranlar
- **Rezervasyonlar (`/rezervasyonlar`):** liste ve filtreler, ayrıca 14 günlük araç zaman çizelgesi görünümü.
- **Yeni rezervasyon (`/rezervasyonlar/yeni`):**
  - bölümler: Müşteri, Kurumsal bağlam, Sürücüler, Kiralama planı, Araç, Kaynak ve not;
  - sağda sabit özet kutusu;
  - aynı form düzenlemede de kullanılır (`/rezervasyonlar/$id/duzenle`).
- **Rezervasyon 360° (`/rezervasyonlar/$id`):**
  - başlık ve aksiyonlar (Onayla, Düzenle, İptal et, Gelmedi);
  - sekmeler: Genel, Kişiler, Araç, Durum geçmişi, İşlem geçmişi, Fiyat ve Kiralama (bağlı değil).
- **360° bağlantıları:** Müşteri 360° ve Kurumsal Hesap 360°'taki "Rezervasyonlar" sekmeleri gerçek listeye bağlanır.

## 6. Testler
- **API:**
  - izolasyon, şube yetkisi, RBAC;
  - oluşturma, düzenleme, durum geçişleri, iptal, Gelmedi;
  - aynı araçta çakışma ve eşzamanlı onay, sınır anları;
  - yaz saati geçişi (var olmayan ve iki kez yaşanan saat), farklı saat dilimli şubeler;
  - müşteri, kurumsal hesap ve sürücü bağlantıları, yetki geri alma;
  - eşzamanlı düzenleme, numara çakışmaları;
  - geçmişte ve günlüklerde kişisel veri sızıntısı;
  - performans (binlerce sentetik rezervasyon).
- **Tarayıcı:** akışlar, 1440 / 768 / 390, erişilebilirlik, isteğe bağlı ekran görüntüleri.
