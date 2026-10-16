import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/session'
import { type PhotoRecordKind, photoAccessApi } from './api'

/**
 * Evidence photos open only after ACARVO granted this session access to the record's photos (a POST, recorded once per
 * grant). The grant lasts 10 minutes; it is renewed in the background while the page stays open.
 */
export function usePhotoAccess(kind: PhotoRecordKind, id: string | undefined, enabled = true) {
  const session = useSession()
  return useQuery({
    queryKey: ['photo-access', session.company?.id, session.user.id, kind, id],
    queryFn: () => photoAccessApi.grant(kind, id!),
    enabled: enabled && !!id,
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    retry: false,
  })
}
