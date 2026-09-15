-- Dingli Dealer Connect Portal — initial schema, RLS policies, and storage buckets.
-- Run via: supabase db push  (or paste into the Supabase SQL Editor)

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- PROFILES  (1:1 with auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  dealer_name text,
  company_name text,
  phone text,
  gstin text,
  role text not null default 'dealer' check (role in ('dealer', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, dealer_name, company_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'dealer_name',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used inside RLS policies: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================================
-- PRODUCTS  (price list — shared reference data)
-- ============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text,
  unit text not null default 'Nos',
  price numeric(12, 2) not null default 0,
  image_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- DINGLI STOCK  (central Dingli India stock — shared reference data)
-- ============================================================================
create table if not exists public.dingli_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  warehouse text not null default 'Dingli India - Central',
  quantity integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DEALER STOCK  (per-dealer, private)
-- ============================================================================
create table if not exists public.dealer_stock (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 0,
  location text,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INVOICES  (per-dealer, private)
-- ============================================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  invoice_number text not null,
  fy text not null default 'FY 2025-26',
  invoice_date date not null default current_date,
  amount numeric(12, 2) not null default 0,
  status text not null default 'unpaid' check (status in ('paid', 'unpaid', 'overdue')),
  pdf_path text, -- storage path within the "invoices" bucket
  created_at timestamptz not null default now()
);

-- ============================================================================
-- LEDGER ENTRIES  (per-dealer, private)
-- ============================================================================
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  fy text not null default 'FY 2025-26',
  entry_date date not null default current_date,
  description text not null,
  debit numeric(12, 2) not null default 0,
  credit numeric(12, 2) not null default 0,
  running_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- FEEDBACK  (per-dealer, private; dealer can create + read own)
-- ============================================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'general' check (category in ('general', 'complaint', 'suggestion', 'compliment')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SERVICE REQUESTS  (per-dealer, private; dealer can create + read own)
-- ============================================================================
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  machine_model text not null,
  serial_number text,
  issue_description text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============================================================================
-- CATALOGS  (shared reference data; files live in the "catalogs" storage bucket)
-- ============================================================================
create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  file_path text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.dingli_stock enable row level security;
alter table public.dealer_stock enable row level security;
alter table public.invoices enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.feedback enable row level security;
alter table public.service_requests enable row level security;
alter table public.catalogs enable row level security;

-- profiles: users see/update their own row; admins see all
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- products / dingli_stock / catalogs: read-only reference data for any signed-in dealer
create policy "products_select_authenticated" on public.products
  for select using (auth.role() = 'authenticated');
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "dingli_stock_select_authenticated" on public.dingli_stock
  for select using (auth.role() = 'authenticated');
create policy "dingli_stock_admin_write" on public.dingli_stock
  for all using (public.is_admin()) with check (public.is_admin());

create policy "catalogs_select_authenticated" on public.catalogs
  for select using (auth.role() = 'authenticated');
create policy "catalogs_admin_write" on public.catalogs
  for all using (public.is_admin()) with check (public.is_admin());

-- dealer_stock: dealer sees/manages only their own rows; admin sees all
create policy "dealer_stock_select_own_or_admin" on public.dealer_stock
  for select using (dealer_id = auth.uid() or public.is_admin());
create policy "dealer_stock_admin_write" on public.dealer_stock
  for all using (public.is_admin()) with check (public.is_admin());

-- invoices: dealer reads only their own; only admin/back-office writes
create policy "invoices_select_own_or_admin" on public.invoices
  for select using (dealer_id = auth.uid() or public.is_admin());
create policy "invoices_admin_write" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

-- ledger_entries: dealer reads only their own; only admin/back-office writes
create policy "ledger_select_own_or_admin" on public.ledger_entries
  for select using (dealer_id = auth.uid() or public.is_admin());
create policy "ledger_admin_write" on public.ledger_entries
  for all using (public.is_admin()) with check (public.is_admin());

-- feedback: dealer can insert + read their own; admin sees/manages all
create policy "feedback_select_own_or_admin" on public.feedback
  for select using (dealer_id = auth.uid() or public.is_admin());
create policy "feedback_insert_own" on public.feedback
  for insert with check (dealer_id = auth.uid());
create policy "feedback_admin_update" on public.feedback
  for update using (public.is_admin());

-- service_requests: dealer can insert + read their own; admin sees/manages all
create policy "service_requests_select_own_or_admin" on public.service_requests
  for select using (dealer_id = auth.uid() or public.is_admin());
create policy "service_requests_insert_own" on public.service_requests
  for insert with check (dealer_id = auth.uid());
create policy "service_requests_admin_update" on public.service_requests
  for update using (public.is_admin() or dealer_id = auth.uid());

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('catalogs', 'catalogs', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- catalogs bucket: public read (marketing-style download assets)
create policy "catalogs_bucket_public_read" on storage.objects
  for select using (bucket_id = 'catalogs');
create policy "catalogs_bucket_admin_write" on storage.objects
  for all using (bucket_id = 'catalogs' and public.is_admin())
  with check (bucket_id = 'catalogs' and public.is_admin());

-- invoices bucket: private — dealers can only read files under a path prefixed
-- with their own uid, e.g. "<dealer_id>/invoice-123.pdf"
create policy "invoices_bucket_owner_read" on storage.objects
  for select using (
    bucket_id = 'invoices'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
create policy "invoices_bucket_admin_write" on storage.objects
  for all using (bucket_id = 'invoices' and public.is_admin())
  with check (bucket_id = 'invoices' and public.is_admin());
