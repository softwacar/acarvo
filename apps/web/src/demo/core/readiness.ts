import { B } from '../i18n'
import { authorizersOf, recordersOf, verifiersOf } from './risk'
import type { Db } from './types'

// Operational readiness (decision document K-12 / L.8), the browser model of the real readiness checks. Each check says what is
// needed and how to fix it. Server and operator work (malware scanner, encryption key) and legal review are never shown as done in the
// demo: they have their own states.

export type ReadyState = 'ok' | 'missing' | 'operator' | 'legal' | 'info'
export interface ReadyCheck {
  key: string
  label: string
  state: ReadyState
  detail: string
  /** Where the missing piece is fixed. */
  fixTo?: string
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function readinessChecks(d: Db): ReadyCheck[] {
  const s = d.settings
  const out: ReadyCheck[] = []
  const add = (key: string, label: string, state: ReadyState, detail: string, fixTo?: string) => out.push({ key, label, state, detail, fixTo })
  const branches = d.branches.filter((b) => b.active)

  const noCountry = branches.filter((b) => !/^[A-Z]{2}$/.test(b.country))
  add('branch_countries', B('Şube ülkeleri', 'Branch countries'), noCountry.length ? 'missing' : 'ok', noCountry.length ? B(`${noCountry.map((b) => b.name).join(', ')} için ülke (ISO) yok.`, `No country (ISO) for ${noCountry.map((b) => b.name).join(', ')}.`) : B('Her şubenin ülkesi tanımlı.', 'Every branch has a country.'), '/subeler')
  const badTz = branches.filter((b) => !validTz(b.tz))
  add('branch_timezones', B('Şube saat dilimleri', 'Branch time zones'), badTz.length ? 'missing' : 'ok', badTz.length ? B(`${badTz.map((b) => b.name).join(', ')} için geçersiz saat dilimi.`, `Invalid time zone for ${badTz.map((b) => b.name).join(', ')}.`) : B('Saat dilimleri geçerli (IANA).', 'Time zones are valid (IANA).'), '/subeler')
  add('customer_keys', B('Müşteri kimlik verisi şifreleme anahtarı', 'Customer identity encryption key'), 'operator', B('Sistem yöneticisi işlemi: anahtar sunucuda tanımlanır. Demoda doğrulanmaz.', 'System administrator task: the key is set on the server. Not verifiable in the demo.'))
  add('malware_scanner', B('Zararlı yazılım tarayıcısı (belge yükleme)', 'Malware scanner (document upload)'), 'operator', B('Sistem yöneticisi işlemi: tarayıcı servisi çalışmalı; yoksa yüklenen belgeler kabul edilmez. Demoda doğrulanmaz.', 'System administrator task: the scanner service must run; without it uploaded documents are not accepted. Not verifiable in the demo.'))
  add('document_rules', B('Belge kuralları', 'Document rules'), s.docs.requireForForeign.length && s.docs.requireForLocal.length ? 'ok' : 'missing', s.docs.requireForForeign.length && s.docs.requireForLocal.length ? B('Yerli ve yabancı müşteri için zorunlu belgeler tanımlı.', 'Required documents are defined for local and foreign customers.') : B('Yerli ve yabancı müşteri için zorunlu belge listesi boş.', 'The required-document list is empty for local or foreign customers.'), '/ayarlar?bolum=belge')
  add('rental_mode', B('Sözleşme çalışma modu', 'Contract operating mode'), 'ok', B('ACARVO sözleşmeyi hazırlar; gerekirse imza dış süreçte alınır. Doğrulanmamış e-imza iddiası yok.', 'ACARVO drafts the contract; where needed the signature is taken in an external process. No unverified e-signature claim.'), '/ayarlar?bolum=sozlesme')
  const noRate = d.classes.filter((c) => !d.baseRates.some((r) => r.classId === c.id && r.cur === s.company.baseCurrency))
  add('price_lists', B('Fiyat listesi', 'Price list'), noRate.length ? 'missing' : 'ok', noRate.length ? B(`${noRate.map((c) => c.name).join(', ')} sınıfı için ${s.company.baseCurrency} günlük fiyat yok.`, `No ${s.company.baseCurrency} daily rate for class ${noRate.map((c) => c.name).join(', ')}.`) : B(`Her sınıf için ${s.company.baseCurrency} günlük fiyat var.`, `Every class has a ${s.company.baseCurrency} daily rate.`), '/fiyatlandirma')
  const tax = d.taxRules.find((t) => t.id === s.defaultTaxId && t.active)
  add('tax', B('Vergi kuralı', 'Tax rule'), tax ? 'ok' : 'missing', tax ? B(`Varsayılan vergi: ${tax.name} %${tax.ratePct}. Oranlar demo değeridir; mali danışman doğrular.`, `Default tax: ${tax.name} ${tax.ratePct}%. Rates are demo values; a tax adviser must confirm them.`) : B('Etkin bir varsayılan vergi kuralı yok.', 'There is no active default tax rule.'), '/fiyatlandirma')
  const tpl = d.templates.filter((t) => t.active && s.contractLangs.includes(t.lang))
  add('contract_template', B('Sözleşme şablonu', 'Contract template'), tpl.length ? 'ok' : 'missing', tpl.length ? B(`${tpl.length} etkin şablon.`, `${tpl.length} active template(s).`) : B('Etkin sözleşme şablonu yok.', 'There is no active contract template.'), '/ayarlar?bolum=sozlesme')
  add('contract_legal', B('Sözleşme hukuki incelemesi', 'Contract legal review'), 'legal', B('Her ülke için avukat incelemesi gerekir; demo metinleri örnektir ve demoda “incelendi” işaretlenemez.', 'A lawyer must review the texts for each country; the demo texts are samples and cannot be marked reviewed in the demo.'))
  const auth = authorizersOf(d)
  add('four_eyes', B('Bağımsız onay yetkilisi (≥ 2)', 'Independent authorizers (≥ 2)'), auth.length >= 2 ? 'ok' : 'missing', auth.length >= 2 ? B(`${auth.length} yetkili: ${auth.map((u) => u.name).join(', ')}.`, `${auth.length} authorizers: ${auth.map((u) => u.name).join(', ')}.`) : B(`Yalnız ${auth.length} onay yetkilisi var. Yüksek riskli işlemler (finansal düzeltme, hasar engeli kaldırma, politikadan sapma) kilitli kalır; görünürlükle aşılamaz.`, `Only ${auth.length} authorizer(s). High-risk actions (financial correction, lifting a damage block, policy deviation) stay locked; visibility cannot work around it.`), '/kullanicilar')
  const ver = verifiersOf(d)
  const rec = recordersOf(d)
  const pair = rec.some((r) => ver.some((v) => v.id !== r.id))
  add('verifiers', B('Tahsilat doğrulayıcısı', 'Payment verifier'), pair ? 'ok' : 'missing', pair ? B(`${ver.length} doğrulayıcı; kaydeden kendi kaydını doğrulayamaz.`, `${ver.length} verifier(s); whoever records cannot verify their own line.`) : B('Kaydedenden farklı bir doğrulayıcı yok; tahsilatlar kaydedilir ama bakiyeye uygulanamaz.', 'There is no verifier besides the person who records; payments are recorded but cannot be applied.'), '/kullanicilar')
  const pending = d.approvals.filter((a) => a.status === 'requested' || a.status === 'approved').length
  add('pending_decisions', B('Bekleyen onay kararları', 'Pending approval decisions'), 'info', pending ? B(`${pending} onay talebi açık.`, `${pending} approval request(s) open.`) : B('Açık onay talebi yok.', 'No open approval request.'), '/onay-merkezi')
  const missingDrawers = branches.filter((b) => !d.drawers.some((x) => x.branchId === b.id))
  add('cash_drawers', B('Şube kasaları', 'Branch cash registers'), missingDrawers.length ? 'missing' : 'ok', missingDrawers.length ? B(`${missingDrawers.map((b) => b.name).join(', ')} için kasa tanımlı değil.`, `No drawer defined for ${missingDrawers.map((b) => b.name).join(', ')}.`) : B('Her şubede nakit kasası tanımlı.', 'Every branch has a cash drawer.'), '/sube-kasalari')
  return out
}

export const READY_LABEL: Record<ReadyState, { tr: string; en: string }> = {
  ok: { tr: 'Hazır', en: 'Ready' },
  missing: { tr: 'Eksik', en: 'Missing' },
  operator: { tr: 'Sistem yöneticisi işlemi', en: 'System administrator task' },
  legal: { tr: 'Hukuki inceleme gerekli', en: 'Legal review needed' },
  info: { tr: 'Bilgi', en: 'Info' },
}

/** Before a real company goes live (decision document K-14 / S.3). Never claimed solved in the demo. */
export const PRODUCTION_PREREQUISITES: { key: string; tr: string; en: string }[] = [
  { key: 'tax', tr: 'Vergi: ülkeye göre oranlar, fatura/makbuz zorunlulukları, depozito ve kaparo vergilendirmesi', en: 'Tax: rates per country, invoice/receipt duties, tax treatment of deposits and advances' },
  { key: 'contract', tr: 'Sözleşme: her ülke için şablon uygunluğu, yetki ve uyuşmazlık hükümleri', en: 'Contract: template suitability, authority and dispute clauses per country' },
  { key: 'insurance', tr: 'Sigorta: poliçe ve sorumluluk beyanları (ACARVO sigorta aracılığı iddiasında bulunmaz)', en: 'Insurance: policy and liability statements (ACARVO makes no insurance-brokerage claim)' },
  { key: 'privacy', tr: 'Kişisel veri: işleme envanteri, aydınlatma metni, ilgili kişi hakları, ihlal süreci', en: 'Personal data: processing inventory, notice, data-subject rights, breach process' },
  { key: 'retention', tr: 'Saklama: sözleşme, belge, fotoğraf ve finans kayıtları için yasal süreler', en: 'Retention: legal periods for contracts, documents, photos and financial records' },
  { key: 'refunds', tr: 'İade ve iptal kuralları: tüketici mevzuatı, cayma hakkı, depozito iade süreleri', en: 'Refund and cancellation rules: consumer law, withdrawal right, deposit return periods' },
  { key: 'esign', tr: 'E-imza: geçerlilik ve delil değeri, sağlayıcı seçimi (V2)', en: 'E-signature: validity and evidential value, provider choice (V2)' },
  { key: 'backup', tr: 'Yedekleme ve olağanüstü durum: RPO/RTO, geri yükleme tatbikatı', en: 'Backup and disaster recovery: RPO/RTO, restore drill' },
  { key: 'security', tr: 'Güvenlik: sızma testi, bağımlılık taraması, oturum/CSRF gözden geçirmesi, anahtar ve tarayıcı operatör prosedürü', en: 'Security: penetration test, dependency scan, session/CSRF review, key and scanner operator procedure' },
  { key: 'support', tr: 'Destek ve SLA: müşteri desteği, olay yönetimi, kullanım koşulları, veri işleme sözleşmesi', en: 'Support and SLA: customer support, incident management, terms of use, data-processing agreement' },
]
