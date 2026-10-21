# ACARVO Global — Frontend Prototip V1: Plan

- **Dal:** `frontend-prototip-v1` (main `44354d0`'ten)
- **Worktree:** `C:\Users\soena\Desktop\acarvo-demo-ui`
- **Demo adresi:** `http://localhost:5174` (`npm run dev:demo`, `vite --mode demo`)
- **Sınırlar:** backend, API, veritabanı, migration, `.env` ve `packages/shared` değişmez. Ana veritabanına bağlanılmaz. Main'e birleştirme ve push yapılmaz.

## 1. Başlangıç tespitleri (Aşama 0)

- Main `44354d0`, ana veritabanı 47 migration; başlangıç testleri 534 API / 134 tarayıcı.
- Ana klasörde, benim yapmadığım 6 silme var (şartname + 5 rapor dosyası; Git'te duruyor). Dokunulmadı; yeni worktree main commit'inden alındığı için dosyalar orada eksiksiz.
- Menü: 36 bağlantı (`apps/web/src/nav.ts`). Gerçek modüle bağlı 12: Ana Ekran, Rezervasyonlar, Kiralamalar, Araçlar, Bakım & Servis, Hasar Kayıtları, Müşteriler, Kurumsal Hesaplar, Fiyatlandırma, Finans, Şubeler, Ayarlar. Yer tutucu (ModulePage) 24.
- Gerçek ekranlar `lib/api.ts` üzerinden sunucu sözleşmelerine sıkı bağlı (RentalDetail, RentalFinanceView vb.). Bunları sahte bir API arkasında çalıştırmak, sunucu kurallarının (uygunluk, fiyat, dört göz) istemcide ikinci bir kopyasını gerektirir; bu bilinçli olarak yapılmaz.

## 2. Mimari karar: ayrı demo bağlamı

| Konu | Karar |
|---|---|
| Anahtar | `vite --mode demo` (port 5174). Normal modda demo kodu pakete girmez (dinamik import). |
| Giriş | `main.tsx` demo modunda `demo/start.tsx`'i yükler; gerçek oturum/API/React Query hiç kurulmaz. |
| Gerçek API'ye erişim | Demo girişinde `window.fetch` `/api` isteklerini reddeder ve sayar; `lib/api.ts` demo modunda istek atmadan hata fırlatır (iki katmanlı, kapalı kalır). |
| Veri | `demo/core`: tip güvenli tek `Db` (tek gerçek kaynak), IndexedDB kalıcılığı, sürümlü şema, deterministik tohum, sıfırlama. |
| Hesaplayıcılar | Saf fonksiyonlar, bileşenlerde formül yok: fiyat, süre, vergi, kur, tahsilat tahsisi, bakiye, uygunluk, kapasite, kasa, kurumsal risk, komisyon, tedarikçi borcu. |
| Arayüz | Mevcut V5 bileşenleri yeniden kullanılır (fields, Sheet, Toaster, Plate, Mark, states, FinanceParts); ortak "demo kit" (tablo, sekme, grafik, çekmece, zaman çizelgesi). |
| Gerçek modüller | Değişmez. Demo'daki 12 "gerçek modül" ekranı, demo veri deposuna bağlı aynı görsel dille yeniden kurulur; sunucu kuralları taklit edilmez, demo kuralları ortak hesaplayıcılardan gelir. |
| Dil | TR + EN: kabuk, menü, durumlar, ortak eylemler, ekran başlıkları ve temel akışlar. Kapsam raporda dürüstçe belirtilir. |
| Yetki | Demo rolleri (Sahip, Yönetici, Muhasebe, Operasyon) + Platform Süper Yönetici ve Partner portal bağlamı; menü, sayaç, arama ve eylemler role göre değişir. Yalnız UI simülasyonu. |
| Zaman | Demo tarih simülatörü; gecikme/yaklaşan hesapları seçilen tarihe göre. Arka plan işi yok. |

## 3. Dosya düzeni (`apps/web/src/demo`)

```
start.tsx            giriş: fetch korumasi, bağlam seçimi, yükleme
router.tsx           demo rotaları (36 menü + ayrıntı sayfaları + platform + partner)
core/                types, money, clock, store(persist), actions/*, seed, selectors, calc/*
ui/                  kabuk, tablo, sekme, grafik, çekmece, formlar, rozetler, zaman çizelgesi
pages/<alan>/        her çalışma alanı
i18n.ts              L(tr, en)
```

## 4. Aşamalar

1. **Altyapı:** worktree, demo modu, store, tohum, kabuk, rol ve tarih kontrolü, fetch koruması.
2. **Politikalar:** para birimleri, döviz kurları (tek editör), vergi, süre, sigorta/ekstra, depozito, sürücü politikası, altı formal onay türü.
3. **Operasyon:** Takvim, Görevler, Komuta Merkezi, Filo Asistanı, Olay Merkezi, Ceza, Bakım, Hasar, Araçlar, Rezervasyon, Kiralama (Teslim Masası).
4. **Ticari:** Müşteriler, Kurumsal, Talep Merkezi, Partnerler, Tedarikçiler, Fiyatlandırma.
5. **Finans/Kontrol:** Finans (çoklu tahsilat), Masraflar, Şube Kasaları, Onay Merkezi, Gelir Kontrolü, Riskler, Kurallar.
6. **Analiz:** Kapasite, Filo Analizi, Fırsatlar, Raporlar, Ana Ekran.
7. **Kayıtlar/Yönetim:** Sözleşmeler, Belge Merkezi, İşlem Geçmişi, Şubeler, Kullanıcılar, Roller, Ayarlar, Platform Konsolu, Partner Portalı.
8. **Bütünleşik test:** birim, demo tarayıcı testleri, gerçek API'ye istek gitmediği testi, regresyon, erişilebilirlik, 4 genişlikte ekran incelemesi.

Her aşama sonunda tür kontrolü + ilgili testler + commit.

## 5. Demo senaryoları ve doğrulama

Spec §64.2 çoklu tahsilat (500 EUR → 400 → 300 → kur yok 300 → 1 EUR=1.25 USD → 220 → 0) saf fonksiyon testleriyle ve tarayıcıda doğrulanır. Kasa: EUR/USD nakit kendi kasasına, BAM kart ve EUR havale kasaya girmez.

## 6. Bilinen sınırlar (baştan)

- Gerçek e-imza, POS, banka, SMS/e-posta, yapay zekâ, kur sağlayıcı yok; ekranlar bunu açıkça belirtir.
- Demo mantığı sunucu kurallarının kopyası değildir; gerçek backend bağlantısı (Aşama C) ayrı sprint.
