import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../types/errors';
import {
  resetOrdersMock,
  startOrderMock,
  submitCompanyDataMock,
  submitPersonalDataMock,
  submitOperationalStandardsMock,
  selectPaymentMethodMock,
  confirmOrderMock,
  getOrderMock,
  changePaymentMethodMock,
  cancelOrderMock,
  markOrderPaidMock,
} from './orders.mock';

// Buduje zamówienie w stanie CONFIRMED + STRIPE_CHECKOUT (niepłacone).
async function seedConfirmedStripeOrder(): Promise<string> {
  const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
  const orderId = start.orderId;
  await submitCompanyDataMock(orderId, {
    nip: '5260001246', name: 'ACME Sp. z o.o.', street: 'ul. Przykładowa 15',
    city: 'Warszawa', postalCode: '00-123', industry: 'IT',
  });
  await submitPersonalDataMock(orderId, {
    firstName: 'Jan', lastName: 'Kowalski', email: 'jan@acme.pl', phone: '+48123456789',
    consents: [],
  });
  await submitOperationalStandardsMock(orderId, { answers: {} });
  await selectPaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT' });
  const confirmed = await confirmOrderMock(orderId);
  expect(confirmed.status).toBe('CONFIRMED');
  expect(confirmed.paymentMethod).toBe('STRIPE_CHECKOUT');
  return orderId;
}

describe('changePaymentMethodMock', () => {
  beforeEach(() => resetOrdersMock());

  it('przełącza CONFIRMED+STRIPE na BANK_TRANSFER i zwraca token, status zostaje CONFIRMED', async () => {
    const orderId = await seedConfirmedStripeOrder();
    const res = await changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' });
    expect(res.status).toBe('CONFIRMED');
    expect(res.paymentMethod).toBe('BANK_TRANSFER');
    expect(res.confirmationToken).toBeTruthy();
  });

  it('jest jednokierunkowe — drugie wywołanie zwraca 409', async () => {
    const orderId = await seedConfirmedStripeOrder();
    await changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' });
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 409 gdy zamówienie już opłacone (PENDING_ALLOCATION)', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    await getOrderMock(orderId); // CONFIRMED -> PENDING_ALLOCATION
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 400 dla nieprawidłowej metody', async () => {
    const orderId = await seedConfirmedStripeOrder();
    // @ts-expect-error — celowo zła wartość, by sprawdzić walidację
    await expect(changePaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT' }))
      .rejects.toMatchObject({ httpStatus: 400 });
  });

  it('zwraca 404 dla nieznanego orderId', async () => {
    await expect(changePaymentMethodMock('nope', { paymentMethod: 'BANK_TRANSFER' }))
      .rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('cancelOrderMock', () => {
  beforeEach(() => resetOrdersMock());

  it('anuluje zamówienie DRAFT', async () => {
    const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
    const res = await cancelOrderMock(start.orderId);
    expect(res.status).toBe('CANCELLED');
  });

  it('jest idempotentne — powtórne wywołanie zwraca CANCELLED', async () => {
    const start = await startOrderMock({ catalogEntryId: 'optimum', billingCycle: 'MONTHLY' });
    await cancelOrderMock(start.orderId);
    const again = await cancelOrderMock(start.orderId);
    expect(again.status).toBe('CANCELLED');
  });

  it('zwraca 409 gdy zamówienie już opłacone', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    await getOrderMock(orderId); // -> PENDING_ALLOCATION
    await expect(cancelOrderMock(orderId)).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('zwraca 404 dla nieznanego orderId', async () => {
    await expect(cancelOrderMock('nope')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('anuluje zamówienie CONFIRMED (niepłacone)', async () => {
    const orderId = await seedConfirmedStripeOrder();
    const res = await cancelOrderMock(orderId);
    expect(res.status).toBe('CANCELLED');
  });
});

describe('getOrderMock — kaskada tylko dla opłaconych', () => {
  beforeEach(() => resetOrdersMock());

  it('CONFIRMED niepłacone jest stabilne przy wielokrotnym odczycie', async () => {
    const orderId = await seedConfirmedStripeOrder();
    expect((await getOrderMock(orderId)).status).toBe('CONFIRMED');
    expect((await getOrderMock(orderId)).status).toBe('CONFIRMED');
  });

  it('po markOrderPaidMock kaskada awansuje status', async () => {
    const orderId = await seedConfirmedStripeOrder();
    markOrderPaidMock(orderId);
    expect((await getOrderMock(orderId)).status).toBe('PENDING_ALLOCATION');
  });
});
