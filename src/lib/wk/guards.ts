import { ApiError } from '../api/types/errors';
import type { WkNoticeVariant } from './types';

/**
 * Mapuje błąd na ekran przerywający. `null` = błąd nie przerywa kroku —
 * obsłuż go lokalnie (pod polem albo w FormAlert).
 *
 * Uwaga na 404: bramka celowo nie sprawdza przy nim, czy zamówienie istnieje,
 * żeby anonimowa trasa nie stała się wyrocznią istnienia zamówień — i **nie zwraca
 * pola `code`**. Dlatego rozgałęziamy się po statusie HTTP, nie po kodzie (§3.1).
 */
export function noticeVariantForError(err: unknown): WkNoticeVariant | null {
  if (!(err instanceof ApiError)) return null;
  if (err.httpStatus === 404) return 'invalid-link';
  if (err.httpStatus === 429) return 'rate-limited';
  return null;
}

/**
 * Gdzie wrócić po błędzie, który NIE jest awarią.
 * Żaden z tych stanów nie kończy przepływu (§5) — wszystkie są do odzyskania na miejscu.
 */
export type WkRecovery = 'personal-data' | 'reload-state' | null;

export function recoveryForError(err: unknown): WkRecovery {
  if (!(err instanceof ApiError)) return null;
  switch (err.code) {
    // Krok 2 nie przeszedł trasą WK albo przeszła go inna osoba. W obu przypadkach
    // bieżąca osoba wypełnia ekran danych osobowych swoimi danymi.
    case 'WK_CONFIG_PERSONAL_DATA_NOT_SUBMITTED':
    case 'WK_CONFIG_PERSONAL_DATA_MISMATCH':
      return 'personal-data';
    // Stan zamówienia rozjechał się z tym, co mamy w karcie — odczytaj go na nowo
    // i pokaż ekran, który z niego wynika.
    case 'WK_CONFIG_CHECKOUT_INCOMPLETE':
    case 'WK_CONFIG_NOT_IN_PROGRESS':
    case 'INVALID_ORDER_STATE':
      return 'reload-state';
    default:
      return null;
  }
}
