import { describe, it, expect } from 'vitest';
import { validatePersonalData, type PersonalDataFormValues } from './personal-data';
import type { ConsentDefinitionDto } from '../api/types/order';

const definitions: ConsentDefinitionDto[] = [
  { id: 'c1', code: 'REQ1', name: 'r1', description: '', type: 'USER', isRequired: true, version: 1, expandedDetails: null },
  { id: 'c2', code: 'OPT', name: 'o1', description: '', type: 'USER', isRequired: false, version: 1, expandedDetails: null },
];

const valid: PersonalDataFormValues = {
  firstName: 'Jan',
  lastName: 'Kowalski',
  email: 'jan@example.com',
  phoneDigits: '123456789',
  consents: { c1: true, c2: false },
};

describe('validatePersonalData', () => {
  it('returns empty errors for valid input', () => {
    expect(validatePersonalData(valid, definitions)).toEqual({});
  });

  it('flags missing firstName', () => {
    expect(validatePersonalData({ ...valid, firstName: '' }, definitions).firstName).toMatch(/wymagan/i);
  });

  it('flags too-short firstName', () => {
    expect(validatePersonalData({ ...valid, firstName: 'A' }, definitions).firstName).toMatch(/co najmniej/i);
  });

  it('flags missing lastName', () => {
    expect(validatePersonalData({ ...valid, lastName: '' }, definitions).lastName).toMatch(/wymagan/i);
  });

  it('flags bad email', () => {
    expect(validatePersonalData({ ...valid, email: 'noatsign' }, definitions).email).toMatch(/format/i);
  });

  it('flags missing phoneDigits', () => {
    expect(validatePersonalData({ ...valid, phoneDigits: '' }, definitions).phoneDigits).toMatch(/wymagan/i);
  });

  it('flags too-short phoneDigits', () => {
    expect(validatePersonalData({ ...valid, phoneDigits: '123' }, definitions).phoneDigits).toMatch(/9 cyfr/i);
  });

  it('flags too-long phoneDigits', () => {
    expect(validatePersonalData({ ...valid, phoneDigits: '1234567890' }, definitions).phoneDigits).toMatch(/maks/i);
  });

  it('flags missing required consent', () => {
    expect(
      validatePersonalData({ ...valid, consents: { c1: false, c2: true } }, definitions).consents,
    ).toMatch(/wymagan/i);
  });

  it('does not flag missing optional consent', () => {
    expect(validatePersonalData({ ...valid, consents: { c1: true } }, definitions).consents).toBeUndefined();
  });
});
