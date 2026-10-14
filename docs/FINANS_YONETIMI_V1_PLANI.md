# ACARVO — Finans + Tahsilat + Depozito V1 Planı

Dal: `finans-v1` · çalışma kopyası `C:\Users\soena\Desktop\acarvo-fin1` · temel: main `67c0eb7` (ana veritabanı 34 migration).
Kapsam dışı (bilerek): ödeme sağlayıcısı, gerçek tahsilat/iade, kart verisi, resmî fatura/e-fatura/mali makbuz, vergi beyannamesi, muhasebe entegrasyonu, döviz kuru masası, şube kasaları (spec'te ayrı "Şube Kasaları" ekranı), Onay Merkezi ekranı, taksit planları.

## 1. Spec'ten alınan kurallar

| Konu | Spec | V1 uygulaması |
|---|---|---|
| Teklif ≠ ücret | §67: Quote fiyat ön izlemesidir, Charge değildir | Teklif kendiliğinden hiçbir finans kaydı üretmez. Yetkili personel teklifi "onay bekleyen iç hesap kalemi"ne dönüştürür; ikinci yetkili onaylar. |
| Ücretin kayda geçmesi | §67: Base Charge yalnız Delivered anında bir kez Posted | Teklif kalemi hazırlanabilir ama yalnız kiralama teslim edilmiş (Kirada / İade kontrolü / Kapandı) ise onaylanıp "kayıtlı" olur (veritabanı kuralı). Aynı teklif bir kiralamada bir kez kaleme dönüşür. |
| Ödeme durumları | §64.1: Planned / Recorded / Applied / Voided | `Kaydedildi — doğrulama bekliyor` (personel beyanı/bildirimi) → `Doğrulandı` (ikinci yetkili; bakiyeden düşer) / `Reddedildi`; doğrulanmış kayıt yalnız gerekçeli `Ters kayıt` ile geri alınır. Taksit (Planned) yok. |
| Yöntemler | §64.1: Nakit, Kart (POS'tan gerçekten geçirilmişse referans), Havale/EFT, Diğer dış yöntem | Nakit (açık nakit beyanı zorunlu), Banka transferi bildirimi, Harici POS kaydı (referans zorunlu; ACARVO kart tahsilatı değildir), Diğer harici yöntem. |
| Ödeyen ≠ sorumlu | §64.1, §85.6 | Ödemede ödeyen (müşteri / kurumsal hesap / başka kişi-kurum adı) ayrı; finans dosyasında ödeme sorumlusu (müşteri veya kurumsal hesap) personel tarafından açıkça seçilir. Çok ödeyen sorumluluğu bölmez. |
| Fazla ödeme | §64.1: varsayılan engellenir | Ödeme toplamı, kiralamanın onaylı + onay bekleyen kalem toplamını aşamaz (veritabanı). Ters kayıt sonrası oluşan fazlalık "Fazla tahsilat — iade adayı" olarak gösterilir, negatif borç diye gizlenmez. |
| Para birimi | §62–65, §78.3: kur yoksa sahte tahsilat yok; çapraz toplam yok | Finans dosyası tek işlem para birimiyle açılır (teklifin para birimi). Ödemeler yalnız bu para biriminde (kur masası yok). Depozito kendi para biriminde olabilir. Her toplam para birimi başına ayrı. |
| Depozito | §59BE: Expected → Held → Released / Applied; Held bakiyeyi azaltmaz; Deposit ≠ Payment ≠ Revenue; kart blokesi yalnız personel gerçekten yaptıysa manuel kayıt | `Talep edildi` → `Alındığı bildirildi` → `Doğrulandı` (tutuluyor); iadeler ayrı kayıt; `İnceleme` işareti; `İptal`. Depozitodan kiralama bedeline mahsup (Applied) V1'de yok (açık karar). "Provizyon alındı" ifadesi hiçbir yerde yok. |
| Depozito iadesi | §59BE Released ≠ Payment Refund | İade talebi → ikinci yetkili onayı → harici iade bildirimi (referans) → (gerekirse gerekçeli ters kayıt). Talep+onay+tamamlanan toplamı doğrulanmış depozitoyu aşamaz (veritabanı, kilitle). |
| Dört göz | §II Approval: requester cannot be reviewer | Ödeme doğrulama, kalem onayı, ters kayıt onayı, depozito doğrulama ve iade onayı: işlemi başlatan kullanıcı onaylayamaz (veritabanı kontrolü). |
| Finansal kapanış | §59/§4625: Open → Financially Closed; Reopened gerekçeli; Rental Closed ≠ Financially Closed | Dosya `Açık` → `Finansal olarak kapandı` (bakiye 0, bekleyen doğrulama/onay yok, depozitolar çözülmüş) → `Yeniden açıldı` (gerekçe) → kapanış. Kiralama kapanışı finansı kapatmaz. |
| Dönüş kalemleri | §67: late/km/fuel yalnız policy snapshot ile | Otomatik ücret yok. İade bilgileri (gerçek saat, km, yakıt, yeni bulgu) finans sekmesinde gösterilir; gecikme/fark/bulgu varsa "Finansal değerlendirme gerekli". |
| Belgeler | §79: gerçek fatura/fiskal belge yok | İç işlem dökümü yalnız "İÇ İŞLEM KAYDI — RESMÎ FATURA VEYA MALİ MAKBUZ DEĞİLDİR" başlığıyla. |

## 2. Açık ürün kararları (güvenli tarafta uygulandı, onayınızı bekler)

- **FN1** Ödeme kaydı ve doğrulaması iki ayrı kişi ister (nakit dahil). Tek personelli şubeler için istisna yok.
- **FN2** Teklif kalemi yalnız teslimden sonra onaylanır (spec §67). Teslimden önceki ödemeler, onay bekleyen kalemin tutarına kadar kaydedilebilir (avans).
- **FN3** Ödeme para birimi = finans dosyası para birimi. Farklı para birimiyle tahsilat, kur masası gelene kadar kapalı.
- **FN4** Depozitodan mahsup (Deposit Applied) yok; depozito yalnız iade edilir veya inceleme olarak işaretlenir. Hasar/ceza kesintisi ayrı karar.
- **FN5** Ödeme sorumlusu dosya açılırken seçilir ve değişmez (değişiklik = yeni dosya kararı, V1'de yok).
- **FN6** Gecikme, km, yakıt ve hasar ücretleri hesaplanmaz; yalnız manuel "ek iç hesap kalemi" (gerekçeli, onaylı) eklenebilir.
- **FN7** Kurumsal alacak devri (Corporate Receivable transfer) yok; kurumsal sorumlu dosyalar kurumsal hesabın cari görünümünde listelenir.

## 3. Veri modeli (yalnız `acarvo_test`)

- `rental_finances` — kiralama başına tek finans dosyası: para birimi, ödeme sorumlusu (müşteri/kurumsal), durum, sürüm, açan/kapatan.
- `finance_charges` — iç hesap kalemleri: tür (teklif / ek kalem), kaynak (teklif kimliği, tekil), net/vergi/brüt, vergi durumu, durum (onay bekliyor → kayıtlı → ters kayıt istendi → ters kaydedildi; reddedildi), hazırlayan/onaylayan/ters kayıt isteyen/onaylayan.
- `finance_payments` — tahsilat kayıtları: numara `T-000001`, ödeyen, yöntem, tutar, harici referans (yöntem başına tekil, geçersiz kayıtlar hariç), nakit beyanı, durum, kaydeden/doğrulayan/ters kayıt.
- `finance_deposits` — depozitolar: numara `D-000001`, tutar ve kendi para birimi, yöntem, referans, durum, inceleme işareti.
- `finance_deposit_refunds` — iadeler: numara `DI-000001`, tutar, yöntem, gerekçe, durum, talep eden/onaylayan/tamamlandı bildiren/ters kayıt.
- `finance_events` — yalnız ekleme: tür, kayıt, önceki/yeni durum, tutar, para birimi, aktör, zaman, istek kimliği; kişisel veri yok.
- Hepsi zorunlu RLS, bileşik `(company_id, id)` yabancı anahtarlar, tutar/para birimi/taraf alanları değişmez, yalnız ileri durum geçişleri, silme yok, dört göz ve bakiye kuralları tetikleyicilerde.

## 4. Yetkiler (preset geçmişi v10; özel rollere dokunulmaz)

| İzin | Sahip | Yönetici | Operasyon |
|---|---|---|---|
| finance.read (kiralama/müşteri finans görünümü, şube kapsamında) | ✓ | ✓ | ✓ |
| finance.payments.record | ✓ | ✓ | ✓ |
| finance.payments.verify | ✓ | ✓ | |
| finance.charges.manage (tekliften kalem hazırlama, ek kalem, ters kayıt isteği) | ✓ | ✓ | |
| finance.charges.approve (kalem ve ters kayıt onayı) | ✓ | ✓ | |
| finance.deposits.record | ✓ | ✓ | ✓ |
| finance.deposits.verify | ✓ | ✓ | |
| finance.refunds.request | ✓ | ✓ | ✓ |
| finance.refunds.approve (onay, tamamlandı bildirimi, ters kayıt) | ✓ | ✓ | |
| finance.reports.read (Finans merkezi listeleri ve raporlar) | ✓ | ✓ | |
| finance.close (finansal kapanış / yeniden açma) | ✓ | ✓ | |

## 5. API ve ekranlar

- `GET/POST /api/rentals/:id/finance` (+ `/open`, `/charges`, `/payments`, `/deposits`, alt işlemler), `GET /api/finance/*` listeleri ve raporlar, müşteri ve kurumsal hesap cari görünümleri.
- Ekranlar: Finans (genel görünüm, tahsilatlar, bekleyen doğrulamalar, depozitolar, iadeler, hareketler, raporlar), Kiralama 360° Finans sekmesi, Müşteri 360° ve Kurumsal Hesap 360° Finans sekmeleri.
