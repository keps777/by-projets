import type { ActionDepart, Billet, Depart } from "@afrimove/domain";
import {
  ALPHA,
  ALPHA_AKWA,
  ALPHA_DLA_YDE,
  BUS_LT412,
  billetDe,
  departDe,
  guichetAlpha,
} from "../monde";
import { AICHA, TCHOUMI_PAUL } from "../monde";
import type { Etape } from "../monde";

/**
 * Le départ d'Alpha Voyages de 08:30 vers Yaoundé, vu par les planches du guichet, du quai et du
 * convoyeur à des moments différents (en vente, embarquement, parti à 08:34).
 */
export function departAlpha0830(etat: "en_vente" | "embarquement" | "parti"): Depart {
  const etapes: Etape<ActionDepart>[] = [{ action: "ouvrir_vente", a: "04:00" }];
  if (etat !== "en_vente") etapes.push({ action: "ouvrir_embarquement", a: "08:00" });
  if (etat === "parti") etapes.push({ action: "partir", a: "08:34" });
  return departDe({
    cie: ALPHA,
    ligne: ALPHA_DLA_YDE,
    hhmm: "08:30",
    classe: "classique",
    busId: BUS_LT412.id,
    etapes,
  });
}

/** Tchoumi Paul, siège 24, 4 000 F, billet ALP-DLA-270105-0185 vendu au guichet 2. */
export function billetTchoumi(depart: Depart, paye: boolean): Billet {
  return billetDe({
    cie: ALPHA,
    gare: ALPHA_AKWA,
    depart,
    sequence: 185,
    siege: 24,
    classe: "classique",
    prix: 4000,
    canal: "guichet",
    guichet: guichetAlpha("DLA", 2),
    passager: {
      nom: "Tchoumi Paul",
      telephone: TCHOUMI_PAUL.telephone,
      pieceQuatreDerniers: "8820",
    },
    codeBillet: "6204",
    creeA: "08:11",
    etapes: paye ? [{ action: "payer", a: "08:12" }] : [],
  });
}

/**
 * Le billet d'Aïcha tel que le quai le montre : ALP-DLA-270105-0142 (Alpha, 08:30), alors que le
 * billet de sa propre planche est BEX-DLA-270105-0142 (Bêta Express, 08:00).
 */
export function billetAichaAuQuai(depart: Depart): Billet {
  return billetDe({
    cie: ALPHA,
    gare: ALPHA_AKWA,
    depart,
    sequence: 142,
    siege: 7,
    classe: "vip",
    prix: 7500,
    canal: "en_ligne",
    passager: { nom: "Ngo Aïcha", telephone: AICHA.telephone, pieceQuatreDerniers: "4471" },
    codeBillet: "7341",
    creeA: "07:39",
    etapes: [
      { action: "payer", a: "07:39" },
      { action: "embarquer", a: "08:19" },
    ],
  });
}
