import type { AllocationConflict, ServiceDue, VehicleOperations } from '@acarvo/shared'
import { ArrowRight, Bandaids, CheckCircle, Prohibit, Truck, Wrench } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { describe, Field, Input } from '@/components/fields'
import { toast } from '@/components/Toaster'
import { ApiRequestError, vehicleOpsApi } from '@/lib/api'
import {
  DAMAGE_REVIEW_LABELS,
  DAMAGE_REVIEW_TONE,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_TYPE_LABELS,
  DAMAGE_VIEW_LABELS,
  HOLD_KIND_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_TONE,
  MAINTENANCE_TYPE_LABELS,
  SERVICE_DUE_LABELS,
  SERVICE_DUE_TONE,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_TONE,
} from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { formatDate, formatDateTime, formatKm } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { BranchCode, btnSecondary, btnSmall, ErrorLine, HoldList, Pill, Section } from './OpsParts'

// Vehicle 360°: holds and blocking reasons, maintenance and periodic service, damage files, transfers (spec §13.3).

export function useVehicleOps(vehicleId: string) {
  const session = useSession()
  return useQuery({ queryKey: ['vehicle-ops', session.company?.id, vehicleId], queryFn: () => vehicleOpsApi.get(vehicleId) })
}

/** A hold's number, linked to its own record when the user may open it (reservations and rentals: numbers only). */
function HoldRef({ h, ops }: { h: AllocationConflict; ops: VehicleOperations }) {
  const m = h.kind === 'maintenance' ? ops.maintenance.find((x) => x.maintenanceNo === h.refNo) : undefined
  const d = h.kind === 'damage' ? ops.damages.find((x) => x.damageNo === h.refNo) : undefined
  const t = h.kind === 'transfer' ? ops.transfers.find((x) => x.transferNo === h.refNo) : undefined
  const cls = 'tnum text-blue hover:underline'
  if (m) return <Link to="/bakim-servis/$maintenanceId" params={{ maintenanceId: m.id }} className={cls}>{h.refNo}</Link>
  if (d) return <Link to="/hasar-kayitlari/$damageId" params={{ damageId: d.id }} className={cls}>{h.refNo}</Link>
  if (t) return <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} className={cls}>{h.refNo}</Link>
  return <span className="tnum">{h.refNo}</span>
}

/** Genel bakış: is the vehicle held right now, by what, and what comes next. Reasons, never a bare "not available". */
export function VehicleHoldsPanel({ vehicleId }: { vehicleId: string }) {
  const session = useSession()
  const ops = useVehicleOps(vehicleId)
  const actions = (
    <div className="flex flex-wrap gap-2">
      {can(session, 'maintenance.manage') && (
        <Link to="/bakim-servis/yeni" search={{ arac: vehicleId }} className={btnSmall}>
          <Wrench size={14} />
          Bakım planla
        </Link>
      )}
      {can(session, 'damage.report') && (
        <Link to="/hasar-kayitlari/yeni" search={{ arac: vehicleId }} className={btnSmall}>
          <Bandaids size={14} />
          Hasar bildir
        </Link>
      )}
      {can(session, 'transfers.request') && (
        <Link to="/araclar/transferler/yeni" search={{ arac: vehicleId }} className={btnSmall}>
          <Truck size={14} />
          Transfer başlat
        </Link>
      )}
    </div>
  )
  if (!ops.data) {
    return (
      <Section title="Müsaitlik ve engeller">
        {ops.isError ? <p className="text-[13px] text-alert">{ops.error.message}</p> : <div className="h-16 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />}
      </Section>
    )
  }
  const o = ops.data
  const now = o.blockedNow
  const next = o.holdsNow.filter((h) => !now.includes(h)).slice(0, 5)
  return (
    <Section title="Müsaitlik ve engeller" description="Onaylı rezervasyon, kiralama, bakım, hasar engeli ve transferler; tek ortak uygunluk kaydından.">
      {now.length ? (
        <ul className="space-y-2">
          {now.map((h) => (
            <li key={`${h.kind}${h.refNo}`} className="flex items-start gap-2.5 rounded-lg border border-alert/25 bg-alert-soft/60 px-3 py-2 text-[13px]">
              <Prohibit size={16} className="mt-px shrink-0 text-alert" />
              <span className="min-w-0">
                <span className="font-medium text-ink">
                  Şu an: {HOLD_KIND_LABELS[h.kind]} <HoldRef h={h} ops={o} />
                </span>
                <span className="tnum block text-ink-2">{h.endsAt ? `${formatDateTime(h.endsAt)} tarihine kadar` : 'bitişi belirsiz; araç müsait sayılmaz'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[13.5px] text-ink">
          <CheckCircle size={16} className="text-ok" />
          Şu an aracı tutan bir kayıt yok.
        </p>
      )}
      {o.atRisk.length > 0 && (
        <div className="mt-3 rounded-lg border border-hold/35 bg-hold-soft px-3 py-2 text-[13px]">
          <p className="font-medium text-ink">Hasar engeli nedeniyle risk altındaki kayıtlar (otomatik iptal edilmez):</p>
          <HoldList holds={o.atRisk} />
        </div>
      )}
      {next.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[12.5px] font-medium text-ink-2">Sıradaki</h3>
          <HoldList holds={next} />
        </div>
      )}
      <div className="mt-4 border-t border-line-soft pt-3">{actions}</div>
      <p className="mt-3 text-[12px] text-ink-3">Müsait olmak teslime hazır olmak değildir; teslim kontrolü ayrıca yapılır.</p>
    </Section>
  )
}

function ServiceDueCard({ vehicleId, due }: { vehicleId: string; due: ServiceDue }) {
  const session = useSession()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [km, setKm] = useState(due.schedule?.intervalKm?.toString() ?? '')
  const [months, setMonths] = useState(due.schedule?.intervalMonths?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <Section
      title="Periyodik bakım"
      description="Gerçek kayıtlardan hesaplanır: son tamamlanan periyodik bakım ve aracın kilometre geçmişi. Yalnız hatırlatmadır; hiçbir işlemi engellemez."
      action={can(session, 'maintenance.manage') && !editing ? <button type="button" className={btnSmall} onClick={() => setEditing(true)}>Aralığı düzenle</button> : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={SERVICE_DUE_TONE[due.state]}>{SERVICE_DUE_LABELS[due.state]}</Pill>
        {due.schedule && (
          <span className="text-[13px] text-ink-2">
            Aralık: {[due.schedule.intervalKm ? formatKm(due.schedule.intervalKm) : null, due.schedule.intervalMonths ? `${due.schedule.intervalMonths} ay` : null].filter(Boolean).join(' veya ')} (hangisi önce gelirse)
          </span>
        )}
      </div>
      <dl className="mt-3 grid gap-x-8 text-[13.5px] sm:grid-cols-2">
        {(
          [
            ['Son periyodik bakım', due.last ? `${due.last.maintenanceNo} · ${formatDate(due.last.completedAt)} · ${formatKm(due.last.km)}` : 'Kayıt yok'],
            ['Güncel kilometre', due.currentKm != null ? formatKm(due.currentKm) : 'Kayıt yok'],
            ['Sonraki (km)', due.nextDueKm != null ? `${formatKm(due.nextDueKm)}${due.kmLeft != null ? ` · ${due.kmLeft >= 0 ? `${formatKm(due.kmLeft)} kaldı` : `${formatKm(-due.kmLeft)} geçti`}` : ''}` : '—'],
            ['Sonraki (tarih)', due.nextDueDate ? `${formatDate(due.nextDueDate)}${due.daysLeft != null ? ` · ${due.daysLeft >= 0 ? `${due.daysLeft} gün kaldı` : `${-due.daysLeft} gün geçti`}` : ''}` : '—'],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2">
            <dt className="text-[13px] text-ink-2">{k}</dt>
            <dd className="tnum text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {editing && (
        <form
          className="mt-4 space-y-3 rounded-lg border border-line-soft bg-ground/50 p-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await vehicleOpsApi.saveSchedule(vehicleId, { version: due.schedule?.version ?? 0, intervalKm: km || undefined, intervalMonths: months || undefined })
              void qc.invalidateQueries({ queryKey: ['vehicle-ops'] })
              toast('Bakım aralığı kaydedildi.')
              setEditing(false)
            } catch (err) {
              setError(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.')
              setFields(err instanceof ApiRequestError ? (err.fields ?? {}) : {})
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="sd-km" label="Kilometre aralığı" error={fields.intervalKm} hint="Örn. 15000">
              <Input inputMode="numeric" {...describe('sd-km', fields.intervalKm, true)} value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field id="sd-months" label="Ay aralığı" error={fields.intervalMonths} hint="Örn. 12">
              <Input inputMode="numeric" {...describe('sd-months', fields.intervalMonths, true)} value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <ErrorLine error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-9 rounded-lg px-3 font-medium text-ink-2 hover:bg-ground" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
            <button type="submit" className={btnSecondary}>
              Kaydet
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}

/** Sekme 5 — Bakım: open, planned, overdue and past maintenance; periodic service from real records. */
export function VehicleMaintenanceTab({ vehicleId }: { vehicleId: string }) {
  const session = useSession()
  const ops = useVehicleOps(vehicleId)
  if (!ops.data) return ops.isError ? <p className="text-alert">{ops.error.message}</p> : <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" />
  const o = ops.data
  return (
    <div className="space-y-5">
      {o.serviceDue && <ServiceDueCard vehicleId={vehicleId} due={o.serviceDue} />}
      <Section
        title="Bakım kayıtları"
        description="“Geciken” bir durum değil; planlanan bitişi geçmiş ve tamamlanmamış kayıtların işaretidir. Tamamlanan bakım teslime hazır demek değildir."
        action={
          can(session, 'maintenance.manage') ? (
            <Link to="/bakim-servis/yeni" search={{ arac: vehicleId }} className={btnSmall}>
              <Wrench size={14} />
              Bakım planla
            </Link>
          ) : undefined
        }
      >
        {o.maintenance.length === 0 ? (
          <p className="text-[13px] text-ink-2">Bu araç için bakım kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {o.maintenance.map((m) => (
              <li key={m.id}>
                <Link to="/bakim-servis/$maintenanceId" params={{ maintenanceId: m.id }} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-ground/60">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">
                      <span className="tnum text-ink-2">{m.maintenanceNo}</span> · {MAINTENANCE_TYPE_LABELS[m.type]}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-2">
                      {formatMoment(m.plannedStart)} → {formatMoment(m.plannedEnd)} · {m.reason}
                    </span>
                  </span>
                  <Pill tone={m.overdue ? 'alert' : MAINTENANCE_STATUS_TONE[m.status]}>{m.overdue ? `${MAINTENANCE_STATUS_LABELS[m.status]} · gecikti` : MAINTENANCE_STATUS_LABELS[m.status]}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <p className="text-[12.5px] text-ink-3">Lastik setleri ve sezon takibi sonraki sürümde; lastik işleri şimdilik “Lastik” türündeki bakım kayıtlarıyla izlenir.</p>
    </div>
  )
}

/** Sekme 6 — açık riskler: the vehicle's damage files (facts, never liability). */
export function VehicleDamagePanel({ vehicleId }: { vehicleId: string }) {
  const session = useSession()
  const ops = useVehicleOps(vehicleId)
  if (!ops.data?.access.damage) return null
  const items = ops.data.damages
  return (
    <Section
      title="Hasar dosyaları"
      description="Bulgu kaydıdır; sorumluluk, ücret veya sigorta talebi oluşturmaz."
      action={
        can(session, 'damage.report') ? (
          <Link to="/hasar-kayitlari/yeni" search={{ arac: vehicleId }} className={btnSmall}>
            <Bandaids size={14} />
            Hasar bildir
          </Link>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-2">Bu araç için hasar dosyası yok.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((d) => (
            <li key={d.id}>
              <Link to="/hasar-kayitlari/$damageId" params={{ damageId: d.id }} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-ground/60">
                <span className="min-w-0">
                  <span className="font-medium text-ink">
                    <span className="tnum text-ink-2">{d.damageNo}</span> · {DAMAGE_TYPE_LABELS[d.damageType]} · {DAMAGE_VIEW_LABELS[d.view]}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-2">
                    {formatMoment(d.detected)} · {DAMAGE_SEVERITY_LABELS[d.severity]}
                    {d.blocked ? ' · aracı engelliyor' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {d.blocked && <Pill tone="alert">Kullanılamaz</Pill>}
                  <Pill tone={DAMAGE_REVIEW_TONE[d.reviewStatus]}>{DAMAGE_REVIEW_LABELS[d.reviewStatus]}</Pill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Sekme 2 — the vehicle's transfers (expected location changes) next to its reservations. */
export function VehicleTransfersPanel({ vehicleId }: { vehicleId: string }) {
  const session = useSession()
  const ops = useVehicleOps(vehicleId)
  if (!ops.data?.access.transfers) return null
  const items = ops.data.transfers
  return (
    <Section
      title="Transferler"
      description="Yoldaki araç teslim alınana kadar varış şubesinde sayılmaz; ana şube değişmez."
      action={
        can(session, 'transfers.request') ? (
          <Link to="/araclar/transferler/yeni" search={{ arac: vehicleId }} className={btnSmall}>
            <Truck size={14} />
            Transfer başlat
          </Link>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-2">Bu araç için transfer kaydı yok.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((t) => (
            <li key={t.id}>
              <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-ground/60">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <span className="tnum text-ink-2">{t.transferNo}</span>
                    <BranchCode code={t.fromBranch.code} />
                    <ArrowRight size={12} aria-label="→" />
                    <BranchCode code={t.toBranch.code} />
                  </span>
                  <span className="tnum block text-[12.5px] text-ink-2">
                    {formatMoment(t.plannedDeparture)} → {formatMoment(t.plannedArrival)}
                  </span>
                </span>
                <Pill tone={t.late ? 'alert' : TRANSFER_STATUS_TONE[t.status]}>{t.late ? 'Yolda · gecikti' : TRANSFER_STATUS_LABELS[t.status]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
