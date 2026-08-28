import { useEffect, useState } from 'react';
import { SupplierLoadError, SupplierLoading, SupplierNotice } from './SupplierNotice';
import { getInvitation } from '../../lib/api/supplier-onboarding';
import { pluralPl } from '../../lib/format/plural';
import { navigateForward } from '../../lib/state/checkout-transition';
import { noticeVariantForError } from '../../lib/supplier/guards';
import { startRegistration } from '../../lib/supplier/registration';
import { translateApiError } from '../../lib/errors/translate';
import type { InvitationResponseDto } from '../../lib/api/types/supplier-onboarding';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';

type Phase =
  | { name: 'loading' }
  | { name: 'ready'; invitation: InvitationResponseDto }
  | { name: 'notice'; variant: SupplierNoticeVariant; invitation: InvitationResponseDto | null }
  | { name: 'error'; message: string };

function readToken(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

export function InvitationWelcome() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setPhase({ name: 'notice', variant: 'invitation-invalid', invitation: null });
      return;
    }

    // Mocki nie obsługują wariantu grantowego. Bez tej blokady realny POST /register
    // skleiłby się z mockowanym wizardem i dawał mylące błędy.
    if (import.meta.env.PUBLIC_USE_MOCK_ORDERS === 'true') {
      setPhase({
        name: 'error',
        message: 'Rejestracja dostawcy wymaga PUBLIC_USE_MOCK_ORDERS=false — mocki nie obsługują tego wariantu.',
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Czysty odczyt (§2) — nie tworzy zamówienia i nie odnotowuje niczego w lejku.
        const invitation = await getInvitation(token);
        if (cancelled) return;
        setPhase({ name: 'ready', invitation });
      } catch (err) {
        if (cancelled) return;
        const variant = noticeVariantForError(err);
        if (variant) {
          setPhase({ name: 'notice', variant, invitation: null });
          return;
        }
        setPhase({ name: 'error', message: translateApiError(err).message });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleStart = async () => {
    const token = readToken();
    if (!token || phase.name !== 'ready') return;
    const { invitation } = phase;
    setRegistering(true);
    // Dopiero TO wywołanie odnotowuje „rejestracja rozpoczęta" u podmiotu wiodącego (§4).
    const result = await startRegistration(token, invitation);
    if (result.kind === 'wizard') {
      navigateForward(result.path);
      return;
    }
    setPhase({ name: 'notice', variant: result.variant, invitation });
    setRegistering(false);
  };

  if (phase.name === 'loading') return <SupplierLoading label="Sprawdzamy zaproszenie…" />;
  if (phase.name === 'error') return <SupplierLoadError message={phase.message} />;
  if (phase.name === 'notice') {
    return (
      <SupplierNotice
        variant={phase.variant}
        leadingEntityName={phase.invitation?.leadingEntityName ?? null}
      />
    );
  }

  const { invitation } = phase;
  const inviter = invitation.leadingEntityName.length > 0 ? invitation.leadingEntityName : null;
  const manyRelations = invitation.invitedRelationshipsCount > 1;

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-2xl font-['Plus_Jakarta_Sans',sans-serif]">
        <h1 className="text-4xl font-bold text-black">
          {inviter ? `${inviter} zaprasza Cię do monitoringu bezpieczeństwa` : 'Zaproszenie do monitoringu bezpieczeństwa'}
        </h1>

        <p className="mt-4 text-base leading-relaxed text-[#413f3b]">
          Twój kontrahent sprawdza, czy firmy, z którymi współpracuje, są odporne na ataki. Dzięki temu
          zaproszeniu dostajesz od niego <strong>bezpłatny plan Standard</strong> — to on za niego płaci,
          Ty nie podajesz żadnych danych do płatności.
        </p>

        {manyRelations && (
          <p className="mt-4 rounded-[8px] bg-[#F8F7F4] p-4 text-sm text-[#413f3b]">
            Ta rejestracja obejmuje wszystkie {invitation.invitedRelationshipsCount}{' '}
            {pluralPl(invitation.invitedRelationshipsCount, 'zaproszenie', 'zaproszenia', 'zaproszeń')}, które na
            Ciebie czekają — wystarczy wypełnić formularz raz.
          </p>
        )}

        <div className="mt-8 rounded-[12px] border border-[#E4E2DF] p-6">
          <h2 className="text-lg font-semibold text-black">Co się teraz stanie</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[#413f3b]">
            <li>Uzupełnisz dane firmy — NIP mamy już z zaproszenia.</li>
            <li>Podasz swoje dane kontaktowe i zaakceptujesz zgody.</li>
            <li>Potwierdzisz rejestrację — bez płatności.</li>
            <li>
              Wyślemy link aktywacyjny na <strong>adres e-mail, który podasz w formularzu</strong>;
              ustawisz hasło i potwierdzisz numer telefonu kodem SMS.
            </li>
          </ol>
        </div>

        <div className="mt-8 rounded-[12px] bg-[#F8F7F4] p-6">
          <p className="text-sm text-[#6B6965]">Firma</p>
          <p className="text-lg font-semibold text-black">{invitation.organization.legalName}</p>
          <p className="mt-1 text-sm text-[#6B6965]">NIP {invitation.nip}</p>
        </div>

        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={registering}
          className="mt-8 w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {registering ? 'Przygotowujemy formularz…' : 'Rozpocznij rejestrację'}
        </button>
      </div>
    </div>
  );
}
