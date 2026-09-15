import { describe, it, expect } from 'vitest';
import { screenFor } from './screen';
import type { WkConfigResponseDto, WkEntryStep, WkStatus } from '../api/types/wk-config';

const config = (status: WkStatus, entryStep: WkEntryStep): WkConfigResponseDto => ({
  status,
  entryStep,
  operationalStandardsRequired: false,
  prefill: status === 'IN_PROGRESS'
    ? { companyName: 'WK TEST', firstName: null, lastName: null, email: null, phone: null }
    : null,
});

describe('screenFor — tabelka z §4.1', () => {
  it.each([
    ['company-data', 'company-data'],
    ['personal-data', 'personal-data'],
    ['operational-standards', 'operational-standards'],
    ['ready-to-complete', 'summary'],
  ] as const)('IN_PROGRESS + %s → %s', (entryStep, kind) => {
    expect(screenFor(config('IN_PROGRESS', entryStep))).toEqual({ kind });
  });

  it('PROVISIONING + done → ekran zakladania firmy', () => {
    expect(screenFor(config('PROVISIONING', 'done'))).toEqual({ kind: 'provisioning' });
  });

  it('COMPLETED + done → wyjscie', () => {
    expect(screenFor(config('COMPLETED', 'done'))).toEqual({ kind: 'exit' });
  });
});

describe('screenFor — status ma pierwszenstwo nad entryStep (§6 regula 2)', () => {
  // To jest kolega, ktory kliknal odnosnik partnera w trakcie zakladania firmy
  // przez pierwsza osobe. Odwrotna kolejnosc pokazalaby mu FORMULARZ z cudzymi danymi.
  it('PROVISIONING wygrywa z entryStep wskazujacym formularz', () => {
    expect(screenFor(config('PROVISIONING', 'company-data'))).toEqual({ kind: 'provisioning' });
    expect(screenFor(config('PROVISIONING', 'personal-data'))).toEqual({ kind: 'provisioning' });
    expect(screenFor(config('PROVISIONING', 'ready-to-complete'))).toEqual({ kind: 'provisioning' });
  });

  it('COMPLETED wygrywa z entryStep wskazujacym formularz', () => {
    expect(screenFor(config('COMPLETED', 'company-data'))).toEqual({ kind: 'exit' });
  });
});

describe('screenFor — stany spoza kontraktu', () => {
  it('IN_PROGRESS + done nie rzuca, tylko oddaje ekran przerywajacy', () => {
    expect(screenFor(config('IN_PROGRESS', 'done'))).toEqual({ kind: 'notice', variant: 'unexpected-state' });
  });

  it('nieznany entryStep oddaje ekran przerywajacy', () => {
    const broken = { ...config('IN_PROGRESS', 'company-data'), entryStep: 'cos-nowego' as WkEntryStep };
    expect(screenFor(broken)).toEqual({ kind: 'notice', variant: 'unexpected-state' });
  });
});
