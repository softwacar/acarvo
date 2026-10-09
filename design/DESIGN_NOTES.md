# ACARVO tasarım notları

## Sistem seçimi (2026-10-09)
- Temel: **shadcn/ui** (Radix, Tailwind v4, kod depoda) + **TanStack Table v8**; filtre/sıralama desenleri **tablecn** (MIT) referans.
- İncelenip seçilmeyenler: Untitled UI React (MIT, React Aria; ~72px satır, pazarlama-SaaS havası), IBM Carbon (Apache-2; IBM kimliği baskın), Ant Design Pro (MIT; Alibaba kimliği, kart içinde kart), Mantine (MIT; oyuncaksı), Blueprint (Apache-2; eski görünüm).
- Gerekçe: hiçbir kit ACARVO'nun kimliğini taşımamalı; shadcn görünüm dayatmayan primitives sunuyor, görsel dil bizim.

## Reddedilenler
- Pano A/B (2026-10-09): kullanıcı "jenerik, AI admin paneli gibi" diye reddetti. İkon+etiket sidebar, KPI şeridi, renkli durum noktaları, siyah çerçeveli plaka çipi tekrar kullanılmaz.

## Araçlar v1 yönü
- Konu: şube personelinin filo masası. Soru: hangi araç nerede, ne zaman boş, hazır mı, ne engelliyor.
- İmza öğesi: her satırda **14 günlük doluluk şeridi** (bugün işaretli). Durum renk noktası yerine zaman şeridi ve metin.
- Renk: Mürekkep #14171A, Grafit #5B6168, Çizgi #DCDFDB, Zemin #F3F4F1, Plaka mavisi #1A3D96 (AB plaka bandından), Sinyal kırmızısı #B4321F (yalnız engel), Kehribar #A86A12 (bakım).
- Yazı: Instrument Sans (OFL). Arayüz normal genişlik; plaka, km, tarih ve sayılar dar kesim (wdth 80) + tabular rakam.
- Sidebar: ikonsuz, metin ve sayaçlar; aktif öğe sol 2px mavi çizgi.
- Özet: kart yok; filo bileşimi tek yatay çubuk, tıklanınca filtre.
- Detay: satır seçilince sağda kalıcı önizleme paneli (Araç 360° özeti).

## Araçlar v2 (rafine tur)
Kullanıcı geri bildirimi: işlev iyi, görsel kalite yetersiz; panel düz ve metin ağırlıklı.
- Marka: plaka motifi markanın kendisi. Wordmark mini plaka çerçevesinde (mavi bant + "acarvo").
- Global arama sidebar'a taşındı; sayfa başlığı yalnız sayfa eylemlerini taşır.
- Tablo kenardan kenara (dış kutu yok), başlık bandı ve tek tip ince satır çizgileri.
- Şerit başlığı: iki harfli gün adı + gün numarası; bugün mürekkep zeminli etiket; pazartesi çizgileri daha belirgin.
- Şerit blokları 14px, uzun bloklarda müşteri/kayıt adı blok içinde.
- Filo özeti: tek satır, aynı tipografik ölçü; her sayı şerit deseniyle (lejant) eşleşir; "Dikkat" grubu ayrı.
- Panel: plaka + ad + durum "kahraman" bloğu, mini şerit, 5 maddelik hazırlık kontrol listesi, yakıt göstergesi, zaman çizelgesi, duruma göre eylemler (uygunsuz eylem kapalı + neden yazılı).
