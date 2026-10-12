import {
  type CorporateDetail,
  type CorporatePerson,
  type CustomerListItem,
  PERSON_END_REASONS,
  PERSON_ROLES,
  type PersonEndReason,
  type PersonRole,
  personLinkSchema,
} from '@acarvo/shared'
import { CheckCircle, ClockCounterClockwise, IdentificationBadge, Info, MagnifyingGlass, PencilSimple, Plus, ShieldCheck, SpinnerGap, SteeringWheel, UserPlus, WarningCircle, XCircle } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { describe, Field, Input, Textarea } from '@/components/fields'
import { Sheet } from '@/components/Sheet'
import { ErrorState } from '@/components/states'
import { toast } from '@/components/Toaster'
import { ApiRequestError, corporateApi, customersApi } from '@/lib/api'
import { LICENCE_LABELS, PERSON_END_REASON_LABELS, PERSON_ROLE_LABELS } from '@/lib/corporate-labels'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { CustomerFormSheet } from '../customers/CustomerForm'
import { btnPrimary, conflictMessage, Panel, ReasonDialog, useAccountUpdated } from './ui'

function RoleChips({ roles }: { roles: PersonRole[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className={cn('rounded-md border px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap', r === 'authorized_driver' ? 'border-blue/30 bg-blue-soft/50 text-blue-ink' : 'border-line text-ink-2')}>
          {PERSON_ROLE_LABELS[r]}
        </span>
      ))}
    </span>
  )
}

function Licence({ p }: { p: CorporatePerson }) {
  if (!p.licence) return null
  const { state, validUntil } = p.licence
  const Ico = state === 'valid' ? CheckCircle : state === 'missing' ? Info : state === 'expired' ? XCircle : WarningCircle
  const tone = state === 'valid' ? 'text-ok' : state === 'expired' ? 'text-alert' : state === 'expiring' ? 'text-hold' : 'text-ink-2'
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12.5px] font-medium', tone)}>
      <Ico size={14} weight={state === 'valid' ? 'fill' : 'regular'} />
      {LICENCE_LABELS[state]}
      {validUntil && <span className="tnum font-normal text-ink-2"> · {formatDate(validUntil)}</span>}
    </span>
  )
}

const period = (p: { validFrom: string | null; validUntil: string | null }) =>
  p.validFrom || p.validUntil ? `${p.validFrom ? formatDate(p.validFrom) : '…'} – ${p.validUntil ? formatDate(p.validUntil) : 'süresiz'}` : null

function RolesField({ value, onChange, error }: { value: PersonRole[]; onChange: (r: PersonRole[]) => void; error?: string }) {
  return (
    <fieldset aria-describedby={error ? 'roles-error' : undefined}>
      <legend className="mb-1.5 text-[13.5px] font-medium text-ink">
        Roller <span className="text-alert" aria-hidden>*</span>
        <span className="sr-only">(zorunlu, birden fazla seçilebilir)</span>
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PERSON_ROLES.map((r) => (
          <label key={r} className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13.5px]', value.includes(r) ? 'border-blue/40 bg-blue-soft/30' : 'border-line hover:bg-ground')}>
            <input type="checkbox" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} className="size-4 accent-[var(--ac-blue)]" />
            {PERSON_ROLE_LABELS[r]}
          </label>
        ))}
      </div>
      {error && (
        <p id="roles-error" className="mt-1.5 text-[13px] text-alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

interface LinkValues {
  roles: PersonRole[]
  jobTitle: string
  validFrom: string
  validUntil: string
  note: string
}

function LinkFields({ v, set, errors }: { v: LinkValues; set: (patch: Partial<LinkValues>) => void; errors: Record<string, string> }) {
  return (
    <>
      <RolesField value={v.roles} onChange={(roles) => set({ roles })} error={errors.roles} />
      <Field id="link-title" label="Görevi" error={errors.jobTitle} hint="İsteğe bağlı, örneğin “Filo sorumlusu”">
        <Input {...describe('link-title', errors.jobTitle, true)} autoComplete="off" value={v.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="link-from" label="Başlangıç" error={errors.validFrom}>
          <Input type="date" {...describe('link-from', errors.validFrom)} value={v.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        </Field>
        <Field id="link-until" label="Bitiş" error={errors.validUntil} hint="Boş bırakılırsa süresiz.">
          <Input type="date" {...describe('link-until', errors.validUntil, true)} value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
        </Field>
      </div>
      <Field id="link-note" label="Not" error={errors.note}>
        <Textarea rows={2} {...describe('link-note', errors.note)} value={v.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
    </>
  )
}

const validate = (v: LinkValues, customerId?: string) => {
  const r = personLinkSchema.safeParse({ ...v, customerId: customerId ?? '00000000-0000-4000-8000-000000000000' })
  if (r.success) return {}
  const out: Record<string, string> = {}
  for (const i of r.error.issues) out[String(i.path[0])] ??= i.message
  return out
}

/** Kişi bağla: find an existing customer of the company (one person, one record) or open a new customer record. */
function LinkSheet({ a, preset, linkedIds, onClose }: { a: CorporateDetail; preset: PersonRole[]; linkedIds: Set<string>; onClose: () => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const updated = useAccountUpdated(a.id)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Pick<CustomerListItem, 'id' | 'customerNo' | 'displayName' | 'phone' | 'email'> | null>(null)
  const [v, setV] = useState<LinkValues>({ roles: preset, jobTitle: '', validFrom: '', validUntil: '', note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const results = useQuery({
    queryKey: ['customers', session.company?.id, 'link-search', q],
    queryFn: () => customersApi.search({ q, status: 'active', pageSize: 25 }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })
  const save = useMutation({
    mutationFn: () => corporateApi.link(a.id, { customerId: picked!.id, ...v }),
    onSuccess: () => {
      setSaved(true)
      updated()
      void qc.invalidateQueries({ queryKey: ['corporate-people', session.company?.id, a.id] })
      toast(`${picked!.displayName} hesaba bağlandı.`)
      onClose()
    },
    onError: (e) => {
      if (!(e instanceof ApiRequestError)) return setServerError('Bağlanamadı. Bağlantınızı kontrol edin.')
      setErrors(e.fields ?? {})
      setServerError(e.message)
    },
  })
  return (
    <>
      <Sheet
        title="Kişi bağla"
        subtitle={`${a.legalName} · ${a.accountNo}`}
        onClose={onClose}
        dirty={!!picked && !saved}
        footer={
          <>
            <button
              type="button"
              disabled={!picked || save.isPending}
              onClick={() => {
                setServerError(null)
                const e = validate(v, picked?.id)
                setErrors(e)
                if (!Object.keys(e).length) save.mutate()
              }}
              className={btnPrimary}
            >
              {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
              Bağla
            </button>
            <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
              Vazgeç
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {serverError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
              <WarningCircle size={17} className="mt-px shrink-0" />
              {serverError}
            </p>
          )}
          {picked ? (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-blue/35 bg-blue-soft/25 px-3.5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{picked.displayName}</p>
                <p className="tnum text-[13px] text-ink-2">{[picked.customerNo, picked.phone, picked.email].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-[13px] font-medium text-blue hover:underline">
                Değiştir
              </button>
            </div>
          ) : (
            <div>
              <Field id="person-search" label="Müşterilerde ara" hint="Ad, müşteri no, telefon veya e-posta. Kişinin bilgileri kopyalanmaz; mevcut müşteri kaydı bağlanır.">
                <div className="relative">
                  <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                  <Input id="person-search" type="search" aria-describedby="person-search-hint" autoComplete="off" autoFocus value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
                </div>
              </Field>
              {q.length >= 2 && (
                <div className="mt-3 rounded-lg border border-line" aria-live="polite">
                  {results.isError ? (
                    <p className="p-3 text-[13px] text-alert">{results.error.message}</p>
                  ) : !results.data ? (
                    <p className="p-3 text-[13px] text-ink-2">Aranıyor…</p>
                  ) : results.data.items.length === 0 ? (
                    <p className="p-3 text-[13px] text-ink-2">Bu aramaya uyan etkin müşteri yok.</p>
                  ) : (
                    <ul role="list" aria-label="Arama sonuçları" className="max-h-[320px] divide-y divide-line-soft overflow-y-auto">
                      {results.data.items.map((c) => {
                        const linked = linkedIds.has(c.id)
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              disabled={linked}
                              onClick={() => setPicked(c)}
                              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-ground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-ink">{c.displayName}</span>
                                <span className="tnum block truncate text-[12.5px] text-ink-2">{[c.customerNo, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                              </span>
                              <span className="shrink-0 text-[12.5px] font-medium text-blue">{linked ? 'Zaten bağlı' : 'Seç'}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
              {can(session, 'customers.manage') && (
                <button type="button" onClick={() => setCreatingCustomer(true)} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
                  <UserPlus size={15} />
                  Kişi kayıtlı değil: yeni müşteri kaydı aç
                </button>
              )}
            </div>
          )}
          {picked && <LinkFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} errors={errors} />}
          <p className="flex items-start gap-2 border-t border-line-soft pt-4 text-[12.5px] text-ink-3">
            <ShieldCheck size={14} className="mt-[2px] shrink-0" />
            Kurumsal hesaba bağlanmak kişinin belgelerine erişim yetkisi vermez; belge yetkileri ayrıdır.
          </p>
        </div>
      </Sheet>
      {creatingCustomer && <CustomerFormSheet mode="create" onClose={() => setCreatingCustomer(false)} onSaved={(c) => setPicked(c)} />}
    </>
  )
}

function EditLinkSheet({ a, p, onClose }: { a: CorporateDetail; p: CorporatePerson; onClose: () => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const updated = useAccountUpdated(a.id)
  const initial: LinkValues = { roles: p.roles, jobTitle: p.jobTitle ?? '', validFrom: p.validFrom ?? '', validUntil: p.validUntil ?? '', note: p.note ?? '' }
  const [v, setV] = useState<LinkValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () => corporateApi.updateLink(a.id, p.id, { ...v, version: p.version }),
    onSuccess: () => {
      setSaved(true)
      updated()
      void qc.invalidateQueries({ queryKey: ['corporate-people', session.company?.id, a.id] })
      toast(`${p.customer.displayName} güncellendi.`)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') {
        void qc.invalidateQueries({ queryKey: ['corporate-people', session.company?.id, a.id] })
        return setServerError(conflictMessage)
      }
      setErrors(e instanceof ApiRequestError ? (e.fields ?? {}) : {})
      setServerError(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.')
    },
  })
  return (
    <Sheet
      title="Kişinin rollerini düzenle"
      subtitle={`${p.customer.displayName} · ${a.legalName}`}
      onClose={onClose}
      dirty={JSON.stringify(v) !== JSON.stringify(initial) && !saved}
      footer={
        <>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              const e = validate(v)
              setErrors(e)
              if (!Object.keys(e).length) save.mutate()
            }}
            className={btnPrimary}
          >
            {save.isPending && <SpinnerGap size={16} className="animate-spin" />}
            Kaydet
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">
            Vazgeç
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
            <WarningCircle size={17} className="mt-px shrink-0" />
            {serverError}
          </p>
        )}
        <LinkFields v={v} set={(x) => setV((y) => ({ ...y, ...x }))} errors={errors} />
      </div>
    </Sheet>
  )
}

function EndDialog({ a, p, onClose }: { a: CorporateDetail; p: CorporatePerson; onClose: () => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const updated = useAccountUpdated(a.id)
  const [error, setError] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: (reason: PersonEndReason) => corporateApi.endLink(a.id, p.id, p.version, reason),
    onSuccess: () => {
      updated()
      void qc.invalidateQueries({ queryKey: ['corporate-people', session.company?.id, a.id] })
      toast(`${p.customer.displayName} ile ilişki sona erdirildi.`)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICT') void qc.invalidateQueries({ queryKey: ['corporate-people', session.company?.id, a.id] })
      setError(e instanceof ApiRequestError ? e.message : 'İşlem yapılamadı.')
    },
  })
  return (
    <ReasonDialog<PersonEndReason>
      title="İlişkiyi sona erdir"
      description={`${p.customer.displayName} artık ${a.legalName} adına işlem yapmaz. Kişinin müşteri kaydı silinmez veya değişmez; ilişki “Önceki ilişkiler” altında kalır.`}
      reasons={PERSON_END_REASONS}
      labels={PERSON_END_REASON_LABELS}
      confirm="Sona erdir"
      pending={m.isPending}
      error={error}
      onConfirm={(r) => m.mutate(r)}
      onClose={onClose}
    />
  )
}

function PersonRow({ p, showLicence, actions }: { p: CorporatePerson; showLicence: boolean; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5 sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link to="/musteriler/$customerId" params={{ customerId: p.customer.id }} className="font-medium text-ink hover:text-blue-ink hover:underline">
            {p.customer.displayName}
          </Link>
          <span className="tnum text-[12.5px] text-ink-2">{p.customer.customerNo}</span>
          {p.customer.status === 'archived' && <span className="text-[12.5px] text-ink-2">· müşteri arşivde</span>}
        </div>
        <p className="tnum mt-0.5 truncate text-[12.5px] text-ink-2">{[p.jobTitle, p.customer.phone, p.customer.email].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}</p>
        <div className="mt-1.5">
          <RoleChips roles={p.roles} />
        </div>
        {showLicence && p.roles.includes('authorized_driver') && p.active && (
          <div className="mt-1.5">
            <Licence p={p} />
          </div>
        )}
      </div>
      <div className="min-w-0 basis-full text-[12.5px] text-ink-2 sm:basis-[210px] sm:text-right">
        {period(p) && <p className="tnum">{period(p)}</p>}
        {!p.active && (
          <p>
            {p.endedAt && formatDate(p.endedAt)} · {p.endedReason ? PERSON_END_REASON_LABELS[p.endedReason] : 'sona erdi'}
            {p.endedByName && ` · ${p.endedByName}`}
          </p>
        )}
      </div>
      {actions}
    </li>
  )
}

/** Kişiler / Sürücüler: people linked to the account (customer records), active first; ended links stay as history. */
export function PeopleTab({ a, mode, canManage }: { a: CorporateDetail; mode: 'all' | 'drivers'; canManage: boolean }) {
  const session = useSession()
  const allowed = can(session, 'customers.read')
  const q = useQuery({ queryKey: ['corporate-people', session.company?.id, a.id], queryFn: () => corporateApi.people(a.id), enabled: allowed })
  const [linking, setLinking] = useState(false)
  const [editing, setEditing] = useState<CorporatePerson | null>(null)
  const [ending, setEnding] = useState<CorporatePerson | null>(null)
  const [showEnded, setShowEnded] = useState(false)
  const items = useMemo(() => (q.data?.items ?? []).filter((p) => mode === 'all' || p.roles.includes('authorized_driver')), [q.data, mode])
  const active = items.filter((p) => p.active)
  const ended = items.filter((p) => !p.active)
  const linkedIds = useMemo(() => new Set((q.data?.items ?? []).filter((p) => p.active).map((p) => p.customer.id)), [q.data])
  const canLink = canManage && a.status === 'active' && allowed
  const title = mode === 'all' ? 'Kişiler' : 'Yetkili sürücüler'

  if (!allowed) {
    return (
      <Panel title={title}>
        <p className="text-ink-2">Bağlı kişileri görmek için müşterileri görüntüleme yetkisi gerekir.</p>
      </Panel>
    )
  }
  return (
    <Panel
      title={title}
      action={
        canLink ? (
          <button type="button" onClick={() => setLinking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
            <Plus size={14} weight="bold" />
            {mode === 'all' ? 'Kişi bağla' : 'Sürücü bağla'}
          </button>
        ) : undefined
      }
    >
      {q.isPending ? (
        <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : active.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg bg-ground/60 px-4 py-4">
          {mode === 'all' ? <IdentificationBadge size={20} className="mt-0.5 shrink-0 text-ink-3" /> : <SteeringWheel size={20} className="mt-0.5 shrink-0 text-ink-3" />}
          <p className="text-ink-2">
            {mode === 'all' ? 'Bu hesaba bağlı etkin kişi yok.' : 'Bu hesabın yetkili sürücüsü yok.'} {canLink && 'Mevcut müşteri kayıtlarından bağlayabilirsiniz.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {active.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              showLicence={!!q.data?.licenceShown}
              actions={
                canManage ? (
                  <div className="flex shrink-0 gap-1">
                    {a.status === 'active' && (
                      <button type="button" onClick={() => setEditing(p)} aria-label={`${p.customer.displayName} rollerini düzenle`} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
                        <PencilSimple size={16} />
                      </button>
                    )}
                    <button type="button" onClick={() => setEnding(p)} className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-alert-soft hover:text-alert">
                      Sona erdir
                    </button>
                  </div>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
      {mode === 'drivers' && q.data && !q.data.licenceShown && (
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-2">
          <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
          Ehliyet durumunu görmek için müşteri belgelerini görüntüleme yetkisi gerekir.
        </p>
      )}
      {mode === 'drivers' && q.data?.licenceShown && (
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-2">
          <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
          Ehliyet bilgisi yalnız kayıtlı belgeye göre gösterilir; kiralama uygunluğu (yaş, ehliyet yılı) Kiralamalar modülünde değerlendirilecek.
        </p>
      )}
      {ended.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <button type="button" aria-expanded={showEnded} onClick={() => setShowEnded((x) => !x)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-[13.5px] font-medium text-ink-2 hover:text-ink">
            <ClockCounterClockwise size={16} />
            Önceki ilişkiler ({ended.length})
          </button>
          {showEnded && (
            <ul className="divide-y divide-line-soft opacity-80">
              {ended.map((p) => (
                <PersonRow key={p.id} p={p} showLicence={false} />
              ))}
            </ul>
          )}
        </div>
      )}
      {linking && <LinkSheet a={a} preset={mode === 'drivers' ? ['authorized_driver'] : []} linkedIds={linkedIds} onClose={() => setLinking(false)} />}
      {editing && <EditLinkSheet a={a} p={editing} onClose={() => setEditing(null)} />}
      {ending && <EndDialog a={a} p={ending} onClose={() => setEnding(null)} />}
    </Panel>
  )
}
