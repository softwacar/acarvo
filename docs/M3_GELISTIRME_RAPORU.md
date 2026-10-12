# ACARVO — M3 Geliştirme Raporu (Kurumsal Hesaplar)

**Dal / klasör:** `kurumsal-m3` / `C:\Users\soena\Desktop\acarvo-m3`. Başlangıç noktası `main` `3bda9dd`.
**Durum:** M3 tamamlandı ve yalnız test veritabanında (`acarvo_test`) çalışıyor. Main'e birleştirilmedi, ana veritabanına uygulanmadı, push yapılmadı.
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
