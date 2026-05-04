import { describe, it, expect } from 'vitest';
import { planToCardProps } from './render-policy';
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

describe('planToCardProps — basic plan rendering', () => {
  it('Standard plan: title + ctaText + ctaStyle outline + not highlighted', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL');
    expect(p.title).toBe('Standard');
    expect(p.ctaText).toBe('Rozpocznij ze Standard');
    expect(p.ctaStyle).toBe('outline');
    expect(p.highlighted).toBe(false);
  });

  it('Optimum plan: ctaStyle yellow, highlighted true (recommended)', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL');
    expect(p.title).toBe('Optimum');
    expect(p.ctaStyle).toBe('yellow');
    expect(p.highlighted).toBe(true);
  });

  it('Polish display name mapping: Professional → Profesjonalny', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Professional', tier: 'high' as const };
    expect(planToCardProps(plan, 'ANNUAL').title).toBe('Profesjonalny');
  });

  it('Polish display name mapping: Expert → Ekspert', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Expert', tier: 'top' as const };
    expect(planToCardProps(plan, 'ANNUAL').title).toBe('Ekspert');
  });

  it('falls through to backend planName when no PL mapping exists', () => {
    const plan = { ...OPTIMUM_PLAN, planName: 'Premium' };
    expect(planToCardProps(plan, 'ANNUAL').title).toBe('Premium');
  });

  it('uses ctaLabel top-level field; falls back to features.ctaLabel; final fallback "Wybierz plan"', () => {
    expect(planToCardProps(STANDARD_PLAN, 'ANNUAL').ctaText).toBe('Rozpocznij ze Standard');

    const fromFeatures = {
      ...STANDARD_PLAN,
      ctaLabel: undefined,
      features: { ...STANDARD_PLAN.features, ctaLabel: 'Z features' },
    };
    expect(planToCardProps(fromFeatures, 'ANNUAL').ctaText).toBe('Z features');

    const noLabel = { ...STANDARD_PLAN, ctaLabel: undefined };
    expect(planToCardProps(noLabel, 'ANNUAL').ctaText).toBe('Wybierz plan');
  });
});

describe('planToCardProps — features mapping', () => {
  it('Standard renders securityAssessment items (legal, technical, general report) and a spacer', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL');
    const security = p.features.find(s => s.title === 'Ocena bezpieczeństwa');
    expect(security).toBeDefined();
    const texts = security!.items.filter(i => !i.spacer).map(i => i.text);
    expect(texts).toContain('Zgodność z prawem');
    expect(texts).toContain('Odporność techniczna');
    expect(texts).toContain('Raport ogólny');
    expect(security!.items.some(i => i.spacer)).toBe(true);
  });

  it('Optimum renders detailed report (not general) + people, no spacer', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL');
    const security = p.features.find(s => s.title === 'Ocena bezpieczeństwa')!;
    const texts = security.items.filter(i => !i.spacer).map(i => i.text);
    expect(texts).toContain('Świadomi ludzie');
    expect(texts).toContain('Szczegółowe zalecenia i wytyczne');
    expect(texts).not.toContain('Raport ogólny');
    expect(security.items.some(i => i.spacer)).toBe(false);
  });

  it('consultation: number gets "**Nx w roku**" with blue highlight on mid tier', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL');
    const consult = p.features.find(s => s.title === 'Konsultacje z ekspertami')!;
    expect(consult.items[0].text).toBe('**10x w roku**');
    expect(consult.items[0].highlight).toBe('blue');
  });

  it('consultation "unlimited" → "**bez limitu**" with red highlight on top tier', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.consultation.timesPerYear': 'unlimited' },
    };
    const p = planToCardProps(expert, 'ANNUAL');
    const consult = p.features.find(s => s.title === 'Konsultacje z ekspertami')!;
    expect(consult.items[0].text).toBe('**bez limitu**');
    expect(consult.items[0].highlight).toBe('red');
  });

  it('consultation: yellow highlight on high tier', () => {
    const pro: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Professional',
      tier: 'high',
      features: { ...OPTIMUM_PLAN.features, 'feature.consultation.timesPerYear': '20' },
    };
    const p = planToCardProps(pro, 'ANNUAL');
    const consult = p.features.find(s => s.title === 'Konsultacje z ekspertami')!;
    expect(consult.items[0].text).toBe('**20x w roku**');
    expect(consult.items[0].highlight).toBe('yellow');
  });

  it('insurance: coverage and deductible formatted with PL grouping and emphasized', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL');
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    const coverage = ins.items.find(i => i.text.includes('1 000 000'));
    expect(coverage).toBeDefined();
    expect(coverage!.text).toBe('do wysokości: **1 000 000 zł**');
    expect(coverage!.highlight).toBe('blue');

    const deductible = ins.items.find(i => i.text.includes('5 000'));
    expect(deductible).toBeDefined();
    expect(deductible!.text).toBe('udział własny: **5 000 zł**');
  });

  it('insurance: 0 deductible renders correctly', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: { ...OPTIMUM_PLAN.features, 'feature.insurance.deductible': '0' },
    };
    const p = planToCardProps(expert, 'ANNUAL');
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    expect(ins.items.find(i => i.text.includes('udział własny'))!.text).toBe('udział własny: **0 zł**');
  });

  it('Standard does not render insurance section at all (empty after filter)', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL');
    expect(p.features.find(s => s.title === 'Ubezpieczenie')).toBeUndefined();
  });

  it('Optimum without lostProfit feature does not render that line', () => {
    const p = planToCardProps(OPTIMUM_PLAN, 'ANNUAL');
    const ins = p.features.find(s => s.title === 'Ubezpieczenie')!;
    expect(ins.items.find(i => i.text === 'Utracony zysk')).toBeUndefined();
  });

  it('multiUser only renders when at least one feature flag set', () => {
    const expert: PlanCatalogEntryDto = {
      ...OPTIMUM_PLAN,
      planName: 'Expert',
      tier: 'top',
      features: {
        ...OPTIMUM_PLAN.features,
        'feature.multiUser.accountSwitching': 'true',
        'feature.multiUser.partnerDataView': 'true',
      },
    };
    const p = planToCardProps(expert, 'ANNUAL');
    expect(p.features.find(s => s.title === 'Wielodostęp')).toBeDefined();
  });
});

describe('planToCardProps — pricing', () => {
  it('Standard ANNUAL: 295 zł monthly, 3 540 zł netto/rok yearly, 708 zł savings', () => {
    const p = planToCardProps(STANDARD_PLAN, 'ANNUAL');
    expect(p.price).toBe('295 zł');
    expect(p.yearlyPrice).toBe('3 540 zł netto/rok');
    expect(p.savingsBadge).toBe('708 zł');
    expect(p.hasDiscount).toBeFalsy();
  });

  it('Standard MONTHLY: 354 zł monthly, no savings badge', () => {
    const p = planToCardProps(STANDARD_PLAN, 'MONTHLY');
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
    const p = planToCardProps(planWithDiscount, 'MONTHLY');
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
    const p = planToCardProps(planWithPromo, 'MONTHLY');
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
    expect(planToCardProps(make(1), 'MONTHLY').promoSubtext).toBe('przez 1 miesiąc');
    expect(planToCardProps(make(5), 'MONTHLY').promoSubtext).toBe('przez 5 miesięcy');
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
    const p = planToCardProps(promoMonthly, 'ANNUAL');
    expect(p.promoHeader).toBeUndefined();
    expect(p.promoSubtext).toBeUndefined();
  });
});
