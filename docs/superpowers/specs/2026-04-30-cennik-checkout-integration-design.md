# Spec: Cennik + Checkout — integracja backendu z designem aktualnego projektu

> **Status:** zatwierdzony — gotowy do plan + implementacja
> **Data:** 2026-04-30
> **Autor:** Mateusz + Claude (brainstorming)
> **Powiązane:**
> - `docs/pricing-catalog-changes.md` — wymagane zmiany backendowe (implementuje user osobno)
> - `docs/cc-strona-landing-astro/` — projekt referencyjny (źródło logiki)
> - `CLAUDE.md` — kontekst aktualnego projektu

---

## 1. Cel

Scalić **logikę biznesową** (integracja z backendem REST, walidacje, state management, flow płatności) z projektu referencyjnego (`docs/cc-strona-landing-astro/`, Preact, multi-page Astro, pełny backend) z **designem aktualnego projektu** (React, polski Plus Jakarta Sans, brand-yellow `#FED64B`, kolorowe sekcje kafelków cennika z ikonami).

Po integracji:
- `/cennik` jest **catalog-driven** — wszystkie plany, ceny i rabaty pochodzą z `GET /api/pricing-catalog`
- `/checkout/*` jest **multi-page** flow zgodny z backendowym kontraktem `/orders/*`
- Wsparcie dla 3 ścieżek płatności: Stripe Checkout (karta), przelew bankowy (proforma + bank transfer), promocyjne 0 PLN
- Aktualny design wizualny zachowany w 100% (typografia, kolory, układy kafelków, formularzy, progress bara)

## 2. Decyzje architektoniczne (z brainstormingu)

| # | Decyzja | Wybór | Uzasadnienie |
|---|---|---|---|
| D1 | Architektura | **Hybrid C** — `cennik.astro` jako island, każdy krok checkoutu jako osobna strona `.astro` | Backend dyktuje flow checkoutu (każdy krok = patch order); URL-e pozwalają na refresh/deeplink/history bez SPA-state |
| D2 | Framework UI | **React** (port Preact → React) | Aktualny projekt już używa React + react-hook-form, nie ma sensu dodawać Preact; lib/* jest framework-agnostic |
| D3 | Backend | **Real backend + mock fallback** (`PUBLIC_USE_MOCK_*` flags) | User ma backend lokalnie; mocki jako fallback dla offline/CI |
| D4 | Plans data model | **Model 3 — semantic backend, presentation frontend** (`render-policy.ts`) | Catalog-driven — nowy plan/feature value bez deployu frontu; designer może zmienić układ bez backendu |
| D5 | Discount UI | **URL-driven, brak toggli** (`?partner=`, `?discountCode=`) | Aktualne toggle to dev/test tooling, nie real UX; wizualne potraktowanie rabatu (strikethrough, banner partnera, promo header) zostaje |
| D6 | Struktura kroków | **1:1 z referencją** | Backend dyktuje kolejność (`company-data` → `personal-data` → `operational-standards` → `payment-method` → `confirm`) |
| D7 | Testy | **Tylko `lib/*`** (validation, format, api, state) | ROI: walidacje krytyczne (NIP, money), framework-agnostic; testy komponentów Preact→React = duża praca, mała wartość |
| D8 | Layout checkoutu | **Dedykowany `CheckoutLayout.astro` + `CheckoutHeader.astro`** | Standardowy wzorzec Astro; eliminuje DOM hacks z `LayoutController` |
| D9 | Cleanup | **Pełne usunięcie `src/app/`**, zachować tylko `PricingCard.tsx` (przeniesione do `src/components/pricing/`) | Pre-launch projekt; git trzyma historię; zombie code = źródło błędów |

## 3. Struktura plików (target state)

```
src/
├── assets/img/                    [bez zmian]
├── components/
│   ├── Header.astro               [bez zmian — landing/cennik]
│   ├── Footer.astro               [bez zmian — landing/cennik]
│   ├── Ochrona360.astro           [bez zmian]
│   ├── CheckoutHeader.astro       [NOWE — uproszczony header dla checkoutu]
│   ├── pricing/                   [NOWY folder]
│   │   ├── PricingCards.tsx       [NOWE — orchestrator: fetch katalogu, billing toggle, klik CTA]
│   │   ├── PricingCard.tsx        [PRZENIESIONE z src/app/components/, bez zmian wizualnych]
│   │   ├── BillingCycleToggle.tsx [PORT z referencji, dostosowany do designu (Plus Jakarta Sans, brand-yellow)]
│   │   └── PartnerBanner.tsx      [NOWE — banner "Rabat 5% od ValveTech" (data-driven z discount.partnerName/Logo)]
│   └── checkout/                  [NOWY folder — porty z referencji, React]
│       ├── CheckoutProgressBar.tsx     [DOSTOSOWANE — design aktualnego projektu, 5 kroków zgodnie z backendem]
│       ├── FormField.tsx               [PORT — input wrapper z react-hook-form]
│       ├── FormActions.tsx             [PORT — pasek przycisków submit/back]
│       ├── FormAlert.tsx               [PORT — komunikat błędu API]
│       ├── FormStep.tsx                [PORT — wrapper kroku (header + body + actions)]
│       ├── PhoneField.tsx              [PORT — formatowanie numeru telefonu]
│       ├── ConsentCheckbox.tsx         [PORT — checkbox zgody RODO]
│       ├── NipLookupField.tsx          [PORT — NIP + button "pobierz dane z GUS"]
│       ├── CompanyDataStep.tsx         [PORT — pełen krok 1]
│       ├── PersonalDataStep.tsx        [PORT — pełen krok 2]
│       ├── OperationalStandardsStep.tsx [PORT — pełen krok 3]
│       ├── PaymentMethodStep.tsx       [PORT — pełen krok 4]
│       ├── PaymentMethodOption.tsx     [PORT — pojedynczy radio "Stripe / Przelew"]
│       ├── ConfirmStep.tsx             [PORT — krok 5 confirm + summary cards]
│       ├── SummaryDataCard.tsx         [PORT — read-only podsumowanie sekcji]
│       ├── SummaryPlanCard.tsx         [PORT — kafelek z planem + ceną]
│       ├── OrderSummaryAside.tsx       [PORT — sidebar widoczny na każdym kroku — design aktualnego projektu]
│       ├── AnswerTile.tsx              [PORT — tile odpowiedzi w ankiecie operational standards]
│       ├── StandardQuestion.tsx        [PORT — pojedyncze pytanie ankiety]
│       ├── BankTransferDetails.tsx     [PORT — szczegóły przelewu]
│       ├── BankTransferConfirmation.tsx [PORT — strona success dla przelewu]
│       ├── ProformaDownload.tsx        [PORT — przycisk pobrania proformy]
│       └── SuccessAnimation.tsx        [PORT — animowany checkmark na success]
├── data/
│   └── industries.ts              [PORT — lista branż dla company-data dropdown]
├── layouts/
│   ├── BaseLayout.astro           [bez zmian]
│   ├── LegalLayout.astro          [bez zmian]
│   └── CheckoutLayout.astro       [NOWE — head (GTM, cookie consent), CheckoutHeader, slot, brak Footer]
├── lib/                           [NOWY folder — wszystko z referencji, czysty TS]
│   ├── api/
│   │   ├── http.ts                [PORT — fetch wrapper z ApiError]
│   │   ├── catalog.ts             [PORT — getPlans()]
│   │   ├── orders.ts              [PORT — wszystkie /orders/* + /sales-order/* endpointy]
│   │   ├── types/
│   │   │   ├── catalog.ts         [PORT — PlanCatalogEntryDto, FeatureMap, DiscountPreviewDto]
│   │   │   ├── money.ts           [PORT — MoneyDto, BillingCycle]
│   │   │   ├── order.ts           [PORT — DTOs dla wszystkich endpointów order]
│   │   │   └── errors.ts          [PORT — ApiError, ApiErrorCode]
│   │   └── __mocks__/
│   │       ├── catalog.mock.ts    [PORT — hardcoded 4 plany dla PUBLIC_USE_MOCK_CATALOG=true]
│   │       └── orders.mock.ts     [PORT — in-memory mock orderów]
│   ├── catalog/
│   │   └── render-policy.ts       [NOWE — Model 3: PlanCatalogEntryDto → PricingCardProps]
│   ├── errors/
│   │   └── translate.ts           [PORT — ApiError → user-friendly title/message]
│   ├── format/
│   │   ├── money.ts               [PORT — formatMinorUnits, parseGrosze]
│   │   ├── partner.ts             [PORT — getPartnerFromUrl]
│   │   └── discount-code.ts       [PORT — getDiscountCodeFromUrl, clearDiscountCode]
│   ├── state/
│   │   ├── order-session.ts       [PORT — sessionStorage manager dla orderId + plan summary]
│   │   ├── form-state.ts          [PORT — per-step form persistence]
│   │   └── checkout-navigation.ts [PORT — guards: czy można wejść na ten krok?]
│   └── validation/
│       ├── nip.ts                 [PORT — checksum NIP]
│       ├── postal-code.ts         [PORT — XX-XXX format]
│       ├── email.ts               [PORT]
│       ├── company-data.ts        [PORT]
│       ├── personal-data.ts       [PORT]
│       ├── operational-standards.ts [PORT]
│       └── payment.ts             [PORT]
├── pages/
│   ├── index.astro                [bez zmian]
│   ├── obowiazek-informacyjny.astro    [bez zmian]
│   ├── polityka-plikow-cookies.astro   [bez zmian]
│   ├── polityka-prywatnosci.astro      [bez zmian]
│   ├── regulamin.astro                  [bez zmian]
│   ├── cennik.astro               [REFAKTOR — usunięty <PricingApp />, dodany <PricingCards client:load />]
│   └── checkout/
│       ├── company-data.astro          [NOWE — strona kroku 1]
│       ├── personal-data.astro         [NOWE — strona kroku 2]
│       ├── operational-standards.astro [NOWE — strona kroku 3]
│       ├── payment-method.astro        [NOWE — strona kroku 4]
│       ├── confirm.astro               [NOWE — strona kroku 5]
│       ├── bank-transfer.astro         [NOWE — Flow B success]
│       ├── success.astro               [NOWE — Flow A success (po Stripe)]
│       └── cancelled.astro             [NOWE — Flow A cancelled]
├── styles/
│   └── global.css                 [bez zmian]
├── env.d.ts                       [NOWE — typy dla import.meta.env (PUBLIC_API_BASE_URL itd.)]
└── app/                           [USUNIĘTY w całości — patrz § 9 Cleanup]
```

**Pliki do usunięcia (`src/app/` oraz):**
- `src/app/PricingApp.tsx`
- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/app/components/Navigation.tsx`
- `src/app/components/ValveTechLogo.tsx` (data-driven `partnerLogoUrl`)
- `src/app/components/PricingCard.tsx` → przenoszę do `src/components/pricing/PricingCard.tsx`
- `src/app/components/checkout/*.tsx` (8 plików)
- `src/app/context/CheckoutContext.tsx`
- `src/app/pages/PricingPage.tsx`
- `src/app/pages/StripePage.tsx`
- `src/pages/checkout/[...step].astro`

## 4. Cennik — szczegółowy design

### 4.1 Page entry — `src/pages/cennik.astro`

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
      <!-- Hero (statyczne, SSR) -->
      <div class="text-center mb-12">
        <h1 class="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl md:text-5xl text-[#0D0D0D] mb-4 tracking-tight">
          Cennik
        </h1>
        <p class="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-lg text-[#6B6965]">
          Wybierz plan ochrony dostosowany do potrzeb Twojej firmy
        </p>
      </div>

      <!-- React island — pobiera katalog, renderuje banner partnera + toggle + 4 kafle -->
      <PricingCards client:load />
    </div>
  </main>
</BaseLayout>
```

### 4.2 `PricingCards.tsx` — orchestrator (port z referencji + adaptacja React)

**Odpowiedzialności:**
1. On mount: fetch `GET /api/pricing-catalog` z opcjonalnymi `?partner=` / `?discountCode=` z URL
2. Renderuje stany: `loading` / `error` / `ready`
3. W stanie `ready`:
   - Banner partnera (jeśli któreś z planów ma `discount.partnerName/Logo`) — `<PartnerBanner />`
   - Toggle billing cycle — `<BillingCycleToggle />`
   - 4 × `<PricingCard {...renderPolicy(plan, billingCycle)} />`
4. Klik CTA na karcie → `POST /orders/start` z `{ catalogEntryId, billingCycle, partnerCode? }`
5. Response → `setFromStartOrderResponse(response, plan)` (zapis do sessionStorage)
6. `window.location.assign('/checkout/company-data?orderId=...')`

**Prawidłowa logika partnerCode (z referencji, ważne dla atrybucji):**
- `?partner=X` w URL → zawsze idzie jako `partnerCode` do `/orders/start`
- `?discountCode=X` w URL — sprawdzamy `plan.discount.kind`:
  - `PARTNER_FLAT|PARTNER_COMPOSITE|PARTNER_TIMEBOUND` → przepisujemy do `partnerCode` (i `clearDiscountCode()` żeby nie pre-fillować Step 4 inputu)
  - `CODE_FLAT` → zostawiamy w sessionStorage (preview na cenniku, manualny re-entry w Step 4)
  - `null` → nie atrybuujemy

### 4.3 `render-policy.ts` — Model 3 (NOWY plik)

Single source of truth dla mapowania backendowych `feature.*` → bogaty `FeatureSection[]` używany przez `PricingCard`.

**Struktura:**

```ts
import type { PlanCatalogEntryDto, FeatureMap } from '../api/types/catalog';
import type { BillingCycle } from '../api/types/money';
import type { PricingCardProps } from '../../components/pricing/PricingCard';
import { formatMinorUnits } from '../format/money';

// Tier z backendu (wymagane w pricing-catalog-changes.md § 4.2)
type PlanTier = 'entry' | 'mid' | 'high' | 'top';

// Per-tier emfaza highlightów (frontend policy)
const TIER_HIGHLIGHT: Record<PlanTier, 'yellow' | 'blue' | 'red' | null> = {
  entry: null,    // Standard
  mid:   'blue',  // Optimum
  high:  'yellow',// Profesjonalny
  top:   'red',   // Ekspert
};

const TIER_CTA_STYLE: Record<PlanTier, 'outline' | 'yellow'> = {
  entry: 'outline',
  mid:   'yellow', // recommended
  high:  'outline',
  top:   'outline',
};

// Decyzja D9 § 4.6 pricing-catalog-changes: planName z backendu jest EN, frontend mapuje
const PLAN_NAME_PL: Record<string, string> = {
  Standard:     'Standard',
  Optimum:      'Optimum',
  Professional: 'Profesjonalny',
  Expert:       'Ekspert',
};

// Definicje sekcji — kolejność, ikony, items + reguły widoczności
interface SectionDef {
  title: string;
  icon: 'shield' | 'pulse' | 'chat' | 'alert' | 'insurance' | 'education' | 'users';
  items: ItemDef[];
}

interface ItemDef {
  // Funkcja decydująca czy item ma się pojawić; null = zawsze pokazuj
  visibleWhen?: (f: FeatureMap) => boolean;
  // Funkcja zwracająca tekst (może czytać feature value)
  text: string | ((f: FeatureMap) => string);
  // Czy item bierze tier-based highlight
  emphasize?: boolean;
  // Spacer dla wyrównania (nadpisuje text)
  spacer?: boolean;
  // Spacer pokazuje się tylko dla wybranych tierów
  onlyIfTier?: PlanTier[];
}

const SECTIONS: SectionDef[] = [
  // 1. Ocena bezpieczeństwa
  {
    title: 'Ocena bezpieczeństwa',
    icon: 'shield',
    items: [
      { visibleWhen: f => f['feature.securityAssessment.legal'] === 'true', text: 'Zgodność z prawem' },
      { visibleWhen: f => f['feature.securityAssessment.technical'] === 'true', text: 'Odporność techniczna' },
      { visibleWhen: f => f['feature.securityAssessment.people'] === 'true', text: 'Świadomi ludzie' },
      {
        visibleWhen: f => f['feature.securityAssessment.report'] === 'detailed',
        text: 'Szczegółowe zalecenia i wytyczne',
      },
      {
        visibleWhen: f => f['feature.securityAssessment.report'] === 'general',
        text: 'Raport ogólny',
      },
      { spacer: true, onlyIfTier: ['entry'] }, // wyrównanie wysokości Standard
    ],
  },

  // 2. Monitoring zagrożeń
  {
    title: 'Monitoring zagrożeń',
    icon: 'pulse',
    items: [
      { visibleWhen: f => f['feature.monitoring.email'] === 'true', text: 'Sprawdzanie adresów e-mail i danych osobistych' },
      { visibleWhen: f => f['feature.monitoring.web'] === 'true', text: 'Monitoring strony www' },
    ],
  },

  // 3. Konsultacje z ekspertami
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

  // 4. Natychmiastowa pomoc 24h (statyczne bullety jeśli włączone)
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

  // 5. Ubezpieczenie
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

  // 6. Szkolenia z bezpieczeństwa
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

  // 7. Wielodostęp
  {
    title: 'Wielodostęp',
    icon: 'users',
    items: [
      { visibleWhen: f => f['feature.multiUser.accountSwitching'] === 'true', text: 'Przełączanie się między kontami' },
      { visibleWhen: f => f['feature.multiUser.partnerDataView'] === 'true', text: 'Wgląd w dane i konfigurację partnerów' },
    ],
  },
];

function formatPLN(grosze: string | undefined): string {
  if (!grosze) return '0';
  const n = Number(grosze);
  return new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(n);
}

export function planToCardProps(
  plan: PlanCatalogEntryDto,
  billingCycle: BillingCycle,
): PricingCardProps {
  const tier = (plan.tier ?? 'entry') as PlanTier;
  const highlight = TIER_HIGHLIGHT[tier];

  const features = SECTIONS
    .map(section => ({
      title: section.title,
      icon: section.icon,
      items: section.items
        .filter(item => {
          if (item.spacer && item.onlyIfTier) return item.onlyIfTier.includes(tier);
          if (item.spacer) return true;
          return item.visibleWhen ? item.visibleWhen(plan.features) : true;
        })
        .map(item => {
          if (item.spacer) return { text: '', spacer: true };
          const text = typeof item.text === 'function' ? item.text(plan.features) : item.text;
          return {
            text,
            highlight: item.emphasize ? (highlight ?? undefined) : undefined,
          };
        }),
    }))
    .filter(s => s.items.length > 0);

  // Obliczenie cen + promo headers + savings z plan.pricing + plan.discount
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

function derivePricingProps(plan: PlanCatalogEntryDto, billingCycle: BillingCycle) {
  // Implementacja: czyta plan.monthlyPrice, plan.annualPrice, plan.discount.*
  // Zwraca: price, yearlyPrice, originalPrice, originalYearlyPrice, hasDiscount,
  //         promoHeader, promoSubtext, savingsBadge
  // Logika z aktualnego PricingPage.tsx (calculatePrice/calculateYearlyPrice/...)
  // ale zasilana danymi z backendu (plan.discount.monthlyPriceAfterDiscount itd.)
  // SZCZEGÓŁY PEŁNEJ IMPLEMENTACJI W PLANIE.
  return { /* ... */ } as Partial<PricingCardProps>;
}
```

### 4.4 `PartnerBanner.tsx` — NOWY komponent

Renderuje pasek nad kafelkami gdy backend zwrócił `discount.partnerName` na którymkolwiek planie:

```tsx
interface PartnerBannerProps {
  partnerName: string;          // np. "ValveTech"
  partnerLogoUrl: string | null;// data-driven z backendu
  description: string;          // np. "Rabat 5% na wszystkie plany od ValveTech"
}
```

Design 1:1 z aktualnym `bg-[#DDEEF8] rounded-[12px] px-5 py-3 flex items-center gap-6` (z `PricingPage.tsx`).

### 4.5 `PricingCard.tsx` — bez zmian wizualnych

Plik przenoszę z `src/app/components/PricingCard.tsx` do `src/components/pricing/PricingCard.tsx`. **Zero zmian w kodzie wizualnym** — props interface zostaje, render zostaje. Tylko import paths się zmieniają.

### 4.6 `BillingCycleToggle.tsx` — port + adaptacja designu

Port logiki z referencji (state up via callback `onChange`) z designem aktualnego projektu (z `PricingPage.tsx` linie 478-510 — biały tło, `bg-black text-white` dla aktywnego, „Miesięczna" / „Rocznie -20%" badge).

## 5. Checkout — szczegółowy design

### 5.1 Layout: `CheckoutLayout.astro`

```astro
---
interface Props {
  title: string;
  description?: string;
}
const { title, description } = Astro.props;
---
<!doctype html>
<html lang="pl">
  <head>
    <!-- GTM, cookie consent, JSON-LD — zaimportuj z BaseLayout lub wspólny <HeadCommon /> -->
    <!-- ... (share kod z BaseLayout) ... -->
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="robots" content="noindex, nofollow" />
  </head>
  <body class="font-['Plus_Jakarta_Sans',sans-serif] bg-white">
    <CheckoutHeader />
    <main class="min-h-screen pt-[100px]">
      <slot />
    </main>
    <!-- brak Footer -->
  </body>
</html>
```

**Decyzja:** GTM ma być załadowany w checkoutcie (śledzenie konwersji). Wspólny `<HeadCommon.astro />` komponent reusowany z `BaseLayout`.

### 5.2 Header: `CheckoutHeader.astro`

Uproszczona wersja `Header.astro`:
- Logo (klik → `/`)
- Telefon kontaktowy (z aktualnego `Header.astro`)
- Brak nawigacji (Główna / Cennik / itp.)
- Brak hamburger menu
- Sticky/fixed jak w aktualnym headerze

### 5.3 Wzorzec strony checkoutu — przykład `company-data.astro`

```astro
---
import CheckoutLayout from '../../layouts/CheckoutLayout.astro';
import { CompanyDataStep } from '../../components/checkout/CompanyDataStep';
---
<CheckoutLayout
  title="Dane firmy — Checkout CyberCover"
  description="Wprowadź dane firmy do zamówienia"
>
  <CompanyDataStep client:load />
</CheckoutLayout>
```

### 5.4 Wzorzec komponentu kroku — `CompanyDataStep.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormStep } from './FormStep';
import { NipLookupField } from './NipLookupField';
import { FormField } from './FormField';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { getOrderSession, saveOrderSession } from '../../lib/state/order-session';
import { saveFormState, getFormState } from '../../lib/state/form-state';
import { canEnterStep } from '../../lib/state/checkout-navigation';
import { submitCompanyData, lookupCompany, getCheckoutState } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { validateNip, validatePostalCode } from '../../lib/validation';
import { INDUSTRIES } from '../../data/industries';

export function CompanyDataStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  // ... + form state, lookup state, plan summary

  // Mount: 
  useEffect(() => {
    // 1. Read URL ?orderId=
    const url = new URL(window.location.href);
    const id = url.searchParams.get('orderId');
    if (!id) { window.location.assign('/cennik'); return; }

    // 2. Validate sessionStorage matches URL
    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    // 3. Server-side guard: GET /orders/{id}/checkout-state — confirm step is allowed
    getCheckoutState(id).then(state => {
      if (!canEnterStep('company-data', state)) {
        // backend says checkout is in different step — redirect there
        window.location.assign(`/checkout/${state.nextStep}?orderId=${id}`);
        return;
      }
      setOrderId(id);
      // 4. Restore form state if user navigated back
      const saved = getFormState('company-data');
      if (saved) form.reset(saved);
    }).catch(err => {
      const t = translateApiError(err);
      setSubmitError(t);
    });
  }, []);

  const onSubmit = async (data) => {
    setSubmitError(null);
    try {
      const state = await submitCompanyData(orderId!, mapFormToDto(data));
      saveFormState('company-data', data);
      window.location.assign(`/checkout/personal-data?orderId=${orderId}`);
    } catch (err) {
      setSubmitError(translateApiError(err));
    }
  };

  if (!orderId) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={1} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Dane firmy
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert {...submitError} />}
            <form onSubmit={handleSubmit(onSubmit)}>
              <FormStep title="Dane rejestrowe organizacji">
                <NipLookupField {...register('nip', { validate: validateNip })} onLookup={...} />
                <FormField label="Nazwa" {...register('nazwa', { required: true })} />
                <FormField label="Ulica i numer" {...register('ulica', { required: true })} />
                <FormField label="Miasto" {...register('miasto', { required: true })} />
                <FormField label="Kod pocztowy" {...register('kodPocztowy', { validate: validatePostalCode })} />
                <FormField type="select" options={INDUSTRIES} label="Branża" {...register('branza')} />
              </FormStep>
              <FormActions onBack={() => window.location.assign('/cennik')} />
            </form>
          </div>
          <aside className="lg:col-span-1">
            <OrderSummaryAside />
          </aside>
        </div>
      </div>
    </div>
  );
}
```

**Wszystkie kroki idą tym samym wzorcem:**
1. Mount guards: URL `?orderId=` → sessionStorage match → GET checkout-state → can enter step?
2. Restore saved form state (z form-state cache w sessionStorage)
3. Render: progress bar + tytuł + form + aside summary
4. Submit: PATCH endpoint → saveFormState → window.location.assign next step
5. Error handling: ApiError → translateApiError → `<FormAlert />`

### 5.5 Mapping kroków → endpointy

| URL strony | Krok # | Backend endpoint | Komponent |
|---|---|---|---|
| `/checkout/company-data` | 1 | `PATCH /orders/{id}/company-data` | `CompanyDataStep` |
| `/checkout/personal-data` | 2 | `PATCH /orders/{id}/personal-data` + `GET /orders/consent-definitions` | `PersonalDataStep` |
| `/checkout/operational-standards` | 3 | `GET /orders/{id}/operational-standards-schema` + `PATCH /orders/{id}/operational-standards` + `POST /orders/{id}/evaluate-eligibility` | `OperationalStandardsStep` |
| `/checkout/payment-method` | 4 | `PATCH /orders/{id}/payment-method` + `POST /orders/{id}/validate-discount` (opcjonalnie) | `PaymentMethodStep` |
| `/checkout/confirm` | 5 | `POST /orders/{id}/confirm` (decyzja: Stripe/Bank/Promo 0PLN) + `POST /sales-order/{id}/stripe-checkout-session` (jeśli Stripe) | `ConfirmStep` |
| `/checkout/bank-transfer` | success | `GET /orders/{id}/confirmation` + buildProformaDownloadUrl | `BankTransferConfirmation` |
| `/checkout/success` | success | `GET /orders/{id}/confirmation?token=...` | `SuccessAnimation` + summary |
| `/checkout/cancelled` | error | (brak — info page) | `CancelledStep` (mały komponent inline) |

### 5.6 Flow płatności — 3 ścieżki

**Flow A — Stripe Checkout (karta/BLIK/Apple/Google Pay):**
```
[/checkout/confirm] POST /orders/{id}/confirm 
  → response: { paymentChannel: 'STRIPE_PAYMENT_INTENT' }
  → POST /sales-order/{id}/stripe-checkout-session
  → response: { url: "https://checkout.stripe.com/..." }
  → window.location.assign(stripeUrl)
  
... user pays on Stripe-hosted page ...

Stripe redirect back:
  → /checkout/success?session_id=cs_xxx&order_id=xxx  (success_url skonfigurowany w session)
  → /checkout/cancelled?order_id=xxx                  (cancel_url)

[/checkout/success] mount:
  → GET /orders/{id}/confirmation?token=... (token z URL)
  → render SuccessAnimation + summary
  → clearOrderSession()
```

**Flow B — Przelew bankowy:**
```
[/checkout/confirm] POST /orders/{id}/confirm
  → response: { paymentChannel: 'BANK_TRANSFER' }
  → window.location.assign('/checkout/bank-transfer?orderId=...')

[/checkout/bank-transfer] mount:
  → GET /orders/{id}/confirmation
  → render BankTransferDetails (numer konta, kwota, tytuł przelewu) + ProformaDownload
  → clearOrderSession()
```

**Flow C — Promotional 0 PLN:**
```
[/checkout/confirm] POST /orders/{id}/confirm
  → response: { paymentChannel: 'PROMOTIONAL_DISCOUNT', token: '...' }
  → window.location.assign('/checkout/success?orderId=...&token=...&promo=true')

[/checkout/success] mount jak Flow A, dodatkowo info "darmowe przez X miesięcy"
```

### 5.7 Progress bar (5 kroków, design aktualnego projektu)

```ts
const STEPS = [
  { number: 1, label: 'Dane firmy',          path: '/checkout/company-data' },
  { number: 2, label: 'Dane osobiste',       path: '/checkout/personal-data' },
  { number: 3, label: 'Standardy',           path: '/checkout/operational-standards' },
  { number: 4, label: 'Płatność',            path: '/checkout/payment-method' },
  { number: 5, label: 'Potwierdzenie',       path: '/checkout/confirm' },
];
```

Wizualnie 1:1 z aktualnym `CheckoutProgressBar.tsx` — `#FED64B` dla aktywnego, `#268E55` dla ukończonych, `#EAEAE8` dla przyszłych. Mobile fallback (krok X z 5 + label + progress bar).

### 5.8 OrderSummaryAside (sidebar z planem)

Port logiki z referencji (czyta `getOrderSession()` z sessionStorage), design 1:1 z aktualnego `OrderDetailsStep.tsx` linie 94-188 — kafelek z planem, ceną, opisem, promo header (jeśli rabat).

## 6. State management

### 6.1 Order session (`lib/state/order-session.ts`)

SessionStorage key: `cybercover.orderSession.v1`. Trzymamy:
```ts
{
  orderId: string;
  catalogEntryId: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  partnerCode?: string;
  plan: {
    planName: string;
    priceMinorUnits: number;
    currency: 'PLN';
    description: string;
  };
  // Discount preview do renderowania na sidebar/summary
  discount?: { ... };
  // Timestamp do wygaśnięcia (np. 24h)
  createdAt: string; // ISO
}
```

API:
- `setFromStartOrderResponse(response, plan)` — zapis po `POST /orders/start`
- `getOrderSession()` — odczyt
- `clearOrderSession()` — czyszczenie po success/cancelled
- `isExpired(session)` — sprawdzenie wygaśnięcia (>24h → traktuj jako brak sesji)

### 6.2 Form state (`lib/state/form-state.ts`)

SessionStorage key: `cybercover.formState.v1`. Trzymamy form values per krok:
```ts
{
  'company-data': { nip, nazwa, ulica, miasto, kodPocztowy, branza } | null,
  'personal-data': { firstName, lastName, email, phone, consents } | null,
  'operational-standards': Record<questionId, answerId> | null,
  'payment-method': { method, discountCode } | null,
}
```

API:
- `saveFormState(step, values)` — zapis po submit
- `getFormState(step)` — restore przy mount
- `clearFormState()` — czyszczenie po success

### 6.3 Navigation guards (`lib/state/checkout-navigation.ts`)

```ts
type CheckoutStep = 'company-data' | 'personal-data' | 'operational-standards' | 'payment-method' | 'confirm';

// Wywoływane przy mount każdego kroku — czy backend pozwala na ten krok?
export function canEnterStep(step: CheckoutStep, state: CheckoutStateResponseDto): boolean {
  // Logika z referencji: sprawdza state.completedSteps i state.nextStep
  // Jeśli step jest "future" → false (przekierowanie na nextStep)
  // Jeśli step jest "current" → true
  // Jeśli step jest "past" → true (allow editing)
}

export function nextStepUrl(state: CheckoutStateResponseDto, orderId: string): string {
  return `/checkout/${state.nextStep}?orderId=${orderId}`;
}
```

## 7. API integration layer

Port `lib/api/` z referencji bez zmian (czysty TS):
- `http.ts` — fetch wrapper, ApiError, parsowanie błędów backendowych
- `catalog.ts` — `getPlans(discountCode?, partnerCode?)` 
- `orders.ts` — wszystkie endpointy `/orders/*` + `/sales-order/*`
- `__mocks__/catalog.mock.ts`, `__mocks__/orders.mock.ts` — flagowane przez `PUBLIC_USE_MOCK_*`

Zmiana vs referencja: `getPlans()` musi przyjąć też **`partnerCode`** (zgodnie z `pricing-catalog-changes.md` § 4.3) — dodajemy parametr do query.

### 7.1 Error translation (`lib/errors/translate.ts`)

Port z referencji bez zmian. Mapuje `ApiError.code` na `{ title: string; message: string }` po polsku.

### 7.2 Env config (`.env.example`)

```
PUBLIC_API_BASE_URL=http://localhost:3000/api
PUBLIC_USE_MOCK_CATALOG=true
PUBLIC_USE_MOCK_ORDERS=false
```

`src/env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_USE_MOCK_CATALOG?: string;
  readonly PUBLIC_USE_MOCK_ORDERS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

## 8. Walidacje (`lib/validation/`)

Port z referencji bez zmian — czysty TS:
- `nip.ts` — checksum NIP
- `postal-code.ts` — XX-XXX
- `email.ts`
- `company-data.ts` — wszystko razem (NIP + nazwa + adres + branża)
- `personal-data.ts` — firstName + lastName + email + phone + consents
- `operational-standards.ts` — odpowiedzi na pytania ankiety
- `payment.ts` — wybór metody + opcjonalny discountCode

## 9. Cleanup / migration

### 9.1 Pliki do usunięcia

```bash
rm -r src/app/                      # cały folder
rm src/pages/checkout/[...step].astro
```

### 9.2 Pliki do przeniesienia

```bash
# PRZED usunięciem src/app/ — ratujemy PricingCard
mkdir -p src/components/pricing
git mv src/app/components/PricingCard.tsx src/components/pricing/PricingCard.tsx
```

### 9.3 Dependencies

**Usunąć:**
- `react-router` (nie potrzebne w multi-page)
- `lucide-react` — sprawdzić czy używane gdziekolwiek poza `PricingPage.tsx` (ChevronDown), jeśli nie — usuwamy

**Dodać dev (dla testów):**
- `vitest`
- `@vitest/coverage-v8` (opcjonalnie)
- `jsdom` (dla niektórych testów state managementu jeśli potrzebują `window`)

**Zachować:**
- `@astrojs/react`, `react`, `react-dom`, `react-hook-form` — dalej używane
- `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` — design system tokens (sprawdzić czy używane przez `PricingCard`)
- `motion` — sprawdzić czy używane (jeśli SuccessAnimation z referencji używa, port; jeśli nie — usunąć)

### 9.4 `astro.config.mjs`

Zostaje React integration. `optimizeDeps.include` dla `react-router` można usunąć. Reszta bez zmian.

### 9.5 `package.json` scripts

Dodać:
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## 10. Testy (zakres B z brainstormingu)

Port z referencji **tylko `lib/**` testów**:
- `lib/validation/*.test.ts` (NIP, postal-code, email, company-data, personal-data, operational-standards, payment)
- `lib/format/*.test.ts` (money, partner, discount-code)
- `lib/api/*.test.ts` (http, catalog, orders, __mocks__/catalog.mock, __mocks__/orders.mock)
- `lib/state/*.test.ts` (order-session, form-state, checkout-navigation)

**Konfiguracja:**
- `vitest.config.ts` — port z referencji (jeśli nie istnieje — sprawdzić; obecny aktualny projekt ma `vitest.config.ts`?)
- `vitest.setup.ts` — port + dostosowanie (na razie tylko jsdom env)
- `tsconfig.test.json` — port (już istnieje pusty w aktualnym projekcie)

**Pomijamy:** wszystkie `*.test.tsx` (komponenty) — wartość/wysiłek nie uzasadnia portu Preact→React.

## 11. Mocki — szczegóły

Port `__mocks__/catalog.mock.ts` z referencji + dostosowanie do nowych kluczy `feature.*` zgodnych z `pricing-catalog-changes.md` § 4.1. Czyli mock zwraca **dokładnie te same klucze** które backend zacznie zwracać po implementacji § 4.1. Pozwoli to na rozwój frontendu równolegle do backendu.

Port `__mocks__/orders.mock.ts` bez zmian — symuluje pełen flow (start → company-data → ... → confirm → success).

## 12. Stripe — punkty integracji

- `POST /sales-order/{id}/stripe-checkout-session` zwraca `{ url, session_id }`
- Stripe `success_url` skonfigurowany przez backend na `https://cybercover.pl/checkout/success?order_id={ORDER_ID}&token={TOKEN}` (placeholder zastępowany przez Stripe metadata)
- Stripe `cancel_url` na `https://cybercover.pl/checkout/cancelled?order_id={ORDER_ID}`
- Frontend nie wywołuje Stripe SDK — używa hosted checkout przez redirect

## 13. Otwarte sprawy / ryzyka

| # | Sprawa | Decyzja / status |
|---|---|---|
| O1 | Backend implementacji `pricing-catalog-changes.md` | User implementuje osobno; w międzyczasie frontend pracuje na mockach (`PUBLIC_USE_MOCK_CATALOG=true`) |
| O2 | Synchronizacja kluczy `feature.*` między backendem a frontendowym `render-policy.ts` | Plik `pricing-catalog-changes.md` § 4.1 jest single source of truth — zmiana wymaga aktualizacji obu stron |
| O3 | Cookie consent w checkoutcie | `CheckoutLayout` ładuje cookie consent banner (jak `BaseLayout`) — wspólny komponent `<HeadCommon />` |
| O4 | GTM events w checkoutcie | Lista eventów do dodania (`begin_checkout`, `add_payment_info`, `purchase`) — DEFERED do osobnego zadania, po zakończeniu integracji |
| O5 | Stripe success/cancel URL placeholders | Backend musi to skonfigurować przy `POST /sales-order/{id}/stripe-checkout-session` — sprawdzić obecny config |
| O6 | NIP lookup integration | Backend ma `GET /orders/company-lookup?nip=` — port z referencji bez zmian |
| O7 | Industries dropdown | Lista branż w `data/industries.ts` (port z referencji) — czy zgadza się z aktualnym hardcoded `BRANŻE` w OrderDetailsStep? Jeśli różnica → użyj wersji z referencji (zgodnej z backendem) |
| O8 | Mobile responsywność checkoutu | Aktualny design ma mobile/desktop variants — port zachowuje to |
| O9 | i18n | Decyzja: planName z backendu po angielsku, mapowanie w `render-policy.ts` (zgodnie z `pricing-catalog-changes.md` § 4.6 Opcja B) — i18n cały interfejs jest deferred |

## 14. Kryteria sukcesu

- [ ] `/cennik` renderuje 4 plany z `GET /api/pricing-catalog` (lub mocku) — design 1:1 z aktualnym
- [ ] Kliknięcie planu wykonuje `POST /orders/start` i przekierowuje na `/checkout/company-data?orderId=...`
- [ ] `?partner=VALVETECH` w URL pokazuje banner partnera + przeliczone ceny
- [ ] `?discountCode=SUMMER10` pokazuje strikethrough ceny + nowe ceny po rabacie
- [ ] Każdy z 5 kroków checkoutu: ładuje się z guard'em, formularz waliduje, submit patchuje order, redirect na następny
- [ ] Refresh strony w trakcie checkoutu nie traci stanu (sessionStorage)
- [ ] Cofnięcie się do poprzedniego kroku zachowuje wpisane dane
- [ ] Flow A (Stripe): `/confirm` → redirect na Stripe → po success/cancel powrót do `/success` lub `/cancelled`
- [ ] Flow B (Bank transfer): `/confirm` → `/bank-transfer` z numerem konta + proforma download
- [ ] Flow C (Promo 0 PLN): `/confirm` → `/success` z info o darmowym okresie
- [ ] Wszystkie testy `lib/*` przechodzą (`pnpm test:run`)
- [ ] `pnpm build` przechodzi bez błędów TypeScript
- [ ] `src/app/` jest usunięte
- [ ] Aktualny visual design zachowany w 100% (Plus Jakarta Sans, brand-yellow, kafelki cennika z ikonami i highlightami)

---

## Streszczenie dla wdrożenia

Proces 4-fazowy:
1. **Faza 1** — fundamenty (lib/, env, layouts, mocki) — zero UI changes
2. **Faza 2** — cennik (PricingCards, render-policy, PartnerBanner) — pierwsza widoczna funkcjonalność
3. **Faza 3** — checkout (5 kroków + 3 success states) — main lift
4. **Faza 4** — cleanup (delete `src/app/`, update deps, finalna walidacja)

Szczegóły kroków → plan implementacyjny.
