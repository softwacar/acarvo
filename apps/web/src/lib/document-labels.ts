import type { TypeSummaryState } from '@acarvo/shared'

/** One short line for the most urgent document of a vehicle (facts strip, overview, vehicle list). */
export function documentHeadlineText(h: { name: string; state: TypeSummaryState; daysLeft: number | null }): string {
  switch (h.state) {
    case 'expiring':
      return `${h.name} · ${h.daysLeft === 0 ? 'bugün bitiyor' : `${h.daysLeft} gün`}`
    case 'expired':
      return `${h.name} süresi dolmuş`
    case 'missing':
      return `${h.name} eksik`
    case 'not_started':
      return `${h.name} başlamadı`
    case 'draft':
      return `${h.name} taslak`
    default:
      return 'Tümü geçerli'
  }
}
