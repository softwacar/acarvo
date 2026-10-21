import { useState } from 'react'
import { updateBranch } from '../../core/ops/control'
import type { Branch } from '../../core/types'
import { L } from '../../i18n'
import { CheckF, TextF } from '../../ui/forms'
import { runAction, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnSmall, Facts, FinanceDialog, Kpis, Notice, Page, Panel } from '../../ui/kit'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer } from '../fleet/common'

export function BranchesPage() {
  const d = useDb()
  const can = useCan()
  const [sel, setSel] = useUrlState('kayit')
  const [editing, setEditing] = useState<Branch | null>(null)
  const current = d.branches.find((b) => b.id === sel)
  return (
    <Page
      title={L('Şubeler', 'Branches')}
      description={L('Şube; saat dilimi, para birimi ve sınıf kapasitesini taşır. Şube adresleri ve ülke kodları otomatik doldurulmaz; her şirketin kendi bilgisidir. Aktif kiralaması olan şube pasif yapılamaz.', 'A branch carries a time zone, currency and class capacity. Addresses and country codes are never auto-filled; they are the company’s own data. A branch with active rentals cannot be deactivated.')}
    >
      <Kpis items={[{ label: L('Şube', 'Branches'), value: d.branches.length }, { label: L('Aktif', 'Active'), value: d.branches.filter((b) => b.active).length }, { label: L('Araç', 'Vehicles'), value: d.vehicles.filter((v) => v.status !== 'sold').length }]} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {d.branches.map((b) => {
          const vehicles = d.vehicles.filter((v) => v.homeBranchId === b.id && v.status !== 'sold')
          const open = d.rentals.filter((r) => (r.pickupBranchId === b.id) && ['prepared', 'delivered'].includes(r.status)).length
          return (
            <Panel key={b.id} title={`${b.code} · ${b.name}`} description={`${b.city}, ${b.country} · ${b.tz} · ${b.currency}`} action={<span className={`text-[12.5px] font-medium ${b.active ? 'text-ok' : 'text-ink-3'}`}>{b.active ? L('Aktif', 'Active') : L('Pasif', 'Inactive')}</span>}>
              <p className="text-[13.5px]">{vehicles.length} {L('araç', 'vehicles')} · {open} {L('açık kiralama', 'open rentals')}</p>
              <p className="mt-1 text-[12.5px] text-ink-2">{b.address || '—'} · {b.phone || '—'}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className={btnSmall} onClick={() => setSel(b.id)}>{L('Ayrıntı', 'Details')}</button>
                {can('branches:manage') && <button type="button" className={btnSmall} onClick={() => setEditing(b)}>{L('Düzenle', 'Edit')}</button>}
              </div>
            </Panel>
          )
        })}
      </div>
      {current && (
        <RecordDrawer title={current.name} subtitle={current.code} onClose={() => setSel('')}>
          <Facts single rows={[[L('Şehir / ülke', 'City / country'), `${current.city}, ${current.country}`], [L('Saat dilimi', 'Time zone'), current.tz], [L('Para birimi', 'Currency'), current.currency], [L('Adres', 'Address'), current.address || '—'], [L('Telefon', 'Phone'), current.phone || '—'], [L('Kabul edilen tahsilat', 'Accepted tender'), (d.settings.branchTender[current.id] ?? d.settings.acceptedCurrencies).join(', ')]]} />
          <DrawerSection title={L('Sınıf kapasitesi (planlama)', 'Class capacity (planning)')}>
            <ul className="divide-y divide-line-soft text-[13.5px]">{d.classes.map((c) => <li key={c.id} className="flex justify-between py-2"><span>{c.name}</span><span className="tnum">{current.classCapacity[c.id] ?? 0} {L('yer', 'slots')} · {d.vehicles.filter((v) => v.homeBranchId === current.id && v.classId === c.id && v.status !== 'sold').length} {L('araç', 'vehicles')}</span></li>)}</ul>
          </DrawerSection>
          {can('branches:manage') && <ActionRow><ActBtn onClick={() => setEditing(current)}>{L('Düzenle', 'Edit')}</ActBtn></ActionRow>}
        </RecordDrawer>
      )}
      {editing && <EditDialog b={editing} onClose={() => setEditing(null)} />}
      <Notice tone="blue">{L('Yeni şube ekleme demo kapsamında değildir; mevcut şubelerin bilgileri düzenlenebilir.', 'Adding a new branch is outside the demo scope; existing branch details can be edited.')}</Notice>
    </Page>
  )
}

function EditDialog({ b, onClose }: { b: Branch; onClose: () => void }) {
  const [name, setName] = useState(b.name)
  const [phone, setPhone] = useState(b.phone)
  const [address, setAddress] = useState(b.address)
  const [active, setActive] = useState(b.active)
  return (
    <FinanceDialog title={`${L('Şubeyi düzenle', 'Edit branch')}: ${b.code}`} description={L('Değişiklik işlem geçmişine yazılır.', 'The change is written to the audit log.')} confirm={L('Kaydet', 'Save')} onClose={onClose}
      onSubmit={() => { const r = runAction((s) => updateBranch(s, b.id, { name, phone, address, active }), L('Şube güncellendi.', 'Branch updated.')); if (!r.ok) return r.error; onClose() }}>
      <TextF id="br-n" label={L('Ad', 'Name')} required value={name} onChange={setName} />
      <TextF id="br-p" label={L('Telefon', 'Phone')} value={phone} onChange={setPhone} />
      <TextF id="br-a" label={L('Adres', 'Address')} value={address} onChange={setAddress} />
      <CheckF id="br-ac" checked={active} onChange={setActive}>{L('Aktif', 'Active')}</CheckF>
    </FinanceDialog>
  )
}
