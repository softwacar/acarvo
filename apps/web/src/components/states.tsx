import { type Icon, LockSimple, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Calm, full-width message panel used for empty, error and forbidden states. */
export function StatePanel({
  icon: Ico,
  title,
  children,
  tone = 'neutral',
  className,
}: {
  icon: Icon
  title: string
  children?: ReactNode
  tone?: 'neutral' | 'alert'
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface px-6 py-10 sm:px-10', className)}>
      <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
        <span className={cn('grid size-11 place-items-center rounded-lg', tone === 'alert' ? 'bg-alert-soft text-alert' : 'bg-ground text-ink-2')}>
          <Ico size={22} />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {children && <div className="mt-1.5 text-ink-2">{children}</div>}
      </div>
    </section>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <StatePanel icon={WarningCircle} title="Veriler yüklenemedi" tone="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 h-9 rounded-lg border border-line bg-surface px-3.5 font-medium text-ink hover:bg-ground">
          Tekrar dene
        </button>
      )}
    </StatePanel>
  )
}

export function ForbiddenState({ message = 'Bu ekranı görüntüleme yetkiniz yok. Yetki için şirket yöneticinize başvurun.' }: { message?: string }) {
  return (
    <StatePanel icon={LockSimple} title="Erişim yetkiniz yok">
      <p>{message}</p>
    </StatePanel>
  )
}

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-1 text-ink-2">{description}</p>}
      </div>
      {children}
    </div>
  )
}
