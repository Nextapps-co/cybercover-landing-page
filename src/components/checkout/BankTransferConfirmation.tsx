import { useEffect, useState } from 'react';
import { ProformaDownload } from './ProformaDownload';
import { BankTransferDetails } from './BankTransferDetails';
import { SuccessAnimation } from './SuccessAnimation';
import { FormAlert } from './FormAlert';
import { getOrderConfirmation } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { clearOrderSession } from '../../lib/state/order-session';
import { clearFormState } from '../../lib/state/form-persistence';
import type { OrderConfirmationResponseDto } from '../../lib/api/types/order';

// Proforma jest generowana asynchronicznie po stronie backendu. Dopóki nie jest
// gotowa, /confirmation zwraca 503 ("Proforma invoice not yet available"). Zamiast
// pokazywać błąd, pollujemy — analogicznie do flow kartowego (SuccessStatus.tsx).
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;
const PROFORMA_PENDING_HTTP_STATUS = 503;

type Status = 'hydrating' | 'waiting' | 'ready' | 'error' | 'invalid-token' | 'timeout';

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    orderId: params.get('orderId'),
    token: params.get('token'),
  };
}

function isProformaPending(err: unknown): boolean {
  return err instanceof ApiError && err.httpStatus === PROFORMA_PENDING_HTTP_STATUS;
}

export function BankTransferConfirmation() {
  const [status, setStatus] = useState<Status>('hydrating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<OrderConfirmationResponseDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { orderId, token } = readUrlParams();
    if (!orderId || !token) {
      setStatus('invalid-token');
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const stopTimers = () => {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
    };

    const tick = async () => {
      try {
        const res = await getOrderConfirmation(orderId, token);
        if (cancelled) return;
        stopTimers();
        setData(res);
        // Clean up session/form state — order is now finalized
        clearOrderSession();
        clearFormState();
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        // Proforma jeszcze się generuje (503) — kontynuuj polling, pokaż spinner.
        if (isProformaPending(err)) {
          setStatus(current => (current === 'hydrating' ? 'waiting' : current));
          return;
        }
        stopTimers();
        if (err instanceof ApiError && (err.code === 'INVALID_CONFIRMATION_ACCESS' || err.code === 'ORDER_NOT_FOUND')) {
          setStatus('invalid-token');
          return;
        }
        setErrorMessage(translateApiError(err).message);
        setStatus('error');
      }
    };

    void tick();
    intervalId = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    timeoutId = setTimeout(() => {
      if (cancelled) return;
      stopTimers();
      // Jeśli mimo timeoutu nie udało się pobrać proformy — pokaż łagodny komunikat,
      // ale tylko gdy nadal czekamy (nie nadpisuj ready/error).
      setStatus(current => (current === 'hydrating' || current === 'waiting' ? 'timeout' : current));
    }, POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      stopTimers();
    };
  }, []);

  if (status === 'hydrating') {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Ładowanie potwierdzenia…</div>;
  }
  if (status === 'waiting') {
    return (
      <div className="bg-white py-12 px-4">
        <div className="mx-auto max-w-xl py-12 text-center font-['Plus_Jakarta_Sans',sans-serif]" role="status" aria-live="polite">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#FED64B] border-t-transparent" />
          <h2 className="mt-6 text-xl font-semibold text-[#0D0D0D]">Generujemy fakturę proforma…</h2>
          <p className="mt-2 text-sm text-[#6B6965]">
            To zajmie kilka sekund. Nie zamykaj tej strony.
          </p>
        </div>
      </div>
    );
  }
  if (status === 'timeout') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-6 text-center" role="alert">
          <h2 className="text-lg font-semibold text-amber-800">To trwa dłużej niż zwykle</h2>
          <p className="mt-2 text-sm text-amber-800">
            Twoja faktura proforma nadal się generuje. Odśwież stronę za chwilę albo sprawdź skrzynkę
            email — wyślemy potwierdzenie z fakturą, gdy tylko będzie gotowa. Jeśli nic nie dotrze w ciągu
            kilku minut, napisz na{' '}
            <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-block rounded-[80px] border border-amber-300 bg-white px-5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Odśwież stronę
          </button>
        </div>
      </div>
    );
  }
  if (status === 'invalid-token') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-xl mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-red-300 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Link nieprawidłowy lub wygasł</h2>
          <p className="mt-2 text-sm text-red-700">
            Sprawdź email z potwierdzeniem albo skontaktuj się z nami:{' '}
            <a className="underline" href="mailto:support@cybercover.pl">support@cybercover.pl</a>.
          </p>
          <a
            href="/cennik"
            className="mt-4 inline-block rounded-[80px] border border-red-300 bg-white px-5 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
          >
            Wróć do cennika
          </a>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={errorMessage ?? 'Wystąpił błąd'} />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="bg-white py-12 px-4">
      <div className="mx-auto max-w-2xl text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <h1 className="text-3xl font-bold text-[#0D0D0D]">Dziękujemy za zakup!</h1>
        <p className="mt-3 text-sm text-[#6B6965]">
          Ta decyzja to większe bezpieczeństwo Twoje i Twojej organizacji.
        </p>
        <div className="mt-6 text-left">
          <ProformaDownload proforma={data.proforma} customerEmail={data.customerEmail} />
        </div>
        {/* Sekcja „Dane do przelewu" tymczasowo ukryta.
        <div className="mt-4 text-left">
          <BankTransferDetails proforma={data.proforma} payment={data.payment} />
        </div>
        */}
        <h2 className="mt-10 text-xl font-semibold text-[#0D0D0D]">Wejdź do Portalu Klienta już teraz</h2>
        <p className="mt-2 text-xs text-[#6B6965]">
          Po zaksięgowaniu wpłaty otrzymasz dane logowania do Portalu Klienta na podany adres email.
        </p>
        <div className="mt-6">
          <SuccessAnimation />
        </div>
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
