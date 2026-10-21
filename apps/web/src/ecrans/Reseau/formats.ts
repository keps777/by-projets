import type { voyageur as c } from "@afrimove/contrats";

/** Formats et petits calculs du réseau en direct (valeurs de la maquette : « 07:40 », « DLA »). */

/** `2027-01-05T07:40:00.000+01:00` -> `07:40` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** « 3800 » -> « 3 800 » (espace de groupement, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Codes des villes desservies. L'aperçu du réseau ne donne que des noms alors que la recherche de départs prend
 * des codes (DLA, YDE) : on garde ici la correspondance, comme l'écran Main. Une ville inconnue prend ses trois
 * premières lettres, sans accent.
 */
const CODES_CONNUS: Readonly<Record<string, string>> = {
  Douala: "DLA",
  Yaoundé: "YDE",
  Bafoussam: "BAF",
  Bamenda: "BAM",
  Kribi: "KRI",
  Ngaoundéré: "NGA",
};

export function codeDeVille(nom: string): string {
  const connu = CODES_CONNUS[nom];
  if (connu) return connu;
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Prochain départ d'une ligne de bus parmi les départs du jour : celui qui part à l'heure annoncée par le réseau
 * (`ligne.prochains[0]`). Quand le réseau n'annonce aucune heure (une correspondance), le premier départ qui n'est
 * pas déjà parti. `undefined` si rien ne correspond : on ne propose jamais un autre horaire que celui annoncé.
 */
export function prochainDepart(
  ligne: c.LigneReseau,
  departs: readonly c.DepartVoyageur[],
  maintenant: string,
): c.DepartVoyageur | undefined {
  const annonce = ligne.prochains[0]?.heure;
  const instant = (iso: string) => new Date(iso).getTime();
  if (annonce !== undefined) {
    return departs.find((d) => instant(d.heureDepart) === instant(annonce));
  }
  return [...departs]
    .sort((a, b) => instant(a.heureDepart) - instant(b.heureDepart))
    .find((d) => instant(d.heureDepart) >= instant(maintenant));
}
