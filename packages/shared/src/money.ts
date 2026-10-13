// ---------------------------------------------------------------------------
// Money (spec §49, §62): amounts are integers in the currency's minor unit, always with an ISO 4217 code.
// No floating point, no conversion between currencies (there is no exchange-rate source in ACARVO yet).

/** ISO 4217 minor-unit exponents that are not 2. Every other active code in ISO_CURRENCIES uses 2. */
const EXPONENT: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
}

/** Active ISO 4217 currency codes (catalogue as of 2026; precious metals, funds and test codes left out). */
export const ISO_CURRENCIES = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN',
  'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP',
  'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR',
  'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT',
  'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XCG', 'XOF', 'XPF', 'YER', 'ZAR',
  'ZMW', 'ZWG',
] as const

export const isCurrency = (code: string) => (ISO_CURRENCIES as readonly string[]).includes(code)
export const currencyExponent = (code: string) => EXPONENT[code] ?? 2

/** Largest amount accepted in a price field (minor units); keeps every calculation far below 2^53. */
export const MAX_PRICE_MINOR = 10_000_000_000

/** Half away from zero, on integers: a/b rounded to the nearest integer. */
export function divRound(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error('divisor must be positive')
  const neg = a < 0n
  const abs = neg ? -a : a
  const q = (abs * 2n + b) / (2n * b)
  return neg ? -q : q
}

/** "1234.5" → 123450 for a 2-digit currency. Exact decimal parsing: never through floating point. */
export function parseAmount(text: string, currency: string): number | null {
  const exp = currencyExponent(currency)
  const t = text.trim().replace(/\s/g, '').replace(',', '.')
  const re = exp === 0 ? /^(\d{1,12})$/ : new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${exp}}))?$`)
  const m = re.exec(t)
  if (!m) return null
  const minor = BigInt(m[1]!) * 10n ** BigInt(exp) + BigInt((m[2] ?? '').padEnd(exp, '0') || '0')
  return minor <= BigInt(MAX_PRICE_MINOR) ? Number(minor) : null
}

/** 123450 → "1234.50" (plain decimal, no grouping): for inputs. */
export function minorToDecimal(minor: number, currency: string): string {
  const exp = currencyExponent(currency)
  const neg = minor < 0
  const s = String(Math.abs(minor)).padStart(exp + 1, '0')
  const out = exp === 0 ? s : `${s.slice(0, -exp)}.${s.slice(-exp)}`
  return neg ? `-${out}` : out
}

/** "1.234,50 EUR" style display; the ISO code is always shown (§76). */
export function formatMoney(minor: number, currency: string, locale = 'tr-TR'): string {
  const exp = currencyExponent(currency)
  const neg = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 10 ** exp)
  const frac = exp ? String(abs % 10 ** exp).padStart(exp, '0') : ''
  const sep = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? ','
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole)
  return `${neg ? '−' : ''}${grouped}${exp ? sep + frac : ''} ${currency}`
}
