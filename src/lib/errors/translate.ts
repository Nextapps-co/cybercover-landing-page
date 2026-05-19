import { ApiError, type ApiErrorCode } from '../api/types/errors';

export interface TranslatedError {
  title: string;
  message: string;
  actionable: boolean; // true = user can fix (retry / correct input); false = internal/server
}

const TRANSLATIONS: Record<ApiErrorCode, TranslatedError> = {
  // User-correctable (400-range)
  INVALID_NIP: {
    title: 'Nieprawidłowy NIP',
    message: 'Nieprawidłowy NIP. Sprawdź pisownię — oczekiwane 10 cyfr, myślniki i spacje są akceptowane.',
    actionable: true,
  },
  INVALID_POSTAL_CODE: {
    title: 'Nieprawidłowy kod pocztowy',
    message: 'Kod pocztowy musi być w formacie XX-XXX (np. 00-001).',
    actionable: true,
  },
  INVALID_COMPANY_DATA: {
    title: 'Niepoprawne dane firmy',
    message: 'Sprawdź wprowadzone dane firmy — jedno z pól zawiera błąd.',
    actionable: true,
  },
  INVALID_CONSENT: {
    title: 'Nieaktualne zgody',
    message: 'Treść zgód została zaktualizowana. Odśwież stronę i zaakceptuj ponownie.',
    actionable: true,
  },
  INCOMPLETE_CHECKOUT: {
    title: 'Checkout niekompletny',
    message: 'Wypełnij wszystkie kroki zanim potwierdzisz zamówienie.',
    actionable: true,
  },
  INVALID_ROLE_ASSIGNMENT: {
    title: 'Błąd przypisania roli',
    message: 'Wewnętrzny problem z danymi zamówienia. Skontaktuj się z pomocą techniczną.',
    actionable: false,
  },
  ORDER_NOT_FOUND: {
    title: 'Zamówienie nie istnieje',
    message: 'Zamówienie nie istnieje lub wygasło. Wróć do cennika i zacznij od nowa.',
    actionable: true,
  },
  INVALID_CONFIRMATION_ACCESS: {
    title: 'Link wygasł',
    message: 'Link do potwierdzenia zamówienia wygasł lub jest niepoprawny.',
    actionable: false,
  },
  INVALID_ORDER_STATE: {
    title: 'Niewłaściwy stan zamówienia',
    message: 'Nie można wykonać tej operacji — zamówienie jest w innym stanie. Odśwież stronę.',
    actionable: true,
  },
  EMAIL_NOT_AVAILABLE: {
    title: 'Email zajęty',
    message: 'Ten email jest już zarejestrowany. Użyj innego adresu lub zaloguj się do portalu klienta.',
    actionable: true,
  },
  DISCOUNT_SOURCE_CONFLICT: {
    title: 'Konflikt rabatów',
    message: 'Rabatu partnera i kodu rabatowego nie można łączyć. Wybierz jeden.',
    actionable: true,
  },
  DISCOUNT_CODE_NOT_FOUND: {
    title: 'Niepoprawny kod',
    message: 'Kod rabatowy nie istnieje lub wygasł.',
    actionable: true,
  },
  COMPANY_LOOKUP_UNAVAILABLE: {
    title: 'Rejestry niedostępne',
    message: 'Rejestry firm (CEIDG/KRS) są chwilowo niedostępne. Wypełnij dane firmy ręcznie.',
    actionable: true,
  },
  HANDOFF_TOKEN_INVALID_OR_EXPIRED: {
    title: 'Sesja wygasła',
    message: 'Link do zmiany planu wygasł lub został już użyty. Wróć do portalu i kliknij "Zmień plan" jeszcze raz.',
    actionable: true,
  },
  USER_INACTIVE: {
    title: 'Konto nieaktywne',
    message: 'Twoje konto zostało dezaktywowane. Skontaktuj się z administratorem firmy.',
    actionable: false,
  },
  PLAN_CHANGE_PENDING: {
    title: 'Zmiana planu w toku',
    message: 'Masz niedokończone zamówienie zmiany planu. Wznawiamy je teraz.',
    actionable: true,
  },
  DOWNGRADE_NOT_ALLOWED: {
    title: 'Niedostępne',
    message: 'Nie możesz przejść na niższy plan niż aktualny. Wybierz wyższy plan.',
    actionable: true,
  },
  REACTIVATION_DOWNGRADE_NOT_ALLOWED: {
    title: 'Niedostępne',
    message: 'Reaktywacja jest możliwa tylko na poprzedni plan lub wyższy. Wybierz inny plan.',
    actionable: true,
  },
  DISCOUNT_NOT_ALLOWED_FOR_ORDER_TYPE: {
    title: 'Kod niedostępny',
    message: 'Ten kod promocyjny nie obowiązuje przy zmianie planu.',
    actionable: true,
  },
  OPERATIONAL_STANDARDS_REQUIRED: {
    title: 'Wypełnij ankietę',
    message: 'Musisz uzupełnić standardy operacyjne zanim potwierdzisz zamówienie.',
    actionable: true,
  },
  PROFORMA_NOT_ISSUED: {
    title: 'Błąd faktury',
    message: 'Nie udało się wygenerować faktury proforma. Skontaktuj się z pomocą techniczną.',
    actionable: false,
  },
  NETWORK_ERROR: {
    title: 'Brak połączenia',
    message: 'Problem z połączeniem. Sprawdź internet i spróbuj ponownie.',
    actionable: true,
  },
  INTERNAL_ERROR: {
    title: 'Błąd serwera',
    message: 'Coś poszło nie tak po naszej stronie. Spróbuj za chwilę.',
    actionable: false,
  },
  UNKNOWN: {
    title: 'Nieznany błąd',
    message: 'Wystąpił nieznany błąd. Odśwież stronę lub skontaktuj się z pomocą techniczną.',
    actionable: false,
  },
};

export function translateApiError(err: unknown): TranslatedError {
  if (err instanceof ApiError) {
    return TRANSLATIONS[err.code] ?? TRANSLATIONS.UNKNOWN;
  }
  return TRANSLATIONS.UNKNOWN;
}
