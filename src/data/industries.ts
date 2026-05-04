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
