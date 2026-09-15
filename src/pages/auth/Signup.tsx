import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, Building2, UserRound, ArrowRight } from 'lucide-react'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Label, Input, FieldError } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'

const schema = z
  .object({
    dealerName: z.string().min(2, 'Enter your full name'),
    companyName: z.string().min(2, 'Enter your company/dealership name'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type FormValues = z.infer<typeof schema>

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    const { error } = await signUp({
      email: values.email,
      password: values.password,
      dealerName: values.dealerName,
      companyName: values.companyName,
    })
    setSubmitting(false)

    if (error) {
      toast.error(error)
      return
    }

    toast.success('Account created! Check your email to confirm, then sign in.')
    navigate('/login', { replace: true })
  }

  return (
    <AuthLayout
      title="Create your dealer account"
      subtitle="Register your dealership to get access to the Dingli portal."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-orange-400 hover:text-orange-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="dealerName">Your name</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
            <Input id="dealerName" placeholder="Jane Doe" className="pl-10" {...register('dealerName')} />
          </div>
          <FieldError>{errors.dealerName?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="companyName">Dealership / company name</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
            <Input id="companyName" placeholder="ABC Equipment Pvt. Ltd." className="pl-10" {...register('companyName')} />
          </div>
          <FieldError>{errors.companyName?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
            <Input id="email" type="email" placeholder="you@dealership.com" className="pl-10" {...register('email')} />
          </div>
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
              <Input id="password" type="password" placeholder="••••••••" className="pl-10" {...register('password')} />
            </div>
            <FieldError>{errors.password?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-base-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className="pl-10"
                {...register('confirmPassword')}
              />
            </div>
            <FieldError>{errors.confirmPassword?.message}</FieldError>
          </div>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
          <ArrowRight className="size-4" />
        </Button>
      </form>
    </AuthLayout>
  )
}
