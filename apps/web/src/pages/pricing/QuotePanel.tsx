import { formatMoney, type PriceQuote, type PricingResult } from '@acarvo/shared'
import { Calculator, ClockCounterClockwise, Coins, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Field, Input, Select } from '@/components/fields'
import { ErrorState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, pricingApi, type QuoteTargetKind } from '@/lib/api'
import { DAY_METHOD_LABEL, TIER_LABEL } from '@/lib/pricing-labels'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { NotApplied, PreviewResult, QuoteBreakdown } from './QuoteParts'

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'

/**
 * Price quote of a reservation or rental (Pricing V1). The server computes every amount; a saved quote keeps its
 * lines and price-list revision. A quote is not a payment, invoice or debt.
 */
export function QuotePanel({ kind, targetId, targetNo, open }: { kind: QuoteTargetKind; targetId: string; targetNo: string; open: boolean }) {
  const session = useSession()
  const qc = useQueryClient()
  const key = ['quotes', session.company?.id, kind, targetId]
  const quotes = useQuery({ queryKey: key, queryFn: () => pricingApi.quotes(kind, targetId), retry: false })
  const canQuote = can(session, 'pricing.quote') && open
  const [calculating, setCalculating] = useState(false)

  if (quotes.isPending) return <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Fiyat teklifi yükleniyor" />
  if (quotes.isError) return <ErrorState message={quotes.error.message} onRetry={() => quotes.refetch()} />
  const current = quotes.data.items.find((q) => q.status === 'quoted') ?? null
  const older = quotes.data.items.filter((q) => q !== current)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="quote-current" className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="quote-current" className="text-[15px] font-semibold tracking-[-0.01em]">
              Geçerli fiyat teklifi
            </h2>
            {canQuote && !calculating && (
              <button type="button" className={btnSecondary} onClick={() => setCalculating(true)}>
                <Calculator size={16} /> {current ? 'Yeniden hesapla' : 'Teklif hesapla'}
              </button>
            )}
          </div>
          {current ? (
            <CurrentQuote q={current} />
          ) : (
            <div className="flex items-start gap-3 rounded-lg bg-ground/60 px-4 py-3.5">
              <Coins size={20} className="mt-0.5 shrink-0 text-ink-3" />
              <div>
                <p className="font-medium text-ink">Hesaplanmadı</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {targetNo} için kayıtlı fiyat teklifi yok. Tahmini veya örnek tutar gösterilmez.
                  {!open && ' Bu kayıt kapalı olduğu için yeni teklif oluşturulamaz.'}
                  {open && !can(session, 'pricing.quote') && ' Teklif oluşturma yetkiniz yok.'}
                </p>
              </div>
            </div>
          )}
        </section>
        {calculating && (
          <Calculator_
            kind={kind}
            targetId={targetId}
            onDone={(q) => {
              qc.setQueryData(key, { items: [q, ...quotes.data.items.map((x) => (x.status === 'quoted' ? { ...x, status: 'superseded' as const, supersededAt: q.calculatedAt } : x))] })
              void qc.invalidateQueries({ queryKey: key })
              void qc.invalidateQueries({ queryKey: [kind, session.company?.id, targetId] })
              setCalculating(false)
              toast(`${q.quoteNo} kaydedildi.`)
            }}
            onCancel={() => setCalculating(false)}
          />
        )}
      </div>
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="quote-history" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="quote-history" className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <ClockCounterClockwise size={16} className="text-ink-3" /> Önceki teklifler
          </h2>
          {older.length === 0 ? (
            <p className="text-[13px] text-ink-2">Önceki teklif yok.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {older.map((q) => (
                <li key={q.id} className="py-2.5 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="tnum font-medium text-ink">{q.quoteNo}</span>
                    <span className="tnum font-medium">{formatMoney(q.grossMinor ?? q.netMinor, q.currency)}</span>
                  </div>
                  <p className="text-[12.5px] text-ink-2">
                    {q.target.kind === 'reservation' && kind === 'rental' ? `Rezervasyon ${q.target.no} · ` : ''}
                    {formatDateTime(q.calculatedAt)} · {q.priceList.name} r{q.priceList.revision} · {q.status === 'superseded' ? 'yerine yenisi kaydedildi' : 'geçerli'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-xl border border-line bg-surface p-5 text-[13px] text-ink-2">
          <p>Teklif bir fiyat hesabıdır: ödeme, tahsilat, depozito, borç veya fatura değildir ve teslimi tek başına açmaz.</p>
          <p className="mt-2">Kayıtlı teklif, fiyat listesi sonradan değişse de aynı kalır. Plan değişirse “güncel değil” olarak işaretlenir; otomatik yeniden hesaplanmaz.</p>
        </section>
      </div>
    </div>
  )
}

function CurrentQuote({ q }: { q: PriceQuote }) {
  return (
    <div className="space-y-3">
      {!q.matchesPlan && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-hold/30 bg-hold-soft/60 px-3.5 py-2.5 text-[13px] font-medium text-ink">
          <WarningCircle size={16} className="mt-px shrink-0 text-hold" />
          Güncel değil: teklif kaydedildikten sonra tarih, saat veya araç sınıfı değişti. Yeniden hesaplayın.
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-ink-2">
          <span className="tnum font-semibold text-ink">{q.quoteNo}</span> · {q.priceList.name} · revizyon {q.priceList.revision} · {q.days} gün ({TIER_LABEL[q.tier] ?? q.tier}) · {DAY_METHOD_LABEL[q.dayMethod] ?? q.dayMethod}
        </p>
        <p className="text-[12.5px] text-ink-2">
          {formatDateTime(q.calculatedAt)}
          {q.createdByName && ` · ${q.createdByName}`}
        </p>
      </div>
      {q.target.kind === 'reservation' && <p className="text-[12.5px] text-ink-2">Rezervasyon {q.target.no} için hesaplandı.</p>}
      <QuoteBreakdown caption={`${q.quoteNo} kalemleri`} currency={q.currency} lines={q.lines} netMinor={q.netMinor} taxMinor={q.taxMinor} grossMinor={q.grossMinor} taxStatus={q.taxStatus} />
      <NotApplied items={['corporate_agreement', 'one_way', 'mileage', 'insurance_package']} />
    </div>
  )
}

/** Choose options, preview on the server, then save exactly what was shown (the server refuses a changed total). */
function Calculator_({ kind, targetId, onDone, onCancel }: { kind: QuoteTargetKind; targetId: string; onDone: (q: PriceQuote) => void; onCancel: () => void }) {
  const session = useSession()
  const lists = useQuery({ queryKey: ['price-lists', session.company?.id], queryFn: pricingApi.lists })
  const [priceListId, setPriceListId] = useState('')
  const [extras, setExtras] = useState<Record<string, number>>({})
  const [discountId, setDiscountId] = useState('')
  const [result, setResult] = useState<PricingResult | null>(null)
  const [pending, setPending] = useState<'preview' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(crypto.randomUUID())
  const listId = priceListId || result?.priceList?.id
  const detail = useQuery({ queryKey: ['price-list', session.company?.id, listId], queryFn: () => pricingApi.get(listId!), enabled: !!listId })
  const options = () => ({
    priceListId: priceListId || undefined,
    selectedExtras: Object.entries(extras)
      .filter(([, n]) => n > 0)
      .map(([extraId, quantity]) => ({ extraId, quantity })),
    discountId: discountId || undefined,
  })
  const preview = async () => {
    setPending('preview')
    setError(null)
    try {
      setResult(await pricingApi.quotePreview(kind, targetId, options()))
      requestId.current = crypto.randomUUID()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Önizleme yapılamadı.')
    } finally {
      setPending(null)
    }
  }
  const save = async () => {
    if (!result?.ok) return
    setPending('save')
    setError(null)
    try {
      onDone(await pricingApi.saveQuote(kind, targetId, { ...options(), requestId: requestId.current, expectedNetMinor: result.netMinor, expectedGrossMinor: result.grossMinor }))
    } catch (e) {
      if (e instanceof ApiRequestError && (e.code === 'PRICE_CHANGED' || e.code === 'PRICING_UNAVAILABLE')) {
        const next = (e.details as { result?: PricingResult } | undefined)?.result
        if (next) setResult(next)
        requestId.current = crypto.randomUUID()
      }
      setError(e instanceof Error ? e.message : 'Teklif kaydedilemedi.')
    } finally {
      setPending(null)
    }
  }
  const active = (lists.data?.items ?? []).filter((l) => l.status === 'active')
  const d = detail.data
  return (
    <section aria-labelledby="quote-calc" className="rounded-xl border border-blue/30 bg-surface p-5">
      <h2 id="quote-calc" className="text-[15px] font-semibold tracking-[-0.01em]">
        Teklif hesapla
      </h2>
      <p className="mt-0.5 text-[13px] text-ink-2">Dönem, sınıf, şube ve sürücü sayısı kayıttan alınır. Tutarlar sunucuda hesaplanır.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id="q-list" label="Fiyat listesi" hint="Boş bırakılırsa şube ve alış gününe göre seçilir.">
          <Select
            id="q-list"
            value={priceListId}
            onChange={(e) => {
              setPriceListId(e.target.value)
              setExtras({})
              setDiscountId('')
              setResult(null)
            }}
          >
            <option value="">Otomatik seç</option>
            {active.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.currency}
                {l.branch ? ` · ${l.branch.code}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="q-discount" label="İndirim" hint={d ? undefined : 'Önce önizleme yapın veya liste seçin.'}>
          <Select
            id="q-discount"
            value={discountId}
            disabled={!d}
            onChange={(e) => {
              setDiscountId(e.target.value)
              setResult(null)
            }}
          >
            <option value="">İndirim yok</option>
            {d?.discounts
              .filter((x) => x.active)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.type === 'percent' ? `%${x.value / 100}` : formatMoney(x.value, d.currency)} · en az {x.minDays} gün
                </option>
              ))}
          </Select>
        </Field>
      </div>
      {d && d.extras.some((x) => x.active && x.kind === 'standard') && (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[13.5px] font-medium text-ink">Ek hizmetler</legend>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {d.extras
              .filter((x) => x.active && x.kind === 'standard')
              .map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <label htmlFor={`q-extra-${x.id}`} className="min-w-0 flex-1 text-[13.5px]">
                    {x.name} <span className="text-ink-2">· {formatMoney(x.priceMinor, d.currency)} {x.mode === 'per_day' ? '/ gün' : '/ kiralama'}</span>
                  </label>
                  <Input
                    id={`q-extra-${x.id}`}
                    type="number"
                    min={0}
                    max={x.maxQuantity}
                    inputMode="numeric"
                    className="h-9 w-20"
                    value={extras[x.id] ?? 0}
                    onChange={(e) => {
                      setExtras({ ...extras, [x.id]: Math.max(0, Math.min(x.maxQuantity, Number(e.target.value) || 0)) })
                      setResult(null)
                    }}
                  />
                </li>
              ))}
          </ul>
          <p className="mt-1.5 text-[12.5px] text-ink-2">Ek sürücü ücreti, kayıttaki ek sürücü sayısına göre kendiliğinden eklenir.</p>
        </fieldset>
      )}
      {result && (
        <div className="mt-4 border-t border-line-soft pt-4">
          <PreviewResult result={result} />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          <WarningCircle size={17} className="mt-px shrink-0" />
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={result?.ok ? btnSecondary : btnPrimary} disabled={pending !== null} onClick={preview}>
          {pending === 'preview' && <SpinnerGap size={16} className="animate-spin" />}
          Önizle
        </button>
        <button type="button" className={btnPrimary} disabled={!result?.ok || pending !== null} onClick={save}>
          {pending === 'save' && <SpinnerGap size={16} className="animate-spin" />}
          Teklifi kaydet
        </button>
        <button type="button" className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </section>
  )
}

/** One-line summary for a record header: the standing quote, or "Hesaplanmadı". Hidden without pricing.read. */
export function QuoteSummary({ kind, targetId }: { kind: QuoteTargetKind; targetId: string }) {
  const session = useSession()
  const allowed = can(session, 'pricing.read')
  const quotes = useQuery({ queryKey: ['quotes', session.company?.id, kind, targetId], queryFn: () => pricingApi.quotes(kind, targetId), retry: false, enabled: allowed })
  if (!allowed) return <span className="text-ink-3">Yetki yok</span>
  if (quotes.isPending) return <span className="text-ink-3">…</span>
  const q = quotes.data?.items.find((x) => x.status === 'quoted')
  if (!q) return <span className="text-ink-2">Hesaplanmadı</span>
  return (
    <span className="tnum font-medium text-ink">
      {formatMoney(q.grossMinor ?? q.netMinor, q.currency)}
      <span className="font-normal text-ink-2">
        {' '}
        · {q.quoteNo}
        {q.grossMinor == null && ' · net'}
        {!q.matchesPlan && ' · güncel değil'}
      </span>
    </span>
  )
}
