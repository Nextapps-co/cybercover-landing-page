import { apiGet, apiPost } from './http';
import type {
  InvitationResponseDto,
  RegisterSupplierRequestDto,
  RegisterSupplierResponseDto,
} from './types/supplier-onboarding';

// Uwaga: `PUBLIC_API_BASE_URL` zawiera już `/api`, więc ścieżki są bez tego prefiksu.
// Oba wywołania są `anonymous: true` — cały ten lejek jest anonimowy, więc nie chcemy
// ani wstrzykiwać Authorization, ani odpalać redirectu na portal przy 401.

/**
 * Czysty odczyt (§2) — nie tworzy zamówienia i nie odnotowuje niczego w lejku
 * podmiotu wiodącego. Można wołać przy każdym wejściu na stronę powitalną.
 * Limit 30 req/min/IP.
 */
export async function getInvitation(token: string): Promise<InvitationResponseDto> {
  return apiGet<InvitationResponseDto>('/supplier-onboarding/invitation', {
    query: { token },
    anonymous: true,
  });
}

/**
 * Start checkoutu (§4). TO WYWOŁANIE odnotowuje „rejestracja rozpoczęta" w lejku
 * podmiotu wiodącego, dlatego strona powitalna woła je dopiero po kliknięciu CTA.
 * Idempotentne: ponowne wejście w bezterminowy link nie tworzy drugiego zamówienia.
 * Plan, cykl i NIP wymusza backend — nie da się ich przekazać. Limit 30 req/min/IP.
 */
export async function registerSupplier(token: string): Promise<RegisterSupplierResponseDto> {
  return apiPost<RegisterSupplierRequestDto, RegisterSupplierResponseDto>(
    '/supplier-onboarding/register',
    { token },
    { anonymous: true },
  );
}
