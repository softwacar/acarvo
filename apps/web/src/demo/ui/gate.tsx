import { Flask } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { type Legacy, MATURITY, MATURITY_LABEL, SCOPE_LABEL } from '../core/modules'
import { setConceptPreview } from '../core/ops/control'
import { L } from '../i18n'
import { runAction, useCan, useDb } from './hooks'
import { btnPrimary, btnSecondary, Notice, Page } from './kit'

// Screens that exist in the code but are not part of the V1 product (V1.5 / V2). They are never in the sidebar. A direct
// visit shows what the module is, which version it belongs to and what to use today; a permitted demo user can open
// the concept preview, which keeps the existing prototype screen without making it a promised product feature.

const label = (l: Legacy) => L(l.tr, l.en)

export function ScopeBadge({ scope }: { scope: Legacy['scope'] }) {
  return <span className="inline-flex h-6 items-center rounded-md border border-hold/40 bg-hold-soft px-2 text-[12px] font-semibold text-hold">{L(SCOPE_LABEL[scope].tr, SCOPE_LABEL[scope].en)}</span>
}

export function NotActivePage({ legacy }: { legacy: Legacy }) {
  const can = useCan()
  const allowed = can('preview:use')
  return (
    <Page
      title={`${label(legacy)} — ${L('bu sürümde etkin değil', 'not active in this version')}`}
      description={L('Bu modül ürün haritasında var, ancak günlük V1 menüsünde değildir. Kodu ve demo verisi korunur; gerçek sisteme bağlı değildir.', 'This module is on the product map but not in the daily V1 menu. Its code and demo data are kept; it is not connected to the real system.')}
      actions={<ScopeBadge scope={legacy.scope} />}
    >
      <div className="max-w-[760px] space-y-4 rounded-xl border border-line bg-surface p-5">
        <p className="text-[14px]">
          <span className="font-medium">{L('Hedef sürüm', 'Target version')}:</span> {L(SCOPE_LABEL[legacy.scope].tr, SCOPE_LABEL[legacy.scope].en)}
        </p>
        {legacy.noteTr && <p className="text-[14px] text-ink-2">{L(legacy.noteTr, legacy.noteEn ?? legacy.noteTr)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {allowed ? (
            <button type="button" className={btnPrimary} onClick={() => runAction((d) => setConceptPreview(d, true), L('Gelişmiş konsept ön izlemesi açık (demo).', 'Advanced concept preview is on (demo).'))}>
              <Flask size={16} /> {L('Gelişmiş konsept ön izlemesini aç', 'Open the advanced concept preview')}
            </button>
          ) : (
            <p className="text-[13px] text-ink-2">{L('Konsept ön izlemesi için Sahip veya Yönetici demo rolüne geçin.', 'Switch to the Owner or Manager demo role to open the concept preview.')}</p>
          )}
          <Link to={'/' as never} className={btnSecondary}>
            {L('Ana Ekran', 'Home')}
          </Link>
        </div>
        <p className="text-[12.5px] text-ink-3">{L('Ön izleme izole bir demo bağlamıdır: menüye bağlantı eklemez ve hazır ürün iddiası değildir.', 'The preview is an isolated demo context: it adds no menu link and is not a claim of a ready product.')}</p>
      </div>
    </Page>
  )
}

/** Banner shown on a deferred screen while the concept preview is on. */
export function ConceptBanner({ legacy }: { legacy: Legacy }) {
  return (
    <div className="mb-4">
      <Notice
        tone="hold"
        action={
          <button type="button" className={btnSecondary} onClick={() => runAction((d) => setConceptPreview(d, false), L('Konsept ön izlemesi kapatıldı.', 'Concept preview is off.'))}>
            {L('Ön izlemeyi kapat', 'Close the preview')}
          </button>
        }
      >
        <span className="font-semibold">{L('Demo konsepti', 'Demo concept')} · {L(SCOPE_LABEL[legacy.scope].tr, SCOPE_LABEL[legacy.scope].en)}:</span> {label(legacy)} {L('V1 ürününde yoktur; gerçek sisteme bağlı değildir. Çalışan işlemler yalnız tarayıcıdaki demo kaydını değiştirir.', 'is not part of the V1 product and is not connected to the real system. Working actions only change the demo record in this browser.')}
      </Notice>
    </div>
  )
}

/** Gate for a deferred module: not-active page, or the screen under a concept banner when the preview is on. */
export function ModuleGate({ legacy, children }: { legacy: Legacy | undefined; children: ReactNode }) {
  const d = useDb()
  if (!legacy || legacy.kind !== 'deferred') return <>{children}</>
  if (!d.session.preview) return <NotActivePage legacy={legacy} />
  return (
    <>
      <ConceptBanner legacy={legacy} />
      {children}
    </>
  )
}

/** The maturity of the screen the person is on (real / partly real / demo concept), shown once per page, never on every button. */
export function MaturityBadge({ slug }: { slug: string }) {
  const m = MATURITY[slug]
  if (!m) return null
  const t = MATURITY_LABEL[m]
  return (
    <span
      title={L(t.hintTr, t.hintEn)}
      data-testid="maturity-badge"
      data-maturity={m}
      className={'hidden h-6 shrink-0 items-center rounded-md border px-2 text-[11.5px] font-medium md:inline-flex ' + (m === 'real' ? 'border-ok/40 bg-ok-soft text-ok' : m === 'partial' ? 'border-blue/30 bg-blue-soft text-blue-ink' : 'border-hold/40 bg-hold-soft text-hold')}
    >
      {L(t.tr, t.en)}
    </span>
  )
}

/** Small "Demo concept" marker for a section inside a V1 screen whose backend does not exist yet. */
export function DemoConcept({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-hold/40 bg-hold-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-hold" title={L('Tarayıcıda çalışan demo; gerçek backend henüz yok.', 'A working browser demo; the real backend does not exist yet.')}>
      <Flask size={11} weight="bold" /> {children ?? L('Demo konsepti', 'Demo concept')}
    </span>
  )
}

/** A V1.5 view that lives inside a V1 screen: the concept preview shows it, otherwise a short not-active panel. */
export function GatedView({ scope = 'v15', title, note, children }: { scope?: Legacy['scope']; title: string; note: string; children: ReactNode }) {
  const d = useDb()
  const can = useCan()
  if (d.session.preview)
    return (
      <div className="space-y-3">
        <Notice tone="hold">
          <span className="font-semibold">{L('Demo konsepti', 'Demo concept')} · {L(SCOPE_LABEL[scope].tr, SCOPE_LABEL[scope].en)}:</span> {title} {L('V1 ürününde yoktur; gerçek sisteme bağlı değildir.', 'is not part of the V1 product and is not connected to the real system.')}
        </Notice>
        {children}
      </div>
    )
  return (
    <div className="max-w-[760px] space-y-3 rounded-xl border border-line bg-surface p-5">
      <p className="flex items-center gap-2 text-[14px] font-medium">
        {title} {L('— bu sürümde etkin değil', '— not active in this version')} <ScopeBadge scope={scope} />
      </p>
      <p className="text-[13.5px] text-ink-2">{note}</p>
      {can('preview:use') ? (
        <button type="button" className={btnSecondary} onClick={() => runAction((x) => setConceptPreview(x, true), L('Gelişmiş konsept ön izlemesi açık (demo).', 'Advanced concept preview is on (demo).'))}>
          <Flask size={15} /> {L('Gelişmiş konsept ön izlemesini aç', 'Open the advanced concept preview')}
        </button>
      ) : (
        <p className="text-[12.5px] text-ink-3">{L('Konsept ön izlemesi için Sahip veya Yönetici demo rolüne geçin.', 'Switch to the Owner or Manager demo role for the concept preview.')}</p>
      )}
    </div>
  )
}
