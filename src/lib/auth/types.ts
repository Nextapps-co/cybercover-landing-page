// Per spec §5.1.1 — auth session shape.

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp — dla diagnostics tylko, nie używane do walidacji TTL. */
  storedAt: string;
}
