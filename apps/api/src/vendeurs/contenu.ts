import { COMMISSION_CLASSIQUE_DEFAUT, libelleCommission } from "./regles";

/**
 * Textes de la planche « Vendeur » (`docs/maquettes-v3/Vendeur.dc.html`, fixture
 * `packages/fixtures/src/ecrans/Vendeur.ts`). `contenu.test.ts` les compare au fixture, au caractère
 * près. Les chiffres (places, bilan, clients) sont calculés, pas écrits ici.
 */

/** La règle d'or du vendeur : il ne garde jamais l'argent du billet. */
export const REGLE_VENDEUR =
  "Le billet est au nom du voisin, pas au tien. Tu ne gardes jamais d'argent : le voisin paie, tu paies l'agence par MoMo dans la minute, la commission arrive le lundi.";

/** Sous les départs : comment se passe le paiement. */
export const DETAIL_PAIEMENT = "le voisin paie cash, je paie MoMo, il reçoit le SMS";

/** Titre de la liste « revendre en 1 touche ». */
export const TITRE_CLIENTS = "Mes clients · revendre en 1 touche";

/** « commission 100 F / billet » : la commission par défaut, quand l'agence n'en fixe pas d'autre. */
export const LIBELLE_COMMISSION_DEFAUT = libelleCommission(COMMISSION_CLASSIQUE_DEFAUT);
