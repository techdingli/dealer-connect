import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, ArrowRight, Building2 } from 'lucide-react'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Label, Input, FieldError } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import { DEMO_MODE } from '@/config/demo'
import { DEALERS, getDealer } from '@/config/dealers'
import { DealerLogoBanner } from '@/components/DealerLogo'
import { DemoModeBanner } from '@/components/DemoModeNotice'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormValues = z.infer<typeof schema>

function useLoginRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/'
    navigate(redirectTo, { replace: true })
  }
}

/**
 * Demo sign-in: pick a dealership, no credentials. Deliberately not a real
 * auth flow — demo mode never provisions accounts or talks to Supabase Auth.
 */
function DemoSignIn() {
  const { signInAsDealer } = useAuth()
  const redirect = useLoginRedirect()
  const [dealerId, setDealerId] = useState('')

  // Alphabetical, so a dealer can find themselves in a 17-long list.
  const options = useMemo(
    () => [...DEALERS].sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [],
  )
  const selected = getDealer(dealerId)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    signInAsDealer(selected.id)
    toast.success(`Signed in as ${selected.shortName}`)
    redirect()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DemoModeBanner />

      <div>
        <Label htmlFor="dealer">Select your dealership</Label>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
          <select
            id="dealer"
            value={dealerId}
            onChange={(e) => setDealerId(e.target.value)}
            className="w-full appearance-none rounded-xl border border-base-500 bg-base-900/60 py-2.5 pl-10 pr-3.5 text-sm text-base-50 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
          >
            <option value="">Choose your dealership…</option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.companyName} — {d.city}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected ? (
        <div className="rounded-xl border border-base-600 bg-base-900/40 p-4">
          <DealerLogoBanner dealer={selected} />
          <p className="mt-3 text-center text-sm font-medium text-base-50">{selected.companyName}</p>
          <p className="text-center text-xs text-base-400">
            {selected.city}, {selected.state}
          </p>
        </div>
      ) : (
        <div className="flex h-[132px] items-center justify-center rounded-xl border border-dashed border-base-600 px-4 text-center text-xs text-base-400">
          Your dealership logo will appear here once you make a selection.
        </div>
      )}

      <Button type="submit" className="w-full" disabled={!selected}>
        Enter portal
        <ArrowRight className="size-4" />
      </Button>
    </form>
  )
}

function CredentialsSignIn() {
  const { signInWithPassword } = useAuth()
  const redirect = useLoginRedirect()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    const { error } = await signInWithPassword(values.email, values.password)
    setSubmitting(false)

    if (error) {
      toast.error(error)
      return
    }

    toast.success('Welcome back!')
    redirect()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
          <Input id="email" type="email" placeholder="you@dealership.com" className="pl-10" {...register('email')} />
        </div>
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
          <Input id="password" type="password" placeholder="••••••••" className="pl-10" {...register('password')} />
        </div>
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      <Button type="submit" className="w-full" loading={submitting}>
        Sign in
        <ArrowRight className="size-4" />
      </Button>
    </form>
  )
}

export default function Login() {
  return (
    <AuthLayout
      title={DEMO_MODE ? 'Sign in to the demo portal' : 'Sign in to your account'}
      subtitle={
        DEMO_MODE
          ? 'Pick your dealership to explore the portal — no password needed.'
          : 'Access your dealer dashboard, stock, invoices, and more.'
      }
      footer={
        DEMO_MODE ? (
          <>This is a preview build. Logins and data become real once the portal goes live.</>
        ) : (
          <>
            Don&apos;t have a dealer account?{' '}
            <Link to="/signup" className="font-medium text-orange-400 hover:text-orange-300">
              Create one
            </Link>
          </>
        )
      }
    >
      {DEMO_MODE ? <DemoSignIn /> : <CredentialsSignIn />}
    </AuthLayout>
  )
}
