# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> demo flows >> the Command Center, Home and the notification bell read one alert source
- Location: demo-tests\flows.spec.ts:61:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('tab', { name: /Riskler/ })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic [ref=f1e4]:
    - note [ref=f1e5]:
      - generic [ref=f1e6]: ACARVO DEMO — Örnek Veriler
      - generic [ref=f1e9]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka veya belge gönderimi yoktur.
      - 'button "Demo zamanı: 20.10.2026 10:00" [ref=f1e10] [cursor=pointer]'
    - generic [ref=f1e13]:
      - complementary [ref=f1e14]:
        - generic [ref=f1e21]:
          - generic [ref=f1e22]: acarvo
          - generic [ref=f1e23]: Filo operasyonu
        - navigation "Ana menü" [ref=f1e24]:
          - generic [ref=f1e25]:
            - button "Genel 2" [expanded] [ref=f1e26] [cursor=pointer]:
              - generic [ref=f1e27]: Genel
              - generic [ref=f1e28]: "2"
            - list [ref=f1e31]:
              - listitem [ref=f1e32]:
                - link "Ana Ekran" [ref=f1e33] [cursor=pointer]:
                  - /url: /
              - listitem [ref=f1e37]:
                - link "İşlerim" [ref=f1e38] [cursor=pointer]:
                  - /url: /islerim
          - generic [ref=f1e42]:
            - button "Operasyon 7" [expanded] [ref=f1e43] [cursor=pointer]:
              - generic [ref=f1e44]: Operasyon
              - generic [ref=f1e45]: "7"
            - list [ref=f1e48]:
              - listitem [ref=f1e49]:
                - link "Rezervasyonlar" [ref=f1e50] [cursor=pointer]:
                  - /url: /rezervasyonlar
              - listitem [ref=f1e54]:
                - link "Kiralamalar" [ref=f1e55] [cursor=pointer]:
                  - /url: /kiralamalar
              - listitem [ref=f1e59]:
                - link "Takvim" [ref=f1e60] [cursor=pointer]:
                  - /url: /takvim
              - listitem [ref=f1e64]:
                - link "Görevler" [ref=f1e65] [cursor=pointer]:
                  - /url: /gorevler
              - listitem [ref=f1e69]:
                - link "Araçlar" [ref=f1e70] [cursor=pointer]:
                  - /url: /araclar
              - listitem [ref=f1e74]:
                - link "Bakım & Servis" [ref=f1e75] [cursor=pointer]:
                  - /url: /bakim-servis
              - listitem [ref=f1e79]:
                - link "Hasar ve Olaylar" [ref=f1e80] [cursor=pointer]:
                  - /url: /hasar-ve-olaylar
          - generic [ref=f1e84]:
            - button "Müşteri & Ticari 3" [expanded] [ref=f1e85] [cursor=pointer]:
              - generic [ref=f1e86]: Müşteri & Ticari
              - generic [ref=f1e87]: "3"
            - list [ref=f1e90]:
              - listitem [ref=f1e91]:
                - link "Müşteriler" [ref=f1e92] [cursor=pointer]:
                  - /url: /musteriler
              - listitem [ref=f1e96]:
                - link "Kurumsal Hesaplar" [ref=f1e97] [cursor=pointer]:
                  - /url: /kurumsal-hesaplar
              - listitem [ref=f1e101]:
                - link "Fiyatlandırma" [ref=f1e102] [cursor=pointer]:
                  - /url: /fiyatlandirma
          - generic [ref=f1e106]:
            - button "Finans 3" [expanded] [ref=f1e107] [cursor=pointer]:
              - generic [ref=f1e108]: Finans
              - generic [ref=f1e109]: "3"
            - list [ref=f1e112]:
              - listitem [ref=f1e113]:
                - link "Finans" [ref=f1e114] [cursor=pointer]:
                  - /url: /finans
              - listitem [ref=f1e118]:
                - link "Masraflar" [ref=f1e119] [cursor=pointer]:
                  - /url: /masraflar
              - listitem [ref=f1e123]:
                - link "Şube Kasaları" [ref=f1e124] [cursor=pointer]:
                  - /url: /sube-kasalari
          - generic [ref=f1e128]:
            - button "Kontrol ve Raporlar 2" [expanded] [ref=f1e129] [cursor=pointer]:
              - generic [ref=f1e130]: Kontrol ve Raporlar
              - generic [ref=f1e131]: "2"
            - list [ref=f1e134]:
              - listitem [ref=f1e135]:
                - link "Raporlar" [ref=f1e136] [cursor=pointer]:
                  - /url: /raporlar
              - listitem [ref=f1e140]:
                - link "Onay Merkezi" [ref=f1e141] [cursor=pointer]:
                  - /url: /onay-merkezi
          - generic [ref=f1e145]:
            - button "Yönetim 4" [expanded] [ref=f1e146] [cursor=pointer]:
              - generic [ref=f1e147]: Yönetim
              - generic [ref=f1e148]: "4"
            - list [ref=f1e151]:
              - listitem [ref=f1e152]:
                - link "Şubeler" [ref=f1e153] [cursor=pointer]:
                  - /url: /subeler
              - listitem [ref=f1e157]:
                - link "Kullanıcılar ve Roller" [ref=f1e158] [cursor=pointer]:
                  - /url: /kullanicilar
              - listitem [ref=f1e162]:
                - link "İşlem Geçmişi" [ref=f1e163] [cursor=pointer]:
                  - /url: /islem-gecmisi
              - listitem [ref=f1e167]:
                - link "Ayarlar" [ref=f1e168] [cursor=pointer]:
                  - /url: /ayarlar
        - button "Demo kullanıcısı ve rol değiştir" [ref=f1e173] [cursor=pointer]:
          - generic [ref=f1e174]: AK
          - generic [ref=f1e175]:
            - generic [ref=f1e176]: Adnan Kovač
            - generic [ref=f1e177]: Sahip · Tüm şubeler
      - generic [ref=f1e180]:
        - banner [ref=f1e181]:
          - navigation "Konum" [ref=f1e182]:
            - generic [ref=f1e183]: Genel
            - generic [ref=f1e184]: /
            - generic [ref=f1e185]: İşlerim
          - generic [ref=f1e186]:
            - button "Ara (Ctrl K)" [ref=f1e187] [cursor=pointer]:
              - generic [ref=f1e190]: Ara…
              - generic [ref=f1e191]: Ctrl K
            - generic [ref=f1e192]:
              - generic [ref=f1e195]: Şube filtresi
              - combobox "Şube filtresi" [ref=f1e197]:
                - option "Tüm şubeler" [selected]
                - option "SJJ · Sarajevo Havalimanı"
                - option "MST · Mostar Merkez"
                - option "DBV · Dubrovnik Havalimanı"
            - button "Bildirimler (14)" [ref=f1e198] [cursor=pointer]:
              - generic [ref=f1e201]: 9+
            - button "Demo" [ref=f1e202] [cursor=pointer]
        - main [ref=f1e208]:
          - generic [ref=f1e210]:
            - generic [ref=f1e212]:
              - heading "İşlerim" [level=1] [ref=f1e213]
              - paragraph [ref=f1e214]: "Size düşen görevler, bekleyen onaylar ve müdahale gerektiren kayıtlar tek listede. İşlerim yeni bir kayıt deposu değildir: her satır kendi kaynağına gider; görev, onay ve uyarı kuralları kaynak ekranda işler."
            - region "Özet" [ref=f1e215]:
              - link "Bana atanan görev 1" [ref=f1e216] [cursor=pointer]:
                - /url: /gorevler?gorunum=bana
                - generic [ref=f1e217]: Bana atanan görev
                - generic [ref=f1e218]: "1"
              - link "Üstlenebileceğim 2 Açık havuz" [ref=f1e219] [cursor=pointer]:
                - /url: /gorevler?gorunum=havuz
                - generic [ref=f1e220]: Üstlenebileceğim
                - generic [ref=f1e221]: "2"
                - generic [ref=f1e222]: Açık havuz
              - link "Bekleyen onay 4" [ref=f1e223] [cursor=pointer]:
                - /url: /onay-merkezi
                - generic [ref=f1e224]: Bekleyen onay
                - generic [ref=f1e225]: "4"
              - generic [ref=f1e226]:
                - generic [ref=f1e227]: Müdahale gerektiren
                - generic [ref=f1e228]: "6"
            - tablist "İşlerim bölümleri" [ref=f1e229]:
              - tab "Bana Düşenler13" [ref=f1e230] [cursor=pointer]
              - tab "Uyarılar31" [selected] [ref=f1e231] [cursor=pointer]
            - generic [ref=f1e232]:
              - generic [ref=f1e233]:
                - group "Önem" [ref=f1e234]:
                  - button "Hepsi" [pressed] [ref=f1e235] [cursor=pointer]
                  - button "Kritik" [ref=f1e236] [cursor=pointer]
                  - button "Uyarı" [ref=f1e237] [cursor=pointer]
                  - button "Bilgi" [ref=f1e238] [cursor=pointer]
                - generic [ref=f1e239]:
                  - generic [ref=f1e240]: Modül
                  - combobox "Modül" [ref=f1e242]:
                    - option "Tüm modüller" [selected]
                    - option "vehicles"
                    - option "rentals"
                    - option "rules"
                    - option "reservations"
                    - option "maintenance"
                    - option "tasks"
                    - option "incidents"
                    - option "finance"
                    - option "damages"
                    - option "fines"
                    - option "approvals"
              - list [ref=f1e245]:
                - listitem [ref=f1e246]:
                  - link "DU 104-CD · Sigorta poliçesi süresi doldu (critical) 3 gün önce doldu (2026-10-17). Araç teslim hazırlığında engel sayılır." [ref=f1e247] [cursor=pointer]:
                    - /url: /araclar/v22
                    - generic [ref=f1e249]:
                      - generic [ref=f1e250]:
                        - text: DU 104-CD · Sigorta poliçesi süresi doldu
                        - generic [ref=f1e251]: (critical)
                      - generic [ref=f1e252]: 3 gün önce doldu (2026-10-17). Araç teslim hazırlığında engel sayılır.
                - listitem [ref=f1e255]:
                  - link "K-000035 · iade gecikti (DU 103-CD) (critical) Ana Horvat · planlanan iade geçti (48 saat). Araç hâlâ müşteride." [ref=f1e256] [cursor=pointer]:
                    - /url: /kiralamalar/rn35
                    - generic [ref=f1e258]:
                      - generic [ref=f1e259]:
                        - text: K-000035 · iade gecikti (DU 103-CD)
                        - generic [ref=f1e260]: (critical)
                      - generic [ref=f1e261]: Ana Horvat · planlanan iade geçti (48 saat). Araç hâlâ müşteride.
                - listitem [ref=f1e264]:
                  - link "K-000028 · iade gecikti (S11-K-101) (critical) Tarik Testić · planlanan iade geçti (16 saat). Araç hâlâ müşteride." [ref=f1e265] [cursor=pointer]:
                    - /url: /kiralamalar/rn28
                    - generic [ref=f1e267]:
                      - generic [ref=f1e268]:
                        - text: K-000028 · iade gecikti (S11-K-101)
                        - generic [ref=f1e269]: (critical)
                      - generic [ref=f1e270]: Tarik Testić · planlanan iade geçti (16 saat). Araç hâlâ müşteride.
                - listitem [ref=f1e273]:
                  - 'link "İade 24 saatten fazla gecikti · K-000035 (critical) Kiralama iadesi 24 saatten fazla gecikti: kayıp/çalıntı değerlendirmesi için yetkiliye bildirin." [ref=f1e274] [cursor=pointer]':
                    - /url: /kiralamalar/rn35
                    - generic [ref=f1e276]:
                      - generic [ref=f1e277]:
                        - text: İade 24 saatten fazla gecikti · K-000035
                        - generic [ref=f1e278]: (critical)
                      - generic [ref=f1e279]: "Kiralama iadesi 24 saatten fazla gecikti: kayıp/çalıntı değerlendirmesi için yetkiliye bildirin."
                - listitem [ref=f1e282]:
                  - link "K-000037 · teslim hazırlığı eksik (S11-K-104) (critical) Ajla Testović · sözleşme imzasız · depozito alınmadı" [ref=f1e283] [cursor=pointer]:
                    - /url: /kiralamalar/rn37
                    - generic [ref=f1e285]:
                      - generic [ref=f1e286]:
                        - text: K-000037 · teslim hazırlığı eksik (S11-K-104)
                        - generic [ref=f1e287]: (critical)
                      - generic [ref=f1e288]: Ajla Testović · sözleşme imzasız · depozito alınmadı
                - listitem [ref=f1e291]:
                  - link "R-000010 · araç çakışması (M22-K-206) (critical) Hans Müller-Demo · Hasar engeli H-000044 ile çakışıyor. Alternatif araç atayın." [ref=f1e292] [cursor=pointer]:
                    - /url: /rezervasyonlar/rsv10
                    - generic [ref=f1e294]:
                      - generic [ref=f1e295]:
                        - text: R-000010 · araç çakışması (M22-K-206)
                        - generic [ref=f1e296]: (critical)
                      - generic [ref=f1e297]: Hans Müller-Demo · Hasar engeli H-000044 ile çakışıyor. Alternatif araç atayın.
                - listitem [ref=f1e300]:
                  - link "S11-K-109 · periyodik bakım gecikti (warning) 800 km gecikmiş. Bakım planlayın." [ref=f1e301] [cursor=pointer]:
                    - /url: /araclar/v9
                    - generic [ref=f1e303]:
                      - generic [ref=f1e304]:
                        - text: S11-K-109 · periyodik bakım gecikti
                        - generic [ref=f1e305]: (warning)
                      - generic [ref=f1e306]: 800 km gecikmiş. Bakım planlayın.
                - listitem [ref=f1e309]:
                  - link "S11-K-105 · periyodik bakım gecikti (warning) 1.600 km gecikmiş. Bakım planlayın." [ref=f1e310] [cursor=pointer]:
                    - /url: /araclar/v5
                    - generic [ref=f1e312]:
                      - generic [ref=f1e313]:
                        - text: S11-K-105 · periyodik bakım gecikti
                        - generic [ref=f1e314]: (warning)
                      - generic [ref=f1e315]: 1.600 km gecikmiş. Bakım planlayın.
                - listitem [ref=f1e318]:
                  - 'link "GR-000013 · görev gecikti: Geçen haftaki şikayet takibi (warning) Son tarih geçti. Görevi tamamlamak bağlı kaydı değiştirmez." [ref=f1e319] [cursor=pointer]':
                    - /url: /gorevler?kayit=tk13
                    - generic [ref=f1e321]:
                      - generic [ref=f1e322]:
                        - text: "GR-000013 · görev gecikti: Geçen haftaki şikayet takibi"
                        - generic [ref=f1e323]: (warning)
                      - generic [ref=f1e324]: Son tarih geçti. Görevi tamamlamak bağlı kaydı değiştirmez.
                - listitem [ref=f1e327]:
                  - link "O-000002 · Park halindeki araç hasar gördü (warning) Açık yüksek önemli olay. Olayı çözmek hasar/ceza kaydını otomatik kapatmaz." [ref=f1e328] [cursor=pointer]:
                    - /url: /hasar-ve-olaylar?sekme=olaylar&kayit=inc2
                    - generic [ref=f1e330]:
                      - generic [ref=f1e331]:
                        - text: O-000002 · Park halindeki araç hasar gördü
                        - generic [ref=f1e332]: (warning)
                      - generic [ref=f1e333]: Açık yüksek önemli olay. Olayı çözmek hasar/ceza kaydını otomatik kapatmaz.
                - listitem [ref=f1e336]:
                  - link "Ödeme planı vadesi geçti · Neretva Logistics d.o.o. (warning) 500.00 EUR beklenen; plan satırı tahsilat sayılmaz." [ref=f1e337] [cursor=pointer]:
                    - /url: /kiralamalar/rn32
                    - generic [ref=f1e339]:
                      - generic [ref=f1e340]:
                        - text: Ödeme planı vadesi geçti · Neretva Logistics d.o.o.
                        - generic [ref=f1e341]: (warning)
                      - generic [ref=f1e342]: 500.00 EUR beklenen; plan satırı tahsilat sayılmaz.
                - listitem [ref=f1e345]:
                  - 'link "H-000044 · araç hasar engelinde (M22-K-206) (warning) Park halinde çarpma: ön tampon kırık, sol far çatlak. Engeli kaldırmak ikinci bir yetkili ister." [ref=f1e346] [cursor=pointer]':
                    - /url: /hasar-ve-olaylar?kayit=dm1
                    - generic [ref=f1e348]:
                      - generic [ref=f1e349]:
                        - text: H-000044 · araç hasar engelinde (M22-K-206)
                        - generic [ref=f1e350]: (warning)
                      - generic [ref=f1e351]: "Park halinde çarpma: ön tampon kırık, sol far çatlak. Engeli kaldırmak ikinci bir yetkili ister."
                - listitem [ref=f1e354]:
                  - link "O-000005 · Anahtar kaybı şüphesi (warning) Açık yüksek önemli olay. Olayı çözmek hasar/ceza kaydını otomatik kapatmaz." [ref=f1e355] [cursor=pointer]:
                    - /url: /hasar-ve-olaylar?sekme=olaylar&kayit=inc5
                    - generic [ref=f1e357]:
                      - generic [ref=f1e358]:
                        - text: O-000005 · Anahtar kaybı şüphesi
                        - generic [ref=f1e359]: (warning)
                      - generic [ref=f1e360]: Açık yüksek önemli olay. Olayı çözmek hasar/ceza kaydını otomatik kapatmaz.
                - listitem [ref=f1e363]:
                  - 'link "Rezervasyon 24 saattir onaysız · R-000015 (warning) Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin." [ref=f1e364] [cursor=pointer]':
                    - /url: /rezervasyonlar/rsv15
                    - generic [ref=f1e366]:
                      - generic [ref=f1e367]:
                        - text: Rezervasyon 24 saattir onaysız · R-000015
                        - generic [ref=f1e368]: (warning)
                      - generic [ref=f1e369]: "Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin."
                - listitem [ref=f1e372]:
                  - 'link "Rezervasyon 24 saattir onaysız · R-000016 (warning) Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin." [ref=f1e373] [cursor=pointer]':
                    - /url: /rezervasyonlar/rsv16
                    - generic [ref=f1e375]:
                      - generic [ref=f1e376]:
                        - text: Rezervasyon 24 saattir onaysız · R-000016
                        - generic [ref=f1e377]: (warning)
                      - generic [ref=f1e378]: "Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin."
                - listitem [ref=f1e381]:
                  - 'link "Rezervasyon 24 saattir onaysız · R-000020 (warning) Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin." [ref=f1e382] [cursor=pointer]':
                    - /url: /rezervasyonlar/rsv20
                    - generic [ref=f1e384]:
                      - generic [ref=f1e385]:
                        - text: Rezervasyon 24 saattir onaysız · R-000020
                        - generic [ref=f1e386]: (warning)
                      - generic [ref=f1e387]: "Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin."
                - listitem [ref=f1e390]:
                  - 'link "Rezervasyon 24 saattir onaysız · R-000021 (warning) Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin." [ref=f1e391] [cursor=pointer]':
                    - /url: /rezervasyonlar/rsv21
                    - generic [ref=f1e393]:
                      - generic [ref=f1e394]:
                        - text: Rezervasyon 24 saattir onaysız · R-000021
                        - generic [ref=f1e395]: (warning)
                      - generic [ref=f1e396]: "Pending rezervasyon 24 saati geçti: onaylayın veya iptal edin."
                - listitem [ref=f1e399]:
                  - link "Periyodik bakım 500 km aşıldı · S11-K-105 (warning) Aracın periyodik bakımı gecikti." [ref=f1e400] [cursor=pointer]:
                    - /url: /araclar/v5
                    - generic [ref=f1e402]:
                      - generic [ref=f1e403]:
                        - text: Periyodik bakım 500 km aşıldı · S11-K-105
                        - generic [ref=f1e404]: (warning)
                      - generic [ref=f1e405]: Aracın periyodik bakımı gecikti.
                - listitem [ref=f1e408]:
                  - link "Periyodik bakım 500 km aşıldı · S11-K-109 (warning) Aracın periyodik bakımı gecikti." [ref=f1e409] [cursor=pointer]:
                    - /url: /araclar/v9
                    - generic [ref=f1e411]:
                      - generic [ref=f1e412]:
                        - text: Periyodik bakım 500 km aşıldı · S11-K-109
                        - generic [ref=f1e413]: (warning)
                      - generic [ref=f1e414]: Aracın periyodik bakımı gecikti.
                - listitem [ref=f1e417]:
                  - link "Araç belgesi 15 günden az · M22-K-204 (warning) Araç belgesinin süresi dolmak üzere." [ref=f1e418] [cursor=pointer]:
                    - /url: /araclar/v14
                    - generic [ref=f1e420]:
                      - generic [ref=f1e421]:
                        - text: Araç belgesi 15 günden az · M22-K-204
                        - generic [ref=f1e422]: (warning)
                      - generic [ref=f1e423]: Araç belgesinin süresi dolmak üzere.
                - listitem [ref=f1e426]:
                  - link "Araç belgesi 15 günden az · DU 104-CD (warning) Araç belgesinin süresi dolmak üzere." [ref=f1e427] [cursor=pointer]:
                    - /url: /araclar/v22
                    - generic [ref=f1e429]:
                      - generic [ref=f1e430]:
                        - text: Araç belgesi 15 günden az · DU 104-CD
                        - generic [ref=f1e431]: (warning)
                      - generic [ref=f1e432]: Araç belgesinin süresi dolmak üzere.
                - listitem [ref=f1e435]:
                  - link "K-000038 · teslim hazırlığı eksik (S11-K-107) (warning) Mirza Uzorak · araç hazır değil (Temizlik / hazırlık) · sözleşme imzasız · depozito alınmadı" [ref=f1e436] [cursor=pointer]:
                    - /url: /kiralamalar/rn38
                    - generic [ref=f1e438]:
                      - generic [ref=f1e439]:
                        - text: K-000038 · teslim hazırlığı eksik (S11-K-107)
                        - generic [ref=f1e440]: (warning)
                      - generic [ref=f1e441]: Mirza Uzorak · araç hazır değil (Temizlik / hazırlık) · sözleşme imzasız · depozito alınmadı
                - listitem [ref=f1e444]:
                  - 'link "C-000004 · ceza vadesi yaklaşıyor (HR-2026-33002) (warning) Yasal vade: 2026-10-22. Otoriteye ödeme ve müşteri tahsilatı ayrı işlemlerdir." [ref=f1e445] [cursor=pointer]':
                    - /url: /hasar-ve-olaylar?sekme=cezalar&kayit=fn4
                    - generic [ref=f1e447]:
                      - generic [ref=f1e448]:
                        - text: C-000004 · ceza vadesi yaklaşıyor (HR-2026-33002)
                        - generic [ref=f1e449]: (warning)
                      - generic [ref=f1e450]: "Yasal vade: 2026-10-22. Otoriteye ödeme ve müşteri tahsilatı ayrı işlemlerdir."
                - listitem [ref=f1e453]:
                  - 'link "M22-K-204 · Muayene 12 gün içinde bitiyor (warning) Geçerlilik: 2026-11-01" [ref=f1e454] [cursor=pointer]':
                    - /url: /araclar/v14
                    - generic [ref=f1e456]:
                      - generic [ref=f1e457]:
                        - text: M22-K-204 · Muayene 12 gün içinde bitiyor
                        - generic [ref=f1e458]: (warning)
                      - generic [ref=f1e459]: "Geçerlilik: 2026-11-01"
                - listitem [ref=f1e462]:
                  - 'link "S11-K-106 · Sigorta poliçesi 18 gün içinde bitiyor (warning) Geçerlilik: 2026-11-07" [ref=f1e463] [cursor=pointer]':
                    - /url: /araclar/v6
                    - generic [ref=f1e465]:
                      - generic [ref=f1e466]:
                        - text: S11-K-106 · Sigorta poliçesi 18 gün içinde bitiyor
                        - generic [ref=f1e467]: (warning)
                      - generic [ref=f1e468]: "Geçerlilik: 2026-11-07"
                - listitem [ref=f1e471]:
                  - link "ON-000007 · karar bekliyor (info) Uzun süreli rezervasyon için %20 indirim talebi." [ref=f1e472] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap7
                    - generic [ref=f1e474]:
                      - generic [ref=f1e475]:
                        - text: ON-000007 · karar bekliyor
                        - generic [ref=f1e476]: (info)
                      - generic [ref=f1e477]: Uzun süreli rezervasyon için %20 indirim talebi.
                - listitem [ref=f1e480]:
                  - link "ON-000004 · onaylandı, uygulanmadı (info) Ödeme yanlış kiralamaya girilmiş; ters kayıt istiyorum." [ref=f1e481] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap4
                    - generic [ref=f1e483]:
                      - generic [ref=f1e484]:
                        - text: ON-000004 · onaylandı, uygulanmadı
                        - generic [ref=f1e485]: (info)
                      - generic [ref=f1e486]: Ödeme yanlış kiralamaya girilmiş; ters kayıt istiyorum.
                - listitem [ref=f1e489]:
                  - link "K-000041 · açık bakiye (800.00 EUR) (info) Mehmet Örnek · iade alındı, finans kapanışı bekliyor." [ref=f1e490] [cursor=pointer]:
                    - /url: /kiralamalar/rn41
                    - generic [ref=f1e492]:
                      - generic [ref=f1e493]:
                        - text: K-000041 · açık bakiye (800.00 EUR)
                        - generic [ref=f1e494]: (info)
                      - generic [ref=f1e495]: Mehmet Örnek · iade alındı, finans kapanışı bekliyor.
                - listitem [ref=f1e498]:
                  - 'link "ON-000002 · karar bekliyor (info) Sadık müşteri, geçen yıl 6 kiralama: %18 indirim talep ediliyor." [ref=f1e499] [cursor=pointer]':
                    - /url: /onay-merkezi?kayit=ap2
                    - generic [ref=f1e501]:
                      - generic [ref=f1e502]:
                        - text: ON-000002 · karar bekliyor
                        - generic [ref=f1e503]: (info)
                      - generic [ref=f1e504]: "Sadık müşteri, geçen yıl 6 kiralama: %18 indirim talep ediliyor."
                - listitem [ref=f1e507]:
                  - link "K-000039 · açık bakiye (274.25 EUR) (info) Dino Fiktiv · iade alındı, finans kapanışı bekliyor." [ref=f1e508] [cursor=pointer]:
                    - /url: /kiralamalar/rn39
                    - generic [ref=f1e510]:
                      - generic [ref=f1e511]:
                        - text: K-000039 · açık bakiye (274.25 EUR)
                        - generic [ref=f1e512]: (info)
                      - generic [ref=f1e513]: Dino Fiktiv · iade alındı, finans kapanışı bekliyor.
                - listitem [ref=f1e516]:
                  - link "ON-000003 · karar bekliyor (info) Kurumsal bağlantılı müşteri; depozito yarıya indirilsin." [ref=f1e517] [cursor=pointer]:
                    - /url: /onay-merkezi?kayit=ap3
                    - generic [ref=f1e519]:
                      - generic [ref=f1e520]:
                        - text: ON-000003 · karar bekliyor
                        - generic [ref=f1e521]: (info)
                      - generic [ref=f1e522]: Kurumsal bağlantılı müşteri; depozito yarıya indirilsin.
              - paragraph [ref=f1e525]:
                - text: Uyarılar kayıtlardan türetilir (Ana Ekran ve bildirimlerle aynı kaynak); yetkiniz ve şube kapsamınız dışındaki kayıtlar görünmez. Bildirim eşikleri
                - link "Ayarlar → Bildirimler" [ref=f1e526] [cursor=pointer]:
                  - /url: /ayarlar?bolum=bildirim
                - text: .
        - contentinfo [ref=f1e527]: Etkileşimli ürün konsepti. Ödemeler ve kayıtlar demo ortamında simüle edilir; gerçek POS, banka, belge gönderimi veya hukuki uyum entegrasyonu yoktur.
  - status
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { openDemo, switchUser, watch } from './fixtures'
  3  | 
  4  | // End-to-end behaviour of the demo: actions persist, reset restores, roles change what is allowed, language switches.
  5  | 
  6  | test.describe('demo flows', () => {
  7  |   test('a new reservation is saved, persists across a reload and the reset removes it', async ({ page }) => {
  8  |     const w = watch(page)
  9  |     await openDemo(page, '/rezervasyonlar/yeni?musteri=c3')
  10 |     await page.getByRole('button', { name: 'Rezervasyonu kaydet' }).click()
  11 |     await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
  12 |     await expect(page.getByText('Bekliyor').first()).toBeVisible()
  13 |     const url = page.url()
  14 |     await page.reload()
  15 |     await page.waitForLoadState('networkidle')
  16 |     await expect(page).toHaveURL(url)
  17 |     await expect(page.getByText('Bekliyor').first()).toBeVisible()
  18 | 
  19 |     // reset from the Demo menu
  20 |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  21 |     await page.getByRole('menuitem', { name: /Demo verilerini sıfırla/ }).click()
  22 |     await page.getByRole('button', { name: 'Sıfırla' }).click()
  23 |     await page.waitForLoadState('networkidle')
  24 |     await page.goto(url)
  25 |     await expect(page.getByText('Rezervasyon bulunamadı')).toBeVisible()
  26 |     expect(w.apiRequests).toEqual([])
  27 |   })
  28 | 
  29 |   test('the role switcher changes what the user may see: Operasyon has no finance reports or settings management', async ({ page }) => {
  30 |     await openDemo(page, '/')
  31 |     await switchUser(page, /Haris Mehić/)
  32 |     await openDemo(page, '/ayarlar')
  33 |     await expect(page.getByText(/yetkiniz yok|yetki/i).first()).toBeVisible()
  34 |     await openDemo(page, '/raporlar')
  35 |     await expect(page.getByRole('button', { name: /Gelir \(hesaplanan\)/ })).toHaveCount(0)
  36 |   })
  37 | 
  38 |   test('the owner can open the single exchange-rate desk; it exists only in Settings', async ({ page }) => {
  39 |     await openDemo(page, '/ayarlar?bolum=kurlar')
  40 |     await expect(page.getByRole('heading', { name: 'Geçerli kurlar' })).toBeVisible()
  41 |     await expect(page.getByText('1 EUR = 2 BAM').first()).toBeVisible()
  42 |     await openDemo(page, '/finans?sekme=kurlar')
  43 |     await expect(page.getByRole('link', { name: 'Kurları düzenle' })).toBeVisible()
  44 |   })
  45 | 
  46 |   test('the language can be switched to English and the navigation follows', async ({ page }) => {
  47 |     await openDemo(page, '/')
  48 |     await page.getByRole('button', { name: 'Demo', exact: true }).click()
  49 |     await page.getByRole('menuitem', { name: /Dil:/ }).click()
  50 |     await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
  51 |     await expect(page.getByText('ACARVO DEMO — Sample Data').first()).toBeVisible()
  52 |   })
  53 | 
  54 |   test('a delivery cannot be completed while checks fail and the button says why', async ({ page }) => {
  55 |     await openDemo(page, '/kiralamalar?durum=prepared')
  56 |     await page.getByRole('link', { name: /^K-\d+/ }).first().click()
  57 |     await expect(page.getByRole('button', { name: 'Teslimi tamamla' })).toBeDisabled()
  58 |     await expect(page.getByText('Düğme pasif: eksik kontroller')).toBeVisible()
  59 |   })
  60 | 
  61 |   test('the Command Center, Home and the notification bell read one alert source', async ({ page }) => {
  62 |     await openDemo(page, '/komuta-merkezi?sekme=uyarilar')
  63 |     const tab = await page.getByRole('tab', { name: /Uyarılar/ }).textContent()
  64 |     const count = Number(/(\d+)/.exec(tab ?? '')?.[1] ?? '0')
  65 |     expect(count).toBeGreaterThan(0)
  66 |     await openDemo(page, '/riskler-ve-istisnalar')
> 67 |     const risks = await page.getByRole('tab', { name: /Riskler/ }).textContent()
     |                                                                    ^ Error: locator.textContent: Test timeout of 60000ms exceeded.
  68 |     expect(Number(/(\d+)/.exec(risks ?? '')?.[1] ?? '-1')).toBe(count)
  69 |   })
  70 | })
  71 | 
```