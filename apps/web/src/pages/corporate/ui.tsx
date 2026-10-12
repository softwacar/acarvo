import { SpinnerGap } from '@phosphor-icons/react'
import type { CorporateDetail } from '@acarvo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { type ReactNode, useId, useState } from 'react'
import { Field, Select } from '@/components/fields'
import { useReturnFocus } from '@/components/useReturnFocus'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'

export const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
export const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'

export function Panel({ title, action, children, className, id }: { title: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const generated = useId()
  const headingId = id ?? generated
  return (
    <section aria-labelledby={headingId} className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small confirm-with-reason dialog used for archive, restore and ending a link. */
export function ReasonDialog<T extends string>({
  title,
  description,
  reasons,
  labels,
  confirm,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  description: ReactNode
  reasons: readonly T[]
  labels: Record<T, string>
  confirm: string
  pending: boolean
  error: string | null
  onConfirm: (reason: T) => void
  onClose: () => void
}) {
  const returnFocus = useReturnFocus()
  const [reason, setReason] = useState<T | ''>('')
  const [localError, setLocalError] = useState<string | null>(null)
  const shown = localError ?? error
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason) return setLocalError('Bir neden seçin')
              setLocalError(null)
              onConfirm(reason)
            }}
          >
            <Field id="reason-select" label="Neden" required error={shown ?? undefined}>
              <Select id="reason-select" aria-invalid={shown ? true : undefined} aria-describedby={shown ? 'reason-select-error' : undefined} value={reason} onChange={(e) => setReason(e.target.value as T)}>
                <option value="">Seçin</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {labels[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={pending} className={btnPrimary}>
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

/** Keeps the account query in sync after any change (detail, list, history). */
export function useAccountUpdated(accountId: string) {
  const session = useSession()
  const qc = useQueryClient()
  return (next?: CorporateDetail) => {
    if (next) qc.setQueryData(['corporate-account', session.company?.id, accountId], next)
    else void qc.invalidateQueries({ queryKey: ['corporate-account', session.company?.id, accountId] })
    void qc.invalidateQueries({ queryKey: ['corporate-accounts'] })
    void qc.invalidateQueries({ queryKey: ['corporate-history', session.company?.id, accountId] })
  }
}

export const conflictMessage = 'Bu kayıt siz işlem yaparken güncellendi. Güncel bilgiler yüklendi; kontrol edip yeniden deneyin.'

