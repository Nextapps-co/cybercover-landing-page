// docs/checkout-process-integration.md §2 i §4 — DTO wariantu zaproszeniowego.

import type { OrderType, WizardEntryStep } from './order';

export interface InvitationOrganizationDto {
  legalName: string;
  /** Celowo `null` — podmiotu wiodącego nigdy nie pytamy o branżę dostawcy (§2). */
  industry: string | null;
  /** Celowo `null` — jak wyżej; uzupełniane przyciskiem „pobierz dane z GUS". */
  address: string | null;
}

export interface InvitationResponseDto {
  /** NIP relacji monitoringu — pole NIP w kroku 1 jest nim wypełnione i zablokowane. */
  nip: string;
  /** Adres podany przez podmiot wiodący. Na NIEGO idzie mail aktywacyjny (§5.2). */
  contactEmail: string;
  organization: InvitationOrganizationDto;
  /** Pusty string, gdy nazwy nie da się rozwiązać. */
  leadingEntityName: string;
  /** Jedna rejestracja aktywuje wszystkie oczekujące zaproszenia tego dostawcy. */
  invitedRelationshipsCount: number;
}

export type RegisterOutcome = 'STARTED' | 'RESUMED' | 'ALREADY_REGISTERED';

export interface RegisterSupplierRequestDto {
  token: string;
}

export interface RegisterSupplierResponseDto {
  orderId: string;
  outcome: RegisterOutcome;
  /**
   * W typie wyłącznie dla wierności kontraktowi — NIE czytamy go nigdzie.
   * Nie potrafi wyrazić `personal-data`, a przy ALREADY_REGISTERED jest `null` (§4, §5.6).
   */
  wizardEntryStep: WizardEntryStep | null;
  orderType: OrderType;
}
