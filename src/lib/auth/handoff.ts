// Per spec §5.1.2 — detekcja ?handoff= w URL i wymiana tokenu na JWT session.
//
// Flow:
// 1. Parse ?handoff= z window.location.search
// 2. Jeśli obecny: clearAllCheckoutState (hard reset — D5)
// 3. POST /iam/exchange-handoff
// 4. Sukces: setTokens + history.replaceState (strip ?handoff=, keep inne params)
// 5. 401 z HANDOFF_TOKEN_INVALID_OR_EXPIRED / USER_INACTIVE: caller decyduje (redirect)
// 6. Inny błąd: fall-through na anonymous (per BE spec §8 "FE renderuje stronę anonimową")

import { exchangeHandoff } from '../api/iam';
import { ApiError } from '../api/types/errors';
import type { AuthSession } from './types';
import { setTokens, clearAllCheckoutState } from './session';

export type HandoffOutcome =
  | { kind: 'exchanged'; session: AuthSession }
  | { kind: 'no-token' }
  | { kind: 'invalid' }
  | { kind: 'user-inactive' }
  | { kind: 'error'; message: string };

const HANDOFF_QUERY_PARAM = 'handoff';

export async function detectAndExchangeHandoff(): Promise<HandoffOutcome> {
  if (typeof window === 'undefined') return { kind: 'no-token' };

  const url = new URL(window.location.href);
  const handoffToken = url.searchParams.get(HANDOFF_QUERY_PARAM);
  if (!handoffToken) return { kind: 'no-token' };

  clearAllCheckoutState();

  try {
    const response = await exchangeHandoff(handoffToken);
    setTokens(response.accessToken, response.refreshToken);

    // Strip ?handoff= z URL (zachowaj inne params, np. ?partner=, ?discountCode=)
    url.searchParams.delete(HANDOFF_QUERY_PARAM);
    const newSearch = url.search; // już bez handoff
    window.history.replaceState({}, '', url.pathname + newSearch + url.hash);

    return {
      kind: 'exchanged',
      session: {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        storedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'HANDOFF_TOKEN_INVALID_OR_EXPIRED') return { kind: 'invalid' };
      if (err.code === 'USER_INACTIVE') return { kind: 'user-inactive' };
    }
    const message = err instanceof Error ? err.message : 'unknown';
    return { kind: 'error', message };
  }
}
