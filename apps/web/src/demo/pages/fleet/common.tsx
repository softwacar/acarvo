import { type ReactNode, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import type { Db } from '../../core/types'
import { L } from '../../i18n'
import { AreaF } from '../../ui/forms'
import { runAction } from '../../ui/hooks'
import { ActionError, btnSmall, FinanceDialog } from '../../ui/kit'

/** Runs a demo action and keeps the last rule violation for inline display in a drawer. */
export function useAct() {
  const [error, setError] = useState<string | null>(null)
  const act = <T,>(fn: (d: Db) => T, msg?: string) => {
    const x = runAction(fn, msg)
    setError(x.ok ? null : x.error)
    return x
  }
  return { act, error, setError }
}

export function RecordDrawer({ title, subtitle, onClose, error, children }: { title: string; subtitle?: ReactNode; onClose: () => void; error?: string | null; children: ReactNode }) {
  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-5">
        <ActionError error={error ?? null} />
        {children}
      </div>
    </Sheet>
  )
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{title}</h3>
      {children}
    </section>
  )
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

export function ActBtn({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={btnSmall} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

/** One required text (reason, reference, note) with a confirm button. */
export function PromptDialog({ title, description, label, confirm, min = 3, danger, rows = 3, run, onClose }: { title: string; description: ReactNode; label: string; confirm: string; min?: number; danger?: boolean; rows?: number; run: (text: string) => { ok: true } | { ok: false; error: string; fields: Record<string, string> }; onClose: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | undefined>()
  return (
    <FinanceDialog
      title={title}
      description={description}
      confirm={confirm}
      danger={danger}
      onClose={onClose}
      onSubmit={() => {
        if (text.trim().length < min) {
          setErr(L(`En az ${min} karakter yazın`, `Write at least ${min} characters`))
          return L('Bu alan zorunlu.', 'This field is required.')
        }
        const x = run(text)
        if (!x.ok) {
          setErr(Object.values(x.fields)[0])
          return x.error
        }
        onClose()
      }}
    >
      <AreaF id="pd-t" label={label} required value={text} onChange={setText} error={err} rows={rows} />
    </FinanceDialog>
  )
}

/** "12,00 EUR · 5,00 BAM": one total per currency, never mixed. */
export const byCurText = (rec: Record<string, number>, fmtFn: (minor: number, cur: string) => string): string => {
  const parts = Object.entries(rec).filter(([, v]) => v !== 0).map(([cur, v]) => fmtFn(v, cur))
  return parts.length ? parts.join('\n') : '—'
}
