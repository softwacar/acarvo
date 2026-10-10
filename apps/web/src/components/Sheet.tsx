import { X } from '@phosphor-icons/react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useReturnFocus } from './useReturnFocus'

/**
 * Right-hand panel for forms and details (full width on phones). Escape, overlay click and the close button dismiss it.
 * With `dirty`, closing first asks whether to discard what was typed.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  dirty = false,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  dirty?: boolean
}) {
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
              {subtitle && <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Kapat" className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
              <X size={18} />
            </Dialog.Close>
          </div>
          {confirming && (
            <div role="alertdialog" aria-label="Kaydedilmemiş değişiklikler" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hold/30 bg-hold-soft px-5 py-3 text-[13px]">
              <span className="min-w-0 flex-1 font-medium">Girdiğiniz bilgiler kaydedilmedi. Kapatılsın mı?</span>
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="h-8 rounded-md border border-line bg-surface px-3 font-medium hover:bg-ground">
                Devam et
              </button>
              <button type="button" onClick={onClose} className="h-8 rounded-md px-3 font-medium text-alert hover:bg-alert-soft">
                Kaydetmeden kapat
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
