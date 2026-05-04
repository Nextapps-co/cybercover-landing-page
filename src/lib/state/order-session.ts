// SessionStorage manager for the active order during checkout.
// React-friendly: pure read/write helpers (no signals).
// Components read on mount via useEffect.

import type { BillingCycle } from '../api/types/money';
import type { StartOrderResponseDto } from '../api/types/order';

export interface PlanSnapshot {
  planName: string;             // Display name (already in user's language; PricingCards passes Polish title via render-policy)
  priceMinorUnits: number;      // grosze
  currency: 'PLN';
  description: string;
}

export interface OrderSession {
  orderId: string;
  catalogEntryId: string;
  billingCycle: BillingCycle;
  partnerCode?: string;
  planSnapshot: PlanSnapshot;
  createdAt: string;            // ISO timestamp
}

export const STORAGE_KEY = 'cybercover:order-session';

function isValidSession(value: unknown): value is OrderSession {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.orderId === 'string' &&
    typeof obj.catalogEntryId === 'string' &&
    (obj.billingCycle === 'MONTHLY' || obj.billingCycle === 'ANNUAL') &&
    typeof obj.planSnapshot === 'object' &&
    obj.planSnapshot !== null &&
    typeof (obj.planSnapshot as Record<string, unknown>).planName === 'string'
  );
}

export function loadFromStorage(): OrderSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistToStorage(session: OrderSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export interface SetFromResponseInput {
  catalogEntryId: string;
  billingCycle: BillingCycle;
  partnerCode?: string;
  plan: PlanSnapshot;
}

export function setFromStartOrderResponse(
  response: StartOrderResponseDto,
  input: SetFromResponseInput,
): OrderSession {
  const session: OrderSession = {
    orderId: response.orderId,
    catalogEntryId: input.catalogEntryId,
    billingCycle: input.billingCycle,
    partnerCode: input.partnerCode,
    planSnapshot: input.plan,
    createdAt: new Date().toISOString(),
  };
  persistToStorage(session);
  return session;
}

// Convenience aliases used by checkout step components
export const getOrderSession = loadFromStorage;
export const saveOrderSession = persistToStorage;
export const clearOrderSession = clearSession;
