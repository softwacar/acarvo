import type { TemplateField, TemplateLanguage } from '@acarvo/shared'

/**
 * ACARVO's sample template texts (F6). They are deliberately marked as samples and contain no legal clauses:
 * the company writes its own terms with its legal advisers. Activating a template is the company's decision.
 */
const TR = `ÖRNEK METİN — HUKUKİ ONAY GEREKTİRİR
Bu metin ACARVO tarafından yapı örneği olarak verilmiştir; hukuki danışmanlık veya geçerli sözleşme hükmü değildir.
Şirketinizin hukuk danışmanının onayladığı hükümleri buraya yazın.

ARAÇ KİRALAMA SÖZLEŞMESİ
Sözleşme no: {{contract.no}} (sürüm {{contract.revision}})
Taslak tarihi: {{contract.date}}

1. Taraflar
Kiralayan: {{company.name}}
Kiracı: {{renter.name}} ({{renter.no}})
Kurumsal hesap: {{corporate.name}}
Ana sürücü: {{driver.primary}}
Ek sürücüler: {{drivers.additional}}

2. Araç
Plaka: {{vehicle.plate}}
Marka / model: {{vehicle.make_model}}
Sınıf: {{vehicle.class}}

3. Kiralama dönemi
Alış: {{period.pickup}} — {{branch.pickup}}
Planlanan iade: {{period.return}} — {{branch.return}}
Kiralama no: {{rental.no}} · Rezervasyon no: {{reservation.no}}

4. Fiyat (teklif)
{{price.table}}

5. Şirket hükümleri
[Bu bölüme şirketinizin onaylı kiralama koşullarını yazın.]
`

const EN = `SAMPLE TEXT — REQUIRES LEGAL APPROVAL
ACARVO provides this text as a structural sample only; it is not legal advice and contains no binding terms.
Write the terms approved by your company's legal adviser here.

VEHICLE RENTAL AGREEMENT
Agreement no: {{contract.no}} (revision {{contract.revision}})
Draft date: {{contract.date}}

1. Parties
Lessor: {{company.name}}
Renter: {{renter.name}} ({{renter.no}})
Corporate account: {{corporate.name}}
Primary driver: {{driver.primary}}
Additional drivers: {{drivers.additional}}

2. Vehicle
Plate: {{vehicle.plate}}
Make / model: {{vehicle.make_model}}
Class: {{vehicle.class}}

3. Rental period
Pickup: {{period.pickup}} — {{branch.pickup}}
Planned return: {{period.return}} — {{branch.return}}
Rental no: {{rental.no}} · Reservation no: {{reservation.no}}

4. Price (quote)
{{price.table}}

5. Company terms
[Write your company's approved rental terms here.]
`

/** Turkish sample for Turkish templates; the English one for the other languages (to be translated by the company). */
export const sampleBody = (language: TemplateLanguage) => (language === 'tr' ? TR : EN)

/** Clearly fictional values for the template preview (never real records). */
export const PREVIEW_VALUES: Record<TemplateField, string> = {
  'company.name': 'Örnek Şirket',
  'branch.pickup': 'Örnek Şube (ORN)',
  'branch.return': 'Örnek Şube (ORN)',
  'contract.no': 'S-000000',
  'contract.date': '01.01.2030',
  'contract.revision': '1',
  'template.version': '1',
  'rental.no': 'K-000000',
  'reservation.no': 'R-000000',
  'renter.name': 'Örnek Müşteri',
  'renter.no': 'M-000000',
  'corporate.name': '—',
  'corporate.no': '—',
  'driver.primary': 'Örnek Müşteri (M-000000)',
  'drivers.additional': '—',
  'vehicle.plate': 'ORNEK 00',
  'vehicle.make_model': 'Örnek Marka Örnek Model',
  'vehicle.class': 'Örnek sınıf',
  'period.pickup': '01.01.2030 10:00 (Europe/Sarajevo)',
  'period.return': '04.01.2030 10:00 (Europe/Sarajevo)',
  'price.table': 'Kiralama · 1–6 gün kademesi · 3 gün: 150,00 EUR\nNet toplam: 150,00 EUR\nVergi: yapılandırılmadı',
  'price.total': '150,00 EUR (net; vergi yapılandırılmadı)',
  'price.currency': 'EUR',
}
