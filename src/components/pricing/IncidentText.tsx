import { Tooltip } from './Tooltip';

// Treść dymka na słowie „incydent" — port `DYMEK_INCYDENT` z
// `docs/pricelist32-main/wersje/v6.js:485-494`. To generyczna wiedza o tym, jak wygląda
// incydent — nie opisuje konkretnego planu — więc zostaje hardkodowana, a nie ciągnięta z API.
const INCIDENT_TOOLTIP_LINES = [
  'ktoś zaszyfrował Wasze pliki i żąda okupu',
  'ktoś przejął skrzynkę e-mail albo konto w banku',
  'wyciekły dane klientów',
  'strona przestała działać po ataku',
  'ktoś podszywa się pod Waszą organizację',
];

interface Props {
  text: string;
  /** Wyśrodkowuje chmurkę pod kontenerem (pasek grupy nad kartami — v6.js:280-282). */
  center?: boolean;
}

/**
 * Tekst z dymkiem na pierwszym słowie zaczynającym się na „incydent" — port `zDymkiem`
 * z v6.js:493-494. W mockupie działa w czterech miejscach: pasek grupy nad kartami,
 * opis planu, nazwa sekcji w karcie i nazwa sekcji w porównaniu.
 *
 * Chmurka pozycjonuje się względem najbliższego pozycjonowanego przodka (`.cc-tooltip`
 * ma `position: static`), więc kontener, w którym stoi ten tekst, musi mieć `relative`.
 */
export function IncidentText({ text, center = false }: Props) {
  const match = text.match(/incydent\w*/i);
  if (!match || match.index === undefined) return <>{text}</>;
  const start = match.index;
  const end = start + match[0].length;
  return (
    <>
      {text.slice(0, start)}
      <Tooltip
        title="Incydent poznasz po tym, że:"
        lines={INCIDENT_TOOLTIP_LINES}
        className={`cc-tooltip--word${center ? ' cc-tooltip--center' : ''}`}
      >
        {match[0]}
      </Tooltip>
      {text.slice(end)}
    </>
  );
}
