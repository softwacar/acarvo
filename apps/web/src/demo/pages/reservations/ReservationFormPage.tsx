import { useParams } from '@tanstack/react-router'
import { L } from '../../i18n'
import { Empty } from '../../ui/kit'
import { useDb, useUrlState } from '../../ui/hooks'
import { BookingWorkspace } from '../shared/BookingWorkspace'

export function ReservationFormPage() {
  const { id } = useParams({ strict: false }) as { id?: string }
  const d = useDb()
  const [customerId] = useUrlState('musteri')
  const [vehicleId] = useUrlState('arac')
  const [classId] = useUrlState('sinif')
  const [from] = useUrlState('baslangic')
  const [to] = useUrlState('bitis')
  const edit = id ? d.reservations.find((r) => r.id === id) : undefined
  if (id && !edit) return <Empty title={L('Rezervasyon bulunamadı', 'Reservation not found')} />
  return <BookingWorkspace mode="reservation" edit={edit} preset={{ customerId: customerId || undefined, vehicleId: vehicleId || undefined, classId: classId || undefined, from: from || undefined, to: to || undefined }} />
}
