import { HttpException } from "@nestjs/common";
import { erreurApi, type SignaturePin } from "../modules/commande";
import { estIdExport, type ActionRapprochement, type IdExport } from "./modele";
import { estMoisValide } from "./temps";

/**
 * Lecture et validation des paramètres et des corps de requête. Mêmes erreurs que le mock du client
 * (`packages/api-client/src/patron/mock`) : 401 `PIN_REQUIS` sans signature, 422 `COMMANDE_INVALIDE` pour un
 * corps incomplet ou avec un champ en trop, et, pour une lecture, 400 `REQUETE_INVALIDE`.
 */

export { erreurApi };

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const INSTANT_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;

function invalide(message: string): HttpException {
  return erreurApi(422, "COMMANDE_INVALIDE", message);
}

/** Paramètre `mois` facultatif d'une lecture : `AAAA-MM`, sinon 400. */
export function lireMoisFacultatif(brut: unknown): string | undefined {
  if (brut === undefined || brut === "") return undefined;
  if (!estMoisValide(brut)) {
    throw erreurApi(400, "REQUETE_INVALIDE", "Le mois doit s'écrire AAAA-MM");
  }
  return brut;
}

export function lireIdExport(brut: unknown): IdExport {
  if (!estIdExport(brut)) throw erreurApi(404, "EXPORT_INCONNU", "Export inconnu");
  return brut;
}

/** Paramètre `onglet` facultatif de l'aperçu : un identifiant court (« par_jour »). */
export function lireOngletFacultatif(brut: unknown): string | undefined {
  if (brut === undefined || brut === "") return undefined;
  if (typeof brut !== "string" || !/^[a-z_]{1,40}$/.test(brut)) {
    throw erreurApi(400, "REQUETE_INVALIDE", "Onglet invalide");
  }
  return brut;
}

/**
 * Lit la signature d'une écriture. Absente ou illisible : 401 `PIN_REQUIS`, comme le mock du client,
 * pour que l'écran réagisse pareil aux deux adaptateurs.
 */
export function lireSignature(corps: unknown): SignaturePin {
  const brut = estObjet(corps) ? corps["signature"] : undefined;
  if (
    !estObjet(brut) ||
    typeof brut["pin"] !== "string" ||
    !/^\d{6}$/.test(brut["pin"]) ||
    (brut["methode"] !== "pin" && brut["methode"] !== "empreinte") ||
    typeof brut["signeA"] !== "string" ||
    !INSTANT_DOUALA.test(brut["signeA"]) ||
    Number.isNaN(Date.parse(brut["signeA"]))
  ) {
    throw erreurApi(401, "PIN_REQUIS", "Signature PIN requise pour cette écriture");
  }
  return { pin: brut["pin"], methode: brut["methode"], signeA: brut["signeA"] };
}

function refuserChampsEnTrop(corps: Record<string, unknown>, permis: readonly string[]): void {
  const inconnus = Object.keys(corps).filter((k) => !permis.includes(k));
  if (inconnus.length > 0) throw invalide(`Champ inattendu : ${inconnus.join(", ")}`);
}

function lireMoisObligatoire(brut: unknown): string {
  if (!estMoisValide(brut)) throw invalide("Le mois doit s'écrire AAAA-MM");
  return brut;
}

export interface DecisionDemandee {
  reference: string;
  action: ActionRapprochement;
}

export interface CommandeRapprochement {
  mois: string;
  decisions: DecisionDemandee[];
  signature: SignaturePin;
}

export const MAX_DECISIONS = 500;
const ACTIONS: readonly ActionRapprochement[] = ["rembourser", "rattacher", "demander"];

/** Corps de `POST /patron/comptable/rapprochement/decisions` : `{ mois, decisions, signature }`, rien d'autre. */
export function lireRapprochement(corps: unknown, signature: SignaturePin): CommandeRapprochement {
  if (!estObjet(corps)) throw invalide("Corps de la commande invalide");
  refuserChampsEnTrop(corps, ["mois", "decisions", "signature"]);
  const mois = lireMoisObligatoire(corps["mois"]);
  const brutes = corps["decisions"];
  if (!Array.isArray(brutes) || brutes.length === 0) {
    throw invalide("Au moins une décision est attendue");
  }
  if (brutes.length > MAX_DECISIONS) throw invalide(`Au plus ${MAX_DECISIONS} décisions à la fois`);
  const vues = new Set<string>();
  const decisions = brutes.map((b: unknown): DecisionDemandee => {
    if (!estObjet(b)) throw invalide("Décision invalide");
    refuserChampsEnTrop(b, ["reference", "action"]);
    const reference = b["reference"];
    const action = b["action"];
    if (typeof reference !== "string" || reference.length === 0 || reference.length > 64) {
      throw invalide("Référence de transaction invalide");
    }
    if (typeof action !== "string" || !ACTIONS.includes(action as ActionRapprochement)) {
      throw invalide("Action invalide : rembourser, rattacher ou demander");
    }
    if (vues.has(reference)) throw invalide(`Référence en double : ${reference}`);
    vues.add(reference);
    return { reference, action: action as ActionRapprochement };
  });
  return { mois, decisions, signature };
}

export interface CommandeCloture {
  mois: string;
  envoyerAuCabinet: boolean;
  signature: SignaturePin;
}

/** Corps de `POST /patron/comptable/clotures` : `{ mois, envoyerAuCabinet, signature }`, rien d'autre. */
export function lireCloture(corps: unknown, signature: SignaturePin): CommandeCloture {
  if (!estObjet(corps)) throw invalide("Corps de la commande invalide");
  refuserChampsEnTrop(corps, ["mois", "envoyerAuCabinet", "signature"]);
  const mois = lireMoisObligatoire(corps["mois"]);
  if (typeof corps["envoyerAuCabinet"] !== "boolean") {
    throw invalide("`envoyerAuCabinet` doit être vrai ou faux");
  }
  return { mois, envoyerAuCabinet: corps["envoyerAuCabinet"], signature };
}
