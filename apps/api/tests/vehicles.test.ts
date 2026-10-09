import type { VehicleDetail, VehicleListItem } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

let data: DevData
let app: FastifyInstance
let adnan: Client
let lejla: Client
let selma: Client
let classes: Record<string, string>
let neretvaClassId: string

const list = async (c: Client, query = '') => {
  const res = await c.get(`/api/vehicles${query ? `?${query}` : ''}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { items: VehicleListItem[]; total: number; page: number; pageSize: number }
}
const plates = (items: VehicleListItem[]) => items.map((v) => v.plate)
const findId = async (c: Client, plate: string) => (await list(c, `q=${encodeURIComponent(plate)}`)).items[0]!.id
const getDetail = async (c: Client, id: string) => (await c.get(`/api/vehicles/${id}`)).json() as VehicleDetail

const newVehicle = (over: Record<string, unknown> = {}) => ({
  plate: 'T11-E-111',
  vehicleCode: 'DR-900',
  make: 'Škoda',
  model: 'Superb',
  trim: 'L&K 2.0 TDI',
  modelYear: 2025,
  classId: classes.Orta,
  color: 'Siyah',
  vin: 'TMBJJ9NP0R7012345',
  fuelType: 'diesel',
  transmission: 'automatic',
  seats: 5,
  homeBranchId: data.drina.branches.SJJ,
  acquisitionType: 'purchase',
  acquisitionDate: '2025-01-15',
  acquisitionSeller: 'ASA Auto d.o.o.',
  acquisitionCost: '41250,50',
  acquisitionCurrency: 'EUR',
  initialOdometerKm: 12,
  ...over,
})
/** Edit body built from a loaded record, as the web form sends it. */
const editBody = (v: VehicleDetail, over: Record<string, unknown> = {}) => ({
  plate: v.plate,
  vehicleCode: v.vehicleCode,
  make: v.make,
  model: v.model,
  trim: v.trim,
  modelYear: v.modelYear,
  classId: v.classId,
  color: v.color,
  vin: v.vin,
  fuelType: v.fuelType,
  transmission: v.transmission,
  seats: v.seats,
  homeBranchId: v.homeBranchId,
  status: v.status,
  acquisitionType: v.acquisitionType,
  acquisitionDate: v.acquisitionDate,
  acquisitionSeller: v.acquisitionSeller,
  acquisitionCost: v.acquisitionCost,
  acquisitionCurrency: v.acquisitionCurrency,
  acquisitionReference: v.acquisitionReference,
  notes: v.notes,
  version: v.version,
  ...over,
})

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  lejla = new Client(app)
  selma = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
  const cls = (await adnan.get('/api/vehicle-classes')).json().items as { id: string; name: string }[]
  classes = Object.fromEntries(cls.map((c) => [c.name, c.id]))
  neretvaClassId = ((await lejla.get('/api/vehicle-classes')).json().items as { id: string }[])[0]!.id
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('database', () => {
  it('vehicle tables are company-isolated: no context, no rows', async () => {
    const counts = await asApp(null, async (c) => ({
      vehicles: (await c.query('select count(*)::int n from vehicles')).rows[0].n,
      classes: (await c.query('select count(*)::int n from vehicle_classes')).rows[0].n,
      odometer: (await c.query('select count(*)::int n from odometer_readings')).rows[0].n,
    }))
    expect(counts).toEqual({ vehicles: 0, classes: 0, odometer: 0 })
  })

  it('odometer and location history are append-only and vehicles cannot be deleted', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query('update odometer_readings set km = 1'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from odometer_readings'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from vehicle_location_events'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from vehicles'))).rejects.toThrow(/permission denied/)
  })

  it('a vehicle cannot point to another company class or branch', async () => {
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(
          `insert into vehicles (company_id, plate, plate_normalized, make, model, class_id, fuel_type, transmission, home_branch_id)
           values ($1, 'X1', 'X1', 'A', 'B', $2, 'petrol', 'manual', $3)`,
          [data.companies.drina, neretvaClassId, data.drina.branches.SJJ],
        ),
      ),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('list', () => {
  it('shows only the active company fleet', async () => {
    const drina = await list(adnan, 'pageSize=100')
    const neretva = await list(lejla, 'pageSize=100')
    expect(drina.total).toBe(22)
    expect(neretva.total).toBe(4)
    expect(plates(drina.items)).not.toContain('M21-O-650')
    expect(plates(neretva.items)).not.toContain('A12-K-345')
  })

  it('searches plate (ignoring spaces and dashes), vehicle code and make/model', async () => {
    expect(plates((await list(adnan, 'q=a12 k')).items)).toEqual(['A12-K-345'])
    expect(plates((await list(adnan, 'q=dr-003')).items)).toEqual(['K71-J-904'])
    expect(plates((await list(adnan, `q=${encodeURIComponent('škoda')}`)).items).sort()).toEqual(['A12-K-345', 'K14-E-763', 'K40-M-526'])
    expect((await list(lejla, 'q=A12-K-345')).total).toBe(0)
  })

  it('filters by class, status, fuel and transmission', async () => {
    const suv = await list(adnan, `classId=${classes.SUV}&pageSize=100`)
    expect(suv.items.every((v) => v.className === 'SUV')).toBe(true)
    expect(suv.total).toBe(5)
    expect(plates((await list(adnan, 'status=out_of_service')).items)).toEqual(['J27-K-615'])
    expect(plates((await list(adnan, 'fuelType=electric')).items)).toEqual(['O21-M-985'])
    const manualDiesel = await list(adnan, 'fuelType=diesel&transmission=manual&pageSize=100')
    expect(plates(manualDiesel.items).sort()).toEqual(['J27-K-615', 'M33-T-120', 'T48-K-276'])
  })

  it('sorts by derived kilometre with unknown values last, and by plate', async () => {
    const byKm = await list(adnan, 'sort=km&dir=desc&pageSize=100')
    expect(byKm.items[0]!.plate).toBe('T48-K-276')
    expect(byKm.items.at(-1)!.odometer).toBeNull()
    const kms = byKm.items.filter((v) => v.odometer).map((v) => v.odometer!.km)
    expect(kms).toEqual([...kms].sort((a, b) => b - a))
    const byPlate = await list(adnan, 'sort=plate&dir=asc&pageSize=100')
    expect(plates(byPlate.items)).toEqual([...plates(byPlate.items)].sort((a, b) => a.replace(/-/g, '').localeCompare(b.replace(/-/g, ''))))
  })

  it('paginates with the full total', async () => {
    const p3 = await list(adnan, 'pageSize=10&page=3')
    expect(p3).toMatchObject({ total: 22, page: 3, pageSize: 10 })
    expect(p3.items).toHaveLength(2)
    const beyond = await list(adnan, 'pageSize=10&page=9')
    expect(beyond.items).toHaveLength(0)
    expect(beyond.total).toBe(22)
  })

  it('reports current km and location from their event history', async () => {
    const k40 = (await list(adnan, 'q=K40-M-526')).items[0]!
    expect(k40.odometer!.km).toBe(18960)
    expect(k40.homeBranch.code).toBe('SJJ')
    expect(k40.location).toMatchObject({ type: 'branch', branchName: 'Sarajevo Centar' })
    expect((await list(adnan, 'q=O03-J-874')).items[0]!.odometer).toBeNull()
  })
})

describe('branch scope', () => {
  it('a branch-limited user lists only vehicles of their branches', async () => {
    const res = await list(selma, 'pageSize=100')
    expect(res.total).toBe(10)
    expect(res.items.every((v) => v.homeBranch.code === 'SJJ')).toBe(true)
    expect((await list(selma, `branchId=${data.drina.branches.SAC}`)).total).toBe(0)
  })

  it('a branch-limited user cannot open a vehicle of another branch', async () => {
    const sacId = await findId(adnan, 'T09-A-781')
    expect((await selma.get(`/api/vehicles/${sacId}`)).statusCode).toBe(404)
  })

  it('read-only role cannot create or update', async () => {
    const sjjId = await findId(selma, 'A12-K-345')
    const v = await getDetail(selma, sjjId)
    expect((await selma.post('/api/vehicles', newVehicle({ plate: 'S00-E-001', vehicleCode: null }))).statusCode).toBe(403)
    const put = await selma.put(`/api/vehicles/${sjjId}`, editBody(v, { color: 'Mor' }))
    expect(put.statusCode).toBe(403)
  })

  it('with edit rights, a branch-limited user still cannot reach or move vehicles outside their branches', async () => {
    const opRole = (await asOwner(data.companies.drina, `select id from roles where name = 'Operasyon'`)).rows[0].id
    await asOwner(data.companies.drina, `update roles set permissions = permissions || '{vehicles.create,vehicles.update}' where id = $1`, [opRole])
    try {
      const sjjId = await findId(selma, 'A12-K-345')
      const v = await getDetail(selma, sjjId)
      const move = await selma.put(`/api/vehicles/${sjjId}`, editBody(v, { homeBranchId: data.drina.branches.SAC }))
      expect(move.statusCode).toBe(403)
      expect(move.json().error.code).toBe('BRANCH_FORBIDDEN')

      const sacId = await findId(adnan, 'T09-A-781')
      const sac = await getDetail(adnan, sacId)
      const other = await selma.put(`/api/vehicles/${sacId}`, editBody(sac, { color: 'Mor' }))
      expect(other.statusCode).toBe(404)

      const createOther = await selma.post('/api/vehicles', newVehicle({ plate: 'S00-E-002', vehicleCode: null, homeBranchId: data.drina.branches.SAC }))
      expect(createOther.statusCode).toBe(403)
      const createOwn = await selma.post('/api/vehicles', newVehicle({ plate: 'S00-E-003', vehicleCode: null }))
      expect(createOwn.statusCode).toBe(201)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_remove(array_remove(permissions, 'vehicles.create'), 'vehicles.update') where id = $1`, [opRole])
    }
  })
})

describe('company isolation through the API', () => {
  it('Drina cannot read or change a Neretva vehicle, even by id', async () => {
    const nId = await findId(lejla, 'M21-O-650')
    const n = await getDetail(lejla, nId)
    expect((await adnan.get(`/api/vehicles/${nId}`)).statusCode).toBe(404)
    const put = await adnan.put(`/api/vehicles/${nId}`, editBody(n, { color: 'Mor' }))
    expect(put.statusCode).toBe(404)
    expect((await getDetail(lejla, nId)).color).toBe('Beyaz')
  })

  it('Drina cannot use a Neretva class or branch', async () => {
    const cls = await adnan.post('/api/vehicles', newVehicle({ plate: 'X00-A-001', vehicleCode: null, classId: neretvaClassId }))
    expect(cls.statusCode).toBe(400)
    expect(cls.json().error.fields.classId).toBeDefined()
    const br = await adnan.post('/api/vehicles', newVehicle({ plate: 'X00-A-002', vehicleCode: null, homeBranchId: data.neretva.branches.MOC }))
    expect(br.statusCode).toBe(400)
    expect(br.json().error.fields.homeBranchId).toBeDefined()
  })
})

describe('create', () => {
  it('creates the vehicle with its starting odometer and location events and an audit entry', async () => {
    const res = await adnan.post('/api/vehicles', newVehicle())
    expect(res.statusCode, res.body).toBe(201)
    const v = res.json() as VehicleDetail
    expect(v).toMatchObject({
      plate: 'T11-E-111',
      source: 'internal',
      status: 'active',
      version: 1,
      acquisitionCost: '41250.50',
      acquisitionCurrency: 'EUR',
      odometer: { km: 12 },
      location: { type: 'branch', branchName: 'Sarajevo Aerodrom' },
    })
    const audit = await asOwner(data.companies.drina, `select action, summary from audit_log where entity_id = $1`, [v.id])
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]).toMatchObject({ action: 'vehicle.create', summary: { plate: 'T11-E-111', initialOdometerKm: 12 } })
    const events = await asOwner(data.companies.drina, `select (select count(*)::int from odometer_readings where vehicle_id = $1) o, (select count(*)::int from vehicle_location_events where vehicle_id = $1) l`, [v.id])
    expect(events.rows[0]).toEqual({ o: 1, l: 1 })
  })

  it('validates input on the server', async () => {
    const res = await adnan.post('/api/vehicles', {
      plate: '',
      make: 'X',
      model: '',
      classId: 'abc',
      vin: 'SHORT',
      fuelType: 'steam',
      transmission: 'automatic',
      homeBranchId: data.drina.branches.SJJ,
      modelYear: 1800,
      acquisitionCost: '100',
      acquisitionDate: '2999-01-01',
      status: 'sold',
    })
    expect(res.statusCode).toBe(400)
    expect(Object.keys(res.json().error.fields).sort()).toEqual(
      ['acquisitionDate', 'classId', 'fuelType', 'model', 'modelYear', 'plate', 'status', 'vin'].sort(),
    )
  })

  it('requires a currency with an acquisition cost', async () => {
    const res = await adnan.post('/api/vehicles', newVehicle({ plate: 'T33-E-333', vehicleCode: null, acquisitionCurrency: '' }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error.fields).toEqual({ acquisitionCurrency: 'Tutar için para birimi seçin' })
  })

  it('rejects a duplicate plate in the same company and links to the existing vehicle', async () => {
    const res = await adnan.post('/api/vehicles', newVehicle({ plate: 'a12 k 345', vehicleCode: null }))
    expect(res.statusCode).toBe(409)
    const err = res.json().error
    expect(err.code).toBe('DUPLICATE_PLATE')
    expect(err.details).toMatchObject({ plate: 'A12-K-345' })
    expect(err.details.id).toBe(await findId(adnan, 'A12-K-345'))
  })

  it('rejects a duplicate vehicle code in the same company', async () => {
    const res = await adnan.post('/api/vehicles', newVehicle({ plate: 'T22-E-222', vehicleCode: 'dr-001' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DUPLICATE_CODE')
  })

  it('allows the same plate in another company', async () => {
    const res = await lejla.post('/api/vehicles', newVehicle({ plate: 'A12-K-345', vehicleCode: null, classId: neretvaClassId, homeBranchId: data.neretva.branches.MOC, acquisitionCurrency: 'BAM' }))
    expect(res.statusCode, res.body).toBe(201)
  })
})

describe('update', () => {
  it('updates master data, bumps the version and records the changed fields', async () => {
    const id = await findId(adnan, 'K71-J-904')
    const v = await getDetail(adnan, id)
    const res = await adnan.put(`/api/vehicles/${id}`, editBody(v, { color: 'Beyaz', seats: 4 }))
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ color: 'Beyaz', seats: 4, version: v.version + 1, updatedByName: 'Adnan Kovač' })
    const audit = await asOwner(data.companies.drina, `select summary from audit_log where entity_id = $1 and action = 'vehicle.update'`, [id])
    expect(audit.rows[0].summary.changes).toEqual({ color: ['Kırmızı', 'Beyaz'], seats: [5, 4] })
  })

  it('detects concurrent edits with the version number', async () => {
    const id = await findId(adnan, 'M62-A-238')
    const loadedByA = await getDetail(adnan, id)
    const loadedByB = { ...loadedByA }
    const first = await adnan.put(`/api/vehicles/${id}`, editBody(loadedByA, { color: 'Siyah' }))
    expect(first.statusCode).toBe(200)
    const second = await adnan.put(`/api/vehicles/${id}`, editBody(loadedByB, { trim: 'GS Line' }))
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('VERSION_CONFLICT')
    expect(second.json().error.details.current).toMatchObject({ color: 'Siyah', version: loadedByA.version + 1 })
    expect((await getDetail(adnan, id)).trim).toBe('Edition 1.2')
  })

  it('does not change odometer or location through the edit form', async () => {
    const id = await findId(adnan, 'A84-O-352')
    const v = await getDetail(adnan, id)
    const res = await adnan.put(`/api/vehicles/${id}`, { ...editBody(v, { notes: 'Ön tampon çizik' }), initialOdometerKm: 5, odometer: { km: 5 } })
    expect(res.statusCode).toBe(200)
    expect(res.json().odometer.km).toBe(68440)
  })

  it('rejects a duplicate plate on edit', async () => {
    const id = await findId(adnan, 'E45-M-218')
    const v = await getDetail(adnan, id)
    const res = await adnan.put(`/api/vehicles/${id}`, editBody(v, { plate: 'A12-K-345' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DUPLICATE_PLATE')
  })

  it('cannot set sold or disposed from the edit form', async () => {
    const id = await findId(adnan, 'E45-M-218')
    const v = await getDetail(adnan, id)
    const res = await adnan.put(`/api/vehicles/${id}`, editBody(v, { status: 'sold' }))
    expect(res.statusCode).toBe(400)
  })
})

describe('response format', () => {
  it('returns timestamps as ISO 8601', async () => {
    const v = (await list(adnan, 'q=A12-K-345')).items[0]!
    expect(v.odometer!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(v.location!.at).toMatch(/Z$/)
  })
})
