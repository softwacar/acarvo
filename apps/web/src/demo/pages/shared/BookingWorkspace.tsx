import { X } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { capacityCell, checkVehicleAvailable, readinessOf, type ReadinessItem } from '../../core/calc/availability'
import { projectCorporateExposure } from '../../core/calc/finance'
import { customerDocChecks, evaluateDepositPolicy, evaluateDriverEligibility } from '../../core/calc/policy'
import { priceQuote } from '../../core/calc/pricing'
import { fmt } from '../../core/money'
import { createRental, createReservation, updateReservation } from '../../core/ops/rentals'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Cur, Db, Id, Iso, Reservation } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, ComboF, DateTimeF, SelectF, AreaF, branchOptions, classOptions } from '../../ui/forms'
import { PriceBreakdown, ReadinessList } from '../../ui/domain'
import { runAction, useBranchScope, useDb, useFmt } from '../../ui/hooks'
import { ActionError, BackLink, btnPrimary, btnSecondary, Facts, Page, Panel } from '../../ui/kit'
import { CHANNEL_LABEL } from '../../ui/status'

// One booking workspace for a new reservation, an edited reservation and a directly prepared rental. The summary on the
// right is the same pricing pipeline the saved record uses; checks are the same calculators the actions run.

type Mode = 'reservation' | 'rental'

export interface BookingPreset {
  customerId?: Id
  vehicleId?: Id
  classId?: Id
  from?: Iso
  to?: Iso
  branchId?: Id
}

const nextHour = (iso: Iso, tz: string): Iso => {
  const day = dayOf(iso, tz)
  const t = new Date(iso)
  const hours = Math.min(23, Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(t)) + 1)
  return zonedIso(day, `${String(hours).padStart(2, '0')}:00`, tz)
}

export function BookingWorkspace({ mode, edit, preset = {} }: { mode: Mode; edit?: Reservation; preset?: BookingPreset }) {
  const d = useDb()
  const f = useFmt()
  const navigate = useNavigate()
  const { active } = useBranchScope()
  const homeBranch = preset.branchId ?? active[0] ?? d.branches[0]!.id
  const tz = f.zone(homeBranch)
  const startDefault = edit?.pickupAt ?? preset.from ?? nextHour(d.clock.now, tz)
  const startVehicle = d.vehicles.find((v) => v.id === (edit?.vehicleId ?? preset.vehicleId))

  const [customerId, setCustomerId] = useState(edit?.customerId ?? preset.customerId ?? '')
  const [corporateId, setCorporateId] = useState(edit?.corporateId ?? '')
  const [classId, setClassId] = useState(edit?.classId ?? startVehicle?.classId ?? preset.classId ?? d.classes[0]!.id)
  const [vehicleId, setVehicleId] = useState(edit?.vehicleId ?? preset.vehicleId ?? '')
  const [pickupBranchId, setPickupBranchId] = useState(edit?.pickupBranchId ?? homeBranch)
  const [returnBranchId, setReturnBranchId] = useState(edit?.returnBranchId ?? homeBranch)
  const [pickupAt, setPickupAt] = useState<Iso>(startDefault)
  const [returnAt, setReturnAt] = useState<Iso>(edit?.returnAt ?? preset.to ?? zonedIso(addDaysYmd(dayOf(startDefault, tz), 3), '10:00', tz))
  const [currency, setCurrency] = useState<Cur>(edit?.currency ?? d.settings.company.baseCurrency)
  const [insuranceId, setInsuranceId] = useState(edit?.insuranceId ?? '')
  const [extras, setExtras] = useState<Record<Id, number>>(Object.fromEntries((edit?.extras ?? []).map((e) => [e.extraId, e.qty])))
  const [drivers, setDrivers] = useState<Id[]>((edit?.drivers ?? []).filter((x) => !x.primary).map((x) => x.customerId))
  const [driverPick, setDriverPick] = useState('')
  const [channel, setChannel] = useState<Reservation['channel']>(edit?.channel ?? 'phone')
  const [notes, setNotes] = useState(edit?.notes ?? '')
  const [confirmNow, setConfirmNow] = useState(false)
  const [ackPrice, setAckPrice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const channels = CHANNEL_LABEL()

  const customer = d.customers.find((c) => c.id === customerId)
  const extraList = Object.entries(extras).filter(([, q]) => q > 0).map(([extraId, qty]) => ({ extraId, qty }))
  const windowOk = Date.parse(returnAt) > Date.parse(pickupAt)
  const exclude = edit ? { reservationId: edit.id } : {}

  const price = useMemo(() => {
    if (!windowOk) return null
    const elig = customer ? evaluateDriverEligibility(d, customer, pickupAt, returnAt) : null
    return priceQuote(
      d,
      { classId, from: pickupAt, to: returnAt, pickupBranchId, returnBranchId, currency, extras: extraList, insuranceId: insuranceId || undefined, corporateId: corporateId || undefined, additionalDrivers: drivers.length, youngDriver: elig?.youngDriver ?? false, approvedDiscountPct: edit?.approvedDiscountPct },
      d.clock.now,
      'preview',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, classId, pickupAt, returnAt, pickupBranchId, returnBranchId, currency, JSON.stringify(extraList), insuranceId, corporateId, drivers.length, customerId, windowOk])

  const vehicleChoices = useMemo(
    () =>
      d.vehicles
        .filter((v) => v.classId === classId && v.status !== 'sold')
        .map((v) => {
          const res = windowOk ? checkVehicleAvailable(d, v, pickupAt, returnAt, d.clock.now, exclude) : { ok: true, conflicts: [] as { label: string }[] }
          return { v, ok: res.ok, why: res.conflicts.map((c) => c.label).join(', ') }
        })
        .sort((a, b) => Number(b.ok) - Number(a.ok) || a.v.plate.localeCompare(b.v.plate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, classId, pickupAt, returnAt, windowOk, edit?.id],
  )
  const vehicle = d.vehicles.find((v) => v.id === vehicleId)

  const checks = useMemo(() => buildChecks({ d, mode, customerId, drivers, corporateId, classId, vehicleId, pickupBranchId, pickupAt, returnAt, currency, insuranceId, price, windowOk, editId: edit?.id }), [d, mode, customerId, drivers, corporateId, classId, vehicleId, pickupBranchId, pickupAt, returnAt, currency, insuranceId, price, windowOk, edit?.id])
  const blockers = checks.filter((c) => !c.ok && c.severity === 'blocker')

  const accepted = d.settings.acceptedCurrencies
  const insuranceChoices = d.insurance.filter((p) => p.active && p.dailyPrice[currency] !== undefined)
  const extraChoices = d.extras.filter((e) => e.active)

  const setClass = (id: Id) => {
    setClassId(id)
    if (vehicle && vehicle.classId !== id) setVehicleId('')
  }
  const setBranchBoth = (id: Id) => {
    setPickupBranchId(id)
    if (returnBranchId === pickupBranchId) setReturnBranchId(id)
  }

  const submit = () => {
    setError(null)
    setFields({})
    const done = (to: string) => void navigate({ to: to as never })
    if (mode === 'rental') {
      if (!vehicleId) {
        setFields({ vehicle: L('Kiralama için belirli bir araç seçin', 'Choose a specific vehicle for a rental') })
        setError(L('Kiralama hazırlamak için belirli bir araç gerekir.', 'Preparing a rental needs a specific vehicle.'))
        return
      }
      const r = runAction((x) => createRental(x, { customerId, corporateId: corporateId || undefined, drivers: [customerId, ...drivers], vehicleId, classId, pickupBranchId, returnBranchId, plannedPickupAt: pickupAt, plannedReturnAt: returnAt, currency, extras: extraList, insuranceId: insuranceId || undefined, notes }), L('Kiralama hazırlandı. Teslim için Teslim Masası kontrolleri gerekir.', 'Rental prepared. Delivery needs the Delivery Desk checks.'))
      if (!r.ok) {
        setError(r.error)
        setFields(r.fields)
        return
      }
      done(`/kiralamalar/${r.value.id}`)
      return
    }
    if (edit) {
      const r = runAction((x) => updateReservation(x, edit.id, { classId, vehicleId: vehicleId || undefined, pickupBranchId, returnBranchId, pickupAt, returnAt, extras: extraList, insuranceId: insuranceId || undefined, notes, currency }, ackPrice), L('Rezervasyon güncellendi (demo).', 'Reservation updated (demo).'))
      if (!r.ok) {
        setError(r.error)
        setFields(r.fields)
        return
      }
      done(`/rezervasyonlar/${edit.id}`)
      return
    }
    const r = runAction((x) => createReservation(x, { customerId, corporateId: corporateId || undefined, classId, vehicleId: vehicleId || undefined, pickupBranchId, returnBranchId, pickupAt, returnAt, currency, extras: extraList, insuranceId: insuranceId || undefined, drivers: [customerId, ...drivers], channel, notes, status: confirmNow ? 'confirmed' : 'pending' }), confirmNow ? L('Rezervasyon oluşturuldu ve onaylandı.', 'Reservation created and confirmed.') : L('Rezervasyon oluşturuldu (bekliyor; kapasite tutmaz).', 'Reservation created (pending; holds no capacity).'))
    if (!r.ok) {
      setError(r.error)
      setFields(r.fields)
      return
    }
    done(`/rezervasyonlar/${r.value.id}`)
  }

  const title = mode === 'rental' ? L('Yeni kiralama', 'New rental') : edit ? `${L('Rezervasyonu düzenle', 'Edit reservation')} · ${edit.no}` : L('Yeni rezervasyon', 'New reservation')
  const back = mode === 'rental' ? { to: '/kiralamalar', label: L('Kiralamalar', 'Rentals') } : edit ? { to: `/rezervasyonlar/${edit.id}`, label: edit.no } : { to: '/rezervasyonlar', label: L('Rezervasyonlar', 'Reservations') }
  const cap = !vehicleId && windowOk ? capacityLine(d, pickupBranchId, classId, pickupAt, returnAt) : null

  return (
    <div className="space-y-4">
      <BackLink to={back.to} label={back.label} />
      <Page
        title={title}
        description={mode === 'rental' ? L('Rezervasyon olmadan doğrudan kiralama (yürüyen müşteri). Teslim ayrı bir adımdır: Teslim Masası kontrolleri geçilmeden araç verilmez.', 'A walk-in rental without a reservation. Delivery is a separate step: the vehicle is not handed over until the Delivery Desk checks pass.') : L('Rezervasyon bir kiralama değildir. Araç seçmezseniz yalnız sınıf rezervasyonu olur ve belirli bir aracı tutmaz.', 'A reservation is not a rental. Without a vehicle it is class-only and holds no specific vehicle.')}
      >
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            noValidate
          >
            <Panel title={L('Müşteri', 'Customer')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <ComboF id="bk-c" label={L('Müşteri', 'Customer')} required items={d.customers.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.name, sub: `${c.no} · ${c.country}` }))} value={customerId} onChange={setCustomerId} error={fields.customer} hint={edit ? L('Müşteri düzenlemede değişmez; farklı müşteri için yeni rezervasyon açın.', 'The customer cannot change while editing; open a new reservation instead.') : undefined} />
                <SelectF id="bk-corp" label={L('Kurumsal hesap', 'Corporate account')} value={corporateId} onChange={setCorporateId} placeholder={L('Bireysel', 'Individual')} options={d.corporates.filter((c) => c.status === 'active').map((c) => ({ id: c.id, label: c.name }))} hint={corporateId ? L('Kredi limiti para birimi başınadır; limit yoksa sınırsız sayılmaz.', 'The credit limit is per currency; no limit is not unlimited.') : undefined} />
              </div>
              <div className="mt-4">
                <ComboF id="bk-drv" label={L('Ek sürücü ekle', 'Add additional driver')} items={d.customers.filter((c) => !c.archived && c.id !== customerId && !drivers.includes(c.id)).map((c) => ({ id: c.id, label: c.name, sub: c.no }))} value={driverPick} onChange={(v) => { if (v) { setDrivers((x) => [...x, v]); setDriverPick('') } }} hint={`${L('Ek sürücü ücreti günlük hesaplanır', 'Additional driver fee is charged per day')} · ${L('en fazla', 'max')} ${d.settings.driver.maxAdditionalDrivers}`} />
                {drivers.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {drivers.map((id) => (
                      <li key={id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ground py-1 pl-2.5 pr-1 text-[13px]">
                        {d.customers.find((c) => c.id === id)?.name}
                        <button type="button" className="rounded p-1 text-ink-2 hover:bg-line-soft" aria-label={`${L('Kaldır', 'Remove')}: ${d.customers.find((c) => c.id === id)?.name}`} onClick={() => setDrivers((x) => x.filter((y) => y !== id))}>
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel title={L('Plan', 'Plan')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectF id="bk-pb" label={L('Teslim şubesi', 'Pickup branch')} value={pickupBranchId} onChange={setBranchBoth} options={branchOptions(d)} />
                <SelectF id="bk-rb" label={L('İade şubesi', 'Return branch')} value={returnBranchId} onChange={setReturnBranchId} options={branchOptions(d)} hint={returnBranchId !== pickupBranchId ? L('Farklı şubeye iade: tek yön ücreti uygulanır.', 'Different return branch: a one-way fee applies.') : undefined} />
                <DateTimeF id="bk-from" label={L('Teslim', 'Pickup')} required value={pickupAt} onChange={setPickupAt} tz={tz} error={fields.pickupAt} />
                <DateTimeF id="bk-to" label={L('İade', 'Return')} required value={returnAt} onChange={setReturnAt} tz={tz} error={fields.returnAt ?? (!windowOk ? L('İade, tesliminden sonra olmalı', 'Return must be after pickup') : undefined)} />
              </div>
            </Panel>

            <Panel title={L('Araç', 'Vehicle')} description={mode === 'rental' ? L('Kiralama için belirli bir araç gerekir.', 'A rental needs a specific vehicle.') : L('İsteğe bağlı. Seçilirse onaylı rezervasyon o aracı tutar.', 'Optional. If chosen, a confirmed reservation holds that vehicle.')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectF id="bk-cls" label={L('Sınıf', 'Class')} value={classId} onChange={setClass} options={classOptions(d)} />
                <SelectF
                  id="bk-veh"
                  label={mode === 'rental' ? L('Araç', 'Vehicle') : L('Araç (isteğe bağlı)', 'Vehicle (optional)')}
                  required={mode === 'rental'}
                  value={vehicleId}
                  onChange={setVehicleId}
                  placeholder={mode === 'rental' ? L('Araç seçin', 'Choose a vehicle') : L('Yalnız sınıf (araç atanmadı)', 'Class-only (no vehicle)')}
                  error={fields.vehicle}
                  options={vehicleChoices.map(({ v, ok, why }) => ({ id: v.id, label: `${v.plate} · ${v.make} ${v.model}${ok ? '' : ` — ${L('uygun değil', 'unavailable')}: ${why}`}`, disabled: !ok && v.id !== edit?.vehicleId }))}
                />
              </div>
              {cap && (
                <p className={`mt-3 text-[13px] ${cap.min > 0 ? 'text-ink-2' : 'font-medium text-alert'}`}>
                  {cap.min > 0 ? L(`Sınıf kapasitesi: seçili günlerde en az ${cap.min} araç müsait.`, `Class capacity: at least ${cap.min} vehicle(s) free on the chosen days.`) : L(`Sınıf kapasitesi dolu: ${cap.day} günü müsait araç yok. Pending kaydedilebilir ama onay kapasite yetersizliği nedeniyle reddedilir.`, `Class capacity is full on ${cap.day}. It can be saved as pending but confirmation will be refused.`)}
                </p>
              )}
              {vehicle && <p className="mt-3 text-[13px] text-ink-2">{L('Araç konumu', 'Vehicle location')}: {d.branches.find((b) => b.id === vehicle.location)?.name ?? ({ customer: L('Müşteride', 'With customer'), service: L('Serviste', 'At service'), transit: L('Transferde', 'In transit') } as Record<string, string>)[vehicle.location] ?? '—'} · {vehicle.odometerKm.toLocaleString(L('tr-TR', 'en-GB'))} km</p>}
            </Panel>

            <Panel title={L('Fiyat kalemleri', 'Price items')} description={L('Sigorta, ekstra ve ücretler her para birimi için ayrı fiyat satırı kullanır; para birimleri arasında çeviri yapılmaz.', 'Insurance, extras and fees use explicit rows per currency; prices are never converted between currencies.')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectF id="bk-cur" label={L('Para birimi', 'Currency')} value={currency} onChange={(v) => { setCurrency(v); setInsuranceId('') }} options={accepted.map((c) => ({ id: c, label: c }))} />
                <SelectF id="bk-ins" label={L('Sigorta paketi', 'Coverage package')} value={insuranceId} onChange={setInsuranceId} placeholder={L('Paket yok', 'No package')} options={insuranceChoices.map((p) => ({ id: p.id, label: `${p.name} (${fmt(p.dailyPrice[currency] ?? 0, currency)}/${L('gün', 'day')})` }))} hint={insuranceChoices.length < d.insurance.filter((p) => p.active).length ? L(`${currency} fiyat satırı olmayan paketler gizlendi.`, `Packages without a ${currency} price row are hidden.`) : undefined} />
              </div>
              <fieldset className="mt-4">
                <legend className="mb-1.5 text-[13px] font-medium">{L('Ekstralar', 'Extras')}</legend>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {extraChoices.map((e) => {
                    const row = e.prices[currency]
                    return (
                      <li key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                        <label htmlFor={`bk-x-${e.id}`} className="min-w-0 text-[13px]">
                          <span className="block truncate font-medium">{e.name}</span>
                          <span className="text-ink-2">{row === undefined ? L(`${currency} fiyat satırı yok`, `No ${currency} price row`) : `${fmt(row, currency)} / ${e.kind === 'per_day' ? L('gün', 'day') : L('kiralama', 'rental')}`}</span>
                        </label>
                        <input id={`bk-x-${e.id}`} type="number" min={0} max={9} disabled={row === undefined} value={extras[e.id] ?? 0} onChange={(ev) => setExtras((x) => ({ ...x, [e.id]: Math.max(0, Math.min(9, Number(ev.target.value) || 0)) }))} className="h-9 w-16 rounded-md border border-line bg-surface px-2 text-right text-[14px] tnum disabled:opacity-50" aria-label={`${e.name} ${L('adedi', 'quantity')}`} />
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            </Panel>

            <Panel title={L('Not ve kanal', 'Channel and note')}>
              <div className="grid gap-4 sm:grid-cols-2">
                {mode === 'reservation' && !edit && <SelectF id="bk-ch" label={L('Kanal', 'Channel')} value={channel} onChange={(v) => setChannel(v as Reservation['channel'])} options={Object.entries(channels).map(([id, label]) => ({ id, label }))} />}
              </div>
              <div className="mt-4">
                <AreaF id="bk-note" label={L('Not', 'Note')} value={notes} onChange={setNotes} rows={2} />
              </div>
            </Panel>

            <ActionError error={error} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {mode === 'reservation' && !edit ? (
                <CheckF id="bk-confirm" checked={confirmNow} onChange={setConfirmNow}>
                  {L('Kaydederken onayla (araç/kapasite kontrolü yapılır)', 'Confirm on save (vehicle/capacity is checked)')}
                </CheckF>
              ) : edit && price && edit.price && price.grossMinor !== edit.price.grossMinor ? (
                <CheckF id="bk-ack" checked={ackPrice} onChange={setAckPrice}>
                  {L(`Yeni fiyatı kabul ediyorum: ${fmt(edit.price.grossMinor, edit.price.cur)} → ${fmt(price.grossMinor, price.cur)}`, `I accept the new price: ${fmt(edit.price.grossMinor, edit.price.cur)} → ${fmt(price.grossMinor, price.cur)}`)}
                </CheckF>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className={btnSecondary} onClick={() => void navigate({ to: back.to as never })}>{L('Vazgeç', 'Cancel')}</button>
                <button type="submit" className={btnPrimary} disabled={!customerId || !windowOk || (price?.blockers.length ?? 0) > 0} title={!customerId ? L('Önce müşteri seçin', 'Choose a customer first') : !windowOk ? L('Teslim ve iade zamanını düzeltin', 'Fix the pickup and return times') : (price?.blockers.length ?? 0) > 0 ? L('Fiyat engeli var: nedeni sayfada yazılı', 'A price blocker exists: the reason is shown on the page') : undefined}>
                  {mode === 'rental' ? L('Kiralamayı hazırla', 'Prepare rental') : edit ? L('Değişiklikleri kaydet', 'Save changes') : L('Rezervasyonu kaydet', 'Save reservation')}
                </button>
              </div>
            </div>
            {(!customerId || (price?.blockers.length ?? 0) > 0) && (
              <p className="text-right text-[12.5px] text-ink-2">{!customerId ? L('Kaydetmek için müşteri seçin.', 'Choose a customer to save.') : L('Fiyat hesaplanamadığı için kaydedilemez (sağdaki nedene bakın).', 'Cannot save because the price cannot be calculated (see the reason on the right).')}</p>
            )}
          </form>

          <aside className="space-y-4 lg:sticky lg:top-4" aria-label={L('Özet', 'Summary')}>
            <Panel title={L('Özet', 'Summary')}>
              <Facts
                single
                rows={[
                  [L('Süre', 'Duration'), price ? `${price.days} ${L('gün', 'day(s)')}` : '—'],
                  [L('Teslim', 'Pickup'), windowOk ? f.dt(pickupAt, pickupBranchId) : '—'],
                  [L('İade', 'Return'), windowOk ? f.dt(returnAt, returnBranchId) : '—'],
                  [L('Araç', 'Vehicle'), vehicle ? `${vehicle.plate} · ${vehicle.make} ${vehicle.model}` : L('Yalnız sınıf', 'Class-only')],
                ]}
              />
              <div className="mt-4 border-t border-line-soft pt-3">
                <PriceBreakdown price={price} compact />
              </div>
            </Panel>
            <Panel title={L('Kontroller', 'Checks')} description={blockers.length ? L(`${blockers.length} engel var`, `${blockers.length} blocker(s)`) : L('Engel yok', 'No blockers')}>
              {checks.length ? <ReadinessList items={checks} /> : <p className="text-[13px] text-ink-2">{L('Müşteri ve plan seçildikçe kontroller görünür.', 'Checks appear as you choose a customer and plan.')}</p>}
            </Panel>
            <div>
              <p className="text-[12.5px] text-ink-2">{L('Kaparo ve ödeme kayıt oluştuktan sonra alınır. Fiyat, kaydedildiği anda dondurulur ve sonraki fiyat listesi değişikliklerinden etkilenmez.', 'Advance and payments are taken after the record exists. The price is frozen when saved and is not affected by later price-list changes.')}</p>
            </div>
          </aside>
        </div>
      </Page>
    </div>
  )
}

function capacityLine(d: Db, branchId: Id, classId: Id, from: Iso, to: Iso): { min: number; day: string } | null {
  const branch = d.branches.find((b) => b.id === branchId)
  if (!branch || Date.parse(to) <= Date.parse(from)) return null
  const first = dayOf(from, branch.tz)
  const last = dayOf(new Date(Date.parse(to) - 1).toISOString(), branch.tz)
  let min = Number.POSITIVE_INFINITY
  let day = first
  for (let x = first, n = 0; x <= last && n < 120; x = addDaysYmd(x, 1), n++) {
    const c = capacityCell(d, branch, classId, x)
    if (c.available < min) {
      min = c.available
      day = x
    }
  }
  return { min: Number.isFinite(min) ? min : 0, day }
}

interface CheckIn {
  d: Db
  mode: Mode
  customerId: Id
  drivers: Id[]
  corporateId: Id
  classId: Id
  vehicleId: Id
  pickupBranchId: Id
  pickupAt: Iso
  returnAt: Iso
  currency: Cur
  insuranceId: Id
  price: ReturnType<typeof priceQuote> | null
  windowOk: boolean
  editId?: Id
}

function buildChecks(i: CheckIn): ReadinessItem[] {
  const { d } = i
  const out: ReadinessItem[] = []
  if (i.price?.blockers.length) out.push({ key: 'price', label: L('Fiyat', 'Price'), ok: false, severity: 'blocker', detail: i.price.blockers[0]! })
  if (!i.windowOk) return out
  for (const id of [i.customerId, ...i.drivers].filter(Boolean)) {
    const c = d.customers.find((x) => x.id === id)
    if (!c) continue
    const e = evaluateDriverEligibility(d, c, i.pickupAt, i.returnAt)
    const docs = customerDocChecks(d, c, i.pickupAt, i.returnAt)
    const expiring = docs.filter((x) => x.state === 'expiring').length
    out.push({
      key: `drv-${id}`,
      label: `${L('Sürücü', 'Driver')}: ${c.name}`,
      ok: e.ok,
      severity: i.mode === 'rental' ? 'blocker' : 'warning',
      detail: e.ok ? `${e.age} ${L('yaş', 'yrs')} · ${L('ehliyet', 'licence')} ${e.licenseYears} ${L('yıl', 'yrs')}${e.youngDriver ? ` · ${L('genç sürücü ücreti uygulanır', 'young-driver fee applies')}` : ''}${expiring ? ` · ${expiring} ${L('belge yakında bitiyor', 'document(s) expiring')}` : ''}` : [...e.reasons, ...e.docReasons].join(' '),
      link: { type: 'customer', id },
    })
    if (c.restrictions.length) out.push({ key: `rs-${id}`, label: `${L('Kısıt', 'Restriction')}: ${c.name}`, ok: false, severity: 'warning', detail: c.restrictions.map((x) => `${x.label} — ${x.reason}`).join('; '), link: { type: 'customer', id } })
  }
  if (i.corporateId) {
    const row = projectCorporateExposure(d, i.corporateId).find((x) => x.cur === i.currency)
    if (!row || row.limitMinor === null) out.push({ key: 'credit', label: L('Kurumsal kredi', 'Corporate credit'), ok: false, severity: 'blocker', detail: L(`${i.currency} için kredi limiti tanımlı değil (tanımsız limit sınırsız demek değildir).`, `No ${i.currency} credit limit is defined (undefined is not unlimited).`), link: { type: 'corporate', id: i.corporateId } })
    else if (i.price) out.push({ key: 'credit', label: L('Kurumsal kredi', 'Corporate credit'), ok: row.headroomMinor === null || i.price.grossMinor <= row.headroomMinor, severity: 'blocker', detail: `${L('Kalan limit', 'Headroom')} ${row.headroomMinor === null ? '—' : fmt(row.headroomMinor, i.currency)} · ${L('bu kayıt', 'this record')} ${fmt(i.price.grossMinor, i.currency)}`, link: { type: 'corporate', id: i.corporateId } })
  }
  if (i.vehicleId) {
    const v = d.vehicles.find((x) => x.id === i.vehicleId)
    if (v) {
      const a = checkVehicleAvailable(d, v, i.pickupAt, i.returnAt, d.clock.now, i.editId ? { reservationId: i.editId } : {})
      out.push({ key: 'avail', label: L('Araç müsaitliği', 'Vehicle availability'), ok: a.ok, severity: 'blocker', detail: a.ok ? L('Seçilen aralıkta çakışma yok.', 'No conflict in the chosen window.') : a.conflicts.map((c) => c.label).join(', '), link: { type: 'vehicle', id: v.id } })
      const r = readinessOf(d, v, d.clock.now)
      out.push({ key: 'ready', label: L('Hazırlık (ayrı kavram)', 'Readiness (separate concept)'), ok: r.ready, severity: 'warning', detail: r.ready ? L('Araç hazır.', 'Vehicle is ready.') : L(`${r.blockers} hazırlık engeli var; teslimden önce Teslim Masası'nda kapanmalı.`, `${r.blockers} readiness blocker(s); they must be cleared at the Delivery Desk before handover.`), link: { type: 'vehicle', id: v.id } })
    }
  }
  const dep = evaluateDepositPolicy(d, i.classId, i.insuranceId || undefined, i.currency)
  out.push({ key: 'dep', label: L('Depozito politikası', 'Deposit policy'), ok: dep.ok, severity: 'warning', detail: dep.ok ? `${L('Teslimde gerekli depozito', 'Deposit required at delivery')}: ${fmt(dep.required.minor, dep.required.cur)} (${L('gelir değildir', 'not revenue')})` : (dep.message ?? '') })
  return out
}

