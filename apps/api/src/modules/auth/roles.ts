import type { Permission } from '@acarvo/shared'

/** Default roles created for each company. Companies can edit or add roles later (Roller ve Yetkiler module). */
export const ROLE_PRESETS: Record<string, readonly Permission[]> = {
  Sahip: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read', 'roles.read', 'audit.read'],
  Yönetici: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read'],
  Operasyon: ['vehicles.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read'],
}
