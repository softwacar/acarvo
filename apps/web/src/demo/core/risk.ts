import { B } from '../i18n'
import { hasPerm } from './helpers'
import type { ApprovalType, Cur, Db, DemoUser, Id, Money } from './types'

// Risk-based independent approval (decision document K-4 / M.2 / M.4). Four levels:
//   0 low       – no approval; the full audit trail still exists (e.g. the automatic policy fee)
//   1 medium    – the person who recorded it cannot verify it; any other holder of the verify permission can
//   2 high      – an independent authorizer approves; the person who starts it must be an authorizer too
//   3 critical  – like level 2, always, and never relaxed by a company policy
// A single-person company cannot get a fake four-eyes: with fewer than two authorizers the level-2 actions stay locked and
// the screens say so (never hidden, never worked around).

export type RiskLevel = 0 | 1 | 2 | 3

export const RISK_LABEL: Record<RiskLevel, { tr: string; en: string }> = {
  0: { tr: 'Seviye 0 · Düşük', en: 'Level 0 · Low' },
  1: { tr: 'Seviye 1 · Orta (bağımsız doğrulama)', en: 'Level 1 · Medium (independent verification)' },
  2: { tr: 'Seviye 2 · Yüksek (bağımsız onay)', en: 'Level 2 · High (independent approval)' },
  3: { tr: 'Seviye 3 · Kritik', en: 'Level 3 · Critical' },
}

/** Active people who may decide formal approvals. Level-2 work needs at least two of them. */
export function authorizersOf(d: Db): DemoUser[] {
  return d.users.filter((u) => u.status === 'active' && hasPerm(d, 'approvals:decide', u))
}
export function verifiersOf(d: Db): DemoUser[] {
  return d.users.filter((u) => u.status === 'active' && hasPerm(d, 'finance:verify', u))
}
export function recordersOf(d: Db): DemoUser[] {
  return d.users.filter((u) => u.status === 'active' && hasPerm(d, 'finance:record', u))
}

/** Risk level of a formal approval request. Thresholds come from the company's approval-threshold settings. */
export function approvalRisk(d: Db, type: ApprovalType, requested: Money | null): RiskLevel {
  const th = d.settings.thresholds
  switch (type) {
    case 'financial_correction':
    case 'corporate_credit_override':
      return 2
    case 'refund': {
      const limit = requested ? th.refundAbove[requested.cur as Cur] : undefined
      return requested && limit !== undefined && requested.minor >= limit ? 2 : 1
    }
    case 'deposit_exception': {
      const limit = requested ? th.depositExceptionAbove[requested.cur as Cur] : undefined
      return requested && limit !== undefined && requested.minor >= limit ? 2 : 1
    }
    default:
      return 1
  }
}

export interface IndependenceRow {
  id: string
  level: RiskLevel
  label: string
  state: 'ok' | 'other' | 'locked'
  /** Why: who can do it, or why it is locked. */
  why: string
}

/**
 * What the current people can and cannot do (the Drina case: one Owner and one Operations clerk). "ok" = it works with
 * two different people who exist today; "other" = it works only when somebody else performs the second step; "locked" =
 * no second authorized person exists, so the action stays closed. Nothing here changes any permission.
 */
export function independenceReport(d: Db): IndependenceRow[] {
  const recorders = recordersOf(d)
  const verifiers = verifiersOf(d)
  const authorizers = authorizersOf(d)
  const pairExists = (a: DemoUser[], b: DemoUser[]) => a.some((x) => b.some((y) => x.id !== y.id))
  const names = (xs: DemoUser[]) => xs.map((x) => x.name).join(', ') || '—'
  const rows: IndependenceRow[] = []
  const pay = pairExists(recorders, verifiers)
  rows.push({ id: 'verify-payment', level: 1, label: B('Tahsilat / depozito doğrulama', 'Payment / deposit verification'), state: pay ? (verifiers.length > 1 ? 'ok' : 'other') : 'locked', why: pay ? B(`Kaydeden: ${names(recorders)} · doğrulayan: ${names(verifiers)}. Doğrulayan kendi kaydını doğrulayamaz.`, `Recorded by: ${names(recorders)} · verified by: ${names(verifiers)}. Nobody verifies their own record.`) : B('Kaydeden dışında doğrulama yetkilisi yok.', 'There is no verifier besides the person who records.') })
  const refundPair = pairExists(d.users.filter((u) => u.status === 'active' && hasPerm(d, 'approvals:request', u)), authorizers)
  rows.push({ id: 'refund-routine', level: 1, label: B('Rutin iade (eşik altı)', 'Routine refund (below the threshold)'), state: refundPair ? 'ok' : 'locked', why: refundPair ? B(`İsteyen ve karar veren farklı kişi: karar verenler ${names(authorizers)}.`, `Requester and decider are different people: deciders ${names(authorizers)}.`) : B('Talep eden dışında karar verecek yetkili yok.', 'No authorizer besides the requester.') })
  const level2 = authorizers.length >= 2
  const l2why = level2 ? B(`İki bağımsız yetkili var: ${names(authorizers)}.`, `Two independent authorizers exist: ${names(authorizers)}.`) : B(`Yalnız ${authorizers.length} yetkili var (${names(authorizers)}). Yüksek riskli işlem için ikinci bir Sahip/Yönetici gerekir; görünürlük değiştirilerek aşılamaz.`, `Only ${authorizers.length} authorizer(s) (${names(authorizers)}). A high-risk action needs a second Owner/Manager; it cannot be worked around by changing visibility.`)
  rows.push({ id: 'refund-high', level: 2, label: B('Eşik üstü iade', 'Refund above the threshold'), state: refundPair ? 'ok' : 'locked', why: refundPair ? B('Talep eden ile karar veren farklı kişi olmalıdır; eşik üstü iade için karar yetkilisi gerekir.', 'The requester and the decider must be different people; a refund above the threshold needs an authorizer to decide.') : B('Talep eden dışında karar verecek yetkili yok.', 'No authorizer besides the requester.') })
  for (const [id, label] of [
    ['correction', B('Finansal düzeltme (ters kayıt)', 'Financial correction (reversal)')],
    ['policy-deviation', B('İptal/kaparo politikasından sapma', 'Deviation from the cancellation / advance policy')],
    ['deposit-critical', B('Kritik depozito istisnası', 'Critical deposit exception')],
    ['damage-unblock', B('Hasar engeli kaldırma', 'Lifting a damage block')],
  ] as [string, string][])
    rows.push({ id, level: 2, label, state: level2 ? 'ok' : 'locked', why: l2why })
  return rows
}

export const isLevel2 = (l: RiskLevel) => l >= 2

/** Level-2 actions that the person who starts them must be an authorizer for (a refund request is not one of them). */
export const STARTER_MUST_AUTHORIZE = new Set<ApprovalType>(['financial_correction', 'corporate_credit_override'])

/**
 * Why a level-2 request cannot be started, or null. The starter must be an authorizer for the privileged actions, and a
 * second independent authorizer must exist to decide. Used by requests, damage-block lifting and policy deviations.
 */
export function level2Blocker(d: Db, userId: Id, starterMustAuthorize = true): string | null {
  const authorizers = authorizersOf(d)
  if (starterMustAuthorize && !authorizers.some((u) => u.id === userId)) return B('Yüksek riskli işlemi yalnız onay yetkisi olan kişi başlatabilir (Sahip/Yönetici).', 'Only a person with approval authority (Owner/Manager) can start a high-risk action.')
  if (authorizers.filter((u) => u.id !== userId).length < 1) return B('İkinci bir bağımsız yetkili (Sahip/Yönetici) yok: işlem kilitli. Kullanıcılar ve Roller’den ikinci yetkili ekleyin; görünürlükle aşılamaz.', 'There is no second independent authorizer (Owner/Manager): the action is locked. Add a second authorizer in Users & Roles; it cannot be bypassed by visibility.')
  return null
}
