import { readFileSync } from 'node:fs'
const m = JSON.parse(readFileSync('scripts/i18n-missing.json', 'utf8'))
const file = process.argv[2]
const from = Number(process.argv[3] ?? 0)
const to = Number(process.argv[4] ?? 9999)
const keys = Object.keys(m).filter((k) => m[k][0].startsWith(file + ':'))
keys.slice(from, to).forEach((k, i) => console.log(`${from + i}\t${JSON.stringify(k)}`))
console.log('-- total for', file, keys.length)
