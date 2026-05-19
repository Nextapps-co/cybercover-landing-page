import type {
  DiscountPreviewDto,
  PlanCatalogEntryDto,
  PlanCatalogResponseDto,
  RelativeToCurrent,
} from '../types/catalog';
import { getMockAuthContext } from '../../auth/mock-auth';

// Mock catalog adapted to backend contract documented in
// `docs/pricing-catalog-changes.md`:
// - § 4.1 — granular `feature.*` keys
// - § 4.2 — `tier` field on plan
// - § 4.4 — `partnerName`, `partnerLogoUrl` in DiscountPreviewDto
// - § 4.5 — `ctaLabel` as top-level field
// - § 4.6 (Option B) — `planName` in English; frontend maps to PL via render-policy
//
// Per spec §5.9.1 — gdy mock auth context istnieje (sessionStorage[cybercover:mock-auth-context]),
// mock injectuje auth-aware fields: `relativeToCurrent` per plan, `currentPlanCode`, `subscriptionStatus`.

const MOCK_PLANS: PlanCatalogEntryDto[] = [
  {
    catalogEntryId: 'CATALOG-mock-standard',
    planId: 'mock-plan-standard',
    code: 'standard',
    planName: 'Standard',
    description: 'Podstawowa ochrona dla małych firm. Otrzymasz kompleksową ocenę bezpieczeństwa i monitoring zagrożeń, które chronią Twoją firmę przed cyberatakami.',
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
  },
  {
    catalogEntryId: 'CATALOG-mock-optimum',
    planId: 'mock-plan-optimum',
    code: 'optimum',
    planName: 'Optimum',
    description: 'Kompletna ochrona z pomocą 24/7 i ubezpieczeniem. Idealne rozwiązanie dla firm, które chcą mieć pewność wsparcia w razie incydentu i pełny pakiet zabezpieczeń.',
    displayOrder: 2,
    recommended: true,
    tier: 'mid',
    ctaLabel: 'Wybierz Optimum',
    annualPrice: { amount: 49500, currency: 'PLN' },
    monthlyPrice: { amount: 59400, currency: 'PLN' },
    features: {
      'feature.securityAssessment.legal': 'true',
      'feature.securityAssessment.technical': 'true',
      'feature.securityAssessment.people': 'true',
      'feature.securityAssessment.report': 'detailed',
      'feature.monitoring.email': 'true',
      'feature.monitoring.web': 'true',
      'feature.consultation.timesPerYear': '10',
      'feature.incidentResponse': 'true',
      'feature.insurance.coverageAmount': '1000000',
      'feature.insurance.deductible': '5000',
      'feature.insurance.includesThirdPartyClaims': 'true',
      'feature.insurance.includesAdminProceedings': 'true',
      'feature.insurance.includesGdprFines': 'true',
      'feature.insurance.includesRansomCosts': 'true',
    },
    discount: null,
  },
  {
    catalogEntryId: 'CATALOG-mock-professional',
    planId: 'mock-plan-professional',
    code: 'professional',
    planName: 'Professional',
    description: 'Zaawansowana ochrona z szkoleniami zespołu i wyższym ubezpieczeniem. Dla firm stawiających na proaktywne bezpieczeństwo i edukację pracowników w zakresie cyberzagrożeń.',
    displayOrder: 3,
    recommended: false,
    tier: 'high',
    ctaLabel: 'Zyskaj pełną ochronę',
    annualPrice: { amount: 89500, currency: 'PLN' },
    monthlyPrice: { amount: 107400, currency: 'PLN' },
    features: {
      'feature.securityAssessment.legal': 'true',
      'feature.securityAssessment.technical': 'true',
      'feature.securityAssessment.people': 'true',
      'feature.securityAssessment.report': 'detailed',
      'feature.monitoring.email': 'true',
      'feature.monitoring.web': 'true',
      'feature.consultation.timesPerYear': '20',
      'feature.incidentResponse': 'true',
      'feature.insurance.coverageAmount': '2500000',
      'feature.insurance.deductible': '0',
      'feature.insurance.includesThirdPartyClaims': 'true',
      'feature.insurance.includesAdminProceedings': 'true',
      'feature.insurance.includesGdprFines': 'true',
      'feature.insurance.includesRansomCosts': 'true',
      'feature.insurance.includesLostProfit': 'true',
      'feature.training.online.timesPerYear': '2',
    },
    discount: null,
  },
  {
    catalogEntryId: 'CATALOG-mock-expert',
    planId: 'mock-plan-expert',
    code: 'expert',
    planName: 'Expert',
    description: 'Maksymalna ochrona z dedykowanym wsparciem dla zarządu. Kompleksowe rozwiązanie dla dużych organizacji wymagających najwyższego poziomu bezpieczeństwa i szkoleń na każdym poziomie.',
    displayOrder: 4,
    recommended: false,
    tier: 'top',
    ctaLabel: 'Uzyskaj najwyższy pakiet',
    annualPrice: { amount: 159500, currency: 'PLN' },
    monthlyPrice: { amount: 191400, currency: 'PLN' },
    features: {
      'feature.securityAssessment.legal': 'true',
      'feature.securityAssessment.technical': 'true',
      'feature.securityAssessment.people': 'true',
      'feature.securityAssessment.report': 'detailed',
      'feature.monitoring.email': 'true',
      'feature.monitoring.web': 'true',
      'feature.consultation.timesPerYear': 'unlimited',
      'feature.incidentResponse': 'true',
      'feature.insurance.coverageAmount': '5000000',
      'feature.insurance.deductible': '0',
      'feature.insurance.includesThirdPartyClaims': 'true',
      'feature.insurance.includesAdminProceedings': 'true',
      'feature.insurance.includesGdprFines': 'true',
      'feature.insurance.includesRansomCosts': 'true',
      'feature.insurance.includesLostProfit': 'true',
      'feature.training.online.timesPerYear': '2',
      'feature.multiUser.accountSwitching': 'true',
      'feature.multiUser.partnerDataView': 'true',
    },
    discount: null,
  },
];

interface DiscountConfig {
  code: string;
  description: string;
  kind: DiscountPreviewDto['kind'];
  percent: number; // 0..1
  promotionalDuration?: DiscountPreviewDto['promotionalDuration'];
  partnerName?: string;
  partnerLogoUrl?: string;
}

function buildPercentageDiscount(
  plan: PlanCatalogEntryDto,
  config: DiscountConfig,
): DiscountPreviewDto {
  const annualAfter = Math.round(plan.annualPrice.amount * (1 - config.percent));
  const monthlyAfter = Math.round(plan.monthlyPrice.amount * (1 - config.percent));
  return {
    code: config.code,
    description: config.description,
    kind: config.kind,
    eligible: true,
    annualPriceAfterDiscount: { amount: annualAfter, currency: 'PLN' },
    monthlyPriceAfterDiscount: { amount: monthlyAfter, currency: 'PLN' },
    annualDiscountAmount: { amount: plan.annualPrice.amount - annualAfter, currency: 'PLN' },
    monthlyDiscountAmount: { amount: plan.monthlyPrice.amount - monthlyAfter, currency: 'PLN' },
    promotionalDuration: config.promotionalDuration ?? null,
    partnerName: config.partnerName ?? null,
    partnerLogoUrl: config.partnerLogoUrl ?? null,
  };
}

function buildMockDiscount(code: string, plan: PlanCatalogEntryDto): DiscountPreviewDto | null {
  switch (code) {
    case 'SUMMER10':
      return buildPercentageDiscount(plan, {
        code: 'SUMMER10',
        description: 'Seasonal discount code',
        kind: 'CODE_FLAT',
        percent: 0.1,
      });
    case 'VALVETECH':
      return buildPercentageDiscount(plan, {
        code: 'VALVETECH',
        description: 'Rabat 5% na wszystkie plany od ValveTech',
        kind: 'PARTNER_FLAT',
        percent: 0.05,
        partnerName: 'ValveTech',
        partnerLogoUrl: '/img/partners/valvetech.svg',
      });
    case 'COMPOSITE_DEMO':
      return buildPercentageDiscount(plan, {
        code: 'COMPOSITE_DEMO',
        description: 'Rabat 100% na Standard na 3 miesiące + 10% na pozostałe plany od ValveTech',
        kind: 'PARTNER_COMPOSITE',
        percent: plan.code === 'standard' ? 1 : 0.1,
        partnerName: 'ValveTech',
        partnerLogoUrl: '/img/partners/valvetech.svg',
      });
    case 'TIMEBOUND_DEMO':
      if (plan.code !== 'standard') return null; // non-target shortcircuit
      return buildPercentageDiscount(plan, {
        code: 'TIMEBOUND_DEMO',
        description: 'Rabat 100% na Standard na 3 miesiące od ValveTech',
        kind: 'PARTNER_TIMEBOUND',
        percent: 1,
        promotionalDuration: { months: 3, applicableBillingCycle: 'MONTHLY' },
        partnerName: 'ValveTech',
        partnerLogoUrl: '/img/partners/valvetech.svg',
      });
    default:
      return null;
  }
}

// Resolves which discount code to apply, preferring partnerCode over discountCode
// per `docs/pricing-catalog-changes.md` § 4.3 ("partnerCode has priority").
function resolveActiveCode(discountCode?: string, partnerCode?: string): string | null {
  const partner = partnerCode?.trim().toUpperCase();
  if (partner) return partner;
  const discount = discountCode?.trim().toUpperCase();
  return discount && discount.length > 0 ? discount : null;
}

export async function getMockPlans(
  discountCode?: string,
  partnerCode?: string,
): Promise<PlanCatalogResponseDto> {
  const plans = MOCK_PLANS.map((p) => ({
    ...p,
    features: { ...p.features },
    discount: null as DiscountPreviewDto | null,
  }));
  const code = resolveActiveCode(discountCode, partnerCode);
  const withDiscount = code
    ? plans.map((plan) => ({ ...plan, discount: buildMockDiscount(code, plan) }))
    : plans;

  // Per spec §5.9.1 — auth-aware injection gdy mock context istnieje.
  const authContext = getMockAuthContext();
  if (!authContext) {
    return { plans: withDiscount };
  }

  const currentPlan = withDiscount.find((p) => p.code === authContext.planCode);
  if (!currentPlan) {
    // Brak match'u — fall through na anonymous shape (per BE spec §3.5).
    return { plans: withDiscount };
  }

  const minDisplayOrder =
    authContext.status === 'ACTIVE'
      ? currentPlan.displayOrder + 1 // strict upgrade — current plan grayed-out
      : currentPlan.displayOrder; // reactivation — same or higher klikalne

  // Mock zakłada że klient jest na cyklu MONTHLY (URL ?mockAuth= nie nosi tego pola).
  // Per-cycle relative replikuje real BE:
  //   - własny plan + bieżący cykl → CURRENT
  //   - własny plan + drugi cykl   → NOT_AVAILABLE (zmiana cyklu nie przez wizard)
  //   - wyższy plan → UPGRADE_AVAILABLE na obu cyklach
  //   - niższy plan → NOT_AVAILABLE na obu cyklach
  const currentCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY';

  const plansWithRelative: PlanCatalogEntryDto[] = withDiscount.map((plan) => {
    const baseRelative = (cycle: 'MONTHLY' | 'ANNUAL'): RelativeToCurrent => {
      if (plan.code === authContext.planCode) {
        return cycle === currentCycle ? 'CURRENT' : 'NOT_AVAILABLE';
      }
      return plan.displayOrder >= minDisplayOrder ? 'UPGRADE_AVAILABLE' : 'NOT_AVAILABLE';
    };
    return {
      ...plan,
      monthlyRelativeToCurrent: baseRelative('MONTHLY'),
      annualRelativeToCurrent: baseRelative('ANNUAL'),
    };
  });

  return {
    plans: plansWithRelative,
    currentPlanCode: authContext.planCode,
    subscriptionStatus: authContext.status,
    currentBillingCycle: currentCycle,
  };
}
