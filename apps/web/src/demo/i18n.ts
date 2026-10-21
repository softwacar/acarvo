// Tiny two-language helper. Translated text is written inline as L('Türkçe', 'English'); the demo root is re-mounted
// when the language changes. Screens whose deeper text is not translated fall back to Turkish: the coverage is stated
// in the report, not claimed beyond what is written.
export type Lang = 'tr' | 'en'

let current: Lang = 'tr'
export const getLang = () => current
export const setLangGlobal = (l: Lang) => {
  current = l
}
export const L = (tr: string, en: string) => (current === 'en' ? en : tr)
export const locale = () => (current === 'en' ? 'en-GB' : 'tr-TR')

// ---------------------------------------------------------------- bilingual stored messages
// Text that is written into the demo database (history entries, audit events, notifications, seeded descriptions) or
// thrown by a domain rule is created with B(tr, en). It carries both languages inside one string, so switching the
// language re-reads the same stored text in the other language and never loses data. loc() picks the side for the
// current language; the store applies it to every string when the UI reads the database, and DemoError applies it when
// a rule is refused. Nested B() inside B() is allowed (a message that quotes a bilingual name).
const START = '⁡'
const MID = '⁢'
const END = '⁣'

export const B = (tr: string, en: string): string => `${START}${tr}${MID}${en}${END}`
export const isBilingual = (s: string) => s.includes(START)

export function loc(s: string, lang: Lang = current): string {
  if (!s.includes(START)) return s
  let i = 0
  const parse = (stop: boolean): string => {
    let out = ''
    while (i < s.length) {
      const c = s[i]!
      if (stop && (c === MID || c === END)) return out
      if (c === START) {
        i++
        const tr = parse(true) // stops at MID
        i++ // skip MID
        const en = parse(true) // stops at END
        i++ // skip END
        out += lang === 'en' ? en : tr
      } else {
        out += c
        i++
      }
    }
    return out
  }
  return parse(false)
}

/** Copy of a value with every bilingual string resolved to one language (plain data objects and arrays only). */
export function localize<T>(value: T, lang: Lang = current): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes(START) ? loc(v, lang) : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v)) out[k] = walk(x)
      return out
    }
    return v
  }
  return walk(value) as T
}
