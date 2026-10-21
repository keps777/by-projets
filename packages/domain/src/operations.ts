import { verifierCodeRetrait } from "./codes";
import type { Billet, Colis, Depart, Evenement, Id, SessionCaisse } from "./entites";
import { MACHINE_BILLET } from "./etats/billet";
import type { ActionBillet } from "./etats/billet";
import { MACHINE_COLIS } from "./etats/colis";
import type { ActionColis } from "./etats/colis";
import { MACHINE_DEPART } from "./etats/depart";
import type { ActionDepart } from "./etats/depart";
import { MACHINE_SESSION } from "./etats/session";
import type { ActionSession } from "./etats/session";
import { appliquerAction } from "./machine";
import type { MetaTransition } from "./machine";
import type { Fcfa } from "./money";
import { decisionAnnulation, evaluerEcart, REGLES_PAR_DEFAUT } from "./regles";
import type { DecisionAnnulation, ReglesCompagnie } from "./regles";
import { etatSuivant } from "./machine";
import { versIsoDouala } from "./temps";
import type { Instant } from "./temps";

/* ------------------------------------------------------------------ billet */

export type ParamsCreationBillet = Omit<Billet, "etat" | "historique" | "creeA"> & {
  creeA: Instant;
};

export function creerBillet(p: ParamsCreationBillet): Billet {
  return {
    ...p,
    creeA: versIsoDouala(p.creeA),
    etat: MACHINE_BILLET.initial,
    historique: [],
  };
}

export function appliquerBillet(
  billet: Billet,
  action: ActionBillet,
  meta: MetaTransition,
): Billet {
  return appliquerAction(MACHINE_BILLET, billet, action, meta);
}

export class ValidationSuperviseurRequise extends Error {
  constructor() {
    super("Aucune annulation sans le PIN d'un superviseur");
    this.name = "ValidationSuperviseurRequise";
  }
}

export interface ParamsAnnulationBillet {
  /** Identifiant de l'événement, créé sur l'appareil. */
  evenementId: Id;
  at: Instant;
  /** Qui annule (guichetier, voyageur…). */
  par: Id;
  motif?: string;
  /** Superviseur qui a donné son PIN : obligatoire pour une vente en agence ou en route. */
  validePar?: Id;
  appareilId?: Id;
  heureDepart: Instant;
  regles?: ReglesCompagnie;
}

export interface ResultatAnnulation {
  billet: Billet;
  evenement: Evenement<"billet.annule">;
  decision: DecisionAnnulation;
}

/**
 * Annule un billet. Le numéro est conservé, rien n'est effacé : l'annulation s'ajoute à l'historique
 * et produit un événement. Une vente faite par un agent (guichet, convoyeur, vendeur) ne s'annule
 * qu'avec le PIN d'un superviseur.
 */
export function annulerBillet(billet: Billet, p: ParamsAnnulationBillet): ResultatAnnulation {
  const parAgent = billet.canal !== "en_ligne";
  if (parAgent && !p.validePar) throw new ValidationSuperviseurRequise();
  // La machine d'états refuse d'abord les états interdits (embarqué, voyagé, déjà annulé…).
  etatSuivant(MACHINE_BILLET, billet.etat, "annuler");
  const decision = decisionAnnulation({
    etat: billet.etat,
    prix: billet.prix,
    classe: billet.classe,
    heureDepart: p.heureDepart,
    maintenant: p.at,
    regles: p.regles ?? REGLES_PAR_DEFAUT,
  });
  const meta: MetaTransition = {
    at: p.at,
    par: p.validePar ?? p.par,
    ...(p.motif !== undefined ? { motif: p.motif } : {}),
  };
  const annule = appliquerBillet(billet, "annuler", meta);
  const evenement: Evenement<"billet.annule"> = {
    id: p.evenementId,
    type: "billet.annule",
    at: versIsoDouala(p.at),
    appareilId: p.appareilId ?? null,
    auteurId: p.par,
    cible: { type: "billet", id: billet.id },
    donnees: {
      numero: billet.numero,
      motif: p.motif ?? null,
      validePar: p.validePar ?? null,
      retenue: decision.retenue,
      remboursement: decision.remboursement,
    },
  };
  return { billet: annule, evenement, decision };
}

/** Billet vendu en cadence : numéroté et imprimé, nom et pièce à compléter au quai. */
export function estCadenceSansNom(billet: Billet): boolean {
  return billet.etat !== "annule" && !billet.passager.nom;
}

/** Complète le nom et les 4 chiffres de la pièce au quai ; le numéro ne change pas. */
export function completerBillet(
  billet: Billet,
  passager: { nom: string; pieceQuatreDerniers: string },
): Billet {
  if (!/^\d{4}$/.test(passager.pieceQuatreDerniers)) {
    throw new RangeError("La pièce se saisit avec ses 4 derniers chiffres");
  }
  if (!passager.nom.trim()) throw new RangeError("Nom du voyageur requis");
  return { ...billet, passager: { ...billet.passager, ...passager } };
}

/* ------------------------------------------------------------------ colis */

export type ParamsCreationColis = Omit<
  Colis,
  "etat" | "historique" | "creeA" | "disponibleDepuis"
> & {
  creeA: Instant;
};

export function creerColis(p: ParamsCreationColis): Colis {
  return { ...p, creeA: versIsoDouala(p.creeA), etat: MACHINE_COLIS.initial, historique: [] };
}

/** Applique une action sur le colis ; l'arrivée en « disponible » démarre les 7 jours de garde. */
export function appliquerColis(colis: Colis, action: ActionColis, meta: MetaTransition): Colis {
  const suivant = appliquerAction(MACHINE_COLIS, colis, action, meta);
  if (suivant.etat === "disponible" && colis.etat !== "disponible") {
    return { ...suivant, disponibleDepuis: versIsoDouala(meta.at) };
  }
  return suivant;
}

export class CodeRetraitInvalide extends Error {
  constructor() {
    super("Code de retrait invalide");
    this.name = "CodeRetraitInvalide";
  }
}

/** Remise au destinataire : le code de retrait saisi doit correspondre au haché. */
export async function remettreColis(
  colis: Colis,
  codeSaisi: string,
  meta: MetaTransition,
  poivre = "",
): Promise<Colis> {
  etatSuivant(MACHINE_COLIS, colis.etat, "remettre");
  const ok = await verifierCodeRetrait(
    codeSaisi,
    colis.codeRetraitHache,
    colis.codeRetraitSel,
    poivre,
  );
  if (!ok) throw new CodeRetraitInvalide();
  return appliquerColis(colis, "remettre", meta);
}

/* ------------------------------------------------------------------ départ */

export type ParamsCreationDepart = Omit<Depart, "etat" | "historique" | "heureDepart"> & {
  heureDepart: Instant;
};

export function creerDepart(p: ParamsCreationDepart): Depart {
  return {
    ...p,
    heureDepart: versIsoDouala(p.heureDepart),
    etat: MACHINE_DEPART.initial,
    historique: [],
  };
}

export function appliquerDepart(
  depart: Depart,
  action: ActionDepart,
  meta: MetaTransition,
): Depart {
  return appliquerAction(MACHINE_DEPART, depart, action, meta);
}

/** Fusionne un départ dans un autre ; les billets sont à replacer par l'appelant. */
export function fusionnerDepart(depart: Depart, dansId: Id, meta: MetaTransition): Depart {
  if (dansId === depart.id) throw new RangeError("Un départ ne peut pas fusionner avec lui-même");
  return { ...appliquerDepart(depart, "fusionner", meta), fusionneDansId: dansId };
}

/* ------------------------------------------------------------------ session de caisse */

export interface ParamsOuvertureSession {
  id: Id;
  numero: string;
  guichetId: Id;
  agentId: Id;
  fondDeCaisse: Fcfa;
  at: Instant;
}

export function ouvrirSession(p: ParamsOuvertureSession): SessionCaisse {
  if (!Number.isInteger(p.fondDeCaisse) || p.fondDeCaisse < 0)
    throw new RangeError("Fond invalide");
  return {
    id: p.id,
    numero: p.numero,
    guichetId: p.guichetId,
    agentId: p.agentId,
    fondDeCaisse: p.fondDeCaisse,
    ouverteA: versIsoDouala(p.at),
    etat: MACHINE_SESSION.initial,
    historique: [],
  };
}

export interface ParamsCloture {
  at: Instant;
  cashCompte: Fcfa;
  cashAttendu: Fcfa;
  /** Clôture faite par le système à minuit. */
  auto?: boolean;
  par?: Id;
}

export function cloturerSession(session: SessionCaisse, p: ParamsCloture): SessionCaisse {
  const meta: MetaTransition = { at: p.at, par: p.auto ? "systeme" : (p.par ?? session.agentId) };
  const suivante = appliquerAction(MACHINE_SESSION, session, "cloturer", meta);
  return {
    ...suivante,
    cloturee: {
      at: versIsoDouala(p.at),
      auto: p.auto ?? false,
      cashCompte: p.cashCompte,
      cashAttendu: p.cashAttendu,
      ecart: evaluerEcart(p.cashAttendu, p.cashCompte).ecart,
    },
  };
}

export function appliquerSession(
  session: SessionCaisse,
  action: ActionSession,
  meta: MetaTransition,
): SessionCaisse {
  return appliquerAction(MACHINE_SESSION, session, action, meta);
}

/** « Refuser · recompter » : la session redevient ouverte, la clôture précédente reste dans l'historique. */
export function refuserCloture(
  session: SessionCaisse,
  superviseurId: Id,
  at: Instant,
  motif?: string,
): SessionCaisse {
  const { cloturee: _ancienne, ...rest } = appliquerSession(session, "refuser", {
    at,
    par: superviseurId,
    ...(motif !== undefined ? { motif } : {}),
  });
  return rest;
}

/** « Valider · écart signé » : le superviseur met son PIN, l'écart est tracé. */
export function validerSession(
  session: SessionCaisse,
  superviseurId: Id,
  at: Instant,
): SessionCaisse {
  if (!superviseurId) throw new ValidationSuperviseurRequise();
  const validee = appliquerSession(session, "valider", { at, par: superviseurId });
  return { ...validee, validee: { at: versIsoDouala(at), superviseurId } };
}
