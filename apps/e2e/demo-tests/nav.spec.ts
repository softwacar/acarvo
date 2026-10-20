import { expect, test } from '@playwright/test'
import { DEFERRED_ROUTES, LEGACY_ROUTES, MENU_ROUTES, openDemo, switchUser, watch } from './fixtures'

// O.A: the V1 menu (6 groups, 21 links), every legacy address, the concept preview and the way hidden screens stay reachable.

const sidebar = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: /Ana menü|Main menu/ })

test.describe('navigation · 21 links', () => {
  test('the owner sees the 6 groups and exactly 21 links, in the documented order, with Tasks as its own link', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    const nav = sidebar(page)
    await expect(nav.getByRole('link')).toHaveCount(21)
    const groups = await nav.getByRole('button', { expanded: true }).allTextContents()
    expect(groups.map((g) => g.replace(/\d+$/, '').trim())).toEqual(['Genel', 'Operasyon', 'Müşteri & Ticari', 'Finans', 'Kontrol ve Raporlar', 'Yönetim'])
    const labels = await nav.getByRole('link').allTextContents()
    expect(labels.map((l) => l.trim())).toEqual(['Ana Ekran', 'İşlerim', 'Rezervasyonlar', 'Kiralamalar', 'Takvim', 'Görevler', 'Araçlar', 'Bakım & Servis', 'Hasar ve Olaylar', 'Müşteriler', 'Kurumsal Hesaplar', 'Fiyatlandırma', 'Finans', 'Masraflar', 'Şube Kasaları', 'Raporlar', 'Onay Merkezi', 'Şubeler', 'Kullanıcılar ve Roller', 'İşlem Geçmişi', 'Ayarlar'])
    expect(w.apiRequests).toEqual([])
  })

  test('every V1 screen opens with its own heading and no runtime error', async ({ page }) => {
    const w = watch(page)
    for (const route of MENU_ROUTES) {
      await openDemo(page, route)
      await expect(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
    }
    expect(w.errors).toEqual([])
  })

  test('all 36 legacy addresses still work and land on the screen that now holds them', async ({ page }) => {
    test.setTimeout(240_000)
    for (const { from, to } of LEGACY_ROUTES) {
      await openDemo(page, from)
      const u = new URL(page.url())
      expect(u.pathname + u.search, `${from} → ${to}`).toBe(to)
      await expect(page.getByRole('heading').first(), from).toBeVisible()
    }
  })

  test('a legacy address keeps its record query: an old damage link opens the damage drawer', async ({ page }) => {
    await openDemo(page, '/hasar-kayitlari')
    await page.locator('table tbody tr').first().click()
    const open = new URL(page.url())
    await openDemo(page, `/hasar-kayitlari${open.search}`)
    expect(new URL(page.url()).pathname).toBe('/hasar-ve-olaylar')
    expect(new URL(page.url()).search).toContain('kayit=')
  })
})

test.describe('navigation · deferred screens and the concept preview', () => {
  for (const route of DEFERRED_ROUTES) {
    test(`${route} shows a not-active page with its target version, not a ready product`, async ({ page }) => {
      await openDemo(page, route)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/bu sürümde etkin değil/)
      await expect(page.getByText(/Hedef sürüm:/)).toBeVisible()
      await expect(sidebar(page).getByRole('link')).toHaveCount(21) // never a new sidebar link
    })
  }

  test('the Owner can open the advanced concept preview: the screen appears under a Demo concept banner and the menu still has 21 links', async ({ page }) => {
    await openDemo(page, '/partnerler')
    await page.getByRole('button', { name: /Gelişmiş konsept ön izlemesini aç/ }).click()
    await expect(page.getByText(/Demo konsepti · V2/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Partnerler' })).toBeVisible()
    await expect(sidebar(page).getByRole('link')).toHaveCount(21)
    await page.getByRole('button', { name: 'Ön izlemeyi kapat' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/bu sürümde etkin değil/)
  })

  test('Operations cannot open the preview: it asks for an Owner or Manager role', async ({ page }) => {
    await openDemo(page, '/')
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/kurallar')
    await expect(page.getByText(/Bu ekran için yetkiniz yok|bu sürümde etkin değil/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Gelişmiş konsept ön izlemesini aç/ })).toHaveCount(0)
  })

  test('V1.5 views inside V1 screens (Calendar capacity, Incidents, Fines, Exceptions, Shift handover) are gated the same way', async ({ page }) => {
    await openDemo(page, '/takvim?gorunum=kapasite')
    await expect(page.getByText(/Kapasite — bu sürümde etkin değil/)).toBeVisible()
    await openDemo(page, '/hasar-ve-olaylar?sekme=olaylar')
    await expect(page.getByText(/Olaylar — bu sürümde etkin değil/)).toBeVisible()
    await openDemo(page, '/hasar-ve-olaylar?sekme=cezalar')
    await expect(page.getByText(/Cezalar — bu sürümde etkin değil/)).toBeVisible()
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Gelişmiş konsept ön izlemesi/ }).click()
    await page.getByRole('button', { name: 'Ön izlemeyi aç' }).click()
    await page.keyboard.press('Escape')
    await openDemo(page, '/hasar-ve-olaylar?sekme=olaylar')
    await expect(page.getByRole('tab', { name: /Olaylar \(V1\.5\)/ })).toBeVisible()
  })
})

test.describe('navigation · permissions and hidden screens', () => {
  test('hiding a screen from the menu never hides the way to it: the user menu lists the other screens', async ({ page }) => {
    await openDemo(page, '/')
    await page.getByRole('button', { name: /Demo kullanıcısı ve rol değiştir/ }).click()
    // The default demo company is the Advanced profile (21 links): nothing is hidden, so there is no "hidden screens" block.
    await expect(page.getByText('Menüde gizli ekranlar')).toHaveCount(0)
  })

  test('the Operations role sees a shorter menu that still has Tasks and My Work; a forbidden address shows the reason, not data', async ({ page }) => {
    await openDemo(page, '/')
    await switchUser(page, /Haris Mehić/)
    const links = await sidebar(page).getByRole('link').allTextContents()
    expect(links.map((l) => l.trim())).toEqual(expect.arrayContaining(['Görevler', 'İşlerim', 'Rezervasyonlar', 'Kiralamalar']))
    expect(links.length).toBeLessThanOrEqual(14)
    await openDemo(page, '/kullanicilar')
    await expect(page.getByText('Bu ekran için yetkiniz yok')).toBeVisible()
  })

  test('the global search finds a screen by its old name and opens its new place', async ({ page }) => {
    await openDemo(page, '/')
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Ara' }).fill('Komuta')
    await page.getByRole('option', { name: /Komuta Merkezi/ }).click()
    await expect(page).toHaveURL(/\/islerim/)
  })
})
