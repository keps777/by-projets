import { ErreurColis, requeteInvalide } from "../colis/erreurs";
import { RE_CODE_RETRAIT, RE_UUID, lire } from "../colis/validation";
import { OPERATEURS } from "../relais/validation";
import type { Deplacement } from "./modele";
import { RE_DATE } from "./regles";

/**
 * Lecture des corps de requête de la livraison. Comme pour les colis, l'API ne peut pas importer zod à
 * l'exécution : ces lecteurs reprennent à la main les règles des schémas de `@afrimove/contrats`
 * (colis, `livraison.ts` et `inscriptions.ts`), et `validation.test.ts` les compare aux schémas zod.
 * Les champs inconnus sont ignorés et jamais recopiés ; seules quelques longueurs maximales s'ajoutent
 * au contrat, pour qu'une demande ne devienne pas un fourre-tout.
 */

export const DEPLACEMENTS = [
  "moto",
  "velo",
  "pied",
  "tricycle",
] as const satisfies readonly Deplacement[];

const TEXTE_MAX = 200;

/** Un identifiant de mission mal formé ne désigne aucune mission : 404, sans interroger la base. */
export function lireIdMission(brut: string): string {
  if (!RE_UUID.test(brut)) {
    throw new ErreurColis(404, "mission_introuvable", "Mission introuvable");
  }
  return brut;
}

/** `{ disponible }` : le livreur se met en ligne ou hors ligne. */
export const lireDisponibilite = (brut: unknown): { disponible: boolean } =>
  lire(brut, (l) => ({ disponible: l.booleen("disponible") }));

export interface RemiseLivreur {
  code: string;
  photoRef: string;
}

/**
 * La remise du livreur : le code du client, la pièce vue (jamais photographiée) et la photo du colis
 * remis. L'identifiant de la mission est dans le chemin (le client ne l'envoie pas dans le corps).
 */
export const lireRemiseLivreur = (brut: unknown): RemiseLivreur =>
  lire(brut, (l) => {
    l.vrai("pieceVerifiee");
    return {
      code: l.motif("code", RE_CODE_RETRAIT, "6 chiffres attendus"),
      photoRef: l.chaine("photoRef"),
    };
  });

/** `{ montant? }` : un retrait partiel ou, sans montant, tout le solde. */
export const lireRetraitGains = (brut: unknown): { montant: number | undefined } =>
  lire(brut ?? {}, (l) => ({ montant: l.present("montant") ? l.montant("montant") : undefined }));

export const lireInvitation = (brut: unknown): { telephone: string } =>
  lire(brut, (l) => ({ telephone: l.telephone("telephone") }));

export const lirePartage = (brut: unknown): { destinataire: string } =>
  lire(brut, (l) => ({ destinataire: l.telephone("destinataire") }));

export const lireAdresse = (brut: unknown): { adresse: string } =>
  lire(brut, (l) => ({ adresse: l.chaine("adresse", { max: 300 }) }));

export interface DemandeLivreurSaisie {
  deplacement: Deplacement;
  zone: string;
  heures: string;
  chargeMax: string;
  /** Absent : le serveur prend le MoMo du compte. */
  momo?: { telephone: string; operateur: "mtn" | "orange" };
  pieces: { permisRef: string | null; assuranceRef: string | null };
}

export const lireDemandeLivreur = (brut: unknown): DemandeLivreurSaisie =>
  lire(brut, (l) => {
    l.vrai("reglesAcceptees");
    const momo = l.present("momo") ? l.objet("momo") : null;
    const pieces = l.objet("pieces");
    return {
      deplacement: l.enumeration("deplacement", DEPLACEMENTS),
      zone: l.chaine("zone", { max: TEXTE_MAX }),
      heures: l.chaine("heures", { max: TEXTE_MAX }),
      chargeMax: l.chaine("chargeMax", { max: TEXTE_MAX }),
      ...(momo
        ? {
            momo: {
              telephone: momo.telephone("telephone"),
              operateur: momo.enumeration("operateur", OPERATEURS),
            },
          }
        : {}),
      pieces: {
        permisRef: pieces.chaineOpt("permisRef") ?? null,
        assuranceRef: pieces.chaineOpt("assuranceRef") ?? null,
      },
    };
  });

/* ------------------------------------------------------------------ agents AfriMove (hors contrat) */

export interface VerificationLivreur {
  identite: boolean;
  pieces: { permisValideJusqua: string; assuranceExpireLe: string } | null;
  formation: boolean;
}

/** Une vraie date du calendrier : « 2028-02-30 » n'existe pas (le lecteur de dates de JavaScript la corrige en silence). */
const estUneDate = (texte: string): boolean => {
  if (!RE_DATE.test(texte)) return false;
  const date = new Date(`${texte}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === texte;
};

/**
 * Ce que l'agent a vérifié : la CNI et le MoMo au même nom, le permis et l'assurance (avec leurs dates de
 * fin) et la formation de 10 minutes. Chaque rubrique est facultative : l'agent les coche une à une.
 */
export const lireVerificationLivreur = (brut: unknown): VerificationLivreur =>
  lire(brut, (l) => {
    const identite = l.present("identite") ? l.vrai("identite") : false;
    const formation = l.present("formation") ? l.vrai("formation") : false;
    let pieces: VerificationLivreur["pieces"] = null;
    if (l.present("pieces")) {
      const p = l.objet("pieces");
      const permis = p.motif("permisValideJusqua", RE_DATE, "Date AAAA-MM-JJ attendue");
      const assurance = p.motif("assuranceExpireLe", RE_DATE, "Date AAAA-MM-JJ attendue");
      for (const [nom, valeur] of [
        ["permisValideJusqua", permis],
        ["assuranceExpireLe", assurance],
      ] as const) {
        if (RE_DATE.test(valeur) && !estUneDate(valeur)) {
          throw requeteInvalide("Requête invalide", [
            { chemin: `pieces.${nom}`, message: "Date inexistante" },
          ]);
        }
      }
      pieces = { permisValideJusqua: permis, assuranceExpireLe: assurance };
    }
    return { identite, pieces, formation };
  });

export const lireActivationLivreur = (brut: unknown): { moto: string | null } =>
  lire(brut ?? {}, (l) => ({ moto: l.chaineOpt("moto", { max: 20 }) ?? null }));

export const lireRefusLivreur = (brut: unknown): { motif: string } =>
  lire(brut, (l) => ({ motif: l.chaine("motif", { max: 500 }) }));
