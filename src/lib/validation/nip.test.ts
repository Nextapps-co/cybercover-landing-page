import { describe, it, expect } from 'vitest';
import { normalizeNip, isValidNipChecksum, validateNip } from './nip';

describe('normalizeNip', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeNip('526-000-12-46')).toBe('5260001246');
    expect(normalizeNip('526 000 12 46')).toBe('5260001246');
    expect(normalizeNip('5260001246')).toBe('5260001246');
  });

  it('leaves non-digit characters as evidence of invalid', () => {
    expect(normalizeNip('abc123')).toBe('abc123');
  });
});

describe('isValidNipChecksum', () => {
  it('accepts valid NIP (Ministerstwo Finansów test: 5260001246)', () => {
    expect(isValidNipChecksum('5260001246')).toBe(true);
  });

  it('rejects NIP with wrong checksum', () => {
    expect(isValidNipChecksum('5260001247')).toBe(false);
  });

  it('rejects NIP of wrong length', () => {
    expect(isValidNipChecksum('123')).toBe(false);
    expect(isValidNipChecksum('52600012460')).toBe(false);
  });

  it('rejects NIP with non-digit characters', () => {
    expect(isValidNipChecksum('abcdefghij')).toBe(false);
  });

  it('rejects all-zeros', () => {
    expect(isValidNipChecksum('0000000000')).toBe(false);
  });
});

describe('validateNip', () => {
  it('returns null for valid NIP', () => {
    expect(validateNip('526-000-12-46')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateNip('')).toMatch(/wymagan/i);
  });

  it('returns error for non-10-digit', () => {
    expect(validateNip('123')).toMatch(/10 cyfr/i);
  });

  it('returns error for bad checksum', () => {
    expect(validateNip('5260001247')).toMatch(/NIP/i);
  });
});
