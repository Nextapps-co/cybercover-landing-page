import { describe, it, expect } from 'vitest';
import { pluralPl } from './plural';

describe('pluralPl', () => {
  const forms: [string, string, string] = ['zaproszenie', 'zaproszenia', 'zaproszeń'];

  it('1 → forma pojedyncza', () => {
    expect(pluralPl(1, ...forms)).toBe('zaproszenie');
  });

  it('2 → forma „kilka"', () => {
    expect(pluralPl(2, ...forms)).toBe('zaproszenia');
  });

  it('4 → forma „kilka"', () => {
    expect(pluralPl(4, ...forms)).toBe('zaproszenia');
  });

  it('5 → forma „wiele"', () => {
    expect(pluralPl(5, ...forms)).toBe('zaproszeń');
  });

  it('12 → forma „wiele" (wyjątek nastek)', () => {
    expect(pluralPl(12, ...forms)).toBe('zaproszeń');
  });

  it('14 → forma „wiele" (wyjątek nastek)', () => {
    expect(pluralPl(14, ...forms)).toBe('zaproszeń');
  });

  it('22 → forma „kilka"', () => {
    expect(pluralPl(22, ...forms)).toBe('zaproszenia');
  });

  it('25 → forma „wiele"', () => {
    expect(pluralPl(25, ...forms)).toBe('zaproszeń');
  });

  it('112 → forma „wiele" (wyjątek nastek powyżej 100)', () => {
    expect(pluralPl(112, ...forms)).toBe('zaproszeń');
  });
});
