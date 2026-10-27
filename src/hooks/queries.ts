import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type {
  Catalog,
  DealerInvoice,
  DealerLedgerEntry,
  DealerStock,
  DingliStock,
  Feedback,
  FeedbackCategory,
  Invoice,
  Machine,
  Product,
  ServicePriority,
} from '@/types/database'
import { DEMO_MODE } from '@/config/demo'
import {
  addSessionFeedback,
  addSessionServiceRequest,
  readUatAccess,
  sessionFeedback,
  sessionServiceRequests,
  uatFetch,
} from '@/lib/uat'

// Every hook below reads one of two sources. Demo mode shows Dingli's Focus
// UAT data, synced into Supabase and read through /api/uat-data with the
// shared UAT password. Live mode reads the same tables directly with the
// dealer's own Supabase session, scoped by RLS. Flipping VITE_DEMO_MODE=false
// switches every hook to the live path — see @/config/demo.

/**
 * Supabase (PostgREST) caps a response at 1,000 rows. The Focus-synced tables
 * (ledger, catalogue, stock) can run past that, so read them a page at a time.
 * The query must have a stable order for the pages not to overlap.
 */
const PAGE_SIZE = 1000

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/** A Focus invoice in the shape the invoice pages already render. */
function toInvoice(row: DealerInvoice, dealerId: string): Invoice {
  const id = String(row.focus_header_id)
  return {
    id,
    dealer_id: dealerId,
    invoice_number: row.invoice_number,
    fy: row.fy ?? '',
    invoice_date: row.invoice_date ?? row.synced_at,
    amount: Number(row.amount),
    status: row.status,
    outstanding: row.outstanding == null ? null : Number(row.outstanding),
    due_date: row.due_date,
    // Focus UAT holds no invoice PDFs.
    pdf_path: null,
    created_at: row.synced_at,
    invoice_items: (row.dealer_invoice_items ?? []).map((item) => ({
      id: String(item.body_id),
      invoice_id: id,
      product_id: null,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
      created_at: item.synced_at,
    })),
  }
}

/**
 * My Stock from Focus. Focus only knows what Dingli invoiced to this dealer —
 * not what they hold now, where, or what they've sold — so each row is one
 * invoiced machine/part line (quantity = quantity purchased), and the page
 * explains the rest isn't in the UAT data. Service charges and other
 * non-catalogue lines aren't stock, so lines without a catalogue product drop.
 */
function toPurchases(invoices: DealerInvoice[], products: Product[], dealerId: string): DealerStock[] {
  const byFocusId = new Map(
    products.map((p) => [(p as Product & { focus_product_id: number | null }).focus_product_id, p] as const),
  )
  return invoices.flatMap((inv) =>
    (inv.dealer_invoice_items ?? []).flatMap<DealerStock>((item) => {
      const product = item.focus_product_id == null ? undefined : byFocusId.get(item.focus_product_id)
      if (!product) return []
      const date = inv.invoice_date ?? inv.synced_at
      return [
        {
          id: String(item.body_id),
          dealer_id: dealerId,
          product_id: product.id,
          quantity: Number(item.quantity),
          location: null,
          warehouse: null,
          updated_at: date,
          product,
          movement: {
            purchase: {
              invoice_number: inv.invoice_number,
              date,
              quantity: Number(item.quantity),
              unit_cost: Number(item.unit_price),
              total_cost: Number(item.line_total),
              supplier: 'Dingli India',
            },
            sales: null,
          },
        },
      ]
    }),
  )
}

// ---------------------------------------------------------------------------
// Demo (UAT) mode: one request per dealer, shared by the per-dealer hooks
// ---------------------------------------------------------------------------

type UatDealerData = { ledger: DealerLedgerEntry[]; invoices: DealerInvoice[]; products: Product[] }

/** The signed-in dealer's UAT data, fetched once and shared through the query cache. */
function uatDealerData(queryClient: QueryClient): Promise<UatDealerData> {
  const gstin = readUatAccess()?.gstin ?? null
  return queryClient.fetchQuery({
    queryKey: ['uat-dealer', gstin],
    queryFn: async () =>
      // A dealership missing from the Focus UAT dealer list has nothing to show.
      gstin ? uatFetch<UatDealerData>('dealer', { gstin }) : { ledger: [], invoices: [], products: [] },
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Reference data (shared across all dealers)
// ---------------------------------------------------------------------------

export function useProducts() {
  return useQuery({
    queryKey: ['products', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return (await uatFetch<{ products: Product[] }>('catalog')).products

      // Machines only: the ~9k spare parts synced from Focus are browsed on
      // Dingli Stock, and the Price List has never listed spares.
      return fetchAllPages<Product>((from, to) =>
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .or('category.is.null,category.neq.Spare Parts')
          .order('category', { ascending: true })
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )
    },
  })
}

export function useDingliStock() {
  return useQuery({
    queryKey: ['dingli_stock', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return (await uatFetch<{ stock: DingliStock[] }>('dingli-stock')).stock

      return fetchAllPages<DingliStock>((from, to) =>
        supabase
          .from('dingli_stock')
          .select('*, product:products(*)')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      )
    },
  })
}

type MachineManual = Pick<Machine, 'model_name' | 'category' | 'manual_text'>

export function useMachines() {
  return useQuery({
    queryKey: ['machines', DEMO_MODE],
    queryFn: async () => {
      if (DEMO_MODE) return (await uatFetch<{ machines: MachineManual[] }>('machines')).machines

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
      if (DEMO_MODE) return (await uatFetch<{ catalogs: Catalog[] }>('catalogs')).catalogs

      const { data, error } = await supabase.from('catalogs').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** The catalogs bucket is public, so this works in both modes. */
export function getCatalogDownloadUrl(filePath: string): string {
  return supabase.storage.from('catalogs').getPublicUrl(filePath).data.publicUrl
}

// ---------------------------------------------------------------------------
// Per-dealer data
// ---------------------------------------------------------------------------

export function useDealerStock() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['dealer_stock', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) {
        const data = await uatDealerData(queryClient)
        return toPurchases(data.invoices, data.products, user!.id)
      }

      const invoices = await fetchAllPages<DealerInvoice>((from, to) =>
        supabase
          .from('dealer_invoices')
          .select('*, dealer_invoice_items(*)')
          .order('invoice_date', { ascending: false })
          .order('focus_header_id', { ascending: true })
          .range(from, to),
      )
      const productIds = [
        ...new Set(
          invoices.flatMap((inv) =>
            (inv.dealer_invoice_items ?? [])
              .map((item) => item.focus_product_id)
              .filter((id): id is number => id != null),
          ),
        ),
      ]
      const products: Product[] = []
      for (let i = 0; i < productIds.length; i += 200) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .in('focus_product_id', productIds.slice(i, i + 200))
        if (error) throw error
        products.push(...(data ?? []))
      }
      return toPurchases(invoices, products, user!.id)
    },
  })
}

export function useInvoices() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['invoices', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) {
        const data = await uatDealerData(queryClient)
        return data.invoices.map((row) => toInvoice(row, user!.id))
      }

      // Focus invoices, scoped by RLS to this profile's GSTIN.
      const rows = await fetchAllPages<DealerInvoice>((from, to) =>
        supabase
          .from('dealer_invoices')
          .select('*, dealer_invoice_items(*)')
          .order('invoice_date', { ascending: false })
          .order('focus_header_id', { ascending: true })
          .range(from, to),
      )
      return rows.map((row) => toInvoice(row, user!.id))
    },
  })
}

export function useInvoiceDetail(invoiceId: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['invoice', invoiceId],
    enabled: !!user && !!invoiceId,
    queryFn: async () => {
      if (DEMO_MODE) {
        const data = await uatDealerData(queryClient)
        const row = data.invoices.find((i) => String(i.focus_header_id) === invoiceId)
        if (!row) throw new Error('Invoice not found')
        return toInvoice(row, user!.id)
      }

      const { data, error } = await supabase
        .from('dealer_invoices')
        .select('*, dealer_invoice_items(*)')
        .eq('focus_header_id', Number(invoiceId))
        .single()
      if (error) throw error
      return toInvoice(data as DealerInvoice, user!.id)
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
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['dealer_ledger', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (DEMO_MODE) return (await uatDealerData(queryClient)).ledger

      // Scoped by RLS to the GSTIN on this profile - there is no dealer_id to
      // filter on, because the entries come from Focus, not from a signup.
      return fetchAllPages<DealerLedgerEntry>((from, to) =>
        supabase
          .from('dealer_ledger')
          .select('*')
          .order('entry_date', { ascending: true })
          .order('body_id', { ascending: true })
          .range(from, to),
      )
    },
  })
}

export function useFeedbackList() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['feedback', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Copied so react-query sees a new reference after a session submission.
      if (DEMO_MODE) return [...sessionFeedback(user!.id)]

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
        addSessionFeedback(user.id, input)
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
      if (DEMO_MODE) return [...sessionServiceRequests(user!.id)]

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
        addSessionServiceRequest(user.id, {
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
