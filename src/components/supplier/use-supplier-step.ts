import { useEffect, useState } from 'react';
import { getCheckoutState, getOrder } from '../../lib/api/orders';
import { translateApiError } from '../../lib/errors/translate';
import { navigateBackward } from '../../lib/state/checkout-transition';
import { guardStep, type SupplierStepNumber } from '../../lib/state/supplier-navigation';
import { loadSupplierSession, type SupplierSession } from '../../lib/state/supplier-session';
import { grantOrderProblem, noticeVariantForError } from '../../lib/supplier/guards';
import type { SupplierNoticeVariant } from '../../lib/supplier/types';
import type { OrderResponseDto } from '../../lib/api/types/order';

export type SupplierStepState =
  | { phase: 'loading' }
  | { phase: 'notice'; variant: SupplierNoticeVariant }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; session: SupplierSession; order: OrderResponseDto };

/**
 * Wspólna hydratacja trzech kroków lejka zaproszeniowego:
 * sesja → stan checkoutu → asercje trybu grantu → guard postępu → zamówienie.
 *
 * `orderId` bierzemy z `localStorage`, a NIE z URL-a (§9.7) — trasy tego lejka
 * nie noszą go w query stringu.
 */
export function useSupplierStep(step: SupplierStepNumber): SupplierStepState {
  const [state, setState] = useState<SupplierStepState>({ phase: 'loading' });

  useEffect(() => {
    const session = loadSupplierSession();
    if (!session) {
      setState({ phase: 'notice', variant: 'no-session' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [checkoutState, order] = await Promise.all([
          getCheckoutState(session.orderId, { anonymous: true }),
          getOrder(session.orderId, { anonymous: true }),
        ]);
        if (cancelled) return;

        const problem = grantOrderProblem(checkoutState);
        if (problem) {
          setState({ phase: 'notice', variant: problem });
          return;
        }

        const guard = guardStep(step, checkoutState.progress);
        if (!guard.ok) {
          navigateBackward(guard.redirectTo);
          return; // strona zaraz się zmieni — zostajemy w 'loading'
        }

        setState({ phase: 'ready', session, order });
      } catch (err) {
        if (cancelled) return;
        const variant = noticeVariantForError(err);
        if (variant) {
          setState({ phase: 'notice', variant });
          return;
        }
        setState({ phase: 'error', message: translateApiError(err).message });
      }
    })();

    return () => { cancelled = true; };
  }, [step]);

  return state;
}
