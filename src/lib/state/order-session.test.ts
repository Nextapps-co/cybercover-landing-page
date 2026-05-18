import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromStorage,
  persistToStorage,
  clearSession,
  setFromStartOrderResponse,
  STORAGE_KEY,
  type OrderSession,
} from './order-session';

const fixture = (): OrderSession => ({
  orderId: 'ord_abc',
  catalogEntryId: 'ce_mock_optimum',
  billingCycle: 'MONTHLY',
  partnerCode: 'VALVETECH',
  planSnapshot: {
    planName: 'Optimum',
    priceMinorUnits: 49500,
    currency: 'PLN',
    description: 'Optimum plan',
  },
  createdAt: '2026-04-24T10:00:00.000Z',
});

describe('order-session', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('persistToStorage / loadFromStorage', () => {
    it('round-trips OrderSession', () => {
      const session = fixture();
      persistToStorage(session);
      const loaded = loadFromStorage();
      expect(loaded).toEqual(session);
    });

    it('loadFromStorage returns null when no stored value', () => {
      expect(loadFromStorage()).toBeNull();
    });

    it('loadFromStorage returns null when stored value is invalid JSON', () => {
      sessionStorage.setItem(STORAGE_KEY, '{not-valid}');
      expect(loadFromStorage()).toBeNull();
    });

    it('loadFromStorage returns null when stored value missing orderId', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ catalogEntryId: 'x' }));
      expect(loadFromStorage()).toBeNull();
    });

    it('loadFromStorage returns null when billingCycle is invalid', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...fixture(), billingCycle: 'WEEKLY' }),
      );
      expect(loadFromStorage()).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('clears sessionStorage', () => {
      persistToStorage(fixture());
      clearSession();
      expect(loadFromStorage()).toBeNull();
    });
  });

  describe('setFromStartOrderResponse', () => {
    it('builds session + persists, returning the persisted session', () => {
      const session = setFromStartOrderResponse(
        {
          orderId: 'ord_123',
          wizardEntryStep: 'company-data',
          prefilledFields: [],
          orderType: 'INITIAL_PURCHASE',
        },
        {
          catalogEntryId: 'ce_mock_optimum',
          billingCycle: 'MONTHLY',
          partnerCode: 'VALVETECH',
          plan: {
            planName: 'Optimum',
            priceMinorUnits: 49500,
            currency: 'PLN',
            description: 'desc',
          },
        },
      );
      expect(session.orderId).toBe('ord_123');
      expect(session.planSnapshot.planName).toBe('Optimum');
      expect(loadFromStorage()?.orderId).toBe('ord_123');
    });

    it('omits partnerCode when not provided', () => {
      const session = setFromStartOrderResponse(
        {
          orderId: 'ord_2',
          wizardEntryStep: 'company-data',
          prefilledFields: [],
        },
        {
          catalogEntryId: 'ce_mock_standard',
          billingCycle: 'ANNUAL',
          plan: {
            planName: 'Standard',
            priceMinorUnits: 29500,
            currency: 'PLN',
            description: 'd',
          },
        },
      );
      expect(session.partnerCode).toBeUndefined();
    });

    it('propagates auth-aware fields (orderType, wizardEntryStep, prefilledFields)', () => {
      const session = setFromStartOrderResponse(
        {
          orderId: 'ord_3',
          wizardEntryStep: 'payment-method',
          prefilledFields: ['companyData', 'personalData', 'operationalStandards'],
          orderType: 'PLAN_UPGRADE',
        },
        {
          catalogEntryId: 'ce_mock_professional',
          billingCycle: 'ANNUAL',
          plan: {
            planName: 'Profesjonalny',
            priceMinorUnits: 89500,
            currency: 'PLN',
            description: 'Pro',
          },
        },
      );
      expect(session.wizardEntryStep).toBe('payment-method');
      expect(session.prefilledFields).toEqual(['companyData', 'personalData', 'operationalStandards']);
      expect(session.orderType).toBe('PLAN_UPGRADE');

      const reloaded = loadFromStorage();
      expect(reloaded?.wizardEntryStep).toBe('payment-method');
      expect(reloaded?.orderType).toBe('PLAN_UPGRADE');
    });
  });
});
