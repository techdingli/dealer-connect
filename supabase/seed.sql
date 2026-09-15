-- Optional sample reference data for local development / demos.
-- Safe to run multiple times. Dealer-specific rows (stock, invoices, ledger,
-- feedback, service requests) are intentionally left out — those only make
-- sense once you have real auth users, and are best added through the app.

insert into public.products (sku, name, category, unit, price, description) values
  ('DGL-CR-25T', 'Dingli GTBZ 25T Crawler Crane', 'Cranes', 'Nos', 8500000, 'Heavy-duty crawler crane, 25 ton capacity.'),
  ('DGL-SB-16', 'Dingli SB16 Scissor Lift', 'Aerial Work Platforms', 'Nos', 950000, 'Electric scissor lift, 16m working height.'),
  ('DGL-BT-22', 'Dingli BT22RT Boom Lift', 'Aerial Work Platforms', 'Nos', 3250000, 'Articulating boom lift, 22m working height, rough terrain.'),
  ('DGL-FL-3T', 'Dingli 3T Electric Forklift', 'Material Handling', 'Nos', 1450000, '3 ton capacity electric forklift.'),
  ('DGL-SP-10', 'Spare Parts Kit - Hydraulic Seals', 'Spare Parts', 'Set', 12500, 'Common hydraulic seal replacement kit.')
on conflict (sku) do nothing;

insert into public.dingli_stock (product_id, warehouse, quantity)
select id, 'Dingli India - Pune Central Warehouse', 12
from public.products
on conflict do nothing;

insert into public.catalogs (title, description, category, file_path) values
  ('Dingli 2026 Full Product Catalog', 'Complete range of cranes, aerial platforms, and forklifts.', 'General', 'catalogs/dingli-2026-full-catalog.pdf'),
  ('Aerial Work Platforms Spec Sheet', 'Detailed specifications for scissor and boom lifts.', 'Aerial Work Platforms', 'catalogs/dingli-awp-spec-sheet.pdf')
on conflict do nothing;
