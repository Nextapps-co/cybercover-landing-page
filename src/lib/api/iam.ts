// Per spec §5.3 — IAM endpoint wrapper.

import { apiPost } from './http';
import type { ExchangeHandoffRequest, ExchangeHandoffResponse } from './types/iam';

/**
 * Wymiana single-use handoff tokenu (UUID z URL) na pełną JWT session.
 * Anonymous — endpoint nie wymaga Authorization (klient jeszcze nie ma tokenu).
 *
 * Errors:
 * - 401 HANDOFF_TOKEN_INVALID_OR_EXPIRED — token wygasł (>5 min) lub już skonsumowany (single-use)
 * - 401 USER_INACTIVE — user dezaktywowany między handoff create a exchange
 * - 400 — handoffToken brak / nie-UUID
 */
export async function exchangeHandoff(handoffToken: string): Promise<ExchangeHandoffResponse> {
  return apiPost<ExchangeHandoffRequest, ExchangeHandoffResponse>(
    '/iam/exchange-handoff',
    { handoffToken },
    { anonymous: true },
  );
}
