# ACARVO Frontend V1 — Son Kabul Raporu

**Dal:** `frontend-v1-urun-uygulama` · **Başlangıç commit'i:** `cf5daca` (gerçek Git durumu bildirimle aynı çıktı; çalışma ağacı temizdi) · **Son commit:** bu raporla birlikte atılan kabul commit'i (bölüm 8)
**Kapsam:** yalnız mevcut Frontend V1'in eksiklerini kapatmak. Yeni mimari, yeni modül, premium tasarım ve backend işi yapılmadı.
Durum işaretleri: **Doğrulandı** (otomatik testle) · **Kısmen** · **Ertelendi**.

---

## 1. Önceki 10 kısmi maddenin yeni durumu

| # | Madde | Yeni durum | Kanıt |
|---|---|---|---|
| A4 | Ertelenen modüller aramada yok | **Doğrulandı** | `acceptance.spec` A4: 6 ertelenen ad (Partnerler, Kurallar, Talep Merkezi, Fırsatlar, Filo Asistanı, Araç Tedarikçileri) aramada sonuç vermiyor, menüde bağlantı yok; kontrol aramada V1 ekranı bulunuyor; ön izleme açıkken de menü 21 kalıyor |
| A6 | Eski URL → yeni ekran: sekme, görünüm, filtre, Geri | **Doğrulandı** | `acceptance.spec` A6 (8 test): roller sekmesi, `donem`/`rapor`, `q` + `gorunum`, `onem` filtresi, Dikkat sekmesi + yenileme, Kapasite kapısı, **eski adres Geri tuşunu tuzağa düşürmüyor**, kayıttan Geri aynı sekmeye dönüyor. *Bulgu:* sekme değişimi geçmiş kaydını değiştirir (eklemez); Geri, ekrana gelinen önceki ekrana döner. Bilinçli davranış, testte yazılı |
| A7 | Takvim ↔ Araç Müsaitliği ortak bileşen tutarlılığı | **Doğrulandı** (V1 kapsamı) | Aynı kiralama ve rezervasyon bağlantıları Araç 360° zaman çizelgesinde ve Takvim haftasında görünüyor. Kapasite V1.5, yeni motor yazılmadı |
| B4 | Altı resmî onay türü | **Doğrulandı** | İstek penceresi tam 6 tür sunuyor (sıralı); her tür için hedef seçilip form açılıyor (6 test); Yüksek İndirim uçtan uca: talep → başka kişi onaylar → uygular; İşlerim süzgeci tür bazında girdi eklemiyor |
| B5 | Yetkisiz kullanıcıda finans sızıntısı yok | **Doğrulandı** (+ **hata düzeltildi**) | Filo Sorumlusu: Ana Ekran'da finans yok, menüde finans bağlantısı yok, 7 adres "yetkiniz yok" ve veri yok, aramada ödeme/kaparo referansı yok, İşlerim ve zil finans metni içermiyor. **Test gerçek bir sızıntı buldu:** bildirim zili, kullanıcının açma yetkisi olmadığı kayıtlara ait bildirimleri (ör. "finans ve depozito çözümü bekliyor") gösteriyordu; düzeltildi |
| C3 | Görev ↔ 6 kayıt türü | **Doğrulandı** | `acceptance.spec` C3: araç, rezervasyon, kiralama, müşteri, bakım, hasar için ayrı ayrı: kayıttan oluştur → kayıtta listelenir → Görevler'de listelenir → bağlı kayıt bağlantısı geri götürür; tamamlama kiralama durumunu değiştirmiyor |
| C6 | Görev bildirimleri doğru kullanıcıya | **Doğrulandı** (+ **hata düzeltildi**) | Atama (yalnız atanan), devir (yalnız yeni sorumlu), tamamlama (yalnız oluşturan); oluşturan ve ilgisiz kişi almıyor; e‑posta/SMS yok (`/api` isteği yok). **Test gerçek bir hata buldu:** zil *en eski* 8 bildirimi gösteriyordu, yeni atamalar hiç görünmüyordu; artık en yeni önce, okunmamış sayısı tümünden |
| D3 | Hızlı müşteri → rezervasyon → yeniden açma | **Doğrulandı** | Yeni müşteri oluştur → form müşteriyi taşır → Bekleyen Kaydet → yenile → rezervasyon ve müşteri aynı kayıt, müşteri sayfasında rezervasyon listesi, müşteri listesinde tek kayıt |
| H3 | TR/EN eksik metin, anahtar katalogu | **Kısmen** | **Yeni** `i18n.test` kaynak taraması (1.500+ çift): boş taraf yok, İngilizce tarafta Türkçe harf yok, Türkçe metin İngilizce kopya değil (tek meşru istisna: dil adı "Türkçe"). Ekranlarda İngilizce taraması 27 rota + 16 eski ekran (ön izlemeli) + diyaloglar. **Anahtar tabanlı katalog yapılmadı** — bölüm 6'da teknik borç |
| I4 | Taşma ve erişilebilirlik | **Doğrulandı** (işlev kapsamında) | 24 rota + 16 eski ekran × 1440/1024/768/390 taşma yok; axe: ciddi/kritik ihlal yok. Görsel/premium değerlendirme 3. aşamaya bırakıldı |

## 2. Düzeltilen işlevsel eksikler

1. **Bildirim zili en eski bildirimleri gösteriyordu** (yeni görev atamaları görünmüyordu) → en yeni önce; okunmamış sayısı tüm bildirimlerden.
2. **Bildirim sızıntısı:** açma yetkisi olmayan kayda ait bildirimler artık gösterilmiyor (`canViewLink`: araç, kiralama, rezervasyon, müşteri, ödeme/finans, onay, bakım, hasar, olay, ceza, sözleşme, masraf, belge, kurumsal, partner, tedarikçi).
3. **Para girişi** gerçek form kuralına hizalandı (bölüm 3).
4. **Negatif tutar biçimi** gerçek uygulamayla aynı (gerçek eksi işareti).
5. **Demo fiyat uyarısı:** gerçek fiyat motorunda olmayan veya farklı hesaplanan kalemler fiyat tablosunun üstünde adlandırılıyor.
6. **Kaybolan test kapsamı geri getirildi** (bölüm 5): 16 eski ekranın axe, 4 genişlik, İngilizce ve izolasyon testleri.
7. **Test altyapısı:** İngilizce Türkçe-metin dedektörü ortak `fixtures.ts`'e taşındı; ön izlemeyi açan yardımcı eklendi.

(Önceki turda düzeltilenler — kayıt yarışı, oturum, sihirbaz adımı — raporda `ACARVO_FRONTEND_V1_URUN_UYGULAMA_RAPORU.md` bölüm H'dedir.)

## 3. Demo ile gerçek hesaplama farkları — son durum

| # | Fark | Önce | Şimdi |
|---|---|---|---|
| 1 | Para girişinde binlik ayracı | Demo `1.234,50` kabul ediyordu, gerçek reddediyor | **Hizalandı:** demo `parseAmount`, `@acarvo/shared` fonksiyonunu çağırıyor; form hata iletisi kuralı söylüyor ("binlik ayracı yok, örn. 1250,50"). Golden test: her ikisi de reddediyor |
| 2 | Negatif sayı | Demo `-`, gerçek `−` | **Hizalandı:** demo `fmt` gerçek eksi işaretiyle yazıyor; 7 vektörde (EUR, BAM, USD, KWD, JPY, negatif/sıfır) `formatMoney` ile birebir |
| 3 | Süre kademeleri | Demo yüzde indirim, gerçek gün kademe fiyatı | **Bilinçli olarak korundu** (veri modeli farklı; hizalamak fiyat listesi şemasını değiştirirdi). Kullanıcıya **"Demo hesabı" uyarısı**: "süre kademesi (demoda yüzde indirim; gerçek motor gün kademe fiyatı kullanır) … bu tutar gerçek sistemde aynı çıkmaz". Golden test: 10 günlük kiralama uyarıyı üretiyor, 2 günlük düz kiralama üretmiyor |
| 4 | Sigorta, tek yön, genç sürücü, kurumsal anlaşma | Demo hesaplıyor, gerçek motor "uygulanmadı" listeliyor | **Bilinçli olarak korundu**, aynı uyarıyla adlandırılıyor (`PriceBreakdown`: Rezervasyon/Kiralama 360°, yeni rezervasyon özeti, Fiyatlandırma simülasyonu, teklif); gerçek özellik gibi sunulmuyor |

Ortak alt küme (günlük fiyat, vergi dahil/hariç, günlük ekstra, ek sürücü, gün sayımı, yuvarlama, minor birim) gerçek motorla aynı sonucu veriyor — `golden.test.ts` **40 test**. Gerçek fiyat motoru, `@acarvo/shared` ve API **değişmedi**.

## 4. Görevler, finans ve rezervasyon korumaları

- **Görevler** ayrı menüde, V1, Sade profilde görünür, İşlerim'e gömülü değil (nav testleri geçti). Oluşturma, atama, üstlenme, tamamlama, geçmiş, 6 kayıt türüne bağlantı, bildirimler çalışıyor.
- **İki sekme yarışı:** iki tarayıcı sekmesinde aynı havuz görevi: birincisi üstlenince ikinci sekme kaydedilmiş durumu benimser, görev havuzdan düşer, çekmece kapanır ve **ikinci kişi artık üstlenemez** (test). *Sınır:* bu, tarayıcıda kayıt sonrası penceredeki tutarlılıktır (kayıt ile tıklama arasındaki ≈40 ms kapsanmaz); tıklamaların aynı anda olduğu durumu karar veren **gerçek sunucu işlemidir** (HTTP 409), demo bunu iddia etmez. Birim testi sürüm çakışmasını (`CONFLICT`) doğruluyor.
- **Finans korumaları değişmedi:** Kaydedildi → Doğrulandı → Uygulandı ve bağımsız doğrulama; kaparo ≠ depozito; kısmi iade ve çift iade koruması (200/50/150 e2e); bekleyen rezervasyon araç tutmaz, kesin onay belirli araç ister; iptal politika bedeli ile gerçek iade ayrı işlem. Tüm bu testler yeşil.

## 5. Eklenen testler ve kapsam eşlemesi

**Yeni:** `acceptance.spec.ts` (45), `former-screens.spec.ts` (64), `i18n.test.ts` (4), `golden.test.ts` (+3 fiyat uyarısı, 2 hizalama), `finance.test.ts` (ayrıştırma kuralı uyarlandı).

**301/302 → 356 kapsam eşlemesi (doğrulandı):** Eski küme: axe 190, İngilizce 40, izolasyon 41, diğer 31 = 302. Menü 21 ekrana inince 13 eski ekran bu üç döngüden çıktı (net −65 axe/yerleşim, −13 İngilizce, −13 izolasyon). Çıkan 16 eski ekranın her biri için eski 7 kontrol artık **`former-screens.spec`**'te, **aynı eski adreslerle**:

| Eski ekran grubu | Yeni karşılığı |
|---|---|
| Taşınan ekranlar (Komuta, Olay, Hasar, Ceza, Gelir Kontrolü, Riskler, Kapasite, Filo Analizi, Sözleşmeler, Roller) — 10 | Eski adres → yönlendirme (nav.spec 36 test) + yeni yerde axe/4 genişlik/İngilizce/izolasyon (ön izleme açık, V1.5 içerik dahil) + ön izleme kapalıyken yeni ekran/"etkin değil" sayfası |
| Ertelenen modüller (Filo Asistanı, Talep Merkezi, Partnerler, Tedarikçiler, Kurallar, Fırsatlar) — 6 | Ön izleme açık: gerçek ekran için axe, 4 genişlik, İngilizce; kapalı: "etkin değil" sayfası için axe/taşma; hepsinde `/api` isteği ve çalışma hatası yok |

Eski 301/302 testin hiçbiri silinmedi veya devre dışı bırakılmadı; yalnız davranış değişikliği olanlar uyarlandı (önceki raporda listeli). **Sekiz demo senaryosunun tamamı** (`scenarios.spec`: 1–8) yeşil.

## 6. Bilinçle ertelenen konular (teknik borç)

- **Anahtar tabanlı TR/EN katalog (H3):** ~1.600 çift metin kodun içinde `L('tr','en')`. Güvenli ve sınırlı bir geçiş (ortak bir `t('anahtar')` + katalog dosyası, "eksik anahtar derlemeyi bozar") **tasarım sprinti öncesinde veya sırasında** yapılmalı; şimdi yapılsaydı her ekranı değiştirirdi ve görsel işle çakışırdı. Mevcut güvence: kaynak taraması + ekran taraması. **Kayıtlı borç.**
- **Kapasite görünümü** V1.5 (ön izleme kapısında), yeni motor yazılmadı.
- **Süre kademesi / sigorta / tek yön / genç sürücü / kurumsal anlaşma** gerçek motorla hizalanmadı (gerçek backend bu bileşenleri uygulayınca demo hesabı kaldırılır; uyarı `demoOnlyPriceParts` listesinden yönetilir).
- Teslim Masası'nda doğrulanmamış depozito için engellemeyen uyarının ayrı testi, ekran görüntüsü incelemesi (3. aşama), sekmeler arası ≈40 ms pencere.

## 7. Tam test sonuçları

| Küme | Sonuç |
|---|---|
| Demo birim (vitest) | **178** geçti (12 dosya) |
| Demo tarayıcı, **1. tam koşu** | **356 / 356 geçti** (14,3 dk) |
| Demo tarayıcı, **2. bağımsız tam koşu** | **356 / 356 geçti (14,6 dk)** |
| TypeScript (api, shared, web, e2e) | temiz |
| Gerçek API (`acarvo_test`) — 534 | **Bu turda yeniden koşulmadı.** Backend, `packages/` ve `.env` `cf5daca`'dan beri **değişmedi** (`git diff` boş); son koşu (önceki rapor): 534 geçti. Gerçek tarayıcı: 134 geçti / 36 atlandı, aynı şekilde yeniden koşulmadı |

(Hız için gerçek uygulama testleri tekrar koşulmadı; hiçbir gerçek uygulama dosyası değişmediği için sonuç değişmez, ama bu bir yeniden doğrulama değil, değişmezlik gerekçesidir.)

## 8. Git ve veritabanı güvenlik kontrolleri

- Ana veritabanı `acarvo`'ya dokunulmadı; gerçek testler bu turda koşulmadı, önceki koşular yalnız `acarvo_test`.
- `git diff cf5daca -- apps/api packages .env*` **boş**; migration yok; backend, RLS/RBAC, şifreleme, gerçek API davranışı değişmedi.
- Ana çalışma klasöründeki altı silinmiş dosya geri yüklenmedi; `main`, `acarvo-demo-ui` çalışma ağacı ve `frontend-prototip-v1` dalına dokunulmadı; V1.5/V2 demo kodları silinmedi.
- **Birleştirme yok, push yok.** Üretilen `dist-demo-*`, `test-results-*` klasörleri sürüme girmiyor (`.gitignore`).
- Çalışma ağacı: bu rapor ve kabul değişiklikleriyle tek commit; sonrasında temiz.

## 9. Premium tasarım sprintine geçiş değerlendirmesi

**Geçiş için hazır.** Gerekçe: 21 menü, görevler, finans aşamaları, kaparo, kurulum ve rol yapısı işlevsel olarak sabit; 356 tarayıcı + 178 birim testi bir tasarım değişikliğinin işlevi bozup bozmadığını yakalar; 24+16 ekranda taşma ve erişilebilirlik kapısı temiz.
Tasarım sprintine taşınanlar: (1) anahtar tabanlı katalog (tasarım metin değişimlerinden önce), (2) ekran görüntüsü incelemesi ve görsel regresyon taban çizgisi, (3) `demo-price-note` ve olgunluk rozetinin görsel dili, (4) ön izleme ekranlarının "Demo konsepti" bandı.
Dikkat: testler Türkçe ve görünür metne (`getByRole(name)`) dayanıyor; tasarım sprinti etiket metinlerini değiştirirse test seçicileri birlikte güncellenmeli.
