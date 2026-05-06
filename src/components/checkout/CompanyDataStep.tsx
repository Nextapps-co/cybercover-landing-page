import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckoutProgressBar } from './CheckoutProgressBar';
import { OrderSummaryAside } from './OrderSummaryAside';
import { FormStep } from './FormStep';
import { FormField } from './FormField';
import { FormActions } from './FormActions';
import { FormAlert } from './FormAlert';
import { NipLookupField } from './NipLookupField';
import { getOrderSession, resolveOsSkipped } from '../../lib/state/order-session';
import { navigateForward } from '../../lib/state/checkout-transition';
import { saveFormState, getFormState } from '../../lib/state/form-persistence';
import { getOrder, submitCompanyData } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { ApiError } from '../../lib/api/types/errors';
import { validateCompanyData, type CompanyDataFormValues } from '../../lib/validation/company-data';
import { normalizeNip } from '../../lib/validation/nip';
import { INDUSTRIES } from '../../data/industries';
import type { CompanyLookupDataDto } from '../../lib/api/types/order';

const INITIAL_VALUES: CompanyDataFormValues = {
  nip: '', name: '', street: '', city: '', postalCode: '', industry: '',
};

function readOrderIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function industryLabelFromValue(value: string): string {
  return INDUSTRIES.find(i => i.value === value)?.label ?? '';
}

function industryValueFromLabel(label: string): string {
  return INDUSTRIES.find(i => i.label === label)?.value ?? '';
}

export function CompanyDataStep() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [osSkipped, setOsSkipped] = useState(false);

  const form = useForm<CompanyDataFormValues>({
    mode: 'onTouched',
    defaultValues: INITIAL_VALUES,
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    reset,
    formState: { errors },
  } = form;

  const nipValue = watch('nip');

  // Mount: validate URL + sessionStorage, hydrate from backend or saved form state
  useEffect(() => {
    let cancelled = false;

    const id = readOrderIdFromUrl();
    if (!id) {
      window.location.assign('/cennik');
      return;
    }
    const session = getOrderSession();
    if (!session || session.orderId !== id) {
      window.location.assign('/cennik');
      return;
    }

    setOrderId(id);

    (async () => {
      try {
        // §2.6 — first wizard page after start: resolve and persist osSkipped to
        // OrderSession in parallel with the order fetch, so subsequent steps
        // don't need extra requests to render the progress bar.
        const [order, skipped] = await Promise.all([getOrder(id), resolveOsSkipped(id)]);
        if (cancelled) return;
        setOsSkipped(skipped);

        // Prefer backend's stored data; fall back to local form-persistence draft
        if (order.companyData) {
          reset({
            nip: order.companyData.nip ?? '',
            name: order.companyData.name ?? '',
            street: order.companyData.street ?? '',
            city: order.companyData.city ?? '',
            postalCode: order.companyData.postalCode ?? '',
            industry: industryValueFromLabel(order.companyData.industry ?? '') || order.companyData.industry || '',
          });
        } else {
          const draft = getFormState<CompanyDataFormValues>('company-data');
          if (draft) reset(draft);
        }
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

  const handleLookupSuccess = (data: CompanyLookupDataDto) => {
    setValue('name', data.name, { shouldValidate: true, shouldTouch: true });
    setValue('street', data.street, { shouldValidate: true, shouldTouch: true });
    setValue('city', data.city, { shouldValidate: true, shouldTouch: true });
    setValue('postalCode', data.postalCode, { shouldValidate: true, shouldTouch: true });
  };

  const onSubmit = async (data: CompanyDataFormValues) => {
    if (!orderId) return;

    // Run our validators (in addition to react-hook-form's per-field rules)
    const fieldErrors = validateCompanyData(data);
    if (Object.keys(fieldErrors).length > 0) {
      Object.entries(fieldErrors).forEach(([key, message]) => {
        setError(key as keyof CompanyDataFormValues, { type: 'manual', message });
      });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const industryLabel = industryLabelFromValue(data.industry) || data.industry;
      const state = await submitCompanyData(orderId, {
        nip: normalizeNip(data.nip),
        name: data.name.trim(),
        street: data.street.trim(),
        city: data.city.trim(),
        postalCode: data.postalCode.trim(),
        industry: industryLabel,
      });

      saveFormState('company-data', data);

      if (state.nextRequiredStep === 'PERSONAL_DATA' || state.progress.hasCompanyData) {
        navigateForward(`/checkout/personal-data?orderId=${encodeURIComponent(orderId)}`);
      }
    } catch (err) {
      const t = translateApiError(err);
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_NIP') {
          setError('nip', { type: 'manual', message: 'Niepoprawny NIP' });
          setSubmitting(false);
          return;
        }
        if (err.code === 'INVALID_POSTAL_CODE') {
          setError('postalCode', { type: 'manual', message: 'Niepoprawny kod pocztowy' });
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
    return (
      <div className="min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]">
        Ładowanie zamówienia…
      </div>
    );
  }

  if (hydrationError) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-md mx-auto">
        <FormAlert variant="error" title="Błąd" message={hydrationError} />
        <a href="/cennik" className="block mt-4 text-center text-sm underline text-[#6B6965]">
          Wróć do cennika
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <CheckoutProgressBar currentStep={1} osSkipped={osSkipped} />

        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-4xl text-black mb-12">
          Dane firmy
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <FormStep title="Dane rejestrowe organizacji">
                <NipLookupField
                  currentValue={nipValue ?? ''}
                  onLookupSuccess={handleLookupSuccess}
                  error={errors.nip?.message}
                  {...register('nip', { required: 'NIP jest wymagany' })}
                />
                <FormField
                  label="Nazwa"
                  required
                  placeholder="Np. ACME Sp. z o.o."
                  error={errors.name?.message}
                  {...register('name', { required: 'Nazwa jest wymagana' })}
                />
                <FormField
                  label="Ulica i numer"
                  required
                  placeholder="Np. ul. Przykładowa 15"
                  error={errors.street?.message}
                  {...register('street', { required: 'Ulica jest wymagana' })}
                />
                <FormField
                  label="Miasto"
                  required
                  placeholder="Np. Warszawa"
                  error={errors.city?.message}
                  {...register('city', { required: 'Miasto jest wymagane' })}
                />
                <FormField
                  label="Kod pocztowy"
                  required
                  placeholder="00-000"
                  error={errors.postalCode?.message}
                  {...register('postalCode', { required: 'Kod pocztowy jest wymagany' })}
                />
                <FormField
                  label="Branża"
                  required
                  options={INDUSTRIES}
                  error={errors.industry?.message}
                  {...register('industry', { required: 'Branża jest wymagana' })}
                />
              </FormStep>

              <FormActions
                onBack={() => window.location.assign('/cennik')}
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
