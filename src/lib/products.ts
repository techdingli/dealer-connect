import type { Product } from '@/types/database'

/**
 * Model number and vehicle type are shown as their own sortable/filterable
 * columns on the stock pages, but the live `products` table has no column for
 * either yet. Both are read through these helpers so the columns still work
 * against real data: the explicit field wins when present, otherwise a value
 * is derived from what the row does carry.
 */

/** "DGL-JCPT0607" → "JCPT0607". */
export function modelNumberOf(product: Product | undefined | null): string {
  if (!product) return ''
  if (product.model_number) return product.model_number
  return product.sku.replace(/^DGL-(SP-)?/, '')
}

const CATEGORY_VEHICLE_TYPE: Record<string, string> = {
  'Scissor Lifts': 'Electric',
  'Rough Terrain Scissors': 'Diesel 4WD',
  'Articulating Booms': 'Diesel',
  'Telescopic Booms': 'Diesel 4WD',
  'Vertical Mast Lifts': 'Electric',
  'Spare Parts': 'Spare Part',
}

export function vehicleTypeOf(product: Product | undefined | null): string {
  if (!product) return ''
  if (product.vehicle_type) return product.vehicle_type
  if (!product.category) return ''
  return CATEGORY_VEHICLE_TYPE[product.category] ?? ''
}
