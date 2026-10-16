import type { ReadinessCheck, ReadinessState } from '@acarvo/shared'
import { ArrowLeft, ArrowRight, CheckCircle, Circle, Gavel, Question, WarningCircle, XCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ErrorState, ForbiddenState, PageHeader } from '@/components/states'
import { dashboardApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

const STATE: Record<ReadinessState, { label: string; icon: typeof CheckCircle; cls: string }> = {
  ready: { label: 'Hazır', icon: CheckCircle, cls: 'border-ok/30 bg-ok-soft text-ok' },
  working: { label: 'Çalışıyor', icon: CheckCircle, cls: 'border-ok/30 bg-ok-soft text-ok' },
  configured: { label: 'Yapılandırılmış', icon: Circle, cls: 'border-blue/25 bg-blue-soft text-blue-ink' },
  not_verified: { label: 'Doğrulanmadı', icon: Question, cls: 'border-line bg-ground text-ink-2' },
  decision_required: { label: 'Karar gerekli', icon: Gavel, cls: 'border-hold/30 bg-hold-soft text-hold' },
  missing: { label: 'Eksik', icon: WarningCircle, cls: 'border-hold/30 bg-hold-soft text-hold' },
  unavailable: { label: 'Çalışmıyor', icon: XCircle, cls: 'border-alert/30 bg-alert-soft text-alert' },
}
const ORDER: ReadinessState[] = ['unavailable', 'missing', 'decision_required', 'not_verified', 'configured', 'working', 'ready']
const GROUPS: Record<ReadinessCheck['group'], string> = {
  branches: 'Şubeler',
  security: 'Güvenlik altyapısı',
  documents: 'Müşteri belgeleri',
  rentals: 'Kiralama',
  pricing: 'Fiyat ve vergi',
  contracts: 'Sözleşme',
  approvals: 'İkinci onay (dört göz)',
  decisions: 'Bekleyen kararlar',
}

function StateBadge({ state }: { state: ReadinessState }) {
  const s = STATE[state]
  const Ico = s.icon
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap', s.cls)}>
      <Ico size={13} weight="bold" />
      {s.label}
    </span>
  )
}

/** Operasyonel Hazırlık: a read-only checklist for the owner. Nothing here changes a setting or records an approval. */
export function ReadinessPage() {
  const session = useSession()
  const allowed = can(session, 'readiness.read')
  const q = useQuery({ queryKey: ['readiness', session.company?.id], queryFn: () => dashboardApi.readiness(), enabled: allowed, retry: false })
  const header = (
    <PageHeader
      title="Operasyonel hazırlık"
      description="Gerçek kullanım öncesi eksikler ve insan kararları. Bu ekran yalnız durumu gösterir; hiçbir ayarı değiştirmez, açmaz veya onaylamaz."
    >
      <Link to="/ayarlar" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink-2 hover:bg-ground">
        <ArrowLeft size={15} /> Ayarlar
      </Link>
    </PageHeader>
  )
  if (!allowed)
    return (
      <div className="space-y-6">
        {header}
        <ForbiddenState message="Operasyonel hazırlık listesini yalnız şirket sahibi görür." />
      </div>
    )
  if (q.isError)
    return (
      <div className="space-y-6">
        {header}
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    )
  if (!q.data)
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Hazırlık listesi yükleniyor">
        {header}
        <div className="h-72 animate-pulse rounded-xl bg-line-soft/60" />
      </div>
    )
  const r = q.data
  const groups = Object.keys(GROUPS) as ReadinessCheck['group'][]
  return (
    <div className="space-y-5">
      {header}
      <section aria-label="Özet" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 sm:px-5">
        {ORDER.filter((s) => r.summary[s]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[13px]">
            <StateBadge state={s} />
            <span className="tnum font-semibold">{r.summary[s]}</span>
          </span>
        ))}
        <span className="ml-auto text-[12.5px] text-ink-3">Kontrol: {formatDateTime(r.generatedAt)}</span>
      </section>
      <p className="text-[12.5px] text-ink-2">
        “Yapılandırılmış” ayarın girildiğini, “Çalışıyor” hizmetin şu an yanıt verdiğini gösterir; ikisi de hukuki uygunluk anlamına gelmez. Hukuki onay ACARVO’da üretilmez; “Doğrulanmadı” olarak kalır.
      </p>
      {groups.map((g) => {
        const items = r.checks.filter((c) => c.group === g)
        if (!items.length) return null
        return (
          <section key={g} aria-labelledby={`rd-${g}`} className="rounded-xl border border-line bg-surface">
            <h2 id={`rd-${g}`} className="border-b border-line-soft px-4 py-3 text-[14.5px] font-semibold tracking-[-0.01em] sm:px-5">
              {GROUPS[g]}
            </h2>
            <ul className="divide-y divide-line-soft">
              {items.map((c) => (
                <li key={c.key} data-check={c.key} className="grid gap-x-4 gap-y-1.5 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13.5px] font-medium text-ink">{c.title}</h3>
                      <StateBadge state={c.state} />
                    </div>
                    <p className="mt-1 text-[13px] text-ink-2">{c.detail}</p>
                    {c.action && <p className="mt-1 text-[12.5px] text-ink-3">Yapılacak: {c.action}</p>}
                  </div>
                  {c.link && (
                    <Link to={c.link} className="inline-flex items-center gap-1 self-start text-[13px] font-medium whitespace-nowrap text-blue hover:underline">
                      İlgili ekran <ArrowRight size={13} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
