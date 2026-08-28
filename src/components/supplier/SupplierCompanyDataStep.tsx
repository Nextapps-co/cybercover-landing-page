import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckoutProgressBar } from '../checkout/CheckoutProgressBar';
import { FormStep } from '../checkout/FormStep';
import { FormField } from '../checkout/FormField';
import { FormAlert } from '../checkout/FormAlert';
import { NipLookupField } from '../checkout/NipLookupField';
import { SupplierGrantSummary } from './SupplierGrantSummary';
import { SupplierLoadError, SupplierLoading, SupplierNotice } from './SupplierNotice';
import { SUPPLIER_STEPS } from './supplier-steps';
import { useSupplierStep } from './use-supplier-step';
import { submitCompanyData } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/types/errors';
import { translateApiError } from '../../lib/errors/translate';
import { navigateForward } from '../../lib/state/checkout-transition';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { SUPPLIER_STEP_PATHS } from '../../lib/state/supplier-navigation';
import { noticeVariantForError } from '../../lib/supplier/guards';
import { validateCompanyData, type CompanyDataFormValues } from '../../lib/validation/company-data';
import { normalizeNip } from '../../lib/validation/nip';
import { INDUSTRIES } from '../../data/industries';
import type { CompanyLookupDataDto } from '../../lib/api/types/order';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';

const INITIAL_VALUES: CompanyDataFormValues = {
  nip: '', name: '', street: '', city: '', postalCode: '', industry: '',
};

function industryLabelFromValue(value: string): string {
  return INDUSTRIES.find(i => i.value === value)?.label ?? '';
}

function industryValueFromLabel(label: string): string {
  return INDUSTRIES.find(i => i.label === label)?.value ?? '';
}

export function SupplierCompanyDataStep() {
  const stepState = useSupplierStep(1);
  const [notice, setNotice] = useState<SupplierNoticeVariant | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors } } =
    useForm<CompanyDataFormValues>({ mode: 'onTouched', defaultValues: INITIAL_VALUES });

  const nipValue = watch('nip');

  useEffect(() => {
    if (stepState.phase !== 'ready' || hydrated.current) return;
    hydrated.current = true;
    const { session, order } = stepState;
    const draft = getFormState<CompanyDataFormValues>('supplier-company-data');
    const company = order.companyData;
    const industryFromOrder = company?.industry ? industryValueFromLabel(company.industry) : '';
    reset({
      // NIP zawsze z zaproszenia — pole jest zablokowane, więc nie może przyjść skądinąd.
      nip: session.nip,
      name: company?.name ?? draft?.name ?? session.legalName ?? '',
      street: company?.street ?? draft?.street ?? '',
      city: company?.city ?? draft?.city ?? '',
      postalCode: company?.postalCode ?? draft?.postalCode ?? '',
      industry: industryFromOrder || draft?.industry || '',
    });
  }, [stepState, reset]);

  const handleLookupSuccess = (data: CompanyLookupDataDto) => {
    setValue('name', data.name, { shouldValidate: true, shouldTouch: true });
    setValue('street', data.street, { shouldValidate: true, shouldTouch: true });
    setValue('city', data.city, { shouldValidate: true, shouldTouch: true });
    setValue('postalCode', data.postalCode, { shouldValidate: true, shouldTouch: true });
    // Inaczej niż w płatnym kroku: branża też. Zaproszenie z założenia jej nie niesie (§2),
    // więc GUS jest tu podstawową drogą jej uzupełnienia. Ustawiamy tylko przy trafieniu
    // w słownik — rejestry potrafią zwrócić null albo wartość spoza listy.
    const industryValue = data.industry ? industryValueFromLabel(data.industry) : '';
    if (industryValue) {
      setValue('industry', industryValue, { shouldValidate: true, shouldTouch: true });
    }
  };

  const onSubmit = async (data: CompanyDataFormValues) => {
    if (stepState.phase !== 'ready') return;
    const { session } = stepState;

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
      await submitCompanyData(session.orderId, {
        nip: normalizeNip(session.nip),
        name: data.name.trim(),
        street: data.street.trim(),
        city: data.city.trim(),
        postalCode: data.postalCode.trim(),
        industry: industryLabelFromValue(data.industry) || data.industry,
      }, { anonymous: true });
      saveFormState('supplier-company-data', data);
      navigateForward(SUPPLIER_STEP_PATHS.PERSONAL_DATA);
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) {
        setNotice(variant);
        return;
      }
      if (err instanceof ApiError) {
        if (err.code === 'SALES_ORDER_GRANT_NIP_MISMATCH') {
          setError('nip', {
            type: 'manual',
            message: 'Ten NIP nie zgadza się z NIP-em z zaproszenia. Skontaktuj się z firmą, która Cię zaprosiła.',
          });
          setSubmitting(false);
          return;
        }
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

  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <CheckoutProgressBar currentStep={1} steps={SUPPLIER_STEPS} />

        <h1 className="mb-12 font-['Plus_Jakarta_Sans',sans-serif] text-4xl font-bold text-black">
          Dane organizacji
        </h1>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <FormStep title="Dane rejestrowe organizacji">
                <NipLookupField
                  currentValue={nipValue ?? ''}
                  onLookupSuccess={handleLookupSuccess}
                  error={errors.nip?.message}
                  locked
                  lockedHint="NIP pochodzi z zaproszenia i nie można go zmienić. Kliknij „pobierz dane z GUS”, żeby uzupełnić resztę."
                  {...register('nip')}
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

              {/* Brak przycisku „wstecz": z kroku 1 nie ma dokąd wracać — /cennik jest
                  dla dostawcy ślepy (inny produkt, do tego za bramką). */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {submitting ? 'Zapisujemy…' : 'Dalej'}
              </button>
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
