import { LockSimple } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { PhotoRecordKind } from '@/lib/api'
import { usePhotoAccess } from '@/lib/photo-access'
import { formatDateTime } from '@/lib/vehicle-labels'

/**
 * Evidence photos are shown only after ACARVO granted this session access to the record's photos. The grant is
 * recorded once in the history as "access granted" (not as "viewed"); opening a photo afterwards records nothing.
 */
export function EvidenceGate({ kind, id, count, children }: { kind: PhotoRecordKind; id: string; count: number; children: ReactNode }) {
  const grant = usePhotoAccess(kind, id, count > 0)
  if (count === 0) return <>{children}</>
  if (grant.isError) {
    return (
      <p className="flex items-start gap-2 text-[13px] text-alert">
        <LockSimple size={15} className="mt-0.5 shrink-0" />
        Fotoğraflara erişim izni alınamadı: {grant.error.message}
      </p>
    )
  }
  if (!grant.data) return <div aria-busy="true" aria-label="Fotoğraf erişim izni isteniyor" className="h-24 animate-pulse rounded-lg bg-line-soft/60" />
  return (
    <>
      {children}
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
        <LockSimple size={12} />
        Bu oturuma {formatDateTime(grant.data.expiresAt)} tarihine kadar erişim izni verildi; izin işlem geçmişine kaydedildi.
      </p>
    </>
  )
}
