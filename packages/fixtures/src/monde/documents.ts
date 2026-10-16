import { bloquerSiege } from "@afrimove/domain";
import type { Billet, Colis, Depart, SessionCaisse } from "@afrimove/domain";
import { HORLOGE } from "../horloge";
import { billetDe, colisDe, departDe, planDe, sessionDe } from "./construire";
import { AICHA, JOSEPH_M, MAMAN } from "./personnes";
import {
  ALPHA,
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  ALPHA_DLA_BAF,
  ALPHA_DLA_YDE,
  BETA,
  BETA_AKWA,
  BETA_DLA_YDE,
  BUS_LT118,
  BUS_LT412,
  OMEGA,
  OMEGA_DLA_YDE,
  guichetAlpha,
} from "./reseau";

/**
 * Les documents du monde commun : les départs de la matinée du mardi 5 janvier 2027, le billet
 * d'Aïcha, le colis pour Maman et la caisse de Joseph. Les planches qui les montrent à un autre
 * moment (ou qui se contredisent) en dérivent une variante dans leur propre scénario.
 */

/* ------------------------------------------------------------------ départs de la matinée */

const OUVERTE = [{ action: "ouvrir_vente", a: "04:00" }] as const;

/** Bêta Express VIP, 08:00 → Yaoundé (accueil, siège + paiement, billet). */
export const DEPART_BETA_0800: Depart = departDe({
  cie: BETA,
  ligne: BETA_DLA_YDE,
  hhmm: "08:00",
  classe: "vip",
  etapes: OUVERTE,
});

/** Alpha Voyages, 08:30 → Yaoundé (accueil, quai). */
export const DEPART_ALPHA_0830: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "08:30",
  classe: "classique",
  busId: BUS_LT412.id,
  etapes: OUVERTE,
});

/** Oméga Transports, 09:30 → Yaoundé (accueil). */
export const DEPART_OMEGA_0930: Depart = departDe({
  cie: OMEGA,
  ligne: OMEGA_DLA_YDE,
  hhmm: "09:30",
  classe: "classique",
  etapes: OUVERTE,
});

/** Alpha Voyages, 08:15 → Bafoussam, bus LT 118 AB (le colis de Maman voyage dessus). */
export const DEPART_ALPHA_BAF_0815: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_BAF,
  hhmm: "08:15",
  classe: "classique",
  busId: BUS_LT118.id,
  etapes: [
    { action: "ouvrir_vente", a: "04:00" },
    { action: "ouvrir_embarquement", a: "07:45" },
    { action: "partir", a: "08:17" },
  ],
});

/* ------------------------------------------------------------------ le billet d'Aïcha */

/**
 * Aïcha Ngo, siège 7, Bêta Express VIP 08:00, 7 500 F payés par MoMo, code 7341, CNI ···· 4471.
 * Numéro de la planche « Billet » : BEX-DLA-270105-0142.
 */
export const BILLET_AICHA: Billet = billetDe({
  cie: BETA,
  gare: BETA_AKWA,
  depart: DEPART_BETA_0800,
  sequence: 142,
  siege: 7,
  classe: "vip",
  prix: 7500,
  canal: "en_ligne",
  passager: { nom: "Aïcha Ngo", telephone: AICHA.telephone, pieceQuatreDerniers: "4471" },
  codeBillet: "7341",
  creeA: "07:39",
  etapes: [{ action: "payer", a: "07:39", par: AICHA.id }],
});

const SIEGES_PRIS_BETA_0800 = {
  1: "billet-pris-1",
  2: "billet-pris-2",
  5: "billet-pris-5",
  9: "billet-pris-9",
  10: "billet-pris-10",
  14: "billet-pris-14",
  15: "billet-pris-15",
} as const;

/** Plan du Bêta Express VIP avant le paiement d'Aïcha : 7 sièges pris sur 16, le 7 bloqué 15 min pour elle. */
export const PLAN_BETA_0800_AVANT_PAIEMENT = bloquerSiege(
  planDe(16, SIEGES_PRIS_BETA_0800),
  7,
  "commande-aicha",
  HORLOGE,
);

/** Plan du Bêta Express VIP après le paiement : 16 sièges, 8 pris dont le 7 d'Aïcha, 8 libres. */
export const PLAN_BETA_0800 = planDe(16, { ...SIEGES_PRIS_BETA_0800, 7: BILLET_AICHA.id });

/* ------------------------------------------------------------------ le colis de Maman */

export const CODE_RETRAIT_COLIS_0017 = "482913";
export const SEL_COLIS_0017 = "a17c4e90b2d35f681c0e7a49d2b3f851";
export const HACHE_COLIS_0017 = "6a71e27b88e1e1a52a1f156372c700d1b8faa99f43bd43d6dc97ed95185c5cc1";

/**
 * Colis pour Maman : C-DLA-270105-0017, 2 kg, médicaments et vêtements, assuré 25 000, 2 200 F payés
 * dans l'app. Déposé à 07:52, chargé à 08:10 dans le LT 118 AB, en route depuis 11:20.
 */
export const COLIS_MAMAN: Colis = colisDe({
  gareOrigine: ALPHA_AKWA,
  gareDestination: ALPHA_BAFOUSSAM,
  depart: DEPART_ALPHA_BAF_0815,
  sequence: 17,
  expediteur: { nom: "Ngo Aïcha", telephone: AICHA.telephone },
  destinataire: { nom: "Ngo Thérèse", telephone: MAMAN.telephone },
  contenu: "Médicaments, vêtements",
  poidsKg: 2,
  valeurDeclaree: 25_000,
  assure: true,
  mode: "gare",
  canal: "app",
  codeRetraitHache: HACHE_COLIS_0017,
  codeRetraitSel: SEL_COLIS_0017,
  prixTotal: 2200,
  creeA: "07:52",
  etapes: [
    { action: "charger", a: "08:10", par: "pers-convoyeur" },
    { action: "expedier", a: "11:20" },
  ],
});

/* ------------------------------------------------------------------ la caisse de Joseph */

/**
 * Guichet 2 d'Akwa, Joseph M., ouverte à 05:02 avec 20 000, clôturée à 13:58 : 694 500 comptés pour
 * 695 500 attendus, écart − 1 000. K-DLA-270105-2-1.
 */
export const SESSION_JOSEPH: SessionCaisse = sessionDe({
  gare: ALPHA_AKWA,
  guichet: guichetAlpha("DLA", 2),
  agentId: JOSEPH_M.id,
  fondDeCaisse: 20_000,
  ouverteA: "05:02",
  cloture: { a: "13:58", cashCompte: 694_500, cashAttendu: 695_500 },
});
