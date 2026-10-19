import { Printer } from '@phosphor-icons/react'
import type { Contract } from '../../core/types'
import { L } from '../../i18n'
import { useFmt } from '../../ui/hooks'
import { btnSecondary } from '../../ui/kit'

// The A4 contract document: frozen text of an issued version. Printing uses the browser's print dialog; no PDF service
// and no e-signature provider is involved. A signed version is shown with its in-person signature block.

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  .contract-print, .contract-print * { visibility: visible !important; }
  .contract-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
  @page { size: A4; margin: 14mm; }
}`

export function PrintButton({ label }: { label?: string }) {
  return (
    <>
      <style>{PRINT_CSS}</style>
      <button type="button" className={btnSecondary} onClick={() => window.print()}>
        <Printer size={16} /> {label ?? L('Yazdır / PDF', 'Print / PDF')}
      </button>
    </>
  )
}

export function ContractSheet({ c }: { c: Contract }) {
  const f = useFmt()
  const s = c.snapshot
  return (
    <>
      <style>{PRINT_CSS}</style>
      <article className="contract-print mx-auto w-full max-w-[794px] rounded-md border border-line bg-white p-6 text-[13px] leading-relaxed text-[#1b2330] shadow-sm sm:p-10" aria-label={`${L('Sözleşme', 'Contract')} ${c.no}`}>
        <header className="flex items-start justify-between gap-4 border-b border-[#d8dde6] pb-4">
          <div>
            <p className="text-[18px] font-semibold">{s.title}</p>
            <p className="mt-0.5 text-[12px] text-[#5b6577]">{L('Örnek belge · demo verisi', 'Sample document · demo data')}</p>
          </div>
          <div className="text-right text-[12px]">
            <p className="tnum font-semibold">{c.no}</p>
            <p className="text-[#5b6577]">
              {L('Sürüm', 'Version')} {c.version} · {c.lang.toUpperCase()}
            </p>
            <p className="tnum text-[#5b6577]">{f.dt(c.issuedAt)}</p>
          </div>
        </header>
        <dl className="mt-4 grid grid-cols-[130px_1fr] gap-y-1.5">
          <dt className="text-[#5b6577]">{L('Kiracı', 'Renter')}</dt>
          <dd className="font-medium">{s.renterName}</dd>
          <dt className="text-[#5b6577]">{L('Araç', 'Vehicle')}</dt>
          <dd>{s.vehicle}</dd>
          <dt className="text-[#5b6577]">{L('Dönem', 'Period')}</dt>
          <dd className="tnum">{s.period}</dd>
          <dt className="text-[#5b6577]">{L('Toplam', 'Total')}</dt>
          <dd className="tnum">{s.totals}</dd>
          <dt className="text-[#5b6577]">{L('Sigorta', 'Coverage')}</dt>
          <dd>{s.coverage}</dd>
          <dt className="text-[#5b6577]">{L('Depozito', 'Deposit')}</dt>
          <dd className="tnum">{s.deposit}</dd>
        </dl>
        <ol className="mt-5 space-y-3">
          {s.clauses.map((cl, i) => (
            <li key={i}>
              <p className="font-semibold">
                {/^\d+\./.test(cl.title) ? cl.title : `${i + 1}. ${cl.title}`}
              </p>
              <p className="text-[#3b4558]">{cl.body}</p>
            </li>
          ))}
        </ol>
        <footer className="mt-8 grid grid-cols-2 gap-6 border-t border-[#d8dde6] pt-4">
          <div>
            <p className="text-[12px] text-[#5b6577]">{L('Kiracı imzası', 'Renter signature')}</p>
            {c.status === 'signed' ? (
              <>
                <p className="mt-2 font-[cursive] text-[20px] italic">{c.signedBy}</p>
                <p className="tnum text-[12px] text-[#5b6577]">{c.signedAt ? f.dt(c.signedAt) : ''} · {L('yüz yüze, cihaz üzerinde', 'in person, on device')}</p>
              </>
            ) : (
              <p className="mt-6 border-b border-dashed border-[#9aa3b2] pb-6 text-[12px] text-[#7a8496]">{c.status === 'superseded' ? L('Bu sürüm yenisiyle değiştirildi; imza taşımaz.', 'This version was replaced; it carries no signature.') : L('İmza bekleniyor', 'Awaiting signature')}</p>
            )}
          </div>
          <div>
            <p className="text-[12px] text-[#5b6577]">{L('Şirket yetkilisi', 'Company representative')}</p>
            <p className="mt-6 border-b border-dashed border-[#9aa3b2] pb-6 text-[12px] text-[#7a8496]">{c.staffApprovedBy ? L('Personel onayı kayıtlı', 'Staff approval recorded') : ''}</p>
          </div>
        </footer>
      </article>
    </>
  )
}
