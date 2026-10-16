/** « 7500 » devient « 7 500 » (espace de groupement, comme dans les maquettes). */
export function formaterMontant(valeur: number): string {
  const signe = valeur < 0 ? "-" : "";
  const chiffres = String(Math.round(Math.abs(valeur)));
  return signe + chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Initiales (2 lettres au plus) d'un nom : « Samuel E. » devient « SE ». */
export function initialesDe(nom: string): string {
  const mots = nom
    .trim()
    .split(/\s+/)
    .filter((mot) => /\p{L}/u.test(mot));
  if (mots.length === 0) return "";
  if (mots.length === 1) return [...(mots[0] ?? "")].slice(0, 2).join("").toUpperCase();
  const premiere = [...(mots[0] ?? "")][0] ?? "";
  const derniere = [...(mots[mots.length - 1] ?? "")][0] ?? "";
  return (premiere + derniere).toUpperCase();
}

/** Classes CSS jointes, en ignorant les valeurs vides. */
export function classes(...noms: (string | false | null | undefined)[]): string {
  return noms.filter(Boolean).join(" ");
}
