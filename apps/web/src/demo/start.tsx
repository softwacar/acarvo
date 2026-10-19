import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/Toaster'
import '@/index.css'
import { createDemoRouter } from './router'
import { loadDemo, useDb } from './core/store'
import { L, setLangGlobal } from './i18n'

declare global {
  interface Window {
    /** Requests to the real API that the demo refused (the browser tests assert this stays empty). */
    __acarvoApiAttempts?: string[]
    __acarvoDemo?: true
  }
}

/**
 * The demo never talks to the real API. Any request to /api is refused here, before it leaves the browser, and counted so
 * a test can prove no request was made. The real client in lib/api.ts refuses as well (two independent layers).
 */
function installNetworkGuard() {
  window.__acarvoApiAttempts = []
  window.__acarvoDemo = true
  const blocked = (u: string) => {
    try {
      const p = new URL(u, window.location.href)
      return p.origin === window.location.origin && (p.pathname === '/api' || p.pathname.startsWith('/api/'))
    } catch {
      return false
    }
  }
  const realFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (blocked(url)) {
      window.__acarvoApiAttempts!.push(url)
      return Promise.reject(new TypeError('Demo modunda gerçek API\'ye istek gönderilmez.'))
    }
    return realFetch(input, init)
  }
  const realOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (blocked(String(url))) {
      window.__acarvoApiAttempts!.push(String(url))
      throw new TypeError('Demo modunda gerçek API\'ye istek gönderilmez.')
    }
    return (realOpen as (...a: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof XMLHttpRequest.prototype.open
  const realBeacon = navigator.sendBeacon?.bind(navigator)
  if (realBeacon) {
    navigator.sendBeacon = (url, data) => {
      if (blocked(String(url))) {
        window.__acarvoApiAttempts!.push(String(url))
        return false
      }
      return realBeacon(url, data)
    }
  }
}

function DemoRoot({ router }: { router: ReturnType<typeof createDemoRouter> }) {
  const d = useDb()
  setLangGlobal(d.session.lang)
  useEffect(() => {
    document.documentElement.lang = d.session.lang
    document.title = `${L('ACARVO Demo', 'ACARVO Demo')} · ${d.settings.company.name}`
  }, [d.session.lang, d.settings.company.name])
  // The tree is re-mounted when the language changes so every screen reads the new language.
  return (
    <div key={d.session.lang}>
      <RouterProvider router={router} />
      <Toaster />
    </div>
  )
}

export async function startDemo() {
  installNetworkGuard()
  await loadDemo()
  const router = createDemoRouter()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DemoRoot router={router} />
    </StrictMode>,
  )
}
