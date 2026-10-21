import { requeteInvalide } from "../colis/erreurs";
import { MOYENS_PAIEMENT_COLIS, lire, type Lecteur } from "../colis/validation";
import { COMMISSION_MAX } from "./regles";

/**
 * Lecture des corps de requête des vendeurs. Comme pour les colis, l'API ne peut pas importer zod à
 * l'exécution : ces lecteurs reprennent à la main les règles des schémas de `@afrimove/contrats`
 * (`colis/vendeur.ts`), et `validation.test.ts` les compare aux schémas zod. Les champs inconnus
 * sont ignorés et jamais recopiés ; seules quelques longueurs maximales s'ajoutent au contrat.
 */

const NOM_MAX = 120;
const TEXTE_MAX = 120;
const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;

export const OPERATEURS = ["mtn", "orange"] as const;

/** `SchemaParamsDepartsVendeur` : le jour (AAAA-MM-JJ), l'origine et la destination, tous facultatifs. */
export interface ParamsDeparts {
  jour?: string;
  origine?: string;
  destination?: string;
}

/** Les paramètres de requête vides (« ?origine= ») valent « absent ». */
export function lireParamsDeparts(brut: unknown): ParamsDeparts {
  const net: Record<string, unknown> = {};
  if (brut !== null && typeof brut === "object" && !Array.isArray(brut)) {
    for (const [cle, valeur] of Object.entries(brut)) {
      if (typeof valeur === "string" && valeur.length === 0) continue;
      net[cle] = valeur;
    }
  }
  return lire(net, (l) => {
    const jour = l.motifOpt("jour", RE_JOUR, "AAAA-MM-JJ attendu");
    const origine = l.chaineOpt("origine", { max: TEXTE_MAX });
    const destination = l.chaineOpt("destination", { max: TEXTE_MAX });
    return {
      ...(jour !== undefined ? { jour } : {}),
      ...(origine !== undefined ? { origine } : {}),
      ...(destination !== undefined ? { destination } : {}),
    };
  });
}

/** `SchemaVenteVendeur`. */
export interface VenteDemandee {
  departId: string;
  voisin: { nom: string; telephone: string };
  reglementAgence: (typeof MOYENS_PAIEMENT_COLIS)[number];
}

export const lireVente = (brut: unknown): VenteDemandee =>
  lire(brut, (l) => {
    const voisin = l.objet("voisin");
    return {
      departId: l.chaine("departId"),
      voisin: {
        nom: voisin.chaine("nom", { max: NOM_MAX }),
        telephone: voisin.telephone("telephone"),
      },
      reglementAgence: l.enumeration("reglementAgence", MOYENS_PAIEMENT_COLIS),
    };
  });

/* ------------------------------------------------------------------ agences (hors contrat) */

export interface AgrementDemande {
  nom: string;
  telephone: string;
  quartier: string;
  ville: string;
  /** Le compte mobile money du vendeur ; son téléphone par défaut. */
  momo: { telephone: string; operateur: (typeof OPERATEURS)[number] } | null;
  commissionClassique: number | undefined;
  commissionVip: number | undefined;
}

const lireMontantCommission = (l: Lecteur, nom: string): number | undefined =>
  l.present(nom) ? l.entier(nom, { min: 0, max: COMMISSION_MAX }) : undefined;

export const lireAgrement = (brut: unknown): AgrementDemande =>
  lire(brut, (l) => ({
    nom: l.chaine("nom", { max: NOM_MAX }),
    telephone: l.telephone("telephone"),
    quartier: l.chaine("quartier", { max: TEXTE_MAX }),
    ville: l.chaine("ville", { max: TEXTE_MAX }),
    momo: l.present("momo")
      ? (() => {
          const m = l.objet("momo");
          return {
            telephone: m.telephone("telephone"),
            operateur: m.enumeration("operateur", OPERATEURS),
          };
        })()
      : null,
    commissionClassique: lireMontantCommission(l, "commissionClassique"),
    commissionVip: lireMontantCommission(l, "commissionVip"),
  }));

export const lireCommissions = (
  brut: unknown,
): { commissionClassique: number; commissionVip: number } =>
  lire(brut, (l) => {
    const classique = lireMontantCommission(l, "commissionClassique");
    const vip = lireMontantCommission(l, "commissionVip");
    if (classique === undefined) l.entier("commissionClassique");
    if (vip === undefined) l.entier("commissionVip");
    return { commissionClassique: classique ?? 0, commissionVip: vip ?? 0 };
  });

/** Un identifiant de chemin : texte non vide et raisonnable. */
export function lireIdentifiant(valeur: unknown, nom: string): string {
  if (typeof valeur !== "string" || valeur.length < 1 || valeur.length > 80) {
    throw requeteInvalide("Requête invalide", [{ chemin: nom, message: "Identifiant attendu" }]);
  }
  return valeur;
}
