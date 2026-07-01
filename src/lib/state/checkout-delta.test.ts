import { describe, it, expect } from 'vitest';
import {
  companyChanged,
  personalChanged,
  osChanged,
  paymentChanged,
  type CompanyDelta,
  type PersonalDelta,
  type PaymentDelta,
} from './checkout-delta';

const company = (o: Partial<CompanyDelta> = {}): CompanyDelta => ({
  nip: '1234567890', name: 'ACME', street: 'ul. Testowa 1', city: 'Warszawa', postalCode: '00-001', industry: 'it', ...o,
});

describe('companyChanged', () => {
  it('false gdy identyczne', () => {
    expect(companyChanged(company(), company())).toBe(false);
  });
  it('false gdy różnica tylko w formatowaniu NIP i whitespace', () => {
    expect(companyChanged(company({ nip: '1234567890', name: 'ACME' }), company({ nip: '123-456-78-90', name: '  ACME  ' }))).toBe(false);
  });
  it('true gdy zmiana pola', () => {
    expect(companyChanged(company(), company({ city: 'Kraków' }))).toBe(true);
  });
  it('true gdy zmiana industry (value)', () => {
    expect(companyChanged(company({ industry: 'it' }), company({ industry: 'retail' }))).toBe(true);
  });
});

const personal = (o: Partial<PersonalDelta> = {}): PersonalDelta => ({
  firstName: 'Jan', lastName: 'Kowalski', email: 'jan@firma.pl', phoneDigits: '123456789', consents: {}, ...o,
});

describe('personalChanged', () => {
  it('false gdy identyczne', () => {
    expect(personalChanged(personal(), personal())).toBe(false);
  });
  it('false gdy consents {} vs same wartości false', () => {
    expect(personalChanged(personal({ consents: {} }), personal({ consents: { a: false, b: false } }))).toBe(false);
  });
  it('true gdy zaznaczono zgodę', () => {
    expect(personalChanged(personal({ consents: {} }), personal({ consents: { a: true } }))).toBe(true);
  });
  it('true gdy zmiana emaila (po trim)', () => {
    expect(personalChanged(personal({ email: 'jan@firma.pl' }), personal({ email: 'inny@firma.pl' }))).toBe(true);
  });
  it('false gdy email różni się tylko whitespace', () => {
    expect(personalChanged(personal({ email: 'jan@firma.pl' }), personal({ email: ' jan@firma.pl ' }))).toBe(false);
  });
});

describe('osChanged', () => {
  it('false gdy identyczne odpowiedzi', () => {
    expect(osChanged({ Q1: 'YES', Q2: 'NO' }, { Q1: 'YES', Q2: 'NO' })).toBe(false);
  });
  it('false gdy {} vs {} (reload przy ukończonym kroku)', () => {
    expect(osChanged({}, {})).toBe(false);
  });
  it('true gdy zmiana odpowiedzi', () => {
    expect(osChanged({ Q1: 'YES' }, { Q1: 'NO' })).toBe(true);
  });
  it('true gdy dodano odpowiedź', () => {
    expect(osChanged({ Q1: 'YES' }, { Q1: 'YES', Q2: 'YES' })).toBe(true);
  });
});

const payment = (o: Partial<PaymentDelta> = {}): PaymentDelta => ({ paymentMethod: 'STRIPE_CHECKOUT', discountCode: null, ...o });

describe('paymentChanged', () => {
  it('false gdy ta sama metoda i brak rabatu', () => {
    expect(paymentChanged(payment(), payment())).toBe(false);
  });
  it('false gdy ten sam kod rabatowy', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: 'LATO10' }))).toBe(false);
  });
  it('true gdy zmiana metody płatności', () => {
    expect(paymentChanged(payment({ paymentMethod: 'STRIPE_CHECKOUT' }), payment({ paymentMethod: 'BANK_TRANSFER' }))).toBe(true);
  });
  it('true gdy inny kod rabatowy', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: 'ZIMA20' }))).toBe(true);
  });
  it('true gdy usunięto rabat (kod → null)', () => {
    expect(paymentChanged(payment({ discountCode: 'LATO10' }), payment({ discountCode: null }))).toBe(true);
  });
});
