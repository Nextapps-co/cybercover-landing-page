import { useEffect, useState } from 'react';
import { CheckoutProgressBar } from '../checkout/CheckoutProgressBar';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { SummaryDataCard } from '../checkout/SummaryDataCard';
import { SupplierGrantSummary } from './SupplierGrantSummary';
import { SupplierLoadError, SupplierLoading, SupplierNotice } from './SupplierNotice';
import { SUPPLIER_STEPS } from './supplier-steps';
import { useSupplierStep } from './use-supplier-step';
import { confirmOrder, selectPaymentMethod } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/types/errors';
import { translateApiError } from '../../lib/errors/translate';
import { navigateBackward } from '../../lib/state/checkout-transition';
import { SUPPLIER_STEP_PATHS, SUPPLIER_SUCCESS_PATH } from '../../lib/state/supplier-navigation';
import { persistAccountEmail } from '../../lib/state/supplier-session';
import { noticeVariantForError } from '../../lib/supplier/guards';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';

export function SupplierConfirmStep() {
  const stepState = useSupplierStep(3);
  const [notice, setNotice] = useState<SupplierNoticeVariant | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Adres konta utrwalamy tutaj, bo ekran końcowy jest terminalny i nie wykonuje
  // żadnego requestu (§6) — inaczej nie miałby skąd wziąć adresu, na który backend
  // wysłał link aktywacyjny. Ten krok obejmuje obie ścieżki dojścia: przejście
  // na wprost oraz wznowienie linkiem zaproszeniowym prosto na potwierdzenie.
  useEffect(() => {
    if (stepState.phase !== 'ready') return;
    const email = stepState.order.personalData?.email;
    if (email) persistAccountEmail(email);
  }, [stepState]);

  const handleRegister = async () => {
    // Akcja terminalna (nadanie subskrypcji + mail aktywacyjny) — `disabled` na przycisku
    // działa dopiero po commicie Reacta, więc podwójne kliknięcie blokujemy tutaj.
    if (submitting) return;
    if (stepState.phase !== 'ready') return;
    const { session, order } = stepState;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Krok formalny, ale obowiązkowy (§5.5): checkout nie jest kompletny bez metody.
      // Nie ma dla niego UI — leci w tle razem z kliknięciem „Zarejestruj się".
      // GRANT i nic innego: zwykłe zamówienie odrzuci GRANT, grantowe odrzuci resztę.
      if (!order.checkoutProgress.hasPaymentMethod) {
        await selectPaymentMethod(session.orderId, { paymentMethod: 'GRANT' }, { anonymous: true });
      }

      // Oczekiwane: status PENDING_ALLOCATION, paymentRequired false, confirmationToken null.
      // Zero Stripe'a, zero proformy — niczego z odpowiedzi nie potrzebujemy (§6).
      await confirmOrder(session.orderId, { anonymous: true });

      // Pełne przeładowanie zamiast routera przejść: zamówienie jest już potwierdzone
      // serwerowo, więc to przejście MUSI dojść do skutku — `navigate()` jest
      // fire-and-forget i przy błędzie zostawiłoby użytkownika na zablokowanym przycisku.
      window.location.assign(SUPPLIER_SUCCESS_PATH);
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) {
        setNotice(variant);
        return;
      }
      if (err instanceof ApiError && err.code === 'INCOMPLETE_CHECKOUT') {
        navigateBackward(
          !order.checkoutProgress.hasCompanyData
            ? SUPPLIER_STEP_PATHS.COMPANY_DATA
            : SUPPLIER_STEP_PATHS.PERSONAL_DATA,
        );
        return;
      }
      const t = translateApiError(err);
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  if (notice) {
    return (
      <SupplierNotice
        variant={notice}
        leadingEntityName={stepState.phase === 'ready' ? stepState.session.leadingEntityName : null}
      />
    );
  }
  if (stepState.phase === 'loading') return <SupplierLoading label="Wczytujemy Twoją rejestrację…" />;
  if (stepState.phase === 'notice') return <SupplierNotice variant={stepState.variant} />;
  if (stepState.phase === 'error') return <SupplierLoadError message={stepState.message} />;

  const { session, order } = stepState;
  const company = order.companyData;
  const personal = order.personalData;

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <CheckoutProgressBar currentStep={3} steps={SUPPLIER_STEPS} />

        <h1 className="mb-12 font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-bold text-black">
          Sprawdź i potwierdź
        </h1>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}

        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {company && (
              <SummaryDataCard
                title="Organizacja"
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
                  { label: 'E-mail konta', value: personal.email },
                  { label: 'Numer telefonu', value: personal.phone },
                ]}
              />
            )}
            <p className="rounded-[8px] bg-[#F8F7F4] p-4 text-sm leading-relaxed text-[#413f3b]">
              Po kliknięciu „Zarejestruj się" wyślemy link aktywacyjny na adres{' '}
              <span className="font-semibold text-[#0D0D0D]">{personal?.email ?? 'podany w formularzu'}</span>.
              Nie ma tu żadnej płatności — plan opłaca firma, która Cię zaprosiła.
            </p>
          </div>

          <aside className="lg:col-span-1">
            <SupplierGrantSummary
              leadingEntityName={session.leadingEntityName}
              companyName={session.legalName}
            />
          </aside>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void handleRegister(); }}>
          <FormActions
            onBack={() => navigateBackward(SUPPLIER_STEP_PATHS.PERSONAL_DATA)}
            submitLabel="Zarejestruj się"
            submitting={submitting}
            submittingLabel="Rejestrujemy…"
          />
        </form>
      </div>
    </div>
  );
}
