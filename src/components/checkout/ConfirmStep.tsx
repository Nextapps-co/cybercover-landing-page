import { useEffect, useState } from 'react';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { SummaryDataCard } from './SummaryDataCard';
import { SummaryPlanCard } from './SummaryPlanCard';
import { getOrderSession } from '../../lib/state/order-session';
import { canAccessStep } from '../../lib/state/checkout-navigation';
import { getOrder, confirmOrder, createStripeCheckoutSession } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import type { OrderResponseDto } from '../../lib/api/types/order';

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
  const isPartner = d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' || d.kind === 'PARTNER_TIMEBOUND';
  return isPartner && d.priceAfterDiscount === 0;
}

export function ConfirmStep() {
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
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
        const o = await getOrder(id);
        if (cancelled) return;
        if (!canAccessStep(4, o.checkoutProgress) || !o.checkoutProgress.hasPaymentMethod) {
          const next = !o.checkoutProgress.hasCompanyData
            ? 'company-data'
            : !o.checkoutProgress.hasPersonalData
              ? 'personal-data'
              : !o.checkoutProgress.hasOperationalStandards
                ? 'operational-standards'
                : 'payment-method';
          window.location.assign(`/checkout/${next}?orderId=${encodeURIComponent(id)}`);
          return;
        }
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
        window.location.assign(withOrderId('/checkout/success', orderId));
        return;
      }
      const token = result.confirmationToken ?? '';
      window.location.assign(
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
  const planName = order.lines[0]?.planName ?? 'Plan';
  const priceNet = order.totalPriceNet ?? order.lines[0]?.priceNet ?? null;
  const eligible = order.eligibilityResult?.eligible ?? true;

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={5} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Podsumowanie
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

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <div className="space-y-6">
            {company && (
              <SummaryDataCard
                title="Zamawiający"
                editLabel="Edytuj"
                editHref={withOrderId('/checkout/company-data', orderId)}
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
                editLabel="Edytuj"
                editHref={withOrderId('/checkout/personal-data', orderId)}
                rows={[
                  { label: 'Imię', value: personal.firstName },
                  { label: 'Nazwisko', value: personal.lastName },
                  { label: 'E-mail Firmowy', value: personal.email },
                  { label: 'Numer telefonu', value: personal.phone },
                ]}
              />
            )}
          </div>
          <SummaryPlanCard
            planName={planName}
            priceNet={priceNet}
            billingCycle={order.billingCycle}
          />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void handleConfirm(); }}>
          <FormActions
            onBack={() => window.location.assign(withOrderId('/checkout/payment-method', orderId))}
            submitLabel="Zamawiam z obowiązkiem zapłaty"
            submitting={confirming}
            submittingLabel="Potwierdzanie…"
          />
        </form>
      </div>
    </div>
  );
}
