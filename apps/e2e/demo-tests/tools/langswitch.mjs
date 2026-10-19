// In-place language switch audit (diagnostic): load each route in one language, switch the language from the Demo menu
// WITHOUT reloading, and report text that is still in the old language. usage: node langswitch.mjs <baseUrl> <outFile> [tr2en|en2tr]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const base = process.argv[2] ?? 'http://localhost:5174'
const out = process.argv[3] ?? 'langswitch.json'
const dir = process.argv[4] ?? 'tr2en'
const ROUTES = ['/', '/komuta-merkezi', '/filo-asistani', '/rezervasyonlar', '/rezervasyonlar/yeni', '/rezervasyonlar/rsv22?sekme=kaparo', '/kiralamalar', '/kiralamalar/rn37', '/takvim', '/gorevler', '/araclar', '/araclar/v1', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu', '/musteriler', '/musteriler/c3', '/kurumsal-hesaplar', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma', '/onay-merkezi', '/kurallar', '/gelir-kontrolu', '/riskler-ve-istisnalar', '/kapasite-planlama', '/filo-analizi', '/firsatlar', '/raporlar', '/finans', '/masraflar', '/sube-kasalari', '/sozlesmeler', '/belge-merkezi', '/islem-gecmisi', '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/ayarlar']
const TR_CHARS = /[çğıİöşüÇĞÖŞÜ]/
const TR_WORDS = /(?<![\p{L}])(ve|için|yok|bir|ile|değil|veya|kadar|olarak|henüz|zaten|önce|sonra|Tümü|Hepsi|Durum|Kaydet|Vazgeç|Ekle|Sil|Düzenle|Kapat|Yeni|Müşteri|Araç|Kiralama|Rezervasyon|Şube|Tutar|Tarih|Teslim|İade|Bakım|Hasar|Görev|Kasa|Ödeme|Onay|Talep|Belge|Fiyat|Sigorta|Depozito|Masraf)(?![\p{L}])/u
const EN_WORDS = /(?<![\p{L}])(the|and|for|with|not|Cancel|Save|Create|Status|Search|Reservation|Customer|Vehicle|Branch|Amount|Date|Payment|Approval|Repeat|Open|Closed|Today|Overview)(?![\p{L}])/u
const NAMES = /(Müller|Örnek|Deneme|Fiktiv|Šehović|Hadžić|Kovač|Karić|Babić|Mehić|Matić|Pašić|Begić|Demić|Kovačić|Primjerović|Novak|Petrović|Horvat|Boğaz|Hodžić)/
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Sarajevo' })).newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 160)))
const toggle = async () => { await page.getByRole('button', { name: 'Demo', exact: true }).click(); await page.getByRole('menuitem', { name: /Dil:|Language:/ }).click(); await page.waitForTimeout(500) }
const collect = () => page.evaluate(() => { const lines = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t.length > 1 && !['SCRIPT', 'STYLE'].includes(n.parentElement?.tagName)) lines.add(t) } for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) lines.add('[' + a + '] ' + v) } return [...lines] })
await page.goto(base + '/'); await page.waitForLoadState('networkidle')
if (dir === 'en2tr') { await toggle(); }
const report = {}
for (const route of ROUTES) {
  console.log('route', route)
  await page.goto(base + route); await page.waitForLoadState('networkidle'); await page.waitForTimeout(250)
  await toggle()
  const lines = await collect()
  const bad = dir === 'tr2en' ? lines.filter((l) => (TR_CHARS.test(l) || TR_WORDS.test(l)) && !NAMES.test(l)) : lines.filter((l) => EN_WORDS.test(l) && !TR_CHARS.test(l) && !NAMES.test(l) && /[a-z]/.test(l))
  if (bad.length) report[route] = bad.slice(0, 12)
  await toggle() // back to the starting language for the next route
}
writeFileSync(out, JSON.stringify(report, null, 1))
console.log(`routes with stale text after an in-place switch: ${Object.keys(report).length} -> ${out}`)
await browser.close()
