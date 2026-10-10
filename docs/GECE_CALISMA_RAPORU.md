# ACARVO — Gece çalışma raporu (10–11.10.2026)

Dal: `gece-sprint-2026-10-10` (çıkış noktası `main` @ `e74352d`). `main` dalına dokunulmadı, hiçbir şey GitHub'a gönderilmedi.

## Özet (sabah için)

- **8 aşamanın hepsi tamamlandı.** Ana dal `main` ve ana veritabanı olduğu gibi duruyor; tüm iş `gece-sprint-2026-10-10` dalında: gece **16 commit** (`git rev-list --count main..gece-sprint-2026-10-10`; rapor düzeltmesi bunlara dahil değil). İlk raporda "17", özet mesajında "18" yazmıştı; ikisi de yanlıştı.
- **Testler:** API **165/165** (gece başında 139; +26), tarayıcı **34/34** (yeni; ayrıca 3 isteğe bağlı ekran görüntüsü testi). Tip kontrolü ve üretim derlemesi hatasız.
- **Düzeltilen önemli hatalar:**
  - askıya alınmış şirketin kullanılmaya devam edebilmesi (güvenlik);
  - giriş sınırının herkes için tek adrese düşmesi (güvenlik);
  - oturum düşünce önbelleğin temizlenmemesi;
  - takvim tarihlerinin bazı saat dilimlerinde bir gün kayması;
  - km/konum saatinin bilgisayar saatine göre girilmesi;
  - çıkışta ekranın bir an çökmesi;
  - telefonda araç listesinde araç sütununun kaybolması;
  - yan paneller kapanınca odağın kaybolması;
  - kaydedilmemiş bilgilerin uyarısız kaybolması;
  - API hatasında "kayıt yok" denmesi;
  - büyük filoda listenin yavaşlaması.
- **Yeni küçük özellikler:** araç listesinde belge uyarısı, "Belgeler" ve "Güncel konum" filtreleri.
- **Yeni altyapı:**
  - tekrar çalıştırılabilir tarayıcı testleri (`npm run test:e2e`, yalnız test veritabanı);
  - güvenli migration aracı (`scripts/safe-migrate.mjs`);
  - performans ölçüm betiği.
- **Onayınızı bekleyen 6 karar** aşağıda. En acil olanı yok; hiçbiri çalışmayı engellemiyor.
- **Sıradaki modül için öneri** `docs/GELECEK_MODULLER_PLANI.md` içinde: önce Müşteriler + Kurumsal hesaplar, ardından küçük Araç transferi modülü ("Yolda" kararını çözer) ve Bakım.

| Aşama | Durum | Commit |
|---|---|---|
| 0 Güvenli çalışma ortamı | Tamamlandı | — |
| 1 Tarih ve saat altyapısı | Tamamlandı | `08b19d0` |
| 2 Güvenlik ve yetki denetimi | Tamamlandı | `da529b4` |
| 3 Tarayıcı testleri | Tamamlandı | `eeebc0c` |
| 4 Kullanılabilirlik ve erişilebilirlik | Tamamlandı | `652146a` |
| 5 Araç modülünde küçük eksikler | Tamamlandı | `ba9675e` |
| 6 Performans | Tamamlandı | `325b1e0` |
| 7 Kod kalitesi ve dağıtım güvenliği | Tamamlandı | `d9d5b4c` |
| 8 Gelecek modüllerin planı | Tamamlandı (yalnız plan) | `d5c87ed` |

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

## Aşama 3 — Tarayıcı test altyapısı (`eeebc0c`)

Yeni çalışma alanı `apps/e2e` (Playwright 1.63.0, iki haftadan eski sabit sürüm). Çalıştırma: `npm run test:e2e`.

- Testler kendi API (3101) ve web (5181) sunucularını başlatır; API `acarvo_test` ve geçici depolama kullanır. Geliştirme sunucuları ve ana veritabanı kullanılmaz; yapılandırma, test adresleri `acarvo_test` değilse çalışmayı durdurur.
- Her çalıştırmada test veritabanı korumalı sıfırlamayla yeniden kurulur; test kullanıcılarına o çalıştırmaya özel rastgele parola verilir. Kişisel parolanız veya Chrome oturumunuz kullanılmaz; Playwright'ın kendi Chromium'u, temiz profillerle.
- **23 test, art arda iki çalıştırmada 23/23 geçti** (~1,3 dk): giriş/çıkış, oturumsuz erişimde girişe yönlendirme ve geri dönüş, şirket değiştirme ve başka şirketin araç adresi, liste arama ve filtrenin adreste kalması, araç ekleme, mükerrer plaka, iki sekmeyle sürüm çakışması, 360° sekmeleri ve bilinmeyen araç, fotoğraf yükleme/ana yapma/sıralama/kaldırma ve görsel olmayan dosyanın reddi, belge ekleme + görüntüleme (inline, sandbox, no-store) + indirme (sunucu adı) + kesintisiz yenileme, km düşüşü/büyük artış/kayıt/düzeltme, konum (servis → şube, ana şube değişmez), **tarayıcı İstanbul saatindeyken Saraybosna saatiyle geçmiş tarihli km girişi**, şube sınırlı kullanıcının yetkisiz araç/şube/düzeltme kısıtları, telefon (390 px).

Testlerin yakaladığı ve düzeltilen hatalar:
1. **Çıkış yaparken ekran bir an çöküyordu** ("useSession outside an authenticated route"); oturum silinip yönlendirme bitmeden düzen yeniden çiziliyordu. Artık oturum yokken düzen hiçbir şey çizmiyor (401 ile zorla çıkışı da kapsar).
2. **Telefonda araç listesinde "Araç" sütunu sıfır genişliğe iniyordu**; başlıklar üst üste biniyor, araca götüren bağlantı görünmüyordu (araç yalnız satıra dokunarak açılabiliyordu, klavye/ekran okuyucuyla açılamıyordu). Tablo artık dar ekranda kendi kartı içinde yana kayıyor.
3. **Sayfa yana taşıyordu**: tablodaki ekran okuyucu metni konumlanmamış olduğu için sayfayı genişletiyordu. Düzeltildi.
4. **Fotoğraf yükleme hataları ekran okuyucuya hemen bildirilmiyordu**; hata satırları artık `role="alert"`.

## Aşama 4 — Kullanılabilirlik ve erişilebilirlik (`652146a`)

Yöntem: önce ölçüm. Tarayıcı testlerine eklenen `a11y.spec.ts` ana ekranları (giriş, araç listesi, araç formu, 360° genel/belgeler/geçmiş, belge ve km panelleri) **axe ile WCAG 2.1 A/AA** denetiminden geçiriyor; ciddi/kritik bulgu testi düşürüyor. Ayrıca 1440, 1024, 768 ve 390 px'te liste, form ve 360° sekmelerinde yatay taşma, yan panelde odak tuzağı ve Escape ile kapanma test ediliyor. V5 tasarımı değiştirilmedi.

Bulunan ve düzeltilen sorunlar:
1. **Yan paneller kapanınca odak kayboluyordu** (klavye/ekran okuyucu kullanıcısı sayfanın başına düşüyordu). Artık odak paneli açan düğmeye dönüyor: km/konum/belge panelleri, belge detayı, fotoğraf büyütme ve fotoğraf yönetimi.
2. **Kaydedilmemiş bilgi uyarısız kayboluyordu**: km, konum, düzeltme ve belge panellerinde bir şey yazılmışken Escape/dışarı tıklama/Kapat paneli hemen kapatıyordu. Artık panelin üstünde "Girdiğiniz bilgiler kaydedilmedi. Kapatılsın mı?" sorusu çıkıyor (Devam et / Kaydetmeden kapat). Boş panel eskisi gibi hemen kapanıyor.
3. **API hatasında yanıltıcı ekran**: geçmiş yüklenemezse sekme "Kilometre kaydı yok · doğrulanmadı" diyordu, Genel bakış'taki "Son kayıtlar" sonsuza dek yükleniyor görünüyordu. Artık hata ve "Tekrar dene" gösteriliyor.
4. (Aşama 3'te) telefon listesi, sayfa taşması, yükleme hatalarının duyurulması.

Notlar: axe, ilk denemede birkaç "renk kontrastı" bulgusu verdi; inceleyince bunların sekme içeriğinin giriş animasyonu sürerken ölçülmesinden kaynaklandığı görüldü (animasyon bitince ihlal yok). Denetim artık animasyonların bitmesini bekliyor. Son durumda ana ekranlarda **hiç axe ihlali yok**.

Belge modülündeki yan panel kopyası kaldırılıp ortak `Sheet` bileşenine bağlandı (davranış aynı; odak ve kaydedilmemiş değişiklik desteği eklendi).

Testler: tarayıcı **33/33** (bir çalıştırmada web test sunucusu bir an bağlantıyı reddetti — `ERR_CONNECTION_REFUSED`; yeniden çalıştırmada temiz geçti, uygulama hatası değil), API **156/156**, tip kontrolü ve derleme hatasız.

## Aşama 5 — Araç modülünde küçük eksikler (`ba9675e`)

Spec karşılaştırması (§13.1 liste, §13.2 form, §13.3 360°): liste için "önemli belgesel blocker sayısı" ve "süresi yaklaşan belge" filtresi ile "current location" filtresi isteniyor; ikisi de mevcut verilerden, yeni iş kuralı olmadan yapılabiliyordu.

Geliştirilenler:
1. **Araç listesinde belge uyarısı.** Her satırın Durum hücresinde, varsa en acil belge sorunu kısa bir satırla gösteriliyor (ör. "Ruhsat eksik +2", "Muayene · 12 gün"); kritikler kırmızı, uyarılar turuncu. Hesap, belge sekmesindekiyle **aynı ortak fonksiyonlardan** geliyor (kural tekrar yazılmadı; testte satır ile sekmenin sayıları karşılaştırılıyor).
2. **"Belgeler" filtresi:** "Belge uyarısı olanlar" (kritik + uyarı) ve "Kritik belge sorunu". Adres çubuğunda kalır (`documents=attention|critical`).
3. **"Güncel konum" filtresi:** "Ana şube dışında" ve "Serviste" (km/konum geçmişinden türetilen güncel konuma göre).
4. Yetki ve kapsam: belge bilgisi ve filtresi yalnız belge görüntüleme yetkisi olana; yetkisi olmayana belge verisi gönderilmez ve filtre yok sayılır. Şube sınırlı kullanıcı filtrede de yalnız kendi şubesini görür.

Testler: API 7 yeni (toplam **163/163**), tarayıcı 1 yeni (toplam **34/34**). Migration gerekmedi.

Spec'e göre araç modülünde kalan ama **başka modül gerektiren** eksikler (bilinçli olarak yapılmadı): müsaitlik/hazırlık/aktif kiralama sütunları ve as-of görünümü (Rezervasyon/Kiralama), bakım ve hasar blocker sayıları (Bakım, Hasar), transfer geçmişi (Transfer), tedarikçi dönemleri ve dış araçlar (Tedarik), filodan çıkış/satış akışı (ayrı gerekçeli işlem), A4 araç durum raporu çıktısı.

## Aşama 6 — Performans ve ölçeklenebilirlik (`325b1e0`)

Yöntem: önce ölçüm. `apps/api/tests/perf-measure.ts` test veritabanına büyük bir filo yükler (3.000 / 10.000 araç, araç başına 10 km okuması, belgeler) ve ana API okumalarının medyan süresini ve sorgu planını yazdırır (yalnız `acarvo_test`; `npm test`'in parçası değil).

Ölçümler (10.000 araç, 100.000 km okuması, ~10.000 belge; yerel makine):

| Uç | Önce | Sonra |
|---|---|---|
| Araç listesi, varsayılan (plaka sırası, 1. sayfa) | 181 ms | **25 ms** |
| Araç listesi, son sayfa | 206 ms | **44 ms** |
| Liste, şube sınırlı kullanıcı | 77 ms | **10 ms** |
| Liste, belge filtresi | 421 ms | **195 ms** |
| Liste, km'ye göre sıralama | 198 ms | 198 ms (aşağıya bakın) |
| Araç detayı / geçmiş / belgeler | 4 / 7 / 4 ms | aynı |
| Araç işlem geçmişi, en kötü durum (330.000 kayıt) | 374 ms | **0,1 ms** (yalnız test veritabanında) |

Bulunan ve düzeltilen darboğazlar:
1. **Liste, sayfadaki 25 araç için değil tüm araçlar için güncel km ve konum hesaplıyordu.** Artık sıralama km'ye göre değilse ve konum filtresi yoksa önce sayfanın araçları seçiliyor, km/konum yalnız onlar için türetiliyor. Sonuçlar aynı (tüm testler geçiyor).
2. **İşlem geçmişi (`audit_log`) için kayıt bazında indeks yoktu.** Az kaydı olan bir aracın "Kayıt geçmişi" tüm şirket geçmişini tarıyordu; belge görüntüleme/indirme de kayıt eklediği için bu tablo hızla büyüyecek. Yalnız indeks ekleyen migration `0011_audit_entity_index.sql` hazırlandı ve **yalnız `acarvo_test`'e uygulandı** (ana veritabanı için bekleyen kararlara bakın).
3. **Ön yüz tek parça yükleniyordu** (992 kB / sıkıştırılmış 286 kB). Araç 360° (sıkıştırılmış 37 kB) ve araç formu (10 kB) artık açıldıklarında yükleniyor; ilk yükleme ~247 kB. En büyük bağımlılıklar React DOM, zod ve ikon kütüphanesi; daha fazla küçültme yeniden yapılandırma gerektirir, gerek görmedim.

İncelenen ve sorun bulunmayanlar: liste sayfalaması ve filtreleri sunucuda; N+1 sorgu yok (belge özetleri ve geçmiş tek sorguda); km/konum geçmişi indeksli ve görünümde 500 kayıtla sınırlı (kurallar pencereye bağlı değil, Aşama 2); 360° sayfasında aynı belge verisi tek istekle paylaşılıyor.

## Aşama 7 — Kod kalitesi ve dağıtım güvenliği (`d9d5b4c`)

1. **Güvenli migration aracı** `scripts/safe-migrate.mjs`: bekleyen migration'ları listeler → doğrulanmış yedek alır (doğrulanmazsa durur) → her tablonun satır sayısını şirket bazında kaydeder → migration'ı uygular → hiçbir tabloda satır azalmadığını, tüm migration'ların uygulandığını ve RLS'in zayıflamadığını doğrular; sorun olursa yedek klasörünü ve geri yükleme adımlarını yazıp durur.
   - `--test` ile `acarvo_test` üzerinde **baştan sona prova edildi** (0011 test veritabanında geri alınıp araçla yeniden uygulandı: yedek doğrulandı, migration uygulandı, doğrulama geçti).
   - `--dry-run` ana veritabanında yalnız okuma yaptı: `acarvo` 11 migration'da, bekleyen tek migration `0011_audit_entity_index`. **Ana veritabanına uygulanmadı.**
   - Test provasında yedeğe gerçek depolama klasörü kopyalanmıyor (`BACKUP_SKIP_STORAGE`); prova yedekleri sonradan silindi.
2. **Üretim ayarı uyarıları:** sunucu üretimde açılırken tehlikeli varsayılanları uyarı olarak yazar (`STORAGE_DIR` yok, `WEB_ORIGIN` localhost/https değil, `TRUST_PROXY` yok, zararlı dosya tarayıcısı yok). Davranış değişmez, yalnız görünür olur.
3. **Tekrarlanan kod:** PostgreSQL zaman damgası çözümleme mantığı üç dosyada kopyaydı; tek yere (`lib/timestamps.ts`) alındı ve `+05:30` gibi yarım saatlik farkları da kapsayan testi yazıldı. Belge modülündeki yan panel kopyası (Aşama 4) ve belge başlık metinleri (Aşama 5) ortaklaştırıldı.
4. **Kullanılmayan kod taraması:** API derleyiciyle `noUnusedLocals/noUnusedParameters` ile tarandı; kullanılmayan kod yok. Web zaten bu kurallarla derleniyor.
5. Belge: `docs/TEKNIK_UYGULAMA.md` §12 (güvenli dağıtım sırası ve üretim ayarları), §9.2 (testler).

Bilinçli olarak yapılmayanlar: `Vehicle360Page.tsx` (~950 satır) ve `VehicleDocuments.tsx` (~900 satır) büyük ama bölümleri net; gece bunları bölmek onaylı tasarımı riske atmadan fayda sağlamazdı. Sonraki modülde ortak sekme bileşenleri çıkarılırken bölünmesini öneririm.

Testler: API **165/165**, tarayıcı **34/34**; tip kontrolü ve derleme hatasız.

## Aşama 8 — Gelecek modüllerin planı (`d5c87ed`)

Kod yazılmadı. `docs/GELECEK_MODULLER_PLANI.md`: mevcut temelin gelecek modüllere bağlantı noktaları, bağımlılık haritası, her modül (Müşteriler + Kurumsal hesaplar, Ayarlar temeli, Rezervasyonlar, Kiralamalar, Finans, Araç transferi, Bakım ve Servis, Hasar) için amaç, önerilen tablolar, araç/km/konum/belge kayıtlarıyla ilişki, riskler ve büyüklük; önerilen sıra (ve gelir öncelikli alternatif); kiralamadan önce verilmesi gereken kararlar (kişisel veri, sözleşme/imza, vergi, kanıt fotoğrafları, saat dilimi, zararlı dosya tarayıcısı).

## Ana veritabanına dokunulmadığının doğrulaması

- Gece başında ve sonunda ana veritabanının **salt okunur** parmak izi alındı: her şirket için 17 tablonun (araçlar, km/konum ve düzeltmeleri, fotoğraflar, dosyalar, belgeler, roller, üyelikler, şubeler, işlem geçmişi…) satır sayısı ve **tüm satırların içerik özeti**, kullanıcılar (parola özetleri dahil özet), şirketler, migration sayısı.
- **Sonuç: hiçbir fark yok.** Migration sayısı başta ve sonda 11 (0011 yalnız test veritabanında).
- Özel dosya deposundaki 16 dosyanın SHA-256 özetleri başta ve sonda **aynı**.
- Ana veritabanına yapılan tek erişimler: başlangıç/bitiş parmak izi (salt okuma işlemi) ve `safe-migrate --dry-run` (yalnız migration sayısını okur).
- Tüm testler, ölçümler ve provalar `acarvo_test` üzerinde; tarayıcı testleri kendi API (3101) ve web (5181) sunucularıyla, geçici depolamayla çalıştı.

## Ekran görüntüleri

Test veritabanında alındı (`SCREENSHOTS=1 npx playwright test screens`, klasör `apps/e2e/screenshots/`, Git dışı):
1. `01-liste-belge-uyarilari-1440.png` — araç listesinde belge uyarıları
2. `02-liste-filtreler-1440.png` — "Şube dışında" + "Kritik belge" filtreleri
3. `03-liste-telefon-390.png` — telefonda liste (tablo kart içinde kayar, araç sütunu görünür)
4. `04-km-formu-saat-dilimi-1440.png` — İstanbul saatindeki bilgisayardan km formu (şirket saati ve uyarı)
5. `05-kaydedilmemis-degisiklik-sorusu-1440.png` — kaydedilmemiş bilgiyle kapatma sorusu
6. `06-gecmis-yuklenemedi-1440.png` — API hatasında "Tekrar dene"
7. `07-konum-formu-telefon-390.png` — telefonda konum formu

## Commit listesi (`gece-sprint-2026-10-10`)

| Commit | İçerik |
|---|---|
| `08b19d0` | Saat dilimi altyapısı ve testleri |
| `da529b4` | Güvenlik düzeltmeleri ve regresyon testleri |
| `eeebc0c` | Tarayıcı test altyapısı + bulduğu hataların düzeltmeleri |
| `652146a` | Erişilebilirlik ve kullanılabilirlik |
| `ba9675e` | Araç listesinde belge uyarısı, belge ve konum filtreleri |
| `325b1e0` | Performans (liste, tembel yükleme, işlem geçmişi indeksi) |
| `d9d5b4c` | Güvenli migration aracı, üretim uyarıları, ortak zaman damgası |
| `d5c87ed` | Gelecek modüller planı |
| `9883bb3` | Ekran görüntüsü testi, liste sütun/etiket düzeltmesi |
| `682086e`, `25dbf02`, `0e610a8`, `ba18f8b`, `332bc9c`, `6d29b52`, `edbcae9` | Rapor güncellemeleri (7) |

Toplam: 9 iş commit'i + 7 rapor commit'i = **16**. Birleştirme öncesi incelemede bu sayı düzeltildi (ayrı bir rapor commit'i).

Sabah inceleme önerisi: `git log --stat main..gece-sprint-2026-10-10`. Beğenirseniz `main`'e birleştirme ve (isterseniz) 0011 migration'ı ayrı adımlar olarak onayınıza bağlı.

## Onay bekleyen kararlar

1. **Şube saat dilimi mi, şirket saat dilimi mi?** `branches.timezone` alanı var, ancak şu an tüm saat girişi ve gösterimi şirket saat dilimiyle yapılıyor. Farklı ülkelerde şubesi olan bir şirkette (ör. Bosna + Hırvatistan aynı saat diliminde ama Türkiye farklı) km/konum saati aracın bulunduğu şubenin saatiyle mi girilsin? Öneri: şimdilik şirket saati (tutarlı ve basit); çok ülkeli şirketler gelince araç olaylarında olayın şubesinin saat dilimi.

2. **Uygulama rolünün `users.password_hash` sütununu okuyabilmesi.** Şu an güvenli (tüm SQL parametreli), ama ileride bir SQL enjeksiyonu tüm şirketlerin parola özetlerini açığa çıkarırdı. Düzeltme sütun düzeyinde yetki + giriş doğrulaması için `SECURITY DEFINER` bir fonksiyon gerektirir (migration). Gece uygulanmadı; ayrı, küçük bir güvenlik işi olarak öneriyorum.
3. **Belge dosyasını görüntüleme/indirme bir GET isteğiyle işlem geçmişine yazılıyor.** Başka bir siteden verilen bağlantı, oturumu açık kullanıcının adına "görüntülendi" kaydı oluşturabilir (içerik okunamaz; yalnız kayıt gürültüsü). **Kullanıcı kararı (11.10.2026): yanıltıcı denetim kaydı kabul edilmiyor.** Bu sorun gece çalışmasından önce de vardı (belge modülü). Çözüm analizi birleştirme öncesi inceleme raporunda; API henüz değiştirilmedi.
4. **Girişte eski oturum iptal edilmiyor.** Aynı tarayıcıda yeniden giriş yeni bir oturum açar, eskisi süresi dolana kadar geçerli kalır (oturum sabitleme mümkün değil). İstenirse girişte aynı tarayıcının eski oturumu iptal edilebilir.

5. **İşlem geçmişi indeksi (`0011_audit_entity_index.sql`) ana veritabanına uygulansın mı?** Yalnız indeks ekler, veri değiştirmez; test veritabanında doğrulandı. Uygulamak için önce `node --env-file=.env scripts/backup-db.mjs`, sonra `npm run db:migrate`. Uygulanmasa da kod çalışır (yalnız büyük geçmişte yavaşlar).
6. **Km'ye göre sıralama büyük filolarda ~200 ms (10.000 araç).** Hızlandırmak için güncel km'nin ayrıca saklanması (ör. olay eklendiğinde güncellenen bir özet tablo) gerekir; bu "tek km gerçeği" ilkesini bozmadan yapılabilir ama bir şema kararıdır. Şimdilik gerek görmüyorum.

## Notlar

- Açık bıraktığınız geliştirme sunucuları (3001/5173) çalışma klasörünü izlediği için gece dalının kodunu yükledi. Değişiklikler geriye uyumludur ve migration gerektirmez; ana veritabanında yalnız sizin kullanımınız kayıt oluşturur. Önceki sürüme dönmek için: `git checkout main`.

## Yarım kalan işler

Yarım kalan iş yok. Bilinçli olarak sonraya bırakılanlar:
- `Vehicle360Page.tsx` ve `VehicleDocuments.tsx` dosyalarının bölünmesi: bir sonraki modülde ortak sekme bileşenleri çıkarılırken.
- Kaydedilmemiş değişiklik uyarısı araç düzenleme formunda zaten vardı. Yan panellere eklendi; galeri yönetimine gerekmedi, çünkü orada her işlem anında kaydediliyor.
- Kilometreye göre sıralamanın hızlanması (karar 6).
- Tarayıcı testlerinde bir kez görülen geçici web sunucusu bağlantı hatası (`ERR_CONNECTION_REFUSED`) yeniden çalıştırmada görülmedi. Tekrarlarsa test sunucusu için Vite yerine derlenmiş sürümle (`vite preview`) çalışmayı öneririm.
