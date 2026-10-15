import { Bandaids } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { damagesApi } from '@/lib/api'
import { DAMAGE_REVIEW_LABELS, DAMAGE_REVIEW_TONE } from '@/lib/operation-labels'
import { DAMAGE_CATEGORY_LABELS as CATEGORY_LABELS, DAMAGE_VIEW_LABELS as VIEW_LABELS } from '@/lib/rental-labels'
import { can, useSession } from '@/session'
import { btnSmall, Pill, Section } from './OpsParts'

/** Kiralama 360° → Hasar: findings of final inspections and their damage files (one file per finding; marks never change). */
export function RentalDamageFiles({ rentalId }: { rentalId: string }) {
  const session = useSession()
  const canRead = can(session, 'damage.read')
  const candidates = useQuery({ queryKey: ['damage-candidates', session.company?.id, rentalId], queryFn: () => damagesApi.candidates(rentalId), enabled: canRead })
  const files = useQuery({ queryKey: ['damages', session.company?.id, { rentalId }], queryFn: () => damagesApi.search({ rentalId, view: 'all', pageSize: 100 }), enabled: canRead })
  if (!canRead) return null
  const report = can(session, 'damage.report')
  const items = candidates.data?.items ?? []
  return (
    <Section
      title="Hasar dosyaları"
      description="Kesinleşmiş teslim ve iade kontrollerindeki bulgulardan hasar dosyası açılabilir. Bulgu sorumluluk değildir; ücret, sigorta talebi veya depozito kesintisi oluşturulmaz."
    >
      {items.length === 0 && !files.data?.items.length ? (
        <p className="text-[13px] text-ink-2">{candidates.isPending ? 'Yükleniyor…' : 'Kesinleşmiş kontrollerde bulgu yok.'}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((c) => (
            <li key={c.markId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5 text-[13px]">
              <span className="min-w-0">
                <span className="font-medium text-ink">
                  {c.inspectionKind === 'return' ? 'İade' : 'Teslim'} · {VIEW_LABELS[c.view as keyof typeof VIEW_LABELS] ?? c.view} · {CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? c.category}
                </span>
                <span className="block text-ink-2">
                  {c.newFinding ? 'Teslimde olmayan yeni bulgu' : c.inspectionKind === 'return' ? 'Teslimdeki işaretle aynı' : 'Teslimde kayıtlı'}
                  {c.note ? ` · ${c.note}` : ''}
                </span>
              </span>
              {c.damageFile ? (
                <Link to="/hasar-kayitlari/$damageId" params={{ damageId: c.damageFile.id }} className="tnum font-medium text-blue hover:underline">
                  {c.damageFile.damageNo}
                </Link>
              ) : report ? (
                <Link to="/hasar-kayitlari/yeni" search={{ kiralama: rentalId, isaret: c.markId }} className={btnSmall}>
                  <Bandaids size={14} />
                  Hasar dosyası aç
                </Link>
              ) : (
                <span className="text-ink-3">Dosya yok</span>
              )}
            </li>
          ))}
          {files.data?.items
            .filter((d) => !items.some((c) => c.damageFile?.id === d.id))
            .map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 py-2.5 text-[13px]">
                <Link to="/hasar-kayitlari/$damageId" params={{ damageId: d.id }} className="tnum font-medium text-blue hover:underline">
                  {d.damageNo}
                </Link>
                <Pill tone={DAMAGE_REVIEW_TONE[d.reviewStatus]}>{DAMAGE_REVIEW_LABELS[d.reviewStatus]}</Pill>
              </li>
            ))}
        </ul>
      )}
    </Section>
  )
}
