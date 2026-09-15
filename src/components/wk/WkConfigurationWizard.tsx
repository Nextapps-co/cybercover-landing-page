import { useCallback, useEffect, useRef, useState } from 'react';
import { WkCompanyDataScreen } from './WkCompanyDataScreen';
import { WkPersonalDataScreen } from './WkPersonalDataScreen';
import { WkOperationalStandardsScreen } from './WkOperationalStandardsScreen';
import { WkLoadError, WkLoading, WkNotice } from './WkNotice';
import { wkSteps } from './wk-steps';
import { getWkConfig } from '../../lib/api/wk-config';
import { translateApiError } from '../../lib/errors/translate';
import { screenFor } from '../../lib/wk/screen';
import { noticeVariantForError } from '../../lib/wk/guards';
import type { WkConfigResponseDto } from '../../lib/api/types/wk-config';
import type { Screen, WkNoticeVariant } from '../../lib/wk/types';
import type { Step } from '../checkout/CheckoutProgressBar';

/**
 * Jedyny stanowy orkiestrator lejka. Trzyma `orderId`, ostatnią odpowiedź stanu
 * i fazę — nic więcej. Formularze mają własny stan i oddają wynik przez `onAdvance`.
 *
 * `orderId` czytany RAZ, w tym jednym miejscu (§7.1). Nie zdejmujemy go z paska
 * adresu: odświeżenie strony stałoby się ślepym zaułkiem, a kontrakt wymaga,
 * żeby strona otwierała się na dowolnym kroku (§4.3).
 */
export function WkConfigurationWizard() {
  const [orderId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('orderId'),
  );
  const [config, setConfig] = useState<WkConfigResponseDto | null>(null);
  const [notice, setNotice] = useState<WkNoticeVariant | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** „Wstecz" to LOKALNA zmiana ekranu, nigdy wywołanie serwera. */
  const [override, setOverride] = useState<Screen | null>(null);

  /** Pasek postępu zamrożony na pierwszym odczycie — patrz wk-steps.ts. */
  const stepsRef = useRef<Step[] | null>(null);
  const osRequiredRef = useRef(false);

  const apply = useCallback((next: WkConfigResponseDto) => {
    if (stepsRef.current === null) {
      osRequiredRef.current = next.operationalStandardsRequired;
      stepsRef.current = wkSteps(next.operationalStandardsRequired);
    }
    setOverride(null);
    setConfig(next);
  }, []);

  const reload = useCallback(async () => {
    if (!orderId) return;
    try {
      apply(await getWkConfig(orderId));
    } catch (err) {
      const variant = noticeVariantForError(err);
      if (variant) setNotice(variant);
      else setLoadError(translateApiError(err).message);
    }
  }, [orderId, apply]);

  useEffect(() => {
    // Brak orderId i 404 to dla użytkownika jedno i to samo: adres jest nieaktualny.
    if (!orderId) {
      setNotice('invalid-link');
      return;
    }
    void reload();
  }, [orderId, reload]);

  if (notice) return <WkNotice variant={notice} />;
  if (loadError) return <WkLoadError message={loadError} />;
  if (!config || !stepsRef.current) return <WkLoading />;

  const screen = override ?? screenFor(config);
  const shared = {
    orderId: orderId!,
    config,
    steps: stepsRef.current,
    osRequired: osRequiredRef.current,
    onAdvance: apply,
    onReload: reload,
    onNotice: setNotice,
    onBack: (target: Screen) => setOverride(target),
  };

  switch (screen.kind) {
    case 'notice':
      return <WkNotice variant={screen.variant} />;
    case 'company-data':
      return <WkCompanyDataScreen {...shared} />;
    case 'personal-data':
      return <WkPersonalDataScreen {...shared} />;
    case 'operational-standards':
      return <WkOperationalStandardsScreen {...shared} />;
    // Ekrany dokładane w zadaniach 12–13. Do tego czasu loader trzyma island w ryzach.
    default:
      return <WkLoading label="Ekran w budowie" />;
  }
}
