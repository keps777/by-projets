import type { Arret, Billet, DepartComplet } from "../billetterie/modeles";
import { ETATS_BILLET_SIEGE_OCCUPE, prixProrata, type EtatDepart } from "../billetterie/regles";
import {
  MS_PAR_JOUR,
  MS_PAR_MINUTE,
  debutDuJourDoualaMs,
  enMs,
  jourDouala,
  versIsoDouala,
} from "../billetterie/temps";
import type {
  CategorieDepense,
  ConstatSiege,
  ModePaiementBord,
  NatureIncident,
  PassageRoute,
} from "./modeles";

/**
 * Règles du bord : fonctions pures, sans horloge ni stockage. Les valeurs que le ticket ne fixe pas sont
 * marquées « provisoire » : ce sont des choix de réglage à confirmer avec l'exploitation (voir le README).
 */

/** Numéros des billets vendus à bord (convoyeur, régularisation du contrôleur) : 3001 à 3999. */
export const PLAGE_BORD = { debut: 3001, fin: 3999 } as const;

/** Provisoire : limite de vitesse affichée au chauffeur, en km/h (code de la route, autocar). */
export const LIMITE_VITESSE_KMH = 100;

/** Provisoire : retard proposé au chauffeur par le bouton « Retard », en minutes. */
export const RETARD_PAR_DEFAUT_MINUTES = 20;

/** Provisoire : jour de la paie du chauffeur par MoMo (le ticket dit « le lundi »). */
export const JOUR_DE_PAIE = "lundi" as const;

/** Délai sans position GPS au-delà duquel le chauffeur n'est plus « en direct » (4 envois manqués). */
export const SIGNAL_GPS_PERDU_SECONDES = 120;

/** Billets qui occupent un siège et figurent sur la liste du départ. */
export const ETATS_BILLET_VALIDES = ETATS_BILLET_SIEGE_OCCUPE;

/** Billets dont le voyageur est dans le bus. */
export const ETATS_BILLET_A_BORD = ["embarque", "voyage"] as const;

/** Départs où le convoyeur vend et scanne : le bus embarque ou roule. */
export const ETATS_DEPART_ROUTE: readonly EtatDepart[] = ["embarquement", "parti"];

/** Départs où le chauffeur annonce un retard ou un incident : de la vente jusqu'à la route. */
export const ETATS_DEPART_ANNONCE: readonly EtatDepart[] = [
  "en_vente",
  "embarquement",
  "retarde",
  "parti",
];

/** Départs où le chauffeur ajoute une dépense : jusqu'au rapport qui suit l'arrivée. */
export const ETATS_DEPART_DEPENSE: readonly EtatDepart[] = [
  "embarquement",
  "retarde",
  "parti",
  "arrive",
];

/** Départs que le contrôleur peut contrôler : le bus roule (ou embarque). */
export const ETATS_DEPART_CONTROLE: readonly EtatDepart[] = ["embarquement", "parti"];

/* ------------------------------------------------------------------ billets du bord */

export const estBilletAbord = (b: Pick<Billet, "etat">): boolean =>
  (ETATS_BILLET_A_BORD as readonly string[]).includes(b.etat);

export const estBilletValide = (b: Pick<Billet, "etat">): boolean =>
  (ETATS_BILLET_VALIDES as readonly string[]).includes(b.etat);

/** Le numéro tiré de la plage du bord ? */
export const dansLaPlageBord = (numero: number): boolean =>
  Number.isInteger(numero) && numero >= PLAGE_BORD.debut && numero <= PLAGE_BORD.fin;

export interface PaiementBord {
  mode: ModePaiementBord;
  recu: number;
  rendu: number;
}

/**
 * Le paiement correspond-il au prix ? Cash : le reçu couvre le prix et la monnaie rendue est exacte. Mobile :
 * le montant exact, `recu` valant 0 (contrat) ou le prix (écrans du convoyeur et du contrôleur), `rendu` 0.
 * Même règle que la vente au guichet (`AgenceService.verifierPaiement`).
 */
export function paiementCoherent(p: PaiementBord, du: number): boolean {
  if (p.mode === "cash") return p.recu >= du && p.rendu === p.recu - du;
  return p.rendu === 0 && (p.recu === 0 || p.recu === du);
}

/* ------------------------------------------------------------------ arrêts de la ligne */

export const arretsTries = (dc: DepartComplet): Arret[] =>
  [...dc.ligne.arrets].sort((a, b) => a.ordre - b.ordre);

/** L'arrêt de la ligne qui porte ce nom (sans tenir compte des majuscules ni des espaces autour). */
export function arretNomme(dc: DepartComplet, nom: string): Arret | undefined {
  const cherche = nom.trim().toLowerCase();
  return arretsTries(dc).find((a) => a.nom.trim().toLowerCase() === cherche);
}

export type ProblemeTrajet = "ARRET_INCONNU" | "ARRETS_INVALIDES" | "ARRET_SANS_MONTEE";

/** Montée et descente d'une vente en route : deux arrêts de la ligne, dans l'ordre, on monte à la montée. */
export function verifierTrajetPartiel(
  dc: DepartComplet,
  arretMontee: string,
  arretDescente: string,
): { montee: Arret; descente: Arret } | { probleme: ProblemeTrajet } {
  const montee = arretNomme(dc, arretMontee);
  const descente = arretNomme(dc, arretDescente);
  if (!montee || !descente) return { probleme: "ARRET_INCONNU" };
  if (montee.ordre >= descente.ordre) return { probleme: "ARRETS_INVALIDES" };
  if (!montee.montee) return { probleme: "ARRET_SANS_MONTEE" };
  return { montee, descente };
}

/** Prix d'un trajet partiel : prorata des kilomètres, arrondi à 100 F (règle de la billetterie). */
export function prixDuTrajetPartiel(dc: DepartComplet, montee: Arret, descente: Arret): number {
  return prixProrata({
    arrets: arretsTries(dc),
    prixTrajetComplet: dc.ligne.tarifs[dc.depart.classe],
    depuisArretId: montee.id,
    versArretId: descente.id,
  });
}

/** Les noms des arrêts où le bus est arrivé (events « arrivée à un arrêt » du chauffeur). */
export const arretsAtteints = (passages: readonly PassageRoute[]): string[] =>
  passages.filter((p) => p.genre === "arrivee").map((p) => p.arret.trim().toLowerCase());

/** Dernier arrêt où le bus est arrivé, sinon l'origine de la ligne. */
export function dernierArretAtteint(dc: DepartComplet, passages: readonly PassageRoute[]): Arret {
  const arrets = arretsTries(dc);
  const atteints = arretsAtteints(passages);
  let dernier = arrets[0] as Arret;
  for (const a of arrets) if (atteints.includes(a.nom.trim().toLowerCase())) dernier = a;
  return dernier;
}

/** Prochain arrêt du bus : le premier après l'origine où il n'est pas encore arrivé, sinon la destination. */
export function prochainArret(dc: DepartComplet, passages: readonly PassageRoute[]): Arret {
  const arrets = arretsTries(dc);
  const atteints = arretsAtteints(passages);
  const suivants = arrets.filter((a) => a.ordre > 0);
  return (
    suivants.find((a) => !atteints.includes(a.nom.trim().toLowerCase())) ??
    (arrets[arrets.length - 1] as Arret)
  );
}

/**
 * L'arrêt de montée proposé pour la vente en route : l'arrêt où le bus est arrivé s'il laisse monter, sinon
 * le prochain où l'on monte, avant la destination. À défaut (aucun arrêt où monter), l'origine.
 */
export function arretDeMonteeProposee(dc: DepartComplet, passages: readonly PassageRoute[]): Arret {
  const arrets = arretsTries(dc);
  const courant = dernierArretAtteint(dc, passages);
  const candidats = arrets.slice(0, -1).filter((a) => a.montee);
  return (
    candidats.find((a) => a.ordre >= courant.ordre) ??
    candidats[candidats.length - 1] ??
    (arrets[0] as Arret)
  );
}

/**
 * Heure de passage prévue à un arrêt : le temps de parcours de la ligne réparti selon les kilomètres
 * (provisoire : sans les pauses, que la ligne ne décrit pas). Le retard annoncé s'ajoute.
 */
export function heureDePassage(dc: DepartComplet, arret: Arret, retardMinutes = 0): string {
  const arrets = arretsTries(dc);
  const premier = arrets[0] as Arret;
  const dernier = arrets[arrets.length - 1] as Arret;
  const total = dernier.kmDepuisOrigine - premier.kmDepuisOrigine;
  const part = total > 0 ? (arret.kmDepuisOrigine - premier.kmDepuisOrigine) / total : 0;
  return versIsoDouala(
    enMs(dc.depart.heureDepart) +
      Math.round(dc.ligne.dureeMinutes * part + retardMinutes) * MS_PAR_MINUTE,
  );
}

/** Distance de la ligne en kilomètres (arrêt de départ à l'arrêt d'arrivée). */
export function kmDeLaLigne(dc: DepartComplet): number {
  const arrets = arretsTries(dc);
  if (arrets.length < 2) return 0;
  return Math.max(
    0,
    (arrets[arrets.length - 1] as Arret).kmDepuisOrigine - (arrets[0] as Arret).kmDepuisOrigine,
  );
}

/* ------------------------------------------------------------------ dépenses et incidents */

/**
 * La nature rangée en base : la table du lot C (`depart_depense.nature`) ne connaît que carburant, panne et
 * autre. Le péage est un « autre » (la catégorie du chauffeur est gardée à côté).
 */
export const natureDeDepense = (c: CategorieDepense): "carburant" | "autre" =>
  c === "carburant" ? "carburant" : "autre";

/** Retrouve la catégorie d'une ligne de dépense, y compris celles saisies ailleurs (sans catégorie). */
export function categorieDeDepense(categorie: string | null, nature: string): CategorieDepense {
  if (categorie === "carburant" || categorie === "peage" || categorie === "autre") return categorie;
  return nature === "carburant" ? "carburant" : "autre";
}

/** La nature rangée en base (`depart_incident.nature` : panne | autre) : accident et route coupée sont des « autre ». */
export const natureDeIncident = (n: NatureIncident): "panne" | "autre" =>
  n === "panne" ? "panne" : "autre";

export const LIBELLE_INCIDENT: Readonly<Record<NatureIncident, string>> = {
  panne: "Panne",
  accident: "Accident",
  route_coupee: "Route coupée",
  autre: "Incident",
};

/** Texte rangé dans `depart_incident.description` : la note du chauffeur, sinon le libellé de la nature. */
export const descriptionIncident = (nature: NatureIncident, note: string | null): string =>
  note !== null && note.trim() !== "" ? note.trim() : LIBELLE_INCIDENT[nature];

/* ------------------------------------------------------------------ semaine du chauffeur */

/** Début (lundi, minuit de Douala) de la semaine qui contient cet instant, en ms. */
export function debutDeSemaine(instant: number): number {
  const minuit = debutDuJourDoualaMs(jourDouala(instant));
  // 1 janvier 1970 est un jeudi : le décalage ramène le lundi à 0.
  const jours = Math.floor((minuit + 3_600_000) / MS_PAR_JOUR);
  const depuisLundi = (((jours + 3) % 7) + 7) % 7;
  return minuit - depuisLundi * MS_PAR_JOUR;
}

/* ------------------------------------------------------------------ contrôle inopiné */

export interface ComptesControle {
  liste: number;
  tetes: number;
  ecart: number;
}

/** L'écart est toujours `têtes − liste` : positif = voyageurs sans billet, négatif = billets sans voyageur. */
export const comptesDe = (liste: number, tetes: number): ComptesControle => ({
  liste,
  tetes,
  ecart: tetes - liste,
});

/**
 * Le constat de chaque siège du bus : celui que le contrôleur a posé, sinon « scanné » quand un billet valide
 * occupe le siège, sinon « libre ». Les têtes comptées sont les sièges qui ne sont pas libres.
 */
export function constatsEffectifs(
  capacite: number,
  billetsValides: readonly Pick<Billet, "siege">[],
  poses: ReadonlyMap<number, ConstatSiege>,
): { numero: number; constat: ConstatSiege }[] {
  const occupes = new Set(billetsValides.flatMap((b) => (b.siege !== null ? [b.siege] : [])));
  const sieges: { numero: number; constat: ConstatSiege }[] = [];
  for (let numero = 1; numero <= capacite; numero++) {
    sieges.push({
      numero,
      constat: poses.get(numero) ?? (occupes.has(numero) ? "scanne" : "libre"),
    });
  }
  return sieges;
}

export const tetesComptees = (sieges: readonly { constat: ConstatSiege }[]): number =>
  sieges.filter((s) => s.constat !== "libre").length;

/**
 * Provisoire : le montant que le voyageur sans billet dit avoir payé au convoyeur n'est pas dans le contrat.
 * Le serveur propose le tarif plein du départ, que le contrôleur peut régulariser (jamais au-dessus).
 */
export const montantDeclareProvisoire = (dc: DepartComplet): number =>
  dc.ligne.tarifs[dc.depart.classe];

/** L'identifiant de convoyeur que l'écran du contrôleur envoie quand il ne le connaît pas. */
export const convoyeurDuDepart = (departId: string): string => `convoyeur-du-depart-${departId}`;
