import {
  CORPORATE_ARCHIVE_REASONS,
  CORPORATE_RESTORE_REASONS,
  CORPORATE_TABS,
  type CorporateActivityItem,
  type CorporateArchiveReason,
  type CorporateDetail,
  type CorporateRestoreReason,
  type CorporateTab,
  type PersonEndReason,
  type PersonRole,
} from '@acarvo/shared'
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  Buildings,
  CalendarCheck,
  Coins,
  DotsThree,
  EnvelopeSimple,
  type Icon,
  IdentificationBadge,
  Info,
  Key,
  MapPin,
  PencilSimple,
  Phone,
  Receipt,
  ShieldCheck,
  SteeringWheel,
  Users,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, corporateApi } from '@/lib/api'
import {
  ADDRESS_KIND_LABELS,
  CHANNEL_KIND_LABELS,
  CORPORATE_ARCHIVE_REASON_LABELS,
  CORPORATE_FIELD_LABELS,
  CORPORATE_RESTORE_REASON_LABELS,
  PERSON_END_REASON_LABELS,
  PERSON_ROLE_LABELS,
  TAX_VALIDITY_LABELS,
} from '@/lib/corporate-labels'
import { countryName, initials, languageName } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { CorporateFormSheet } from './CorporateForm'
import { PeopleTab } from './CorporatePeople'
import { btnPrimary, btnSecondary, conflictMessage, Panel, ReasonDialog, useAccountUpdated } from './ui'
import { AddressesTab, ChannelsPanel, TaxIdsTab } from './CorporateRecords'
import { listSearchToReturnTo } from './search'
import { RelatedReservations } from '../reservations/RelatedReservations'

const TAB_LABELS: Record<CorporateTab, string> = {
  genel: 'Genel',
  adresler: 'Adresler',
  vergi: 'Vergi bilgileri',
  kisiler: 'Kişiler',
  suruculer: 'Sürücüler',
  gecmis: 'Geçmiş',
  rezervasyonlar: 'Rezervasyonlar',
  kiralamalar: 'Kiralamalar',
  cari: 'Cari / Finans',
}

const PENDING: Partial<Record<CorporateTab, { icon: Icon; module: string; will: string[] }>> = {
  rezervasyonlar: { icon: CalendarCheck, module: 'Rezervasyonlar', will: ['Bu hesap adına yapılan rezervasyonlar', 'Rezervasyonu yapan kişi ve sürücü', 'Kurumsal fiyat bağlamı'] },
  kiralamalar: { icon: Key, module: 'Kiralamalar', will: ['Ödeyen taraf bu hesap olan kiralamalar', 'Yetkili sürücülerin kiralamaları', 'Sözleşmeye kopyalanan fatura adresi ve vergi kimliği'] },
  cari: { icon: Coins, module: 'Finans', will: ['Kredi limiti ve kullanımı', 'Açık bakiye, tahakkuk ve tahsilatlar; para birimleri ayrı', 'Ekstre ve ödeme koşulları'] },
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{v ?? <span className="font-normal text-ink-3">Girilmemiş</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function ArchiveRestore({ a, mode, onClose }: { a: CorporateDetail; mode: 'archive' | 'restore'; onClose: () => void }) {
  const updated = useAccountUpdated(a.id)
  const [error, setError] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: (reason: string) => (mode === 'archive' ? corporateApi.archive(a.id, a.version, reason) : corporateApi.restore(a.id, a.version, reason)),
    onSuccess: (next) => {
      updated(next)
      toast(mode === 'archive' ? `${a.legalName} arşivlendi.` : `${a.legalName} arşivden çıkarıldı.`)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') {
        updated()
        return setError(conflictMessage)
      }
      setError(e instanceof ApiRequestError ? (e.fields?.reason ?? e.message) : 'İşlem yapılamadı. Bağlantınızı kontrol edin.')
    },
  })
  return mode === 'archive' ? (
    <ReasonDialog<CorporateArchiveReason>
      title="Kurumsal hesabı arşivle"
      description={`${a.legalName} (${a.accountNo}) varsayılan listede görünmez. Hesap, kayıtları ve kişi bağlantıları silinmez; bağlı kişilerin müşteri kayıtları etkilenmez.`}
      reasons={CORPORATE_ARCHIVE_REASONS}
      labels={CORPORATE_ARCHIVE_REASON_LABELS}
      confirm="Arşivle"
      pending={m.isPending}
      error={error}
      onConfirm={(r) => m.mutate(r)}
      onClose={onClose}
    />
  ) : (
    <ReasonDialog<CorporateRestoreReason>
      title="Arşivden çıkar"
      description={`${a.legalName} (${a.accountNo}) yeniden etkin olur ve düzenlenebilir.`}
      reasons={CORPORATE_RESTORE_REASONS}
      labels={CORPORATE_RESTORE_REASON_LABELS}
      confirm="Arşivden çıkar"
      pending={m.isPending}
      error={error}
      onConfirm={(r) => m.mutate(r)}
      onClose={onClose}
    />
  )
}

function MoreMenu({ a, canManage, onArchive, onRestore }: { a: CorporateDetail; canManage: boolean; onArchive: () => void; onRestore: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Diğer işlemler" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-line-soft hover:text-ink">
        <DotsThree size={20} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-[260px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)]">
          {canManage && (
            <>
              {a.status === 'archived' ? (
                <DropdownMenu.Item onSelect={onRestore} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                  <ArrowCounterClockwise size={16} /> Arşivden çıkar
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item onSelect={onArchive} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                  <Archive size={16} /> Hesabı arşivle
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">İlgili modüllerle açılacak</DropdownMenu.Label>
          {['Kurumsal rezervasyon', 'Kurumsal kiralama', 'Kredi limiti ve ekstre'].map((x) => (
            <DropdownMenu.Item key={x} disabled className="flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-[13.5px] text-ink-3 outline-none">
              {x}
              <span className="text-[11.5px]">yakında</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function HeaderItem({ icon: Ico, label, children, href }: { icon: Icon; label: string; children: ReactNode; href?: string }) {
  const body = (
    <>
      <Ico size={17} className="mt-0.5 shrink-0 text-ink-3" />
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-2">{label}</span>
        <span className={cn('block truncate font-medium', href ? 'text-blue-ink group-hover:underline' : 'text-ink')}>{children}</span>
      </span>
    </>
  )
  return href ? (
    <a href={href} className="group flex min-h-11 min-w-0 items-start gap-2.5 rounded-lg py-1.5">
      {body}
    </a>
  ) : (
    <div className="flex min-h-11 min-w-0 items-start gap-2.5 py-1.5">{body}</div>
  )
}

function Header({ a, canManage, onEdit, onArchive, onRestore, onTab }: { a: CorporateDetail; canManage: boolean; onEdit: () => void; onArchive: () => void; onRestore: () => void; onTab: (t: CorporateTab) => void }) {
  const archived = a.status === 'archived'
  const phone = a.channels.find((c) => c.kind === 'phone' && c.isPrimary)
  const email = a.channels.find((c) => c.kind === 'email' && c.isPrimary)
  const tax = a.taxIds.find((t) => t.isPrimary)
  return (
    <section aria-label="Kurumsal hesap özeti" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4 p-5 sm:p-6">
        <span aria-hidden className={cn('grid size-14 shrink-0 place-items-center rounded-xl text-[19px] font-semibold tracking-[0.02em]', archived ? 'bg-ground text-ink-3' : 'bg-blue-soft text-blue-ink')}>
          {initials(a.tradeName ?? a.legalName)}
        </span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[12.5px] font-semibold tracking-[0.03em] text-ink-2">{a.accountNo}</span>
            {archived ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                <Archive size={14} />
                Arşivde
              </span>
            ) : (
              <span className="text-[13px] text-ink-2">Etkin kurumsal hesap</span>
            )}
          </div>
          <h1 className={cn('mt-1.5 text-[26px] leading-tight font-semibold tracking-[-0.025em] break-words sm:text-[30px]', archived && 'text-ink-2')}>{a.legalName}</h1>
          <p className="mt-1 text-ink-2">
            {[a.tradeName, countryName(a.country), a.registrationNumber ? `Sicil no ${a.registrationNumber}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {canManage && !archived && (
            <button type="button" onClick={onEdit} className={btnPrimary}>
              <PencilSimple size={16} />
              Düzenle
            </button>
          )}
          {canManage && archived && (
            <button type="button" onClick={onRestore} className={btnSecondary}>
              <ArrowCounterClockwise size={16} />
              Arşivden çıkar
            </button>
          )}
          <MoreMenu a={a} canManage={canManage} onArchive={onArchive} onRestore={onRestore} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-6 border-t border-line-soft px-5 py-2 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <HeaderItem icon={Phone} label="Birincil telefon" href={phone ? `tel:${phone.value.replace(/\s/g, '')}` : undefined}>
          {phone ? <span className="tnum">{phone.value}</span> : <span className="font-normal text-ink-3">Girilmemiş</span>}
        </HeaderItem>
        <HeaderItem icon={EnvelopeSimple} label="Birincil e-posta" href={email ? `mailto:${email.value}` : undefined}>
          {email?.value ?? <span className="font-normal text-ink-3">Girilmemiş</span>}
        </HeaderItem>
        <HeaderItem icon={Receipt} label="Birincil vergi kimliği">
          {tax ? <span className="tnum">{`${tax.scheme} ${tax.value}`}</span> : <span className="font-normal text-ink-3">Girilmemiş</span>}
        </HeaderItem>
        <button type="button" onClick={() => onTab('kisiler')} className="group flex min-h-11 min-w-0 items-start gap-2.5 rounded-lg py-1.5 text-left">
          <Users size={17} className="mt-0.5 shrink-0 text-ink-3" />
          <span className="min-w-0">
            <span className="block text-[12px] text-ink-2">Kişiler ve sürücüler</span>
            <span className="block truncate font-medium text-blue-ink group-hover:underline">
              {a.peopleCount ? `${a.peopleCount} kişi · ${a.driverCount} yetkili sürücü` : 'Bağlı kişi yok'}
            </span>
          </span>
        </button>
      </div>
      {archived && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft bg-ground/60 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
          <Archive size={16} className="shrink-0 text-ink-3" />
          <span>
            {a.archivedAt ? formatDateTime(a.archivedAt) : ''} · {a.archivedByName ? `${a.archivedByName} tarafından arşivlendi` : 'arşivlendi (kullanıcı bilgisi yok)'} · Neden:{' '}
            <span className="font-medium text-ink">{a.archivedReason ? CORPORATE_ARCHIVE_REASON_LABELS[a.archivedReason] : '—'}</span>
          </span>
          <span className="basis-full text-[12.5px] sm:basis-auto">Arşivdeki hesap düzenlenemez; kişi bağlantıları ve müşteri kayıtları korunur.</span>
        </div>
      )}
    </section>
  )
}

function Overview({ a, canManage, onEdit, onTab }: { a: CorporateDetail; canManage: boolean; onEdit: () => void; onTab: (t: CorporateTab) => void }) {
  const editable = canManage && a.status === 'active'
  const edit = editable ? (
    <button type="button" onClick={onEdit} className="text-[13px] font-medium text-blue hover:underline">
      Düzenle
    </button>
  ) : undefined
  const primaryAddresses = a.addresses.filter((x) => x.isPrimary)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Panel title="Şirket bilgileri" action={edit}>
          <Facts
            rows={[
              ['Resmi unvan', a.legalName],
              ['Kısa ad', a.tradeName],
              ['Ülke', countryName(a.country)],
              ['Sicil / kayıt no', a.registrationNumber && <span className="tnum">{a.registrationNumber}</span>],
              ['Sicil makamı', a.registrationAuthority],
              ['Yazışma dili', languageName(a.preferredLanguage)],
            ]}
          />
          {a.note && <p className="mt-3 rounded-lg bg-ground/70 px-3 py-2.5 text-[13.5px] whitespace-pre-line text-ink">{a.note}</p>}
        </Panel>
        <ChannelsPanel a={a} editable={editable} />
      </div>
      <div className="min-w-0 space-y-5">
        <Panel title="Hesap özeti">
          <ul className="-mx-2">
            {(
              [
                [MapPin, 'Adresler', a.addresses.length ? `${a.addresses.length} adres` : 'Girilmemiş', 'adresler'],
                [Receipt, 'Vergi kimlikleri', a.taxIds.length ? `${a.taxIds.length} kayıt` : 'Girilmemiş', 'vergi'],
                [IdentificationBadge, 'Kişiler', a.peopleCount ? `${a.peopleCount} kişi` : 'Bağlı kişi yok', 'kisiler'],
                [SteeringWheel, 'Yetkili sürücüler', a.driverCount ? `${a.driverCount} sürücü` : 'Yok', 'suruculer'],
                [Coins, 'Cari / kredi limiti', 'Finans modülüyle', 'cari'],
              ] as [Icon, string, string, CorporateTab][]
            ).map(([Ico, label, state, tab]) => (
              <li key={label}>
                <button type="button" onClick={() => onTab(tab)} className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-ground">
                  <Ico size={17} className="shrink-0 text-ink-3" />
                  <span className="flex-1 truncate text-ink">{label}</span>
                  <span className="shrink-0 text-[12.5px] text-ink-2">{state}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Birincil adresler" action={<button type="button" onClick={() => onTab('adresler')} className="text-[13px] font-medium text-blue hover:underline">Tümü</button>}>
          {primaryAddresses.length ? (
            <ul className="space-y-3">
              {primaryAddresses.map((x) => (
                <li key={x.id} className="text-[13.5px] leading-relaxed">
                  <span className="block text-[12px] font-medium text-ink-2">{ADDRESS_KIND_LABELS[x.kind]}</span>
                  <span className="block text-ink">{[x.line1, x.line2].filter(Boolean).join(', ')}</span>
                  <span className="block text-ink-2">{[[x.postalCode, x.city].filter(Boolean).join(' '), countryName(x.country)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Adres girilmemiş.</p>
          )}
        </Panel>
        <Panel title="Kayıt bilgisi">
          <dl className="grid">
            {(
              [
                ['Kayıt şubesi', a.createdBranch?.name ?? null],
                ['Oluşturan', a.createdByName ?? null],
                ['Oluşturulma', formatDateTime(a.createdAt)],
                ['Son değişiklik', formatDateTime(a.updatedAt)],
                ['Sürüm', String(a.version)],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-0">
                <dt className="text-[13px] text-ink-2">{k}</dt>
                <dd className="tnum text-right font-medium text-ink">{v ?? <span className="font-normal text-ink-3">{k === 'Oluşturan' ? 'Kullanıcı bilgisi yok' : 'Girilmemiş'}</span>}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  )
}

function Pending({ tab }: { tab: CorporateTab }) {
  const p = PENDING[tab]!
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
        <div>
          <span className="grid size-11 place-items-center rounded-lg bg-ground text-ink-2">
            <p.icon size={22} />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.01em]">{TAB_LABELS[tab]} henüz bağlı değil</h2>
          <p className="mt-1.5 max-w-[460px] text-ink-2">
            <span className="font-medium text-ink">{p.module}</span> modülüyle bu hesabın gerçek kayıtları burada görünecek. Şimdilik örnek veya temsili veri gösterilmez.
          </p>
        </div>
        <div className="rounded-lg border border-line-soft bg-ground/50 p-5">
          <p className="text-[12.5px] font-medium text-ink-2">Bu sekmede yer alacak</p>
          <ul className="mt-3 space-y-2.5">
            {p.will.map((w) => (
              <li key={w} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-ink-3" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

const ACTION_TITLES: Record<string, string> = {
  'corporate.create': 'Kurumsal hesap oluşturuldu',
  'corporate.update': 'Şirket bilgileri güncellendi',
  'corporate.archive': 'Hesap arşivlendi',
  'corporate.restore': 'Hesap arşivden çıkarıldı',
  'corporate.channel.add': 'İletişim kanalı eklendi',
  'corporate.channel.update': 'İletişim kanalı güncellendi',
  'corporate.channel.remove': 'İletişim kanalı kaldırıldı',
  'corporate.tax_id.add': 'Vergi kimliği eklendi',
  'corporate.tax_id.update': 'Vergi kimliği güncellendi',
  'corporate.tax_id.remove': 'Vergi kimliği kaldırıldı',
  'corporate.address.add': 'Adres eklendi',
  'corporate.address.update': 'Adres güncellendi',
  'corporate.address.remove': 'Adres kaldırıldı',
  'corporate.person.link': 'Kişi bağlandı',
  'corporate.person.update': 'Kişinin rolleri veya bilgileri güncellendi',
  'corporate.person.end': 'Kişi ilişkisi sona erdirildi',
}

function ActivityEntry({ e }: { e: CorporateActivityItem }) {
  const s = (e.summary ?? {}) as Record<string, unknown>
  const fields = (s.fields as string[] | undefined) ?? []
  const values = (s.values as Record<string, [unknown, unknown]> | undefined) ?? {}
  const details: string[] = []
  if (typeof s.kind === 'string') details.push(CHANNEL_KIND_LABELS[s.kind as 'phone'] ?? ADDRESS_KIND_LABELS[s.kind as 'billing'] ?? s.kind)
  if (typeof s.scheme === 'string') details.push(`${s.scheme} · ${countryName(s.country as string)}`)
  if (typeof s.validity === 'string' && e.action.startsWith('corporate.tax_id')) details.push(TAX_VALIDITY_LABELS[s.validity as 'not_checked'])
  if (typeof s.customerNo === 'string') details.push(`Müşteri ${s.customerNo}`)
  const roles = s.roles as PersonRole[] | [PersonRole[], PersonRole[]] | undefined
  const roleText = (r: PersonRole[]) => r.map((x) => PERSON_ROLE_LABELS[x] ?? x).join(', ')
  return (
    <li className="grid grid-cols-[20px_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 size-2.5 rounded-full border-2', e.action === 'corporate.create' ? 'border-blue bg-blue' : 'border-ink-3 bg-surface')} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{ACTION_TITLES[e.action] ?? e.action}</span>
          <span className="tnum text-[12.5px] text-ink-2">
            {formatDateTime(e.at)}
            {e.actorName && ` · ${e.actorName}`}
          </span>
        </div>
        {details.length > 0 && <p className="mt-0.5 text-[13px] text-ink-2">{details.join(' · ')}</p>}
        {fields.length > 0 && (
          <p className="mt-0.5 text-[13px] text-ink-2">
            Değişen alanlar: <span className="text-ink">{fields.map((f) => CORPORATE_FIELD_LABELS[f] ?? f).join(', ')}</span>
          </p>
        )}
        {Object.entries(values).map(([f, [before, after]]) => (
          <p key={f} className="text-[13px] text-ink-2">
            {CORPORATE_FIELD_LABELS[f] ?? f}: {f === 'country' ? countryName(before as string) : (languageName(before as string) ?? '—')} →{' '}
            <span className="font-medium text-ink">{f === 'country' ? countryName(after as string) : (languageName(after as string) ?? '—')}</span>
          </p>
        ))}
        {roles && Array.isArray(roles[0]) ? (
          <p className="text-[13px] text-ink-2">
            Roller: {roleText(roles[0] as PersonRole[])} → <span className="font-medium text-ink">{roleText(roles[1] as PersonRole[])}</span>
          </p>
        ) : roles ? (
          <p className="text-[13px] text-ink-2">Roller: {roleText(roles as PersonRole[])}</p>
        ) : null}
        {typeof s.reason === 'string' && (
          <p className="text-[13px] text-ink-2">
            Neden:{' '}
            {CORPORATE_ARCHIVE_REASON_LABELS[s.reason as CorporateArchiveReason] ?? CORPORATE_RESTORE_REASON_LABELS[s.reason as CorporateRestoreReason] ?? PERSON_END_REASON_LABELS[s.reason as PersonEndReason] ?? s.reason}
          </p>
        )}
        {Array.isArray(s.acknowledgedDuplicates) && s.acknowledgedDuplicates.length > 0 && (
          <p className="text-[13px] text-ink-2">Benzer hesaplar kontrol edilerek ayrı hesap olarak kaydedildi: {(s.acknowledgedDuplicates as string[]).join(', ')}</p>
        )}
      </div>
    </li>
  )
}

function HistoryTab({ a }: { a: CorporateDetail }) {
  const session = useSession()
  const history = useQuery({ queryKey: ['corporate-history', session.company?.id, a.id], queryFn: () => corporateApi.history(a.id) })
  return (
    <Panel title="Geçmiş" action={<span className="text-[12.5px] text-ink-2">Kim, ne zaman, neyi değiştirdi</span>}>
      {history.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : history.isError ? (
        <ErrorState message={`Geçmiş yüklenemedi. ${history.error.message}`} onRetry={() => history.refetch()} />
      ) : history.data.items.length === 0 ? (
        <p className="text-ink-2">Bu hesap için kayıt geçmişi yok. Hesap, işlem geçmişi tutulmadan önce veya veri yüklemesiyle oluşturulmuş olabilir.</p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {history.data.items.map((e) => (
            <ActivityEntry key={e.id} e={e} />
          ))}
        </ol>
      )}
      <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Vergi kimliği, adres, telefon, e-posta ve kişi bilgilerinin değerleri geçmişe kopyalanmaz; yalnızca ne değiştiği tutulur.
      </p>
    </Panel>
  )
}

function Tabs({ tab, onTab, a }: { tab: CorporateTab; onTab: (t: CorporateTab) => void; a: CorporateDetail }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = list.current
    const el = bar?.querySelector<HTMLElement>(`#ktab-${tab}`)
    if (!bar || !el) return
    bar.scrollTo({ left: Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' })
  }, [tab])
  const counts: Partial<Record<CorporateTab, number>> = { adresler: a.addresses.length, vergi: a.taxIds.length, kisiler: a.peopleCount, suruculer: a.driverCount }
  return (
    <div className="border-b border-line">
      <div ref={list} role="tablist" aria-label="Kurumsal hesap bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {CORPORATE_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`ktab-${t}`}
            aria-selected={t === tab}
            aria-controls="corporate-tabpanel"
            onClick={() => onTab(t)}
            className={cn('relative h-11 shrink-0 px-3 font-medium whitespace-nowrap transition-colors', t === tab ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {TAB_LABELS[t]}
            {counts[t] ? <span className="tnum ml-1.5 text-[12px] text-ink-3">{counts[t]}</span> : null}
            {PENDING[t] && <span className="sr-only"> (henüz bağlı değil)</span>}
            {t === tab && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Kurumsal Hesap 360°: who the company works with, its records and history; other domains are marked as not yet connected. */
export function Corporate360Page() {
  const session = useSession()
  const navigate = useNavigate()
  const { accountId } = useParams({ from: '/app/kurumsal-hesaplar/$accountId' })
  const { sekme } = useSearch({ from: '/app/kurumsal-hesaplar/$accountId' })
  const tab: CorporateTab = sekme ?? 'genel'
  const canManage = can(session, 'corporate.manage')
  const q = useQuery({ queryKey: ['corporate-account', session.company?.id, accountId], queryFn: () => corporateApi.get(accountId), retry: false })
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<'archive' | 'restore' | null>(null)
  const onTab = (t: CorporateTab) => void navigate({ to: '/kurumsal-hesaplar/$accountId', params: { accountId }, search: t === 'genel' ? {} : { sekme: t }, replace: true, resetScroll: false })

  const back = (
    <Link to="/kurumsal-hesaplar" search={listSearchToReturnTo()} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Kurumsal Hesaplar
    </Link>
  )

  if (q.isError) {
    const e = q.error
    return (
      <div className="space-y-4">
        {back}
        {e instanceof ApiRequestError && e.status === 404 ? (
          <StatePanel icon={Buildings} title="Kurumsal hesap bulunamadı">
            <p>Bu adresteki hesap yok ya da aktif şirketinize ait değil.</p>
            <Link to="/kurumsal-hesaplar" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
              Kurumsal hesaplara dön
            </Link>
          </StatePanel>
        ) : e instanceof ApiRequestError && e.status === 403 ? (
          <StatePanel icon={Buildings} title="Erişim yetkiniz yok">
            <p>{e.message}</p>
          </StatePanel>
        ) : (
          <ErrorState message={e.message} onRetry={() => q.refetch()} />
        )}
      </div>
    )
  }
  if (!q.data) {
    return (
      <div aria-busy="true" aria-label="Kurumsal hesap yükleniyor" className="space-y-4">
        {back}
        <div className="h-[188px] animate-pulse rounded-xl bg-line-soft/70" />
        <div className="h-11 w-2/3 animate-pulse rounded bg-line-soft" />
        <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
      </div>
    )
  }

  const a = q.data
  const editable = canManage && a.status === 'active'
  return (
    <div className="space-y-5">
      {back}
      <Header a={a} canManage={canManage} onEdit={() => setEditing(true)} onArchive={() => setDialog('archive')} onRestore={() => setDialog('restore')} onTab={onTab} />
      <div>
        <Tabs tab={tab} onTab={onTab} a={a} />
        <div key={tab} id="corporate-tabpanel" role="tabpanel" aria-labelledby={`ktab-${tab}`} className="animate-fade pt-5">
          {tab === 'genel' && <Overview a={a} canManage={canManage} onEdit={() => setEditing(true)} onTab={onTab} />}
          {tab === 'adresler' && <AddressesTab a={a} editable={editable} />}
          {tab === 'vergi' && <TaxIdsTab a={a} editable={editable} />}
          {tab === 'kisiler' && <PeopleTab a={a} mode="all" canManage={canManage} />}
          {tab === 'suruculer' && <PeopleTab a={a} mode="drivers" canManage={canManage} />}
          {tab === 'gecmis' && <HistoryTab a={a} />}
          {tab === 'rezervasyonlar' && can(session, 'reservations.read') ? <RelatedReservations kind="account" id={a.id} /> : PENDING[tab] && <Pending tab={tab} />}
        </div>
      </div>
      {tab === 'genel' && a.status === 'active' && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
          <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
          Kredi limiti, bakiye ve risk bu modülde tutulmaz; Finans modülüyle gelecek.
        </p>
      )}
      {editing && <CorporateFormSheet mode="edit" account={a} onClose={() => setEditing(false)} />}
      {dialog && <ArchiveRestore a={a} mode={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}
