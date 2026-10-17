/** Formats et petits calculs de l'accueil voyageur (valeurs de la maquette : « 07:38 », « Auj. », « DLA »). */

/** `2027-01-05T07:38:00.000+01:00` -> `07:38` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Une ville de l'écran : le code (trois lettres, pour les volets et l'API) et le nom. */
export interface VilleChoisie {
  code: string;
  nom: string;
}

/**
 * Codes des villes desservies. L'API de recherche prend des codes (DLA, YDE) mais la liste des villes
 * (`useReseau().villes`) ne donne que des noms : on garde ici la correspondance, comme le mock du client.
 */
const CODES_CONNUS: Readonly<Record<string, string>> = {
  Douala: "DLA",
  Yaoundé: "YDE",
  Bafoussam: "BAF",
  Bamenda: "BAM",
  Kribi: "KRI",
  Ngaoundéré: "NGA",
};

export const TRAJET_PAR_DEFAUT: { depart: VilleChoisie; arrivee: VilleChoisie } = {
  depart: { code: "DLA", nom: "Douala" },
  arrivee: { code: "YDE", nom: "Yaoundé" },
};

/** Ville à partir de son nom : code connu, sinon les trois premières lettres sans accent. */
export function villeDepuisNom(nom: string): VilleChoisie {
  const connu = CODES_CONNUS[nom];
  if (connu) return { code: connu, nom };
  const sansAccent = nom.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return {
    code: sansAccent
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase(),
    nom,
  };
}

/** Ville renvoyée par l'API (`code` absent pour une ville sans gare). */
export function villeDepuisApi(ville: { code?: string | undefined; nom: string }): VilleChoisie {
  return ville.code ? { code: ville.code, nom: ville.nom } : villeDepuisNom(ville.nom);
}

/** Capacité de référence d'un bus quand le plan de sièges n'est pas connu (jauge de la ligne). */
export const CAPACITE_REFERENCE = 30;

/** En dessous de ce nombre de places libres, la ligne passe en rouge (« plus que 3 »). */
export const SEUIL_URGENCE = 3;

function decouper(jour: string): [number, number, number] {
  const [a = 0, m = 1, j = 1] = jour.split("-").map(Number);
  return [a, m, j];
}

/** Ajoute des jours à un jour calendaire `AAAA-MM-JJ` (sans passer par le fuseau de la machine). */
export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = decouper(jour);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

function formaterJour(jour: string, langue: string, options: Intl.DateTimeFormatOptions): string {
  const [a, m, j] = decouper(jour);
  return new Intl.DateTimeFormat(langue === "fr" ? "fr-FR" : "en-GB", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, j)));
}

/** `2027-01-06` en `mer. 6` : l'étiquette de la puce quand le jour n'est ni aujourd'hui ni demain. */
export function jourCourt(jour: string, langue: string): string {
  return formaterJour(jour, langue, { weekday: "short", day: "numeric" });
}

/** `2027-01-06` en `mercredi 6 janvier`. */
export function jourLong(jour: string, langue: string): string {
  return formaterJour(jour, langue, { weekday: "long", day: "numeric", month: "long" });
}
