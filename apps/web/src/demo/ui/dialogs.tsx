import { CheckCircle, SpinnerGap, WarningCircle, X } from '@phosphor-icons/react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useReturnFocus } from '@/components/useReturnFocus'
import { cn } from '@/lib/utils'
import { btnGhost, btnPrimary } from '@/pages/finance/FinanceParts'
import { L } from '../i18n'

// Demo-local overlays (dialog, side sheet, toast). They match the application's components but their fixed texts
// (Cancel, Close, unsaved-changes prompt) follow the demo language; the real components stay untouched.

/** One explicit confirmation for money-related and state-changing steps. Returns an error text to keep it open. */
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
  const busy = useRef(false)
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
              // A second press while the first is still being processed is ignored (no double submission).
              if (busy.current) return
              busy.current = true
              setPending(true)
              setError(null)
              try {
                const msg = await onSubmit()
                if (msg) setError(msg)
              } finally {
                busy.current = false
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
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
                  <WarningCircle size={17} className="mt-px shrink-0" />
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
              <Dialog.Close className={btnGhost} disabled={pending}>
                {L('Vazgeç', 'Cancel')}
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

/** Right-hand panel for details and forms (full width on phones). Escape, overlay click and the close button dismiss it. */
export function Sheet({ title, subtitle, onClose, children, footer, dirty = false }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; dirty?: boolean }) {
  const returnFocus = useReturnFocus()
  const [confirming, setConfirming] = useState(false)
  const requestClose = () => (dirty ? setConfirming(true) : onClose())
  return (
    <Dialog.Root open onOpenChange={(o) => !o && requestClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full animate-fade flex-col border-l border-line bg-surface shadow-xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">{subtitle ?? ' '}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={L('Kapat', 'Close')} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
              <X size={18} />
            </Dialog.Close>
          </div>
          {confirming && (
            <div role="alertdialog" aria-label={L('Kaydedilmemiş değişiklikler', 'Unsaved changes')} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hold/30 bg-hold-soft px-5 py-3 text-[13px]">
              <span className="min-w-0 flex-1 font-medium">{L('Girdiğiniz bilgiler kaydedilmedi. Kapatılsın mı?', 'What you entered was not saved. Close anyway?')}</span>
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="h-8 rounded-md border border-line bg-surface px-3 font-medium hover:bg-ground">
                {L('Devam et', 'Keep editing')}
              </button>
              <button type="button" onClick={onClose} className="h-8 rounded-md px-3 font-medium text-alert hover:bg-alert-soft">
                {L('Kaydetmeden kapat', 'Close without saving')}
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------- toast (confirms a completed demo action)

interface ToastItem {
  id: number
  message: string
}
let toasts: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string) {
  toasts = [...toasts, { id: ++seq, message }]
  emit()
}
const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function Item({ t }: { t: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 5000)
    return () => clearTimeout(timer)
  }, [t.id])
  return (
    <div className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-32px)] animate-fade items-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 pr-2 pl-3.5 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)]">
      <CheckCircle size={18} weight="fill" className="shrink-0 text-ok" />
      <span className="flex-1 text-[13.5px]">{t.message}</span>
      <button type="button" aria-label={L('Kapat', 'Close')} onClick={() => dismiss(t.id)} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-ground hover:text-ink">
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {list.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- form field (label, control, hint, error)

/** Same as the application's Field, with the screen-reader "required" text in the demo language. */
export function Field({ id, label, required, hint, error, className, children }: { id: string; label: string; required?: boolean; hint?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1 text-[13.5px] font-medium text-ink">
        {label}
        {required && (
          <>
            <span className="text-alert" aria-hidden>
              *
            </span>
            <span className="sr-only">{L('(zorunlu)', '(required)')}</span>
          </>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
