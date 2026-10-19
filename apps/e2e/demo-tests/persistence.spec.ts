import { expect, test, type Page } from '@playwright/test'
import { openDemo, switchUser, watch } from './fixtures'

// Demo state lives in this browser only. These tests pin down when it is saved, what a reload brings back and what the
// reset removes; none of them asks the API.

const createTask = async (page: Page, title: string) => {
  await openDemo(page, '/gorevler?gorunum=ekip')
  await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('#tk-t').fill(title)
  await dlg.locator('#tk-m').selectOption('pool')
  await dlg.getByRole('button', { name: 'Oluştur' }).click()
  await expect(dlg).toBeHidden()
}

test.describe('persistence', () => {
  test('a new record is still there after an immediate reload; an edit too', async ({ page }) => {
    const w = watch(page)
    const title = 'Kalıcılık denemesi görevi'
    await createTask(page, title)
    await page.reload() // immediately: the last action must have been flushed
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(title)).toBeVisible()

    // edit: claim it, reload straight away
    await page.getByText(title).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Üstlen' }).click()
    await page.keyboard.press('Escape')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await openDemo(page, '/gorevler')
    await expect(page.getByText(title)).toBeVisible() // now owned by the signed-in demo user, so it is in "mine"
    expect(w.apiRequests).toEqual([])
  })

  test('the reset brings back the seed: a created record disappears, the seeded advance story is there again', async ({ page }) => {
    const title = 'Sıfırlanınca kaybolacak görev'
    await createTask(page, title)
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Demo verilerini sıfırla/ }).click()
    await page.getByRole('button', { name: 'Sıfırla' }).click()
    await page.waitForLoadState('networkidle')
    await openDemo(page, '/gorevler?gorunum=ekip')
    await expect(page.getByText(title)).toHaveCount(0)
    await openDemo(page, '/rezervasyonlar?q=Selma')
    await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
  })

  test('signed-in role and language survive a reload', async ({ page }) => {
    await openDemo(page, '/')
    await switchUser(page, /Haris Mehić/)
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Switch demo user/ })).toContainText('Haris Mehić')
  })

  test('filters live in the URL: they survive Back/Forward, a reload and a language switch', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar?q=Selma')
    await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
    await page.getByText('Selma Hodžić-Demo').first().click()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await page.goBack()
    await expect(page).toHaveURL(/q=Selma/)
    await page.goForward()
    await expect(page).toHaveURL(/\/rezervasyonlar\/rsv\d+/)
    await page.goBack()
    await page.reload()
    await expect(page.getByRole('searchbox').or(page.getByRole('textbox', { name: /ara/i })).first()).toHaveValue('Selma')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    await expect(page).toHaveURL(/q=Selma/)
    await expect(page.getByText('Selma Hodžić-Demo').first()).toBeVisible()
  })

  test('an unfinished form keeps its inputs when the language is switched', async ({ page }) => {
    await openDemo(page, '/rezervasyonlar/yeni')
    await page.locator('#bk-note').fill('Müşteri çocuk koltuğu istiyor')
    await page.getByRole('button', { name: 'Demo', exact: true }).click()
    await page.getByRole('menuitem', { name: /Dil:/ }).click()
    await expect(page.getByRole('button', { name: 'Save reservation' })).toBeVisible()
    await expect(page.locator('#bk-note')).toHaveValue('Müşteri çocuk koltuğu istiyor')
  })

  test('when the browser refuses to store anything the demo says so instead of pretending the data is saved', async ({ page, context }) => {
    await context.addInitScript(() => {
      const refuse = () => { throw new DOMException('blocked', 'SecurityError') }
      Object.defineProperty(window, 'indexedDB', { value: { open: refuse } })
      Storage.prototype.setItem = refuse
    })
    await openDemo(page, '/gorevler?gorunum=ekip')
    await page.getByRole('button', { name: 'Görev oluştur' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#tk-t').fill('Kaydedilemeyen görev')
    await dlg.locator('#tk-m').selectOption('pool')
    await dlg.getByRole('button', { name: 'Oluştur' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /kayıt yapılamıyor/ })).toBeVisible()
    await expect(page.getByText('Kaydedilemeyen görev')).toBeVisible() // the tab itself keeps working
  })
})
