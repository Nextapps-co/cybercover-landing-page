import { describe, it, expect } from 'vitest';
import { validatePostalCode, normalizePostalCode } from './postal-code';

describe('normalizePostalCode', () => {
  it('leaves canonical format unchanged', () => {
    expect(normalizePostalCode('00-001')).toBe('00-001');
  });

  it('strips leading/trailing spaces', () => {
    expect(normalizePostalCode('  00-001  ')).toBe('00-001');
  });
});

describe('validatePostalCode', () => {
  it('returns null for valid XX-XXX', () => {
    expect(validatePostalCode('00-001')).toBeNull();
    expect(validatePostalCode('30-123')).toBeNull();
  });

  it('returns error for empty', () => {
    expect(validatePostalCode('')).toMatch(/wymagan/i);
  });

  it('returns error for wrong format', () => {
    expect(validatePostalCode('00001')).toMatch(/XX-XXX/i);
    expect(validatePostalCode('00-01')).toMatch(/XX-XXX/i);
    expect(validatePostalCode('000-001')).toMatch(/XX-XXX/i);
    expect(validatePostalCode('aa-bbb')).toMatch(/XX-XXX/i);
  });
});
