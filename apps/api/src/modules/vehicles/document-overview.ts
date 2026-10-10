import { type DocumentTypeRule, type VehicleDocumentsBrief, documentTypeSummary, todayIn, vehicleDocumentsOverview } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'

// Document rules and per-vehicle overviews shared by the Belgeler tab and the vehicle list (docs §8.4.3).
// No rule is re-implemented here: summaries come from the same shared functions as the tab.

type Row = Record<string, unknown>

/** System types with this company's decisions; RLS keeps the settings to the active company. */
export async function loadRules(tx: Tx): Promise<DocumentTypeRule[]> {
  const rows = await tx.execute(sql`
    select t.code, t.name, t.requires_expiry, coalesce(s.required, false) as required, coalesce(s.warn_days, 30) as warn_days
    from document_types t left join company_document_type_settings s on s.type_code = t.code
    order by t.sort_order`)
  return (rows.rows as Row[]).map((r) => ({
    code: r.code as DocumentTypeRule['code'],
    name: r.name as string,
    requiresExpiry: r.requires_expiry as boolean,
    required: r.required as boolean,
    warnDays: Number(r.warn_days),
  }))
}

/** Today's date in the company's time zone. */
export async function companyToday(tx: Tx, access: { companyId: string }) {
  const r = await tx.execute(sql`select timezone from companies where id = ${access.companyId}`)
  return todayIn((r.rows[0] as { timezone: string }).timezone)
}

/**
 * Document overview of each given vehicle (critical / warning counts and the most urgent type), exactly as the
 * vehicle's Belgeler tab computes it. Vehicles without documents still count missing required types.
 */
export async function documentOverviews(tx: Tx, access: { companyId: string }, vehicleIds: string[]): Promise<Map<string, VehicleDocumentsBrief>> {
  const out = new Map<string, VehicleDocumentsBrief>()
  if (!vehicleIds.length) return out
  const [rules, today] = [await loadRules(tx), await companyToday(tx, access)]
  const rows = (
    await tx.execute(sql`
      select d.id, d.vehicle_id, d.type_code, d.record_state, d.valid_from, d.valid_until,
        (select count(*) from vehicle_document_files x where x.company_id = d.company_id and x.document_id = d.id) as file_count
      from vehicle_documents d
      where d.vehicle_id in (select unnest(${`{${vehicleIds.join(',')}}`}::uuid[]))`)
  ).rows as Row[]
  const byVehicle = new Map<string, Row[]>()
  for (const r of rows) byVehicle.set(r.vehicle_id as string, [...(byVehicle.get(r.vehicle_id as string) ?? []), r])
  for (const id of vehicleIds) {
    const docs = byVehicle.get(id) ?? []
    const summaries = rules.map((rule) =>
      documentTypeSummary(
        rule,
        docs
          .filter((d) => d.type_code === rule.code)
          .map((d) => ({
            id: d.id as string,
            recordState: d.record_state as 'draft' | 'active' | 'voided',
            validFrom: d.valid_from == null ? null : String(d.valid_from).slice(0, 10),
            validUntil: d.valid_until == null ? null : String(d.valid_until).slice(0, 10),
            fileCount: Number(d.file_count),
          })),
        today,
      ),
    )
    const o = vehicleDocumentsOverview(summaries)
    out.set(id, {
      critical: o.critical,
      warning: o.warning,
      headline: o.headline
        ? { code: o.headline.code, name: rules.find((r) => r.code === o.headline!.code)!.name, state: o.headline.state, level: o.headline.level, daysLeft: o.headline.daysLeft }
        : null,
    })
  }
  return out
}
