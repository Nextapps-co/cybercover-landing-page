import { useEffect, useState } from 'react';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { SummaryDataCard } from './SummaryDataCard';
import { OrderSummaryAside } from './OrderSummaryAside';
import { getOrderSession, resolveOsSkipped } from '../../lib/state/order-session';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import { canAccessStep } from '../../lib/state/checkout-navigation';
import { getOrder, confirmOrder, createStripeCheckoutSession } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import type { OrderResponseDto, OrderType } from '../../lib/api/types/order';

// Per spec §5.5.4 — orderType-aware copy.
const HEADER_PER_TYPE: Record<OrderType, string> = {
  INITIAL_PURCHASE: 'Podsumowanie',
  PLAN_UPGRADE: 'Podsumowanie zmiany planu',
  REACTIVATION: 'Podsumowanie wznowienia subskrypcji',
};

const CTA_PER_TYPE: Record<OrderType, string> = {
  INITIAL_PURCHASE: 'Zamawiam z obowiązkiem zapłaty',
  PLAN_UPGRADE: 'Potwierdzam zmianę planu',
  REACTIVATION: 'Wznawiam subskrypcję',
};

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function withOrderId(path: string, orderId: string): string {
  return `${path}?orderId=${encodeURIComponent(orderId)}`;
}

// Promotional zero-amount order: partner discount that brought total to 0
function isPromoZeroOrder(order: OrderResponseDto): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner =
    d.kind === 'PARTNER_FLAT' ||
    d.kind === 'PARTNER_COMPOSITE' ||
    d.kind === 'PARTNER_TIMEBOUND' ||
    d.kind === 'PARTNER_TIMEBOUND_COMPOSITE';
  return isPartner && d.priceAfterDiscount === 0;
}

export function ConfirmStep() {
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [osSkipped, setOsSkipped] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    (async () => {
      try {
        const [o, skipped] = await Promise.all([getOrder(id), resolveOsSkipped(id)]);
        if (cancelled) return;
        setOsSkipped(skipped);
        if (!canAccessStep(4, o.checkoutProgress) || !o.checkoutProgress.hasPaymentMethod) {
          const next = !o.checkoutProgress.hasCompanyData
            ? 'company-data'
            : !o.checkoutProgress.hasPersonalData
              ? 'personal-data'
              : !o.checkoutProgress.hasOperationalStandards
                ? 'operational-standards'
                : 'payment-method';
          navigateBackward(`/checkout/${next}?orderId=${encodeURIComponent(id)}`);
          return;
        }
        // CC-353 — świeży getOrder na mount zwraca przeliczoną `proration`
        // (np. po kodzie rabatowym z poprzedniego kroku). Boks renderuje rozbicie.
        setOrder(o);
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

  const handleConfirm = async () => {
    if (!order) return;
    setConfirming(true);
    setSubmitError(null);
    const orderId = order.orderId;
    const promoZero = isPromoZeroOrder(order);

    try {
      const result = await confirmOrder(orderId);

      if (result.paymentMethod === 'STRIPE_CHECKOUT') {
        const session = await createStripeCheckoutSession(orderId);
        window.location.href = session.url;
        return;
      }

      // BANK_TRANSFER
      if (promoZero) {
        // Flow C — no ProForma issued. Order already moves to PENDING_ALLOCATION.
        navigateForward(withOrderId('/checkout/success', orderId));
        return;
      }
      const token = result.confirmationToken ?? '';
      navigateForward(
        `/checkout/bank-transfer?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
      const t = translateApiError(err);
      if (err instanceof ApiError) {
        if (err.code === 'ORDER_NOT_FOUND') {
          window.location.assign('/cennik');
          return;
        }
      }
      setSubmitError({ title: t.title, message: t.message });
      setConfirming(false);
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

  const orderId = order.orderId;
  const company = order.companyData;
  const personal = order.personalData;
  const eligible = order.eligibilityResult?.eligible ?? true;

  // Per spec §5.5.4 — orderType-aware copy. Default 'INITIAL_PURCHASE' gdy session nie ma orderType
  // (anonymous flow, lub backward compat).
  const orderType: OrderType = getOrderSession()?.orderType ?? 'INITIAL_PURCHASE';

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={5} osSkipped={osSkipped} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          {HEADER_PER_TYPE[orderType]}
        </h1>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}

        {!eligible && (
          <div className="mb-6 rounded-[12px] border border-amber-300 bg-amber-50 p-4 font-['Plus_Jakarta_Sans',sans-serif] text-sm text-amber-900" role="status">
            <p className="font-semibold">Twoja polisa będzie aktywna po uzupełnieniu standardów bezpieczeństwa.</p>
            <p className="mt-1">
              Dokończ zakup teraz — po zaksięgowaniu polisa pozostanie w stanie wstrzymanym do czasu uzupełnienia
              odpowiedzi w Portalu Klienta. Wyślemy Ci magic link na podany e-mail.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-6">
            {company && (
              <SummaryDataCard
                title="Zamawiający"
                rows={[
                  { label: 'NIP', value: company.nip },
                  { label: 'Nazwa', value: company.name },
                  { label: 'Adres', value: company.street },
                  { label: 'Miasto', value: `${company.postalCode} ${company.city}` },
                ]}
              />
            )}
            {personal && (
              <SummaryDataCard
                title="Osoba kontaktowa"
                rows={[
                  { label: 'Imię', value: personal.firstName },
                  { label: 'Nazwisko', value: personal.lastName },
                  { label: 'E-mail służbowy', value: personal.email },
                  { label: 'Numer telefonu', value: personal.phone },
                ]}
              />
            )}
          </div>
          <aside className="lg:col-span-1">
            <OrderSummaryAside order={order} />
          </aside>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void handleConfirm(); }}>
          <FormActions
            onBack={() => navigateBackward(withOrderId('/checkout/payment-method', orderId))}
            submitLabel={CTA_PER_TYPE[orderType]}
            submitting={confirming}
            submittingLabel="Potwierdzanie…"
          />
        </form>
      </div>
    </div>
  );
}
