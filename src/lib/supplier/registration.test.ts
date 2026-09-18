import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '../api/types/errors';
import type { InvitationResponseDto } from '../api/types/supplier-onboarding';

vi.mock('../api/supplier-onboarding', () => ({
  getInvitation: vi.fn(),
  registerSupplier: vi.fn(),
}));
vi.mock('../api/orders', () => ({
  getCheckoutState: vi.fn(),
}));

import { getInvitation, registerSupplier } from '../api/supplier-onboarding';
import { getCheckoutState } from '../api/orders';
import { resumeRegistrationFromSession, startRegistration } from './registration';
import { loadSupplierSession, saveSupplierSession, sessionFromInvitation } from '../state/supplier-session';

const INVITATION: InvitationResponseDto = {
  nip: '5252248481',
  contactEmail: 'kontakt@acme.pl',
  organization: { legalName: 'Acme Sp. z o.o.', industry: null, address: null },
  leadingEntityName: 'Selgros Sp. z o.o.',
  invitedRelationshipsCount: 2,
};

describe('startRegistration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
  });

  it('STARTED → krok 1 i zapisana sesja', async () => {
    (registerSupplier as any).mockResolvedValue({
      orderId: 'ord_1', outcome: 'STARTED', wizardEntryStep: 'company-data', orderType: 'INITIAL_PURCHASE',
    });
    const result = await startRegistration('tok_1', INVITATION);
    expect(result).toEqual({ kind: 'wizard', path: '/supplier-registration/company-data' });
    expect(loadSupplierSession()).toMatchObject({ orderId: 'ord_1', token: 'tok_1', nip: '5252248481' });
  });

  it('RESUMED → punkt wejścia z nextRequiredStep, nie z wizardEntryStep', async () => {
    (registerSupplier as any).mockResolvedValue({
      // Backend nie potrafi wyrazić `personal-data` w tym polu — celowo podajemy tu co innego.
      orderId: 'ord_2', outcome: 'RESUMED', wizardEntryStep: 'company-data', orderType: 'INITIAL_PURCHASE',
    });
    (getCheckoutState as any).mockResolvedValue({
      orderId: 'ord_2',
      progress: { hasCompanyData: true, hasPersonalData: false, hasOperationalStandards: true, hasPaymentMethod: false },
      isComplete: false,
      nextRequiredStep: 'PERSONAL_DATA',
      isGrant: true,
    });
    const result = await startRegistration('tok_2', INVITATION);
    expect(result).toEqual({ kind: 'wizard', path: '/supplier-registration/personal-data' });
  });

  it('RESUMED z nieczytelnym stanem → krok 1 zamiast błędu', async () => {
    (registerSupplier as any).mockResolvedValue({
      orderId: 'ord_3', outcome: 'RESUMED', wizardEntryStep: null, orderType: 'INITIAL_PURCHASE',
    });
    (getCheckoutState as any).mockRejectedValue(new ApiError('NETWORK_ERROR', 0, null));
    const result = await startRegistration('tok_3', INVITATION);
    expect(result).toEqual({ kind: 'wizard', path: '/supplier-registration/company-data' });
  });

  it('ALREADY_REGISTERED → ekran końcowy i wyczyszczona sesja', async () => {
    saveSupplierSession(sessionFromInvitation('ord_stary', 'tok_stary', INVITATION));
    (registerSupplier as any).mockResolvedValue({
      orderId: 'ord_4', outcome: 'ALREADY_REGISTERED', wizardEntryStep: null, orderType: 'INITIAL_PURCHASE',
    });
    const result = await startRegistration('tok_4', INVITATION);
    expect(result).toEqual({ kind: 'notice', variant: 'already-registered' });
    expect(loadSupplierSession()).toBeNull();
  });

  it('404 → zaproszenie nieaktualne', async () => {
    (registerSupplier as any).mockRejectedValue(new ApiError('NOT_FOUND_EXCEPTION', 404, null));
    expect(await startRegistration('zly', INVITATION)).toEqual({ kind: 'notice', variant: 'invitation-invalid' });
  });

  it('422 → błąd konfiguracji środowiska', async () => {
    (registerSupplier as any).mockRejectedValue(new ApiError('STANDARD_PLAN_NOT_FOUND', 422, null));
    expect(await startRegistration('tok', INVITATION)).toEqual({ kind: 'notice', variant: 'config-error' });
  });
});

describe('resumeRegistrationFromSession', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
  });

  it('bez sesji → ekran „otwórz link z maila"', async () => {
    expect(await resumeRegistrationFromSession()).toEqual({ kind: 'notice', variant: 'no-session' });
    expect(getInvitation).not.toHaveBeenCalled();
  });

  it('z sesją pobiera zaproszenie po zapisanym tokenie i powtarza rejestrację', async () => {
    saveSupplierSession(sessionFromInvitation('ord_1', 'tok_1', INVITATION));
    (getInvitation as any).mockResolvedValue(INVITATION);
    (registerSupplier as any).mockResolvedValue({
      orderId: 'ord_1', outcome: 'RESUMED', wizardEntryStep: null, orderType: 'INITIAL_PURCHASE',
    });
    (getCheckoutState as any).mockResolvedValue({
      orderId: 'ord_1',
      progress: { hasCompanyData: true, hasPersonalData: true, hasOperationalStandards: true, hasPaymentMethod: false },
      isComplete: false,
      nextRequiredStep: 'PAYMENT_METHOD',
      isGrant: true,
    });
    const result = await resumeRegistrationFromSession();
    expect(getInvitation).toHaveBeenCalledWith('tok_1');
    expect(result).toEqual({ kind: 'wizard', path: '/supplier-registration/confirm' });
  });

  it('zaproszenie unieważnione w międzyczasie → ekran „nieaktualne"', async () => {
    saveSupplierSession(sessionFromInvitation('ord_1', 'tok_1', INVITATION));
    (getInvitation as any).mockRejectedValue(new ApiError('NOT_FOUND_EXCEPTION', 404, null));
    expect(await resumeRegistrationFromSession()).toEqual({ kind: 'notice', variant: 'invitation-invalid' });
  });
});
