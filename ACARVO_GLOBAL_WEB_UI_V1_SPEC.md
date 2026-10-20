# ACARVO GLOBAL — WEB YÖNETİM PANELİ UI/UX KONSEPTİ (V1)

**Tek güncel hedef:** Global rent-a-car SaaS **WEB yönetim paneli konsepti**. **Backend yok, native mobil uygulama yok, gerçek tahsilat/POS/banka/fiskalizasyon entegrasyonu yok.**

**Kaynak ve koruma:** Önceki ACARVO kanonik spesifikasyonundaki kapsamlı web ürün envanteri korunarak global para birimleri, admin işletme kurları, mixed-currency/çok kişili tahsilat ve Claude'un ilgili iş/UX eksikleri eklendi. Eski teknik rebuild ve native mobile geliştirme planı bu hedefe dahil edilmedi. Bu belge tek konsept otoritesidir.

**Konsept neyi çalıştıracak?** Web menüleri, create/edit, rental lifecycle, pricing, VAT, manual FX, payment splitting, deposits/advances, insurance, availability, cash drawers, approved financial adjustments, reporting ve role-based scenario'lar **tek UI demo state içinde etkileşimli** işleyecek. Gerçek banka/kredi kartından para çekme veya birine e-posta gönderme olmayacak.

**AI Studio'ya verilme biçimi:** Belge baştan sona okunacak; Part I eski web capability'leri + Part I §61–81 global kararları + §82 tüm 36 workspace kullanım sözleşmesi + §83 sözleşme/hasar/ek sürücü/yetki/görev detayları + **§84 sigorta/depozito seçimi ve A4 servis/sigorta evrakları** + **§85 iş akışı optimizasyonu, sigorta fiyat/uzatma, şablon editörü ve beş kritik workspace** + Part II build talimatı + Part III acceptance birlikte uygulanacak. İhtiyaç olmayan yeni domain veya entegrasyon eklenmeyecek. Fonksiyonel konsept hazır olmadan ``production-ready`` denmeyecek.

---

# PART I — ACARVO GELİŞMİŞ WEB ÜRÜN ENVANTERİ
## Kullanıcı ekranları, operasyon akışları, iş kuralları

**Sürüm:** 1.0  
**Amaç:** Backend ve native mobil uygulama geliştirmeden global web yönetim panelinin kullanıcı deneyimi, domain kuralları ve etkileşimli demo gereksinimlerini sabitlemek.

> Bu belge iki kaynağı birleştirir:
> 1. Mevcut ACARVO kapsam dokümanında anlatılan ekranlar ve kullanıcı yetenekleri.
> 2. Web konsept hedefi için açıkça genişletilen ürün/UX gereksinimleri.
>
> Buradaki hedef sürüm, eski UI'yı körlemesine kopyalamaz; **mevcut iyi özellikleri kaybetmeden, eksik/zayıf kullanıcı akışlarını tamamlayan final ürün tarifidir.**

---

# 1. Ürün vizyonu

ACARVO, rent-a-car şirketinin günlük operasyonunu tek merkezden yöneten, operasyon odaklı bir SaaS'tır.

ACARVO'nun amacı yalnızca “rezervasyon kaydetmek” değildir. Sistem, ekip için şu soruların cevabını tek yerde vermelidir:

- Bugün ne teslim edilecek?
- Hangi araç nerede?
- Hangi araç gerçekten hazır?
- Hangi müşterinin belgesi eksik?
- Hangi rezervasyon kiralamaya çevrilebilir?
- Hangi kiralamanın finansı kapanmadı?
- Hangi hasar/ceza müşteriye yansıtılmalı?
- Hangi görev kimin üzerinde ve gecikti mi?
- Hangi olay takip bekliyor?
- Hangi işlem onay bekliyor?
- Hangi şubede kapasite sıkışıyor?
- Hangi gelir kaçağı veya operasyonel risk var?
- Şirketin gerçek tahsilat, masraf ve alacak durumu nedir?
- Kim neyi ne zaman yaptı?

ACARVO’nun ürün karakteri:

**Önle → Kontrol Et → Kazan**

Sistem “kayıt tutan panel” değil, ekibin günlük operasyon masası olmalıdır.

---

# 2. Ürün prensipleri

## 2.1 Kullanıcıya dönük prensipler

1. **Her ekranın net bir işi vardır.**
2. **Aynı gerçek iki farklı yerde farklı hesaplanmaz.**
3. **Kullanıcı teknik kavram değil iş dili görür.**
4. **Formlar demo UI action alanlarının dökümü gibi görünmez; gerçek iş akışını takip eder.**
5. **Önemli iş ekranları geniş ve kapsamlı workspace'tir; gereksiz wizard ve sayfa atlamaları yoktur.**
6. **Kritik özetler, fiyat, belge durumu, uygunluk ve risk ekranda görünürdür.**
7. **Her mutasyonda dürüst geri bildirim vardır.**
8. **Boş, yükleniyor, hata, yetkisiz ve conflict durumları tasarlanmış ürün durumlarıdır.**
9. **Backend kurulmuyor diye web konseptinin gerçek kullanıcı akışları eksiltilmez.**
10. **Önceki ACARVO web ürün kabiliyetleri konsept aktarımında kaybolmaz.**

## 2.2 İş kuralı prensipleri

- Charge ≠ Payment
- Refund ≠ negatif Charge
- Deposit ≠ Revenue
- Return ≠ Financial Close
- Financial Close ≠ Vehicle Ready
- Maintenance Completed ≠ Vehicle Ready
- Approved ≠ Applied
- Customer signature capture ≠ Staff Approval
- Expense ≠ Maintenance cost duplicate
- Incident ≠ Damage/Fine/Maintenance
- Task ≠ system event
- Calendar = projection, ikinci truth değil
- Reports = derived facts, tahmin değil
- No fake AI
- No arbitrary risk score
- No fake “saved revenue”
- No cross-currency sum
- Branch affiliation ≠ physical vehicle location

---

# 3. Kullanıcı rolleri ve dış aktörler

## 3.1 Patron / Owner
Şirketin tamamını görür:
- finans
- raporlar
- kullanıcı/rol/yetki
- şirket ayarları
- operasyon
- onaylar
- kurallar
- intelligence
- audit

## 3.2 Yönetici / Manager
Günlük operasyonu yönetir:
- rezervasyon
- kiralama
- müşteri
- filo
- görev
- olay
- bakım
- hasar
- ceza
- onay
- supplier/sourcing operasyonu yetkiye göre
- raporların operasyonel kısmı
- belirlenen şubeler

## 3.3 Muhasebe / Accounting
Finansal kayıt ve kontrol:
- tahsilat
- refund
- depozito
- masraf
- finans merkezi
- raporlar
- sözleşmeler
- kurumsal cari
- partner komisyonu
- supplier payables / settlements
- insurance recoveries
- audit erişimi yetkiye bağlı

## 3.4 Operasyon / Resepsiyon / Employee
Günlük sahadaki işler:
- müşteriler
- rezervasyon
- kiralama
- araç listesi
- görevler
- teslim/iade
- belge kontrolü
- bakım/hasar/ceza yetkiye göre
- supplier receive/return inspection yetkiye göre

## 3.5 Müşteri — dış aktör, sistem kullanıcısı değil

Müşterinin ACARVO_V1 içinde login'i veya ayrı kullanıcı rolü yoktur. Müşteri için ayrı uygulama, portal veya public self-service yüzeyi YOKTUR.

Müşteri:
- şirket personeli tarafından sistemde yönetilir
- belgeleri personel tarafından alınır/yüklenir
- sözleşme ve kiralama süreçleri internal operasyon üzerinden yürütülür

Müşteriye yönelik web application, Customer Portal, Public Booking ve self-service akışları V1 kapsamı dışındadır.

## 3.6 Partner — external authenticated actor
Partner Portal hesabı/oturumu ile:
- yönlendirdiği talepleri görür
- yeni lead oluşturur
- komisyon hak edişini görür
- ödenen/bekleyen komisyonu görür

---

# 4. Final navigasyon — TEK SIDEBAR OTORİTESİ (V1 ürün yapısı: 21 bağlantı / 6 kategori)

> **Güncelleme notu (yalnız `frontend-v1-urun-uygulama` dalı).** Bu bölüm, `docs/ACARVO_V1_URUN_MIMARISI_VE_KARARLAR.md` (K-1…K-18, bölüm H, I, J, K) kararlarına göre yeniden yazıldı. Önceki 36 bağlantılı liste kaldırılmadı; her eski bağlantının yeni yeri aşağıdaki **36 → yeni yer** tablosundadır. Bu bölümün dışındaki ekran bölümleri (ör. Komuta Merkezi, Filo Asistanı, Talep Merkezi ayrıntıları) **V1.5 / V2 kapsam bilgisi** olarak korunur; V1 menüsüne yeni bağlantı üretmez.
>
> Belgenin ilerleyen bölümlerindeki (ör. §82, §83, Stage 0 ve kabul listeleri) "7 kategori / 36 bağlantı" ifadeleri **tarihsel tam-kapsam listeyi** anlatır; V1 ürün menüsünün geçerli sayısı bu bölümdeki **6 kategori / 21 bağlantıdır** ve bu ifadelerin her biri yukarıdaki "36 → yeni yer" tablosuyla okunmalıdır. Görev tanımı ve sekme standartları değişmedi; yalnız menüde nerede göründükleri değişti.

Bu bölüm ACARVO şirket içi WEB sidebar'ının **tek canonical navigasyon listesidir**. Aşağıdaki 6 kategori / 21 bağlantı tam kapsamdır. Yetkisi olmayan kullanıcıda bazı bağlantılar gizlenebilir; **21**, Gelişmiş profilde yetkili tam-kapsam şirket için toplam sayıdır.

## Genel
- Ana Ekran
- İşlerim

## Operasyon
- Rezervasyonlar
- Kiralamalar (Sözleşmeler burada bir görünümdür)
- Takvim
- Görevler
- Araçlar
- Bakım & Servis
- Hasar ve Olaylar (Hasar Kayıtları, Olay Merkezi, Cezalar sekmeleri)

## Müşteri & Ticari
- Müşteriler
- Kurumsal Hesaplar
- Fiyatlandırma

## Finans
- Finans (Kaydedildi → Doğrulandı → Uygulandı; Mutabakat ve Dikkat ayrı izler)
- Masraflar
- Şube Kasaları (gün sonu dahil)

## Kontrol ve Raporlar
- Raporlar (Kiralama, Filo, Finans, Gün sonu)
- Onay Merkezi

## Yönetim
- Şubeler
- Kullanıcılar ve Roller
- İşlem Geçmişi
- Ayarlar (Operasyonel Hazırlık, Sözleşme şablonları, Kurulum sihirbazı)

## Kullanıcı menüsü (sidebar sayımına dahil değil)
- Profil/Oturum
- Menüde gizli ekranlar (Sade profilde gizlenen ama erişilebilir ekranlar)
- Çıkış

## Navigasyon sözleşmesi

- **Sayısal invariant:** Genel 2 + Operasyon 7 + Müşteri & Ticari 3 + Finans 3 + Kontrol ve Raporlar 2 + Yönetim 4 = **21 sidebar bağlantısı**.
- **Temel / Gelişmiş görünüm (profil):** Şirket Ayarlar'dan bir menü profili seçer. **Sade = 16 bağlantı** (Kurumsal Hesaplar, Şube Kasaları, Onay Merkezi, Şubeler ve İşlem Geçmişi menüden gizlenir), **Standart = 20** (yalnız İşlem Geçmişi menüden gizlenir), **Gelişmiş = 21**. Tek şubeli şirkette Şubeler bağlantısı profilden bağımsız olarak gizlenir. Profil yalnız **görünürlüğü** değiştirir; **hiçbir iş kilitlenmez**: kasa işlemi Finans'tan, onay kararı İşlerim'den, işlem geçmişi kaynak kaydın zaman çizelgesinden ve kullanıcı menüsündeki "Menüde gizli ekranlar" listesinden yapılabilir. Yetki (RBAC) profilden bağımsızdır; profil yetki vermez.
- **Görevler bağımsızdır.** Ayrı rota, havuz (şube + rol filtreli), sahiplenme (sürüm/conflict modeli; gerçek API'de 409), bağlı kayıttan oluşturma (araç, kiralama, rezervasyon, müşteri, bakım, hasar), yeniden açma geçmişi, uygulama içi bildirim, toplu atama/tamamlama. Görev tamamlamak bağlı kaydı (kiralama, bakım, hasar) **tamamlamaz**.
- **İşlerim ≠ Görevler.** İşlerim, kişiye ait "benden bekleneni" gösteren bir **projeksiyon**dur (onay kararlarım, atandığım/sahiplendiğim görevler, uyarılar, yeni olay); yeni veri üretmez ve Ana Ekran sayaçlarıyla aynı kaynaktan hesaplanır. Görev listesi ayrı sayfadır.
- **Resmî onay tipleri 6'dır** (indirim, iade, iptal/ters kayıt, finansal düzeltme, kurumsal kredi aşımı, hasar bloğu kaldırma); İşlerim yedinci bir onay tipi eklemez. Onay riski 0–3 düzeyinde sınıflandırılır; **sahte dört göz yoktur**: kaydeden kendi kaydını doğrulayamaz (M.3(c) V1.5 adayı olarak açıkça işaretlidir).
- **Olgunluk etiketleri (sayfa düzeyinde, her butonda değil):** *Gerçek sistemde mevcut*, *Kısmen gerçek*, *Demo konsepti · V1 hedefi*. Kapsam etiketleri: **V1**, **V1.5**, **V2**. Demo'da çalışan işlemler yalnız demo kaydını değiştirir; ClamAV, anahtar yönetimi, hukuki onay gibi canlı ortam ön koşulları hiçbir zaman "tamam" gösterilmez.
- **Ertelenen modüller** (Filo Asistanı, Talep Merkezi, Partnerler, Araç Tedarikçileri, Kurallar, Fırsatlar) menüde görünmez; kod korunur. Doğrudan adrese gidilirse "Bu modül etkin değil" ve hedef sürüm (V1.5/V2) gösterilir. Kapsam dışı kavramlar yalnız izole bir "Gelişmiş Konsept Ön İzlemesi" (demo menüsü, yetki `preview:use`) ile açılır; yeni menü bağlantısı değildir.
- **Riskler ve İstisnalar**, **Gelir Kontrolü**: ayrı bağlantı değildir. Uyarılar İşlerim → Uyarılar; gelir tutarsızlıkları Finans → Dikkat sekmesidir. Teknik değişmezler (invariant) denetimi Ayarlar → Operasyonel Hazırlık altındadır.
- **Hasar Kayıtları**, **Olay Merkezi**, **Ceza Modülü** tek bağlantıda toplanır: **Hasar ve Olaylar** (sekmeler). Hasar bloğu kaldırma resmî onay gerektirir (iki farklı `damages:unblock` yetkilisi).
- **Sözleşmeler** Kiralamalar altında bir görünümdür; şablonlar Ayarlar'dadır. Sistem dijital/elektronik imzanın hukuki geçerliliğini iddia etmez (yalnız dahili imza yakalama).
- **Şube Kasaları** Finans grubunda tek doğrudan sidebar rotasıdır; **gün sonu** buradadır (para birimi açık, fark nedeni zorunlu, kritik kasa işlemleri onay gerektirir). İkinci editable cash ledger yaratılmaz.
- **Ayarlar**, yalnız **Yönetim → Ayarlar** bağlantısından açılır. Döviz kuru düzenlemenin tek canonical ekranı **Yönetim → Ayarlar → Döviz Kurları**'dır; Finans'ta kur yalnız okunur görünür.
- **Kurulum sihirbazı (9 adım):** şirket, şubeler, profil, ilk araç, kullanıcılar/roller, temel fiyat, sözleşme ayarları, finans/ödeme politikası, hazırlık kontrolü. Demo'da gerçek tenant, davet veya veritabanı değişikliği yaratmaz; durumlar: Gerekli / Eksik / Sistem yöneticisi işlemi / Demo ön izlemesi.
- **Platform Console**, yalnız **Platform Super Admin** demo context'inde, şirket uygulamasından ayrı üst seviye **bağlam değiştirici** üzerinden erişilir. Partner Portal da company sidebar dışında ayrı web context'tir.
- Global Search ve Bildirimler header/toolbar'dan açılır. Quote, Waitlist, kaparo, sigorta, ödeme satırları, taksit ve tüm diğer detaylar **ilgili canonical menü altında contextual tab, alt sayfa, drawer veya wizard** ile açılır. Bir bölümde adı geçen her özellik için yeni menü açılmaz.
- **§II.4 ekran bilgi mimarisi** ve **§59CT yerleşim haritası** bu §4'e bağımlıdır; farklı etiket veya rota göründüğünde **§4 menü otoritesidir**.

## 36 → yeni yer

| Eski bağlantı | Yeni yer | Tür |
|---|---|---|
| Ana Ekran | Ana Ekran | aynı |
| Komuta Merkezi | İşlerim | yönlendirme |
| Filo Asistanı | — (V2, menüde yok; doğrudan adres "modül etkin değil") | ertelendi |
| Rezervasyonlar, Kiralamalar, Takvim, Görevler, Araçlar, Bakım & Servis | aynı | aynı |
| Olay Merkezi | Hasar ve Olaylar → Olaylar | yönlendirme |
| Hasar Kayıtları | Hasar ve Olaylar | yönlendirme |
| Ceza Modülü | Hasar ve Olaylar → Cezalar | yönlendirme |
| Müşteriler, Kurumsal Hesaplar, Fiyatlandırma | aynı | aynı |
| Talep Merkezi, Partnerler, Araç Tedarikçileri | — (V1.5 / V2, menüde yok) | ertelendi |
| Onay Merkezi | aynı (Kontrol ve Raporlar) | aynı |
| Kurallar, Fırsatlar | — (V1.5 / V2, menüde yok) | ertelendi |
| Gelir Kontrolü | Finans → Dikkat | yönlendirme |
| Riskler ve İstisnalar | İşlerim → Uyarılar | yönlendirme |
| Kapasite Planlama | Takvim → Kapasite görünümü | yönlendirme |
| Filo Analizi | Raporlar → Filo | yönlendirme |
| Raporlar | aynı | aynı |
| Finans, Masraflar, Şube Kasaları | aynı | aynı |
| Sözleşmeler | Kiralamalar → Sözleşmeler görünümü | yönlendirme |
| Belge Merkezi | kayıt ekranı (`/belge-merkezi`), menüde yok; kaynak kayıtların belge sekmeleri | kayıt ekranı |
| İşlem Geçmişi | aynı (Yönetim) | aynı |
| Şubeler, Kullanıcılar, Ayarlar | aynı (Kullanıcılar → **Kullanıcılar ve Roller**) | aynı |
| Roller ve Yetkiler | Kullanıcılar ve Roller → Roller | yönlendirme |

Eski 36 adresin tamamı çalışmaya devam eder (yönlendirme, URL filtreleri ve kayıt bağlantıları korunur; veri sızıntısı yoktur).

> Partner Portalı internal sidebar'a girmez. ACARVO_V1 içinde müşteriye açılan portal, public booking, müşteri uygulaması veya dış sözleşme imza sayfası yoktur.

---

# 5. Ortak UI modeli

## 5.1 Liste sayfası standardı
Her büyük liste sayfası aşağıdaki yapıyı kullanır:

1. Başlık + kısa açıklama
2. Birincil CTA
3. Gerçek KPI/özet kartları (yalnız gerçekten faydalıysa)
4. Filtreler
5. Arama
6. Tablo/liste
7. Pagination
8. Empty state
9. Error state
10. Yetkiye göre aksiyonlar

## 5.2 Detay sayfası standardı
1. Kimlik / numara / ad
2. Durum
3. Ana aksiyonlar
4. Temel bilgiler
5. İlişkili kayıtlar
6. Belgeler / finans / geçmiş
7. Timeline / audit bağlantısı
8. Contextual actions

## 5.3 Create workspace standardı
Özellikle Reservation/Rental gibi ağır işlerde:

- ana çalışma alanı
- bölümlenmiş form
- canlı özet
- demo calculation/state doğrulaması
- loading/error states
- sticky summary
- “ne eksik / ne hazır” bilgisi

---

# 6. ANA EKRAN

## Amaç
Şirkete girildiği anda “bugün ne oluyor?” sorusunu cevaplar.

## Gösterir
- bugün teslimler
- bugün iadeler
- yaklaşan teslimler
- eksik belgeli kiralamalar
- açık/onay bekleyen işlemler
- geciken görevler
- kritik olaylar
- araç durum özeti
- bakım yaklaşan araçlar
- finansal dikkat kartları (yalnız gerçek veriler)
- şube bazında yoğunluk

## Yapmaz
- doğrudan karmaşık business mutation
- ikinci finans hesaplama
- ikinci risk hesabı

Her kart ilgili kaynak modüle gider.

---

# 7. KOMUTA MERKEZİ

## Amaç
Ana Ekran genel özet, Komuta Merkezi ise **müdahale edilmesi gerekenleri** gösterir.

## İçerik
- geciken kiralama
- belge eksikliği
- onay bekleyen işlem
- kapasite problemi
- teslim/iadeye az süre kalmış ama hazır olmayan araç
- finansal kapanışı eksik kiralama
- kritik görev/olay

## Kurallar
- deterministic
- read-only command aggregation
- source kayda link
- fake “AI priority score” yok
- gerektiğinde önem seviyesi, fakat açık kural tabanlı

---

# 8. FİLO ASİSTANI

## Amaç
Doğal dil benzeri hazır intent/soru-cevap ile mevcut veriyi hızlı bulmak.

Örnekler:
- “Bugün kaç teslim var?”
- “34 ABC 123 nerede?”
- “Bu hafta hangi araçların bakımı var?”
- “Açık hasarlı araçları göster.”
- “Bugün iade olacak kiralamalar.”

## Kurallar
- deterministik
- read-only
- hiçbir kaydı değiştirmez
- “AI” diye pazarlanmaz
- olmayan bilgiyi üretmez

---

# 9. REZERVASYONLAR

**Yeni V1 WEB adımları:** sürücü eligibility, insurance preview, vergili ücret breakdown, transaction currency, prepayment/kaparo ve split payment preview; §65–70, §78.


## 9.1 Liste
Göster:
- rezervasyon no
- müşteri
- customer residency (Local/Foreign)
- Corporate Account context varsa badge/account
- araç sınıfı
- belirli araç varsa araç
- pickup / return
- şubeler
- durum
- fiyat
- belge readiness
- oluşturulma kaynağı

Filtre:
- tarih
- durum
- şube
- araç sınıfı
- müşteri
- belge durumu
- belirli araç atanmış/atanmamış

CTA:
- Yeni Rezervasyon

## 9.2 Yeni Rezervasyon Workspace

### Bölüm 1 — Müşteri
İki mod:
- Mevcut müşteri
- Yeni müşteri

Mevcut müşteri arama:
- ad
- telefon
- e-posta

Seçildikten sonra:
- ad
- telefon
- Yerel/Yabancı residency
- bağlı Corporate Account varsa commercial context
- belge readiness

Yeni müşteri:
- ad soyad
- telefon
- email
- Yerel/Yabancı açık seçim

Local/Foreign hiçbir zaman isim, ülke, telefon kodu veya belge tipinden otomatik infer edilmez.

Corporate Account ayrı commercial entity'dir; Customer kaydının içine ikinci şirket truth'u olarak gömülmez. Reservation/Rental bir Customer ile çalışır ve gerekiyorsa ayrıca Corporate Account context'i taşır.

Kaydet ve otomatik seç.

### Bölüm 2 — Belge Durumu

Yerel:
- Kimlik
- Ehliyet

Yabancı:
- Pasaport
- Giriş Damgası
- Ehliyet

Kurumsal context:
Corporate Account seçili ve corporate exemption policy aktifse bireysel identity gate uygulanmaz. Corporate Account'ın kendisine Local/Foreign residency atanmaz.

Her belge:
- Mevcut
- Eksik
- Yükle

Eksik belge **rezervasyonu engellemez**.

Mesaj:
> Rezervasyon oluşturulabilir. Eksik belgeler kiralama başlamadan önce tamamlanmalıdır.

### Bölüm 3 — Kiralama Planı
- teslim şubesi
- iade şubesi
- teslim tarih/saat
- iade tarih/saat
- policy-based rental duration preview (tek UI calculator)
- one-way varsa fiyat etkisi

### Bölüm 4 — Araç Seçimi

Mod A: Araç sınıfı  
Belirli araç atanmadan **class-capacity reservation** oluşturur.

Class-only Reservation:
- belirli bir VehicleId bloke etmez
- ilgili branch + vehicle class + pickup/return aralığında **1 adet confirmed capacity demand** oluşturur
- authoritative Availability/Capacity servisi aynı tarih aralığındaki:
  - confirmed class-only Reservations
  - specific-vehicle Reservations
  - active/planned Rentals
  - Maintenance
  - Transfer / Unavailable blokları
  - confirmed Sourcing Engagement external Vehicle windows (yalnız benzersiz fiziksel araç başına bir kapasite)
  verilerini birlikte değerlendirir
- aynı fiziksel araç hem specific reservation hem class capacity için iki kez sayılmaz
- Confirmed Reservation kapasiteyi tüketir; **Pending Reservation hiçbir class capacity veya specific Vehicle bloklamaz**
- Pending Reservation içinde specific Vehicle tercihi seçilmiş olsa bile bu yalnız tentative selection'dır; hard allocation değildir
- Pending → Confirmed geçişinde authoritative Availability aynı transaction içinde tekrar doğrulanır
- Confirm sırasında Vehicle artık uygun değilse işlem 409/conflict ile durur ve Reservation Pending kalır
- Cancelled / No-show Reservation kapasite tüketimini bırakır
- **Converted Reservation kapasiteyi ancak aynı transaction içinde specific Vehicle atanıp Rental occupation oluşturulduğunda bırakır**
- Reservation → Rental dönüşümünde capacity release ile Rental vehicle occupation atomiktir; arada kapasite boşluğu oluşmaz
- overbooking ACARVO_V1'de yoktur

Mod B: Belirli araç  
Sadece authoritative Availability sonucuna göre çakışmasız araçlar.

Availability context-aware çalışır:
- mevcut Reservation/Rental kendi allocation'ını kendisiyle conflict saymaz
- yalnız diğer authoritative allocations/blockers conflict oluşturur
- conversion/swap/extension kontrolleri source record context'iyle yapılır

Readiness ayrı bilgidir: mevcut readiness durumu kartta gösterilir fakat availability ikinci kez readiness üzerinden hesaplanmaz. Delivery anındaki hard blocker'lar Vehicle Readiness/Policy tarafından uygulanır.

Araç kartı:
- fotoğraf
- plaka
- marka/model
- sınıf
- readiness
- location
- şube
- profil fotoğrafı varsa thumbnail; yoksa nötr placeholder

Araç görseli:
- Araç kaydında en fazla bir aktif **ana/profil fotoğrafı** bulunur; fotoğraf henüz yüklenmemiş olabilir.
- Rezervasyon ekranındaki belirli araç seçiminde bu tek profil fotoğrafı gösterilir.
- Rezervasyon oluşturmak için 4–5 araç fotoğrafı şartı YOKTUR.
- 4–5 fotoğraf kuralı Rental Handover/Return, Supplier Receive/Return ve Vehicle Swap inspection kanıt setlerine aittir; araç kataloğu galerisine değil.

### Bölüm 5 — Ekstralar
Örnek:
- Bebek Koltuğu
- Yükseltici Koltuk
- GPS navigasyon cihazı
- Zincir
- Wi-Fi

Buradaki GPS bir rental accessory/navigation cihazıdır; live vehicle tracking/GPS hardware integration anlamına gelmez.

Her ekstra:
- açıklama
- fiyat modu
- fiyat
- adet
- subtotal

> **İkinci / ek sürücü artık V1 WEB konsept kapsamındadır (§83.3).** Sürücü kimliği, ehliyet uygunluğu ve sözleşme listesi Rental'a bağlı ayrı sürücü kaydıdır; generic Extra veya sadece ödeme yapan kişi değildir. Ek sürücü ücreti uygulanacaksa yalnız mevcut Pricing/Charge snapshot kuralıyla oluşur; ikinci bağımsız fiyat kaynağı yoktur.

### Bölüm 6 — Fiyatlandırma
Single shared web pricing simulator breakdown:
- temel kiralama
- ekstralar
- one-way
- indirim
- toplam
- currency

Fiyat değişirse:
- 409
- yeni fiyat göster
- explicit confirm

### Bölüm 7 — Notlar & Ayarlar
- rezervasyon notu
- doğrudan onaylı oluştur (izin/policy varsa)

### Sağ Sticky Summary
Daima:
- müşteri
- belge durumu
- dönem
- şube
- araç/sınıf
- extras
- availability
- toplam fiyat
- blocker/warning

Primary CTA:
**Rezervasyon Oluştur**

## 9.3 Rezervasyon Detay

Header:
- Rezervasyon no
- durum
- müşteri
- tarih aralığı
- toplam

Bölümler:
- müşteri
- belge readiness
- kiralama planı
- araç sınıfı / araç
- extras
- pricing snapshot
- notlar
- status history
- source quote/lead
- audit link

Aksiyonlar:
- onayla
- iptal et
- araç ata/değiştir
- fiyatı yeniden gözden geçir (gerekiyorsa)
- Kiralamaya Dönüştür

## Class-only Reservation → Specific Vehicle assignment

Confirmed class-only Reservation'a sonradan specific Vehicle atanırken:
- authoritative Availability aynı transaction içinde yeniden doğrulanır
- class-capacity demand aynı transaction içinde specific-vehicle allocation'a dönüşür
- capacity demand önce serbest bırakılıp sonra vehicle allocation oluşturulmaz; işlem **atomic** olmalıdır
- aynı fiziksel araç ve aynı Reservation iki kez capacity tüketmez
- conflict varsa işlem 409 ile durur; mevcut class-capacity reservation korunur

Reservation lifecycle:
Pending
→ Confirmed
→ Converted

Terminal alternatives:
- Cancelled
- No-show

Converted Reservation tekrar active Reservation olarak kullanılamaz.

Kiralamaya dönüşüm gate:
- specific Vehicle assignment + authoritative Availability
- class-only Reservation ise atomic capacity-to-vehicle conversion

Local:
- Kimlik + Ehliyet

Foreign:
- Pasaport + Giriş Damgası + Ehliyet

Corporate context:
- Corporate Account + authoritative corporate exemption policy uygulanır

---

# 10. KİRALAMALAR

**Yeni V1 WEB adımları:** seçilen sigorta+muafiyet snapshot, driver age/license gate, Delivery anında posted base Charge, çok payer/method/currency split payments, payment plans, kasalar, olağan dışı sonlandırma; §63–72, §78.


## 10.1 Liste
- Rental no
- müşteri
- araç
- teslim
- planlanan iade
- gerçek iade
- durum
- finans durumu
- belge durumu
- şube

Filtre:
- active
- prepared
- delivered
- returned
- financially open
- overdue
- branch
- vehicle
- customer

## 10.2 Yeni Kiralama Workspace

Rezervasyon olmadan direkt Rental açma.

**Rental oluşturulmadan önce specific Vehicle atanmış olmalıdır.** Rental class-only tutulmaz.
Reservation class-only ise `Kiralamaya Dönüştür` önce authoritative Availability üzerinden specific Vehicle seçer; capacity → Rental occupation atomik olarak dönüşür.

Rezervasyon workspace ile aynı zenginlikte:

1. Müşteri
2. Belge Uygunluk Kontrolü — birincil ve varsa ek sürücü için ayrı doğrulama (§83.3)
3. Dönem
4. Araç
5. Extras ve varsa ek sürücü ücretinin kanonik fiyatlandırmaya bağlantısı
6. **Sigorta & Muafiyet** — bu araç/şube/dönem için uygun tanımlı paketlerden açık seçim; fiyat, kapsam, muafiyet ve sigorta sürümü ön izlemesi (§70, §84.1)
7. Pricing — seçilen sigorta/ek sürücü dahil tek Pricing Snapshot, vergi ve transaction currency
8. **Depozito** — `Gerekli / Bu policy'ye göre gerekmiyor`, efektif miktar, currency, gerekçe ve `Held/Applied/Released` ayrı akış (§59BE, §84.2)
9. Sözleşme hazırlığı — logo, sürücü(ler), seçili sigorta ve depozito koşulları, hasar diyagramı, baskı/imza akışı (§83.1–83.4, §84.3)
10. Summary — `Sözleşmeyi Ön İzle` CTA'sı; eksik/gereken belge adımları görünür

Fark:
**Bireysel müşteri için gerekli identity belgeleri eksikken Rental oluşturulamaz. Corporate exemption yalnız Document Requirement policy açıkça izin veriyorsa uygulanır. Frontend bu istisnayı kendi başına çıkarmaz.**

## 10.3 Rental Detay — ana operasyon workspace

Header:
- Rental no
- customer
- vehicle
- status
- pickup/return
- branch
- top actions

### Genel
- müşteri
- birincil ve ek sürücüler + her birinin uygunluk durumu
- araç
- dönem
- şubeler
- extras
- seçilen sigorta/koruma paketi; ücret/şartlar ve muafiyet (read-only applied snapshot, `Değiştir` yetkili aksiyon)
- efektif depozito gerekliliği, para birimi, held/applied/released durumları
- note

### Teslim
**Teslim Masası (§85.4)** aynı Rental ID üstünde durum-kartları, açık blocker/fix linkleri, belgeler/imzalar, sürücüler, fiyat/sigorta/depozito, Vehicle Readiness/Availability, hazırlık ve Inspection adımlarını birleştirir; `Teslimi Tamamla` tek, permission-gated son aksiyondur. Kartlar ayrı source create etmez.

Delivery finalize edilmeden önce paylaşılan web business-rule state zorunlu kontrolleri yapar (production server gate değildir):
- Document Requirement tamam veya açık Corporate exemption var
- Contract doğru version ile issued
- gerekiyorsa internal customer signature capture tamam
- policy gerektiriyorsa staff approval tamam
- authoritative Availability hâlâ uygun
- Vehicle Readiness hard blocker içermiyor
- gerekli 4–5 inspection fotoğrafı demo evidence state içinde tamamlanmış

Teslim kaydı:
- km
- fuel
- 4–5 condition photos
- visible condition notes
- key custody handover
- vehicle-bound equipment checklist
- staff
- delivered at

### İade
- km
- fuel
- 4–5 new condition photos
- visible condition notes
- key custody return/reconciliation
- vehicle-bound equipment return/reconciliation
- missing/damaged key/equipment varsa Incident/Damage/Charge candidate link; otomatik charge yok
- actual return
- farklar
- staff-entered return note if any

### Sözleşme
- template/version + güncel kurumsal logo/antet/dil için issue preview (§83.1–83.2)
- Rental zorunlu alanları tamamlandığında tek eylemle `Ön İzle → Sözleşmeyi Oluştur`
- araç kimlik/teslim durumu, seçili birincil/ek sürücü listesi, fiyat/vergi/depozito/sigorta/km şartları ve kanıt linkleri
- müşteri için aynı personel web ekranında imza canvas
- bas/yazdır, staff approval, historical signed/unsigned immutable versions
- uzak müşteriye imza linki/public portal yok; konsept imzası hukuki sertifika iddiası taşımaz (§83.4)

### Kiralama Dosyası — uygulanmış Document Requirement snapshot

Her Rental oluşturulduğunda web demo Rental snapshot şu tarihi durumu pinler:
- Customer residency: Local / Foreign (açık seçilir)
- Corporate Account / payer context varsa
- geçerli Document Requirement policy ID/version
- Corporate exemption applied? (true/false; applied rule/version + authorized context)
- bu Rental için **gerçekten required** belge türleri ve kullanılan her belgenin exact immutable version ID'si
- Contract exact issued version ve ilgili signature reference (ayrı contract otoritesi)

Corporate exemption yoksa bireysel gate:
- Local → National ID + Driver License exact versions
- Foreign → Passport + Entry Stamp + Driver License exact versions

Corporate exemption applied ise **muaf tutulan bireysel belgeler Rental File için zorunlu sayılmaz**; kaydı olmayan belgeye sahte version reference üretilmez. Varsa optional documents historical exact version olarak eklenebilir.

Historical pinning:
Document Requirement policy veya Customer belgesi sonradan değişse bile eski Rental'ın requirement snapshot'ı, exemption kararı ve pinned document versions değişmez.
Reservation eksik belgeyle oluşturulabilir; Rental create/conversion için yalnız **uygulanmış** Document Requirement seti eksiksiz olmalıdır.

### Finans
- Charges
- Payments
- Refunds
- Deposit (required/waived-by-policy/exception-applied ve Held/Applied/Released, kaparodan farklı)
- Insurance package price/coverage snapshot read-only; yalnız Price Snapshot/Charge kaleminden ücret
- Corrections
- total
- outstanding
- close status

### Hasar / Ceza
- linked records
- charged state
- no double-charge

### Görevler / Olaylar
- ilişkili açık görevler
- ilişkili incidents
- new task / new incident contextual CTA

Rental operational lifecycle — normal Return:
Prepared
→ Delivered
→ Returned
→ Closed

Alternative terminal before Delivery:
Prepared → Cancelled

Alternative terminal after Delivery — **normal Return gerçekleşemiyorsa** (§71):
- Delivered → **Loss Closed** (Theft / Total Loss / belgelenmiş Abandoned-Unrecoverable)
- Delivered → **Exception Closed** (Impounded-Seized / Authorized Administrative Closure)

`Exception Closed` ve `Loss Closed`, Rental'ın ayrı ve terminal operasyonel statüleridir; normal `Returned` veya `Closed` olarak gösterilmez. Bunlara yalnız §71'deki gerekçeli/izin kontrollü exceptional workflow üzerinden geçilir. Normal Return'un 4–5 fotoğraf, km, yakıt ve anahtar gate'leri yalnız normal `Returned → Closed` yoluna aittir. Exceptional evidence checklist ve missing-evidence nedeni (§71) alternatif gate'tir. Bu terminal statüler Finance `Financially Closed` anlamına gelmez; Vehicle `Available/Ready` de yapılmaz.

**Rental Closed = normal operasyonel kapanış.**
Returned bir Rental ancak:
- Return kaydı finalize edilmişse
- zorunlu return inspection verileri ve 4–5 fotoğraf konsept inspection state içinde tamamlanmışsa
- anahtar/araç ekipmanı iade durumu kaydedilmişse
- iadede görülen yeni hasar/olay gerekiyorsa ilgili source kayda bağlanmışsa
Closed olabilir.

Rental Closed:
- bakiye sıfır olmak zorunda değildir
- Financially Closed olmak zorunda değildir
- Vehicle Ready olmak zorunda değildir
- açık Damage/Fine/Insurance/Task lifecycle'larını otomatik kapatmaz

Finance lifecycle:
Open → Financially Closed (**doğrudan**, borç/required gates çözümlenmişse)
veya
Open → Partially Settled → Financially Closed

Post-close gerekirse:
Financially Closed
→ Reopened
→ Open / Partially Settled
→ Financially Closed

`Reopened` yalnız authorized post-close Charge/Correction nedeniyle, reason + actor + timestamp + audit ile oluşur.

Vehicle readiness:
Ready / Not Ready / Review Required

Bu üç lifecycle birbirinden bağımsızdır.
Returned ≠ Rental Closed ≠ Financially Closed ≠ Vehicle Ready.

---

# 11. TAKVİM

Read-only projection.

Görünümler:
- Gün
- Hafta
- Ay
- Agenda

Kaynaklar:
- Reservation pickup
- Rental delivery
- planned return
- Maintenance

Filtre:
- branch
- vehicle
- event type

Click:
source detail.

Drag-drop mutation yok.

---

# 12. GÖREVLER

Manuel insan işi.

Dashboard cards:
- açık görev
- geciken
- bugün vadesi
- atanmamış

Liste:
- no
- title
- status
- priority
- assignee
- due
- source
- branch

Create:
- title
- description
- category
- priority: Acil / Yüksek / Normal
- sorumlu kişi (tek accountable owner) veya üstlenilmeyi bekleyen açık ekip/şube havuzu
- hedef kitle: tek kişi, birkaç kişi veya yetki/şube kapsamı içindeki tüm uygun personel; ayrı takipçi/katılımcılar (§83.6)
- due
- source
- görünürlük/scope; yalnız role/branch yetkisindeki alıcılara duyurulur

Lifecycle:
Open (atanmış veya açık havuz)
→ In Progress (yetkili `Üstlen` veya atama ile tek sorumlu)
→ Completed
veya Cancelled; izinli `Yeniden Aç`, `Devret` ve `Üstlenmeyi Bırak` işlemleri geçmişi korur (§83.6).

Detail:
- comment thread
- history
- source link
- audit
- tek accountable owner, hedef kitle/alıcılar, takipçiler ve açık görev havuzu
- `Bana Atananlar / Açık Görevler / Üstlendiklerim / Devam Eden / Geciken / Tamamlanan` filtreleri
- bildirim ve okunma ayrı projection; herkesin bilgilendirilmesi ayrı ayrı Task yaratmaz

Görev tamamlamak kaynak domaini değiştirmez.

---

# 13. ARAÇLAR — ARAÇ 360° YÖNETİM MERKEZİ

**V1 web-konsept kalite hedefi:** Araçlar, rent-a-car operasyonunun merkezidir. Kullanıcı herhangi bir araç için «Şu an nerede, kimde, ne zaman müsait, ne zaman teslim edilebilir, hangi sorunları var, geçmişte ne oldu, hangi işlem yapılmalı?» sorularına **Araçlar** ekranından cevap bulur. Bu bölüm yeni bir domain veya yeni sidebar girişi icat etmez; §13, §59B–D, §59H–I, §59N–R, §59BA–BM, §59BW, §59CF–CI, §59CY, §59X–AD ve global finans kurallarındaki **mevcut yetenekleri** tek, derin, etkileşimli web deneyiminde birleştirir.

**Kanoni̇k yerleşim:** `Operasyon → Araçlar` **tek sidebar bağlantısıdır** (§4). Araç Listesi → Araç Oluştur/Düzenle → Araç Detay 360° sayfaları bu bağlantının içindedir. Aşağıda tarif edilen sekmeler ayrı sidebar öğesi değildir. Her detay kartı tek gerçek source kayda bağlanır; araç ekranı ikinci Rental, Maintenance, Finance, Document veya Supplier kayıt deposu değildir.

## 13.1 Araç Listesi — filo operasyon masası

### Görünüm, düzen ve sonuç yoğunluğu

- Üst alan: `Araçlar` başlığı, yetkiye göre **Yeni Araç**, arama, tarih aralığı, şube ve kaynak filtresi; filtreler paylaşılabilir/geri dönülebilir ekran state'inde kalır.
- Yararlı üst özetler: toplam görünür araç, seçili **anlık** tarih/saatte Available, Rented, Maintenance, Not Ready, açık hasarlı ve belge/bakım uyarılı araçlar. `Not Ready` ve `open damage` diğer Availability gruplarıyla örtüşebilir; KPI'lar toplanıp "total" sayılmaz.
- Ana görünüm: geniş, profesyonel, hızlı taranabilir tablo; isteğe bağlı daha görsel kompakt kart/görünüm geçişi **aynı filtre ve data state'ini** kullanır. 1440/1024/768 genişliklerinde kritik bilgi kaybolmaz; web responsive'dir, native mobil uygulama değildir.
- Liste satırı: tek aktif profil fotoğrafı veya nötr placeholder; plaka/araç kodu, marka-model, tanımlı model yılı/özellikler varsa, sınıf, **Internal/External** etiketi, operasyonel branch, en son konum, current odometer, **seçili as-of anındaki** Availability, Readiness, aktif Rental veya bir sonraki Reservation tarihi, önemli belgesel/bakım/hasar blocker sayısı; durumu kısa ama açıklanabilir gösterir.
- Profil fotoğrafı **en fazla 1 aktif**; fotoğrafın olmaması availability/readiness engeli değildir. Handover/Return/Supplier kanıt fotoğrafları liste thumbnail'ı değildir.
- Satırdan Araç 360° açılır; yetkili ve uygun bağlamda hızlı işlemler `Müsaitliği Gör`, `Rezervasyon Oluştur`, `Kiralama Aç`, `Bakım Planla`, `Hasar Bildir`, `Ceza Kaydet`, `Transfer Başlat`, `Belge Ekle` açılır. Her işlem araç kimliğini prefill eder; gizli yan etki yaratmaz.

### Filtreleme / arama / tablo kullanım standardı

- Arama: plaka, araç kodu, marka-model ve mevcut §59S hızlı arama/QR lookup; isim veya ID üzerinden sahte otomatik plaka tanıma yapılmaz.
- Filtreler: Internal/External kaynak; Vehicle Class; operational/security branch (**Internal Home Branch**, **External seçili Engagement Operating Branch**); current location; internal asset/external engagement state; Availability; Readiness; açık hasar; süresi yaklaşan belge; servis due; planlanan availability tarih aralığı.
- `Şimdi` görünümü **company/branch local as-of timestamp** gösterir. Gelecekteki dönem filtresi seçilirse etiket `Seçili dönem müsaitliği` olur; bugünkü anlık Availability rozeti gelecek rezervasyonla yanlışlıkla `Reserved` olmaz.
- `Available` (tarih aralığında blockersız kullanım) ile `Ready` (teslim kriterleri) ayrı sütun/rozetlerdir. `Ready` olmayan ama boş olan araç görünür; teslim işlemi hard gate uygulayabilir.
- Sort: plaka, sınıf, branch, kilometre, planlanan teslim/iade tarihi, yaklaşan son kullanım/servis/belge tarihi; çoklu currency tutarları tek sayı halinde sort/sum edilmez.
- Filtre seçimi, result count, boş durum, reset ve aramadan detay → geri dönüş çalışır; permission-scope dışındaki araçlar count, export ve aramada da görünmez. Demo role/branch switch yalnız **simüle edilmiş** yetki örneğidir, gerçek güvenlik garantisi değildir.
- Liste bulk sahte lifecycle değişimi sunmaz; var olan kaynak iş akışını atlayıp aynı anda on aracı `Ready`/`Available` yapamaz.

## 13.2 Araç Oluşturma / Düzenleme — kapsamlı ama kontrollü workspace

### İş akışı ve alan grupları

Kullanıcıyı beş farklı ekrana göndermeden mevcut Vehicle master verisini girip kontrol edebileceği, taslak/validasyon durumlarını gösteren geniş bir **WEB form workspace** olmalıdır. Formun sekmeleri veya grupları sidebar değildir.

1. **Araç kimliği:** plaka, varsa araç kodu, marka, model, Vehicle Class; mevcut Vehicle kataloglarında tanımlıysa model yılı, renk, yakıt/şanzıman/kapasite gibi sınıf/araç niteliklerinin seçimi. Bir öznitelik ürün modelinde yoksa uydurma alanı zorunlu yapma, sahte otomobil verisi üretme.
2. **Kaynak / işletme ilişkisi:** `Internal Fleet` mi `External/Supplier Vehicle` mı? Internal için owned / lease / long-term rent gibi edinim bağlamı ve **Home Branch**; external için Supplier/External Vehicle master kimliği, **Sourcing Engagement seçimi** ve o engagement'ın operating branch, confirmed window, supplier return due verileri. External master'a engagement'a özgü ikinci branch/window truth'u yazılmaz.
3. **Konum / operasyon:** kaydedilmiş başlangıç fiziksel konumu, mevcut asset/source lifecycle, initial odometer reading ve event reason. Sonradan konum/odometer current value serbest düzenlenmez; ilgili source event/authorized correction akışı kullanılır.
4. **Belge / readiness bağlantıları:** registration, insurance, inspection, şirket tanımlı gereklilikler; source-linked Document Center eylemleri; başlangıç readiness/checklist linki. Belge veya readiness kendi ikinci edit store'unu burada oluşturmaz.
5. **Fotoğraf / ekipman:** isteğe bağlı **1 aktif** katalog/profil fotoğrafı; araçla birlikte gelen ekipman checklist'ine bağlantı ve yalnız mevcut Vehicle-bound equipment verileri. 4–5 teslim/iade fotoğrafı yaratma ekranı değildir.
6. **Filo girişi/çıkış bağlamı:** Internal edinim türü, tarih, maliyet+ISO currency, varsa başlangıç kilometresi ve source evrakı; satış/filodan çıkarma ancak §59BM lifecycle ve aktif operasyon gate'lerine uygun ayrı gerekçeli action'dır. External için owned-sale alanları gösterilmez.

### Form davranışı

- Required/optional alanları mevcut Vehicle ve Document Requirement policy'sinden gelir; editable vs calculated/read-only ayrımı alan yanında gösterilir.
- Duplicate plaka/araç kodu şüphesinde net **uyarı ve ilgili kayıt bağlantısı** verilir; gerçek şirket/bölge özelinde tanımlanmamış global uniqueness kuralı uydurulmaz.
- Kaydet, Vazgeç, değişiklik var uyarısı, validation summary, in-flight disable, başarılı sonucu gerçek Araç Detay'a açma, düzenleme sonrası geri dönüş ve geri alınamaz işlemlerde onay vardır. Yalnız **tarayıcı demo state'ine** kaydetme yapılır; gerçek server save varmış gibi sunulmaz.
- Already referenced Vehicle, Rental/Reservation, Supplier inspection, invoice/Finance veya historic event içindeki gerçekleri değiştirerek geçmişi rewrite etmez. Tarihi olay düzeltilmesi gerekiyorsa source-specific authorized correction/audit demo event ile yapılır.
- Source type değiştirerek owned Vehicle'ı geçmiş ilişkilere rağmen sessizce supplier Vehicle'a çevirme yok; böyle bir alan mevcut source history'yi bozuyorsa engelle/açık açıklama göster.

## 13.3 Araç Detay Workspace — üst bölüm ve 8 sabit sekme

### Üst bölüm (her sekmede aynı, sticky/kompaktlaşabilir)

**Başlık ve araç kimliği:** büyük tek aktif Vehicle profil fotoğrafı veya placeholder, plaka, araç kodu, marka/model/sınıf, mevcutsa model yılı, kaynak rozeti (`Kendi Filo` / `Dış Kaynak`), Internal asset lifecycle veya External seçili sourcing engagement lifecycle. Kaynak tipi diğer tüm sekmelere de geçerlidir.

**Anlık durum şeridi (as-of timestamp ile):**
- Current Availability (`Available`, `Reserved`, `Rented`, `Maintenance`, `Transfer`, `Unavailable`), `as of: şube yerel tarih/saat`.
- Vehicle Readiness (`Ready / Not Ready / Review Required`) ve kritik blocker'ların açılır nedeni.
- Authoritative current km (Vehicle Odometer events); **yakıt** yalnız en son ilgili inspection'dan *son kaydedilen seviye* olarak, timestamp/source ile gösterilir; sürekli sensör varmış gibi gösterilmez.
- Internal Home Branch **veya** External seçili Engagement Operating Branch; bundan ayrı **Physical Location** ve son güncelleme zamanı.
- Aktif Rental varsa müşteri/rezervasyon/kiralama numarasının izinli özeti ve planlanan iade; yoksa `Aktif kiralama yok`. Sıradaki **Confirmed** Reservation ve tarihi ayrıca görünür; `Pending` gelecekteki araç kapasitesini kilitlemez.
- Anahtar kimde (Key Custody); kritik ekipman eksikleri/inspection farkları; yaklaşan belge ve servis due.
- Gerekli kaynak kaydı yoksa `Henüz kayıt yok / Doğrulanmadı` gösterilir; uydurma Ready, GPS, km, last fuel veya ödeme verisi doldurulmaz.

**Sabit hızlı eylemler:** `Yeni Rezervasyon`, `Kiralama Aç`, `Müsaitliği Kontrol Et`, `Bakım Planla`, `Hasar Bildir`, `Ceza Kaydet`, `Transfer Başlat`, `Belge Ekle`, `Hazırlığı Kontrol Et` ve yetkili `Araç Düzenle`. Kullanıcı yalnız yetkisi ve aracın geçerli durumuna uygun eylemleri görür; kapalıysa tıklama yerine sebebi/koşulu açıkça belirtilir. Eylem başlatmak source state'i kendiliğinden değiştirmez.

**Sekme mimarisi:** Aşağıdaki **8 sekme** Vehicle Detail'in içindedir; yeni sidebar bağlantısı **oluşturulmaz**. Sekme değişimi aynı `VehicleId + selected External Engagement context` üzerinde kalır. Sekme içi tarih/filtre/search state'i URL veya anlaşılır local navigation state ile korunur; geri/ileri ve ilgili Rental/Document/Finance kaynaklarına deep-link çalışır.

### Sekme 1 — Genel Bakış

- `Şu an`: Availability + Readiness + location + active Rental + expected return; statusların kaynak zamanı gösterilir.
- `Sıradaki`: bir sonraki confirmed reservation, bakım randevusu, transfer, supplier window/due ve yaklaşan belge/bakım tarihleri; kaynak bağlantıları.
- `Aksiyon gerektiriyor`: readiness blockers, overdue return/arrival, belge expiry, açık damage/insurance/fine/incident ve ekipman/anahtar discrepancy; eylemi doğuran sebep gösterilir, duplicate incident yaratılmaz.
- `Kullanım özeti`: seçili dönem için kullanım günü, boş gün, servis/unavailable günü ve *hesaplanan denominator* (eligible days) açıklaması. Internal/External kaynakların farklı ownership/sourcing window kuralları gözetilir.
- Özet satırları işlevseldir: `Kiralama Aç`, `Hazırlığı Kontrol Et`, `Belgeyi Aç`, `Bakım Planla`, `Hasarı Gör` ilgili kaynağa gider. Boş/zero gerçekten source state'inden gelir; sahte renkli dashboard kartları yapılmaz.

### Sekme 2 — Müsaitlik & Planlama

- Araç bazında **7 / 30 / 90 gün** presetleri ve özel tarih aralığı; tarih ekseni ve saat granülaritesi mevcut Availability kurallarına uygun. Kullanıcı başlangıç/bitiş branch-local timezone'u görür.
- Görsel bloklar: `Confirmed specific Reservation`, `Rented/active or planned Rental`, `Maintenance`, `Transfer`, `Unavailable`; class-only confirmed demand doğrudan bu Vehicle'a bağlanmadığından **araç rezerve edilmiş gibi** çizilmez. Sınıf kapasite baskısı ayrı açıklayıcı overlay/link olabilir; aynı aracı iki kez tüketmez.
- `Pending` specific vehicle tercihi bloklayıcı değildir; ancak detayda tentative bilgi varsa **non-blocking** etiketi taşır.
- `Available` dönemi yalnız authoritative selected-range projection'dan gelir. **Readiness overlay ayrı:** ileride boş görünen araç güncel teslim hard gate nedeniyle hâlâ Not Ready olabilir.
- Internal için Vehicle Home Branch ≠ projected physical pickup position; mevcut Transfer/one-way/source olaylarından gelecekteki expected physical location dikkate alınır. Source'dan kanıtlanamayan future repositioning kesin kapasite gibi gösterilmez.
- External için future allocatable = confirmed Engagement window; handover = Engagement `Received` + Vehicle `Ready`. Engagement penceresi dışındaki günler şirketin owned fleet availability'si değildir.
- Blok tıklanınca mevcut Reservation/Rental/Maintenance/Transfer açılır. Tarih aralığından `Müsaitliği Kontrol Et` ve uygun ise `Yeni Rezervasyon` mevcut formu VehicleId + range ile prefill eder, Confirm sırasında Availability tekrar doğrulanır.
- Overlap/conflict gösteriliyorsa somut blocker ve etkilenen saatler, gerekirse non-blocking alternative/düzeltme action görünür; yeni bir bağımsız booking engine kurulmaz.

### Sekme 3 — Kiralama Geçmişi

- Aktif, upcoming ve historical Rental/Reservation bağlantıları **ayrı tip ve lifecycle etiketleriyle** listelenir. Reservation ≠ gerçekleşmiş Rental; `Pending/Cancelled` kirada kaldı metriğine girmez.
- Satır: Rental/Reservation no, date range (planned vs actual), pickup/return branches, Customer/Corporate payer izni olan özet, teslim/iade km, toplam kullanılan km, Rental operational state, Finance close state, Contract/signature state, source inspection durumları.
- Satırdan `Kiralama Dosyası`, `Sözleşme`, `Teslim vs İade Karşılaştır`, `Finans` ilgili existing workspace'e bağlanır; Vehicle Detay kendi ikinci Payment/Contract editörünü açmaz.
- Araç swap olan Rental'larda yalnız bu Vehicle'a ait actual occupied interval ve **old-return/new-delivery** inspection evidence'ı gösterilir; öteki aracın kilometresi buraya taşınmaz.
- Olağan dışı `Exception Closed / Loss Closed` kayıtları gerçekte `Returned` yapılmış gibi gösterilmez; recovery evidence ve source incident'ına gidilir.
- Tarih ve durum filtreleri, open/closed kirası, seçili rental row timeline ve empty states; role-scope nedeniyle erişilemeyen Customer/Finance detayları link üzerinden sızmaz.

### Sekme 4 — Araç Durumu & Kontroller

- `Readiness`: nedenleriyle checklist; hazırlık/temizlik ve server değil **paylaşılan web demo domain hesaplama** sonucundan açılan link. Kullanıcı `Hazırlığı Kontrol Et` ile mevcut Preparation/Cleaning workflow'una gider.
- `Inspection history`: normal Rental Handover, normal Return, Supplier Receive/Return ve Vehicle Swap'ın ayrı evidence setleri; her sette event type, actor/time, odometer, **5-sabit-değer yakıt seviyesi**, 4–5 immutable kanıt fotoğrafı, condition notes, linked Damage.
- `Teslim vs İade` fotoğraf/condition, km ve yakıt yan yana; önceki evidence güncellenip üzerine yazılmaz. Araç profil fotoğrafı **kanıt fotoğraflarına karıştırılmaz**.
- `Key Custody`: Ana/Yedek anahtar seti ve kimde, source event, teslim/geri alma zamanı; `Vehicle Equipment Checklist`: mevcut/eksik/hasarlı ve son inspection ile farklar.
- Eksik/kayıp key/equipment varsa source-linked Incident/Damage candidate gösterilir; **müşteriye otomatik Charge** veya otomatik `Ready` oluşmaz.
- Fotoğraf olmadan tamamlandı gibi göstermek yok; asıl Capture/Finalize eylemi ilgili Rental/Supplier inspection workflow'unun photo/evidence gate'lerine gider. Bu sekme ikinci editable inspection truth'u değildir.

### Sekme 5 — Bakım & Lastikler

- `Geçmiş / Açık / Planlanan / Geciken` Maintenance records, planlanan başlangıç/bitiş, provider, summary, completion ve **actual source cost + ISO currency**; Maintenance `Overdue` derived flag'dir, yeni lifecycle state değildir.
- Per Vehicle/Class `N km / N months / whichever first` service schedule templates; authoritative odometer ile `son servis/km`, `bir sonraki due`, `due in km/days` açıklamaları.
- Cleaning/preparation checklist ve latest state; `Completed Maintenance` =/= `Vehicle Ready`.
- Tire/season events: yaz/kış/dört mevsim, takılı ve varsa saklanan set, değişim tarihi/km, DOT alanı varsa, next due. Lastik gerçek service cost **linked Maintenance (Tire Service)** kaydından derived/read-only; farklı edit alanı açılmaz.
- `Bakım Planla` aracı prefill eder, `Servisi Gör` mevcut Maintenance Detail'e gider; bağlı Expenses aynı source için ikinci maliyet toplamı üretmez.

### Sekme 6 — Belgeler & Riskler

- Registration/ruhsat, insurance, inspection/muayene, şirket tanımlı Vehicle/Supplier documents: tür, issue/expiry, version, related source, due days, missing/expired, gösterim/indirme erişimi.
- `Belge Ekle / Versiyonu Aç`: tek Document Vault/Document Center source üzerinden ilerler; geçmiş Rental File'a pinlenmiş belge versiyonlarını değiştirmez.
- `Açık riskler`: damage cases, fines, Insurance Claims, linked roadside/Incident ve relevant readiness blockers. Her biri sahip domain status, event date, açıklama, source link ve izinli action ile listelenir.
- `Hasar Bildir`, `Ceza Kaydet`, `Olay Aç` mevcut ilgili Operasyon modülü formunu VehicleId prefilled açar; hasar tutarı, fine payment veya insurance liability burada ikinci editable truth olarak tutulmaz.
- Notification/Alert/Command Center uyarıları aynı source'a işaret eder; aynı problemden altı farklı olay kaydı türetilmez. Legal/doc validity otomatik doğrulandı iddiası yoktur.

### Sekme 7 — Finans & Performans

- **Yetkiye bağlı** araç bazlı read-only financial projection; Finance yetkisi yoksa fiyat/ödeme/komisyon/supplier maliyeti ve toplamları gizlenir, yalnız operasyonel performans kalır.
- Seçili dönem/branch/currency filtreleri; factual `Rental Charge` (booked/actual ayrımı), tahsilat (incoming Payment allocations), outstanding, valid refunds/corrections, source-linked costs (Maintenance, Roadside, Cleaning, Fine Expense, Supplier Settlement) **farklı ekonomik kategoriler olarak** gösterilir.
- `Charge` ≠ `Payment`; aynı Rental'ın Split Tender 3–4 kişi ödeme satırı "üç kira" sayılmaz; Customer/Corporate Payment dışındaki Partner/Supplier outgoing veya insurance recovery collection'a katılmaz.
- Para birimi kırılımı zorunludur: ``EUR`` ve ``BAM`` net biçimde ayrı; karşılaştırmalı tek raporlama para birimine geçiş istenirse yalnız explicit rate set/date/versiyon ve "converted for analysis" etiketiyle. Tarihsel payment FX snapshot rewrite edilmez.
- `Vehicle Cost History` yalnız authoritative source-linked costs'tan proje edilir; Damage repair cost linked Maintenance üzerinden, supplier cost Supplier Settlement üzerinden, Tire cost linked Maintenance üzerinden **bir kez** sayılır.
- `Kullanım / idle / unavailable / maintenance` gün/saat analizi açık denominator/date/eligible-window ile gösterilir; External sourcing window outside günleri owned-fleet utilization'a dahil edilmez.
- `Brüt katkı` ancak tanımlı Charge/Supplier Cost aynı currency'de uygun compare varsa; tam muhasebe yokken `Net Kâr` veya hayali "AI ROI" hesaplanmaz. Boş maliyet kaydı `0 masraf` diye kesin bilgi sayılmaz.
- `Rental Finance`, `Masraf kaynağı`, `Supplier Settlement` ve `Filo Analizi` source-detail deep-link'leri; Vehicle ekranında ikinci Charge/Payment/FX Rate editörü yoktur. Kur editörü yalnız `Yönetim → Ayarlar → Döviz Kurları`.

### Sekme 8 — Konum & Geçmiş

- Authoritative Vehicle Location event timeline: `branch / in transit / with customer / service provider / supplier`, source event, actor, timestamp, previous→next location. **Canlı GPS değildir.**
- Transferler: source/target, planned/actual departure/arrival, start/end km/fuel, state ve originating operation link; **Home Branch'in transferle otomatik değişmediği** gösterilir.
- Odometer event history: acquisition/initial, handover, return, swap, maintenance, transfer, supplier receive/return; km, occurred-at, source type/id, authorized correction/audit; **current odometer tarihsel event stream'den derived**.
- Internal Vehicle için acquisition/source type/ownership (owned/lease/long-term rental), vendor/evidence, lifecycle exit (sold yalnız owned için, disposed fleet exit) ve gerçekten var olan monetary facts.
- External Vehicle için reusable master identity ve **her engagement ayrı window, operating branch, supplier due, receive/return history**. Archived engagement yeniden açılmaz; yeni alım yeni engagement yaratır. Owned sale/disposal UI external araca gösterilmez.
- Önemli source state transitions, güncellemeler ve aktör işlem geçmişi `İşlem Geçmişi/Audit` deep-link'iyle okunur. Tarihsel source'lar sessizce overwrite edilmez.

## 13.4 Contextual araç eylemleri — tıklanınca ne olacak?

Araç 360°'de `Belgeler & Riskler` ve `Bakım & Lastikler` sekmelerinde yetkili kullanıcı `A4 Araç Durum Raporu`, `Servis Sevk / İş Emri` ve `Sigorta Hasar Dosyası Özeti` ön izleme/yazdırma/PDF aksiyonlarını görür. Bunlar sırasıyla Inspection/Vehicle, Maintenance, Damage/Incident ve ilgili Insurance Claim **kaynaklarına bağlanan çıktılardır**; yeni sidebar modülü veya bağımsız poliçe/masraf kaydı oluşturmaz (§84.4–84.6).

| Kullanıcı eylemi | Açılacak kanonik akış | Önden dolu context | Gate / dürüst davranış |
|---|---|---|---|
| Yeni Rezervasyon | `Operasyon → Rezervasyonlar` create workspace | VehicleId/class, seçili tarih, pickup branch | Pending hold yapmaz; Confirm Availability recheck; conflict 409 UI |
| Kiralama Aç | `Operasyon → Kiralamalar` direct create | VehicleId, seçili period/branch | specific Vehicle zorunlu; driver/doc/availability/credit gate'leri ve Delivered flow korunur |
| Müsaitliği Kontrol Et | bu araçtaki Sekme 2 / canonical Availability view | VehicleId + requested interval | source blocker, future/current ayrımı ve readiness overlay |
| Bakım Planla | `Operasyon → Bakım & Servis` create | VehicleId, applicable odometer/current branch | Maintenance tek service-cost truth'u |
| Hasar Bildir | `Operasyon → Hasar Kayıtları` create | VehicleId + varsa Rental/inspection source | permission, evidence, one linked customer Charge policy |
| Ceza Kaydet | `Operasyon → Ceza Modülü` create | VehicleId + varsa Rental | authority fine vs customer payment ayrılır |
| Transfer Başlat | Vehicle Transfer source workflow | VehicleId + current location | transfer Availability block; Home Branch edit değildir |
| Belge Ekle | `Kayıtlar → Belge Merkezi` contextual upload | VehicleId / document type | version history, requirements, access masking |
| Hazırlığı Kontrol Et | Vehicle Preparation/Readiness workflow | VehicleId + due Rental if any | checklist completed != Rental Delivered/Ready automatically |
| Görev Oluştur / Olay Aç | existing Task/Incident create | VehicleId + context | source lifecycle otomatik değişmez |
| Araç Düzenle | §13.2 edit workspace | VehicleId | authorized master edits, source events overwrite edilmez |

- Action placement: desktop'ta en sık 3–4 işlem header'da, diğerleri kompakt `Diğer İşlemler` menüsünde; ilgili sekmelerde contextual CTA tekrar sunulabilir ama **aynı source action** kullanılır.
- Source açıldığında ekranda "bu araçtan geldiniz" context'i korunur; kaydet/iptal sonrası aynı vehicle/sekme/tarih filtresine geri dönülebilir. Görev ve incident auto-create yapılmaz.
- İzin yoksa manipüle edilebilir boş action gösterilmez; disabled ise sebep yazılır. External/Disposed/Rented/Not Ready durumlarına aykırı eylem `başarılı` gibi simüle edilmez.

## 13.5 Ekran durumları / görsel kalite / web-konsept dürüstlüğü

- Ana yerleşim: gerçek B2B yoğunluğu olan **sol kimlik + durum şeridi + hızlı işlemler + sekmeli workspace + context side panel**. 1440/1024/768 responsive web; devasa kart, yatay sonsuz kaydırma ve aşırı boş alan kullanılmaz.
- Çakışan durumlar birleştirilmez: `Asset/Engagement lifecycle` ≠ `Availability` ≠ `Readiness` ≠ `Physical Location` ≠ `Key Custody` ≠ `Finance Close`.
- Her sekmede: loading (demo state hazırlığı), empty (source record yok), populated, not-permitted, changed-since-open/conflict, input validation, cancel/unsaved-change, success-feedback ve source drill-down durumları. Offline/sync veya gerçek zamanlı cloud push varmış gibi söz verilmez.
- Aktif Rental yoksa `Aktif kiralama yok`; supplier engagement yoksa `Aktif tedarik dönemi yok`; kilometre kaynak okuması eksikse `Km doğrulanmadı`; finans yetkisi yoksa `Finans detayları için yetki gerekli`. Sıfır veri uydurulmaz.
- Aynı Vehicle'da `Kiralama`/`Transfer`/`Bakım` olayları tıklanabilir zaman çizelgesiyle bağlantılanır. Data source tek shared **browser demo state** ve pure calculation functions'tır: gerçek backend yok.
- Fotoğraf yükleme/ön izleme tarayıcıda gerçek çalışır; yüklendi/kalıcı cloud storage'ye kaydedildi diye yanlış bildirim yok. Demo storage limit/refresh ve Reset Demo etiketleri global kurallara uyar.

---

# 14. BAKIM & SERVİS

List/dashboard:
- Planned
- In Progress
- Completed
- Overdue (derived flag; lifecycle status değildir)
- this week
- upcoming km service
- estimated open cost
- actual monthly cost

Create:
- vehicle
- type
- title
- provider
- planned date
- estimated cost

Lifecycle:
Planned
→ In Progress
→ Completed
veya Cancelled

`Overdue` ayrı lifecycle status değildir; planned due date geçmiş ve kayıt Completed/Cancelled değilse derived flag'dir.

Completion:
- actual service cost (Maintenance source cost)
- ending km

Maintenance actual service cost'in source-of-truth'u Maintenance kaydıdır.
Expense ledger'da finansal posting gerekiyorsa source-linked Expense oluşturulur ve tutarı Maintenance source cost'tan gelir; bağımsız ikinci amount girilemez.

**Servis Evrakı:** Planned/In Progress Maintenance Detayında `A4 Servis Sevk / İş Emri Hazırla` eylemi Vehicle bilgileri, km, bildirilen arıza, servis sağlayıcısı, planlanan zaman, linked photos/inspection, onay/teslim imza alanlarıyla kaynak kayıttan doldurulur. `Yazdır` veya gerçekte üretilen `PDF İndir` desteklenir; bu belge Maintenance status'unu kendiliğinden `Completed` yapmaz. §84.4–84.6.

Completed ≠ Ready.

---

# 15. OLAY MERKEZİ

Manual case management.

Categories:
- customer complaint
- roadside
- accident operational follow-up
- lost key
- disputed handover
- service-quality issue
- security/property
- other

Severity:
- Low
- Medium
- High
- Critical

Lifecycle:
Open
→ Investigating
→ Resolved
→ Closed

Fields:
- title
- category
- severity
- occurred
- reported by
- assignee
- source
- description
- notes
- evidence
- resolution

Incident source link:
Rental / Vehicle / Customer / Damage / Fine / Maintenance etc.

Resolve Incident ≠ resolve source domain.

---

# 16. MÜŞTERİLER

Liste:
- name
- phone
- residency
- linked Corporate Account varsa bilgi
- document readiness
- open balance indicator
- latest rental
- status

Create:
- name
- phone
- email
- Local / Foreign
- basic contact data

Detail:
- identity/contact
- documents
- current document readiness
- reservations
- rentals
- open balance
- tasks/incidents
- notes
- audit link

Duplicate warning:
name/phone/email similarity.

Kara liste/risk ifadeleri:
numeric arbitrary score yok.

---

# 17. KURUMSAL HESAPLAR

List:
- company
- status
- credit limits by currency (`CreditLimit[]`: currency, amount; bir currency için en fazla bir aktif limit)
- exposure by corresponding currency
- outstanding by currency
- settlement status

Detail:
- company info
- linked employees/drivers
- linked person/driver records identity/document gerekiyorsa Customer/person kaydına referans verir; ayrı duplicate identity store oluşturmaz
- pricing agreement
- `CreditLimit[] { currency, amount }` (yetkili kullanıcı düzenler; audit)
- current exposure separately for each configured currency
- statement grouped by currency
- settlements
- rentals

Credit limit override:
Approval Center.

Override one-time + exact Reservation/Rental amount + currency.

Credit limit/exposure comparison never cross-sums currencies. Corporate Account için `CreditLimit[]` benzersiz currency anahtarıyla tutulur. Yeni corporate credit commitment istenen currency için aktif limit tanımlı değilse **limitsiz kredi varsayılmaz**; credit işlemine izin verilmez veya exact source/currency için Corporate Credit Override gerekir.

## Corporate Exposure — authoritative formula

Her currency için:

**Exposure = Posted Outstanding Corporate Receivables + Unbilled Committed Amount**

`Posted Outstanding Corporate Receivables`:
- Corporate payer'a bağlı posted Charges
- eksi bu charge'lara uygulanmış Payments/Credits/valid Corrections

`Unbilled Committed Amount`:
- Confirmed corporate Reservations'ın authoritative pricing snapshot'ında henüz Charge'a dönüşmemiş tutarı
- Corporate Rental `Prepared / Delivered / Returned / Closed` durumlarındayken authoritative commercial snapshot'ındaki henüz Charge'a veya Corporate Receivable'a taşınmamış commitment (operasyonel Rental Closed tek başına exposure'dan düşürmez)
- Rental `Cancelled` ise henüz Charge doğurmamış commitment serbest bırakılır; uygulanabilir cancellation fee kendi Charge source'unda takip edilir
- aynı component Charge'a/Corporate Receivable'a dönüştüğü anda unbilled committed taraftan düşer; iki kez sayılmaz

Hariç:
- Pending/Cancelled/No-show Reservation
- released/held Deposit (uygulanmadıkça exposure azaltmaz)
- Supplier payable
- Partner commission
- başka currency

Credit check (her currency kendi içinde):
`Exposure excluding the current edited/converted source commitment + proposed new/updated commitment <= CreditLimit[currency]`

Update/conversion'da mevcut Reservation commitment'ı iki kez eklenmez; Reservation → Rental dönüşümünde unbilled commitment aynı transaction'da source identity korunarak taşınır. Posted Charge oluşturulan kısım commitment'tan düşer.

Aşım:
- Reservation/Rental policy'ye göre block veya Corporate Credit Override Approval gerektirir
- override exact amount + currency + source Reservation/Rental için geçerlidir
- override şirketin credit limit'ini sessizce değiştirmez

**Domain boundary:** Customer/person ≠ Corporate Account. Corporate Account commercial payer/credit/pricing context'idir; kişi kimliğini duplicate etmez.

---

# 18. TALEP MERKEZİ

Lead lifecycle:
New
→ Contacted
→ Quote Prepared
→ Waiting Customer
→ Accepted
→ Converted
veya Lost / Closed

Lead:
- source
- customer/contact
- requested dates
- class
- notes
- partner attribution

Quote:
- versioned
- price snapshot
- conditions
- expiry
- previous versions preserved

Accepted quote:
→ Reservation

Price changed:
explicit confirmation.

---

# 19. PARTNERLER

Internal partner management.

List:
- partner
- status
- commission setup
- attributed leads
- earned
- paid (**Finance / Partner Commission Payment'tan derived, read-only**)

Detail:
- contact/company
- commission
- portal access
- leads
- reservations/rentals read views
- commission history
- paid/outstanding values Finance hareketlerinden derived edilir; Partner domaininde ikinci editable payment truth'u tutulmaz

Earned ≠ Paid.

## Commission earning trigger

Her Partner commission configuration şu authoritative trigger'ı taşır:
- `Rental Delivered` (ACARVO_V1 default)
- `Rental Closed`
- `Financially Closed`

Kural:
- trigger config açıkça seçilmemişse default = `Rental Delivered`
- sadece Partner'a attributed olan ve gerçek Rental'a dönüşmüş iş commission kazanabilir
- Lead / Quote / Reservation tek başına Earned commission oluşturmaz
- trigger olayı gerçekleştiğinde commission **bir kez** Earned olur
- sonradan cancellation/refund/correction commission etkiliyorsa normal kaydı sessizce rewrite etmez; Partner Commission Adjustment approval workflow kullanılır
- Paid ayrı finance/payment lifecycle'ıdır

---

# 20. FİYATLANDIRMA

**WEB konsept güncellemesi:** global ISO 4217 transaction currency, günlük/haftalık/aylık tier, rental duration policy, tax inclusive/exclusive, insurance package ve ayrı payment-tender FX hesapları §62–70 uyarınca bu sayfanın parçasıdır.


Single pricing source for:
- quote
- reservation
- rental

Vehicle Classes:
- class name
- attributes
- base pricing inputs

Price simulation:
- dates
- class
- branch
- **transaction currency**
- discount
- extras
- final authoritative preview

## Pricing currency rule
Her Quote / Reservation / Rental tek bir **transaction currency** taşır.

- base-rate, season, one-way, extra, **seçili kiralama koruma/sigorta paketi fiyatı**, ek sürücü ücreti, fixed discount, mileage, tax ve final-total bileşenleri aynı transaction currency içinde olmalıdır; sigorta ücreti yalnız o transaction currency için aktif, eşleşen **explicit price row** ile hesaplanır (§70, §84, §85.1)
- percentage discount/markup currency-neutral olabilir
- farklı currency'deki component otomatik çevrilmez; **payment tender/admin collection FX** hiçbir zaman eksik sigorta veya başka pricing component fiyatının yerine geçmez
- gerekli component transaction currency için tanımlı değilse ilgili **ücretli seçenek seçilemez** ve fiyatlandırmayı gerektiren işlem bloklanır; UI eksik component, para birimi, branch/class ve tek yetkili ayar bağlantısını açıkça gösterir (included/free seçeneği `0` kayıtlıysa farklıdır)
- company default currency yalnız form default'udur

Extras Catalog:
- name
- description
- active
- pricing mode
- price
- currency
- max quantity
- order

Fiyat hesabı her component içinde kopyalanmaz; web konseptte tek paylaşılan priceQuote domain calculator kullanılır.

## Authoritative pricing snapshot provenance
Quote/Reservation/Rental pricing snapshot en az şunları pinler:
- transaction currency
- Vehicle Class rate/version
- Season rule/version
- Branch/one-way rule/version
- Corporate Agreement version + mode varsa
- Extras unit-price snapshots
- mileage terms
- discount/approval reference
- calculated at / pricing version

Pricing configuration sonradan değişse bile historical snapshot rewrite edilmez.

---

# 21. ONAY MERKEZİ

Six core types:

1. High Discount
2. Deposit Exception
3. Refund
4. Financial Correction
5. Corporate Credit Override
6. Partner Commission Adjustment

Lifecycle:
Requested
→ Approved / Rejected
→ Applied (only if approved)

Four-eyes:
requester cannot be reviewer.

Approved ≠ Applied.

UI clearly shows:
- requested by
- reviewed by
- decision
- applied by
- timestamps
- requested change summary

## Approval vocabulary boundary
`Approval Center` yalnız yukarıdaki 6 formal approval type'ı içerir.

Diğer akışlardaki:
- contract staff approval
- extension manager confirmation
- fuel-threshold manager confirmation
- operational confirm/acknowledge

formal Approval Center kaydı değildir; kendi domaininde permission-gated workflow action'dır.

Yeni Approval Center type kullanıcı kararı olmadan icat edilmez.

---

# 22. KURALLAR

Bu ekran yalnız safe IF/AND/OR/THEN notification/risk action kataloğudur. Finans/vergi/kur/sigorta/depozito business policies için tek UI editor Settings/Agreement/Approval Center'dır; hard policy'ler Rule Builder tarafından override edilmez (§74).


Business-readable policy engine.

UI grammar:
IF
condition

AND/OR
condition

THEN
action/policy result

Features:
- list
- create
- versions
- preview
- activate
- deactivate
- archive
- history

Old version never rewritten.

---

# 23. GELİR KONTROLÜ

Purpose:
financial leakage / anomaly detection.

Examples:
- suspicious discount
- missing expected collection
- unexpected financial gap
- deposit mismatch if policy supports

Must:
- factual source
- explain reason
- link to source
- no fake “saved money”

---

# 24. OPERASYON RİSKLERİ

**Canonical erişim: Kontrol & Analiz → Riskler ve İstisnalar → Operasyon Riskleri sekmesi (§4).** Ayrı sidebar başlığı açılmaz.

Derived operational risk signals.

Examples:
- conflicting allocation
- insufficient turnaround
- unavailable vehicle
- readiness problem near delivery

Must:
- deterministic
- explain exact reason
- link to source
- no persisted duplicate incident

---

# 25. RİSK VE İSTİSNALAR

**Canonical erişim: Kontrol & Analiz → Riskler ve İstisnalar → İstisna İnceleme sekmesi (§4).** Bu eski domain kabiliyeti, Operasyon Riskleri sekmesiyle aynı menüde korunur.

General exception review.

Purpose:
system-detected exceptions that require inspection but are not manual incidents.

Must remain distinct from Incident Center.

No numeric customer risk score.

---

# 26. KAPASİTE PLANLAMA

Shows:
- branch
- class
- day
- available capacity
- reserved demand
- constrained/full periods
- lost leads where source supports

No future-demand AI forecast unless explicitly added later.

---

# 27. FİLO ANALİZİ

Factual fleet analysis:
- utilization
- idle duration
- branch distribution
- maintenance frequency/cost
- rented/available/readiness
- mileage facts

No arbitrary health score.

---

# 28. FIRSATLAR

Deterministic opportunity detection:
- possible upsell based on real context
- capacity gap
- fleet distribution opportunity
- commercial follow-up

Must show:
- why detected
- source
- suggested human action

No fake AI.

---

# 29. RAPORLAR

Eight core families:

1. Financial
2. Rental
3. Fleet
4. Commercial
5. Branch
6. Corporate
7. Partner
8. Maintenance / Damage / Fine

Filters:
- date
- branch
- currency where relevant

Rules:
- derived live
- no persisted fake snapshots
- no cross-currency sums
- no “Net Profit” unless accounting is complete
- tables available even if charts exist

---

# 30. FİNANS

**Global WEB V1 finans kapsamı:** split/multi-payer/multi-method Incoming Payments, Reservation Advances, Payment Schedules, Branch Cash Drawers, accepted ISO currencies, manual FX Rate Desk ve Tax breakdown bu merkezin gerçek konsept alt görünümleridir (§62–78).


Operational Finance Center.

Summary:
- Gross Charges
- Payments
- Refunds
- Outstanding
- Deposits Held
- Deposits Applied
- Deposits Released
- open/closed rental counts

By currency.

Feed:
- Charge
- Customer/Corporate Payment
- Refund
- Deposit
- Correction
- Insurance Recovery
- Partner Commission Payment
- Supplier Payment
- Financial close / reopen

Separate sections:
- Corporate Receivables
- Partner Commission Obligations
- Supplier Vehicle Payables / Settlements
- Supplier Security Deposits
- Insurance Recoveries

## Money movement direction semantics
- **Customer/Corporate Payment** = customer/corporate payer'dan gelen tahsilat
- **Supplier Payment** = Supplier Settlement'a karşı giden ödeme; customer collection değildir
- **Partner Commission Payment** = Partner Commission obligation'a karşı giden ödeme; customer collection değildir
- **Insurance Recovery** = insurer'dan gelen recovery; Customer Payment değildir
- **Deposit Held/Released/Applied** = Payment/Refund değildir
- Dashboard/Reports içindeki `Collections / Tahsilat / Payments` metriği yalnız Customer/Corporate incoming payments'ı içerir

Charge source:
- Rental kaynaklı olabilir
- Reservation no-show/cancellation kaynaklı olabilir
- sourceType/sourceId zorunludur
- aynı source event için idempotent olarak tek Charge oluşur

Never double count.

---

# 31. MASRAFLAR

Operational expense ledger.

Lifecycle:
Draft
→ Posted
→ Voided

Fields:
- date
- branch
- category
- vendor
- description
- amount
- currency
- reference
- notes

Posted:
not freely rewritten.

Avoid duplication:
- maintenance source cost
- roadside source cost
- cleaning/preparation source cost
- refund
- damage customer charge
- fine charge
- partner commission
- Supplier Settlement içinde zaten kayıtlı external vehicle cost

## Source-linked Expense kuralı

Operational source kendi gerçek maliyetini tutuyorsa:
- Expense kaydı `sourceType + sourceId` ile o kayda bağlanır
- Expense amount/currency source'tan gelir ve source-linked posting üzerinde bağımsız business truth olarak değiştirilemez
- aynı source için duplicate posted Expense engellenir
- Expense lifecycle (Draft/Posted/Voided) finansal posting durumunun otoritesidir
- source cost ile Expense posting status birbirine karıştırılmaz

Supplier Vehicle Cost için source-of-truth Supplier Settlement'tır; ayrıca Expense oluşturulmaz, expense reporting bu kayıttan projection olarak türetilir.

Aynı maliyet iki ledger/subledger üzerinde tekrar post edilmez.

---

# 32. SÖZLEŞMELER

Templates:
versioned templates; şirketin ayarladığı logo/antet, belge dili, şube/taraf bilgileri, **görsel alan/blok editörü, zorunlu placeholder doğrulaması ve tarayıcı-demo numara serisi (§85.3)** ile §83.2 zorunlu alanlarla okunabilir ön izleme. Şablon değişikliği geçmiş issued sözleşmeye uygulanmaz.

Issued contract:
linked to Rental.

Versions:
immutable.

New version:
does not inherit signature.

Signature:
- customer signature capture is separate from staff approval
- müşteri personelin açtığı aynı web ekranında imza canvas'ına dokunarak/fareyle imza atabilir; aynı workflow'daki `Yazdır` ile ıslak imza alternatifi vardır (§83.4)
- Contract staff approval kendi domainindeki permission-gated workflow action'dır; Approval Center type değildir
- issued/signed content immutable; tekrar düzenlemek için yeni version ve gerekiyorsa yeni imza gerekir
- no customer-facing signature URL/page is created in ACARVO_V1

List:
- Rental
- customer
- version
- signed?
- staff approved?
- status

---

# 33. BELGE MERKEZİ — HEDEF YENİDEN TANIM

Mevcut kapsam dokümanında birleşik belge ekranı çalışmıyordu. Web konsept hedefinde bu ekran **ikinci dosya deposu olmayacak**.

Amaç:
Vault'taki gerçek belgelerin şirket-geneli arama/index ekranı.

Gösterir:
- owner type
- owner reference
- document type
- version
- uploaded at
- uploaded by
- status
- expiry where applicable

Filtre / owner kapsamı:
- customer
- vehicle
- external vehicle
- rental
- contract
- damage
- insurance claim
- fine
- maintenance
- incident
- vehicle supplier
- sourcing request (doküman bağlıysa)
- sourcing engagement / supplier inspection (doküman bağlıysa)
- document type
- expiry
- date

Aksiyon:
- source record'a git
- authorized preview/download

Belge truth yine kendi owner kaydında kalır.

---

# 34. HASAR KAYITLARI

**Canonical sidebar: Operasyon → Hasar Kayıtları (§4).** Kayıtlar altında ikinci entry yoktur.

Dashboard:
- open
- critical
- liability pending
- chargeable amount
- oldest open age

Create:
- vehicle
- rental optional
- severity
- description
- critical
- estimated amount
- evidence

Damage case lifecycle:
Reported
→ Investigating
→ Liability Determined
→ Closed

Repair progress Damage içinde ikinci service lifecycle olarak tutulmaz.

Repair gerekiyorsa:
- Damage → linked Maintenance/Repair job
- `Repair Waiting / In Progress / Completed` görünümü linked Maintenance'tan derived edilir
- actual repair service cost Maintenance source cost'tan okunur
- Damage kendi başına ikinci `actual repair cost` truth'u üretmez

Liability:
Customer / Company / Insurance

Customer charge:
confirmed liability amount once only.

**Sigortaya sunulacak A4 dosya:** `Sigorta Dosyası Özeti Hazırla` eylemi Damage/Incident + varsa Vehicle Insurance Claim/poliçe referansını, olay zamanı, araç, sürücü/rental yetkili bilgileri, hasar şeması pinlerini, gerçek kanıt fotoğraflarını ve talep edilen ekleri source-linked ön izler. Sigortacıya otomatik başvuru yapılmış, tazminat kabul edilmiş veya ödeme alınmış gibi davranılmaz. `Yazdır / PDF İndir / Harici Paylaşım için Hazırla` işlevi §84.5–84.6 sınırına tabidir.

---

# 35. CEZA MODÜLÜ

**Canonical sidebar: Operasyon → Ceza Modülü (§4).** Kayıtlar altında ikinci entry yoktur.

Create:
- vehicle
- type
- reference
- date
- amount + currency
- due date

Duplicate reference guard.

Rental suggestion:
fine date overlaps Rental period.

Staff chooses.

Fine lifecycle:
Recorded
→ Liability Pending
→ Liability Determined
→ Closed

Liability result:
- Customer
- Company
- Disputed

Authority settlement status:
- Unpaid
- Paid

Bu `Paid` müşterinin ACARVO'ya ödeme yaptığı anlamına gelmez; cezanın ilgili kuruma settlement durumudur.

Kurallar:
- Fine statutory amount/reference Fine domain truth'udur
- company otoriteye ödeme yaptıysa payment reference/status kaydedilir ve gerekiyorsa source-linked Expense posting oluşturulur
- source-linked Expense amount Fine statutory/company-paid amount'tan gelir; ikinci editable amount değildir
- customer liability varsa Customer Charge yalnız bir kez oluşturulur
- müşterinin ACARVO'ya bu Charge'ı ödeyip ödemediği yalnız Finance Payment/Outstanding'tan okunur
- Company Absorbed customer Charge oluşturmaz

---

# 36. İŞLEM GEÇMİŞİ

**Canonical sidebar: Kayıtlar → İşlem Geçmişi (§4).**

Audit Viewer.

Shows:
- time
- actor
- action
- module/entity
- safe summary
- source link

Filters:
- date
- actor
- module
- action
- entity
- search

Read-only.

No secret payloads.

---

# 37. ŞUBELER

List:
- name/code
- status
- vehicles
- capacity summary

Detail:
- vehicles
- upcoming operations
- capacity
- staff access
- basic branch data

Branch affiliation separate from vehicle physical location.

---

# 38. KULLANICILAR

List:
- name
- status
- role
- branch scope
- last successful sign-in/session activity yalnız authoritative auth/session verisi varsa; yoksa alan gösterilmez, fake değer üretilmez

Create/Edit:
- identity
- login
- role
- branch scope
- active/inactive

No hardcoded role behavior in UI.

---

# 39. ROLLER VE YETKİLER

Matrix:
module × actions + company/branch/data scope; rolün verdiği izinler ve patronun kullanıcıya uyguladığı explicit daraltma/ek yetki tek `effective permission` ön izlemesinde birleşir (§83.5).

Examples:
- view
- create
- edit
- assign
- complete
- approve
- apply
- post
- void
- manage

Permission/scope davranışı paylaşılan web demo state üzerinden açıklanır; gerçek production backend yetkilendirmesi varmış gibi gösterilmez.

Frontend yalnız demo UX içinde gizler/devre dışı bırakır; menü, detay, arama, rapor, export, işlem bağlantısı ve hassas alan maskesi **aynı effective permission** sonucunu kullanır. Yetkisiz kaynağın sadece butonu gizlenip verisi listeden sızdırılmaz (§83.5).

Permission changes should refresh current session on safe bootstrap, not remain stale forever.

---

# 40. AYARLAR

**Canonical menü konumu: Yönetim → Ayarlar (§4).** Kullanıcı menüsüne ikinci Ayarlar bağlantısı eklenmez.

**Global Web V1:** Company & Localization, Para Birimleri, Döviz Kurları, Vergi, Kiralama Süresi, Sigorta Paketleri, Driver Eligibility, Kasa/Vardiya, Deposit/Refund/Payment, Document Policies, Contract Languages, Approval Thresholds, Privacy; menü ve typed policy owner eşlemesi §74, §78.4.


Settings iki tür tercihi açıkça ayırır:

- **Company-wide settings:** tek demo company state içinde tutulur; production persistence/scope iddiası yoktur.
- **Browser-local preferences:** açıkça “Bu tarayıcıda” etiketiyle gösterilir.

Unsupported/deferred bir ayar için fake save gösterilmez.

Ayrıntılı ve authoritative Settings kapsamı **59F. AYARLAR — TAM ÜRÜN EKRANI** bölümündedir.

Dedicated CRUD sayfaları authoritative kalır:
- Şubeler
- Kullanıcılar
- Roller ve Yetkiler

Settings bunları duplicate etmez; yalnız ilgili yönetim ekranlarına link verir.

---

# 41. INTERNAL / EXTERNAL ACTOR BOUNDARY

- Internal Web ve ACARVO Staff yalnız yetkili çalışan oturumu kullanır.
- Partner Portal, internal staff session'ından ayrı partner credential/session kullanır.
- Müşteri ACARVO_V1 kullanıcısı değildir; müşteri imzası yalnız personel tarafından yönetilen Web/Staff ekranında alınır.
- Partner kimliği Customer veya Vehicle Supplier kimliğiyle aynı rol/depo olarak yeniden kullanılmaz.

---

# 42. CUSTOMER-FACING SURFACES — V1 YOK

ACARVO_V1 içinde müşteriye açılan hiçbir ürün yüzeyi yoktur:
- Public Booking yok
- Customer Portal yok
- Customer self-service/native application yok
- customer self-service yok
- external contract-signing page yok

Müşteri işlemleri şirket personeli tarafından internal Web veya ACARVO Staff üzerinden yürütülür.


# 43. PARTNER PORTAL

Responsive web-friendly.

- dashboard
- create Lead
- attributed Leads
- resulting Reservation/Rental status
- commission earned
- commission paid

Read-only commission.

Partner web context, Company Admin demo contextinden açık şekilde ayrıdır; production session/JWT olduğu iddia edilmez.

---

# 44. SÖZLEŞME İMZASI — INTERNAL CAPTURE

ACARVO_V1 içinde ayrı müşteri imza sayfası/linki yoktur.

Sözleşme imzası gerekiyorsa:
- internal Web veya ACARVO Staff içindeki Contract/Rental akışında alınır
- belirli Contract version'a bağlanır
- müşteri imzası personel onayından ayrı tutulur
- yeni Contract version eski imzayı miras almaz

Müşteriye portal, public URL veya self-service erişimi verilmez.

# 45. GLOBAL SEARCH

Search:
- customer
- vehicle
- reservation
- rental
- corporate
- partner
- vehicle supplier
- sourcing request
- task
- incident

Keyboard:
- open
- arrows
- enter
- escape

Results always go to authoritative detail page.

---

# 46. NOTIFICATIONS

Notification center should surface **real events**, not duplicate business state.

Examples:
- approval requested
- task due
- document expiry
- critical incident
- maintenance due

Notification is a link/alert, not the authoritative record.

---

# 47. CROSS-MODULE CONTEXTUAL ACTIONS

These improve workflow without creating new domains.

Rental:
- Görev Oluştur
- Olay Aç
- Finans Aç
- Sözleşme Aç
- Dosya Aç
- Audit Aç

Vehicle (Araç 360°, §13.4; hepsi aynı canonical domain action):
- Yeni Rezervasyon / Kiralama Aç / Müsaitliği Kontrol Et
- Bakım Planla / Hasar Bildir / Ceza Kaydet
- Transfer Başlat / Belge Ekle / Hazırlığı Kontrol Et
- Görev Oluştur / Olay Aç / Araç Düzenle

Customer:
- Rezervasyon Oluştur
- Görev Oluştur
- Olay Aç

Incident:
- Görev Oluştur

Rule:
context prefilled, source domain not silently mutated.

---

# 48. STATUS DİLİ

Must be semantically distinct:

- Requested / Approved / Applied
- Draft / Posted / Voided
- Earned / Paid
- Returned / Financially Closed
- Completed / Ready
- Resolved / Closed
- Active / Expired / Used / Cancelled
- Open / In Progress / Completed

Turkish primary labels.

Raw enum not shown as main UI.

---

# 49. MONEY & CURRENCY — GLOBAL İLKELER

- Tüm money kayıtları ``amount + ISO currency`` taşır; global currency catalog ve company/branch accepted currencies farklı ayarlardır.
- **Rental/Quote/Reservation transaction currency** tek currency'dir; fiyat/vergi/Charge bu currency'de snapshot olur.
- **Payment tender currency** ödeme satırı başına bağımsız seçilir. Farklı currency ile tahsilat V1 web konseptinde **desteklenir**; Settings'te tanımlı işletme exchange rate snapshot'ı ile borç currency'sine mahsup edilir (bkz. §62–65).
- Exchange rate olmadığı durumda cross-currency allocation bloke edilir, gizli FX/çifte sayım yapılmaz.
- Nakit kasa fiziksel nominal currency tutar; card/transfer nakit kasaya yazılmaz.
- ISO hassasiyeti, rounding, tax net/gross, prepayment/deposit ve incoming/outgoing ayrımı korunur.
- **Canlı banka/piyasa kuru ve gerçek FX/banka/POS entegrasyonu bu UI konseptinin dışında**; şirketin elle tanımladığı işletme kuru prototipte hesaplanır.
- Different currencies cannot be blindly added; explicitly converted reports must show rate/version/date + “converted equivalent” badge.
- Kaynak her finans domainindeki gösterim aynı local demo business-calculation state'ine dayanır; production backend iddiası yoktur.

---

# 50. DOCUMENT POLICY

Customer identity:

Local:
- National ID
- Driver License

Foreign:
- Passport
- Entry Stamp
- Driver License

Corporate exemption yetkili Document Requirement policy sonucuysa bireysel identity gate uygulanmaz; Corporate Account'a Local/Foreign atanmaz. Her Rental kendi applied requirement/exemption snapshot'ını ve mevcut belge version referanslarını saklar; olmayan belgeyi tarihsel dosya için zorunlu ilan etmez.

Rental history:
Rental pins exact document versions.

Vehicle master photo:
- Vehicle başına **en fazla bir aktif** profil/reference fotoğrafı bulunur; hiç fotoğraf olmayabilir
- varsa Vehicle list/detail ve araç seçiminde gösterilir, yoksa nötr placeholder kullanılır
- reservation readiness gate değildir

Rental condition evidence:
- teslimde ayrı 4–5 fotoğraf
- iadede ayrı 4–5 fotoğraf
- ilgili Rental'a historical evidence olarak bağlıdır
- Vehicle profil fotoğrafıyla karışmaz

Contract:
versioned separately.

Archive:
archive ≠ physical delete.

Legal retention duration:
not hardcoded until policy/jurisdiction decision.

---

# 51. EXPLICIT NON-GOALS / DO NOT BUILD

Unless separately approved:

- Customer self-service/native application
- Customer Portal
- Public Booking / customer self-service

- LLM assistant
- fake AI
- arbitrary risk score
- live competitor pricing
- GPS hardware tracking
- ANPR
- paid OCR
- external ID verification
- live flight integration
- eInvoice
- full accounting ledger
- payroll
- bank reconciliation
- gerçek piyasa-kuru servisi / otomatik dış kur entegrasyonu (admin-configured payment FX V1 WEB dahil)
- payment gateway
- generic BI builder
- inventory management for baby seats
- automatic additional-driver-as-extra
- public object storage URLs

---

# 52. UX / VISUAL DIRECTION

ACARVO must feel:

- premium B2B
- operational
- compact but readable
- confident
- not decorative
- not “empty admin template”
- no gradients
- no glassmorphism
- no fake AI glow

Density:
Use space intentionally.

Avoid:
- 7 inputs in one giant row
- huge empty regions
- cards for every tiny field
- giant marketing hero inside internal app

Information hierarchy:
Every screen should make the next action obvious.

---

# 53. Responsive

Internal priority:
- 1440 desktop
- 1024 laptop/tablet landscape
- 768 tablet

Partner Portal responsive priority:
- 390px web viewport
- 768
- desktop

At narrow WEB viewport:
- no horizontal form layout
- table can intentionally scroll if necessary
- primary action reachable
- dialogs fit viewport

---

# 54. Accessibility

Must:
- labels
- visible focus
- keyboard operation
- semantic buttons
- accessible dialogs
- no color-only status
- reasonable contrast
- errors associated with fields

---

# 55. Common states every page must have

1. Loading
2. Empty
3. Success
4. Validation error
5. Yetkisiz DEMO rolü (403 UX only)
6. Kayıt bulunamadı (404 UX only)
7. Eski kayıt / conflict (409 UX only)
8. Demo-domain calculation error (safe explanation)
9. Offline/browser-local state error (no fake server failure)

No raw JSON as primary user message.

---

# 56. End-to-end golden flows

Flow A — Lead to Rental:
Lead → Quote → Accepted → Reservation → Docs complete → Rental → Contract → Internal Signature Capture (gerekiyorsa) → Delivery → Return → Rental Closed

Return sonrasında:
- Finance lifecycle bağımsız olarak Financially Closed olabilir.
- Vehicle readiness bağımsız olarak Ready / Not Ready / Review Required olur.

Flow B — Direct Reservation:
Customer → Reservation → docs later → Rental

Flow C — Direct Rental:
Customer → docs complete → Rental → Contract → Delivery

Flow D — Damage:
Rental → Damage → liability → confirmed charge → Finance

Flow E — Fine:
Vehicle fine → suggested Rental → liability → charge → Finance

Flow F — Corporate:
Corporate Account → employee → Reservation/Rental → exposure → credit check → Corporate Credit Override gerekiyorsa formal Approval Center → settlement

Flow G — Partner:
Partner Lead → Quote/Reservation → Rental → commission earned → paid

Flow H — Incident/Task:
Incident → assign → linked Task → Task complete → Incident separately resolve

---

# 57. Acceptance criteria by WEB concept quality

Bir ekran ``complete`` değildir çünkü route açıldı veya ``build`` geçti. Tamamlanma:
- gerçek bağlı demo domain state, CRUD/workflow veya açıkça read-only projection
- meaningful loading/empty/success/validation/permission/demo-error states
- no dead buttons, no fake payments/messages/integration
- responsive web, keyboard/focus, dense B2B ergonomisi
- aynı money/rate/policy/vehicle gerçeğine bağlı reusable logic
- browser refresh sonrası yalnız açıkça beyan edilen local demo persistence
- historical snapshots/money movements overwrite edilmiyor
- kaynak linkleri, web role/branch/tenant *simulation* seçimi ile tutarlı
- bütün yeni global payments/tax/insurance/cash/shift/driver exception senaryoları Part III checklist'te doğrulanmış.

---

# 58. WEB konsepti tamamlanma tanımı

ACARVO Global Web UI konsepti tamamlandı denebilmesi için:
- orijinal V1'deki tüm web capability envanteri görünür ve etkileşimli olmalı
- girişten Rental, split payments, prepayment, cash shift, exceptional close'a uçtan uca state değişimi gözlenebilmeli
- her state sonucunda hesaplamalar doğru, local demo kayıtları reload'da korunmalı
- kullanıcı neyin gerçek, neyin demo olduğunu görebilmeli
- backend/API/database/cloud/native mobil app veya gerçek payment/fiscal integration inşa edilmemiş olmalı
- Part III örnekler geçmeli; screenshot/browser UX review yapılmalı.

Bu **production güvenliği, gerçek finansal kayıt, KVKK/GDPR uyumu veya hukuki fiskal onay** anlamına gelmez.

---

# 59. GLOBAL WEB V1 SCOPE LOCK

Kaynak ürün özelliklerinin **web tarafı**, ilgili section'daki record-level optional alanlar dışında, konseptte korunur.

**Zorunlu web ekran/akışlar:** mevcut Owner/Dashboard/Command/Fleet/Reservation/Rental/Calendar/Task/Incident/Vehicle/Maintenance/Customer/Corporate/Lead/Quote/Partner/Supplier/Reports/Finance/Expense/Contract/Documents/Damage/Fine/Rules/Approvals/Settings/Global Search/Notification/Import/Export; bunların yeni ekleri Global Currencies + FX Rate Desk + Multi-Payer Split Payment + Advances + Installment Plan + Tax + Insurance Packages + Driver Eligibility + Exceptional Rental Closure + Cash Drawers + Shifts + Platform Console UI.

**Bu konsept tesliminin DIŞINDA:** backend/API/database, live SaaS tenant/billing, production authentication, native iOS/Android apps, real push, real SMTP/SMS/WhatsApp, real payment gateway/POS, live bank reconciliation and bank API, real official exchange feeds, eInvoice, fiscal device, automatic regulatory compliance, payroll, GPS/ANPR, LLM/OCR, customer portal/public booking.

Web UI, kullanıcıdan istenen global business workflow'u bu dış servisler olmadan **dürüst demo** olarak tasarlar ve çalıştırır. Native mobile'a ait eski capabilities V1 web scope değildir. Web responsive kalite kriteridir.

---

# 59A. OWNER / PATRON DASHBOARD — GELİŞTİRİLMİŞ YÖNETİCİ GÖRÜNÜMÜ

Patron ekranı yalnız birkaç KPI kartından oluşmayacaktır.

Amaç:
şirketin bugünkü operasyonunu, ticari gidişatını, filo kullanımını ve finansal durumunu tek bakışta anlamak.

## Üst özet şeridi
Gerçek ve karar verdiren metrikler:

- bugün teslim
- bugün iade
- aktif kiralama
- bugün yeni rezervasyon
- kullanılabilir araç
- bakımda araç
- gecikmiş kiralama
- açık bakiye
- bekleyen onay
- geciken görev / kritik olay

Kart sayısı gerektiği kadar sınırlı tutulur; ekran kart çöplüğüne dönüşmez.

## Grafikler

### 1. Kiralama / Rezervasyon Trend Grafiği
Çizgi grafik:
- günlük / haftalık / aylık
- Reservation sayısı
- Rental sayısı
- iptal/kayıp oranı ayrı görünümde

### 2. Tahsilat / Charge / Outstanding Trend
Çizgi veya bar:
- gerçekleşen tahsilat
- oluşan charge
- açık bakiye

Currency ayrı ayrı gösterilir; tek grafikte farklı currencies toplanmaz.

### 3. Filo Durumu
Donut / yuvarlak grafik yalnız mutually-exclusive **Availability** bucket'larını kullanır:
- Available
- Reserved
- Rented
- Maintenance
- Transfer
- Unavailable

Readiness ve Damage bu donut'a karıştırılmaz. Ayrı KPI/mini breakdown olarak gösterilir:
- Ready / Not Ready / Review Required
- open damage count

### 4. Filo Kullanım Oranı
Çizgi/bar:
- sınıf bazında
- şube bazında
- dönem bazında

### 5. Şube Performansı
Bar/table hybrid:
- Reservation
- Rental
- utilization
- open balance
- overdue operations

### 6. Gelir Kaybı / Kontrol Sinyalleri
Sayı veya mini trend:
- yüksek indirim
- eksik tahsilat
- açık finansal kapanış
- bekleyen approval

Fake “kurtarılan gelir” gösterilmez.

### 7. Masraf Trendi
- posted expenses
- maintenance actual source cost

Aynı maintenance/roadside/cleaning source-linked Expense ile source cost aynı toplamda iki kez sayılmaz.
Ayrı seri gösterilirse `source cost` vs `posted expense` olarak açıkça etiketlenir; birleşik toplam deduplicate edilir.

### 8. Yaklaşan Kritik Tarihler
- muayene
- trafik sigortası
- kasko/poliçe
- bakım
- sözleşme/imza
- planlanan iadeler

## Dashboard filtreleri
- bugün / 7 gün / 30 gün / özel tarih
- şube
- araç sınıfı
- currency (finans grafiklerinde)

## Dashboard davranışı
Her grafik/kart tıklanınca kaynağın gerçek ekranına gider.
Grafikler dekoratif değildir; hover/legend/value anlamlıdır.
Tablo alternatifi gereken yerde bulunur.

---

# 59B. ARAÇ FOTOĞRAF VE KİRALAMA DURUM KAYDI — YENİ KESİN KURAL

## Araç ana fotoğrafı
Her Vehicle için:
- en fazla bir aktif ana/profil fotoğrafı
- Vehicle List'te thumbnail
- Vehicle Detail header'da büyük görünüm
- Reservation/Rental araç seçiminde thumbnail

Bu fotoğraf:
- araç kataloğu/reference görselidir
- kiralama teslim/iade kanıtı değildir
- 4–5 fotoğraf zorunluluğuna tabi değildir

## Teslim (Handover) araç durum kaydı

Araç müşteriye teslim edilirken personel aşağıdakileri kaydeder:

- teslim kilometresi
- yakıt seviyesi
- 4–5 durum fotoğrafı
- görünür hasar/not
- teslim tarihi/saati
- teslim eden personel

### Yakıt seviyesi
Hızlı seçim:
- Boş
- 1/4
- 1/2
- 3/4
- Dolu

ACARVO_V1 yakıt seviyeleri yalnız bu beş sabit domain değeridir. Hassas yüzde/litre serbest girişi V1'de yoktur; fotoğraf veya UI üzerinde farklı fuel scale ikinci kayıt gerçeği olarak oluşturulmaz.

### Fotoğraflar
4 minimum, 5 maximum:
- ön
- arka
- sol
- sağ
- opsiyonel iç/ek açı

UI kullanıcıyı yönlendirir fakat açı isimleri kanıtın yerine geçmez.

## İade araç durum kaydı

Araç geri geldiğinde ayrı kayıt:

- iade kilometresi
- yakıt seviyesi
- 4–5 yeni durum fotoğrafı
- yeni hasar/not
- iade tarihi/saati
- teslim alan personel

## Karşılaştırma görünümü

Rental Detail'te:

Teslim vs İade

yan yana göster:

- km farkı
- yakıt farkı
- fotoğraflar
- condition notes
- yeni hasar kaydı varsa link

Bu karşılaştırma kullanıcıya açık ve görsel olmalıdır.

## Kurallar
- Eski teslim fotoğrafı sonradan yeni Vehicle photo ile değişmez.
- İade fotoğrafı teslim fotoğrafını overwrite etmez.
- Return kaydı Vehicle Ready anlamına gelmez.
- Yeni hasar otomatik charge değildir; Damage workflow'a geçer.

---

# 59C. ARAÇ BELGELERİ, MUAYENE VE SÜRE HATIRLATMALARI

Vehicle Detail içinde ayrı **Belgeler ve Süreler** bölümü bulunur.

Takip edilecek temel kayıtlar:

- araç muayenesi
- trafik sigortası
- kasko / şirketin kullandığı diğer poliçeler
- ruhsat / registration document
- yol yardım / ilgili şirket belgesi (kullanılıyorsa)
- diğer şirket-tanımlı araç belgesi

Her kayıt:
- belge türü
- başlangıç
- bitiş / son geçerlilik
- belge dosyası
- not
- durum

## Hatırlatma davranışı

Varsayılan uyarı pencereleri:
- 30 gün
- 15 gün
- 7 gün
- süresi geçti

Bu süreler Settings'ten şirket genelinde ayarlanabilir.

Gösterim yerleri:
- Dashboard
- Vehicle List uyarı alanı
- Vehicle Detail
- Notification Center
- Command Center gerekiyorsa

## Servis hatırlatmaları
Bakım sadece tarih ile değil:
- tarih
- kilometre
üzerinden de yaklaşabilir.

Örnek:
“1.200 km sonra bakım”
“Muayeneye 12 gün kaldı”

---

# 59D. VEHICLE READINESS CHECKLIST

Araç “müsait” olsa bile otomatik olarak “teslime hazır” sayılmaz.

Vehicle Detail ve Rental pre-delivery alanında readiness checklist:

- aktif bakım engeli var mı
- kritik açık hasar var mı
- zorunlu araç belgesi süresi geçmiş mi
- Availability servisi, current Reservation/Rental source kaydını self-conflict saymadan, başka blocker bildiriyor mu
- fiziksel konum uygun mu
- teslim hazırlığı tamam mı

Durum:
- Hazır
- Hazır Değil
- Kontrol Gerekli

Her blocker'ın nedeni gösterilir.

Readiness, availability çakışmasını kendi başına yeniden hesaplamaz; authoritative Availability sonucunu kullanır.

Tek bir gizli/skor tabanlı readiness puanı yoktur.

---

# 59E. NOTIFICATION CENTER

Header'da gerçek Notification Center bulunur.

Örnek bildirimler:
- muayene 15 gün sonra bitiyor
- sigorta 7 gün sonra bitiyor
- bakım kilometresi yaklaştı
- Rental iade saati geçti
- müşteri belgesi eksik
- approval request geldi
- task due
- critical incident
- contract unsigned / staff approval pending

Bildirim:
- source'a gider
- read/unread olabilir
- business truth değildir
- source kayıt değişince doğru durumu yansıtır

---

# 59F. AYARLAR — TAM ÜRÜN EKRANI

Settings yalnız **Yönetim → Ayarlar** altında yer alır ve gerçek bir ürün ekranıdır. Kullanıcı menüsünde şirket ayarı bağlantısı bulunmaz; Profil/Oturum yalnız kullanıcının kişisel profil/tercih yüzeyidir (§4).

Aşağıdaki gruplar bulunur:

## 1. Şirket Profili
- şirket adı
- logo: yükleme/değiştirme/kaldırma, dosya türü ve boyut kontrolü, anlık antet ön izlemesi; kurumsal logo sürümü sözleşme issue snapshot'ına pinlenir (§83.1)
- iletişim
- adres
- varsayılan dil
- varsayılan para birimi / kullanılan currencies
- timezone

## 2. Rezervasyon & Kiralama
- varsayılan pickup/return saatleri
- varsayılan depozito politikası
- gecikme toleransı/gösterim ayarı
- rental/reservation human-readable numbering display preferences

Policy motoruyla çelişen ayar eklenmez.

## 3. Araç & Filo
- belge reminder günleri
- bakım yaklaşma kilometresi varsayılanı
- readiness görünüm tercihleri yalnız sunum/density içindir; blocker'ları gizleyemez

V1 sabit fotoğraf politikası Settings'ten değiştirilemez:
- Vehicle profil fotoğrafı: en fazla 1 aktif foto; eksik olması availability/readiness blocker değildir
- Rental handover: 4–5 kanıt fotoğrafı
- Rental return: 4–5 kanıt fotoğrafı
- Supplier receive/return: 4–5 kanıt fotoğrafı
- Vehicle swap: eski araç old-return ve yeni araç new-delivery için iki ayrı 4–5 kanıt fotoğrafı

Fuel seviyeleri sabit domain değerleridir ve Settings'ten değiştirilemez:
- Boş
- 1/4
- 1/2
- 3/4
- Dolu

## 4. Belgeler
- şirket-tanımlı vehicle document types
- supplier ve External Vehicle için company-scoped minimum supplier-document checklist: document type, onboarding warning vs **customer Delivery hard gate**, expiry rule (if applicable); fiziki Supplier Receive inspection belgeler eksik diye geri alınmaz
- kuralın version/activation bilgisini görüntüleme ve yetkili düzenleme; authoritative validation **Document Requirement** concept business rule service'inde
- expiry reminders
- allowed upload types display
- document naming/display conventions

## 5. Finans Görünümü
- default currency display
- money formatting
- deposit display defaults
- finance dashboard preferences

Financial truth/formula burada değişmez.

## 6. Bildirimler
Şirket-geneli varsayılanlar:
- muayene
- sigorta
- bakım
- overdue Rental
- task
- approval
- incident

Kullanıcı kişisel notification tercihleri ayrı alt bölümde olabilir.

## 7. Numaralandırma / Görünüm
Kullanıcıya gösterilen numara prefix/format ayarları V1'de desteklenir:
- Reservation
- Rental
- Task
- Incident
- Expense
- Sourcing Request

Bu ayarlar yalnız yeni human-readable numaraları etkiler; existing records renumber edilmez.

## 8. Dış Erişim

ACARVO_V1 içinde müşteri-facing dış erişim yoktur.

Bu bölüm yalnız gerçek **Partner Portal** ayarlarını/durumunu gösterebilir.

Fake portal ayarı veya kullanılmayan public/customer seçenek gösterilmez.

## 9. Görünüm
- density
- compact/comfortable table preference
- browser-local preferences açıkça “Bu tarayıcıda” etiketiyle

## 10. Entegrasyonlar
Sadece gerçek entegrasyon varsa durum gösterir.
“Bağlandı” fake state yoktur.

### Settings'in yapmayacağı şeyler
- User CRUD
- Role CRUD
- Branch CRUD

Bunlara link verir; duplicate management ekranı oluşturmaz.

---

# 59H. QUICK ACTIONS / OPERASYON HIZI

Global veya context-sensitive quick actions:

- Yeni Rezervasyon
- Yeni Kiralama
- Müşteri Oluştur
- Görev Oluştur
- Olay Aç
- Hasar Bildir
- Ceza Kaydet
- Bakım Planla

Yetkiye göre görünür.

Quick action context varsa prefill eder:
Vehicle Detail → Hasar Bildir
Rental Detail → Görev Oluştur

---

# 59I. ARAÇ UYGUNLUK / PLANLAMA GÖRÜNÜMÜ

Vehicles veya Reservations içinde operasyon planlama görünümü:

- tarih ekseni
- araç satırları
- Reserved / Rented / Maintenance / Transfer / Unavailable blokları
- confirmed external-vehicle availability windows where relevant
- availability gap
- readiness ayrı indicator/overlay; availability block'u olarak ikinci kez hesaplanmaz

Amaç:
“hangi araç hangi gün boş?” sorusunu hızlı görmek.

Bu:
Calendar'ın yerine geçmez.
İkinci truth değildir.
Gerçek Reservation/Rental/Maintenance/Transfer ve authoritative Availability durumlarının projection'ıdır.

---

# 59J. DOCUMENT / CONTRACT OUTPUTS

Kullanıcının gerçekten ihtiyaç duyduğu çıktılar:

- sözleşme PDF / print
- teslim formu
- iade formu
- Rental summary
- finance receipt/statement yalnız gerçek finans kaydı varsa

Print/document center ayrı business truth yaratmaz.
Kaynak kayıtların printable projection'ıdır.

---

# 59K. OWNER DASHBOARD ACCEPTANCE

Owner dashboard complete sayılmazsa aşağıdakiler yoksa:

- en az 3 anlamlı grafik
- grafiklerin gerçek source navigation'ı
- date/branch filters
- fleet donut/status view
- finance trend
- rental/reservation trend
- upcoming vehicle-document expiries
- overdue operational items
- no fake profit
- no decorative random charts

---

# 59L. HANDOVER / RETURN ACCEPTANCE

Rental lifecycle complete sayılmazsa:

Teslim:
- [ ] km
- [ ] fuel fraction
- [ ] 4–5 photos
- [ ] notes
- [ ] staff/time

İade:
- [ ] km
- [ ] fuel fraction
- [ ] 4–5 photos
- [ ] notes
- [ ] staff/time

Comparison:
- [ ] km delta
- [ ] fuel delta
- [ ] photo compare
- [ ] new damage link
- [ ] immutable historical evidence


# 59M. VARDİYA DEVİR / SHIFT HANDOVER

Staff Shift entity, nakit cash-session handover ve expected vs counted currency bazlı kasa aktarımı bu web ekranına dahildir (§72).


ACARVO gerçek operasyon ortamında vardiya değişimini desteklemelidir.

Amaç:
bir ekip çıkarken diğer ekip “ne kaldı?” diye WhatsApp/not defteri aramak zorunda kalmasın.

## Vardiya Devri ekranı
Göster:
- açık teslimler
- bugün/yarın iadeler
- geciken Rental'lar
- eksik belgeli aktif işler
- açık Tasks
- kritik Incidents
- bekleyen Approvals
- hazırlanmamış araçlar
- finansal kapanışı açık Rental'lar

## Devir Notu
Çıkış yapan personel:
- genel vardiya notu
- kritik konu
- takip edilecek müşteri/araç/rental
ekleyebilir.

Yeni vardiya:
- devri okur
- “devralındı” işareti bırakabilir

Bu ekran Reservation/Rental/Finance/Task/Incident gibi kaynak domainlerin business truth'unu yeniden üretmez.

Ancak Vardiya Devri'nin kendi collaboration kayıtları gerçektir:
- handover note
- created by / created at
- incoming staff acknowledgement (`devralındı`)
- acknowledged by / acknowledged at

Bu collaboration kayıtları kaynak domain lifecycle'larını değiştirmez.

---

# 59N. ARAÇ HAZIRLIK / TEMİZLİK CHECKLIST

Vehicle Ready olmak yalnız “bakım yok” anlamına gelmez.

## Hazırlık checklist
Örnek alanlar:
- dış temizlik tamam
- iç temizlik tamam
- camlar temiz
- yakıt seviyesi uygun
- lastikler gözle kontrol edildi
- araçta görünür yeni hasar yok
- ruhsat/araç belgeleri araçta
- zorunlu ekipman mevcut
- çocuk koltuğu vb. ekstra hazırlanmışsa işaret
- anahtar teslim hazır
- araç doğru konumda
- personel notu

## Kural
Checklist sonucu:
- Hazır
- Hazır Değil
- Kontrol Gerekli

Hazırlık tamamlanması Maintenance Completed ile aynı şey değildir.

Rental teslim öncesi:
kullanıcı hazırlık durumunu görebilir.

---

# 59O. LASTİK / SEZON TAKİBİ

Lastik değişimi gerçek service cost'u linked Maintenance kaydından derived okunur; ikinci editable maliyet truth'u yaratılmaz.


Vehicle Detail içinde Lastik / sezon takibi bulunur.

Takip:
- yaz / kış / dört mevsim
- mevcut set
- değişim tarihi
- lastik kilometresi
- üretim yılı / DOT bilgisi opsiyonel
- saklanan ikinci set varsa not
- değişim sağlayıcısı / linked Maintenance (Tire Service) job reference
- **gerçek lastik/değişim maliyeti (linked Maintenance actual cost'tan derived/read-only)**; bağımsız editable maliyet yok

## Hatırlatma
Şirket ayarına göre:
- sezon yaklaşımı
- km limiti
- tarih limiti

Notification Center / Dashboard:
“12 araç için kış lastiği kontrolü gerekli.”

Bu modül bakım domainini duplicate etmez. **Ücretli lastik değişimi veya yeni lastik satın alımı servis maliyeti** için authoritative Maintenance (Tire Service) source kaydı gerekir; Tire ekranı bu işi açmaya yönlendirebilir ve cost'u oradan okur. Tire Season kaydındaki tarih/set/km gerçeği ayrı operational event'tir; Maintenance maliyetinin ikinci kopyası değildir. Expense gerekiyorsa tek source-linked posting Maintenance üzerinden yapılır.

---

# 59P. YAKIT FARKI ÜCRET POLİTİKASI

Teslim ve iade yakıt seviyesi zaten kaydedilir.

Şirket ayarı:
yakıt farkı müşteri charge'ına nasıl dönüşebilir?

V1 politika seçenekleri:
- eksik **fraction step** bazlı ücret
- sabit servis bedeli
- sadece uyarı, charge yok
- eşik üzerinde manager confirmation gerektiren politika

ACARVO_V1'de litre hesabı yapılmaz; tank kapasitesi / gerçek litre ölçümü authoritative domain olarak tanımlı değildir.

## Kural
UI yakıt farkını gösterebilir.
Fuel Charge ancak Settings'teki explicit Fuel Policy sonucuyla demo Charge event olarak oluşturulur.
Eşik üzerinde manager confirmation gerekiyorsa bu **Approval Center workflow'u değildir**; permission-gated inline operational confirmation'dır.

Konseptte pricing/finance hesaplaması paylaşılan tek domain-calculation katmanında yapılır; production authoritative backend mevcut değildir.

---

# 59Q. KİLOMETRE LİMİTİ VE AŞIM ÜCRETİ

Rental sözleşmesinde opsiyonel:
- sınırsız km
veya
- günlük/toplam km limiti

Teslim km:
başlangıç

İade km:
bitiş

Sistem:
- kullanılan km
- izin verilen km
- aşım km
hesaplar.

Aşım fiyatı:
pricing rule / rental commercial snapshot'tan gelir.

ACARVO WEB konseptinde kullanılan km / izin verilen km / aşım km ve Charge preview hesaplaması **tek paylaşılan, deterministik tarayıcı demo domain hesaplama katmanından** gelir; Vehicle Detail, Rental Detail ve Finance farklı formül kullanmaz. Bu bir gerçek backend/üretim tahakkuku değildir.

Rental Detail:
“1.250 km kullanıldı / 1.000 km limit / 250 km aşım”

Charge gerekiyorsa mevcut Finance lifecycle'a tek kalemle gider.

---

# 59R. ARAÇ TRANSFER OPERASYONU

Araç bir şubeden diğerine veya başka fiziksel konuma taşınabilir.

## Transfer kaydı
- Vehicle
- source location
- target location
- planned departure
- planned arrival
- assigned staff/driver
- status
- notes
- start km/fuel
- end km/fuel

Status:
Planned
→ In Transit
→ Completed
veya Cancelled

## Kural
Transfer:
- Vehicle home branch'i otomatik değiştirmez
- physical location'ı etkiler
- availability hesaplarında dikkate alınır
- ikinci Rental değildir

---

# 59S. HIZLI PLAKA / QR / ARAÇ ARAMA

Web panel içinde hızlı araç bulma:

- plaka
- araç kodu
- Rental no
- Reservation no

ACARVO_V1 QR lookup capability'sini içerir; fakat her araca fiziksel QR etiketi basmak/zorunlu takmak record-level opsiyoneldir.

QR etiketi atanmışsa yalnız internal vehicle identifier taşır.
Sensitive token taşımaz.

Scan:
→ Vehicle Detail
veya ilgili active Rental.

ANPR/live camera recognition bu kapsamda değildir.

---

# 59T. PATRON DASHBOARD — DÖNEM VE ŞUBE KARŞILAŞTIRMA

Owner Dashboard aşağıdaki karşılaştırmaları destekler:

## Dönem
- bu hafta vs geçen hafta
- bu ay vs geçen ay
- seçili dönem vs önceki eş dönem

## Şube
- Reservation
- Rental
- utilization
- collection
- outstanding
- expenses
- external vehicle usage
- overdue operations

## Araç sınıfı
- demand
- utilization
- unavailable days
- external sourcing frequency

Yüzde farkı yalnız gerçek iki dönemin matematiksel farkıdır.
Fake forecast/prediction yoktur.

---

# 59U. DIŞ KAYNAK ARAÇ / SUB-RENTAL DOMAIN

ACARVO, başka rent-a-car şirketlerinden veya araç tedarikçilerinden geçici olarak alınan araçların müşteriye kiralanmasını destekler.

Bu araçlar şirketin kendi filosu değildir.

Temel ayrım:

- **Internal Fleet** = şirketin günlük filo kontrolü altında kendi asset kaydıyla yönettiği araçlar; acquisition type `Purchase`, `Lease` veya `Long-term rent` olabilir. Buradaki `Internal` **mülkiyet iddiası değildir**.
- **External/Supplier Vehicle** = münferit geçici sourcing engagement/window kapsamında tedarikçiden alınan araç; Internal Fleet asset lifecycle'ına girmez.

Aynı araç aynı dönemde hem Internal hem External kapasite kaynağı olamaz. Kaynak türü authoritative vehicle onboarding/source kaydında sabittir; sadece tedarikçi adı veya sahiplik varsayımıyla otomatik değiştirilmez.

**Owned-fleet** metrikleri yalnız gerçekten şirketin mülkiyetindeki `Purchase` (veya authoritative ownership kanıtlı) Internal araçları kapsar. **Managed/internal-fleet** metrikleri owned + lease + long-term-rent internal araçları kapsayabilir, ama isimleri açıkça ayrılır. External araçlar hiçbir owned/internal yönetilen filo toplamına sessizce katılmaz.

Bu ayrım bütün availability, finance, documents, handover/return ve analytics akışlarında korunur.

---

# 59V. ARAÇ TEDARİKÇİLERİ

Yeni internal modül:

## Araç Tedarikçileri

Liste:
- firma
- aktif/pasif
- iletişim
- ödeme koşulu
- açık borç (Supplier Settlement projection)
- kullanılan araç sayısı
- son işlem

Detay:
- şirket bilgisi
- kontaklar
- sözleşme/notlar
- default cost terms
- supplied vehicles
- sourcing requests
- settlements
- related documents

Supplier != Partner.

Partner müşteri yönlendirir.
Supplier araç sağlar.

---

# 59W. TEDARİK TALEBİ / SOURCING REQUEST

Kendi filoda uygun araç yoksa personel:

**Dış Kaynak Talebi Oluştur**

yapabilir.

## Alanlar
- branch
- requested class
- pickup
- return
- requested features
- notes
- source Reservation/Lead optional
- target supplier optional

## Sourcing Request lifecycle — yalnız procurement süreci
Requested
→ Offers Received
→ Selected
→ Vehicle Confirmed

veya, supplier vehicle confirm edilmeden önce:
Cancelled

`Vehicle Confirmed` Sourcing Request için başarılı terminal procurement sonucudur. Bu geçişte **tek transaction ile** bir Sourcing Engagement oluşturulur; aynı request tekrar confirm edilerek ikinci engagement yaratılamaz.

Kurallar:
- `Received / Active / Returned to Supplier / Archived` ayrı Sourcing Request state'leri değildir.
- Gerçek supplier receive/return olaylarının **tek otoritesi Sourcing Engagement + ona bağlı immutable Supplier Inspections**'tır.
- Sourcing Request ekranı bunları gerekiyorsa engagement'dan **derived, read-only** gösterir; tekrar status değiştirmez.
- Supplier financial settlement bu lifecycle'ın içinde tutulmaz; linked Supplier Settlement'tan okunur.
- Cancelled request confirmed supplier inventory sayılmaz.

## Teklif
Bir veya birden fazla supplier:
- vehicle/class
- supplier price
- currency
- included km
- deposit requirement
- pickup/delivery
- terms

Human selects.

No automatic “best supplier” AI score.

---

# 59X. EXTERNAL VEHICLE RECORD

External Vehicle **master/reference** (aynı supplier aracının kalıcı kimliği):
- SupplierId
- supplier vehicle reference
- plate
- make/model
- class mapping
- maximum one active profile photo; may be absent
- kalıcı vehicle/source identity ve ilgili belge referansları
- notes

Engagement'a özgü ticari/tarihsel alanlar Vehicle master üzerinde mutable truth olarak saklanmaz.

**Sourcing Engagement** (her supplier'dan geçici alış için ayrı immutable historical agreement/window):
- SourcingRequestId, SupplierId, ExternalVehicleId
- operating branch (**external branch-security authority**)
- supplier pickup location ve confirmed receive/start date
- confirmed availability start/end window
- supplier return due
- supplier offer/agreement version ve supplier cost terms snapshot
- related Rental IDs / reservation allocations (derived links)
- Supplier Receive / Supplier Return inspection references
- related Supplier Settlement / Supplier Security Deposit references
- engagement lifecycle, actor/audit

External Vehicle'ın current physical location'ı authoritative **Vehicle Location event/history** üzerinden türetilir; master, engagement veya Rental içinde ikinci mutable location truth'u açılmaz.

Aynı External Vehicle master'ına zaman aralıkları çakışan confirmed engagements atanamaz. Yeni kullanım yeni engagement/window gerektirir; geçmiş agreement, inspection, cost ve branch history overwrite edilmez.

External vehicle company fleet ownership metrics'ine dahil edilmez.

## External Vehicle lifecycle

External/Supplier Vehicle, internal owned Vehicle'ın `Active / Out of Service / Sold / Disposed` asset lifecycle'ını kullanmaz.

External sourcing engagement lifecycle:
Confirmed
→ Received
→ Returned to Supplier
→ Archived

Alternatif: Confirmed → Cancelled (supplier receive yapılmadıysa; future allocation varsa önce bunlar authoritative biçimde çözülür).

`Received` yalnız Supplier Receive Inspection finalize edilince; `Returned to Supplier` yalnız Supplier Return Inspection finalize edilince oluşur. Customer'a verilmiş/aktif Rental devam ederken veya window içindeki confirmed future Reservation reallocate/cancel edilmeden Supplier Return finalize edilemez.

Sourcing Engagement'ın immutable geçmişi korunur; yeni event eklenebilir ama geçmiş inspection/terms overwrite edilemez. Archived engagement yeniden açılmaz.

Aynı supplier aracı ileride tekrar kullanılacaksa:
- aynı External Vehicle master/reference kaydı yeniden kullanılabilir
- fakat **yeni Sourcing Request / Sourcing Engagement / availability window** oluşturulur
- yeni supplier receive/return inspection setleri yeni engagement'a bağlanır
- eski engagement lifecycle ve inspection history değişmez

Availability ayrı eksendir:
Available / Reserved / Rented / Maintenance / Transfer / Unavailable

Readiness ayrı eksendir:
Ready / Not Ready / Review Required

Kurallar:
- `Sold` / `Disposed` external vehicle'a uygulanmaz
- external engagement lifecycle, **tek Sourcing Engagement authority'si** ve onun receive/return inspection event'lerinden yönetilir; Sourcing Request yalnız procurement status'udur
- `Available/Rented/Unavailable` external asset lifecycle state'i değildir
- Returned to Supplier olduktan sonra mevcut sourcing engagement içinde yeni Rental'a atanamaz

External Vehicle için iki farklı availability kavramı vardır:
1. **Future allocatable:** confirmed **Sourcing Engagement** window içinde ise gelecekteki Reservation'a specific olarak atanabilir; henüz `Received` olması gerekmez. Confirmed request/offer ama **engagement olmayan** kayıt kapasite değildir.
2. **Current / Delivery eligible:** customer Delivery/Rental handover için ilgili engagement `Received` + authoritative Vehicle `Ready` olmalıdır. Return deadline/confirmed window hâlâ geçerli olmalıdır.

Web UI, ``future allocatable`` ile ``delivery eligible`` kavramlarını aynı `Available` etiketiyle karıştırmaz.

Availability ekranında açık şekilde:
`Dış Kaynak · ABC Rent a Car`

etiketiyle görünür.

---

# 59Y. SUPPLIER RECEIVE / RETURN INSPECTION

External vehicle şirketimize geldiğinde:

## Supplier Receive Inspection
- **Sourcing Engagement ID** (zorunlu; bu inspection eski engagement üzerine overwrite edilmez)
- received date/time
- km
- fuel
- 4–5 photos
- visible damage
- document checklist
- keys/accessories
- receiving staff
- supplier representative optional
- notes

Müşteriye teslim:
ayrı Rental Handover inspection.

Müşteriden dönüş:
ayrı Rental Return inspection.

Supplier'a iade:
ayrı Supplier Return inspection:
- **Sourcing Engagement ID** (zorunlu)
- km
- fuel
- 4–5 photos
- damage notes
- keys/accessories reconciliation
- supplier receive inspection ile fark karşılaştırması
- fark varsa supplier settlement/incident candidate link; otomatik maliyet yaratmaz
- return time
- handoff staff

## Dört ayrı fotoğraf seti karışmaz
1. Supplier → ACARVO receive
2. ACARVO → Customer delivery
3. Customer → ACARVO return
4. ACARVO → Supplier return

Historical evidence immutable.

---

# 59Z. SUPPLIER COST / SETTLEMENT

Supplier cost customer revenue'dan tamamen ayrıdır.

## Supplier Vehicle Cost
Possible components:
- daily/base supplier cost
- delivery/pickup fee
- included/excess km
- fuel adjustment
- supplier damage adjustment
- admin fee
- other documented supplier fee

## Supplier Settlement — payable ile ödeme gerçeği ayrıdır

Authoritative **Supplier Payable / Cost** kaydı Supplier Settlement domainindedir; amount/currency belgeli cost component + approved supplier adjustment'lardan oluşur ve engagement'a bağlanır.

Derived settlement lifecycle (manuel ödeme status'u değiştirmez):
Open → Partially Settled → Settled

- `Open`: hiçbir Supplier Payment veya Supplier Security Deposit application yok (veya kalan borç tutarının tamamı açık).
- `Partially Settled`: authoritative payable'ın bir kısmı uygulanan Finance Supplier Payment ve/veya Supplier Security Deposit application ile kapanmış, outstanding > 0.
- `Settled`: outstanding = 0; ancak maliyet yok/0 ise kapanışın geçerli adjustment/policy sonucu olduğu doğrulanır.
- `Disputed`: ayrı, permission-gated/audited **hold/review flag**'dir; hesaplanan balance lifecycle'ını ikinci kez override etmez. Dispute çözülse de cash/deposit movement yeniden yazılmaz.

**Financial amounts tek otorite:**
- `paid` = Finance / Supplier Payment applied total (derived/read-only)
- `deposit applied` = Supplier Security Deposit application movements (derived/read-only; **cash Supplier Payment değildir**)
- `outstanding` = authoritative payable - applied Supplier Payments - applied Supplier Deposit amounts (derived/read-only)
- negatif outstanding, currency mismatch veya source/event için duplicate application bloklanır
- authorized payment reversal/correction varsa yeni audited movement ile hesaplar yeniden türetilir

Finance Center ayrı bölüm: **Araç Tedarikçi Borçları**

Görünür alanlar:
- supplier / sourcing request / engagement / external vehicle / related rental(s)
- authoritative supplier cost + currency
- paid (Finance source; read-only)
- supplier deposit applied (separate source; read-only)
- outstanding (derived; read-only)
- derived settlement state + disputed flag

Supplier Settlement içinde `paid` / `outstanding` bağımsız editable para alanları değildir.

## Financial semantics
Supplier cost:
- Supplier Settlement / payable tarafının authoritative maliyet kaydıdır
- Expense raporlamasına bu kayıttan türetilerek dahil edilebilir
- aynı supplier cost ayrıca manuel Expense olarak ikinci kez post edilmez
- never Rental revenue
- never Customer Payment
- never Partner commission

Customer rental price:
ayrı commercial truth.

## Supplier Security Deposit

Supplier bir external vehicle için ACARVO'dan depozito/teminat isterse bu müşteri depozitosundan tamamen ayrı tutulur.

Lifecycle:
Required
→ Provided
→ Returned

veya

Provided
→ Partially Applied
→ Returned (remaining amount)

veya

Provided
→ Applied

Kayıt:
- supplier
- **Sourcing Engagement ID** (zorunlu; aynı supplier/vehicle'ın farklı alışları karışmaz)
- related sourcing request / external vehicle master references
- amount
- currency
- method/reference
- provided at
- returned/applied totals (**Supplier Security Deposit movement stream'den derived/read-only**, independently editable değil)
- status (movement lifecycle'dan derived)
- notes

Kurallar:
- Supplier Deposit ≠ Customer Deposit
- Supplier Deposit ≠ Supplier Vehicle Cost
- Provided tutar tek başına Expense değildir
- Applied tutar yalnız aynı currency'deki authoritative Supplier Payable/Settlement'a karşı **bir kez** uygulanabilir; applied amount outstanding'i azaltır ama Finance Supplier Payment veya yeni Supplier Cost yaratmaz
- Provided ve Returned hareketleri supplier customer collections'a, `Supplier Payment` totaline veya Supplier Vehicle Cost'a eklenmez
- Returned tutar gelir/revenue değildir
- hem Applied hem Returned miktarlar Provided'ı aşamaz; değişiklikler source-linked, idempotent ve audited movement'tır
- cross-currency mahsuplaşma yapılmaz
- gerçek banka/POS entegrasyonu yoksa dışarıdaki işlemin referansı manuel ve dürüst biçimde kaydedilir

---

# 59AA. EXTERNAL VEHICLE CONTRIBUTION ANALYTICS

Global currency raporu için original cost/charge totals default; admin rate-set seçilmişse ek ``converted estimate`` gösterilebilir (§63).


Patron ekranında gerçek ticari analiz:

- external vehicle rental count
- supplier cost
- customer rental charge total
- gross contribution before other expenses
- external sourcing share by class
- sourcing frequency by branch
- supplier usage
- class shortages that caused sourcing

Label:
**Brüt katkı** / **Commercial contribution**

Brüt katkı kendi orijinal currency kalemleriyle gösterilir; currency farklıysa gizli toplam yapılmaz. İstenirse açık reporting currency + selected manual reporting rate snapshot ile **converted estimate** olarak ayrıca görüntülenebilir; gerçek muhasebe kârı değildir.

Do NOT label as Net Profit.

---

# 59AB. SUPPLIER DOCUMENTS

Supplier tarafında:
- supplier agreement
- vehicle-specific docs
- insurance evidence
- registration/required docs
- pricing/term documents

Private Vault kullanılır.

Supplier/External Vehicle minimum checklist **Settings → Belgeler** içindeki versioned, company-scoped Supplier Document Requirement policy ile tanımlanır; concept Document Requirement policy evaluator bunu değerlendirir.

- Supplier Receive inspection gerçek fiziki teslimi belge eksikse de kaydedebilir; `Received` fiziksel olaydır, otomatik `Ready` değildir.
- Required supplier/vehicle document eksik, süresi geçmiş veya yetkisizse Vehicle Readiness blocker üretir; müşteri Delivery yapılamaz.
- Her sonuçta eksik belge türü, applied rule/version ve source record görünür; supplier offer/confirmed window legal validity garantisi değildir.
- Belge/requirement geçmişi versioned olup eski Rental/supplier inspection'ları geriye dönük değiştirmez.

Legal verification/validity automated claim yapılmaz.

---

# 59AC. AVAILABILITY WITH INTERNAL + EXTERNAL

Reservation availability UI:

Örnek:

SUV
- Kendi filo: 0 uygun
- Dış kaynak: 3 uygun / confirmed supplier inventory where real
- Dış kaynak talebi açılabilir

Important:
Supplier offers/requests != confirmed availability.

Only confirmed external vehicle:
- future Reservation için specific selection yapılabilir
- Delivery/Rental handover anında ayrıca `Received + Ready` şartı aranır

Unconfirmed sourcing:
- Reservation yalnız `Pending · Sourcing Required` olarak oluşturulabilir
- confirmed internal veya confirmed external capacity yokken Reservation `Confirmed` yapılamaz
- sourcing request/offer tek başına kapasite değildir
- external vehicle/window confirm edildiğinde Availability tekrar doğrulanır; ancak sonra Reservation Confirmed olabilir

UI bunu açıkça belirtir.

---

# 59AD. SOURCE TYPE EVERYWHERE

Vehicle-related UI where relevant shows:

- Kendi Filosu
- Dış Kaynak

Fields/reports cannot silently merge ownership. `Kendi Filosu` etiketi Internal managed/controlled fleet anlamındadır; araç hukuken owned değilse UI `Lease / Long-term rent` acquisition type'ını gizlemez. `Owned fleet`, `Internal managed fleet`, `External/Supplier Vehicle` rapor denominatörleri birbirinden ayrı tanımlanır.

Examples:
- Vehicle list
- Reservation vehicle selector
- Rental header
- Finance
- Fleet Analysis
- Reports
- Dashboard

---

# 59AE. EK OPERASYON KALİTESİ — SEARCH, COMMANDS, SHORTCUTS

Web internal panel:
- global search
- keyboard command menu
- recent records
- quick actions
- contextual create

Keyboard examples:
- `/` or Cmd/Ctrl+K search
- Esc close
- Enter open selected
- keyboard-safe dialogs

No command palette just for decoration.

---

# 59AF. SAVE / UNSAVED CHANGE PROTECTION

Long forms/workspaces:
- dirty state tracked
- accidental navigation warning where needed
- gerçek demo-state save başarı geri bildirimi görünür
- failed save preserves entered data
- refresh protection only on genuinely unsaved work

No fake autosave unless real persistence exists.

---

# 59AG. FILTER / TABLE PRODUCTIVITY

Operational lists may support:
- persistent filters
- column visibility
- sort
- page size
- export only where authorized and meaningful
- saved view only where workflow justifies it

Do not add bulk actions unless explicitly safe.

Destructive bulk actions are not default.

---

# 59AH. EXPORTS

Where useful:
- CSV/XLSX
- PDF/print for human documents

Exports:
- permission-gated
- branch/tenant scoped
- same filtered data
- currency preserved
- no hidden sensitive field dump

---

# 59AI. OPERATIONAL TIMELINE

Important details (Rental, Vehicle, Customer, Incident, Sourcing Request) show a human-readable timeline where useful:

- created
- status changes
- assignments
- delivery/return
- document upload
- approval
- charge/refund
- supplier receive/return

Timeline != Audit.
Timeline is user-friendly operational history.
Audit remains detailed immutable record.

---

# 59AJ. ACTIVITY / COMMENT DISCIPLINE

Comments/notes:
- explicit author/time
- no silent overwrite
- edit/delete policy clear
- comments do not mutate lifecycle
- sensitive finance/audit data not copied into generic notes

---

# 59AK. OWNER / MANAGER ALERT CENTER

**Global Web V1 bilgi mimarisi:** Alert Center, Komuta Merkezi'nin ``Uyarılar`` sekmesidir; ayrı top-level warning truth kaynağı değildir (§75).


Dashboard/Command Center can group:
- fleet expiry
- overdue rental
- unresolved critical incident
- high-priority task
- approval waiting
- external supplier vehicle overdue
- supplier settlement overdue
- sourcing request unresolved
- vehicle preparation incomplete

Click through to source.

---

# 59AL. QUALITY BAR FOR “GÜZEL GÖZÜKMESİ”

The UI must feel designed, not generated.

Mandatory visual discipline:
- one compact information hierarchy
- stable page rhythm
- consistent 36–40px controls
- 40–44px tables
- max 8px radius in internal app
- controlled semantic color
- no card-per-field
- no random icon backgrounds
- no repeated colored KPI tiles
- no 3D/illustrative admin art
- no oversized blank hero
- no rainbow charts

Charts:
- restrained palette
- readable labels
- no gratuitous animation
- table/source link fallback

Vehicle/customer images:
real aspect ratios
consistent crop
meaningful placeholders only when image genuinely absent.

---

# 59AQ. ROLE-SPECIFIC DASHBOARD

Dashboard content **permission/capability bazlı** adapte olur.

Aşağıdakiler hardcoded role isimleri değil, referans permission profilleridir:

Owner-like profile:
analytics + operations + finance

Manager-like profile:
operations + risks + approvals

Reception-like profile:
today's deliveries/returns + docs + tasks

Fleet-like profile:
vehicles + maintenance + damage + expiry

Accounting-like profile:
outstanding + payments/refunds + corporate/supplier obligations

Custom role aynı permission kombinasyonuna sahipse aynı widget'ları görür.
Ayrı fake dashboard yoktur; tek ürün, permission-aware composition. (§75)

---

# 59AR. NOTIFICATION PRIORITY & NOISE CONTROL

Notifications classified:
- Critical
- Action required
- Reminder
- Informational

Rules:
- no duplicate notification flood
- same source event can update existing notification
- expired/resolved notifications clear appropriately
- user preferences respected where allowed

---

# 59AS. SEARCH / IDENTIFIER STANDARDS

Users should always be able to identify records quickly.

Consistent visible identifiers:
- Reservation No
- Rental No
- Task No
- Incident No
- Expense No
- Sourcing Request No

Vehicle:
- Plate primary
- internal code optional

Customer:
- name + phone secondary

IDs/UUIDs not exposed as primary human identifiers.

---

# 59AT. DASHBOARD DATA TRUST RULE

Every KPI/chart must answer:
- source domain
- date semantics
- branch semantics
- currency semantics
- click target

If a chart cannot explain its source, do not ship it.

---

# 59AU. PRODUCTION UX STATES

Every core workspace must explicitly design:
- initial loading
- partial loading
- empty
- filtered empty
- validation error
- forbidden
- conflict
- network failure
- stale data
- successful save
- concurrent modification

No blank white page.

---

# 59AV. PRINTABLE OPERATION DOCUMENTS

A4 çıktı akışları ve gerçek tarayıcı yazdır/PDF davranışı §84.4–84.6'ya tabidir. Belge Merkezi belge sahibinin yerine geçmez; print/doküman versiyonu ve rol kontrolü kaynak kayda bağlanır.

Printable documents:
- Rental contract
- delivery inspection
- return inspection
- supplier receive inspection
- supplier return inspection
- Rental summary
- finance statement/receipt where factual
- **A4 Servis Sevk / İş Emri** (linked Maintenance)
- **A4 Sigorta Hasar Dosyası Özeti / Bildirim Formu** (linked Damage/Incident/Insurance Claim; gerçek insurer gönderimi değil)
- **A4 Araç Durum / Hasar İşaretleme Raporu** (linked Inspection/Vehicle; delivery/return snapshot'ı ayrı)

Documents:
- company branding
- identifiers
- timestamps
- staff/customer/supplier context
- photos where relevant
- signature blocks where applicable

Source data only.
No duplicate editable truth.

---

# 59AW. RELEASE QUALITY — USER EXPERIENCE

A module is not release-ready until:

- no dead button
- no placeholder copy
- no fake metrics
- no mock persistence
- no hidden stale permission
- no broken responsive web flow
- all primary navigation destinations exist
- important cross-links work
- empty/error/loading states exist
- browser screenshots reviewed
- responsive web workflows browser-reviewed


# 59AX. MÜŞTERİ İLETİŞİM GEÇMİŞİ

Customer Detail içinde ayrı **İletişim Geçmişi** alanı bulunur.

Amaç:
müşteriyle kimin, ne zaman, hangi konuda iletişim kurduğunu görmek.

Kayıt türleri:
- Telefon
- E-posta
- WhatsApp / mesajlaşma
- Yüz yüze
- Diğer

Her kayıt:
- tarih/saat
- personel
- kanal
- konu
- kısa not
- ilişkili Reservation/Rental/Lead
- takip gerekli mi
- follow-up tarihi opsiyonel

## Kural
Bu özellik ilk sürümde zorunlu olarak gerçek SMS/WhatsApp/e-mail entegrasyonu gerektirmez.

İlk sürüm:
- iletişim kaydı manuel eklenebilir
- dış entegrasyon yoksa “mesaj gönderildi” gibi sahte durum gösterilmez

Gelecekte gerçek sağlayıcı bağlanırsa aynı timeline'a gerçek gönderim/teslim durumları eklenebilir.

---

# 59AY. İLETİŞİM TAKİP / FOLLOW-UP

Lead, Customer, Reservation ve Rental bağlamında kullanıcı:

**Takip oluştur**

yapabilir.

Alanlar:
- tarih/saat
- kanal
- konu
- sorumlu
- not

Takip:
Task domainiyle linklenebilir veya açıkça iletişim follow-up kaydı olarak tutulur.

Aynı işi iki farklı truth store'da duplicate etme.
Tercih:
follow-up yapılacak iş ise Task oluştur ve communication context ekle.

---

# 59AZ. ÇALIŞAN VARDİYA / İŞ YÜKÜ GÖRÜNÜMÜ

``Kim vardiyada`` göstergesi artık Staff Shift demo kayıtlarından okunur; yoksa varmış gibi personel üretilmez (§72.1).


Manager için:

- bugün kim vardiyada
- kimin kaç açık görevi var
- kimin kaç teslim/iadesi var
- atanmış Incident sayısı
- geciken görevler
- branch bazlı ekip yoğunluğu

Bu görünüm performans puanı üretmez.

Amaç:
işi dengeli dağıtmak.

Employee ranking / gamification yok.

---

# 59BA. ARAÇ ANAHTAR TAKİBİ

Vehicle için gerçek **Key Custody** kaydı bulunur.

Durum:
- Şubede
- Personelde
- Müşteride
- Serviste
- Tedarikçide
- Kayıp / Kontrol gerekli

Kayıt:
- Vehicle
- anahtar seti (Ana / Yedek)
- kimde
- teslim zamanı
- teslim eden
- teslim alan
- not

Rental delivery:
ana anahtar müşteriye verildiğinde custody güncellenir.

Return:
geri alındığında kayıt kapanır.

Kayıp anahtar:
Incident açılabilir.

---

# 59BB. ARAÇ EKİPMAN / ENVANTER CHECKLIST

Vehicle üzerinde araçla birlikte dolaşan ekipmanlar takip edilebilir:

- reflektör
- ilk yardım seti
- yangın tüpü
- stepne / tamir kiti
- kriko
- bijon anahtarı
- trafik seti
- şarj kablosu (EV ise)
- şirket tanımlı diğer ekipmanlar

Rental handover/return inspection sırasında:
- mevcut
- eksik
- hasarlı
durumu kaydedilebilir.

Bu genel depo/stok yönetimi değildir.

Vehicle-bound equipment checklist'tir.

---

# 59BC. YOL YARDIM / ÇEKİCİ KAYDI

Rental veya Vehicle bağlamında:

**Yol Yardım Kaydı**

Alanlar:
- olay zamanı
- Vehicle
- Rental
- konum metni
- problem tipi
- provider
- tow required?
- destination
- cost
- notes
- related Incident

Lifecycle:
Requested
→ Dispatched
→ Arrived
→ Completed
veya Cancelled

Roadside Assistance:
Incident ile ilişkilidir ama Incident'in yerine geçmez.

Cost:
- operational roadside cost'in source-of-truth'u Roadside Assistance kaydıdır
- Expense posting gerekiyorsa source-linked Expense bu cost'tan türetilir
- Expense içinde bağımsız ikinci amount girilmez
- duplicate edilmez.

---

# 59BD. SİGORTA HASAR DOSYASI

Damage liability = Insurance olduğunda ayrı **Insurance Claim Case** açılabilir.

Alanlar:
- insurer
- policy reference
- claim number
- Damage record
- reported date
- adjuster/agent
- requested documents
- claim amount
- approved amount
- recovered/paid amount (Finance Insurance Recovery kayıtlarından derived, claim içinde bağımsız editable truth değildir)
- status
- notes

Lifecycle:
Draft
→ Submitted
→ Under Review
→ Approved
→ Paid
→ Closed

Alternative:
Under Review → Rejected → Closed

Insurance recovery/payment:
- Customer Payment değildir
- Refund değildir
- actual tahsilatın **tek finansal otoritesi Finance Center → Insurance Recovery** kaydıdır
- ilgili Insurance Claim'e bağlıdır
- Insurance Claim ekranındaki `recovered/paid amount`, bağlı Insurance Recovery kayıtlarının toplamından derived edilir; manuel olarak ikinci kez yazılmaz
- claim status `Paid` ancak authoritative Insurance Recovery toplamı onaylanan/tahsil edilebilir claim amount'ı karşılıyorsa oluşabilir
- customer balance'ı doğrudan ödeme gibi kapatmaz unless explicit liability/finance rule applies

---

# 59BE. DEPOZİTO BLOKE / ÇÖZME SÜRECİ

Deposit yalnız “bir sayı” değildir.

Rental Finance içinde:

- Required Deposit
- Deposit Held
- Deposit Applied
- Deposit Released
- Deposit Exception

## Lifecycle
Expected
→ Held
→ Released

or

Held
→ Partially Applied
→ Released (remaining amount)

or

Held
→ Applied

Opsiyonel:
Cancelled / Failed

## Deposit policy precedence

**Global/company Deposit Policy kendi içinde** şirket varsayılanı ve açık matching branch/class/vehicle-class/duration kural satırlarıyla `required`/`not required`, miktar + currency veya hesaplama sonucunu belirler (§84.2). Aynı özgüllükte çakışan kurallar uygulama hatası verir; rastgele seçim yoktur. Şubeye/sınıfa göre farklı tutar ayrı editable Rental depozito alanı anlamına gelmez. Ardından şu öncelik uygulanır:
1. Global/company Deposit Policy
2. matching Corporate Agreement deposit override (varsa)
3. formal Approval Center'da **Applied** durumuna geçmiş Deposit Exception (yalnız Approved yetmez; exact Rental + amount/currency)

Effective deposit requirement Rental pricing/finance snapshot'ında gösterilir.

## Kural
İlk sürümde gerçek POS/card authorization entegrasyonu şart değildir.

Operational record:
- tutar
- currency
- method
- reference
- timestamp
- actor
- note

Gerçek payment gateway olmadığı sürece:
“kartta bloke edildi” yalnız personel bunu gerçekten dış sistemde yaptıysa manuel kayıt olarak tutulur.

Deposit Held müşteri Outstanding'ını azaltmaz.
Deposit Applied yalnız mevcut authoritative Charge/Outstanding'a karşı uygulanabilir ve uygulanan tutar kadar Outstanding'ı azaltır.
Deposit Applied yine Customer Payment değildir; ayrı settlement source type'tır.
Deposit Released, customer Payment Refund değildir.
Deposit ≠ Revenue.

---

# 59BF. NO-SHOW

Reservation için gerçek durum:

**No-show**

Kullanım:
müşteri planlanan pickup süresini geçti ve aracı teslim almadı.

No-show aksiyonu:
- reason
- marked by
- timestamp
- note
- fee policy result if applicable

No-show:
Cancelled ile aynı değildir.

Raporlarda:
- reservation conversion
- no-show rate
ayrı görünür.

Fake penalty otomatik eklenmez; Pricing/Policy/Finance kuralları uygunsa uygulanır.

---

# 59BG. WAITLIST / BEKLEME LİSTESİ

Araç/sınıf kapasitesi yoksa kullanıcı:

**Bekleme Listesine Ekle**

yapabilir.

Alanlar:
- customer
- branch
- class
- desired pickup/return
- flexibility
- notes
- priority reason (manual factual label only)
- contact preference

Lifecycle:
Waiting
→ Offered
→ Accepted
→ Converted
veya Expired / Cancelled

Bir araç boşalınca sistem deterministic matching ile adayları gösterebilir.

Capacity semantics:
- Waiting / Offered / Accepted Waitlist kaydı kapasite tutmaz
- `Accepted` yalnız müşterinin teklifi kabul ettiğini gösterir
- `Converted` anında authoritative Availability tekrar doğrulanır
- kapasite uygunsa Reservation oluşturulur/Confirmed edilir
- kapasite yoksa conversion conflict olur; overbooking yaratılmaz

Otomatik müşteriye “yer açıldı” mesajı göndermez unless real messaging integration exists.

---

# 59BH. SEZON FİYAT TAKVİMİ

Pricing ekranında görsel **Season Calendar** bulunur.

Amaç:
belirli tarih aralıklarında base pricing değişikliklerini yönetmek.

Örnek:
- Low Season
- High Season
- Holiday
- Event Period
- custom period

Her dönem:
- date range
- branch optional
- class optional
- rate/multiplier/price rule
- priority
- active

Çakışma varsa:
tek merkezi demo policy evaluator deterministik precedence uygular ve UI preview sonucu gösterir.

Takvim:
pricing rule truth'un görsel yönetim yüzeyidir.

---

# 59BI. KURUMSAL FİYAT MATRİSİ

Corporate Account için özel ticari anlaşma:

- vehicle class
- branch
- valid date range
- daily / weekly / monthly pricing rule
- included km
- excess km price
- deposit rule
- discount/markup
- allowed extras terms

Versiyonlanır.

Yeni anlaşma eski Rental history'yi değiştirmez.

Reservation/Rental pricing için corporate agreement mode açık ve deterministic olmalıdır.

Her matching Corporate Pricing Matrix satırı **tek bir vehicle-rate mode** kullanır:
- **Override Rate:** matching class/duration için normal Vehicle Class + Season vehicle-rate sonucunun yerine corporate rate geçer.
- **Adjustment:** normal Vehicle Class + Season vehicle-rate sonucuna tanımlı discount/markup uygulanır.

Aynı satır hem Override Rate hem Adjustment kullanamaz.

Branch / one-way charge:
- corporate agreement açıkça özel kural tanımlamıyorsa global branch/one-way kuralından gelir.

Extras / mileage / deposit:
- corporate agreement açıkça override ediyorsa corporate term kullanılır
- override yoksa global authoritative kural kullanılır.

Kullanılan Corporate Agreement version ve pricing mode Quote/Reservation/Rental pricing snapshot'ına pinlenir; sonraki anlaşma değişikliği geçmiş fiyatı değiştirmez.

---

# 59BJ. PARTNER PERFORMANS EKRANI

Partner Detail içinde:

- referred Leads
- converted Reservations
- converted Rentals
- conversion rate
- earned commission
- paid commission
- outstanding commission
- lost lead reasons
- date filters

No arbitrary partner score.

Commission Earned ≠ Paid.

---

# 59BK. SUPPLIER PERFORMANS EKRANI

Vehicle Supplier Detail içinde factual metrics:

- sourcing requests
- confirmed vehicles
- cancellations
- late delivery count
- average supplier cost by class
- disputed settlements
- external Rental count
- document/readiness issues

No arbitrary supplier score.

Amaç:
manager/patron tedarikçi kararını gerçek geçmişle verebilsin.

---

# 59BL. ARAÇ SATIN ALMA / FİLOYA GİRİŞ GEÇMİŞİ

Internal Vehicle için filo giriş/acquisition capability V1'de vardır. Aşağıdaki alanlar yalnız veri mevcutsa doldurulur:

- acquisition date
- acquisition type
  - Purchase
  - Lease
  - Long-term rent
  - Other
- supplier/seller
- acquisition cost
- currency
- starting mileage
- invoice/document reference
- notes

Bu bilgi operational finance revenue değildir.

---

# 59BM. ARAÇ SATIŞ / FİLODAN ÇIKIŞ

Internal Vehicle asset lifecycle içinde:

Active
→ Out of Service
→ Disposed / Sold

`Sold` yalnız satışa hukuken konu olabilen **owned** araç için kullanılır. `Lease` / `Long-term rent` Internal araç sözleşme sonunda filodan çıktığında `Disposed` (fleet exit, satış değil) kullanılır; bu ayrım mülkiyet veya finansal kazanç simülasyonu değildir. Aktif Rental veya Confirmed future Reservation varken satış/filodan çıkış uygulanmaz; önce authoritative allocation/operasyonlar çözülür.

Disposal record:
- date
- type
- buyer
- sale amount
- currency
- final mileage
- notes
- documents

Historical Rentals/Damage/Maintenance korunur.

Vehicle hard-delete edilmez.

---

# 59BN. ARAÇ MALİYET GEÇMİŞİ

Vehicle Detail → **Maliyet Geçmişi**

Factual components (read-model/projection):
- Maintenance actual service cost
- Damage repair cost = linked Maintenance/source-linked Expense'tan derived
- Fine company-paid cost = linked Fine/Expense'tan derived
- External supplier sourcing cost = authoritative Supplier Settlement'tan derived; Internal `Lease` / `Long-term rent` gideri ise **yalnız gerçekten kayıtlı source-linked Expense/Finance kaynağı varsa** oradan derived; tanımsız ikinci `lease cost` truth'u üretilmez
- acquisition-related factual cost
- other supported source-linked Vehicle expense

Vehicle Cost History yeni editable maliyet truth'u değildir; authoritative source records'ı birleştiren read modeldir.

Dashboard/analysis:
vehicle cost trends.

Do NOT label:
“net profit”
unless complete accounting model exists.

---

# 59BO. SERVİS SAĞLAYICI / USTA YÖNETİMİ

Maintenance için **Service Providers** listesi bulunur.

Provider:
- business/name
- contact
- specialties
- branch/region
- notes
- active
- payment terms
- documents optional

Maintenance record:
provider reference.

Provider Detail:
- jobs
- estimated vs actual cost
- turnaround duration
- open jobs
- invoice references
- factual history

No arbitrary “best mechanic” score.

---

# 59BP. ARAÇ TEMİZLİK SAĞLAYICI / CAR WASH

Vehicle preparation içinde dış temizlik sağlayıcısı kullanılıyorsa:

- provider
- service date
- service type
- cost
- Vehicle
- Rental optional

Bu Maintenance ile karışmamalı.

Temizlik cost semantiği:
- source cost Vehicle Preparation/Cleaning service kaydında tutulur
- Expense posting gerekiyorsa source-linked Expense oluşturulur
- source-linked Expense amount'u source cost'tan gelir ve bağımsız değiştirilemez
- aynı maliyet ikinci kez manuel Expense olarak post edilemez

V1'de ayrı yeni provider domaini açılmaz; Service Provider modelinin kategori alanıyla çözülür.

---

# 59BQ. REZERVASYON KAYNAĞI / CHANNEL

Reservation/Lead kaynakları:

- Direct / Walk-in
- Phone
- Website
- Partner
- Corporate
- Returning Customer
- Other

`Website` source yalnız manual attribution olabilir (ör. müşteri şirketin ayrı web sitesinden ulaştı); ACARVO Public Booking yüzeyi olduğu anlamına gelmez.

Gerçek entegrasyon yoksa:
Booking.com/OTA gibi sahte live channel seçenekleri eklenmez.

Rapor:
hangi kanaldan ne geliyor?

No fake attribution.

---

# 59BR. MÜŞTERİ NOT / PREFERENCE

Customer Detail:
- operational notes
- language preference
- contact preference
- factual service preference

Avoid:
- sensitive profiling
- arbitrary personality/risk labels

Important note can require explicit permission.

---

# 59BS. CUSTOMER BLACKLIST / RESTRICTION SEMANTICS

Customer Detail açıklanabilir restriction kaydını destekler.

Binary “kötü müşteri” etiketi yerine:

- reason category
- note
- created by
- created at
- review/expiry optional
- active/inactive

Reservation:
uyarı verebilir veya policy block uygulayabilir.

No numeric risk score.

---

# 59BT. DUPLICATE CUSTOMER MERGE

Gerçek operasyonda duplicate Customer oluşabilir.

Admin/authorized merge flow:

- primary customer seç
- duplicate seç
- preview affected:
  - documents
  - reservations
  - rentals
  - tasks
  - incidents
  - notes
  - communication
- confirm

Historical records kaybolmaz.

Conflicting residency/identity fields varsa merge silent karar vermez; authorized user'a conflict preview gösterir ve açık çözüm ister. Historical Rental document pins merge nedeniyle değişmez.

Merge audited.

Bu destructive delete değildir.

---

# 59BU. RESERVATION CHANGE HISTORY

Reservation date/branch/class/vehicle/price changes:
human-readable history.

Shows:
- old
- new
- actor
- time
- reason where required

Audit remains deeper source.

---

# 59BV. RENTAL EXTENSION WORKSPACE

Extension:
- current return
- requested/new return
- authoritative availability
- pricing delta
- vehicle conflicts
- manager confirmation if configured/required (**inline domain confirmation; Approval Center type değildir**)
- request source recorded by staff (phone/branch/e-mail etc.)
- confirmation

External/Supplier Vehicle kullanılıyorsa:
- requested return, ilgili **Sourcing Engagement** confirmed availability window ve `supplier return due` sınırını aşamaz
- aşacaksa Rental extension uygulanmadan önce supplier tarafındaki sourcing/vehicle availability açıkça uzatılıp yeniden confirm edilmelidir
- sistem supplier return due tarihini sessizce ileri atamaz; ilgili engagement için supplier tarafından confirmed versioned extension gerekir
- supplier extension yeni maliyet doğuruyorsa pricing/settlement yeniden authoritative olarak hesaplanır ve kullanıcıya gösterilir

Extension approved ≠ automatically paid.

Contract update:
new version if commercial/legal terms change.

---

# 59BW. VEHICLE SWAP WORKSPACE

Active Rental can require vehicle change.

Flow:
- old Vehicle
- replacement Vehicle
- authoritative availability/readiness
- reason
- old vehicle return condition
- old vehicle km/fuel
- **old vehicle 4–5 immutable return-condition photos**
- new vehicle delivery condition
- new vehicle km/fuel
- **new vehicle 4–5 immutable delivery-condition photos**
- visible damage/equipment/key notes
- pricing impact
- contract version if required

Swap inspection evidence:
- old-return set ve new-delivery set ayrı tutulur
- normal Rental Handover/Return evidence standardıyla aynı metadata/immutability kurallarını kullanır
- Vehicle profil fotoğrafını değiştirmez
- old/new photo set birbirini overwrite etmez

Vehicle swap must preserve Rental history.

No silent overwrite of VehicleId without history.

---

# 59BX. EARLY RETURN / LATE RETURN

Return timing semantics:

- On Time
- Early
- Late

System:
- planned return
- actual return
- difference

Pricing impact yalnız tek paylaşılan demo business policy calculator tarafından belirlenir.

Late return:
- otomatik Notification ve deterministic Risk/Exception signal üretebilir
- otomatik Task **üretmez**
- Task yalnız insan tarafından contextual action ile oluşturulur
- Task oluşturulsa bile Rental source state'i otomatik değiştirmez

Early return:
does not automatically imply refund.

---

# 59BY. CANCELLATION WORKSPACE

Cancellation workspace:
- Reservation → lifecycle izin verdiği sürece Cancelled
- Rental → yalnız `Prepared` durumunda Cancelled; Delivered Rental cancel edilmez, Return/Close akışına gider
- Lead bu workspace ile Cancelled yapılmaz; kendi `Lost / Closed` lifecycle'ı ve lost reason kullanılır

Alanlar:
- cancellation reason
- actor
- time
- customer-requested / company / operational
- fee result if any
- refund result if any
- notes

Cancellation fee ≠ Payment.

Cancellation reasons feed factual reports.

---

# 59BZ. REFUND WORKSPACE

Refund:
- source payment
- amount
- currency
- reason
- approval requirement
- status
- reference
- actor

Refund cannot exceed valid refundable amount.

High/exceptional refund:
Approval Center.

Refund ≠ negative Charge.

---

# 59CA. FINANCIAL CLOSE CHECKLIST

Rental Financial Close ekranı:

- all charges reviewed
- payments reconciled
- deposit resolved
- refund completed if needed
- damage/fine pending?
- supplier cost visibility where external vehicle
- outstanding amount
- finance notes

## Financial Close default rules

Known finance items önce finalize edilir:
- all known Charges reviewed
- Payments reconciled
- Deposit resolved
- required Refund/Correction completed
- known chargeable Damage/Fine decision resolved or explicitly deferred by authorized policy

**Retail / direct customer payer:**
- customer-level Rental Outstanding > 0 ise Financial Close varsayılan olarak bloklanır
- outstanding > 0 iken kapanış yapılamaz; yetkili **Financial Correction** formal Approval Center süreciyle bakiye fiilen çözülmedikçe Financially Closed yapılamaz

**Corporate payer:**
- Rental üzerindeki finalized amount Corporate Receivable'a posted/transfer edilmişse Rental Financially Closed olabilir
- Corporate Account receivable daha sonra açık kalabilir
- bu durum `Rental Outstanding` ile `Corporate Receivable Outstanding` olarak ayrı gösterilir
- transfer aynı borcu iki yerde duplicate etmez

**External/Supplier Vehicle:**
- Supplier Settlement müşteri Rental finance'ından ayrı lifecycle'dır
- açık Supplier Payable tek başına customer Rental Financial Close'u bloklamaz
- supplier cost visibility yine checklist'te gösterilir

Financially Closed olduktan sonra yeni, sonradan gelen Fine/Damage gibi bir kayıt gerekiyorsa:
- Finance explicit `Reopened` olur
- reason/source gösterilir
- authorized post-close Charge/Correction uygulanır
- yeniden reconcile edilmeden Financially Closed yapılamaz
- Rental operational `Closed` durumu etkilenmez

Financial Close ≠ Vehicle Ready.

---

# 59CB. CUSTOMER STATEMENT

Customer Detail **operational statement gösterir**:

- Charges
- Payments
- Refunds
- Deposits
- Outstanding

By currency.

This is not official accounting statement unless explicitly defined.

---

# 59CC. CORPORATE STATEMENT / MUTABAKAT

Corporate Account:
- opening balance
- rental charges
- payments
- adjustments
- settlements
- closing balance

Period filter.

Statement is separated/grouped by currency; no cross-currency opening/closing balance is produced.

Export:
PDF/CSV/XLSX if authorized.

---

# 59CD. INTERNAL NOTES / PINNED WARNINGS

High-value records can have pinned internal warnings:
- Customer
- Vehicle
- Rental
- Corporate
- Supplier

Pinned warning:
- text
- creator
- time
- expiry optional
- permissions

Internal pinned warnings are never exposed to Partner Portal or any external surface.

---

# 59CE. DASHBOARD “BUGÜN” OPERASYON ŞERİDİ

Owner/Manager/Reception:
hour-aware list:

- upcoming pickup
- upcoming return
- overdue pickup
- overdue return
- pending vehicle prep
- missing docs
- contract unsigned

Sorted by actual operational time.

---

# 59CF. MULTI-BRANCH TRANSFER / DELIVERY OPERATIONS

Reservation where pickup/return branches differ:
one-way operational consequences visible.

Possible needs:
- vehicle transfer
- one-way fee
- pickup responsibility
- expected final physical location

Branch affiliation still separate.

---

# 59CG. LOCATION HISTORY

`Physical location` ACARVO_V1 içinde **operational location state** anlamına gelir; canlı GPS koordinatı anlamına gelmez. GPS hardware/live tracking V1 kapsamı dışındadır.

Vehicle location changes:
- branch/location state
- source action
- timestamp
- actor

Examples:
- belirli şubede
- In Transit
- With Customer
- Service Provider'da
- Supplier'da
- transfer
- rental delivery
- rental return
- maintenance
- supplier receive/return

Current location derived from authoritative latest location state.
History retained.

---

# 59CH. VEHICLE DOWNTIME

Fleet Analysis:
- maintenance downtime
- damage downtime
- readiness downtime
- external sourcing caused by unavailable own fleet

No fake cost-of-downtime unless authoritative inputs exist.

---

# 59CI. MAINTENANCE SERVICE SCHEDULE TEMPLATES

Per Vehicle/Class:
- every N km
- every N months
- whichever comes first

Examples:
- oil service
- filters
- tires
- inspection prep

Next due generated deterministically.

Maintenance event remains actual record; template is schedule policy.

---

# 59CJ. DOCUMENT EXPIRY RULE ENGINE CONNECTION

Vehicle/customer document expiry may:
- warn
- block delivery
- create command-center signal

depending on explicit policy.

Never silently block based on frontend logic.

---

# 59CK. PHOTO / EVIDENCE QUALITY UX

Photos should be operationally usable:
- thumbnail
- full-screen preview
- zoom
- capture slot label
- retake before submit
- original timestamp
- uploader
- context

No AI damage detection in ACARVO_V1.

---

# 59CL. USER PROFILE / PERSONAL PREFERENCES

User menu:
- profile
- password/security
- default branch if permitted
- language
- compact/comfortable density
- notification preferences

Personal preference cannot widen permissions.

---

# 59CM. SECURITY / SESSION UX

User-facing:
- session expiry warning where appropriate
- safe login redirect
- no lost unsaved form without warning
- current company/branch context visible
- permission-denied explanation

Production JWT varmış gibi UI metni kullanılmaz.

---

# 59CN. IMPORT / INITIAL DATA TOOLS

ACARVO_V1 authorized Admin için initial import araçlarını içerir:

- Vehicles
- Customers
- Corporate Accounts
- Suppliers
- Pricing catalog

CSV template-based import.

Rules:
- preview
- validate
- duplicate detection
- errors per row
- explicit confirm
- audit

No silent partial corruption.

---

# 59CO. EXPORT / BACKUP-FRIENDLY PRODUCT SURFACES

Authorized users can export operational lists/reports.

Demo export bir production database backup değildir.

Exports clearly state filters/date/currency.

---

# 59CP. HELP / FIELD EXPLANATIONS

Complex concepts get concise help text:
- Deposit
- Financial Close
- Vehicle Ready
- Supplier Vehicle
- Document requirement
- Approval state

Avoid giant onboarding tours.

Use contextual help.

---

# 59CQ. ACARVO_V1 PRODUCT QUALITY FREEZE

ACARVO_V1 means:
this file itself is the **V1 target**.

All capabilities are V1 unless they are explicitly listed under **V1 DIŞI / DECISION REQUIRED**.

`Optional/opsiyonel` labels describe record-level optionality, not release scope.

The agent may not silently downgrade a V1 capability into a later release.


# 59CR. PRICING PRECEDENCE — TEK FİYAT PIPELINE

Fiyat hesaplama sırası tek ve deterministik olmalıdır:

1. Vehicle Class base rate
2. Season/date rule
3. Corporate vehicle-rate mode (uygunsa: Override Rate **veya** Adjustment)
4. Branch / one-way rule (corporate agreement açıkça override etmiyorsa global)
5. Extras (corporate term varsa onu, yoksa global catalog'u kullan)
6. Mileage terms (corporate term varsa onu, yoksa global rule'u kullan)
7. Allowed discount / approval policy
8. Final authoritative total

Corporate Agreement hiçbir zaman aynı component'e hem override hem ikinci kez discount uygulayamaz.

Bütün pipeline (**seçili sigorta/koruma paketi, ek sürücü ve bunların vergileri dâhil**) tek transaction currency içinde çalışır. Eksik/mismatched currency component varsa hesaplama durur; ACARVO V1 **fiyat kalemlerini currency arasında gizlice dönüştürmez**. Sigorta için ilgili currency'de geçerli explicit package price row zorunludur; birden fazla eşit öncelikli satır varsa konfigürasyon çakışması gösterilir (§85.1). **Tahsilat döviz kurları yalnız ödeme/depozito uygulama/rapor amaçlıdır**; farklı currency tahsilatı §63–64 uyarınca desteklenir. Paket ücreti Pricing Snapshot'ta tek source olarak yer alır; Delivery'de base Charge ve confirmed Extension'da delta Charge idempotent doğar (§67, §85.2).

Base Reservation/Rental pricing dışında, lifecycle event'lerinden doğabilecek ek Charge türleri:
- return sonrası yakıt farkı
- return sonrası km aşımı
- Reservation no-show / cancellation fee
- Rental cancellation fee
- damage / fine

bunların her biri kendi source event/policy sonucundan doğar ve temel fiyat pipeline'ına gizlice karıştırılmaz. Aynı event için yalnız bir authoritative Charge oluşturulur.

Web konsepti için merkezi priceQuote/charge functions UI içinde tek hesap kaynağıdır; production fiyat otoritesi iddia edilmez.

---

# 59CS. SOURCE OF TRUTH / DOMAIN OWNERSHIP

| Gerçek | Tek otorite |
|---|---|
| Internal Vehicle asset lifecycle nedir? | Vehicle Asset Lifecycle; asset ownership/acquisition type Vehicle Acquisition |
| Internal owned vs leased/long-term managed source nedir? | Internal Vehicle Acquisition source type; Owned vs Managed raporları bu kayıttan derived |
| External Vehicle kalıcı master kimliği nedir? | External Vehicle Master |
| Supplier teklif/araç temin kararı nerede? | Sourcing Request (procurement) |
| Sourcing Engagement receive/return/archive lifecycle nedir? | Sourcing Engagement + Supplier Inspections |
| Araç kullanılabilir mi? | Availability; External Vehicle için Engagement confirmed future-allocation ve Received+Ready delivery-eligibility ayrımı |
| Class-only rezervasyon kapasitesi ne kadar? | Availability / Capacity service |
| Araç teslime hazır mı? | Vehicle Readiness |
| Araç nerede? | Vehicle Location |
| Araç güncel kilometresi nedir? | Vehicle Odometer event stream |
| Internal Vehicle branch güvenlik üyeliği nedir? | Vehicle Home Branch + web demo Branch Scope rules |
| External Vehicle branch güvenlik üyeliği nedir? | Active/selected Sourcing Engagement operatingBranch + web demo Branch Scope rules |
| Araç kime ait / kaynağı ne? | Vehicle Source / Supplier |
| Rezervasyon/Kiralama fiyatı | Pricing |
| Müşterinin finansal bakiyesi | Finance |
| Customer/Corporate tahsilatı nedir? | Finance / Customer-Corporate Payment |
| Supplier'a yapılan ödeme nedir? | Finance / Supplier Payment + Supplier Settlement |
| Partner komisyon ödemesi nedir? | Finance / Partner Commission Payment |
| Corporate commercial payer/credit context | Corporate Account |
| Corporate current exposure | Corporate Exposure service (receivables + unbilled commitments, by currency) |
| Depozito durumu | Finance / Deposit lifecycle |
| Belge yeterli mi? | Document Requirement |
| Rental hangi aşamada? | Rental lifecycle |
| Finans kapandı mı? | Finance lifecycle |
| Rental Outstanding nerede kapanır? | Rental Finance; Corporate transfer varsa Corporate Receivable |
| Partner komisyonu ne zaman hak edildi? | Partner Commission Policy + attributed Rental event |
| Partner komisyonu ödendi mi? | Finance / Partner Commission Payment; Partner ekranı derived/read-only |
| Tedarikçiye kesin borç/cost nedir? | Supplier Settlement / authoritative Supplier Payable |
| Tedarikçiye ne kadar nakit ödendi? | Finance / Supplier Payment; Settlement ekranı derived/read-only |
| Tedarikçiye verilen teminatın tutulma/iade/uygulama hareketleri nedir? | Supplier Security Deposit lifecycle/movements (Supplier Settlement altında) |
| Supplier outstanding / settlement state nedir? | Supplier Payable - applied Finance Supplier Payments - applied Supplier Deposit; derived/read-only, Disputed ayrı hold flag |
| Sigortadan ne tahsil edildi? | Finance / Insurance Recovery |
| Maintenance gerçek servis maliyeti nedir? | Maintenance |
| Damage repair progress/cost nedir? | linked Maintenance + source-linked Expense projection |
| Fine authority settlement nedir? | Fine; company expense posting varsa linked Expense |
| Roadside gerçek maliyeti nedir? | Roadside Assistance |
| Cleaning/preparation gerçek maliyeti nedir? | Vehicle Preparation / Cleaning source |
| Bu source maliyeti Expense olarak post edildi mi? | Expense lifecycle |
| Görev durumu | Tasks |
| Olay durumu | Incidents |
| Takvimde görünen olay | Source projection |
| Rapor rakamları | Authoritative source services |

Aynı gerçek ikinci bir modülde yeniden hesaplanmaz veya ayrı truth store olarak tutulmaz.

---

# 59CT. YENİ ÖZELLİKLERİN MENÜ / EKRAN YERLEŞİMİ

Yeni kabiliyetler sidebar'ı gereksiz büyütmez. **Sidebar'ın tek kesin listesi §4'teki 7 kategori / 36 başlıktır; bu bölümdeki terimler contextual alt görünümlerdir.**

- Vardiya Devri → Komuta Merkezi
- Key Custody → Vehicle Detail
- Vehicle Equipment Checklist → Vehicle Detail / Rental inspection
- Roadside Assistance → Operasyon → Olay Merkezi + Vehicle/Rental context
- Insurance Claim → Operasyon → Hasar Kayıtları → Damage Detail
- Waitlist → Reservations
- Service Providers → Maintenance & Service
- Vehicle transfer / tire-season / preparation → Vehicle Detail + Maintenance & Service context
- Vehicle acquisition/disposal → Vehicle Detail
- Supplier / External Vehicle / Sourcing → Customer & Commercial altında **Araç Tedarikçileri**
- Supplier Payables / Settlements → Finans içindeki related view
- Employee workload → Command Center
- Season Pricing / Corporate Pricing Matrix → Pricing
- Customer communication history → Customer Detail
- Deposit / Refund / Financial Close / Insurance Recovery → Rental Finance / Finans (contextual views; yeni sidebar yok)
- Hasar Kayıtları / Ceza Modülü → yalnız Operasyon sidebar altında
- Operasyon Riskleri + İstisna İnceleme → Kontrol & Analiz → Riskler ve İstisnalar sekmeleri (tek sidebar)
- Cash Drawer / Cash Session / Kasa Kapanışı → Finans → Şube Kasaları (tek editable cash screen)
- Exchange Rate Desk (editable) → Yönetim → Ayarlar → Döviz Kurları; Finans'ta read-only kur geçmişi ve direct link
- Platform Console → sadece Platform Super Admin'in ayrı üst demo bağlam değiştiricisi
- Import tools → Yönetim → Ayarlar / Admin Utilities
- Export actions → ilgili liste/rapor context'i

Her özellik kendi authoritative detayına linklenir; yeni gereksiz top-level modül oluşturulmaz.

---

# 59CV. VEHICLE PROFILE PHOTO RULE

Araç başına **en fazla bir aktif profil fotoğrafı** vardır.

- profil fotoğrafı eksik olabilir
- eksik profil fotoğrafı Reservation creation veya vehicle assignment'ı tek başına bloke etmez
- 4–5 fotoğraf zorunluluğu Rental Handover / Rental Return, Supplier Receive / Supplier Return ve Vehicle Swap (old-return ile new-delivery için **ayrı ayrı**) kanıt setlerine aittir; Vehicle master profil fotoğrafına uygulanmaz


# 59CW. CUSTOMER COMMUNICATION — V1 SINIRI

Customer communication history ACARVO_V1 içindedir.

V1:
- manual communication log
- follow-up/task linkage
- channel label (phone/e-mail/WhatsApp/yüz yüze vb.)
- actor/time/source context

V1 dışı:
- gerçek WhatsApp provider
- SMS provider
- e-mail delivery provider
- delivery/read receipt integration

Entegrasyon yoksa sistem gönderim yapılmış gibi davranmaz.

---

# 59CX. NOTIFICATION — V1 SINIRI

Internal Notification Center ACARVO_V1 içindedir.

V1:
- in-app notifications
- source links
- read/unread
- deduplication/noise control
- web in-app demo notification; native push altyapısı yok

V1 dışı:
- customer SMS notification
- customer WhatsApp notification
- transactional e-mail delivery automation

Provider yoksa “gönderildi” durumu üretilmez.

---

# 59CY. VEHICLE ODOMETER — TEK KM GERÇEĞİ

Vehicle'ın güncel kilometresi ayrı ekranlarda elle overwrite edilmez.

Authoritative odometer events:
- Vehicle acquisition / starting mileage
- Rental handover
- Rental return
- Vehicle swap old-return / new-delivery
- Maintenance completion
- Vehicle transfer start/end
- Supplier receive / supplier return inspection

Her reading:
- Vehicle
- event/source type + source id
- occurred at
- odometer km
- actor
- correction reference if applicable

Kurallar:
- `current odometer` chronological authoritative events'ten derived edilir
- yeni reading, olay zamanındaki önceki valid reading'den düşük olamaz
- yanlış reading sessizce rewrite edilmez; authorized correction + audit gerekir
- out-of-order historical entry current odometer'ı yanlış düşüremez
- bakım/km hatırlatmaları ve tire mileage hesapları bu authoritative odometer stream'i kullanır
- Vehicle Detail current mileage ikinci editable truth değildir

---

# 59CZ. CROSS-DOMAIN INVARIANTS — BAĞLAYICI YORUM MATRİSİ

Aşağıdaki kurallar kendi feature bölümlerini tekrar veri kaynağı haline getirmez; hepsi aynı source-of-truth kurallarının V1 acceptance için çapraz kontrolüdür.

| Sınır | Bağlayıcı kural | Tek kaynak |
|---|---|---|
| Reservation Pending | Specific seçilmişse dahi capacity/Vehicle hold yok; Confirm'da shared concept state recheck | Availability / Reservation |
| Class-only → specific/Rental | Reserve release + allocate/occupation atomik, self-conflict hariç | Availability/Capacity + Rental |
| Supplier sourcing | Request procurement terminal `Vehicle Confirmed`; receive/return yalnız Engagement + Inspection | Sourcing Request → Engagement |
| External Vehicle | Master kalıcı kimlik; branch/window/supplier due her engagement'a ait | External Master / Engagement |
| External availability | Confirmed window geleceğe rezervasyon; `Received + Ready` delivery | Availability + Engagement + Readiness |
| Retail finance close | Outstanding çözülmeden kapanış yok; formal Financial Correction dışında belirsiz approval yok | Finance / Approval Center |
| Rental exceptional terminals | Delivered → Loss Closed / Exception Closed, normal Returned/Closed yerine; Finance ve Vehicle state ayrı | Rental §71 + Finance + Availability |
| Approval & stage dependency | Altı formal Approval Center akışı Stage 1'de tamam; Stage 6 yalnız Fleet/Supplier entegrasyonu | Stage 1 Approval Center + Stage 6 integrations |
| Advance/Charge primitives | Stage 0 ortak demo event/allocation; Stage 3'te kaparo, Stage 4'te Charge, Stage 5'te tam Finance UI | Shared demo truth + financial UI |
| Corporate credit | Currency başına bir aktif CreditLimit; `Prepared` dahil unbilled Rental commitment kapanışa kadar kalır, post edilen receivable ile duplicate olmaz | Corporate Exposure + Finance |
| Corporate identity docs | Rental File uygulanmış Document Requirement exemption/versions snapshot'ı | Document Requirement / Vault |
| Supplier payable | Cost Supplier Settlement; nakit ödemeler Finance; deposit application ayrı mahsup | Supplier Settlement + Finance |
| Supplier settlement status | Open/Partially Settled/Settled derived; Disputed bağımsız hold | Supplier movements projection |
| Tire servis maliyeti | Tire history ayrı event; actual cost tek linked Maintenance | Tire history + Maintenance |
| Supplier required docs | Settings policy edit surface; Document Requirement gate, eksikse Not Ready | Document Requirement + Readiness |
| Insurance/Damage/Fine | Tahsilat/repair/payment otoriteleri ayrı; duplicate Charge/Expense yok | Finance/Maintenance/owner |
| Web teslim/iade workspace | Internal web formunda signature ve limited finance read yalnız demo-role yetkisiyle | Shared web concept domain state |
| Calendar | Gün/Hafta/Ay/Agenda dördü V1, tümü source projection | Calendar projections |
| UI completion claims | Stage dependency ve ilgili web test tamamlanmadan PASS sayılmaz | Stage plan + Part III acceptance |

Aynı fact için iki editable otorite veya fake transition ortaya çıkarsa implementasyona devam etmeden tek source üzerinden düzeltilir. Acceptance checklist / wave planı domain lifecycle'ını yeniden tanımlamaz.

---

# 60. WEB CONCEPT FREEZE RULE

ACARVO'nun bu dosyasında ``ACARVO Global WEB Konsept V1`` ana otoritedir. Ürün özellikleri sessizce silinmez; bununla birlikte eski ``backend/native mobile rebuild`` cümleleri artık implementasyon talimatı değildir. Güncel global web konsepti için §61–81 iş modeli, §82 ekran/workspace sözleşmesi, §83 sözleşme-imza-sürücü-görev davranışları ve **§84 sigorta/depozito-çıktı davranışları birlikte bağlayıcıdır**; §84, §63–70/§59BE gibi lifecycle ve tutar otoritelerini geçersiz kılmaz. Part III yalnız bunların testidir.

**Web concept ≠ production system.** Yasal/ticari gerçek işlemlerle demo işlemler dürüstçe ayrılır.

---

---

# 61. GLOBAL WEB-ONLY CONCEPT — SÜRÜM SINIRI VE DEĞİŞMEZ İLKELER

Bu bölüm, eski teknik rebuild planının yerine geçen **ACARVO Global Web Yönetim Paneli V1 Konsept** kararlarını tanımlar. Önceki ürün maddeleri kapsam envanteri olarak korunur; çakışma halinde buradaki güncel web-konsept kuralları uygulanır. Ayrı mobil uygulama, backend, API, veritabanı, background scheduler, gerçek finans/banka/POS, SMS/e-posta sağlayıcısı ve production auth geliştirmesi **bu teslimatın işi değildir**. Bu durum tasarlanan ürün kabiliyetlerinin silinmesi anlamına gelmez.

- Tek teslimat: **web tarayıcısında çalışan, yüksek kaliteli, etkileşimli rent-a-car SaaS yönetim paneli konsepti**.
- Hedef: Google AI Studio üzerinden React + TypeScript tabanlı gerçek sayfa/form/state tasarımı; prototip yerel state ve açık etiketli DEMO kalıcılığı kullanabilir.
- Konseptte oluşturma, düzenleme, filtreleme, iş akışı, fiyat/kur/vergi/tahsilat hesapları görünür şekilde çalışır; salt tıklanabilir boş buton kabul edilmez.
- DEMO kayıtları gerçekte kaydedilmiş tahsilat, mali belge, e-posta, dış kullanıcı oturumu veya ödeme kanıtı gibi sunulamaz.
- Şirket, şube ve kullanıcı rolleri birer konsept scope'udur; bunlar production veri izolasyonu veya gerçek güvenlik garantisi değildir.
- Mobile-specific native uygulama bölümleri, push sağlayıcısı ve App Store/Play Store akışları **çıkartılmıştır**. Web kendi içinde 1440/1024/768 ve uygun ekranlarda responsive olur; dış Partner Portal web olarak kalır.
- Web üzerinden kamera/dosya seçimi ve imza canvas'ı işlevsel olabilir; native SDK veya gerçek dış servis kullanılmaz.
- ``SaaS`` = tenant/company seçimi, ilk kurulum, platform kontrol ekranı ve abonelik konsepti; **gerçek SaaS billing/operasyon altyapısı değildir**.

## 61.1 Tek kapsam sözü

Ayrıca açıkça V1 dışı denmedikçe kaynak ürün envanterindeki bütün **web** özellikleri V1 UI konsepti içindedir. Eski teknik teslim kriterleri (PostgreSQL, NestJS, HTTP integration, migration, S3 vb.) konsept UI'sı için kabul şartı sayılmaz. Eski ``server-authoritative`` ifadeleri konseptte **tek paylaşılan iş kuralı simülatörü** olarak anlaşılır; güvenli sunucu çalıştığı iddia edilmez.

# 62. GLOBAL PARA BİRİMİ KATALOĞU — DÜNYA GENELİ

## 62.1 Tüm dünyaya açık katalog

- Para birimi seçicisi yalnız EUR/BAM/USD'ye sınırlanmaz: **güncel ISO 4217 para birimleri kataloğunun tamamı** kod + ad + sembol + hassasiyet + yerel ad ile aranabilir olmalıdır.
- Örnekler: EUR, USD, BAM (Bosna konvertibl markı / KM), GBP, CHF, TRY, CAD, AUD, SEK, NOK, DKK, PLN, CZK, HUF, RSD, AED, SAR, JPY, CNY, INR, BRL, MXN, ZAR, XOF, XAF ve katalogdaki diğer tüm güncel paralar. Örnekler bir izin listesi değildir.
- Katalog verisi zaman içinde değişebildiği için UI, ``catalogVersion``/güncelleme tarihi gösterir; üretimde güncel ISO verisi ayrı yasal/veri doğrulama işi olacaktır. Geçersiz/çekilmiş kodlar geçmiş kayıtların render edilmesini engellemez; yeni ödeme için varsayılan olarak pasiftir.
- Şirketin **base/accounting display currency**, şubelerin operasyon/yerel para birimleri ve kabul ettiği tahsilat para birimleri birbirinden ayrı seçilir.
- Ülkeden otomatik para birimi varsayılanı önerilebilir ama kullanıcı dilediği geçerli para birimini seçebilir. Her şirket isterse birden fazla aktif kabul currency tanımlar.
- ISO currency exponent dikkate alınır: tüm paralar otomatik 2 ondalıklı değildir (ör. JPY 0; KWD/BHD 3). Yuvarlama sonucu ve hassasiyet ekranda açık görünür.
- Döviz kuru olmayan para çiftinde gizli çevrim yapılmaz; ödeme kaydı için kura ihtiyaç varsa UI bunu açıkça ister.
- Para biriminin **görüntüleme para birimi**, kiralamanın **borç/transaction currency**'si ve tahsil edilen **payment currency** üç ayrı alan/gerçektir.
- Kripto, değerli metal, puan gibi ISO dışı ödeme araçları normal para listesine sessizce eklenmez. İleride ayrı ticari kararla açılabilir.

## 62.2 Şirket/şube para birimi ayar ekranları

**Yönetim → Ayarlar → Şirket → Para Birimleri**:
- Ana görüntüleme/raporlama para birimi; kabul edilen currency listesi; varsayılan teklif/kiralama currency'si.
- Şube bazında default/accepted cash currencies; card/transfer için accepted currencies; default cash drawer currency listesi.
- Her currency için ISO adı/kodu, etkin/pasif, tarih, form display, ISO hassasiyet.
- Şirketin bazı currencies'i aktif etmemesi, global arama kataloğundan o paranın silinmesi demek değildir.
- Fiyat kataloğunun para birimi ile müşteri ödemesinin para birimi karıştırılmaz; fiyatlar önceden tanımlı price currency'de veya açık yeniden teklif kurallarıyla üretilir.
- Roller: kur tanımlama, ödeme girişi, geçmiş ödeme düzeltmesi, ödeme iptali, kasa kapatma ayrı permission action'larıdır.

# 63. ADMİN KONTROLLÜ DÖVİZ KURLARI — MANUEL VE İZLENEBİLİR

## 63.1 Kurlar ekranı

**Yönetim → Ayarlar → Döviz Kurları (Exchange Rate Desk)** tek yetkili kur düzenleme web ekranıdır. Finans içindeki kur göstergesi/geçmişi read-only'dir; düzenleme buraya deep-link ile ulaşır. Admin/finance yetkilisi:
- ``1 [base] = [rate] [quote]`` biçiminde alımda kullanılacak **işletme kuru** tanımlar. Örnek: ``1 EUR = 2.00 BAM``.
- Para çifti, ``kullanım amacı`` (müşteriden tahsilat, refund, depozito Charge'a mahsup, rapor görüntüleme), şirket/şube kapsamı, effective-from / valid-until, giren kişi, tarih, açıklama, aktif/süresi dolmuş durumunu görür.
- Farklı şubeler aynı para çiftine farklı ``müşteriden kabul edilen`` kur koyabilir; Company default ancak branch override yoksa uygulanır.
- Admin isterse ``EUR→BAM`` ve ``BAM→EUR`` yönleri için **farklı işletme kurları** tanımlar. Tersini matematiksel olarak hesaplamak sadece ``karşılıklı otomatik ters kur kullanılacak`` açıkça seçildiğinde mümkündür.
- Kurun kaynağı ``İşletmenin elle belirlediği kur`` olarak etiketlenir. Merkez bankası, piyasa, anlık veya resmi kur gibi gösterilmez.
- Bir işlemde rate override gerekiyorsa eski rate overwrite edilmez: yetkili override gerekçesi ve eski/yeni kuruyla ayrı işlem snapshot'ı oluşur.
- Kur tarihleri/önceliği: explicit transaction-specific authorized override > branch aktif rate > company aktif rate. İki eş geçerli rate çakışıyorsa net configuration error; ilk kayıt rastgele seçilmez.
- İşlem sırasında kullanılan kur **payment line snapshot** içinde korunur; admin daha sonra kuru değiştirince geçmiş payment equivalent amount yeniden hesaplanmaz.
- Kur tablosu ``geçmiş, aktif, gelecekte geçerli olacak`` filtreleriyle listelenir. Admin confirmation modal: ``Bu kur yeni işlemlerde kullanılacak; eski tahsilatlar değişmeyecek``.
- Negatif/sıfır/sonsuz kur kabul edilmez; sayısal gösterim yeterli hassasiyettedir; sonuçta round yalnız currency'nin minor unit adımında yapılır.

## 63.2 Hesaplama kuralı ve açık örnek

Quote ``EUR``, tahsilat ``BAM`` ise; örnek işlem kuru ``1 EUR = 2 BAM``:

``Payment 200 BAM`` → kira borcuna mahsup edilen ``100 EUR`` (200 / 2).

Eğer oran ``1 EUR = 2 BAM`` iken kullanıcı ``100 EUR`` borcunu BAM ile ödemek isterse ``200 BAM`` tahsil edilir. Her ödeme satırında **tahsil edilen nominal amount+currency**, **kur yönü/değeri**, **kira currency'sine uygulanan equivalent amount**, **rounding farkı**, **giren kişi** ayrı gösterilir.

- Kira fiyatını EUR yazdık diye EUR/BAM/USD nakit/kart tahsilatlarını aynı para toplamına eklemeyiz.
- **Outstanding**, yalnız kira para birimine çevrilmiş ve kayda uygulanmış equivalent amounts üzerinden bulunur.
- ``Kasa EUR`` ve ``Kasa BAM`` fiziksel nakitleri kendi orijinal currency'leriyle sayılır; converted EUR eşdeğerleri fiziksel kasanın yerine geçmez.
- FX kur farkı/yuvarlama bir **konsept açıklama satırı**dır; gerçek muhasebe/fiskalizasyon hesabı gibi sunulmaz.
- Tek bir payment line için tek belirlenmiş rate snapshot vardır. Aynı line'ı iki kez mahsup etmek engellenir.

# 64. PARÇALI, ÇOK KİŞİLİ, ÇOK YÖNTEMLİ TAHSİLAT

## 64.1 Tek kiralamaya sınırsız ödeme satırı

**Rental Detail → Finans → Ödemeler** iş akışı:
- Primary action ``Ödeme Ekle`` ve ilgili ``Tahsilatlar`` tablosu.
- Her satır: payer kişi/kurum, payment method, tender currency, tender amount, branch/register, işlem anı, staff, referans, seçili exchange rate snapshot, applied equivalent amount, linked obligation, note, status.
- Yöntemler: **Nakit, Kart (POS'tan gerçekten geçirilmişse referans kaydı), Banka Havalesi/EFT, Online/Diğer Dış Yöntem**. Gerçek POS veya gateway çalışmıyorken ödeme gerçekleşmiş gibi bildirim üretilmez.
- Bir Rental için 1, 2, 3, 4, 10... ödeme satırı olabilir; limit sabit 4 değildir.
- Aynı kişi iki ayrı currency veya iki ayrı yöntemi kullanabilir. Farklı kişiler kendi currency/yöntemleriyle katkıda bulunabilir.
- ``Payer``: kiracı kişi, Corporate Account, farklı kişi, başka kurum; payer selection/suggestion + manuel girilmiş 3. tarafın ad/reference'ı. **Tahsilatı yapan kişi** ile sözleşmeden **hukuken sorumlu müşteri** aynı kabul edilmez.
- Çok kişili ödeme yasal sorumluluğu otomatik bölmez. ``Split responsibility`` ayrı sözleşmesel/kurumsal karar gerektirir; bu V1 ödeme tahsisinde yalnız **kim ne ödedi?** sorusu takip edilir.
- Tamamlanan ödeme satırı sessizce silinmez/değişmez; ``Void/Reversal/Correction`` audit izli ayrı işlem olarak gösterilir.
- Overpayment default olarak engellenir veya açık şirket politikasına göre **Unapplied Credit / refund candidate** gösterilir; negatif Outstanding yapılıp gizlenmez.
- Payment status: ``Planned`` (yalnız taksit planı), ``Recorded`` (manuel gerçekten dışarıda tahsil edildi bilgisi), ``Applied``, ``Voided/Refunded``; Planned tahsil edilmiş sayılmaz.
- Payment proof/receipt yalnız manuel evidence/reference veya konsept ön izlemesi; otomatik bankadan çekilmiş gibi yazılmaz.
- Reservation → Rental, Rental → Corporate Receivable, Refund, Deposit Applied ve Supplier/Partner payment ayrı hareket türleri kalır; ``Collected`` KPI yalnız müşteri/kurumsal **gelen** tahsilatları içerir.

## 64.2 İstenen somut senaryo: 4 ayrı ödeme ve 3 kişi

**Örnek yalnız demonstrasyon amaçlıdır; kur değerleri piyasa/veri kaynağı iddiası taşımaz.** Rental toplamı ``500 EUR``. Başta yalnız **işletme kuru** ``1 EUR = 2 BAM`` tanımlıdır; **USD kuru yoktur**. İlk iki satır uygulanınca Outstanding ``300 EUR`` kalır. Kişi B'nin üçüncü ödeme satırı ``100 USD`` olarak **henüz kaydedilmemiş form taslağında** bekler; kur olmadığı için **henüz tahsilat/Applied sayılmaz** ve Outstanding ``300 EUR`` kalır. Şubede USD tender ve USD nakit kasası önceden etkinleştirilmiştir; bunlar USD→EUR kurunun tanımlı olduğu anlamına gelmez. Admin daha sonra örnek ``1 EUR = 1.25 USD`` işletme kurunu tanımlayıp üçüncü ödemeyi onaylar: ``100 USD = 80 EUR`` uygulanır, Outstanding ``220 EUR`` olur. **Ancak bundan sonra** Kişi C'nin dördüncü ödeme tutarı ``220 EUR`` olarak hesaplanır.

| Sıra / ödeyen | Yöntem | Tahsilat | Uygulanan EUR (kur tanımlandıktan sonraki sonuç) | İşlem sonrası kalan |
|---|---|---:|---:|---:|
| 1 · Kişi A | Nakit | 100 EUR | 100 EUR | 400 EUR |
| 2 · Kişi A | Kart | 200 BAM | 100 EUR | 300 EUR |
| 3 · Kişi B | Nakit | 100 USD | 80 EUR (örnek kur: 1 EUR = 1.25 USD) | 220 EUR |
| 4 · Kişi C | Banka transferi | 220 EUR | 220 EUR | **0 EUR** |

- **Ön-koşul:** 3. satır yalnız USD rate tanımlanıp işlem için snapshot pinlendikten sonra Applied olur; rate yokken bu satır yalnız UI form taslağı olarak `Awaiting Rate` doğrulama hatası gösterir, **persisted Payment status değildir** ve kalan borç **300 EUR**'dur. 4. satır henüz kesinleştirilmez.
- **Sıralama:** 1 → 2 → (USD kuru tanımı) → 3 Apply → **kalan 220 EUR yeniden hesapla** → 4 Apply. USD tutarı veya kuru değişirse 4. satırın miktarı yeniden hesaplanmadan onaylanamaz.
- Tahsil edilen dört ödeme satırı **yalnız üç ayrı kişiye** aittir (A iki kez, B bir kez, C bir kez). EUR ve USD nakit kendi para birimi kasalarına gider; BAM **kart** nakit kasaya girmez.
- Tek payment satırının currency'si diğer satırların currency'sini değiştirmez.

## 64.3 Parçalı tahsilat vs geleceğe dönük ödeme planı

**Parçalı tahsilat**: aynı an veya farklı zamanlarda gerçekleşmiş çoklu ödemeler.

**Ödeme/Taksit Planı**: gelecek vadeli beklenen ödeme kayıtları; plan satırı ``unpaid`` kalır, kasada/Collections'da yer almaz. Vade, planlanan payer/currency/method, beklenen kur bilgisi opsiyoneldir ama **kesin tahsilat kuru ancak actual payment anında pinlenir**. ``Planlandı / Kısmen Ödendi / Gecikti / Tamamlandı`` ayrımı yapılır; gerçek ödeme satırı plan taksidine linklenir, plan para hareketi yaratmaz.

## 64.4 Global payment allocation

- Bir Incoming Payment bir veya daha fazla eligible Charge/Receivable'a uygulandığında allocation satırlarının toplamı payment'ın available applied-equivalent'ını aşamaz.
- Rental borç currency'sinden farklı tender currency için explicit kur şarttır.
- Charge, Payment, Deposit Applied, Prepayment Applied, Refund ve Credit farklı ledgers/kategorilerdir; yalnız doğru allocationlar Outstanding'ı azaltır.
- Void/reversal gerçekleşirse allocation geri alınır; related Outstanding yeniden projekte edilir; geçmiş event saklanır.
- Finans summary her döviz cinsi ve kaynak türünü ayrı gösterir; cross-currency görünüm yalnız açık rate-aware converted reporting'dir ve ``converted estimate`` etiketi taşır.

# 65. ÖN ÖDEME / KAPARO / AVANS — RESERVATION'DAN RENTAL'A

- **Reservation Prepayment** V1 web finans akışıdır. Rental oluşturulmadan da müşteri/kurumdan alınabilir; ödenen nominal currency/method/kur/reference/payer/makbuz notu kaydedilir.
- Prepayment, Reservation üzerinde ``Held as customer advance``, ``Applied to Rental``, ``Refunded``, ``Forfeited as policy fee`` durumlarına sahiptir; bunlar ödemenin kendisi ile mahsup hareketini karıştırmaz.
- Confirmed/Pending Reservation'da avans olabilir; capacity/confirmation bu ödeme yüzünden otomatik değişmez.
- Reservation→Rental conversion: avans **atomik olarak tek kez** Rental'ın ``Unapplied Advance`` bakiyesine bağlanır; **Base Charge henüz Posted olmadığı için conversion'da Charge/Receivable'a mahsup edilmez**. ``Delivered`` ile Base Charge Posted olunca avans o charge'a bir kez Applied edilir. Conversion/Delivery tekrar çağrılırsa duplicate Payment/Charge/Allocation oluşmaz.
- Reservation iptal/no-show olursa açık politika uygulanır: refund, fee'ye mahsup veya unapplied credit; avansı otomatik revenue yazma.
- Prepayment currency Rental currency'den farklıysa uygulama sırasında hangi rate'in kullanılacağı şirket politikasında ``collection-rate snapshot`` (önerilen V1 default) veya explicit authorized transfer-rate olarak tanımlıdır; her durumda applied EUR-equivalent idempotent ve görünürdür.
- **Depozito kaparo değildir**: Security Deposit ayrıca tutulur, normal ödeme sayılmaz; Deposit Applied yalnız ilgili Charge'a mahsup edildiğinde Outstanding azalır.

# 66. GLOBAL VERGİ / KDV / VAT / PDV GÖRÜNÜMÜ

## 66.1 Genel vergi modeli

**Settings → Vergi Kuralları**: şirket/şube/jurisdiction, tax code/name (VAT/KDV/PDV/GST/Sales Tax vb.), inclusive/exclusive pricing, oran, effective dates, applicable product/charge types, exemptions ve istisna gerekçesi, display/invoice label.

- Kanuni vergi oranını veya fiskal kuralı ülke adına otomatik doğru kabul etme; admin gerektiğinde oranı konfigüre eder, UI ``hukuki doğrulama gerekir`` işaretler.
- Charge snapshot şu alanları taşır: ``net amount``, ``taxable base``, ``tax lines`` (tax code, rate, value, inclusive?), ``gross/total``, currency, rule/version/date, exemption reason, source.
- ``Tax included`` = gross verilir, net/tax ayrıştırılır; ``tax excluded`` = net + tax gross hesaplanır. Her bileşen kendi currency'sinde çalışır.
- Extra, one-way, mileage, cancellation/no-show, damage compensation, insurance packages, deposit application, refund gibi türler için **tax treatment** tanımlanır; her kategori otomatik aynı oranı almaz.
- Voucher/refund/credit için kaynak Charge'ın vergi snapshot'ına referans verilir; refund hesaplaması vergi dahil/hariç görünümü açıklamadan gizli yapılmaz.
- İlk ürün turunda gerçek eInvoice, fiskal cihaz, ülke mevzuatına uygun fatura üretimi vaat edilmez. **Fatura/fiş örnek ön izlemesi ve PDF/print web tasarımı** gerçek mali belge değildir.
- Bosna (BAM/KM/PDV dahil) ve diğer ülkelerdeki fiskalizasyon, vergi, kayıt/serbest piyasa kur kısıtları için **ülke bazlı hukuki doğrulama** ayrı yayın şartıdır. Konseptte ``compliance review required`` flag'i bulunur.
- Çoklu para tahsilatı, vergi matrahını ödeme currency'sine gizlice taşımaz: Rental obligation/tax snapshot aynı transaction currency içindedir; ödeme kur farkı yalnız settlement tarafında gösterilir.

## 66.2 Örnek vergi gösterimi

``Base + Extras (net) 100 EUR``; adminde örnek **%20 VAT (exclusive)** girilirse ``tax 20 EUR; gross 120 EUR``. Aynı ``120 EUR`` inclusive fiyat için örnek net ``100 EUR``, vergi ``20 EUR``. Bu oran yalnız hesaplama demo örneğidir; ülkeye ait bir yasal iddia değildir.

# 67. KİRALAMA ÜCRETİ / CHARGE TETİKLEYİCİLERİ — TEK ZAMANLAMALI GERÇEK

- ``Quote`` fiyat ön izlemesidir, **Charge değildir**.
- ``Pending/Confirmed Reservation`` commercial commitment yaratabilir, fakat **Base Rental Charge değildir**; Reservation fee/no-show charge kendi ayrı source event/policy'siyle oluşabilir.
- **Base Rental Charge** tek kez, Rental ``Delivered`` durumuna kesin geçtiğinde, frozen pricing snapshot + tax breakdown ile ``Posted`` olur. ``Prepared`` aşamasında price commitment görünür fakat Charge değildir.
- Reservation prepayment Delivered'dan önce alınmış olabilir; posting sonrası Charge/Receivable'a mahsup edilir. Rental Delivered olmayan iptal senaryosunda avans aynen kalır ve explicit policy ile çözülür.
- Extension: değişiklik confirmed edilmeden önce **eski/yeni kira dönemi + mevcut Coverage snapshot/eligibility + seçili paket için ek gün veya sabit fee politikası + vergi** içeren tek repricing ``delta preview`` üretilir (§85.2). Paket ücretlendirmesi yeniden işlemde tek kez yer alır; otomatik kopyalanmış ikinci insurance Charge yoktur. **Extension difference Charge** yalnız onaylanmış extension event'inde bir kez Posted olur (negative delta varsa Credit/Correction policy). Bu işlem önceki Base Charge'ı rewrite etmez.
- Vehicle swap: pricing delta gerekiyorsa swap event'i gerçekleştiğinde ayrı source-linked Charge/Credit; Base Rental Charge ikinci kez üretilmez.
- Return: actual return finalize olunca late return, extra mileage, fuel difference gibi kalemler policy snapshot ile **ayrı** Charge/Credit olaylarına dönüşür; ön izleme Charge değildir.
- No-show/cancellation fee: policy condition'u ve kullanıcının confirm'ü tamamlandığında Reservation/Rental kaynaklı ayrı Charge; ``no show`` sadece tıklama ile her durumda otomatik ücret demek değildir.
- Post-close Fine/Damage: authorized ``Reopened`` finance workflow gerekir; geçmiş close event silinmez.
- Customer, Corporate, Partner Commission ve Supplier payable hesapları her zaman source event ve exact amount/currency snapshot'a referans verir; line/Charge aynı source event için iki kez post edilemez.
- **Financially Closed** şartları: posted charge'lar reconcile, open customer Rental Outstanding 0 ya da Corporate Receivable'a düzgün transfer, required deposits/refunds resolved. ``Open → Financially Closed`` doğrudan mümkündür; ``Partially Settled`` zorunlu ara durak değildir.

# 68. RENTAL SÜRE, GÜNLÜK/HAFTALIK/AYLIK KADEME VE GEÇ İADE

**Settings → Kiralama Süresi & Fiyat Zamanlaması**:
- Şube timezone/locale, pickup-return business hours, minimum rental duration, daily unit (default 24 saat), round-up policy, grace period dakika, late-return billing step, early-return repricing/credit policy.
- Gün hesabında şirket/şube eşiği belirlenir. V1 önerilen demo default: **24 saatlik blok; tam kısmi blok yukarı yuvarlanır; 0-60 dakika tolerans ayarlanabilir; minimum 1 gün**. Bu oran evrensel zorunluluk değil, editable prototip default'udur.
- Price catalog normal müşteriler için daily/weekly/monthly tier destekler; corporation ayrıca corporate matrix moduna sahip. Seçilen kademenin hangi tarihte/kaç saatte devreye girdiği preview breakdown'da gösterilir; örn 7 günlük paket ile 7 x günlük arasındaki öncelik explicit config'dir.
- Season period/day boundaries, branch-local timezone, daylight saving değişimi açıkça ele alınır. Konsept tarihleri salt ``UTC günleri`` diye hesaplayıp bir günü yanlış kesmez.
- Grace period operasyonel overdue uyarısı ile **ücrete tabi geç iade** hesaplamasında ayrı display alanlarıdır; aynı politika kurala dayandırılır.
- Extension fiyatı kaynak Rental commercial terms **ve seçilmiş Coverage** snapshot'ı + geçerli repricing policy ile hesaplanır; kullanıcıya eski/yeni toplam, **sigorta ek süre bedeli**, paket uygunluk/kapsam süresi, delta, tax diff, depozito değerlendirmesi ve uygulanacak tarih gösterilir. Sigorta kapsamı eksik/uygunsuzsa süre değişimi sessizce tamamlanmaz; yetkili açık paket seçimi/yeniden sözleşme gerekir (§85.2).
- Corporate rate override/adjustment yalnız bir kez uygulanır; rental tier / season / discount precedence tek paylaşılan hesaplama fonksiyonunda örneklenir.
- Kullanıcı fiyatı yetkisiz serbestçe değiştiremez; manual adjustment varsa mevcut High Discount/Financial Correction tipleri veya açık recorded operational permission action kullanılır, yeni Approval Center type icat edilmez.

# 69. SÜRÜCÜ YAŞI, EHLİYET GEÇMİŞİ VE BELGE GEÇERLİLİĞİ

**Settings → Sürücü Uygunluğu** company/branch/class policy:
- minimum sürücü yaşı, opsiyonel maksimum yaş kuralı, ehliyetin alınmasından beri minimum yıl, ehliyet kategorisi/class uygunluğu, expiry-date window (pickup/return), yabancı sürücü için gerekli belge policy'si, manual verification flag.
- Yaş hesaplaması doğum tarihinden **planned pickup tarihi itibarıyla**, ehliyet deneyimi ise issue date'den pickup'a kadar yapılır; yalnız ``ehliyeti var`` boolean yeterli değildir.
- Ehliyet/kimlik/pasaport dokümanı Rental süresi içinde bitecekse net blocker/warning gösterilir; şirket policy'si son güne kadar geçerli olması gerektiğini tanımlar.
- Identity document snapshot ve privacy policy uygulanır; rule result: Eligible / Review Required / Blocked, hangi kuralın tetiklendiği ve ne yapılacağıyla beraber gösterilir.
- Corporate exemption yalnız izin verilen identity document *checklist*'ini etkiler; sürücü yaşı/ehliyet yasal uygunluk koşullarını otomatik kaldırmaz.
- V1 WEB konseptinde **birincil ve birden çok ek yetkili sürücü** Rental içinde ayrı ayrı kimlik, ehliyet ve uygunluk kontrolleriyle yönetilir (§83.3). Üç farklı ödeme yapan kişi, sırf ödeme yaptığı için sürücü sayılmaz. Her ek sürücü ayrı açıkça seçilip doğrulanmadıkça sözleşmenin yetkili sürücü listesine girmez; yasal sorumlu kiracı/kurumsal taraf ayrı tutulur.

# 70. SİGORTA PAKETLERİ / CDW / SCDW / DEDUCTIBLE

**Yönetim → Ayarlar → Sigorta Paketleri** tek düzenleme merkezidir; paket tutarı birden fazla işlem para biriminde kullanılacaksa **currency bazında ayrı price row** tanımlanır (payment FX dönüşümü yoktur; §85.1). Rental formunda **Sigorta & Muafiyet** adımı ve Damage Detail'da **Coverage Analysis** bulunur. Paketin kapsamı, uygulanabilirlik koşulları, fiyat/muafiyet, seçilmesi ve historical snapshot §84.1'de somutlaştırılır; **araç üzerinde tutulan sigortacı/poliçe kaydı ile müşteriye sunulan rental koruma paketi aynı nesne değildir**.

Her paket:
- isim, kod (Basic, CDW, SCDW, Super Cover vb.), vehicle class applicability, branch/jurisdiction, validity, daily/fixed price, currency, tax treatment
- insured event/coverage types, excluded causes, required evidence, excess/deductible amount + currency, maximum liability (policy-dependent), third-party coverage note, provider/policy reference, version
- package ``none/default/included/optional`` state, selected package and contract terms snapshot; **ücretli paket için transaction currency başına explicit ve dönem/scope bazlı tekil price row**, ücretsiz/dahil için açık `0`/included tanımı zorunludur (§85.1); payment FX ile fiyat otomatik üretilmez

**Damage → Liability → Charge** kuralı:
1. Evidence / damage type / responsibility fact kaydedilir.
2. O Rental'ın seçili insurance-package snapshot'ı kontrol edilir.
3. Coverage condition/exclusion, deductible ve applicable maximum liability **açıklanarak** hesaplanır; covered parts auto-charge edilmez.
4. Customer Charge yalnız authorized confirmed customer liability sonucu bir kez oluşturulur; insurer recovery ayrı kaynak hareketidir.
5. ``SCDW her hasarı sıfırlar`` gibi yanlış evrensel varsayım yapılmaz; theft, negligence, glass, wheels, third-party damage ayrı şartlara bağlı olabilir.
6. Deposit ve deductible aynı şey değildir; deposit held tutarı doğrudan revenue olmaz.

Konsept yasal sigorta danışmanlığı veya gerçek claim settlement vermez; UI karar destek/ön izleme sunar.

# 71. OLAĞAN DIŞI RENTAL SONLANDIRMA — NORMAL RETURN OLMAYAN DURUMLAR

Delivered Rental normal Return olmadan kapanmak zorunda kalabilir:
- Vehicle Theft / Stolen (çalındı)
- Total Loss / Write-off (pert)
- Impounded / Seized (bağlandı/yediemin)
- Abandoned / Unrecoverable (terk edildi / ulaşılamıyor)
- Authorized Administrative Closure (istisnai kapama, gerekçeli)

**Rental Detail → Olağan Dışı Sonlandırma** ayrı guided workflow:
- event category, event occurred/time/place, last known location/odometer/fuel (biliniyorsa), police/insurance/reference, evidence available/missing reason, report/source incident, authorized actor + second review/permission if policy requires.
- normal Return 4–5 fotoğraf ve key/equipment gates **uygulanmaz**; bunun yerine exceptional evidence checklist + ``Not Available Reason`` pinlenir.
- Rental operational terminal transition ana lifecycle'daki **Delivered → Loss Closed** (Theft, Total Loss, belgelenmiş Abandoned/Unrecoverable) veya **Delivered → Exception Closed** (Impounded/Seized, Authorized Administrative Closure) yoludur. Normal `Returned`/`Closed` yazılmaz; aynı vaka iki terminal state'i birden almaz.
- Vehicle availability **Unavailable**; readiness Not Ready/Review Required kalır; gerçekte bulunmamış aracı yeniden Available yapmaz.
- Finance ayrı kalır: açık base charge, loss/damage/insurance/customer liability/fines reconciled edilmeden Financially Closed otomatik olmaz.
- Araç bulunur/teslim alınırsa ``Recovery / Repossession`` operasyonu ayrı evidence event yaratır; exceptional closure geçmişini rewrite etmez.
- Bunlar V1 web-konsept akışlarıdır; fiziksel polis/insurance entegrasyonu ve otomatik hukuki karar yoktur.

# 72. ŞUBE KASASI, MULTI-CURRENCY NAKİT VE VARDİYA MUTABAKATI

**Canonical sidebar: Finans → Şube Kasaları (§4).** Finans overview buranın salt okunur özetini gösterebilir; cash drawer işlemleri ve mutabakat aynı canonical ekranda gerçekleştirilir.

**Finans → Şube Kasaları**: şube başına bir veya daha fazla cash drawer, currency bazında fiziksel kasa hareketleri ve vardiya açılış/kapanışı.

- Branch cash register seçimi, currency, opening float, cash-in/cash-out records, customer cash Payment links, cash refund/release links, expense cash-out, internal drawer transfer, counted closing cash, expected balance, variance, variance reason, closing staff + timestamp.
- Tek şubede EUR kasası ve BAM kasası aynı anda bulunabilir. **EUR tahsilat EUR kasasına; BAM tahsilat BAM kasasına** kaydedilir; rapor converted-equivalent gösterse bile fiziksel para çevrilmiş sayılmaz.
- Kart/banka/online ödemeler **cash drawer hareketi değildir**; onları ayrı card/transfer settlement raporunda görmek gerekir.
- ``Expected cash = opening cash + physical cash-in − physical cash-out``. Gerçek sayım farklıysa variance sıfırlanmaz; açıklama ve audit gerekir.
- Payer 3 kişi, 4 payment line olsa da her **nakit** satırı doğru branch/register currency'ye düşer; diğer satırlar kasayı değiştirmez.
- Şube→şube/kasa→kasa fiziki para transferi aynı anda göndericide out, alıcıda in olarak çift yönlü **transfer event**'idir, yeni revenue/collection değildir.
- Close/reopen yetki kontrollüdür; geçmiş sayaç sessizce değiştirilmez.

## 72.1 Vardiya ve kasa farklı ama bağlantılı

- ``Staff Shift`` konsept entity: personel, branch, planned/start/end, rol, shift status; Shift Handover bunun gerçek görevli personelini gösterir.
- ``Cash Session``: cash drawer + shift + actor + opening/closing, counting. Her Shift'in cash session'ı zorunlu değildir; nakit sorumluluğu varsa ilişki gösterilir.
- Vardiya devir notu; bekleyen delivery/return, taşınan açık işler, outstanding/exception ve devredilen nakit/zarf/currency count summary içerir.
- Otomatik vardiya çizelgesi veya payroll V1 kapsamı değildir; çalışan shift kaydı UI konseptinde CRUD ve görevli göstergesi vardır.

# 73. AUTH, TENANT VE GLOBAL SaaS KONSEPTİ — GERÇEK BACKEND YOK

**Platform Console (konsept ekranı, Company Admin'den ayrı)**:
- company/tenant create/setup, tenant status, country/region/timezone/base currency/language, first company Owner, branch setup, subscription plan/status, seat count/feature access preview, renewals/invoices **UI mock**, disable/reactivate simulation.
- ``Platform Super Admin`` global şirket listesi görür; ``Company Owner/Admin`` yalnız kendi company yönetimi bağlamında konsept erişimi görür. Bu rol şirket içi Owner ile aynı değildir.
- Abonelik ve invoice ekranı **tasarım/simülasyon**dur; canlı tahsilat ya da payment gateway aboneliği yoktur.
- Şirketler arası iş kaydı görünümü UI rol/tenant simülasyonunda engellenir; bunun bir production güvenlik kontrolü olmadığı açık yazılır.

**Personel / Partner web auth UX**:
- password set/change, invited/pending/active/locked/reset-required states, session expiry demo, 2FA *screen concept* only if explicitly labeled not production-enabled.
- E-posta entegrasyonu V1 konseptinde yoktur; dolayısıyla ``email sent`` demek yasaktır. Invite/reset için yetkili Admin tarafından gösterilen **manual one-time invite/reset workflow preview** vardır; token/gerçek auth güvenliği varmış gibi davranılmaz.
- Partner Portal giriş/şifre sıfırlama UX aynı prensiptedir; internal role picker veya gerçek JWT paylaşımı olarak gösterilmez.
- Production auth/token/password-delivery mechanism daha sonraki backend aşamasının kararıdır.

# 74. POLICY KATALOĞU — İŞ KURALLARI KİMİN EKRANINDA?

**Yönetim → Ayarlar → Business Policies** tüm typed policy kayıtlarının edit/display dizinidir (Settings burada aynı canonical yönetim ekranıdır). ``Rules`` ekranı bunları ikinci kez sahiplenmez.

| Business policy | Yapılandırma ekranı | Kullanıldığı UI | Sonuç/gate |
|---|---|---|---|
| Rental duration, grace, tiers | Settings → Kiralama Süresi + Pricing | Quote/Reservation/Rental/Return | days, tier, late fee |
| Driver age/license expiry | Settings → Sürücü Uygunluğu | Reservation conversion / Rental Delivery | eligible/review/blocked |
| Document Requirements | Settings → Belgeler | Rental File/Delivery | required/exempt/missing |
| Supplier documents | Settings → Belgeler | Supplier Receive/Delivery | onboarding warn/delivery block |
| Global deposit | Settings → Depozito | Rental Finance | required amount |
| Corporate deposit override | Corporate Agreement | Rental Finance | effective deposit |
| Deposit exception | Approval Center (formal type) | Rental Finance | yalnız **Applied** exception |
| Fuel fraction fees | Settings → Yakıt | Return | preview/charge candidate |
| Mileage allowance/excess | Pricing → Mileage | Return | overage charge |
| No-show/cancellation fee | Settings → Rezervasyon/İptal | Reservation | policy fee |
| Late return | Settings → Kiralama Süresi | Return | fee + risk |
| Rental insurance/protection catalog, eligibility and default | Settings → Sigorta Paketleri (§84.1) | Reservation/Rental/Contract/Damage | only matching active package; explicit rental choice + immutable snapshot |
| Vehicle's own insurance policy / insurer reference | Vehicle Documents / linked insurance source | Vehicle/Claim/Print | **not** rental protection package |
| Deposit applicability and class/branch rules | Settings → Depozito (§84.2) | Rental/Finance/Contract | policy-derived required/none + exact currency; only Applied exception overrides |
| Print/insurance/service document templates | Settings → Sözleşme ve Operasyon Belge Şablonları (§84.4) | Contract/Vehicle/Maintenance/Damage/Document Center | versioned A4 templates + source-linked issue |
| Tax / VAT / PDV | Settings → Vergi Kuralları | Pricing/Charges/Refunds | tax lines |
| FX business rates | Yönetim → Ayarlar → Döviz Kurları (**tek editable screen**) | Payments/Refunds/Finans read-only rate preview | converted allocation |
| Cash register/shift controls | Settings → Kasa / Vardiya | Finance/Cash Close | expected/count/variance |
| Contract signature | Settings → Sözleşmeler | Contract/Delivery | version+signature gate |
| High discount / refund thresholds | Settings → Finans Yetki Eşikleri | Pricing/Refund | approval request |
| Extension confirmation | Settings → Rental Operations | Extension | inline manager permission |
| Corporate credit/limit | Corporate Account / Agreement | Reservation/Rental | limit/override |
| Waitlist offer | Settings → Reservation | Waitlist | no capacity hold |
| Reminder/due dates | Settings → Notifications | Alerts | UI-derived alert |

**Kurallar / Rules Builder V1 konsept sınırı**:
- Kullanıcının mevcut ekranında IF/AND/OR/THEN kurgulamasına izin verir, ancak yalnız açıkça listelenmiş safe koşul/aksiyonlarla: ``expiry-days threshold``, ``status/date condition``, ``branch/class match``, ``assigned user/role match`` → ``create in-app alert``, ``mark review flag``, ``show recommended action``.
- Pricing, VAT, exchange rate, deposit amount, legal eligibility ve approval types gibi **hard business policy**'ler generic Rule tarafından sessizce override edilmez.
- Rules versioned, activate/deactivate; UI preview örnek veri üzerinde açıklanabilir output gösterir; gerçek arka plan job çalıştığı iddia edilmez.

# 75. UYARI MERKEZİ — ÇAKIŞMAYAN GÖRÜNÜMLER

- **Ana Ekran** = günlük giriş/operasyon overview, tek sayfa.
- **Owner Dashboard** = aynı web ürününde permission-dependent business analytics **görünümü**; ayrı bir çelişkili ``Ana Ekran`` kaynağı değildir.
- **Komuta Merkezi** = eylem gerektiren personel iş kuyruğu ve vardiya devri.
- **Alert Center** = Komuta Merkezi içinde ``Uyarılar`` sekmesi; ayrı top-level menü/dedup source değildir.
- **Notification Center** = kullanıcıya teslim edilmiş konsept in-app notification inbox (read/unread); domain truth değildir.
- **Kontrol & Analiz → Riskler ve İstisnalar → Operasyon Riskleri** sekmesi = deterministic operational exception analysis/filter; Alert Center'a projection sağlar.
- **Kontrol & Analiz → Riskler ve İstisnalar → İstisna İnceleme** sekmesi = eski Risk ve İstisnalar'ın review workflow/projection kabiliyeti; manuel Incident'tan ayrı ve aynı olayı ikinci bağımsız truth olarak sunmaz.
- Bu iki sekme **tek sidebar girişine** bağlıdır; ayrı Operasyon Riskleri veya Risk ve İstisnalar top-level bağlantıları oluşturulmaz.
- **Gelir Kontrolü** = revenue leakage/missing charge/collection-specific derived analysis; ödeme otoritesi değildir.
- Hepsi aynı event/source ID'ye referans verir; bir riskin her ekranda görünmesi altı ayrı Incident/Task yaratmaz.
- UI'da alert severity, reason, owner, source link, state ve timestamp görünür; fake AI alarmı yoktur.

# 76. INTERNATIONALIZATION, DOKÜMAN DİLİ VE PRINT/PDF ÖN İZLEME

- Web UI başlangıç dili Türkçe; company default/employee preference ve Partner Portal için global dil seçicisi tasarlanır. Özellikle İngilizce ve yerel diller (ör. Bosna'da BHS) desteklenebilir; aynı domain label keys translation catalog'dan okunur.
- Rental/Contract/Receipt/Delivery/Return document output template'leri **document language** seçer. Customer nationality'den otomatik tek dil çıkarılmaz; şirketin izin verdiği language + manual selection kullanılır.
- Farklı locale için tarih/timezone/number/currency format; global currency gösterimi currency symbol'un yanında **ISO code** ile belirsizliği önler (ör. $ için USD/CAD ayrımı).
- Web konseptinde ``Print / Browser Save as PDF`` ve printable document preview çalışır; gerçek imzalı elektronik belge, fiskal makbuz veya dış gönderim sonucu değildir.
- 4–5 photo per inspection evidence web dosya seçim/ön izleme; thumbnail/render client-side; private cloud storage varmış gibi güvenlik iddiası yoktur.
- E-posta/SMS/WhatsApp gönderilmiş gibi gösterme; ``Download/Print/Copy Preview`` ile tamamlanır.

# 77. GİZLİLİK, AYDINLATMA, YASAL HUKUKİ ÇERÇEVE

**Customer, Lead, Partner Lead, Driver ve belge akışlarında**:
- Aydınlatma metni/template version, veri işleme amacı, date/time, hangi privacy notice'in sunulduğu, acknowledgment ve **gerekirse** ayrı consent seçimi + withdrawal history konsept kaydı.
- Her işleme için ``consent`` tek olası hukuki dayanak kabul edilmez; sözleşme/hukuki yükümlülük/meşru menfaat gibi jurisdiction'a bağlı lawful basis seçimi ayrı modeldir; ülkeye göre hukuk danışmanıyla doğrulanır.
- Pasaport/ehliyet ve başka sensitive doc'ların ekran ve export permissions; identity no masking, visibility roles, document version, retention policy placeholder, download audit preview.
- KVKK/GDPR/yerel kişisel veri mevzuatına uyum sağlandı iddiası yoktur; ülkeler arası data-transfer/residency, retention/erasure, çocuk yaşı ve consents ayrı yayın/hukuk kontrol maddesidir.
- Export / Data Subject Request / Retention / Restrict Processing konsept ekranları Company Admin altında bulunur; gerçekten veri sildi/aktardı iddiası üretmez.

# 78. GLOBAL WEB UI — EKRANLAR ARASI YENİ AKIŞ

## 78.1 Reservation Workspace (eklenmesi gereken alanlar)

- Pickup/Return, branch/timezone, Vehicle Class/Vehicle, duration tier, transaction currency, selected insurance, included mileage, tax treatment, base/season/one-way/extras breakdown.
- Driver eligibility badge, document requirement checklist, capacity indicator, corporate credit/exposure, pricing snapshot, cancellation/no-show policy acknowledgment.
- **Kaparo Al** modalı: payment line, tender currency/rate, payer, method, receipt reference, advance allocation.
- ``Pending`` hiçbir class/specific kapasite tutmaz; ``Confirmed`` anında capacity recheck; ``Sourcing Required`` yeterli confirmed inventory yoksa Confirmed olamaz.

## 78.2 Rental Workspace (eklenmesi gereken alanlar)

- Renter / Driver / Third-party payer ayrı; corporate account separate.
- Insurance plan/coverage/deductible, driver eligibility, applied document snapshot, transaction currency+tax breakdown, effective deposit policy.
- ``Prepared`` quote/commitment, ``Delivered`` Base Charge posted, return delta charges independently; exceptional termination ayrı action.
- Finance tabs: Charges, **Payments (split)**, Prepayments, Payment Plans, Deposits, Refunds, Coverage/Damage, Timeline.

## 78.3 Global Finance Center

Summary filters: date, company, branch, currency, method, payer, status, source; metrics: native-currency Collections, Cash Received, Card Received, Transfer Received, Outstanding in original obligation currencies, Unapplied Advances, Deposits Held/Applied/Released, Refunds, Corporate Receivables, Supplier Payables, Partner Commissions, Cash Differences.

Views:
1. Incoming Collections / Payment lines;
2. Reservation advances;
3. Open Rental/Corporate receivables;
4. Payment plans / upcoming and overdue;
5. Branch cash registers and sessions (**Finans → Şube Kasaları** canonical sidebar ekranının read-only özet + deep-link görünümü; kasa işlemleri tek ekranda);
6. Applied exchange rate snapshots / rate history (**read-only**) + ``Yönetim → Ayarlar → Döviz Kurları`` canonical editörüne permission-gated deep-link;
7. Refund/Credit/Reversal history;
8. Supplier outgoing settlements;
9. Partner commission payments;
10. Tax breakdown/report preview.

**No cross-currency fabricated total**: financial graph can select one original currency or one explicitly labeled converted reporting currency with chosen rate-set/version/date; never silently sum 20 EUR + 20 BAM = 40.

## 78.4 Admin Settings bilgi mimarisi

- Company & Localization
- Tenants / Subscription UI (Platform Console only)
- Branches & Users/Roles (links to existing management screens)
- Accepted Currencies
- **Exchange Rate Desk**
- Tax / VAT / PDV rules
- Pricing & Time Calculation
- Insurance & Deductible catalog (**kiralamaya özel seçilebilir paket**, uygunluk/ücret/snapshot, §84.1)
- Driver Eligibility
- Payments / Advance / **Deposit applicability (şube/sınıf bazlı required/not required)** / Refund Policy (§84.2)
- Cash Drawers & Shifts
- Document Requirement / Supplier Document Requirement
- Contracts / Signature + **A4 Operasyon Evrakı Şablonları (Servis / Sigorta / Araç Durum)** (§84.4)
- Permissions & Thresholds
- Notifications / Rule Conditions
- Privacy / Document Languages

Her ayar gerçekten ilgili flow'a yansır, demo senaryosu ile doğrulanır; ikinci editable truth yaratılmaz.

# 79. UI DEMO GERÇEKLİĞİ — YALANCI ENTEGRASYON YOK

- Tek frontend state root / domain actions / shared calculation functions. Form save, draft, approval, mark delivered, record payment, cash close ve conversion **state machine** davranışlarıyla çalışır.
- Refresh sonrası demo devamı için IndexedDB/localStorage kullanılabilir; bu konsept verisinin kullanıcı tarayıcısında bulunduğu UI'da açıklanır. Tarayıcı temizlenirse/cihaz değişirse sunucuda kaldığı iddia edilmez.
- ``Reset demo / Seed demo scenario`` net görünür. Seed records açık **ÖRNEK/DEMO** etiketli olur; ``0`` dersen sıfır demo kayıt da kabul edilir; kullanıcı kendi örnek kayıtlarını oluşturabilir.
- Fiyatlama, invoice preview, rate conversion, tax, payee allocation, balance, availability, capacity, shift session, insurance coverage **tek merkezli deterministic functions** kullanır. Her görünüm farklı rakam üretmez.
- Demo role/tenant switch gerçek auth/authorization değildir; kırmızı/gizli/özel kullanıcı verisi kullanılmaz.
- Gerçek ödeme, e-posta, SMS, PDF e-imza, supplier confirm, banka işlemi, vergi uyumu, güvenlik sertifikasyonu, production backup yoktur; hiçbir sistem bunları gerçekleşmiş gibi göstermez.

# 80. GLOBAL KANONİK TERİM SÖZLÜĞÜ

| Türkçe UI | Domain adı | Tek anlam |
|---|---|---|
| Kira borç para birimi | transactionCurrency | Charge ve Rental Outstanding referansı |
| Tahsilat para birimi | tenderCurrency | Fiilen alınan para / ödeme yöntemi satırı |
| İşletme kuru | businessFxRate | Şirket/şubenin tanımladığı işlem kuru, resmi piyasa kuru değil |
| Kur snapshot'ı | appliedRateSnapshot | Tek payment allocation anındaki sabit kur/yön |
| Borca uygulanan tutar | appliedEquivalent | Payment'tan charge currency'ye mahsup |
| Avans / Kaparo | reservationAdvance | Rental öncesi alınan, sonra mahsup/refund/forfeit edilen ödeme |
| Depozito | securityDeposit | Held/Applied/Released, revenue değil |
| Kira bedeli tahakkuku | baseRentalCharge | Delivered olayında bir kez posted |
| Gecikme farkı | lateReturnCharge | Return'de policy sonucu ayrı charge |
| Vergi kalemi | taxLine | Net/gross snapshot içindeki vergi parçası |
| Sigorta paketi | coveragePackage | Rental'a seçilen protection terms snapshot'ı |
| Muafiyet / sorumluluk üst sınırı | deductible/coverageLiability | Coverage rule'a göre yorumlanır, deposit değil |
| Fiziksel kasa | cashDrawer | Şube + currency + session bazında gerçek nakit adedi/tutarı |
| Ödeme planı | paymentSchedule | Tahsilat değil, geleceğe dönük niyet/vade |
| Parçalı tahsilat | splitTender | Bir borca birden fazla gerçek payment line |
| Ödeyen kişi | payer | Tahsilatı yapan kişi; driver/renter olmak zorunda değil |
| Şirket/kiracı sorumlusu | contractingParty | Sözleşme yükümlülüğünün tarafı |
| İşletilebilir web konsepti | interactivePrototype | Production backend veya gerçek ödeme altyapısı değil |

# 81. DEMO SENARYOLARI — GLOBAL ÖDEME VE ÇAPRAZ MODÜL KONTROL

1. Yeni şirket Bosnia/BAM setup; admin EUR base seçer; branch EUR/BAM/USD tender kullanımını etkinleştirir, nakit için EUR ve USD cash drawers açar (BAM kart tahsilatı nakit drawer gerektirmez).
2. Admin ``1 EUR = 2 BAM`` işletme kurunu girer; başlangıçta USD kuru **tanımlamaz**.
3. 500 EUR Rental oluşturulur; **Kişi A** 100 EUR nakit + 200 BAM kart (iki ödeme satırı) uygular; Outstanding **300 EUR** olur.
4. **Kişi B, üçüncü ödeme satırında** 100 USD nakit vermek ister. USD→EUR rate eksikken satır Applied/Collected olamaz; Outstanding **300 EUR** kalır. Admin **yalnız demo örneği** olarak ``1 EUR = 1.25 USD`` işletme kurunu girer; sonra 100 USD → 80 EUR Applied, Outstanding **220 EUR** olur.
5. **Kişi C, dördüncü ödeme satırında** yeniden hesaplanan **220 EUR** bakiyeyi banka transferiyle öder; Outstanding **0 EUR** olur. Böylece **üç kişi, dört ödeme satırı** tamamlanır. Kasada 100 EUR nakit ve 100 USD nakit kendi drawer'larında görünür; 200 BAM kart ve 220 EUR transfer **nakit kasaya girmez**. Collections currency/original ve applied equivalent bilgilerini karıştırmaz.
6. Aynı ödeme satırına üçüncü kere Apply denemesi balance değiştirmez; duplication engellenir.
7. Daha sonra admin kuru değiştirir; geçmiş payment uygulaması değişmez, yeni ödeme yeni kuru kullanır.
8. EUR cash drawer opening 50 EUR + 100 EUR cash-in, closing count 140 EUR girilirse -10 EUR variance görünür; BAM kartın kasaya etkisi sıfırdır.
9. Reservation aşamasında alınan BAM kaparo conversion anında Rental Unapplied Advance olarak taşınır; Rental Delivered'da Base Charge Posted olunca yalnız bir kez mahsup edilir. Cancelled senaryosunda fee/refund ayrı gösterilir.
10. Vergi inclusive/exclusive seçenekleri Rental tax breakdown'ını doğru etkiler; tax payment currency ile karışmaz.
11. Insurance Basic vs CDW/SCDW farklı deductible/coverage sonucu gösterir; Damage Charge sadece uncovered authorized liability'den doğar.
12. Kiralık araç çalındı: normal Return fotoğraf gate'ini zorlamadan exceptional closure, Availability Unavailable, ayrı finance açık durumu görünür.
13. Driver ehliyeti kiralama süresinde bitiyorsa eligible/blocker policy sonucu açıklanır.
14. Corporate company iki currency limiti taşıyabilir; EUR exposure USD ile toplanmaz.
15. Bir end-user DEMO kayıtlarını resetleyince ekranlar resetlenir; bankada işlem yapılmış gibi görünmez.

---

---


## Concept consistency checkpoints (sürüm doğrulaması)

- ``Backend yok`` ile ``DEMO business-rule logic var`` birbiriyle çelişmez: hesaplar browser-side single-source çalışır, gerçek güvenlik/tahsilat iddiası yapılmaz.
- ``Pricing yalnız transaction currency`` ile ``mixed currency payments`` çelişmez: ödeme tender currency'si farklı olabilir; settlement allocation, pinned admin rate ile obligation currency'ye çevrilir.
- ``Farklı para birimleri toplanamaz`` ile ``converted reporting`` çelişmez: dönüştürülmüş tahmini toplam sadece açık seçili kur setiyle etiketlenir.
- ``Reservation advance`` ile ``Rental Base Charge at Delivered`` çelişmez: conversion'da advance sadece Rental'a **Unapplied** taşınır, Charge Posted olduğunda uygulanır.
- ``Approval Center 6 formal types`` ile ``manager operational confirmation`` çelişmez: ikincisi domain permission action'dır, 7. approval type değildir.
- ``Deposit Exception Approved`` değil, **Applied** anında effective requirement'ı değiştirir.
- ``Split payer`` yasal payer/contracting party veya additional-driver kimliğini değiştirmez.
- ``No native mobile`` Partner Portal'ın dar web ekranlarda responsive olmasını engellemez.
- Country-specific taxes/fiscalization/exchange-law/privacy obligations konsept UI'da flag olarak tutulur; bu uyum sertifikası sayılmaz.

---


# 82. 36 MENÜNÜN TAM KAPSAMLI WEB WORKSPACE SÖZLEŞMESİ — §4'E BAĞLI

**Amaç:** §13'te detaylandırılmış **Araç 360°** standardını diğer ekranların kullanıcı deneyimine taşımak; mevcut özellikleri yeni domain/entegrasyon/menü üretmeden gerçekten kullanılabilir kılmak. Bu bölüm §4'teki tam yetkili profil için **7 kategori / 36 sidebar bağlantısının tamamını** kapsar: **Araçlar zaten §13'te ayrıntılıdır; aşağıdaki diğer 35 bağlantının tek tek kullanım sözleşmesidir.** Buradaki sekmeler, drawer'lar ve drill-down'lar **sidebar sayısına eklenmez**. Mevcut iş kuralları için ilgili §6–40, §59*, §61–84 otoritedir; bu bölüm yalnız ekranda nasıl kullanılacağını somutlaştırır, yeni financial/lifecycle state icat etmez.

## 82.1 Bütün 36 ekranda geçerli kullanım standardı

1. **Birincil iş sorusu ve birincil eylem:** Kullanıcı sayfanın ilk ekranında hangi kararı vereceğini bilir. Gerçekten kullanılan filtre, tarih/saat, şube, role scope, tablo satırı eylemi, boş durum ve bir sonraki adım belirgindir. Gereksiz KPI ve yanıltıcı grafik eklenmez.
2. **Listeden detaya, detaydan kaynak olaya:** Tablo → kayıt workspace → ilgili source (Vehicle/Rental/Reservation/Payment/Approval/Incident vb.) → **Geri** hareketinde önceki filtre ve sekme mümkün olduğunca korunur. Bir kaynak kaydın iki ayrı editable kopyası yoktur.
3. **Bağlamsal başlatma:** Araçtan açılan hasar/bakım, müşteriden açılan rezervasyon, kiralamadan açılan tahsilat vb. kaynak kimliğini önceden doldurur. Kullanıcı kayıt oluşturmadan, kaydetmeden, onaylamadan veya mevcut gate'i geçmeden source lifecycle değişmez.
4. **İşlem anında kaynak kapıları:** Gerçek V1 koşulları (Availability, Readiness, Document Requirement, Driver Eligibility, pricing, role/branch, cash, Approval Center) geçmeden başarı gösterilmez. Uygun değilse **neden, etkilenen kaynak, düzeltme bağlantısı** verilir. Kuralları ekran bazında ayrı algoritmalarla çoğaltma.
5. **Durum boyutlarını karıştırma:** Reservation ≠ Rental; operational Closed ≠ Financially Closed; Vehicle Availability ≠ Readiness; Charge ≠ Payment; Recorded Payment ≠ Applied Payment; Deposit ≠ Revenue; Approved ≠ Applied; Supplier Settlement ≠ supplier cash payment. Bu ayrımlar rozet, detay ve CTA uygunluğunda da görünür.
6. **Zaman, para, yetki:** Operasyon gün/saatleri ilgili **şube yerel zamanıyla** ve seçilen `as-of`/dönem etiketiyle gösterilir. Tüm parasal tablolar **currency koduyla**, para birimi başına ayrı toplamla veya kur seti açıkça seçilmiş etiketli rapor dönüşümüyle çalışır. Yetkisiz kaydın alanları arama, sayaç, çıktı ve deep-link üzerinden de açılmaz; bu yalnız **demo UX**, gerçek sunucu güvenliği iddiası değildir.
7. **Gerçek eylem / dürüst demo:** Çalışmayan buton, sahte entegrasyon, gerçek mesaj gönderildi iddiası yok. Kullanıcının değiştirdiği alanlar aynı browser demo state'ine yazılır; refresh/Reset Demo ve zaman simülatörü davranışı §79'a tabidir. Formlar kaydet/iptal, validasyon, değişiklik uyarısı, tekrar tıklama güvenliği ve anlamlı hata/boş durum içerir.
8. **Liste yoğunluğu ve erişim:** Rol ve iş ihtiyacına göre anlamlı kolonlar, arama, filtre reset, kaydedilmeyen görünüm tercihleri, erişilebilir klavye akışı, 1440/1024/768 responsive web tasarımı. “Bugün” özetleri tarih aralığı seçildiğinde sessizce aynı anlama gelmez.

## 82.2 Genel — 3 bağlantı

**Ana Ekran (§6, §59A, §59CE):** İlgili rol ve şube için `Bugün teslim`, `Bugün iade`, gecikenler, hazırlanması gereken araçlar, açık iş ve gerçek finansal dikkat noktaları **tek kaynaklardan türetilen** bir çalışma özeti olarak görünür. Her özet kartı tıklandığında ilgili liste **aynı şube/tarih/durum filtresi uygulanmış** açılır. Owner analitiği bu ekranın permission-dependent görünümüdür; ayrıca Owner Dashboard sidebar sayfası yoktur. Buradan kaynağı değiştiren kestirme varsa ilgili domain formu açar; kart sayısı doğrudan lifecycle mutation yapmaz.

**Komuta Merkezi (§7, §59M, §59AK, §75):** `Acil işler / Bugün / Uyarılar / Vardiya Devri` bağlamsal görünümleri; gerekçe, kaynak olay zamanı, sorumlu, kritik tarih ve kaynağa git eylemiyle çalışır. Alert Center **Uyarılar sekmesidir**; ayrı menü ve ikinci uyarı deposu değildir. Kaynağı olmayan iki sahte incident oluşturulmaz; görev devri kaynak Rental/Vehicle status'unu kendiliğinden değiştirmez. Vardiya devri varsa şube kasası oturumu yalnız **Finans → Şube Kasaları** source'una linklenir.

**Filo Asistanı (§8):** İzinli demo kayıtlarda hazır sorgu niyetleri, plaka/ID araması ve sık kullanılan sorular için **deterministik salt okunur** arayüzdür. `Hangi araç nerede?`, `Bugün hangi iadeler var?`, `Bakımı yaklaşanlar` sonucu seçili şube/tarih, kaynak zaman ve **kayıt bağlantısı** içerir. Bilinmeyen sonuçta boş/uygunsuz veri etiketi gösterilir; generative AI, tahmini filo skoru veya asistanın otomatik finans/operasyon işlemi yoktur.

## 82.3 Operasyon — 9 bağlantı (Araçlar §13'te)

**Rezervasyonlar (§9, §59BF–BG, §65):** Liste `Pending/Confirmed/Converted/Cancelled/No-show`, seçili tarih, class-only/specific, kapasite, müşteri, belge ve kaparo durumunu birlikte taratır. Detay workspace `Plan & Araç / Müşteri & Belgeler / Fiyat & Sigorta / Kaparo / Geçmiş` görünümüyle kullanıcıya **onayla, araç ata, dönüştür, iptal/no-show** aksiyonlarını uygun state'de sunar; bir akış `Pending` iken capacity hold yaratmaz. Kaparo formu aynı Finance Payment/Advance event modelini kullanır ve kayıt/mahsup ayrı görünür. Dönüştürme tek transaction'da Vehicle allocation doğrular ve Rental'a bağlar; tek tıkla class-only Rental açılmaz.

**Kiralamalar (§10, §59BV–BX, §67, §71, §83–85):** Aktif iş listesi `Prepared/Delivered/Returned/Closed/Cancelled/Exception Closed/Loss Closed`, planlanan ve gerçek iade, teslim blokları ve **ayrı Finance lifecycle** ile ayrıştırılır. Rental 360° detayında `Genel / Teslim / İade / Sözleşme & Dosya / Sigorta & Hasar / Finans / Değişiklikler & Geçmiş` sekmeleri vardır; sekmeler **yeni sidebar değildir**, §10 ve ek akışları bir araya getirir. Üstte **Teslim Masası / bir sonraki izinli işlem (§85.4)** ve *neden engelli + tek tıkla ilgili kayda git* bilgisini göster: teslim evidence 4–5 foto, hazırlık ve imza; dönüşte km/yakıt/kanıt; uzatma/araç değişiminde delta/snapshot; exceptional close'da normal Return kanıtı zorlanmaz. `Delivered` Base Charge bir kez posted; `Operational Closed` borcu otomatik silmez.

**Takvim (§11):** Gün/Hafta/Ay/Agenda modları tek Reservation/Rental/maintenance/transfer source'undan beslenir. Tıklanan blok source workspace'e, boş zaman aralığı seçimi izne ve availability'ye uygun ön-doldurulmuş Reservation başlangıcına götürür; takvimde sürükleme kaynakta onaysız tarih/state mutasyonu değildir. Class-only confirmed demand specific Vehicle takvimine araç atanmış gibi çizilmez; filtre/renk efsanesi ve şube local time sabittir.

**Görevler (§12, §59AZ, §83.6, §85.8):** `Bana Atananlar / Açık Havuz / Takım & Şube / Geciken / Tamamlanan` görünümleri, atayan/atanan, due, önem, ilişki kaydı ve completion history gösterir. Görev oluşturma, devretme ve tamamlama **yalnız Task kaydını** değiştirir; bağlı Maintenance/Incident/Rental ayrıca source action gerektirir. Komuta Merkezi aynı Task'ı okuyup deep-link açar; yeni görev depo/iş kuralı icat etmez.

**Araçlar (§13, §84.4–84.6, §85.5):** Tek sidebar başlığı; **Araç Listesi + Oluştur/Düzenle + 8 sekmeli Araç 360°** §13.1–13.5'te bağlayıcıdır. Bu bölüm Vehicle alanlarını yeniden tarif etmez; diğer ekranlar buraya `vehicleId`, uygun ise `engagementId` bağlamıyla yönlenir ve availability/readiness/location/odometer gerçeğini buradan **okur**, ikinci truth tutmaz.

**Bakım & Servis (§14, §59N–O, §59CI):** `Planlanan / Devam Eden / Tamamlanan`, yaklaşıyor/gecikti derived filtreleri, provider, km/tarih due, Vehicle readiness etkisi ve source cost net görünür. Maintenance tamamlamak servisi bitirir, **aracı otomatik Ready yapmaz**; araç hazırlığı/checklist ayrı kaynaktır. Lastik ve temizlik bağlamsal sekmeleri Maintenance/Preparation kaydına gider; gerçek servis maliyeti tek Maintenance kaynağından gelir, varsa Expense ikinci tutar edit etmez.

**Olay Merkezi (§15, §59BC, §59BD):** `Açık / İnceleniyor / Çözüldü / Kapalı` olaylarını şiddet, sorumlu, kanıt, kaynak bağlamı ve sonuçla yönetir. Incident'a linked Rental/Vehicle/Damage/Fine/Insurance source etiketleri tıklanır; `Olayı çöz` aksiyonu hasarı kapatmış, cezayı ödemiş veya aracı ready yapmış gibi davranmaz. Eskale etmek uygun görev/inceleme akışına bağlamsal yönlendirme olarak sunulur, otomatik yedinci formal approval değildir.

**Hasar Kayıtları (§34, §59BD, §70):** `Bildirildi / İnceleniyor / Sorumluluk Belirlendi / Kapalı` akışı; araç/kiralama, before-after inspection source kanıtı, ilgili insurance-package snapshot, muafiyet, müşterinin/sigortanın/şirketin sorumluluğu açıklanabilir gösterilir. Onarımı linked Maintenance üzerinden, customer charge'ı Finance'dan **bir kez**, insurer recovery'yi ayrı Finance movement'tan izler. Ücret ön izlemesi `posted charge` değildir; hasar çözümü rental financial close değildir.

**Ceza Modülü (§35):** `Kaydedildi / Sorumluluk Bekleniyor / Belirlendi / Kapalı` listesi, araç, tarih, official reference, Rental ataması önerisi, ihtilaf ve yasal vade içerir. Otoriteye ödeme **Authority Settlement**, müşteriden tahsilat **Finance Customer Payment** olarak ayrı görünür. Fine statutory amount'ı Fine'dan, company-paid Expense'i source-linked posting'den, customer liability Charge'ını tek Finance event'ten gösterir; tarih örtüşmesi Rental atamasını kendiliğinden onaylamaz.

## 82.4 Müşteri & Ticari — 6 bağlantı

**Müşteriler (§16, §59AX, §59BR–BT):** `Müşteri 360°` üstte kimlik/iletişim, residency, belge uygunluğu ve varsa Corporate bağlantısını; içeride `Genel & İletişim / Belgeler / Rezervasyonlar / Kiralamalar / Cari & Tahsilatlar / Görevler & Olaylar / Geçmiş` sekmelerini gösterir. `Rezervasyon Aç` müşteri seçilmiş workspace'e gider; `Belge Yükle` Vault owner's kayıt akışını kullanır. Open balance/tahsilat **Finance derived**, Duplicate Merge kaynak history/izin doğrulamasıyla; müşteri adres/kimlik, arbitrary risk score veya blacklist'e göre gizli otomatik hüküm oluşturulmaz.

**Kurumsal Hesaplar (§17, §59BI, §59CC):** Üstte sözleşme/pricing, bağlanan person/driver referansları ve **her currency için ayrı** credit limit, committed/unbilled, posted receivable ve exposure gösterilir. `Sözleşme & Fiyat / Kredi & Exposure / İlgili Kiralamalar / Ekstre & Mutabakat` sekmeleri arası aynı Corporate source kullanılır. CreditLimit yoksa unlimited varsayılmaz; aşımda yalnız mevcut **Corporate Credit Override** approval akışı çalışır. Kapalı operasyonel Rental'ın ödenmemiş corporate borcu exposure'dan yanlışlıkla düşmez.

**Talep Merkezi (§18):** Lead listesi source/partner/dönem/owner ile filtrelenir; Lead Detail'da iletişim/not/hatırlatma, **versioned Quote** fiyat geçmişi, validity, accept/reject/lost ve `Rezervasyona Dönüştür` görünür. Teklif yeni fiyatla yeniden hesaplanırsa eski Quote snapshot kaybolmaz; Accepted Quote, Reservation pricing source'una açıklanabilir bağla gider. Lead'in kendisi Rental veya commission earned sayılmaz.

**Partnerler (§19, §59BJ):** `Genel / Lead & Dönüşüm / Commission Earned / Ödemeler / Portal Erişimi` sekmelerinde partner attribution ve commission trigger/version görülebilir. `Earned` kararlaştırılmış Rental trigger'ına göre, `Paid` yalnız **Finance Partner Commission Payment** kaynaklarından türetilir. Partner Portal ayrı web context'tir; internal partner ekranı portal giriş yetkisi vermiş gibi sessizce oturum değiştirmez.

**Araç Tedarikçileri (§59U–AD, §59BK):** Supplier 360° listesi `Tedarikçi Profili / Sourcing Requests & Offers / Sourcing Engagements / External Vehicle / Receive–Return Inspection / Settlement & Supplier Deposit / Belgeler / Performans` bağlamsal görünümlerini tek supplierId ile ilişkilendirir. Teklif/kabul `Sourcing Request`, fiziksel receive/return `Engagement + Inspection`, borç `Supplier Settlement`, nakit ödeme `Finance Supplier Payment` gerçeğidir. Future confirmed window ile delivery-eligible `Received + Ready` ayrılır; aynı external master'ın geçmiş engagement'ları korunur.

**Fiyatlandırma (§20, §59BH–BI, §59CR, §62–70):** `Sınıflar & Baz Tarifeler / Sezon / Kurumsal Anlaşmalar / Ekstralar / Gün-Süre Politikası Bağlantıları / Fiyat Simülasyonu` görünümleri. Simülasyon **tek transaction currency** içinde branch/date/class/tier/one-way/discount/tax/coverage kalemlerini ve kaynağı/version'ı açıklayarak gösterir; farklı currency component eksikse hesap durur. Yeni tarifeyi düzenlemek eski Quote/Reservation/Rental snapshot'ını rewrite etmez; gerçek formal High Discount ayrı Approval Center workflow'udur. Tahsilat FX'i **yalnız Ayarlar → Döviz Kurları'ndan** düzenlenir; Fiyatlandırma'da ikinci FX editörü yoktur.

## 82.5 Kontrol & Analiz — 8 bağlantı

**Onay Merkezi (§21):** `Bana Gelen / Benim İstediklerim / Karar Verilen / Uygulanan` filtreleri ile **yalnız altı** formal type; request target, gerekçe, istenen/önerilen değer ve currency, requester/reviewer/apply actor ayrı görünür. `Approved` henüz işlem uygulanmış demek değildir; `Applied` ilgili kaynak event'i tek sefer mutasyona uğratır. Four-eyes ve role gate UI'da gösterilir; redde neden ve audit saklanır. Inline operational manager confirmation buraya yedinci type olarak eklenmez.

**Kurallar (§22, §74):** `Aktif / Taslak / Arşiv / Sürüm Geçmişi` listesi ve mevcut safe IF/AND/OR/THEN katalog editörü. Kural ön izlemesi **örnek kaynak üzerinde** hangi in-app alert/review flag çıkacağını açıklayıp gerçek background worker çalışıyor gibi davranmaz. Vergi, kur, fiyat, depozito, sigorta, driver ve approval thresholds editörü **Ayarlar/Agreement/Approval** ekranlarında kalır; buradan hard policy'ler override edilemez.

**Gelir Kontrolü (§23):** `Beklenen–gerçekleşen tahsilat / Eksik veya yanlış charge / İndirim & düzeltme inceleme / Depozito farkı` bağlamsal filtreleri, her satırda event ve calculation evidence ile çalışır. İlgili Rental/Finance/Approval source'una gider; eksik gibi görünen ama henüz `Delivered` olmayan Base Charge'ı sahte gelir kaçağı diye göstermez. Tahmini `kurtarılan gelir` grafiği yaratılmaz.

**Riskler ve İstisnalar (§24–25, §75):** **Tek** menüde `Operasyon Riskleri` (derived conflict, blocker, turnaround) ve `İstisna İnceleme` (review kaydı/gerekçesi) sekmeleri bulunur. Severity/tarih/şube/kaynak/owner görünür; aynı source uyarısı Komuta Merkezi'nde görünürken yeni Incident veya risk truth'u oluşmaz. İstisna inceleme kararı, gerekiyorsa kaynak işlemin ayrıca yapılması gerektiğini belirtir.

**Kapasite Planlama (§26, §59AC):** `Şube × Sınıf × Gün` matrisinde confirmed class-only demand, specific allocations, blocked windows ve valid External Engagement katkısı doğru düşülür. Kullanıcı sıkışan tarihten ön-doldurulmuş Reservation/available Vehicle/Source görüşüne geçer; **Pending** kapasite sayılmaz, aynı External Vehicle iki engagement üzerinden iki kez sayılmaz. Future location projection, home branch yerine uygunsa beklenen operasyonal şube kuralıyla gösterilir.

**Filo Analizi (§27, §59CH):** Dönem/şube/source type/class bazında gerçek utilization, idle, downtime, maintenance cost ve km trendi; araç drill-down'u §13 Finans & Performans/Geçmiş sekmelerine bağlanır. İç ve external katkı ayrı etiketlenir; net kâr veya keyfi sağlık skoru üretilmez. Tutarsız timespan veya eksik source verisi ‘eksik veri’ olarak görünür.

**Fırsatlar (§28):** Talep/filo/kapasite ve mevcut müşteri follow-up verisinden **deterministik öneri kartları**: tetikleyen kaynak, neden, beklenen aksiyon ve kaynak linki. `İşlemi başlat` ilgili Reservation/Lead/Task formunu ön-doldurur; kendi kendine indirim, gelir veya rezervasyon oluşturmaz. Verisi olmayan fırsat sırf dashboard dolsun diye üretilmez.

**Raporlar (§29, §78.3):** Sekiz kaynak-temelli aile (`Finans / Kiralama / Filo / Ticari / Şube / Kurumsal / Partner / Bakım-Hasar-Ceza`); bütün grafiklerin okunabilir tablo karşılığı, tarih/şube/durum/currency/source filtreleri ve gözlenebilir satır drill-down'u olur. Native-currency toplamlar ayrı; dönüştürülmüş reporting tutarı varsa açık rate-set/version/date/currency etiketi kullanılır. Eksik veri ile sıfır birbirine karıştırılmaz; gösterilen CSV/Print yalnız gerçek browser export/preview ise aktif görünür.

## 82.6 Finans — 3 bağlantı

**Finans (§30, §64–67, §78.3, §85.6):** Tek `Finans Merkezi` içinde `Genel Durum / Charge & Alacaklar / Tahsilatlar (çok payer, çok yöntem, çok currency) / Kaparo & Avanslar / Ödeme Planları / Depozito & Refund / Tedarikçi Borçları / Partner Komisyonları / Kurumsal Cari / Vergi Dökümü` bağlamsal sekmeleri vardır; bunların hiçbiri ikinci sidebar modülü değildir. Rental/Reservation source'a sabit link, amount+ISO currency, payer, method, branch, recorded/applied amount, applied FX snapshot, outstanding ve journal history satır seviyesinde görünür. Invoice/fiskalizasyon gerçek entegrasyonu yok; `Financial Close` ayrı checklist'tir. **Kasa seçimi, manuel kasa hareketi ve vardiya close yalnız Şube Kasaları yönetim ekranından** yapılır; Finans/Rental üzerinde kaydedilen gerçek demo nakit tahsilat/iadeye bağlı **otomatik kasa movement source linki** aynı Cash Drawer ledger'ında bir kez oluşabilir. Finans dashboard salt okunur kasa özeti gösterir; ikinci editable kasa defteri oluşturulmaz.

**Masraflar (§31):** `Draft / Posted / Voided` filtresi, vendor/category/date/branch/currency ve kaynak ilişkisinin net gösterildiği tablo + form. Kaynağı Maintenance/Fine/Roadside/Cleaning vb. olan Expense'te amount kilitli ve linked source'dan derived; manuel bağımsız operational Expense'te gerçek expense kaydı oluşturulur. Supplier Settlement cost'u ayrıca Expense'e duplicate post edilmez; `Refund`, `Deposit Released`, `Partner Commission` expense türü gibi gösterilmez.

**Şube Kasaları (§72, §59M):** `Kasa Seçimi / Vardiya Oturumu / EUR-USD-yerel currency kasa hareketleri / Beklenen–Sayılan / Fark & Devir / Geçmiş` kullanımı tek cash source'a bağlıdır. Her drawer kendi **tek native currency** balance'ını taşır; cash-in customer payment source'u bir kez, cash-out refund/expense source'u bir kez etkiler. Kart/havale satırları fiziksel kasaya para koymaz. Shift close gerekçe/permission/checklist ile çalışır; bir kasanın fazlası diğer currency kasasındaki açığı kur üzerinden gizlice kapatmaz.

## 82.7 Kayıtlar — 3 bağlantı

**Sözleşmeler (§32, §59J, §76, §83–84):** Rental'a bağlı issued version listesi, şirket logosu/antet, tam kiracı+ek sürücüler, Vehicle/condition diagram, fiyat/depozito/sigorta, doğru belge dili/template, imza gereken kayıtlar, staff approval ve immutable signed version ile gösterilir. Preview/Print gerçekten browser tarafından yapılır; e-posta/fiskal gönderim uydurulmaz. Şablonun yeni versiyonu geçmiş issued contract imzasını miras almaz; ayrı müşteriye açık portal/signature URL'si yoktur.

**Belge Merkezi (§33, §50):** Global **belge indeksi**, duplicate Vault değildir. `Owner türü / Kayıt / Belge tipi / Version / Geçerlilik / Eksik–Süresi Yaklaşan` arama ve filtreleri; source'a git, yetkili preview/yükleme eylemlerini owner-domain'de açar. Belge eksikliği `Reservation` oluşturmayı otomatik engellemez; Delivery/Rental gate'i ancak ilgili pinned Document Requirement sonucu engeller.

**İşlem Geçmişi (§36, §59AI):** Salt okunur audit timeline; actor, action, entity, branch, createdAt, önce/sonra özet ve permission-safe source linki. Karar veren/onayı uygulayan, kur snapshot ve finansal correction/reopen kaynakları izlenebilir; log içine kişisel belge tam içeriği veya kart verisi yazılmaz. Sil/değiştir aksiyonu yoktur.

## 82.8 Yönetim — 4 bağlantı

**Şubeler (§37):** Liste ve detayda şube kimliği, timezone, aktiflik, görünür Vehicle operasyonal üyeliği, beklenen teslim/iade, sınıf kapasitesi, kullanıcı erişimi ve varsa kasa linki görülür. `Home Branch / operating branch` ile **physical location** ayrı kolon ve açıklama taşır; şube değiştirme transferin gizli yan etkisi değildir. Para birimi kabulü, kurlar ve vergi hard policy'leri burada ikinci editable store oluşturmaz; **Ayarlar** altındaki ilgili editor'e derin link açar.

**Kullanıcılar (§38, §59CM):** Aktif/pasif, rol/şube scope, rol değiştirme, davet/reset **demo** akışı ve güvenli aktör bağlamı görülür. Auth e-postası gönderilmediyse `gönderildi` denmez; olmayan gerçek login activity uydurulmaz. Role değişikliği açık demo oturumunda izinli menü ve kayıt görünürlüğüne yansır; native mobil/production auth kurulumu talimatı değildir.

**Roller ve Yetkiler (§39, §83.5):** `Modül × action` erişim matrisi, branch scope, permission preview (`bu rol Rezervasyonu görebilir mi, Refund uygulayabilir mi?`) ile personanın beklediği UX test edilir. **Approval requester ≠ reviewer** ve approved ≠ applied kuralı burada da geçerlidir. Yetki kontrolleri browser demo UI simülasyonudur; gerçek tenant isolation veya production security iddiası yoktur.

**Ayarlar (§40, §59F, §63, §74, §78.4, §83.1, §84):** `Şirket & Yerelleştirme / Kabul Para Birimleri / Döviz Kurları / Vergi / Fiyat & Süre / Sigorta / Sürücü / Deposit–Ödeme–Refund / Kasa–Vardiya / Belgeler / Sözleşme Dilleri / Yetki Eşikleri / Bildirim Kuralları / Gizlilik` **tek şirket policy workspace'i**. Her editor mevcut typed source/policy sürümüne yazar, değişikliğin gelecekteki işlemlere etkisini ön izletir; geçmiş posted snapshot'ları rewrite etmez. `Döviz Kurları` tek editör buradadır; Finans rate snapshot'ı readonly gösterir. Şube/Kullanıcı/Rol CRUD bu menüde çoğaltılmaz; yönetim ekranlarına linklenir. `Platform Console` ayrı Super Admin bağlamıdır; Ayarlar altına şirketler arası tenant CRUD sokulmaz.

## 82.9 Özellikle derinleştirilecek 7 çekirdek çalışma alanı — ekrandaki zorunlu bütünlük

**A. Kiralama 360° (en yüksek operasyon önceliği; §10 + §82.3):** Tek Rental sayfasının sabit üst bandında müşteri, **specific Vehicle**, plan/gerçek saat, operasyonel durum, finansal durum, document/driver/coverage ve açık blocker görünür. Alt sekmeler, `Prepared → Delivered → Returned → Closed` ile olağan dışı `Delivered → Exception Closed / Loss Closed` yollarını **farklı kanıt kontrol listeleriyle** temsil eder. Sağ işlem alanı `sonraki yapılabilir eylem`, neden kapalı, gerekli kaynak, mevcut charge/outstanding ve audit linkini gösterir. `Financially Closed` olmak `Vehicle Ready` yapmaz; Delivery base charge posted zamanlaması tek hesaplama source'udur.

**B. Rezervasyon 360° (satıştan operasyona geçiş; §9 + §82.3):** Liste ve detayda kullanıcının karar vermesi gereken üç ayrı soru aynı anda görülebilir: `Fiyat/teklif doğru mu?`, `Class demand veya specific Vehicle kapasite uygun mu?`, `Müşteri/doküman teslim için hazır mı?`. `Pending`, `Confirmed`, `Converted` kaydı birbiriyle karışmaz. Reservation kaparosu tek Advance source'udur; Conversion'da explicit transfer yapılır, Delivered Charge posted olana kadar tutar zorla revenue sayılmaz. Fiyat değiştiğinde önceki snapshot ile güncel preview ve kullanıcının onayı görünür.

**C. Finans ve çoklu tahsilat (işletme güveni; §30 + §82.6):** Rental finance panelinde tek satır gösterilmez: **Charge'lar**, müşteri borcu, alınan ama henüz uygulanmamış ödemeler, Applied allocations, ayrı **Deposit Held/Applied/Released**, Refund, ilerideki Payment Schedule ve izinli Correction açıkça ayrılır. Bir ödeme formu önce payer/amount/tender currency/method/branch/rate snapshot seçtirir, sonra kullanıcıya hangi exact Charge/obligation currency tutarına uygulanacağını gösterir. Farklı tender currency için gerekli rate yoksa ödeme satırı yalnız **UI taslağı** olarak kalır (`Awaiting Rate` validasyon mesajı; kayıtlı Payment status'u değildir), ne `Recorded` ne de `Applied` sayılır; son kişi `kalanını öde` dediğinde **o anki gerçekten Applied bakiye** alınır (§64.2). Rapor yalnız verified Posted/Applied data'yı toplar. Üç kişi/dört farklı ödeme örneği §64.2'nin kendisiyle aynı sonucu vermelidir.

**D. Müşteri 360° (iş akışı hızlandırma; §16 + §82.4):** Müşteri arandığında kimlik, residency, görülebilir belge eksikleri, aktif/prospektif kiralamalar, open Finance receivables, son iletişim/görev, izinli notlar ve **aynı müşteri için direkt Reservation başlatma** tek workspace'de birleşir. Corporate ticari hesap **ayrı source** olarak linklenir; kurumsal limit Customer alanına kopyalanmaz. Belge görüntülemeleri role-gated, duplicate merge geçmişi izlenebilir; risk etiketi kaynağı olmadan negatif otomatik hüküm vermez.

**E. Fiyatlandırma & admin FX ayrımı (küresel tutarlılık; §20 + §63 + §82.4/82.8):** Fiyat ön izlemesi Rate/Season/Corporate/Extra/Discount/Tax/Coverage satırlarına ve **tek transaction currency**'ye sahiptir. Global para birimi kataloğu kullanılabilir; eksik configured price component durumunda hesap bloklanır. Bir şube EUR fiyatı BAM, USD veya başka kabul currency'sinde aldığında Finance tender rate snapshot'ı kullanılır; admin'in tanımladığı exchange rate ayarı **yalnız Yönetim → Ayarlar → Döviz Kurları** üzerinden değiştirilebilir. Pricing ve Finance bağımsız kur rakamı giremez.

**F. Tedarikçi / dış araç 360° (çifte rezervasyon ve borç önleme; §59U–AD + §82.4):** Sourcing Request, Engagement, External Master, Supplier Receive, Supplier Return, Supplier Settlement, Supplier Deposit **farklı işlem kaynakları** olarak zaman çizelgesi üzerinden bağlanır. `Teklif Kabul` fiziksel aracı Received yapmaz. External Vehicle gelecekte Confirmed engagement window'da allocation alabilir, ama Delivery için `Received + Ready` zorunludur. Supplier'a borç ödeme ve depozito mahsup ayrı event; ödemek Vehicle Return inspection'ı olmuş gibi göstermez. Aynı external master farklı tarihlerde engagement'a girebilir, çakışan confirmed windows olamaz.

**G. Ayarlar + Onay + Yetki üçgeni (gizli politika farkını önleme; §21–22, §39–40, §74, §82.5/82.8):** İş politikası **typed Settings/Agreement** source'unda; Approval Center **yalnız altı type** request/approve/apply state'inde; Rules Builder **safe notification/review** katalogundadır. Yetkisiz kullanıcı butonu kaldıramaz/bypass edemez; demo role switch ile hangi policy/approval kaynak aksiyona bağlandığı gösterilir. Approved-not-Applied Deposit Exception efektif tutarı değiştirmez; Financial Correction ve Refund formal workflow'u source action'da bekler. Böylece üç farklı ekran aynı kararı birbirinin yerine vermez.

## 82.10 Uygulama ve kapsam sınırı

- **Öncelik**, kapsam düşürme değildir: en yoğun günlük iş olan `Araçlar → Rezervasyonlar → Kiralamalar → Finans/Şube Kasaları → Müşteriler → Fiyatlandırma` ekranları özellikle zengin UI ister; diğer **bütün** sidebar rotaları §82.2–82.8 sözleşmelerine göre gerçek kullanılabilir kalır.
- Bu metin §II.5 Stage sırasını değiştirmez: ortak demo truth Stage 0, policies/6 approvals Stage 1, kaynak master'ları Stage 2, Reservation Stage 3, Rental Stage 4, Finance Stage 5, diğer entegre domainler Stage 6, analytics ve portal Stage 7, bütünleşik QA Stage 8. Bir rota erken shell'de varsa **inert butonla tamamlandı** sayılmaz.
- Ayrı `Payment`, `Insurance`, `Kaparo`, `Tax`, `Tire`, `Alert`, `Owner Dashboard`, `Exchange Rate Desk`, `Platform Console` gibi **ek şirket sidebar maddesi** türetilmez. Bağlamsal sekmeler ve ayrı yetkili web context kuralları §4'e tabidir.
- Her menü sözleşmesinin ekrandan gözlemlenebilir sonucu, Part III **I.2** kontrol listesindeki işlemlerle test edilir. Her adım çalışmadan bütün 36 ekranı tamamlanmış diye raporlama.

---

# 83. KİRALAMA SÖZLEŞMESİ, GÖRSEL HASAR İŞARETLEME, EK SÜRÜCÜ, YETKİ VE GÖREV DERİNLİĞİ — WEB V1

**Bağlayıcı yorum:** Bu bölüm §4'teki 7 kategori/36 sidebar bağlantısına yeni bağlantı eklemez. `Kiralamalar`, `Sözleşmeler`, `Araçlar`, `Hasar Kayıtları`, `Görevler`, `Kullanıcılar`, `Roller ve Yetkiler` ve `Yönetim → Ayarlar` aynı mevcut source record'ları kullanır. §83, önceki genel maddelerin burada detaylandırılmış **görünür kullanıcı etkileşimi** sözleşmesidir. `Additional Driver` daha önce hariçti; kullanıcının açık kararıyla artık **yalnız WEB V1 konsepti** içindedir. Backend, production auth, gerçek müşteri portalı, uzaktan imza bağlantısı, legal e-imza sağlayıcısı veya native mobil uygulama eklenmez.

## 83.1 Şirket logosu, antet ve sözleşme şablonu

**Yönetim → Ayarlar → Şirket & Yerelleştirme / Sözleşme Dilleri ve Şablonları** mevcut iki bağlamsal ayar panelidir; şirket ve şube yönetimi için başka editable owner yaratılmaz.

- Patron/yetkili yönetici şirket **logo dosyasını yükler, değiştirir, kaldırır**, orijinal boyutu/formatı geçerli değilse açık uyarı görür. Baskı için orantı korunur; bozuk görüntü/taşan antet olmamalıdır. Logo yoksa temiz tipografik şirket anteti kullanılır; sahte görsel üretilmez.
- Şirket ticari adı, adres, iletişim, kayıt/vergi kimliği (varsa), şube antet iletişim bilgileri ve sözleşme belge dili aynı şirket/şube profilinin izinli görünümüdür. İlgili ülkenin zorunlu hukuki alanları için ülke profili/şablon alanı **açık karar** olarak işaretlenir; otomatik hukuki geçerlilik iddiası yoktur.
- `Taslak Şablonu Ön İzle`, `Yazdırma Ön İzlemesi` ve `Yeni Şablon Sürümü` aksiyonları işlevseldir. **A4 görsel blok/alan düzeni, izinli dinamik alan kataloğu, zorunlu alan kilidi, ülke/dil bazlı metin kontrolü ve demo belge numarası serisi** aynı şablon ayarında (§85.3) yönetilir; ikinci template editörü yoktur. Aktif şablon/sürüm/yerel dil seçimi anlaşılır. Değişiklik **gelecekte düzenlenecek** sözleşmelere uygulanır; issued/signed versiyonun logo ve metni geriye dönük güncellenmez.
- Kiralamadaki `Sözleşme Hazırla` ve **Kayıtlar → Sözleşmeler** aynı Contract source/template sürümünü açar. Başka yerde ikinci bağımsız sözleşme editörü yoktur.

## 83.2 Kiralama tamamlanınca tek akışta otomatik sözleşme

**Operasyon → Kiralamalar → Kiralama Oluştur/Dönüştür → Kiralama Detay → Sözleşme** içinde görünür **`Sözleşmeyi Ön İzle` → `Sözleşmeyi Oluştur` → `Yazdır veya Ekranda İmzalat`** aksiyon zinciri bulunur. Yeni Rental `Prepared` olduğunda girilen doğrulanmış verilerden **taslak ön izleme** anında hesaplanabilir. `Issue` yalnız gereken belge, sürücü, vehicle assignment, fiyat/şablon ve permission kontrollerini geçince yapılır; belge düzenlemek `Delivered` yapmaz. Eksik alanlar alan adıyla gösterilir, kullanıcı ilgili forma geri döner.

Yazdırılabilir kontratta kaynağı varsa yer alacak bloklar:

1. Şirket logosu, anteti, şirket/şube iletişim ve kimlik bilgileri; **sözleşme no, versiyon, issued at, dil, sayfa numarası**.
2. Ana kiracı/müşteri: ad-soyad veya kurumsal yasal taraf, iletişim, gerekli kimlik/pasaport/ehliyet **uygun veri minimizasyonuyla**; tam belge görüntülerini veya gizli bilgileri izinsiz baskıya dökme.
3. **Birincil sürücü ve onaylanmış ek sürücüler** ayrı satırlar, ehliyet bilgileri/geçerlilik onayı; ödeme yapan başka kişiler kendiliğinden sürücü olmaz.
4. Araç: **plaka, marka, model, sınıf**, seçilen Vehicle source; gerekiyorsa VIN/şasi ve filo kimliği ancak zaten Vehicle master'da kayıtlıysa gösterilir; uydurulmaz.
5. Şube teslim ve planlanan iade, gerçek teslim zamanı (Delivery sonrası düzenlenen ilgili sürümde), süre, kilometre limiti, geç iade ve yakıt koşulları.
6. Fiyat kalemleri: kira bedeli/ekstralar, indirim/onay, tax/VAT/PDV breakdown, transaction currency ve toplam, ayrı **depozito** ve varsa rezervasyon avansı; **şirketin değişken kuruyla tahsil edilmiş karma ödemeler** sözleşmenin yasal borç para birimini değiştirmez. Ödeme makbuzu kaynak olarak ayrı olabilir.
7. Seçili sigorta/coverage, muafiyet/deductible ve mevcut poliçe koşulları, yasak/ek hükümler; içerik yalnız seçilmiş sürümden alınır.
8. Araç durum planı ve **hasar pinleri**; teslim km, beş sabit yakıt değeri, anahtar/ekipman listesi ve ilgili 4–5 inspection kanıt fotoğrafına ref/ayrı teslim tutanağı. Henüz teslim yapılmadıysa **taslak araç durumu / teslimde tamamlanacak** etiketi basılır; gelecekteki gerçek km/fotoğraf uydurulmaz.
9. Şartlar, gizlilik/aydınlatma referansı, müşterinin kabul işaretleri, müşteri ve şirket temsilcisi **imza alanları**; imza zamanı/versiyonu ve gereken personel onayı ayrı.

Önemli zaman kuralı: `Prepared` Rental'daki Contract draft/issued versiyonundaki **planlanan bilgiler** ile `Delivery` sırasında oluşan **gerçek inspection ve teslim km/yakıtı** karıştırılmaz. İki çıktı gerekiyorsa `Contract` + `Teslim Tutanağı` birbirine reference verir; teslimden sonra güncellenmiş içerik gerekiyorsa **yeni belge versiyonu** üretilir, eski imza yeni versiyona taşınmaz. Geçmiş belge, sonradan değişen fiyat, rate, logo, sürücü veya hasar kaydıyla sessizce yeniden yazılmaz.

## 83.3 Birincil ve ek sürücülerin net yönetimi

- Rental formunda `Birincil Sürücü` ve `Ek Sürücü Ekle/Kaldır` alanları bulunur; **bir Rental'da birincil sürücü tam bir kişidir**, onaylanmış ek sürücüler 0..N olabilir. Şirket policy'si izin verilen azami ek sürücü sayısını açıkça belirleyebilir; seçilmemiş generic Extra sürücülük hakkı vermez.
- Her sürücü için kimlik/ad, doğum tarihi, ehliyet tür/sınıf, ehliyet başlangıç/bitiş tarihi, gerekiyorsa ülkesi/belge referansı ve ilgili Document Requirement version'ı tutulur. Existing Customer person kaydı kullanılıyorsa referans verilir; gizlilik kuralları korunur. Başka kişinin ödeme yapması ek sürücü yaratmaz.
- **Her sürücü ayrı** `Eligible / Review Required / Blocked` uygunluk sonucu görür: ülke/şube/class, pickup→return tarih aralığı, yaş, ehliyet yılı/sınıfı ve expiration policy. Uygun olmayan sürücü sözleşmede yetkili olarak issued/delivered edilmez; açıklama ve düzeltme bağlantısı vardır.
- Ek sürücü için ücret varsa ücret **Price Snapshot → Charge** tek kaynak kuralına dayanır; ücret yoksa sahte charge oluşturulmaz. Sigorta kapsamı ek sürücülere uzanıyor mu, poliçe/coverage snapshot'ının açık koşuludur; varsayılan kapsam uydurulmaz.
- İmzalanmış sözleşmeden sonra sürücü ekleme/çıkarma gerekirse, yetkili `Sürücü Değişikliği` ile gerekçe, uygunluk tekrar kontrolü ve gereken **yeni Contract version / imza** akışına gider. Önceki yetkilendirilmiş sürücü listesi audit'te korunur.

## 83.4 Araç eksper diyagramı, hasar pini, fotoğraflar ve imza

- **Teslim ve İade Inspection** formunda aracın basit **üstten/önden/arkadan/sol/sağ** dış gövde siluet görünümleri yer alır; gerçek araç fotoğrafının yerine geçmez. Kullanıcı uygun görünüm üstüne **pin bırakır**, sürükleyerek konumlandırır veya düzenler. Pin `vehicleId + inspectionId + view + normalized x/y + condition category + note + optional linked evidence photo ID + actor/time` taşır.
- Hasar/iz tipleri (ör. çizik, göçük, çatlak/kırık, leke/diğer) etiketlidir; açıklama ve ilgili fotoğraf bağlanabilir. Her pin tek inspection evidence kaynağının annotation'ıdır; **pin tek başına hukuken hasar tespiti, yeni Damage case ya da müşteriye Charge değildir.** Yetkili `Hasar Kaydı Aç` aksiyonu ile mevcut Hasar Kayıtları source'una bağlanır.
- Teslimdeki pin haritası snapshot'ı korunur. İadede **teslim pinleri read-only referans**, iade pinleri ayrı yeni set olarak görünür; `Önce / Sonra` karşılaştırması yeni/eski/inceleme gereken farkları gösterir. Teslim pinleri iadeyle overwrite edilmez, Damage kararını otomatik vermez.
- Normal Rental handover ve normal return için **her aşamada ayrı 4–5 gerçek kanıt fotoğrafı zorunluluğu** aynen korunur. Diyagram, pin ve çizim bunların yerine sayılmaz. Supplier receive/return ve Vehicle Swap zaten kendi 4–5 foto evidence setini kullanır; ilgili context'te aynı pin UI bileşeni tekrar kullanılabilir, source event'ler birleşmez. Exceptional closure'da normal foto gate'i değil §71 exceptional evidence kuralı geçerlidir.
- Contract print/PDF'de anlaşılır **Araç Durum/Hasar Şeması** ve o belge versiyonuna bağlı pin/inspection referansı görünür. Henüz fotoğraf yüklenmediyse `fotoğraf varmış` gibi davranılmaz.
- **Ekranda imza:** yetkili personel dahili web Rental/Contract ekranını müşteriye gösterip canvas/dokunmatik/fare imzası alabilir. `Onayla` öncesi belge sürümü ve imzalayan taraf görünür; imza görüntüsü, imzalayan adı, atılma zamanı, Contract version ve demo actor/reference birlikte pinlenir. **İmzayı Temizle** yalnız henüz finalize edilmemiş canvas'ı temizler; final imza silinmez/değiştirilmez. Basılı/ıslak imza alternatifinde `Baskı Alındı`, `Islak İmzalı Nüsha Alındı` kayıt durumu **elle ve denetim iziyle** işaretlenir; kâğıt fiziksel olarak kontrol edilmiş gibi otomatik iddia yoktur.
- Bu **local interactive WEB UI demo** imzasıdır. Uzaktan imza URL'si, customer-facing sayfa, qualified e-signature sertifikası, gerçek imza doğrulama sağlayıcısı veya hukuken geçerli e-imza iddiası yoktur. Ülkeye göre imza geçerliliği ayrıca hukuken incelenecektir.

## 83.5 Patronun ayrıntılı personel yetkileri ve gizlilik

- **Yönetim → Kullanıcılar / Roller ve Yetkiler** içinde patron (ve açıkça delegasyon verilen admin), hazır rolü seçer veya **özel rol** oluşturur. Matriste `modül × View/Create/Edit/Delete-or-Archive/Assign/Approve/Apply/Post/Void/Export/Manage` uygun eylemleri ve **Company / belirli Branch(es) / own-assigned records** scope'u yönetir. Her kaynakta anlamsız eylem sunulmaz (ör. rapor için `Post` yok).
- Tek personele özel erişim gerektiğinde kullanıcı bazlı **explicit allow/deny override**, rol/şube/tenant security boundary'sini veya immutable source restrictions'ı aşamaz. **Effective Permission** tek hesaplama sonucu olarak `Role Grants ∩ Company/Branch Scope + izinli kullanıcı istisnaları − explicit denies` şeklinde, kullanılmadan önce `Bu kullanıcı ne görür/yapabilir?` simülasyonunda açıklanır. `deny` baskındır; şirketler arası veri izni verilemez.
- Örnek: resepsiyon `Rezervasyon/Kiralama/Araç/Görev` görebilir ama `Banka tahsilatlarını, araç maliyetlerini, kârı, bordroyu, müşteri kimlik belge görüntülerini` yalnız açık ek izin varsa görür. Kasa kapatma, refund, kur değiştirme, personel yönetimi, sözleşme imzası/issue, hassas belge indirme ve ödeme void işlemleri ayrı action permission'lardır.
- Uygulama aynı `effectivePermission` kararını **sidebar**, liste sayımı, satır, araç/Rental detay sekmesi, search, report, export, deep-link, yazdırılabilir dosya ve görev alıcı seçiminde uygular. URL elle girilse bile demo rol simülasyonunda yetkisiz ekranın hassas payload'ı görünmez.
- Personel aktifleştirme/pasifleştirme ve rol/şube değişikliği sonraki demo etkileşimlerinde her yerde tutarlı görünür; audit actor + before/after kaydı tutulur. Yetki vermek geçmiş onay/imzayı değiştirmez. **Requester ≠ Reviewer** ve diğer Approval Center 6-type kuralları aynen kalır. Bu model gerçek üretim kimlik doğrulama veya güvenlik izolasyonu yerine geçmez.

## 83.6 Görevler: bir/birkaç/herkese duyuru, açık havuz ve üstlenme

- **Operasyon → Görevler** `Bana Atananlar / Açık Görev Havuzu / Üstlendiklerim / Devam Eden / Bugün / Geciken / Tamamlanan / Oluşturduklarım` hazır filtreleri, branch/source/category/priority/due filtreleri ve rol yetkili listeyi içerir. Komuta Merkezi yalnız bu aynı Task source'unun projeksiyonunu gösterir.
- Görev oluştururken **başlık, açıklama, kaynak linki (Vehicle/Rental/Reservation/Incident vb.), şube, son tarih/saat, `Acil / Yüksek / Normal` önceliği** ve hedef kitle seçilir: **Bir Kişi / Seçilen Birkaç Kişi / İzinli Ekibin Tümü**. `Tümüne Duyur` izni company/branch hedef scope'unu aşmaz; dış kişilere gerçek mesaj gönderilmez.
- **Gönderildi/bildirildi = görev tamamlandı değildir.** Bir görev `taskId` ile **tek kayıttır**; seçilmiş alıcılar/followers/participants çok olabilir; **Open/sahipsiz havuz** durumunda owner yoktur, üstlenme veya doğrudan atama sonrasında **en fazla bir hesap verebilir owner** vardır. Çok kişiye iş dağıtılacaksa görev `Open / sahipsiz havuzda` bekler, yetkili bir kişi `Üstlen` der ve owner olur; diğer alıcılar takipçi/katılımcı kalır. Oluşturan kişi ayrıca doğrudan **tek** sorumlu atayabilir. Aynı görevin kopyaları ile sahte beş tamamlandı durumu üretilmez.
- `Üstlen` yalnız `Open`, sahipsiz ve kullanıcının uygun role/branch scope'unda olduğu görevde çalışır; iki kullanıcı aynı anda üstlenirse yalnız ilk geçerli state change kabul edilir, diğeri `Artık üstlenilmiş` görür. `Devret`, `Takipçi Ekle/Çıkar`, `Tamamla`, `İptal`, `Yeniden Aç`, `Üstlenmeyi Bırak` yalnız belirtilmiş permission ve audit'le çalışır. `In Progress` owner, başladı zamanı ve ilerleme notlarını gösterir; `Completed` kim/tarih alanı gerektirir.
- Task öncelik sırası `Acil > Yüksek > Normal`; süre geçmişse ayrıca `Gecikmiş` sinyali görünür, gerçek önem sınıfını otomatik değiştirip tarihe göre yeniden yazmaz. Okunmadı, bildirim ve gecikme sinyalleri Notification Center / Command Center projeksiyonudur; demo arka plan job/push gönderilmiş sayılmaz.
- Görev detayında creator/owner/recipients/watchers, priority, due, source ve yorum/zaman çizelgesi birlikte görülür; hangi kişinin hangi işte olduğu Owner/Manager iş yükü görünümünde source-backed sayılır. Personel yalnız erişebildiği görevi/bağlı kaynağı görür; kapalı finans/kimlik içeriği görev açıklaması veya bildirimde sızmaz.
- Task'ı tamamlamak **Rental teslimini, Maintenance Completed'i, Incident Resolved'ı veya finansal kapanışı tetiklemez**; kaynak domain eylemi ayrıca yapılır. Tek doğru Task truth'u korunur.

## 83.7 Bu konular için kabul sırası

1. Logo yükle/değiştir → yeni Contract preview yeni logoyu kullanır → eski issued/signed PDF/print görüntüsü eski sürümü korur.
2. Rental oluştur/convert → Primary+Additional Driver policy sonucu → eksik/blocker açıklaması → doğru Contract template/branch/language ile ön izleme → Issue (Delivery değil) → print veya web signature → gereken staff approval → Delivery gate.
3. Teslimde 4–5 foto + eksiksiz hasar pinleri → Return'de ayrı 4–5 foto ve pinleri → `Önce/Sonra` → Damage case yalnız açık yetkili eylemle → müşteri Charge yalnız mevcut Damage/Insurance/Finance kuralıyla.
4. Owner rol matrisi + kullanıcı istisnasını değiştirir → çalışan sidebar, search, report, export, finans, belge, Contract print ve URL-deep-link aynı effectivePermission'a göre değişir; şirkete/şubeye ait olmayan kayıt açılmaz.
5. Görev bir personele, birkaçına veya izinli ekibin tümüne duyurulur → açık havuzda tek Task kalır → yalnız bir yetkili `Üstlen`ebilir → diğerleri aynı kaydı görür → tamamlanan görev kaynak Rental/Maintenance/Incident'i otomatik tamamlamaz.

---

# 84. KİRALAMAYA ÖZEL SİGORTA, DEPOZİTO KARARI VE A4 OPERASYON EVRAKI — WEB V1

**Bağlayıcı sınır:** Bu bölüm, §83'teki logo/sözleşme/ek sürücü/hasar pini kararlarını tamamlar; bunların yerine geçmez. §4 navigasyonu **7 kategori, 36 başlık** olarak kalır. Yalnız etkileşimli WEB UI konsepti yapılır; backend, native mobil, gerçek POS, sigortacı/servis entegrasyonu, dışarıya otomatik e-posta/WhatsApp gönderimi veya hukuken sertifikalı e-imza iddiası YOKTUR.

## 84.1 Yönetim → Ayarlar → Sigorta Paketleri: şirketin kendi isim/fiyat/kapsam tanımı

- Yetkili yönetici `Paket Oluştur/Düzenle/Devre Dışı Bırak` eylemleriyle **görünen paket adı, iç kod, açıklama, dahil/opsiyonel/zorunlu işaretlemesi, aktif dönem, şirket/şube, ülke/bölge, vehicle class ve gerekiyorsa açık Vehicle eligibility**, günlük veya kiralama-başı ücret, ücret currency'si, vergi kodu/dahil-hariç gösterimi, excess/deductible tutarı + currency'si, kapsanan/kapsanmayan olay türleri, azami sorumluluk koşulu, ek sürücü kapsamı, poliçe/sağlayıcı referansı ve müşteri belge dilindeki şartları tanımlar.
- **Herkese aynı paket otomatik atanmaz.** Rental formu yalnız geçerli şube + araç sınıfı/özel araç + kiralama tarih aralığı + sürücü kurallarına uyan aktif paketleri gösterir. Kullanıcı `Dahil/varsayılan`, `Opsiyonel seçilebilir` ve `Bu kiralamada seçili` farkını görür. Şirketin gerçekten **zorunlu** yaptığı kapsam gizlice kaldırılamaz; opsiyonel olan bir paket kullanıcı seçmeden ücrete/sözleşmeye girmez. Uygun tek paket yoksa neden açıklanır; rastgele paket atanmaz.
- `Sigorta & Muafiyet` adımında kart veya tablo: **Paket adı / toplam dönem ücreti ve birimi / günlük veya sabit fiyat / muafiyet ve birimi / kapsananlar / istisnalar / ek sürücü durumu**; `Detayları Gör`, `Bu Paketi Seç`, `Paket Olmadan Devam Et` (**yalnız politika izin verirse**) aksiyonları. Paketin **o Rental transaction currency'sinde geçerli explicit fiyat satırı** yoksa ücretli paket seçilemez ve kiralama fiyatı/onayı bloke edilir; `Paket Fiyatı Eksik` ve yetkili ayar bağlantısı görünür. **Fiyat dönüşümü/approval ile bu eksik bypass edilmez; payment FX hiçbir koşulda paket fiyatı oluşturmaz** (§20, §59CR, §85.1).
- Seçilen paket `Rental coverage snapshot`'ına **package id/version, geçerli şartlar, seçili sürücüler, hesaplanmış fiyat/tax, currency, deductible, limits ve uygulanan kural sürümüyle** yazılır. Aynı fiyat/ücret kalemi yalnız kanonik Pricing Snapshot ve sonradan doğru Charge tetikleyicisiyle oluşur; ayrıca ikinci editable `insurance fee` veya ikinci Charge üretilmez. Rental'ın `Prepared` ön izlemesi charge posted değildir; Delivered ve sonrasında §67 geçerlidir.
- Sözleşmenin sigorta bölümü **seçilen Rental snapshot'ını** kullanır; gelecekte adminin paket adını/ücretini değiştirmesi, geçmiş sözleşme ve hasar sorumluluğunu değiştirmez. Paket sonradan değiştirilirse yetkili `Kapsam Değişikliği` nedeni, fiyat farkının mevcut extension/correction politikası ve **gerekli yeni Contract version/imza** uygulanır; sessiz overwrite yapılmaz.
- **İki sigorta kaydını ayır:** (A) **Rental Protection/Coverage Package** = müşteriye sunulan şart/ücret/muafiyet. (B) **Vehicle Insurance Policy** = aracın gerçek sigortacısı, poliçe numarası, bitiş tarihi ve varsa insurer-claim kaynağı. Servise/sigortacıya verilen belge (B) ve linked Damage/Incident verilerini kullanır; (A) müşteri sorumluluk analizinde ayrıca okunur. Paket satın almak gerçek poliçe düzenlendiği veya sigortacıya dosya açıldığı anlamına gelmez.

## 84.2 Kiralamaya göre depozito var mı, ne kadar, hangi para birimi?

- **Yönetim → Ayarlar → Depozito Politikası** tek kurumsal düzenleme yüzeyidir: şirket varsayılanı, şube ve vehicle class kombinasyonları (uygunsa tekil Vehicle için açık seçim), geçerlilik tarihleri ve eşik/hesaplama kuralları. Her eşleşmede **`Depozito gerekli` / `Politikaya göre depozito gerekmiyor`**, sabit tutar veya mevcut fiyatlandırma bağlamında hesaplanan tutar, **currency**, gerekli tahsilat/bloke yöntemleri, release/uygulama koşulları ve açıklama tutulur. `0` tutar ile **bilinmeyen/hesaplanmamış** tutar eşit değildir.
- Global/company policy **içi** deterministik özgüllük: exact eligible Vehicle + branch > branch + class > branch > class > company default (her düzeyde sürüm/effective-date geçerli olmalı). Aynı düzeyde birden fazla aktif eşleşme varsa ön izleme bloke edilir; admin ayar çakışmasını çözmelidir. Ardından §59BE'nin **Global policy → Corporate Agreement override → Applied Deposit Exception** sırası geçerlidir. Bu kural §59BE'nin dördüncü üst seviye otoritesini yaratmaz.
- **Rental `Depozito` adımı**: `Gerekli mi?`, `Efektif tutar + para birimi`, `Neden bu tutar?` (policy + branch/class/Corporate/Applied Exception provenance), planlanan yöntem, varsa gerçek `Held/Partially Applied/Applied/Released`, kalan bloke, işlem referansı ve yetki durumu görünür. **Depozito seçili sigorta paketinin ücreti veya muafiyeti değildir; kiralama bedeline kendiliğinden katılmaz.** Sigorta paketine göre depozito indirimi ancak **typed Deposit Policy'nin açık bir girdisi/sürümü** ise uygulanabilir; kullanıcı seçim yaptı diye gizli indirim olmaz.
- Resepsiyon görevlisi serbestçe `0` yazıp zorunlu depozitoyu kaldıramaz. Kiralama özelinde istisna gerekiyorsa mevcut **altı formal Approval türünden Deposit Exception** talebi (exact Rental, tutar, currency, gerekçe) açılır; sadece `Approved` değil, **`Applied`** olduktan sonra efektif tutar değişir. Deposits `Held/Applied/Released` Finance truth'unda tek kez tutulur; kaparo, rent payment, deductible ve müşteri Charge farklıdır.
- Para birimi farkında deposit `Held` tutarı **kendi currency'sinde** korunur. Charge'a deposit `Applied` için farklı currency gerekiyorsa açık rate snapshot, gereken izin ve §63–64 rounding/allocation kuralı kullanılır; farklı currency'ler doğrudan toplanmaz. **Aynı tutar iki kere Applied olamaz.**

## 84.3 Kiralama açarken operatörün göreceği birleşik adımlar

1. `Müşteri ve Sürücüler`: yasal kiracı ile birincil/0..N ek sürücü (§83.3), kişi bazında belge/ehliyet/geçerlilik sonucu.
2. `Araç / Tarihler / Şube`: specific Vehicle, gerçek müsaitlik, sınıf ve teslim/iade aralığı.
3. `Ekstralar`: yalnız seçilen mevcut ürünler ve varsa ek sürücü ticari kalemi.
4. `Sigorta & Muafiyet`: şirketin bu araca/şubeye uygun katalog seçenekleri, açık seçim, ücret/kapsam/deductible özeti; bu seçimin Price Snapshot'ı güncellediği görünür.
5. `Fiyat & Vergi`: kira, ekstralar, seçili sigorta, ek sürücü, vergi, indirim, toplam **tek currency/tek kanonik hesaplama**.
6. `Depozito`: açıkça gerekli/gerekmiyor, efektif amount+currency ve kaynak politika; Rental Charge totalinden ayrı.
7. `Sözleşme`: şirket logosu + taraflar + sürücüler + araç + planlanan döneme ait tüm ticari şartlar + varsa hasar şeması; **`Ön İzle → Oluştur → A4 Yazdır / Gerçek PDF İndir / Personel Web Ekranında İmzalat`**. İmzadan sonra veriler değişirse yeni version ve gerekiyorsa yeni imza (§83).

**Örnek (tamamen demo):** Aynı şubede bir araç sınıfı için `Standart Koruma` ücretsiz/dahil, bir başka uygun sınıfta `Genişletilmiş Koruma` 12 EUR/gün opsiyonel tanımlanabilir. Aynı kiralamada kurala göre `300 EUR depozito gerekli`, kurumsal anlaşmalı başka kiralamada `depozito gerekmiyor` görünebilir. Paket/depozito durumu **müşteriye, araca ve uygulanan politikaya göre hesaplanır**; hiçbir personel bunları kendi başına diğer Rental'lara kopyalamaz.

## 84.4 A4 operasyon belge şablonları: mevcut ekranlara bağlı

`Yönetim → Ayarlar → Sözleşme ve Operasyon Belge Şablonları` tek template editörüdür; blok/alan kataloğu, zorunlu alan kilidi, belge numara serisi ve gerçek A4 ön izleme davranışı §85.3 ile bağlıdır; **ek bir sidebar başlığı değildir**. Varsayılan uluslararası **A4 portrait** (gerektiğinde vehicle body map landscape ek sayfa) şablonları; şirket logosu, ticari unvan/adres/şube iletişimi, belge dili, şablon kodu/sürüm, tarih/saat, belge adı/no, kaynağına linklenen referans, sayfa no, imza/teslim alanları ve baskıda okunaklı alanlarla yapılandırılır. Ülkeye özel zorunlu metin otomatik hukuk garantisi değildir.

| Çıktı / giriş noktası | Kanonik veri sahibi | Gerçek veriden doldurulacak A4 içeriği |
|---|---|---|
| **Kiralama Sözleşmesi**: Kiralamalar → Sözleşme; Kayıtlar → Sözleşmeler | Rental-linked versioned Contract (§83) | şirket/şube, kiracı ve ek sürücüler, araç, dönem, fiyat/vergi, sigorta/deductible, ayrı depozito, imza, teslim formuna referans |
| **Teslim / İade Araç Durum Tutanağı**: Rental → Teslim/İade; Vehicle 360 | Her ayrı immutable Inspection | km, fuel, key/equipment, 4–5 gerçek foto ref, pinli hasar diyagramı, teslim/iade zamanları ve personel/müşteri imza alanları |
| **Servis Sevk / Bakım İş Emri**: Araç 360 → Bakım & Lastikler veya Bakım & Servis Detay | **Maintenance** + Vehicle + Service Provider | plaka/model/VIN (varsa), güncel kaynak km, arıza/şikayet, istenen işler, servis/usta, randevu, ilgili damage/photos, not, tarih, araç teslim eden/alan imza alanı; estimated cost varsa açık `Tahmini` |
| **Sigorta Hasar Bildirim / Dosya Özeti**: Hasar Kayıtları → ilgili dosya, Araç 360 → Belgeler & Riskler | **Damage / Incident / Insurance Claim** + Vehicle Policy | insurer/poliçe ref (biliniyorsa), olay tarih/yer/neden, araç ve ilgili Rental bağlamı, yetkili sürücü gerektikçe, hasar pinleri, kanıt fotoğrafları, kayıtlı rapor/polis ref, talep eki kontrol listesi, şirket yetkili imza/kaşe alanı; bilinmeyen alan `Eksik` olarak gösterilir |

- Bir arıza/hasar kaynağı olmadan `Sigorta Talebi Yapıldı`, `Araç Servise Teslim Edildi`, `Onaylandı` gibi kaynak dışı durumlar **üretilmez**; çıktı yalnız durumun belgelendirilmesidir. Aracın gerçek poliçe numarası yoksa uydurma yapılmaz. **Araç profil fotoğrafı** ile 4–5 inspection evidence fotoğrafları farklı kaynaklar olarak kalır.
- `Araç Durum Raporu` ve `Sigorta Dosya Özeti` hasar pinlerini **kanıt ekleri** olarak gösterir; bunlar kendiliğinden Damage Liability, insurer payout, Repair Completed veya Customer Charge kararı oluşturmaz.
- **Belge Merkezi** yetkiye göre çıktının sahibi olan source kaydına arama/deep-link verebilir; ikinci belge/poliçe/servis maliyeti deposu oluşturmaz.

## 84.5 A4 ön izleme, çıktı ve paylaşım: sahte gönderim yok

- `Ön İzle` açılınca tam belge ve çok sayfalı **A4 baskı yerleşimi**, antet, otomatik sayfa bölümü ve sayfa numarası görünür; kaybolan sağ kolon, üst üste binen tablo, kesilen imza/hasar şeması, fotoğrafın sayfadan taşması kabul edilmez. Baskıda kapalı menüler/butonlar görünmez; **Türkçe/Bosnaca/İngilizce gibi gerekli karakterler** web/PDF'de düzgün okunur.
- `Yazdır` gerçekten **tarayıcının print dialog'unu** açar (`Save as PDF` tarayıcı üzerinden mümkündür). `PDF İndir` adıyla ayrı düğme varsa **gerçek dosya üreten frontend-only PDF** çıktısı ve gerçek indirme sağlamalıdır; salt ön izleme gösterip `indirildi` diyemez. Teknik ortam desteklemezse `Yazdır → PDF olarak kaydet` seçeneği doğru adlandırılır; ölü buton bırakılmaz.
- `Paylaşım için Hazırla`: gerçekten üretilmiş PDF dosyasını kullanıcıya indirir veya tarayıcı paylaşma menüsü destekliyorsa **kullanıcının başlattığı** paylaşma eylemini açar; aksi halde `PDF İndir ve dışarıdan gönder` açıklaması gösterilir. **E-posta/WhatsApp/SMS gönderildi, sigorta şirketine iletildi, servis onayladı, müşteri teslim aldı** gibi durum/kanıt uydurulmaz. E-posta, upload, insurance API, native app entegre edilmez.
- `Taslak Ön İzleme` ile **Issued/Paylaşıma Hazır Belge Versiyonu** ayrı tutulur. Taslak verileri son kaynak haline göre yenilenebilir; `Issue` edildiğinde **template, logo, dil, source/version IDs, ekler, actor/time ve görünür içerik snapshot'ı** pinlenir. Sonraki edit yeni `Issue` version gerektirir; geçmiş çıktının logo, müşteri, fiyat, koşul, damage photo, not alanları sessizce değişmez.
- Kiralama **Prepared** ise gerçek teslim odometresi, fuel ve imza yokmuş gibi bırakılır veya `Teslimde tamamlanacak` yazar. Servis tamamlanmadıysa `Tamamlandı` kaşesi; sigorta başvurusu yapılmadıysa `Dosya gönderildi` bandı üretilemez.

## 84.6 Erişim, veri minimizasyonu ve tek kaynak kontrolü

- `Document Preview / Print / PDF Export / Issue / Template Manage / See Sensitive Identity / See Insurance Amount` ayrı eylem ve branch/company scope izinleriyle yürütülür. Kişi rolü izin vermiyorsa PDF, print preview, attachment list, source drill-down, global arama ve dosya adı dahil hassas bilgi **sızmaz**. Baskıda pasaport/kimlik/ehliyet numarası yalnız açık belge gereksinimi ve görme/yazdırma izni varsa gösterilir, aksi halde maskelenir.
- Document print/export/download olayı konsept audit'e kaynak ID, actor, time, template/version ve action olarak yansır; demo browser storage/snapshot fiziksel imzalı veya dış kuruma kabul edilmiş belge ispatı değildir.
- Sigorta paket ücreti `Pricing/Charge`; gerçek poliçe `Vehicle Insurance Policy`; insurer claim/olay `Damage/Incident/Claim`; servis job/masrafı `Maintenance`; depozito `Deposit`; sözleşme `Contract`; A4 çıktı bunların **görünümüdür**. Aynı miktar/olay/form bir daha bağımsız otoriteye kaydedilmez.

## 84.7 İşlevsel kabul senaryoları

1. Admin yalnız A sınıfına uygun `Koruma Plus` paketini 12 EUR/gün ve örnek muafiyetle tanımlar; A sınıfı Rental'da görünen seçenek B sınıfında görünmez. Optional seçilmediyse ücret yok; seçildiyse Rental preview, Price Snapshot ve issued Contract aynı tutarı/şart sürümünü gösterir.
2. Şube/class Deposit Policy `300 EUR zorunlu` derken Corporate Agreement `0 EUR/gerekli değil` override edebilir. Standart personel tutarı sessiz değiştiremez; Rental-specific `Deposit Exception` ancak **Applied** sonrası etki eder. Held deposit ödeme/kaparo sayılmaz.
3. Personel Rental'a ek sürücü ekler, kimlik/ehliyet gate sonucunu görür, seçili sigortanın ek sürücüyü kapsama şartı görünür, sözleşme doğru sürücü listesini alır. Sürücü/paket değişince eski issued Contract kendi halinde kalır ve yeni sürüm akışı gerekir.
4. Araçtan `Bakım Planla` → Maintenance oluştur → `A4 Servis Sevk Formu` ön izleme/print/PDF; plaka, km ve şube otomatik gelir; yapılmamış servis `Completed` gösterilmez.
5. Inspection'da 4–5 foto ve hasar pinleri → linked Damage/Incident → `A4 Sigorta Hasar Dosyası Özeti` → kaynak poliçe no (varsa), pin haritası, foto referansları, eksik evrak uyarısı; PDF indirilebilir, fakat `sigortacıya gönderildi` status'u oluşmaz.
6. Farklı rollerde kimlik/poliçe tutarları masked; yetkili PDF çıktısında ilgili içerik; yeni logo/template düzenlemesi geçmiş issued Contract/Service/Claim belgesini geriye dönük değiştirmez.

---

# 85. WEB İŞ AKIŞI OPTİMİZASYONU — KANONİK FİYAT, SÖZLEŞME, TESLİM, ARAÇ, FİNANS VE PERSONEL

**Kapsam ve otorite:** Bu bölüm kullanıcı tarafından kabul edilen **mevcut 36 menüyü maksimum faydayla kullanma** kararını somutlaştırır. Yeni sidebar/domain, yeni Approval Center tipi, yeni ödeme kaynağı, public müşteri portalı, native mobile veya backend eklemez. §4 navigasyon otoritesidir; iş verisinin otoritesi ilgili §10/13/20/30/32/59*/63–70/83–84 kaydıdır. §85 yalnız bağlayıcı **etkileşim, hesaplama belirsizliğinin giderilmesi ve test** katmanıdır. Sekmeler source read-model'i; buton source eylemine bağlanır. Demo browser state, gerçek iş/iletişim/ödeme olmuş gibi gösterilemez.

## 85.1 Sigorta fiyatı için tek kesin kural: fiyat dönüşümü YOK, açık price row VAR

- **Bir Rental tek transaction currency taşır.** Ücretli Rental Protection/Coverage Package için `packageId + version + currency + effective window + uygun company/branch/class/vehicle + pricingMode(fixed/daily)` eşleşmesiyle **o currency'de tanımlanmış aktif fiyat satırı** bulunmalıdır. Paket kartı kapsam/uygunluk gösterebilir ama tutar tanımlı değilse `Seç` kapalıdır; `Paket fiyatı bu kiralama para biriminde tanımlı değil` + yetkili `Ayarlar → Sigorta Paketleri → Fiyat Satırları` bağlantısı görünür.
- `12 EUR/gün` yalnız EUR işlemlerini fiyatlar. Örneğin BAM Rental için isteniyorsa **ayrı 23 BAM/gün gibi admin tarafından bağımsız belirlenmiş açık fiyat** gerekir; bu sayı FX'den otomatik türetilmez. Bu örnek piyasa kuru iddiası değildir. `Included / 0` yalnız explicit ücretsiz/dahil catalog state'iyle ücret `0` olarak fiyatlar; `null/eksik` **ücretsiz** sayılmaz.
- Aynı seçim ve zaman için birden fazla eşit öncelikli fiyat satırı eşleşirse fiyat rastgele seçilmez: `Policy/Price Conflict` ve iki kayıt bağlantısıyla işlem bloke edilir. Sigorta price-row eşleşme özgüllüğü **exact vehicle+branch > branch+class > branch > class > company default** olarak ilan edilir; version/effective-date aynı seviyedeki çakışmayı çözmezse form bloklanır. Bu sigorta fiyat listesi önceliğidir; §84.2'deki **Deposit Policy önceliği** ile ortak veri otoritesi oluşturmaz. Gerçek tutarın kaynağı seçilen exact row ID'dir.
- Fee, tax, term, deductible ve limits **seçili package version + exact price row ID + transaction currency + date/time** olarak `Coverage Snapshot → Pricing Snapshot` içine bir kez pinlenir. Muafiyet/deductible ayrı amount+currency olabilir; UI aynı para birimiymiş gibi toplam/otomatik conversion yapmaz. Pricing Preview, issued Contract, Charge ve Damage liability aynı snapshot'a referans verir.
- Payment FX Rate Desk yalnız **alınan tahsilatı / deposit uygulamasını / açıklanmış rapor tutarını** çevirmek içindir. `Approved pricing conversion`, generic Rules Builder veya manual per-rental kur girişi **eksik sigorta fiyat satırını bypass edemez**. Fiyat değişikliği isteniyorsa yetkili admin price row tanımlar veya transaction currency/ürün kararı yeniden açıkça seçilir.

## 85.2 Kiralama uzatma, sigorta ve depozito birlikte değerlendirilir

- `Kiralamayı Uzat` önce Availability, Vehicle/engagement window, driver/document validity, old Rental pricing+Coverage snapshot, extension pricing policy ve gerekli manager confirmation gate'lerini kontrol eder. Bu adım Rental bitiş tarihini veya mevcut Charge'ı **ön izleme sırasında** değiştirmez.
- Karşılaştırma ekranı: `Eski bitiş / Önerilen bitiş`, `Eski kira + sigorta + ekstralar + vergi`, `Yeni kira + uzayan günlerin kapsamı/bedeli + vergi`, `Net fark (Charge/Credit)`, `Kilometre/dönem sınırı`, `Yeni depozito gerekliliği veya değişmeyecekse neden`, `Sözleşme yeni sürümü/imza gerekli mi?`. Tüm ticari satırlar tek Rental currency'dedir. Günlük paket için incremental charge gün hesabı §68'deki süre politikasıyla **aynı** işlevi kullanır; sabit paket için extension'da ek ücret uygulanıp uygulanmayacağı versioned fixed-package policy'de açık olmalıdır. `Sabit = uzatmada bir kez daha ücretlendir` varsayımı yoktur.
- Kapsam eski süre için geçerli diye **uzayan süreye otomatik yayılmaz**: policy ve snapshot'a göre coverage eligibility ve tarih aralığı yeniden doğrulanır. Yeni şart veya imza gerekiyorsa **Extension Confirm öncesi izinli belge sürümleme/onay adımları tamamlanır**; yeni sözleşme gerekli değilse geçmiş signature'a yeni sürüm varmış gibi işaret konmaz. Paket artık geçerli değilse veya gerekli currency price row eksikse Extension Confirm bloke edilir; yetkili kişi açık yeni paket/yeniden fiyatlama ve Contract version+gereken imza akışına gider. Orijinal issued sözleşme/snapshot silinmez.
- Confirm anında Extension event ID için **tam bir** source-linked `Extension Difference Charge` veya gerekli Credit/Correction oluşur; bu farkın sigorta ve vergisi içinde gösterilir, **ayrı tekrar Insurance Charge** oluşturulmaz. Önceden ödenmiş tutarlar yeniden tahsil edilmiş sayılmaz. Depozitodaki değişiklik ancak canonical Deposit Policy/Approved-and-Applied Exception gate ile gerçekleşir; Held movement otomatik yeni tahsilat değildir.
- Örnek demo: `4 gün x 10 EUR/gün` paketinin `+2 gün` uzatılmasında kapsama uygunsa ek sigorta **20 EUR + ilgili vergi değişimi** tek extension delta satırında yer alır. Araç müsait değilse ya da paket bitiş aralığı geçersizse **hiçbir event/Charge yazılmaz**. Gerçek paket fiyatı her zaman exact snapshot/price row'dan alınır.

## 85.3 Görsel A4 belge/sözleşme şablon editörü ve demo numara serisi

- **Tek editör:** `Yönetim → Ayarlar → Sözleşme ve Operasyon Belge Şablonları`. Doküman tipi sekmeleri: Kiralama Sözleşmesi, Teslim/İade Araç Durum Tutanağı, Servis İş Emri, Sigorta Dosya Özeti; yeni sidebar yok. Her type mevcut §83–84 veri sahiplerine bağlıdır.
- Şablon düzeninde A4 sayfa/kenar boşluğu, logo/antet, sabit metin blokları, paragraf, tablo, imza alanı, hasar diyagramı, fotoğraf ekleri ve mevcut domain'e bağlı **izinli dinamik alan seçicisi** bulunur. Örnek etiketler: `Şirket/Şube`, `Sözleşme No`, `Kiracı`, `Birincil/Ek Sürücü`, `Plaka/Araç`, `Dönem`, `Fiyat/Vergi/Para Birimi`, `Kapsam/Muafiyet`, `Depozito`, `İmza`, `Inspection Reference`. Bilinmeyen placeholder literal basılmaz; yanlış kaynak alanları sessizce uydurulmaz.
- **Belge tipine göre** zorunlu alanlar kilitlidir: **Kiralama Sözleşmesi** için `Rental/source ID, taraflar, araç, planlanan dönem, fiyat/vergili toplam+transaction currency, sigorta/depozito koşulları, gereken imza alanları`; **Teslim/İade Tutanağı** için `Rental+Inspection source IDs, araç, gerçek inspection tarih/km/fuel/şema/kanıt referansları (o event finalized ise), gerekli imza alanları`; **Servis İş Emri** için `Maintenance source ID, araç, istenen servis/şikayet, tarih`; **Sigorta Dosya Özeti** için `Damage/Incident/Claim source ID, araç, olay ve kaynağı varsa evidence/poliçe ref`. Her belgede `şablon dili/sürümü, belge numarası/sürümü ve gerçek source reference` bulunur. **Kaynakta bulunmayan veya bu tip için geçerli olmayan para, sürücü, imza, poliçe gibi alanlar zorunlu yapılmaz.** Bu zorunlu alanlar **silinemez/devre dışı bırakılamaz**; editör düzeni değiştirilebilir ama ilgili `required field` yoksa `Issue` kapalıdır. Yetki nedeniyle veri maskeleniyorsa kişi yetkisiz gizli alanı şablona sızdıramaz; gerçek `Issue` gate de ayrıca Document Requirement/Driver Eligibility/Contract policy kontrol eder.
- Konfigürasyon: `company/branch + documentType + period + prefix/sequence padding + effective version`, `Örnek Numara` ve `Sonraki Numara` demo ön izlemesi. Belge numarası **yalnız Issue başarılı olursa** browser'daki tek demo numbering event'inden tahsis edilir; taslak/print preview numara tüketmez. Aynı aktif kapsam/seri kombinasyonunda çakışma doğrulaması vardır. İptal/void edilen issued belge numarası yeniden kullanılmaz. **Birden çok cihaz arasında üretim ölçeğinde benzersizlik garantisi yoktur**; gerçek üretimde sunucu otoritesi ayrıca gerekir.
- `Şablon Ön İzle` sahte alanları açık `ÖRNEK` etiketiyle, kayıt ön izlemesi gerçek izinli source verisiyle çalışır; `Issue` immutable template/version/logo/language/number/content/source snapshot'ı kaydeder. Eski issued sözleşme yeni logo, FX, fiyat, sürücü veya yeni hasar fotoğrafıyla geriye dönük değişmez; yeni sürüm ve gerekiyorsa yeni imza zorunludur.
- A4 browser print, Unicode/diller, sayfa bölünmesi, fotoğraf + hasar çizimi ve signature alanı §84.5'e tabidir. `PDF İndir` ancak gerçekten bir dosya üretiyorsa görünür; yerel demo `print/PDF export` gerçek hukuki imza sertifikası sayılmaz.

## 85.4 Kiralama 360° — tek teslim masası, blokajdan çözüme

- `Operasyon → Kiralamalar → Rental Detail` üst sabit bölümü: `Rental No / Customer / specific Vehicle / Branch / planned pickup-return / operational state / ayrı finance state`. Hemen altında üç küçük operasyon kartı: **Evrak & Sürücüler**, **Araç & Teslime Hazırlık**, **Fiyat, Sigorta & Depozito**; her biri `Hazır / Kontrol Gerekli / Bloke` ve **somut neden + bir sonraki eylem** gösterir. Eksik bilgiye tıklama doğru `Rental File/Customer Document/Vehicle Checklist/Contract/Deposit` source formuna gider ve geri dönüşte aynı Rental ID/sekme korunur.
- `Teslim Masası` sıra/sunum: (1) birincil+ek sürücü ve belge/ehliyet, (2) specific Vehicle Availability/Readiness, (3) seçilmiş coverage/terms ve effective deposit policy, (4) confirmed pricing/tax + varsa reservation caparo kaynağı, (5) logo-branded issued Contract + gereken imza/staff approval, (6) teslim 4–5 foto + pinler + km + fuel + key/equipment, (7) **Teslimi Tamamla**. Bu bir **guidance/checklist**; yeni domain state değildir. Ödeme/depozito `Gerekli`/`Bloke` gate'leri yalnız ilgili versioned policy'nin gerçekten mecbur tuttuğu ölçüde kullanılır: `Deposito mutlaka Held` gibi evrensel uydurma kural yoktur.
- `Teslimi Tamamla` işlem öncesi **tüm gate'leri yeniden değerlendirir**; izin yoksa veya sonradan allocation/vehicle status değişmişse başarı göstermez. Başarılı finalize: tek `Delivered` event, correct location/key/equipment/inspection source linkleri, **tek Base Charge Posted** (ve ayrık Advance allocation). Çift tıklama aynı olaydan ikinci teslim/Base Charge üretmez. Contract `Issue`, imza, hazırlık checklist'i ve para kaydı **kendiliğinden teslim değildir**.
- Personel `Return Masası`nda önce/sonra hasar pini/fotoğraf, km/fuel, equipment, late fee/coverage ve varsa Damage/Fine links görür; normal Return foto gate ile, `Loss Closed/Exception Closed` ayrı evidence policy ile ilerler. İade normal tamamlanınca bile `Financially Closed` ve `Vehicle Ready` otomatik olmaz.
- Görsel düzen önerisi: ilk ekranda karar kartları ve bir sonraki CTA; derin belge, ödeme ve audit kayıtları collapsible/sekme/drawer. Her şeyi üst üste yığma; ekran okuyucu, klavye ve 1024/768 web görünümünde kanıt/form alanları kaybolmaz.

## 85.5 Araç 360° — sonraki teslimin gerçekten hazır olup olmadığını göstermek

- `Operasyon → Araçlar → Araç 360° → Genel Bakış / Müsaitlik & Planlama`: `Şimdi` ve `seçili gelecek tarih aralığı` **ayrı** gösterilir; `Available now` gelecekteki rezervasyonun müsait olduğu anlamına gelmez. Bugünün sonraki iadesi, ardından planlanan teslim, cleaning/maintenance/transfer blokları ve hazır olup olmadığı source time window ile görünür.
- `Yaklaşan araç dönüşü/teslim` karşılaştırma bandı: planlanan/gerçek return, sonraki confirmed pickup, aradaki hazırlık süresi, gerekiyorsa cleaning/checklist/doküman/hasar gate ve ilgili görev veya bakım kaydı. Hazırlık süre politikası tanımlı değilse `hazırlık için yeterli süre` gibi uydurma yeşil sinyal verilmez; `Süre politikası tanımsız` gösterilir. Bir iş source state olarak Pending iken sırf takvim aralığı boş diye `Ready` oluşturulmaz.
- `Aksiyon`: `Hazırlığı Gör`, `Temizlik Kaydı Aç`, `Bakım Planla`, `Görev Ata`, `Transferi Gör`, `Rezervasyona Git` mevcut izinli domain formlarına prefilled `vehicleId`/branch/time ile açılır. Aksiyon sonucu yalnız kaynak lifecycle'ının gerçekten değişmesi halinde kart güncellenir; sahte otomatik rezervasyon yeniden ataması veya maintenance tamamlanması yoktur.
- Araç için kayıtlı hasar/downtime ve source cost gösterilebilir; currency-mixed net profit uydurulmaz. External Vehicle'da valid engagement window, operating branch, supplier Received/Ready kapısı aynı projeksiyonda kalır.

## 85.6 Finans Merkezi — görsel çoklu tahsilat masası ve kalan borç

- `Finans → Tahsilatlar` ve `Rental → Finans` **aynı payment/Charge/Advance/Deposit source state** için ortak bileşen kullanır: üstte `Transaction Currency`, `Posted Charges`, `Applied Payments`, `Outstanding`, ayrı `Unapplied Advance`, ayrı `Deposit Held/Applied/Released`, `Planlanan Taksit` ve `Refund/Credit`; **Planlanan**, **Recorded** ve **Applied** tutarlar aynı toplama karıştırılmaz.
- `Yeni Ödeme Ekle`: (1) payer (borcun hukuki tarafı değil, ödeyen), (2) method, (3) tender amount + global ISO currency, (4) branch/register uygunluğu, (5) transaction currency equivalent + pinned exchange rate/rounding, (6) exact Charge/receivable allocation preview, (7) `Kaydet/Recorded` ve izinli `Uygula/Applied`. Kur yoksa form yalnız **unsaved** `Awaiting Rate` validasyonunda kalır; sahte tahsilat kaydı veya bakiye azalması olmaz. Payment tender kur edit'i yalnız `Yönetim → Ayarlar → Döviz Kurları` üzerinden; rakam kullanıcıya ayrıntılı açıklanır.
- `Kalanını Öde` **o anda Applied toplamına göre** yeni payment taslağı üretir; diğer ödeyenin Draft/Planned/Recorded-but-unapplied tutarını Paid saymaz. Aynı ödeme/charge'a ikinci allocation veya şube kasasına duplicate cash-in yoktur. Nakit source-native-currency kasasına bir kez girer; kart/banka kasaya yazılmaz.
- Arayüz `Kim ne kadar ödedi?` / `Kim sözleşmeden sorumlu?` ayrımını yan yana görünür tutar. Birden çok payer, yasal kiracı/Corporate receivable'ı otomatik bölmez. Overpayment policy'ye göre engellenir veya açık Unapplied Credit/Refund Candidate olur; negatif borç diye gizlenmez. Banka/gateway tahsilatı yalnız dış dünyada gerçekten gerçekleşmişse personelin girdiği **manuel demo kayıt** olarak gösterilir.
- Historik payment satırının original amount+currency, applied equivalent, rate direction/version, payer, method, staff, branch, event time, reference ve status'u immutable görünür; sonradan FX ayarı değişse bile geçmiş equivalent tutar değişmez.

## 85.7 Patron kontrol merkezi — yetki ve personel iş yükü

- `Yönetim → Kullanıcılar → Kullanıcı Detay` ile `Yönetim → Roller ve Yetkiler`, permission tablosunu **tek effectivePermission evaluator** ile paylaşır. Yönetici kişi bazında `Menü Gör / Liste Gör / Detay Gör / Oluştur / Düzenle / Onayla / Tahsilat Gör–Kaydet / Baskı–PDF / Hassas Belge Gör / Şube Kapsamı` gibi var olan domain eylemlerini role defaults + yetkili user override üzerinden düzenler. İşlem ekranında `Bu personel ne görecek?` **permission preview** vardır; gizli alanı unauthorized kullanıcıya yazdırma/export/deep-link ile kaçırma yolu yoktur.
- Personel profilinde `Aktif Görevler / Üstlenilen / Geciken / Takip Ettikleri / Son İşlem Geçmişi` gerçek Task/Activity source'undan türetilir; basit bir yönetici pano filtresidir, ayrı personel performans skoru veya ikinci görev veritabanı değildir. Görevi bir kişiye, birkaç izinli kişiye veya izinli şubedeki ekibe duyurma §83.6 ile aynı `taskId/one owner` modelini kullanır.
- Yetki değişimi demo role switch sonrası **sidebar + üst bar + liste/sayaç + kaynak detay + arama + print/PDF/export + dosya indir + eylem izinleri** birlikte güncellenir. Başkasına görev duyurmak kullanıcıya verilmemiş hassas finans/belge verisini bildirimde veya görev açıklamasında göstermez. Bu gerçek production multi-tenant security implementation değildir.

## 85.8 Görevler ve Komuta Merkezi — yoğun şubede tek kayıt, net sorumlu

- `Görevler` sekmeleri `Bana Atananlar / Açık Havuz / Takım–Şube / Geciken / Tamamlanan` ve `Komuta Merkezi → Acil İşler` aynı Task kaynaklarını gösterir; yeni kopya Task veya Notification truth'u yaratılmaz. Her satırda `Öncelik: Acil/Yüksek/Normal`, due, source link, şube/ekip scope, **tek owner** veya `Üstlenmeye Açık`, ilerleme ve `Son etkinlik` görünür.
- `Bir Kişiye Ata`, `Seçilen Birkaç Kişiye Duyur`, `İzinli Ekibin Tamamına Duyur` ayrımı: **bir kişi sorumluysa** doğrudan owner atanır; **çok alıcıysa** tek açık Task ID bekler ve ilk yetkili `Üstlen` sahibi olur; diğerleri watcher/recipient'tir. Owner devretme, görev bırakma, reopen, completed, cancel işlemleri reason/actor/time audit ile bir kayıt üzerinde yürür. İkinci kullanıcının aynı anda üstlenmesi conflict mesajı ile reddedilir.
- `Acil` etiketi yalnız priority'dir; gerçek SMS/push/e-posta gitmiş gibi gösterilmez. Demo Notification Center/Alert Center aynı task ID'ye deep-link verir. Task Completed, linked Rental/Vehicle/Maintenance/Damage/Finance source'u otomatik tamamlamaz.

## 85.9 Birleşik iş günü demonstrasyonu ve kabul sırası

1. **Politika:** Admin EUR ve BAM Rental kabulünü etkinleştirir; `Coverage A` için yalnız `12 EUR/gün` tanımlıdır. EUR Rental preview doğru ücretle açılır; BAM Rental'da seçili ücretli paket fiyatı eksik uyarısı verir. Admin explicit BAM price row tanımlayana kadar `Tahsilat döviz kuru` bypass edemez. Geçerli satırdan doğru currency snapshot'ı üretilir.
2. **Uzatma:** `4 gün x 10 EUR/gün coverage` seçili Delivered Rental için +2 gün extension preview insurance `20 EUR + vergi değişimi` gösterir; Availability ve coverage eligibility uygunsa tek delta event'i oluşur. Uygunluk veya fiyat satırı yoksa hiçbir status/charge değişmez. Issued sözleşme yeni snapshot'ı sessizce almaz; gerekiyorsa version/imza oluşur.
3. **Belge:** Yetkili admin A4 şablonda logoyu ve zorunlu alan bloğunun sırasını değiştirir; zorunlu alanı silmeye çalışınca engellenir. Preview sequence no tüketmez; `Issue` tek demo numara verir; eski issued belge eski logo/version/no'yu korur. Unauthorized çalışanın baskı/çıktı yetkisi yoktur.
4. **Teslim masası:** Rental Prepared → sigorta/depozito nedeni, belge/sürücü, Vehicle Ready, Contract issue+signature, 4–5 inspection foto, pins+key → `Teslimi Tamamla` → yalnız 1 Delivered + 1 Base Charge. Readiness son anda düşerse blocker linki gösterir ve hiçbir Delivery/Charge yazmaz.
5. **Araç hazırlık:** Bugün iade edilmesi **beklenen ama hâlâ müşteride** olan araçta `Rented now`, yarın sabah confirmed pickup için `Reserved in selected future window` ve pending cleaning ayrı görünür; araç gerçekten iade edilip uygunluk kontrolünü geçmeden `Available now` gösterilmez. `Temizlik Kaydı` açmak aracı otomatik Ready yapmaz; checklist gerçekten tamamlanınca proje güncellenir. External sourcing window yanlışlıkla internal home branch sayılmaz.
6. **Tahsilat:** 500 EUR Rental, **üç kişinin toplam dört payment line'ı** (A iki satır, B bir, C bir) ve farklı tender currencies; eksik USD kuru → Draft-only; kur tanımı sonrası Applied 80 EUR ve Outstanding yeniden hesapla → kalan 220 EUR; kart kasaya gitmez, EUR/USD nakit source drawer'a ayrı girer. Hukuki kiracı değişmez.
7. **Personel/görev:** Patron role preview ile yalnız uygun çalışanların finans/kontrat sekmelerine eriştiğini doğrular; `Acil` görevi 4 personele duyurur, **tek** kişi üstlenir, diğerleri takipçi kalır. Görev tamamlanması bakım veya Rental status'unu değiştirmez.

---

# PART II — GOOGLE AI STUDIO WEB KONSEPT ÜRETİM TALİMATI

## II.1 AI Studio'ya hedef

**Build ACARVO Global as a complete, responsive, premium B2B RENT-A-CAR WEB ADMIN UI CONCEPT.** No backend, no PostgreSQL, no NestJS, no REST API, no auth provider, no cloud storage, no native Android/iOS app, no background worker, no payment gateway, no SMTP/SMS, no real fiscal invoice, no deployed SaaS subscription billing.

- React + TypeScript + browser UI (Vite/Next.js client-only as tool environment permits).
- Koyu/slate-nötr + güçlü blue, sınırlı red accent; no gradients, neon, glass, giant corners or toyish dashboards.
- Enterprise information density. Liste/detail/create workspace, responsive forms, financial ledgers, explicit empty/error/validation states, keyboard focus.
- Yalnızca gerçekten çalışan web action'ları; ``disabled/no-op`` butonlar veya ``coming soon`` kutuları V1 kapsamına gizlice yerleştirilmez.
- Her ekran paylaşılan domain state'te işlem yapar; pricing, FX, tax, cash, liability, availability, balance, commission rules **aynı pure function/service** kullanır.
- Demo state locally persisted with visible DEMO banner/Reset Demo. Never imply server persistence, live data, card charges, sent messages, official tax compliance or bank reconciliation.
- Deadline/expiry/overdue reminders are derived on page load and on an optional **demo time simulator**; no background job exists and no push/email was truly delivered.
- **Existing source specification'deki tüm Web menüleri/ekranları korunur**; bu belgedeki güncel global business concepts ile genişletilir. Native mobile / backend bölümleri kapsam dışıdır.

## II.2 Tek ekran / modül source-of-truth matrisi

| Domain / İş gerçeği | Konsept state sahibi | Okuyan ekranlar |
|---|---|---|
| Global currency codes/minor units | ISO currency catalog | Settings, pricing, finance, report |
| Şirket/şube accepted currencies | Currency Configuration | Payment picker, register, settings |
| Manual FX rates | FX Rate Desk + per-payment immutable rate snapshot | Payments, refunds, finance reports |
| Rental monetary obligation | Frozen Pricing + Charge tax snapshots | Rental, Corporate exposure, finance |
| Incoming payment / split payer | Payment lines + Allocation events | Rental, Corporate, Cash, Reports |
| Reservation advance | Advance lifecycle + allocation events | Reservation, Rental, Finance |
| Deposit | Deposit lifecycle | Rental, Finance |
| Kasa fiziksel nakit | Cash Drawer native-currency movements | Finance, Shift, Cash Reports |
| Insurance terms | Coverage Package snapshot | Rental, Contract, Damage |
| Driver eligibility and additional drivers | Typed Driver Policy + Rental authorized drivers snapshot | Reservation conversion, Rental, Contract, Delivery |
| Tax | Tax Rule snapshot + tax lines | Pricing, Charges, refund preview |
| Vehicle availability | Reservation, Rental, Engagement, blockers, location projection | Fleet, Reservation, Capacity |
| Sourcing | Sourcing Request procurement + Engagement lifecycle | Suppliers, Rental, Availability |
| Document requirement | Typed policy + Rental applied requirement snapshot | Customer, Rental, Contract |
| Contract issued and signature | Rental-linked versioned Contract snapshot; authorized web signature evidence | Rental, Contracts, Print |
| Inspection body map pins | Per-Inspection immutable condition annotations and linked photo IDs | Delivery, Return, Vehicle 360, Print |
| User permission | Role grants + scoped user overrides + effective-permission evaluator | Sidebar, screens, search, export, print, tasks |
| Task assignment/claim | Single Task record with owner, recipients, watchers and event history | Tasks, Command Center, Notifications |
| Corporate credit | Per-currency credit limits + exposure projection | Corporate, Reservation/Rental |
| Shift & cash session | Shift records + Cash Drawer session events | Command Center, Staff, Finance |
| Risks/alerts | Single source event + projections | Home, Command Center, Reports |
| User/tenant/subscription demo | Platform/Company context | Platform Console, Admin, Partner Portal |

**Never duplicate editable truth.** Entity/source links use local IDs for cross-navigation. Source revisions tracked in demo state so historical snapshots are not accidentally rewritten.

## II.3 Demo event conventions

Every meaningful state mutation can record a demo event: eventId, sourceType/id, eventType, createdAt, actor, branch, money currency if any, before/after where relevant. ``ChargePosted`` idempotency key is ``rentalId + sourceEventId + chargeType``. Payment allocation, deposit application, advance transfer and staff cash movements similarly have unique source references. A UI button cannot post same event twice because of rapid clicks.

## II.4 Ekran bilgi mimarisi (web) — §4'e bağlı, yeni sidebar üretmez

**Tek sidebar otoritesi §4'tür: 7 kategori / 36 bağlantı; her bağlantının çalışma/sekme standardı §13 ve §82 ile belirlenir.** Buradaki uzun capability listeleri **yeni menü veya duplicate editable domain** değildir. Tam-kapsam kullanıcı için gerçek menü kimlikleri:

- **Genel (3):** Ana Ekran (permission-based Owner görünümü dahil); Komuta Merkezi (Today/Alert Center/Vardiya Devri); Filo Asistanı. Global Search ve Notification Center header araçlarıdır.
- **Operasyon (9):** Rezervasyonlar (Waitlist/kaparo), Kiralamalar (teslim/iade, sigorta, exceptional closure, kontrat bağlantıları), Takvim, Görevler, **Araçlar (§13 Araç 360°: liste + kapsamlı oluştur/düzenle + 8 sekmeli detay + gerçek contextual actions, tek sidebar)**, Bakım & Servis (cleaning/tires), Olay Merkezi, **Hasar Kayıtları**, **Ceza Modülü**. Hasar/Ceza ayrı Kayıtlar menüsü değildir; insurance claim ve finance links burada contextual kalır.
- **Müşteri & Ticari (6):** Müşteriler, Kurumsal Hesaplar, Talep Merkezi (Leads/Quotes), Partnerler, Araç Tedarikçileri (Sourcing/Engagement), Fiyatlandırma. Partner web portal ayrı context'tir.
- **Kontrol & Analiz (8):** Onay Merkezi, Kurallar, Gelir Kontrolü, **Riskler ve İstisnalar** (Operasyon Riskleri + İstisna İnceleme sekmeleri), Kapasite Planlama, Filo Analizi, Fırsatlar, Raporlar.
- **Finans (3):** Finans (split payments, advances, payment plans, deposits/refunds, tax, supplier/partner settlement contextual tabs), Masraflar, **Şube Kasaları** (tek kasa işlemleri ekranı; Finance Overview yalnız buraya link/özet verir).
- **Kayıtlar (3):** Sözleşmeler, Belge Merkezi, İşlem Geçmişi.
- **Yönetim (4):** Şubeler, Kullanıcılar, Roller ve Yetkiler, **Ayarlar** (para birimleri, **tek Exchange Rate Desk editörü**, taxes, insurance, price/time, documents, driver, cash policy, privacy).

**Kullanıcı menüsü:** yalnız Profil/Oturum, Çıkış (**2**, sidebar sayımı dışı). **Platform Console** sadece Platform Super Admin'e görünen ayrı üst bağlam değiştiricidedir; normal company sidebar'a eklenmez. Her finance/risk/operasyon içerik linki aynı canonical ekrana yönlenir. Web Partner Portal dış context'tir; Customer Portal ve customer mobile app yoktur.

## II.5 Öncelikli konsept yapım aşamaları — sadece WEB UI

**Stage 0 — UX Shell & shared demo truth.** Global currencies/locale/demo data switcher, company/branch/permission demo context, **§4'teki 7 kategori / 36 bağlantının canonical navigation ve responsive sidebar temeli** (risk tabs, cash route, settings route, separate Platform Console context switcher), responsive component system, shared money/date calculators. **Stage 0 ortak temelleri:** source-scoped permission evaluator, task-owner/recipient event modeli, immutable contract/inspection evidence IDs ve reusable demo event primitives for Incoming Payment recording/application, Reservation Advance (Unapplied/Transferred/Applied), Charge Posted, currency/rate snapshots and idempotent allocation. These are shared browser-side concepts, **not backend, API, payment integration or finished finance screens**. Stages 3–5 reuse them rather than inventing separate finance state.

**Stage 1 — Admin financial policy & complete formal approvals before transactional forms.** FX Rate Desk, tax rules, driver eligibility, **insurance explicit per-transaction-currency price rows (no pricing FX)**/deposit, rental duration/tiering and typed policy Settings editors (§85.1–85.2). **The complete Approval Center for all six formal types** (Requested/Approved/Rejected/Applied, four-eyes, permission-gated demo transitions and linked source application) is implemented **here**, before Reservation/Rental/Finance workflows consume it. Hard business policies live in their typed Settings/Agreement owners; they are not postponed to the Rule Builder.

**Stage 2 — CRM, Vehicles, Partner/Supplier master & Documents.** All web list/detail/create, vehicle photo, documents/expiry, corporate per-currency limits, service reminders preview, sourcing engagement catalog.

**Stage 3 — Quotes & Reservations.** Live preview calculator, capacity, Pending/Confirmed, no-show, cancellation, waitlist, insurance selection, customer/driver validation, future external selection. **Kaparo/Reservation Prepayment is already usable here**, with payer/method/tender currency/manual FX, `Recorded` vs `Applied` semantics, receipt note and Unapplied Advance; it uses Stage 0 payment/advance primitives and does **not** wait for Stage 5's full Finance Center UI. Applicable formal approvals are Stage 1 workflows.

**Stage 4 — Rentals, Contracts & Operations.** Direct Rental, conversion, **primary/additional driver checks, per-rental eligible insurance package choice, explicit deposit requirement, instant logo-branded Rental contract preview/print with template field+number gate, in-person web signature, condition-map pins and shared `Teslim Masası` blockers/actions (§85.3–85.4)**, document/driver gate, web handover/return inspections, coverage snapshot, base Charge at Delivered, extension/swap/return delta, normal and exceptional terminal lifecycle. Reservation advance transfer/Charge application and Charge Posted reuse Stage 0 shared primitives; relevant formal approvals remain Stage 1.

**Stage 5 — OPERABLE WEB CORE MILESTONE.** Complete Financial UI for multi-currency split payments (many payers/methods), **§4 Finans → Şube Kasaları** cash drawers/shift sessions, **one shared visual split-payment collection desk** (§85.6; Finance Overview only contextual read/view), deposit/refund, tax charge view and finance close/reopen **on the existing Stage 0 shared payment/charge/advance model**; reservation caparo already works from Stage 3. **Milestone is a review marker; no V1 capability is removed.**

**Stage 6 — Fleet, External/Supplier & Controls integrations.** Damage/maintenance/fines/insurance, **linked source-backed A4 Service/Insurance/Vehicle Condition document preview-print-PDF workflows plus Vehicle 360 next-turnaround readiness and Task/Staff Workload projections** (§85.5, §85.7–85.8), supplier receive/return, supplier outgoing payments, **existing Stage 1 Approval Center linked to these new source actions** (not rebuilt here), **Rule Builder only for safe notification/risk previews** (not hard finance/deposit/policy overrides), Alert Center/notification state and operational cost projections.

**Stage 7 — Analytics, Import/Export preview, Platform Console & Partner web portal.** Reports and source-backed projections, owner comparison, tenant/setup/plan UI simulation (**only Platform Super Admin top-level context switcher, not company sidebar**), global search, CSV preview and honest export behavior.

**Stage 8 — UX hardening & acceptance.** A4 print page-break/branding/Unicode PDF/role masking, empty-photo/source fields and honest share behavior tested; **§85.9 seven workflow scripts, no pricing FX cross-use, extension coverage+deposit, signature/sequence and one-Delivery/one-Charge idempotency tested**; all visible controls action-tested, mobile **web responsive** (not native app), keyboard and accessibility, cash/FX/tax rounding, empty/error/conflict/role paths, demo reset, screenshot review. Never present this as a production-ready secure payment system.

## II.6 UX interaction acceptance for each surface

Each web module must ship these together, following §82 workspace contracts and Part III §I.1/§I.2: navigation, helpful empty state, create/update/archive when applicable, validation, draft/cancel, success feedback, persistent **local demo** state, undo/correction where business rules require, branch/role demo filtering, clear primary action, source links, sort/filter, readable money/currency and no inert buttons. Do not render backend/API placeholders, raw 500 errors or accidental authentication claims.

## II.7 Tek iş kuralı, tek yazılım hesaplayıcısı

The following UI functions are domain-level single points of interpretation: `priceQuote`, `calculateRentalDuration`, `resolveTaxLines`, `resolveRateSnapshot`, `convertTenderToObligation`, `applyPaymentAllocation`, `calculateOutstanding`, `evaluateDepositPolicy`, `evaluateDriverEligibility`, `resolveCoverageLiability`, `classCapacity`, `computeCashExpected`, `projectCorporateExposure`, `projectCommission`, `projectSupplierPayable`. No component duplicates formulas.

## II.8 Uyarı, legal ve integrations honesty

Visible banner (in demo header or preferences): **“Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.”** User may switch internal demo role and branch, but must never mistake demo financial movements for live operations. Legal and compliance review remains release track; country-specific tax and business FX rules require professional validation.

---

# PART III — ACARVO GLOBAL WEB UI CONCEPT ACCEPTANCE CHECKLIST

Her [ ] maddesi farklı UI senaryosuyla gerçek gözlem yapılmadan PASS sayılmaz. “Build successful” tek başına kabul değildir.

## A. Kapsam ve konsept dürüstlüğü
- [ ] Tam ürün yalnız web UI; hiçbir native app, App Store/Play Store, backend, database, API/migration veya real payment gateway geliştirmesi yapılmadı.
- [ ] Demo etiketi, Reset Demo ve local persistence açıklaması var.
- [ ] Boş buton/ölü menü sahte başarı animasyonu yok.
- [ ] Partner Portal web UX var; müşteri portalı/public booking/customer mobile app yok.
- [ ] Ana kaynak web capability inventory korunmuş; çıkartılanlar yalnız teknik/backend/native-mobile teslimatlardır.
- [ ] Browser 1440/1024/768, partner web 390 duyarlı.

## B. Global currency / şirket/şube ayarları
- [ ] ISO 4217 güncel currency katalog tamamını arar; EUR/BAM/USD hardcoded tek seçenek değildir.
- [ ] Ad/kod/sembol/hassasiyet ve ISO code gösterilir; JPY 0, 3-decimal currencies doğru biçimlenir.
- [ ] Company base currency ile accepted tender currencies ayrıdır.
- [ ] Branch-specific cash/card/transfer currency kabulü desteklenir.
- [ ] Disabled tender currency yeni payment için seçilemez, historical kaydı okunabilir.
- [ ] Contract price currency değişmeden farklı tender currencies alınır.
- [ ] Raporlar dövizleri conversion açıkça seçilmedikçe toplamaz.

## C. Admin business FX Rate Desk
- [ ] Admin ``1 EUR = 2.00 BAM`` benzeri işletme kuru tanımlar, kaydeder, tarih/şube/amaca göre scope eder.
- [ ] Rate inverse otomatik ancak explicit policy varsa; aksi yönde ayrı rate gerekir.
- [ ] Branch override → company default önceliği deterministic.
- [ ] Eksik/çakışan rate payment Apply'i engeller, açıklayıcı error gösterir.
- [ ] 200 BAM payment @2 BAM/EUR = 100 EUR applied; original cash nominal 200 BAM kalır.
- [ ] Eski payment pinned kuruyla kalır, Settings'te kur değişikliği tarihe etki etmez.
- [ ] Payment-level override gerekçe/actor/version ile kaydedilir.
- [ ] Rate 0/negative/invalid kabul edilmez; farklı minor units ve rounding test edilir.
- [ ] Resmi/live kur iddiası yok; ``işletmenin belirlediği kur`` label var.

## D. Split tender / 3–4 kişi / çoklu yöntem
- [ ] Tek Rental'a en az 10 farklı ödeme satırı eklenebilir.
- [ ] Üç ayrı payer ve dört yöntem (cash/card/transfer/other) kombinasyonu işliyor.
- [ ] Aynı kişi hem EUR nakit hem BAM kart ödeyebiliyor.
- [ ] Her payment line payer/method/currency/rate/equivalent/branch/staff/time/ref taşır.
- [ ] Payer ile legal renter/driver farklı alanlar; multi-payer sözleşme borcunu hukuken bölmüyor.
- [ ] Planned installment Collections'ta görünmüyor; actual payment uygulanınca görünür.
- [ ] Payment allocation idempotent; çift Apply outstanding'ı ikinci kez azaltmıyor.
- [ ] 500 EUR demo: A 100 EUR + A 200 BAM @2 = 200 EUR applied, kalan 300 EUR; B 100 USD rate yokken **unapplied**, bakiye hâlâ 300 EUR; admin 1 EUR=1.25 USD girip B'yi uygular → kalan 220 EUR; C 220 EUR transfer → kalan 0 EUR. Üç ödeyen/dört gerçek ödeme satırı.
- [ ] Overpay unapplied credit veya açık blok ile ele alınıyor; negatif Outstanding gizlenmiyor.
- [ ] Refund/reversal payment event'ini sessizce silmiyor.
- [ ] Supplier outgoing, partner outgoing, insurer recovery customer collections içine karışmıyor.

## E. Kaparo / Deposit / Finance close
- [ ] Reservation Rental'dan önce farklı yöntem/currency ile prepayment kaydeder.
- [ ] Stage 3 Reservation kaparosu Stage 0 shared payment/advance state ile gerçekten işliyor; Stage 5 Finance ekranını beklemiyor.
- [ ] Stage 1 altı formal Approval Center type'ı ve four-eyes/Applied workflow'u içeriyor; Stage 6 ikinci Approval Center yaratmıyor.
- [ ] Reservation conversion advance'ı Rental Unapplied Advance'a tek kez transfer eder; Base Charge Delivered ile posted olunca Applied edilir; kur snapshot korunur.
- [ ] Cancel/no-show prepayment fee/refund/credit durumunu açık gösterir.
- [ ] Security Deposit ile kaparo ve Customer Payment aynı şey değildir.
- [ ] Deposit precedence Global → Corporate → Applied Deposit Exception (yalnız Approved değil) doğru.
- [ ] Deposit Held outstanding'ı azaltmaz; Applied azaltır.
- [ ] Base Rental Charge yalnız Delivered anında bir kez Posted olur.
- [ ] Extension charge only confirmed event; return mileage/fuel/late charges only finalized source event.
- [ ] Quote ve Prepared Rental commercial preview = Posted Charge değil.
- [ ] Open → Financially Closed direct path mümkün, Partially Settled zorunlu değil.
- [ ] Post-close Fine/Damage için Reopened audit state, ardından reconcile + close.
- [ ] Corporate Receivable transfer aynı debt'ı iki yerde çoğaltmıyor.

## F. Vergi, gün hesabı ve price tiers
- [ ] Net, tax, gross; tax inclusive/exclusive; tax code/version/exemption visible.
- [ ] %20 demo tax example: net 100 → 20 tax → gross 120; inclusive 120 → net 100, tax 20.
- [ ] Farklı Charge türlerinin tax treatment'i ayrı ayarlanır.
- [ ] Charge tax currency Rental transaction currency; tender FX ayrı hesaplanır.
- [ ] 24h block/grace/minimum policy Settings'ten değişince yeni quote preview değişir, historical snapshot değişmez.
- [ ] Daily/weekly/monthly tiers ordinary/corporate pricing precedence test edilir.
- [ ] Cross-timezone pickup/return and daylight-saving boundary gösterimi tutarlı.
- [ ] Late return / extra mileage / fuel fraction one-time charges; no litre calculation without tank facts.
- [ ] Fatura/fiskalizasyon için compliance-ready **UI preview**, gerçek uyumluluk iddiası yok.

## G. Insurance / driver / exceptions
- [ ] Rental sigorta planı seçimi ile deductible/coverage/exclusion snapshot alır.
- [ ] Damage analysis package coverage + deductible + exclusion gösterir; customer charge double posted olmaz.
- [ ] Deposit, deductible, insurer recovery ve customer charge farklıdır.
- [ ] Driver min-age, license-held years, license expiry during Rental kontrol edilir.
- [ ] Corporate document exemption sürücü legal eligibility'yi otomatik kaldırmaz.
- [ ] Theft/total loss/impound/abandoned workflows normal Return 4–5 photo gate'ini gerekçeyle aşabilir.
- [ ] Exceptional closure Vehicle Available/Ready yapmaz, finance'i sessizce kapatmaz.
- [ ] Ana Rental lifecycle `Delivered → Loss Closed / Exception Closed` terminal yollarını listeliyor; normal `Returned/Closed` inspection gate'i bu yollara uygulanmıyor, §71 alternative evidence workflow'u uygulanıyor.
- [ ] Recovery event exceptional closure history'yi silmez.

## H. Cash drawers, shift, multi-currency
- [ ] Branch EUR cash register ve BAM cash register aynı anda vardır.
- [ ] EUR cash payment yalnız EUR drawer cash-in yapar; BAM card payment nakit kasayı etkilemez.
- [ ] Opening float, counts, expected, actual ve variance açıklamalı.
- [ ] Internal cash transfer iki kasa hareketi yapar, revenue/collection yaratmaz.
- [ ] Cash refund & expense cash-out native currencies'de ayrı source move üretir.
- [ ] Shift roster entity'den ``kim vardiyada`` projekte edilir; payroll gerekmez.
- [ ] Shift Handover pending tasks, vehicles, cash session summary gösterir.
- [ ] Cash close/reopen yetki+reason+audit gerektirir.

## I. Global SaaS/Privacy/Auth screens
- [ ] Platform Super Admin Company Admin'den ayrıdır; Platform Console yalnız Platform Super Admin üst-context switcher'ında açılır, company sidebar/user menu içine girmez.
- [ ] Tenant onboarding, country/timezone/default currency/language, subscription mock screens vardır.
- [ ] Partner web invite/reset UI gerçek email gönderilmiş gibi söylemez.
- [ ] Staff login/password reset demo flow gerçek auth security iddia etmez.
- [ ] Privacy notice/version, lawful basis, optional consent/withdrawal concept records görünür.
- [ ] Document access/masking, data request & retention UI legally compliant ilan edilmez.
- [ ] Contract/document language seçimi rental customer language'den ayrı.
- [ ] Browser Print/PDF preview UI işlevsel, gerçek fiskal belge olduğunu iddia etmez.

## I.1. Araçlar — 360° WEB ekranı kullanım ve etkileşim kabulü

Bu acceptance **yeni özellik veya sidebar** açmaz. §13.1–13.5 mevcut araç ve bağlı domain kabiliyetlerinin ekranda gerçekten kullanılmasını zorunlu tutar.

- [ ] Operasyon → Araçlar tek canonical sidebar rotasıdır; araç liste, create/edit ve 8 sekme yeni sidebar bağlantıları yaratmaz; 7 kategori/36 link invariant değişmez.
- [ ] Vehicle List profil fotoğrafı/placeholder, plate/class, source type, branch, physical location, current km, as-of Availability, Readiness, current/next booking ve meaningful blockers gösterir.
- [ ] Internal Home Branch ve External seçili Engagement Operating Branch doğru branch context'inde; **fiziksel lokasyon farklı domain**; kaynak tipi yanlışlıkla owned metrics'e karışmaz.
- [ ] Anlık `as-of` listesiyle gelecek aralık availability ayrı etiketlenir; bugün Available aracı gelecek hafta Reserved diye bugün Reserved göstermiyor; `Pending` hard allocation değildir.
- [ ] Araç Listesi source/date-range/branch/readiness/damage/doc/km aramaları, sort, filtre reset, empty, permission switch ve detay→geri dönüş context'i çalışır.
- [ ] Araç create/edit kimlik/class/source/acquisition/location/profile photo/document/context/odometer bağlarını kapsamlı sunar; formu save/cancel/validation/unsaved/conflict demo durumlarında gerçek çalışır.
- [ ] Vehicle profil fotoğrafı en çok 1 aktiftir; 4–5 inspection kanıt fotoğrafı bu profili overwrite etmez.
- [ ] Araç 360° üst şerit aktifte kime teslimli, return planı, sonraki confirmed reservation, konum, KM, key custody, blocker ve belge/servis due'yu somut source refs ile gösterir; bilinmeyen değer uydurmaz.
- [ ] Detail **8 sekmenin tümü** çalışır: Genel Bakış; Müsaitlik & Planlama; Kiralama Geçmişi; Araç Durumu & Kontroller; Bakım & Lastikler; Belgeler & Riskler; Finans & Performans; Konum & Geçmiş.
- [ ] 7/30/90 gün müsaitlik görünümü: Reservation/Rental/Maintenance/Transfer/Unavailable source blocks + separate Readiness; class-only demand specific Vehicle block gibi gösterilmez.
- [ ] Timeline block → source; date selection → vehicle-prefilled Reservation; Confirm Availability recheck; existing source state dışında hayali `success` yok.
- [ ] Rental history actual planned/actual, original/swap vehicle-specific km/inspection, normal/exceptional rental statuses and deep-links gösterir; Contract/Finance duplicate edit edilmez.
- [ ] Teslim vs İade km/fuel/4–5 foto/notes karşılaştırması, supplier inspection, key custody + equipment reconciliation kaynakların immutable evidence'ıyla görünür.
- [ ] Maintenance / Tire / Preparation source, next service N-km/N-month, explicit status, derived actual cost ve linked expense no-double-count korunur.
- [ ] Documents/expiry ile Damage/Fine/Insurance/Incident gerçek source tab'larında görünür; `Belge Ekle`, `Hasar Bildir`, `Ceza Kaydet` prefilled source workspace açar.
- [ ] Finans sekmesi role-gated; EUR/BAM/USD distinct, payments != charges, Supplier/Partner outgoing != customer collections, applied FX snapshot changed rate ile geri yazılmıyor.
- [ ] Konum timeline canlı GPS iddiası yok; transfer ≠ Home Branch change; Odometer current chronological source events ve authorized corrections'tan derived.
- [ ] External Vehicle confirmed future window vs Received+Ready delivery, engagement history and supplier return due; owned sale/disposal aksiyonu external araçta gösterilmez.
- [ ] Üst quick actions: rezervasyon, kiralama, müsaitlik, bakım, hasar, ceza, transfer, belge, hazırlık; geçerli permission/source gate, vehicle prefill, save/cancel and return-to-original-tab test edildi.
- [ ] Araç ekranında `Ready/Available/Rented/Sold/Disposed/Financially Closed` farklı domain durumları tek etikette birleşmez; yetkisiz kullanıcı financial/identity detail görmez.
- [ ] 1440/1024/768 web genişliklerinde tüm sekmeler kullanılabilir; responsive kart/tablo, loading/empty/error/conflict demo states, keyboard navigation ve back/forward test edildi.

## I.2. Diğer 35 sidebar workspace — tek tek kabul ve çapraz ekran kullanım testi

**Ölçüt:** §4 tam yetkili profilde **36** sidebar bağlantısı; `Araçlar` için §I.1, diğer **35** için aşağıdaki checklist. Bir satır ancak sayfadan gerçek kaynağa gidip kaydet/preview/hesaplama sonucunu (veya salt-okunur sayfada doğru projection'ı) **tarayıcı demo UI'sında** gözledikten sonra tamamlanır. Bu kontroller yeni özellik ya da backend zorunluluğu değildir; §82 mevcut ürünün derin UX kontratıdır.

### Genel (3/3)
- [ ] **Ana Ekran:** Today/Owner card → doğru source liste ve aynı şube/zaman filtresi; Owner için ayrı sidebar yok; kaynak verisi olmadan KPI uydurulmuyor.
- [ ] **Komuta Merkezi:** İş/Uyarı/Vardiya sekmeleri; tek incident/task source; kasa devri Şube Kasaları'na link, yeni cash ledger yok.
- [ ] **Filo Asistanı:** Plaka/kiralama/bakım sorgusu yalnız izinli deterministic sonuç ve doğru deep-link döndürüyor; salt okunur, fake AI yok.

### Operasyon (Araçlar hariç 8/8)
- [ ] **Rezervasyonlar:** Pending/Confirmed/Converted, class-only demand, specific allocation, kaparo ve fiyat snapshot'ı doğru; conversion atomik, available-but-not-ready ayrı.
- [ ] **Kiralamalar:** normal/exceptional lifecycle, primary+additional driver uygunluğu, anında logo/araç/şartlar kontratı, teslim/iade 4–5 kanıt ve hasar pinleri, in-person web imza/policy gate, Base Charge at Delivered, Finance state ayrı.
- [ ] **Takvim:** Gün/Hafta/Ay/Agenda aynı kaynaktan, class-only demand yanlış Vehicle bloklamıyor; filter/prefill/deep-link çalışıyor.
- [ ] **Görevler:** tek/çoklu/tüm uygun personele duyuru, tek owner, açık havuz ve `Üstlen`, Acil/Yüksek/Normal, audit/permission; task update kaynak Rental/Maintenance/Incident'i otomatik değiştirmiyor.
- [ ] **Bakım & Servis:** Planned/In Progress/Completed; actual cost tek Maintenance truth; Completed araç Ready yapmıyor.
- [ ] **Olay Merkezi:** olay çözümü linked Damage/Fine/Finance kaynağını otomatik çözmüyor; severity/evidence/owner doğru.
- [ ] **Hasar Kayıtları:** insurance snapshot, deductible liability açıklaması, linked repair, **tek** Customer Charge + ayrı Recovery.
- [ ] **Ceza Modülü:** Fine reference duplicate guard, rental suggestion manual, authority paid ≠ customer collection; linked Charge/Expense ayrı.

### Müşteri & Ticari (6/6)
- [ ] **Müşteriler:** 360° belgeler/iletişim/rentals/bakiye, prefilled Reservation, restricted identity ve corporate link ayrı.
- [ ] **Kurumsal Hesaplar:** currency başına limit/exposure, unbilled commitment ve posted receivables double-count yapmıyor; override only formal Approval.
- [ ] **Talep Merkezi:** Lead→versioned Quote→accepted Reservation, eski fiyat sürümü korunur, Lead earned commission oluşturmaz.
- [ ] **Partnerler:** attributed Rental trigger earned != Finance-derived paid; Portal yalnız ayrı partner context.
- [ ] **Araç Tedarikçileri:** Sourcing Request→Engagement→Inspection ve Settlement ayrımı; future Confirmed vs Received+Ready; supplier cash payment/deposit mahsup farklı.
- [ ] **Fiyatlandırma:** Base/season/tier/corporate/extras/discount/tax şeffaf preview; tek transaction currency; FX edit yalnız Ayarlar'da.

### Kontrol & Analiz (8/8)
- [ ] **Onay Merkezi:** yalnız altı type, requester ≠ reviewer, Approved ≠ Applied, exact source/currency apply.
- [ ] **Kurallar:** yalnız safe notification/review IF/THEN, hard taxes/FX/pricing/deposit değiştirmiyor.
- [ ] **Gelir Kontrolü:** `Delivered` öncesi doğmamış Base Charge false-positive vermiyor; her sinyal source-linked.
- [ ] **Riskler ve İstisnalar:** tek sidebar/iki sekme, Alert Center ile aynı source; incident duplicate yok.
- [ ] **Kapasite Planlama:** branch/class/date, confirmed demand, maintenance/transfer, one external master tek capacity; Pending count değil.
- [ ] **Filo Analizi:** utilization/idle/maintenance gerçek data, Vehicle deep-link, external source ayrımı; fake kâr/score yok.
- [ ] **Fırsatlar:** rule-based reason + suggested human action + source; otomatik booking/discount yok.
- [ ] **Raporlar:** sekiz aile, chart+table, original currency ayrı, converted reporting explicit rate-set etiketi.

### Finans (3/3)
- [ ] **Finans:** Charge/Payment/Advance/Deposit/Refund/Correction/Supplier/Partner ayrışır; split payer/method/currency, pinned FX, outstanding tutarlıdır.
- [ ] **Masraflar:** Draft/Posted/Voided, source-linked amount readonly, Supplier Settlement veya Refund ikinci Expense değil.
- [ ] **Şube Kasaları:** cash drawer native currency, cash-only source movement, shift counted/expected/fark, yetkili close; card/transfer kasaya nakit eklemez.

### Kayıtlar (3/3)
- [ ] **Sözleşmeler:** şirket logo/antet + sürücüler/araç/hasar şeması + fiyat/sigorta/depozito + Rental/version/signature/staff approval ayrı; browser print ve in-person imza, snapshot geçmişi korunur, external signature URL/fake sending yok.
- [ ] **Belge Merkezi:** global owner-index; upload/edit owner-domain'e gider; role masking ve pinned Rental Document Requirement gate tutarlı.
- [ ] **İşlem Geçmişi:** salt okunur audit, source linkler doğru; hassas belge/card payload sızmıyor.

### Yönetim (4/4)
- [ ] **Şubeler:** operational/security branch vs physical location ayrımı; currency/policy editor Ayarlar'a link verir.
- [ ] **Kullanıcılar:** demo active/role/branch scope değişimi navigasyona yansır; sahte auth email veya session iddiası yok.
- [ ] **Roller ve Yetkiler:** patronun özel rol + kişi bazlı izinli override, company/branch/data scope, effectivePermission preview, Approval four-eyes; role/branch değişimi menü/arama/deep-link/hassas alan/print/rapor/export/count'ta da etkilidir.
- [ ] **Ayarlar:** şirket logosu yükleme ve template preview, typed financial/global policies, **tek Döviz Kurları editörü**, versioned snapshot korunur; Şube/Kullanıcı/Rol CRUD duplicate değildir.

### Beş uçtan uca kullanılabilirlik rotası
- [ ] **Araç → Rezervasyon → Kiralama → Finans:** Vehicle 360'dan prefilled Reservation, Confirmed allocation, Rental creation/Delivery, Base Charge, partial payment/Financial Close; bütün ekranlarda tek source ID ve bakiye.
- [ ] **Müşteri → Talep → Quote → Reservation:** müşteri / lead / teklif / fiyat sürümü / rezervasyon bağlantıları; history değişmeden linklenir.
- [ ] **Hasar → Sigorta → Bakım → Finans:** aynı Vehicle/Rental incident, liability, linked repair source ve tek customer Charge; araç readiness bağımsız.
- [ ] **Tedarikçi → Engagement → External Vehicle → Rental → Settlement:** confirmed future, received+ready delivery, supplier payable ve cash outgoing ayrıdır.
- [ ] **Şube → Ayarlar FX → Çoklu Tahsilat → Şube Kasası → Rapor:** payment native currency, locked applied rate, yalnız nakit cash movement, rapor currency-by-currency doğru; admin rate update eski payment'ı değiştirmez.


## I.3. Sözleşme + hasar diyagramı + ek sürücü + personel yetki/görev kabulü (§83)

- [ ] Logo yükleme/değiştirme/kaldırma çalışan web demo file picker ile mümkün; antet ön izlemesi, boyut/format hata durumu var; eski issued contract logosu yeni logo ile değişmiyor.
- [ ] Rental `Prepared` iken ön izleme gerçek müşteri, birincil/ek sürücüler, vehicle, duration, fiyat/vergi, depozito, sigorta, branch, belge dili ve şartlar üzerinden oluşuyor; gelecekteki delivery km/fotoğrafı uydurulmuyor.
- [ ] `Issue` için document/driver/policy gate geçiliyor; `Issue != Delivered`, signed version immutable, yeni version eski signature'ı miras almıyor.
- [ ] Browser print/PDF preview gerçekten çalışıyor; müşteri önünde same-session web canvas signature ve alternatif ıslak imza kayıt akışı var; gerçek remote/legal e-sign veya gönderildi iddiası yok.
- [ ] Handover/Return'de body diagram pin ekleme/taşıma, tür/not/fotoğraf linki ve ayrı before/after immutable marker snapshot çalışıyor; pin 4–5 ayrı kanıt fotoğrafının yerine geçmiyor.
- [ ] Hasar pini kendi başına Damage case veya Charge yaratmıyor; mevcut source'a permission-gated explicit aksiyon bağlanıyor.
- [ ] Ek sürücü ekleme/çıkarma her kişi için gerçek driver policy sonucu, contract listesi ve gerektiğinde yeni version+signature gerektiriyor; ödeme yapanlar otomatik sürücü değil.
- [ ] Patron role+user+branch scope permission'ı demo olarak değiştirince sidebar, source detail, hassas finans/belge, arama, export, print, deep-link aynı effectivePermission'a göre çalışıyor.
- [ ] Görev `Bir kişi/Birkaç kişi/Tüm izinli ekip`, `Acil/Yüksek/Normal`, tek Task ID, açık havuz, bir owner `Üstlen`, başka kişi concurrent `Üstlen` conflict, devret/reopen/tamamla audit akışlarıyla gösteriliyor.
- [ ] Görev completion kaynak Rental/Maintenance/Incident'i otomatik kapatmıyor; notification/read/overdue source projection, gerçek push/e-posta veya backend job iddiası yok.

## I.4. Kiralamaya özel sigorta/depozito ve A4 servis/sigorta evrakı kabulü (§84)

- [ ] `Yönetim → Ayarlar → Sigorta Paketleri` paket adı, uygun branch/class/Vehicle, dönem, **transaction currency başına explicit fixed/daily price row**, deductible, coverage/exclusions, ek sürücü şartları ve version ile çalışıyor; zorunlu/opsiyonel/ücretsiz-dahil ayrımı belli.
- [ ] A sınıfında uygun opsiyonel paket diğer uygun olmayan class'ta görünmüyor; seçilmeyen opsiyonel paket Rental Charge/Contract'a sessiz yazılmıyor.
- [ ] Ücretli paket, Rental transaction currency için aktif explicit paket fiyat satırı yoksa seçilemiyor; `Paket Fiyatı Eksik` düzeltme bağlantısı var. **Onaylı fiyat dönüşümü veya payment tender FX ile otomatik sigorta fiyatı üretilemiyor.**
- [ ] Rental'da seçilen sigorta paketinin fiyat/vergi/deductible/terms version'ı tek Pricing+Coverage snapshot'tan Contract ve Damage analysis'a gidiyor; değişen katalog geçmişi rewrite etmiyor.
- [ ] Vehicle Insurance Policy ve kiralama müşterisine satılan Coverage Package farklı; Claim/servis evrakında insurer reference yalnız kaynağı varsa görünüyor.
- [ ] Deposit Policy company/branch/class/vehicle matching tekil ve açıklanabilir; required / policy-none ve currency Rental'da görünür; Corp override ardından yalnız Applied Deposit Exception çalışır; Held ödeme değildir.
- [ ] Rental create/convert sırasında birincil+ek sürücüler, gerçek sigorta seçenekleri, deposit karar kaynağı, fiyat/vergi ve issued contract tek guided akışta çalışır.
- [ ] A4 Maintenance Servis Sevk/İş Emri kaynak Vehicle/km/şikayet/provider/not/estimated cost bilgisinden doluyor; status'u sahte Completed yapmıyor.
- [ ] A4 Sigorta Hasar Dosyası, Damage/Incident/Claim+Vehicle Policy kaynaklarından hasar pini, gerçek evidence ve varsa insurer/polis references gösteriyor; başvuru/sigorta kabulü otomatik işaretlenmiyor.
- [ ] Browser print A4 sayfa bölümü/logo/imza alanları/Unicode düzgün; `PDF İndir` yalnız gerçek frontend dosyası üretiyorsa mevcut; diğer durumda `Yazdır → PDF olarak kaydet` doğru görünür. (§85.3 zorunlu alan/numara serisi kapıları da geçerli.)
- [ ] İsteğe bağlı browser paylaşma menüsü veya manuel PDF indirme gerçek çalışır; e-posta/WhatsApp/sigortacıya gönderildi iddiası yoktur.
- [ ] Role/branch/sensitive-field izinleri print/export/download/preview ve attachment'ta da enforce edilir; issued belgenin logo/sürüm/ekler geçmişi değişmez.
- [ ] Yeni sidebar linki yok: tam yetkili company menüsü hâlâ **7 kategori / 36 bağlantı**; ilgili A4 çıktılar mevcut Rental/Vehicle/Maintenance/Damage/Contracts context'lerinde.

## I.5. Fiyat/sigorta uzatma + beş yoğun kullanım ekranı kabulü (§85)

- [ ] Sigorta fiyatı Rental currency için exact active price row'dan gelir; EUR package, BAM Rental için uygun BAM price row olmadan ücret seçilemez. Payment FX veya izinli approval fiyat satırının yerine kullanılamaz; explicit `0 / included` ile `missing` ayrıdır.
- [ ] Aynı scope/effective zamanında duplicate eligible package price row varsa fiyat bloke edilir ve iki policy kaydı gösterilir; Price Snapshot, Coverage, Contract, tax ve Charge aynı source row/version'ı kullanır.
- [ ] Extension preview kira/insurance coverage ekstra gün veya explicit fixed policy/tax delta, Availability, supplier window, deposit etkisi ve yeni imza gereksinimini açık gösterir. Geçersiz coverage'da status/Charge yazılmaz; successful confirmed extension'da **bir** source-linked delta Charge/Credit olur.
- [ ] Template editor logo, izinli dinamik alanlar, zorunlu field lock, A4, belge dili, source placeholders ve browser-demo number sequence içerir. Taslak sayı tüketmez; issued version/logo/sayı immutable; production cross-device uniqueness iddiası yoktur.
- [ ] `Rental → Teslim Masası` üç alan kartı, her blocker için reason+source CTA ve finalize öncesi revalidation içerir. Aynı Delivered event iki kez post edilemez; doğan Base Charge tektir. Payment/Deposit/Contract issue kendi başına Delivery değildir.
- [ ] Araç 360° `Şimdi` ile seçili gelecek aralığı ayırır; sonraki return/pickup, preparation, cleaning/maintenance, document/damage blocklarını gerçek source'a bağlar. Predefined turnaround policy yoksa sahte `yeterli süre`/`Ready` göstermez.
- [ ] Shared tahsilat masasında payer ≠ liable renter, Payment Recorded ≠ Applied, planned installment ≠ collected, Deposit Held ≠ incoming customer revenue. Kalanını Öde yalnız Applied outstanding üzerinden; eksik FX satırı taslak kalır; currency-specific cash movement tek yazılır.
- [ ] Patron user-role-branch permission preview ve kişi başına görev yükünü tek Task/Activity'den görür; menu, deep link, source fields, search, print/export/download ve bildirim güvenliği aynı demo permission evaluator kullanır.
- [ ] Bir kişiye atama veya birden çoğa duyurma, açık havuz `Üstlen` race/conflict, `Acil/Yüksek/Normal`, devir/tamamlama tek Task source ID'de çalışır. Task close source Rental/Maintenance/Finance durumunu değiştirmez.
- [ ] §85.9'daki 7 günlük iş akışı örneği **gerçek etkileşimli demo state** ile uçtan uca denenebilir. Backend/POS/SMS/uzaktan imza varmış gibi hiçbir başarı gösterimi yoktur.

## J. Existing web capability preservation / navigation
- [ ] **§4 canonical sidebar** tam yetkili company profilde 7 kategori / **36 bağlantı**: Genel 3, Operasyon 9, Müşteri & Ticari 6, Kontrol & Analiz 8, Finans 3, Kayıtlar 3, Yönetim 4; kullanıcı menüsü ayrı 2 seçenek.
- [ ] Hasar Kayıtları ve Ceza Modülü yalnız Operasyon sidebar altında, Kayıtlar'da duplicate menü yok; geçmiş kayıtlar ilgili detayda bulunabilir.
- [ ] Kontrol & Analiz'de tek **Riskler ve İstisnalar** menüsü vardır; içinde **Operasyon Riskleri** ve **İstisna İnceleme** sekmeleri gerçek çalışır, iki yetenek korunmuştur.
- [ ] **Finans → Şube Kasaları** ayrı sidebar sayfasıdır; kasa session/cash events burada yönetilir, Finans overview ikinci editable kasa oluşturmaz.
- [ ] **Yönetim → Ayarlar** sidebar'da; kullanıcı menüsünde yalnız **Profil/Oturum ve Çıkış** vardır. Kişisel tercihler şirket/FX ayarı editörü değildir.
- [ ] İşletme döviz kurları **yalnız Yönetim → Ayarlar → Döviz Kurları** canonical editor'ünde değişir. Finans ekranı rate snapshot/history read-only gösterir ve yetkili deep-link ile aynı editöre gider.
- [ ] Platform Console yalnız Platform Super Admin üst-bağlam değiştiricisinde açılır; Company Admin rolüyle menüye eklenmez; Partner Portal ayrı web context'te kalır.
- [ ] §II.4, §59CT, Finans/Ayarlar ekranları bu tek §4 sidebar kontratıyla eşleşir; arama/bildirim/uyarılar ek sidebar öğeleri yaratmaz; hiçbir bağlantı boş sayfaya gitmez.
- [ ] Home/Owner Dashboard & Command Center single-source projections; Alert Center Command Center tabıdır.
- [ ] Fleet Assistant, Calendar day/week/month/agenda, Global Search, Notification Center.
- [ ] Reservation class-only vs specific, Pending/Confirmed, Waitlist atomic conversion, no overbooking.
- [ ] Rental direct/convert, handover/return 4–5 evidence, vehicle photo max one master.
- [ ] Vehicle lifecycle/availability/readiness/location, transfers, key/equipment custody, maintenance/cleaning/tires.
- [ ] Damage, fines, insurance claims, source-linked repair expense, customer statement.
- [ ] Customer, Corporate per-currency limits, Lead, Quote, Partner commissions, Supplier sourcing/external vehicle inspect/payable.
- [ ] Approval Center six formal types; typed policies don't invent seventh.
- [ ] Tasks, Incidents, Shift Handover, Alerts, Rules previews, Activity history, Expense draft/posted/voided.
- [ ] Original reporting 8 families + finance by currency/method/payer/cash variance.
- [ ] Yönetim → Ayarlar, company/branch/user/role demo UX, document center, CSV import preview, export preview, contextual quick actions.
- [ ] Every list/detail/workspace reachable, no duplicated editable financial fact.

## K. Global end-to-end test run (mandatory)

Bosnia branch → EUR/BAM/USD accepted tender + EUR/USD cash drawers → EUR Rental 500 → manual ``1 EUR=2 BAM`` → Kişi A 100 EUR cash → Kişi A 200 BAM card (Outstanding 300 EUR) → Kişi B 100 USD **Draft until** admin sets demo ``1 EUR=1.25 USD`` → apply 100 USD = 80 EUR (Outstanding 220 EUR) → Kişi C 220 EUR transfer (Outstanding 0; exactly three payers/four payment lines) → check charge/tax/advance/deposit/refunds/cash/register/finance summary. Change EUR/BAM rate afterwards; historical payment does not move. Then cover damage+insurance, exception closure, corporate second currency exposure, partner/supplier outgoing, role switch and demo reset. **All steps must be clickable and calculation-consistent in the web UI.**

---

# PART IV — AÇIK HUKUKİ / ÜRETİM KARARLARI (WEB TASARIMINDAN AYRI)

Bu bölüm UI konsepti teslimini bloke eden belirsiz bir feature listesi değildir; gerçek ticarileşme/production öncesi profesyonel doğrulama gerektiren maddeleri görünür tutar.

1. Ülke/bölge bazında vergi/fiskal fatura/fiş ve belge gereklilikleri; Bosna/AB/diğer yargı alanlarında farklı olabilir.
2. İşletmenin belirlediği döviz kuruyla tahsilatın hukuki izinleri, nakit kabul limitleri, müşteri aydınlatması, kur gösterimi ve kayıt tutulması.
3. Kart verisi saklamadan ödeme kaydı tutma, ödeme sağlayıcısı, ters ibraz/refund kanıtı, chargeback.
4. Sigorta ürünü isimleri, CDW/SCDW hukuki metni, gerçek poliçe kapsamı, sorumluluk ve müşteriye bilgilendirme.
5. Driver minimum age/experience law vs company policy, foreign driving license ID requirements.
6. Personal data lawful basis, retention, cross-border transfers, document scanning, client/partner consent policy.
7. Üretim SaaS: backend, storage, tenant isolation, full audit, strong auth, backups, billing, scheduler, regulated integrations. **Bu belgede geliştirilmiyor.**

Bu maddeler henüz doğrulanmadığından kullanıcı arayüzü ``tam yasal uyum`` veya ``gerçek tahsilat`` vaadinde bulunmaz.
