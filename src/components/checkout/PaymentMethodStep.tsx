import { useEffect, useState } from 'react';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { PaymentMethodOption } from './PaymentMethodOption';
import { DiscountCodeField, type DiscountState } from './DiscountCodeField';
import { getOrderSession, persistOsSkipped } from '../../lib/state/order-session';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import { saveFormState, getFormState } from '../../lib/state/form-persistence';
import { canAccessStep } from '../../lib/state/checkout-navigation';
import { getOrder, getOperationalStandardsSchema, validateDiscountCode, selectPaymentMethod } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { getDiscountCodeFromUrl, clearDiscountCode } from '../../lib/format/discount-code';
import type { OrderResponseDto, PaymentMethod } from '../../lib/api/types/order';

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function hasPartnerDiscount(order: OrderResponseDto): boolean {
  const kind = order.discount?.kind;
  return kind === 'PARTNER_FLAT' || kind === 'PARTNER_COMPOSITE' || kind === 'PARTNER_TIMEBOUND';
}

export function PaymentMethodStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [osSkipped, setOsSkipped] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [discountState, setDiscountState] = useState<DiscountState>({ status: 'idle' });
  const [storedDiscountCode, setStoredDiscountCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    setOrderId(id);

    (async () => {
      try {
        // §2.6 — fetch schema in parallel to detect whether OS step was
        // auto-skipped (no-insurance plan, e.g. Standard). Used for Back button
        // target. Best-effort: on schema error, default to non-skipped.
        const [o, schema] = await Promise.all([
          getOrder(id),
          getOperationalStandardsSchema(id).catch(() => null),
        ]);
        if (cancelled) return;
        if (!canAccessStep(4, o.checkoutProgress)) {
          const next = !o.checkoutProgress.hasCompanyData
            ? 'company-data'
            : !o.checkoutProgress.hasPersonalData
              ? 'personal-data'
              : 'operational-standards';
          navigateBackward(`/checkout/${next}?orderId=${encodeURIComponent(id)}`);
          return;
        }
        setOrder(o);
        const skipped = Boolean(schema?.skipped);
        setOsSkipped(skipped);
        if (schema) persistOsSkipped(skipped);
        const draft = getFormState<{ paymentMethod: PaymentMethod | '' }>('payment-method');
        setPaymentMethod(o.paymentMethod ?? draft?.paymentMethod ?? '');
        if (!hasPartnerDiscount(o)) {
          const stored = getDiscountCodeFromUrl();
          if (stored) setStoredDiscountCode(stored);
        }
        setHydrating(false);
      } catch (err) {
        if (cancelled) return;
        const t = translateApiError(err);
        if (err instanceof ApiError && err.code === 'ORDER_NOT_FOUND') {
          window.location.assign('/cennik');
          return;
        }
        setHydrationError(t.message);
        setHydrating(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleApplyDiscount = async (code: string) => {
    if (!orderId) return;
    setDiscountState({ status: 'validating' });
    try {
      const res = await validateDiscountCode(orderId, { discountCode: code });
      if (res.valid && res.originalPriceNet !== null && res.discountedPriceNet !== null) {
        setDiscountState({
          status: 'applied',
          code,
          originalPriceNet: res.originalPriceNet,
          discountedPriceNet: res.discountedPriceNet,
        });
      } else {
        setDiscountState({ status: 'error', message: res.message ?? 'Kod nieaktywny.' });
      }
    } catch (err) {
      setDiscountState({ status: 'error', message: translateApiError(err).message });
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountState({ status: 'idle' });
    clearDiscountCode();
    setStoredDiscountCode(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;

    if (!paymentMethod) {
      setSubmitError({ title: 'Wybierz metodę płatności', message: 'Zaznacz jedną z opcji płatności żeby kontynuować.' });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const dto: { paymentMethod: PaymentMethod; discountCode?: string } = { paymentMethod };
      if (discountState.status === 'applied') dto.discountCode = discountState.code;
      await selectPaymentMethod(orderId, dto);
      saveFormState('payment-method', { paymentMethod });
      if (discountState.status === 'applied') clearDiscountCode();
      navigateForward(`/checkout/confirm?orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
      const t = translateApiError(err);
      if (err instanceof ApiError) {
        if (err.code === 'DISCOUNT_CODE_NOT_FOUND') {
          setDiscountState({ status: 'error', message: 'Kod nieaktywny lub nie istnieje.' });
          setSubmitting(false);
          return;
        }
        if (err.code === 'DISCOUNT_SOURCE_CONFLICT') {
          setDiscountState({
            status: 'error',
            message: 'Zniżki partnera i kodu rabatowego nie można łączyć. Usuń kod albo wróć do cennika bez kodu partnera.',
          });
          setSubmitting(false);
          return;
        }
        if (err.code === 'ORDER_NOT_FOUND') {
          window.location.assign('/cennik');
          return;
        }
      }
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  if (hydrating) {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Ładowanie zamówienia…</div>;
  }
  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">Wróć do cennika</a>
      </div>
    );
  }
  if (!order) return null;

  const partnerActive = hasPartnerDiscount(order) && order.discount ? { code: order.discount.code } : null;

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={4} osSkipped={osSkipped} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Metoda płatności
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset className="rounded-[12px] bg-[#f8f7f4] p-6">
                <legend className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-lg text-black mb-4 px-1">
                  Wybierz metodę płatności <span className="text-red-500">*</span>
                </legend>
                <div className="space-y-3">
                  <PaymentMethodOption
                    id="pm-stripe"
                    name="paymentMethod"
                    value="STRIPE_CHECKOUT"
                    selected={paymentMethod === 'STRIPE_CHECKOUT'}
                    onSelect={() => setPaymentMethod('STRIPE_CHECKOUT')}
                    title="Karta płatnicza"
                    description="Szybka płatność online kartą kredytową lub debetową"
                    badges={['VISA', 'Mastercard', 'BLIK']}
                  />
                  <PaymentMethodOption
                    id="pm-bank"
                    name="paymentMethod"
                    value="BANK_TRANSFER"
                    selected={paymentMethod === 'BANK_TRANSFER'}
                    onSelect={() => setPaymentMethod('BANK_TRANSFER')}
                    title="Przelew bankowy"
                    description="Otrzymasz proformę PDF z numerem konta — opłać w ciągu 14 dni"
                  />
                </div>
                <p className="mt-3 rounded-[8px] bg-blue-50 p-3 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-blue-800">
                  Po kliknięciu „Dalej" zostaniesz przekierowany do bezpiecznej finalizacji płatności.
                </p>
              </fieldset>

              <DiscountCodeField
                state={discountState}
                onApply={handleApplyDiscount}
                onRemove={handleRemoveDiscount}
                partnerActive={partnerActive}
                initialCode={storedDiscountCode}
              />

              <FormActions
                onBack={() => {
                  const back = osSkipped ? 'personal-data' : 'operational-standards';
                  navigateBackward(`/checkout/${back}?orderId=${encodeURIComponent(orderId ?? '')}`);
                }}
                submitLabel="Dalej"
                submitting={submitting}
                submitDisabled={!paymentMethod}
              />
            </form>
          </div>

          <aside className="lg:col-span-1">
            <OrderSummaryAside />
          </aside>
        </div>
      </div>
    </div>
  );
}
