# Wznawianie porzuconej płatności (Stripe) — design

**Data:** 2026-06-26
**Status:** Zaakceptowany do implementacji
**Zakres:** Frontend only (zero zmian backendu)

## Problem

Po potwierdzeniu zamówienia (`ConfirmStep` → `confirmOrder` → `createStripeCheckoutSession` →
`window.location.href = session.url`) użytkownik trafia na `checkout.stripe.com`. Gdy go opuści,
flow ma luki:

1. **Natywny przycisk „wstecz"** → wraca na `/checkout/confirm`. Zamówienie jest już `CONFIRMED`,
   więc ponowne kliknięcie CTA woła `confirmOrder` → backend/mock rzuca `INVALID_ORDER_STATE` (409,
   `orders.mock.ts:636`). Użytkownik widzi generyczny błąd — ślepy zaułek.
2. **Powrót na `/cennik`** → kliknięcie planu tworzy **nowe** zamówienie; stare `CONFIRMED`
   zostaje osierocone, a użytkownik nie ma ścieżki do dokończenia poprzedniej płatności.

Jedyny istniejący mechanizm wznowienia (`/checkout/cancelled` → `StripeCancelledRetry`) działa
tylko wtedy, gdy to **Stripe** odeśle użytkownika na `cancel_url`.

## Cel

Domknąć dwa punkty wejścia do wznowienia płatności w obrębie tej samej sesji przeglądarki:
- naprawiony natywny „wstecz" na `/checkout/*`,
- detekcja niedokończonego zamówienia przy wejściu na `/cennik`.

Oba prowadzą do jednego, spójnego **ekranu wznowienia** z akcjami.

## Decyzje (z brainstormingu)

| Pytanie | Decyzja |
|---|---|
| Punkt wejścia | sessionStorage (powrót na stronę) + naprawa natywnego „wstecz" |
| Co widzi user | dedykowany ekran wznowienia z wyborem akcji |
| „Zacznij od nowa" | tylko czyszczenie lokalne (sessionStorage), zero BE |
| Detekcja na `/cennik` | przy wejściu (mount `PricingCards`) |
| Backend | bez zmian — `createStripeCheckoutSession` akceptuje już `CONFIRMED` (`orders.mock.ts:715`) |

## Zakres — co JEST i czego NIE MA

**JEST:**
- Resume zamówień w stanie `CONFIRMED` z `paymentMethod === 'STRIPE_CHECKOUT'`.
- Detekcja w 2 miejscach: mount `PricingCards` (/cennik) i guard w `ConfirmStep` (/checkout/confirm).
- Jeden ekran wznowienia z 3 akcjami: Dokończ płatność / Zmień metodę płatności / Zacznij od nowa.

**NIE MA (poza zakresem):**
- Wznawiania przez e-mail / link na inne urządzenie (wymagałoby BE).
- Reconciliation / auto-anulowania osieroconych zamówień (BE).
- Wznawiania niedokończonego **wizardu** (`DRAFT`) — to inny problem; obecne zachowanie bez zmian.
- Resume dla `BANK_TRANSFER` (brak abandonu Stripe; token proformy niedostępny po fakcie) — patrz
  Obsługa stanów brzegowych.

## Architektura (Podejście A)

Trzy elementy: **współdzielony helper klasyfikujący**, **jeden komponent ekranu z wariantem**,
**dwa punkty detekcji** kierujące na ten ekran.

### 1. Helper: `src/lib/state/pending-order.ts`

Jedno źródło prawdy „czy istnieje wznawialne zamówienie".

```ts
export type PendingOrderKind = 'resumable' | 'paid' | 'dead' | 'draft';

export type PendingOrderResolution =
  | { kind: 'none' }                                  // brak sesji / brak orderId / błąd
  | { kind: 'resumable'; orderId: string }            // CONFIRMED + STRIPE_CHECKOUT
  | { kind: 'paid'; orderId: string }                 // opłacone/processing lub CONFIRMED+BANK_TRANSFER
  | { kind: 'dead'; orderId: string }                 // CANCELLED/CLOSED
  | { kind: 'draft'; orderId: string };               // DRAFT (wizard niedokończony — poza zakresem)

// Czysta, synchroniczna klasyfikacja po statusie + metodzie płatności.
export function classifyOrder(order: OrderResponseDto): PendingOrderKind;

// Async: czyta sessionStorage → getOrder → classifyOrder.
export async function resolvePendingOrder(): Promise<PendingOrderResolution>;
```

`classifyOrder(order)` (czysta, sync) — jedna tabela prawdy używana przez OBA punkty detekcji:
- `CONFIRMED` + `STRIPE_CHECKOUT` → `'resumable'`
- `PENDING_ALLOCATION` | `PROCESSING` | `FULFILLED` → `'paid'`
- `CONFIRMED` + `BANK_TRANSFER` → `'paid'` (kieruj na success — patrz niżej)
- `CANCELLED` | `CLOSED` → `'dead'`
- `DRAFT` → `'draft'`

`resolvePendingOrder()` (async, dla `/cennik`):
1. `getOrderSession()` z `order-session.ts`; brak → `{ kind: 'none' }`.
2. `getOrder(session.orderId)`; `ORDER_NOT_FOUND` → `{ kind: 'none' }` (i `clearOrderSession()`);
   inny błąd sieciowy → `{ kind: 'none' }` (fail-open: nie blokuj `/cennik` przez błąd hydratacji).
3. `kind = classifyOrder(order)` → zwróć `{ kind, orderId }`.

`ConfirmStep` ma już pobrany `OrderResponseDto`, więc woła **bezpośrednio `classifyOrder(o)`** —
bez drugiego `getOrder`. To eliminuje dublowanie i daje jeden punkt prawdy o mapowaniu statusów.

### 2. Komponent ekranu: `ResumePaymentScreen`

Refaktor istniejącego `StripeCancelledRetry.tsx` → `ResumePaymentScreen.tsx` z propem
`variant: 'cancelled' | 'resume'`. Logika hydratacji + retry zostaje; różni się tylko nagłówek
i dochodzi 3. akcja.

| Element | `variant='cancelled'` (powrót ze Stripe) | `variant='resume'` (wstecz / /cennik) |
|---|---|---|
| Nagłówek | „Płatność anulowana" | „Masz niedokończoną płatność" |
| Podtytuł | „Możesz spróbować ponownie albo wybrać inną metodę." | „Twoje zamówienie czeka na opłacenie. Dokończ płatność lub zmień metodę." |
| Akcja 1 | „Spróbuj ponownie" → `createStripeCheckoutSession` → redirect | identycznie (label „Dokończ płatność") |
| Akcja 2 | „Zmień metodę płatności" → `/checkout/payment-method` | identycznie |
| Akcja 3 | (brak) | „Zacznij od nowa" → `clearOrderSession()` + `clearFormState()` + `window.location.assign('/cennik')` |

Ścieżka `promo-zero` (partner discount → 0 zł) z obecnego `StripeCancelledRetry` zostaje
zachowana bez zmian (osobna gałąź renderu).

> Uwaga: akcja „Zacznij od nowa" świadomie zostawia zamówienie `CONFIRMED` na backendzie jako
> osierocone (decyzja: tylko czyszczenie lokalne). Backend może je później auto-anulować — poza
> zakresem tego zadania.

### 3. Trasy

- `src/pages/checkout/cancelled.astro` — renderuje `<ResumePaymentScreen variant="cancelled" />`.
  Pozostaje celem Stripe `cancel_url` (brak zmian BE).
- **Nowa** `src/pages/checkout/resume.astro` — renderuje `<ResumePaymentScreen variant="resume" />`.
  `export const prerender = false` (jak pozostałe `/checkout/*`, dla access gate w `middleware.ts`).
  Cel redirectów z detekcji.

Obie strony czytają `orderId` z query (`?orderId=`), zgodnie z obecnym `readOrderIdFromUrl`
w komponencie.

### 4. Punkty detekcji

**a) `ConfirmStep.tsx` (guard na mount)** — w istniejącym `useEffect` po `getOrder`, przed
sprawdzeniem `canAccessStep`:

```
if (o.status !== 'DRAFT') {
  switch (classifyOrder(o)) {
    case 'resumable': navigateForward('/checkout/resume?orderId=' + id); return;
    case 'paid':      navigateForward('/checkout/success?orderId=' + id); return;
    case 'dead':      window.location.assign('/cennik'); return;
    // 'draft' nie wystąpi w tej gałęzi (status !== 'DRAFT')
  }
}
```

To zastępuje obecny ślepy zaułek (re-confirm → `INVALID_ORDER_STATE`) i używa tego samego
`classifyOrder` co `/cennik` — bez drugiego `getOrder` (order już pobrany w `useEffect`).

**b) `PricingCards.tsx` (mount /cennik)** — na początku głównego `useEffect`, **przed** handoff
detection i `getPlans`:

```
// Skip gdy auth-aware entry (?handoff= / ?mockAuth=) — user przyszedł celowo z portalu.
if (!params.has('handoff') && !params.has('mockAuth')) {
  const pending = await resolvePendingOrder();
  if (pending.kind === 'resumable') {
    window.location.assign('/checkout/resume?orderId=' + pending.orderId);
    return; // nie renderuj cennika
  }
  if (pending.kind === 'paid') {
    window.location.assign('/checkout/success?orderId=' + pending.orderId);
    return;
  }
  // 'dead'/'draft'/'none' → sprzątnij ewentualne śmieci i renderuj cennik normalnie
  if (pending.kind === 'dead') clearOrderSession();
}
```

Rationale skip dla `handoff`/`mockAuth`: auth-aware flow ma własną obsługę 409 PLAN_CHANGE_PENDING
w `onCtaClick` — nie chcemy jej przykrywać detekcją anonimowego pending order.

## Przepływ danych

```
[Stripe abandon — wstecz przeglądarki]
  → /checkout/confirm (mount)
  → getOrder → status=CONFIRMED, STRIPE
  → navigateForward(/checkout/resume?orderId=)
  → ResumePaymentScreen variant=resume
      ├─ Dokończ płatność → createStripeCheckoutSession → checkout.stripe.com
      ├─ Zmień metodę     → /checkout/payment-method?orderId=
      └─ Zacznij od nowa  → clear session → /cennik

[Powrót na /cennik później (ta sama sesja)]
  → PricingCards (mount)
  → resolvePendingOrder() = resumable
  → /checkout/resume?orderId=  (jak wyżej)

[Stripe cancel_url — bez zmian]
  → /checkout/cancelled
  → ResumePaymentScreen variant=cancelled  (2 akcje, jak dziś)
```

## Obsługa stanów brzegowych

- **`ORDER_NOT_FOUND` w `resolvePendingOrder`** → `none` + `clearOrderSession()`; `/cennik` renderuje
  się normalnie (stale orderId nie blokuje).
- **Błąd sieci w `resolvePendingOrder`** → `none` (fail-open). Nie blokujemy cennika przez transient.
- **`paid` (już opłacone/processing)** → kieruj na `/checkout/success` (poll), nie na resume.
- **`CONFIRMED` + `BANK_TRANSFER`** → kieruj na `/checkout/success`. Nie da się odtworzyć tokenu
  proformy po fakcie, a to nie jest scenariusz abandonu Stripe. (Realny przebieg bank-transfer i tak
  ląduje na `/checkout/bank-transfer` od razu po confirm.)
- **`DRAFT`** → poza zakresem; `/cennik` działa jak dziś (klik planu → nowe zamówienie).
- **Brak `orderId` w URL na `/checkout/resume`** → `ResumePaymentScreen` pokazuje stan
  „brak danych" / link do `/cennik` (jak obecny `hydration` fallback).

## Komponenty i pliki

| Plik | Zmiana |
|---|---|
| `src/lib/state/pending-order.ts` | **nowy** — `resolvePendingOrder()` + typ `PendingOrderResolution` |
| `src/components/checkout/ResumePaymentScreen.tsx` | **nowy** (z refaktoru `StripeCancelledRetry.tsx`) — prop `variant`, 3. akcja |
| `src/components/checkout/StripeCancelledRetry.tsx` | **usunięty** (zastąpiony) |
| `src/pages/checkout/cancelled.astro` | render `ResumePaymentScreen variant="cancelled"` |
| `src/pages/checkout/resume.astro` | **nowy** — render `ResumePaymentScreen variant="resume"`, `prerender=false` |
| `src/components/checkout/ConfirmStep.tsx` | guard na non-DRAFT status w `useEffect` |
| `src/components/pricing/PricingCards.tsx` | detekcja pending order na mount (skip dla handoff/mockAuth) |

## Testowanie (vitest, zgodnie z konwencją repo — tylko `src/lib/`)

- `src/lib/state/pending-order.test.ts` — pokrycie wszystkich gałęzi `resolvePendingOrder`
  (mock `getOrder` + `getOrderSession`): none / resumable / paid / dead / draft / bank-transfer /
  ORDER_NOT_FOUND / błąd sieci.
- Logika komponentów (`ResumePaymentScreen`, guardy) — bez testów jednostkowych, zgodnie z obecną
  konwencją (brak `@vitejs/plugin-react`; testujemy tylko czyste funkcje w `lib/`). Weryfikacja
  manualna z `PUBLIC_USE_MOCK_ORDERS=true`.

## Plan języka / treści (PL, prosto)

- „Masz niedokończoną płatność" / „Twoje zamówienie czeka na opłacenie. Dokończ płatność lub
  zmień metodę." — bez żargonu.
- Przyciski: „Dokończ płatność", „Zmień metodę płatności", „Zacznij od nowa".

## Otwarte kwestie

- **Stripe `cancel_url`** — design zakłada, że BE kieruje na `/checkout/cancelled`. Do potwierdzenia
  z backendem (nie blokuje implementacji FE — strona istnieje niezależnie).
