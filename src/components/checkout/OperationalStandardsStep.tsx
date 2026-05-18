import { useEffect, useId, useState } from 'react';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { StandardQuestion } from './StandardQuestion';
import { getOrderSession, persistOsSkipped } from '../../lib/state/order-session';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import { saveFormState, getFormState } from '../../lib/state/form-persistence';
import { canAccessStep } from '../../lib/state/checkout-navigation';
import { getOrder, getOperationalStandardsSchema, submitOperationalStandards } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { validateOperationalStandards } from '../../lib/validation/operational-standards';
import type {
  OperationalStandardsSchemaResponseDto,
  EligibilityContributionDto,
  OrderResponseDto,
  StandardQuestionDto,
} from '../../lib/api/types/order';

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

// Question keys that are rendered as required-acknowledgement checkboxes
// instead of YES/NO/DONT_KNOW tiles. Checking the box submits 'YES' for that
// key; unchecked blocks form submission.
const HARDCODED_CHECKBOX_KEYS = new Set(['BUSINESS_NOT_HEALTHCARE', 'SWU_ACKNOWLEDGED']);

function isCheckboxQuestion(q: StandardQuestionDto): boolean {
  return HARDCODED_CHECKBOX_KEYS.has(q.key);
}

interface CheckboxAcknowledgeProps {
  question: StandardQuestionDto;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

function CheckboxAcknowledge({ question, checked, onChange, error }: CheckboxAcknowledgeProps) {
  const id = useId();
  const hasDescription = Boolean(question.description?.trim());
  return (
    <div className="flex gap-3 rounded-[12px] bg-[#f8f7f4] p-4">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.currentTarget.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-[#E4E2DF] accent-[#FED64B] cursor-pointer"
      />
      <div className="flex-1">
        <label htmlFor={id} className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#0D0D0D] leading-snug cursor-pointer">
          <span aria-hidden="true" className="mr-0.5 text-red-500">*</span>
          {question.label}
        </label>
        {hasDescription && (
          <p className="mt-1 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">{question.description}</p>
        )}
        {error && <p className="mt-1 text-xs text-red-500" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function OperationalStandardsStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
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

    // Per spec §5.5.3 — dwa orthogonalne powody pominięcia kroku OS:
    // 1. osSkipped: plan bez ubezpieczenia (np. Standard) — kept jak dzisiaj poniżej w schema check
    // 2. prefilledFields.includes('operationalStandards'): BE ma już dane z poprzedniego order'u
    // Druga ścieżka wymaga early redirect przed schema fetch.
    if (session.prefilledFields?.includes('operationalStandards')) {
      const target = session.wizardEntryStep ?? 'payment-method';
      navigateForward(`/checkout/${target}?orderId=${encodeURIComponent(id)}`);
      return;
    }

    setOrderId(id);

    (async () => {
      try {
        const [order, schemaRes] = await Promise.all([
          getOrder(id),
          getOperationalStandardsSchema(id),
        ]);
        if (cancelled) return;
        // §2.6 — Standard (no-insurance) plan: BE marks step as auto-skipped.
        // Jump straight to payment-method; rendering an empty form would let
        // the user submit and trigger 409 INVALID_ORDER_STATE on PATCH.
        persistOsSkipped(Boolean(schemaRes.skipped));
        if (schemaRes.skipped) {
          navigateForward(`/checkout/payment-method?orderId=${encodeURIComponent(id)}`);
          return;
        }
        if (!canAccessStep(3, order.checkoutProgress)) {
          const next = !order.checkoutProgress.hasCompanyData ? 'company-data' : 'personal-data';
          navigateBackward(`/checkout/${next}?orderId=${encodeURIComponent(id)}`);
          return;
        }
        setOrder(order);
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

    const regularQuestions = schema.questions.filter(q => !isCheckboxQuestion(q));
    const checkboxQuestions = schema.questions.filter(isCheckboxQuestion);

    const errors = validateOperationalStandards(answers, regularQuestions);
    for (const q of checkboxQuestions) {
      if (answers[q.key] !== 'YES') {
        errors[q.key] = 'Musisz potwierdzić, aby kontynuować';
      }
    }
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
      navigateForward(`/checkout/payment-method?orderId=${encodeURIComponent(orderId)}`);
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

              {schema.questions.filter(q => !isCheckboxQuestion(q)).map(q => (
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

              {schema.questions.some(isCheckboxQuestion) && (
                <div className="space-y-3 border-t border-[#E4E2DF] pt-6">
                  <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-semibold text-[#0D0D0D]">
                    Potwierdzenia
                  </p>
                  {schema.questions.filter(isCheckboxQuestion).map(q => (
                    <CheckboxAcknowledge
                      key={q.key}
                      question={q}
                      checked={answers[q.key] === 'YES'}
                      onChange={checked => handleAnswer(q.key, checked ? 'YES' : '')}
                      error={questionErrors[q.key]}
                    />
                  ))}
                </div>
              )}

              <FormActions
                onBack={() => navigateBackward(`/checkout/personal-data?orderId=${encodeURIComponent(orderId ?? '')}`)}
                submitLabel="Dalej"
                submitting={submitting}
              />
            </form>
          </div>

          <aside className="lg:col-span-1">
            <OrderSummaryAside order={order} />
          </aside>
        </div>
      </div>
    </div>
  );
}
