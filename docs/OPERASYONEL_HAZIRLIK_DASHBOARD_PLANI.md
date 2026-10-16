# Operasyonel Hazırlık + Ana Kontrol Paneli V1 — Plan

- **Dal:** `operasyon-hazirlik-v1`
- **Çalışma ağacı:** `C:\Users\soena\Desktop\acarvo-oh1`
- **Başlangıç:** main `29b105d` (ana veritabanı 43 migration)

**Sınırlar:**
- Testler yalnız `acarvo_test` üzerinde çalışır.
- Ana veritabanına migration uygulanmaz.
- Main'e birleştirme yapılmaz.

**Dayanak:**
- Spec: §6 Ana Ekran, §7 Komuta Merkezi ilkeleri, §59A Patron görünümü, §59CE "Bugün" şeridi.
- `docs/TEKNIK_UYGULAMA.md`
- Finans V1 ve BHT V1 raporları.

## 1. Ana Kontrol Paneli (`/` — Ana Ekran)

**Tek uç, tek sorgu seti:** `GET /api/dashboard?branchId=`. Sayılar mevcut tablolardan türetilir; sahte veri yoktur. Veri yoksa 0 veya boş durum gösterilir.

**Filo durumu.** Kovalar birbirini dışlar (§59A):

| Kova | Anlamı |
|---|---|
| Kirada | Aktif veya gecikmiş kiralama |
| Bakımda | Servisteki ya da kontrol bekleyen bakım |
| Transferde | Yoldaki transfer |
| Kullanılamaz | Hasar engeli veya aracın hizmet dışı olması |
| Rezerve | Şu an süren onaylı rezervasyon |
| Müsait | Yukarıdakilerin hiçbiri |

- Hesap, **şu ana** göre ortak `vehicle_busy` ile yapılır; ikinci bir uygunluk motoru yoktur.
- Gelecekteki kayıtlar "Sıradaki" altında ayrı listelenir. "Şu an müsait" ile "gelecekte boş" birbirine karıştırılmaz.

**Bugün şeridi (§59CE):** saate göre sıralanır.
- Bugünkü teslimler: onaylı rezervasyonlar ve teslim bekleyen kiralamalar.
- Bugünkü iadeler.
- Geciken teslimler ve iadeler.

**Dikkat gerektirenler:**
- bekleyen rezervasyonlar;
- onay bekleyen ve geciken bakımlar;
- kullanılamaz araçlar;
- yoldaki ve gelen transferler;
- engel kaldırma onayı bekleyen hasarlar;
- yaklaşan veya geçmiş periyodik bakım (gerçek kayıtlardan, küme sorgusuyla).

**Şube görünümü:** şube başına araç kovaları, bugün teslim/iade ve geciken işler.

**Finans özeti:** yalnız `finance.read` yetkisi olan kullanıcıya gösterilir. Yetkisi olmayan kullanıcıya alan hiç dönmez.
- Para birimleri ayrı tutulur ve dönüştürülmez.
- Gösterilenler: kaydedilen ve doğrulanan tahsilatlar, doğrulama bekleyenler, tutulan depozitolar, bekleyen depozito iadeleri, iç hesap kalemleri (onaylı ve bekleyen).
- Teklif gelir sayılmaz, depozito kira geliri sayılmaz.
- "Resmî rapor değildir" uyarısı gösterilir.

**Kapsam:**
- RLS ve kullanıcının şube yetkileri uygulanır.
- Şube filtresi yalnız kullanıcının yetkili olduğu şubeleri kabul eder.
- Her satır gerçek kayda bağlanır. Kayıt ekranları kendi yetkilerini ayrıca denetler.

## 2. Operasyonel Hazırlık Merkezi (`/ayarlar/hazirlik`, yeni yetki `readiness.read`, yalnız Sahip)

Salt okunur kontroller ve durum dili:

| Durum | Anlamı |
|---|---|
| Hazır | Kayıt var |
| Eksik | Kayıt yok veya koşul sağlanmıyor |
| Çalışıyor | Canlı bağlantı testi geçti |
| Yapılandırılmış | Ayar var, çalışma testi yapılmadı |
| Doğrulanmadı | Sistem doğrulayamaz |
| İnsan kararı gerekli | Karar kişiye ait |

Kontroller:
- **Şubeler:** ülke ve saat dilimi.
- **M2 şifreleme:** anahtarlar yüklü mü (yalnız var/yok; değer, parmak izi veya kimlik gösterilmez).
- **Zararlı dosya taraması:** yapılandırma ve sağlık. Tarayıcı varsa küçük, zararsız bir sınama verisiyle canlı test yapılır.
- **Ülke belge kuralları:** etkin kural sayısı.
- **Kiralama modu.**
- **Fiyat listesi ve vergi:** etkin liste ve vergi ayarı. Vergi yoksa "insan kararı gerekli"; oran tahmin edilmez.
- **Sözleşme şablonu:** etkin şablon var mı. Hukuki onay için kayıt alanı yok, bu yüzden "Doğrulanmadı / hukuki inceleme gerekli".
- **Dört göz yetkilileri:** finans doğrulama ve onay yetkisi olan kişi sayısı ve hasar engeli kaldırma yetkilisi sayısı. 2'nin altındaysa "Eksik".
- **Bekleyen kritik kararlar:** onay bekleyen engel kaldırmalar ve FN5 düzeltmeleri.

Hazırlık ekranı hiçbir şeyi değiştirmez. Gösterilen tüm "Hazır" durumları işletmenin hukuken hazır olduğu anlamına gelmez; ekran bunu açıkça yazar.

## 3. Onarım taşıması kanıtları

**Yeni alanlar:** taşıyıcı adı ve dış taşıma/sevk referansı.
- Onarım taşıması oluşturulurken ikisi de zorunludur (guard ve API).
- Mevcut test satırları bozulmasın diye kural CHECK kısıtı olarak değil, ekleme guard'ında uygulanır.

**Belge ve fotoğraf:**
- Taşıma fotoğrafı veya belgesi güvenli dosya altyapısıyla eklenir (`transfer_photos`).
- Tarama yoksa üretimde yükleme kapalı kalır.

**Gösterim:** personel girdisidir; sağlayıcı tarafından doğrulanmış gibi gösterilmez.

**Değişmeyenler:** varışta hasar engeli kalkmaz; normal transfer engeli aynen sürer.

## 4. Fotoğraf erişim denetimi

**Kapsam:** kanıt fotoğrafları — teslim, iade, bakım, hasar, taşıma.

**İzin modeli** (mevcut belge izin modeli kullanılır):
- `POST /api/photo-access`: CSRF ve Origin denetimi, şirket, yetki ve şube kontrolü.
- Oturuma bağlı, kısa süreli bir izin (10 dakika) **kayıt başına** verilir. İşlem geçmişine "fotoğraf erişim izni verildi" yazılır.
- Aynı oturumda geçerli izin varken yeni geçmiş kaydı açılmaz.

**Korumalı GET:**
- Yalnız geçerli izinle dosya akıtır.
- Her istekte yetki ve kapsam yeniden denetlenir.
- `no-store` başlığı gönderilir; GET yeni geçmiş kaydı oluşturmaz.

**İptal:** çıkış yapma ve tüm oturumları kapatma izinleri iptal eder. Yetki kaldırılınca bir sonraki GET reddedilir.

**Gizlilik:** URL'de token, dosya adı veya kişisel veri bulunmaz.

**Mevcut dosyalar:** değiştirilmez.

## 5. Hasar engeli kaldırmada ikinci onay

- **Tablo:** `damage_block_release_requests`.
- **Akış:** talep (gerekçe, yeni kullanılabilirlik) → farklı bir yetkili onaylar veya reddeder. Talep eden kendisi geri çekebilir.
- **PostgreSQL koşulları:**
  - Engel yalnız onaylı bir talebe bağlı kapanır.
  - Onaylayan, talep edenden farklı olmalı ve `ended_by` ile aynı kişi olmalıdır.
  - Bir engelde aynı anda yalnız bir açık talep olabilir.
- **Onay anında:** kilit alınır, engel ve talep yeniden okunur.
- **Diğer tutuşlar:** bakım ve transfer tutuşları ayrı kaldığı için araç onlar sürdükçe müsait görünmez.
- **Yetki:** mevcut `damage.unblock` (Sahip ve Yönetici). Operasyon rolüne verilmez.
- **İkinci yetkili yoksa:** engel kalkmaz ve hazırlık ekranında "Eksik" görünür.
- **Bakım:** bakım tamamlamaya dört göz şartı eklenmez.

## 6. FN5 — Yanlış ödeme sorumlusu

- **Tablo:** `finance_responsible_corrections` (talep → onay/red → uygulandı).
- **A) Hiç finansal hareketi olmayan dosya** (kalem, tahsilat, depozito, iade yok):
  - Talep `finance.close` yetkisi ister.
  - Onay ikinci bir `finance.close` yetkilisinden gelir.
  - Yeni taraf, kiralamanın kendi müşterisi veya kurumsal hesabı olmalıdır.
  - Onay anında dosyanın `responsible_*` alanları güncellenir. Guard bunu yalnız aynı işlemde onaylanmış bir düzeltme kaydı varsa kabul eder.
  - Eski taraf, yeni taraf, gerekçe ve kişiler düzeltme kaydında ve finans olaylarında kalıcı olarak saklanır.
- **B) Hareketi olan dosya:**
  - API (`FINANCE_CORRECTION_REVIEW`) ve guard düzeltmeyi reddeder. Kayıtlar taşınmaz.
  - Önerilen model (raporda): ters kayıtla kapatma ve yeni dosya açma, ya da "geçerli sorumlu" görünümü (FN5 tasarımı). Karar işletmeye aittir.

## 7. Migration'lar (yalnız test)

- `0043`: drizzle ile üretilir — yeni tablolar ve taşıma sütunları.
- `0044`: elle yazılır — RLS, guard'lar, `rental_finances_guard` değişimi (mevcut tanımın aynısı + düzeltme izni), yetkiler (GRANT).
- Mevcut dosyalar değişmez.

## 8. Yetkiler

- Yeni yetki: `readiness.read` (yalnız Sahip).
- Ön ayar sürümü 12'ye yükselir.
- Özel roller değişmez.

## 9. Testler

- **API:** izolasyon, şube kapsamı, finans gizleme, para birimi ayrımı, uygunluk tutarlılığı, hazırlık yetkisi, anahtar sızmaması, taşıma kanıtları, fotoğraf izinleri, GET'in geçmiş kaydı oluşturmaması, oturum/yetki iptali, dört göz, kendi işlemini onaylayamama, eşzamanlı onay, FN5 A ve B, finans değişmezliği, mevcut çakışma koruması.
- **Performans:** binlerce kayıtla.
- **Tarayıcı:** akışlar, erişilebilirlik, telefon görünümü, ekran görüntüleri (1440, 768, 390).
