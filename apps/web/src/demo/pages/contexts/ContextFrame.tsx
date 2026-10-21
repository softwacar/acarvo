import type { ReactNode } from 'react'
import { L } from '../../i18n'

/** Frame for the two separate contexts (Platform Console, Partner Portal): their own header, no company sidebar. */
export function ContextFrame({ title, subtitle, icon, actions, children }: { title: string; subtitle: string; icon: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <div role="note" className="border-b border-hold/30 bg-hold-soft px-4 py-1.5 text-center text-[12.5px] font-medium text-hold">
        {L('ACARVO DEMO — Örnek Veriler', 'ACARVO DEMO — Sample Data')} · {L('Etkileşimli ürün konsepti; gerçek entegrasyon yoktur.', 'Interactive product concept; no real integrations.')}
      </div>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-ink text-white">{icon}</span>
            <div>
              <h1 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h1>
              <p className="text-[12.5px] text-ink-2">{subtitle}</p>
            </div>
          </div>
          {actions}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1180px] space-y-5 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  )
}
