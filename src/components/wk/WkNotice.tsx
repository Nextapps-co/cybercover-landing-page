import { wkLoginUrl } from '../../lib/api/wk-config';
import type { WkNoticeVariant } from '../../lib/wk/types';

const SUPPORT_EMAIL = 'support@cybercover.pl';

const TONE: Record<'neutral' | 'warning', string> = {
  neutral: 'border-[#E4E2DF] bg-[#F8F7F4] text-[#0D0D0D]',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
};

function copyFor(variant: WkNoticeVariant): { title: string; paragraphs: string[]; tone: keyof typeof TONE } {
  switch (variant) {
    case 'invalid-link':
      return {
        title: 'Ten adres jest nieaktualny',
        paragraphs: [
          'Link stracił ważność albo został otwarty niepoprawnie.',
          'Wróć do Wolters Kluwer i kliknij odnośnik do CyberCovera jeszcze raz — zajmie to chwilę, bo jesteś tam zalogowany.',
        ],
        tone: 'neutral',
      };
    case 'rate-limited':
      return {
        title: 'Za dużo prób',
        paragraphs: [
          'Odczekaj minutę i spróbuj ponownie.',
          'Jeśli kilka osób z Twojej firmy konfiguruje konto w tej samej chwili, poczekajcie na siebie.',
        ],
        tone: 'warning',
      };
    case 'unexpected-state':
      return {
        title: 'Nie wiemy, co pokazać',
        paragraphs: [
          'Konfiguracja jest w stanie, którego nie rozpoznajemy. To nie jest błąd po Twojej stronie.',
          `Wróć do Wolters Kluwer i wejdź ponownie. Jeśli to się powtórzy, napisz na ${SUPPORT_EMAIL}.`,
        ],
        tone: 'warning',
      };
  }
}

export function WkNotice({ variant }: { variant: WkNoticeVariant }) {
  const copy = copyFor(variant);
  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-[34rem]">
        <div className={`rounded-[12px] border p-6 ${TONE[copy.tone]}`} role="status">
          <h1 className="text-xl font-bold">{copy.title}</h1>
          {copy.paragraphs.map((text, i) => (
            <p key={i} className="mt-3 text-sm leading-relaxed">{text}</p>
          ))}
        </div>
        {/* Jedyne wyjście awaryjne (§5). Ponowne wejście przez bramkę trwa sekundę —
            sesja u partnera żyje i nie zapyta o hasło. */}
        <a
          href={wkLoginUrl()}
          className="mt-6 block rounded-[80px] bg-[#FED64B] px-7 py-3 text-center text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Wróć do CyberCovera
        </a>
      </div>
    </div>
  );
}

export function WkLoading({ label = 'Wczytujemy konfigurację…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-[#6B6965]">{label}</div>
  );
}

export function WkLoadError({ message }: { message: string }) {
  return (
    <div className="bg-white px-4 py-12">
      <div className="mx-auto max-w-[34rem]">
        <div className="rounded-[12px] border border-red-300 bg-red-50 p-6" role="alert">
          <h1 className="text-lg font-semibold text-red-800">Nie udało się wczytać danych</h1>
          <p className="mt-2 text-sm text-red-700">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-[80px] bg-[#FED64B] px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          Spróbuj ponownie
        </button>
      </div>
    </div>
  );
}
