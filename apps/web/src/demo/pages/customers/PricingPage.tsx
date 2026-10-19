import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { priceQuote } from '../../core/calc/pricing'
import { fail, userName } from '../../core/helpers'
import { fmt, parseAmount, toInput } from '../../core/money'
import { savePricing } from '../../core/ops/control'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Cur, CorporateAgreement, Db, Extra, InsurancePackage, PriceSnapshot, Season } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, DateF, DateTimeF, SelectF, TextF, branchOptions, classOptions } from '../../ui/forms'
import { PriceBreakdown } from '../../ui/domain'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSmall, Empty, FinanceDialog, Notice, Page, Panel, Tabs } from '../../ui/kit'

type TabId = 'baz' | 'sezon' | 'kademe' | 'anlasma' | 'ekstra' | 'sigorta' | 'vergi' | 'simulasyon' | 'revizyon'

export function PricingPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const [tab, setTab] = useUrlState('sekme', 'baz')
  const edit = can('pricing:manage')
  const curs = d.settings.acceptedCurrencies
  return (
    <Page
      title={L('Fiyatlandırma', 'Pricing')}
      description={L('Tek fiyat hattı: baz tarife → sezon → süre kademesi → kurumsal anlaşma → onaylı indirim → ekstralar → sigorta → sürücü → vergi. Sigorta, ekstra ve ücretler her para birimi için ayrı satırdır; fiyatlarda kur dönüşümü yapılmaz.', 'One pricing pipeline: base rate → season → length tier → corporate agreement → approved discount → extras → coverage → drivers → tax. Insurance, extras and fees have a row per currency; pricing never converts currencies.')}
    >
      {!edit && <Notice tone="blue">{L('Bu rolde fiyatlar yalnız okunur. Değişiklik için fiyat yönetimi yetkisi gerekir.', 'Prices are read-only for this role. Changing them needs the pricing-management permission.')}</Notice>}
      <Tabs<TabId>
        label={L('Fiyatlandırma bölümleri', 'Pricing sections')}
        value={tab as TabId}
        onChange={setTab}
        tabs={[
          { id: 'baz', label: L('Baz tarifeler', 'Base rates') },
          { id: 'sezon', label: L('Sezonlar', 'Seasons'), count: d.seasons.length },
          { id: 'kademe', label: L('Süre kademeleri', 'Length tiers') },
          { id: 'anlasma', label: L('Kurumsal anlaşmalar', 'Corporate agreements') },
          { id: 'ekstra', label: L('Ekstralar', 'Extras') },
          { id: 'sigorta', label: L('Sigorta paketleri', 'Coverage') },
          { id: 'vergi', label: L('Vergi', 'Tax') },
          { id: 'simulasyon', label: L('Simülasyon', 'Simulation') },
          { id: 'revizyon', label: L('Revizyonlar', 'Revisions'), count: d.priceRevisions.length },
        ]}
      />
      {tab === 'baz' && <BaseRates edit={edit} curs={curs} />}
      {tab === 'sezon' && <Seasons edit={edit} />}
      {tab === 'kademe' && <Tiers edit={edit} />}
      {tab === 'anlasma' && <Agreements edit={edit} />}
      {tab === 'ekstra' && <Extras edit={edit} curs={curs} />}
      {tab === 'sigorta' && <Coverage edit={edit} curs={curs} />}
      {tab === 'vergi' && <Tax edit={edit} />}
      {tab === 'simulasyon' && <Simulation />}
      {tab === 'revizyon' && (
        <Panel title={L('Fiyat revizyonları', 'Price revisions')} description={L('Her kayıt yeni bir fiyat sürümüdür. Mevcut teklif, rezervasyon ve kiralama fiyatları kayıt anında dondurulur ve değişmez.', 'Each entry is a new price version. Existing quotes, reservations and rentals keep their frozen price.')} flush>
          {d.priceRevisions.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Revizyon yok.', 'No revisions.')}</p> : (
            <ul className="divide-y divide-line-soft">
              {[...d.priceRevisions].reverse().map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-[13.5px]"><span><span className="tnum font-medium">{r.id}</span> · {r.summary}</span><span className="tnum text-ink-2">{f.dt(r.at)} · {userName(d, r.by)}</span></li>)}
            </ul>
          )}
        </Panel>
      )}
    </Page>
  )
}

// ----------------------------------------------------------------------------------------------- shared editors

function Save({ title, summary, children, apply, onClose }: { title: string; summary: string; children: React.ReactNode; apply: (d: Db) => void; onClose: () => void }) {
  return (
    <FinanceDialog title={title} description={L('Kaydedilince yeni bir fiyat revizyonu oluşur; yalnız bundan sonraki teklif ve rezervasyonları etkiler.', 'Saving creates a new price revision; it affects only later quotes and reservations.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => savePricing(s, summary, apply), L('Fiyat revizyonu kaydedildi.', 'Price revision saved.')); if (!r.ok) return r.error; onClose() }}>
      {children}
    </FinanceDialog>
  )
}

function BaseRates({ edit, curs }: { edit: boolean; curs: Cur[] }) {
  const d = useDb()
  const [cell, setCell] = useState<{ classId: string; cur: Cur } | null>(null)
  return (
    <Panel title={L('Günlük baz tarife', 'Daily base rate')} description={L('Sınıf × para birimi. Boş hücre = tanımsız: o para biriminde bu sınıf için fiyat hesaplanamaz.', 'Class × currency. An empty cell is undefined: that class cannot be priced in that currency.')} flush>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[13.5px]">
        <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-5 py-2 font-medium">{L('Sınıf', 'Class')}</th>{curs.map((c) => <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-line-soft">
          {d.classes.map((cl) => (
            <tr key={cl.id}><td className="px-5 py-2.5 font-medium">{cl.name}</td>
              {curs.map((c) => { const row = d.baseRates.find((r) => r.classId === cl.id && r.cur === c); return <td key={c} className="px-3 py-1.5 text-right">{edit ? <button type="button" className="tnum min-h-9 rounded-md px-2 hover:bg-line-soft" onClick={() => setCell({ classId: cl.id, cur: c })}>{row ? fmt(row.dailyMinor, c) : <span className="text-hold">{L('Tanımsız', 'Undefined')}</span>}</button> : <span className="tnum">{row ? fmt(row.dailyMinor, c) : '—'}</span>}</td> })}
            </tr>
          ))}
        </tbody>
      </table></div>
      {cell && <BaseDialog classId={cell.classId} cur={cell.cur} onClose={() => setCell(null)} />}
    </Panel>
  )
}

function BaseDialog({ classId, cur, onClose }: { classId: string; cur: Cur; onClose: () => void }) {
  const d = useDb()
  const row = d.baseRates.find((r) => r.classId === classId && r.cur === cur)
  const [v, setV] = useState(row ? toInput(row.dailyMinor, cur) : '')
  const [err, setErr] = useState<string | undefined>()
  const name = d.classes.find((c) => c.id === classId)?.name
  return (
    <FinanceDialog title={`${name} · ${cur}`} description={L('Günlük baz tarife. Boş bırakıp kaydetmek satırı kaldırır (tanımsız).', 'Daily base rate. Saving empty removes the row (undefined).')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => {
        const minor = v.trim() === '' ? null : parseAmount(v, cur)
        if (v.trim() !== '' && (minor === null || minor <= 0)) { setErr(L('Geçerli bir tutar girin', 'Enter a valid amount')); return L('Tutar geçersiz.', 'Invalid amount.') }
        const r = runAction((s) => savePricing(s, `${name} ${cur} baz tarife ${minor === null ? 'kaldırıldı' : fmt(minor, cur)}`, (x) => { x.baseRates = x.baseRates.filter((y) => !(y.classId === classId && y.cur === cur)); if (minor !== null) x.baseRates.push({ id: `br-${classId}-${cur}-${x.priceRevisions.length}`, classId, cur, dailyMinor: minor }) }), L('Fiyat revizyonu kaydedildi.', 'Price revision saved.'))
        if (!r.ok) return r.error
        onClose()
      }}>
      <TextF id="br-v" label={`${L('Günlük tutar', 'Daily amount')} (${cur})`} value={v} onChange={setV} error={err} />
    </FinanceDialog>
  )
}

function Seasons({ edit }: { edit: boolean }) {
  const d = useDb()
  const [dlg, setDlg] = useState<Season | 'new' | null>(null)
  return (
    <Panel title={L('Sezonlar', 'Seasons')} description={L('Sezon, baz tarifeye yüzde ekler.', 'A season adds a percentage to the base rate.')} action={edit ? <button type="button" className={btnPrimary} onClick={() => setDlg('new')}><Plus size={15} /> {L('Sezon ekle', 'Add season')}</button> : undefined} flush>
      {d.seasons.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Sezon yok.', 'No seasons.')}</p> : (
        <ul className="divide-y divide-line-soft">{d.seasons.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]"><span><span className="font-medium">{s.name}</span><span className="block text-[12.5px] text-ink-2">{s.from} → {s.to} · +%{s.uplift} · {s.active ? L('aktif', 'active') : L('pasif', 'inactive')}</span></span>{edit && <button type="button" className={btnSmall} onClick={() => setDlg(s)}>{L('Düzenle', 'Edit')}</button>}</li>)}</ul>
      )}
      {dlg && <SeasonDialog s={dlg === 'new' ? null : dlg} onClose={() => setDlg(null)} />}
    </Panel>
  )
}

function SeasonDialog({ s, onClose }: { s: Season | null; onClose: () => void }) {
  const d = useDb()
  const today = dayOf(d.clock.now, d.settings.company.tz)
  const [name, setName] = useState(s?.name ?? '')
  const [from, setFrom] = useState(s?.from ?? today)
  const [to, setTo] = useState(s?.to ?? addDaysYmd(today, 30))
  const [uplift, setUplift] = useState(String(s?.uplift ?? 20))
  const [active, setActive] = useState(s?.active ?? true)
  return (
    <FinanceDialog title={s ? L('Sezonu düzenle', 'Edit season') : L('Sezon ekle', 'Add season')} description={L('Sezon tarihleri teslim gününe göre uygulanır.', 'Season dates apply by pickup day.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => {
        if (name.trim().length < 2) return L('Sezon adı girin.', 'Enter a season name.')
        if (to < from) return L('Bitiş başlangıçtan önce olamaz.', 'The end cannot be before the start.')
        const up = Number(uplift)
        if (!(up >= 0 && up <= 200)) return L('Artış yüzdesi 0–200 arasında olmalı.', 'The uplift must be between 0 and 200.')
        const r = runAction((x) => savePricing(x, `Sezon ${name}`, (y) => { if (s) Object.assign(y.seasons.find((z) => z.id === s.id)!, { name, from, to, uplift: up, active }); else y.seasons.push({ id: `sn-${y.priceRevisions.length + 1}`, name, from, to, uplift: up, active }) }), L('Fiyat revizyonu kaydedildi.', 'Price revision saved.'))
        if (!r.ok) return r.error
        onClose()
      }}>
      <TextF id="sn-n" label={L('Ad', 'Name')} required value={name} onChange={setName} />
      <div className="grid gap-4 sm:grid-cols-2"><DateF id="sn-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} /><DateF id="sn-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} /></div>
      <TextF id="sn-u" label={L('Artış (%)', 'Uplift (%)')} value={uplift} onChange={(v) => setUplift(v.replace(/[^\d.]/g, ''))} />
      <CheckF id="sn-a" checked={active} onChange={setActive}>{L('Aktif', 'Active')}</CheckF>
    </FinanceDialog>
  )
}

function Tiers({ edit }: { edit: boolean }) {
  const d = useDb()
  const [dlg, setDlg] = useState(false)
  const tiers = [...d.settings.tiers].sort((a, b) => a.fromDays - b.fromDays)
  return (
    <Panel title={L('Süre kademeleri', 'Length tiers')} description={L('Kiralama süresi arttıkça günlük tarifeye yüzde indirim.', 'A percentage discount on the daily rate as the rental gets longer.')} action={edit ? <button type="button" className={btnSmall} onClick={() => setDlg(true)}>{L('Kademe ekle', 'Add tier')}</button> : undefined}>
      {tiers.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Kademe yok.', 'No tiers.')}</p> : <ul className="divide-y divide-line-soft text-[13.5px]">{tiers.map((t) => <li key={t.fromDays} className="flex justify-between py-2.5"><span>{t.fromDays}+ {L('gün', 'days')}</span><span className="tnum font-medium">%{t.discountPct}</span></li>)}</ul>}
      {dlg && <TierDialog onClose={() => setDlg(false)} />}
    </Panel>
  )
}
function TierDialog({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState('')
  const [pct, setPct] = useState('')
  return (
    <Save title={L('Kademe ekle', 'Add tier')} summary={`Süre kademesi ${days}+ gün %${pct}`} onClose={onClose} apply={(x) => { const n = Number(days); const p = Number(pct); if (!(n >= 2) || !(p > 0 && p < 100)) fail('Geçersiz değer: alanları kontrol edin.'); x.settings.tiers = [...x.settings.tiers.filter((t) => t.fromDays !== n), { fromDays: n, discountPct: p }] }}>
      <div className="grid gap-4 sm:grid-cols-2"><TextF id="tr-d" label={L('Gün (en az 2)', 'Days (min 2)')} value={days} onChange={(v) => setDays(v.replace(/\D/g, ''))} /><TextF id="tr-p" label={L('İndirim (%)', 'Discount (%)')} value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} /></div>
    </Save>
  )
}

function Agreements({ edit }: { edit: boolean }) {
  const d = useDb()
  const [dlg, setDlg] = useState<CorporateAgreement | null>(null)
  return (
    <Panel title={L('Kurumsal anlaşmalar', 'Corporate agreements')} description={L('Anlaşma, geçerlilik tarihi içinde indirim ve sınıf bazlı özel tarife uygular.', 'An agreement applies a discount and class-specific rates within its validity dates.')} flush>
      <ul className="divide-y divide-line-soft">{d.agreements.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]"><span><span className="font-medium">{a.name}</span><span className="block text-[12.5px] text-ink-2">%{a.discountPct} · {a.validFrom} → {a.validTo} · {a.active ? L('aktif', 'active') : L('pasif', 'inactive')} · {a.classOverrides.length} {L('özel tarife', 'class rate(s)')}</span></span>{edit && <button type="button" className={btnSmall} onClick={() => setDlg(a)}>{L('Düzenle', 'Edit')}</button>}</li>)}</ul>
      {dlg && (
        <AgreementDialog a={dlg} onClose={() => setDlg(null)} />
      )}
    </Panel>
  )
}
function AgreementDialog({ a, onClose }: { a: CorporateAgreement; onClose: () => void }) {
  const [pct, setPct] = useState(String(a.discountPct))
  const [to, setTo] = useState(a.validTo)
  const [active, setActive] = useState(a.active)
  return (
    <Save title={a.name} summary={`Anlaşma ${a.name}`} onClose={onClose} apply={(x) => { const p = Number(pct); if (!(p >= 0 && p <= 60)) fail('Geçersiz değer: alanları kontrol edin.'); Object.assign(x.agreements.find((y) => y.id === a.id)!, { discountPct: p, validTo: to, active }) }}>
      <TextF id="ag-p" label={L('İndirim (%)', 'Discount (%)')} value={pct} onChange={(v) => setPct(v.replace(/[^\d.]/g, ''))} />
      <DateF id="ag-t" label={L('Geçerlilik sonu', 'Valid until')} value={to} onChange={setTo} />
      <CheckF id="ag-a" checked={active} onChange={setActive}>{L('Aktif', 'Active')}</CheckF>
    </Save>
  )
}

function Extras({ edit, curs }: { edit: boolean; curs: Cur[] }) {
  const d = useDb()
  const [dlg, setDlg] = useState<Extra | null>(null)
  return (
    <Panel title={L('Ekstralar', 'Extras')} description={L('Her para birimi için ayrı fiyat satırı; boş = o para biriminde satılmaz.', 'A price row per currency; empty = not sold in that currency.')} flush>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[13.5px]">
        <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-5 py-2 font-medium">{L('Ekstra', 'Extra')}</th><th className="px-3 py-2 font-medium">{L('Birim', 'Per')}</th>{curs.map((c) => <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>)}<th className="px-5 py-2" /></tr></thead>
        <tbody className="divide-y divide-line-soft">{d.extras.map((e) => <tr key={e.id}><td className="px-5 py-2.5 font-medium">{e.name}</td><td className="px-3 py-2.5">{e.kind === 'per_day' ? L('gün', 'day') : L('kiralama', 'rental')}</td>{curs.map((c) => <td key={c} className="tnum px-3 py-2.5 text-right">{e.prices[c] !== undefined ? fmt(e.prices[c]!, c) : <span className="text-ink-3">—</span>}</td>)}<td className="px-5 py-2.5 text-right">{edit && <button type="button" className={btnSmall} onClick={() => setDlg(e)}>{L('Düzenle', 'Edit')}</button>}</td></tr>)}</tbody>
      </table></div>
      {dlg && <ExtraDialog e={dlg} curs={curs} onClose={() => setDlg(null)} />}
    </Panel>
  )
}
function ExtraDialog({ e, curs, onClose }: { e: Extra; curs: Cur[]; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(curs.map((c) => [c, e.prices[c] !== undefined ? toInput(e.prices[c]!, c) : ''])))
  const [active, setActive] = useState(e.active)
  return (
    <Save title={e.name} summary={`Ekstra ${e.name}`} onClose={onClose} apply={(x) => { const t = x.extras.find((y) => y.id === e.id)!; for (const c of curs) { const v = vals[c]!.trim(); if (v === '') delete t.prices[c]; else { const m = parseAmount(v, c); if (m === null || m < 0) fail('Geçersiz değer: alanları kontrol edin.'); t.prices[c] = m! } } t.active = active }}>
      <div className="grid gap-4 sm:grid-cols-2">{curs.map((c) => <TextF key={c} id={`ex-${c}`} label={`${L('Fiyat', 'Price')} (${c})`} value={vals[c]!} onChange={(v) => setVals((s) => ({ ...s, [c]: v }))} />)}</div>
      <CheckF id="ex-a" checked={active} onChange={setActive}>{L('Aktif', 'Active')}</CheckF>
    </Save>
  )
}

function Coverage({ edit, curs }: { edit: boolean; curs: Cur[] }) {
  const d = useDb()
  const [dlg, setDlg] = useState<InsurancePackage | null>(null)
  return (
    <Panel title={L('Sigorta paketleri', 'Coverage packages')} description={L('Günlük bedel, muafiyet ve depozito etkisi para birimi başına ayrı satırdır.', 'Daily price, excess and deposit effect are separate rows per currency.')} flush>
      <ul className="divide-y divide-line-soft">
        {d.insurance.map((p) => (
          <li key={p.id} className="space-y-1 px-5 py-3 text-[13.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{p.name} <span className="text-ink-2">({p.code})</span></span>{edit && <button type="button" className={btnSmall} onClick={() => setDlg(p)}>{L('Düzenle', 'Edit')}</button>}</div>
            <p className="text-[12.5px] text-ink-2">{p.coverage}</p>
            <p className="tnum text-[12.5px]">{curs.filter((c) => p.dailyPrice[c] !== undefined).map((c) => `${fmt(p.dailyPrice[c]!, c)}/${L('gün', 'day')} · ${L('muafiyet', 'excess')} ${fmt(p.deductible[c] ?? 0, c)}`).join('  |  ') || L('Fiyat satırı yok', 'No price rows')}</p>
          </li>
        ))}
      </ul>
      {dlg && <CoverageDialog p={dlg} curs={curs} onClose={() => setDlg(null)} />}
    </Panel>
  )
}
function CoverageDialog({ p, curs, onClose }: { p: InsurancePackage; curs: Cur[]; onClose: () => void }) {
  const [daily, setDaily] = useState<Record<string, string>>(Object.fromEntries(curs.map((c) => [c, p.dailyPrice[c] !== undefined ? toInput(p.dailyPrice[c]!, c) : ''])))
  const [ded, setDed] = useState<Record<string, string>>(Object.fromEntries(curs.map((c) => [c, p.deductible[c] !== undefined ? toInput(p.deductible[c]!, c) : ''])))
  return (
    <Save title={p.name} summary={`Sigorta ${p.name}`} onClose={onClose} apply={(x) => { const t = x.insurance.find((y) => y.id === p.id)!; for (const c of curs) { for (const [rec, src] of [[t.dailyPrice, daily], [t.deductible, ded]] as const) { const v = src[c]!.trim(); if (v === '') delete rec[c]; else { const m = parseAmount(v, c); if (m === null || m < 0) fail('Geçersiz değer: alanları kontrol edin.'); rec[c] = m! } } } }}>
      {curs.map((c) => <div key={c} className="grid gap-4 sm:grid-cols-2"><TextF id={`cv-d-${c}`} label={`${L('Günlük', 'Daily')} (${c})`} value={daily[c]!} onChange={(v) => setDaily((s) => ({ ...s, [c]: v }))} /><TextF id={`cv-m-${c}`} label={`${L('Muafiyet', 'Excess')} (${c})`} value={ded[c]!} onChange={(v) => setDed((s) => ({ ...s, [c]: v }))} /></div>)}
    </Save>
  )
}

function Tax({ edit }: { edit: boolean }) {
  const d = useDb()
  const [dlg, setDlg] = useState<string | null>(null)
  return (
    <Panel title={L('Vergi kuralları', 'Tax rules')} description={L('Fiyatlar vergi dahil veya hariç hesaplanır; her fiyat sürümü hangi kuralı kullandığını saklar. Örnek oranlar yasal tavsiye değildir.', 'Prices are computed tax-inclusive or exclusive; each price version stores the rule it used. Sample rates are not tax advice.')} flush>
      <ul className="divide-y divide-line-soft">{d.taxRules.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]"><span><span className="font-medium">{t.name}</span>{d.settings.defaultTaxId === t.id && <span className="ml-2 rounded bg-blue-soft px-1.5 py-0.5 text-[11px] font-medium text-blue-ink">{L('Varsayılan', 'Default')}</span>}<span className="block text-[12.5px] text-ink-2">%{t.ratePct} · {t.mode === 'inclusive' ? L('dahil', 'inclusive') : L('hariç', 'exclusive')} · {t.country}</span></span>{edit && d.settings.defaultTaxId !== t.id && <button type="button" className={btnSmall} onClick={() => setDlg(t.id)}>{L('Varsayılan yap', 'Make default')}</button>}</li>)}</ul>
      {dlg && <Save title={L('Varsayılan vergi kuralı', 'Default tax rule')} summary={`Varsayılan vergi ${d.taxRules.find((t) => t.id === dlg)?.name}`} onClose={() => setDlg(null)} apply={(x) => { x.settings.defaultTaxId = dlg }}><p className="text-[13.5px]">{L('Yeni fiyatlar bu vergi kuralıyla hesaplanır.', 'New prices are calculated with this tax rule.')}</p></Save>}
    </Panel>
  )
}

function Simulation() {
  const d = useDb()
  const f = useFmt()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [cur, setCur] = useState<Cur>(d.settings.company.baseCurrency)
  const [branch, setBranch] = useState(d.branches[0]!.id)
  const [from, setFrom] = useState(zonedIso(addDaysYmd(today, 7), '10:00', tz))
  const [to, setTo] = useState(zonedIso(addDaysYmd(today, 12), '10:00', tz))
  const [ins, setIns] = useState('')
  const [corp, setCorp] = useState('')
  const price: PriceSnapshot | null = Date.parse(to) > Date.parse(from) ? priceQuote(d, { classId: cls, from, to, pickupBranchId: branch, returnBranchId: branch, currency: cur, extras: [], insuranceId: ins || undefined, corporateId: corp || undefined }, d.clock.now, 'sim') : null
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Panel title={L('Simülasyon', 'Simulation')} description={L('Kayıt oluşturmaz; yalnız güncel fiyat listesiyle hesaplar.', 'Creates nothing; calculates with the current price list only.')}>
        <div className="space-y-4">
          <SelectF id="sm-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
          <div className="grid gap-4 sm:grid-cols-2"><SelectF id="sm-m" label={L('Para birimi', 'Currency')} value={cur} onChange={(v) => { setCur(v); setIns('') }} options={d.settings.acceptedCurrencies.map((c) => ({ id: c, label: c }))} /><SelectF id="sm-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d)} /></div>
          <DateTimeF id="sm-f" label={L('Teslim', 'Pickup')} value={from} onChange={setFrom} tz={f.zone(branch)} />
          <DateTimeF id="sm-t" label={L('İade', 'Return')} value={to} onChange={setTo} tz={f.zone(branch)} />
          <SelectF id="sm-i" label={L('Sigorta', 'Coverage')} value={ins} onChange={setIns} placeholder={L('Paket yok', 'None')} options={d.insurance.filter((p) => p.active && p.dailyPrice[cur] !== undefined).map((p) => ({ id: p.id, label: p.name }))} />
          <SelectF id="sm-k" label={L('Kurumsal hesap', 'Corporate account')} value={corp} onChange={setCorp} placeholder={L('Bireysel', 'Individual')} options={d.corporates.map((c) => ({ id: c.id, label: c.name }))} />
        </div>
      </Panel>
      <Panel title={L('Sonuç', 'Result')}>{price ? <PriceBreakdown price={price} /> : <Empty title={L('İade, tesliminden sonra olmalı', 'Return must be after pickup')} />}</Panel>
    </div>
  )
}
