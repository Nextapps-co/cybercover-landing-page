import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CheckoutProgressBar } from '../checkout/CheckoutProgressBar';
import { FormStep } from '../checkout/FormStep';
import { FormField } from '../checkout/FormField';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { PhoneField } from '../checkout/PhoneField';
import { ConsentCheckbox } from '../checkout/ConsentCheckbox';
import { SupplierGrantSummary } from './SupplierGrantSummary';
import { SupplierLoadError, SupplierLoading, SupplierNotice } from './SupplierNotice';
import { SUPPLIER_STEPS } from './supplier-steps';
import { useSupplierStep } from './use-supplier-step';
import { fetchConsentDefinitions, submitPersonalData } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/types/errors';
import { translateApiError } from '../../lib/errors/translate';
import { navigateBackward, navigateForward } from '../../lib/state/checkout-transition';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { SUPPLIER_CONFIRM_PATH, SUPPLIER_STEP_PATHS } from '../../lib/state/supplier-navigation';
import { noticeVariantForError } from '../../lib/supplier/guards';
import { validatePersonalData, type PersonalDataFormValues } from '../../lib/validation/personal-data';
import type { ConsentDefinitionDto } from '../../lib/api/types/order';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';

const INITIAL_VALUES: PersonalDataFormValues = {
  firstName: '', lastName: '', email: '', phoneDigits: '', consents: {},
};

function stripCountryPrefix(phone: string): string {
  if (phone.startsWith('+48')) return phone.slice(3).replace(/\D/g, '').slice(0, 9);
  return phone.replace(/\D/g, '').slice(0, 9);
}

export function SupplierPersonalDataStep() {
  const stepState = useSupplierStep(2);
  const [notice, setNotice] = useState<SupplierNoticeVariant | null>(null);
  const [consentDefinitions, setConsentDefinitions] = useState<ConsentDefinitionDto[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(true);
  const [consentsError, setConsentsError] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  const { register, handleSubmit, control, watch, setValue, setError, clearErrors, reset, formState: { errors } } =
    useForm<PersonalDataFormValues>({ mode: 'onTouched', defaultValues: INITIAL_VALUES });

  const consentValues = watch('consents');

  useEffect(() => {
    if (stepState.phase !== 'ready' || hydrated.current) return;
    hydrated.current = true;
    const { session, order } = stepState;

    const draft = getFormState<PersonalDataFormValues>('supplier-personal-data');
    reset({
      firstName: order.personalData?.firstName ?? draft?.firstName ?? '',
      lastName: order.personalData?.lastName ?? draft?.lastName ?? '',
      // Prefill adresem kontaktowym od podmiotu wiodącego jako wygodnym domyślnym,
      // ale POLE JEST EDYTOWALNE i to jego wartość decyduje: od 2026-08-27 backend
      // wysyła link aktywacyjny na adres podany TUTAJ, nie na kontaktowy.
      email: order.personalData?.email ?? draft?.email ?? session.contactEmail,
      phoneDigits: order.personalData?.phone
        ? stripCountryPrefix(order.personalData.phone)
        : (draft?.phoneDigits ?? ''),
      // Serwer nie echo'uje zgód — odtwarzamy je ze szkicu.
      consents: draft?.consents ?? {},
    });

    let cancelled = false;
    (async () => {
      try {
        // Z orderId — bez niego dostaniemy zestaw zwykłego klienta i zgoda „obserwowany"
        // nigdy się nie zapisze (§5.3).
        const defs = await fetchConsentDefinitions(session.orderId, { anonymous: true });
        if (cancelled) return;
        setConsentDefinitions(defs);
        setConsentsError(false);
      } catch (err) {
        if (cancelled) return;
        const variant = noticeVariantForError(err);
        if (variant) setNotice(variant);
        else {
          setSubmitError({ title: 'Nie udało się wczytać zgód', message: translateApiError(err).message });
          setConsentsError(true);
        }
      } finally {
        if (!cancelled) setConsentsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [stepState, reset]);

  const handleConsentChange = (id: string, accepted: boolean) => {
    setValue('consents', { ...consentValues, [id]: accepted }, { shouldValidate: true });
    clearErrors('consents');
  };

  const onSubmit = async (data: PersonalDataFormValues) => {
    // Nie wysyłaj zgód, których nie udało się wczytać — pusta lista przeszłaby
    // walidację jako „brak zgód wymaganych" i zapisalibyśmy rejestrację bez zgód.
    if (consentsError) return;
    // Druga warstwa ochrony: dopóki definicje zgód się nie wczytały, pusta lista
    // przeszłaby walidację jako „brak zgód wymaganych" i wysłalibyśmy puste `consents`.
    if (consentsLoading) return;
    if (stepState.phase !== 'ready') return;
    const { session } = stepState;

    // validatePersonalData wymusza WYŁĄCZNIE zgody z isRequired: true — dokładnie tak,
    // jak każe §5.3. Nie wymuszamy „wszystkiego na wszelki wypadek".
    const fieldErrors = validatePersonalData(data, consentDefinitions);
    if (Object.keys(fieldErrors).length > 0) {
      Object.entries(fieldErrors).forEach(([key, message]) => {
        setError(key as keyof PersonalDataFormValues, { type: 'manual', message });
      });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitPersonalData(session.orderId, {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        phone: `+48${data.phoneDigits}`,
        // Wysyłamy KAŻDĄ pobraną definicję: id → consentDefinitionId, wybór → accepted,
        // version → consentVersion (nazwy pól różnią się między odczytem a zapisem).
        consents: consentDefinitions.map(def => ({
          consentDefinitionId: def.id,
          accepted: data.consents[def.id] === true,
          consentVersion: def.version,
        })),
      }, { anonymous: true });
      saveFormState('supplier-personal-data', data);
      navigateForward(SUPPLIER_CONFIRM_PATH);
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) {
        setNotice(variant);
        return;
      }
      if (err instanceof ApiError && err.code === 'INVALID_CONSENT') {
        // Odrzucenie jest całościowe — nie zapisały się ani zgody, ani dane osobowe.
        const t = translateApiError(err);
        setSubmitError({ title: t.title, message: t.message });
        try {
          setConsentDefinitions(await fetchConsentDefinitions(session.orderId, { anonymous: true }));
        } catch { /* zostaw poprzedni zestaw */ }
        setSubmitting(false);
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

  const { session } = stepState;
  const inviter = session.leadingEntityName.length > 0 ? session.leadingEntityName : 'firmę, która Cię zaprosiła';

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <CheckoutProgressBar currentStep={2} steps={SUPPLIER_STEPS} />

        <h1 className="mb-12 font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-bold text-black">
          Dane osobiste
        </h1>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            {consentsError && (
              <div className="mb-6 rounded-[12px] border border-red-300 bg-red-50 p-4 font-['Plus_Jakarta_Sans',sans-serif] text-sm text-red-800" role="alert">
                <p className="font-semibold">Nie udało się wczytać zgód</p>
                <p className="mt-1">Bez nich nie możemy dokończyć rejestracji. Odśwież stronę i spróbuj ponownie.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded-[80px] border border-red-300 bg-white px-5 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                >
                  Odśwież stronę
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <FormStep title="Osoba do kontaktu">
                <FormField
                  label="Imię"
                  required
                  placeholder="Jan"
                  error={errors.firstName?.message}
                  {...register('firstName', { required: 'Imię jest wymagane' })}
                />
                <FormField
                  label="Nazwisko"
                  required
                  placeholder="Kowalski"
                  error={errors.lastName?.message}
                  {...register('lastName', { required: 'Nazwisko jest wymagane' })}
                />
                <FormField
                  label="E-mail konta"
                  type="email"
                  required
                  placeholder="jan.kowalski@firma.pl"
                  error={errors.email?.message}
                  {...register('email', { required: 'Email jest wymagany' })}
                />
                <p className="-mt-4 text-xs leading-relaxed text-[#6B6965]">
                  <span className="font-semibold text-[#0D0D0D]">Na ten adres wyślemy link aktywacyjny</span>{' '}
                  i na nim założymy konto — upewnij się, że masz do niego dostęp. Podpowiedzieliśmy adres
                  wskazany przez {inviter}; możesz go zmienić.
                </p>
                <Controller
                  control={control}
                  name="phoneDigits"
                  rules={{ required: 'Numer telefonu jest wymagany' }}
                  render={({ field, fieldState }) => (
                    <PhoneField
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      required
                    />
                  )}
                />
                <p className="-mt-4 text-xs leading-relaxed text-[#6B6965]">
                  Na ten numer wyślemy kod SMS przy aktywacji konta. Później nie da się go zmienić.
                </p>
              </FormStep>

              {/* Pusta lista zgód to poprawna konfiguracja środowiska (§5.3) —
                  nie renderujemy wtedy sekcji i NIE blokujemy kroku. */}
              {!consentsLoading && consentDefinitions.length > 0 && (
                <FormStep title="Zgody">
                  <div>
                    {consentDefinitions.map(def => (
                      <ConsentCheckbox
                        key={def.id}
                        consent={def}
                        checked={consentValues?.[def.id] === true}
                        onChange={checked => handleConsentChange(def.id, checked)}
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
                onBack={() => navigateBackward(SUPPLIER_STEP_PATHS.COMPANY_DATA)}
                submitLabel="Dalej"
                submitting={submitting || consentsLoading}
                submitDisabled={consentsError}
              />
            </form>
          </div>

          <aside className="lg:col-span-1">
            <SupplierGrantSummary
              leadingEntityName={session.leadingEntityName}
              companyName={session.legalName}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
