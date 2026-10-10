import { X } from '@phosphor-icons/react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'

/** Right-hand panel for forms and details (full width on phones). Escape, overlay click and the close button dismiss it. */
export function Sheet({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full animate-fade flex-col border-l border-line bg-surface shadow-xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Kapat" className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
