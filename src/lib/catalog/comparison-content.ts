// Treść cennika: co renderujemy i z którego klucza katalogu to bierzemy.
//
// ZASADA: ten plik nie zawiera ANI JEDNEJ wartości opisującej zawartość planu.
// Liczby, kwoty i flagi pochodzą wyłącznie z `features` w odpowiedzi
// GET /api/pricing-catalog. Tutaj mieszka polska treść i mapowanie na klucze.
// Dzięki temu zmiana planu w katalogu jest widoczna bez deploya frontu.

import type { FeatureMap } from '../api/types/catalog';

export type SectionIconName = 'shield' | 'pulse' | 'chat' | 'alert' | 'insurance' | 'education' | 'users';

/** `display: true` = sam ptaszek, bez tekstu wartości. */
export type CellState =
  | { kind: 'present'; display: string | true }
  | { kind: 'absent' };

/** Zamiana surowej wartości z katalogu na tekst w komórce. */
export type ValueFormatter = (raw: string, features: FeatureMap) => string | true;

export interface RowDef {
  /** Nazwa cechy — w układzie Surfera powtarza się w każdej kolumnie. */
  label: string;
  /** Klucz decydujący o obecności wiersza i o stanie komórki. */
  key: string;
  /** Dodatkowe klucze, które wiersz konsumuje (np. trzy obszary oceny). */
  alsoReads?: string[];
  /** Zdanie pod nazwą — co ten wiersz znaczy. */
  explanation?: string;
  /** Wiersz podrzędny: wcięcie + kropka zamiast ptaszka. */
  subItem?: boolean;
  /** Pogrubienie wartości. */
  emphasize?: boolean;
  format?: ValueFormatter;
  /** Skrót na kartę. Brak → wiersz nie trafia do podlinii karty. */
  cardSummary?: (display: string) => string;
}

export interface ComparisonSectionDef {
  title: string;
  subtitle?: string;
  icon: SectionIconName;
  /** Plakietka sekcji jeszcze nieuruchomionej, np. 'Wkrótce'. */
  badge?: string;
  footnote?: string;
  rows: RowDef[];
}

/**
 * Wartość obecna w katalogu? "false" i pusty string znaczą „nie ma".
 *
 * `FeatureMap = Record<string, string>` to obietnica typu, nie runtime'u — backend
 * potrafi przysłać `null` albo liczbę zamiast pominąć klucz. Bez `typeof === 'string'`
 * taki `null` przechodził jako „ustawiony" i zabijał formatter (`null.split(…)`),
 * a więc całą wyspę React. Sprawdzamy typ, nie samą różność od undefined.
 */
function isSet(raw: unknown): raw is string {
  return typeof raw === 'string' && raw !== '' && raw !== 'false';
}

/** Klucze, z których wiersz czyta — główny plus opcjonalne dodatkowe. */
function rowKeys(row: RowDef): string[] {
  return [row.key, ...(row.alsoReads ?? [])];
}

/**
 * O obecności komórki decyduje KTÓRYKOLWIEK z kluczy wiersza (`key` + `alsoReads`),
 * tak samo jak o obecności całego wiersza w `isRowKnown`. Inaczej wiersz wielokluczowy
 * mógłby się renderować (bo katalog zna `.technical`) i jednocześnie mieć wszystkie
 * komórki wyszarzone (bo `resolveCell` patrzyłby tylko na `.legal`).
 *
 * `format` dostaje surową wartość pierwszego ustawionego klucza — wiersze wielokluczowe
 * i tak sięgają po całą mapę `features` drugim argumentem.
 */
export function resolveCell(row: RowDef, features: FeatureMap): CellState {
  const raw = rowKeys(row).map(k => features[k]).find(isSet);
  if (raw === undefined) return { kind: 'absent' };
  if (row.format) return { kind: 'present', display: row.format(raw, features) };
  return { kind: 'present', display: raw === 'true' ? true : raw };
}

/**
 * Czy katalog w ogóle zna ten wiersz? Jeśli żaden plan go nie ma, nie pokazujemy
 * go nikomu — inaczej obiecywalibyśmy rzecz, o której backend nic nie mówi.
 */
export function isRowKnown(row: RowDef, allFeatures: FeatureMap[]): boolean {
  const keys = rowKeys(row);
  return allFeatures.some(f => keys.some(k => isSet(f[k])));
}

// ── Formattery ────────────────────────────────────────────────────────
// Konwencja `unlimited` jest już używana przez katalog (konsultacje, wielodostęp).

export const timesPerYear: ValueFormatter = raw =>
  raw === 'unlimited' ? 'bez limitu' : `${raw}x w roku`;

export const pipeList: ValueFormatter = raw =>
  raw.split('|').map(s => s.trim()).filter(Boolean).join('\n');

/**
 * Intl wstawia między grupy cyfr NBSP (U+00A0) albo wąski NBSP (U+202F), zależnie
 * od wersji ICU — normalizujemy oba na zwykłą spację. Zapis przez sekwencje ucieczki,
 * NIE przez wklejone znaki: dwa niewidzialne bajty obok siebie już raz zostały wzięte
 * za duplikat i skasowane.
 */
export function normalizeGroupingSpaces(s: string): string {
  return s.replace(/[\u00A0\u202F]/g, ' ');
}

/** Kwoty ubezpieczenia jadą jako pełne złotówki, nie grosze. */
export const plnAmount: ValueFormatter = raw => {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return `${normalizeGroupingSpaces(new Intl.NumberFormat('pl-PL', { useGrouping: true }).format(n))} zł`;
};

/**
 * Znane poziomy tłumaczymy, nieznane przepuszczamy surowe. Domyślka „ogólne" dla
 * wszystkiego innego pokazywałaby wartość, której API nie wysłało (np. dla 'basic'),
 * czyli aktywne przekłamanie zamiast degradacji.
 */
export const reportLevel: ValueFormatter = raw => {
  if (raw === 'detailed') return 'szczegółowe';
  if (raw === 'general') return 'ogólne';
  return raw;
};

export const maxUsers: ValueFormatter = raw =>
  raw === 'unlimited' ? 'bez limitu' : raw;

// ── Treść ─────────────────────────────────────────────────────────────
// 9 sekcji, 39 wierszy — dokładnie wg spec § 5.2. Kolejność sekcji i wierszy
// ma znaczenie (odzwierciedla v6), więc nie sortować.

export const COMPARISON: ComparisonSectionDef[] = [
  {
    title: 'Wskaźnik cyberbezpieczeństwa',
    subtitle: 'stan bezpieczeństwa organizacji w trzech obszarach, wraz z zaleceniami do wdrożenia',
    icon: 'shield',
    rows: [
      {
        label: 'Zakres oceny',
        key: 'feature.securityAssessment.legal',
        alsoReads: ['feature.securityAssessment.technical', 'feature.securityAssessment.people'],
        // Lista składa się z obszarów, które katalog faktycznie włączył — wyłączenie
        // jednego w API usuwa linię, nie cały wiersz. Komórka jest obecna, gdy plan ma
        // KTÓRYKOLWIEK z trzech kluczy (patrz `resolveCell`), więc katalog może przysłać
        // np. sam `.technical` i wiersz dalej pokazuje wartość, nie wyszarzenie.
        format: (_raw, f) => [
          f['feature.securityAssessment.legal'] === 'true' ? 'Prawo i organizacja' : null,
          f['feature.securityAssessment.technical'] === 'true' ? 'Technologia i sprzęt' : null,
          f['feature.securityAssessment.people'] === 'true' ? 'Ludzie i dostępy' : null,
        ].filter(Boolean).join('\n'),
      },
      { label: 'Wskaźnik w każdym obszarze', key: 'feature.securityAssessment.quarterlyScore',
        explanation: 'aktualizowany co kwartał' },
      { label: 'Zalecenia i rekomendacje', key: 'feature.securityAssessment.report',
        explanation: 'co poprawić i co konkretnie wdrożyć', format: reportLevel },
      { label: 'Popraw sam albo ze wsparciem', key: 'feature.securityAssessment.remediationGuidance',
        explanation: 'co zrobisz własnymi siłami, a co warto zlecić' },
      { label: 'Dowód spełnienia', key: 'feature.securityAssessment.complianceEvidence',
        explanation: 'czym wykażesz się przed audytorem' },
      { label: 'Sankcje i podstawa prawna', key: 'feature.securityAssessment.legalBasis',
        explanation: 'czym grozi niespełnienie i z czego wynika' },
    ],
  },

  {
    title: 'Monitoring osobisty',
    subtitle: 'widzisz, gdzie i kiedy wyciekły Wasze dane',
    icon: 'users',
    rows: [
      { label: 'Wycieki danych powiązane z adresem e-mail', key: 'feature.monitoring.email' },
      { label: 'Gdzie i kiedy nastąpił wyciek', key: 'feature.monitoring.leak.whenWhere' },
      { label: 'Skala wycieku', key: 'feature.monitoring.leak.scale' },
      { label: 'Jakie dane wyciekły', key: 'feature.monitoring.leak.dataTypes' },
    ],
  },

  {
    title: 'Monitoring strony',
    subtitle: 'strona sprawdzana co pięć minut, dzień i noc, bez Twojego udziału',
    icon: 'pulse',
    rows: [
      { label: 'Dostępność strony i niezawodność serwera', key: 'feature.monitoring.web' },
      { label: 'Szybkość ładowania', key: 'feature.monitoring.web.performance' },
      { label: 'Jakość strony: wydajność, SEO, standardy', key: 'feature.monitoring.web.quality' },
      { label: 'Ważność domeny', key: 'feature.monitoring.web.domainExpiry' },
      { label: 'Ważność certyfikatu SSL', key: 'feature.monitoring.web.sslExpiry' },
    ],
  },

  {
    title: 'E-learning o cyberbezpieczeństwie',
    subtitle: 'wiedza w dowolnym momencie',
    icon: 'education',
    badge: 'Wkrótce',
    rows: [
      { label: 'Wiedza on-line dla pracowników', key: 'feature.elearning.selfService',
        explanation: 'dostępne na żądanie' },
      { label: 'Podstawowe praktyki cyberhigieny', key: 'feature.elearning.basicHygiene',
        subItem: true, explanation: 'zakres wymagany przez NIS2' },
      { label: 'Certyfikat ukończenia', key: 'feature.elearning.certificate',
        subItem: true, explanation: 'dowód przeszkolenia na wypadek kontroli' },
    ],
  },

  {
    title: 'Konsultacje z ekspertami',
    subtitle: 'masz kogo zapytać, jeśli czegoś nie rozumiesz',
    icon: 'chat',
    rows: [
      { label: 'Konsultacje', key: 'feature.consultation.timesPerYear', format: timesPerYear,
        cardSummary: v => `**${v}**` },
      { label: 'Tematy', key: 'feature.consultation.topics', format: pipeList },
    ],
  },

  {
    title: 'Dedykowane szkolenia z cyberbezpieczeństwa',
    subtitle: 'zespół wie, co zrobić, zanim kliknie',
    icon: 'education',
    rows: [
      { label: 'Szkolenia prowadzone on-line', key: 'feature.training.online.timesPerYear',
        explanation: 'z trenerem, dla całego zespołu', format: timesPerYear,
        cardSummary: v => `on-line **${v}**` },
      { label: 'Szkolenie dla Kierownictwa/VIP/Zarządów', key: 'feature.training.executive.timesPerYear',
        format: timesPerYear, cardSummary: v => `Kierownictwo/VIP/Zarządy **${v}**` },
      { label: 'Dokument potwierdzający udział', key: 'feature.training.attendanceDocument',
        explanation: 'wymagany przez art. 8e ust. 3 ustawy o KSC' },
    ],
  },

  {
    title: 'Natychmiastowa pomoc 24h w razie incydentu cyberbezpieczeństwa',
    subtitle: 'zespół reagujący na incydent, mobilizowany o każdej porze',
    icon: 'alert',
    rows: [
      { label: 'Koordynacja działań', key: 'feature.incidentResponse.coordination',
        explanation: 'jedna osoba prowadzi sprawę i spina pracę specjalistów' },
      { label: 'Zabezpieczenie IT', key: 'feature.incidentResponse.forensics',
        explanation: 'informatyka śledcza: ustalenie, co się stało, i odcięcie szkody' },
      { label: 'Obsługa prawna', key: 'feature.incidentResponse.legal',
        explanation: 'co trzeba zgłosić, komu i w jakim terminie' },
      { label: 'Wsparcie PR w kryzysie', key: 'feature.incidentResponse.pr',
        explanation: 'co i kiedy powiedzieć klientom, mediom i pracownikom' },
      { label: 'Odzyskiwanie danych i oczyszczanie systemów', key: 'feature.incidentResponse.recovery' },
      { label: 'Zawiadomienie osób, których dane wyciekły', key: 'feature.incidentResponse.notification' },
    ],
  },

  {
    title: 'Ubezpieczenie',
    subtitle: 'co pokrywa ubezpieczenie, gdy dojdzie do incydentu',
    icon: 'insurance',
    footnote: 'W granicach sumy ubezpieczenia i limitów określonych w warunkach ubezpieczenia.',
    rows: [
      { label: 'Suma ubezpieczenia', key: 'feature.insurance.coverageAmount', emphasize: true,
        format: plnAmount, cardSummary: v => `do **${v}**` },
      { label: 'Udział własny', key: 'feature.insurance.deductible', emphasize: true,
        format: plnAmount, cardSummary: v => `udział własny **${v}**` },
      { label: 'Roszczenia osób trzecich i koszty obrony prawnej', key: 'feature.insurance.includesThirdPartyClaims' },
      { label: 'Kary administracyjne i koszty postępowania przed organem nadzoru', key: 'feature.insurance.includesAdminProceedings' },
      { label: 'Koszty odtworzenia danych i systemów', key: 'feature.insurance.includesDataRestoration',
        explanation: 'także wymiana systemu, gdy naprawa jest droższa' },
      { label: 'Koszty ochrony reputacji', key: 'feature.insurance.includesReputationProtection',
        explanation: 'doradcy PR i prawni, do 185 dni od zgłoszenia' },
      { label: 'Odpowiedzialność multimedialna', key: 'feature.insurance.includesMultimediaLiability',
        explanation: 'roszczenia za treści publikowane w mediach cyfrowych' },
      { label: 'Koszty okupu, wymuszeń i szantażu', key: 'feature.insurance.includesRansomCosts' },
      { label: 'Utracony zysk przy przerwie w działaniu', key: 'feature.insurance.includesLostProfit' },
    ],
  },

  {
    title: 'Wielodostęp',
    subtitle: 'widzi to nie tylko jedna osoba w organizacji',
    icon: 'users',
    rows: [
      {
        label: 'Liczba dodatkowych użytkowników',
        key: 'feature.multiUser.maxUsers',
        format: maxUsers,
        cardSummary: v => v === 'bez limitu'
          ? '**bez limitu** użytkowników'
          : `do **${v}** użytkowników`,
      },
    ],
  },
];
