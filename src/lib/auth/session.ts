// Per spec §5.1.1 — sessionStorage-backed token persistence + hard reset utility.
//
// Storage keys:
// - cybercover:auth-access    — accessToken (Bearer JWT)
// - cybercover:auth-refresh   — refreshToken (currently unused; refresh deferred per OQ2)
// - cybercover:auth-stored-at — ISO timestamp ostatniego setTokens
//
// Tylko `http.ts` woła `getAccessToken` (per spec §4.4 zasada izolacji).
// Komponenty React czytają stan przez `useAuthSession()` hook.

import type { AuthSession } from './types';
import { clearSession as clearOrderSession } from '../state/order-session';

const ACCESS_KEY = 'cybercover:auth-access';
const REFRESH_KEY = 'cybercover:auth-refresh';
const STORED_AT_KEY = 'cybercover:auth-stored-at';

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const v = window.sessionStorage.getItem(key);
  return v && v.length > 0 ? v : null;
}

/**
 * Synchronizuje `data-auth-aware` flag na <html> z aktualnym stanem sesji.
 * BaseLayout używa tej flagi do ukrycia top-nav header'a i blokady routingu
 * na landing/legal pages (CSS rule + inline head script).
 */
function setAuthAwareFlag(value: boolean): void {
  if (typeof document === 'undefined') return;
  if (value) {
    document.documentElement.setAttribute('data-auth-aware', 'true');
  } else {
    document.documentElement.removeAttribute('data-auth-aware');
  }
}

export function getAccessToken(): string | null {
  return readString(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return readString(REFRESH_KEY);
}

export function getSession(): AuthSession | null {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken || !refreshToken) return null;
  const storedAt = readString(STORED_AT_KEY) ?? new Date(0).toISOString();
  return { accessToken, refreshToken, storedAt };
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ACCESS_KEY, accessToken);
  window.sessionStorage.setItem(REFRESH_KEY, refreshToken);
  window.sessionStorage.setItem(STORED_AT_KEY, new Date().toISOString());
  setAuthAwareFlag(true);
}

export function hasSession(): boolean {
  return getAccessToken() !== null && getRefreshToken() !== null;
}

export function clearAll(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_KEY);
  window.sessionStorage.removeItem(REFRESH_KEY);
  window.sessionStorage.removeItem(STORED_AT_KEY);
  setAuthAwareFlag(false);
}

/**
 * Hard reset wszystkich kluczy związanych z checkout/auth. Wywoływane przed `exchangeHandoff`
 * (per spec §5.1.1 / D5) żeby nowy auth context nie kolidował z istniejącym state.
 */
export function clearAllCheckoutState(): void {
  if (typeof window === 'undefined') return;
  const keys = [
    ACCESS_KEY,
    REFRESH_KEY,
    STORED_AT_KEY,
    'cybercover:form-state:company-data',
    'cybercover:form-state:personal-data',
    'cybercover:form-state:operational-standards',
    'cybercover:form-state:payment-method',
    'cybercover:mock-auth-context',
    'cybercover:pricing-snapshot',
  ];
  for (const k of keys) {
    window.sessionStorage.removeItem(k);
  }
  clearOrderSession(); // Clear order-session from localStorage
  setAuthAwareFlag(false);
}
