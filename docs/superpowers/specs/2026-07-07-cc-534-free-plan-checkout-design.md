# CC-534 — Integracja flow zakupu planu 0 zł (darmowy) — design

**Data:** 2026-07-07 (zaktualizowano po wdrożeniu pola `paymentRequired` przez BE) • **Branch:** `feature/CC-534` • **Źródła wymagań:** [`docs/CC-534-purchase-process.md`](../../CC-534-purchase-process.md), [`docs/CC-534-be.md`](../../CC-534-be.md)

## 1. Cel

Zintegrować po stronie FE docelowy flow zakupu planu w 100% objętego promocją partnerską (cena 0 zł). Backend zachowuje się poprawnie (`POST /confirm` dla ceny 0 + promocji partnerskiej idzie ścieżką „confirm-as-paid": od razu `PENDING_ALLOCATION`, bez Stripe i bez płatności) i **dołożył jawne, addytywne pole kontraktu `paymentRequired: boolean`** (w `GET /orders/:id` i w odpowiedzi `confirm`). Zmiany są wyłącznie na FE:

- ukryć krok wyboru metody płatności (technicznie nadal wykonać `PATCH /payment-method` z `STRIPE_CHECKOUT` pod spodem),
- **nie** wołać `POST /sales-order/:id/stripe-checkout-session` dla darmowego zakupu,
- po `confirm` iść od razu na ekran sukcesu,
- zmienić tytuł guzika potwierdzenia na „Aktywuj darmowy plan".

## 2. Stan obecny (co już jest w kodzie)

- **Mock BE (checkout)**: `confirmOrderMock` (`src/lib/api/__mocks__/orders.mock.ts`) dla zamówienia z `discount.priceAfterDiscount === 0` + `PARTNER_*` już ustawia `status: PENDING_ALLOCATION`, `confirmationToken: null`. **Nie zwraca jeszcze pola `paymentRequired`** — do dołożenia (§4.7).
- **Krytyczna luka — `ConfirmStep.handleConfirm`**: rozgałęzia się na `result.paymentMethod === 'STRIPE_CHECKOUT'` → woła `createStripeCheckoutSession` i redirectuje na Stripe. Ścieżka promo-zero → sukces działa dziś **tylko** gdy metoda to `BANK_TRANSFER`. Ponieważ CC-534 wymaga dla darmowego planu metody `STRIPE_CHECKOUT`, obecny kod pojechałby na Stripe dla planu 0 zł — dokładnie to, czego dokument zakazuje.
- **`PaymentMethodStep`**: pokazuje UI wyboru metody wszystkim, w tym zamówieniom 0 zł.
- **`SuccessStatus`**: poluje `getOrder` (nie `/confirmation`), ma już copy promo-zero („Do zapłaty teraz: 0,00 zł", info o okresie promocyjnym). Ma **lokalną kopię** `isPromoZeroOrder` (heurystyka rabatu).
- **`checkout-recovery.ts`**: eksportuje `isPromoZeroOrder` (heurystyka `PARTNER_* + priceAfterDiscount===0`) i `canSwitchToBankTransfer` (używa jej). Importowane też przez `ResumePaymentScreen`.
- **`CheckoutProgressBar`**: obsługuje ukrywanie kroku 3 przez `osSkipped` (filtr + renumeracja).

## 3. Sygnał rozpoznawczy: jedno pole `paymentRequired` (autorytatywne)

FE rozpoznaje darmowe zamówienie **wyłącznie** po polu `paymentRequired` z backendu — nigdzie nie wyprowadza tego ze statusu ani z rabatu:

| Moment | Skąd pole | Warunek |
| --- | --- | --- |
| Krok 4 — ukrycie UI płatności, pasek postępu, przycisk Wstecz, copy CTA | `GET /orders/:id` → `OrderResponseDto.paymentRequired` (poprawne od `DRAFT`) | `order.paymentRequired === false` |
| Confirm — pominięcie Stripe → sukces | odpowiedź `POST /confirm` → `ConfirmOrderResponseDto.paymentRequired` | `result.paymentRequired === false` |

**Bezpieczna semantyka (`=== false`, nie `!paymentRequired`):** sprawdzamy jawnie `=== false`. Gdy pole jest `true` **lub nieobecne (`undefined`)** → traktujemy jak zamówienie płatne (ścieżka Stripe/proforma). Dzięki temu brak/nieznane pole **nigdy** nie spowoduje przypadkowego pominięcia płatności dla planu płatnego. Real BE zawsze wysyła pole; mock uzupełnimy (§4.7) — `undefined` to wyłącznie zabezpieczenie.

**Nie interpretujemy `status`.** Fulfillment jest asynchroniczny — `confirm` dla 0 zł może zwrócić `PENDING_ALLOCATION`, ale przy szybkim pipeline też `PROCESSING`/`FULFILLED`. `paymentRequired` jest niezależne od tempa pipeline'u.

**Konsekwencja architektoniczna:** heurystyka `isPromoZeroOrder` (rodzaj rabatu + cena) znika z FE — zastępuje ją jeden helper nad `paymentRequired` (§4.6). To eliminuje dublowanie „co znaczy darmowe" między frontem a backendem.

## 4. Zmiany szczegółowe

### 4.1 `PaymentMethodStep.tsx` — auto-pominięcie
Po hydracji (`getOrder`), gdy `order.paymentRequired === false`:
- nie renderuj UI wyboru metody — pokaż neutralny loader „Przygotowujemy zamówienie…";
- delta-aware: gdy `order.paymentMethod !== 'STRIPE_CHECKOUT'` (lub `!hasPaymentMethod`), wołaj `selectPaymentMethod(orderId, { paymentMethod: 'STRIPE_CHECKOUT' })`; w przeciwnym razie pomiń PATCH;
- `navigateForward('/checkout/confirm?orderId=…')`;
- na błąd PATCH → stan błędu z „Spróbuj ponownie" (ponawia auto-advance), bez pułapki w loaderze.

### 4.2 `ConfirmStep.tsx` — pominięcie Stripe + copy
- `handleConfirm`: po `confirmOrder` **najpierw** sprawdź `result.paymentRequired === false` → `navigateForward(success)`; `return`. Dopiero gdy płatność wymagana — dotychczasowe rozgałęzienie po metodzie (STRIPE → `createStripeCheckoutSession`; BANK_TRANSFER → `bank-transfer` z `confirmationToken`). Usuwa dzisiejszą lokalną gałąź `promoZero` pod BANK_TRANSFER i naprawia bug (0 zł + STRIPE jechałby dziś na Stripe).
- CTA: `isNoPaymentOrder(order)` → **„Aktywuj darmowy plan"**; inaczej `CTA_PER_TYPE[orderType]`.
- Wstecz: `isNoPaymentOrder(order)` → `osSkipped ? 'personal-data' : 'operational-standards'` (omija płatność); inaczej `payment-method`.
- Pasek postępu: `paymentSkipped={isNoPaymentOrder(order)}`.
- Nagłówek `HEADER_PER_TYPE[orderType]` — bez zmian.
- Guard bfcache/non-DRAFT (`classifyOrder` → paid → success) — bez zmian.

### 4.3 `CheckoutProgressBar.tsx`
Dodaj opcjonalne `paymentSkipped?: boolean`. Filtruj krok 4 gdy `true` (analogicznie do `osSkipped`/krok 3), z renumeracją `displayNumber`.

### 4.4 Przekazanie `paymentSkipped` do pozostałych kroków
`company-data`, `personal-data`, `operational-standards` — każdy liczy `isNoPaymentOrder(order)` ze swojego zhydrowanego zamówienia i przekazuje do `<CheckoutProgressBar paymentSkipped=… />`, żeby „Płatność" znikała spójnie przez cały wizard. Prop-only, **bez** cache w `OrderSession` (pole jest na każdym `getOrder`).

### 4.5 `SuccessStatus.tsx`
- Usuń lokalną kopię `isPromoZeroOrder`; zamiast niej copy promo-zero („Do zapłaty teraz: 0,00 zł", info o okresie promocyjnym) sterowane przez `isNoPaymentOrder(order)`.

### 4.6 Zastąpienie `isPromoZeroOrder` helperem nad `paymentRequired`
W `checkout-recovery.ts`:
- **Usuń** `isPromoZeroOrder` (heurystyka rabatu).
- **Dodaj** `isNoPaymentOrder(o: { paymentRequired?: boolean }): boolean` → `return o.paymentRequired === false;`. Sygnatura strukturalna obsługuje `OrderResponseDto` **i** `ConfirmOrderResponseDto`.
- `canSwitchToBankTransfer`: zamień `!isPromoZeroOrder(order)` na `!isNoPaymentOrder(order)` (dodać `paymentRequired` do jego `Pick<>`).
- Zaktualizuj importy: `ConfirmStep`, `SuccessStatus`, `ResumePaymentScreen` (`isPromoZeroOrder` → `isNoPaymentOrder`). `ResumePaymentScreen` ekran promo-zero („Twoja subskrypcja jest aktywna / dodaj kartę") sterowany teraz `isNoPaymentOrder(order)`.

Uzasadnienie równoważności: per kontrakt BE (`CC-534-be.md` §4) `paymentRequired === false` ⟺ 0 zł + rabat `PARTNER_*` ⟺ dawne `isPromoZeroOrder`. `CODE_FLAT` 100% → `paymentRequired` pozostaje `true` (zwykła ścieżka płatna), spójnie z dotychczasowym zachowaniem.

### 4.7 Typy + mock
- `OrderResponseDto` (`types/order.ts`): dodać `paymentRequired?: boolean`.
- `ConfirmOrderResponseDto`: dodać `paymentRequired?: boolean`; zaktualizować komentarz przy `status`.
- `orders.mock.ts`:
  - budowany obiekt zamówienia (`ordersById`) — pole `paymentRequired` = `false` gdy `discount.priceAfterDiscount === 0 && PARTNER_DISCOUNT_KINDS.includes(discount.kind)`, inaczej `true`; **przeliczane po każdej zmianie rabatu** (`selectPaymentMethod`, `validateDiscount`/`removeDiscount` jeśli wpływają na cenę).
  - `confirmOrderMock` — zwróć `paymentRequired: !isPromoZero` (reużyj istniejącej lokalnej zmiennej `isPromoZero`).
  - `getOrderMock` — zwraca `paymentRequired` z obiektu zamówienia.

Opcjonalnie: pomocnicza funkcja w mocku licząca `paymentRequired` z `discount`, żeby nie dublować reguły.

## 5. Sekwencja docelowa (0 zł)

```
start → company-data → personal-data → [payment-method: loader → PATCH STRIPE_CHECKOUT → forward]
      → confirm (CTA „Aktywuj darmowy plan") → POST /confirm → paymentRequired=false
      → EKRAN SUKCESU (polling getOrder → FULFILLED)
      (żadnego stripe-checkout-session, żadnej karty na tym etapie)
```

Pasek postępu dla Standard 0 zł (osSkipped + paymentSkipped): Dane organizacji → Dane osobiste → Potwierdzenie.

## 6. Edge cases

- **0 zł + PLAN_UPGRADE/REACTIVATION** (rzadkie): CTA „Aktywuj darmowy plan" nadpisuje copy upgrade/reactivation — akceptowalne.
- **Monthly 0 zł**: auto-skip nadrzędny wobec dzisiejszego auto-`STRIPE` dla monthly.
- **`CODE_FLAT` 100%**: `paymentRequired === true` → zwykła ścieżka płatna (patrz §4.6).
- **Resume/draft 0 zł**: `resumeStepPath` może zwrócić `payment-method` → auto-advance sobie poradzi.
- **Brak pola `paymentRequired`** (teoretycznie starszy BE / niepełny mock): traktowane jak płatne (§3 bezpieczna semantyka) — brak regresu na ścieżce płatnej.

## 7. Testy i weryfikacja

- Zgodnie z konwencją repo testy tylko `src/lib/`: przepisać przypadki w `checkout-recovery.test.ts`:
  - `isNoPaymentOrder`: `{ paymentRequired: false }` → `true`; `{ paymentRequired: true }` → `false`; `{}` (undefined) → `false`.
  - `canSwitchToBankTransfer`: zaktualizować przypadki (zamiast `discount` promo-zero → `paymentRequired: false` wyklucza switch).
- (opcjonalnie) test mocka: `confirmOrderMock` dla partner 0 zł zwraca `paymentRequired: false`; dla płatnego `true`.
- Komponenty (ProgressBar / kroki) — QA manualne przez mock: `/cennik?partner=<kod>` dający `PARTNER_TIMEBOUND` 0 zł na Standard (istnieje w `catalog.mock.ts`).
- Weryfikacja test/build wsadowo na końcu implementacji.

## 8. Poza zakresem

- Backendowa część CC-534 (mail o karcie, karencja, zarządzanie kartą w portalu) — `CC-534.md`, gotowa po stronie BE.
- Zmiana zachowania `confirm` dla 0 zł — bez zmian (BE dokłada tylko sygnał `paymentRequired`).
- Auto-defaultowanie metody płatności przez BE dla zamówień 0 zł — pozostaje odroczone; FE ustawia `STRIPE_CHECKOUT` pod spodem.
