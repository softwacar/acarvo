import { normalizePlate } from '@acarvo/shared'
import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>

interface DevVehicle {
  plate: string
  code?: string
  make: string
  model: string
  trim?: string
  year?: number
  cls: string
  color?: string
  fuel: (typeof s.FUEL_TYPES)[number]
  gear: (typeof s.TRANSMISSIONS)[number]
  seats?: number
  branch: string
  /** Physical location when different from the home branch. */
  at?: string
  km?: number
  status?: 'active' | 'out_of_service'
  acquisition?: { type: (typeof s.ACQUISITION_TYPES)[number]; date: string; seller?: string; cost?: number }
}

/**
 * Development fleet: identity and master data only. No availability, rental or readiness
 * state is invented; those come from their own modules once built.
 */
const FLEETS: Record<string, { owner: string; currency: string; classes: string[]; vehicles: DevVehicle[] }> = {
  'Drina Rent a Car': {
    owner: 'adnan.kovac@drina-demo.ba',
    currency: 'EUR',
    classes: ['Ekonomi', 'Kompakt', 'Orta', 'SUV', 'Minivan'],
    vehicles: [
      { plate: 'A12-K-345', code: 'DR-001', make: 'Škoda', model: 'Octavia', trim: 'Style 2.0 TDI', year: 2023, cls: 'Orta', color: 'Gri', fuel: 'diesel', gear: 'automatic', seats: 5, branch: 'SJJ', km: 48210, acquisition: { type: 'purchase', date: '2023-03-14', seller: 'ASA Auto d.o.o.', cost: 2890000 } },
      { plate: 'E45-M-218', code: 'DR-002', make: 'Volkswagen', model: 'Golf', trim: 'Life 1.5 TSI', year: 2024, cls: 'Kompakt', color: 'Beyaz', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'SJJ', km: 21540, acquisition: { type: 'lease', date: '2024-02-01', seller: 'Porsche Leasing BH' } },
      { plate: 'K71-J-904', code: 'DR-003', make: 'Renault', model: 'Clio', trim: 'Evolution TCe 90', year: 2023, cls: 'Ekonomi', color: 'Kırmızı', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'SAC', km: 36985 },
      { plate: 'M33-T-120', code: 'DR-004', make: 'Dacia', model: 'Duster', trim: 'Expression 4x4', year: 2022, cls: 'SUV', color: 'Turuncu', fuel: 'diesel', gear: 'manual', seats: 5, branch: 'MST', km: 74310, acquisition: { type: 'purchase', date: '2022-05-20', seller: 'Auto Bošnjak', cost: 2245000 } },
      { plate: 'O58-E-467', code: 'DR-005', make: 'Toyota', model: 'Corolla', trim: 'Hybrid 1.8 Comfort', year: 2024, cls: 'Orta', color: 'Siyah', fuel: 'hybrid', gear: 'automatic', seats: 5, branch: 'SJJ', km: 15020 },
      { plate: 'T09-A-781', code: 'DR-006', make: 'Hyundai', model: 'Tucson', trim: '1.6 T-GDI Prestige', year: 2023, cls: 'SUV', color: 'Lacivert', fuel: 'petrol', gear: 'automatic', seats: 5, branch: 'SAC', km: 41275 },
      { plate: 'A84-O-352', code: 'DR-007', make: 'Peugeot', model: '208', trim: 'Active 1.2', year: 2022, cls: 'Ekonomi', color: 'Sarı', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'MST', km: 68440 },
      { plate: 'J27-K-615', code: 'DR-008', make: 'Fiat', model: 'Tipo', trim: 'City Life 1.6 Multijet', year: 2021, cls: 'Kompakt', color: 'Gri', fuel: 'diesel', gear: 'manual', seats: 5, branch: 'SAC', km: 102380, status: 'out_of_service' },
      { plate: 'E16-T-093', code: 'DR-009', make: 'Volkswagen', model: 'Passat', trim: 'Variant 2.0 TDI Business', year: 2023, cls: 'Orta', color: 'Gümüş', fuel: 'diesel', gear: 'automatic', seats: 5, branch: 'SJJ', km: 55730, acquisition: { type: 'long_term_rent', date: '2023-07-01', seller: 'Sixt Leasing' } },
      { plate: 'K40-M-526', code: 'DR-010', make: 'Škoda', model: 'Kodiaq', trim: 'Selection 2.0 TDI 4x4', year: 2024, cls: 'SUV', color: 'Beyaz', fuel: 'diesel', gear: 'automatic', seats: 7, branch: 'SJJ', at: 'SAC', km: 18960 },
      { plate: 'M62-A-238', code: 'DR-011', make: 'Opel', model: 'Corsa', trim: 'Edition 1.2', year: 2023, cls: 'Ekonomi', color: 'Mavi', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'SJJ', km: 29115 },
      { plate: 'O03-J-874', make: 'Dacia', model: 'Sandero', trim: 'Stepway Expression', year: 2024, cls: 'Ekonomi', color: 'Gri', fuel: 'lpg', gear: 'manual', seats: 5, branch: 'MST' },
      { plate: 'T75-E-410', code: 'DR-013', make: 'Kia', model: 'Sportage', trim: '1.6 T-GDI HEV', year: 2024, cls: 'SUV', color: 'Yeşil', fuel: 'hybrid', gear: 'automatic', seats: 5, branch: 'SAC', km: 12480 },
      { plate: 'A39-T-657', code: 'DR-014', make: 'Mercedes-Benz', model: 'Vito', trim: 'Tourer 116 CDI', year: 2022, cls: 'Minivan', color: 'Siyah', fuel: 'diesel', gear: 'automatic', seats: 9, branch: 'SJJ', km: 88640, acquisition: { type: 'purchase', date: '2022-04-11', seller: 'Mercedes-Benz BH', cost: 4630000 } },
      { plate: 'E92-K-301', code: 'DR-015', make: 'Volkswagen', model: 'Polo', trim: 'Life 1.0 TSI', year: 2023, cls: 'Ekonomi', color: 'Beyaz', fuel: 'petrol', gear: 'automatic', seats: 5, branch: 'SAC', km: 33870 },
      { plate: 'J58-O-142', code: 'DR-016', make: 'Toyota', model: 'Yaris', trim: 'Hybrid 1.5 Active', year: 2024, cls: 'Ekonomi', color: 'Kırmızı', fuel: 'hybrid', gear: 'automatic', seats: 5, branch: 'MST', km: 9850 },
      { plate: 'K14-E-763', code: 'DR-017', make: 'Škoda', model: 'Fabia', trim: 'Ambition 1.0 TSI', year: 2022, cls: 'Ekonomi', color: 'Gri', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'SJJ', km: 61205 },
      { plate: 'M87-J-529', code: 'DR-018', make: 'BMW', model: '320d', trim: 'Touring M Sport', year: 2023, cls: 'Orta', color: 'Siyah', fuel: 'diesel', gear: 'automatic', seats: 5, branch: 'SJJ', km: 39420 },
      { plate: 'O21-M-985', code: 'DR-019', make: 'Renault', model: 'Megane', trim: 'E-Tech Electric EV60', year: 2024, cls: 'Kompakt', color: 'Mavi', fuel: 'electric', gear: 'automatic', seats: 5, branch: 'SAC', km: 14310 },
      { plate: 'T48-K-276', code: 'DR-020', make: 'Ford', model: 'Transit Custom', trim: 'Kombi 2.0 EcoBlue', year: 2021, cls: 'Minivan', color: 'Beyaz', fuel: 'diesel', gear: 'manual', seats: 9, branch: 'MST', km: 126740 },
      { plate: 'A05-J-418', code: 'DR-021', make: 'Hyundai', model: 'i20', trim: 'Trend 1.2', year: 2023, cls: 'Ekonomi', color: 'Gümüş', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'MST', km: 27660 },
      { plate: 'E63-A-847', code: 'DR-022', make: 'Peugeot', model: '3008', trim: 'Allure 1.5 BlueHDi', year: 2022, cls: 'SUV', color: 'Gri', fuel: 'diesel', gear: 'automatic', seats: 5, branch: 'SJJ', km: 70195 },
    ],
  },
  'Neretva Rent': {
    owner: 'lejla.begic@neretva-demo.ba',
    currency: 'BAM',
    classes: ['Ekonomi', 'Kompakt', 'SUV'],
    vehicles: [
      { plate: 'M21-O-650', code: 'NR-01', make: 'Volkswagen', model: 'T-Roc', trim: 'Life 1.5 TSI', year: 2023, cls: 'SUV', color: 'Beyaz', fuel: 'petrol', gear: 'automatic', seats: 5, branch: 'MOC', km: 32560, acquisition: { type: 'purchase', date: '2023-04-03', seller: 'Porsche BH', cost: 5480000 } },
      { plate: 'J66-E-193', code: 'NR-02', make: 'Škoda', model: 'Scala', trim: 'Ambition 1.0 TSI', year: 2022, cls: 'Kompakt', color: 'Gri', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'MOC', km: 58920 },
      { plate: 'O47-K-332', code: 'NR-03', make: 'Dacia', model: 'Logan', trim: 'Essential 1.0 TCe', year: 2023, cls: 'Ekonomi', color: 'Mavi', fuel: 'petrol', gear: 'manual', seats: 5, branch: 'MOC', km: 40115 },
      { plate: 'E30-T-584', code: 'NR-04', make: 'Toyota', model: 'C-HR', trim: 'Hybrid 2.0 Style', year: 2024, cls: 'SUV', color: 'Kırmızı', fuel: 'hybrid', gear: 'automatic', seats: 5, branch: 'MOC', km: 11240 },
    ],
  },
}

export async function ensureDevFleet(db: OwnerDb) {
  const summary: string[] = []
  for (const [companyName, fleet] of Object.entries(FLEETS)) {
    const [company] = await db.select().from(s.companies).where(eq(s.companies.name, companyName))
    if (!company) continue
    const [owner] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${fleet.owner}`)
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      let classes = await tx.select().from(s.vehicleClasses)
      if (!classes.length) {
        classes = await tx
          .insert(s.vehicleClasses)
          .values(fleet.classes.map((name, i) => ({ companyId: company.id, name, sortOrder: (i + 1) * 10 })))
          .returning()
        summary.push(`${companyName}: ${classes.length} araç sınıfı`)
      }
      const existing = await tx.select({ id: s.vehicles.id }).from(s.vehicles).limit(1)
      if (existing.length) return
      const branchRows = await tx.select().from(s.branches)
      const branchId = (code: string) => branchRows.find((b) => b.code === code)!.id
      const classId = (name: string) => classes.find((c) => c.name === name)!.id
      // Spread registration times so "created" ordering is meaningful.
      const start = Date.UTC(2026, 6, 1, 8)
      for (const [i, v] of fleet.vehicles.entries()) {
        const at = new Date(start + i * 36 * 3600 * 1000)
        const [row] = await tx
          .insert(s.vehicles)
          .values({
            companyId: company.id,
            plate: v.plate,
            plateNormalized: normalizePlate(v.plate),
            vehicleCode: v.code ?? null,
            make: v.make,
            model: v.model,
            trim: v.trim ?? null,
            modelYear: v.year ?? null,
            classId: classId(v.cls),
            color: v.color ?? null,
            fuelType: v.fuel,
            transmission: v.gear,
            seats: v.seats ?? null,
            source: 'internal',
            homeBranchId: branchId(v.branch),
            status: v.status ?? 'active',
            acquisitionType: v.acquisition?.type ?? null,
            acquisitionDate: v.acquisition?.date ?? null,
            acquisitionSeller: v.acquisition?.seller ?? null,
            acquisitionCostMinor: v.acquisition?.cost ?? null,
            acquisitionCurrency: v.acquisition?.cost ? fleet.currency : null,
            createdAt: at,
            updatedAt: at,
            createdBy: owner?.id ?? null,
            updatedBy: owner?.id ?? null,
          })
          .returning({ id: s.vehicles.id })
        if (v.km !== undefined) {
          await tx.insert(s.odometerReadings).values({
            companyId: company.id,
            vehicleId: row!.id,
            km: v.km,
            eventType: 'initial',
            sourceType: 'vehicle_create',
            occurredAt: at,
            note: 'Geliştirme verisi: başlangıç kilometresi',
            recordedBy: owner?.id ?? null,
          })
        }
        await tx.insert(s.vehicleLocationEvents).values({
          companyId: company.id,
          vehicleId: row!.id,
          locationType: 'branch',
          branchId: branchId(v.at ?? v.branch),
          eventType: 'initial',
          sourceType: 'vehicle_create',
          description: 'Geliştirme verisi: başlangıç konumu',
          occurredAt: at,
          recordedBy: owner?.id ?? null,
        })
      }
      summary.push(`${companyName}: ${fleet.vehicles.length} araç`)
    })
  }
  return summary
}
