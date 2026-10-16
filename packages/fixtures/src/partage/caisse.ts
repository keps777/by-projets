import { REGLES_PAR_DEFAUT, cashAttendu, evaluerEcart, totalCoupures } from "@afrimove/domain";
import type { Billet, Depart, SessionCaisse } from "@afrimove/domain";
import {
  ALPHA,
  ALPHA_AKWA,
  ALPHA_DLA_BAF,
  ALPHA_DLA_YDE,
  BUS_LT118,
  BUS_LT207,
  ESSONO,
  JOSEPH_M,
  billetDe,
  departDe,
  guichetAlpha,
  sessionDe,
} from "../monde";
import { ESSOMBA_RACHEL } from "../monde";

/**
 * La caisse de Joseph, guichet 2 d'Akwa (K-DLA-270105-2-1), et ce qui tourne autour à 14 h :
 * la demande d'annulation du billet 0171 et les départs de l'après-midi. Planches Caisse, Superviseur,
 * SuperviseurValider, SuperviseurVoir, RapportSoir, Patron, Controle.
 *
 * Tous les montants de la caisse sont calculés par le domaine (`cashAttendu`, `totalCoupures`,
 * `evaluerEcart`) à partir de ce que la planche Caisse écrit : le résultat doit retomber sur
 * 695 500 attendus, 694 500 comptés, écart − 1 000.
 */

const COUPURES = { 10_000: 48, 5_000: 36, 2_000: 14, 1_000: 5, 500: 3 } as const;

const FOND = 20_000;
const BILLETS_CASH = 612_000;
const COLIS_CASH = 71_500;
const ANNULATIONS_VALIDEES = 8_000;

const attendu = cashAttendu({
  fondDeCaisse: FOND,
  billetsCash: BILLETS_CASH,
  colisCash: COLIS_CASH,
  annulationsValidees: ANNULATIONS_VALIDEES,
});
const compte = totalCoupures(COUPURES);

export const CAISSE_JOSEPH = {
  numero: "K-DLA-270105-2-1",
  fond: FOND,
  billetsCash: { nombre: 184, montant: BILLETS_CASH },
  colisCash: { nombre: 41, montant: COLIS_CASH },
  annulations: { nombre: 2, montant: ANNULATIONS_VALIDEES },
  momo: { ventes: 63, montant: 252_000 },
  coupures: COUPURES,
  attendu,
  compte,
  evaluation: evaluerEcart(attendu, compte),
  tolerance: REGLES_PAR_DEFAUT.toleranceEcart,
} as const;

/** La session de Joseph pendant qu'il compte, avant la clôture de 13:58. */
export const SESSION_JOSEPH_OUVERTE: SessionCaisse = sessionDe({
  gare: ALPHA_AKWA,
  guichet: guichetAlpha("DLA", 2),
  agentId: JOSEPH_M.id,
  fondDeCaisse: FOND,
  ouverteA: "05:02",
});

/** La même caisse une fois le PIN de Mme Essono posé (14:06) : état « validée ». */
export const SESSION_JOSEPH_VALIDEE: SessionCaisse = sessionDe({
  gare: ALPHA_AKWA,
  guichet: guichetAlpha("DLA", 2),
  agentId: JOSEPH_M.id,
  fondDeCaisse: FOND,
  ouverteA: "05:02",
  cloture: { a: "13:58", cashCompte: compte, cashAttendu: attendu },
  validee: { a: "14:06", superviseurId: ESSONO.id },
});

/* ------------------------------------------------------------------ l'après-midi d'Akwa */

const OUVERT = [{ action: "ouvrir_vente", a: "04:00" }] as const;

/** 14:30 vers Yaoundé, quai 3, LT 207 AB : 38 vendus sur 40. */
export const DEPART_ALPHA_1430: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "14:30",
  classe: "classique",
  busId: BUS_LT207.id,
  etapes: OUVERT,
});

/** 15:00 vers Bafoussam, quai 1, LT 118 AB : 19 vendus sur 40. */
export const DEPART_ALPHA_BAF_1500: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_BAF,
  hhmm: "15:00",
  classe: "classique",
  busId: BUS_LT118.id,
  etapes: OUVERT,
});

/** 16:00 vers Yaoundé, quai 3 : 9 vendus sur 40, fusion proposée avec le 16:30. */
export const DEPART_ALPHA_1600: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "16:00",
  classe: "classique",
  etapes: OUVERT,
});

export const DEPART_ALPHA_1630: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "16:30",
  classe: "classique",
  etapes: OUVERT,
});

/**
 * Billet 0171 : Essomba Rachel, siège 9 du 14:30, 4 000 F payés en cash au guichet 1 par Marie T.
 * à 09:12. La demande d'annulation (13:51, « client parti ») attend le PIN de Mme Essono : le billet
 * est encore payé tant que le superviseur n'a pas décidé.
 */
export const BILLET_0171: Billet = billetDe({
  cie: ALPHA,
  gare: ALPHA_AKWA,
  depart: DEPART_ALPHA_1430,
  sequence: 171,
  siege: 9,
  classe: "classique",
  prix: 4000,
  canal: "guichet",
  guichet: guichetAlpha("DLA", 1),
  passager: {
    nom: "Essomba Rachel",
    telephone: ESSOMBA_RACHEL.telephone,
    pieceQuatreDerniers: "3309",
  },
  codeBillet: "5528",
  creeA: "09:12",
  etapes: [{ action: "payer", a: "09:12" }],
});
