/** Formats d'affichage de la planche (valeurs de la maquette : « 12 h 40 », « 104 k », « 01:20 »). */

/** `760` -> `12 h 40` : la durée hors ligne telle que l'écrit l'en-tête de la planche. */
export function dureeHorsLigne(minutes: number): string {
  const total = Math.max(0, Math.trunc(minutes));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")}`;
}

/** `2027-01-05T01:20:00.000+01:00` -> `01:20` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `2027-01-05T01:20:00.000+01:00` -> `2027-01-05` : le jour de Douala, tel que l'API l'écrit. */
function jourDouala(iso: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1] ?? "";
}

/** L'instant donné, ramené au jour de Douala (`2027-01-05`), quel que soit le fuseau de l'appareil. */
export function jourDeDouala(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export type JourRelatif =
  | { jour: "aujourdhui" }
  | { jour: "hier" }
  | { jour: "date"; date: string };

/** Jour de la dernière synchronisation par rapport à `maintenant` : aujourd'hui, hier, ou une date « 03/01 ». */
export function jourRelatif(iso: string, maintenant: Date): JourRelatif {
  const jour = jourDouala(iso);
  const aujourdhui = jourDeDouala(maintenant);
  if (jour === aujourdhui) return { jour: "aujourdhui" };
  const veille = jourDeDouala(new Date(Date.parse(`${aujourdhui}T12:00:00+01:00`) - 86_400_000));
  if (jour === veille) return { jour: "hier" };
  const [, mois = "", numero = ""] = /^\d{4}-(\d{2})-(\d{2})$/.exec(jour) ?? [];
  return { jour: "date", date: `${numero}/${mois}` };
}

/** Cash compact de la tuile : `104000` -> `104 k`, `850` -> `850`. */
export function cashCourt(fcfa: number): string {
  const entier = Math.max(0, Math.trunc(fcfa));
  return entier >= 1000 ? `${Math.round(entier / 1000)} k` : String(entier);
}

/** `GU3-DLA` -> `GU3` : la planche écrit « Recharger la SIM de GU3 ». */
export function codeGuichet(code: string): string {
  return code.split("-")[0] ?? code;
}

/**
 * Les constats du diagnostic arrivent en texte brut ; la planche met en gras l'élément qui explique le blocage
 * (« éteint depuis 01:20 », « crédit épuisé »). On repère ces formules dans le texte.
 */
const EN_GRAS = /éteint depuis \d{2}:\d{2}|crédit épuisé/g;

export interface Fragment {
  texte: string;
  gras: boolean;
}

export function fragmentsConstat(constat: string): Fragment[] {
  const fragments: Fragment[] = [];
  let debut = 0;
  for (const trouve of constat.matchAll(EN_GRAS)) {
    if (trouve.index > debut) {
      fragments.push({ texte: constat.slice(debut, trouve.index), gras: false });
    }
    fragments.push({ texte: trouve[0], gras: true });
    debut = trouve.index + trouve[0].length;
  }
  if (debut < constat.length) fragments.push({ texte: constat.slice(debut), gras: false });
  return fragments;
}
