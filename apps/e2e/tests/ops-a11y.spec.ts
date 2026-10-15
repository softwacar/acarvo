import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { authFile, openVehicle } from './fixtures'

// Accessibility (axe, WCAG 2.1 A/AA) of the maintenance, damage and transfer screens. Serious and critical findings
// fail the test. Runs on the records created by operations.spec when both run; empty states otherwise.
test.use({ storageState: authFile('adnan') })

async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  for (const v of result.violations) console.log(`[axe] ${label}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), label).toEqual([])
}

test('lists, forms, details, dialogs and the vehicle tabs', async ({ page }) => {
  test.setTimeout(120_000)
  for (const [url, label] of [
    ['/bakim-servis?view=all', 'bakım listesi'],
    ['/bakim-servis/yeni', 'bakım planla'],
    ['/hasar-kayitlari?view=all', 'hasar listesi'],
    ['/hasar-kayitlari/yeni', 'hasar bildir'],
    ['/araclar/transferler?view=all', 'transfer listesi'],
    ['/araclar/transferler/yeni', 'transfer talebi'],
  ] as const) {
    await page.goto(url)
    await audit(page, label)
  }
  // Validation messages on the empty create form.
  await page.goto('/hasar-kayitlari/yeni')
  await page.getByRole('button', { name: 'Hasar dosyası aç' }).click()
  await audit(page, 'hasar formu hataları')
  // Details (when records exist) and a step dialog.
  for (const [url, label] of [
    ['/bakim-servis?view=all', 'bakım'],
    ['/hasar-kayitlari?view=all', 'hasar'],
    ['/araclar/transferler?view=all', 'transfer'],
  ] as const) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    const link = page.locator('tbody tr').first().getByRole('link')
    if (await link.count()) {
      await link.first().click()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await audit(page, `${label} ayrıntısı`)
      const step = page.getByRole('button', { name: /^(İnceleme durumu|Servise al|Yola çıkar|Onayla|İptal et)$/ }).first()
      if (await step.count()) {
        await step.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await audit(page, `${label} adım diyaloğu`)
        await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click()
      }
    }
  }
  await openVehicle(page, 'T48-K-276')
  await audit(page, 'araç genel (engeller)')
  for (const tab of ['Müsaitlik ve planlama', 'Bakım ve lastikler', 'Belgeler ve riskler']) {
    await page.getByRole('tab', { name: tab }).click()
    await audit(page, `araç ${tab}`)
  }
})
