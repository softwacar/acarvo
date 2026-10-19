import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { readinessOf, type ReadinessItem } from '../../core/calc/availability'
import { customerDocChecks, evaluateDriverEligibility } from '../../core/calc/policy'
import { fmt } from '../../core/money'
import { holdDeposit } from '../../core/ops/finance'
import { deliverRental, deliveryChecks, driversOf, issueContract, markPrepared, previewReturnFees, returnRental, setDepositWaiver, signContract, updateGate, closeOperational } from '../../core/ops/rentals'
import type { Contract, PaymentMethod, Rental } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, CheckF, SelectF, TextF } from '../../ui/forms'
import { ReadinessList } from '../../ui/domain'
import { runAction, useCan, useDb, useFmt } from '../../ui/hooks'
import { ActionError, btnPrimary, btnSecondary, btnSmall, Empty, FinanceDialog, Notice, Panel, Status } from '../../ui/kit'
import { ContractSheet, PrintButton } from '../shared/ContractSheet'
import { emptyDraft, InspectionForm, InspectionView, photoCount } from '../shared/Inspection'

type Go = (tab: string) => void

// ------------------------------------------------------------------------------------------------ Delivery desk

export function DeskTab({ r, go }: { r: Rental; go: Go }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const v = d.vehicles.find((x) => x.id === r.vehicleId)!
  const [draft, setDraft] = useState(() => emptyDraft(v.odometerKm, v.fuel))
  const [error, setError] = useState<string | null>(null)
  const [dlg, setDlg] = useState<null | 'sign' | 'deposit' | 'waive'>(null)
  const editable = r.status === 'prepared'
  const km = draft.km.trim() === '' ? undefined : Number(draft.km)
  const desk = deliveryChecks(d, r.id, { km, fuel: draft.fuel, photos: photoCount(draft) })
  const drivers = driversOf(d, r)
  const readiness = readinessOf(d, v, d.clock.now)
  const contract = d.contracts.find((c) => c.id === r.contract.id)
  const canHandover = can('rentals:handover')

  if (!editable)
    return (
      <Panel title={L('Teslim kaydı', 'Handover record')}>
        {r.handover ? <InspectionView title={L('Teslimde kaydedilen', 'Recorded at handover')} i={r.handover} branchId={r.pickupBranchId} /> : <Empty title={L('Teslim kaydı yok', 'No handover record')} />}
        {r.status === 'cancelled' && <p className="mt-3 text-[13px] text-ink-2">{L('Bu kiralama teslim edilmeden iptal edildi.', 'This rental was cancelled before delivery.')}</p>}
      </Panel>
    )

  const items: ReadinessItem[] = desk.items.map((i) => ({ key: i.key, label: i.label, ok: i.ok, severity: 'blocker', detail: i.detail, link: i.fix?.type === 'vehicle' ? { type: 'vehicle', id: i.fix.id! } : i.fix?.type === 'customer' ? { type: 'customer', id: i.fix.id! } : undefined }))
  const run = (fn: Parameters<typeof runAction<unknown>>[0], msg?: string) => {
    const x = runAction(fn, msg)
    setError(x.ok ? null : x.error)
    return x
  }
  const deliver = () => {
    const x = run((s) => deliverRental(s, r.id, { km: Number(draft.km), fuel: draft.fuel, photos: photoCount(draft), pins: draft.pins, note: draft.note }), L('Araç teslim edildi; kiralama bedeli hesap kalemi olarak bir kez kaydedildi.', 'Vehicle delivered; the rental charge was posted once.'))
    if (x.ok) go('ozet')
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Step n={1} title={L('Sürücü belgeleri', 'Driver documents')} ok={desk.items.find((i) => i.key === 'docs')?.ok}>
          <ul className="space-y-1.5">
            {drivers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                <Link to={`/musteriler/${c.id}` as never} className="font-medium text-blue hover:underline">{c.name}</Link>
                <span className="flex gap-1.5">{customerDocChecks(d, c, d.clock.now, r.plannedReturnAt).map((x) => <Status key={x.kind} kind="doc" value={x.state} />)}</span>
              </li>
            ))}
          </ul>
          {canHandover && <div className="mt-3"><CheckF id="gate-docs" checked={r.gate.docsChecked} onChange={(v) => run((s) => updateGate(s, r.id, { docsChecked: v }))}>{L('Belgelerin aslını gördüm ve kontrol ettim (personel beyanı)', 'I saw and checked the original documents (staff statement)')}</CheckF></div>}
        </Step>

        <Step n={2} title={L('Sürücü uygunluğu', 'Driver eligibility')} ok={desk.items.find((i) => i.key === 'driver')?.ok}>
          <ul className="space-y-1 text-[13.5px]">
            {drivers.map((c) => {
              const e = evaluateDriverEligibility(d, c, r.plannedPickupAt, r.plannedReturnAt)
              return (
                <li key={c.id}>
                  <span className="font-medium">{c.name}</span> — {e.eligible ? `${e.age} ${L('yaş', 'yrs')}, ${L('ehliyet', 'licence')} ${e.licenseYears} ${L('yıl', 'yrs')}${e.youngDriver ? ` · ${L('genç sürücü', 'young driver')}` : ''}` : <span className="text-alert">{e.reasons.join(' ')}</span>}
                </li>
              )
            })}
          </ul>
          {canHandover && <div className="mt-3"><CheckF id="gate-drv" checked={r.gate.driverOk} onChange={(v) => run((s) => updateGate(s, r.id, { driverOk: v }))}>{L('Sürücü uygunluğunu doğruladım', 'I verified driver eligibility')}</CheckF></div>}
        </Step>

        <Step n={3} title={L('Araç hazırlığı', 'Vehicle readiness')} ok={readiness.ready}>
          <ReadinessList items={readiness.items} />
          {!readiness.ready && can('vehicles:manage') && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnSmall} onClick={() => run((s) => markPrepared(s, v.id, L('Teslim masasında kontrol edildi', 'Checked at the delivery desk')), L('Temizlik/hazırlık kaydedildi; diğer engeller ayrıca kapanmalı.', 'Cleaning/readiness recorded; other blockers must still be cleared.'))}>{L('Temiz ve hazır kaydet', 'Record clean and ready')}</button>
              <Link to={`/araclar/${v.id}` as never} className={btnSmall}>{L("Araç 360'ta aç", 'Open vehicle 360')}</Link>
            </div>
          )}
        </Step>

        <Step n={4} title={L('Sözleşme ve imza', 'Contract and signature')} ok={desk.items.find((i) => i.key === 'contract')?.ok}>
          <p className="text-[13.5px]">{!contract ? L('Sözleşme henüz üretilmedi.', 'No contract has been generated yet.') : contract.status === 'signed' ? `${contract.no} · ${L('imzalandı', 'signed')} (${contract.signedBy})` : `${contract.no} · ${L('imza bekliyor', 'awaiting signature')}`}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {contract && <button type="button" className={btnSmall} onClick={() => go('sozlesme')}>{L('Sözleşmeyi gör', 'View contract')}</button>}
            {contract?.status === 'issued' && canHandover && <button type="button" className={btnSmall} onClick={() => setDlg('sign')}>{L('Kiracı imzalasın', 'Renter signs')}</button>}
            {!contract && can('contracts:manage') && <button type="button" className={btnSmall} onClick={() => go('sozlesme')}>{L('Sözleşme üret', 'Generate contract')}</button>}
          </div>
        </Step>

        <Step n={5} title={L('Depozito kararı', 'Deposit decision')} ok={desk.items.find((i) => i.key === 'deposit')?.ok}>
          <p className="text-[13.5px]">
            {r.deposit.required.minor > 0 ? `${L('Gerekli', 'Required')}: ${fmt(r.deposit.required.minor, r.deposit.required.cur)} · ${L('durum', 'state')}: ${depositLabel(r.deposit.state)}` : L('Bu kiralama için depozito gerekmiyor.', 'No deposit is required for this rental.')}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-2">{L('Depozito gelir değildir; iade edilir veya açık bakiyeye mahsup edilir.', 'A deposit is not revenue; it is released or applied to an open balance.')}</p>
          {r.deposit.required.minor > 0 && r.deposit.state !== 'held' && r.deposit.state !== 'waived' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {can('finance:record') && <button type="button" className={btnSmall} onClick={() => setDlg('deposit')}>{L('Depozito al', 'Take deposit')}</button>}
              {can('rentals:manage') && <button type="button" className={btnSmall} onClick={() => setDlg('waive')}>{L('Muaf tut (gerekçeli)', 'Waive (with reason)')}</button>}
            </div>
          )}
        </Step>

        <Step n={6} title={L('Teslim kanıtı', 'Handover evidence')} ok={desk.items.find((i) => i.key === 'evidence')?.ok}>
          <InspectionForm draft={draft} onChange={setDraft} minKm={v.odometerKm} idPrefix="hv" />
        </Step>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4" aria-label={L('Teslim kontrolü', 'Delivery check')}>
        <Panel title={L('Teslim kontrolü', 'Delivery check')} description={desk.canDeliver ? L('Tüm kontroller geçti.', 'All checks passed.') : `${desk.items.filter((i) => !i.ok).length} ${L('kontrol eksik', 'check(s) missing')}`}>
          <ReadinessList items={items} />
          <div className="mt-4 space-y-2">
            <ActionError error={error} />
            <button type="button" className={`${btnPrimary} w-full`} disabled={!desk.canDeliver || !canHandover} onClick={deliver}>{L('Teslimi tamamla', 'Complete handover')}</button>
            {!desk.canDeliver && <p className="text-[12.5px] text-ink-2">{L('Düğme pasif: eksik kontroller yukarıda nedenleriyle yazılı.', 'The button is disabled: missing checks are listed above with reasons.')}</p>}
            {!canHandover && <p className="text-[12.5px] text-alert">{L('Bu rol teslim yapamaz (Teslim ve iade yetkisi yok).', 'This role cannot hand over (no handover permission).')}</p>}
          </div>
        </Panel>
        <p className="text-[12.5px] text-ink-2">{L(`Teslim zamanı: ${f.dt(d.clock.now, r.pickupBranchId)} (demo saati). Teslimde tek bir kiralama bedeli hesap kalemi oluşur; tekrar basmak ikinci kalem açmaz.`, `Handover time: ${f.dt(d.clock.now, r.pickupBranchId)} (demo clock). Handover posts a single rental charge; pressing it again does not create a second one.`)}</p>
      </aside>

      {dlg === 'sign' && <SignDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'deposit' && <DepositDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'waive' && <WaiverDialog r={r} onClose={() => setDlg(null)} />}
    </div>
  )
}

const depositLabel = (s: Rental['deposit']['state']) => ({ none: L('gerekmiyor', 'none'), requested: L('talep edildi', 'requested'), held: L('tutuluyor', 'held'), released: L('iade edildi', 'released'), applied: L('mahsup edildi', 'applied'), waived: L('muaf', 'waived') })[s]

function Step({ n, title, ok, children }: { n: number; title: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2.5">
          <span className={`inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${ok ? 'bg-ok-soft text-ok' : 'bg-line-soft text-ink-2'}`}>{n}</span>
          {title}
        </span>
      }
      action={<span className={`text-[12.5px] font-medium ${ok ? 'text-ok' : 'text-hold'}`}>{ok ? L('Tamam', 'Done') : L('Eksik', 'Missing')}</span>}
    >
      {children}
    </Panel>
  )
}

function SignDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const d = useDb()
  const c = d.customers.find((x) => x.id === r.customerId)!
  const [name, setName] = useState('')
  const [ok, setOk] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Sözleşme imzası (yüz yüze)', 'Contract signature (in person)')}
      description={L('Kiracı imzayı personel cihazında atar. Bu bir e-imza servisi değildir; demo kaydıdır.', 'The renter signs on the staff device. This is not an e-signature service; it is a demo record.')}
      confirm={L('İmzayı kaydet', 'Record signature')}
      onClose={onClose}
      onSubmit={() => {
        const x = runAction((s) => signContract(s, r.id, name, ok), L('Sözleşme imzalandı (demo).', 'Contract signed (demo).'))
        if (!x.ok) {
          setFields(x.fields)
          return x.error
        }
        onClose()
      }}
    >
      <TextF id="sg-n" label={L('İmzalayan adı (kiracı adıyla aynı)', 'Signer name (same as renter)')} required value={name} onChange={setName} error={fields.signer} hint={`${L('Kiracı', 'Renter')}: ${c.name}`} />
      <CheckF id="sg-ok" checked={ok} onChange={setOk} error={fields.confirm}>{L('Kiracı sözleşmeyi okuduğunu ve kabul ettiğini beyan etti.', 'The renter stated they have read and accepted the contract.')}</CheckF>
    </FinanceDialog>
  )
}

function DepositDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const d = useDb()
  const [method, setMethod] = useState<PaymentMethod>(d.settings.deposit.allowedMethods[0] ?? 'card')
  const labels: Record<PaymentMethod, string> = { cash: L('Nakit', 'Cash'), card: L('Kart (provizyon)', 'Card (hold)'), transfer: L('Havale', 'Transfer'), other: L('Diğer', 'Other') }
  return (
    <FinanceDialog
      title={L('Depozito al', 'Take deposit')}
      description={L('Depozito gelir değildir. Nakit depozito yalnızca açık kasaya girer; kart ve havale kasaya girmez.', 'A deposit is not revenue. Cash deposits enter an open drawer only; card and transfer never do.')}
      confirm={L('Depozitoyu kaydet', 'Record deposit')}
      onClose={onClose}
      summary={[[L('Tutar', 'Amount'), fmt(r.deposit.required.minor, r.deposit.required.cur)]]}
      onSubmit={() => {
        const x = runAction((s) => holdDeposit(s, r.id, method), L('Depozito kaydedildi (gelir değildir).', 'Deposit recorded (not revenue).'))
        if (!x.ok) return x.error
        onClose()
      }}
    >
      <SelectF id="dp-m" label={L('Yöntem', 'Method')} value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={d.settings.deposit.allowedMethods.map((m) => ({ id: m, label: labels[m] }))} />
    </FinanceDialog>
  )
}

function WaiverDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  return (
    <FinanceDialog
      title={L('Depozito muafiyeti', 'Deposit waiver')}
      description={L('Muafiyet gerekçesiyle kayda geçer. Eşiği aşan istisnalar Onay Merkezi’nde iki kişi kuralıyla yürür.', 'The waiver is recorded with a reason. Exceptions above the threshold go through the Approval Center with the two-person rule.')}
      confirm={L('Muaf tut', 'Waive')}
      onClose={onClose}
      onSubmit={() => {
        const x = runAction((s) => setDepositWaiver(s, r.id, reason), L('Depozito muaf tutuldu.', 'Deposit waived.'))
        if (!x.ok) {
          setErr(x.fields.reason)
          return x.error
        }
        onClose()
      }}
    >
      <AreaF id="wv-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={err} rows={3} />
    </FinanceDialog>
  )
}

// ------------------------------------------------------------------------------------------------ Return

export function ReturnTab({ r, go }: { r: Rental; go: Go }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const v = d.vehicles.find((x) => x.id === r.vehicleId)!
  const startKm = r.handover?.km ?? v.odometerKm
  const [draft, setDraft] = useState(() => emptyDraft(Math.max(startKm, v.odometerKm), r.handover?.fuel ?? 'full'))
  const [damage, setDamage] = useState(false)
  const [sev, setSev] = useState<'minor' | 'moderate' | 'severe'>('minor')
  const [desc, setDesc] = useState('')
  const [blocks, setBlocks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const km = Number(draft.km)
  const fees = r.status === 'delivered' && km >= startKm ? previewReturnFees(d, r, { km, fuel: draft.fuel }, d.clock.now) : []

  if (r.status === 'delivered')
    return (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={L('İade kontrolü', 'Return inspection')} description={`${L('Teslim', 'Handover')}: ${startKm.toLocaleString(L('tr-TR', 'en-GB'))} km · ${f.dt(r.actualPickupAt ?? r.plannedPickupAt, r.pickupBranchId)}`}>
          <InspectionForm draft={draft} onChange={setDraft} minKm={startKm} idPrefix="rt" startPins={r.handover?.pins} />
          <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
            <CheckF id="rt-dmg" checked={damage} onChange={setDamage}>{L('Yeni hasar bulgusu var (hasar dosyası açılır; ücret otomatik yazılmaz)', 'New damage found (opens a damage file; no charge is posted automatically)')}</CheckF>
            {damage && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectF id="rt-sev" label={L('Şiddet', 'Severity')} value={sev} onChange={(v) => setSev(v as typeof sev)} options={[{ id: 'minor', label: L('Hafif', 'Minor') }, { id: 'moderate', label: L('Orta', 'Moderate') }, { id: 'severe', label: L('Ağır', 'Severe') }]} />
                <CheckF id="rt-blk" checked={blocks} onChange={setBlocks}>{L('Araç kullanıma kapatılsın (hasar bloğu)', 'Block the vehicle (damage block)')}</CheckF>
                <div className="sm:col-span-2"><TextF id="rt-desc" label={L('Hasar açıklaması', 'Damage description')} value={desc} onChange={setDesc} /></div>
              </div>
            )}
          </div>
        </Panel>
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Panel title={L('İadede doğacak kalemler', 'Charges created on return')} description={L('Geç iade, yakıt ve km farkı kuralları Ayarlar’dan gelir.', 'Late-return, fuel and km rules come from Settings.')}>
            {fees.length ? (
              <ul className="divide-y divide-line-soft text-[13.5px]">
                {fees.map((x) => <li key={x.label} className="flex justify-between gap-3 py-2"><span>{x.label}</span><span className="tnum font-medium">{fmt(x.minor, r.currency)}</span></li>)}
              </ul>
            ) : <p className="text-[13px] text-ink-2">{L('Ek kalem yok.', 'No additional charges.')}</p>}
            <div className="mt-4 space-y-2">
              <ActionError error={error} />
              <button
                type="button"
                className={`${btnPrimary} w-full`}
                disabled={!can('rentals:handover') || km < startKm || photoCount(draft) < 4}
                onClick={() => {
                  const x = runAction((s) => returnRental(s, r.id, { km, fuel: draft.fuel, photos: photoCount(draft), pins: draft.pins, note: draft.note, openDamage: damage, damageDescription: desc, damageSeverity: sev, blocksVehicle: blocks }), L('Araç iade alındı. Hazır sayılmaz: temizlik ve hazırlık kontrolü gerekir.', 'Vehicle returned. It is not Ready: cleaning and a readiness check are needed.'))
                  setError(x.ok ? null : x.error)
                  if (x.ok) go('iade')
                }}
              >
                {L('Aracı iade al', 'Receive return')}
              </button>
              {(km < startKm || photoCount(draft) < 4) && <p className="text-[12.5px] text-ink-2">{km < startKm ? L('Kilometre teslim kilometresinden küçük olamaz.', 'Odometer cannot be below the handover reading.') : L('En az 4 fotoğraf gerekir.', 'At least 4 photos are required.')}</p>}
            </div>
          </Panel>
        </aside>
      </div>
    )

  if (!r.ret)
    return <Empty title={r.status === 'prepared' ? L('Araç henüz teslim edilmedi', 'The vehicle has not been delivered yet') : L('İade kaydı yok', 'No return record')} />

  const charges = d.charges.filter((c) => c.rentalId === r.id && ['late', 'fuel', 'km'].includes(c.kind) && c.status !== 'voided')
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={L('Teslim', 'Handover')}><InspectionView title={L('Teslimde', 'At handover')} i={r.handover} branchId={r.pickupBranchId} /></Panel>
        <Panel title={L('İade', 'Return')}><InspectionView title={L('İadede', 'At return')} i={r.ret} branchId={r.returnBranchId} /></Panel>
      </div>
      <Panel title={L('Fark', 'Difference')}>
        <p className="text-[13.5px]">{L('Gidilen mesafe', 'Distance driven')}: <span className="tnum font-medium">{(r.ret.km - (r.handover?.km ?? r.ret.km)).toLocaleString(L('tr-TR', 'en-GB'))} km</span> · {L('Yeni hasar işareti', 'New marks')}: <span className="font-medium">{Math.max(0, r.ret.pins.length - (r.handover?.pins.length ?? 0))}</span></p>
        {charges.length > 0 && <ul className="mt-2 divide-y divide-line-soft text-[13.5px]">{charges.map((c) => <li key={c.id} className="flex justify-between py-1.5"><span>{c.label}</span><span className="tnum">{fmt(c.amountMinor, c.cur)}</span></li>)}</ul>}
      </Panel>
      {r.status === 'returned' && (
        <Notice tone="hold" action={can('rentals:handover') ? <button type="button" className={btnPrimary} onClick={() => { const x = runAction((s) => closeOperational(s, r.id), L('Operasyonel olarak kapandı. Finansal kapanış ayrıdır.', 'Operationally closed. Financial closure is separate.')); if (x.ok) go('ozet') }}>{L('Operasyonel kapat', 'Close operationally')}</button> : undefined}>
          {L('İade alındı ama kiralama kapanmadı. Araç Hazır sayılmaz; temizlik ve hazırlık kontrolü araç sayfasında yapılır. Operasyonel kapanış finansal kapanış demek değildir.', 'The vehicle is back but the rental is not closed. The vehicle is not Ready; cleaning and a readiness check are done on the vehicle page. Operational closure is not financial closure.')}
        </Notice>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ Contract

export function ContractTab({ r }: { r: Rental }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const versions = d.contracts.filter((c) => c.rentalId === r.id).sort((a, b) => b.version - a.version)
  const [sel, setSel] = useState<string>('')
  const [dlg, setDlg] = useState<null | 'sign' | 'issue'>(null)
  const current: Contract | undefined = versions.find((c) => c.id === sel) ?? versions[0]
  const latest = versions[0]
  const canIssue = can('contracts:manage') && r.status === 'prepared' && latest?.status !== 'signed'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-2">{L('İmzalı sözleşme değişmez. Kiralama koşulları değişirse yeni sürüm üretilir; imza yeni sürüme taşınmaz.', 'A signed contract is immutable. If rental terms change, a new version is issued; the signature is never inherited.')}</p>
        <div className="flex flex-wrap gap-2">
          {canIssue && <button type="button" className={btnSecondary} onClick={() => setDlg('issue')}>{latest ? L('Yeni sürüm üret', 'Issue new version') : L('Sözleşme üret', 'Generate contract')}</button>}
          {latest?.status === 'issued' && can('rentals:handover') && <button type="button" className={btnPrimary} onClick={() => setDlg('sign')}>{L('Kiracı imzalasın', 'Renter signs')}</button>}
          {current && <PrintButton />}
        </div>
      </div>
      {!current ? (
        <Empty title={L('Henüz sözleşme yok', 'No contract yet')} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Panel title={L('Sürümler', 'Versions')}>
            <ul className="space-y-1.5">
              {versions.map((c) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={c.id === current.id} onClick={() => setSel(c.id)} className={`w-full rounded-md border px-3 py-2 text-left text-[13px] ${c.id === current.id ? 'border-blue bg-blue-soft' : 'border-line hover:bg-line-soft'}`}>
                    <span className="flex items-center justify-between gap-2"><span className="tnum font-medium">{c.no} · v{c.version}</span><Status kind="contract" value={c.status} /></span>
                    <span className="tnum text-[12px] text-ink-2">{f.dt(c.issuedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="min-w-0 overflow-x-auto"><ContractSheet c={current} /></div>
        </div>
      )}
      {dlg === 'sign' && <SignDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'issue' && <IssueDialog r={r} onClose={() => setDlg(null)} />}
    </div>
  )
}

function IssueDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const d = useDb()
  const customer = d.customers.find((c) => c.id === r.customerId)
  const templates = d.templates.filter((t) => t.active)
  const [tpl, setTpl] = useState((templates.find((t) => t.lang === customer?.language) ?? templates[0])?.id ?? '')
  return (
    <FinanceDialog
      title={L('Sözleşme üret', 'Issue contract')}
      description={L('Metin üretildiği anda dondurulur; sonra şablon değişse de bu sürüm değişmez.', 'The text is frozen when issued; later template edits never rewrite this version.')}
      confirm={L('Üret', 'Issue')}
      onClose={onClose}
      onSubmit={() => {
        const x = runAction((s) => issueContract(s, r.id, tpl), L('Sözleşme üretildi; imza bekliyor.', 'Contract issued; awaiting signature.'))
        if (!x.ok) return x.error
        onClose()
      }}
    >
      <SelectF id="is-t" label={L('Şablon', 'Template')} value={tpl} onChange={setTpl} options={templates.map((t) => ({ id: t.id, label: `${t.name} (${t.lang.toUpperCase()}, v${t.version})` }))} hint={customer ? `${L('Müşteri dili', 'Customer language')}: ${customer.language.toUpperCase()}` : undefined} />
    </FinanceDialog>
  )
}
