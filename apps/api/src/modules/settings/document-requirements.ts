import {
  DOCUMENT_POLICY_TEMPLATES,
  documentSettingsSchema,
  policyActivateSchema,
  policyDraftSchema,
  policyItemsSchema,
  type RequirementItem,
  type RequirementPolicy,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { documentWarningDays } from '../customers/documents'

type Row = Record<string, unknown>
const POLICY_NOT_FOUND = 'Gereksinim politikası bulunamadı.'
const pidParams = z.object({ pid: z.uuid() })

/** All policies of the company with their items, newest version first per country and class. */
export async function loadPolicies(tx: Tx, onlyActive = false): Promise<RequirementPolicy[]> {
  const rows = (
    await tx.execute(sql`
      select p.*, cu.name as created_by_name, au.name as activated_by_name
      from document_requirement_policies p
      left join users cu on cu.id = p.created_by
      left join users au on au.id = p.activated_by
      ${onlyActive ? sql`where p.status = 'active'` : sql``}
      order by p.country, p.residency_class, p.version desc`)
  ).rows as Row[]
  const items = rows.length
    ? ((await tx.execute(sql`select policy_id, accepted_types, original_seen_required, copy_required from document_requirement_items where policy_id in (select unnest(${`{${rows.map((r) => r.id).join(',')}}`}::uuid[])) order by position`))
        .rows as Row[])
    : []
  return rows.map((r) => ({
    id: r.id as string,
    country: r.country as string,
    residencyClass: r.residency_class as RequirementPolicy['residencyClass'],
    version: Number(r.version),
    status: r.status as RequirementPolicy['status'],
    templateCode: (r.template_code as string) ?? null,
    items: items
      .filter((i) => i.policy_id === r.id)
      .map((i) => ({ acceptedTypes: i.accepted_types as RequirementItem['acceptedTypes'], originalSeenRequired: !!i.original_seen_required, copyRequired: !!i.copy_required })),
    createdAt: toIso(r.created_at),
    createdByName: (r.created_by_name as string) ?? null,
    activatedAt: r.activated_at ? toIso(r.activated_at) : null,
    activatedByName: (r.activated_by_name as string) ?? null,
    retiredAt: r.retired_at ? toIso(r.retired_at) : null,
  }))
}

/** Countries of the company's active branches (only those the owner has set). */
export async function branchCountries(tx: Tx) {
  const rows = (await tx.execute(sql`select country, count(*)::int as n from branches where status = 'active' group by country order by country nulls last`)).rows as Row[]
  return {
    countries: rows.filter((r) => r.country).map((r) => ({ country: r.country as string, branchCount: Number(r.n) })),
    withoutCountry: Number(rows.find((r) => !r.country)?.n ?? 0),
  }
}

async function replaceItems(tx: Tx, access: CompanyAccess, policyId: string, items: RequirementItem[]) {
  await tx.execute(sql`delete from document_requirement_items where policy_id = ${policyId}`)
  let position = 0
  for (const i of items) {
    position++
    await tx.execute(sql`insert into document_requirement_items (company_id, policy_id, position, accepted_types, original_seen_required, copy_required)
      values (${access.companyId}, ${policyId}, ${position}, ${`{${[...new Set(i.acceptedTypes)].join(',')}}`}::text[], ${i.originalSeenRequired}, ${i.copyRequired})`)
  }
}

async function lockPolicy(tx: Tx, pid: string) {
  const r = (await tx.execute(sql`select * from document_requirement_policies where id = ${pid} for update`)).rows[0] as Row | undefined
  if (!r) throw notFound(POLICY_NOT_FOUND)
  return r
}

const policyAudit = (tx: Tx, access: CompanyAccess, userId: string, action: string, policy: Row, summary: Record<string, unknown> = {}) =>
  audit(tx, {
    companyId: access.companyId,
    actorUserId: userId,
    action,
    entity: 'document_requirement_policy',
    entityId: policy.id as string,
    summary: { country: policy.country, residencyClass: policy.residency_class, version: Number(policy.version), ...summary },
  })

/** Yönetim → Ayarlar → Müşteri Belge Gereksinimleri. Owner permission only. */
export async function documentRequirementRoutes(app: FastifyInstance) {
  const overview = async (tx: Tx) => {
    const branches = await branchCountries(tx)
    return {
      warningDays: await documentWarningDays(tx),
      policies: await loadPolicies(tx),
      branchCountries: branches.countries,
      branchesWithoutCountry: branches.withoutCountry,
      templates: DOCUMENT_POLICY_TEMPLATES,
    }
  }

  app.get('/customer-documents', async (req) => withCompany(req, 'settings.documents.manage', (tx) => overview(tx)))

  app.put('/customer-documents', async (req) =>
    withCompany(req, 'settings.documents.manage', async (tx, access) => {
      const { warningDays } = documentSettingsSchema.parse(req.body)
      const before = await documentWarningDays(tx)
      await tx.execute(sql`insert into customer_document_settings (company_id, warning_days, updated_by, updated_at) values (${access.companyId}, ${warningDays}, ${req.auth!.user.id}, now())
        on conflict (company_id) do update set warning_days = excluded.warning_days, updated_by = excluded.updated_by, updated_at = now()`)
      if (before !== warningDays)
        await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'settings.customer_documents_update', entity: 'company', entityId: access.companyId, summary: { warningDays: [before, warningDays] } })
      return overview(tx)
    }),
  )

  /** A new draft version: empty, from a passive template of the same class, or as a copy of an existing version. */
  app.post('/document-requirements/drafts', async (req, reply) => {
    const result = await withCompany(req, 'settings.documents.manage', async (tx, access) => {
      const input = policyDraftSchema.parse(req.body)
      const existing = (await tx.execute(sql`select id from document_requirement_policies where country = ${input.country} and residency_class = ${input.residencyClass} and status = 'draft'`)).rows[0] as Row | undefined
      if (existing) throw new AppError(409, 'DRAFT_EXISTS', 'Bu ülke ve ikamet sınıfı için zaten bir taslak var.', undefined, { policyId: existing.id })
      let items: RequirementItem[] = []
      let templateCode: string | null = null
      if (input.templateCode) {
        const t = DOCUMENT_POLICY_TEMPLATES.find((x) => x.code === input.templateCode && x.residencyClass === input.residencyClass)
        if (!t) throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { templateCode: 'Bu ikamet sınıfı için şablon yok' })
        items = t.items
        templateCode = t.code
      } else if (input.copyFromPolicyId) {
        const source = (await loadPolicies(tx)).find((p) => p.id === input.copyFromPolicyId)
        if (!source) throw notFound(POLICY_NOT_FOUND)
        items = source.items
      }
      const next = (await tx.execute(sql`select coalesce(max(version), 0) + 1 as v from document_requirement_policies where country = ${input.country} and residency_class = ${input.residencyClass}`)).rows[0] as Row
      const row = (
        await tx.execute(sql`insert into document_requirement_policies (company_id, country, residency_class, version, status, template_code, created_by)
          values (${access.companyId}, ${input.country}, ${input.residencyClass}, ${Number(next.v)}, 'draft', ${templateCode}, ${req.auth!.user.id}) returning *`)
      ).rows[0] as Row
      await replaceItems(tx, access, row.id as string, items)
      await policyAudit(tx, access, req.auth!.user.id, 'settings.requirement_policy.draft', row, { templateCode, copyFromPolicyId: input.copyFromPolicyId ?? null })
      return overview(tx)
    })
    return reply.code(201).send(result)
  })

  app.put('/document-requirements/:pid/items', async (req) => {
    const p = pidParams.safeParse(req.params)
    if (!p.success) throw notFound(POLICY_NOT_FOUND)
    return withCompany(req, 'settings.documents.manage', async (tx, access) => {
      const { items } = policyItemsSchema.parse(req.body)
      const policy = await lockPolicy(tx, p.data.pid)
      if (policy.status !== 'draft') throw new AppError(409, 'POLICY_NOT_DRAFT', 'Etkinleştirilmiş veya eski bir sürüm değiştirilemez; yeni taslak oluşturun.')
      await replaceItems(tx, access, p.data.pid, items)
      await policyAudit(tx, access, req.auth!.user.id, 'settings.requirement_policy.items', policy, { items: items.length })
      return overview(tx)
    })
  })

  /** Activates a draft after explicit confirmation; the previously active version of the same country and class retires. */
  app.post('/document-requirements/:pid/activate', async (req) => {
    const p = pidParams.safeParse(req.params)
    if (!p.success) throw notFound(POLICY_NOT_FOUND)
    return withCompany(req, 'settings.documents.manage', async (tx, access) => {
      policyActivateSchema.parse(req.body)
      const policy = await lockPolicy(tx, p.data.pid)
      if (policy.status !== 'draft') throw new AppError(409, 'POLICY_NOT_DRAFT', 'Yalnız taslak etkinleştirilebilir.')
      const count = (await tx.execute(sql`select count(*)::int n from document_requirement_items where policy_id = ${p.data.pid}`)).rows[0] as Row
      if (!Number(count.n)) throw new AppError(400, 'VALIDATION', 'Etkinleştirmeden önce en az bir madde ekleyin.', { items: 'En az bir madde gerekli' })
      const previous = (await tx.execute(sql`update document_requirement_policies set status = 'retired', retired_at = now()
        where country = ${policy.country} and residency_class = ${policy.residency_class} and status = 'active' returning id, version`)).rows[0] as Row | undefined
      await tx.execute(sql`update document_requirement_policies set status = 'active', activated_at = now(), activated_by = ${req.auth!.user.id} where id = ${p.data.pid}`)
      await policyAudit(tx, access, req.auth!.user.id, 'settings.requirement_policy.activate', policy, { replacedVersion: previous ? Number(previous.version) : null })
      return overview(tx)
    })
  })

  /** Retires an active version (no requirement for that country and class afterwards) or discards a draft. */
  app.post('/document-requirements/:pid/retire', async (req) => {
    const p = pidParams.safeParse(req.params)
    if (!p.success) throw notFound(POLICY_NOT_FOUND)
    return withCompany(req, 'settings.documents.manage', async (tx, access) => {
      const policy = await lockPolicy(tx, p.data.pid)
      if (policy.status === 'retired') throw new AppError(409, 'POLICY_RETIRED', 'Bu sürüm zaten devre dışı.')
      await tx.execute(sql`update document_requirement_policies set status = 'retired', retired_at = now() where id = ${p.data.pid}`)
      await policyAudit(tx, access, req.auth!.user.id, policy.status === 'draft' ? 'settings.requirement_policy.discard' : 'settings.requirement_policy.retire', policy)
      return overview(tx)
    })
  })
}
