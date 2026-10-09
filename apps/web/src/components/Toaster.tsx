import { CheckCircle, X } from '@phosphor-icons/react'
import { useEffect, useSyncExternalStore } from 'react'

interface Toast {
  id: number
  message: string
}
let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Confirms a completed action. Errors stay on the page where they can be fixed, not in a toast. */
export function toast(message: string) {
  toasts = [...toasts, { id: ++seq, message }]
  emit()
}
const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function Item({ t }: { t: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 5000)
    return () => clearTimeout(timer)
  }, [t.id])
  return (
    <div className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-32px)] animate-fade items-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 pr-2 pl-3.5 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)]">
      <CheckCircle size={18} weight="fill" className="shrink-0 text-ok" />
      <span className="flex-1 text-[13.5px]">{t.message}</span>
      <button type="button" aria-label="Kapat" onClick={() => dismiss(t.id)} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-ground hover:text-ink">
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
