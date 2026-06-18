// Model 3 — single source of truth for mapping backend's semantic
// PlanCatalogEntryDto into the rich PricingCardProps consumed by the UI.
//
// Backend owns: WHAT (which plans, semantic feature.* keys, prices, discounts)
// Frontend owns: HOW (icons, highlight colors per tier, sentence templates,
//                spacers for layout, plan name translation)
//
// To add/modify what's shown on a card: edit the SECTIONS array below.
// To add a new tier or feature key: extend the contract documented in
// `docs/pricing-catalog-changes.md` and update SECTIONS to read it.

import type { PlanCatalogEntryDto, FeatureMap, PlanTier, SubscriptionStatus } from '../api/types/catalog';
import type { BillingCycle, MoneyDto } from '../api/types/money';
import type { PricingCardProps, PricingCardVariant, FeatureSection, FeatureItem } from '../../components/pricing/PricingCard';
import { formatMinorUnits } from '../format/money';

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

// Per-tier emphasis color for "highlighted" feature items
const TIER_HIGHLIGHT: Record<PlanTier, FeatureItem['highlight'] | null> = {
  entry: null,
  mid: 'blue',
  high: 'yellow',
  top: 'red',
};

// CTA button style per tier
const TIER_CTA_STYLE: Record<PlanTier, NonNullable<PricingCardProps['ctaStyle']>> = {
  entry: 'outline',
  mid: 'yellow',
  high: 'outline',
  top: 'outline',
};

// Polish display name. Backend returns English (per pricing-catalog-changes § 4.6 Option B).
// To add a new plan: just add its English name as a key here. Falls through to backend value if not mapped.
const PLAN_NAME_PL: Record<string, string> = {
  Standard: 'Standard',
  Optimum: 'Optimum',
  Professional: 'Profesjonalny',
  Expert: 'Ekspert',
};

// ── Section / item definitions (data-driven from feature.* keys) ────

interface ItemDef {
  // Show this item only when the predicate returns true for the plan's features
  visibleWhen?: (f: FeatureMap) => boolean;
  // Static text or a function that builds text from feature values
  text: string | ((f: FeatureMap) => string);
  // If true, this item gets the tier's highlight color (yellow/blue/red)
  emphasize?: boolean;
  // Render as a 20px vertical spacer (text and emphasize are ignored)
  spacer?: boolean;
  // Spacer/item is only shown for these tiers (used for vertical alignment of cards)
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
      // Spacer just for entry tier so card heights line up with mid-tier (which has +1 line for "Świadomi ludzie")
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
        text: f => `do wysokości: **${formatPLNAmount(f['feature.insurance.coverageAmount'])} zł**`,
        emphasize: true,
      },
      {
        visibleWhen: f => f['feature.insurance.deductible'] !== undefined,
        text: f => `udział własny: **${formatPLNAmount(f['feature.insurance.deductible'])} zł**`,
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
    title: 'Szkolenia z cyberbezpieczeństwa',
    icon: 'education',
    items: [
      {
        visibleWhen: f => Boolean(f['feature.training.online.timesPerYear']),
        text: f => `On-line ${f['feature.training.online.timesPerYear']}x w roku`,
        emphasize: true,
      },
      // Tylko Ekspert (tier 'top') — front-only, nie sterowane feature.* z API
      { onlyIfTier: ['top'], text: 'Dedykowane szkolenie dla VIP/Zarządów', emphasize: true },
    ],
  },
  {
    title: 'Wielodostęp',
    icon: 'users',
    items: [
      { visibleWhen: f => f['feature.multiUser.accountSwitching'] === 'true', text: 'Nielimitowane dodawanie wielu kont użytkowników do konta głównego' },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

// Backend convention from pricing-catalog-changes § 4.1: insurance amounts are in
// PLN integers (e.g. "1000000" = 1 000 000 zł), NOT grosze. Format with PL grouping.
function formatPLNAmount(value: string | undefined): string {
  if (!value) return '0';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat('pl-PL', { useGrouping: true })
    .format(n)
    // Normalize NBSP (U+00A0) / narrow NBSP (U+202F) that Intl injects between groups
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

// Polish month plural for promotional duration ("3 miesiące", "1 miesiąc", "5 miesięcy")
function monthsLabel(n: number): string {
  if (n === 1) return 'miesiąc';
  if (n >= 2 && n <= 4) return 'miesiące';
  return 'miesięcy';
}

// Format a yearly total ("3 540 zł netto/rok") from a monthly rate in grosze
function formatYearlyTotal(monthlyMinorUnits: number): string {
  const yearlyMajor = (monthlyMinorUnits * 12) / 100;
  const formatted = new Intl.NumberFormat('pl-PL', { useGrouping: true })
    .format(Math.round(yearlyMajor))
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
  return `${formatted} zł netto/rok`;
}

function buildSection(
  def: SectionDef,
  plan: PlanCatalogEntryDto,
  tier: PlanTier,
  highlight: FeatureItem['highlight'] | null,
): FeatureSection {
  const items: FeatureItem[] = def.items
    .filter(item => {
      if (item.spacer) return !item.onlyIfTier || item.onlyIfTier.includes(tier);
      if (item.onlyIfTier && !item.onlyIfTier.includes(tier)) return false;
      return item.visibleWhen ? item.visibleWhen(plan.features) : true;
    })
    .map<FeatureItem>(item => {
      if (item.spacer) return { text: '', spacer: true };
      const text = typeof item.text === 'function' ? item.text(plan.features) : item.text;
      const out: FeatureItem = { text };
      if (item.emphasize && highlight) out.highlight = highlight;
      return out;
    });

  return { title: def.title, icon: def.icon, items };
}

interface PricingDisplayProps {
  price: string;
  yearlyPrice?: string;
  originalPrice?: string;
  originalYearlyPrice?: string;
  hasDiscount?: boolean;
  promoHeader?: string;
  promoSubtext?: string;
  savingsBadge?: string;
}

function derivePricing(plan: PlanCatalogEntryDto, billingCycle: BillingCycle): PricingDisplayProps {
  const monthlyOriginal = plan.monthlyPrice;
  const annualOriginal = plan.annualPrice;
  const discount = plan.discount;

  // Choose the rate to display based on billing cycle (price label is always per-month)
  const baseRate: MoneyDto = billingCycle === 'MONTHLY' ? monthlyOriginal : annualOriginal;

  // Discount has a promotional duration that only applies to a specific cycle?
  const isPromoOnlyForCycle =
    discount?.eligible &&
    discount.promotionalDuration?.applicableBillingCycle === billingCycle;

  // After-discount monthly amount for the selected cycle (when applicable)
  const afterDiscountMonthly: MoneyDto | null =
    discount?.eligible
      ? billingCycle === 'MONTHLY'
        ? discount.monthlyPriceAfterDiscount
        : discount.annualPriceAfterDiscount
      : null;

  // Standard discount path: strikethrough original + show after-discount (no promo period)
  if (discount?.eligible && afterDiscountMonthly && !discount.promotionalDuration) {
    return {
      price: formatMinorUnits(afterDiscountMonthly.amount, afterDiscountMonthly.currency),
      yearlyPrice: formatYearlyTotal(afterDiscountMonthly.amount),
      originalPrice: formatMinorUnits(baseRate.amount, baseRate.currency),
      originalYearlyPrice: formatYearlyTotal(baseRate.amount),
      hasDiscount: true,
    };
  }

  // Promotional period path (e.g. "0 zł przez 3 miesiące" — TIMEBOUND on monthly cycle)
  if (isPromoOnlyForCycle && discount?.promotionalDuration && afterDiscountMonthly) {
    const months = discount.promotionalDuration.months;
    return {
      price: formatMinorUnits(afterDiscountMonthly.amount, afterDiscountMonthly.currency),
      promoHeader: formatMinorUnits(baseRate.amount, baseRate.currency),
      promoSubtext: `przez ${months} ${monthsLabel(months)}`,
      hasDiscount: true,
      // Keep yearlyPrice line (showing original) so card heights stay aligned across plans
      yearlyPrice: formatYearlyTotal(baseRate.amount),
    };
  }

  // No discount applicable for this billing cycle — show plain price + savings badge if applicable
  let savingsBadge: string | undefined;
  if (!discount?.eligible && billingCycle === 'ANNUAL') {
    // Show how much the user saves vs paying monthly: (monthly - annual) * 12
    const savingsGrosze = (monthlyOriginal.amount - annualOriginal.amount) * 12;
    if (savingsGrosze > 0) {
      const savingsZL = Math.round(savingsGrosze / 100);
      const formatted = new Intl.NumberFormat('pl-PL', { useGrouping: true })
        .format(savingsZL)
        .replace(/ /g, ' ')
        .replace(/ /g, ' ');
      savingsBadge = `${formatted} zł`;
    }
  }

  return {
    price: formatMinorUnits(baseRate.amount, baseRate.currency),
    yearlyPrice: formatYearlyTotal(baseRate.amount),
    savingsBadge,
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function planToCardProps(
  plan: PlanCatalogEntryDto,
  billingCycle: BillingCycle,
  authContext?: AuthContext,
): PricingCardProps {
  const tier: PlanTier = plan.tier ?? 'entry';
  const highlight = TIER_HIGHLIGHT[tier];

  const features = SECTIONS
    .map(s => buildSection(s, plan, tier, highlight))
    .filter(s => s.items.length > 0);

  const pricing = derivePricing(plan, billingCycle);
  const { variant, currentPlanBadge, unavailableReason } = deriveVariant(plan, billingCycle, authContext);

  return {
    title: PLAN_NAME_PL[plan.planName] ?? plan.planName,
    description: plan.description,
    ctaText: plan.ctaLabel ?? plan.features.ctaLabel ?? 'Wybierz plan',
    ctaStyle: TIER_CTA_STYLE[tier],
    highlighted: plan.recommended,
    features,
    variant,
    currentPlanBadge,
    unavailableReason,
    ...pricing,
  };
}
