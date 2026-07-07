# CC-534 — Zmiana kontraktu BE: jawna flaga „czy jest płatność" (`paymentRequired`)

**Dla:** BE • **Zakres:** jedno pole w DTO, które usuwa z FE zgadywanie, czy zamówienie wymaga płatności. **Powiązane:** [`CC-534-purchase-process.md`](./CC-534-purchase-process.md) (flow FE dla planu 0 zł), [`CC-534.md`](./CC-534.md) (obsługa PO zakupie).

---

## 1. Problem, który to naprawia

Dla planu 0 zł (100% promocji partnerskiej) `POST /confirm` idzie ścieżką „confirm-as-paid" — nie tworzy płatności i od razu przesuwa zamówienie na `PENDING_ALLOCATION`. FE musi rozpoznać ten przypadek, żeby **nie** wołać Stripe i pójść wprost na ekran sukcesu.

Dziś FE nie ma jawnego sygnału, więc **wnioskuje** — a każdy sposób wnioskowania jest kruchy:

- **Po statusie z `confirm`** (`status === 'PENDING_ALLOCATION'`) — **niedeterministyczne**: fulfillment jest asynchroniczny; jeśli pipeline pójdzie szybko, `confirm` może zwrócić już `PROCESSING` albo `FULFILLED`. Sprawdzanie jednego konkretnego statusu zawodzi.
- **Po rabacie** (`discount.kind ∈ PARTNER_* && discount.priceAfterDiscount === 0`) — **heurystyka biznesowa na FE**: FE odtwarza regułę „co znaczy darmowe", która należy do backendu. Każda zmiana reguły po stronie BE (nowy rodzaj promocji, inny sposób dojścia do 0 zł) cicho psuje FE.

Efekt: logika „czy pobieramy płatność" jest rozmazana po froncie w dwóch miejscach i duplikowana. To jest to spaghetti, którego chcemy uniknąć.

## 2. Rozwiązanie: jedno pole boolean

Backend — jako **jedyne źródło prawdy** — zwraca wprost, czy zamówienie wymaga etapu płatności:

```
paymentRequired: boolean
```

- `false` → nic do zapłaty teraz. BE potraktuje / potraktował `confirm` jako „confirm-as-paid" (bez Stripe, bez proformy). FE pomija wybór metody i ekran płatności, idzie na sukces.
- `true` → jest etap płatności (Stripe albo przelew/proforma). FE działa jak dla planu płatnego.

Pole wyraża **decyzję** („czy pobieramy płatność"), a nie kwotę, z której FE miałby ją wyprowadzać. Dzięki temu jest odporne na przyszłość (np. hipotetyczny plan „0 zł teraz, ale z podpięciem karty" — wtedy `paymentRequired` może być niezależne od kwoty).

## 3. Gdzie dodać pole (dwa miejsca)

FE potrzebuje tej informacji w dwóch różnych momentach flow, więc pole musi być w dwóch odpowiedziach:

| Moment na FE | Endpoint | Dlaczego tu |
| --- | --- | --- |
| Ukrycie kroku „metoda płatności" (przed potwierdzeniem) | `GET /api/orders/:orderId` → `OrderResponseDto` | FE musi wiedzieć **przed** `confirm`, że kroku płatności nie ma |
| Decyzja o pominięciu Stripe (po potwierdzeniu) | `POST /api/orders/:orderId/confirm` → odpowiedź | FE po potwierdzeniu idzie wprost na sukces, bez dodatkowego round-tripu |

Jeśli pole jest w obu, FE używa **jednego, spójnego warunku** wszędzie: `if (!paymentRequired) …` — i eliminuje oba dzisiejsze zgadywania naraz.

### 3.1 `GET /orders/:orderId` — `OrderResponseDto`

Dołożyć pole `paymentRequired: boolean`. Dostępne na każdym etapie życia zamówienia (DRAFT → …), żeby krok „metoda płatności" mógł się ukryć na podstawie zhydrowanego zamówienia.

Kształt (fragment, nowe pole zaznaczone):

```jsonc
{
  "orderId": "…",
  "status": "DRAFT",
  "billingCycle": "ANNUAL",
  "paymentMethod": null,
  "totalPriceNet": 0,
  "discount": { "kind": "PARTNER_TIMEBOUND", "priceAfterDiscount": 0, "...": "…" },
  "paymentRequired": false,   // <-- NOWE
  "...": "…"
}
```

### 3.2 `POST /orders/:orderId/confirm` — odpowiedź

Dołożyć to samo pole do odpowiedzi potwierdzenia (echo aktualnej decyzji), żeby FE nie musiał po `confirm` robić kolejnego `GET`:

```jsonc
{
  "orderId": "…",
  "status": "PENDING_ALLOCATION",   // może być też PROCESSING/FULFILLED, jeśli pipeline szybki — FE tego NIE interpretuje
  "paymentMethod": "STRIPE_CHECKOUT",
  "confirmationToken": null,
  "paymentRequired": false          // <-- NOWE; jednoznaczny sygnał „nie wołaj Stripe"
}
```

## 4. Semantyka — kiedy `true`, kiedy `false`

`paymentRequired` odzwierciedla to, co BE faktycznie zrobi (lub zrobił) w `confirm`:

- **`false`** wtedy i tylko wtedy, gdy `confirm` pójdzie ścieżką „confirm-as-paid" — czyli kwota do zapłaty teraz wynosi 0 z tytułu promocji partnerskiej (dzisiejsze kryterium BE: cena końcowa 0 + rabat `PARTNER_*`). W tym przypadku BE nie tworzy płatności ani proformy.
- **`true`** w każdym innym przypadku — zamówienie przejdzie w `confirm` na `CONFIRMED` i czeka na płatność (Stripe) albo na zaksięgowanie przelewu (proforma).

Ważne, żeby wartość była **spójna między `GET` a `confirm`** dla tego samego stanu zamówienia. Na `GET` w stanie `DRAFT` pole ma przewidywać, co zrobi `confirm` przy obecnej cenie/rabacie (patrz §6 — moment ustalenia ceny).

**Kluczowa niezmienność (invariant), o którą prosimy:** dla zamówienia płatnego `confirm` ustawia **zawsze i tylko** `CONFIRMED` (nie przeskakuje sam na `PROCESSING`, dopóki nie ma płatności). To pozwala FE mieć fallback (patrz §5) i utrzymuje jednoznaczność. Jeśli ten invariant nie jest gwarantowany, tym bardziej potrzebujemy `paymentRequired` jako jedynego wiarygodnego sygnału.

## 5. Kompatybilność wstecz i rollout

FE potraktuje pole jako **opcjonalne** i zdegraduje się bezpiecznie, gdy go nie ma (starszy BE):

- `paymentRequired === false` → ścieżka darmowa (pomiń płatność).
- `paymentRequired === true` → ścieżka płatna.
- `paymentRequired === undefined` (brak pola) → fallback do dzisiejszej heurystyki: przy `confirm` traktuj `status !== 'CONFIRMED'` jako „brak płatności"; przy ukrywaniu kroku 4 użyj `isPromoZeroOrder(order)`.

Dzięki temu BE może wdrożyć pole niezależnie, a FE zacznie z niego korzystać, gdy tylko się pojawi — bez twardej zależności czasowej („big bang").

## 6. Uwaga o momencie ustalenia ceny (żeby nie było niespodzianek)

Dziś rabat/cena końcowa liczą się w kroku `PATCH /payment-method`, a nie w `/orders/start`. Jeśli `paymentRequired` na `GET /orders/:id` ma być poprawne **zanim** ten krok się wykona, BE musi umieć wyznaczyć „czy dojdzie do 0 zł" już na podstawie zaaplikowanej promocji partnerskiej (kod partnera jest znany od `/orders/start`).

Jeśli to problematyczne, są dwie akceptowalne opcje (do wyboru przez BE):
- **A (preferowana):** `GET` liczy `paymentRequired` z aktualnie zaaplikowanej promocji partnerskiej — dostępne od `/orders/start`. Wtedy FE ukrywa krok 4 deterministycznie.
- **B (minimalna):** pole wiarygodne dopiero od momentu, gdy cena jest ustalona (po `/payment-method`), a wcześniej może być `true`/`null`. Wtedy krok 4 na FE i tak korzysta z fallbacku `isPromoZeroOrder`, a `paymentRequired` używamy przede wszystkim w `confirm`. Mniej czysto, ale rozwiązuje główny (niedeterministyczny) problem.

Rekomendacja: **A**, bo dopiero wtedy FE jest w pełni deklaratywny i pozbywamy się heurystyki rabatu z frontu.

## 7. Kryteria akceptacji

- [ ] `OrderResponseDto` (`GET /orders/:id`) zawiera `paymentRequired: boolean`.
- [ ] Odpowiedź `POST /orders/:id/confirm` zawiera `paymentRequired: boolean`, spójne z ostatnim stanem zamówienia.
- [ ] Dla zamówienia 0 zł + promocja partnerska: `paymentRequired === false`, a `confirm` nie tworzy płatności ani proformy (bez zmian w istniejącym zachowaniu — dokładamy tylko sygnał).
- [ ] Dla zamówienia płatnego (Stripe lub przelew): `paymentRequired === true`, `confirm` → `CONFIRMED`.
- [ ] Wartość jest deterministyczna i niezależna od tempa pipeline'u fulfillment (nie wyprowadzana ze statusu po `confirm`).
- [ ] (Opcja A) `paymentRequired` na `GET` jest poprawne już w stanie `DRAFT` na podstawie zaaplikowanej promocji partnerskiej.

## 8. Poza zakresem

- Zmiana samego zachowania `confirm` dla 0 zł (już działa — dokładamy wyłącznie jawny sygnał).
- Auto-defaultowanie metody płatności przez BE dla zamówień 0 zł — nadal FE ustawia `STRIPE_CHECKOUT` pod spodem (patrz `CC-534-purchase-process.md` §6).
- Obsługa PO zakupie (mail o karcie, karencja, portal) — patrz `CC-534.md`.
