/** Formats de l'écran « modifier ou ajouter une personne » : téléphone (« 6 77 12 34 23 »), salaire (« 95 000 »), noms. */

/** Indicatif du Cameroun : un numéro saisi sans « + » est un numéro camerounais à 9 chiffres. */
const INDICATIF = "237";

/**
 * Numéro de l'API (`+237677123423`) -> ce que la planche écrit (« 6 77 12 34 23 »). Un numéro étranger, que la planche
 * ne prévoit pas, reste tel que l'API le donne.
 */
export function afficherTelephone(e164: string): string {
  const national = e164.startsWith(`+${INDICATIF}`) ? e164.slice(INDICATIF.length + 1) : "";
  if (!/^\d{9}$/.test(national)) return e164;
  return `${national[0]!} ${national.slice(1, 3)} ${national.slice(3, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`;
}

/**
 * Numéro saisi -> numéro de l'API (`+237…`), ou `null` si ce n'est pas un numéro. Accepte « 6 77 12 34 23 »,
 * « 677123423 », « 237 677 12 34 23 » et « +237677123423 » ; un numéro qui commence par « + » est gardé tel quel
 * (9 à 15 chiffres, comme le contrat).
 */
export function lireTelephone(saisie: string): string | null {
  const texte = saisie.trim();
  const chiffres = texte.replace(/\D/g, "");
  if (texte.startsWith("+")) return /^\d{9,15}$/.test(chiffres) ? `+${chiffres}` : null;
  const national =
    chiffres.length === 12 && chiffres.startsWith(INDICATIF) ? chiffres.slice(3) : chiffres;
  return /^\d{9}$/.test(national) ? `+${INDICATIF}${national}` : null;
}

/** Montant FCFA tel que la planche l'écrit : `95000` -> `95 000` (une espace entre les milliers). */
export function formaterMontant(fcfa: number): string {
  return String(Math.abs(Math.trunc(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant saisi : « 95 000 » -> 95000 ; une saisie sans chiffre est « vide » (`null`), jamais 0. */
export function lireMontant(saisie: string): number | null {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 9);
  return chiffres === "" ? null : Number(chiffres);
}

/** « Joseph Mbappé » -> « Joseph M. » : le prénom et l'initiale du dernier mot, comme l'en-tête de la planche. */
export function nomCourt(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return mots[0] ?? "";
  const dernier = mots[mots.length - 1]!;
  // « Marie T. » ou « B. Ngo » sont déjà courts : on ne les raccourcit pas une seconde fois.
  if (/^\p{L}\.$/u.test(dernier) || /^\p{L}\.$/u.test(mots[0]!)) return mots.join(" ");
  return `${mots[0]!} ${dernier[0]!.toLocaleUpperCase()}.`;
}

/** « 2027-01-05 » -> « 5 janv. 2027 » (le mois abrégé de la langue de l'écran). */
export function formaterJour(jour: string, langue: string): string {
  const [annee, mois, j] = jour.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(annee, mois - 1, j));
  const locale = langue === "en" ? "en-GB" : "fr-FR";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
