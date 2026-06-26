import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromStorage,
  persistToStorage,
  clearSession,
  setFromStartOrderResponse,
  STORAGE_KEY,
  ORDER_SESSION_TTL_MS,
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
  createdAt: new Date().toISOString(),
});

describe('order-session', () => {
  beforeEach(() => {
    localStorage.clear();
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
      localStorage.setItem(STORAGE_KEY, '{not-valid}');
      expect(loadFromStorage()).toBeNull();
    });

    it('loadFromStorage returns null when stored value missing orderId', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ catalogEntryId: 'x' }));
      expect(loadFromStorage()).toBeNull();
    });

    it('loadFromStorage returns null when billingCycle is invalid', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...fixture(), billingCycle: 'WEEKLY' }),
      );
      expect(loadFromStorage()).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('clears localStorage', () => {
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

  describe('TTL expiry', () => {
    it('returns null and clears storage when createdAt older than TTL', () => {
      const stale = { ...fixture(), createdAt: new Date(Date.now() - ORDER_SESSION_TTL_MS - 1000).toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
      expect(loadFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns the session when createdAt within TTL', () => {
      const fresh = { ...fixture(), createdAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      expect(loadFromStorage()?.orderId).toBe(fresh.orderId);
    });

    it('does not expire when createdAt is unparseable', () => {
      const weird = { ...fixture(), createdAt: 'not-a-date' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(weird));
      expect(loadFromStorage()?.orderId).toBe(weird.orderId);
    });
  });
});
