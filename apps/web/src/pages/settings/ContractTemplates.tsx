import { checkTemplateBody, type ContractTemplate, REQUIRED_TEMPLATE_FIELDS, TEMPLATE_FIELDS, TEMPLATE_LANGUAGES, TEMPLATE_MAX_LENGTH, type TemplateField } from '@acarvo/shared'
import { CheckCircle, Eye, FileText, Plus, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { useRef, useState } from 'react'
import { describe, Field, Input, Select, Textarea } from '@/components/fields'
import { ErrorState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, contractsApi } from '@/lib/api'
import { LANGUAGE_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { useSession } from '@/session'

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink transition-colors hover:bg-line-soft disabled:opacity-60'
const btnGhost = 'h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink'
const VERSION_STATUS = { draft: 'Taslak', active: 'Etkin', retired: 'Kullanımdan kalktı' } as const

/**
 * Ayarlar → Sözleşme şablonları (owner only). Plain text with {{fields}} from a fixed list; no HTML or links.
 * ACARVO's sample text is marked as a sample and contains no legal clauses: the company writes its own terms.
 */
export function ContractTemplateSettings() {
  const session = useSession()
  const key = ['contract-templates', session.company?.id]
  const q = useQuery({ queryKey: key, queryFn: contractsApi.templates })
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const qc = useQueryClient()
  const put = (t: ContractTemplate) => {
    qc.setQueryData(key, (old: Awaited<ReturnType<typeof contractsApi.templates>> | undefined) =>
      old ? { ...old, items: old.items.some((x) => x.id === t.id) ? old.items.map((x) => (x.id === t.id ? t : x)) : [...old.items, t] } : old,
    )
    setSelected(t.id)
  }
  const items = q.data?.items ?? []
  const current = items.find((t) => t.id === selected) ?? items[0] ?? null
  return (
    <section aria-labelledby="ct-title" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 id="ct-title" className="text-[16px] font-semibold tracking-[-0.01em]">
            Sözleşme şablonları
          </h2>
          <p className="mt-1 max-w-[760px] text-[13px] text-ink-2">
            Kiralama sözleşmesi taslakları buradaki etkin şablondan oluşturulur. Şablon düz metindir; yalnız aşağıdaki alanlar kullanılabilir. ACARVO hukuki metin sağlamaz: örnek metin yalnız yapı örneğidir ve hukuk danışmanınızın onayı gerekir.
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={() => setCreating(true)}>
          <Plus size={16} /> Yeni şablon
        </button>
      </div>
      {q.isError ? (
        <div className="px-5 pb-5">
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        </div>
      ) : !q.data ? (
        <div className="mx-5 mb-5 h-32 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : items.length === 0 ? (
        <div className="mx-5 mb-5 flex items-start gap-3 rounded-lg bg-ground/60 px-4 py-3.5">
          <FileText size={20} className="mt-0.5 shrink-0 text-ink-3" />
          <p className="text-[13.5px] text-ink-2">Henüz şablon yok. Etkin şablon olmadan sözleşme taslağı oluşturulamaz.</p>
        </div>
      ) : (
        <div className="grid border-t border-line-soft lg:grid-cols-[260px_minmax(0,1fr)]">
          <ul aria-label="Şablonlar" className="border-b border-line-soft p-2 lg:border-r lg:border-b-0">
            {items.map((t) => {
              const active = t.versions.find((v) => v.status === 'active')
              return (
                <li key={t.id}>
                  <button type="button" aria-current={t.id === current?.id ? 'true' : undefined} onClick={() => setSelected(t.id)} className={cn('w-full rounded-lg px-3 py-2 text-left hover:bg-ground', t.id === current?.id && 'bg-blue-soft/60')}>
                    <span className="block truncate font-medium text-ink">{t.name}</span>
                    <span className="block text-[12.5px] text-ink-2">
                      {LANGUAGE_LABEL[t.language]}
                      {t.country ? ` · ${t.country}` : ''} · {active ? `etkin sürüm ${active.versionNo}` : 'etkin sürüm yok'}
                      {t.isSample ? ' · örnekten' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {current && <TemplateEditor key={current.id} t={current} onSaved={put} />}
        </div>
      )}
      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            put(t)
            setCreating(false)
            toast(`${t.name} oluşturuldu (taslak).`)
          }}
        />
      )}
    </section>
  )
}

function TemplateEditor({ t, onSaved }: { t: ContractTemplate; onSaved: (t: ContractTemplate) => void }) {
  const draft = t.versions.find((v) => v.status === 'draft') ?? null
  const active = t.versions.find((v) => v.status === 'active') ?? null
  const [body, setBody] = useState(draft?.body ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const dirty = !!draft && body !== draft.body
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm('Şablonda kaydedilmemiş değişiklikler var. Sayfadan çıkılsın mı?'), enableBeforeUnload: () => dirty })
  const check = checkTemplateBody(body)
  const run = async (name: string, fn: () => Promise<ContractTemplate>, done: string) => {
    setPending(name)
    setError(null)
    try {
      const next = await fn()
      onSaved(next)
      const d = next.versions.find((v) => v.status === 'draft')
      setBody(d?.body ?? '')
      toast(done)
      return true
    } catch (e) {
      setError(e instanceof ApiRequestError && e.fields?.body ? `${e.message} ${e.fields.body}` : e instanceof Error ? e.message : 'Kaydedilemedi.')
      return false
    } finally {
      setPending(null)
    }
  }
  const insert = (f: string) => {
    const el = area.current
    const token = `{{${f}}}`
    if (!el) return setBody(body + token)
    const [a, b] = [el.selectionStart, el.selectionEnd]
    const next = body.slice(0, a) + token + body.slice(b)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + token.length, a + token.length)
    })
  }
  return (
    <div className="min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        {t.versions.map((v) => (
          <span key={v.id} className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[12.5px] font-medium', v.status === 'active' ? 'border-ok/30 bg-ok-soft text-ok' : v.status === 'draft' ? 'border-blue/25 bg-blue-soft text-blue-ink' : 'border-line bg-ground text-ink-3')}>
            Sürüm {v.versionNo} · {VERSION_STATUS[v.status]}
          </span>
        ))}
        {active && <span>Etkinleştirildi: {active.activatedAt && formatDateTime(active.activatedAt)}</span>}
      </div>
      {draft ? (
        <>
          <Field id={`tpl-body-${t.id}`} label={`Sürüm ${draft.versionNo} metni (taslak)`} hint={`${body.length.toLocaleString('tr-TR')} / ${TEMPLATE_MAX_LENGTH.toLocaleString('tr-TR')} karakter. Düz metin; HTML, bağlantı veya resim kullanılamaz.`}>
            <Textarea ref={area} {...describe(`tpl-body-${t.id}`, undefined, true)} rows={16} maxLength={TEMPLATE_MAX_LENGTH} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[320px] font-mono text-[13px]" spellCheck={false} />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Alan ekle</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TEMPLATE_FIELDS) as TemplateField[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insert(f)}
                  className={cn('h-7 rounded-md border px-2 text-[12.5px] hover:bg-ground', check.used.includes(f) ? 'border-ok/30 text-ok' : REQUIRED_TEMPLATE_FIELDS.includes(f) ? 'border-hold/40 text-hold' : 'border-line text-ink-2')}
                >
                  {TEMPLATE_FIELDS[f]}
                  {REQUIRED_TEMPLATE_FIELDS.includes(f) && <span className="sr-only"> (zorunlu)</span>}
                </button>
              ))}
            </div>
          </div>
          <ul aria-label="Şablon denetimi" className="space-y-1 text-[13px]">
            {check.missingRequired.length ? (
              <li className="flex items-start gap-1.5 text-hold">
                <WarningCircle size={15} className="mt-[2px] shrink-0" /> Etkinleştirmek için eksik zorunlu alanlar: {check.missingRequired.map((f) => TEMPLATE_FIELDS[f]).join(', ')}
              </li>
            ) : (
              <li className="flex items-start gap-1.5 text-ok">
                <CheckCircle size={15} className="mt-[2px] shrink-0" /> Zorunlu alanların hepsi var.
              </li>
            )}
            {check.unknown.length > 0 && (
              <li className="flex items-start gap-1.5 text-alert">
                <WarningCircle size={15} className="mt-[2px] shrink-0" /> Tanımsız alan: {check.unknown.join(', ')}
              </li>
            )}
            {check.stray && (
              <li className="flex items-start gap-1.5 text-alert">
                <WarningCircle size={15} className="mt-[2px] shrink-0" /> Hatalı {'{{ }}'} işareti var.
              </li>
            )}
          </ul>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
              <WarningCircle size={17} className="mt-px shrink-0" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} disabled={!dirty || pending !== null} onClick={() => run('save', () => contractsApi.saveDraft(t.id, draft.version, body), 'Taslak kaydedildi.')}>
              {pending === 'save' && <SpinnerGap size={16} className="animate-spin" />}
              Taslağı kaydet
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={pending !== null}
              onClick={async () => {
                setPending('preview')
                try {
                  setPreview((await contractsApi.previewTemplate(body)).text)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Önizleme yapılamadı.')
                } finally {
                  setPending(null)
                }
              }}
            >
              <Eye size={16} /> Örnek verilerle önizle
            </button>
            <button type="button" className={btnSecondary} disabled={dirty || check.missingRequired.length > 0 || check.unknown.length > 0 || pending !== null} onClick={() => setConfirming(true)}>
              Etkinleştir…
            </button>
            {dirty && <span className="text-[12.5px] text-hold">Kaydedilmemiş değişiklik var</span>}
          </div>
          {preview !== null && (
            <div>
              <p className="mb-1 text-[12.5px] text-ink-2">Önizleme (kurgusal örnek veriler; gerçek kayıt kullanılmaz)</p>
              <div className="max-h-[360px] overflow-y-auto rounded-lg border border-line-soft bg-ground/40 px-4 py-3 text-[13.5px] break-words whitespace-pre-wrap">{preview || 'Metin boş.'}</div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">Etkin sürüm değiştirilemez; değişiklik için etkin metinden yeni bir taslak sürüm açın. Mevcut sözleşmeler kendi şablon sürümünü korur.</p>
          {active && <div className="max-h-[360px] overflow-y-auto rounded-lg border border-line-soft bg-ground/40 px-4 py-3 font-mono text-[12.5px] break-words whitespace-pre-wrap">{active.body}</div>}
          {error && (
            <p role="alert" className="text-[13px] font-medium text-alert">
              {error}
            </p>
          )}
          <button type="button" className={btnSecondary} disabled={pending !== null} onClick={() => run('draft', () => contractsApi.newDraft(t.id), 'Yeni taslak sürüm açıldı.')}>
            {pending === 'draft' && <SpinnerGap size={16} className="animate-spin" />}
            Yeni taslak sürüm aç
          </button>
        </div>
      )}
      {confirming && draft && (
        <ConfirmActivate
          name={t.name}
          versionNo={draft.versionNo}
          activeNo={active?.versionNo ?? null}
          isSample={t.isSample}
          pending={pending === 'activate'}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (await run('activate', () => contractsApi.activateTemplate(t.id, draft.version), `${t.name} sürüm ${draft.versionNo} etkinleştirildi.`)) setConfirming(false)
          }}
        />
      )}
    </div>
  )
}

function ConfirmActivate({ name, versionNo, activeNo, isSample, pending, onClose, onConfirm }: { name: string; versionNo: number; activeNo: number | null; isSample: boolean; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const returnFocus = useReturnFocus()
  const [ack, setAck] = useState(false)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[500px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">Şablonu etkinleştir</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {name} sürüm {versionNo} yeni sözleşme taslaklarında kullanılır{activeNo ? `; sürüm ${activeNo} kullanımdan kalkar (mevcut sözleşmeler etkilenmez)` : ''}. Etkin sürüm sonradan değiştirilemez.
          </Dialog.Description>
          <label className="mt-4 flex items-start gap-2.5 text-[13.5px] text-ink">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 size-4 accent-blue" />
            {isSample ? 'Metnin ACARVO örneğinden başladığını ve şirket hükümlerinin hukuk danışmanımızca kontrol edildiğini biliyorum.' : 'Metnin şirketimizin sorumluluğunda olduğunu ve ACARVO’nun hukuki kontrol yapmadığını biliyorum.'}
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close className={btnGhost}>Vazgeç</Dialog.Close>
            <button type="button" disabled={!ack || pending} onClick={onConfirm} className={btnPrimary}>
              {pending && <SpinnerGap size={16} className="animate-spin" />}
              Etkinleştir
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ContractTemplate) => void }) {
  const returnFocus = useReturnFocus()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('tr')
  const [country, setCountry] = useState('')
  const [fromSample, setFromSample] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content onCloseAutoFocus={returnFocus} className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
          <Dialog.Title className="text-[17px] font-semibold">Yeni sözleşme şablonu</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">Şablon taslak olarak açılır; etkinleştirene kadar kullanılmaz.</Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const next: Record<string, string> = {}
              if (!name.trim()) next.name = 'Şablon adını girin'
              if (country && !/^[A-Z]{2}$/.test(country)) next.country = 'İki harfli ülke kodu (ör. BA)'
              setErrors(next)
              if (Object.keys(next).length) return
              setPending(true)
              try {
                onCreated(await contractsApi.createTemplate({ name: name.trim(), language, country: country || null, fromSample }))
              } catch (err) {
                setErrors(err instanceof ApiRequestError && err.fields ? err.fields : { name: err instanceof Error ? err.message : 'Oluşturulamadı.' })
              } finally {
                setPending(false)
              }
            }}
          >
            <Field id="ct-name" label="Şablon adı" required error={errors.name}>
              <Input {...describe('ct-name', errors.name)} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ct-lang" label="Belge dili" required>
                <Select id="ct-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {TEMPLATE_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="ct-country" label="Ülke (isteğe bağlı)" error={errors.country} hint="Bilgi amaçlı; kural etkinleştirmez.">
                <Input {...describe('ct-country', errors.country, true)} maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="BA" />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
              <input type="checkbox" checked={fromSample} onChange={(e) => setFromSample(e.target.checked)} className="mt-1 size-4 accent-blue" />
              <span>
                ACARVO örnek yapısıyla başla
                <span className="block text-[12.5px] text-ink-2">“ÖRNEK METİN — HUKUKİ ONAY GEREKTİRİR” işaretlidir; hukuki hüküm içermez. Türkçe dışındaki diller için İngilizce örnek gelir.</span>
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className={btnGhost}>Vazgeç</Dialog.Close>
              <button type="submit" disabled={pending} className={btnPrimary}>
                {pending && <SpinnerGap size={16} className="animate-spin" />}
                Oluştur
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
