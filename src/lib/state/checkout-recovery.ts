import { ApiError } from '@/lib/api/types/errors';
import { changePaymentMethod, cancelOrder } from '@/lib/api/orders';
import type { OrderResponseDto } from '@/lib/api/types/order';

export type ChangeToBankOutcome =
  | { kind: 'switched'; confirmationToken: string }
  | { kind: 'not-switchable' } // 409 — już przelew / już opłacone / nie CONFIRMED
  | { kind: 'not-found' }      // 404
  | { kind: 'error'; error: unknown };

export async function changePaymentToBankTransfer(orderId: string): Promise<ChangeToBankOutcome> {
  try {
    const res = await changePaymentMethod(orderId, { paymentMethod: 'BANK_TRANSFER' });
    return { kind: 'switched', confirmationToken: res.confirmationToken ?? '' };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.httpStatus === 409) return { kind: 'not-switchable' };
      if (err.httpStatus === 404 || err.code === 'ORDER_NOT_FOUND') return { kind: 'not-found' };
    }
    return { kind: 'error', error: err };
  }
}

export type StartOverOutcome =
  | { kind: 'cancelled' }    // 200 (lub już CANCELLED — idempotentne)
  | { kind: 'already-paid' } // 409 — opłacone w międzyczasie
  | { kind: 'not-found' }    // 404
  | { kind: 'error'; error: unknown };

export async function startOverOrder(orderId: string): Promise<StartOverOutcome> {
  try {
    await cancelOrder(orderId);
    return { kind: 'cancelled' };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.httpStatus === 409) return { kind: 'already-paid' };
      if (err.httpStatus === 404 || err.code === 'ORDER_NOT_FOUND') return { kind: 'not-found' };
    }
    return { kind: 'error', error: err };
  }
}

// Promocyjne zamówienie 0 zł (rabat partnera doprowadził do 0). Dedupe z ConfirmStep/ResumePaymentScreen.
export function isPromoZeroOrder(order: Pick<OrderResponseDto, 'discount'>): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner =
    d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' ||
    d.kind === 'PARTNER_TIMEBOUND' || d.kind === 'PARTNER_TIMEBOUND_COMPOSITE';
  return isPartner && d.priceAfterDiscount === 0;
}

// Czy oferować „Zapłać przelewem" (change-method jest jednokierunkowe, tylko CONFIRMED+STRIPE).
export function canSwitchToBankTransfer(
  order: Pick<OrderResponseDto, 'status' | 'paymentMethod' | 'discount'>,
): boolean {
  return order.status === 'CONFIRMED'
    && order.paymentMethod === 'STRIPE_CHECKOUT'
    && !isPromoZeroOrder(order);
}
