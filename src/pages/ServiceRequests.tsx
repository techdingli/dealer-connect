import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Wrench, Send } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Label, Input, Textarea, FieldError } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useServiceRequests, useSubmitServiceRequest } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'

const schema = z.object({
  machineModel: z.string().min(2, 'Enter the machine model'),
  serialNumber: z.string().optional(),
  issueDescription: z.string().min(10, 'Describe the issue in a bit more detail'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
})
type FormValues = z.infer<typeof schema>

export default function ServiceRequests() {
  const { data: requests, isLoading } = useServiceRequests()
  const submitRequest = useSubmitServiceRequest()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { priority: 'medium' } })

  async function onSubmit(values: FormValues) {
    try {
      await submitRequest.mutateAsync(values)
      toast.success('Service request submitted. Our team will reach out shortly.')
      reset()
    } catch {
      toast.error('Something went wrong. Please try again.')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Support"
        title="Service Requests"
        description="Raise a service ticket for any Dingli machine and track its progress here."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New service request</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="machineModel">Machine model</Label>
                <Input id="machineModel" placeholder="e.g. Dingli BT22RT Boom Lift" {...register('machineModel')} />
                <FieldError>{errors.machineModel?.message}</FieldError>
              </div>

              <div>
                <Label htmlFor="serialNumber">Serial number (optional)</Label>
                <Input id="serialNumber" placeholder="e.g. DGL-2024-00123" {...register('serialNumber')} />
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  className="w-full rounded-xl border border-base-500 bg-base-900/60 px-3.5 py-2.5 text-sm text-base-50 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                  {...register('priority')}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical — machine down</option>
                </select>
              </div>

              <div>
                <Label htmlFor="issueDescription">Describe the issue</Label>
                <Textarea id="issueDescription" placeholder="What's happening with the machine?" {...register('issueDescription')} />
                <FieldError>{errors.issueDescription?.message}</FieldError>
              </div>

              <Button type="submit" className="w-full" loading={submitRequest.isPending}>
                Submit request
                <Send className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <h2 className="font-display mb-4 text-lg font-semibold text-base-50">Your tickets</h2>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : !requests || requests.length === 0 ? (
            <EmptyState icon={Wrench} title="No service requests yet" description="Tickets you raise will appear here with live status updates." />
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone={toneForStatus(r.priority)}>{r.priority}</Badge>
                        <Badge tone={toneForStatus(r.status)}>{r.status.replace('_', ' ')}</Badge>
                      </div>
                      <h3 className="font-medium text-base-50">{r.machine_model}</h3>
                      {r.serial_number && <p className="font-mono text-xs text-base-400">S/N {r.serial_number}</p>}
                      <p className="mt-1 text-sm text-base-300">{r.issue_description}</p>
                    </div>
                    <p className="shrink-0 text-xs text-base-400">{formatDate(r.created_at)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
