import type { Billet, Depart } from "@afrimove/domain";
import {
  ALPHA,
  ALPHA_AKWA,
  ALPHA_DLA_YDE,
  BUS_LT412,
  billetDe,
  departDe,
  guichetAlpha,
} from "../monde";

/**
 * Le départ de 05:30 vers Yaoundé en mode cadence (mardi 5 janvier, guichet 2 d'Akwa) et ses billets
 * 0225, 0228, 0231 et 0232. En cadence, le billet est numéroté et imprimé sans nom : le nom et les
 * 4 chiffres de la pièce se complètent au quai (planches Cadence, CadenceBillet, CadenceQuai).
 */
const depart: Depart = departDe({
  cie: ALPHA,
  ligne: ALPHA_DLA_YDE,
  hhmm: "05:30",
  classe: "classique",
  busId: BUS_LT412.id,
  etapes: [
    { action: "ouvrir_vente", a: "04:30" },
    { action: "ouvrir_embarquement", a: "05:15" },
  ],
});

function billetCadence(p: {
  sequence: number;
  siege: number;
  creeA: string;
  code: string;
  nom?: string;
  piece?: string;
}): Billet {
  return billetDe({
    cie: ALPHA,
    gare: ALPHA_AKWA,
    depart,
    sequence: p.sequence,
    siege: p.siege,
    classe: "classique",
    prix: 4000,
    canal: "guichet",
    guichet: guichetAlpha("DLA", 2),
    passager: {
      ...(p.nom ? { nom: p.nom } : {}),
      ...(p.piece ? { pieceQuatreDerniers: p.piece } : {}),
    },
    codeBillet: p.code,
    creeA: p.creeA,
    etapes: [{ action: "payer", a: p.creeA }],
  });
}

export const partageCadence = {
  depart,
  billet0225: billetCadence({ sequence: 225, siege: 12, creeA: "05:11", code: "3318" }),
  billet0228: billetCadence({ sequence: 228, siege: 15, creeA: "05:12", code: "7750" }),
  /** Vendu à 05:14, siège 18, cash. Le quai le compte parmi les billets encore sans nom. */
  billet0231: billetCadence({ sequence: 231, siege: 18, creeA: "05:14", code: "2086" }),
  /** Billet suivant, vendu à 05:14:52 : siège 19, code 9047, cash 4 000 rendu 1 000. */
  billet0232: billetCadence({ sequence: 232, siege: 19, creeA: "05:14:52", code: "9047" }),
};
