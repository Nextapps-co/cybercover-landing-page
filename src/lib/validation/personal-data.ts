import { validateEmail } from './email';
import type { ConsentDefinitionDto } from '../api/types/order';

export interface PersonalDataFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phoneDigits: string; // 9 digits, stripped; prefix +48 added at submit
  consents: Record<string, boolean>; // key = consentDefinitionId
}

export type PersonalDataFieldErrors = Partial<Record<keyof PersonalDataFormValues, string>>;

function validateRequired(value: string, label: string): string | null {
  if (value.trim().length === 0) return `${label} jest wymagany`;
  return null;
}

function validateMinLength(value: string, label: string, min: number): string | null {
  if (value.trim().length < min) return `${label} musi mieć co najmniej ${min} znaki`;
  return null;
}

function validatePhoneDigits(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return 'Numer telefonu jest wymagany';
  if (digits.length < 9) return 'Numer telefonu musi mieć 9 cyfr';
  if (digits.length > 9) return 'Numer telefonu może mieć maksymalnie 9 cyfr';
  return null;
}

function validateConsents(
  accepted: Record<string, boolean>,
  definitions: ConsentDefinitionDto[],
): string | null {
  const missing = definitions.filter((d) => d.isRequired && accepted[d.id] !== true);
  if (missing.length > 0) return 'Musisz zaakceptować wszystkie wymagane zgody';
  return null;
}

export function validatePersonalData(
  values: PersonalDataFormValues,
  definitions: ConsentDefinitionDto[],
): PersonalDataFieldErrors {
  const errors: PersonalDataFieldErrors = {};
  const firstReq = validateRequired(values.firstName, 'Imię');
  if (firstReq) errors.firstName = firstReq;
  else {
    const firstLen = validateMinLength(values.firstName, 'Imię', 2);
    if (firstLen) errors.firstName = firstLen;
  }
  const lastReq = validateRequired(values.lastName, 'Nazwisko');
  if (lastReq) errors.lastName = lastReq;
  else {
    const lastLen = validateMinLength(values.lastName, 'Nazwisko', 2);
    if (lastLen) errors.lastName = lastLen;
  }
  const emailErr = validateEmail(values.email);
  if (emailErr) errors.email = emailErr;
  const phoneErr = validatePhoneDigits(values.phoneDigits);
  if (phoneErr) errors.phoneDigits = phoneErr;
  const consentsErr = validateConsents(values.consents, definitions);
  if (consentsErr) errors.consents = consentsErr;
  return errors;
}
