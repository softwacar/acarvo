import { CUSTOMER_ARCHIVE_REASONS, CUSTOMER_TABS, type CustomerActivityItem, type CustomerArchiveReason, type CustomerDetail, type CustomerTab } from '@acarvo/shared'
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  Buildings,
  CalendarCheck,
  ChatCircleText,
  CheckCircle,
  ClipboardText,
  Coins,
  DotsThree,
  EnvelopeSimple,
  type Icon,
  IdentificationCard,
  Info,
  Key,
  MapPin,
  PencilSimple,
  Phone,
  ShieldCheck,
  SpinnerGap,
  Translate,
  UserCircle,
  Users,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Dialog, DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Field, Select } from '@/components/fields'
import { ErrorState, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, customersApi } from '@/lib/api'
import {
  ARCHIVE_REASON_LABELS,
  CONTACT_PREFERENCE_LABELS,
  countryName,
  CUSTOMER_FIELD_LABELS,
  initials,
  languageName,
  RESIDENCY_LABELS,
  RESIDENCY_LONG,
} from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { CustomerFormSheet } from './CustomerForm'
import { listSearchToReturnTo } from './search'

// ---------------------------------------------------------------------------
// Tabs (spec §82 Müşteri 360°). Only Genel and Geçmiş hold real data in M1; the others say honestly what is coming.

const TAB_LABELS: Record<CustomerTab, string> = {
  genel: 'Genel ve iletişim',
  belgeler: 'Belgeler',
  rezervasyonlar: 'Rezervasyonlar',
  kiralamalar: 'Kiralamalar',
  cari: 'Cari ve tahsilatlar',
  gorevler: 'Görevler ve olaylar',
  gecmis: 'Kayıt geçmişi',
}

const PENDING: Partial<Record<CustomerTab, { icon: Icon; module: string; will: string[] }>> = {
  belgeler: {
    icon: IdentificationCard,
    module: 'Müşteri belgeleri (M2)',
    will: [
      'Kimlik, pasaport, giriş damgası ve ehliyet kayıtları; geçerlilik tarihleri',
      'Belge numaraları şifreli saklanır, ekranda maskeli görünür',
      'Tam numara ve belge görüntüsü yalnız yetkiyle ve kayıt altında açılır',
    ],
  },
  rezervasyonlar: {
    icon: CalendarCheck,
    module: 'Rezervasyonlar',
    will: ['Bu müşterinin yaklaşan ve geçmiş rezervasyonları', 'Rezervasyon durumu, araç sınıfı ve şube', 'Müşteri dosyasından yeni rezervasyon başlatma'],
  },
  kiralamalar: {
    icon: Key,
    module: 'Kiralamalar',
    will: ['Kiracı veya sürücü olduğu kiralamalar', 'Teslim ve iade bilgileri, sözleşme bağlantıları', 'Birincil ve ek sürücü olarak yer aldığı kayıtlar'],
  },
  cari: {
    icon: Coins,
    module: 'Finans',
    will: ['Tahakkuk, tahsilat ve açık bakiye; para birimleri ayrı', 'Depozito ve iade hareketleri', 'Kaynağına bağlı finans kayıtları; karışık toplam yok'],
  },
  gorevler: {
    icon: ClipboardText,
    module: 'Görevler ve Olay Merkezi',
    will: ['Müşteriyle ilgili açık görevler ve takipler', 'Hasar, ceza ve şikâyet olayları', 'Kim, ne zaman, ne yaptı bilgisiyle'],
  },
}

// ---------------------------------------------------------------------------
// Building blocks

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Label / value rows, hairline separated; empty values say so instead of showing nothing. */
function Facts({ rows, columns = 2 }: { rows: [string, ReactNode][]; columns?: 1 | 2 }) {
  return (
    <dl className={cn('grid gap-x-8', columns === 2 && 'sm:grid-cols-2')}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{v ?? <span className="font-normal text-ink-3">Girilmemiş</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft'

const LATER_ACTIONS = ['Rezervasyon oluştur', 'Kiralama aç', 'Belge ekle', 'Kurumsal hesaba bağla', 'İletişim kaydı ekle']

function MoreMenu({ c, canManage, onArchive, onRestore }: { c: CustomerDetail; canManage: boolean; onArchive: () => void; onRestore: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Diğer işlemler" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-line-soft hover:text-ink">
        <DotsThree size={20} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[252px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)]"
        >
          {canManage && (
            <>
              {c.status === 'archived' ? (
                <DropdownMenu.Item onSelect={onRestore} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                  <ArrowCounterClockwise size={16} /> Arşivden çıkar
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item onSelect={onArchive} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground">
                  <Archive size={16} /> Müşteriyi arşivle
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-3">İlgili modüllerle açılacak</DropdownMenu.Label>
          {LATER_ACTIONS.map((a) => (
            <DropdownMenu.Item key={a} disabled className="flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-[13.5px] text-ink-3 outline-none">
              {a}
              <span className="text-[11.5px]">yakında</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function ArchiveDialog({ c, onClose }: { c: CustomerDetail; onClose: () => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const returnFocus = useReturnFocus()
  const [reason, setReason] = useState<CustomerArchiveReason | ''>('')
  const [error, setError] = useState<string | null>(null)
  const archive = useMutation({
    mutationFn: () => customersApi.archive(c.id, c.version, reason),
    onSuccess: (next) => {
      qc.setQueryData(['customer', session.company?.id, c.id], next)
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer-history', session.company?.id, c.id] })
      toast(`${c.displayName} arşivlendi.`)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') {
        void qc.invalidateQueries({ queryKey: ['customer', session.company?.id, c.id] })
        return setError('Bu kayıt siz işlem yaparken güncellendi. Güncel bilgiler yüklendi; kontrol edip yeniden deneyin.')
      }
      setError(e instanceof ApiRequestError ? (e.fields?.reason ?? e.message) : 'Arşivlenemedi. Bağlantınızı kontrol edin.')
    },
  })
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">Müşteriyi arşivle</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {c.displayName} ({c.customerNo}) varsayılan listede görünmez. Kayıt ve geçmişi silinmez; dilediğiniz zaman arşivden çıkarabilirsiniz.
          </Dialog.Description>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason) return setError('Arşivleme nedeni seçin')
              setError(null)
              archive.mutate()
            }}
          >
            <Field id="archive-reason" label="Neden" required error={error ?? undefined}>
              <Select id="archive-reason" aria-invalid={error ? true : undefined} aria-describedby={error ? 'archive-reason-error' : undefined} value={reason} onChange={(e) => setReason(e.target.value as CustomerArchiveReason)}>
                <option value="">Seçin</option>
                {CUSTOMER_ARCHIVE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {ARCHIVE_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button type="submit" disabled={archive.isPending} className={cn(btnPrimary, 'disabled:opacity-60')}>
                {archive.isPending && <SpinnerGap size={16} className="animate-spin" />}
                Arşivle
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function useRestore(c: CustomerDetail | undefined) {
  const session = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => customersApi.restore(c!.id, c!.version),
    onSuccess: (next) => {
      qc.setQueryData(['customer', session.company?.id, next.id], next)
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['customer-history', session.company?.id, next.id] })
      toast(`${next.displayName} arşivden çıkarıldı.`)
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['customer', session.company?.id, c?.id] }),
  })
}

// ---------------------------------------------------------------------------
// Header: the customer's file

function ContactItem({ icon: Ico, label, children, href }: { icon: Icon; label: string; children: ReactNode; href?: string }) {
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

function Header({ c, canManage, onEdit, onArchive, onRestore, restoring }: { c: CustomerDetail; canManage: boolean; onEdit: () => void; onArchive: () => void; onRestore: () => void; restoring: boolean }) {
  const archived = c.status === 'archived'
  const nationality = countryName(c.nationality)
  return (
    <section aria-label="Müşteri özeti" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4 p-5 sm:p-6">
        <span aria-hidden className={cn('grid size-14 shrink-0 place-items-center rounded-xl text-[19px] font-semibold tracking-[0.02em]', archived ? 'bg-ground text-ink-3' : 'bg-blue-soft text-blue-ink')}>
          {initials(c.displayName)}
        </span>
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[12.5px] font-semibold tracking-[0.03em] text-ink-2">{c.customerNo}</span>
            {archived ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                <Archive size={14} />
                Arşivde
              </span>
            ) : (
              <span className="text-[13px] text-ink-2">Etkin müşteri</span>
            )}
          </div>
          <h1 className={cn('mt-1.5 text-[26px] leading-tight font-semibold tracking-[-0.025em] break-words sm:text-[30px]', archived && 'text-ink-2')}>{c.displayName}</h1>
          <p className="mt-1 text-ink-2">
            {RESIDENCY_LONG[c.residency]}
            {nationality && ` · ${nationality} uyruklu`}
            {c.createdBranch && ` · ${c.createdBranch.name} şubesinde açıldı`}
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
            <button type="button" onClick={onRestore} disabled={restoring} className={cn(btnSecondary, 'disabled:opacity-60')}>
              {restoring ? <SpinnerGap size={16} className="animate-spin" /> : <ArrowCounterClockwise size={16} />}
              Arşivden çıkar
            </button>
          )}
          <MoreMenu c={c} canManage={canManage} onArchive={onArchive} onRestore={onRestore} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-6 border-t border-line-soft px-5 py-2 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <ContactItem icon={Phone} label="Telefon" href={c.phone ? `tel:${c.phone.replace(/\s/g, '')}` : undefined}>
          {c.phone ? <span className="tnum">{c.phone}</span> : <span className="font-normal text-ink-3">Girilmemiş</span>}
        </ContactItem>
        <ContactItem icon={EnvelopeSimple} label="E-posta" href={c.email ? `mailto:${c.email}` : undefined}>
          {c.email ?? <span className="font-normal text-ink-3">Girilmemiş</span>}
        </ContactItem>
        <ContactItem icon={ChatCircleText} label="İletişim tercihi">
          {c.contactPreference ? CONTACT_PREFERENCE_LABELS[c.contactPreference] : <span className="font-normal text-ink-3">Belirtilmemiş</span>}
        </ContactItem>
        <ContactItem icon={Translate} label="Hizmet dili">
          {languageName(c.preferredLanguage) ?? <span className="font-normal text-ink-3">Belirtilmemiş</span>}
        </ContactItem>
      </div>
      {archived && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft bg-ground/60 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
          <Archive size={16} className="shrink-0 text-ink-3" />
          <span>
            {c.archivedAt ? formatDate(c.archivedAt) : ''} tarihinde {c.archivedByName ? `${c.archivedByName} tarafından arşivlendi` : 'arşivlendi (arşivleyen kullanıcı bilgisi yok)'} · Neden:{' '}
            <span className="font-medium text-ink">{c.archivedReason ? ARCHIVE_REASON_LABELS[c.archivedReason] : '—'}</span>
          </span>
          <span className="basis-full text-[12.5px] sm:basis-auto">Arşivdeki kayıt düzenlenemez; kayıt ve geçmişi silinmez.</span>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tab contents

function addressLines(c: CustomerDetail) {
  const cityLine = [c.postalCode, c.city].filter(Boolean).join(' ')
  return [c.addressLine1, c.addressLine2, cityLine, c.region, countryName(c.addressCountry)].filter(Boolean) as string[]
}

function FileStatus({ c, onTab }: { c: CustomerDetail; onTab: (t: CustomerTab) => void }) {
  const rows: [Icon, string, ReactNode, CustomerTab | null][] = [
    [UserCircle, 'Kişi ve iletişim bilgileri', <span className="inline-flex items-center gap-1 text-ok"><CheckCircle size={14} weight="fill" />Kayıtlı</span>, null],
    [IdentificationCard, 'Kimlik ve ehliyet belgeleri', <span className="text-ink-3">Sonraki aşamada</span>, 'belgeler'],
    [Buildings, 'Kurumsal hesap bağlantıları', <span className="text-ink-3">Henüz bağlı değil</span>, null],
    [CalendarCheck, 'Rezervasyonlar', <span className="text-ink-3">Henüz bağlı değil</span>, 'rezervasyonlar'],
    [Key, 'Kiralamalar', <span className="text-ink-3">Henüz bağlı değil</span>, 'kiralamalar'],
    [Coins, 'Cari hesap', <span className="text-ink-3">Finans modülüyle</span>, 'cari'],
  ]
  return (
    <Panel title="Müşteri dosyası">
      <ul className="-mx-2">
        {rows.map(([Ico, label, state, tab]) => {
          const content = (
            <>
              <Ico size={17} className="shrink-0 text-ink-3" />
              <span className="flex-1 truncate text-ink">{label}</span>
              <span className="shrink-0 text-[12.5px]">{state}</span>
            </>
          )
          return (
            <li key={label}>
              {tab ? (
                <button type="button" onClick={() => onTab(tab)} className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-ground">
                  {content}
                </button>
              ) : (
                <div className="flex h-10 items-center gap-3 px-2">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
      {c.status === 'active' && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
          <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
          Eksik belgeler rezervasyonu engellemez; kiralama öncesi kontrol Kiralamalar modülüyle gelecek.
        </p>
      )}
    </Panel>
  )
}

function Overview({ c, canManage, onEdit, onTab }: { c: CustomerDetail; canManage: boolean; onEdit: () => void; onTab: (t: CustomerTab) => void }) {
  const edit = canManage && c.status === 'active' ? (
    <button type="button" onClick={onEdit} className="text-[13px] font-medium text-blue hover:underline">
      Düzenle
    </button>
  ) : undefined
  const address = addressLines(c)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Panel title="Kişi bilgileri" action={edit}>
          <Facts
            rows={[
              ['Ad', c.givenName],
              ['Soyad', c.familyName],
              ['Müşteri türü', RESIDENCY_LABELS[c.residency]],
              ['Uyruk', countryName(c.nationality)],
              ['Doğum tarihi', c.dateOfBirth && <span className="tnum">{formatDate(c.dateOfBirth)}</span>],
              ['Müşteri no', <span className="tnum">{c.customerNo}</span>],
            ]}
          />
        </Panel>
        <Panel title="Adres" action={edit}>
          {address.length ? (
            <address className="leading-relaxed text-ink not-italic">
              {address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="flex items-center gap-2 text-ink-2">
              <MapPin size={16} className="text-ink-3" />
              Adres girilmemiş.
            </p>
          )}
        </Panel>
        <Panel title="Operasyonel not" action={edit}>
          {c.operationalNote ? <p className="whitespace-pre-line text-ink">{c.operationalNote}</p> : <p className="text-ink-2">Not yok.</p>}
        </Panel>
      </div>
      <div className="min-w-0 space-y-5">
        <FileStatus c={c} onTab={onTab} />
        <Panel title="Kayıt bilgisi">
          <Facts
            columns={1}
            rows={[
              ['Kayıt şubesi', c.createdBranch?.name ?? null],
              ['Oluşturan', c.createdByName ?? <span className="font-normal text-ink-3">Kullanıcı bilgisi yok</span>],
              ['Oluşturulma', <span className="tnum">{formatDateTime(c.createdAt)}</span>],
              ['Son değişiklik', <span className="tnum">{formatDateTime(c.updatedAt)}</span>],
              ['Değiştiren', c.updatedByName ?? <span className="font-normal text-ink-3">Kullanıcı bilgisi yok</span>],
              ['Sürüm', <span className="tnum">{c.version}</span>],
            ]}
          />
          {/* Every record saved through the app stores its user; an empty value means the record came from outside the screens. */}
          {(!c.createdByName || !c.updatedByName) && (
            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-2">
              <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
              Bu kayıt uygulama ekranları dışında oluşturulmuş veya değiştirilmiş (ör. veri yüklemesi); işlemi yapan kullanıcı bilinmiyor.
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Pending({ tab }: { tab: CustomerTab }) {
  const p = PENDING[tab]!
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-8">
        <div>
          <span className="grid size-11 place-items-center rounded-lg bg-ground text-ink-2">
            <p.icon size={22} />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.01em]">{TAB_LABELS[tab]} henüz bağlı değil</h2>
          <p className="mt-1.5 max-w-[460px] text-ink-2">
            <span className="font-medium text-ink">{p.module}</span> ile bu müşterinin gerçek kayıtları burada görünecek. Şimdilik örnek veya temsili veri gösterilmez.
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
  'customer.create': 'Müşteri kaydı oluşturuldu',
  'customer.update': 'Müşteri bilgileri güncellendi',
  'customer.archive': 'Müşteri arşivlendi',
  'customer.restore': 'Müşteri arşivden çıkarıldı',
}

function valueText(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  const s = String(value)
  if (field === 'residency') return RESIDENCY_LABELS[s as 'local'] ?? s
  if (field === 'preferredLanguage') return languageName(s) ?? s
  if (field === 'contactPreference') return CONTACT_PREFERENCE_LABELS[s as 'phone'] ?? s
  return s
}

function ActivityEntry({ a }: { a: CustomerActivityItem }) {
  const s = (a.summary ?? {}) as Record<string, unknown>
  const fields = (s.fields as string[] | undefined) ?? []
  const values = (s.values as Record<string, [unknown, unknown]> | undefined) ?? {}
  const acknowledged = (s.acknowledgedDuplicates as string[] | undefined) ?? []
  return (
    <li className="grid grid-cols-[20px_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 size-2.5 rounded-full border-2', a.action === 'customer.create' ? 'border-blue bg-blue' : 'border-ink-3 bg-surface')} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{ACTION_TITLES[a.action] ?? a.action}</span>
          <span className="tnum text-[12.5px] text-ink-2">
            {formatDateTime(a.at)}
            {a.actorName && ` · ${a.actorName}`}
          </span>
        </div>
        {a.action === 'customer.update' && fields.length > 0 && (
          <p className="mt-0.5 text-[13px] text-ink-2">
            Değişen alanlar: <span className="text-ink">{fields.map((f) => CUSTOMER_FIELD_LABELS[f] ?? f).join(', ')}</span>
          </p>
        )}
        {Object.entries(values).map(([field, [before, after]]) => (
          <p key={field} className="text-[13px] text-ink-2">
            {CUSTOMER_FIELD_LABELS[field] ?? field}: {valueText(field, before)} → <span className="font-medium text-ink">{valueText(field, after)}</span>
          </p>
        ))}
        {a.action === 'customer.archive' && typeof s.reason === 'string' && (
          <p className="mt-0.5 text-[13px] text-ink-2">Neden: {ARCHIVE_REASON_LABELS[s.reason as CustomerArchiveReason] ?? s.reason}</p>
        )}
        {acknowledged.length > 0 && <p className="mt-0.5 text-[13px] text-ink-2">Benzer kayıtlar kontrol edilerek ayrı kişi olarak kaydedildi: {acknowledged.join(', ')}</p>}
      </div>
    </li>
  )
}

function HistoryTab({ c }: { c: CustomerDetail }) {
  const session = useSession()
  const history = useQuery({ queryKey: ['customer-history', session.company?.id, c.id], queryFn: () => customersApi.history(c.id) })
  return (
    <Panel title="Kayıt geçmişi" action={<span className="text-[12.5px] text-ink-2">Kim, ne zaman, neyi değiştirdi</span>}>
      {history.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : history.isError ? (
        <ErrorState message={`Kayıt geçmişi yüklenemedi. ${history.error.message}`} onRetry={() => history.refetch()} />
      ) : history.data.items.length === 0 ? (
        <p className="text-ink-2">Bu müşteri için kayıt geçmişi yok. Kayıt, işlem geçmişi tutulmadan önce oluşturulmuş olabilir.</p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {history.data.items.map((a) => (
            <ActivityEntry key={a.id} a={a} />
          ))}
        </ol>
      )}
      <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <ShieldCheck size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Kişisel bilgilerin eski ve yeni değerleri geçmişe kopyalanmaz; yalnızca hangi alanın değiştiği tutulur.
      </p>
    </Panel>
  )
}

function Tabs({ tab, onTab }: { tab: CustomerTab; onTab: (t: CustomerTab) => void }) {
  const list = useRef<HTMLDivElement>(null)
  // Keep the selected tab visible in the horizontally scrolling bar (phones, narrow windows).
  useEffect(() => {
    const bar = list.current
    const el = bar?.querySelector<HTMLElement>(`#ctab-${tab}`)
    if (!bar || !el) return
    bar.scrollTo({ left: Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' })
  }, [tab])
  return (
    <div className="border-b border-line">
      <div ref={list} role="tablist" aria-label="Müşteri bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {CUSTOMER_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`ctab-${t}`}
            aria-selected={t === tab}
            aria-controls="customer-tabpanel"
            onClick={() => onTab(t)}
            className={cn('relative h-11 shrink-0 px-3 font-medium whitespace-nowrap transition-colors', t === tab ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {TAB_LABELS[t]}
            {PENDING[t] && <span className="sr-only"> (henüz bağlı değil)</span>}
            {t === tab && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page

/** Müşteri 360°: the customer's digital file. Real person data and record history; other domains are marked as not yet connected. */
export function Customer360Page() {
  const session = useSession()
  const navigate = useNavigate()
  const { customerId } = useParams({ from: '/app/musteriler/$customerId' })
  const { sekme } = useSearch({ from: '/app/musteriler/$customerId' })
  const tab: CustomerTab = sekme ?? 'genel'
  const canManage = can(session, 'customers.manage')
  const customer = useQuery({ queryKey: ['customer', session.company?.id, customerId], queryFn: () => customersApi.get(customerId), retry: false })
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const restore = useRestore(customer.data)

  const onTab = (t: CustomerTab) => void navigate({ to: '/musteriler/$customerId', params: { customerId }, search: t === 'genel' ? {} : { sekme: t }, replace: true, resetScroll: false })

  const back = (
    <Link to="/musteriler" search={listSearchToReturnTo()} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft size={14} />
      Müşteriler
    </Link>
  )

  if (customer.isError) {
    const e = customer.error
    return (
      <div className="space-y-4">
        {back}
        {e instanceof ApiRequestError && e.status === 404 ? (
          <StatePanel icon={Users} title="Müşteri bulunamadı">
            <p>Bu adresteki müşteri yok ya da aktif şirketinize ait değil.</p>
            <Link to="/musteriler" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
              Müşterilere dön
            </Link>
          </StatePanel>
        ) : e instanceof ApiRequestError && e.status === 403 ? (
          <StatePanel icon={Users} title="Erişim yetkiniz yok">
            <p>{e.message}</p>
          </StatePanel>
        ) : (
          <ErrorState message={e.message} onRetry={() => customer.refetch()} />
        )}
      </div>
    )
  }
  if (!customer.data) {
    return (
      <div aria-busy="true" aria-label="Müşteri yükleniyor" className="space-y-4">
        {back}
        <div className="h-[188px] animate-pulse rounded-xl bg-line-soft/70" />
        <div className="h-11 w-2/3 animate-pulse rounded bg-line-soft" />
        <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
      </div>
    )
  }

  const c = customer.data
  return (
    <div className="space-y-5">
      {back}
      <Header c={c} canManage={canManage} onEdit={() => setEditing(true)} onArchive={() => setArchiving(true)} onRestore={() => restore.mutate()} restoring={restore.isPending} />
      {restore.isError && (
        <p role="alert" className="rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
          {restore.error instanceof ApiRequestError && restore.error.code === 'VERSION_CONFLICT'
            ? 'Bu kayıt siz işlem yaparken güncellendi. Güncel bilgiler yüklendi; kontrol edip yeniden deneyin.'
            : restore.error.message}
        </p>
      )}
      <div>
        <Tabs tab={tab} onTab={onTab} />
        <div key={tab} id="customer-tabpanel" role="tabpanel" aria-labelledby={`ctab-${tab}`} className="animate-fade pt-5">
          {tab === 'genel' && <Overview c={c} canManage={canManage} onEdit={() => setEditing(true)} onTab={onTab} />}
          {tab === 'gecmis' && <HistoryTab c={c} />}
          {PENDING[tab] && <Pending tab={tab} />}
        </div>
      </div>
      {editing && <CustomerFormSheet mode="edit" customer={c} onClose={() => setEditing(false)} />}
      {archiving && <ArchiveDialog c={c} onClose={() => setArchiving(false)} />}
    </div>
  )
}

