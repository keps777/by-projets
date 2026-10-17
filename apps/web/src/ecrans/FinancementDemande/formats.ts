/** Formats d'affichage du dossier de financement (valeurs de la maquette : « 6 000 000 », « 6 M », « ≈ 7 semaines »). */

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `6000000` -> `6 000 000`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Montant abrégé du sous-titre : `6000000` -> `6 M`, `1500000` -> `1,5 M`, `250000` -> `250 k`, `950` -> `950`.
 * Une décimale au plus, sans zéro inutile.
 */
export function montantCourt(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  if (absolu >= 1_000_000) return `${decimale(Math.round(absolu / 100_000) / 10)} M`;
  if (absolu >= 1000) return `${decimale(Math.round(absolu / 100) / 10)} k`;
  return String(absolu);
}

/** Taux entier ou décimal : `12` -> `12`, `12.5` -> `12,5`. */
export function taux(pourcent: number): string {
  return decimale(pourcent);
}

/**
 * Délai de réponse promis, en heures entières : de l'envoi à `reponseAvant` (« réponse sous 24 h »). Les deux
 * instants sont des ISO à Douala ; jamais moins d'une heure.
 */
export function heuresDeReponse(envoyeA: string, reponseAvant: string): number {
  const ms = new Date(reponseAvant).getTime() - new Date(envoyeA).getTime();
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 3_600_000)) : 24;
}

/** « au 1er billet » -> `[{ texte: "au 1" }, { exposant: "er" }, { texte: " billet" }]` : la planche écrit les rangs en exposant. */
export type MorceauTexte = { texte: string } | { exposant: string };

export function morceauxRang(texte: string): MorceauTexte[] {
  const morceaux = texte.split(/(\d+)(er|e)(?=\s|$)/);
  const sortie: MorceauTexte[] = [];
  for (let i = 0; i < morceaux.length; i += 3) {
    const avant = (morceaux[i] ?? "") + (morceaux[i + 1] ?? "");
    if (avant !== "") sortie.push({ texte: avant });
    const exposant = morceaux[i + 2];
    if (exposant !== undefined) sortie.push({ exposant });
  }
  return sortie;
}
