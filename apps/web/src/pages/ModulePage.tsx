import { CheckCircle, Circle, Hammer } from '@phosphor-icons/react'
import { PageHeader, StatePanel } from '@/components/states'
import { NAV_ITEMS } from '@/nav'
import { NotFoundPage } from './NotFoundPage'

/** Delivery order agreed for the real application. Shown as-is; nothing here is sample data. */
const ROADMAP = [
  { label: 'Temel altyapı: giriş, şirket ve şube yetkileri, veri izolasyonu', done: true },
  { label: 'Araçlar: liste, ekleme, düzenleme', done: true },
  { label: 'Araç 360° detay', done: false },
]

/** Honest page for a §4 module that has not been developed yet. */
export function ModulePage({ slug }: { slug: string }) {
  const item = NAV_ITEMS.find((i) => i.slug === slug)
  if (!item) return <NotFoundPage />
  const Ico = item.icon

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.group} />
      <StatePanel icon={Hammer} title="Bu modül henüz geliştirilmedi">
        <p>
          {item.label} ekranı ACARVO V1 kapsamında. Sırası geldiğinde gerçek kayıtlarla çalışacak şekilde geliştirilecek; o zamana kadar burada örnek veya
          temsili veri gösterilmez.
        </p>
      </StatePanel>
      <section className="rounded-xl border border-line bg-surface">
        <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 font-semibold">
          <Ico size={17} className="text-ink-3" />
          Geliştirme sırası
        </h2>
        <ol className="divide-y divide-line-soft">
          {ROADMAP.map((r) => (
            <li key={r.label} className="flex items-center gap-3 px-5 py-3">
              {r.done ? <CheckCircle size={18} weight="fill" className="shrink-0 text-ok" /> : <Circle size={18} className="shrink-0 text-ink-3" />}
              <span className={r.done ? 'text-ink' : 'text-ink-2'}>{r.label}</span>
              <span className={r.done ? 'ml-auto text-[13px] text-ok' : 'ml-auto text-[13px] text-ink-3'}>{r.done ? 'Tamamlandı' : 'Sırada'}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
