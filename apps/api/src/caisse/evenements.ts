import { Lecteur, lireEvenement, type DefinitionLecture, type EvenementLu } from "./validation";
import type { Coupure } from "./regles";

/**
 * Lecteurs des trois écritures de la caisse (`EVENEMENT_CAISSE_OUVERTE`, `_COMPTEE`, `_CLOTUREE` de
 * `@afrimove/contrats`). `parite.test.ts` les compare aux schémas zod.
 */

export interface DonneesOuverture {
  sessionId: string;
  numero: string;
  guichetId: string;
  fondDeCaisse: number;
}

export interface DonneesComptage {
  sessionId: string;
  coupures: Coupure[];
  pieces: number;
  total: number;
}

export interface DonneesCloture {
  sessionId: string;
  cashCompte: number;
  cashAttendu: number;
  ecart: number;
  auto: boolean;
}

export const DEF_CAISSE_OUVERTE: DefinitionLecture<DonneesOuverture> = {
  type: "caisse.ouverte",
  donnees(l: Lecteur, d) {
    const sessionId = l.texte(d["sessionId"], "donnees.sessionId", 128);
    const numero = l.texte(d["numero"], "donnees.numero", 64);
    const guichetId = l.texte(d["guichetId"], "donnees.guichetId", 128);
    const fondDeCaisse = l.fcfaPositif(d["fondDeCaisse"], "donnees.fondDeCaisse");
    if (
      sessionId === undefined ||
      numero === undefined ||
      guichetId === undefined ||
      fondDeCaisse === undefined
    ) {
      return undefined;
    }
    return { sessionId, numero, guichetId, fondDeCaisse };
  },
  cible: (d) => ({ type: "session", id: d.sessionId }),
};

export const DEF_CAISSE_COMPTEE: DefinitionLecture<DonneesComptage> = {
  type: "caisse.comptee",
  donnees(l: Lecteur, d) {
    const sessionId = l.texte(d["sessionId"], "donnees.sessionId", 128);
    const coupures = l.liste(
      d["coupures"],
      "donnees.coupures",
      (x, chemin): Coupure | undefined => {
        const o = l.objet(x, chemin);
        if (!o) return undefined;
        const valeur = l.entier(o["valeur"], `${chemin}.valeur`, 1);
        const nombre = l.entier(o["nombre"], `${chemin}.nombre`, 0);
        return valeur === undefined || nombre === undefined ? undefined : { valeur, nombre };
      },
      50,
    );
    const pieces = l.fcfaPositif(d["pieces"], "donnees.pieces");
    const total = l.fcfaPositif(d["total"], "donnees.total");
    if (
      sessionId === undefined ||
      coupures === undefined ||
      pieces === undefined ||
      total === undefined
    ) {
      return undefined;
    }
    return { sessionId, coupures, pieces, total };
  },
  cible: (d) => ({ type: "session", id: d.sessionId }),
};

export const DEF_CAISSE_CLOTUREE: DefinitionLecture<DonneesCloture> = {
  type: "caisse.cloturee",
  donnees(l: Lecteur, d) {
    const sessionId = l.texte(d["sessionId"], "donnees.sessionId", 128);
    const cashCompte = l.fcfaPositif(d["cashCompte"], "donnees.cashCompte");
    const cashAttendu = l.fcfaPositif(d["cashAttendu"], "donnees.cashAttendu");
    const ecart = l.fcfa(d["ecart"], "donnees.ecart");
    const auto = l.booleen(d["auto"], "donnees.auto");
    if (
      sessionId === undefined ||
      cashCompte === undefined ||
      cashAttendu === undefined ||
      ecart === undefined ||
      auto === undefined
    ) {
      return undefined;
    }
    return { sessionId, cashCompte, cashAttendu, ecart, auto };
  },
  cible: (d) => ({ type: "session", id: d.sessionId }),
};

export const lireOuverture = (brut: unknown): EvenementLu<DonneesOuverture> =>
  lireEvenement(brut, DEF_CAISSE_OUVERTE);
export const lireComptage = (brut: unknown): EvenementLu<DonneesComptage> =>
  lireEvenement(brut, DEF_CAISSE_COMPTEE);
export const lireCloture = (brut: unknown): EvenementLu<DonneesCloture> =>
  lireEvenement(brut, DEF_CAISSE_CLOTUREE);
