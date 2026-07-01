import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormStep } from './FormStep';
import { FormField } from './FormField';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { PhoneField } from './PhoneField';
import { ConsentCheckbox } from './ConsentCheckbox';
import { getOrderSession, resolveOsSkipped } from '../../lib/state/order-session';
import { navigateForward, navigateBackward } from '../../lib/state/checkout-transition';
import { saveFormState, getFormState } from '../../lib/state/form-persistence';
import { canAccessStep, stepToUrl } from '../../lib/state/checkout-navigation';
import { fetchConsentDefinitions, getOrder, submitPersonalData } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { validatePersonalData, type PersonalDataFormValues } from '../../lib/validation/personal-data';
import { personalChanged } from '../../lib/state/checkout-delta';
import type { ConsentDefinitionDto, OrderResponseDto } from '../../lib/api/types/order';

const INITIAL_VALUES: PersonalDataFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phoneDigits: '',
  consents: {},
};

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function stripCountryPrefix(phone: string): string {
  if (phone.startsWith('+48')) return phone.slice(3).replace(/\D/g, '').slice(0, 9);
  return phone.replace(/\D/g, '').slice(0, 9);
}

export function PersonalDataStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponseDto | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [consentDefinitions, setConsentDefinitions] = useState<ConsentDefinitionDto[]>([]);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [osSkipped, setOsSkipped] = useState(false);
  const baselineRef = useRef<PersonalDataFormValues | null>(null);

  const { register, handleSubmit, control, watch, setValue, setError, clearErrors, reset, formState: { errors } } =
    useForm<PersonalDataFormValues>({
      mode: 'onTouched',
      defaultValues: INITIAL_VALUES,
    });

  const consentValues = watch('consents');

  useEffect(() => {
    let cancelled = false;

    const id = readOrderIdFromUrl();
    if (!id) { window.location.assign('/cennik'); return; }
    const session = getOrderSession();
    if (!session || session.orderId !== id) { window.location.assign('/cennik'); return; }

    // Per spec §5.5.3 — auth-aware skip: backend już ma personalData z poprzedniego order'u.
    if (session.prefilledFields?.includes('personalData')) {
      const target = session.wizardEntryStep ?? 'payment-method';
      navigateForward(`/checkout/${target}?orderId=${encodeURIComponent(id)}`);
      return;
    }

    setOrderId(id);

    (async () => {
      try {
        const [order, defs, skipped] = await Promise.all([
          getOrder(id),
          fetchConsentDefinitions(),
          resolveOsSkipped(id),
        ]);
        if (cancelled) return;
        if (!canAccessStep(2, order.checkoutProgress)) {
          navigateBackward(`/checkout/company-data?orderId=${encodeURIComponent(id)}`);
          return;
        }
        setOrder(order);
        setOsSkipped(skipped);
        setConsentDefinitions(defs);

        const draft = getFormState<PersonalDataFormValues>('personal-data');
        const fromOrder: PersonalDataFormValues = {
          firstName: order.personalData?.firstName ?? '',
          lastName: order.personalData?.lastName ?? '',
          email: order.personalData?.email ?? '',
          phoneDigits: order.personalData?.phone ? stripCountryPrefix(order.personalData.phone) : '',
          // Serwer nie echo'uje zgód — odtwarzamy je z draftu (to co user ostatnio wysłał),
          // żeby po powrocie na krok checkboxy były zaznaczone jak przed przejściem dalej.
          consents: draft?.consents ?? {},
        };
        const initial = order.personalData ? fromOrder : (draft ?? INITIAL_VALUES);
        reset(initial);
        baselineRef.current = initial;

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

  const selectAllChecked =
    consentDefinitions.length > 0 &&
    consentDefinitions.every(d => consentValues?.[d.id] === true);

  const handleSelectAll = (next: boolean) => {
    const consents: Record<string, boolean> = {};
    for (const def of consentDefinitions) consents[def.id] = next;
    setValue('consents', consents, { shouldValidate: true });
    // `consents` nie jest register()-owane z rules, więc `shouldValidate` nie czyści
    // manualnego setError z poprzedniego submit'a. Bez tego handleSubmit gateuje
    // następny klik "Dalej" na resztkowym errorze i onSubmit się nie odpala.
    clearErrors('consents');
  };

  const handleConsentChange = (id: string, accepted: boolean) => {
    setValue('consents', { ...consentValues, [id]: accepted }, { shouldValidate: true });
    clearErrors('consents');
  };

  const onSubmit = async (data: PersonalDataFormValues) => {
    if (!orderId) return;

    const complete = order?.checkoutProgress.hasPersonalData ?? false;
    if (complete && baselineRef.current && !personalChanged(baselineRef.current, data)) {
      // Serwer ma już te dane osobowe (w tym zgody) i nic nie ruszono — pomiń PATCH.
      const target = osSkipped ? 'payment-method' : 'operational-standards';
      navigateForward(`/checkout/${target}?orderId=${encodeURIComponent(orderId)}`);
      return;
    }

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
      const payload = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        phone: `+48${data.phoneDigits}`,
        consents: consentDefinitions.map(def => ({
          consentDefinitionId: def.id,
          accepted: data.consents[def.id] === true,
          consentVersion: def.version,
        })),
      };
      const state = await submitPersonalData(orderId, payload);
      saveFormState('personal-data', data);
      if (state.progress.hasPersonalData) {
        // §2.6 — for plans without insurance, BE auto-marks OS as done and
        // nextRequiredStep skips straight to PAYMENT_METHOD.
        const next = state.nextRequiredStep ?? 'OPERATIONAL_STANDARDS';
        navigateForward(`${stepToUrl(next)}?orderId=${encodeURIComponent(orderId)}`);
      }
    } catch (err) {
      const t = translateApiError(err);
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_AVAILABLE') {
          setError('email', { type: 'manual', message: 'Ten email jest już zarejestrowany. Użyj innego adresu.' });
          setSubmitting(false);
          return;
        }
        if (err.code === 'INVALID_CONSENT') {
          setSubmitError({ title: t.title, message: t.message });
          try {
            const defs = await fetchConsentDefinitions();
            setConsentDefinitions(defs);
          } catch { /* ignore */ }
          setSubmitting(false);
          return;
        }
        if (err.code === 'ORDER_NOT_FOUND') {
          window.location.assign('/cennik');
          return;
        }
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

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={2} osSkipped={osSkipped} />
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Dane osobiste
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <FormStep title="Dane osobowe">
                <FormField label="Imię" required placeholder="Jan" error={errors.firstName?.message} {...register('firstName', { required: 'Imię jest wymagane' })} />
                <FormField label="Nazwisko" required placeholder="Kowalski" error={errors.lastName?.message} {...register('lastName', { required: 'Nazwisko jest wymagane' })} />
                <FormField label="Email służbowy" type="email" required placeholder="jan.kowalski@firma.pl" error={errors.email?.message} {...register('email', { required: 'Email jest wymagany' })} />
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
              </FormStep>

              <FormStep title="Zgody">
                <label className="flex items-center gap-3 border-b border-[#E4E2DF] pb-3 font-['Plus_Jakarta_Sans',sans-serif] text-sm font-semibold text-[#0D0D0D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectAllChecked}
                    onChange={e => handleSelectAll(e.currentTarget.checked)}
                    className="h-4 w-4 rounded border-[#E4E2DF] accent-[#FED64B] cursor-pointer"
                  />
                  Zaznacz wszystkie
                </label>
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

              <FormActions
                onBack={() => navigateBackward(`/checkout/company-data?orderId=${encodeURIComponent(orderId ?? '')}`)}
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
