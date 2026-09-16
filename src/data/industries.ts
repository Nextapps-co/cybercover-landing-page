export interface IndustryOption {
  value: string;
  label: string;
}

export const INDUSTRIES: IndustryOption[] = [
  { value: 'IT', label: 'IT / Oprogramowanie' },
  { value: 'FINANCE', label: 'Finanse / Bankowość' },
  { value: 'HEALTHCARE', label: 'Zdrowie / Medycyna' },
  { value: 'EDUCATION', label: 'Edukacja' },
  { value: 'RETAIL', label: 'Handel detaliczny' },
  { value: 'WHOLESALE', label: 'Handel hurtowy' },
  { value: 'MANUFACTURING', label: 'Produkcja / Przemysł' },
  { value: 'CONSTRUCTION', label: 'Budownictwo' },
  { value: 'TRANSPORT', label: 'Transport / Logistyka' },
  { value: 'REAL_ESTATE', label: 'Nieruchomości' },
  { value: 'PROFESSIONAL_SERVICES', label: 'Usługi profesjonalne (prawne, doradcze)' },
  { value: 'HOSPITALITY', label: 'Gastronomia / Hotelarstwo' },
  { value: 'ENTERTAINMENT', label: 'Rozrywka / Media' },
  { value: 'AGRICULTURE', label: 'Rolnictwo' },
  { value: 'ENERGY', label: 'Energetyka' },
  { value: 'PUBLIC_ADMIN', label: 'Administracja publiczna' },
  { value: 'NON_PROFIT', label: 'Organizacje non-profit' },
  { value: 'OTHER', label: 'Inne' },
];

// Wspólne dla trzech lejków (checkout, dostawca, WK) — PATCH /orders/:id/company-data
// wysyła polską etykietę, nie surowy kod ze selecta, więc każdy formularz musi
// konwertować w obie strony. Było po jednej kopii w każdym komponencie; scalone tu,
// żeby trzecia rozbieżna kopia (WK) nie odrodziła się przy najbliższej zmianie.
export function industryLabelFromValue(value: string): string {
  return INDUSTRIES.find(i => i.value === value)?.label ?? '';
}

export function industryValueFromLabel(label: string): string {
  return INDUSTRIES.find(i => i.label === label)?.value ?? '';
}
