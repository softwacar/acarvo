# ACARVO GLOBAL — V1 Ürün Mimarisi ve Kesin Kararlar

**Product Architecture & V1 Scope Finalization** · 20.10.2026
Dal: `frontend-prototip-v1` (son commit `9d7fa45`) · main: `44354d0` · Demo: `http://localhost:5174`

> **Bu belge bir karar belgesidir. Hiçbir karar yazılıma uygulanmamıştır.** Bu çalışmada hiçbir kod, ekran, rota, sidebar bağlantısı, veritabanı, migration, `.env`, demo verisi veya şartname değiştirilmedi; hiçbir özellik silinmedi; commit, merge ve push yapılmadı. Ana klasördeki 6 silinmiş görünen izlenen dosyaya dokunulmadı (bu belgenin kaynakları worktree'deki kopyalardan salt okunur okundu).
> Yazılan tek dosya budur. Bir sonraki aşamalar (frontend sprinti, tasarım sprinti, backend) bu belgeyi girdi olarak kullanır; onlar için gerekli somut işler **O, P ve R bölümlerindedir**.

---

## 0. Bu belgeyi nasıl okumalı

### 0.1 Karar kaynağı etiketleri
Her kararın yanında kaynağı yazılıdır, böylece neyi sizin verdiğinizi, neyi bu çalışmanın önerdiğini ayırt edebilirsiniz:
- **[PS]** Ürün sahibi kararı — talimatınızda açıkça yazılı; tartışmaya açık değil.
- **[PS+]** Ürün sahibi yönü + bu belgenin ayrıntılandırması.
- **[BK]** Belge kararı — talimatınız bırakmıştı; bu çalışmada, analiz raporuna ve koda dayanarak verildi. **Siz değiştirmek isterseniz yalnız o satır değişir.**

### 0.2 Olgunluk ve kapsam etiketleri (K-15: demonun rolü)
İki bağımsız eksen kullanılır. Bir modül hakkında konuşan her tablo iki eksende de etiketlenir.

| Eksen | Etiket | Anlamı |
|---|---|---|
| **Bugünkü olgunluk** | **Gerçek** | Gerçek backend'e bağlı, `main`da çalışıyor, sunucu güvenliğiyle |
| | **Kısmen gerçek** | Gerçekte bir kısmı var; kalan kısmı demo/yok |
| | **Demo** | Yalnız tarayıcıdaki demo prototipte; sunucu garantisi yok |
| | **Yok** | Henüz hiçbirinde yok |
| **Hedef kapsam** | **V1** | İlk gerçek sürümde geliştirilecek |
| | **V1.5** | V1'den hemen sonra, gelişmiş operasyon |
| | **V2** | İleri seviye; ürün haritasında, günlük menüde değil |

**Sunum kuralı:** Hiçbir "Demo" veya "Yok" öğesi, satış sunumunda veya ürün ekranlarında teslim edilebilir bir özellik gibi anlatılmaz. Demoda gösterilen ama gerçekte olmayan her işlev demo içinde görünür bir **"Demo konsepti"** rozetiyle işaretlenir (bkz. N).

### 0.3 Kaynaklar
Ana başvuru: `docs/ACARVO_KAPSAMLI_URUN_ANALIZ_RAPORU.md` (B, D, E, H, J, K, L bölümleri). Ayrıca: şartname (`ACARVO_GLOBAL_WEB_UI_V1_SPEC.md`, özellikle §4, §9–§13, §21, §59, §64–§65, §74, §82, §85, Part IV), `docs/TEKNIK_UYGULAMA.md`, iki prototip raporu, `docs/GELECEK_MODULLER_PLANI.md`, 8 gerçek modül geliştirme raporu, gerçek kaynak kod (`apps/api`, `apps/web`, `packages/shared`). Bu belge o raporun özeti değildir; analizden **uygulanabilir karara** geçer.

---

## A. Yönetici özeti

### A.1 Yeni ACARVO V1 nedir?

> **Küçük işletmeler için sade, büyük işletmeler için gelişmiş, herkes için güvenilir ACARVO.**

V1; bir rent-a-car çalışanının ilk açılışta günlük işini (rezervasyon → teslim → iade → tahsilat → görev) yapabildiği, bir sahibin "şirketimde ne oluyor, bana ne düşüyor?" sorusunu iki ekranda yanıtlayabildiği çekirdek üründür. Gelişmiş modüller şirketin ihtiyacına göre **açılır**, görünürlük **çalışma profiline** ve **yetkiye** bağlıdır; güvenlik **sunucudadır**, menü güvenliğin yerine geçmez.

### A.2 Verilen en önemli kararlar (özet)

| # | Karar | Kaynak |
|---|---|---|
| 1 | **Görevler** ayrı, temel, her profilde görünen modüldür; V1'dir; Komuta Merkezi/İşlerim'e gömülmez | [PS] |
| 2 | **İşlerim** (Komuta Merkezi'nin yeniden tanımı) görev, onay ve uyarıyı **kaynaklarına bağlayarak** tek kuyrukta gösterir; Görevler'in yerini almaz; yedinci onay türü yoktur | [PS+] |
| 3 | Sidebar **36 → 21 bağlantı (V1)**, 22 (V1.5), 27 (V2); 7 grup → 6 grup; hiçbir işlev silinmez | [BK] |
| 4 | **Tek finans modeli:** Kaydedildi → Doğrulandı → Uygulandı → Mutabakat → Denetim; risk seviyeli doğrulama; tek kişilik işletme için *dürüst* model | [PS+] |
| 5 | **Rezervasyon:** V1'de onay için belirli araç; iki ayrı eylem (*Bekleyen Kaydet* / *Kontrol Et ve Onayla*); sınıf kapasitesi V1.5 | [PS+] |
| 6 | **Kaparo:** şirket politikasına göre otomatik politika bedeli, **kısmi iade V1**, beş satırlı kaparo defteri | [PS+] |
| 7 | **Dört seviyeli risk modeli;** Seviye 2 işlemler her zaman bağımsız onay ister; sahte dört göz yok | [PS+] |
| 8 | Talepler V1.5; Partner/Portal/Tedarikçi/Alt-kiralama/Filo Asistanı/Fırsatlar/Kurallar **V2** (kod korunur) | [PS] |
| 9 | Çalışma profili (Sade/Standart/Gelişmiş) + modül anahtarları + **ilk kurulum sihirbazı** (V1) | [PS+] |
| 10 | Dil: arayüz **TR+EN** (V1), belge dili ayrı; ortak hesaplama **`@acarvo/shared`** üzerinde tek otorite (K-18) | [PS+] |

### A.3 Sonraki üç aşama bu belgeyle ne yapar?

1. **Frontend sprinti (Prompt 2):** O bölümündeki 47 satırlık değişiklik matrisi; her satırda test edilebilir kabul ölçütü var.
2. **Tasarım sprinti (Prompt 3):** P bölümü kapsamı; **bu belgenin onayı olmadan başlamaz** (özellikle menü yapısı H ve profiller K).
3. **Backend (Prompt 4):** R bölümü bağımlılık haritası; frontend kapsamının tamamlanması backend'in hazır olduğu anlamına gelmez.

### A.4 Bu belge neyi **yapmaz**
Hukuki doğruluk, vergi, e-imza geçerliliği veya üretim hazırlığı iddiasında bulunmaz; bunlar **S bölümünde açık doğrulama gereksinimi** olarak listelidir.

---

## B. Ürün felsefesi

### B.1 Hedef işletme profilleri (örnek; performans garantisi veya segment sınırı değildir)
| Profil | Örnek | Ürün ihtiyacı |
|---|---|---|
| **Küçük** | 10–20 araç, 1 şube, 2–3 kişi | Rezervasyon, kiralama, teslim/iade, depozito/tahsilat, hasar/bakım, **görevler**; en az menü, en az kurulum yükü |
| **Orta** | 50–100 araç, 2–5 şube | + kasa, masraf, rapor, onay, kurumsal müşteri, çok kullanıcı |
| **Büyük** | 300+ araç, çok şube | + gelişmiş kapasite, merkezi kontrol, çok para birimi, içe aktarma, ince yetki |

### B.2 Altı tasarım ilkesi
1. **Sadelik = görünürlük, yetkisizlik değil.** Küçük işletmeye *daha az menü* gösteririz; *daha az güvenlik* göstermeyiz. Gizlenen modül yetki veya veri kaybı değildir.
2. **Güvenlik sunucudadır.** Çalışma profili ve menü görünürlüğü yalnız arayüz kolaylığıdır; RLS, şube kapsamı, API yetkisi, dört göz ve kilitler değişmez.
3. **Bir gerçeğin bir evi vardır.** Her özellik tek bir "kaynak" ekranda yaşar; diğer ekranlar bağlantı verir. (İşlerim bir *projeksiyondur*, kayıt deposu değil.)
4. **Özellik sayısı başarı ölçütü değildir.** Bir özellik yalnız şartnamede var diye V1'e girmez; bir işlem yalnız menü sayısı için silinmez.
5. **Demo dürüstlüğü.** Demoda gösterilen, gerçekte olmayan özellik teslim edilebilir gibi sunulmaz (0.2, N).
6. **Karar önce, kod sonra.** Menü, finans modeli ve kapsam onaylanmadan sprint başlamaz.

### B.3 Çalışma profili (yeni kavram)
Bir şirketin **çalışma profili** (Sade / Standart / Gelişmiş) hangi modüllerin menüde *varsayılan görüneceğini* belirler. Sahip modülleri tek tek açıp kapatabilir. Profil:
- yalnız **görünürlüktür** (B.2-1, B.2-2);
- **Görevler, İşlerim, Rezervasyonlar, Kiralamalar, Takvim, Araçlar, Müşteriler, Finans, Ayarlar** hiçbir profilde gizlenmez;
- kurulum sihirbazında önerilir, sonra değiştirilebilir (K, L).

---
## C. Kesin ürün kararları (K-1 … K-18)

Her karar: **Nihai hedef · Gerekçe · Korunacak güvenlik sınırı · Geliştirme aşaması · Bağımlılıklar.** Aşama: *Karar* (bu belge), *F* (Prompt 2: frontend), *T* (Prompt 3: tasarım), *B* (Prompt 4: backend).

### K-1 — Ürün V1 / V1.5 / V2 olarak ayrıldı [PS]
- **Hedef:** Tüm özellikler üç kapsama atanır (E, F, G). V1 = günlük işi yöneten çekirdek (21 menü bağlantısı); V1.5 = gelişmiş operasyon (Talepler, sınıf kapasitesi, kurumsal kredi, mükerrer birleştirme, içe aktarma, gelişmiş rapor, Olaylar/Cezalar sekmeleri, vardiya devri, çok para birimi/kaparo gelişmişi); V2 = Partner/Portal, Tedarikçi/Alt-kiralama, kural motoru, ayrı Filo Asistanı/Fırsatlar, anahtar-ekipman, sigorta dosyası, alım-satım, platform abonelik.
- **Gerekçe:** Analiz bulgusu B-11 (kapsam şişmesi: V1'e V2 işleri yüklenmiş); şartname §59U–§59AD (~425 satır alt-kiralama), §59BA–BC, §59BL–BO.
- **Güvenlik sınırı:** Değişmez. **V2'ye alınan demo kodu silinmez;** yalnız modül anahtarıyla menüden çıkar, "Demo konsepti" rozetiyle (N) kalır.
- **Aşama:** Karar (bu belge) → F (modül bayrakları).
- **Bağımlılık:** K-6 (menü), K-15 (demo rolü).

### K-2 — Tek finans modeli [PS+]
- **Hedef:** Demo ve gerçek aynı model: **Kaydedildi → Doğrulandı → Uygulandı → Mutabakat → Denetim geçmişi** (M.1). Çok para birimi, kaparo ve kasa "gelişmiş ama aynı model üzerinde" modüllerdir; ayrı bir "demo finansı" olmayacak.
- **Gerekçe:** A.2 #2 — demo "kaydet = uygula", gerçek "kaydet → başka yetkili doğrular". İki farklı ürün davranışı kabul edilemez.
- **Güvenlik sınırı:** Gerçek backend'in FN1–FN7 kuralları (tahsilat doğrulama, DB `CHECK`'ler, kalem dört göz, idempotency) **bu aşamada olduğu gibi kalır**; politika esnekliği ancak backend tasarımı + güvenlik incelemesiyle gelir (M.3, S).
- **Aşama:** Karar → F (demoyu hizala) → B (politika, kaparo, kasa, çok para birimi aşamalı).
- **Bağımlılık:** K-4, K-11, K-13, K-17, K-18.

### K-3 — Rezervasyon modeli [PS+]
- **Hedef:** V1: **belirli araca bağlı onay**. Sınıf bazlı rezervasyon = *bekleyen kayıt + sınıf uygunluğu ön izlemesi* (araç tutmaz, açıkça yazar). Rezervasyon ekranında iki ayrı eylem: **"Bekleyen Kaydet"** ve **"Kontrol Et ve Onayla"** (yetki + uygunluk + araç tahsisi + çakışma). Varsayılan, bekleyenin **araç bloke etmediğini** açıkça gösterir.
- **V1.5 sınıf kapasitesi — somut kapsam:** (1) şube×sınıf×gün kapasite defteri (uygun filo − blok − belirli tahsis); (2) onaylı sınıf talebi kapasite tüketir, onay tek DB işleminde kapasite satırlarına kilitle yapılır (aşırı rezervasyon yok); (3) sınıf→araç dönüşümü teslimde **atomik** (kapasite bırak + araç tahsis aynı işlem); (4) araç bulunamazsa üst/alt sınıf politikası ("ya da benzeri") ve iş akışı; (5) geciken iade (K2) kapasiteyi nasıl etkiler, yeniden değerlendirilir; (6) bekleyen/bekleme listesi bağlayıcı değil; (7) arayüz: Takvim → Kapasite görünümü, "sınıf garantili" ile "araç atandı" rozetleri ayrı; (8) testler: paralel onay yarışı, yaz/kış saati, çok şubeli iade.
- **Gerekçe:** Gerçek sistem R1: araç atanmadan onay yok (DB kısıtı `reservations_confirmed_vehicle_check`). Kapasite ayrı bir tahsis modeli gerektirir.
- **Güvenlik sınırı:** Atomik araç uygunluk ve kilit mantığı **korunur**; çifte kiralama koruması hiçbir arayüz değişikliğiyle gevşemez.
- **Aşama:** F (iki eylem, ön izleme dili), V1.5 → B (kapasite defteri).
- **Bağımlılık:** Takvim zaman çizelgesi bileşeni (A7), K-6.

### K-4 — Dört göz onayı: risk temelli [PS+]
- **Hedef:** İşlemler **dört risk seviyesine** ayrılır (M.2). Seviye 2 (yüksek risk) **her zaman bağımsız onay** ister; Seviye 1 için şirket politikası seçilir; tek kişilik işletme için **dürüst** (sahte dört göz olmayan) model tanımlıdır (M.3).
- **Gerekçe:** Analiz #4/B-4: tek kişilik işletmeyi kilitleyen model; ama güvenlik düşürülmeyecek. Drina örneği (1 Sahip + 1 Operasyon): bazı adımlar çalışıyor, bazıları kilitli (M.4).
- **Güvenlik sınırı:** Mevcut zorunlu ikinci onaylar **kaldırılmaz**. Yeni politika ancak backend tasarım + güvenlik doğrulaması sonrası (S, V-5).
- **Aşama:** Karar → F (demo kuralları) → B.
- **Bağımlılık:** K-2, K-9, K-11, K-12 (kurulumda "bağımsız yetkili" kontrolü).

### K-5 — Sözleşme modeli [PS]
- **Hedef:** **V1: ACARVO sözleşme hazırlama ve belge yönetimi + gerektiğinde dış imza süreci.** Şablonlar (6 dil), taslak, PDF, ön izleme, kiralama verisinden üretim, sürüm + snapshot korunur. Hukuki geçerliliği doğrulanmamış e-imza veya ülke uygunluğu iddiası yok. Gelişmiş e-imza entegrasyonu yalnız hukuki+teknik inceleme sonrası ayrı kapsam (V2).
- **Gerekçe:** Gerçekte sözleşme "dışarıda işleme alındı" (K1) modeliyle çalışıyor; imza ve hukuki onay açık konu (S).
- **Güvenlik sınırı:** Sözleşme erişim/indirme yetkileri ve kayıt izi korunur; K1 çalışma modu yalnız Sahip.
- **Aşama:** F (demo imza yakalama "Demo konsepti" rozeti) → B (gerçek taslak/PDF zaten var).
- **Bağımlılık:** K-14 (hukuk), K-12.

### K-6 — Yeni menü yapısı [PS+, ayrıntı BK]
- **Hedef:** 7 grup/36 bağlantı → **6 grup / 21 bağlantı (V1)**, 22 (V1.5), 27 (V2); iki katman: **Temel** ve **Gelişmiş** (H, I). Görevler daima Temel.
- **Gerekçe:** E bölümü (tekrar eden yüzeyler); 8 farklı "dikkat" yüzeyi → Ana Ekran + İşlerim; 3 zaman çizelgesi → 1 bileşen; Analiz beşlisi → Raporlar + Takvim modu + Finans "Dikkat".
- **Güvenlik sınırı:** Görünürlük ≠ yetki (B.2-2). Hiçbir işlev/veri/rota silinmez; eski rotalar yönlendirilir (I.2).
- **Aşama:** Karar → şartname §4 revizyonu (H.7 taslağı, onayınızla) → F → T.
- **Bağımlılık:** K-1, K-8, K-9, K-12.

### K-7 — Ticari modüller [PS]
- **Hedef:** Talep Merkezi **V1.5**; Partnerler, Partner Portalı, Araç Tedarikçileri, Alt-kiralama **V2**. V1'de talep kaynağı rezervasyonda **"Kaynak" alanı + müşteri notu + Fiyat Kaydı** ile korunur.
- **Gerekçe:** Dar kitle, yüksek maliyet; gerçekte yok.
- **Güvenlik sınırı:** Partner Portalı ayrı kimlik/oturum gerektirir → V2'de ayrıca tasarlanır.
- **Aşama:** F (bayrak), V1.5/V2 → B.
- **Bağımlılık:** K-16 (terim), K-1.

### K-8 — Düşük öncelikli alanlar V2 [PS]
- **Hedef:** Filo Asistanı, Fırsatlar, gelişmiş Kurallar ayrı çalışma alanı olarak V2. **İşlevleri kaybolmaz:** plaka/kiralama araması → **Global Arama**; "hazır olmayan araçlar", "geciken iade", "bakımı gelenler" → **kayıtlı filtreler**; faydalı takip önerileri → kaynak modülde (ör. sigorta önerisi Kiralama/Teslim Masası'nda tek satır); temel bildirim eşikleri → **Ayarlar → Bildirimler** (V1).
- **Gerekçe:** Analiz #3/#20/#25: sorguların çoğu mevcut listelerin filtresi.
- **Güvenlik sınırı:** Yok (arama yetki filtresiyle; yetkisiz kayıt sonuçta görünmez).
- **Aşama:** F → V2.
- **Bağımlılık:** Global Arama genişletmesi (A10).

### K-9 — Birleşik "İşlerim" kuyruğu [PS]
- **Hedef:** **İşlerim** = kullanıcının ilgilenmesi gereken **görev + onay + uyarı + geciken + müdahale gerektiren** kayıtların tek listesi (D.5). **Görevler ayrı modül olarak kalır.** Kuyruk bir **projeksiyondur** (kayıt deposu değil); her satır kendi kaynağına bağlanır; **yedinci onay türü eklenmez**; gerçekteki operasyonel dört göz adımları kendi domain akışlarında kalır ve kuyrukta görünür.
- **Gerekçe:** A.2 #5/#6: aynı soruya sekiz yüzey; onaylar 6+ yerde dağınık.
- **Güvenlik sınırı:** Kuyruk yalnız kullanıcının görmeye yetkili olduğu kaynakları listeler; sayaçlar/başlıklar yetkisiz kaynağı sızdırmaz.
- **Aşama:** F (demo) → B (kuyruk sorguları, bildirim).
- **Bağımlılık:** Görevler (D), Bildirimler, Onay kuyruğu sorgusu.

### K-10 — Dil stratejisi [PS+]
- **Hedef:** V1 arayüz **Türkçe + İngilizce**; yeni dil eklemek katalog eklemektir. **Belge dili arayüz dilinden ayrıdır** (sözleşme şablonları tr/bs/en/de/hr/sr korunur).
- **Teknik gereksinimler (sonraki sprintlere):** (1) anahtar tabanlı **tek çeviri kataloğu**, demo ve gerçek aynı altyapı; (2) **API hata ve olay çıktıları kod + parametre** olarak döner (bugün gerçek API Türkçe metin döndürür) ve arayüz dile göre çizer; (3) kalıcı özetler (işlem geçmişi, finans olayı) **çevrilmiş metin olarak değil, olay türü + parametre olarak saklanır** (demonun `B()` dizgesi bu yüzden gerçeğe taşınmaz); (4) tarih/sayı `Intl` ile şube saat dilimi ve kullanıcı yerel ayarına göre, para her zaman **ISO kodlu**; (5) eksik anahtarı derlemede yakalayan test + sahte yerel ayar; (6) PDF yazı tipi kapsamı (şu an Latin+Kiril); (7) terim sözlüğü (K-16 dahil).
- **Güvenlik sınırı:** Dil dosyaları kullanıcı verisi taşımaz; hata iletileri başka şirketin varlığını açıklamaz (mevcut kural).
- **Aşama:** F (altyapı) → B (hata kodları).
- **Bağımlılık:** Tasarım sprinti metin uzunlukları (P).

### K-11 — Kullanıcılar ve roller [PS+]
- **Hedef:** V1 roller **Sahip, Yönetici, Operasyon, Muhasebe**. Mevcut üç rolün güvenlik modeli değişmez. **Muhasebe** kapsamı J.3'te. Özel rol editörü V1.5. **Kullanıcı daveti, yönetimi, şifre sıfırlama V1'in temel ihtiyacıdır.**
- **Gerekçe:** A.2 #1 (gerçek ürün yeni müşteriyi devreye alamaz); gerçekte Muhasebe rolü yok.
- **Güvenlik sınırı:** Rol ön ayarı sürümleme/yükseltme kuralı (yalnız değiştirilmemiş roller yükseltilir) korunur; davet/şifre akışı CSRF, oturum, deneme sınırı kuralları altında.
- **Aşama:** F (demo hizala) → B (davet/şifre/rol).
- **Bağımlılık:** K-12, K-4.

### K-12 — İlk kurulum ve sade mod [PS+]
- **Hedef:** Kurulum sihirbazı (L.8), çalışma profili + modül anahtarları (B.3), mevcut **Operasyonel Hazırlık** altyapısı kurulumun doğrulama omurgası. Toplu içe aktarma **V1.5'in ilk işi** (50+ araçlı pilot müşteri çıkarsa V1 sonuna çekilir). Görevler sade modda da kalır.
- **Gerekçe:** A.2 #12 — şube ülkesi, K1 modu, belge kuralı, ClamAV, M2 anahtarları kurulum engelleri.
- **Güvenlik sınırı:** Sihirbaz güvenlik kontrolü atlatmaz; sunucu altyapısı adımları (ClamAV, anahtarlar) müşteri değil **operatör** adımıdır.
- **Aşama:** F (demo sihirbaz) → B (şirket oluşturma aracı, davet).
- **Bağımlılık:** K-11, Şubeler, Ayarlar, Operasyonel Hazırlık.

### K-13 — Kaparo ve iptal politikası [PS+]
- **Hedef:** Şirket iptal/kaparo politikasını **önceden** tanımlar; politika bedeli kurala göre **otomatik** hesaplanır; personel keyfî değiştiremez; standart bedel hesabı yeni formal onay türü gerektirmez. **Politikadan sapma, istisnai indirim, gerçek para iadesi, yüksek riskli işlem** yetkiye/onaya tabidir. **Kısmi iade V1.** Beş satırlı kaparo defteri (M.5). Aynı kaparo iki kez iade edilemez.
- **Gerekçe:** Analiz önerisi (politika bedeli dört göz, kısmi iade V1.5) **sizin kararınızla değiştirildi.**
- **Güvenlik sınırı:** Gerçek para iadesi seviye kuralına tabidir; idempotency + sınırlı bakiye + olay geçmişi.
- **Aşama:** F (demo) → B (kaparo defteri, politika).
- **Bağımlılık:** K-2, K-4, Ayarlar → Ödeme politikası.

### K-14 — Hukuki ve operasyonel hazırlık [PS]
- **Hedef:** Ülkeye göre **vergi, sözleşme, sigorta, kişisel veri, belge saklama, iade kuralları, e-imza** ayrıca hukuki değerlendirme gerektirir; bir yönetim ekranının V2'ye kalması ilgili gerekliliğin ertelendiği anlamına gelmez. Üretim öncesi zorunlu hazırlıklar S.3'te.
- **Güvenlik sınırı:** ACARVO hukuki uygunluk iddiasında bulunmaz; taslak filigranı ve "doğrulanmadı" rozetleri korunur.
- **Aşama:** Hukuk danışmanlığı **tasarım sprinti ile paralel**; B'den önce (en az vergi + sözleşme + kişisel veri).
- **Bağımlılık:** K-5, K-10.

### K-15 — Demonun rolü [PS]
- **Hedef:** Demo ACARVO'nun ürün vizyonunu gösterir; gerçekte olmayan özelliği teslim edilebilir gibi göstermez. Etiket sistemi 0.2'de; kullanım kuralı N'de.
- **Güvenlik sınırı:** Demo kuralları sunucu güvenliği değildir; gerçeğe taşınmaz (K-18).
- **Aşama:** F (rozetler, bayraklar).
- **Bağımlılık:** K-1.

### K-16 — İki ayrı "teklif" kavramı [PS]
- **Hedef:** (1) **Fiyat Kaydı (fiyat teklifi / fiyat anlık görüntüsü):** belirli tarihte hesaplanmış fiyat ve şartların **değişmez** kaydı; rezervasyon/kiralamaya bağlı; durumları *Geçerli → Güncel değil → Yerine yenisi kaydedildi*; bugünkü gerçek `price_quotes`. (2) **Satış Teklifi:** müşteriye sunulan, *Taslak → Gönderildi (kayıt) → Kabul / Ret / Süresi doldu / Yerine geçildi* yaşam döngüsü olan **ticari** teklif; her sürüm bir Fiyat Kaydına **referans** verir; V1.5 Talepler'de.
- **Adlandırma:** Arayüzde "Fiyat teklifi" yerine **"Fiyat kaydı"**, ticari olan için **"Satış teklifi"**; menü adı **"Talepler ve Satış Teklifleri"** (V1.5). Alan/tablo adlarında `price_quote` mevcut kalır (migration gerektirmez), arayüz etiketi değişir.
- **Güvenlik sınırı:** Fiyat Kaydı değişmezliği ve 409 `PRICE_CHANGED` korunur.
- **Aşama:** F (etiketler) → B (V1.5 satış teklifi).
- **Bağımlılık:** K-7, K-10 (terim sözlüğü).

### K-17 — Masraflarda araç bağlantısı [PS]
- **Hedef:** Dört masraf bağı: **araçla ilişkili**, **şubeyle ilişkili**, **genel işletme**, **kaynak işlemden gelen** (bakım/ceza/yol yardım). Hedef soru: *"Bu araç bana ne kadar maliyet oluşturuyor?"* — hesap kaynakları ve çift sayım kuralı M.7'de.
- **Gerekçe:** Analiz B-12 (araç alanı yok → araç maliyeti hesaplanamaz).
- **Güvenlik sınırı:** Kaynaktan gelen masraf tutarı kilitli ve kaynaktan türer; aynı bakım maliyeti iki kez gider olmaz.
- **Aşama:** F (alan + görünüm) → B.
- **Bağımlılık:** Bakım/Ceza kaynak maliyeti, Raporlar.

### K-18 — Ortak hesaplama mimarisi [PS]
- **Hedef:** Para, zaman/süre, fiyatlandırma, araç uygunluğu, finansal durum projeksiyonları **tek otoriteye** (`@acarvo/shared` saf fonksiyonlar) dayanır. **Demo kodu doğrudan backend'e taşınmaz.** Katmanlar:

| Katman | İçerik | Nerede |
|---|---|---|
| 1 · Saf hesaplama | para ayrıştırma/biçim, süre/gün, fiyat motoru (`pe-1`), uygunluk **projeksiyonu** (verilen veriden), bakiye/maruziyet projeksiyonu, politika hesaplayıcıları (iptal bedeli, gecikme) | `packages/shared`; tarayıcı ve sunucu kullanır |
| 2 · Sunucu-yetkili | tüm mutasyonlar, kilitler, kısıtlar, idempotency, RLS, tenant/şube kapsamı, yetki, onay, denetim, dosya güvenliği | yalnız API + PostgreSQL |
| 3 · Arayüz | önizleme (Katman 1'i çağırır); **asla yetkili değildir**; sunucu yeniden hesaplar ve fark varsa 409 döner (bugünkü `PRICE_CHANGED` deseni) | `apps/web` |
| 4 · Demo | Katman 1 + **bellek içi depo** (aynı port arayüzünü uygular) | demo |

- **Sözleşme testleri:** ortak **altın test vektörleri** (girdi → beklenen çıktı; §64.2 çoklu tahsilat dahil) hem shared'da hem API'de hem demoda koşar; sapma testi kırar.
- **Taşıma sırası:** para → zaman → fiyat → finans projeksiyonları → uygunluk. Bu sprintte kod değiştirilmez.
- **Güvenlik sınırı:** Eşzamanlılık, kilit, tenant izolasyonu, finansal mutasyon **asla** Katman 1/3/4'e taşınmaz.
- **Aşama:** F (demo → shared) → B.
- **Bağımlılık:** K-2, K-10, K-15.

---
## D. Görevler modülü

> **Karar [PS]:** Görevler; çekirdek, bağımsız, V1, her çalışma profilinde ve her işletme ölçeğinde görünen (**Temel**) bir modüldür. Komuta Merkezi/İşlerim içine gömülmez, Onay Merkezi'ne karıştırılmaz, sade modda gizlenmez.

### D.1 Neden ayrı modül?
- Küçük işletmenin (2–3 kişi) iş devrinin ana aracı budur: "Plakası X aracı yıka", "Y müşteriyi ara", "Z iade fotoğrafını kontrol et".
- Görev **sahipli, süreli, atanabilir iş** kaydıdır; uyarı ve onay ise sistemden doğan, çoğu kez kullanıcının oluşturmadığı kayıtlardır. Üçü aynı şey değildir.
- Gerçek ürün bugün görev/bildirim **yok** (Yok); demoda Görevler tam çalışır (Demo → V1 hedefi).

### D.2 Görevler ≠ İşlerim ≠ Onay Merkezi

| | **Görevler** | **İşlerim** | **Onay Merkezi** |
|---|---|---|---|
| Ne | Oluşturulan/atanan **iş kaydı** | Bana düşen her şeyin **tek kuyruğu** (projeksiyon) | Formal **onay** kuyruğu (6 tür) |
| Depo | Kendi tablosu (V1) | Yok; kaynaklardan okunur | Onay istekleri |
| İçerik | Yalnız görevler | Görev + onay + uyarı + geciken | Yalnız onaylar |
| Eylem | Tamamla, ata, devral, ertele | Kaynağa git ve orada işlem yap | Onayla / reddet |
| Görünürlük | Her zaman Temel | Her zaman Temel | Orta ve üzeri (Gelişmiş katman, yetkiye bağlı) |

İşlerim bir görevi **kendi başına tamamlayamaz** gibi bir kısıt yoktur: satırdaki "Tamamla" kısayolu Görevler servisini çağırır (aynı kural, aynı geçmiş). Ancak görevin tanımı, düzenlemesi, havuzu, geçmişi yalnız Görevler'dedir.

### D.3 18 zorunlu yetenek (V1)

| # | Yetenek | V1 davranışı | Not / kabul ölçütü |
|---|---|---|---|
| 1 | **Görev oluşturma** | Başlık (zorunlu), açıklama, öncelik, bitiş, atanan/havuz, bağlantı, şube | Başlık boşsa kaydedilmez; oluşturan ve zaman kayda yazılır |
| 2 | **Kişiye atama** | Aynı şirketteki aktif, ilgili şubeye erişen kullanıcı | Kapsam dışı kullanıcıya atanamaz (sunucu kontrolü) |
| 3 | **Açık havuz** | Atanmamış görev "Havuz" görünümünde; şube + rol filtresiyle | Havuzu yalnız yetkili rol/şube üyeleri görür |
| 4 | **Üstlenme (devralma)** | "Üstlen" tek eylem; aynı anda iki kişi üstlenemez (çakışma → 409 ve "X zaten üstlendi") | Eşzamanlılık: koşullu güncelleme |
| 5 | **Öncelik** | Düşük / Normal / Yüksek / Acil | Renk tek taşıyıcı değil (ikon + metin) |
| 6 | **Bitiş tarihi/saati** | Şube saat dilimine göre; yalnız tarih veya tarih+saat | Saat dilimi belgelenir |
| 7 | **Geciken görev** | Bitiş geçmiş ve tamamlanmamış → "Gecikti" rozeti ve süre | Ana Ekran + İşlerim sayaçları aynı kaynaktan |
| 8 | **Durumlar** | Açık → Üstlenildi → Devam ediyor → Tamamlandı · **İptal** · **Ertelendi** (bitiş yenilenir) | Geçişler tabloda (D.4) |
| 9 | **Tamamlama** | Not (isteğe bağlı) + tamamlayan + zaman | Tamamlanan görev geri açılabilir (Yönetici; neden zorunlu) |
| 10 | **Yeniden atama** | Atayan, Yönetici veya mevcut sahibi | Geçmişe "A→B" satırı |
| 11 | **Araca bağlama** | Araç seç; Araç 360'ta "Görevler" sekmesi/rozeti | Araç silinse/pasif olsa kayıt kalır |
| 12 | **Kiralamaya bağlama** | Kiralama 360'ta ilgili görevler | |
| 13 | **Rezervasyona bağlama** | Rezervasyon detayında | |
| 14 | **Müşteriye bağlama** | Müşteri 360'ta | Kişisel veri görevde kopyalanmaz; bağlantı olarak tutulur |
| 15 | **Bakım/Hasar bağlama** | Bakım ve hasar kayıtlarında | Bakım tamamlandı → ilgili görev otomatik **kapanmaz** (bilgi satırı) |
| 16 | **Görev geçmişi** | Oluşturma, atama, durum, düzenleme, yorum; kim/ne zaman/eski→yeni | Silinmez; görev "iptal" edilir |
| 17 | **Bildirim** | Atandı, havuza düştü (yetkililer), bitişe yaklaşıyor, gecikti, tamamlandı (oluşturana), yeniden atandı | Bildirim kanalı V1: uygulama içi; e-posta V1.5 |
| 18 | **Rol/şube görünürlüğü** | Kullanıcı: kendi + havuz (kendi şubeleri). Yönetici/Sahip: tüm şirket veya seçili şube | Sunucu kapsamı; liste ve arama ve sayaçlar aynı filtreyi uygular |

**Ek V1 işlevleri:** yorum/not alanı, tekrar eden görev yok (V1.5), kontrol listesi alt öğeleri (V1.5), toplu işlem (seç + ata/tamamla) V1, kayıtlı görünümler: *Benim · Havuz · Takımım · Geciken · Bugün · Tamamlananlar*.

### D.4 Durum geçişleri

| Mevcut | Olabilir | Kural |
|---|---|---|
| Açık | Üstlenildi, İptal, Ertelendi | Üstlen: atanmamış veya atanan kullanıcı |
| Üstlenildi | Devam ediyor, Tamamlandı, Açık (bırak), Ertelendi, İptal | Bırakma sahibi: görev havuza döner |
| Devam ediyor | Tamamlandı, Açık, Ertelendi, İptal | |
| Ertelendi | Açık (yeni bitiş zorunlu) | |
| Tamamlandı | Açık (yeniden aç) | Yeniden açma Yönetici+, neden zorunlu |
| İptal | — | Silme yok; geçmiş durur |

### D.5 İşlerim ile ilişki
- **Bana düşenler** sekmesi: Bana atanan görevler + Havuzda üstlenebileceklerim + Bana atanan onaylar + Bana ait geciken/uyarılar; her satırın başında **tür etiketi** (Görev · Onay · Uyarı) ve **kaynak bağlantısı**.
- **Uyarılar** sekmesi: Riskler/Uyarılar'ın tek kaynağı (eski Riskler ve Gelir Kontrolü uyarıları burada).
- Satıra tıklayınca kaynağa gidilir (görev → Görevler, onay → Onay Merkezi, uyarı → ilgili kayıt).
- İşlerim hiçbir görevi/onayı **sahiplenmez**, kendi durumu yoktur; Ana Ekran sayacı aynı sorguyu kullanır (tek sayı, iki yerde aynı).

### D.6 Görev tamamlanınca bağlı kayıt ne olur?
**Hiçbir şey olmaz** (otomatik tamamlama yok): "İade fotoğraflarını kontrol et" görevi tamamlanınca iade tamamlanmış sayılmaz; "Bakım randevusu al" tamamlanınca bakım kaydı oluşmaz. Tamamla penceresi bağlı kaydın durumunu **gösterir** ve gerekirse "Bağlı kayda git" önerir. (Ters yön: bakım kapandığında görev kapanmaz; "bağlı kayıt tamamlandı — görevi kapatmak ister misiniz?" ipucu.)

### D.7 Veri modeli ve güvenlik (backend için)
`tasks(id, company_id, branch_id, title, description, priority, due_at, status, assignee_user_id, created_by, completed_by, completed_at, …)` + `task_links(task_id, entity_type, entity_id)` + `task_events(task_id, actor, type, from, to, at)` + bildirim tablosu. **Kiracı + şube RLS**, `assignee` değişimi ve üstlenme koşullu güncelleme, idempotent oluşturma anahtarı, olaylar yalnız-ekleme. Yetki: `tasks.read`, `tasks.create`, `tasks.assign`, `tasks.manage`. Operasyon varsayılan: read/create/claim/complete (kendi), Yönetici: tümü.

### D.8 Frontend durumu
Demoda tam (Demo); V1'de eksik: havuz görünümünün şube+rol filtresi, çakışma (409) durumu, bildirimin tür ayrımı, araç/kiralama/rezervasyon sekmelerinde rozet, toplu işlem. Bunlar **O.D** grubundadır.

---

## E. V1 modülleri

Her satırda **Bugün** (0.2 olgunluk) ve **Neden V1** yazılıdır. "Eksik" sütunu frontend sprint girdisidir.

| Modül | Bugün | Neden V1 | V1'in temel kapsamı | V1.5'e kalan |
|---|---|---|---|---|
| **Ana Ekran** | Demo (gerçekte Operasyonel Hazırlık panosu — Kısmen) | Sahibin sabah sorusu | Bugünün işleri, filo özeti, yaklaşan, bana düşen sayacı, (yetkili) finans özeti | Özelleştirilebilir pano |
| **İşlerim** | Demo (Komuta Merkezi) | Tek kuyruk | Bana düşenler, Uyarılar | İstisnalar, Vardiya devri |
| **Rezervasyonlar** | Gerçek (R1–R2) / Demo zengin | Kira girişi | Belirli araçlı onay, bekleyen kaydet, Kontrol Et ve Onayla, hızlı rezervasyon | Sınıf kapasitesi, bekleme listesi |
| **Kiralamalar** | Gerçek (teslim/iade) | Ana iş | Teslim masası, iade, uzatma, kapanış, Sözleşmeler görünümü, 360 | Toplu işlem |
| **Takvim** | Demo (araç zaman çizelgesi) | Çakışma görme | Araç çizelgesi 7/30 gün, bakım/blok, sürükle-bırak yok | Kapasite görünümü, 90 gün |
| **Görevler** | Demo (tam) | Günlük iş devri | D bölümü | Tekrarlı görev, kontrol listesi, e-posta |
| **Araçlar** | Gerçek | Envanter | Liste, 360, durum şeridi, belgeler, kilometre, Transferler görünümü | İçe aktarma, gelişmiş araç maliyeti |
| **Bakım & Servis** | Gerçek (onaylı, kanıtlı) | Güvenlik/bütçe | Bakım planı, tamir, onay, kanıt | Servis sağlayıcı yönetimi |
| **Hasar ve Olaylar** | Gerçek (hasar, kanıt, engel) / Demo (olay, ceza) | Mali/Hukuki | Hasar kaydı, fotoğraf, engel, onaylı kaldırma | Olaylar ve Cezalar sekmeleri |
| **Müşteriler** | Gerçek | CRM çekirdeği | Kimlik, ehliyet, belgeler, kara liste, kimlik anahtarı | Mükerrer birleştirme, içe aktarma |
| **Kurumsal Hesaplar** *(Gelişmiş)* | Gerçek (hesap) / Demo (kredi) | Orta+ müşteri | Hesap, sözleşme, yetkililer | Kredi limiti, cari, toplu fatura |
| **Fiyatlandırma** | Gerçek (pe-1, fiyat listesi) | Doğru fiyat | Fiyat listesi, sezon, ek hizmet, vergi, Fiyat Kaydı | Kampanya, kural motoru |
| **Finans** | Gerçek (kayıt+doğrula) / Demo (zengin) | Para güvenliği | K-2 modeli, tahsilat, depozito, iade, kalemler, Dikkat görünümü | Çok para birimi/kur, mutabakat, kaparo gelişmişi |
| **Masraflar** | Demo | Gider görünürlüğü | Dört bağlantı türü, araç maliyeti kaynakları | Yinelenen masraf, onay |
| **Şube Kasaları** | Demo | Günlük kasa | Açılış/kapanış, sayım, vardiya, gün sonu | Çok para birimi çekmecesi |
| **Raporlar** | Demo | Karar desteği | 3 çekirdek rapor + gün sonu (L.6) | Gelişmiş rapor, zamanlanmış |
| **Onay Merkezi** | Demo | Formal onay | 6 tür (şartname §21) | Politika şablonları |
| **Şubeler** | Gerçek | Çok şube | Ülke, saat dilimi, kapsam | — |
| **Kullanıcılar ve Roller** | Yok / (rol sabit) | Devreye alma | Davet, rol atama, şifre sıfırlama, Muhasebe | Özel rol editörü |
| **İşlem Geçmişi** | Gerçek (audit) / Demo | Denetim | Filtreli, dışa aktarma | Gelişmiş denetim |
| **Ayarlar** | Kısmen | Kurulum | Şirket, ödeme politikası, bildirim eşikleri, sözleşme şablonları, hazırlık, çalışma profili | Entegrasyon |
| **Kurulum sihirbazı** | Yok | İlk kullanım | L.8 | Toplu içe aktarma |

**Gerekçe özeti:** Bir modül V1'e giriyorsa (a) günlük işte her gün kullanılır, veya (b) para/hukuk/güvenlik riski taşır, veya (c) gerçek müşteri onsuz devreye alınamaz.

---

## F. V1.5 modülleri

| Modül | Neden V1'de değil | V1.5 somut kapsam | Ön koşul |
|---|---|---|---|
| **Talepler ve Satış Teklifleri** | Dar kitle, V1'de Fiyat Kaydı yeter | Talep kaydı, kaynak, Satış Teklifi yaşam döngüsü (K-16), talepten rezervasyon | K-16 terimleri, backend modeli |
| **Sınıf kapasitesi / sınıf onaylı rezervasyon** | Kapasite defteri + atomik dönüşüm gerekir | K-3 sekiz maddelik kapsam | DB tasarımı, yük testi |
| **Kurumsal kredi** | Mutabakat ve cari gerektirir | Limit, kullanım, cari, onay | Finans mutabakatı |
| **Mükerrer müşteri birleştirme** | Geri alınamaz, güvenlik incelemesi | Birleştirme önerisi + dört göz + geçmiş korunur | Müşteri anahtarı |
| **Toplu içe aktarma** | Doğrulama ve geri alma karmaşık | Araç/müşteri CSV, önizleme, hata raporu, geri al | Veri doğrulama kuralları |
| **Gelişmiş raporlar** | 3 çekirdek rapor yeter | Araç kârlılığı, gelir/gider, zamanlanmış, dışa aktarma | K-17 verisi |
| **Özel rol editörü** | Sabit 4 rol ilk müşteri için yeter | İzin matrisi, rol kopyalama | Rol sürümleme |
| **Olaylar ve Cezalar sekmeleri** | Hasar çekirdek, ceza/olay seyrek | Trafik cezası, sürücü yansıtma, olay | Finans kalemi bağlantısı |
| **İstisnalar ve Vardiya devri** (İşlerim) | Temel kuyruk önce | İstisna listesi, devir notu | Görev + Kasa |
| **Çok para birimi / kur** | Gerçekte kur yok (FN3) | ISO, kur anlık görüntüsü, çekmece/para birimi | K-2, M.6 |
| **E-posta bildirimi** | Altyapı gerekir | Görev/onay bildirimleri | E-posta servisi |
| **Kapasite görünümü (Takvim)** | Sınıf kapasitesine bağlı | Şube×sınıf×gün | Kapasite defteri |

---

## G. V2 modülleri

> **Kural [PS]:** V2 = ürün haritasında var, günlük menüde yok, satışta "hazır" diye anlatılmaz. **Demo kodu silinmez;** modül anahtarı kapalıyken menüden ve arama sonucundan çıkar.

| Modül | Neden V2 | Demo kodu | Korunan işlev (başka yerde) |
|---|---|---|---|
| **Partner Portalı + Partnerler/komisyon** | Ayrı kimlik/oturum, komisyon hesabı, hukuki | Korunur | Rezervasyon "Kaynak" alanı |
| **Araç Tedarikçileri + Alt-kiralama** | ~425 satır şartname, ayrı finans akışı | Korunur | Araç kaynağı etiketi (alan) |
| **Filo Asistanı** | İşlevi arama/filtre | Korunur | Global Arama + kayıtlı filtreler (K-8) |
| **Fırsatlar** | Öneri motoru, 7 tür | Korunur | Takip önerisi kaynakta tek satır |
| **Kurallar (gelişmiş motor)** | Kural motoru güvenlik incelemesi | Korunur | Eşikler **Ayarlar → Bildirimler** (V1) |
| **Anahtar & ekipman takibi** | Küçük işletme ihtiyacı değil | Korunur | Araç notu |
| **Sigorta dosyaları** | Poliçe yönetimi ayrı alan | Korunur | Araç belge bitişi (V1) |
| **Araç alım-satım** | Farklı iş modeli | Korunur | — |
| **Platform aboneliği / faturalama** | SaaS işletmesi | Yok | — |
| **Gelişmiş entegrasyonlar** (e-imza, muhasebe) | Hukuki + dış bağımlılık | Yok | Dış imza süreci (K-5) |

---
## H. Yeni navigasyon

### H.1 İlkeler
1. Menü adedi bir hedef değildir; **işleve göre** belirlendi. Sonuç: 36 → **21 (V1)** · 22 (V1.5) · 27 (V2).
2. İki katman: **Temel** (her işletmenin günlük işi) ve **Gelişmiş** (orta/büyük işletme, belirli roller). Katman = varsayılan görünürlük; yetki ve modül anahtarı ayrıca uygulanır (H.5).
3. **Görevler her zaman Temel.** Çalışma profili ne olursa olsun görünür.
4. Bir işlev bir menü bağlantısıyla değil, **tek bir kaynak ekranla** yaşar; diğer yerler bağlantı verir (B.2-3).
5. Değerlendirilen birleştirmeler ve kararlar:

| Değerlendirme | Karar | Gerekçe |
|---|---|---|
| Ana Ekran + Komuta Merkezi | **Ayrı kalır**: *Ana Ekran* = durum özeti, *İşlerim* = eylem kuyruğu | İki farklı soru: "Ne durumda?" ve "Bana ne düşüyor?" |
| Takvim + Kapasite Planlama | **Birleşir**: Takvim içinde *Kapasite* görünümü (V1.5) | Aynı zaman çizelgesi bileşeni, aynı veri |
| Filo Analizi | **Raporlar**'ın *Filo* ailesi | Analiz = rapor; ayrı menü gereksiz |
| Gelir Kontrolü | **Finans → Dikkat** görünümü; eski değişmez kontroller **Ayarlar → Operasyonel hazırlık → Veri bütünlüğü** | Finansal tutarsızlık finans ekranının işi; sistem kontrolü kurulum işi |
| Riskler ve İstisnalar | **İşlerim → Uyarılar** (tek kaynak); *İstisnalar* V1.5 | Sekiz "dikkat" yüzeyi → bir |
| Filo Asistanı | **V2**; işlev Global Arama + kayıtlı filtre | K-8 |
| Fırsatlar | **V2** | K-8 |
| Kurallar | **V2**; eşikler Ayarlar'da (V1) | K-8 |
| Belge Merkezi | **Menüden çıkar**; belgeler kaynak ekranda + Global Arama (belge türü/ad) | Bir belge her zaman bir kaydın belgesidir |
| Sözleşmeler | **Kiralamalar → Sözleşmeler** görünümü + şablonlar Ayarlar'da | Sözleşme kiralamanın parçası |
| Kullanıcılar + Roller ve Yetkiler | **Birleşir** (iki sekme) | Aynı yönetim işi |
| Olay Merkezi + Hasar Kayıtları + Ceza Modülü | **Hasar ve Olaylar** (V1: Hasar; V1.5: Olaylar, Cezalar sekmeleri) | Üçü de "araçla ilgili olumsuz olay" |
| Transferler (Araçlar içinde) | **Araçlar → Transferler** görünümü | Araca bağlı |
| İşlem Geçmişi | **Yönetim** grubuna taşındı | Denetim bir yönetim işi |

### H.2 V1 menü tablosu (21 bağlantı)

| Kategori | Menü adı | Eski karşılık | Hedef kullanıcı | Kapsam | Katman | Gerekçe | Korunan işlevler |
|---|---|---|---|---|---|---|---|
| **Genel** | Ana Ekran | Ana Ekran | Herkes | V1 | Temel | Sabah özeti | Bugünün işleri, filo özeti, yaklaşanlar, (yetkiliye) finans özeti |
| Genel | İşlerim | Komuta Merkezi | Herkes | V1 | Temel | Tek eylem kuyruğu (K-9) | Komuta sayaçları, kritik uyarılar, bana atananlar |
| **Operasyon** | Rezervasyonlar | Rezervasyonlar | Operasyon, Yönetici | V1 | Temel | Kira girişi | Liste, oluşturma, bekleyen, onay, uzatma |
| Operasyon | Kiralamalar | Kiralamalar + Sözleşmeler | Operasyon, Yönetici | V1 | Temel | Ana iş | Teslim masası, iade, kapanış, Sözleşmeler görünümü |
| Operasyon | Takvim | Takvim + Kapasite Planlama | Operasyon, Yönetici | V1 (Kapasite V1.5) | Temel | Çakışma/doluluk | Araç çizelgesi, blok, bakım penceresi |
| Operasyon | **Görevler** | Görevler | **Herkes** | **V1** | **Temel** | Günlük iş devri (D) | 18 yetenek |
| Operasyon | Araçlar | Araçlar (+ Transferler) | Operasyon, Yönetici | V1 | Temel | Envanter | Liste, 360, durum şeridi, transfer, belgeler |
| Operasyon | Bakım & Servis | Bakım & Servis | Operasyon, Yönetici | V1 | Temel | Güvenlik/bütçe | Plan, tamir, onay, kanıt |
| Operasyon | Hasar ve Olaylar | Hasar Kayıtları (+ Olay Merkezi + Ceza Modülü) | Operasyon, Yönetici | V1 (Olay/Ceza V1.5) | Temel | Mali risk | Hasar, kanıt, engel, kaldırma |
| **Müşteri & Ticari** | Müşteriler | Müşteriler | Operasyon, Yönetici | V1 | Temel | CRM çekirdeği | Kimlik, belge, kara liste |
| Müşteri & Ticari | Kurumsal Hesaplar | Kurumsal Hesaplar | Yönetici, Muhasebe | V1 | Gelişmiş | Orta+ işletme | Hesap, yetkili, sözleşme |
| Müşteri & Ticari | Fiyatlandırma | Fiyatlandırma | Yönetici | V1 | Temel | Doğru fiyat | Fiyat listesi, sezon, ek hizmet, Fiyat Kaydı |
| **Finans** | Finans | Finans (+ Gelir Kontrolü) | Muhasebe, Yönetici, Operasyon (sınırlı) | V1 | Temel | Para güvenliği | Tahsilat, depozito, iade, kalem, Dikkat |
| Finans | Masraflar | Masraflar | Yönetici, Muhasebe | V1 | Temel | Gider görünürlüğü | Dört bağlantı türü (K-17) |
| Finans | Şube Kasaları | Şube Kasaları | Yönetici, Muhasebe, Operasyon (kendi vardiyası) | V1 | Gelişmiş | Günlük kasa | Açılış/kapanış, sayım, gün sonu |
| **Kontrol ve Raporlar** | Raporlar | Raporlar + Filo Analizi | Yönetici, Muhasebe, Sahip | V1 | Temel | Karar desteği | 3 çekirdek rapor + gün sonu |
| Kontrol ve Raporlar | Onay Merkezi | Onay Merkezi | Yönetici, Sahip, Muhasebe | V1 | Gelişmiş | Formal onay (6 tür) | Bekleyen, karar, geçmiş |
| **Yönetim** | Şubeler | Şubeler | Sahip, Yönetici | V1 | Gelişmiş* | Çok şube | Ülke, saat dilimi, çalışma saati |
| Yönetim | Kullanıcılar ve Roller | Kullanıcılar + Roller ve Yetkiler | Sahip, Yönetici | V1 | Temel | Devreye alma | Davet, rol, şifre sıfırlama |
| Yönetim | İşlem Geçmişi | İşlem Geçmişi | Sahip, Yönetici, Muhasebe (sınırlı) | V1 | Gelişmiş | Denetim | Filtre, dışa aktarma |
| Yönetim | Ayarlar | Ayarlar | Sahip, Yönetici | V1 | Temel | Kurulum | Şirket, ödeme politikası, bildirim eşikleri, sözleşme şablonları, hazırlık, çalışma profili |

\* Tek şubeli işletmede Şubeler bağlantısı gizlenir; erişim Ayarlar → Şirket üzerindendir.

**V1.5 ekleme:** Müşteri & Ticari → **Talepler ve Satış Teklifleri** (Talep Merkezi, Gelişmiş) → toplam **22**.
**V2 eklemeler:** Partnerler, Araç Tedarikçileri, Filo Asistanı, Fırsatlar, Kurallar → toplam **27**.

### H.3 Sayım

| Ölçü | Eski | V1 | V1.5 | V2 |
|---|---|---|---|---|
| Grup | 7 | **6** | 6 | 6–7 (Ticari genişler) |
| Bağlantı | 36 | **21** | 22 | 27 |
| Temel | — | 16 | 16 | 16 |
| Gelişmiş | — | 5 | 6 | 11 |

*(Temel 16: Ana Ekran, İşlerim, Rezervasyonlar, Kiralamalar, Takvim, Görevler, Araçlar, Bakım & Servis, Hasar ve Olaylar, Müşteriler, Fiyatlandırma, Finans, Masraflar, Raporlar, Kullanıcılar ve Roller, Ayarlar. Gelişmiş 5: Kurumsal Hesaplar, Şube Kasaları, Onay Merkezi, Şubeler, İşlem Geçmişi.)*

### H.4 Menü kategorilerinin sıralaması
Genel · Operasyon · Müşteri & Ticari · Finans · Kontrol ve Raporlar · Yönetim. İlk üç grup günlük akış sırasına (iş → müşteri → para), son ikisi kontrol sırasına göredir.

### H.5 Yetkiye göre gizleme kuralları
1. Bağlantı görünür ⇔ **modül anahtarı açık** ∧ **çalışma profili katmanını içeriyor** ∧ **kullanıcı en az `*.read` yetkisine sahip.** Boş grup başlığı gizlenir.
2. **Menü güvenlik değildir:** Gizli bir sayfaya doğrudan adresle gidilirse "Bu sayfaya erişim yetkiniz yok" durumu (ForbiddenState) çizilir; sunucu her istekte yetkiyi yeniden kontrol eder.
3. Sayaç ve rozetler (ör. Onay Merkezi "5") yalnız kullanıcının görmeye yetkili olduğu kayıtları sayar; yetkisiz modülün sayısı hiçbir yerde sızmaz (Ana Ekran, arama, bildirim dahil).
4. Global Arama sonuçları aynı yetki ve şube kapsamı filtresinden geçer.
5. **Görevler** ve **İşlerim** her kullanıcıda bulunur; içerikleri kullanıcının yetkisine göre daralır.
6. Gelişmiş katman, sahibin ayarından açılır; kullanıcı kendi menüsünü yalnız **daraltabilir** (yetkisini genişletemez).

### H.6 Taşınan ekranlar (kod silinmez)
Komuta Merkezi → İşlerim (aynı bileşenler, yeni ad ve sekmeler) · Kapasite Planlama → Takvim görünümü · Filo Analizi → Raporlar · Gelir Kontrolü → Finans Dikkat + Ayarlar bütünlük · Riskler → İşlerim Uyarılar · Sözleşmeler → Kiralamalar görünümü · Belge Merkezi → arama/kaynak · Olay Merkezi + Ceza → Hasar ve Olaylar sekmeleri (V1.5'e kadar bayrakla gizli) · Roller → Kullanıcılar sekmesi · İşlem Geçmişi → Yönetim grubu · Transferler → Araçlar görünümü.

### H.7 Şartname §4 değişiklik taslağı (şartname bu çalışmada **düzenlenmedi**; onayınızdan sonra uygulanacak)
1. §4 grup/bağlantı listesi H.2 tablosuyla değiştirilir (7→6 grup, 36→21).
2. Her bağlantıya "Kapsam (V1/V1.5/V2)" ve "Katman (Temel/Gelişmiş)" sütunu eklenir.
3. Yeni cümle: *"Görevler tüm çalışma profillerinde görünür; Komuta Merkezi/İşlerim içine gömülmez."*
4. Yeni §4.x "Çalışma profili ve modül anahtarları" (B.3).
5. §21 Onay Merkezi: *"Altı formal onay türü korunur; İşlerim yedinci tür değildir; operasyonel dört göz akışları kendi domain ekranlarında kalır."*
6. Olay/Ceza/Talep/Partner/Tedarikçi/Filo Asistanı/Fırsatlar/Kurallar bölümlerine "V1.5" veya "V2 — menüde yok, modül anahtarı kapalı" notu.
7. §4'te rota uyumluluğu: eski rotaların yönlendirme tablosu (I.3).
8. Şartnamedeki V1 ağırlıklı bölüm numaraları (§59U–§59AD vb.) değişmez; yalnız kapsam etiketi eklenir.

---

## I. Eski 36 bağlantının yeni yapıya eşlenmesi

### I.1 Her bağlantı için cevaplanan 10 soru
(1) Yeni yeri nerede? (2) Kalır / birleşir / taşınır / ertelenir? (3) Hangi işlev korunur? (4) Hangi veri/kayıt korunur? (5) Eski rota ne olur? (6) Hangi yetkiyle görünür? (7) Hedef kullanıcı kim? (8) Gerçek backend karşılığı var mı? (9) Hangi kapsam (V1/V1.5/V2)? (10) Neden?

### I.2 Eşleme tablosu — soru 1, 2, 7, 9, 10

| # | Eski bağlantı (grup) | Yeni yer | Karar | Hedef kullanıcı | Kapsam | Neden |
|---|---|---|---|---|---|---|
| 1 | Ana Ekran (Genel) | Ana Ekran | Kalır | Herkes | V1 | Durum özeti |
| 2 | Komuta Merkezi (Genel) | **İşlerim** | Yeniden adlandırma + sade | Herkes | V1 | Eylem kuyruğu (K-9) |
| 3 | Filo Asistanı (Genel) | Global Arama + kayıtlı filtre | Ertelenir (modül) | Operasyon | V2 | K-8 |
| 4 | Rezervasyonlar (Operasyon) | Rezervasyonlar | Kalır | Operasyon | V1 | Çekirdek |
| 5 | Kiralamalar | Kiralamalar | Kalır | Operasyon | V1 | Çekirdek |
| 6 | Takvim | Takvim | Kalır (+Kapasite) | Operasyon | V1 | Çakışma |
| 7 | **Görevler** | **Görevler** | **Kalır, Temel** | **Herkes** | **V1** | **[PS]** |
| 8 | Araçlar | Araçlar | Kalır (+Transferler) | Operasyon | V1 | Envanter |
| 9 | Bakım & Servis | Bakım & Servis | Kalır | Operasyon | V1 | Güvenlik |
| 10 | Olay Merkezi | Hasar ve Olaylar → *Olaylar* sekmesi | Birleşir | Yönetici | V1.5 | Hasarla aynı alan |
| 11 | Hasar Kayıtları | Hasar ve Olaylar → *Hasar* | Birleşir/yeniden ad | Operasyon | V1 | Mali risk |
| 12 | Ceza Modülü | Hasar ve Olaylar → *Cezalar* | Birleşir | Yönetici, Muhasebe | V1.5 | Seyrek |
| 13 | Müşteriler (Müşteri&Ticari) | Müşteriler | Kalır | Operasyon | V1 | CRM |
| 14 | Kurumsal Hesaplar | Kurumsal Hesaplar | Kalır (Gelişmiş) | Yönetici | V1 (kredi V1.5) | Orta+ |
| 15 | Talep Merkezi | Talepler ve Satış Teklifleri | Ertelenir | Yönetici | V1.5 | K-7 |
| 16 | Partnerler | — | Ertelenir | Sahip | V2 | K-7 |
| 17 | Araç Tedarikçileri | — | Ertelenir | Sahip | V2 | K-7 |
| 18 | Fiyatlandırma | Fiyatlandırma | Kalır | Yönetici | V1 | Doğru fiyat |
| 19 | Onay Merkezi (Kontrol) | Onay Merkezi | Kalır (Gelişmiş) | Yönetici, Sahip | V1 | Formal onay |
| 20 | Kurallar | Ayarlar → Bildirimler (eşikler); motor | Ertelenir | Sahip | V2 (eşikler V1) | K-8 |
| 21 | Gelir Kontrolü | Finans → *Dikkat*; Ayarlar → Veri bütünlüğü | Birleşir | Muhasebe | V1 | Tek finans yüzeyi |
| 22 | Riskler ve İstisnalar | İşlerim → *Uyarılar* | Birleşir | Herkes | V1 (İstisna V1.5) | Tek kaynak |
| 23 | Kapasite Planlama | Takvim → *Kapasite* | Birleşir | Yönetici | V1.5 | Aynı çizelge |
| 24 | Filo Analizi | Raporlar → *Filo* | Birleşir | Yönetici | V1 | Analiz = rapor |
| 25 | Fırsatlar | — | Ertelenir | Yönetici | V2 | K-8 |
| 26 | Raporlar | Raporlar | Kalır | Yönetici, Muhasebe | V1 | Karar desteği |
| 27 | Finans | Finans | Kalır | Muhasebe, Yönetici | V1 | Para |
| 28 | Masraflar | Masraflar | Kalır | Muhasebe | V1 | Gider |
| 29 | Şube Kasaları | Şube Kasaları | Kalır (Gelişmiş) | Muhasebe, Operasyon | V1 | Kasa |
| 30 | Sözleşmeler (Belge) | Kiralamalar → *Sözleşmeler*; şablonlar Ayarlar | Birleşir | Operasyon | V1 | Kiralamanın parçası |
| 31 | Belge Merkezi | Global Arama + kaynak ekranlar | Kaldırılır (menüden) | Herkes | V1 | Belge = kaydın belgesi |
| 32 | İşlem Geçmişi | Yönetim → İşlem Geçmişi | Taşınır | Sahip, Muhasebe | V1 | Denetim |
| 33 | Şubeler | Şubeler | Kalır (tek şubede gizli) | Sahip | V1 | Çok şube |
| 34 | Kullanıcılar | Kullanıcılar ve Roller → *Kullanıcılar* | Birleşir | Sahip | V1 | Devreye alma |
| 35 | Roller ve Yetkiler | Kullanıcılar ve Roller → *Roller* | Birleşir | Sahip | V1 | Aynı iş |
| 36 | Ayarlar | Ayarlar | Kalır (genişler) | Sahip | V1 | Kurulum |

**Doğrulama:** 36 satır (1–36). Dağılım: **Kalır 17** (1,4,5,6,7,8,9,13,14,18,19,26,27,28,29,33,36) · **Birleşir/yeniden adlanır 11** (2,10,11,12,21,22,23,24,30,34,35) · **Taşınır 1** (32) · **Menüden kalkar 1** (31) · **Ertelenir 6** (3,15,16,17,20,25) = 36. V1 menüsündeki bağlantılar: 17 kalan + İşlerim (satır 2) + Hasar ve Olaylar (satır 11, 10 ve 12'yi içerir) + Kullanıcılar ve Roller (satır 34, 35'i içerir) + İşlem Geçmişi (taşınan, satır 32) = **21 ✔**. Sekiz eski bağlantı artık ayrı bağlantı değil, bir görünüm/sekmedir (10→Hasar ve Olaylar, 12→Hasar ve Olaylar, 21→Finans, 22→İşlerim, 23→Takvim, 24→Raporlar, 30→Kiralamalar, 35→Kullanıcılar ve Roller) — **işlev kaybı yoktur**.

### I.3 Eşleme tablosu — soru 3, 4, 5, 6, 8

| # | Korunan işlev | Veri/kayıt | Eski rota → yeni | Görünürlük yetkisi | Gerçek backend |
|---|---|---|---|---|---|
| 1 | Tümü | — | `/` aynı | oturum | Kısmen (Operasyonel Hazırlık) |
| 2 | Sayaçlar, kritik liste, atanmışlar | Hesaplanır | `/komuta-merkezi` → `/islerim` | oturum | Yok |
| 3 | Plaka/kiralama arama, kayıtlı filtre | Yok | `/filo-asistani` → `/` + arama açık | oturum | Yok |
| 4 | Tümü | Rezervasyonlar | aynı | reservations.read | Gerçek |
| 5 | Tümü | Kiralamalar | aynı | rentals.read | Gerçek |
| 6 | Çizelge, blok | Hesaplanır | aynı | rentals.read | Kısmen |
| 7 | 18 yetenek | tasks | aynı | tasks.read | **Yok** (B bağımlılığı) |
| 8 | Tümü | Araçlar | aynı; `/transferler` → `/araclar?gorunum=transferler` | vehicles.read | Gerçek |
| 9 | Tümü | Bakım | aynı | maintenance.read | Gerçek |
| 10 | Olay kaydı | Olaylar | `/olay-merkezi` → `/hasar-ve-olaylar?sekme=olaylar` | damage.read | Yok |
| 11 | Tümü | Hasar | `/hasar-kayitlari` → `/hasar-ve-olaylar` | damage.read | Gerçek |
| 12 | Ceza kaydı, yansıtma | Cezalar | `/ceza-modulu` → `…?sekme=cezalar` | fines.read | Yok |
| 13 | Tümü | Müşteriler | aynı | customers.read | Gerçek |
| 14 | Hesap, yetkili | Kurumsal | aynı | corporate.read | Gerçek (hesap) |
| 15 | Talep, teklif | Talepler | `/talep-merkezi` → `/talepler` | requests.read | Yok |
| 16 | Partner, komisyon | Demo verisi | `/partnerler` → yönlendirme "Henüz yok" bilgi sayfası | — | Yok |
| 17 | Tedarik, alt-kiralama | Demo verisi | `/arac-tedarikcileri` → aynı bilgi sayfası | — | Yok |
| 18 | Tümü | Fiyatlar | aynı | pricing.read | Gerçek |
| 19 | 6 onay türü | Onaylar | aynı | approvals.read | Yok (operasyonel dört göz var) |
| 20 | Eşikler, kural listesi | Kurallar | `/kurallar` → `/ayarlar/bildirimler` | settings.read | Yok |
| 21 | Dikkat listesi, tutarsızlık | Hesaplanır | `/gelir-kontrolu` → `/finans?gorunum=dikkat` | finance.read | Kısmen |
| 22 | Uyarılar | Hesaplanır | `/riskler-ve-istisnalar` → `/islerim?sekme=uyarilar` | oturum | Yok |
| 23 | Doluluk/kapasite | Hesaplanır | `/kapasite-planlama` → `/takvim?gorunum=kapasite` | rentals.read | Yok |
| 24 | Filo raporu | Hesaplanır | `/filo-analizi` → `/raporlar?aile=filo` | reports.read | Yok |
| 25 | Öneriler | Demo verisi | `/firsatlar` → bilgi sayfası | — | Yok |
| 26 | Rapor | Hesaplanır | aynı | reports.read | Yok (finance.reports.read kısmen) |
| 27 | Tümü | Finans | aynı | finance.read | Gerçek (kayıt+doğrula) |
| 28 | Masraf | Masraflar | aynı | expenses.read | Yok |
| 29 | Kasa | Kasa | aynı | cash.read | Yok |
| 30 | Sözleşme liste/PDF | Sözleşmeler | `/sozlesmeler` → `/kiralamalar?gorunum=sozlesmeler` | contracts.read | Gerçek (taslak/PDF) |
| 31 | Belge arama | Belgeler | `/belge-merkezi` → arama (belge filtresi) | documents.read | Gerçek (belge) |
| 32 | Tümü | Denetim | `/islem-gecmisi` aynı | audit.read | Gerçek |
| 33 | Tümü | Şubeler | aynı | branches.read | Gerçek |
| 34 | Tümü + davet | Kullanıcılar | `/kullanicilar` aynı | users.read | Kısmen |
| 35 | İzin matrisi (okuma) | Roller | `/roller-ve-yetkiler` → `/kullanicilar?sekme=roller` | roles.read | Kısmen |
| 36 | Genişler | Ayarlar | aynı | settings.read | Kısmen |

### I.4 Yönlendirme ve veri koruma planı
1. **Eski rotalar silinmez;** her eski adres yeni karşılığına `redirect` (301 benzeri, kalıcı) ile yönlendirilir; yer imleri ve derin bağlantılar (kayıt kimlikleri dahil) çalışmaya devam eder.
2. Bir bağlantı V2'ye alınırsa adres **"Bu modül henüz etkin değil"** bilgi sayfasını gösterir (satış vaadi değil); modül anahtarı açılırsa eski ekran çalışır.
3. Hiçbir demo kaydı silinmez; V2 modüllerinin tohum verisi ve ekran kodu yerinde kalır, yalnız yönlendirme ve menü bayrağı değişir.
4. Taşınan ekranlarda **sekme/filtre durumu URL'dedir** (`?gorunum=`, `?sekme=`) — şartname §13.1 ile tutarlı.
5. Testler (O.A): her eski rota için "yönlendirir ve içerik görünür", "yetkisizse ForbiddenState" kontrolü.

---
## J. Rollere göre menü

### J.1 Dört V1 rolü ve görünen menü

| Menü | Sahip | Yönetici | Operasyon | Muhasebe |
|---|---|---|---|---|
| Ana Ekran | ✔ (finans özeti dahil) | ✔ (finans özeti `finance.reports.read` ile) | ✔ (finanssız) | ✔ (finans odaklı) |
| İşlerim | ✔ | ✔ | ✔ | ✔ |
| Rezervasyonlar | ✔ | ✔ | ✔ | salt okuma |
| Kiralamalar | ✔ | ✔ | ✔ | salt okuma (finans sekmesi tam) |
| Takvim | ✔ | ✔ | ✔ | — |
| **Görevler** | ✔ | ✔ | ✔ | ✔ |
| Araçlar | ✔ | ✔ | ✔ | — (araç maliyeti Raporlar'da) |
| Bakım & Servis | ✔ | ✔ | ✔ (onay yok) | — |
| Hasar ve Olaylar | ✔ | ✔ | ✔ (kaldırma yok) | — |
| Müşteriler | ✔ | ✔ | ✔ | salt okuma (tahsilat için) |
| Kurumsal Hesaplar | ✔ | ✔ | — | ✔ |
| Fiyatlandırma | ✔ | ✔ | salt okuma | — |
| Finans | ✔ | ✔ | sınırlı (kayıt) | ✔ (tam) |
| Masraflar | ✔ | ✔ | — (kendi masrafını girebilir, V1.5) | ✔ |
| Şube Kasaları | ✔ | ✔ | kendi vardiyası | ✔ |
| Raporlar | ✔ | ✔ | — | ✔ (finansal) |
| Onay Merkezi | ✔ | ✔ | — (kendi talepleri İşlerim'de) | ✔ (finans onayları) |
| Şubeler | ✔ | okuma | — | — |
| Kullanıcılar ve Roller | ✔ | okuma (davet: Sahip kararı) | — | — |
| İşlem Geçmişi | ✔ | ✔ | — | sınırlı (finans olayları) |
| Ayarlar | ✔ | ✔ (sınırlı) | — | ödeme politikası okuma |
| **Görünen bağlantı** | **21** | **20–21** | **11–12** | **12** |

> Not [BK]: Tablo varsayılan rol ön ayarlarıdır; Sahip izinleri değiştirebilir (Yönetici dahil) ama **Görevler** kapsamı kaldırılamaz: her kullanıcı kendi görevlerini ve kendi şubesinin havuzunu görür.

### J.2 Gerçek rol ön ayarlarıyla ilişki (bugün)
Bugünkü Sahip/Yönetici/Operasyon ön ayarlarının **izin dizeleri değişmez** (ör. `finance.payments.record`, `finance.payments.verify`, `finance.charges.manage/approve`, `finance.deposits.record/verify`, `finance.refunds.request/approve`, `finance.reports.read`, `finance.close`, `damage.unblock`, `maintenance.approve`, `transfers.approve`). Yeni modüllerin izinleri (`tasks.*`, `expenses.*`, `cash.*`, `approvals.*`, `reports.*`, `users.*`) rol ön ayarı **sürümü yükseltilerek** eklenir; yalnızca özelleştirilmemiş roller otomatik yükseltilir (bugünkü ön ayar-sürümleme kuralı).

### J.3 Muhasebe rolü — kapsam [PS]
**Yapabilir:** tahsilat kaydı/doğrulama, depozito kaydı/doğrulama, iade isteği ve (yetkiliyse) onayı, finansal raporlar (`finance.reports.read`), şube kasası (açılış/kapanış/sayım), masraf girişi ve onayı, kurumsal hesap hareketlerini görme ve ekstre, finans olaylarını işlem geçmişinde görme.
**Yapamaz:** araç oluşturma/düzenleme, bakım/hasar yönetimi, sistem ayarları, kullanıcı/rol yönetimi, rezervasyon/kiralama durumunu değiştirme (okur).
**Neden gerekli:** orta ölçekte tahsilat ve kasa işini yapan kişi araç operasyonunu görmemeli (en az yetki), ayrıca "kaydeden ≠ doğrulayan" ayrımını gerçek bir kişiyle kurabilmek için ikinci bir yetkili gerekir (K-4).
**Güvenlik:** Muhasebe *Sahip* değildir; ikinci onay yetkisi ayrı izinle verilir; kendi kaydettiği işlemi doğrulayamaz (mevcut kural).

---

## K. İşletme ölçeğine göre navigasyon

Çalışma profili (B.3) yalnız **varsayılan görünürlüğü** belirler; Sahip tek tek modül açıp kapatabilir. **Görevler, İşlerim, Rezervasyonlar, Kiralamalar, Takvim, Araçlar, Müşteriler, Finans ve Ayarlar hiçbir profilde gizlenmez.**

| | **Sade (küçük)** | **Standart (orta)** | **Gelişmiş (büyük)** |
|---|---|---|---|
| Tipik | 10–20 araç, 1 şube, 2–3 kişi | 50–100 araç, 2–5 şube | 300+ araç, çok şube |
| Görünen bağlantı | **16** | **20** | **21** (22 V1.5) |
| Gelişmiş katman | kapalı | Kurumsal, Kasalar, Onay, Şubeler | + İşlem Geçmişi |
| Örnek Operasyon kullanıcısı | 11 | 12 | 12 |

### K.1 Örnek menü — Küçük işletme (Sade, Sahip)
Genel: Ana Ekran · İşlerim → Operasyon: Rezervasyonlar · Kiralamalar · Takvim · **Görevler** · Araçlar · Bakım & Servis · Hasar ve Olaylar → Müşteri & Ticari: Müşteriler · Fiyatlandırma → Finans: Finans · Masraflar → Kontrol: Raporlar → Yönetim: Kullanıcılar ve Roller · Ayarlar. **= 16.** İşlem Geçmişi kullanıcı menüsünde; Şubeler Ayarlar → Şirket içinde; Onay ve Kasa gerekmez (Sahip tek karar verici; M.3 tek kişilik model).

### K.2 Örnek menü — Orta işletme (Standart, Yönetici)
Sade menüye + Kurumsal Hesaplar + Şube Kasaları + Onay Merkezi + Şubeler = **20**. İşlem Geçmişi kullanıcı menüsünde veya Sahip isterse sidebar'da.

### K.3 Örnek menü — Büyük işletme (Gelişmiş, Sahip/Yönetici)
Tümü: **21** (V1.5'te Talepler ve Satış Teklifleri ile 22). Çok şubeli: şube seçici üst barda; Takvim → Kapasite görünümü (V1.5); Raporlar'da şube karşılaştırma; gelişmiş filtreler ve kayıtlı görünümler.

### K.4 Profil değiştirme kuralları
1. Profil geçişi veri silmez; gizlenen modülün kayıtları yerinde kalır, arama ve doğrudan adres (yetkiyle) çalışır.
2. Profil değişikliği işlem geçmişine yazılır (kim/ne zaman/eski→yeni).
3. Kurulum sihirbazı profili şube sayısı ve araç sayısına göre **önerir**, kullanıcı değiştirebilir.
4. Bir modül gizliyken ondan gelen **uyarı** İşlerim'de yine görünür (ör. Onay Merkezi kapalı olsa da bana onay beklediğini söyleyen satır, tıklanınca modül açılır / yetkisizse nedeni yazar).

---

## L. Kritik iş akışları

Her akışta: kullanıcı · başlangıç · zorunlu bilgi · adımlar · hata durumları · yetki kontrolleri · hedef ekranlar · gerçek backend yetenekleri. *Gerçek yetenek* = bugün `main`da var / *Yeni* = V1'de geliştirilmesi gerekir.

### L.1 Hızlı rezervasyon
- **Kullanıcı:** Operasyon (telefon/gişe). **Başlangıç:** Ana Ekran "Yeni rezervasyon", Takvim boş hücre, Müşteri 360, Global Arama.
- **Zorunlu bilgi:** müşteri (var olan veya hızlı oluştur: ad + telefon + belge numarası sonradan), alış/iade tarih-saat ve şube, araç (belirli) **veya** sınıf (bekleyen), fiyat kaydı.
- **Adımlar:** (1) Tarih/şube → uygun araçlar listelenir (kısıtlar sunucuda) · (2) araç seç / sınıf seç · (3) müşteri ekle · (4) fiyat otomatik hesaplanır (Fiyat Kaydı) · (5) **"Bekleyen Kaydet"** *veya* **"Kontrol Et ve Onayla"** · (6) onaylıysa kaparo/ön ödeme isteği (isteğe bağlı) · (7) onay özeti + paylaşılabilir belge.
- **Hata durumları:** araç artık uygun değil (çakışma) → seçim ekranına dön, öneri · fiyat değişti (409 `PRICE_CHANGED`) → farkı göster · kara listedeki müşteri → engel + gerekçe · ehliyet yaşı/geçerlilik uyarısı · saat dilimi/şube kapalı.
- **Yetki:** `reservations.create`, `reservations.confirm`; sınıf bekleyeni araç tutmaz (arayüz açıkça yazar).
- **Ekranlar:** Rezervasyon çalışma alanı (tek sayfa + sağ özet), Müşteri hızlı oluşturma çekmecesi.
- **Gerçek:** Gerçek (rezervasyon, uygunluk, fiyat kaydı, kara liste); **Yeni:** sınıf bekleyeni gerçekte (bugün R1: sınıf onaylanamaz → bekleyen olarak kaydı eklenmeli), kaparo isteği.

### L.2 Rezervasyondan kiralamaya (teslim)
- **Kullanıcı:** Operasyon. **Başlangıç:** Rezervasyon detayı "Teslime başla", Ana Ekran "Bugün teslimler".
- **Zorunlu bilgi:** sürücü(ler) belgeleri (ehliyet, kimlik; ülke kuralı), sözleşme (taslak üretildi / dışarıda işleme alındı — K1), depozito, sigorta seçimi, araç hazır (hazırlık ✔), teslim kilometre/yakıt/fotoğraf.
- **Adımlar (7 adımlı Teslim Masası):** belgeler → sürücüler → araç hazırlığı → fiyat ve sigorta → depozito/ön ödeme → sözleşme → fotoğraf+imza → **Teslimi Tamamla** (pasifse nedeni yazılı).
- **Hata durumları:** belge eksik/taranmamış (ClamAV kapısı) → ilerlemez · araç hazır değil → Hazırlık sekmesi · depozito alınmamış → politika gereği ya alınır ya **istisna** (K-4 seviye) · araç başka kiralamada (kilit) → öneri · çevrimdışı/çakışma.
- **Yetki:** `rentals.deliver`, `finance.deposits.record`; sözleşme modu Sahip.
- **Ekranlar:** Kiralama 360 + Teslim Masası + Sözleşme önizleme/PDF.
- **Gerçek:** Gerçek (teslim, belgeler, ClamAV kapısı, sözleşme taslağı, depozito kaydı); **Yeni:** kaparo → ön ödeme mahsubu, imza yakalama (demo).

### L.3 İade
- **Kullanıcı:** Operasyon. **Başlangıç:** Kiralama 360 "İade al", Ana Ekran "Bugün iadeler".
- **Zorunlu bilgi:** iade tarihi/saati (şube saat dilimi), kilometre, yakıt, hasar var/yok, temizlik, belge/fotoğraf.
- **Adımlar:** kontrol → hasar tespiti (varsa Hasar kaydı + fotoğraf) → ek ücret hesabı (gecikme, km, yakıt, hasar) → depozito: iade/mahsup/tutma kararı → tahsilat → **iadeyi tamamla** (operasyonel) → finansal kapanış ayrı (K-2).
- **Hata durumları:** geç iade → gecikme ücreti otomatik, itiraz kaydı · hasar anlaşmazlığı → depozito tutma "Bekleyen" · km girişi geriye · farklı şubeye iade (tek yön ücreti, şube kapsamı).
- **Yetki:** `rentals.return`; depozito iadesi `finance.refunds.request`, tutma/mahsup `finance.deposits.*` (M.2 seviyeleri).
- **Ekranlar:** İade masası, Teslim↔İade karşılaştırması, Hasar kaydı çekmecesi, Finans tahsilat masası.
- **Gerçek:** Gerçek (iade, hasar, ek ücret kalemleri, depozito kaydı); **Yeni:** kısmi iade/mahsup (K-13), kasa bağlantısı.

### L.4 Görev yönetimi
- **Kullanıcı:** herkes. **Başlangıç:** Görevler, her kaydın "Görev ekle", İşlerim.
- **Zorunlu bilgi:** başlık; diğerleri isteğe bağlı (D.3).
- **Adımlar:** oluştur → ata veya havuza bırak → bildirim → üstlen/başla → tamamla (not) → bağlı kayıt değişmez (D.6) → geçmiş.
- **Hata durumları:** çift üstlenme (409) · atanan kullanıcı kapsam dışı · bitiş geçmişte (uyarı, engel değil) · tamamlanmış görevi düzenleme (yeniden aç Yönetici+).
- **Yetki:** `tasks.read/create/assign/manage`.
- **Ekranlar:** Görevler (Benim/Havuz/Takımım/Geciken/Bugün), görev çekmecesi, kayıt 360 sekme/rozet.
- **Gerçek:** **Yok** — tablo, API, RLS, bildirim yeni (B bağımlılığı, R).

### L.5 Günlük tahsilat
- **Kullanıcı:** Operasyon (kayıt), Muhasebe/Yönetici (doğrulama). **Başlangıç:** Kiralama 360 "Tahsilat ekle", Finans "Ödeme ekle".
- **Zorunlu bilgi:** ödeyen, yöntem (nakit/kart/havale), tutar + ISO para birimi, (nakitse) kasa, makbuz/referans; kimin kaydettiği.
- **Adımlar:** kaydet (Kaydedildi) → doğrula (Doğrulandı — kaydeden olmayan yetkili; Seviye kuralı M.2) → uygulama (V1 doğrulamayla otomatik; V1.5 açık tahsis) → kasa defteri satırı → günlük özet.
- **Hata durumları:** tekrar gönderim (idempotency anahtarı) · fazla tahsilat (açık bakiye aşımı → avans olarak mı?) · para birimi farkı (kur yok → "Kur bekleniyor", karışık toplam yok) · doğrulayan = kaydeden (engel) · kapalı kasa.
- **Yetki:** `finance.payments.record`, `finance.payments.verify`.
- **Ekranlar:** ortak tahsilat masası (Finans ve Kiralama→Finans aynı bileşen), ödeme çekmecesi.
- **Gerçek:** Gerçek (kayıt+doğrula+idempotency, FN1); **Yeni:** kasa, kur/FX, uygulama aşaması.

### L.6 Gün sonu
- **Kullanıcı:** Operasyon (vardiya sonu), Yönetici/Muhasebe (onay). **Başlangıç:** Şube Kasaları "Günü kapat", Ana Ekran hatırlatması.
- **Zorunlu bilgi:** para birimi başına sayım, vardiya, açıklama (fark varsa).
- **Adımlar:** gün için tahsilat/iade/masraf dökümü (sistem beklentisi) → sayım gir → fark hesabı → fark açıklaması → kapat (kilit) → **Gün sonu raporu** (Raporlar, yazdırılabilir) → açık sorun listesi (doğrulanmamış tahsilat, kapanmamış kiralama) İşlerim'e düşer.
- **Hata durumları:** fark eşik üstü → Yönetici onayı (Seviye 1/2) · doğrulanmamış tahsilat varsa kapatma uyarısı · geç kapanış · geri açma (Yönetici, neden zorunlu, geçmiş).
- **Yetki:** `cash.close`, `cash.reopen`.
- **Ekranlar:** Şube Kasaları, Gün sonu raporu.
- **Gerçek:** **Yok** (FN7: gerçekte kasa yok) — V1'de geliştirilecek.

### L.7 Bakım / hasar
- **Kullanıcı:** Operasyon, Yönetici. **Başlangıç:** Araç 360, İade sırasında hasar, Bakım & Servis, Görev.
- **Zorunlu bilgi:** araç, tür (bakım/tamir/hasar), açıklama, tarih aralığı, maliyet tahmini, kanıt (fotoğraf).
- **Adımlar:** kayıt oluştur → araç **engeli** (uygunluğa yansır) → onay (bakım maliyeti eşiği veya hasar: `maintenance.approve`) → servise gönder/transfer (taşıyıcı kanıtı) → tamamla → maliyet kaynaklı **masraf** otomatik (K-17, çift sayım yok) → engel kaldır (hasar: `damage.unblock`, bağımsız onay).
- **Hata durumları:** araç aktif kiralamada (engel çakışması) · kanıtsız yola çıkış (engel) · onaylayan = oluşturan · engel kaldırma ikinci onaysız (Drina: kilitli, M.4).
- **Yetki:** `maintenance.*`, `damage.*`, `transfers.*`.
- **Ekranlar:** Bakım & Servis, Hasar ve Olaylar, Araç 360 sekmeleri, Takvim blok.
- **Gerçek:** Gerçek (hasar, bakım, onay, kanıt, transfer, engel); **Yeni:** ceza/olay (V1.5), masraf bağlantısı.

### L.8 İlk kurulum (ek akış, K-12)
- **Kullanıcı:** Sahip (ve operatör adımları). **Başlangıç:** ilk giriş sonrası sihirbaz; her adım Ayarlar'dan tekrarlanabilir.
- **Adımlar:** (1) Şirket (ad, ülke, para birimi, saat dilimi) → (2) Şubeler (ülke, saat dilimi, çalışma saati) → (3) Çalışma profili önerisi → (4) İlk araç (gerçek form; içe aktarma V1.5) → (5) Kullanıcı davet + rol (yetki özeti) → (6) Temel fiyat listesi → (7) Sözleşme ayarı (K1 modu, şablon, hukuki onay notu) → (8) Ödeme/depozito/iptal politikası (K-13) → (9) **Hazırlık kontrolü** (mevcut Operasyonel Hazırlık: şube ülkesi, saat dilimi, müşteri anahtarı, ClamAV, belge kuralı, kiralama modu, fiyat listesi, vergi, sözleşme şablonu, bağımsız yetkili sayısı, bekleyen kararlar) → "Hazır / Eksikler" listesi, eksik başına bağlantı.
- **Hata durumları:** kontrol başarısız (kırmızı) → hangi adımdan düzeltileceği · yalnız 1 yetkili → "Bağımsız doğrulayıcı yok" uyarısı ve seçenekler (M.3) · operatör işi (ClamAV, anahtar) → "Sistem yöneticisine iletin" bilgisi.
- **Yetki:** `settings.manage` (Sahip).
- **Gerçek:** Kısmen (hazırlık kontrolü ve şube/fiyat/ayar uçları var); **Yeni:** sihirbaz, şirket oluşturma, davet, sade mod.

---
## M. Finans ve onay politikaları

### M.1 Tek finans modeli ve ayrımlar [K-2]

**Aşamalar:** Kaydedildi → Doğrulandı → Uygulandı → Mutabakat → Denetim geçmişi.

| Aşama | Anlamı | Kim | V1'de |
|---|---|---|---|
| **Kaydedildi** | İşlem girildi; bakiyeyi **henüz değiştirmez** (Kayıt ≠ Doğrulanmış) | Kaydeden | Gerçek (FN1) |
| **Doğrulandı** | Yetkili ikinci kişi/politika doğruladı | Doğrulayan (seviye kuralı M.2) | Gerçek |
| **Uygulandı** | Hesap kalemine/bakiyeye düşüldü (Kaydedildi ≠ Uygulandı) | Sistem | V1: doğrulamayla **otomatik**; V1.5: açık tahsis |
| **Mutabakat** | Kasa/banka ile eşleşti | Muhasebe | V1.5 (gün sonu kasa sayımı V1) |
| **Denetim** | Değişmez olay geçmişi | Sistem | Gerçek |

**Kavram ayrımları (hiçbiri birleştirilmez):** Hesap kalemi ≠ Tahsilat · Kayıt ≠ Doğrulanmış · Kaydedildi ≠ Uygulandı · **Kaparo ≠ Depozito** (kaparo kiralama bedelinden düşer; depozito güvencedir) · **Depozito ≠ Gelir** (iade veya mahsup edilene dek yükümlülük) · **İade ≠ Gider** · Rezervasyon ≠ Kiralama · Operasyonel kapanış ≠ Finansal kapanış.

### M.2 Risk temelli onay seviyeleri [K-4]

| Seviye | Örnek işlemler | Doğrulama kuralı |
|---|---|---|
| **0 — Düşük** | Standart politika bedeli hesabı, rutin tahsilat kaydı (kaydeden Muhasebe ise), kasa sayımı (fark yok) | Onay yok; tam denetim izi |
| **1 — Orta** | Tahsilat/depozito doğrulama, eşik altı masraf, küçük kasa farkı, standart iade (politika içi) | **Kaydeden ≠ doğrulayan** zorunlu; şirket politikası tek kişilik işletme için seçenekleri belirler (M.3) |
| **2 — Yüksek** | Finansal düzeltme (ters kayıt), riskli iade, geçmiş dönem finans düzenleme, kritik depozito istisnası, **hasar engeli kaldırma**, politikadan sapma/indirim feragati, FN5 sorumlu düzeltme | **Her zaman bağımsız onay:** onaylayan, işlemi kaydeden/talep eden kişiden **farklı** ve ilgili onay iznine sahip olmalıdır; şirket politikasıyla gevşetilemez |
| **3 — Kritik** | Dönem kapatma/açma, rol/yetki değişimi, kullanıcı silme | Bağımsız onay + kayıt + (V1.5) gecikmeli yürürlük |

**Kural:** Seviye 2–3 işlem **hiçbir profilde ve hiçbir politikayla** tek kişiye indirilemez. Bu, bugünkü gerçek zorunlu ikinci onayların (DB `CHECK`'ler dahil) korunmasıdır.

### M.3 Tek kişilik/küçük işletme için dürüst model
Değerlendirilen seçenekler:

| Seçenek | Değerlendirme | Karar |
|---|---|---|
| (a) **Ayrı yetkili kişi** (ortak, aile üyesi, güvenilir çalışan) | Gerçek bağımsızlık; en güvenli | **Önerilen varsayılan** (kurulum sihirbazı ister) |
| (b) **Dış muhasebeci kullanıcı** (Muhasebe rolü, kısıtlı) | Bağımsız; periyodik doğrulama; işletmeye ek maliyet yok | **Desteklenir** (V1: davet + Muhasebe rolü) |
| (c) **Risk temelli politika** — Seviye 1 işlemleri için "kendi kaydını doğrula" izni *yalnız Sahip kararıyla, işaretli* | Dürüst ve açık: kayıt "**kendi doğrulama**" etiketi taşır; ayrı raporda listelenir; Seviye 2 hiç açılmaz | **V1.5 adayı** (backend tasarım + güvenlik incelemesi sonrası, S/V-5) |
| (d) **Sonradan denetim** (post-audit) — tüm kendi-doğrulamalı işlemler haftalık Muhasebe/dış kişi tarafından gözden geçirilir | Bağımsızlığı geciktirerek kurar | (c) ile birlikte |
| (e) Sahte dört göz (aynı kişi iki hesap) | **Reddedildi** — güvenliğin görüntüsü, kendisi değil | Yasak; kullanıcı yönetiminde aynı kişi–ikinci hesap uyarısı (V1.5) |

**Kural:** V1'de gerçek kural değişmez; (a) ve (b) hemen kullanılır; (c)–(d) backend tasarımından sonra.

### M.4 Drina senaryosu (1 Sahip + 1 Operasyon) — neler çalışır, neler kilitli?

> Tüm finans bloke **değildir.** Gerçek üründe (FN1–FN7 incelemesi):

| İşlem | Drina'da durum | Açıklama |
|---|---|---|
| Tahsilat kaydı (Operasyon) → doğrulama (Sahip) | **Çalışır** | Farklı iki kullanıcı |
| Depozito kaydı → doğrulama | **Çalışır** | Aynı |
| Rutin iade isteği (Operasyon) → onay (Sahip) | **Çalışır** | İstek ≠ onay |
| Sahip'in kendi kaydettiği tahsilatı doğrulaması | **Kilitli** | Kaydeden ≠ doğrulayan |
| İç hesap kalemi onayı, kalem ters kaydı | **Kilitli** (ikinci bağımsız yetkili yok) | Seviye 2 |
| İade bildirimi sonrası ters kayıt | **Kilitli** | Seviye 2 |
| Hasar engeli kaldırma | **Kilitli** | `damage.unblock` ikinci onay |
| FN5 sorumlu düzeltme ikinci onayı | **Kilitli** | Seviye 2 |

**Çözüm yolu:** (a) üçüncü yetkili ekleme (ortak/muhasebeci kullanıcı, Muhasebe rolü) veya (b) V1.5'te Seviye 1 için M.3(c). Seviye 2 için çözüm yalnız bağımsız ikinci yetkilidir. Kurulum sihirbazı bu durumu "Bağımsız doğrulayıcı yok: şu işlemler kilitli kalır" diye **önceden** gösterir (L.8; mevcut hazırlık kontrolü *four-eyes authorizers ≥ 2*).

### M.5 Kaparo ve kısmi iade (K-13)

**Politika (şirket tanımlı):** iptal zamanına göre politika bedeli (yüzde/sabit/gece), kaparo iadesi kuralı, hangi koşulda tam/kısmi/iadesiz. Personel bedeli elle değiştiremez; standart bedel hesabı **yeni onay türü gerektirmez** (Seviye 0). Sapma/feragat/gerçek para iadesi → seviye kuralı.

**Kaparo defteri — beş ayrı satır:**

| Satır | Anlamı |
|---|---|
| 1. **Politika bedeli** | İptal kuralının hesapladığı tutar (otomatik) |
| 2. **Müşteri alacağı** | Kaparodan fazla politika bedeli çıkarsa müşteriden alınacak fark |
| 3. **Gerçek iade** | Müşteriye geri ödenen tutar (para hareketi; onaya tabi) |
| 4. **Kalan kullanılabilir kaparo** | Bu müşteri/rezervasyon için tutulan, başka kiralamada kullanılabilir bakiye |
| 5. **Geçmiş** | Her satırın olay geçmişi (değişmez) |

**Örnek:** Kaparo **200 EUR**, politika bedeli **50 EUR** → iade edilebilir **150 EUR**. Kullanıcı 150 EUR'yu iade eder: (1) 50 EUR politika bedeli satırı, (2) alacak 0, (3) gerçek iade 150 EUR (talep → onay → ödeme), (4) kalan kullanılabilir kaparo **0**, (5) 4 olay. Kısmi iade 100 EUR ise kalan 50 EUR kullanılabilir kalır. **Aynı kaparo iki kez iade edilemez:** iade tutarı "iade edilebilir kalan"ı aşamaz (sunucu koşullu güncelleme + idempotency).

### M.6 Para birimi, kur, kasa
- **Hedef:** ISO 4217 para birimleri; her işlemde kod; **karışık toplam yok** (para birimi başına satır); kur **anlık görüntü** (işlem anında kayıt, sonradan değişmez); şube kasası para birimi başına çekmece.
- **Kapsam ve sıra ayrımı:** *Kapsam* (hangi para birimleri) = şirket ayarı (V1: şirket para birimi + en çok 2 ek); *sıra* (hangi sprintte) = V1'de tek para birimi çekmecesi + EUR/BAM gibi sabit ikinci, V1.5'te kur anlık görüntüsü ve çok çekmece. Gerçekte kur yok (FN3) — Kur bekleniyor durumu taslak kalır.
- **Kasa–finans bağlantısı:** nakit tahsilat kasa defterine **yazılır**; kasa kapanışı doğrulanmamış tahsilatı listeler; kasa sayım farkı Seviye kuralına tabidir.

### M.7 Araç maliyeti ve masraf çift sayımı (K-17)
**Araç maliyeti** = bakım/tamir maliyeti (kaynak: Bakım) + hasar onarım (kaynak: Hasar) + araca bağlı masraf (yakıt, lastik, yıkama) + ceza (V1.5) + sigorta/vergi payı (genel masrafın araç bazına dağıtımı V1.5).
**Çift sayım yok:** bakım maliyeti yalnız Bakım kaydında yaşar; "kaynak işlemden gelen" masraf satırı kaynağa **referans** verir ve düzenlenemez; Masraflar listesi onu "kaynak: Bakım #123" diye gösterir. Raporlar maliyeti kaynak kimliğine göre tekilleştirir. Test: aynı bakım maliyeti hem Bakım hem Masraflar'da var → araç maliyeti raporunda **bir kez**.

### M.8 Demo–gerçek yakınsama sırası
1. Demoyu K-2 modeline hizala (Kaydedildi/Doğrulandı ayrımı, seviye 2 örnekleri; "kaydet=uygula" kalkar) — **F**.
2. Kaparo defteri, kasa, masraf ve görev backend'i — **B** (altın vektörlerle, K-18).
3. Çok para birimi/kur — V1.5.

---

## N. Demo ve gerçek ürün ayrımı

### N.1 Etiketleme (K-15)
| Etiket | Nerede | Anlamı |
|---|---|---|
| **Gerçek** | Dokümanlarda | `main`da gerçek backend ile çalışıyor |
| **Kısmen gerçek** | Dokümanlarda | Bir kısmı gerçek |
| **Demo** | Dokümanlarda; arayüzde "Demo konsepti" rozeti | Tarayıcıda çalışır, sunucu garantisi yok |
| **V1 / V1.5 / V2** | Yol haritası | Hedef kapsam |

### N.2 Kurallar
1. Demoda gerçekte olmayan her işlev **"Demo konsepti"** rozeti taşır (ekran üstü, tıklayınca V1/V1.5/V2 durumu).
2. Satış/sunumda "var" sözü yalnız **Gerçek** veya "V1 hedefi" ile söylenir; Demo ve Yok öğeler için "ürün yönü" denir.
3. V2 modülleri (Partner, Tedarikçi, Filo Asistanı, Fırsatlar, Kurallar) demoda menüde **görünmez**, doğrudan adresle "Henüz etkin değil" sayfası.
4. Demo güvenlik kuralları gerçek garanti değildir; "Sunucu tarafında doğrulanır" yazan hiçbir demo metni olmaz.

### N.3 Olgunluk matrisi (modül × bugün × hedef)

| Modül | Gerçek | Demo | Hedef |
|---|---|---|---|
| Rezervasyon, Kiralama, Araç, Müşteri, Bakım, Hasar, Fiyat, Şube, Belgeler | Gerçek | Zengin | V1 |
| Finans (kayıt+doğrulama) | Gerçek | Fazlası var | V1 (K-2) |
| Görevler, Masraflar, Kasa, Raporlar, Onay, Takvim | Yok | Tam/kısmi | V1 |
| Kullanıcı yönetimi, davet | Yok | Demo | V1 |
| Ana Ekran, Bildirim | Kısmen | Demo | V1 |
| Talepler, kapasite, kurumsal kredi, birleştirme | Yok | Demo | V1.5 |
| Partner, Tedarikçi, Filo Asistanı, Fırsatlar, Kurallar | Yok | Demo | V2 |

---

## O. Frontend değişiklik matrisi

Gruplar **A–I**; her satırın kabul ölçütü test ile kontrol edilebilir (Playwright/vitest). *Bu belge kod değiştirmez; bu matris Prompt 2'nin girdisidir.*

### O.A Navigasyon ve yönlendirme
| # | İş | Kabul ölçütü (test) |
|---|---|---|
| A1 | `NAV` yapısı H.2 (6 grup, 21 bağlantı) | Sidebar tam 21 `link` (Sahip, Gelişmiş); Operasyon rolünde 11–12 |
| A2 | Eski 36 rota yönlendirmesi (I.3) | Her eski adres → yeni adres + içerik görünür (36 test) |
| A3 | Profil Sade/Standart/Gelişmiş | Sade = 16 link; Görevler her profilde var |
| A4 | Modül anahtarları | Anahtar kapalı modül menüde ve aramada yok; doğrudan adres "Henüz etkin değil" |
| A5 | Yetkisiz doğrudan adres | ForbiddenState görünür, veri sızmaz |
| A6 | Sekme/görünüm URL'de | Yenileme sonrası aynı görünüm |
| A7 | Ortak zaman çizelgesi bileşeni | Takvim + Kapasite + Araç Müsaitlik aynı bileşen |

### O.B İşlerim ve Ana Ekran
| # | İş | Kabul |
|---|---|---|
| B1 | Komuta Merkezi → İşlerim, iki sekme | "Bana düşenler", "Uyarılar"; tür etiketi |
| B2 | Kaynak bağlantıları | Her satır kaynağa gider |
| B3 | Sayaç tutarlılığı | Ana Ekran sayısı = İşlerim sayısı |
| B4 | Yedinci onay türü yok | Onay Merkezi tam 6 tür |
| B5 | Yetkisiz sayı sızması yok | Yetkisiz rolde finans sayacı gizli |

### O.C Görevler (D)
| # | İş | Kabul |
|---|---|---|
| C1 | Havuz + şube/rol filtresi | Başka şube havuzu görünmez |
| C2 | Çift üstlenme çakışması | İkinci kullanıcı 409 mesajı |
| C3 | Araç/Kiralama/Rezervasyon/Müşteri/Bakım-Hasar bağlantı rozetleri | Kayıt 360'ta görev sayısı ve liste |
| C4 | Tamamlama bağlı kaydı değiştirmez | Test: görev tamamlanınca kiralama durumu aynı |
| C5 | Yeniden atama, geçmiş | Geçmişte "A→B" |
| C6 | Bildirim türleri | 6 tür tetiklenir |
| C7 | Toplu işlem | Seç + ata/tamamla |
| C8 | Sade modda görünür | Test: Sade profilde Görevler var |

### O.D Rezervasyon ve Kiralama
| # | İş | Kabul |
|---|---|---|
| D1 | İki eylem "Bekleyen Kaydet" / "Kontrol Et ve Onayla" | Bekleyen araç bloke etmez (takvim) |
| D2 | Sınıf bekleyeni dili | "Araç tutulmaz" metni |
| D3 | Hızlı rezervasyon akışı (L.1) | Uçtan uca test |
| D4 | Teslim Masası 7 adım, pasif nedeni | Pasif düğmede neden metni |
| D5 | Sözleşmeler görünümü Kiralamalar'da | Aynı veri |

### O.E Finans, Kasa, Masraf
| # | İş | Kabul |
|---|---|---|
| E1 | Aşamalar etiketleri (Kaydedildi/Doğrulandı/...) | Aynı kayıt tek durum |
| E2 | Seviye 2 işlemler bağımsız onay | Tek kişi ile yapılamaz |
| E3 | Kaparo defteri 5 satır | Örnek 200/50/150 sayıları doğru |
| E4 | İkinci iade engeli | Aynı kaparo iki kez iade edilemez |
| E5 | Karışık toplam yok | Para birimi başına satır |
| E6 | Masrafta 4 bağ türü + kaynak kilidi | Kaynak satır düzenlenemez |
| E7 | Çift sayım yok | Araç maliyeti raporunda bir kez |
| E8 | Gün sonu akışı (L.6) | Fark açıklamasız kapanmaz |
| E9 | Dikkat görünümü | Gelir Kontrolü içeriği Finans'ta |

### O.F Roller ve kullanıcı yönetimi
| # | İş | Kabul |
|---|---|---|
| F1 | Dört rol, Muhasebe kapsamı (J.3) | Muhasebe araç oluşturamaz |
| F2 | Davet, şifre sıfırlama ekranı | Akış testi |
| F3 | Rol ön ayarı sürüm yükseltme | Özelleştirilmiş rol otomatik değişmez |

### O.G Kurulum ve ayarlar
| # | İş | Kabul |
|---|---|---|
| G1 | Sihirbaz (L.8) | 9 adım; hazırlık kontrolü sonucu |
| G2 | Bütünlük görünümü (Ayarlar) | Eski Gelir Kontrolü değişmezleri |
| G3 | Bildirim eşikleri (Kurallar yerine) | Eşik değişince uyarı sayısı değişir |

### O.H Dil ve etiketler
| # | İş | Kabul |
|---|---|---|
| H1 | Terim: Fiyat kaydı / Satış teklifi | Arayüzde "Fiyat teklifi" yok |
| H2 | Etiket: Demo konsepti rozeti | Gerçek olmayan her ekranda |
| H3 | TR+EN katalog altyapısı | Eksik anahtar derlemeyi bozar |

### O.I Kalite ve test
| # | İş | Kabul |
|---|---|---|
| I1 | Demo e2e güncelleme | Mevcut 301 test uyarlanır/yeşil |
| I2 | Erişilebilirlik | axe kritik ihlal yok |
| I3 | Altın vektör testleri (K-18) | Demo ve shared aynı sonucu verir |
| I4 | Ekran görüntüsü turu | 1440/1024/768, yatay taşma yok |

---

## P. Tasarım sprinti hazırlığı

> **Tasarım, bu mimari belgesi onaylanmadan başlamaz.** Önceki **V5 referansları saklanır** (`design/references/approved` ve `acarvo-design-direction`); **reddedilen tasarımlar** (Tasko karakteri dahil olmak üzere genel KPI kutuları, hap rozetleri, jenerik kart kiti) **yeniden kullanılmaz.** Bu bölümde çizim veya kod yoktur.

### P.1 Öncelik sırası ve her ekranın cevaplaması gereken soru
| Sıra | Ekran | Cevaplayacağı iş sorusu | Tasarım odağı |
|---|---|---|---|
| 1 | **Navigasyon** | "Nerede ne var?" | 21 bağlantı, Temel/Gelişmiş, sade mod, rol varyantları |
| 2 | **Ana Ekran** | "Bugün durum ne?" | Tek satır özet, bugünün işleri, bana düşen sayacı |
| 3 | **Rezervasyon çalışma alanı** | "Hızla doğru rezervasyon" | İki eylem, uygunluk, fiyat özeti |
| 4 | **Kiralama 360** | "Bu kiralama nerede, ne eksik?" | Üst bant, karar kartları, Teslim Masası |
| 5 | **Araç 360** | "Bu araç durumda mı?" | Plaka çipi, durum şeridi, Müsaitlik/Hazırlık ayrımı |
| 6 | **Görevler** | "Bugün kim ne yapıyor?" | Havuz/Benim/Geciken, hızlı oluşturma |
| 7 | **Takvim** | "Hangi araç ne zaman dolu?" | Ortak zaman çizelgesi, blok, kapasite görünümü |
| 8 | **Finans** | "Bakiye ve bekleyen ne?" | Para birimi başına satır, aşama rozetleri, tahsilat masası |
| 9 | **Şube Kasaları** | "Kasam tutuyor mu?" | Sayım, fark, gün sonu |
| 10 | **Raporlar** | "Karar için rakam" | 3 çekirdek rapor, tablo karşılığı |

### P.2 Tasarım girdileri
Bu belgenin H (menü), K (profiller), L (akışlar), M (durum etiketleri), O (kabul ölçütleri) bölümleri. Çıktı: onaylı referans panosu, ardından ekran-ekran Playwright incelemesi (ekran görülmeden "başarılı" denmez, bellek kuralı).

---
## R. Backend bağımlılık haritası

> Frontend kapsamının tamamlanması backend'in hazır olduğu anlamına **gelmez**. Durum: **Gerçek** (main'de) · **Kısmen** · **Demo** (yalnız demoda) · **Yok**. Sütun "Backend'in yeni sorumluluğu" Prompt 4'ün girdisidir; her satır sunucu tarafında yetki, kiracı/şube RLS, denetim izi ve (mutasyonsa) idempotency gerektirir.

| Özellik | Durum | Backend'in yeni sorumluluğu | Aşama |
|---|---|---|---|
| Rezervasyon (belirli araç) | Gerçek | "Bekleyen/sınıf" kaydı (`reservations_confirmed_vehicle_check` korunur) | V1 |
| Sınıf kapasitesi | Yok | Kapasite defteri, atomik dönüşüm, kilit | V1.5 |
| Kiralama, teslim, iade | Gerçek | Kaparo mahsubu, kasa bağlantısı | V1 |
| Fiyat motoru / Fiyat Kaydı | Gerçek | Aynı (shared `pe-1`) | V1 |
| Satış Teklifi | Yok | Model + yaşam döngüsü (K-16) | V1.5 |
| **Görevler** | **Yok** | `tasks`, `task_links`, `task_events`, havuz/üstlenme (koşullu güncelleme), bildirim, RLS | **V1** |
| İşlerim kuyruğu | Yok | Yetkiye göre birleştirme sorgusu (görev+onay+uyarı) | V1 |
| Bildirimler | Yok | Uygulama içi bildirim tablosu + okundu | V1 |
| Onay Merkezi (6 tür) | Yok | Onay istekleri tablosu; operasyonel dört göz akışları mevcut kalır | V1 |
| Finans kayıt+doğrulama | Gerçek | Seviye politikası alanı; "Uygulandı" aşaması | V1 |
| Kaparo defteri / kısmi iade | Yok | Defter, politika, iade sınırı, idempotency | V1 |
| Çok para birimi / kur | Yok | ISO, kur anlık görüntüsü, çekmece | V1.5 |
| Şube Kasaları | Yok | Çekmece, vardiya, sayım, gün sonu, kilit | V1 |
| Masraflar + araç bağlantısı | Yok | `expenses` (bağ türü, kaynak referansı), kaynak kilidi | V1 |
| Raporlar (3 çekirdek+gün sonu) | Yok | Sorgu uçları, yetki (`reports.read`), performans (300+ araç) | V1 |
| Kullanıcı daveti/şifre sıfırlama | Yok | Davet jetonu, e-posta, politika, oturum iptali | V1 |
| Rol: Muhasebe | Yok | Ön ayar + sürüm yükseltme | V1 |
| Özel rol editörü | Yok | İzin matrisi API | V1.5 |
| Sözleşme taslağı/PDF | Gerçek | Sürüm snapshot (var) | V1 |
| Ceza/Olay | Yok | Modeller | V1.5 |
| Operasyonel hazırlık | Gerçek | Kurulum sihirbazı entegrasyonu | V1 |
| Şirket oluşturma (kurulum) | Yok | Operatör aracı + ilk Sahip | V1 |
| i18n hata kodları | Yok | Kod + parametre dönüşü (K-10) | V1 |
| Toplu içe aktarma | Yok | Doğrulama, önizleme, geri al | V1.5 |
| Mükerrer birleştirme | Yok | Bağımsız onay, geçmiş koruma | V1.5 |
| Partner Portalı, Tedarikçi, Alt-kiralama | Yok | Ayrı kimlik/oturum, modeller | V2 |

**Sıralama önerisi (Prompt 4):** (1) Kullanıcılar+Muhasebe rolü+davet · (2) Görevler+bildirim · (3) Masraflar · (4) Kasa+gün sonu · (5) Kaparo defteri · (6) Onay Merkezi · (7) Raporlar · (8) i18n hata kodları. Her biri RLS testi, çapraz-kiracı testi, eşzamanlılık testi ve ayrı güvenlik incelemesiyle.

---

## S. Riskler ve açık doğrulamalar

### S.1 Ürün riskleri
| # | Risk | Etki | Önlem |
|---|---|---|---|
| R-1 | Menü sadeleşmesi sonrası kullanıcı "kayıp özellik" sanar | Güven | Eski rotalar yönlendirilir; sürüm notu; arama |
| R-2 | Demo ile gerçek davranış farkı satışta yanlış beklenti yaratır | İtibar | K-15 etiketleri, N kuralları |
| R-3 | Görevler gerçekte yok; büyük backend işi | Takvim | R sıralaması, V1 öncelik #2 |
| R-4 | Tek kişilik işletme Seviye 2 işlemde kilitlenir | Kullanım | M.3 (a)(b), kurulumda önceden uyarı |
| R-5 | 300+ araçta İşlerim/Raporlar performansı | Yavaşlık | Sunucu sorguları, indeks, sayfalama; yük testi (doğrulanmadı) |
| R-6 | Rol/menü gizlemesinin güvenlik sanılması | Sızma | H.5-2; sunucu yetkisi tek otorite |
| R-7 | Kısmi iade/kaparo çifte iade | Mali kayıp | Sınırlı bakiye + idempotency + koşullu güncelleme |
| R-8 | Çok para birimi hataları | Mali | V1.5 ve altın vektörler |

### S.2 Açık doğrulamalar (çözülmüş **sayılmaz**)
| # | Konu | Neden açık | Kim doğrular |
|---|---|---|---|
| V-1 | Sınıf kapasitesi DB tasarımı ve eşzamanlılık | Henüz tasarım yok | Backend tasarımı + paralel test |
| V-2 | 300+ araç performansı | Ölçülmedi | Yük testi |
| V-3 | Görev havuzunda aynı anda üstlenme | Yeni mekanizma | Eşzamanlılık testi |
| V-4 | Kaparo iade/mahsup muhasebesi | Muhasebe ve vergi etkisi | Muhasebeci / hukukçu |
| V-5 | M.3(c) kendi-doğrulama politikası | Mevcut DB `CHECK`'lerini gevşetmeyi gerektirir | Güvenlik incelemesi |
| V-6 | e-imza geçerliliği | Hukuki | Hukukçu (K-5) |
| V-7 | Sözleşme şablonlarının ülke uygunluğu | Hukuki | Hukukçu, ülke başına |
| V-8 | Mevcut `price_quotes` etiket değişikliği etkisi | API/arayüz uyumu | Frontend sprinti testi |
| V-9 | Kullanıcı davet akışının güvenliği (jeton, deneme sınırı) | Yeni yüzey | Güvenlik incelemesi |
| V-10 | Ortak hesaplama vektörlerinin eşdeğerliği (demo ↔ shared) | Demo kendi çekirdeğini kullanıyor | Altın vektör testi |

### S.3 Hukuki ve operasyonel hazırlık (K-14) — üretim öncesi zorunlu liste
1. **Vergi:** ülkeye göre KDV/benzeri, fatura/makbuz zorunlulukları, depozito/kaparo vergilendirmesi — *hukuki/mali inceleme gerekir.*
2. **Sözleşme:** her ülke için şablon uygunluğu, yetki ve uyuşmazlık hükümleri.
3. **Sigorta:** poliçe/sorumluluk beyanları; ACARVO sigorta aracılığı iddiasında bulunmaz.
4. **Kişisel veri:** KVKK/GDPR/Bosna mevzuatı, işleme envanteri, ilgili kişi hakları, aydınlatma metni, ihlal süreci.
5. **Saklama:** sözleşme, belge, fotoğraf, finans kayıtlarının yasal saklama ve silme süreleri.
6. **İade ve iptal kuralları:** tüketici mevzuatı, cayma hakkı, depozito iade süreleri.
7. **E-imza:** geçerlilik ve delil değeri; sağlayıcı seçimi (V2).
8. **Yedekleme ve olağanüstü durum:** RPO/RTO, geri yükleme tatbikatı.
9. **Güvenlik:** sızma testi, bağımlılık taraması, oturum/CSRF gözden geçirmesi, ClamAV/anahtar yönetimi operatör prosedürü.
10. **Destek ve SLA:** müşteri desteği, olay yönetimi, kullanım koşulları, veri işleme sözleşmesi.

> Bu liste hukuki tavsiye değildir; her madde ayrı uzman değerlendirmesi ister. V2'ye ertelenen bir ekran, ilgili gerekliliğin ertelendiği anlamına gelmez.

---

## T. Sonuç ve kabul kontrolü

### T.1 Sonuç
V1 ACARVO: **21 bağlantılı, 6 gruplu, iki katmanlı** bir menü; **Görevler** ayrı, Temel ve V1; **İşlerim** kuyruğu görev/onay/uyarıyı kaynağına bağlar; tek finans modeli risk seviyeli onayla; kaparo kısmi iadesi V1; V1.5 sınıf kapasitesi ve Talepler; V2 Partner/Tedarikçi/Filo Asistanı/Fırsatlar/Kurallar. Güvenlik sunucudadır; hiçbir karar uygulanmış değildir.

### T.2 Sonraki frontend sprintinin kapsamı (öneri)
Sprint sırası: **(1)** NAV + yönlendirme + profiller (O.A) · **(2)** İşlerim + Ana Ekran sayaç tutarlılığı (O.B) · **(3)** Görevler eksikleri (O.C) · **(4)** Rezervasyon iki eylem + sınıf dili (O.D) · **(5)** Finans modeli hizası + kaparo defteri + seviye 2 örnekleri (O.E) · **(6)** Roller/Muhasebe/davet ekranları (O.F) · **(7)** Kurulum sihirbazı (O.G) · **(8)** Etiket/dil altyapısı (O.H). Bunların hiçbiri backend'i değiştirmez.

### T.3 Kabul kontrol listesi
| # | Kontrol | Durum |
|---|---|---|
| 1 | K-1…K-18 hepsi var, her biri beş alanla | ✔ (C) |
| 2 | **Görevler**: ayrı modül, Temel, V1, 18 yetenek, İşlerim'e gömülmedi | ✔ (D, H.2 satır "Görevler", I.2 satır 7) |
| 3 | **Görevler tamamlanması bağlı kaydı otomatik tamamlamaz** | ✔ (D.6, O.C4) |
| 4 | İşlerim projeksiyon; yedinci onay türü yok | ✔ (K-9, D.2, O.B4) |
| 5 | V1 / V1.5 / V2 listeleri gerekçeli | ✔ (E, F, G) |
| 6 | Demo kodu silinmez | ✔ (K-1, G, I.4) |
| 7 | Finans: ayrımlar, aşamalar, Drina, sahte dört göz yok | ✔ (M.1–M.4) |
| 8 | Kaparo 200/50/150, kısmi iade V1 | ✔ (M.5) |
| 9 | Rezervasyon iki eylem; V1.5 kapasite kapsamı | ✔ (K-3) |
| 10 | Sözleşme: dış imza iddiası yok | ✔ (K-5) |
| 11 | Menü: tam tablo, sayı, 3 örnek menü, yetki gizleme, §4 taslağı | ✔ (H, K) |
| 12 | 36 eski bağlantı eşlendi, 10 soru, yönlendirme planı | ✔ (I: 36 satır) |
| 13 | Roller, Muhasebe kapsamı | ✔ (J) |
| 14 | 7 iş akışı + kurulum akışı | ✔ (L.1–L.8) |
| 15 | Fiyat Kaydı ≠ Satış Teklifi | ✔ (K-16) |
| 16 | Masraf bağ türleri, çift sayım yok | ✔ (K-17, M.7) |
| 17 | Ortak hesaplama mimarisi | ✔ (K-18) |
| 18 | Hukuki/operasyonel açık doğrulamalar, çözülmüş sayılmadı | ✔ (S.2, S.3) |
| 19 | Frontend matrisi A–I, test edilebilir | ✔ (O) |
| 20 | Tasarım sprinti hazırlığı, V5 korunur, reddedilenler yok | ✔ (P) |
| 21 | Backend haritası | ✔ (R) |
| 22 | Kod/rota/sidebar/şartname/migration/.env/main DB değişmedi; commit/merge/push yok; 6 silinmiş dosyaya dokunulmadı | ✔ (başlık notu; `git status` ile doğrulanır) |

> **Dürüstlük notu:** Bu tablo belgenin *kapsam* kontrolüdür; kararların yazılımda doğru uygulandığının kanıtı değildir. Uygulama kabulü O bölümündeki testlerle ve sonraki sprintlerin raporlarıyla yapılır.

*Belge sonu.*
