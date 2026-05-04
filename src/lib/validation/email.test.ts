import { describe, it, expect } from 'vitest';
import { validateEmail } from './email';

describe('validateEmail', () => {
  it('returns null for valid email', () => {
    expect(validateEmail('jan@example.com')).toBeNull();
    expect(validateEmail('user.with+tag@sub.example.co.uk')).toBeNull();
  });

  it('returns error for empty', () => {
    expect(validateEmail('')).toMatch(/wymagan/i);
    expect(validateEmail('   ')).toMatch(/wymagan/i);
  });

  it('returns error for missing @', () => {
    expect(validateEmail('notanemail')).toMatch(/format/i);
  });

  it('returns error for missing domain', () => {
    expect(validateEmail('jan@')).toMatch(/format/i);
  });

  it('returns error for missing dot in domain', () => {
    expect(validateEmail('jan@example')).toMatch(/format/i);
  });
});
