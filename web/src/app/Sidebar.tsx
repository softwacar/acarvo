import { ChevronDown, ChevronsUpDown, Search } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  count?: number
  tone?: 'alert'
}
interface NavGroup {
  label: string
  items: NavItem[]
}

/** §4 canonical navigation: 7 groups, 36 links. Counts are demo projections. */
const NAV: NavGroup[] = [
  { label: 'Genel', items: [{ label: 'Ana ekran' }, { label: 'Komuta merkezi', count: 7, tone: 'alert' }, { label: 'Filo asistanı' }] },
  {
    label: 'Operasyon',
    items: [
      { label: 'Rezervasyonlar', count: 18 },
      { label: 'Kiralamalar', count: 9 },
      { label: 'Takvim' },
      { label: 'Görevler', count: 4 },
      { label: 'Araçlar' },
      { label: 'Bakım ve servis', count: 2 },
      { label: 'Olay merkezi', count: 1 },
      { label: 'Hasar kayıtları', count: 3 },
      { label: 'Ceza modülü' },
    ],
  },
  {
    label: 'Müşteri ve ticari',
    items: [
      { label: 'Müşteriler' }, { label: 'Kurumsal hesaplar' }, { label: 'Talep merkezi' }, { label: 'Partnerler' },
      { label: 'Araç tedarikçileri' }, { label: 'Fiyatlandırma' },
    ],
  },
  {
    label: 'Kontrol ve analiz',
    items: [
      { label: 'Onay merkezi' }, { label: 'Kurallar' }, { label: 'Gelir kontrolü' }, { label: 'Riskler ve istisnalar' },
      { label: 'Kapasite planlama' }, { label: 'Filo analizi' }, { label: 'Fırsatlar' }, { label: 'Raporlar' },
    ],
  },
  { label: 'Finans', items: [{ label: 'Finans' }, { label: 'Masraflar' }, { label: 'Şube kasaları' }] },
  { label: 'Kayıtlar', items: [{ label: 'Sözleşmeler' }, { label: 'Belge merkezi' }, { label: 'İşlem geçmişi' }] },
  { label: 'Yönetim', items: [{ label: 'Şubeler' }, { label: 'Kullanıcılar' }, { label: 'Roller ve yetkiler' }, { label: 'Ayarlar' }] },
]

/** The ACARVO mark is a registration plate: country band plus the name set in plate figures. */
function Wordmark() {
  return (
    <span className="inline-flex h-[26px] items-stretch overflow-hidden rounded-[4px] border-[1.5px] border-ink bg-surface">
      <span aria-hidden className="flex w-[7px] flex-col items-center justify-center gap-[2px] bg-plate">
        <span className="size-[2px] rounded-full bg-white/70" />
        <span className="size-[2px] rounded-full bg-white/70" />
        <span className="size-[2px] rounded-full bg-white/70" />
      </span>
      <span className="figures flex items-center px-[7px] text-[15px] font-semibold tracking-[0.08em] text-ink" style={{ fontStretch: '80%' }}>
        ACARVO
      </span>
    </span>
  )
}

export function Sidebar({ active, mobileOpen, onClose }: { active: string; mobileOpen: boolean; onClose: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Genel: true, Operasyon: true })

  return (
    <>
      {mobileOpen && <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-ink/25 xl:hidden" />}
      <aside
        className={cn(
          'h-svh w-[216px] shrink-0 flex-col border-r border-rule bg-sidebar xl:flex',
          mobileOpen ? 'fixed inset-y-0 left-0 z-50 flex shadow-xl' : 'hidden',
        )}
      >
        <div className="px-3 pt-4">
          <div className="px-1.5">
            <Wordmark />
          </div>
          <button
            type="button"
            className="mt-4 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-ink text-[11px] font-semibold text-white">DR</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-medium">Drina Rent a Car</span>
              <span className="block truncate text-[12px] text-graphite">Tüm şubeler</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-faint" />
          </button>
          <button
            type="button"
            className="mt-3 flex h-8 w-full items-center gap-2 rounded-md border border-rule bg-surface px-2.5 text-graphite hover:border-ink/25"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Ara</span>
            <kbd className="font-sans text-[11px] text-faint">Ctrl K</kbd>
          </button>
        </div>

        <nav aria-label="Ana menü" className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-rule px-3 pt-2 pb-3">
          {NAV.map((g) => {
            const isOpen = open[g.label] ?? false
            return (
              <div key={g.label} className="mt-1 first:mt-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [g.label]: !isOpen }))}
                  className="flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-graphite hover:text-ink"
                >
                  <span className="flex-1 text-left">{g.label}</span>
                  {!isOpen && <span className="figures font-normal text-faint">{g.items.length}</span>}
                  <ChevronDown className={cn('size-3 text-faint transition-transform', !isOpen && '-rotate-90')} />
                </button>
                {isOpen && (
                  <ul className="mb-1">
                    {g.items.map((it) => {
                      const on = it.label === active
                      return (
                        <li key={it.label}>
                          <a
                            href="#"
                            aria-current={on ? 'page' : undefined}
                            className={cn(
                              'relative flex h-[29px] items-center rounded-md px-1.5 text-ink/80 hover:bg-sidebar-accent hover:text-ink',
                              on && 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--ac-rule),0_1px_1px_rgb(20_23_26/0.04)]',
                            )}
                          >
                            <span aria-hidden className={cn('mr-2 h-3.5 w-[3px] rounded-[1px]', on ? 'bg-plate' : 'bg-transparent')} />
                            <span className="flex-1 truncate">{it.label}</span>
                            {it.count !== undefined && (
                              <span
                                className={cn(
                                  'figures min-w-5 text-right text-[12px]',
                                  it.tone === 'alert' ? 'font-semibold text-signal' : 'text-faint',
                                )}
                              >
                                {it.count}
                              </span>
                            )}
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-rule px-3 py-3">
          <div className="flex items-center gap-2 px-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-sidebar-accent text-[11px] font-semibold">SK</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-medium">Selma Karić</span>
              <span className="block truncate text-[12px] text-graphite">Operasyon, Sarajevo Aerodrom</span>
            </span>
          </div>
          <p className="mt-3 px-1.5 text-[11.5px] leading-snug text-graphite">
            Demo ortamı: kayıtlar yalnız bu tarayıcıda tutulur, gerçek ödeme veya gönderim yapılmaz.{' '}
            <button type="button" className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
              Demoyu sıfırla
            </button>
          </p>
        </div>
      </aside>
    </>
  )
}
