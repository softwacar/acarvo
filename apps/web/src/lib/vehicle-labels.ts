import { type AcquisitionType, type FuelType, type LocationSummary, type Transmission, type VehicleStatus, formatDateOnly, isDateOnly } from '@acarvo/shared'

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: 'Benzin',
  diesel: 'Dizel',
  hybrid: 'Hibrit',
  plug_in_hybrid: 'Şarj edilebilir hibrit',
  electric: 'Elektrik',
  lpg: 'LPG',
}

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: 'Manuel',
  automatic: 'Otomatik',
}

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  active: 'Aktif',
  out_of_service: 'Hizmet dışı',
  sold: 'Satıldı',
  disposed: 'Filodan çıktı',
}

export const ACQUISITION_LABELS: Record<AcquisitionType, string> = {
  purchase: 'Satın alma',
  lease: 'Leasing',
  long_term_rent: 'Uzun dönem kiralama',
  other: 'Diğer',
}

export const LOCATION_LABELS: Record<LocationSummary['type'], string> = {
  branch: 'Şubede',
  in_transit: 'Yolda',
  with_customer: 'Müşteride',
  service_provider: 'Serviste',
  supplier: 'Tedarikçide',
}

const nf = new Intl.NumberFormat('tr-TR')
export const formatKm = (km: number) => `${nf.format(km)} km`

/**
 * Instants are shown in the active company's time zone (set from the session), so every user of a company
 * sees the same clock time whatever their computer's zone. Calendar dates are never converted.
 */
let displayTimeZone: string | undefined
export const setDisplayTimeZone = (timeZone: string | undefined) => {
  displayTimeZone = timeZone
}
export const getDisplayTimeZone = () => displayTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

export const formatDate = (value: string) =>
  isDateOnly(value) ? formatDateOnly(value) : new Intl.DateTimeFormat('tr-TR', { timeZone: displayTimeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone: displayTimeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const formatMoney = (amount: string, currency: string) =>
  `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))} ${currency}`
