import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Feedback, FeedbackCategory, ServicePriority } from '@/types/database'
import { DEMO_MODE } from '@/config/demo'
import { DEMO_CATALOGS, DEMO_DINGLI_STOCK, DEMO_MACHINES, DEMO_PRODUCTS } from '@/lib/demo/catalog'
import { addDemoFeedback, addDemoServiceRequest, getDemoDataset } from '@/lib/demo/dataset'

// Every hook below has the same shape: when DEMO_MODE is on it returns
// generated data and never touches Supabase; otherwise it runs the real query.
// Flipping VITE_DEMO_MODE=false restores the live paths wholesale — see
// @/config/demo.

// ---------------------------------------------------------------------------
// Reference data (shared across all dealers)
// ---------------------------------------------------------------------------

export function useProducts() {
  return useQuery({
    queryKey: ['products', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return DEMO_PRODUCTS

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useDingliStock() {
  return useQuery({
    queryKey: ['dingli_stock', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return DEMO_DINGLI_STOCK

      const { data, error } = await supabase
        .from('dingli_stock')
        .select('*, product:products(*)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useMachines() {
  return useQuery({
    queryKey: ['machines', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) {
        return DEMO_MACHINES.map((m) => ({
          model_name: m.model_name,
          category: m.category,
          manual_text: m.manual_text,
        }))
      }

      const { data, error } = await supabase
        .from('machines')
        .select('model_name, category, manual_text')
        // The support chatbot can only ever answer questions about a machine
        // that has a manual on file (see runSupportChat's manual_text check
        // in api/chat.ts) — filtering here means the picker never offers a
        // model that's guaranteed to dead-end, and trims the payload too.
        .not('manual_text', 'is', null)
        .neq('manual_text', '')
        .order('category', { ascending: true })
        .order('model_name', { ascending: true })
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000, // rarely changes — cache a bit longer than the default
  })
}

export function useCatalogs() {
  return useQuery({
    queryKey: ['catalogs', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return DEMO_CATALOGS

      const { data, error } = await supabase.from('catalogs').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Null in demo mode — there are no files behind the generated catalog rows. */
export function getCatalogDownloadUrl(filePath: string): string | null {
  if (DEMO_MODE) return null
  return supabase.storage.from('catalogs').getPublicUrl(filePath).data.publicUrl
}

// ---------------------------------------------------------------------------
// Per-dealer data
// ---------------------------------------------------------------------------

export function useDealerStock() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dealer_stock', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) return getDemoDataset(user!.id).dealerStock

      const { data, error } = await supabase
        .from('dealer_stock')
        .select('*, product:products(*)')
        .eq('dealer_id', user!.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useInvoices() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['invoices', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) return getDemoDataset(user!.id).invoices

      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('dealer_id', user!.id)
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useInvoiceDetail(invoiceId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['invoice', invoiceId],
    enabled: !!user && !!invoiceId,
    queryFn: async () => {
      if (DEMO_MODE) {
        const invoice = getDemoDataset(user!.id).invoices.find((i) => i.id === invoiceId)
        if (!invoice) throw new Error('Invoice not found')
        return invoice
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', invoiceId!)
        .eq('dealer_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export async function getInvoiceSignedUrl(pdfPath: string) {
  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(pdfPath, 60 * 5)
  if (error) throw error
  return data.signedUrl
}

export function useLedger() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dealer_ledger', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) return getDemoDataset(user!.id).ledger

      // Scoped by RLS to the GSTIN on this profile - there is no dealer_id to
      // filter on, because the entries come from Focus, not from a signup.
      const { data, error } = await supabase
        .from('dealer_ledger')
        .select('*')
        .order('entry_date', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useFeedbackList() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['feedback', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Copied so react-query sees a new reference after a demo submission.
      if (DEMO_MODE) return [...getDemoDataset(user!.id).feedback]

      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('dealer_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSubmitFeedback() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { category: FeedbackCategory; subject: string; message: string }) => {
      if (!user) throw new Error('Not signed in')

      // Demo submissions live in memory for the session only — they're gone on
      // reload, which is the honest behaviour when there's no backend.
      if (DEMO_MODE) {
        addDemoFeedback(user.id, input)
        return
      }

      const { error } = await supabase.from('feedback').insert({
        dealer_id: user.id,
        category: input.category,
        subject: input.subject,
        message: input.message,
      } satisfies Partial<Feedback>)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback', user?.id] })
    },
  })
}

export function useServiceRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['service_requests', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) return [...getDemoDataset(user!.id).serviceRequests]

      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('dealer_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSubmitServiceRequest() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      machineModel: string
      serialNumber?: string
      issueDescription: string
      priority: ServicePriority
    }) => {
      if (!user) throw new Error('Not signed in')

      if (DEMO_MODE) {
        addDemoServiceRequest(user.id, {
          machine_model: input.machineModel,
          serial_number: input.serialNumber || null,
          issue_description: input.issueDescription,
          priority: input.priority,
        })
        return
      }

      const { error } = await supabase.from('service_requests').insert({
        dealer_id: user.id,
        machine_model: input.machineModel,
        serial_number: input.serialNumber || null,
        issue_description: input.issueDescription,
        priority: input.priority,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['service_requests', user?.id] })
    },
  })
}
