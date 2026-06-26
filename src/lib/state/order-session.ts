// SessionStorage manager for the active order during checkout.
// React-friendly: pure read/write helpers (no signals).
// Components read on mount via useEffect.
//
// Per spec §5.5.2 — OrderSession trzyma także auth-aware fields propagowane
// z `StartOrderResponseDto`: orderType, wizardEntryStep, prefilledFields.

import type { BillingCycle } from '../api/types/money';
import type {
  StartOrderResponseDto,
  WizardEntryStep,
  PrefilledField,
  OrderType,
} from '../api/types/order';
import { getOperationalStandardsSchema } from '../api/orders';

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
  // §2.6 — true for plans without InsuranceCoverage (e.g. Standard).
  // Resolved once via /operational-standards-schema and cached for the wizard
  // lifetime so subsequent steps don't need extra requests.
  osSkipped?: boolean;
  // Auth-aware hints (optional dla backward compat z anonymous flow) per spec §5.5.2.
  orderType?: OrderType;
  wizardEntryStep?: WizardEntryStep;
  prefilledFields?: PrefilledField[];
}

export const STORAGE_KEY = 'cybercover:order-session';
export const ORDER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni

function isValidSession(value: unknown): value is OrderSession {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const osSkippedOk = obj.osSkipped === undefined || typeof obj.osSkipped === 'boolean';
  return (
    typeof obj.orderId === 'string' &&
    typeof obj.catalogEntryId === 'string' &&
    (obj.billingCycle === 'MONTHLY' || obj.billingCycle === 'ANNUAL') &&
    typeof obj.planSnapshot === 'object' &&
    obj.planSnapshot !== null &&
    typeof (obj.planSnapshot as Record<string, unknown>).planName === 'string' &&
    osSkippedOk
  );
}

export function loadFromStorage(): OrderSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    const createdMs = Date.parse(parsed.createdAt);
    if (!Number.isNaN(createdMs) && Date.now() - createdMs > ORDER_SESSION_TTL_MS) {
      clearSession();
      return null;
    }
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
    // Propagate auth-aware fields per spec §5.5.2.
    orderType: response.orderType,
    wizardEntryStep: response.wizardEntryStep,
    prefilledFields: response.prefilledFields,
  };
  persistToStorage(session);
  return session;
}

// Convenience aliases used by checkout step components
export const getOrderSession = loadFromStorage;
export const saveOrderSession = persistToStorage;
export const clearOrderSession = clearSession;

/**
 * Returns whether the operational-standards step is auto-skipped for this order
 * (plans without InsuranceCoverage — §2.6). Cached on the OrderSession after the
 * first lookup; defaults to `false` if the schema endpoint fails or no session
 * exists, so wizards never lose the OS step due to a transient error.
 */
export async function resolveOsSkipped(orderId: string): Promise<boolean> {
  const session = loadFromStorage();
  if (session?.osSkipped !== undefined) return session.osSkipped;
  try {
    const schema = await getOperationalStandardsSchema(orderId);
    const skipped = Boolean(schema.skipped);
    if (session) persistToStorage({ ...session, osSkipped: skipped });
    return skipped;
  } catch {
    return false;
  }
}

export function persistOsSkipped(skipped: boolean): void {
  const session = loadFromStorage();
  if (!session) return;
  if (session.osSkipped === skipped) return;
  persistToStorage({ ...session, osSkipped: skipped });
}
