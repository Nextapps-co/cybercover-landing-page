# Wznawianie niedokończonego wizardu (DRAFT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umożliwić anonimowemu użytkownikowi wznowienie niedokończonego wizardu (DRAFT) po powrocie na /cennik, w tym po zamknięciu karty, przez banner + modal i przeniesienie wskaźnika zamówienia do localStorage.

**Architecture:** Wskaźnik `OrderSession` przenosimy z `sessionStorage` do `localStorage` (z TTL). `resolvePendingOrder` dla `draft` niesie pobrany `order`; `PricingCards` na mount pokazuje banner, a na kliknięcie planu — modal wyboru (dokończ/zacznij nowe). Helper `resumeStepPath` liczy krok powrotu w jednym miejscu.

**Tech Stack:** Astro, React (useState/useEffect), TypeScript, Tailwind v4, Vitest + happy-dom.

## Global Constraints

- **Język UI: polski**, prosto, bez żargonu.
- **Zero zmian backendu.**
- **Testy: tylko `src/lib/`** (czyste funkcje). Komponenty bez testów jednostkowych (brak `@vitejs/plugin-react`).
- **Git: NIE wykonujemy commitów ani branchy** — kontrolę nad git ma użytkownik. Żaden krok nie uruchamia `git`.
- **Weryfikacja build/typecheck/pełny test suite: batchowana na końcu** (ostatni task), nie po każdym tasku. Wyjątek: zadania `src/lib/` z TDD uruchamiają swój pojedynczy plik testowy (cykl red-green).
- **TTL wskaźnika:** 7 dni = `7 * 24 * 60 * 60 * 1000` ms, stała `ORDER_SESSION_TTL_MS`.
- **Tylko flow anonimowy:** banner/modal pomijane w trybie auth-aware (`?handoff=`/`?mockAuth=` lub `authSession.hasToken`).
- Statusy `OrderStatus`: `DRAFT | CONFIRMED | PENDING_ALLOCATION | PROCESSING | FULFILLED | CLOSED | CANCELLED`.
- Baseline repo: 17 znanych failujących testów w `catalog.mock.test.ts` + brak zainstalowanego `@astrojs/check` — nie instalujemy zależności.

---

### Task 1: Migracja `order-session` na localStorage + TTL

**Files:**
- Modify: `src/lib/state/order-session.ts`
- Test: `src/lib/state/order-session.test.ts`

**Interfaces:**
- Produces: `ORDER_SESSION_TTL_MS: number` (nowy eksport). Zachowane sygnatury: `loadFromStorage()`, `persistToStorage(session)`, `clearSession()` — zmienia się tylko backend storage (localStorage) + wygasanie w `loadFromStorage`.

- [ ] **Step 1: Zaktualizuj test (red)**

W `src/lib/state/order-session.test.ts`:

(a) Dodaj `ORDER_SESSION_TTL_MS` do importu z `./order-session`:
```ts
import {
  loadFromStorage,
  persistToStorage,
  clearSession,
  setFromStartOrderResponse,
  STORAGE_KEY,
  ORDER_SESSION_TTL_MS,
  type OrderSession,
} from './order-session';
```

(b) Zamień WSZYSTKIE wystąpienia `sessionStorage` na `localStorage` w tym pliku (dotyczy `beforeEach` oraz `setItem` w testach invalid-value, a także nazwy testu „clears sessionStorage").

(c) Zmień `createdAt` w fixture na świeży timestamp (inaczej nowy TTL wygasi fixture):
```ts
  createdAt: new Date().toISOString(),
```

(d) Dopisz na końcu pliku (przed ostatnim `});` zamykającym `describe('order-session', ...)`) nowy blok:
```ts
  describe('TTL expiry', () => {
    it('returns null and clears storage when createdAt older than TTL', () => {
      const stale = { ...fixture(), createdAt: new Date(Date.now() - ORDER_SESSION_TTL_MS - 1000).toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
      expect(loadFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns the session when createdAt within TTL', () => {
      const fresh = { ...fixture(), createdAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      expect(loadFromStorage()?.orderId).toBe(fresh.orderId);
    });

    it('does not expire when createdAt is unparseable', () => {
      const weird = { ...fixture(), createdAt: 'not-a-date' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(weird));
      expect(loadFromStorage()?.orderId).toBe(weird.orderId);
    });
  });
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npm run test:run -- src/lib/state/order-session.test.ts`
Expected: FAIL (brak eksportu `ORDER_SESSION_TTL_MS`; TTL „within TTL" zwraca null bo impl czyta sessionStorage; „older than TTL" może przypadkiem przejść).

- [ ] **Step 3: Implementacja**

W `src/lib/state/order-session.ts`:

(a) Dodaj stałą tuż pod `export const STORAGE_KEY = 'cybercover:order-session';`:
```ts
export const ORDER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni
```

(b) Zastąp `loadFromStorage` całą funkcją (localStorage + TTL):
```ts
export function loadFromStorage(): OrderSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    const createdMs = Date.parse(parsed.createdAt);
    if (!Number.isNaN(createdMs) && Date.now() - createdMs > ORDER_SESSION_TTL_MS) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
```

(c) W `persistToStorage` zmień `window.sessionStorage.setItem(...)` → `window.localStorage.setItem(...)`:
```ts
export function persistToStorage(session: OrderSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
```

(d) W `clearSession` zmień `window.sessionStorage.removeItem(...)` → `window.localStorage.removeItem(...)`:
```ts
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `npm run test:run -- src/lib/state/order-session.test.ts`
Expected: PASS (wszystkie, w tym 3 TTL).

- [ ] **Step 5: Sanity grep — brak innych czytelników klucza w sessionStorage**

Run: Grep `cybercover:order-session` oraz `STORAGE_KEY` across `src`. Potwierdź, że dostęp do tego klucza idzie wyłącznie przez `order-session.ts` (form-persistence używa INNYCH kluczy `cybercover:form-state:*` i pozostaje na sessionStorage — to OK). Jeśli jakiś inny plik czyta `cybercover:order-session` z `sessionStorage` wprost, zgłoś to (DONE_WITH_CONCERNS).

- [ ] **Step 6: Checkpoint (bez commitu).**

---

### Task 2: Helper `resumeStepPath`

**Files:**
- Modify: `src/lib/state/checkout-navigation.ts`
- Test: `src/lib/state/checkout-navigation.test.ts`

**Interfaces:**
- Consumes: `CheckoutProgressDto` z `../api/types/order` (już importowany w `checkout-navigation.ts`).
- Produces: `function resumeStepPath(progress: CheckoutProgressDto): string`.

- [ ] **Step 1: Dodaj test (red)**

W `src/lib/state/checkout-navigation.test.ts`:

(a) Upewnij się, że `resumeStepPath` jest w imporcie z `./checkout-navigation` (dodaj do istniejącego importu). Upewnij się, że typ `CheckoutProgressDto` jest zaimportowany; jeśli nie, dodaj:
```ts
import type { CheckoutProgressDto } from '../api/types/order';
```

(b) Dopisz blok testów:
```ts
describe('resumeStepPath', () => {
  const p = (over: Partial<CheckoutProgressDto> = {}): CheckoutProgressDto => ({
    hasCompanyData: false,
    hasPersonalData: false,
    hasOperationalStandards: false,
    hasPaymentMethod: false,
    ...over,
  });

  it('no company data → company-data', () => {
    expect(resumeStepPath(p())).toBe('/checkout/company-data');
  });
  it('company done → personal-data', () => {
    expect(resumeStepPath(p({ hasCompanyData: true }))).toBe('/checkout/personal-data');
  });
  it('company+personal → operational-standards', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true }))).toBe('/checkout/operational-standards');
  });
  it('+operational-standards → payment-method', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true }))).toBe('/checkout/payment-method');
  });
  it('all done → confirm', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: true }))).toBe('/checkout/confirm');
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npm run test:run -- src/lib/state/checkout-navigation.test.ts`
Expected: FAIL (`resumeStepPath` nie istnieje).

- [ ] **Step 3: Implementacja**

Na końcu `src/lib/state/checkout-navigation.ts` dodaj:
```ts
/**
 * Ścieżka kroku, od którego należy wznowić wizard dla zamówienia DRAFT —
 * pierwszy niewypełniony krok wg checkoutProgress; gdy wszystkie gotowe → confirm.
 */
export function resumeStepPath(progress: CheckoutProgressDto): string {
  if (!progress.hasCompanyData) return '/checkout/company-data';
  if (!progress.hasPersonalData) return '/checkout/personal-data';
  if (!progress.hasOperationalStandards) return '/checkout/operational-standards';
  if (!progress.hasPaymentMethod) return '/checkout/payment-method';
  return '/checkout/confirm';
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `npm run test:run -- src/lib/state/checkout-navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint (bez commitu).**

---

### Task 3: `resolvePendingOrder` — `draft` niesie `order`

**Files:**
- Modify: `src/lib/state/pending-order.ts`
- Test: `src/lib/state/pending-order.test.ts`

**Interfaces:**
- Produces (zmiana typu): 
```ts
export type PendingOrderResolution =
  | { kind: 'none' }
  | { kind: 'resumable' | 'paid' | 'dead'; orderId: string }
  | { kind: 'draft'; orderId: string; order: OrderResponseDto };
```

- [ ] **Step 1: Zaktualizuj test (red)**

W `src/lib/state/pending-order.test.ts`:

(a) Zmień fixture `session()` `createdAt` na świeży (TTL z Task 1):
```ts
  createdAt: new Date().toISOString(),
```

(b) W teście `ORDER_NOT_FOUND` zmień asercję storage z sessionStorage na localStorage:
```ts
    expect(window.localStorage.getItem('cybercover:order-session')).toBeNull();
```

(c) Dodaj test, że `draft` niesie `order` (w `describe('resolvePendingOrder', ...)`):
```ts
  it('draft order → draft with order attached', async () => {
    persistToStorage(session());
    const o = order({ status: 'DRAFT' });
    mockGetOrder.mockResolvedValue(o);
    expect(await resolvePendingOrder()).toEqual({ kind: 'draft', orderId: 'ord_abc', order: o });
  });
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npm run test:run -- src/lib/state/pending-order.test.ts`
Expected: FAIL (`draft` test — obecny resolver zwraca `{ kind:'draft', orderId }` bez `order`; ewentualnie ORDER_NOT_FOUND localStorage zależnie od Task 1).

- [ ] **Step 3: Implementacja**

W `src/lib/state/pending-order.ts`:

(a) Zastąp typ `PendingOrderResolution`:
```ts
export type PendingOrderResolution =
  | { kind: 'none' }
  | { kind: 'resumable' | 'paid' | 'dead'; orderId: string }
  | { kind: 'draft'; orderId: string; order: OrderResponseDto };
```

(b) W `resolvePendingOrder` zmień gałąź sukcesu (`try`) na:
```ts
    const order = await getOrder(session.orderId);
    const kind = classifyOrder(order);
    if (kind === 'draft') {
      return { kind: 'draft', orderId: order.orderId, order };
    }
    return { kind, orderId: order.orderId };
```
(`classifyOrder` bez zmian. `PendingOrderKind` zostaje.)

- [ ] **Step 4: Run test — verify PASS**

Run: `npm run test:run -- src/lib/state/pending-order.test.ts`
Expected: PASS (wszystkie, w tym nowy `draft`).

- [ ] **Step 5: Checkpoint (bez commitu).**

---

### Task 4: Komponenty `DraftResumeBanner` + `ResumeOrDiscardModal`

**Files:**
- Create: `src/components/pricing/DraftResumeBanner.tsx`
- Create: `src/components/pricing/ResumeOrDiscardModal.tsx`

**Interfaces:**
- Produces:
  - `function DraftResumeBanner(props: { planName: string; resumeHref: string; onDiscard: () => void }): JSX.Element`
  - `function ResumeOrDiscardModal(props: { draftPlanName: string; clickedPlanName: string; onContinueDraft: () => void; onStartNew: () => void; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Utwórz `DraftResumeBanner.tsx`**

```tsx
interface DraftResumeBannerProps {
  planName: string;
  resumeHref: string;
  onDiscard: () => void;
}

export function DraftResumeBanner({ planName, resumeHref, onDiscard }: DraftResumeBannerProps) {
  return (
    <div
      role="status"
      className="mx-auto mb-8 max-w-3xl rounded-[12px] border border-[#FED64B] bg-[#FFF9E6] p-4 font-['Plus_Jakarta_Sans',sans-serif] sm:flex sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="text-sm text-[#0D0D0D]">
        Masz niedokończone zamówienie planu <span className="font-semibold">{planName}</span>. Możesz je dokończyć albo zacząć od nowa.
      </p>
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <a
          href={resumeHref}
          className="rounded-[80px] bg-[#FED64B] px-5 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Dokończ zamówienie
        </a>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-[80px] border border-[#A2A09C] bg-white px-5 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
        >
          Odrzuć
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Utwórz `ResumeOrDiscardModal.tsx`**

```tsx
import { useEffect } from 'react';

interface ResumeOrDiscardModalProps {
  draftPlanName: string;
  clickedPlanName: string;
  onContinueDraft: () => void;
  onStartNew: () => void;
  onClose: () => void;
}

export function ResumeOrDiscardModal({
  draftPlanName,
  clickedPlanName,
  onContinueDraft,
  onStartNew,
  onClose,
}: ResumeOrDiscardModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const samePlan = draftPlanName === clickedPlanName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-modal-title"
        className="w-full max-w-md rounded-[16px] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="resume-modal-title" className="text-xl font-bold text-[#0D0D0D]">
          {samePlan
            ? 'Masz już rozpoczęte zamówienie tego planu'
            : `Masz rozpoczęte zamówienie planu ${draftPlanName}`}
        </h2>
        <p className="mt-2 text-sm text-[#6B6965]">
          {samePlan
            ? 'Chcesz je dokończyć, czy zacząć od nowa? Rozpoczęcie nowego porzuci poprzednie.'
            : `Chcesz je dokończyć, czy zacząć nowe zamówienie planu ${clickedPlanName}? Rozpoczęcie nowego porzuci poprzednie.`}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onStartNew}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
          >
            Zacznij nowe
          </button>
          <button
            type="button"
            onClick={onContinueDraft}
            className="rounded-[80px] bg-[#FED64B] px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
          >
            Dokończ rozpoczęte
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Checkpoint (bez commitu).** Brak testów jednostkowych (konwencja repo). Nie uruchamiaj build/test.

---

### Task 5: Integracja w `PricingCards`

**Files:**
- Modify: `src/components/pricing/PricingCards.tsx`

**Interfaces:**
- Consumes: `resolvePendingOrder` (już importowany), `resumeStepPath` z `../../lib/state/checkout-navigation`, `getOrderSession`/`clearOrderSession` z `../../lib/state/order-session`, `clearFormState` z `../../lib/state/form-persistence`, `DraftResumeBanner`, `ResumeOrDiscardModal`, istniejące `planToCardProps`, `authSession`, `state`, `billingCycle`.

- [ ] **Step 1: Importy**

(a) Rozszerz import z `order-session` o `getOrderSession` (powinien już zawierać `setFromStartOrderResponse, clearOrderSession`):
```ts
import { setFromStartOrderResponse, clearOrderSession, getOrderSession } from '../../lib/state/order-session';
```

(b) Dodaj nowe importy (obok pozostałych):
```ts
import { resumeStepPath } from '../../lib/state/checkout-navigation';
import { clearFormState } from '../../lib/state/form-persistence';
import { DraftResumeBanner } from './DraftResumeBanner';
import { ResumeOrDiscardModal } from './ResumeOrDiscardModal';
```

> `resolvePendingOrder` jest już importowany (z poprzedniego feature'u). Nie duplikuj.

- [ ] **Step 2: Stan komponentu**

Po istniejących `useState` (obok `ctaError`) dodaj:
```ts
  const [draft, setDraft] = useState<{ orderId: string; planName: string; resumeHref: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ plan: PlanCatalogEntryDto; clickedPlanName: string } | null>(null);
```

- [ ] **Step 3: Detekcja DRAFT na mount**

W głównym `useEffect`, w istniejącym bloku `if (!entryParams.has('handoff') && !entryParams.has('mockAuth')) { ... }`, PO linii `if (pending.kind === 'dead') { clearOrderSession(); }` dodaj:
```ts
        if (pending.kind === 'draft') {
          const planName =
            pending.order.lines[0]?.planName ??
            getOrderSession()?.planSnapshot.planName ??
            'Twój plan';
          setDraft({
            orderId: pending.orderId,
            planName,
            resumeHref: `${resumeStepPath(pending.order.checkoutProgress)}?orderId=${encodeURIComponent(pending.orderId)}`,
          });
        }
```

- [ ] **Step 4: Refaktor `onCtaClick` → `proceedStartOrder` + nowy `onCtaClick`**

(a) Zmień nazwę istniejącej funkcji `const onCtaClick = async (plan: PlanCatalogEntryDto) => {` na:
```ts
  const proceedStartOrder = async (plan: PlanCatalogEntryDto) => {
```
(całe ciało bez zmian — od `setLoadingPlanId(plan.planId);` po `}` zamykający `catch`).

(b) Bezpośrednio nad `proceedStartOrder` dodaj nowy `onCtaClick`:
```ts
  const onCtaClick = (plan: PlanCatalogEntryDto) => {
    // Tryb auth-aware ma własną obsługę 409 — modal tylko dla anonimowego DRAFT.
    if (draft && !authSession.hasToken) {
      const authContext: AuthContext | undefined =
        state.kind === 'ready'
          ? {
              currentPlanCode: state.currentPlanCode,
              subscriptionStatus: state.subscriptionStatus,
              currentBillingCycle: state.currentBillingCycle,
            }
          : undefined;
      setPendingPlan({ plan, clickedPlanName: planToCardProps(plan, billingCycle, authContext).title });
      return;
    }
    void proceedStartOrder(plan);
  };
```

> `PricingCard` wywołuje `onSelect={() => onCtaClick(plan)}` — sygnatura niezmieniona, zmiana z async na sync jest bezpieczna.

- [ ] **Step 5: Render bannera + modala**

W zwracanym fragmencie widoku `ready` (ten zaczynający się od `<>` z `<SubscriptionStatusBanner .../>`):

(a) PO linii `{discountBanner && <DiscountBanner {...discountBanner} />}` dodaj banner:
```tsx
      {draft && !pendingPlan && (
        <DraftResumeBanner
          planName={draft.planName}
          resumeHref={draft.resumeHref}
          onDiscard={() => {
            clearOrderSession();
            clearFormState();
            setDraft(null);
          }}
        />
      )}
```

(b) Bezpośrednio przed zamykającym `</>` (po `</div>` grida kart) dodaj modal:
```tsx
      {pendingPlan && draft && (
        <ResumeOrDiscardModal
          draftPlanName={draft.planName}
          clickedPlanName={pendingPlan.clickedPlanName}
          onContinueDraft={() => window.location.assign(draft.resumeHref)}
          onStartNew={() => {
            clearOrderSession();
            clearFormState();
            setPendingPlan(null);
            setDraft(null);
            void proceedStartOrder(pendingPlan.plan);
          }}
          onClose={() => setPendingPlan(null)}
        />
      )}
```

- [ ] **Step 6: Checkpoint (bez commitu).** Weryfikacja w ostatnim tasku.

---

### Task 6: Weryfikacja batchowa + final review

**Files:** brak zmian — weryfikacja.

- [ ] **Step 1: Pełny test suite**

Run: `npm run test:run`
Expected: nowe/zmienione testy (`order-session`, `checkout-navigation`, `pending-order`) przechodzą. Poza tym baseline (17 znanych failów w `catalog.mock.test.ts`).

- [ ] **Step 2: Typecheck zmienionych plików**

Run: `npx tsc --noEmit 2>&1 | grep -E "order-session|checkout-navigation|pending-order|DraftResumeBanner|ResumeOrDiscardModal|PricingCards" || echo "NO_TS_ERRORS_IN_CHANGED_FILES"`
Expected: `NO_TS_ERRORS_IN_CHANGED_FILES`.

- [ ] **Step 3: Build (sanity)**

Run: `npm run build`
Expected: Complete! bez błędów.

- [ ] **Step 4: Smoke manualny (mock)**

Z `PUBLIC_USE_MOCK_ORDERS=true`, `npm run dev`:
1. Wybierz plan → uzupełnij dane firmy → zamknij kartę. Otwórz `/cennik` → banner „Masz niedokończone zamówienie planu …".
2. „Dokończ zamówienie" → ląduje na kroku `personal-data` (pierwszy niewypełniony).
3. Wróć na `/cennik`, kliknij INNY plan → modal z opcjami; „Zacznij nowe" → nowy wizard; „Dokończ rozpoczęte" → wraca do DRAFT.
4. Banner „Odrzuć" → znika, klik planu tworzy nowe zamówienie bez modala.
5. `/cennik?mockAuth=optimum-ACTIVE` → brak bannera/modala (auth-aware).

- [ ] **Step 5: Final whole-branch review** (dispatch reviewer na najsilniejszym modelu) + handoff do użytkownika (commity po Twojej stronie).

---

## Self-Review

**Spec coverage:**
- Migracja storage + TTL → Task 1. ✅
- `resumeStepPath` → Task 2. ✅
- `draft` niesie `order` → Task 3. ✅
- Banner + Modal → Task 4. ✅
- Integracja (mount detekcja, onCtaClick, render, czyszczenie) → Task 5. ✅
- Skip auth-aware (`!handoff && !mockAuth` na mount + `!authSession.hasToken` w onCtaClick) → Task 5. ✅
- Stany brzegowe (ORDER_NOT_FOUND, TTL, createdAt NaN) → Task 1 (TTL/NaN) + Task 3 (ORDER_NOT_FOUND z poprzedniego resolvera, niezmieniona ścieżka). ✅
- Testy `src/lib/` → Task 1/2/3. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok z kodem ma pełny kod. ✅

**Type consistency:** `resumeStepPath(progress: CheckoutProgressDto): string` spójne (Task 2 ↔ Task 5). `PendingOrderResolution` `draft` z `order` spójne (Task 3 ↔ Task 5 używa `pending.order`). `draft`/`pendingPlan` state kształty spójne w Task 5. `proceedStartOrder`/`onCtaClick` nazwy spójne. ✅
