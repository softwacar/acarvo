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
