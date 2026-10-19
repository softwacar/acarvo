import { getLang, locale } from '../i18n'
import type { Cur, Money } from './types'

export interface CurrencyInfo {
  code: Cur
  tr: string
  en: string
  exp: number
  symbol: string
}

/** Global currency catalogue (ISO 4217 codes and minor units). Which ones a company accepts is a Settings choice. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EUR', tr: 'Euro', en: 'Euro', exp: 2, symbol: '€' },
  { code: 'USD', tr: 'ABD Doları', en: 'US Dollar', exp: 2, symbol: '$' },
  { code: 'BAM', tr: 'Konvertibl Mark', en: 'Convertible Mark', exp: 2, symbol: 'KM' },
  { code: 'GBP', tr: 'İngiliz Sterlini', en: 'Pound Sterling', exp: 2, symbol: '£' },
  { code: 'CHF', tr: 'İsviçre Frangı', en: 'Swiss Franc', exp: 2, symbol: 'CHF' },
  { code: 'TRY', tr: 'Türk Lirası', en: 'Turkish Lira', exp: 2, symbol: '₺' },
  { code: 'RSD', tr: 'Sırp Dinarı', en: 'Serbian Dinar', exp: 2, symbol: 'RSD' },
  { code: 'MKD', tr: 'Makedon Dinarı', en: 'Macedonian Denar', exp: 2, symbol: 'MKD' },
  { code: 'ALL', tr: 'Arnavut Leki', en: 'Albanian Lek', exp: 2, symbol: 'L' },
  { code: 'PLN', tr: 'Polonya Zlotisi', en: 'Polish Zloty', exp: 2, symbol: 'zł' },
  { code: 'CZK', tr: 'Çek Kronu', en: 'Czech Koruna', exp: 2, symbol: 'Kč' },
  { code: 'AED', tr: 'BAE Dirhemi', en: 'UAE Dirham', exp: 2, symbol: 'AED' },
  { code: 'JPY', tr: 'Japon Yeni', en: 'Japanese Yen', exp: 0, symbol: '¥' },
  { code: 'KWD', tr: 'Kuveyt Dinarı', en: 'Kuwaiti Dinar', exp: 3, symbol: 'KWD' },
]

export const currencyInfo = (code: Cur): CurrencyInfo => CURRENCIES.find((c) => c.code === code) ?? { code, tr: code, en: code, exp: 2, symbol: code }
export const currencyName = (code: Cur) => (getLang() === 'en' ? currencyInfo(code).en : currencyInfo(code).tr)
export const exponent = (code: Cur) => currencyInfo(code).exp

/** Rounds half away from zero. */
export const roundHalf = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x))

/** "1.250,50 EUR": always with the ISO code. */
export function fmt(minor: number, cur: Cur): string {
  const e = exponent(cur)
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const n = new Intl.NumberFormat(locale(), { minimumFractionDigits: e, maximumFractionDigits: e }).format(abs / 10 ** e)
  return `${sign}${n} ${cur}`
}
export const fmtM = (m: Money) => fmt(m.minor, m.cur)

/** Plain number for inputs: "1250,50" / "1250.50". */
export function toInput(minor: number, cur: Cur): string {
  const e = exponent(cur)
  const s = (minor / 10 ** e).toFixed(e)
  return getLang() === 'en' ? s : s.replace('.', ',')
}

/**
 * Parses an amount typed by a person ("1.234,50", "1,234.50", "1234.5") into minor units; null when it is not a valid
 * amount. A single separator is the decimal separator; with both, the last one is the decimal separator.
 */
export function parseAmount(text: string, cur: Cur): number | null {
  const t = text.trim().replace(/\s/g, '')
  if (!t || !/^[0-9.,]+$/.test(t)) return null
  const e = exponent(cur)
  const seps = t.match(/[.,]/g) ?? []
  let intPart = t
  let frac = ''
  if (seps.length) {
    const lastDot = t.lastIndexOf('.')
    const lastComma = t.lastIndexOf(',')
    const pos = Math.max(lastDot, lastComma)
    const sameKind = seps.every((s) => s === seps[0])
    if (seps.length > 1 && sameKind) {
      // "1.234.567": thousands separators only.
      intPart = t.replace(/[.,]/g, '')
    } else {
      intPart = t.slice(0, pos).replace(/[.,]/g, '')
      frac = t.slice(pos + 1)
    }
  }
  if (frac.length > e) return null
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null
  const minor = Number(intPart || '0') * 10 ** e + Number((frac + '0'.repeat(e)).slice(0, e) || '0')
  return Number.isFinite(minor) ? minor : null
}

/** Sums by currency; never adds two currencies together. */
export function sumByCur<T>(items: T[], pick: (x: T) => Money | null | undefined): Record<Cur, number> {
  const out: Record<Cur, number> = {}
  for (const it of items) {
    const m = pick(it)
    if (m) out[m.cur] = (out[m.cur] ?? 0) + m.minor
  }
  return out
}
