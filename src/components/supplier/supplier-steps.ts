import type { Step } from '../checkout/CheckoutProgressBar';
import { SUPPLIER_CONFIRM_PATH, SUPPLIER_STEP_PATHS } from '../../lib/state/supplier-navigation';

/**
 * Trzy widoczne kroki (§1). Krok ubezpieczeniowy jest na grancie pominięty serwerowo,
 * a metoda płatności leci w tle na ekranie potwierdzenia — żaden z nich nie ma tu kafelka.
 */
export const SUPPLIER_STEPS: Step[] = [
  { number: 1, label: 'Dane organizacji', path: SUPPLIER_STEP_PATHS.COMPANY_DATA },
  { number: 2, label: 'Dane osobiste', path: SUPPLIER_STEP_PATHS.PERSONAL_DATA },
  { number: 3, label: 'Potwierdzenie', path: SUPPLIER_CONFIRM_PATH },
];
