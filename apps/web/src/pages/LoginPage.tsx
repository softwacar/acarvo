import { type LoginInput, loginSchema } from '@acarvo/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeSlash, Flask, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Mark, Wordmark } from '@/components/Mark'
import { ApiRequestError, authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { sessionQuery } from '@/session'

const field =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15 aria-[invalid=true]:border-alert'

export function LoginPage() {
  const navigate = useNavigate()
  const { next } = useSearch({ from: '/giris' })
  const qc = useQueryClient()
  const [show, setShow] = useState(false)
  const form = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const login = useMutation({
    mutationFn: (v: LoginInput) => authApi.login(v.email, v.password),
    onSuccess: async (info) => {
      qc.setQueryData(sessionQuery.queryKey, info)
      // Only same-app paths are accepted as a return target.
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
      await navigate({ to: target })
    },
  })
  const { errors } = form.formState
  const serverError = login.error instanceof ApiRequestError ? login.error.message : login.error ? 'Giriş yapılamadı.' : null

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="flex h-16 items-center gap-2.5 px-6">
        <Mark />
        <Wordmark />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-[400px] animate-fade">
          <div className="rounded-xl border border-line bg-surface p-7 shadow-[0_1px_2px_rgb(16_24_40/0.04)] sm:p-8">
            <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Oturum açın</h1>
            <p className="mt-1 text-ink-2">Şirket hesabınızla devam edin.</p>

            <form className="mt-6 space-y-4" noValidate onSubmit={form.handleSubmit((v) => login.mutate(v))}>
              {serverError && (
                <div role="alert" className="flex gap-2.5 rounded-lg border border-alert/25 bg-alert-soft px-3 py-2.5 text-[13px] text-alert">
                  <WarningCircle size={18} className="mt-px shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              <div>
                <label htmlFor="email" className="mb-1.5 block font-medium">
                  E-posta
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={field}
                  {...form.register('email')}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1.5 text-[13px] text-alert">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block font-medium">
                  Parola
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    className={cn(field, 'pr-11')}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Parolayı gizle' : 'Parolayı göster'}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-3 hover:text-ink"
                  >
                    {show ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1.5 text-[13px] text-alert">
                    {errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={login.isPending}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-70"
              >
                {login.isPending && <SpinnerGap size={17} className="animate-spin" />}
                {login.isPending ? 'Giriş yapılıyor' : 'Giriş yap'}
              </button>
            </form>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-ink-3">
            <Flask size={14} />
            Geliştirme ortamı: yalnız örnek şirket verileri içerir.
          </p>
        </div>
      </main>
    </div>
  )
}
