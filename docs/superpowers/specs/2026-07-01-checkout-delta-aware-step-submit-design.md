# Delta-aware submit w wizardzie zakupowym — request tylko gdy coś się zmieniło

**Data:** 2026-07-01
**Branch:** `fix/additional-checkout-flow-actions`
**Status:** projekt zatwierdzony, do implementacji.

---

## 1. Cel

Dziś każde kliknięcie „Dalej" w krokach danych bezwarunkowo strzela PATCH-em do backendu, nawet gdy użytkownik nic nie zmienił. Powoduje to dwa realne błędy:

1. **Podwójny zapis danych** — user wypełnia krok, przechodzi dalej, cofa się (żeby sprawdzić dane), znów „Dalej" → ten sam PATCH leci drugi raz (np. `PATCH /orders/:id/personal-data`).
2. **Twardy błąd na rabacie** — po zastosowaniu kodu rabatowego na `payment-method`, przejściu do `confirm`, cofnięciu i ponownym „Dalej" backend zwraca `409 „Discount already applied (H3: mutually exclusive)"`. Ponowne wywołanie `selectPaymentMethod` na zamówieniu, które ma już rabat, jest odrzucane **niezależnie od tego, czy FE dosyła `discountCode`** (zweryfikowane w kodzie: na re-entry `discountState` jest `idle`, więc FE wysyła samo `{paymentMethod}`, a mimo to leci `H3`).

Cel: **wyliczać deltę** — request do backendu tylko wtedy, gdy stan kroku faktycznie różni się od tego, co backend już ma. Gdy nic się nie zmieniło i krok jest już ukończony → tylko nawigacja dalej, bez PATCH-a.

Zakres: **wszystkie 4 kroki danych** (`company-data`, `personal-data`, `operational-standards`, `payment-method`). Poza zakresem: krok `confirm` (własny bfcache guard), backend, DTO (poza przyszłym polem dla usuwania rabatu — dopiero po kontrakcie BE).

## 2. Stan obecny (ustalenia z kodu — źródło prawdy)

- **Wzorzec kroku:** każdy `*Step.tsx` na mount czyta `orderId` z URL, waliduje `OrderSession`, robi `getOrder(id)` i hydratuje formularz ze stanu serwera (fallback: draft z `sessionStorage`). Przy „Dalej" (`onSubmit`/`handleSubmit`) waliduje i **bezwarunkowo** woła PATCH, po sukcesie nawiguje `navigateForward(...)`.
- **`checkoutProgress` na `OrderResponseDto`** (`CheckoutProgressDto`): `hasCompanyData`, `hasPersonalData`, `hasOperationalStandards`, `hasPaymentMethod`. To wiarygodny sygnał „serwer już ma dane tego kroku".
- **Co `OrderResponseDto` echo'uje** (do zbudowania baseline):
  - `companyData: CompanyDataResponseDto | null` — **wszystkie pola** (nip, name, street, city, postalCode, industry). Pełne porównanie możliwe.
  - `personalData: PersonalDataResponseDto | null` — firstName, lastName, email, phone. **Bez `consents`.**
  - `paymentMethod: PaymentMethod | null` — echo'owane.
  - `discount: OrderDiscountDto | null` — echo'uje `code` + `kind` + kwoty. Da się wykryć, że rabat jest już nałożony.
  - Odpowiedzi OS — **nie** echo'owane (tylko `eligibilityResult`).
- **Hydracja per krok (baseline):**
  - Company: `reset(fromOrder)` gdy `order.companyData` istnieje; `industry` mapowane `industryValueFromLabel`.
  - Personal: `reset(fromOrder)` z **`consents: {}`** (zgody nie są echo'owane → po powrocie checkboxy są puste).
  - OS: `answers` inicjalizowane z **draftu** (`getFormState('operational-standards')`), nie z serwera. Draft (sessionStorage) przechowuje odpowiedzi między nawigacjami w tej samej sesji.
  - Payment: `paymentMethod = o.paymentMethod ?? draft?.paymentMethod ?? ''`. `discountState` startuje `idle` (rabat NIE jest re-hydratowany z `order.discount`). Po submicie `clearDiscountCode()` czyści kod z URL/sessionStorage.
- **Kroki rhf vs ręczne:** `company-data` i `personal-data` używają `react-hook-form`; `operational-standards` i `payment-method` używają ręcznego `useState`.
- **Cele nawigacji „dalej"** (już w kodzie jako literały): company→`/checkout/personal-data`; personal→`stepToUrl(nextRequiredStep)` = `operational-standards` lub `payment-method` (per `osSkipped`); OS→`/checkout/payment-method`; payment→`/checkout/confirm`.
- **Rabat — brak endpointu usuwania.** `selectPaymentMethod(orderId, {paymentMethod, discountCode?})` nakłada rabat gdy podany `discountCode`. `validateDiscountCode` tylko podgląda ceny (nie mutuje). `handleRemoveDiscount` czyści wyłącznie stan lokalny — backend zachowuje rabat.
- **Konwencja testów:** vitest, testy kolokowane, pokrywają tylko `src/lib/` (czyste funkcje). Nowe komparatory muszą tam trafić.

## 3. Decyzje projektowe (zatwierdzone)

1. **Podejście A** — „pomiń gdy krok ukończony i nic się nie zmieniło". Baseline łapany na hydracji, delta liczona przy submicie. Odrzucone: podpis payloadu w sessionStorage (B — dubluje dane, rozjazd z serwerem), `rhf.isDirty` + ad-hoc (C — niespójne, pułapki proxy/obiektu consents).
2. **Zakres:** wszystkie 4 kroki danych.
3. **Confirm poza zakresem.**
4. **Usuwanie rabatu — seam odłożony na backend** (kontrakt w opracowaniu po stronie BE). Interim: „Usuń" wyłączony dla rabatu utrwalonego na serwerze; działa lokalnie dla rabatu jeszcze niewysłanego. Patrz §4.5 + §7.

## 4. Architektura zmian

```
state/checkout-delta.ts (NOWY, czyste komparatory + testy)
        │
        ├── CompanyDataStep.tsx     (guard w onSubmit)
        ├── PersonalDataStep.tsx    (guard w onSubmit)
        ├── OperationalStandardsStep.tsx (guard w handleSubmit)
        └── PaymentMethodStep.tsx   (guard w handleSubmit + intencja rabatu apply/keep/remove)
```

Zero zmian w `orders.ts`, `types/`, backendzie i mockach (poza ew. przyszłym polem usuwania rabatu — §7).

### 4.1. Nowy moduł `src/lib/state/checkout-delta.ts`

Czyste funkcje, bez zależności od React/DOM, w pełni testowalne. Kształt (finalne nazwy do dopracowania w planie):

```ts
// Znormalizowany snapshot per krok — baseline (serwer) vs current (formularz).
export interface CompanyDelta { nip: string; name: string; street: string; city: string; postalCode: string; industry: string }
export interface PersonalDelta { firstName: string; lastName: string; email: string; phoneDigits: string; consents: Record<string, boolean> }
export type OsDelta = Record<string, string>;
export interface PaymentDelta { paymentMethod: string; discountCode: string | null }

// Normalizacja: trim() na tekstach, normalizeNip() na NIP-ie, industry jako `value`
// (nie label), phoneDigits już bez prefiksu, consents/answers jako mapy.
export function companyChanged(baseline: CompanyDelta, current: CompanyDelta): boolean;
export function personalChanged(baseline: PersonalDelta, current: PersonalDelta): boolean;
export function osChanged(baseline: OsDelta, current: OsDelta): boolean;
export function paymentChanged(baseline: PaymentDelta, current: PaymentDelta): boolean;
```

Porównanie: normalizacja → deep-equal (kolejność kluczy w mapach nieistotna; puste stringi i brak klucza traktowane spójnie). Consents/answers: klucz nieobecny == `false`/pusty (żeby `{}` i „wszystkie false" nie dawały fałszywej delty).

### 4.2. Wpięcie guardu — kroki rhf (Company, Personal)

Baseline w `useRef`, ustawiany tuż po `reset(initial)` w efekcie hydracji:

```ts
const baselineRef = useRef<CompanyDelta | null>(null);
// ...w hydracji, po reset(initial):
baselineRef.current = toCompanyDelta(initial);
```

W `onSubmit`, **przed** walidacją i PATCH-em:

```ts
const complete = order?.checkoutProgress.hasCompanyData ?? false;
const current = toCompanyDelta(data);
if (complete && baselineRef.current && !companyChanged(baselineRef.current, current)) {
  navigateForward(`/checkout/personal-data?orderId=${encodeURIComponent(orderId)}`);
  return; // bez walidacji i bez PATCH-a — serwer już ma zwalidowane dane
}
// dalej: dotychczasowa walidacja + submitCompanyData(...) + navigateForward
```

Personal analogicznie — flaga `hasPersonalData`, cel `osSkipped ? payment-method : operational-standards` (liczony lokalnie, bez odpowiedzi PATCH-a; `osSkipped` jest w stanie komponentu).

> **Uwaga o zgodach:** baseline personal ma `consents: {}` (serwer nie echo'uje). Jeśli user nie ruszy checkboxów → `current.consents` też puste → brak delty → skip (serwer zachowuje zgody z pierwszego submitu). Jeśli user je zaznaczy ponownie → delta → PATCH. To dodatkowo naprawia UX: dziś po powrocie na personal zgody są puste i blokują „Dalej" walidacją; ze skipem user przechodzi bez re-klikania.

### 4.3. Wpięcie guardu — OS (ręczny stan)

Baseline = snapshot `answers` złapany na hydracji (po `setAnswers(draft.answers)` lub `{}`):

```ts
const baselineRef = useRef<OsDelta>({});
// w hydracji: baselineRef.current = draft?.answers ?? {};
```

W `handleSubmit`, przed walidacją:

```ts
const complete = order?.checkoutProgress.hasOperationalStandards ?? false;
if (complete && !osChanged(baselineRef.current, answers)) {
  navigateForward(`/checkout/payment-method?orderId=${encodeURIComponent(orderId)}`);
  return;
}
```

Bonus: po reloadzie (draft zniknął, `answers={}`, baseline `{}`) i przy ukończonym OS user przechodzi dalej zamiast utknąć na pustym formularzu z walidacją „odpowiedz na wszystko".

### 4.4. Wpięcie guardu — Payment (ręczny stan + intencja rabatu)

Baseline łapany na hydracji:

```ts
const baselineRef = useRef<PaymentDelta>({ paymentMethod: '', discountCode: null });
// w hydracji: baselineRef.current = { paymentMethod: o.paymentMethod ?? '', discountCode: o.discount?.code ?? null };
```

Intencja rabatu wyznacza `current.discountCode`:
- `discountState.status === 'applied'` → `discountState.code` (apply / zmiana kodu),
- rabat usunięty lokalnie (nowy stan `removed`, §4.5) → `null`,
- w innym wypadku (keep) → `baseline.discountCode` (bez zmian).

```ts
const complete = order?.checkoutProgress.hasPaymentMethod ?? false;
const current: PaymentDelta = { paymentMethod, discountCode: desiredDiscountCode };
if (complete && !paymentChanged(baselineRef.current, current)) {
  navigateForward(`/checkout/confirm?orderId=${encodeURIComponent(orderId)}`);
  return; // NIE wołamy selectPaymentMethod → brak H3
}
// dalej: dotychczasowe selectPaymentMethod(...) + navigateForward
```

To naprawia Bug #2: na re-entry `paymentMethod` = baseline, brak nowego kodu, brak usunięcia → `!changed` → skip.

### 4.5. Rabat — usuwanie (ZREALIZOWANE, CC-522 · 2026-07-01)

Kontrakt BE wylądował: **`DELETE /api/orders/{orderId}/discount`** (bez auth/body; 200 = pełny `OrderResponseDto` z `discount: null` + pełna cena; idempotentny; `409 DISCOUNT_REMOVAL_NOT_ALLOWED` dla rabatów partnerskich, `409 INVALID_ORDER_STATE` poza DRAFT, `404 ORDER_NOT_FOUND`). Interim „wyłączony Usuń" **zastąpiony** działającym usuwaniem:

- `http.ts` — nowy helper `apiDelete`. `orders.ts` — `removeDiscount(orderId): Promise<OrderResponseDto>`. `errors.ts`/`http.ts`/`translate.ts` — nowy kod `DISCOUNT_REMOVAL_NOT_ALLOWED`.
- `PaymentMethodStep` — utrwalony rabat `CODE_FLAT` re-hydratowany do `discountState: 'applied'` (widoczny + edytowalny). `handleRemoveDiscount`:
  - rabat **nieutrwalony** (`order.discount` puste) → tylko reset lokalny (zero requestów),
  - rabat **utrwalony** → `removeDiscount()` → `setOrder(updated)` + `baselineRef.discountCode = null` (delta widzi brak zmian → „Dalej" pomija PATCH).
- **Zmiana kodu** = Usuń (DELETE) → pole edytowalne → nowy kod (Zastosuj) → „Dalej" (`selectPaymentMethod` z nowym kodem; brak `H3`, bo `order.discount` już null).
- **Błędy:** `409 DISCOUNT_REMOVAL_NOT_ALLOWED`/`INVALID_ORDER_STATE` → rabat zostaje, `FormAlert` z przetłumaczonym komunikatem; `404` → `/cennik`.
- `DiscountCodeField` — prop `locked` (interim) → `removing` (blokada „Usuń" tylko na czas requestu, label „Usuwam…").

## 5. Przypadki brzegowe

- **Pierwsze przejście kroku** (`hasX === false`) → `complete=false` → zawsze normalny PATCH. Nigdy nie pomijamy wymaganego pierwszego zapisu.
- **User zmienia dane** → delta wykrywa → walidacja + PATCH jak dziś.
- **User „zmienia i cofa do tej samej wartości"** → porównujemy wartości (nie stan touched) → brak delty → skip. Pożądane.
- **Prefilled auth-aware kroki** → redirect przed renderem, nigdy nie docierają do submitu. Bez zmian.
- **Zmiana metody płatności przy utrwalonym rabacie** (Stripe↔przelew) → to realna zmiana → delta = true → `selectPaymentMethod` musi polecieć, a może zwrócić `H3`. Delta tego nie ukryje — patrz §7 (ta sama zależność BE co usuwanie rabatu).
- **`order` == null przy submicie** (błąd hydracji) → `complete` = false → nie ryzykujemy skipu; normalna ścieżka (lub istniejąca obsługa błędu).

## 6. Testy

- `src/lib/state/checkout-delta.test.ts` — jednostkowe dla `companyChanged`/`personalChanged`/`osChanged`/`paymentChanged`:
  - identyczny baseline vs current → `false`,
  - zmiana pojedynczego pola (w tym trim/normalizacja NIP, industry value vs label) → `true`,
  - consents/answers: `{}` vs „wszystkie false" → `false`; zaznaczenie jednego → `true`,
  - payment: ten sam kod → `false`; inny kod → `true`; `null` (remove) vs kod → `true`; zmiana metody → `true`.
- Testy komponentów są poza obecnym setupem vitest (brak `@vitejs/plugin-react`) → weryfikacja kroków manualna wg scenariuszy z §1 (oba bugi) + happy-path bez zmian.

## 7. Otwarte punkty (zależność od backendu)

1. ~~**Kontrakt usuwania rabatu**~~ — **ZREALIZOWANE** przez `DELETE /api/orders/:id/discount` (CC-522, 2026-07-01). Patrz §4.5.
2. **Zmiana metody płatności na zamówieniu z utrwalonym rabatem** (Stripe↔przelew bez dotykania rabatu) — **nadal otwarte.** Bug #2 pokazał, że `selectPaymentMethod` na zamówieniu z rabatem rzuca `H3` nawet bez `discountCode` w body; CC-522 tego nie zmienia (dotyczy tylko usuwania). Delta pomija ten call gdy nic się nie zmieniło, ale realna zmiana metody przy utrwalonym rabacie wciąż może zwrócić `H3`. Obejście do czasu decyzji BE: usuń rabat (DELETE) → zmień metodę → ew. nałóż rabat ponownie.

## 8. Czego NIE ruszamy

- Krok `confirm` (własny bfcache guard).
- Backend, DTO, mocki (poza przyszłym polem usuwania rabatu po kontrakcie).
- Zachowanie przy realnej zmianie danych — PATCH jak dziś.
