import { Plus } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { fmt } from '../../core/money'
import { acceptQuoteToReservation, addLeadReminder, createLead, createQuote, doneLeadReminder, rejectQuote, setLeadStatus } from '../../core/ops/commercial'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import type { Lead, Quote } from '../../core/types'
import { L } from '../../i18n'
import { userName } from '../../core/helpers'
import { AreaF, DateTimeF, SelectF, TextF, branchOptions, classOptions, userOptions } from '../../ui/forms'
import { PriceBreakdown } from '../../ui/domain'
import { runAction, useBranchScope, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Notice, Page, SearchBox, Status, Tabs } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'

const SOURCE = () => ({ web_form: L('Web formu', 'Web form'), phone: L('Telefon', 'Phone'), partner: L('Partner', 'Partner'), walk_in: L('Şubede', 'Walk-in'), referral: L('Tavsiye', 'Referral') })

export function LeadsPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const sources = SOURCE()
  const [tab, setTab] = useUrlState('sekme', 'talepler')
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const leads = d.leads.filter((l) => active.includes(l.branchId))
  const rows = leads
    .filter((l) => (status === 'all' ? true : l.status === status))
    .filter((l) => !q || `${l.no} ${l.name} ${l.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const quotes = d.quotes.filter((x) => leads.some((l) => l.id === x.leadId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const leadCols: Col<Lead>[] = [
    { id: 'no', header: L('Talep', 'Lead'), cell: (l) => <span className="tnum whitespace-nowrap font-medium text-blue">{l.no}</span>, sort: (l) => l.no, csv: (l) => l.no },
    { id: 'name', header: L('Kişi', 'Contact'), cell: (l) => <span className="font-medium">{l.name}</span>, csv: (l) => l.name },
    { id: 'src', header: L('Kaynak', 'Source'), cell: (l) => sources[l.source], hideBelow: 'md', csv: (l) => l.source },
    { id: 'cls', header: L('İstenen', 'Requested'), cell: (l) => `${d.classes.find((c) => c.id === l.classId)?.name} · ${f.date(l.from, l.branchId)}`, hideBelow: 'lg' },
    { id: 'own', header: L('Sorumlu', 'Owner'), cell: (l) => userName(d, l.ownerId), hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (l) => <Status kind="lead" value={l.status} />, sort: (l) => l.status, csv: (l) => l.status },
  ]
  const quoteCols: Col<Quote>[] = [
    { id: 'no', header: L('Teklif', 'Quote'), cell: (x) => <span className="tnum whitespace-nowrap font-medium text-blue">{x.no} · v{x.version}</span>, sort: (x) => x.no, csv: (x) => x.no },
    { id: 'lead', header: L('Talep', 'Lead'), cell: (x) => d.leads.find((l) => l.id === x.leadId)?.name, hideBelow: 'md' },
    { id: 'amt', header: L('Tutar', 'Amount'), align: 'right', cell: (x) => <span className="tnum">{fmt(x.price.grossMinor, x.price.cur)}</span>, csv: (x) => x.price.grossMinor },
    { id: 'valid', header: L('Geçerlilik', 'Valid until'), cell: (x) => <span className="tnum">{f.date(x.validUntil)}</span>, hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (x) => <Status kind="quote" value={x.status} />, csv: (x) => x.status },
  ]
  const quoteSel = d.quotes.find((x) => x.id === sel)
  const leadSel = d.leads.find((l) => l.id === sel) ?? (quoteSel ? d.leads.find((l) => l.id === quoteSel.leadId) : undefined)
  return (
    <Page
      title={L('Talep Merkezi', 'Lead Center')}
      description={L('Talep, teklif, rezervasyon ve kiralama dört ayrı kayıttır. Kabul edilen teklif bekleyen bir rezervasyon üretir; talep tek başına gelir veya komisyon doğurmaz.', 'Lead, quote, reservation and rental are four separate records. An accepted quote produces a pending reservation; a lead alone creates no revenue or commission.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => (tab === 'teklifler' ? downloadCsv('teklifler', quoteCols, quotes) : downloadCsv('talepler', leadCols, rows))}>CSV</button>
          {can('leads:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Yeni talep', 'New lead')}</button>}
        </>
      }
    >
      <Kpis items={[{ label: L('Yeni', 'New'), value: leads.filter((l) => l.status === 'new').length, tone: leads.some((l) => l.status === 'new') ? 'hold' : undefined }, { label: L('Teklif verildi', 'Quoted'), value: leads.filter((l) => l.status === 'quoted').length }, { label: L('Rezervasyona döndü', 'Converted'), value: leads.filter((l) => l.status === 'converted').length }, { label: L('Kaybedilen', 'Lost'), value: leads.filter((l) => l.status === 'lost').length }]} />
      <Tabs tabs={[{ id: 'talepler', label: L('Talepler', 'Leads'), count: leads.length }, { id: 'teklifler', label: L('Teklifler', 'Quotes'), count: quotes.length }]} value={tab as 'talepler' | 'teklifler'} onChange={setTab} label={L('Talep Merkezi bölümleri', 'Lead Center sections')} />
      {tab === 'teklifler' ? (
        <DataTable rows={quotes} cols={quoteCols} rowKey={(x) => x.id} label={L('Teklif listesi', 'Quote list')} urlKey="tk" onRowClick={(x) => setSel(x.id)} empty={<Empty title={L('Teklif yok', 'No quotes')} />} />
      ) : (
        <>
          <FilterBar onReset={() => { setQ(''); setStatus('all') }} active={q !== '' || status !== 'all'}>
            <SearchBox label={L('Taleplerde ara', 'Search leads')} placeholder={L('Talep, ad, e-posta…', 'Lead, name, email…')} value={q} onChange={setQ} />
            <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'new', label: L('Yeni', 'New') }, { id: 'contacted', label: L('Görüşüldü', 'Contacted') }, { id: 'quoted', label: L('Teklif verildi', 'Quoted') }, { id: 'converted', label: L('Rezervasyona döndü', 'Converted') }, { id: 'lost', label: L('Kayıp', 'Lost') }]} />
          </FilterBar>
          <DataTable rows={rows} cols={leadCols} rowKey={(l) => l.id} label={L('Talep listesi', 'Lead list')} urlKey="tl" defaultSort={{ id: 'no', dir: 'desc' }} onRowClick={(l) => setSel(l.id)} empty={<Empty title={L('Bu filtrelerle talep yok', 'No leads match')} />} />
        </>
      )}
      {adding && <NewLeadDialog onClose={() => setAdding(false)} onCreated={(id) => setSel(id)} />}
      {leadSel && <LeadDrawer l={leadSel} focusQuote={quoteSel?.id} onClose={() => setSel('')} />}
    </Page>
  )
}

function LeadDrawer({ l, focusQuote, onClose }: { l: Lead; focusQuote?: string; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'quote' | 'lost' | 'reminder'>(null)
  const quotes = d.quotes.filter((q) => q.leadId === l.id).sort((a, b) => b.version - a.version)
  const manage = can('leads:manage')
  const sources = SOURCE()
  const closed = l.status === 'converted' || l.status === 'lost'
  return (
    <RecordDrawer title={l.no} subtitle={l.name} onClose={onClose} error={error}>
      <Facts single rows={[
        [L('Durum', 'Status'), <Status key="s" kind="lead" value={l.status} />],
        [L('Kaynak', 'Source'), sources[l.source]],
        [L('Telefon / e-posta', 'Phone / email'), `${l.phone} · ${l.email || '—'}`],
        [L('İstenen', 'Requested'), `${d.classes.find((c) => c.id === l.classId)?.name} · ${f.date(l.from, l.branchId)} → ${f.date(l.to, l.branchId)}`],
        [L('Şube', 'Branch'), d.branches.find((b) => b.id === l.branchId)?.name],
        [L('Sorumlu', 'Owner'), userName(d, l.ownerId)],
        [L('Müşteri kaydı', 'Customer record'), l.customerId ? <Link2 key="c" type="customer" id={l.customerId}>{d.customers.find((c) => c.id === l.customerId)?.name}</Link2> : L('Henüz yok', 'None yet')],
        [L('Rezervasyon', 'Reservation'), l.reservationId ? <Link2 key="r" type="reservation" id={l.reservationId}>{d.reservations.find((r) => r.id === l.reservationId)?.no}</Link2> : '—'],
        [L('Not', 'Note'), l.notes || '—'],
        ...(l.lostReason ? [[L('Kayıp nedeni', 'Lost reason'), l.lostReason] as [string, string]] : []),
      ]} />
      {manage && !closed && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {l.status === 'new' && <ActBtn onClick={() => act((s) => setLeadStatus(s, l.id, 'contacted'), L('Görüşüldü olarak işaretlendi (mesaj gönderilmedi).', 'Marked as contacted (no message was sent).'))}>{L('Görüşüldü', 'Mark contacted')}</ActBtn>}
            <ActBtn onClick={() => setDlg('quote')}>{quotes.length ? L('Yeni teklif sürümü', 'New quote version') : L('Teklif hazırla', 'Prepare quote')}</ActBtn>
            <ActBtn onClick={() => setDlg('reminder')}>{L('Hatırlatma ekle', 'Add reminder')}</ActBtn>
            <ActBtn onClick={() => setDlg('lost')}>{L('Kaybedildi', 'Mark lost')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={`${L('Teklifler', 'Quotes')} (${quotes.length})`}>
        {quotes.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Teklif yok.', 'No quotes.')}</p> : (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li key={q.id} className={`rounded-lg border p-3 ${q.id === focusQuote ? 'border-blue' : 'border-line'}`}>
                <div className="flex items-center justify-between gap-2 text-[13.5px]"><span className="tnum font-medium">{q.no} · v{q.version}</span><Status kind="quote" value={q.status} /></div>
                <p className="tnum mt-1 text-[16px] font-semibold">{fmt(q.price.grossMinor, q.price.cur)}</p>
                <p className="text-[12.5px] text-ink-2">{L('Geçerlilik', 'Valid until')} {f.date(q.validUntil)} · {f.date(q.from, l.branchId)} → {f.date(q.to, l.branchId)}</p>
                {q.id === focusQuote && <div className="mt-2"><PriceBreakdown price={q.price} compact /></div>}
                {q.status === 'sent' && manage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActBtn onClick={() => { const r = act((s) => acceptQuoteToReservation(s, q.id), L('Teklif kabul edildi: bekleyen rezervasyon oluştu.', 'Quote accepted: a pending reservation was created.')); if (r.ok) void navigate({ to: `/rezervasyonlar/${r.value}` as never }) }}>{L('Kabul et → rezervasyon', 'Accept → reservation')}</ActBtn>
                    <ActBtn onClick={() => act((s) => rejectQuote(s, q.id), L('Teklif reddedildi.', 'Quote rejected.'))}>{L('Reddedildi', 'Rejected')}</ActBtn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-ink-3">{L('Teklif gönderimi demo’da simüle edilir: e-posta veya mesaj gitmez.', 'Sending a quote is simulated in the demo: no email or message is sent.')}</p>
      </DrawerSection>
      <DrawerSection title={L('Hatırlatmalar', 'Reminders')}>
        {l.reminders.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Hatırlatma yok.', 'No reminders.')}</p> : (
          <ul className="divide-y divide-line-soft text-[13.5px]">
            {l.reminders.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-2"><span className={r.done ? 'text-ink-3 line-through' : ''}>{f.dt(r.at, l.branchId)} · {r.text}</span>{!r.done && manage && <ActBtn onClick={() => act((s) => doneLeadReminder(s, l.id, r.id))}>{L('Tamam', 'Done')}</ActBtn>}</li>)}
          </ul>
        )}
      </DrawerSection>
      {l.status === 'converted' && <Notice tone="ok">{L('Bu talep rezervasyona dönüştü; devamı Rezervasyonlar ekranında yürür.', 'This lead became a reservation; the rest continues in Reservations.')}</Notice>}
      {dlg === 'quote' && <QuoteDialog l={l} onClose={() => setDlg(null)} />}
      {dlg === 'lost' && <PromptDialog title={L('Talebi kayıp işaretle', 'Mark lead as lost')} description={L('Kayıp nedeni raporlarda kullanılır.', 'The lost reason is used in reports.')} label={L('Kayıp nedeni', 'Lost reason')} confirm={L('Kaydet', 'Save')} danger rows={2} run={(t) => act((s) => setLeadStatus(s, l.id, 'lost', t), L('Talep kayıp olarak işaretlendi.', 'Lead marked as lost.')) as never} onClose={() => setDlg(null)} />}
      {dlg === 'reminder' && <ReminderDialog l={l} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function ReminderDialog({ l, onClose }: { l: Lead; onClose: () => void }) {
  const f = useFmt()
  const d = useDb()
  const tz = f.zone(l.branchId)
  const [at, setAt] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 1), '10:00', tz))
  const [text, setText] = useState('')
  return (
    <FinanceDialog title={L('Hatırlatma', 'Reminder')} description={L('Uygulama içi hatırlatma; e-posta veya SMS gönderilmez.', 'In-app reminder; no email or SMS is sent.')} confirm={L('Ekle', 'Add')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => addLeadReminder(s, l.id, at, text), L('Hatırlatma eklendi.', 'Reminder added.')); if (!r.ok) return r.error; onClose() }}>
      <DateTimeF id="rm-a" label={L('Zaman', 'Time')} value={at} onChange={setAt} tz={tz} />
      <TextF id="rm-t" label={L('Metin', 'Text')} required value={text} onChange={setText} />
    </FinanceDialog>
  )
}

function QuoteDialog({ l, onClose }: { l: Lead; onClose: () => void }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone(l.branchId)
  const [cls, setCls] = useState(l.classId)
  const [from, setFrom] = useState(l.from)
  const [to, setTo] = useState(l.to)
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [ins, setIns] = useState('')
  const [valid, setValid] = useState(zonedIso(addDaysYmd(dayOf(d.clock.now, tz), 7), '23:59', tz))
  const [note, setNote] = useState('')
  return (
    <FinanceDialog title={L('Teklif hazırla', 'Prepare quote')} description={L('Fiyat, güncel fiyat listesinden hesaplanır ve bu teklif sürümüne dondurulur. Önceki gönderilmiş sürüm "yerine geçildi" olur, silinmez.', 'The price is calculated from the current price list and frozen on this quote version. The previous sent version becomes "superseded", not deleted.')} confirm={L('Teklifi oluştur', 'Create quote')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => createQuote(s, l.id, { classId: cls, from, to, insuranceId: ins || undefined, extras: [], currency: cur, validUntil: valid, note }), L('Teklif oluşturuldu (gönderim simüle).', 'Quote created (sending simulated).')); if (!r.ok) return r.error; onClose() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectF id="qt-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
        <SelectF id="qt-m" label={L('Para birimi', 'Currency')} value={cur} onChange={setCur} options={d.settings.acceptedCurrencies.map((c) => ({ id: c, label: c }))} />
        <DateTimeF id="qt-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={tz} />
        <DateTimeF id="qt-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={tz} />
      </div>
      <SelectF id="qt-i" label={L('Sigorta paketi', 'Coverage package')} value={ins} onChange={setIns} placeholder={L('Paket yok', 'No package')} options={d.insurance.filter((p) => p.active && p.dailyPrice[cur] !== undefined).map((p) => ({ id: p.id, label: p.name }))} />
      <DateTimeF id="qt-v" label={L('Geçerlilik sonu', 'Valid until')} value={valid} onChange={setValid} tz={tz} />
      <AreaF id="qt-n" label={L('Not', 'Note')} value={note} onChange={setNote} rows={2} />
    </FinanceDialog>
  )
}

function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const d = useDb()
  const me = useMe()
  const { active } = useBranchScope()
  const f = useFmt()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<Lead['source']>('phone')
  const [cls, setCls] = useState(d.classes[0]!.id)
  const [branch, setBranch] = useState(active[0] ?? d.branches[0]!.id)
  const [from, setFrom] = useState(zonedIso(addDaysYmd(today, 7), '10:00', f.zone(active[0])))
  const [to, setTo] = useState(zonedIso(addDaysYmd(today, 10), '10:00', f.zone(active[0])))
  const [owner, setOwner] = useState(me.id)
  const [notes, setNotes] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const sources = SOURCE()
  return (
    <FinanceDialog title={L('Yeni talep', 'New lead')} description={L('Talep henüz bir müşteri veya rezervasyon değildir; teklif kabul edilince müşteri kaydı ve bekleyen rezervasyon oluşur.', 'A lead is not yet a customer or reservation; accepting a quote creates the customer record and a pending reservation.')} confirm={L('Talebi kaydet', 'Save lead')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => createLead(s, { source, name, phone, email, classId: cls, from, to, branchId: branch, ownerId: owner, notes }), L('Talep kaydedildi.', 'Lead saved.')); if (!r.ok) { setFields(r.fields); return r.error } onCreated(r.value.id); onClose() }}>
      <TextF id="ln-n" label={L('Ad soyad', 'Full name')} required value={name} onChange={setName} error={fields.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextF id="ln-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} />
        <TextF id="ln-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} />
        <SelectF id="ln-s" label={L('Kaynak', 'Source')} value={source} onChange={(v) => setSource(v as Lead['source'])} options={Object.entries(sources).filter(([k]) => k !== 'partner').map(([id, label]) => ({ id, label }))} />
        <SelectF id="ln-o" label={L('Sorumlu', 'Owner')} value={owner} onChange={setOwner} options={userOptions(d)} />
        <SelectF id="ln-c" label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={classOptions(d)} />
        <SelectF id="ln-b" label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={branchOptions(d, active)} />
        <DateTimeF id="ln-f" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={f.zone(branch)} />
        <DateTimeF id="ln-t" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={f.zone(branch)} error={fields.to} />
      </div>
      <AreaF id="ln-x" label={L('Not', 'Note')} value={notes} onChange={setNotes} rows={2} />
    </FinanceDialog>
  )
}
