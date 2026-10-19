import { CaretDown, Check } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Select, Textarea, describe } from '@/components/fields'
import { Field } from './dialogs'
import { cn } from '@/lib/utils'
import { L } from '../i18n'
import { CURRENCIES, parseAmount, toInput } from '../core/money'
import { fromLocalInput, toLocalInput } from '../core/time'
import type { Cur, Db, Id, Iso } from '../core/types'
import { useDb } from './hooks'

export { Field, Input, Select, Textarea, describe }

export function TextF({ id, label, value, onChange, error, hint, required, type = 'text', placeholder, maxLength }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; type?: string; placeholder?: string; maxLength?: number }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <Input {...describe(id, error, !!hint)} type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function AreaF({ id, label, value, onChange, error, hint, required, rows = 3 }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; rows?: number }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <Textarea {...describe(id, error, !!hint)} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function SelectF({ id, label, value, onChange, options, error, hint, required, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string; disabled?: boolean }[]; error?: string; hint?: ReactNode; required?: boolean; placeholder?: string }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <Select {...describe(id, error, !!hint)} value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function CheckF({ id, checked, onChange, children, error }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2.5 text-[13.5px] text-ink">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} className="mt-1 size-4 accent-blue" />
        <span>{children}</span>
      </label>
      {error && <p className="mt-1 text-[13px] text-alert">{error}</p>}
    </div>
  )
}

/** Date and time in a zone's wall time; the value is an ISO instant. */
export function DateTimeF({ id, label, value, onChange, tz, error, hint, required }: { id: string; label: string; value: Iso; onChange: (v: Iso) => void; tz: string; error?: string; hint?: ReactNode; required?: boolean }) {
  return (
    <Field id={id} label={label} error={error} hint={hint ?? `${L('Saat dilimi', 'Time zone')}: ${tz}`} required={required}>
      <Input {...describe(id, error, true)} type="datetime-local" step={900} value={value ? toLocalInput(value, tz) : ''} onChange={(e) => e.target.value && onChange(fromLocalInput(e.target.value, tz))} />
    </Field>
  )
}

export function DateF({ id, label, value, onChange, error, hint, required }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean }) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <Input {...describe(id, error, !!hint)} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** Amount with ISO currency: typed text, parsed to minor units. Returns the parse result through onChange. */
export function MoneyF({ id, label, amount, onAmount, cur, onCur, currencies, error, hint, required, lockCurrency }: { id: string; label: string; amount: string; onAmount: (v: string) => void; cur: Cur; onCur: (c: Cur) => void; currencies: Cur[]; error?: string; hint?: ReactNode; required?: boolean; lockCurrency?: boolean }) {
  const invalid = amount.trim() !== '' && parseAmount(amount, cur) === null
  return (
    <Field id={id} label={label} error={error ?? (invalid ? L('Geçerli bir tutar girin', 'Enter a valid amount') : undefined)} hint={hint} required={required}>
      <div className="flex gap-2">
        <Input {...describe(id, error ?? (invalid ? 'x' : undefined), !!hint)} inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} className="tnum min-w-0 flex-1" />
        <Select aria-label={L('Para birimi', 'Currency')} value={cur} disabled={lockCurrency} onChange={(e) => onCur(e.target.value)} className="w-[96px] shrink-0">
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
    </Field>
  )
}
export const amountToMinor = (text: string, cur: Cur) => parseAmount(text, cur)
export { toInput }

// ---------------------------------------------------------------- combobox for records

export interface PickItem {
  id: Id
  label: string
  sub?: string
  disabled?: boolean
}

/** Searchable single choice (keyboard: arrows, Enter, Escape). */
export function ComboF({ id, label, items, value, onChange, error, hint, required, placeholder }: { id: string; label: string; items: PickItem[]; value: Id; onChange: (v: Id) => void; error?: string; hint?: ReactNode; required?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const selected = items.find((i) => i.id === value)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (t ? items.filter((i) => `${i.label} ${i.sub ?? ''}`.toLowerCase().includes(t)) : items).slice(0, 60)
  }, [items, q])
  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const choose = (i: PickItem) => {
    if (i.disabled) return
    onChange(i.id)
    setOpen(false)
    setQ('')
  }
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <div ref={box} className="relative">
        <div className="relative">
          <Input
            {...describe(id, error, !!hint)}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            autoComplete="off"
            value={open ? q : (selected?.label ?? '')}
            placeholder={selected ? selected.label : (placeholder ?? L('Ara ve seç…', 'Search and choose…'))}
            className="pr-8"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
              setHi(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setOpen(true)
                setHi((h) => Math.min(list.length - 1, h + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(0, h - 1))
              } else if (e.key === 'Enter' && open && list[hi]) {
                e.preventDefault()
                choose(list[hi]!)
              } else if (e.key === 'Escape') setOpen(false)
            }}
          />
          <CaretDown size={13} aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
        </div>
        {open && (
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="absolute z-40 mt-1 max-h-[260px] w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
            {list.length === 0 && <li className="px-3 py-2 text-[13px] text-ink-3">{L('Sonuç yok', 'No results')}</li>}
            {list.map((i, idx) => (
              <li
                key={i.id}
                role="option"
                aria-selected={i.id === value}
                aria-disabled={i.disabled}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(i)
                }}
                onMouseEnter={() => setHi(idx)}
                className={cn('flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[13.5px]', idx === hi && 'bg-ground', i.disabled && 'cursor-not-allowed opacity-50')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{i.label}</span>
                  {i.sub && <span className="block truncate text-[12px] text-ink-3">{i.sub}</span>}
                </span>
                {i.id === value && <Check size={14} className="text-blue" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}

// ---------------------------------------------------------------- common option builders

export const branchOptions = (d: Db, ids?: Id[]) => d.branches.filter((b) => b.active && (!ids || ids.includes(b.id))).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}` }))
export const classOptions = (d: Db) => d.classes.map((c) => ({ id: c.id, label: c.name }))
export const userOptions = (d: Db) => d.users.filter((u) => u.status === 'active').map((u) => ({ id: u.id, label: `${u.name} — ${u.title}` }))
export const currencyOptions = (cs: Cur[]) => cs.map((c) => ({ id: c, label: c }))
export const allCurrencies = () => CURRENCIES.map((c) => c.code)

export function useDbSel<T>(sel: (d: Db) => T): T {
  return sel(useDb())
}
