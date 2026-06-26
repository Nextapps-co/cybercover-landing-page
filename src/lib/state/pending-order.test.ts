import { describe, it, expect, beforeEach, vi } from 'vitest';
import { classifyOrder, resolvePendingOrder } from './pending-order';
import { persistToStorage, clearSession, type OrderSession } from './order-session';
import { getOrder } from '../api/orders';
import { ApiError } from '../api/types/errors';
import type { OrderResponseDto } from '../api/types/order';

vi.mock('../api/orders', () => ({ getOrder: vi.fn() }));
const mockGetOrder = vi.mocked(getOrder);

const session = (): OrderSession => ({
  orderId: 'ord_abc',
  catalogEntryId: 'ce_optimum',
  billingCycle: 'MONTHLY',
  planSnapshot: { planName: 'Optimum', priceMinorUnits: 49500, currency: 'PLN', description: 'x' },
  createdAt: '2026-06-26T10:00:00.000Z',
});

const order = (over: Partial<OrderResponseDto>): OrderResponseDto => ({
  orderId: 'ord_abc',
  status: 'CONFIRMED',
  billingCycle: 'MONTHLY',
  paymentMethod: 'STRIPE_CHECKOUT',
  checkoutProgress: { hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: true },
  companyData: null,
  personalData: null,
  lines: [],
  totalPriceNet: 49500,
  currency: 'PLN',
  discount: null,
  proration: null,
  eligibilityResult: null,
  createdAt: '2026-06-26T10:00:00.000Z',
  ...over,
});

describe('classifyOrder', () => {
  it('CONFIRMED + STRIPE_CHECKOUT → resumable', () => {
    expect(classifyOrder(order({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT' }))).toBe('resumable');
  });
  it('CONFIRMED + BANK_TRANSFER → paid', () => {
    expect(classifyOrder(order({ status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER' }))).toBe('paid');
  });
  it.each(['PENDING_ALLOCATION', 'PROCESSING', 'FULFILLED'] as const)('%s → paid', (status) => {
    expect(classifyOrder(order({ status }))).toBe('paid');
  });
  it.each(['CANCELLED', 'CLOSED'] as const)('%s → dead', (status) => {
    expect(classifyOrder(order({ status }))).toBe('dead');
  });
  it('DRAFT → draft', () => {
    expect(classifyOrder(order({ status: 'DRAFT' }))).toBe('draft');
  });
});

describe('resolvePendingOrder', () => {
  beforeEach(() => {
    clearSession();
    mockGetOrder.mockReset();
  });

  it('no session → none', async () => {
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
    expect(mockGetOrder).not.toHaveBeenCalled();
  });

  it('resumable order → resumable + orderId', async () => {
    persistToStorage(session());
    mockGetOrder.mockResolvedValue(order({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT' }));
    expect(await resolvePendingOrder()).toEqual({ kind: 'resumable', orderId: 'ord_abc' });
  });

  it('paid order → paid + orderId', async () => {
    persistToStorage(session());
    mockGetOrder.mockResolvedValue(order({ status: 'PROCESSING' }));
    expect(await resolvePendingOrder()).toEqual({ kind: 'paid', orderId: 'ord_abc' });
  });

  it('ORDER_NOT_FOUND → none and clears session', async () => {
    persistToStorage(session());
    mockGetOrder.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'gone'));
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
    expect(window.sessionStorage.getItem('cybercover:order-session')).toBeNull();
  });

  it('network error → none (fail-open)', async () => {
    persistToStorage(session());
    mockGetOrder.mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'offline'));
    expect(await resolvePendingOrder()).toEqual({ kind: 'none' });
  });
});
