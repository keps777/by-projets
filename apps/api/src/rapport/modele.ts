/**
 * Le rapport du soir et les faits dont il est fait.
 *
 * `RapportSoir` est la forme du contrat `RapportSoir` de `@afrimove/contrats` (`patron/rapport.ts`) :
 * l'API ne peut pas importer ce paquet à l'exécution (il n'est pas compilé), la forme est donc
 * recopiée ici et `rapport.test.ts` vérifie, avec le schéma zod du contrat, que ce que produit le
 * module est accepté sans conversion.
 *
 * Les faits (`BilletVendu`, `CaisseDuJour`…) sont ce que les autres modules (billetterie, colis,
 * caisse, supervision, numérotation) fournissent au rapport par les ports de `ports.ts`. Ils sont
 * volontairement plats : un adaptateur PostgreSQL les lit avec une requête par port.
 */

/* ------------------------------------------------------------------ le rapport (contrat) */

export interface RapportGare {
  gareId: string;
  nom: string;
  billets: number;
  /** Somme des écarts de caisse de la gare (compté − attendu), signée. */
  ecart: number;
  /** Ce qui mérite d'être lu : caisses à valider, fusions, soute pleine, trous de numérotation… */
  remarques: string[];
}

export interface RapportSoir {
  /** `AAAA-MM-JJ`, jour de Douala. */
  jour: string;
  /** Instant de Douala où le rapport a été arrêté (21:00 en régime normal). */
  envoyeA: string;
  /** « Rapport du mardi 5 janvier · 3 gares ». */
  titre: string;
  nbGares: number;
  chiffres: {
    billets: number;
    /** Variation du nombre de billets par rapport à la veille, en %, à une décimale. */
    variationBilletsPct: number;
    colis: number;
    litiges: number;
    /** Entiers de FCFA : `recette = cash + momo`. */
    recette: number;
    cash: number;
    momo: number;
  };
  gares: RapportGare[];
  enRoute: {
    billetsConvoyeurs: number;
    controles: number;
    regularisations: number;
    texte: string;
  };
  remplissage: { moyenPct: number; remarque: string | null };
  annulations: { nombre: number; montant: number; toutesAvecPin: boolean };
  enLigne: { billets: number; partPct: number };
  signatures: Array<{ nom: string; gare: string }>;
  questionSuggeree: { question: string; reponse: string };
}

/* ------------------------------------------------------------------ référentiel */

export interface CompagnieRapport {
  id: string;
  /** Nom affiché dans le rapport et dans le message : « Alpha Voyages ». */
  nom: string;
}

export interface GareRapport {
  id: string;
  /** Nom court de la gare : « Akwa », « Mvan ». */
  nom: string;
}

/* ------------------------------------------------------------------ billets */

export type CanalVente = "guichet" | "convoyeur" | "en_ligne" | "vendeur";
export type ModePaiement = "cash" | "momo" | "orange_money";

/**
 * États d'un billet (machine d'états du domaine, `billetterie/regles.ts`). Seuls `annule` et
 * `reserve` (commande en ligne non payée) écartent un billet des ventes.
 */
export type EtatBilletRapport =
  | "reserve"
  | "paye"
  | "embarque"
  | "voyage"
  | "annule"
  | "non_presente"
  | "reporte";

/** Un billet vendu pendant le jour (date de création du billet, heure de Douala). */
export interface BilletVendu {
  id: string;
  /** AGENCE-GARE-AAMMJJ-NNNN. */
  numero: string;
  /** Gare qui a vendu le billet (celle du numéro). */
  gareId: string;
  canal: CanalVente;
  /** `null` : paiement non renseigné (compté comme mobile money, jamais comme cash). */
  mode: ModePaiement | null;
  /** Prix du billet + supplément bagage payé avec : l'argent entré pour ce billet, en FCFA entier. */
  montant: number;
  venduA: string;
  etat: EtatBilletRapport;
  /** Billet issu d'un report : il remplace un billet déjà compté, il n'est pas une vente. */
  reporteDe: string | null;
  /** Billet de cadence : le nom se complète au quai. */
  aCompleterAuQuai: boolean;
  /** Le nom n'a pas encore été complété (billet de cadence sans nom). */
  sansNom: boolean;
  embarque: boolean;
  /** Le bus de ce billet est parti. */
  departParti: boolean;
}

/* ------------------------------------------------------------------ colis */

export interface ColisEnregistre {
  id: string;
  /** C-GARE-AAMMJJ-NNNN. */
  numero: string;
  /** Gare d'origine (celle qui a pris le colis). */
  gareId: string;
  /** Port payé + complément de poids payé au dépôt, FCFA entier. */
  montant: number;
  mode: ModePaiement | null;
  creeA: string;
}

/* ------------------------------------------------------------------ caisses */

export type EtatCaisse = "ouverte" | "cloturee" | "validee";

/** Une session de caisse ouverte pendant le jour. */
export interface CaisseDuJour {
  sessionId: string;
  /** K-GARE-AAMMJJ-GUICHET-N. */
  numero: string;
  gareId: string;
  guichetRang: number;
  etat: EtatCaisse;
  /** Écart signé (compté − attendu) ; `null` tant que la caisse n'est pas clôturée. */
  ecart: number | null;
  /** Clôture automatique de minuit sans aucun comptage. */
  comptageAbsent: boolean;
  validation: { superviseurId: string; superviseurNom: string; at: string } | null;
}

/* ------------------------------------------------------------------ départs */

export type EtatDepartRapport =
  | "programme"
  | "en_vente"
  | "embarquement"
  | "parti"
  | "arrive"
  | "annule"
  | "retarde"
  | "fusionne";

export interface DepartDuJour {
  departId: string;
  /** Gare de départ. */
  gareId: string;
  /** Heure de départ prévue, `HH:MM` (Douala). */
  heure: string;
  etat: EtatDepartRapport;
  /** Places du bus. */
  capacite: number;
  /** Places occupées par un billet non annulé (payé, embarqué, voyagé, non présenté). */
  vendus: number;
  /** Pour un départ fusionné : l'heure (`HH:MM`) du départ dans lequel il a été fusionné. */
  fusionneAvec: string | null;
  /** La soute est pleine (places de soute toutes prises par des colis). */
  soutePleine: boolean;
}

/* ------------------------------------------------------------------ annulations, contrôles, trous */

export interface AnnulationFaite {
  /** Billet annulé (le billet garde son numéro). */
  billetId: string;
  numero: string;
  gareId: string;
  /** Montant rendu au client (remboursement ou avoir), FCFA entier. */
  montant: number;
  /** Décidée par un superviseur avec son PIN (une annulation du voyageur en ligne n'en a pas). */
  avecPin: boolean;
  at: string;
}

/** Un contrôle inopiné à bord d'un bus. */
export interface ControleEnRoute {
  controleId: string;
  /** Où le contrôle a eu lieu : « Edéa ». */
  lieu: string;
  /** Voyageurs sans billet régularisés sur place (billet vendu au contrôleur). */
  regularisations: number;
  /** Ventes en route que le convoyeur n'a pas enregistrées (signalées par le contrôleur). */
  ventesNonEnregistrees: number;
}

/** Un trou de numérotation relevé à la fin de la journée. */
export interface TrouNumerotation {
  gareId: string | null;
  /** Phrase nominative : « Il manque le numéro 0005 (billets) dans la plage 0001–0999 de Joseph ». */
  message: string;
}

/* ------------------------------------------------------------------ l'assistant */

export interface ContexteQuestion {
  compagnieId: string;
  jour: string;
  /** Le départ le moins rempli sous le seuil, s'il y en a un. */
  departFaible: { heure: string; remplissagePct: number } | null;
}

export interface QuestionSuggeree {
  question: string;
  reponse: string;
}
