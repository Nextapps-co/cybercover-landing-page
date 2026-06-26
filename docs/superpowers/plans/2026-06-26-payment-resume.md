# Wznawianie porzuconej płatności (Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domknąć wznawianie porzuconej płatności Stripe (natywny „wstecz" + powrót na /cennik) przez jeden ekran wznowienia, bez zmian backendu.

**Architecture:** Współdzielony helper `pending-order.ts` (czysta klasyfikacja `classifyOrder` + async `resolvePendingOrder`) jest jedynym źródłem prawdy o statusie zamówienia. Jeden komponent `ResumePaymentScreen` z propem `variant` obsługuje zarówno cancel ze Stripe, jak i resume. Dwa punkty detekcji (`ConfirmStep` guard + `PricingCards` mount) kierują na ekran wznowienia.

**Tech Stack:** Astro (multi-page, islands), React (funkcyjne komponenty + useState/useEffect), TypeScript, Tailwind v4, Vitest + happy-dom.

## Global Constraints

- **Język UI: polski**, prosto, bez żargonu (dla właścicieli firm bez działu IT).
- **Brak zmian backendu** — `createStripeCheckoutSession` akceptuje już status `CONFIRMED`.
- **Testy: tylko `src/lib/`** (czyste funkcje). Komponenty/strony bez testów jednostkowych — brak `@vitejs/plugin-react` (konwencja repo).
- **Money: grosze** (minor units) jako `number`.
- **Git: NIE wykonujemy commitów** — commity są w gestii użytkownika. Żaden krok nie uruchamia `git`.
- **Weryfikacja build/typecheck/pełny test suite: batchowana na końcu** (Task 5), nie po każdym tasku.
- Wartości statusów (`OrderStatus`): `DRAFT | CONFIRMED | PENDING_ALLOCATION | PROCESSING | FULFILLED | CLOSED | CANCELLED`.
- Wartości `PaymentMethod`: `STRIPE_CHECKOUT | BANK_TRANSFER`.

---

### Task 1: Helper `pending-order.ts` + testy

**Files:**
- Create: `src/lib/state/pending-order.ts`
- Test: `src/lib/state/pending-order.test.ts`

**Interfaces:**
- Consumes: `getOrder` z `src/lib/api/orders.ts` (`(orderId: string) => Promise<OrderResponseDto>`); `getOrderSession`, `clearOrderSession` z `src/lib/state/order-session.ts`; `ApiError` z `src/lib/api/types/errors.ts`; typ `OrderResponseDto` z `src/lib/api/types/order.ts`.
- Produces:
  - `type PendingOrderKind = 'resumable' | 'paid' | 'dead' | 'draft'`
  - `type PendingOrderResolution = { kind: 'none' } | { kind: 'resumable' | 'paid' | 'dead' | 'draft'; orderId: string }`
  - `function classifyOrder(order: OrderResponseDto): PendingOrderKind`
  - `function resolvePendingOrder(): Promise<PendingOrderResolution>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/state/pending-order.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { classifyOrder, resolvePendingOrder } from './pending-order';
import { persistToStorage, clearSession, type OrderSession } from './order-session';
import { getOrder } from '../api/orders';
import { ApiError } from '../api/types/errors';
import type { OrderResponseDto } from '../api/types/order';

vi.mock('../api/orders', () => ({ getOrder: vi.fn() }));
const mockGetOrder = vi.mocked(getOrder);

const session = (): OrderSession => ({
  orderId: 'ord_abc',
  catalogEntryId: 'ce_optimum',
  billingCycle: 'MONTHLY',
  planSnapshot: { planName: 'Optimum', priceMinorUnits: 49500, currency: 'PLN', description: 'x' },
  createdAt: '2026-06-26T10:00:00.000Z',
});

const order = (over: Partial<OrderResponseDto>): OrderResponseDto => ({
  orderId: 'ord_abc',
  status: 'CONFIRMED',
  billingCycle: 'MONTHLY',
  paymentMethod: 'STRIPE_CHECKOUT',
  checkoutProgress: { hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: true },
  companyData: null,
  personalData: null,
  lines: [],
  totalPriceNet: 49500,
  currency: 'PLN',
  discount: null,
  proration: null,
  eligibilityResult: null,
  createdAt: '2026-06-26T10:00:00.000Z',
  ...over,
});

describe('classifyOrder', () => {
  it('CONFIRMED + STRIPE_CHECKOUT → resumable', () => {
    expect(classifyOrder(order({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT' }))).toBe('resumable');
  });
  it('CONFIRMED + BANK_TRANSFER → paid', () => {
    expect(classifyOrder(order({ status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER' }))).toBe('paid');
  });
  it.each(['PENDING_ALLOCATION', 'PROCESSING', 'FULFILLED'] as const)('%s → paid', (status) => {
    expect(classifyOrder(order({ status }))).toBe('paid');
  });
  it.each(['CANCELLED', 'CLOSED'] as const)('%s → dead', (status) => {
    expect(classifyOrder(order({ status }))).toBe('dead');
  });
  it('DRAFT → draft', () => {
    expect(classifyOrder(order({ status: 'DRAFT' }))).toBe('draft');
  });
});

describe('resolvePendingOrder', () => {
  beforeEach(() => {
    clearSession();
    mockGetOrder.mockReset();
  });

  it('no session → none', async () => {
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
    expect(mockGetOrder).not.toHaveBeenCalled();
  });

  it('resumable order → resumable + orderId', async () => {
    persistToStorage(session());
    mockGetOrder.mockResolvedValue(order({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT' }));
    expect(await resolvePendingOrder()).toEqual({ kind: 'resumable', orderId: 'ord_abc' });
  });

  it('paid order → paid + orderId', async () => {
    persistToStorage(session());
    mockGetOrder.mockResolvedValue(order({ status: 'PROCESSING' }));
    expect(await resolvePendingOrder()).toEqual({ kind: 'paid', orderId: 'ord_abc' });
  });

  it('ORDER_NOT_FOUND → none and clears session', async () => {
    persistToStorage(session());
    mockGetOrder.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'gone'));
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
    expect(window.sessionStorage.getItem('cybercover:order-session')).toBeNull();
  });

  it('network error → none (fail-open)', async () => {
    persistToStorage(session());
    mockGetOrder.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'));
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/state/pending-order.test.ts`
Expected: FAIL — `pending-order.ts` nie istnieje / brak eksportów `classifyOrder`, `resolvePendingOrder`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/state/pending-order.ts`:

```ts
// Jedno źródło prawdy o tym, czy istnieje wznawialne zamówienie.
// Patrz docs/superpowers/specs/2026-06-26-payment-resume-design.md.

import type { OrderResponseDto } from '../api/types/order';
import { getOrder } from '../api/orders';
import { ApiError } from '../api/types/errors';
import { getOrderSession, clearOrderSession } from './order-session';

export type PendingOrderKind = 'resumable' | 'paid' | 'dead' | 'draft';

export type PendingOrderResolution =
  | { kind: 'none' }
  | { kind: PendingOrderKind; orderId: string };

/**
 * Czysta klasyfikacja zamówienia po statusie + metodzie płatności.
 * - resumable: CONFIRMED + STRIPE_CHECKOUT (czeka na opłacenie przez Stripe)
 * - paid:      opłacone/przetwarzane, lub CONFIRMED + BANK_TRANSFER
 * - dead:      CANCELLED / CLOSED
 * - draft:     wizard niedokończony (poza zakresem resume)
 */
export function classifyOrder(order: OrderResponseDto): PendingOrderKind {
  switch (order.status) {
    case 'DRAFT':
      return 'draft';
    case 'CONFIRMED':
      return order.paymentMethod === 'STRIPE_CHECKOUT' ? 'resumable' : 'paid';
    case 'PENDING_ALLOCATION':
    case 'PROCESSING':
    case 'FULFILLED':
      return 'paid';
    case 'CANCELLED':
    case 'CLOSED':
      return 'dead';
  }
}

/**
 * Czyta orderId z sessionStorage, hydratuje z getOrder i klasyfikuje.
 * Fail-open: każdy błąd (brak sesji, ORDER_NOT_FOUND, sieć) → { kind: 'none' },
 * żeby nie blokować wejścia na /cennik. ORDER_NOT_FOUND dodatkowo czyści stale sesję.
 */
export async function resolvePendingOrder(): Promise<PendingOrderResolution> {
  const session = getOrderSession();
  if (!session) return { kind: 'none' };

  try {
    const order = await getOrder(session.orderId);
    return { kind: classifyOrder(order), orderId: order.orderId };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ORDER_NOT_FOUND') {
      clearOrderSession();
    }
    return { kind: 'none' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/state/pending-order.test.ts`
Expected: PASS (wszystkie przypadki classifyOrder + resolvePendingOrder).

- [ ] **Step 5: Checkpoint (bez commitu)**

Nie uruchamiamy git. Zostaw zmiany do review/commitu przez użytkownika.

---

### Task 2: Komponent `ResumePaymentScreen` + trasy

**Files:**
- Create: `src/components/checkout/ResumePaymentScreen.tsx`
- Delete: `src/components/checkout/StripeCancelledRetry.tsx`
- Modify: `src/pages/checkout/cancelled.astro`
- Create: `src/pages/checkout/resume.astro`

**Interfaces:**
- Consumes: `createStripeCheckoutSession`, `getOrder` z `src/lib/api/orders.ts`; `translateApiError`; `navigateForward`, `navigateBackward` z `checkout-transition`; `clearOrderSession` z `order-session`; `clearFormState` z `form-persistence`; `FormAlert`.
- Produces: `function ResumePaymentScreen(props: { variant: 'cancelled' | 'resume' }): JSX.Element`.

- [ ] **Step 1: Utwórz `ResumePaymentScreen.tsx`**

Create `src/components/checkout/ResumePaymentScreen.tsx` (refaktor `StripeCancelledRetry` — dochodzi `variant` + akcja „Zacznij od nowa"):

```tsx
import { useEffect, useState } from 'react';
import { FormAlert } from './FormAlert';
import { createStripeCheckoutSession, getOrder } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import { clearOrderSession } from '../../lib/state/order-session';
import { clearFormState } from '../../lib/state/form-persistence';
import type { OrderResponseDto } from '../../lib/api/types/order';

type Variant = 'cancelled' | 'resume';

const COPY: Record<Variant, { title: string; subtitle: string; primary: string }> = {
  cancelled: {
    title: 'Płatność anulowana',
    subtitle: 'Możesz spróbować ponownie albo wybrać inną metodę płatności.',
    primary: 'Spróbuj ponownie',
  },
  resume: {
    title: 'Masz niedokończoną płatność',
    subtitle: 'Twoje zamówienie czeka na opłacenie. Dokończ płatność lub zmień metodę.',
    primary: 'Dokończ płatność',
  },
};

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId') ?? params.get('order_id');
}

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

export function ResumePaymentScreen({ variant }: { variant: Variant }) {
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[variant];

  useEffect(() => {
    let cancelled = false;
    const id = readOrderIdFromUrl();
    if (!id) { setHydrating(false); return; }

    (async () => {
      try {
        const o = await getOrder(id);
        if (cancelled) return;
        setOrder(o);
        setHydrating(false);
      } catch (err) {
        if (cancelled) return;
        setHydrationError(translateApiError(err).message);
        setHydrating(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleRetry = async () => {
    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    setRetrying(true);
    setError(null);
    try {
      const session = await createStripeCheckoutSession(id);
      window.location.href = session.url;
    } catch (err) {
      setError(translateApiError(err).message);
      setRetrying(false);
    }
  };

  const handleChangeMethod = () => {
    const id = readOrderIdFromUrl();
    navigateBackward(`/checkout/payment-method${id ? `?orderId=${encodeURIComponent(id)}` : ''}`);
  };

  const handleSkipSetup = () => {
    const id = readOrderIdFromUrl();
    navigateForward(`/checkout/success${id ? `?orderId=${encodeURIComponent(id)}` : ''}`);
  };

  const handleStartOver = () => {
    clearOrderSession();
    clearFormState();
    window.location.assign('/cennik');
  };

  if (hydrating) {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Sprawdzamy status zamówienia…</div>;
  }
  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">Wróć do cennika</a>
      </div>
    );
  }

  const promoZero = order ? isPromoZeroOrder(order) : false;

  return (
    <div className="bg-white py-12 px-4">
      <div className="mx-auto max-w-xl text-center font-['Plus_Jakarta_Sans',sans-serif] space-y-4">
        {promoZero ? (
          <>
            <h1 className="text-3xl font-bold text-[#0D0D0D]">Twoja subskrypcja jest aktywna</h1>
            <p className="text-sm text-[#6B6965]">
              Promocja partnerska pokrywa całą kwotę w okresie startowym, więc nie potrzebowaliśmy pobierać teraz
              płatności. Aby kontynuować subskrypcję po okresie promocyjnym, dodaj kartę — możesz to zrobić teraz
              albo później w Portalu Klienta.
            </p>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Przekierowuję…' : 'Dodaj kartę teraz'}
              </button>
              <button
                type="button"
                onClick={handleSkipSetup}
                className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
              >
                Pomiń — zrobię później
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[#0D0D0D]">{copy.title}</h1>
            <p className="text-sm text-[#6B6965]">{copy.subtitle}</p>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Przekierowuję…' : copy.primary}
              </button>
              <button
                type="button"
                onClick={handleChangeMethod}
                className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
              >
                Zmień metodę płatności
              </button>
              {variant === 'resume' && (
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="rounded-[80px] px-7 py-3 text-base font-semibold text-[#6B6965] underline hover:text-[#0D0D0D]"
                >
                  Zacznij od nowa
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Zaktualizuj `cancelled.astro`**

W `src/pages/checkout/cancelled.astro` zmień import i render z `StripeCancelledRetry` na `ResumePaymentScreen` z wariantem `cancelled`:

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { ResumePaymentScreen } from '../../components/checkout/ResumePaymentScreen';

// On-demand render, żeby access gate w `src/middleware.ts` mógł chronić tę trasę.
export const prerender = false;
---
<CheckoutLayout
  title="Płatność anulowana — CyberCover"
  description="Spróbuj ponownie lub wybierz inną metodę płatności"
  showBackButton={false}
>
  <ResumePaymentScreen variant="cancelled" client:load />
</CheckoutLayout>
```

- [ ] **Step 3: Utwórz `resume.astro`**

Create `src/pages/checkout/resume.astro`:

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { ResumePaymentScreen } from '../../components/checkout/ResumePaymentScreen';

// On-demand render, żeby access gate w `src/middleware.ts` mógł chronić tę trasę.
export const prerender = false;
---
<CheckoutLayout
  title="Dokończ płatność — CyberCover"
  description="Masz niedokończone zamówienie czekające na opłacenie"
  showBackButton={false}
>
  <ResumePaymentScreen variant="resume" client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Usuń stary komponent**

Usuń plik `src/components/checkout/StripeCancelledRetry.tsx`. Upewnij się, że nie ma do niego innych referencji:

Run: `npm exec -- grep -r "StripeCancelledRetry" src` (lub odpowiednik) — oczekiwane: brak wyników (poza ewentualnie historią).

- [ ] **Step 5: Checkpoint (bez commitu)**

Nie uruchamiamy git. Pozostaw do review.

---

### Task 3: Guard w `ConfirmStep` (naprawa natywnego „wstecz")

**Files:**
- Modify: `src/components/checkout/ConfirmStep.tsx`

**Interfaces:**
- Consumes: `classifyOrder` z `src/lib/state/pending-order.ts`; istniejące `navigateForward` (już importowane), `getOrder`, `resolveOsSkipped`.
- Produces: brak nowych eksportów (zmiana wewnętrzna).

- [ ] **Step 1: Dodaj import `classifyOrder`**

W `src/components/checkout/ConfirmStep.tsx`, obok istniejących importów stanu, dodaj:

```ts
import { classifyOrder } from '../../lib/state/pending-order';
```

- [ ] **Step 2: Dodaj guard na status non-DRAFT**

W `useEffect`, wewnątrz bloku `try`, **po** `setOsSkipped(skipped);` a **przed** istniejącym `if (!canAccessStep(4, ...))`, wstaw:

```ts
// Zamówienie już potwierdzone (np. powrót natywnym „wstecz" ze Stripe).
// Zamiast pozwolić na re-confirm (→ INVALID_ORDER_STATE) kierujemy na właściwy ekran.
if (o.status !== 'DRAFT') {
  switch (classifyOrder(o)) {
    case 'resumable':
      navigateForward(`/checkout/resume?orderId=${encodeURIComponent(id)}`);
      return;
    case 'paid':
      navigateForward(`/checkout/success?orderId=${encodeURIComponent(id)}`);
      return;
    case 'dead':
      window.location.assign('/cennik');
      return;
    // 'draft' nie wystąpi (status !== 'DRAFT')
  }
}
```

Kontekst — fragment po zmianie wygląda tak:

```ts
const [o, skipped] = await Promise.all([getOrder(id), resolveOsSkipped(id)]);
if (cancelled) return;
setOsSkipped(skipped);

if (o.status !== 'DRAFT') {
  switch (classifyOrder(o)) {
    case 'resumable':
      navigateForward(`/checkout/resume?orderId=${encodeURIComponent(id)}`);
      return;
    case 'paid':
      navigateForward(`/checkout/success?orderId=${encodeURIComponent(id)}`);
      return;
    case 'dead':
      window.location.assign('/cennik');
      return;
  }
}

if (!canAccessStep(4, o.checkoutProgress) || !o.checkoutProgress.hasPaymentMethod) {
  // ... bez zmian
}
```

- [ ] **Step 3: Checkpoint (bez commitu)**

Weryfikacja manualna nastąpi w Task 5. Nie uruchamiamy git.

---

### Task 4: Detekcja na mount `/cennik` (`PricingCards`)

**Files:**
- Modify: `src/components/pricing/PricingCards.tsx`

**Interfaces:**
- Consumes: `resolvePendingOrder` z `src/lib/state/pending-order.ts`; `clearOrderSession` z `src/lib/state/order-session.ts` (dodaj do istniejącego importu obok `setFromStartOrderResponse`).
- Produces: brak nowych eksportów (zmiana wewnętrzna).

- [ ] **Step 1: Zaktualizuj importy**

W `src/components/pricing/PricingCards.tsx`:

```ts
// było:
import { setFromStartOrderResponse } from '../../lib/state/order-session';
// na:
import { setFromStartOrderResponse, clearOrderSession } from '../../lib/state/order-session';
```

oraz dodaj:

```ts
import { resolvePendingOrder } from '../../lib/state/pending-order';
```

- [ ] **Step 2: Dodaj detekcję na początku async bloku w głównym `useEffect`**

W głównym `useEffect`, na samym początku async IIFE (przed `consumeMockAuthFromUrl();`), wstaw:

```ts
// Resume porzuconej płatności: jeśli w tej sesji jest niedokończone zamówienie,
// kieruj na właściwy ekran zanim pokażemy cennik. Pomijamy dla auth-aware entry
// (?handoff= / ?mockAuth=), które ma własną obsługę 409 PLAN_CHANGE_PENDING w onCtaClick.
const entryParams = new URLSearchParams(window.location.search);
if (!entryParams.has('handoff') && !entryParams.has('mockAuth')) {
  const pending = await resolvePendingOrder();
  if (cancelled) return;
  if (pending.kind === 'resumable') {
    window.location.assign(`/checkout/resume?orderId=${encodeURIComponent(pending.orderId)}`);
    return;
  }
  if (pending.kind === 'paid') {
    window.location.assign(`/checkout/success?orderId=${encodeURIComponent(pending.orderId)}`);
    return;
  }
  if (pending.kind === 'dead') {
    clearOrderSession();
  }
  // 'draft' / 'none' → renderuj cennik normalnie (bez zmian)
}
```

Kontekst — początek async bloku po zmianie:

```ts
(async () => {
  // Resume porzuconej płatności (jak wyżej)...
  const entryParams = new URLSearchParams(window.location.search);
  if (!entryParams.has('handoff') && !entryParams.has('mockAuth')) {
    const pending = await resolvePendingOrder();
    if (cancelled) return;
    if (pending.kind === 'resumable') { window.location.assign(`/checkout/resume?orderId=${encodeURIComponent(pending.orderId)}`); return; }
    if (pending.kind === 'paid') { window.location.assign(`/checkout/success?orderId=${encodeURIComponent(pending.orderId)}`); return; }
    if (pending.kind === 'dead') { clearOrderSession(); }
  }

  // 0. Dev shortcut — ?mockAuth= ...
  consumeMockAuthFromUrl();
  // ... reszta bez zmian
```

- [ ] **Step 3: Checkpoint (bez commitu)**

Weryfikacja manualna nastąpi w Task 5.

---

### Task 5: Weryfikacja batchowa (typecheck + testy)

**Files:** brak zmian — wyłącznie weryfikacja.

- [ ] **Step 1: Pełny test suite**

Run: `npm run test:run`
Expected: nowy `pending-order.test.ts` przechodzi. Pozostałe wyniki na poziomie baseline repo (znane 17 pre-existing failures niezwiązane z tą zmianą — patrz pamięć projektu).

- [ ] **Step 2: Typecheck / astro check**

Run: `npm exec -- astro check`
Expected: brak NOWYCH błędów wprowadzonych przez tę zmianę (baseline repo ma ~69 znanych błędów — nie wprowadzamy kolejnych w dotkniętych plikach).

- [ ] **Step 3: Build (sanity)**

Run: `npm run build`
Expected: build przechodzi; trasy `/checkout/resume` i `/checkout/cancelled` renderują się (on-demand, `prerender=false`).

- [ ] **Step 4: Smoke manualny (mock)**

Z `PUBLIC_USE_MOCK_ORDERS=true`, `npm run dev`:
1. Przejdź checkout do `/checkout/confirm`, potwierdź (Stripe) — wróć natywnym „wstecz" → powinien przekierować na `/checkout/resume` z 3 akcjami.
2. Z ekranu resume: „Dokończ płatność" → ponowny redirect na Stripe; „Zmień metodę" → `/checkout/payment-method`; „Zacznij od nowa" → `/cennik` (sesja wyczyszczona).
3. Po potwierdzeniu wejdź ręcznie na `/cennik` (ta sama karta) → auto-redirect na `/checkout/resume`.
4. `/cennik?mockAuth=optimum-ACTIVE` → detekcja resume **pominięta** (auth-aware flow działa jak dawniej).

- [ ] **Step 5: Handoff do użytkownika**

Zgłoś wyniki weryfikacji. Commity pozostają w gestii użytkownika (zgodnie z regułą „bez git").

---

## Self-Review

**Spec coverage:**
- Helper `classifyOrder` + `resolvePendingOrder` → Task 1. ✅
- `ResumePaymentScreen` z `variant` + 3. akcja, usunięcie `StripeCancelledRetry` → Task 2. ✅
- Trasy `cancelled.astro` (variant cancelled) + nowa `resume.astro` → Task 2. ✅
- Guard `ConfirmStep` (back-button) → Task 3. ✅
- Detekcja `PricingCards` mount + skip handoff/mockAuth → Task 4. ✅
- Stany brzegowe (ORDER_NOT_FOUND, sieć, paid, bank-transfer, dead) → Task 1 (logika) + Task 3/4 (routing). ✅
- Testy tylko `src/lib/` → Task 1. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok z kodem zawiera pełny kod. ✅

**Type consistency:** `classifyOrder`/`resolvePendingOrder`/`PendingOrderResolution`/`PendingOrderKind` użyte spójnie w Task 1/3/4. `ResumePaymentScreen({ variant })` użyte spójnie w Task 2 (oba .astro). ✅
