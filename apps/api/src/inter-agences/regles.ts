import type {
  BilletCorrespondanceStocke,
  ColisInterAgencesStocke,
  Creance,
  ConventionStockee,
  PartsConvention,
  TransfertPlan,
  VoyageursConvention,
} from "./modele";
import {
  ajouterHeures,
  ajouterJours,
  aammjjDouala,
  debutDeSemaine,
  enMs,
  minutesEntre,
  versIsoDouala,
  type Instant,
} from "./temps";

/**
 * Règles métier des échanges entre compagnies. Fonctions pures : aucune ne lit l'horloge ni une base,
 * `regles.test.ts` les vérifie une à une.
 */

/** Correspondance garantie entre deux bus du même billet. */
export const GARANTIE_CORRESPONDANCE_MINUTES = 25;
/** Le second bus attend le premier ce temps, puis part. */
export const ATTENTE_SECOND_BUS_MINUTES = 15;
/** Préavis de sortie d'une convention ; les colis en route vont au bout. */
export const PREAVIS_SORTIE_JOURS = 30;
/** Plafond de remboursement d'un colis perdu ou cassé, entre compagnies. */
export const PLAFOND_REMBOURSEMENT_FCFA = 50_000;
/** Frais AfriMove par colis, payés par la compagnie qui émet le colis (hors du prix du client). */
export const FRAIS_AFRIMOVE_COLIS_FCFA = 150;

/* ------------------------------------------------------------------ parts */

/** Ce que chaque compagnie touche sur le colis de référence : la somme de ses lignes. */
export function totauxParCompagnie(parts: PartsConvention): Record<string, number> {
  const totaux: Record<string, number> = {};
  for (const ligne of parts.lignes) {
    for (const [compagnie, montant] of Object.entries(ligne.parts)) {
      totaux[compagnie] = (totaux[compagnie] ?? 0) + (montant ?? 0);
    }
  }
  return totaux;
}

/**
 * Le tableau est cohérent si seules les deux compagnies y figurent, si aucun montant n'est négatif et
 * si, ensemble, elles se partagent exactement le prix payé par le client (AfriMove est payé en plus par
 * l'émetteur). Renvoie le défaut trouvé, ou `null`.
 */
export function defautDesParts(
  parts: PartsConvention,
  compagnies: readonly string[],
): string | null {
  if (parts.lignes.length === 0) return "Le tableau des parts est vide";
  for (const ligne of parts.lignes) {
    for (const [compagnie, montant] of Object.entries(ligne.parts)) {
      if (!compagnies.includes(compagnie)) return `« ${ligne.troncon} » : compagnie inconnue`;
      if (montant !== null && (!Number.isSafeInteger(montant) || montant < 0)) {
        return `« ${ligne.troncon} » : montant invalide`;
      }
    }
  }
  const totaux = totauxParCompagnie(parts);
  const somme = compagnies.reduce((s, c) => s + (totaux[c] ?? 0), 0);
  if (somme !== parts.colisType.prix) {
    return `Les parts (${somme} F) doivent faire le prix du colis type (${parts.colisType.prix} F)`;
  }
  for (const c of compagnies) {
    if ((totaux[c] ?? 0) === 0) return "Chaque compagnie doit avoir une part";
  }
  return null;
}

/**
 * Partage `prix` entre les compagnies au prorata de `totaux` (leurs parts du colis de référence), au franc
 * près : le reste de la division va aux plus grandes fractions, la somme vaut toujours `prix`.
 */
export function repartir(
  prix: number,
  totaux: Readonly<Record<string, number>>,
  ordre: readonly string[],
): Record<string, number> {
  const base = ordre.reduce((s, c) => s + (totaux[c] ?? 0), 0);
  const resultat: Record<string, number> = {};
  if (base <= 0) {
    for (const c of ordre) resultat[c] = 0;
    return resultat;
  }
  const fractions = ordre.map((c, i) => {
    const exact = (prix * (totaux[c] ?? 0)) / base;
    return { c, i, entier: Math.floor(exact), reste: exact - Math.floor(exact) };
  });
  let manque = prix - fractions.reduce((s, f) => s + f.entier, 0);
  for (const f of [...fractions].sort((a, b) => b.reste - a.reste || a.i - b.i)) {
    if (manque <= 0) break;
    f.entier += 1;
    manque -= 1;
  }
  for (const f of fractions) resultat[f.c] = f.entier;
  return resultat;
}

/**
 * La part de chaque tronçon : celle de sa compagnie, répartie à parts égales entre ses tronçons (le reste au
 * premier). Avec deux tronçons de deux compagnies, la part du tronçon est celle de la compagnie.
 */
export function partsDesTroncons(
  compagnies: readonly string[],
  partsParCompagnie: Readonly<Record<string, number>>,
): number[] {
  const nb = new Map<string, number>();
  for (const c of compagnies) nb.set(c, (nb.get(c) ?? 0) + 1);
  const vus = new Map<string, number>();
  return compagnies.map((c) => {
    const total = partsParCompagnie[c] ?? 0;
    const n = nb.get(c) ?? 1;
    const rang = vus.get(c) ?? 0;
    vus.set(c, rang + 1);
    const egale = Math.floor(total / n);
    return rang === 0 ? egale + (total - egale * n) : egale;
  });
}

/* ------------------------------------------------------------------ responsabilité */

export interface Responsabilite {
  compagnieId: string;
  /** Un colis « remis à » l'autre compagnie reste à la charge du cédant jusqu'au scan « reçu ». */
  enTransfert: boolean;
}

/** À qui est le colis : à celui dont le dernier scan « reçu » est enregistré. */
export function responsable(plan: ColisInterAgencesStocke): Responsabilite {
  let compagnieId = plan.troncons[0]?.compagnieId ?? plan.emettriceId;
  let enTransfert = false;
  for (const t of plan.transferts) {
    if (t.recu) {
      compagnieId = t.preneurId;
      enTransfert = false;
    } else {
      enTransfert = t.remis !== null;
      break;
    }
  }
  return { compagnieId, enTransfert };
}

/** Le prochain passage de témoin à faire (le premier non reçu), ou `null` quand le colis est arrivé. */
export function transfertEnCours(plan: ColisInterAgencesStocke): TransfertPlan | null {
  return plan.transferts.find((t) => t.recu === null) ?? null;
}

/* ------------------------------------------------------------------ créances */

/**
 * Les créances d'un colis, **uniquement** à partir des scans : tant que le passage de témoin n'est pas
 * complet (« remis à » puis « reçu »), rien n'est dû. Chaque compagnie qui n'est pas l'émettrice a droit à
 * la part de son tronçon, que l'émettrice (qui a encaissé le client) lui doit. Le tronçon `rang` est acquis
 * quand le passage de témoin `min(rang, dernier)` est complet.
 */
export function creancesDuColis(plan: ColisInterAgencesStocke): Creance[] {
  const creances: Creance[] = [];
  for (const t of plan.troncons) {
    if (t.compagnieId === plan.emettriceId || t.part <= 0) continue;
    const passage = plan.transferts.find(
      (x) => x.rang === Math.min(t.rang, plan.transferts.length),
    );
    if (!passage?.recu || !passage.remis) continue;
    creances.push({
      cle: `colis:${plan.colisId}:${t.rang}`,
      type: "colis",
      reference: plan.colisId,
      numero: plan.numero,
      conventionId: plan.conventionId,
      debiteurId: plan.emettriceId,
      creancierId: t.compagnieId,
      montant: t.part,
      acquiseLe: passage.recu.a,
    });
  }
  return creances;
}

/**
 * Les créances d'un billet : la part d'un tronçon n'est due qu'une fois le voyageur embarqué (scan). Le
 * siège perdu quand le second bus est manqué est dû par le retardataire, dès que l'arrivée en retard est
 * constatée.
 */
export function creancesDuBillet(billet: BilletCorrespondanceStocke): Creance[] {
  const creances: Creance[] = [];
  for (const t of billet.troncons) {
    if (t.compagnieId === billet.emettriceId || t.part <= 0) continue;
    if (t.etat !== "embarque" || !t.embarqueLe) continue;
    creances.push({
      cle: `billet:${billet.id}:${t.rang}`,
      type: "billet",
      reference: billet.id,
      numero: billet.numero,
      conventionId: billet.conventionId,
      debiteurId: billet.emettriceId,
      creancierId: t.compagnieId,
      montant: t.part,
      acquiseLe: t.embarqueLe,
    });
  }
  if (billet.replacement) {
    const { retardataireId, montant, decideLe } = billet.replacement;
    const lesaee = billet.troncons.find((t) => t.compagnieId !== retardataireId);
    if (lesaee && montant > 0) {
      creances.push({
        cle: `replacement:${billet.id}`,
        type: "replacement",
        reference: billet.id,
        numero: billet.numero,
        conventionId: billet.conventionId,
        debiteurId: retardataireId,
        creancierId: lesaee.compagnieId,
        montant,
        acquiseLe: decideLe,
      });
    }
  }
  return creances;
}

export interface SoldeNet {
  /** Positif : `compagnieId` doit recevoir ce montant de l'autre ; négatif : elle le doit. */
  net: number;
  recoit: number;
  doit: number;
  nbRecoit: number;
  nbDoit: number;
}

/** Le point de vue d'une compagnie sur une liste de créances (colis et billets comptés, pas les replacements). */
export function soldePour(compagnieId: string, creances: readonly Creance[]): SoldeNet {
  const solde: SoldeNet = { net: 0, recoit: 0, doit: 0, nbRecoit: 0, nbDoit: 0 };
  const recus = new Set<string>();
  const dus = new Set<string>();
  for (const c of creances) {
    const objet = `${c.type}:${c.reference}`;
    if (c.creancierId === compagnieId) {
      solde.recoit += c.montant;
      if (c.type !== "replacement") recus.add(objet);
    } else if (c.debiteurId === compagnieId) {
      solde.doit += c.montant;
      if (c.type !== "replacement") dus.add(objet);
    }
  }
  solde.nbRecoit = recus.size;
  solde.nbDoit = dus.size;
  solde.net = solde.recoit - solde.doit;
  return solde;
}

/* ------------------------------------------------------------------ calendrier du règlement */

export interface Periode {
  /** Dimanche 20:00 : les scans sont gelés, la contestation se termine. */
  gelLe: string;
  /** Lundi 08:00 qui suit : le solde net est réglé par MoMo. */
  paiementLe: string;
  /** Clé du règlement : `AAMMJJ` du lundi de paiement. */
  lundi: string;
}

function periodeDeFin(gel: Instant): Periode {
  const paiementLe = ajouterHeures(gel, 12);
  return { gelLe: versIsoDouala(gel), paiementLe, lundi: aammjjDouala(paiementLe) };
}

/** Dimanche 20:00 de la semaine (lundi à dimanche) de `instant`. */
function dimancheSoir(instant: Instant): string {
  return ajouterHeures(ajouterJours(debutDeSemaine(instant), 6), 20);
}

/**
 * Le règlement que l'on affiche à `instant` : celui qui sera payé au prochain lundi 08:00. Le dimanche 20:00
 * il est gelé (plus de contestation) jusqu'au paiement ; juste après, le suivant s'ouvre.
 */
export function periodeAffichee(instant: Instant): Periode {
  const courante = dimancheSoir(instant);
  const precedente = ajouterJours(courante, -7);
  return periodeDeFin(enMs(instant) < enMs(ajouterHeures(precedente, 12)) ? precedente : courante);
}

/** Une contestation est recevable tant que le relevé affiché n'est pas gelé. */
export function contestationRecevable(instant: Instant): boolean {
  return enMs(instant) < enMs(periodeAffichee(instant).gelLe);
}

/** Les règlements dont le paiement est échu à `instant` (le lundi 08:00 est inclus), du plus ancien au plus récent. */
export function periodesEchues(depuis: Instant, instant: Instant): Periode[] {
  const periodes: Periode[] = [];
  let gel = dimancheSoir(depuis);
  if (enMs(gel) <= enMs(depuis)) gel = ajouterJours(gel, 7);
  for (let i = 0; i < 400; i++) {
    const p = periodeDeFin(gel);
    if (enMs(p.paiementLe) > enMs(instant)) break;
    periodes.push(p);
    gel = ajouterJours(gel, 7);
  }
  return periodes;
}

/* ------------------------------------------------------------------ correspondance voyageurs */

export type IssueCorrespondance =
  | { type: "a_l_heure" }
  | { type: "attente"; minutes: number }
  | { type: "replacement"; retardMinutes: number };

/**
 * Le premier bus arrive à `arrivee`, le second part à `departSecond`. À l'heure : le voyageur monte. Si le
 * retard ne dépasse pas l'attente, le second bus l'attend ; au-delà, replacement gratuit sur le départ suivant.
 */
export function issueDeLaCorrespondance(
  arrivee: Instant,
  departSecond: Instant,
  attenteMinutes = ATTENTE_SECOND_BUS_MINUTES,
): IssueCorrespondance {
  const retard = minutesEntre(departSecond, arrivee);
  if (retard <= 0) return { type: "a_l_heure" };
  if (retard <= attenteMinutes) return { type: "attente", minutes: retard };
  return { type: "replacement", retardMinutes: retard };
}

/** La correspondance prévue laisse-t-elle au moins `garantie` minutes entre l'arrivée et le départ suivant ? */
export function correspondanceGarantie(
  arriveePremier: Instant,
  departSecond: Instant,
  garantieMinutes = GARANTIE_CORRESPONDANCE_MINUTES,
): boolean {
  return minutesEntre(arriveePremier, departSecond) >= garantieMinutes;
}

/** La ligne voyageurs de la convention qui correspond au trajet, villes comparées sans casse ni accent. */
export function ligneVoyageurs(
  voyageurs: VoyageursConvention,
  origine: string,
  via: string,
  destination: string,
) {
  return voyageurs.lignes.find(
    (l) =>
      memeVille(l.origine, origine) &&
      memeVille(l.via, via) &&
      memeVille(l.destination, destination),
  );
}

export function memeVille(a: string, b: string): boolean {
  return normaliserNom(a) === normaliserNom(b);
}

export function normaliserNom(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

/* ------------------------------------------------------------------ convention */

/** Une convention en vigueur pour de nouveaux échanges : signée des deux côtés, pas résiliée. */
export function enVigueur(convention: ConventionStockee): boolean {
  return convention.statut === "active";
}

/** Date d'effet d'une sortie demandée à `instant`. */
export function effetDeLaSortie(instant: Instant): string {
  return ajouterJours(instant, PREAVIS_SORTIE_JOURS);
}

/** L'autre compagnie de la convention. */
export function autreCompagnie(convention: ConventionStockee, compagnieId: string): string {
  return convention.compagnieA === compagnieId ? convention.compagnieB : convention.compagnieA;
}

export function concerne(convention: ConventionStockee, compagnieId: string | null): boolean {
  return (
    compagnieId !== null &&
    (convention.compagnieA === compagnieId || convention.compagnieB === compagnieId)
  );
}
