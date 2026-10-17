import type { Gare, Personne } from "./types";

/** Formats de « Mes gares, mes gens » (valeurs de la planche : « 1 412 000 », « − 1 000 », « 14:02 »). */

/** `2027-01-05T14:02:00.000+01:00` -> `14:02` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Groupes de trois chiffres séparés par une espace : `1412000` -> `1 412 000`. */
export function montant(fcfa: number): string {
  return String(Math.abs(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Écart de caisse : `-1000` -> `− 1 000` (vrai signe moins, une espace), `0` -> `0`, `500` -> `+ 500`. */
export function ecart(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${montant(fcfa)}`;
}

export type TonGare = "vert" | "ambre" | "rouge";

/**
 * Couleur de la ligne d'état d'une gare : rouge quand la gare est hors ligne, ambre quand un guichet n'est pas
 * synchronisé ou qu'il y a un écart, vert quand tout est synchronisé sans écart.
 */
export function tonGare(gare: Gare): TonGare {
  if (gare.horsLigneDepuisMinutes !== null) return "rouge";
  const toutSynchronise = gare.synchro.guichetsSynchronises >= gare.synchro.guichets;
  return toutSynchronise && (gare.ecartTotal ?? 0) === 0 ? "vert" : "ambre";
}

/**
 * Ville à écrire dans la ligne d'une gare. La planche écrit « Mvan · Yaoundé · O. Essomba » mais « Akwa · Mme
 * Essono » et « Bafoussam · T. Kamga » : la ville est omise quand le nom la contient déjà et quand c'est celle de la
 * première gare de la liste (le siège de la compagnie, où l'on est « chez soi »).
 */
export function villeAffichee(gare: Gare, gares: readonly Gare[]): string | null {
  const ville = gare.ville.trim();
  if (ville === "") return null;
  if (gare.nom.toLowerCase().includes(ville.toLowerCase())) return null;
  if (gares[0]?.ville.trim() === ville) return null;
  return ville;
}

export type TonAvatar = "ambre" | "bleu" | "vert" | "gris";

/**
 * Couleur des initiales : gris quand la personne est bloquée ou indisponible, ambre quand son PIN est à renouveler,
 * vert pour ceux qui sont sur la route (à bord, en route) et pour les superviseurs, bleu pour les guichetiers et pour
 * ceux qui sont au repos. Le contrat ne porte pas de couleur : c'est une lecture de l'état.
 */
export function tonAvatar(personne: Personne): TonAvatar {
  if (["bloquee", "indisponible", "hors_service"].includes(personne.etat)) return "gris";
  if (personne.indicateur.includes("PIN à renouveler")) return "ambre";
  if (personne.etat === "a_bord" || personne.etat === "en_route") return "vert";
  if (personne.etat === "repos") return "bleu";
  return personne.role === "superviseur" ? "vert" : "bleu";
}

export type TonIndicateur = "neutre" | "ambre" | "rouge";

/**
 * Couleur de la synthèse d'une personne : rouge si elle est bloquée, ambre quand il y a quelque chose à voir (un écart,
 * une panne ou un retard compté, un PIN à renouveler, une personne indisponible), sinon discrète (« 0 écart »,
 * « 8 trajets · à l'heure »).
 */
export function tonIndicateur(personne: Personne): TonIndicateur {
  if (personne.etat === "bloquee") return "rouge";
  if (personne.etat === "indisponible" || personne.indicateur.includes("PIN à renouveler")) {
    return "ambre";
  }
  return /(?<!\d)[1-9]\d*\s+(?:écarts?|pannes?|retards?)/.test(personne.indicateur)
    ? "ambre"
    : "neutre";
}

export type TonEtatPersonne = "vert" | "gris" | "rouge";

/** Couleur de l'état à droite de la ligne : vert au travail, gris au repos ou indisponible, rouge bloqué. */
export function tonEtatPersonne(etat: Personne["etat"]): TonEtatPersonne {
  if (etat === "bloquee") return "rouge";
  if (etat === "repos" || etat === "indisponible" || etat === "hors_service") return "gris";
  return "vert";
}
