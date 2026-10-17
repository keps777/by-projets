/** Comptes de la recette : ceux du seed de développement (`seed.ts`) et ceux de `semer-recette.cjs`. */
export const PIN = "482916";
export const MOT_DE_PASSE = "Recette-Mdp-2026!";
/** PIN de validation du superviseur (caisses, annulations). */
export const PIN_SUPERVISEUR = "739152";

export const COMPTES = {
  guichetier: { role: "guichetier", telephone: "+237655000002", secret: PIN },
  guichetier2: { role: "guichetier", telephone: "+237655000012", secret: PIN },
  guichetier3: { role: "guichetier", telephone: "+237655000013", secret: PIN },
  convoyeur: { role: "convoyeur", telephone: "+237655000021", secret: PIN },
  chauffeur: { role: "chauffeur", telephone: "+237655000022", secret: PIN },
  superviseur: { role: "superviseur", telephone: "+237655000003", secret: MOT_DE_PASSE },
  patron: { role: "patron", telephone: "+237655000004", secret: MOT_DE_PASSE },
} as const;

export type NomCompte = keyof typeof COMPTES;

/** Ce que le banc démarre et ce qu'il transmet aux scénarios (`inject("pile")`). */
export interface Pile {
  urlApi: string;
  urlWeb: string | null;
  /** Fichier où l'API écrit ses journaux (les « SMS » du simulateur y sont lus). */
  journalApi: string;
  /** Serveur PostgreSQL sans nom de base : `postgresql://afri@localhost:5432`. */
  serveurPg: string;
  base: string;
  /** Dossier de l'API compilée (`apps/api`). */
  dossierApi: string;
  racine: string;
  /**
   * Instant (ms) où l'API a répondu pour la première fois, ou `null` si elle n'a pas été lancée par la recette. Sert
   * à situer le balayage d'une minute de la clôture automatique des caisses (voir `fenetreSansBalayage`).
   */
  apiPretA: number | null;
}
