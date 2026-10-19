import { ShieldStar } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { setTenantPlan, setTenantStatus } from '../../core/ops/control'
import { commit } from '../../core/store'
import type { Tenant } from '../../core/types'
import { L } from '../../i18n'
import { runAction, useDb, useFmt } from '../../ui/hooks'
import { btnPrimary, btnSmall, Empty, Kpis, Notice, Panel, Status } from '../../ui/kit'
import { type Col, DataTable } from '../../ui/table'
import { ContextFrame } from './ContextFrame'

const PLAN = () => ({ starter: L('Başlangıç', 'Starter'), professional: L('Profesyonel', 'Professional'), enterprise: L('Kurumsal', 'Enterprise') })

export function PlatformConsole() {
  const d = useDb()
  const f = useFmt()
  const navigate = useNavigate()
  const [msg, setMsg] = useState<string | null>(null)
  const plans = PLAN()
  const act = (fn: Parameters<typeof runAction<unknown>>[0], text: string) => {
    const r = runAction(fn, text)
    setMsg(r.ok ? null : r.error)
  }
  const cols: Col<Tenant>[] = [
    { id: 'name', header: L('Şirket', 'Company'), cell: (t) => <span className="font-medium">{t.name}{t.id === d.tenants[0]!.id && <span className="ml-2 rounded bg-blue-soft px-1.5 py-0.5 text-[11px] font-medium text-blue-ink">{L('Demo şirketi', 'Demo company')}</span>}</span>, sort: (t) => t.name },
    { id: 'owner', header: L('Sahip', 'Owner'), cell: (t) => <span>{t.owner}<span className="block text-[12px] text-ink-2">{t.ownerEmail}</span></span>, hideBelow: 'md' },
    { id: 'plan', header: L('Plan', 'Plan'), cell: (t) => plans[t.plan], hideBelow: 'md' },
    { id: 'size', header: L('Şube / kullanıcı / araç', 'Branches / users / vehicles'), cell: (t) => <span className="tnum">{t.branches} / {t.users} / {t.vehicles}</span>, hideBelow: 'lg' },
    { id: 'created', header: L('Oluşturuldu', 'Created'), cell: (t) => <span className="tnum text-[13px]">{f.date(t.createdAt)}</span>, hideBelow: 'lg' },
    { id: 'st', header: L('Durum', 'Status'), cell: (t) => <Status kind="tenant" value={t.status} />, sort: (t) => t.status },
    {
      id: 'act',
      header: '',
      align: 'right',
      cell: (t) => (
        <span className="flex flex-wrap justify-end gap-1.5">
          {t.status !== 'suspended' ? <button type="button" className={btnSmall} onClick={() => act((s) => setTenantStatus(s, t.id, 'suspended'), L('Şirket askıya alındı (kayıtları silinmez).', 'Company suspended (its records are not deleted).'))}>{L('Askıya al', 'Suspend')}</button> : <button type="button" className={btnSmall} onClick={() => act((s) => setTenantStatus(s, t.id, 'active'), L('Şirket yeniden etkinleştirildi.', 'Company reactivated.'))}>{L('Etkinleştir', 'Reactivate')}</button>}
          <select aria-label={`${t.name}: ${L('plan', 'plan')}`} value={t.plan} onChange={(e) => act((s) => setTenantPlan(s, t.id, e.target.value as Tenant['plan']), L('Plan güncellendi.', 'Plan updated.'))} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]">
            {Object.entries(plans).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </span>
      ),
    },
  ]
  return (
    <ContextFrame
      title={L('Platform Konsolu', 'Platform Console')}
      subtitle={L('Süper yönetici bağlamı: şirket hesapları ve planlar', 'Super-admin context: company accounts and plans')}
      icon={<ShieldStar size={20} />}
      actions={<button type="button" className={btnPrimary} onClick={() => { commit((x) => { x.session.context = 'company' }); void navigate({ to: '/' as never }) }}>{L('Şirket paneline dön', 'Back to the company app')}</button>}
    >
      <Notice tone="blue">{L('Platform operatörü bir şirketin üst bilgisini (ad, plan, durum, boyut) yönetir; şirketin kiralama, müşteri, finans veya belge kayıtlarını göremez. Askıya alma kayıtları silmez; şirket kullanıcıları giriş yapamaz (demo’da simüle edilir).', 'The platform operator manages a company’s top-level data (name, plan, status, size); it cannot see the company’s rentals, customers, finance or documents. Suspending deletes nothing; the company’s users cannot sign in (simulated in the demo).')}</Notice>
      {msg && <Notice tone="alert">{msg}</Notice>}
      <Kpis items={[{ label: L('Şirket', 'Companies'), value: d.tenants.length }, { label: L('Etkin', 'Active'), value: d.tenants.filter((t) => t.status === 'active').length }, { label: L('Deneme', 'Trial'), value: d.tenants.filter((t) => t.status === 'trial').length }, { label: L('Askıda', 'Suspended'), value: d.tenants.filter((t) => t.status === 'suspended').length, tone: d.tenants.some((t) => t.status === 'suspended') ? 'hold' : undefined }]} />
      <Panel title={L('Şirket hesapları', 'Company accounts')} flush>
        <DataTable rows={d.tenants} cols={cols} rowKey={(t) => t.id} label={L('Şirket hesapları', 'Company accounts')} urlKey="pl" empty={<Empty title={L('Şirket yok', 'No companies')} />} />
      </Panel>
      <p className="text-[12.5px] text-ink-3">{L('Tüm şirketler kurgusaldır. Gerçek müşteri verisi, fatura veya ödeme sağlayıcı yoktur.', 'All companies are fictional. There is no real customer data, billing or payment provider.')}</p>
    </ContextFrame>
  )
}
