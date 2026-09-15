import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Label, Input, FieldError } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
    const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/'
    navigate(redirectTo, { replace: true })
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Access your dealer dashboard, stock, invoices, and more."
      footer={
        <>
          Don&apos;t have a dealer account?{' '}
          <Link to="/signup" className="font-medium text-orange-400 hover:text-orange-300">
            Create one
          </Link>
        </>
      }
    >
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
    </AuthLayout>
  )
}
