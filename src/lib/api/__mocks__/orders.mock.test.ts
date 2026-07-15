import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetOrdersMock,
  startOrderMock,
  submitCompanyDataMock,
  submitPersonalDataMock,
  submitOperationalStandardsMock,
  selectPaymentMethodMock,
  removeDiscountMock,
  confirmOrderMock,
  getOrderMock,
  changePaymentMethodMock,
  cancelOrderMock,
  markOrderPaidMock,
  validateDiscountCodeMock,
} from './orders.mock';
import { consumeMockAuthFromUrl } from '../../auth/mock-auth';

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

describe('removeDiscountMock', () => {
  beforeEach(() => resetOrdersMock());

  it('usuwa kod klienta (CODE_FLAT) i przywraca pełną cenę', async () => {
    const start = await startOrderMock({ catalogEntryId: 'ce_mock_optimum', billingCycle: 'MONTHLY', partnerCode: 'SUMMER10' });
    const before = await getOrderMock(start.orderId);
    expect(before.discount?.kind).toBe('CODE_FLAT');
    const updated = await removeDiscountMock(start.orderId);
    expect(updated.discount).toBeNull();
    expect(updated.totalPriceNet).toBe(59400); // pełna cena optimum MONTHLY
  });

  it('jest idempotentny — brak rabatu zwraca 200 bez zmian', async () => {
    const start = await startOrderMock({ catalogEntryId: 'ce_mock_optimum', billingCycle: 'MONTHLY' });
    const updated = await removeDiscountMock(start.orderId);
    expect(updated.discount).toBeNull();
    expect(updated.totalPriceNet).toBe(59400);
  });

  it('nie usuwa rabatu partnerskiego → 409 DISCOUNT_REMOVAL_NOT_ALLOWED', async () => {
    const start = await startOrderMock({ catalogEntryId: 'ce_mock_optimum', billingCycle: 'MONTHLY', partnerCode: 'VALVETECH' });
    await expect(removeDiscountMock(start.orderId))
      .rejects.toMatchObject({ httpStatus: 409, code: 'DISCOUNT_REMOVAL_NOT_ALLOWED' });
  });

  it('zwraca 409 INVALID_ORDER_STATE gdy zamówienie nie jest DRAFT', async () => {
    const orderId = await seedConfirmedStripeOrder();
    await expect(removeDiscountMock(orderId))
      .rejects.toMatchObject({ httpStatus: 409, code: 'INVALID_ORDER_STATE' });
  });

  it('zwraca 404 dla nieznanego orderId', async () => {
    await expect(removeDiscountMock('nope')).rejects.toMatchObject({ httpStatus: 404 });
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

describe('CODE_FLAT discount on PLAN_UPGRADE (CC-533)', () => {
  // Upgrade z Optimum (ACTIVE) na Professional → orderType PLAN_UPGRADE, proracja zaseedowana.
  async function seedUpgradeOrder(): Promise<string> {
    window.history.replaceState({}, '', '/cennik?mockAuth=optimum-ACTIVE');
    consumeMockAuthFromUrl();
    const start = await startOrderMock({
      catalogEntryId: 'CATALOG-mock-professional',
      billingCycle: 'MONTHLY',
    });
    return start.orderId;
  }

  beforeEach(() => {
    resetOrdersMock();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    // Nie zostawiaj mock-auth w sessionStorage — inne describe zakładają INITIAL_PURCHASE.
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('seeds an upgrade order with proration (amountDueNow = fullPrice − credit)', async () => {
    const orderId = await seedUpgradeOrder();
    const order = await getOrderMock(orderId);
    expect(order.proration).not.toBeNull();
    expect(order.proration!.amountDueNow).toBe(
      order.proration!.fullPrice - order.proration!.credit,
    );
    expect(order.discount).toBeNull();
  });

  it('validate-discount bases the preview on the plan base price (proration.fullPrice), not amountDueNow', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const res = await validateDiscountCodeMock(orderId, { discountCode: 'SAVE100' });
    expect(res.valid).toBe(true);
    expect(res.originalPriceNet).toBe(before.proration!.fullPrice);
    expect(res.discountedPriceNet).toBe(before.proration!.fullPrice - 10000);
  });

  it('selectPaymentMethod persists CODE_FLAT and recomputes amountDueNow = fullPrice − credit − discount', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const { fullPrice, credit } = before.proration!;
    const preDiscountDue = before.proration!.amountDueNow; // fullPrice − credit

    await selectPaymentMethodMock(orderId, {
      paymentMethod: 'STRIPE_CHECKOUT',
      discountCode: 'SAVE100',
    });

    const after = await getOrderMock(orderId);
    expect(after.discount).toMatchObject({
      kind: 'CODE_FLAT',
      code: 'SAVE100',
      originalAmount: fullPrice,
      discountAmount: 10000,
      priceAfterDiscount: fullPrice - 10000,
    });
    expect(after.proration!.fullPrice).toBe(fullPrice);
    expect(after.proration!.credit).toBe(credit);
    expect(after.proration!.amountDueNow).toBe(preDiscountDue - 10000);
    expect(after.totalPriceNet).toBe(preDiscountDue - 10000);
  });

  it('removeDiscount restores amountDueNow = fullPrice − credit and clears the discount', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const preDiscountDue = before.proration!.amountDueNow;

    await selectPaymentMethodMock(orderId, {
      paymentMethod: 'STRIPE_CHECKOUT',
      discountCode: 'SAVE100',
    });
    const restored = await removeDiscountMock(orderId);

    expect(restored.discount).toBeNull();
    expect(restored.proration!.amountDueNow).toBe(preDiscountDue);
    expect(restored.totalPriceNet).toBe(preDiscountDue);
  });

  it('is idempotent for the same CODE_FLAT — re-applying does not double-subtract', async () => {
    const orderId = await seedUpgradeOrder();
    const before = await getOrderMock(orderId);
    const preDiscountDue = before.proration!.amountDueNow;

    await selectPaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT', discountCode: 'SAVE100' });
    await selectPaymentMethodMock(orderId, { paymentMethod: 'STRIPE_CHECKOUT', discountCode: 'SAVE100' });

    const after = await getOrderMock(orderId);
    expect(after.discount!.discountAmount).toBe(10000);
    expect(after.proration!.amountDueNow).toBe(preDiscountDue - 10000);
    expect(after.totalPriceNet).toBe(preDiscountDue - 10000);
  });
});
