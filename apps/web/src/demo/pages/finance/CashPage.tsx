import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { computeCashExpected, openSessionOf } from '../../core/calc/finance'
import { userName } from '../../core/helpers'
import { fmt, parseAmount } from '../../core/money'
import { CRITICAL_VARIANCE_FACTOR, closeSession, manualCashMove, openSession } from '../../core/ops/finance'
import { EndOfDay } from './EndOfDay'
import type { Drawer } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, MoneyF, SelectF, TextF, userOptions } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSmall, Empty, FinanceDialog, Kpis, Notice, Page, Panel, Status, Tabs } from '../../ui/kit'

// Branch cash drawers: one drawer per branch and currency. Only cash enters a drawer; card and bank transfer never do.

export function CashPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const [tab, setTab] = useUrlState('sekme', 'kasalar')
  const [dlg, setDlg] = useState<null | { kind: 'open' | 'close' | 'move'; drawer: Drawer }>(null)
  const drawers = d.drawers.filter((x) => active.includes(x.branchId))
  const sessions = d.cashSessions.filter((s) => drawers.some((x) => x.id === s.drawerId)).sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  const open = drawers.filter((x) => x.status === 'open')
  return (
    <Page
      title={L('Şube Kasaları', 'Branch Cash')}
      description={L('Her şube ve para birimi için ayrı kasa. Yalnız nakit kasaya girer; kart ve havale hiçbir zaman nakit kasasına yazılmaz. Kasa kapanışında sayım ve fark gerekçesi istenir.', 'One drawer per branch and currency. Only cash enters a drawer; card and bank transfer never touch it. Closing a drawer needs a count and a variance reason.')}
    >
      <Kpis items={[{ label: L('Açık kasa', 'Open drawers'), value: `${open.length} / ${drawers.length}` }, { label: L('Kapalı kasa', 'Closed drawers'), value: drawers.length - open.length, tone: drawers.length - open.length ? 'hold' : undefined, hint: L('Nakit tahsilat için oturum açılmalı', 'A session must be opened to take cash') }]} />
      {drawers.some((x) => x.status === 'closed') && <Notice tone="hold">{L('Kapalı kasada nakit tahsilat, nakit depozito veya nakit iade yapılamaz; işlem kasa oturumu açılana kadar reddedilir.', 'Cash payments, cash deposits and cash refunds are refused on a closed drawer until a session is opened.')}</Notice>}
      <Tabs tabs={[{ id: 'kasalar', label: L('Kasalar', 'Drawers') }, { id: 'oturumlar', label: L('Oturumlar', 'Sessions'), count: sessions.length }, { id: 'gunsonu', label: L('Gün sonu özeti', 'End of day') }]} value={tab as 'kasalar' | 'oturumlar' | 'gunsonu'} onChange={setTab} label={L('Kasa bölümleri', 'Cash sections')} />
      {tab === 'gunsonu' ? (
        <EndOfDay />
      ) : tab === 'oturumlar' ? (
        <Panel flush>
          {sessions.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Oturum yok.', 'No sessions.')}</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[13.5px]">
              <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th className="px-5 py-2 font-medium">{L('Kasa', 'Drawer')}</th><th className="px-2 py-2 font-medium">{L('Açılış', 'Opened')}</th><th className="px-2 py-2 text-right font-medium">{L('Beklenen', 'Expected')}</th><th className="px-2 py-2 text-right font-medium">{L('Sayılan', 'Counted')}</th><th className="px-5 py-2 text-right font-medium">{L('Fark', 'Variance')}</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {sessions.map((s) => { const dr = d.drawers.find((x) => x.id === s.drawerId)!; const expected = s.closedAt ? s.expectedMinor ?? 0 : computeCashExpected(d, s); return (
                  <tr key={s.id}><td className="px-5 py-2.5 font-medium">{dr.name}</td><td className="tnum px-2 py-2.5">{f.dt(s.openedAt, dr.branchId)} · {userName(d, s.openedBy)}</td><td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{fmt(expected, dr.currency)}</td><td className="tnum whitespace-nowrap px-2 py-2.5 text-right">{s.closedAt ? fmt(s.countedMinor ?? 0, dr.currency) : <span className="text-ok">{L('Açık', 'Open')}</span>}</td><td className={`tnum whitespace-nowrap px-5 py-2.5 text-right ${s.varianceMinor ? 'font-medium text-hold' : ''}`}>{s.closedAt ? fmt(s.varianceMinor ?? 0, dr.currency) : '—'}</td></tr>
                ) })}
              </tbody>
            </table></div>
          )}
        </Panel>
      ) : drawers.length === 0 ? (
        <Empty title={L('Bu şube kapsamında kasa yok', 'No drawers in this branch scope')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drawers.map((dr) => {
            const s = openSessionOf(d, dr)
            const moves = s ? d.cashMovements.filter((m) => m.sessionId === s.id).sort((a, b) => b.at.localeCompare(a.at)) : []
            return (
              <Panel key={dr.id} title={dr.name} description={`${d.branches.find((b) => b.id === dr.branchId)?.name} · ${dr.currency}`} action={<Status kind="drawer" value={dr.status} />}>
                {s ? (
                  <>
                    <p className="tnum text-[22px] font-semibold">{fmt(computeCashExpected(d, s), dr.currency)}</p>
                    <p className="text-[12.5px] text-ink-2">{L('Beklenen nakit', 'Expected cash')} · {L('açılış', 'opened')} {f.dt(s.openedAt, dr.branchId)} · {userName(d, s.openedBy)}</p>
                    <ul className="mt-3 divide-y divide-line-soft text-[13px]">
                      {moves.slice(0, 6).map((m) => <li key={m.id} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{m.reason}</span><span className={`tnum whitespace-nowrap ${m.kind === 'in' ? 'text-ok' : 'text-alert'}`}>{m.kind === 'in' ? '+' : '−'}{fmt(m.minor, m.cur)}</span></li>)}
                      {moves.length === 0 && <li className="py-1.5 text-ink-2">{L('Henüz hareket yok.', 'No movements yet.')}</li>}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {can('cash:manage') && <button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'move', drawer: dr })}>{L('Hareket ekle', 'Add movement')}</button>}
                      {can('cash:close') && <button type="button" className={btnSmall} onClick={() => setDlg({ kind: 'close', drawer: dr })}>{L('Kasayı kapat', 'Close drawer')}</button>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13.5px] text-ink-2">{L('Kasa kapalı. Nakit işlem yapılamaz.', 'The drawer is closed. No cash transactions are possible.')}</p>
                    {can('cash:manage') && <div className="mt-3"><button type="button" className={btnPrimary} onClick={() => setDlg({ kind: 'open', drawer: dr })}>{L('Oturum aç', 'Open session')}</button></div>}
                  </>
                )}
              </Panel>
            )
          })}
        </div>
      )}
      {dlg?.kind === 'open' && <OpenDialog drawer={dlg.drawer} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'close' && <CloseDialog drawer={dlg.drawer} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'move' && <MoveDialog drawer={dlg.drawer} onClose={() => setDlg(null)} />}
      <p className="text-[12.5px] text-ink-3">{L('Kasa hareketleri ödeme, depozito, iade ve masraf kayıtlarına bağlıdır.', 'Cash movements link to payment, deposit, refund and expense records.')} <Link to={'/finans' as never} className="font-medium text-blue hover:underline">{L('Finans Merkezi', 'Finance Center')}</Link></p>
    </Page>
  )
}

function OpenDialog({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const [amount, setAmount] = useState('0')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={`${L('Oturum aç', 'Open session')}: ${drawer.name}`} description={L('Açılış bakiyesi, kasada fiilen bulunan nakittir.', 'The opening balance is the cash physically in the drawer.')} confirm={L('Aç', 'Open')} onClose={onClose}
      onSubmit={() => { const m = parseAmount(amount, drawer.currency); if (m === null) { setFields({ opening: L('Geçerli tutar girin', 'Enter a valid amount') }); return L('Tutar geçersiz.', 'Invalid amount.') } const r = runAction((s) => openSession(s, drawer.id, m), L('Kasa oturumu açıldı.', 'Drawer session opened.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <MoneyF id="os-a" label={L('Açılış bakiyesi', 'Opening balance')} amount={amount} onAmount={setAmount} cur={drawer.currency} onCur={() => {}} currencies={[drawer.currency]} lockCurrency error={fields.opening} />
    </FinanceDialog>
  )
}

function MoveDialog({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const [kind, setKind] = useState<'in' | 'out'>('out')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog title={`${L('Kasa hareketi', 'Cash movement')}: ${drawer.name}`} description={L('Elle hareket gerekçelidir ve işlem geçmişine yazılır. Çıkış, beklenen nakdi aşamaz.', 'A manual movement needs a reason and is written to the audit log. An outflow cannot exceed the expected cash.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const m = parseAmount(amount, drawer.currency); if (m === null || m <= 0) { setFields({ amount: L('Geçerli tutar girin', 'Enter a valid amount') }); return L('Tutar geçersiz.', 'Invalid amount.') } const r = runAction((s) => manualCashMove(s, drawer.id, kind, m, reason), L('Kasa hareketi kaydedildi.', 'Cash movement recorded.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <SelectF id="mv-k" label={L('Yön', 'Direction')} value={kind} onChange={(v) => setKind(v as 'in' | 'out')} options={[{ id: 'in', label: L('Giriş', 'In') }, { id: 'out', label: L('Çıkış', 'Out') }]} />
      <MoneyF id="mv-a" label={L('Tutar', 'Amount')} amount={amount} onAmount={setAmount} cur={drawer.currency} onCur={() => {}} currencies={[drawer.currency]} lockCurrency error={fields.amount} />
      <AreaF id="mv-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={fields.reason} rows={2} />
    </FinanceDialog>
  )
}

function CloseDialog({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const d = useDb()
  const s = openSessionOf(d, drawer)!
  const expected = computeCashExpected(d, s)
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const [handover, setHandover] = useState('')
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const minor = parseAmount(counted, drawer.currency)
  const variance = minor === null ? null : minor - expected
  const limit = d.settings.cash.varianceReason[drawer.currency] ?? 0
  return (
    <FinanceDialog title={`${L('Kasayı kapat', 'Close drawer')}: ${drawer.name}`} description={L('Önce nakdi sayın, sonra beklenenle karşılaştırın. Eşiği aşan fark için gerekçe yazılır.', 'Count the cash first, then compare with the expected amount. A variance above the threshold needs a reason.')} confirm={L('Kapat', 'Close')} onClose={onClose}
      summary={[[L('Beklenen', 'Expected'), fmt(expected, drawer.currency)], [L('Fark', 'Variance'), variance === null ? '—' : fmt(variance, drawer.currency)], [L('Gerekçe eşiği', 'Reason threshold'), fmt(limit, drawer.currency)]]}
      onSubmit={() => { if (minor === null) { setFields({ counted: L('Sayılan tutarı girin', 'Enter the counted amount') }); return L('Sayılan tutar zorunlu.', 'The counted amount is required.') } const r = runAction((x) => closeSession(x, drawer.id, minor, reason, handover || undefined, note), L('Kasa kapandı.', 'Drawer closed.')); if (!r.ok) { setFields(r.fields); return r.error } onClose() }}>
      <MoneyF id="cl-a" label={L('Sayılan nakit', 'Counted cash')} amount={counted} onAmount={setCounted} cur={drawer.currency} onCur={() => {}} currencies={[drawer.currency]} lockCurrency required error={fields.counted} />
      {variance !== null && Math.abs(variance) > limit && <AreaF id="cl-r" label={L('Fark gerekçesi', 'Variance reason')} required value={reason} onChange={setReason} error={fields.reason} rows={2} />}
      {variance !== null && limit > 0 && Math.abs(variance) > limit * CRITICAL_VARIANCE_FACTOR && <Notice tone="alert">{L(`Kritik fark (eşiğin ${CRITICAL_VARIANCE_FACTOR} katından fazla): kasayı yalnız onay yetkisi olan kişi (Sahip/Yönetici) kapatabilir.`, `Critical variance (more than ${CRITICAL_VARIANCE_FACTOR} times the threshold): only a person with approval authority (Owner/Manager) can close the drawer.`)}</Notice>}
      <SelectF id="cl-h" label={L('Devredilen kişi (isteğe bağlı)', 'Handed over to (optional)')} value={handover} onChange={setHandover} placeholder={L('Seçilmedi', 'Not chosen')} options={userOptions(d)} />
      <TextF id="cl-n" label={L('Devir notu', 'Handover note')} value={note} onChange={setNote} />
    </FinanceDialog>
  )
}
