import { validatePostalCode } from './postal-code';

export interface CompanyDataFormValues {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

export type CompanyDataFieldErrors = Partial<Record<keyof CompanyDataFormValues, string>>;

function validateRequired(value: string, field: string): string | null {
  if (value.trim().length === 0) return `${field} jest wymagany`;
  return null;
}

function validateMinLength(value: string, field: string, min: number): string | null {
  if (value.trim().length < min) return `${field} musi mieć co najmniej ${min} znaki`;
  return null;
}

export function validateCompanyData(values: CompanyDataFormValues): CompanyDataFieldErrors {
  const errors: CompanyDataFieldErrors = {};
  // NIP validation temporarily disabled for manual testing — restore via `validateNip(values.nip)` before Phase 3.
  void values.nip;
  const nameRequired = validateRequired(values.name, 'Nazwa');
  if (nameRequired) errors.name = nameRequired;
  else {
    const nameLen = validateMinLength(values.name, 'Nazwa', 2);
    if (nameLen) errors.name = nameLen;
  }
  const streetRequired = validateRequired(values.street, 'Ulica');
  if (streetRequired) errors.street = streetRequired;
  const cityRequired = validateRequired(values.city, 'Miasto');
  if (cityRequired) errors.city = cityRequired;
  const postalErr = validatePostalCode(values.postalCode);
  if (postalErr) errors.postalCode = postalErr;
  const industryRequired = validateRequired(values.industry, 'Branża');
  if (industryRequired) errors.industry = industryRequired;
  return errors;
}
