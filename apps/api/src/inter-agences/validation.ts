import { requeteInvalide } from "../colis/erreurs";
import { lire, type ErreurChamp } from "../colis/validation";
import type { LigneParts, LigneVoyageurs, PartsConvention, Renouvellement } from "./modele";
import { ATTENTE_SECOND_BUS_MINUTES, GARANTIE_CORRESPONDANCE_MINUTES } from "./regles";

/**
 * Lecture des corps de requête de l'inter-agences. Comme pour les colis, l'API ne peut pas importer zod à
 * l'exécution : ces lecteurs reprennent à la main les règles des schémas de `@afrimove/contrats` (colis,
 * fichier `inter-agences.ts`), et `validation.test.ts` les compare aux schémas zod. Les champs inconnus
 * sont ignorés et jamais recopiés. Les routes ajoutées (hors contrat) ont leurs propres lecteurs.
 */

export const SENS_TRANSFERT = ["remis_a", "recu"] as const;
export type SensTransfert = (typeof SENS_TRANSFERT)[number];
export const RENOUVELLEMENTS = ["trimestriel", "annuel"] as const;
export const ISSUES_CONTESTATION = ["accordee", "rejetee"] as const;

const TEXTE_MAX = 200;
const MOTIF_MAX = 1000;

/* ------------------------------------------------------------------ routes du contrat */

export interface ScanTransfertSaisi {
  colisId: string;
  sens: SensTransfert;
  compagnie: string;
  lieu?: string;
}

/** `SchemaScanTransfert` : le colis, le sens du scan, la compagnie qui prend en charge, le lieu (facultatif). */
export const lireScanTransfert = (brut: unknown): ScanTransfertSaisi =>
  lire(brut, (l) => {
    const lieu = l.chaineOpt("lieu", { max: TEXTE_MAX });
    return {
      colisId: l.chaine("colisId"),
      sens: l.enumeration("sens", SENS_TRANSFERT),
      compagnie: l.chaine("compagnie", { max: TEXTE_MAX }),
      ...(lieu !== undefined ? { lieu } : {}),
    };
  });

/** `SchemaContestationReglement` : un motif, et les colis contestés (tout le relevé si absents). */
export const lireContestation = (brut: unknown): { motif: string; colisIds?: string[] } =>
  lire(brut, (l) => {
    const motif = l.chaine("motif", { max: MOTIF_MAX });
    const colisIds = l.present("colisIds") ? l.chaines("colisIds", { max: 200 }) : undefined;
    return { motif, ...(colisIds !== undefined ? { colisIds } : {}) };
  });

/** `SchemaInvitationCompagnie` : le nom de la compagnie invitée et le téléphone de son patron. */
export const lireInvitation = (brut: unknown): { compagnie: string; patron: string } =>
  lire(brut, (l) => ({
    compagnie: l.chaine("compagnie", { max: TEXTE_MAX }),
    patron: l.chaine("patron", { max: 40 }),
  }));

/* ------------------------------------------------------------------ routes ajoutées */

const estObjet = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function echec(chemin: string, message: string): never {
  const erreur: ErreurChamp = { chemin, message };
  throw requeteInvalide("Requête invalide", [erreur]);
}

function entierPositif(valeur: unknown, chemin: string): number {
  if (typeof valeur !== "number" || !Number.isSafeInteger(valeur) || valeur <= 0) {
    echec(chemin, "Entier strictement positif attendu");
  }
  return valeur;
}

function montantOuNul(valeur: unknown, chemin: string): number | null {
  if (valeur === null) return null;
  if (typeof valeur !== "number" || !Number.isSafeInteger(valeur) || valeur < 0) {
    echec(chemin, "Montant entier (ou null) attendu");
  }
  return valeur;
}

function texte(valeur: unknown, chemin: string): string {
  if (typeof valeur !== "string" || valeur.trim().length < 1 || valeur.length > TEXTE_MAX) {
    echec(chemin, `Texte de 1 à ${TEXTE_MAX} caractères attendu`);
  }
  return valeur.trim();
}

function tableau(valeur: unknown, chemin: string, max: number): unknown[] {
  if (!Array.isArray(valeur) || valeur.length > max)
    echec(chemin, `Tableau d'au plus ${max} éléments`);
  return valeur;
}

function partsParCompagnie(valeur: unknown, chemin: string): Record<string, number | null> {
  if (!estObjet(valeur)) echec(chemin, "Objet attendu (compagnie → montant)");
  const parts: Record<string, number | null> = {};
  for (const [cle, montant] of Object.entries(valeur)) {
    parts[cle] = montantOuNul(montant, `${chemin}.${cle}`);
  }
  return parts;
}

export interface PropositionConvention {
  compagnieId: string;
  renouvellement: Renouvellement;
  parts: PartsConvention;
  voyageurs: {
    garantieMinutes: number;
    attenteMinutes: number;
    lignes: LigneVoyageurs[];
  };
}

/**
 * `POST /inter-agences/conventions` : la compagnie invitée, le renouvellement, le tableau des parts du
 * colis type (par compagnie) et, facultatif, les lignes de billets en correspondance. La signature PIN est
 * lue à part (`lireSignature`).
 */
export function lirePropositionConvention(brut: unknown): PropositionConvention {
  const base = lire(brut, (l) => {
    const type = l.objet("parts").objet("colisType");
    return {
      compagnieId: l.chaine("compagnieId", { max: TEXTE_MAX }),
      renouvellement: l.enumeration("renouvellement", RENOUVELLEMENTS, "trimestriel"),
      colisType: { poidsKg: type.positif("poidsKg"), prix: type.entier("prix", { min: 1 }) },
    };
  });
  const racine = brut as Record<string, unknown>;
  const partsBrutes = racine["parts"] as Record<string, unknown>;
  const lignes: LigneParts[] = tableau(partsBrutes["lignes"], "parts.lignes", 20).map((x, i) => {
    if (!estObjet(x)) echec(`parts.lignes[${i}]`, "Objet attendu");
    return {
      troncon: texte(x["troncon"], `parts.lignes[${i}].troncon`),
      parts: partsParCompagnie(x["parts"], `parts.lignes[${i}].parts`),
    };
  });
  return {
    compagnieId: base.compagnieId,
    renouvellement: base.renouvellement,
    parts: { colisType: base.colisType, lignes },
    voyageurs: lireVoyageurs(racine["voyageurs"]),
  };
}

function lireVoyageurs(brut: unknown): PropositionConvention["voyageurs"] {
  const defaut = {
    garantieMinutes: GARANTIE_CORRESPONDANCE_MINUTES,
    attenteMinutes: ATTENTE_SECOND_BUS_MINUTES,
    lignes: [],
  };
  if (brut === undefined) return defaut;
  if (!estObjet(brut)) echec("voyageurs", "Objet attendu");
  return {
    garantieMinutes:
      brut["garantieMinutes"] === undefined
        ? defaut.garantieMinutes
        : entierPositif(brut["garantieMinutes"], "voyageurs.garantieMinutes"),
    attenteMinutes:
      brut["attenteMinutes"] === undefined
        ? defaut.attenteMinutes
        : entierPositif(brut["attenteMinutes"], "voyageurs.attenteMinutes"),
    lignes: tableau(brut["lignes"] ?? [], "voyageurs.lignes", 20).map((x, i) => {
      if (!estObjet(x)) echec(`voyageurs.lignes[${i}]`, "Objet attendu");
      const parts = partsParCompagnie(x["parts"], `voyageurs.lignes[${i}].parts`);
      const entiers: Record<string, number> = {};
      for (const [c, m] of Object.entries(parts)) {
        if (m === null) echec(`voyageurs.lignes[${i}].parts.${c}`, "Montant entier attendu");
        entiers[c] = m;
      }
      return {
        origine: texte(x["origine"], `voyageurs.lignes[${i}].origine`),
        via: texte(x["via"], `voyageurs.lignes[${i}].via`),
        premiere: texte(x["premiere"], `voyageurs.lignes[${i}].premiere`),
        destination: texte(x["destination"], `voyageurs.lignes[${i}].destination`),
        parts: entiers,
      };
    }),
  };
}

/** `POST /inter-agences/colis` : le colis et les départs de chaque tronçon, dans l'ordre du voyage. */
export const lireEnregistrementColis = (brut: unknown): { colisId: string; departIds: string[] } =>
  lire(brut, (l) => ({
    colisId: l.chaine("colisId"),
    departIds: l.chaines("departIds", { min: 2, max: 5 }),
  }));

/** `POST /inter-agences/billets` : le billet vendu (identifiant ou numéro) et le départ de son second tronçon. */
export const lireEnregistrementBillet = (brut: unknown): { billet: string; departId: string } =>
  lire(brut, (l) => ({ billet: l.chaine("billet"), departId: l.chaine("departId") }));

/** `POST /inter-agences/billets/:id/embarquements` : le rang du tronçon où le voyageur monte. */
export const lireEmbarquement = (brut: unknown): { rang: number } =>
  lire(brut, (l) => ({ rang: l.entier("rang", { min: 1, max: 10 }) }));

/** `POST /inter-agences/billets/:id/arrivee-premier-bus` : l'heure réelle d'arrivée du premier bus. */
export const lireArrivee = (brut: unknown): { arriveeLe: string } =>
  lire(brut, (l) => ({ arriveeLe: l.iso("arriveeLe") }));

/** `POST /inter-agences/contestations/:reference/resolution` : la décision de l'agent AfriMove. */
export const lireResolution = (brut: unknown): { issue: (typeof ISSUES_CONTESTATION)[number] } =>
  lire(brut, (l) => ({ issue: l.enumeration("issue", ISSUES_CONTESTATION) }));
