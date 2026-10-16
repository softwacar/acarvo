import type { Permission, ReadinessCheck, ReadinessResponse, ReadinessState } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Tx } from '../../db/client'
import { withCompany } from '../../plugins/auth'

// Operasyonel Hazırlık (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md §2): read-only checks of what real use still
// needs. Nothing here changes data, turns a setting on, grants a permission, creates a key or records a legal approval.
// Key material is never read or shown: only whether the application loaded keys. "Configured", "working" and "legally
// approved" are kept apart; what ACARVO cannot verify is reported as not verified.

type Row = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0)

/** Active people (active membership and user) whose roles include the permission, company wide. */
async function holders(tx: Tx, permission: Permission) {
  const r = (
    await tx.execute(sql`select count(distinct m.id)::int as n from memberships m
      join users u on u.id = m.user_id join membership_roles mr on mr.company_id = m.company_id and mr.membership_id = m.id
      join roles r on r.company_id = mr.company_id and r.id = mr.role_id
      where m.status = 'active' and u.status = 'active' and ${permission} = any(r.permissions)`)
  ).rows[0] as Row
  return n(r.n)
}

const validZone = (z: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: z })
    return true
  } catch {
    return false
  }
}

export async function readinessRoutes(app: FastifyInstance) {
  app.get('/', async (req) =>
    withCompany(req, 'readiness.read', async (tx): Promise<ReadinessResponse> => {
      const checks: ReadinessCheck[] = []
      const add = (c: ReadinessCheck) => checks.push(c)

      // Branches
      const branches = (await tx.execute(sql`select code, country, timezone from branches where status = 'active' order by code`)).rows as Row[]
      const noCountry = branches.filter((b) => !b.country).map((b) => b.code as string)
      add({
        key: 'branch_countries',
        group: 'branches',
        title: 'Şube ülkeleri',
        state: noCountry.length ? 'missing' : 'ready',
        detail: noCountry.length ? `${noCountry.length}/${branches.length} şubede ülke tanımlı değil (${noCountry.join(', ')}). Ülke olmadan teslim yapılamaz ve belge kuralı uygulanamaz.` : `${branches.length} şubenin hepsinde ülke tanımlı.`,
        action: noCountry.length ? 'Yetkili kişi her şubenin ülkesini Şubeler ekranından girmeli; ülke tahmin edilmez.' : null,
        link: '/subeler',
      })
      const badZone = branches.filter((b) => !validZone(b.timezone as string)).map((b) => b.code as string)
      add({
        key: 'branch_timezones',
        group: 'branches',
        title: 'Şube saat dilimleri',
        state: badZone.length ? 'missing' : 'ready',
        detail: badZone.length ? `Geçersiz saat dilimi: ${badZone.join(', ')}.` : `${branches.length} şubenin saat dilimi geçerli (${[...new Set(branches.map((b) => b.timezone as string))].join(', ')}).`,
        action: badZone.length ? 'Şube saat dilimini düzeltin.' : null,
        link: '/subeler',
      })

      // Security infrastructure (status only; no key values, ids or fingerprints)
      add({
        key: 'customer_keys',
        group: 'security',
        title: 'Müşteri belgesi şifreleme anahtarları (M2)',
        state: app.customerCrypto ? 'configured' : 'missing',
        detail: app.customerCrypto
          ? 'Uygulama şifreleme anahtarlarını yükledi. Anahtarların değeri ve saklandığı yer burada gösterilmez.'
          : 'Anahtarlar yüklenmedi: müşteri belge numarası ve dosyası kaydedilemez, gösterilemez.',
        action: app.customerCrypto ? null : 'Anahtarları yalnız yetkili kişi oluşturur ve sunucu yapılandırmasına ekler (ACARVO anahtar üretmez).',
        link: null,
      })
      let scan: ReadinessState
      let scanDetail: string
      if (app.scanner.name === 'none') {
        scan = app.env.NODE_ENV === 'production' ? 'missing' : 'not_verified'
        scanDetail =
          app.env.NODE_ENV === 'production'
            ? 'Zararlı dosya taraması yapılandırılmamış: üretimde fotoğraf ve belge yükleme kapalı.'
            : 'Zararlı dosya taraması yapılandırılmamış. Bu geliştirme ortamında yüklemeler yalnız içerik doğrulamasıyla kabul edilir; üretimde kapalı kalır.'
      } else {
        const result = await Promise.race([app.scanner.scan(Buffer.from('acarvo-readiness-probe')), new Promise<'unavailable'>((r) => setTimeout(() => r('unavailable'), 5000))])
        scan = result === 'clean' ? 'working' : 'unavailable'
        scanDetail = result === 'clean' ? `Tarayıcı (${app.scanner.name}) zararsız sınama verisini şimdi taradı.` : `Tarayıcı (${app.scanner.name}) yapılandırılmış ama şu an yanıt vermiyor; yüklemeler reddedilir.`
      }
      add({ key: 'malware_scanner', group: 'security', title: 'Zararlı dosya taraması', state: scan, detail: scanDetail, action: scan === 'working' ? null : 'Sunucu yöneticisi ClamAV hizmetini kurmalı ve yapılandırmalı.', link: null })

      // Documents and rentals
      const policies = (await tx.execute(sql`select count(*)::int as n, count(distinct country)::int as countries from document_requirement_policies where status = 'active'`)).rows[0] as Row
      add({
        key: 'document_rules',
        group: 'documents',
        title: 'Ülke belge kuralları',
        state: n(policies.n) ? 'configured' : 'decision_required',
        detail: n(policies.n) ? `${n(policies.n)} etkin kural (${n(policies.countries)} ülke). Kural içeriğinin hukuki doğruluğu ACARVO tarafından doğrulanmaz.` : 'Etkin ülke belge kuralı yok: teslimde belge uygunluğu yalnız personel kararına dayanır.',
        action: n(policies.n) ? null : 'Şirket sahibi hangi ülke kurallarının geçerli olacağına karar vermeli; ACARVO kural etkinleştirmez.',
        link: '/ayarlar',
      })
      const mode = (await tx.execute(sql`select external_terms_mode from company_rental_settings`)).rows[0] as Row | undefined
      add({
        key: 'rental_mode',
        group: 'rentals',
        title: 'Kiralama çalışma modu (dış sözleşme ve fiyat)',
        state: mode?.external_terms_mode === true ? 'configured' : 'decision_required',
        detail: mode?.external_terms_mode === true ? 'Açık: teslimde dış sözleşme ve fiyat için iki beyan ve dış referans istenir.' : 'Kapalı: ACARVO’da imzalı sözleşme olmadığından teslim yapılamaz.',
        action: mode?.external_terms_mode === true ? null : 'Yalnız şirket sahibi Ayarlar’dan açabilir; ACARVO kendiliğinden açmaz.',
        link: '/ayarlar',
      })

      // Pricing and contracts
      const lists = (
        await tx.execute(sql`select count(*)::int as active, count(*) filter (where v.tax_mode <> 'not_configured')::int as taxed from price_lists l
          join price_list_revisions v on v.company_id = l.company_id and v.price_list_id = l.id and v.revision = l.current_revision where l.status = 'active'`)
      ).rows[0] as Row
      add({
        key: 'price_lists',
        group: 'pricing',
        title: 'Fiyat listesi',
        state: n(lists.active) ? 'ready' : 'missing',
        detail: n(lists.active) ? `${n(lists.active)} etkin fiyat listesi.` : 'Etkin fiyat listesi yok: fiyat teklifi hesaplanamaz.',
        action: n(lists.active) ? null : 'Fiyatlandırma ekranında liste hazırlayıp etkinleştirin.',
        link: '/fiyatlandirma',
      })
      add({
        key: 'tax',
        group: 'pricing',
        title: 'Vergi yapılandırması',
        state: !n(lists.active) ? 'missing' : n(lists.taxed) === n(lists.active) ? 'configured' : 'decision_required',
        detail: !n(lists.active)
          ? 'Etkin fiyat listesi olmadığı için vergi ayarı yok.'
          : `${n(lists.taxed)}/${n(lists.active)} etkin listede vergi tanımlı. Oranların mevzuata uygunluğu ACARVO tarafından doğrulanmaz.`,
        action: n(lists.taxed) === n(lists.active) && n(lists.active) ? 'Mali müşavir oranları onaylamalı.' : 'Vergi oranını yetkili kişi girer; ACARVO oran tahmin etmez.',
        link: '/fiyatlandirma',
      })
      const tpl = (await tx.execute(sql`select count(*)::int as n from contract_template_versions where status = 'active'`)).rows[0] as Row
      add({
        key: 'contract_template',
        group: 'contracts',
        title: 'Sözleşme şablonu',
        state: n(tpl.n) ? 'ready' : 'missing',
        detail: n(tpl.n) ? `${n(tpl.n)} etkin şablon sürümü.` : 'Etkin sözleşme şablonu yok: sözleşme taslağı üretilemez.',
        action: n(tpl.n) ? null : 'Ayarlar’dan şablon hazırlayıp etkinleştirin.',
        link: '/ayarlar',
      })
      add({
        key: 'contract_legal',
        group: 'contracts',
        title: 'Sözleşmenin hukuki onayı',
        state: 'not_verified',
        detail: 'ACARVO’da hukuki onay kaydı yoktur ve şablonun hukuki geçerliliği doğrulanmaz. Taslaklar imzalı sözleşme değildir.',
        action: 'Hukuk danışmanı şablon metnini incelemeli; onay ACARVO dışında kayıt altına alınır.',
        link: null,
      })

      // Four eyes: at least two different authorised people
      const four: [string, string, Permission][] = [
        ['finance_verify', 'Tahsilat ve depozito doğrulama (dört göz)', 'finance.payments.verify'],
        ['finance_approve', 'İç hesap kalemi ve ters kayıt onayı (dört göz)', 'finance.charges.approve'],
        ['finance_refund', 'Depozito iadesi onayı (dört göz)', 'finance.refunds.approve'],
        ['finance_close', 'Ödeme sorumlusu düzeltme onayı (FN5, dört göz)', 'finance.close'],
        ['damage_release', 'Hasar engeli kaldırma onayı (dört göz)', 'damage.unblock'],
      ]
      for (const [key, title, perm] of four) {
        const count = await holders(tx, perm)
        add({
          key,
          group: 'approvals',
          title,
          state: count >= 2 ? 'ready' : 'missing',
          detail: `${count} kişi bu yetkiye sahip.${count >= 2 ? '' : ' Kayıt eden ile onaylayan farklı kişi olmalı; ikinci yetkili olmadan bu adım tamamlanamaz (kural gevşetilmez).'}`,
          action: count >= 2 ? null : 'Şirket sahibi ikinci bir yetkili (ör. Yönetici) eklemeli; ACARVO yetki vermez.',
          link: null,
        })
      }

      // Pending decisions that need a person
      const pend = (
        await tx.execute(sql`select (select count(*)::int from damage_block_release_requests where status = 'requested') as releases,
            (select count(*)::int from finance_responsible_corrections where status = 'requested') as corrections,
            (select count(*)::int from maintenance_records where status = 'pending_approval') as maintenance,
            (select count(*)::int from vehicle_transfers where status = 'requested') as transfers`)
      ).rows[0] as Row
      const total = n(pend.releases) + n(pend.corrections) + n(pend.maintenance) + n(pend.transfers)
      add({
        key: 'pending_decisions',
        group: 'decisions',
        title: 'Bekleyen kritik operasyonel kararlar',
        state: total ? 'decision_required' : 'ready',
        detail: total
          ? `Hasar engeli kaldırma onayı: ${n(pend.releases)} · Ödeme sorumlusu düzeltmesi: ${n(pend.corrections)} · Bakım planı onayı: ${n(pend.maintenance)} · Transfer talebi: ${n(pend.transfers)}.`
          : 'Bekleyen karar yok.',
        action: total ? 'İlgili yetkililer kayıtları inceleyip karar vermeli.' : null,
        link: null,
      })

      const summary = Object.fromEntries((['ready', 'missing', 'working', 'configured', 'unavailable', 'not_verified', 'decision_required'] as ReadinessState[]).map((s) => [s, checks.filter((c) => c.state === s).length])) as Record<ReadinessState, number>
      return { generatedAt: new Date().toISOString(), checks, summary }
    }),
  )
}
