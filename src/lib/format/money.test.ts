import { describe, it, expect } from 'vitest';
import { formatMinorUnits, formatPricePerCycle } from './money';

describe('formatMinorUnits', () => {
  it('formats 0 grosze as "0 zł"', () => {
    expect(formatMinorUnits(0, 'PLN')).toBe('0 zł');
  });

  it('formats 100 grosze as "1 zł"', () => {
    expect(formatMinorUnits(100, 'PLN')).toBe('1 zł');
  });

  it('formats 29500 grosze as "295 zł"', () => {
    expect(formatMinorUnits(29500, 'PLN')).toBe('295 zł');
  });

  it('formats 26550 grosze as "265,50 zł"', () => {
    expect(formatMinorUnits(26550, 'PLN')).toBe('265,50 zł');
  });

  it('formats 159500 grosze as "1 595 zł"', () => {
    expect(formatMinorUnits(159500, 'PLN')).toBe('1 595 zł');
  });

  it('formats 143550 grosze as "1 435,50 zł"', () => {
    expect(formatMinorUnits(143550, 'PLN')).toBe('1 435,50 zł');
  });
});

describe('proration display (CC-353 doc example)', () => {
  // Standard → Optimum, miesięcznie: 594,00 / −147,50 / 446,50 zł
  it('formats fullPrice 59400 grosze as "594 zł"', () => {
    expect(formatMinorUnits(59400, 'PLN')).toBe('594 zł');
  });

  it('formats credit 14750 grosze as "147,50 zł" (FE prefixes the minus)', () => {
    expect(formatMinorUnits(14750, 'PLN')).toBe('147,50 zł');
  });

  it('formats amountDueNow 44650 grosze as "446,50 zł"', () => {
    expect(formatMinorUnits(44650, 'PLN')).toBe('446,50 zł');
  });
});

describe('formatPricePerCycle', () => {
  it('formats monthly price', () => {
    expect(formatPricePerCycle({ amount: 49500, currency: 'PLN' }, 'MONTHLY')).toBe('495 zł / mies.');
  });

  it('formats annual price', () => {
    expect(formatPricePerCycle({ amount: 594000, currency: 'PLN' }, 'ANNUAL')).toBe('5 940 zł / rok');
  });
});
