import { CUSTOMER_DOCUMENT_TYPES, type RequirementItem, type RequirementPolicy, type ResidencyClass } from '@acarvo/shared'
import { ArrowRight, CaretDown, GearSix, Info, ListChecks, MapPin, Plus, ShieldWarning, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Input, Select } from '@/components/fields'
import { ErrorState, PageHeader, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, type DocumentSettingsOverview, rentalsApi, settingsApi } from '@/lib/api'
import { DOCUMENT_TYPE_LABELS } from '@/lib/customer-document-labels'
import { countryName, countryOptions, RESIDENCY_LABELS } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { ContractTemplateSettings } from './ContractTemplates'

const btnPrimary = 'inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue px-3.5 text-[13.5px] font-medium text-white hover:bg-blue-ink disabled:opacity-60'
const btnSecondary = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] font-medium text-ink hover:bg-line-soft disabled:opacity-60'
const btnGhost = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-60'

const KEY = ['settings-customer-documents']
const itemText = (i: RequirementItem) => i.acceptedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(' veya ')
const evidenceText = (i: RequirementItem) => [i.originalSeenRequired && 'aslı görülmeli', i.copyRequired && 'kopyası saklanmalı'].filter(Boolean).join(' · ')

function useSettingsMutation<T>(fn: (arg: T) => Promise<DocumentSettingsOverview>, done?: string) {
  const qc = useQueryClient()
  const session = useSession()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData([...KEY, session.company?.id], data)
      void qc.invalidateQueries({ queryKey: ['customer-document-status'] })
      if (done) toast(done)
    },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.'),
  })
}

function ActivateDialog({ policy, onClose }: { policy: RequirementPolicy; onClose: () => void }) {
  const returnFocus = useReturnFocus()
  const [checked, setChecked] = useState(false)
  const activate = useSettingsMutation(() => settingsApi.activate(policy.id), `${countryName(policy.country)} · ${RESIDENCY_LABELS[policy.residencyClass]} sürüm ${policy.version} etkinleştirildi.`)
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">Gereksinimi etkinleştir</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            {countryName(policy.country)} şubeleri için “{RESIDENCY_LABELS[policy.residencyClass]}” gereksinimi, sürüm {policy.version}. Etkinleşince müşteri dosyalarında belge durumu bu kurala göre gösterilir; varsa
            önceki sürüm devre dışı kalır. Etkin sürüm sonradan değiştirilemez.
          </Dialog.Description>
          <ul className="mt-3 space-y-1 rounded-lg bg-ground/60 px-3.5 py-2.5 text-[13.5px]">
            {policy.items.map((i, n) => (
              <li key={n}>
                <span className="font-medium">{itemText(i)}</span>
                {evidenceText(i) && <span className="text-ink-2"> · {evidenceText(i)}</span>}
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13.5px] font-medium text-ink">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ac-blue)]" />
            Bu kuralları şirketimizin kendi değerlendirmesiyle kontrol ettim. Bu işaret hukuki uygunluk onayı veya garantisi değildir; ACARVO mevzuata uygunluğu doğrulamaz.
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close className="h-9 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
            <button type="button" disabled={!checked || activate.isPending} onClick={() => activate.mutate(undefined, { onSuccess: onClose })} className={btnPrimary}>
              {activate.isPending && <SpinnerGap size={14} className="animate-spin" />}
              Etkinleştir
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Editable items of a draft: each item lists alternative types; evidence settings are separate. */
function DraftEditor({ policy }: { policy: RequirementPolicy }) {
  const [items, setItems] = useState<RequirementItem[]>(policy.items.length ? policy.items : [{ acceptedTypes: [], originalSeenRequired: false, copyRequired: false }])
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = useSettingsMutation((list: RequirementItem[]) => settingsApi.saveItems(policy.id, list), 'Taslak kaydedildi.')
  const discard = useSettingsMutation(() => settingsApi.retire(policy.id), 'Taslak silindi.')
  const dirty = JSON.stringify(items) !== JSON.stringify(policy.items)
  const valid = items.length > 0 && items.every((i) => i.acceptedTypes.length > 0)
  const patch = (n: number, p: Partial<RequirementItem>) => setItems((list) => list.map((i, k) => (k === n ? { ...i, ...p } : i)))
  const label = `${countryName(policy.country)} ${RESIDENCY_LABELS[policy.residencyClass]} taslak`
  return (
    <div className="rounded-lg border border-blue/30 bg-blue-soft/30 p-3.5" role="group" aria-label={label}>
      <p className="mb-2 text-[13px] font-semibold text-ink">
        Taslak · sürüm {policy.version}
        {policy.templateCode && <span className="font-normal text-ink-2"> · örnek şablondan</span>}
      </p>
      <ol className="space-y-3">
        {items.map((item, n) => (
          <li key={n} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Madde {n + 1}: şu belgelerden biri</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOMER_DOCUMENT_TYPES.map((t) => {
                    const on = item.acceptedTypes.includes(t)
                    return (
                      <label
                        key={t}
                        className={cn(
                          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[12.5px] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-blue/20',
                          on ? 'border-blue bg-blue-soft font-medium text-blue-ink' : 'border-line text-ink-2 hover:border-ink-3/50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => patch(n, { acceptedTypes: on ? item.acceptedTypes.filter((x) => x !== t) : [...item.acceptedTypes, t] })}
                        />
                        {DOCUMENT_TYPE_LABELS[t]}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <button type="button" aria-label={`Madde ${n + 1} sil`} onClick={() => setItems((list) => list.filter((_, k) => k !== n))} className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-alert-soft hover:text-alert">
                <Trash size={15} />
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={item.originalSeenRequired} onChange={(e) => patch(n, { originalSeenRequired: e.target.checked })} className="size-4 accent-[var(--ac-blue)]" />
                Aslı görülmeli
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={item.copyRequired} onChange={(e) => patch(n, { copyRequired: e.target.checked })} className="size-4 accent-[var(--ac-blue)]" />
                Kopyası saklanmalı
              </label>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setItems((l) => [...l, { acceptedTypes: [], originalSeenRequired: false, copyRequired: false }])} disabled={items.length >= 20} className={btnGhost}>
          <Plus size={14} /> Madde ekle
        </button>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => {
            if (!valid) return setError('Her maddede en az bir belge türü seçin.')
            setError(null)
            save.mutate(items)
          }}
          className={btnSecondary}
        >
          {save.isPending && <SpinnerGap size={14} className="animate-spin" />}
          Taslağı kaydet
        </button>
        <button
          type="button"
          disabled={dirty || !valid || !policy.items.length}
          onClick={() => setActivating(true)}
          className={btnPrimary}
          title={dirty ? 'Önce taslağı kaydedin' : undefined}
        >
          Etkinleştir
        </button>
        <button type="button" onClick={() => discard.mutate(undefined)} disabled={discard.isPending} className={cn(btnGhost, 'text-alert hover:bg-alert-soft hover:text-alert')}>
          Taslağı sil
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-alert">
          {error}
        </p>
      )}
      {dirty && <p className="mt-2 text-[12.5px] text-ink-2">Kaydedilmemiş değişiklikler var; etkinleştirmeden önce taslağı kaydedin.</p>}
      {activating && <ActivateDialog policy={policy} onClose={() => setActivating(false)} />}
    </div>
  )
}

function PolicyColumn({ country, cls, policies, templates }: { country: string; cls: ResidencyClass; policies: RequirementPolicy[]; templates: DocumentSettingsOverview['templates'] }) {
  const mine = policies.filter((p) => p.country === country && p.residencyClass === cls)
  const active = mine.find((p) => p.status === 'active')
  const draft = mine.find((p) => p.status === 'draft')
  const retired = mine.filter((p) => p.status === 'retired')
  const [showRetired, setShowRetired] = useState(false)
  const template = templates.find((t) => t.residencyClass === cls)
  const create = useSettingsMutation((body: { templateCode?: string; copyFromPolicyId?: string }) => settingsApi.createDraft({ country, residencyClass: cls, ...body }), 'Taslak oluşturuldu.')
  const retire = useSettingsMutation(() => settingsApi.retire(active!.id), 'Gereksinim devre dışı bırakıldı.')
  return (
    <div className="min-w-0 rounded-lg border border-line-soft p-4">
      <h4 className="mb-2.5 text-[14px] font-semibold">{RESIDENCY_LABELS[cls]}</h4>
      {active ? (
        <div className="mb-3">
          <p className="text-[12.5px] text-ok">
            Etkin · sürüm {active.version}
            {active.activatedAt && <span className="text-ink-2"> · {formatDate(active.activatedAt)}{active.activatedByName && ` · ${active.activatedByName}`}</span>}
          </p>
          <ul className="mt-1.5 space-y-1 text-[13.5px]">
            {active.items.map((i, n) => (
              <li key={n}>
                <span className="text-ink">{itemText(i)}</span>
                {evidenceText(i) && <span className="block text-[12.5px] text-ink-3">{evidenceText(i)}</span>}
              </li>
            ))}
          </ul>
          {!draft && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => create.mutate({ copyFromPolicyId: active.id })} disabled={create.isPending} className={btnSecondary}>
                Değiştir (yeni taslak)
              </button>
              <button type="button" onClick={() => retire.mutate(undefined)} disabled={retire.isPending} className={btnGhost}>
                Devre dışı bırak
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mb-3 text-[13.5px] text-ink-2">Etkin gereksinim yok. Bu sınıf için belge zorunluluğu gösterilmez.</p>
      )}
      {draft ? (
        <DraftEditor key={`${draft.id}-${JSON.stringify(draft.items)}`} policy={draft} />
      ) : (
        !active && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => create.mutate({})} disabled={create.isPending} className={btnSecondary}>
              <Plus size={14} /> Boş taslak
            </button>
            {template && (
              <button type="button" onClick={() => create.mutate({ templateCode: template.code })} disabled={create.isPending} className={btnGhost} title={template.title}>
                Örnek şablondan taslak
              </button>
            )}
          </div>
        )
      )}
      {retired.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-2">
          <button type="button" aria-expanded={showRetired} onClick={() => setShowRetired((s) => !s)} className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">
            <CaretDown size={11} className={cn('transition-transform', !showRetired && '-rotate-90')} />
            Eski sürümler ({retired.length})
          </button>
          {showRetired && (
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
              {retired.map((p) => (
                <li key={p.id}>
                  Sürüm {p.version} · {p.activatedAt ? 'etkindi' : 'taslaktı'} · {p.retiredAt && formatDate(p.retiredAt)} · {p.items.map(itemText).join('; ') || 'madde yok'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CustomerDocumentSettings() {
  const session = useSession()
  const q = useQuery({ queryKey: [...KEY, session.company?.id], queryFn: settingsApi.customerDocuments })
  const [extra, setExtra] = useState<string[]>([])
  const [days, setDays] = useState<string | null>(null)
  const saveDays = useSettingsMutation((n: number) => settingsApi.setWarningDays(n), 'Süre uyarısı kaydedildi.')
  const options = useMemo(() => countryOptions(session.company?.country), [session.company?.country])
  if (q.isPending) return <div className="h-64 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  const d = q.data
  const countries = [...new Set([...d.branchCountries.map((c) => c.country), ...d.policies.map((p) => p.country), ...extra])].sort((a, b) => countryName(a)!.localeCompare(countryName(b)!, 'tr'))
  const dayValue = days ?? String(d.warningDays)
  const dayNumber = Number(dayValue)
  const dayValid = Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 365

  return (
    <section aria-labelledby="doc-req-title" className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line-soft px-5 py-4">
        <h2 id="doc-req-title" className="text-[16px] font-semibold tracking-[-0.01em]">
          Müşteri belge gereksinimleri
        </h2>
        <p className="mt-0.5 text-[13.5px] text-ink-2">Kiralamanın başladığı şubenin ülkesine göre, Yerli ve Yabancı (ikamet) müşterilerden hangi belgelerin beklendiği.</p>
      </div>
      <p className="flex items-start gap-2 border-b border-line-soft bg-hold-soft px-5 py-3 text-[13px] text-ink">
        <ShieldWarning size={17} className="mt-px shrink-0 text-hold" />
        <span>
          Bu kurallar hukuken doğrulanmış değildir. Hangi belgenin zorunlu olduğunu ve kimlik kopyası saklamanın serbest olup olmadığını ülke mevzuatına ve hukuk danışmanınıza göre belirleyin. Hiçbir ülke için kural kendiliğinden
          etkin değildir; örnek şablonlar yalnız taslak başlatır.
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-3 border-b border-line-soft px-5 py-4">
        <div>
          <label htmlFor="warning-days" className="mb-1.5 block text-[13.5px] font-medium">
            Süre uyarısı
          </label>
          <div className="flex items-center gap-2">
            <Input id="warning-days" type="number" min={1} max={365} inputMode="numeric" value={dayValue} onChange={(e) => setDays(e.target.value)} className="w-24" aria-invalid={!dayValid || undefined} />
            <span className="text-[13.5px] text-ink-2">gün kala “süresi yaklaşıyor” olarak göster</span>
          </div>
        </div>
        <button type="button" disabled={!dayValid || dayNumber === d.warningDays || saveDays.isPending} onClick={() => saveDays.mutate(dayNumber, { onSuccess: () => setDays(null) })} className={btnSecondary}>
          Kaydet
        </button>
        {!dayValid && <p className="basis-full text-[13px] text-alert">1 ile 365 arasında bir gün sayısı girin.</p>}
      </div>

      {d.branchesWithoutCountry > 0 && (
        <p className="flex items-start gap-2 border-b border-line-soft px-5 py-3 text-[13px] text-ink-2">
          <MapPin size={15} className="mt-px shrink-0 text-ink-3" />
          <span>
            {d.branchesWithoutCountry} şubenin ülkesi tanımlanmamış; bu şubeler için gereksinim değerlendirilemez.{' '}
            <Link to="/subeler" className="font-medium text-blue hover:underline">
              Şube ülkelerini girin
            </Link>
          </span>
        </p>
      )}

      <div className="divide-y divide-line-soft">
        {countries.length === 0 ? (
          <p className="px-5 py-5 text-[13.5px] text-ink-2">Ülkesi tanımlanmış şube yok. Aşağıdan bir ülke ekleyerek gereksinim taslağı oluşturabilirsiniz.</p>
        ) : (
          countries.map((country) => (
            <div key={country} className="px-5 py-4">
              <h3 className="mb-3 text-[14.5px] font-semibold">
                {countryName(country)}
                <span className="ml-2 text-[12.5px] font-normal text-ink-3">{d.branchCountries.find((c) => c.country === country)?.branchCount ?? 0} şube</span>
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <PolicyColumn country={country} cls="local" policies={d.policies} templates={d.templates} />
                <PolicyColumn country={country} cls="foreign" policies={d.policies} templates={d.templates} />
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
        <Select compact aria-label="Gereksinim tanımlanacak ülke ekle" value="" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])} className="w-[260px] max-w-full">
          <option value="">Başka bir ülke ekle…</option>
          {options.all
            .filter((c) => !countries.includes(c.code))
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
        </Select>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Info size={13} /> Ülke yalnız gereksinim taslağı oluşturunca kaydedilir.
        </span>
      </div>
    </section>
  )
}

/**
 * K1: the company's rental operating mode. Off by default; only settings.rentals.manage (the owner) changes it. Turning
 * it on does not create a contract, a price or a payment: it lets handovers proceed on recorded staff statements.
 */
function RentalModeSettings() {
  const session = useSession()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings-rentals', session.company?.id], queryFn: () => rentalsApi.settings() })
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (on: boolean) => rentalsApi.saveSettings({ version: q.data!.version, externalTermsMode: on }),
    onSuccess: (s) => {
      qc.setQueryData(['settings-rentals', session.company?.id], s)
      void qc.invalidateQueries({ queryKey: ['rental'] })
      setConfirming(false)
      setError(null)
      toast(s.externalTermsMode ? 'Dış sözleşme ve fiyat modu açıldı.' : 'Dış sözleşme ve fiyat modu kapatıldı.')
    },
    onError: (e) => {
      setError(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.')
      void q.refetch()
    },
  })
  return (
    <section aria-labelledby="rental-mode-title" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="rental-mode-title" className="text-[16px] font-semibold tracking-[-0.01em]">
        Kiralama çalışma modu
      </h2>
      <p className="mt-1 max-w-[760px] text-[13px] text-ink-2">
        ACARVO’daki fiyat teklifi ve sözleşme taslağı hukuki onay, imza ve ödeme süreci içermediği için teslimi tek başına açmaz. Bu mod kapalıyken hiçbir kiralama teslim edilemez. Açıldığında teslim personeli her teslimde sözleşmenin ve fiyatın ACARVO dışında yönetildiğini ayrı ayrı beyan eder ve dış sözleşme/işlem referansını girer.
      </p>
      {q.isError ? (
        <div className="mt-3">
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        </div>
      ) : !q.data ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
          <div>
            <p className="font-medium text-ink">Dış sözleşme ve fiyat modu</p>
            <p className={cn('text-[13px] font-medium', q.data.externalTermsMode ? 'text-hold' : 'text-ink-2')}>
              {q.data.externalTermsMode ? 'Açık: teslim, personel beyanı ve dış referansla yapılır' : 'Kapalı (varsayılan): teslim yapılamaz'}
            </p>
            {q.data.updatedAt && (
              <p className="text-[12px] text-ink-3">
                Son değişiklik: {formatDate(q.data.updatedAt.slice(0, 10))} · {q.data.updatedByName ?? 'kullanıcı bilgisi yok'}
              </p>
            )}
          </div>
          {can(session, 'settings.rentals.manage') ? (
            q.data.externalTermsMode ? (
              <button type="button" disabled={save.isPending} onClick={() => save.mutate(false)} className={btnSecondary}>
                {save.isPending && <SpinnerGap size={14} className="animate-spin" />}
                Modu kapat
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={btnPrimary}>
                Modu aç…
              </button>
            )
          ) : (
            <span className="text-[12.5px] text-ink-3">Yalnız şirket sahibi değiştirebilir</span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-alert">
          {error}
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Beyanlar imzalı sözleşmenin, ödemenin, kesin fiyatın veya hukuki uygunluğun kanıtı değildir; ACARVO bu sonuçları üretmez. Değişiklik işlem geçmişine yazılır.
      </p>
      {confirming && (
        <Dialog.Root open onOpenChange={(o) => !o && setConfirming(false)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
            <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
              <Dialog.Title className="text-[17px] font-semibold">Dış sözleşme ve fiyat modunu aç</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
                Bu şirketin tüm şubelerinde teslim, ACARVO dışında hazırlanan sözleşme ve belirlenen fiyatla yapılabilecek. Her teslimde personel iki beyan verir ve dış referansı girer; beyanlar kullanıcı ve zamanla kaydedilir. ACARVO sözleşmenin imzalandığını, ödemenin alındığını veya fiyatın kesinleştiğini göstermez.
              </Dialog.Description>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Dialog.Close className={btnGhost}>Vazgeç</Dialog.Close>
                <button type="button" disabled={save.isPending} onClick={() => save.mutate(true)} className={btnPrimary}>
                  {save.isPending && <SpinnerGap size={14} className="animate-spin" />}
                  Modu aç
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  )
}

/** Yönetim → Ayarlar: customer document requirements (M2), the rental operating mode (K1) and contract templates. */
export function SettingsPage() {
  const session = useSession()
  const canDocs = can(session, 'settings.documents.manage')
  const canRentalMode = can(session, 'settings.rentals.manage') || can(session, 'rentals.read')
  const canTemplates = can(session, 'settings.contracts.manage')
  return (
    <div className="space-y-6">
      <PageHeader title="Ayarlar" description={session.company ? `${session.company.name} şirket ayarları` : undefined} />
      {can(session, 'readiness.read') && (
        <Link to="/ayarlar/hazirlik" className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-5 py-4 hover:bg-ground/50">
          <ListChecks size={18} className="text-blue" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">Operasyonel hazırlık</span>
            <span className="block text-[13px] text-ink-2">Gerçek kullanım öncesi eksikler, doğrulanmamış maddeler ve insan kararları (salt okunur).</span>
          </span>
          <ArrowRight size={15} className="text-blue transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
      {canRentalMode && <RentalModeSettings />}
      {canTemplates && <ContractTemplateSettings />}
      {canDocs ? (
        <CustomerDocumentSettings />
      ) : canRentalMode || canTemplates ? null : (
        <StatePanel icon={GearSix} title="Görebileceğiniz ayar yok">
          <p>Müşteri belge gereksinimlerini yalnız yetkili kullanıcılar (varsayılan olarak şirket sahibi) yönetebilir.</p>
        </StatePanel>
      )}
      <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
        <WarningCircle size={14} className="mt-[2px] shrink-0" />
        Fiyat listeleri Fiyatlandırma ekranındadır. Diğer ayar bölümleri (bildirim, finans…) ilgili modüllerle eklenecek.
      </p>
    </div>
  )
}
