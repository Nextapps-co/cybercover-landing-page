# CC-534 — Proces zakupu darmowego planu (0 zł): zmiany i docelowy flow (BE ↔ FE)

**Dla:** FE lead • **Zakres:** jak ma wyglądać proces zakupowy dla planu w 100% objętego promocją (cena 0 zł), co robi backend, a co musi zmienić frontend. **Powiązane dokumenty:** [`CC-534.md`](./CC-534.md) — endpointy portalu do zarządzania kartą PO zakupie; [`CC-534-be.md`](./CC-534-be.md) — kontrakt pola `paymentRequired`.

---

## 1. TL;DR

- Dla planu **0 zł** przy zakupie **nie ma płatności i nie podpinamy karty**. Backend już to obsługuje: `POST /confirm` dla zamówienia z ceną 0 + promocją od razu ustawia status **`PENDING_ALLOCATION`** (zamówienie potraktowane jak opłacone), bez Stripe i bez tworzenia płatności.
- **Zachowanie checkoutu na backendzie się NIE zmieniło** (0 zł → „confirm-as-paid" istniało wcześniej). Dołożyliśmy natomiast **jedno addytywne pole kontraktu — `paymentRequired: boolean`** (w `GET /api/orders/:orderId` i w odpowiedzi `confirm`), żeby FE nie musiał niczego zgadywać (patrz [`CC-534-be.md`](./CC-534-be.md)). Pozostała nowa logika backendu w CC-534 dotyczy etapu **PO zakupie** (przypomnienie o karcie, karencja, portal) — [`CC-534.md`](./CC-534.md).
- **Zmiany w procesie zakupowym są po stronie FE:** ukryć krok wyboru płatności, zmienić tytuł guzika, **nie wołać** endpointu tworzącego sesję Stripe, i przejść od razu na ekran potwierdzenia.

**Jak FE rozpozna „darmowy" vs „płatny": jednym polem `paymentRequired`** (jest w `GET /api/orders/:orderId` ORAZ w odpowiedzi `POST /confirm`):

- **`paymentRequired === false`** → nic do zapłaty → idź na ekran sukcesu, **nie** wołaj Stripe.
- **`paymentRequired === true`** → normalny flow płatny (wołaj sesję Stripe / proformę).

**Nie polegaj na `status`** (`PENDING_ALLOCATION` itd.) — fulfillment jest asynchroniczny, więc status bywa niedeterministyczny. `paymentRequired` to jedyny wiarygodny sygnał, spójny w obu endpointach.

---

## 2. Docelowy flow krok po kroku (Twoje 7 kroków)

Dla planu STANDARD 0 zł na 3 miesiące. Base URL: `{{API_HOST}}/api`.

### Krok 1 — wybór planu 0 zł + kod promocyjny

- **Endpoint:** `POST /api/orders/start` (jak dziś; z `partnerCode`, wybranym `catalogEntry`, `billingCycle`). Tworzy zamówienie w stanie `DRAFT`.
- **Zmiana:** brak. **BE:** bez zmian.
- Uwaga: kod 100% sprawia, że cena zejdzie do 0 — ale to policzy się dopiero w kroku 4 (patrz niżej).

### Krok 2 — dane firmy

- **Endpoint:** `PATCH /api/orders/:orderId/company-data`.
- **Zmiana:** brak. **BE:** bez zmian.

### Krok 3 — dane użytkownika

- **Endpoint:** `PATCH /api/orders/:orderId/personal-data`.
- **Zmiana:** brak. **BE:** bez zmian.
- (Krok „standardy operacyjne" `PATCH /api/orders/:orderId/operational-standards` jest **pomijany** dla planów bez ubezpieczyciela, np. STANDARD — jak dziś.)

### Krok 4 — wybór metody płatności → **znika z UI**

- **Endpoint:** `PATCH /api/orders/:orderId/payment-method`.
- **Zmiana (FE):** ekran wyboru metody **znika z widoku**. FE wie, że ma go ukryć, po **`paymentRequired === false`** z `GET /api/orders/:orderId` (to pole jest poprawne już od `DRAFT` — backend przewiduje 0 zł z zaaplikowanej promocji partnerskiej). FE **nadal woła `PATCH /payment-method` pod spodem**, ustawiając `paymentMethod = STRIPE_CHECKOUT` (bez pytania usera) — backend wymaga ustawionej metody, żeby dało się potwierdzić zamówienie.
- **Dlaczego nie da się tego po prostu „defaultować w backendzie":** rabat jest aplikowany **właśnie w tym kroku** (`/payment-method` przelicza kod promocyjny → dopiero wtedy total spada do 0). Backend nie „wie" o cenie 0 zł, zanim ten krok się nie wykona, dlatego metodę ustawia FE pod spodem, a nie auto-default BE. Z perspektywy usera krok i tak **nie istnieje**.
- **Ważne:** dla darmowego promo metodą MUSI być `STRIPE_CHECKOUT` (nie `BANK_TRANSFER`) — to ona kieruje późniejsze pobranie opłaty na kartę. Ustawienie `BANK_TRANSFER` skierowałoby klienta na ścieżkę proformy.
- **BE:** bez zmian (endpoint istnieje; checkout wymaga ustawionej metody, żeby dało się potwierdzić zamówienie).

### Krok 5 — guzik „Przejdź dalej z obowiązkiem zapłaty" → **inny tytuł**

- **Endpoint:** `POST /api/orders/:orderId/confirm`.
- **Zmiana (FE):** **tytuł guzika inny** — nie ma żadnej płatności. Sugerowane: „Zamawiam" / „Aktywuj darmowy plan" (bez „obowiązku zapłaty").
- **BE (istniejące, bez zmian):** dla ceny 0 zł + promocji `confirm` wykonuje ścieżkę „confirm-as-paid": od razu ustawia `PENDING_ALLOCATION`, **nie woła Stripe, nie tworzy płatności**.
- **Odpowiedź `POST /confirm` dla 0 zł:**

```json
{
  "orderId": "…",
  "status": "PENDING_ALLOCATION",
  "paymentMethod": "STRIPE_CHECKOUT",
  "confirmationToken": null,
  "paymentRequired": false
}
```

(**`paymentRequired: false`** = nie wołaj Stripe, idź na sukces. `confirmationToken` jest niepuste tylko dla `BANK_TRANSFER`; dla karty `null`. `status` może być `PENDING_ALLOCATION` albo — jeśli pipeline jest szybki — dalej; **nie interpretuj statusu**, użyj `paymentRequired`.)

### Krok 6 — call o link do płatności Stripe → **ten call ZNIKA (dla darmowego flow)**

- **Endpoint (dziś wołany):** `POST /api/sales-order/:orderId/stripe-checkout-session` → `{ sessionId, url, paymentId }`.
- **Zmiana (FE): dla darmowego zakupu FE tego endpointu NIE wywołuje.** Nie chcemy, żeby user podawał kartę na tym etapie.
- **Jak FE decyduje, że pominąć:** po **`paymentRequired === false`** z odpowiedzi `confirm` (krok 5) ⇒ pomiń Stripe i idź do kroku 7. (Endpoint `stripe-checkout-session` **zostaje** w systemie — jest nadal potrzebny dla planów **płatnych** oraz do późniejszego przechwytu karty w portalu — po prostu nie jest wołany w darmowym flow.)
- **BE:** bez zmian.

### Krok 7 — ekran potwierdzenia → **od razu, bez ekranu karty**

- **Zmiana (FE):** zaraz po `confirm` (bez przekierowania na Stripe) pokazujemy ekran końcowy: „Zamówienie przyjęte — za chwilę przyjdzie mail z aktywacją konta".
- **Skąd dane:** wystarczy odpowiedź z `confirm` (`orderId`, `status`) lub `GET /api/orders/:orderId`. **Nie** polegać na `GET /api/orders/:orderId/confirmation` — ten działa tylko dla `BANK_TRANSFER` + wystawionej proformy i dla darmowego flow zwróci błąd.

---

## 3. Porównanie: teraz vs docelowo (sekwencja)

**Teraz (błędnie, dla 0 zł):**

```
start → company-data → personal-data → [WYBÓR PŁATNOŚCI] → confirm
      → POST stripe-checkout-session → redirect na Stripe → user podaje kartę → ekran sukcesu
```

**Docelowo (0 zł):**

```
start → company-data → personal-data → (payment-method=STRIPE_CHECKOUT pod spodem, bez UI)
      → confirm  → paymentRequired=false → EKRAN SUKCESU
      (żadnego stripe-checkout-session, żadnej karty na tym etapie)
```

**Płatny plan (niezmieniony):**

```
… → payment-method (UI) → confirm → paymentRequired=true (status=CONFIRMED)
   → POST stripe-checkout-session → redirect na Stripe → płatność → sukces
```

---

## 4. Gdzie podział się przechwyt karty

Przeniesiony **w całości na etap PO zakupie** (opisane w [`CC-534.md`](./CC-534.md)):

- ~14 dni przed końcem promocji klient dostaje **mail z prośbą o podpięcie karty** (link **tylko do portalu**, bez Stripe).
- Kartę podpina/usuwa **z poziomu portalu klienta** (hostowany redirect na Stripe, bez bibliotek Stripe na FE).
- Po promocji: jest karta → automatyczne pobranie pełnej ceny; brak karty → okres karencji (przypomnienia) → po ~14 dniach **wygaśnięcie subskrypcji**.

Czyli darmowy zakup jest maksymalnie „lekki" (bez karty), a pobór opłaty jest odroczony i obsłużony osobno.

---

## 5. Podsumowanie: co jest FE, a co BE

| Krok                | Endpoint                                                          | Zmiana                                                           | Strona          |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | --------------- |
| 1. Start + kod      | `POST /api/orders/start`                                          | brak                                                             | —               |
| 2. Dane firmy       | `PATCH /api/orders/:id/company-data`                              | brak                                                             | —               |
| 3. Dane usera       | `PATCH /api/orders/:id/personal-data`                             | brak                                                             | —               |
| 4. Metoda płatności | `PATCH /api/orders/:id/payment-method`                            | ukryć krok w UI; FE ustawia `STRIPE_CHECKOUT` pod spodem         | **FE**          |
| 5. Potwierdzenie    | `POST /api/orders/:id/confirm`                                    | inny tytuł guzika (bez „obowiązku zapłaty"); reszta bez zmian    | **FE**          |
| 6. Link Stripe      | `POST /api/sales-order/:id/stripe-checkout-session`               | **nie wołać** dla 0 zł (rozpoznanie: `paymentRequired===false`)  | **FE**          |
| 7. Ekran sukcesu    | odpowiedź `confirm` / `GET /api/orders/:id`                       | od razu po confirm, bez ekranu karty; nie używać `/confirmation` | **FE**          |
| Kontrakt            | pole `paymentRequired` w `GET /orders/:id` + odpowiedzi `confirm` | **dodane** (addytywne, patrz `CC-534-be.md`)                     | **BE (gotowe)** |
| Po zakupie          | patrz `CC-534.md`                                                 | mail o karcie + portal karta + karencja                          | **BE (gotowe)** |

**Wniosek:** _zachowanie_ checkoutu na backendzie się nie zmieniło — działa poprawnie dla 0 zł. Jedyna zmiana kontraktu to **addytywne pole `paymentRequired`** (gotowe — patrz [`CC-534-be.md`](./CC-534-be.md)). Reszta do zrobienia jest po stronie FE (kroki 4–7). Nowa backendowa logika CC-534 to warstwa PO zakupie (`CC-534.md`).

---

## 6. Do decyzji (opcjonalne, do ustalenia z BE/FE)

- **Czy backend ma jednak auto-defaultować metodę płatności dla zamówień 0 zł**, żeby FE nie musiał wołać `PATCH /payment-method` pod spodem? Jest to możliwe, ale wymaga przesunięcia momentu aplikacji rabatu w checkoutcie (dziś rabat = 0 zł liczy się dopiero w tym kroku), więc jest to **nietrywialna zmiana w maszynie stanów zakupu**. Rekomendacja: zostawić jak jest (FE ustawia `STRIPE_CHECKOUT` pod spodem) — prostsze i bez ryzyka regresji. Jeśli mimo to chcecie „czysty" backendowy default — trzeba to zaplanować osobno.
- **Jawny dyskryminator `paymentRequired`: ✅ ZROBIONE** — dołożony do `GET /orders/:id` i odpowiedzi `confirm` (jedno źródło prawdy: domenowy `Order.requiresPayment()`; patrz [`CC-534-be.md`](./CC-534-be.md)). FE używa go zamiast interpretacji statusu.
