import { useEffect, useRef, useState } from 'react';
import { getWkConfig, wkLoginUrl } from '../../lib/api/wk-config';
import { nextPollDelayMs } from '../../lib/wk/provisioning';
import { noticeVariantForError } from '../../lib/wk/guards';
import type { WkConfigResponseDto } from '../../lib/api/types/wk-config';
import type { WkNoticeVariant } from '../../lib/wk/types';

const SUPPORT_EMAIL = 'support@cybercover.pl';

/** Nieokreślony pasek — mówi „pracujemy", nie kłamie o procentach. */
function WorkingBar() {
  return (
    <div
      className="mt-8 h-1 w-full overflow-hidden rounded-full bg-[#E4E2DF] motion-reduce:bg-[#FED64B]"
      role="presentation"
    >
      <div className="h-full w-1/3 animate-[wk-slide_1.6s_ease-in-out_infinite] rounded-full bg-[#FED64B] motion-reduce:hidden" />
      <style>{`
        @keyframes wk-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

interface Props {
  orderId: string;
  /** Nazwa firmy z ostatniego stanu z prefill — poza IN_PROGRESS prefill jest null. */
  companyName: string | null;
  onAdvance: (next: WkConfigResponseDto) => void;
  onNotice: (v: WkNoticeVariant) => void;
}

export function WkProvisioningScreen({ orderId, companyName, onAdvance, onNotice }: Props) {
  const [tooLong, setTooLong] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const delay = nextPollDelayMs(Date.now() - startedAt.current);
      if (delay === null) {
        // Żaden status nie oznacza „nie powiodło się" (§7.2). Przestajemy odpytywać
        // zamiast kręcić animacją w nieskończoność.
        setTooLong(true);
        return;
      }
      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          // Odpytujemy /borg/config — trasa BEZ limitu. checkout-state ma wspólny
          // kubełek 60/min na adres IP, dzielony przez wszystkich za jednym NAT-em.
          const next = await getWkConfig(orderId);
          if (cancelled) return;
          if (next.status !== 'PROVISIONING') { onAdvance(next); return; }
          void tick();
        } catch (err) {
          if (cancelled) return;
          const variant = noticeVariantForError(err);
          if (variant) { onNotice(variant); return; }
          void tick(); // błąd sieci nie przerywa czekania
        }
      }, delay);
    };

    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orderId, onAdvance, onNotice]);

  if (tooLong) {
    return (
      <div className="bg-white px-4 py-12">
        <div className="mx-auto max-w-[34rem]">
          <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-6" role="status">
            <h1 className="text-xl font-bold text-amber-900">Trwa dłużej niż zwykle</h1>
            <p className="mt-3 text-sm leading-relaxed text-amber-900">
              Zakładanie firmy powinno zająć kilkanaście sekund. Coś je spowalnia.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-amber-900">
              Napisz na {SUPPORT_EMAIL} — sprawdzimy, na czym stanęło. Twoje dane są zapisane,
              nie trzeba ich wpisywać jeszcze raz.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
          >
            Sprawdź jeszcze raz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white px-4 py-20">
      <div className="mx-auto max-w-[34rem]" role="status" aria-live="polite">
        <h1 className="text-4xl font-bold leading-tight text-black">
          {companyName ? <>Zakładamy firmę<br />{companyName}</> : 'Zakładamy Twoją firmę'}
        </h1>
        <p className="mt-4 text-[#6B6965]">Zwykle zajmuje to kilkanaście sekund.</p>
        <WorkingBar />
        <p className="mt-8 max-w-[52ch] text-sm leading-relaxed text-[#6B6965]">
          Możesz zamknąć tę kartę — dokończymy to bez Ciebie. Żeby wejść do CyberCovera,
          kliknij odnośnik w Wolters Kluwer tak samo jak przed chwilą.
        </p>
      </div>
    </div>
  );
}

/** `status: COMPLETED` — ponowne wejście przez bramkę, tym razem znajdzie firmę (§3.8). */
export function WkExitScreen() {
  useEffect(() => {
    // Pełna nawigacja, nigdy fetch. Krótka zwłoka, żeby użytkownik zobaczył, że się udało.
    const timer = setTimeout(() => window.location.assign(wkLoginUrl()), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-white px-4 py-20">
      <div className="mx-auto max-w-[34rem]" role="status" aria-live="polite">
        <h1 className="text-4xl font-bold text-black">Gotowe</h1>
        <p className="mt-4 text-[#6B6965]">Przenosimy Cię do CyberCovera.</p>
        <a href={wkLoginUrl()} className="mt-8 inline-block text-sm text-[#6B6965] underline">
          Nic się nie dzieje? Kliknij tutaj
        </a>
      </div>
    </div>
  );
}
