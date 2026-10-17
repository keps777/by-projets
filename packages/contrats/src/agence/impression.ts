import { z } from "zod";
import { SchemaId, SchemaImprimante } from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

export const SchemaDocumentImprimable = z.enum(["billet", "etiquette_colis", "ticket_caisse"]);
export type DocumentImprimable = z.infer<typeof SchemaDocumentImprimable>;

/** État de l'imprimante de l'appareil (« imprimante OK »). */
export const SchemaImpressionEtat = z.object({ imprimante: SchemaImprimante });
export type ImpressionEtat = z.infer<typeof SchemaImpressionEtat>;

/**
 * Imprimer un billet, une étiquette de colis ou un ticket de caisse. Une réimpression est un
 * événement aussi : le journal sait combien de copies d'un billet existent.
 */
export const EVENEMENT_IMPRESSION_DEMANDEE = definirEvenement({
  type: "impression.demandee",
  numerote: false,
  donnees: z.object({
    document: SchemaDocumentImprimable,
    /** Identifiant du billet, du colis ou de la session imprimé. */
    documentId: SchemaId,
    copies: z.number().int().min(1).max(5),
    reimpression: z.boolean(),
  }),
  cible: (d) => ({
    type:
      d.document === "billet" ? "billet" : d.document === "etiquette_colis" ? "colis" : "session",
    id: d.documentId,
  }),
});

export const SchemaResultatImpression = SchemaResultatSimple.extend({
  statut: z.enum(["imprime", "en_attente_imprimante"]),
});
export type ResultatImpression = z.infer<typeof SchemaResultatImpression>;
