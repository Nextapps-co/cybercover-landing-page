import { useEffect, useState } from 'react';
import { CheckoutProgressBar, type Step } from '../checkout/CheckoutProgressBar';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { SummaryDataCard } from '../checkout/SummaryDataCard';
import { getOrder } from '../../lib/api/orders';
import { completeWkConfig } from '../../lib/api/wk-config';
import { translateApiError } from '../../lib/errors/translate';
import { noticeVariantForError, recoveryForError } from '../../lib/wk/guards';
import type { CompanyDataResponseDto } from '../../lib/api/types/order';
import type { WkConfigResponseDto } from '../../lib/api/types/wk-config';
import type { Screen, WkNoticeVariant } from '../../lib/wk/types';

interface Props {
  orderId: string;
  config: WkConfigResponseDto;
  steps: Step[];
  osRequired: boolean;
  onAdvance: (next: WkConfigResponseDto) => void;
  onReload: () => Promise<void>;
  onNotice: (v: WkNoticeVariant) => void;
  onBack: (target: Screen) => void;
}

export function WkSummaryScreen({ orderId, config, steps, osRequired, onAdvance, onReload, onNotice, onBack }: Props) {
  const [company, setCompany] = useState<CompanyDataResponseDto | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const order = await getOrder(orderId, { anonymous: true });
        // WYŁĄCZNIE companyData. `order.personalData` należy do osoby, która
        // wypełniała formularz WCZEŚNIEJ — przy wznowieniu przez kogoś innego
        // z tej samej firmy pokazalibyśmy tu cudze imię, e-mail i telefon (§3.1 reguła 1).
        if (!cancelled) setCompany(order.companyData);
      } catch {
        // Podsumowanie bez danych firmy jest uboższe, ale domknięcie ma działać.
        // Trasy nie ma na liście wywołań tego lejka — patrz spec §9.1.
        if (!cancelled) setCompany(null);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const handleComplete = async () => {
    // Trasa jest idempotentna, ale `disabled` działa dopiero po commicie Reacta.
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const next = await completeWkConfig(orderId);
      // Odpowiedź jest w kształcie stanu, ze statusem PROVISIONING (§3.7).
      onAdvance(next);
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) { onNotice(variant); return; }

      // Trzy 409 z §5 to stany do odzyskania, nie awarie.
      const recovery = recoveryForError(err);
      if (recovery === 'personal-data') { onBack({ kind: 'personal-data' }); return; }
      if (recovery === 'reload-state') {
        // Inaczej niż pozostałe wczesne wyjścia z tego catch, ten NIE gwarantuje
        // odmontowania: świeży stan potrafi znowu wylądować na podsumowaniu (wyścig
        // z WK_CONFIG_CHECKOUT_INCOMPLETE), React pogodzi ten sam komponent w tym
        // samym miejscu drzewa i `submitting` przeżyje reload, blokując przycisk.
        setSubmitting(false);
        await onReload();
        return;
      }

      const t = translateApiError(err);
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  // Puste stringi z kontraktu (§6 reguła 4) liczą się jak `null` — inaczej karta
  // renderuje się z samymi kreskami, gdy partner nie przekazał żadnej tożsamości.
  const nonEmpty = (v: string | null | undefined): string => (v && v.trim().length > 0 ? v : '');
  const person = config.prefill;
  const fullName = person ? [nonEmpty(person.firstName), nonEmpty(person.lastName)].filter(Boolean).join(' ') : '';
  const email = person ? nonEmpty(person.email) : '';
  const personRows = fullName || email
    ? [
        { label: 'Imię i nazwisko', value: fullName || '—' },
        { label: 'E-mail', value: email || '—' },
      ]
    : [];

  return (
    <div className="bg-white px-4 py-12">
      {/* Jedna kolumna: nie ma ceny ani planu, więc nie ma podsumowania zamówienia.
          Boczna karta byłaby wypełniaczem. */}
      <div className="mx-auto max-w-3xl">
        <CheckoutProgressBar currentStep={osRequired ? 4 : 3} steps={steps} />

        <h1 className="mb-3 text-4xl font-bold text-black">Sprawdź i zakończ</h1>
        <p className="mb-10 max-w-[60ch] text-[#6B6965]">
          Po kliknięciu założymy konto firmy w CyberCover i przeniesiemy Cię do panelu.
        </p>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}

        {/* Jak w Task 11: FormActions to przycisk type="submit", więc potrzebuje <form>. */}
        <form onSubmit={e => { e.preventDefault(); void handleComplete(); }}>
          <div className="space-y-6">
            {company && (
              <SummaryDataCard
                title="Firma"
                rows={[
                  { label: 'NIP', value: company.nip },
                  { label: 'Nazwa', value: company.name },
                  { label: 'Adres', value: company.street },
                  { label: 'Miejscowość', value: `${company.postalCode} ${company.city}` },
                ]}
              />
            )}
            {personRows.length > 0 && <SummaryDataCard title="Osoba zarządzająca kontem" rows={personRows} />}
          </div>

          <div className="mt-8">
            <FormActions
              onBack={() => onBack({ kind: osRequired ? 'operational-standards' : 'personal-data' })}
              submitLabel="Zakończ konfigurację"
              submitting={submitting}
              submittingLabel="Kończymy…"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
