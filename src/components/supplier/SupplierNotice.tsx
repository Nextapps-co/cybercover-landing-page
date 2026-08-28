import { useState } from 'react';
import { navigateForward } from '../../lib/state/checkout-transition';
import { resumeRegistrationFromSession } from '../../lib/supplier/registration';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';

interface Props {
  variant: SupplierNoticeVariant;
  /** Nazwa podmiotu zapraszającego — używana tam, gdzie odsyłamy użytkownika do niego. */
  leadingEntityName?: string | null;
}

const SUPPORT_EMAIL = 'support@cybercover.pl';

const TONE_CLASSES: Record<'neutral' | 'warning' | 'error', string> = {
  neutral: 'border-[#E4E2DF] bg-[#F8F7F4] text-[#0D0D0D]',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-800',
};

interface NoticeCopy {
  title: string;
  paragraphs: string[];
  tone: 'neutral' | 'warning' | 'error';
}

function copyFor(variant: SupplierNoticeVariant, leadingEntityName?: string | null): NoticeCopy {
  const inviter = leadingEntityName && leadingEntityName.length > 0 ? leadingEntityName : 'firmę, która Cię zaprosiła';
  switch (variant) {
    case 'invitation-invalid':
      return {
        title: 'To zaproszenie jest nieaktualne',
        paragraphs: [
          `Link stracił ważność albo został zastąpiony nowym. Skontaktuj się z ${inviter} — wyśle Ci aktualne zaproszenie.`,
        ],
        tone: 'warning',
      };
    case 'already-registered':
      return {
        title: 'Rejestracja jest już zakończona',
        paragraphs: [
          // Adresu użytego w tamtej rejestracji nie znamy — podał go wtedy użytkownik
          // w formularzu, a my mamy tu tylko dane z zaproszenia.
          'Link aktywacyjny wysłaliśmy na adres e-mail podany przy rejestracji. Sprawdź skrzynkę — również folder ze spamem.',
          `To nie Ty rejestrowałeś tę firmę? Skontaktuj się z ${inviter}.`,
        ],
        tone: 'neutral',
      };
    case 'config-error':
      return {
        title: 'Chwilowo nie możemy dokończyć rejestracji',
        paragraphs: [
          'Po naszej stronie brakuje ustawień potrzebnych do rejestracji. To nie jest błąd po Twojej stronie.',
          `Napisz na ${SUPPORT_EMAIL} — zajmiemy się tym i damy znać, gdy będzie można spróbować ponownie.`,
        ],
        tone: 'error',
      };
    case 'order-state':
      return {
        title: 'Musimy zacząć ten krok jeszcze raz',
        paragraphs: ['Twoje zgłoszenie zmieniło stan. Kliknij poniżej — wrócimy do miejsca, w którym skończyłeś.'],
        tone: 'warning',
      };
    case 'no-session':
      return {
        title: 'Otwórz link z zaproszenia',
        paragraphs: [
          'Nie mamy w tej przeglądarce rozpoczętej rejestracji. Wejdź ponownie z linku, który dostałeś mailem — wrócisz dokładnie tam, gdzie skończyłeś.',
        ],
        tone: 'neutral',
      };
    case 'inconsistent-order':
      return {
        title: 'Coś jest nie tak z tym zgłoszeniem',
        paragraphs: [
          'Nie możemy bezpiecznie dokończyć rejestracji w tym trybie.',
          `Napisz na ${SUPPORT_EMAIL} — sprawdzimy, co się stało, i pomożemy dokończyć.`,
        ],
        tone: 'error',
      };
    case 'rate-limited':
      return {
        title: 'Za dużo prób',
        paragraphs: ['Odczekaj chwilę i spróbuj ponownie — zabezpieczenie chwilowo wstrzymało kolejne zapytania.'],
        tone: 'warning',
      };
    case 'storage-blocked':
      return {
        title: 'Twoja przeglądarka blokuje zapisywanie danych',
        paragraphs: [
          'Nie możemy zapamiętać rozpoczętej rejestracji, więc kolejne kroki nie zadziałają.',
          'Wyłącz tryb prywatny albo zezwól tej stronie na zapisywanie danych, a potem otwórz link z zaproszenia jeszcze raz.',
        ],
        tone: 'warning',
      };
  }
}

export function SupplierNotice({ variant, leadingEntityName }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [fallbackVariant, setFallbackVariant] = useState<SupplierNoticeVariant | null>(null);
  const effective = fallbackVariant ?? variant;
  const copy = copyFor(effective, leadingEntityName);

  const handleRetry = async () => {
    setRetrying(true);
    const result = await resumeRegistrationFromSession();
    if (result.kind === 'wizard') {
      navigateForward(result.path);
      return;
    }
    setFallbackVariant(result.variant);
    setRetrying(false);
  };

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-xl font-['Plus_Jakarta_Sans',sans-serif]">
        <div className={`rounded-[12px] border p-6 ${TONE_CLASSES[copy.tone]}`} role="status">
          <h1 className="text-xl font-bold">{copy.title}</h1>
          {copy.paragraphs.map((text, i) => (
            <p key={i} className="mt-3 text-sm leading-relaxed">{text}</p>
          ))}
        </div>

        {effective === 'order-state' && (
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="mt-6 w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? 'Sprawdzamy…' : 'Spróbuj ponownie'}
          </button>
        )}

        {(effective === 'config-error' || effective === 'inconsistent-order') && (
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-6 block rounded-[80px] border border-[#E4E2DF] bg-white px-7 py-3 text-center text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
          >
            Napisz do nas
          </a>
        )}

        <a href="/" className="mt-4 block text-center text-sm text-[#6B6965] underline">
          Wróć na stronę główną
        </a>
      </div>
    </div>
  );
}

/** Pełnoekranowy loader — ten sam wygląd co w płatnym wizardzie. */
export function SupplierLoading({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">
      {label}
    </div>
  );
}

/** Błąd, który NIE przerywa lejka na stałe (np. sieć) — z możliwością ponowienia. */
export function SupplierLoadError({ message }: { message: string }) {
  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-xl font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="rounded-[12px] border border-red-300 bg-red-50 p-6" role="alert">
          <h1 className="text-lg font-semibold text-red-800">Nie udało się wczytać danych</h1>
          <p className="mt-2 text-sm text-red-700">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Spróbuj ponownie
        </button>
      </div>
    </div>
  );
}
