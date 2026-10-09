import type { Tx } from '../db/client'
import { auditLog } from '../db/schema'

/** Appends to the company's audit log inside the current tenant transaction. */
export async function audit(
  tx: Tx,
  entry: { companyId: string; actorUserId: string; action: string; entity: string; entityId?: string; summary?: Record<string, unknown> },
) {
  await tx.insert(auditLog).values(entry)
}
