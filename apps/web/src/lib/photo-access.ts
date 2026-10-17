import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/session'
import { type PhotoRecordKind, photoAccessApi } from './api'

/**
 * Evidence photos open only after ACARVO granted this session access to the record's photos (a POST, recorded once per
 * grant). The grant lasts 5 minutes; while the page stays open and visible a new grant is asked for when it expires
 * (each new grant is one more "access granted" row; reusing a valid grant writes nothing).
 */
export function usePhotoAccess(kind: PhotoRecordKind, id: string | undefined, enabled = true) {
  const session = useSession()
  return useQuery({
    queryKey: ['photo-access', session.company?.id, session.user.id, kind, id],
    queryFn: () => photoAccessApi.grant(kind, id!),
    enabled: enabled && !!id,
    staleTime: (q) => (q.state.data ? Math.max(0, Date.parse(q.state.data.expiresAt) - Date.now()) : 0),
    refetchInterval: (q) => (q.state.data ? Math.max(1_000, Date.parse(q.state.data.expiresAt) - Date.now() + 1_000) : false),
    retry: false,
  })
}
