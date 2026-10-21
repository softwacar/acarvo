# ACARVO Frontend V1 — Ürün Yapısı ve İşlevsellik Uygulama Raporu

**Dal:** `frontend-v1-urun-uygulama` (çalışma klasörü `acarvo-frontend-v1`, `frontend-prototip-v1` dalının 9d7fa45 noktasından açıldı)
**Kapsam:** Sadece tarayıcı demosu (`apps/web/src/demo`), demo e2e testleri ve `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` §4. Gerçek API, veritabanı, migration, RLS/RBAC, şifreleme ve `.env` **değiştirilmedi**.
**Otorite belge:** `docs/ACARVO_V1_URUN_MIMARISI_VE_KARARLAR.md` (K‑1…K‑18, H, I, J, K, L, M, N, **O**).
**Bu sprintte yapılmayanlar (bilerek):** görsel yeniden tasarım (Prompt 3), gerçek backend (Prompt 4), main'e birleştirme, GitHub push.

> Bu rapor *işlevi* anlatır. Ekran görüntüsü kalitesi ve premium tasarım sonraki aşamadır; burada yalnız yatay taşma ve erişilebilirlik kapıları ölçüldü.

---

## A. Başlangıç durumu

| Konu | Başlangıç (9d7fa45) |
|---|---|
| Menü | 36 bağlantı, 7 kategori; Komuta Merkezi, Gelir Kontrolü, Riskler, Kapasite, Filo Analizi, Sözleşmeler vb. ayrı bağlantı |
| Görevler | Komuta Merkezi içinde bir sekme + ayrı sayfa; havuz, çakışma modeli, geçmiş yok |
| Finans | Ödeme kaydı doğrudan bakiyeyi düşürüyordu (tek aşama); sahte "dört göz" riski |
| Kaparo | İptalde tamamının kaybı (`forfeitAdvance`); kısmi iade ve politika yok |
| Roller | 4 hazır rol, ama Operasyon/Muhasebe kapsamı geniş; davet/şifre sıfırlama, ön ayar sürümü yok |
| Kurulum | Yok |
| Testler | Demo birim 68, demo tarayıcı 301 (302), gerçek API 534, gerçek tarayıcı 134 geçti / 36 atlandı |

`main` 44354d0, ana veritabanı 47. Çalışma ağacında main klasöründe silinmiş altı izlenen dosya (ACARVO_GLOBAL_WEB_UI_V1_SPEC.md, docs/BAKIM_…, FINANS_…, MUSTERILER_…, OPERASYONEL_…, TEKNIK_UYGULAMA.md) **geri yüklenmedi, dokunulmadı**; yeni dalda bu dosyaların kopyaları vardır ve spec yalnız §4'te güncellendi.

Dal, daha önce onaylı `frontend-prototip-v1` işini (demo, çift dil, kaparo ve 8 senaryo) içerir. Bu yüzden `main` ile karşılaştırmada `apps/api/tests/finance-performance.test.ts` içindeki tek satırlık kararlılık düzeltmesi (`analyze rentals, …`) görünür; **bu sprintte yapılmadı**, önceki prototip dalından gelir.

---

## B. Yeni ürün yapısı

### B.1 Menü: 21 bağlantı / 6 kategori
Genel (Ana Ekran, İşlerim) · Operasyon (Rezervasyonlar, Kiralamalar, Takvim, Görevler, Araçlar, Bakım & Servis, Hasar ve Olaylar) · Müşteri & Ticari (Müşteriler, Kurumsal Hesaplar, Fiyatlandırma) · Finans (Finans, Masraflar, Şube Kasaları) · Kontrol ve Raporlar (Raporlar, Onay Merkezi) · Yönetim (Şubeler, Kullanıcılar ve Roller, İşlem Geçmişi, Ayarlar).
Kaynak: `core/modules.ts` (`NAV_V1`, `GROUPS`), `nav.ts`, `router.tsx`, `ui/shell.tsx`.

### B.2 Profiller (Temel / Gelişmiş)
| Profil | Bağlantı | Gizlenenler |
|---|---|---|
| Sade | 16 | Kurumsal Hesaplar, Şube Kasaları, Onay Merkezi, Şubeler, İşlem Geçmişi |
| Standart | 20 | İşlem Geçmişi |
| Gelişmiş | 21 | — |

Tek şubeli şirkette Şubeler profilden bağımsız gizlenir. Profil **yalnız görünürlüktür**: yetki vermez, almaz. `ALWAYS_VISIBLE` (Ana Ekran, İşlerim, Rezervasyonlar, Kiralamalar, Takvim, Görevler, Araçlar, Müşteriler, Finans, Ayarlar) hiçbir profilde gizlenemez.
**Sade modda iş kilitlenmez:** kasa işlemi Finans'tan, onay kararı İşlerim'den, işlem geçmişi kaynak kaydın zaman çizelgesinden ve kullanıcı menüsündeki "Menüde gizli ekranlar (çalışma profili)" listesinden yapılır; adres çubuğundan da açılır (testli).

### B.3 36 → yeni yer
Eski 36 adresin tamamı çalışır (19 aynı, 10 yönlendirme, 6 ertelenmiş modül, 1 kayıt ekranı). Yönlendirmeler arama parametresini korur:

| Eski | Yeni |
|---|---|
| Komuta Merkezi | İşlerim |
| Hasar Kayıtları / Olay Merkezi / Ceza Modülü | Hasar ve Olaylar (sekme: olaylar, cezalar) |
| Gelir Kontrolü | Finans → Dikkat |
| Riskler ve İstisnalar | İşlerim → Uyarılar |
| Kapasite Planlama | Takvim → Kapasite görünümü (V1.5, ön izleme kapısı) |
| Filo Analizi | Raporlar → Filo |
| Sözleşmeler | Kiralamalar → Sözleşmeler görünümü |
| Roller ve Yetkiler | Kullanıcılar ve Roller → Roller |
| Belge Merkezi | kayıt ekranı (`/belge-merkezi`), menüde yok |
| Filo Asistanı, Talep Merkezi, Partnerler, Araç Tedarikçileri, Kurallar, Fırsatlar | ertelendi (V1.5 / V2): menüde ve aramada yok, kod korunur |

### B.4 Ertelenen modüller ve "Gelişmiş Konsept Ön İzlemesi"
Doğrudan adres → "Bu modül bu sürümde etkin değil" + hedef sürüm. Demo menüsündeki *Gelişmiş konsept ön izlemesi* (yalnız `preview:use` yetkisi: Sahip, Yönetici) ekranları "Demo konsepti" bandıyla açar; yeni menü bağlantısı eklemez. V1.5 görünümleri V1 ekranlarının içinde de aynı kapıdan geçer (Kapasite, Olaylar, Cezalar, İstisnalar, Vardiya devri).

### B.5 Olgunluk etiketleri
Sayfa düzeyinde tek rozet (üst çubuk): *Gerçek sistemde mevcut / Kısmen gerçek / Demo konsepti · V1 hedefi* (`MATURITY` tablosu). V1 / V1.5 / V2 etiketi kapsam bandında. Her butonda etiket yok.

### B.6 Spec güncellemesi
`ACARVO_GLOBAL_WEB_UI_V1_SPEC.md` **yalnız bu dalda ve yalnız §4**: 21 menü, profiller, Görevler bağımsız, İşlerim ≠ Görevler, altı resmî onay türü (şartname §21), 36 → yeni yer tablosu, olgunluk etiketleri; belgenin ilerisindeki "36 bağlantı" ifadeleri için tarihsel-liste notu.

---

## C. Görevler

Ayrı rota (`/gorevler`), `core/ops/tasks.ts`, `pages/work/TasksPage.tsx`, `ui/linkedTasks.tsx`.

- **Havuz:** şube + rol filtreli; başka şubenin havuz görevi şube kullanıcısına görünmez (e2e), yönetici görür.
- **Sahiplenme / çakışma:** `claimTask(d, id, expectedVersion)`; ikinci kişi `CONFLICT` (gerçek API'de 409 ile uyumlu mesaj), yetkisiz `FORBIDDEN`; sahipsiz havuz görevi önce üstlenilmeden tamamlanamaz. İki sekme arasında kaydedilmiş durum `BroadcastChannel` ile benimsenir (e2e: bir sekmede üstlenilen görev diğerinin havuzundan düşer). *Sınır:* tıklama ile kayıt arasındaki ~40 ms pencere kapsanmaz; gerçek karar sunucu işlemidir.
- **Bağlı kayıttan oluşturma:** araç, kiralama, rezervasyon, müşteri, bakım, hasar 360 sayfalarında "Görev ekle"; bağlı kayıt rozetini ve sayısını gösterir (`useLinkedTasks`).
- **Tamamlama bağlı kaydı değiştirmez** (unit + metin uyarısı).
- **Geçmiş:** oluşturma, atama, devir ("A → B"), erteleme, iptal, yeniden açma gerekçesi.
- **Bildirimler (uygulama içi):** yeni atama, havuza düşme, devir, tamamlama, yeniden açma, geciken görev (e‑posta/SMS yok).
- **Toplu işlem:** seç + ata / tamamla; atlananlar nedeniyle raporlanır (`{done, skipped}`).
- **Sade profilde görünür** (her profilde).

## D. Operasyon

- **İşlerim:** projeksiyon (`core/inbox.ts`); *Bana Düşenler* + *Uyarılar* (V1.5 sekmeleri ön izleme kapısında). Her satır kendi kaynağına gider. **Ana Ekran "Bana düşen işler" sayısı = İşlerim sayısı** (Sahip ve Operasyon için e2e). Yetkisiz kullanıcıya sayı sızmaz (aynı fonksiyon, yetki ve şube kapsamına göre).
- **Ana Ekran:** sade; kurulum tamamlanmadıysa "Kurulumu sürdür" bildirimi; finans bölümü `finance.reports` yetkisine bağlı.
- **Rezervasyon:** iki eylem: **Bekleyen Kaydet** (araç/kapasite tutmaz) ve **Kontrol Et ve Onayla** (yetki, belirli araç, çakışma, kredi denetlenir; hepsi geçmezse hiçbiri yazılmaz). Sınıf bazlı kayıtta "Bu kayıt henüz belirli bir aracı ayırmaz" iletisi. Hızlı müşteri ekleme, sağ özet paneli.
- **Kiralamalar / Sözleşmeler:** Sözleşmeler artık Kiralamalar altında bir görünüm; şablonlar Ayarlar'da; imza için hukuki geçerlilik iddiası yok (yalnız dahili imza yakalama).
- **Teslim Masası:** 7 adım; pasif düğme nedenini yazar (e2e). *Eksik:* doğrulanmamış depozito için engellemeyen uyarı yazısı ayrıca test edilmedi (bkz. K).
- **Hasar ve Olaylar:** tek sayfa; hasar bloğu kaldırma iki aşamalı (talep eden + farklı onaylayan, iki `damages:unblock` yetkilisi).
- **Bakım ve ceza maliyeti** kaynak kayıttan Masraflar'a yansır (kaynak kilitli).

## E. Finans

- **Ödeme aşamaları:** Kaydedildi → Doğrulandı → Uygulandı. Bakiye yalnız uygulanınca düşer. Kaydeden kendi kaydını doğrulayamaz ("Başka yetkili doğrular"). **Mutabakat** ve **denetim geçmişi** aşama çizgisinin adımı değil, ayrı izlerdir.
- **Risk seviyeleri 0–3** (`core/risk.ts`): Seviye 2 işlemler (finansal düzeltme, kurumsal kredi aşımı, yüksek tutarlı iade, hasar bloğu) bağımsız yetkili ister; sahte dört göz yok. Bağımsızlık raporu (Kullanıcılar ekranında "Bağımsız onay yetkilisi: en az 2").
- **Kaparo:** 200 EUR kaparo → iptalde politika bedeli 50 EUR (kural metniyle), 150 EUR iade edilebilir; kısmi iade (ör. 100) sonrası 50 kalır; aynı kaparo iki kez iade edilemez (tutar defterle sınırlı); depozito ≠ kaparo; politika bedeli tahsilat değil, iade gider değil. "Müşteri alacağı" satırı bedel kaparoyu aşarsa. `forfeitAdvance` kaldırıldı, yerine `settleAdvance` + politika (`calc/policy.ts`).
- **Dikkat sekmesi:** eski Gelir Kontrolü; teknik değişmezler Ayarlar → Operasyonel hazırlık'a taşındı; **uydurma kayıp tutarı yok**.
- **Masraflar:** 4 bağ türü (şube, araç, genel, kaynak [bakım/ceza, elle eklenmez]); araç maliyeti `calc/cost.ts`'te ayna masraflar çift sayılmadan; kaynak satır düzenlenemez.
- **Şube Kasaları + gün sonu:** para birimi açık, para birimleri toplanmaz; fark eşiği aşılırsa gerekçe zorunlu, fark eşiğin 5 katını aşarsa (kritik) kasayı yalnız onay yetkisi olan kişi (Sahip/Yönetici) kapatabilir; ödeme ve kalem ters kaydı onaysız yapılamaz; Raporlar'da Gün sonu.
- **Raporlar:** Kiralama, Filo, Finans, Gün sonu; Filo Analizi buraya taşındı.

## F. Yönetim

- **Kullanıcılar ve Roller:** 4 rol (Sahip, Yönetici, Operasyon, Muhasebe). Muhasebe kapsamı daraltıldı (araç/fiyat/ceza/partner/tedarikçi yok; settings:view, verify, reconcile var). **Davet / şifre sıfırlama yalnız demo kaydıdır** (e‑posta gitmez, hesap açılmaz). **Rol ön ayarı sürüm yükseltme:** özelleştirilmiş rol otomatik ezilmez (`PRESET_UPGRADES`, `meta.presetVersion`).
- **Ayarlar:** çalışma profili ve menü, politikalar, bildirim eşikleri (eşik değişince uyarı sayısı değişir), sözleşme şablonları, iptal ve kaparo politikası, **Operasyonel hazırlık** (şifreleme anahtarı, zararlı yazılım tarayıcısı, hukuki inceleme: "Sistem yöneticisi işlemi", asla "tamam" gösterilmez).
- **Kurulum sihirbazı (9 adım):** şirket, şubeler, çalışma profili, ilk araç, kullanıcılar/roller, temel fiyat, sözleşme, ödeme ve iptal politikası, hazırlık kontrolü. Geri/ileri, adım ve girdiler yenilemede korunur (adım anında, girdiler sayfadan çıkarken kaydedilir), alan denetimi, durumlar Gerekli/Eksik/Sistem yöneticisi işlemi/Demo ön izlemesi. **Gerçek tenant, davet veya veritabanı değişikliği yaratmaz.** Eksik madde için "Adıma dön".

## G. Ortak altyapı

- **Modül kaydı** (`core/modules.ts`): menü, eski adresler, ertelenenler, kapılı görünümler, olgunluk.
- **Saklama** (`core/store.ts`): tek `Db`, IndexedDB; `meta.rev` + BroadcastChannel ile sekmeler arası benimseme (oturum yerel). Bu sprintte iki sağlamlaştırma: (1) *oturum* (kullanıcı, şube, dil) senkron olarak ayrı anahtara yazılır, böylece rol değiştirip hemen yenilenen sayfa seçilen kişiyle açılır; (2) IndexedDB bağlantısı açık tutulur ve sayfadan çıkarken senkron yedek kopya (localStorage, daha yeni olan kazanır) yazılır; böylece "kaydet + hemen yenile" veri kaybettirmez. Şema 5.
- **i18n:** mevcut `B()`/`L()`/`loc()` çalışma zamanı katmanı korundu; yeni ekranlar TR+EN. *Anahtar tabanlı katalog (H3) kurulmadı* (bkz. K). Yakalanan hatalar: kapsam içi iptal kuralı metninin ham işaretlerle sızması, sihirbaz doğrulama iletilerinin sızması (ikisi de düzeltildi ve testli).
- **Altın vektör (K‑18)** — `__tests__/golden.test.ts` (37 test), demo ile `@acarvo/shared` aynı girdiyle:

| Alan | Sonuç |
|---|---|
| Para ayrıştırma, hane, minor birim | Aynı (EUR, USD, BAM, GBP, CHF, TRY, RSD, JPY, KWD) |
| Yuvarlama (yarım sıfırdan uzak) | Aynı |
| Gün sayımı (takvim günü ↔ `calendar_day`, 24 saat ↔ `rolling_24h`, ± yaz saati, tolerans) | Aynı (8 vektör × 2 yöntem) |
| Fiyat (tek günlük fiyat, vergi dahil/hariç, günlük ekstra, ek sürücü) | Aynı net, vergi, brüt |
| **Fark 1:** bin ayracı | Demo `1.234,50`'yi kabul eder; shared katı (`null`) — gerçek form düz ondalık göndermeli |
| **Fark 2:** negatif işaret | Demo `-`, shared `−` (gerçek eksi) |
| **Fark 3:** uzunluk kademesi | Demo yüzde indirim, gerçek motor gün kademe fiyatı (7–29 / 30+) |
| **Fark 4:** sigorta, tek yön, genç sürücü, kurumsal anlaşma | Demo hesaplar; gerçek motor "uygulanmadı" listeler |

Eşitlik kanıtlanmayan yerde demo kodu **birleştirilmedi**; backend hesaplaması değiştirilmedi.

---

## H. Testler

| Küme | Başlangıç | Şimdi |
|---|---|---|
| Demo birim (vitest) | 68 | **{{UNIT}}** (11 dosya: nav 15, tasks 20, advance 14, stages 11, admin 14, golden 37, domain 16, finance 11, rules 8, scenarios 21, persistence 2) |
| Demo tarayıcı (Playwright, tarayıcıda yerel) | 301 / 302 | **{{E2E}}** |
| Gerçek API (`acarvo_test`) | 534 | **{{API}}** |
| Gerçek tarayıcı (`acarvo_test`) | 134 geçti / 36 atlandı | **{{REAL}}** |
| TypeScript (api, shared, web, e2e) | temiz | temiz |
| Üretim derlemesi (web) | temiz | temiz |

**Tarayıcı test sayısı neden değişti:** eski set her menü ekranını (38 rota × [axe + 4 genişlik]) ve 38 İngilizce ekranı ayrı ayrı koşuyordu. Menü 21 ekrana indi; eski 36 adres artık `nav.spec.ts` içinde yönlendirme testleridir (36 test + kayıt sorgusunun korunması). Hiçbir test sessizce silinmedi: değişen davranışa göre uyarlandı (aşağıda).

**Eski testlerde uyarlanan davranışlar:** "Rezervasyonu kaydet" → "Bekleyen Kaydet"; ödeme kaydı artık bakiyeyi düşürmez (iki kişili doğrulama sonrası düşer; senaryo 5 dört ödemeyi ikinci kullanıcıyla doğrular, bakiye 500 → … → 0); Komuta Merkezi / Riskler → İşlerim; Talep Merkezi senaryosu (7) ön izleme kapısıyla; Filo analizi → Raporlar; kaparo bağlantısı "Finans · Kaparo".

**Yeni tarayıcı testleri:** `nav.spec` (21 menü, 36 yönlendirme, ertelenen, ön izleme, profil), `tasks.spec` (havuz, çakışma/iki sekme, bağlı görev, toplu, şube kapsamı, rol), `product.spec` (Sade 16, İşlerim sayaç eşitliği, iki rezervasyon eylemi, davet, kurulum sihirbazı + EN doğrulama, kaparo, Dikkat, gün sonu, Masraflar), `advance.spec` (kısmi iade 200/50/150, ikinci iade reddi), `a11y-responsive.spec` (24 rota × axe + 1440/1024/768/390 yatay taşma), `isolation.spec` (demoda `/api` isteği yok).

**Gerçek uygulama gerilemesi:** backend dosyası değişmedi (bkz. J); TypeScript, derleme, API testleri ve gerçek tarayıcı testleri yalnız `acarvo_test` ile koşuldu.

## I. 47 maddelik kabul matrisi

Durum: **✔** tamam (testli) · **◐** kısmen · **○** yapılmadı. "Frontend demo tamam, gerçek backend bekliyor" ibaresi simüle edilen kurallar içindir.

{{MATRIX}}

## J. Güvenlik kontrolleri

- **Ana veritabanı `acarvo`** hiç açılmadı; gerçek testler `ACARVO_ENV_FILE` ile yalnız `acarvo_test`'e bağlandı; `.env` içeriği yazdırılmadı.
- **Backend, migration, RLS/RBAC, şifreleme, gerçek API davranışı değişmedi:** `git diff main..HEAD -- apps/api packages` yalnız önceki prototip dalından gelen bir test satırını gösterir (bkz. A).
- **Demo gerçek veriye dokunmaz:** `isolation.spec` ve her yeni testte `/api` isteği izlenir (boş olmalı); demo tarafı gerçek API'yi iki katmanda reddeder.
- **Sahte güvence yok:** kendi kaydını doğrulama yok; Seviye 2'de başlatan yetkili olmadan bağımsız onay; davet/şifre sıfırlama/e‑posta *gönderilmez*; ClamAV, anahtar yönetimi ve hukuki inceleme hiçbir yerde "tamam" gösterilmez; sözleşmede doğrulanmamış e‑imza iddiası yok.
- **Gizlilik:** müşteri iletişim bilgisi rol bazlı maskeleme (Operasyon, Muhasebe), yetkisiz adreste veri sızmaz ("Bu ekran için yetkiniz yok").
- **Git:** main'e dokunulmadı, `acarvo-demo-ui` çalışma ağacına ve `frontend-prototip-v1` dalına dokunulmadı, push yok, otomatik birleştirme yok. Üretilen derleme klasörleri (`dist-demo-*`, `test-results-*`, `playwright-report-*`) sürümden çıkarıldı ve `.gitignore`'a eklendi.

**Bilinçli sapmalar (güvenli davranış korundu):**
1. Karar belgesi M.2 "Seviye 0: rutin tahsilat kaydı (kaydeden Muhasebe ise) onaysız" gerçek FN1 ile çelişir → **tüm ödemelerde bağımsız doğrulama** korundu.
2. Karar belgesi `aile`/`gorunum=dikkat` URL anahtarları yerine her ekranın mevcut anahtarları (`sekme`, `gorunum`, `rapor`) kullanıldı.
3. Operasyon ön ayarı: `corporate:view`, `command:view` kaldırıldı; `tasks:manage` → `tasks:create`. Muhasebe ön ayarı daraltıldı.
4. Sınıf bazlı onay yalnız ön izleme altında; V1'de onay belirli araç ister.
5. Seviye 2 tanımı: finansal düzeltme ve kurumsal kredi aşımında başlatan yetkili olmak zorunda değil, karar veren yetkili ve bağımsız olmalı; eşik üstü iade yalnız yetkili karar verenle; hasar bloğu kaldırma iki farklı `damages:unblock` yetkilisi.
6. M.3(c) (kendi kaydını güvenli kısıtla doğrulama) **V1.5 adayı**; gerçek kendini doğrulama yok.

## K. Bilinen eksikler

**1. Gerçek backend bekleyenler (frontend demo tamam, gerçek backend bekliyor)** — görev havuzu ve 409 çakışması, bildirimler, ödeme aşamaları ve mutabakat, kaparo/politika/kısmi iade, Masraflar (4 bağ türü), gün sonu ve kritik fark, davet/şifre sıfırlama/rol ön ayar yükseltme, kurulum sihirbazı (gerçek tenant), işlerim projeksiyonu, kullanıcı/oturum modeli, ön izleme anahtarı. Hepsi tarayıcıda simüle edilir; sunucu işlemi/transaction/RLS yoktur.

**2. Operatör / hukuk bağımlılıkları** — ClamAV tarayıcısı, şifreleme anahtarı yönetimi, ülke başına sözleşme hukuki incelemesi, vergi oranları (demo değeri), e‑posta/SMS altyapısı. Ekranda "Sistem yöneticisi işlemi" olarak durur.

**3. Bu sprintte yapılmayanlar** — görsel tasarım (Prompt 3); **TR+EN anahtar tabanlı katalog (H3)**: çalışma zamanı `L()` korundu, eksik çeviri derlemeyi bozmaz, yalnız İngilizce taramada Türkçe metin yakalanır; **A7** ortak zaman çizelgesi bileşeni: Takvim ile Araç Müsaitliği aynı ilkel bileşenleri paylaşır (`DayAxis`, `HoldBars`), Kapasite görünümü V1.5 ve ayrı kalır; Teslim Masası'nda doğrulanmamış depozito için engellemeyen uyarının ayrı testi; B5 yetkisiz finans sayacı için ayrı e2e testi (kod ve rol testleri var).

**4. Teknik borç / sınırlar** — sekmeler arası tutarlılık yalnız kayıt sonrası pencerede (≈40 ms boşluk); demo `parseAmount` bin ayracı farkı; indirim kademesi ile gerçek motor farkı (altın vektör testinde adlandırıldı); `HoldBars` Kapasite'de kullanılmıyor.

**5. İnsan kararı bekleyenler** — Muhasebe için kendi kaydını güvenle doğrulama (M.3(c), V1.5); Seviye 0'da rutin tahsilatın onaysız geçmesi (FN1 ile çelişki); Standart profilin 20 mi 19 mu bağlantı olacağı (şimdi yalnız İşlem Geçmişi gizli); hangi V1.5 görünümünün V1'e çekileceği; gerçek backend'e geçişte ödeme aşaması adlarının (Kaydedildi/Doğrulandı/Uygulandı) API alanlarıyla eşlenmesi.

## L. Git durumu

- Dal `frontend-v1-urun-uygulama`; `main` 44354d0'dan ayrılmadı (ileri alınmış, `main` değişmedi).
- Bu sprintin commitleri: c36d4ee (referans belgeler), 0db4b0d (menü, profiller, görevler, risk modeli), 0e52409 (İşlerim, görevler, rezervasyon, ödeme aşamaları, kaparo), 0141bea (masraf, kasa, hazırlık, kullanıcı/rol, sihirbaz, olgunluk, altın vektör), spec §4, derleme/rapor temizliği ve testlerin uyarlanması.
- **Birleştirme yok. Push yok.** Sonraki adım için onay gerekir.
- Çalışma ağacı temiz olmalıdır; `git status` bu rapor yazıldığında yalnız bu belgeyi ve son test uyarlamalarını gösterir.
