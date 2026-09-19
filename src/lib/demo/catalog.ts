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
  model: string
  name: string
  category: string
  vehicleType: string
  /** Working height in metres — drives the assistant's "what reaches 12 m?" answers. */
  workingHeight: number | null
  /** Where the machine is designed to be used, for the same reason. */
  terrain: 'Indoor' | 'Outdoor' | 'Indoor / Outdoor' | null
  price: number
  unit: string
  description: string
}

const PRODUCT_SEEDS: ProductSeed[] = [
  // Electric slab scissor lifts
  { sku: 'DGL-JCPT0607', model: 'JCPT0607', name: 'JCPT0607 Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 7.8, terrain: 'Indoor', price: 750000, unit: 'unit', description: '5.8 m platform height, 230 kg capacity, compact indoor slab scissor.' },
  { sku: 'DGL-JCPT0807', model: 'JCPT0807HD', name: 'JCPT0807HD Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 9.8, terrain: 'Indoor', price: 860000, unit: 'unit', description: '7.8 m platform height, 320 kg capacity, roll-out deck extension.' },
  { sku: 'DGL-JCPT1008', model: 'JCPT1008HD', name: 'JCPT1008HD Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 12, terrain: 'Indoor', price: 1050000, unit: 'unit', description: '10 m platform height, 320 kg capacity, AC drive.' },
  { sku: 'DGL-JCPT1212', model: 'JCPT1212HD', name: 'JCPT1212HD Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 13.8, terrain: 'Indoor', price: 1480000, unit: 'unit', description: '11.8 m platform height, 320 kg capacity, heavy-duty chassis.' },
  { sku: 'DGL-JCPT1418', model: 'JCPT1418HD', name: 'JCPT1418HD Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 15.8, terrain: 'Indoor', price: 1950000, unit: 'unit', description: '13.8 m platform height, 350 kg capacity, wide deck.' },
  { sku: 'DGL-JCPT1623', model: 'JCPT1623HD', name: 'JCPT1623HD Electric Scissor Lift', category: 'Scissor Lifts', vehicleType: 'Electric', workingHeight: 17.7, terrain: 'Indoor', price: 2600000, unit: 'unit', description: '15.7 m platform height, 350 kg capacity, tallest electric slab model.' },

  // Rough terrain scissor lifts
  { sku: 'DGL-JCPT1518RT', model: 'JCPT1518RT', name: 'JCPT1518RT Rough Terrain Scissor', category: 'Rough Terrain Scissors', vehicleType: 'Diesel 4WD', workingHeight: 16.7, terrain: 'Outdoor', price: 3200000, unit: 'unit', description: '14.7 m platform height, 4WD diesel, hydraulic outriggers.' },
  { sku: 'DGL-JCPT2023RT', model: 'JCPT2023RT', name: 'JCPT2023RT Rough Terrain Scissor', category: 'Rough Terrain Scissors', vehicleType: 'Diesel 4WD', workingHeight: 22, terrain: 'Outdoor', price: 4200000, unit: 'unit', description: '20 m platform height, 4WD diesel, auto-levelling outriggers.' },

  // Articulating boom lifts
  { sku: 'DGL-GTBZ14A', model: 'GTBZ14A', name: 'GTBZ14A Articulating Boom Lift', category: 'Articulating Booms', vehicleType: 'Electric', workingHeight: 14, terrain: 'Indoor / Outdoor', price: 3800000, unit: 'unit', description: '14 m working height, electric drive, jib boom, 230 kg basket.' },
  { sku: 'DGL-GTBZ16A', model: 'GTBZ16A', name: 'GTBZ16A Articulating Boom Lift', category: 'Articulating Booms', vehicleType: 'Diesel 4WD', workingHeight: 16, terrain: 'Outdoor', price: 4400000, unit: 'unit', description: '16 m working height, 4WD, up-and-over clearance.' },
  { sku: 'DGL-GTBZ20A', model: 'GTBZ20A', name: 'GTBZ20A Articulating Boom Lift', category: 'Articulating Booms', vehicleType: 'Diesel', workingHeight: 20, terrain: 'Outdoor', price: 5800000, unit: 'unit', description: '20 m working height, diesel, oscillating axle.' },
  { sku: 'DGL-GTBZ22A', model: 'GTBZ22A', name: 'GTBZ22A Articulating Boom Lift', category: 'Articulating Booms', vehicleType: 'Diesel 4WD', workingHeight: 22, terrain: 'Outdoor', price: 6600000, unit: 'unit', description: '22 m working height, 4WD diesel, 2-section jib.' },

  // Telescopic boom lifts
  { sku: 'DGL-GTBZ18S', model: 'GTBZ18S', name: 'GTBZ18S Telescopic Boom Lift', category: 'Telescopic Booms', vehicleType: 'Diesel 4WD', workingHeight: 18, terrain: 'Outdoor', price: 5200000, unit: 'unit', description: '18 m working height, 15.5 m horizontal outreach.' },
  { sku: 'DGL-GTBZ22S', model: 'GTBZ22S', name: 'GTBZ22S Telescopic Boom Lift', category: 'Telescopic Booms', vehicleType: 'Diesel 4WD', workingHeight: 22, terrain: 'Outdoor', price: 6400000, unit: 'unit', description: '22 m working height, 4WD diesel, 300 kg basket.' },
  { sku: 'DGL-GTBZ26S', model: 'GTBZ26S', name: 'GTBZ26S Telescopic Boom Lift', category: 'Telescopic Booms', vehicleType: 'Diesel 4WD', workingHeight: 26, terrain: 'Outdoor', price: 7800000, unit: 'unit', description: '26 m working height, foam-filled tyres, oscillating axle.' },

  // Vertical mast lifts
  { sku: 'DGL-AMWP55', model: 'AMWP5.5-1000', name: 'AMWP5.5-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', vehicleType: 'Electric', workingHeight: 7.5, terrain: 'Indoor', price: 420000, unit: 'unit', description: '5.5 m platform height, 136 kg capacity, push-around mast.' },
  { sku: 'DGL-AMWP80', model: 'AMWP8-1000', name: 'AMWP8-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', vehicleType: 'Electric', workingHeight: 10, terrain: 'Indoor', price: 580000, unit: 'unit', description: '8 m platform height, 136 kg capacity, self-propelled.' },
  { sku: 'DGL-AMWP100', model: 'AMWP10-1000', name: 'AMWP10-1000 Vertical Mast Lift', category: 'Vertical Mast Lifts', vehicleType: 'Electric', workingHeight: 12, terrain: 'Indoor', price: 710000, unit: 'unit', description: '10 m platform height, 136 kg capacity, narrow aisle chassis.' },

  // Spares & accessories
  { sku: 'DGL-SP-BAT48', model: 'BAT48-240', name: 'Traction Battery Pack 48V / 240Ah', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 148000, unit: 'set', description: 'Replacement deep-cycle pack for JCPT electric scissor range.' },
  { sku: 'DGL-SP-HYD22', model: 'HPU-22MPA', name: 'Hydraulic Power Unit (22 MPa)', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 62000, unit: 'unit', description: 'Pump and motor assembly, fits JCPT10xx–14xx.' },
  { sku: 'DGL-SP-ECU07', model: 'PCM-07', name: 'Platform Control Module', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 38000, unit: 'unit', description: 'CAN-bus platform controller with joystick harness.' },
  { sku: 'DGL-SP-RAIL', model: 'GRK-23', name: 'Guardrail & Toe-board Kit', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 14500, unit: 'set', description: 'Folding guardrail set for standard 2.3 m platform.' },
  { sku: 'DGL-SP-CHG24', model: 'CHG-24-30', name: 'On-board Charger 24V / 30A', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 22000, unit: 'unit', description: 'Sealed on-board charger with automatic cut-off.' },
  { sku: 'DGL-SP-TYRE', model: 'TYR-NM4', name: 'Non-marking Tyre Set (4)', category: 'Spare Parts', vehicleType: 'Spare Part', workingHeight: null, terrain: null, price: 31000, unit: 'set', description: 'Solid non-marking tyres for indoor slab scissor lifts.' },
]

/** Dingli India's own network — a named facility plus the city it sits in. */
export const DEMO_WAREHOUSES = [
  { name: 'Pune (HO)', city: 'Pune' },
  { name: 'Chennai Depot', city: 'Chennai' },
  { name: 'Delhi NCR Hub', city: 'Gurugram' },
  { name: 'Ahmedabad Depot', city: 'Ahmedabad' },
  { name: 'Bengaluru Depot', city: 'Bengaluru' },
  { name: 'Kolkata Depot', city: 'Kolkata' },
] as const

const CATALOG_SEED = 'dingli-demo-reference-v1'

export const DEMO_PRODUCTS: Product[] = PRODUCT_SEEDS.map((seed, i) => ({
  id: `demo-product-${i + 1}`,
  sku: seed.sku,
  name: seed.name,
  category: seed.category,
  model_number: seed.model,
  vehicle_type: seed.vehicleType,
  unit: seed.unit,
  price: seed.price,
  image_url: null,
  description: seed.description,
  is_active: true,
  created_at: isoTimestampDaysAgo(365 - i),
}))

/** Spec lookup for the product assistant, keyed by SKU. */
export const DEMO_PRODUCT_SPECS = new Map(
  PRODUCT_SEEDS.map((seed) => [
    seed.sku,
    { workingHeight: seed.workingHeight, terrain: seed.terrain, model: seed.model },
  ]),
)

export const DEMO_DINGLI_STOCK: DingliStock[] = (() => {
  const rng = createRng(`${CATALOG_SEED}:dingli-stock`)
  const rows: DingliStock[] = []

  for (const product of DEMO_PRODUCTS) {
    const isSpare = product.category === 'Spare Parts'
    // Spares live in every warehouse; machines only sit in three or four.
    const warehouses = isSpare
      ? [...DEMO_WAREHOUSES]
      : rng.sample(DEMO_WAREHOUSES, rng.int(3, 4))

    for (const warehouse of warehouses) {
      rows.push({
        id: `demo-dingli-stock-${product.id}-${warehouse.name.replace(/\W+/g, '-').toLowerCase()}`,
        product_id: product.id,
        warehouse: warehouse.name,
        location: warehouse.city,
        // A handful of machine lines deliberately read as out of stock so the
        // "Out of stock" badge and the filters have something to show.
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

/**
 * Models with a service manual on file. Only these are offered in the support
 * chat's model picker — the rest would dead-end, exactly as the live query's
 * `manual_text is not null` filter ensures.
 */
const MODELS_WITH_MANUALS = new Set([
  'JCPT0807HD',
  'JCPT1008HD',
  'JCPT1212HD',
  'JCPT1418HD',
  'JCPT1518RT',
  'GTBZ14A',
  'GTBZ20A',
  'GTBZ22S',
  'AMWP8-1000',
])

/**
 * A stand-in service manual, written to the same "N-N Heading" section
 * convention the real manuals use — so splitManualIntoSections in api/chat.ts
 * and the in-app reader parse these exactly as they parse the live ones.
 */
function buildManualText(seed: ProductSeed): string {
  const electric = seed.vehicleType === 'Electric'
  const height = seed.workingHeight ?? 0

  return `${seed.name} — Service and Maintenance Manual

1-1 Intended Use
The ${seed.model} is an aerial work platform rated to ${height} m working height, intended for ${(seed.terrain ?? 'general').toLowerCase()} use. It is designed to raise personnel, tools and materials to a work position. Do not use it as a crane, a hoist, a jack or a support for any structure. Do not tow it on a public road. Any modification to the chassis, platform or control system voids the machine's declaration of conformity.

1-2 Operator Requirements
Only trained and authorised operators may use this machine. The operator must complete a familiarisation on this model, hold a valid operator card where local regulation requires one, and read this manual and the decals on the machine before first use. A harness with a short lanyard must be attached to the designated anchor point at all times on boom-type machines.

2-1 Specifications
Model: ${seed.model}. Working height: ${height} m. Drive: ${seed.vehicleType}. Category: ${seed.category}. Designed for: ${seed.terrain ?? 'general use'}. Refer to the serial plate on the chassis for the exact rated platform capacity, gross machine weight and maximum allowable inclination, which vary by build year.

2-2 Platform and Capacity
Never exceed the rated capacity shown on the platform decal. The rating includes the operator, tools and all materials. Distribute load evenly; a point load at the extreme edge of an extended deck can exceed the local limit even when the total is within rating. Guardrails must be in place and the gate latched before elevating.

3-1 Daily Pre-Use Inspection
Before every shift, with the platform lowered: check for hydraulic leaks at hoses, fittings and cylinder rods; check tyre condition and wheel nut torque; check that all decals are present and legible; test the emergency stop at both ground and platform stations; test the horn and any beacon; confirm the guardrails and gate are sound; and function-test lift and drive through their full range with no load.

3-2 Service Intervals
Pre-use inspection before every shift. A 250-hour service covering filter replacement, fluid level checks and a full function test. A 500-hour service adding a hydraulic oil change and a detailed structural inspection. An annual thorough examination by a competent person, recorded in the machine's log. Keep the log with the machine.

4-1 ${electric ? 'Battery and Charging' : 'Engine and Fuel System'}
${
  electric
    ? 'Charge only with the on-board charger supplied, on level ground with the platform fully lowered and the machine switched off. A full cycle from discharged takes 8 to 10 hours. Repeatedly interrupting a charge cycle shortens pack life significantly. On flooded packs, check electrolyte level monthly and top up with distilled water only after charging, never before. Clean terminal corrosion with a bicarbonate solution and re-grease the terminals.'
    : 'Check engine oil and coolant daily with the machine on level ground and the engine cold. Use only the fuel grade specified on the filler decal. Replace the fuel filter at each 250-hour service and bleed the system afterwards. Do not run the tank to empty; drawing air into the injection system requires a full bleed to recover. Keep the radiator core clear of site debris.'
}

4-2 Hydraulic System
Check the hydraulic reservoir level with the platform fully lowered — reading it with the platform raised gives a false low and leads to overfilling. A light film of oil on a cylinder rod is normal and is what lubricates the seal; running drips or a pooling leak mean the rod seal kit is due. Use only the hydraulic oil grade listed on the reservoir decal. After any hose replacement, cycle the machine through its full range three times with no load to purge air.

5-1 Tilt Sensor, Fault Codes and Interlocks
A tilt fault reported on visibly level ground is usually the sensor itself or a loose mounting bracket rather than the chassis. Recalibrate on a surface confirmed level with a spirit level; if the fault returns after a successful recalibration, replace the sensor. Drive speed is limited above the interlock height by design, and on some builds drive is cut entirely — this is not a fault. Check the platform height limit switch before investigating the drive motor.

5-2 Emergency Lowering
The emergency lowering valve is at the base of the lift cylinder and is marked with a red decal. Pull and hold to descend. It should operate under firm hand pressure. If it needs excessive force, the valve requires servicing — never lever it or extend the handle. Ensure the area beneath the platform is clear before operating it, and brief ground personnel on its location before every shift.

6-1 Common Faults and Remedies
Platform will not elevate: check the emergency stops are released, the battery or fuel state, and that the machine is within its allowable inclination. Machine creeps with the joystick centred: the joystick needs recalibration or the drive valve is sticking. Platform descends slowly under load: suspect a worn cylinder seal or a partially blocked return filter. Charger will not start a cycle: confirm mains supply, then check the interlock that prevents charging with the platform raised.`
}

export const DEMO_MACHINES: Machine[] = PRODUCT_SEEDS.filter((seed) =>
  MODELS_WITH_MANUALS.has(seed.model),
).map((seed, i) => ({
  id: `demo-machine-${i + 1}`,
  model_name: seed.model,
  category: seed.category,
  manual_text: buildManualText(seed),
  manual_source: 'demo',
  created_at: isoTimestampDaysAgo(300),
}))
