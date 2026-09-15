import { useEffect, useRef, useState } from 'react';
import { CheckoutProgressBar, type Step } from '../checkout/CheckoutProgressBar';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { StandardQuestion } from '../checkout/StandardQuestion';
import { WkLoading } from './WkNotice';
import { getOperationalStandardsSchema, submitOperationalStandards } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { noticeVariantForError } from '../../lib/wk/guards';
import { validateOperationalStandards } from '../../lib/validation/operational-standards';
import type { OperationalStandardsSchemaResponseDto } from '../../lib/api/types/order';
import type { Screen, WkNoticeVariant } from '../../lib/wk/types';

interface Props {
  orderId: string;
  steps: Step[];
  onReload: () => Promise<void>;
  onNotice: (v: WkNoticeVariant) => void;
  onBack: (target: Screen) => void;
}

export function WkOperationalStandardsScreen({ orderId, steps, onReload, onNotice, onBack }: Props) {
  const [schema, setSchema] = useState<OperationalStandardsSchemaResponseDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setAnswers(getFormState<Record<string, string>>('wk-operational-standards') ?? {});

    let cancelled = false;
    (async () => {
      try {
        const res = await getOperationalStandardsSchema(orderId, { anonymous: true });
        if (!cancelled) setSchema(res);
      } catch (err) {
        if (cancelled) return;
        const variant = noticeVariantForError(err);
        if (variant) onNotice(variant);
        else setSubmitError({ title: 'Nie udało się wczytać pytań', message: translateApiError(err).message });
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, onNotice]);

  const onSubmit = async () => {
    if (!schema) return;
    const fieldErrors = validateOperationalStandards(answers, schema.questions);
    setQuestionErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    saveFormState('wk-operational-standards', answers);

    try {
      // Klucze i wartości to identyfikatory UPPER_SNAKE, nigdy tekst swobodny.
      await submitOperationalStandards(orderId, { answers }, { anonymous: true });
      // PATCH zwraca własny kształt — stan kreatora odczytujemy świeżo.
      await onReload();
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) { onNotice(variant); return; }
      const t = translateApiError(err);
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  if (!schema) return <WkLoading label="Wczytujemy pytania…" />;

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <CheckoutProgressBar currentStep={3} steps={steps} />

        <h1 className="mb-3 text-4xl font-bold text-black">Jak chronicie firmę dzisiaj</h1>
        <p className="mb-10 max-w-[60ch] text-[#6B6965]">
          Kilka pytań o zabezpieczenia, które już macie. Odpowiedzi decydują o zakresie ochrony —
          jeśli czegoś nie wiesz, wybierz „nie wiem".
        </p>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}

        {/* FormActions renderuje przycisk type="submit", więc potrzebuje otaczającego
            <form> — tak samo jak OperationalStandardsStep w płatnym lejku. */}
        <form onSubmit={e => { e.preventDefault(); void onSubmit(); }}>
          <div className="space-y-4">
            {schema.questions.map(q => (
              <StandardQuestion
                key={q.key}
                question={q}
                answerOptions={schema.answerOptions}
                answer={answers[q.key]}
                onChange={value => {
                  setAnswers(prev => ({ ...prev, [q.key]: value }));
                  setQuestionErrors(prev => { const { [q.key]: _drop, ...rest } = prev; return rest; });
                }}
                error={questionErrors[q.key]}
                required
              />
            ))}
          </div>

          <div className="mt-8">
            <FormActions
              onBack={() => onBack({ kind: 'personal-data' })}
              submitLabel="Dalej"
              submitting={submitting}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
