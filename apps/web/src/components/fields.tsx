import { CaretDown } from '@phosphor-icons/react'
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const controlClass =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15 disabled:bg-ground disabled:text-ink-3 aria-[invalid=true]:border-alert aria-[invalid=true]:focus:ring-alert/15'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, 'h-auto min-h-[88px] py-2.5 leading-normal', className)} {...props} />
})

/** Native select (accessible, keyboard and mobile friendly) dressed in the ACARVO control style. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }>(function Select(
  { className, children, compact, ...props },
  ref,
) {
  return (
    <span className={cn('relative block', className)}>
      <select ref={ref} className={cn(controlClass, 'appearance-none pr-9', compact && 'h-9 text-[13.5px]')} {...props}>
        {children}
      </select>
      <CaretDown size={13} aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
    </span>
  )
})

/** Label, control, hint and error, wired for screen readers. */
export function Field({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1 font-medium">
        {label}
        {required ? (
          <span className="text-alert" aria-hidden>
            *
          </span>
        ) : (
          <span className="text-[12px] font-normal text-ink-3">isteğe bağlı</span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** aria props for a control inside <Field>. */
export const describe = (id: string, error?: string, hint?: boolean) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
})
