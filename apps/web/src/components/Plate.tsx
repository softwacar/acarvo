import { cn } from '@/lib/utils'

const COUNTRY_BAND: Record<string, string> = { BA: 'BIH' }

/** Registration plate (V5): blue country band where the company's country is known, plate figures. */
export function Plate({ plate, country, size = 'sm', className }: { plate: string; country?: string; size?: 'sm' | 'md'; className?: string }) {
  const band = country ? COUNTRY_BAND[country] : undefined
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-stretch overflow-hidden rounded-[5px] border-[1.5px] border-ink bg-surface',
        size === 'md' ? 'h-9' : 'h-[26px]',
        className,
      )}
    >
      {band && (
        <span aria-hidden className={cn('flex flex-col items-center justify-end bg-[#1a3d96] pb-[3px] text-white', size === 'md' ? 'w-5' : 'w-[14px]')}>
          <span className={cn('mt-[3px] mb-auto rounded-full border border-dotted border-[#ffd84a]', size === 'md' ? 'size-[7px]' : 'size-[5px]')} />
          <span className={cn('leading-none font-semibold', size === 'md' ? 'text-[7.5px]' : 'text-[5.5px]')}>{band}</span>
        </span>
      )}
      <span className={cn('tnum flex items-center font-semibold whitespace-nowrap tracking-[0.06em] text-ink', size === 'md' ? 'px-3 text-[19px]' : 'px-1.5 text-[13px]')}>
        {plate}
      </span>
    </span>
  )
}
