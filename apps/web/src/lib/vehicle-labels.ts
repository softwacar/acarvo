import type { AcquisitionType, FuelType, LocationSummary, Transmission, VehicleStatus } from '@acarvo/shared'

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

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const formatMoney = (amount: string, currency: string) =>
  `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))} ${currency}`
