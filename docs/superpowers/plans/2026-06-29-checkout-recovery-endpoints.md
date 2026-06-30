# Checkout recovery endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wpiąć anonimowe endpointy `PATCH /orders/:id/change-payment-method` i `POST /orders/:id/cancel` w istniejący flow, odsłaniając akcje „Zapłać przelewem" i „Zacznij od nowa".

**Architecture:** Dwie nowe funkcje klienta API (z mockami), wspólny moduł logiki `checkout-recovery.ts` (rozróżnialne wyniki + reguła „409 po `httpStatus`"), współdzielony modal `StartOverDialog`, oraz podpięcie w `ResumePaymentScreen` (oba przyciski) i `ConfirmStep` (start-over).

**Tech Stack:** Astro 5 + React islands, TypeScript, Tailwind v4, vitest + happy-dom. Spec: `docs/superpowers/specs/2026-06-29-checkout-recovery-endpoints-design.md`. Kontrakt BE: `docs/additional-checkout-process-endpoints.md`.

## Global Constraints

- **ŻADNYCH operacji git** (commit/add/branch/push). Użytkownik commituje sam. POMIJAJ wszystkie kroki „Commit".
- **Język UI/treści:** polski, prosty, dla właścicieli firm bez IT (bez żargonu) — per `CLAUDE.md`.
- **Ścieżki API w kliencie:** `/orders/...` (NIE `/api/orders/...` — prefiks `/api` jest w `PUBLIC_API_BASE_URL`).
- **Obsługa 409:** rozgałęziać po `err.httpStatus === 409`, NIE po `err.code` (BE nie gwarantuje `code` w body).
- **`orderId` w ścieżkach:** zawsze `encodeURIComponent(orderId)`.
- **Testy:** uruchamiaj WYŁĄCZNIE docelowy plik testowy danego zadania (`npx vitest run <plik>`). NIE uruchamiaj pełnego `npm test`, `astro check` ani `build` w trakcie — baseline ma ~17 padających testów i ~69 błędów `astro check` (znane, niezwiązane). Pełna weryfikacja batchem na końcu (Final Verification).
- **Wzorce do naśladowania:** dispatchery `if (useMock()) return …Mock()`, `apiPatch/apiPost`, `navigateForward/navigateBackward` (tylko `/checkout/*`→`/checkout/*`), `window.location.assign` (poza layout), `clearOrderSession()`+`clearFormState()`, `FormAlert`, `translateApiError`.
- **Path alias:** `@` → `src` (działa w vitest i astro).

---

## File Structure

| Plik | Odpowiedzialność | Typ |
|---|---|---|
| `src/lib/api/types/order.ts` | +3 DTO (`ChangePaymentMethodDto`, `ChangePaymentMethodResponseDto`, `CancelOrderResponseDto`) | edycja |
| `src/lib/api/__mocks__/orders.mock.ts` | mocki 2 endpointów + `paidOrderIds`/`confirmationTokens` + naprawa kaskady fulfillment | edycja |
| `src/lib/api/__mocks__/orders.mock.test.ts` | testy przejść stanów mocków | NOWY |
| `src/lib/api/orders.ts` | dispatchery `changePaymentMethod`, `cancelOrder`, `markOrderPaidForMock` | edycja |
| `src/lib/state/checkout-recovery.ts` | wspólna logika odzyskiwania + `isPromoZeroOrder` + `canSwitchToBankTransfer` | NOWY |
| `src/lib/state/checkout-recovery.test.ts` | testy logiki (mapowanie wyników, predykaty) | NOWY |
| `src/components/checkout/StartOverDialog.tsx` | modal potwierdzenia (prezentacyjny) | NOWY |
| `src/components/checkout/ResumePaymentScreen.tsx` | przepiąć/odkomentować oba przyciski, gating, stany | edycja |
| `src/components/checkout/ConfirmStep.tsx` | + „Zacznij od nowa" + dialog | edycja |
| `src/components/checkout/SuccessStatus.tsx` | wywołać `markOrderPaidForMock` na mount (symulacja płatności w mocku) | edycja |

---

## Task 1: Mock layer + DTO types

**Files:**
- Modify: `src/lib/api/types/order.ts` (dodać przy `ConfirmOrderResponseDto`)
- Modify: `src/lib/api/__mocks__/orders.mock.ts`
- Test: `src/lib/api/__mocks__/orders.mock.test.ts` (Create)

**Interfaces:**
- Produces (typy w `types/order.ts`):
  - `interface ChangePaymentMethodDto { paymentMethod: 'BANK_TRANSFER' }`
  - `type ChangePaymentMethodResponseDto = ConfirmOrderResponseDto`
  - `interface CancelOrderResponseDto { orderId: string; status: 'CANCELLED' }`
- Produces (mocki w `orders.mock.ts`):
  - `changePaymentMethodMock(orderId: string, dto: ChangePaymentMethodDto): Promise<ChangePaymentMethodResponseDto>`
  - `cancelOrderMock(orderId: string): Promise<CancelOrderResponseDto>`
  - `markOrderPaidMock(orderId: string): void`
  - (zmodyfikowany) `getOrderMock` — kaskada fulfillment tylko dla zamówień w `paidOrderIds`

- [ ] **Step 1: Zapoznaj się z plikiem mocka i typami**

Przeczytaj `src/lib/api/__mocks__/orders.mock.ts` w całości oraz `src/lib/api/types/order.ts` (sekcje `OrderStatus`, `PaymentMethod`, `ConfirmOrderResponseDto`, `OrderResponseDto`, `SubmitCompanyDataDto`, `SubmitPersonalDataDto`, `SubmitOperationalStandardsDto`, `StartOrderDto`). Zapamiętaj: `ApiError` importowany z `../types/errors`, `ordersById`/`fulfillmentCallCounts` to module-level Mapy, `resetOrdersMock()` czyści stan, `FULFILLMENT_PROGRESSION` i `getOrderMock` (auto-awans).

- [ ] **Step 2: Dodaj DTO do `types/order.ts`**

Tuż po definicji `ConfirmOrderResponseDto`:

```ts
// PATCH /orders/:id/change-payment-method — request body
export interface ChangePaymentMethodDto {
  paymentMethod: 'BANK_TRANSFER'; // jedyna akceptowana wartość per kontrakt BE
}
// odpowiedź 200 ma kształt identyczny z ConfirmOrderResponseDto (confirmationToken niepuste)
export type ChangePaymentMethodResponseDto = ConfirmOrderResponseDto;

// POST /orders/:id/cancel — odpowiedź 200 (request bez body)
export interface CancelOrderResponseDto {
  orderId: string;
  status: 'CANCELLED';
}
```

- [ ] **Step 3: Napisz failing test `orders.mock.test.ts`**

Wzór za istniejącym `src/lib/api/__mocks__/catalog.mock.test.ts`. **Dostosuj pola DTO w `seedConfirmedStripeOrder` do rzeczywistych typów** odczytanych w Step 1 (helper musi się kompilować). Użyj `catalogEntryId` bez `partnerCode`, by `discount` było `null` (nie promo-zero) → `confirmOrderMock` da `CONFIRMED`.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../types/errors';
import {
  resetOrdersMock,
  startOrderMock,
  submitCompanyDataMock,
  submitPersonalDataMock,
  submitOperationalStandardsMock,
  selectPaymentMethodMock,
  confirmOrderMock,
  getOrderMock,
  changePaymentMethodMock,
  cancelOrderMock,
  markOrderPaidMock,
} from './orders.mock';

// Buduje zamówienie w stanie CONFIRMED + STRIPE_CHECKOUT (niepłacone).
async function seedConfirmedStripeOrder(): Promise<string> {
  const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
  const orderId = start.orderId;
  await submitCompanyDataMock(orderId, {
    nip: '5260001246', name: 'ACME Sp. z o.o.', street: 'ul. Przykładowa 15',
    city: 'Warszawa', postalCode: '00-123', industry: 'IT',
  });
  await submitPersonalDataMock(orderId, {
    firstName: 'Jan', lastName: 'Kowalski', email: 'jan@acme.pl', phone: '+48123456789',
  });
  await submitOperationalStandardsMock(orderId, { answers: {} });
  await selectPaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT' });
  const confirmed = await confirmOrderMock(orderId);
  expect(confirmed.status).toBe('CONFIRMED');
  expect(confirmed.paymentMethod).toBe('STRIPE_CHECKOUT');
  return orderId;
}

describe('changePaymentMethodMock', () => {
  beforeEach(() => resetOrdersMock());

  it('przełącza CONFIRMED+STRIPE na BANK_TRANSFER i zwraca token, status zostaje CONFIRMED', async () => {
    const orderId = await seedConfirmedStripeOrder();
    const res = await changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' });
    expect(res.status).toBe('CONFIRMED');
    expect(res.paymentMethod).toBe('BANK_TRANSFER');
    expect(res.confirmationToken).toBeTruthy();
  });

  it('jest jednokierunkowe — drugie wywołanie zwraca 409', async () => {
    const orderId = await seedConfirmedStripeOrder();
    await changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' });
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 409 gdy zamówienie już opłacone (PENDING_ALLOCATION)', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    await getOrderMock(orderId); // CONFIRMED -> PENDING_ALLOCATION
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 400 dla nieprawidłowej metody', async () => {
    const orderId = await seedConfirmedStripeOrder();
    // @ts-expect-error — celowo zła wartość, by sprawdzić walidację
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT' }))
      .rejects.toMatchObject({ httpStatus: 400 });
  });

  it('zwraca 404 dla nieznanego orderId', async () => {
    await expect(changePaymentMethodMock('nope', { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('cancelOrderMock', () => {
  beforeEach(() => resetOrdersMock());

  it('anuluje zamówienie DRAFT', async () => {
    const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
    const res = await cancelOrderMock(start.orderId);
    expect(res.status).toBe('CANCELLED');
  });

  it('jest idempotentne — powtórne wywołanie zwraca CANCELLED', async () => {
    const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
    await cancelOrderMock(start.orderId);
    const again = await cancelOrderMock(start.orderId);
    expect(again.status).toBe('CANCELLED');
  });

  it('zwraca 409 gdy zamówienie już opłacone', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    await getOrderMock(orderId); // -> PENDING_ALLOCATION
    await expect(cancelOrderMock(orderId)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 404 dla nieznanego orderId', async () => {
    await expect(cancelOrderMock('nope')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('getOrderMock — kaskada tylko dla opłaconych', () => {
  beforeEach(() => resetOrdersMock());

  it('CONFIRMED niepłacone jest stabilne przy wielokrotnym odczycie', async () => {
    const orderId = await seedConfirmedStripeOrder();
    expect((await getOrderMock(orderId)).status).toBe('CONFIRMED');
    expect((await getOrderMock(orderId)).status).toBe('CONFIRMED');
  });

  it('po markOrderPaidMock kaskada awansuje status', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    expect((await getOrderMock(orderId)).status).toBe('PENDING_ALLOCATION');
  });
});
```

- [ ] **Step 4: Uruchom test — ma się NIE skompilować / paść (brak funkcji)**

Run: `npx vitest run src/lib/api/__mocks__/orders.mock.test.ts`
Expected: FAIL — `changePaymentMethodMock`/`cancelOrderMock`/`markOrderPaidMock` nie istnieją.

- [ ] **Step 5: Dodaj stan mocka + naprawę kaskady**

W `orders.mock.ts`, obok istniejących Map module-level (np. przy `fulfillmentCallCounts`):

```ts
// Zamówienia faktycznie opłacone — tylko one awansują w kaskadzie fulfillment.
// CONFIRMED-niepłacone (ekran cancelled/resume, /cennik resume) zostaje stabilne.
const paidOrderIds = new Set<string>();
// orderId -> confirmationToken (proforma), wystawiany przy przejściu na przelew.
const confirmationTokens = new Map<string, string>();

export function markOrderPaidMock(orderId: string): void {
  paidOrderIds.add(orderId);
}
```

Zmień warunek w `getOrderMock` tak, by kaskada ruszała tylko dla opłaconych — zastąp istniejący blok:

```ts
  const fulfillmentIndex = FULFILLMENT_PROGRESSION.indexOf(order.status);
  if (fulfillmentIndex >= 0 && order.status !== 'FULFILLED' && paidOrderIds.has(orderId)) {
    const next = (fulfillmentCallCounts.get(orderId) ?? 0) + 1;
    fulfillmentCallCounts.set(orderId, next);
    const targetIndex = Math.min(fulfillmentIndex + next, FULFILLMENT_PROGRESSION.length - 1);
    order.status = FULFILLMENT_PROGRESSION[targetIndex];
    ordersById.set(orderId, order);
  }
```

W `resetOrdersMock()` dodaj: `paidOrderIds.clear();` oraz `confirmationTokens.clear();`.

- [ ] **Step 6: Dodaj `changePaymentMethodMock` i `cancelOrderMock`**

Po `selectPaymentMethodMock` / w klastrze confirm. Upewnij się, że typy `ChangePaymentMethodDto`, `ChangePaymentMethodResponseDto`, `CancelOrderResponseDto` są zaimportowane z `../types/order` (dopisz do istniejącego importu typów). `generateMockToken` już istnieje w pliku — użyj go.

```ts
export async function changePaymentMethodMock(
  orderId: string,
  dto: ChangePaymentMethodDto,
): Promise<ChangePaymentMethodResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  // 400 — akceptowana tylko BANK_TRANSFER
  if (dto.paymentMethod !== 'BANK_TRANSFER') {
    throw new ApiError('INVALID_ORDER_STATE', 400, 'Only BANK_TRANSFER allowed (mock)');
  }
  // 409 — przełączalne tylko CONFIRMED + STRIPE (nie: już przelew / już opłacone / nie CONFIRMED)
  if (order.status !== 'CONFIRMED' || order.paymentMethod !== 'STRIPE_CHECKOUT') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order not switchable to bank transfer (mock)');
  }
  order.paymentMethod = 'BANK_TRANSFER'; // status zostaje CONFIRMED — proforma wystawiona
  ordersById.set(orderId, order);
  const token = generateMockToken();
  confirmationTokens.set(orderId, token);
  return { orderId, status: order.status, paymentMethod: 'BANK_TRANSFER', confirmationToken: token };
}

export async function cancelOrderMock(orderId: string): Promise<CancelOrderResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  if (order.status === 'CANCELLED') return { orderId, status: 'CANCELLED' }; // idempotentne
  // 409 — opłacone (PENDING_ALLOCATION / PROCESSING / FULFILLED / CLOSED)
  if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order already paid (mock)');
  }
  order.status = 'CANCELLED';
  ordersById.set(orderId, order);
  return { orderId, status: 'CANCELLED' };
}
```

- [ ] **Step 7: Uruchom test — ma przejść**

Run: `npx vitest run src/lib/api/__mocks__/orders.mock.test.ts`
Expected: PASS (wszystkie `describe`).

- [ ] **Step 8 (Commit): POMIŃ** — bez git. Oznacz zadanie ukończone i raportuj.

---

## Task 2: API client wrappers

**Files:**
- Modify: `src/lib/api/orders.ts`

**Interfaces:**
- Consumes (z Task 1): `changePaymentMethodMock`, `cancelOrderMock`, `markOrderPaidMock`; typy `ChangePaymentMethodDto`, `ChangePaymentMethodResponseDto`, `CancelOrderResponseDto`.
- Produces:
  - `changePaymentMethod(orderId: string, dto: ChangePaymentMethodDto): Promise<ChangePaymentMethodResponseDto>`
  - `cancelOrder(orderId: string): Promise<CancelOrderResponseDto>`
  - `markOrderPaidForMock(orderId: string): void` (no-op poza trybem mock)

- [ ] **Step 1: Dodaj importy**

W bloku importu typów (`./types/order`) dopisz: `ChangePaymentMethodDto`, `ChangePaymentMethodResponseDto`, `CancelOrderResponseDto`.
W bloku importu mocków (`./__mocks__/orders.mock`) dopisz: `changePaymentMethodMock`, `cancelOrderMock`, `markOrderPaidMock`.

- [ ] **Step 2: Dodaj dispatchery**

Po `selectPaymentMethod` (klaster płatności). Uwaga: ścieżki `/orders/...` (NIE `/api/...`); `cancelOrder` wzoruje się na `confirmOrder` (`apiPost<undefined, …>(path, undefined)`):

```ts
export async function changePaymentMethod(
  orderId: string,
  dto: ChangePaymentMethodDto,
): Promise<ChangePaymentMethodResponseDto> {
  if (useMock()) return changePaymentMethodMock(orderId, dto);
  return apiPatch<ChangePaymentMethodDto, ChangePaymentMethodResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/change-payment-method`,
    dto,
  );
}

export async function cancelOrder(orderId: string): Promise<CancelOrderResponseDto> {
  if (useMock()) return cancelOrderMock(orderId);
  return apiPost<undefined, CancelOrderResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    undefined,
  );
}

// Mock-only: oznacza zamówienie jako opłacone (symulacja sukcesu płatności kartą).
// W realnym trybie no-op — sygnał płatności daje backend. Wołane przez SuccessStatus.
export function markOrderPaidForMock(orderId: string): void {
  if (useMock()) markOrderPaidMock(orderId);
}
```

- [ ] **Step 3: Weryfikacja (deferred)** — bez własnego testu vitest (cienkie dispatchery). Typy sprawdzi Final Verification. Sprawdź jedynie wzrokowo, że importy się zgadzają (nazwy z Task 1).

- [ ] **Step 4 (Commit): POMIŃ.**

---

## Task 3: Shared recovery logic

**Files:**
- Create: `src/lib/state/checkout-recovery.ts`
- Test: `src/lib/state/checkout-recovery.test.ts` (Create)

**Interfaces:**
- Consumes (z Task 2): `changePaymentMethod`, `cancelOrder` z `@/lib/api/orders`; `ApiError` z `@/lib/api/types/errors`; `OrderResponseDto` z `@/lib/api/types/order`.
- Produces:
  - `type ChangeToBankOutcome = { kind:'switched'; confirmationToken:string } | { kind:'not-switchable' } | { kind:'not-found' } | { kind:'error'; error:unknown }`
  - `changePaymentToBankTransfer(orderId: string): Promise<ChangeToBankOutcome>`
  - `type StartOverOutcome = { kind:'cancelled' } | { kind:'already-paid' } | { kind:'not-found' } | { kind:'error'; error:unknown }`
  - `startOverOrder(orderId: string): Promise<StartOverOutcome>`
  - `isPromoZeroOrder(order: Pick<OrderResponseDto,'discount'>): boolean`
  - `canSwitchToBankTransfer(order: Pick<OrderResponseDto,'status'|'paymentMethod'|'discount'>): boolean`

- [ ] **Step 1: Napisz failing test `checkout-recovery.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/types/errors';

vi.mock('@/lib/api/orders', () => ({
  changePaymentMethod: vi.fn(),
  cancelOrder: vi.fn(),
}));

import { changePaymentMethod, cancelOrder } from '@/lib/api/orders';
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isPromoZeroOrder,
  canSwitchToBankTransfer,
} from './checkout-recovery';

const mockChange = vi.mocked(changePaymentMethod);
const mockCancel = vi.mocked(cancelOrder);

describe('changePaymentToBankTransfer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 -> switched z tokenem', async () => {
    mockChange.mockResolvedValue({ orderId: 'o1', status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER', confirmationToken: 'tok-1' });
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'switched', confirmationToken: 'tok-1' });
  });

  it('409 -> not-switchable', async () => {
    mockChange.mockRejectedValue(new ApiError('INVALID_ORDER_STATE', 409, 'x'));
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'not-switchable' });
  });

  it('404 -> not-found', async () => {
    mockChange.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'x'));
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'not-found' });
  });

  it('inny błąd -> error', async () => {
    const err = new ApiError('INTERNAL_ERROR', 500, 'x');
    mockChange.mockRejectedValue(err);
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'error', error: err });
  });
});

describe('startOverOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 -> cancelled', async () => {
    mockCancel.mockResolvedValue({ orderId: 'o1', status: 'CANCELLED' });
    expect(await startOverOrder('o1')).toEqual({ kind: 'cancelled' });
  });

  it('409 -> already-paid', async () => {
    mockCancel.mockRejectedValue(new ApiError('INVALID_ORDER_STATE', 409, 'x'));
    expect(await startOverOrder('o1')).toEqual({ kind: 'already-paid' });
  });

  it('404 -> not-found', async () => {
    mockCancel.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'x'));
    expect(await startOverOrder('o1')).toEqual({ kind: 'not-found' });
  });
});

describe('predykaty', () => {
  it('isPromoZeroOrder — partner + 0 zł', () => {
    expect(isPromoZeroOrder({ discount: { kind: 'PARTNER_FLAT', priceAfterDiscount: 0 } as any })).toBe(true);
    expect(isPromoZeroOrder({ discount: { kind: 'CODE_FLAT', priceAfterDiscount: 0 } as any })).toBe(false);
    expect(isPromoZeroOrder({ discount: null })).toBe(false);
  });

  it('canSwitchToBankTransfer — tylko CONFIRMED + STRIPE + nie promo-zero', () => {
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', discount: null })).toBe(true);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER', discount: null })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'DRAFT', paymentMethod: 'STRIPE_CHECKOUT', discount: null })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', discount: { kind: 'PARTNER_FLAT', priceAfterDiscount: 0 } as any })).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść (brak modułu)**

Run: `npx vitest run src/lib/state/checkout-recovery.test.ts`
Expected: FAIL — `./checkout-recovery` nie istnieje.

- [ ] **Step 3: Zaimplementuj `checkout-recovery.ts`**

```ts
import { ApiError } from '@/lib/api/types/errors';
import { changePaymentMethod, cancelOrder } from '@/lib/api/orders';
import type { OrderResponseDto } from '@/lib/api/types/order';

export type ChangeToBankOutcome =
  | { kind: 'switched'; confirmationToken: string }
  | { kind: 'not-switchable' } // 409 — już przelew / już opłacone / nie CONFIRMED
  | { kind: 'not-found' }      // 404
  | { kind: 'error'; error: unknown };

export async function changePaymentToBankTransfer(orderId: string): Promise<ChangeToBankOutcome> {
  try {
    const res = await changePaymentMethod(orderId, { paymentMethod: 'BANK_TRANSFER' });
    return { kind: 'switched', confirmationToken: res.confirmationToken ?? '' };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.httpStatus === 409) return { kind: 'not-switchable' };
      if (err.httpStatus === 404 || err.code === 'ORDER_NOT_FOUND') return { kind: 'not-found' };
    }
    return { kind: 'error', error: err };
  }
}

export type StartOverOutcome =
  | { kind: 'cancelled' }    // 200 (lub już CANCELLED — idempotentne)
  | { kind: 'already-paid' } // 409 — opłacone w międzyczasie
  | { kind: 'not-found' }    // 404
  | { kind: 'error'; error: unknown };

export async function startOverOrder(orderId: string): Promise<StartOverOutcome> {
  try {
    await cancelOrder(orderId);
    return { kind: 'cancelled' };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.httpStatus === 409) return { kind: 'already-paid' };
      if (err.httpStatus === 404 || err.code === 'ORDER_NOT_FOUND') return { kind: 'not-found' };
    }
    return { kind: 'error', error: err };
  }
}

// Promocyjne zamówienie 0 zł (rabat partnera doprowadził do 0). Dedupe z ConfirmStep/ResumePaymentScreen.
export function isPromoZeroOrder(order: Pick<OrderResponseDto, 'discount'>): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner =
    d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' ||
    d.kind === 'PARTNER_TIMEBOUND' || d.kind === 'PARTNER_TIMEBOUND_COMPOSITE';
  return isPartner && d.priceAfterDiscount === 0;
}

// Czy oferować „Zapłać przelewem" (change-method jest jednokierunkowe, tylko CONFIRMED+STRIPE).
export function canSwitchToBankTransfer(
  order: Pick<OrderResponseDto, 'status' | 'paymentMethod' | 'discount'>,
): boolean {
  return order.status === 'CONFIRMED'
    && order.paymentMethod === 'STRIPE_CHECKOUT'
    && !isPromoZeroOrder(order);
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run src/lib/state/checkout-recovery.test.ts`
Expected: PASS.

- [ ] **Step 5 (Commit): POMIŃ.**

---

## Task 4: StartOverDialog component

**Files:**
- Create: `src/components/checkout/StartOverDialog.tsx`

**Interfaces:**
- Produces: `export function StartOverDialog(props: { open: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }): JSX.Element | null`

- [ ] **Step 1: Zapoznaj się ze stylem przycisków**

Przeczytaj `src/components/checkout/ResumePaymentScreen.tsx` (klasy Tailwind przycisków, np. `rounded-[80px] ... font-semibold`) i ewentualnie `src/components/pricing/ResumeOrDiscardModal.tsx` dla wzoru overlay, by zachować spójność wizualną.

- [ ] **Step 2: Zaimplementuj komponent**

Modal prezentacyjny (bez logiki API). Treść prosta, PL. Renderuje `null` gdy `!open`. Przyciski blokowane przez `busy`.

```tsx
interface StartOverDialogProps {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function StartOverDialog({ open, busy = false, onConfirm, onCancel }: StartOverDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-over-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <h2 id="start-over-title" className="text-xl font-semibold text-[#0D0D0D]">
          Zacząć od nowa?
        </h2>
        <p className="mt-3 text-base text-[#6B6965]">
          Twoje zamówienie zostanie anulowane, a wprowadzone dane usunięte. Zaczniesz od wyboru planu.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[80px] bg-[#0D0D0D] px-7 py-3 text-base font-semibold text-white hover:bg-[#262626] disabled:opacity-60"
          >
            {busy ? 'Anulowanie…' : 'Tak, zacznij od nowa'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Weryfikacja (deferred)** — brak testu komponentu (konwencja repo). Sprawdź wzrokowo poprawność JSX/TS.

- [ ] **Step 4 (Commit): POMIŃ.**

---

## Task 5: ResumePaymentScreen wiring

**Files:**
- Modify: `src/components/checkout/ResumePaymentScreen.tsx`

**Interfaces:**
- Consumes: `changePaymentToBankTransfer`, `startOverOrder`, `isPromoZeroOrder`, `canSwitchToBankTransfer` z `@/lib/state/checkout-recovery`; `StartOverDialog` z `./StartOverDialog`; istniejące `clearOrderSession`, `clearFormState`, `navigateForward`, `getOrder`.

- [ ] **Step 1: Przeczytaj `ResumePaymentScreen.tsx` w całości**

Zlokalizuj: import lokalnego `isPromoZeroOrder` (do usunięcia na rzecz wspólnego), handlery `handleChangeMethod` (~93–96) i `handleStartOver` (~103–107), zakomentowane przyciski (~181–196), stan `order`, `error`, `readOrderIdFromUrl`, `variant`.

- [ ] **Step 2: Zaktualizuj importy + usuń lokalny `isPromoZeroOrder`**

Usuń lokalną funkcję `isPromoZeroOrder` z pliku. Dodaj:

```tsx
import { StartOverDialog } from './StartOverDialog';
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isPromoZeroOrder,
  canSwitchToBankTransfer,
} from '@/lib/state/checkout-recovery';
import { getOrder } from '@/lib/api/orders';
```

(`clearOrderSession`, `clearFormState`, `navigateForward` już są importowane — zachowaj. Jeśli `getOrder` już importowany, nie duplikuj.)

- [ ] **Step 3: Dodaj stan akcji**

W ciele komponentu, obok istniejących `useState`:

```tsx
const [switching, setSwitching] = useState(false);
const [cancelling, setCancelling] = useState(false);
const [startOverOpen, setStartOverOpen] = useState(false);
```

- [ ] **Step 4: Przepisz `handleChangeMethod`**

Zastąp ciało handlera (wcześniej cofał do payment-method) wywołaniem nowego endpointu:

```tsx
const handleChangeMethod = async () => {
  const id = readOrderIdFromUrl();
  if (!id) { window.location.assign('/cennik'); return; }
  setSwitching(true);
  setError(null);
  const outcome = await changePaymentToBankTransfer(id);
  if (outcome.kind === 'switched') {
    navigateForward(
      `/checkout/bank-transfer?orderId=${encodeURIComponent(id)}&token=${encodeURIComponent(outcome.confirmationToken)}`,
    );
    return; // nawigacja w toku — nie zwalniamy switching
  }
  if (outcome.kind === 'not-switchable') {
    // Jednokierunkowe / już opłacone — odśwież stan, przycisk zniknie przez gating.
    try { setOrder(await getOrder(id)); } catch { /* ignore */ }
    setSwitching(false);
    return;
  }
  if (outcome.kind === 'not-found') { window.location.assign('/cennik'); return; }
  setError({ title: 'Nie udało się zmienić metody', message: 'Spróbuj ponownie za chwilę.' });
  setSwitching(false);
};
```

> Uwaga: dopasuj `setError(...)` do faktycznego kształtu stanu `error` w pliku (np. `{ title, message }` lub string). Jeśli istnieje `translateApiError`-owy wzorzec dla gałęzi `error`, użyj go dla `outcome.error`.

- [ ] **Step 5: Przepisz `handleStartOver` + dodaj potwierdzenie**

`handleStartOver` ma teraz tylko OTWIERAĆ dialog. Faktyczne anulowanie w `confirmStartOver`:

```tsx
const handleStartOver = () => setStartOverOpen(true);

const confirmStartOver = async () => {
  const id = readOrderIdFromUrl();
  if (!id) { clearOrderSession(); clearFormState(); window.location.assign('/cennik'); return; }
  setCancelling(true);
  const outcome = await startOverOrder(id);
  if (outcome.kind === 'already-paid') {
    // Wyścig — zapłacono w międzyczasie. Nie wracamy na /cennik.
    window.location.assign(`/checkout/success?orderId=${encodeURIComponent(id)}`);
    return;
  }
  // cancelled / not-found / error — w każdym z tych przypadków bezpiecznie czyścimy i wracamy na /cennik
  clearOrderSession();
  clearFormState();
  window.location.assign('/cennik');
};
```

- [ ] **Step 6: Odkomentuj i podepnij przyciski (oba warianty)**

Zastąp zakomentowany blok przycisków (~181–196) działającym markupem. „Zapłać przelewem" pokazuj tylko gdy `order && canSwitchToBankTransfer(order)`. „Zacznij od nowa" na OBU wariantach (usuń warunek `variant === 'resume'`). Dodaj `<StartOverDialog>` na końcu zwracanego drzewa.

```tsx
{order && canSwitchToBankTransfer(order) && (
  <button
    type="button"
    onClick={handleChangeMethod}
    disabled={switching}
    className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60"
  >
    {switching ? 'Przełączanie…' : 'Zapłać przelewem bankowym'}
  </button>
)}
<button
  type="button"
  onClick={handleStartOver}
  className="rounded-[80px] px-7 py-3 text-base font-semibold text-[#6B6965] underline hover:text-[#0D0D0D]"
>
  Zacznij od nowa
</button>
```

Na końcu drzewa (przed zamykającym kontenerem):

```tsx
<StartOverDialog
  open={startOverOpen}
  busy={cancelling}
  onConfirm={confirmStartOver}
  onCancel={() => setStartOverOpen(false)}
/>
```

> Zachowaj istniejący przycisk „Spróbuj ponownie" (`handleRetry`) i logikę promo-zero. Jeśli `setError`/`setOrder` mają inne nazwy w pliku — użyj rzeczywistych.

- [ ] **Step 7: Weryfikacja (deferred)** — bez testu komponentu. Final Verification złapie błędy typów.

- [ ] **Step 8 (Commit): POMIŃ.**

---

## Task 6: ConfirmStep — „Zacznij od nowa"

**Files:**
- Modify: `src/components/checkout/ConfirmStep.tsx`

**Interfaces:**
- Consumes: `startOverOrder`, `isPromoZeroOrder` z `@/lib/state/checkout-recovery`; `StartOverDialog`; `clearOrderSession`, `clearFormState`.

- [ ] **Step 1: Przeczytaj `ConfirmStep.tsx` w całości**

Zlokalizuj: lokalny `isPromoZeroOrder` (~38–48, do usunięcia), `FormActions` (~258–265), stan `confirming` (~56), `order`, `readOrderIdFromUrl`.

- [ ] **Step 2: Importy + usuń lokalny `isPromoZeroOrder`**

Usuń lokalną funkcję `isPromoZeroOrder` i zamień jej użycia na import. Dodaj:

```tsx
import { StartOverDialog } from './StartOverDialog';
import { startOverOrder, isPromoZeroOrder } from '@/lib/state/checkout-recovery';
import { clearOrderSession } from '@/lib/state/order-session';
import { clearFormState } from '@/lib/state/form-persistence';
```

- [ ] **Step 3: Stan + handlery**

Obok istniejących `useState`:

```tsx
const [startOverOpen, setStartOverOpen] = useState(false);
const [cancelling, setCancelling] = useState(false);
```

Handlery (zamówienie jest tu zwykle `DRAFT` → `cancelled`; `already-paid` to wyścig):

```tsx
const handleStartOver = () => setStartOverOpen(true);

const confirmStartOver = async () => {
  const id = order?.orderId ?? readOrderIdFromUrl();
  if (!id) { clearOrderSession(); clearFormState(); window.location.assign('/cennik'); return; }
  setCancelling(true);
  const outcome = await startOverOrder(id);
  if (outcome.kind === 'already-paid') {
    window.location.assign(`/checkout/success?orderId=${encodeURIComponent(id)}`);
    return;
  }
  clearOrderSession();
  clearFormState();
  window.location.assign('/cennik');
};
```

- [ ] **Step 4: Dodaj kontrolkę „Zacznij od nowa" + dialog**

Pod `<FormActions>` (własny `<div>`, wyśrodkowany), nieinwazyjnie:

```tsx
<div className="mt-4 text-center">
  <button
    type="button"
    onClick={handleStartOver}
    disabled={confirming}
    className="text-sm font-semibold text-[#6B6965] underline hover:text-[#0D0D0D] disabled:opacity-60"
  >
    Zacznij od nowa
  </button>
</div>
<StartOverDialog
  open={startOverOpen}
  busy={cancelling}
  onConfirm={confirmStartOver}
  onCancel={() => setStartOverOpen(false)}
/>
```

- [ ] **Step 5: Weryfikacja (deferred).**
- [ ] **Step 6 (Commit): POMIŃ.**

---

## Task 7: SuccessStatus — markOrderPaidForMock

**Files:**
- Modify: `src/components/checkout/SuccessStatus.tsx`

**Interfaces:**
- Consumes: `markOrderPaidForMock` z `@/lib/api/orders` (no-op poza mock).

- [ ] **Step 1: Przeczytaj `SuccessStatus.tsx`**

Zlokalizuj: `readUrlParams` (czyta `orderId`), `useEffect` montujący polling `getOrder`, import z `@/lib/api/orders`.

- [ ] **Step 2: Dodaj wywołanie na mount**

Dopisz `markOrderPaidForMock` do istniejącego importu z `@/lib/api/orders`. W `useEffect` odpowiedzialnym za polling, PRZED pierwszym `getOrder`, oznacz zamówienie jako opłacone (w realnym trybie to no-op; w mocku odblokowuje kaskadę fulfillment do FULFILLED):

```tsx
// Mock: symuluje potwierdzenie płatności kartą (realny tryb — no-op, sygnał daje backend).
if (orderId) markOrderPaidForMock(orderId);
```

> Umieść to raz, na początku efektu pollingu (po ustaleniu `orderId`, przed pętlą/pierwszym `getOrder`). Nie zmieniaj reszty logiki pollingu.

- [ ] **Step 3: Weryfikacja (deferred).**
- [ ] **Step 4 (Commit): POMIŃ.**

---

## Final Verification (wykonuje orchestrator, batch)

- [ ] **V1: Testy nowych plików (targeted)**

Run: `npx vitest run src/lib/api/__mocks__/orders.mock.test.ts src/lib/state/checkout-recovery.test.ts`
Expected: PASS (oba pliki, wszystkie testy).

- [ ] **V2: Typecheck/astro check — porównanie do baseline**

Run: `npx astro check`
Expected: liczba błędów NIE większa niż baseline (~69 znanych, niezwiązanych). Żaden NOWY błąd nie może dotyczyć: `orders.ts`, `orders.mock.ts`, `checkout-recovery.ts`, `StartOverDialog.tsx`, `ResumePaymentScreen.tsx`, `ConfirmStep.tsx`, `SuccessStatus.tsx`, `types/order.ts`. Jeśli pojawi się nowy błąd w tych plikach — napraw przed zakończeniem.

- [ ] **V3: Build smoke (opcjonalnie, jeśli czas)**

Run: `npm run build`
Expected: build przechodzi (lub pada wyłącznie z baseline'owych powodów niezwiązanych z dotkniętymi plikami).

---

## Self-Review (wykonane przy pisaniu planu)

- **Pokrycie specu:** §4.1→T1, §4.2→T2, §4.3→T3, §4.4→T1, §4.5→T5, §4.6→T6, §4.7→T4, mock-fidelity (§4.4)→T1+T7, testy (§6)→T1+T3. ✔
- **Placeholdery:** brak „TBD/TODO"; jedyne „dostosuj DTO/nazwy stanu do pliku" są świadome (subagent czyta plik) i opatrzone pełnym kodem. ✔
- **Spójność typów:** `ChangePaymentMethodResponseDto = ConfirmOrderResponseDto`, `confirmationToken` użyty spójnie; nazwy `changePaymentToBankTransfer`/`startOverOrder`/`canSwitchToBankTransfer`/`markOrderPaidForMock`/`markOrderPaidMock` zgodne między T2/T3/T5/T6/T7. ✔
