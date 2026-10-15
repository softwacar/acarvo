# ACARVO — Finans + Tahsilat + Depozito V1 Geliştirme Raporu

Tarih: 14.10.2026 · Dal: `finans-v1` (çalışma kopyası `C:\Users\soena\Desktop\acarvo-fin1`) · Temel: main `67c0eb7` · Plan: `docs/FINANS_YONETIMI_V1_PLANI.md`

Durum: **main'e entegre edildi; ana veritabanı 37 migration** (ayrıntılar en sondaki "Son inceleme ve main entegrasyonu" bölümünde). GitHub'a gönderilmedi, `.env` değiştirilmedi. Gerçek para hareketi, kart verisi, ödeme sağlayıcısı, resmî fatura, vergi beyannamesi veya muhasebe entegrasyonu yok. Otomatik testler yalnız `acarvo_test` üzerinde, sentetik verilerle çalıştı.

Finans modülünün tamamlanması gerçek işletme kullanımına hazır olunduğu anlamına gelmez: şube ülkeleri boş, M2 gerçek anahtarları kurulmadı, ülke belge kuralları etkin değil, dış sözleşme/fiyat modu kapalı, sözleşme metinleri hukuki onay ve vergi kuralları mali onay bekliyor. Bu engellere dokunulmadı.

---

## 1. Tamamlanan finans özellikleri

- **Kiralama finans dosyası:** kiralama başına bir dosya; işlem para birimi ve ödeme sorumlusu (müşteri veya kiralamanın kurumsal hesabı) personel tarafından açıkça seçilir ve değişmez. Durum: Açık → Finansal olarak kapandı → (gerekçeyle) Yeniden açıldı.
- **İç hesap kalemleri:** kayıtlı ve güncel fiyat teklifinden (teklif başına bir kez) veya gerekçeli ek kalem olarak hazırlanır; "onay bekliyor" olarak oluşur; araç teslim edildikten sonra **başka bir yetkili** onaylayınca "kayıtlı" olur; reddedilebilir; kayıtlı kalem gerekçeli ters kayıt isteği + başka bir yetkilinin onayıyla ters kaydedilir.
- **Tahsilatlar:** nakit (açık "nakdi kendim teslim aldım" beyanı), banka transferi bildirimi, harici POS kaydı, diğer harici yöntem; harici referans (aynı yöntemde geçerli kayıtlar arasında tekil); kart numarasına benzeyen referans reddedilir; ödeyen (müşteri, sürücü, kurumsal hesap veya adıyla başka kişi/kurum) sorumludan ayrı; **kaydedildi → başka bir yetkili doğrular** (yalnız doğrulanan bakiyeden düşer) / reddedilir; doğrulanmış kayıt gerekçeli ters kaydedilir; kısmi tahsilatlar; fazla tahsilat engeli; tekrar gönderim güvenli.
- **Depozitolar:** kendi para biriminde; talep edildi → alındığı bildirildi (yöntem, referans, nakit beyanı) → başka bir yetkili doğrular (tutuluyor) / reddedilir; talep iptali; inceleme (ihtilaf) işareti; kısmen / tamamen iade edildi görünümü.
- **Depozito iadeleri:** talep (tutar, yöntem, gerekçe) → başka bir yetkilinin onayı → "iadenin yapıldığı bildirildi" (harici referans veya nakit beyanı) / red / iptal; tamamlanan iade gerekçeli ters kaydedilir (tutar yeniden tutulan depozitoya döner).
- **Finansal kapanış:** yalnız bakiye sıfırken, bekleyen kalem/tahsilat/depozito/iade yokken ve depozitolar çözülmüşken; kapalı dosyada hiçbir değişiklik yapılamaz; yeniden açma gerekçe ister. Kiralamanın operasyonel kapanışından bağımsızdır.
- **Finans geçmişi:** her adım (tür, kayıt numarası, önceki/yeni durum, tutar, para birimi, kim, ne zaman) yalnız eklenebilir olay tablosunda ve işlem geçmişinde; kişisel veri yok.
- **Finans merkezi:** para birimi başına genel görünüm, bekleyen doğrulamalar, tahsilatlar, depozitolar, depozito iadeleri, kiralama finans dosyaları, işlem geçmişi; arama, tarih aralığı, şube, para birimi, durum, yöntem, sıralama, sayfalama.
- **Cari görünümler:** Müşteri 360° ve Kurumsal Hesap 360° "Cari" sekmeleri.
- **Kiralama 360° Finans sekmesi** ve iade bilgileriyle "Finansal değerlendirme gerekli" uyarısı.

## 2. Finansal veri modeli (6 tablo, yalnız `acarvo_test`)

| Tablo | İçerik |
|---|---|
| `rental_finances` | Kiralama başına dosya: para birimi, sorumlu türü ve kaydı, durum, kapatan/zaman, yeniden açma gerekçesi, sürüm |
| `finance_charges` | `H-000001`: tür (teklif/ek), teklif bağlantısı, açıklama, tutar/net/vergi/vergi durumu, durum, hazırlayan/onaylayan, ters kayıt isteyen/onaylayan, gerekçeler, istek kimliği |
| `finance_payments` | `T-000001`: yöntem, para birimi, tutar, ödeyen, harici referans, tahsilat zamanı, şube, not, nakit beyanı, durum, kaydeden/doğrulayan, ters kayıt |
| `finance_deposits` | `D-000001`: para birimi, tutar, yöntem, referans, nakit beyanı, şube, durum, inceleme işareti/nedeni, bildiren/doğrulayan |
| `finance_deposit_refunds` | `DI-000001`: tutar, yöntem, gerekçe, durum, talep eden/onaylayan/bildiren, referans, nakit beyanı, ters kayıt |
| `finance_events` | Yalnız ekleme: tür, kayıt, önceki/yeni durum, tutar, para birimi, aktör, zaman, istek kimliği |

Tüm tutarlar ISO para biriminin en küçük biriminde tamsayı (`bigint`). Hiçbir finans kaydı silinemez; tutar, para birimi, taraflar ve kaynaklar değişmez; düzeltmeler yalnız izlenebilir durum geçişleridir (önceki durum ve aktör olayda kalır).

## 3. Tahsilat iş kuralları

- Kayıt bir personel beyanıdır; **doğrulanana kadar bakiyeden düşmez**. Doğrulayan kaydedenle aynı kişi olamaz (API + veritabanı).
- Nakit yalnız açık beyanla; banka transferi ve harici POS yalnız harici referansla; ACARVO kart tahsilatı yapmaz, POS kaydı "ACARVO kart tahsilatı" gibi gösterilmez.
- Aynı yöntemde aynı harici referans ikinci kez geçerli tahsilat olamaz (reddedilen/ters kaydedilen kaydın referansı serbest kalır).
- Tahsilat para birimi = dosya para birimi; kur dönüşümü yok.
- Kaydedilmiş + doğrulanmış tahsilat toplamı, onay bekleyen + kayıtlı kalemleri aşamaz (fazla tahsilat engeli; dosya satırı kilitlenerek eşzamanlı isteklerde de).
- Ters kayıt yalnız doğrulanmış kayıtta, gerekçeyle; ilk kayıt geçmişte kalır. Ters kayıt sonrası oluşan fazlalık "Fazla tahsilat (iade adayı)" olarak gösterilir, negatif borç diye gizlenmez.
- `requestId` ile ağ hatası sonrası tekrar gönderim aynı kaydı döndürür.

## 4. Depozito iş kuralları

- Depozito kira geliri, ön ödeme, tahsilat, hasar bedeli veya banka provizyonu değildir; kendi para biriminde, dosya bakiyesinden ayrı izlenir.
- "Harici kart blokesi (personel beyanı)" yalnız personel blokeyi harici sistemde gerçekten yaptıysa ve referansla seçilir; ACARVO hiçbir yerde "Provizyon alındı" demez.
- Alınmamış (doğrulanmamış) depozito iade edilemez; iade talepleri + onaylılar + tamamlananlar toplamı doğrulanmış tutarı aşamaz (depozito satırı kilitlenir; eşzamanlı iki talepten biri reddedilir).
- İnceleme (ihtilaf) sırasında iade talep edilemez ve onaylanamaz; hasar bulgusu nedeniyle otomatik kesinti yoktur; depozitodan kira bedeline mahsup (spec'teki "Deposit Applied") V1'de yoktur (FN4).
- İade onayı paranın gönderildiği anlamına gelmez; "iadenin yapıldığı bildirildi" bir personel bildirimidir, banka/POS doğrulaması değildir.

## 5. Para birimi yaklaşımı

- Fiyatlandırmadaki aynı altyapı (`packages/shared/src/money.ts`): ISO 4217 kodları ve küsurat basamakları (0/2/3/4), kesin ondalık ayrıştırma (`parseAmount`, kayan nokta yok), tutar gösteriminde her zaman ISO kodu.
- Tutarlar istemciden metin olarak gelir ve sunucuda kaydın para birimine göre kesin ayrıştırılır (ör. EUR'da `10,005` reddedilir).
- Toplamlar BigInt ile; her toplam tek bir para biriminde. Dosya bakiyesi dosya para biriminde; depozitolar kendi para birimlerinde; Finans merkezi ve cari görünümler her para birimi için ayrı satır/kart gösterir; EUR ve BAM hiçbir yerde toplanmaz. Kur kaynağı olmadığı için hiçbir dönüşüm yapılmaz (FN3).

## 6. Finansal tutarlılık garantileri

| Risk | Koruma |
|---|---|
| Aynı tahsilatın iki kez kaydı | `requestId` tekil (veritabanı) + yeniden gönderimde aynı yanıt |
| Aynı harici referansın ikinci tahsilat sayılması | Yöntem + referans için geçerli kayıtlar arasında kısmi tekil indeks |
| İki personelin aynı anda tahsilat girmesi | Fazla tahsilat kuralı dosya satırını kilitleyerek tetikleyicide (testte eşzamanlı iki ödemeden biri 409) |
| Aynı kaydın iki kez doğrulanması | Sürüm kontrolü + satır kilidi + yalnız ileri durum geçişi (testte eşzamanlı iki doğrulamadan biri 409) |
| Aynı depozitoya eşzamanlı iki iade | Depozito satırı kilidi + toplam kuralı tetikleyicide |
| İptal/reddedilmiş kaydın tekrar kullanılması | Son durumlardan geri dönüş yok (tetikleyici) |
| Kendi kaydını onaylama | Dört göz kontrolleri (API + veritabanı `CHECK`) |
| Kapalı dosyada değişiklik | Tüm alt kayıtlar dosyanın açık olmasını şart koşar (tetikleyici) |
| Yarıda kalan işlem | Her işlem tek veritabanı işlemi; hata olursa hiçbiri yazılmaz |
| Yetkinin işlem sırasında kaldırılması | Her istekte yetki yeniden okunur; veritabanı kuralları yetkiden bağımsız |
| Tutarın sessizce değişmesi | Tutar, para birimi, taraflar değişmez (tetikleyici, her rol için); silme yok |
| Farklı para birimlerinin karışması | Tahsilat ve kalem dosya para biriminde (tetikleyici); toplamlar para birimi başına |

## 7. RBAC ve RLS

- **İzinler (preset geçmişi v10):** `finance.read`, `finance.payments.record`, `finance.payments.verify`, `finance.charges.manage`, `finance.charges.approve`, `finance.deposits.record`, `finance.deposits.verify`, `finance.refunds.request`, `finance.refunds.approve`, `finance.reports.read`, `finance.close`.
- **Sahip:** tümü. **Yönetici:** tümü (dört göz için ikinci yetkili). **Operasyon:** yalnız görüntüleme (şube kapsamındaki kiralamalar), tahsilat kaydı, depozito kaydı ve iade talebi; doğrulama, onay, rapor/merkez ve kapanış yok. Özel rollere dokunulmadı.
- **RLS:** 6 tablonun hepsinde zorunlu RLS + 4 politika; tüm şirket bağlantılı yabancı anahtarlar bileşik `(company_id, …)`. Uygulama rolünde DELETE yok; olaylarda UPDATE yok. Başka şirketin kayıt kimliğini bilmek erişim sağlamaz (404); hata mesajları başka şirketteki varlığı açıklamaz.
- **Şube kapsamı:** okuma kiralamanın başlangıç/planlanan/gerçek iade şubesine göre; tüm finans yazma işlemleri kiralamanın başlangıç şubesinin kullanıcının kapsamında olmasını ister. Merkez listeleri de kullanıcının şube kapsamıyla sınırlıdır.

## 8. Finans ekranları

- `/finans` — Genel görünüm (para birimi kartları: doğrulanmış/bekleyen tahsilat, kayıtlı/bekleyen kalem, kalan, tutulan/bekleyen depozito, iadeler, yönteme göre doğrulanmış tahsilat), Bekleyen doğrulamalar, Tahsilatlar, Depozitolar, Depozito iadeleri, Kiralama finans dosyaları, İşlem geçmişi. Operasyon için "Erişim yetkiniz yok" ve yönlendirme.
- Kiralama 360° → **Finans**; Müşteri 360° ve Kurumsal Hesap 360° → **Cari**.
- Her para adımı açık bir onay penceresiyle: ne olacağı cümleyle ve tutar/para birimi/kişi özetiyle yazılır; mobilde düğmeler görünür alanda, yanlışlıkla onay olmaz.
- Sahte gelir veya tahsilat gösterilmez; kayıt yoksa "Kayıt yok" / "Finans dosyası açılmadı" yazar.

## 9. Kiralama entegrasyonu

- Teklif, teslim, iade veya kiralama kapanışı **hiçbir finans kaydı oluşturmaz** (testli). Teklif yalnız yetkili personelin açık işlemiyle "onay bekleyen iç hesap kalemi"ne dönüşür; teklif güncel değilse (plan, sınıf, ek sürücü değişti) veya para birimi farklıysa reddedilir.
- Teklif tutarı, iç hesap tutarı, doğrulanmış ve doğrulama bekleyen tahsilat, tutulan depozito, iade edildiği kaydedilen tutar ve "Resmî fatura: ACARVO'da yok" ayrı gösterilir.
- İade sonrası gerçek iade saati, gecikme, km farkı, yakıt ve yeni hasar bulguları finans sekmesinde; gecikme/yakıt farkı/bulgu varsa "Finansal değerlendirme gerekli". Bu kalemler otomatik ücret olmaz (FN6); gerekirse gerekçeli ek kalem + ikinci onay.
- Ödeme veya depozito kaydı teslimi açmaz, sözleşmeyi imzalı göstermez; araç uygunluk koruması ve K1 dış süreç modu (varsayılan kapalı) değişmedi.

## 10. Müşteri / cari hesap entegrasyonu

- Müşteri cari: kiracı olduğu veya ödeme sorumlusu olduğu dosyalar; **toplamlar yalnız sorumlusu müşteri olan dosyalardan**; kurumsal sorumlu dosyalar "toplamlara katılmaz" diye işaretli; başkasının kiralaması için yaptığı ödemeler ayrı bölümde.
- Kurumsal cari: hesaba bağlı kiralamalar; toplamlar yalnız sorumlusu bu hesap olan dosyalardan.
- Kurumsal hesapla ilişkili olmak kişinin kişisel işlemlerini hesaba taşımaz; tek bir teklif veya iç kayıt "hukuken geçerli borç" olarak sunulmaz; ekranlar "resmî cari ekstre değildir" der.

## 11. API uçları

| Uç | Yetki |
|---|---|
| `GET /api/rentals/:id/finance` | `finance.read` + `rentals.read` |
| `POST /api/rentals/:id/finance/open` | kayıt izinlerinden biri |
| `POST /api/rentals/:id/finance/charges` · `POST /api/finance/charges/:id/{approve,reject,reversal-request,reversal-approve,reversal-withdraw}` | `finance.charges.manage` / `finance.charges.approve` |
| `POST /api/rentals/:id/finance/payments` · `POST /api/finance/payments/:id/{verify,reject,reverse}` | `finance.payments.record` / `.verify` / `finance.charges.approve` (ters kayıt) |
| `POST /api/rentals/:id/finance/deposits` · `POST /api/finance/deposits/:id/{report,verify,reject,cancel,review}` | `finance.deposits.record` / `.verify` |
| `POST /api/finance/deposits/:id/refunds` · `POST /api/finance/refunds/:id/{approve,reject,cancel,complete,reverse}` | `finance.refunds.request` / `.approve` |
| `POST /api/rentals/:id/finance/{close,reopen}` | `finance.close` |
| `POST /api/finance/{payments,deposits,refunds,files,events}/search` · `GET /api/finance/pending` · `POST /api/finance/summary` | `finance.reports.read` |
| `GET /api/customers/:id/finance` · `GET /api/corporate-accounts/:id/finance` | `finance.read` + müşteri/kurumsal okuma |

Tüm değişiklikler sürüm ve `requestId` taşır; Origin/CSRF ve oturum kontrolleri genel koruma katmanında.

## 12. Yeni migration dosyaları (yalnız `acarvo_test`'e uygulandı)

| Dosya | İçerik |
|---|---|
| `0034_finance.sql` (63 ifade) | 6 tablo, indeksler, bileşik yabancı anahtarlar; sıra türleri `finance_charge/payment/deposit/refund` (mevcut tabloda tek değişiklik: sıra türü kontrolünün genişletilmesi) |
| `0035_finance_rls.sql` (18 ifade) | RLS, yaşam döngüsü/dört göz/bakiye/iade sınırı/değişmezlik tetikleyicileri, silme yasağı, yetkiler |

`acarvo_test`: 36 migration; 36 dosyanın SHA-256 özeti veritabanındakiyle aynı (0009 ve 0017 yalnız bilinen satır sonu farkı); boş/yarım migration yok; eski migration'larda değişiklik yok; `safe-migrate --verify --test` sorun yok (65 tablo, 61'i RLS'li).

## 13. API test sayısı

**475 / 475 geçti** (önce 453): yeni `finance.test.ts` 21 test, `finance-performance.test.ts` 1 test; iki eski beklenti ("finans tablosu yok") "kapanış/teklif hiçbir finans kaydı üretmez" kontrolüne çevrildi. Bir tam çalıştırmada performans testi makine yükü altında süre eşiğini aştı; eşik 3 sn'ye çekildi (ölçülen değerler 15–116 ms) ve takım yeniden 475/475 geçti.

Kapsanan başlıca senaryolar: önayar izinleri; teklif/teslim/kapanışın finans kaydı üretmemesi; dosya açma (açık seçim, tekil, tekrar güvenli); tekliften tek kalem; dört göz (kalem, tahsilat, depozito, iade, ters kayıt); teslim edilmemiş kiralamada kalem onayının reddi; kesin tutar ayrıştırma; nakit beyanı; kart numarası reddi; tekrar gönderim; eşzamanlı çift doğrulama; harici referans tekrarı; eşzamanlı fazla tahsilat; ret/ters kayıt; veritabanı değişmezliği ve silme yasağı; para birimi uyuşmazlığı; depozito talep/bildirim/doğrulama; doğrulanmamış depozitonun iadesinin reddi; fazla iade ve eşzamanlı iade; iade onayı/tamamlama/ters kayıt; inceleme sırasında iade engeli; kalem ters kaydı ve fazla tahsilat gösterimi; kapanış engelleri, kapalı dosyada değişiklik reddi, gerekçeli yeniden açma; şirket izolasyonu (API ve doğrudan veritabanı); şube kapsamı; Operasyon'un merkez erişimi olmaması; listeler, bekleyen kuyruk ve para birimi başına özet; müşteri/kurumsal cari ayrımı; olaylarda, işlem geçmişinde ve sunucu günlüklerinde kişisel/kart verisi olmaması.

## 14. Tarayıcı test sayısı

**118 test** (önce 113) + 30 isteğe bağlı ekran görüntüsü testi (önce 27). Son tam çalıştırma: 117 geçti, 1 zaman aşımı (`company.spec` — finansla ilgisiz; tek başına tekrar çalıştırıldığında 6/6 geçti). Önceki bir tam çalıştırmada görülen 3 hata sıralamaya bağlı veri etkileşimiydi (finans testinin fiyat listesi önceliği ve K-000002 teklif beklentisi) ve düzeltildi.

Yeni: `finance.spec.ts` (3 akış: dosya + tekliften kalem + ikinci yetkili onayı + nakit tahsilat + doğrulama; depozito + iade onayı + iade bildirimi; finans merkezi, filtreler, müşteri carisi, Operasyon'un merkez erişimi olmaması — hepsinde erişilebilirlik denetimi), `finance.mobile.spec.ts` (390 px), isteğe bağlı `finances-screens.spec.ts` (3 genişlik). E2E sıfırlamasına dört göz için sentetik bir Yönetici test kullanıcısı eklendi (yalnız `acarvo_test`). Eski beklentiler: Müşteri/Kurumsal "Cari" sekmesinin artık gerçek olması, kiralama sekme turuna Finans.

## 15. Performans ölçümleri

3.000 sentetik kiralama + finans dosyası, 3.000 kalem, 9.000 tahsilat (iki para birimi), 3.000 depozito, 1.500 iade, 9.000 olay — tüm veritabanı kuralları bu eklemelerde çalıştı. Tek istek süreleri (ms):

| İşlem | ms |
|---|---|
| Tahsilatlar, ilk sayfa (9.000 içinde) | 72 |
| Tahsilatlar, EUR, tutara göre, sayfa 100 | 61 |
| Kiralama numarasıyla arama | 38 |
| Depozitolar / iadeler, ilk sayfa | 28 / 36 |
| Bekleyen doğrulamalar | 116 |
| Para birimi başına özet | 84 |
| Kiralama finans dosyaları | 50 |
| İşlem geçmişi | 89 |
| Kiralama finans görünümü | 18 |
| Müşteri carisi (250 dosya) | 55 |

Sayfalı listeler sayım + tek sayfa sorgusu; ayrıntılar sabit sayıda sorgu (N+1 yok). İndeksler: dosya/kiralama, durum + zaman, ödeyen, yöntem + referans, istek kimlikleri. Not: "Kiralama finans dosyaları" listesi en fazla 500 dosyayı sıralayıp sayfalar (V1 sınırı; daha büyük hacimde sunucu tarafı sayfalama gerekir).

## 16. Görsel kontrol sonuçları

`apps/e2e/screenshots/fin1/` (Git dışında; `SCREENSHOTS=1 npx playwright test finance.spec finances-screens`), 1440 / 768 / 390: genel görünüm, bekleyen, tahsilatlar, depozitolar, iadeler, dosyalar, geçmiş, kiralama finans sekmesi, tahsilat penceresi, müşteri carisi. Hepsi incelendi; yatay taşma yok; erişilebilirlik denetiminde ciddi/kritik ihlal yok. İncelemede düzeltilenler: tamamen iade edilmiş depozitonun "Doğrulandı (tutuluyor)" görünmesi (artık "Tamamen/Kısmen iade edildiği kaydedildi"), gecikmiş ama iade edilmemiş kiralamada "Gecikme: Yok" yazması (artık "Planlanan iade geçti"), sıfır tutarların renkli gösterilmesi. V5 tasarım dili korundu. Ana JS paketi main'e göre ~+8 kB (finans ekranları ayrı yüklenir).

## 17. Git commit'leri (`finans-v1`)

| Commit | İçerik |
|---|---|
| `4fdc489` | Plan, veri modeli 0034/0035, izinler (v10) |
| `c1707ae` | API ve API testleri |
| `efcb717` | Ekranlar, tarayıcı testleri, performans testi |
| (son commit) | Eski beklentilerin güncellenmesi, sıralamadan bağımsız testler, paket bölme düzeltmesi, görsel düzeltmeler, bu rapor |

## 18. Ana veritabanının korunma durumu

Ana veritabanına bağlanılmadı; migration uygulanmadı (34'te); örnek finans hareketi eklenmedi; gerçek müşteri, araç, rezervasyon, kiralama veya fiyat kaydı değiştirilmedi. Ana sunucular main kodundan çalışmaya devam ediyor.

## 19. Açık kalan ürün kararları (güvenli tarafta uygulandı)

- **FN1** Her tahsilat (nakit dahil) kaydeden dışında bir kişi tarafından doğrulanır; tek personelli şube istisnası yok.
- **FN2** Teklif kalemi yalnız teslimden sonra onaylanır (spec §67); teslim öncesi ödemeler onay bekleyen kalem tutarına kadar kaydedilebilir (avans).
- **FN3** Tahsilat yalnız dosya para biriminde; farklı para biriminde tahsilat kur masası (Yönetim → Ayarlar → Döviz Kurları) gelene kadar kapalı.
- **FN4** Depozitodan mahsup (Deposit Applied) ve hasar/ceza kesintisi yok.
- **FN5** Ödeme sorumlusu dosya açılırken seçilir, değişmez; kurumsal alacak devri yok.
- **FN6** Gecikme, km, yakıt, hasar ücretleri hesaplanmaz; yalnız gerekçeli ek kalem.
- **FN7** Taksit/ödeme planı, şube kasaları (spec'te ayrı "Şube Kasaları" ekranı), iç tahsilat dökümü PDF'i bu sprintte yok.
- Ters kayıt (tahsilat) için ikinci kişi şartı yok (onay yetkisi + gerekçe yeterli); kalem ters kaydı dört göz ister.

## 20. Hukuki ve vergisel bağımlılıklar

- Resmî fatura, e-fatura/e-arşiv, mali cihaz/fiskal belge, ülkeye özgü zorunlu belgeler: hukuki/mali onay ve ayrı geliştirme gerekir; ACARVO kayıtları bunların yerine geçmez.
- Vergi oranları ve uygulaması (fiyatlandırmadan gelen) mali onay bekliyor; vergisi yapılandırılmamış kalemler "net" olarak işaretli.
- Depozito, kesinti, ceza ve hasar bedelleri için sözleşme hükümleri ve hukuki onay.
- Nakit işlemler için kasa/vardiya mutabakatı (Şube Kasaları) ve muhasebe kayıtlarına aktarım kuralları.

## 21. Main'e geçiş gereksinimleri

1. FN1–FN7 kararlarının onayı.
2. Tam API ve tarayıcı testleri, TypeScript ve derleme (bu raporda yapıldı) main üzerinde tekrar.
3. `safe-migrate` ile doğrulanmış yedekten sonra ana veritabanına 0034–0035 (beklenen 36); geçişten sonra veri parmak izi karşılaştırması.
4. Preset v10 yükseltmesinin yalnız değiştirilmemiş Sahip/Yönetici/Operasyon rollerine finans izinleri eklediğinin kontrolü.
5. Ana veritabanında dört göz için en az iki yetkili kullanıcı (Sahip + Yönetici) bulunması; aksi halde doğrulama/onay yapılamaz.
6. Ana sunucular birleştirmeden önce durdurulmalı, sonra main kodundan başlatılmalı.

## 22. Gelecekteki ödeme sağlayıcısı entegrasyonları

Mimari hazır: tahsilat yöntemi, harici referans ve "kaydedildi → doğrulandı" ayrımı bir sağlayıcı webhook'unun doğrulamayı otomatik vermesine uygun; kart verisi hiçbir zaman ACARVO'ya gelmemeli (sağlayıcının barındırılan ödeme sayfası / tokenizasyon). Sırası: sağlayıcı seçimi ve sözleşmesi → PCI kapsamı değerlendirmesi → test ortamında webhook imza doğrulaması → idempotent "sağlayıcı doğruladı" durumu → iade API'si (depozito iadesi tamamlandı bildiriminin yerine) → mutabakat raporu. Bu sprintte hiçbir entegrasyon yapılmadı ve arayüzde varmış gibi gösterilmiyor.

---

## Son inceleme ve main entegrasyonu (15.10.2026)

### 1. FN1–FN7 kararları

| Karar | Durum |
|---|---|
| FN1 Tahsilat doğrulama | Uygulandı. Nakit dahil her tahsilatı kaydedenden farklı bir yetkili doğrular (API + PostgreSQL `CHECK`). Nakitte kaydedenin açık beyanı; kayıt ve doğrulama ayrı kullanıcı ve zamanla saklanır. Durum adı "Yetkili doğruladı"dır; doğrulama penceresi bunun personel doğrulaması olduğunu, ACARVO'nun banka veya sağlayıcıyla doğrulama yapmadığını yazar. "Banka tarafından doğrulandı" ifadesi yok. Bu incelemede eklendi: doğrulanmış tahsilatın ters kaydı da kaydedenden farklı biri tarafından yapılır (0036). |
| FN2 İç hesap onayı | Uygulandı. Teslim öncesi teklif görülür, dosya açılır, kalem hazırlanır ve onay bekleyen kalem tutarına kadar ödeme bildirimi kaydedilir; kalem yalnız teslimden sonra ikinci yetkiliyle onaylanır. Teklif ve iç hesap resmî fatura veya kesin borç olarak gösterilmez. |
| FN3 Para birimleri | Uygulandı. Tahsilat dosya para biriminde; depozito kendi para biriminde; dönüşüm yok; toplamlar para birimi başına; 0/2/3 küsurat testli. |
| FN4 Depozito kesintisi | Uygulandı. Otomatik kesinti/mahsup yok; bakiye ve eşzamanlı iade koruması korunuyor. |
| FN5 Ödeme sorumlusu | V1'de güvenli düzeltme akışı yok: sorumlu ve dosyanın hareketleri veritabanında değiştirilemez/taşınamaz (testli). Yanlış sorumlu seçilmişse hareketler başka hesaba taşınamaz; düzeltmenin hukuki/muhasebe sonucu belirlenince ayrı, onaylı bir akış gerekir. |
| FN6 Ek ücretler | Uygulandı. Otomatik ücret yok; iade bilgileri ve "Finansal değerlendirme gerekli" gösteriliyor; sistemin oluşturduğu kalem olmadığı testli. |
| FN7 Ertelenenler | Taksit, şube kasası, iç makbuz PDF, ödeme sağlayıcısı, banka mutabakatı, resmî fatura, muhasebe entegrasyonu yapılmadı ve arayüzde varmış gibi gösterilmiyor. |

### 2. Son finansal doğruluk denetimi

- **Bulunan ve düzeltilen:** Hiç onaylı kalemi olmayan (fiyatlandırılmamış) bir dosya bakiye "sıfır" olduğu için kapatılabiliyordu. Artık en az bir kayıtlı kalem olmadan finansal kapanış yok (API engeli "Onaylanmış iç hesap kalemi yok" + veritabanı kuralı `rental_finances_close_unpriced`).
- **Bulunan ve düzeltilen:** Tahsilat ve depozito iadesi ters kayıtlarında dört göz yoktu; artık ters kaydı ilk kaydı yapan/iadeyi bildiren kişi yapamaz (API + `CHECK`).
- Tahsilat: çift kayıt (`requestId`), harici referans tekrarı, eşzamanlı çift doğrulama, kendi kaydını doğrulama, işlem sırasında yetki kaldırma (yeni test), bekleyenin doğrulanmış toplama girmemesi, kısmi tahsilat ve fazla tahsilat engeli testli.
- Depozito: alınmamış depozitonun iadesi, fazla iade, eşzamanlı iade, inceleme sırasında iade, talep / onay / bildirim ayrımı, "onay = para gönderildi" varsayılmaması, tam iade edilmişin "tutuluyor" görünmemesi testli veya ekranda doğrulandı.
- İç hesap: teklif otomatik borca dönüşmez; onay bekleyen kalemler kayıtlı tutardan ayrı gösterilir; ters kayıt ilk kaydı silmez ve ikinci yetkili ister; aynı kalem iki kez onaylanamaz; kapalı dosya değişmez; yeniden açma gerekçe ve yetki ister.
- Kapanış: bakiye = kayıtlı kalemler − doğrulanmış tahsilat; bekleyen tahsilatlar ve iadeler kapanışı engeller; depozito gelir sayılmaz; fiyatlandırılmamış dosya kapanmaz.
- Para birimi: tamsayı küsurat birimi + BigInt; karışma yok; negatif depozito/bakiye oluşmaz (fazla tahsilat ayrı gösterilir); yuvarlama yalnız fiyatlandırmada, kayıtlar arasında yeniden hesaplanmaz.

### 3. Şirket, şube ve yetki

- Yeni test: yalnız SJJ şubesine bağlı, Yönetici izinli sentetik bir kullanıcı, SAC kiralamasında **her** finans işlemini (görüntüleme, kalem onayı, tahsilat doğrulama, ters kayıt, depozito incelemesi, iade talebi ve onayı, kapanış, yeniden açma, kalem hazırlama) deniyor: hepsi 403/404, hiçbir kayıt değişmiyor.
- Başka şirket: kimlik bilmek erişim vermez (testli); RLS ve bileşik yabancı anahtarlar eksiksiz; Operasyon onay yetkisi almıyor; özel rollere dokunulmadı.

### 4. Gerçek yetkili kullanıcı sayısı (ana veritabanı, yalnız okuma)

| Şirket | Üyeler | Finans adımları |
|---|---|---|
| Drina Rent a Car | 1 Sahip, 1 Operasyon | Tahsilat ve depozito doğrulaması mümkün (Operasyon kaydeder, Sahip doğrular); depozito iadesi talep/onay mümkün. **İç hesap kalemi onayı, kalem ters kaydı ve iade bildirimi sonrası ters kayıt için ikinci yetkili yok** → gerçek kullanımdan önce ikinci bir Sahip/Yönetici gerekir. |
| Neretva Rent | 1 Sahip, 1 Yönetici | Tüm dört göz adımları mümkün. |

Dört göz kuralı gevşetilmedi; kullanıcı veya rol eklenmedi; test kullanıcısı ana veritabanına taşınmadı.

### 5. Tarayıcı zaman aşımı

İki ayrı tam çalıştırmada farklı testlerde zaman aşımı görüldü (önce `company.spec`, sonra üç `a11y.spec` testi); hepsi gezinme/sayfa yükleme beklemesinde ve makine yük altındayken (ikincisinde eşzamanlı üretim derlemesi çalışıyordu). Önceki testlerle birlikte iki kez tekrar üretme denemesi 29/29 geçti; ortak bir kod yolu veya yarış durumu bulunmadı; zaman aşımı süreleri artırılmadı. Yanında başka iş yokken baştan çalıştırılan tam paket **118/118 geçti**. Ayrıca tam API takımı bir kez geç bitti (639 sn) ama 480/480 geçti; Vitest çalıştırıcı sorunu gözlenmedi.

### 6. Son test sayıları ve kontroller

- API: **480 / 480** (inceleme testleri dahil).
- Tarayıcı: **118 / 118** temiz tam çalıştırma (+30 isteğe bağlı ekran görüntüsü testi).
- TypeScript (4 proje) ve üretim derlemesi: hatasız.
- Ekranlar 1440 / 768 / 390'da yeniden üretildi ve incelendi.

### 7. Migration'lar

`0034_finance.sql`, `0035_finance_rls.sql`, `0036_finance_review.sql` (iki dört göz `CHECK`'i ve kapanış kuralının yeni hali). `acarvo_test` 37 migration; özetler dosyalarla aynı; boş/yarım migration yok; eski dosyalar değişmedi; yalnız eklemeler (mevcut tabloda tek değişiklik sıra türü kontrolünün genişletilmesi).

### 8. Main entegrasyonu

| Konu | Sonuç |
|---|---|
| Git | İki çalışma ağacı temizdi; main (`67c0eb7`) dalın atasıydı; yalnız fast-forward. Force, reset veya rebase yok; GitHub'a gönderilmedi; `finans-v1` ve `acarvo-fin1` korunuyor. |
| Son main commit'i | Bu raporu güncelleyen commit (kod: `58c97d6`) |
| Ana sunucular | Geçişten önce durduruldu, sonra main kodundan yeniden başlatıldı |
| Geçiş öncesi | `safe-migrate --verify`: yalnız 3 bekleyen migration; `--dry-run`: 0034, 0035, 0036; uygulanmış 34 migration'ın özetleri dosyalarla aynı; satır sayıları ve içerik özetleri alındı (şirket bazında 62 tablo, kullanıcılar, şirketler, oturumlar, dosya deposu) |
| Doğrulanmış yedek | `C:\Users\soena\Desktop\acarvo\backups\2026-10-15-01-48-40` |
| Ana veritabanı | 34 → **37** migration; `safe-migrate --verify`: sorun yok (65 tablo, 61'i RLS'li) |
| Güvenlik karşılaştırması | 24 yeni politika (6 tablo × 4), yeni yetkiler ve indeksler; kaldırılan politika/yetki/indeks yok; RLS ayarı değişen eski tablo yok; veritabanı rolleri aynı |
| Rol izinleri | Yalnız hazır roller ve yalnız `finance.*`: Sahip +11, Yönetici +11, Operasyon +4 (görüntüleme, tahsilat ve depozito kaydı, iade talebi; doğrulama/onay/kapanış yok). Özel rol yok |
| Mevcut gerçek veriler | **Korundu.** Müşteriler (gerçek müşteri dahil), kurumsal hesaplar, araçlar, rezervasyonlar (gerçek rezervasyon dahil), kiralamalar, fiyat listeleri ve teklifler, sözleşmeler ve dosyaları, belgeler, fotoğraflar, km/konum geçmişi, şubeler, üyelikler, kullanıcılar, şirketler, oturumlar, sıra sayaçları ve 16 dosyalık depo birebir aynı. Tek ekleme: şirket başına 3 `role.preset_upgrade` işlem geçmişi kaydı (sistem) |
| Sentetik veri | Ana veritabanına finans dosyası, tahsilat, depozito, iade veya onay eklenmedi (6 finans tablosu boş) |
| Main üzerinde testler (yalnız `acarvo_test`) | API **480 / 480**; tarayıcı **118 / 118** (+30 isteğe bağlı) |
| TypeScript ve build | 4 proje hatasız; üretim derlemesi başarılı |
| Çalışan uygulama | `/api/health` → veritabanı bağlı; web http://localhost:5173/finans yanıt veriyor; finans API'si oturumsuz isteği reddediyor. Finans ekranları gerçek hesapla açılmadı; içerik doğrulaması test veritabanındaki tarayıcı testleriyle yapıldı |

**Finans ekranı:** http://localhost:5173/finans (Sahip ve Yönetici); kiralama finans sekmesi `/kiralamalar/<id>?sekme=finans`; müşteri/kurumsal cari `?sekme=cari`.

### 9. Açık güvenlik ve ürün riskleri

- Drina Rent a Car'da yalnız bir Sahip ve bir Operasyon kullanıcısı var: iç hesap kalemi onayı, kalem ters kaydı ve iade bildirimi sonrası ters kayıt için ikinci yetkili yok. Bu adımlar ikinci bir Sahip/Yönetici eklenene kadar yapılamaz (kural bilerek gevşetilmedi).
- Ödeme sorumlusu düzeltme akışı yok (FN5); yanlış seçimde dosya düzeltilemez, yalnız durum raporlanabilir.
- "Yetkili doğruladı" bir personel doğrulamasıdır; banka/POS mutabakatı yoktur.
- Finans dosyaları listesi en fazla 500 dosyayı sıralar (V1 sınırı).
- Tarayıcı testleri makine yükü altında zaman aşımına uğrayabiliyor (kod kaynaklı bulgu yok).

### 10. Gerçek işletme kullanımı öncesi

1. Her şirkette en az iki finans yetkilisi (Sahip + Yönetici) ve rollerin gözden geçirilmesi.
2. Şube ülkeleri, M2 gerçek anahtarları, ülke belge kuralları, üretim dosya taraması (mevcut engeller değiştirilmedi).
3. Sözleşme metinlerinin hukuki, vergi kurallarının mali onayı; dış sözleşme/fiyat modu kararı (kapalı).
4. Kasa/vardiya mutabakatı, iç makbuz, resmî fatura ve muhasebe aktarımı kararları (FN7).
5. Ödeme sorumlusu düzeltme ve depozito mahsup kuralları (FN4, FN5).
