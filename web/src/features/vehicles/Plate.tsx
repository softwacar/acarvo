import { cn } from '@/lib/utils'

/** Registration plate rendered as a quiet plate shape: blue country band, condensed figures. */
export function Plate({ value, size = 'sm', className }: { value: string; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[3px] border border-ink/75 bg-surface text-ink',
        size === 'sm' ? 'h-[22px]' : 'h-8',
        className,
      )}
    >
      <span aria-hidden className={cn('bg-plate', size === 'sm' ? 'w-[5px]' : 'w-2')} />
      <span
        className={cn(
          'figures flex items-center font-semibold tracking-[0.06em] whitespace-nowrap',
          size === 'sm' ? 'px-1.5 text-[13px]' : 'px-2.5 text-[19px]',
        )}
      >
        {value}
      </span>
    </span>
  )
}
