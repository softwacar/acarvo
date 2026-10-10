# ACARVO — Gece çalışma raporu (10–11.10.2026)

Dal: `gece-sprint-2026-10-10` (çıkış noktası `main` @ `e74352d`). `main` dalına dokunulmadı, hiçbir şey GitHub'a gönderilmedi.

## Özet

_Sprint ilerledikçe güncellenir._

| Aşama | Durum | Commit |
|---|---|---|
| 0 Güvenli çalışma ortamı | Tamamlandı | — |
| 1 Tarih ve saat altyapısı | Sürüyor | |
| 2 Güvenlik ve yetki denetimi | Bekliyor | |
| 3 Tarayıcı testleri | Bekliyor | |
| 4 Kullanılabilirlik ve erişilebilirlik | Bekliyor | |
| 5 Araç modülünde küçük eksikler | Bekliyor | |
| 6 Performans | Bekliyor | |
| 7 Kod kalitesi ve dağıtım güvenliği | Bekliyor | |
| 8 Gelecek modüllerin planı | Bekliyor | |

## Aşama 0 — Güvenli çalışma ortamı

- Git: çalışma ağacı temizdi (kaydedilmemiş kullanıcı değişikliği yok). Gece işleri ayrı dalda.
- Test veritabanı koruması doğrulandı (`apps/api/tests/db-guard.ts`, `helpers.ts`): test bağlantı adresleri ana adresle aynıysa testler içe aktarılırken durur; her veri işleminden önce canlı bağlantılarda `current_database()` = `acarvo_test` kontrol edilir; hata hatırlanır ve sonraki tüm çağrıları durdurur.
- Ana veritabanının **salt okunur** parmak izi alındı (her şirket için tablo başına satır sayısı ve içerik özeti, kullanıcılar, migration sayısı) ve özel depolamadaki 16 dosyanın SHA-256 listesi kaydedildi. Sprint sonunda yeniden karşılaştırılacak.
- Geliştirme sunucuları (API 3001, web 5173) ana veritabanına bağlı olduğundan bu gece **kullanılmadı**; tarayıcı denemeleri ayrı portlarda test veritabanına bağlı bir kopya üzerinden yapıldı.

## Onay bekleyen kararlar

_Henüz yok._

## Yarım kalan işler

_Henüz yok._
