import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MessageSquareHeart, Send } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Label, Input, Textarea, FieldError } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useFeedbackList, useSubmitFeedback } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'

const schema = z.object({
  category: z.enum(['general', 'complaint', 'suggestion', 'compliment']),
  subject: z.string().min(3, 'Give it a short subject'),
  message: z.string().min(10, 'Tell us a bit more (at least 10 characters)'),
})
type FormValues = z.infer<typeof schema>

export default function Feedback() {
  const { data: feedback, isLoading } = useFeedbackList()
  const submitFeedback = useSubmitFeedback()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { category: 'general' } })

  async function onSubmit(values: FormValues) {
    try {
      await submitFeedback.mutateAsync(values)
      toast.success('Thanks! Your feedback has been submitted.')
      reset()
    } catch {
      toast.error('Something went wrong. Please try again.')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="We're listening"
        title="Feedback & Suggestions"
        description="Tell Dingli India what's working well, and what we could do better."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Share your thoughts</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="w-full rounded-xl border border-base-500 bg-base-900/60 px-3.5 py-2.5 text-sm text-base-50 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                  {...register('category')}
                >
                  <option value="general">General</option>
                  <option value="suggestion">Suggestion</option>
                  <option value="complaint">Complaint</option>
                  <option value="compliment">Compliment</option>
                </select>
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="e.g. Faster spare parts delivery" {...register('subject')} />
                <FieldError>{errors.subject?.message}</FieldError>
              </div>

              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Share details..." {...register('message')} />
                <FieldError>{errors.message?.message}</FieldError>
              </div>

              <Button type="submit" className="w-full" loading={submitFeedback.isPending}>
                Submit feedback
                <Send className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <h2 className="font-display mb-4 text-lg font-semibold text-base-50">Your submissions</h2>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : !feedback || feedback.length === 0 ? (
            <EmptyState icon={MessageSquareHeart} title="No feedback submitted yet" description="Your submissions will show up here once you send one." />
          ) : (
            <div className="space-y-3">
              {feedback.map((f) => (
                <Card key={f.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone="green">{f.category}</Badge>
                        <Badge tone={toneForStatus(f.status)}>{f.status}</Badge>
                      </div>
                      <h3 className="font-medium text-base-50">{f.subject}</h3>
                      <p className="mt-1 text-sm text-base-300">{f.message}</p>
                    </div>
                    <p className="shrink-0 text-xs text-base-400">{formatDate(f.created_at)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <CardDescription className="mt-3">
            Every submission is reviewed by the Dingli India dealer success team.
          </CardDescription>
        </div>
      </div>
    </div>
  )
}
