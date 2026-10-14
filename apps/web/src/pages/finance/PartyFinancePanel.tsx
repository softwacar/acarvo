import type { FinanceFileListItem, PartyFinanceView } from '@acarvo/shared'
import { Coins, Info } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ErrorState, StatePanel } from '@/components/states'
import { financeApi } from '@/lib/api'
import { FILE_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_TONE } from '@/lib/finance-labels'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { Money, Pill, Section } from './FinanceParts'

/**
 * Müşteri 360° / Kurumsal Hesap 360° → Cari: finance files by rental, with who is responsible and in which currency.
 * Personal and corporate responsibility are never merged; payments made for someone else's rental are listed apart.
 */
export function PartyFinancePanel({ kind, id }: { kind: 'customer' | 'corporate'; id: string }) {
  const session = useSession()
  const allowed = can(session, 'finance.read')
  const q = useQuery({ queryKey: ['finance', 'party', session.company?.id, kind, id], queryFn: () => (kind === 'customer' ? financeApi.customer(id) : financeApi.corporate(id)), enabled: allowed, retry: false })
  if (!allowed)
    return (
      <StatePanel icon={Coins} title="Finans bilgilerini görme yetkiniz yok">
        <p>Cari hareketler finans görüntüleme yetkisi olan kullanıcılara açıktır.</p>
      </StatePanel>
    )
  if (q.isPending) return <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Cari bilgiler yükleniyor" />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  const v: PartyFinanceView = q.data
  const label = kind === 'customer' ? 'bu müşteri' : 'bu kurumsal hesap'
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0 text-ink-3" />
        İç işlem kayıtlarıdır; resmî cari ekstre, fatura veya hukuki borç bildirimi değildir. Tutarlar para birimi başına ayrıdır ve birbirine çevrilmez.
      </p>
      <Section title={kind === 'customer' ? 'Sorumlu olduğu kiralamalar — özet' : 'Kurumsal hesabın sorumlu olduğu kiralamalar — özet'} description={`Yalnız ödeme sorumlusu ${label} olan finans dosyaları toplanır.`}>
        {!v.totals.length ? (
          <p className="text-[13px] text-ink-2">Ödeme sorumlusu {label} olan finans dosyası yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-2">
                  <th scope="col" className="py-2 pr-3 font-medium">Para birimi</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Kayıtlı kalemler</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Doğrulanmış tahsilat</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Doğrulama bekleyen</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Kalan</th>
                  <th scope="col" className="py-2 text-right font-medium">Tutulan depozito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {v.totals.map((t) => (
                  <tr key={t.currency}>
                    <th scope="row" className="py-2 pr-3 text-left font-semibold">{t.currency}</th>
                    <td className="py-2 pr-3 text-right"><Money minor={t.postedMinor} currency={t.currency} /></td>
                    <td className="py-2 pr-3 text-right text-ok"><Money minor={t.verifiedMinor} currency={t.currency} /></td>
                    <td className="py-2 pr-3 text-right text-hold"><Money minor={t.recordedMinor} currency={t.currency} /></td>
                    <td className="py-2 pr-3 text-right font-semibold"><Money minor={t.responsibleOutstandingMinor} currency={t.currency} /></td>
                    <td className="py-2 text-right"><Money minor={t.depositsHeldMinor} currency={t.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Kiralamalara göre finans dosyaları" description={kind === 'customer' ? 'Müşterinin kiracı olduğu veya sorumlu tutulduğu kiralamalar. Kurumsal hesabın sorumlu olduğu dosyalar ayrıca işaretlenir.' : 'Bu hesaba bağlı kiralamalar; sorumlu müşteri olanlar ayrıca işaretlenir.'}>
        <FileTable files={v.files} kind={kind} id={id} />
      </Section>
      {v.paymentsAsPayer.length > 0 && (
        <Section title="Başkasının kiralaması için yaptığı ödemeler" description="Ödeyen olmak sorumluluk doğurmaz; bu kayıtlar yukarıdaki toplamlara katılmaz.">
          <ul className="divide-y divide-line-soft">
            {v.paymentsAsPayer.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <Link to="/kiralamalar/$rentalId" params={{ rentalId: p.rental.id }} search={{ sekme: 'finans' }} className="tnum font-medium text-blue-ink hover:underline">{p.rental.no}</Link>
                  <span className="text-ink-2"> · {p.paymentNo} · {PAYMENT_METHOD_LABEL[p.method]} · {formatDateTime(p.receivedAt)} · sorumlu {p.responsible.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Pill>
                  <Money minor={p.amountMinor} currency={p.currency} className="font-semibold" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

export function FileTable({ files, kind, id }: { files: FinanceFileListItem[]; kind?: 'customer' | 'corporate'; id?: string }) {
  if (!files.length) return <p className="text-[13px] text-ink-2">Finans dosyası yok.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium">Kiralama</th>
            <th scope="col" className="py-2 pr-3 font-medium">Ödeme sorumlusu</th>
            <th scope="col" className="py-2 pr-3 font-medium">Durum</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Kayıtlı kalemler</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Doğrulanmış</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Kalan</th>
            <th scope="col" className="py-2 text-right font-medium">Bekleyen işlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {files.map((f) => {
            const other = kind && (f.responsible.type !== kind || f.responsible.id !== id)
            return (
              <tr key={f.id} className="align-top">
                <td className="py-2.5 pr-3">
                  <Link to="/kiralamalar/$rentalId" params={{ rentalId: f.rental.id }} search={{ sekme: 'finans' }} className="tnum font-medium text-blue-ink hover:underline">
                    {f.rental.no}
                  </Link>
                  <span className="block text-[12px] text-ink-3">{f.totals.currency}</span>
                </td>
                <td className="py-2.5 pr-3">
                  {f.responsible.name}
                  <span className="block text-[12px] text-ink-2">{f.responsible.type === 'corporate' ? 'Kurumsal hesap' : 'Müşteri'}{other ? ' · toplamlara katılmaz' : ''}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <Pill tone={f.status === 'closed' ? 'ok' : f.status === 'reopened' ? 'hold' : 'blue'}>{FILE_STATUS_LABEL[f.status]}</Pill>
                  {f.totals.taxIncomplete && <span className="mt-1 block text-[12px] text-hold">Vergi yapılandırılmamış kalem</span>}
                </td>
                <td className="py-2.5 pr-3 text-right"><Money minor={f.totals.postedChargesMinor} currency={f.totals.currency} /></td>
                <td className="py-2.5 pr-3 text-right text-ok"><Money minor={f.totals.verifiedPaymentsMinor} currency={f.totals.currency} /></td>
                <td className="py-2.5 pr-3 text-right font-semibold">
                  {f.totals.overpaidMinor ? (
                    <span className="text-alert">Fazla <Money minor={f.totals.overpaidMinor} currency={f.totals.currency} /></span>
                  ) : (
                    <Money minor={f.totals.outstandingMinor} currency={f.totals.currency} />
                  )}
                </td>
                <td className="tnum py-2.5 text-right">{f.pending || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
