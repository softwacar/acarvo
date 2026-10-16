import { type AllocationConflict, OPERATIONS_PAGE_SIZES, type OperationEvent, type OperationPhoto, type VehicleListItem } from '@acarvo/shared'
import { ArrowLeft, Camera, CaretLeft, CaretRight, ClockCounterClockwise, type Icon, Info, MagnifyingGlass, SpinnerGap, Trash, WarningCircle, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { EvidenceGate } from '@/components/EvidenceGate'
import { ApiRequestError, type PhotoRecordKind, vehiclesApi } from '@/lib/api'
import type { Tone } from '@/lib/finance-labels'
import { eventLabel, HOLD_KIND_LABELS } from '@/lib/operation-labels'
import { formatDateTime } from '@/lib/vehicle-labels'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'
import { Pill } from '../finance/FinanceParts'

// Shared building blocks of the Bakım & Servis, Hasar Kayıtları and Araç Transferleri screens (V5 visual language).

export { btnGhost, btnPrimary, btnSecondary, btnSmall, ErrorLine, FinanceDialog as StepDialog, Pill, Section } from '../finance/FinanceParts'

export const newRequestId = () => crypto.randomUUID()
export const errorText = (e: unknown, fallback = 'İşlem yapılamadı.') => (e instanceof ApiRequestError ? e.message : fallback)

// ---------------------------------------------------------------------------
// Lists

export interface ListTab<V extends string> {
  view: V
  label: string
  count?: number
  tone?: 'alert' | 'hold'
}

/** Tabs, search, filters, info line, table and paging: one frame for the three operation lists. */
export function ListFrame<V extends string>({
  label,
  tabs,
  view,
  onView,
  text,
  onText,
  placeholder,
  filters,
  info,
  totalText,
  loading,
  error,
  onRetry,
  empty,
  children,
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  unit,
}: {
  label: string
  tabs: ListTab<V>[]
  view: V
  onView: (v: V) => void
  text: string
  onText: (t: string) => void
  placeholder: string
  filters?: ReactNode
  info: ReactNode
  totalText: string
  loading: boolean
  error?: Error | null
  onRetry: () => void
  empty: ReactNode | null
  children: ReactNode
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
  unit: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line">
        <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4">
          {tabs.map((t) => (
            <button
              key={t.view}
              role="tab"
              type="button"
              aria-selected={view === t.view}
              onClick={() => onView(t.view)}
              className={cn('relative inline-flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] font-medium whitespace-nowrap', view === t.view ? 'text-ink' : 'text-ink-2 hover:text-ink')}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={cn('tnum rounded-full px-1.5 text-[11.5px] font-semibold', t.tone === 'alert' ? 'bg-alert-soft text-alert' : t.tone === 'hold' ? 'bg-hold-soft text-hold' : 'bg-ground text-ink-2')}>{t.count}</span>
              )}
              {view === t.view && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="relative min-w-0 basis-full lg:w-[300px] lg:flex-none lg:basis-auto">
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            aria-label={`${label} içinde ara`}
            placeholder={placeholder}
            value={text}
            autoComplete="off"
            onChange={(e) => onText(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
          />
        </div>
        {filters}
      </div>
      <div className="flex items-start gap-4 border-b border-line-soft bg-ground/50 px-4 py-2 text-[12.5px] text-ink-2 sm:px-5">
        <p className="flex flex-1 items-start gap-2">
          <Info size={15} className="mt-px shrink-0 text-ink-3" />
          {info}
        </p>
        <span className="tnum shrink-0 font-medium text-ink" aria-live="polite">
          {totalText}
        </span>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorState message={error.message} onRetry={onRetry} />
        </div>
      ) : empty ? (
        empty
      ) : (
        <div className={cn('relative overflow-x-auto transition-opacity', loading && 'opacity-60')}>{children}</div>
      )}
      {total > 0 && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">
          <span className="tnum">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} {unit}
          </span>
          <div className="flex items-center gap-2">
            <Select compact aria-label={`Sayfa başına ${unit}`} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="w-[118px]">
              {OPERATIONS_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / sayfa
                </option>
              ))}
            </Select>
            <span className="tnum px-1">
              Sayfa {page} / {pages}
            </span>
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button type="button" aria-label="Önceki sayfa" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid size-9 place-items-center text-ink-2 hover:bg-ground disabled:text-ink-3/50">
                <CaretLeft size={14} />
              </button>
              <button type="button" aria-label="Sonraki sayfa" disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid size-9 place-items-center border-l border-line text-ink-2 hover:bg-ground disabled:text-ink-3/50">
                <CaretRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Debounced search text kept in memory (never in the URL: it may be a plate). */
export function useSearchText(onChange: () => void) {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() === q) return
      setQ(text.trim())
      changed.current()
    }, 250)
    return () => clearTimeout(t)
  }, [text, q])
  return { text, setText, q }
}

export function EmptyList({ icon, title, children }: { icon: Icon; title: string; children?: ReactNode }) {
  return (
    <StatePanel icon={icon} title={title} className="rounded-none border-0">
      {children}
    </StatePanel>
  )
}

export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="h-[60px]">
          <td colSpan={cols} className="px-5">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-line-soft" />
          </td>
        </tr>
      ))}
    </>
  )
}

export const BranchCode = ({ code }: { code: string }) => <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{code}</span>

// ---------------------------------------------------------------------------
// Detail pages

export function DetailHeader({
  back,
  backLabel,
  number,
  title,
  status,
  hint,
  plate,
  vehicleId,
  vehicleText,
  actions,
}: {
  back: string
  backLabel: string
  number: string
  title: string
  status: { label: string; tone: Tone }
  hint?: string
  plate: string
  vehicleId: string
  vehicleText: string
  actions?: ReactNode
}) {
  const session = useSession()
  return (
    <div className="mb-5">
      <Link to={back} className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
        <ArrowLeft size={14} />
        {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="tnum text-[13px] font-medium text-ink-2">{number}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] break-words">{title}</h1>
          <Link to="/araclar/$vehicleId" params={{ vehicleId }} className="mt-2 inline-flex max-w-full items-center gap-2 text-[13.5px] text-ink-2 hover:text-ink">
            <Plate plate={plate} country={session.company?.country} />
            <span className="truncate">{vehicleText}</span>
          </Link>
          {hint && <p className="mt-2 max-w-[640px] text-[13px] text-ink-2">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Label / value rows, hairline separated (two columns from tablet width). */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{v ?? <span className="font-normal text-ink-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** What holds the vehicle (shared allocation truth): numbers and times only, never people. */
export function HoldList({ holds, empty, zone }: { holds: AllocationConflict[]; empty?: string; zone?: string }) {
  void zone
  if (!holds.length) return empty ? <p className="text-[13px] text-ink-2">{empty}</p> : null
  return (
    <ul className="divide-y divide-line-soft">
      {holds.map((h) => (
        <li key={`${h.kind}-${h.refNo}-${h.startsAt}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-[13px]">
          <span className="font-medium text-ink">
            {HOLD_KIND_LABELS[h.kind]} <span className="tnum">{h.refNo}</span>
          </span>
          <span className="tnum text-ink-2">
            {formatDateTime(h.startsAt)} → {h.endsAt ? formatDateTime(h.endsAt) : <span className="font-medium text-alert">bitişi belirsiz</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Notice({ tone = 'hold', icon: Ico = WarningCircle, children }: { tone?: 'hold' | 'alert' | 'blue'; icon?: Icon; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] text-ink',
        tone === 'alert' ? 'border-alert/30 bg-alert-soft' : tone === 'blue' ? 'border-blue/25 bg-blue-soft/60' : 'border-hold/35 bg-hold-soft',
      )}
    >
      <Ico size={17} className={cn('mt-px shrink-0', tone === 'alert' ? 'text-alert' : tone === 'blue' ? 'text-blue-ink' : 'text-hold')} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EventsList({ events }: { events: OperationEvent[] }) {
  if (!events.length) return <p className="text-[13px] text-ink-2">Henüz kayıt yok.</p>
  return (
    <ol className="divide-y divide-line-soft">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5 py-2.5">
          <ClockCounterClockwise size={16} className="mt-0.5 text-ink-3" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{eventLabel(e)}</p>
            <p className="tnum text-[12.5px] text-ink-2">
              {formatDateTime(e.at)}
              {e.actorName ? ` · ${e.actorName}` : ''}
            </p>
            {e.reason && <p className="mt-0.5 text-[13px] break-words text-ink-2">Gerekçe: {e.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Evidence photos: private, streamed after checks. Adding and removing only while the record is open. */
export function PhotoGrid({
  kind,
  recordId,
  photos,
  canEdit,
  policy,
  label,
  onUpload,
  onRemove,
}: {
  kind: PhotoRecordKind
  recordId: string
  photos: OperationPhoto[]
  canEdit: boolean
  policy: { enabled: boolean; reason: string | null }
  label: string
  onUpload: (f: File, progress: (n: number) => void) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      {photos.length ? (
        <EvidenceGate kind={kind} id={recordId} count={photos.length}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg border border-line">
              <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-ground">
                <img src={p.thumbUrl} alt={`${label} fotoğrafı ${i + 1}`} className="size-full object-cover" loading="lazy" />
              </a>
              <p className="truncate px-2 py-1 text-[12px] text-ink-2">
                {formatDateTime(p.createdAt)}
                {p.createdByName ? ` · ${p.createdByName}` : ''}
              </p>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Fotoğraf ${i + 1} kaldır`}
                  onClick={async () => {
                    try {
                      await onRemove(p.id)
                    } catch (e) {
                      setError(errorText(e))
                    }
                  }}
                  className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-md bg-surface/90 text-ink-2 shadow-sm hover:text-alert"
                >
                  <Trash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
        </EvidenceGate>
      ) : (
        <p className="text-[13px] text-ink-2">Fotoğraf yok.</p>
      )}
      {canEdit &&
        (policy.enabled ? (
          <div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label={`${label} fotoğrafı yükle`}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setError(null)
                setProgress(0)
                try {
                  await onUpload(f, setProgress)
                  toast('Fotoğraf eklendi.')
                } catch (err) {
                  setError(errorText(err, 'Fotoğraf yüklenemedi.'))
                } finally {
                  setProgress(null)
                }
              }}
            />
            <button type="button" onClick={() => input.current?.click()} disabled={progress !== null} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-line-soft disabled:opacity-60">
              {progress !== null ? <SpinnerGap size={15} className="animate-spin" /> : <Camera size={15} />}
              {progress !== null ? `Yükleniyor %${Math.round(progress * 100)}` : 'Fotoğraf ekle'}
            </button>
            <p className="mt-1.5 text-[12px] text-ink-3">JPEG, PNG veya WebP. Fotoğraf yeniden işlenir, konum ve cihaz bilgileri silinir; yalnız yetkili kişiler görür.</p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">{policy.reason}</p>
        ))}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vehicle picker (forms): the user's vehicles, searched by plate, code or model.

export function VehiclePicker({ value, onChange, error }: { value: { id: string; plate: string; text: string } | null; onChange: (v: { id: string; plate: string; text: string; homeBranchId: string } | null) => void; error?: string }) {
  const session = useSession()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const list = useQuery({ queryKey: ['vehicle-picker', session.company?.id, debounced], queryFn: () => vehiclesApi.list({ q: debounced || undefined, pageSize: 25 }), enabled: !value })
  if (value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <Plate plate={value.plate} country={session.company?.country} />
          <span className="truncate text-[13.5px] text-ink-2">{value.text}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
          <X size={13} />
          Değiştir
        </button>
      </div>
    )
  }
  const items: VehicleListItem[] = (list.data?.items ?? []).filter((v) => v.status !== 'sold' && v.status !== 'disposed')
  return (
    <div className="rounded-lg border border-line">
      <div className="relative border-b border-line">
        <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input
          id="vehicle-search"
          type="search"
          aria-label="Araç ara"
          aria-invalid={error ? true : undefined}
          placeholder="Plaka, araç kodu veya model"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-10 w-full rounded-t-lg bg-surface pr-3 pl-9 text-[14px] outline-none placeholder:text-ink-3"
        />
      </div>
      <ul className="max-h-[260px] divide-y divide-line-soft overflow-y-auto" aria-label="Araçlar">
        {list.isPending ? (
          <li className="px-3 py-3 text-[13px] text-ink-2">Yükleniyor…</li>
        ) : items.length === 0 ? (
          <li className="px-3 py-3 text-[13px] text-ink-2">Araç bulunamadı.</li>
        ) : (
          items.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onChange({ id: v.id, plate: v.plate, text: `${v.make} ${v.model} · ${v.className} · ${v.homeBranch.code}`, homeBranchId: v.homeBranch.id })}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ground"
              >
                <Plate plate={v.plate} country={session.company?.country} />
                <span className="min-w-0 truncate text-[13.5px] text-ink-2">
                  {v.make} {v.model} · {v.className} · {v.homeBranch.code}
                  {v.status === 'out_of_service' ? ' · hizmet dışı' : ''}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {error && <p className="border-t border-line px-3 py-2 text-[13px] text-alert">{error}</p>}
    </div>
  )
}
