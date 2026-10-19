import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { CONTEXTS, expectNoHorizontalOverflow, openDemo, ROUTES } from './fixtures'

// Accessibility (axe, WCAG 2.1 A/AA) on every screen; serious and critical findings fail. Responsive layout: no
// horizontal page scroll at 1440, 1024, 768 and 390.

test.describe('accessibility', () => {
  for (const route of [...ROUTES, ...CONTEXTS]) {
    test(`${route}: no serious or critical axe violation`, async ({ page }) => {
      await openDemo(page, route)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const v of result.violations) console.log(`[axe] ${route}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
      const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    })
  }
})

for (const width of [1440, 1024, 768, 390]) {
  test.describe(`layout at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    for (const route of [...ROUTES, ...CONTEXTS]) {
      test(`${route}: no horizontal page scroll`, async ({ page }) => {
        await openDemo(page, route)
        await expectNoHorizontalOverflow(page, `${route} @${width}`)
      })
    }
  })
}
