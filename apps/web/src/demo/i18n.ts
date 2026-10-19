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
