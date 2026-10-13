import { DAMAGE_CATEGORIES, DAMAGE_VIEWS, type DamageCategory, type DamageView, MAX_DAMAGE_MARKS, type RentalDamageMark, type RentalPhoto } from '@acarvo/shared'
import { Plus, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Input, Select } from '@/components/fields'
import { DAMAGE_CATEGORY_LABELS, DAMAGE_VIEW_LABELS, PHOTO_ANGLE_LABELS } from '@/lib/rental-labels'
import { cn } from '@/lib/utils'

/** A mark being edited (id is absent until the server stored it). */
export interface MarkDraft {
  key: string
  id?: string
  view: DamageView
  x: number
  y: number
  category: DamageCategory | ''
  note: string
  photoId: string
  existingMarkId: string
}

export const draftOf = (m: RentalDamageMark): MarkDraft => ({
  key: m.id,
  id: m.id,
  view: m.view,
  x: m.x,
  y: m.y,
  category: m.category,
  note: m.note ?? '',
  photoId: m.photoId ?? '',
  existingMarkId: m.existingMarkId ?? '',
})

const VIEWBOX: Record<DamageView, [number, number]> = { left: [400, 170], right: [400, 170], front: [260, 190], rear: [260, 190], top: [200, 380] }

/** Simple body outlines (not a photo of the car, spec §83.4): enough to say where a mark is. */
function Outline({ view }: { view: DamageView }) {
  const stroke = 'var(--ac-ink-3, #8a94a6)'
  const common = { fill: 'var(--ac-ground, #f6f7f9)', stroke, strokeWidth: 2, strokeLinejoin: 'round' as const }
  if (view === 'left' || view === 'right') {
    return (
      <g transform={view === 'right' ? 'translate(400,0) scale(-1,1)' : undefined}>
        <path d="M18 118 L24 92 Q30 82 52 80 L118 72 L158 40 Q166 34 178 34 L268 34 Q280 34 290 42 L326 74 L368 82 Q382 86 384 100 L386 118 Q386 124 380 124 L20 124 Q16 124 18 118 Z" {...common} />
        <path d="M166 44 L178 40 L226 40 L226 72 L132 74 Z M234 40 L266 40 Q276 40 284 48 L312 72 L234 72 Z" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
        <line x1="230" y1="40" x2="230" y2="122" stroke={stroke} strokeWidth={1.2} />
        <circle cx="94" cy="124" r="24" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={2} />
        <circle cx="314" cy="124" r="24" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={2} />
        <circle cx="94" cy="124" r="9" fill="none" stroke={stroke} strokeWidth={1.5} />
        <circle cx="314" cy="124" r="9" fill="none" stroke={stroke} strokeWidth={1.5} />
      </g>
    )
  }
  if (view === 'front' || view === 'rear') {
    return (
      <g>
        <path d="M30 150 L30 92 Q32 74 52 70 L74 34 Q80 26 92 26 L168 26 Q180 26 186 34 L208 70 Q228 74 230 92 L230 150 Q230 158 222 158 L38 158 Q30 158 30 150 Z" {...common} />
        <path d={view === 'front' ? 'M80 36 L180 36 L198 68 L62 68 Z' : 'M86 38 L174 38 L190 66 L70 66 Z'} fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
        <rect x="44" y="92" width="38" height={view === 'front' ? 18 : 14} rx="5" fill="none" stroke={stroke} strokeWidth={1.5} />
        <rect x="178" y="92" width="38" height={view === 'front' ? 18 : 14} rx="5" fill="none" stroke={stroke} strokeWidth={1.5} />
        <rect x="96" y={view === 'front' ? 112 : 104} width="68" height="18" rx="3" fill="none" stroke={stroke} strokeWidth={1.5} />
        <rect x="36" y="158" width="34" height="16" rx="4" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
        <rect x="190" y="158" width="34" height="16" rx="4" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
      </g>
    )
  }
  return (
    <g>
      <path d="M52 30 Q100 4 148 30 L162 120 L162 300 Q160 356 100 366 Q40 356 38 300 L38 120 Z" {...common} />
      <path d="M58 104 Q100 88 142 104 L136 150 L64 150 Z" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
      <path d="M64 272 L136 272 L140 304 Q100 316 60 304 Z" fill="var(--ac-surface, #fff)" stroke={stroke} strokeWidth={1.5} />
      <rect x="64" y="156" width="72" height="110" rx="6" fill="none" stroke={stroke} strokeWidth={1.2} />
      <text x="100" y="22" textAnchor="middle" fontSize="11" fill={stroke}>
        ön
      </text>
    </g>
  )
}

/**
 * Body outline with marks (spec §83.4). Editable: click (or "İşaret ekle") adds a mark on the chosen view; the list
 * below sets its type, note, photo and, on a return, whether it is the same damage as a handover mark. Reference
 * marks (handover, previous return) are shown hollow and never change. A mark is not a damage case or a charge.
 */
export function DamageDiagram({
  marks,
  onChange,
  reference = [],
  referenceLabel,
  photos = [],
  editable,
  linkable,
}: {
  marks: MarkDraft[]
  onChange?: (m: MarkDraft[]) => void
  reference?: RentalDamageMark[]
  referenceLabel?: string
  photos?: RentalPhoto[]
  editable: boolean
  /** Return: a mark can be tied to a handover mark ("teslimde de vardı"). */
  linkable?: boolean
}) {
  // Open on the first view that has a mark, so existing damage is visible at once.
  const [view, setView] = useState<DamageView>(() => DAMAGE_VIEWS.find((v) => marks.some((m) => m.view === v) || reference.some((m) => m.view === v)) ?? 'left')
  const [w, h] = VIEWBOX[view]
  const numbered = marks.map((m, i) => ({ ...m, n: i + 1 }))
  const refNumbered = reference.map((m, i) => ({ ...m, n: i + 1 }))
  const add = (x: number, y: number) => {
    if (!onChange || marks.length >= MAX_DAMAGE_MARKS) return
    onChange([...marks, { key: crypto.randomUUID(), view, x, y, category: '', note: '', photoId: '', existingMarkId: '' }])
  }
  const update = (key: string, patch: Partial<MarkDraft>) => onChange?.(marks.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  const countIn = (v: DamageView) => marks.filter((m) => m.view === v).length + reference.filter((m) => m.view === v).length

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Araç görünümü" className="flex flex-wrap gap-1">
        {DAMAGE_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === view}
            onClick={() => setView(v)}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium', v === view ? 'border-blue/45 bg-blue-soft/40 text-blue-ink' : 'border-line text-ink-2 hover:bg-ground')}
          >
            {DAMAGE_VIEW_LABELS[v]}
            {countIn(v) > 0 && <span className="tnum text-[11.5px]">({countIn(v)})</span>}
          </button>
        ))}
      </div>
      <div className="relative mx-auto w-full max-w-[460px]">
        <svg
          viewBox={`0 0 ${w} ${h + 30}`}
          role="img"
          aria-label={`${DAMAGE_VIEW_LABELS[view]} görünüm, ${countIn(view)} işaret${editable ? '. İşaret eklemek için tıklayın.' : ''}`}
          className={cn('w-full select-none', editable && 'cursor-crosshair')}
          onClick={(e) => {
            if (!editable) return
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
            const x = Math.round(((e.clientX - r.left) / r.width) * 1000)
            const y = Math.round(((e.clientY - r.top) / r.height) * 1000)
            add(Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y)))
          }}
        >
          <g transform="translate(0,12)">
            <Outline view={view} />
          </g>
          {refNumbered
            .filter((m) => m.view === view)
            .map((m) => (
              <g key={`r-${m.id}`} transform={`translate(${(m.x / 1000) * w},${(m.y / 1000) * (h + 30)})`}>
                <circle r="9" fill="var(--ac-surface, #fff)" stroke="var(--ac-ink-3, #8a94a6)" strokeWidth="2" strokeDasharray="3 2" />
                <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="600" fill="var(--ac-ink-2, #5b6576)">
                  T{m.n}
                </text>
              </g>
            ))}
          {numbered
            .filter((m) => m.view === view)
            .map((m) => (
              <g key={m.key} transform={`translate(${(m.x / 1000) * w},${(m.y / 1000) * (h + 30)})`}>
                <circle r="10" fill={m.existingMarkId ? 'var(--ac-ink-3, #8a94a6)' : 'var(--ac-alert, #d14343)'} stroke="#fff" strokeWidth="2" />
                <text textAnchor="middle" dy="3.5" fontSize="10" fontWeight="700" fill="#fff">
                  {m.n}
                </text>
              </g>
            ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {reference.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full border-2 border-dashed border-ink-3 bg-surface" /> {referenceLabel ?? 'Referans işaret'} (T)
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full bg-alert" /> {linkable ? 'Yeni bulgu' : 'Bu kontroldeki işaret'}
        </span>
        {linkable && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full bg-ink-3" /> Teslimde de vardı
          </span>
        )}
      </div>
      {editable && (
        <button type="button" onClick={() => add(500, 500)} disabled={marks.length >= MAX_DAMAGE_MARKS} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground disabled:opacity-50">
          <Plus size={14} weight="bold" /> {DAMAGE_VIEW_LABELS[view]} görünüme işaret ekle
        </button>
      )}
      {numbered.length > 0 && (
        <ol aria-label="İşaretler" className="divide-y divide-line-soft rounded-lg border border-line">
          {numbered.map((m) => (
            <li key={m.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[28px_1fr]">
              <span aria-hidden className={cn('tnum grid size-6 place-items-center rounded-full text-[11px] font-bold text-white', m.existingMarkId ? 'bg-ink-3' : 'bg-alert')}>
                {m.n}
              </span>
              {editable ? (
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <Select compact aria-label={`İşaret ${m.n} türü`} value={m.category} onChange={(e) => update(m.key, { category: e.target.value as DamageCategory })}>
                    <option value="">Tür seçin · {DAMAGE_VIEW_LABELS[m.view]}</option>
                    {DAMAGE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {DAMAGE_CATEGORY_LABELS[c]} · {DAMAGE_VIEW_LABELS[m.view]}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label={`İşaret ${m.n} notu`} placeholder="Kısa açıklama (isteğe bağlı)" maxLength={300} value={m.note} onChange={(e) => update(m.key, { note: e.target.value })} className="h-9 text-[13.5px]" />
                  <Select compact aria-label={`İşaret ${m.n} fotoğrafı`} value={m.photoId} onChange={(e) => update(m.key, { photoId: e.target.value })}>
                    <option value="">Fotoğraf bağlanmadı</option>
                    {photos.map((p, i) => (
                      <option key={p.id} value={p.id}>
                        Fotoğraf {i + 1} · {PHOTO_ANGLE_LABELS[p.angle]}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-2">
                    {linkable && (
                      <Select compact aria-label={`İşaret ${m.n}: teslimde de var mıydı?`} value={m.existingMarkId} onChange={(e) => update(m.key, { existingMarkId: e.target.value })} className="min-w-0 flex-1">
                        <option value="">Yeni bulgu (teslimde yoktu)</option>
                        {refNumbered.map((r) => (
                          <option key={r.id} value={r.id}>
                            Teslimdeki T{r.n} ile aynı · {DAMAGE_CATEGORY_LABELS[r.category]}
                          </option>
                        ))}
                      </Select>
                    )}
                    <button type="button" aria-label={`İşaret ${m.n}'i kaldır`} onClick={() => onChange?.(marks.filter((x) => x.key !== m.key))} className="ml-auto grid size-9 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-alert-soft hover:text-alert">
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ink">
                  <span className="font-medium">{m.category ? DAMAGE_CATEGORY_LABELS[m.category] : '—'}</span>
                  <span className="text-ink-2"> · {DAMAGE_VIEW_LABELS[m.view]}</span>
                  {m.existingMarkId && <span className="text-ink-2"> · teslimde de vardı</span>}
                  {m.note && <span className="text-ink-2"> · {m.note}</span>}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-[12px] text-ink-3">İşaret ve çizim, fotoğrafın yerine geçmez; hasar dosyası, sorumluluk veya ücret oluşturmaz.</p>
    </div>
  )
}
