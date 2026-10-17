import { requeteInvalide, erreurApi } from "../analyses/erreurs";
import type { DemandeSimulationVue } from "./modele";

/**
 * Lecture à la main des corps de requête (l'API n'importe pas zod à l'exécution). Les tests comparent
 * ces lectures aux schémas du contrat : ce que le contrat accepte passe, ce qu'il refuse est refusé.
 */

export const QUESTION_MAXIMUM = 500;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function sansChampInconnu(corps: Record<string, unknown>, permis: readonly string[]): void {
  const inconnus = Object.keys(corps).filter((k) => !permis.includes(k));
  if (inconnus.length > 0) throw requeteInvalide(`Champ inattendu : ${inconnus.join(", ")}`);
}

export function identifiant(valeur: unknown, nom: string): string {
  if (typeof valeur !== "string" || valeur.length === 0 || valeur.length > 200) {
    throw requeteInvalide(`${nom} : identifiant attendu`);
  }
  return valeur;
}

/** `{ question }` : de 1 à 500 caractères une fois les blancs retirés. */
export function lireQuestion(corps: unknown): string {
  if (!estObjet(corps)) throw requeteInvalide("Corps invalide : { question } attendu");
  sansChampInconnu(corps, ["question"]);
  const brute = corps["question"];
  if (typeof brute !== "string") throw requeteInvalide("question : texte attendu");
  const question = brute.trim();
  if (question.length === 0 || question.length > QUESTION_MAXIMUM) {
    throw requeteInvalide(`question : de 1 à ${QUESTION_MAXIMUM} caractères`);
  }
  return question;
}

/** `{ type: "horaire", departId, nouvelleHeure }` ou `{ type: "prix", departId, nouveauPrix }`. */
export function lireDemandeSimulation(corps: unknown): DemandeSimulationVue {
  if (!estObjet(corps))
    throw requeteInvalide("Corps invalide : une demande de simulation est attendue");
  if (corps["type"] === "horaire") {
    sansChampInconnu(corps, ["type", "departId", "nouvelleHeure"]);
    const heure = corps["nouvelleHeure"];
    if (typeof heure !== "string" || !HEURE.test(heure)) {
      throw requeteInvalide("nouvelleHeure : HH:MM attendu");
    }
    return {
      type: "horaire",
      departId: identifiant(corps["departId"], "departId"),
      nouvelleHeure: heure,
    };
  }
  if (corps["type"] === "prix") {
    sansChampInconnu(corps, ["type", "departId", "nouveauPrix"]);
    const prix = corps["nouveauPrix"];
    if (typeof prix !== "number" || !Number.isSafeInteger(prix) || prix <= 0) {
      throw requeteInvalide("nouveauPrix : entier positif attendu (FCFA)");
    }
    return {
      type: "prix",
      departId: identifiant(corps["departId"], "departId"),
      nouveauPrix: prix,
    };
  }
  throw requeteInvalide("type : horaire ou prix attendu");
}

/** `{ actionId, signature }` : la signature a déjà été lue (`lireSignature`) ; ici, le reste. */
export function lireProposition(corps: unknown): { actionId: string } {
  const invalide = (message: string) => erreurApi(422, "COMMANDE_INVALIDE", message);
  if (!estObjet(corps)) throw invalide("Corps de la commande invalide");
  const inconnus = Object.keys(corps).filter((k) => k !== "actionId" && k !== "signature");
  if (inconnus.length > 0) throw invalide(`Champ inattendu : ${inconnus.join(", ")}`);
  const id = corps["actionId"];
  if (typeof id !== "string" || id.length === 0 || id.length > 200) {
    throw invalide("actionId : identifiant de proposition attendu");
  }
  return { actionId: id };
}
