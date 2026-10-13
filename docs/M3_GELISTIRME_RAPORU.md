# ACARVO — M3 Geliştirme Raporu (Kurumsal Hesaplar)

**Dal / klasör:** `kurumsal-m3` / `C:\Users\soena\Desktop\acarvo-m3`. Başlangıç noktası `main` `3bda9dd`.
**Durum (13.10.2026):** M3 main'e birleştirildi ve ana veritabanına uygulandı (24 migration). Ayrıntılar en alttaki "Son kontroller ve main entegrasyonu" bölümünde. Push yapılmadı.
**Plan:** `docs/M3_KURUMSAL_HESAPLAR_PLANI.md` (kararlar D1–D13). **Teknik:** `docs/TEKNIK_UYGULAMA.md` §8.8.

## Özet

| Konu | Sonuç |
|---|---|
| API testleri | **334/334** (önce 305; 29 yeni) |
| Tarayıcı testleri | **83 geçti**, 18 isteğe bağlı atlandı (önce 71 geçen + 15 isteğe bağlı) |
| Ekran görüntüsü testleri (ayrı çalıştırıldı) | 3/3; 1440 / 768 / 390'da 42 görüntü |
| TypeScript ve üretim derlemesi | Hatasız |
| Test veritabanı | 24 migration; salt okunur `safe-migrate --verify --test`: sorun yok |
| Ana veritabanı | **Dokunulmadı:** 22 migration, kurumsal tablo yok (salt okunur doğrulandı) |

## Aşama sonuçları

### Aşama 0 — İnceleme ve hazırlık
- Spec, teknik doküman, müşteri/kurumsal planı ve M2 belgeleri incelendi.
- Onaylı kararlar korundu:
  - kişi ≠ kurumsal hesap;
  - şirket içinde tek kişi, tek kayıt;
  - `K-00042` numarası;
  - `corporate.read` / `corporate.manage` yetkileri;
  - kredi limiti Finans modülüne kaldı.
- Plan yazıldı: `docs/M3_KURUMSAL_HESAPLAR_PLANI.md`.
- Ayrı dal ve klasör açıldı: `kurumsal-m3`, `acarvo-m3`. Main ve çalışan uygulama değişmedi.

### Aşama 1 — M2 sayaç doğrulaması
- İki şirkette üye olan kullanıcı (Adnan) senaryosu incelendi:
  - **Günlük 600 sınırı:** gerçekten bütün şirketlerdeki denemelerin toplamını sayıyor. Test: 299 + 300 = 599 deneme geçiyor, 600. deneme engelleniyor. Engel yanıtı diğer şirketin adını vermiyor.
  - **Görünürlük:** kullanıcı bir şirket bağlamındayken diğer şirketin başka kullanıcılarına ait sayaçları göremiyor. Şirket bağlamı yokken yalnız kendi satırlarını görüyor.
- **Güvenlik açığı bulunmadı.** Eksik iki test eklendi (`tests/document-number-limits.test.ts`).

### Aşama 2–5 — Veri modeli, izolasyon, kişiler, uluslararası vergi ve adres
- **Tablolar:**
  - `corporate_accounts`
  - `corporate_contact_channels`
  - `corporate_tax_ids`
  - `corporate_addresses`
  - `corporate_account_people`
- **Migration'lar:**
  - `0022_corporate_accounts.sql`: yalnız yeni tablolar, indeksler ve bu tablolara ait kısıtlar; mevcut tablolarda hiçbir ALTER yok.
  - `0023_corporate_accounts_rls.sql`:
    - zorunlu RLS ve 4 politika;
    - değiştirilemezlik tetikleyicileri;
    - DELETE'siz yetkiler.
- **Numara:** `K-00042`, şirket başına ayrı sıra; eşzamanlı oluşturmada çakışma yok (testte 8 paralel kayıt ardışık numara aldı).
- **İzolasyon:**
  - her satırda `company_id` ve bileşik yabancı anahtarlar var;
  - başka şirketin hesap veya kişi kimliği bilinse bile API **404** döner;
  - veritabanı da başka şirketin kişisine bağlantıyı yabancı anahtarla reddeder;
  - ortak havuz ve şirketler arası eşleştirme yok.
- **Kişiler:**
  - Hesap, mevcut müşteri kaydına bağlantı tutar; ad, telefon veya belge kopyalamaz.
  - Bir kişi birçok hesapla, bir hesapta birçok rolle ilişkilenebilir. Örnek: test verisinde Ajla iki hesapta farklı rollerle yer alıyor.
  - Roller: hesap yetkilisi, iletişim kişisi, rezervasyon sorumlusu, yetkili sürücü, faturalama iletişim kişisi, diğer.
  - Başlangıç ve bitiş tarihleri tutulabilir.
  - Sona erdirilen ilişki silinmez; gerekçesiyle "Önceki ilişkiler" altında kalır.
  - Hesabı arşivlemek kişileri arşivlemez; ilişkiyi bitirmek müşteri kaydına dokunmaz.
- **Vergi ve adres:**
  - Birden çok vergi kimliği tutulabilir: ülke, serbest tür kodu (öneriler: VAT, PDV, JIB, VKN…), değer, açıklama, kontrol durumu.
  - Biçim denetimi yalnız uyarıdır: çok kısa değer, alışılmadık karakter, KDV ön ekinin ülkeyle uyuşmaması. Hukuki geçerlilik hükmü verilmez.
  - Adresler: resmi, fatura, yazışma, diğer; her türde tek birincil.
  - Birincil kaldırılırsa aynı türden en eski kayıt birincil olur ve kullanıcıya söylenir.

### Aşama 6 — Kurumsal Hesaplar listesi
- **Arama:** unvan, kısa ad, hesap no, vergi kimliği, sicil no, e-posta ve telefon kanalı.
- **Arama metni** adres çubuğuna yazılmaz; istek gövdesinde gider.
- **Filtreler:** ülke, kişiler (sürücüsü olanlar / kişisi olmayanlar), durum. Sıralama ve sayfalama sunucuda yapılır.
- **Yeni hesap ve düzenleme paneli** gruplu:
  - bölümler: kimlik, ticari kayıt, ilk iletişim kanalları, ilk adres, ilk vergi kimliği, diğer;
  - canlı mükerrer önerisi; güçlü öneride açık onay istenir;
  - kaydedilmemiş değişiklik uyarısı;
  - sürüm çakışmasında "güncel bilgileri yükle".

### Aşama 7 — Kurumsal Hesap 360°
- **Başlık:** numara, unvan, durum, birincil telefon, e-posta, vergi kimliği, kişi ve sürücü sayısı.
- **Sekmeler:**
  - Genel: şirket bilgileri, iletişim kanalları, hesap özeti, birincil adresler, kayıt bilgisi;
  - Adresler, Vergi bilgileri, Kişiler, Sürücüler, Geçmiş;
  - Rezervasyonlar, Kiralamalar, Cari/Finans: "henüz bağlı değil" yazar, sahte veri gösterilmez.
- Kişiden Müşteri 360°'a geçilebilir.
- Müşteri 360°'ta yeni "Kurumsal ilişkiler" paneli ve dosya özetinde gerçek bağlantı sayısı var.

### Aşama 8 — Yetkiler ve işlem geçmişi
- **Hazır roller** `ROLE_PRESET_HISTORY` v5 ile güncellendi:

  | Rol | Eklenen yetki |
  |---|---|
  | Sahip | `corporate.read`, `corporate.manage` |
  | Yönetici | `corporate.read`, `corporate.manage` |
  | Operasyon | yalnız `corporate.read` |

  Özel roller değişmez.
- **Kişi listesi ve bağlama** ayrıca `customers.read` ister. Kurumsal yetki müşteri verisine arka kapı olmaz.
- **M2 korunur:**
  - Sürücü ehliyet özeti (tarih ve durum) yalnız `customers.documents.read` olana gösterilir.
  - Kurumsal API'de numara, maskeli numara veya dosya hiç yoktur.
  - Bir kişiyi sürücü olarak bağlamak belge yetkisi vermez (testli).
- **İşlem geçmişi:**
  - Denetlenen olaylar: oluşturma, düzenleme, arşiv, geri alma, kanal, vergi, adres, kişi bağlama, rol değişikliği, ilişki sonlandırma.
  - Vergi kimliği, adres, telefon ve e-posta değerleri geçmişe kopyalanmaz.

### Aşama 9 — Testler
- **API** (`tests/corporate.test.ts` 27, `tests/corporate-performance.test.ts` 2):
  - şirket izolasyonu (liste, kimlik, arama, mükerrer, bağlantı, veritabanı yabancı anahtarı, RLS sayıları);
  - şubeler arası erişim;
  - RBAC matrisi ve özel roller;
  - numara çakışmaları ve eşzamanlı oluşturma;
  - çoklu vergi kimliği, adres ve birincil kuralları;
  - bir kişinin birçok hesabı, bir hesapta birçok rol;
  - arşiv ve geri alma;
  - ilişki sonlandırma ve müşterinin korunması;
  - mükerrer önerileri, eşzamanlı düzenleme ve eşzamanlı bağlama;
  - geçmişte ve sunucu günlüğünde değer sızıntısı;
  - başka şirketin kişi kimliğiyle bağlantı denemesi;
  - M2 belge yetkilerinin atlatılamaması;
  - veritabanında DELETE yetkisi ve tetikleyiciler.
- **Tarayıcı** (`corporate.spec.ts` 10, erişilebilirlik 1, telefon 1, isteğe bağlı ekran görüntüleri 3):
  - liste ve arama;
  - oluşturma ve mükerrer onayı;
  - adres, vergi ve kanal işlemleri;
  - kişi bağlama ve aynı panelden yeni müşteri açma;
  - rol değiştirme ve ilişki sonlandırma;
  - arşiv ve geri alma;
  - kaydedilmemiş değişiklik ve sürüm çakışması;
  - salt okuyan Operasyon kullanıcısı;
  - başka şirketin gerçek hesap kimliğinin "bulunamadı" görünmesi;
  - 768 / 390 yerleşimi.
- **Uyarlanan mevcut testler:**
  - `isolation.test.ts`: yeni 5 tablo listeye eklendi;
  - `customers.test.ts`: şirket başına sayaç sayısı 2 oldu.

### Aşama 10 — Görsel kalite kontrolü
- Ekran görüntüleri: `apps/e2e/screenshots/m3/` (14 görüntü × 1440 / 768 / 390). Klasör Git'e alınmaz, diskte durur.
  - Kapsanan ekranlar: liste, yeni hesap ve benzer kayıt uyarısı, 360° ve tüm sekmeleri, kişi bağlama, adres ekleme, arşiv diyaloğu, boş arama, arşivdeki hesap.
- Yatay taşma yok.
- Telefonda paneller tam genişlik açılıyor; kaydet düğmesi görünür, satır düğmeleri en az 36 px.
- axe (WCAG 2.1 A/AA) kurumsal ekranlarda **hiç bulgu vermedi.**
- **İncelemede bulunan ve düzeltilenler:**
  - masaüstü Kişiler sekmesinde ehliyet bilgisi dar sütunda bölünüyordu; rollerin altına taşındı;
  - Müşteri 360° panelleri ekran okuyucuda adlandırılmış bölge değildi; başlıklarıyla ilişkilendirildi;
  - arama kutusunun ipucu kısaltıldı;
  - "Oluşturan" bilgisi olmayan kayıtlar soluk gösteriliyor.

### Aşama 11 — Performans
- 5.000 sentetik hesapta ölçüm yapıldı (her hesapta vergi kimliği, e-posta kanalı ve sürücü bağlantısı var):

  | İstek | Süre |
  |---|---|
  | İlk sayfa | 54 ms |
  | 100'lük 50. sayfa | 57 ms |
  | Ad içinde arama | 17 ms |
  | Vergi kimliği parçası | 18 ms |
  | E-posta | 17 ms |
  | Hesap no | 10 ms |
  | Sürücü + ülke filtresi | 20 ms |

- **Liste her istekte tek sorgu çalıştırır:** sayılar ve birincil değerler alt sorgularla gelir; satır başına ayrı sorgu (N+1) yok.
- **İndeksler:**
  - `(company_id, status, legal_name_normalized)`;
  - oluşturulma tarihi ve sicil no;
  - vergi ve kanal değerleri;
  - ilişkilerde hesap ve kişi.
- **Tam eşleşme:** mükerrer kontrolündeki tam unvan araması indeks kullanıyor (testli).

### Aşama 12 — Veritabanı güvenliği
- Migration'lar yalnız `acarvo_test`'e uygulandı. `safe-migrate --verify --test` sorun bulmadı:
  - 36 tablo;
  - 32 tabloda zorunlu RLS;
  - RLS'siz tablolar yalnız sabit 4 genel tablo.
- Ana veritabanına hiçbir migration uygulanmadı, hiçbir kayıt eklenmedi. Salt okunur doğrulandı: 22 migration, kurumsal tablo 0. 12.10.2026'daki 1 gerçek müşteri kaydı, araçlar ve belgeler yerinde.

### Aşama 13 — Git

| Commit | İçerik |
|---|---|
| `87b80bb` | Plan ve M2 sayaç testleri |
| `de65f18` | Veri modeli, migration'lar, API, rol yükseltmesi, API testleri |
| `6430bad` | Ekranlar ve tarayıcı testleri |
| (bu rapor) | Rapor ve `TEKNIK_UYGULAMA` §8.8 |

- Push yapılmadı.
- `.env` değiştirilmedi, gizli değer okunmadı, gerçek anahtar üretilmedi.

## Düzeltilen hatalar
1. **Boş migration test veritabanına uygulandı** (yalnız `acarvo_test`).
   - Ne oldu: 0023 dosyasının yazımı başarısız olmuştu, ama geçiş komutu aynı anda çalıştı ve boş şablonu uyguladı.
   - Nasıl yakalandı: yeni salt okunur denetim kurumsal tabloların RLS'siz olduğunu hemen bildirdi.
   - Düzeltme: test veritabanındaki boş 0023 kaydı kaldırıldı ve doğru 0023 uygulandı.
   - Ders: dosya yazımı ile geçiş artık aynı adımda çalıştırılmıyor.
2. **Avusturya KDV ön eki** (`ATU…`) uyarıda yakalanmıyordu; kural düzeltildi ve testlendi.
3. **Ekran düzeltmeleri** (Aşama 10): ehliyet satırının bölünmesi ve bölge adlandırması.

## Açık riskler ve kararınızı bekleyen konular
1. **D1 — Askıya alma durumu eklenmedi** (yalnız etkin / arşiv). Rezervasyon ve kiralamada etkisi tanımlanınca eklenebilir.
2. **D2 — Aynı vergi kimliği farklı hesaplarda engellenmiyor.** Güçlü uyarı ve açık onay isteniyor. Plan kesin tekillik öneriyordu; bağlı şirketler ve ayrı faturalanan birimler için gevşetildi. Kesin engel isterseniz küçük bir değişiklikle yapılabilir.
3. **Geçici test çakışması.** Test veritabanı artık 24 migration'da. Main dalındaki testler birleştirmeye kadar bu veritabanında "migration sayısı" kontrolünden geçemez. Main'de test çalıştırmadan önce M3'ün birleştirilmesi gerekir.
4. **Mükerrer kontrol uç noktası** dakikada 60 istekle ve yalnız bellekte sınırlı (müşterilerdeki gibi). Vergi kimliği bir sır değil, ticari bilgidir. Yine de kalıcı sınır gerekirse M2'deki sayaç altyapısı kullanılabilir.
5. **Operasyon rolü** kurumsal hesapların vergi kimliklerini ve iletişim kanallarını görür (plana uygun: `corporate.read`).
6. **Plandaki bir madde yapılmadı:** müşteri listesinde "kurumsal sürücü" filtresi. Kişinin bağlantıları Müşteri 360°'ta görünür; filtre ileride eklenebilir.
7. **Benzer ad araması** (`pg_trgm`) kullanılmadı; plan gereği M5'e kaldı.
8. **Ekran görüntüleri** Git dışında tutuluyor (mevcut `.gitignore` kuralı).

## Main'e geçiş için yapılması gerekenler (onayınızla)
1. `kurumsal-m3` dalını gözden geçirin. Main'in atası olduğu doğrulanıp yalnız ileri sarma ile birleştirilir.
2. Testler `acarvo_test` üzerinde çalıştırılır (API, tarayıcı, tip denetimi, derleme).
3. Ana veritabanında migration uygulanır:
   1. önizleme: `node --env-file=.env scripts/safe-migrate.mjs --dry-run`; beklenen bekleyenler `0022`, `0023`;
   2. doğrulanmış yedek alınıp uygulama: `node --env-file=.env scripts/safe-migrate.mjs`.
   3. Beklenen değişiklikler:
      - 5 yeni tablo;
      - hazır rollere `corporate.*` yetkileri ve her şirkete 3 "rol yükseltme" geçmiş kaydı;
      - mevcut veride değişiklik yok.
4. Salt okunur doğrulama: `--verify`, öncesi ve sonrası parmak izi karşılaştırması.
5. Uygulama yeniden başlatılır. Kurumsal Hesaplar menüsü açılır; liste boş gelir ve "Henüz kurumsal hesap yok" yazar. Ana veritabanına örnek kayıt eklenmez.

---

## Son kontroller ve main entegrasyonu (13.10.2026)

### Ürün kararları (onaylandı)

**Hesap durumları:** yalnız "Etkin" ve "Arşivde". Askıya alma Rezervasyon/Kiralama modülüne kaldı. Mevcut işlev buna uygundu; değişiklik yapılmadı.

**Aynı vergi kimliği aynı şirketteki farklı hesaplarda bulunabilir.** Koşullar ve durumları:

| Koşul | Durum |
|---|---|
| Güçlü mükerrerlik uyarısı | Vardı |
| Açık kullanıcı onayı | Vardı |
| Başka şirketlerle karşılaştırma yapılmaması | Vardı |
| Otomatik birleştirme yapılmaması | Vardı |
| Onayın denetim geçmişinde izlenmesi | **Eksik bulundu, düzeltildi** |

- **Eksik:** onay, hesap oluştururken geçmişe yazılıyordu. Sonradan vergi kimliği, telefon veya e-posta eklerken ya da değiştirirken verilen onay yazılmıyordu.
- **Düzeltme** (`1cbcb57`): bu işlemlerde de `acknowledgedDuplicates` (diğer hesapların numaraları, değer değil) geçmişe yazılıyor.
- **Regresyon testi:** onay isteniyor; ekleme ve değiştirmede kaydediliyor; geçmişte değer yok; Neretva'da karşılaştırma yok; birleştirme yok.

### Boş migration olayının kesin açıklaması
- **Etkilenen dosya:** `0023_corporate_accounts_rls.sql`.
- **Ne oldu:** Sprint sırasında dosya Drizzle'ın boş şablonuyla (`-- Custom SQL migration file…`) oluşturuldu. İçeriği yazma adımı başarısız oldu (araç önce dosyanın okunmasını istedi). Aynı paralel adımdaki geçiş komutu boş şablonu yalnız `acarvo_test`'e uyguladı ve geçmiş kaydına işledi (kayıt id 26).
- **Nasıl yakalandı:** Salt okunur `--verify` kurumsal tabloların RLS'siz olduğunu hemen bildirdi.
- **Nasıl düzeltildi:** Yalnız `acarvo_test`'te boş kaydın satırı silindi (owner yetkisiyle, veritabanı adı denetlenerek). Dosyaya gerçek içerik yazıldı ve migration yeniden uygulandı (kayıt id 27).
- **Git geçmişi:** `0023` yalnız bir kez, gerçek içeriğiyle commit'lendi (`de65f18`); depoda boş hali hiç olmadı.
- **Ana veritabanı:** o sırada etkilenmedi (22 migration'da kaldı).

### Migration geçmişinin tutarlılığı
Kontrol yöntemi: Drizzle her uygulanan migration için dosya içeriğinin SHA-256 özetini ve günlükteki zamanı kaydeder. Her dosya özetlendi; test ve ana veritabanı kayıtlarıyla salt okunur olarak karşılaştırıldı.

**Sonuçlar:**
- **0023:** test veritabanındaki kaydın özeti bugünkü dosyayla birebir aynı; boş şablonun kaydı yok.
- **Sıra ve zamanlar:** tüm kayıtlar günlükle uyumlu. Kayıt numaralarındaki boşluklar (12, 13 ve 26) eski geri alınmış denemelerden ve silinen boş kayıttan geliyor.
- **0009 (ana ve test) ve 0017 (yalnız test):** özetler farklı görünüyordu. Bu kayıtlar dosyanın Windows satır sonlu (CRLF) haliyle birebir eşleşiyor: dosyalar uygulandığında çalışma kopyasında CRLF vardı, Git commit'te LF'ye çevirdi. SQL içeriği aynı. Drizzle yalnız zamana bakar, uygulanmış geçmişe dokunulmadı.
- **Ana veritabanında bekleyen:** yalnız beklenen iki dosya, `0022` ve `0023`.

**Sıfırdan uygulama kontrolü:**
- Owner rolünün yeni veritabanı açma yetkisi (CREATEDB) yok; bu yetki verilmedi.
- Bunun yerine test veritabanında tek, geri alınan bir işlem yapıldı: beş kurumsal tablo kaldırıldı, `0022` ve `0023` bugünkü içerikleriyle 22 migration'lık duruma yeniden uygulandı.
- Oluşan nesneler önceki tanımlarla **birebir aynı:** 90 sütun, 108 kısıt, 22 indeks, 20 politika, 5 RLS, 5 tetikleyici, 15 yetki, 3 fonksiyon. İşlem geri alındı.

### "Exit code 4" hataları
- **Gözlem:** API (3001) ve web (5173) sorunsuz başlamıştı; sağlık isteğine 200 dönmüş, Vite hazır olmuştu. Ardından ikisi de hata yazmadan aynı anda kapandı.
- **Neden:** Arka plan komutları Claude oturumuna bağlı ve oturum kapanırken sonlandırıldılar. Exit code 4 bu sonlandırmanın çıkış kodu. Uygulama hatası, port çakışması, yanlış klasör veya ortam değişkeni sorunu yoktu; portlar boştu.
- **Çözüm:** Sunucular main klasöründen (dal `main`, `1cbcb57`) yeniden başlatıldı. Sağlık kontrolü: API `{"status":"ok","database":"connected"}`, web 200, `/kurumsal-hesaplar` 200.
- **Not:** Bu sunucular oturum kapanınca yine durabilir. Kendiniz başlatmak için iki ayrı terminalde şunları çalıştırın:
  - API: `apps/api` klasöründe `npx tsx watch --env-file=../../.env src/server.ts`
  - Web: `apps/web` klasöründe `npm run dev`

### Son güvenlik incelemesi
**Yeniden doğrulanan alanlar:**
- zorunlu RLS ve şirket bazlı bileşik yabancı anahtarlar;
- hazır roller ve özel rollerin korunması;
- kurumsal izolasyon (başka şirketin gerçek kimliği 404 döner);
- kişi ve sürücü ilişkileri;
- M1 müşteri kaydının korunması;
- M2 belge yetkilerinin atlatılamaması;
- vergi kimliği mükerrerlik kontrolleri;
- günlüklerde ve işlem geçmişinde kişisel veya hassas değer olmaması;
- arşivleme ve geri alma;
- eşzamanlı düzenleme ve bağlama;
- M2'deki günlük 600 deneme sınırının şirketler arası doğru çalışması.

**Sonuç:** kritik bulgu yok. Tek eksik, yukarıdaki onay kaydıydı ve düzeltildi.

### Git
- Birleştirmeden önce iki çalışma alanı da temizdi; `main`, `kurumsal-m3`'ün atasıydı.
- Birleştirme yalnız ileri sarma ile yapıldı: `3bda9dd → 1cbcb57`. Bu rapor da aynı yolla eklendi.
- Push yapılmadı. `kurumsal-m3` dalı ve `acarvo-m3` klasörü korunuyor.

### Ana veritabanı geçişi (22 → 24)
- **Öncesi:**
  - `--verify`: yalnız 2 bekleyen migration;
  - önizleme: `0022`, `0023`;
  - SQL: yalnız yeni tablolar, kurallar, tetikleyiciler ve yetkiler; mevcut veride değişiklik yok;
  - parmak izleri salt okunur kaydedildi.
- **Doğrulanmış yedek:** `C:\Users\soena\Desktop\acarvo\backups\2026-10-13-01-28-46`.
- **Uygulama:** safe-migrate durmadan geçti; ardından `--verify`: "sorun yok" (36 tablo, 32'sinde zorunlu RLS).
- **Migration kayıtları:** 24 kaydın tamamı dosya özetleriyle uyumlu; `0022` ve `0023`'ün özetleri test veritabanındakiyle aynı.
- **Mevcut veriler:**
  - müşteri kaydı (Drina, 1) içerik özetiyle aynı;
  - şubeler ve numara sayaçları aynı;
  - araçlar, fotoğraflar, dosyalar, araç belgeleri, km ve konum kayıtları, kullanıcılar ve şirketler değişmedi.
- **Beklenen değişiklikler:**
  - Rollere yalnız ekleme yapıldı, hiç yetki silinmedi:

    | Rol | Eklenen |
    |---|---|
    | Sahip | `corporate.read`, `corporate.manage` |
    | Yönetici | `corporate.read`, `corporate.manage` |
    | Operasyon | `corporate.read` |

  - Her şirkete 3 "rol yükseltme" geçmiş kaydı düştü.
  - 5 yeni tablo, 20 politika, 15 yetki ve 22 indeks eklendi.
- **Örnek veri:** ana veritabanına sentetik kurumsal hesap eklenmedi.

### Testler (yalnız `acarvo_test`)

| Ne zaman | API | Tarayıcı | Tip denetimi ve derleme |
|---|---|---|---|
| Birleştirmeden önce, M3 dalında | 335/335 | 83 geçti, 18 isteğe bağlı atlandı | Hatasız |
| Birleştirmeden sonra, main'de | 335/335 | 83 geçti, 18 isteğe bağlı atlandı | Hatasız |

- **Main'de API testleri:** ilk denemede 24 test dosyasının hiçbiri yüklenemedi ("no tests"). Çıktıda hata ayrıntısı yoktu; birleştirmeden hemen sonra derleme önbelleği yenileniyordu. İkinci çalıştırmada 335/335 geçti.
- **Ekran görüntüleri:** main kodunda yeniden üretildi (1440 / 768 / 390, 42 görüntü) ve incelendi. Taşma yok, düzen bozulması yok.
