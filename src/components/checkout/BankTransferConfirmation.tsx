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

type Status = 'hydrating' | 'ready' | 'error' | 'invalid-token';

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    orderId: params.get('orderId'),
    token: params.get('token'),
  };
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

    (async () => {
      try {
        const res = await getOrderConfirmation(orderId, token);
        if (cancelled) return;
        setData(res);
        // Clean up session/form state — order is now finalized
        clearOrderSession();
        clearFormState();
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.code === 'INVALID_CONFIRMATION_ACCESS' || err.code === 'ORDER_NOT_FOUND')) {
          setStatus('invalid-token');
          return;
        }
        setErrorMessage(translateApiError(err).message);
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (status === 'hydrating') {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Ładowanie potwierdzenia…</div>;
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
        <div className="mt-4 text-left">
          <BankTransferDetails proforma={data.proforma} payment={data.payment} />
        </div>
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
