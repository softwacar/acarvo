import { Check, ChevronDown } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface FacetOption {
  value: string
  label: string
  count: number
}

/** Faceted filter in the tablecn pattern: dashed trigger, searchable multi-select, live counts. */
export function FacetFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FacetOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const picked = options.filter((o) => selected.includes(o.value))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border pr-2 pl-2.5 hover:bg-ground data-[state=open]:bg-ground',
            picked.length ? 'border-plate/35 bg-plate-soft text-ink hover:bg-plate-soft' : 'border-rule bg-surface text-ink/85',
          )}
        >
          {title}
          {picked.length > 0 && (
            <span className="font-medium text-plate">
              {picked.length > 2 ? `${picked.length} seçili` : picked.map((p) => p.label).join(', ')}
            </span>
          )}
          <ChevronDown className="size-3.5 text-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} className="h-9" />
          <CommandList>
            <CommandEmpty>Sonuç yok</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = selected.includes(o.value)
                return (
                  <CommandItem key={o.value} onSelect={() => toggle(o.value)} className="gap-2">
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded-[3px] border',
                        on ? 'border-plate bg-plate text-white' : 'border-ink/30',
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1">{o.label}</span>
                    <span className="figures text-[12px] text-faint">{o.count}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-graphite">
                    Seçimi temizle
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
