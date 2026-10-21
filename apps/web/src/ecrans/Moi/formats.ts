/** Formats de l'écran Moi : montants, numéros, dates (valeurs de la maquette : « 1 250 », « +237 6 91 22 10 08 », « mar. 5 janv. »). */

/** « 7500 » -> « 7 500 » (espace ordinaire, comme la maquette). */
export function formaterMontant(montant: number): string {
  return String(Math.trunc(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * `+237691221008` -> `+237 6 91 22 10 08`. Un numéro d'un autre pays est rendu tel que le serveur l'envoie
 * (on ne devine pas où couper l'indicatif).
 */
export function telephoneLisible(telephone: string): string {
  const m = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(telephone);
  return m ? `+237 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : telephone;
}

/** `+237699123456` -> `6 99 …` : le début du numéro d'un proche, jamais le numéro entier. Vide hors Cameroun. */
export function telephoneMasque(telephone: string | undefined): string | undefined {
  const m = telephone ? /^\+237(\d)(\d{2})\d{6}$/.exec(telephone) : null;
  return m ? `${m[1]} ${m[2]} …` : undefined;
}

/** Langue de mise en forme des dates : le pidgin n'a pas de locale propre, il suit l'anglais. */
function localeDe(langue: string): string {
  return langue === "fr" ? "fr-FR" : "en-GB";
}

/** Les chaînes ISO de l'API portent déjà l'heure de Douala : on lit le jour tel qu'il est écrit. */
function jourUtc(iso: string): Date {
  const [a = 0, m = 1, j = 1] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

/** `2027-01-01T08:00:00.000+01:00` -> `janv. 2027`. */
export function moisAnnee(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(localeDe(langue), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(jourUtc(iso));
}

/** `2027-01-05T08:00:00.000+01:00` -> `mar. 5 janv. · 08:00`. */
export function jourEtHeure(iso: string, langue: string): string {
  const jour = new Intl.DateTimeFormat(localeDe(langue), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(jourUtc(iso));
  return `${jour} · ${iso.slice(11, 16)}`;
}

/** Termes de parenté féminins (sans accent) : le contrat ne donne pas le genre, la maquette écrit « prévenue » pour Maman. */
const NOMS_FEMININS = new Set([
  "maman",
  "mama",
  "mere",
  "mamie",
  "tante",
  "tata",
  "soeur",
  "grand-mere",
  "fille",
  "cousine",
  "epouse",
  "femme",
  "niece",
]);

/** Vrai si le nom du proche commence par un terme de parenté féminin (« Maman », « Tante Claire »). */
export function estFeminin(nom: string): boolean {
  const premier = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/)[0];
  return premier !== undefined && NOMS_FEMININS.has(premier);
}
