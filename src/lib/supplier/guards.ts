import { ApiError } from '../api/types/errors';
import type { CheckoutStateResponseDto } from '../api/types/order';
import type { SupplierNoticeVariant } from './types';

/**
 * Mapuje błąd API na ekran przerywający.
 * `null` = błąd nie przerywa kroku — obsłuż go lokalnie (pod polem albo w FormAlert).
 */
export function noticeVariantForError(err: unknown): SupplierNoticeVariant | null {
  if (!(err instanceof ApiError)) return null;
  if (err.httpStatus === 429) return 'rate-limited';
  switch (err.code) {
    case 'NOT_FOUND_EXCEPTION':
      return 'invitation-invalid';
    case 'STANDARD_PLAN_NOT_FOUND':
      return 'config-error';
    // §9.8 — nie naprawiamy stanu lokalnie, wracamy przez link zaproszeniowy.
    case 'INVALID_ORDER_STATE':
    case 'ORDER_NOT_FOUND':
      return 'order-state';
    case 'SALES_ORDER_GRANT_PAYMENT_METHOD_MISMATCH':
      return 'inconsistent-order';
    default:
      return null;
  }
}

/**
 * Sprawdza, czy zamówienie faktycznie jest grantowe i poprawnie zbudowane.
 * `null` = wszystko w porządku.
 *
 * `isGrant` traktujemy trójwartościowo: `false` to twardy stop, ale `undefined`
 * (środowisko ze starszym kontraktem) NIE jest zaprzeczeniem i nie blokuje lejka.
 * `hasOperationalStandards === false` na grancie to defekt konstrukcji zamówienia (§5.4) —
 * przerywamy i zgłaszamy, zamiast obchodzić dodatkowym krokiem.
 */
export function grantOrderProblem(
  state: Pick<CheckoutStateResponseDto, 'isGrant' | 'progress'>,
): SupplierNoticeVariant | null {
  if (state.isGrant === false) return 'inconsistent-order';
  if (state.progress.hasOperationalStandards !== true) return 'inconsistent-order';
  return null;
}
