# CC-534 — Flow zakupu planu 0 zł — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dla planu w 100% objętego promocją partnerską (0 zł) ukryć krok wyboru płatności, pominąć Stripe i przejść wprost na ekran sukcesu — sterując wszystkim jednym autorytatywnym polem `paymentRequired` z backendu.

**Architecture:** Astro multi-page + React islands per krok. Jedno źródło prawdy: pole `paymentRequired` z `GET /orders/:id` i odpowiedzi `POST /confirm`. FE nie interpretuje statusu ani rabatu. Heurystyka `isPromoZeroOrder` znika, zastąpiona helperem `isNoPaymentOrder(o) => o.paymentRequired === false`.

**Tech Stack:** TypeScript, React, react-hook-form, Vitest + happy-dom, Tailwind v4.

## Global Constraints

- Język UI: polski; treści prosto, bez żargonu (CLAUDE.md „Conventions").
- Bezpieczna semantyka sygnału: „brak płatności" ⟺ `paymentRequired === false`; `true` lub `undefined` → traktuj jak płatne (nigdy nie pomijaj Stripe przypadkiem).
- Nie interpretować `status` do decyzji o płatności — tylko `paymentRequired`.
- Money: grosze (minor units).
- Preferencje wykonawcy (z pamięci użytkownika): **nie** uruchamiać test/build/typecheck w trakcie — weryfikacja wsadowo w ostatnim zadaniu; edycje przez Edit/Write; **commity kontroluje użytkownik** (worker nie wywołuje `git`).
- Baseline: ~17 istniejących failujących testów + ~69 błędów `astro check` to stan zastany, niezwiązany z tą pracą — weryfikacja sprawdza brak *nowych* regresji.

---

### Task 1: Kontrakt typów + helper `isNoPaymentOrder` + testy lib

**Files:**
- Modify: `src/lib/api/types/order.ts`
- Modify: `src/lib/state/checkout-recovery.ts`
- Test: `src/lib/state/checkout-recovery.test.ts`

**Interfaces:**
- Produces: `OrderResponseDto.paymentRequired?: boolean`, `ConfirmOrderResponseDto.paymentRequired?: boolean`, `isNoPaymentOrder(o: { paymentRequired?: boolean }): boolean`, zmieniona sygnatura `canSwitchToBankTransfer(order: Pick<OrderResponseDto,'status'|'paymentMethod'|'paymentRequired'>)`.

- [ ] **Step 1: Dodaj `paymentRequired` do `OrderResponseDto`**

W `src/lib/api/types/order.ts`, w interfejsie `OrderResponseDto`, po linii `proration: ProrationDto | null;` dodaj:

```ts
  // CC-534 — jawny, autorytatywny sygnał „czy zamówienie wymaga płatności".
  // false ⟺ ścieżka „confirm-as-paid" (0 zł + promocja partnerska): pomiń Stripe/proformę.
  // Opcjonalne dla backward-compat; brak/`true` traktujemy jak płatne (patrz isNoPaymentOrder).
  paymentRequired?: boolean;
```

- [ ] **Step 2: Dodaj `paymentRequired` do `ConfirmOrderResponseDto` + zaktualizuj komentarz statusu**

W tym samym pliku zamień blok:

```ts
// §9.1.13 confirm order
export interface ConfirmOrderResponseDto {
  orderId: string;
  status: OrderStatus; // 'CONFIRMED'
  paymentMethod: PaymentMethod;
  confirmationToken: string | null; // only for BANK_TRANSFER
}
```

na:

```ts
// §9.1.13 confirm order
export interface ConfirmOrderResponseDto {
  orderId: string;
  status: OrderStatus; // 'CONFIRMED' (płatny) lub PENDING_ALLOCATION+ (0 zł „confirm-as-paid")
  paymentMethod: PaymentMethod;
  confirmationToken: string | null; // only for BANK_TRANSFER
  // CC-534 — patrz OrderResponseDto.paymentRequired. false ⟺ nie wołaj Stripe.
  paymentRequired?: boolean;
}
```

- [ ] **Step 3: Zastąp `isPromoZeroOrder` przez `isNoPaymentOrder` i zaktualizuj `canSwitchToBankTransfer`**

W `src/lib/state/checkout-recovery.ts` zamień blok (od komentarza „Promocyjne zamówienie 0 zł" do końca `canSwitchToBankTransfer`):

```ts
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

na:

```ts
// CC-534 — zamówienie bez etapu płatności (0 zł „confirm-as-paid"). Autorytatywny sygnał BE.
// Bezpieczna semantyka: tylko jawne `false` znaczy „brak płatności"; brak pola / `true` → płatne
// (nigdy nie pomijamy Stripe przez przypadek). Działa dla OrderResponseDto i ConfirmOrderResponseDto.
export function isNoPaymentOrder(o: { paymentRequired?: boolean }): boolean {
  return o.paymentRequired === false;
}

// Czy oferować „Zapłać przelewem" (change-method jest jednokierunkowe, tylko CONFIRMED+STRIPE).
export function canSwitchToBankTransfer(
  order: Pick<OrderResponseDto, 'status' | 'paymentMethod' | 'paymentRequired'>,
): boolean {
  return order.status === 'CONFIRMED'
    && order.paymentMethod === 'STRIPE_CHECKOUT'
    && !isNoPaymentOrder(order);
}
```

- [ ] **Step 4: Zaktualizuj testy w `checkout-recovery.test.ts`**

Zamień import (linie 10-15) — podmień `isPromoZeroOrder` na `isNoPaymentOrder`:

```ts
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isNoPaymentOrder,
  canSwitchToBankTransfer,
} from './checkout-recovery';
```

Zamień cały blok `describe('predykaty', …)` (linie 70-87) na:

```ts
describe('predykaty', () => {
  it('isNoPaymentOrder — jawne paymentRequired', () => {
    expect(isNoPaymentOrder({ paymentRequired: false })).toBe(true);
    expect(isNoPaymentOrder({ paymentRequired: true })).toBe(false);
    expect(isNoPaymentOrder({})).toBe(false); // brak pola → traktuj jak płatne
  });

  it('canSwitchToBankTransfer — tylko CONFIRMED + STRIPE + płatne', () => {
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: true })).toBe(true);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER', paymentRequired: true })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'DRAFT', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: true })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: false })).toBe(false);
  });
});
```

- [ ] **Step 5 (checkpoint):** Użytkownik może w tym miejscu przejrzeć i zacommitować (worker nie wywołuje `git`).

---

### Task 2: Mock BE — pole `paymentRequired`

**Files:**
- Modify: `src/lib/api/__mocks__/orders.mock.ts`

**Interfaces:**
- Consumes: `PARTNER_DISCOUNT_KINDS` (już w pliku), `OrderResponseDto.discount`.
- Produces: `computePaymentRequired(order)`; `paymentRequired` na obiekcie zamówienia i w odpowiedzi `confirm`.

- [ ] **Step 1: Dodaj helper `computePaymentRequired`**

W `src/lib/api/__mocks__/orders.mock.ts`, tuż po definicji `PARTNER_DISCOUNT_KINDS` (kończy się na linii z `];`), dodaj:

```ts
// CC-534 — paymentRequired: false ⟺ 0 zł + promocja partnerska (ścieżka „confirm-as-paid").
function computePaymentRequired(order: Pick<OrderResponseDto, 'discount'>): boolean {
  const d = order.discount;
  const promoZero = !!d && d.priceAfterDiscount === 0 && PARTNER_DISCOUNT_KINDS.includes(d.kind);
  return !promoZero;
}
```

- [ ] **Step 2: Ustaw `paymentRequired` przy tworzeniu zamówienia**

W `startOrderMock`, zamień:

```ts
  ordersById.set(orderId, order);

  // Per spec §5.9.2 — decyzja orderType/wizardEntryStep/prefilledFields z mock auth context.
```

na:

```ts
  order.paymentRequired = computePaymentRequired(order);
  ordersById.set(orderId, order);

  // Per spec §5.9.2 — decyzja orderType/wizardEntryStep/prefilledFields z mock auth context.
```

- [ ] **Step 3: Odśwież `paymentRequired` w `getOrderMock`**

W `getOrderMock`, zamień końcówkę:

```ts
  return order;
}

export async function getCheckoutStateMock(orderId: string): Promise<CheckoutStateResponseDto> {
```

na:

```ts
  order.paymentRequired = computePaymentRequired(order);
  return order;
}

export async function getCheckoutStateMock(orderId: string): Promise<CheckoutStateResponseDto> {
```

- [ ] **Step 4: Zwróć `paymentRequired` z `confirmOrderMock`**

W `confirmOrderMock`, zamień blok `return { … }`:

```ts
  return {
    orderId,
    status: nextStatus,
    paymentMethod: order.paymentMethod,
    confirmationToken:
      !isPromoZero && order.paymentMethod === 'BANK_TRANSFER' ? generateMockToken() : null,
  };
```

na:

```ts
  return {
    orderId,
    status: nextStatus,
    paymentMethod: order.paymentMethod,
    confirmationToken:
      !isPromoZero && order.paymentMethod === 'BANK_TRANSFER' ? generateMockToken() : null,
    paymentRequired: !isPromoZero,
  };
```

- [ ] **Step 5: Odśwież `paymentRequired` w `removeDiscountMock`**

W `removeDiscountMock`, znajdź `return order;` (koniec funkcji) i zamień na:

```ts
  order.paymentRequired = computePaymentRequired(order);
  return order;
```

> Uwaga: jeśli `removeDiscountMock` ma wcześniejszy `return order;` dla ścieżki idempotentnej (brak rabatu), zastosuj tę samą zmianę do **każdego** `return order;` w tej funkcji.

- [ ] **Step 6 (checkpoint):** Użytkownik może przejrzeć/commitnąć.

---

### Task 3: `CheckoutProgressBar` — prop `paymentSkipped`

**Files:**
- Modify: `src/components/checkout/CheckoutProgressBar.tsx`

**Interfaces:**
- Produces: `<CheckoutProgressBar paymentSkipped?: boolean />` — filtruje krok 4 („Płatność").

- [ ] **Step 1: Rozszerz propsy i filtr kroków**

Zamień:

```ts
interface CheckoutProgressBarProps {
  // Canonical step number (1..5). The bar maps to display position when osSkipped hides step 3.
  currentStep: number;
  // §2.6 — when true, the OS step is filtered out and remaining steps are renumbered (4 total).
  osSkipped?: boolean;
}
```

na:

```ts
interface CheckoutProgressBarProps {
  // Canonical step number (1..5). The bar maps to display position when steps are hidden.
  currentStep: number;
  // §2.6 — when true, the OS step (3) is filtered out and remaining steps are renumbered.
  osSkipped?: boolean;
  // CC-534 — when true, the Payment step (4) is filtered out (0 zł, brak etapu płatności).
  paymentSkipped?: boolean;
}
```

Zamień:

```ts
export function CheckoutProgressBar({ currentStep, osSkipped }: CheckoutProgressBarProps) {
  const visibleSteps = (osSkipped ? STEPS.filter(s => s.number !== 3) : STEPS)
    .map((s, i) => ({ ...s, displayNumber: i + 1 }));
```

na:

```ts
export function CheckoutProgressBar({ currentStep, osSkipped, paymentSkipped }: CheckoutProgressBarProps) {
  const visibleSteps = STEPS
    .filter(s => !(osSkipped && s.number === 3))
    .filter(s => !(paymentSkipped && s.number === 4))
    .map((s, i) => ({ ...s, displayNumber: i + 1 }));
```

- [ ] **Step 2 (checkpoint):** Użytkownik może przejrzeć/commitnąć.

---

### Task 4: `PaymentMethodStep` — auto-pominięcie dla 0 zł

**Files:**
- Modify: `src/components/checkout/PaymentMethodStep.tsx`

**Interfaces:**
- Consumes: `isNoPaymentOrder` (Task 1), `selectPaymentMethod` (już importowane), `navigateForward` (już importowane).

- [ ] **Step 1: Dodaj import helpera**

Po istniejącym imporcie `paymentChanged` (linia `import { paymentChanged, type PaymentDelta } from '../../lib/state/checkout-delta';`) dodaj:

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

- [ ] **Step 2: Dodaj stan `autoAdvancing`**

Po linii `const [hydrating, setHydrating] = useState(true);` dodaj:

```ts
  const [autoAdvancing, setAutoAdvancing] = useState(false);
```

- [ ] **Step 3: Auto-skip w efekcie hydracji**

W bloku `useEffect`, zaraz po guardzie `canAccessStep(4, …)` (po jego zamykającym `}`) a **przed** `setOrder(o);`, wstaw:

```ts
        if (isNoPaymentOrder(o)) {
          // CC-534 — plan 0 zł: krok płatności nie istnieje dla usera.
          // Ustaw metodę pod spodem (delta-aware) i przejdź na potwierdzenie.
          setAutoAdvancing(true);
          try {
            if (o.paymentMethod !== 'STRIPE_CHECKOUT') {
              await selectPaymentMethod(id, { paymentMethod: 'STRIPE_CHECKOUT' });
            }
            if (cancelled) return;
            navigateForward(`/checkout/confirm?orderId=${encodeURIComponent(id)}`);
          } catch (err) {
            if (cancelled) return;
            setHydrationError(translateApiError(err).message);
            setHydrating(false);
          }
          return;
        }
```

- [ ] **Step 4: Loader z copy „Przygotowujemy zamówienie…"**

Zamień blok:

```ts
  if (hydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">
        Ładowanie zamówienia…
      </div>
    );
  }
```

na:

```ts
  if (hydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">
        {autoAdvancing ? 'Przygotowujemy zamówienie…' : 'Ładowanie zamówienia…'}
      </div>
    );
  }
```

- [ ] **Step 5 (checkpoint):** Użytkownik może przejrzeć/commitnąć.

---

### Task 5: `ConfirmStep` — pominięcie Stripe + CTA + Wstecz + pasek

**Files:**
- Modify: `src/components/checkout/ConfirmStep.tsx`

**Interfaces:**
- Consumes: `isNoPaymentOrder` (Task 1), `paymentSkipped` prop (Task 3).

- [ ] **Step 1: Podmień import**

Zamień:

```ts
import { isPromoZeroOrder } from '../../lib/state/checkout-recovery';
```

na:

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

- [ ] **Step 2: Przebuduj `handleConfirm` (sygnał po `paymentRequired`)**

Zamień fragment od `const promoZero = isPromoZeroOrder(order);` do zamknięcia gałęzi BANK_TRANSFER:

```ts
    const orderId = order.orderId;
    const promoZero = isPromoZeroOrder(order);

    try {
      const result = await confirmOrder(orderId);

      if (result.paymentMethod === 'STRIPE_CHECKOUT') {
        const session = await createStripeCheckoutSession(orderId);
        window.location.href = session.url;
        return;
      }

      // BANK_TRANSFER
      if (promoZero) {
        // Flow C — no ProForma issued. Order already moves to PENDING_ALLOCATION.
        navigateForward(withOrderId('/checkout/success', orderId));
        return;
      }
      const token = result.confirmationToken ?? '';
      navigateForward(
        `/checkout/bank-transfer?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
```

na:

```ts
    const orderId = order.orderId;

    try {
      const result = await confirmOrder(orderId);

      // CC-534 — 0 zł „confirm-as-paid": brak etapu płatności → prosto na sukces.
      // Autorytatywnie po `paymentRequired` z odpowiedzi (nie po statusie — pipeline bywa szybki).
      if (isNoPaymentOrder(result)) {
        navigateForward(withOrderId('/checkout/success', orderId));
        return;
      }

      if (result.paymentMethod === 'STRIPE_CHECKOUT') {
        const session = await createStripeCheckoutSession(orderId);
        window.location.href = session.url;
        return;
      }

      // BANK_TRANSFER (płatny)
      const token = result.confirmationToken ?? '';
      navigateForward(
        `/checkout/bank-transfer?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
```

- [ ] **Step 3: Wylicz `noPayment` w renderze**

Zaraz po linii:

```ts
  const orderType: OrderType = getOrderSession()?.orderType ?? 'INITIAL_PURCHASE';
```

dodaj:

```ts
  const noPayment = isNoPaymentOrder(order);
```

- [ ] **Step 4: Przekaż `paymentSkipped` do paska**

Zamień:

```ts
        <CheckoutProgressBar currentStep={5} osSkipped={osSkipped} />
```

na:

```ts
        <CheckoutProgressBar currentStep={5} osSkipped={osSkipped} paymentSkipped={noPayment} />
```

- [ ] **Step 5: CTA + Wstecz zależne od `noPayment`**

Zamień blok `<FormActions … />`:

```ts
          <FormActions
            onBack={() => navigateBackward(withOrderId('/checkout/payment-method', orderId))}
            submitLabel={CTA_PER_TYPE[orderType]}
            submitting={confirming}
            submittingLabel="Potwierdzanie…"
          />
```

na:

```ts
          <FormActions
            onBack={() =>
              navigateBackward(
                withOrderId(
                  noPayment
                    ? osSkipped
                      ? '/checkout/personal-data'
                      : '/checkout/operational-standards'
                    : '/checkout/payment-method',
                  orderId,
                ),
              )
            }
            submitLabel={noPayment ? 'Aktywuj darmowy plan' : CTA_PER_TYPE[orderType]}
            submitting={confirming}
            submittingLabel="Potwierdzanie…"
          />
```

- [ ] **Step 6 (checkpoint):** Użytkownik może przejrzeć/commitnąć.

---

### Task 6: Migracja konsumentów + pasek w krokach 1–3

**Files:**
- Modify: `src/components/checkout/SuccessStatus.tsx`
- Modify: `src/components/checkout/ResumePaymentScreen.tsx`
- Modify: `src/components/checkout/CompanyDataStep.tsx`
- Modify: `src/components/checkout/PersonalDataStep.tsx`
- Modify: `src/components/checkout/OperationalStandardsStep.tsx`

**Interfaces:**
- Consumes: `isNoPaymentOrder` (Task 1), `paymentSkipped` prop (Task 3).

- [ ] **Step 1: `SuccessStatus` — usuń lokalny helper, użyj wspólnego**

Usuń lokalną funkcję (cały blok):

```ts
function isPromoZeroOrder(order: OrderResponseDto): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner =
    d.kind === 'PARTNER_FLAT' ||
    d.kind === 'PARTNER_COMPOSITE' ||
    d.kind === 'PARTNER_TIMEBOUND' ||
    d.kind === 'PARTNER_TIMEBOUND_COMPOSITE';
  return isPartner && d.priceAfterDiscount === 0;
}
```

Dodaj import (po `import { clearFormState } from '../../lib/state/form-persistence';`):

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

Zamień:

```ts
  const promoZero = isPromoZeroOrder(order);
```

na:

```ts
  const promoZero = isNoPaymentOrder(order);
```

- [ ] **Step 2: `ResumePaymentScreen` — podmień helper**

W bloku importu z `../../lib/state/checkout-recovery` zamień `isPromoZeroOrder,` na `isNoPaymentOrder,`:

```ts
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isNoPaymentOrder,
  canSwitchToBankTransfer,
} from '../../lib/state/checkout-recovery';
```

Zamień:

```ts
  const promoZero = order ? isPromoZeroOrder(order) : false;
```

na:

```ts
  const promoZero = order ? isNoPaymentOrder(order) : false;
```

- [ ] **Step 3: `CompanyDataStep` — pasek `paymentSkipped`**

Dodaj import (po `import { normalizeNip } from '../../lib/validation/nip';`):

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

Zamień:

```ts
        <CheckoutProgressBar currentStep={1} osSkipped={osSkipped} />
```

na:

```ts
        <CheckoutProgressBar currentStep={1} osSkipped={osSkipped} paymentSkipped={order ? isNoPaymentOrder(order) : false} />
```

- [ ] **Step 4: `PersonalDataStep` — pasek `paymentSkipped`**

Dodaj import (po `import { personalChanged } from '../../lib/state/checkout-delta';`):

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

Zamień:

```ts
        <CheckoutProgressBar currentStep={2} osSkipped={osSkipped} />
```

na:

```ts
        <CheckoutProgressBar currentStep={2} osSkipped={osSkipped} paymentSkipped={order ? isNoPaymentOrder(order) : false} />
```

- [ ] **Step 5: `OperationalStandardsStep` — pasek `paymentSkipped`**

Dodaj import (po `import { osChanged } from '../../lib/state/checkout-delta';`):

```ts
import { isNoPaymentOrder } from '../../lib/state/checkout-recovery';
```

Zamień:

```ts
        <CheckoutProgressBar currentStep={3} />
```

na:

```ts
        <CheckoutProgressBar currentStep={3} paymentSkipped={order ? isNoPaymentOrder(order) : false} />
```

- [ ] **Step 6 (checkpoint):** Użytkownik może przejrzeć/commitnąć.

---

### Task 7: Weryfikacja (batch) + QA manualne

**Files:** — (bez zmian)

- [ ] **Step 1: Testy jednostkowe**

Run: `npm run test:run`
Expected: nowe/zmienione testy w `checkout-recovery.test.ts` (`isNoPaymentOrder`, `canSwitchToBankTransfer`) PASS. Liczba pozostałych failów **nie większa** niż baseline (~17 istniejących, niezwiązanych). Brak nowego failu wskazującego na `isPromoZeroOrder` / brakujący import.

- [ ] **Step 2: Build / typecheck**

Run: `npm run build`
Expected: build przechodzi. (Jeśli używasz `astro check` — liczba błędów nie większa niż baseline ~69; brak nowych błędów o nieznanym `paymentRequired` / `isPromoZeroOrder`.)

- [ ] **Step 3: QA manualne — ścieżka 0 zł**

1. `npm run dev`, otwórz `/cennik?partner=TIMEBOUND_DEMO` (mock: `PARTNER_TIMEBOUND` 0 zł na Standard) — upewnij się, że działa mock (`PUBLIC_USE_MOCK_ORDERS=true`, `PUBLIC_USE_MOCK_CATALOG=true`).
2. Wybierz plan **Standard** → wypełnij dane firmy → dane osobowe.
3. Oczekiwane: **brak ekranu wyboru płatności** (krótki loader „Przygotowujemy zamówienie…") → od razu ekran potwierdzenia.
4. Pasek postępu: Dane organizacji → Dane osobiste → Potwierdzenie (bez „Standardy" i bez „Płatność").
5. Guzik potwierdzenia: **„Aktywuj darmowy plan"**. Klik → **bez** przekierowania na Stripe → ekran sukcesu („Do zapłaty teraz: 0,00 zł").
6. „Wstecz" z potwierdzenia → wraca na „Dane osobowe" (omija płatność), nie zapętla.

- [ ] **Step 4: QA manualne — regres ścieżki płatnej**

1. `/cennik` (bez partnera) → wybierz **Optimum** (roczny).
2. Oczekiwane: krok „Płatność" **widoczny** (karta + przelew), pasek pokazuje „Płatność".
3. Confirm → guzik „Zamawiam z obowiązkiem zapłaty" (INITIAL_PURCHASE) → przekierowanie na Stripe (mock: sesja) — ścieżka płatna niezmieniona.

- [ ] **Step 5 (checkpoint):** Zgłoś użytkownikowi wynik weryfikacji (co przeszło, co jest baseline). Commit końcowy kontroluje użytkownik.

---

## Self-Review (wynik)

- **Spec coverage:** §4.1→Task 4; §4.2→Task 5; §4.3→Task 3; §4.4→Task 6 (Steps 3-5); §4.5→Task 6 Step 1; §4.6→Task 1 Step 3 + Task 6 Steps 1-2; §4.7→Task 1 Steps 1-2 + Task 2. §3 (sygnał + bezpieczna semantyka) zaszyte w Task 1 (`isNoPaymentOrder`) i wykorzystane w Task 4/5. §7 testy→Task 1 Step 4 + Task 7.
- **Placeholder scan:** brak TBD/„handle errors" — każdy krok ma konkretny kod/komendę.
- **Type consistency:** `paymentRequired?: boolean` spójne w obu DTO i w mocku; `isNoPaymentOrder(o: { paymentRequired?: boolean })` przyjmuje `OrderResponseDto` i `ConfirmOrderResponseDto`; `canSwitchToBankTransfer` Pick zaktualizowany do `paymentRequired`; `paymentSkipped` prop identyczny w ProgressBar i u wszystkich wołających.
- **Uwaga wykonawcza:** ze względu na preferencję „batch verification", drzewo musi kompilować się dopiero po Tasku 6 (Task 1 usuwa `isPromoZeroOrder`, konsumenci migrowani w Taskach 5-6). Kolejność 1→…→6 zapewnia stan końcowy spójny.
