import type { Step } from '../checkout/CheckoutProgressBar';

/**
 * Pasek postępu liczony RAZ, z pierwszej odpowiedzi stanu, i zamrożony.
 *
 * `operationalStandardsRequired` jest liczone jako negacja „krok zaliczony", więc
 * przełącza się true → false, gdy użytkownik ten krok zatwierdzi (§3.1 reguła 3).
 * Liczony na żywo pasek skurczyłby się w trakcie kreatora.
 *
 * `path` zostaje puste: ten lejek ma jedną trasę, a CheckoutProgressBar używa
 * tego pola tylko jako danych, nie renderuje z niego odnośnika.
 */
export function wkSteps(osRequired: boolean): Step[] {
  const steps: Step[] = [
    { number: 1, label: 'Dane firmy', path: '' },
    { number: 2, label: 'Dane osobiste', path: '' },
  ];
  if (osRequired) steps.push({ number: 3, label: 'Bezpieczeństwo', path: '' });
  steps.push({ number: steps.length + 1, label: 'Potwierdzenie', path: '' });
  return steps;
}
