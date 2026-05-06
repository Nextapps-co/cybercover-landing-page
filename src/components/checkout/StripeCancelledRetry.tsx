import { useEffect, useState } from 'react';
import { FormAlert } from './FormAlert';
import { createStripeCheckoutSession, getOrder } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import type { OrderResponseDto } from '../../lib/api/types/order';

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId') ?? params.get('order_id');
}

function isPromoZeroOrder(order: OrderResponseDto): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner = d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' || d.kind === 'PARTNER_TIMEBOUND';
  return isPartner && d.priceAfterDiscount === 0;
}

export function StripeCancelledRetry() {
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = readOrderIdFromUrl();
    if (!id) { setHydrating(false); return; }

    (async () => {
      try {
        const o = await getOrder(id);
        if (cancelled) return;
        setOrder(o);
        setHydrating(false);
      } catch (err) {
        if (cancelled) return;
        setHydrationError(translateApiError(err).message);
        setHydrating(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleRetry = async () => {
    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    setRetrying(true);
    setError(null);
    try {
      const session = await createStripeCheckoutSession(id);
      window.location.href = session.url;
    } catch (err) {
      setError(translateApiError(err).message);
      setRetrying(false);
    }
  };

  const handleChangeMethod = () => {
    const id = readOrderIdFromUrl();
    navigateBackward(`/checkout/payment-method${id ? `?orderId=${encodeURIComponent(id)}` : ''}`);
  };

  const handleSkipSetup = () => {
    const id = readOrderIdFromUrl();
    navigateForward(`/checkout/success${id ? `?orderId=${encodeURIComponent(id)}` : ''}`);
  };

  if (hydrating) {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Sprawdzamy status zamówienia…</div>;
  }
  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">Wróć do cennika</a>
      </div>
    );
  }

  const promoZero = order ? isPromoZeroOrder(order) : false;

  return (
    <div className="bg-white py-12 px-4">
      <div className="mx-auto max-w-xl text-center font-['Plus_Jakarta_Sans',sans-serif] space-y-4">
        {promoZero ? (
          <>
            <h1 className="text-3xl font-bold text-[#0D0D0D]">Twoja subskrypcja jest aktywna</h1>
            <p className="text-sm text-[#6B6965]">
              Promocja partnerska pokrywa całą kwotę w okresie startowym, więc nie potrzebowaliśmy pobierać teraz
              płatności. Aby kontynuować subskrypcję po okresie promocyjnym, dodaj kartę — możesz to zrobić teraz
              albo później w Portalu Klienta.
            </p>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Przekierowuję…' : 'Dodaj kartę teraz'}
              </button>
              <button
                type="button"
                onClick={handleSkipSetup}
                className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
              >
                Pomiń — zrobię później
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[#0D0D0D]">Płatność anulowana</h1>
            <p className="text-sm text-[#6B6965]">
              Możesz spróbować ponownie albo wybrać inną metodę płatności.
            </p>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Przekierowuję…' : 'Spróbuj ponownie'}
              </button>
              <button
                type="button"
                onClick={handleChangeMethod}
                className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
              >
                Zmień metodę płatności
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
