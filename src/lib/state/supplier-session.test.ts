import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SUPPLIER_SESSION_KEY,
  clearSupplierSession,
  loadSupplierSession,
  persistAccountEmail,
  saveSupplierSession,
  sessionFromInvitation,
  type SupplierSession,
} from './supplier-session';
import { STORAGE_KEY as ORDER_SESSION_KEY } from './order-session';
import type { InvitationResponseDto } from '../api/types/supplier-onboarding';

const INVITATION: InvitationResponseDto = {
  nip: '5252248481',
  contactEmail: 'kontakt@acme.pl',
  organization: { legalName: 'Acme Sp. z o.o.', industry: null, address: null },
  leadingEntityName: 'Selgros Sp. z o.o.',
  invitedRelationshipsCount: 2,
};

const SESSION: SupplierSession = sessionFromInvitation('ord_1', 'tok_1', INVITATION);

describe('supplier-session', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('zapisuje i odczytuje sesję', () => {
    saveSupplierSession(SESSION);
    expect(loadSupplierSession()).toEqual(SESSION);
  });

  it('zwraca null, gdy nic nie zapisano', () => {
    expect(loadSupplierSession()).toBeNull();
  });

  it('zwraca null dla uszkodzonego JSON-a zamiast rzucać', () => {
    window.localStorage.setItem(SUPPLIER_SESSION_KEY, '{nie-json');
    expect(loadSupplierSession()).toBeNull();
  });

  it('odrzuca obiekt bez orderId albo bez tokenu', () => {
    window.localStorage.setItem(SUPPLIER_SESSION_KEY, JSON.stringify({ ...SESSION, orderId: '' }));
    expect(loadSupplierSession()).toBeNull();
    window.localStorage.setItem(SUPPLIER_SESSION_KEY, JSON.stringify({ ...SESSION, token: undefined }));
    expect(loadSupplierSession()).toBeNull();
  });

  it('nie ma TTL — sesja sprzed roku nadal jest ważna', () => {
    saveSupplierSession({ ...SESSION, createdAt: '2025-01-01T00:00:00.000Z' });
    expect(loadSupplierSession()?.orderId).toBe('ord_1');
  });

  it('czyści wyłącznie własny klucz, nie rusza order-session', () => {
    window.localStorage.setItem(ORDER_SESSION_KEY, '{"orderId":"ord_paid"}');
    saveSupplierSession(SESSION);
    clearSupplierSession();
    expect(loadSupplierSession()).toBeNull();
    expect(window.localStorage.getItem(ORDER_SESSION_KEY)).toBe('{"orderId":"ord_paid"}');
  });

  it('sessionFromInvitation przepisuje pola z zaproszenia', () => {
    const s = sessionFromInvitation('ord_9', 'tok_9', INVITATION);
    expect(s).toMatchObject({
      orderId: 'ord_9',
      token: 'tok_9',
      nip: '5252248481',
      contactEmail: 'kontakt@acme.pl',
      legalName: 'Acme Sp. z o.o.',
      leadingEntityName: 'Selgros Sp. z o.o.',
      invitedRelationshipsCount: 2,
    });
    expect(Date.parse(s.createdAt)).not.toBeNaN();
  });

  it('zwraca false, gdy przeglądarka blokuje zapis', () => {
    // Podmiana pojedynczej metody nie działa (happy-dom oddaje `localStorage`
    // przez proxy, więc ani instancja, ani prototyp nie przechwytują wywołania),
    // dlatego podstawiamy cały magazyn. Tak zachowuje się Safari w trybie
    // „Block All Cookies" i przeglądarka z wyczerpanym limitem miejsca.
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('QuotaExceededError'); },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
    });
    try {
      expect(saveSupplierSession(SESSION)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('zwraca true przy udanym zapisie', () => {
    expect(saveSupplierSession(SESSION)).toBe(true);
  });
});

describe('persistAccountEmail', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('dopisuje adres konta do istniejącej sesji, nie ruszając reszty pól', () => {
    saveSupplierSession(SESSION);
    persistAccountEmail('jan@acme.pl');
    const stored = loadSupplierSession();
    expect(stored?.accountEmail).toBe('jan@acme.pl');
    expect(stored?.orderId).toBe(SESSION.orderId);
    expect(stored?.contactEmail).toBe(SESSION.contactEmail);
    expect(stored?.token).toBe(SESSION.token);
  });

  it('nadpisuje wcześniejszy adres, gdy dostawca zmienił e-mail konta', () => {
    saveSupplierSession({ ...SESSION, accountEmail: 'stary@acme.pl' });
    persistAccountEmail('nowy@acme.pl');
    expect(loadSupplierSession()?.accountEmail).toBe('nowy@acme.pl');
  });

  it('bez sesji jest no-opem i nie tworzy wpisu', () => {
    persistAccountEmail('jan@acme.pl');
    expect(loadSupplierSession()).toBeNull();
    expect(window.localStorage.getItem(SUPPLIER_SESSION_KEY)).toBeNull();
  });

  it('sesja bez adresu konta pozostaje poprawna (pole opcjonalne)', () => {
    saveSupplierSession(SESSION);
    expect(loadSupplierSession()).not.toBeNull();
    expect(loadSupplierSession()?.accountEmail).toBeUndefined();
  });
});
