import { cn } from '@/lib/utils'

/** ACARVO mark: ink tile with the blue plate band and a white A. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0 overflow-hidden rounded-[7px]', className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#101828" />
      <rect width="7" height="32" fill="#2f4cdd" />
      <rect x="7" width="1" height="32" fill="#101828" />
      <path d="M11.5 23 17.4 9h1.6L25 23h-3l-1.2-3h-5.3l-1.2 3h-2.8Zm5.1-5.6h3.3l-1.65-4.3-1.65 4.3Z" fill="#fff" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('leading-none', className)}>
      <span className="block text-[19px] font-semibold tracking-[-0.03em]">acarvo</span>
      <span className="mt-1 block text-[11px] font-medium tracking-[0.02em] text-ink-3">Filo operasyonu</span>
    </span>
  )
}
