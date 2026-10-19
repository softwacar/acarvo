import { CaretRight, CheckCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { Alert } from '../core/calc/alerts'
import { L } from '../i18n'
import { entityHref } from './hooks'

/** One alert list for the Command Center, Risks and Dashboard: every row opens its source record. */
export function AlertList({ alerts, empty }: { alerts: Alert[]; empty?: string }) {
  if (!alerts.length)
    return (
      <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-ink-2 sm:px-5">
        <CheckCircle size={16} className="text-ok" /> {empty ?? L('Şu an dikkat gerektiren kayıt yok.', 'Nothing needs attention right now.')}
      </p>
    )
  return (
    <ul className="divide-y divide-line-soft">
      {alerts.map((a) => (
        <li key={a.id}>
          <Link to={entityHref(a.link.type, a.link.id) as never} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-ground/60 sm:px-5">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-alert' : a.severity === 'warning' ? 'bg-hold' : 'bg-blue')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">
                {a.title} <span className="sr-only">({a.severity})</span>
              </span>
              <span className="block text-[12.5px] text-ink-2">{a.detail}</span>
            </span>
            <CaretRight size={14} className="mt-1 text-ink-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
