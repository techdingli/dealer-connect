import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrencyINR(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

/** Whole rupees, no paise — for stat tiles, where ".00" costs three characters
 *  of width and tells the reader nothing. Tables keep the full precision. */
export function formatCurrencyShortINR(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Financial year label like "FY 2025-26" for a given ISO date string. India's FY runs Apr 1 - Mar 31. */
export function financialYearOf(dateStr: string) {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const isAfterApril = d.getMonth() >= 3 // 0-indexed: 3 = April
  const startYear = isAfterApril ? year : year - 1
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export const CURRENT_FY = 'FY 2025-26'
