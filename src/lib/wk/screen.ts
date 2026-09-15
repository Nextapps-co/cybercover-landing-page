import type { WkConfigResponseDto } from '../api/types/wk-config';
import type { Screen } from './types';

/**
 * Jedyne miejsce, które decyduje, co użytkownik widzi.
 *
 * 🔴 Kolejność jest wymogiem bezpieczeństwa, nie stylem. `status` NAJPIERW:
 * druga osoba z tej samej firmy, która kliknie odnośnik partnera w trakcie
 * zakładania firmy przez pierwszą, dostaje ten sam `orderId`. Kontrakt daje jej
 * wtedy `status: PROVISIONING` i `prefill: null`, ale `entryStep` może nadal
 * wskazywać formularz. Sprawdzenie `entryStep` przed `status` pokazałoby jej
 * ekran z cudzymi danymi (§4.4, §6 reguła 2).
 *
 * `entryStep: 'done'` nie mówi, co dalej — mówi to `status`. To celowy podział
 * kontraktu: jedno pole, jedna odpowiedzialność.
 */
export function screenFor(config: WkConfigResponseDto): Screen {
  if (config.status === 'COMPLETED') return { kind: 'exit' };
  if (config.status === 'PROVISIONING') return { kind: 'provisioning' };

  // Dopiero teraz entryStep — i tylko dla IN_PROGRESS.
  switch (config.entryStep) {
    case 'company-data':
      return { kind: 'company-data' };
    case 'personal-data':
      return { kind: 'personal-data' };
    case 'operational-standards':
      return { kind: 'operational-standards' };
    case 'ready-to-complete':
      return { kind: 'summary' };
    // 'done' przy IN_PROGRESS jest poza kontraktem — tak samo każda wartość,
    // której jeszcze nie znamy. Nie zgadujemy.
    default:
      return { kind: 'notice', variant: 'unexpected-state' };
  }
}
