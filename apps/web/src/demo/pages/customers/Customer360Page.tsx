import { CaretDown } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { rentalFinance } from '../../core/calc/finance'
import { customerDocChecks, DOC_LABEL, evaluateDriverEligibility } from '../../core/calc/policy'
import { userName } from '../../core/helpers'
import { fmt, sumByCur } from '../../core/money'
import { addContactLog, addCustomerDocument, addCustomerNote, addRestriction, closeGdprRequest, completeFollowUp, createGdprRequest, mergeCustomers, mergePreview, removeRestriction, updateCustomer } from '../../core/ops/commercial'
import { addDaysYmd, dayOf } from '../../core/time'
import type { Customer } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, CheckF, ComboF, DateF, SelectF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { useMasker } from '../../ui/privacy'
import { BackLink, btnPrimary, btnSecondary, btnSmall, Empty, Facts, FinanceDialog, Kpis, Link2, Notice, Page, Panel, Status, Tabs } from '../../ui/kit'
import { byCurText } from '../fleet/common'
import { docStateOf } from './CustomersPage'

const menuItem = 'flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-ink-2 outline-none data-[highlighted]:bg-ground data-[highlighted]:text-ink'
type TabId = 'ozet' | 'kayitlar' | 'belgeler' | 'iletisim' | 'finans' | 'gizlilik'

export function Customer360Page() {
  const { id } = useParams({ strict: false }) as { id: string }
  const d = useDb()
  const c = d.customers.find((x) => x.id === id)
  if (!c)
    return (
      <div className="space-y-4">
        <BackLink to="/musteriler" label={L('Müşteriler', 'Customers')} />
        <Empty title={L('Müşteri bulunamadı', 'Customer not found')} action={<Link to={'/musteriler' as never} className={btnSecondary}>{L('Listeye dön', 'Back to list')}</Link>} />
      </div>
    )
  return <Detail c={c} />
}

function Detail({ c }: { c: Customer }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const mask = useMasker()
  const [tab, setTab] = useUrlState('sekme', 'ozet')
  const [dlg, setDlg] = useState<null | 'restrict' | 'note' | 'doc' | 'contact' | 'gdpr' | 'merge' | 'edit'>(null)
  const rentals = d.rentals.filter((r) => r.customerId === c.id || r.drivers.some((x) => x.customerId === c.id)).sort((a, b) => b.plannedPickupAt.localeCompare(a.plannedPickupAt))
  const reservations = d.reservations.filter((r) => r.customerId === c.id).sort((a, b) => b.pickupAt.localeCompare(a.pickupAt))
  const corp = d.corporates.find((x) => x.id === c.corporateId)
  const docs = customerDocChecks(d, c, d.clock.now)
  const elig = evaluateDriverEligibility(d, c, d.clock.now, d.clock.now)
  const owed = sumByCur(rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)), (r) => ({ minor: rentalFinance(d, r.id).outstandingMinor, cur: r.currency }))
  const manage = can('customers:manage')
  const age = elig.age
  return (
    <div className="space-y-4">
      <BackLink to="/musteriler" label={L('Müşteriler', 'Customers')} />
      <Page
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="tnum">{c.no}</span>
            <Status kind="doc" value={docStateOf(d, c)} />
            {c.restrictions.length > 0 && <span className="rounded border border-hold/40 bg-hold-soft px-2 py-0.5 text-[12px] font-medium text-hold">{c.restrictions.length} {L('kısıt', 'restriction(s)')}</span>}
            {c.archived && <span className="rounded border border-line px-2 py-0.5 text-[12px] text-ink-2">{L('Arşivlendi', 'Archived')}</span>}
            <span>{c.country} · {c.residency === 'foreign' ? L('yabancı', 'foreign') : L('yerli', 'local')} · {age} {L('yaş', 'yrs')}</span>
          </span>
        }
        actions={
          <>
            {can('reservations:manage') && !c.archived && <Link to={`/rezervasyonlar/yeni?musteri=${c.id}` as never} className={btnPrimary}>{L('Rezervasyon oluştur', 'Create reservation')}</Link>}
            {can('rentals:manage') && !c.archived && <Link to={`/kiralamalar/yeni?musteri=${c.id}` as never} className={btnSecondary}>{L('Kiralama hazırla', 'Prepare rental')}</Link>}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className={cn(btnSecondary, 'gap-1.5')}>{L('Diğer işlemler', 'More actions')} <CaretDown size={12} /></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[230px] rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
                  {manage && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('edit')}>{L('İletişim bilgilerini düzenle', 'Edit contact details')}</DropdownMenu.Item>}
                  {manage && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('restrict')}>{L('Kısıtlama ekle', 'Add restriction')}</DropdownMenu.Item>}
                  {manage && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('merge')}>{L('Başka kayıtla birleştir', 'Merge with another record')}</DropdownMenu.Item>}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        }
      >
        {c.restrictions.map((r) => (
          <Notice key={r.id} tone="hold" action={manage ? <button type="button" className={btnSmall} onClick={() => runAction((s) => removeRestriction(s, c.id, r.id), L('Kısıtlama kaldırıldı.', 'Restriction removed.'))}>{L('Kaldır', 'Remove')}</button> : undefined}>
            <span className="font-medium">{r.label}</span> — {r.reason} <span className="text-ink-2">({userName(d, r.by)}, {f.date(r.at)})</span>
          </Notice>
        ))}
        <Tabs<TabId>
          label={L('Müşteri bölümleri', 'Customer sections')}
          value={tab as TabId}
          onChange={setTab}
          tabs={[
            { id: 'ozet', label: L('Özet', 'Overview') },
            { id: 'kayitlar', label: L('Rezervasyon ve kiralamalar', 'Reservations and rentals'), count: reservations.length + rentals.length },
            { id: 'belgeler', label: L('Belgeler', 'Documents'), count: docs.filter((x) => x.state !== 'valid').length || undefined },
            { id: 'iletisim', label: L('Notlar ve iletişim', 'Notes and contact'), count: c.notes.length + c.contacts.length },
            { id: 'finans', label: L('Finans', 'Finance'), hidden: !can('finance:view') },
            { id: 'gizlilik', label: L('Kişisel veri', 'Privacy') },
          ]}
        />

        {tab === 'ozet' && (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel title={L('Kişi', 'Person')}>
              <Facts single rows={[
                [L('Telefon', 'Phone'), <span key="p" className="tnum">{mask.phone(c.phone)}</span>],
                [L('E-posta', 'Email'), mask.email(c.email) || '—'],
                [L('Doğum tarihi', 'Date of birth'), mask.masked ? '••••-••-••' : c.dob],
                [L('Dil', 'Language'), c.language.toUpperCase()],
                [L('İletişim tercihi', 'Contact preference'), { phone: L('Telefon', 'Phone'), email: L('E-posta', 'Email'), none: L('Aranmasın', 'Do not contact') }[c.contactPref]],
                [L('Kurumsal hesap', 'Corporate account'), corp ? <Link2 key="k" type="corporate" id={corp.id}>{corp.name}</Link2> : L('Bireysel', 'Individual')],
              ]} />
              {mask.masked && <p className="mt-2 text-[12.5px] text-ink-2">{L('Bu rolde iletişim bilgileri kısmen maskelenir (Ayarlar → Gizlilik).', 'In this role contact details are partly masked (Settings → Privacy).')}</p>}
            </Panel>
            <Panel title={L('Sürücü uygunluğu', 'Driver eligibility')} description={L('Ayarlar’daki yaş ve ehliyet kurallarına göre, bugünkü tarihle.', 'By the age and licence rules in Settings, as of today.')}>
              <Facts single rows={[
                [L('Ehliyet alım yılı', 'Licence issued'), `${c.license.issuedYear} (${elig.licenseYears} ${L('yıl', 'yrs')})`],
                [L('Ehliyet geçerlilik', 'Licence valid until'), c.license.validUntil],
                [L('Sonuç', 'Result'), elig.eligible ? <span key="e" className="font-medium text-ok">{L('Uygun', 'Eligible')}{elig.youngDriver ? ` · ${L('genç sürücü ücreti', 'young-driver fee')}` : ''}</span> : <span key="e" className="font-medium text-alert">{elig.reasons.join(' ')}</span>],
              ]} />
            </Panel>
            <Panel title={L('Son kayıtlar', 'Recent records')} className="lg:col-span-2">
              <RecordList c={c} reservations={reservations.slice(0, 4)} rentals={rentals.slice(0, 4)} />
            </Panel>
          </div>
        )}
        {tab === 'kayitlar' && <Panel title={L('Rezervasyon ve kiralamalar', 'Reservations and rentals')}><RecordList c={c} reservations={reservations} rentals={rentals} /></Panel>}
        {tab === 'belgeler' && (
          <Panel title={L('Belgeler', 'Documents')} description={L('Demo belgeleri örnektir: dosya veya gerçek kişisel veri içermez.', 'Demo documents are placeholders: no file or real personal data.')} action={can('documents:manage') ? <button type="button" className={btnPrimary} onClick={() => setDlg('doc')}>{L('Belge ekle', 'Add document')}</button> : undefined}>
            <ul className="divide-y divide-line-soft">
              {docs.map((x) => (
                <li key={x.kind} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                  <span><span className="font-medium">{DOC_LABEL[x.kind] ?? x.kind}</span>{x.validUntil && <span className="ml-2 text-ink-2">{L('geçerlilik', 'valid until')} {x.validUntil}</span>}</span>
                  <Status kind="doc" value={x.state} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-2">{L('Zorunlu belgeler ikamet durumuna göre Ayarlar → Belge Politikası’ndan gelir.', 'Required documents come from Settings → Document policy by residency.')}</p>
          </Panel>
        )}
        {tab === 'iletisim' && (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel title={L('Notlar', 'Notes')} action={manage ? <button type="button" className={btnSmall} onClick={() => setDlg('note')}>{L('Not ekle', 'Add note')}</button> : undefined}>
              {c.notes.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Not yok.', 'No notes.')}</p> : <ul className="divide-y divide-line-soft">{c.notes.map((n) => <li key={n.id} className="py-2.5 text-[13.5px]"><p>{n.pinned && <span className="mr-1.5 rounded bg-blue-soft px-1.5 py-0.5 text-[11px] font-medium text-blue-ink">{L('Sabit', 'Pinned')}</span>}{n.text}</p><p className="text-[12px] text-ink-2">{userName(d, n.by)} · {f.dt(n.at)}</p></li>)}</ul>}
            </Panel>
            <Panel title={L('İletişim kayıtları', 'Contact log')} description={L('Elle girilen kayıtlar: ACARVO buradan mesaj göndermez.', 'Manual entries: ACARVO sends nothing from here.')} action={manage ? <button type="button" className={btnSmall} onClick={() => setDlg('contact')}>{L('Kayıt ekle', 'Add entry')}</button> : undefined}>
              {c.contacts.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('İletişim kaydı yok.', 'No contact entries.')}</p> : (
                <ul className="divide-y divide-line-soft">
                  {c.contacts.map((x) => (
                    <li key={x.id} className="py-2.5 text-[13.5px]">
                      <p>{x.summary}</p>
                      <p className="text-[12px] text-ink-2">{x.channel} · {userName(d, x.by)} · {f.dt(x.at)}</p>
                      {x.followUpAt && <p className="mt-1 flex items-center gap-2 text-[12.5px]"><span className={x.followUpDone ? 'text-ink-3 line-through' : 'text-hold'}>{L('Takip', 'Follow-up')}: {f.dt(x.followUpAt)}</span>{!x.followUpDone && manage && <button type="button" className={btnSmall} onClick={() => runAction((s) => completeFollowUp(s, c.id, x.id), L('Takip tamamlandı.', 'Follow-up completed.'))}>{L('Tamamlandı', 'Done')}</button>}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
        {tab === 'finans' && (
          <div className="space-y-5">
            <Kpis items={[{ label: L('Açık bakiye', 'Open balance'), value: byCurText(owed, fmt), hint: L('Para birimi başına', 'Per currency') }, { label: L('Kiralama', 'Rentals'), value: rentals.length }]} />
            <Panel title={L('Kiralama bakiyeleri', 'Rental balances')} flush>
              {rentals.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Kiralama yok.', 'No rentals.')}</p> : (
                <ul className="divide-y divide-line-soft">
                  {rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)).map((r) => {
                    const x = rentalFinance(d, r.id)
                    return <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]"><Link2 type="rental" id={r.id}>{r.no}</Link2><span className="tnum text-ink-2">{fmt(x.chargesMinor, x.cur)} / {fmt(x.appliedMinor, x.cur)}</span><span className={cn('tnum font-medium', x.outstandingMinor === 0 && 'text-ink-3')}>{fmt(x.outstandingMinor, x.cur)}</span></li>
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )}
        {tab === 'gizlilik' && (
          <Panel title={L('Kişisel veri talepleri', 'Privacy requests')} description={L('Erişim, düzeltme ve silme talepleri kaydedilir. Demo’da silme gerçekleşmez: kayıt arşive alınır ve işlem geçmişi korunur.', 'Access, rectification and erasure requests are recorded. In the demo nothing is erased: the record is archived and the audit trail is kept.')} action={manage ? <button type="button" className={btnPrimary} onClick={() => setDlg('gdpr')}>{L('Talep kaydet', 'Record request')}</button> : undefined}>
            {c.gdpr.requests.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Talep yok.', 'No requests.')}</p> : (
              <ul className="divide-y divide-line-soft">
                {c.gdpr.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                    <span>{{ access: L('Erişim', 'Access'), erasure: L('Silme', 'Erasure'), rectification: L('Düzeltme', 'Rectification') }[r.kind]} · {f.dt(r.at)}<span className="block text-[12.5px] text-ink-2">{r.note}</span></span>
                    <span className="flex items-center gap-2"><span className={r.status === 'open' ? 'text-hold' : 'text-ok'}>{r.status === 'open' ? L('Açık', 'Open') : L('Kapandı', 'Closed')}</span>{r.status === 'open' && manage && <button type="button" className={btnSmall} onClick={() => runAction((s) => closeGdprRequest(s, c.id, r.id), L('Talep kapatıldı.', 'Request closed.'))}>{L('Kapat', 'Close')}</button>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </Page>

      {dlg === 'restrict' && <RestrictDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'note' && <NoteDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'doc' && <DocDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'contact' && <ContactDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'gdpr' && <GdprDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'edit' && <EditDialog c={c} onClose={() => setDlg(null)} />}
      {dlg === 'merge' && <MergeDialog c={c} onClose={() => setDlg(null)} onDone={(keep) => void navigate({ to: `/musteriler/${keep}` as never })} />}
    </div>
  )
}

function RecordList({ c, reservations, rentals }: { c: Customer; reservations: ReturnType<typeof useDb>['reservations']; rentals: ReturnType<typeof useDb>['rentals'] }) {
  const f = useFmt()
  const d = useDb()
  if (!reservations.length && !rentals.length) return <p className="text-[13.5px] text-ink-2">{L('Kayıt yok.', 'No records.')}</p>
  return (
    <ul className="divide-y divide-line-soft">
      {rentals.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]"><span><Link2 type="rental" id={r.id}>{r.no}</Link2> · {d.vehicles.find((v) => v.id === r.vehicleId)?.plate} · {f.date(r.plannedPickupAt, r.pickupBranchId)}{r.customerId !== c.id && <span className="ml-1.5 text-ink-2">({L('ek sürücü', 'additional driver')})</span>}</span><Status kind="rental" value={r.status} /></li>)}
      {reservations.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]"><span><Link2 type="reservation" id={r.id}>{r.no}</Link2> · {d.classes.find((x) => x.id === r.classId)?.name} · {f.date(r.pickupAt, r.pickupBranchId)}</span><Status kind="reservation" value={r.status} /></li>)}
    </ul>
  )
}

function RestrictDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Kısıtlama ekle', 'Add restriction')} description={L('Kısıtlama operasyonel bir uyarıdır ve açık gerekçe ister; gizli puan veya kara liste yoktur.', 'A restriction is an operational warning and needs a visible reason; there is no hidden score or blacklist.')} confirm={L('Ekle', 'Add')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => addRestriction(s, c.id, label, reason), L('Kısıtlama eklendi.', 'Restriction added.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <TextF id="rs-l" label={L('Kısıtlama adı', 'Restriction name')} required value={label} onChange={setLabel} />
      <AreaF id="rs-r" label={L('Açık gerekçe (en az 10 karakter)', 'Visible reason (at least 10 characters)')} required value={reason} onChange={setReason} error={fields.reason} rows={3} />
    </FinanceDialog>
  )
}
function NoteDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const [text, setText] = useState('')
  const [pin, setPin] = useState(false)
  return (
    <FinanceDialog title={L('Not ekle', 'Add note')} description={L('Notlar iç kullanım içindir.', 'Notes are for internal use.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => addCustomerNote(s, c.id, text, pin), L('Not eklendi.', 'Note added.')); if (!r.ok) return r.error; onClose() }}>
      <AreaF id="nt-t" label={L('Not', 'Note')} required value={text} onChange={setText} rows={3} />
      <CheckF id="nt-p" checked={pin} onChange={setPin}>{L('Sabitle', 'Pin')}</CheckF>
    </FinanceDialog>
  )
}
function DocDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const d = useDb()
  const need = c.residency === 'foreign' ? d.settings.docs.requireForForeign : d.settings.docs.requireForLocal
  const [kind, setKind] = useState(need[0] ?? 'driving_license')
  const [until, setUntil] = useState(addDaysYmd(dayOf(d.clock.now, d.settings.company.tz), 365 * 3))
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('Belge ekle', 'Add document')} description={L('Demo’da dosya yüklenmez; örnek belge kaydı ve geçerlilik tarihi oluşur. Yeni sürüm eskisinin yerine geçer, eski sürüm saklanır.', 'No file is uploaded in the demo; a placeholder record with a validity date is created. A new version supersedes the old one, which is kept.')} confirm={L('Ekle', 'Add')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => addCustomerDocument(s, c.id, kind, until), L('Belge eklendi (örnek).', 'Document added (placeholder).')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <SelectF id="dc-k" label={L('Belge türü', 'Document type')} value={kind} onChange={setKind} options={Object.entries(DOC_LABEL).filter(([k]) => ['national_id', 'passport', 'driving_license'].includes(k)).map(([id, label]) => ({ id, label }))} />
      <DateF id="dc-u" label={L('Geçerlilik tarihi', 'Valid until')} required value={until} onChange={setUntil} error={fields.validUntil} />
    </FinanceDialog>
  )
}
function ContactDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const d = useDb()
  const [channel, setChannel] = useState<'phone' | 'in_person' | 'email_manual' | 'note'>('phone')
  const [summary, setSummary] = useState('')
  const [follow, setFollow] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={L('İletişim kaydı', 'Contact entry')} description={L('Daha önce ACARVO dışında gerçekleşmiş bir görüşmeyi elle kaydedersiniz. Buradan mesaj gönderilmez.', 'You manually log a conversation that already happened outside ACARVO. Nothing is sent from here.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => addContactLog(s, c.id, channel, summary, follow ? `${follow}T09:00:00.000Z` : undefined), L('İletişim kaydı eklendi.', 'Contact entry added.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <SelectF id="ct-c" label={L('Kanal', 'Channel')} value={channel} onChange={(v) => setChannel(v as typeof channel)} options={[{ id: 'phone', label: L('Telefon', 'Phone') }, { id: 'in_person', label: L('Yüz yüze', 'In person') }, { id: 'email_manual', label: L('E-posta (elle)', 'Email (manual)') }, { id: 'note', label: L('Not', 'Note') }]} />
      <AreaF id="ct-s" label={L('Özet', 'Summary')} required value={summary} onChange={setSummary} error={fields.summary} rows={2} />
      <DateF id="ct-f" label={L('Takip tarihi (isteğe bağlı)', 'Follow-up date (optional)')} value={follow} onChange={setFollow} hint={dayOf(d.clock.now, d.settings.company.tz)} />
    </FinanceDialog>
  )
}
function GdprDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const [kind, setKind] = useState<'access' | 'erasure' | 'rectification'>('access')
  const [note, setNote] = useState('')
  return (
    <FinanceDialog title={L('Kişisel veri talebi', 'Privacy request')} description={L('Talep kaydedilir ve izlenir; silme talebi demo’da kaydı silmez, arşive alma sürecini başlatır.', 'The request is recorded and tracked; an erasure request does not delete in the demo, it starts the archive process.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => createGdprRequest(s, c.id, kind, note), L('Talep kaydedildi.', 'Request recorded.')); if (!r.ok) return r.error; onClose() }}>
      <SelectF id="gd-k" label={L('Talep türü', 'Request type')} value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ id: 'access', label: L('Erişim', 'Access') }, { id: 'rectification', label: L('Düzeltme', 'Rectification') }, { id: 'erasure', label: L('Silme', 'Erasure') }]} />
      <AreaF id="gd-n" label={L('Not', 'Note')} value={note} onChange={setNote} rows={2} />
    </FinanceDialog>
  )
}
function EditDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const [phone, setPhone] = useState(c.phone)
  const [email, setEmail] = useState(c.email)
  const [pref, setPref] = useState(c.contactPref)
  return (
    <FinanceDialog title={L('İletişim bilgileri', 'Contact details')} description={L('Değişiklik işlem geçmişine yazılır.', 'The change is written to the audit log.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => updateCustomer(s, c.id, { phone, email, contactPref: pref }), L('Müşteri güncellendi.', 'Customer updated.')); if (!r.ok) return r.error; onClose() }}>
      <TextF id="ed-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} />
      <TextF id="ed-e" label={L('E-posta', 'Email')} value={email} onChange={setEmail} />
      <SelectF id="ed-c" label={L('İletişim tercihi', 'Contact preference')} value={pref} onChange={(v) => setPref(v as typeof pref)} options={[{ id: 'phone', label: L('Telefon', 'Phone') }, { id: 'email', label: L('E-posta', 'Email') }, { id: 'none', label: L('Aranmasın', 'Do not contact') }]} />
    </FinanceDialog>
  )
}
function MergeDialog({ c, onClose, onDone }: { c: Customer; onClose: () => void; onDone: (keepId: string) => void }) {
  const d = useDb()
  const [other, setOther] = useState('')
  const preview = other ? mergePreview(d, c.id, other) : null
  return (
    <FinanceDialog title={L('Müşteri kayıtlarını birleştir', 'Merge customer records')} description={L('Bu kayıt korunur; seçilen kayıt arşive alınır (silinmez) ve geçmişi bu kayda taşınır.', 'This record is kept; the chosen record is archived (not deleted) and its history moves here.')} confirm={L('Birleştir', 'Merge')} danger onClose={onClose}
      summary={preview ? [[L('Taşınacak rezervasyon', 'Reservations moved'), preview.reservations], [L('Taşınacak kiralama', 'Rentals moved'), preview.rentals], [L('Belge', 'Documents'), preview.documents], [L('Not ve iletişim', 'Notes and contacts'), preview.notes + preview.contacts]] : undefined}
      onSubmit={() => { if (!other) return L('Birleştirilecek kaydı seçin.', 'Choose the record to merge.'); const r = runAction((s) => mergeCustomers(s, c.id, other), L('Kayıtlar birleştirildi; eski kayıt arşivlendi.', 'Records merged; the old record was archived.')); if (!r.ok) return r.error; onDone(c.id); onClose() }}>
      <ComboF id="mg-o" label={L('Arşive alınacak kayıt', 'Record to archive')} items={d.customers.filter((x) => x.id !== c.id && !x.archived).map((x) => ({ id: x.id, label: x.name, sub: x.no }))} value={other} onChange={setOther} />
    </FinanceDialog>
  )
}
