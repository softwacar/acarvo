// Rewrites Turkish string literals / template literals in the demo core layer into bilingual messages.
//   node scripts/i18n-transform.mjs extract   -> writes scripts/i18n-missing.json (signatures without an English entry)
//   node scripts/i18n-transform.mjs apply     -> rewrites the files using scripts/i18n-dict/*.json
// A signature is the cooked literal text; template expressions are replaced by {0}, {1}, ... in order of appearance.
// Wrapper: B(tr, en) for stored/thrown messages (decoded by the store projection and by DemoError),
//          L(tr, en) for strings computed at render time (calc layer and a few render-time functions).
// An English value of "=" means "this literal is data, keep it as is".
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, dirname, relative } from 'node:path'

const ROOT = 'src/demo/core'
const mode = process.argv[2] ?? 'extract'
const TR = /[çğıİöşüÇĞÖŞÜ]/
const WORDS = /\b(ve|için|yok|bir|ile|değil|olmalı|girin|seçin|yazın|yetkiniz|kaydı|kayıt|zorunlu|bulunamadı|edilemez|yapılamaz|gerekli|önce|sonra|istisnai|hazır|kapandı)\b/
const RENDER_FUNCS = new Set(['deliveryChecks', 'previewReturnFees', 'financialCloseChecks', 'customerShare', 'driversOf', 'findDuplicates'])

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : walk(join(dir, e.name))) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []))
const files = walk(ROOT).filter((f) => !/seed-run\.ts$/.test(f))

const dict = {}
const dictDir = 'scripts/i18n-dict'
if (existsSync(dictDir)) for (const f of readdirSync(dictDir)) if (f.endsWith('.json')) Object.assign(dict, JSON.parse(readFileSync(join(dictDir, f), 'utf8')))

const missing = {}
let replaced = 0

const isTurkish = (s) => TR.test(s) || WORDS.test(s) || dict[s] !== undefined
const unescape = (s) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
const escSingle = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
const escTpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

function prevToken(src, i) {
  let j = i - 1
  while (j >= 0 && /\s/.test(src[j])) j--
  return { end: j + 1, text: src.slice(Math.max(0, j - 12), j + 1) }
}
function nextChar(src, i) {
  let j = i
  while (j < src.length && /\s/.test(src[j])) j++
  return src[j]
}

function wrapperFor(file, src, at) {
  if (/core[\\/](calc[\\/]|metrics\.ts|search\.ts|time\.ts)/.test(file)) return 'L'
  const before = src.slice(0, at)
  const m = [...before.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)].pop()
  if (m && RENDER_FUNCS.has(m[1])) return 'L'
  return 'B'
}

// skip rules: first argument of L(/B(, object keys, comparisons, includes()/startsWith(), imports, case labels
function skipByContext(src, start, end) {
  const p = prevToken(src, start)
  const t = p.text
  if (/[LB]\($/.test(t)) return true
  if (/(===|!==|==|!=|case)$/.test(t)) return true
  if (/(includes|startsWith|endsWith|indexOf)\($/.test(t)) return true
  if (/(from|import)$/.test(t)) return true
  const n = nextChar(src, end)
  if (n === ':' && /[{,]$/.test(t)) return true
  return false
}

function scanQuoted(src, i, q) {
  let j = i + 1
  while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1
  return j // index of closing quote
}

// returns { parts: string[] (raw), exprs: [start,end][] , end }
function scanTemplate(src, i) {
  const parts = []
  const exprs = []
  let cur = ''
  let j = i + 1
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') {
      cur += src[j] + src[j + 1]
      j += 2
    } else if (src[j] === '$' && src[j + 1] === '{') {
      parts.push(cur)
      cur = ''
      const s = j + 2
      let depth = 1
      let k = s
      while (k < src.length && depth > 0) {
        const c = src[k]
        if (c === "'" || c === '"') k = scanQuoted(src, k, c) + 1
        else if (c === '`') k = scanTemplate(src, k).end + 1
        else if (c === '{') (depth++, k++)
        else if (c === '}') (depth--, k++)
        else k++
      }
      exprs.push([s, k - 1])
      j = k
    } else {
      cur += src[j]
      j++
    }
  }
  parts.push(cur)
  return { parts, exprs, end: j }
}

function transformRange(file, src, a, b) {
  let out = ''
  let i = a
  while (i < b) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      const e = src.indexOf('\n', i)
      const stop = e === -1 || e > b ? b : e
      out += src.slice(i, stop)
      i = stop
    } else if (c === '/' && c2 === '*') {
      const e = src.indexOf('*/', i + 2)
      out += src.slice(i, e + 2)
      i = e + 2
    } else if (c === '/' && /[(,=:\[!&|?{};]$|return$/.test(prevToken(src, i).text)) {
      // regex literal: copy verbatim
      let j = i + 1
      let cls = false
      while (j < src.length) {
        if (src[j] === '\\') j += 2
        else if (src[j] === '[') (cls = true, j++)
        else if (src[j] === ']') (cls = false, j++)
        else if (src[j] === '/' && !cls) break
        else j++
      }
      while (/[a-z]/.test(src[j + 1] ?? '')) j++
      out += src.slice(i, j + 1)
      i = j + 1
    } else if (c === "'" || c === '"') {
      const e = scanQuoted(src, i, c)
      const raw = src.slice(i + 1, e)
      const cooked = unescape(raw)
      if (isTurkish(cooked) && cooked.length >= 2 && !skipByContext(src, i, e + 1)) {
        const en = dict[cooked]
        if (en === undefined) (missing[cooked] ??= [], missing[cooked].push(`${basename(file)}:${src.slice(0, i).split('\n').length}`), (out += src.slice(i, e + 1)))
        else if (en === '=') out += src.slice(i, e + 1)
        else {
          const w = wrapperFor(file, src, i)
          out += `${w}('${escSingle(cooked)}', '${escSingle(en)}')`
          replaced++
        }
      } else out += src.slice(i, e + 1)
      i = e + 1
    } else if (c === '`') {
      const t = scanTemplate(src, i)
      const turk = t.parts.some((p) => isTurkish(unescape(p)))
      const sig = t.parts.map((p, k) => unescape(p) + (k < t.exprs.length ? `{${k}}` : '')).join('')
      const exprText = t.exprs.map(([s, e]) => transformRange(file, src, s, e))
      const rebuild = (tpl) => {
        // tpl uses {k} placeholders; build a template literal with the transformed expressions
        let res = '`'
        let last = 0
        for (const m of tpl.matchAll(/\{(\d+)\}/g)) {
          res += escTpl(tpl.slice(last, m.index)) + '${' + (exprText[Number(m[1])] ?? '') + '}'
          last = m.index + m[0].length
        }
        res += escTpl(tpl.slice(last)) + '`'
        return res
      }
      if (turk && !skipByContext(src, i, t.end + 1)) {
        const en = dict[sig]
        if (en === undefined) (missing[sig] ??= [], missing[sig].push(`${basename(file)}:${src.slice(0, i).split('\n').length}`), (out += rebuildOriginal()))
        else if (en === '=') out += rebuildOriginal()
        else {
          const w = wrapperFor(file, src, i)
          out += `${w}(${rebuild(sig)}, ${rebuild(en)})`
          replaced++
        }
      } else out += rebuildOriginal()
      function rebuildOriginal() {
        let res = '`'
        for (let k = 0; k < t.parts.length; k++) res += t.parts[k] + (k < t.exprs.length ? '${' + exprText[k] + '}' : '')
        return res + '`'
      }
      i = t.end + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const out = transformRange(f, src, 0, src.length)
  if (mode === 'apply' && out !== src) {
    // make sure B / L are imported
    let text = out
    const needB = /\bB\(/.test(text) && !/import\s*\{[^}]*\bB\b[^}]*\}\s*from\s*'[^']*i18n'/.test(text)
    const needL = /\bL\(/.test(text) && !/import\s*\{[^}]*\bL\b[^}]*\}\s*from\s*'[^']*i18n'/.test(text)
    if (needB || needL) {
      const rel = relative(dirname(f), 'src/demo/i18n').replace(/\\/g, '/')
      const spec = rel.startsWith('.') ? rel : `./${rel}`
      const names = [needB ? 'B' : null, needL ? 'L' : null].filter(Boolean).join(', ')
      const existing = text.match(/import\s*\{([^}]*)\}\s*from\s*'[^']*i18n'/)
      if (existing) text = text.replace(existing[0], existing[0].replace(`{${existing[1]}}`, `{${existing[1].trim()}, ${names} }`))
      else text = `import { ${names} } from '${spec}'\n` + text
    }
    writeFileSync(f, text)
  }
}
if (mode === 'extract') {
  writeFileSync('scripts/i18n-missing.json', JSON.stringify(missing, null, 0))
  console.log(Object.keys(missing).length, 'signatures without an English entry')
} else {
  console.log('replaced', replaced, 'literals;', Object.keys(missing).length, 'still missing')
  if (Object.keys(missing).length) writeFileSync('scripts/i18n-missing.json', JSON.stringify(missing, null, 0))
}
