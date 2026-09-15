import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CheckoutProgressBar, type Step } from '../checkout/CheckoutProgressBar';
import { FormStep } from '../checkout/FormStep';
import { FormField } from '../checkout/FormField';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { PhoneField } from '../checkout/PhoneField';
import { ConsentCheckbox } from '../checkout/ConsentCheckbox';
import { fetchConsentDefinitions } from '../../lib/api/orders';
// 🔴 To, a NIE submitPersonalData z ../../lib/api/orders.
import { submitWkPersonalData } from '../../lib/api/wk-config';
import { ApiError } from '../../lib/api/types/errors';
import { translateApiError } from '../../lib/errors/translate';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { noticeVariantForError } from '../../lib/wk/guards';
import { validatePersonalData, type PersonalDataFormValues } from '../../lib/validation/personal-data';
import type { ConsentDefinitionDto } from '../../lib/api/types/order';
import type { WkConfigResponseDto } from '../../lib/api/types/wk-config';
import type { Screen, WkNoticeVariant } from '../../lib/wk/types';

interface Props {
  orderId: string;
  config: WkConfigResponseDto;
  steps: Step[];
  onAdvance: (next: WkConfigResponseDto) => void;
  onNotice: (v: WkNoticeVariant) => void;
  onBack: (target: Screen) => void;
}

const INITIAL: PersonalDataFormValues = { firstName: '', lastName: '', email: '', phoneDigits: '', consents: {} };

/**
 * `prefill.phone` przychodzi w formacie międzynarodowym, a PhoneField trzyma
 * 9 cyfr i skleja `+48` przy wysyłce. Przy innym prefiksie ZOSTAWIAMY PUSTE —
 * okrojenie cudzego numeru wysłałoby zły numer, a na niego idzie kod SMS.
 *
 * To samo dotyczy ułomnego `+48` — gdy po prefiksie jest INNA liczba cyfr niż
 * dokładnie 9: za mało (ucięty numer) ALBO za dużo (zdublowany kierunkowy,
 * dopisane rozszerzenie, literówka). Dlatego sprawdzamy długość CAŁEGO ciągu
 * cyfr (48 + 9 = 11) PRZED obcięciem, a nie długość już obciętego wyniku —
 * `slice(2, 11)` zawsze zwróci 9 znaków, nawet z dłuższego wejścia, więc
 * sprawdzenie po obcięciu nie wykryłoby nadmiaru. Bez tego obcięty wynik
 * WYGLĄDAŁBY na kompletny numer i zachęcałby do wysłania go bez poprawki.
 * Wolimy puste pole, które użytkownik wypełni sam, niż cudzy, urwany numer
 * z tym samym kodem SMS na końcu.
 */
function toLocalDigits(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+48')) return digits.length === 11 ? digits.slice(2) : '';
  if (!phone.startsWith('+') && digits.length === 9) return digits;
  return '';
}

export function WkPersonalDataScreen({ orderId, config, steps, onAdvance, onNotice, onBack }: Props) {
  const [definitions, setDefinitions] = useState<ConsentDefinitionDto[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(true);
  const [consentsError, setConsentsError] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  const { register, handleSubmit, control, watch, setValue, setError, clearErrors, reset, formState: { errors } } =
    useForm<PersonalDataFormValues>({ mode: 'onTouched', defaultValues: INITIAL });

  const consentValues = watch('consents');

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const draft = getFormState<PersonalDataFormValues>('wk-personal-data');
    // prefill czytany DEFENSYWNIE — cały obiekt bywa null, każde pole bywa null (§6 reguła 4).
    // Szkic użytkownika ma pierwszeństwo: to jego własne poprawki.
    reset({
      firstName: draft?.firstName || config.prefill?.firstName || '',
      lastName: draft?.lastName || config.prefill?.lastName || '',
      email: draft?.email || config.prefill?.email || '',
      phoneDigits: draft?.phoneDigits || toLocalDigits(config.prefill?.phone ?? null),
      consents: draft?.consents ?? {},
    });

    let cancelled = false;
    (async () => {
      try {
        // Z orderId — backend czyta z zamówienia rodzaj grantu i dobiera zestaw zgód.
        const defs = await fetchConsentDefinitions(orderId, { anonymous: true });
        if (cancelled) return;
        setDefinitions(defs);
        setConsentsError(false);
      } catch (err) {
        if (cancelled) return;
        const variant = noticeVariantForError(err);
        if (variant) onNotice(variant);
        else setConsentsError(true);
      } finally {
        if (!cancelled) setConsentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, config, reset, onNotice]);

  const onSubmit = async (data: PersonalDataFormValues) => {
    // Dwie blokady: bez wczytanych definicji pusta tablica przeszłaby naszą walidację
    // jako „brak zgód wymaganych", a bramka i tak odrzuci ją (consents ma minimum
    // jeden element) — komunikat byłby wtedy niezrozumiały.
    if (consentsLoading || consentsError) return;

    const fieldErrors = validatePersonalData(data, definitions);
    if (Object.keys(fieldErrors).length > 0) {
      Object.entries(fieldErrors).forEach(([k, m]) => setError(k as keyof PersonalDataFormValues, { type: 'manual', message: m }));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    saveFormState('wk-personal-data', data);

    try {
      const next = await submitWkPersonalData({
        orderId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        phone: `+48${data.phoneDigits}`,
        // Nazwy pól różnią się między odczytem a zapisem: id → consentDefinitionId,
        // version → consentVersion. Wysyłamy KAŻDĄ pobraną definicję.
        consents: definitions.map(def => ({
          consentDefinitionId: def.id,
          accepted: data.consents[def.id] === true,
          consentVersion: def.version,
        })),
      });
      // Odpowiedź ma ten sam kształt co odczyt stanu, z przesuniętym entryStep (§3.5) —
      // NIE odpytujemy stanu osobno.
      onAdvance(next);
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) { onNotice(variant); return; }
      if (err instanceof ApiError && err.code === 'INVALID_CONSENT') {
        // Odrzucenie jest całościowe — nie zapisały się ani zgody, ani dane osobowe.
        // Któraś definicja ma w bazie nowszą wersję, niż wysłaliśmy: pobierz na nowo.
        const t = translateApiError(err);
        setSubmitError({ title: t.title, message: t.message });
        try { setDefinitions(await fetchConsentDefinitions(orderId, { anonymous: true })); } catch { /* zostaw poprzedni zestaw */ }
        setSubmitting(false);
        return;
      }
      const t = translateApiError(err);
      setSubmitError({ title: t.title, message: t.message });
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <CheckoutProgressBar currentStep={2} steps={steps} />

        <h1 className="mb-3 text-4xl font-bold text-black">Twoje dane</h1>
        <p className="mb-10 max-w-[60ch] text-[#6B6965]">
          Osoba, którą tu wpiszesz, będzie zarządzać kontem firmy w CyberCover.
        </p>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
        {consentsError && (
          <div className="mb-6 rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <p className="font-semibold">Nie udało się wczytać zgód</p>
            <p className="mt-1">Bez nich nie możemy dokończyć konfiguracji. Odśwież stronę i spróbuj ponownie.</p>
            <button type="button" onClick={() => window.location.reload()}
              className="mt-3 rounded-[80px] border border-red-300 bg-white px-5 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">
              Odśwież stronę
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <FormStep title="Osoba zarządzająca kontem">
            <FormField label="Imię" required placeholder="Jan"
              error={errors.firstName?.message} {...register('firstName', { required: 'Imię jest wymagane' })} />
            <FormField label="Nazwisko" required placeholder="Kowalski"
              error={errors.lastName?.message} {...register('lastName', { required: 'Nazwisko jest wymagane' })} />
            <FormField label="E-mail" type="email" required placeholder="jan.kowalski@firma.pl"
              error={errors.email?.message} {...register('email', { required: 'E-mail jest wymagany' })} />
            <Controller
              control={control}
              name="phoneDigits"
              rules={{ required: 'Numer telefonu jest wymagany' }}
              render={({ field, fieldState }) => (
                <PhoneField value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                  error={fieldState.error?.message} required />
              )}
            />
          </FormStep>

          {/* Pusta lista zgód to poprawna konfiguracja środowiska — nie renderujemy
              wtedy sekcji i NIE blokujemy kroku. */}
          {!consentsLoading && definitions.length > 0 && (
            <FormStep title="Zgody">
              <div>
                {definitions.map(def => (
                  <ConsentCheckbox
                    key={def.id}
                    consent={def}
                    checked={consentValues?.[def.id] === true}
                    onChange={checked => {
                      setValue('consents', { ...consentValues, [def.id]: checked }, { shouldValidate: true });
                      clearErrors('consents');
                    }}
                  />
                ))}
              </div>
              {errors.consents && (
                <p className="mt-2 text-xs text-red-500" role="alert">
                  {(errors.consents as { message?: string }).message}
                </p>
              )}
            </FormStep>
          )}

          <FormActions
            onBack={() => onBack({ kind: 'company-data' })}
            submitLabel="Dalej"
            submitting={submitting || consentsLoading}
            submitDisabled={consentsError}
          />
        </form>
      </div>
    </div>
  );
}
