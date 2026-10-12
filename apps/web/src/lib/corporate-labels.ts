import type {
  AddressKind,
  ChannelKind,
  CorporateArchiveReason,
  CorporateDuplicateReason,
  CorporateRestoreReason,
  DriverLicenceSummary,
  PersonEndReason,
  PersonRole,
  TaxIdWarning,
  TaxValidity,
} from '@acarvo/shared'

export const CORPORATE_ARCHIVE_REASON_LABELS: Record<CorporateArchiveReason, string> = {
  inactive: 'Artık çalışmıyoruz',
  duplicate: 'Mükerrer kayıt',
  customer_request: 'Şirketin talebi',
  entry_error: 'Hatalı kayıt',
  other: 'Diğer',
}

export const CORPORATE_RESTORE_REASON_LABELS: Record<CorporateRestoreReason, string> = {
  reactivated: 'Yeniden çalışmaya başladık',
  archived_by_mistake: 'Yanlışlıkla arşivlenmişti',
  other: 'Diğer',
}

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = { phone: 'Telefon', email: 'E-posta', website: 'Web sitesi', other: 'Diğer' }

/** D3: what staff checked; never a legal statement about the number. */
export const TAX_VALIDITY_LABELS: Record<TaxValidity, string> = {
  not_checked: 'Kontrol edilmedi',
  checked_by_staff: 'Personel belgeden kontrol etti',
  no_longer_used: 'Artık kullanılmıyor',
}

export const TAX_WARNING_LABELS: Record<TaxIdWarning, string> = {
  short: 'Değer çok kısa görünüyor',
  unusual_characters: 'Harf ve rakam dışında karakter var',
  prefix_mismatch: 'Baştaki ülke kodu seçilen ülkeyle uyuşmuyor olabilir',
}

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  registered: 'Resmi (kayıtlı) adres',
  billing: 'Fatura adresi',
  postal: 'Yazışma / iletişim adresi',
  other: 'Diğer adres',
}

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  representative: 'Hesap yetkilisi',
  contact: 'İletişim kişisi',
  booker: 'Rezervasyon sorumlusu',
  authorized_driver: 'Yetkili sürücü',
  billing_contact: 'Faturalama iletişim kişisi',
  other: 'Diğer',
}

export const PERSON_END_REASON_LABELS: Record<PersonEndReason, string> = {
  left_company: 'Şirketten ayrıldı',
  role_ended: 'Görevi sona erdi',
  entry_error: 'Hatalı bağlantı',
  other: 'Diğer',
}

export const CORPORATE_DUPLICATE_REASON_LABELS: Record<CorporateDuplicateReason, string> = {
  tax_id: 'Aynı vergi kimliği',
  email: 'Aynı e-posta',
  phone: 'Aynı telefon',
  name: 'Aynı resmi unvan',
  registration: 'Aynı ülkede aynı sicil no',
}

export const LICENCE_LABELS: Record<DriverLicenceSummary['state'], string> = {
  valid: 'Ehliyet geçerli',
  expiring: 'Ehliyet süresi yaklaşıyor',
  expired: 'Ehliyet süresi dolmuş',
  missing: 'Ehliyet kaydı yok',
}

/** Field names in the account history (values of tax ids, addresses and contacts are never copied). */
export const CORPORATE_FIELD_LABELS: Record<string, string> = {
  legalName: 'Resmi unvan',
  tradeName: 'Kısa ad',
  country: 'Ülke',
  registrationNumber: 'Sicil no',
  registrationAuthority: 'Sicil makamı',
  preferredLanguage: 'Yazışma dili',
  note: 'Not',
  kind: 'Tür',
  value: 'Değer',
  label: 'Etiket',
  isPrimary: 'Birincil',
  scheme: 'Vergi kimliği türü',
  validity: 'Kontrol durumu',
  line1: 'Açık adres',
  line2: 'Adres (2. satır)',
  city: 'Şehir',
  region: 'Bölge',
  postalCode: 'Posta kodu',
  roles: 'Roller',
  jobTitle: 'Görev',
  validFrom: 'Başlangıç',
  validUntil: 'Bitiş',
}
