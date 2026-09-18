// Mock kreatora Wolters Kluwer. Pod tą samą flagą co reszta wizarda
// (PUBLIC_USE_MOCK_ORDERS) — osobna flaga pozwoliłaby zmontować hybrydę
// „prawdziwy borg + mockowane /orders", która daje mylące błędy.
//
// Mock NIE trzyma entryStep jako pola. Wylicza go z postępu zamówienia w orders.mock
// plus własnej flagi kroku 2 — dzięki temu `operationalStandardsRequired` przełącza się
// true → false tak samo jak na prawdziwej bramce (§3.1 reguła 3).

import { ApiError } from '../types/errors';
import type { WkConfigResponseDto, WkPersonalDataDto, WkPrefillDto } from '../types/wk-config';
import { getOrderMock, seedWkOrderMock, submitPersonalDataMock } from './orders.mock';

/**
 * Jak długo mock udaje zakładanie firmy, zanim przejdzie na COMPLETED.
 * Eksportowane, żeby test odliczał względem tej samej wartości zamiast duplikować
 * magiczną liczbę w dwóch plikach (patrz wk-config.mock.test.ts).
 */
export const PROVISIONING_MS = 5000;

/** `orderId`, który udaje brak rekordu konfiguracji — do obejrzenia ekranu błędnego adresu. */
const NOT_FOUND_ID = '404';

/** `orderId`, który włącza krok standardów — jedyny sposób, żeby zobaczyć ekran 3. */
const WITH_OS_ID = 'os';

interface WkMockState {
  personalDataSubmitted: boolean;
  completedAt: number | null;
  osRequired: boolean;
}

const stateById = new Map<string, WkMockState>();

const PREFILL: WkPrefillDto = {
  companyName: 'WOLTERS KLUWER POLSKA Sp. z o.o. Dział Oprogramowania TEST',
  firstName: 'Jan',
  lastName: 'Kowalski',
  email: 'jan@example.test',
  phone: '+48500600700',
};

export function resetWkConfigMock(): void {
  stateById.clear();
}

function ensure(orderId: string): WkMockState {
  if (orderId === NOT_FOUND_ID) {
    // Bramka celowo nie rozróżnia „nie ma konfiguracji" od „nie ma zamówienia",
    // i nie zwraca pola `code` — dlatego sam status.
    throw new ApiError('INTERNAL_ERROR', 404, 'Brak rekordu konfiguracji');
  }
  let state = stateById.get(orderId);
  if (!state) {
    state = { personalDataSubmitted: false, completedAt: null, osRequired: orderId === WITH_OS_ID };
    stateById.set(orderId, state);
    seedWkOrderMock(orderId, { hasOperationalStandards: !state.osRequired });
  }
  return state;
}

/**
 * Wylicza stan kreatora z postępu zamówienia (kroki 1 i 3 idą trasami współdzielonymi,
 * więc ich ślad jest w orders.mock) plus własnej flagi kroku 2.
 */
async function snapshot(orderId: string, state: WkMockState): Promise<WkConfigResponseDto> {
  if (state.completedAt !== null) {
    const provisioning = Date.now() - state.completedAt < PROVISIONING_MS;
    return {
      status: provisioning ? 'PROVISIONING' : 'COMPLETED',
      entryStep: 'done',
      operationalStandardsRequired: false,
      prefill: null, // poza IN_PROGRESS zawsze null — ochrona danych osobowych
    };
  }

  const { checkoutProgress } = await getOrderMock(orderId);
  const osPending = state.osRequired && !checkoutProgress.hasOperationalStandards;

  const entryStep = !checkoutProgress.hasCompanyData
    ? 'company-data'
    : !state.personalDataSubmitted
      ? 'personal-data'
      : osPending
        ? 'operational-standards'
        : 'ready-to-complete';

  return {
    status: 'IN_PROGRESS',
    entryStep,
    operationalStandardsRequired: osPending,
    prefill: { ...PREFILL },
  };
}

export async function getWkConfigMock(orderId: string): Promise<WkConfigResponseDto> {
  return snapshot(orderId, ensure(orderId));
}

export async function submitWkPersonalDataMock(dto: WkPersonalDataDto): Promise<WkConfigResponseDto> {
  const state = ensure(dto.orderId);
  const { orderId, ...personal } = dto;
  // Trasa WK zapisuje te same dane co generyczna — różni je wyłącznie stempel autorstwa,
  // którego mock nie modeluje (nie ma czego zepsuć bez prawdziwej bramki).
  await submitPersonalDataMock(orderId, personal);
  state.personalDataSubmitted = true;
  return snapshot(orderId, state);
}

export async function completeWkConfigMock(orderId: string): Promise<WkConfigResponseDto> {
  const state = ensure(orderId);
  // Idempotentne — powtórne wywołanie nie przestawia znacznika i niczego nie tworzy (§3.7).
  if (state.completedAt === null) state.completedAt = Date.now();
  return snapshot(orderId, state);
}
