# Flow procesu zakupowego — CyberCover

> **Cel tego dokumentu:** wyjaśnić krok po kroku co dzieje się w systemie od momentu gdy klient klika plan na cenniku do momentu gdy dostaje maila z potwierdzeniem i magic linkiem do portalu. Dokument łączy perspektywę **endpointów API** (co woła frontend), **komend i eventów domenowych** (co dzieje się w BC), oraz **efektów biznesowych** (faktura, subskrypcja, polisa).
>
> Jest skierowany do: dev-teamu (onboarding do BC7/BC3), PO/biznesu (co się dzieje po "Zapłać"), DevOps (gdzie logi i punkty awarii).

**Ostatnia aktualizacja:** 2026-05-06 (**Plany bez ubezpieczenia** — wariant 3-krokowego checkoutu: dla planów które nie zawierają `InsuranceCoverage` w swojej kompozycji (obecnie: `Standard`) **krok 3 (Standardy operacyjne) jest pomijany w całości**. `Order.insurerId` jest teraz nullable; przy `null` insurer:

- `CheckoutProgress.hasOperationalStandards` ustawiane na `true` od momentu utworzenia ordera (`POST /orders/start`) → `nextRequiredStep` skacze z `COMPANY_DATA → PERSONAL_DATA → PAYMENT_METHOD`,
- `GET /api/orders/:id/operational-standards-schema` zwraca **nowe pole `skipped: true`** + puste `questions`/`answerOptions` — FE musi sprawdzić to pole i nie renderować ekranu OS,
- `PATCH /api/orders/:id/operational-standards` zwraca `409 Conflict` (klient nie powinien wołać tego endpointu),
- BC4 `Subscription.insurerId` też nullable; subskrypcja Standard żyje równoważnie do insurer-bound,
- BC5 Policy creation gated on `policyRequired: false` (już wcześniej; gating teraz konsystentny — Standard zawsze trafia w tę gałąź),
- `metadata.insurerId` na catalog entry usuwane dla planów bez ubezpieczenia (efekt: BC3 `getInsurerId()` zwraca `null` zamiast Colonnade).
  Patrz nowa sekcja **§2.6 Plany bez ubezpieczenia**. Wcześniej: 2026-04-29 — CC-353 promotional zero-amount checkout: dodana **trzecia ścieżka — Flow C** dla orderów z `totalPrice === 0` po zastosowaniu promocyjnego rabatu typu `PARTNER_TIMEBOUND` / `PARTNER_COMPOSITE`. Order pomija standardowe `CONFIRMED → PENDING_PAYMENT → PENDING_ALLOCATION` poprzez atomowe `Order.confirmAsPaid()` i emituje `OrderConfirmedEvent + OrderPaidEvent` w jednej transakcji. Stripe Checkout dla 0 PLN przełącza się w `mode='setup'` (capture karty na future renewal). Dodatkowo §5.2 zaktualizowane: po INV-3.16 wszystkie post-paid handlery (BC4/BC9/Onboarding) subskrybują `OrderAllocationStartedEvent`, nie `OrderPaidEvent`. Wcześniej: 2026-04-22 — `userCreated` przeniesione z allocation do fulfillment, `ksefAccepted` wyjęte z fulfillmentu).

---

## Spis treści

1. [Trzy ścieżki płatności — przegląd](#1-trzy-ścieżki-płatności--przegląd)
2. [Kluczowe pojęcia](#2-kluczowe-pojęcia)
   - [2.5 Mechanizm zniżek (przekrojowo dla wszystkich Flow)](#25-mechanizm-zniżek-przekrojowo-dla-wszystkich-flow)
   - [2.6 Plany bez ubezpieczenia (no-insurance variant) — checkout 3-krokowy](#26-plany-bez-ubezpieczenia-no-insurance-variant--checkout-3-krokowy)
3. [Flow A — Stripe Checkout (karta / BLIK / Google Pay / Apple Pay)](#3-flow-a--stripe-checkout)
4. [Flow B — Przelew bankowy (pro forma → VAT)](#4-flow-b--przelew-bankowy)
5. [Flow C — Promotional zero-amount (0 PLN, `confirmAsPaid` single-step)](#5-flow-c--promotional-zero-amount)
6. [Wspólna kaskada po zaksięgowaniu płatności](#6-wspólna-kaskada-po-zaksięgowaniu-płatności)
7. [Scenariusze awaryjne i edge cases](#7-scenariusze-awaryjne-i-edge-cases)
8. [Krótka wersja do wytłumaczenia komuś](#8-krótka-wersja-do-wytłumaczenia-komuś)
9. [Linki i dokumenty powiązane](#9-linki-i-dokumenty-powiązane)
10. [Referencja endpointów (API Reference)](#10-referencja-endpointów-api-reference)

---

## 1. Trzy ścieżki płatności — przegląd

```
┌─────────────────────────────────────────────────────────────────────┐
│  Kroki 0-5 wspólne dla wszystkich flow:                             │
│    0. Klik planu → start Order (DRAFT)                              │
│    1. Wpisanie NIPa + danych firmy                                  │
│    2. Dane osobowe + zgody                                          │
│    3. Standardy operacyjne (ubezpieczyciel)                         │
│       ── POMIJANY dla planów bez `InsuranceCoverage` (Standard);    │
│          `Order.insurerId === null` ⇒ `hasOperationalStandards`     │
│          auto-true od `POST /orders/start`. FE drives off           │
│          `nextRequiredStep` z `checkout-state`. Patrz §2.6.         │
│    4. Wybór metody płatności + rabat                                │
│       ── tu rozstrzyga się czy `totalPrice` > 0 (Flow A/B)          │
│          czy `totalPrice === 0` (Flow C — promotional)              │
│    5. Potwierdzenie zamówienia (`POST /confirm`)                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Od kroku confirm rozjazd na 3 ścieżki
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────────┐
│ Flow A —       │ │ Flow B —     │ │ Flow C —             │
│ STRIPE         │ │ PRZELEW      │ │ PROMOTIONAL          │
│ (totalNet > 0) │ │ (totalNet>0) │ │ (totalNet === 0)     │
│                │ │              │ │                      │
│ DRAFT          │ │ DRAFT        │ │ DRAFT                │
│  → CONFIRMED   │ │  → CONFIRMED │ │  ─── confirmAsPaid:  │
│  → (pay)       │ │  → (pay 14d) │ │      atomic skip     │
│  → markAsPaid  │ │  → markAsPaid│ │      CONFIRMED       │
│  → PENDING_    │ │  → PENDING_  │ │      i PENDING_      │
│    ALLOCATION  │ │    ALLOCATION│ │      PAYMENT, od     │
│                │ │              │ │      razu PENDING_   │
│ Stripe hosted  │ │ Pro forma na │ │      ALLOCATION      │
│ Checkout.      │ │ email +      │ │                      │
│ Webhook        │ │ admin księg. │ │ paymentChannel:      │
│ checkout.      │ │ ręcznie po   │ │   PROMOTIONAL_       │
│ session.       │ │ przelewie.   │ │   DISCOUNT           │
│ completed.     │ │              │ │                      │
│                │ │ Faktura VAT  │ │ Faktura VAT NIE      │
│ Faktura VAT    │ │ po admin     │ │ wystawiana (0 PLN);  │
│ po webhook'u.  │ │ mark-paid.   │ │ zamiast — PROMOTIO-  │
│                │ │              │ │ NAL_RENEWAL TX       │
│                │ │              │ │ (audit trail).       │
│                │ │              │ │                      │
│                │ │              │ │ Stripe session       │
│                │ │              │ │ mode='setup'         │
│                │ │              │ │ (capture karty bez   │
│                │ │              │ │ pobrania kwoty na    │
│                │ │              │ │ future renewal).     │
└───────┬────────┘ └───────┬──────┘ └──────────┬───────────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           │ Wspólna kaskada (od PENDING_ALLOCATION)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Po zaksięgowaniu płatności (Flow A/B przez PaymentRecordedEvent;   │
│  Flow C przez Order.confirmAsPaid synchronicznie):                  │
│    BC3 emituje rich OrderPaidEvent → InitAllocationProgressHandler  │
│    (jedyny subskrybent, INV-3.16) → OrderAllocationStartedEvent     │
│    (z `paymentChannel: STRIPE_PAYMENT_INTENT | BANK_TRANSFER_       │
│    RECEIPT | PROMOTIONAL_DISCOUNT`) → fan-out do 4 BC:              │
│      - BC4: DRAFT Subscription → ACTIVE                             │
│        ├─ Flow A/B: WhenOrderPaidHandler (early-return dla          │
│        │            PROMOTIONAL_DISCOUNT — żeby nie collidować)     │
│        └─ Flow C: WhenPromotionalOrderPaidHandler (aktywuje Sub     │
│                   z `_postPromoBillingChannel` + null Stripe IDs)   │
│        └─▶ BC5: Policy.create (gdy plan ma ubezpieczenie — Flow A/B)│
│      - BC6: VAT invoice → KSEF (Flow A/B) ALBO PROMOTIONAL_RENEWAL  │
│             TX 0 PLN + PromotionalCycleRecordedEvent (Flow C)       │
│      - BC9: Customer operational standards capture                  │
│      - Onboarding: magic link + VAT email (Flow A/B)                │
│                    / magic link bez VAT (Flow C — deferred Bug 8)   │
│                                                                      │
│  Order progresja (sterowana read-modelami w BC3):                   │
│    Flow A/B: CONFIRMED → PENDING_ALLOCATION (markAsPaid)            │
│    Flow C:   DRAFT → PENDING_ALLOCATION (confirmAsPaid, single-step)│
│      └─▶ AllocationProgress zbiera sygnały (byty wewnętrzne):       │
│            subscriptionActive, vatInvoiceIssued (Flow C: ustawiana  │
│            przez PromotionalCycleRecordedEvent zamiast VatInvoice-  │
│            IssuedEvent), opsStandardsCaptured, policyCreated        │
│            (opcjonalny — promo standardowo na planie Standard       │
│            bez ubezpieczenia)                                       │
│    PENDING_ALLOCATION → PROCESSING (po domknięciu alokacji)         │
│      └─▶ FulfillmentProgress zbiera 2 sygnały (dostawa do klienta): │
│            portalAccessDelivered (user + magic link + VAT email),   │
│            policyActive                                             │
│    PROCESSING → FULFILLED (po domknięciu fulfillmentu)              │
│    FULFILLED → CLOSED (po renewal/expire/upgrade/cancel subskrypcji)│
│                                                                      │
│  KSEF (faktura w Ministerstwie Finansów): osobny compliance track,  │
│  lifecycle IN_FLIGHT → ACCEPTED / REJECTED w `ksef_submissions`.    │
│  NIE gate'uje Order.status. Dla Flow C: KSEF nie aktywowany (brak   │
│  faktury VAT — 100% promo discount).                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kluczowe pojęcia

### Status zamówienia (`OrderStatus`)

| Status               | Znaczenie                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAFT`              | Klient wypełnia checkout. Cena `EstimatedPricing`. Można edytować.                                                                                                                                                                             |
| `CONFIRMED`          | Kliknął "Zamawiam". Cena zamrożona (`CalculatedPricing`), wszystkie dane osadzone. Zostaje do zapłaty.                                                                                                                                         |
| `PENDING_ALLOCATION` | Płatność zaksięgowana, trwa **tworzenie bytów wewnętrznych**. BC3 `AllocationProgress` read-model zbiera 4 sygnały: `subscriptionActive`, `vatInvoiceIssued`, `opsStandardsCaptured`, `policyCreated` (opcjonalny gdy plan bez ubezpieczenia). |
| `PROCESSING`         | Wszystkie byty utworzone, trwa **dostarczanie do klienta**. BC3 `FulfillmentProgress` read-model czeka na: `portalAccessDelivered` (user + magic link + VAT email) i `policyActive` (opcjonalny gdy plan bez ubezpieczenia).                   |
| `FULFILLED`          | Klient ma dostęp do portalu, fakturę PDF w mailu i aktywną polisę. Czeka na terminal event. Uwaga: KSEF jest niezależny — order może być FULFILLED z KSEF wciąż IN_FLIGHT.                                                                     |
| `CANCELLED`          | Anulowane (np. przez cron 14 dni bez wpłaty) — terminal.                                                                                                                                                                                       |
| `CLOSED`             | Zamówienie zakończone lifecycle-em subskrypcji: `RENEWED` (odnowione), `EXPIRED` (wygasło), `UPGRADED` (upgrade do wyższego planu), `CANCELLED` (anulowane przez klienta) — terminal.                                                          |

### Status płatności (`PaymentStatus`)

| Status      | Znaczenie                                                        |
| ----------- | ---------------------------------------------------------------- |
| `PENDING`   | Utworzona, czeka na zapłatę.                                     |
| `SUCCEEDED` | Zapłacona i zaksięgowana. Terminal.                              |
| `FAILED`    | Nieudana (deklinacja karty, BLIK timeout, anulowanie). Terminal. |

### Idempotencja

System jest **wielopoziomowo idempotentny**. Ta sama akcja wywołana wielokrotnie nie duplikuje efektów:

- **Checkout session cache** — gdy klient odświeża URL Stripe w ciągu 24h, dostaje ten sam URL (dopóki session nie wygasła)
- **Webhook dedup** — ten sam `stripeEventId` przetwarzany tylko raz (Redis dedup store, TTL 24h)
- **DB unique constraint** — `Payment.idempotencyKey` ma unique index; wyścig o wpis kończy się `DuplicateIdempotencyKeyError` → handler zwraca winner's data
- **Stripe API Idempotency-Key** — header wysyłany do Stripe API, żeby nawet jeśli nasz request przeszedł ale response padł, Stripe nie stworzył drugiej sesji

### Amount-match guard (INV-7.3)

Gdy Stripe webhook przynosi potwierdzenie płatności, system porównuje `amount_total` z Stripe z `Payment.amount` w naszej bazie. Jeśli się nie zgadza → **brak transition do SUCCEEDED** + log error "manual reconciliation required". Chroni przed atakami na webhook / błędami po stronie Stripe.

### Session TTL + lazy regeneration

Stripe Checkout session wygasa po **24 godzinach**. System sam sobie z tym radzi:

- Jeśli klient wraca do URL po 23h59min → stary URL dalej działa
- Jeśli wraca po 24h+ lub <5min przed expiry → handler automatycznie tworzy nową sesję, aktualizuje Payment (`regenerateCheckoutSession`), zwraca nowy URL. Payment status pozostaje `PENDING`.

### Domain events (kluczowe)

| Event                                                                         | Emitowany gdy                                                                                           | Konsumenci                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderDraftedEvent`                                                           | `POST /orders/start`                                                                                    | BC10 Portal Feature Gating (future)                                                                                                                                                                              |
| `CompanyDataCapturedEvent`                                                    | Krok 1 zapisany                                                                                         | audit log                                                                                                                                                                                                        |
| `PersonalDataCapturedEvent` + `ConsentsCapturedEvent`                         | Krok 2 zapisany                                                                                         | audit, compliance                                                                                                                                                                                                |
| `OperationalStandardsCapturedEvent` + `EligibilityResultEvaluatedEvent`       | Krok 3 zapisany                                                                                         | BC5 (input do Policy)                                                                                                                                                                                            |
| `DiscountAppliedEvent`                                                        | Jeśli rabat wszedł w Kroku 4                                                                            | audit, BC2 analityka                                                                                                                                                                                             |
| `PaymentMethodSelectedEvent`                                                  | Krok 4 zapisany                                                                                         | —                                                                                                                                                                                                                |
| `OrderConfirmedEvent`                                                         | Krok 5 confirm                                                                                          | **BC7** (Payment creation), **BC6** (ProForma dla BANK_TRANSFER), **BC4** (subscription intent), Customer Onboarding (email pro forma)                                                                           |
| `PaymentCreatedEvent`                                                         | BC7 utworzył Payment                                                                                    | audit, monitoring                                                                                                                                                                                                |
| `PaymentCheckoutSessionRegeneratedEvent`                                      | Lazy regen po 24h                                                                                       | audit                                                                                                                                                                                                            |
| `PaymentCheckoutSessionExpiredEvent`                                          | Stripe webhook `session.expired`                                                                        | Customer Onboarding (future: reminder email)                                                                                                                                                                     |
| `PaymentRecordedEvent`                                                        | Payment SUCCEEDED (karta lub admin mark-paid)                                                           | **ONLY BC3** `WhenPaymentRecordedHandler` (INV-3.16 — sole-consumer). BC3 resolvuje kontekst + emituje `OrderPaidEvent`.                                                                                         |
| `PaymentFailedEvent`                                                          | Webhook failure / async_payment_failed                                                                  | audit, monitoring                                                                                                                                                                                                |
| `OrderPaidEvent` (rich, 11 pól)                                               | BC3 `Order.markAsPaid()`                                                                                | **BC4** (activate Subscription), **BC6** (VAT invoice przez posting rules), **BC9** (capture op standards), **Customer Onboarding** (complete onboarding); BC3 `InitAllocationProgressHandler` (init read-model) |
| `OrderProcessingStartedEvent`                                                 | BC3 `Order.startProcessing(planId)` po domknięciu `AllocationProgress`                                  | BC3 `InitFulfillmentProgressHandler` (init read-model)                                                                                                                                                           |
| `OrderFulfilledEvent`                                                         | BC3 `Order.fulfill()` po domknięciu `FulfillmentProgress`                                               | audit, downstream notifications                                                                                                                                                                                  |
| `OrderClosedEvent` (z `reason`)                                               | BC3 `Order.close(reason)` triggered by BC4 lifecycle events                                             | audit, archiving                                                                                                                                                                                                 |
| `OrderAllocationFailedEvent` / `OrderFulfillmentFailedEvent`                  | Hard error w flag-handlerze alokacji/fulfillmentu                                                       | `AdminAlertPort` (email do admina), audit                                                                                                                                                                        |
| `SubscriptionActivatedEvent`                                                  | BC4 aktywuje DRAFT subscription                                                                         | **BC5** (Policy.create), **BC3** `WhenSubscriptionActivatedUpdatesAllocation` (flag `subscriptionActive`)                                                                                                        |
| `SubscriptionRenewed/Expired/Upgraded/Cancelled` (z previous/currentOrderRef) | BC4 lifecycle transitions                                                                               | **BC3** (CloseOrderCommand z odpowiednim reason)                                                                                                                                                                 |
| `VatInvoiceIssuedEvent`                                                       | BC6 posting rules wystawiają fakturę                                                                    | **BC8** (KSEF submit), **BC3** `WhenVatInvoiceIssuedUpdatesAllocation` (flag `vatInvoiceIssued`)                                                                                                                 |
| `OperationalStandardsCapturedEvent` (z `orderId`)                             | BC9 captureOperationalStandards                                                                         | **BC3** `WhenOpStandardsCapturedUpdatesAllocation` (flag `opsStandardsCaptured`)                                                                                                                                 |
| `CustomerOnboardingUserCreatedEvent`                                          | Onboarding aggregate: STARTED → USER_CREATED                                                            | audit log (żaden BC3 flag handler — user creation jest **częścią** `portalAccessDelivered`, śledzone przez `CustomerOnboardingCompletedEvent`)                                                                   |
| `PolicyCreatedEvent` (z `orderId`)                                            | BC5 `Policy.create()`                                                                                   | **BC3** `WhenPolicyCreatedUpdatesAllocation` (flag `policyCreated`)                                                                                                                                              |
| `CustomerOnboardingCompletedEvent`                                            | Onboarding aggregate: USER_CREATED → EMAILS_QUEUED (user + magic link + VAT email wszystkie zapewnione) | **BC3** `WhenOnboardingCompletedUpdatesFulfillment` (flag `portalAccessDelivered`)                                                                                                                               |
| `PolicyActivatedEvent` (z `orderId`)                                          | BC5 `Policy.activate()`                                                                                 | **BC3** `WhenPolicyActivatedUpdatesFulfillment` (flag `policyActive`)                                                                                                                                            |
| `KsefAcceptanceReceivedEvent` (z `orderId`)                                   | BC8 `KsefSubmission.markAccepted()`                                                                     | **BC6** `WhenKsefAcceptanceReceivedHandler` (update `invoice_projections.ksefStatus = 'ACCEPTED'`); **NIE** slucha BC3 — KSEF to compliance track, nie gate'uje Order.                                           |
| `KsefRejectionReceivedEvent` (z `orderId`)                                    | BC8 `KsefSubmission.markRejected()`                                                                     | **BC6** (update ksefStatus = 'REJECTED'), admin alert flow (osobny od Order lifecycle — klient już dostał fakturę PDF, wymagana korekta księgowa)                                                                |

### 2.5 Mechanizm zniżek (przekrojowo dla wszystkich Flow)

Zniżki są **ortogonalne do flow** — ten sam silnik wycenia rabat niezależnie od tego, czy klient zapłaci kartą (Flow A), przelewem (Flow B), czy nie zapłaci nic (Flow C — gdy rabat redukuje cenę do zera). Sam typ zniżki determinuje, czy w ogóle dojdzie do Flow C: tylko `PARTNER_TIMEBOUND` i `PARTNER_COMPOSITE` (dla planu objętego 100% off przez czas trwania promo) potrafią obniżyć cenę do 0 PLN. `PARTNER_FLAT` i `CODE_FLAT` redukują kwotę procentowo lub kwotowo, ale praktycznie nigdy do zera.

#### 2.5.1 Bounded contexts

Zniżki żyją w osobnym BC — **`libs/discounting`** (kanonicznie: discount engine). BC3 Sales Order **nie zna** szczegółów reguł rabatowych — komunikuje się przez ACL adapter (`DiscountEngineValidatorAdapter` w `libs/sales-order/src/infrastructure/ports/`), który tłumaczy `BC3.CompanyContext → libs/discounting.DiscountContext` (outbound) i `libs/discounting.DiscountSnapshot → BC3.DiscountSnapshot` (inbound).

```
┌────────────────────────────┐                ┌──────────────────────────┐
│ BC3 Sales Order            │                │ libs/discounting         │
│                            │  ACL adapter   │                          │
│ Order.applyDiscountCode()  │ ─────────────▶ │ EvaluateDiscountQuery    │
│ Order.applyDiscount()      │                │  → resolve discount      │
│ Order._discountSnapshot    │ ◀───────────── │  → run applier+guardian  │
│ (frozen VO na orderze)     │   DiscountSnapshot │  → return amounts    │
└────────────────────────────┘                └──────────────────────────┘
```

Reguły dostępne tylko po stronie `libs/discounting`: appliery (FixedPriceApplier / PercentageFromBaseApplier), guardiany (MarginGuardian — odrzuca rabat poniżej minimalnej marży), context rules (np. wymóg `MONTHLY` billing cycle dla `PARTNER_TIMEBOUND`), promotional duration (ile cykli promo obowiązuje).

#### 2.5.2 Kindy zniżek (`DiscountKind`)

Cztery dostępne kindy. Pole `channel` jest niezależne (PARTNER vs CODE — kto zaprasza klienta), pole `kind` definiuje mechanikę wyceny.

| Kind                | Channel   | Mechanika                                                                                                                                                                                    | Charakterystyczne pole config                                         | Może dać 0 PLN?                                                                          | Przykład seedowy                                                                      |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CODE_FLAT`         | `CODE`    | Pojedynczy applier (procentowy lub fixed-price). Klient wpisuje kod ręcznie w Kroku 4.                                                                                                       | `applier`                                                             | Teoretycznie tak (FixedPriceApplier amount=0), praktycznie nie używane                   | **`SUMMER10`** — 10% off (PercentageFromBaseApplier 10%)                              |
| `PARTNER_FLAT`      | `PARTNER` | Pojedynczy applier + **guardian** (np. MarginGuardian odrzuca rabat poniżej `minMargin: 10`). Auto-aplikowany przez `?partner=CODE` w URL.                                                   | `applier`, `guardian`                                                 | Teoretycznie tak, ale guardian zwykle nie pozwala                                        | **`VALVETECH`** — 5% off (PercentageFromBaseApplier 5%) z MarginGuardian minMargin=10 |
| `PARTNER_COMPOSITE` | `PARTNER` | Two-tier: `primaryApplier` dla `targetPlanId`, `fallbackApplier` dla pozostałych planów.                                                                                                     | `targetPlanId`, `primaryApplier`, `fallbackApplier`                   | **Tak** (gdy klient wybiera target plan i primary = FixedPriceApplier amount=0)          | **`COMPOSITE_DEMO`** — Standard plan free + 10% off pozostałych (forever)             |
| `PARTNER_TIMEBOUND` | `PARTNER` | Pojedynczy applier dla `targetPlanId` + **`durationMonths`** (ile cykli promo) + **`applicableBillingCycle`** (np. tylko `MONTHLY`). Po `durationMonths` rabat wygasa, kolejne cykle płatne. | `targetPlanId`, `applier`, `durationMonths`, `applicableBillingCycle` | **Tak** (gdy applier = FixedPriceApplier amount=0) — to **kanoniczne wejście do Flow C** | **`TIMEBOUND_DEMO`** — Standard plan free przez 3 miesiące, tylko MONTHLY             |

#### 2.5.3 Pricing pipeline (gdzie zniżka wchodzi w cenę)

Pipeline odpalany w `SelectPaymentMethodHandler` (Krok 4):

```
1. PricingService.calculateFinalPrice(catalogEntryId, billingCycle, companyContext)
   → BC2 zwraca CalculatedPricing (zamrożony snapshot ceny katalogowej + VAT 23%)

2. order.applyCalculatedPricing(lineId, pricing)
   → BC3: zamrożenie ceny na linii orderu (EstimatedPricing → CalculatedPricing)

3. Jeśli był active discount (CODE wpisany ręcznie LUB PARTNER auto-aplikowany w Kroku 0):
   3a. DiscountValidatorPort.evaluate(code, basePrice, quantity, companyCtx, catalogEntryId)
       → ACL → EvaluateDiscountQuery do libs/discounting
       → discount engine: resolve discount → match context rules → run applier
                          → run guardian (jeśli jest) → return DiscountSnapshot
   3b. Jeśli `DiscountSnapshot.eligibilityResult === 'ELIGIBLE'`:
       order.applyDiscount(snapshot)
       → BC3: zamrożenie discount snapshotu na orderze (`_discountSnapshot`)
       → emit DiscountAppliedEvent
       → Order.totalPrice() teraz uwzględnia discountedAmount zamiast originalAmount
   3c. Jeśli `INELIGIBLE` → DiscountValidationError, zwracany INELIGIBLE response do FE,
       order.applyCalculatedPricing zostaje (zniżka nie wchodzi)
```

#### 2.5.4 Snapshot na orderze

Order trzyma frozen `DiscountSnapshot` (VO):

| Pole                  | Typ                          | Opis                                                                                                                                                              |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discountId`          | `DiscountId`                 | ID zniżki w `libs/discounting`                                                                                                                                    |
| `code`                | string                       | Kod zniżki (np. `TIMEBOUND_DEMO`)                                                                                                                                 |
| `description`         | string                       | Opis (np. `"Standard plan free for first 3 months"`)                                                                                                              |
| `evaluatedAt`         | Date                         | Kiedy zniżka została wyceniona                                                                                                                                    |
| `eligibilityResult`   | `'ELIGIBLE' \| 'INELIGIBLE'` | Wynik ewaluacji                                                                                                                                                   |
| `originalAmount`      | `Money`                      | Cena katalogowa przed rabatem (np. 99 PLN)                                                                                                                        |
| `discountedAmount`    | `Money`                      | Cena po rabacie (np. 0 PLN dla TIMEBOUND_DEMO)                                                                                                                    |
| `discountAmount`      | `Money`                      | Wysokość rabatu (np. 99 PLN)                                                                                                                                      |
| `kind`                | `DiscountKind`               | Jeden z 4 kindów (patrz 2.5.2)                                                                                                                                    |
| `promotionalDuration` | `PromotionalDuration?`       | Tylko dla `PARTNER_TIMEBOUND` / `PARTNER_COMPOSITE`: `{months: number, cycle: BillingCycle}`. **To pole determinuje czy Sub dostanie `_promoEndsAt`** (patrz § 5) |

#### 2.5.5 Source tracking

Order pamięta **skąd** zniżka pochodzi przez `_discountSource` VO:

- `kind: 'PARTNER'` — auto-aplikowany przez `?partner=CODE` w URL na Kroku 0 (`PartnerDiscountAttachedEvent`). Pole `partnerCode` zachowane do audytu (np. `valvetech`).
- `kind: 'DISCOUNT_CODE'` — wpisany ręcznie przez klienta w Kroku 4 (po validate-discount + select payment method).

#### 2.5.6 Mutual exclusivity (INV H3)

**Reguła:** order może mieć **maksymalnie jedną** zniżkę naraz. Jeśli klient ma już PARTNER discount (auto-aplikowany w Kroku 0) i próbuje wpisać discount code w Kroku 4 — `Order.applyDiscountCode()` rzuca `DiscountSourceConflictError` (HTTP 409, code `DISCOUNT_SOURCE_CONFLICT`). Frontend musi pokazać warning "Masz już aktywną zniżkę partnerską — usuń ją żeby wpisać kod".

#### 2.5.7 Eligibility — context rules

`libs/discounting` ewaluuje **context rules** przed aplikacją rabatu. Przykłady:

- `RequiresMonthlyBillingRule` — jeśli klient wybrał `ANNUAL`, a discount jest `PARTNER_TIMEBOUND` z `applicableBillingCycle: 'MONTHLY'` → INELIGIBLE z reasonem `BILLING_CYCLE_MISMATCH`.
- `RequiresTargetPlanRule` — jeśli klient wybrał `Optimum`, a discount targetuje `Standard` (`PARTNER_TIMEBOUND` lub `PARTNER_COMPOSITE.primaryApplier`) → fallbackApplier (dla COMPOSITE) albo INELIGIBLE (dla TIMEBOUND).
- `MarginGuardian` (`PARTNER_FLAT` only) — sprawdza czy po rabacie marża nie spada poniżej `minMargin` z config'u.

Nieaktualne / wygasłe zniżki: BC `libs/discounting` zwraca INELIGIBLE z reasonem `EXPIRED` lub `INACTIVE`. BC3 propaguje to przez ACL — Order.applyDiscount(snapshot) sprawdza `eligibilityResult` i zapisuje też INELIGIBLE snapshot (do audytu, ale nie obniża ceny).

#### 2.5.8 Przykład end-to-end — partner TIMEBOUND_DEMO

Załóżmy, że klient wchodzi przez URL `https://app.cybercover.pl/cennik?partner=TIMEBOUND_DEMO` i wybiera plan **Standard** + **MONTHLY**:

```
Krok 0: POST /api/orders/start { catalogEntryId: 'standard-monthly', billingCycle: 'MONTHLY', partnerCode: 'TIMEBOUND_DEMO' }
        → BC3 lookup partner discount przez DiscountValidatorPort.resolveByCode('TIMEBOUND_DEMO')
        → libs/discounting: kind=PARTNER_TIMEBOUND, targetPlanId=standard, applicableBillingCycle=MONTHLY,
                            durationMonths=3, applier=FixedPriceApplier(amount=0)
        → order.attachPartnerDiscount(snapshot) → emit PartnerDiscountAttachedEvent
        → Order ma teraz `_discountSnapshot` (frozen VO) ALE jeszcze nie zaaplikowany do ceny
          (pricing computowany w Kroku 4)

Kroki 1-3: bez zmian (data firmy, osobowe, standardy)

Krok 4: PATCH /api/orders/:id/payment-method { paymentMethod: 'STRIPE_CHECKOUT' }
        → SelectPaymentMethodHandler:
          → calculateFinalPrice → originalAmount=99 PLN (Standard MONTHLY)
          → order.applyCalculatedPricing(lineId, pricing) → cena zamrożona
          → DiscountValidator.evaluate('TIMEBOUND_DEMO', 99 PLN, 1, ctx, catalogEntryId)
            → libs/discounting: matchuje target plan + MONTHLY cycle (rules pass)
            → applier(FixedPriceApplier amount=0): discountedAmount=0 PLN, discountAmount=99 PLN
            → return ELIGIBLE snapshot
          → order.applyDiscount(snapshot) → emit DiscountAppliedEvent
        → order.selectPaymentMethod(STRIPE_CHECKOUT)
        → Order.totalPrice() = 0 PLN, _discountSnapshot.kind = PARTNER_TIMEBOUND,
          _discountSnapshot.promotionalDuration = {months: 3, cycle: MONTHLY}

Krok 5: POST /api/orders/:id/confirm
        → ConfirmOrderHandler widzi totalPrice === 0 + hasPromotionalDiscount() === true
        → routes to Flow C (patrz § 5)
        → order.confirmAsPaid(...) zamiast order.confirm(...)
```

Po confirm Sub wstaje w `ACTIVE` z `_postPromoBillingChannel: STRIPE`, `_promoEndsAt = now + 3 miesiące`. Po 3 miesiącach scheduler przejmuje (patrz Deferred PROMO-CYCLE-SCHEDULER w § 7).

---

### 2.6 Plany bez ubezpieczenia (no-insurance variant) — checkout 3-krokowy

> **Wprowadzone 2026-05-06.** Ortogonalne do Flow A/B/C — działa łącznie z każdym z nich.

Niektóre plany w katalogu (obecnie: **Standard**) nie zawierają w swojej kompozycji `InsuranceCoverage`. Klient kupuje wtedy zestaw usług (security assessment, monitoring, raporty), ale **nie kupuje polisy ubezpieczeniowej**. Ponieważ standardy operacyjne są wymaganiem ubezpieczyciela, dla takich planów krok 3 traci sens i jest pomijany.

#### 2.6.1 Wykrywanie po stronie BC

Plan jest "no-insurance" gdy jego kompozycja nie zawiera `ProductType: InsuranceCoverage`. Catalog entry takiego planu **nie ma** `metadata.insurerId` (seed pomija ten field gdy `productTypeNames.includes('InsuranceCoverage') === false`).

Konsekwencje w domenie:

- `BC2` `getInsurerId(catalogEntryId) → null` — port BC3 widzi brak insurer'a
- `BC3` `Order.insurerId: InsurerId | null` — może być `null`; przy null:
  - `Order.create()` pomija `NonDefaultInsurerError` (INV-3.12 nieadekwatny)
  - `CheckoutProgress` startuje z `hasOperationalStandards: true` (auto-skip)
  - `Order.submitOperationalStandards()` rzuca `InvalidOrderStateError` (klient nie powinien tego wywoływać)
- `BC4` `Subscription.insurerId: InsurerId | null` — sub Standard żyje równoważnie do insurer-bound, tylko bez insurer-binding
- `BC5` `Policy` nigdy nie powstaje — gated przez `policyRequired: false` (z `catalogEntryHasInsuranceFeature`)
- `BC9` `CustomerOperationalStandards` nigdy nie powstaje — adapter `OrderAnswersReadAdapter` zwraca null bo brak `operationalStandardsAnswers` na orderze

#### 2.6.2 Kontrakt FE — co zmienia się w wizardzie

Frontend **nie potrzebuje znać** statusu insurera. Cały flow sterowany jest przez `nextRequiredStep` z `GET /api/orders/:id/checkout-state` (§10.1.6). Wystarczy:

1. **`POST /api/orders/start`** — bez zmian. Zwraca `orderId`. Order może mieć `insurerId === null` wewnętrznie — FE nie widzi tego pola w response.
2. **`GET /api/orders/:id/checkout-state`** — `progress.hasOperationalStandards` już jest `true` od startu dla planu bez ubezpieczenia. `nextRequiredStep` pominie `OPERATIONAL_STANDARDS` i wskaże od razu `PAYMENT_METHOD` po wypełnieniu kroków 1-2.
3. **`GET /api/orders/:id/operational-standards-schema`** (§10.1.8) — **nowe pole `skipped: boolean`**. Gdy `skipped === true`:
   - `questions: []`, `answerOptions: []`, `insurerName: ''`
   - FE **nie powinien** renderować ekranu standardów; route guard powinien przeskoczyć do `payment-method`
4. **`PATCH /api/orders/:id/operational-standards`** (§10.1.9) — zwróci `409 Conflict` (`INVALID_ORDER_STATE`) gdy klient mimo wszystko wywoła. FE nie powinien tego robić, ale ścieżka zwraca jasny błąd zamiast wybuchu.

#### 2.6.3 Najprostsza ścieżka integracji FE

```
1. POST /orders/start → orderId
2. GET /orders/:id/checkout-state
   → progress.hasOperationalStandards: true (już!)
   → nextRequiredStep: 'COMPANY_DATA'
3. PATCH /orders/:id/company-data → state.nextRequiredStep: 'PERSONAL_DATA'
4. PATCH /orders/:id/personal-data → state.nextRequiredStep: 'PAYMENT_METHOD'
   ── pominęliśmy 'OPERATIONAL_STANDARDS' bez specjalnej logiki
5. PATCH /orders/:id/payment-method → state.nextRequiredStep: null (isComplete: true)
6. POST /orders/:id/confirm → success
```

FE może też wcześniej (np. przy mount checkout layoutu) zawołać `GET /operational-standards-schema` i sprawdzić `skipped` — jak chce explicit gate. Ale jeśli FE konsekwentnie używa `nextRequiredStep` z `checkout-state`, **żadne zmiany w logice routingu nie są potrzebne** — flow naturalnie przeskakuje krok 3.

#### 2.6.4 Edge cases

| Sytuacja                                                        | Co dzieje się                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| FE i tak woła `GET /operational-standards-schema` dla Standardu | Response 200 z `skipped: true`, puste questions. FE może bezpiecznie zignorować i nie renderować ekranu.   |
| FE wywoła `PATCH /operational-standards` dla Standardu          | Response 409, kod `INVALID_ORDER_STATE`. FE traktuje jak każdy inny invalid state error.                   |
| Klient z planem Optimum (z insurance)                           | Bez zmian — pełny 4-krokowy flow z OS w środku. Schema endpoint zwraca normalne pytania, `skipped: false`. |
| Klient zaczyna od Standardu, dotyka URL kroku OS bezpośrednio   | `checkout-state.nextRequiredStep` to `PAYMENT_METHOD` (nie OS) — FE guard na tej podstawie redirektuje.    |

#### 2.6.5 Co po zakończeniu checkoutu

- BC4 tworzy `Subscription` z `insurerId: null` — dashboard portalu działa równoważnie (`getActiveSubscriptionForCustomer` zwraca taki sub normalnie).
- BC5 nie tworzy `Policy` — `policyActive` flag w `FulfillmentProgress` nieadekwatny (gating w `InitFulfillmentProgressHandler` po `policyRequired`).
- BC6 wystawia VAT invoice / pro forma jak normalnie (Standard ma cenę >0 PLN; rabat promo zerujący też działa identycznie jak dla pozostałych planów).
- Customer Onboarding wysyła activation email + magic link bez różnic.

---

## 3. Flow A — Stripe Checkout

Klient wybrał plan → 4 kroki wypełniania checkoutu → klik "Zamawiam z obowiązkiem zapłaty" → **od tego momentu zaczyna się Flow A**.

### 3.1 Etap: User klika CTA planu (Krok 0)

**Frontend:**

- Na `/cennik` klient kliknął "Wybierz Optimum" (albo inny plan)
- FE woła `POST /api/orders/start` z `{catalogEntryId, billingCycle, partnerCode?}`

**Backend:**

- Dispatch: `StartOrderCommand(catalogEntryId, billingCycle, partnerCode?)`
- Handler:
  - Lookup insurera z katalogu (BC2)
  - Pobiera `EstimatedPricing` z BC2
  - Tworzy `Order` aggregate w stanie `DRAFT` (INV-3.12: tylko default insurer = Colonnade)
  - Emituje `OrderDraftedEvent`, `OrderLineAddedEvent`, ewentualnie `PartnerDiscountAttachedEvent`
  - Zwraca `{orderId}`

**Frontend**: zapisuje `orderId` (localStorage), router push `/checkout/company-data`.

### 3.2 Kroki 1-3: Dane firmy, osobowe, standardy

Sekwencyjne PATCH'e które **persystują progress Order draftu** (można wrócić i zmienić). Każdy walidowany + emitowany odpowiedni event.

| Krok                 | Endpoint                                      | Komenda                             | Event                                                                   |
| -------------------- | --------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Dane firmy           | `PATCH /api/orders/:id/company-data`          | `SubmitCompanyDataCommand`          | `CompanyDataCapturedEvent`                                              |
| Dane osobowe         | `PATCH /api/orders/:id/personal-data`         | `SubmitPersonalDataCommand`         | `PersonalDataCapturedEvent` + `ConsentsCapturedEvent`                   |
| Standardy operacyjne | `PATCH /api/orders/:id/operational-standards` | `SubmitOperationalStandardsCommand` | `OperationalStandardsCapturedEvent` + `EligibilityResultEvaluatedEvent` |

**Pomocnicze (niemutujące):**

- `GET /api/orders/company-lookup?nip=...` — auto-fill z CEIDG
- `GET /api/orders/consent-definitions` — lista aktualnych zgód z admin panelu
- `GET /api/orders/:id/operational-standards-schema` — pytania bezpieczeństwa per insurer (zwraca `skipped: true` z pustymi listami dla planów bez ubezpieczenia, §2.6)
- `POST /api/orders/:id/evaluate-eligibility` — real-time preview eligibility podczas typowania odpowiedzi

Po Kroku 3 Order ma zapisane `companyData`, `personalData`, `consents[]`, `operationalStandardsAnswers`, `eligibilityResult` (snapshot). `CheckoutProgress`: 3/4 flag `true`.

> **Plan bez ubezpieczenia (Standard, §2.6):** Krok 3 jest **pomijany w całości**. Order startuje z `hasOperationalStandards: true`; FE driven by `nextRequiredStep` skacze z `PERSONAL_DATA` na `PAYMENT_METHOD`. Brak `OperationalStandardsCapturedEvent` / `EligibilityResultEvaluatedEvent` dla takiego ordera. Po Kroku 2 `CheckoutProgress`: 3/4 flag `true` (osobno: `hasCompanyData`, `hasPersonalData`, `hasOperationalStandards` auto). Po Kroku 4: 4/4 → ready to confirm.

### 3.3 Krok 4: Wybór metody płatności (tu **Stripe**)

**Frontend:**

- Klient wybiera "Karta płatnicza" (opcjonalnie wpisuje kod rabatowy + klik "Sprawdź")
- `POST /api/orders/:id/validate-discount` — (opcjonalne) preview ceny po rabacie
- Klik "Dalej" → `PATCH /api/orders/:id/payment-method` z `{paymentMethod: 'STRIPE_CHECKOUT', discountCode?}`

**Backend:**

- Dispatch: `SelectPaymentMethodCommand`
- Handler (dużo się dzieje):
  1. Load Order (DRAFT)
  2. Jeśli podany `discountCode`: `order.applyDiscountCode(code)` — INV H3 (mutually exclusive z partner code)
  3. Kalkulacja final ceny w BC2: `PricingService.calculateFinalPrice(catalogEntryId, billingCycle, companyContext)` → `CalculatedPricing`
  4. `order.applyCalculatedPricing(lineId, pricing)` — **zamrożenie ceny** (przejście EstimatedPricing → CalculatedPricing)
  5. Jeśli był active discount (CODE lub PARTNER): `DiscountValidator.evaluate(...)` → jeśli eligible, aplikuje rabat przez `order.applyDiscount(snapshot)` → emit `DiscountAppliedEvent`
  6. Budowanie `OrderParties` (ORDERER/PAYER/RECEIVER = klient, EXECUTOR = CyberCover)
  7. `order.selectPaymentMethod(STRIPE_CHECKOUT)` → flaga `hasPaymentMethod = true` → emit `PaymentMethodSelectedEvent`

Po Kroku 4 Order jest **gotowy do confirm**: `CheckoutProgress.isComplete === true`.

### 3.4 Krok 5: Potwierdzenie zamówienia

**Frontend:**

- Klik "Zamawiam z obowiązkiem zapłaty" → `POST /api/orders/:id/confirm`

**Backend:**

- Dispatch: `ConfirmOrderCommand`
- Handler:
  1. Walidacja kompletności (INV-3.4: `checkoutProgress.isComplete()`)
  2. Walidacja `OrderParties.validate(OrderLevelRolePolicy)` — wszystkie kluczowe role obsadzone
  3. `order.confirm()` → `status: DRAFT → CONFIRMED`
  4. Emit **`OrderConfirmedEvent`** z pełnym kontekstem (totalPrice, payerId, insurerId, billingCycle, paymentMethod, lines[])

**Konsumenci `OrderConfirmedEvent`:**

- **BC7 Payment Processing** — `WhenOrderConfirmedHandler`:
  - Dla `STRIPE_CHECKOUT` → **nie robi nic od razu** (Payment powstanie przy następnym kroku `POST /stripe-checkout-session`). Rationale: user może "zwisać" na ekranie potwierdzenia, tworzymy Payment leniwie gdy klient faktycznie klika "Zapłać".
  - Dla `BANK_TRANSFER` → tworzy Payment od razu (bo pro forma idzie przez email i klient musi wiedzieć numer konta)
- **BC6 Billing** — dla BANK_TRANSFER: generuje pro forma invoice, zapisuje Transaction
- **Customer Onboarding** — dla BANK_TRANSFER: dispatchuje email pro forma przez BullMQ queue (`WhenOrderConfirmedForBankTransferHandler`)
- **BC4 Subscription Lifecycle** — zapisuje "subscription intent" (konkretna subskrypcja powstanie po `PaymentRecordedEvent`)

Response: `{orderId, status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT'}`.

### 3.5 Krok 6a (Stripe only): Utworzenie Checkout session

**Frontend:** natychmiast po confirm woła `POST /api/sales-order/:orderId/stripe-checkout-session`.

> ⚠️ **Uwaga URL prefix** — ten endpoint jest pod `/api/sales-order/...` (kebab-case, singular), nie `/api/orders/...`. Ownership: BC7 Payment Processing gateway layer.

**Backend:**

- Dispatch: `CreateStripeCheckoutSessionCommand`
- Handler:
  1. Load Order przez `OrderReadPort` (ACL do BC3) → `getOrderForPayment(orderId)`
  2. Guard: `order.status === CONFIRMED` — inaczej `OrderNotConfirmedError`
  3. Guard: `order.paymentMethod === STRIPE_CHECKOUT` — inaczej `WrongPaymentMethodError`
  4. Lookup istniejącego Payment dla tego Order:
     - Jeśli `SUCCEEDED` → `PaymentAlreadyCompletedError`
     - Jeśli `PENDING` + session expires > 5min w przyszłości → **zwraca cached** `{paymentId, sessionId, url, expiresAt}` (idempotency)
     - Jeśli `PENDING` + expired/near-expiry → **lazy regeneration**: nowa session w Stripe, `payment.regenerateCheckoutSession(...)`, emit `PaymentCheckoutSessionRegeneratedEvent`
     - Jeśli nic nie istnieje / `FAILED` → **fresh create**
  5. Fresh create:
     - Generuje `IdempotencyKey.forStripeAttempt(orderId)`
     - Woła `StripePaymentGateway.createStripeCheckoutSession({orderId, amount: grossAmount, idempotencyKey, customerEmail, successUrl, cancelUrl})` → wysyła do Stripe API z header'em `Idempotency-Key`
     - Stripe zwraca `{sessionId: 'cs_...', url: 'https://checkout.stripe.com/...', expiresAt, paymentIntentId?}`
     - Tworzy `Payment` aggregate przez `Payment.createForStripeCheckout(...)` → status `PENDING`, externalRef = session id, metadata z URL + expiresAt + (opcjonalnie) paymentIntentId
     - Emit `PaymentCreatedEvent`
     - Zapisuje Payment (MongoDB upsert z unique constraint na `idempotencyKey`)
     - Jeśli `DuplicateIdempotencyKeyError` (wyścig równoległych requestów) → zwraca winner's data
  6. Response: `{paymentId, sessionId, url, expiresAt}`

### 3.6 Krok 6b (Stripe only): Hosted Checkout + powrót

**Frontend:**

- Po otrzymaniu `{url}` robi `window.location.href = url`
- Przeglądarka ląduje na `https://checkout.stripe.com/c/pay/cs_...`
- Klient wybiera metodę (karta/BLIK/Google Pay/Apple Pay), wpisuje dane, klika "Zapłać"
- Stripe autoryzuje + przekierowuje na `success_url`: `https://app.cybercover.pl/checkout/success?orderId=...&sessionId={CHECKOUT_SESSION_ID}`
- Jeśli klient kliknął "Anuluj" w Stripe → `cancel_url`: `https://app.cybercover.pl/checkout/cancelled?orderId=...`

### 3.7 Krok 7 (Stripe only): Webhook + sukces

**Stripe serwery wysyłają webhook** do naszego `POST /api/webhooks/stripe` z eventem `checkout.session.completed`.

**Backend:**

- `StripeSignatureGuard` weryfikuje podpis (HMAC SHA-256 z Stripe webhook secret)
- `StripeWebhookController.handle()` switch:
  - `checkout.session.completed` + `payment_status === 'paid'`:
    - Wyciąga `sessionId`, `amountTotal`, `currency`, `paymentIntentId` (może być string/object/null)
    - Dispatch: `RecordStripePaymentSuccessCommand(eventId, sessionId, amount, paidAt, paymentIntentId)`
  - `checkout.session.expired`:
    - Dispatch: `RecordStripeCheckoutSessionExpiredCommand(eventId, sessionId, expiredAt)`
    - Payment pozostaje `PENDING`; klient może kliknąć "Spróbuj ponownie" w UI → `POST /stripe-checkout-session` → lazy regen
  - `checkout.session.async_payment_failed`:
    - Dispatch: `RecordStripePaymentFailureCommand(eventId, sessionId, reason='ASYNC_METHOD_FAILED', failedAt)`
  - Stare `payment_intent.*` events → **log-only** (Stripe wciąż je wysyła, ale my już nie reagujemy)

**`RecordStripePaymentSuccessHandler`:**

1. Dedup: `webhookStore.markProcessed(eventId, ttl)` — jeśli duplikat, skip
2. Lookup Payment: `repository.findBySessionId(sessionId)`
3. Guards: `SUCCEEDED` → idempotent skip, `FAILED` → warn + skip
4. **Amount-match (INV-7.3)**: porównuje `payment.amount` z `cmd.amountReceived` — jeśli mismatch, log error + return (brak transition)
5. Transition: `payment.recordSuccess(paidAt, newExtRef, paymentIntentId?)` → status `PENDING → SUCCEEDED`
6. Emit **`PaymentRecordedEvent`** — ten event triggeruje wspólną kaskadę (sekcja 6)

---

## 4. Flow B — Przelew bankowy

Wspólne Kroki 0-5 z Flow A. Różnica: w Kroku 4 `paymentMethod: 'BANK_TRANSFER'`, od Kroku 5 ścieżka zupełnie inna.

### 4.1 Krok 5 (BANK_TRANSFER): Confirm → `OrderConfirmedEvent`

Ten sam `ConfirmOrderCommand` jak w Flow A. Różnica w konsumentach `OrderConfirmedEvent`:

**BC7 Payment Processing — `WhenOrderConfirmedHandler`:**

- Dla `BANK_TRANSFER`: **tworzy Payment od razu** w stanie `PENDING`, metoda `BANK_TRANSFER`, externalRef **undefined** (będzie dopiero po admin mark-paid)
- `Payment.createForBankTransfer({orderId, amount, idempotencyKey, metadata: forBankTransfer({customerEmail})})` → emit `PaymentCreatedEvent`

**BC6 Billing:**

- PostingRule reaguje na `OrderConfirmedEvent` z paymentMethod=BANK_TRANSFER
- Generuje **ProForma Invoice** (numer `PF/ABX-NNNN/2026`)
- Zapisuje Transaction w Account (OFF_BALANCE_PROFORMA)
- Emit `ProFormaInvoiceIssuedEvent`

**Customer Onboarding — `WhenOrderConfirmedForBankTransferHandler`:**

- Dispatch BullMQ job: wyślij email z pro forma PDF + dane do przelewu (numer konta, kwota, tytuł `PF/ABX-NNNN/2026`)
- Zapis `CustomerOnboardingLog` w stanie `STARTED`

### 4.2 Krok 6 (BANK_TRANSFER): Frontend pokazuje dane do przelewu

**Frontend:**

- Po confirm dostał `{paymentMethod: 'BANK_TRANSFER'}`
- Woła `GET /api/orders/:orderId` dla danych (totalPriceNet, lines)
- Router push `/checkout/bank-transfer?orderId=...`
- Renderuje stronę: "Dane do przelewu"
  - Numer konta CyberCover
  - Tytuł: `PF/ABX-NNNN/2026` (klient wklei w przelew)
  - Kwota: `totalPriceNet` + 23% VAT
  - Informacja: "Na Twój email wysłaliśmy pro formę w PDF"
  - 14 dni na opłacenie, inaczej auto-cancel

### 4.3 Krok 7 (BANK_TRANSFER): Klient robi przelew (poza systemem)

Klient loguje się do swojego banku, wkleja dane, wysyła przelew. To dzieje się **poza naszym systemem** — typowo 1 dzień roboczy do zaksięgowania.

### 4.4 Krok 8 (BANK_TRANSFER): Admin księguje przelew

**Admin:**

- Sprawdza wyciąg bankowy (albo powiadomienie z banku)
- Dopasowuje wpłatę do Order (match po tytule `PF/ABX-NNNN/2026`)
- W panelu admina klika "Oznacz jako opłacone" → FE woła `POST /api/admin/orders/:orderId/mark-paid` z `{bankRef: 'REF-12345', paidAt: '2026-04-25T10:30:00Z'}`
  - **Auth:** `AdminBearer` JWT z rolą `SUPER_ADMIN`

**Backend:**

- Dispatch: `MarkBankTransferAsPaidCommand(orderId, bankRef, paidAt, adminUserId)`
- Handler:
  1. Load Payment (musi być `PENDING` + method `BANK_TRANSFER`)
  2. `payment.markPaidByAdmin(bankRef, paidAt, adminUserId)`:
     - Guard: INV-7.4 — tylko BANK_TRANSFER
     - Transition: `PENDING → SUCCEEDED`
     - externalRef = `BankRef` VO (z adminInputa)
     - `markedPaidByAdminUserId` = audit trail
     - Emit **`PaymentRecordedEvent`** (ten sam event co w Flow A!)

### 4.5 Cron: auto-cancel po 14 dniach (safety net)

Jeśli klient nie zrobi przelewu w 14 dni:

- Cron `AutoCancelExpiredOrdersHandler` (uruchamiany dziennie)
- Znajduje Orders: `status === CONFIRMED`, `paymentMethod === BANK_TRANSFER`, `createdAt < 14 dni temu`
- Dla każdego: `order.autoCancel()` → status `CONFIRMED → CANCELLED`, emit `OrderAutoCancelledEvent`
- Email do klienta: "Twoje zamówienie zostało anulowane z powodu braku płatności"

---

## 5. Flow C — Promotional zero-amount

Trzecia ścieżka, ortogonalna do Flow A/B. Wchodzimy w nią gdy `Order.totalPrice().amount === 0` **i** order ma promotional discount snapshot (`PARTNER_TIMEBOUND` lub `PARTNER_COMPOSITE` ze 100% rabatem na wybrany plan). Wspólne Kroki 0-4 z Flow A/B (patrz § 3.1-3.3, plus § 2.5 dla mechanizmu zniżek). Różnica zaczyna się w **Kroku 5 (confirm)**.

### 5.1 Trigger — kiedy idziemy w Flow C zamiast Flow A/B

W `ConfirmOrderHandler` (BC3) po walidacji kompletności i ról:

```ts
const total = order.totalPrice();
if (total.amount === 0 && order.hasPromotionalDiscount()) {
  order.confirmAsPaid(clock, customerId, planId); // ← Flow C
} else {
  order.confirm(clock); // ← Flow A/B
}
```

`Order.hasPromotionalDiscount()` jest `true` gdy `_discountSnapshot.kind ∈ {PARTNER_TIMEBOUND, PARTNER_COMPOSITE}`. Dla `CODE_FLAT` / `PARTNER_FLAT` (nawet gdyby applier teoretycznie ustawił 0 PLN), `confirmAsPaid` rzuci `ConfirmAsPaidRequiresPromotionalDiscountError` — ścieżka wymaga **promo** specifically, nie tylko `total === 0` (chroni przed pomyłkami konfiguracji).

### 5.2 `Order.confirmAsPaid()` — atomic single-step transition

Standardowy `Order.confirm()` (Flow A/B) wykonuje tylko `DRAFT → CONFIRMED` — płatność i `markAsPaid` są późniejszymi etapami. `confirmAsPaid` zwija dwa etapy w jeden:

```
Flow A/B confirm:
  DRAFT ──confirm()──▶ CONFIRMED ──(pay)──▶ PENDING_PAYMENT
                              ──webhook──▶ markAsPaid() ──▶ PENDING_ALLOCATION
       ↑ 2-3 osobne transition'y ↑ 2-3 osobne eventy

Flow C confirmAsPaid:
  DRAFT ──confirmAsPaid()──▶ PENDING_ALLOCATION
       ↑ 1 transition, atomic w 1 commitcie
       ↑ 2 eventy w 1 transakcji (OrderConfirmedEvent + OrderPaidEvent)
```

**Preconditions** (rzuca jeśli nie spełnione):

- Order musi być `DRAFT` (`InvalidOrderStateError` jeśli inny status)
- `checkoutProgress.isComplete()` — wszystkie 4 kroki wypełnione (`IncompleteCheckoutError`)
- `OrderParties.validate()` — wszystkie role obsadzone (`InvalidRoleAssignmentError`)
- `total.amount === 0` (`ConfirmAsPaidRequiresZeroTotalError`)
- `hasPromotionalDiscount()` (`ConfirmAsPaidRequiresPromotionalDiscountError`)

**Side effects** (atomic w 1 commit aggregate):

- `_status = PENDING_ALLOCATION`
- `_confirmedAt = clock.now()`
- `_confirmationToken = randomUUID()` (do potencjalnego deep-linkingu na success page)
- `_planId = planId` (potrzebne dla `startProcessing` later)
- emit `OrderConfirmedEvent(orderId, total, payerId, insurerId, billingCycle, paymentMethod, lineSnapshots)`
- emit `OrderPaidEvent(orderId, paymentId, paymentRef=null, paidAt=now, customerId, insurerId, planId, billingCycle, totalAmount=Money.zero, stripeCustomerId=null, stripePaymentMethodId=null, paymentChannel=PROMOTIONAL_DISCOUNT, paymentMethod)`

`paymentId` jest generowany lokalnie (`PaymentId.generate()`) — **brak rzeczywistego Payment aggregate** w BC7 dla Flow C. Pole istnieje dla zachowania kontraktu eventu, ale nie odpowiada żadnemu rekordowi w `payments` collection.

### 5.3 Konsumenci `OrderConfirmedEvent` w Flow C

W odróżnieniu od Flow A/B (gdzie `OrderConfirmedEvent` triggerował BC7 Payment creation, BC6 ProForma, Customer Onboarding email pro forma) — w Flow C konsumenci są zredukowani:

- **BC7 Payment Processing** — `WhenOrderConfirmedHandler` widzi `paymentMethod ∈ {STRIPE_CHECKOUT, BANK_TRANSFER}` ale nie reaguje (Payment nie jest tworzony — patrz 5.5 dla osobnego endpointu Stripe setup mode).

  > **Uwaga:** dla `BANK_TRANSFER` standardowy handler tworzyłby Payment + ProForma. Dla Flow C `BANK_TRANSFER` znaczy tylko **deklarowany kanał na future renewal post-promo** (zapisywany na Sub jako `_postPromoBillingChannel`), nie stripe-vs-przelew na initial purchase. Initial purchase nie wymaga żadnej płatności (0 PLN). BC7 handler wykrywa to przez sprawdzenie `Order.totalPrice().amount === 0` i pomija.

- **BC4 Subscription Lifecycle** — zapisuje "subscription intent" (DRAFT Sub powstaje teraz przez `WhenOrderConfirmedHandler` BC4 jak normalnie). Sub wstaje w `DRAFT` z `currentOrderRef = orderId`.
- **BC6 Billing** — **nie generuje ProForma** (brak kwoty do zapłacenia). Posting rule `ProFormaOnOrderConfirmedFactory` ma guard `if totalAmount.amount === 0 → []`.
- **Customer Onboarding** — **nie wysyła** email pro forma. `WhenOrderConfirmedForBankTransferHandler` ma guard analogiczny.

### 5.4 Konsumenci `OrderPaidEvent` w Flow C — fan-out przez `OrderAllocationStartedEvent`

Po INV-3.16 (CC-353) rich `OrderPaidEvent` ma **dokładnie jednego subskrybenta** — `InitAllocationProgressHandler`. Wszystkie inne post-paid handlery (BC4/BC6/BC9/Onboarding) słuchają `OrderAllocationStartedEvent` emitowanego po init `allocation_progress` doc'a. Wynika z tego, że promo i non-promo dzielą tę samą "bramkę" eventu — różnica jest **w discriminowaniu po `paymentChannel`**.

```
OrderPaidEvent (paymentChannel=PROMOTIONAL_DISCOUNT)
  └─▶ InitAllocationProgressHandler (BC3)
        ├─ resolve policyRequired
        ├─ repo.initialize(orderId, policyRequired, paidAt)
        └─ emit OrderAllocationStartedEvent (z paymentChannel + paymentMethod
                                             propagated z OrderPaidEvent)

OrderAllocationStartedEvent (paymentChannel=PROMOTIONAL_DISCOUNT)
  ├─ BC4 WhenOrderPaidHandler         → early-return (jeśli channel === PROMOTIONAL_DISCOUNT)
  ├─ BC4 WhenPromotionalOrderPaidHandler → aktywuje DRAFT Sub (channel === PROMOTIONAL_DISCOUNT only)
  ├─ BC4 WhenRenewal/PlanUpgrade/Reactivation → early-return (orderType nie matchuje)
  ├─ BC6 PostingRulesEventHandler      → wybiera regułę PromotionalCycleZeroAmountFactory
  ├─ BC9 WhenOrderPaidHandler          → captureOperationalStandards (bez zmian)
  └─ Customer Onboarding WhenOrderPaidHandler → completeOnboarding (z deferred Bug 8 dla promo)
```

#### 5.4.1 BC4 — `WhenPromotionalOrderPaidHandler` (sibling do `WhenOrderPaidHandler`)

`libs/subscription-lifecycle/src/application/event-handlers/when-promotional-order-paid.handler.ts`:

1. Filter: `event.paymentChannel === PROMOTIONAL_DISCOUNT` — inaczej return (non-promo path).
2. `repo.findByCurrentOrderRef(event.orderId)` — Sub utworzona w DRAFT przez `WhenOrderConfirmedHandler` (BC4) wcześniej w cascade. **Subskrypcja na `OrderAllocationStartedEvent` zamiast `OrderPaidEvent` zapewnia że init Sub doc'a istnieje** zanim ten handler uderzy (gdyby był na OrderPaidEvent → race między tymi handlerami).
3. `subscription.activate({currentOrderRef, activatedAt: paidAt, postPromoBillingChannel, stripeCustomerId: null, stripePaymentMethodId: null})`:
   - `postPromoBillingChannel = STRIPE` jeśli `event.paymentMethod === STRIPE_CHECKOUT`, inaczej `BANK_TRANSFER`.
   - Stripe IDs **null** intencjonalnie — capture karty dla future renewal odbywa się **po** confirm przez `POST /stripe-checkout-session` w mode='setup' (patrz 5.5).
   - Sub wstaje też z `_promoEndsAt = paidAt + promotionalDuration.months` (z snapshotu zniżki na orderze, propagowane przez ACL z BC3).
4. emit `SubscriptionActivatedEvent` — flag handler BC3 ustawia `subscriptionActive: true` w `allocation_progress`.

**Komplementarnie** — `WhenOrderPaidHandler` (sibling, non-promo path):

```ts
async handle(event: OrderAllocationStartedEvent): Promise<void> {
  if (event.paymentChannel === PaymentChannel.PROMOTIONAL_DISCOUNT) {
    return; // promotional path handled by WhenPromotionalOrderPaidHandler
  }
  // ... normalna ścieżka activation z prawdziwymi Stripe IDs
}
```

Mutual exclusion przez channel guard zapewnia że dla danej Sub odpali się **dokładnie jeden** activation handler.

#### 5.4.2 BC6 — `PromotionalCycleZeroAmountFactory` (zamiast `VatInvoiceOnPaymentRecordedFactory`)

`libs/billing/src/application/posting-rules-catalog/promotional-cycle-zero-amount.factory.ts`:

- Whenever `whenEvent(OrderAllocationStartedEvent)` (rule wired do PostingRulesEventHandler).
- Eligibility: `ctx.event.totalAmount.amount === 0` AND `orderView.orderType === 'INITIAL_PURCHASE'`.
- Wynik: pojedyncza `PROMOTIONAL_RENEWAL` Transaction z dwoma zerowymi entries:
  - **Debit** `acc_sys_asset_cash` 0 PLN
  - **Credit** `acc_sys_revenue_plan_subscriptions` 0 PLN
- Dwa zerowe entries spełniają domain constraints `Min2Entries + Min2Accounts + Balanced` (Bug 2 fix — pojedynczy entry naruszał `Min2EntriesConstraint`).
- Metadata `PromotionalRenewalMetadata` zawiera `kind: 'PROMOTIONAL_RENEWAL'`, `idempotencyKey: promotional-renewal:${orderId}`, `cycleNumber: 1` (initial purchase = cycle 1), `paidAt`, customer/insurer/payment IDs.

> **Dlaczego osobna factory zamiast `VatInvoiceOnPaymentRecordedFactory`?** Standardowa factory ma symmetric guard `if (totalAmount.amount === 0) return []` — promo by przeszło bez audytu. Symmetric guard + osobna factory dla 0 PLN = **zawsze powstaje audit trail** niezależnie od kwoty.

> **Build-or-update projection — Bug 5 fix:** `BuildOrUpdateProjectionService` (BC6) przed CC-353 czytał `typed.netAmount.amount` z metadata wszystkich TX-ów. `PromotionalRenewalMetadata` nie ma pola `netAmount` → `TypeError`. Fix: early-return jeśli `tx.type.equals(TransactionType.PROMOTIONAL_RENEWAL)` (audit-only, nie buduje invoice projection).

#### 5.4.3 BC6 → BC3 flag bridge — `PromotionalCycleRecordedEvent`

Klasyczny audit trail BC6 dla VAT invoice'a (Flow A/B): po `TransactionExecutedEvent(VAT_INVOICED)` posting rule emituje `VatInvoiceIssuedEvent` → BC3 `WhenVatInvoiceIssuedUpdatesAllocation` ustawia flag `vatInvoiceIssued: true` w `allocation_progress`. Order może wtedy przejść z `PENDING_ALLOCATION → PROCESSING`.

Flow C nie wystawia faktury VAT → standardowy event nigdy nie leci → flag nigdy nie ustawiona → **order utknie w `PENDING_ALLOCATION` na wieki** (Bug 7 — discovered podczas live verification 2026-04-29).

**Fix (CC-353):** symmetric event `PromotionalCycleRecordedEvent` (BC6 published language) emitowany analogicznie do `VatInvoiceIssuedEvent`, ale dla `PROMOTIONAL_RENEWAL` TX:

```
TransactionExecutedEvent(PROMOTIONAL_RENEWAL)
  └─▶ PublishPromotionalCycleRecordedFactory (BC6 posting rule, side-effect)
        └─▶ PromotionalCycleRecordedEvent(orderId, paymentId, customerId, insurerId,
                                          cycleNumber, paidAt) (BC6 published)

PromotionalCycleRecordedEvent
  └─▶ WhenPromotionalCycleRecordedUpdatesAllocationHandler (BC3)
        └─▶ allocationProgressService.recordFlag(orderId, 'vatInvoiceIssued')
```

Mapowanie 1:1 do flag `vatInvoiceIssued` jest celowe — z perspektywy BC3 Order Lifecycle nie ma znaczenia czy upstream był VAT invoice czy promo cycle. Flag w `allocation_progress` reprezentuje "billing artifact emitted" (audit + księgowość gotowa).

> **Bug 3 fix (cycleNumber coercion):** `PromotionalRenewalMetadata.cycleNumber` był pierwotnie `z.number()` w Zod schema. Mongo serializacja: `JSON.stringify(1) = "1"` (string). Parse na readzie rzucał `ZodError`. Fix: `z.coerce.number().int().positive()`.

#### 5.4.4 BC9 + Customer Onboarding — bez większych zmian (modulo Bug 8)

- **BC9 `WhenOrderPaidHandler`** (operational standards capture) — działa tak samo dla promo, czyta answers z Order, zapisuje `CustomerOperationalStandards`. Flag `opsStandardsCaptured` ustawiany jak dla Flow A/B.
- **Customer Onboarding `WhenOrderPaidHandler`** — `service.completeOnboarding(orderId, paymentId)`:
  - Ścieżka happy path: tworzy User + Company, queue welcome email + magic link email + VAT email PDF.
  - **Problem (Bug 8, deferred):** dla promo nie ma VAT invoice → `service.completeOnboarding` lookup'uje VAT invoice po `orderId` → not found → `markNeedsAdminReview('VAT_INVOICE_NOT_FOUND')` + admin alert + return (nie emituje `OnboardingCompletedEvent`).
  - **Skutek:** flag `portalAccessDelivered` (część Fulfillment) nigdy nie fires → order utknie w `PROCESSING` (po domknięciu Allocation), nie dojdzie do `FULFILLED`.
  - **Fix (deferred — `PROMO-ONBOARDING-FIX`):** rozróżnić ścieżkę promo (po `Order.totalPrice() === 0` lub flag z eventu), wysłać tylko activation email + magic link, **bez VAT attachment**, zakończyć onboarding sukcesem → emit `OnboardingCompletedEvent` → fulfillment flag set → order FULFILLED.

### 5.5 Stripe Checkout w mode='setup' (capture karty bez pobrania kwoty)

Klient płaci 0 PLN — ale system potrzebuje karty na **future renewal** po wygaśnięciu promo (po `_promoEndsAt`). Stripe Checkout obsługuje to przez `mode='setup'` (zamiast standardowego `mode='payment'`):

**Frontend** po confirm dostaje `{paymentMethod: 'STRIPE_CHECKOUT'}` i woła `POST /api/sales-order/:orderId/stripe-checkout-session` (ten sam endpoint co Flow A — patrz § 10.2.1).

**Backend (`StripePaymentGateway.createStripeCheckoutSession`)** wykrywa `args.amount.amount === 0` i przełącza tryb sesji:

```ts
const mode: StripeCheckoutSessionMode = args.amount.amount === 0 ? 'setup' : 'payment';

const params =
  mode === 'payment'
    ? {
        // ... line_items, payment_intent_data
      }
    : {
        ...commonParams,
        // Stripe wymaga top-level `currency` w mode='setup' (Bug 6 fix — bez tego API
        // zwraca 400 `parameter_missing` bo currency normalnie deriwowany z line_items).
        currency: args.amount.currency.toLowerCase(),
        setup_intent_data: { metadata: { orderId: args.orderId.value } },
      };
```

User klika "Zapłać", przechodzi do Stripe hosted page **bez kwoty do zapłacenia** — tylko formularz karty. Po submit Stripe attach'uje kartę do nowo utworzonego Customer'a i emituje webhook `setup_intent.succeeded`.

**Webhook handling — `WhenSetupIntentCompletedHandler` (BC4):**

```ts
const subscription = await this.repo.findByCurrentOrderRef(event.orderId);

if (subscription.status === SubscriptionStatus.ACTIVE) {
  // Promo path — Sub już aktywowana przez WhenPromotionalOrderPaidHandler.
  // Tylko attach Stripe IDs (idempotent).
  merged.attachPaymentMethod({
    stripeCustomerId: event.stripeCustomerId,
    stripePaymentMethodId: event.stripePaymentMethodId,
  });
} else if (subscription.status === SubscriptionStatus.DRAFT) {
  // Race-condition guard: jeśli order ma promo duration, promo handler jeszcze
  // w locie. Throw → Stripe retry'uje webhook (eventual consistency).
  if (orderView?.promotionalDuration) {
    throw new Error(`Promotional Sub activation in flight for order=... — retry`);
  }
  // Trial-mode path (non-promotional): startTrial(...)
}
```

> **Race condition note:** Stripe webhook może dotrzeć **przed** zakończeniem fan-out'u `OrderAllocationStartedEvent` (BC4 promo activation jeszcze nie completed). Handler discriminuje po Sub status: jeśli `DRAFT` z promo duration → throw → Stripe retry po 2-5s gdy stan już ACTIVE.

### 5.6 Subscription state po Flow C confirm

Po atomic `confirmAsPaid` + fan-out + Stripe setup:

```
Subscription {
  _subscriptionId: <uuid>,
  _status: ACTIVE,
  _currentOrderRef: <orderId>,
  _activatedAt: <paidAt z OrderAllocationStartedEvent>,
  _postPromoBillingChannel: STRIPE | BANK_TRANSFER,
  _promoEndsAt: <paidAt + promotionalDuration.months>,
  _stripeCustomerId: <ustawione przez WhenSetupIntentCompletedHandler> | null,
  _stripePaymentMethodId: <ustawione przez WhenSetupIntentCompletedHandler> | null,
  _partnerDiscount: { partnerCode: 'TIMEBOUND_DEMO', percent: 100 },
  _cycleValidity: { from: <paidAt>, to: <paidAt + 1 cycle> }
}
```

Jeśli klient nigdy nie skończył Stripe setup (zamknął okno, abandonement) — Sub jest ACTIVE bez Stripe IDs. Patrz § 7.11 dla edge case'u.

### 5.7 Allocation/Fulfillment flag set dla Flow C

Standardowo `AllocationProgress` wymaga 4 flag (3 required + opcjonalnie `policyCreated`). Dla Flow C standardowo:

| Flag                   | Required dla promo? | Source                                                                                                                           |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptionActive`   | yes                 | `SubscriptionActivatedEvent` z `WhenPromotionalOrderPaidHandler`                                                                 |
| `vatInvoiceIssued`     | yes                 | **`PromotionalCycleRecordedEvent`** zamiast `VatInvoiceIssuedEvent` (patrz 5.4.3)                                                |
| `opsStandardsCaptured` | yes                 | `OperationalStandardsCapturedEvent` z BC9 (bez zmian)                                                                            |
| `policyCreated`        | no                  | Promo standardowo na planie Standard (`hasInsuranceFeature: false`) → `policyRequired: false` w init handler → flag nie wymagany |

Po domknięciu allocation: `StartOrderProcessingCommand` → `order.startProcessing()` → `PENDING_ALLOCATION → PROCESSING` (jak w Flow A/B).

**Fulfillment dla Flow C (deferred — Bug 8):** `portalAccessDelivered` ustawiany przez `OnboardingCompletedEvent`. Bez fix'a Bug 8 ten event nie poleci dla promo → order zatrzyma się w `PROCESSING`. Manual workaround: admin retry'uje onboarding po dorobieniu VAT invoice / pomijaniu wymogu. Permanent fix — patrz § 7.11.

### 5.8 Post-promo renewal — co dzieje się po `_promoEndsAt` (deferred)

Gdy `_promoEndsAt` upłynie (np. po 3 miesiącach dla `TIMEBOUND_DEMO`):

- Scheduler routes by `_postPromoBillingChannel`:
  - `STRIPE` → off-session charge na zapisanej karcie (`stripePaymentMethodId`). Standardowy renewal flow Flow A.
  - `BANK_TRANSFER` → wystawienie ProForma + email do klienta. Standardowy renewal flow Flow B.

**Status implementacji (2026-04-29):** **NIE zaimplementowane**. Deferred jako ticket `PROMO-CYCLE-SCHEDULER` (combine Task 4.4 + 5.2 z planu CC-353). Estimated 2-3 dni:

- Modyfikacja `bank-transfer-renewal.job.ts` żeby filterował promotional Subs (`_promoEndsAt > cycleEnd → skip`).
- Nowy `PromotionalCycleAdvanceJob` (daily cron) dla ACTIVE subs z `_promoEndsAt > now` i nie-zakończonym promo.
- Routing po `_postPromoBillingChannel` przy expiry.

Niezależny od głównego flow Flow C — ten deferred ticket nie blokuje user'owej ścieżki initial purchase, blokuje tylko post-promo continuation. Subskrypcje stworzone w Flow C będą "wisieć" w stanie ACTIVE na zawsze dopóki scheduler nie zostanie dorobiony (co dla demo / first-3-months prób jest akceptowalne, ale dla production-grade promo niezbędne).

---

## 6. Wspólna kaskada po zaksięgowaniu płatności

**Startuje od emit `PaymentRecordedEvent`** — niezależnie od ścieżki (Stripe webhook albo admin mark-paid).

Event zawiera: `paymentId`, `orderId`, `amount`, `method` (STRIPE_CHECKOUT albo BANK_TRANSFER), `paidAt`, `externalRef`, `metadata`, opcjonalnie `markedByAdminUserId` (dla bank transfer), `stripeCustomerId`, `stripePaymentMethodId`.

> **INV-3.16 (CC-353):** `PaymentRecordedEvent` ma **dokładnie jednego subskrybenta** — BC3 `WhenPaymentRecordedHandler`. Z kolei `OrderPaidEvent` (emitowany przez BC3 po `Order.markAsPaid` / `Order.confirmAsPaid`) ma **dokładnie jednego subskrybenta** — `InitAllocationProgressHandler` (BC3). Wszystkie post-paid handlery w pozostałych BC (BC4/BC6/BC9/Onboarding) słuchają `OrderAllocationStartedEvent` emitowanego przez init handler **po** zainicjalizowaniu doc'a `allocation_progress`. Dwustopniowy gating zapewnia, że flag handlery zapisujące do `allocation_progress` nigdy nie wyścigają się z init upsertem (wcześniej BC6 i Onboarding oba reagowały na `PaymentRecordedEvent`, a Onboarding polegał na wcześniejszym wykonaniu BC6 przez kolejność deklaracji handlerów w NestJS — fragile).

### 6.1 BC3 — resolve kontekst + markAsPaid

`WhenPaymentRecordedHandler` (BC3):

1. Dispatch: `GetOrderForSubscriptionQuery(orderId)` — zwraca `OrderSubscriptionView` (customerId, insurerId, planId, billingCycle) albo `null` jeśli order nie jest `CONFIRMED` (idempotent skip + WARN log).
2. Dispatch: `MarkOrderAsPaidCommand(orderId, paymentId, paymentRef, paidAt, customerId, insurerId, planId, billingCycle, totalAmount, stripeCustomerId, stripePaymentMethodId)` — 11 argumentów.
3. `MarkOrderAsPaidHandler` woła `order.markAsPaid(...)` na aggregate → transition `CONFIRMED → PENDING_ALLOCATION` → emit **rich `OrderPaidEvent`** (11 pól).

### 6.2 Fan-out po `OrderPaidEvent` (przez `OrderAllocationStartedEvent`) do 4 BC

Sekwencyjnie:

```
OrderPaidEvent
  └─▶ InitAllocationProgressHandler (BC3, jedyny subskrybent OrderPaidEvent per INV-3.16)
        └─▶ emit OrderAllocationStartedEvent (z paymentChannel + paymentMethod
                                              propagated z OrderPaidEvent)

OrderAllocationStartedEvent  (równolegle, NestJS @nestjs/cqrs)
  ├─▶ BC4 WhenOrderPaidHandler                    (early-return dla PROMOTIONAL_DISCOUNT)
  ├─▶ BC4 WhenPromotionalOrderPaidHandler         (only dla PROMOTIONAL_DISCOUNT — patrz § 5.4.1)
  ├─▶ BC4 WhenRenewalOrderPaidHandler             (filter po orderType === RENEWAL)
  ├─▶ BC4 WhenPlanUpgradeOrderPaidHandler         (filter po orderType === PLAN_UPGRADE)
  ├─▶ BC4 WhenReactivationOrderPaidHandler        (filter po orderType === REACTIVATION)
  ├─▶ BC6 PostingRulesEventHandler                (rules union: VatInvoice / Promo / ProForma)
  ├─▶ BC9 WhenOrderPaidHandler                    (operational standards capture)
  └─▶ Customer Onboarding WhenOrderPaidHandler    (User + Company create + emails)
```

**BC4 Subscription Lifecycle** — `WhenOrderPaidHandler` (subskrybuje `OrderAllocationStartedEvent`):

- Filter: `event.paymentChannel !== PROMOTIONAL_DISCOUNT` (inaczej promo handler obsługuje).
- Filter: `event.orderType === INITIAL_PURCHASE` (inne orderTypes mają osobne handlery).
- Znajduje DRAFT Subscription po `currentOrderRef === event.orderId`.
- `subscription.activate({currentOrderRef, activatedAt, stripeCustomerId, stripePaymentMethodId})` → `DRAFT → ACTIVE`. Save-card IDs zostają na subscription (cron renewal wykorzysta je do off-session PaymentIntent).
- Emit `SubscriptionActivatedEvent` (zawiera `currentOrderId`, stripe IDs, cycleValidity).

**BC6 Billing** — `PostingRulesEventHandler` (union `OrderConfirmedEvent | OrderAllocationStartedEvent | TransactionExecutedEvent`):

- Dla kontekstu `kind: 'OrderPaid'` (z `OrderAllocationStartedEvent` mapowane do tego kontekstu) uruchamia regułę `VatInvoiceOnPaymentRecordedFactory`:
  - Guard: `event.totalAmount.amount > 0` (Flow A/B; promo path `=== 0` przejmuje `PromotionalCycleZeroAmountFactory` — patrz § 5.4.2).
  - Generuje `VAT Invoice` (numer `FV/ABX-NNNN/2026`), zapisuje Transaction.
  - Emit `VatInvoiceIssuedEvent` (zawiera `orderId: string`).
- Po `TransactionExecutedEvent(VAT_INVOICED)` rule `EnqueueKsefSubmissionOnVatInvoiceIssuedFactory`:
  - Dispatch `EnqueueKsefSubmissionCommand(invoiceNumber, orderId, snapshot)`.
  - BC8 `KsefSubmission.create()` z `orderId` → QUEUED → BullMQ outbox → inFakt API.
  - Retry 5x; hard error → `KsefRejectionReceivedEvent` (zawiera `orderId`).

**BC9 Customer Operational Standards** — `WhenOrderPaidHandler` (subskrybuje `OrderAllocationStartedEvent`):

- Czyta `OrderAnswersReadPort.getAnswersForOrder(event.orderId)` (ACL do BC3).
- Dispatch `CaptureOperationalStandardsCommand(orderId, customerId, insurerId, answers, {kind:'payment', paymentId})`.
- `CustomerOperationalStandards.create(orderId, customerId, insurerId, answers)` → emit `OperationalStandardsCapturedEvent` (z `orderId`).

**Customer Onboarding** — `WhenOrderPaidHandler` (subskrybuje `OrderAllocationStartedEvent`):

- `service.completeOnboarding(event.orderId, event.paymentId)`:
  - Load/create onboarding aggregate.
  - Resolves user: nowy User + Company (BC `users-core`, `companies-core`) albo reuse istniejącego (policy H4).
  - Aggregate `markUserCreated(userId, companyId)` → `STARTED → USER_CREATED` → emit `CustomerOnboardingUserCreatedEvent(orderId, userId, companyId, createdAt)`.
  - Queue BullMQ job: **welcome email** z VAT PDF + **magic link email**.
  - Aggregate `markEmailsQueued(confirmationJobId)` → `USER_CREATED → EMAILS_QUEUED` → emit `CustomerOnboardingCompletedEvent(orderId, paymentId, userId, companyId, completedAt)`.
  - Exceptions są logowane, **nie rethrowowane** (soft fail by design — admin alert w razie NEEDS_ADMIN_REVIEW).

**BC5 Insurance Policy** (pośrednio, na `SubscriptionActivatedEvent`):

- `WhenSubscriptionActivatedHandler`:
  - Idempotency: jeśli Policy już istnieje dla subscription → swallow.
  - `insuranceFeature.getForPlan(planRef)` — jeśli null (plan bez ubezpieczenia, np. Standard) → swallow (no Policy created).
  - `insurers.getSnapshot(insurerId)` z BC1.
  - `eligibility.evaluate(customerId, insurerId)` — BC9.
  - `Policy.create({orderId: event.currentOrderId, policyId, customerId, subscriptionId, insurerId, planRef, insuranceFeatureSnapshot, insurerSnapshot, eligibilityAssessmentRef})` → emit **`PolicyCreatedEvent`** (zawiera `orderId`).
  - Jeśli `isMet === true` → `policy.activate(event.activatedAt)` → emit **`PolicyActivatedEvent`** (zawiera `orderId`).

### 6.3 BC3 `AllocationProgress` — PENDING_ALLOCATION → PROCESSING

**Semantyka fazy:** tworzenie **bytów wewnętrznych** w bazie danych — nie dostarczane jeszcze do klienta.

BC3 utrzymuje per-order read-model `AllocationProgress` w kolekcji `allocation_progress`:

```
{ orderId, subscriptionActive, vatInvoiceIssued, opsStandardsCaptured,
  policyRequired, policyCreated, failed, failedStep/Reason/Context,
  startedAt, completedAt }
```

**Init:** `InitAllocationProgressHandler` na `OrderPaidEvent`:

- `insuranceFeature.planHasInsuranceFeature(event.planId)` → `policyRequired: boolean`
- `repo.initialize(orderId, policyRequired, event.paidAt)` (idempotent upsert `$setOnInsert`)
- Emit `OrderAllocationStartedEvent` (gating dla downstream BC4/BC6/BC9/Onboarding — zapewnia że `allocation_progress` doc istnieje zanim flag handlery uderzą)

**Flag setters (4 handlery w `libs/sales-order/.../allocation-progress/handlers/`):**

| Event                               | Handler                                             | Ustawiana flaga                                            |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `SubscriptionActivatedEvent`        | `WhenSubscriptionActivatedUpdatesAllocationHandler` | `subscriptionActive`                                       |
| `VatInvoiceIssuedEvent`             | `WhenVatInvoiceIssuedUpdatesAllocationHandler`      | `vatInvoiceIssued`                                         |
| `OperationalStandardsCapturedEvent` | `WhenOpStandardsCapturedUpdatesAllocationHandler`   | `opsStandardsCaptured` (null-guard gdy orderId z migracji) |
| `PolicyCreatedEvent`                | `WhenPolicyCreatedUpdatesAllocationHandler`         | `policyCreated`                                            |

> **Uwaga:** `userCreated` **nie jest** częścią allocation. User aggregate to potencjalny dostęp klienta do portalu → semantycznie "dostarczanie do klienta" → tracked w fulfillment (`portalAccessDelivered`).

Każdy handler woła `allocationProgressService.recordFlag(orderId, flagName)`:

1. `repo.setFlag(orderId, flag)` — atomic `findOneAndUpdate` z filtrem `{completedAt: null, failed: false}`.
2. Jeśli `allFlagsMet(progress)` (wszystkie 3 required + `policyCreated === true` gdy `policyRequired === true`):
   - `repo.markCompleted(orderId, new Date())`
   - Dispatch `StartOrderProcessingCommand(orderId)`.
3. `StartOrderProcessingHandler` → `order.startProcessing()` → `PENDING_ALLOCATION → PROCESSING` → emit `OrderProcessingStartedEvent(orderId, planId)`.

**Idempotency:** `setFlag` zwraca null jeśli `completedAt` już set → kolejne eventy (at-least-once) są no-op.

**Error handling (hard domain errors):**

- Każdy flag-handler wrapuje `recordFlag(...)` w `try/catch`.
- Na error: `allocationProgressService.markFailed(orderId, flagName, err.message, context)`:
  - `repo.markFailed` ustawia `failed: true, failedStep, failedReason, failedContext`.
  - `eventBus.publish(OrderAllocationFailedEvent)`.
  - `adminAlertPort.alertAllocationFailed(orderId, step, reason, context)` → email do admina (template `ADMIN_GENERIC_ALERT`).
- Order zostaje w `PENDING_ALLOCATION`. Admin decyduje: retry / cancel / manual cleanup.

### 6.4 BC3 `FulfillmentProgress` — PROCESSING → FULFILLED

**Semantyka fazy:** dostarczenie wartości klientowi — dostęp do portalu, faktura w mailu, aktywna polisa.

Analogiczny read-model w kolekcji `fulfillment_progress`:

```
{ orderId, portalAccessDelivered, policyRequired, policyActive,
  failed, failedStep/Reason/Context, startedAt, completedAt }
```

**Init:** `InitFulfillmentProgressHandler` na `OrderProcessingStartedEvent`:

- `insuranceFeature.planHasInsuranceFeature(event.planId)` → `policyRequired: boolean`
- `repo.initialize(orderId, policyRequired, new Date())` — `$set` dla `policyRequired`+`startedAt` (autorytatywne), reszta przez `$setOnInsert` (idempotentne wobec setFlag race)

**Flag setters (2 handlery):**

| Event                              | Handler                                            | Ustawiana flaga                                                                                                                           |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerOnboardingCompletedEvent` | `WhenOnboardingCompletedUpdatesFulfillmentHandler` | `portalAccessDelivered` (pokrywa: user utworzony + magic link queued + VAT email queued — jedna semantyczna jednostka "klient ma dostęp") |
| `PolicyActivatedEvent`             | `WhenPolicyActivatedUpdatesFulfillmentHandler`     | `policyActive` (null-guard gdy orderId brak dla starych polis)                                                                            |

**Race condition safeguard (CC-353):** flag events mogą być emitowane z różnych BC **zanim** `OrderProcessingStartedEvent` zostanie wyemitowany (np. `PolicyActivatedEvent` leci z BC5 commit() razem z `PolicyCreatedEvent`, a `OrderProcessingStartedEvent` dopiero po domknięciu `AllocationProgress`). Repo `setFlag` jest **upsert-based**: jeśli doc nie istnieje (race z init), tworzy szkielet z `policyRequired: true` (safe default) + target flag `true`. Init handler przychodzący później autorytatywnie nadpisuje `policyRequired` przez `$set`. Idempotentne w dowolnej kolejności.

Po domknięciu wszystkich wymaganych flag: `FulfillOrderCommand(orderId)` → `order.fulfill()` → `PROCESSING → FULFILLED` → emit `OrderFulfilledEvent`.

**Co NIE jest w fulfillment:**

- **KSEF acceptance** — to compliance między CyberCover a Ministerstwem Finansów. Klient nic z tego nie ma (fakturę PDF już dostał). KSEF lifecycle (`ksef_submissions` collection: `IN_FLIGHT → ACCEPTED / REJECTED`) jest niezależny od Order. Gdy KSEF odrzuci fakturę, wymagana jest korekta księgowa — osobny flow, nie zmienia statusu orderu ani dostępu klienta.

Error handling: analogiczne do AllocationProgress — `markFailed` → `OrderFulfillmentFailedEvent` + `adminAlertPort.alertFulfillmentFailed`.

### 6.5 FULFILLED → CLOSED (subscription lifecycle)

BC3 nasłuchuje 4 eventów z BC4 (CC-353):

| Event                                        | BC3 handler                        | `CloseOrderCommand` reason |
| -------------------------------------------- | ---------------------------------- | -------------------------- |
| `SubscriptionRenewedEvent.previousOrderRef`  | `WhenSubscriptionRenewedHandler`   | `RENEWED`                  |
| `SubscriptionExpiredEvent.currentOrderRef`   | `WhenSubscriptionExpiredHandler`   | `EXPIRED`                  |
| `SubscriptionUpgradedEvent.previousOrderRef` | `WhenSubscriptionUpgradedHandler`  | `UPGRADED`                 |
| `SubscriptionCancelledEvent.currentOrderRef` | `WhenSubscriptionCancelledHandler` | `CANCELLED`                |

`CloseOrderHandler` → `order.close(reason)` → `FULFILLED → CLOSED` → emit `OrderClosedEvent(orderId, reason)`.

**Idempotency / graceful swallow:** jeśli Order nie jest w `FULFILLED` (stuck w `PENDING_ALLOCATION` / `PROCESSING`, albo już `CLOSED/CANCELLED`), handler łapie `InvalidOrderStateError` + WARN log bez rethrow. Do manual cleanup przez admina.

### 6.6 Frontend polling

**Flow A (Stripe):**

- FE na `/checkout/success?orderId=...` poluje `GET /api/orders/:orderId` co 2s (max 30s).
- Gdy `status === FULFILLED` → "Dziękujemy za zakup" + info o emailu z magic linkiem.
- Kaskada kończy się typowo w <2s (od zaksięgowania webhooka Stripe do `FULFILLED`). KSEF już NIE gate'uje — jeśli kaskada trwa dłużej niż kilka sekund, problem jest w BullMQ queue (email / PDF generation) albo BC5 polling ubezpieczyciela.

**Flow B (bank transfer):**

- Klient nie jest na FE gdy admin księguje. Dostaje email z VAT + magic link po domknięciu fulfillmentu (5.4 → Customer Onboarding).

---

## 7. Scenariusze awaryjne i edge cases

### 7.1 Stripe odmawia płatności (zła karta)

- User wpisuje kartę 4000 0000 0000 0002 (test decline)
- Stripe nie wysyła webhook'a `checkout.session.completed` (nie było paid)
- Stripe redirectuje z powrotem na cancel_url (albo user klika "Wróć" w Stripe UI)
- FE: `/checkout/cancelled?orderId=...` — pokazuje "Spróbuj ponownie"
- Klik "Spróbuj ponownie" → ponowny `POST /stripe-checkout-session`:
  - Payment jest `PENDING`, session wciąż ważna → zwraca **ten sam URL** (idempotency)
  - User znowu na Stripe hosted page, może spróbować inną kartą

### 7.2 Klient zamknął przeglądarkę po confirm, wraca po 2 tygodniach (Stripe)

- Payment jest `PENDING`, session `expiredAt` już był
- Stripe emitował `checkout.session.expired` gdy 24h minęły — system zapisał `PaymentCheckoutSessionExpiredEvent`, Payment dalej `PENDING`
- Klient klika "Spróbuj ponownie" w emailu (future feature) albo wchodzi na `/checkout/cancelled?orderId=...`
- `POST /stripe-checkout-session` → handler widzi expired session → **lazy regeneration** → nowa session, nowy URL, emit `PaymentCheckoutSessionRegeneratedEvent`
- Klient płaci → webhook → success

### 7.3 Webhook Stripe zdublowany (sieć, retry)

- Stripe retry'uje webhook gdy my zwrócimy 5xx albo timeout
- Handler: `webhookStore.markProcessed(eventId, 24h TTL)` — drugi request dostaje `firstDelivery=false`, loguje "Duplicate", return bez akcji
- Redis dedup window = 24h, więc wszystkie praktyczne retry Stripe są wyłapane

### 7.4 Webhook przyszedł przed zapisem Payment w DB (wyścig)

- Klient kliknął "Zapłać" → Stripe autoryzuje szybko → webhook leci
- Nasz `CreateStripeCheckoutSessionHandler` jeszcze `repository.save(payment)` nie skończył (2ms opóźnienie)
- Webhook handler: `findBySessionId(cs_...)` zwraca `null`
- Handler loguje warn: "Payment not found for Stripe session X (event Y). Webhook arrived before DB insert or race — tolerating"
- Stripe po 2 sekundach retryuje webhook (bo my odpowiedzieliśmy 200 ale my go zignorowaliśmy technicznie — **problem**: musi być retry)
- Actually Stripe retry'uje tylko na non-2xx. Jak zwrócimy 200 bez akcji, Stripe uzna że OK. Więc tracimy webhook.

**Mitigation (do rozważenia w przyszłości):** handler powinien w tym przypadku zwrócić 503 żeby Stripe zrobił retry. Obecnie: brak tego guard'a — polegamy na idempotencji między requestami (drugi `POST /stripe-checkout-session` widzi PENDING SUCCEEDED i rzuci `PaymentAlreadyCompletedError`, ale frontendowi można odświeżyć `GET /orders/:id` żeby dostać FULFILLED).

### 7.5 Mismatch kwoty (ktoś zmienił cennik w BC2 w trakcie checkout)

- Klient startował w Kroku 0 gdy plan Optimum kosztował 495 zł
- W trakcie checkoutu admin zmienił cennik → 520 zł (nowa wersja opublikowana)
- Klient w Kroku 4 dostaje `CalculatedPricing` na kwotę zamrożoną (tej ze startu, bo Order trzyma snapshot)
- Stripe dostaje 495 zł w session
- Webhook przychodzi z `amount_total = 49500` (495 zł w groszach)
- `Payment.amount` też 49500 (bo zapisaliśmy przy create)
- **Amount-match passes** → Payment SUCCEEDED

**Alternatywnie:** jeśli by się nie zgadzało (np. Stripe zwróciło inną walutę / błąd) — handler loguje error + **nie przechodzi do SUCCEEDED** → wymaga manual reconciliation.

### 7.6 Klient nie spełnia standardów (`eligible=false`)

- W Kroku 3 klient zaznaczył "NIE" na "HAS_BACKUP"
- `ExplainableAlgebra` policzyła: eligible=false, missingRequirements=['HAS_BACKUP']
- Klient kontynuuje zakup (FE pokazuje warning ale nie blokuje)
- Kroki 4-7 przechodzą normalnie
- Po `PaymentRecordedEvent` BC5 tworzy Policy w stanie `PENDING_ELIGIBILITY` (Zamiast ACTIVE)
- Klient dostaje magic link, wchodzi do portalu, aktualizuje standardy
- BC9 re-evaluate → gdy eligible=true → BC5 Policy staje się `ACTIVE`

### 7.7 Email welcome padł (BullMQ failure)

- Job w queue `notifications` failed po 5 retry'ach
- `WhenEmailJobFailedListener` w customer-onboarding reaguje:
  - Log error + alert admin
  - `CustomerOnboardingLog` dostaje status `EMAIL_DELIVERY_FAILED`
  - Admin w panelu widzi failed onboardings, może ręcznie triggerować ponownie albo kontaktować się z klientem

### 7.8 Hard error w alokacji lub fulfillmencie (CC-353)

- Np. BC4 activate fails bo brak DRAFT Subscription dla orderu, albo BC6 posting rule trafia na brak `PostingRule` dla typu płatności, albo BC5 insurer snapshot fetch fails po N retry'ach.
- Flag handler w BC3 wrapuje `service.recordFlag(...)` w try/catch:
  - `allocationProgressService.markFailed(orderId, stepName, err.message, context)` — ustawia `AllocationProgress.failed = true`, zapisuje krok/reason/context.
  - Emit `OrderAllocationFailedEvent` (albo `OrderFulfillmentFailedEvent` dla fulfillmentu).
  - `adminAlertPort.alertAllocationFailed(orderId, step, reason, context)` → wysyła email do admina (template `ADMIN_GENERIC_ALERT` z tematem `Order allocation failed: {step}`).
- Order pozostaje w `PENDING_ALLOCATION` / `PROCESSING`. `AllocationProgress.setFlag` zwraca null na subsequent eventy (filter `{failed: false}`) — kolejne flag handlery są no-op dopóki admin nie zresetuje ręcznie.
- Admin w panelu widzi failed orders + step + reason → decyduje: retry ręczny, cancel order, manual fulfillment, refund.

**Soft/transient error** (network blip, MongoDB reconnect): handler loguje WARN + swallow. Kolejne `PaymentRecordedEvent` (Stripe retry) nadpisze stan przez idempotency guards.

### 7.9 Order utknął w `PENDING_ALLOCATION` (brak admin alert)

- Może się zdarzyć gdy upstream event nigdy nie doszedł (np. BC6 posting rule nie matchowała → brak `VatInvoiceIssuedEvent`, ale też brak throw).
- `AllocationProgress` siedzi z `completedAt: null` bez `failed: true`.
- **Monitoring (TODO — future epic):** cron scanuje `allocation_progress` gdzie `startedAt < now - 15min` AND `completedAt === null` AND `failed === false` → admin alert "Stuck allocation".
- Obecnie: manual obserwacja przez admin dashboard + logi.

### 7.10 Wyścig concurrent `POST /stripe-checkout-session`

- Klient kliknął "Zapłać" dwa razy szybko (lub użył dwóch zakładek)
- Pierwszy request tworzy Payment + Stripe session
- Drugi request prawie równolegle: już widzi nowo utworzony Payment jako PENDING (bo race) albo dostaje `DuplicateIdempotencyKeyError` przy `repository.save()`
- Handler w catch: `findActiveByOrderId` → zwraca winner's data (ten sam session URL)
- Oba requesty dostają ten sam URL — klient pójdzie gdziekolwiek klikie, ten sam Stripe session

### 7.11 Klient porzuca Stripe setup po Flow C confirm (promo card capture abandonment)

**Scenariusz:** klient wszedł w Flow C (totalPrice=0, `confirmAsPaid` ✅), Sub jest `ACTIVE` z `_postPromoBillingChannel: STRIPE`, `_promoEndsAt = now + 3 miesiące`. FE zrobiło redirect na Stripe hosted page w `mode='setup'` żeby capture'ować kartę na future renewal — ale klient zamknął tab / kliknął "Anuluj" w Stripe / zerwało mu połączenie. **`SetupIntent` nigdy nie ukończony**, webhook `setup_intent.succeeded` nigdy nie dotarł, `WhenSetupIntentCompletedHandler` nigdy nie odpalił.

**Skutek na koniec sesji 2026-04-29:**

- Sub pozostaje `ACTIVE`, ale **`_stripeCustomerId === null`** i **`_stripePaymentMethodId === null`**.
- Order stricte: nadal przechodzi przez allocation → fulfillment kaskadę. Brak Stripe IDs nie blokuje `OrderFulfilledEvent` — ich rola dotyczy tylko **renewal** po wygaśnięciu promo.
- Klient ma dostęp do portalu (po dorobieniu Bug 8 — patrz § 7.8 oraz `PROMO-ONBOARDING-FIX`).

**Kiedy zaboli:** po `_promoEndsAt` (np. po 3 miesiącach dla `TIMEBOUND_DEMO`) scheduler `PromotionalCycleAdvanceJob` (deferred) próbuje odpalić renewal:

- Jeśli `_postPromoBillingChannel === STRIPE` i brak `_stripePaymentMethodId` → off-session charge **nie do uruchomienia** → Sub przejdzie do `GRACE_PERIOD`. Standardowy retry flow CC-376 (patrz § 10.5.8) wymaga karty w portalu — klient musi sam dodać metodę płatności.
- Jeśli `_postPromoBillingChannel === BANK_TRANSFER` → ProForma poleci na email (brak Stripe IDs nie boli).

**Mitigation (deferred — `PROMO-CYCLE-SCHEDULER`):**

1. Pre-expiry notification (deferred ticket `PROMO-EXPIRY-NOTIFICATION`) — 7 dni przed `_promoEndsAt` email do klienta z linkiem do portalu "dodaj kartę żeby kontynuować subskrypcję".
2. Post-expiry: Sub idzie do `GRACE_PERIOD` standardowo. CC-376 retry endpoint (patrz § 10.5.8) zadziała gdy klient doda kartę.

**Stan implementacji (2026-04-29):** scheduler nie istnieje — promotional Subs po wygaśnięciu promo wiszą w `ACTIVE` na zawsze. Manualnie: admin w panelu może oznaczyć Sub jako CANCELLED. Akceptowalne dla demo, blokujące dla production-grade promo.

---

## 8. Krótka wersja do wytłumaczenia komuś

Dla non-tech rozmówcy:

> **"Jak działa u nas zakup subskrypcji?"**
>
> Klient wypełnia krótki wizard na stronie: wybiera plan, wpisuje NIP (my sami uzupełniamy dane firmy z CEIDG), dane osobowe, odpowiada na 4 pytania o bezpieczeństwo (potrzebne dla ubezpieczenia), wybiera płatność — **karta albo przelew**.
>
> **Jeśli karta** — przeniesiemy go na hostowaną stronę Stripe, gdzie płaci kartą / BLIKiem / Google Pay / Apple Pay. Po zapłacie Stripe nam mówi (webhook), że płatność poszła. Dalszy ciąg orkiestruje moduł **Sales Order (BC3)**: emituje pojedyncze zdarzenie "order paid", które w równoległy sposób uruchamia:
>
> - aktywację subskrypcji (moduł BC4),
> - wystawienie faktury VAT (BC6) i zgłoszenie do KSEF (BC8 — to osobny kanał compliance ze skarbówką, nie wpływa na dostawę do klienta),
> - wystawienie polisy ubezpieczeniowej (BC5 — jeśli plan ma ubezpieczenie),
> - utworzenie konta klienta i wysyłkę emaila z fakturą + magic linkiem do portalu (Customer Onboarding).
>
> BC3 sam siebie "śledzi" przez dwa read-modele. Faza 1 (**alokacja**): czeka aż powstaną 4 byty wewnętrzne — subskrypcja aktywna, faktura VAT, snapshot standardów, polisa utworzona. Faza 2 (**dostawa**): czeka aż emaile wyjdą (fakturę PDF + magic link) i polisa będzie aktywna. Gdy oba domknięte — order jest w stanie **FULFILLED** i klient może korzystać z portalu. Cały proces trwa zazwyczaj poniżej 2 sekund.
>
> KSEF akceptacja faktury biegnie w tle (asynchronicznie, minuty) i **nie wpływa** na moment gdy klient dostaje dostęp — to compliance z państwem, nie dostawa do klienta.
>
> Gdy subskrypcja klienta się odnowi / wygaśnie / upgrade'uje / zostanie anulowana — BC4 emituje odpowiedni event, BC3 zamyka stary order (**CLOSED** z konkretnym powodem).
>
> **Jeśli przelew** — klient dostaje mailem pro formę do opłacenia, ma 14 dni na wpłatę. Gdy pieniądze wpadną na nasze konto, admin w panelu klika "Oznacz jako opłacone" — i od tego momentu ścieżka jest identyczna jak dla karty (BC3 emituje to samo "order paid" zdarzenie).
>
> **Cały proces jest odporny na:**
>
> - zdublowane webhooki od Stripe (cache dedup)
> - podwójne kliknięcie "Zapłać" (idempotency na 3 poziomach)
> - 24h TTL sesji Stripe (automatyczne regeneration gdy klient wraca po dniach)
> - niezgodne kwoty (Stripe vs nasze DB) — blokujemy z alertem manualnej reconciliacji
> - padający email (retry 5x, potem admin widzi failed onboarding w panelu)
> - twarde błędy alokacji/fulfillmentu (BC3 `markFailed` + email do admina, order zatrzymuje się i czeka na manual resolution zamiast iść dalej z niepełnym stanem)

---

## 9. Linki i dokumenty powiązane

- **Strategic DDD (BC3 canvas z INV-3.13–3.16):** `docs/strategic-ddd/target-system/canvases/03-bc3-sales-order.md`
- **Strategic DDD (BC7 canvas):** `docs/strategic-ddd/target-system/canvases/07-bc7-payment-processing.md`
- **Spec migracji Stripe Checkout:** `docs/superpowers/specs/2026-04-20-stripe-checkout-migration-design.md`
- **Spec paid-cascade refactor (CC-353):** `docs/superpowers/specs/2026-04-20-paid-cascade-refactor-design.md`
- **Plan paid-cascade refactor (CC-353):** `docs/superpowers/plans/2026-04-20-paid-cascade-refactor.md`
- **Szczegółowy purchase flow (architektura + diagramy):** `docs/purchase-flow.md`
- **Proces zakupowy (detaliczna dokumentacja endpointów):** `docs/strategic-ddd/proces-zakupowy.md`
- **Stripe Dashboard setup:** `docs/superpowers/stripe-dashboard-checkout-migration.md`
- **DB migration script (Stripe rename):** `scripts/migrate-rename-stripe-card-to-stripe-checkout.ts`

---

## 10. Referencja endpointów (API Reference)

> **Stan na:** 2026-04-24 (sesja S3 / Grupa C / PHASE 2 CC-376 — post-implementation snapshot).
>
> Każdy endpoint zawiera: HTTP method, URL, guardy, request DTO (pola + typy + walidacje), response DTO (pola + typy + nullable), kody błędów, side effects.
>
> **Scope:** proces zakupowy (checkout) + zarządzanie subskrypcją post-purchase. NIE zawiera: auth, admin users, threat monitoring, consultations, security assessment, company-insurance/surveys/standards (osobne doc flows).
>
> **Konwencje:**
>
> - Wszystkie URL-e mają globalny prefix `/api` (dodawany przez `app.setGlobalPrefix('api')`).
> - Kwoty pieniężne są w **grosze / minor units** (integer). Dla PLN: 1 PLN = 100 groszy.
> - Wszystkie daty to ISO 8601 UTC (`2026-04-15T10:30:00.000Z`).
> - `Auth(AuthType.None)` → endpoint publiczny (anonimowy).
> - `Auth(AuthType.Bearer)` → wymaga JWT access token (cookie lub `Authorization: Bearer <token>`). Rola czytana z tokena.
> - `Auth(AuthType.AdminBearer)` → wymaga osobnego admin JWT (inny secret/issuer niż user Bearer).
> - `@Roles(Role.ADMIN)` na user Bearer → legacy value to `'admin'` = Manager firmy (CC-382: manager-only financial read).
> - `@AdminRoles(AdminRole.SUPER_ADMIN)` → super-admin CyberCover (value `'super_admin'`).
> - `@UseFilters(...)` mapuje domain errors na HTTP status codes — patrz sekcja 10.0.3.

### 10.0 Wspólne typy

#### 10.0.1 `PaginationQueryDto` (`libs/common/src/dtos/pagination-query.dto.ts`)

| Pole    | Typ    | Required | Constraints                    | Opis                        |
| ------- | ------ | -------- | ------------------------------ | --------------------------- |
| `page`  | number | optional | `@IsInt() @Min(1)`, default 1  | Numer strony (1-based)      |
| `limit` | number | optional | `@IsInt() @Min(1)`, default 10 | Liczba elementów na stronie |

#### 10.0.2 `PaginatedResponseDto<T>` (`libs/common/src/dtos/paginated-response.dto.ts`)

| Pole         | Typ    | Nullable | Opis                                    |
| ------------ | ------ | -------- | --------------------------------------- |
| `data`       | `T[]`  | no       | Tablica elementów bieżącej strony       |
| `total`      | number | no       | Całkowita liczba elementów dopasowanych |
| `page`       | number | no       | Bieżąca strona                          |
| `limit`      | number | no       | Liczba elementów na stronie             |
| `totalPages` | number | no       | `Math.ceil(total / limit)`              |

> **Uwaga rozbieżności:** Billing (10.3) używa innego kształtu paginacji: `{ items, total, page, pageSize }` (bez `totalPages`). Nie miksuj — każdy obszar ma własny format.

#### 10.0.3 `ExceptionDto` (generic error shape from domain filter)

| Pole         | Typ                | Nullable | Opis                                                                                                       |
| ------------ | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `statusCode` | number             | no       | HTTP status code                                                                                           |
| `message`    | string \| string[] | no       | Opis błędu (string[] dla validation errors z class-validator)                                              |
| `error`      | string             | no       | Nazwa klasy wyjątku (np. `"OrderNotConfirmedError"`) lub generic name (`"Bad Request"`)                    |
| `code`       | string             | optional | BC3-specific kod domenowy (np. `INVALID_NIP`, `INVALID_ORDER_STATE`). Obecne dla Sales Order domain errors |
| `metadata`   | object             | optional | BC3-specific dodatkowy kontekst błędu                                                                      |

**Mapowanie `SalesOrderDomainExceptionFilter` (BC3):**

| `code`                                                                                                                            | HTTP status | Znaczenie                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `INVALID_NIP`, `INVALID_POSTAL_CODE`, `INVALID_COMPANY_DATA`, `INVALID_CONSENT`, `INCOMPLETE_CHECKOUT`, `INVALID_ROLE_ASSIGNMENT` | 400         | Walidacja domenowa                                                            |
| `ORDER_NOT_FOUND`                                                                                                                 | 404         | Order nie istnieje                                                            |
| `INVALID_CONFIRMATION_ACCESS`                                                                                                     | 404         | Niewłaściwy `confirmationToken` (info-hiding — generyczny 404 bez payload)    |
| `INVALID_ORDER_STATE`                                                                                                             | 409         | Order nie jest w wymaganym statusie (np. próba confirm na PENDING_ALLOCATION) |
| `EMAIL_NOT_AVAILABLE`                                                                                                             | 409         | Email już zarejestrowany (walidacja H4 policy)                                |
| `DISCOUNT_SOURCE_CONFLICT`                                                                                                        | 409         | INV H3 — code + partner mutually exclusive                                    |
| `DISCOUNT_CODE_NOT_FOUND`                                                                                                         | 400         | Kod rabatowy nie istnieje                                                     |
| `COMPANY_LOOKUP_UNAVAILABLE`                                                                                                      | 503         | CEIDG + KRS oba padły                                                         |
| inne                                                                                                                              | 500         | Rzucane do globalnego filtra (loguje jako error)                              |

**Mapowanie `PaymentProcessingExceptionFilter` (BC7):**

| Exception class                                                                                                           | HTTP status | Znaczenie                           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------- |
| `PaymentNotFoundError`                                                                                                    | 404         | Payment nie istnieje w BC7          |
| `MissingBankRefError`, `InvalidBankRefError`                                                                              | 400         | Walidacja bankRef w admin mark-paid |
| `OrderNotConfirmedError`, `WrongPaymentMethodError`, `PaymentAlreadyCompletedError`, `InvalidPaymentStateTransitionError` | 409         | Niezgodny stan domain aggregate     |

**Mapowanie `BillingExceptionFilter` (BC6):**

| Exception class                   | HTTP status | Znaczenie                                           |
| --------------------------------- | ----------- | --------------------------------------------------- |
| `InvoiceNotFoundError`            | 404         | Faktura nie istnieje / nie należy do tego customera |
| `InvalidInvoiceNumberFormatError` | 400         | Invoice number nie spełnia regex (np. w URL path)   |
| `InvoiceProjectionMissingError`   | 500         | Read-model nie został zbudowany (ops issue)         |
| `PdfRenderError`                  | 500         | Puppeteer padł przy generowaniu PDF                 |
| inne `BillingDomainError`         | 500         | Catch-all                                           |

#### 10.0.4 Wspólne enums

- **`OrderStatus`** (`@app/sales-order`): `'DRAFT' | 'CONFIRMED' | 'PENDING_ALLOCATION' | 'PROCESSING' | 'FULFILLED' | 'CLOSED' | 'CANCELLED'`
- **`PaymentMethod`** (`@app/sales-order`): `'STRIPE_CHECKOUT' | 'BANK_TRANSFER'`
- **`BillingCycle`** (`@app/shared-kernel`): `'MONTHLY' | 'ANNUAL'`
- **`CheckoutStep`** (`@app/sales-order`): `'COMPANY_DATA' | 'PERSONAL_DATA' | 'OPERATIONAL_STANDARDS' | 'PAYMENT_METHOD'`
- **`PaymentStatus`** (BC `company-payments-core`, **nie mylić** z BC7 `Payment.status`): `'TO_BE_PAID' | 'PAID'`
- **`SubscriptionStatus`** (`@app/subscription-lifecycle`): `'DRAFT' | 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'CANCELLED'`
- **`DiscountType`** (BC `discounts-core`): `'PARTNER' | 'CODE'`
- **`Role`** (portal users): `'admin'` (Manager) | `'employee'`
- **`AdminRole`** (CyberCover staff): `'super_admin' | 'billing_admin' | 'support'`
- **`ChargeSavedPaymentMethodResult.kind`** discriminated union: `'SUCCESS' | 'AUTHENTICATION_REQUIRED' | 'DECLINED'` (BC7 result from off-session PaymentIntent)

---

### 10.1 Sales Order (BC3) — `/api/orders`

**Controller prefix:** `/api/orders`
**Filter:** `@UseFilters(SalesOrderDomainExceptionFilter)` (patrz 10.0.3)
**Default auth:** Każdy endpoint ma `@Auth(AuthType.None)` — anonimowy. Orders są identyfikowane po `orderId` (UUID) + `confirmationToken` dla sensitive actions.

---

#### 10.1.1. `POST /api/orders/start` — Start new Order (checkout step 0)

**Opis:** Tworzy DRAFT Order dla wybranego catalog entry + billing cycle. Zwraca `orderId` używany we wszystkich kolejnych krokach wizarda. Wywoływany z `/cennik` po kliknięciu CTA planu. Emituje `OrderDraftedEvent`, `OrderLineAddedEvent`, opcjonalnie `PartnerDiscountAttachedEvent`. Krok 0 flow (sekcja 3.1).

**Guard:** `Auth(AuthType.None)` — anonimowy.

**Request body (DTO `StartOrderDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `catalogEntryId` | string | required | `@IsString() @IsNotEmpty()` | Plan ID z BC2 catalog (np. `ce_01HX...`) |
| `billingCycle` | `BillingCycle` enum | required | `@IsEnum(BillingCycle)` — `MONTHLY` \| `ANNUAL` | Cykl rozliczeniowy |
| `partnerCode` | string | optional | `@IsOptional() @IsString()` | Partner code z URL query (np. `valvetech`) |

**Response 201 (DTO `StartOrderResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Nowo utworzone Order ID (np. `ord_01HX...`) |

**Response error codes:**

- `400 Bad Request` — invalid catalogEntryId / billingCycle
- `404 Not Found` — catalog entry nie istnieje

**Side effects / events:**

- `OrderDraftedEvent` + `OrderLineAddedEvent` w BC3 → audit log
- Opcjonalnie `PartnerDiscountAttachedEvent` jeśli `partnerCode` dopasowany

**Called from:** Krok 0 — start checkout flow (obu ścieżek).

**Note (2026-05-06):** Dla planów bez `InsuranceCoverage` (Standard, §2.6) handler tworzy Order z `insurerId: null` i autocomplete'm `hasOperationalStandards: true` w `CheckoutProgress`. FE nie widzi `insurerId` w response — tylko bumps poprzez `checkout-state.nextRequiredStep`, który dla Standardu pokaże `COMPANY_DATA → PERSONAL_DATA → PAYMENT_METHOD` (bez `OPERATIONAL_STANDARDS`).

**Linki do kodu:**

- Kontroler: `apps/cybercover-api-gateway/src/sales-order/controllers/sales-order.controller.ts:75`
- Request DTO: `apps/cybercover-api-gateway/src/sales-order/dto/start-order.dto.ts`
- Handler: `libs/sales-order/src/application/commands/start-order/`

---

#### 10.1.2. `GET /api/orders/company-lookup?nip=XXX` — CEIDG/KRS lookup

**Opis:** Zwraca dane firmy po NIP-ie z polskich rejestrów (CEIDG → KRS fallback). Używane w Kroku 1 do auto-fill formularza. Pomocnicze, nie mutuje Order.

**Guard:** `Auth(AuthType.None)` — anonimowy.

**Query params:**

- `nip` (string, required) — Polski NIP 10 cyfr, myślniki/spacje akceptowane i normalizowane

**Response 200 (DTO `CompanyLookupResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `found` | boolean | no | `true` gdy NIP znaleziony w CEIDG lub KRS |
| `company` | `CompanyLookupDataDto` | optional | Dane firmy (obecne gdy `found === true`) |
| `nip` | string | optional | Echo NIP gdy `found === false` |

**Nested DTO `CompanyLookupDataDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `nip` | string | no | Znormalizowany NIP (10 cyfr) |
| `name` | string | no | Pełna nazwa firmy |
| `street` | string | no | Ulica + numer |
| `city` | string | no | Miasto |
| `postalCode` | string | no | Format `XX-XXX` |
| `industry` | string \| null | yes | CEIDG/KRS nie dostarcza — zawsze `null` dziś |
| `source` | `'CEIDG' \| 'KRS'` | no | Który rejestr trafił |

**Response error codes:**

- `400 Bad Request` — invalid NIP format lub checksum
- `503 Service Unavailable` — oba rejestry CEIDG + KRS niedostępne (domain code: `COMPANY_LOOKUP_UNAVAILABLE`)

**Called from:** Krok 1 (Dane firmy) — auto-fill po wpisaniu NIP.

**Linki do kodu:**

- Kontroler: `apps/.../sales-order.controller.ts:90`
- Query DTO: `apps/.../dto/company-lookup.dto.ts`
- Response DTO: `apps/.../dto/company-lookup-response.dto.ts`

---

#### 10.1.3. `GET /api/orders/consent-definitions` — List consent definitions

**Opis:** Zwraca listę aktualnych definicji zgód (regulamin, RODO, marketing etc.) do renderowania w Kroku 2 formularza. Niemutujące, globalne (nie per-order). Każda zgoda ma aktualny `version` który klient musi zwrócić przy submicie (walidacja w `SubmitPersonalDataHandler`).

**Guard:** `Auth(AuthType.None)` — anonimowy.

**Response 200 (DTO `GetConsentDefinitionsResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `consentDefinitions` | `ConsentDefinitionDto[]` | no | Lista aktywnych zgód |

**Nested DTO `ConsentDefinitionDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `id` | string | no | Consent definition ID (MongoId) |
| `code` | string | no | Maszynowy kod (np. `TERMS_OF_SERVICE`) |
| `name` | string | no | Wyświetlana nazwa |
| `description` | string | no | Pełna treść (może zawierać markdown/HTML) |
| `type` | `'USER' \| 'COMPANY'` | no | Podmiot zgody |
| `isRequired` | boolean | no | Jeśli `true` — klient musi zaakceptować żeby przejść |
| `version` | number | no | Aktualna wersja; submit musi zwrócić tę samą |
| `expandedDetails` | `ExpandedDetailsDto \| null` | yes | Opcjonalne szczegółowe punkty (tytuł + bullet points) |

**Nested DTO `ExpandedDetailsDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `title` | string | Tytuł sekcji rozwijanej |
| `items` | `string[]` | Bullet points |

**Called from:** Krok 2 — ekran "Dane osobowe + zgody".

**Linki do kodu:**

- Kontroler: `apps/.../sales-order.controller.ts:97`
- Response DTO: `apps/.../dto/consent-definitions-response.dto.ts`
- Service: `apps/cybercover-api-gateway/src/consents/consents-core/services/consent-definitions.service.ts`

---

#### 10.1.4. `POST /api/orders/recover` — Recover abandoned order (STUB)

> **Stan na 2026-04-24:** endpoint rzuca `NotImplementedException` (`501`). Real impl planowane w **US-PURCHASE-11**. FE może zacząć implementować kontrakt — DTO jest stabilne.

**Opis:** Dla klientów którzy porzucili checkout i wracają linkiem z emaila "Dokończ zakup". Przyjmuje token z linka, odtwarza `orderId` + stan DRAFT. Obecnie stub.

**Guard:** `Auth(AuthType.None)` — anonimowy.

**Request body (DTO `RecoverOrderDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `token` | string | required | `@IsString() @IsNotEmpty()` | Recover token z linka email |

**Response 200 (DTO `RecoverOrderResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Odzyskane Order ID |
| `checkoutState` | `CheckoutStateResponseDto` | no | Aktualny stan checkoutu (patrz 10.1.6) |

**Response error codes:**

- `400 Bad Request` — invalid/expired token
- `404 Not Found` — order cancelled lub nie istnieje
- `501 Not Implemented` — **obecnie zawsze**

---

#### 10.1.5. `PATCH /api/orders/:orderId/company-data` — Submit company data (Krok 1)

**Opis:** Zapisuje dane firmy w Order draft. Emituje `CompanyDataCapturedEvent`. Można wywołać wielokrotnie (persystuje progress; kolejny PATCH nadpisuje).

**Guard:** `Auth(AuthType.None)` — anonimowy (Order identified by path param).

**Path params:**

- `orderId` (string) — Order ID z Kroku 0

**Request body (DTO `SubmitCompanyDataDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `nip` | string | required | `@IsString() @IsNotEmpty()` | NIP firmy (10 cyfr) |
| `name` | string | required | `@IsString() @IsNotEmpty()` | Pełna nazwa |
| `street` | string | required | `@IsString() @IsNotEmpty()` | Ulica + numer |
| `city` | string | required | `@IsString() @IsNotEmpty()` | Miasto |
| `postalCode` | string | required | `@Matches(/^\d{2}-\d{3}$/)` | Format `XX-XXX` |
| `industry` | string | required | `@IsString() @IsNotEmpty()` | Branża (ręczny wybór, CEIDG nie dostarcza) |

**Response 200 (DTO `CheckoutStateResponseDto`):** patrz 10.1.6.

**Response error codes:**

- `400 Bad Request` — validation errors (INVALID_NIP, INVALID_POSTAL_CODE, INVALID_COMPANY_DATA)
- `404 Not Found` — order nie istnieje (ORDER_NOT_FOUND)
- `409 Conflict` — order nie w DRAFT (INVALID_ORDER_STATE)

**Side effects / events:**

- `CompanyDataCapturedEvent` w BC3 → audit log

**Called from:** Krok 1 flow.

**Linki do kodu:** `sales-order.controller.ts:126`, `apps/.../dto/submit-company-data.dto.ts`

---

#### 10.1.6. `GET /api/orders/:orderId/checkout-state` — Get checkout progress

**Opis:** Zwraca aktualny stan progresu checkoutu. Wywoływane po nawigacji FE lub odświeżeniu (żeby wiedzieć gdzie klient jest w wizarze). Jest też to zwracane z każdego PATCH-a krokowego — FE często nie musi wywoływać osobno.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Response 200 (DTO `CheckoutStateResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Order ID (echo) |
| `progress` | `CheckoutProgressDto` | no | Flagi kompletności kroków |
| `isComplete` | boolean | no | `true` gdy wszystkie 4 flagi `true` |
| `nextRequiredStep` | `CheckoutStep \| null` | yes | Następny wymagany krok; `null` gdy complete |

**Nested DTO `CheckoutProgressDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `hasCompanyData` | boolean | Krok 1 wypełniony |
| `hasPersonalData` | boolean | Krok 2 wypełniony |
| `hasOperationalStandards` | boolean | Krok 3 wypełniony. **Plany bez ubezpieczenia (Standard, §2.6): zawsze `true` od `POST /orders/start`** — brak insurera ⇒ brak schematu OS ⇒ krok auto-skipped. `nextRequiredStep` przeskakuje z `PERSONAL_DATA` na `PAYMENT_METHOD`. |
| `hasPaymentMethod` | boolean | Krok 4 wypełniony |

**Response error codes:**

- `404 Not Found` — order nie istnieje

**Called from:** Route transitions, refresh. Również zwrot z 10.1.5, 10.1.7, 10.1.11.

**Linki do kodu:** `sales-order.controller.ts:145`, `apps/.../dto/checkout-state-response.dto.ts`

---

#### 10.1.7. `PATCH /api/orders/:orderId/personal-data` — Submit personal data + consents (Krok 2)

**Opis:** Zapisuje dane osobowe ordernera + akceptację zgód. Walidacja: `consentVersion` musi się zgadzać z aktualną wersją z `GET /consent-definitions`; wszystkie `isRequired` muszą być accepted=true. IP osoby akceptującej capturowane z requestu (`@Ip()`) + `acceptedAt: Date.now()`.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Request body (DTO `SubmitPersonalDataDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `firstName` | string | required | `@IsString() @IsNotEmpty()` | Imię |
| `lastName` | string | required | `@IsString() @IsNotEmpty()` | Nazwisko |
| `email` | string | required | `@IsEmail()` | Email (używany do onboarding/logowania) |
| `phone` | string | required | `@IsPhoneNumber()` | E.164 (np. `+48600123456`) |
| `consents` | `ConsentInputDto[]` | required | `@ArrayMinSize(1) @ValidateNested()` | Lista akceptacji zgód |

**Nested DTO `ConsentInputDto`:**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `consentDefinitionId` | string | required | `@IsString() @IsNotEmpty()` | ID zgody z 10.1.3 |
| `accepted` | boolean | required | `@IsBoolean()` | Czy zaakceptował |
| `consentVersion` | number | required | `@IsNumber()` | Musi == `version` aktualnej definicji |

**Response 200 (DTO `CheckoutStateResponseDto`):** patrz 10.1.6.

**Response error codes:**

- `400 Bad Request` — validation errors, INVALID_CONSENT (wrong version, missing required)
- `404 Not Found` — order nie istnieje
- `409 Conflict` — order nie w DRAFT, EMAIL_NOT_AVAILABLE (duplicate per H4)

**Side effects / events:**

- `PersonalDataCapturedEvent` + `ConsentsCapturedEvent` → audit, compliance

**Called from:** Krok 2 flow.

**Linki do kodu:** `sales-order.controller.ts:156`, `apps/.../dto/submit-personal-data.dto.ts`, `apps/.../dto/consent-input.dto.ts`

---

#### 10.1.8. `GET /api/orders/:orderId/operational-standards-schema` — Get operational standards schema

**Opis:** Zwraca listę pytań bezpieczeństwa per insurer (aktualnie tylko Colonnade, INV-3.12). Użyte w Kroku 3 do renderowania formularza standardów. **Plany bez ubezpieczenia (Standard, §2.6) zwracają `skipped: true` z pustymi listami** — FE pomija ekran.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Response 200 (DTO `OperationalStandardsSchemaResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Echo |
| `insurerName` | string | no | Nazwa ubezpieczyciela (np. `"Colonnade"`); `''` (pusty string) gdy `skipped === true` |
| `questions` | `StandardQuestionDto[]` | no | Lista pytań; `[]` gdy `skipped === true` |
| `answerOptions` | `string[]` | no | Wspólne opcje odpowiedzi (np. `['YES', 'NO', 'DONT_KNOW']`); `[]` gdy `skipped === true` |
| `skipped` | boolean | no | **NEW (2026-05-06).** `true` dla orderów na planach bez ubezpieczenia (`Order.insurerId === null`) — FE musi pominąć ekran OS i przejść do kroku 4. `false` dla wszystkich pozostałych orderów (Optimum/Profesjonalny/Expert). |

**Nested DTO `StandardQuestionDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `key` | string | no | Maszynowy klucz (np. `HAS_FIREWALL`) |
| `label` | string | no | Tekst pytania |
| `description` | string | optional | Rozszerzony opis / tooltip |

**Response error codes:**

- `404 Not Found` — order nie istnieje
- `409 Conflict` — order nie w DRAFT

**Przykładowe payloads:**

Insurer-bound order (Optimum, Profesjonalny, Expert):

```json
{
  "orderId": "ord_01HX...",
  "insurerName": "Colonnade",
  "questions": [
    { "key": "HAS_OFFSITE_BACKUP", "label": "Posiadamy kopie zapasowe..." },
    { "key": "OS_AND_SOFTWARE_UPDATED", "label": "Regularnie aktualizujemy..." }
  ],
  "answerOptions": ["YES", "NO", "DONT_KNOW"],
  "skipped": false
}
```

No-insurance order (Standard):

```json
{
  "orderId": "ord_01HX...",
  "insurerName": "",
  "questions": [],
  "answerOptions": [],
  "skipped": true
}
```

**Called from:** Krok 3 — wejście na ekran standardów. FE może zawołać prewencyjnie i sprawdzić `skipped` przed renderowaniem layoutu, albo (rekomendowane) sterować flow przez `nextRequiredStep` z `GET /checkout-state` — wtedy ten endpoint w ogóle nie zostanie zawołany dla Standardu.

**Linki do kodu:** `sales-order.controller.ts:186`, `apps/.../dto/operational-standards-schema-response.dto.ts`

---

#### 10.1.9. `PATCH /api/orders/:orderId/operational-standards` — Submit operational standards answers (Krok 3)

**Opis:** Zapisuje odpowiedzi na standardy + ewaluuje eligibility. Emituje `OperationalStandardsCapturedEvent` + `EligibilityResultEvaluatedEvent`. Wynik zawiera `eligible: boolean` + missingRequirements — FE pokazuje warning ale nie blokuje (patrz 7.6 edge case).

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Request body (DTO `SubmitOperationalStandardsDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `answers` | `Record<string, string>` | required | `@IsObject()` | Mapa `questionKey → answerValue` (np. `{ HAS_FIREWALL: 'YES', HAS_BACKUP: 'NO' }`) |

**Response 200 (DTO `SubmitOperationalStandardsResponseDto`, extends `EligibilityResultResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Echo |
| `eligible` | boolean | no | Czy klient spełnia kryteria insurera |
| `missingRequirements` | `string[]` | no | Klucze pytań z odpowiedzią nie-meeting |
| `contributions` | `EligibilityContributionDto[]` | no | Per-pytanie rozpis |
| `checkoutProgress` | `CheckoutProgressDto` | no | Aktualny progress (patrz 10.1.6) |

**Nested DTO `EligibilityContributionDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `key` | string | Klucz pytania |
| `met` | boolean | Czy odpowiedź spełnia requirement |
| `label` | string | Human-readable label |

**Response error codes:**

- `400 Bad Request` — validation errors
- `404 Not Found` — order nie istnieje
- `409 Conflict` — order nie w DRAFT, **lub** order jest no-insurance (krok OS auto-skipped przy starcie — patrz §2.6); kod domain: `INVALID_ORDER_STATE`. FE nie powinien wywoływać tego endpointu gdy `GET /operational-standards-schema` zwróciło `skipped: true`.

**Side effects / events:**

- `OperationalStandardsCapturedEvent` (z `orderId`) → w przyszłości BC5 (Policy.create), BC9 flag handler
- `EligibilityResultEvaluatedEvent` → audit

**Called from:** Krok 3 flow. **Nie wołać dla planów bez ubezpieczenia** (Standard) — gating po stronie FE oparty o `nextRequiredStep` z `checkout-state` lub `skipped: true` z 10.1.8.

**Linki do kodu:** `sales-order.controller.ts:197`, `apps/.../dto/submit-operational-standards.dto.ts`, `apps/.../dto/submit-operational-standards-response.dto.ts`

---

#### 10.1.10. `POST /api/orders/:orderId/evaluate-eligibility` — Preview eligibility without saving

**Opis:** Real-time preview eligibility podczas typowania — FE woła podczas zaznaczania odpowiedzi przed submitem. **Nie mutuje** Order. Akceptuje partial answers.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Request body (DTO `EvaluateEligibilityRequestDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `answers` | `Record<string, string>` | required | `@IsObject()` | Partial answers OK |

**Response 200 (DTO `EligibilityResultResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `eligible` | boolean | Czy odpowiedzi dają eligible (dla partial — na podstawie już wypełnionych) |
| `missingRequirements` | `string[]` | Nie-met requirements |
| `contributions` | `EligibilityContributionDto[]` | Per-key rozpis |

**Response error codes:**

- `404 Not Found` — order nie istnieje
- `409 Conflict` — order nie w DRAFT

**Called from:** Krok 3 — live preview (debounced).

**Linki do kodu:** `sales-order.controller.ts:217`, `apps/.../dto/evaluate-eligibility-request.dto.ts`, `apps/.../dto/eligibility-result-response.dto.ts`

---

#### 10.1.11. `POST /api/orders/:orderId/validate-discount` — Validate discount code

**Opis:** Waliduje kod rabatowy + pokazuje preview ceny z rabatem. **Nie mutuje** Order — rzeczywiste zastosowanie dzieje się w `SelectPaymentMethodCommand` (10.1.12). INV H3: code i partner code są mutually exclusive.

> **Dostępne `DiscountKind`** (z `libs/discounting`, patrz § 2.5.2 dla mechaniki):
>
> - `CODE_FLAT` — pojedynczy applier procentowy lub fixed-price (np. seedowy `SUMMER10` 10% off)
> - `PARTNER_FLAT` — applier + guardian (np. seedowy `VALVETECH` 5% off z `MarginGuardian.minMargin=10`)
> - `PARTNER_COMPOSITE` — primary applier dla `targetPlanId` + fallback applier dla pozostałych planów (np. `COMPOSITE_DEMO` Standard free + 10% off pozostałych)
> - `PARTNER_TIMEBOUND` — applier dla `targetPlanId` przez `durationMonths` cykli, ograniczony do `applicableBillingCycle` (np. `TIMEBOUND_DEMO` Standard free przez 3 miesiące, MONTHLY only)
>
> `PARTNER_TIMEBOUND` i `PARTNER_COMPOSITE` ze 100% off appli era mogą obniżyć cenę do 0 PLN — taki order po confirm idzie w **Flow C** (patrz § 5).

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Request body (DTO `ValidateDiscountDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `discountCode` | string | required | `@IsString() @IsNotEmpty()` | Kod rabatowy (np. `VALVETECH5`) |

**Response 200 (DTO `DiscountValidationResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `valid` | boolean | no | `true` gdy kod aplikowalny |
| `discountType` | string \| null | yes | Np. `'PERCENTAGE'`, `'FIXED'`; `null` gdy invalid |
| `discountValue` | string \| null | yes | Wartość (procent lub grosze); `null` gdy invalid |
| `originalPriceNet` | number \| null | yes | Cena przed rabatem w groszach |
| `discountedPriceNet` | number \| null | yes | Cena po rabacie w groszach |
| `currency` | string \| null | yes | `'PLN'` |
| `message` | string \| null | yes | Error message gdy `valid === false` |

**Response error codes:**

- `404 Not Found` — order nie istnieje

**Called from:** Krok 4 — klient wpisuje kod + klika "Sprawdź".

**Linki do kodu:** `sales-order.controller.ts:230`, `apps/.../dto/validate-discount.dto.ts`, `apps/.../dto/discount-validation-response.dto.ts`

---

#### 10.1.12. `PATCH /api/orders/:orderId/payment-method` — Select payment method (Krok 4)

**Opis:** Zapisuje wybraną metodę płatności + opcjonalnie aplikuje discount code. **Zamraża cenę** (EstimatedPricing → CalculatedPricing). Buduje `OrderParties` (ORDERER/PAYER/RECEIVER/EXECUTOR). Emituje `DiscountAppliedEvent` (opcjonalnie) + `PaymentMethodSelectedEvent`. Po tym kroku Order jest **gotowy do confirm** (wszystkie 4 flagi `true`).

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Request body (DTO `SelectPaymentMethodDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `paymentMethod` | `PaymentMethod` enum | required | `@IsEnum(PaymentMethod)` — `STRIPE_CHECKOUT` \| `BANK_TRANSFER` | Wybrana metoda |
| `discountCode` | string | optional | `@IsOptional() @IsString()` | Kod rabatowy do zaaplikowania |

**Response 200 (DTO `CheckoutStateResponseDto`):** patrz 10.1.6.

**Response error codes:**

- `400 Bad Request` — validation errors, DISCOUNT_CODE_NOT_FOUND
- `404 Not Found` — order nie istnieje
- `409 Conflict` — order nie w DRAFT, DISCOUNT_SOURCE_CONFLICT (code + partner collision)

**Side effects / events:**

- `DiscountAppliedEvent` (jeśli kod zaaplikowany) → audit, BC2 analityka
- `PaymentMethodSelectedEvent` → flaga `hasPaymentMethod = true`

**Called from:** Krok 4 flow.

**Linki do kodu:** `sales-order.controller.ts:243`, `apps/.../dto/select-payment-method.dto.ts`

---

#### 10.1.13. `POST /api/orders/:orderId/confirm` — Confirm order (Krok 5)

**Opis:** Transition `DRAFT → CONFIRMED`. Walidacja: `checkoutProgress.isComplete()` (INV-3.4) + `OrderParties.validate()`. Emituje `OrderConfirmedEvent` — trigger dla BC7 (Payment creation dla BANK_TRANSFER), BC6 (ProForma), Customer Onboarding (pro forma email), BC4 (subscription intent). **Nie tworzy** jeszcze Stripe session dla STRIPE_CHECKOUT (leniwe — patrz 10.2.1).

> **Routing Flow A/B vs Flow C (CC-353):** handler sprawdza `Order.totalPrice().amount === 0 && order.hasPromotionalDiscount()`. Jeśli oba `true` → **Flow C**: woła `order.confirmAsPaid(...)` zamiast `order.confirm(...)`, single-step `DRAFT → PENDING_ALLOCATION` z atomowym `OrderConfirmedEvent + OrderPaidEvent` (patrz § 5.2). Inaczej standardowy `DRAFT → CONFIRMED` (Flow A/B). Response w obu przypadkach jednakowy z perspektywy FE — różni się tylko `status` w body (`'CONFIRMED'` dla A/B, `'PENDING_ALLOCATION'` dla C). Dla Flow C `confirmationToken` zawsze `null` (klient nie wraca na żadną payment-related stronę — od razu polling `GET /api/orders/:id` aż do FULFILLED).

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Response 200 (DTO `ConfirmOrderResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | Echo |
| `status` | `OrderStatus` enum | no | `'CONFIRMED'` |
| `paymentMethod` | `PaymentMethod` enum | no | Echo wybranej metody |
| `confirmationToken` | string \| null | yes | **Tylko dla BANK_TRANSFER** — UUID v4, ważny 14 dni, wymagany do `/confirmation` i `/proforma/download`. `null` dla STRIPE_CHECKOUT (klient używa hosted Stripe URL). |

**Response error codes:**

- `400 Bad Request` — INCOMPLETE_CHECKOUT
- `404 Not Found` — order nie istnieje
- `409 Conflict` — INVALID_ORDER_STATE (order nie w DRAFT)

**Side effects / events:**

- `OrderConfirmedEvent` → fan-out do BC7, BC6, BC4, Customer Onboarding
- Dla BANK_TRANSFER: BC7 tworzy Payment, BC6 generuje ProForma PDF, Customer Onboarding queue'uje email
- Dla STRIPE_CHECKOUT: nic się nie dzieje side-effect-wise (Payment leniwie w 10.2.1)

**Called from:** Krok 5 — klient klika "Zamawiam z obowiązkiem zapłaty".

**Linki do kodu:** `sales-order.controller.ts:265`, `apps/.../dto/confirm-order-response.dto.ts`

---

#### 10.1.14. `GET /api/orders/:orderId` — Get order details

**Opis:** Pełne dane Order (status, progres, dane firmy, dane osobowe, lines, totalPriceNet). Używany na stronie `/checkout/bank-transfer` oraz do polling success (3.7, 5.6).

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Response 200 (DTO `OrderResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `orderId` | string | no | ID |
| `status` | `OrderStatus` enum | no | Patrz 10.0.4 |
| `billingCycle` | `BillingCycle` enum | no | `MONTHLY` \| `ANNUAL` |
| `paymentMethod` | `PaymentMethod \| null` | yes | `null` przed Krokiem 4 |
| `checkoutProgress` | `CheckoutProgressDto` | no | Patrz 10.1.6 |
| `companyData` | `CompanyDataResponseDto \| null` | yes | `null` przed Krokiem 1 |
| `personalData` | `PersonalDataResponseDto \| null` | yes | `null` przed Krokiem 2 |
| `lines` | `OrderLineResponseDto[]` | no | Zawsze >=1 linia (plan) |
| `totalPriceNet` | number \| null | yes | Grosze; `null` przed Krokiem 4 |
| `currency` | string | no | `'PLN'` |
| `createdAt` | string (ISO) | no | Data utworzenia |

**Nested DTO `CompanyDataResponseDto`:** patrz pola 10.1.5 request (plus same as request). Wszystkie pola `readonly` string nie-nullable.

**Nested DTO `PersonalDataResponseDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `firstName`, `lastName`, `email`, `phone` | string | |

**Nested DTO `OrderLineResponseDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `lineId` | string | no | |
| `catalogEntryId` | string | no | |
| `planName` | string | no | Np. `"Optimum"` |
| `priceNet` | number \| null | yes | Grosze; `null` przed calc |

**Response error codes:**

- `404 Not Found` — order nie istnieje

**Called from:** Krok 6 (BANK_TRANSFER), Krok 7 (polling po webhooku).

**Linki do kodu:** `sales-order.controller.ts:281`, `apps/.../dto/order-response.dto.ts`

---

#### 10.1.15. `GET /api/orders/:orderId/confirmation?token=...` — Get BANK_TRANSFER confirmation page data

**Opis:** Zwraca dane potrzebne do wyrenderowania ekranu "Dane do przelewu" (numer konta, tytuł, kwota, email, link do pro forma PDF). Wymaga `confirmationToken` z response 10.1.13. Ważny 14 dni. Nie dotyczy STRIPE_CHECKOUT.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Query params:**

- `token` (string, required) — `confirmationToken` z response Confirm Order

**Response 200 (DTO `OrderConfirmationResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `type` | `'BANK_TRANSFER'` literal | no | Discriminator — obecnie tylko ta wartość |
| `orderId` | string | no | Echo |
| `proforma` | `BankTransferProformaDto` | no | Dane ProForma |
| `payment` | `BankTransferPaymentDto` | no | Dane do przelewu |
| `customerEmail` | string | no | Gdzie wysłano email |

**Nested DTO `BankTransferProformaDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `invoiceNumber` | string | np. `"PF/00001/2026"` |
| `pdfUrl` | string | Pełny URL do pobrania (z tokenem w query) |
| `dueDate` | string (YYYY-MM-DD) | Termin płatności (14 dni) |

**Nested DTO `BankTransferPaymentDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `bankAccount` | string | IBAN CyberCover |
| `transferTitle` | string | = `invoiceNumber` |
| `grossAmountMinorUnits` | number | W groszach |
| `netAmountMinorUnits` | number | W groszach |
| `vatAmountMinorUnits` | number | W groszach |
| `currency` | `'PLN'` literal | |

**Response error codes:**

- `400 Bad Request` — missing token param
- `404 Not Found` — invalid/expired token (info-hiding, INVALID_CONFIRMATION_ACCESS → generic 404)
- `503 Service Unavailable` — downstream BC6 lookup failure

**Called from:** Krok 6 (BANK_TRANSFER) — ekran "Dane do przelewu".

**Linki do kodu:** `sales-order.controller.ts:296`, `apps/.../dto/order-confirmation-response.dto.ts`

---

#### 10.1.16. `GET /api/orders/:orderId/proforma/download?token=...` — Download pro forma PDF

**Opis:** Streamuje pro forma PDF (BANK_TRANSFER). Wymaga `confirmationToken` z 10.1.13. Ten sam token co dla 10.1.15.

**Guard:** `Auth(AuthType.None)`.

**Path params:**

- `orderId` (string)

**Query params:**

- `token` (string, required)

**Response 200:** `StreamableFile` (binary PDF)

- Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<filename>"`, `Cache-Control: private, max-age=3600`

**Response error codes:**

- `400 Bad Request` — missing token
- `404 Not Found` — invalid token / order nie w BANK_TRANSFER flow
- `503 Service Unavailable` — PDF generation failure

**Called from:** Link w emailu pro forma, ekran 10.1.15.

**Linki do kodu:** `sales-order.controller.ts:310`

---

### 10.2 Checkout & Payments (BC7) — `/api/sales-order/*` i `/api/webhooks/stripe` i `/api/admin/orders/*`

**Filter:** `@UseFilters(PaymentProcessingExceptionFilter)` (10.0.3 dla mapowania).

---

#### 10.2.1. `POST /api/sales-order/:orderId/stripe-checkout-session` — Create Stripe Checkout session

> **Uwaga URL:** ten endpoint jest pod prefixem `/sales-order` (kebab-case, singular) — **nie** `/orders` jak sekcja 10.1. Historyczny kontrakt, zachowany dla FE.

**Opis:** Tworzy Stripe Checkout session dla Order w stanie CONFIRMED (Flow A) **lub PENDING_ALLOCATION** (Flow C — promotional 0 PLN) z paymentMethod=STRIPE_CHECKOUT. **Idempotentny** per orderId: gdy PENDING session wciąż ważna (>5min do expiry) → zwraca cached URL. Gdy expired / <5min → **lazy regeneration**. Gdy nic nie istnieje lub FAILED → fresh create. Emituje `PaymentCreatedEvent` (fresh) lub `PaymentCheckoutSessionRegeneratedEvent` (regen).

> **Stripe `mode` autodetect (CC-353):** gdy `Order.totalPrice().amount > 0` → session w `mode='payment'` (klasycznie line_items + payment_intent_data). Gdy `=== 0` (Flow C, promotional) → session w **`mode='setup'`** — Stripe wymaga karty bez pobrania kwoty (capture na future renewal). W setup mode params zawierają top-level `currency: 'pln'` (Stripe API wymaga tego pola dla setup, nie da się wyderiwować z line_items których brak — Bug 6 fix). Po complete'cie user'a Stripe emituje webhook `setup_intent.succeeded` (handled przez BC4 `WhenSetupIntentCompletedHandler`, attach'uje `stripeCustomerId/stripePaymentMethodId` do `ACTIVE` Sub).

**Guard:** `Auth(AuthType.None)` — anonimowy.

**Path params:**

- `orderId` (string)

**Response 201 (DTO `CreateCheckoutSessionResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `sessionId` | string | no | Stripe session ID (zaczyna się `cs_`) |
| `url` | string | no | Hosted Checkout URL — FE robi `window.location.href = url` |
| `paymentId` | string | no | BC7 internal Payment ID (debug/tracking) |

**Response error codes:**

- `404 Not Found` — `PaymentNotFoundError` lub order nie istnieje lub nie w CONFIRMED (`OrderNotConfirmedError` domain error, ale mapowany na 409 przez filtr — **uwaga: Swagger mówi 404, faktycznie 409 dla OrderNotConfirmed**)
- `409 Conflict` — `OrderNotConfirmedError`, `WrongPaymentMethodError` (paymentMethod != STRIPE_CHECKOUT), `PaymentAlreadyCompletedError`, `InvalidPaymentStateTransitionError`

**Side effects / events:**

- `PaymentCreatedEvent` (fresh create) lub `PaymentCheckoutSessionRegeneratedEvent` (lazy regen)
- Call do Stripe API z `Idempotency-Key` header

**Called from:** Krok 6a Flow A — natychmiast po `/confirm` dla STRIPE_CHECKOUT.

**Linki do kodu:** `apps/cybercover-api-gateway/src/payment-processing/controllers/checkout-session.controller.ts:24`, `apps/.../dto/create-checkout-session-response.dto.ts`, `libs/payment-processing/src/application/commands/create-stripe-checkout-session/`

---

#### 10.2.2. `POST /api/webhooks/stripe` — Stripe webhook handler

**Opis:** Handler dla webhooków Stripe. **Nie wywoływany przez FE** — tylko Stripe serwery. Ten switch obsługuje:

- `checkout.session.completed` + `mode: 'payment'` + `payment_status: 'paid'` → `RecordStripePaymentSuccessCommand` (trigger kaskady 6.x)
- `checkout.session.completed` + `mode: 'setup'` + `status: 'complete'` → `RecordSetupIntentCompletedCommand` (save-card flow). Dla **Flow C (promotional 0 PLN)** — BC4 `WhenSetupIntentCompletedHandler` widzi Sub w stanie `ACTIVE` (już aktywowana przez `WhenPromotionalOrderPaidHandler`) i tylko attach'uje `stripeCustomerId` + `stripePaymentMethodId` (idempotent). Dla nie-promo trial flow — `startTrial(...)` na DRAFT Sub. Patrz § 5.5.
- `checkout.session.expired` → `RecordStripeCheckoutSessionExpiredCommand`
- `checkout.session.async_payment_failed` → `RecordStripePaymentFailureCommand`
- Inne event types → log-only

**Guard:** `@UseGuards(StripeSignatureGuard)` — weryfikuje `Stripe-Signature` header HMAC-SHA256 z webhook secret. Wymaga `req.body instanceof Buffer` (raw body parser). Bez podpisu → `401 Unauthorized`.

Ponadto `Auth(AuthType.None)` — bez user JWT.

**Request body:** Raw buffer (nie-parsed). Stripe wysyła `application/json` + signature header.

**Response 200:** `{ received: true }` — Stripe wymaga 2xx żeby nie retry'ować.

**Response error codes:**

- `401 Unauthorized` — missing `Stripe-Signature` header, invalid signature, not a raw Buffer body
- `200` nawet dla unhandled event types (log + skip)

**Side effects / events (per event type):**

- **`checkout.session.completed` (mode=payment)** → `RecordStripePaymentSuccessCommand` → BC7 `WhenPaymentRecordedHandler` (Payment SUCCEEDED) → emit **`PaymentRecordedEvent`** → BC3 markAsPaid → `OrderPaidEvent` → kaskada sekcji 6 (BC4/BC6/BC9/Onboarding)
- **`checkout.session.completed` (mode=setup)** → `RecordSetupIntentCompletedCommand` → BC7 emituje `SetupIntentCompletedEvent` → BC4 `WhenSetupIntentCompletedHandler` attach'uje `stripeCustomerId/stripePaymentMethodId` na subscription (Flow C promo: idempotent attach na ACTIVE Sub; trial flow: `startTrial(...)` na DRAFT Sub)
- **`checkout.session.expired`** → `RecordStripeCheckoutSessionExpiredCommand` → Payment pozostaje PENDING, emit `PaymentCheckoutSessionExpiredEvent` (Customer Onboarding future: reminder email)
- **`checkout.session.async_payment_failed`** → `RecordStripePaymentFailureCommand` z reason `ASYNC_METHOD_FAILED` → Payment FAILED, emit `PaymentFailedEvent`

**Dedup:** `webhookStore.markProcessed(eventId, 24h TTL)` — Redis-backed, ten sam event processed only once.

**Called from:** Stripe webhook service (external). FE nigdy nie woła tego endpointu.

**Linki do kodu:** `apps/.../payment-processing/controllers/stripe-webhook.controller.ts:38`, Guard: `apps/.../payment-processing/guards/stripe-signature.guard.ts`

---

#### 10.2.3. `POST /api/admin/orders/:orderId/mark-paid` — Admin mark bank transfer as paid

**Opis:** Admin (SUPER_ADMIN) ręcznie księguje bank transfer po zobaczeniu wpłaty na wyciągu. Transition `Payment.PENDING → SUCCEEDED` (INV-7.4: tylko BANK_TRANSFER). Emituje **ten sam `PaymentRecordedEvent`** co Stripe webhook → ta sama kaskada sekcji 6.

**Guard:**

- `Auth(AuthType.AdminBearer)` — admin JWT (cookie `adminAccessToken` lub `Authorization: Bearer`)
- `@AdminRoles(AdminRole.SUPER_ADMIN)` — rola `'super_admin'`
- `@ApiBearerAuth()` — Swagger annotation

**Path params:**

- `orderId` (string) — BC3 Order ID

**Request body (DTO `AdminMarkPaidRequestDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `bankRef` | string | required | `@IsString() @IsNotEmpty()` | Numer referencyjny przelewu (np. `BNK-2024-001`). Zapisywany w `Payment.externalRef` |
| `paidAt` | string | required | `@IsISO8601()` | Data zaksięgowania (ISO 8601) |

**Response 201 (DTO `AdminMarkPaidResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `paymentId` | string | no | BC7 Payment ID |
| `status` | `'SUCCEEDED'` literal | no | Zawsze SUCCEEDED (pośrednio potwierdza udane przejście) |
| `paidAt` | string (ISO) | no | Echo |

**Response error codes:**

- `400 Bad Request` — `MissingBankRefError`, `InvalidBankRefError`, nieprawidłowy ISO 8601
- `401 Unauthorized` — missing/invalid admin bearer token
- `403 Forbidden` — niewystarczająca admin rola
- `404 Not Found` — `PaymentNotFoundError` (order istnieje, ale Payment nie — zdarzy się gdy confirm nie przeszedł)
- `409 Conflict` — `PaymentAlreadyCompletedError`, `InvalidPaymentStateTransitionError`, `WrongPaymentMethodError` (próba na STRIPE_CHECKOUT)

**Side effects / events:**

- **`PaymentRecordedEvent`** (tożsamy jak Stripe) → BC3 markAsPaid → `OrderPaidEvent` → kaskada 5.x
- Audit: `Payment.markedPaidByAdminUserId` (sub z admin JWT)

**Called from:** Admin panel — przycisk "Oznacz jako opłacone" (Krok 8 Flow B, sekcja 4.4).

**Linki do kodu:** `apps/.../payment-processing/controllers/admin-payments.controller.ts:26`, `apps/.../dto/admin-mark-paid-request.dto.ts`, `apps/.../dto/admin-mark-paid-response.dto.ts`

---

### 10.3 Invoices & Billing (BC6) — `/api/invoices` i `/api/admin/billing`

**Controller prefix:** `/api/invoices` (user) + `/api/admin/billing` (admin).
**Filter:** `@UseFilters(BillingExceptionFilter)` (10.0.3 dla mapowania).

---

#### 10.3.1. `GET /api/invoices` — List invoices for current customer (paginated)

**Opis:** Lista faktur dla firmy zalogowanego managera. Read-model `invoice_projections`. Filtry: type (PF/FV/FK) + status (PAID/UNPAID/CORRECTED). Paginacja.

**Guard:**

- `Auth(AuthType.Bearer)` — user JWT
- `@Roles(Role.ADMIN)` — tylko Manager firmy (CC-382 manager-only financial read)
- `@ApiBearerAuth()`

**Query params (DTO `ListInvoicesQueryDto`):**
| Parametr | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `page` | number | optional | `@IsInt() @Min(1)`, default 1 | Page (1-based) |
| `pageSize` | number | optional | `@IsIn([10, 25, 50])`, default 10 | Items per page |
| `type` | `'PF' \| 'FV' \| 'FK'` | optional | `@IsIn(['PF','FV','FK'])` | PF=proforma, FV=VAT, FK=correction |
| `status` | `'PAID' \| 'UNPAID' \| 'CORRECTED'` | optional | `@IsIn(...)` | Public status |

**Mapping `type` → internal:** `PF → PRO_FORMA`, `FV → VAT`, `FK → CORRECTION`.
**Mapping `status` → internal:** `PAID → statusInternal:PAID`, `UNPAID → statusInternal:ISSUED`, `CORRECTED → correctedOnly:true`.

**Response 200 (DTO `PaginatedInvoiceListItemsResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `items` | `InvoiceListItemResponseDto[]` | no | Elementy bieżącej strony |
| `total` | number | no | Total matching |
| `page` | number | no | Bieżąca strona |
| `pageSize` | number | no | Items per page |

**Nested DTO `InvoiceListItemResponseDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `invoiceNumber` | string | no | Np. `"FV/00001/2026"` |
| `invoiceType` | `'PRO_FORMA' \| 'VAT' \| 'CORRECTION'` | no | Internal enum |
| `typeCode` | `'PF' \| 'FV' \| 'FK'` | no | Public short code |
| `status` | `'PAID' \| 'UNPAID' \| 'CORRECTED'` | no | Public status |
| `issueDate` | string (ISO) | no | |
| `netAmountMinorUnits` | number | no | Grosze |
| `vatAmountMinorUnits` | number | no | Grosze |
| `grossAmountMinorUnits` | number | no | Grosze |
| `vatRate` | string | no | Np. `"23%"` |
| `currency` | string | no | ISO 4217 |
| `correctedInvoiceNumber` | string \| null | yes | Dla FK: oryginalny numer |
| `pdfUrl` | string | no | Relative URL (np. `/api/invoices/FV%2F00001%2F2026/pdf`) |

**Response error codes:**

- `401 Unauthorized` — brak/invalid JWT
- `403 Forbidden` — rola nie Manager

**Called from:** Portal `/billing/invoices`.

**Linki do kodu:** `apps/.../billing/controllers/invoices.controller.ts:30`, `apps/.../billing/dto/list-invoices.query.dto.ts`, `apps/.../billing/dto/paginated-invoice-list-items.response.dto.ts`, `apps/.../billing/dto/invoice-list-item.response.dto.ts`

---

#### 10.3.2. `GET /api/invoices/:invoiceNumber` — Get invoice details

**Opis:** Pełne dane faktury po numerze. Tylko dla faktur należących do firmy zalogowanego managera.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)` + `@ApiBearerAuth()`.

**Path params:**

- `invoiceNumber` (string) — URL-encoded, np. `FV%2F00001%2F2026` dla `FV/00001/2026`

**Response 200 (DTO `InvoiceResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `invoiceNumber` | string | no | |
| `invoiceType` | string | no | Np. `"VAT_INVOICE"`, `"PROFORMA"` |
| `status` | string | no | Np. `"ISSUED"`, `"PAID"` |
| `customerId` | string | no | |
| `orderId` | string | no | |
| `paymentId` | string | optional | |
| `customerSnapshot` | object | no | Snapshot w chwili wystawienia (structure opaque) |
| `lineItems` | `object[]` | no | Linie faktury (structure opaque) |
| `netAmountMinorUnits` | number | no | Grosze |
| `vatRate` | string | no | Np. `"23%"` |
| `vatAmountMinorUnits` | number | no | Grosze |
| `grossAmountMinorUnits` | number | no | Grosze |
| `currency` | string | no | |
| `issueDate` | Date (ISO) | no | |
| `saleDate` | Date (ISO) | optional | |
| `dueDate` | Date (ISO) | optional | |

> **Znalezisko:** `customerSnapshot` i `lineItems[]` są otypowane jako `any` / `object[]` w DTO. FE musi sprawdzić rzeczywisty shape podczas integracji. Flag dla dalszej dokumentacji.

**Response error codes:**

- `400 Bad Request` — `InvalidInvoiceNumberFormatError`
- `401 Unauthorized`
- `403 Forbidden` — rola nie Manager
- `404 Not Found` — `InvoiceNotFoundError` (nie istnieje lub nie należy do customera)
- `500 Internal Server Error` — `InvoiceProjectionMissingError`

**Called from:** Portal detail view.

**Linki do kodu:** `invoices.controller.ts:72`, `apps/.../billing/dto/invoice.response.dto.ts`

---

#### 10.3.3. `GET /api/invoices/:invoiceNumber/pdf` — Download invoice PDF

**Opis:** Streamuje PDF faktury. Tylko dla faktur należących do customer-a. Generator używa Puppeteer (BC6).

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Path params:**

- `invoiceNumber` (string) — URL-encoded

**Response 200:** `StreamableFile` (binary PDF)

- Headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<invoiceNumber>.pdf"`

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` — `InvoiceNotFoundError`
- `500 Internal Server Error` — `PdfRenderError` (Puppeteer failure)

**Called from:** Portal list/detail — klik ikony pobrania PDF.

**Linki do kodu:** `invoices.controller.ts:85`

---

#### 10.3.4. `POST /api/admin/billing/projections/rebuild` — Rebuild invoice projections (admin)

**Opis:** Ops-only endpoint. Wywołuje `RebuildInvoiceProjectionsCommand` — rebuild read-model `invoice_projections` z transactions. Asynchroniczny (202 Accepted).

**Guard:**

- `Auth(AuthType.AdminBearer)`
- `@AdminRoles(AdminRole.SUPER_ADMIN)`
- `@ApiBearerAuth()`

**Response 202 (Accepted):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `message` | string | no | `"Projection rebuild initiated"` |

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden` — rola nie SUPER_ADMIN

**Called from:** Ops — po detekcji inconsistency w read-model.

**Linki do kodu:** `apps/.../billing/controllers/admin-billing.controller.ts:19`

---

### 10.4 Company Payments — `/api/company-payments` (user) i `/api/admin/company-payments`

> **Uwaga architektoniczna:** `company-payments` to **nie to samo** co BC7 `Payment` aggregate. To composition layer: zapis per-subscription-invoice per-customer z dokumentami załączonymi (faktury, potwierdzenia przelewów). `PaymentStatus` enum tutaj to `TO_BE_PAID | PAID`, **nie** BC7's `PENDING/SUCCEEDED/FAILED`. Dla FE: traktuj jak "widok zapłaconego zamówienia subskrypcyjnego" z listą dokumentów.

---

#### 10.4.1. `GET /api/company-payments/current?page=&limit=` — List company payments (paginated)

**Opis:** Lista płatności dla firmy zalogowanego managera. Paginacja. Zwraca per-cycle rozpis (monthly + yearly net/gross, w PLN jako string i przed/po discount).

**Guard:**

- `Auth` — NO explicit — controller nie ma `@Auth` decorator, ale `@Roles(Role.ADMIN)` wymaga user JWT w praktyce (role guard i tak wymaga uwierzytelnienia). Faktyczny default JWT może być wymagany przez global guards.
- `@Roles(Role.ADMIN)` — Manager only (CC-382)

**Query params (DTO `PaginationQueryDto` 10.0.1):**

- `page` (number, optional, default 1)
- `limit` (number, optional, default 10)

**Response 200 (DTO `PaginatedResponseDto<GetCompanyPaymentsResponseDto>`):**

- Shape paginacji: patrz 10.0.2 (`data`, `total`, `page`, `limit`, `totalPages`).

**Nested DTO `GetCompanyPaymentsResponseDto` (per payment):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `id` | string | no | Payment ID (MongoId) |
| `companyId` | string | no | |
| `netAmount` | string | no | Monthly net (PLN jako string — np. `"1545"`) |
| `invoiceNumber` | string | no | Np. `"P/507f.../1/2025"` |
| `grossAmount` | string | no | Monthly gross (net + 23% VAT) |
| `fullNetAmount` | string | no | Yearly net (monthly \* 12) |
| `fullGrossAmount` | string | no | Yearly gross |
| `netAmountBeforeDiscount` | string | no | Przed rabatem |
| `grossAmountBeforeDiscount` | string | no | Przed rabatem |
| `fullNetAmountBeforeDiscount` | string | no | |
| `fullGrossAmountBeforeDiscount` | string | no | |
| `discountId` | string \| null | yes | |
| `status` | `PaymentStatus` enum | no | `TO_BE_PAID` \| `PAID` |
| `startDate` | Date \| null | yes | |
| `endDate` | Date \| null | yes | |
| `createdAt` | Date | no | |
| `updatedAt` | Date | no | |
| `documents` | `FileInfoResponseDto[]` | optional | Dokumenty w R2 |

**Response error codes:**

- `401 Unauthorized` — brak JWT
- `403 Forbidden` — rola nie Manager

**Called from:** Portal `/billing/payments`.

**Linki do kodu:** `apps/.../company-payments/company-payments-user/controllers/company-payments-user.controller.ts:22`, `apps/.../company-payments-user/controllers/dtos/get-company-payments-response.dto.ts`

---

#### 10.4.2. `GET /api/company-payments/current/:id` — Get single company payment

**Opis:** Szczegóły jednej płatności.

**Guard:** `@Roles(Role.ADMIN)` + user JWT (implicite).

**Path params (DTO `PaymentIdParamDto`):**

- `id` (string) — `@IsMongoId()` — Payment ID

**Response 200:** `GetCompanyPaymentsResponseDto` (patrz 10.4.1).

**Response error codes:**

- `400 Bad Request` — invalid MongoId
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` — payment nie istnieje lub nie należy do firmy

**Called from:** Portal detail view.

**Linki do kodu:** `company-payments-user.controller.ts:36`

---

#### 10.4.3. `GET /api/admin/company-payments/:id/documents` — List payment documents (admin)

**Opis:** Lista plików przypiętych do company payment (faktury scan, potwierdzenie przelewu itp.). Storage: Cloudflare R2 pod `{companyId}/{paymentId}/{fileName}`.

**Guard:** `Auth(AuthType.AdminBearer)` + `@ApiBearerAuth()`.

**Path params:** `id` (MongoId).

**Response 200:** `FileInfoResponseDto[]` — shape z `@app/common/dtos/file-info-response.dto` (fileName, size, uploadedAt — nie rozwijam tutaj, common shared DTO).

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden`

---

#### 10.4.4. `POST /api/admin/company-payments/:id/documents` — Upload payment document (admin, multipart)

**Opis:** Upload PDF do R2 pod kluczem `{companyId}/{paymentId}/{fileName}`. Max 10MB. Tylko `application/pdf`.

**Guard:** `Auth(AuthType.AdminBearer)`.

**Path params:** `id` (MongoId).

**Request:** `multipart/form-data`

- `file` — Express.Multer.File
- `ParseFilePipe` validators: `MaxFileSizeValidator({ maxSize: 10MB })` + `FileTypeValidator({ fileType: 'application/pdf' })`

**Response 201 (DTO `UploadDocumentResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `fileName` | string | |
| `message` | string | `"Document uploaded successfully"` |

**Response error codes:**

- `400 Bad Request` — file > 10MB, file not PDF
- `401 Unauthorized`
- `403 Forbidden`

---

#### 10.4.5. `DELETE /api/admin/company-payments/:id/documents` — Delete payment document (admin)

**Opis:** Usunięcie pliku z R2.

**Guard:** `Auth(AuthType.AdminBearer)`.

**Path params:** `id` (MongoId).

**Request body (DTO `DeleteDocumentDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `documentFileName` | string | required | `@IsString() @IsNotEmpty()` | Np. `"sales-document.pdf"` |

**Response 200:**
| Pole | Typ | Opis |
|---|---|---|
| `message` | string | Confirmation |

---

#### 10.4.6. `GET /api/admin/company-payments/:id` — Get payment details (admin)

**Opis:** Pełne dane payment dla admina + discount details (jeśli był rabat).

**Guard:** `Auth(AuthType.AdminBearer)`.

**Path params:** `id` (MongoId).

**Response 200 (DTO `CompanyPaymentResponseDto`, extends `CompanyPaymentAdminDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `id` | string | no | |
| `companyId` | string | no | |
| `netAmount` | string | optional | (z bazy DTO — optional bo extends update DTO) |
| `invoiceNumber` | string | optional | |
| `discountId` | string \| null | optional | |
| `status` | `PaymentStatus` enum | optional | |
| `startDate`, `endDate` | Date \| null | optional | |
| `grossAmount`, `fullNetAmount`, `fullGrossAmount` | string | no | |
| `netAmountBeforeDiscount`, `grossAmountBeforeDiscount` | string | no | |
| `fullNetAmountBeforeDiscount`, `fullGrossAmountBeforeDiscount` | string | no | |
| `createdAt`, `updatedAt` | Date | no | |
| `discount` | `DiscountDetailsDto \| null` | optional | Obecne gdy rabat aplikowany |

**Nested DTO `DiscountDetailsDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `id` | string | Discount ID |
| `code` | string | Np. `"SUMMER2025"` |
| `name` | string | |
| `type` | `DiscountType` enum | `'PARTNER' \| 'CODE'` |
| `percentage` | number | |
| `isActive` | boolean | |

---

#### 10.4.7. `PUT /api/admin/company-payments/:id` — Update payment (admin)

**Opis:** Partial update dla admina. Wszystkie pola optional.

**Guard:** `Auth(AuthType.AdminBearer)`.

**Path params:** `id` (MongoId).

**Request body (DTO `CompanyPaymentAdminDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `netAmount` | number | optional | `@IsNumber()` | PLN (uwaga: typ TS `string` w DTO, ale validator `@IsNumber` — prawdopodobnie bug/legacy) |
| `invoiceNumber` | string | optional | `@IsString()` | |
| `discountId` | string \| null | optional | `@IsMongoId()` | |
| `status` | `PaymentStatus` enum | optional | `@IsEnum(PaymentStatus)` | |
| `startDate` | Date \| null | optional | `@IsDate() @Type(() => Date)` | |
| `endDate` | Date \| null | optional | `@IsDate() @Type(() => Date)` | |

**Response 200:** `CompanyPaymentResponseDto` (patrz 10.4.6).

> **Znalezisko:** `netAmount` ma w DTO typ `string` ale decorator `@IsNumber()`. Niespójność — prawdopodobnie legacy. FE powinien przesyłać number, backend akceptuje number przez `@Type()` implicit.

---

### 10.5 Company Subscription (BC4) — `/api/company-subscription`

**Controller prefix:** `/api/company-subscription`. Wszystkie endpointy wymagają `Auth(AuthType.Bearer)` (user JWT). Większość dodatkowo `@Roles(Role.ADMIN)` (Manager only).

Ownership: BC4 Subscription Lifecycle (gateway layer delegates przez CommandBus/QueryBus).

---

#### 10.5.1. `GET /api/company-subscription/current/plan` — Get current plan + comparison (CC-368)

**Opis:** Zwraca aktualny plan + tabelę porównawczą planów (Standard/Optimum/Professional/Expert) + informację o partnerskim rabacie. Nie wymaga rangi Manager (różni się od innych w 10.5).

**Guard:** `Auth(AuthType.Bearer)` — każdy zalogowany user firmy.

**Response 200 (DTO `CurrentPlanWithComparisonResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `currentPlanCode` | string \| null | yes | Np. `'optimum'`; null gdy brak subscription |
| `currentBillingCycle` | `'MONTHLY' \| 'ANNUAL' \| null` | yes | |
| `plans` | `PlanComparisonEntryDto[]` | no | 4 plany |
| `features` | `PlanComparisonFeatureDto[]` | no | Feature matrix |
| `partnerDiscount` | `PartnerDiscountDto \| null` | yes | |

**Nested DTO `PlanComparisonEntryDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `code` | `'standard' \| 'optimum' \| 'professional' \| 'expert'` | |
| `displayName` | string | Np. `"Plan Optimum"` |
| `priceMonthly` | `MoneyDto` | `{ amount: number (grosze), currency: string }` |
| `priceAnnual` | `MoneyDto` | |

**Nested DTO `PlanComparisonFeatureDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `key` | string | Np. `"SecurityReport"` |
| `label` | string | |
| `availability` | `Record<string, string>` | Np. `{ standard: 'general', optimum: 'detailed', ... }` |

**Nested DTO `PartnerDiscountDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `active` | boolean | |
| `percent` | number | |

**Response error codes:**

- `401 Unauthorized`

**Called from:** Portal `/subscription/plan`.

**Linki do kodu:** `apps/.../company-subscription/company-subscription-user/controllers/company-subscription-user.controller.ts:44`, `apps/.../controllers/dtos/current-plan-with-comparison-response.dto.ts`

---

#### 10.5.2. `POST /api/company-subscription/current/plan-change/preview` — Preview plan change (CC-373 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture. Real impl planowane w **CC-373 (PHASE 5)**. DTO jest stabilne; FE może implementować integrację.

**Opis:** Preview zmiany planu (upgrade/downgrade) z prorationem dla pozostałego cyklu. Zwraca `creditUnused` + `chargeNewPlan` + `amountDueNow` + preview faktury.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `PlanChangePreviewDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `targetPlanCode` | `'standard' \| 'optimum' \| 'professional' \| 'expert'` | required | `@IsIn(...)` | |
| `billingCycle` | `'MONTHLY' \| 'ANNUAL'` | required | `@IsIn(...)` | |

**Response 200 (DTO `PlanChangePreviewResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `currentPlan` | `PlanChangePlanRefDto` | `{ code, price: MoneyDto }` |
| `newPlan` | `PlanChangePlanRefDto` | |
| `cycle` | `PlanChangeCycleInfoDto` | `{ daysRemaining: number, endDate: Date }` |
| `creditUnused` | `MoneyDto` | Credit za niewykorzystane dni starego planu |
| `chargeNewPlan` | `MoneyDto` | Pełna cena nowego planu |
| `amountDueNow` | `MoneyDto` | `chargeNewPlan - creditUnused` |
| `invoicePreview` | `InvoicePreviewDto` | `{ netAmount, vatAmount, grossAmount, lineItems: [{description, amount}] }` |

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden` — rola nie Manager

**Called from:** Portal `/subscription/plan` — po kliku "Zmień na Professional".

**Linki do kodu:** `company-subscription-user.controller.ts:53`, `apps/.../dtos/plan-change-preview.dto.ts`, `apps/.../dtos/plan-change-preview-response.dto.ts`

---

#### 10.5.3. `POST /api/company-subscription/current/plan-change` — Commit plan change (CC-373 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture. Real impl planowane w **CC-373 (PHASE 5)**.

**Opis:** Commit plan change preview'a — faktyczna zmiana + faktura + charge (jeśli upgrade proration dodatnia). Idempotentny (UUID v4).

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `PlanChangeCommitDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `targetPlanCode` | enum | required | `@IsIn([...])` | |
| `billingCycle` | enum | required | `@IsIn(['MONTHLY', 'ANNUAL'])` | |
| `idempotencyKey` | string | required | `@IsUUID('4')` | |

**Response 200 (DTO `PlanChangeCommitResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `subscriptionId` | string | |
| `newPlan` | `PlanChangeNewPlanDto` | `{ code: string, name: string }` |
| `activatedAt` | Date | |
| `invoiceNumber` | string | |
| `nextRenewalAt` | Date | |

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden`

**Called from:** Portal — klik "Potwierdź zmianę" po preview.

**Linki do kodu:** `company-subscription-user.controller.ts:64`

---

#### 10.5.4. `POST /api/company-subscription/current/plan-change/schedule` — Schedule downgrade (CC-374 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture. Real impl planowane w **CC-374 (PHASE 4)**.

**Opis:** Zaplanowanie downgrade do aktywacji na koniec bieżącego cyklu (downgrade nie daje prorationu — klient płaci do końca okresu za wyższy plan, nowy plan aktywuje się po renewalu).

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `ScheduledPlanChangeDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `targetPlanCode` | enum | required | `@IsIn([...])` | Plan docelowy (zazwyczaj niższy) |

**Response 200 (DTO `ScheduledPlanChangeResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `targetPlanCode` | string | |
| `effectiveDate` | Date | Koniec bieżącego cyklu |
| `cancelable` | boolean | Czy można anulować scheduled change |

**Linki do kodu:** `company-subscription-user.controller.ts:75`

---

#### 10.5.5. `DELETE /api/company-subscription/current/plan-change/scheduled` — Cancel scheduled plan change (CC-374 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture. Real impl planowane w **CC-374 (PHASE 4)**.

**Opis:** Anulowanie zaplanowanego downgrade (do czasu `effectiveDate`).

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Response 200:**
| Pole | Typ | Opis |
|---|---|---|
| `message` | string | `"Scheduled plan change cancelled"` |

**Linki do kodu:** `company-subscription-user.controller.ts:84`

---

#### 10.5.6. `GET /api/company-subscription/current/payment-methods` — List saved payment methods (CC-376)

> **⚠️ Stan na 2026-04-24:** Zwraca minimal snapshot z subscription aggregate (stripePaymentMethodId bez brand/last4/exp). Pełne BC7 Stripe-API query jest OOS tracked jako CC-376 follow-up.

**Opis:** Zapisane payment methods dla Stripe customer związanego z subskrypcją.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Response 200:** `PaymentMethodDto[]`

**Nested DTO `PaymentMethodDto`:**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `id` | string | no | Stripe PM ID (`pm_...`) |
| `type` | string | no | Obecnie stub zawsze `"card"` |
| `brand` | string \| null | yes | Stub `null` (real impl: `'visa'`, `'mastercard'`, ...) |
| `last4` | string \| null | yes | Stub `null` (real: `"4242"`) |
| `expMonth` | number \| null | yes | Stub `null` |
| `expYear` | number \| null | yes | Stub `null` |
| `isDefault` | boolean | no | |

Jeśli subscription nie ma `stripePaymentMethodId` → zwraca `[]`.

**Response error codes:**

- `401 Unauthorized`
- `403 Forbidden`

**Linki do kodu:** `company-subscription-user.controller.ts:94`

---

#### 10.5.7. `POST /api/company-subscription/current/payment-methods/setup-intent` — Create Stripe SetupIntent (CC-376 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca stub `'seti_stub_secret_PLACEHOLDER'`. BC7 `CreateSetupIntentCommand` jeszcze nie istnieje — tracked jako CC-376 follow-up w koordynacji z CC-373.

**Opis:** Tworzy Stripe SetupIntent żeby klient mógł dodać nową kartę off-session (bez charge). FE używa `clientSecret` z Stripe Elements.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Response 200 (DTO `StripeSetupIntentResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `clientSecret` | string | Dla Stripe.js / Elements |
| `setupIntentId` | string | `seti_...` |

**Linki do kodu:** `company-subscription-user.controller.ts:103`

---

#### 10.5.8. `POST /api/company-subscription/current/payment/retry` — Retry failed renewal (CC-376)

**Opis:** User-initiated retry płatności gdy subscription w GRACE_PERIOD (po failed auto-renewal). Próbuje `ChargeSavedPaymentMethodCommand` na zapisanym `stripePaymentMethodId`. Przy sukcesie → `ExitGracePeriodCommand` (zachowuje cycle validity). Przy `AUTHENTICATION_REQUIRED` (3DS) → zwraca client_secret dla Stripe.js. Przy DECLINED → error details.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `PaymentRetryDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `paymentMethodId` | string | optional | `@IsOptional() @IsString()` | Nowe PM ID (przełączenie przed retry); domyślnie używa `sub.stripePaymentMethodId` |

**Response 200 (DTO `PaymentRetryResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `status` | `'SUCCEEDED' \| 'FAILED' \| 'REQUIRES_ACTION'` | no | Discriminator outcome |
| `paymentIntentId` | string \| null | yes | Obecne dla SUCCEEDED i REQUIRES_ACTION |
| `clientSecret` | string \| null | yes | Obecne gdy status === REQUIRES_ACTION (3DS) |
| `errorMessage` | string \| null | yes | Obecne gdy status === FAILED |

**Discriminator union mapping (z `ChargeSavedPaymentMethodResult.kind`):**

- `kind: 'SUCCESS'` → `{ status: 'SUCCEEDED', paymentIntentId, clientSecret: null, errorMessage: null }` + emit `ExitGracePeriodCommand`
- `kind: 'AUTHENTICATION_REQUIRED'` → `{ status: 'REQUIRES_ACTION', paymentIntentId, clientSecret, errorMessage: null }`
- `kind: 'DECLINED'` → `{ status: 'FAILED', paymentIntentId: null, clientSecret: null, errorMessage }`

**Response error codes:**

- `400 Bad Request` — `subscription is ${status}; retry only valid in GRACE_PERIOD`, `Subscription has no saved Stripe payment method`, `Subscription has no recorded renewal price`
- `401 Unauthorized`
- `403 Forbidden` — rola nie Manager
- `404 Not Found` — `No active subscription for company`

**Side effects / events:**

- Przy SUCCESS: `ExitGracePeriodCommand(sub.subscriptionId, 'USER_PAYMENT', now)` → BC4 exit grace
- `ChargeSavedPaymentMethodCommand` metadata zawiera `{ purpose: 'PAYMENT_RETRY', subscriptionId, orderId: OrderId.reconstitute(subscriptionId), idempotencyKey: portal-retry:<subId>:<randomUUID> }`

**Called from:** Portal `/subscription/retry-payment` — klient w GRACE_PERIOD.

**Linki do kodu:** `company-subscription-user.controller.ts:112`, service: `apps/.../services/company-subscription-user.service.ts:166` (`retryPayment`)

---

#### 10.5.9. `POST /api/company-subscription/current/cancel` — Cancel subscription at cycle end (CC-376)

**Opis:** Schedule cancellation na koniec bieżącego cyklu (customer-initiated). Walidacja: subscription w ACTIVE lub GRACE_PERIOD. Zapis `reason` (opcjonalny) do audit. Dispatch `CancelSubscriptionCommand` → BC4 ustala `scheduledCancellationDate = currentPeriodEnd`. Nie jest to immediate cancel — klient ma dostęp do końca cyklu.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `CancelSubscriptionDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `reason` | string | optional | `@IsOptional() @IsString() @MaxLength(500)` | Powód (reason wewnętrznie `CancellationReason.create()`, default `'CUSTOMER_REQUEST'`) |

**Response 200 (DTO `CancelSubscriptionResponseDto`):**
| Pole | Typ | Opis |
|---|---|---|
| `message` | string | `"Subscription scheduled for cancellation at cycle end"` |
| `scheduledCancellationDate` | Date | Koniec cyklu (ISO) |

**Response error codes:**

- `400 Bad Request` — subscription nie w ACTIVE/GRACE_PERIOD, invalid reason
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` — `No active subscription for company`

**Side effects / events:**

- `CancelSubscriptionCommand` → BC4 aggregate transition → emit `SubscriptionCancelledEvent` (at cycle end) → BC3 `WhenSubscriptionCancelledHandler` → `CloseOrderCommand` reason `CANCELLED`

**Called from:** Portal `/subscription/cancel`.

**Linki do kodu:** `company-subscription-user.controller.ts:123`, service: `company-subscription-user.service.ts:248` (`cancelSubscription`)

---

#### 10.5.10. `GET /api/company-subscription/current/reactivation-eligibility` — Reactivation eligibility check (CC-377 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture (`eligible: true`, `daysLeftToReactivate: 75`, previousPlanCode `'optimum'`, wszystkie 4 plany). Real impl planowane w **CC-377 (PHASE 3)**.

**Opis:** Sprawdza czy firma kwalifikuje się do reactivation po EXPIRED/CANCELLED (window 90 dni z Reactivation policy) oraz jakie plany są dostępne.

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Response 200 (DTO `ReactivationEligibilityResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `eligible` | boolean | no | |
| `daysLeftToReactivate` | number \| null | yes | Dni pozostałe do końca reactivation window |
| `previousPlanCode` | string \| null | yes | |
| `availablePlans` | `ReactivationAvailablePlanDto[]` | no | |

**Nested DTO `ReactivationAvailablePlanDto`:**
| Pole | Typ | Opis |
|---|---|---|
| `code` | string | |
| `displayName` | string | |

**Linki do kodu:** `company-subscription-user.controller.ts:135`

---

#### 10.5.11. `POST /api/company-subscription/current/reactivate` — Reactivate subscription (CC-377 STUB)

> **⚠️ Stan na 2026-04-24:** endpoint zwraca fixture (stale subscriptionId `'68c030001f4d298400389500'`, `status: 'PENDING_PAYMENT'`, stub Stripe URL lub stub orderId). Real impl planowane w **CC-377 (PHASE 3)**.

**Opis:** Reactivate expired/cancelled subscription. Dwa warianty:

- `paymentMethod: 'STRIPE'` → zwraca nowy Stripe checkoutUrl
- `paymentMethod: 'BANK_TRANSFER'` → tworzy Order + zwraca orderId (klient dostaje pro forma mailem)

**Guard:** `Auth(AuthType.Bearer)` + `@Roles(Role.ADMIN)`.

**Request body (DTO `ReactivateSubscriptionDto`):**
| Pole | Typ | Required | Constraints | Opis |
|---|---|---|---|---|
| `planCode` | enum | required | `@IsIn(['standard', 'optimum', 'professional', 'expert'])` | |
| `billingCycle` | enum | required | `@IsIn(['MONTHLY', 'ANNUAL'])` | |
| `paymentMethod` | enum | required | `@IsIn(['STRIPE', 'BANK_TRANSFER'])` | |
| `idempotencyKey` | string | required | `@IsUUID('4')` | |

**Response 200 (DTO `ReactivateSubscriptionResponseDto`):**
| Pole | Typ | Nullable | Opis |
|---|---|---|---|
| `subscriptionId` | string | no | |
| `status` | `'ACTIVE' \| 'PENDING_PAYMENT'` | no | |
| `checkoutUrl` | string \| null | yes | Dla `paymentMethod=STRIPE` |
| `orderId` | string \| null | yes | Dla `paymentMethod=BANK_TRANSFER` |

**Linki do kodu:** `company-subscription-user.controller.ts:144`

---

### 10.6 Flow-to-endpoint mapping

Tabela pokazuje które endpointy sekcji 10 są używane w kolejnych krokach narracji (sekcje 3-6 doc).

| Krok flow                                        | HTTP   | Endpoint                                                         | Sekcja  |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------- | ------- |
| 0. Start order                                   | POST   | `/api/orders/start`                                              | 10.1.1  |
| 1. NIP lookup (auto-fill)                        | GET    | `/api/orders/company-lookup?nip=...`                             | 10.1.2  |
| 1. Submit company data                           | PATCH  | `/api/orders/:id/company-data`                                   | 10.1.5  |
| 2. Get consent definitions                       | GET    | `/api/orders/consent-definitions`                                | 10.1.3  |
| 2. Submit personal data                          | PATCH  | `/api/orders/:id/personal-data`                                  | 10.1.7  |
| 3. Get standards schema                          | GET    | `/api/orders/:id/operational-standards-schema`                   | 10.1.8  |
| 3. Preview eligibility (live)                    | POST   | `/api/orders/:id/evaluate-eligibility`                           | 10.1.10 |
| 3. Submit standards                              | PATCH  | `/api/orders/:id/operational-standards`                          | 10.1.9  |
| 4. Validate discount                             | POST   | `/api/orders/:id/validate-discount`                              | 10.1.11 |
| 4. Select payment method                         | PATCH  | `/api/orders/:id/payment-method`                                 | 10.1.12 |
| (any time) Get checkout state                    | GET    | `/api/orders/:id/checkout-state`                                 | 10.1.6  |
| 5. Confirm order                                 | POST   | `/api/orders/:id/confirm`                                        | 10.1.13 |
| 6A. Stripe create session                        | POST   | `/api/sales-order/:id/stripe-checkout-session`                   | 10.2.1  |
| 6B. BANK_TRANSFER confirmation                   | GET    | `/api/orders/:id/confirmation?token=...`                         | 10.1.15 |
| 6B. Pro forma download                           | GET    | `/api/orders/:id/proforma/download?token=...`                    | 10.1.16 |
| 6B. Get order (pokazanie danych)                 | GET    | `/api/orders/:id`                                                | 10.1.14 |
| 7A. Stripe webhook                               | POST   | `/api/webhooks/stripe`                                           | 10.2.2  |
| 7B. Admin mark-paid                              | POST   | `/api/admin/orders/:id/mark-paid`                                | 10.2.3  |
| 8. Polling success                               | GET    | `/api/orders/:id`                                                | 10.1.14 |
| Post-purchase: list invoices                     | GET    | `/api/invoices`                                                  | 10.3.1  |
| Post-purchase: download invoice                  | GET    | `/api/invoices/:invoiceNumber/pdf`                               | 10.3.3  |
| Post-purchase: list payments                     | GET    | `/api/company-payments/current`                                  | 10.4.1  |
| Post-purchase: current plan                      | GET    | `/api/company-subscription/current/plan`                         | 10.5.1  |
| Post-purchase (CC-373): preview plan change      | POST   | `/api/company-subscription/current/plan-change/preview`          | 10.5.2  |
| Post-purchase (CC-373): commit                   | POST   | `/api/company-subscription/current/plan-change`                  | 10.5.3  |
| Post-purchase (CC-374): schedule downgrade       | POST   | `/api/company-subscription/current/plan-change/schedule`         | 10.5.4  |
| Post-purchase (CC-374): cancel scheduled         | DELETE | `/api/company-subscription/current/plan-change/scheduled`        | 10.5.5  |
| Post-purchase (CC-376): payment methods          | GET    | `/api/company-subscription/current/payment-methods`              | 10.5.6  |
| Post-purchase (CC-376): setup intent             | POST   | `/api/company-subscription/current/payment-methods/setup-intent` | 10.5.7  |
| Post-purchase (CC-376): retry payment (grace)    | POST   | `/api/company-subscription/current/payment/retry`                | 10.5.8  |
| Post-purchase (CC-376): cancel subscription      | POST   | `/api/company-subscription/current/cancel`                       | 10.5.9  |
| Post-purchase (CC-377): reactivation eligibility | GET    | `/api/company-subscription/current/reactivation-eligibility`     | 10.5.10 |
| Post-purchase (CC-377): reactivate               | POST   | `/api/company-subscription/current/reactivate`                   | 10.5.11 |
| (US-PURCHASE-11 future) Recover order            | POST   | `/api/orders/recover`                                            | 10.1.4  |
| (ops) Rebuild invoice projections                | POST   | `/api/admin/billing/projections/rebuild`                         | 10.3.4  |
| (ops) Payment documents: list                    | GET    | `/api/admin/company-payments/:id/documents`                      | 10.4.3  |
| (ops) Payment documents: upload                  | POST   | `/api/admin/company-payments/:id/documents`                      | 10.4.4  |
| (ops) Payment documents: delete                  | DELETE | `/api/admin/company-payments/:id/documents`                      | 10.4.5  |
| (ops) Get payment (admin)                        | GET    | `/api/admin/company-payments/:id`                                | 10.4.6  |
| (ops) Update payment (admin)                     | PUT    | `/api/admin/company-payments/:id`                                | 10.4.7  |
