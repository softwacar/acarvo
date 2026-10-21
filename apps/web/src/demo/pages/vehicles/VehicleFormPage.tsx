import { useNavigate } from '@tanstack/react-router'
import { L } from '../../i18n'
import { BackLink, Page, Panel } from '../../ui/kit'
import { VehicleFormFields } from '../shared/FleetDialogs'

export function VehicleFormPage() {
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <BackLink to="/araclar" label={L('Araçlar', 'Vehicles')} />
      <Page title={L('Araç ekle', 'Add vehicle')} description={L('Yeni araç filoya girer ve hazırlık kontrolü bekler. Kilometre ve konum kayıtları başlangıç kaydıyla oluşur.', 'The new vehicle enters the fleet and awaits its readiness check. Odometer and location records start with the entry.')}>
        <Panel>
          <VehicleFormFields onDone={(id) => void navigate({ to: `/araclar/${id}` as never })} />
        </Panel>
      </Page>
    </div>
  )
}
