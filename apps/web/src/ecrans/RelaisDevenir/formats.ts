/** « 8400 » -> « 8 400 » (espace ordinaire, comme la planche). Un montant décimal est ramené à l'entier. */
export function formaterMontant(montant: number): string {
  const entier = Math.abs(Math.trunc(montant));
  const texte = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return montant < 0 && entier > 0 ? `-${texte}` : texte;
}
