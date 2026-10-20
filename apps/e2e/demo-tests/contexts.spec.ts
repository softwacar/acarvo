import { expect, test } from '@playwright/test'
import { openDemo, runScenario, switchUser } from './fixtures'

// Platform Console and Partner Portal are separate contexts: no company-internal sensitive data in the first, only the
// signed-in partner's own records in the second. (Demo simulation of access, not server security.)

test.describe('platform console', () => {
  test('shows company accounts and plans but no rentals, customers, finance or documents of a company', async ({ page }) => {
    await openDemo(page, '/platform')
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    expect(text).toContain('Şirket hesapları')
    expect(text).not.toMatch(/K-0000\d\d|R-0000\d\d|T-0000\d\d/) // rental, reservation, payment numbers
    expect(text).not.toMatch(/Ajla Testović|Selma Hodžić|Nina Mock/) // customers of the demo company
    expect(text).not.toMatch(/\+387 61 000/) // customer phones
    expect(text).not.toMatch(/S11-K-10\d/) // plates
    await expect(page.getByRole('link', { name: /Rezervasyonlar|Kiralamalar|Finans/ })).toHaveCount(0)
  })
})

test.describe('partner portal', () => {
  test('a partner sees only its own leads, reservations and commission, and no customer contact data', async ({ page }) => {
    await openDemo(page, '/partner')
    const sel = page.locator('#pp-sel')
    const options = await sel.locator('option').evaluateAll((o) => o.map((x) => ({ v: (x as HTMLOptionElement).value, t: x.textContent ?? '' })))
    expect(options.length).toBeGreaterThan(1)
    const seen: Record<string, string[]> = {}
    for (const o of options) {
      await sel.selectOption(o.v)
      const tab = page.getByRole('tab', { name: /Rezervasyonlarım/ })
      if ((await tab.count()) === 0) {
        // portal closed for this partner: only the explanation is shown, no records at all
        await expect(page.getByText(/portal erişimi kapalı/)).toBeVisible()
        seen[o.t] = []
        continue
      }
      await tab.click()
      await page.waitForTimeout(150)
      const text = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ')
      seen[o.t] = [...new Set(text.match(/R-\d{6}/g) ?? [])]
      expect(text, `${o.t}: no customer phone or email`).not.toMatch(/\+387 6\d|@[a-z-]+\.(example|test)/)
      expect(text, `${o.t}: no finance or cash data of the company`).not.toMatch(/Kasa|Depozito|Hesap kalemi/)
    }
    // reservation numbers of one partner never appear for another
    const lists = Object.values(seen)
    for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) expect(lists[i]!.filter((n) => lists[j]!.includes(n))).toEqual([])
  })

  test('the partner portal never offers company screens, and leaving it returns to the company panel', async ({ page }) => {
    await openDemo(page, '/partner')
    await expect(page.getByRole('link', { name: 'Finans Merkezi' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Şirket paneline dön' }).or(page.getByRole('button', { name: 'Şirket paneline dön' })).first().click()
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })
})

test.describe('consistency across screens', () => {
  test('a cash payment shows up in the rental, in Finance → Payments and in the branch drawer, with the same amount', async ({ page }) => {
    await openDemo(page, '/')
    await runScenario(page, 5)
    const rentalNo = (await page.locator('h1').first().innerText()).trim()
    await page.getByRole('button', { name: 'Ödeme al' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('#pay-method').selectOption('cash')
    await dlg.locator('#pay-amount').fill('42')
    await dlg.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByText('42,00 EUR').first()).toBeVisible()

    await openDemo(page, '/finans?sekme=odemeler')
    await expect(page.getByRole('row', { name: new RegExp(rentalNo) }).filter({ hasText: '42,00 EUR' })).toHaveCount(1)

    await openDemo(page, '/sube-kasalari')
    const drawer = page.getByRole('region', { name: 'SJJ · EUR kasası' })
    await expect(drawer.getByText('+42,00 EUR')).toBeVisible()
    await expect(drawer.getByText(/Müşteri tahsilatı/)).toBeVisible()
  })

  test('the same vehicle reads the same in the list, Vehicle 360 and the rentals list', async ({ page }) => {
    await openDemo(page, '/araclar?q=S11-K-101')
    const row = page.getByRole('row', { name: /S11-K-101/ })
    const status = (await row.innerText()).replace(/\s+/g, ' ')
    expect(status).toContain('Kirada')
    await row.getByRole('link').first().click()
    await expect(page.getByText('Müsaitlik (şimdi)')).toBeVisible()
    await expect(page.getByText('Kirada').first()).toBeVisible()
    await openDemo(page, '/kiralamalar?q=S11-K-101')
    await expect(page.getByRole('row', { name: /S11-K-101/ }).getByText('Teslim edildi')).toBeVisible()
  })
})

test.describe('role views', () => {
  test('Operations sees customer contact details masked, the owner sees them in full, and Operations cannot open finance reports', async ({ page }) => {
    await openDemo(page, '/musteriler/c3')
    await expect(page.getByText(/\+387 61 000 1\d\d/).first()).toBeVisible()
    await switchUser(page, /Haris Mehić/)
    await openDemo(page, '/musteriler/c3')
    await expect(page.getByText(/\+387•••\d\d|\+387 •••|•••/).first()).toBeVisible()
    await expect(page.getByText(/\+387 61 000 1\d\d/)).toHaveCount(0)
    await openDemo(page, '/raporlar')
    await expect(page.getByRole('button', { name: /Gelir \(hesaplanan\)/ })).toHaveCount(0)
  })
})
