/** Formats d'affichage du comptable (valeurs de la maquette : « 7 648 000 », « 99,8 % », « le 2 »). */

/** Groupes de trois chiffres séparés par une espace : `7648000` -> `7 648 000`. */
export function milliers(valeur: number): string {
  const groupes = String(Math.abs(Math.trunc(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return valeur < 0 ? `− ${groupes}` : groupes;
}

/**
 * Part des ventes MoMo rapprochées, calculée sur les références opérateur : une vente est rapprochée quand sa
 * référence figure sur le compte marchand, donc `(ventes - sans correspondance) / ventes`. `1 912` ventes dont `4` sans
 * correspondance donnent `99,8 %`.
 *
 * Une décimale, arrondie ; mais tant qu'une référence reste sans correspondance, on n'affiche jamais « 100 % ».
 * Sans aucune vente, il n'y a rien à rapprocher : `100 %`.
 */
export function partRapprochee(ventes: number, sansCorrespondance: number): string {
  if (ventes <= 0) return "100 %";
  const sans = Math.min(Math.max(sansCorrespondance, 0), ventes);
  let dixiemes = Math.round(((ventes - sans) / ventes) * 1000);
  if (sans > 0 && dixiemes >= 1000) dixiemes = 999;
  return `${String(dixiemes / 10).replace(".", ",")} %`;
}

/** `Décembre` -> `décembre` : la planche écrit le nom du mois en minuscules dans ses phrases. */
export function nomDuMois(libelle: string): string {
  return libelle.toLocaleLowerCase("fr-FR");
}

/** Jour d'envoi comme la planche l'écrit après « le » : `2` -> `2`, `1` -> `1er`. */
export function jourDuMois(jour: number): string {
  return jour === 1 ? "1er" : String(jour);
}
