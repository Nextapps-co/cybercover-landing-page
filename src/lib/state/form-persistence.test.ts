import { describe, it, expect, beforeEach } from 'vitest';
import { saveFormState, getFormState, clearFormState } from './form-persistence';

interface CompanyForm {
  nip: string;
  name: string;
}

describe('form-persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saveFormState + getFormState round-trip per step', () => {
    saveFormState<CompanyForm>('company-data', { nip: '526-000-12-46', name: 'ACME' });
    expect(getFormState<CompanyForm>('company-data')).toEqual({
      nip: '526-000-12-46',
      name: 'ACME',
    });
  });

  it('keys are scoped per step (company-data does not leak into personal-data)', () => {
    saveFormState('company-data', { nip: '5260001246' });
    expect(getFormState('personal-data')).toBeNull();
  });

  it('getFormState returns null when key not set', () => {
    expect(getFormState('payment-method')).toBeNull();
  });

  it('getFormState returns null when stored JSON is corrupt', () => {
    sessionStorage.setItem('cybercover:form-state:company-data', '{not valid');
    expect(getFormState('company-data')).toBeNull();
  });

  it('clearFormState(step) removes only that step', () => {
    saveFormState('company-data', { a: 1 });
    saveFormState('personal-data', { b: 2 });
    clearFormState('company-data');
    expect(getFormState('company-data')).toBeNull();
    expect(getFormState('personal-data')).toEqual({ b: 2 });
  });

  it('clearFormState() with no arg clears all checkout step form states', () => {
    saveFormState('company-data', { a: 1 });
    saveFormState('personal-data', { b: 2 });
    saveFormState('operational-standards', { c: 3 });
    saveFormState('payment-method', { d: 4 });
    clearFormState();
    expect(getFormState('company-data')).toBeNull();
    expect(getFormState('personal-data')).toBeNull();
    expect(getFormState('operational-standards')).toBeNull();
    expect(getFormState('payment-method')).toBeNull();
  });
});
