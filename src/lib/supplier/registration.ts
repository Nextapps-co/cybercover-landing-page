import { getCheckoutState } from '../api/orders';
import { getInvitation, registerSupplier } from '../api/supplier-onboarding';
import type { InvitationResponseDto } from '../api/types/supplier-onboarding';
import {
  SUPPLIER_STEP_PATHS,
  entryPathFromState,
} from '../state/supplier-navigation';
import {
  clearSupplierSession,
  loadSupplierSession,
  saveSupplierSession,
  sessionFromInvitation,
} from '../state/supplier-session';
import { noticeVariantForError } from './guards';
import type { RegistrationOutcome } from './types';

/**
 * Start (albo wznowienie) rejestracji dostawcy.
 *
 * Rozgałęzia się WYŁĄCZNIE po `outcome` (§4). `wizardEntryStep` jest ignorowany:
 * przy ALREADY_REGISTERED jest `null`, a przy RESUMED nie potrafi wyrazić `personal-data`,
 * więc punkt wejścia liczymy z `nextRequiredStep` (§5.6).
 */
export async function startRegistration(
  token: string,
  invitation: InvitationResponseDto,
): Promise<RegistrationOutcome> {
  let response;
  try {
    response = await registerSupplier(token);
  } catch (err) {
    return { kind: 'notice', variant: noticeVariantForError(err) ?? 'invitation-invalid' };
  }

  if (response.outcome === 'ALREADY_REGISTERED') {
    // Nic nie powstało — nie zostawiaj sesji wskazującej na zamówienie, którego nie ma.
    clearSupplierSession();
    return { kind: 'notice', variant: 'already-registered' };
  }

  if (!saveSupplierSession(sessionFromInvitation(response.orderId, token, invitation))) {
    // Zapis nie przeszedł — bez sesji kolejne kroki i tak pokażą „no-session"
    // w nieskończonej pętli, więc powiedzmy wprost, co jest nie tak.
    return { kind: 'notice', variant: 'storage-blocked' };
  }

  if (response.outcome === 'STARTED') {
    return { kind: 'wizard', path: SUPPLIER_STEP_PATHS.COMPANY_DATA };
  }

  try {
    const state = await getCheckoutState(response.orderId, { anonymous: true });
    return { kind: 'wizard', path: entryPathFromState(state) };
  } catch {
    // Zamówienie istnieje, ale stanu nie odczytaliśmy. Wpuść na krok 1 — jego własny
    // guard i tak zweryfikuje postęp przy hydratacji i w razie czego przerzuci dalej.
    return { kind: 'wizard', path: SUPPLIER_STEP_PATHS.COMPANY_DATA };
  }
}

/**
 * Wznowienie z ekranu błędu wewnątrz wizarda (§9.8): pobierz zaproszenie po tokenie
 * z sesji i powtórz idempotentny `POST /register`. Nie naprawiamy stanu lokalnie.
 */
export async function resumeRegistrationFromSession(): Promise<RegistrationOutcome> {
  const session = loadSupplierSession();
  if (!session) return { kind: 'notice', variant: 'no-session' };
  try {
    const invitation = await getInvitation(session.token);
    return await startRegistration(session.token, invitation);
  } catch (err) {
    return { kind: 'notice', variant: noticeVariantForError(err) ?? 'invitation-invalid' };
  }
}
