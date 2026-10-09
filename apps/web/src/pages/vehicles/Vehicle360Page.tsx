import { type VehicleActivityItem, type VehicleDetail, type VehicleHistory, type VehicleTab, VEHICLE_TABS } from '@acarvo/shared'
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CalendarCheck,
  Camera,
  CarProfile,
  ClipboardText,
  ClockCounterClockwise,
  Coins,
  DotsThree,
  Files,
  Gauge,
  type Icon,
  Info,
  Key,
  LockSimple,
  MapPin,
  PencilSimple,
  ShieldCheck,
  Tag,
  WarningCircle,
  Wrench,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Plate } from '@/components/Plate'
import { ErrorState, StatePanel } from '@/components/states'
import { ApiRequestError, vehicle360Api, vehiclesApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  ACQUISITION_LABELS,
  FUEL_LABELS,
  formatDate,
  formatDateTime,
  formatKm,
  formatMoney,
  LOCATION_LABELS,
  STATUS_LABELS,
  TRANSMISSION_LABELS,
} from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { listSearchToReturnTo } from './search'

// ---------------------------------------------------------------------------
// Tabs (spec §13.3: 8 fixed tabs inside the vehicle, never sidebar links)

const TAB_LABELS: Record<VehicleTab, string> = {
  genel: 'Genel bakış',
  musaitlik: 'Müsaitlik ve planlama',
  kiralamalar: 'Kiralama geçmişi',
  kontroller: 'Durum ve kontroller',
  bakim: 'Bakım ve lastikler',
  belgeler: 'Belgeler ve riskler',
  finans: 'Finans ve performans',
  gecmis: 'Konum ve geçmiş',
}

/** What each not-yet-built tab will hold, from spec §13.3, and which module brings it. */
const PENDING: Partial<Record<VehicleTab, { icon: Icon; module: string; will: string[] }>> = {
  musaitlik: {
    icon: CalendarCheck,
    module: 'Rezervasyonlar ve Kiralamalar',
    will: [
      '7, 30 ve 90 günlük müsaitlik çizelgesi; şube yerel saatiyle',
      'Onaylı rezervasyon, kiralama, bakım ve transfer blokları',
      'Tarih aralığı için müsaitlik kontrolü ve rezervasyon başlatma',
    ],
  },
  kiralamalar: {
    icon: Key,
    module: 'Kiralamalar',
    will: ['Aktif, yaklaşan ve geçmiş kiralama ve rezervasyonlar', 'Teslim ve iade kilometresi, operasyon ve finans durumu', 'Kiralama dosyası, sözleşme ve karşılaştırma bağlantıları'],
  },
  kontroller: {
    icon: ClipboardText,
    module: 'Teslim, iade ve hazırlık akışları',
    will: ['Teslime hazırlık maddeleri ve nedenleri', 'Teslim ve iade kontrolleri: fotoğraf, kilometre, yakıt, hasar notu', 'Anahtar ve ekipman durumu'],
  },
  bakim: {
    icon: Wrench,
    module: 'Bakım ve Servis',
    will: ['Geçmiş, açık, planlı ve geciken bakım kayıtları', 'Kilometre veya süreye bağlı bakım planı', 'Lastik setleri ve değişim geçmişi'],
  },
  finans: {
    icon: Coins,
    module: 'Finans',
    will: ['Araç bazında tahakkuk, tahsilat ve kaynak bağlantılı maliyetler', 'Para birimleri ayrı; karışık toplam yok', 'Kullanım, boş ve servis günleri; açık payda ile'],
  },
}

// ---------------------------------------------------------------------------
// Small building blocks

function Panel({ title, action, children, className, id }: { title: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">
      {children}
      <ArrowRight size={13} />
    </button>
  )
}

/** Label / value pairs in two columns, hairline separated. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 truncate text-right font-medium text-ink">{v ?? <span className="font-normal text-ink-3">Girilmemiş</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

const btnPrimary =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(16_24_40/0.12)] transition-colors hover:bg-blue-ink'
const btnSecondary =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-colors hover:bg-line-soft'

/** Spec §13.3 quick actions. Shown so the user knows where they will live; each says why it is not available yet. */
const LATER_ACTIONS = ['Yeni rezervasyon', 'Kiralama aç', 'Müsaitliği kontrol et', 'Bakım planla', 'Hasar bildir', 'Ceza kaydet', 'Transfer başlat', 'Belge ekle', 'Fotoğraf ekle']

function MoreMenu({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Diğer işlemler" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-line-soft hover:text-ink">
        <DotsThree size={20} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[248px] animate-fade rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18),0_2px_6px_rgb(16_24_40/0.06)]"
        >
          {canEdit && (
            <>
              <DropdownMenu.Item
                onSelect={() => navigate({ to: '/araclar/$vehicleId/duzenle', params: { vehicleId }, search: { geri: 'arac' } })}
                className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ink outline-none data-[highlighted]:bg-ground"
              >
                <PencilSimple size={16} /> Aracı düzenle
              </DropdownMenu.Item>
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

// ---------------------------------------------------------------------------
// Hero: photo stage + identity, then the facts strip

/** Profile photo area. No upload yet, so it says so instead of showing a stock car. */
function PhotoStage({ v }: { v: VehicleDetail }) {
  return (
    <div className="min-w-0">
      <div className="relative grid aspect-[16/7] place-items-center overflow-hidden rounded-[14px] border border-line lg:aspect-[16/10] bg-[radial-gradient(120%_80%_at_50%_100%,#e6e9ef_0%,#f3f4f7_55%,#f7f8fa_100%)]">
        <div aria-hidden className="absolute inset-x-[12%] bottom-[22%] h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
        <div className="relative max-w-[360px] px-6 text-center">
          <CarProfile weight="thin" className="mx-auto size-16 text-ink-3/70 lg:size-28" aria-hidden />
          <p className="mt-2 font-semibold text-ink">Tanıtım fotoğrafı eklenmedi</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">
            {v.make} {v.model} için en fazla bir tanıtım fotoğrafı tutulur. Fotoğraf yükleme bir sonraki aşamada açılacak; fotoğrafın olmaması aracın kullanımına engel değildir.
          </p>
        </div>
        <span className="absolute bottom-3 left-3 rounded-md bg-surface/92 px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-[0_0_0_1px_var(--ac-line)]">Tanıtım fotoğrafı</span>
      </div>
      <div className="mt-3 grid grid-cols-[88px_1fr] items-stretch gap-3">
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line bg-surface text-ink-3" aria-label="Tanıtım fotoğrafı yok">
          <Camera size={20} />
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px]">
          <ShieldCheck size={17} weight="fill" className="mt-px shrink-0 text-blue" />
          <p className="text-ink-2">
            <span className="font-medium text-ink">Teslim ve iade fotoğrafları</span> kiralama kontrolleriyle oluşur; değiştirilemez kanıt kaydıdır ve tanıtım fotoğrafıyla
            karıştırılmaz. Henüz kontrol kaydı yok.
          </p>
        </div>
      </div>
    </div>
  )
}

function StatusCard({ v }: { v: VehicleDetail }) {
  const active = v.status === 'active'
  return (
    <div className="mt-5 rounded-[14px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className={cn('text-[22px] font-semibold tracking-[-0.015em]', !active && 'text-hold')}>{STATUS_LABELS[v.status]}</span>
          <span className="text-ink-2">kullanım durumu</span>
        </div>
        <span className="text-[13px] text-ink-3">sürüm {v.version}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">
        {active ? 'Araç filoda ve kullanıma açık olarak kayıtlı.' : 'Araç geçici olarak kullanım dışı kayıtlı.'} Bu, aracın varlık durumudur; müsaitlik ve hazırlıktan ayrı izlenir.
      </p>
      <div className="mt-4 flex items-start gap-2.5 border-t border-line-soft pt-3.5 text-[13px]">
        <Info size={16} className="mt-px shrink-0 text-ink-3" />
        <p className="min-w-0 text-ink-2">
          <span className="font-medium text-ink">Müsaitlik, aktif kiralama ve sıradaki teslim</span> Rezervasyonlar ve Kiralamalar modülleri bağlandığında burada
          gösterilecek. Şu an tahmini veya örnek durum gösterilmez.
        </p>
      </div>
    </div>
  )
}

function Fact({ icon: Ico, label, value, note, muted }: { icon: Icon; label: string; value: ReactNode; note: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0 border-line py-4 pr-4 xl:border-l xl:pl-5 xl:first:border-l-0 xl:first:pl-0">
      <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
        <Ico size={15} className="text-ink-3" />
        {label}
      </dt>
      <dd className={cn('tnum mt-1 truncate text-[16px] font-semibold tracking-[-0.01em]', muted && 'font-medium text-ink-3')}>{value}</dd>
      <dd className="mt-0.5 truncate text-[12.5px] text-ink-2">{note}</dd>
    </div>
  )
}

function locationText(v: { location: VehicleDetail['location'] }) {
  if (!v.location) return null
  return v.location.type === 'branch' ? v.location.branchName : LOCATION_LABELS[v.location.type]
}

function FactsStrip({ v }: { v: VehicleDetail }) {
  const where = locationText(v)
  const away = v.location && (v.location.type !== 'branch' || v.location.branchName !== v.homeBranchName)
  return (
    <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-3 xl:grid-cols-6">
      <Fact
        icon={MapPin}
        label="Konum"
        value={where ?? 'Kayıt yok'}
        muted={!where}
        note={v.location ? (away ? <span className="font-medium text-hold">Ana şube dışında · {formatDate(v.location.at)}</span> : `Ana şubede · ${formatDate(v.location.at)}`) : 'Konum kaydı bulunmuyor'}
      />
      <Fact
        icon={Gauge}
        label="Kilometre"
        value={v.odometer ? formatKm(v.odometer.km) : 'Doğrulanmadı'}
        muted={!v.odometer}
        note={v.odometer ? `Son okuma ${formatDate(v.odometer.at)}` : 'Kilometre kaydı bulunmuyor'}
      />
      <Fact icon={Buildings} label="Ana şube" value={v.homeBranchName} note="Yetki ve bağlılık şubesi" />
      <Fact
        icon={Tag}
        label="Filoya giriş"
        value={v.acquisitionType ? ACQUISITION_LABELS[v.acquisitionType] : 'Belirtilmedi'}
        muted={!v.acquisitionType}
        note={v.acquisitionDate ? formatDate(v.acquisitionDate) : 'Edinim tarihi girilmemiş'}
      />
      <Fact icon={Files} label="Belgeler" value="Kayıt yok" muted note="Yükleme sonraki aşamada" />
      <Fact
        icon={ClockCounterClockwise}
        label="Son değişiklik"
        value={formatDate(v.updatedAt)}
        note={v.updatedByName ? `${v.updatedByName} · sürüm ${v.version}` : `sürüm ${v.version}`}
      />
    </dl>
  )
}

/** Compact identity + action bar: pinned below 1024px, slides in on wider screens once the hero scrolls away. */
function StatusBar({ v, show, canEdit }: { v: VehicleDetail; show: boolean; canEdit: boolean }) {
  const session = useSession()
  useEffect(() => {
    document.documentElement.style.setProperty('--bar', show ? '56px' : '0px')
    return () => {
      document.documentElement.style.setProperty('--bar', '0px')
    }
  }, [show])
  return (
    <div
      className={cn(
        'z-[25] border-b border-line bg-surface/95 backdrop-blur-sm transition-transform duration-300',
        'sticky top-16 lg:fixed lg:right-0 lg:left-[256px]',
        show ? 'lg:translate-y-0' : 'lg:pointer-events-none lg:-translate-y-[calc(100%+4rem)]',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 lg:px-8">
        <Plate plate={v.plate} country={session.company?.country} />
        <span className="hidden truncate font-medium md:inline">
          {v.make} {v.model}
        </span>
        <span aria-hidden className="hidden h-6 w-px bg-line md:block" />
        <span className={cn('font-semibold', v.status !== 'active' && 'text-hold')}>{STATUS_LABELS[v.status]}</span>
        <span className="hidden truncate text-[13px] text-ink-2 sm:inline">
          {v.odometer ? formatKm(v.odometer.km) : 'Km doğrulanmadı'} · {locationText(v) ?? 'konum kaydı yok'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <Link to="/araclar/$vehicleId/duzenle" params={{ vehicleId: v.id }} search={{ geri: 'arac' }} className={cn(btnPrimary, 'h-9 px-3.5')}>
              <PencilSimple size={15} />
              <span className="hidden sm:inline">Düzenle</span>
            </Link>
          )}
          <MoreMenu vehicleId={v.id} canEdit={canEdit} />
        </div>
      </div>
    </div>
  )
}

function Hero({ v, canEdit, onTab }: { v: VehicleDetail; canEdit: boolean; onTab: (t: VehicleTab) => void }) {
  const session = useSession()
  const actionsRef = useRef<HTMLDivElement>(null)
  const [heroGone, setHeroGone] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1023.98px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)')
    const onMq = () => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)
    const el = actionsRef.current
    const io = el ? new IntersectionObserver(([e]) => setHeroGone(!e!.isIntersecting && e!.boundingClientRect.top < 0), { rootMargin: '-64px 0px 0px 0px' }) : null
    if (el && io) io.observe(el)
    return () => {
      mq.removeEventListener('change', onMq)
      io?.disconnect()
    }
  }, [])

  const subtitle = [v.trim, v.modelYear, v.className && `${v.className} sınıfı`].filter(Boolean).join(', ')
  return (
    <>
      <StatusBar v={v} show={narrow || heroGone} canEdit={canEdit} />
      <section aria-label="Araç özeti" className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 pt-5 lg:px-8">
          <Link to="/araclar" search={listSearchToReturnTo()} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft size={14} />
            Araçlar
          </Link>
        </div>
        <div className="mx-auto grid max-w-[1400px] gap-x-10 gap-y-6 px-4 pt-4 pb-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-x-8 lg:px-8 xl:gap-x-10">
          <PhotoStage v={v} />

          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Plate plate={v.plate} country={session.company?.country} size="md" />
              <span className="text-[13px] text-ink-2">{[v.vehicleCode, 'kendi filo'].filter(Boolean).join(', ')}</span>
            </div>
            <h1 className="mt-4 text-[34px] leading-[1.04] font-semibold tracking-[-0.03em] sm:text-[42px]">
              {v.make} {v.model}
            </h1>
            {subtitle && <p className="mt-2 text-[16px] text-ink-2">{subtitle}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-line-soft pt-4 text-[13px] sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ['Yakıt', FUEL_LABELS[v.fuelType]],
                  ['Vites', TRANSMISSION_LABELS[v.transmission]],
                  ['Koltuk', v.seats ?? null],
                  ['Renk', v.color],
                ] as [string, ReactNode][]
              ).map(([k, val]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className={cn('truncate font-medium', val === null && 'font-normal text-ink-3')}>{val ?? 'Girilmemiş'}</dd>
                </div>
              ))}
            </dl>

            <StatusCard v={v} />

            <div ref={actionsRef} className="mt-5 flex flex-wrap items-center gap-2">
              {canEdit && (
                <Link to="/araclar/$vehicleId/duzenle" params={{ vehicleId: v.id }} search={{ geri: 'arac' }} className={btnPrimary}>
                  <PencilSimple size={16} />
                  Aracı düzenle
                </Link>
              )}
              <button type="button" className={btnSecondary} onClick={() => onTab('gecmis')}>
                <ClockCounterClockwise size={16} />
                Konum ve geçmiş
              </button>
              <MoreMenu vehicleId={v.id} canEdit={canEdit} />
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-ink-2">
              <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
              Rezervasyon, kiralama, bakım ve belge işlemleri ilgili modüller geliştirildiğinde bu ekrandan başlatılacak.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-[1400px] px-4 lg:px-8">
          <FactsStrip v={v} />
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Tab contents

const ODOMETER_EVENT_LABELS: Record<string, string> = { initial: 'Başlangıç kaydı', correction: 'Düzeltme' }
const LOCATION_EVENT_LABELS: Record<string, string> = { initial: 'Başlangıç konumu' }

const FIELD_LABELS: Record<string, string> = {
  plate: 'Plaka',
  vehicleCode: 'Araç kodu',
  make: 'Marka',
  model: 'Model',
  trim: 'Donanım',
  modelYear: 'Model yılı',
  classId: 'Sınıf',
  color: 'Renk',
  vin: 'Şasi no',
  fuelType: 'Yakıt',
  transmission: 'Vites',
  seats: 'Koltuk',
  homeBranchId: 'Ana şube',
  status: 'Kullanım durumu',
  acquisitionType: 'Edinim türü',
  acquisitionDate: 'Edinim tarihi',
  acquisitionSeller: 'Satıcı',
  acquisitionCostMinor: 'Edinim tutarı',
  acquisitionCurrency: 'Para birimi',
  acquisitionReference: 'Fatura / sözleşme no',
  notes: 'Notlar',
}

function useChangeFormatter() {
  const session = useSession()
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: vehiclesApi.classes })
  return (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—'
    const s = String(value)
    switch (field) {
      case 'classId':
        return classes.data?.items.find((c) => c.id === s)?.name ?? 'başka sınıf'
      case 'homeBranchId':
        return session.branches.find((b) => b.id === s)?.name ?? 'yetkiniz dışındaki şube'
      case 'fuelType':
        return FUEL_LABELS[s as keyof typeof FUEL_LABELS] ?? s
      case 'transmission':
        return TRANSMISSION_LABELS[s as keyof typeof TRANSMISSION_LABELS] ?? s
      case 'status':
        return STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s
      case 'acquisitionType':
        return ACQUISITION_LABELS[s as keyof typeof ACQUISITION_LABELS] ?? s
      case 'acquisitionCostMinor':
        return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Number(s) / 100)
      case 'acquisitionDate':
        return formatDate(s)
      default:
        return s.length > 60 ? `${s.slice(0, 60)}…` : s
    }
  }
}

function ActivityEntry({ a }: { a: VehicleActivityItem }) {
  const fmt = useChangeFormatter()
  const changes = (a.summary?.changes ?? {}) as Record<string, [unknown, unknown]>
  const title = a.action === 'vehicle.create' ? 'Araç kaydı oluşturuldu' : a.action === 'vehicle.update' ? 'Araç bilgileri güncellendi' : a.action
  return (
    <li className="grid grid-cols-[20px_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-1.5 size-2.5 rounded-full border-2', a.action === 'vehicle.create' ? 'border-blue bg-blue' : 'border-ink-3 bg-surface')} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{title}</span>
          <span className="tnum text-[12.5px] text-ink-2">
            {formatDateTime(a.at)}
            {a.actorName && ` · ${a.actorName}`}
          </span>
        </div>
        {a.action === 'vehicle.update' && Object.keys(changes).length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            {Object.entries(changes).map(([field, [before, after]]) => (
              <li key={field} className="text-ink-2">
                <span className="text-ink">{FIELD_LABELS[field] ?? field}:</span> <span className="text-ink-3 line-through decoration-ink-3/40">{fmt(field, before)}</span>{' '}
                <ArrowRight size={11} className="inline text-ink-3" /> <span className="font-medium text-ink">{fmt(field, after)}</span>
              </li>
            ))}
          </ul>
        )}
        {a.action === 'vehicle.create' && (
          <p className="mt-0.5 text-[13px] text-ink-2">
            {typeof a.summary?.initialOdometerKm === 'number' ? `Başlangıç kilometresi ${formatKm(a.summary.initialOdometerKm)}` : 'Başlangıç kilometresi girilmedi'}
          </p>
        )}
      </div>
    </li>
  )
}

interface TimelineItem {
  key: string
  at: string
  icon: Icon
  title: string
  detail: string
  by: string | null
}

function recentItems(history: VehicleHistory | undefined): TimelineItem[] {
  if (!history) return []
  return [
    ...history.odometer.map((o) => ({
      key: `o${o.id}`,
      at: o.occurredAt,
      icon: Gauge,
      title: `Kilometre: ${formatKm(o.km)}`,
      detail: ODOMETER_EVENT_LABELS[o.eventType] ?? o.eventType,
      by: o.recordedByName,
    })),
    ...history.locations.map((l) => ({
      key: `l${l.id}`,
      at: l.occurredAt,
      icon: MapPin,
      title: `Konum: ${l.type === 'branch' ? l.branchName : LOCATION_LABELS[l.type]}`,
      detail: LOCATION_EVENT_LABELS[l.eventType] ?? l.eventType,
      by: l.recordedByName,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))
}

function Overview({ v, history, onTab, canEdit }: { v: VehicleDetail; history?: VehicleHistory; onTab: (t: VehicleTab) => void; canEdit: boolean }) {
  const navigate = useNavigate()
  const items = recentItems(history).slice(0, 5)
  const edit = () => navigate({ to: '/araclar/$vehicleId/duzenle', params: { vehicleId: v.id }, search: { geri: 'arac' } })
  const links: [VehicleTab, Icon, string][] = [
    ['musaitlik', CalendarCheck, 'Müsaitlik ve planlama'],
    ['kiralamalar', Key, 'Kiralamalar ve rezervasyonlar'],
    ['kontroller', ClipboardText, 'Teslime hazırlık ve kontroller'],
    ['bakim', Wrench, 'Bakım ve lastikler'],
    ['belgeler', Files, 'Belgeler ve açık riskler'],
    ['finans', Coins, 'Finans ve performans'],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Panel title="Araç bilgileri" action={canEdit ? <TextLink onClick={edit}>Düzenle</TextLink> : undefined}>
          <Facts
            rows={[
              ['Plaka', v.plate],
              ['Araç kodu', v.vehicleCode],
              ['Marka ve model', `${v.make} ${v.model}`],
              ['Donanım / paket', v.trim],
              ['Model yılı', v.modelYear],
              ['Sınıf', v.className],
              ['Renk', v.color],
              ['Şasi no (VIN)', v.vin && <span className="tnum tracking-[0.03em]">{v.vin}</span>],
              ['Yakıt', FUEL_LABELS[v.fuelType]],
              ['Vites', TRANSMISSION_LABELS[v.transmission]],
              ['Koltuk', v.seats],
              ['Kaynak', 'Kendi filo'],
              ['Ana şube', v.homeBranchName],
              ['Kullanım durumu', <span className={v.status !== 'active' ? 'text-hold' : undefined}>{STATUS_LABELS[v.status]}</span>],
            ]}
          />
        </Panel>

        <Panel title="Son kayıtlar" action={<TextLink onClick={() => onTab('gecmis')}>Tüm geçmiş</TextLink>}>
          {!history ? (
            <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
          ) : items.length === 0 ? (
            <p className="text-ink-2">Bu araç için kilometre veya konum kaydı yok.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {items.map((it) => (
                <li key={it.key} className="grid grid-cols-[112px_1fr] items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="tnum text-[13px] leading-tight">
                    <span className="block text-ink-2">{formatDate(it.at)}</span>
                    <span className="block text-[15px] font-semibold">{formatDateTime(it.at).split(' ').pop()}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      <it.icon size={16} className="shrink-0 text-ink-3" />
                      {it.title}
                    </span>
                    <span className="mt-0.5 block truncate pl-6 text-[13px] text-ink-2">
                      {it.detail}
                      {it.by && ` · ${it.by}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {v.notes && (
          <Panel title="Notlar">
            <p className="whitespace-pre-line text-ink">{v.notes}</p>
          </Panel>
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <Panel title="Filoya giriş" action={canEdit ? <TextLink onClick={edit}>Düzenle</TextLink> : undefined}>
          {v.acquisitionType || v.acquisitionDate || v.acquisitionSeller || v.acquisitionCost || v.acquisitionReference ? (
            <dl className="divide-y divide-line-soft">
              {(
                [
                  ['Edinim türü', v.acquisitionType ? ACQUISITION_LABELS[v.acquisitionType] : null],
                  ['Tarih', v.acquisitionDate ? formatDate(v.acquisitionDate) : null],
                  ['Satıcı / kiralayan', v.acquisitionSeller],
                  ['Tutar', v.acquisitionCost && v.acquisitionCurrency ? <span className="tnum">{formatMoney(v.acquisitionCost, v.acquisitionCurrency)}</span> : null],
                  ['Fatura / sözleşme no', v.acquisitionReference],
                ] as [string, ReactNode][]
              ).map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                  <dt className="text-[13px] text-ink-2">{k}</dt>
                  <dd className={cn('min-w-0 truncate text-right font-medium', !val && 'font-normal text-ink-3')}>{val ?? 'Girilmemiş'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-ink-2">Edinim bilgisi girilmemiş.</p>
          )}
          <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
            <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
            Edinim bilgisi işletme geliri değildir; finans raporlarına karışmaz.
          </p>
        </Panel>

        <Panel title="Bağlı kayıtlar">
          <p className="-mt-2 mb-3 text-[13px] text-ink-2">Bu bölümler ilgili modüller geliştirildiğinde araca bağlanacak. O zamana kadar örnek veri gösterilmez.</p>
          <ul className="-mx-2">
            {links.map(([tab, Ico, label]) => (
              <li key={tab}>
                <button type="button" onClick={() => onTab(tab)} className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-ground">
                  <Ico size={17} className="shrink-0 text-ink-3" />
                  <span className="flex-1 truncate text-ink">{label}</span>
                  <span className="text-[12.5px] text-ink-3">Henüz bağlı değil</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function Pending({ tab }: { tab: VehicleTab }) {
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
            Bu sekme <span className="font-medium text-ink">{p.module}</span> modülü geliştirildiğinde bu aracın gerçek kayıtlarıyla dolacak. Şu an örnek, tahmini veya
            temsili veri gösterilmez.
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

const DOCUMENT_TYPES = ['Ruhsat', 'Trafik sigortası', 'Kasko', 'Muayene']

function Documents() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title="Belgeler ve süreler">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13.5px]">
            <thead>
              <tr className="border-y border-line bg-ground/50 text-left text-[12.5px] text-ink-2">
                <th className="h-10 px-5 font-medium">Belge</th>
                <th className="h-10 px-5 font-medium">Referans</th>
                <th className="h-10 px-5 font-medium">Geçerlilik</th>
                <th className="h-10 px-5 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {DOCUMENT_TYPES.map((d) => (
                <tr key={d} className="border-b border-line-soft last:border-b-0">
                  <td className="h-12 px-5 font-medium">{d}</td>
                  <td className="h-12 px-5 text-ink-3">—</td>
                  <td className="h-12 px-5 text-ink-3">—</td>
                  <td className="h-12 px-5 text-ink-2">Yüklenmedi</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[13px] text-ink-2">
          <Files size={15} className="mt-0.5 shrink-0 text-ink-3" />
          Belge yükleme ve süre takibi bir sonraki aşamada açılacak. Satırlar araç için izlenecek standart belge türleridir; kayıtlı belge yoktur.
        </p>
      </Panel>
      <Panel title="Açık riskler">
        <div className="grid place-items-center rounded-lg border border-dashed border-line px-6 py-8 text-center">
          <div>
            <WarningCircle size={22} className="mx-auto text-ink-3" />
            <p className="mt-2 font-medium">Henüz bağlı değil</p>
            <p className="mt-1 text-[13px] text-ink-2">Hasar, ceza ve olay kayıtları ilgili Operasyon modülleriyle bu araca bağlanacak.</p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function HistoryTab({ history, isLoading, vehicleId }: { history?: VehicleHistory; isLoading: boolean; vehicleId: string }) {
  const session = useSession()
  const canAudit = can(session, 'audit.read')
  const activity = useQuery({ queryKey: ['vehicle-activity', session.company?.id, vehicleId], queryFn: () => vehicle360Api.activity(vehicleId), enabled: canAudit })
  const th = 'h-10 px-5 font-medium whitespace-nowrap'
  const td = 'h-12 px-5 whitespace-nowrap'
  return (
    <div className="space-y-5">
      <div className="grid gap-5 2xl:grid-cols-2">
        <Panel title="Kilometre geçmişi" action={<span className="text-[12.5px] text-ink-2">Güncel değer en son kayıttır</span>}>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" />
          ) : !history?.odometer.length ? (
            <p className="text-ink-2">Kilometre kaydı yok. Kilometre doğrulanmadı.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-line bg-ground/50 text-left text-[12.5px] text-ink-2">
                    <th className={th}>Zaman</th>
                    <th className={th}>Olay</th>
                    <th className={cn(th, 'text-right')}>Kilometre</th>
                    <th className={th}>Giren</th>
                  </tr>
                </thead>
                <tbody>
                  {history.odometer.map((o) => (
                    <tr key={o.id} className="border-b border-line-soft last:border-b-0">
                      <td className={cn(td, 'tnum')}>{formatDateTime(o.occurredAt)}</td>
                      <td className={td}>
                        <span className="font-medium">{ODOMETER_EVENT_LABELS[o.eventType] ?? o.eventType}</span>
                      </td>
                      <td className={cn(td, 'tnum text-right font-medium')}>{formatKm(o.km)}</td>
                      <td className={cn(td, 'text-ink-2')}>{o.recordedByName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Konum geçmişi" action={<span className="text-[12.5px] text-ink-2">Canlı GPS değildir</span>}>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" />
          ) : !history?.locations.length ? (
            <p className="text-ink-2">Konum kaydı yok.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-line bg-ground/50 text-left text-[12.5px] text-ink-2">
                    <th className={th}>Zaman</th>
                    <th className={th}>Olay</th>
                    <th className={th}>Yer</th>
                    <th className={th}>Giren</th>
                  </tr>
                </thead>
                <tbody>
                  {history.locations.map((l) => (
                    <tr key={l.id} className="border-b border-line-soft last:border-b-0">
                      <td className={cn(td, 'tnum')}>{formatDateTime(l.occurredAt)}</td>
                      <td className={td}>
                        <span className="font-medium">{LOCATION_EVENT_LABELS[l.eventType] ?? l.eventType}</span>
                      </td>
                      <td className={td}>
                        {l.type === 'branch' ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{l.branchCode}</span>
                            {l.branchName}
                          </span>
                        ) : (
                          LOCATION_LABELS[l.type]
                        )}
                      </td>
                      <td className={cn(td, 'text-ink-2')}>{l.recordedByName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <p className="flex items-start gap-1.5 text-[13px] text-ink-2">
        <LockSimple size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Kilometre ve konum kayıtları geriye dönük değiştirilmez. Düzeltme ve transfer kayıtları sonraki aşamada, gerekçeli yeni kayıt olarak eklenecek.
      </p>

      <Panel title="Kayıt geçmişi" action={<span className="text-[12.5px] text-ink-2">Kim, ne zaman, neyi değiştirdi</span>}>
        {!canAudit ? (
          <p className="flex items-center gap-2 text-ink-2">
            <LockSimple size={16} className="text-ink-3" />
            Kayıt geçmişini görmek için işlem geçmişi yetkisi gerekir.
          </p>
        ) : activity.isPending ? (
          <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" />
        ) : activity.isError ? (
          <p className="text-alert">{activity.error.message}</p>
        ) : activity.data.items.length === 0 ? (
          <p className="text-ink-2">Bu araç için kayıt geçmişi yok.</p>
        ) : (
          <ol className="divide-y divide-line-soft">
            {activity.data.items.map((a) => (
              <ActivityEntry key={a.id} a={a} />
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page

function Tabs({ tab, onTab, counts }: { tab: VehicleTab; onTab: (t: VehicleTab) => void; counts: Partial<Record<VehicleTab, number>> }) {
  return (
    <div id="vehicle-tabs" className="sticky top-[calc(4rem+var(--bar,0px))] z-20 border-b border-line bg-surface/95 backdrop-blur-sm transition-[top] duration-300">
      <div role="tablist" aria-label="Araç bölümleri" className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:px-8">
        {VEHICLE_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`tab-${t}`}
            aria-selected={t === tab}
            aria-controls="vehicle-tabpanel"
            onClick={() => onTab(t)}
            className={cn('relative h-12 shrink-0 px-3 font-medium whitespace-nowrap transition-colors', t === tab ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {TAB_LABELS[t]}
            {counts[t] !== undefined && <span className="tnum ml-1.5 text-[12px] text-ink-3">{counts[t]}</span>}
            {PENDING[t] && <span className="sr-only"> (henüz bağlı değil)</span>}
            {t === tab && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Araç 360°, first read-only version (spec §13.3): real master data and event history; other domains are marked as not yet connected. */
export function Vehicle360Page() {
  const session = useSession()
  const navigate = useNavigate()
  const { vehicleId } = useParams({ from: '/app/araclar/$vehicleId' })
  const { sekme } = useSearch({ from: '/app/araclar/$vehicleId' })
  const tab: VehicleTab = sekme ?? 'genel'
  const canEdit = can(session, 'vehicles.update')
  const vehicle = useQuery({ queryKey: ['vehicle', session.company?.id, vehicleId], queryFn: () => vehiclesApi.get(vehicleId), retry: false })
  const history = useQuery({ queryKey: ['vehicle-history', session.company?.id, vehicleId], queryFn: () => vehicle360Api.history(vehicleId), enabled: vehicle.isSuccess })

  const onTab = (t: VehicleTab) => {
    void navigate({ to: '/araclar/$vehicleId', params: { vehicleId }, search: t === 'genel' ? {} : { sekme: t }, replace: true, resetScroll: false })
    // Keep the chosen tab's content in view, below the sticky stack: top bar 64 + status bar 56 + tabs 48.
    const panel = document.getElementById('vehicle-tabpanel')
    if (panel) {
      const top = panel.getBoundingClientRect().top + window.scrollY - (64 + 56 + 48)
      if (window.scrollY < top - 1) window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
  }

  if (vehicle.isError) {
    const e = vehicle.error
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 lg:px-8">
        {e instanceof ApiRequestError && e.status === 404 ? (
          <StatePanel icon={CarProfile} title="Araç bulunamadı">
            <p>Bu adresteki araç yok ya da aktif şirketinizde ve yetkili olduğunuz şubelerde değil.</p>
            <Link to="/araclar" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
              Araçlara dön
            </Link>
          </StatePanel>
        ) : (
          <ErrorState message={e.message} onRetry={() => vehicle.refetch()} />
        )}
      </div>
    )
  }
  if (!vehicle.data) {
    return (
      <div aria-busy="true" aria-label="Araç yükleniyor" className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-8 lg:grid-cols-2 lg:px-8">
          <div className="aspect-[16/10] animate-pulse rounded-[14px] bg-line-soft" />
          <div className="space-y-4">
            <div className="h-9 w-48 animate-pulse rounded bg-line-soft" />
            <div className="h-11 w-3/4 animate-pulse rounded bg-line-soft" />
            <div className="h-40 animate-pulse rounded-[14px] bg-line-soft/70" />
          </div>
        </div>
      </div>
    )
  }

  const v = vehicle.data
  const counts: Partial<Record<VehicleTab, number>> = history.data ? { gecmis: history.data.odometer.length + history.data.locations.length } : {}
  return (
    <>
      <Hero v={v} canEdit={canEdit} onTab={onTab} />
      <Tabs tab={tab} onTab={onTab} counts={counts} />
      <div key={tab} id="vehicle-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mx-auto max-w-[1400px] animate-fade px-4 py-6 lg:px-8">
        {tab === 'genel' && <Overview v={v} history={history.data} onTab={onTab} canEdit={canEdit} />}
        {tab === 'belgeler' && <Documents />}
        {tab === 'gecmis' && <HistoryTab history={history.data} isLoading={history.isPending} vehicleId={v.id} />}
        {PENDING[tab] && <Pending tab={tab} />}
      </div>
    </>
  )
}
