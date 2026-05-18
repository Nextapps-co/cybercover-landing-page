// Per spec §5.1.4 — bezpieczny parser claims JWT (base64 decode payloadu).
//
// BRAK weryfikacji podpisu (to BE problem). Use cases:
// - dev logging "logged in as companyId=X"
// - future "Zalogowany jako X" badge w nagłówku (out of scope teraz)
// - future proactive 401 detection przed network call (też out of scope)
//
// Tolerujący wobec invalid input (mock tokens np. "mock-access-optimum-ACTIVE",
// malformed strings) — zwraca null zamiast rzucać.

export interface JwtClaims {
  sub: string;
  companyId?: string;
  role?: string;
  /** Unix timestamp (sekundy). */
  exp?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): string | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    return atob(padded + '='.repeat(padLen));
  } catch {
    return null;
  }
}

export function parseClaims(token: string): JwtClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const decoded = base64UrlDecode(parts[1]);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sub !== 'string') return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims, nowMs: number = Date.now()): boolean {
  if (typeof claims.exp !== 'number') return false;
  return claims.exp * 1000 < nowMs;
}
