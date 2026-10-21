import { expect, test } from '@playwright/test'
import { CONTEXTS, openDemo, ROUTES, turkishLines } from './fixtures'

// English coverage: in English mode no screen, drawer or dialog may show Turkish interface text. Fictional proper names
// (customers, partners) and the legal text of the sample contract are data, not interface text, and are listed below.

test.describe('English mode', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
  })

  for (const route of [...ROUTES, ...CONTEXTS]) {
    test(`${route}: no Turkish interface text`, async ({ page }) => {
      await openDemo(page, route)
      await page.waitForTimeout(200)
      expect(await turkishLines(page)).toEqual([])
    })
  }

  test('record details, tabs and drawers in English', async ({ page }) => {
    for (const route of ['/kiralamalar/rn37?sekme=ozet', '/kiralamalar/rn37?sekme=finans', '/kiralamalar/rn37?sekme=sigorta', '/kiralamalar/rn36?sekme=finans', '/rezervasyonlar/rsv22?sekme=kaparo', '/musteriler/c3', '/kurumsal-hesaplar/co1?sekme=limit', '/finans?sekme=kaparo', '/finans?sekme=depozito', '/araclar/v1?sekme=musaitlik', '/ayarlar?bolum=kurlar']) {
      await openDemo(page, route)
      expect(await turkishLines(page), route).toEqual([])
    }
  })

  test('the main dialogs and sheets in English', async ({ page }) => {
    const open = async (route: string, button: RegExp, within = 'main') => {
      await openDemo(page, route)
      await page.locator(within).getByRole('button', { name: button }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      const bad = await turkishLines(page)
      await page.keyboard.press('Escape')
      return bad
    }
    expect(await open('/gorevler', /Create task/)).toEqual([])
    expect(await open('/bakim-servis', /Plan maintenance/)).toEqual([])
    expect(await open('/hasar-ve-olaylar', /Report damage|damage/i)).toEqual([])
    expect(await open('/musteriler', /New customer/)).toEqual([])
    expect(await open('/masraflar', /Add expense/)).toEqual([])
    expect(await open('/kullanicilar', /Invite user/)).toEqual([])
    expect(await open('/ayarlar?bolum=kurlar', /Add rate/)).toEqual([])
    await openDemo(page, '/rezervasyonlar/rsv22?sekme=kaparo')
    await page.getByRole('tab', { name: /Advance/ }).click()
    await page.getByRole('button', { name: 'Request refund' }).click()
    expect(await turkishLines(page)).toEqual([])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Demo scenarios/ }).click()
    expect(await turkishLines(page)).toEqual([])
  })
})
