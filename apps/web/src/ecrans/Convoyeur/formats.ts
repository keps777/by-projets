/** Formats de l'écran Convoyeur (valeurs de la maquette : « 08:34 », « 9 000 », « ALP-DLA-270105-3xxx »). */

/** `2027-01-05T08:34:00.000+01:00` -> `08:34` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `9000` -> `9 000` (espace simple, comme la maquette). */
export function montant(fcfa: number): string {
  return String(Math.trunc(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** AAMMJJ de la date de Douala (UTC+1 toute l'année) : le 5 janvier 2027 donne `270105`. */
export function dateAammjj(instant: Date): string {
  const douala = new Date(instant.getTime() + 60 * 60 * 1000);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deux(douala.getUTCFullYear() % 100)}${deux(douala.getUTCMonth() + 1)}${deux(douala.getUTCDate())}`;
}

export interface Voyageur {
  nom: string | null;
  telephone: string | null;
}

/**
 * Lit la zone « Nom · téléphone » (« Mballa J. · 6 55 … ») : le nom avant le point médian, le téléphone après.
 * Le téléphone est facultatif et peut être partiel : seul un numéro camerounais complet (9 chiffres commençant par 6,
 * éventuellement précédé de +237) devient un `+237…` ; sinon il est ignoré et aucun SMS ne part.
 */
export function lireVoyageur(saisie: string): Voyageur {
  const texte = saisie.trim();
  if (texte === "") return { nom: null, telephone: null };
  const [avant = "", ...apres] = texte.split("·");
  let nom = avant.trim();
  let telephone = apres.join("·").trim();
  if (apres.length === 0 && /^[\d\s+().-]+$/.test(nom)) {
    telephone = nom;
    nom = "";
  }
  const chiffres = telephone.replace(/\D/g, "");
  const national = chiffres.startsWith("237") ? chiffres.slice(3) : chiffres;
  return {
    nom: nom === "" ? null : nom,
    telephone: /^6\d{8}$/.test(national) ? `+237${national}` : null,
  };
}
