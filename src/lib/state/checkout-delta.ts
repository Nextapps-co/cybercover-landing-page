// Czyste komparatory „czy krok się zmienił względem stanu serwera".
// Używane przez kroki wizardu do pomijania redundantnych PATCH-y (delta-aware submit).
import { normalizeNip } from '../validation/nip';

export interface CompanyDelta {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

export interface PersonalDelta {
  firstName: string;
  lastName: string;
  email: string;
  phoneDigits: string;
  consents: Record<string, boolean>;
}

export type OsDelta = Record<string, string>;

export interface PaymentDelta {
  paymentMethod: string;
  discountCode: string | null;
}

function normText(v: string | null | undefined): string {
  return (v ?? '').trim();
}

// Porównuje mapy boolean traktując brak klucza jak `false`
// (żeby {} i „wszystkie false" były równe).
function boolMapChanged(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if ((a?.[k] === true) !== (b?.[k] === true)) return true;
  }
  return false;
}

// Porównuje mapy string traktując brak klucza i '' (po trim) jak równoważne.
function strMapChanged(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (normText(a?.[k]) !== normText(b?.[k])) return true;
  }
  return false;
}

export function companyChanged(baseline: CompanyDelta, current: CompanyDelta): boolean {
  return (
    normalizeNip(normText(baseline.nip)) !== normalizeNip(normText(current.nip)) ||
    normText(baseline.name) !== normText(current.name) ||
    normText(baseline.street) !== normText(current.street) ||
    normText(baseline.city) !== normText(current.city) ||
    normText(baseline.postalCode) !== normText(current.postalCode) ||
    normText(baseline.industry) !== normText(current.industry)
  );
}

export function personalChanged(baseline: PersonalDelta, current: PersonalDelta): boolean {
  return (
    normText(baseline.firstName) !== normText(current.firstName) ||
    normText(baseline.lastName) !== normText(current.lastName) ||
    normText(baseline.email) !== normText(current.email) ||
    normText(baseline.phoneDigits) !== normText(current.phoneDigits) ||
    boolMapChanged(baseline.consents ?? {}, current.consents ?? {})
  );
}

export function osChanged(baseline: OsDelta, current: OsDelta): boolean {
  return strMapChanged(baseline ?? {}, current ?? {});
}

export function paymentChanged(baseline: PaymentDelta, current: PaymentDelta): boolean {
  const bc = baseline.discountCode == null ? null : baseline.discountCode.trim();
  const cc = current.discountCode == null ? null : current.discountCode.trim();
  return baseline.paymentMethod !== current.paymentMethod || bc !== cc;
}
