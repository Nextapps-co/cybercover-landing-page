# CODE_FLAT discount for PLAN_UPGRADE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer-typed `CODE_FLAT` discounts visible (preview + persisted) and removable during a `PLAN_UPGRADE`, rendered inside the proration breakdown.

**Architecture:** The bug is that `OrderSummaryAside` early-returns the proration branch and never consumes the discount. Fix: share one discount source across both branches, add a "Rabat" line in the proration breakdown, and compute the previewed "Do zapłaty teraz" via a small pure helper. Bring the offline mock in line with the real backend contract (discount + proration coexist; discount applies to the base plan price) so the flow is testable.

**Tech Stack:** Astro + React islands, TypeScript, Vitest + happy-dom. Tailwind v4. Money in grosze (minor units), per-cycle totals rendered as-is.

## Global Constraints

- **Do NOT run any `git` commands.** The user controls all commits. End each task with the working tree changed but uncommitted.
- **Batch verification at the end.** Per task, run ONLY that task's own test file (targeted vitest). The full suite + typecheck run once in Task 4. Note: repo has a known baseline of ~17 pre-existing test failures and ~69 `astro check` errors unrelated to this work — do not try to fix them.
- **Units:** all money is net grosze; catalog/planSnapshot are per-month rates (×12 for annual); order/discount/proration are per-cycle totals rendered as-is (no ×12).
- **UI language:** Polish. Keep copy simple (owners without an IT dept).
- **Discount base rule:** a `CODE_FLAT` discount applies to the base full-cycle price of the target plan (`proration.fullPrice`); the proration credit is subtracted separately. Invariant: `amountDueNow = fullPrice − credit − discountAmount`.
- Run targeted tests with: `npx vitest run <path>` (equivalently `npm run test:run -- <path>`).

---

## File Structure

- `src/lib/checkout/upgrade-pricing.ts` — NEW. Pure `computeUpgradeDueNow` helper (preview subtraction + clamp-to-0).
- `src/lib/checkout/upgrade-pricing.test.ts` — NEW. Unit tests for the helper.
- `src/lib/api/__mocks__/orders.mock.ts` — MODIFY. `validateDiscountCodeMock`, `selectPaymentMethodMock`, `removeDiscountMock` to simulate the real discount+proration contract.
- `src/lib/api/__mocks__/orders.mock.test.ts` — MODIFY. Add upgrade discount apply / validate / remove tests.
- `src/components/checkout/OrderSummaryAside.tsx` — MODIFY. Lift discount resolution above the proration early-return; add the "Rabat" line; use the helper for the previewed total.

---

### Task 1: Pure helper `computeUpgradeDueNow`

**Files:**
- Create: `src/lib/checkout/upgrade-pricing.ts`
- Test: `src/lib/checkout/upgrade-pricing.test.ts`

**Interfaces:**
- Produces: `computeUpgradeDueNow(amountDueNow: number, previewDiscountAmount: number): number` — returns `Math.max(0, amountDueNow − previewDiscountAmount)`. Consumed by `OrderSummaryAside` in Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/checkout/upgrade-pricing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeUpgradeDueNow } from './upgrade-pricing';

describe('computeUpgradeDueNow', () => {
  it('returns the prorated amount unchanged when there is no preview discount', () => {
    // persisted discount (already in amountDueNow) or no discount → previewDiscountAmount = 0
    expect(computeUpgradeDueNow(44650, 0)).toBe(44650);
  });

  it('subtracts the preview discount from the (pre-discount) prorated amount', () => {
    // fullPrice 59400 − credit 14750 = 44650 (amountDueNow before persist); − 5000 rabat = 39650
    expect(computeUpgradeDueNow(44650, 5000)).toBe(39650);
  });

  it('clamps to 0 when the discount exceeds the prorated amount', () => {
    expect(computeUpgradeDueNow(4000, 5000)).toBe(0);
  });

  it('handles an exact-zero result', () => {
    expect(computeUpgradeDueNow(5000, 5000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checkout/upgrade-pricing.test.ts`
Expected: FAIL — cannot resolve `./upgrade-pricing` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/checkout/upgrade-pricing.ts`:

```ts
// CC-533 — "Do zapłaty teraz" dla zamówienia PLAN_UPGRADE w boksie podsumowania.
//
// - Rabat utrwalony na zamówieniu: proration.amountDueNow już zawiera i kredyt, i rabat,
//   a previewDiscountAmount = 0 → zwracamy amountDueNow bez zmian.
// - Rabat w podglądzie (po „Zastosuj", przed „Dalej"): amountDueNow to jeszcze kwota po
//   proracji BEZ rabatu (fullPrice − credit), więc odejmujemy podglądowy rabat.
//
// Clamp do 0 — rabat kwotowy może przewyższyć kwotę po proracji. Wszystko w groszach netto.
export function computeUpgradeDueNow(
  amountDueNow: number,
  previewDiscountAmount: number,
): number {
  return Math.max(0, amountDueNow - previewDiscountAmount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/checkout/upgrade-pricing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Leave uncommitted** — do NOT run git. Report the two new files as the deliverable.

---

### Task 2: Mock parity — discount + proration contract

**Files:**
- Modify: `src/lib/api/__mocks__/orders.mock.ts` (`validateDiscountCodeMock` ~540-570, `selectPaymentMethodMock` ~579-616, `removeDiscountMock` ~620-638)
- Test: `src/lib/api/__mocks__/orders.mock.test.ts`

**Interfaces:**
- Consumes: existing `applyDiscount(originalGrosze, type, value)`, `MOCK_DISCOUNTS` (`SAVE100` = FIXED `10000`), `PARTNER_DISCOUNT_KINDS`, `computeMockProration`, `consumeMockAuthFromUrl`, `getMockAuthContext`.
- Produces: after `selectPaymentMethodMock(orderId, { paymentMethod, discountCode })` on an upgrade, `getOrderMock` returns `order.discount` (CODE_FLAT) and `order.proration` with `amountDueNow = fullPrice − credit − discountAmount == totalPriceNet`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/api/__mocks__/orders.mock.test.ts`. First extend the import at the top of the file to include `validateDiscountCodeMock` and `consumeMockAuthFromUrl`:

```ts
import {
  resetOrdersMock,
  startOrderMock,
  submitCompanyDataMock,
  submitPersonalDataMock,
  submitOperationalStandardsMock,
  selectPaymentMethodMock,
  validateDiscountCodeMock,
  removeDiscountMock,
  confirmOrderMock,
  getOrderMock,
  changePaymentMethodMock,
  cancelOrderMock,
  markOrderPaidMock,
} from './orders.mock';
import { consumeMockAuthFromUrl } from '../../auth/mock-auth';
```

Then append this describe block at the end of the file:

```ts
describe('CODE_FLAT discount on PLAN_UPGRADE (CC-533)', () => {
  // Upgrade z Optimum (ACTIVE) na Professional → orderType PLAN_UPGRADE, proracja zaseedowana.
  async function seedUpgradeOrder(): Promise<string> {
    window.history.replaceState({}, '', '/cennik?mockAuth=optimum-ACTIVE');
    consumeMockAuthFromUrl();
    const start = await startOrderMock({
      catalogEntryId: 'CATALOG-mock-professional',
      billingCycle: 'MONTHLY',
    });
    return start.orderId;
  }

  beforeEach(() => {
    resetOrdersMock();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    // Nie zostawiaj mock-auth w sessionStorage — inne describe zakładają INITIAL_PURCHASE.
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('seeds an upgrade order with proration (amountDueNow = fullPrice − credit)', async () => {
    const orderId = await seedUpgradeOrder();
    const order = await getOrderMock(orderId);
    expect(order.proration).not.toBeNull();
    expect(order.proration!.amountDueNow).toBe(
      order.proration!.fullPrice - order.proration!.credit,
    );
    expect(order.discount).toBeNull();
  });

  it('validate-discount bases the preview on the plan base price (proration.fullPrice), not amountDueNow', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const res = await validateDiscountCodeMock(orderId, { discountCode: 'SAVE100' });
    expect(res.valid).toBe(true);
    expect(res.originalPriceNet).toBe(before.proration!.fullPrice);
    expect(res.discountedPriceNet).toBe(before.proration!.fullPrice - 10000);
  });

  it('selectPaymentMethod persists CODE_FLAT and recomputes amountDueNow = fullPrice − credit − discount', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const { fullPrice, credit } = before.proration!;
    const preDiscountDue = before.proration!.amountDueNow; // fullPrice − credit

    await selectPaymentMethodMock(orderId, {
      paymentMethod: 'STRIPE_CHECKOUT',
      discountCode: 'SAVE100',
    });

    const after = await getOrderMock(orderId);
    expect(after.discount).toMatchObject({
      kind: 'CODE_FLAT',
      code: 'SAVE100',
      originalAmount: fullPrice,
      discountAmount: 10000,
      priceAfterDiscount: fullPrice - 10000,
    });
    expect(after.proration!.fullPrice).toBe(fullPrice);
    expect(after.proration!.credit).toBe(credit);
    expect(after.proration!.amountDueNow).toBe(preDiscountDue - 10000);
    expect(after.totalPriceNet).toBe(preDiscountDue - 10000);
  });

  it('removeDiscount restores amountDueNow = fullPrice − credit and clears the discount', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const preDiscountDue = before.proration!.amountDueNow;

    await selectPaymentMethodMock(orderId, {
      paymentMethod: 'STRIPE_CHECKOUT',
      discountCode: 'SAVE100',
    });
    const restored = await removeDiscountMock(orderId);

    expect(restored.discount).toBeNull();
    expect(restored.proration!.amountDueNow).toBe(preDiscountDue);
    expect(restored.totalPriceNet).toBe(preDiscountDue);
  });
});
```

Also ensure `afterEach` is imported from vitest at the top of the file (it currently imports `beforeEach, describe, expect, it`):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/api/__mocks__/orders.mock.test.ts`
Expected: the new "validate-discount bases the preview…", "selectPaymentMethod persists…", and "removeDiscount restores…" tests FAIL (current mock uses `totalPriceNet` as base, does not persist the discount, and restores `originalAmount` ignoring credit). The "seeds an upgrade order…" test should already PASS.

- [ ] **Step 3: Fix `validateDiscountCodeMock` base**

In `src/lib/api/__mocks__/orders.mock.ts`, replace the `originalPriceNet` line in `validateDiscountCodeMock`:

Find:
```ts
  const originalPriceNet = order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0;
```
Replace with:
```ts
  // CC-533 — dla upgrade rabat liczymy od bazowej ceny planu (proration.fullPrice),
  // nie od kwoty po proracji (totalPriceNet == amountDueNow).
  const originalPriceNet = order.proration
    ? order.proration.fullPrice
    : (order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0);
```

- [ ] **Step 4: Persist the discount in `selectPaymentMethodMock`**

Replace the whole `selectPaymentMethodMock` function body with:

```ts
export async function selectPaymentMethodMock(
  orderId: string,
  dto: SelectPaymentMethodDto,
): Promise<CheckoutStateResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  if (dto.discountCode) {
    if (order.discount && PARTNER_DISCOUNT_KINDS.includes(order.discount.kind)) {
      throw new ApiError('DISCOUNT_SOURCE_CONFLICT', 409, 'Partner discount already applied (mock)');
    }
    const code = dto.discountCode.trim().toUpperCase();
    const def = MOCK_DISCOUNTS[code];
    if (!def) {
      throw new ApiError('DISCOUNT_CODE_NOT_FOUND', 400, 'Discount code not found (mock)');
    }
    // CC-533 — utrwal rabat CODE_FLAT i przelicz kwoty (realny BE robi to samo w tym kroku).
    // Baza rabatu = cena bazowa planu: dla upgrade proration.fullPrice; dla ponownego
    // zastosowania (non-upgrade) oryginał sprzed rabatu; inaczej totalPriceNet.
    const alreadyApplied = order.discount?.kind === 'CODE_FLAT' && order.discount.code === code;
    if (!alreadyApplied) {
      const base = order.proration
        ? order.proration.fullPrice
        : order.discount?.kind === 'CODE_FLAT'
          ? order.discount.originalAmount
          : (order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0);
      const priceAfterDiscount = applyDiscount(base, def.type, def.value);
      const discountAmount = base - priceAfterDiscount;
      order.discount = {
        code,
        kind: 'CODE_FLAT',
        originalAmount: base,
        priceAfterDiscount,
        discountAmount,
        currency: order.currency,
      };
      if (order.proration) {
        const amountDueNow = Math.max(0, order.proration.fullPrice - order.proration.credit - discountAmount);
        order.proration = { ...order.proration, amountDueNow };
        order.totalPriceNet = amountDueNow;
        if (order.lines[0]) order.lines[0].priceNet = amountDueNow;
      } else {
        order.totalPriceNet = priceAfterDiscount;
        if (order.lines[0]) order.lines[0].priceNet = priceAfterDiscount;
      }
    }
  }
  order.paymentMethod = dto.paymentMethod;
  order.checkoutProgress = { ...order.checkoutProgress, hasPaymentMethod: true };
  ordersById.set(orderId, order);

  // CC-353 — PATCH /payment-method zwraca tylko checkout-state (bez cen). Proracja/kwoty
  // żyją na GET /orders/:id; ConfirmStep robi świeży getOrder po tym kroku.
  return {
    orderId,
    progress: order.checkoutProgress,
    isComplete: Object.values(order.checkoutProgress).every(Boolean),
    nextRequiredStep: !order.checkoutProgress.hasCompanyData
      ? 'COMPANY_DATA'
      : !order.checkoutProgress.hasPersonalData
        ? 'PERSONAL_DATA'
        : !order.checkoutProgress.hasOperationalStandards
          ? 'OPERATIONAL_STANDARDS'
          : !order.checkoutProgress.hasPaymentMethod
            ? 'PAYMENT_METHOD'
            : null,
  };
}
```

- [ ] **Step 5: Fix `removeDiscountMock` for upgrades**

Replace the tail of `removeDiscountMock` (from `const fullPrice = order.discount.originalAmount;` through `return order;`) with:

```ts
  const base = order.discount.originalAmount;
  order.discount = null;
  if (order.proration) {
    // CC-533 — upgrade: po zdjęciu rabatu wracamy do kwoty po proracji (fullPrice − credit),
    // NIE do samej ceny bazowej (to ignorowałoby kredyt).
    const amountDueNow = Math.max(0, order.proration.fullPrice - order.proration.credit);
    order.proration = { ...order.proration, amountDueNow };
    order.totalPriceNet = amountDueNow;
    if (order.lines[0]) order.lines[0].priceNet = amountDueNow;
  } else {
    order.totalPriceNet = base;
    if (order.lines[0]) order.lines[0].priceNet = base;
  }
  ordersById.set(orderId, order);
  return order;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/api/__mocks__/orders.mock.test.ts`
Expected: PASS — all tests in the file green, including the four new upgrade-discount tests.

- [ ] **Step 7: Leave uncommitted** — do NOT run git.

---

### Task 3: Render the discount inside the proration breakdown

**Files:**
- Modify: `src/components/checkout/OrderSummaryAside.tsx`

**Interfaces:**
- Consumes: `computeUpgradeDueNow` from Task 1; existing `previewDiscount` prop (`{ code, originalPriceNet, discountedPriceNet } | null`), `order.discount`, `order.proration`, `formatMinorUnits`.
- Produces: no new exports; `PaymentMethodStep` (preview + persisted) and `ConfirmStep` (persisted) both now show the discount on upgrades via this shared component. No change required in those two callers.

- [ ] **Step 1: Add the helper import**

At the top of `src/components/checkout/OrderSummaryAside.tsx`, add:

```ts
import { computeUpgradeDueNow } from '../../lib/checkout/upgrade-pricing';
```

- [ ] **Step 2: Lift the discount resolution above the proration early-return**

Find (currently just before `if (proration) {`):

```ts
  const currency = (order?.currency ?? session.planSnapshot.currency) as 'PLN';
  const proration = order?.proration ?? null;

  // CC-353 — dla zamówień podniesienia planu boks pokazuje rozbicie proracji
```

Replace with (insert the discount resolution between `proration` and the comment):

```ts
  const currency = (order?.currency ?? session.planSnapshot.currency) as 'PLN';
  const proration = order?.proration ?? null;

  // CC-533 — źródło rabatu wspólne dla obu gałęzi (proracja i zwykła cena):
  // rabat utrwalony na zamówieniu ma pierwszeństwo; inaczej podgląd z pola po „Zastosuj".
  const previewAsDiscount: OrderDiscountDto | null =
    !order?.discount && previewDiscount
      ? {
          code: previewDiscount.code,
          kind: 'CODE_FLAT',
          originalAmount: previewDiscount.originalPriceNet,
          priceAfterDiscount: previewDiscount.discountedPriceNet,
          discountAmount: previewDiscount.originalPriceNet - previewDiscount.discountedPriceNet,
          currency,
        }
      : null;
  const discount = order?.discount ?? previewAsDiscount;

  // CC-353 — dla zamówień podniesienia planu boks pokazuje rozbicie proracji
```

- [ ] **Step 3: Add the "Rabat" line and previewed total in the proration branch**

Inside the `if (proration) {` block, first compute the previewed total. Change the opening of the block from:

```ts
  if (proration) {
    return (
      <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 lg:sticky lg:top-[110px]">
```

to:

```ts
  if (proration) {
    // Podgląd rabatu (jeszcze nieutrwalony) obniża amountDueNow; utrwalony rabat jest
    // już wliczony w proration.amountDueNow, więc previewDiscountAmount = 0.
    const previewDiscountAmount = !order?.discount && previewDiscount
      ? previewDiscount.originalPriceNet - previewDiscount.discountedPriceNet
      : 0;
    const dueNow = computeUpgradeDueNow(proration.amountDueNow, previewDiscountAmount);
    return (
      <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 lg:sticky lg:top-[110px]">
```

Then, inside the `<ul className="space-y-2">` in the proration branch, insert the Rabat `<li>` between the "Pełna cena planu" item and the "Kredyt za obecny plan" item. Find:

```tsx
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Pełna cena planu</span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-black whitespace-nowrap">
              {formatMinorUnits(proration.fullPrice, currency)}
            </span>
          </li>
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Kredyt za obecny plan</span>
```

Replace with (add the rabat `<li>` in the middle):

```tsx
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Pełna cena planu</span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-black whitespace-nowrap">
              {formatMinorUnits(proration.fullPrice, currency)}
            </span>
          </li>
          {discount && discount.discountAmount > 0 && (
            <li className="flex items-start justify-between gap-2">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">
                Rabat ({discount.code})
              </span>
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-green-700 whitespace-nowrap">
                −{formatMinorUnits(discount.discountAmount, currency)}
              </span>
            </li>
          )}
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Kredyt za obecny plan</span>
```

- [ ] **Step 4: Use `dueNow` for the "Do zapłaty teraz" amount**

In the proration branch, find:

```tsx
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-2xl text-black whitespace-nowrap">
            {formatMinorUnits(proration.amountDueNow, currency)}
          </span>
```

Replace `proration.amountDueNow` with `dueNow`:

```tsx
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-2xl text-black whitespace-nowrap">
            {formatMinorUnits(dueNow, currency)}
          </span>
```

- [ ] **Step 5: Remove the now-duplicated discount resolution below the proration branch**

Further down (the non-proration branch), the old `previewAsDiscount` / `const discount = ...` block now duplicates what we lifted up. Find and DELETE these lines (they were moved to Step 2):

```ts
  // Rabat utrwalony na zamówieniu ma pierwszeństwo; inaczej użyj podglądu z pola (po „Zastosuj"),
  // żeby box od razu pokazał zdyskontowaną cenę — jeszcze przed utrwaleniem na „Dalej".
  const previewAsDiscount: OrderDiscountDto | null =
    !order?.discount && previewDiscount
      ? {
          code: previewDiscount.code,
          kind: 'CODE_FLAT',
          originalAmount: previewDiscount.originalPriceNet,
          priceAfterDiscount: previewDiscount.discountedPriceNet,
          discountAmount: previewDiscount.originalPriceNet - previewDiscount.discountedPriceNet,
          currency,
        }
      : null;
  const discount = order?.discount ?? previewAsDiscount;
```

Leave the surrounding `const isAnnual = …` and `const displayPriceGrosze = …` lines intact — they reference `discount`, which is now defined above the proration branch and remains in scope.

- [ ] **Step 6: Typecheck the touched file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep OrderSummaryAside || echo "no OrderSummaryAside type errors"`
Expected: `no OrderSummaryAside type errors` (repo has unrelated baseline errors elsewhere — only the touched file must be clean). If `tsc` config is not directly runnable, instead run `npx astro check 2>&1 | grep OrderSummaryAside || echo "clean"` and confirm no NEW errors reference `OrderSummaryAside.tsx`.

- [ ] **Step 7: Leave uncommitted** — do NOT run git.

---

### Task 4: Integration verification (batch)

**Files:** none (verification only).

- [ ] **Step 1: Run the two targeted test files**

Run: `npx vitest run src/lib/checkout/upgrade-pricing.test.ts src/lib/api/__mocks__/orders.mock.test.ts`
Expected: PASS — all tests green (Task 1: 4 tests; Task 2 file: existing + 4 new).

- [ ] **Step 2: Confirm no new failures vs baseline (optional full run)**

Run: `npx vitest run`
Expected: only the known baseline failures (~17, catalog-mock related per project memory) — no NEW failures in `upgrade-pricing`, `orders.mock`, or anything touched. If a new failure appears in a touched area, fix it before proceeding.

- [ ] **Step 3: Manual dev-server walkthrough**

Ensure `.env` has `PUBLIC_USE_MOCK_CATALOG=true` and `PUBLIC_USE_MOCK_ORDERS=true`. Run `npm run dev`, then in the browser:
1. Open `/cennik?mockAuth=optimum-ACTIVE`.
2. Click the **Profesjonalny** plan → wizard should jump to `payment-method` (upgrade, prefilled).
3. Confirm the summary box shows the 3-line proration breakdown (Pełna cena planu / −Kredyt / Do zapłaty teraz).
4. Enter `SAVE100`, click **Zastosuj** → a **Rabat (SAVE100) −100,00 zł** line appears between plan price and credit, and **Do zapłaty teraz** drops by 100 zł.
5. Click **Usuń** → the Rabat line disappears and the amount reverts.
6. Re-apply, click **Dalej** → on **Podsumowanie** (ConfirmStep) the same 4-line breakdown with the Rabat line is shown (persisted `order.discount`).

Expected: discount is visible on apply, removable, and persists to the confirm step. Report the outcome (with a note on any deviation).

- [ ] **Step 4: Leave uncommitted** — do NOT run git. Summarize what changed and the verification result for the user to review before committing.

---

## Self-Review

**Spec coverage:**
- §4.1 (OrderSummaryAside rendering) → Task 3. ✓
- §4.2 (PaymentMethodStep no change) → verified in Task 4 Step 3. ✓
- §4.3 (remove flow) → exercised by Task 2 (mock) + Task 4 Step 3 (UI). ✓
- §4.4 (mock parity: validate/select/remove) → Task 2. ✓
- §6 (pure helper + tests) → Task 1. ✓
- §5 edge (clamp-to-0) → Task 1 tests (helper) + `Math.max(0, …)` in Task 2 mock. ✓ (Mock-level clamp is not separately asserted to avoid adding a fixture code; the helper test covers the clamp for the rendered value.)
- §5 (partner+upgrade mutual exclusivity, proration==null fallback) → no code change; existing behavior preserved (partner banner suppresses the field; non-proration branch still renders `discount`). ✓

**Placeholder scan:** none — all steps contain concrete code/commands.

**Type consistency:** `computeUpgradeDueNow(amountDueNow, previewDiscountAmount)` used identically in Task 1 (def) and Task 3 (call). `previewDiscount` shape `{ code, originalPriceNet, discountedPriceNet }` matches `PaymentMethodStep`'s prop and the `previewAsDiscount` construction. `OrderDiscountDto` fields (`code, kind, originalAmount, priceAfterDiscount, discountAmount, currency`) match `src/lib/api/types/order.ts`. Mock uses `MOCK_DISCOUNTS.SAVE100` (FIXED 10000) consistently in code and tests.
