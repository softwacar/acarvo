// Demo fleet for the Araçlar prototype. All records are fictional sample data.

export const WINDOW_START = new Date(2026, 9, 7) // 07.10.2026, Sarajevo local
export const WINDOW_DAYS = 14
export const NOW = new Date(2026, 9, 9, 14, 30)

/** Day offset from WINDOW_START for a date in October 2026 at "HH:MM". */
export function at(day: number, time = '00:00'): number {
  const [h, m] = time.split(':').map(Number)
  return day - 7 + (h + m / 60) / 24
}

export const NOW_OFFSET = at(9, '14:30')

export type SegmentKind = 'rental' | 'reservation' | 'maintenance' | 'transfer' | 'out'

export interface Segment {
  kind: SegmentKind
  from: number
  to: number
  ref: string
  who?: string
  note?: string
}

export type Readiness = 'ready' | 'check' | 'blocked'
export type LocationKind = 'branch' | 'customer' | 'service' | 'transit' | 'supplier'

export interface Vehicle {
  id: string
  plate: string
  make: string
  model: string
  vehicleClass: string
  year: number
  spec: string
  source: 'own' | 'external'
  supplier?: string
  homeBranch: string
  location: { kind: LocationKind; label: string }
  km: number
  kmNote: string
  fuel: string
  readiness: Readiness
  blockers: string[]
  keys: string
  segments: Segment[]
}

export const BRANCHES = ['Sarajevo Aerodrom', 'Sarajevo Centar', 'Mostar'] as const
export const CLASSES = ['B sınıfı', 'C sınıfı', 'SUV', 'Premium', 'Van'] as const

export const vehicles: Vehicle[] = [
  {
    id: 'v01', plate: 'A12-K-345', make: 'Škoda', model: 'Octavia 2.0 TDI', vehicleClass: 'C sınıfı', year: 2023,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'customer', label: 'Müşteride' }, km: 48215, kmNote: 'Teslimde okundu, 05.10', fuel: '3/4',
    readiness: 'check', blockers: ['Muayene 21.10’da bitiyor', 'Dönüşte temizlik gerekli'], keys: 'Ana set müşteride, yedek şubede',
    segments: [
      { kind: 'rental', from: at(5, '09:00'), to: at(9, '18:00'), ref: 'K-2026-0418', who: 'Emina Hadžić' },
      { kind: 'reservation', from: at(10, '10:30'), to: at(14, '10:00'), ref: 'R-2026-0733', who: 'Ivana Kovačević' },
      { kind: 'maintenance', from: at(15, '08:00'), to: at(15, '17:00'), ref: 'B-2026-0102', note: 'Periyodik bakım 50.000 km' },
    ],
  },
  {
    id: 'v02', plate: 'E47-J-902', make: 'Volkswagen', model: 'Golf 1.5 TSI', vehicleClass: 'C sınıfı', year: 2024,
    spec: 'Benzin, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'branch', label: 'Sarajevo Aerodrom' }, km: 21880, kmNote: 'İadede okundu, 08.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(3, '12:00'), to: at(8, '11:00'), ref: 'K-2026-0401', who: 'Lukas Bauer' },
      { kind: 'reservation', from: at(11, '10:30'), to: at(16, '10:30'), ref: 'R-2026-0741', who: 'Mehmet Yılmaz' },
    ],
  },
  {
    id: 'v03', plate: 'K21-T-118', make: 'Toyota', model: 'Corolla 1.8 Hybrid', vehicleClass: 'C sınıfı', year: 2024,
    spec: 'Hibrit, otomatik', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'branch', label: 'Sarajevo Centar' }, km: 15402, kmNote: 'İadede okundu, 06.10', fuel: '1/2',
    readiness: 'blocked', blockers: ['Arka tampon hasarı, inceleme bekliyor', 'Yakıt 1/2, dolum gerekli'], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(1, '09:00'), to: at(6, '17:00'), ref: 'K-2026-0388', who: 'Amra Begić' },
      { kind: 'reservation', from: at(13, '09:00'), to: at(19, '09:00'), ref: 'R-2026-0752', who: 'Sophie Laurent' },
    ],
  },
  {
    id: 'v04', plate: 'M03-A-561', make: 'Dacia', model: 'Duster 1.5 dCi 4x4', vehicleClass: 'SUV', year: 2022,
    spec: 'Dizel, manuel', source: 'own', homeBranch: 'Mostar',
    location: { kind: 'service', label: 'Auto Centar Mostar' }, km: 92034, kmNote: 'Servise girişte, 08.10', fuel: '1/4',
    readiness: 'blocked', blockers: ['Bakım sürüyor, bitiş 12.10'], keys: 'Ana set serviste',
    segments: [
      { kind: 'maintenance', from: at(8, '08:00'), to: at(12, '16:00'), ref: 'B-2026-0091', note: 'Debriyaj seti değişimi' },
      { kind: 'reservation', from: at(14, '12:00'), to: at(18, '12:00'), ref: 'R-2026-0760', who: 'Tarık Delić' },
    ],
  },
  {
    id: 'v05', plate: 'O88-E-240', make: 'Hyundai', model: 'Tucson 1.6 CRDi', vehicleClass: 'SUV', year: 2023,
    spec: 'Dizel, otomatik', source: 'external', supplier: 'Drina Fleet d.o.o.', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'branch', label: 'Sarajevo Aerodrom' }, km: 33770, kmNote: 'Tedarikçiden teslim alındı, 07.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Tek set şubede',
    segments: [
      { kind: 'reservation', from: at(9, '16:00'), to: at(13, '16:00'), ref: 'R-2026-0744', who: 'Selin Aydın' },
      { kind: 'out', from: at(17, '12:00'), to: at(21, '00:00'), ref: 'TS-2026-0031', note: 'Tedarikçiye iade 17.10' },
    ],
  },
  {
    id: 'v06', plate: 'J55-M-713', make: 'Renault', model: 'Clio 1.0 TCe', vehicleClass: 'B sınıfı', year: 2023,
    spec: 'Benzin, manuel', source: 'own', homeBranch: 'Mostar',
    location: { kind: 'transit', label: 'Yolda, Sarajevo Centar’a' }, km: 27119, kmNote: 'Transfer çıkışında, 09.10', fuel: '3/4',
    readiness: 'check', blockers: ['Transfer sonrası hazırlık kontrolü'], keys: 'Ana set şoförde',
    segments: [
      { kind: 'transfer', from: at(9, '11:00'), to: at(9, '18:00'), ref: 'T-2026-0022', note: 'Mostar → Sarajevo Centar' },
      { kind: 'reservation', from: at(10, '09:00'), to: at(12, '09:00'), ref: 'R-2026-0738', who: 'Marko Perić' },
      { kind: 'reservation', from: at(15, '14:00'), to: at(20, '14:00'), ref: 'R-2026-0765', who: 'Jana Novak' },
    ],
  },
  {
    id: 'v07', plate: 'T10-O-387', make: 'Mercedes-Benz', model: 'Vito Tourer 116 CDI', vehicleClass: 'Van', year: 2021,
    spec: 'Dizel, otomatik, 9 kişilik', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'customer', label: 'Müşteride' }, km: 141506, kmNote: 'Teslimde okundu, 02.10', fuel: 'Dolu',
    readiness: 'check', blockers: ['İade gecikti, müşteriye ulaşılamadı'], keys: 'Ana set müşteride',
    segments: [
      { kind: 'rental', from: at(2, '10:00'), to: at(9, '12:00'), ref: 'K-2026-0402', who: 'Ahmed Al-Rashid', note: 'Gecikmiş iade' },
      { kind: 'reservation', from: at(12, '08:00'), to: at(15, '20:00'), ref: 'R-2026-0749', who: 'Kurumsal: BH Telecom' },
    ],
  },
  {
    id: 'v08', plate: 'A64-J-055', make: 'Peugeot', model: '2008 1.2 PureTech', vehicleClass: 'B sınıfı', year: 2024,
    spec: 'Benzin, otomatik', source: 'external', supplier: 'Neretva Rent', homeBranch: 'Sarajevo Centar',
    location: { kind: 'branch', label: 'Sarajevo Centar' }, km: 9310, kmNote: 'Tedarikçiden teslim alındı, 06.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'reservation', from: at(10, '13:00'), to: at(12, '13:00'), ref: 'R-2026-0739', who: 'Haris Mujić' },
    ],
  },
  {
    id: 'v09', plate: 'E19-K-622', make: 'Škoda', model: 'Kodiaq 2.0 TDI 4x4', vehicleClass: 'SUV', year: 2022,
    spec: 'Dizel, otomatik, 7 kişilik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'branch', label: 'Sarajevo Aerodrom' }, km: 76940, kmNote: 'İadede okundu, 04.10', fuel: '3/4',
    readiness: 'blocked', blockers: ['Ön cam çatlak, hasar kaydı H-2026-0017', 'Kasko poliçesi 08.10’da sona erdi'], keys: 'İki set şubede',
    segments: [
      { kind: 'out', from: at(4, '15:00'), to: at(16, '00:00'), ref: 'H-2026-0017', note: 'Hasar nedeniyle kullanım dışı' },
    ],
  },
  {
    id: 'v10', plate: 'K07-E-433', make: 'Volkswagen', model: 'Passat Variant 2.0 TDI', vehicleClass: 'Premium', year: 2023,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'customer', label: 'Müşteride' }, km: 58720, kmNote: 'Teslimde okundu, 08.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Ana set müşteride, yedek şubede',
    segments: [
      { kind: 'rental', from: at(8, '08:30'), to: at(15, '08:30'), ref: 'K-2026-0421', who: 'Nermina Softić' },
      { kind: 'reservation', from: at(16, '11:00'), to: at(20, '11:00'), ref: 'R-2026-0770', who: 'Dario Jurić' },
    ],
  },
  {
    id: 'v11', plate: 'M44-T-170', make: 'Renault', model: 'Clio 1.0 TCe', vehicleClass: 'B sınıfı', year: 2024,
    spec: 'Benzin, manuel', source: 'own', homeBranch: 'Mostar',
    location: { kind: 'branch', label: 'Mostar' }, km: 12044, kmNote: 'İadede okundu, 07.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(4, '10:00'), to: at(7, '19:00'), ref: 'K-2026-0395', who: 'Lejla Hodžić' },
    ],
  },
  {
    id: 'v12', plate: 'A30-O-918', make: 'BMW', model: '320d Touring', vehicleClass: 'Premium', year: 2024,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'customer', label: 'Müşteride' }, km: 23415, kmNote: 'Teslimde okundu, 09.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Ana set müşteride, yedek şubede',
    segments: [
      { kind: 'rental', from: at(9, '09:15'), to: at(12, '09:00'), ref: 'K-2026-0425', who: 'Kurumsal: ASA Grupa' },
      { kind: 'reservation', from: at(12, '15:00'), to: at(19, '15:00'), ref: 'R-2026-0756', who: 'Thomas Weber' },
    ],
  },
  {
    id: 'v13', plate: 'J18-K-664', make: 'Fiat', model: 'Tipo 1.6 Multijet', vehicleClass: 'C sınıfı', year: 2022,
    spec: 'Dizel, manuel', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'branch', label: 'Sarajevo Centar' }, km: 88310, kmNote: 'İadede okundu, 09.10', fuel: '1/4',
    readiness: 'check', blockers: ['Yakıt 1/4, dolum gerekli', 'Bakıma 1.690 km kaldı'], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(6, '12:00'), to: at(9, '10:00'), ref: 'K-2026-0410', who: 'Adnan Kurt' },
      { kind: 'reservation', from: at(9, '17:30'), to: at(11, '17:30'), ref: 'R-2026-0747', who: 'Elif Şahin' },
    ],
  },
  {
    id: 'v14', plate: 'O52-A-207', make: 'Toyota', model: 'RAV4 2.5 Hybrid AWD', vehicleClass: 'SUV', year: 2024,
    spec: 'Hibrit, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'branch', label: 'Sarajevo Aerodrom' }, km: 19830, kmNote: 'Bakım çıkışında, 07.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'maintenance', from: at(6, '08:00'), to: at(7, '15:00'), ref: 'B-2026-0088', note: 'Kış lastiği takımı' },
      { kind: 'reservation', from: at(10, '07:00'), to: at(17, '07:00'), ref: 'R-2026-0736', who: 'Kenan Ademović' },
    ],
  },
  {
    id: 'v15', plate: 'T63-J-581', make: 'Opel', model: 'Corsa 1.2', vehicleClass: 'B sınıfı', year: 2023,
    spec: 'Benzin, manuel', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'customer', label: 'Müşteride' }, km: 31602, kmNote: 'Teslimde okundu, 07.10', fuel: '3/4',
    readiness: 'ready', blockers: [], keys: 'Ana set müşteride',
    segments: [
      { kind: 'rental', from: at(7, '11:00'), to: at(10, '11:00'), ref: 'K-2026-0414', who: 'Maja Kovač' },
      { kind: 'reservation', from: at(11, '09:00'), to: at(14, '09:00'), ref: 'R-2026-0742', who: 'Aida Mehmedović' },
      { kind: 'reservation', from: at(16, '10:00'), to: at(20, '18:00'), ref: 'R-2026-0768', who: 'Petra Horvat' },
    ],
  },
  {
    id: 'v16', plate: 'E09-M-350', make: 'Škoda', model: 'Superb 2.0 TDI', vehicleClass: 'Premium', year: 2023,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'branch', label: 'Sarajevo Aerodrom' }, km: 64288, kmNote: 'İadede okundu, 09.10', fuel: 'Dolu',
    readiness: 'check', blockers: ['İç temizlik bekliyor'], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(4, '08:00'), to: at(9, '08:00'), ref: 'K-2026-0399', who: 'Kurumsal: Energoinvest' },
      { kind: 'reservation', from: at(10, '15:00'), to: at(13, '15:00'), ref: 'R-2026-0740', who: 'Kurumsal: Energoinvest' },
    ],
  },
  {
    id: 'v17', plate: 'K36-O-842', make: 'Dacia', model: 'Sandero Stepway 1.0', vehicleClass: 'B sınıfı', year: 2024,
    spec: 'Benzin, manuel', source: 'own', homeBranch: 'Mostar',
    location: { kind: 'branch', label: 'Mostar' }, km: 8120, kmNote: 'İadede okundu, 09.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'reservation', from: at(9, '13:00'), to: at(12, '13:00'), ref: 'R-2026-0745', who: 'Jasmin Halilović', note: 'Müşteri gelmedi, 1,5 saat gecikme' },
    ],
  },
  {
    id: 'v18', plate: 'A77-E-126', make: 'Hyundai', model: 'i30 1.5 T-GDi', vehicleClass: 'C sınıfı', year: 2023,
    spec: 'Benzin, otomatik', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'branch', label: 'Sarajevo Centar' }, km: 40127, kmNote: 'İadede okundu, 05.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'İki set şubede',
    segments: [
      { kind: 'rental', from: at(1, '10:00'), to: at(5, '10:00'), ref: 'K-2026-0381', who: 'Ana Babić' },
      { kind: 'reservation', from: at(18, '09:00'), to: at(21, '00:00'), ref: 'R-2026-0771', who: 'Dženan Musić' },
    ],
  },
  {
    id: 'v19', plate: 'M28-K-509', make: 'Volkswagen', model: 'T-Roc 1.5 TSI', vehicleClass: 'SUV', year: 2024,
    spec: 'Benzin, otomatik', source: 'external', supplier: 'Drina Fleet d.o.o.', homeBranch: 'Mostar',
    location: { kind: 'customer', label: 'Müşteride' }, km: 17455, kmNote: 'Teslimde okundu, 06.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Tek set müşteride',
    segments: [
      { kind: 'rental', from: at(6, '14:00'), to: at(13, '14:00'), ref: 'K-2026-0408', who: 'Francesca Romano' },
      { kind: 'out', from: at(14, '10:00'), to: at(21, '00:00'), ref: 'TS-2026-0029', note: 'Tedarikçiye iade 14.10' },
    ],
  },
  {
    id: 'v20', plate: 'J91-A-033', make: 'Ford', model: 'Transit Custom 2.0', vehicleClass: 'Van', year: 2022,
    spec: 'Dizel, manuel, 9 kişilik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'service', label: 'Euroservis Sarajevo' }, km: 118902, kmNote: 'Servise girişte, 09.10', fuel: '1/2',
    readiness: 'blocked', blockers: ['Lastik değişimi sürüyor'], keys: 'Ana set serviste',
    segments: [
      { kind: 'maintenance', from: at(9, '09:00'), to: at(10, '12:00'), ref: 'B-2026-0097', note: 'Kış lastiği ve rot balans' },
      { kind: 'reservation', from: at(11, '07:00'), to: at(14, '19:00'), ref: 'R-2026-0743', who: 'Kurumsal: Sarajevo Film Festival' },
    ],
  },
  {
    id: 'v21', plate: 'O14-T-776', make: 'Kia', model: 'Ceed SW 1.6 CRDi', vehicleClass: 'C sınıfı', year: 2023,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Aerodrom',
    location: { kind: 'customer', label: 'Müşteride' }, km: 52390, kmNote: 'Teslimde okundu, 09.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Ana set müşteride, yedek şubede',
    segments: [
      { kind: 'rental', from: at(9, '07:45'), to: at(19, '07:45'), ref: 'K-2026-0424', who: 'Yusuf Arslan' },
    ],
  },
  {
    id: 'v22', plate: 'T25-E-490', make: 'Mercedes-Benz', model: 'C 220 d', vehicleClass: 'Premium', year: 2024,
    spec: 'Dizel, otomatik', source: 'own', homeBranch: 'Sarajevo Centar',
    location: { kind: 'transit', label: 'Yolda, Sarajevo Aerodrom’a' }, km: 14802, kmNote: 'Transfer çıkışında, 09.10', fuel: 'Dolu',
    readiness: 'ready', blockers: [], keys: 'Ana set şoförde',
    segments: [
      { kind: 'transfer', from: at(9, '13:30'), to: at(9, '15:00'), ref: 'T-2026-0024', note: 'Sarajevo Centar → Aerodrom' },
      { kind: 'reservation', from: at(9, '17:00'), to: at(12, '17:00'), ref: 'R-2026-0750', who: 'Kurumsal: UniCredit' },
    ],
  },
]
