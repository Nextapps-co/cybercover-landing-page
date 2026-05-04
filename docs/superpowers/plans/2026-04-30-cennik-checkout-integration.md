# Cennik + Checkout Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Source of truth:** `docs/superpowers/specs/2026-04-30-cennik-checkout-integration-design.md`
> **Backend contract:** `docs/pricing-catalog-changes.md`
> **Reference codebase:** `docs/cc-strona-landing-astro/` (Preact, full integration — NOT to be modified)
>
> **CRITICAL: User runs all git operations themselves.** Do NOT use `git` from Bash for any reason (commit/status/diff/log/branch). Plan steps reference checkpoints — pause for user, do not auto-commit.

**Goal:** Merge full backend integration (REST API, validation, state, payment flows) from reference project into current project's design system (Plus Jakarta Sans, brand-yellow `#FED64B`, custom `PricingCard` with icons + highlights).

**Architecture:** Hybrid C — `cennik.astro` is React island (`PricingCards`), each checkout step is its own multi-page Astro route (`pages/checkout/<step>.astro`) with own React island. Backend-driven catalog (Model 3: semantic backend / presentation frontend via `lib/catalog/render-policy.ts`). State via sessionStorage. URL-driven discounts.

**Tech Stack:**
- Astro 6 (multi-page) + `@astrojs/react` (existing)
- React 18 + react-hook-form (existing)
- Tailwind CSS v4 with `@theme` tokens (existing `src/styles/global.css`)
- Vitest + happy-dom (NEW) + @testing-library/react (NEW) — only for `lib/*` tests
- Plus Jakarta Sans typography (via Google Fonts in `BaseLayout.astro` — existing)

**Adaptation rules for porting Preact → React:**
1. Imports: `from 'preact/hooks'` → `from 'react'`
2. Imports: `from 'preact'` → `from 'react'` (for types like `JSX.Element` — use React equivalents)
3. Imports: `from 'preact/jsx-runtime'` (rare) → not needed in React 18 with auto-jsx
4. JSX attributes: `class=` → `className=`, `for=` → `htmlFor=`
5. Event handlers: `onInput` → `onChange` (for inputs), `onClick` stays
6. Form events: `(e: Event) => ...` with `e.target.value` → `(e: ChangeEvent<HTMLInputElement>) => e.target.value` (typed)
7. `useEffect`/`useState`/`useRef`/`useMemo`/`useCallback` — same API in both, just import from `react`
8. Refs: `useRef<HTMLDivElement>(null)` — same in React, no change
9. Children: `props.children` — same in React
10. Conditional rendering, list rendering, fragments — same syntax in React

---

## Phase 1 — Fundamenty (lib/, env, layouts, mocki)

> Phase 1 produces zero UI changes. After Phase 1: `pnpm test:run` passes for all ported `lib/*` tests, `pnpm build` still succeeds (no broken imports).

### Task 1.1: Setup vitest + dev dependencies

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Add vitest dev dependencies**

Run in project root:
```bash
pnpm add -D vitest happy-dom @testing-library/react @testing-library/jest-dom @types/node
```

Expected: `package.json` now lists `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@types/node` under `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

Write `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
```

If `@vitejs/plugin-react` is missing, install it:
```bash
pnpm add -D @vitejs/plugin-react
```

- [ ] **Step 3: Create `vitest.setup.ts`**

Write `vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add npm scripts**

Edit `package.json` `scripts` section, add:
```json
{
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 5: Verify vitest runs**

Run:
```bash
pnpm test:run
```
Expected: vitest discovers no test files (`No test files found`) but exits cleanly. If it errors on missing config — debug.

- [ ] **Step 6: Checkpoint — pause for user review**

Stop. User reviews and commits if desired before continuing.

---

### Task 1.2: Port `lib/api/types/`

**Files:**
- Create: `src/lib/api/types/errors.ts`
- Create: `src/lib/api/types/money.ts`
- Create: `src/lib/api/types/catalog.ts`
- Create: `src/lib/api/types/order.ts`

- [ ] **Step 1: Read source files from reference**

Read all of:
- `docs/cc-strona-landing-astro/src/lib/api/types/errors.ts`
- `docs/cc-strona-landing-astro/src/lib/api/types/money.ts`
- `docs/cc-strona-landing-astro/src/lib/api/types/catalog.ts`
- `docs/cc-strona-landing-astro/src/lib/api/types/order.ts`

- [ ] **Step 2: Copy verbatim to `src/lib/api/types/`**

Create destination directory `src/lib/api/types/`. Copy the content of each source file unchanged to destination.

These are pure TypeScript type definitions — no Preact / React anywhere. **Zero adaptation needed.**

- [ ] **Step 3: Add `tier` field to PlanCatalogEntryDto**

In `src/lib/api/types/catalog.ts`, add `tier` field to the `PlanCatalogEntryDto` interface per backend changes (`docs/pricing-catalog-changes.md` § 4.2):

```ts
export interface PlanCatalogEntryDto {
  catalogEntryId: string;
  planId: string;
  code: string;
  planName: string;
  description: string;
  displayOrder: number;
  recommended: boolean;
  tier: 'entry' | 'mid' | 'high' | 'top';   // ← ADDED
  ctaLabel?: string;                          // ← ADDED (optional, fallback to features.ctaLabel)
  annualPrice: MoneyDto;
  monthlyPrice: MoneyDto;
  features: FeatureMap;
  discount: DiscountPreviewDto | null;
}
```

- [ ] **Step 4: Add `partnerName` and `partnerLogoUrl` to DiscountPreviewDto**

In same file, extend `DiscountPreviewDto`:
```ts
export interface DiscountPreviewDto {
  code: string;
  description: string;
  kind: DiscountKind;
  eligible: boolean;
  annualPriceAfterDiscount: MoneyDto | null;
  monthlyPriceAfterDiscount: MoneyDto | null;
  annualDiscountAmount: MoneyDto | null;
  monthlyDiscountAmount: MoneyDto | null;
  promotionalDuration: PromotionalDurationDto | null;
  partnerName: string | null;       // ← ADDED
  partnerLogoUrl: string | null;    // ← ADDED
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: clean (no errors). If errors mention these new files, debug imports.

- [ ] **Step 6: Checkpoint — pause for user review**

---

### Task 1.3: Port `lib/format/` + tests

**Files:**
- Create: `src/lib/format/money.ts`, `money.test.ts`
- Create: `src/lib/format/partner.ts`, `partner.test.ts`
- Create: `src/lib/format/discount-code.ts`, `discount-code.test.ts`

- [ ] **Step 1: Copy source files unchanged**

Copy from `docs/cc-strona-landing-astro/src/lib/format/` to `src/lib/format/`:
- `money.ts` and `money.test.ts`
- `partner.ts` and `partner.test.ts`
- `discount-code.ts` and `discount-code.test.ts`

These are pure TS. Update relative import paths if any (likely `from './money'` style — keep).

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/format
```
Expected: all tests pass.

- [ ] **Step 3: Checkpoint — pause for user review**

---

### Task 1.4: Port `lib/validation/` + tests

**Files:**
- Create: `src/lib/validation/nip.ts`, `nip.test.ts`
- Create: `src/lib/validation/postal-code.ts`, `postal-code.test.ts`
- Create: `src/lib/validation/email.ts`, `email.test.ts`
- Create: `src/lib/validation/company-data.ts`, `company-data.test.ts`
- Create: `src/lib/validation/personal-data.ts`, `personal-data.test.ts`
- Create: `src/lib/validation/operational-standards.ts`, `operational-standards.test.ts`
- Create: `src/lib/validation/payment.ts`, `payment.test.ts`

- [ ] **Step 1: Copy source files unchanged**

Copy entire contents of `docs/cc-strona-landing-astro/src/lib/validation/` to `src/lib/validation/`. All 7 files + their tests.

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/validation
```
Expected: all tests pass.

- [ ] **Step 3: Checkpoint — pause for user review**

---

### Task 1.5: Port `lib/api/http.ts` + tests

**Files:**
- Create: `src/lib/api/http.ts`, `http.test.ts`

- [ ] **Step 1: Copy source verbatim**

Copy `docs/cc-strona-landing-astro/src/lib/api/http.ts` and `http.test.ts` to `src/lib/api/`.

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/api/http
```
Expected: all tests pass. The http test mocks `fetch` — should work in happy-dom.

- [ ] **Step 3: Checkpoint — pause for user review**

---

### Task 1.6: Port `lib/api/__mocks__/` and adapt to new feature.* keys

**Files:**
- Create: `src/lib/api/__mocks__/catalog.mock.ts`, `catalog.mock.test.ts`
- Create: `src/lib/api/__mocks__/orders.mock.ts`, `orders.mock.test.ts`

- [ ] **Step 1: Copy reference mock files**

Copy from `docs/cc-strona-landing-astro/src/lib/api/__mocks__/` to `src/lib/api/__mocks__/`:
- `catalog.mock.ts` and `catalog.mock.test.ts`
- `orders.mock.ts` and `orders.mock.test.ts` (if exists; check ref)

- [ ] **Step 2: Update `catalog.mock.ts` to match new contract**

Edit `src/lib/api/__mocks__/catalog.mock.ts`:
1. Add `tier` field to each plan: `'entry' | 'mid' | 'high' | 'top'`
2. Add `ctaLabel` field with values: `'Rozpocznij ze Standard'`, `'Wybierz Optimum'`, `'Zyskaj pełną ochronę'`, `'Uzyskaj najwyższy pakiet'`
3. Replace `features` keys with new contract from `docs/pricing-catalog-changes.md` § 4.1 (full mapping table). Use the data from current `src/app/pages/PricingPage.tsx` `pricingTiers` array.
4. For partner discount mocks, add `partnerName: 'ValveTech'` and `partnerLogoUrl: '/img/partners/valvetech.svg'`. (Note: actual logo asset upload is later — for mock this can point to a placeholder path.)

Mock should reflect the 4 plans:
- Standard (tier: 'entry') — `feature.securityAssessment.legal=true`, `.technical=true`, `.report=general`, `feature.monitoring.email=true`, `.web=true`
- Optimum (tier: 'mid', recommended: true) — Standard's keys + `securityAssessment.people=true`, `.report=detailed`, `consultation.timesPerYear=10`, `incidentResponse=true`, `insurance.coverageAmount=1000000`, `.deductible=5000`, `.includesThirdPartyClaims=true`, `.includesAdminProceedings=true`, `.includesGdprFines=true`, `.includesRansomCosts=true`
- Profesjonalny (tier: 'high') — Optimum's keys + `consultation.timesPerYear=20`, `insurance.coverageAmount=2500000`, `.deductible=0`, `.includesLostProfit=true`, `training.online.timesPerYear=2`
- Ekspert (tier: 'top') — Profesjonalny's keys + `consultation.timesPerYear=unlimited`, `insurance.coverageAmount=5000000`, `multiUser.accountSwitching=true`, `.partnerDataView=true`

Use exact prices from current code: Standard 295 PLN/year (annual), Optimum 495, Profesjonalny 895, Ekspert 1595. Backend convention: prices in **grosze** (29500, 49500, 89500, 159500). Monthly = annual × 1.2 in same convention.

- [ ] **Step 3: Run mock tests**

Run:
```bash
pnpm test:run src/lib/api/__mocks__
```
Expected: tests pass. If reference tests check old feature keys, update assertions to new keys.

- [ ] **Step 4: Checkpoint — pause for user review**

---

### Task 1.7: Port `lib/api/catalog.ts` + tests

**Files:**
- Create: `src/lib/api/catalog.ts`, `catalog.test.ts`

- [ ] **Step 1: Copy source verbatim**

Copy `docs/cc-strona-landing-astro/src/lib/api/catalog.ts` and `catalog.test.ts` to `src/lib/api/`.

- [ ] **Step 2: Add `partnerCode` parameter to `getPlans`**

Edit `src/lib/api/catalog.ts`. The function signature changes from:
```ts
export async function getPlans(discountCode?: string): Promise<PlanCatalogResponseDto>
```
to:
```ts
export async function getPlans(
  discountCode?: string,
  partnerCode?: string,
): Promise<PlanCatalogResponseDto>
```

Pass `partnerCode` as query param when present (alongside `discountCode`). Both can coexist — backend decides priority.

- [ ] **Step 3: Update test for partnerCode**

Add test case in `catalog.test.ts`:
```ts
it('passes partnerCode as query param', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } })
  );
  await getPlans(undefined, 'VALVETECH');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('partnerCode=VALVETECH'),
    expect.any(Object),
  );
});
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test:run src/lib/api/catalog
```
Expected: all pass.

- [ ] **Step 5: Checkpoint**

---

### Task 1.8: Port `lib/api/orders.ts` + tests

**Files:**
- Create: `src/lib/api/orders.ts`, `orders.test.ts`

- [ ] **Step 1: Copy source verbatim**

Copy `docs/cc-strona-landing-astro/src/lib/api/orders.ts` and `orders.test.ts` to `src/lib/api/`.

This file has all order endpoints (`startOrder`, `getOrder`, `getCheckoutState`, `submitCompanyData`, `lookupCompany`, `fetchConsentDefinitions`, `submitPersonalData`, `getOperationalStandardsSchema`, `submitOperationalStandards`, `evaluateEligibility`, `validateDiscountCode`, `selectPaymentMethod`, `confirmOrder`, `createStripeCheckoutSession`, `getOrderConfirmation`, `buildProformaDownloadUrl`).

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/api/orders
```
Expected: all pass.

- [ ] **Step 3: Checkpoint**

---

### Task 1.9: Port `lib/state/` + tests

**Files:**
- Create: `src/lib/state/order-session.ts`, `order-session.test.ts`
- Create: `src/lib/state/form-state.ts`, `form-state.test.ts`
- Create: `src/lib/state/checkout-navigation.ts`, `checkout-navigation.test.ts`

- [ ] **Step 1: Copy all 6 files verbatim**

Copy from `docs/cc-strona-landing-astro/src/lib/state/` to `src/lib/state/`.

These use sessionStorage / localStorage. happy-dom provides these APIs in tests.

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/state
```
Expected: all pass.

- [ ] **Step 3: Checkpoint**

---

### Task 1.10: Port `lib/errors/translate.ts`

**Files:**
- Create: `src/lib/errors/translate.ts`, `translate.test.ts`

- [ ] **Step 1: Copy source verbatim**

Copy `docs/cc-strona-landing-astro/src/lib/errors/translate.ts` and `translate.test.ts` to `src/lib/errors/`.

- [ ] **Step 2: Run tests**

Run:
```bash
pnpm test:run src/lib/errors
```
Expected: all pass.

- [ ] **Step 3: Checkpoint**

---

### Task 1.11: Setup `.env.example` and `env.d.ts`

**Files:**
- Create: `.env.example`
- Create: `src/env.d.ts`
- Verify: `.env` exists locally (user already has — do not overwrite)

- [ ] **Step 1: Create `.env.example`**

Write `.env.example`:
```
# Backend API base URL (no trailing slash)
# Dev:    http://localhost:3000/api
# Stage:  https://api.stage.cybercover.pl/api
# Prod:   https://api.cybercover.pl/api
PUBLIC_API_BASE_URL=http://localhost:3000/api

# Feature flag: use hardcoded catalog mock instead of hitting backend.
# Set to `false` when backend implements pricing-catalog-changes.md.
PUBLIC_USE_MOCK_CATALOG=true

# Feature flag: use in-memory orders mock (for local dev when backend
# doesn't recognize mock `ce_mock_*` catalogEntryIds).
PUBLIC_USE_MOCK_ORDERS=false
```

- [ ] **Step 2: Create `src/env.d.ts`**

Write `src/env.d.ts`:
```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_USE_MOCK_CATALOG?: string;
  readonly PUBLIC_USE_MOCK_ORDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors related to env vars.

- [ ] **Step 4: Checkpoint**

---

### Task 1.12: Create `CheckoutHeader.astro` and `CheckoutLayout.astro`

**Files:**
- Create: `src/components/CheckoutHeader.astro`
- Create: `src/layouts/CheckoutLayout.astro`

- [ ] **Step 1: Create `CheckoutHeader.astro`**

Write `src/components/CheckoutHeader.astro` — adapt reference's CheckoutHeader to current project's design tokens (Plus Jakarta Sans, brand-bg, brand-border):

```astro
---
export interface Props {
  showBackButton?: boolean;
  backHref?: string;
}

const { showBackButton = false, backHref = '/cennik' } = Astro.props;
---

<header
  class="fixed top-0 left-0 right-0 z-50"
  id="site-header"
>
  <div class="max-w-[1480px] mx-auto px-5 py-4">
    <div class="flex items-center justify-between bg-brand-bg border border-brand-border rounded-full px-6 h-[70px]">
      <a href="/" class="shrink-0" aria-label="Strona główna CyberCover">
        <img
          src="/img/logo-cyber-cover.svg"
          alt="logo Cyber Cover"
          width="250"
          height="39"
          class="h-[39px] w-auto"
        />
      </a>

      {showBackButton && (
        <a
          href={backHref}
          class="inline-flex items-center gap-2 rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-black hover:bg-white transition-colors font-['Plus_Jakarta_Sans',sans-serif]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M8 2L3 7L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Powrót
        </a>
      )}
    </div>
  </div>
</header>
```

- [ ] **Step 2: Create `CheckoutLayout.astro`**

Write `src/layouts/CheckoutLayout.astro`. Read existing `src/layouts/BaseLayout.astro` first to understand the head structure (GTM, cookie consent, fonts) — copy that head verbatim. Body uses CheckoutHeader instead of Header, no Footer:

```astro
---
import CheckoutHeader from '../components/CheckoutHeader.astro';
// Read BaseLayout.astro to copy: GTM script, cookie consent, font links, JSON-LD, meta tags
// Use the same <head> structure here. Do NOT use BaseLayout — different body composition.

export interface Props {
  title: string;
  description?: string;
  showBackButton?: boolean;
  backHref?: string;
}

const { title, description, showBackButton = true, backHref = '/cennik' } = Astro.props;
---

<!doctype html>
<html lang="pl">
  <head>
    <!-- COPY FROM BaseLayout.astro: meta charset, viewport, favicon, GTM script, cookie consent script, font preconnect+links, robots noindex, JSON-LD -->
    <title>{title}</title>
    <meta name="description" content={description ?? 'CyberCover — proces zamówienia'} />
    <meta name="robots" content="noindex, nofollow" />
  </head>
  <body class="font-['Plus_Jakarta_Sans',sans-serif] bg-white">
    <CheckoutHeader showBackButton={showBackButton} backHref={backHref} />
    <main class="min-h-screen pt-[100px]">
      <slot />
    </main>
  </body>
</html>
```

**Critical:** the engineer must read `src/layouts/BaseLayout.astro` and copy verbatim its head section (GTM, cookies, fonts, etc.). Comment placeholder `COPY FROM BaseLayout.astro` must be replaced with actual head content.

- [ ] **Step 3: Verify Astro build still works**

Run:
```bash
pnpm build
```
Expected: build succeeds. CheckoutLayout is unused yet, but should not break.

- [ ] **Step 4: Checkpoint**

---

### Task 1.13: Port `data/industries.ts`

**Files:**
- Create: `src/data/industries.ts`

- [ ] **Step 1: Copy from reference**

Copy `docs/cc-strona-landing-astro/src/data/industries.ts` to `src/data/industries.ts` verbatim.

- [ ] **Step 2: Verify**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Checkpoint — END OF PHASE 1**

User reviews and may commit. Phase 1 complete: all `lib/*` is in place, tests pass, environment configured. UI not yet touched.

---

## Phase 2 — Cennik (PricingCards, render-policy, PartnerBanner)

> Phase 2 produces the new `/cennik` page. After Phase 2: `pnpm dev`, navigate to `/cennik`, see 4 plans rendered from mock data; clicking CTA should navigate to `/checkout/company-data?orderId=...` (which won't render content yet — that's Phase 3).

### Task 2.1: Move PricingCard to new location

**Files:**
- Move: `src/app/components/PricingCard.tsx` → `src/components/pricing/PricingCard.tsx`

- [ ] **Step 1: Create destination directory**

```bash
mkdir -p src/components/pricing
```

- [ ] **Step 2: Move file (preserve content)**

Read `src/app/components/PricingCard.tsx` content fully. Write the same content to `src/components/pricing/PricingCard.tsx`. Then delete the original (use Bash `rm`):
```bash
rm src/app/components/PricingCard.tsx
```

(Note: subagent should use Read + Write rather than `mv` to preserve clean read-then-write workflow; `rm` is acceptable for cleanup.)

**Do NOT modify the file content.** This is the design we are preserving.

- [ ] **Step 3: Verify TypeScript still compiles**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: errors about unresolved imports of PricingCard from old path (in PricingPage.tsx etc.) — these are fine; will be fixed in Task 4.x cleanup. NO errors should originate from `src/components/pricing/PricingCard.tsx` itself.

- [ ] **Step 4: Checkpoint**

---

### Task 2.2: Create `lib/catalog/render-policy.ts`

**Files:**
- Create: `src/lib/catalog/render-policy.ts`
- Create: `src/lib/catalog/render-policy.test.ts`

- [ ] **Step 1: Read source data and target props interface**

Read these files for context:
- `src/components/pricing/PricingCard.tsx` (PricingCardProps interface)
- `src/app/pages/PricingPage.tsx` (lines 108-351 — pricingTiers data structure with all current copy/highlights/spacers/icons)
- `src/lib/api/types/catalog.ts` (PlanCatalogEntryDto, FeatureMap)

- [ ] **Step 2: Write `render-policy.ts`**

Create `src/lib/catalog/render-policy.ts`:

```ts
import type { PlanCatalogEntryDto, FeatureMap } from '../api/types/catalog';
import type { BillingCycle, MoneyDto } from '../api/types/money';

// FeatureSection / FeatureItem types must match those used by PricingCard.tsx.
// Re-declare here to avoid coupling render-policy to component file location.
export interface FeatureItem {
  text: string;
  highlight?: 'yellow' | 'blue' | 'red';
  spacer?: boolean;
}

export interface FeatureSection {
  title: string;
  icon?: 'shield' | 'pulse' | 'chat' | 'alert' | 'insurance' | 'education' | 'users';
  items: FeatureItem[];
}

export interface PricingCardData {
  title: string;
  description?: string;
  ctaText?: string;
  ctaStyle?: 'outline' | 'black' | 'primary' | 'yellow';
  features: FeatureSection[];
  highlighted?: boolean;
  price: string;
  yearlyPrice?: string;
  originalPrice?: string;
  originalYearlyPrice?: string;
  hasDiscount?: boolean;
  promoHeader?: string;
  promoSubtext?: string;
  savingsBadge?: string;
}

type PlanTier = 'entry' | 'mid' | 'high' | 'top';

const TIER_HIGHLIGHT: Record<PlanTier, 'yellow' | 'blue' | 'red' | null> = {
  entry: null,
  mid: 'blue',
  high: 'yellow',
  top: 'red',
};

const TIER_CTA_STYLE: Record<PlanTier, 'outline' | 'yellow'> = {
  entry: 'outline',
  mid: 'yellow',
  high: 'outline',
  top: 'outline',
};

// Polish display name (backend returns English planName per spec D9 / pricing-catalog-changes § 4.6 Option B)
const PLAN_NAME_PL: Record<string, string> = {
  Standard: 'Standard',
  Optimum: 'Optimum',
  Professional: 'Profesjonalny',
  Expert: 'Ekspert',
};

interface ItemDef {
  visibleWhen?: (f: FeatureMap) => boolean;
  text: string | ((f: FeatureMap) => string);
  emphasize?: boolean;
  spacer?: boolean;
  onlyIfTier?: PlanTier[];
}

interface SectionDef {
  title: string;
  icon: NonNullable<FeatureSection['icon']>;
  items: ItemDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: 'Ocena bezpieczeństwa',
    icon: 'shield',
    items: [
      { visibleWhen: f => f['feature.securityAssessment.legal'] === 'true', text: 'Zgodność z prawem' },
      { visibleWhen: f => f['feature.securityAssessment.technical'] === 'true', text: 'Odporność techniczna' },
      { visibleWhen: f => f['feature.securityAssessment.people'] === 'true', text: 'Świadomi ludzie' },
      { visibleWhen: f => f['feature.securityAssessment.report'] === 'detailed', text: 'Szczegółowe zalecenia i wytyczne' },
      { visibleWhen: f => f['feature.securityAssessment.report'] === 'general', text: 'Raport ogólny' },
      { spacer: true, onlyIfTier: ['entry'], text: '' },
    ],
  },
  {
    title: 'Monitoring zagrożeń',
    icon: 'pulse',
    items: [
      { visibleWhen: f => f['feature.monitoring.email'] === 'true', text: 'Sprawdzanie adresów e-mail i danych osobistych' },
      { visibleWhen: f => f['feature.monitoring.web'] === 'true', text: 'Monitoring strony www' },
    ],
  },
  {
    title: 'Konsultacje z ekspertami',
    icon: 'chat',
    items: [
      {
        visibleWhen: f => Boolean(f['feature.consultation.timesPerYear']),
        text: f => {
          const v = f['feature.consultation.timesPerYear'];
          return v === 'unlimited' ? '**bez limitu**' : `**${v}x w roku**`;
        },
        emphasize: true,
      },
    ],
  },
  {
    title: 'Natychmiastowa pomoc 24h',
    icon: 'alert',
    items: [
      { visibleWhen: f => f['feature.incidentResponse'] === 'true', text: 'W razie incydentu lub ataku' },
      { visibleWhen: f => f['feature.incidentResponse'] === 'true', text: 'Koordynacja działań' },
      { visibleWhen: f => f['feature.incidentResponse'] === 'true', text: 'Obsługa prawna' },
      { visibleWhen: f => f['feature.incidentResponse'] === 'true', text: 'Wsparcie PRowe' },
    ],
  },
  {
    title: 'Ubezpieczenie',
    icon: 'insurance',
    items: [
      {
        visibleWhen: f => Boolean(f['feature.insurance.coverageAmount']),
        text: f => `do wysokości: **${formatPLN(f['feature.insurance.coverageAmount'])} zł**`,
        emphasize: true,
      },
      {
        visibleWhen: f => f['feature.insurance.deductible'] !== undefined,
        text: f => `udział własny: **${formatPLN(f['feature.insurance.deductible'])} zł**`,
        emphasize: true,
      },
      { visibleWhen: f => f['feature.insurance.includesThirdPartyClaims'] === 'true', text: 'Roszczenia stron trzecich' },
      { visibleWhen: f => f['feature.insurance.includesAdminProceedings'] === 'true', text: 'Postępowania przed organami nadzoru' },
      { visibleWhen: f => f['feature.insurance.includesGdprFines'] === 'true', text: 'Kary administracyjne RODO' },
      { visibleWhen: f => f['feature.insurance.includesRansomCosts'] === 'true', text: 'Koszty okupu i wymuszeń' },
      { visibleWhen: f => f['feature.insurance.includesLostProfit'] === 'true', text: 'Utracony zysk', emphasize: true },
    ],
  },
  {
    title: 'Szkolenia z bezpieczeństwa',
    icon: 'education',
    items: [
      {
        visibleWhen: f => Boolean(f['feature.training.online.timesPerYear']),
        text: f => `On-line ${f['feature.training.online.timesPerYear']}x w roku`,
        emphasize: true,
      },
    ],
  },
  {
    title: 'Wielodostęp',
    icon: 'users',
    items: [
      { visibleWhen: f => f['feature.multiUser.accountSwitching'] === 'true', text: 'Przełączanie się między kontami' },
      { visibleWhen: f => f['feature.multiUser.partnerDataView'] === 'true', text: 'Wgląd w dane i konfigurację partnerów' },
    ],
  },
];

function formatPLN(value: string | undefined): string {
  if (!value) return '0';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(n);
}

function formatMoneyMinor(amount: number, currency: string = 'PLN'): string {
  // Backend prices are in grosze (1 PLN = 100 grosze)
  const major = Math.round(amount / 100);
  return `${new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(major)} zł`;
}

function buildSection(def: SectionDef, plan: PlanCatalogEntryDto, tier: PlanTier, highlight: 'yellow' | 'blue' | 'red' | null): FeatureSection {
  const items: FeatureItem[] = def.items
    .filter(item => {
      if (item.spacer && item.onlyIfTier) return item.onlyIfTier.includes(tier);
      if (item.spacer) return true;
      return item.visibleWhen ? item.visibleWhen(plan.features) : true;
    })
    .map<FeatureItem>(item => {
      if (item.spacer) return { text: '', spacer: true };
      const text = typeof item.text === 'function' ? item.text(plan.features) : item.text;
      const itemOut: FeatureItem = { text };
      if (item.emphasize && highlight) itemOut.highlight = highlight;
      return itemOut;
    });
  return { title: def.title, icon: def.icon, items };
}

function derivePricingProps(plan: PlanCatalogEntryDto, billingCycle: BillingCycle) {
  const monthly = plan.monthlyPrice;
  const annual = plan.annualPrice;
  const discount = plan.discount;

  // Determine which price to show as primary based on billingCycle
  const primaryPrice = billingCycle === 'MONTHLY' ? monthly : annual;
  const cycleSuffix = billingCycle === 'MONTHLY' ? 'miesięcznie' : 'miesięcznie'; // both show monthly rate; yearly total in second line
  const _ = cycleSuffix; // keep reference

  // After-discount monthly price (for primary number when discount applies and not promo-period)
  let displayMonthly: MoneyDto = monthly;
  let displayAnnual: MoneyDto = annual;
  let originalMonthly: MoneyDto | null = null;
  let originalAnnual: MoneyDto | null = null;
  let promoHeader: string | undefined;
  let promoSubtext: string | undefined;

  if (discount?.eligible) {
    const isPromoPeriod = discount.promotionalDuration?.applicableBillingCycle === 'MONTHLY';
    if (isPromoPeriod && billingCycle === 'MONTHLY' && discount.monthlyPriceAfterDiscount) {
      // Promo period: show "X zł" strikethrough + promo subtext
      promoHeader = formatMoneyMinor(monthly.amount, monthly.currency);
      promoSubtext = `przez ${discount.promotionalDuration?.months} miesięcy`;
      displayMonthly = discount.monthlyPriceAfterDiscount;
    } else if (discount.monthlyPriceAfterDiscount && discount.annualPriceAfterDiscount) {
      // Standard discount: strikethrough original, show after-discount
      originalMonthly = monthly;
      originalAnnual = annual;
      displayMonthly = discount.monthlyPriceAfterDiscount;
      displayAnnual = discount.annualPriceAfterDiscount;
    }
  }

  // yearlyPrice is monthly rate × 12 with currency, formatted: "3 540 zł netto/rok"
  const yearlyTotal = (displayAnnual.amount * 12) / 100;
  const yearlyPrice = `${new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(Math.round(yearlyTotal))} zł netto/rok`;
  let originalYearlyPrice: string | undefined;
  if (originalAnnual) {
    const originalYearlyTotal = (originalAnnual.amount * 12) / 100;
    originalYearlyPrice = `${new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(Math.round(originalYearlyTotal))} zł netto/rok`;
  }

  // savingsBadge: only when no discount and showing yearly billing
  let savingsBadge: string | undefined;
  if (!discount?.eligible) {
    // Backend convention: monthlyPrice = 1.2 * annualPrice (monthly when billed monthly is more expensive)
    const yearlyIfMonthly = (monthly.amount * 12) / 100;
    const yearlyIfAnnual = (annual.amount * 12) / 100;
    const savings = yearlyIfMonthly - yearlyIfAnnual;
    if (savings > 0) {
      savingsBadge = `${new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(Math.round(savings))} zł`;
    }
  }

  return {
    price: formatMoneyMinor(displayMonthly.amount, displayMonthly.currency),
    yearlyPrice,
    originalPrice: originalMonthly ? formatMoneyMinor(originalMonthly.amount, originalMonthly.currency) : undefined,
    originalYearlyPrice,
    hasDiscount: Boolean(discount?.eligible),
    promoHeader,
    promoSubtext,
    savingsBadge,
  };
}

export function planToCardData(plan: PlanCatalogEntryDto, billingCycle: BillingCycle): PricingCardData {
  const tier = (plan.tier ?? 'entry') as PlanTier;
  const highlight = TIER_HIGHLIGHT[tier];

  const features = SECTIONS
    .map(s => buildSection(s, plan, tier, highlight))
    .filter(s => s.items.length > 0);

  const pricingProps = derivePricingProps(plan, billingCycle);

  return {
    title: PLAN_NAME_PL[plan.planName] ?? plan.planName,
    description: plan.description,
    ctaText: plan.ctaLabel ?? plan.features.ctaLabel ?? 'Wybierz plan',
    ctaStyle: TIER_CTA_STYLE[tier],
    highlighted: plan.recommended,
    features,
    ...pricingProps,
  };
}
```

- [ ] **Step 3: Write tests**

Create `src/lib/catalog/render-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planToCardData } from './render-policy';
import type { PlanCatalogEntryDto } from '../api/types/catalog';

const STANDARD_PLAN: PlanCatalogEntryDto = {
  catalogEntryId: 'CE-1',
  planId: 'P-1',
  code: 'standard',
  planName: 'Standard',
  description: 'Podstawowa ochrona dla małych firm.',
  displayOrder: 1,
  recommended: false,
  tier: 'entry',
  ctaLabel: 'Rozpocznij ze Standard',
  annualPrice: { amount: 29500, currency: 'PLN' },
  monthlyPrice: { amount: 35400, currency: 'PLN' },
  features: {
    'feature.securityAssessment.legal': 'true',
    'feature.securityAssessment.technical': 'true',
    'feature.securityAssessment.report': 'general',
    'feature.monitoring.email': 'true',
    'feature.monitoring.web': 'true',
  },
  discount: null,
};

const OPTIMUM_PLAN: PlanCatalogEntryDto = {
  ...STANDARD_PLAN,
  code: 'optimum',
  planName: 'Optimum',
  recommended: true,
  tier: 'mid',
  ctaLabel: 'Wybierz Optimum',
  annualPrice: { amount: 49500, currency: 'PLN' },
  monthlyPrice: { amount: 59400, currency: 'PLN' },
  features: {
    ...STANDARD_PLAN.features,
    'feature.securityAssessment.people': 'true',
    'feature.securityAssessment.report': 'detailed',
    'feature.consultation.timesPerYear': '10',
    'feature.incidentResponse': 'true',
    'feature.insurance.coverageAmount': '1000000',
    'feature.insurance.deductible': '5000',
    'feature.insurance.includesThirdPartyClaims': 'true',
    'feature.insurance.includesAdminProceedings': 'true',
    'feature.insurance.includesGdprFines': 'true',
    'feature.insurance.includesRansomCosts': 'true',
  },
};

describe('planToCardData', () => {
  it('maps Standard plan to card data with general report and Polish name', () => {
    const data = planToCardData(STANDARD_PLAN, 'ANNUAL');
    expect(data.title).toBe('Standard');
    expect(data.ctaText).toBe('Rozpocznij ze Standard');
    expect(data.ctaStyle).toBe('outline');
    expect(data.highlighted).toBe(false);
    expect(data.price).toBe('295 zł');
    const securitySection = data.features.find(s => s.title === 'Ocena bezpieczeństwa');
    expect(securitySection?.items.some(i => i.text === 'Raport ogólny')).toBe(true);
    expect(securitySection?.items.some(i => i.spacer)).toBe(true); // entry tier spacer
  });

  it('maps Optimum to mid-tier with blue highlights and Polish name', () => {
    const data = planToCardData(OPTIMUM_PLAN, 'ANNUAL');
    expect(data.title).toBe('Optimum');
    expect(data.ctaStyle).toBe('yellow');
    expect(data.highlighted).toBe(true);
    const consult = data.features.find(s => s.title === 'Konsultacje z ekspertami');
    expect(consult?.items[0].text).toBe('**10x w roku**');
    expect(consult?.items[0].highlight).toBe('blue');
    const insurance = data.features.find(s => s.title === 'Ubezpieczenie');
    const coverage = insurance?.items.find(i => i.text.includes('1 000 000'));
    expect(coverage?.highlight).toBe('blue');
  });

  it('renders Polish display name for Professional', () => {
    const plan: PlanCatalogEntryDto = { ...OPTIMUM_PLAN, planName: 'Professional', tier: 'high' };
    const data = planToCardData(plan, 'ANNUAL');
    expect(data.title).toBe('Profesjonalny');
  });

  it('renders Polish display name for Expert', () => {
    const plan: PlanCatalogEntryDto = { ...OPTIMUM_PLAN, planName: 'Expert', tier: 'top' };
    const data = planToCardData(plan, 'ANNUAL');
    expect(data.title).toBe('Ekspert');
  });

  it('shows promo header when discount has promotional duration on monthly cycle', () => {
    const plan: PlanCatalogEntryDto = {
      ...STANDARD_PLAN,
      discount: {
        code: 'TIMEBOUND_DEMO',
        description: 'Trial 3 miesiące',
        kind: 'PARTNER_TIMEBOUND',
        eligible: true,
        annualPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        monthlyPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        annualDiscountAmount: { amount: 29500, currency: 'PLN' },
        monthlyDiscountAmount: { amount: 35400, currency: 'PLN' },
        promotionalDuration: { months: 3, applicableBillingCycle: 'MONTHLY' },
        partnerName: 'ValveTech',
        partnerLogoUrl: '/img/partners/valvetech.svg',
      },
    };
    const data = planToCardData(plan, 'MONTHLY');
    expect(data.promoHeader).toBe('354 zł');
    expect(data.promoSubtext).toBe('przez 3 miesięcy');
    expect(data.price).toBe('0 zł');
  });

  it('shows strikethrough original price for partner flat discount', () => {
    const plan: PlanCatalogEntryDto = {
      ...STANDARD_PLAN,
      discount: {
        code: 'VALVETECH',
        description: 'Rabat 5%',
        kind: 'PARTNER_FLAT',
        eligible: true,
        annualPriceAfterDiscount: { amount: 28025, currency: 'PLN' },
        monthlyPriceAfterDiscount: { amount: 33630, currency: 'PLN' },
        annualDiscountAmount: { amount: 1475, currency: 'PLN' },
        monthlyDiscountAmount: { amount: 1770, currency: 'PLN' },
        promotionalDuration: null,
        partnerName: 'ValveTech',
        partnerLogoUrl: '/img/partners/valvetech.svg',
      },
    };
    const data = planToCardData(plan, 'MONTHLY');
    expect(data.hasDiscount).toBe(true);
    expect(data.originalPrice).toBe('354 zł');
    expect(data.price).toBe('336 zł');
  });

  it('shows savings badge for yearly billing without discount', () => {
    const data = planToCardData(STANDARD_PLAN, 'ANNUAL');
    // monthly rate: 354 zł × 12 = 4248 zł; annual rate: 295 zł × 12 = 3540 zł; savings = 708 zł
    expect(data.savingsBadge).toBe('708 zł');
  });

  it('omits savings badge when discount is active', () => {
    const plan: PlanCatalogEntryDto = {
      ...STANDARD_PLAN,
      discount: {
        code: 'X', description: '', kind: 'CODE_FLAT', eligible: true,
        annualPriceAfterDiscount: { amount: 26500, currency: 'PLN' },
        monthlyPriceAfterDiscount: { amount: 31800, currency: 'PLN' },
        annualDiscountAmount: { amount: 3000, currency: 'PLN' },
        monthlyDiscountAmount: { amount: 3600, currency: 'PLN' },
        promotionalDuration: null, partnerName: null, partnerLogoUrl: null,
      },
    };
    const data = planToCardData(plan, 'ANNUAL');
    expect(data.savingsBadge).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test:run src/lib/catalog
```
Expected: all tests pass.

- [ ] **Step 5: Checkpoint**

---

### Task 2.3: Create `BillingCycleToggle.tsx`

**Files:**
- Create: `src/components/pricing/BillingCycleToggle.tsx`

- [ ] **Step 1: Read current toggle markup**

Read `src/app/pages/PricingPage.tsx` lines 477-510 (Billing Period Toggle section). This is the source of truth for visual design.

- [ ] **Step 2: Write component**

Create `src/components/pricing/BillingCycleToggle.tsx`:

```tsx
import type { BillingCycle } from '../../lib/api/types/money';

interface Props {
  value: BillingCycle;
  onChange: (next: BillingCycle) => void;
}

export function BillingCycleToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] text-[#413f3b] tracking-[-0.14px]">
        Umowa roczna. Wybierz rodzaj płatności.
      </p>
      <div className="inline-flex items-center bg-white rounded-[10px] p-1 border border-[#EAEAE8]">
        <button
          type="button"
          onClick={() => onChange('MONTHLY')}
          className={`px-6 py-2 rounded-[8px] font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] tracking-[-0.14px] transition-all cursor-pointer ${
            value === 'MONTHLY'
              ? 'bg-black text-white'
              : 'bg-transparent text-[#413f3b] hover:text-black'
          }`}
        >
          Miesięczna
        </button>
        <button
          type="button"
          onClick={() => onChange('ANNUAL')}
          className={`px-6 py-2 rounded-[8px] font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] tracking-[-0.14px] transition-all cursor-pointer ${
            value === 'ANNUAL'
              ? 'bg-black text-white'
              : 'bg-transparent text-[#413f3b] hover:text-black'
          }`}
        >
          Rocznie
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Checkpoint**

---

### Task 2.4: Create `PartnerBanner.tsx`

**Files:**
- Create: `src/components/pricing/PartnerBanner.tsx`

- [ ] **Step 1: Read current banner markup**

Read `src/app/pages/PricingPage.tsx` lines 444-470 (Partner Discount Badge — `bg-[#DDEEF8] rounded-[12px] px-5 py-3 flex items-center gap-6`).

- [ ] **Step 2: Write component**

Create `src/components/pricing/PartnerBanner.tsx`:

```tsx
interface Props {
  partnerName: string;
  partnerLogoUrl: string | null;
  description: string;
}

export function PartnerBanner({ partnerName, partnerLogoUrl, description }: Props) {
  return (
    <div className="flex justify-center mb-6">
      <div className="bg-[#DDEEF8] rounded-[12px] px-5 py-3 flex items-center gap-6 transition-opacity duration-300">
        <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-[16px] text-[#0D0D0D] tracking-[-0.16px] leading-[24px]">
          {description}
        </p>
        {partnerLogoUrl && (
          <img
            src={partnerLogoUrl}
            alt={partnerName}
            className="h-6 w-auto"
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Checkpoint**

---

### Task 2.5: Create `PricingCards.tsx` orchestrator

**Files:**
- Create: `src/components/pricing/PricingCards.tsx`

- [ ] **Step 1: Read reference orchestrator for logic**

Read `docs/cc-strona-landing-astro/src/components/pricing/PricingCards.tsx` for state management, error handling, and partner attribution logic.

- [ ] **Step 2: Write React port**

Create `src/components/pricing/PricingCards.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { BillingCycle } from '../../lib/api/types/money';
import type { PlanCatalogEntryDto, PlanCatalogResponseDto } from '../../lib/api/types/catalog';
import { getPlans } from '../../lib/api/catalog';
import { startOrder } from '../../lib/api/orders';
import { setFromStartOrderResponse } from '../../lib/state/order-session';
import { getPartnerFromUrl } from '../../lib/format/partner';
import { getDiscountCodeFromUrl, clearDiscountCode } from '../../lib/format/discount-code';
import { translateApiError } from '../../lib/errors/translate';
import { planToCardData } from '../../lib/catalog/render-policy';
import { BillingCycleToggle } from './BillingCycleToggle';
import { PartnerBanner } from './PartnerBanner';
import { PricingCard } from './PricingCard';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; plans: PlanCatalogResponseDto }
  | { kind: 'error'; title: string; message: string };

export function PricingCards() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('ANNUAL');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [ctaError, setCtaError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    const partnerCode = getPartnerFromUrl() ?? undefined;
    const discountCode = getDiscountCodeFromUrl() ?? undefined;

    getPlans(discountCode, partnerCode)
      .then(plans => {
        if (cancelled) return;
        const sorted = [...plans].sort((a, b) => a.displayOrder - b.displayOrder);
        setState({ kind: 'ready', plans: sorted });
      })
      .catch(err => {
        if (cancelled) return;
        const t = translateApiError(err);
        setState({ kind: 'error', title: t.title, message: t.message });
      });

    return () => { cancelled = true; };
  }, []);

  const onCtaClick = async (plan: PlanCatalogEntryDto) => {
    setLoadingPlanId(plan.planId);
    setCtaError(null);

    try {
      const partnerFromUrl = getPartnerFromUrl();
      const discountCodeFromUrl = getDiscountCodeFromUrl();
      const previewKind = plan.discount?.kind ?? null;
      const isPartnerKindPreview =
        previewKind === 'PARTNER_FLAT' ||
        previewKind === 'PARTNER_COMPOSITE' ||
        previewKind === 'PARTNER_TIMEBOUND';

      let partnerCode: string | undefined = partnerFromUrl ?? undefined;
      if (!partnerCode && discountCodeFromUrl && isPartnerKindPreview) {
        partnerCode = discountCodeFromUrl;
        clearDiscountCode();
      }

      const response = await startOrder({
        catalogEntryId: plan.catalogEntryId,
        billingCycle,
        partnerCode,
      });
      const price = billingCycle === 'MONTHLY' ? plan.monthlyPrice : plan.annualPrice;
      setFromStartOrderResponse(response, {
        catalogEntryId: plan.catalogEntryId,
        billingCycle,
        partnerCode,
        plan: {
          planName: plan.planName,
          priceMinorUnits: price.amount,
          currency: price.currency,
          description: plan.description,
        },
      });
      window.location.assign(`/checkout/company-data?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (err) {
      const t = translateApiError(err);
      setCtaError({ title: t.title, message: t.message });
      setLoadingPlanId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="py-20 text-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]" role="status">
        Ładowanie cennika…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-[12px] border border-red-300 bg-red-50 p-6 text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <h3 className="text-lg font-semibold text-red-700">{state.title}</h3>
        <p className="mt-2 text-sm text-red-700">{state.message}</p>
      </div>
    );
  }

  // Resolve partner banner: any plan with a partnerName?
  const partnerPlan = state.plans.find(p => p.discount?.partnerName);
  const partnerBanner = partnerPlan?.discount
    ? {
        partnerName: partnerPlan.discount.partnerName!,
        partnerLogoUrl: partnerPlan.discount.partnerLogoUrl,
        description: partnerPlan.discount.description,
      }
    : null;

  return (
    <>
      {partnerBanner && <PartnerBanner {...partnerBanner} />}

      <div className="flex justify-center mb-12">
        <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
      </div>

      {ctaError && (
        <div role="alert" className="mx-auto mb-8 max-w-md rounded-[12px] border border-red-300 bg-red-50 p-4 text-center font-['Plus_Jakarta_Sans',sans-serif]">
          <h4 className="text-sm font-semibold text-red-700">{ctaError.title}</h4>
          <p className="text-xs text-red-700">{ctaError.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 justify-items-center">
        {state.plans.map(plan => {
          const data = planToCardData(plan, billingCycle);
          return (
            <PricingCard
              key={plan.planId}
              {...data}
              onSelect={() => onCtaClick(plan)}
              {...(loadingPlanId === plan.planId && { ctaText: 'Ładowanie…' })}
            />
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: clean (modulo unrelated errors from `src/app/` cleanup pending).

- [ ] **Step 4: Checkpoint**

---

### Task 2.6: Refactor `cennik.astro`

**Files:**
- Modify: `src/pages/cennik.astro`

- [ ] **Step 1: Read current cennik.astro**

Read `src/pages/cennik.astro`. Current content imports old `PricingApp`.

- [ ] **Step 2: Replace with new structure**

Overwrite `src/pages/cennik.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { PricingCards } from '../components/pricing/PricingCards';
---

<BaseLayout
  title="Cennik — CyberCover"
  description="Wybierz plan ochrony dostosowany do potrzeb Twojej firmy: Standard, Optimum, Profesjonalny lub Ekspert."
>
  <main class="min-h-screen bg-[#F8F7F4] pt-32 pb-20">
    <div class="max-w-7xl mx-auto px-4">
      <div class="text-center mb-12">
        <h1 class="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl md:text-5xl text-[#0D0D0D] mb-4 tracking-tight">
          Cennik
        </h1>
        <p class="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-lg text-[#6B6965]">
          Wybierz plan ochrony dostosowany do potrzeb Twojej firmy
        </p>
      </div>

      <PricingCards client:load />
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 3: Build the project**

Run:
```bash
pnpm build
```
Expected: build may fail due to `PricingApp` import from `src/pages/checkout/[...step].astro` — that's expected and will be cleaned in Phase 4. For NOW, temporarily delete that file:

```bash
rm src/pages/checkout/[...step].astro
```

Then re-run `pnpm build`. Expected: clean build.

- [ ] **Step 4: Manual verification**

Run:
```bash
pnpm dev
```
Open `http://localhost:4321/cennik` in browser.
Expected:
- Page loads with header (BaseLayout) + 4 plan cards rendered
- Mock data populates: Standard, Optimum (highlighted yellow border), Profesjonalny, Ekspert
- Highlight colors per tier: Optimum blue, Profesjonalny yellow, Ekspert red
- Toggle Miesięczna ↔ Rocznie changes prices
- Console: no errors

Test partner URL:
- Open `http://localhost:4321/cennik?partner=VALVETECH`
- Mock should return discount preview for at least Standard plan
- Banner with "Rabat partnerski ValveTech 5%" appears above cards
- Strikethrough prices on cards

If anything is broken, debug before continuing.

- [ ] **Step 5: Checkpoint — END OF PHASE 2**

User reviews `/cennik` works end-to-end before proceeding to checkout.

---

## Phase 3 — Checkout (8 stron + komponenty)

> Phase 3 produces all 8 checkout pages working end-to-end with mocks (`PUBLIC_USE_MOCK_ORDERS=true`). After Phase 3: full flow possible: cennik → company-data → personal-data → operational-standards → payment-method → confirm → bank-transfer/success/cancelled.

### Task 3.1: Create shared form components

**Files:**
- Create: `src/components/checkout/FormField.tsx`
- Create: `src/components/checkout/FormStep.tsx`
- Create: `src/components/checkout/FormActions.tsx`
- Create: `src/components/checkout/FormAlert.tsx`

- [ ] **Step 1: Port FormField from reference**

Source: `docs/cc-strona-landing-astro/src/components/checkout/FormField.tsx`. Read it.

Create `src/components/checkout/FormField.tsx` adapted to React:
- Imports `from 'preact'` → remove or convert to React types
- Imports `from 'preact/hooks'` → `from 'react'`
- `class=` → `className=`
- `onInput` → `onChange`
- Style with current project's design tokens: input height `48px`, `bg-white border-[1.2px] border-[#E4E2DF] rounded-[8px]`, focus ring `#FED64B`
- Label: uppercase, `text-[13px] text-[#6b6965] tracking-[0.26px]`
- Error: `text-red-500 text-xs mt-1`

The component should work with `react-hook-form`'s `register` pattern (forwardRef + standard input props).

Reference behavior to preserve:
- Optional `error` prop
- Optional `hint` prop
- Optional `type` prop (text | email | tel | number | select)
- For `type="select"`, accept `options: { value: string; label: string }[]`

- [ ] **Step 2: Port FormStep from reference**

Source: `docs/cc-strona-landing-astro/src/components/checkout/FormStep.tsx`. Read.

Create `src/components/checkout/FormStep.tsx` adapted to React. This is a section wrapper:
- Title (`<h2>` w `font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-lg text-black mb-6`)
- Background `bg-[#f8f7f4] rounded-[12px] p-6`
- Children inside `space-y-4`

Pattern matches `OrderDetailsStep.tsx` lines 195-198 in current code.

- [ ] **Step 3: Port FormActions from reference**

Source: `docs/cc-strona-landing-astro/src/components/checkout/FormActions.tsx`. Read.

Create `src/components/checkout/FormActions.tsx`. Two buttons:
- Back (outline): `bg-white border border-[#A2A09C] text-[#0D0D0D] hover:bg-[#F8F7F4] rounded-[80px] px-7 py-3 font-medium text-[15px]`
- Submit (yellow): `bg-[#FED64B] text-[#0D0D0D] hover:bg-[#FFC107] rounded-[80px] px-7 py-3 font-medium text-[15px]`

Props: `onBack: () => void`, `submitLabel: string`, `submitDisabled?: boolean`, `submitting?: boolean`.

- [ ] **Step 4: Port FormAlert from reference**

Source: `docs/cc-strona-landing-astro/src/components/checkout/FormAlert.tsx`. Read.

Create `src/components/checkout/FormAlert.tsx`. Red bordered box:
```
bg-red-50 border border-red-300 rounded-[12px] p-4 mb-6
- title: text-red-700 font-semibold text-sm
- message: text-red-700 text-xs mt-1
```

Props: `title: string`, `message: string`.

- [ ] **Step 5: Verify TypeScript**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Checkpoint**

---

### Task 3.2: Create CheckoutProgressBar (5 steps, current design)

**Files:**
- Create: `src/components/checkout/CheckoutProgressBar.tsx`

- [ ] **Step 1: Read current progress bar**

Read `src/app/components/checkout/CheckoutProgressBar.tsx` for design (lines 11-93).

- [ ] **Step 2: Write new version with 5 steps**

Create `src/components/checkout/CheckoutProgressBar.tsx`. Same visual design as current, but step list updated to backend-aligned flow:

```tsx
interface Step {
  number: number;
  label: string;
  path: string;
}

interface CheckoutProgressBarProps {
  currentStep: number;
}

const STEPS: Step[] = [
  { number: 1, label: 'Dane firmy',          path: '/checkout/company-data' },
  { number: 2, label: 'Dane osobiste',       path: '/checkout/personal-data' },
  { number: 3, label: 'Standardy',           path: '/checkout/operational-standards' },
  { number: 4, label: 'Płatność',            path: '/checkout/payment-method' },
  { number: 5, label: 'Potwierdzenie',       path: '/checkout/confirm' },
];

export function CheckoutProgressBar({ currentStep }: CheckoutProgressBarProps) {
  return (
    <div className="mb-12">
      <div className="max-w-4xl mx-auto">
        {/* Desktop */}
        <div className="hidden md:flex items-start justify-between">
          {STEPS.map((step, index) => (
            <div key={step.number} className="flex items-start flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] font-bold text-sm transition-colors ${
                    step.number < currentStep
                      ? 'bg-[#268E55] text-white'
                      : step.number === currentStep
                      ? 'bg-[#FED64B] text-black'
                      : 'bg-[#f8f7f4] text-[#6b6966] border-2 border-[#EAEAE8]'
                  }`}
                >
                  {step.number < currentStep ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`mt-2 font-['Plus_Jakarta_Sans',sans-serif] text-xs whitespace-nowrap ${
                    step.number === currentStep
                      ? 'font-semibold text-black'
                      : 'font-normal text-[#6b6966]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className="flex-1 flex items-center h-10">
                  <div className="w-full h-0.5 mx-4 bg-[#EAEAE8] relative">
                    <div
                      className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                        step.number < currentStep ? 'bg-[#268E55] w-full' : 'bg-transparent w-0'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-sm text-black">
              Krok {currentStep} z {STEPS.length}
            </span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#6b6966]">
              {STEPS[currentStep - 1]?.label}
            </span>
          </div>
          <div className="w-full h-2 bg-[#f8f7f4] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FED64B] transition-all duration-300"
              style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Checkpoint**

---

### Task 3.3: Create OrderSummaryAside

**Files:**
- Create: `src/components/checkout/OrderSummaryAside.tsx`

- [ ] **Step 1: Read sources**

Read:
- `docs/cc-strona-landing-astro/src/components/checkout/OrderSummaryAside.tsx` (logic — read sessionStorage)
- `src/app/components/checkout/OrderDetailsStep.tsx` lines 94-188 (visual design — Plan summary card)

- [ ] **Step 2: Write component**

Create `src/components/checkout/OrderSummaryAside.tsx` combining reference's data-reading logic with current's visual design.

Structure:
- On mount: read `getOrderSession()` from `lib/state/order-session`
- If no session, render empty/loading
- Otherwise render the plan summary card with current's design: white card with border, plan name, price (with strikethrough if discount), description

Mobile + desktop variants per current's pattern (mobile: shown above form; desktop: lg:col-span-1 sidebar).

- [ ] **Step 3: Checkpoint**

---

### Task 3.4: Port NipLookupField

**Files:**
- Create: `src/components/checkout/NipLookupField.tsx`

- [ ] **Step 1: Read source**

Read `docs/cc-strona-landing-astro/src/components/checkout/NipLookupField.tsx`.

- [ ] **Step 2: Port to React + adapt design**

Create `src/components/checkout/NipLookupField.tsx`:
- Preact→React conversions per Adaptation rules in plan header
- Styling matches current `OrderDetailsStep.tsx` lines 202-227 (NIP input + "pobierz dane z GUS" button side by side)
- Uses `lookupCompany()` from `lib/api/orders`
- On success calls `onLookupSuccess(data)` callback prop passed by parent
- Loading state on button while lookup in progress
- Error state shown below input

- [ ] **Step 3: Checkpoint**

---

### Task 3.5: Create CompanyDataStep + page

**Files:**
- Create: `src/components/checkout/CompanyDataStep.tsx`
- Create: `src/pages/checkout/company-data.astro`

- [ ] **Step 1: Read reference + current for design**

Read:
- `docs/cc-strona-landing-astro/src/components/checkout/CompanyDataStep.tsx` (logic, validation, API)
- `src/app/components/checkout/OrderDetailsStep.tsx` (visual design — form layout, fields, buttons)

- [ ] **Step 2: Write CompanyDataStep**

Create `src/components/checkout/CompanyDataStep.tsx` combining reference logic + current design. Structure:

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormStep } from './FormStep';
import { FormField } from './FormField';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { NipLookupField } from './NipLookupField';
import { getOrderSession } from '../../lib/state/order-session';
import { saveFormState, getFormState } from '../../lib/state/form-state';
import { canEnterStep } from '../../lib/state/checkout-navigation';
import { submitCompanyData, getCheckoutState } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { validateCompanyData } from '../../lib/validation/company-data';
import { INDUSTRIES } from '../../data/industries';

interface FormData {
  nip: string;
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

export function CompanyDataStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({ mode: 'onSubmit' });

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('orderId');
    if (!id) { window.location.assign('/cennik'); return; }

    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    getCheckoutState(id)
      .then(state => {
        if (!canEnterStep('company-data', state)) {
          window.location.assign(`/checkout/${state.nextStep}?orderId=${id}`);
          return;
        }
        setOrderId(id);
        const saved = getFormState('company-data');
        if (saved) form.reset(saved);
      })
      .catch(err => setSubmitError(translateApiError(err)));
  }, []);

  const onSubmit = async (data: FormData) => {
    if (!orderId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitCompanyData(orderId, {
        nip: data.nip,
        companyName: data.companyName,
        street: data.street,
        city: data.city,
        postalCode: data.postalCode,
        industry: data.industry,
      });
      saveFormState('company-data', data);
      window.location.assign(`/checkout/personal-data?orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
      setSubmitError(translateApiError(err));
      setSubmitting(false);
    }
  };

  if (!orderId && !submitError) {
    return <div className="min-h-screen flex items-center justify-center text-[#6B6965]">Ładowanie…</div>;
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={1} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Dane firmy
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert title={submitError.title} message={submitError.message} />}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormStep title="Dane rejestrowe organizacji">
                <NipLookupField
                  registerProps={form.register('nip', {
                    required: 'NIP jest wymagany',
                    validate: v => /* use validation lib */ undefined,
                  })}
                  error={form.formState.errors.nip?.message}
                  onLookupSuccess={(data) => {
                    form.setValue('companyName', data.companyName);
                    form.setValue('street', data.street);
                    form.setValue('city', data.city);
                    form.setValue('postalCode', data.postalCode);
                  }}
                />
                <FormField label="Nazwa" registerProps={form.register('companyName', { required: true })} error={form.formState.errors.companyName?.message} />
                <FormField label="Ulica i numer" registerProps={form.register('street', { required: true })} error={form.formState.errors.street?.message} />
                <FormField label="Miasto" registerProps={form.register('city', { required: true })} error={form.formState.errors.city?.message} />
                <FormField label="Kod pocztowy" registerProps={form.register('postalCode', { required: true })} error={form.formState.errors.postalCode?.message} />
                <FormField type="select" label="Branża" options={INDUSTRIES.map(i => ({ value: i, label: i }))} registerProps={form.register('industry', { required: true })} error={form.formState.errors.industry?.message} />
              </FormStep>

              <FormActions
                onBack={() => window.location.assign('/cennik')}
                submitLabel="Dalej"
                submitting={submitting}
              />
            </form>
          </div>
          <aside className="lg:col-span-1 hidden lg:block">
            <OrderSummaryAside />
          </aside>
        </div>
      </div>
    </div>
  );
}
```

Use exact validation from `lib/validation/company-data.ts` — read it and wire correctly.

**Critical:** Field names (`companyName`, `street`, `postalCode`, `industry`) must match the DTO that backend expects (`SubmitCompanyDataDto` in `lib/api/types/order.ts`). Read that type and align.

- [ ] **Step 3: Create the page**

Create `src/pages/checkout/company-data.astro`:

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { CompanyDataStep } from '../../components/checkout/CompanyDataStep';
---
<CheckoutLayout
  title="Dane firmy — Checkout CyberCover"
  description="Wprowadź dane firmy do zamówienia"
  showBackButton={true}
  backHref="/cennik"
>
  <CompanyDataStep client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Manual verification**

Run `pnpm dev`. Test flow:
1. Open `http://localhost:4321/cennik`, click any plan CTA
2. Should redirect to `/checkout/company-data?orderId=...`
3. CompanyDataStep should render with progress bar (step 1 active)
4. Fill form, click "Dalej"
5. With mocks, should redirect to `/checkout/personal-data?orderId=...`
6. Browser back button should return to company-data with form values restored

If `personal-data.astro` doesn't exist yet, the navigation will 404 — that's OK; we create it next.

- [ ] **Step 5: Checkpoint**

---

### Task 3.6: Port PhoneField + ConsentCheckbox

**Files:**
- Create: `src/components/checkout/PhoneField.tsx`
- Create: `src/components/checkout/ConsentCheckbox.tsx`

- [ ] **Step 1: Port PhoneField**

Source: `docs/cc-strona-landing-astro/src/components/checkout/PhoneField.tsx`. Read.

Create `src/components/checkout/PhoneField.tsx`:
- React adaptation
- Phone format: Polish convention `+48 XXX XXX XXX` or just `XXX XXX XXX`
- Visual: same as `FormField` text input (current design tokens)

- [ ] **Step 2: Port ConsentCheckbox**

Source: `docs/cc-strona-landing-astro/src/components/checkout/ConsentCheckbox.tsx`. Read.

Create `src/components/checkout/ConsentCheckbox.tsx`:
- Checkbox with rich-text label (may have `<a>` to legal pages)
- Consent definitions come from `fetchConsentDefinitions()` API call
- Style: yellow checkmark when checked, `border border-[#E4E2DF] rounded-[6px]`

- [ ] **Step 3: Checkpoint**

---

### Task 3.7: Create PersonalDataStep + page

**Files:**
- Create: `src/components/checkout/PersonalDataStep.tsx`
- Create: `src/pages/checkout/personal-data.astro`

- [ ] **Step 1: Port logic from reference**

Source: `docs/cc-strona-landing-astro/src/components/checkout/PersonalDataStep.tsx`. Read.

This step:
- Mount: same guards pattern as CompanyDataStep
- Form fields: firstName, lastName, email, phone
- Consents: dynamic list from `fetchConsentDefinitions()` — render `ConsentCheckbox` per definition
- Submit: `submitPersonalData(orderId, dto)` then navigate to `operational-standards`

- [ ] **Step 2: Write component using current design**

Create `src/components/checkout/PersonalDataStep.tsx` following the same pattern as `CompanyDataStep` (FormStep wrappers, FormActions, OrderSummaryAside, progress bar `currentStep={2}`).

Field labels in Polish:
- "Imię" / "Nazwisko" / "E-mail" / "Telefon"

Validation: use `lib/validation/personal-data.ts`.

- [ ] **Step 3: Create page**

Create `src/pages/checkout/personal-data.astro`:
```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { PersonalDataStep } from '../../components/checkout/PersonalDataStep';
---
<CheckoutLayout
  title="Dane osobiste — Checkout CyberCover"
  description="Wprowadź dane osoby kontaktowej"
  showBackButton={true}
  backHref="/checkout/company-data"
>
  <PersonalDataStep client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Manual verification**

Test flow: cennik → company-data → personal-data. Step 2 active in progress bar. Form submits, navigates to `/checkout/operational-standards`. Back button restores form state.

- [ ] **Step 5: Checkpoint**

---

### Task 3.8: Port AnswerTile + StandardQuestion

**Files:**
- Create: `src/components/checkout/AnswerTile.tsx`
- Create: `src/components/checkout/StandardQuestion.tsx`

- [ ] **Step 1: Port AnswerTile**

Source: `docs/cc-strona-landing-astro/src/components/checkout/AnswerTile.tsx`. Read.

Create `src/components/checkout/AnswerTile.tsx`:
- Card-like radio button: clickable tile with title + optional description
- Selected state: `border-[#FED64B] bg-[#FFFFE7]`
- Unselected: `border-[#E4E2DF] bg-white`
- Hover: `hover:border-[#A2A09C]`
- Plus Jakarta Sans

- [ ] **Step 2: Port StandardQuestion**

Source: `docs/cc-strona-landing-astro/src/components/checkout/StandardQuestion.tsx`. Read.

Create `src/components/checkout/StandardQuestion.tsx`:
- Renders question label + AnswerTile group
- Single-select radio behavior

- [ ] **Step 3: Checkpoint**

---

### Task 3.9: Create OperationalStandardsStep + page

**Files:**
- Create: `src/components/checkout/OperationalStandardsStep.tsx`
- Create: `src/pages/checkout/operational-standards.astro`

- [ ] **Step 1: Port logic**

Source: `docs/cc-strona-landing-astro/src/components/checkout/OperationalStandardsStep.tsx`. Read.

This step:
- Mount: standard guards + `getOperationalStandardsSchema(orderId)` → array of questions
- Render each question via `StandardQuestion`
- Submit: `submitOperationalStandards` → `evaluateEligibility` → if eligible navigate to `payment-method`, if ineligible show error
- progress bar `currentStep={3}`

- [ ] **Step 2: Write with current design**

Same wrapper pattern (CheckoutProgressBar + h1 + OrderSummaryAside + FormStep + FormActions). Title: "Standardy operacyjne".

- [ ] **Step 3: Create page**

Create `src/pages/checkout/operational-standards.astro`:
```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { OperationalStandardsStep } from '../../components/checkout/OperationalStandardsStep';
---
<CheckoutLayout
  title="Standardy operacyjne — Checkout CyberCover"
  description="Odpowiedz na kilka pytań o swojej firmie"
  showBackButton={true}
  backHref="/checkout/personal-data"
>
  <OperationalStandardsStep client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Manual verification**

Test flow up to step 3. Mock should return ~3-5 questions. Pick answers, submit, navigate to payment-method.

- [ ] **Step 5: Checkpoint**

---

### Task 3.10: Port PaymentMethodOption + DiscountCodeField

**Files:**
- Create: `src/components/checkout/PaymentMethodOption.tsx`
- Create: `src/components/checkout/DiscountCodeField.tsx`

- [ ] **Step 1: Port PaymentMethodOption**

Source: `docs/cc-strona-landing-astro/src/components/checkout/PaymentMethodOption.tsx`. Read.

Create `src/components/checkout/PaymentMethodOption.tsx`:
- Radio tile similar to AnswerTile but with payment method icons (card / bank)
- Selected state: `border-[#FED64B] bg-[#FFFFE7]`

- [ ] **Step 2: Port DiscountCodeField**

Source: `docs/cc-strona-landing-astro/src/components/checkout/DiscountCodeField.tsx`. Read.

Create `src/components/checkout/DiscountCodeField.tsx`:
- Input + button "Zastosuj"
- On submit calls `validateDiscountCode(orderId, { code })`
- Shows preview of discount when valid
- Error if invalid
- Pre-fills from `getDiscountCodeFromUrl()` if present (only for non-PARTNER kinds)

- [ ] **Step 3: Checkpoint**

---

### Task 3.11: Create PaymentMethodStep + page

**Files:**
- Create: `src/components/checkout/PaymentMethodStep.tsx`
- Create: `src/pages/checkout/payment-method.astro`

- [ ] **Step 1: Port logic**

Source: `docs/cc-strona-landing-astro/src/components/checkout/PaymentMethodStep.tsx`. Read.

This step:
- Two payment options: `STRIPE` (karta/BLIK/Google/Apple) or `BANK_TRANSFER` (przelew)
- Optional discount code field
- Submit: `selectPaymentMethod(orderId, dto)` → navigate to `confirm`
- progress bar `currentStep={4}`

- [ ] **Step 2: Write step**

Create `src/components/checkout/PaymentMethodStep.tsx` with current design.

- [ ] **Step 3: Create page**

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { PaymentMethodStep } from '../../components/checkout/PaymentMethodStep';
---
<CheckoutLayout
  title="Metoda płatności — Checkout CyberCover"
  showBackButton={true}
  backHref="/checkout/operational-standards"
>
  <PaymentMethodStep client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Manual verification**

Test flow up to step 4.

- [ ] **Step 5: Checkpoint**

---

### Task 3.12: Port SummaryDataCard + SummaryPlanCard

**Files:**
- Create: `src/components/checkout/SummaryDataCard.tsx`
- Create: `src/components/checkout/SummaryPlanCard.tsx`

- [ ] **Step 1: Port both**

Sources:
- `docs/cc-strona-landing-astro/src/components/checkout/SummaryDataCard.tsx`
- `docs/cc-strona-landing-astro/src/components/checkout/SummaryPlanCard.tsx`

Create React versions with current design (white card, `border border-[#E4E2DF] rounded-[12px] p-6`, Plus Jakarta Sans). Display read-only sections (company data, personal data, operational standards summary, plan + price).

- [ ] **Step 2: Checkpoint**

---

### Task 3.13: Create ConfirmStep + page

**Files:**
- Create: `src/components/checkout/ConfirmStep.tsx`
- Create: `src/pages/checkout/confirm.astro`

- [ ] **Step 1: Port logic — 3 flows**

Source: `docs/cc-strona-landing-astro/src/components/checkout/ConfirmStep.tsx`. Read.

This step:
- Mount: standard guards + `getCheckoutState(orderId)` to retrieve all submitted data
- Render: SummaryPlanCard + SummaryDataCard for each prior section + final price + ToS checkbox
- "Potwierdź zamówienie" button → `confirmOrder(orderId)`
- Response branch:
  - `paymentChannel === 'STRIPE_PAYMENT_INTENT'` → call `createStripeCheckoutSession(orderId)` → `window.location.assign(response.url)`
  - `paymentChannel === 'BANK_TRANSFER'` → `window.location.assign('/checkout/bank-transfer?orderId=...')`
  - `paymentChannel === 'PROMOTIONAL_DISCOUNT'` → `window.location.assign('/checkout/success?orderId=...&token=...&promo=true')`
- progress bar `currentStep={5}`

- [ ] **Step 2: Write step**

Create `src/components/checkout/ConfirmStep.tsx` using current design pattern.

- [ ] **Step 3: Create page**

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { ConfirmStep } from '../../components/checkout/ConfirmStep';
---
<CheckoutLayout
  title="Potwierdź zamówienie — CyberCover"
  showBackButton={true}
  backHref="/checkout/payment-method"
>
  <ConfirmStep client:load />
</CheckoutLayout>
```

- [ ] **Step 4: Manual verification**

Test full flow up to step 5. Try both Stripe (mock should return placeholder URL) and Bank Transfer paths.

- [ ] **Step 5: Checkpoint**

---

### Task 3.14: Port BankTransferDetails + ProformaDownload + BankTransferConfirmation

**Files:**
- Create: `src/components/checkout/BankTransferDetails.tsx`
- Create: `src/components/checkout/ProformaDownload.tsx`
- Create: `src/components/checkout/BankTransferConfirmation.tsx`

- [ ] **Step 1: Port BankTransferDetails**

Source: `docs/cc-strona-landing-astro/src/components/checkout/BankTransferDetails.tsx`. Read.

Create `src/components/checkout/BankTransferDetails.tsx`:
- Read-only card with bank account number, recipient, amount, transfer title
- Copy-to-clipboard button on each field
- Current design: white card, Plus Jakarta Sans

- [ ] **Step 2: Port ProformaDownload**

Source: `docs/cc-strona-landing-astro/src/components/checkout/ProformaDownload.tsx`. Read.

Create `src/components/checkout/ProformaDownload.tsx`:
- "Pobierz fakturę pro forma" button (yellow style)
- Uses `buildProformaDownloadUrl(orderId, token)`
- Opens in new tab

- [ ] **Step 3: Port BankTransferConfirmation**

Source: `docs/cc-strona-landing-astro/src/components/checkout/BankTransferConfirmation.tsx`. Read.

Create `src/components/checkout/BankTransferConfirmation.tsx`:
- Composes BankTransferDetails + ProformaDownload
- Shows success message ("Zamówienie złożone!")
- Instructions: "Wykonaj przelew w ciągu 14 dni..."

- [ ] **Step 4: Checkpoint**

---

### Task 3.15: Create bank-transfer.astro page

**Files:**
- Create: `src/pages/checkout/bank-transfer.astro`

- [ ] **Step 1: Create page**

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { BankTransferConfirmation } from '../../components/checkout/BankTransferConfirmation';
---
<CheckoutLayout
  title="Przelew bankowy — Zamówienie złożone — CyberCover"
  description="Dane do przelewu i instrukcje"
  showBackButton={false}
>
  <BankTransferConfirmation client:load />
</CheckoutLayout>
```

The component reads `?orderId=` from URL, calls `getOrderConfirmation`, renders details. On mount also calls `clearOrderSession()` to clean up.

- [ ] **Step 2: Manual verification**

Full flow with Bank Transfer choice in payment-method → confirm → bank-transfer. Page shows account number, amount, button to download proforma.

- [ ] **Step 3: Checkpoint**

---

### Task 3.16: Port SuccessAnimation + SuccessStatus

**Files:**
- Create: `src/components/checkout/SuccessAnimation.tsx`
- Create: `src/components/checkout/SuccessStatus.tsx`

- [ ] **Step 1: Port SuccessAnimation**

Source: `docs/cc-strona-landing-astro/src/components/checkout/SuccessAnimation.tsx`. Read.

Create `src/components/checkout/SuccessAnimation.tsx`:
- Animated checkmark SVG (CSS animation)
- Green color (`#268E55`)
- Used on success and bank-transfer pages

If animation uses `motion`/`framer-motion`, check if it's already in `package.json` (yes, `motion` 12.23.24). Use it.

- [ ] **Step 2: Port SuccessStatus**

Source: `docs/cc-strona-landing-astro/src/components/checkout/SuccessStatus.tsx`. Read.

Create `src/components/checkout/SuccessStatus.tsx`:
- Wraps SuccessAnimation + heading + summary cards
- Reads `getOrderConfirmation(orderId, token)`
- Calls `clearOrderSession()` on mount
- Renders SummaryPlanCard + SummaryDataCard for completed order

- [ ] **Step 3: Checkpoint**

---

### Task 3.17: Create success.astro page

**Files:**
- Create: `src/pages/checkout/success.astro`

- [ ] **Step 1: Create page**

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { SuccessStatus } from '../../components/checkout/SuccessStatus';
---
<CheckoutLayout
  title="Zamówienie złożone — CyberCover"
  description="Dziękujemy za zakup"
  showBackButton={false}
>
  <SuccessStatus client:load />
</CheckoutLayout>
```

- [ ] **Step 2: Manual verification**

Test Stripe flow (mock): payment-method → choose Stripe → confirm → mock redirects to `/checkout/success?session_id=...&order_id=...`. Page shows success animation + summary.

Test Promo flow (mock with COMPOSITE_DEMO discount applied): confirm → success page with "darmowe przez 3 miesiące" notice.

- [ ] **Step 3: Checkpoint**

---

### Task 3.18: Port StripeCancelledRetry + create cancelled.astro

**Files:**
- Create: `src/components/checkout/StripeCancelledRetry.tsx`
- Create: `src/pages/checkout/cancelled.astro`

- [ ] **Step 1: Port StripeCancelledRetry**

Source: `docs/cc-strona-landing-astro/src/components/checkout/StripeCancelledRetry.tsx`. Read.

Create `src/components/checkout/StripeCancelledRetry.tsx`:
- Read `?order_id=` from URL
- Show: "Płatność anulowana. Możesz spróbować ponownie."
- Button "Ponów płatność" → `createStripeCheckoutSession(orderId)` → `window.location.assign(response.url)`
- Button "Zmień metodę płatności" → `window.location.assign('/checkout/payment-method?orderId=...')`

- [ ] **Step 2: Create page**

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { StripeCancelledRetry } from '../../components/checkout/StripeCancelledRetry';
---
<CheckoutLayout
  title="Płatność anulowana — CyberCover"
  description="Spróbuj ponownie"
  showBackButton={false}
>
  <StripeCancelledRetry client:load />
</CheckoutLayout>
```

- [ ] **Step 3: Manual verification**

Mock returns cancel URL; navigate manually to `/checkout/cancelled?order_id=mock-1`. Verify retry buttons work.

- [ ] **Step 4: Checkpoint — END OF PHASE 3**

User reviews entire flow: cennik → 5 checkout steps → 3 success states. Manual smoke test for all 3 flows (Stripe success, Stripe cancel, Bank Transfer, Promo 0 PLN).

---

## Phase 4 — Cleanup

> Phase 4 removes the old SPA scaffolding. After Phase 4: `src/app/` is gone, dependencies clean, build passes, all tests pass.

### Task 4.1: Delete `src/app/` folder

**Files:**
- Delete: `src/app/` (entire folder)

- [ ] **Step 1: Verify nothing in src/app/ is still imported**

Run search:
```bash
pnpm exec tsc --noEmit
```

Note any errors. If any file imports from `src/app/`, fix the import or delete the importing file.

Check specifically:
- `src/pages/cennik.astro` should NOT import from `src/app/` (it should import from `src/components/pricing/`)
- `src/pages/checkout/[...step].astro` should already be deleted from Task 2.6
- No other source file should reference `src/app/`

- [ ] **Step 2: Delete the folder**

```bash
rm -rf src/app/
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm exec tsc --noEmit
pnpm build
```
Expected: clean.

- [ ] **Step 4: Checkpoint**

---

### Task 4.2: Update astro.config.mjs

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Read current config**

Read `astro.config.mjs`.

- [ ] **Step 2: Remove react-router from optimizeDeps if present**

Verify `optimizeDeps.include` does not include `react-router`. If it does, remove it. The current config's optimizeDeps includes `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` — keep these.

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: clean.

- [ ] **Step 4: Checkpoint**

---

### Task 4.3: Remove unused dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Identify unused packages**

Run:
```bash
pnpm exec tsc --noEmit
```

Search for each suspected-unused dependency:
- `react-router` — should not be imported anywhere
- `lucide-react` — was used in `PricingPage.tsx` (ChevronDown for toggle panel) — should not be imported anywhere now
- `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` — check if any current/new file imports

For each: run `Grep` on `from 'package-name'` across `src/`. If zero results — safe to remove.

- [ ] **Step 2: Remove confirmed unused**

Run for each confirmed-unused package:
```bash
pnpm remove react-router
pnpm remove lucide-react
# ... etc
```

Keep `motion` (used by SuccessAnimation) and `react-hook-form` (used everywhere in checkout).

- [ ] **Step 3: Verify build**

```bash
pnpm build
pnpm test:run
```

Expected: both clean.

- [ ] **Step 4: Checkpoint**

---

### Task 4.4: Final verification

**Files:**
- Run all checks

- [ ] **Step 1: Run full test suite**

```bash
pnpm test:run
```
Expected: all `lib/*` tests pass.

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm exec tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Run production build**

```bash
pnpm build
```
Expected: clean.

- [ ] **Step 4: Manual smoke test full flow**

Run `pnpm dev`. Manual test:

**Test 1: Plain cennik**
- `http://localhost:4321/cennik` — 4 plans render, mock data, no banner
- Toggle Miesięczna/Rocznie — prices change
- Click any plan CTA — redirect to `/checkout/company-data?orderId=...`

**Test 2: Partner URL**
- `http://localhost:4321/cennik?partner=VALVETECH` — banner appears, strikethrough prices on cards
- Click Optimum CTA — redirect with `partnerCode` in sessionStorage
- Verify in DevTools Application > sessionStorage that `cybercover.orderSession.v1` contains `partnerCode: 'VALVETECH'`

**Test 3: Discount URL**
- `http://localhost:4321/cennik?discountCode=SUMMER10` — discount preview on all cards (CODE_FLAT)
- Click any plan — proceed to checkout

**Test 4: Full checkout flow (mocks)**
- From cennik, click any plan
- Fill company-data, submit — go to personal-data
- Fill personal-data, submit — go to operational-standards
- Answer questions, submit — go to payment-method
- Choose Bank Transfer, submit — go to confirm
- Click Confirm — go to /checkout/bank-transfer with bank details
- Verify proforma download button works

- Repeat with Stripe choice — verify redirect to mock Stripe URL (will be a placeholder; user closes manually)

**Test 5: Back button preserves data**
- Start checkout, fill company-data, go to personal-data
- Click "Powrót" or browser back
- Verify company-data form is restored

**Test 6: URL guard**
- Manually open `http://localhost:4321/checkout/company-data?orderId=invalid`
- Should redirect to `/cennik`

**Test 7: Refresh during checkout**
- During any step, hit F5
- Page reloads, form data restored from sessionStorage

- [ ] **Step 5: Visual regression check**

Compare screenshots manually with original `/cennik` from `git stash` or pre-merge state. Verify:
- Same Plus Jakarta Sans typography
- Same yellow `#FED64B` highlights
- Same card layouts (sections with icons, highlights, spacers)
- Same progress bar styling

If any visual regression — fix before declaring done.

- [ ] **Step 6: Final checkpoint — INTEGRATION COMPLETE**

User does final review and commits. Project is ready for backend `pricing-catalog-changes.md` implementation in parallel.

---

## Self-Review Notes

**Spec coverage:** All 14 sections of the spec are mapped to tasks above. Section 3 (file structure) is fully covered by Phase 1 (lib + layouts + data) + Phase 2 (cennik) + Phase 3 (checkout). Section 4 (cennik design) is Task 2.2-2.6. Section 5 (checkout design) is Task 3.1-3.18. Section 6 (state management) is Task 1.9. Section 7 (API integration) is Task 1.5-1.8. Section 8 (validation) is Task 1.4. Section 9 (cleanup) is Task 2.1 + Phase 4. Section 10 (tests) is Task 1.1 + per-task test runs. Section 11 (mocks) is Task 1.6. Section 12 (Stripe) is Task 3.13 + 3.18.

**Open items from spec § 13:**
- O3 (cookie consent in checkout): Implemented in Task 1.12 — `CheckoutLayout` includes head section from `BaseLayout`.
- O4 (GTM events): DEFERRED per spec — out of scope for this plan.
- O7 (industries dropdown): Task 1.13 ports from reference; Task 3.5 uses INDUSTRIES.

**Risks flagged for executor:**
1. **CheckoutLayout head copy** (Task 1.12 Step 2): comment placeholder must be replaced with actual `<head>` content from BaseLayout. If executor leaves the placeholder — checkout pages will break (no GTM, no cookies, no fonts).
2. **Field name alignment** (Task 3.5 Step 2): `submitCompanyData` DTO uses backend's snake_case or camelCase — executor must read `lib/api/types/order.ts` and align form names to DTO before submitting. Wrong field names = silent backend rejection.
3. **NIP validation** (Task 3.5): use `validateNip` from `lib/validation/nip` — do not write custom regex.
4. **Mock data alignment** (Task 1.6): mock `feature.*` keys must exactly match the contract in `pricing-catalog-changes.md`. Frontend `render-policy` reads these keys; mismatch = empty sections in cards.
