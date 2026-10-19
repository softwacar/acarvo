import { expect, type Page } from '@playwright/test'

/** The 36 canonical sidebar links (spec §4) plus the two separate contexts. */
export const ROUTES = [
  '/', '/komuta-merkezi', '/filo-asistani',
  '/rezervasyonlar', '/kiralamalar', '/takvim', '/gorevler', '/araclar', '/bakim-servis', '/olay-merkezi', '/hasar-kayitlari', '/ceza-modulu',
  '/musteriler', '/kurumsal-hesaplar', '/talep-merkezi', '/partnerler', '/arac-tedarikcileri', '/fiyatlandirma',
  '/onay-merkezi', '/kurallar', '/gelir-kontrolu', '/riskler-ve-istisnalar', '/kapasite-planlama', '/filo-analizi', '/firsatlar', '/raporlar',
  '/finans', '/masraflar', '/sube-kasalari',
  '/sozlesmeler', '/belge-merkezi', '/islem-gecmisi',
  '/subeler', '/kullanicilar', '/roller-ve-yetkiler', '/ayarlar',
]
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
