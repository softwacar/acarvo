# Bakım + Hasar + Araç Transferi V1 — Geliştirme Raporu

- **Dal:** `operasyon-bht-v1`.
- **Çalışma ağacı:** `C:\Users\soena\Desktop\acarvo-bht1`.
- **Başlangıç:** `ceace28`.

**Durum: test ortamında tamamlandı.**

Bu çalışmada aşağıdakiler yapılmadı:
- main'e birleştirme;
- GitHub'a gönderme;
- ana veritabanına migration uygulama (ana veritabanı 37 migration'da duruyor);
- `.env` dosyasına dokunma.

Tüm otomatik testler yalnız `acarvo_test` üzerinde ve sentetik verilerle çalıştı.

Plan: `docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md`.

---

## 1. Özet

Üç modül uçtan uca çalışıyor: Bakım & Servis, Hasar Kayıtları ve Araç Transferleri. Gerçek veritabanı modeli, API, arayüz, yetki, RLS ve testleri var.

Bakım, hasar engeli ve transfer, **mevcut tek uygunluk motoruna eklendi**. Bu motor `vehicle_allocation_lock` ve `vehicle_busy` ikilisidir. Rezervasyon, kiralama, bakım, hasar ve transfer artık aynı kilit altında, aynı "aracı ne tutuyor" tanımını kullanıyor.

## 2. Önceki ana sunucuların exit code 4 sonucu

Exit code 4 bir uygulama hatası değildi.

- **Neden:** Ana sunucular (3001 API, 5173 web) bir önceki Claude oturumunun arka plan görevleriydi. Oturum kapanınca süreç ağacı sonlandırıldı ve görevler 4 koduyla bitmiş göründü.
- **Kanıt:** Günlüklerde başarılı başlatma ve normal istekler vardı; hata kaydı yoktu.
- **Sonrası:** Sunucular main kodundan yeniden başlatıldı. `/api/health` "veritabanı bağlı", web 200 döndü. `safe-migrate --verify` ana veritabanında sorun bulmadı (37 migration).
- **Önlem:** Sunucuları kalıcı tutmak için oturumdan bağımsız bir süreç yöneticisi gerekir. Bu, kurulum kararıdır; kod değişikliği gerektirmez.

## 3. Ortak araç uygunluğu (en kritik bölüm)

İkinci bir uygunluk motoru yazılmadı.

**`vehicle_busy` fonksiyonu**
- 8 parametreli oldu: rezervasyon, kiralama, bakım ve transfer hariç tutulabilir.
- Eski 6 parametreli sürüm, yeni sürümü çağıran ince bir sarmalayıcı olarak kaldı. Mevcut çağrılar değişmedi.

**Yeni tutuş türleri**

| tür | aracı tutan durum | gecikmede |
|---|---|---|
| Bakım | planlandı, bakımda, kontrol bekliyor | Planlanan bitiş geçip iş tamamlanmadıysa tutuş açık uçlu olur (K2 kuralının aynısı). |
| Hasar engeli | açık engel dönemi | Kaldırılana kadar sürer. |
| Transfer | onaylandı, yolda | Gecikmiş transfer açık uçlu kalır; araç teslim alınana kadar müsait sayılmaz. |

**Tutmayan durumlar:** onay bekleyen bakım, talep aşamasındaki transfer, iptal edilen kayıtlar.

**Veritabanı guard'ları.** Değiştirilen rezervasyon ve kiralama araç guard'ları yeni türleri görür ve her neden için ayrı bir kısıt adıyla hata verir.

Hasar engeli bakım planını ve transferi engellemez, çünkü onarım için aracın servise veya başka şubeye gitmesi gerekir.

**Konum sürekliliği**
- Transfer, aracın varıştan sonraki ilk onaylı rezervasyonu veya hazırlanan kiralaması başka bir şubede başlıyorsa onaylanmaz ve yola çıkarılamaz.
- Tersi de geçerlidir: onaylı bir transfer aracı başka şubeye götürüyorsa o şubeden rezervasyon onaylanmaz ve kiralama hazırlanmaz.
- Hiçbir rezervasyon otomatik iptal edilmez.

**Eşzamanlılık.** API ve tetikleyiciler aynı kilidi alır. Doğrudan SQL ile yapılan değişiklikler de aynı kuralı izler; bu testlerle doğrulandı.

## 4. Bakım

- **Akış:** Onay bekliyor / Planlandı → Bakımda → Kontrol bekliyor → Tamamlandı. İptal yalnız başlamadan önce yapılabilir. Kontrol işi geri gönderebilir.
- **Çakışan plan:** sessizce oluşmaz. Önce çakışan kayıtlar gösterilerek reddedilir. Kullanıcı açıkça isterse "onay bekleyen" olarak kaydedilir; bu kayıt aracı tutmaz. Onay sırasında çakışma yeniden denetlenir.
- **Servise alma:** planlamadan ayrı bir adımdır.
  - Gerçek zaman girilir; gelecek olamaz, geçmişe en fazla 72 saat.
  - Planlanan bitiş geçmişse yeni bir beklenen bitiş zorunludur; araç süresiz tutulmaz.
  - Başlangıç km'si isteğe bağlıdır.
  - "Dış serviste" seçilirse konum servis sağlayıcı olarak yazılır.
- **Tamamlama:**
  - `maintenance.approve` yetkisi gerekir.
  - km zorunludur ve başlangıç km'sinden düşük olamaz.
  - Araç dış servisteyse dönüş şubesi zorunludur.
  - Tamamlanan kayıt değişmez.
  - **Tamamlanma teslime hazır demek değildir.** Teslim masasında "Bakım ve hasar kayıtları" dikkat maddesi çıkar.
- **Periyodik bakım:**
  - Yalnız gerçek kayıtlardan hesaplanır: araç bazında km ve/veya ay aralığı, son tamamlanan periyodik bakım ve km geçmişi.
  - Kayıt yoksa "kayıt yok" yazılır; tarih uydurulmaz.
  - Sonuç yalnız hatırlatmadır, hiçbir işlemi engellemez.
- Fotoğraf eklenebilir; olay geçmişi yalnız ekleme alır; silme yoktur.

## 5. Hasar

- **Bulgu ≠ sorumluluk.** Kusur, ücret, sigorta talebi, depozito kesintisi veya borç oluşturulmaz. Bu durum arayüzde açıkça yazar.
- **Kesinleşmiş teslim veya iade bulgusundan dosya:**
  - İşaret ve kontrol kayıtları değiştirilmez; bu testle doğrulandı.
  - Bir işaretten yalnız bir dosya açılabilir: kısmi tekil indeks ve API buna izin vermez.
  - Kiralama 360° Hasar sekmesi bulguları ve dosyaları listeler.
- **"Kullanılamaz":**
  - Gerekçeyle bir engel dönemi başlatır. Rezervasyon onayı, yeni kiralama ve teslim engellenir; doğrudan kiralama da dahildir.
  - Mevcut onaylı rezervasyonlar iptal edilmez; "risk altında" olarak gösterilir.
- Hafif hasar hiçbir şeyi engellemez.
- **Engeli kaldırma:** ayrı yetki (`damage.unblock`) ve gerekçe ister. Engel geçmişi saklanır. Bakım veya transfer varsa araç yine tutulur.
- **Kapatma:** engel açıkken kapatılamaz. Kapatılan dosya değişmez; yeni bulgu için yeni dosya açılır.
- **Onarım:**
  - Onarım durumunu personel belirler. Bakımın tamamlanması hasarı "onarıldı" yapmaz.
  - Hasar ayrıntısından "Onarım için bakım planla" bağlantısı vardır.

## 6. Araç transferi

- **Akış:**
  - Talep → onay → yola çıkış (yolda) → varışta teslim alma (= tamamlandı).
  - İptal yalnız yola çıkmadan önce yapılabilir.
- **Yolda ≠ varmış:**
  - Çıkışta konum "yolda" olur; km ve yakıt atomik olarak yazılır.
  - Varış şubesi ancak teslim alınınca konum olarak yazılır.
  - Varış km'si çıkış km'sinden küçük olamaz; bu hem veritabanında hem API'de denetlenir.
- Ana şube değişmez (spec §59R).
- **Engeller:** aktif kiralamadaki, bakımdaki ve başka transferdeki araç transfer edilemez. Transfer sırasında yeni kiralama veya teslim yapılamaz.
- **Şube kapsamı:**
  - Talep, onay, çıkış ve iptal çıkış şubesinin işidir.
  - Teslim alma yalnız varış şubesinin işidir; yalnız çıkış şubesine yetkili kişi teslim alamaz.
  - Şubeler aynı şirkete aittir (bileşik FK).

## 7. Km, konum ve saat dilimi

- Km ve konum geçmişi yalnız ekleme alır. Yeni kaynak türleri: `maintenance_start`, `maintenance_end`, `transfer_departure`, `transfer_arrival`.
- Kaynak tetikleyicisi şunları denetler:
  - olay ve kaynak türünün eşleşmesi;
  - kaynağın aynı aracın, doğru adımdaki kaydı olması;
  - konum türünün doğru olması.
- Kronoloji kuralı ve büyük artış gerekçesi mevcut kurallarla aynıdır.
- **Saatler:** planlanan zamanlar şubenin duvar saatiyle girilir.
  - Yaşanmamış saat reddedilir.
  - İki kez yaşanan saat için seçim zorunludur; bu testle doğrulandı (2026-10-25 ve 2027-03-28).
  - Transferde çıkış saati çıkış şubesinin, varış saati varış şubesinin saat dilimindedir.
  - Kiralamadaki saat yardımcıları ortak `lib/branch-time.ts` dosyasına, km denetimi `lib/odometer-check.ts` dosyasına taşındı. Kiralama davranışı değişmedi.
- "Konum ve geçmiş" ekranı yeni kaynakları adıyla gösterir. Eskiden kiralama kaynakları ham kodla görünüyordu; bu da düzeltildi.

## 8. Yetkiler ve hazır roller

Yeni yetkiler (11): `maintenance.read|manage|approve`, `damage.read|report|review|unblock`, `transfers.read|request|approve|execute`.

Ön ayar sürümü 11:
- **Sahip ve Yönetici:** hepsi.
- **Operasyon:** okuma yetkileri, bakım planlama ve yürütme, hasar bildirme, transfer talebi ve yürütme.

Operasyonun **yapamadıkları:** onay, tamamlama, hasar inceleme, engel kaldırma.

Özel roller değişmez. Ana veritabanına uygulanmadı.

## 9. Güvenlik

- **İzolasyon:** 10 yeni tabloda zorunlu RLS ve 4 politika var. Şirket içi bütün FK'ler bileşik. İzolasyon testi tablo listesiyle birlikte güncellendi.
- **Silme yok:** çalışma zamanı rolüne DELETE yetkisi verilmedi ve ayrıca silme tetikleyicisi var. Olay tabloları yalnız ekleme alır.
- **Değişmezlik:** kimlik alanları değişmez; tamamlanan veya kapatılan kayıt değişmez.
- **Kapsam:** kapsam dışı kayıt "bulunamadı" olarak görünür; başka şirket kimliği bilse bile 404 alır.
- **Fotoğraflar:**
  - İçerik doğrulanır; yeniden kodlanıp meta veri silinir.
  - Tarayıcıdan geçer. Tarayıcı yapılandırılmamışsa üretimde yükleme kapalıdır; sahte ClamAV yok.
  - Özel önekle saklanır (`maintenance/`, `damages/`).
  - Yetki ve kapsam kontrolüyle akıtılır; önbellek yoktur.
- **Kayıt içeriği:** işlem geçmişinde ve hata mesajlarında kişisel veri yok; yalnız kayıt numaraları var.

## 10. Finans sınırı

Bu modüller şunları oluşturmaz: fatura, borç, depozito kesintisi, sigorta talebi, otomatik tazminat, finans kalemi. Bu, testle doğrulandı: finans tablolarındaki sayılar değişmedi.

Bakım maliyeti V1'de tutulmaz. Kaynak bağlantılı masraf tek kayıttan, Masraflar modülüyle gelecek.

Finans V1 tetikleyicileri değiştirilmedi.

## 11. FN5 — Yanlış ödeme sorumlusunun güvenli düzeltilmesi (yalnız tasarım; finans kayıtlarına dokunulmadı)

**Sorun:** dosyanın sorumlusu (müşteri veya kurum) yanlış seçilmişse bugün düzeltilemiyor. Bu bilinçli bir tercih: sorumlu kişi alanı değişmez.

**Önerilen tasarım: "sorumlu düzeltme kaydı".** Mevcut kayıtlar taşınmaz veya yeniden yazılmaz.

1. Yeni tablo: `finance_responsible_corrections`. Alanlar: dosya, eski taraf, yeni taraf, gerekçe kodu ve metni, talep eden, onaylayan, durum (talep, onay, red, uygulandı), sürüm.
2. **Koşullar:**
   - yalnız açık veya yeniden açılmış dosya;
   - yeni taraf kiralamanın kendi müşterisi veya kurumsal hesabı olmalı (bugünkü guard'ın aynısı);
   - dört göz kuralı: talep eden onaylayamaz;
   - `finance.close` ve `finance.charges.approve` yetkileri.
3. **Uygulama:**
   - Dosyanın `responsible_*` alanları değişmez.
   - Dosyaya "geçerli sorumlu = son onaylı düzeltme" görünümü eklenir; ekstreler ve cari bu görünümden okunur.
   - Eski tarafın ekstresinde dosya, düzeltme notuyla ve tutarı dahil edilmeden gösterilir.
4. **Tahsilatlar:** Ödeyen kişi zaten ayrı bir alandır ve değişmez. Gerekirse ters kayıt ve yeni kayıt yapılır. Bunun için yeni kural yazılmaz; FN1 ters kayıt kuralı kullanılır.
5. **Kapanmış dosya:** doğrudan düzeltilmez. Önce gerekçeyle yeniden açılır (mevcut akış), sonra düzeltilir.
6. **Testler:** dört göz, kapsam, eşzamanlı iki düzeltme, ekstre toplamlarının değişmemesi, eski tarafın cari tutarının dışarıda kalması.

Karar sahibi işletmedir. Uygulama ayrı bir sprintte yapılır.

## 12. Arayüz

- **Bakım & Servis** (`/bakim-servis`), **Hasar Kayıtları** (`/hasar-kayitlari`) ve **Araç Transferleri** (`/araclar/transferler`; Araçlar sayfasında "Transferler" düğmesi):
  - listelerde görünümler ve sayaçlar, arama, filtreler, sıralama ve sayfalama;
  - oluşturma formları: araç seçici, şube saatiyle zaman alanları, çakışma açıklaması;
  - ayrıntı sayfalarında her adım için açık onay diyaloğu, geçmiş ve fotoğraflar;
  - telefona uygun **varışta teslim alma** sayfası.
- **Araç 360°:**
  - Genel bakış: "Müsaitlik ve engeller" bölümü; şu an aracı tutan kayıt, nedeni, sıradaki kayıtlar ve hızlı eylemler.
  - Müsaitlik: transferler ve engeller.
  - Bakım: periyodik bakım ve kayıtlar.
  - Belgeler ve riskler: hasar dosyaları.
  - V5 tasarımı korundu.
- **Kiralama 360° Hasar sekmesi:** bulgular ve "Hasar dosyası aç".
- **Rezervasyon takvimi:** bakım, hasar ve transfer blokları da gösterilir.
- **Teslim masası:** açık hasar ve bakım sonrası hazırlık maddeleri eklendi.
- Uygunluk ekranlarında "henüz denetlenmeyen" listesinden bakım ve transfer çıkarıldı.

## 13. API

| Uç nokta | Yollar |
|---|---|
| `/api/maintenance` | `branches`, `search`, `:id`, oluştur, güncelle (PUT), `approve`, `start`, `work-done`, `return-to-work`, `complete`, `cancel`, `photos` |
| `/api/damages` | `branches`, `search`, `candidates?rentalId`, `:id`, oluştur, güncelle, `review`, `repair`, `block`, `unblock`, `photos` |
| `/api/transfers` | `branches`, `search`, `:id`, oluştur, güncelle, `approve`, `depart`, `receive`, `cancel` |
| `/api/vehicles/:id/operations` | — |
| `/api/vehicles/:id/maintenance-schedule` | PUT |

Ortak davranış:
- Her adım tekrar gönderime karşı güvenlidir: `requestId` ile tekrar edilen istek ilk sonucu döndürür.
- Sürüm uyuşmazlığında 409 döner.

## 14. Migration'lar (yalnız `acarvo_test`)

| Dosya | İçerik |
|---|---|
| `0037_operations.sql` | drizzle-kit ile üretildi. 10 tablo; sıra türlerine `maintenance`, `damage`, `transfer` eklendi. Yalnız ekleme yapar. |
| `0038_operations_rls.sql` | RLS; izin listelerinin genişletilmesi (dosya, km ve konum türleri); `vehicle_busy` ve tutuş fonksiyonları; değiştirilen rezervasyon ve kiralama araç guard'ları; bakım, hasar ve transfer guard'ları; geçmiş guard'ları; yetkiler. |
| `0039_operations_history_guard_fix.sql` | 0038'deki ortak geçmiş guard'ının iç içe düzeni düzeltildi. PL/pgSQL `AND` ifadesini kısa devre yapmaz; düzeltme yeni dosyayla yapıldı, uygulanmış dosya değiştirilmedi. |

- Mevcut migration dosyaları değiştirilmedi.
- Test veritabanı: 40 migration, `verify` sorun bulmadı.
- Ana veritabanı: 37 migration; dokunulmadı.

## 15. Testler

| Paket | Sonuç | Not |
|---|---|---|
| API | **506 / 506** | Önceki 480 + yeni 25 operasyon testi + 1 performans testi. |
| Tarayıcı | **126 geçti**, 33 isteğe bağlı test atlandı | Önceki 118 + yeni 8. |

- Yeni API testlerinin kapsadığı alanlar: yaşam döngüleri, çakışma matrisi, DST, km ve konum atomikliği, değişmezlik ve silme yasağı, izolasyon, kapsam, yeniden gönderim, sürüm çakışması, fotoğraf, bulgudan dosya açma.
- Yeni tarayıcı testleri: bakım, hasar ve transfer akışları; çoklu kullanıcıyla transfer; erişilebilirlik (axe); telefon görünümü.
- Mevcut testlerde bilinçli değişen beklentiler:
  - `notChecked` listesi artık bakım ve transfer içermiyor.
  - Araç 360° bakım sekmesi artık gerçek içerik gösteriyor.
  - Kiralama hasar sekmesindeki bilgi metni değişti.
- Toplu çalışmada bir kez finans performans testi makine yükü nedeniyle zaman aşımına uğradı; tek başına geçti ve son tam çalıştırmada da geçti.

## 16. Eşzamanlılık testleri

Aynı araç için paralel çalıştırılan senaryoların hepsinde kilit iki işlemi birbirinden haberli kıldı:

- Rezervasyon onayı ile bakım planı: biri kazanır, diğeri 409 alır.
- Transfer onayı ile rezervasyon onayı: biri kazanır.
- Teslim ile hasar engeli: engel her zaman kaydedilir. Teslim ya engelden önce gerçekleşir ya da reddedilir.
- Transfer çıkışı ile kiralama teslimi: biri kazanır.
- Bakıma alma ile teslim: biri kazanır.
- İki ayrı teslim alma: biri tamamlar, diğeri reddedilir; geçmişte tek varış kaydı oluşur.

## 17. Performans (3.000 bakım, 3.000 hasar, 1.000 engel dönemi, 3.000 transfer)

Liste, sayaç ve uygunluk ölçümleri (ms):

| İşlem | Süre |
|---|---|
| Bakım listesi | 23 |
| Plaka araması | 14 |
| Hasar listesi | 31 |
| Transfer listesi | 22 |
| Araç operasyon görünümü | 38 |
| Gelecekteki tüm tutuşlar (`vehicle_busy`) | 14 |
| 31 günlük takvim, bloklarla | 13 |

1.500 planlı bakım eklenirken her biri uygunluk guard'ından geçti.

## 18. Görsel kontrol ve erişilebilirlik

- **Ekran görüntüleri:** 1440, 768 ve 390 genişliklerinde 15 ekran (toplam 45) alındı ve incelendi; yatay taşma yok. Konum: `apps/e2e/screenshots/bht1/` (git dışı).
- **İnceleme sırasında düzeltilenler:**
  - Ayrıntı sayfası başlığının hizası.
  - `/araclar/transferler` sayfasının yanlışlıkla tam genişlik düzenine düşmesi.
  - Km ve konum geçmişindeki ham olay kodları.
  - İsteğe bağlı zaman alanlarındaki "zorunlu" işareti.
  - Bağlı kayıtlardaki yanlış "henüz bağlı değil" yazıları.
- **Erişilebilirlik:** axe (WCAG 2.1 A/AA) ciddi veya kritik ihlal bulmadı. Kapsam: listeler, formlar ve hata durumları, ayrıntılar, diyaloglar ve araç sekmeleri.

## 19. Ana veritabanı ve gerçek veriler

Ana veritabanında hiçbir şey değişmedi:
- migration uygulanmadı;
- sentetik bakım, hasar veya transfer kaydı eklenmedi;
- araç konumları ve finans kayıtları değişmedi.

`safe-migrate --verify` (salt okunur): 37 uygulanmış migration, 3 bekleyen migration (bu dalın dosyaları).

Ana sunucular main kodundan çalışmaya devam ediyor.

## 20. Commit'ler (`operasyon-bht-v1`)

| Commit | İçerik |
|---|---|
| `42c4f2b` | Temel katman: plan, tablolar, ortak uygunluk, yetkiler. |
| `14b1abd` | API ve 0039. |
| `db2c03f` | Arayüz ve tarayıcı testleri. |
| `bf3614f` | Performans testi ve düzeltmeler. |
| (son) | Bu rapor. |

## 21. Kararlar (bu sprintte verilen teknik kararlar)

- **BHT1:** Hasar engeli bakım planını ve transferi engellemez (onarım için gerekir); rezervasyon onayını, kiralamayı ve teslimi engeller.
- **BHT2:** Çakışan bakım planı reddedilir. Açık seçimle "onay bekleyen" kaydedilebilir; bu kayıt aracı tutmaz.
- **BHT3:** Gecikmiş bakım ve yoldaki gecikmiş transfer, kiralamadaki K2 kuralı gibi açık uçlu tutar.
- **BHT4:** Konum sürekliliği iki yönde uygulanır: transfer ile sonraki kayıt arasında ve rezervasyon/kiralama ile önceki transfer arasında. Yalnız transfer varsa devreye girer.
- **BHT5:** Teslim alma = tamamlanma. Ara bir "varışta bekliyor" durumu yok.
- **BHT6:** Ana şube transferle değişmez.
- **BHT7:** Araç, ana şubesi veya şu anki şubesi kullanıcının kapsamındaysa operasyon için görünür. Araç 360° bugünkü kuralı korur: yalnız ana şube.
- **BHT8:** Teslim alma 72 saate kadar geriye tarihlenebilir; hasar tespiti 30 güne kadar.

## 22. Açık riskler ve sınırlar

- Lastik sezon ve set takibi ile araç sınıfı bazında bakım şablonları V1'de yok. Bakım aralığı araç bazında tanımlanıyor.
- Bakım maliyeti ve masraf bağlantısı yok (Masraflar modülü).
- Hazırlık ve temizlik kontrol listesi (§59N) ayrı bir modül olarak yok. Teslim masası yalnız dikkat maddesi gösteriyor.
- Rezervasyon ile önceki kiralamanın iade şubesi arasında konum sürekliliği yok. Bu, bugünkü davranıştır ve yalnız transferlerle eklendi.
- Drina'da tek Sahip ve tek Operasyon kullanıcısı var. Bakım tamamlama ve engel kaldırma Sahip ile yapılabilir; dört göz şartı konmadı.
- Tarayıcı testleri makine yükü altında yavaşlayabiliyor.

## 23. Main'e geçmeden önce yapılması gerekenler

1. Bu dalın incelenmesi ve onay.
2. `safe-migrate` ile doğrulanmış yedek alındıktan sonra 0037–0039'un ana veritabanına uygulanması. Hazır roller sürüm 11'e yükselir; özel roller değişmez.
3. Çalışan ana veritabanındaki onaylı rezervasyonların yeni guard'lardan etkilenmediğinin doğrulanması. Değişmeyen kayıtlar yeniden denetlenmez.
4. Üretim için zararlı dosya taraması ayarı (mevcut koşul).

## 24. Sonraki adım önerisi

Bu dal onaylanırsa izlenecek sıra:
1. main entegrasyonu;
2. Hazırlık ve temizlik kontrol listesi;
3. Masraflar (bakım maliyeti, tek kaynak);
4. FN5 uygulaması.

Başka büyük modüle kendiliğinden geçilmedi.
