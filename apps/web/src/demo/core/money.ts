import { parseAmount as sharedParseAmount } from '@acarvo/shared'
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
  const sign = minor < 0 ? '−' : '' // a true minus sign, as the real application prints it
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
 * Parses an amount typed by a person into minor units; null when it is not a valid amount. This is the rule of the real
 * application (@acarvo/shared): a plain decimal with one separator ("1250,50" or "1250.50"); no thousands separators, at most the
 * currency's decimals, at most 12 whole digits. The demo used to accept "1.234,50" too, which the real form refuses.
 */
export const parseAmount = (text: string, cur: Cur): number | null => sharedParseAmount(text, cur)

/** Sums by currency; never adds two currencies together. */
export function sumByCur<T>(items: T[], pick: (x: T) => Money | null | undefined): Record<Cur, number> {
  const out: Record<Cur, number> = {}
  for (const it of items) {
    const m = pick(it)
    if (m) out[m.cur] = (out[m.cur] ?? 0) + m.minor
  }
  return out
}
