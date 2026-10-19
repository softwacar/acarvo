import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { fmt, parseAmount } from '../../core/money'
import { chargeDamageToCustomer, customerShare, linkRepair, recordInsurerRecovery, setDamageLiability, setDamageStatus, unblockVehicle } from '../../core/ops/fleet'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Damage } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, DateTimeF, MoneyF, SelectF, TextF } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Notice, Page, SearchBox, Status, Timeline } from '../../ui/kit'
import { VehicleCell } from '../../ui/domain'
import { LIABILITY_LABEL, STATUS } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { DamageDialog } from '../shared/FleetDialogs'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from './common'

export function DamagesPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const liab = LIABILITY_LABEL()
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [blocking, setBlocking] = useUrlState('engel', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const vOf = (x: Damage) => d.vehicles.find((v) => v.id === x.vehicleId)!
  const scoped = d.damages.filter((x) => active.includes(vOf(x).homeBranchId))
  const rows = scoped
    .filter((x) => (status === 'all' ? true : x.status === status))
    .filter((x) => (blocking === 'all' ? true : x.blocksVehicle))
    .filter((x) => !q || `${x.no} ${vOf(x).plate} ${x.area} ${x.description}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const open = scoped.filter((x) => x.status !== 'closed')
  const cols: Col<Damage>[] = [
    { id: 'no', header: L('Dosya', 'File'), cell: (x) => <span className="tnum whitespace-nowrap font-medium text-blue">{x.no}</span>, sort: (x) => x.no, csv: (x) => x.no },
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (x) => <VehicleCell v={vOf(x)} sub={false} />, csv: (x) => vOf(x).plate },
    { id: 'area', header: L('Bölge / açıklama', 'Area / description'), cell: (x) => <span className="line-clamp-1">{x.area} · {x.description}</span>, hideBelow: 'md' },
    { id: 'sev', header: L('Şiddet', 'Severity'), cell: (x) => <Status kind="severity" value={x.severity} />, hideBelow: 'lg', csv: (x) => x.severity },
    { id: 'liab', header: L('Sorumluluk', 'Liability'), cell: (x) => liab[x.liability], hideBelow: 'lg', csv: (x) => x.liability },
    { id: 'est', header: L('Tahmin', 'Estimate'), align: 'right', cell: (x) => (x.estimate ? <span className="tnum">{fmt(x.estimate.minor, x.estimate.cur)}</span> : '—'), hideBelow: 'md', csv: (x) => (x.estimate ? x.estimate.minor : '') },
    { id: 'blk', header: L('Araç engeli', 'Vehicle block'), cell: (x) => (x.blocksVehicle ? <span className="font-medium text-alert">{L('Var', 'Yes')}</span> : <span className="text-ink-3">—</span>), hideBelow: 'lg', csv: (x) => (x.blocksVehicle ? 'evet' : 'hayır') },
    { id: 'st', header: L('Durum', 'Status'), cell: (x) => <Status kind="damage" value={x.status} />, sort: (x) => x.status, csv: (x) => x.status },
  ]
  const current = d.damages.find((x) => x.id === sel)
  return (
    <Page
      title={L('Hasar Kayıtları', 'Damage Records')}
      description={L('Hasar bildirimi, sorumluluk ve para akışı ayrı adımlardır: müşteri payı bir hesap kalemidir, sigorta geri ödemesi ayrı bir finans hareketidir.', 'Reporting, liability and money are separate steps: the customer share is a charge; the insurer recovery is a separate finance movement.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('hasar', cols, rows)}>CSV</button>
          {can('damages:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Hasar kaydı aç', 'Open damage')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Açık dosya', 'Open files'), value: open.length, to: '/hasar-kayitlari?durum=reported' },
          { label: L('Aracı engelleyen', 'Blocking a vehicle'), value: scoped.filter((x) => x.blocksVehicle).length, tone: scoped.some((x) => x.blocksVehicle) ? 'alert' : undefined, to: '/hasar-kayitlari?engel=1' },
          { label: L('Sorumluluk belirlenmedi', 'Liability undetermined'), value: open.filter((x) => x.liability === 'undetermined').length, tone: open.some((x) => x.liability === 'undetermined') ? 'hold' : undefined },
          { label: L('Onarımı bağlanmamış', 'Repair not linked'), value: open.filter((x) => !x.repairMaintenanceId && x.liability !== 'undetermined').length },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setStatus('all'); setBlocking('all') }} active={q !== '' || status !== 'all' || blocking !== 'all'}>
        <SearchBox label={L('Hasarda ara', 'Search damages')} placeholder={L('Dosya, plaka, bölge…', 'File, plate, area…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.keys(STATUS.damage!).map((k) => ({ id: k, label: STATUS.damage![k]!().label }))]} />
        <FilterSelect label={L('Engel', 'Block')} value={blocking} onChange={setBlocking} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: '1', label: L('Yalnız engelleyenler', 'Blocking only') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} label={L('Hasar listesi', 'Damage list')} urlKey="hs" defaultSort={{ id: 'no', dir: 'desc' }} onRowClick={(x) => setSel(x.id)} empty={<Empty title={L('Bu filtrelerle hasar kaydı yok', 'No damage records match')} />} />
      {adding && <DamageDialog onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
      {current && <Drawer x={current} onClose={() => setSel('')} />}
    </Page>
  )
}

type Dlg = null | 'liability' | 'recovery' | 'repair' | 'close'

function Drawer({ x, onClose }: { x: Damage; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<Dlg>(null)
  const v = d.vehicles.find((y) => y.id === x.vehicleId)!
  const rental = d.rentals.find((r) => r.id === x.rentalId)
  const repair = d.maintenance.find((m) => m.id === x.repairMaintenanceId)
  const charge = d.charges.find((c) => c.id === x.chargeId)
  const liab = LIABILITY_LABEL()
  const share = customerShare(x)
  const manage = can('damages:manage')
  const closed = x.status === 'closed'
  return (
    <RecordDrawer title={x.no} subtitle={`${v.plate} · ${x.area}`} onClose={onClose} error={error}>
      {x.blocksVehicle && <Notice tone="alert">{L('Bu hasar aracı kullanıma kapatıyor. Engeli kaldırmak, hasarı bildiren kişiden farklı ikinci bir yetkili ister (dört göz).', 'This damage blocks the vehicle. Lifting the block needs a second authorised person who did not report it (four eyes).')}</Notice>}
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="damage" value={x.status} />],
          [L('Araç', 'Vehicle'), <Link2 key="v" type="vehicle" id={v.id}>{v.plate} · {v.make} {v.model}</Link2>],
          [L('Kiralama', 'Rental'), rental ? <Link2 key="r" type="rental" id={rental.id}>{rental.no}</Link2> : L('Kiralamaya bağlı değil', 'Not linked to a rental')],
          [L('Açıklama', 'Description'), x.description],
          [L('Şiddet', 'Severity'), <Status key="sv" kind="severity" value={x.severity} />],
          [L('Fotoğraf', 'Photos'), `${x.photos} ${L('(örnek)', '(sample)')}`],
          [L('Sorumluluk', 'Liability'), liab[x.liability]],
          [L('Onarım tahmini', 'Repair estimate'), x.estimate ? fmt(x.estimate.minor, x.estimate.cur) : '—'],
          [L('Sigorta muafiyeti', 'Insurance excess'), x.insurance ? `${x.insurance.name} · ${fmt(x.insurance.deductible.minor, x.insurance.deductible.cur)}` : L('Paket yok', 'No package')],
          [L('Müşteri payı', 'Customer share'), share ? fmt(share.minor, share.cur) : '—'],
          [L('Müşteri kalemi', 'Customer charge'), charge ? `${charge.no} · ${fmt(charge.amountMinor, charge.cur)}` : '—'],
          [L('Sigorta geri ödemesi', 'Insurer recovery'), x.recovery ? `${x.recovery.insurerRef} · ${fmt(x.recovery.amount.minor, x.recovery.amount.cur)} · ${x.recovery.receivedAt ? L('alındı', 'received') : L('bekleniyor', 'expected')}` : '—'],
          [L('Onarım', 'Repair'), repair ? <Link2 key="m" type="maintenance" id={repair.id}>{repair.no} · {f.date(repair.plannedStart, v.homeBranchId)}</Link2> : '—'],
        ]}
      />
      {manage && !closed && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {x.status === 'reported' && <ActBtn onClick={() => act((s) => setDamageStatus(s, x.id, 'investigating'), L('İnceleme başladı.', 'Investigation started.'))}>{L('İncelemeye al', 'Start investigation')}</ActBtn>}
            <ActBtn onClick={() => setDlg('liability')}>{L('Sorumluluk belirle', 'Set liability')}</ActBtn>
            {share && !x.chargeId && can('finance:record') && <ActBtn onClick={() => act((s) => chargeDamageToCustomer(s, x.id), L('Müşteri payı hesap kalemi olarak yazıldı (tek kalem).', 'Customer share posted as a single charge.'))}>{L('Müşteri payını kalem yaz', 'Post customer share')}</ActBtn>}
            {x.liability !== 'undetermined' && can('finance:record') && <ActBtn onClick={() => setDlg('recovery')}>{L('Sigorta geri ödemesi', 'Insurer recovery')}</ActBtn>}
            {!x.repairMaintenanceId && can('maintenance:manage') && <ActBtn onClick={() => setDlg('repair')}>{L('Onarım bağla', 'Link repair')}</ActBtn>}
            {x.blocksVehicle && can('damages:unblock') && <ActBtn onClick={() => act((s) => unblockVehicle(s, x.id), L('Araç engeli kaldırıldı (hazırlık ayrıca kontrol edilir).', 'Vehicle block lifted (readiness is checked separately).'))}>{L('Engeli kaldır', 'Lift block')}</ActBtn>}
            <ActBtn onClick={() => setDlg('close')}>{L('Dosyayı kapat', 'Close file')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={x.history} /></DrawerSection>
      {dlg === 'liability' && <LiabilityDialog x={x} onClose={() => setDlg(null)} />}
      {dlg === 'recovery' && <RecoveryDialog x={x} onClose={() => setDlg(null)} />}
      {dlg === 'repair' && <RepairDialog x={x} onClose={() => setDlg(null)} />}
      {dlg === 'close' && <PromptDialog title={L('Hasar dosyasını kapat', 'Close damage file')} description={L('Kapatmak için sorumluluk belirlenmiş ve araç engeli kalkmış olmalı.', 'Liability must be set and the vehicle block lifted before closing.')} label={L('Kapanış notu', 'Closing note')} confirm={L('Kapat', 'Close')} run={(t) => act((s) => setDamageStatus(s, x.id, 'closed', t), L('Hasar dosyası kapandı.', 'Damage file closed.')) as never} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function LiabilityDialog({ x, onClose }: { x: Damage; onClose: () => void }) {
  const d = useDb()
  const liab = LIABILITY_LABEL()
  const [kind, setKind] = useState<Damage['liability']>(x.liability === 'undetermined' ? 'customer' : x.liability)
  const rental = d.rentals.find((r) => r.id === x.rentalId)
  const [cur, setCur] = useState(x.estimate?.cur ?? rental?.currency ?? d.settings.company.baseCurrency)
  const [amount, setAmount] = useState(x.estimate ? String(x.estimate.minor / 100) : '')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Sorumluluk belirle', 'Set liability')}
      description={L('Müşteri sorumluysa müşteri payı sigorta muafiyetiyle sınırlıdır; kalan kısım sigortadan beklenir. Tahmin, kiralama para biriminde olmalıdır (kur dönüşümü yapılmaz).', 'If the customer is liable the customer share is capped at the insurance excess; the rest is expected from the insurer. The estimate must be in the rental currency (no conversion).')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const minor = amount.trim() === '' ? null : parseAmount(amount, cur)
        const r = runAction((s) => setDamageLiability(s, x.id, kind, minor === null ? null : { minor, cur }), L('Sorumluluk belirlendi.', 'Liability set.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <SelectF id="lb-k" label={L('Sorumlu', 'Liable party')} value={kind} onChange={(v) => setKind(v as Damage['liability'])} options={Object.entries(liab).filter(([k]) => k !== 'undetermined').map(([id, label]) => ({ id, label }))} />
      <MoneyF id="lb-a" label={L('Onarım tahmini', 'Repair estimate')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} error={fields.estimate} lockCurrency={!!rental} />
    </FinanceDialog>
  )
}

function RecoveryDialog({ x, onClose }: { x: Damage; onClose: () => void }) {
  const d = useDb()
  const [ref, setRef] = useState('')
  const cur = x.estimate?.cur ?? d.settings.company.baseCurrency
  const [amount, setAmount] = useState('')
  const [received, setReceived] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Sigorta geri ödemesi', 'Insurer recovery')}
      description={L('Sigorta ödemesi müşteri kalemi değildir; ayrı bir finans hareketi olarak izlenir.', 'An insurer payment is not a customer charge; it is tracked as a separate finance movement.')}
      confirm={L('Kaydet', 'Save')}
      onClose={onClose}
      onSubmit={() => {
        const minor = parseAmount(amount, cur)
        if (minor === null || minor <= 0) {
          setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') })
          return L('Tutar geçersiz.', 'Invalid amount.')
        }
        const r = runAction((s) => recordInsurerRecovery(s, x.id, ref, { minor, cur }, received), L('Sigorta geri ödemesi kaydedildi.', 'Insurer recovery recorded.'))
        if (!r.ok) {
          setFields(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <TextF id="rc-r" label={L('Sigorta dosya referansı', 'Insurer file reference')} required value={ref} onChange={setRef} error={fields.ref} />
      <MoneyF id="rc-a" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={cur} onCur={() => {}} currencies={[cur]} lockCurrency error={fields.amount} />
      <CheckF id="rc-ok" checked={received} onChange={setReceived}>{L('Tahsil edildi (işaretlenmezse "bekleniyor")', 'Received (otherwise "expected")')}</CheckF>
    </FinanceDialog>
  )
}

function RepairDialog({ x, onClose }: { x: Damage; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const v = d.vehicles.find((y) => y.id === x.vehicleId)!
  const tz = f.zone(v.homeBranchId)
  const [start, setStart] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 5), '09:00', tz))
  const [end, setEnd] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 7), '17:00', tz))
  const [provider, setProvider] = useState('')
  return (
    <FinanceDialog
      title={L('Onarım bağla', 'Link repair')}
      description={L('Bir bakım kaydı (onarım) oluşturulur; maliyet bakım kaydından gelir. Çakışan kiralama veya rezervasyon varsa kayıt oluşmaz.', 'A maintenance (repair) record is created; cost comes from it. If a rental or reservation overlaps, nothing is created.')}
      confirm={L('Planla ve bağla', 'Plan and link')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((s) => linkRepair(s, x.id, start, end, provider || undefined), L('Onarım planlandı ve hasara bağlandı.', 'Repair planned and linked.'))
        if (!r.ok) return r.error
        onClose()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeF id="rp-s" label={L('Başlangıç', 'Start')} value={start} onChange={setStart} tz={tz} />
        <DateTimeF id="rp-e" label={L('Bitiş', 'End')} value={end} onChange={setEnd} tz={tz} />
      </div>
      <SelectF id="rp-p" label={L('Servis sağlayıcı', 'Service provider')} value={provider} onChange={setProvider} placeholder={L('Seçilmedi', 'Not chosen')} options={d.providers.map((p) => ({ id: p.id, label: p.name }))} />
    </FinanceDialog>
  )
}
