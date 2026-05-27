# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CyberCover landing page + cennik + 4-krokowy checkout wizard. Architektura: **Astro multi-page** z **React islands per krok**. Anonymous purchase flow działa end-to-end z mockami; auth-aware tryb (plan-change / reactivation) opisany w `docs/purchase-proces-auth-context-flow.md` — **jeszcze niezaimplementowany**.

## Commands

```bash
npm run dev           # Astro dev server (localhost:4321)
npm run build         # Production build → dist/
npm run preview       # Preview production build
npm run test          # Vitest watch
npm run test:run      # Vitest single run
npm run test:coverage # Vitest with coverage
```

Node >= 22.12. Repo używa `npm` (był pnpm, usunięty w `ff81c1d`).

## Architecture

### Routing & layouts

Czysty Astro multi-page — **brak React Routera w trakcie checkoutu**. Każda strona jest osobnym plikiem `.astro`, który renderuje React component jako client island (`client:load`).

- `BaseLayout.astro` — landing + `/cennik` + legal pages. Zawiera `<Header />`, `<Footer />`, GTM (`GTM-WBWGV72G`), cookie consent (dark theme), JSON-LD organization.
- `CheckoutLayout.astro` — wszystkie `/checkout/*` pages. Zawiera `<CheckoutHeader />` (logo + opcjonalne „Powrót"), `<ClientRouter />` z Astro view-transitions, i ten sam GTM/cookie consent.

`CheckoutLayout` używa direction-aware slide transitions: helper `src/lib/state/checkout-transition.ts` ustawia `data-checkout-direction="forward|backward"` na `<html>` przed `navigate()`, a `astro:before-preparation` listener defaultuje do `backward` dla browser back/forward (`navigationType === 'traverse'`). Style slide'a w `src/styles/global.css`.

### Pages

- `src/pages/index.astro` — landing
- `src/pages/cennik.astro` — pricing grid (renderuje `<PricingCards client:load />`)
- `src/pages/checkout/{company-data,personal-data,operational-standards,payment-method,confirm,bank-transfer,success,cancelled}.astro` — każda renderuje odpowiedni React step component
- `src/pages/{regulamin,polityka-prywatnosci,polityka-plikow-cookies,obowiazek-informacyjny}.astro` — legal

### React island per krok

Wszystkie pliki w `src/components/checkout/*.tsx` — funkcjonalne komponenty z lokalnym `useState`. **Brak React Context / globalnego store'u**. Komunikacja między krokami:

- **`sessionStorage['cybercover:order-session']`** — `OrderSession` z `orderId`, `catalogEntryId`, `billingCycle`, `partnerCode`, `planSnapshot`, `osSkipped`. Stworzony przez `PricingCards` po `POST /orders/start`, czytany przez każdy step. Helpers w `src/lib/state/order-session.ts`.
- **`sessionStorage['cybercover:form-state:<step>']`** — per-step draft typed-but-not-submitted form values. Helpers w `src/lib/state/form-persistence.ts`.
- **URL `?orderId=`** — każdy `/checkout/*` page wymaga `orderId` w query stringu; brak → redirect `/cennik`.
- **`getOrder(orderId)`** — server jako single source of truth; każdy step hyduje z `GET /orders/:id` na mount i z `checkoutProgress` decyduje czy pozwolić wejść (`canAccessStep` w `src/lib/state/checkout-navigation.ts`).

### API client (`src/lib/api/`)

- `http.ts` — `apiGet/apiPost/apiPatch` z fetch wrapping. Baseurl z `import.meta.env.PUBLIC_API_BASE_URL`. Custom `ApiError` z kodami z `types/errors.ts` (backend codes + frontend `NETWORK_ERROR`/`INTERNAL_ERROR`/`UNKNOWN`). **Nie wysyła Authorization header** — wszystko anonymous na dziś.
- `catalog.ts` — `getPlans(discountCode?, partnerCode?)` → `GET /pricing-catalog`. Mock toggle: `PUBLIC_USE_MOCK_CATALOG=true`.
- `orders.ts` — wszystkie wizard endpointy (`startOrder`, `getOrder`, `submitCompanyData`, `lookupCompany`, `fetchConsentDefinitions`, `submitPersonalData`, `getOperationalStandardsSchema`, `submitOperationalStandards`, `validateDiscountCode`, `selectPaymentMethod`, `confirmOrder`, `createStripeCheckoutSession`, `getOrderConfirmation`, `buildProformaDownloadUrl`). Mock toggle: `PUBLIC_USE_MOCK_ORDERS=true`.
- `types/` — DTO typy oparte o `checkout-flow.md §9.1`: `order.ts`, `catalog.ts`, `money.ts` (`MoneyDto = { amount: grosze, currency: 'PLN' }`), `errors.ts`.
- `__mocks__/` — in-memory mocki dla offline dev.

### Plan rendering (`src/lib/catalog/render-policy.ts`)

Backend zwraca semantyczne `PlanCatalogEntryDto` (z `tier: 'entry' | 'mid' | 'high' | 'top'`, mapa `feature.*` keys, EN nazwa planu). Frontend mapuje to na bogatą `PricingCardProps`:

- **Tier → highlight color**: entry=null, mid=blue, high=yellow, top=red.
- **Tier → CTA style**: entry/high/top=outline, mid=yellow.
- **EN → PL plan name**: `Professional → Profesjonalny`, `Expert → Ekspert`.
- **`SECTIONS` array** — deklaratywna definicja co rendrować w karcie (Ocena bezpieczeństwa, Monitoring zagrożeń, Konsultacje, Pomoc 24h, Ubezpieczenie, Szkolenia, Wielodostęp). Predicate `visibleWhen(features)` + tekst statyczny lub funkcja od `features`.
- **`derivePricing(plan, billingCycle)`** — wybiera między 3 ścieżkami: standard discount (strikethrough), promotional period (np. „0 zł przez 3 mies."), brak discount + savings badge na ANNUAL.

### Form layer

- `react-hook-form` per step (np. `CompanyDataStep`, `PersonalDataStep`).
- Validation w `src/lib/validation/{nip,postal-code,email,company-data,personal-data,operational-standards,payment}.ts` — czyste funkcje, testowane vitest'em.
- `NipLookupField` woła `GET /orders/company-lookup?nip=…` żeby auto-fillować dane firmy z KRS/CEIDG.
- Consents pobierane przez `fetchConsentDefinitions()` z `GET /orders/consent-definitions`, mogą zawierać HTML w `name`.

### Error handling

- `src/lib/errors/translate.ts` — `translateApiError(err)` → `{ title, message, actionable }` PL strings per `ApiErrorCode`. Każdy step łapie błędy submita i wyświetla `FormAlert` (variant error) z przetłumaczonym tekstem.
- Specyficzne przypadki (np. `DISCOUNT_CODE_NOT_FOUND` w payment-method) są inline-error pod polem, nie globalne.

### Payment flow

`PaymentMethodStep` → wybór `STRIPE_CHECKOUT` lub `BANK_TRANSFER` → `selectPaymentMethod` → `ConfirmStep` z podsumowaniem → `confirmOrder` → rozgałęzienie:

- **STRIPE_CHECKOUT**: `createStripeCheckoutSession(orderId)` (uwaga: endpoint pod `/sales-order/:id/stripe-checkout-session`, **nie** `/orders/`), `window.location.href = session.url`. Po powrocie ze Stripe: `/checkout/success` lub `/checkout/cancelled` (retry).
- **BANK_TRANSFER**: redirect na `/checkout/bank-transfer?orderId=…&token=…` z proforma PDF z `getOrderConfirmation(orderId, token)`. Wyjątek: **promo-zero order** (partner discount → 0 zł) pomija proformę i idzie wprost na `/checkout/success` (`isPromoZeroOrder` w `ConfirmStep.tsx`).

### Operational standards skip

Plany bez `InsuranceCoverage` (np. Standard) auto-pomijają krok 3. Wykrycie: `GET /orders/:id/operational-standards-schema` zwraca `skipped: true`. Wartość cache'owana w `OrderSession.osSkipped` przez `resolveOsSkipped` / `persistOsSkipped`. `CheckoutProgressBar` renderuje 4 lub 3 kroki w zależności od flagi; nawigacja back/forward omija krok OS.

## Styling

Tailwind CSS **v4** z `@theme` tokens w `src/styles/global.css` (nie `tailwind.config.js`). Kluczowe tokeny: `--color-brand-yellow` (`#FFD237`), `--color-brand-navy`, `--color-brand-bg`, `--color-brand-text`, `--spacing-container`. Font: **Plus Jakarta Sans** z Google Fonts (preconnect w obu layoutach).

Path alias: `@` → `./src` (skonfigurowany w `astro.config.mjs` i `vitest.config.ts`; **nie ma w `tsconfig.json`** — TS używa Astro's strict preset).

## Key files

- `astro.config.mjs` — React integration, sitemap, Tailwind v4 vite plugin, `@astrojs/node` adapter (dla on-demand `/cennik` + `/checkout/*`), `optimizeDeps.include` dla React (wymagane do działania client islands)
- `src/middleware.ts` + `src/lib/server/access-gate.ts` + `src/pages/dostep.astro` + `src/pages/api/access.ts` — internal access gate (brandowana bramka z hasłem na flow zakupowym, toggle przez `CHECKOUT_ACCESS_KEY`)
- `src/layouts/{BaseLayout,CheckoutLayout}.astro` — dwa różne shell-e (z/bez landing nav)
- `src/components/{Header,Footer,CheckoutHeader,Ochrona360,SectionTag}.astro` — Astro statyczne komponenty
- `src/components/pricing/PricingCards.tsx` — entry point z `/cennik`; woła `getPlans` + `startOrder` na CTA; orchestruje handoff + 409 auto-resume
- `src/components/pricing/{PricingCard,BillingCycleToggle,DiscountBanner,SubscriptionStatusBanner}.tsx` — pricing UI
- `src/components/checkout/{Company,Personal,OperationalStandards,PaymentMethod,Confirm}Step.tsx` — main step components (auth-aware step-skip guards)
- `src/components/checkout/{ProrationBreakdown,CheckoutProgressBar,OrderSummaryAside}.tsx` — payment + step UI
- `src/lib/auth/{session,jwt-claims,portal-redirect,mock-auth,handoff,use-auth-session,types}.ts` — auth module (token storage, ?handoff= exchange, portal redirect na 401, dev mock-auth)
- `src/lib/api/{http,catalog,orders,iam}.ts` + `src/lib/api/types/*` — backend integration layer (http.ts injectuje Authorization; iam.ts ma exchangeHandoff)
- `src/lib/state/{order-session,form-persistence,checkout-navigation,checkout-transition}.ts` — state utilities
- `src/lib/catalog/render-policy.ts` — pricing card data mapping + auth-aware variant detection (current/unavailable/available)
- `src/lib/errors/translate.ts` — PL error messages (21 codes incl. 8 auth-aware)

## Testing

`vitest` + `happy-dom`. Tests collocated z kodem (`*.test.ts`/`*.test.tsx`). **Aktualnie pokrywają tylko `src/lib/`** (czyste funkcje — validation, format, render-policy, state, API mocks, error translate). `@vitejs/plugin-react` celowo **nie zainstalowany** — jeśli dodajemy testy komponentów, trzeba go dodać (uwaga na vite/Tailwind compat per komentarz w `vitest.config.ts`).

## Environment variables

```bash
PUBLIC_API_BASE_URL=http://localhost:3000/api          # bez trailing slash
PUBLIC_PORTAL_URL=https://dev-portal.cybercover.pl     # portal base — redirect na 401 / handoff error
PUBLIC_USE_MOCK_CATALOG=true                           # mock GET /pricing-catalog
PUBLIC_USE_MOCK_ORDERS=true                            # mock całego wizard flow offline
CHECKOUT_ACCESS_KEY=                                   # SERWEROWY (bez PUBLIC_!) — gdy ustawiony, /cennik + /checkout/* za brandowaną bramką /dostep (hasło). Pusty = brak gate'u (dev/local)
```

Wszystkie `PUBLIC_*` są dostępne w client islandach przez `import.meta.env.*`. **`CHECKOUT_ACCESS_KEY` NIE ma prefiksu `PUBLIC_`** — czytany w runtime przez `process.env` w `src/lib/server/access-gate.ts`, nigdy nie trafia do bundla klienta.

### Internal access gate (flow zakupowy)

`/cennik` + `/checkout/*` można schować za brandowaną stroną-bramką z hasłem — do wewnętrznych testów procesu zakupowego na prod, zanim otworzymy go publicznie. Mechanizm:

- **`@astrojs/node` (standalone)** w `astro.config.mjs`. `output` zostaje `static` — landing/legal dalej prerenderowane; tylko `/cennik` i `/checkout/*` mają `export const prerender = false` → renderują się on-demand, więc `src/middleware.ts` odpala się dla nich per-request.
- **`src/lib/server/access-gate.ts`** — wspólna logika: klucz z `process.env.CHECKOUT_ACCESS_KEY`, deterministyczny token cookie (`hash(klucz+salt)`, nie sam klucz), `safeEqual` (stały czas), `isGatedPath`, `safeReturnPath`.
- **`src/middleware.ts`** — gdy klucz ustawiony i request na gated path nie ma ważnego cookie `cc_access` → `302` redirect na `/dostep?return=<ścieżka>`. Brak klucza = gate wyłączony (**fail-open** — dev/local bez ochrony).
- **`src/pages/dostep.astro`** — pełnoekranowa brandowana strona „prace techniczne" + pole hasła (POST → `/api/access`). **`src/pages/api/access.ts`** — waliduje hasło, ustawia httpOnly cookie (`secure` na https, `SameSite=Lax`, 12h), redirect (`303`) na `return`. Po wpisaniu raz cookie wpuszcza na cały flow.
- **Deploy (Railway)**: konfiguracja w `railway.toml` (config-as-code) — `startCommand = "HOST=0.0.0.0 node ./dist/server/entry.mjs"`, healthcheck na `/`, `PORT` wstrzykiwany przez Railway. W dashboardzie tylko sekrety: `CHECKOUT_ACCESS_KEY` **tylko** na serwisie prod (brak = bramka off na dev).
- **Granica**: chroni UI flow zakupowego, nie backendowe API (`PUBLIC_API_BASE_URL`).

**Dev tip**: aby przetestować auth-aware UI bez prawdziwego portala + handoff token, otwórz `/cennik?mockAuth=optimum-ACTIVE` (format: `<planCode>-<subscriptionStatus>`). Mock layer wstrzykuje `relativeToCurrent` per plan, `subscriptionStatus`, banner. `startOrder` zwraca `PLAN_UPGRADE` / `REACTIVATION` zgodnie z mock context. Statusy: `ACTIVE`, `GRACE_PERIOD`, `EXPIRED`, `CANCELLED`.

## Conventions

- UI language: Polish
- `noindex, nofollow` w obu layoutach (pre-launch)
- Site URL: `https://cybercover.pl`
- Money: zawsze grosze (minor units) jako `number` + `currency: 'PLN'`
- Plan tiery: `Standard, Optimum (recommended), Profesjonalny, Ekspert` (`displayOrder` 1-4)
- Discount: 5 rodzajów backend kind'ów (`CODE_FLAT`, `PARTNER_FLAT`, `PARTNER_COMPOSITE`, `PARTNER_TIMEBOUND`, `PARTNER_TIMEBOUND_COMPOSITE`); URL-based: `?partner=` (sticky), `?discountCode=` (clearable)
- Forms: `react-hook-form` + custom validation w `lib/validation/`
- Images: raster w `src/assets/img/` (Astro optimization), SVG w `public/img/` (statyczne)
- `react-router` jest w `package.json` ale **nieużywany w `src/`** — residuum starej iteracji, do usunięcia przy najbliższym sprzątaniu

## Auth-aware integration (zaimplementowane 2026-05-15)

Per `docs/superpowers/specs/2026-05-15-marketing-fe-auth-aware-integration-design.md` i `docs/purchase-proces-auth-context-flow.md`. FE obsługuje 2 tryby pracy:

- **Anonymous** (bez `?handoff=`, bez JWT) — flow z poprzedniej iteracji, 4-krokowy wizard, `INITIAL_PURCHASE`.
- **Auth-aware** — klient z portala redirectowany przez `marketing/cennik?handoff=<UUID>`. FE: `consumeMockAuthFromUrl` (dev) → `detectAndExchangeHandoff` (real) → wymiana tokenu na JWT → `getPlans` z Authorization zwraca auth-aware wrapper (`{ plans, currentPlanCode?, subscriptionStatus? }`) z `relativeToCurrent` per plan → klik plan → `startOrder` zwraca `{ wizardEntryStep, prefilledFields, orderType }` → wizard skacze od razu na właściwy krok (np. `payment-method`).

**Special cases**:
- 401 z tokenem → clear sessionStorage + redirect na `PUBLIC_PORTAL_URL?returnReason=session-expired`
- 409 `PLAN_CHANGE_PENDING` → auto-resume; jeśli `checkoutSessionUrl` non-null → redirect na Stripe, inaczej navigate na `wizardEntryStep` istniejącego DRAFT
- `PATCH /payment-method` dla `PLAN_UPGRADE` zwraca proration breakdown (2 linie: charge + credit ujemny) — ConfirmStep renderuje `<ProrationBreakdown>`
- Graceful degradation: gdy klient ma JWT ale BE flag `PLAN_CHANGE_VIA_WIZARD_ENABLED` OFF, `orderType=INITIAL_PURCHASE` mimo JWT — FE pokazuje banner "Funkcja niedostępna" i nie kontynuuje

**Open questions**: refresh-token flow nie zaimplementowany (defer; klient klika "Zmień plan" ponownie). Portal URL alignment wymaga uzgodnienia z portal team (obecnie hardcodowane `/cennik?handoff=`).

## Repo

- GitHub: https://github.com/CC-radek/CC-Page-Astro-Cennik (konto CC-radek, private)
- Aktualna gałąź feature: `feature/CC-353`
