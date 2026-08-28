import { useEffect, useState } from 'react';
import { SuccessAnimation } from '../checkout/SuccessAnimation';
import { pluralPl } from '../../lib/format/plural';
import { clearFormState } from '../../lib/state/form-persistence';
import { clearSupplierSession, loadSupplierSession } from '../../lib/state/supplier-session';

/**
 * Ekran TERMINALNY. Świadomie BEZ pollingu — po potwierdzeniu backend asynchronicznie
 * nadaje subskrypcję, adoptuje firmę, tworzy konto i wysyła mail aktywacyjny; FE nie ma
 * tu nic do roboty i nie powinien odpytywać o postęp (§6).
 */
export function SupplierSuccessScreen() {
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [relationsCount, setRelationsCount] = useState(0);

  useEffect(() => {
    // Odczyt PRZED czyszczeniem — sesja jest jedynym źródłem tej treści, bo ten ekran
    // celowo nie odpytuje backendu. `accountEmail` (adres podany w kroku 2) utrwala
    // krok potwierdzenia; brak pola oznacza sesję z przed zmiany kontraktu z 2026-08-27.
    const session = loadSupplierSession();
    if (session) {
      setAccountEmail(session.accountEmail ?? null);
      setRelationsCount(session.invitedRelationshipsCount);
    }
    clearSupplierSession();
    clearFormState('supplier-company-data');
    clearFormState('supplier-personal-data');
  }, []);

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-2xl py-4 text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <SuccessAnimation />

        <h1 className="mt-6 text-3xl font-bold text-[#0D0D0D]">Dziękujemy za rejestrację!</h1>

        {accountEmail ? (
          <p className="mt-6 text-base leading-relaxed text-[#413f3b]">
            Link aktywacyjny wysłaliśmy na adres{' '}
            <span className="font-semibold text-[#0D0D0D]">{accountEmail}</span>.
          </p>
        ) : (
          <p className="mt-6 text-base leading-relaxed text-[#413f3b]">
            Link aktywacyjny wysłaliśmy na adres e-mail, który podałeś w formularzu.
          </p>
        )}
        <p className="mt-2 text-sm text-[#6B6965]">
          Jeśli nie widzisz wiadomości, sprawdź folder ze spamem.
        </p>

        {relationsCount > 1 && (
          <p className="mt-4 text-sm text-[#6B6965]">
            Rejestracja obejmuje wszystkie {relationsCount}{' '}
            {pluralPl(relationsCount, 'zaproszenie', 'zaproszenia', 'zaproszeń')}, które na Ciebie czekały.
          </p>
        )}

        <div className="mt-8 rounded-[12px] bg-[#F8F7F4] p-6 text-left">
          <h2 className="text-base font-semibold text-[#0D0D0D]">Co dalej</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#413f3b]">
            <li>Kliknij link z wiadomości i ustaw hasło do konta.</li>
            <li>Potwierdź swój numer telefonu kodem, który wyślemy SMS-em.</li>
            <li>Zaakceptuj zgody — po tym kroku konto staje się aktywne.</li>
          </ol>
        </div>

        <a
          href="/"
          className="mt-8 inline-block rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Wróć na stronę główną
        </a>
      </div>
    </div>
  );
}
