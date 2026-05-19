// Per spec §5.1.5 — React hook czytający auth state z sessionStorage.
//
// SessionStorage nie emituje storage events w tym samym tabie — wystarczy initial
// read na mount. Jeśli komponent musi reagować na zmiany w trakcie cyklu życia
// (np. handoff zakończony), caller wymusza re-render przez własny stan.

import { useEffect, useState } from 'react';
import { hasSession, getAccessToken } from './session';
import { parseClaims, type JwtClaims } from './jwt-claims';

export interface UseAuthSessionResult {
  hasToken: boolean;
  claims: JwtClaims | null;
}

function readSnapshot(): UseAuthSessionResult {
  if (typeof window === 'undefined') return { hasToken: false, claims: null };
  const hasToken = hasSession();
  const token = getAccessToken();
  const claims = token ? parseClaims(token) : null;
  return { hasToken, claims };
}

export function useAuthSession(): UseAuthSessionResult {
  const [snapshot, setSnapshot] = useState<UseAuthSessionResult>(() => readSnapshot());
  useEffect(() => {
    setSnapshot(readSnapshot());
  }, []);
  return snapshot;
}
