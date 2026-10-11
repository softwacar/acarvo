import type { Permission } from '@acarvo/shared'

/** Default roles created for each new company. Companies can edit or add roles later (Roller ve Yetkiler module). */
export const ROLE_PRESETS: Record<string, readonly Permission[]> = {
  Sahip: [
    'vehicles.read',
    'vehicles.create',
    'vehicles.update',
    'vehicles.documents.read',
    'vehicles.documents.manage',
    'vehicles.photos.manage',
    'vehicles.odometer.record',
    'vehicles.location.record',
    'vehicles.history.correct',
    'customers.read',
    'customers.manage',
    'customers.documents.read',
    'customers.documents.manage',
    'customers.documents.view',
    'customers.documents.download',
    'customers.identity.reveal',
    'branches.read',
    'branches.manage',
    'settings.documents.manage',
    'users.read',
    'roles.read',
    'audit.read',
  ],
  Yönetici: [
    'vehicles.read',
    'vehicles.create',
    'vehicles.update',
    'vehicles.documents.read',
    'vehicles.documents.manage',
    'vehicles.photos.manage',
    'vehicles.odometer.record',
    'vehicles.location.record',
    'vehicles.history.correct',
    'customers.read',
    'customers.manage',
    'customers.documents.read',
    'customers.documents.manage',
    'customers.documents.view',
    'branches.read',
    'users.read',
  ],
  Operasyon: [
    'vehicles.read',
    'vehicles.documents.read',
    'vehicles.documents.manage',
    'vehicles.photos.manage',
    'vehicles.odometer.record',
    'vehicles.location.record',
    'customers.read',
    'customers.manage',
    'customers.documents.read',
    'customers.documents.manage',
    'branches.read',
  ],
}

/**
 * Earlier versions of the presets, newest last. A role is upgraded only when its name matches a
 * preset AND its permission set is exactly an earlier version of that preset, i.e. nobody has
 * changed it. Custom roles and edited presets are never touched.
 */
export const ROLE_PRESET_HISTORY: { version: number; presets: Record<string, readonly Permission[]> }[] = [
  {
    version: 1,
    presets: {
      Sahip: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read', 'roles.read', 'audit.read'],
      Yönetici: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read'],
      Operasyon: ['vehicles.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read'],
    },
  },
  {
    // Vehicle documents (docs §8.4) added vehicles.documents.read.
    version: 2,
    presets: {
      Sahip: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read', 'roles.read', 'audit.read'],
      Yönetici: ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read'],
      Operasyon: ['vehicles.read', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read'],
    },
  },
  {
    // Odometer and location records (docs §8.5) added vehicles.odometer.record, vehicles.location.record and vehicles.history.correct.
    version: 3,
    presets: {
      Sahip: [
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage',
        'vehicles.odometer.record', 'vehicles.location.record', 'vehicles.history.correct', 'branches.read', 'users.read', 'roles.read', 'audit.read',
      ],
      Yönetici: [
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage',
        'vehicles.odometer.record', 'vehicles.location.record', 'vehicles.history.correct', 'branches.read', 'users.read',
      ],
      Operasyon: ['vehicles.read', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'vehicles.odometer.record', 'vehicles.location.record', 'branches.read'],
    },
  },
  {
    // Customers M1 added customers.read and customers.manage.
    version: 4,
    presets: {
      Sahip: [
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage',
        'vehicles.odometer.record', 'vehicles.location.record', 'vehicles.history.correct', 'customers.read', 'customers.manage', 'branches.read', 'users.read', 'roles.read', 'audit.read',
      ],
      Yönetici: [
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage',
        'vehicles.odometer.record', 'vehicles.location.record', 'vehicles.history.correct', 'customers.read', 'customers.manage', 'branches.read', 'users.read',
      ],
      Operasyon: [
        'vehicles.read', 'vehicles.documents.read', 'vehicles.documents.manage', 'vehicles.photos.manage', 'vehicles.odometer.record', 'vehicles.location.record',
        'customers.read', 'customers.manage', 'branches.read',
      ],
    },
  },
]
