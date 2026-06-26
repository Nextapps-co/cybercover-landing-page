# FE integration guide — rozbicie proracji przy podniesieniu planu

**Ticket:** CC-353 (unified upgrade wizard / proracja)
**Status backendu:** gotowe (kontrakt API wdrożony, nie wymaga dalszych zmian po stronie backendu)
**Data:** 2026-06-26

---

## 1. TL;DR

Endpoint `GET /api/orders/{orderId}` zwraca teraz nowe pole **`proration`** — rozbicie proracji dla zamówień podniesienia planu (np. Standard → Optimum):

```jsonc
"proration": {
  "fullPrice": 59400,     // pełna cena nowego planu za cykl (netto, grosze)
  "credit": 14750,        // kredyt za niewykorzystany okres obecnego planu (netto, grosze, liczba dodatnia)
  "amountDueNow": 44650,  // do zapłaty teraz (netto, grosze) — to jest kwota, którą obciąży Stripe
  "currency": "PLN"
}
```

albo **`null`** dla zamówień, które nie są podniesieniem planu (zwykły zakup, odnowienie, reaktywacja).

**Co FE ma zrobić:** w boksie podsumowania zamówienia oraz na ekranie tuż przed przejściem do Stripe, dla zamówień upgrade renderować rozbicie z `proration` zamiast pełnej ceny planu z cennika. Dzięki temu kwota w boksie = kwota w Stripe.

---

## 2. Problem, który to rozwiązuje

Przy podniesieniu planu boks podsumowania i ostatni ekran przed Stripe pokazują **pełną cenę nowego planu** (cenę „z metki", pobieraną z cennika planów). Dopiero na ekranie Stripe pojawia się **niższa kwota** wynikająca z proracji (cena nowego planu minus kredyt za niewykorzystany okres obecnego planu). Klienci dziwią się, dlaczego cena nagle spada.

Backend zawsze znał prawidłową, niższą kwotę — teraz wystawia ją jawnie wraz z rozbiciem, żeby FE mógł ją pokazać od początku.

---

## 3. Gdzie są dane — bardzo ważne

| Endpoint                                     | Zwraca `proration`? | Uwaga                                                                |
| -------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `GET /api/orders/{orderId}`                  | ✅ TAK              | **jedyne** źródło rozbicia proracji                                  |
| `GET /api/orders/{orderId}/checkout-state`   | ❌ nie              | zwraca tylko postęp kroków (`progress`, `nextRequiredStep`), bez cen |
| `PATCH /api/orders/{orderId}/payment-method` | ❌ nie              | odpowiedź to checkout-state (bez cen)                                |
| `POST /api/orders/{orderId}/confirm`         | ❌ nie              | odpowiedź to potwierdzenie (orderId/status/paymentMethod)            |

**Wniosek:** dane do boksu (cena, rozbicie) bierzcie wyłącznie z `GET /api/orders/{orderId}`. Jeśli boks pobiera dziś cenę z endpointu cennika (`pricing-catalog`) — to jest właśnie przyczyna pełnej ceny. Dla zamówień upgrade przełączcie boks na `GET /api/orders/{orderId}`.

> Siatkę wyboru planów (`pricing-catalog`) możecie zostawić bez zmian — tam cena „z metki" planu jest OK. Zmiana dotyczy tylko **boksu podsumowania konkretnego zamówienia** i ekranu przed Stripe.

---

## 4. Pełny kontrakt odpowiedzi `GET /api/orders/{orderId}`

```jsonc
{
  "orderId": "ord_01HX...",
  "status": "DRAFT",
  "billingCycle": "MONTHLY",
  "paymentMethod": null,
  "checkoutProgress": {
    "hasCompanyData": true,
    "hasPersonalData": true,
    "hasOperationalStandards": true,
    "hasPaymentMethod": false,
  },
  "companyData": {
    /* ... */
  },
  "personalData": {
    /* ... */
  },
  "lines": [{ "lineId": "line_...", "catalogEntryId": "ce_...", "planName": "", "priceNet": 44650 }],
  "totalPriceNet": 44650, // dla zamówienia upgrade === proration.amountDueNow
  "currency": "PLN",
  "discount": null,
  "proration": {
    // ⬅️ NOWE
    "fullPrice": 59400,
    "credit": 14750,
    "amountDueNow": 44650,
    "currency": "PLN",
  },
  "createdAt": "2026-06-26T10:00:00.000Z",
}
```

### Pola `proration`

| Pole           | Typ    | Znaczenie                                                                                               |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `fullPrice`    | number | Pełna cena nowego planu za cały cykl. **Netto, w groszach.**                                            |
| `credit`       | number | Kredyt za niewykorzystany okres obecnego planu. **Netto, w groszach, liczba dodatnia.**                 |
| `amountDueNow` | number | Do zapłaty teraz = `fullPrice − credit`. **Netto, w groszach.** To jest kwota wysyłana do sesji Stripe. |
| `currency`     | string | Zawsze `"PLN"`.                                                                                         |

Reguły:

- `proration` jest **`null`** dla zamówień innych niż podniesienie planu (zwykły zakup / odnowienie / reaktywacja). Wtedy renderujcie boks jak dotychczas (np. z `totalPriceNet`).
- Gdy `proration != null`: `proration.amountDueNow === totalPriceNet` (ta sama liczba; `proration` dokłada tylko rozbicie, żeby wyjaśnić skąd wynik).
- Wszystkie kwoty są **netto** i **w groszach** — identyczna konwencja jak istniejące `totalPriceNet` i `discount.*`.

---

## 5. Jak renderować boks (upgrade)

Gdy `order.proration != null`, pokażcie 3 linie:

```
Pełna cena planu          594,00 zł      ← proration.fullPrice / 100
Kredyt za obecny plan    −147,50 zł      ← proration.credit / 100 (ze znakiem minus)
──────────────────────────────────
Do zapłaty teraz          446,50 zł      ← proration.amountDueNow / 100
```

- Formatowanie: `grosze / 100`, dwa miejsca po przecinku, waluta z `proration.currency`.
- Linię `credit` pokazujcie ze znakiem minus (wartość w API jest dodatnia — to FE dodaje minus jako „pomniejszenie").
- `amountDueNow` to liczba, którą obciąży Stripe — powinna się zgadzać 1:1 z ekranem Stripe.

### Przykład liczbowy (Standard → Optimum, miesięcznie, w połowie cyklu)

| Pole API (grosze)      | Wartość | Wyświetlane  |
| ---------------------- | ------- | ------------ |
| `fullPrice` = 59400    |         | `594,00 zł`  |
| `credit` = 14750       |         | `−147,50 zł` |
| `amountDueNow` = 44650 |         | `446,50 zł`  |

---

## 6. Kiedy pobierać / odświeżać

1. **Po `POST /api/orders/start`** (odpowiedź ma `orderType: "PLAN_UPGRADE"`): od razu `GET /api/orders/{orderId}` — `proration` jest już wypełnione na DRAFT-cie, więc boks pokazuje właściwą kwotę od pierwszego ekranu wizardu.
2. **Po `PATCH /api/orders/{orderId}/payment-method`**: ponownie `GET /api/orders/{orderId}`, bo kwota mogła się przeliczyć (np. po wpisaniu kodu rabatowego albo po zmianie daty). Odpowiedź samego `payment-method` nie zawiera cen.
3. **Przed przekierowaniem do Stripe** (`POST /api/sales-order/{orderId}/stripe-checkout-session`): wyświetlana kwota powinna pochodzić z ostatniego `GET /api/orders/{orderId}` → `proration.amountDueNow`.

---

## 7. Netto vs brutto (VAT)

`proration.*` (jak i `totalPriceNet`) to kwoty **netto**. Stripe dolicza VAT 23% na swoim ekranie. To jest dotychczasowe zachowanie — jeśli boks pokazuje dziś kwoty netto, nic się nie zmienia. Jeśli chcecie pokazywać brutto, przeliczcie po stronie FE (`× 1.23`) tak samo, jak robicie to dla pozostałych zamówień. Backend celowo trzyma jedną kanoniczną kwotę netto.

---

## 8. Przypadki brzegowe

- **`proration === null` mimo że to upgrade** — rzadki, defensywny fallback (np. brak danych poprzedniego zamówienia). Potraktujcie jak zwykłe zamówienie: pokażcie `totalPriceNet` jako kwotę do zapłaty, bez rozbicia. Nie zakładajcie, że upgrade zawsze ma `proration`.
- **Kod rabatowy + proracja jednocześnie** — wtedy w odpowiedzi jest również obiekt `discount` (jak dotychczas), a `amountDueNow` już uwzględnia i kredyt proracyjny, i rabat. Rozbicie `proration` pokazuje tylko `fullPrice` i `credit`; rabat prezentujcie tak jak w pozostałych flow (z `discount`). `amountDueNow` pozostaje wiążącą kwotą do zapłaty.
- **Nie polegajcie na `order.status` ani typie** do decyzji o pokazaniu rozbicia — wystarczy `proration != null`.

---

## 9. Checklist dla FE

- [ ] Boks podsumowania zamówienia w wizardzie upgrade czyta `GET /api/orders/{orderId}`, nie cennik.
- [ ] Gdy `proration != null` → render 3 linii (`fullPrice` / `−credit` / `amountDueNow`).
- [ ] Gdy `proration == null` → dotychczasowe renderowanie (`totalPriceNet`).
- [ ] Kwoty: `grosze / 100`, 2 miejsca po przecinku, waluta z odpowiedzi.
- [ ] Ekran przed Stripe pokazuje `proration.amountDueNow` (== to, co naliczy Stripe).
- [ ] Odświeżenie `GET /api/orders/{orderId}` po `PATCH /payment-method` (np. po rabacie).
- [ ] Obsłużony fallback `proration == null` dla upgrade.

---

## 10. Priorytety

| Priorytet    | Zmiana                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRITICAL** | Boks i ekran przed Stripe (upgrade) renderują kwotę z `GET /api/orders/{orderId}` (`proration` / `totalPriceNet`) zamiast pełnej ceny z cennika. To eliminuje „skok ceny" widziany przez klientów. |
| **HIGH**     | Render 3-liniowego rozbicia z `proration` (pełna cena → −kredyt → do zapłaty teraz).                                                                                                               |
| **MEDIUM**   | Odświeżanie `GET /api/orders/{orderId}` po `PATCH /payment-method`.                                                                                                                                |
| **LOW**      | Decyzja netto/brutto na boksie (jeśli ma się różnić od dotychczasowej).                                                                                                                            |

---

## 11. Szybki test akceptacyjny

1. Zaloguj się jako klient z aktywną subskrypcją (np. Standard).
2. Rozpocznij upgrade na wyższy plan (Optimum) — `POST /api/orders/start` zwróci `orderType: "PLAN_UPGRADE"` + `orderId`.
3. `GET /api/orders/{orderId}` → odpowiedź zawiera `proration` z `amountDueNow` < `fullPrice`.
4. Boks pokazuje rozbicie i `amountDueNow`.
5. Przejdź do Stripe — kwota na ekranie Stripe = `amountDueNow` (+ VAT). Brak „skoku" ceny.
