import { useEffect, useState } from 'react';
import { FormAlert } from './FormAlert';
import { StartOverDialog } from './StartOverDialog';
import { createStripeCheckoutSession, getOrder } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { navigateForward } from '../../lib/state/checkout-transition';
import { clearOrderSession } from '../../lib/state/order-session';
import { clearFormState } from '../../lib/state/form-persistence';
import {
  changePaymentToBankTransfer,
  startOverOrder,
  isPromoZeroOrder,
  canSwitchToBankTransfer,
} from '../../lib/state/checkout-recovery';
import type { OrderResponseDto } from '../../lib/api/types/order';

type Variant = 'cancelled' | 'resume';

const COPY: Record<Variant, { title: string; subtitle: string; primary: string }> = {
  cancelled: {
    title: 'Płatność anulowana',
    subtitle: 'Możesz spróbować ponownie albo wybrać inną metodę płatności.',
    primary: 'Spróbuj ponownie',
  },
  resume: {
    title: 'Masz niedokończoną płatność',
    subtitle: 'Twoje zamówienie czeka na opłacenie.',
    primary: 'Dokończ płatność',
  },
};

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId') ?? params.get('order_id');
}

export function ResumePaymentScreen({ variant }: { variant: Variant }) {
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [startOverOpen, setStartOverOpen] = useState(false);

  const copy = COPY[variant];

  useEffect(() => {
    let cancelled = false;
    const id = readOrderIdFromUrl();
    if (!id) {
      setHydrating(false);
      return;
    }

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

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = async () => {
    const id = readOrderIdFromUrl();
    if (!id) {
      window.location.assign('/cennik');
      return;
    }
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

  const handleChangeMethod = async () => {
    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    setSwitching(true);
    setError(null);
    const outcome = await changePaymentToBankTransfer(id);
    if (outcome.kind === 'switched') {
      navigateForward(
        `/checkout/bank-transfer?orderId=${encodeURIComponent(id)}&token=${encodeURIComponent(outcome.confirmationToken)}`,
      );
      return; // nawigacja w toku — nie zwalniamy switching
    }
    if (outcome.kind === 'not-switchable') {
      // Jednokierunkowe / już opłacone — odśwież stan, przycisk zniknie przez gating.
      try { setOrder(await getOrder(id)); } catch { /* ignore */ }
      setSwitching(false);
      return;
    }
    if (outcome.kind === 'not-found') { window.location.assign('/cennik'); return; }
    setError(translateApiError(outcome.error).message);
    setSwitching(false);
  };

  const handleSkipSetup = () => {
    const id = readOrderIdFromUrl();
    navigateForward(`/checkout/success${id ? `?orderId=${encodeURIComponent(id)}` : ''}`);
  };

  const handleStartOver = () => setStartOverOpen(true);

  const confirmStartOver = async () => {
    const id = readOrderIdFromUrl();
    if (!id) { clearOrderSession(); clearFormState(); window.location.assign('/cennik'); return; }
    setCancelling(true);
    const outcome = await startOverOrder(id);
    if (outcome.kind === 'already-paid') {
      // Wyścig — zapłacono w międzyczasie. Nie wracamy na /cennik.
      window.location.assign(`/checkout/success?orderId=${encodeURIComponent(id)}`);
      return;
    }
    // cancelled / not-found / error — w każdym przypadku czyścimy i wracamy na /cennik
    clearOrderSession();
    clearFormState();
    window.location.assign('/cennik');
  };

  if (hydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">
        Sprawdzamy status zamówienia…
      </div>
    );
  }
  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">
          Wróć do cennika
        </a>
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
              płatności. Aby kontynuować subskrypcję po okresie promocyjnym, dodaj kartę — możesz to zrobić teraz albo
              później w Portalu Klienta.
            </p>
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
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
            <h1 className="text-3xl font-bold text-[#0D0D0D]">{copy.title}</h1>
            <p className="text-sm text-[#6B6965]">{copy.subtitle}</p>
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Przekierowuję…' : copy.primary}
              </button>
              {order && canSwitchToBankTransfer(order) && (
                <button
                  type="button"
                  onClick={handleChangeMethod}
                  disabled={switching}
                  className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60"
                >
                  {switching ? 'Przełączanie…' : 'Zapłać przelewem bankowym'}
                </button>
              )}
              <button
                type="button"
                onClick={handleStartOver}
                className="rounded-[80px] px-7 py-3 text-base font-semibold text-[#6B6965] underline hover:text-[#0D0D0D]"
              >
                Zacznij od nowa
              </button>
            </div>
          </>
        )}
      </div>
      <StartOverDialog
        open={startOverOpen}
        busy={cancelling}
        onConfirm={confirmStartOver}
        onCancel={() => setStartOverOpen(false)}
      />
    </div>
  );
}
