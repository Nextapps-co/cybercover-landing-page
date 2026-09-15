import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckoutProgressBar, type Step } from '../checkout/CheckoutProgressBar';
import { FormStep } from '../checkout/FormStep';
import { FormField } from '../checkout/FormField';
import { FormActions } from '../checkout/FormActions';
import { FormAlert } from '../checkout/FormAlert';
import { NipLookupField } from '../checkout/NipLookupField';
import { submitCompanyData } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/types/errors';
import { translateApiError } from '../../lib/errors/translate';
import { getFormState, saveFormState } from '../../lib/state/form-persistence';
import { noticeVariantForError } from '../../lib/wk/guards';
import { validateCompanyData, type CompanyDataFormValues } from '../../lib/validation/company-data';
import { INDUSTRIES } from '../../data/industries';
import type { WkConfigResponseDto } from '../../lib/api/types/wk-config';
import type { WkNoticeVariant } from '../../lib/wk/types';
import type { CompanyLookupDataDto } from '../../lib/api/types/order';

interface Props {
  orderId: string;
  config: WkConfigResponseDto;
  steps: Step[];
  onReload: () => Promise<void>;
  onNotice: (v: WkNoticeVariant) => void;
}

const INITIAL: CompanyDataFormValues = { nip: '', name: '', street: '', city: '', postalCode: '', industry: '' };

// `PATCH /orders/:id/company-data` to TEN SAM endpoint i to samo DTO co w checkoucie
// i lejku dostawcy — obie tamte implementacje wysyłają polską etykietę z listy, nie
// surowy kod ze selecta. Trzymamy się tego formatu, bo pole `companyData.industry`
// ma być spójne niezależnie od tego, który z trzech lejków je zapisał (recenzja Task 9).
function industryLabelFromValue(value: string): string {
  return INDUSTRIES.find(i => i.value === value)?.label ?? '';
}

export function WkCompanyDataScreen({ orderId, config, steps, onReload, onNotice }: Props) {
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors } } =
    useForm<CompanyDataFormValues>({ mode: 'onTouched', defaultValues: INITIAL });

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const draft = getFormState<CompanyDataFormValues>('wk-company-data');
    reset({
      ...INITIAL,
      ...draft,
      // Nazwa z Wolters Kluwer jako podpowiedź, ale POLE JEST EDYTOWALNE:
      // zmierzone, że użytkownik nadpisał ją własną i to jego wartość trafiła
      // na organizację (§3.4). Szkic użytkownika ma pierwszeństwo nad podpowiedzią.
      name: draft?.name || config.prefill?.companyName || '',
    });
  }, [config, reset]);

  const handleLookup = (data: CompanyLookupDataDto) => {
    setValue('name', data.name, { shouldValidate: true });
    setValue('street', data.street, { shouldValidate: true });
    setValue('city', data.city, { shouldValidate: true });
    setValue('postalCode', data.postalCode, { shouldValidate: true });
    if (data.industry) setValue('industry', data.industry, { shouldValidate: true });
  };

  const onSubmit = async (data: CompanyDataFormValues) => {
    const fieldErrors = validateCompanyData(data);
    if (Object.keys(fieldErrors).length > 0) {
      Object.entries(fieldErrors).forEach(([k, m]) => setError(k as keyof CompanyDataFormValues, { type: 'manual', message: m }));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    saveFormState('wk-company-data', data);

    try {
      await submitCompanyData(orderId, {
        nip: data.nip.replace(/\D/g, ''),
        name: data.name.trim(),
        street: data.street.trim(),
        city: data.city.trim(),
        postalCode: data.postalCode.trim(),
        industry: industryLabelFromValue(data.industry) || data.industry,
      }, { anonymous: true });
      // Odpowiedź PATCH-a ma inny kształt niż stan kreatora — odczytujemy go świeżo (§3.4).
      await onReload();
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) { onNotice(variant); return; }
      // Unikalność NIP-u obowiązuje klienta WK tak samo jak samoobsługowego.
      // To błąd pola do poprawienia, nie ekran awarii (§3.4).
      if (err instanceof ApiError && err.code === 'COMPANY_NIP_ALREADY_REGISTERED') {
        setError('nip', { type: 'manual', message: 'Firma o tym numerze NIP ma już konto w CyberCover.' });
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
        <CheckoutProgressBar currentStep={1} steps={steps} />

        <h1 className="mb-3 text-4xl font-bold text-black">Dane firmy</h1>
        <p className="mb-10 max-w-[60ch] text-[#6B6965]">
          Dostęp do CyberCovera otrzymałeś w ramach Wolters Kluwer. Zanim go uruchomimy,
          potrzebujemy danych firmy, na którą wystawimy ochronę.
        </p>

        {submitError && <FormAlert variant="error" title={submitError.title} message={submitError.message} />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <FormStep title="Firma">
            <NipLookupField
              currentValue={watch('nip')}
              onLookupSuccess={handleLookup}
              error={errors.nip?.message}
              anonymous
              {...register('nip', { required: 'NIP jest wymagany' })}
            />
            <FormField label="Nazwa firmy" required placeholder="Firma sp. z o.o."
              error={errors.name?.message} {...register('name', { required: 'Nazwa jest wymagana' })} />
            <FormField label="Ulica i numer" required placeholder="ul. Długa 42"
              error={errors.street?.message} {...register('street', { required: 'Ulica jest wymagana' })} />
            <FormField label="Kod pocztowy" required placeholder="00-001"
              error={errors.postalCode?.message} {...register('postalCode', { required: 'Kod pocztowy jest wymagany' })} />
            <FormField label="Miejscowość" required placeholder="Warszawa"
              error={errors.city?.message} {...register('city', { required: 'Miejscowość jest wymagana' })} />
            <FormField label="Branża" required options={INDUSTRIES}
              error={errors.industry?.message} {...register('industry', { required: 'Branża jest wymagana' })} />
          </FormStep>

          {/* Bez „Wstecz" — użytkownik przyszedł tu z portalu Wolters Kluwer. */}
          <FormActions submitLabel="Dalej" submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
