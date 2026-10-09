import { CircleAlert, CircleCheck, OctagonX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Readiness, Vehicle } from './data'

export const READINESS_LABEL: Record<Readiness, string> = {
  ready: 'Hazır',
  check: 'Kontrol gerekli',
  blocked: 'Hazır değil',
}

const ICON = { ready: CircleCheck, check: CircleAlert, blocked: OctagonX }
const TONE = { ready: 'text-graphite', check: 'text-amber', blocked: 'text-signal' }

/** Readiness uses an icon shape plus words, never colour alone. */
export function ReadinessText({ v, withReason = false, showCount = true }: { v: Vehicle; withReason?: boolean; showCount?: boolean }) {
  const Icon = ICON[v.readiness]
  return (
    <div className="min-w-0">
      <div className={cn('flex items-center gap-1.5 font-medium', TONE[v.readiness])}>
        <Icon className="size-3.5 shrink-0" strokeWidth={2} />
        <span className={v.readiness === 'ready' ? 'font-normal text-ink/80' : undefined}>{READINESS_LABEL[v.readiness]}</span>
        {showCount && v.blockers.length > 1 && <span className="figures text-[12px] font-normal">+{v.blockers.length - 1}</span>}
      </div>
      {withReason && v.blockers[0] && <div className="truncate pl-5 text-[12px] text-graphite">{v.blockers[0]}</div>}
    </div>
  )
}
