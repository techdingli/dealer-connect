import type { Feedback, Profile, ServiceRequest } from '@/types/database'

/**
 * Demo mode reads Dingli's Focus UAT data through /api/uat-data, which checks
 * one shared password. What a demo sign-in needs to remember — the dealer, the
 * password and the GSTIN their data is keyed by — lives here, in localStorage,
 * so a refresh keeps the visitor signed in.
 */
export type UatAccess = {
  dealerId: string
  password: string
  /** Null when the dealership isn't in the Focus UAT dealer list. */
  gstin: string | null
  profile: Profile
}

const STORAGE_KEY = 'dingli-uat-access'

export function readUatAccess(): UatAccess | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UatAccess) : null
  } catch {
    return null
  }
}

export function writeUatAccess(access: UatAccess) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(access))
  } catch {
    // Storage unavailable — the sign-in just won't survive a refresh.
  }
}

export function clearUatAccess() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

export class UatAuthError extends Error {}

/** GET /api/uat-data with the shared password. */
export async function uatFetch<T>(
  action: string,
  params: Record<string, string> = {},
  password = readUatAccess()?.password,
): Promise<T> {
  const query = new URLSearchParams({ action, ...params })
  const res = await fetch(`/api/uat-data?${query}`, {
    headers: { 'x-uat-password': password ?? '' },
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) throw new UatAuthError(body.error || 'Incorrect password.')
  if (!res.ok) throw new Error(body.error || 'Could not load the UAT data.')
  return body as T
}

// Feedback and service requests are the portal's own records, not Focus data,
// and demo mode has no backend to keep them in — so a visitor's submissions
// last for the session only, and every list starts empty.
const feedback = new Map<string, Feedback[]>()
const serviceRequests = new Map<string, ServiceRequest[]>()

export function sessionFeedback(dealerId: string): Feedback[] {
  return feedback.get(dealerId) ?? []
}

export function addSessionFeedback(dealerId: string, entry: Pick<Feedback, 'category' | 'subject' | 'message'>) {
  feedback.set(dealerId, [
    { id: `session-feedback-${Date.now()}`, dealer_id: dealerId, status: 'open', created_at: new Date().toISOString(), ...entry },
    ...sessionFeedback(dealerId),
  ])
}

export function sessionServiceRequests(dealerId: string): ServiceRequest[] {
  return serviceRequests.get(dealerId) ?? []
}

export function addSessionServiceRequest(
  dealerId: string,
  entry: Pick<ServiceRequest, 'machine_model' | 'serial_number' | 'issue_description' | 'priority'>,
) {
  serviceRequests.set(dealerId, [
    {
      id: `session-service-${Date.now()}`,
      dealer_id: dealerId,
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      ...entry,
    },
    ...sessionServiceRequests(dealerId),
  ])
}
