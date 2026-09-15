import { useEffect, useId, useRef, useState } from 'react';
import { CheckoutProgressBar, type Step } from '../checkout/CheckoutProgressBar';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { StandardQuestion } from '../checkout/StandardQuestion';
import { WkLoadError, WkLoading } from './WkNotice';
import { getOperationalStandardsSchema, submitOperationalStandards } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { noticeVariantForError } from '../../lib/wk/guards';
import { validateOperationalStandards } from '../../lib/validation/operational-standards';
import type { OperationalStandardsSchemaResponseDto, StandardQuestionDto } from '../../lib/api/types/order';
import type { Screen, WkNoticeVariant } from '../../lib/wk/types';

interface Props {
  orderId: string;
  steps: Step[];
  onReload: () => Promise<void>;
  onNotice: (v: WkNoticeVariant) => void;
  onBack: (target: Screen) => void;
}

// Te trzy klucze przychodzą z TEGO SAMEGO endpointu schematu co płatny checkout
// (src/components/checkout/OperationalStandardsStep.tsx) i tam dostają inne traktowanie
// niż zwykłe pytanie: to oświadczenia, nie ankieta. „Nie wiem" na „nie jestem placówką
// ochrony zdrowia" nie jest sensowną odpowiedzią i zafałszowałby ocenę ryzyka — dlatego
// wymagany checkbox (zaznaczenie = 'YES'), nie kafelki TAK/NIE/NIE WIEM. Zbiór trzymany
// wyłącznie po stronie frontu (nie ma go w DTO), więc kopiujemy go stąd, a nie importujemy
// — źródłowa stała nie jest eksportowana, a i tak nie chcemy przypadkowej sprzężonej zmiany
// między dwoma osobnymi lejkami.
const HARDCODED_CHECKBOX_KEYS = new Set(['BUSINESS_NOT_HEALTHCARE', 'SWU_ACKNOWLEDGED', 'ANNUAL_REVENUE_UNDER_500M_PLN']);

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
        <label htmlFor={id} className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#0D0D0D] leading-snug cursor-pointer [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-black">
          <span aria-hidden="true" className="mr-0.5 text-red-500">*</span>
          <span dangerouslySetInnerHTML={{ __html: question.label }} />
        </label>
        {hasDescription && (
          <p className="mt-1 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">{question.description}</p>
        )}
        {error && <p className="mt-1 text-xs text-red-500" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function WkOperationalStandardsScreen({ orderId, steps, onReload, onNotice, onBack }: Props) {
  const [schema, setSchema] = useState<OperationalStandardsSchemaResponseDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  // Błąd WCZYTANIA pytań (bez nich nie ma formularza) vs błąd WYSYŁKI (formularz już
  // jest na ekranie, FormAlert ma gdzie się pokazać) — dwa różne stany, bo dzielą się
  // różną odpowiedzią UI. Mylenie ich chowało błąd wczytania za wiecznym stanem "ładowania".
  const [loadError, setLoadError] = useState<string | null>(null);
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
        else setLoadError(translateApiError(err).message);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, onNotice]);

  const handleAnswer = (questionKey: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionKey]: value }));
    setQuestionErrors(prev => { const { [questionKey]: _drop, ...rest } = prev; return rest; });
  };

  const onSubmit = async () => {
    if (!schema) return;

    // Oświadczenia (HARDCODED_CHECKBOX_KEYS) walidujemy osobno od zwykłych pytań:
    // tam nie wystarczy "cokolwiek wybrane", musi być konkretnie 'YES'.
    const regularQuestions = schema.questions.filter(q => !isCheckboxQuestion(q));
    const checkboxQuestions = schema.questions.filter(isCheckboxQuestion);

    const fieldErrors = validateOperationalStandards(answers, regularQuestions);
    for (const q of checkboxQuestions) {
      if (answers[q.key] !== 'YES') {
        fieldErrors[q.key] = 'Musisz potwierdzić, aby kontynuować';
      }
    }
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

  // Kolejność bramek ma znaczenie: błąd wczytania najpierw (nie mamy pytań i nie
  // będziemy mieć bez ponowienia), potem "jeszcze wczytujemy", dopiero potem formularz.
  if (loadError) return <WkLoadError message={loadError} />;
  if (!schema) return <WkLoading label="Wczytujemy pytania…" />;

  const regularQuestions = schema.questions.filter(q => !isCheckboxQuestion(q));
  const checkboxQuestions = schema.questions.filter(isCheckboxQuestion);

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
            {regularQuestions.map(q => (
              <StandardQuestion
                key={q.key}
                question={q}
                answerOptions={schema.answerOptions}
                answer={answers[q.key]}
                onChange={value => handleAnswer(q.key, value)}
                error={questionErrors[q.key]}
                required
              />
            ))}
          </div>

          {checkboxQuestions.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-[#E4E2DF] pt-6">
              <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-semibold text-[#0D0D0D]">
                Potwierdzenia
              </p>
              {checkboxQuestions.map(q => (
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
