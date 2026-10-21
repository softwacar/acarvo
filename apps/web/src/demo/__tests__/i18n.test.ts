import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Language coverage of the demo text (decision document H3): every visible two-language pair in the source (L('tr', 'en') and
// B('tr', 'en')) has both sides, the English side has no Turkish letters, and the Turkish side is not just a copy of the English
// one. This is a source scan; the browser tests (english.spec) check the rendered screens. A key-based catalog is still open.

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__') walk(p)
    } else if (/\.(ts|tsx)$/.test(name)) files.push(p)
  }
}
walk(root)

const QUOTE = '[\'"`]'
const body = (n: number) => '(?:\\\\.|(?!\\' + n + ')[^\\\\])*'
const PAIR = new RegExp('\\b([LB])\\(\\s*(' + QUOTE + ')(' + body(2) + ')\\2\\s*,\\s*(' + QUOTE + ')(' + body(4) + ')\\4\\s*\\)', 'gs')
const TURKISH = /[çğıöşüİÇĞÖŞÜ]/
const pairs: { file: string; tr: string; en: string }[] = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(PAIR)) pairs.push({ file: file.slice(root.length), tr: m[3]!, en: m[5]! })
}

describe('two-language text', () => {
  it('finds a realistic number of pairs (the scan itself works)', () => {
    expect(pairs.length).toBeGreaterThan(1500)
  })
  it('no pair has an empty side', () => {
    expect(pairs.filter((p) => !p.tr.trim() || !p.en.trim()).map((p) => `${p.file}: "${p.tr}" / "${p.en}"`)).toEqual([])
  })
  it('the English side has no Turkish letters', () => {
    // "Türkçe" is the name of the other language in the language switch, written in that language on purpose
    const bad = pairs.filter((p) => TURKISH.test(p.en.replace(/\$\{[^}]*\}/g, '').replace('Türkçe', ''))).map((p) => `${p.file}: "${p.en}"`)
    expect(bad).toEqual([])
  })
  it('a Turkish sentence is not a copy of the English one', () => {
    const bad = pairs.filter((p) => p.tr === p.en && p.tr.length > 12 && /[a-z]{3}/.test(p.tr) && TURKISH.test(p.tr)).map((p) => `${p.file}: "${p.tr}"`)
    expect(bad).toEqual([])
  })
})
