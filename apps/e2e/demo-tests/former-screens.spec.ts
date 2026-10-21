import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { enablePreview, expectNoHorizontalOverflow, FORMER_SCREENS, openDemo, turkishLines, watch } from './fixtures'

// The old 36-link menu had a screen per address; the V1 menu folds sixteen of them into other screens or defers them (V1.5 / V2).
// Their per-screen accessibility, layout, English and isolation checks used to run on the old addresses. They run here on the same
// addresses, with the concept preview on (so the V1.5 / V2 content is what is checked) and once without it (the not-active page).

test.describe('former screens · with the concept preview', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page, '/')
    await enablePreview(page)
  })
  for (const route of FORMER_SCREENS) {
    test(`${route}: no serious axe violation, no API request, no runtime error`, async ({ page }) => {
      const w = watch(page)
      await openDemo(page, route)
      await expect(page.locator('main').first()).toBeVisible()
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
      expect(w.apiRequests).toEqual([])
      expect(w.errors).toEqual([])
    })
    test(`${route}: no horizontal page scroll at 1440, 1024, 768 and 390`, async ({ page }) => {
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await openDemo(page, route)
        await expectNoHorizontalOverflow(page, `${route} @${width}`)
      }
    })
    test(`${route}: no Turkish interface text in English`, async ({ page }) => {
      await page.getByRole('button', { name: 'Demo', exact: true }).click()
      await page.getByRole('menuitem', { name: /Dil:/ }).click()
      await expect(page.getByRole('link', { name: 'Reservations' }).first()).toBeVisible()
      await openDemo(page, route)
      await page.waitForTimeout(200)
      expect(await turkishLines(page)).toEqual([])
    })
  }
})

test.describe('former screens · without the preview', () => {
  for (const route of FORMER_SCREENS) {
    test(`${route}: lands on a V1 screen or a not-active page; accessible, no overflow, no API request`, async ({ page }) => {
      const w = watch(page)
      await openDemo(page, route)
      await expect(page.locator('main').first()).toBeVisible()
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
      await page.setViewportSize({ width: 390, height: 900 })
      await openDemo(page, route)
      await expectNoHorizontalOverflow(page, `${route} @390`)
      expect(w.apiRequests).toEqual([])
      expect(w.errors).toEqual([])
    })
  }
})
