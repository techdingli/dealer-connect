-- Line-item breakdown for invoices, powering the "View Details" panel in
-- Invoice History (product/description, quantity, unit price, line total).

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

alter table public.invoice_items enable row level security;

-- Same visibility rule as invoices themselves: a dealer sees line items only
-- for their own invoices (checked via a join back to invoices), admins see all.
create policy "invoice_items_select_own_or_admin" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (i.dealer_id = auth.uid() or public.is_admin())
    )
  );

create policy "invoice_items_admin_write" on public.invoice_items
  for all using (public.is_admin()) with check (public.is_admin());
