// Kontrakt kreatora konfiguracji Wolters Kluwer.
// docs/marketing-site-wk-integration.md §3.1, §3.5, §3.7 — wszystkie trzy trasy
// zwracają DOKŁADNIE ten sam kształt, więc jeden typ opisuje cały lejek.

import type { SubmitPersonalDataDto } from './order';

export type WkStatus = 'IN_PROGRESS' | 'PROVISIONING' | 'COMPLETED';

export type WkEntryStep =
  | 'company-data'
  | 'personal-data'
  | 'operational-standards'
  | 'ready-to-complete'
  | 'done';

/**
 * Dane do wstępnego wypełnienia — z tokenu tożsamości partnera.
 * Asymetria jest w kontrakcie, nie u nas: nazwa firmy jest zawsze, dane osobowe bywają puste
 * (partner nie musi przekazać telefonu). Typ wymusza defensywny odczyt z §6 reguły 4.
 */
export interface WkPrefillDto {
  companyName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export interface WkConfigResponseDto {
  status: WkStatus;
  entryStep: WkEntryStep;
  /** Czy krok standardów jest JESZCZE do zrobienia. Przełącza się true → false po zaliczeniu (§3.1 reguła 3). */
  operationalStandardsRequired: boolean;
  /** `null` jako CAŁY obiekt zawsze, gdy `status` nie jest `IN_PROGRESS` — ochrona danych osobowych. */
  prefill: WkPrefillDto | null;
}

/** DTO generyczne kroku 2 PLUS `orderId` — trasa WK nie ma go w ścieżce. */
export interface WkPersonalDataDto extends SubmitPersonalDataDto {
  orderId: string;
}
