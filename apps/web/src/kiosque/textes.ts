import { CLES, lire } from "@/coquille/stockage";

/**
 * Textes de l'écran « appareil effacé ». Ils sont ici et non dans `src/i18n/` : cet écran s'affiche avant que
 * l'application (donc i18next) ne soit montée. Le pidgin se replie sur le français, comme partout.
 */
const TEXTES = {
  fr: {
    titre: "Appareil effacé",
    corps:
      "Les données de cet appareil ont été supprimées à distance. Plus rien n'est enregistré ici.",
    consigne: "Pour le remettre en service, contactez votre superviseur AfriMove.",
    incomplet:
      "L'effacement n'a pas pu tout supprimer. Ne vous servez plus de cet appareil et prévenez votre superviseur.",
  },
  en: {
    titre: "Device erased",
    corps: "This device's data was deleted remotely. Nothing is stored here anymore.",
    consigne: "To put it back into service, contact your AfriMove supervisor.",
    incomplet:
      "The erasure could not delete everything. Stop using this device and tell your supervisor.",
  },
} as const;

export interface TextesEfface {
  titre: string;
  corps: string;
  consigne: string;
  incomplet: string;
}

export function textesEfface(langue: string | null = lire(CLES.langue)): TextesEfface {
  return langue === "en" ? TEXTES.en : TEXTES.fr;
}
