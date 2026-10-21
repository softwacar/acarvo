import { useDb, useMe } from './hooks'

/** Roles listed in Settings → Privacy see contact details partly masked (a role-based view, not a security boundary). */
export function useMasker() {
  const d = useDb()
  const me = useMe()
  const masked = d.settings.privacy.maskIdentityRoles.includes(me.roleId)
  return {
    masked,
    phone: (s: string) => (masked ? `${s.slice(0, 4)}•••${s.slice(-2)}` : s),
    email: (s: string) => (masked && s ? `${s.slice(0, 2)}•••@${s.split('@')[1] ?? ''}` : s),
  }
}
