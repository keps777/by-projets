/**
 * Formats d'affichage de l'analyse d'un bus, ceux de la planche : « 3,1 M », « + 0,6 M », « 1,6 » (millions sans
 * unité), « + 61 k », « − 310 k », « 98 000 », « 2 h 10 », « 40 min », « − 62 % ».
 */

function decimale(valeur: number): string {
  return valeur.toFixed(1).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `98000` -> `98 000`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Montant en millions avec une décimale : `3100000` -> `3,1 M`. Sous 100 000 la planche ne montre rien : le montant
 * passe en milliers (`61000` -> `61 k`) pour ne pas écrire « 0,0 M ».
 */
export function millions(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "";
  if (absolu >= 100_000) return `${signe}${decimale(Math.round(absolu / 100_000) / 10)} M`;
  if (absolu >= 1000) return `${signe}${Math.round(absolu / 1000)} k`;
  return `${signe}${Math.round(absolu)}`;
}

/** Millions sans unité, pour les détails de dépenses : `1600000` -> `1,6`. */
export function millionsSansUnite(fcfa: number): string {
  return decimale(Math.round(Math.abs(fcfa) / 100_000) / 10);
}

/** Net avec son signe : `600000` -> `+ 0,6 M`, `-300000` -> `− 0,3 M`, `0` -> `0`. */
export function net(fcfa: number): string {
  if (fcfa === 0) return "0";
  return fcfa > 0 ? `+ ${millions(fcfa)}` : millions(fcfa);
}

/**
 * Net d'un trajet, en milliers comme la planche : `61000` -> `+ 61 k`, `-310000` -> `− 310 k`. Un trajet ne dépasse
 * pas le million ; au-delà, le montant passe en millions.
 */
export function netTrajet(fcfa: number): string {
  if (fcfa === 0) return "0";
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "+ ";
  if (absolu >= 1_000_000) return `${signe}${decimale(Math.round(absolu / 100_000) / 10)} M`;
  if (absolu >= 1000) return `${signe}${Math.round(absolu / 1000)} k`;
  return `${signe}${Math.round(absolu)}`;
}

/** Variation : `-62` -> `− 62 %`, `5` -> `+ 5 %`, `0,5` -> `+ 0,5 %`, `0` -> `0 %`. */
export function variation(pourcent: number): string {
  if (pourcent === 0) return "0 %";
  const valeur = String(Math.abs(pourcent)).replace(".", ",");
  return `${pourcent < 0 ? "−" : "+"} ${valeur} %`;
}

/** Remplissage : `71` -> `71`, `71.5` -> `71,5`. */
export function taux(pourcent: number): string {
  return String(Math.round(pourcent * 10) / 10).replace(".", ",");
}

/** Durée d'un incident ou d'un retard : `130` -> `2 h 10`, `125` -> `2 h 05`, `120` -> `2 h`, `40` -> `40 min`. */
export function duree(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const heures = Math.floor(total / 60);
  const reste = total % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}
