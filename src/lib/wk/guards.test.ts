import { describe, it, expect } from 'vitest';
import { noticeVariantForError, recoveryForError } from './guards';
import { ApiError } from '../api/types/errors';

describe('noticeVariantForError', () => {
  it('404 rozpoznaje po statusie, bo bramka nie zwraca pola code', () => {
    expect(noticeVariantForError(new ApiError('INTERNAL_ERROR', 404, null))).toBe('invalid-link');
  });

  it('429 to osobny komunikat — limit jest na adres IP, wiec trafia ludzi zza jednego NAT-u', () => {
    expect(noticeVariantForError(new ApiError('INTERNAL_ERROR', 429, null))).toBe('rate-limited');
  });

  it('blad sieci nie przerywa kroku', () => {
    expect(noticeVariantForError(new ApiError('NETWORK_ERROR', 0, null))).toBeNull();
  });

  it('cokolwiek, co nie jest ApiError, nie przerywa kroku', () => {
    expect(noticeVariantForError(new Error('boom'))).toBeNull();
  });
});

describe('recoveryForError', () => {
  it('brak autorstwa kroku 2 odsyla na ekran danych osobowych', () => {
    expect(recoveryForError(new ApiError('WK_CONFIG_PERSONAL_DATA_NOT_SUBMITTED', 409, null))).toBe('personal-data');
  });

  it('krok 2 przeszla inna osoba — tez ekran danych osobowych', () => {
    expect(recoveryForError(new ApiError('WK_CONFIG_PERSONAL_DATA_MISMATCH', 409, null))).toBe('personal-data');
  });

  it('niekompletny checkout i zamkniety kreator odsylaja do odczytu stanu', () => {
    expect(recoveryForError(new ApiError('WK_CONFIG_CHECKOUT_INCOMPLETE', 409, null))).toBe('reload-state');
    expect(recoveryForError(new ApiError('WK_CONFIG_NOT_IN_PROGRESS', 409, null))).toBe('reload-state');
    expect(recoveryForError(new ApiError('INVALID_ORDER_STATE', 409, null))).toBe('reload-state');
  });

  it('zajety NIP nie jest stanem do odzyskania — to blad pola', () => {
    expect(recoveryForError(new ApiError('COMPANY_NIP_ALREADY_REGISTERED', 409, null))).toBeNull();
  });
});
