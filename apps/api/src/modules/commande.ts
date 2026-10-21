import { HttpException } from "@nestjs/common";
import type { Portee } from "./portee";

/** Erreur HTTP au format de l'API : `{ code, message }` (le client lit `code`). */
export function erreurApi(statut: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: statut, code, message }, statut);
}

/** Signature PIN d'une écriture du patron (`SignaturePin` des contrats patron). */
export interface SignaturePin {
  pin: string;
  methode: "pin" | "empreinte";
  signeA: string;
}

export interface ChangementModule {
  code: string;
  actif: boolean;
  portee: Portee;
  signature: SignaturePin;
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const INSTANT_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;

/**
 * Lit la signature d'une écriture. Absente ou illisible : 401 `PIN_REQUIS`, comme le mock du
 * client (`lireCommande`), pour que l'écran réagisse pareil aux deux adaptateurs.
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
    throw erreurApi(401, "PIN_REQUIS", "Signature PIN requise pour modifier un module");
  }
  return { pin: brut["pin"], methode: brut["methode"], signeA: brut["signeA"] };
}

function invalide(message: string): HttpException {
  return erreurApi(422, "COMMANDE_INVALIDE", message);
}

function lirePortee(brut: unknown): Portee {
  if (!estObjet(brut)) throw invalide("La portée est obligatoire");
  const cles = Object.keys(brut).sort().join(",");
  if (brut["type"] === "agence" && cles === "type") return { type: "agence" };
  if (
    brut["type"] === "gare" &&
    cles === "id,type" &&
    typeof brut["id"] === "string" &&
    brut["id"].length > 0
  ) {
    return { type: "gare", id: brut["id"] };
  }
  if (
    brut["type"] === "ville" &&
    cles === "nom,type" &&
    typeof brut["nom"] === "string" &&
    brut["nom"].trim().length > 0 &&
    brut["nom"].length <= 100
  ) {
    return { type: "ville", nom: brut["nom"].trim() };
  }
  throw invalide("Portée invalide : agence, gare (id) ou ville (nom)");
}

/** Corps de `PUT /patron/modules/:code` : `code`, `actif`, `portee`, `signature`, rien d'autre. */
export function lireChangement(corps: unknown, signature: SignaturePin): ChangementModule {
  if (!estObjet(corps)) throw invalide("Corps de la commande invalide");
  const inconnues = Object.keys(corps).filter(
    (k) => !["code", "actif", "portee", "signature"].includes(k),
  );
  if (inconnues.length > 0) throw invalide(`Champ inattendu : ${inconnues.join(", ")}`);
  if (typeof corps["code"] !== "string" || corps["code"].length === 0) {
    throw invalide("Le code du module est obligatoire");
  }
  if (typeof corps["actif"] !== "boolean") throw invalide("`actif` doit être vrai ou faux");
  return {
    code: corps["code"],
    actif: corps["actif"],
    portee: lirePortee(corps["portee"]),
    signature,
  };
}

/** Paramètre d'URL optionnel : texte non vide de 100 caractères au plus, sinon `null`. */
export function texteOptionnel(valeur: unknown, nom: string): string | null {
  if (valeur === undefined || valeur === "") return null;
  if (typeof valeur !== "string" || valeur.trim().length === 0 || valeur.length > 100) {
    throw erreurApi(400, "REQUETE_INVALIDE", `Paramètre « ${nom} » invalide`);
  }
  return valeur.trim();
}
