import {
  DEPOSIT_METHODS,
  type DepositMethod,
  type FinanceCharge,
  type FinanceDeposit,
  type FinancePayment,
  type FinanceRefund,
  formatMoney,
  ISO_CURRENCIES,
  PAYMENT_METHODS,
  type PaymentMethod,
  type RentalFinanceView,
} from '@acarvo/shared'
import { ArrowCounterClockwise, Calculator, CheckCircle, ClockCounterClockwise, FolderOpen, HandCoins, Info, LockSimple, Plus, ShieldCheck, Vault, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { financeApi } from '@/lib/api'
import {
  CHARGE_STATUS_LABEL,
  CHARGE_TONE,
  CLOSE_BLOCKER_LABEL,
  DEPOSIT_METHOD_LABEL,
  depositState,
  EVENT_LABEL,
  FILE_STATUS_LABEL,
  PAYMENT_METHOD_HINT,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TONE,
  REFUND_STATUS_LABEL,
  REFUND_TONE,
} from '@/lib/finance-labels'
import { formatLate, FUEL_LEVEL_LABELS } from '@/lib/rental-labels'
import { cn } from '@/lib/utils'
import { formatDateTime, formatKm } from '@/lib/vehicle-labels'
import { useSession } from '@/session'
import { apiError, btnPrimary, btnSecondary, btnSmall, FinanceDialog, Money, Pill, Section, Statement } from './FinanceParts'

type Dialog =
  | { kind: 'open' }
  | { kind: 'charge-quote' }
  | { kind: 'charge-manual' }
  | { kind: 'charge'; action: 'approve' | 'reject' | 'reversal-request' | 'reversal-approve' | 'reversal-withdraw'; c: FinanceCharge }
  | { kind: 'payment-new' }
  | { kind: 'payment'; action: 'verify' | 'reject' | 'reverse'; p: FinancePayment }
  | { kind: 'deposit-new' }
  | { kind: 'deposit'; action: 'report' | 'verify' | 'reject' | 'cancel' | 'review-on' | 'review-off'; d: FinanceDeposit }
  | { kind: 'refund-new'; d: FinanceDeposit }
  | { kind: 'refund'; action: 'approve' | 'reject' | 'cancel' | 'complete' | 'reverse'; r: FinanceRefund; d: FinanceDeposit }
  | { kind: 'close' }
  | { kind: 'reopen' }

const rid = () => crypto.randomUUID()

/**
 * Kiralama 360° → Finans (spec §85.6): one place for the quote, internal account lines, recorded and verified payments,
 * deposits and their returns. Every concept is shown on its own; nothing here moves money or issues an invoice.
 */
export function RentalFinancePanel({ rentalId }: { rentalId: string }) {
  const session = useSession()
  const qc = useQueryClient()
  const key = ['rental-finance', session.company?.id, rentalId]
  const q = useQuery({ queryKey: key, queryFn: () => financeApi.rental(rentalId), retry: false })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const set = (v: RentalFinanceView, message?: string) => {
    qc.setQueryData(key, v)
    void qc.invalidateQueries({ queryKey: ['finance'] })
    setDialog(null)
    if (message) toast(message)
  }
  /** Runs one finance call; on a version conflict the fresh picture is loaded and the message shown. */
  const run = async (fn: () => Promise<RentalFinanceView>, message: string): Promise<string | void> => {
    try {
      set(await fn(), message)
    } catch (e) {
      const { message: m, fields } = apiError(e)
      if ((e as { code?: string }).code === 'VERSION_CONFLICT') void q.refetch()
      return [m, ...Object.values(fields)].join(' ')
    }
  }

  if (q.isPending) return <div className="h-48 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Finans bilgileri yükleniyor" />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  const v = q.data
  const f = v.finance
  const t = v.totals

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          Bu bölüm iç işlem kayıtlarıdır. ACARVO para tahsil etmez veya iade etmez, kart bilgisi almaz ve resmî fatura kesmez. Personelin kaydı, ikinci bir yetkili doğrulayana kadar “doğrulama bekliyor” olarak kalır.
        </span>
      </p>

      {!f ? (
        <Section title="Finans dosyası açılmadı" description="Teklif tek başına borç, tahsilat veya fatura değildir. Finans kaydı yalnız yetkili personelin açık işlemiyle başlar.">
          <QuoteLine v={v} />
          {v.can.open ? (
            <button type="button" className={cn(btnPrimary, 'mt-4')} onClick={() => setDialog({ kind: 'open' })}>
              <FolderOpen size={16} /> Finans dosyası aç
            </button>
          ) : (
            <p className="mt-3 text-[13px] text-ink-2">{v.rental.status === 'cancelled' ? 'İptal edilmiş kiralamada finans dosyası açılmaz.' : 'Finans dosyası açma yetkiniz yok.'}</p>
          )}
        </Section>
      ) : (
        <>
          <section aria-label="Finans özeti" className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px]">
                <Pill tone={f.status === 'closed' ? 'ok' : f.status === 'reopened' ? 'hold' : 'blue'}>{FILE_STATUS_LABEL[f.status]}</Pill>
                <span className="text-ink-2">
                  İşlem para birimi <span className="font-medium text-ink">{f.currency}</span> · ödeme sorumlusu{' '}
                  <span className="font-medium text-ink">
                    {f.responsible.name} ({f.responsible.type === 'corporate' ? 'kurumsal hesap' : 'müşteri'})
                  </span>
                </span>
              </div>
              {v.can.close &&
                (f.status === 'closed' ? (
                  <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: 'reopen' })}>
                    <ArrowCounterClockwise size={16} /> Yeniden aç…
                  </button>
                ) : (
                  <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: 'close' })}>
                    <LockSimple size={16} /> Finansal kapanış…
                  </button>
                ))}
            </div>
            {t && (
              <div className="grid grid-cols-1 gap-px bg-line-soft sm:grid-cols-2 xl:grid-cols-4">
                <Figure label="Teklif tutarı" hint={v.quote ? `${v.quote.no}${v.quote.matchesPlan ? '' : ' · güncel değil'} · ödeme değildir` : 'Kayıtlı teklif yok'}>
                  {v.quote ? <Money minor={v.quote.amountMinor} currency={v.quote.currency} /> : <span className="text-ink-3">Hesaplanmadı</span>}
                </Figure>
                <Figure label="İç hesap (kayıtlı kalemler)" hint={t.pendingChargesMinor ? `+ onay bekleyen ${fmt(t.pendingChargesMinor, t.currency)}` : t.taxIncomplete ? 'Vergi yapılandırılmamış kalem var: net tutar' : 'Onaylanmış kalemler'}>
                  <Money minor={t.postedChargesMinor} currency={t.currency} />
                </Figure>
                <Figure label="Doğrulanmış tahsilat" hint={t.recordedPaymentsMinor ? `+ doğrulama bekleyen ${fmt(t.recordedPaymentsMinor, t.currency)}` : 'İkinci yetkilinin doğruladığı kayıtlar'}>
                  <Money minor={t.verifiedPaymentsMinor} currency={t.currency} className="text-ok" />
                </Figure>
                <Figure label={t.overpaidMinor ? 'Fazla tahsilat (iade adayı)' : 'Kalan (kayıtlı kalemlere göre)'} hint="Kayıtlı kalemler − doğrulanmış tahsilat" tone={t.overpaidMinor ? 'alert' : t.outstandingMinor ? 'hold' : 'ok'}>
                  <Money minor={t.overpaidMinor || t.outstandingMinor} currency={t.currency} />
                </Figure>
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line-soft px-5 py-3 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Vault size={15} className="text-ink-3" />
                Depozito (tutulan):{' '}
                {v.depositTotals.some((d) => d.heldMinor) ? (
                  v.depositTotals
                    .filter((d) => d.heldMinor)
                    .map((d) => <Money key={d.currency} minor={d.heldMinor} currency={d.currency} className="font-medium text-ink" />)
                ) : (
                  <span className="text-ink-3">yok</span>
                )}
              </span>
              <span>Resmî fatura: ACARVO’da yok</span>
              {f.status === 'closed' && (
                <span>
                  Kapatan: {f.closed.name} · {f.closed.at && formatDateTime(f.closed.at)}
                </span>
              )}
              {f.status === 'reopened' && f.reopenReason && <span>Yeniden açılma nedeni: {f.reopenReason}</span>}
            </div>
          </section>

          {v.returnFacts && <ReturnFactsCard v={v} />}

          <Section
            title="İç hesap kalemleri"
            description="Kiralama için onaylanan iç hesap tutarları. Resmî fatura veya kesin alacak belgesi değildir. Kalem, araç teslim edildikten sonra ikinci bir yetkili tarafından onaylanır."
            action={
              v.can.prepareCharge && (
                <div className="flex flex-wrap gap-2">
                  {v.quote && !v.quote.charged && (
                    <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: 'charge-quote' })}>
                      <Calculator size={16} /> Tekliften kalem hazırla
                    </button>
                  )}
                  <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: 'charge-manual' })}>
                    <Plus size={16} /> Ek kalem
                  </button>
                </div>
              )
            }
          >
            {!v.charges.length ? (
              <p className="text-[13px] text-ink-2">Kalem yok. {v.quote ? 'Kayıtlı teklif iç hesaba aktarılmadı.' : 'Önce Fiyat teklifi sekmesinde teklif kaydedin.'}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {v.charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1 basis-[260px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-[12.5px] font-semibold text-ink-2">{c.chargeNo}</span>
                        <Pill tone={CHARGE_TONE[c.status]}>{CHARGE_STATUS_LABEL[c.status]}</Pill>
                        {c.taxStatus === 'not_configured' && <Pill tone="muted">Vergi yapılandırılmadı — net</Pill>}
                      </div>
                      <p className="mt-1 text-ink">{c.description}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">
                        Hazırlayan {c.created.name} · {c.created.at && formatDateTime(c.created.at)}
                        {c.approved.name && ` · onaylayan ${c.approved.name}`}
                        {c.reason && ` · gerekçe: ${c.reason}`}
                        {c.reviewNote && ` · not: ${c.reviewNote}`}
                        {c.reversalReason && ` · ters kayıt gerekçesi: ${c.reversalReason}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Money minor={c.amountMinor} currency={c.currency} className={cn('text-[15px] font-semibold', ['rejected', 'reversed'].includes(c.status) && 'text-ink-3 line-through')} />
                      {c.taxMinor != null && <span className="text-[12px] text-ink-2">net {fmt(c.netMinor, c.currency)} · vergi {fmt(c.taxMinor, c.currency)}</span>}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {c.status === 'pending' && v.can.approveCharge && (
                          <>
                            <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'charge', action: 'approve', c })}>
                              Onayla
                            </button>
                            <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'charge', action: 'reject', c })}>
                              Reddet
                            </button>
                          </>
                        )}
                        {c.status === 'posted' && v.can.prepareCharge && (
                          <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'charge', action: 'reversal-request', c })}>
                            Ters kayıt iste
                          </button>
                        )}
                        {c.status === 'reversal_requested' && v.can.approveCharge && (
                          <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'charge', action: 'reversal-approve', c })}>
                            Ters kaydı onayla
                          </button>
                        )}
                        {c.status === 'reversal_requested' && v.can.prepareCharge && (
                          <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'charge', action: 'reversal-withdraw', c })}>
                            İsteği geri çek
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Tahsilatlar"
            description="Personelin kaydettiği tahsilatlar. Yalnız ikinci yetkilinin doğruladıkları bakiyeden düşer."
            action={
              v.can.recordPayment && (
                <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: 'payment-new' })}>
                  <HandCoins size={16} /> Tahsilat kaydet
                </button>
              )
            }
          >
            {!v.payments.length ? (
              <p className="text-[13px] text-ink-2">Tahsilat kaydı yok.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {v.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1 basis-[260px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-[12.5px] font-semibold text-ink-2">{p.paymentNo}</span>
                        <Pill tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Pill>
                        <span className="text-[12.5px] text-ink-2">{PAYMENT_METHOD_LABEL[p.method]}</span>
                      </div>
                      <p className="mt-1 text-ink">
                        Ödeyen: {p.payer.name}
                        {p.payer.no && <span className="text-ink-2"> ({p.payer.no})</span>}
                        {p.payer.type === 'other' && <span className="text-ink-2"> · başka kişi/kurum</span>}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">
                        {formatDateTime(p.receivedAt)} · {p.branch.code} · kaydeden {p.created.name}
                        {p.cashAck && ' · nakit teslim alındı beyanı'}
                        {p.externalReference && ` · ref. ${p.externalReference}`}
                        {p.verified.name && ` · doğrulayan ${p.verified.name}`}
                        {p.reviewNote && ` · not: ${p.reviewNote}`}
                        {p.reversalReason && ` · ters kayıt: ${p.reversalReason}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Money minor={p.amountMinor} currency={p.currency} className={cn('text-[15px] font-semibold', ['rejected', 'reversed'].includes(p.status) && 'text-ink-3 line-through')} />
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {p.status === 'recorded' && v.can.verifyPayment && (
                          <>
                            <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'payment', action: 'verify', p })}>
                              <ShieldCheck size={14} /> Doğrula
                            </button>
                            <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'payment', action: 'reject', p })}>
                              Reddet
                            </button>
                          </>
                        )}
                        {p.status === 'verified' && v.can.reversePayment && (
                          <button type="button" className={btnSmall} onClick={() => setDialog({ kind: 'payment', action: 'reverse', p })}>
                            Ters kayıt
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Depozitolar"
            description="Depozito kira geliri, ön ödeme veya hasar bedeli değildir; kendi para biriminde tutulur ve iade edilir. Kart blokesi yalnız personel bunu harici sistemde gerçekten yaptıysa kaydedilir."
            action={
              v.can.recordDeposit && (
                <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: 'deposit-new' })}>
                  <Vault size={16} /> Depozito kaydı
                </button>
              )
            }
          >
            {!v.deposits.length ? (
              <p className="text-[13px] text-ink-2">Depozito kaydı yok.</p>
            ) : (
              <ul className="space-y-3">
                {v.deposits.map((d) => (
                  <DepositCard key={d.id} d={d} v={v} onAction={setDialog} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Finans geçmişi" description="Her adım: kim, ne zaman, önceki ve yeni durum. Silinmez.">
            {!v.events.length ? (
              <p className="text-[13px] text-ink-2">Kayıt yok.</p>
            ) : (
              <ol className="divide-y divide-line-soft">
                {v.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-[13px]">
                    <span className="min-w-0 text-ink">
                      <ClockCounterClockwise size={13} className="mr-1.5 inline text-ink-3" />
                      {EVENT_LABEL[e.kind] ?? e.kind}
                      {e.entityNo && <span className="tnum text-ink-2"> · {e.entityNo}</span>}
                      {e.amountMinor != null && e.currency && <span className="text-ink-2"> · {fmt(e.amountMinor, e.currency)}</span>}
                    </span>
                    <span className="tnum text-[12.5px] text-ink-2">
                      {formatDateTime(e.at)}
                      {e.actorName && ` · ${e.actorName}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </>
      )}

      {dialog && <FinanceDialogs dialog={dialog} v={v} rentalId={rentalId} run={run} onClose={() => setDialog(null)} />}
    </div>
  )
}

const fmt = (minor: number, currency: string) => formatMoney(minor, currency)

function Figure({ label, hint, children, tone }: { label: string; hint: string; children: ReactNode; tone?: 'ok' | 'hold' | 'alert' }) {
  return (
    <div className="bg-surface px-5 py-3.5">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className={cn('mt-0.5 text-[19px] font-semibold tracking-[-0.01em]', tone === 'alert' ? 'text-alert' : tone === 'hold' ? 'text-hold' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{children}</p>
      <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
    </div>
  )
}

function QuoteLine({ v }: { v: RentalFinanceView }) {
  if (!v.quote) return <p className="text-[13px] text-ink-2">Bu kiralama için kayıtlı fiyat teklifi yok (Fiyat teklifi sekmesi).</p>
  return (
    <p className="text-[13px] text-ink-2">
      Kayıtlı teklif <span className="tnum font-medium text-ink">{v.quote.no}</span>: <Money minor={v.quote.amountMinor} currency={v.quote.currency} className="font-medium text-ink" />
      {v.quote.taxStatus === 'not_configured' && ' (net; vergi yapılandırılmadı)'}
      {!v.quote.matchesPlan && ' · güncel değil'} · {v.quote.priceList} r{v.quote.revision}
    </p>
  )
}

function ReturnFactsCard({ v }: { v: RentalFinanceView }) {
  const r = v.returnFacts!
  const km = r.handoverKm != null && r.returnKm != null ? r.returnKm - r.handoverKm : null
  return (
    <section aria-labelledby="fin-return" className={cn('rounded-xl border p-5', r.reviewNeeded ? 'border-hold/40 bg-hold-soft/40' : 'border-line bg-surface')}>
      <h2 id="fin-return" className="flex items-center gap-2 text-[15px] font-semibold">
        {r.reviewNeeded ? <WarningCircle size={17} className="text-hold" /> : <CheckCircle size={17} className="text-ok" />}
        {r.reviewNeeded ? 'Finansal değerlendirme gerekli' : r.actualReturnAt ? 'İade bilgileri' : 'Araç kirada'}
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-ink-2">Gerçek iade</dt>
          <dd className="tnum text-ink">{r.actualReturnAt ? formatDateTime(r.actualReturnAt) : 'Henüz iade edilmedi'}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Gecikme</dt>
          <dd className={cn(!r.actualReturnAt && Date.parse(r.plannedReturnAt) < Date.now() ? 'text-alert' : 'text-ink')}>
            {r.lateMinutes ? formatLate(r.lateMinutes) : !r.actualReturnAt && Date.parse(r.plannedReturnAt) < Date.now() ? 'Planlanan iade geçti; araç henüz iade edilmedi' : 'Yok'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-2">Km farkı</dt>
          <dd className="tnum text-ink">{km != null ? `${formatKm(km)} (${formatKm(r.handoverKm!)} → ${formatKm(r.returnKm!)})` : '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Yakıt</dt>
          <dd className="text-ink">{r.handoverFuel ? `${FUEL_LEVEL_LABELS[r.handoverFuel as 'full']} → ${r.returnFuel ? FUEL_LEVEL_LABELS[r.returnFuel as 'full'] : '—'}` : '—'}</dd>
        </div>
      </dl>
      {r.newFindings > 0 && <p className="mt-1.5 text-[13px] text-ink">İadede {r.newFindings} yeni hasar bulgusu kaydedildi.</p>}
      <p className="mt-2 text-[12.5px] text-ink-2">Gecikme, km, yakıt ve hasar ücretleri ACARVO’da otomatik hesaplanmaz ve borç olarak oluşturulmaz. Gerekirse gerekçeli “Ek kalem” hazırlanır ve ikinci yetkili onaylar. Kiralamanın kapanması finansal kapanış değildir.</p>
    </section>
  )
}

function DepositCard({ d, v, onAction }: { d: FinanceDeposit; v: RentalFinanceView; onAction: (x: Dialog) => void }) {
  return (
    <li className="rounded-lg border border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[12.5px] font-semibold text-ink-2">{d.depositNo}</span>
            <Pill tone={depositState(d).tone}>{depositState(d).label}</Pill>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {d.method ? DEPOSIT_METHOD_LABEL[d.method] : 'Yöntem bekleniyor'}
            {d.externalReference && ` · ref. ${d.externalReference}`}
            {d.reported.name && ` · bildiren ${d.reported.name}`}
            {d.verified.name && ` · doğrulayan ${d.verified.name}`}
            {d.reviewReason && ` · inceleme: ${d.reviewReason}`}
          </p>
        </div>
        <div className="text-right">
          <Money minor={d.amountMinor} currency={d.currency} className="text-[15px] font-semibold" />
          {d.status === 'verified' && (
            <p className="text-[12px] text-ink-2">
              tutulan {fmt(d.heldMinor, d.currency)}
              {d.refundedMinor > 0 && ` · iade ${fmt(d.refundedMinor, d.currency)}`}
              {d.refundOpenMinor > 0 && ` · bekleyen iade ${fmt(d.refundOpenMinor, d.currency)}`}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {d.status === 'requested' && v.can.recordDeposit && (
          <>
            <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'deposit', action: 'report', d })}>
              Alındığını bildir
            </button>
            <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'deposit', action: 'cancel', d })}>
              Talebi iptal et
            </button>
          </>
        )}
        {d.status === 'reported' && v.can.verifyDeposit && (
          <>
            <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'deposit', action: 'verify', d })}>
              <ShieldCheck size={14} /> Doğrula
            </button>
            <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'deposit', action: 'reject', d })}>
              Reddet
            </button>
          </>
        )}
        {d.status === 'verified' && v.can.verifyDeposit && (
          <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'deposit', action: d.inReview ? 'review-off' : 'review-on', d })}>
            {d.inReview ? 'İncelemeyi kapat' : 'İncelemeye al'}
          </button>
        )}
        {d.status === 'verified' && !d.inReview && d.heldMinor - d.refundOpenMinor > 0 && v.can.requestRefund && (
          <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund-new', d })}>
            <ArrowCounterClockwise size={14} /> İade talebi
          </button>
        )}
      </div>
      {d.refunds.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft border-t border-line-soft">
          {d.refunds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tnum text-[12px] font-semibold text-ink-2">{r.refundNo}</span>
                  <Pill tone={REFUND_TONE[r.status]}>{REFUND_STATUS_LABEL[r.status]}</Pill>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  {PAYMENT_METHOD_LABEL[r.method]} · gerekçe: {r.reason} · talep eden {r.created.name}
                  {r.approved.name && ` · onaylayan ${r.approved.name}`}
                  {r.completed.name && ` · bildiren ${r.completed.name}`}
                  {r.externalReference && ` · ref. ${r.externalReference}`}
                  {r.reversalReason && ` · ters kayıt: ${r.reversalReason}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Money minor={r.amountMinor} currency={r.currency} className={cn('font-semibold', ['rejected', 'cancelled', 'reversed'].includes(r.status) && 'text-ink-3 line-through')} />
                <div className="flex flex-wrap justify-end gap-1.5">
                  {r.status === 'requested' && v.can.approveRefund && (
                    <>
                      <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund', action: 'approve', r, d })}>
                        Onayla
                      </button>
                      <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund', action: 'reject', r, d })}>
                        Reddet
                      </button>
                    </>
                  )}
                  {(r.status === 'requested' || r.status === 'approved') && v.can.requestRefund && (
                    <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund', action: 'cancel', r, d })}>
                      İptal et
                    </button>
                  )}
                  {r.status === 'approved' && v.can.approveRefund && (
                    <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund', action: 'complete', r, d })}>
                      İadenin yapıldığını bildir
                    </button>
                  )}
                  {r.status === 'completed' && v.can.approveRefund && (
                    <button type="button" className={btnSmall} onClick={() => onAction({ kind: 'refund', action: 'reverse', r, d })}>
                      Ters kayıt
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Dialogs: every money step states exactly what it is (a record, a verification, a report) before it is saved.

function FinanceDialogs({ dialog, v, rentalId, run, onClose }: { dialog: Dialog; v: RentalFinanceView; rentalId: string; run: (fn: () => Promise<RentalFinanceView>, msg: string) => Promise<string | void>; onClose: () => void }) {
  const f = v.finance
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>('')
  const [reference, setReference] = useState('')
  const [ack, setAck] = useState(false)
  const [currency, setCurrency] = useState(v.quote?.currency ?? 'EUR')
  const [responsible, setResponsible] = useState<'customer' | 'corporate' | ''>(v.rental.corporate ? '' : 'customer')
  const [payer, setPayer] = useState(f?.responsible.type === 'corporate' && v.rental.corporate ? `corporate:${v.rental.corporate.id}` : `customer:${v.rental.customer.id}`)
  const [payerName, setPayerName] = useState('')
  const [received, setReceived] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const versioned = (version: number) => ({ version, requestId: rid() })

  switch (dialog.kind) {
    case 'open':
      return (
        <FinanceDialog
          title="Finans dosyası aç"
          description="Dosya açmak borç, tahsilat veya fatura oluşturmaz. İşlem para birimi ve ödeme sorumlusu sonradan değiştirilemez."
          confirm="Dosyayı aç"
          onClose={onClose}
          onSubmit={() => {
            if (!responsible) return setErrors({ responsible: 'Ödeme sorumlusunu seçin' })
            return run(() => financeApi.open(rentalId, { currency, responsibleType: responsible, requestId: rid() }), 'Finans dosyası açıldı.')
          }}
        >
          <Field id="fo-cur" label="İşlem para birimi" required hint={v.quote ? `Teklif ${v.quote.currency}. Tahsilatlar yalnız bu para biriminde kaydedilir; kur dönüşümü yapılmaz.` : 'Tahsilatlar yalnız bu para biriminde kaydedilir.'}>
            <Select {...describe('fo-cur', undefined, true)} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {ISO_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[13.5px] font-medium text-ink">
              Ödeme sorumlusu <span className="text-alert">*</span>
            </legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                <input type="radio" name="resp" checked={responsible === 'customer'} onChange={() => setResponsible('customer')} className="mt-1 accent-blue" />
                <span>
                  Müşteri: {v.rental.customer.name} <span className="text-ink-2">({v.rental.customer.no})</span>
                </span>
              </label>
              {v.rental.corporate && (
                <label className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                  <input type="radio" name="resp" checked={responsible === 'corporate'} onChange={() => setResponsible('corporate')} className="mt-1 accent-blue" />
                  <span>
                    Kurumsal hesap: {v.rental.corporate.name} <span className="text-ink-2">({v.rental.corporate.no})</span>
                  </span>
                </label>
              )}
            </div>
            {errors.responsible && <p className="mt-1 text-[13px] text-alert">{errors.responsible}</p>}
            <p className="mt-1.5 text-[12.5px] text-ink-2">Ödeyen kişi ayrıca her tahsilatta seçilir; çok kişinin ödemesi sorumluluğu bölmez.</p>
          </fieldset>
        </FinanceDialog>
      )
    case 'charge-quote': {
      const q = v.quote!
      return (
        <FinanceDialog
          title="Tekliften iç hesap kalemi hazırla"
          description="Kalem “onay bekliyor” olarak oluşur. Araç teslim edildikten sonra başka bir yetkili onaylayınca kayıtlı olur. Bu bir fatura veya kesin alacak değildir."
          summary={[
            ['Teklif', `${q.no} · ${q.priceList} r${q.revision}`],
            ['Tutar', <Money key="m" minor={q.amountMinor} currency={q.currency} />],
            ['Vergi', q.taxStatus === 'complete' ? 'Dahil (teklifteki gibi)' : 'Yapılandırılmadı — net tutar, vergiler dahil kesin fiyat değildir'],
            ['Güncellik', q.matchesPlan ? 'Kiralama planıyla uyumlu' : 'Güncel değil — önce yeniden hesaplayın'],
          ]}
          confirm="Kalemi hazırla"
          onClose={onClose}
          onSubmit={() => run(() => financeApi.createCharge(rentalId, { kind: 'quote', quoteId: q.id, requestId: rid() }), 'Kalem hazırlandı; onay bekliyor.')}
        />
      )
    }
    case 'charge-manual':
      return (
        <FinanceDialog
          title="Ek iç hesap kalemi"
          description="Gecikme, km, yakıt veya hasar gibi ücretler ACARVO’da hesaplanmaz; gerekiyorsa burada gerekçesiyle girilir ve ikinci yetkili onaylar. Vergi yapılandırılmamış net tutar olarak kaydedilir."
          confirm="Kalemi hazırla"
          onClose={onClose}
          onSubmit={() => run(() => financeApi.createCharge(rentalId, { kind: 'manual', description: method, amount, reason: text, requestId: rid() }), 'Ek kalem hazırlandı; onay bekliyor.')}
        >
          <Field id="cm-desc" label="Açıklama" required>
            <Input {...describe('cm-desc')} maxLength={160} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="ör. Ek temizlik" />
          </Field>
          <Field id="cm-amount" label={`Tutar (${f!.currency})`} required>
            <Input {...describe('cm-amount')} inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Field id="cm-reason" label="Gerekçe" required>
            <Textarea {...describe('cm-reason')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FinanceDialog>
      )
    case 'charge': {
      const { c, action } = dialog
      const copy = {
        approve: ['Kalemi onayla', 'Kalem kayıtlı olur ve kalan bakiyeye eklenir. Kendi hazırladığınız kalemi onaylayamazsınız.', 'Onayla'],
        reject: ['Kalemi reddet', 'Kalem reddedildi olarak kalır; silinmez.', 'Reddet'],
        'reversal-request': ['Ters kayıt iste', 'Kayıtlı kalem ikinci bir yetkili onaylayınca ters kaydedilir. Kalem ve geçmişi silinmez.', 'Ters kayıt iste'],
        'reversal-approve': ['Ters kaydı onayla', 'Kalem ters kaydedilir ve bakiyeden çıkar. Kendi isteğinizi onaylayamazsınız.', 'Ters kaydı onayla'],
        'reversal-withdraw': ['Ters kayıt isteğini geri çek', 'Kalem yeniden kayıtlı durumuna döner.', 'Geri çek'],
      }[action]
      return (
        <FinanceDialog
          title={copy[0]}
          description={copy[1]}
          summary={[
            ['Kalem', `${c.chargeNo} · ${c.description}`],
            ['Tutar', <Money key="m" minor={c.amountMinor} currency={c.currency} />],
          ]}
          confirm={copy[2]}
          danger={action === 'reject' || action === 'reversal-approve'}
          onClose={onClose}
          onSubmit={() =>
            run(() => financeApi.chargeAction(c.id, action, { ...versioned(c.version), ...(action === 'reject' ? { note: text } : {}), ...(action === 'reversal-request' ? { reason: text } : {}) }), `${c.chargeNo}: ${copy[2].toLocaleLowerCase('tr')} tamamlandı.`)
          }
        >
          {(action === 'reject' || action === 'reversal-request') && (
            <Field id="ch-text" label={action === 'reject' ? 'Not (isteğe bağlı)' : 'Gerekçe'} required={action === 'reversal-request'}>
              <Textarea {...describe('ch-text')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </FinanceDialog>
      )
    }
    case 'payment-new': {
      const m = method as PaymentMethod | ''
      const [ptype, pid] = payer.split(':') as ['customer' | 'corporate' | 'other', string]
      return (
        <FinanceDialog
          title="Tahsilat kaydet"
          description="Bu bir kayıttır: ACARVO para tahsil etmez. Kayıt, başka bir yetkili doğrulayana kadar bakiyeden düşmez."
          summary={amount && m ? [['Kaydedilecek', `${amount} ${f!.currency} · ${PAYMENT_METHOD_LABEL[m]}`], ['Durum', 'Doğrulama bekliyor']] : undefined}
          confirm="Tahsilatı kaydet"
          onClose={onClose}
          onSubmit={() => {
            const e: Record<string, string> = {}
            if (!m) e.method = 'Yöntemi seçin'
            if (!amount.trim()) e.amount = 'Tutar girin'
            if (m === 'cash' && !ack) e.cashAck = 'Nakdi teslim aldığınızı onaylayın'
            if ((m === 'bank_transfer' || m === 'external_pos') && !reference.trim()) e.externalReference = 'Harici işlem referansını girin'
            if (ptype === 'other' && payerName.trim().length < 2) e.payerName = 'Ödeyenin adını girin'
            setErrors(e)
            if (Object.keys(e).length) return 'Eksik alanları tamamlayın.'
            return run(
              () =>
                financeApi.createPayment(rentalId, {
                  method: m,
                  amount,
                  payerType: ptype,
                  payerCustomerId: ptype === 'customer' ? pid : undefined,
                  payerCorporateId: ptype === 'corporate' ? pid : undefined,
                  payerName: ptype === 'other' ? payerName : undefined,
                  externalReference: reference || undefined,
                  cashAck: m === 'cash' ? ack : false,
                  note: text || undefined,
                  requestId: rid(),
                }),
              'Tahsilat kaydedildi; doğrulama bekliyor.',
            )
          }}
        >
          <fieldset>
            <legend className="mb-1.5 text-[13.5px] font-medium text-ink">
              Yöntem <span className="text-alert">*</span>
            </legend>
            <div className="grid gap-2">
              {PAYMENT_METHODS.map((x) => (
                <label key={x} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2', m === x ? 'border-blue bg-blue-soft/40' : 'border-line')}>
                  <input type="radio" name="pm" checked={m === x} onChange={() => setMethod(x)} className="mt-1 accent-blue" />
                  <span>
                    <span className="block font-medium text-ink">{PAYMENT_METHOD_LABEL[x]}</span>
                    <span className="block text-[12.5px] text-ink-2">{PAYMENT_METHOD_HINT[x]}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.method && <p className="mt-1 text-[13px] text-alert">{errors.method}</p>}
          </fieldset>
          <Field id="pn-amount" label={`Tutar (${f!.currency})`} required error={errors.amount} hint={v.totals ? `Kalan: ${fmt(v.totals.outstandingMinor, f!.currency)} · onay bekleyen kalemler dahil üst sınır aşılamaz.` : undefined}>
            <Input {...describe('pn-amount', errors.amount, true)} inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Field id="pn-payer" label="Ödeyen" required hint="Ödeyen, sözleşmeden sorumlu kişiyle aynı olmak zorunda değildir.">
            <Select {...describe('pn-payer', undefined, true)} value={payer} onChange={(e) => setPayer(e.target.value)}>
              <option value={`customer:${v.rental.customer.id}`}>
                {v.rental.customer.name} (müşteri)
              </option>
              {v.rental.corporate && <option value={`corporate:${v.rental.corporate.id}`}>{v.rental.corporate.name} (kurumsal hesap)</option>}
              <option value="other:">Başka kişi / kurum</option>
            </Select>
          </Field>
          {ptype === 'other' && (
            <Field id="pn-name" label="Ödeyenin adı" required error={errors.payerName}>
              <Input {...describe('pn-name', errors.payerName)} maxLength={80} value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </Field>
          )}
          {m && m !== 'cash' && (
            <Field id="pn-ref" label="Harici işlem referansı" required={m !== 'other_external'} error={errors.externalReference} hint="Fiş, onay veya dekont numarası. Kart numarası yazmayın.">
              <Input {...describe('pn-ref', errors.externalReference, true)} maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
            </Field>
          )}
          {m === 'cash' && (
            <Statement id="pn-ack" checked={ack} onChange={setAck} error={errors.cashAck}>
              Bu nakdi kendim teslim aldım. (Kim ve ne zaman olduğu kaydedilir.)
            </Statement>
          )}
          <Field id="pn-note" label="Not (isteğe bağlı)">
            <Input {...describe('pn-note')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FinanceDialog>
      )
    }
    case 'payment': {
      const { p, action } = dialog
      const copy = {
        verify: ['Tahsilatı doğrula', 'Doğruladığınızda tutar bakiyeden düşer. Paranın gerçekten geldiğini (kasa, banka hesabı veya POS raporu) kontrol ettiyseniz doğrulayın. Kendi kaydınızı doğrulayamazsınız.', 'Doğrula'],
        reject: ['Tahsilatı reddet', 'Kayıt reddedildi olarak kalır; silinmez ve bakiyeye girmez.', 'Reddet'],
        reverse: ['Tahsilatı ters kaydet', 'Doğrulanmış tahsilat bakiyeden çıkar. Kayıt ve geçmişi silinmez.', 'Ters kaydet'],
      }[action]
      return (
        <FinanceDialog
          title={copy[0]}
          description={copy[1]}
          summary={[
            ['Tahsilat', `${p.paymentNo} · ${PAYMENT_METHOD_LABEL[p.method]}`],
            ['Tutar', <Money key="m" minor={p.amountMinor} currency={p.currency} />],
            ['Ödeyen', p.payer.name],
            ['Kaydeden', `${p.created.name ?? '—'} · ${formatDateTime(p.receivedAt)}`],
            ...(p.externalReference ? ([['Referans', p.externalReference]] as [string, string][]) : []),
          ]}
          confirm={copy[2]}
          danger={action !== 'verify'}
          onClose={onClose}
          onSubmit={() => run(() => financeApi.paymentAction(p.id, action, { ...versioned(p.version), ...(action === 'reject' ? { note: text } : {}), ...(action === 'reverse' ? { reason: text } : {}) }), `${p.paymentNo}: ${copy[2].toLocaleLowerCase('tr')} tamamlandı.`)}
        >
          {action !== 'verify' && (
            <Field id="pa-text" label={action === 'reject' ? 'Not (isteğe bağlı)' : 'Gerekçe'} required={action === 'reverse'}>
              <Textarea {...describe('pa-text')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </FinanceDialog>
      )
    }
    case 'deposit-new': {
      const m = method as DepositMethod | ''
      return (
        <FinanceDialog
          title="Depozito kaydı"
          description="Depozito kendi para biriminde tutulur; kira bedeli veya tahsilat değildir. Alındıysa ikinci bir yetkili doğrular."
          confirm={received ? 'Alındığını bildir' : 'Depozito talebi oluştur'}
          onClose={onClose}
          onSubmit={() =>
            run(
              () => financeApi.createDeposit(rentalId, { currency, amount, received, method: received ? m || undefined : undefined, externalReference: reference || undefined, cashAck: received && m === 'cash' ? ack : false, note: text || undefined, requestId: rid() }),
              received ? 'Depozitonun alındığı bildirildi; doğrulama bekliyor.' : 'Depozito talebi oluşturuldu.',
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field id="dn-amount" label="Tutar" required>
              <Input {...describe('dn-amount')} inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </Field>
            <Field id="dn-cur" label="Para birimi" required>
              <Select id="dn-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {ISO_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13.5px] font-medium text-ink">Durum</legend>
            <label className="flex items-center gap-2.5">
              <input type="radio" name="dr" checked={!received} onChange={() => setReceived(false)} className="accent-blue" /> Henüz alınmadı — talep edildi
            </label>
            <label className="flex items-center gap-2.5">
              <input type="radio" name="dr" checked={received} onChange={() => setReceived(true)} className="accent-blue" /> Alındı — şimdi bildir
            </label>
          </fieldset>
          {received && <DepositMethodFields m={m} setM={setMethod} reference={reference} setReference={setReference} ack={ack} setAck={setAck} />}
          <Field id="dn-note" label="Not (isteğe bağlı)">
            <Input {...describe('dn-note')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FinanceDialog>
      )
    }
    case 'deposit': {
      const { d, action } = dialog
      const copy = {
        report: ['Depozitonun alındığını bildir', 'Bildirim, başka bir yetkili doğrulayana kadar “doğrulama bekliyor” olarak kalır.', 'Bildir'],
        verify: ['Depozitoyu doğrula', 'Depozito tutuluyor olarak kaydedilir. Kendi bildiriminizi doğrulayamazsınız.', 'Doğrula'],
        reject: ['Depozitoyu reddet', 'Bildirim reddedildi olarak kalır; silinmez.', 'Reddet'],
        cancel: ['Depozito talebini iptal et', 'Talep iptal edildi olarak kalır.', 'İptal et'],
        'review-on': ['Depozitoyu incelemeye al', 'İncelemedeyken iade talebi ve onayı yapılamaz. Depozitodan otomatik kesinti yapılmaz.', 'İncelemeye al'],
        'review-off': ['İncelemeyi kapat', 'Depozito yeniden iade edilebilir hale gelir.', 'İncelemeyi kapat'],
      }[action]
      const m = method as DepositMethod | ''
      return (
        <FinanceDialog
          title={copy[0]}
          description={copy[1]}
          summary={[
            ['Depozito', d.depositNo],
            ['Tutar', <Money key="m" minor={d.amountMinor} currency={d.currency} />],
          ]}
          confirm={copy[2]}
          danger={action === 'reject' || action === 'cancel'}
          onClose={onClose}
          onSubmit={() => {
            const base = versioned(d.version)
            if (action === 'report') return run(() => financeApi.depositAction(d.id, 'report', { ...base, method: m || undefined, externalReference: reference || undefined, cashAck: m === 'cash' ? ack : false }), 'Depozitonun alındığı bildirildi.')
            if (action === 'review-on' || action === 'review-off') return run(() => financeApi.depositAction(d.id, 'review', { ...base, inReview: action === 'review-on', reason: text || undefined }), copy[2] + ' tamamlandı.')
            return run(() => financeApi.depositAction(d.id, action, { ...base, ...(action === 'reject' ? { note: text } : {}) }), `${d.depositNo}: ${copy[2].toLocaleLowerCase('tr')} tamamlandı.`)
          }}
        >
          {action === 'report' && <DepositMethodFields m={m} setM={setMethod} reference={reference} setReference={setReference} ack={ack} setAck={setAck} />}
          {action === 'review-on' && (
            <Field id="dr-reason" label="İnceleme nedeni" required>
              <Textarea {...describe('dr-reason')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </FinanceDialog>
      )
    }
    case 'refund-new': {
      const d = dialog.d
      const max = d.heldMinor - d.refundOpenMinor
      const m = method as PaymentMethod | ''
      return (
        <FinanceDialog
          title="Depozito iade talebi"
          description="Talep başka bir yetkili tarafından onaylanır; ardından iadenin ACARVO dışında yapıldığı bildirilir. ACARVO para göndermez."
          summary={[
            ['Depozito', d.depositNo],
            ['İade edilebilir en fazla', <Money key="m" minor={max} currency={d.currency} />],
          ]}
          confirm="İade talebi oluştur"
          onClose={onClose}
          onSubmit={() => (m ? run(() => financeApi.createRefund(d.id, { amount, method: m, reason: text, requestId: rid() }), 'İade talebi oluşturuldu; onay bekliyor.') : 'İade yöntemini seçin.')}
        >
          <Field id="rn-amount" label={`Tutar (${d.currency})`} required>
            <Input {...describe('rn-amount')} inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Field id="rn-method" label="İade yöntemi" required>
            <Select {...describe('rn-method')} value={m} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Seçin</option>
              {PAYMENT_METHODS.map((x) => (
                <option key={x} value={x}>
                  {PAYMENT_METHOD_LABEL[x]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="rn-reason" label="Gerekçe" required>
            <Textarea {...describe('rn-reason')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FinanceDialog>
      )
    }
    case 'refund': {
      const { r, action } = dialog
      const copy = {
        approve: ['İadeyi onayla', 'Onay, iadenin yapılabileceği anlamına gelir; para henüz gönderilmiş sayılmaz. Kendi talebinizi onaylayamazsınız.', 'Onayla'],
        reject: ['İadeyi reddet', 'Talep reddedildi olarak kalır.', 'Reddet'],
        cancel: ['İade talebini iptal et', 'Talep iptal edildi olarak kalır.', 'İptal et'],
        complete: ['İadenin yapıldığını bildir', 'Bu, iadenin ACARVO dışında yapıldığına dair personel bildirimidir; ACARVO para göndermedi ve banka/POS doğrulaması yapmadı.', 'Bildir'],
        reverse: ['İadeyi ters kaydet', 'İade edildi kaydı geri alınır ve tutar yeniden tutulan depozitoya eklenir. Kayıt silinmez.', 'Ters kaydet'],
      }[action]
      return (
        <FinanceDialog
          title={copy[0]}
          description={copy[1]}
          summary={[
            ['İade', `${r.refundNo} · ${PAYMENT_METHOD_LABEL[r.method]}`],
            ['Tutar', <Money key="m" minor={r.amountMinor} currency={r.currency} />],
            ['Gerekçe', r.reason],
          ]}
          confirm={copy[2]}
          danger={action === 'reject' || action === 'cancel' || action === 'reverse'}
          onClose={onClose}
          onSubmit={() => {
            const base = versioned(r.version)
            if (action === 'complete') {
              if (r.method === 'cash' && !ack) return 'Nakdi iade ettiğinizi onaylayın.'
              if (r.method !== 'cash' && !reference.trim()) return 'Harici iade referansını girin.'
              return run(() => financeApi.refundAction(r.id, 'complete', { ...base, method: r.method, externalReference: reference || undefined, cashAck: r.method === 'cash' ? ack : false }), 'İadenin yapıldığı bildirildi.')
            }
            return run(() => financeApi.refundAction(r.id, action, { ...base, ...(action === 'reject' ? { note: text } : {}), ...(action === 'reverse' ? { reason: text } : {}) }), `${r.refundNo}: ${copy[2].toLocaleLowerCase('tr')} tamamlandı.`)
          }}
        >
          {action === 'complete' &&
            (r.method === 'cash' ? (
              <Statement id="rc-ack" checked={ack} onChange={setAck}>
                Bu tutarı nakit olarak kendim iade ettim.
              </Statement>
            ) : (
              <Field id="rc-ref" label="Harici iade referansı" required hint="Dekont veya POS iade fişi numarası. Kart numarası yazmayın.">
                <Input {...describe('rc-ref', undefined, true)} maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
              </Field>
            ))}
          {(action === 'reject' || action === 'reverse') && (
            <Field id="rf-text" label={action === 'reject' ? 'Not (isteğe bağlı)' : 'Gerekçe'} required={action === 'reverse'}>
              <Textarea {...describe('rf-text')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </FinanceDialog>
      )
    }
    case 'close':
      return (
        <FinanceDialog
          title="Finansal kapanış"
          description="Dosya kapanınca değişiklik yapılamaz; gerekirse gerekçeyle yeniden açılır. Kiralamanın operasyonel durumu değişmez."
          summary={v.closeBlockers.length ? v.closeBlockers.map((b) => ['Engel', CLOSE_BLOCKER_LABEL[b] ?? b] as [string, string]) : [['Durum', 'Kapanışa engel yok']]}
          confirm="Finansal olarak kapat"
          onClose={onClose}
          onSubmit={() => (v.closeBlockers.length ? 'Önce engelleri giderin.' : run(() => financeApi.close(rentalId, versioned(f!.version)), 'Finans dosyası kapatıldı.'))}
        />
      )
    case 'reopen':
      return (
        <FinanceDialog title="Finans dosyasını yeniden aç" description="Sonradan gelen bir kayıt (ör. ceza) için dosya gerekçeyle yeniden açılır; önceki kapanış geçmişte kalır." confirm="Yeniden aç" onClose={onClose} onSubmit={() => run(() => financeApi.reopen(rentalId, { ...versioned(f!.version), reason: text }), 'Finans dosyası yeniden açıldı.')}>
          <Field id="ro-reason" label="Gerekçe" required>
            <Textarea {...describe('ro-reason')} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </FinanceDialog>
      )
  }
}

function DepositMethodFields({ m, setM, reference, setReference, ack, setAck }: { m: DepositMethod | ''; setM: (v: string) => void; reference: string; setReference: (v: string) => void; ack: boolean; setAck: (v: boolean) => void }) {
  return (
    <>
      <Field id="dm-method" label="Yöntem" required hint={m === 'external_card_hold' ? 'Yalnız kart blokesini harici POS/bankada gerçekten yaptıysanız seçin. ACARVO provizyon almaz.' : undefined}>
        <Select {...describe('dm-method', undefined, m === 'external_card_hold')} value={m} onChange={(e) => setM(e.target.value)}>
          <option value="">Seçin</option>
          {DEPOSIT_METHODS.map((x) => (
            <option key={x} value={x}>
              {DEPOSIT_METHOD_LABEL[x]}
            </option>
          ))}
        </Select>
      </Field>
      {m && m !== 'cash' && (
        <Field id="dm-ref" label="Harici işlem referansı" required={m !== 'other_external'} hint="Fiş, blokaj onay veya dekont numarası. Kart numarası yazmayın.">
          <Input {...describe('dm-ref', undefined, true)} maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
        </Field>
      )}
      {m === 'cash' && (
        <Statement id="dm-ack" checked={ack} onChange={setAck}>
          Bu depozitoyu nakit olarak kendim teslim aldım.
        </Statement>
      )}
    </>
  )
}

