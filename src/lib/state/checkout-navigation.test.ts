import { describe, it, expect } from 'vitest';
import { stepToUrl, canAccessStep, checkoutStepNumber, resumeStepPath } from './checkout-navigation';
import type { CheckoutProgressDto } from '../api/types/order';

const progress = (overrides: Partial<CheckoutProgressDto>): CheckoutProgressDto => ({
  hasCompanyData: false,
  hasPersonalData: false,
  hasOperationalStandards: false,
  hasPaymentMethod: false,
  ...overrides,
});

describe('stepToUrl', () => {
  it('maps CheckoutStep enum to URL', () => {
    expect(stepToUrl('COMPANY_DATA')).toBe('/checkout/company-data');
    expect(stepToUrl('PERSONAL_DATA')).toBe('/checkout/personal-data');
    expect(stepToUrl('OPERATIONAL_STANDARDS')).toBe('/checkout/operational-standards');
    expect(stepToUrl('PAYMENT_METHOD')).toBe('/checkout/payment-method');
  });
});

describe('checkoutStepNumber', () => {
  it('maps step number to enum', () => {
    expect(checkoutStepNumber(1)).toBe('COMPANY_DATA');
    expect(checkoutStepNumber(2)).toBe('PERSONAL_DATA');
    expect(checkoutStepNumber(3)).toBe('OPERATIONAL_STANDARDS');
    expect(checkoutStepNumber(4)).toBe('PAYMENT_METHOD');
  });
});

describe('canAccessStep', () => {
  it('step 1: always accessible', () => {
    expect(canAccessStep(1, progress({}))).toBe(true);
  });

  it('step 2: requires hasCompanyData', () => {
    expect(canAccessStep(2, progress({}))).toBe(false);
    expect(canAccessStep(2, progress({ hasCompanyData: true }))).toBe(true);
  });

  it('step 3: requires company + personal', () => {
    expect(canAccessStep(3, progress({ hasCompanyData: true }))).toBe(false);
    expect(canAccessStep(3, progress({ hasCompanyData: true, hasPersonalData: true }))).toBe(true);
  });

  it('step 4: requires company + personal + standards', () => {
    expect(canAccessStep(4, progress({ hasCompanyData: true, hasPersonalData: true }))).toBe(false);
    expect(
      canAccessStep(4, progress({ hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true })),
    ).toBe(true);
  });
});

describe('resumeStepPath', () => {
  const p = (over: Partial<CheckoutProgressDto> = {}): CheckoutProgressDto => ({
    hasCompanyData: false,
    hasPersonalData: false,
    hasOperationalStandards: false,
    hasPaymentMethod: false,
    ...over,
  });

  it('no company data → company-data', () => {
    expect(resumeStepPath(p())).toBe('/checkout/company-data');
  });
  it('company done → personal-data', () => {
    expect(resumeStepPath(p({ hasCompanyData: true }))).toBe('/checkout/personal-data');
  });
  it('company+personal → operational-standards', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true }))).toBe('/checkout/operational-standards');
  });
  it('+operational-standards → payment-method', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true }))).toBe('/checkout/payment-method');
  });
  it('all done → confirm', () => {
    expect(resumeStepPath(p({ hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: true }))).toBe('/checkout/confirm');
  });
});
