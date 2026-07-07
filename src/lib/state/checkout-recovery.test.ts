import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/types/errors';

vi.mock('@/lib/api/orders', () => ({
  changePaymentMethod: vi.fn(),
  cancelOrder: vi.fn(),
}));

import { changePaymentMethod, cancelOrder } from '@/lib/api/orders';
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isNoPaymentOrder,
  canSwitchToBankTransfer,
} from './checkout-recovery';

const mockChange = vi.mocked(changePaymentMethod);
const mockCancel = vi.mocked(cancelOrder);

describe('changePaymentToBankTransfer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 -> switched z tokenem', async () => {
    mockChange.mockResolvedValue({ orderId: 'o1', status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER', confirmationToken: 'tok-1' });
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'switched', confirmationToken: 'tok-1' });
  });

  it('409 -> not-switchable', async () => {
    mockChange.mockRejectedValue(new ApiError('INVALID_ORDER_STATE', 409, 'x'));
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'not-switchable' });
  });

  it('404 -> not-found', async () => {
    mockChange.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'x'));
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'not-found' });
  });

  it('inny błąd -> error', async () => {
    const err = new ApiError('INTERNAL_ERROR', 500, 'x');
    mockChange.mockRejectedValue(err);
    expect(await changePaymentToBankTransfer('o1')).toEqual({ kind: 'error', error: err });
  });
});

describe('startOverOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 -> cancelled', async () => {
    mockCancel.mockResolvedValue({ orderId: 'o1', status: 'CANCELLED' });
    expect(await startOverOrder('o1')).toEqual({ kind: 'cancelled' });
  });

  it('409 -> already-paid', async () => {
    mockCancel.mockRejectedValue(new ApiError('INVALID_ORDER_STATE', 409, 'x'));
    expect(await startOverOrder('o1')).toEqual({ kind: 'already-paid' });
  });

  it('404 -> not-found', async () => {
    mockCancel.mockRejectedValue(new ApiError('ORDER_NOT_FOUND', 404, 'x'));
    expect(await startOverOrder('o1')).toEqual({ kind: 'not-found' });
  });

  it('inny błąd -> error', async () => {
    const err = new ApiError('INTERNAL_ERROR', 500, 'x');
    mockCancel.mockRejectedValue(err);
    expect(await startOverOrder('o1')).toEqual({ kind: 'error', error: err });
  });
});

describe('predykaty', () => {
  it('isNoPaymentOrder — jawne paymentRequired', () => {
    expect(isNoPaymentOrder({ paymentRequired: false })).toBe(true);
    expect(isNoPaymentOrder({ paymentRequired: true })).toBe(false);
    expect(isNoPaymentOrder({})).toBe(false); // brak pola → traktuj jak płatne
  });

  it('canSwitchToBankTransfer — tylko CONFIRMED + STRIPE + płatne', () => {
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: true })).toBe(true);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'BANK_TRANSFER', paymentRequired: true })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'DRAFT', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: true })).toBe(false);
    expect(canSwitchToBankTransfer({ status: 'CONFIRMED', paymentMethod: 'STRIPE_CHECKOUT', paymentRequired: false })).toBe(false);
  });
});
