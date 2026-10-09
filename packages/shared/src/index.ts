import { z } from 'zod'

// ---------------------------------------------------------------------------
// Permissions: `module.action`. The server enforces them on every endpoint;
// the web app only uses them to show or hide navigation and actions.

export const PERMISSIONS = [
  'vehicles.read',
  'vehicles.create',
  'vehicles.update',
  'vehicles.documents.manage',
  'vehicles.photos.manage',
  'branches.read',
  'users.read',
  'roles.read',
  'audit.read',
] as const
export type Permission = (typeof PERMISSIONS)[number]

// ---------------------------------------------------------------------------
// Auth

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parolanızı girin').max(256),
})
export type LoginInput = z.infer<typeof loginSchema>

export const switchCompanySchema = z.object({ companyId: z.uuid() })

export interface MembershipSummary {
  companyId: string
  companyName: string
}

export interface SessionInfo {
  user: { id: string; email: string; name: string }
  company: { id: string; name: string; timezone: string; currency: string; roles: string[] } | null
  memberships: MembershipSummary[]
  permissions: Permission[]
  branches: { id: string; name: string; code: string }[]
  allBranches: boolean
  environment: 'development' | 'production' | 'test'
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> }
}
