import {
  appliquerBillet,
  appliquerColis,
  appliquerDepart,
  appliquerSession,
  cloturerSession,
  creerBillet,
  creerColis,
  creerDepart,
  creerPlanSieges,
  numeroBillet,
  numeroColis,
  numeroDepart,
  numeroSession,
  ouvrirSession,
  validerSession,
} from "@afrimove/domain";
import type {
  ActionBillet,
  ActionColis,
  ActionDepart,
  Billet,
  CanalColis,
  CanalVente,
  ClasseBillet,
  Colis,
  Compagnie,
  Depart,
  Gare,
  Guichet,
  Id,
  Ligne,
  ModeColis,
  Passager,
  PlanSieges,
  SessionCaisse,
} from "@afrimove/domain";
import { heure } from "../horloge";

/**
 * Constructeurs des documents de démonstration. Ils passent tous par les fonctions du domaine
 * (`creerBillet`, `appliquerBillet`, `numeroBillet`…) : un billet « embarqué » est donc un billet
 * créé puis payé puis embarqué, avec l'historique qui va avec, jamais un objet assemblé à la main.
 */

/** Un horodatage HH:MM[:SS] le jour des maquettes. */
export type Heure = string;

export interface Etape<A extends string> {
  action: A;
  /** Heure de la transition, le jour des maquettes. */
  a: Heure;
  par?: string;
  motif?: string;
}

function meta(e: { a: Heure; par?: string; motif?: string }) {
  return {
    at: heure(e.a),
    ...(e.par !== undefined ? { par: e.par } : {}),
    ...(e.motif !== undefined ? { motif: e.motif } : {}),
  };
}

/* ------------------------------------------------------------------ départ */

export interface ParamsDepart {
  cie: Compagnie;
  ligne: Ligne;
  /** Heure de départ prévue, « 08:00 ». */
  hhmm: Heure;
  classe: ClasseBillet;
  busId?: Id | null;
  etapes?: readonly Etape<ActionDepart>[];
  /** Jour AAAA-MM-JJ si ce n'est pas le jour des maquettes. */
  jour?: string;
}

export function departDe(p: ParamsDepart): Depart {
  const at = heure(p.hhmm, p.jour);
  const numero = numeroDepart({ agence: p.cie.code, ligne: p.ligne.code, at });
  let depart = creerDepart({
    id: `dep-${numero.toLowerCase()}`,
    numero,
    ligneId: p.ligne.id,
    busId: p.busId ?? null,
    classe: p.classe,
    heureDepart: at,
  });
  for (const e of p.etapes ?? []) depart = appliquerDepart(depart, e.action, meta(e));
  return depart;
}

/* ------------------------------------------------------------------ billet */

export interface ParamsBillet {
  cie: Compagnie;
  gare: Gare;
  depart: Depart;
  /** NNNN du numéro. */
  sequence: number;
  siege: number | null;
  classe: ClasseBillet;
  prix: number;
  canal: CanalVente;
  passager: Passager;
  codeBillet: string;
  /** Heure de création (vente ou réservation). */
  creeA: Heure;
  guichet?: Guichet;
  sessionId?: Id;
  etapes?: readonly Etape<ActionBillet>[];
  /** Jour AAAA-MM-JJ de la vente si ce n'est pas le jour des maquettes. */
  jour?: string;
}

export function billetDe(p: ParamsBillet): Billet {
  const at = heure(p.creeA, p.jour);
  const numero = numeroBillet({ agence: p.cie.code, gare: p.gare.code, at, sequence: p.sequence });
  let billet = creerBillet({
    id: `billet-${numero.toLowerCase()}`,
    numero,
    sequence: p.sequence,
    compagnieId: p.cie.id,
    gareId: p.gare.id,
    departId: p.depart.id,
    siege: p.siege,
    classe: p.classe,
    prix: p.prix,
    canal: p.canal,
    ...(p.guichet ? { guichetId: p.guichet.id } : {}),
    ...(p.sessionId ? { sessionId: p.sessionId } : {}),
    passager: p.passager,
    codeBillet: p.codeBillet,
    creeA: at,
  });
  for (const e of p.etapes ?? []) billet = appliquerBillet(billet, e.action, meta(e));
  return billet;
}

/* ------------------------------------------------------------------ colis */

export interface ParamsColis {
  gareOrigine: Gare;
  gareDestination: Gare;
  depart: Depart | null;
  /** NNNN du numéro. */
  sequence: number;
  expediteur: { nom: string; telephone: string };
  destinataire: { nom: string; telephone: string };
  contenu: string;
  poidsKg: number;
  valeurDeclaree: number;
  assure: boolean;
  mode: ModeColis;
  canal: CanalColis;
  /** Haché SHA-256 de `:sel:code` (voir `hacherCodeRetrait`), précalculé pour rester synchrone. */
  codeRetraitHache: string;
  codeRetraitSel: string;
  prixTotal: number;
  creeA: Heure;
  etapes?: readonly Etape<ActionColis>[];
  jour?: string;
}

export function colisDe(p: ParamsColis): Colis {
  const at = heure(p.creeA, p.jour);
  const numero = numeroColis({ gare: p.gareOrigine.code, at, sequence: p.sequence });
  let colis = creerColis({
    id: `colis-${numero.toLowerCase()}`,
    numero,
    sequence: p.sequence,
    gareOrigineId: p.gareOrigine.id,
    gareDestinationId: p.gareDestination.id,
    departId: p.depart?.id ?? null,
    expediteur: p.expediteur,
    destinataire: p.destinataire,
    contenu: p.contenu,
    poidsKg: p.poidsKg,
    valeurDeclaree: p.valeurDeclaree,
    assure: p.assure,
    mode: p.mode,
    canal: p.canal,
    codeRetraitHache: p.codeRetraitHache,
    codeRetraitSel: p.codeRetraitSel,
    prixTotal: p.prixTotal,
    creeA: at,
  });
  for (const e of p.etapes ?? []) colis = appliquerColis(colis, e.action, meta(e));
  return colis;
}

/* ------------------------------------------------------------------ session de caisse */

export interface ParamsSession {
  gare: Gare;
  guichet: Guichet;
  agentId: Id;
  fondDeCaisse: number;
  ouverteA: Heure;
  /** Ordre de la session dans la journée pour ce guichet (K-DLA-270105-2-1). */
  ordre?: number;
  cloture?: { a: Heure; cashCompte: number; cashAttendu: number };
  validee?: { a: Heure; superviseurId: Id };
}

export function sessionDe(p: ParamsSession): SessionCaisse {
  const at = heure(p.ouverteA);
  const numero = numeroSession({
    gare: p.gare.code,
    at,
    guichetRang: p.guichet.rang,
    ordre: p.ordre ?? 1,
  });
  let session = ouvrirSession({
    id: `session-${numero.toLowerCase()}`,
    numero,
    guichetId: p.guichet.id,
    agentId: p.agentId,
    fondDeCaisse: p.fondDeCaisse,
    at,
  });
  if (p.cloture) {
    session = cloturerSession(session, {
      at: heure(p.cloture.a),
      cashCompte: p.cloture.cashCompte,
      cashAttendu: p.cloture.cashAttendu,
    });
  }
  if (p.validee) session = validerSession(session, p.validee.superviseurId, heure(p.validee.a));
  return session;
}

/** Réexport pratique : une session déjà construite peut recevoir une action. */
export { appliquerSession };

/* ------------------------------------------------------------------ plan de sièges */

/** Plan de sièges avec les sièges occupés (siège → identifiant du billet ou de la réservation). */
export function planDe(capacite: number, occupes: Readonly<Record<number, Id>> = {}): PlanSieges {
  const plan = creerPlanSieges(capacite);
  return { ...plan, occupes };
}
