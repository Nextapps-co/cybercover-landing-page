// Stan lejka zaproszeniowego (grant). Osobny klucz od `cybercover:order-session`,
// żeby płatny checkout i rejestracja dostawcy nie mogły się nawzajem uszkodzić.
//
// Bez TTL — inaczej niż OrderSession: zamówienie grantowe jest wyłączone z codziennego
// sprzątania porzuconych koszyków i żyje bezterminowo (§3), a jedynym autorytetem stanu
// jest serwer. Sesja „wygasa" dopiero wtedy, gdy backend powie, że zamówienia nie ma.

import type { InvitationResponseDto } from '../api/types/supplier-onboarding';

export interface SupplierSession {
  orderId: string;
  /** Token zaproszenia — pozwala powtórzyć idempotentny POST /register przy wznowieniu (§9.8). */
  token: string;
  /** NIP z zaproszenia — pole w kroku 1 jest nim wypełnione i zablokowane. */
  nip: string;
  /** Adres kontaktowy od podmiotu wiodącego — wyłącznie prefill pola e-mail w kroku 2. */
  contactEmail: string;
  /**
   * Adres KONTA podany przez dostawcę w kroku 2 — na niego backend wysyła link
   * aktywacyjny (zmiana po stronie BE z 2026-08-27; wcześniej szedł na kontaktowy).
   *
   * Zapisywany przez krok potwierdzenia, bo ekran końcowy jest terminalny i celowo
   * nie wykonuje żadnego requestu (§6) — bez tego nie miałby skąd wziąć adresu.
   * Opcjonalny: sesje utworzone przed tą zmianą pozostają poprawne.
   */
  accountEmail?: string;
  legalName: string;
  leadingEntityName: string;
  invitedRelationshipsCount: number;
  createdAt: string;
}

export const SUPPLIER_SESSION_KEY = 'cybercover:supplier-session';

function isValidSession(value: unknown): value is SupplierSession {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.orderId === 'string' && obj.orderId.length > 0 &&
    typeof obj.token === 'string' && obj.token.length > 0 &&
    typeof obj.nip === 'string' &&
    typeof obj.contactEmail === 'string' &&
    typeof obj.legalName === 'string' &&
    typeof obj.leadingEntityName === 'string' &&
    typeof obj.invitedRelationshipsCount === 'number'
  );
}

export function loadSupplierSession(): SupplierSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUPPLIER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Zwraca `false`, gdy przeglądarka zablokowała zapis (tryb prywatny, brak miejsca). */
export function saveSupplierSession(session: SupplierSession): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SUPPLIER_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSupplierSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SUPPLIER_SESSION_KEY);
}

/**
 * Utrwala w sesji adres konta podany w kroku 2, żeby ekran końcowy mógł go pokazać
 * bez odpytywania backendu. No-op, gdy sesji nie ma albo adres się nie zmienił.
 */
export function persistAccountEmail(email: string): void {
  const session = loadSupplierSession();
  if (!session) return;
  if (session.accountEmail === email) return;
  saveSupplierSession({ ...session, accountEmail: email });
}

export function sessionFromInvitation(
  orderId: string,
  token: string,
  invitation: InvitationResponseDto,
): SupplierSession {
  return {
    orderId,
    token,
    nip: invitation.nip,
    contactEmail: invitation.contactEmail,
    legalName: invitation.organization.legalName,
    leadingEntityName: invitation.leadingEntityName,
    invitedRelationshipsCount: invitation.invitedRelationshipsCount,
    createdAt: new Date().toISOString(),
  };
}
