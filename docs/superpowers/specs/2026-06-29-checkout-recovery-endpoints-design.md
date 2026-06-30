# Checkout recovery endpoints — integracja FE (`change-payment-method` + `cancel`)

**Data:** 2026-06-29
**Branch:** `fix/additional-checkout-flow-actions`
**Kontrakt BE:** `docs/additional-checkout-process-endpoints.md` (branch `fix/create-company-after-payment`)
**Status:** projekt zatwierdzony, do implementacji.

---

## 1. Cel

Wpiąć dwa nowe **anonimowe** endpointy w istniejący 4-krokowy flow zakupowy, aby klient mógł odzyskać się z ekranu płatności bez utraty wprowadzonych danych:

1. **`PATCH /orders/:orderId/change-payment-method`** (priorytet HIGH) — na potwierdzonym, nieopłaconym zamówieniu przełącza **online-karta (Stripe) → przelew bankowy**. Jednokierunkowe (po przełączeniu na przelew nie ma powrotu — proforma już wystawiona).
2. **`POST /orders/:orderId/cancel`** (priorytet MEDIUM) — miękkie anulowanie zamówienia („Zacznij od nowa") z dowolnego punktu przed płatnością.

Oba endpointy są niełamiące — checkout działa bez zmian, jeśli ich nie zaadoptujemy. Adoptujemy je, by odsłonić dwie akcje.

> **Ścieżki w kliencie:** używamy `/orders/...` (nie `/api/orders/...`), bo prefiks `/api` jest już w `PUBLIC_API_BASE_URL` — zgodnie z całą resztą `orders.ts`.

## 2. Stan obecny (ustalenia z kodu — źródło prawdy)

- **`orders.ts`** — sztywny wzorzec: `if (useMock()) return …Mock(args); return api{Get,Post,Patch}('/orders/...', …)`. `orderId` zawsze przez `encodeURIComponent`. Brak `changePaymentMethod` i `cancelOrder`.
- **`types/order.ts`** — `OrderStatus` zawiera już `'CANCELLED'`. **`ConfirmOrderResponseDto = { orderId, status, paymentMethod, confirmationToken: string | null }`** to dokładnie kształt odpowiedzi 200 dla change-method (`confirmationToken` niepuste dla przelewu). `OrderResponseDto` ma `status` i `paymentMethod` (nie ma `confirmationToken`).
- **`ResumePaymentScreen.tsx`** obsługuje OBA ekrany: `/checkout/cancelled` (`variant="cancelled"`, powrót anulowany ze Stripe) i `/checkout/resume` (`variant="resume"`, powrót „wstecz" z przeglądarki ze Stripe — `ConfirmStep` `pageshow`→`classifyOrder`→resumable). Pobiera pełny `order` przez `getOrder` na mount (ma `status`/`paymentMethod`/`discount` w stanie). Zawiera **gotowe, ale ZAKOMENTOWANE** przyciski „Zmień metodę płatności" i „Zacznij od nowa" (~linie 181–196) oraz handlery:
  - `handleChangeMethod` (~93–96) — dziś tylko `navigateBackward('/checkout/payment-method')` (BŁĘDNE dla CONFIRMED — `selectPaymentMethod` to PATCH dla `DRAFT`).
  - `handleStartOver` (~103–107) — dziś tylko `clearOrderSession()`+`clearFormState()`+`assign('/cennik')` (bez anulowania na serwerze).
- **`ConfirmStep.tsx`** — ekran potwierdzenia (zamówienie w `DRAFT`). Akcje: `FormActions` (Cofnij→payment-method + Potwierdzam). Brak „start over". `isPromoZeroOrder` zdefiniowane lokalnie (zduplikowane z `ResumePaymentScreen`).
- **`BankTransferConfirmation.tsx`** (`/checkout/bank-transfer`) — wymaga w URL **tylko** `orderId` + `token`; resztę dociąga z `GET /orders/:id/confirmation?token=`. Token w URL nazywa się `token`.
- **Obsługa błędów** — `translateApiError(err)` mapuje **wyłącznie po `err.code`, ignoruje `err.httpStatus`**. `http.ts` ustala `code` z `body.code` tylko jeśli należy do `BACKEND_CODES`; inaczej → `INTERNAL_ERROR`. `ApiError` przechowuje `httpStatus` niezależnie. **Dokument BE nie gwarantuje `code` w body dla 409**, więc gołe 409 zmapuje się na „Błąd serwera". → Rozgałęziamy po `err.httpStatus`.
- **Stan / „start over"** — `OrderSession` w `localStorage` (`cybercover:order-session`, TTL 7 dni), drafty kroków w `sessionStorage` (`cybercover:form-state:*`). Pełne wyczyszczenie = `clearOrderSession()` **i** `clearFormState()` (dwa niezależne magazyny). `/cennik` na mount wykrywa `CANCELLED` (`classifyOrder`→`'dead'`) i sam czyści sesję. Brak programowego „startOrder" — trzeba przejść na `/cennik` i kliknąć plan.
- **Nawigacja** — `navigateForward/navigateBackward` TYLKO między `/checkout/*` (ta sama `CheckoutLayout`). Przejścia poza layout (`/cennik`, Stripe) = `window.location.assign/href`.

## 3. Decyzje projektowe (zatwierdzone)

1. **Umiejscowienie akcji:** `ResumePaymentScreen` (oba warianty) dostaje OBA przyciski; `ConfirmStep` dostaje DODATKOWO „Zacznij od nowa". Change-method NIE trafia do `ConfirmStep` (tam zamówienie jest `DRAFT`, a change-method wymaga `CONFIRMED`).
2. **„Zacznij od nowa" z potwierdzeniem:** lekki dialog przed wywołaniem `cancel` (chroni przed przypadkowym anulowaniem + utratą danych).
3. **Obsługa 409:** rozgałęzienie po `err.httpStatus === 409` w miejscu wywołania. Bez nowych kodów BE, bez koordynacji kontraktu.

## 4. Architektura zmian

```
types/order.ts ─► orders.ts (+ __mocks__/orders.mock.ts) ─► state/checkout-recovery.ts (NOWY)
                                                                     │
                            ┌────────────────────────────────────────┴───────────────────┐
                    ResumePaymentScreen (cancelled+resume)                          ConfirmStep
                    • „Zapłać przelewem"  (change-method)                   • „Zacznij od nowa"
                    • „Zacznij od nowa"   (cancel)                                    │
                            └──────────────► StartOverDialog (NOWY, współdzielony) ◄───┘
```

### 4.1. Typy — `src/lib/api/types/order.ts`

Dodać przy DTO confirm (po `ConfirmOrderResponseDto`):

```ts
// PATCH /orders/:id/change-payment-method — body
export interface ChangePaymentMethodDto {
  paymentMethod: 'BANK_TRANSFER'; // jedyna akceptowana wartość per kontrakt
}
// odpowiedź 200 ma kształt identyczny z ConfirmOrderResponseDto (confirmationToken niepuste)
export type ChangePaymentMethodResponseDto = ConfirmOrderResponseDto;

// POST /orders/:id/cancel — odpowiedź 200 (bez body w request)
export interface CancelOrderResponseDto {
  orderId: string;
  status: 'CANCELLED';
}
```

### 4.2. Klient API — `src/lib/api/orders.ts`

Dodać po `selectPaymentMethod` / w klastrze confirm (import typów w bloku `./types/order`, import mocków w bloku `./__mocks__/orders.mock`):

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
```

### 4.3. Wspólna logika — `src/lib/state/checkout-recovery.ts` (NOWY)

Czyste funkcje async zwracające **rozróżnialny wynik** (discriminated union). Nawigację robią komponenty (różni się `window.location` vs Astro `navigate` między layoutami). Tu zamknięta reguła „409 po `httpStatus`".

```ts
import { ApiError } from '@/lib/api/types/errors';
import { changePaymentMethod, cancelOrder } from '@/lib/api/orders';
import type { OrderResponseDto } from '@/lib/api/types/order';

export type ChangeToBankOutcome =
  | { kind: 'switched'; confirmationToken: string }
  | { kind: 'not-switchable' }   // 409 — już przelew / już opłacone / nie CONFIRMED
  | { kind: 'not-found' }        // 404
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
  | { kind: 'cancelled' }        // 200 (lub już CANCELLED — idempotentne)
  | { kind: 'already-paid' }     // 409 — opłacone w międzyczasie
  | { kind: 'not-found' }        // 404
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

// dedupe: dziś zduplikowane w ConfirmStep.tsx i ResumePaymentScreen.tsx
export function isPromoZeroOrder(order: Pick<OrderResponseDto, 'discount'>): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner =
    d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' ||
    d.kind === 'PARTNER_TIMEBOUND' || d.kind === 'PARTNER_TIMEBOUND_COMPOSITE';
  return isPartner && d.priceAfterDiscount === 0;
}

// gating widoczności „Zapłać przelewem"
export function canSwitchToBankTransfer(order: Pick<OrderResponseDto, 'status' | 'paymentMethod' | 'discount'>): boolean {
  return order.status === 'CONFIRMED'
    && order.paymentMethod === 'STRIPE_CHECKOUT'
    && !isPromoZeroOrder(order);
}
```

`ConfirmStep.tsx` i `ResumePaymentScreen.tsx` importują `isPromoZeroOrder` stąd zamiast trzymać lokalne kopie.

### 4.4. Mocki — `src/lib/api/__mocks__/orders.mock.ts`

```ts
export async function changePaymentMethodMock(orderId, dto): Promise<ChangePaymentMethodResponseDto> {
  // ORDER_NOT_FOUND (404) gdy brak; 400 gdy dto.paymentMethod !== 'BANK_TRANSFER';
  // 409 gdy status !== 'CONFIRMED' || paymentMethod !== 'STRIPE_CHECKOUT' (już przelew / opłacone / nie confirmed);
  // sukces: paymentMethod='BANK_TRANSFER' (status zostaje 'CONFIRMED'), zwróć token (zapisz w confirmationTokens).
}
export async function cancelOrderMock(orderId): Promise<CancelOrderResponseDto> {
  // ORDER_NOT_FOUND (404) gdy brak; status==='CANCELLED' → zwróć 200 (idempotentne);
  // 409 gdy status nie jest DRAFT ani CONFIRMED (opłacone); sukces: status='CANCELLED'.
}
```

Reużywamy `INVALID_ORDER_STATE` jako `code` dla mockowych 409/400 (`http.ts` go zna). Dodać `confirmationTokens: Map` + czyszczenie w `resetOrdersMock()`.

**Poprawka wierności mocka (wymagana do testów offline):** dziś `getOrderMock` auto-awansuje **każde** `CONFIRMED` na `PENDING_ALLOCATION` przy każdym odczycie (kaskada `FULFILLMENT_PROGRESSION`). Na mount `ResumePaymentScreen` woła `getOrder` → zamówienie „udaje opłacone" → przycisk „Zapłać przelewem" zniknie, a `cancel` zwróci 409. Naprawa: wprowadzić `paidOrderIds: Set<string>` — kaskada fulfillment rusza **tylko** dla zamówień w `paidOrderIds`; oznaczamy je w mockowej ścieżce sukcesu płatności kartą (`createStripeCheckoutSessionMock` symuluje płatność / albo dedykowany hak). Dzięki temu `CONFIRMED`-niepłacone jest stabilne przy odczycie, a polling na `/checkout/success` dla zamówień opłaconych działa jak dotąd. Mock-only; nie dotyka realnego flow. (Dokładny moment oznaczenia „paid" do ustalenia w implementacji — cel: `CONFIRMED`-niepłacone stabilne przy `getOrder`.)

### 4.5. `ResumePaymentScreen.tsx`

- Odkomentować i przestylować oba przyciski; pokazać na OBU wariantach (usunąć warunek `variant === 'resume'` przy „Zacznij od nowa").
- **`handleChangeMethod`** → `changePaymentToBankTransfer(orderId)`:
  - `switched` → `navigateForward('/checkout/bank-transfer?orderId=…&token=<confirmationToken>')`.
  - `not-switchable` → odśwież `getOrder(orderId)` do stanu (przycisk zniknie przez gating), bez krzykliwego błędu.
  - `not-found` → `window.location.assign('/cennik')`. `error` → istniejące `error`/alert.
  - Widoczność: `canSwitchToBankTransfer(order)`.
- **`handleStartOver`** → otwórz `StartOverDialog`; po potwierdzeniu → `startOverOrder(orderId)`:
  - `cancelled` → `clearOrderSession()` + `clearFormState()` → `window.location.assign('/cennik')`.
  - `already-paid` → `window.location.assign('/checkout/success?orderId=…')` (sukcesowy komunikat, nie błąd).
  - `not-found` → `/cennik`. `error` → alert.
- Dodać stany: `switching`/`cancelling` (blokada przycisków + spinner), reuse istniejącego `error`.

### 4.6. `ConfirmStep.tsx`

- Dodać tercjarny element „Zacznij od nowa" pod/przy `FormActions` (własny `<div>`), `disabled={confirming}`.
- Klik → `StartOverDialog` → `startOverOrder(orderId)` (zamówienie tu `DRAFT` → `200 cancelled`):
  - `cancelled` → `clearOrderSession()` + `clearFormState()` → `assign('/cennik')`.
  - `already-paid` (wyścig) → `assign('/checkout/success?orderId=…')`.
- Doimportować `clearOrderSession`, `clearFormState` (dziś nieobecne w ConfirmStep). `isPromoZeroOrder` z `checkout-recovery`.

### 4.7. `StartOverDialog.tsx` (NOWY, współdzielony)

Mały, prezentacyjny modal (overlay + nagłówek + 2 przyciski). Props: `open`, `onConfirm`, `onCancel`, opcjonalnie `busy`. Stylistyka jak istniejące przyciski / `ResumeOrDiscardModal`. Treść (prosty PL wg `CLAUDE.md`): tytuł „Zacząć od nowa?", opis „Twoje zamówienie zostanie anulowane, a wprowadzone dane usunięte. Zaczniesz od wyboru planu.", przyciski „Anuluj" / „Tak, zacznij od nowa".

## 5. Obsługa błędów (PL, prosty język)

Bez nowych kodów w unii. `translateApiError` zostaje fallbackiem dla `error`. Teksty kontekstowe:
- change-method `not-switchable` → bez krzykliwego błędu: ciche odświeżenie stanu (przycisk znika). Ew. delikatna notka.
- cancel `already-paid` → komunikat sukcesowy typu „Płatność została już zrealizowana — przechodzimy do potwierdzenia." + przejście na `/checkout/success`.
- `not-found` → `/cennik` (jak istniejąca obsługa `ORDER_NOT_FOUND`).

## 6. Testy (vitest, zgodnie z konwencją repo — tylko `lib/`)

- `src/lib/api/__mocks__/orders.mock.test.ts` (NOWY): `changePaymentMethodMock` (sukces token / 409 gdy nie-CONFIRMED lub już przelew / 400 zła metoda / 404), `cancelOrderMock` (sukces / idempotencja / 409 opłacone / 404), oraz `paidOrderIds` — `CONFIRMED`-niepłacone stabilne przy powtórnym `getOrderMock`.
- `src/lib/state/checkout-recovery.test.ts` (NOWY): mapowanie wyników (`vi.mock` na `@/lib/api/orders` rzuca `ApiError` z różnymi `httpStatus` → oczekiwane `kind`), `isPromoZeroOrder`, `canSwitchToBankTransfer`.

## 7. Poza zakresem (YAGNI)

- Brak testów komponentów (repo testuje tylko `lib/`; `@vitejs/plugin-react` nieobecny).
- Brak zmian w stronach `.astro` (`cancelled`/`resume`/`bank-transfer` już montują właściwe komponenty).
- Brak kierunku przelew→karta (jednokierunkowe per kontrakt).
- Brak nowych kodów błędów BE / zmian kontraktu.
- Brak refresh-token / auth-aware specyfiki (te akcje są anonimowe).

## 8. Pliki

| Plik | Zmiana | Typ |
|---|---|---|
| `src/lib/api/types/order.ts` | +`ChangePaymentMethodDto`, `ChangePaymentMethodResponseDto`, `CancelOrderResponseDto` | edycja |
| `src/lib/api/orders.ts` | +`changePaymentMethod`, +`cancelOrder`, importy | edycja |
| `src/lib/api/__mocks__/orders.mock.ts` | +2 mocki, `confirmationTokens`, `paidOrderIds` fix, reset | edycja |
| `src/lib/state/checkout-recovery.ts` | wspólna logika + `isPromoZeroOrder` + `canSwitchToBankTransfer` | NOWY |
| `src/components/checkout/StartOverDialog.tsx` | modal potwierdzenia | NOWY |
| `src/components/checkout/ResumePaymentScreen.tsx` | przepiąć/odkomentować oba przyciski, gating, stany | edycja |
| `src/components/checkout/ConfirmStep.tsx` | +„Zacznij od nowa", import clear*, dedupe promo-zero | edycja |
| `src/lib/api/__mocks__/orders.mock.test.ts` | testy mocków | NOWY |
| `src/lib/state/checkout-recovery.test.ts` | testy logiki | NOWY |

## 9. Otwarte kwestie

- Dokładny moment oznaczania zamówienia jako „paid" w mocku (`paidOrderIds`) — do rozstrzygnięcia w implementacji; cel: `CONFIRMED`-niepłacone stabilne przy `getOrder`, polling sukcesu zachowany.
- Czy BE finalnie dośle `code` w body dla 409 — jeśli tak, można później dodać dedykowane kody (`ORDER_ALREADY_PAID`, `PAYMENT_METHOD_NOT_SWITCHABLE`) do unii + `http.ts` + `translate.ts`. Na teraz branch po `httpStatus` jest wystarczający i odporny.
