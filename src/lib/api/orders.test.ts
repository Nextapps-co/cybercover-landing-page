import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startOrder, getOrder, getCheckoutState, submitCompanyData, lookupCompany,
  fetchConsentDefinitions, submitPersonalData,
  getOperationalStandardsSchema, submitOperationalStandards, evaluateEligibility,
  validateDiscountCode, selectPaymentMethod,
  confirmOrder, createStripeCheckoutSession,
  getOrderConfirmation, buildProformaDownloadUrl,
} from './orders';
import { resetOrdersMock } from './__mocks__/orders.mock';

describe('orders client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
    resetOrdersMock();
  });

  describe('when PUBLIC_USE_MOCK_ORDERS=true', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'true';
    });

    it('startOrder uses mock (no fetch)', async () => {
      const response = await startOrder({ catalogEntryId: 'ce_mock_optimum', billingCycle: 'MONTHLY' });
      expect(response.orderId).toMatch(/^ord_mock_/);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('getOrder uses mock', async () => {
      const { orderId } = await startOrder({ catalogEntryId: 'ce_mock_optimum', billingCycle: 'MONTHLY' });
      const order = await getOrder(orderId);
      expect(order.orderId).toBe(orderId);
    });
  });

  describe('when PUBLIC_USE_MOCK_ORDERS=false', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('startOrder hits backend', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ orderId: 'ord_real_1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const response = await startOrder({ catalogEntryId: 'ce_real', billingCycle: 'MONTHLY' });
      expect(response.orderId).toBe('ord_real_1');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/start',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('getCheckoutState hits backend', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            progress: {
              hasCompanyData: true,
              hasPersonalData: false,
              hasOperationalStandards: false,
              hasPaymentMethod: false,
            },
            isComplete: false,
            nextRequiredStep: 'PERSONAL_DATA',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const state = await getCheckoutState('ord_1');
      expect(state.nextRequiredStep).toBe('PERSONAL_DATA');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/checkout-state',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('submitCompanyData', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('PATCHes /orders/:id/company-data with body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            progress: { hasCompanyData: true, hasPersonalData: false, hasOperationalStandards: false, hasPaymentMethod: false },
            isComplete: false,
            nextRequiredStep: 'PERSONAL_DATA',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await submitCompanyData('ord_1', {
        nip: '5260001246',
        name: 'Test',
        street: 'ul. Testowa 1',
        city: 'Warszawa',
        postalCode: '00-001',
        industry: 'IT',
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/company-data',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('lookupCompany', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('GETs /orders/company-lookup?nip=', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            found: true,
            company: { nip: '5260001246', name: 'A', street: 's', city: 'c', postalCode: '00-001', industry: null, source: 'CEIDG' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await lookupCompany('5260001246');
      expect(res.found).toBe(true);
      expect(res.company?.name).toBe('A');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/company-lookup?nip=5260001246',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('fetchConsentDefinitions', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('GETs /orders/consent-definitions and returns definitions array', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            consentDefinitions: [
              { id: 'c1', code: 'TOS', name: '<b>tos</b>', description: '', type: 'USER', isRequired: true, version: 1, expandedDetails: null },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await fetchConsentDefinitions();
      expect(res).toHaveLength(1);
      expect(res[0].code).toBe('TOS');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/consent-definitions',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('submitPersonalData', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('PATCHes /orders/:id/personal-data with body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            progress: { hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: false, hasPaymentMethod: false },
            isComplete: false,
            nextRequiredStep: 'OPERATIONAL_STANDARDS',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await submitPersonalData('ord_1', {
        firstName: 'Jan',
        lastName: 'Kowalski',
        email: 'jan@example.com',
        phone: '+48123456789',
        consents: [{ consentDefinitionId: 'c1', accepted: true, consentVersion: 1 }],
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/personal-data',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('getOperationalStandardsSchema', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('GETs /orders/:id/operational-standards-schema', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            insurerName: 'Colonnade',
            questions: [],
            answerOptions: ['YES', 'NO', 'DONT_KNOW'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await getOperationalStandardsSchema('ord_1');
      expect(res.insurerName).toBe('Colonnade');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/operational-standards-schema',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('submitOperationalStandards', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('PATCHes /orders/:id/operational-standards with body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            eligible: true,
            missingRequirements: [],
            contributions: [],
            checkoutProgress: {
              hasCompanyData: true,
              hasPersonalData: true,
              hasOperationalStandards: true,
              hasPaymentMethod: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await submitOperationalStandards('ord_1', { answers: { OS_UPDATES: 'YES' } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/operational-standards',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('evaluateEligibility', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('POSTs /orders/:id/evaluate-eligibility with body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            eligible: true,
            missingRequirements: [],
            contributions: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await evaluateEligibility('ord_1', { answers: { OS_UPDATES: 'YES' } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/evaluate-eligibility',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('validateDiscountCode', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('POSTs /orders/:id/validate-discount with body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            valid: true,
            discountType: 'PERCENTAGE',
            discountValue: '10',
            originalPriceNet: 59400,
            discountedPriceNet: 53460,
            currency: 'PLN',
            message: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await validateDiscountCode('ord_1', { discountCode: 'CYBER10' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/validate-discount',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('selectPaymentMethod', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    const CHECKOUT_STATE = {
      orderId: 'ord_1',
      progress: {
        hasCompanyData: true,
        hasPersonalData: true,
        hasOperationalStandards: true,
        hasPaymentMethod: true,
      },
      isComplete: true,
      nextRequiredStep: null,
    };

    it('PATCHes /orders/:id/payment-method and returns checkout-state (CC-353: no prices)', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify(CHECKOUT_STATE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await selectPaymentMethod('ord_1', { paymentMethod: 'STRIPE_CHECKOUT' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/payment-method',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(result.progress.hasPaymentMethod).toBe(true);
      expect(result.nextRequiredStep).toBeNull();
      // Kontrakt CC-353: odpowiedź PATCH nie zawiera cen.
      expect(result).not.toHaveProperty('line');
    });

    it('passes discountCode in the PATCH body when applied', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify(CHECKOUT_STATE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await selectPaymentMethod('ord_1', { paymentMethod: 'BANK_TRANSFER', discountCode: 'SAVE10' });
      const [, init] = (globalThis.fetch as any).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ paymentMethod: 'BANK_TRANSFER', discountCode: 'SAVE10' });
    });
  });

  describe('getOrder — proration (CC-353)', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    function backendOrder(overrides: Record<string, unknown>) {
      return {
        orderId: 'ord_x',
        status: 'DRAFT',
        billingCycle: 'MONTHLY',
        paymentMethod: null,
        checkoutProgress: { hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: false },
        companyData: null,
        personalData: null,
        lines: [{ lineId: 'l1', catalogEntryId: 'ce', planName: 'Optimum', priceNet: 44650 }],
        totalPriceNet: 44650,
        currency: 'PLN',
        discount: null,
        proration: null,
        eligibilityResult: null,
        createdAt: '2026-06-26T10:00:00.000Z',
        ...overrides,
      };
    }

    it('parses proration for PLAN_UPGRADE (amountDueNow === totalPriceNet)', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify(backendOrder({
            proration: { fullPrice: 59400, credit: 14750, amountDueNow: 44650, currency: 'PLN' },
          })),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await getOrder('ord_up');
      expect(result.proration).toEqual({ fullPrice: 59400, credit: 14750, amountDueNow: 44650, currency: 'PLN' });
      expect(result.proration?.amountDueNow).toBe(result.totalPriceNet);
    });

    it('proration is null for non-upgrade orders', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify(backendOrder({ proration: null })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await getOrder('ord_init');
      expect(result.proration).toBeNull();
    });
  });

  describe('startOrder — auth-aware response', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('returns wizardEntryStep + prefilledFields + orderType', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'order-y',
            wizardEntryStep: 'payment-method',
            prefilledFields: ['companyData', 'personalData', 'operationalStandards'],
            orderType: 'PLAN_UPGRADE',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await startOrder({ catalogEntryId: 'CE', billingCycle: 'ANNUAL' });
      expect(result.wizardEntryStep).toBe('payment-method');
      expect(result.prefilledFields).toEqual(['companyData', 'personalData', 'operationalStandards']);
      expect(result.orderType).toBe('PLAN_UPGRADE');
    });
  });

  describe('confirmOrder', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('POSTs /orders/:id/confirm', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            orderId: 'ord_1',
            status: 'CONFIRMED',
            paymentMethod: 'STRIPE_CHECKOUT',
            confirmationToken: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await confirmOrder('ord_1');
      expect(res.status).toBe('CONFIRMED');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/confirm',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getOrderConfirmation', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('GETs /orders/:id/confirmation?token=...', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'BANK_TRANSFER',
            orderId: 'ord_1',
            proforma: { invoiceNumber: 'PF/00001/2026', pdfUrl: 'data:text/plain;base64,abc', dueDate: '2026-05-12' },
            payment: {
              bankAccount: '12 3456 7890 1234 5678 9012 3456',
              transferTitle: 'PF/00001/2026',
              grossAmountMinorUnits: 59400,
              netAmountMinorUnits: 48293,
              vatAmountMinorUnits: 11107,
              currency: 'PLN',
            },
            customerEmail: 'jan@example.com',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await getOrderConfirmation('ord_1', 'tkn_123');
      expect(res.type).toBe('BANK_TRANSFER');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/ord_1/confirmation?token=tkn_123',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('buildProformaDownloadUrl', () => {
    it('in mock mode returns a data: URL', () => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'true';
      const url = buildProformaDownloadUrl('ord_1', 'tkn');
      expect(url.startsWith('data:')).toBe(true);
    });
  });

  describe('createStripeCheckoutSession', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    });

    it('POSTs /sales-order/:id/stripe-checkout-session (note: /sales-order/ prefix)', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            sessionId: 'cs_test_1',
            url: 'https://stripe/checkout/cs_test_1',
            paymentId: 'pay_test_1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const res = await createStripeCheckoutSession('ord_1');
      expect(res.url).toContain('stripe');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/sales-order/ord_1/stripe-checkout-session',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
