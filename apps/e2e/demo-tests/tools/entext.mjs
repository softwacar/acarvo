// Turkish-leftover audit for English mode (diagnostic tool).
// usage: node entext.mjs <baseUrl> <outFile> [routeFilterRegex]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const base = process.argv[2] ?? 'http://localhost:5174'
const out = process.argv[3] ?? 'entext.json'
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null
const ROUTES = ['/', '/komuta-merkezi', '/filo-asistani', '/rezervasyonlar', '/rezervasyonlar?sekme=bekleme', '/rezervasyonlar/yeni', '/rezervasyonlar/rsv16', '/kiralamalar', '/kiralamalar/yeni', '/kiralamalar/rn37', '/kiralamalar/rn37?sekme=sozlesme', '/kiralamalar/rn37?sekme=ozet', '/kiralamalar/rn37?sekme=sigorta', '/kiralamalar/rn37?sekme=finans', '/kiralamalar/rn36', '/kiralamalar/rn36?sekme=finans', '/kiralamalar/rn41', '/takvim', '/takvim?gorunum=ay', '/takvim?gorunum=gundem', '/takvim?gorunum=gun', '/gorevler', '/araclar', '/araclar/yeni', '/araclar/v1', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu', '/musteriler', '/musteriler/c3', '/kurumsal-hesaplar', '/kurumsal-hesaplar/co1', '/kurumsal-hesaplar/co1?sekme=limit', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma', '/fiyatlandirma?sekme=simulasyon', '/onay-merkezi', '/kurallar', '/gelir-kontrolu', '/riskler-ve-istisnalar', '/kapasite-planlama', '/filo-analizi', '/firsatlar', '/raporlar', '/finans', '/finans?sekme=odemeler', '/finans?sekme=depozito', '/masraflar', '/sube-kasalari', '/sozlesmeler', '/belge-merkezi', '/islem-gecmisi', '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/ayarlar', '/ayarlar?bolum=kurlar', '/ayarlar?bolum=sure', '/platform', '/partner']
const TR_CHARS = /[çğıİöşüÇĞÖŞÜ]/
const TR_WORDS = /\b(ve|için|yok|bir|ile|değil|veya|kadar|olarak|tarafından|henüz|zaten|yalnız|önce|sonra|Tümü|Hepsi|Durum|Kaydet|Vazgeç|Ekle|Sil|Düzenle|Kapat|Yeni|Müşteri|Araç|Kiralama|Rezervasyon|Gün|Şube|Tutar|Tarih|Gerekçe|Teslim|İade|Bakım|Hasar|Görev|Kasa|Ödeme|Onay|Talep|Belge|Sözleşme|Kurallar|Fiyat|Sigorta|Depozito|Masraf)\b/
const NAMES = /(Müller|Örnek|Deneme|Fiktiv|Šehović|Hadžić|Kovač|Karić|Babić|Mehić|Matić|Pašić|Begić|Demić|Kovačić|Primjerović|Novak|Petrović|Horvat|Boğaz|Bu belge, kiracı|Araç yalnız sözleşmede|Seçilen sigorta paketinin|Depozito gelir değildir|Araç teslim edildiği|Taraflar ve araç|Kullanım ve sürücüler|Sigorta ve muafiyet|4\. Depozito|5\. Teslim)/

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })).newPage()
await page.goto(base + '/')
await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: 'Demo', exact: true }).click()
await page.getByRole('menuitem', { name: /Dil:/ }).click()
await page.waitForTimeout(300)

const report = {}
const collect = () => page.evaluate(() => {
  const lines = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) {
    const el = n.parentElement
    if (!el || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue
    const t = n.textContent.replace(/\s+/g, ' ').trim()
    if (t.length > 1) lines.add(t)
  }
  for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) lines.add(`[${a}] ${v}`) }
  for (const o of document.querySelectorAll('option')) lines.add('[option] ' + o.textContent)
  return [...lines]
})
for (const route of ROUTES) {
  if (filter && !filter.test(route)) continue
  await page.goto(base + route)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  const lines = await collect()
  const bad = lines.filter((l) => (TR_CHARS.test(l) || TR_WORDS.test(l)) && !NAMES.test(l))
  if (bad.length) report[route] = bad
}
writeFileSync(out, JSON.stringify(report, null, 1))
const all = new Set(Object.values(report).flat())
console.log(`routes with leftovers: ${Object.keys(report).length}; distinct lines: ${all.size} -> ${out}`)
await browser.close()
