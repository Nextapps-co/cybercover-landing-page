// Model 3 — single source of truth for mapping backend's semantic
// PlanCatalogEntryDto into the rich PricingCardProps consumed by the mini-card
// on /cennik, and into the ComparisonGridProps consumed by the full
// feature-comparison table below the cards.
//
// Backend owns: WHAT (which plans, semantic feature.* keys, prices, discounts)
// Frontend owns: HOW (icons, sentence templates, plan name translation,
//                card-vs-grid layout)
//
// Section titles, row labels, which feature.* key backs which row, and value
// formatters all live in `./comparison-content.ts` (`COMPARISON`) — the single
// source of content for both projections in this file. To add/modify what's
// shown on the card or in the grid: edit `COMPARISON`, not this file.
// To add a new tier or feature key: extend the contract documented in
// `docs/pricing-catalog-changes.md` and update `COMPARISON` to read it.

import type { PlanCatalogEntryDto, FeatureMap, PlanTier, SubscriptionStatus, DiscountPreviewDto } from '../api/types/catalog';
import type { BillingCycle, MoneyDto } from '../api/types/money';
import type { PricingCardProps, PricingCardVariant, CardSectionProps } from '../../components/pricing/PricingCard';
import { formatMinorUnits } from '../format/money';
import { COMPARISON, resolveCell, isRowKnown, normalizeGroupingSpaces } from './comparison-content';
import type { CellState, ComparisonSectionDef, SectionIconName } from './comparison-content';

// Per spec §5.4.3 — auth context propagowany przez `planToCardProps` żeby zdecydować
// czy karta jest klikalna ('available'), zablokowana jako aktualny plan ('current'),
// czy niedostępna ('unavailable').
export interface AuthContext {
  currentPlanCode?: string;
  subscriptionStatus?: SubscriptionStatus;
  currentBillingCycle?: BillingCycle;
}

function deriveVariant(
  plan: PlanCatalogEntryDto,
  billingCycle: BillingCycle,
  ctx?: AuthContext,
): { variant: PricingCardVariant; currentPlanBadge?: string; unavailableReason?: string } {
  // BE wysyła per-cycle relative — wybieramy zgodnie z aktywnym togglem.
  const relative =
    billingCycle === 'MONTHLY' ? plan.monthlyRelativeToCurrent : plan.annualRelativeToCurrent;

  if (!relative) {
    // Anonymous mode lub klient bez sub — wszystko klikalne
    return { variant: 'available' };
  }

  if (relative === 'CURRENT') {
    if (ctx?.subscriptionStatus === 'ACTIVE') {
      // Aktywny klient na tym planie — greyed, brak CTA
      return { variant: 'current', currentPlanBadge: 'Twój aktualny plan' };
    }
    // GRACE/EXPIRED/CANCELLED — klikalne (reactivation), badge wskazuje historię
    return { variant: 'available', currentPlanBadge: 'Poprzedni plan' };
  }

  if (relative === 'NOT_AVAILABLE') {
    // Same plan code + NOT_AVAILABLE → semantyka „zmiana cyklu" (BE nie pozwala na to przez wizard).
    if (ctx?.currentPlanCode === plan.code) {
      return {
        variant: 'unavailable',
        unavailableReason: 'Niedostępne na tym cyklu rozliczeniowym',
      };
    }
    return {
      variant: 'unavailable',
      unavailableReason: 'Niedostępne — niższy niż aktualny plan',
    };
  }

  // UPGRADE_AVAILABLE
  return { variant: 'available' };
}

// ── Tier-driven presentation policy ──────────────────────────────────

// CTA button style per tier
const TIER_CTA_STYLE: Record<PlanTier, NonNullable<PricingCardProps['ctaStyle']>> = {
  entry: 'outline',
  mid: 'yellow',
  high: 'outline',
  top: 'outline',
};

/**
 * `Record<PlanTier, …>` opisuje tiery, które znamy dziś — backend może dodać kolejny
 * (np. 'ultra') bez deploya frontu i wtedy indeksowanie zwróci `undefined` mimo typu.
 * Bez jawnego fallbacku duża karta i pasek siatki wzięłyby swoje różne defaulty
 * i ten sam plan miałby dwa różne przyciski.
 */
function ctaStyleFor(plan: PlanCatalogEntryDto): NonNullable<PricingCardProps['ctaStyle']> {
  return TIER_CTA_STYLE[plan.tier ?? 'entry'] ?? 'outline';
}

// Polish display name. Backend returns English (per pricing-catalog-changes § 4.6 Option B).
// To add a new plan: just add its English name as a key here. Falls through to backend value if not mapped.
const PLAN_NAME_PL: Record<string, string> = {
  Standard: 'Standard',
  Optimum: 'Optimum',
  Professional: 'Profesjonalny',
  Expert: 'Ekspert',
};

// ── Helpers ──────────────────────────────────────────────────────────

// Polish month plural for promotional duration ("3 miesiące", "1 miesiąc", "5 miesięcy")
function monthsLabel(n: number): string {
  if (n === 1) return 'miesiąc';
  if (n >= 2 && n <= 4) return 'miesiące';
  return 'miesięcy';
}

// Format a yearly total ("3 540 zł netto/rok") from a monthly rate in grosze
function formatYearlyTotal(monthlyMinorUnits: number): string {
  const yearlyMajor = (monthlyMinorUnits * 12) / 100;
  const formatted = normalizeGroupingSpaces(
    new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(Math.round(yearlyMajor)),
  );
  return `${formatted} zł netto/rok`;
}

interface PricingDisplayProps {
  price: string;
  /**
   * Ta sama kwota co `price`, ale w groszach. Konsument (`AnimatedPrice`) potrzebuje
   * liczby do animacji — parsowanie sformatowanego stringa gubiło grosze
   * (336,30 zł → 336), więc surową wartość podaje projekcja, nie komponent.
   */
  priceMinorUnits: number;
  yearlyPrice?: string;
  originalPrice?: string;
  originalYearlyPrice?: string;
  hasDiscount?: boolean;
  promoHeader?: string;
  promoSubtext?: string;
  savingsBadge?: string;
}

/**
 * Czy zniżka z preview katalogu faktycznie obowiązuje dla danego cyklu rozliczeniowego.
 * WYSIWYG: zwraca `true` dokładnie wtedy, gdy karta pokazuje cenę po zniżce dla tego cyklu.
 *
 * - Zniżka time-bound (np. „0 zł przez 3 mies.") obowiązuje tylko dla swojego
 *   `promotionalDuration.applicableBillingCycle` (dziś zawsze MONTHLY). Wybór ANNUAL → brak zniżki.
 * - Zniżka bez `promotionalDuration` (FLAT/COMPOSITE) obowiązuje dla cyklu, który ma
 *   wyliczoną cenę po zniżce.
 *
 * Uwaga: BE potrafi wypełniać `annual*`/`monthly*PriceAfterDiscount` dla obu cykli nawet gdy
 * kod jest ograniczony do jednego cyklu — dlatego jedynym pewnym sygnałem restrykcji jest
 * `promotionalDuration.applicableBillingCycle`. Używane też przez `PricingCards`, żeby NIE
 * doklejać do /orders/start kodu, który BE by odrzucił dla niepasującego cyklu
 * („requires billing cycle MONTHLY, but order has ANNUAL").
 */
export function discountAppliesToCycle(
  discount: DiscountPreviewDto | null | undefined,
  billingCycle: BillingCycle,
): boolean {
  if (!discount?.eligible) return false;
  const afterDiscount =
    billingCycle === 'MONTHLY' ? discount.monthlyPriceAfterDiscount : discount.annualPriceAfterDiscount;
  if (!afterDiscount) return false;
  // BE oznacza WSZYSTKIE plany eligible:true dla zniżki celowanej w jeden plan
  // (np. PARTNER_COMPOSITE „10% na Optimum" → Standard/Profesjonalny/Ekspert dostają
  // priceAfterDiscount == price i discountAmount == 0). Rozróżnienie „realnie obniża cenę"
  // niesie tylko discountAmount — bez tego karta pokazywałaby przekreślone 295 zł → 295 zł.
  const discountAmount =
    billingCycle === 'MONTHLY' ? discount.monthlyDiscountAmount : discount.annualDiscountAmount;
  if (!discountAmount || discountAmount.amount <= 0) return false;
  if (discount.promotionalDuration) {
    return discount.promotionalDuration.applicableBillingCycle === billingCycle;
  }
  return true;
}

/**
 * Który cykl rozliczeniowy powinien być domyślnie zaznaczony na /cennik.
 *
 * Gdy zniżka (partnerska/kodowa) realnie obowiązuje dokładnie dla jednego cyklu —
 * zwraca ten cykl, żeby toggle wskazał od razu na cykl, na którym klient dostaje zniżkę.
 * Np. TIMEBOUND „0 zł przez 3 mies." (applicableBillingCycle: MONTHLY) → 'MONTHLY'.
 *
 * Gdy zniżka obowiązuje na obu cyklach (np. PARTNER_COMPOSITE „10% na Optimum")
 * albo na żadnym (brak zniżki) → zwraca null, a caller trzyma domyślny 'ANNUAL'.
 */
export function discountDrivenBillingCycle(
  plans: PlanCatalogEntryDto[],
): BillingCycle | null {
  const appliesMonthly = plans.some(p => discountAppliesToCycle(p.discount, 'MONTHLY'));
  const appliesAnnual = plans.some(p => discountAppliesToCycle(p.discount, 'ANNUAL'));
  if (appliesMonthly && !appliesAnnual) return 'MONTHLY';
  if (appliesAnnual && !appliesMonthly) return 'ANNUAL';
  return null;
}

function derivePricing(plan: PlanCatalogEntryDto, billingCycle: BillingCycle): PricingDisplayProps {
  const monthlyOriginal = plan.monthlyPrice;
  const annualOriginal = plan.annualPrice;
  const discount = plan.discount;

  // Choose the rate to display based on billing cycle (price label is always per-month)
  const baseRate: MoneyDto = billingCycle === 'MONTHLY' ? monthlyOriginal : annualOriginal;

  // After-discount monthly amount for the selected cycle (when applicable)
  const afterDiscountMonthly: MoneyDto | null =
    discount?.eligible
      ? billingCycle === 'MONTHLY'
        ? discount.monthlyPriceAfterDiscount
        : discount.annualPriceAfterDiscount
      : null;

  // Czy zniżka faktycznie obowiązuje dla wybranego cyklu (WYSIWYG — jedno źródło prawdy).
  const applies = discountAppliesToCycle(discount, billingCycle);

  // Standard discount path: strikethrough original + show after-discount (no promo period)
  if (applies && afterDiscountMonthly && !discount?.promotionalDuration) {
    return {
      price: formatMinorUnits(afterDiscountMonthly.amount, afterDiscountMonthly.currency),
      priceMinorUnits: afterDiscountMonthly.amount,
      yearlyPrice: formatYearlyTotal(afterDiscountMonthly.amount),
      originalPrice: formatMinorUnits(baseRate.amount, baseRate.currency),
      originalYearlyPrice: formatYearlyTotal(baseRate.amount),
      hasDiscount: true,
    };
  }

  // Promotional period path (e.g. "0 zł przez 3 miesiące" — TIMEBOUND on monthly cycle)
  if (applies && discount?.promotionalDuration && afterDiscountMonthly) {
    const months = discount.promotionalDuration.months;
    return {
      price: formatMinorUnits(afterDiscountMonthly.amount, afterDiscountMonthly.currency),
      priceMinorUnits: afterDiscountMonthly.amount,
      promoHeader: formatMinorUnits(baseRate.amount, baseRate.currency),
      promoSubtext: `przez ${months} ${monthsLabel(months)}`,
      hasDiscount: true,
      // Keep yearlyPrice line (showing original) so card heights stay aligned across plans
      yearlyPrice: formatYearlyTotal(baseRate.amount),
    };
  }

  // No discount applicable for this billing cycle — show plain price + savings badge if applicable
  let savingsBadge: string | undefined;
  if (!applies && billingCycle === 'ANNUAL') {
    // Show how much the user saves vs paying monthly: (monthly - annual) * 12
    const savingsGrosze = (monthlyOriginal.amount - annualOriginal.amount) * 12;
    if (savingsGrosze > 0) {
      const savingsZL = Math.round(savingsGrosze / 100);
      const formatted = normalizeGroupingSpaces(
        new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(savingsZL),
      );
      savingsBadge = `${formatted} zł`;
    }
  }

  return {
    price: formatMinorUnits(baseRate.amount, baseRate.currency),
    priceMinorUnits: baseRate.amount,
    yearlyPrice: formatYearlyTotal(baseRate.amount),
    savingsBadge,
  };
}

// ── Wspólna projekcja nagłówka planu ─────────────────────────────────
// Karta i pasek siatki pokazują ten sam nagłówek (nazwa, CTA, wariant auth-aware).
// Liczony raz — dwie kopie tych samych sześciu linii rozjeżdżały się przy pierwszej
// zmianie zrobionej tylko w jednym miejscu.

interface PlanHeaderProps {
  title: string; // PL
  ctaText: string;
  ctaStyle: NonNullable<PricingCardProps['ctaStyle']>;
  variant: PricingCardVariant;
  currentPlanBadge?: string;
  unavailableReason?: string;
}

function planHeaderProps(
  plan: PlanCatalogEntryDto,
  billingCycle: BillingCycle,
  authContext?: AuthContext,
): PlanHeaderProps {
  const { variant, currentPlanBadge, unavailableReason } = deriveVariant(plan, billingCycle, authContext);
  return {
    title: PLAN_NAME_PL[plan.planName] ?? plan.planName,
    // `||`, nie `??` — katalog potrafi przysłać `ctaLabel: ""` (pusty string nie jest
    // nullish, więc `??` przepuściłby go dalej i przycisk wyrenderowałby się bez tekstu).
    // Pusta etykieta jest dla klienta gorsza niż etykieta zastępcza.
    ctaText: plan.ctaLabel || plan.features.ctaLabel || 'Wybierz plan',
    ctaStyle: ctaStyleFor(plan),
    variant,
    currentPlanBadge,
    unavailableReason,
  };
}

// ── Card projection (mini-karta na /cennik) ────────────────────────────

/**
 * Karta to zajawka, nie kopia siatki: wymienia nagłówki sekcji, a pod spodem
 * tylko te wartości, którymi pakiet się różni. Reszta jest w siatce niżej.
 *
 * Puste podlinie dobijają sekcję do długości najbogatszego pakietu, żeby
 * nagłówki sekcji stały w jednej linii we wszystkich czterech kartach.
 */
function buildCardSections(plan: PlanCatalogEntryDto, allPlans: PlanCatalogEntryDto[]): CardSectionProps[] {
  const allFeatures = allPlans.map(p => p.features);

  const subLinesFor = (def: ComparisonSectionDef, features: FeatureMap): string[] =>
    def.rows
      .filter(r => r.cardSummary && isRowKnown(r, allFeatures))
      .map(r => {
        const cell = resolveCell(r, features);
        return cell.kind === 'present' && cell.display !== true
          ? r.cardSummary!(String(cell.display))
          : null;
      })
      .filter((x): x is string => x !== null);

  const maxLines = COMPARISON.map(def =>
    Math.max(...allFeatures.map(f => subLinesFor(def, f).length), 0));

  return COMPARISON
    .map((def, i): CardSectionProps | null => {
      const visible = def.rows.filter(r => isRowKnown(r, allFeatures));
      if (visible.length === 0) return null;
      const lines = subLinesFor(def, plan.features);
      return {
        title: def.title,
        icon: def.icon,
        subtitle: def.subtitle,
        badge: def.badge,
        included: visible.some(r => resolveCell(r, plan.features).kind === 'present'),
        // '' renderuje się jako pusta linia wyrównująca (aria-hidden)
        subLines: [...lines, ...Array(Math.max(maxLines[i] - lines.length, 0)).fill('')],
      };
    })
    .filter((s): s is CardSectionProps => s !== null);
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * To, co karta dostaje z projekcji: `PricingCardProps` plus `priceMinorUnits`.
 * Pole jest tu wymagane (projekcja zawsze je liczy) i zadeklarowane obok, żeby kontrakt
 * obowiązywał niezależnie od tego, czy komponent zdążył już dopisać je do swoich propsów.
 */
export type PricingCardData = PricingCardProps & { priceMinorUnits: number };

/**
 * `allPlans` to cały katalog, nie ten jeden plan — i dlatego jest WYMAGANY, bez wartości
 * domyślnej. Reguła widoczności („klucza nie ma u nikogo → wiersz znika; jest u kogoś,
 * brak u tego planu → wyszarzenie") da się policzyć tylko znając wszystkie plany.
 * Domyślka `[plan]` po cichu zamieniała wyszarzenie w zniknięcie i zerowała dobijanie
 * pustymi podliniami, więc nagłówki sekcji rozjeżdżały się między kartami — a ani typ,
 * ani test tego nie łapał. Katalog jednoplanowy nadal wolno podać, ale trzeba go napisać.
 *
 * `authContext` stoi przed nim i jest opcjonalny semantycznie (tryb anonimowy → `undefined`),
 * ale pozycyjnie musi być podany — TS nie pozwala na wymagany parametr po opcjonalnym.
 */
export function planToCardProps(
  plan: PlanCatalogEntryDto,
  billingCycle: BillingCycle,
  authContext: AuthContext | undefined,
  allPlans: PlanCatalogEntryDto[],
): PricingCardData {
  const features = buildCardSections(plan, allPlans);

  const pricing = derivePricing(plan, billingCycle);

  return {
    ...planHeaderProps(plan, billingCycle, authContext),
    description: plan.description,
    highlighted: plan.recommended,
    features,
    ...pricing,
  };
}

// ── Grid projection (pełna siatka porównania) ──────────────────────────

export interface ComparisonRowProps {
  label: string;
  explanation?: string;
  subItem?: boolean;
  emphasize?: boolean;
  cells: CellState[]; // w kolejności planów
}

export interface ComparisonSectionProps {
  title: string;
  subtitle?: string;
  icon: SectionIconName;
  badge?: string;
  footnote?: string;
  rows: ComparisonRowProps[];
}

export interface ComparisonPlanProps {
  code: string;
  title: string; // PL
  recommended: boolean;
  reason: string; // plan.description → „Dlaczego ten pakiet?"
  ctaText: string;
  ctaStyle: PricingCardProps['ctaStyle'];
  variant: PricingCardVariant;
  /** Rozpakowane `derivePricing` — mini-karta pokazuje cenę tak samo jak duża. */
  price: string;
  /** `price` w groszach — dla animacji ceny, bez parsowania sformatowanego tekstu. */
  priceMinorUnits: number;
  originalPrice?: string;
  hasDiscount?: boolean;
  /** Cena sprzed promocji okresowej (np. „354 zł") — mini-karta pokazuje ją przekreśloną. */
  promoHeader?: string;
  /** Czas trwania promocji (np. „przez 3 miesiące") — bez tego „0 zł" myli co do ceny. */
  promoSubtext?: string;
  currentPlanBadge?: string;
  unavailableReason?: string;
}

export interface ComparisonGridProps {
  plans: ComparisonPlanProps[];
  sections: ComparisonSectionProps[];
}

export function buildComparisonGrid(
  plans: PlanCatalogEntryDto[],
  billingCycle: BillingCycle,
  authContext?: AuthContext,
): ComparisonGridProps {
  const allFeatures = plans.map(p => p.features);

  const sections = COMPARISON.map(def => ({
    title: def.title,
    subtitle: def.subtitle,
    icon: def.icon,
    badge: def.badge,
    footnote: def.footnote,
    rows: def.rows
      // Reguła widoczności: katalog nie zna wiersza → nie pokazujemy go nikomu.
      .filter(row => isRowKnown(row, allFeatures))
      .map(row => ({
        label: row.label,
        explanation: row.explanation,
        subItem: row.subItem,
        emphasize: row.emphasize,
        cells: plans.map(p => resolveCell(row, p.features)),
      })),
  })).filter(s => s.rows.length > 0);

  return {
    plans: plans.map(plan => {
      const pricing = derivePricing(plan, billingCycle);
      return {
        ...planHeaderProps(plan, billingCycle, authContext),
        code: plan.code,
        recommended: plan.recommended,
        reason: plan.description,
        price: pricing.price,
        priceMinorUnits: pricing.priceMinorUnits,
        originalPrice: pricing.originalPrice,
        hasDiscount: pricing.hasDiscount,
        promoHeader: pricing.promoHeader,
        promoSubtext: pricing.promoSubtext,
      };
    }),
    sections,
  };
}
