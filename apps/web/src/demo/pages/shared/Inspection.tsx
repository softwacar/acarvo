import { Camera, Check, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FuelLevel, Inspection, InspectionPin } from '../../core/types'
import { L } from '../../i18n'
import { SelectF, TextF } from '../../ui/forms'
import { useFmt } from '../../ui/hooks'
import { FUEL_LABEL } from '../../ui/status'

// Handover / return evidence: odometer, fuel, 4–5 photo slots and damage pins on a body diagram. In the demo no photo is
// uploaded: the slots are marked as captured examples, and the screen says so.

export interface InspectionDraft {
  km: string
  fuel: FuelLevel
  photos: boolean[]
  pins: InspectionPin[]
  note: string
}

export const PHOTO_SLOTS = () => [L('Ön', 'Front'), L('Arka', 'Rear'), L('Sol', 'Left'), L('Sağ', 'Right'), L('İç mekan', 'Interior'), L('Kilometre göstergesi', 'Odometer')]
export const emptyDraft = (km: number, fuel: FuelLevel = 'full'): InspectionDraft => ({ km: String(km), fuel, photos: [false, false, false, false, false, false], pins: [], note: '' })
export const photoCount = (d: InspectionDraft) => d.photos.filter(Boolean).length

const VIEWS: { id: InspectionPin['view']; label: () => string }[] = [
  { id: 'front', label: () => L('Ön', 'Front') },
  { id: 'rear', label: () => L('Arka', 'Rear') },
  { id: 'left', label: () => L('Sol', 'Left') },
  { id: 'right', label: () => L('Sağ', 'Right') },
  { id: 'top', label: () => L('Üst', 'Top') },
  { id: 'interior', label: () => L('İç mekan', 'Interior') },
]
const PIN_TYPES = () => ({ scratch: L('Çizik', 'Scratch'), dent: L('Göçük', 'Dent'), crack: L('Çatlak', 'Crack'), missing: L('Eksik parça', 'Missing part'), other: L('Diğer', 'Other') })

function Body({ view }: { view: InspectionPin['view'] }) {
  const stroke = 'var(--color-ink-3)'
  const common = { fill: 'var(--color-ground)', stroke, strokeWidth: 1.5 }
  if (view === 'left' || view === 'right')
    return (
      <g>
        <path d="M8 62 L12 46 Q16 38 30 36 L42 22 Q46 18 54 18 L74 18 Q82 18 86 24 L94 36 Q98 38 98 46 L98 62 Q98 66 94 66 L10 66 Q8 66 8 62 Z" {...common} />
        <path d="M44 24 L50 36 L72 36 L68 24 Z M76 24 L82 36 L90 36 L84 26 Z" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
        <circle cx="28" cy="66" r="9" fill="var(--color-ink-3)" />
        <circle cx="80" cy="66" r="9" fill="var(--color-ink-3)" />
      </g>
    )
  if (view === 'front' || view === 'rear')
    return (
      <g>
        <rect x="26" y="26" width="52" height="34" rx="8" {...common} />
        <path d="M34 28 L40 16 L64 16 L70 28 Z" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
        <circle cx="34" cy="50" r="3.5" fill={view === 'front' ? 'var(--color-hold)' : 'var(--color-alert)'} />
        <circle cx="70" cy="50" r="3.5" fill={view === 'front' ? 'var(--color-hold)' : 'var(--color-alert)'} />
        <rect x="22" y="58" width="9" height="12" rx="2" fill="var(--color-ink-3)" />
        <rect x="73" y="58" width="9" height="12" rx="2" fill="var(--color-ink-3)" />
      </g>
    )
  if (view === 'top')
    return (
      <g>
        <rect x="38" y="6" width="28" height="68" rx="12" {...common} />
        <rect x="42" y="22" width="20" height="14" rx="3" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
        <rect x="42" y="46" width="20" height="12" rx="3" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
      </g>
    )
  return (
    <g>
      <rect x="22" y="10" width="60" height="60" rx="8" {...common} />
      <rect x="30" y="18" width="18" height="18" rx="4" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
      <rect x="56" y="18" width="18" height="18" rx="4" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
      <rect x="30" y="46" width="44" height="16" rx="4" fill="var(--color-line-soft)" stroke={stroke} strokeWidth={1} />
    </g>
  )
}

export function InspectionForm({ draft, onChange, minKm, idPrefix, startPins = [] }: { draft: InspectionDraft; onChange: (d: InspectionDraft) => void; minKm: number; idPrefix: string; startPins?: InspectionPin[] }) {
  const fuel = FUEL_LABEL()
  const slots = PHOTO_SLOTS()
  const [view, setView] = useState<InspectionPin['view']>('front')
  const [type, setType] = useState<InspectionPin['type']>('scratch')
  const km = Number(draft.km.replace(/\D/g, ''))
  const kmErr = draft.km.trim() === '' ? undefined : km < minKm ? L(`Kilometre en az ${minKm.toLocaleString('tr-TR')} olmalı`, `Odometer must be at least ${minKm.toLocaleString('en-GB')}`) : undefined
  const pinsHere = draft.pins.filter((p) => p.view === view)
  const types = PIN_TYPES()
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id={`${idPrefix}-km`} label={L('Kilometre', 'Odometer')} required value={draft.km} onChange={(v) => onChange({ ...draft, km: v.replace(/[^\d]/g, '') })} error={kmErr} hint={`${L('Son kayıt', 'Last reading')}: ${minKm.toLocaleString('tr-TR')} km`} />
        <SelectF id={`${idPrefix}-fuel`} label={L('Yakıt seviyesi', 'Fuel level')} value={draft.fuel} onChange={(v) => onChange({ ...draft, fuel: v as FuelLevel })} options={Object.entries(fuel).map(([id, label]) => ({ id, label }))} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">
          {L('Fotoğraflar', 'Photos')} <span className="font-normal text-ink-2">({photoCount(draft)}/6 · {L('en az 4', 'at least 4')})</span>
        </legend>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((label, i) => {
            const on = draft.photos[i]
            return (
              <li key={label}>
                <button type="button" aria-pressed={on} onClick={() => onChange({ ...draft, photos: draft.photos.map((x, j) => (j === i ? !x : x)) })} className={cn('flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border text-[12.5px] transition-colors', on ? 'border-ok/50 bg-ok-soft text-ok' : 'border-dashed border-line bg-surface text-ink-2 hover:bg-line-soft')}>
                  {on ? <Check size={16} weight="bold" /> : <Camera size={16} />}
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-1.5 text-[12px] text-ink-3">{L('Demo: fotoğraf yüklenmez; kutuyu işaretlemek "örnek fotoğraf çekildi" anlamına gelir.', 'Demo: no photo is uploaded; ticking a slot means "example photo captured".')}</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">{L('Hasar işaretleri', 'Damage marks')}</legend>
        <div role="tablist" aria-label={L('Görünüm', 'View')} className="mb-2 flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" type="button" aria-selected={view === v.id} onClick={() => setView(v.id)} className={cn('h-8 rounded-md border px-2.5 text-[12.5px]', view === v.id ? 'border-blue bg-blue-soft text-blue-ink' : 'border-line bg-surface text-ink-2 hover:bg-line-soft')}>
              {v.label()} {draft.pins.filter((p) => p.view === v.id).length > 0 && <span className="tnum">· {draft.pins.filter((p) => p.view === v.id).length}</span>}
            </button>
          ))}
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <svg viewBox="0 0 104 80" className="w-full rounded-md border border-line bg-surface" role="img" aria-label={`${L('Araç şeması', 'Vehicle diagram')}: ${VIEWS.find((v) => v.id === view)?.label()}`} onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const x = Math.round(((e.clientX - r.left) / r.width) * 100)
            const y = Math.round(((e.clientY - r.top) / r.height) * 100)
            onChange({ ...draft, pins: [...draft.pins, { id: `pin-${Date.now()}-${draft.pins.length}`, view, x, y, type, note: '' }] })
          }}>
            <Body view={view} />
            {startPins.filter((p) => p.view === view).map((p) => <circle key={p.id} cx={(p.x / 100) * 104} cy={(p.y / 100) * 80} r={3.2} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.4} strokeDasharray="2 1.5" />)}
            {pinsHere.map((p, i) => (
              <g key={p.id}>
                <circle cx={(p.x / 100) * 104} cy={(p.y / 100) * 80} r={4} fill="var(--color-alert)" />
                <text x={(p.x / 100) * 104} y={(p.y / 100) * 80 + 1.6} textAnchor="middle" fontSize="5" fill="white" fontWeight="700">{i + 1}</text>
              </g>
            ))}
          </svg>
          <div className="space-y-2">
            <SelectF id={`${idPrefix}-ptype`} label={L('Yeni işaret türü', 'New mark type')} value={type} onChange={(v) => setType(v as InspectionPin['type'])} options={Object.entries(types).map(([id, label]) => ({ id, label }))} />
            <p className="text-[12px] text-ink-2">{L('Şemaya tıklayarak işaret ekleyin. Kesikli daire teslimde kayıtlı eski işaretlerdir.', 'Click the diagram to add a mark. Dashed circles are marks recorded at handover.')}</p>
          </div>
        </div>
        {draft.pins.length > 0 && (
          <ul className="mt-2 divide-y divide-line-soft rounded-md border border-line">
            {draft.pins.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
                <span>{VIEWS.find((v) => v.id === p.view)?.label()} · {types[p.type]}</span>
                <button type="button" className="rounded p-1.5 text-ink-2 hover:bg-line-soft" aria-label={L('İşareti sil', 'Delete mark')} onClick={() => onChange({ ...draft, pins: draft.pins.filter((x) => x.id !== p.id) })}>
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <TextF id={`${idPrefix}-note`} label={L('Not', 'Note')} value={draft.note} onChange={(v) => onChange({ ...draft, note: v })} />
    </div>
  )
}

export function InspectionView({ title, i, branchId }: { title: string; i?: Inspection; branchId?: string }) {
  const f = useFmt()
  const fuel = FUEL_LABEL()
  const types = PIN_TYPES()
  if (!i) return <p className="text-[13px] text-ink-2">{L('Kayıt yok.', 'No record.')}</p>
  return (
    <div className="space-y-2.5 text-[13.5px]">
      <p className="font-medium">{title}</p>
      <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
        <dt className="text-ink-2">{L('Zaman', 'Time')}</dt>
        <dd className="tnum">{f.dt(i.at, branchId)}</dd>
        <dt className="text-ink-2">{L('Kilometre', 'Odometer')}</dt>
        <dd className="tnum">{i.km.toLocaleString(L('tr-TR', 'en-GB'))} km</dd>
        <dt className="text-ink-2">{L('Yakıt', 'Fuel')}</dt>
        <dd>{fuel[i.fuel]}</dd>
        <dt className="text-ink-2">{L('Fotoğraf', 'Photos')}</dt>
        <dd>{i.photos.length} · {i.photos.map((p) => p.label).join(', ')}</dd>
        <dt className="text-ink-2">{L('Hasar işareti', 'Marks')}</dt>
        <dd>{i.pins.length ? i.pins.map((p) => types[p.type]).join(', ') : L('Yok', 'None')}</dd>
        {i.note && (
          <>
            <dt className="text-ink-2">{L('Not', 'Note')}</dt>
            <dd>{i.note}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
