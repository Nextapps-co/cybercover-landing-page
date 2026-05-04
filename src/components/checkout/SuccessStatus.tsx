import { useEffect, useRef, useState } from 'react';
import { SuccessAnimation } from './SuccessAnimation';
import { FormAlert } from './FormAlert';
import { getOrder } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { clearOrderSession } from '../../lib/state/order-session';
import { clearFormState } from '../../lib/state/form-persistence';
import type { OrderResponseDto, OrderStatus } from '../../lib/api/types/order';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

const TERMINAL_STATUSES: OrderStatus[] = ['FULFILLED', 'CANCELLED', 'CLOSED'];

type Phase = 'no-order-id' | 'polling' | 'fulfilled' | 'timeout' | 'failed' | 'error';

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    orderId: params.get('orderId'),
    sessionId: params.get('sessionId'),
  };
}

function formatPriceMinor(grosze: number | null): string {
  if (grosze === null) return '—';
  const zlote = grosze / 100;
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(zlote)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

function billingCycleLabel(cycle: 'MONTHLY' | 'ANNUAL'): string {
  return cycle === 'ANNUAL' ? 'rozliczenie roczne' : 'rozliczenie miesięczne';
}

function isPromoZeroOrder(order: OrderResponseDto): boolean {
  const d = order.discount;
  if (!d) return false;
  const isPartner = d.kind === 'PARTNER_FLAT' || d.kind === 'PARTNER_COMPOSITE' || d.kind === 'PARTNER_TIMEBOUND';
  return isPartner && d.priceAfterDiscount === 0;
}

export function SuccessStatus() {
  const [phase, setPhase] = useState<Phase>('polling');
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const { orderId, sessionId } = readUrlParams();
    sessionIdRef.current = sessionId;
    if (!orderId) {
      setPhase('no-order-id');
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const stopTimers = () => {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    };

    const tick = async () => {
      try {
        const fetched = await getOrder(orderId);
        if (cancelled) return;
        setOrder(fetched);
        if (fetched.status === 'FULFILLED') {
          stopTimers();
          setPhase('fulfilled');
          // Cleanup once order is FULFILLED
          clearOrderSession();
          clearFormState();
          return;
        }
        if (fetched.status === 'CANCELLED' || fetched.status === 'CLOSED') {
          stopTimers();
          setPhase('failed');
        }
      } catch (err) {
        if (cancelled) return;
        stopTimers();
        setErrorMessage(translateApiError(err).message);
        setPhase('error');
      }
    };

    void tick();
    intervalId = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    timeoutId = setTimeout(() => {
      if (cancelled) return;
      stopTimers();
      setPhase(current => TERMINAL_STATUSES.includes(order?.status ?? 'DRAFT') ? current : 'timeout');
    }, POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stopTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'no-order-id') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-6 text-center" role="alert">
          <h2 className="text-lg font-semibold text-amber-800">Brak danych zamówienia</h2>
          <p className="mt-2 text-sm text-amber-800">
            Otwórz link z potwierdzenia email lub skontaktuj się z{' '}
            <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>.
          </p>
          <a
            href="/cennik"
            className="mt-4 inline-block rounded-[80px] border border-amber-300 bg-white px-5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Wróć do cennika
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'polling') {
    return (
      <div className="bg-white py-12 px-4">
        <div className="mx-auto max-w-xl py-12 text-center font-['Plus_Jakarta_Sans',sans-serif]" role="status" aria-live="polite">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#FED64B] border-t-transparent" />
          <h2 className="mt-6 text-xl font-semibold text-[#0D0D0D]">Przetwarzamy Twoje zamówienie…</h2>
          <p className="mt-2 text-sm text-[#6B6965]">
            To zajmie kilka sekund. Nie zamykaj tej strony.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Nie udało się sprawdzić statusu" message={errorMessage ?? ''} />
        <p className="mt-2 text-xs text-[#6B6965] text-center">
          Sprawdź email z potwierdzeniem lub skontaktuj się z{' '}
          <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>.
        </p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-red-300 bg-red-50 p-6 text-center" role="alert">
          <h2 className="text-lg font-semibold text-red-800">Zamówienie zostało anulowane</h2>
          <p className="mt-2 text-sm text-red-700">
            Skontaktuj się z{' '}
            <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>{' '}
            — pomożemy ustalić co poszło nie tak.
          </p>
          {order && <OrderRefBlock orderId={order.orderId} sessionId={sessionIdRef.current} />}
        </div>
      </div>
    );
  }

  if (phase === 'timeout') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-6 text-center" role="alert">
          <h2 className="text-lg font-semibold text-amber-800">To trwa dłużej niż zwykle</h2>
          <p className="mt-2 text-sm text-amber-800">
            Twoje zamówienie nadal jest przetwarzane. Sprawdź skrzynkę email — wyślemy potwierdzenie,
            gdy tylko proces się zakończy. Jeśli nic nie dotrze w ciągu kilku minut, napisz na{' '}
            <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>.
          </p>
          {order && <OrderRefBlock orderId={order.orderId} sessionId={sessionIdRef.current} />}
        </div>
      </div>
    );
  }

  if (!order) return null;

  const planName = order.lines[0]?.planName ?? 'Plan';
  const netGrosze = order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0;
  const vatGrosze = Math.round(netGrosze * 0.23);
  const grossGrosze = netGrosze + vatGrosze;
  const customerEmail = order.personalData?.email ?? null;
  const eligible = order.eligibilityResult?.eligible ?? true;
  const promoZero = isPromoZeroOrder(order);

  return (
    <div className="bg-white py-12 px-4">
      <div className="mx-auto max-w-2xl py-4 text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <SuccessAnimation />
        <h1 className="mt-6 text-3xl font-bold text-[#0D0D0D]">Dziękujemy za zakup!</h1>
        <p className="mt-3 text-sm text-[#6B6965]">
          Ta decyzja to większe bezpieczeństwo Twoje i Twojej organizacji.
        </p>

        {customerEmail && (
          <p className="mt-6 text-sm text-[#6B6965]">
            Magic link do portalu wysłaliśmy na adres{' '}
            <span className="font-semibold text-[#0D0D0D]">{customerEmail}</span>.
          </p>
        )}

        <dl className="mx-auto mt-8 grid max-w-md grid-cols-1 gap-3 text-left sm:grid-cols-2">
          <div className="rounded-[12px] bg-[#F8F7F4] p-4">
            <dt className="text-xs uppercase tracking-wide text-[#6B6965]">Plan</dt>
            <dd className="mt-1 text-base font-semibold text-[#0D0D0D]">{planName}</dd>
            <dd className="text-xs text-[#6B6965]">{billingCycleLabel(order.billingCycle)}</dd>
          </div>
          <div className="rounded-[12px] bg-[#F8F7F4] p-4">
            <dt className="text-xs uppercase tracking-wide text-[#6B6965]">
              {promoZero ? 'Do zapłaty teraz' : 'Łącznie'}
            </dt>
            {promoZero ? (
              <dd className="mt-1 text-base font-semibold text-[#0D0D0D]">0,00 zł</dd>
            ) : (
              <>
                <dd className="mt-1 text-base font-semibold text-[#0D0D0D]">
                  {formatPriceMinor(grossGrosze)} zł brutto
                </dd>
                <dd className="text-xs text-[#6B6965]">
                  netto {formatPriceMinor(netGrosze)} zł + VAT 23%
                </dd>
              </>
            )}
          </div>
        </dl>

        {!eligible && (
          <div className="mt-6 rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900" role="status">
            <p className="font-semibold">Twoja polisa będzie aktywna po uzupełnieniu standardów bezpieczeństwa.</p>
            <p className="mt-1">
              Zaloguj się do Portalu Klienta linkiem z emaila i zaktualizuj odpowiedzi —
              ochrona uruchomi się automatycznie, gdy spełnisz wymagane standardy.
            </p>
          </div>
        )}

        {promoZero && (
          <p className="mt-4 text-xs text-[#6B6965]">
            Twoja subskrypcja jest aktywna w okresie promocyjnym. Po jego zakończeniu naliczymy standardową opłatę.
          </p>
        )}

        <p className="mt-8 text-xs text-[#6B6965]">
          Numer zamówienia: <span className="font-mono text-[#0D0D0D]">{order.orderId}</span>
        </p>

        <a
          href="/"
          className="mt-8 inline-block rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Wróć do strony głównej
        </a>
      </div>
    </div>
  );
}

function OrderRefBlock({ orderId, sessionId }: { orderId: string; sessionId: string | null }) {
  return (
    <p className="mt-4 text-xs text-[#6B6965]">
      Numer zamówienia: <span className="font-mono">{orderId}</span>
      {sessionId && (
        <>
          <br />
          ID sesji: <span className="font-mono">{sessionId}</span>
        </>
      )}
    </p>
  );
}
