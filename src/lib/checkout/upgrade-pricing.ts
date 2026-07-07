// CC-533 — "Do zapłaty teraz" dla zamówienia PLAN_UPGRADE w boksie podsumowania.
//
// - Rabat utrwalony na zamówieniu: proration.amountDueNow już zawiera i kredyt, i rabat,
//   a previewDiscountAmount = 0 → zwracamy amountDueNow bez zmian.
// - Rabat w podglądzie (po „Zastosuj", przed „Dalej"): amountDueNow to jeszcze kwota po
//   proracji BEZ rabatu (fullPrice − credit), więc odejmujemy podglądowy rabat.
//
// Clamp do 0 — rabat kwotowy może przewyższyć kwotę po proracji. Wszystko w groszach netto.
export function computeUpgradeDueNow(
  amountDueNow: number,
  previewDiscountAmount: number,
): number {
  return Math.max(0, amountDueNow - previewDiscountAmount);
}
