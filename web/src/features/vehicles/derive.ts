import { NOW_OFFSET, WINDOW_START, type Segment, type SegmentKind, type Vehicle } from './data'

export type NowState = SegmentKind | 'free'

export const NOW_LABEL: Record<NowState, string> = {
  free: 'Müsait',
  rental: 'Kirada',
  reservation: 'Rezerve',
  maintenance: 'Bakımda',
  transfer: 'Transferde',
  out: 'Kullanım dışı',
}

export const NOW_ORDER: NowState[] = ['free', 'reservation', 'rental', 'transfer', 'maintenance', 'out']

export interface Current {
  state: NowState
  segment?: Segment
  /** Hours past the planned end, when a rental has not come back yet. */
  overdueHours?: number
}

export function currentOf(v: Vehicle): Current {
  const active = v.segments.find((s) => s.from <= NOW_OFFSET && s.to > NOW_OFFSET)
  if (active) return { state: active.kind, segment: active }
  // A rental whose planned end has passed while the car is still with the customer.
  const overdue = v.segments.find(
    (s) => s.kind === 'rental' && s.to <= NOW_OFFSET && v.location.kind === 'customer',
  )
  if (overdue) return { state: 'rental', segment: overdue, overdueHours: (NOW_OFFSET - overdue.to) * 24 }
  return { state: 'free' }
}

export interface NextEvent {
  text: string
  when: string
  ref: string
  late?: boolean
}

/** The next operational moment the desk should care about. */
export function nextEventOf(v: Vehicle, cur: Current): NextEvent | undefined {
  if (cur.segment && cur.state !== 'free') {
    const s = cur.segment
    if (cur.overdueHours) return { text: 'İade gecikti', when: `${fmtHours(cur.overdueHours)} geçti`, ref: s.ref, late: true }
    const verb: Record<SegmentKind, string> = {
      rental: 'Dönüş',
      reservation: 'Teslim bekleniyor',
      maintenance: 'Servis bitişi',
      transfer: 'Varış',
      out: 'Kullanıma dönüş',
    }
    if (s.kind === 'reservation') {
      return { text: 'Teslim alınmadı', when: `${fmtHours((NOW_OFFSET - s.from) * 24)} gecikme`, ref: s.ref, late: true }
    }
    return { text: verb[s.kind], when: fmtWhen(s.to), ref: s.ref }
  }
  const upcoming = v.segments.filter((s) => s.from > NOW_OFFSET).sort((a, b) => a.from - b.from)[0]
  if (!upcoming) return undefined
  const verb: Record<SegmentKind, string> = {
    rental: 'Teslim',
    reservation: 'Teslim',
    maintenance: 'Servise giriş',
    transfer: 'Transfer',
    out: 'Tedarikçiye iade',
  }
  return { text: verb[upcoming.kind], when: fmtWhen(upcoming.from), ref: upcoming.ref }
}

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const WEEKDAY_INITIAL = ['P', 'P', 'S', 'Ç', 'P', 'C', 'C']

export function dateOf(offset: number): Date {
  return new Date(WINDOW_START.getTime() + offset * 86_400_000)
}

export function dayInfo(dayIndex: number) {
  const d = dateOf(dayIndex)
  return {
    day: d.getDate(),
    weekday: WEEKDAYS[d.getDay()],
    initial: WEEKDAY_INITIAL[d.getDay()],
    weekend: d.getDay() === 0 || d.getDay() === 6,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtWhen(offset: number): string {
  const d = dateOf(offset)
  const time = `${pad(d.getHours())}:${pad(Math.round(d.getMinutes()))}`
  const dayDiff = Math.floor(offset) - Math.floor(NOW_OFFSET)
  if (dayDiff === 0) return `bugün ${time}`
  if (dayDiff === 1) return `yarın ${time}`
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${WEEKDAYS[d.getDay()]} ${time}`
}

export function fmtRange(s: Segment): string {
  return `${fmtWhen(s.from)} – ${fmtWhen(s.to)}`
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} dk`
  const whole = Math.floor(h)
  const min = Math.round((h - whole) * 60)
  return min ? `${whole} sa ${min} dk` : `${whole} sa`
}

export const fmtKm = (km: number) => km.toLocaleString('tr-TR')

// ---------------------------------------------------------------------------
// Delivery readiness checklist (§59D): five fixed areas, each passes or carries
// the blocker text that came from its source record.

export type CheckState = 'ok' | 'warn' | 'block'
export interface ReadinessCheck {
  area: string
  state: CheckState
  detail: string
  fix?: string
}

const AREAS: { area: string; okText: string; fix: string; match: RegExp }[] = [
  { area: 'Belgeler', okText: 'Ruhsat, muayene ve poliçeler geçerli', fix: 'Belgeyi aç', match: /muayene|kasko|poliçe|ruhsat|belge/i },
  { area: 'Hasar', okText: 'Açık hasar kaydı yok', fix: 'Hasarı gör', match: /hasar|cam|tampon|çatlak/i },
  { area: 'Bakım', okText: 'Bakım engeli yok', fix: 'Bakımı aç', match: /bakım|servis|lastik|km kaldı/i },
  { area: 'Temizlik ve yakıt', okText: 'Temiz, yakıt yeterli', fix: 'Hazırlığı başlat', match: /temizlik|yakıt/i },
  { area: 'Konum ve teslim', okText: 'Araç teslim şubesinde', fix: 'Kaynağı aç', match: /.*/ },
]

export function readinessChecks(v: Vehicle): ReadinessCheck[] {
  const remaining = [...v.blockers]
  return AREAS.map(({ area, okText, fix, match }) => {
    const i = remaining.findIndex((b) => match.test(b))
    if (i === -1) return { area, state: 'ok' as const, detail: okText }
    const [detail] = remaining.splice(i, 1)
    return { area, state: v.readiness === 'blocked' ? ('block' as const) : ('warn' as const), detail, fix }
  })
}

// ---------------------------------------------------------------------------
// Actions offered in the vehicle panel depend on what the car is doing now.

export interface PanelAction {
  label: string
  primary?: boolean
  disabledReason?: string
}

export function actionsFor(v: Vehicle, cur: Current): PanelAction[] {
  const open = v.readiness === 'blocked' ? `Teslime hazır değil: ${v.blockers.length} eksik giderilmeli` : undefined
  switch (cur.state) {
    case 'rental':
      return [
        { label: 'İadeyi al', primary: true },
        { label: 'Kiralamayı uzat' },
        { label: 'Kiralama aç', disabledReason: 'Araç şu an kirada; iade alınmadan yeni kiralama açılamaz.' },
      ]
    case 'reservation':
      return [
        { label: 'Teslimi başlat', primary: true, disabledReason: open },
        { label: 'Rezervasyonu aç' },
        { label: 'Kiralama aç', disabledReason: 'Araç bu saat için rezerve; önce rezervasyonu teslim edin ya da iptal edin.' },
      ]
    case 'maintenance':
      return [
        { label: 'Bakım kaydını aç', primary: true },
        { label: 'Kiralama aç', disabledReason: `Araç serviste; bakım ${fmtWhen(cur.segment!.to)} bitiyor.` },
      ]
    case 'transfer':
      return [
        { label: 'Transferi aç', primary: true },
        { label: 'Kiralama aç', disabledReason: `Araç yolda; varış ${fmtWhen(cur.segment!.to)}.` },
      ]
    case 'out':
      return [
        { label: 'Hasar kaydını aç', primary: true },
        { label: 'Kiralama aç', disabledReason: 'Araç kullanım dışı; hasar kaydı kapanmadan kiralanamaz.' },
      ]
    default:
      return v.readiness === 'blocked'
        ? [
            { label: 'Eksikleri gider', primary: true },
            { label: 'Kiralama aç', disabledReason: open },
          ]
        : [{ label: 'Kiralama aç', primary: true }, { label: 'Rezervasyon oluştur' }]
  }
}

/** "3 sa 30 dk sonra" style relative time for the panel's hero line. */
export function fmtRelative(offset: number): string {
  const h = (offset - NOW_OFFSET) * 24
  if (h < 0) return `${fmtHours(-h)} önce`
  if (h < 24) return `${fmtHours(h)} sonra`
  return `${Math.round(h / 24)} gün sonra`
}
