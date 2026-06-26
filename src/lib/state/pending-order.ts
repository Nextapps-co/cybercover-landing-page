// Jedno źródło prawdy o tym, czy istnieje wznawialne zamówienie.
// Patrz docs/superpowers/specs/2026-06-26-payment-resume-design.md.

import type { OrderResponseDto } from '../api/types/order';
import { getOrder } from '../api/orders';
import { ApiError } from '../api/types/errors';
import { getOrderSession, clearOrderSession } from './order-session';

export type PendingOrderKind = 'resumable' | 'paid' | 'dead' | 'draft';

export type PendingOrderResolution =
  | { kind: 'none' }
  | { kind: 'resumable' | 'paid' | 'dead'; orderId: string }
  | { kind: 'draft'; orderId: string; order: OrderResponseDto };

/**
 * Czysta klasyfikacja zamówienia po statusie + metodzie płatności.
 * - resumable: CONFIRMED + STRIPE_CHECKOUT (czeka na opłacenie przez Stripe)
 * - paid:      opłacone/przetwarzane, lub CONFIRMED + BANK_TRANSFER
 * - dead:      CANCELLED / CLOSED
 * - draft:     wizard niedokończony (poza zakresem resume)
 */
export function classifyOrder(order: OrderResponseDto): PendingOrderKind {
  switch (order.status) {
    case 'DRAFT':
      return 'draft';
    case 'CONFIRMED':
      return order.paymentMethod === 'STRIPE_CHECKOUT' ? 'resumable' : 'paid';
    case 'PENDING_ALLOCATION':
    case 'PROCESSING':
    case 'FULFILLED':
      return 'paid';
    case 'CANCELLED':
    case 'CLOSED':
      return 'dead';
  }
}

/**
 * Czyta orderId z sessionStorage, hydratuje z getOrder i klasyfikuje.
 * Fail-open: każdy błąd (brak sesji, ORDER_NOT_FOUND, sieć) → { kind: 'none' },
 * żeby nie blokować wejścia na /cennik. ORDER_NOT_FOUND dodatkowo czyści stale sesję.
 */
export async function resolvePendingOrder(): Promise<PendingOrderResolution> {
  const session = getOrderSession();
  if (!session) return { kind: 'none' };

  try {
    const order = await getOrder(session.orderId);
    const kind = classifyOrder(order);
    if (kind === 'draft') {
      return { kind: 'draft', orderId: order.orderId, order };
    }
    return { kind, orderId: order.orderId };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ORDER_NOT_FOUND') {
      clearOrderSession();
    }
    return { kind: 'none' };
  }
}
