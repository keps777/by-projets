import { z } from "zod";

/**
 * « Sans internet » : le même service par USSD (*123#) et par WhatsApp. Le voyageur y voit un
 * aperçu de ce qu'il recevra ; les vraies sessions USSD et WhatsApp sont servies par la passerelle.
 */
export const SchemaApercuSansInternet = z.object({
  ussd: z.object({
    code: z.string(),
    /** Lignes de l'écran USSD, telles qu'envoyées (sans accent, 160 caractères par écran). */
    lignes: z.array(z.string()),
    touches: z.array(z.string()),
    note: z.string(),
  }),
  whatsapp: z.object({
    motCle: z.string(),
    echanges: z.array(
      z.object({
        de: z.enum(["voyageur", "afrimove"]),
        lignes: z.array(z.string()),
      }),
    ),
    vocal: z.string(),
  }),
});
export type ApercuSansInternet = z.infer<typeof SchemaApercuSansInternet>;
