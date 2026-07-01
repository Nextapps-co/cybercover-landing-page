# Delta-aware submit w wizardzie zakupowym — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klik „Dalej" w krokach danych wysyła PATCH do backendu tylko gdy stan kroku faktycznie różni się od tego, co backend już ma; gdy nic się nie zmieniło i krok jest ukończony → sama nawigacja bez requestu.

**Architecture:** Nowy czysty moduł komparatorów `src/lib/state/checkout-delta.ts` (testowany vitestem). Każdy z 4 kroków łapie na hydracji „baseline" (stan serwera) do `useRef`, a w handlerze submitu — przed walidacją i PATCH-em — porównuje baseline z bieżącymi wartościami: `if (checkoutProgress.hasX && !changed) → navigateForward bez PATCH-a`.

**Tech Stack:** Astro + React islands, react-hook-form (kroki 1-2), ręczny `useState` (kroki 3-4), vitest + happy-dom, TypeScript.

## Global Constraints

- UI/treść po polsku, prosto dla właścicieli firm bez działu IT.
- Money zawsze w groszach (minor units) jako `number` + `currency: 'PLN'`.
- **Bez zmian w backendzie, w DTO (`types/order.ts`) i w mockach** (poza przyszłym polem usuwania rabatu — poza tym planem, patrz spec §7).
- **Commity wykonuje user** — Claude NIE odpala żadnych komend `git` w tym repo. Punkty commitu w planie to sugestie dla usera.
- Testy pisane tylko dla `src/lib/` (czyste funkcje). Weryfikacja testów/typecheck **zbiorczo na końcu** (Task 7), nie po każdym kroku.
- Path alias `@` → `./src` działa w vitest; testy kolokowane jako `*.test.ts`, import stylem `import { describe, it, expect } from 'vitest';`.
- Baseline repo: ~17 pre-existing test failures (catalog mock) + ~69 `astro check` errors są znane i niezwiązane z tą pracą.

---

### Task 1: Moduł komparatorów `checkout-delta.ts` + testy

**Files:**
- Create: `src/lib/state/checkout-delta.ts`
- Test: `src/lib/state/checkout-delta.test.ts`

**Interfaces:**
- Consumes: `normalizeNip` z `src/lib/validation/nip.ts` (`(input: string) => string`, usuwa spacje/myślniki).
- Produces:
  - `interface CompanyDelta { nip; name; street; city; postalCode; industry: string }`
  - `interface PersonalDelta { firstName; lastName; email; phoneDigits: string; consents: Record<string, boolean> }`
  - `type OsDelta = Record<string, string>`
  - `interface PaymentDelta { paymentMethod: string; discountCode: string | null }`
  - `companyChanged(baseline: CompanyDelta, current: CompanyDelta): boolean`
  - `personalChanged(baseline: PersonalDelta, current: PersonalDelta): boolean`
  - `osChanged(baseline: OsDelta, current: OsDelta): boolean`
  - `paymentChanged(baseline: PaymentDelta, current: PaymentDelta): boolean`

Uwaga: kształty `CompanyDelta`/`PersonalDelta`/`OsDelta`/`PaymentDelta` są strukturalnie zgodne z, odpowiednio, `CompanyDataFormValues`, `PersonalDataFormValues`, `Record<string,string>` (answers) i obiektem `{paymentMethod, discountCode}` — kroki przekazują swoje wartości formularza wprost, bez mapperów.

- [ ] **Step 1: Napisz plik testów** (`src/lib/state/checkout-delta.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  companyChanged,
  personalChanged,
  osChanged,
  paymentChanged,
  type CompanyDelta,
  type PersonalDelta,
  type PaymentDelta,
} from './checkout-delta';

const company = (o: Partial<CompanyDelta> = {}): CompanyDelta => ({
  nip: '1234567890', name: 'ACME', street: 'ul. Testowa 1', city: 'Warszawa', postalCode: '00-001', industry: 'it', ...o,
});

describe('companyChanged', () => {
  it('false gdy identyczne', () => {
    expect(companyChanged(company(), company())).toBe(false);
  });
  it('false gdy różnica tylko w formatowaniu NIP i whitespace', () => {
    expect(companyChanged(company({ nip: '1234567890', name: 'ACME' }), company({ nip: '123-456-78-90', name: '  ACME  ' }))).toBe(false);
  });
  it('true gdy zmiana pola', () => {
    expect(companyChanged(company(), company({ city: 'Kraków' }))).toBe(true);
  });
  it('true gdy zmiana industry (value)', () => {
    expect(companyChanged(company({ industry: 'it' }), company({ industry: 'retail' }))).toBe(true);
  });
});

const personal = (o: Partial<PersonalDelta> = {}): PersonalDelta => ({
  firstName: 'Jan', lastName: 'Kowalski', email: 'jan@firma.pl', phoneDigits: '123456789', consents: {}, ...o,
});

describe('personalChanged', () => {
  it('false gdy identyczne', () => {
    expect(personalChanged(personal(), personal())).toBe(false);
  });
  it('false gdy consents {} vs same wartości false', () => {
    expect(personalChanged(personal({ consents: {} }), personal({ consents: { a: false, b: false } }))).toBe(false);
  });
  it('true gdy zaznaczono zgodę', () => {
    expect(personalChanged(personal({ consents: {} }), personal({ consents: { a: true } }))).toBe(true);
  });
  it('true gdy zmiana emaila (po trim)', () => {
    expect(personalChanged(personal({ email: 'jan@firma.pl' }), personal({ email: 'inny@firma.pl' }))).toBe(true);
  });
  it('false gdy email różni się tylko whitespace', () => {
    expect(personalChanged(personal({ email: 'jan@firma.pl' }), personal({ email: ' jan@firma.pl ' }))).toBe(false);
  });
});

describe('osChanged', () => {
  it('false gdy identyczne odpowiedzi', () => {
    expect(osChanged({ Q1: 'YES', Q2: 'NO' }, { Q1: 'YES', Q2: 'NO' })).toBe(false);
  });
  it('false gdy {} vs {} (reload przy ukończonym kroku)', () => {
    expect(osChanged({}, {})).toBe(false);
  });
  it('true gdy zmiana odpowiedzi', () => {
    expect(osChanged({ Q1: 'YES' }, { Q1: 'NO' })).toBe(true);
  });
  it('true gdy dodano odpowiedź', () => {
    expect(osChanged({ Q1: 'YES' }, { Q1: 'YES', Q2: 'YES' })).toBe(true);
  });
});

const payment = (o: Partial<PaymentDelta> = {}): PaymentDelta => ({ paymentMethod: 'STRIPE_CHECKOUT', discountCode: null, ...o });

describe('paymentChanged', () => {
  it('false gdy ta sama metoda i brak rabatu', () => {
    expect(paymentChanged(payment(), payment())).toBe(false);
  });
  it('false gdy ten sam kod rabatowy', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: 'LATO10' }))).toBe(false);
  });
  it('true gdy zmiana metody płatności', () => {
    expect(paymentChanged(payment({ paymentMethod: 'STRIPE_CHECKOUT' }), payment({ paymentMethod: 'BANK_TRANSFER' }))).toBe(true);
  });
  it('true gdy inny kod rabatowy', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: 'ZIMA20' }))).toBe(true);
  });
  it('true gdy usunięto rabat (kod → null)', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: null }))).toBe(true);
  });
});
```

- [ ] **Step 2: Napisz implementację** (`src/lib/state/checkout-delta.ts`)

```ts
// Czyste komparatory „czy krok się zmienił względem stanu serwera".
// Używane przez kroki wizardu do pomijania redundantnych PATCH-y (delta-aware submit).
import { normalizeNip } from '../validation/nip';

export interface CompanyDelta {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

export interface PersonalDelta {
  firstName: string;
  lastName: string;
  email: string;
  phoneDigits: string;
  consents: Record<string, boolean>;
}

export type OsDelta = Record<string, string>;

export interface PaymentDelta {
  paymentMethod: string;
  discountCode: string | null;
}

function normText(v: string | null | undefined): string {
  return (v ?? '').trim();
}

// Porównuje mapy boolean traktując brak klucza jak `false`
// (żeby {} i „wszystkie false" były równe).
function boolMapChanged(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if ((a?.[k] === true) !== (b?.[k] === true)) return true;
  }
  return false;
}

// Porównuje mapy string traktując brak klucza i '' (po trim) jak równoważne.
function strMapChanged(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (normText(a?.[k]) !== normText(b?.[k])) return true;
  }
  return false;
}

export function companyChanged(baseline: CompanyDelta, current: CompanyDelta): boolean {
  return (
    normalizeNip(normText(baseline.nip)) !== normalizeNip(normText(current.nip)) ||
    normText(baseline.name) !== normText(current.name) ||
    normText(baseline.street) !== normText(current.street) ||
    normText(baseline.city) !== normText(current.city) ||
    normText(baseline.postalCode) !== normText(current.postalCode) ||
    normText(baseline.industry) !== normText(current.industry)
  );
}

export function personalChanged(baseline: PersonalDelta, current: PersonalDelta): boolean {
  return (
    normText(baseline.firstName) !== normText(current.firstName) ||
    normText(baseline.lastName) !== normText(current.lastName) ||
    normText(baseline.email) !== normText(current.email) ||
    normText(baseline.phoneDigits) !== normText(current.phoneDigits) ||
    boolMapChanged(baseline.consents ?? {}, current.consents ?? {})
  );
}

export function osChanged(baseline: OsDelta, current: OsDelta): boolean {
  return strMapChanged(baseline ?? {}, current ?? {});
}

export function paymentChanged(baseline: PaymentDelta, current: PaymentDelta): boolean {
  const bc = baseline.discountCode == null ? null : baseline.discountCode.trim();
  const cc = current.discountCode == null ? null : current.discountCode.trim();
  return baseline.paymentMethod !== current.paymentMethod || bc !== cc;
}
```

- [ ] **Step 3: (Commit — wykonuje user)** np. `feat(checkout): add delta comparators for step submit`

---

### Task 2: Guard w kroku Company

**Files:**
- Modify: `src/components/checkout/CompanyDataStep.tsx`

**Interfaces:**
- Consumes: `companyChanged` z Task 1; istniejące `navigateForward`, `order` (stan), `order.checkoutProgress.hasCompanyData`.
- Produces: nic dla innych tasków.

- [ ] **Step 1: Dodaj importy**

W linii 1 dodaj `useRef`:
```ts
import { useEffect, useRef, useState } from 'react';
```
Po istniejących importach walidacji (obok linii 16) dodaj:
```ts
import { companyChanged } from '../../lib/state/checkout-delta';
```

- [ ] **Step 2: Dodaj baseline ref**

Tuż po `const [osSkipped, setOsSkipped] = useState(false);` (linia 45):
```ts
const baselineRef = useRef<CompanyDataFormValues | null>(null);
```

- [ ] **Step 3: Zapamiętaj baseline na hydracji**

Zastąp blok (linie 99–111):
```ts
        if (order.companyData) {
          reset({
            nip: order.companyData.nip ?? '',
            name: order.companyData.name ?? '',
            street: order.companyData.street ?? '',
            city: order.companyData.city ?? '',
            postalCode: order.companyData.postalCode ?? '',
            industry: industryValueFromLabel(order.companyData.industry ?? '') || order.companyData.industry || '',
          });
        } else {
          const draft = getFormState<CompanyDataFormValues>('company-data');
          if (draft) reset(draft);
        }
```
na:
```ts
        let initial: CompanyDataFormValues = INITIAL_VALUES;
        if (order.companyData) {
          initial = {
            nip: order.companyData.nip ?? '',
            name: order.companyData.name ?? '',
            street: order.companyData.street ?? '',
            city: order.companyData.city ?? '',
            postalCode: order.companyData.postalCode ?? '',
            industry: industryValueFromLabel(order.companyData.industry ?? '') || order.companyData.industry || '',
          };
        } else {
          const draft = getFormState<CompanyDataFormValues>('company-data');
          if (draft) initial = draft;
        }
        reset(initial);
        baselineRef.current = initial;
```

- [ ] **Step 4: Dodaj guard w onSubmit**

Zaraz po `if (!orderId) return;` (linia 136), przed `// Run our validators`:
```ts
    const complete = order?.checkoutProgress.hasCompanyData ?? false;
    if (complete && baselineRef.current && !companyChanged(baselineRef.current, data)) {
      // Nic się nie zmieniło od hydracji, a backend ma już te dane — pomiń PATCH.
      navigateForward(`/checkout/personal-data?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
```

- [ ] **Step 5: (Commit — wykonuje user)** np. `feat(checkout): skip company PATCH when unchanged`

---

### Task 3: Guard w kroku Personal

**Files:**
- Modify: `src/components/checkout/PersonalDataStep.tsx`

**Interfaces:**
- Consumes: `personalChanged` z Task 1; istniejące `navigateForward`, `osSkipped` (stan), `order.checkoutProgress.hasPersonalData`.

- [ ] **Step 1: Dodaj importy**

Linia 1 → dodaj `useRef`:
```ts
import { useEffect, useRef, useState } from 'react';
```
Obok importu walidacji personal-data (linia 18) dodaj:
```ts
import { personalChanged } from '../../lib/state/checkout-delta';
```

- [ ] **Step 2: Dodaj baseline ref**

Po `const [osSkipped, setOsSkipped] = useState(false);` (linia 47):
```ts
const baselineRef = useRef<PersonalDataFormValues | null>(null);
```

- [ ] **Step 3: Zapamiętaj baseline na hydracji**

Zaraz po `reset(initial);` (linia 99) dodaj:
```ts
        baselineRef.current = initial;
```

- [ ] **Step 4: Dodaj guard w onSubmit**

Zaraz po `if (!orderId) return;` (linia 137), przed `const fieldErrors = validatePersonalData(...)`:
```ts
    const complete = order?.checkoutProgress.hasPersonalData ?? false;
    if (complete && baselineRef.current && !personalChanged(baselineRef.current, data)) {
      // Serwer ma już te dane osobowe (w tym zgody) i nic nie ruszono — pomiń PATCH.
      const target = osSkipped ? 'payment-method' : 'operational-standards';
      navigateForward(`/checkout/${target}?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
```

- [ ] **Step 5: (Commit — wykonuje user)** np. `fix(checkout): skip personal PATCH when unchanged (double-submit bug)`

---

### Task 4: Guard w kroku Operational Standards

**Files:**
- Modify: `src/components/checkout/OperationalStandardsStep.tsx`

**Interfaces:**
- Consumes: `osChanged` z Task 1; istniejące `navigateForward`, `answers` (stan), `order.checkoutProgress.hasOperationalStandards`.

- [ ] **Step 1: Dodaj importy**

Linia 1 → dodaj `useRef`:
```ts
import { useEffect, useId, useRef, useState } from 'react';
```
Obok importu `validateOperationalStandards` (linia 14) dodaj:
```ts
import { osChanged } from '../../lib/state/checkout-delta';
```

- [ ] **Step 2: Dodaj baseline ref**

Po `const [eligibilityWarning, setEligibilityWarning] = useState<EligibilityContributionDto[] | null>(null);` (linia 79):
```ts
const baselineRef = useRef<Record<string, string>>({});
```

- [ ] **Step 3: Zapamiętaj baseline na hydracji**

Zastąp (linie 123–124):
```ts
        const draft = getFormState<{ answers: Record<string, string> }>('operational-standards');
        if (draft?.answers) setAnswers(draft.answers);
```
na:
```ts
        const draft = getFormState<{ answers: Record<string, string> }>('operational-standards');
        if (draft?.answers) setAnswers(draft.answers);
        baselineRef.current = draft?.answers ?? {};
```

- [ ] **Step 4: Dodaj guard w handleSubmit**

Zaraz po `if (!orderId || !schema) return;` (linia 152), przed `const regularQuestions = ...`:
```ts
    const complete = order?.checkoutProgress.hasOperationalStandards ?? false;
    if (complete && !osChanged(baselineRef.current, answers)) {
      // Odpowiedzi bez zmian, a backend ma już wypełniony krok OS — pomiń PATCH.
      navigateForward(`/checkout/payment-method?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
```

- [ ] **Step 5: (Commit — wykonuje user)** np. `feat(checkout): skip operational-standards PATCH when unchanged`

---

### Task 5: Guard w kroku Payment Method

**Files:**
- Modify: `src/components/checkout/PaymentMethodStep.tsx`

**Interfaces:**
- Consumes: `paymentChanged`, `type PaymentDelta` z Task 1; istniejące `navigateForward`, `paymentMethod`/`discountState` (stan), `order.checkoutProgress.hasPaymentMethod`, `order.discount`, `order.paymentMethod`.
- Produces: `baselineRef` (używany też w Task 6).

- [ ] **Step 1: Dodaj importy**

Linia 1 → dodaj `useRef`:
```ts
import { useEffect, useRef, useState } from 'react';
```
Obok importu typów order (linia 21) dodaj:
```ts
import { paymentChanged, type PaymentDelta } from '../../lib/state/checkout-delta';
```

- [ ] **Step 2: Dodaj baseline ref**

Po `const [submitting, setSubmitting] = useState(false);` (linia 48):
```ts
const baselineRef = useRef<PaymentDelta>({ paymentMethod: '', discountCode: null });
```

- [ ] **Step 3: Zapamiętaj baseline na hydracji**

Zaraz po `setPaymentMethod(o.paymentMethod ?? draft?.paymentMethod ?? '');` (linia 87) dodaj:
```ts
        baselineRef.current = { paymentMethod: o.paymentMethod ?? '', discountCode: o.discount?.code ?? null };
```

- [ ] **Step 4: Dodaj guard w handleSubmit**

Zaraz po bloku `if (!paymentMethod) { ... return; }` (kończy się linią 146), przed `setSubmitting(true);`:
```ts
    const desiredDiscountCode =
      discountState.status === 'applied' ? discountState.code : baselineRef.current.discountCode;
    const complete = order?.checkoutProgress.hasPaymentMethod ?? false;
    if (complete && !paymentChanged(baselineRef.current, { paymentMethod, discountCode: desiredDiscountCode })) {
      // Metoda i rabat bez zmian, a backend ma już wybraną płatność — pomiń PATCH.
      // To eliminuje 409 „Discount already applied (H3)" przy cofnij→dalej.
      navigateForward(`/checkout/confirm?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
```

- [ ] **Step 5: (Commit — wykonuje user)** np. `fix(checkout): skip payment PATCH when unchanged (discount H3 bug)`

---

### Task 6: Rabat — pokaż utrwalony rabat i wyłącz „Usuń" (interim, spec §4.5)

Cel: gdy zamówienie ma już nałożony kod rabatowy (`CODE_FLAT`), po powrocie na payment-method pokaż go jako zaaplikowany (dziś pole jest błędnie puste), a przycisk „Usuń" wyłącz — realne zdjęcie rabatu czeka na kontrakt BE (spec §7).

**Files:**
- Modify: `src/components/checkout/DiscountCodeField.tsx`
- Modify: `src/components/checkout/PaymentMethodStep.tsx`

**Interfaces:**
- Consumes: `order.discount` (`OrderDiscountDto`: `code`, `kind`, `originalAmount`, `priceAfterDiscount`), `DiscountState` z `DiscountCodeField`.
- Produces: prop `locked?: boolean` na `DiscountCodeField`.

- [ ] **Step 1: Dodaj prop `locked` do DiscountCodeField**

W `Props` (po `initialCode`, linia 16) dodaj:
```ts
  /** Rabat utrwalony na zamówieniu — pokazujemy jako zaaplikowany, ale bez możliwości zdjęcia (brak endpointu BE). */
  locked?: boolean;
```
Zmień sygnaturę (linia 26):
```ts
export function DiscountCodeField({ state, onApply, onRemove, partnerActive, initialCode, locked }: Props) {
```

- [ ] **Step 2: Wyłącz „Usuń" gdy locked + dodaj notkę**

Zastąp przycisk „Usuń" (linie 76–83):
```ts
        {isApplied ? (
          <button
            type="button"
            onClick={handleRemove}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-4 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
          >
            Usuń
          </button>
        ) : (
```
na:
```ts
        {isApplied ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={locked}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-4 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Usuń
          </button>
        ) : (
```
Po bloku „Rabat zaaplikowany…" (po linii 99, przed blokiem `state.status === 'error'`) dodaj:
```ts
      {isApplied && locked && (
        <p className="mt-2 text-xs text-[#6B6965]">
          Aby zmienić lub usunąć rabat, rozpocznij zamówienie od nowa.
        </p>
      )}
```

- [ ] **Step 3: Dodaj stan `discountLocked` w PaymentMethodStep**

Po `const [storedDiscountCode, setStoredDiscountCode] = useState<string | null>(null);` (linia 46):
```ts
const [discountLocked, setDiscountLocked] = useState(false);
```

- [ ] **Step 4: Re-hydratuj utrwalony rabat na mount**

Zastąp blok (linie 88–91):
```ts
        if (!hasPartnerDiscount(o)) {
          const stored = getDiscountCodeFromUrl();
          if (stored) setStoredDiscountCode(stored);
        }
```
na:
```ts
        if (o.discount && o.discount.kind === 'CODE_FLAT') {
          // Rabat kodowy już utrwalony na zamówieniu (np. po cofnij→dalej) — pokaż go jako
          // zaaplikowany i zablokuj zdjęcie (brak endpointu usuwania po stronie BE).
          setDiscountState({
            status: 'applied',
            code: o.discount.code,
            originalPriceNet: o.discount.originalAmount,
            discountedPriceNet: o.discount.priceAfterDiscount,
          });
          setDiscountLocked(true);
        } else if (!hasPartnerDiscount(o)) {
          const stored = getDiscountCodeFromUrl();
          if (stored) setStoredDiscountCode(stored);
        }
```

- [ ] **Step 5: Przekaż `locked` do DiscountCodeField**

W JSX (obok `initialCode={storedDiscountCode}`, linia 256) dodaj prop:
```ts
                locked={discountLocked}
```

- [ ] **Step 6: (Commit — wykonuje user)** np. `feat(checkout): show persisted discount as applied, lock removal (interim)`

---

### Task 7: Weryfikacja (zbiorczo na końcu)

**Files:** brak zmian — tylko uruchomienie.

- [ ] **Step 1: Uruchom testy jednostkowe delty**

Run: `npm run test:run -- src/lib/state/checkout-delta.test.ts`
Expected: PASS (wszystkie asercje z Task 1).

- [ ] **Step 2: Pełny przebieg testów (kontrola regresji)**

Run: `npm run test:run`
Expected: brak NOWYCH failures względem baseline (~17 znanych fail w catalog mock — patrz Global Constraints). Nowy plik `checkout-delta.test.ts` w całości PASS.

- [ ] **Step 3: Typecheck**

Run: `npx astro check`
Expected: brak NOWYCH errorów w dotkniętych plikach (`checkout-delta.ts`, `*Step.tsx`, `DiscountCodeField.tsx`) względem ~69 znanych baseline'owych.

- [ ] **Step 4: Weryfikacja manualna scenariuszy (dev, `PUBLIC_USE_MOCK_ORDERS=true`)**

1. **Bug #1 (podwójny personal PATCH):** company → personal (wypełnij, Dalej) → cofnij na personal → Dalej bez edycji. Oczekiwane: w Network **brak** drugiego `PATCH /orders/:id/personal-data`, przejście dalej.
2. **Bug #2 (discount H3):** przejdź do payment → wpisz kod, Zastosuj → Dalej → confirm → Cofnij → Dalej. Oczekiwane: **brak** `PATCH /orders/:id/payment-method` i **brak** błędu „Discount already applied", przejście na confirm. Na payment po powrocie rabat widoczny jako zaaplikowany, „Usuń" wyłączony z notką.
3. **Happy path (zmiana faktyczna):** cofnij na dowolny krok, zmień pole → Dalej. Oczekiwane: PATCH leci normalnie.
4. **Pierwsze przejście:** świeże zamówienie, każdy krok wysyła PATCH przy pierwszym „Dalej".

---

## Self-Review

**Spec coverage:**
- §1/§4.2 delta company → Task 2. §4.2 personal + zgody → Task 3. §4.3 OS + reload → Task 4. §4.4 payment + brak H3 → Task 5. §4.1 moduł komparatorów + testy → Task 1. §4.5 interim rabatu (pokaż applied + wyłącz Usuń) → Task 6. §5 przypadki brzegowe → pokryte w guardach (`complete=false` gdy `order` null / pierwszy przebieg) i testach. §6 testy → Task 1 + Task 7. §7 open points (usuwanie rabatu / zmiana metody przy rabacie) → świadomie poza implementacją, udokumentowane. §8 (nie ruszamy confirm/backend) → respektowane.
- Brak taska dla „zmiana metody płatności przy utrwalonym rabacie" — zgodnie ze spec §7 to zależność BE, celowo poza planem.

**Placeholder scan:** brak TBD/TODO w krokach; każdy krok ma pełny kod i dokładne miejsce wstawienia.

**Type consistency:** `companyChanged/personalChanged/osChanged/paymentChanged` + typy `CompanyDelta/PersonalDelta/OsDelta/PaymentDelta` zdefiniowane w Task 1 i użyte identycznie w Task 2–5. `PaymentDelta` importowany w Task 5. Prop `locked` zdefiniowany i przekazany w Task 6. Kształty delty zgodne strukturalnie z `CompanyDataFormValues`/`PersonalDataFormValues`/`answers`/`{paymentMethod,discountCode}` — kroki przekazują wartości wprost.
