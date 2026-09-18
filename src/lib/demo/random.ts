/**
 * Seeded pseudo-randomness for demo data.
 *
 * Every generator in this folder is seeded from a string (usually the dealer
 * id), so a given dealer sees the *same* numbers on every page load and across
 * refreshes — the data is random across dealers, stable for each one. Without
 * that, stat cards would reshuffle on every navigation and the demo would look
 * broken.
 */

/** cyrb53 — a fast, well-distributed string hash. */
function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** True with probability `p`. */
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** `count` distinct items, or the whole list if it's shorter. */
  sample<T>(items: readonly T[], count: number): T[]
  shuffle<T>(items: readonly T[]): T[]
  /** Rupee amount in [min, max], rounded to `step`. */
  amount(min: number, max: number, step?: number): number
}

export function createRng(seed: string): Rng {
  // mulberry32
  let state = hashSeed(seed) >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    sample: (items, count) => shuffle(items).slice(0, Math.min(count, items.length)),
    shuffle,
    amount: (min, max, step = 1) => Math.round((next() * (max - min) + min) / step) * step,
  }
}

/**
 * yyyy-mm-dd for a Date, read in local time.
 *
 * Not `toISOString().slice(0, 10)`: that converts to UTC first, so in any
 * timezone ahead of it (IST, +5:30) a local midnight lands on the *previous*
 * calendar day — which silently shifted every generated invoice date back by
 * one, and pushed the FY opening balance into the prior financial year.
 */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Full ISO timestamp `daysAgo` days before `from`. */
export function isoTimestampDaysAgo(daysAgo: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}
