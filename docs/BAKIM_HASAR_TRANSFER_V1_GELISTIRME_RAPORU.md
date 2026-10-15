# Bakım + Hasar + Araç Transferi V1 — Geliştirme Raporu

- **Dal:** `operasyon-bht-v1`.
- **Çalışma ağacı:** `C:\Users\soena\Desktop\acarvo-bht1`.
- **Başlangıç:** `ceace28`.

**Durum: main'e entegre edildi; ana veritabanı 43 migration** (ayrıntılar en sondaki "Son inceleme ve main entegrasyonu" bölümünde).

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

Hasar engeli bakım planını engellemez. Kullanılamaz araç normal transferle onaylanamaz ve yola çıkarılamaz; fiziksel taşıma yalnız ayrı "onarım amaçlı taşıma" ile yapılır (son bölüm, B).

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

- **BHT1 (revize edildi):** Hasar engeli bakım planını engellemez. Normal transferi, rezervasyon onayını, kiralamayı ve teslimi engeller. Onarım için yalnız ayrı onarım amaçlı taşıma kullanılır (son bölüm, B).
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

---

# Son inceleme ve main entegrasyonu

## A. BHT1–BHT8: kararlar ve uygulanma durumu

| # | Karar | Spec ile ilişki | Güvenlik etkisi | Operasyonel etkisi | Mevcut rezervasyon/kiralama etkisi | V1 sonucu |
|---|---|---|---|---|---|---|
| BHT1 | **Revize edildi.** Hasar engeli bakım planını engellemez. Kullanılamaz araç **normal transferle** onaylanamaz ve yola çıkarılamaz (API ve PostgreSQL, 0041/0042). Fiziksel taşıma yalnız ayrı **onarım amaçlı taşıma** ile yapılır (B bölümü). | §59R'de transfer bir taşıma kaydıdır; spec "kullanılamaz araç sürülür" demez. İlke 4 ve onarım ihtiyacı birlikte gözetildi. | Kullanılamaz aracın trafikte sürülüyormuş gibi kaydedilmesi engellendi. | Onarıma götürmek yetki, hasar dosyası, taşıma yöntemi ve çıkış beyanı ister. | Yok: taşıma onaylı kayıtlarla çakışırsa yine reddedilir; hiçbir şey iptal edilmez. | Uygulandı ve test edildi. |
| BHT2 | Çakışan bakım planı reddedilir. Kullanıcı açıkça isterse "onay bekleyen" kaydedilir; aracı tutmaz. Onayda çakışma yeniden denetlenir. | İlke 1; §13.3 bakım bloğu yalnız gerçek tutuştur. | Sessiz çakışma oluşamaz. | Plan kaybolmaz; onaylanmayı bekler. | Onaylı rezervasyon korunur, iptal edilmez. | Korundu. |
| BHT3 | Gecikmiş bakım ve yoldaki gecikmiş transfer açık uçlu tutar (K2'nin aynısı). | İlke 5; §13.3. | Gecikme aracı müsait yapmaz. | Beklenen bitişin güncellenmesi gerekir. | Gecikme süresince yeni onay alınamaz; mevcut onaylılar iptal edilmez. | Korundu. |
| BHT4 | Konum sürekliliği: transfer ile sonraki kayıt arasında ve rezervasyon/kiralama ile önceki transfer arasında. Yalnız transfer varsa devreye girer. | §13.3: "gelecekteki beklenen fiziksel konum dikkate alınır". | Başka şubeye götürülen araç için yanlış şubeden onay engellenir. | Transfer, sonraki kaydı başka şubede başlayan aracı taşıyamaz. | Ana veritabanında transfer yok, etkisi yok. Değişmeyen mevcut kayıtlar yeniden denetlenmez. | Korundu. |
| BHT5 | Varışta teslim alma = tamamlanma. | §59R: Planned → In Transit → Completed. | Teslim alma yalnız varış şubesinde. | Ara "varışta bekliyor" durumu yok. | Yok. | Korundu. |
| BHT6 | Ana şube transferle değişmez. | §59R: "home branch'i otomatik değiştirmez"; ilke 8. | Yok. | Fiziksel konum değişir, ana şube aynı kalır. | Yok. | Korundu. |
| BHT7 | Operasyon için araç görünürlüğü: ana şubesi veya şu anki şubesi kullanıcının kapsamındaki araç. Araç 360° yalnız ana şube kuralını korur. | Spec şube kapsamında fiziksel işleme yer vermiyor; araç fiilen şubedeyken personel işlem yapabilmeli. | Yalnız şu an kullanıcının şubesinde kayıtlı araç görünür: plaka ve model. Kişisel veri yok. | Şubedeki araç için bakım/hasar/transfer başlatılabilir. | Yok. | Korundu (düşük risk, raporlandı). |
| BHT8 | Gerçek işlem zamanı geriye 72 saate kadar girilebilir; hasar tespiti 30 güne kadar. Gelecek zaman yok. | K8 (kiralama) ile aynı yaklaşım. | Sınırlı geriye tarihleme; km kronolojisi korunur. | Geç kayıt mümkün. | Yok. | Korundu. |

Ek düzeltme: Planlanandan **erken servise alınan** bakımda planlanan başlangıç gerçek başlangıca çekilir; eski plan olay geçmişinde saklanır. Eşzamanlılık testi bu kusuru buldu; önceden kayıt kısıtına takılıyordu.

## B. Hasarlı aracın transferi: son kural

**A) Bakım planı:** Kullanılamaz araç için bakım planlanabilir. Plan engeli kaldırmaz ve aracı uygun yapmaz.

**B) Normal transfer:**
- Talep oluşturulabilir; talep aracı tutmaz ve ayrıntıda "Hasar engeli" çakışması gösterilir.
- **Onay, yola çıkış ve onaylı planın değiştirilmesi** aşağıdaki düzeylerde reddedilir:
  - API: `VEHICLE_NOT_USABLE`;
  - PostgreSQL: `transfers_vehicle_damaged`.
- Onaydan sonra eklenen engel de çıkışı durdurur ve yarım kayıt oluşmaz.
- Daha önce kaldırılmış bir engel geçmişte kaldığı için transferi engellemez (0042).

**C) Onarım amaçlı taşıma (ayrı akış):**
- Ayrı yetki: `transfers.repair`. Sahip ve Yönetici'de var, Operasyon'da yok; özel roller değişmedi.
- Aracın **açık bir hasar dosyasına** bağlanır.
- **Taşıma yöntemi zorunludur:** çekici veya araç taşıyıcı. "Kendi gücüyle sürülerek" seçeneği yok.
- Onay ve çıkış da `transfers.repair` ister.
- Çıkışta yetkili kişi aracın beyan edilen taşımayla yola çıktığını ve kendi gücüyle sürülmediğini **beyan eder**. Beyan olmadan çıkış hem API'de hem veritabanında reddedilir. Beyanın zamanı ve kişisi kaydedilir, sonradan değiştirilemez.
- ACARVO taşımayı doğrulamaz; arayüz ve rapor bunu açıkça söyler.
- Diğer bütün kurallar geçerlidir: onaylı rezervasyon, kiralama, bakım ve başka transfer çakışması; şube kapsamı; km; konum geçmişi.

**D) Varıştan sonra:**
- Hasar dosyası kapanmaz.
- Kullanım engeli kalkmaz.
- Araç müsait olmaz.
- Rezervasyon onayı ve doğrudan kiralama hasar engeliyle reddedilmeye devam eder.
- Engeli kaldırmak `damage.unblock` yetkisi, en az 5 karakter gerekçe ve denetim kaydı ister.

Bunların hepsi testle doğrulandı (API, veritabanı ve tarayıcı).

## C. Ortak uygunluk denetimi

PostgreSQL kataloğundan salt okunur denetim yapıldı.

**Tetikleyiciler:** Aşağıdaki tablolarda guard'lar `BEFORE INSERT OR UPDATE` ile çalışır; hangi API yolundan veya doğrudan SQL'den gelinirse gelinsin her yazma bu guard'lardan geçer:
- `reservations`, `rentals`, `maintenance_records`, `damage_files`, `damage_blocks`, `vehicle_transfers`;
- km ve konum geçmişinde ekleme guard'ları.

**Kilit:** Aynı araç kilidini (`vehicle_allocation_lock`) alan guard'lar:
- `reservations_vehicle_guard`, `rentals_vehicle_guard`, `maintenance_records_guard`, `damage_blocks_guard`, `vehicle_transfers_guard`.

**Tek tanım:**
- `vehicle_busy`'nin tek gerçek tanımı 8 parametreli sürümdür; 6 parametreli sürüm yalnız sarmalayıcıdır.
- Onu kullananlar: dört guard ve API'nin tek yardımcısı (`lib/vehicle-allocation.ts`).
- İkinci bir uygunluk motoru yok.

| İşlem | Koruma |
|---|---|
| Rezervasyon onayı, tarih değişikliği, araç değişikliği | Rezervasyon guard'ı (şube değişikliği de yeniden denetlenir) |
| Kiralama oluşturma, rezervasyondan dönüşüm, teslim, uzatma | Kiralama guard'ı |
| İade | Tutuşu kısaltır; denetim gerekmez |
| Bakım başlatma ve beklenen bitiş değişikliği | Bakım guard'ı |
| Bakım tamamlama | Tutuşu bitirir |
| Hasar engeli koyma ve kaldırma | Kilit; engel bir olgudur |
| Transfer onayı, çıkışı, plan değişikliği | Transfer guard'ı (hasar, rezervasyon, kiralama, bakım, transfer, sonraki kayıt) |
| Transfer varışı | Tutuşu bitirir |

## D. Eşzamanlılık

**İlk tur:**
- rezervasyon onayı ↔ bakım planı;
- transfer onayı ↔ rezervasyon onayı;
- teslim ↔ hasar engeli;
- transfer çıkışı ↔ teslim;
- bakıma alma ↔ teslim;
- iki ayrı teslim alma.

**İkinci tur (bu inceleme):**

| Senaryo | Sonuç |
|---|---|
| Bakıma alma ↔ rezervasyon onayı | Tam olarak biri başarılı. |
| Rezervasyon onayı ↔ transfer çıkışı | Tam olarak biri başarılı. |
| Kiralama oluşturma ↔ bakıma alma | Tam olarak biri başarılı. |
| Aynı araca çakışan iki transfer onayı | Tam olarak biri başarılı. |
| Aynı bakımın iki kez başlatılması | Biri başarılı; tek km kaydı. |
| Yoldaki araca bakım başlatma | Reddedildi. |
| Transfer varışı ↔ varış şubesinde rezervasyon onayı | Rezervasyon ancak varıştan sonra başlıyorsa onaylanır. |
| Aynı hasar engelini iki kişinin kaldırması | Biri kaldırır; engel dönemi tek kez kapanır; mevcut onaylı R-000001 değişmez. |
| Aktif (gecikmiş) kiralamadaki aracın transferi | Reddedildi. |
| Hasar engelli araçla doğrudan kiralama | Reddedildi. |

Her senaryoda şirket izolasyonu korundu. Araç iki yerde kullanılmadı, yarım işlem oluşmadı, geçmiş bozulmadı.

## E. RLS ve RBAC

**RLS ve FK:**
- 10 yeni tablonun hepsinde zorunlu RLS ve 4 politika var.
- 67 FK'nin hepsi şirket bağlantılı (bileşik) ya da yalnız `users` tablosuna işaret ediyor.
- Çalışma zamanı rolüne DELETE yetkisi verilmedi; olay tabloları yalnız SELECT ve INSERT alır.

**Kapsam:**
- Başka şirketin kayıtları kimlik bilinse bile 404 döner.
- Başka şirketin şubesi hedef olarak kullanılamaz; bileşik FK buna izin vermez.
- Varış şubesi kapsamı olmayan kullanıcı teslim alamaz.

**Yetki:**
- Yetki kaldırıldığında bir sonraki istek reddedilir; bu, `transfers.repair` ile test edildi.
- Hazır roller: Sahip ve Yönetici'ye +12, Operasyon'a +7 yetki (onay, inceleme, engel kaldırma ve onarım taşıması yok).
- Özel roller değişmez.

## F. Fotoğraf ve dosya güvenliği

Bakım ve hasar fotoğrafları kiralama kanıt fotoğraflarıyla aynı yapıyı kullanır:
- İçerik doğrulanır; görsel yeniden kodlanıp meta veri silinir.
- Zararlı dosya taramasından geçer. Üretimde tarayıcı yoksa yükleme kapalıdır (`UPLOADS_CLOSED`, testli). Zararlı dosya reddedilir (`MALWARE_DETECTED`, testli).
- Özel önekle saklanır.
- Her istekte şirket (RLS), yetki ve şube kapsamı denetlenir; `no-store` başlıkları gönderilir.

Belge erişim izni modeli (tek seferlik erişim kaydı) belgelere özeldir; kanıt fotoğraflarında, kiralama fotoğraflarında olduğu gibi kullanılmaz. Fotoğraf görüntüleme geçmişi tutulmaz (mevcut kanıt fotoğraflarıyla aynı). Bu durum açık risk olarak aşağıda yer alıyor.

M2 anahtarlarına ve `.env` dosyasına dokunulmadı.

## G. Finans

Finans V1 testlerinin tamamı geçti: dört göz, doğrulama, depozito iadesi, kapanış, değişmez kayıtlar, geçmiş.

Hasar dosyaları borç, depozito kesintisi, sigorta talebi veya fatura oluşturmaz; testte finans tablo sayıları değişmedi.

FN5 tasarımı 11. bölümde korunuyor; finans hareketi taşınmadı.

## H. Migration'lar

| Dosya | İçerik |
|---|---|
| `0037_operations.sql` | Tablolar |
| `0038_operations_rls.sql` | RLS, guard'lar, `vehicle_busy` |
| `0039_operations_history_guard_fix.sql` | Geçmiş guard'ının iç içe düzeni |
| `0040_transfer_purpose.sql` | Transfer amacı, hasar dosyası, taşıma yöntemi ve beyan sütunları |
| `0041_transfer_purpose_guard.sql` | BHT1 revizyonu |
| `0042_transfer_damage_window.sql` | Hasar kontrolü "şimdiden itibaren" |

Tutarlılık denetimi:
- Hepsi tam içerikli; boş dosya yok.
- Eski migration dosyaları değişmedi; journal'a yalnız ekleme yapıldı.
- Test veritabanında 43 uygulanmış migration var ve özetleri dosyalarla eşleşiyor (`verify`: sorun yok).
- Mevcut tablolarda yalnız izin listesi genişletmeleri ve fonksiyon değişimleri var:
  - dosya türleri;
  - km ve konum türleri;
  - sıra türleri;
  - rezervasyon ve kiralama araç guard'ları.
- Hiçbir mevcut satır için UPDATE, DELETE veya dönüşüm yok.
- Düzeltmeler yeni dosyalarla yapıldı; uygulanmış dosyalar değiştirilmedi, test veritabanı sıfırlanmadı.

## I. Ana veritabanındaki gerçek kayıtların ön kontrolü (salt okunur)

**Drina Rent a Car:**
- 1 onaylı rezervasyon: R-000001, gerçek kayıt. Aracı aktif; başka bir kayıtla çakışmıyor.
- 0 kiralama.
- 23 aktif araç.
- Konum kaydı: 25 olay (23 başlangıç, 2 elle).
- Km kaydı: 24 okuma (22 başlangıç, 1 elle, 1 düzeltme).
- 6 tanıtım fotoğrafı.

**Neretva Rent:**
- Rezervasyon ve kiralama yok.
- 4 aktif araç.

**Değerlendirme:**
- Bütün mevcut değerler yeni izin listelerine uyuyor.
- Yeni tablolar ana veritabanında yoktu.
- Transfer olmadığı için konum sürekliliği kuralı mevcut kayıtları etkilemez.
- Değişmeyen onaylı kayıtlar yeniden denetlenmez; R-000001'in tarihsel anlamı değişmez.
- Migration hiçbir satırı değiştirmez.

**Sonuç:** Çözülmemiş bir çelişki bulunmadı.

## J. Main entegrasyonu

| Konu | Sonuç |
|---|---|
| Git | İki çalışma ağacı temizdi. Main (`ceace28`) dalın atasıydı; yalnız fast-forward yapıldı. Force, reset veya rebase kullanılmadı. GitHub'a gönderilmedi. `operasyon-bht-v1` dalı ve `acarvo-bht1` çalışma ağacı korunuyor. |
| Son main commit'i | Bu raporu güncelleyen commit. Kod: `ae556bf`. |
| Ana sunucular | Geçişten önce durduruldu. Görev durdurulduktan sonra açık kalan iki alt süreç de kapatıldı; amaç, migration sırasında eski ve yeni şemanın karışmamasıydı. Geçişten sonra main kodundan yeniden başlatıldı. |
| Geçiş öncesi | `safe-migrate --verify` yalnız 6 bekleyen migration buldu. `--dry-run` 0037–0042'yi listeledi. Satır sayıları ve içerik özetleri alındı: şirket bazında tablolar, finans, kullanıcılar, şirketler, oturumlar, roller, şubeler ve 16 dosyalık depo. Güvenlik nesnelerinin anlık görüntüsü de alındı. |
| Doğrulanmış yedek | `C:\Users\soena\Desktop\acarvo\backups\2026-10-15-22-21-34` |
| Ana veritabanı | 37 → **43** migration. `safe-migrate --verify`: sorun yok (75 tablo, 71'i RLS'li). |
| Güvenlik karşılaştırması | Eklenenler: 40 politika (10 tablo × 4), yeni yetkiler ve indeksler. Kaldırılan politika, yetki, indeks veya rol özelliği yok. 67 yeni FK'nin hepsi şirket bağlantılı; çalışma zamanı rolünde DELETE yetkisi yok. |
| Rol izinleri | Yalnız hazır roller değişti. Sahip ve Yönetici +12 yetki (`transfers.repair` dahil); Operasyon +7 (onay, inceleme, engel kaldırma ve onarım taşıması yok). Özel rol yok. |
| Mevcut gerçek veriler | **Korundu.** Birebir aynı kalanlar: müşteriler (gerçek müşteri dahil), kurumsal hesaplar, araçlar, rezervasyonlar (gerçek R-000001 dahil), kiralamalar, km ve konum geçmişi, fotoğraflar ve belgeler, fiyat listeleri ve teklifler, sözleşmeler, finans tabloları, şubeler, üyelikler, kullanıcılar, şirketler, oturumlar, sıra sayaçları, dosya deposu. Tek ek: şirket başına 3 `role.preset_upgrade` işlem geçmişi kaydı. |
| Sentetik veri | Ana veritabanına bakım, hasar veya transfer eklenmedi; 10 yeni tablo boş. |
| Main üzerinde testler (yalnız `acarvo_test`) | API **518 / 518**; tarayıcı **127 / 127** (+33 isteğe bağlı test atlandı). |
| TypeScript ve build | 4 proje hatasız. Üretim derlemesi başarılı; büyük paket uyarısı önceden de vardı. |
| Çalışan uygulama | `/api/health` "veritabanı bağlı" döndü. Web `http://localhost:5173/bakim-servis` 200 verdi. Bakım API'si oturumsuz isteği reddetti. Ekranlar gerçek hesapla açılmadı; içerik doğrulaması test veritabanındaki tarayıcı testleriyle yapıldı. |

## K. Ekran adresleri

| Ekran | Adres |
|---|---|
| Bakım & Servis | http://localhost:5173/bakim-servis (yeni: `/bakim-servis/yeni`) |
| Hasar Kayıtları | http://localhost:5173/hasar-kayitlari (yeni: `/hasar-kayitlari/yeni`) |
| Araç Transferleri | http://localhost:5173/araclar/transferler (talep: `/araclar/transferler/yeni`; varışta teslim alma: `/araclar/transferler/<id>/teslim-al`) |
| Araç 360° | Genel bakış, Müsaitlik, Bakım ve Belgeler ve riskler sekmeleri |
| Kiralama 360° | Hasar sekmesi |

## L. Açık ürün kararları

1. **Taşıma doğrulaması:** Onarım taşıması personel beyanına dayanıyor. Çekici veya taşıyıcı firmasının kendi kaydı veya belgesi isteniyorsa ayrı karar gerekir.
2. **Fotoğraf erişimi:** Kanıt fotoğraflarının görüntülenme geçmişi tutulmuyor (kiralama fotoğraflarıyla aynı). İsteniyorsa belge erişim izni modeli fotoğraflara da uygulanabilir.
3. **İkinci kontrol kişisi:** Bakım tamamlama ve hasar engeli kaldırma için dört göz şartı yok. Drina'da tek Sahip ve tek Operasyon var.
4. **Kapsam dışı kalanlar:** Lastik sezon ve set takibi, bakım maliyeti (Masraflar), hazırlık ve temizlik kontrol listesi.
5. **FN5:** Tasarım raporda (11. bölüm); uygulama ayrı sprintte.

## M. Güvenlik ve operasyonel riskler

- **Ayrı kapı:** Onarım taşıması doğru kullanılmazsa (yanlış beyan) kullanılamaz araç yine hareket ettirilebilir. Bunu ayrı yetki, hasar dosyası bağlantısı, değiştirilemez beyan kaydı ve işlem geçmişi sınırlıyor.
- **BHT7:** Araç şu an kullanıcının şubesinde kayıtlıysa, ana şubesi kullanıcının yetki alanında olmasa da plakası ve modeli görünür.
- **Teslim kapısı:** Ana veritabanındaki 4 şubenin ülkesi tanımlı değil ve dış sözleşme modu kapalı. Teslim bu nedenle zaten mümkün değil; değişmedi.
- **Tarayıcı testleri:** Makine yükü altında yavaşlayabiliyor. Bu turda tam çalıştırmalarda zaman aşımı olmadı; finans performans testi iki tam çalıştırmada da geçti.

## N. Gerçek işletme kullanımına engeller

1. Şube ülkelerinin ve dış sözleşme modunun şirket sahibince ayarlanması (teslim için; mevcut koşul).
2. Her şirkette en az iki yetkili (Sahip ve Yönetici): finans dört göz kuralı ve operasyon kontrolü için.
3. Üretim için zararlı dosya taraması: yoksa fotoğraf yükleme kapalı kalır.
4. M2 gerçek anahtarları ve ülke belge kuralları: kullanıcı kararı; değiştirilmedi.
5. Onarım taşıması için işletmenin taşıma sağlayıcısı kuralının belirlenmesi (L-1).

