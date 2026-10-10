import path from 'node:path'
import { expect, type Page } from '@playwright/test'

/** Seeded test users (acarvo_test only). The password is generated per run by global-setup. */
export const USERS = {
  adnan: 'adnan.kovac@drina-demo.ba', // Drina: Sahip, all branches; Neretva: Yönetici
  selma: 'selma.karic@drina-demo.ba', // Drina: Operasyon, Sarajevo Aerodrom (SJJ) only
  lejla: 'lejla.begic@neretva-demo.ba', // Neretva: Sahip
} as const
export type User = keyof typeof USERS

/** Stored session of a test user (written by auth.setup.ts, ignored by Git, valid for this run only). */
export const authFile = (who: User) => path.join(import.meta.dirname, '..', '.auth', `${who}.json`)

/** Signs in through the form. Prefer `test.use({ storageState: authFile(...) })`: sign-in is rate limited. */
export async function login(page: Page, who: User) {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(USERS[who])
  await page.getByLabel('Parola', { exact: true }).fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/giris'))
}

/** Opens a vehicle's 360° page from the list search, like a user would. */
export async function openVehicle(page: Page, plate: string, tab?: string) {
  await page.goto(`/araclar?q=${encodeURIComponent(plate)}`)
  await page.locator('tr', { hasText: plate }).getByRole('link').first().click()
  await expect(page.getByRole('tablist', { name: 'Araç bölümleri' })).toBeVisible()
  if (tab) await page.getByRole('tab', { name: tab }).click()
}

export const fixture = (name: string) => path.join(process.env.E2E_FIXTURES!, name)

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0)
}

/** Sarajevo wall time (YYYY-MM-DDTHH:mm) for an offset from now, independent of the browser zone. */
export function sarajevoWallTime(offsetMs: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Sarajevo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(Date.now() + offsetMs))
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
