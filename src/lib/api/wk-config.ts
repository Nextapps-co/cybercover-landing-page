import { apiGet, apiPost } from './http';
import type { WkConfigResponseDto, WkPersonalDataDto } from './types/wk-config';
import { getWkConfigMock, submitWkPersonalDataMock, completeWkConfigMock } from './__mocks__/wk-config.mock';

// `PUBLIC_API_BASE_URL` zawiera już `/api`, więc ścieżki są bez tego prefiksu.
// Wszystkie trasy kreatora są anonimowe (AuthType.None) — `anonymous: true` nie jest
// ostrożnością, tylko warunkiem poprawności: bez tego resztka JWT w tej przeglądarce
// spowodowałaby 401 → clearAll() → redirect na portal, na którym klient WK nie ma konta.

function useMock(): boolean {
  return import.meta.env.PUBLIC_USE_MOCK_ORDERS === 'true';
}

/** Jedyne źródło prawdy o tym, co pokazać (§3.1). Woła się przy każdym otwarciu i po krokach 1 i 3. */
export async function getWkConfig(orderId: string): Promise<WkConfigResponseDto> {
  if (useMock()) return getWkConfigMock(orderId);
  return apiGet<WkConfigResponseDto>('/borg/config', { query: { orderId }, anonymous: true });
}

/**
 * 🔴 Krok 2 MUSI iść tędy, nigdy przez `PATCH /orders/:id/personal-data`.
 * Obie trasy zapisują to samo, ale tylko ta stempluje autorstwo kroku, a autorstwo
 * rozstrzyga, kto zostanie administratorem organizacji. Trasa generyczna nie zwróci
 * błędu — po prostu uniemożliwi domknięcie kreatora, a naprawić się tego nie da (§3.5).
 *
 * Odpowiedź ma ten sam kształt co `getWkConfig`, z już przesuniętym `entryStep`,
 * więc po zapisie NIE odpytujemy stanu osobno.
 */
export async function submitWkPersonalData(dto: WkPersonalDataDto): Promise<WkConfigResponseDto> {
  if (useMock()) return submitWkPersonalDataMock(dto);
  return apiPost<WkPersonalDataDto, WkConfigResponseDto>('/borg/config/personal-data', dto, { anonymous: true });
}

/**
 * Domknięcie (§3.7). Idempotentne — podwójne kliknięcie, ponowienie po urwanej
 * odpowiedzi i dwa równoległe żądania zwracają aktualny stan, nie błąd.
 * Odpowiedź jest w kształcie stanu, więc też nie odpytujemy osobno.
 */
export async function completeWkConfig(orderId: string): Promise<WkConfigResponseDto> {
  if (useMock()) return completeWkConfigMock(orderId);
  return apiPost<{ orderId: string }, WkConfigResponseDto>('/borg/config/complete', { orderId }, { anonymous: true });
}

/**
 * Wyjście do Portalu Klienta (§3.8) — PEŁNA NAWIGACJA, nigdy fetch.
 * To ponowne wejście przez bramkę, które tym razem znajdzie firmę. Ciasteczko
 * u partnera sprawia, że użytkownik nie zobaczy ekranu logowania.
 * Własne składanie adresu, bo `buildUrl` z http.ts nie jest eksportowane.
 */
export function wkLoginUrl(): string {
  const base = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/borg/login`;
}
