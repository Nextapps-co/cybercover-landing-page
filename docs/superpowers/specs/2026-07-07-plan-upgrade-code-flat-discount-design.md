# CODE_FLAT discount support for PLAN_UPGRADE — design

**Ticket:** CC-533
**Date:** 2026-07-07
**Status:** approved, ready for implementation plan
**Author:** FE

---

## 1. Problem & goal

Customer-typed `CODE_FLAT` discount codes (entered on the "Metoda płatności" step) are
fully functional for `INITIAL_PURCHASE`: on "Zastosuj" the order-summary box updates to
show the discounted price. For `PLAN_UPGRADE`, **nothing visible happens** — the applied
discount does not appear in the summary at all, and there is no clear way to see/remove it.

Root cause: `OrderSummaryAside` (`src/components/checkout/OrderSummaryAside.tsx:36`)
early-returns the proration breakdown whenever `order.proration != null` (always true for
an upgrade) and never reaches the discount-rendering code below it — the `previewDiscount`
prop and `order.discount` are only consumed *after* that early return.

**Goal:** make `CODE_FLAT` discounts on `PLAN_UPGRADE` behave like on `INITIAL_PURCHASE` —
visible on apply (preview), visible after persist, and removable — rendered inside the
proration breakdown.

Backend already supports the combined discount+proration case; the work is entirely
frontend (plus mock parity so it is testable offline).

## 2. Business rule

The `CODE_FLAT` discount is applied to the **base (full-cycle) price of the target plan**,
and the proration credit for the current plan is subtracted separately.

Example — upgrade Optimum → Profesjonalny, base 594,00 zł, code −50,00 zł, credit 147,50 zł:

```
Pełna cena planu          594,00 zł     ← proration.fullPrice
Rabat (LATO2026)          −50,00 zł     ← discount.discountAmount
Kredyt za obecny plan    −147,50 zł     ← proration.credit
──────────────────────────────────
Do zapłaty teraz          396,50 zł     ← proration.amountDueNow (== totalPriceNet)
Kwoty netto. VAT 23% doliczymy na fakturze.
```

## 3. Backend contract (assumptions to confirm against live API)

Per `docs/proration-changes.md` §8 (Przypadki brzegowe — "Kod rabatowy + proracja
jednocześnie"):

- `GET /orders/:id` for a discounted upgrade returns **both** `order.discount` (a standard
  `OrderDiscountDto`, `kind: 'CODE_FLAT'`) **and** `order.proration` (`fullPrice`, `credit`).
- `proration.amountDueNow` already nets out **both** the credit and the discount, and equals
  `order.totalPriceNet`.
- `proration.fullPrice` = base full-cycle plan price; `proration.credit` = positive credit
  for the unused period of the current plan.

Derived invariant for `CODE_FLAT` (fixed-amount): `amountDueNow = fullPrice − discountAmount − credit`.

**Assumption A1 (to verify):** `POST /orders/:id/validate-discount` for an upgrade returns
`originalPriceNet = proration.fullPrice` (the base plan price), not the prorated
`amountDueNow`. This follows from the §2 business rule. The design is robust to this either
way for fixed-amount codes (the *difference* `originalPriceNet − discountedPriceNet` is the
absolute discount either way), but percentage codes would depend on the base — see §7.

All amounts are **net, in grosze**, per-cycle (ANNUAL already includes ×12) — rendered
as-is with no further multiplication, consistent with the existing proration branch.

## 4. Changes

### 4.1 `OrderSummaryAside` — core rendering change

File: `src/components/checkout/OrderSummaryAside.tsx`

1. Lift the discount resolution (`previewAsDiscount` / `const discount = order?.discount ?? previewAsDiscount`,
   currently lines ~82-95) **above** the `if (proration)` early-return so both branches
   share one discount source.
2. In the proration branch, when `discount` (CODE_FLAT) is present, insert a line
   **between** "Pełna cena planu" and "Kredyt za obecny plan":
   - label: `Rabat (${discount.code})`
   - value: `−{formatMinorUnits(discount.discountAmount, currency)}`, styled like the credit
     line (green, minus-prefixed).
3. Compute "Do zapłaty teraz":
   - **persisted** (`order.discount` present): `proration.amountDueNow` (authoritative from BE).
   - **preview** (`order.discount == null` && `previewDiscount` present):
     `Math.max(0, proration.amountDueNow − previewDiscountAmount)` where
     `previewDiscountAmount = previewDiscount.originalPriceNet − previewDiscount.discountedPriceNet`.
     (In preview state `proration.amountDueNow` is the pre-discount prorated amount
     `fullPrice − credit`, so subtracting the preview discount yields the previewed total.)
4. "Pełna cena planu" always uses `proration.fullPrice` (authoritative base), independent of
   the discount source.

No change to the non-proration branch behavior.

Rationale for keeping the math in `OrderSummaryAside` (vs. computing in `PaymentMethodStep`
and passing a number down): the aside already has both `proration` and `previewDiscount`, and
it is the single render point shared by `PaymentMethodStep` (preview + persisted) and
`ConfirmStep` (persisted only). Fixing it here fixes the confirm step for upgrades for free.

### 4.2 `PaymentMethodStep` — minimal

File: `src/components/checkout/PaymentMethodStep.tsx`

No logic change required. `handleApplyDiscount` (validate-discount → `discountState=applied`),
the `previewDiscount` prop wiring (`:330-338`), and hydration of a persisted CODE_FLAT
(`:92-100`) already work for any order type. The behavior change comes entirely from 4.1
(the aside now consumes `previewDiscount` in the proration branch). Keep UX identical to
INITIAL_PURCHASE: type → "Zastosuj" → summary updates.

### 4.3 Remove flow

File: `src/components/checkout/PaymentMethodStep.tsx` (`handleRemoveDiscount`, already present)

No new code path. After 4.1:
- preview (unpersisted): reset `discountState` to `idle` → box reverts to plain proration.
- persisted: `DELETE /orders/:id/discount` → `setOrder(updated)` (BE returns proration
  recalculated without the discount) → box shows `amountDueNow` without the discount.

### 4.4 Mock parity (so the feature is testable under `PUBLIC_USE_MOCK_ORDERS=true`)

File: `src/lib/api/__mocks__/orders.mock.ts`. The mock currently does not simulate the real
contract and must be brought in line:

- **`validateDiscountCodeMock`**: when the order has `proration`, compute
  `originalPriceNet = order.proration.fullPrice` (base), not `order.totalPriceNet`
  (which for an upgrade is the prorated `amountDueNow`). `discountedPriceNet = applyDiscount(base, ...)`.
- **`selectPaymentMethodMock`**: when a valid `CODE_FLAT` code is supplied, persist it —
  set `order.discount` (`kind: 'CODE_FLAT'`, `originalAmount` = base, `priceAfterDiscount`,
  `discountAmount`) and recompute totals:
  - upgrade (`order.proration`): `amountDueNow = Math.max(0, fullPrice − credit − discountAmount)`,
    keep `fullPrice`/`credit`, set `order.totalPriceNet = amountDueNow`.
  - non-upgrade: `order.totalPriceNet = priceAfterDiscount` (base − discount).
  (Today it is a no-op on price; this also fixes the confirm-step discount display for
  INITIAL_PURCHASE under mocks.)
- **`removeDiscountMock`**: for an upgrade, restore `amountDueNow = fullPrice − credit` and
  `totalPriceNet = amountDueNow`, keeping `proration`. (Today it wrongly sets
  `totalPriceNet = originalAmount`, ignoring the credit.)

Use the existing `MOCK_DISCOUNTS` fixed code `SAVE100` (FIXED 10000 grosze) for CODE_FLAT
upgrade test scenarios.

## 5. Edge cases

- **`amountDueNow` clamps to 0** (discount ≥ `fullPrice − credit`): the box shows
  "Do zapłaty teraz 0,00 zł". `isPromoZeroOrder` (partner-kind only) does **not** cover a
  CODE_FLAT zero, so `ConfirmStep` still routes to Stripe/proforma. Pre-existing behavior —
  **out of scope** for this ticket (see §7).
- **Partner discount + upgrade**: `DiscountCodeField` renders the read-only partner banner
  (mutual exclusivity), so a CODE_FLAT cannot be added on top. Unchanged.
- **`proration == null` on an upgrade** (defensive fallback per proration doc §8): falls
  through to the existing non-proration branch, which already renders the discount. Works.

## 6. Testing

Tests cover `src/lib` only (`@vitejs/plugin-react` not installed, no component tests).

- **Mock unit tests** (`src/lib/api/__mocks__/orders.mock.test.ts`): on an upgrade order,
  applying a `CODE_FLAT` via `selectPaymentMethodMock` sets `discount` and yields
  `amountDueNow = fullPrice − credit − discountAmount`; `validateDiscountCodeMock` bases the
  preview on `proration.fullPrice`; `removeDiscountMock` restores `fullPrice − credit`; clamp
  to 0 when the discount exceeds the prorated base.
- **Pure-function extraction (decided: yes)**: extract a pure helper
  `computeUpgradeDueNow({ amountDueNow, previewDiscountAmount })` (or equivalent) into
  `src/lib/checkout/upgrade-pricing.ts` and unit-test it; `OrderSummaryAside` consumes it.
  Rationale: the preview-path "Do zapłaty teraz" computation runs client-side and is not
  otherwise exercised by any test (the mock covers only the persisted path), and the project
  convention is that pricing math in `src/lib` is unit-tested. The helper covers the clamp-to-0
  edge and the preview subtraction.

## 7. Out of scope

- Percentage-based codes on upgrades (design works, but only fixed-amount codes are verified
  numerically; percentage correctness depends on Assumption A1's base).
- Changing payment routing for a 0 zł upgrade (existing `isPromoZeroOrder` gap).
- Any change to partner-discount behavior or the `INITIAL_PURCHASE` flow beyond the mock
  persist fix that falls out of 4.4.

## 8. File-by-file change list

| File | Change |
|---|---|
| `src/components/checkout/OrderSummaryAside.tsx` | Lift discount resolution above proration early-return; add "Rabat" line in proration branch; compute preview vs. persisted "Do zapłaty teraz". |
| `src/lib/api/__mocks__/orders.mock.ts` | `validateDiscountCodeMock` bases on `proration.fullPrice`; `selectPaymentMethodMock` persists CODE_FLAT + recomputes proration; `removeDiscountMock` restores `fullPrice − credit` for upgrades. |
| `src/lib/api/__mocks__/orders.mock.test.ts` | Add upgrade discount apply/remove/clamp tests. |
| `src/lib/checkout/upgrade-pricing.ts` + `.test.ts` | Pure `computeUpgradeDueNow` helper (preview subtraction + clamp-to-0), unit-tested. |
| `src/components/checkout/PaymentMethodStep.tsx` | No logic change expected; verify preview/remove wiring end-to-end. |
