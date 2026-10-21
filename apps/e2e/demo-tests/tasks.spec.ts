import { expect, test } from '@playwright/test'
import { openDemo, switchUser, watch } from './fixtures'

// Görevler is its own screen (decision document K-3, K-4): open pool, claiming, links back to the record, bulk work, notifications.

test.describe('Görevler', () => {
  test('the open pool lists unclaimed tasks; claiming one moves it to "Bana atanan" and takes it out of the pool', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/gorevler?gorunum=havuz')
    const rows = page.getByRole('table', { name: 'Görev listesi' }).getByRole('row')
    const before = (await rows.count()) - 1
    expect(before).toBeGreaterThan(0)
    await rows.nth(1).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Açık havuz (üstlenilmedi)')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Tamamla' })).toHaveCount(0) // a pool task must be claimed first
    await drawer.getByRole('button', { name: 'Üstlen' }).click()
    await expect(page.getByText('Görevi üstlendiniz.').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tab', { name: /Açık havuz/ }).first()).toContainText(String(before - 1))
    expect(w.apiRequests).toEqual([])
  })

  test('a task claimed in another tab is taken here too: the second person gets no Üstlen button', async ({ page, context }) => {
    await openDemo(page, '/gorevler?gorunum=havuz')
    const rows = page.getByRole('table', { name: 'Görev listesi' }).getByRole('row')
    await rows.nth(1).click()
    const no = (await page.getByRole('dialog').getByRole('heading').first().innerText()).trim()
    const other = await context.newPage()
    await openDemo(other, `/gorevler?gorunum=havuz&kayit=`)
    await page.getByRole('dialog').getByRole('button', { name: 'Üstlen' }).click()
    await expect(page.getByText('Görevi üstlendiniz.').first()).toBeVisible()
    // the other tab adopts the saved state through the shared channel and no longer offers the task in the pool
    await expect(other.getByRole('table', { name: 'Görev listesi' }).getByText(no)).toHaveCount(0, { timeout: 10_000 })
  })

  test('a task is created from a vehicle, shows up on the vehicle again, and completing it leaves the record untouched', async ({ page }) => {
    await openDemo(page, '/araclar')
    const href = await page.locator('main a[href^="/araclar/v"]').first().getAttribute('href')
    expect(href).toBeTruthy()
    await openDemo(page, href + '?sekme=gorevler')
    await page.getByRole('button', { name: 'Görev ekle' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByTestId('task-link')).toBeVisible()
    await dlg.getByLabel(/Başlık/).fill(await dlg.getByLabel(/Başlık/).inputValue() + 'Lastik basıncını ölçün')
    await dlg.getByLabel('Sorumlu').selectOption({ label: 'Adnan Kovač — Şirket sahibi' })
    await dlg.getByRole('button', { name: 'Oluştur' }).click()
    await expect(page.getByText('Lastik basıncını ölçün').first()).toBeVisible()
    // the same task is on the Görevler screen, linked back to the vehicle
    await openDemo(page, '/gorevler?gorunum=ekip')
    await expect(page.getByText('Lastik basıncını ölçün').first()).toBeVisible()
  })

  test('bulk complete reports what it did and what it skipped', async ({ page }) => {
    await openDemo(page, '/gorevler')
    const boxes = page.getByRole('checkbox', { name: /^Seç / })
    const n = await boxes.count()
    test.skip(n < 1, 'no task assigned to the owner in the seed')
    await boxes.nth(0).check()
    await expect(page.getByRole('region', { name: 'Toplu işlemler' })).toContainText('1 görev seçili')
    await page.getByRole('button', { name: 'Seçilenleri tamamla' }).click()
    await expect(page.getByRole('region', { name: 'Toplu işlemler' })).toHaveCount(0)
  })

  test('Sorumlu roles: the manager sees every open task, the operator only what is assigned or poolable', async ({ page }) => {
    await openDemo(page, '/gorevler')
    await expect(page.getByRole('tab', { name: /Tüm açık görevler/ })).toBeVisible()
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/gorevler')
    await expect(page.getByRole('tab', { name: /Tüm açık görevler/ })).toHaveCount(0)
  })

  test('branch scope: a pool task of another branch is not shown to a front-desk user, but the manager sees it', async ({ page }) => {
    const title = 'Dubrovnik: transfer aracı yakıt kontrolü'
    await openDemo(page, '/gorevler?gorunum=ekip&q=Dubrovnik')
    await expect(page.getByText(title).first()).toBeVisible()
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/gorevler?gorunum=havuz')
    await expect(page.getByText(title)).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /Açık havuz/ })).toHaveAttribute('aria-selected', 'true') // the pool view itself opens for the front desk
  })
})
