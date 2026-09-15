-- Machine catalog + manual text for the Support chatbot's model picker and
-- manual-lookup Q&A. Shared reference data, same visibility pattern as
-- products/catalogs: readable by any signed-in dealer, admin-only writes.

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  model_name text not null unique,
  category text not null,
  manual_text text,
  manual_source text,
  created_at timestamptz not null default now()
);

create index if not exists machines_category_idx on public.machines (category);

alter table public.machines enable row level security;

create policy "machines_select_authenticated" on public.machines
  for select using (auth.role() = 'authenticated');

create policy "machines_admin_write" on public.machines
  for all using (public.is_admin()) with check (public.is_admin());
