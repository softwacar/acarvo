import { expect, test } from '@playwright/test'
import { CONTEXTS, openDemo, ROUTES, watch } from './fixtures'

// The demo must never talk to the real API. Every route is opened with no API server running and the page is checked
// for outgoing /api requests, runtime errors and the guard's own attempt log.

test.describe('demo isolation', () => {
  for (const route of [...ROUTES, ...CONTEXTS]) {
    test(`${route}: renders with no API request and no runtime error`, async ({ page }) => {
      const w = watch(page)
      await openDemo(page, route)
      await expect(page.locator('main, #main').first()).toBeVisible()
      expect(w.apiRequests, 'requests sent to /api').toEqual([])
      expect(await page.evaluate(() => (window as unknown as { __acarvoApiAttempts?: string[] }).__acarvoApiAttempts ?? [])).toEqual([])
      expect(w.errors).toEqual([])
    })
  }

  test('the company screens always show the demo label', async ({ page }) => {
    await openDemo(page, '/')
    await expect(page.getByText('ACARVO DEMO — Örnek Veriler').first()).toBeVisible()
  })

  test('a direct fetch to the real API is refused by the network guard and is not sent', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('/api/vehicles')
        return 'sent'
      } catch (e) {
        return `refused: ${(e as Error).message}`
      }
    })
    expect(outcome.startsWith('refused')).toBe(true)
    expect(w.apiRequests).toEqual([])
    const attempts = await page.evaluate(() => (window as unknown as { __acarvoApiAttempts?: string[] }).__acarvoApiAttempts ?? [])
    expect(attempts.length).toBeGreaterThan(0)
  })

  test('XMLHttpRequest and sendBeacon to the API are refused too', async ({ page }) => {
    const w = watch(page)
    await openDemo(page, '/')
    const result = await page.evaluate(() => {
      let xhr = 'sent'
      try {
        const x = new XMLHttpRequest()
        x.open('GET', '/api/customers')
        x.send()
      } catch {
        xhr = 'refused'
      }
      let beacon: boolean | string = 'sent'
      try {
        beacon = navigator.sendBeacon('/api/log', 'x')
      } catch {
        beacon = 'refused'
      }
      return { xhr, beacon }
    })
    expect(result.xhr).toBe('refused')
    expect(result.beacon === false || result.beacon === 'refused').toBe(true)
    expect(w.apiRequests).toEqual([])
  })
})
