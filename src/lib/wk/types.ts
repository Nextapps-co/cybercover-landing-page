/** Ekrany przerywające kreator — renderowane pełnoekranowo zamiast formularza. */
export type WkNoticeVariant =
  /** 404 albo brak `orderId` w adresie — jedno i to samo dla użytkownika (§3.1). */
  | 'invalid-link'
  /** Odpowiedź spoza kontraktu. Nie zgadujemy, co pokazać. */
  | 'unexpected-state'
  /** 429 — wspólny kubełek na adres IP, więc trafia też ludzi zza jednego NAT-u. */
  | 'rate-limited';

export type Screen =
  | { kind: 'company-data' }
  | { kind: 'personal-data' }
  | { kind: 'operational-standards' }
  | { kind: 'summary' }
  | { kind: 'provisioning' }
  | { kind: 'exit' }
  | { kind: 'notice'; variant: WkNoticeVariant };
