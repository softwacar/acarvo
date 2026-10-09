import { SignOut, SpinnerGap } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/states'
import { authApi } from '@/lib/api'
import { PERMISSION_LABELS } from '@/nav'
import { sessionQuery, useSession } from '@/session'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

/** Profil/Oturum (user menu, §4): who is signed in, effective access, session controls. */
export function ProfilePage() {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const revokeAll = useMutation({
    mutationFn: authApi.revokeAll,
    onSuccess: async () => {
      qc.setQueryData(sessionQuery.queryKey, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
      await navigate({ to: '/giris' })
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Profil ve oturum" description="Hesap bilgileriniz ve bu şirketteki erişiminiz." />

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">Hesap</h2>
        <dl className="divide-y divide-line-soft">
          <Row label="Ad soyad">{session.user.name}</Row>
          <Row label="E-posta">{session.user.email}</Row>
          <Row label="Üye olunan şirketler">{session.memberships.map((m) => m.companyName).join(', ') || 'Yok'}</Row>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">{session.company ? `${session.company.name} erişimi` : 'Şirket erişimi'}</h2>
        {session.company ? (
          <dl className="divide-y divide-line-soft">
            <Row label="Rol">{session.company.roles.join(', ')}</Row>
            <Row label="Şubeler">{session.allBranches ? 'Tüm şubeler' : session.branches.map((b) => `${b.name} (${b.code})`).join(', ') || 'Atanmamış'}</Row>
            <Row label="Yetkiler">
              <ul className="space-y-0.5">
                {session.permissions.map((p) => (
                  <li key={p}>{PERMISSION_LABELS[p]}</li>
                ))}
              </ul>
            </Row>
            <Row label="Para birimi ve saat dilimi">
              {session.company.currency} · {session.company.timezone}
            </Row>
          </dl>
        ) : (
          <p className="px-5 py-4 text-ink-2">Etkin bir şirket üyeliğiniz yok. Şirket yöneticinize başvurun.</p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">Oturumlar</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p className="max-w-[560px] text-ink-2">
            Oturum 8 saat işlem yapılmazsa, her durumda en geç 7 gün sonra kapanır. Başka bir cihazda açık kalan oturumlarınızı buradan kapatabilirsiniz.
          </p>
          <button
            type="button"
            disabled={revokeAll.isPending}
            onClick={() => revokeAll.mutate()}
            className="flex h-10 items-center gap-2 rounded-lg border border-line px-3.5 font-medium text-alert hover:bg-alert-soft disabled:opacity-70"
          >
            {revokeAll.isPending ? <SpinnerGap size={17} className="animate-spin" /> : <SignOut size={17} />}
            Tüm oturumları kapat
          </button>
        </div>
      </section>
    </div>
  )
}
