# ACARVO GLOBAL — Kapsamlı Ürün ve İşlevsellik Denetimi

Bağımsız ürün, iş akışı, kullanılabilirlik ve fonksiyonel yeterlilik analizi · 20.10.2026
Dal: `frontend-prototip-v1` (son commit `9d7fa45`) · main: `44354d0` · Demo: `http://localhost:5174`
Bu belge **bir karar belgesidir, uygulama planı değildir.** Hiçbir kod, ekran, tasarım, veritabanı veya şartname değiştirilmedi; hiçbir özellik kaldırılmadı; commit, merge ve push yapılmadı. Aşağıdaki öneriler **sizin onayınız olmadan uygulanmaz** (bkz. K bölümü).

---

## 0. Yöntem, kaynaklar ve sınırlar (önce okuyun)

**Neye baktım (hepsi salt okunur):**
- Şartname `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` (6.322 satır; §1–§85, Part II–IV): §4, §82 tam; §6–§59 ve §61–§85'in büyük bölümü satır satır; §59U–§59CZ başlıkları ve seçili bölümler. `docs/` altındaki 8 geliştirme raporu, 8 plan, `TEKNIK_UYGULAMA.md`, `GELECEK_MODULLER_PLANI.md`.
- **Gerçek backend:** `apps/api/src` (modüller, rotalar, `db/schema.ts`, 47 migration, 78 tablo), `packages/shared`, `apps/web/src` (gerçek ekranlar; `nav.ts` içindeki `built` işaretleri), `ROLE_PRESETS`.
- **Demo:** `apps/web/src/demo` (çekirdek ~6,6 bin satır, arayüz ~11,8 bin satır), veri modeli (`core/types.ts`), tüm 36 ekran + 2 bağlam için çalışan demodan çıkarılmış **ekran anatomisi** (başlık, sekmeler, düğmeler, filtreler, sütunlar, paneller; salt okunur tarayıcı taraması), önceki sprintlerin 8 senaryo testlerinden sayılan adım sayıları.
- Boyut referansı: gerçek API ~18 bin satır, gerçek web ~25 bin satır (demo hariç), ortak paket ~4,6 bin satır.

**Neye bakmadım / yapamadım (bu yüzden "doğrulanamadı" sayılır):**
- Gerçek uygulamanın canlı arayüzünü tarayıcıda açmadım (kimlik bilgisi gerekir; 3001 portundaki API ana veritabanına bağlı olduğu için canlı veriye yazma riski almak istemedim). Gerçek ekranlar **kaynak kod + geliştirme raporları + test raporlarıyla** değerlendirildi.
- Gerçek bir rent-a-car personeliyle kullanım testi, süre ölçümü veya müşteri araştırması yok. "Adım sayısı" test betiklerinden sayılan **eylem sayısıdır**, kronometre değildir.
- Ülkeye özgü mevzuat (vergi, fiskal belge, sigorta, sürücü yaşı, kişisel veri) hakkında kesin iddiada bulunmadım.
- Demonun 28 araçlık verisi küçüktür; 300+ araçta demonun davranışı ölçülmedi (gerçek API'nin 3.000–5.000 kayıtlık performans testleri raporlarda mevcut ve oraya atıf yapıldı).

**Bulgu durumu etiketleri** (her bulguda):
- **[D] Doğrulandı:** kod, belge veya çalıştırılan test/tarama ile desteklenir.
- **[K] Kısmen doğrulandı:** bir kısım kanıt var, kapsam tam değil.
- **[Ö] Ürün önerisi:** işletme bakış açısıyla çıkarım; kodla doğrulanacak bir olgu değil.
- **[?] Doğrulanamadı.**

**Okuma notu:** "Demo" = `acarvo-demo-ui` prototipi (tarayıcıda, sunucusuz). "Gerçek" = `main`daki backend + web (acarvo_test/ana veritabanı mimarisi). İkisi **farklı olgunluk düzeyindedir ve kuralları bazı yerlerde birbirinden ayrışmıştır** (H bölümü).

---

## A. Yönetici özeti

### A.1 Genel ürün durumu (tek paragraf)

ACARVO'nun elinde iki ayrı ürün var. **Gerçek ürün**, 36 ekranın **12'sini** gerçek veriyle, sunucu tarafı güvenliğiyle (RLS, dört göz, idempotency, eşzamanlılık kilitleri, şifreli belgeler) çalıştırıyor ve bu 12 ekran derin ve titiz. **Demo**, 36 ekranın hepsini ve iki bağlamı etkileşimli gösteriyor ama sunucu garantisi yok. Şartname bu ikisinin üstünde, ~100 numaralı bölümlük, V1'e gereğinden fazla şey sığdırmış bir "tam ürün" tarifi. En önemli tespitim: **sorun özellik eksikliği değil, kapsamın ve ekran sayısının işletmenin gerçek günlük işinden hızlı büyümüş olması; ayrıca demo ile gerçek ürünün iş kurallarının ayrışmaya başlaması.**

### A.2 En önemli 12 bulgu

| # | Bulgu | Etki | Durum |
|---|---|---|---|
| 1 | **Gerçek ürün bugün yeni bir müşteriyi (şirketi) çalıştıramaz:** kullanıcı davet/oluşturma, şifre sıfırlama, rol düzenleme arayüzü, ilk kurulum akışı yok. Giriş, çıkış, oturum, şirket değiştirme var; roller yalnız 3 hazır rol (Sahip, Yönetici, Operasyon). Şirket ve kullanıcılar tohum betiğiyle/elle kuruluyor (şube ülkesi Şubeler ekranından girilebiliyor). | Hiçbir gerçek işletme ürünü kendi başına devreye alamaz | [D] `modules/auth/routes.ts` (5 rota), `nav.ts` (`kullanicilar`, `roller-ve-yetkiler` `built` değil), `auth/roles.ts` |
| 2 | **Demo ile gerçek finans modeli ayrışmış:** gerçekte her tahsilat *başka bir yetkili tarafından doğrulanana kadar bakiyeden düşmez*, çok para birimi yok, kaparo yok, depozito mahsubu yok, kasa yok (FN1–FN7). Demoda ödeme kaydedilir kaydedilmez uygulanır; çok para birimi, kur, kaparo, kasa, depozito mahsubu çalışır. Aynı "Finans" adı altında iki farklı ürün davranışı var. | Demoyu gören bir işletme, gerçekte olmayacak bir davranışı satın alır; entegrasyonda kural çakışır | [D] `FINANS_YONETIMI_V1_GELISTIRME_RAPORU.md` §3,§19; `demo/core/types.ts` `Payment.status`, `demo/core/ops/finance.ts` |
| 3 | **İki ayrı iş kuralı kodu:** demo hiçbir yerde `@acarvo/shared`'ı kullanmıyor; para, zaman, fiyat, müsaitlik, finans mantığını kendi 6,6 bin satırlık çekirdeğinde yeniden yazmış. Gerçekte aynı kurallar `packages/shared/pricing-engine.ts` (sürüm `pe-1`) ve API'de ayrıca duruyor. | Sessiz sapma: aynı kiralama iki ekranda iki farklı fiyat/gün/müsaitlik verebilir | [D] `grep @acarvo/shared apps/web/src/demo` = 0 dosya; iki `calculateRentalDuration` benzeri uygulama |
| 4 | **Gerçek web arayüzü yalnız Türkçe, çok dilli altyapı yok** (çeviri kataloğu, dil seçici yok); demonun İngilizcesi (B/L sistemi) gerçeğe taşınabilir değil. "Uluslararası ürün" hedefiyle çelişir. | Yurtdışı satış ve ülke bazlı belge dili için temel eksik | [D] `apps/web/src` içinde i18n yok (yalnız 13 biçimlendirme çağrısı); sözleşme şablonları 6 dilde ama arayüz tek dilli |
| 5 | **Aynı soruya (ne yapmam gerekiyor?) sekiz farklı yüzey cevap veriyor:** Ana Ekran, Komuta Merkezi (4 sekme), Uyarılar, Bildirim kutusu, Görevler, Riskler, İstisnalar, Gelir Kontrolü. Aynı uyarı kaynağından beslenseler de kullanıcı için "nereye bakmalıyım" belirsiz. Demoda ilk açılışta 30 uyarı + "9+" bildirim var. | Alarm yorgunluğu; sahibin kararsız kalması | [D] anatomi: Ana Ekran panelleri ile Komuta "Acil/Bugün" panelleri aynı kayıtlar; [K] 30 uyarı sentetik veriden, gerçek oran bilinmiyor |
| 6 | **Onay akışları tek yerde toplanmamış:** şartname "Onay Merkezi yalnız 6 tür" der; ama gerçek üründe ek olarak engel kaldırma ikinci onayı, hesap kalemi onayı/ters kaydı, iade onayı, ödeme doğrulama, ödeme sorumlusu düzeltmesi, bakım planı onayı gibi **en az 6 dört-göz akışı** ayrı ekranlarda ve ayrı kuyruklarda. Yönetici "bekleyen işlerim" için 4–5 yere bakmak zorunda. | Onay bekleyen iş kaçar; en yavaş darboğaz | [D] `dashboard/DashboardPage.tsx` etiketleri ("Engel kaldırma ikinci onay bekliyor", "Bakım planı onay bekliyor"), `finance` bekleyen kuyruk, `schema.ts` onay tabloları |
| 7 | **Dört göz kuralı küçük işletmeyi kilitler:** FN1 "tek personelli şube istisnası yok": 1–3 kişilik bir işletmede tahsilatı kaydeden kişi doğrulayamaz → bakiye hiç düşmez. | Küçük işletme ürünü kullanamaz | [D] Finans raporu §19 FN1; [Ö] küçük işletme etkisi |
| 8 | **Demoda inline "yeni müşteri" yok, gerçekte var:** yeni rezervasyon çalışma alanında müşteri yalnız aranır; olmayan müşteri için çalışma alanı terk edilir. Şartname §9.2 iki mod ister, gerçek formda "Yeni müşteri kaydı aç" var. | Resepsiyon akışının en sık yolu (yeni/telefon müşterisi) 2 ekrana bölünür | [D] `BookingWorkspace.tsx` (düğme yok) vs `reservations/ReservationFormPage.tsx:151` |
| 9 | **Rezervasyon varsayılan olarak "Bekliyor" kaydedilir** ("Kaydederken onayla" kutusu işaretsiz); Bekleyen kayıt araç tutmaz. Telefonla alınan ve "tamam" denen bir rezervasyonun aracı sessizce serbest kalır. | Çifte kiralama riski, ek tıklama | [D] senaryo 2 testi: kayıt sonrası "Bekliyor" + ayrı "Onayla"; [Ö] varsayılanın ters olması |
| 10 | **Şartname V1'e V2 işlerini sığdırmış:** tedarikçi/alt-kiralama alanı (~425 satır), anahtar/ekipman takibi, yol yardım/çekici, sigorta hasar dosyası, araç alım-satım ve maliyet geçmişi, QR, içe aktarma, KVKK/GDPR ekranları, platform abonelik arayüzü, partner/tedarikçi performansı. Çoğu küçük/orta işletme için V1'de gerekmez; her biri ekran, test ve bakım maliyeti getirir. | Kapsam şişmesi, gecikme | [D] §59U–§59AD (3094–3520), §59BA–§59BC, §59BL–§59BO, §59CN; [Ö] ihtiyaç değerlendirmesi |
| 11 | **Demoda model var, arayüz yok / tersi:** ödeme planı (`paymentPlans`) hiçbir ekranda oluşturulamaz ama uyarı üretir; çalışan vardiya kayıtları (`shifts`) tohumda var, hiçbir ekranda gösterilmez; "Vardiya Devri" yalnız yazdırılabilir özet (not yazma, "devralındı" yok); "Gelir Kontrolü"nün 9 kontrolünün 6'sı sistemin kendi değişmezlerini sınıyor (çift kalem, kasa kaydı eksik, nakit olmayan ödemenin kasada olması…; bunlar tasarım gereği zaten olamaz), 3'ü gerçek iş durumu (fazla ödeme, uygulanmamış ödeme, operasyonel kapalı–finans açık); anormal indirim, eksik gecikme/km/yakıt ücreti gibi gerçek gelir kaçağı sinyalleri yok. | Sahte kesinlik / ölü uyarı | [D] `grep paymentPlans pages ui` = 0; `grep shifts pages ui` = 0; `RevenuePage.tsx` 9 `key:` |
| 12 | **Gerçek müşteri belgeleri ve ülke kuralları hazır ama kurulum engelleri belgelenmiş:** şube ülkesi boşsa teslim engelli (K3), dış sözleşme modu kapalıysa teslim engelli (K1), ClamAV yoksa fotoğraf yüklenemez, M2 anahtarları kurulmamış. Bunlar güvenlik açısından doğru ama **kurulum sihirbazı olmadan** bir işletmenin ilk gününü engeller. | İlk kurulum yüksek sürtünme | [D] Kiralama raporu §"Gerçek operasyon öncesi eksik koşullar"; Finans raporu §10 |

### A.3 Genel değerlendirme tablosu

| Boyut | Not | Gerekçe (kısa) |
|---|---|---|
| Domain kuralı doğruluğu (ayrımlar: Rezervasyon≠Kiralama, Müsaitlik≠Hazırlık, Kaparo≠Depozito…) | **Güçlü** | Hem şartnamede hem gerçekte hem demoda tutarlı ve test edilmiş [D] |
| Gerçek backend güvenliği ve bütünlüğü | **Güçlü** | RLS, dört göz, idempotency, kilitler; 534 API testi [D] |
| İş akışı verimliliği (günlük resepsiyon) | **Orta-zayıf** | Rezervasyon→teslim ~26 eylem, 4 sayfa; iki ayrı beyan kutusu; fotoğraf için 4 tıklama (demo) [D sayım] |
| Kapsam disiplini | **Zayıf** | 36 menü + 100 bölüm; niş alanlar V1'de [D/Ö] |
| Demo–gerçek tutarlılığı | **Zayıf** | Finans modeli, sınıf rezervasyonu, onay modeli, çok dil, rol seti ayrışmış [D] |
| Küçük işletme uygunluğu | **Zayıf** | Dört göz zorunluluğu, kurulum yükü, 36 menü [D/Ö] |
| Orta ölçek uygunluğu | **Orta** | Görev, kasa, rapor, bildirim, kullanıcı yönetimi gerçekte yok [D] |
| Büyük ölçek uygunluğu | **Zayıf-bilinmiyor** | Sınıf bazlı kapasite, içe aktarma, şube karşılaştırma gerçekte yok; performans yalnız 3–5 bin kayıtla ölçülmüş [D/?] |
| Uluslararası hazırlık | **Kısmen** | Para birimi, saat dilimi, ülke belge kuralı, 6 dilli sözleşme şablonu var; arayüz dili yok [D] |

### A.4 Tek cümlelik tavsiye

**Yeni özellik eklemeyin. Önce (1) "ürün çekirdeğini" resmen tanımlayıp şartnamenin geri kalanını V1.5/V2 olarak etiketleyin, (2) demo ile gerçek finans/onay/rezervasyon kurallarını tek modele indirin, (3) gerçek ürüne kullanıcı/rol/ilk kurulum çekirdeğini ekleyin, (4) ancak sonra tasarım sprinti ve diğer backend modüllerine geçin.**

---
## B. 36 çalışma alanının analizi

Her ekran için A–L başlıkları kullanıldı. "Demo" ve "Gerçek" ayrı yazıldı. Kanıt yollarında `d/` = `apps/web/src/demo/`, `w/` = `apps/web/src/pages/` (gerçek), `api/` = `apps/api/src/`.

### B.1 GENEL (3)

#### 1 · Ana Ekran — öncelik **P0**
- **A. Amaç:** Şirkete girince "bugün ne oluyor?" sorusunu tek bakışta yanıtlamak; her sayı kaynak listeye gider.
- **B. Kullanıcı:** Sahip (günde 1–3 kez), şube yöneticisi (sabah, öğle, akşam), resepsiyon (vardiya başında).
- **C. Mevcut:** *Demo:* 6 kartlık şerit (bugün teslim/iade, aktif kiralama, geciken iade, müsait araç, bekleyen rezervasyon), Gecikenler, Bugün teslim/iade, Önümüzdeki üç gün, Dikkat gerektirenler (ilk 7), 7/14/30 günlük teslim-iade akışı (grafik/tablo), filo durumu, bakım-hasar-transfer sayıları, şube tablosu, para birimine göre finans tablosu. *Gerçek:* aynı iskelet + bakım/hasar/transfer/hazırlık KPI'ları (engel kaldırma ikinci onayı, bakım planı onayı, geciken transfer), hazırlık notu (Sahip), 60 sn otomatik yenileme, finans tablosu yalnız `finance.reports.read` ile.
- **D. Eksik:** Dönem karşılaştırması (bu hafta/geçen hafta, §59T); tahsilat–hesaplanan–açık bakiye zaman serisi; rol-bazlı farklı ilk ekran (§59AQ: resepsiyon ile sahip aynı sayfayı, yalnız yetkiyle kırpılmış görür); çalışan iş yükü; **bekleyen onaylar tek satırda yok** (gerçekte dört-göz kuyrukları dağınık).
- **E. Yüzeysel:** Tek grafik var ve o da teslim-iade sayısı; "finansal dikkat" yalnız tablo.
- **F. Düşük değer:** Grafik/Tablo anahtarı (tablo zaten altta); 7/14/30 gün üç ayrı seçenek (14 gün yeterli varsayılan).
- **G. Çakışma:** Komuta Merkezi "Acil" ve "Bugün" sekmeleri ile **~%80 aynı kayıt** (Gecikenler, Bugün teslim/iade, Kritik uyarılar); "Dikkat gerektirenler" = Komuta "Uyarılar".
- **H. İş akışı:** Kartlar doğru filtreyle açılıyor (senaryo 1 testi) — bu iyi. Sorun: sahip "bana ne düşüyor" sorusu için buradan onay kuyruğuna doğrudan gidemez.
- **I. Gerçek fark:** Gerçek ekran **demodan daha operasyonel** (hazırlık, hasar engeli, transfer); demo daha geniş (görev, uyarı, finans para birimi) ama sahte uyarı yoğunluğu (30) içeriyor.
- **J. Öneri:** Ana Ekranı "bugünün tek yüzeyi" yapın: şerit + 3 liste (gecikenler, bugün teslim, bugün iade) + **tek "Bekleyen işlerim" satırı (onay + görev + uyarı sayısı)**. Dönem karşılaştırmasını ayrı bir `Raporlar` görünümüne bırakın. Komuta Merkezi'nin tekrarlarını buraya çekin (E bölümü).
- **K. Öncelik:** P0 — her kullanıcının her gün açtığı tek ekran.
- **L. Kanıt:** [D] `d/pages/home/DashboardPage.tsx`, `w/dashboard/DashboardPage.tsx` etiketleri, anatomi (panel listesi), senaryo 1 testi. [K] "~%80" örtüşme: panel başlıklarından, kayıt-düzeyi karşılaştırma yapılmadı.

#### 2 · Komuta Merkezi — öncelik **P1** (birleştirme adayı)
- **A. Amaç:** "Şu an müdahale gerektirenler": acil iş kuyruğu + vardiya devri.
- **B. Kullanıcı:** Şube yöneticisi, vardiya amiri.
- **C. Mevcut (demo):** 4 sekme: Acil (kritik uyarılar + geciken iadeler), Bugün (teslim/iade), Uyarılar (30; önem ve modül filtresi), Vardiya Devri (yazdırılabilir operasyon + kasa/onay özeti). *Gerçek:* **yok** (`built` değil).
- **D. Eksik:** Vardiya Devri'nde **devir notu yazma ve "devralındı" işareti yok** (§59M); `shifts` kaydı tohumda var ama hiçbir ekranda gösterilmiyor/oluşturulmuyor [D]; "kim vardiyada" göstergesi yok.
- **E. Yüzeysel:** Vardiya Devri = salt okunur yazdırma sayfası; gerçek bir "devir" işlemi değil.
- **F. Düşük değer:** "Bugün" sekmesi (Ana Ekran ile aynı); "Acil" içindeki Geciken iadeler paneli (Ana Ekran'da var).
- **G. Çakışma:** Ana Ekran, Görevler ("Tüm açık görevler" Komuta'da sayı olarak), Riskler ve İstisnalar (aynı uyarı kaynağı), bildirim kutusu.
- **H. İş akışı:** Uyarılar 30 kayıt; önem filtresi var ama **sorumlu atama / "üstlen" / erteleme yok**, yalnız kaynağa gitme. Uyarı, görev değil: kimin ilgilendiği belirsiz.
- **I. Gerçek fark:** Gerçekte yalnız Ana Ekran "dikkat gerektirenler" var; uyarı kuyruğu, görev, bildirim yok.
- **J. Öneri:** **Birleştir:** Komuta Merkezi'ni "Bugün/İşlerim" kuyruğuna indirgeyin: *tek liste* (uyarı + görev + onay), sorumlu ve durum sütunuyla; Ana Ekran'ın tekrar panellerini kaldırın. Vardiya Devri'ni gerçek hâle getirin (not + devralındı) **ya da ertelendiğini açıkça yazın**. Menü sayısını değiştirmek şartname revizyonu + sizin kararınız gerektirir (K).
- **K. Öncelik:** P1 (iş kuyruğu P1; ayrı menü olarak P3).
- **L. Kanıt:** [D] anatomi (panel/sekme), `grep shifts` = 0 ekran kullanımı, `d/pages/work/CommandPage.tsx`. [Ö] birleştirme.

#### 3 · Filo Asistanı — öncelik **P4** (sadeleştir)
- **A. Amaç:** Hazır soru–cevap ile hızlı bilgi bulma.
- **B. Kullanıcı:** Resepsiyon/yönetici, nadir.
- **C. Mevcut (demo):** 8 hazır sorgu ("şu an hangi araçlar müsait?", "yarın teslim edilecekler hazır mı?"…), serbest metin yalnız anahtar kelime eşler, şube/sınıf filtresi. *Gerçek:* yok.
- **D. Eksik:** Plaka → "araç nerede/kimde" tek kutu (§8'in en sık örneği) ayrı arama olarak yok (Global Ctrl K var).
- **E. Yüzeysel:** Doğal dil iddiası taşımıyor (doğru), ama "asistan" adı beklenti yaratır.
- **F. Düşük değer:** 8 sorgunun 7'si zaten **Araçlar/Kiralamalar listesindeki bir filtre** (Hazır değil, geciken iade, bakım yaklaşan, belge süresi).
- **G. Çakışma:** Global arama (Ctrl K), Araçlar/Kiralamalar filtreleri, Fırsatlar.
- **H. İş akışı:** Bir sorguya tıklamak yeni bir ekran yerine aynı sayfada sonuç gösterir; ancak sonuç satırından kayda gitmek için yine liste mantığı.
- **I. Gerçek fark:** Yok → gerçekte yapılmasının getirisi düşük.
- **J. Öneri:** Ayrı menü olarak **ertele**; işlevi (a) kayıtlı filtreler ("Hazır olmayan araçlar") ve (b) global aramanın "araç nerede" sonucu olarak sunun. Menüyü kaldırmak için kullanıcı kararı gerekir.
- **K. Öncelik:** P4 (ayrı ekran olarak); işlevin %80'i P1 filtrelerle karşılanır.
- **L. Kanıt:** [D] `d/pages/work/AssistantPage.tsx` (8 `QUERIES`), anatomi. [Ö] getiri değerlendirmesi.

### B.2 OPERASYON (9)

#### 4 · Rezervasyonlar — öncelik **P0**
- **A. Amaç:** Satıştan operasyona geçiş: müşteri + dönem + araç/sınıf + fiyat + (kaparo) → onay → kiralama.
- **B. Kullanıcı:** Resepsiyon (günlük, en sık işlem), yönetici (onay).
- **C. Mevcut:** *Gerçek:* liste (arama, durum, tarih, şube, sınıf, atama), 14 günlük araç zaman çizelgesi, çalışma alanı (müşteri arama **veya aynı ekranda yeni müşteri**, kurumsal bağlam, sürücüler, plan, canlı müsaitlik, kaynak/not, sağ sabit özet), 360° (6 sekme), onayla/düzenle/iptal/gelmedi, sürüm çakışması, fiyat teklifi bağlantısı. *Demo:* liste (durum, atama, şube, kanal filtreleri; Kaparo/Belge/Kanal sütunları) + Bekleme listesi sekmesi; çalışma alanı; 360° 3 sekme (Özet, Kaparo, Geçmiş); kaparo (iade/politika bedeli), sınıf-only onaylı talep kapasitesi.
- **D. Eksik:** *Demo:* inline yeni müşteri [D]; rezervasyon değişiklik geçmişi gerçekte var, demoda "Geçmiş" tek sekme; *Gerçek:* kaparo, bekleme listesi, sınıf bazlı kapasite, fiyat (teklif ayrı), kanal raporu.
- **E. Yüzeysel:** Demoda "Belge" sütunu belge durumunu gösterir ama eksik belge yükleme yolu rezervasyondan değil müşteri sayfasından.
- **F. Düşük değer:** Bekleme listesi V1'de (küçük/orta işletme için nadir).
- **G. Çakışma:** Talep Merkezi (kabul edilen teklif → rezervasyon), Kapasite Planlama, Takvim.
- **H. İş akışı:** (1) Varsayılan "Bekliyor" + ayrı "Onayla" (A.2 #9). (2) Inline müşteri yok. (3) Sınıf-only onaylı rezervasyon demoda var, gerçekte onaylanamaz (R1) → **aynı ekran iki farklı davranış**. (4) Kaparo ayrı sekmede; ödeme alma "Finans"a gitmeden.
- **I. Gerçek fark:** R1 (araç atanmadan onay yok), kaparo yok, bekleme listesi yok, kanal alanı kısmen (`reservations_source_check`), hazırlık süresi yok (karar D).
- **J. Öneri:** Varsayılanı "yetkin varsa onayla" yapın; inline yeni müşteri ekleyin (demo); **sınıf-only onay kararını netleştirin** (K-3); bekleme listesini V1.5'e alın.
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `d/pages/shared/BookingWorkspace.tsx`, `w/reservations/ReservationFormPage.tsx:151`, REZERVASYON raporu R1/karar A, senaryo 2 testi.

#### 5 · Kiralamalar — öncelik **P0**
- **A. Amaç:** Aktif iş: hazırlık → teslim → iade → kapanış, finans ayrı yaşam döngüsü.
- **B. Kullanıcı:** Resepsiyon/teslim noktası (günde onlarca), yönetici.
- **C. Mevcut:** *Gerçek:* 8 görünüm, yeni/düzenle, Kiralama 360° (üst bant, 3 karar kartı, 7 sekme, teslim–iade karşılaştırma, hasar diyagramları), Teslim Masası, İade, sözleşme taslağı/PDF, uzatma, fotoğraf kanıtı. *Demo:* liste, 360° (7 sekme), Teslim Masası (6 adım), uzatma, araç değiştirme, iptal, istisnai/kayıp kapanış, finansı yeniden aç.
- **D. Eksik:** *Gerçek:* araç değiştirme, olağan dışı kapanış (§71), sürücü yaş/ehliyet sınıfı politikası, gecikme/km/yakıt ücreti önizlemesi (FN6), sözleşme imzası, sigorta paketi seçimi. *Demo:* kiralama başına "değişiklikler" sekmesi ayrı değil.
- **E. Yüzeysel:** Demoda fotoğraf "kutuyu işaretle" (gerçek yükleme yok); imza = ad yazıp kutu işaretle.
- **F. Düşük değer:** Teslim Masası'nda iki ayrı personel beyanı kutusu ("belgelerin aslını gördüm", "sürücü uygunluğunu doğruladım") ve ayrı "temiz ve hazır kaydet" düğmesi → üç ayrı kontrol bir adımda birleşebilir.
- **G. Çakışma:** Rezervasyonlar (dönüşüm), Sözleşmeler (ayrı liste), Finans (kiralama finans sekmesi).
- **H. İş akışı:** Rezervasyon→teslim ≈ **26 eylem / 4 sayfa** (senaryo 2'den): 11 rezervasyon+dönüşüm, 15 masada (2 beyan, imza 4, depozito 2, fotoğraf 4, teslim 1…). Kalite kontrolü bilinçli (güvenlik/belge adımı) ama fotoğraf 4 tıklama ve imza için ad yazma tekrar eden demo sürtünmesi; gerçek üründe fotoğraf yükleme zaten ayrı.
- **I. Gerçek fark:** Teslim için **dış sözleşme modu (K1)** açık olmalı ve şube ülkesi tanımlı olmalı (K3); sözleşme imzası yok; fiyat teklifi dondurulmuş; finans ayrı dosya.
- **J. Öneri:** Teslim Masası'nı "karar kartları + tek Teslimi Tamamla" olarak sadeleştirin (beyanları tek onay kutusuna indirin, **belge ve sürücü kontrollerinin sistem kararı kalması şartıyla**); Rezervasyon→Teslim için "Tek sayfa teslim" kısayolu (Rezervasyon 360'tan doğrudan masaya).
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `d/pages/rentals/RentalDesk.tsx` (6 adım), `w/rentals/*`, KIRALAMA raporu §13/K1–K3, `rental_events_kind_check` (swap/exception yok). [K] eylem sayısı test betiğinden sayıldı.

#### 6 · Takvim — öncelik **P1**
- **A. Amaç:** Teslim, iade, bakım, transferin zaman projeksiyonu (ikinci doğruluk değil).
- **B. Kullanıcı:** Şube yöneticisi, resepsiyon.
- **C. Mevcut:** *Demo:* Gün/Hafta/Ay/Gündem, şube ve sınıf filtresi, blok tıklayınca kaynağa gider. *Gerçek:* menü olarak yok; **Rezervasyonlar içinde 14 günlük araç zaman çizelgesi** ve Araç 360° "Müsaitlik" var (bakım, hasar, transfer blokları dahil).
- **D. Eksik:** Araç × gün çizelgesi demoda Takvim'in "Hafta" görünümü ile Kapasite Planlama arasında bölünmüş; şablon değişmesi sonrası tarih seçimi.
- **E. Yüzeysel:** Boş aralıktan doğrudan "ön dolu rezervasyon" (§82.3) yok [K: doğrulanmadı].
- **F. Düşük değer:** "Ay" görünümü (araç sayısı arttıkça okunmaz) [Ö]; ilk 28 araçlık demoda sınanmadı.
- **G. Çakışma:** Araç 360° Müsaitlik, Kapasite Planlama, Rezervasyon zaman çizelgesi — **üç ayrı zaman çizelgesi**.
- **H. İş akışı:** Resepsiyon "boş araç/gün" sorusunu bir yerde yanıtlamalı; şu an üç yerde farklı kesitlerle.
- **I. Gerçek fark:** Gerçekte zaman çizelgesi var, menü yok.
- **J. Öneri:** Tek "Zaman çizelgesi" bileşeni (araç satırı × gün) ve üç yerde aynı bileşen; Takvim = bu bileşenin şube/sınıf görünümü; Kapasite Planlama ayrı menü yerine bu görünümde "kapasite" modu (şartname revizyonu gerekir).
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `d/pages/work/CalendarPage.tsx`, `w/reservations/ReservationTimeline.tsx`, anatomi. [Ö] birleştirme.

#### 7 · Görevler — öncelik **P1**
- **A. Amaç:** Manuel insan işi; tamamlamak kaynak kaydı değiştirmez.
- **B. Kullanıcı:** Yönetici (atar), personel (üstlenir) — çok personelli işletmede günlük.
- **C. Mevcut (demo):** 5 görünüm (Bana atanan, Açık havuz, Tüm açık, Geciken, Tamamlanan), öncelik filtresi, oluştur (tek kişi/birkaç kişi/havuz), üstlen, başla, tamamla, devret, geçmiş, bağlı kayıt. *Gerçek:* yok (görev tablosu yok).
- **D. Eksik:** Yorum dizisi (§12), "üstlenmeyi bırak/yeniden aç", çalışan iş yükü görünümü (§59AZ) — iş yükü demoda da yok.
- **E. Yüzeysel:** Bildirim (atanana) yalnız zil kutusunda; e-posta/SMS yok (doğru, bilinçli).
- **F. Düşük değer:** "Birkaç kişiye duyur + takipçi" modeli (§83.6) küçük işletme için gereksiz karmaşık; tek sorumlu + havuz yeterli.
- **G. Çakışma:** Komuta Merkezi uyarıları ("Geciken görev" uyarısı), Olay Merkezi (olaydan görev), Bakım (planlı iş).
- **H. İş akışı:** Görev oluşturma 4 eylem; iyi. Sorun: görev "kaynak kayıtla birlikte" açılırken (Araç/Kiralama bağlamı) ve ekrandan bağımsız açılırken iki farklı yol.
- **I. Gerçek fark:** **Tam eksik**; ancak demoda çalışıyor.
- **J. Öneri:** Gerçekte "tek sorumlu + açık havuz + vade + bağlı kayıt" ile başlayın; çok alıcılı duyuruyu ertele. Küçük işletme için "Görevler" kapalı bir modül olabilir (modül anahtarı, E.3).
- **K. Öncelik:** P1 (orta/büyük ölçek), P3 (küçük).
- **L. Kanıt:** [D] `d/pages/work/TasksPage.tsx`, `api/src` içinde `task` yok, anatomi sekmeleri. [Ö] küçük işletme etkisi.

#### 8 · Araçlar — öncelik **P0**
- **A. Amaç:** "Bu araç şu an nerede, kimde, ne zaman müsait, ne yapılmalı?" — operasyonun merkezi.
- **B. Kullanıcı:** Herkes; filo sorumlusu en çok.
- **C. Mevcut:** *Gerçek:* **V5 Araç 360°** (sürümlü belgeler, tanıtım fotoğrafları, km ve konum olayları + düzeltme, bakım takvimi, müsaitlik ve engeller, hızlı eylemler), transfer modülü, hazırlık denetimi. *Demo:* liste (Şimdi/Seçili dönem anahtarı, durum, şube, sınıf, hazırlık, kaynak filtreleri), 8 sekmeli 360°, iç + dış araç.
- **D. Eksik:** Gerçekte sekme iskeleti şartnameyle aynı (`VEHICLE_TABS`: genel, müsaitlik, kiralamalar, kontroller, bakım, belgeler, finans, geçmiş) [D]; "finans" sekmesinin içeriği kaynak koddan ayrıca doğrulanmadı [?]. Anahtar/ekipman: demoda anahtar = adet + bulunduğu yer, olay kaydı yok; araç alım-satım/maliyet geçmişi her ikisinde yok.
- **E. Yüzeysel:** Demoda "Finans ve performans" kısmı kiralama geliri/bakım toplamı; **araç başına maliyet** (bakım+ceza+hasar) tek tablo değil.
- **F. Düşük değer:** Seçili-dönem/Şimdi anahtarı ile dört ayrı müsaitlik rozeti bir arada fazla (Şimdi yeterli, dönem filtresi ayrı).
- **G. Çakışma:** Filo Analizi (kullanım), Kapasite, Takvim; Bakım sekmesi ↔ Bakım & Servis ekranı.
- **H. İş akışı:** Hızlı eylemler (bakım planla, hasar bildir, rezervasyon aç) doğru önden dolu; iyi.
- **I. Gerçek fark:** Gerçek tarafı demoda *daha sağlam* (versiyonlu belge, olay düzeltme).
- **J. Öneri:** Aynen koru; Finans & performans sekmesini "araç başına gerçek maliyet" ile derinleştirin (şartname §13.3/Sekme 7); anahtar/ekipman V2.
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `w/vehicles/*`, `d/pages/vehicles/Vehicle360Page.tsx`, BAKIM raporu §12. 

#### 9 · Bakım ve Servis — öncelik **P1**
- **A. Amaç:** Planlı/açık/tamamlanan servis, maliyet, araç uygunluğuna etkisi; tamamlanan ≠ hazır.
- **B. Kullanıcı:** Filo sorumlusu, yönetici (onay).
- **C. Mevcut:** *Gerçek:* durumlar (onay bekliyor, planlandı, serviste, kontrol bekliyor, tamamlandı, iptal), fotoğraf, olaylar, bakım şablonları (`maintenance_schedules`), ortak uygunluk. *Demo:* 4 durum, tür (periyodik, onarım, lastik, temizlik, muayene), maliyet, hazırlık ayrı.
- **D. Eksik:** Servis sağlayıcı yalnız metin alanı (`provider_name`), sağlayıcı kaydı/ödeme koşulu yok [D]; hatırlatma e-postası yok (doğru, bilinçli).
- **E. Yüzeysel:** Demoda "onay bekliyor/kontrol bekliyor" durumları yok → gerçekle farklı yaşam döngüsü.
- **F. Düşük değer:** Temizlik/muayene türleri Bakım ekranında; **"temizlik" Hazırlık işidir** (karışıyor).
- **G. Çakışma:** Araç 360° Bakım sekmesi, Masraflar (kaynak-bağlı gider), Görevler.
- **H. İş akışı:** Planla→başlat→tamamla 6 eylem; çakışmada neden gösterilir (senaryo 6) — iyi.
- **I. Gerçek fark:** Yaşam döngüsü (gerçekte 4-göz onay + kontrol) ≠ demo.
- **J. Öneri:** Demoyu gerçekle hizalayın (durum seti); temizliği Hazırlık denetimine taşıyın.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `schema.ts` `MAINTENANCE_STATUSES`, `d/pages/fleet/MaintenancePage.tsx`, senaryo 6.

#### 10 · Olay Merkezi — öncelik **P2** (birleştirme adayı)
- **A. Amaç:** Manuel vaka yönetimi (müşteri şikayeti, arıza, kayıp anahtar, ihtilaflı teslim…).
- **B. Kullanıcı:** Yönetici, resepsiyon; haftalık/aylık.
- **C. Mevcut (demo):** 5 tür (Kaza, Arıza, Hırsızlık/kayıp, Şikayet, Güvenlik), önem, sorumlu, durum, kaynak bağlama. *Gerçek:* yok.
- **D. Eksik:** Şartname 8 kategori (yol yardım, kayıp anahtar, ihtilaflı teslim, servis kalitesi ayrı) — demo 5.
- **E. Yüzeysel:** "Kaza" ile "Hasar kaydı" arasındaki yönlendirme yok.
- **F. Düşük değer:** Çözüldü ≠ Kapalı iki adım.
- **G. Çakışma:** **Hasar Kayıtları, Ceza Modülü, Bakım, Görevler** — bir kaza dört ayrı kayıt gerektirebilir.
- **H. İş akışı:** "Kaza yaşandı" → kullanıcı hangi ekrandan başlayacağını bilmiyor (Olay mı, Hasar mı?) [Ö].
- **I. Gerçek fark:** Yok.
- **J. Öneri:** Tek "Olay bildir" giriş noktası (araç/kiralama bağlamından): olay + gerekiyorsa hasar/ceza/görev oluşturan seçim; ayrı menüler kalır (E.4).
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] `d/pages/fleet/IncidentsPage.tsx`, anatomi. [Ö] yanlış yerde kayıt riski.

#### 11 · Hasar Kayıtları — öncelik **P1**
- **A. Amaç:** Hasar bulgusu → sorumluluk → (müşteri ücreti) → kapanış; onarım bağlı bakımdan.
- **B. Kullanıcı:** Yönetici, filo sorumlusu.
- **C. Mevcut:** *Gerçek:* bulgu, fotoğraf, olaylar, **araç engeli (damage block) + dört göz engel kaldırma**, kiralama 360 hasar sekmesi. Sorumluluk/ücret/sigorta **bilerek yok**. *Demo:* sorumluluk (müşteri/şirket/sigorta), tahmin, engel, müşteri ücreti bir kez.
- **D. Eksik:** Gerçekte sorumluluk + müşteriye yansıtma + sigorta dosyası. Demoda sigorta dosyası kaydı (§59BD) yok, yalnız "sigorta" sorumluluk seçeneği.
- **E. Yüzeysel:** Demoda hasar ücreti "otomatik değil" ama sigorta paketi muafiyeti ile ilişki sadece açıklama.
- **F. Düşük değer:** Belirgin düşük değerli parça saptanmadı.
- **G. Çakışma:** Olay Merkezi, Bakım (onarım), Finans (hesap kalemi).
- **H. İş akışı:** Araç engelini kaldırma **gerçekte dört göz** (talep + ikinci yetkili onayı); **demoda tek yetkiyle** (`unblockVehicle` yalnız `damages:unblock` ister, ikinci onay yok) [D]. Demo, gerçekte olmayacak kadar kolay bir yol gösteriyor.
- **I. Gerçek fark:** Gerçek güvenlik modeli daha sıkı; demo hasar yaşam döngüsü daha geniş.
- **J. Öneri:** Gerçekte sorumluluk + tek müşteri hesap kalemi ekleyin (P1); sigorta dosyasını V2'ye alın.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `api/modules/operations/damage.ts` başlık yorumu, BHT raporu §5/§C, `d/pages/fleet/DamagesPage.tsx`.

#### 12 · Ceza Modülü — öncelik **P2**
- **A. Amaç:** Trafik cezası kaydı → kiralamaya eşleme → sorumluluk → otoriteye ödeme ayrı, müşteri tahsilatı ayrı.
- **B. Kullanıcı:** Yönetici/muhasebe, aylık düzen.
- **C. Mevcut (demo):** kayıt, resmi referans (tekil), araç, tarih, kiralama önerisi, tutar, durum, otorite ödemesi, müşteri hesap kalemi. *Gerçek:* yok.
- **D. Eksik:** E-tebligat/ceza içe aktarma yok (doğru), itiraz süreci yok.
- **E. Yüzeysel:** Ceza türü listesi sabit 5.
- **F. Düşük değer:** Menü olarak küçük işletme için seyrek; Hasar/Olay ile aynı menü grubunda "Kayıtlar" gibi davranabilir.
- **G. Çakışma:** Hasar, Olay, Masraflar (otorite ödemesi gider).
- **H. İş akışı:** Tarih örtüşmesi önerisi iyi; kullanıcı onaylamadan atama yok.
- **I. Gerçek fark:** Tam eksik.
- **J. Öneri:** Gerçekte Hasar ve Finans sonrası; "Olay bildir" sihirbazının bir türü olarak ele alın.
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] `d/pages/fleet/FinesPage.tsx`, `api/src` `fine` yok.

---
### B.3 MÜŞTERİ VE TİCARİ (6)

#### 13 · Müşteriler — öncelik **P0**
- **A. Amaç:** Kimlik, iletişim, belge geçerliliği, geçmiş ve borç — rezervasyon/kiralamanın önkoşulu.
- **B. Kullanıcı:** Resepsiyon (günlük, en sık arama), yönetici, muhasebe (cari).
- **C. Mevcut:** *Gerçek (M2):* şifreli belge kaydı ve dosyaları, belge numarasını **yetkili/izli açma** (`reveal-number`, deneme sınırı), yerli/yabancı yalnızca personel kararı, ülke belge kuralları, mükerrer kontrol, 360° (genel, belgeler, kiralamalar, rezervasyonlar, cari, geçmiş). *Demo:* liste (ülke, ikamet, belge, kısıt filtreleri), 360° (Özet, Rezervasyon ve kiralamalar, Belgeler, Notlar ve iletişim, Finans, Kişisel veri), kısıt ("kara liste" anlamı, gerekçeli), iletişim kaydı, notlar, GDPR talep kaydı, rol bazlı maskeleme.
- **D. Eksik:** **Mükerrer birleştirme** (§59BT): demoda var ("Başka kayıtla birleştir", `mergeCustomers`), gerçekte yalnız şema alanları ayrılmış (`merged`, `mergedIntoId` "M5/M6 için ayrıldı") ama işlem yok [D]. **Hızlı müşteri** (yalnız ad + telefon) yok: demo formu 9 alan, 3'ü zorunlu (ad, telefon, doğum tarihi) [D].
- **E. Yüzeysel:** Demoda belge "ekle" yalnız tür + geçerlilik tarihi (dosya yok, bilinçli); gerçekte tam.
- **F. Düşük değer:** Demoda "Kişisel veri" sekmesi (GDPR talep/erişim kaydı) V1'de hukuk kararı olmadan anlam taşımıyor [Ö].
- **G. Çakışma:** Kurumsal Hesaplar (sürücü kişileri), Talep Merkezi (lead → müşteri), Belge Merkezi.
- **H. İş akışı:** Yürüyen müşteri (walk-in) için *en az alan* yolu gerekli; telefonla gelen müşteri için "ad + telefon → rezervasyon" 2 alanla başlayabilmeli, belge teslimde tamamlanabilir (şartname §9.2: "Eksik belge rezervasyonu engellemez").
- **I. Gerçek fark:** Gerçek, güvenlik ve hukuk açısından **demodan çok ileride** (şifreleme, erişim izi); demo daha geniş ama sahte.
- **J. Öneri:** Hızlı müşteri formu (ad, telefon, e-posta opsiyonel; doğum tarihi ve ehliyet teslimde); gerçekte mükerrer birleştirme V1.5; GDPR sekmesi hukuk kararı gelene kadar V2 (K bölümünde).
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `w/customers/*`, M2 raporu, `d/pages/customers/CustomersPage.tsx` (`NewDialog` alan listesi). [Ö] hızlı müşteri.

#### 14 · Kurumsal Hesaplar — öncelik **P1**
- **A. Amaç:** Ayrı ticari ödeyen varlık: sözleşmeli şirket, para birimi başına kredi limiti, ekstre.
- **B. Kullanıcı:** Muhasebe, yönetici; orta/büyük işletme.
- **C. Mevcut:** *Gerçek (M3):* vergi numaraları (uluslararası), adresler, iletişim kanalları, **kişiler (müşteri kaydına bağlı sürücüler)**, kiralama/rezervasyon/cari listeleri. *Demo:* + kredi limiti ve maruziyet (para birimi başına), ekstre, kredi istisnası talebi (onay), sürücüler.
- **D. Eksik:** **Gerçekte kredi limiti/maruziyet hiç yok** (`credit` kodda yok) — şartname §17'nin çekirdeği. Kurumsal fiyat anlaşması gerçekte uygulanmıyor (`notApplied: corporate_agreement`).
- **E. Yüzeysel:** Demoda ekstre = rapor tablosu, mutabakat (§59CC) yok.
- **F. Düşük değer:** Maruziyet formülü (taahhüt edilmiş + kesilmemiş tutar, §17) çok katmanlı; küçük işletme için "açık bakiye + limit" yeterli [Ö].
- **G. Çakışma:** Müşteriler (kişi), Finans (alacak), Onay Merkezi (limit istisnası).
- **H. İş akışı:** Limit aşımı → onay isteği → ikinci kullanıcı → uygula (demoda çalışıyor); gerçekte yok.
- **I. Gerçek fark:** Kurumsal hesabın *kimlik* tarafı gerçekte güçlü, *ticari* (kredi/fiyat) tarafı eksik.
- **J. Öneri:** Gerçekte önce basit "açık bakiye + isteğe bağlı tek limit"; tam maruziyet formülü ve ekstre mutabakatı V1.5.
- **K. Öncelik:** P1 (kredi limiti), P3 (mutabakat).
- **L. Kanıt:** [D] `w/corporate/*`, M3 raporu, `api` içinde `credit` yok, `pricing/repository.ts:174` `notApplied`, `d/pages/customers/CorporatePages.tsx`.

#### 15 · Talep Merkezi — öncelik **P2**
- **A. Amaç:** Lead → versiyonlu teklif → kabul → rezervasyon; teklif ≠ rezervasyon.
- **B. Kullanıcı:** Satış/yönetici; küçük işletmede çoğunlukla telefon+WhatsApp (sistem dışı).
- **C. Mevcut (demo):** Talepler (10) + Teklifler (5) sekmeleri, durum filtresi, yeni talep, teklif hazırla/yeni sürüm (eski korunur), kabul → bekleyen rezervasyon + müşteri kaydı, hatırlatma, kayıp nedeni. *Gerçek:* yok. (Gerçekte "teklif" **fiyat anlık görüntüsü**dür, satış teklifi değildir.)
- **D. Eksik:** Teklifi müşteriye gönderme yok (bilinçli); PDF teklif çıktısı yok.
- **E. Yüzeysel:** "Gönderildi" durumu gerçek gönderim değil kayıt (doğru etiketleniyor).
- **F. Düşük değer:** Hatırlatma ve iletişim kaydı, Görev + Müşteri notu ile aynı iş.
- **G. Çakışma:** Rezervasyon (pending), Görevler (hatırlatma), Müşteri iletişim geçmişi, **Partnerler** (partner lead'i).
- **H. İş akışı:** Küçük işletme için "talep → rezervasyon" doğrudan rezervasyon formunda daha kısa; Talep Merkezi ek bir aşama. 9 eylem (senaryo 7).
- **I. Gerçek fark:** "Teklif" kelimesi **iki farklı kavramı** adlandırıyor (gerçek: fiyat dondurma; demo: satış teklifi) → entegrasyonda ad ve model çakışır [D].
- **J. Öneri:** Terimi ayırın (Fiyat Teklifi/Fiyat Kaydı vs Satış Teklifi); gerçekte, Rezervasyonun "talep kaynağı" alanı + not ile başlayın; Talep Merkezi'ni V1.5 yapın.
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] `d/pages/customers/LeadsPage.tsx`, `price_quotes` (schema), FIYAT raporu §1. [Ö] getiri.

#### 16 · Partnerler — öncelik **P3**
- **A. Amaç:** Müşteri yönlendiren dış taraf; komisyon hak ediş (Delivered) ve ödeme ayrımı.
- **B. Kullanıcı:** Yönetici/muhasebe; yalnız partner çalışan şirketler.
- **C. Mevcut (demo):** liste (tür, komisyon, ödenmemiş komisyon, portal, durum), komisyon tetikleyicisi, komisyon düzeltme onayı, ödeme kaydı. *Gerçek:* yalnız rezervasyonda `source = partner` değeri.
- **D. Eksik:** Partner performans ekranı (§59BJ) yok.
- **E. Yüzeysel:** Komisyon ödemesi kayıt; finans ekstrası yok.
- **F. Düşük değer:** Portal erişim yönetimi + komisyon düzeltme onayı + performans, çoğu işletme için V1 dışı.
- **G. Çakışma:** Talep Merkezi, Finans (komisyon yükümlülüğü), Partner Portalı.
- **H. İş akışı:** Kazanma tetikleyicisinin üç seçenekli ayarı (Delivered/Closed/Financially Closed) küçük ayar yükü.
- **I. Gerçek fark:** Tam eksik.
- **J. Öneri:** V2. Ertelenmesi gerçek ürünün çekirdeğini etkilemez.
- **K. Öncelik:** P3.
- **L. Kanıt:** [D] `schema.ts:1075` `reservations_source_check`, `d/pages/customers/PartnersPage.tsx`.

#### 17 · Araç Tedarikçileri — öncelik **P3**
- **A. Amaç:** Başka şirketten geçici araç alıp müşteriye kiralamak (alt-kiralama): talep → teklif → görevlendirme → teslim al/geri ver → mutabakat.
- **B. Kullanıcı:** Yönetici/muhasebe; sezon zirvesinde.
- **C. Mevcut (demo):** 4 sekme (Tedarikçiler, Araç talepleri, Görevlendirmeler, Mutabakat), dış araç ana kaydı, teslim alma/iade incelemesi, tedarikçi ödemesi. *Gerçek:* yok (`supplier` yalnız konum türü).
- **D. Eksik:** Tedarikçi performansı (§59BK), tedarikçi depozitosu, belge zorunluluğu hattı.
- **E. Yüzeysel:** Dış araç engagement penceresi + "teslim alındı" ayrımı gerçek kural, ama gerçek rezervasyon/kiralama tarafı bu kapasiteyi okumuyor.
- **F. Düşük değer:** **Bütün alt-kiralama alanı (§59U–§59AD ≈ 425 satır) V1 için yüksek maliyet, dar kitle.**
- **G. Çakışma:** Araçlar (Internal/External rozeti), Kapasite, Finans.
- **H. İş akışı:** Dört nesne (talep, teklif, görevlendirme, mutabakat) ve 3 ayrı ödeme/borç kavramı — karmaşık.
- **I. Gerçek fark:** Tam eksik; mevcut müsaitlik motoru dış araç penceresini bilmiyor (`vehicle-allocation.ts`).
- **J. Öneri:** V2'ye alın; V1'de "dış araç" yerine araçta basit "geçici/kiralık" notu. Menüyü kaldırmak şartname revizyonu ve sizin kararınız gerektirir.
- **K. Öncelik:** P3.
- **L. Kanıt:** [D] spec 3094–3520, `d/pages/customers/SuppliersPage.tsx`, `api/src/lib/vehicle-allocation.ts`.

#### 18 · Fiyatlandırma — öncelik **P0**
- **A. Amaç:** Tek fiyat hattı: sınıf tarifesi, sezon, kademe, ekstralar, indirim, vergi, (sigorta); teklifler dondurulur.
- **B. Kullanıcı:** Sahip/yönetici (haftalık–aylık), resepsiyon (önizleme).
- **C. Mevcut:** *Gerçek:* fiyat listeleri (ISO para birimi, şube, geçerlilik, öncelik), **her kayıt yeni değişmez revizyon**, sınıf tarifeleri (1–6/7–29/30+), sezon, ekstralar, indirim (teklif başına tek), vergi (oran tahmin edilmez), deterministik motor `pe-1`, teklif kaydı (409 fiyat değişti), sözleşme şablonları. *Demo:* 9 sekme: Baz tarifeler, Sezonlar, Süre kademeleri, Kurumsal anlaşmalar, Ekstralar, Sigorta paketleri, Vergi, Simülasyon, Revizyonlar.
- **D. Eksik:** *Gerçek:* kurumsal anlaşma, tek yön, km, **sigorta paketi** uygulanmıyor (`notApplied`). Her ikisinde: fiyat simülasyonu çıktı olarak yazdırma yok.
- **E. Yüzeysel:** Demoda sezon takvimi tablo (görsel takvim yok, §59BH).
- **F. Düşük değer:** Demoda "Süre kademeleri" ayrı sekme (tablo olarak baz tarife içinde).
- **G. Çakışma:** **Ayarlar** — demoda vergi ve sigorta Fiyatlandırma'da, "Süre ve ücret kuralları" Ayarlar'da; şartname §74/§82.8 vergi ve sigortayı Ayarlar'a koyar → **demo şartnameden ve kendi içinde ayrışmış** [D].
- **H. İş akışı:** Simülasyon doğru yerde; fakat politikayı (gün sayma yöntemi) nerede değiştireceğini kullanıcı bilemez.
- **I. Gerçek fark:** Gerçekte "gün yöntemi her listede seçilmeli, varsayılan yok" (F1); demoda varsayılan takvim günü.
- **J. Öneri:** Politika sahipliği tek harita: **fiyat verisi = Fiyatlandırma; politika ayarı = Ayarlar** (vergi/sigorta/süre politikası bağlantılı); sigorta paketini gerçekte fiyat hattına bağlamayı P1 yapın (Balkan pazarında CDW/SCDW sık) [Ö].
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `pricing/repository.ts:174`, FIYAT raporu §1/F1, `d/pages/customers/PricingPage.tsx:40-41`, `SettingsPage.tsx:16-27`.

### B.4 KONTROL VE ANALİZ (8)

#### 19 · Onay Merkezi — öncelik **P1**
- **A. Amaç:** Altı resmi onay türü; dört göz; Onaylandı ≠ Uygulandı.
- **B. Kullanıcı:** Sahip/yönetici (günlük kuyruk).
- **C. Mevcut (demo):** 4 görünüm (Karar bekleyen, Onaylı-uygulanacak, Tamamlanan, Tümü), tür filtresi (6 tür), talep → onay/ret → uygula, gerekçe/aktör/zaman. *Gerçek:* **merkez yok**; onay benzeri akışlar kendi ekranlarında: engel kaldırma, hesap kalemi, kalem ters kaydı, tahsilat doğrulama, depozito doğrulama, iade onayı, ödeme sorumlusu düzeltmesi, bakım planı onayı.
- **D. Eksik:** Tek "bekleyen işlerim" kuyruğu **gerçekte yok**; demoda 6 tür var ama gerçekte onay tipleri ayrı.
- **E. Yüzeysel:** Demoda uygulama = durum değişimi, gerçek kaynak mutasyonu sınırlı türler için.
- **F. Düşük değer:** "Tamamlanan" ve "Tümü" ayrı sekme.
- **G. Çakışma:** Gerçek üründe 8+ ayrı dört-göz akışı (A.2 #6); şartname §21 "yalnız 6" der → **gerçek ürün şartname modelinden bilinçsiz sapmış**.
- **H. İş akışı:** Yönetici "bana düşenler"i tek yerden göremiyor.
- **I. Gerçek fark:** Büyük (A.2 #6).
- **J. Öneri:** **Tek "Bekleyen işlerim" kuyruğu** (altı resmi tür + operasyonel dört-göz adımları ayrı etiketle, her biri kendi ekranında işlem). Şartnamenin "7. onay türü icat etme" yasağıyla uyumlu: yeni tür değil, **birleşik inbox**.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `d/pages/control/ApprovalsPage.tsx`, `dashboard` etiketleri, FINANS raporu §3/§4, BHT §5, schema onay tabloları, spec §21 "Approval vocabulary boundary".

#### 20 · Kurallar — öncelik **P3**
- **A. Amaç:** Güvenli IF/AND/OR/THEN uyarı/bayrak kataloğu; sert politikaları geçersiz kılamaz.
- **B. Kullanıcı:** Sahip, nadir.
- **C. Mevcut (demo):** 6 kural, koşul/eylem/önem/sürüm/durum, yeni kural, önizleme. *Gerçek:* yok.
- **D. Eksik:** Gerçek arka plan işi yok (doğru; önizleme).
- **E. Yüzeysel:** Eylem yalnız uygulama içi uyarı/bayrak.
- **F. Düşük değer:** İşletme sahiplerinin çoğu kural oluşturucu kullanmaz; sabit uyarı eşikleri (Ayarlar → Bildirimler) çoğu ihtiyacı karşılar [Ö].
- **G. Çakışma:** Ayarlar (bildirim eşikleri), Uyarılar.
- **H. İş akışı:** Kural → uyarı → hangi ekranda gözükür belirsiz.
- **I. Gerçek fark:** Tam eksik.
- **J. Öneri:** V2; V1'de sabit eşikler. Menü kaldırma kararı sizin.
- **K. Öncelik:** P3 (öneri: P4'e yakın).
- **L. Kanıt:** [D] `d/pages/control/RulesPage.tsx`, anatomi. [Ö] kullanım değerlendirmesi.

#### 21 · Gelir Kontrolü — öncelik **P4 → yeniden tasarla**
- **A. Amaç:** Gelir kaçağı / eksik tahsilat anomalisi (şartname: şüpheli indirim, eksik tahsilat, beklenmeyen boşluk, depozito uyumsuzluğu).
- **B. Kullanıcı:** Sahip, muhasebe.
- **C. Mevcut (demo):** aylık hesaplanan–tahsil edilen grafik (para birimi seçimli) + **9 "mutabakat kontrolü".** *Gerçek:* yok.
- **D. Eksik:** **Şüpheli indirim yok, gecikme/km/yakıt ücreti uygulanmamış iade yok, yaşlandırılmış alacak yok, depozito iade gecikmesi yok.**
- **E. Yüzeysel:** Kontrollerin **6'sı sistemin kendi değişmezleri** (çift kalem, kasa hareketi eksik, nakit dışı ödeme kasada, depozito gelir sayıldı, iptal kaleme ödeme…; bunlar mimari olarak olamaz); 3'ü gerçek iş durumu (fazla ödeme, uygulanmamış ödeme, operasyonel kapalı/finans açık). Depozito kontrolü `payer.name === 'Depozito mahsubu'` **metin eşlemesine** dayanıyor (kırılgan).
- **F. Düşük değer:** Test niteliğindeki kontroller kullanıcıya "her şey yolunda" izlenimi verir → **sahte güvence** (§23 "factual source" ilkesiyle çelişmez ama değer üretmez).
- **G. Çakışma:** Raporlar (Gelir/Tahsilat), Finans (Açık bakiyeler), Riskler (uyarılar), Masraflar.
- **H. İş akışı:** Satırdan kaynağa gitmek çalışıyor.
- **I. Gerçek fark:** Gerçekte bu değişmezler veritabanı kısıtı; ekran gerekmez.
- **J. Öneri:** Değişmez kontrollerini **kaldırmak yerine test çıktısı olarak ekrandan ayırın** (karar sizin); yerine 4 gerçek sinyal: (1) indirimli kiralamalar, (2) iadede gecikme/km/yakıt farkı olup kalemi olmayan, (3) 30+ gün açık alacak, (4) 14+ gün açık depozito. Ayrı menü yerine **Finans → "Dikkat" sekmesi** (şartname revizyonu gerekir).
- **K. Öncelik:** P4 (mevcut içerik) / P2 (yeniden tasarlanmış sinyaller).
- **L. Kanıt:** [D] `d/pages/analytics/RevenuePage.tsx` `checksOf()` (9 `key:`), spec §23.

#### 22 · Riskler ve İstisnalar — öncelik **P2**
- **A. Amaç:** Deterministik operasyonel risk analizi (Riskler) + sistem tespitli istisna inceleme (İstisnalar).
- **B. Kullanıcı:** Yönetici/sahip.
- **C. Mevcut (demo):** 2 sekme: Riskler (30, önem ve modül filtreli) ve İstisnalar (4, inceleme kararı). *Gerçek:* yok.
- **D. Eksik:** Risk satırı için "sorumlu/erteleme" yok.
- **E. Yüzeysel:** "İstisna incele" kararı kaynağı değiştirmez; yalnız not.
- **F. Düşük değer:** **Riskler sekmesi = Komuta Merkezi "Uyarılar" ile aynı 30 kayıt.**
- **G. Çakışma:** Komuta Merkezi, Ana Ekran, Gelir Kontrolü.
- **H. İş akışı:** Aynı uyarının üç yerde farklı arayüzle görünmesi.
- **I. Gerçek fark:** Gerçek yok.
- **J. Öneri:** **Riskler sekmesini Uyarılar ile birleştirin;** İstisnalar (insan incelemesi) ayrı kalsın. 
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] anatomi sayıları (Uyarılar 30 = Riskler 30), `d/pages/control/RisksPage.tsx`.

#### 23 · Kapasite Planlama — öncelik **P2**
- **A. Amaç:** Şube × sınıf × gün kapasite ve talep matrisi.
- **B. Kullanıcı:** Yönetici/sahip (orta/büyük).
- **C. Mevcut (demo):** matris (7/14/30 gün), şube/sınıf filtresi, bekleyen rezervasyonlar ayrı ("kapasite tutmaz"). *Gerçek:* yok.
- **D. Eksik:** Kayıp talep (bekleme listesi/teklif) yok; tahmin yok (doğru).
- **E. Yüzeysel:** Matris sayıları sınıf-only talebi kapasiteden düşer — gerçek üründe sınıf-only onay olmadığı için (R1) bu mantık gerçekte kullanılamaz.
- **F. Düşük değer:** Küçük işletmede (tek şube, 10–20 araç) gereksiz.
- **G. Çakışma:** Takvim, Araç 360° Müsaitlik, Filo Analizi.
- **H. İş akışı:** Sıkışan günden doğrudan rezervasyona geçiş yok.
- **I. Gerçek fark:** Gerçek müsaitlik motoru sınıf kapasitesini "bilgi" olarak gösterir (R1); matris gerçek kuralla çelişir.
- **J. Öneri:** Takvim/zaman çizelgesinin "kapasite" modu olarak (E.2); sınıf-only kararı (K-3) netleşince.
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] `d/pages/analytics/CapacityPage.tsx`, REZERVASYON raporu R1.

#### 24 · Filo Analizi — öncelik **P2**
- **A. Amaç:** Araç başına kullanım, boşta, bakım ve hasar süresi, gelir.
- **B. Kullanıcı:** Sahip, filo sorumlusu (aylık).
- **C. Mevcut (demo):** dönem (7/30/90), şube/sınıf filtresi, araç satırları (kiralanma %, kiralama, km, bakım saati, hasar bloğu saati, boşta saat, kiralama geliri), sınıf ortalaması grafiği. *Gerçek:* yok.
- **D. Eksik:** Araç başına **toplam maliyet** (bakım+ceza+hasar) ve brüt katkı (aynı para biriminde) yok; geçmiş dönem karşılaştırması yok.
- **E. Yüzeysel:** "Kiralama geliri" hesaplanan kalem (tahsilat değil) — etiketli.
- **F. Düşük değer:** Grafik/Tablo anahtarı.
- **G. Çakışma:** Araç 360° "Finans ve performans" sekmesi (araç bazında aynı sayılar), Raporlar → Araç kullanımı. **Üç yerde aynı sayı.**
- **H. İş akışı:** Araç → 360 → geri; filtreler korunuyor (senaryo 4).
- **I. Gerçek fark:** Yok.
- **J. Öneri:** Raporlar altında "Filo" ailesi olarak sunun; ayrı menü yerine; araç başına maliyet ekleyin (sahip için en değerli).
- **K. Öncelik:** P2.
- **L. Kanıt:** [D] `d/pages/analytics/FleetAnalysisPage.tsx`, anatomi sütunları, senaryo 4 testi.

#### 25 · Fırsatlar — öncelik **P4**
- **A. Amaç:** Deterministik "yapılabilir iş" önerileri.
- **B. Kullanıcı:** Yönetici, nadir.
- **C. Mevcut (demo):** önerinin 7 türü: onaylanabilir rezervasyon, bekleme listesi eşleşmesi, araç atanabilir, süresi dolacak teklif, atıl araç, sigorta önerisi (hazırlanan kiralamada sigorta seçilmemiş), takip zamanı gelen müşteri. *Gerçek:* yok.
- **D. Eksik:** Hepsi başka ekranların filtresi.
- **E. Yüzeysel:** "Atıl araç" yalnız bilgi.
- **F. Düşük değer:** Türlerin tamamı mevcut listelerdeki filtre veya Görev olabilir; ayrı menü değeri düşük.
- **G. Çakışma:** Rezervasyonlar, Talep Merkezi, Filo Analizi, Komuta.
- **H. İş akışı:** Önerinin "yap" düğmesi ilgili formu önden dolu açar (iyi), ama kullanıcı tek tek açmalı.
- **I. Gerçek fark:** Yok.
- **J. Öneri:** Ayrı menü olarak ertele (V2); "sigortasız kiralama" ve "süresi dolacak teklif" Ana Ekran'da tek satır uyarı olabilir.
- **K. Öncelik:** P4.
- **L. Kanıt:** [D] `d/pages/analytics/OpportunitiesPage.tsx` satır 35–49.

#### 26 · Raporlar — öncelik **P1**
- **A. Amaç:** Kaynak temelli, canlı türetilmiş 8 rapor ailesi; tablo her zaman var.
- **B. Kullanıcı:** Sahip, muhasebe (gün sonu/ay sonu).
- **C. Mevcut (demo):** 8 rapor: Kiralama özeti, Gelir (hesaplanan), Tahsilat ve bakiye, Araç kullanımı, Müşteriler, Bakım ve hasar maliyeti, Kasa oturumları, Partner; dönem + şube filtresi; CSV; yazdır. *Gerçek:* **yok** (CSV dışa aktarma da yok).
- **D. Eksik:** Şartnamenin 8 ailesinden **Şube, Kurumsal, Ticari (dönüşüm, no-show oranı)** yok; **gün sonu kapanış özeti** yok.
- **E. Yüzeysel:** Rapor başına tek tablo, grafik yok; "sahibin gün sonu için gerçekten ihtiyaç duyduğu" 3 rapor ayrı seçilmeli.
- **F. Düşük değer:** Partner raporu (partner yoksa boş).
- **G. Çakışma:** Gelir Kontrolü, Filo Analizi, Finans özetleri.
- **H. İş akışı:** Dönem seçip rapor açmak 3 eylem; iyi.
- **I. Gerçek fark:** **Tam eksik; üç sahip sorusu (günlük tahsilat, alacak, araç kullanımı) için gerçekte hiçbir rapor yok** (Finans merkezi sayıları dışında).
- **J. Öneri:** V1 çekirdek 3 rapor: **Günlük kasa/tahsilat**, **Açık alacak (yaşlandırma)**, **Araç kullanımı**; gerisi V1.5. Filo Analizi ve Gelir Kontrolü'nü bu çatı altına alın.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `d/pages/analytics/ReportsPage.tsx` (8 `id:`), `api` içinde rapor modülü ve CSV yok.

---
### B.5 FİNANS (3)

#### 27 · Finans — öncelik **P0**
- **A. Amaç:** Tahsilat, açık bakiye, depozito ve iadenin tek merkezi; para birimleri asla toplanmaz.
- **B. Kullanıcı:** Muhasebe, sahip; resepsiyon (ödeme alma).
- **C. Mevcut:** *Gerçek:* kiralama başına finans dosyası (açık → kapalı → yeniden açık), hesap kalemi (onay bekliyor → **başka yetkili onaylar** → kayıtlı; ters kayıt dört göz), tahsilat (kaydedildi → **başka yetkili doğrular**; nakit beyanı, harici referans, kart numarası benzeri referans reddi), depozito (talep → bildirildi → doğrulandı), depozito iadesi (talep → onay → bildirildi), ödeme sorumlusu düzeltmesi (FN5), finans merkezi (para birimi kartları, bekleyen doğrulamalar, listeler, olay geçmişi), Müşteri/Kurumsal "Cari". *Demo:* 7 sekme (Açık bakiyeler, Ödemeler, Hesap kalemleri, Kaparo, Depozitolar, İadeler, Kurlar), çok kişi/çok yöntem/çok para birimi ödeme, kur anlık görüntüsü, kaparo yaşam döngüsü, depozito mahsubu, iade onayı.
- **D. Eksik:** *Demo:* şartnamenin 10 görünümünden **ödeme planları, tedarikçi borçları, partner komisyonları, kurumsal cari, vergi dökümü sekmeleri yok** (bazıları başka ekranlarda); `paymentPlans` modelde ve uyarıda var ama **oluşturma/görüntüleme arayüzü yok** [D]. *Gerçek:* kaparo, çok para birimi, depozito mahsubu, ödeme planı, kasa, gecikme/km/yakıt ücreti (FN3–FN7).
- **E. Yüzeysel:** Demoda "Kalanı öde" ve kur önizlemesi güçlü; **banka mutabakatı** hiçbirinde yok (bilinçli).
- **F. Düşük değer:** Demoda hem "Ödemeler" hem "Açık bakiyeler" hem Kiralama 360° "Finans" aynı kaynağı üç kez gösterir.
- **G. Çakışma:** Masraflar, Şube Kasaları, Gelir Kontrolü, Raporlar (Gelir/Tahsilat), Kurumsal Hesap ekstreleri — **aynı tutarlar beş yerde** (şartnamenin "ikinci editable truth yok" ilkesine uyuyor ama okuyucu için yineleme).
- **H. İş akışı:** Demo ödemesi tek adım (kaydet=uygula); gerçekte iki kişi, iki adım (kaydet → başkası doğrular). **Resepsiyonist, müşteri karşısında "alındı" diyemez** (gerçek modelde bakiye düşmez). Küçük işletmede ikinci yetkili yoksa akış durur (A.2 #7).
- **I. Gerçek fark:** **Ana çelişki** (A.2 #2): iki farklı finans davranışı. Demo "Recorded ≠ Applied" ayrımını kullanır, gerçek "Kaydedildi ≠ Doğrulandı" ayrımını kullanır — **iki ayrı kavram**, şartname ikisini de ister (§64.2 mahsup, ve sizin ek kuralınız "Tahsilat kaydı ≠ Doğrulanmış ödeme").
- **J. Öneri:** **Tek finans modeli seçin:** önerim — gerçek modeli (kaydet → doğrula → uygula) taban alın, demo ödeme akışını bu üç duruma getirin; **doğrulama zorunluluğunu ölçeğe göre ayarlanabilir** yapın (tek kişilik işletmede "kendi onayı + sahibe rapor"). Çok para birimi, kaparo, depozito mahsubu gerçekte **ayarla açılan** modüller olsun (Ayarlar → Ödeme politikası). Demodaki 7 sekmeyi 5'e indirin: Açık bakiyeler, Tahsilatlar (+kaparo), Depozito ve iade, Hesap kalemleri, Kurlar (yalnız okuma).
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] FINANS raporu §1–§5/§19–§20, `d/pages/finance/FinancePage.tsx`, `d/core/types.ts` `Payment.status`, anatomi (sekme listesi), `grep paymentPlans pages ui` = 0, spec §82.6.

#### 28 · Masraflar — öncelik **P1**
- **A. Amaç:** Operasyonel gider defteri; kaynak-bağlı giderler kilitli, çift sayım yok.
- **B. Kullanıcı:** Muhasebe, yönetici.
- **C. Mevcut (demo):** liste (kategori, durum, arama), taslak → kaydedildi → iptal, kaynak bağlama (bakım, ceza), nakit ödenen gider açık kasadan çıkar, 9 kategori. *Gerçek:* yok (bakım maliyeti bakım kaydında).
- **D. Eksik:** **Giderde araç alanı yok** (`Expense` tipi: kategori, alıcı, şube, tarih, tutar, durum, kaynak; `vehicleId` yok) → yakıt, sigorta primi, temizlik gibi elle girilen giderler **araca atfedilemez**; sahibin "hangi araçlar masraf çıkarıyor?" sorusu yalnız bakım/ceza kaynaklı kayıtlar için yanıtlanabilir [D].
- **E. Yüzeysel:** Fatura/fiş eki yok (V1'de dosya yok, bilinçli).
- **F. Düşük değer:** "Personel dışı genel gider", "Kira ve işletme" gibi muhasebe nitelikli kategoriler (§51: tam muhasebe defteri hedef değil).
- **G. Çakışma:** Bakım (kaynak maliyet), Ceza (otorite ödemesi), Finans, Raporlar.
- **H. İş akışı:** Bakım tamamlanınca kaynak-bağlı gider **kendiliğinden "kaydedildi" ve kilitli** oluşur (çift sayım yok) [D] — iyi. Buna karşılık yakıt/sigorta primi/temizlik gibi elle girilen gider araca bağlanamaz (D'ye bakın).
- **I. Gerçek fark:** Tam eksik; bakım maliyeti zaten bakım kaydında.
- **J. Öneri:** Gerçeğe taşımadan önce **araç + (varsa) kiralama alanı** ekleyin; kategorileri 5–6'ya indirin; araç başına maliyet tek kaynak.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `d/core/types.ts` `Expense`, `EXPENSE_CATEGORIES` (9), `d/pages/finance/ExpensesPage.tsx`.

#### 29 · Şube Kasaları — öncelik **P1** (nakit ağırlıklı pazarda P0)
- **A. Amaç:** Şube ve para birimi başına fiziksel nakit, vardiya oturumu, sayım, fark, devir; kart/havale kasaya girmez.
- **B. Kullanıcı:** Şube yöneticisi/resepsiyon (her vardiya), muhasebe (kapanış).
- **C. Mevcut (demo):** 6 kasa (SJJ EUR/BAM/USD, MST BAM/EUR, DBV EUR), oturum aç (açılış bakiyesi), hareket ekle (gerekçeli), kasayı kapat (sayılan, fark, devir), oturum geçmişi (9). *Gerçek:* yok.
- **D. Eksik:** Fark eşiği ayarı demoda var; "gün sonu kapanış raporu" yok.
- **E. Yüzeysel:** Vardiya = kasa oturumu; **çalışan vardiyası** ayrı kavram ve arayüzü yok (`shifts` kullanılmıyor).
- **F. Düşük değer:** Çok para birimi kasası (USD) yalnız o para birimini kabul eden işletmeler için.
- **G. Çakışma:** Finans (nakit tahsilat), Masraflar (nakit gider), Komuta Merkezi Vardiya Devri.
- **H. İş akışı:** Senaryo 8: oturum açma → hareket → sayma → kapama ≈ 15 eylem; mantıklı. Kapalı kasada nakit ödemenin reddedilmesi açık hata mesajıyla (iyi).
- **I. Gerçek fark:** Tam eksik; **gerçekte nakit "beyan" olarak kaydediliyor**, kasa defteri yok → Finans raporu: "Şube Kasaları ... bu sprintte yok (FN7)".
- **J. Öneri:** Gerçekte tahsilat modelinden **sonra** (Finans doğrulama + kasa tek akış olarak); vardiya devrini kasa oturumuna bağlayın (ayrı Vardiya Devri ekranı gerekmez).
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `d/pages/finance/CashPage.tsx`, FINANS raporu FN7, `api` içinde `drawer` yok.

### B.6 KAYITLAR (3)

#### 30 · Sözleşmeler — öncelik **P1**
- **A. Amaç:** Kiralamaya bağlı değişmez sözleşme sürümleri, şablonlar, imza (personel ekranında), personel onayı.
- **B. Kullanıcı:** Resepsiyon (teslimde), yönetici (şablon).
- **C. Mevcut:** *Gerçek:* şablon (dil tr/bs/en/de/hr/sr, ülke, sürümlü, izinli alanlar), kiralamaya bağlı taslak (S-000001), yaşam döngüsü **taslak → kontrol bekliyor → dışarıda işleme alındı**, yeni sürüm, PDF ("TASLAK — HUKUKİ ONAY BEKLİYOR" filigranı), erişim/indirme ayrı yetki; **menüde sayfa yok** (kiralama 360° içinde). *Demo:* liste (42) + şablonlar (3), imza bekliyor/imzalı/yerine geçildi, kiracı imza yakalama, ek sürücüler.
- **D. Eksik:** *Gerçek:* **imza** (bilinçli; hukuki onay bekliyor), sigorta/depozito koşul bloğu; *Her ikisi:* teslim/iade tutanağı, servis iş emri, sigorta dosya özeti şablonları (§84.4–85.3).
- **E. Yüzeysel:** Demo imzası "ad yaz + kutu işaretle" (ıslak imza canvas'ı yok; gerçek üründe de yok).
- **F. Düşük değer:** Menüdeki ayrı liste, her sözleşme zaten kiralamada; liste yalnız arama/denetim için.
- **G. Çakışma:** Belge Merkezi (sözleşme sahip türü), Kiralama 360° Sözleşme sekmesi, Ayarlar (şablonlar).
- **H. İş akışı:** Demo: sözleşme üretilir → imzalanır → teslim. Gerçek: sözleşme **dışarıda** işleniyor (K1) → teslim için "dış referans + iki beyan" → **gerçek işletmede sözleşme iki yerde yönetilir** (ACARVO taslağı + dış belge).
- **I. Gerçek fark:** K1 modu ve imza yok; demo daha tamamlanmış görünür.
- **J. Öneri:** Sözleşme sahipliği kararı (K-5): ACARVO mu üretip arşivleyecek (imza için hukuki onay gerekir), yoksa dış mı? Kararla menüdeki liste "Kiralamalar içinde filtre" olabilir.
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] FIYAT raporu §1/F6/F8, KIRALAMA raporu K1, `d/pages/records/ContractsPage.tsx`.

#### 31 · Belge Merkezi — öncelik **P3** (birleştirme adayı)
- **A. Amaç:** Tüm belgelerin şirket genelinde arama/indeksi; ikinci dosya deposu değil.
- **B. Kullanıcı:** Yönetici/muhasebe, nadir (belge süresi denetimi).
- **C. Mevcut (demo):** liste (Belge, Sahibi, Sürüm, Geçerlilik, Durum), sahip türü ve durum filtresi, belge ekle. *Gerçek:* **indeks yok**; belgeler araç ve müşteri 360'ında ve kendi şifreli depolarında.
- **D. Eksik:** Süre yaklaşan belgeler için toplu bildirim yok (bildirim yok).
- **E. Yüzeysel:** Demo belgeleri örnek kayıt, dosya yok.
- **F. Düşük değer:** Aynı bilgi Araç 360 "Belgeler ve riskler", Müşteri 360 "Belgeler", Ana Ekran "süresi dolan belge" uyarısında zaten var.
- **G. Çakışma:** Sözleşmeler, Araçlar, Müşteriler.
- **H. İş akışı:** "Hangi belgelerin süresi yaklaşıyor?" sorusu için en kısa yol bu ekran, ama aynı cevap Ana Ekran/Uyarılar'da.
- **I. Gerçek fark:** Gerçekte belge sahipleri ayrı; indeks için yeni sorgu gerekir.
- **J. Öneri:** **Global aramanın "belge" kapsamı + Ana Ekran "süresi yaklaşan belgeler" listesi** ile karşılayın; ayrı menü ertele/birleştir.
- **K. Öncelik:** P3.
- **L. Kanıt:** [D] `d/pages/records/DocumentsPage.tsx`, anatomi; `api` iki ayrı belge modülü (vehicles/documents.ts, customers).

#### 32 · İşlem Geçmişi — öncelik **P1**
- **A. Amaç:** Salt okunur denetim kaydı: kim, ne zaman, ne yaptı.
- **B. Kullanıcı:** Sahip/yönetici (anlaşmazlık, güven), nadir ama kritik.
- **C. Mevcut (demo):** liste (Zaman, Kişi, Modül, Olay, Özet, Tutar), modül/kişi filtresi, arama. *Gerçek:* `audit_log` tablosu ve her olay yazılıyor, **görüntüleyici yok** (menü `audit.read` iznine bağlı ama `built` değil). Kayıt bazlı geçmiş (rental_events, finance_events, vehicle events…) ilgili 360'larda var.
- **D. Eksik:** Gerçekte ekran; demoda tarih aralığı ve varlık filtresi (§36) yok [K].
- **E. Yüzeysel:** Demo olayları sentetik.
- **F. Düşük değer:** Belirgin yok.
- **G. Çakışma:** Kayıt-bazlı geçmiş sekmeleri (aynı kaynak).
- **H. İş akışı:** İyi; "kim bu iadeyi onayladı" sorusunu yanıtlamak için en kısa yol.
- **I. Gerçek fark:** Gerçek veri **hazır**, ekran yok → **en ucuz yüksek-güven özelliği**.
- **J. Öneri:** Gerçekte erken yapın (yalnız okuma, mevcut tablo); güvenlik: kişisel veri alanları zaten loga yazılmıyor (`log-safety.ts`).
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `audit_log` (migrations), `lib/audit.ts`, `nav.ts` (`islem-gecmisi` `built` yok), `d/pages/records/AuditPage.tsx`.

### B.7 YÖNETİM (4)

#### 33 · Şubeler — öncelik **P1**
- **A. Amaç:** Şube kimliği, saat dilimi, ülke, aktiflik, kapasite ve personel erişimi.
- **B. Kullanıcı:** Sahip; kurulumda, sonra nadir.
- **C. Mevcut:** *Gerçek:* liste, **şube ülkesi** (önizle/uygula; teslim için zorunlu), düzenleme. *Demo:* kartlar (SJJ, MST, DBV), ayrıntı/düzenle.
- **D. Eksik:** Şube bazlı çalışma saati, kasa bağlantısı, kapasite özeti derinliği.
- **E. Yüzeysel:** Demoda şube ayrıntısı kısa.
- **F. Düşük değer:** Yok.
- **G. Çakışma:** Ayarlar (şirket), Kullanıcılar (şube kapsamı).
- **H. İş akışı:** Gerçekte ülke girilmeden teslim engelli → **ilk kurulumda ilk engel** (A.2 #12).
- **I. Gerçek fark:** Küçük.
- **J. Öneri:** Kurulum sihirbazının ilk adımı ("şube + ülke + saat dilimi").
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `w/BranchesPage.tsx`, `branches` modülü (4 rota), K3.

#### 34 · Kullanıcılar — öncelik **P0**
- **A. Amaç:** Personel hesapları, rol ve şube kapsamı, aktif/pasif, davet.
- **B. Kullanıcı:** Sahip; kurulum ve personel değişiminde.
- **C. Mevcut (demo):** 10 kullanıcı listesi (ünvan, rol, şube kapsamı, kişisel istisna, durum), davet (kayıt), rol/şube değiştirme. *Gerçek:* **yok** (giriş yapılabilen hesaplar tohumla/elle).
- **D. Eksik:** Gerçekte davet, şifre belirleme/sıfırlama, hesap kilitleme, oturum yönetimi (yalnız "tüm oturumları kapat" var).
- **E. Yüzeysel:** Demo daveti "e-posta gönderildi" demez (doğru), gerçek akış yok.
- **F. Düşük değer:** "Kişisel istisna" (rol dışı ek/kısıt) küçük işletmede gereksiz [Ö].
- **G. Çakışma:** Roller ve Yetkiler.
- **H. İş akışı:** Yeni personel eklemek şu an **mühendis işi**.
- **I. Gerçek fark:** Kritik boşluk (A.2 #1).
- **J. Öneri:** **P0:** gerçekte davet (bağlantı veya geçici şifre) + rol atama + şube kapsamı + pasifleştirme + şifre sıfırlama.
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `modules/auth/routes.ts`, `nav.ts`, `d/pages/admin/UsersPage.tsx`.

#### 35 · Roller ve Yetkiler — öncelik **P1**
- **A. Amaç:** Modül × eylem matrisi, şube kapsamı, etkin izin önizlemesi.
- **B. Kullanıcı:** Sahip, nadir.
- **C. Mevcut:** *Gerçek:* **3 hazır rol** (Sahip, Yönetici, Operasyon), ~80 izin dizgisi, rol sürümlü yükseltme (yalnız değiştirilmemiş roller yükseltilir), RLS+API denetimi; **düzenleme arayüzü yok**. *Demo:* 5 rol (Muhasebe, Filo Sorumlusu dahil), 36 modül matrisi, kopyala, yeni rol, etkin izin.
- **D. Eksik:** Gerçekte **Muhasebe rolü yok**; muhasebe için finans izinleri Yönetici/Sahip'e bağlı → "muhasebeci tüm yönetim yetkisini almadan finans yapamaz".
- **E. Yüzeysel:** Demoda izin matrisi gerçek izin adlarıyla (≈80) eşleşmiyor (`demo/core/permissions.ts` kendi seti).
- **F. Düşük değer:** Demoda 36 modül × çoklu eylem matrisi küçük işletme için ağır; 4–5 hazır rol çoğu işletme için yeter [Ö].
- **G. Çakışma:** Kullanıcılar, Ayarlar (bildirim), Onay eşikleri.
- **H. İş akışı:** Dört göz için en az iki yetkili şart (Finans raporu §21): tek kişilik işletme **kilitlenir**.
- **I. Gerçek fark:** İki ayrı izin sözlüğü (demo ≠ gerçek) → taşımada eşleme işi.
- **J. Öneri:** Gerçek izin sözlüğünü kanon alın, demoyu ona uyarlayın; Muhasebe rolünü ekleyin; matris düzenlemesini V1.5'e (hazır roller V1'de yeterli).
- **K. Öncelik:** P1.
- **L. Kanıt:** [D] `auth/roles.ts` (3 `Sahip/Yönetici/Operasyon`), `d/core/permissions.ts` (`DEMO_ROLES` 5 rol), FINANS raporu §21 madde 5.

#### 36 · Ayarlar — öncelik **P0**
- **A. Amaç:** Tek şirket politika çalışma alanı; geçmiş anlık görüntüleri yeniden yazmaz.
- **B. Kullanıcı:** Sahip; kurulumda yoğun, sonra nadir.
- **C. Mevcut:** *Gerçek:* kiralama çalışma modu (K1; yalnız Sahip, onay penceresiyle), sözleşme şablonları, belge türleri ve ülke belge gereksinimleri, **operasyonel hazırlık** denetimi, şube ülkesi. *Demo:* 12 bölüm (Şirket, Dil-bölge-para, Döviz Kurları, Süre ve ücret, Sürücü, Depozito, Ödeme, Kasa, Belge, Onay eşikleri, Bildirimler, Gizlilik).
- **D. Eksik:** Demoda şartname §59F'den **Vergi, Sigorta Paketleri, Sözleşme/Belge Şablonları, Numaralandırma, Araç belge hatırlatma günleri** bölümleri yok (vergi/sigorta Fiyatlandırma'da); gerçekte şirket profili, para birimi, saat dilimi ayarı yok.
- **E. Yüzeysel:** Demoda tüm bölümler tek "Kaydet" formu; değişikliğin gelecekteki işlemlere etkisi önizlenmiyor (§82.8 istiyor) [K].
- **F. Düşük değer:** Yok belirgin; ancak 12 bölüm küçük işletme için çok.
- **G. Çakışma:** **Fiyatlandırma** (vergi, sigorta, süre), Kurallar, Onay Merkezi eşikleri, Roller. Politika sahipliği dağınık (E.6).
- **H. İş akışı:** Kurulumda ilk girilmesi gereken ayarların **sıralı kontrol listesi yok** (şube ülkesi → rental mode → belge kuralları → fiyat listesi → roller).
- **I. Gerçek fark:** Demo ayarları gerçekte çoğunlukla yok; gerçek ayarları (K1, ülke) demoda yok.
- **J. Öneri:** Ayarları "Kurulum kontrol listesi" ile başlatın (gerçekte zaten `Operasyonel hazırlık` sayfası var — onu kurulum sihirbazının omurgası yapın); vergi/sigorta politikasını Ayarlar'a, **fiyat verisini** Fiyatlandırma'da bırakın.
- **K. Öncelik:** P0.
- **L. Kanıt:** [D] `d/pages/admin/SettingsPage.tsx:16-27`, `w/settings/*`, K1, spec §59F/§74/§82.8.

---

## C. Platform Konsolu ve Partner Portalı

### C.1 Platform Konsolu — öncelik **P2** (ürün), **P1** (operatör aracı)
- **A. Amaç:** Süper yönetici: şirket (kiracı) kurma, plan, durum (aktif/deneme/askıda), sahip.
- **B. Kullanıcı:** ACARVO operatörü (sizin ekibiniz), müşteri değil.
- **C. Mevcut (demo):** 6 şirket listesi (sahip, plan, şube/kullanıcı/araç sayısı, durum), askıya al/etkinleştir, plan değiştir; "şirket kayıtlarını göstermez". *Gerçek:* **yok;** şirket oluşturma tohum betiği.
- **D. Eksik:** Şirket oluşturma, ilk sahip daveti, fatura/abonelik (bilinçli mock).
- **E. Yüzeysel:** Abonelik ve fatura yalnız tasarım.
- **F. Düşük değer:** Plan/fatura UI mock'ı gerçek faturalama gelmeden anlam taşımıyor.
- **G. Çakışma:** Kullanıcılar (şirket sahibi daveti).
- **H. İş akışı:** Gerçek müşteri sayısı arttıkça "yeni şirket kur" işi manuel olur.
- **I. Gerçek fark:** Yok; **izolasyon** (şirketin kayıtlarını göstermeme) gerçekte RLS ile garanti.
- **J. Öneri:** Ürün olarak ertele; ilk adımda **komut satırı aracı** (şirket + sahip oluştur + davet) yeterli. UI abonelik/fatura V2.
- **K. Öncelik:** P2 (UI), P1 (operatör aracı).
- **L. Kanıt:** [D] `d/pages/contexts/PlatformConsole.tsx`, `contexts.spec.ts` (şirket kaydı sızıntısı yok), `apps/api/seed`.

### C.2 Partner Portalı — öncelik **P3**
- **A. Amaç:** Dış partner: kendi talebini gönderir, kendi rezervasyonlarını ve komisyonunu görür.
- **B. Kullanıcı:** Otel/acente (dışarıdan), seyrek.
- **C. Mevcut (demo):** 3 sekme (Taleplerim, Rezervasyonlarım, Komisyon), yeni talep gönder, **müşteri telefon/e-postası göstermez**, portalı kapalı partner için açıklama; test: başka partnerin kaydı sızmaz. *Gerçek:* yok.
- **D. Eksik:** Partner oturumu (ayrı kimlik), şifre/davet, mobil önceliği 390 px (demoda sağlandı).
- **E. Yüzeysel:** Demoda "partner olarak görüntüle" seçicisi gerçek giriş değil (doğru etiketli).
- **F. Düşük değer:** Çoğu işletmede partner yoksa ya da talep e-posta/telefonla geliyor.
- **G. Çakışma:** Talep Merkezi, Partnerler.
- **H. İş akışı:** Partner lead'i → şirkette Talep Merkezi'ne düşer; iki taraflı iş.
- **I. Gerçek fark:** Gerçek ayrı kimlik/oturum sistemi gerekir (güvenlik işi).
- **J. Öneri:** V2; V1'de partner talepleri e-posta/telefon ve rezervasyon "kaynak: partner" ile.
- **K. Öncelik:** P3.
- **L. Kanıt:** [D] `d/pages/contexts/PartnerPortal.tsx`, `contexts.spec.ts`.

---
## D. Eksik ve yüzeysel özellikler

**Ana soru:** *ACARVO bugün bir rent-a-car şirketinin günlük operasyonunu yönetmek için kullanılsaydı hangi işlemlerde eksik kalırdı?*

**Kısa cevap:** Gerçek ürün (12 ekran) rezervasyon → teslim → iade → bakım/hasar → depozito/tahsilat zincirinin **omurgasını güvenli biçimde** taşıyor; ama bir işletme onunla **çalışamaz**, çünkü (1) personel ve rol yönetimi, ilk kurulum yok; (2) tahsilat doğrulaması küçük ekipler için kilitleyici; (3) görev, bildirim, rapor, kasa, gider, onay kuyruğu yok; (4) arayüz tek dilli. Demo bu boşlukların çoğunu **gösteriyor** ama sunucu garantisiyle çalışmıyor.

Sütun anlamı: **G** = gerçek backend, **Dm** = demo. ● var, ◐ kısmen, ○ yok.

### D.1 Rezervasyon

| Yetenek | G | Dm | Değerlendirme |
|---|---|---|---|
| Belirli araç bazlı uygunluk, çakışma koruması | ● (kilitlerle, DB kısıtı) | ● | Güçlü; gerçek daha sağlam |
| Sınıf bazlı rezervasyon (araç atamadan) | ◐ yalnız *bekleyen* (R1: onay için araç şart) | ● onaylı + kapasite tüketir | **Çelişki** — K-3 |
| Değişiklikler (gerekçeli, geçmiş) | ● (R7) | ◐ tek "Geçmiş" | |
| İptal / Gelmedi | ● / ● | ● / ● | Ücret politikası ikisinde de yok/seed |
| Kaparo (avans) | ○ | ● (tut, aktar, uygula, iade, politika bedeli) | Gerçekte yok; **teslim öncesi ödeme** gerçekte "teslim öncesi tahsilat ≤ kalem tutarı" (FN2) olarak var — iki ayrı kavram |
| Bekleme listesi | ○ | ● | V1.5 |
| Kaynak/kanal | ◐ (`source`) | ● | |
| Çoklu şube (alış ≠ iade) | ● | ● | Planlanmamış şubeye iade riski (gerçek raporu) |
| Fiyat | ● (teklif ayrı kayıt) | ● (anlık) | Teklif tutar dondurur; rezervasyon ≠ fiyat |
| **Hızlı müşteri ekleme** | ● | ○ | Demo regresyonu |

### D.2 Kiralama

| Yetenek | G | Dm |
|---|---|---|
| Hazırlık, sürücü uygunluğu (belge kararı) | ● (personel kararı; yaş/ehliyet politikası ○) | ● (politika hesaplı) |
| Sözleşme | ◐ taslak/PDF, imza ○ | ● imza yakalama |
| Teslim (km/yakıt/foto/kanıt) | ● (şifreli depo, ClamAV şartı) | ◐ foto kutusu |
| İade + karşılaştırma + hasar işaretleme | ● | ● |
| Uzatma | ● (`extended` olayı) | ● |
| Araç değişimi | ○ | ● |
| Erken/geç iade ücreti | ○ (FN6; ek kalem elle) | ● önizleme |
| Olağan dışı kapanış (çalıntı, el koyma) | ○ | ● |
| Finansal kapanış / yeniden açma | ● | ● |
| Dış sözleşme modu (K1) | ● (kapalıysa teslim yok) | — (yok) |

**Değerlendirme:** Gerçekte teslim **K1 + ülke + belge kuralı + ClamAV** ön koşuluna bağlı; demo bu engelleri hiç göstermiyor → demodan beklenen akış gerçek kurulumda çalışmaz.

### D.3 Araç yönetimi

| Yetenek | G | Dm |
|---|---|---|
| Yaşam döngüsü, 360°, belgeler (sürümlü), tanıtım fotoğrafı | ● | ◐ |
| Fiziksel konum ≠ ana şube; konum/km olayları + düzeltme | ● (olay kayıtlı, düzeltmeli) | ● |
| Bakım (şablon, periyot) | ● | ● |
| Lastik/sezon | ◐ (bakım türü) | ● alan |
| Temizlik/hazırlık | ● (denetim sayfası) | ● |
| Transfer | ● (taşıyıcı kanıtı, varış teslimi) | ● |
| Kullanılamama nedenleri | ● (hasar engeli, bakım) | ● |
| Anahtar takibi | ○ | ◐ yalnız sayı+yer, olay yok |
| Ekipman listesi, yol yardım, sigorta dosyası, alım-satım | ○ | ○ (veri modelinde kısmen) |

### D.4 Müşteriler

Kimlik/ehliyet (şifreli, izli numara açma) ● G; belge geçerliliği ● G (ülke kuralları etkin değilse "kural tanımsız"); iletişim geçmişi, kısıt, GDPR kaydı ○ G / ● Dm; **mükerrer kontrol** ● G, **birleştirme** ○ G / ● Dm; kurumsal bağlantı ● G; gizlilik/maskeleme ● G (rol bazlı) / ● Dm; müşteri riski yalnız kısıt (puan yok) ✔ her ikisinde.

### D.5 Finans

| Yetenek | G | Dm |
|---|---|---|
| Hesap kalemi (tahakkuk) | ● (onay gerekli) | ● (otomatik) |
| Tahsilat | ● kaydet→doğrula | ◐ kaydet=uygula |
| Çok para birimi / döviz kuru | ○ | ● |
| Kaparo | ○ | ● |
| Depozito (tut/iade) | ● | ● |
| Depozito mahsubu | ○ (FN4) | ● |
| **Kısmi iade** | ● (depozito iadesi kısmi) | ◐ kaparo yalnız tam |
| Politika bedeli (no-show) | ○ | ◐ yalnız kaparo üstünden |
| Masraf defteri | ○ | ● (araç alanı yok) |
| Kasa / vardiya mutabakatı | ○ | ● |
| Şube mutabakatı, gün sonu raporu | ○ | ◐ (kasa oturumu) |
| Kurumsal alacak / ekstre | ◐ cari var, kredi limiti ○ | ● |
| Ödeme planı | ○ | ○ (veri var, arayüz yok) |
| Vergi dökümü | ◐ (oran tahmin edilmez; "net") | ◐ |

### D.6 Yönetim ve analiz

| Yetenek | G | Dm |
|---|---|---|
| Görevler | ○ | ● |
| Bildirimler | ○ | ● (uygulama içi) |
| Onay kuyruğu (birleşik) | ○ | ● |
| Şube performansı | ◐ (Ana Ekran şube tablosu) | ● |
| Filo doluluğu | ◐ (Ana Ekran) | ● |
| Gelir kontrolü | ○ | ◐ (içerik zayıf) |
| Günlük kapanış | ○ | ◐ |
| Denetim geçmişi (görüntüleyici) | ○ (veri ●) | ● |
| Kullanıcı/rol/davet | ○ | ● |
| Global arama (Ctrl K) | ○ | ● |
| CSV dışa aktarma / yazdır | ○ | ● |
| Veri içe aktarma (araç/müşteri) | ○ | ○ |

### D.7 Hem demoda hem gerçekte olmayan, ama işletmenin ihtiyaç duyacağı (yeni özellik **önerisi**, onaysız uygulanmaz)

1. **Veri içe aktarma** (araç ve müşteri CSV'si) — mevcut işletmeyi ürüne taşımanın tek yolu; şartname §59CN yalnız "önizleme" der. [Ö, P1]
2. **İlk kurulum sihirbazı / kontrol listesi** (şube+ülke → rental modu → belge kuralları → fiyat listesi → kullanıcılar). [Ö, P0]
3. **Günlük kapanış özeti** (tahsilat+kasa+iade/teslim+açık işler tek sayfa, yazdırılabilir). [Ö, P1]
4. **Araç başına gerçek maliyet** (bakım+ceza+hasar+atfedilen gider) — Masraflar'da araç alanı olmadan hesaplanamaz. [Ö, P1]
5. **Teslim/iade formu (A4)** — şartnamede var (§59J, §84.4); gerçekte sözleşme taslağı var, tutanak yok. [D eksik/Ö öncelik P1]
6. **Kullanıcı davet ve şifre sıfırlama** — A.2 #1. [D, P0]

---

## E. Gereksiz veya tekrar eden özellikler

Önerilerin hiçbiri uygulanmadı; hiçbir ekran/özellik kaldırılmadı. **Sidebar'ın 36 bağlantılık kanonik sözleşmesini değiştiren her öneri şartname revizyonu ve sizin kararınızı gerektirir.**

### E.1 Grup 1 — Operasyon yönetimi (Ana Ekran · Komuta Merkezi · Görevler · Riskler ve İstisnalar)

| Ekran | Gerçek sorumluluğu | Çakışma | Karar önerisi |
|---|---|---|---|
| Ana Ekran | Bugünün özeti | Komuta "Acil/Bugün" ile ~%80 | **Ayrı kal** (tek "bugün" yüzeyi) |
| Komuta Merkezi | Müdahale kuyruğu + vardiya devri | Ana Ekran, Riskler | **Başka ekranın içine taşı / yeniden tanımla:** tek "İşlerim" kuyruğu (uyarı+görev+onay) |
| Görevler | İnsan işi | Komuta (sayı) | **Ayrı kal** (orta/büyük ölçek), küçükte kapalı modül |
| Riskler ve İstisnalar | Türetilmiş risk + inceleme | Komuta "Uyarılar" (aynı 30 kayıt) | **Riskler sekmesini birleştir**, İstisnalar ayrı kalsın |

Sahibe etkisi: şu an "ne yapmam lazım?" için 4 yere bakar; hedef 1 (Ana Ekran "Bekleyen işlerim") + 1 (İşlerim kuyruğu).

### E.2 Grup 2 — Analiz ve raporlama (Gelir Kontrolü · Filo Analizi · Fırsatlar · Kapasite Planlama · Raporlar)

| Ekran | Karar |
|---|---|
| Raporlar | **Ayrı kal** (çatı); 3 çekirdek rapor |
| Filo Analizi | **Raporlar → Filo ailesi** (aynı sayılar Araç 360° Finans ve performans'ta da) |
| Gelir Kontrolü | **Yeniden tasarla ve Finans "Dikkat" görünümüne taşı** (mevcut içerik değişmezlerin testi) |
| Kapasite Planlama | **Takvim/zaman çizelgesinin kapasite modu** (sınıf-only kararı sonrası) |
| Fırsatlar | **Tamamen kaldırılması için kullanıcı kararı iste** (V2'ye ertele); 2 öneri Ana Ekran satırına |

Beş ekran tek "Analiz" çatısı + Takvim modu olabilir: **menü 36 → 31** (şartname revizyonu gerekir).

### E.3 Grup 3 — Finans (Finans Merkezi · Masraflar · Şube Kasaları · Gelir Kontrolü · Kurumsal ekstre)

Veri kaynağı ayrımı **doğru** (tek kaynak; ikinci editable truth yok). Sorun *gösterim yinelemesi*: aynı kiralama bakiyesi Finans "Açık bakiyeler", Kiralama 360° "Finans", Raporlar "Tahsilat ve bakiye", Gelir Kontrolü "uygulanmamış/açık", Kurumsal ekstrede görünür. Öneri: **Finans Merkezi tek okuma noktası**; diğerleri yalnız bağlantı/özet. Masraflar ve Şube Kasaları **ayrı kalmalı** (farklı işlem: gider girişi, nakit sayımı).

### E.4 Grup 4 — Operasyon sorunları (Olay Merkezi · Hasar Kayıtları · Ceza Modülü · Bakım ve Servis)

Her biri ayrı yaşam döngüsü (doğru). Sorun **giriş noktası**: kaza → olay mı, hasar mı, ceza mı? Aynı olay için en çok **dört** kayıt gerekebilir. Öneri: tek **"Olay bildir"** giriş sihirbazı (araç/kiralama bağlamından) — sonuçta uygun kayıtları oluşturup birbirine bağlar; menüler olduğu gibi kalır. "Kullanıcı yanlış bölümde işlem yapabilir mi?" → **evet** [Ö]: demoda Olay türü "Kaza" ile Hasar kaydı arasında yönlendirme yok [D].

### E.5 Grup 5 — Müşteri ve ticari (Müşteriler · Kurumsal · Talep Merkezi · Rezervasyonlar · Partnerler)

Müşteriyle ilgili bir işlem için 3–4 ekran değişir (Müşteri 360 → Rezervasyon aç → Kiralama → Finans). Bu doğal; sorun yok. Çakışma: "Talep Merkezi" ile "Rezervasyon (Bekliyor)" aynı satış aşaması; **terim çakışması: "Teklif"** (gerçek: fiyat kaydı; demo: satış teklifi). Öneri: Talep Merkezi V1.5, Partnerler V2.

### E.6 Grup 6 — Ayarlar ve politikalar (Ayarlar · Kurallar · Fiyatlandırma · Roller ve Yetkiler · Onay Merkezi)

**Bu grup en çok sorunlu:** bir politika birden fazla yerden değişiyor [D]:
- Vergi, sigorta paketleri → demoda Fiyatlandırma'da, şartnamede Ayarlar'da.
- Depozito politikası → demoda Ayarlar; kurumsal depozito geçersiz kılma → Kurumsal Hesap; depozito istisnası → Onay Merkezi.
- Onay eşikleri → Ayarlar; onay akışı → Onay Merkezi; yetki → Roller.
- Bildirim eşikleri → Ayarlar; aynı iş için Kurallar (IF/THEN).
**Öneri:** *Politika sahipliği haritası* (şartname §74'ün demoda uygulanmamış hâli): **veri = ilgili iş ekranı, politika = Ayarlar, kural motoru yalnız uyarı**. Kurallar menüsünü V2'ye ertele (karar sizin).

### E.7 Üç sınıfa özet

| Sınıf | Öğeler |
|---|---|
| **Tamamen kaldırılması önerilenler** (yalnız öneri; karar sizin) | Fırsatlar (ayrı ekran), Filo Asistanı (ayrı ekran), Gelir Kontrolü'nün **mevcut 6 değişmez kontrolü**, Kurallar (V1'de), Platform Konsolu'ndaki fatura/abonelik mock'ı |
| **Başka ekranın içine taşınması önerilenler** | Komuta Merkezi → "İşlerim" kuyruğu; Riskler → Uyarılar; Kapasite → Takvim modu; Filo Analizi → Raporlar; Belge Merkezi → Global arama+Ana Ekran; Gelir Kontrolü → Finans "Dikkat"; Vardiya Devri → Şube Kasaları oturum devri |
| **Ayrı ekran olarak kalması gerekenler** | Ana Ekran, Rezervasyonlar, Kiralamalar, Takvim, Araçlar, Bakım ve Servis, Hasar Kayıtları, Müşteriler, Kurumsal Hesaplar, Fiyatlandırma, Finans, Masraflar, Şube Kasaları, Sözleşmeler (karar K-5), İşlem Geçmişi, Şubeler, Kullanıcılar, Roller ve Yetkiler, Ayarlar, Onay Merkezi (birleşik inbox), Görevler (orta+ ölçek), Raporlar |

**Önemli:** E.7 yalnız ürün önerisidir; 36 kanonik bağlantıyı bozan öğelerin tamamı **K bölümünde karar olarak** listelenmiştir.

---

## F. Sekiz demo senaryosu — işlev ve kullanıcı deneyimi analizi

"Otomatik testin geçmesi iyi deneyim demek değildir." Aşağıdaki **adım sayıları test betiklerinden sayılan eylem sayısıdır** (tıklama/yazma/seçme); süre ölçümü değil [K].

### F.1 Günlük operasyon (≈ 3 eylem)
Adımlar: Ana Ekran → "Geciken iade" kartı → liste (aynı sayıda satır) → satır → Kiralama 360.
- **İyi:** Sayı, liste ve Komuta Merkezi tutarlı; filtre otomatik.
- **Sorun:** Resepsiyon "bugün teslim edeceğim araç hazır mı?" sorusunu Ana Ekran listesinde **açık bir "teslime hazır/hazır değil" rozetiyle** göremiyor (satırlarda "araç atanmadı" gibi notlar var; hazırlık rozeti doğrulanamadı) [K]. **Geciken iade için "müşteriyi ara/iletişim notu ekle" eylemi yok** (iletişim kaydı Müşteri 360'ta) [D].
- **Eksik adım:** Gecikene tek tıkla "iletişim notu/görev" yok.

### F.2 Rezervasyondan teslime (≈ 26 eylem, 4 sayfa)
Müşteri arama (3) → tarih (1) → araç sınıfı + araç (2) → kaydet (1) → [Bekliyor] **Onayla** (1) → Kiralamaya dönüştür (1–2) → Teslim Masası sekmesi (1) → belge kutusu (1) → sürücü kutusu (1) → hazır kaydı (0–1) → imza (4) → depozito (2) → fotoğraf (4) → Teslimi tamamla (1).
- **Zorunlu bilgiler:** müşteri, dönem, sınıf/araç. Doğru sırada.
- **Gereksiz/ağır:** (a) **iki ayrı personel beyanı** + ayrı hazır kaydı; (b) fotoğraf için 4 ayrı tıklama (demo; gerçekte yükleme); (c) imza için ad yazma + kutu; (d) varsayılan "Bekliyor" → ek onay adımı; (e) müşteri yoksa akış dışına çıkış.
- **Eksik önemli alan:** teslimde ödeme/depozito durumu karar kartında özet olarak görünüyor (iyi); **tek ekranda "müşteri ne ödeyecek" toplamı** yok.
- **Hata durumu:** Pasif düğme nedeni yazılı (iyi); araç seçilemezse neden gösterilir.
- **Öneri:** Yönetici onaylı yürüyen müşteri için **"Rezervasyon + onay + kiralama" tek akış** (araç seçili, müşteri belgeli) ve masada **tek onay**; adım hedefi ≈ 12–14. Güvenlik/belge/finans kapıları kaldırılmaz.

### F.3 Görev ve personel (≈ 6 eylem, iki kullanıcı)
Yönetici görev oluşturur (4) → Operasyon kullanıcısına geçiş (demo) → "Bana atanan" → aç → tamamla (2).
- **İyi:** Tek sorumlu, bağlı kayıt değişmez, Komuta sayısı güncellenir.
- **Sorun:** Görev atanan kullanıcıya **gerçek bildirim yok** (yalnız uygulama içi; kullanıcı girmezse görmez) — bilinçli ama pratikte atlanır. Görev **yorum/ek** yok.
- **Eksik:** İş yükü görünümü (kim kaç görevli) yok.

### F.4 Filo analizi (≈ 4 eylem)
Dönem → şube → araç → geri.
- **İyi:** Filtreler korunur, satırlar azalır.
- **Sorun:** Sonuç "kiralanma %" ama **araç başına maliyet/kâr katkısı yok**; sahip "hangi araç para kazandırıyor?" sorusunu yanıtlayamaz. Aynı sayılar Araç 360° sekmesinde de var.

### F.5 Çoklu tahsilat (≈ 30 eylem)
500 EUR borç; her satır 5–6 eylem × 4 satır + kur tanımı (8). Kurallar doğru ve görünür (kur yoksa kaydedilmez).
- **İyi:** "Kalanı öde", kur önizlemesi, kasa ayrımı.
- **Sorun:** Senaryo metni **ters kur kutusunu** anlatmıyordu (düzeltildi); **kur tanımı için Ayarlar'a gidip dönmek** akışı böler (iki ekran + yeniden hesap). Gerçekte (finans raporu FN3) farklı para birimiyle tahsilat **kapalı**.
- **Uyarı:** Bu senaryo gerçek üründe **çalışmaz** (çok para birimi ○).

### F.6 Bakım ve uygunluk (≈ 20 eylem)
Çakışan bakım (8) → reddedilir, kaynak yazılı → boş pencere (8) → servise al (2) → tamamla (2) → Araç 360: Müsait ama Hazırlık 1 engel.
- **İyi:** Çakışma nedeni kayıt numarasıyla; tamamlanan ≠ hazır.
- **Sorun:** Araç seçimi için üç eylem (açıp yazıp seçme); tarih iki alan. Hazırlık engelini kapatmak için ayrı ekran ("Temiz ve hazır kaydet") — bakım sonrası **otomatik görev önerisi** yok.

### F.7 Müşteriden ticari talebe (≈ 9 eylem)
Yeni talep (4) → teklif v1 (2) → v2 (2) → kabul (1) → rezervasyon (Bekliyor) + müşteri oluşur.
- **İyi:** Eski sürüm korunur; teklif ≠ rezervasyon.
- **Sorun:** Kabul edilen teklifle oluşan rezervasyon **araçsız ve Bekliyor**; kapasite tutmaz → müşteri "kabul etti" ama araç güvencesi yok; ikinci bir onay adımı ve araç seçimi gerekli. Teklifin müşteriye **gitmesi** sistem dışı.

### F.8 Şube kasası (≈ 15 eylem)
Oturum aç (3) → +50 (4) → −30 (4) → sayım 215 → fark −5 gerekçe → kapat.
- **İyi:** Beklenen/sayılan/fark net; gerekçe eşik üstünde istenir.
- **Sorun:** Vardiya devri (yeni vardiya) kasayla birleşik değil; "devralan" kişi seçimi isteğe bağlı. Gün sonu raporu yok.

**Genel sonuç:** Senaryolar **işlevsel olarak doğru**, kullanıcı deneyimi açısından **orta**: kapılar doğru ama adım sayısı yüksek, özellikle F.2 ve F.5. En büyük kazanç F.2'nin sadeleştirilmesi (günlük en sık akış).

---
## G. Küçük, orta ve büyük işletme karşılaştırması

Üç profil **kurgusaldır**; gerçek müşteri araştırması veya performans kanıtı yerine geçmez [Ö].

### G.1 İhtiyaç matrisi (G = gerekli, F = faydalı, X = gereksiz/zarar verici)

| Yetenek | Küçük (10–20 araç, 1 şube, 2–3 kişi) | Orta (50–100 araç, 2–5 şube) | Büyük (300+ araç, çok şube) |
|---|---|---|---|
| Araç, müşteri, rezervasyon, kiralama, teslim/iade, sözleşme PDF, depozito, basit tahsilat | **G** | **G** | **G** |
| Hasar, bakım, belge/muayene hatırlatma, hazırlık | **G** | **G** | **G** |
| Dört göz **her** tahsilatta | **X** (kilitler) | F (eşikli) | G |
| Onay Merkezi (indirim, iade, düzeltme) | X | F | G |
| Görevler | X (WhatsApp yeter) | **G** | **G** |
| Şube kasası/vardiya mutabakatı | F (nakit ağırlıklıysa G) | **G** | **G** |
| Masraflar (araç bazlı) | F | **G** | **G** |
| Raporlar (günlük tahsilat, alacak, kullanım) | F | **G** | **G** |
| Kurumsal hesap/kredi | F | F | **G** |
| Çok para birimi / kur | yalnız sınır bölgesinde F | F | G (uluslararası ise) |
| Sınıf bazlı kapasite, Kapasite Planlama | X | F | **G** |
| Talep Merkezi, Partnerler | X | F | F |
| Tedarikçi/alt-kiralama | X | X | F (sezonda) |
| Kurallar, Fırsatlar, Filo Asistanı | X | X | X–F |
| Çok dilli arayüz | F | F | **G** |
| İçe aktarma, entegrasyon (muhasebe, GPS) | G (taşınmak için) | G | **G** |
| Kullanıcı yönetimi + roller | G (3–4 hazır rol) | G (özel rol) | G (ince yetki) |

### G.2 Küçük işletme — ACARVO gereğinden karmaşık mı?
**Evet, bugünkü demo ve şartname karmaşık** [Ö]; *gerçek* ürünün 12 ekranı ise küçük işletme için uygun boyutta ama **iki engel var:** (1) FN1: tahsilat doğrulaması tek kişilik işletmeyi kilitler [D]; (2) kullanıcı davet/ilk kurulum yok [D]. 36 menünün çoğu bu profilde kullanılmaz; **"sade mod"/modül anahtarı** olmadan ürün korkutucu görünür. Gerekli çekirdek: Ana Ekran, Rezervasyonlar, Kiralamalar, Araçlar, Müşteriler, Fiyatlandırma, Finans (basit), Bakım, Hasar, Ayarlar, Kullanıcılar.

### G.3 Orta ölçek — önemli ihtiyaçlar karşılanıyor mu?
**Kısmen.** Gerçekte var: araç/bakım/hasar/transfer/hazırlık, çok şube erişimi, şube kapsamlı yetki, müsaitlik koruması, finans dosyası. **Yok:** görevler, bildirim, kasa/vardiya, gider, rapor, onay kuyruğu, kullanıcı yönetimi, global arama, CSV. Demoda bunların hepsi var → **orta ölçeğin ihtiyaç listesi demoda karşılanmış, gerçekte karşılanmamış** (H bölümü).

### G.4 Büyük işletme — yapı yeterli mi?
**Bilinmiyor / zayıf** [?]. Performans: gerçek API 3.000–5.000 sentetik kayıtla ölçülmüş (raporlar, ms düzeyinde) [D]; 300+ araç için liste sayfalama gerçekte var, demoda istemci tarafı tablolar (28 araç) 300+ için ölçülmedi [?]. Yapısal eksikler: sınıf bazlı rezervasyonun resmi onayı (R1), şube karşılaştırma raporları, içe aktarma, API/entegrasyon yok, **hata/eşzamanlılık** gerçekte güçlü. Merkezi kontrol için (şube karşılaştırma, kurumsal alacak yaşlandırma) rapor katmanı yok.

---

## H. Demo ve gerçek backend farkları

### H.1 Özellik matrisi

Durum: **Her ikisi** (aynı davranış) · **Gerçek** · **Demo** · **Kısmen** · **Yok**.

| Özellik | Gerçek | Demo | Durum / not |
|---|---|---|---|
| Giriş, oturum, şirket değiştirme | ● | simülasyon | Her ikisi (demo gerçek değil) |
| Şirket/şube, şube ülkesi, saat dilimi | ● | ● | Her ikisi |
| Kullanıcı davet/şifre/rol arayüzü | ○ (yalnız 3 hazır rol) | ● | **Demo** |
| Araçlar + Araç 360° (8 sekme) | ● (sürümlü belge, olay düzeltme) | ● | Her ikisi; gerçek daha derin |
| Araç transferi, hazırlık, hasar engeli (dört göz) | ● | ◐ (engel tek yetkiyle) | **Kısmen** (demo gevşek) |
| Müşteri + şifreli belge + mükerrer | ● | ◐ | Gerçek daha güçlü |
| Müşteri birleştirme, iletişim kaydı, kısıt, GDPR | ○ (alan ayrılmış) | ● | **Demo** |
| Kurumsal hesap (vergi no, adres, kişi, cari) | ● | ● | Her ikisi |
| Kurumsal kredi limiti / maruziyet | ○ | ● | **Demo** |
| Rezervasyon (belirli araç) | ● | ● | Her ikisi |
| Sınıf bazlı **onaylı** rezervasyon + kapasite | ○ (onay için araç şart) | ● | **Demo — çelişki** |
| Bekleme listesi | ○ | ● | **Demo** |
| Fiyat listesi, revizyon, sezon, kademe, ekstra, indirim, teklif kaydı | ● | ● | Her ikisi (ayrı motorlar) |
| Sigorta paketi, kurumsal anlaşma fiyatı, km, tek yön | ○ (`notApplied`) | ● | **Demo** |
| Kiralama: hazırlık, teslim, iade, kapanış | ● (K1/ülke/ClamAV şartlı) | ● | Her ikisi |
| Kiralama uzatma | ● | ● | Her ikisi |
| Araç değişimi, olağan dışı kapanış | ○ | ● | **Demo** |
| Sözleşme taslağı/PDF/şablon (6 dil) | ● (imza yok, dış süreç) | ● (imza yakalama) | **Kısmen — model farklı** |
| Hesap kalemi (onaylı) | ● | ● (otomatik) | **Farklı kural** |
| Tahsilat kaydet → doğrula | ● | ○ (kaydet=uygula) | **Farklı kural** |
| Çok para birimi/kur, kaparo, depozito mahsubu | ○ | ● | **Demo** |
| Depozito tut/iade (dört göz) | ● | ● (iade onayı) | Her ikisi |
| Ödeme planı | ○ | ◐ (yalnız veri) | **Yok/yarım** |
| Finansal kapanış / yeniden açma | ● | ● | Her ikisi |
| Şube kasası/vardiya | ○ | ● | **Demo** |
| Masraflar | ○ | ● | **Demo** |
| Görevler, Olay, Ceza | ○ | ● | **Demo** |
| Onay Merkezi (6 tür), Kurallar | ○ | ● | **Demo** |
| Ana Ekran | ● | ● | Her ikisi |
| Operasyonel hazırlık (kurulum) denetimi sayfası | ● (Ayarlar → Operasyonel hazırlık) | ○ | **Gerçek** |
| Komuta Merkezi, Uyarılar, Bildirim | ○ | ● | **Demo** |
| Takvim, Kapasite, Filo Analizi, Fırsatlar, Raporlar, Gelir Kontrolü, Riskler | ○ (zaman çizelgesi ●) | ● | **Demo** |
| Global arama, CSV, yazdır | ○ | ● | **Demo** |
| İşlem geçmişi **veri** / **ekran** | ● / ○ | ● / ● | Veri hazır, ekran yok |
| Talep Merkezi, Partnerler, Tedarikçiler, Platform, Partner Portalı | ○ | ● | **Demo** |
| Arayüz dili | TR | TR+EN | **Demo** |
| Roller | 3 (Sahip, Yönetici, Operasyon) | 5 | **Demo** |
| İzin sözlüğü | ~80 gerçek | ayrı demo seti | **Farklı** |

Sayısal özet: 36 ekranın **12'si gerçek**, **24'ü yalnız demoda**; ayrıca ortak görünen ekranlarda **en az 8 satırda davranış farklı** (araç engeli, müşteri, sınıf rezervasyonu, sözleşme, hesap kalemi, tahsilat, roller, izin sözlüğü).

### H.2 Demo iş kurallarının gerçek backend'e doğrudan taşınması güvenli mi?

**Hayır, doğrudan değil.** [D/Ö]

| Alan | Neden taşınamaz / ne gerekir |
|---|---|
| **Eşzamanlılık** | Demo `commit()` tüm veritabanını kopyalar ve tek tarayıcıda çalışır; iki kullanıcının aynı aracı aynı anda onaylaması, aynı ödemeyi aynı anda uygulaması **hiç sınanmıyor**. Gerçek, kilit + kısıt ile korunuyor (BHT raporu §D). |
| **Veri izolasyonu** | Demo "şirket/şube kapsamı" yalnız istemci filtresi; gerçek RLS + API. Aynı kod yazılırsa **izolasyon kaybolur**. |
| **Finansal bütünlük** | Demo idempotency'si bellek içi anahtar; gerçekte benzersiz kısıt + olay tablosu + `requestId`. Demo "kaydet=uygula" bütünlük kuralını gevşetir. |
| **Dört göz** | Demoda "talep eden ≠ onaylayan" istemci kontrolü; gerçekte API + veritabanı. |
| **Denetim değişmezliği** | Demo olayı tarayıcıda; gerçek `audit_log` salt ekleme. |
| **Dosya güvenliği** | Demo dosya taşımaz; gerçekte şifreli depo, ClamAV, kısa ömürlü erişim izni. |
| **Kur/kasa** | Salt-ekleme kur deposu, ödeme başına kur anlık görüntüsü ve kasa defteri **tasarlanmamış**; demonun veri yapısı şema değildir. |
| **Zaman** | Demo saati simüle eder (demo saati); gerçekte sunucu saati + şube saat dilimi. |
| **Çok dil** | Demo `B()/L()` dizgisi gerçek bir i18n mimarisi değil. |
| **Tohum veri** | "Bugün" çapalı tarihler; testler gerçek fikstürlere taşınmaz. |

**İki ayrı kod tabanı riski:** demo `@acarvo/shared`'ı **hiç kullanmıyor** (para, zaman, fiyat, müsaitlik, finans yeniden yazıldı; çekirdek ~6,6 bin satır) [D]. Taşınabilir olanlar: **saf hesaplayıcılar** (para ayrıştırma, süre/gün hesabı, fiyat satırları, müsaitlik projeksiyonu, kapasite) — ancak **önce demonun bunları ortak pakete (`packages/shared`) geçirmesi** gerekir; aksi halde iki motor ayrışır.

**Somut backend kapsamı (analizden çıkan, sıralı):**
1. Kullanıcı/rol/davet/şifre + ilk kurulum + şirket oluşturma aracı.
2. Finans modelinin **kaydet → doğrula → uygula** olarak tekleştirilmesi; doğrulama politikası ayarlanabilir; sonra kaparo (avans) ve depozito mahsubu.
3. Görevler + bildirimler + birleşik "bekleyen işlerim" kuyruğu.
4. Raporlar (3 çekirdek) + gün sonu özeti + CSV.
5. Masraflar (araç alanıyla) + Şube Kasaları.
6. İşlem geçmişi ekranı (veri hazır).
7. Sınıf bazlı rezervasyon/kapasite kararı sonrası müsaitlik servisi genişletmesi.
8. Çok para birimi/kur (yalnız karar K-2 "evet" ise).
9. Sigorta paketi, kurumsal fiyat, km/yakıt/gecikme ücreti (fiyat hattının tamamlanması).
10. İçe aktarma (araç/müşteri).

---

## I. Riskler

| # | Risk | Tür | Olasılık/Etki [Ö] | Kanıt/Not |
|---|---|---|---|---|
| R-1 | **Kapsam şişmesi:** V1 şartnamesi 100 bölüm; niş alanlar (alt-kiralama, anahtar/ekipman, yol yardım, sigorta dosyası, alım-satım, KVKK ekranları) bitmeden çekirdek geç kalır | Ürün | Yüksek/Yüksek | §59U–CZ başlıkları |
| R-2 | **Demo–gerçek ayrışması**: demo satışta "çalışan ürün" izlenimi verir; gerçekte olmayan davranışlar (kaparo, çok para birimi, kasa, görev) vaat edilir | Ürün/İtibar | Yüksek/Yüksek | H.1 |
| R-3 | **İki iş kuralı kodu** sessizce ayrışır | Geliştirme | Yüksek/Orta | `@acarvo/shared` demoda yok |
| R-4 | **Küçük işletme kilidi:** dört göz zorunluluğu + kurulum yükü | Operasyon | Yüksek/Yüksek | FN1, A.2 #7 |
| R-5 | **İlk kurulum engelleri** (şube ülkesi, K1, belge kuralı, ClamAV, M2 anahtarları) müşteriyi ilk günde durdurur | Operasyon | Yüksek/Orta | Kiralama/Finans raporları |
| R-6 | **Çok onay kuyruğu → kaçan onay** | Operasyon | Orta/Yüksek | A.2 #6 |
| R-7 | **Alarm yorgunluğu** (30 uyarı, "9+" bildirim; 8 "dikkat" yüzeyi) | Operasyon | Orta/Orta | demo tohum; gerçek oran [?] |
| R-8 | **Sahte güvence**: Gelir Kontrolü'nün değişmez kontrolleri "her şey yolunda" der | Ürün | Orta/Orta | E bölümü |
| R-9 | **Hukuki belirsizlik:** sözleşme imzası, vergi, saklama süresi, KVKK/GDPR (Part IV) — çözülmeden üretimde gerçek kiralama yapılamaz | Hukuki | Yüksek/Yüksek | Part IV, K1/F6 |
| R-10 | **Tek dil:** gerçek arayüz yalnız Türkçe | Ürün | Yüksek/Orta | i18n yok |
| R-11 | **Güvenlik:** demo kuralları (client-side yetki) gerçeğe taşınırsa izolasyon/bütünlük kaybı | Güvenlik | Orta/Yüksek | H.2 |
| R-12 | **Erişim izinleri bellekte** (API süreci yeniden başlatılınca düşer; çok örnekte ortak depo yok) | Güvenlik/Operasyon | Orta/Düşük | FIYAT raporu §8 |
| R-13 | **Şube yetkisi veritabanında değil API'de** (RLS yalnız şirket) | Güvenlik | Düşük/Orta | Rezervasyon/Kiralama raporları |
| R-14 | **Bekleyen kayıt araç tutmaz + varsayılan "Bekliyor"** → çifte kiralama | Operasyon | Orta/Yüksek | senaryo 2 |
| R-15 | **Geciken araç süresiz dolu sayılır (K2)** → ileri rezervasyonlar bloke | Operasyon | Orta/Orta | Kiralama raporu §15 |
| R-16 | **Terim çakışması "Teklif"** entegrasyonda yanlış model | Geliştirme | Orta/Orta | G bölümü |
| R-17 | **Kapasite/performans 300+ araçta doğrulanmadı** (demo) | Geliştirme | Orta/Orta | G.4 |
| R-18 | **Aralıklı testler:** `reservations` düzen testi nedeni kanıtlanmadı | Geliştirme | Düşük/Düşük | Tamamlama raporu B-19 |
| R-19 | **Yedek/felaket kurtarma** üretim kararı yok (backup betiği var, otomasyon/izleme yok) | Operasyon | Düşük/Yüksek | `scripts/backup-db.mjs`; [K] |

---
## J. Önceliklendirilmiş değişiklik listesi (P0–P4)

**Öncelik tanımı:** P0 zorunlu · P1 çok önemli · P2 faydalı · P3 sonraya bırakılabilir · P4 gereksiz/sadeleştirilmeli (**hiçbiri kaldırılmadı; önce kullanıcı kararı**).
**İşaret:** ⚠ = şartnameye aykırı/şartname revizyonu gerektirir → **sizin kararınız** (K bölümü). 🔒 = finans/güvenlik kuralına dokunur.
**Ölçüt:** operasyonel zorunluluk, kullanım sıklığı, işletmeye değer, kullanıcı karmaşıklığı, finansal/güvenlik riski, bağımlılıklar.

### J.1 Karar tablosu

| Özellik | Mevcut durum | Sorun | Öneri | Öncelik | Gerekçe |
|---|---|---|---|---|---|
| Kullanıcı davet / şifre sıfırlama / rol atama (gerçek) | Yok; hazır roller seed ile | Hiçbir işletme kendi başına devreye alamaz | **Yeni özellik olarak öner** (backend+frontend) | **P0** | Ürünün kullanılabilirlik eşiği |
| İlk kurulum kontrol listesi/sihirbazı | `Operasyonel hazırlık` sayfası var, sihirbaz yok | Şube ülkesi/K1/belge kuralı olmadan teslim engelli | **Derinleştir** (mevcut sayfayı omurga yap) | **P0** | İlk gün engelleri |
| Finans modeli tekleştirme 🔒 | Demo kaydet=uygula; gerçek kaydet→doğrula | İki farklı davranış | **Birleştir** (doğrula-uygula taban; politika ayarlı) | **P0** | Para; satış beklentisi |
| Dört göz kapsamı 🔒 ⚠ | Her tahsilat/depozito iki kişi | Küçük işletme kilitlenir | **Sadeleştir** (eşikli/ayarlı doğrulama) | **P0** | Ürün erişilebilirliği |
| Sınıf bazlı rezervasyon ⚠ | Demo onaylı sınıf; gerçek araç şart | Çelişki | **Karar iste** (K-3) | **P0** | Müsaitlik motoru kapsamı |
| Demo → `@acarvo/shared` | Demo kendi motorunu kullanıyor | Sessiz sapma | **Birleştir** | **P0** | Entegrasyon güvenliği |
| Booking: inline yeni müşteri + varsayılan onay | Demoda yok; varsayılan "Bekliyor" | Fazla adım, çifte kiralama riski | **Derinleştir** (demo) | **P0** | En sık akış |
| Teslim Masası beyan/adım sayısı | 6 adım, 2 beyan, 4 foto tıklaması (demo) | ~26 eylem | **Sadeleştir** (kapılar korunur) | **P1** | Günlük hız |
| Ana Ekran "Bekleyen işlerim" satırı | Dağınık | Onay/görev kaçar | **Derinleştir** | **P1** | Sahip/yönetici |
| Birleşik "Bekleyen işlerim/İşlerim" kuyruğu (Onay Merkezi) ⚠ | Onaylar 6+ yerde | Darboğaz | **Birleştir** (yeni tür değil, birleşik inbox) | **P1** | Hız, denetim |
| Komuta Merkezi ⚠ | 4 sekme; ~%80 tekrar | Dağınık "dikkat" yüzeyleri | **Başka bölüme taşı / birleştir** | **P1** | Tekrar |
| Görevler (gerçek) | Yok | Orta ölçek için gerekli | **Yeni özellik** (tek sorumlu+havuz) | **P1** | Operasyon düzeni |
| Bildirim kutusu (gerçek) | Yok | Görev/onay görünmez | **Yeni özellik** (uygulama içi) | **P1** | Görevle birlikte |
| Şube Kasaları + günlük kapanış | Demoda var, gerçekte yok | Nakit mutabakatı | **Yeni özellik (gerçek)** | **P1** | Nakit işletme |
| Masraflar + araç alanı | Demoda araç alanı yok | Araç maliyeti hesaplanamaz | **Derinleştir** | **P1** | Sahip sorusu |
| Raporlar: 3 çekirdek rapor | Gerçekte yok | Sahip gün sonu | **Yeni özellik** | **P1** | Sahip değeri |
| İşlem Geçmişi ekranı (gerçek) | Veri var, ekran yok | Güven/denetim | **Yeni özellik (ucuz)** | **P1** | Veri hazır |
| Sigorta paketi → fiyat hattı (gerçek) | `notApplied` | CDW/SCDW pazarda sık | **Derinleştir** | **P1** | Gelir |
| Fiyatlandırma vs Ayarlar sahipliği ⚠ | Vergi/sigorta Fiyatlandırma'da | Politika dağınık | **Başka bölüme taşı** (politika→Ayarlar) | **P1** | Şartname §74 |
| Olay bildir giriş noktası | 4 modül | Yanlış yerde kayıt | **Yeni özellik** (frontend) | **P2** | Kullanılabilirlik |
| Hasar sorumluluk+tek ücret (gerçek) | Bulgu var, sorumluluk yok | Tahsil edilemeyen hasar | **Derinleştir** | **P1** | Para |
| Kurumsal kredi limiti (gerçek) | Yok | Kurumsal müşteri riski | **Derinleştir** (basit limit) | **P1** | Alacak riski |
| Müşteri hızlı form, birleştirme (gerçek) | Hızlı form ✘; birleştirme ✘ | Hız, mükerrer | **Derinleştir** | **P1 / P2** | Resepsiyon |
| i18n mimarisi (gerçek) ⚠ | Tek dil | Uluslararası hedef | **Yeni özellik** (altyapı) | **P1** | Yurtdışı |
| İçe aktarma (araç/müşteri) | Yok | Geçiş | **Yeni özellik** | **P1** | Benimseme |
| Takvim + Kapasite tek bileşen ⚠ | 3 zaman çizelgesi | Tekrar | **Birleştir** | **P2** | Tutarlılık |
| Riskler → Uyarılar birleştirme ⚠ | Aynı 30 kayıt | Tekrar | **Birleştir** | **P2** | Tekrar |
| Filo Analizi → Raporlar ⚠ | Aynı sayılar 3 yerde | Tekrar | **Başka bölüme taşı** | **P2** | Tekrar |
| Gelir Kontrolü yeniden tasarım ⚠ | 6/9 kontrol değişmez testi | Sahte güvence | **Başka bölüme taşı** (Finans "Dikkat") + **içeriği yenile** | **P4→P2** | Gerçek sinyal |
| Talep Merkezi, Partnerler, Partner Portalı | Demoda | V1 dışı kitle | **Ertele** | **P2 / P3 / P3** | Dar kitle |
| Araç Tedarikçileri / alt-kiralama ⚠ | Demoda 4 sekme | ~425 satır şartname | **Ertele** (V2) | **P3** | Maliyet/kitle |
| Anahtar takibi, ekipman listesi, yol yardım, sigorta dosyası, araç alım-satım | Spec'te; demoda kısmen/yok | Niş | **Ertele** | **P3** | V2 |
| Görsel A4 şablon editörü (§85.3) | Gerçekte metin şablonu + alan | Yüksek maliyet | **Ertele** (sabit şablon+logo yeter) | **P3** | Maliyet |
| QR araç arama | Spec | Düşük kullanım | **Ertele** | **P3** | V2 |
| Kurallar (IF/THEN) ⚠ | Demoda | Kullanım düşük | **Ertele** / kaldırma kararı | **P3** | V2 |
| Fırsatlar ⚠ | Demoda | Filtrelerin tekrarı | **Kaldırılması için kullanıcı kararı iste** | **P4** | Düşük değer |
| Filo Asistanı ⚠ | Demoda | Filtrelerin tekrarı | **Kaldırılması için kullanıcı kararı iste** (işlev: kayıtlı filtre + arama) | **P4** | Düşük değer |
| Belge Merkezi ⚠ | Demoda | Aynı bilgi başka yerde | **Birleştir** (global arama kapsamı) | **P3** | Tekrar |
| Vardiya Devri | Salt okunur özet | Gerçek devir yok | **Derinleştir** veya ertele | **P2** | Spec §59M |
| Platform Konsolu UI + abonelik mock | Demoda | Faturalama yok | **Ertele** (CLI aracı P1) | **P2/P3** | Operatör aracı yeter |
| KVKK/GDPR ekranları | Demoda | Hukuk kararı yok | **Ertele** | **P3** | Part IV |
| Ana Ekran, Rezervasyonlar, Kiralamalar, Araçlar, Müşteriler, Fiyatlandırma, Finans, Bakım, Hasar, Şubeler, Ayarlar | Çekirdek | — | **Aynen koru** (bu listedeki iyileştirmelerle) | **P0/P1** | Çekirdek |

**Düşük değer / yüksek maliyet:** alt-kiralama alanı; görsel A4 şablon editörü; kural motoru; Fırsatlar+Filo Asistanı; KVKK/GDPR ekranları; anahtar/ekipman/yol yardım/sigorta dosyası alanları; platform abonelik arayüzü; partner/tedarikçi performansı. Birlikte V1 ekran/akış yükünün belirgin bir kısmı; çekirdek kullanıcı değeri düşük [Ö] (oran ölçülmedi).

### J.2 Önemli bulgular — ayrıntılı format

**B-1 · Gerçek ürün yeni müşteri devreye alamaz**
- **Sorun:** Kullanıcı/rol/davet/şifre sıfırlama ve ilk kurulum akışı yok. **Kanıt:** `api/modules/auth/routes.ts` (giriş, çıkış, oturum, şirket değiştirme, oturum iptali), `nav.ts` (`kullanicilar`, `roller-ve-yetkiler` `built` değil), `auth/roles.ts` (3 rol). **Kullanıcı etkisi:** Her işletme bir mühendise bağımlı. **Öneri:** davet + rol + şube kapsamı + pasifleştirme + şifre sıfırlama; kurulum kontrol listesi. **Alternatif:** ilk müşteriler için operatör CLI aracı (geçici). **Öncelik:** P0. **Bağımlılık:** backend+frontend. **Güvenlik riski:** Var (şifre sıfırlama, davet bağlantısı; oturum/CSRF mevcut altyapıyla). **Ürün kararı:** Evet (K-12). **Durum:** [D].

**B-2 · Finans modeli iki ürün**
- **Sorun:** Demoda ödeme kaydedilince uygulanır; gerçekte başka yetkili doğrulayana kadar bakiyeden düşmez; çok para birimi/kaparo/kasa yalnız demoda. **Kanıt:** FINANS raporu §3/§19; `d/core/types.ts` `Payment.status`. **Etki:** satış beklentisi ve entegrasyon çatışması. **Öneri:** doğrula-uygula tabanlı tek model, doğrulama ayarlı; ek yetenekler ayarla açılan modül. **Alternatif:** demoyu gerçeğe göre **geri çekmek** (kaparo/kur/kasa'yı "gelecek" rozetiyle işaretlemek). **Öncelik:** P0. **Bağımlılık:** ikisi. **Güvenlik:** 🔒 Yüksek (para). **Ürün kararı:** Evet (K-2, K-4). **Durum:** [D].

**B-3 · İki iş kuralı kodu**
- **Sorun:** `@acarvo/shared` demoda yok. **Kanıt:** `grep` 0 dosya; çekirdek 6,6 bin satır. **Etki:** aynı kiralama farklı fiyat/gün/müsaitlik. **Öneri:** demoyu ortak paketteki para/zaman/fiyat motoruna bağlamak; kalan kurallar (müsaitlik/finans) için ortak saf fonksiyon paketi. **Alternatif:** demoyu dondurup yalnız satış sunumu olarak kullanmak ve etiketlemek. **Öncelik:** P0. **Bağımlılık:** frontend (demo)+shared. **Güvenlik:** yok. **Karar:** mühendislik; K-15 ile ilişkili. **Durum:** [D].

**B-4 · Küçük işletme kilidi**
- **Sorun:** FN1 tek kişilik işletmeyi durdurur. **Kanıt:** FINANS §19/§21 madde 5. **Öneri:** doğrulama politikası (her tahsilat / eşik üstü / yok+sahibe rapor). **Alternatif:** küçük işletme profili otomatik "kendi onayı + sahip bildirimi". **Öncelik:** P0. **Bağımlılık:** backend+frontend. **Güvenlik:** 🔒 Orta (kontrol zayıflar; denetim izi korunmalı). **Karar:** Evet (K-4). **Durum:** [D]/[Ö].

**B-5 · Onaylar dağınık**
- **Sorun:** Gerçekte 8+ dört göz akışı ayrı kuyruklarda. **Kanıt:** dashboard etiketleri, finans bekleyen kuyruk, schema. **Öneri:** birleşik "bekleyen işlerim" (yeni onay türü eklemeden). **Alternatif:** Ana Ekran'da tek sayaç + her türe kısa yol. **Öncelik:** P1. **Bağımlılık:** backend (kuyruk sorgusu)+frontend. **Güvenlik:** Düşük (yetki filtresi şart; yetkisiz kayıt sayaca sızmamalı). **Karar:** K-9. **Durum:** [D] dağınıklık / [Ö] çözüm.

**B-6 · Booking akışı**
- **Sorun:** inline yeni müşteri yok; varsayılan Bekliyor; Teslim Masası ağır. **Kanıt:** `BookingWorkspace.tsx`, `ReservationFormPage.tsx:151`, senaryo 2 testi. **Öneri:** inline müşteri, yetkin varsa varsayılan onay, masada tek onay. **Alternatif:** "yürüyen müşteri" hızlı kiralama kısayolu. **Öncelik:** P0 (inline+varsayılan), P1 (masa). **Bağımlılık:** frontend. **Güvenlik:** Düşük (belge/availability kapıları kalır). **Karar:** hayır (UX) — ama varsayılan onay iş kuralı: K-3 ile birlikte. **Durum:** [D]/[Ö].

**B-7 · Sınıf bazlı rezervasyon çelişkisi**
- **Sorun:** Spec ve demo: onaylı sınıf-only kapasite tüketir; gerçek: onay için araç zorunlu (R1, DB kısıtı). **Kanıt:** REZERVASYON raporu karar A, demo `Capacity`. **Etki:** Kapasite Planlama/Takvim gerçekte uygulanamaz. **Öneri:** Önce karar: küçük işletme "araç şart"; büyük işletme sınıf kapasitesi (ayarla açılan). **Alternatif:** V1'de araç şart, V1.5'te sınıf. **Öncelik:** P0 (karar). **Bağımlılık:** backend. **Güvenlik:** Düşük; **çifte kiralama riski** yüksek → atomik atama şart. **Karar:** K-3 ⚠. **Durum:** [D].

**B-8 · Gelir Kontrolü içeriği**
- **Sorun:** 9 kontrolün 6'sı sistem değişmezi. **Kanıt:** `RevenuePage.tsx`. **Etki:** sahte güvence. **Öneri:** değişmezleri test çıktısına ayırın; yerine 4 gerçek sinyal. **Alternatif:** ekranı Finans "Dikkat"e taşıyıp yalnız 3 gerçek durumu bırakmak. **Öncelik:** P4→P2. **Bağımlılık:** frontend (demo) / backend (gerçek). **Güvenlik:** yok. **Karar:** K-6 ⚠. **Durum:** [D].

**B-9 · Politika sahipliği dağınık**
- **Sorun:** Vergi/sigorta Fiyatlandırma'da, süre kuralı Ayarlar'da; depozito 3 yerde; kural/eşik/onay/rol ayrı. **Kanıt:** `SettingsPage.tsx:16-27`, `PricingPage.tsx:40-41`, spec §74/§82.8. **Öneri:** "veri iş ekranında, politika Ayarlar'da, kural motoru yalnız uyarı". **Alternatif:** Ayarlar'a "Politikalar" dizin sayfası (§74 tablosu). **Öncelik:** P1. **Bağımlılık:** frontend. **Güvenlik:** Düşük. **Karar:** K-6. **Durum:** [D].

**B-10 · Çok dilli arayüz yok (gerçek)**
- **Sorun:** i18n mimarisi yok. **Kanıt:** `apps/web/src` içinde çeviri altyapısı yok. **Etki:** yurtdışı satış engeli; demonun EN'i taşınamaz. **Öneri:** gerçek i18n katalogu (anahtar tabanlı), önce 2 dil. **Alternatif:** V1'de yalnız TR + sözleşme dilleri (mevcut). **Öncelik:** P1. **Bağımlılık:** frontend (büyük, yatay iş). **Güvenlik:** yok. **Karar:** K-10. **Durum:** [D].

**B-11 · Kapsam şişmesi**
- **Sorun:** V1'de V2 işleri. **Kanıt:** spec §59U–AD, §59BA–BC, §59BL–BO, §59CN. **Öneri:** çekirdek/V1.5/V2 etiketleme. **Alternatif:** "feature flag" ile şartnamede kal, V1'de açılmasın. **Öncelik:** P0 (karar). **Bağımlılık:** şartname. **Güvenlik:** yok. **Karar:** K-1 ⚠. **Durum:** [D] başlıklar / [Ö] etiket.

**B-12 · Araç başına maliyet hesaplanamaz**
- **Sorun:** Masraflarda araç alanı yok. **Kanıt:** `Expense` tipi. **Etki:** sahibin "hangi araç masraf çıkarıyor" sorusu eksik. **Öneri:** araç alanı + araç maliyet görünümü. **Alternatif:** yalnız bakım+ceza+hasar kaynaklı toplam. **Öncelik:** P1. **Bağımlılık:** ikisi. **Güvenlik:** yok. **Karar:** K-17. **Durum:** [D].

**B-13 · Model var, arayüz yok / ölü uyarı**
- **Sorun:** `paymentPlans` ve `shifts` arayüzsüz. **Kanıt:** `grep` 0. **Etki:** hiç oluşturulamayan şey için uyarı. **Öneri:** ya arayüz ya kaldır (karar). **Öncelik:** P2. **Bağımlılık:** frontend (demo). **Güvenlik:** yok. **Karar:** K-8. **Durum:** [D].

**B-14 · "Teklif" terimi iki anlamda**
- **Sorun:** gerçek `price_quotes` = fiyat dondurma; demo Quote = satış teklifi. **Etki:** entegrasyon karışıklığı. **Öneri:** "Fiyat kaydı/Fiyat teklifi" ve "Satış teklifi" ayrımı. **Öncelik:** P2. **Bağımlılık:** ikisi. **Güvenlik:** yok. **Karar:** K-16. **Durum:** [D].

---

## K. Kullanıcı onayı gereken kararlar

Hiçbiri uygulanmadı. Her karar için **önerim** yazıldı; karar sizin.

| # | Karar | Seçenekler | Önerim | Etki |
|---|---|---|---|---|
| K-1 ⚠ | **V1 çekirdeği ve kapsam etiketleme** | (a) şartname olduğu gibi (b) çekirdek / V1.5 / V2 etiketleri (c) V2 öğelerini şartnameden çıkar | **(b)** | Her şeyin sırası |
| K-2 🔒 | **Finans modeli:** kaydet → doğrula → uygula tek model; çok para birimi/kur, kaparo, depozito mahsubu V1'de mi? | V1'de hepsi / ayarla açılan modül / V1.5 | **Tek model + çok para birimi ayarla açılan; kaparo ve mahsup V1.5** (sınır bölgesi müşterileri için erken) | Para, demo, backend |
| K-3 ⚠ | **Sınıf bazlı rezervasyon:** onay için araç şart mı? | Araç şart / sınıf kapasitesi / ayarla seçilir | **V1'de araç şart; sınıf kapasitesi V1.5 ayarla** | Kapasite, takvim, atomik atama |
| K-4 🔒 ⚠ | **Dört göz kapsamı** | Her işlem / eşikli / küçük işletmede kapalı+rapor | **Eşikli, ayarlı** (kritik işlemler hep dört göz: iade, finansal düzeltme, hasar engeli) | Küçük işletme kullanımı |
| K-5 | **Sözleşme sahipliği:** ACARVO üretir+imza mı, dış süreç mi (K1)? | ACARVO imza (hukuki onay şart) / dış süreç / ikisi | **V1: dış süreç + ACARVO taslak/PDF; imza hukuki onaydan sonra** | Teslim kapısı, demo |
| K-6 ⚠ | **Menü yapısı (36 → ?)** — birleştirme önerileri | 36 aynen / ~31 (Komuta→İşlerim, Riskler→Uyarılar, Kapasite→Takvim, Filo Analizi→Raporlar, Gelir Kontrolü→Finans, Belge Merkezi→Arama) | **~31, şartname revizyonuyla**; tasarım sprintinden **önce** | Tasarım, test |
| K-7 | **Talep Merkezi, Partnerler/Portal, Tedarikçiler** V1'de mi? | V1 / V1.5 / V2 | **Talep: V1.5; Partner/Portal/Tedarikçi: V2** | Kapsam |
| K-8 ⚠ | **Kurallar, Fırsatlar, Filo Asistanı** | Koru / ertele / kaldır | **Ertele (V2)**; kaldırma için sizin kararınız | Kapsam |
| K-9 ⚠ | **Birleşik "bekleyen işlerim"** (yeni onay türü değil) | Evet / hayır | **Evet** | Yönetici hızı |
| K-10 | **Dil stratejisi** (arayüz + belge) | TR / TR+EN / çok dil | **TR+EN arayüz katalogu; belge dili şablonla** | Tüm arayüz metni |
| K-11 | **Roller:** Muhasebe rolü, özel rol V1'de mi? | 3 hazır / +Muhasebe / özel rol editörü | **+Muhasebe; özel rol V1.5** | Küçük/orta işletme |
| K-12 | **Kurulum ve sade mod:** sihirbaz, modül anahtarları, içe aktarma | Hepsi / yalnız sihirbaz | **Sihirbaz + modül anahtarı V1; içe aktarma V1.5 başı** | Benimseme |
| K-13 | **Kaparo:** kısmi iade, politika bedeli dört göz | Mevcut demo / dört göz+kısmi | **Politika bedeli dört göz; kısmi iade V1.5** | Finans |
| K-14 | **Hukuki:** vergi, sözleşme imzası, saklama, kişisel veri | — | **Hukuk danışmanlığını tasarım sprinti ile paralel başlatın** | Üretime çıkış |
| K-15 | **Demonun rolü** | Satış aracı (gerçekle hizalı) / konsept (rozetli) | **Hizalı satış aracı; olmayan özelliklere "yakında" rozeti** | İtibar, bakım |
| K-16 | **"Teklif" terimi** | Ayır / aynen | **Ayır** | Entegrasyon |
| K-17 | **Masraflarda araç alanı** | Evet / hayır | **Evet** | Sahip raporu |
| K-18 | **Demoyu ortak pakete bağlamak** | Evet / dondur | **Evet (ya da dondur)** | Sapma |

---

## L. Önerilen yeni geliştirme yol haritası

Sizin listenizdeki sıra (1 işlevsel eksikler → 2 iş akışı → 3 sadeleştirme → 4 frontend → 5 kararlar → 6 tasarım → 7 backend) üzerinde **iki değişiklik** öneriyorum ve gerekçelerini yazıyorum:
- **Kararlar (5) en başa** gelmeli: sadeleştirme (3), menü yapısı ve finans modeli onaysız yapılamaz; yanlış sırada yapılan iş çöpe gider.
- **Kritik backend çekirdeği (kullanıcı/kurulum)** tasarım sprintiyle **paralel** başlamalı: tasarımı beklemez, ürünü kullanılabilir kılan en kısa yoldur.

| Aşama | İş | Neden bu sırada | Bağımlılık |
|---|---|---|---|
| **0 · Karar oturumu** (1–2 gün) | K-1…K-18'den en az K-1, K-2, K-3, K-4, K-6, K-9, K-12, K-15 | Her şeyin şekli | — |
| **1 · Demoyu gerçekle hizala ve sadeleştir** (frontend) | Finans akışı (K-2), booking akışı (inline müşteri, varsayılan onay), Teslim Masası sadeleştirme, `@acarvo/shared`'a geçiş, olmayan özelliklere rozet | Demo satışta bugün yanıltıcı; ucuz | Aşama 0 |
| **2a · Gerçek çekirdek: kullanıcı/rol/davet + kurulum sihirbazı + Muhasebe rolü** (backend+frontend) | A.2 #1, #12 | Ürünü devreye alınabilir kılar | Aşama 0 (K-11, K-12) |
| **2b · Gerçek finans modeli tamamlama** (doğrulama politikası, sonra kaparo, mahsup, çok para birimi *kararlıysa*) | A.2 #2, #7 | Para; küçük işletme kilidi | K-2, K-4 |
| **3 · Menü yapısı ve bilgi mimarisi dondurma** (şartname revizyonu) | K-6, K-8, K-9 sonuçları | Tasarımdan önce olmalı | Karar |
| **4 · Premium tasarım sprinti** | 31 (veya karar kadar) ekran, birleşik kuyruk, sade mod | Yapı dondu → tasarım tek seferde | Aşama 3; K-10 (metin uzunluğu) |
| **5 · Gerçek modüller (yüksek değerden)** | Görevler+bildirim → Raporlar(3)+gün sonu → Masraflar(+araç)+Kasa → İşlem Geçmişi ekranı → birleşik kuyruk → sigorta paketi | Orta ölçek ihtiyaçları | Aşama 2 |
| **6 · V1.5** | Talep Merkezi, sınıf kapasitesi (K-3), içe aktarma, mükerrer birleştirme, Kurumsal kredi/ekstre | Derinlik | — |
| **7 · V2** | Alt-kiralama, partner/portal, kural motoru, KVKK ekranları, anahtar/ekipman/yol yardım/sigorta dosyası, platform fatura | Dar kitle | — |

**Tasarım sprintinden önce kesinleşmesi gereken kararlar:** K-1, K-6 (menü sayısı!), K-8, K-9, K-10 (dil metin uzunluğu), K-12 (sade mod), K-15 (demo rolü).
**Gerçek backend'e geçmeden önce:** K-2, K-3, K-4, K-5, K-10, K-11, K-14, K-16, K-17.

---

## M. Sonuç

**1. En güçlü taraflar.** Domain disiplini (Rezervasyon≠Kiralama, Müsaitlik≠Hazırlık, Kaparo≠Depozito, Kaydedildi≠Doğrulandı…) şartnamede, gerçekte ve demoda tutarlı; gerçek backend'in **güvenlik ve bütünlük** düzeyi yüksek (RLS, dört göz, idempotency, kilitler, şifreli belge, 534 API testi); gerçek 12 ekran derin; demo, tüm yaşam döngüsünü etkileşimli gösterebilen **güçlü bir keşif/satış aracı**.

**2. En zayıf taraflar.** Kapsam disiplini (V1'e V2 yüklenmiş); demo–gerçek ayrışması; küçük/orta işletme uygunluğu (dört göz kilidi, kurulum yükü); dağınık "dikkat" yüzeyleri; gerçek ürünün kullanıcı/kurulum/rapor/görev/kasa/bildirim eksikliği; tek dil.

**3. En kritik işlevsel eksikler (gerçek).** Kullanıcı/rol/davet/şifre + ilk kurulum; tahsilat doğrulamasının ayarlanabilirliği; görevler+bildirim+birleşik onay kuyruğu; 3 çekirdek rapor + gün sonu; masraf (araç) ve şube kasası; işlem geçmişi ekranı; sigorta paketi ve hasar sorumluluğu; içe aktarma; i18n.

**4. Gereksiz derecede karmaşık özellikler.** Alt-kiralama alanı; görsel A4 şablon editörü; kural motoru; 8 farklı "dikkat" yüzeyi; her tahsilatta zorunlu dört göz; Fırsatlar/Filo Asistanı; çok alıcılı görev duyurusu; kaparo+mahsup+çok para birimi birlikte V1'de; Teslim Masası'nda tekrar eden beyan/tıklama adımları.

**5. Sadeleştirilecek bölümler.** Ana Ekran–Komuta Merkezi–Riskler–Uyarılar (tek "bugün" + tek "işlerim"); Fiyatlandırma–Ayarlar politika sahipliği; Analiz beşlisi (Raporlar çatısı + Takvim kapasite modu); Finans'ın okuma yinelemesi; Teslim Masası; booking akışı.

**6. Derinleştirilecek modüller.** Kullanıcılar/Roller/Kurulum; Finans (tek model); Raporlar; Masraflar (araç); Şube Kasaları; Hasar (sorumluluk+tek ücret); Fiyatlandırma (sigorta/km/yakıt); Kurumsal (basit limit); İşlem Geçmişi (ekran).

**7. Rent-a-car sahibine sunum açısından ne eksik?** (a) Demo'da gösterilenin **gerçekte neresinin olduğu** — rozet/dürüst durum; (b) tek sayfalık "bugün + işlerim" sahip ekranı; (c) **gün sonu özeti** ve araç başına maliyet; (d) küçük işletme için "sade mod" gösterimi; (e) kurulumun nasıl yapıldığı (ilk gün hikâyesi); (f) fiyat ve sözleşmenin hukuki durumu hakkında net dil. Bugünkü demo sahibe "her şey var" izlenimi verir, ama **sahip için en çok değer taşıyan 5 şey** (günlük tahsilat, alacak, kullanım, araç maliyeti, bekleyen onaylar) tek ekranda görünmez.

**8. Tasarım sprintinden önce hangi kararlar?** K-1, K-6, K-8, K-9, K-10, K-12, K-15 (L bölümü).

**9. Backend'den önce hangi ürün kararları?** K-2, K-3, K-4, K-5, K-10, K-11, K-14, K-16, K-17.

**10. İlk beş önceliğimiz.**
1. **Karar oturumu:** K-1, K-2, K-3, K-4, K-6 (menü ve finans modeli kesinleşmeden hiçbir şeyi büyütmeyin).
2. **Gerçek çekirdek:** kullanıcı/rol/davet + kurulum sihirbazı + Muhasebe rolü.
3. **Finans tekleştirme:** doğrula-uygula tek model, doğrulama politikası ayarlı; demoyu hizalayın.
4. **Günlük akış sadeleştirme:** booking (inline müşteri, varsayılan onay) + Teslim Masası + Ana Ekran "Bekleyen işlerim".
5. **Sahip değeri:** 3 çekirdek rapor + gün sonu + araç başına maliyet + işlem geçmişi ekranı.

---

*Bu analiz bağımsız bir denetimdir: önceki sprintlerde alınan kararlar (benim yazdığım demo dahil) otomatik doğru kabul edilmedi. Doğrulanamayan yerler [?], çıkarım niteliğindekiler [Ö] işaretlidir. Gerçek uygulamanın canlı arayüzü açılmadı; gerçek taraf kod ve geliştirme raporlarıyla değerlendirildi.*
