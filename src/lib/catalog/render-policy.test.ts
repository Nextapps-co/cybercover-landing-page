import { describe, it, expect } from 'vitest';
import { planToCardProps, buildComparisonGrid } from './render-policy';
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
  catalogEntryId: 'CE-2',
  planId: 'P-2',
  code: 'optimum',
  planName: 'Optimum',
  description: 'Kompletna ochrona z 24/7 wsparciem.',
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
};

// Katalog dwuplanowy — tryb, w którym /cennik faktycznie pracuje: `planToCardProps`
// dostaje WSZYSTKIE plany, więc widzi, co katalog w ogóle zna. Testy jednoplanowe
// niżej podają `[plan]` jawnie i dotyczą innego trybu (katalog zna tylko ten plan).
const CATALOG: PlanCatalogEntryDto[] = [STANDARD_PLAN, OPTIMUM_PLAN];

describe('planToCardProps — basic plan rendering', () => {
  it('Standard plan: title + ctaText + ctaStyle outline + not highlighted', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, CATALOG);
    expect(p.title).toBe('Standard');
    expect(p.ctaText).toBe('Rozpocznij ze Standard');
    expect(p.ctaStyle).toBe('outline');
    expect(p.highlighted).toBe(false);
  });

  it('Optimum plan: ctaStyle yellow, highlighted true (recommended)', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL', undefined, CATALOG);
    expect(p.title).toBe('Optimum');
    expect(p.ctaStyle).toBe('yellow');
    expect(p.highlighted).toBe(true);
  });

  it('Polish display name mapping: Professional → Profesjonalny', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Professional', tier: 'high' as const };
    expect(planToCardProps(plan, 'ANNUAL', undefined, [plan]).title).toBe('Profesjonalny');
  });

  it('Polish display name mapping: Expert → Ekspert', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Expert', tier: 'top' as const };
    expect(planToCardProps(plan, 'ANNUAL', undefined, [plan]).title).toBe('Ekspert');
  });

  it('falls through to backend planName when no PL mapping exists', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Premium' };
    expect(planToCardProps(plan, 'ANNUAL', undefined, [plan]).title).toBe('Premium');
  });

  it('uses ctaLabel top-level field; falls back to features.ctaLabel; final fallback "Wybierz plan"', () => {
    expect(planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, CATALOG).ctaText).toBe('Rozpocznij ze Standard');

    const fromFeatures = {
      ...STANDARD_PLAN,
      ctaLabel: undefined,
      features: { ...STANDARD_PLAN.features, ctaLabel: 'Z features' },
    };
    expect(planToCardProps(fromFeatures, 'ANNUAL', undefined, [fromFeatures]).ctaText).toBe('Z features');

    const noLabel = { ...STANDARD_PLAN, ctaLabel: undefined };
    expect(planToCardProps(noLabel, 'ANNUAL', undefined, [noLabel]).ctaText).toBe('Wybierz plan');
  });

  // Backend może dodać tier bez deploya frontu — `TIER_CTA_STYLE` go nie zna, a typ
  // `Record<PlanTier, …>` na runtimie tego nie gwarantuje. Bez fallbacku `ctaStyle`
  // wychodziło `undefined` i duża karta brała inny default niż pasek siatki.
  it('nieznany tier → ctaStyle spada na "outline", nie na undefined', () => {
    const ultra = { ...STANDARD_PLAN, tier: 'ultra' as unknown as PlanCatalogEntryDto['tier'] };
    expect(planToCardProps(ultra, 'ANNUAL', undefined, [ultra]).ctaStyle).toBe('outline');
    expect(buildComparisonGrid([ultra], 'ANNUAL').plans[0].ctaStyle).toBe('outline');
  });

  it('brak tiera → ctaStyle jak dla "entry"', () => {
    const bezTiera = { ...STANDARD_PLAN, tier: undefined as unknown as PlanCatalogEntryDto['tier'] };
    expect(planToCardProps(bezTiera, 'ANNUAL', undefined, [bezTiera]).ctaStyle).toBe('outline');
  });
});

// Sekcje przemianowane per spec § 5.2 ("Ocena bezpieczeństwa" → "Wskaźnik
// cyberbezpieczeństwa", "Monitoring zagrożeń" → "Monitoring osobisty" +
// "Monitoring strony"), a karta od Tasku 4 jest projekcją z COMPARISON:
// zamiast listy itemów ma `included` (ptaszek vs wyszarzenie) + `subLines`
// (tylko wiersze z `cardSummary`, dopełnione '' do długości najbogatszego
// planu). Testy poniżej nadążają za tą zmianą kontraktu, nie osłabiają jej —
// stary "highlight" per tier (żółty/niebieski/czerwony box) został usunięty
// w redesignie: emfaza teraz żyje jako **bold** wewnątrz samego `cardSummary`.
describe('planToCardProps — features mapping (COMPARISON-driven)', () => {
  it('Wskaźnik cyberbezpieczeństwa: included gdy plan ma dane, bez podlinii (brak cardSummary w tej sekcji)', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, CATALOG);
    const security = p.features.find(s => s.title === 'Wskaźnik cyberbezpieczeństwa');
    expect(security).toBeDefined();
    expect(security!.included).toBe(true);
    expect(security!.subLines).toEqual([]);
  });

  it('Wskaźnik cyberbezpieczeństwa: różnice zakresu (legal/technical vs +people, general vs detailed) nie wyciekają na kartę — żyją tylko w siatce', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL', undefined, CATALOG);
    const security = p.features.find(s => s.title === 'Wskaźnik cyberbezpieczeństwa')!;
    expect(security.included).toBe(true);
    expect(security.subLines).toEqual([]);
  });

  it('Konsultacje: podlinia pokazuje sformatowaną liczbę pogrubioną', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL', undefined, CATALOG);
    const consult = p.features.find(s => s.title === 'Konsultacje z ekspertami')!;
    expect(consult.subLines).toEqual(['**10x w roku**']);
  });

  it('Konsultacje "unlimited" → "**bez limitu**" w podlinii', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.consultation.timesPerYear': 'unlimited' },
    };
    const p = planToCardProps(expert, 'ANNUAL', undefined, [expert]);
    const consult = p.features.find(s => s.title === 'Konsultacje z ekspertami')!;
    expect(consult.subLines).toEqual(['**bez limitu**']);
  });

  it('insurance: coverage i deductible sformatowane z polskim grupowaniem w podliniach', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL', undefined, CATALOG);
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    expect(ins.subLines).toEqual(['do **1 000 000 zł**', 'udział własny **5 000 zł**']);
  });

  it('insurance: udział własny 0 zł renderuje się poprawnie', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.insurance.deductible': '0' },
    };
    const p = planToCardProps(expert, 'ANNUAL', undefined, [expert]);
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    expect(ins.subLines).toEqual(['do **1 000 000 zł**', 'udział własny **0 zł**']);
  });

  // Dwie różne reguły, dwa różne katalogi — dlatego oba testy, a nie jeden:
  //   1. klucza nie zna ŻADEN plan w katalogu → sekcja znika (tu: katalog = sam Standard),
  //   2. klucz zna inny plan, ten go nie ma → sekcja zostaje wyszarzona
  //      (patrz „sekcja, której plan nie ma, a inne mają — wyszarzona, nie usunięta").
  it('katalog złożony z samego Standardu: sekcji Ubezpieczenie nie zna nikt, więc znika', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, [STANDARD_PLAN]);
    expect(p.features.find(s => s.title === 'Ubezpieczenie')).toBeUndefined();
  });

  it('pełny katalog: Standard nie ma Ubezpieczenia, ale Optimum ma → sekcja zostaje wyszarzona', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, CATALOG);
    const ins = p.features.find(s => s.title === 'Ubezpieczenie');
    expect(ins).toBeDefined();
    expect(ins!.included).toBe(false);
    // Podlinie dobite pustymi do długości Optimum (suma + udział własny),
    // żeby nagłówki sekcji stały w jednej linii w obu kartach.
    expect(ins!.subLines).toEqual(['', '']);
  });

  it('Ubezpieczenie: wiersze bez cardSummary (np. utracony zysk) nie trafiają na kartę, nawet gdy plan je ma', () => {
    const withLostProfit: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      features: { ...OPTIMUM_PLAN.features, 'feature.insurance.includesLostProfit': 'true' },
    };
    const p = planToCardProps(withLostProfit, 'ANNUAL', undefined, [withLostProfit]);
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    expect(ins.subLines).toEqual(['do **1 000 000 zł**', 'udział własny **5 000 zł**']);
  });

  it('Wielodostęp renderuje się, gdy katalog zna maxUsers', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.multiUser.maxUsers': '50' },
    };
    const p = planToCardProps(expert, 'ANNUAL', undefined, [expert]);
    expect(p.features.find(s => s.title === 'Wielodostęp')).toBeDefined();
  });

  it('Wielodostęp: maxUsers "unlimited" pokazuje "bez limitu" w podlinii', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.multiUser.maxUsers': 'unlimited' },
    };
    const p = planToCardProps(expert, 'ANNUAL', undefined, [expert]);
    const mu = p.features.find(s => s.title === 'Wielodostęp')!;
    expect(mu.subLines).toEqual(['**bez limitu** użytkowników']);
  });
});

describe('planToCardProps — pricing', () => {
  it('Standard ANNUAL: 295 zł monthly, 3 540 zł netto/rok yearly, 708 zł savings', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, [STANDARD_PLAN]);
    expect(p.price).toBe('295 zł');
    expect(p.yearlyPrice).toBe('3 540 zł netto/rok');
    expect(p.savingsBadge).toBe('708 zł');
    expect(p.hasDiscount).toBeFalsy();
  });

  it('Standard MONTHLY: 354 zł monthly, no savings badge', () => {
    const p = planToCardProps(STANDARD_PLAN, 'MONTHLY', undefined, [STANDARD_PLAN]);
    expect(p.price).toBe('354 zł');
    expect(p.yearlyPrice).toBe('4 248 zł netto/rok');
    expect(p.savingsBadge).toBeUndefined();
  });

  it('partner flat 5% discount: strikethrough original + show after-discount', () => {
    const planWithDiscount: PlanCatalogEntryDto = {
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
    const p = planToCardProps(planWithDiscount, 'MONTHLY', undefined, [planWithDiscount]);
    expect(p.hasDiscount).toBe(true);
    expect(p.originalPrice).toBe('354 zł');
    expect(p.price).toBe('336,30 zł');
    expect(p.savingsBadge).toBeUndefined(); // savings badge hidden when discount applies
  });

  it('promotional duration on MONTHLY cycle: 0 zł + promo header + subtext "przez 3 miesiące"', () => {
    const planWithPromo: PlanCatalogEntryDto = {
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
    const p = planToCardProps(planWithPromo, 'MONTHLY', undefined, [planWithPromo]);
    expect(p.promoHeader).toBe('354 zł');
    expect(p.promoSubtext).toBe('przez 3 miesiące');
    expect(p.price).toBe('0 zł');
    expect(p.hasDiscount).toBe(true);
  });

  it('promo with months=1 → "przez 1 miesiąc"; months=5 → "przez 5 miesięcy"', () => {
    const make = (months: 1 | 5): PlanCatalogEntryDto => ({
      ...STANDARD_PLAN,
      discount: {
        code: 'X',
        description: '',
        kind: 'PARTNER_TIMEBOUND',
        eligible: true,
        annualPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        monthlyPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        annualDiscountAmount: { amount: 29500, currency: 'PLN' },
        monthlyDiscountAmount: { amount: 35400, currency: 'PLN' },
        promotionalDuration: { months, applicableBillingCycle: 'MONTHLY' },
        partnerName: null,
        partnerLogoUrl: null,
      },
    });
    const jeden = make(1);
    const piec = make(5);
    expect(planToCardProps(jeden, 'MONTHLY', undefined, [jeden]).promoSubtext).toBe('przez 1 miesiąc');
    expect(planToCardProps(piec, 'MONTHLY', undefined, [piec]).promoSubtext).toBe('przez 5 miesięcy');
  });

  it('promotional duration only applies on matching cycle (MONTHLY); ANNUAL → strikethrough not promo', () => {
    const promoMonthly: PlanCatalogEntryDto = {
      ...STANDARD_PLAN,
      discount: {
        code: 'TIMEBOUND_DEMO',
        description: 'Trial',
        kind: 'PARTNER_TIMEBOUND',
        eligible: true,
        annualPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        monthlyPriceAfterDiscount: { amount: 0, currency: 'PLN' },
        annualDiscountAmount: { amount: 29500, currency: 'PLN' },
        monthlyDiscountAmount: { amount: 35400, currency: 'PLN' },
        promotionalDuration: { months: 3, applicableBillingCycle: 'MONTHLY' },
        partnerName: null,
        partnerLogoUrl: null,
      },
    };
    // On ANNUAL cycle, promo doesn't apply for THIS cycle, so no promoHeader/Subtext
    const p = planToCardProps(promoMonthly, 'ANNUAL', undefined, [promoMonthly]);
    expect(p.promoHeader).toBeUndefined();
    expect(p.promoSubtext).toBeUndefined();
  });

  // `priceMinorUnits` istnieje po to, żeby konsument nie parsował z powrotem
  // sformatowanego tekstu — parsowanie „336,30 zł" gubiło grosze (336 zamiast 336,30).
  it('priceMinorUnits = ta sama kwota co `price`, w groszach (bez zniżki)', () => {
    expect(planToCardProps(STANDARD_PLAN, 'ANNUAL', undefined, [STANDARD_PLAN]).priceMinorUnits)
      .toBe(29500);
    expect(planToCardProps(STANDARD_PLAN, 'MONTHLY', undefined, [STANDARD_PLAN]).priceMinorUnits)
      .toBe(35400);
  });

  it('priceMinorUnits po zniżce trzyma grosze, których formatowany string nie oddaje liczbą', () => {
    const planWithDiscount: PlanCatalogEntryDto = {
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
        partnerLogoUrl: null,
      },
    };
    const p = planToCardProps(planWithDiscount, 'MONTHLY', undefined, [planWithDiscount]);
    expect(p.price).toBe('336,30 zł');
    expect(p.priceMinorUnits).toBe(33630);
  });

  it('priceMinorUnits w promocji okresowej to cena promocyjna (0), nie sprzed promocji', () => {
    const planWithPromo: PlanCatalogEntryDto = {
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
        partnerName: null,
        partnerLogoUrl: null,
      },
    };
    const p = planToCardProps(planWithPromo, 'MONTHLY', undefined, [planWithPromo]);
    expect(p.price).toBe('0 zł');
    expect(p.priceMinorUnits).toBe(0);
  });
});

describe('planToCardProps — auth-aware variant (per-cycle)', () => {
  it('returns variant=available when no relativeToCurrent fields (anonymous mode)', () => {
    const props = planToCardProps(OPTIMUM_PLAN, 'ANNUAL', undefined, [OPTIMUM_PLAN]);
    expect(props.variant).toBe('available');
    expect(props.currentPlanBadge).toBeUndefined();
    expect(props.unavailableReason).toBeUndefined();
  });

  it('returns variant=current with badge for CURRENT + ACTIVE on matching cycle (ANNUAL)', () => {
    const plan: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      annualRelativeToCurrent: 'CURRENT',
      monthlyRelativeToCurrent: 'NOT_AVAILABLE',
    };
    const props = planToCardProps(plan, 'ANNUAL', {
      currentPlanCode: 'optimum',
      subscriptionStatus: 'ACTIVE',
      currentBillingCycle: 'ANNUAL',
    }, [plan]);
    expect(props.variant).toBe('current');
    expect(props.currentPlanBadge).toBe('Twój aktualny plan');
  });

  it('CURRENT on monthly + viewing annual → reads annualRelativeToCurrent (NOT_AVAILABLE) and shows cycle reason', () => {
    const plan: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      monthlyRelativeToCurrent: 'CURRENT',
      annualRelativeToCurrent: 'NOT_AVAILABLE',
    };
    const props = planToCardProps(plan, 'ANNUAL', {
      currentPlanCode: 'optimum',
      subscriptionStatus: 'ACTIVE',
      currentBillingCycle: 'MONTHLY',
    }, [plan]);
    expect(props.variant).toBe('unavailable');
    expect(props.unavailableReason).toBe('Niedostępne na tym cyklu rozliczeniowym');
  });

  it.each(['GRACE_PERIOD', 'EXPIRED', 'CANCELLED'] as const)(
    'CURRENT + %s on matching cycle → variant=available with badge "Poprzedni plan"',
    (status) => {
      const plan: PlanCatalogEntryDto = { ...OPTIMUM_PLAN, annualRelativeToCurrent: 'CURRENT' };
      const props = planToCardProps(plan, 'ANNUAL', {
        currentPlanCode: 'optimum',
        subscriptionStatus: status,
        currentBillingCycle: 'ANNUAL',
      }, [plan]);
      expect(props.variant).toBe('available');
      expect(props.currentPlanBadge).toBe('Poprzedni plan');
    },
  );

  it('NOT_AVAILABLE on a different (lower) plan → reason "niższy niż aktualny plan"', () => {
    const plan: PlanCatalogEntryDto = {
      ...STANDARD_PLAN,
      annualRelativeToCurrent: 'NOT_AVAILABLE',
      monthlyRelativeToCurrent: 'NOT_AVAILABLE',
    };
    const props = planToCardProps(plan, 'ANNUAL', {
      currentPlanCode: 'optimum',
      subscriptionStatus: 'ACTIVE',
    }, [plan]);
    expect(props.variant).toBe('unavailable');
    expect(props.unavailableReason).toBe('Niedostępne — niższy niż aktualny plan');
  });

  it('UPGRADE_AVAILABLE → variant=available, no badge', () => {
    const plan: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      annualRelativeToCurrent: 'UPGRADE_AVAILABLE',
      monthlyRelativeToCurrent: 'UPGRADE_AVAILABLE',
    };
    const props = planToCardProps(plan, 'ANNUAL', {
      currentPlanCode: 'standard',
      subscriptionStatus: 'ACTIVE',
    }, [plan]);
    expect(props.variant).toBe('available');
    expect(props.currentPlanBadge).toBeUndefined();
    expect(props.unavailableReason).toBeUndefined();
  });

  it('reads cycle-specific field — same plan with different per-cycle values', () => {
    const plan: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      monthlyRelativeToCurrent: 'UPGRADE_AVAILABLE',
      annualRelativeToCurrent: 'CURRENT',
    };
    const onMonthly = planToCardProps(plan, 'MONTHLY', {
      currentPlanCode: 'optimum',
      subscriptionStatus: 'ACTIVE',
      currentBillingCycle: 'ANNUAL',
    }, [plan]);
    expect(onMonthly.variant).toBe('available');
    const onAnnual = planToCardProps(plan, 'ANNUAL', {
      currentPlanCode: 'optimum',
      subscriptionStatus: 'ACTIVE',
      currentBillingCycle: 'ANNUAL',
    }, [plan]);
    expect(onAnnual.variant).toBe('current');
  });
});

// ── Task 3: buildComparisonGrid — projekcja na siatkę porównania ──────────

const withFeatures = (plan: PlanCatalogEntryDto, features: Record<string, string>) =>
  ({ ...plan, features });

const findRow = (grid: ReturnType<typeof buildComparisonGrid>, label: string) =>
  grid.sections.flatMap(s => s.rows).find(r => r.label === label);

describe('planHeaderProps — odpornosc na puste pola z katalogu', () => {
  it('pusty ctaLabel nie daje przycisku bez tekstu — wchodzi etykieta zastepcza', () => {
    const pusty = { ...STANDARD_PLAN, ctaLabel: '', features: { ...STANDARD_PLAN.features, ctaLabel: '' } };
    expect(planToCardProps(pusty, 'ANNUAL', undefined, [pusty]).ctaText).toBe('Wybierz plan');
    expect(buildComparisonGrid([pusty], 'ANNUAL').plans[0].ctaText).toBe('Wybierz plan');
  });

  it('ctaLabel z katalogu wygrywa, gdy jest niepusty', () => {
    const zEtykieta = { ...STANDARD_PLAN, ctaLabel: 'Rozpocznij ze Standard' };
    expect(buildComparisonGrid([zEtykieta], 'ANNUAL').plans[0].ctaText).toBe('Rozpocznij ze Standard');
  });
});

describe('buildComparisonGrid — katalog jest źródłem prawdy', () => {
  it('podbicie maxUsers w API zmienia tekst bez zmiany kodu', () => {
    const plans = [withFeatures(STANDARD_PLAN, { 'feature.multiUser.maxUsers': '20' })];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Liczba dodatkowych użytkowników');
    expect(row!.cells[0]).toEqual({ kind: 'present', display: '20' });
  });

  it('dodanie Standardowi konsultacji odszarza komórkę', () => {
    const bez = [
      withFeatures(STANDARD_PLAN, {}),
      withFeatures(OPTIMUM_PLAN, { 'feature.consultation.timesPerYear': '10' }),
    ];
    expect(findRow(buildComparisonGrid(bez, 'ANNUAL'), 'Konsultacje')!.cells[0])
      .toEqual({ kind: 'absent' });

    const z = [
      withFeatures(STANDARD_PLAN, { 'feature.consultation.timesPerYear': '5' }),
      withFeatures(OPTIMUM_PLAN, { 'feature.consultation.timesPerYear': '10' }),
    ];
    expect(findRow(buildComparisonGrid(z, 'ANNUAL'), 'Konsultacje')!.cells[0])
      .toEqual({ kind: 'present', display: '5x w roku' });
  });

  it('usunięcie includesLostProfit z planu szarzy komórkę', () => {
    const plans = [
      withFeatures(STANDARD_PLAN, {}),
      withFeatures(OPTIMUM_PLAN, { 'feature.insurance.includesLostProfit': 'true' }),
    ];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Utracony zysk przy przerwie w działaniu');
    expect(row!.cells[0]).toEqual({ kind: 'absent' });
    expect(row!.cells[1]).toEqual({ kind: 'present', display: true });
  });

  it('wiersz nieznany katalogowi w ogóle się nie renderuje', () => {
    const plans = [withFeatures(STANDARD_PLAN, {}), withFeatures(OPTIMUM_PLAN, {})];
    expect(findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Koordynacja działań')).toBeUndefined();
  });

  it('sekcja bez widocznych wierszy znika razem z nagłówkiem', () => {
    const plans = [withFeatures(STANDARD_PLAN, {})];
    const titles = buildComparisonGrid(plans, 'ANNUAL').sections.map(s => s.title);
    expect(titles).not.toContain('E-learning o cyberbezpieczeństwie');
  });

  it('komórki są w kolejności planów', () => {
    const plans = [
      withFeatures(STANDARD_PLAN, { 'feature.multiUser.maxUsers': '10' }),
      withFeatures(OPTIMUM_PLAN, { 'feature.multiUser.maxUsers': '15' }),
    ];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Liczba dodatkowych użytkowników');
    expect(row!.cells.map(c => c.kind === 'present' ? c.display : null)).toEqual(['10', '15']);
  });

  it('„Dlaczego ten pakiet?" bierze opis wprost z katalogu', () => {
    const plans = [withFeatures(STANDARD_PLAN, {})];
    expect(buildComparisonGrid(plans, 'ANNUAL').plans[0].reason).toBe(STANDARD_PLAN.description);
  });

  it('zachowuje różnicę raportu: general → ogólne, detailed → szczegółowe', () => {
    const plans = [
      withFeatures(STANDARD_PLAN, { 'feature.securityAssessment.report': 'general' }),
      withFeatures(OPTIMUM_PLAN, { 'feature.securityAssessment.report': 'detailed' }),
    ];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Zalecenia i rekomendacje');
    expect(row!.cells.map(c => c.kind === 'present' ? c.display : null))
      .toEqual(['ogólne', 'szczegółowe']);
  });

  it('nieznany poziom raportu jedzie surowy, nie udaje „ogólnego"', () => {
    const plans = [withFeatures(STANDARD_PLAN, { 'feature.securityAssessment.report': 'basic' })];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Zalecenia i rekomendacje');
    expect(row!.cells[0]).toEqual({ kind: 'present', display: 'basic' });
  });

  // Regresja: wiersz wielokluczowy renderował się (bo `isRowKnown` widziało `.technical`),
  // ale wszystkie komórki wychodziły wyszarzone (bo `resolveCell` patrzyło tylko na `.legal`).
  it('„Zakres oceny": katalog bez .legal, ale z .technical → wiersz jest i komórki NIE są wyszarzone', () => {
    const plans = [
      withFeatures(STANDARD_PLAN, { 'feature.securityAssessment.technical': 'true' }),
      withFeatures(OPTIMUM_PLAN, {
        'feature.securityAssessment.technical': 'true',
        'feature.securityAssessment.people': 'true',
      }),
    ];
    const row = findRow(buildComparisonGrid(plans, 'ANNUAL'), 'Zakres oceny');
    expect(row).toBeDefined();
    expect(row!.cells.map(c => c.kind)).toEqual(['present', 'present']);
    expect(row!.cells[0]).toEqual({ kind: 'present', display: 'Technologia i sprzęt' });
    expect(row!.cells[1])
      .toEqual({ kind: 'present', display: 'Technologia i sprzęt\nLudzie i dostępy' });
  });
});

// ── Punkt 9: pola kontraktu dla mini-karty w przyklejonym pasku ────────────

describe('buildComparisonGrid — mini-karta dostaje ten sam obraz ceny co duża', () => {
  const promoPlan: PlanCatalogEntryDto = {
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
      partnerName: null,
      partnerLogoUrl: null,
    },
  };

  it('promocja okresowa: pasek niesie promoHeader + promoSubtext, nie samo „0 zł"', () => {
    const p = buildComparisonGrid([promoPlan], 'MONTHLY').plans[0];
    expect(p.price).toBe('0 zł');
    expect(p.promoHeader).toBe('354 zł');
    expect(p.promoSubtext).toBe('przez 3 miesiące');
    expect(p.hasDiscount).toBe(true);
  });

  it('brak promocji → promoHeader/promoSubtext puste', () => {
    const p = buildComparisonGrid([STANDARD_PLAN], 'ANNUAL').plans[0];
    expect(p.promoHeader).toBeUndefined();
    expect(p.promoSubtext).toBeUndefined();
  });

  it('priceMinorUnits w pasku = ta sama kwota co w dużej karcie', () => {
    const grid = buildComparisonGrid([STANDARD_PLAN], 'MONTHLY').plans[0];
    const card = planToCardProps(STANDARD_PLAN, 'MONTHLY', undefined, [STANDARD_PLAN]);
    expect(grid.priceMinorUnits).toBe(35400);
    expect(grid.priceMinorUnits).toBe(card.priceMinorUnits);
    expect(grid.price).toBe(card.price);
  });
});

// ── Task 4: planToCardProps na COMPARISON — testy z brief'u ───────────────

describe('planToCardProps — karta liczona z COMPARISON', () => {
  const EXPERT = { ...OPTIMUM_PLAN, planName: 'Expert', tier: 'top' as const, features: {
    'feature.consultation.timesPerYear': '25',
    'feature.insurance.coverageAmount': '10000000',
    'feature.insurance.deductible': '0',
    'feature.multiUser.maxUsers': '50',
  }};

  it('sekcja z wierszem planu ma ptaszek', () => {
    const s = planToCardProps(EXPERT, 'ANNUAL', undefined, [EXPERT]).features.find(x => x.title === 'Wielodostęp')!;
    expect(s.included).toBe(true);
  });

  it('podlinie powstają tylko z wierszy mających cardSummary', () => {
    const s = planToCardProps(EXPERT, 'ANNUAL', undefined, [EXPERT]).features.find(x => x.title === 'Ubezpieczenie')!;
    expect(s.subLines.filter(Boolean)).toEqual(['do **10 000 000 zł**', 'udział własny **0 zł**']);
  });

  it('wielodostęp pokazuje liczbę z katalogu, nie „bez limitu"', () => {
    const s = planToCardProps(EXPERT, 'ANNUAL', undefined, [EXPERT]).features.find(x => x.title === 'Wielodostęp')!;
    expect(s.subLines.filter(Boolean)).toEqual(['do **50** użytkowników']);
  });

  it('sekcja, której plan nie ma, a inne mają — wyszarzona, nie usunięta', () => {
    const bezKonsultacji = { ...EXPERT, features: { 'feature.multiUser.maxUsers': '10' } };
    // Czwarty argument mówi projekcji, co katalog w ogóle zna.
    const s = planToCardProps(bezKonsultacji, 'ANNUAL', undefined, [bezKonsultacji, EXPERT])
      .features.find(x => x.title === 'Konsultacje z ekspertami')!;
    expect(s.included).toBe(false);
  });

  it('podlinie wyrównują się do najbogatszego planu pustymi liniami', () => {
    const ubogi = { ...EXPERT, features: { 'feature.multiUser.maxUsers': '10' } };
    const s = planToCardProps(ubogi, 'ANNUAL', undefined, [ubogi, EXPERT])
      .features.find(x => x.title === 'Ubezpieczenie')!;
    // Ekspert ma 2 podlinie (suma + udział), ubogi nie ma żadnej → 2 puste.
    expect(s.subLines).toEqual(['', '']);
  });

  it('sekcja, której nie zna żaden plan, znika z karty', () => {
    const goly = { ...EXPERT, features: { 'feature.multiUser.maxUsers': '10' } };
    const titles = planToCardProps(goly, 'ANNUAL', undefined, [goly]).features.map(s => s.title);
    expect(titles).not.toContain('Natychmiastowa pomoc 24h w razie incydentu cyberbezpieczeństwa');
  });
});
