import { L } from '../../i18n'
import { GatedView } from '../../ui/gate'
import { useDb, useUrlState } from '../../ui/hooks'
import { Embedded, Tabs } from '../../ui/kit'
import { DamagesPage } from './DamagesPage'
import { FinesPage } from './FinesPage'
import { IncidentsPage } from './IncidentsPage'

// "Hasar ve Olaylar": one place for what went wrong with a vehicle. V1 is the Damage file (photos, block, liability);
// Incidents and Fines are V1.5 tabs that open only under the concept preview (decision document H.2 / I.2).

type TabId = 'hasar' | 'olaylar' | 'cezalar'

export function DamageIncidentsPage() {
  const d = useDb()
  const [tabRaw, setTab] = useUrlState('sekme', 'hasar')
  const tab: TabId = tabRaw === 'olaylar' || tabRaw === 'cezalar' ? tabRaw : 'hasar'
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{L('Hasar ve Olaylar', 'Damage & Incidents')}</h1>
        <p className="mt-1 max-w-[860px] text-ink-2">{L('Araçla ilgili olumsuz durumlar tek yerde: hasar dosyası, fotoğraf kanıtı, araç engeli ve sorumluluk. Olaylar ve Cezalar V1.5 kapsamındadır.', 'Everything that went wrong with a vehicle in one place: the damage file, photo evidence, the vehicle block and liability. Incidents and Fines are in V1.5.')}</p>
      </header>
      {d.session.preview && (
        <Tabs<TabId>
          label={L('Hasar ve Olaylar bölümleri', 'Damage & Incidents sections')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'hasar', label: L('Hasar', 'Damage'), count: d.damages.filter((x) => x.status !== 'closed').length || undefined },
            { id: 'olaylar', label: L('Olaylar (V1.5)', 'Incidents (V1.5)'), count: d.incidents.filter((x) => x.status === 'open' || x.status === 'investigating').length || undefined },
            { id: 'cezalar', label: L('Cezalar (V1.5)', 'Fines (V1.5)') },
          ]}
        />
      )}
      {tab === 'hasar' && (
        <Embedded>
          <DamagesPage />
        </Embedded>
      )}
      {tab === 'olaylar' && (
        <GatedView title={L('Olaylar', 'Incidents')} note={L('Olay kaydı ve kanıt Hasar ve Olaylar ekranının Olaylar sekmesine taşındı (V1.5). Bugün araç hasarlarını Hasar sekmesinden yönetebilirsiniz.', 'Incident records and evidence move to the Incidents tab of Damage & Incidents (V1.5). Today vehicle damage is managed in the Damage tab.')}>
          <Embedded>
            <IncidentsPage />
          </Embedded>
        </GatedView>
      )}
      {tab === 'cezalar' && (
        <GatedView title={L('Cezalar', 'Fines')} note={L('Ceza takibi Hasar ve Olaylar ekranının Cezalar sekmesine taşındı (V1.5).', 'Fine tracking moves to the Fines tab of Damage & Incidents (V1.5).')}>
          <Embedded>
            <FinesPage />
          </Embedded>
        </GatedView>
      )}
    </div>
  )
}
