import type { Catalog, DingliStock, Machine, Product } from '@/types/database'
import { createRng, isoTimestampDaysAgo } from '@/lib/demo/random'

/**
 * Shared reference data for demo mode — the same for every dealer, the way the
 * real `products` / `dingli_stock` / `catalogs` / `machines` tables are.
 *
 * Model names and categories come from Dingli's public product range; the
 * prices, quantities and dates are generated, not real commercial terms.
 */

interface ProductSeed {
  sku: string
  name: string
  category: string
  price: number
  unit: string
  description: string
}

const PRODUCT_SEEDS: ProductSeed[] = [
  // Electric slab scissor lifts
  { sku: 'DGL-JCPT0607', name: 'JCPT0607 Electric Scissor Lift', category: 'Scissor Lifts', price: 750000, unit: 'unit', description: '5.8 m platform height, 230 kg capacity, compact indoor slab scissor.' },
  { sku: 'DGL-JCPT0807', name: 'JCPT0807HD Electric Scissor Lift', category: 'Scissor Lifts', price: 860000, unit: 'unit', description: '7.8 m platform height, 320 kg capacity, roll-out deck extension.' },
  { sku: 'DGL-JCPT1008', name: 'JCPT1008HD Electric Scissor Lift', category: 'Scissor Lifts', price: 1050000, unit: 'unit', description: '10 m platform height, 320 kg capacity, AC drive.' },
  { sku: 'DGL-JCPT1212', name: 'JCPT1212HD Electric Scissor Lift', category: 'Scissor Lifts', price: 1480000, unit: 'unit', description: '11.8 m platform height, 320 kg capacity, heavy-duty chassis.' },
  { sku: 'DGL-JCPT1418', name: 'JCPT1418HD Electric Scissor Lift', category: 'Scissor Lifts', price: 1950000, unit: 'unit', description: '13.8 m platform height, 350 kg capacity, wide deck.' },
  { sku: 'DGL-JCPT1623', name: 'JCPT1623HD Electric Scissor Lift', category: 'Scissor Lifts', price: 2600000, unit: 'unit', description: '15.7 m platform height, 350 kg capacity, tallest electric slab model.' },

  // Rough terrain scissor lifts
  { sku: 'DGL-JCPT1518RT', name: 'JCPT1518RT Rough Terrain Scissor', category: 'Rough Terrain Scissors', price: 3200000, unit: 'unit', description: '14.7 m platform height, 4WD diesel, hydraulic outriggers.' },
  { sku: 'DGL-JCPT2023RT', name: 'JCPT2023RT Rough Terrain Scissor', category: 'Rough Terrain Scissors', price: 4200000, unit: 'unit', description: '20 m platform height, 4WD diesel, auto-levelling outriggers.' },

  // Articulating boom lifts
  { sku: 'DGL-GTBZ14A', name: 'GTBZ14A Articulating Boom Lift', category: 'Articulating Booms', price: 3800000, unit: 'unit', description: '14 m working height, electric drive, jib boom, 230 kg basket.' },
  { sku: 'DGL-GTBZ16A', name: 'GTBZ16A Articulating Boom Lift', category: 'Articulating Booms', price: 4400000, unit: 'unit', description: '16 m working height, 4WD, up-and-over clearance.' },
  { sku: 'DGL-GTBZ20A', name: 'GTBZ20A Articulating Boom Lift', category: 'Articulating Booms', price: 5800000, unit: 'unit', description: '20 m working height, diesel, oscillating axle.' },
  { sku: 'DGL-GTBZ22A', name: 'GTBZ22A Articulating Boom Lift', category: 'Articulating Booms', price: 6600000, unit: 'unit', description: '22 m working height, 4WD diesel, 2-section jib.' },

  // Telescopic boom lifts
  { sku: 'DGL-GTBZ18S', name: 'GTBZ18S Telescopic Boom Lift', category: 'Telescopic Booms', price: 5200000, unit: 'unit', description: '18 m working height, 15.5 m horizontal outreach.' },
  { sku: 'DGL-GTBZ22S', name: 'GTBZ22S Telescopic Boom Lift', category: 'Telescopic Booms', price: 6400000, unit: 'unit', description: '22 m working height, 4WD diesel, 300 kg basket.' },
  { sku: 'DGL-GTBZ26S', name: 'GTBZ26S Telescopic Boom Lift', category: 'Telescopic Booms', price: 7800000, unit: 'unit', description: '26 m working height, foam-filled tyres, oscillating axle.' },

  // Vertical mast lifts
  { sku: 'DGL-AMWP55', name: 'AMWP5.5-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', price: 420000, unit: 'unit', description: '5.5 m platform height, 136 kg capacity, push-around mast.' },
  { sku: 'DGL-AMWP80', name: 'AMWP8-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', price: 580000, unit: 'unit', description: '8 m platform height, 136 kg capacity, self-propelled.' },
  { sku: 'DGL-AMWP100', name: 'AMWP10-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', price: 710000, unit: 'unit', description: '10 m platform height, 136 kg capacity, narrow aisle chassis.' },

  // Spares & accessories
  { sku: 'DGL-SP-BAT48', name: 'Traction Battery Pack 48V / 240Ah', category: 'Spare Parts', price: 148000, unit: 'set', description: 'Replacement deep-cycle pack for JCPT electric scissor range.' },
  { sku: 'DGL-SP-HYD22', name: 'Hydraulic Power Unit (22 MPa)', category: 'Spare Parts', price: 62000, unit: 'unit', description: 'Pump and motor assembly, fits JCPT10xx–14xx.' },
  { sku: 'DGL-SP-ECU07', name: 'Platform Control Module', category: 'Spare Parts', price: 38000, unit: 'unit', description: 'CAN-bus platform controller with joystick harness.' },
  { sku: 'DGL-SP-RAIL', name: 'Guardrail & Toe-board Kit', category: 'Spare Parts', price: 14500, unit: 'set', description: 'Folding guardrail set for standard 2.3 m platform.' },
  { sku: 'DGL-SP-CHG24', name: 'On-board Charger 24V / 30A', category: 'Spare Parts', price: 22000, unit: 'unit', description: 'Sealed on-board charger with automatic cut-off.' },
  { sku: 'DGL-SP-TYRE', name: 'Non-marking Tyre Set (4)', category: 'Spare Parts', price: 31000, unit: 'set', description: 'Solid non-marking tyres for indoor slab scissor lifts.' },
]

export const DEMO_WAREHOUSES = ['Pune (HO)', 'Chennai', 'Delhi NCR', 'Ahmedabad'] as const

/** Reference data is seeded off a constant so it's identical for every dealer. */
const CATALOG_SEED = 'dingli-demo-reference-v1'

export const DEMO_PRODUCTS: Product[] = PRODUCT_SEEDS.map((seed, i) => ({
  id: `demo-product-${i + 1}`,
  sku: seed.sku,
  name: seed.name,
  category: seed.category,
  unit: seed.unit,
  price: seed.price,
  image_url: null,
  description: seed.description,
  is_active: true,
  created_at: isoTimestampDaysAgo(365 - i),
}))

export const DEMO_DINGLI_STOCK: DingliStock[] = (() => {
  const rng = createRng(`${CATALOG_SEED}:dingli-stock`)
  const rows: DingliStock[] = []

  for (const product of DEMO_PRODUCTS) {
    const isSpare = product.category === 'Spare Parts'
    // Spares live in every warehouse; machines only sit in two or three.
    const warehouses = isSpare
      ? [...DEMO_WAREHOUSES]
      : rng.sample(DEMO_WAREHOUSES, rng.int(2, 3))

    for (const warehouse of warehouses) {
      rows.push({
        id: `demo-dingli-stock-${product.id}-${warehouse.replace(/\W+/g, '-').toLowerCase()}`,
        product_id: product.id,
        warehouse,
        // A handful of machine lines deliberately read as out of stock so the
        // "Out of stock" badge and warehouse filter have something to show.
        quantity: isSpare ? rng.int(8, 60) : rng.chance(0.15) ? 0 : rng.int(1, 9),
        updated_at: isoTimestampDaysAgo(rng.int(0, 21)),
        product,
      })
    }
  }

  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
})()

export const DEMO_CATALOGS: Catalog[] = [
  {
    id: 'demo-catalog-1',
    title: 'Dingli Full Product Range 2026',
    description: 'Every scissor lift, boom lift and mast lift in the India line-up, with specifications.',
    category: 'Master Catalog',
    file_path: 'demo/dingli-full-range-2026.pdf',
    file_size: 18_874_368,
    created_at: isoTimestampDaysAgo(24),
  },
  {
    id: 'demo-catalog-2',
    title: 'JCPT Electric Scissor Lift Series',
    description: 'Slab scissor range from 6 m to 16 m — dimensions, capacities and duty cycles.',
    category: 'Scissor Lifts',
    file_path: 'demo/jcpt-scissor-series.pdf',
    file_size: 6_291_456,
    created_at: isoTimestampDaysAgo(52),
  },
  {
    id: 'demo-catalog-3',
    title: 'GTBZ Boom Lift Series',
    description: 'Articulating and telescopic booms, working envelopes and terrain ratings.',
    category: 'Boom Lifts',
    file_path: 'demo/gtbz-boom-series.pdf',
    file_size: 7_864_320,
    created_at: isoTimestampDaysAgo(76),
  },
  {
    id: 'demo-catalog-4',
    title: 'AMWP Vertical Mast Lift Series',
    description: 'Push-around and self-propelled mast lifts for indoor maintenance work.',
    category: 'Mast Lifts',
    file_path: 'demo/amwp-mast-series.pdf',
    file_size: 3_670_016,
    created_at: isoTimestampDaysAgo(98),
  },
  {
    id: 'demo-catalog-5',
    title: 'Spare Parts & Consumables Guide',
    description: 'Part numbers, compatibility matrix and recommended stocking levels.',
    category: 'Service',
    file_path: 'demo/spare-parts-guide.pdf',
    file_size: 4_194_304,
    created_at: isoTimestampDaysAgo(131),
  },
  {
    id: 'demo-catalog-6',
    title: 'Operator Safety & Pre-use Inspection',
    description: 'Daily inspection checklist and operator safety briefing, ready to hand to a customer.',
    category: 'Safety',
    file_path: 'demo/operator-safety.pdf',
    file_size: 1_572_864,
    created_at: isoTimestampDaysAgo(160),
  },
]

/** Models the in-app assistant offers for manual questions. */
export const DEMO_MACHINES: Machine[] = DEMO_PRODUCTS.filter((p) => p.category !== 'Spare Parts').map(
  (product, i) => ({
    id: `demo-machine-${i + 1}`,
    model_name: product.name.replace(/ (Electric Scissor Lift|Rough Terrain Scissor|Articulating Boom Lift|Telescopic Boom Lift|Vertical Mast Lift)$/, ''),
    category: product.category ?? 'Machines',
    manual_text: `${product.name} — demo manual placeholder. ${product.description}`,
    manual_source: 'demo',
    created_at: isoTimestampDaysAgo(300),
  }),
)
