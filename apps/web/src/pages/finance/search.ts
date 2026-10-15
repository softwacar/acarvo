// Finance centre tabs in the address bar (kept out of the page module so the page loads on demand).
export const FINANCE_TABS = ['genel', 'bekleyen', 'tahsilatlar', 'depozitolar', 'iadeler', 'dosyalar', 'hareketler'] as const
export type FinanceTab = (typeof FINANCE_TABS)[number]
export const validateFinanceSearch = (s: Record<string, unknown>): { sekme?: FinanceTab } =>
  (FINANCE_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as FinanceTab } : {}
