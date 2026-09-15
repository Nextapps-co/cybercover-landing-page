import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getWkConfigMock,
  submitWkPersonalDataMock,
  completeWkConfigMock,
  resetWkConfigMock,
  PROVISIONING_MS,
} from './wk-config.mock';
import { submitCompanyDataMock } from './orders.mock';

const COMPANY = { nip: '5241937685', name: 'Firma testowa WK', street: 'ul. Długa 42', city: 'Warszawa', postalCode: '00-001', industry: 'IT' };
const PERSON = { firstName: 'Jan', lastName: 'Kowalski', email: 'jan@example.test', phone: '+48500600700', consents: [] };

describe('wk-config mock', () => {
  beforeEach(() => resetWkConfigMock());

  it('nieznane orderId zaklada swieza konfiguracje na kroku danych firmy', async () => {
    const config = await getWkConfigMock('dowolne-id');
    expect(config.status).toBe('IN_PROGRESS');
    expect(config.entryStep).toBe('company-data');
    expect(config.prefill?.companyName.length).toBeGreaterThan(0);
  });

  it('orderId "404" udaje brak rekordu konfiguracji', async () => {
    await expect(getWkConfigMock('404')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('po danych firmy przechodzi na dane osobowe', async () => {
    await getWkConfigMock('a1');
    await submitCompanyDataMock('a1', COMPANY);
    expect((await getWkConfigMock('a1')).entryStep).toBe('personal-data');
  });

  it('domyslnie pomija krok standardow, a orderId "os" go wlacza', async () => {
    await getWkConfigMock('a2');
    await submitCompanyDataMock('a2', COMPANY);
    await submitWkPersonalDataMock({ orderId: 'a2', ...PERSON });
    expect((await getWkConfigMock('a2')).entryStep).toBe('ready-to-complete');

    await getWkConfigMock('os');
    await submitCompanyDataMock('os', COMPANY);
    await submitWkPersonalDataMock({ orderId: 'os', ...PERSON });
    const withOs = await getWkConfigMock('os');
    expect(withOs.entryStep).toBe('operational-standards');
    expect(withOs.operationalStandardsRequired).toBe(true);
  });

  it('odpowiedz kroku 2 ma ten sam ksztalt co odczyt stanu, z przesunietym entryStep', async () => {
    await getWkConfigMock('a3');
    await submitCompanyDataMock('a3', COMPANY);
    const afterSubmit = await submitWkPersonalDataMock({ orderId: 'a3', ...PERSON });
    expect(afterSubmit.entryStep).toBe('ready-to-complete');
    expect(afterSubmit).toEqual(await getWkConfigMock('a3'));
  });

  // Oryginalny test miał tu komentarz o „cofnięciu znacznika czasu", ale czekał realnym
  // `setTimeout(r, 0)` i dalej asertował PROVISIONING — więc przejście PROVISIONING -> COMPLETED,
  // czyli sedno ekranu oczekiwania, nie było w ogóle pokryte. Fake timery dowodzą obu rzeczy
  // naraz: idempotencji TUŻ PRZED progiem (drugie wywołanie nie przestawia znacznika, inaczej
  // odliczanie zaczynałoby się od nowa i COMPLETED nigdy by nie nadeszło) i faktycznego
  // przejścia PO progu. Trzy wywołania `completeWkConfigMock` — tyle samo, ile zmierzono
  // w docs/marketing-site-wk-integration.md §3.7 („trzy wywołania domknięcia, jedna firma").
  it('domkniecie jest idempotentne, a po uplywie progu PROVISIONING_MS przechodzi w COMPLETED', async () => {
    await getWkConfigMock('a4');
    await submitCompanyDataMock('a4', COMPANY);
    await submitWkPersonalDataMock({ orderId: 'a4', ...PERSON });

    vi.useFakeTimers();
    try {
      const done = await completeWkConfigMock('a4');
      expect(done.status).toBe('PROVISIONING');
      expect(done.entryStep).toBe('done');
      expect(done.prefill).toBeNull();

      // Tuż przed progiem: drugie wywołanie jest idempotentne i status zostaje PROVISIONING.
      vi.advanceTimersByTime(PROVISIONING_MS - 1);
      expect((await completeWkConfigMock('a4')).status).toBe('PROVISIONING');

      // Po przekroczeniu progu (liczonego od PIERWSZEGO wywołania — powyższe go nie przestawiło):
      // status faktycznie przechodzi na COMPLETED, trzecie wywołanie complete() dalej jest bezpieczne.
      vi.advanceTimersByTime(1);
      const completed = await completeWkConfigMock('a4');
      expect(completed.status).toBe('COMPLETED');
      expect(completed.entryStep).toBe('done');
      expect(completed.prefill).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
