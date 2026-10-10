# ACARVO — Gece çalışma raporu (10–11.10.2026)

Dal: `gece-sprint-2026-10-10` (çıkış noktası `main` @ `e74352d`). `main` dalına dokunulmadı, hiçbir şey GitHub'a gönderilmedi.

## Özet

_Sprint ilerledikçe güncellenir._

| Aşama | Durum | Commit |
|---|---|---|
| 0 Güvenli çalışma ortamı | Tamamlandı | — |
| 1 Tarih ve saat altyapısı | Tamamlandı | `08b19d0` |
| 2 Güvenlik ve yetki denetimi | Tamamlandı | `da529b4` |
| 3 Tarayıcı testleri | Sürüyor | |
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

## Aşama 1 — Uluslararası tarih ve saat altyapısı (`08b19d0`)

İnceleme: veritabanı (`timestamptz` / `date` ayrımı doğru), API (ISO 8601 UTC, takvim tarihleri `YYYY-MM-DD`), sunucudaki "bugün" (şirket saat dilimi, doğru), 48 saat kuralı (gerçek geçen süre, doğru), web biçimlendirme ve formlar.

Bulunan ve düzeltilen hatalar:
1. **Takvim tarihleri bir gün kayabiliyordu.** Web, belge geçerlilik ve edinim tarihlerini (`2026-10-22`) UTC gece yarısı olarak yorumlayıp bilgisayar saatine çeviriyordu; UTC'nin batısındaki bir bilgisayarda (ör. New York) bir gün önce görünürdü. Artık takvim tarihleri hiç çevrilmeden gösteriliyor.
2. **Km/konum formları bilgisayarın saat dilimini kullanıyordu.** Ör. İstanbul'daki bir bilgisayardan Saraybosna şubesi için "09:00" girilince kayıt bir saat kayardı; geç giriş ve "geçmişe eklenecek" uyarıları da kayardı. Artık alan şirket saatiyle (`Europe/Sarajevo`) doldurulup okunuyor; bilgisayar farklı saat dilimindeyse alanın altında belirtiliyor.
3. **Ekrandaki saatler bilgisayar saatiyle gösteriliyordu**; sunucu iletileri ise şirket saatini kullanıyordu. Artık tüm anlar şirket saatinde gösteriliyor (oturumdaki şirket saat dilimi).
4. **Sunucu iletilerinde tarih biçimi farklıydı** ("1.07.2026" / web "01.07.2026"). Aynı biçime getirildi.
5. **Yaz/kış saati:** yaşanmayan saat (29.03 02:30) geçiş sonrasına alınıp formda belirtiliyor; iki kez yaşanan saat (25.10 02:30) ilk geçiş olarak kaydedilip belirtiliyor.

Yeni dosyalar: `packages/shared/src/time.ts`, `apps/api/tests/time.test.ts`. Değişen: `apps/web/src/lib/vehicle-labels.ts`, `apps/web/src/session.ts`, `apps/web/src/pages/vehicles/VehicleHistory.tsx`, `apps/api/src/modules/vehicles/history.ts`, `docs/TEKNIK_UYGULAMA.md` (§9.1).

Testler: 11 yeni test; senaryolar bilgisayar saat dilimi Berlin, İstanbul, New York, Tokyo, UTC ve Honolulu iken çalışıyor (API dahil). **Toplam 150/150 geçti.** Tip kontrolü ve web derlemesi hatasız. Veritabanı şeması değişmedi.

## Aşama 2 — Güvenlik ve yetki denetimi (`da529b4`)

Yöntem: kendi incelemem + bağımsız bir alt ajanın salt okunur kod incelemesi (veritabanına bağlanmadan). Tüm araç uçları (CRUD, fotoğraf, dosya, belge, belge dosyası, km/konum) uçtan uca izlendi.

**Sonuç: şube kapsamını atlayan bir yol (IDOR) veya şirketler arası veri sızıntısı bulunmadı.** Doğru bulunan korumalar: her kimlikli uç aracı yeniden okuyup ana şube kapsamını denetliyor; alt kimlikler (fotoğraf, belge, düzeltilecek kayıt) URL'deki araca bağlı; RLS tüm şirket tablolarında zorunlu; çalışma anında sahip (owner) bağlantısı kullanılmıyor; çerez `__Host-`, HttpOnly, Secure, Lax; CSRF tüm değiştirici isteklerde; hata yanıtları iç bilgi vermiyor; dosya yolları sunucuda üretiliyor ve dosya adları başlığa kullanıcı girdisi olarak girmiyor.

Bulunan ve düzeltilen sorunlar (her biri için regresyon testi var, `apps/api/tests/security.test.ts`):
1. **Orta — askıya alınmış şirket kullanılmaya devam edilebiliyordu.** Şirket `suspended` olsa da mevcut oturumla veya şirket değiştirerek tüm uçlar çalışıyordu. Artık erişim yüklenirken şirketin aktif olması şart.
2. **Düşük/orta — giriş denemesi sınırı tüm kullanıcılar için tek adrese düşüyordu.** API web vekil sunucusunun arkasında olduğu için herkes `127.0.0.1` görünüyordu; bir saldırgan bir kullanıcının e-postasıyla 5 yanlış deneme yapıp hesabı herkese 15 dakika kilitleyebilirdi ve adres başına sınır yoktu. Artık yerel vekil sunucu tarayıcının adresini iletiyor (yalnız loopback güvenilir; üretimde `TRUST_PROXY` ile gerçek vekil sunucu tanımlanmalı, tanımlanmazsa sahte `X-Forwarded-For` yok sayılıyor) ve **adres başına 15 dakikada 30 başarısız giriş** sınırı eklendi. Mevcut adres+e-posta sınırı (5) aynen duruyor.
3. **Düşük — oturum zorla kapandığında önbellek temizlenmiyordu.** Ortak bir bilgisayarda oturumu düşen A kullanıcısından sonra aynı sekmede giren (daha dar şube yetkili) B kullanıcısı, yenileme bitene kadar A'nın önbellekteki araçlarını görebilirdi. Artık 401'de ve her girişte önbellek boşaltılıyor.
4. **İşlevsel — 500 kayıt penceresi.** Geçmiş en yeni 500 kaydı gösteriyor; km sıra kontrolü ve düzeltilecek kaydın bulunması da bu pencereye bakıyordu. 500'den eski bir kayıt düzeltilemiyordu ve çok eski tarihli girişlerde ileti genelleşiyordu (veritabanı koruması yine de doğruyu zorluyordu). Artık bu kontroller doğrudan veritabanından yapılıyor.
5. **Düşük — yükleme uçlarında hız sınırı yoktu.** Fotoğraf ve belge yükleme kullanıcı başına dakikada 40 istekle sınırlandı.

Testler: **156/156 geçti** (6 yeni). Tip kontrolü ve derleme hatasız.

## Onay bekleyen kararlar

1. **Şube saat dilimi mi, şirket saat dilimi mi?** `branches.timezone` alanı var, ancak şu an tüm saat girişi ve gösterimi şirket saat dilimiyle yapılıyor. Farklı ülkelerde şubesi olan bir şirkette (ör. Bosna + Hırvatistan aynı saat diliminde ama Türkiye farklı) km/konum saati aracın bulunduğu şubenin saatiyle mi girilsin? Öneri: şimdilik şirket saati (tutarlı ve basit); çok ülkeli şirketler gelince araç olaylarında olayın şubesinin saat dilimi.

2. **Uygulama rolünün `users.password_hash` sütununu okuyabilmesi.** Şu an güvenli (tüm SQL parametreli), ama ileride bir SQL enjeksiyonu tüm şirketlerin parola özetlerini açığa çıkarırdı. Düzeltme sütun düzeyinde yetki + giriş doğrulaması için `SECURITY DEFINER` bir fonksiyon gerektirir (migration). Gece uygulanmadı; ayrı, küçük bir güvenlik işi olarak öneriyorum.
3. **Belge dosyasını görüntüleme/indirme bir GET isteğiyle işlem geçmişine yazılıyor.** Başka bir siteden verilen bağlantı, oturumu açık kullanıcının adına "görüntülendi" kaydı oluşturabilir (içerik okunamaz; yalnız kayıt gürültüsü). Kabul edilebilir görüyorum; istenirse işlem geçmişine "kaynak" bilgisi eklenebilir.
4. **Girişte eski oturum iptal edilmiyor.** Aynı tarayıcıda yeniden giriş yeni bir oturum açar, eskisi süresi dolana kadar geçerli kalır (oturum sabitleme mümkün değil). İstenirse girişte aynı tarayıcının eski oturumu iptal edilebilir.

## Notlar

- Açık bıraktığınız geliştirme sunucuları (3001/5173) çalışma klasörünü izlediği için gece dalının kodunu yükledi. Değişiklikler geriye uyumludur ve migration gerektirmez; ana veritabanında yalnız sizin kullanımınız kayıt oluşturur. Önceki sürüme dönmek için: `git checkout main`.

## Yarım kalan işler

_Henüz yok._
