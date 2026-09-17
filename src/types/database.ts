// Hand-written mirror of the Supabase schema defined in supabase/migrations/0001_init.sql.
// If you evolve the schema, regenerate this properly with:
//   npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
//
// NOTE: these must be `type` aliases, not `interface`s. supabase-js's generic table
// constraints check `Row extends Record<string, unknown>`, and TypeScript only lets
// object *type aliases* satisfy an index-signature constraint like that — interfaces
// never do, even when structurally identical — so an interface here silently breaks
// all query typing (every result collapses to `never`).

export type UserRole = 'dealer' | 'admin'
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue'
export type FeedbackCategory = 'general' | 'complaint' | 'suggestion' | 'compliment'
export type FeedbackStatus = 'open' | 'reviewed' | 'resolved'
export type ServicePriority = 'low' | 'medium' | 'high' | 'critical'
export type ServiceStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export type Profile = {
  id: string
  dealer_name: string | null
  company_name: string | null
  phone: string | null
  gstin: string | null
  role: UserRole
  created_at: string
}

export type Product = {
  id: string
  sku: string
  name: string
  category: string | null
  unit: string
  price: number
  image_url: string | null
  description: string | null
  is_active: boolean
  created_at: string
}

export type DingliStock = {
  id: string
  product_id: string
  warehouse: string
  quantity: number
  updated_at: string
  product?: Product
}

export type DealerStock = {
  id: string
  dealer_id: string
  product_id: string
  quantity: number
  location: string | null
  updated_at: string
  product?: Product
}

export type Invoice = {
  id: string
  dealer_id: string
  invoice_number: string
  fy: string
  invoice_date: string
  amount: number
  status: InvoiceStatus
  pdf_path: string | null
  created_at: string
  invoice_items?: InvoiceItem[]
}

export type InvoiceItem = {
  id: string
  invoice_id: string
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  line_total: number
  created_at: string
}

export type LedgerEntry = {
  id: string
  dealer_id: string
  fy: string
  entry_date: string
  description: string
  debit: number
  credit: number
  running_balance: number
  created_at: string
}

// Derived from Focus and keyed by GSTIN, not dealer_id: the entries exist
// before a dealer signs up, and RLS matches them to profiles.gstin.
export type DealerLedgerEntry = {
  body_id: number
  gstin: string
  focus_account_id: number | null
  entry_date: string
  voucher_no: string | null
  voucher_type: string | null
  description: string | null
  debit: number
  credit: number
  synced_at: string
}

export type Feedback = {
  id: string
  dealer_id: string
  category: FeedbackCategory
  subject: string
  message: string
  status: FeedbackStatus
  created_at: string
}

export type ServiceRequest = {
  id: string
  dealer_id: string
  machine_model: string
  serial_number: string | null
  issue_description: string
  priority: ServicePriority
  status: ServiceStatus
  created_at: string
  resolved_at: string | null
}

export type Catalog = {
  id: string
  title: string
  description: string | null
  category: string | null
  file_path: string
  file_size: number | null
  created_at: string
}

export type Machine = {
  id: string
  model_name: string
  category: string
  manual_text: string | null
  manual_source: string | null
  created_at: string
}

type Table<Row, Insert> = {
  Row: Row
  Insert: Insert
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & { id: string }>
      products: Table<Product, Partial<Product>>
      dingli_stock: Table<DingliStock, Partial<DingliStock>>
      dealer_stock: Table<DealerStock, Partial<DealerStock>>
      invoices: Table<Invoice, Partial<Invoice>>
      invoice_items: Table<InvoiceItem, Partial<InvoiceItem>>
      ledger_entries: Table<LedgerEntry, Partial<LedgerEntry>>
      dealer_ledger: Table<DealerLedgerEntry, Partial<DealerLedgerEntry>>
      feedback: Table<Feedback, Partial<Feedback>>
      service_requests: Table<ServiceRequest, Partial<ServiceRequest>>
      catalogs: Table<Catalog, Partial<Catalog>>
      machines: Table<Machine, Partial<Machine>>
    }
    // Empty object types (not `Record<string, never>`) — an index signature here
    // would intersect with every key in Tables above and collapse all Row types to `never`.
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
