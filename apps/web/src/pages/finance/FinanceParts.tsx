import { currencyExponent, formatMoney } from '@acarvo/shared'
import { SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useReturnFocus } from '@/components/useReturnFocus'
import { TONE_CLASS, type Tone } from '@/lib/finance-labels'
import { cn } from '@/lib/utils'

export const btnPrimary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
export const btnSecondary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'
export const btnSmall = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-line-soft disabled:opacity-60'
export const btnGhost = 'h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink'

/** An amount with its ISO code, always. */
export function Money({ minor, currency, className }: { minor: number; currency: string; className?: string }) {
  return <span className={cn('tnum whitespace-nowrap', className)}>{formatMoney(minor, currency)}</span>
}

/** "12,50" for an input from minor units in the currency. */
export const toInput = (minor: number, currency: string) => {
  const exp = currencyExponent(currency)
  return exp ? (minor / 10 ** exp).toFixed(exp).replace('.', ',') : String(minor)
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[12px] font-medium whitespace-nowrap', TONE_CLASS[tone])}>{children}</span>
}

export function Section({ title, description, action, children, id }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  const hid = id ?? `fs-${title.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={hid} className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={hid} className="text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-2">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
      <WarningCircle size={17} className="mt-px shrink-0" />
      {error}
    </p>
  )
}

/** A clear, explicit confirmation for every money-related step: what exactly happens, in words and figures. */
export function FinanceDialog({
  title,
  description,
  summary,
  confirm,
  danger,
  onClose,
  onSubmit,
  children,
}: {
  title: string
  description: ReactNode
  /** Key facts shown before confirming (amount, currency, who, what). */
  summary?: [string, ReactNode][]
  confirm: string
  danger?: boolean
  onClose: () => void
  /** Returns an error message to keep the dialog open, or nothing on success. */
  onSubmit: () => Promise<string | void> | string | void
  children?: ReactNode
}) {
  const returnFocus = useReturnFocus()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade flex-col rounded-xl border border-line bg-surface shadow-xl outline-none"
        >
          <div className="border-b border-line px-5 pt-5 pb-4">
            <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description>
          </div>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (e) => {
              e.preventDefault()
              setPending(true)
              setError(null)
              try {
                const msg = await onSubmit()
                if (msg) setError(msg)
              } finally {
                setPending(false)
              }
            }}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {children}
              {summary && (
                <dl className="rounded-lg border border-line-soft bg-ground/60 px-3.5 py-2.5 text-[13px]">
                  {summary.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 py-1">
                      <dt className="text-ink-2">{k}</dt>
                      <dd className="min-w-0 text-right font-medium break-words text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <ErrorLine error={error} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
              <Dialog.Close className={btnGhost} disabled={pending}>
                Vazgeç
              </Dialog.Close>
              <button type="submit" disabled={pending} className={cn(btnPrimary, danger && 'bg-alert hover:bg-alert/90')}>
                {pending && <SpinnerGap size={16} className="animate-spin" />}
                {confirm}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Checkbox statement with an inline error (cash received / refunded, external process). */
export function Statement({ id, checked, onChange, error, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2.5 text-[13.5px] text-ink">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="mt-1 size-4 accent-blue" />
        <span>{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Turns a failed API call into a message plus per-field errors. */
export function apiError(e: unknown): { message: string; fields: Record<string, string> } {
  const x = e as { message?: string; fields?: Record<string, string> }
  return { message: x?.message ?? 'İşlem yapılamadı.', fields: x?.fields ?? {} }
}
