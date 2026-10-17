import { ajouterJours, enMs } from "./temps";

/**
 * Règles métier des colis, recopiées de `@afrimove/domain` (non compilé : l'API ne peut pas
 * l'importer à l'exécution, voir README de `apps/api`). `parite.test.ts` compare chaque valeur et
 * chaque transition aux sources : une règle modifiée d'un seul côté fait échouer la CI.
 */

/* ------------------------------------------------------------------ machine d'états */

export const ETATS_COLIS = [
  "enregistre",
  "charge",
  "en_route",
  "decharge",
  "disponible",
  "remis",
  "en_relais",
  "en_livraison",
  "livre",
  "non_retire",
  "retourne",
  "perdu",
  "litige",
] as const;
export type EtatColis = (typeof ETATS_COLIS)[number];

export const ACTIONS_COLIS = [
  "charger",
  "expedier",
  "decharger",
  "rendre_disponible",
  "envoyer_en_relais",
  "mettre_en_livraison",
  "livrer",
  "remettre",
  "marquer_non_retire",
  "retourner",
  "declarer_perdu",
  "ouvrir_litige",
] as const;
export type ActionColis = (typeof ACTIONS_COLIS)[number];

export const TRANSITIONS_COLIS: Readonly<
  Record<EtatColis, Readonly<Partial<Record<ActionColis, EtatColis>>>>
> = {
  enregistre: { charger: "charge", ouvrir_litige: "litige" },
  charge: { expedier: "en_route", declarer_perdu: "perdu", ouvrir_litige: "litige" },
  en_route: { decharger: "decharge", declarer_perdu: "perdu", ouvrir_litige: "litige" },
  decharge: { rendre_disponible: "disponible", declarer_perdu: "perdu", ouvrir_litige: "litige" },
  disponible: {
    remettre: "remis",
    envoyer_en_relais: "en_relais",
    mettre_en_livraison: "en_livraison",
    marquer_non_retire: "non_retire",
    declarer_perdu: "perdu",
    ouvrir_litige: "litige",
  },
  en_relais: {
    remettre: "remis",
    marquer_non_retire: "non_retire",
    declarer_perdu: "perdu",
    ouvrir_litige: "litige",
  },
  en_livraison: {
    livrer: "livre",
    envoyer_en_relais: "en_relais",
    rendre_disponible: "disponible",
    declarer_perdu: "perdu",
    ouvrir_litige: "litige",
  },
  non_retire: { retourner: "retourne", remettre: "remis", ouvrir_litige: "litige" },
  remis: {},
  livre: {},
  retourne: {},
  perdu: { rendre_disponible: "disponible", ouvrir_litige: "litige" },
  litige: {
    rendre_disponible: "disponible",
    remettre: "remis",
    retourner: "retourne",
    declarer_perdu: "perdu",
  },
};

export const ETAT_INITIAL: EtatColis = "enregistre";

export function estEtatColis(valeur: unknown): valeur is EtatColis {
  return typeof valeur === "string" && (ETATS_COLIS as readonly string[]).includes(valeur);
}

export function estActionColis(valeur: unknown): valeur is ActionColis {
  return typeof valeur === "string" && (ACTIONS_COLIS as readonly string[]).includes(valeur);
}

export function peutAppliquer(etat: EtatColis, action: ActionColis): boolean {
  return TRANSITIONS_COLIS[etat][action] !== undefined;
}

/** Une transition demandée n'existe pas dans la machine d'états. */
export class TransitionInterdite extends Error {
  constructor(
    readonly de: EtatColis,
    readonly action: ActionColis,
  ) {
    super(`Transition interdite (colis) : « ${action} » depuis l'état « ${de} »`);
    this.name = "TransitionInterdite";
  }
}

export function etatSuivant(etat: EtatColis, action: ActionColis): EtatColis {
  const vers = TRANSITIONS_COLIS[etat][action];
  if (vers === undefined) throw new TransitionInterdite(etat, action);
  return vers;
}

export function actionsPossibles(etat: EtatColis): ActionColis[] {
  return Object.keys(TRANSITIONS_COLIS[etat]) as ActionColis[];
}

export interface EntreeHistorique {
  action: ActionColis;
  de: EtatColis;
  vers: EtatColis;
  at: string;
  par?: string;
  motif?: string;
}

/* ------------------------------------------------------------------ tarifs */

export type Fcfa = number;
export type ModeColis = "gare" | "relais" | "moto";
export type CanalColis = "agence" | "app";

export const TARIFS = {
  /** Facturé à l'agence par AfriMove, par colis (à sa charge, pas à celle de l'expéditeur). */
  fraisAgenceColis: 150,
  /** Frais payés par l'expéditeur d'un colis créé dans l'app. */
  fraisColisApp: 200,
  assurance: { tauxPct: 2, minimum: 500, plafondValeur: 500_000 },
  relais: { supplement: 300, partRelais: 200 },
  livraison: { minimum: 1000, partLivreurPct: 70 },
} as const;

export interface LigneDevis {
  code: string;
  libelle: string;
  montant: Fcfa;
}

export interface Devis {
  lignes: LigneDevis[];
  total: Fcfa;
}

function entier(valeur: number, nom: string): number {
  if (!Number.isSafeInteger(valeur)) {
    throw new RangeError(`Montant FCFA invalide (entier attendu) : ${nom} = ${String(valeur)}`);
  }
  return valeur;
}

/** `pct` % de `montant`, arrondi à l'entier supérieur (calcul sur entiers, sans flottant). */
function pourcentagePlafond(montant: Fcfa, pct: number): Fcfa {
  const produit = entier(montant * pct, "pourcentage");
  const reste = produit % 100;
  return (produit - reste) / 100 + (reste === 0 ? 0 : 1);
}

/** Prime d'assurance : 2 % de la valeur assurée, minimum 500 F, valeur assurée plafonnée à 500 000 F. */
export function primeAssurance(valeurDeclaree: Fcfa): { valeurAssuree: Fcfa; prime: Fcfa } {
  entier(valeurDeclaree, "valeur");
  if (valeurDeclaree <= 0) throw new RangeError("La valeur à assurer doit être positive");
  const valeurAssuree = Math.min(valeurDeclaree, TARIFS.assurance.plafondValeur);
  const prime = Math.max(
    TARIFS.assurance.minimum,
    pourcentagePlafond(valeurAssuree, TARIFS.assurance.tauxPct),
  );
  return { valeurAssuree, prime };
}

export interface ParamsDevisColis {
  /** Port : prix du transport en gare, fixé par la ligne. */
  port: Fcfa;
  canal: CanalColis;
  mode: ModeColis;
  /** Valeur à assurer ; absent ou 0 = pas d'assurance. */
  valeurAssuree?: Fcfa;
  /** Prix de la livraison moto (mode `moto`), au minimum 1 000 F. */
  prixLivraison?: Fcfa;
}

/**
 * Prix total d'un colis, chaque ligne détaillée : port + frais app (200 F, app seulement) +
 * assurance + option (relais +300 F, moto dès 1 000 F).
 */
export function devisColis(p: ParamsDevisColis): Devis {
  entier(p.port, "port");
  if (p.port < 0) throw new RangeError("Port négatif");
  const lignes: LigneDevis[] = [{ code: "port", libelle: "Port", montant: p.port }];
  if (p.canal === "app") {
    lignes.push({ code: "frais_app", libelle: "Frais AfriMove", montant: TARIFS.fraisColisApp });
  }
  if (p.valeurAssuree !== undefined && p.valeurAssuree > 0) {
    lignes.push({
      code: "assurance",
      libelle: "Assurance",
      montant: primeAssurance(p.valeurAssuree).prime,
    });
  }
  if (p.mode === "relais") {
    lignes.push({
      code: "relais",
      libelle: "Retrait en point relais",
      montant: TARIFS.relais.supplement,
    });
  } else if (p.mode === "moto") {
    const livraison = p.prixLivraison ?? TARIFS.livraison.minimum;
    entier(livraison, "livraison");
    if (livraison < TARIFS.livraison.minimum) {
      throw new RangeError(`Livraison moto : minimum ${TARIFS.livraison.minimum} F`);
    }
    lignes.push({ code: "livraison", libelle: "Livraison moto", montant: livraison });
  }
  return { lignes, total: lignes.reduce((somme, l) => somme + l.montant, 0) };
}

/** Répartition des 300 F du relais : 200 F au relais, le reste à AfriMove. */
export function repartitionRelais(): { voyageur: Fcfa; relais: Fcfa; afrimove: Fcfa } {
  const { supplement, partRelais } = TARIFS.relais;
  return { voyageur: supplement, relais: partRelais, afrimove: supplement - partRelais };
}

/** Répartition d'une livraison moto : 70 % au livreur (arrondi à l'inférieur), le reste à AfriMove. */
export function repartitionLivraison(prixLivraison: Fcfa): { livreur: Fcfa; afrimove: Fcfa } {
  entier(prixLivraison, "livraison");
  if (prixLivraison < TARIFS.livraison.minimum) {
    throw new RangeError(`Livraison moto : minimum ${TARIFS.livraison.minimum} F`);
  }
  const livreur = Math.floor((prixLivraison * TARIFS.livraison.partLivreurPct) / 100);
  return { livreur, afrimove: prixLivraison - livreur };
}

/** Supplément d'un mode par rapport au retrait en gare. */
export function supplementMode(mode: ModeColis, prixLivraison?: Fcfa): Fcfa {
  if (mode === "relais") return TARIFS.relais.supplement;
  if (mode === "moto") return prixLivraison ?? TARIFS.livraison.minimum;
  return 0;
}

/* ------------------------------------------------------------------ garde, essais, photos */

/** Fin de la garde d'un colis disponible : 7 jours. */
export const GARDE_COLIS_JOURS = 7;

export function limiteRetraitColis(disponibleDepuis: string | number | Date): string {
  return ajouterJours(disponibleDepuis, GARDE_COLIS_JOURS);
}

/** Vrai quand le colis n'a pas été retiré dans les 7 jours (« non retiré J+7 »). */
export function colisNonRetire(
  disponibleDepuis: string | number | Date,
  maintenant: string | number | Date,
): boolean {
  return enMs(maintenant) >= enMs(limiteRetraitColis(disponibleDepuis));
}

/** Trois codes faux, puis le colis est bloqué jusqu'à l'intervention d'un superviseur. */
export const ESSAIS_CODE_MAX = 3;

/** Les photos (dépôt, remise) sont supprimées 90 jours après la prise de vue. */
export const RETENTION_PHOTOS_JOURS = 90;

export function expirationPhoto(priseA: string | number | Date): string {
  return ajouterJours(priseA, RETENTION_PHOTOS_JOURS);
}

/** Plage des numéros des colis créés dans l'app, numérotés côté serveur. */
export const PLAGE_EN_LIGNE = { debut: 4001, fin: 9999 } as const;

/** Un poids relevé plus de 1 kg au-dessus du poids déclaré donne lieu à un complément à payer. */
export const SEUIL_DEPASSEMENT_KG = 1;

export function complementPoidsRequis(poidsDeclareKg: number, poidsReleveKg: number): boolean {
  return poidsReleveKg - poidsDeclareKg > SEUIL_DEPASSEMENT_KG;
}

/* ------------------------------------------------------------------ réclamations */

/** Réponse sous 2 jours ouvrés. */
export const DELAI_REPONSE_RECLAMATION_JOURS_OUVRES = 2;

/** Perte prouvée par le suivi et colis non assuré : 10 fois le port. */
export const MULTIPLE_PORT_SI_PERTE = 10;

export const MOTIFS_RECLAMATION = ["perdu", "abime", "retard", "autre"] as const;
export type MotifReclamation = (typeof MOTIFS_RECLAMATION)[number];

/** Plafond d'indemnisation d'un colis : la valeur assurée s'il est assuré, sinon 10 × le port. */
export function plafondIndemnisation(colis: { assure: boolean; valeurAssuree: Fcfa; port: Fcfa }): {
  type: "valeur_assuree" | "multiple_port";
  montant: Fcfa;
} {
  return colis.assure
    ? { type: "valeur_assuree", montant: colis.valeurAssuree }
    : { type: "multiple_port", montant: colis.port * MULTIPLE_PORT_SI_PERTE };
}

/* ------------------------------------------------------------------ affichage */

/** « 1 000 F », comme dans les maquettes. */
export function formaterFcfa(montant: Fcfa): string {
  return `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}
