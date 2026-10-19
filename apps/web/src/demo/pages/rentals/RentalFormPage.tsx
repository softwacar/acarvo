import { useUrlState } from '../../ui/hooks'
import { BookingWorkspace } from '../shared/BookingWorkspace'

export function RentalFormPage() {
  const [customerId] = useUrlState('musteri')
  const [vehicleId] = useUrlState('arac')
  const [from] = useUrlState('baslangic')
  const [to] = useUrlState('bitis')
  return <BookingWorkspace mode="rental" preset={{ customerId: customerId || undefined, vehicleId: vehicleId || undefined, from: from || undefined, to: to || undefined }} />
}
