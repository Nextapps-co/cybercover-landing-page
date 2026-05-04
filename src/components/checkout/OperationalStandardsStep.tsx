import { useEffect, useState } from 'react';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { StandardQuestion } from './StandardQuestion';
import { getOrderSession } from '../../lib/state/order-session';
import { saveFormState, getFormState } from '../../lib/state/form-persistence';
import { canAccessStep } from '../../lib/state/checkout-navigation';
import { getOrder, getOperationalStandardsSchema, submitOperationalStandards } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { validateOperationalStandards } from '../../lib/validation/operational-standards';
import type {
  OperationalStandardsSchemaResponseDto,
  EligibilityContributionDto,
} from '../../lib/api/types/order';

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

export function OperationalStandardsStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [schema, setSchema] = useState<OperationalStandardsSchemaResponseDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [eligibilityWarning, setEligibilityWarning] = useState<EligibilityContributionDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    setOrderId(id);

    (async () => {
      try {
        const [order, schemaRes] = await Promise.all([
          getOrder(id),
          getOperationalStandardsSchema(id),
        ]);
        if (cancelled) return;
        if (!canAccessStep(3, order.checkoutProgress)) {
          const next = !order.checkoutProgress.hasCompanyData ? 'company-data' : 'personal-data';
          window.location.assign(`/checkout/${next}?orderId=${encodeURIComponent(id)}`);
          return;
        }
        setSchema(schemaRes);
        const draft = getFormState<{ answers: Record<string, string> }>('operational-standards');
        if (draft?.answers) setAnswers(draft.answers);
        setHydrating(false);
      } catch (err) {
        if (cancelled) return;
        const t = translateApiError(err);
        if (err instanceof ApiError && err.code === 'ORDER_NOT_FOUND') {
          window.location.assign('/cennik');
          return;
        }
        setHydrationError(t.message);
        setHydrating(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleAnswer = (questionKey: string, answerKey: string) => {
    setAnswers(prev => ({ ...prev, [questionKey]: answerKey }));
    setQuestionErrors(prev => {
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !schema) return;

    const errors = validateOperationalStandards(answers, schema.questions);
    setQuestionErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitOperationalStandards(orderId, { answers });
      saveFormState('operational-standards', { answers });
      if (!result.eligible) {
        setEligibilityWarning(result.contributions.filter(c => !c.met));
        // Per spec, ineligibility doesn't block — we navigate.
      }
      window.location.assign(`/checkout/payment-method?orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
      const t = translateApiError(err);
      if (err instanceof ApiError && err.code === 'ORDER_NOT_FOUND') {
        window.location.assign('/cennik');
        return;
      }
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  if (hydrating) {
    return <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">Ładowanie zamówienia…</div>;
  }
  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">Wróć do cennika</a>
      </div>
    );
  }
  if (!schema) return null;

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={3} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Standardy operacyjne
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            {eligibilityWarning && (
              <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-4 mb-6 font-['Plus_Jakarta_Sans',sans-serif] text-sm text-amber-800" role="alert">
                <p className="font-semibold">Twoje odpowiedzi wskazują obszary do uzupełnienia.</p>
                <p className="mt-1">Możesz kontynuować — skontaktujemy się, by pomóc:</p>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  {eligibilityWarning.map(c => (
                    <li key={c.key}>{c.label}</li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="rounded-[12px] bg-[#f8f7f4] p-4 font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B6965]">
                <p>Tych danych potrzebujemy do aktywacji ochrony ubezpieczeniowej.</p>
                <p className="mt-2">
                  Wiemy, że część odpowiedzi będzie „nie" lub „nie wiem", więc możesz to potwierdzić w późniejszym
                  terminie, a nawet skonsultować z nami swój stan faktyczny.
                </p>
              </div>

              {schema.questions.map(q => (
                <StandardQuestion
                  key={q.key}
                  question={q}
                  answerOptions={schema.answerOptions}
                  answer={answers[q.key]}
                  onChange={a => handleAnswer(q.key, a)}
                  error={questionErrors[q.key]}
                  required
                />
              ))}

              <FormActions
                onBack={() => window.location.assign(`/checkout/personal-data?orderId=${encodeURIComponent(orderId ?? '')}`)}
                submitLabel="Dalej"
                submitting={submitting}
              />
            </form>
          </div>

          <aside className="lg:col-span-1">
            <OrderSummaryAside />
          </aside>
        </div>
      </div>
    </div>
  );
}
