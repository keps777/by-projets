// Éducation : plan de paiement des frais de rentrée étalé sur salaire. Fonctions pures.
import { decider, mensualite, niveauDuScore, PLAFOND_ENDETTEMENT, PLAFONDS, partSalaire, tauxMensuel, type Controle, type Decision, type Niveau, type Pass } from './credit.ts';

/** Durées proposées ; 12 mois au plus (le calendrier court de septembre à août). */
export const DUREES_PLAN = [6, 8, 10, 12] as const;
export const DUREE_MAX = 12;
/** Score minimal pour un crédit scolaire (niveau START). */
export const SEUIL_SCORE_ECOLE = 500;
/** Taux de lancement 0 % : réservé au crédit scolaire 2026 déjà accordé (démo), jamais à un nouveau plan. */
export const TAUX_LANCEMENT = 0;

export interface EntreePlan {
  aFinancer: number; duree: number; pass: Pass; score: number; salaire: number;
  /** Somme des mensualités de crédit déjà en cours (`totalMensualites()`). */
  mensualitesExistantes: number;
  /** Surcharge du taux (taux de lancement) ; sinon `tauxMensuel(pass, niveau)`. */
  taux?: number;
}
export interface ResultatPlan {
  niveau: Niveau; taux: number; mensualite: number; cout: number; totalRembourse: number;
  /** Part du net prélevée par toutes les mensualités de crédit, nouvelle comprise (0 à 1). */
  part: number; plafondCredit: number; plafondOk: boolean;
  approuve: boolean; decision: Decision; controles: Controle[]; motif: string | null;
}

/** Mensualité entière (en FCFA) d'un plan à `taux` mensuel. */
export const mensualitePlan = (capital: number, taux: number, duree: number) => Math.round(mensualite(capital, taux, duree));

/** Évalue un plan : annuité, part du salaire (règle des 33 %), score et plafond du niveau, via `decider()`. */
export function evaluerPlan(e: EntreePlan): ResultatPlan {
  const niveau = niveauDuScore(e.score);
  const taux = e.taux ?? tauxMensuel(e.pass, niveau);
  const m = mensualitePlan(e.aFinancer, taux, e.duree);
  const plafondCredit = PLAFONDS[niveau].credit;
  const plafondOk = e.aFinancer <= plafondCredit;
  // Les contrôles propres au véhicule et à l'employeur sont neutralisés : on ne garde que le score et la règle des 33 %.
  const decision = decider({
    score: e.score, seuilScore: SEUIL_SCORE_ECOLE, salaire: e.salaire, mensualiteNouvelle: m, mensualitesExistantes: e.mensualitesExistantes,
    employeurPartenaire: true, ancienneteAns: 0, contratStable: true, vehiculeControle: true, prix: e.aFinancer, financement: e.aFinancer
  });
  const controles: Controle[] = decision.controles.filter((c) => c.id === 'score' || c.id === 'part');
  controles.push({
    id: 'plafond', ok: plafondOk, tag: `PLAFOND ${niveau}`,
    titre: plafondOk ? 'Montant dans le plafond de votre niveau' : 'Montant au-dessus du plafond de votre niveau',
    detail: `Un crédit scolaire peut aller jusqu'à ${plafondCredit.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA au niveau ${niveau}.`
  });
  const ko = controles.find((c) => !c.ok);
  return {
    niveau, taux, mensualite: m, cout: Math.max(0, m * e.duree - e.aFinancer), totalRembourse: m * e.duree,
    part: partSalaire(m + e.mensualitesExistantes, e.salaire), plafondCredit, plafondOk,
    approuve: !ko && e.aFinancer > 0, decision, controles, motif: ko ? ko.titre : null
  };
}

/** Plus petite durée proposée (parmi `DUREES_PLAN`) strictement plus longue que `e.duree` qui passe la règle des 33 % ; null s'il n'y en a pas. */
export function dureeAlternative(e: EntreePlan): number | null {
  return DUREES_PLAN.find((d) => d > e.duree && evaluerPlan({ ...e, duree: d }).approuve) ?? null;
}

/** Capital maximal finançable sur `duree` mois sans dépasser 33 % du net (inverse de l'annuité), arrondi vers le bas. */
export function montantMaxFinancable(salaire: number, mensualitesExistantes: number, taux: number, duree: number): number {
  const dispo = Math.floor(salaire * PLAFOND_ENDETTEMENT + 1e-9) - mensualitesExistantes;
  if (dispo <= 0 || duree <= 0) return 0;
  const facteur = taux === 0 ? duree : (1 - Math.pow(1 + taux, -duree)) / taux;
  let c = Math.floor(dispo * facteur);
  while (c > 0 && mensualitePlan(c, taux, duree) > dispo) c--;
  return c;
}

/**
 * Solde du coffre « Rentrée » lu dans la tranche `coffres` d'une autre fonctionnalité, en lecture seule.
 * Tolérant sur la forme : cherche un tableau d'objets dont le nom contient « rentrée » et dont un champ numérique
 * (solde, montant, epargne, actuel, capital) donne le solde. Renvoie null s'il n'y a pas de tel coffre.
 */
export function lireCoffreRentree(tranche: unknown): number | null {
  const champsNom = ['nom', 'libelle', 'titre', 'name'];
  const champsMontant = ['solde', 'montant', 'epargne', 'actuel', 'capital', 'epargne_actuelle'];
  const visiter = (v: unknown, profondeur: number): number | null => {
    if (profondeur > 3 || v === null || typeof v !== 'object') return null;
    if (Array.isArray(v)) {
      for (const x of v) { const r = visiter(x, profondeur + 1); if (r !== null) return r; }
      return null;
    }
    const o = v as Record<string, unknown>;
    const nom = champsNom.map((c) => o[c]).find((x) => typeof x === 'string') as string | undefined;
    if (nom && /rentr[ée]e/i.test(nom)) {
      const m = champsMontant.map((c) => o[c]).find((x) => typeof x === 'number' && Number.isFinite(x)) as number | undefined;
      if (m !== undefined) return Math.max(0, m);
    }
    for (const x of Object.values(o)) { const r = visiter(x, profondeur + 1); if (r !== null) return r; }
    return null;
  };
  return visiter(tranche, 0);
}
