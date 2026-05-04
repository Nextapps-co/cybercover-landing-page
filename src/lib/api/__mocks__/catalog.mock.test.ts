import { describe, it, expect } from 'vitest';
import { getMockPlans } from './catalog.mock';

describe('catalog mock', () => {
  it('returns 4 plans ordered by displayOrder', async () => {
    const plans = await getMockPlans();
    expect(plans.map((p) => p.displayOrder)).toEqual([1, 2, 3, 4]);
    // planName uses backend's English convention (frontend maps to PL via render-policy)
    expect(plans.map((p) => p.planName)).toEqual(['Standard', 'Optimum', 'Professional', 'Expert']);
  });

  it('monthly prices match mockup', async () => {
    const plans = await getMockPlans();
    const find = (code: string) => plans.find((p) => p.code === code)!;
    expect(find('standard').monthlyPrice.amount).toBe(35400);
    expect(find('optimum').monthlyPrice.amount).toBe(59400);
    expect(find('professional').monthlyPrice.amount).toBe(107400);
    expect(find('expert').monthlyPrice.amount).toBe(191400);
  });

  it('annual prices (monthly rate under annual billing) are lower than monthly', async () => {
    const plans = await getMockPlans();
    for (const plan of plans) {
      expect(plan.annualPrice.amount).toBeLessThan(plan.monthlyPrice.amount);
    }
  });

  it('Optimum is marked recommended, others are not', async () => {
    const plans = await getMockPlans();
    const recommended = plans.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].code).toBe('optimum');
  });

  it('every plan has a tier value', async () => {
    const plans = await getMockPlans();
    expect(plans.find((p) => p.code === 'standard')!.tier).toBe('entry');
    expect(plans.find((p) => p.code === 'optimum')!.tier).toBe('mid');
    expect(plans.find((p) => p.code === 'professional')!.tier).toBe('high');
    expect(plans.find((p) => p.code === 'expert')!.tier).toBe('top');
  });

  it('every plan has a non-empty ctaLabel', async () => {
    const plans = await getMockPlans();
    for (const plan of plans) {
      expect(plan.ctaLabel).toBeTruthy();
      expect(plan.ctaLabel!.length).toBeGreaterThan(0);
    }
  });

  it('catalogEntryId uses CATALOG- prefix', async () => {
    const plans = await getMockPlans();
    for (const plan of plans) {
      expect(plan.catalogEntryId).toMatch(/^CATALOG-/);
    }
  });

  it('plans expose stable code values', async () => {
    const plans = await getMockPlans();
    expect(plans.map((p) => p.code)).toEqual(['standard', 'optimum', 'professional', 'expert']);
  });

  it('feature.* keys follow new contract — Standard has minimal set', async () => {
    const plans = await getMockPlans();
    const standard = plans.find((p) => p.code === 'standard')!;
    expect(standard.features['feature.securityAssessment.legal']).toBe('true');
    expect(standard.features['feature.securityAssessment.technical']).toBe('true');
    expect(standard.features['feature.securityAssessment.report']).toBe('general');
    expect(standard.features['feature.monitoring.email']).toBe('true');
    expect(standard.features['feature.monitoring.web']).toBe('true');
    // Standard should NOT have insurance / consultation / training keys
    expect(standard.features['feature.consultation.timesPerYear']).toBeUndefined();
    expect(standard.features['feature.insurance.coverageAmount']).toBeUndefined();
  });

  it('feature.* keys — Expert has unlimited consultation and multiUser flags', async () => {
    const plans = await getMockPlans();
    const expert = plans.find((p) => p.code === 'expert')!;
    expect(expert.features['feature.consultation.timesPerYear']).toBe('unlimited');
    expect(expert.features['feature.multiUser.accountSwitching']).toBe('true');
    expect(expert.features['feature.multiUser.partnerDataView']).toBe('true');
    expect(expert.features['feature.insurance.coverageAmount']).toBe('5000000');
  });

  it('getMockPlans() (no code) → all plans have discount: null', async () => {
    const plans = await getMockPlans();
    for (const plan of plans) {
      expect(plan.discount).toBeNull();
    }
  });

  it("getMockPlans('SUMMER10') → all plans get CODE_FLAT 10% off, no partnerName", async () => {
    const plans = await getMockPlans('SUMMER10');
    for (const plan of plans) {
      expect(plan.discount).not.toBeNull();
      expect(plan.discount!.kind).toBe('CODE_FLAT');
      expect(plan.discount!.eligible).toBe(true);
      expect(plan.discount!.code).toBe('SUMMER10');
      expect(plan.discount!.annualPriceAfterDiscount!.amount).toBe(Math.round(plan.annualPrice.amount * 0.9));
      expect(plan.discount!.monthlyPriceAfterDiscount!.amount).toBe(Math.round(plan.monthlyPrice.amount * 0.9));
      expect(plan.discount!.promotionalDuration).toBeNull();
      expect(plan.discount!.partnerName).toBeNull();
      expect(plan.discount!.partnerLogoUrl).toBeNull();
    }
  });

  it("getMockPlans(undefined, 'VALVETECH') → all plans get PARTNER_FLAT 5% with partnerName/Logo", async () => {
    const plans = await getMockPlans(undefined, 'VALVETECH');
    for (const plan of plans) {
      expect(plan.discount).not.toBeNull();
      expect(plan.discount!.kind).toBe('PARTNER_FLAT');
      expect(plan.discount!.partnerName).toBe('ValveTech');
      expect(plan.discount!.partnerLogoUrl).toBe('/img/partners/valvetech.svg');
      expect(plan.discount!.annualPriceAfterDiscount!.amount).toBe(Math.round(plan.annualPrice.amount * 0.95));
    }
  });

  it("getMockPlans('TIMEBOUND_DEMO') → standard 100% off + promotionalDuration; others null", async () => {
    const plans = await getMockPlans('TIMEBOUND_DEMO');
    const standard = plans.find((p) => p.code === 'standard')!;
    expect(standard.discount).not.toBeNull();
    expect(standard.discount!.kind).toBe('PARTNER_TIMEBOUND');
    expect(standard.discount!.annualPriceAfterDiscount!.amount).toBe(0);
    expect(standard.discount!.monthlyPriceAfterDiscount!.amount).toBe(0);
    expect(standard.discount!.promotionalDuration).toEqual({ months: 3, applicableBillingCycle: 'MONTHLY' });
    expect(standard.discount!.partnerName).toBe('ValveTech');
    for (const code of ['optimum', 'professional', 'expert']) {
      const plan = plans.find((p) => p.code === code)!;
      expect(plan.discount).toBeNull();
    }
  });

  it("getMockPlans('COMPOSITE_DEMO') → standard 100% off, others 10% off", async () => {
    const plans = await getMockPlans('COMPOSITE_DEMO');
    const standard = plans.find((p) => p.code === 'standard')!;
    expect(standard.discount!.kind).toBe('PARTNER_COMPOSITE');
    expect(standard.discount!.annualPriceAfterDiscount!.amount).toBe(0);
    expect(standard.discount!.annualDiscountAmount!.amount).toBe(standard.annualPrice.amount);
    for (const code of ['optimum', 'professional', 'expert']) {
      const plan = plans.find((p) => p.code === code)!;
      expect(plan.discount!.kind).toBe('PARTNER_COMPOSITE');
      expect(plan.discount!.annualPriceAfterDiscount!.amount).toBe(Math.round(plan.annualPrice.amount * 0.9));
    }
  });

  it("getMockPlans('UNKNOWN_CODE') → all plans have discount: null", async () => {
    const plans = await getMockPlans('UNKNOWN_CODE');
    for (const plan of plans) {
      expect(plan.discount).toBeNull();
    }
  });

  it('partnerCode has priority over discountCode when both passed', async () => {
    const plans = await getMockPlans('SUMMER10', 'VALVETECH');
    // Should resolve VALVETECH (PARTNER_FLAT 5%), not SUMMER10 (CODE_FLAT 10%)
    expect(plans[0].discount!.kind).toBe('PARTNER_FLAT');
    expect(plans[0].discount!.code).toBe('VALVETECH');
  });
});
