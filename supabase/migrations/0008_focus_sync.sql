-- Focus -> Supabase sync (see api/focus-sync.ts).
--
-- Adds the GSTIN-keyed invoice tables the sync fills, Focus ids on products
-- and Dingli stock, a run log, and the security-definer functions the sync
-- calls with the service-role key. dealer_ledger and dealer_directory were
-- created by earlier migrations (0005-0007) that live outside this repo, so
-- this file only adds to them and never assumes more than the columns the
-- app already reads.
--
-- Focus-derived rows are keyed by GSTIN, not dealer_id: they exist before a
-- dealer signs up, and RLS matches them to profiles.gstin.

-- ---------------------------------------------------------------------------
-- Profiles: a dealer must not be able to change their own GSTIN or role.
-- profiles_update_own (0001) lets a user update any column of their row, which
-- would let them point profiles.gstin at another dealer's ledger, or make
-- themselves admin. Admins, the service role and SQL run without a JWT (the
-- dashboard) can still change both.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.gstin := old.gstin;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- The GSTIN on the signed-in user's profile, normalised like the sync's.
create or replace function public.current_gstin()
returns text
language sql
stable
security definer set search_path = public
as $$
  select nullif(upper(trim(gstin)), '') from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Dealer directory / ledger (existing tables): sync bookkeeping columns.
-- ---------------------------------------------------------------------------
alter table public.dealer_directory add column if not exists focus_account_ids integer[];
alter table public.dealer_directory add column if not exists focus_synced_at timestamptz;

-- ---------------------------------------------------------------------------
-- Invoices from Focus
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_invoices (
  focus_header_id integer primary key,
  gstin text not null,
  invoice_number text not null,
  voucher_type text,
  fy text,
  invoice_date date,
  amount numeric(14, 2) not null default 0,
  -- Bill-wise balance still owed; null when Focus has no bill reference.
  outstanding numeric(14, 2),
  due_date date,
  status text check (status in ('paid', 'unpaid', 'overdue')),
  synced_at timestamptz not null default now()
);
create index if not exists dealer_invoices_gstin_idx on public.dealer_invoices (gstin);

create table if not exists public.dealer_invoice_items (
  body_id integer primary key,
  focus_header_id integer not null references public.dealer_invoices (focus_header_id) on delete cascade,
  gstin text not null,
  focus_product_id integer,
  sku text,
  description text not null,
  quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  synced_at timestamptz not null default now()
);
create index if not exists dealer_invoice_items_header_idx on public.dealer_invoice_items (focus_header_id);
create index if not exists dealer_invoice_items_gstin_idx on public.dealer_invoice_items (gstin);

alter table public.dealer_invoices enable row level security;
alter table public.dealer_invoice_items enable row level security;

drop policy if exists "dealer_invoices_select_own_or_admin" on public.dealer_invoices;
create policy "dealer_invoices_select_own_or_admin" on public.dealer_invoices
  for select using (gstin = public.current_gstin() or public.is_admin());

drop policy if exists "dealer_invoice_items_select_own_or_admin" on public.dealer_invoice_items;
create policy "dealer_invoice_items_select_own_or_admin" on public.dealer_invoice_items
  for select using (gstin = public.current_gstin() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Products / Dingli stock: Focus ids, and room for data UAT doesn't carry.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists focus_product_id integer;
create unique index if not exists products_focus_product_id_key on public.products (focus_product_id);
-- Focus UAT has no selling prices; a synced product's price stays null and the
-- UI says so instead of showing ₹0.
alter table public.products alter column price drop not null;

alter table public.dingli_stock add column if not exists location text;
alter table public.dingli_stock add column if not exists focus_product_id integer;
alter table public.dingli_stock add column if not exists focus_warehouse_id integer;

-- ---------------------------------------------------------------------------
-- Run log
-- ---------------------------------------------------------------------------
create table if not exists public.focus_sync_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  ms integer,
  summary jsonb,
  error text
);
alter table public.focus_sync_runs enable row level security;
drop policy if exists "focus_sync_runs_admin_select" on public.focus_sync_runs;
create policy "focus_sync_runs_admin_select" on public.focus_sync_runs
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Sync functions (service role only). Each replaces one slice atomically.
-- ---------------------------------------------------------------------------

-- One dealer: ledger, invoices and invoice lines for p_gstin.
create or replace function public.focus_sync_dealer(
  p_gstin text,
  p_company_name text,
  p_account_ids integer[],
  p_ledger jsonb,
  p_invoices jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.dealer_ledger where upper(trim(gstin)) = p_gstin;
  -- A line between two synced dealers belongs to both; the first one keeps it.
  insert into public.dealer_ledger
    (body_id, gstin, focus_account_id, entry_date, voucher_no, voucher_type, description, debit, credit, synced_at)
  select x.body_id, p_gstin, x.focus_account_id, x.entry_date, x.voucher_no, x.voucher_type,
         x.description, x.debit, x.credit, now()
    from jsonb_to_recordset(p_ledger) as x(
      body_id integer, focus_account_id integer, entry_date date, voucher_no text,
      voucher_type text, description text, debit numeric, credit numeric)
  on conflict do nothing;

  delete from public.dealer_invoices where gstin = p_gstin; -- cascades to lines
  insert into public.dealer_invoices
    (focus_header_id, gstin, invoice_number, voucher_type, fy, invoice_date, amount, outstanding, due_date, status, synced_at)
  select x.focus_header_id, p_gstin, x.invoice_number, x.voucher_type, x.fy, x.invoice_date,
         x.amount, x.outstanding, x.due_date, x.status, now()
    from jsonb_to_recordset(p_invoices) as x(
      focus_header_id integer, invoice_number text, voucher_type text, fy text, invoice_date date,
      amount numeric, outstanding numeric, due_date date, status text)
  on conflict do nothing;

  insert into public.dealer_invoice_items
    (body_id, focus_header_id, gstin, focus_product_id, sku, description, quantity, unit_price, line_total, synced_at)
  select x.body_id, x.focus_header_id, p_gstin, x.focus_product_id, x.sku, x.description,
         x.quantity, x.unit_price, x.line_total, now()
    from jsonb_to_recordset(p_items) as x(
      body_id integer, focus_header_id integer, focus_product_id integer, sku text,
      description text, quantity numeric, unit_price numeric, line_total numeric)
   where exists (select 1 from public.dealer_invoices i
                  where i.focus_header_id = x.focus_header_id and i.gstin = p_gstin)
  on conflict do nothing;

  update public.dealer_directory
     set focus_account_ids = p_account_ids, focus_synced_at = now()
   where upper(trim(gstin)) = p_gstin;
end;
$$;

-- A batch of catalogue products, upserted by SKU. A price already on a row
-- (entered by hand) is kept; new Focus rows get none.
create or replace function public.focus_upsert_products(p_products jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.products (sku, name, category, unit, price, description, is_active, focus_product_id)
  select x.sku, x.name, x.category, coalesce(x.unit, 'Nos'), null, x.description, true, x.focus_product_id
    from jsonb_to_recordset(p_products) as x(
      sku text, name text, category text, unit text, description text, focus_product_id integer)
  on conflict (sku) do update
    set name = excluded.name,
        category = excluded.category,
        unit = excluded.unit,
        description = coalesce(excluded.description, public.products.description),
        focus_product_id = excluded.focus_product_id,
        is_active = true;
end;
$$;

-- Retire Focus products that left the catalogue and replace Dingli stock.
create or replace function public.focus_replace_stock(p_active_product_ids integer[], p_stock jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.products
     set is_active = false
   where focus_product_id is not null
     and not (focus_product_id = any (p_active_product_ids));

  delete from public.dingli_stock where focus_warehouse_id is not null;
  insert into public.dingli_stock
    (product_id, warehouse, location, quantity, focus_product_id, focus_warehouse_id, updated_at)
  select p.id, x.warehouse, null, x.quantity, x.focus_product_id, x.focus_warehouse_id, now()
    from jsonb_to_recordset(p_stock) as x(
      focus_product_id integer, focus_warehouse_id integer, warehouse text, quantity integer)
    join public.products p on p.focus_product_id = x.focus_product_id;
end;
$$;

revoke all on function public.focus_sync_dealer(text, text, integer[], jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.focus_upsert_products(jsonb) from public, anon, authenticated;
revoke all on function public.focus_replace_stock(integer[], jsonb) from public, anon, authenticated;
grant execute on function public.focus_sync_dealer(text, text, integer[], jsonb, jsonb, jsonb) to service_role;
grant execute on function public.focus_upsert_products(jsonb) to service_role;
grant execute on function public.focus_replace_stock(integer[], jsonb) to service_role;
