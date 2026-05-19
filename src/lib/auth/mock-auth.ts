// Per spec §5.9.3 — dev shortcut: ?mockAuth=<planCode>-<status> ustawia fake auth session.
//
// Pozwala dev'owi otworzyć `/cennik?mockAuth=optimum-ACTIVE` i zobaczyć auth-aware UI
// bez prawdziwego portala + handoff token. Mocki API czytają context przez `getMockAuthContext`
// żeby zwrócić auth-aware shape responses.
//
// Token zapisany w sessionStorage to opaque string ("mock-access-<raw>") — `parseClaims`
// zwróci null, ale to OK: claims są optional dla flow'u, blokujemy tylko gdy completely missing.

import type { SubscriptionStatus } from '../api/types/catalog';

const MOCK_CONTEXT_KEY = 'cybercover:mock-auth-context';
const ACCESS_KEY = 'cybercover:auth-access';
const REFRESH_KEY = 'cybercover:auth-refresh';
const STORED_AT_KEY = 'cybercover:auth-stored-at';

const VALID_STATUSES = new Set<SubscriptionStatus>(['ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'CANCELLED']);

export interface MockAuthContext {
  planCode: string;
  status: SubscriptionStatus;
}

export function consumeMockAuthFromUrl(): void {
  if (typeof window === 'undefined') return;
  // Aktywacja przez URL jest manualna — nie ograniczamy do import.meta.env.DEV.
  // Pozwala to testować mock-auth flow na staging/preview gdy mock toggles są włączone.
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('mockAuth');
  if (!raw) return;

  const parsed = parseMockAuth(raw);
  if (!parsed) {
    console.warn(`[mock-auth] invalid format: ${raw} — expected '<planCode>-<status>'`);
    return;
  }

  window.sessionStorage.setItem(ACCESS_KEY, `mock-access-${raw}`);
  window.sessionStorage.setItem(REFRESH_KEY, `mock-refresh-${raw}`);
  window.sessionStorage.setItem(STORED_AT_KEY, new Date().toISOString());
  window.sessionStorage.setItem(MOCK_CONTEXT_KEY, JSON.stringify(parsed));
}

export function getMockAuthContext(): MockAuthContext | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(MOCK_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MockAuthContext;
    if (!parsed.planCode || !VALID_STATUSES.has(parsed.status)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseMockAuth(raw: string): MockAuthContext | null {
  const idx = raw.lastIndexOf('-');
  if (idx < 0) return null;
  const planCode = raw.slice(0, idx).trim();
  const statusStr = raw.slice(idx + 1).trim();
  if (!planCode) return null;
  if (!VALID_STATUSES.has(statusStr as SubscriptionStatus)) return null;
  return { planCode, status: statusStr as SubscriptionStatus };
}
