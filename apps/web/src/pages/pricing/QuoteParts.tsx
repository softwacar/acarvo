import { currencyExponent, formatMoney, type PricingResult, type QuoteLine } from '@acarvo/shared'
import { Info, WarningCircle } from '@phosphor-icons/react'
import { DAY_METHOD_LABEL, formatPercentBp, NOT_APPLIED_LABEL, problemText, TIER_LABEL, UNAVAILABLE_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'

const KIND_TONE: Partial<Record<QuoteLine['kind'], string>> = { discount: 'text-ok', tax: 'text-ink-2' }

/** The explained lines of a quote or preview: what was charged, from which rule, and the totals. */
export function QuoteBreakdown({
  currency,
  lines,
  netMinor,
  taxMinor,
  grossMinor,
  taxStatus,
  caption,
}: {
  currency: string
  lines: QuoteLine[]
  netMinor: number
  taxMinor: number | null
  grossMinor: number | null
  taxStatus: 'complete' | 'not_configured'
  caption: string
}) {
  const money = (m: number) => formatMoney(m, currency)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium">
              Kalem
            </th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
              Miktar × birim
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Tutar
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.kind}-${i}`} className="border-b border-line-soft align-top">
              <td className="py-2 pr-3">
                <span className={cn('text-ink', KIND_TONE[l.kind])}>{l.label}</span>
                {l.source.percentBp != null && l.kind !== 'tax' && <span className="ml-1 text-[12px] text-ink-3">({formatPercentBp(l.source.percentBp)})</span>}
                {l.taxable === false && l.kind !== 'tax' && l.kind !== 'discount' && <span className="ml-1 text-[12px] text-ink-3">· vergisiz</span>}
                {l.kind !== 'tax' && l.kind !== 'discount' && l.unitMinor != null && <span className="tnum block text-[12px] text-ink-3 sm:hidden">{l.quantity} × {money(l.unitMinor)}</span>}
              </td>
              <td className="tnum hidden py-2 pr-3 text-right text-ink-2 sm:table-cell">{l.kind === 'tax' || l.kind === 'discount' ? '—' : l.unitMinor == null ? l.quantity : `${l.quantity} × ${money(l.unitMinor)}`}</td>
              <td className={cn('tnum py-2 text-right font-medium', KIND_TONE[l.kind] ?? 'text-ink')}>{money(l.amountMinor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-[13.5px]">
          <tr>
            <td aria-hidden className="hidden sm:table-cell" />
            <th scope="row" className="pt-2.5 pr-3 text-right font-medium text-ink-2">
              Net toplam
            </th>
            <td className="tnum pt-2.5 text-right font-semibold">{money(netMinor)}</td>
          </tr>
          {taxStatus === 'complete' ? (
            <>
              <tr>
                <td aria-hidden className="hidden sm:table-cell" />
                <th scope="row" className="pt-1 pr-3 text-right font-medium text-ink-2">
                  Vergi
                </th>
                <td className="tnum pt-1 text-right">{money(taxMinor ?? 0)}</td>
              </tr>
              <tr>
                <td aria-hidden className="hidden sm:table-cell" />
                <th scope="row" className="pt-1 pr-3 text-right text-[14.5px] font-semibold text-ink">
                  Brüt toplam
                </th>
                <td className="tnum pt-1 text-right text-[16px] font-semibold">{money(grossMinor ?? 0)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={3} className="pt-1.5 text-right text-[12.5px] text-hold">
                Vergi yapılandırılmadı: yalnız net tutar gösterilir. Brüt toplam hesaplanmadı (oran tahmin edilmez); bu tutar vergiler dahil kesin fiyat değildir.
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      <TaxNote currency={currency} lines={lines} taxStatus={taxStatus} />
    </div>
  )
}

/** A server preview: result lines, or exactly why no price could be computed. */
export function PreviewResult({ result }: { result: PricingResult }) {
  if (!result.ok) {
    return (
      <div role="status" className="rounded-lg border border-hold/30 bg-hold-soft/60 px-3.5 py-3 text-[13px]">
        <p className="flex items-start gap-2 font-medium text-ink">
          <WarningCircle size={16} className="mt-px shrink-0 text-hold" />
          Hesaplanmadı. {result.unavailable ? UNAVAILABLE_LABEL[result.unavailable.reason] : ''}
        </p>
        {result.problems.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-10 text-ink-2">
            {result.problems.map((p, i) => (
              <li key={i}>{problemText(p)}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-2">
        {result.priceList?.name} · revizyon {result.priceList?.revision} · {result.days} gün ({TIER_LABEL[result.tier]}) · {DAY_METHOD_LABEL[result.dayMethod]}
      </p>
      <QuoteBreakdown caption="Önizleme kalemleri" currency={result.currency} lines={result.lines} netMinor={result.netMinor} taxMinor={result.taxMinor} grossMinor={result.grossMinor} taxStatus={result.taxStatus} />
      <NotApplied items={result.notApplied} />
    </div>
  )
}

export function NotApplied({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
      <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
      Hesaba katılmayanlar: {items.map((x) => NOT_APPLIED_LABEL[x] ?? x).join(', ')}. Bunlar için ACARVO’da kural yok; tutara eklenmedi.
    </p>
  )
}

/** F2: rate, included/added and the rounding rule in plain words (what the server applied, nothing assumed). */
function TaxNote({ currency, lines, taxStatus }: { currency: string; lines: QuoteLine[]; taxStatus: 'complete' | 'not_configured' }) {
  const tax = lines.find((l) => l.kind === 'tax')
  const exp = currencyExponent(currency)
  const step = exp === 0 ? `1 ${currency}` : `${(1 / 10 ** exp).toFixed(exp).replace('.', ',')} ${currency}`
  const bp = tax?.source.percentBp
  const rate = bp == null ? '' : `%${(bp / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
  const included = !!tax?.label.includes('içinde')
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg bg-ground/60 px-3.5 py-2.5 text-[12.5px] text-ink-2 sm:grid-cols-[auto_minmax(0,1fr)]">
      <dt className="font-medium text-ink">Vergi</dt>
      <dd>
        {taxStatus === 'complete' && tax
          ? `${tax.label.split(' · ')[0]} ${rate} · ${included ? 'fiyatlara dahil (tutarların içinden ayrıldı)' : 'fiyatlara hariç (net tutara eklendi)'} · yalnız vergiye tabi kalemlere`
          : 'Yapılandırılmadı — net tutar; vergi ve brüt toplam yok'}
      </dd>
      <dt className="font-medium text-ink">Yuvarlama</dt>
      <dd>Her kalem ve vergi bir kez, en yakın {step} birimine; tam yarım değerler sıfırdan uzağa (yukarı) yuvarlanır. Kur dönüşümü yapılmaz.</dd>
    </dl>
  )
}
