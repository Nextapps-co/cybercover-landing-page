# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CyberCover landing page (Astro) with integrated React pricing calculator and multi-step checkout flow. Merged from two projects: Astro landing page + React pricing table.

## Commands

```bash
pnpm dev        # Start dev server (localhost:4321)
pnpm build      # Production build to dist/
pnpm preview    # Preview production build
```

## Architecture

**Astro (static pages)** + **React island (pricing/checkout)**

- `src/pages/` — Astro routes: landing (`index.astro`), legal pages, `cennik.astro`
- `src/app/` — React app loaded as island via `<PricingApp client:only="react" />`
- `src/components/` — Astro components (Header, Footer, Ochrona360)
- `src/layouts/` — BaseLayout (GTM, cookies, header/footer), LegalLayout (prose)

### React Island Integration

`cennik.astro` and `checkout/[...step].astro` both render `<PricingApp client:only="react" />`. PricingApp uses `BrowserRouter` for client-side routing between `/cennik` and `/checkout/*` steps. Astro handles initial page load, React takes over navigation.

**Critical:** React CJS/ESM interop requires `optimizeDeps.include` in `astro.config.mjs` for `react`, `react-dom/client`, etc. Without this, React islands fail silently in browser.

### Checkout Flow

8-step process via React Router: OrderDetails → Standards → PaymentMethod → PersonalData → Summary → ProcessPayment → Confirmation. State managed through `CheckoutContext` (React Context API). During checkout, `LayoutController` in PricingApp hides Astro header nav and footer via DOM manipulation.

### Pricing Plans

4 tiers: Standard, Optimum (highlighted), Profesjonalny, Ekspert. Discount system supports partner (5%), standard (free tier), and combined discounts. Billing: monthly (+20%) or yearly (default). Plan definitions with features are in `PricingPage.tsx`.

## Styling

Tailwind CSS v4 with `@theme` tokens in `src/styles/global.css` (not tailwind.config.js). Key tokens: `--color-brand-yellow`, `--color-brand-navy`, `--color-brand-bg`, `--spacing-container`. Font: Plus Jakarta Sans. Path alias `@` → `./src`.

## Key Files

- `astro.config.mjs` — Vite config, React integration, optimizeDeps
- `src/app/PricingApp.tsx` — React entry point, routes, LayoutController
- `src/app/pages/PricingPage.tsx` — Plan definitions, pricing logic, discounts
- `src/app/context/CheckoutContext.tsx` — Checkout state (plan, billing, company, personal data)
- `src/app/components/PricingCard.tsx` — Reusable card with feature sections, spacers, highlights
- `src/layouts/BaseLayout.astro` — GTM (GTM-WBWGV72G), cookie consent (dark theme), meta tags
- `src/components/Header.astro` — Fixed header, white bg on /cennik, hidden nav on checkout

## Conventions

- UI language: Polish
- `noindex, nofollow` currently set (pre-launch)
- Site URL: `https://cybercover.pl`
- Images: raster in `src/assets/img/` (Astro-optimized), SVG in `public/img/` (static)
- Forms use `react-hook-form`; UI primitives from shadcn/ui + Radix
- Legacy files exist: `App.tsx`, `routes.tsx` — not used, PricingApp is the entry point

## Repo

- GitHub: https://github.com/CC-radek/CC-Page-Astro-Cennik (konto CC-radek, private)
