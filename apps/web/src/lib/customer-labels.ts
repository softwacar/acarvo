import { COUNTRY_CODES, type ContactPreference, type CustomerArchiveReason, type CustomerLanguage, type CustomerResidency, type DuplicateReason } from '@acarvo/shared'

export const RESIDENCY_LABELS: Record<CustomerResidency, string> = { local: 'Yerli', foreign: 'Yabancı' }
export const RESIDENCY_LONG: Record<CustomerResidency, string> = { local: 'Yerli müşteri', foreign: 'Yabancı müşteri' }

export const CONTACT_PREFERENCE_LABELS: Record<ContactPreference, string> = {
  phone: 'Telefonla arama',
  email: 'E-posta',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
}

export const ARCHIVE_REASON_LABELS: Record<CustomerArchiveReason, string> = {
  duplicate: 'Mükerrer kayıt',
  inactive: 'Artık müşteri değil',
  customer_request: 'Müşterinin talebi',
  entry_error: 'Hatalı kayıt',
  other: 'Diğer',
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  phone: 'Aynı telefon',
  email: 'Aynı e-posta',
  name_dob: 'Aynı ad ve doğum tarihi',
}

/** Field names in the record history (the history holds which fields changed, not their personal values). */
export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  givenName: 'Ad',
  familyName: 'Soyad',
  phone: 'Telefon',
  email: 'E-posta',
  residency: 'Yerli / yabancı',
  nationality: 'Uyruk',
  dateOfBirth: 'Doğum tarihi',
  addressLine1: 'Adres',
  addressLine2: 'Adres (2. satır)',
  city: 'Şehir',
  postalCode: 'Posta kodu',
  region: 'Bölge',
  addressCountry: 'Adres ülkesi',
  preferredLanguage: 'Tercih edilen dil',
  contactPreference: 'İletişim tercihi',
  operationalNote: 'Operasyonel not',
}

const regionNames = new Intl.DisplayNames(['tr'], { type: 'region' })
const languageNames = new Intl.DisplayNames(['tr'], { type: 'language' })

export const countryName = (code: string | null | undefined) => {
  if (!code) return null
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

export const languageName = (code: CustomerLanguage | string | null | undefined) => {
  if (!code) return null
  try {
    const name = languageNames.of(code) ?? code
    return name.charAt(0).toLocaleUpperCase('tr') + name.slice(1)
  } catch {
    return code
  }
}

/** Countries for selects: the region's usual ones first, then all, alphabetically in Turkish. */
const FREQUENT = ['BA', 'HR', 'RS', 'ME', 'SI', 'MK', 'AL', 'TR', 'DE', 'AT', 'CH', 'IT', 'FR', 'GB', 'NL', 'US']
export function countryOptions(companyCountry?: string | null) {
  const frequent = [...new Set([companyCountry, ...FREQUENT].filter((c): c is string => !!c && COUNTRY_CODES.includes(c)))].map((code) => ({ code, name: countryName(code)! }))
  const all = COUNTRY_CODES.map((code) => ({ code, name: countryName(code)! })).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  return { frequent, all }
}

/** Initials for the record monogram: "Ajla Testović" → "AT", "Testara" → "TE". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr')
  return (parts[0] ?? '?').slice(0, 2).toLocaleUpperCase('tr')
}
