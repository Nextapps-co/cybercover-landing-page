import { describe, it, expect } from 'vitest';
import { resolveCell, isRowKnown, timesPerYear, pipeList, plnAmount, reportLevel, normalizeGroupingSpaces, COMPARISON } from './comparison-content';
import type { RowDef } from './comparison-content';
import { buildComparisonGrid, planToCardProps } from './render-policy';
import type { PlanCatalogEntryDto } from '../api/types/catalog';

const ROW: RowDef = { label: 'Konsultacje', key: 'feature.consultation.timesPerYear' };
const FLAG: RowDef = { label: 'Obsługa prawna', key: 'feature.incidentResponse.legal' };

describe('resolveCell — reguła widoczności', () => {
  it('klucz "true" → ptaszek', () => {
    expect(resolveCell(FLAG, { 'feature.incidentResponse.legal': 'true' }))
      .toEqual({ kind: 'present', display: true });
  });

  it('klucz z wartością → wartość dosłowna, gdy brak formattera', () => {
    expect(resolveCell(ROW, { 'feature.consultation.timesPerYear': '10' }))
      .toEqual({ kind: 'present', display: '10' });
  });

  it('brak klucza → komórka nieobecna', () => {
    expect(resolveCell(ROW, {})).toEqual({ kind: 'absent' });
  });

  it('klucz "false" traktowany jak brak', () => {
    expect(resolveCell(FLAG, { 'feature.incidentResponse.legal': 'false' }))
      .toEqual({ kind: 'absent' });
  });

  it('pusty string traktowany jak brak', () => {
    expect(resolveCell(ROW, { 'feature.consultation.timesPerYear': '' }))
      .toEqual({ kind: 'absent' });
  });

  it('formatter dostaje surową wartość i całą mapę', () => {
    const row: RowDef = { ...ROW, format: (raw, f) => `${raw}|${Object.keys(f).length}` };
    expect(resolveCell(row, { 'feature.consultation.timesPerYear': '10', 'feature.x': 'true' }))
      .toEqual({ kind: 'present', display: '10|2' });
  });
});

describe('isRowKnown — wiersz znika, gdy katalog o nim nie mówi', () => {
  it('żaden plan nie ma klucza → wiersz nieznany', () => {
    expect(isRowKnown(ROW, [{}, {}, {}, {}])).toBe(false);
  });

  it('choć jeden plan ma klucz → wiersz znany', () => {
    expect(isRowKnown(ROW, [{}, { 'feature.consultation.timesPerYear': '10' }, {}, {}])).toBe(true);
  });

  it('wszystkie plany mają klucz "false" → wiersz nieznany', () => {
    const maps = Array(4).fill({ 'feature.consultation.timesPerYear': 'false' });
    expect(isRowKnown(ROW, maps)).toBe(false);
  });

  it('alsoReads liczy się do znajomości wiersza', () => {
    const row: RowDef = { label: 'Zakres oceny', key: 'feature.securityAssessment.legal',
      alsoReads: ['feature.securityAssessment.people'] };
    expect(isRowKnown(row, [{ 'feature.securityAssessment.people': 'true' }])).toBe(true);
  });
});

// Jedyny wiersz wielokluczowy w całym cenniku — i do tej pory jedyny, którego żaden
// test nie wykonywał. Regresja, której pilnuje: `isRowKnown` liczyło obecność po trzech
// kluczach, a `resolveCell` po jednym, więc katalog bez `.legal` dawał wiersz widoczny
// i cztery wyszarzone komórki w rzędzie, który wszystkie plany mają.
describe('„Zakres oceny" — wiersz czytający trzy klucze naraz', () => {
  const ZAKRES = COMPARISON
    .flatMap(s => s.rows)
    .find(r => r.label === 'Zakres oceny')!;

  const display = (features: Record<string, string>) => resolveCell(ZAKRES, features);

  it('wszystkie trzy klucze → trzy linie w kolejności z treści', () => {
    expect(display({
      'feature.securityAssessment.legal': 'true',
      'feature.securityAssessment.technical': 'true',
      'feature.securityAssessment.people': 'true',
    })).toEqual({
      kind: 'present',
      display: 'Prawo i organizacja\nTechnologia i sprzęt\nLudzie i dostępy',
    });
  });

  it('tylko dwa klucze → wyłączony obszar znika z listy, wiersz zostaje', () => {
    expect(display({
      'feature.securityAssessment.legal': 'true',
      'feature.securityAssessment.people': 'true',
    })).toEqual({ kind: 'present', display: 'Prawo i organizacja\nLudzie i dostępy' });
  });

  it('sam .technical, bez klucza głównego .legal → komórka obecna, nie wyszarzona', () => {
    expect(isRowKnown(ZAKRES, [{ 'feature.securityAssessment.technical': 'true' }])).toBe(true);
    expect(display({ 'feature.securityAssessment.technical': 'true' }))
      .toEqual({ kind: 'present', display: 'Technologia i sprzęt' });
  });

  it('żaden z trzech kluczy → komórka nieobecna i wiersz nieznany', () => {
    expect(display({})).toEqual({ kind: 'absent' });
    expect(isRowKnown(ZAKRES, [{}, {}, {}, {}])).toBe(false);
  });
});

// `FeatureMap = Record<string, string>` to obietnica typu, nie runtime'u. Backend, który
// przyśle `null` zamiast pominąć klucz, przed poprawką przechodził przez `isSet` i zabijał
// formatter (`null.split(…)`), a z nim całą wyspę React.
describe('odporność na wartości nie-stringowe z API', () => {
  const LISTA: RowDef = { label: 'Tematy', key: 'feature.consultation.topics', format: pipeList };
  const KWOTA: RowDef = { label: 'Suma ubezpieczenia', key: 'feature.insurance.coverageAmount',
    format: plnAmount };

  const nieStringi: Array<[string, unknown]> = [
    ['null', null],
    ['liczba', 1000000],
    ['boolean', true],
    ['obiekt', {}],
  ];

  for (const [nazwa, wartosc] of nieStringi) {
    it(`${nazwa} zamiast stringa → komórka nieobecna, bez wyjątku`, () => {
      const features = { 'feature.consultation.topics': wartosc } as unknown as Record<string, string>;
      expect(() => resolveCell(LISTA, features)).not.toThrow();
      expect(resolveCell(LISTA, features)).toEqual({ kind: 'absent' });
      expect(isRowKnown(LISTA, [features])).toBe(false);
    });
  }

  it('null w kwocie nie udaje „0 zł"', () => {
    const features = { 'feature.insurance.coverageAmount': null } as unknown as Record<string, string>;
    expect(resolveCell(KWOTA, features)).toEqual({ kind: 'absent' });
  });
});

describe('formattery', () => {
  it('timesPerYear: liczba → "Nx w roku"', () => {
    expect(timesPerYear('15', {})).toBe('15x w roku');
  });

  it('timesPerYear: sentinel unlimited → "bez limitu"', () => {
    expect(timesPerYear('unlimited', {})).toBe('bez limitu');
  });

  it('pipeList rozbija listę po pionowej kresce', () => {
    expect(pipeList('Prawo|IT|Ludzie', {})).toBe('Prawo\nIT\nLudzie');
  });

  it('plnAmount formatuje pełne złotówki ze spacjami', () => {
    expect(plnAmount('10000000', {})).toBe('10 000 000 zł');
  });

  it('plnAmount radzi sobie z zerem', () => {
    expect(plnAmount('0', {})).toBe('0 zł');
  });

  it('normalizeGroupingSpaces zamienia oba warianty spacji, niezależnie od ICU hosta', () => {
    expect(normalizeGroupingSpaces('2\u00A0500\u202F000')).toBe('2 500 000');
  });

  it('reportLevel tłumaczy poziom raportu', () => {
    expect(reportLevel('general', {})).toBe('ogólne');
    expect(reportLevel('detailed', {})).toBe('szczegółowe');
  });

  it('reportLevel przepuszcza nieznany poziom surowy, zamiast udawać „ogólne"', () => {
    // Backend dokłada poziom, o którym front nie wie — pokazujemy to, co przyszło.
    // Domyślka „ogólne" wypisywałaby wartość, której API nigdy nie wysłało.
    expect(reportLevel('basic', {})).toBe('basic');
    expect(reportLevel('none', {})).toBe('none');
    expect(reportLevel('EXTENDED', {})).toBe('EXTENDED');
  });
});

describe('COMPARISON — kształt treści', () => {
  it('ma 9 sekcji w kolejności z v6', () => {
    expect(COMPARISON.map(s => s.title)).toEqual([
      'Wskaźnik cyberbezpieczeństwa',
      'Monitoring osobisty',
      'Monitoring strony',
      'E-learning o cyberbezpieczeństwie',
      'Konsultacje z ekspertami',
      'Dedykowane szkolenia z cyberbezpieczeństwa',
      'Natychmiastowa pomoc 24h w razie incydentu cyberbezpieczeństwa',
      'Ubezpieczenie',
      'Wielodostęp',
    ]);
  });

  it('ma 39 wierszy łącznie', () => {
    expect(COMPARISON.reduce((n, s) => n + s.rows.length, 0)).toBe(39);
  });

  it('każdy wiersz ma nazwę i klucz feature.*', () => {
    for (const s of COMPARISON) {
      for (const r of s.rows) {
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.key).toMatch(/^feature\./);
      }
    }
  });

  it('klucze wierszy są unikalne', () => {
    const keys = COMPARISON.flatMap(s => s.rows.map(r => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('E-learning niesie plakietkę "Wkrótce"', () => {
    expect(COMPARISON.find(s => s.title.startsWith('E-learning'))?.badge).toBe('Wkrótce');
  });

  it('Ubezpieczenie niesie przypis prawny', () => {
    expect(COMPARISON.find(s => s.title === 'Ubezpieczenie')?.footnote)
      .toContain('W granicach sumy ubezpieczenia');
  });

  it('dokładnie 6 wierszy ma skrót na kartę', () => {
    const withSummary = COMPARISON.flatMap(s => s.rows).filter(r => r.cardSummary);
    expect(withSummary.map(r => r.label)).toEqual([
      'Konsultacje',
      'Szkolenia prowadzone on-line',
      'Szkolenie dla Kierownictwa/VIP/Zarządów',
      'Suma ubezpieczenia',
      'Udział własny',
      'Liczba dodatkowych użytkowników',
    ]);
  });

  it('nie zawiera nazw planów — treść nie może być per plan', () => {
    // Uwaga: `JSON.stringify` pomija funkcje, więc ten test NIE widzi `format`
    // ani `cardSummary`. Realnym strażnikiem wymagania jest test niżej
    // („dwa plany o identycznych features…"), który wykonuje całą projekcję.
    const blob = JSON.stringify(COMPARISON);
    for (const name of ['Standard', 'Optimum', 'Profesjonalny', 'Ekspert']) {
      expect(blob).not.toContain(name);
    }
  });

  it('używa wyłącznie istniejących ikon', () => {
    const allowed = ['shield', 'pulse', 'chat', 'alert', 'insurance', 'education', 'users'];
    for (const s of COMPARISON) expect(allowed).toContain(s.icon);
  });
});

// ── Strażnik wymagania nadrzędnego ────────────────────────────────────────
// „Cennik nie może mieć przyspawanych wartości": o tym, co widać, decyduje wyłącznie
// mapa `features` z katalogu — nigdy `tier`, `planName`, `code` ani kolejność planu.
// Test wykonuje OBIE projekcje (siatkę i kartę), więc widzi też `format` i `cardSummary`,
// których `JSON.stringify(COMPARISON)` nie potrafi obejrzeć.
describe('treść zależy wyłącznie od features, nie od tożsamości planu', () => {
  // Klucze bierzemy z samej treści, żeby test objął każdy wiersz — także dopisany później.
  const WARTOSCI: Record<string, string> = {
    'feature.securityAssessment.report': 'detailed',
    'feature.consultation.timesPerYear': '10',
    'feature.consultation.topics': 'Prawo|IT|Ludzie',
    'feature.training.online.timesPerYear': '2',
    'feature.training.executive.timesPerYear': '1',
    'feature.insurance.coverageAmount': '2500000',
    'feature.insurance.deductible': '0',
    'feature.multiUser.maxUsers': 'unlimited',
  };

  const FEATURES: Record<string, string> = {};
  for (const section of COMPARISON) {
    for (const row of section.rows) {
      for (const key of [row.key, ...(row.alsoReads ?? [])]) {
        FEATURES[key] = WARTOSCI[key] ?? 'true';
      }
    }
  }

  const BAZA: PlanCatalogEntryDto = {
    catalogEntryId: 'CE-A',
    planId: 'P-A',
    code: 'standard',
    planName: 'Standard',
    description: 'Opis A.',
    displayOrder: 1,
    recommended: false,
    tier: 'entry',
    ctaLabel: 'A',
    annualPrice: { amount: 29500, currency: 'PLN' },
    monthlyPrice: { amount: 35400, currency: 'PLN' },
    features: { ...FEATURES },
    discount: null,
  };

  // Ten sam katalog cech, inna tożsamość planu: inny tier, inna nazwa, inny code,
  // inna pozycja i inny opis.
  const BLIZNIAK: PlanCatalogEntryDto = {
    ...BAZA,
    catalogEntryId: 'CE-B',
    planId: 'P-B',
    code: 'expert',
    planName: 'Expert',
    description: 'Opis B.',
    displayOrder: 4,
    recommended: true,
    tier: 'top',
    ctaLabel: 'B',
    features: { ...FEATURES },
  };

  const PLANY = [BAZA, BLIZNIAK];

  it('siatka: identyczne features → identyczne komórki w obu kolumnach', () => {
    const rows = buildComparisonGrid(PLANY, 'ANNUAL').sections.flatMap(s => s.rows);
    // Nie-pusty, inaczej test przeszedłby na pustej siatce.
    expect(rows).toHaveLength(COMPARISON.reduce((n, s) => n + s.rows.length, 0));
    for (const row of rows) {
      expect(row.cells[1]).toEqual(row.cells[0]);
    }
  });

  it('karta: identyczne features → identyczne subLines i included', () => {
    const projekcja = (plan: PlanCatalogEntryDto) =>
      planToCardProps(plan, 'ANNUAL', undefined, PLANY).features
        .map(s => ({ title: s.title, included: s.included, subLines: s.subLines }));

    const a = projekcja(BAZA);
    expect(a).toHaveLength(COMPARISON.length);
    // Nie-pusty: jakaś podlinia musi realnie powstać, żeby porównanie coś znaczyło.
    expect(a.some(s => s.subLines.some(line => line !== ''))).toBe(true);
    expect(projekcja(BLIZNIAK)).toEqual(a);
  });
});
