import {
  Lecteur,
  lireEvenement,
  type DefinitionLecture,
  type EvenementLu,
} from "../caisse/validation";
import { COPIES_MAX, DOCUMENTS_IMPRIMABLES, type DocumentImprimable } from "./ports";

/**
 * Lecteur de l'écriture du module guichet (`EVENEMENT_IMPRESSION_DEMANDEE` de `@afrimove/contrats`). L'API ne
 * peut pas importer zod à l'exécution : `parite.test.ts` compare ce lecteur au schéma du contrat, champ par champ.
 */

export interface DonneesImpression {
  document: DocumentImprimable;
  documentId: string;
  copies: number;
  reimpression: boolean;
}

export const DEF_IMPRESSION_DEMANDEE: DefinitionLecture<DonneesImpression> = {
  type: "impression.demandee",
  donnees(l: Lecteur, d) {
    const document = l.choix(d["document"], "donnees.document", DOCUMENTS_IMPRIMABLES);
    const documentId = l.texte(d["documentId"], "donnees.documentId", 128);
    const copies = l.entier(d["copies"], "donnees.copies", 1, COPIES_MAX);
    const reimpression = l.booleen(d["reimpression"], "donnees.reimpression");
    if (
      document === undefined ||
      documentId === undefined ||
      copies === undefined ||
      reimpression === undefined
    ) {
      return undefined;
    }
    return { document, documentId, copies, reimpression };
  },
  // Comme le contrat : un billet, un colis, ou la session de caisse du ticket.
  cible: (d) => ({
    type:
      d.document === "billet" ? "billet" : d.document === "etiquette_colis" ? "colis" : "session",
    id: d.documentId,
  }),
};

export const lireImpression = (brut: unknown): EvenementLu<DonneesImpression> =>
  lireEvenement(brut, DEF_IMPRESSION_DEMANDEE);
