import { expect, type Page } from '@playwright/test'

/** The 21 V1 menu screens (decision document H.2), plus the document list that is reached from search and record links. */
export const MENU_ROUTES = [
  '/', '/islerim',
  '/rezervasyonlar', '/kiralamalar', '/takvim', '/gorevler', '/araclar', '/bakim-servis', '/hasar-ve-olaylar',
  '/musteriler', '/kurumsal-hesaplar', '/fiyatlandirma',
  '/finans', '/masraflar', '/sube-kasalari',
  '/raporlar', '/onay-merkezi',
  '/subeler', '/kullanicilar', '/islem-gecmisi', '/ayarlar',
]
export const ROUTES = [...MENU_ROUTES, '/belge-merkezi', '/kurulum']

/** The 36 legacy links of the old menu: every address keeps working and lands where decision document I.3 says (path + search). */
export const LEGACY_ROUTES: { from: string; to: string }[] = [
  { from: '/', to: '/' },
  { from: '/komuta-merkezi', to: '/islerim' },
  { from: '/filo-asistani', to: '/filo-asistani' },
  { from: '/rezervasyonlar', to: '/rezervasyonlar' },
  { from: '/kiralamalar', to: '/kiralamalar' },
  { from: '/takvim', to: '/takvim' },
  { from: '/gorevler', to: '/gorevler' },
  { from: '/araclar', to: '/araclar' },
  { from: '/bakim-servis', to: '/bakim-servis' },
  { from: '/olay-merkezi', to: '/hasar-ve-olaylar?sekme=olaylar' },
  { from: '/hasar-kayitlari', to: '/hasar-ve-olaylar' },
  { from: '/ceza-modulu', to: '/hasar-ve-olaylar?sekme=cezalar' },
  { from: '/musteriler', to: '/musteriler' },
  { from: '/kurumsal-hesaplar', to: '/kurumsal-hesaplar' },
  { from: '/talep-merkezi', to: '/talep-merkezi' },
  { from: '/partnerler', to: '/partnerler' },
  { from: '/arac-tedarikcileri', to: '/arac-tedarikcileri' },
  { from: '/fiyatlandirma', to: '/fiyatlandirma' },
  { from: '/onay-merkezi', to: '/onay-merkezi' },
  { from: '/kurallar', to: '/kurallar' },
  { from: '/gelir-kontrolu', to: '/finans?sekme=dikkat' },
  { from: '/riskler-ve-istisnalar', to: '/islerim?sekme=uyarilar' },
  { from: '/kapasite-planlama', to: '/takvim?gorunum=kapasite' },
  { from: '/filo-analizi', to: '/raporlar?rapor=filo' },
  { from: '/firsatlar', to: '/firsatlar' },
  { from: '/raporlar', to: '/raporlar' },
  { from: '/finans', to: '/finans' },
  { from: '/masraflar', to: '/masraflar' },
  { from: '/sube-kasalari', to: '/sube-kasalari' },
  { from: '/sozlesmeler', to: '/kiralamalar?gorunum=sozlesmeler' },
  { from: '/belge-merkezi', to: '/belge-merkezi' },
  { from: '/islem-gecmisi', to: '/islem-gecmisi' },
  { from: '/subeler', to: '/subeler' },
  { from: '/kullanicilar', to: '/kullanicilar' },
  { from: '/roller-ve-yetkiler', to: '/kullanicilar?sekme=roller' },
  { from: '/ayarlar', to: '/ayarlar' },
]
/** The V1.5 / V2 screens behind a not-active page (the concept preview opens them). */
export const DEFERRED_ROUTES = ['/filo-asistani', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/kurallar', '/firsatlar']
export const CONTEXTS = ['/platform', '/partner']

/** Collects every request that targets the real API and every page error while a test runs. */
export function watch(page: Page) {
  const apiRequests: string[] = []
  const errors: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api')) apiRequests.push(`${r.method()} ${u.pathname}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return { apiRequests, errors }
}

export async function openDemo(page: Page, route = '/') {
  await page.goto(route)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over, `${label}: horizontal page scroll of ${over}px`).toBeLessThanOrEqual(1)
}

/** Switches the demo user from the top bar. */
export async function switchUser(page: Page, name: RegExp) {
  await page.getByRole('button', { name: /Demo kullanıcısı|Switch demo user/ }).click()
  await page.getByRole('menuitem', { name }).click()
}

/** Opens the demo scenario sheet and starts scenario n (1-8). Returns once the target page is loaded. */
export async function runScenario(page: Page, n: number) {
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await page.getByRole('menuitem', { name: /Demo senaryoları|Demo scenarios/ }).click()
  await page.getByRole('button', { name: /Hazırla ve aç|Prepare and open/ }).nth(n - 1).click()
  await page.waitForLoadState('networkidle')
}

/** Reads the value that follows a label in the main area (KPI strips): 'Kalan' → '300,00 EUR'. */
export async function kpiValue(page: Page, label: string): Promise<string> {
  const re = new RegExp(label + ' ([0-9.,]+ [A-Z]{3})')
  let found = ''
  await expect
    .poll(async () => {
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      found = re.exec(text)?.[1] ?? ''
      return found
    }, { message: `KPI "${label}" not found` })
    .not.toBe('')
  return found
}

/** Reads the integer that follows a label in the main area ('Açık görev 6' → 6), waiting for the page to render. */
export async function countAfter(page: Page, label: string): Promise<number> {
  const re = new RegExp(label + ' ([0-9]+)')
  let found = -1
  await expect
    .poll(async () => {
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      const m = re.exec(text)
      found = m ? Number(m[1]) : -1
      return found
    }, { message: `count "${label}" not found` })
    .toBeGreaterThanOrEqual(0)
  return found
}

/** Completes every Delivery Desk step of the rental that is open on the Delivery Desk tab and delivers it. */
export async function deliverAtDesk(page: Page) {
  await page.locator('#gate-docs').check()
  await page.locator('#gate-drv').check()
  const ready = page.getByRole('button', { name: 'Temiz ve hazır kaydet' })
  if (await ready.count()) await ready.click()
  await page.getByRole('button', { name: 'Kiracı imzalasın' }).click()
  let dlg = page.getByRole('dialog')
  const hint = await dlg.locator('#sg-n-hint').innerText()
  await dlg.locator('#sg-n').fill(hint.replace(/^.*?:\s*/, '').trim())
  await dlg.locator('#sg-ok').check()
  await dlg.getByRole('button', { name: 'İmzayı kaydet' }).click()
  await expect(dlg).toBeHidden()
  const dep = page.getByRole('button', { name: 'Depozito al' })
  if (await dep.count()) {
    await dep.click()
    dlg = page.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Depozitoyu kaydet' }).click()
    await expect(dlg).toBeHidden()
  }
  const photos = page.getByRole('group', { name: /Fotoğraflar/ }).getByRole('button')
  for (let i = 0; i < 4; i++) await photos.nth(i).click()
  await page.getByRole('button', { name: 'Teslimi tamamla' }).click()
  await expect(page.getByText('Teslim edildi').first()).toBeVisible()
}
