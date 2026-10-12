export interface SecurityState {
  rls: Record<string, { enabled: boolean; forced: boolean }>
  sensitive: { columns: { name: string; type: string }[]; privileges: string[]; policies: { name: string; cmd: string }[] }
  migrations: number
}
export const KNOWN_GLOBAL_TABLES: readonly string[]
export const SENSITIVE_ACTIONS_TABLE: string
export const SENSITIVE_ACTIONS_SPEC: {
  readonly columns: Readonly<Record<string, string>>
  readonly appPrivileges: readonly string[]
  readonly policies: Readonly<Record<string, string>>
}
export const APP_ROLE: string
export function snapshotSecurity(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }): Promise<SecurityState>
export function checkSensitiveActions(state: SecurityState): string[]
export function checkCurrentState(state: SecurityState): string[]
export function checkMigration(before: SecurityState, after: SecurityState): string[]
export function checkMigrationCount(applied: number, journalLength: number): string[]
export function checkRowCounts(before: Record<string, number>, after: Record<string, number>): string[]
