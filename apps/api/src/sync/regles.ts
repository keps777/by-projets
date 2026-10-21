import type { Role } from "../socle/auth/roles";

/**
 * Règles de la synchronisation, recopiées du domaine et des contrats (non compilés : voir README).
 * `sync.parite.test.ts` compare chaque valeur à `@afrimove/domain` et `@afrimove/contrats`.
 */

export const LIMITE_HORS_LIGNE_HEURES = 12;
export const DEBLOCAGE_TEMPORAIRE_HEURES = 4;

/** Plus de 5 minutes d'avance sur l'heure du serveur : l'horloge de l'appareil est suspecte. */
export const TOLERANCE_HORLOGE_MS = 5 * 60_000;

export interface Plage {
  debut: number;
  fin: number;
}

export const NB_GUICHETS_AVEC_PLAGE = 3;

/** Guichet 1 : 0001–0999 ; guichet 2 : 1001–1999 ; guichet 3 : 2001–2999. */
export function plageGuichet(rang: number): Plage {
  if (!Number.isInteger(rang) || rang < 1 || rang > NB_GUICHETS_AVEC_PLAGE) {
    throw new RangeError(`Rang de guichet sans plage : ${rang} (1 à ${NB_GUICHETS_AVEC_PLAGE})`);
  }
  return { debut: (rang - 1) * 1000 + 1, fin: (rang - 1) * 1000 + 999 };
}

/** Convoyeurs : 3001–3999 découpé en parts égales. */
export function plageConvoyeur(rang: number, nbConvoyeurs: number): Plage {
  if (!Number.isInteger(nbConvoyeurs) || nbConvoyeurs < 1 || nbConvoyeurs > 999) {
    throw new RangeError(`Nombre de convoyeurs invalide : ${nbConvoyeurs}`);
  }
  if (!Number.isInteger(rang) || rang < 1 || rang > nbConvoyeurs) {
    throw new RangeError(`Rang de convoyeur invalide : ${rang} (1 à ${nbConvoyeurs})`);
  }
  const taille = Math.floor(999 / nbConvoyeurs);
  const debut = 3001 + (rang - 1) * taille;
  return { debut, fin: debut + taille - 1 };
}

/** Les 34 types d'événements de l'agence (`EVENEMENTS_AGENCE` de `@afrimove/contrats`). */
export const TYPES_EVENEMENT = [
  "caisse.ouverte",
  "caisse.comptee",
  "caisse.cloturee",
  "billet.vendu",
  "billet.vendu_cadence",
  "billet.telephone_ajoute",
  "colis.enregistre",
  "colis.depose",
  "impression.demandee",
  "quai.scanne",
  "quai.code_saisi",
  "billet.complete",
  "quai.libere",
  "quai.liste_envoyee",
  "route.billet_vendu",
  "route.scanne",
  "route.colis_decharges",
  "chauffeur.depense",
  "chauffeur.incident",
  "chauffeur.retard",
  "chauffeur.arrivee_arret",
  "controle.siege_verifie",
  "controle.regularise",
  "controle.convoyeur_signale",
  "controle.cloture",
  "annulation.demandee",
  "annulation.decidee",
  "caisse.validee",
  "caisse.refusee",
  "equipe.pin_renouvele",
  "equipe.affectation_changee",
  "equipe.compte_desactive",
  "equipe.personne_debloquee",
  "appareil.debloque",
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

/** Les types qui créent un document numéroté dans la plage de l'appareil. */
export const TYPES_NUMEROTES: readonly TypeEvenement[] = [
  "billet.vendu",
  "billet.vendu_cadence",
  "colis.enregistre",
  "controle.regularise",
  "route.billet_vendu",
];

/** Le colis a son propre compteur dans la plage ; tous les autres numéros sont des billets. */
export type GenreNumero = "billet" | "colis";
export const genreDeNumero = (type: string): GenreNumero =>
  type === "colis.enregistre" ? "colis" : "billet";

/** Rôles qui peuvent envoyer des événements (jamais le voyageur, le patron, AfriMove…). */
export const ROLES_TERRAIN: readonly Role[] = [
  "guichetier",
  "convoyeur",
  "chauffeur",
  "vendeur",
  "controleur",
  "superviseur",
];

/**
 * Qui peut écrire quel type. Les types absents de la table sont ouverts à tous les rôles du
 * terrain. Les ventes reprennent `peutVendre` du domaine (guichetier, convoyeur, vendeur) ;
 * `controle.regularise` est la vente sur place du contrôleur.
 */
export const ROLES_PAR_TYPE: Readonly<Record<string, readonly Role[]>> = {
  "billet.vendu": ["guichetier"],
  "billet.vendu_cadence": ["guichetier"],
  "colis.enregistre": ["guichetier"],
  "route.billet_vendu": ["convoyeur", "vendeur"],
  "controle.regularise": ["controleur"],
  "annulation.decidee": ["superviseur"],
  "caisse.validee": ["superviseur"],
  "caisse.refusee": ["superviseur"],
  "equipe.pin_renouvele": ["superviseur"],
  "equipe.affectation_changee": ["superviseur"],
  "equipe.compte_desactive": ["superviseur"],
  "equipe.personne_debloquee": ["superviseur"],
};

/** Événements qui occupent un siège. */
export const TYPES_SIEGE_OCCUPE: readonly string[] = [
  "billet.vendu",
  "billet.vendu_cadence",
  "route.billet_vendu",
  "controle.regularise",
];

/* ------------------------------------------------------------------ parts de sièges hors ligne (A7) */

/**
 * Part du bus gardée pour la vente connectée (voyageurs en ligne, guichets avec réseau) : les derniers sièges
 * ne sont donnés à aucun téléphone. **Règle provisoire** (15 %), à confirmer avec les compagnies.
 */
export const RESERVE_EN_LIGNE_POURCENT = 15;

export const reserveEnLigne = (capacite: number): number =>
  Math.max(0, Math.min(capacite - 1, Math.ceil((capacite * RESERVE_EN_LIGNE_POURCENT) / 100)));

/**
 * Répartit les sièges d'un bus entre les guichets : un bloc de sièges contigus par guichet, les derniers sièges
 * (`reserve`) restant à la vente connectée. Copie de `repartirPartsHorsLigne` du domaine (`parite.test.ts`),
 * qui travaille sur des identifiants de guichet ; ici, une liste par position (0 = premier guichet).
 */
export function repartirParts(capacite: number, nbGuichets: number, reserve: number): number[][] {
  if (nbGuichets < 1) throw new RangeError("Au moins un guichet");
  if (reserve < 0 || reserve >= capacite) throw new RangeError("Réserve invalide");
  const disponibles = capacite - reserve;
  const base = Math.floor(disponibles / nbGuichets);
  const reste = disponibles % nbGuichets;
  const parts: number[][] = [];
  let prochain = 1;
  for (let i = 0; i < nbGuichets; i++) {
    const taille = base + (i < reste ? 1 : 0);
    parts.push(Array.from({ length: taille }, (_, k) => prochain + k));
    prochain += taille;
  }
  return parts;
}
