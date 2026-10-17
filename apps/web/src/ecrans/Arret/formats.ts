/** Formats et petits calculs de « Monter en route » (valeurs de la maquette : « 10:05 », « dans 1 h 19 », « 4 500 »). */

/** En dessous de ce délai, l'heure de passage est en ambre ; au-delà, elle passe en gris. */
export const SEUIL_PASSAGE_PROCHE_MINUTES = 60;

/** À ce nombre de places libres ou moins, « · 1 place » passe en rouge (« 3 places » reste en vert). */
export const SEUIL_PLACES_RARES = 2;

/** `2027-01-05T10:05:00.000+01:00` -> `10:05` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** « 4500 » -> « 4 500 » (espace de groupement, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Délai avant le passage : 14 -> « 14 min », 79 -> « 1 h 19 », 125 -> « 2 h 05 », 120 -> « 2 h ». */
export function formaterDelai(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const heures = Math.floor(total / 60);
  const reste = total % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

/** Le bus passe bientôt : son heure est en ambre. */
export function passageProche(minutes: number): boolean {
  return minutes < SEUIL_PASSAGE_PROCHE_MINUTES;
}

/** Il reste peu de places : le nombre de places est en rouge. */
export function placesRares(placesLibres: number): boolean {
  return placesLibres <= SEUIL_PLACES_RARES;
}

/** Ville de départ et d'arrivée d'une ligne : les arrêts de la ligne, sinon son libellé « Douala → Yaoundé ». */
export function extremitesLigne(
  arrets: readonly string[],
  libelle: string,
): { depart: string; arrivee: string } {
  const [depart, arrivee] = libelle.split("→").map((ville) => ville.trim());
  return {
    depart: arrets[0] ?? depart ?? "",
    arrivee: arrets[arrets.length - 1] ?? arrivee ?? "",
  };
}

/** Nom affiché d'une compagnie : « Bêta Express » en classe VIP s'écrit « Bêta Express VIP ». */
export function nomAvecClasse(nom: string, classe: "classique" | "vip"): string {
  return classe === "vip" && !/\bVIP$/i.test(nom) ? `${nom} VIP` : nom;
}
