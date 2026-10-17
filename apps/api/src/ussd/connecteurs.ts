import { TelephoneInvalide, normaliserTelephone } from "../socle/comptes/telephone";
import type { OperateurUssd } from "./config";
import type { EntreeUssd, SortieUssd } from "./modeles";

/**
 * Connecteurs des opérateurs (MTN, Orange). Chaque opérateur appelle notre adresse à chaque réponse
 * du voyageur et attend un texte en retour ; le format de l'échange diffère. Un connecteur ne fait
 * que traduire : lire la requête de l'opérateur en `EntreeUssd`, écrire une `SortieUssd` dans son
 * format. Toute la logique (menus, achat, paiement) est dans `DialogueUssdService`.
 *
 * **Formats provisoires** : aucun contrat ni accès sandbox des opérateurs n'était disponible. Les
 * deux formats ci-dessous sont des formes courantes des passerelles USSD (un échange à champs
 * nommés avec le texte cumulé des réponses, un échange JSON avec le type de requête) ; ils seront
 * ajustés ici, et ici seulement, avec la documentation de chaque opérateur.
 */

export class RequeteUssdIllisible extends Error {
  constructor(readonly raison: string) {
    super(`Requête USSD illisible : ${raison}`);
    this.name = "RequeteUssdIllisible";
  }
}

export interface ReponseUssd {
  contentType: string;
  corps: string;
}

export abstract class ConnecteurUssd {
  abstract readonly operateur: OperateurUssd;
  /** Lève `RequeteUssdIllisible` si un champ manque ou n'a pas la forme attendue. */
  abstract lire(corps: unknown): EntreeUssd;
  abstract ecrire(sortie: SortieUssd): ReponseUssd;
}

type Objet = Record<string, unknown>;

function objet(corps: unknown): Objet {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    throw new RequeteUssdIllisible("le corps doit être un objet");
  }
  return corps as Objet;
}

/** Un texte court sans caractère de contrôle ; un nombre est accepté comme texte. */
function texte(corps: Objet, noms: readonly string[], max: number, obligatoire: boolean): string {
  for (const nom of noms) {
    const v = corps[nom];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" && typeof v !== "number") {
      throw new RequeteUssdIllisible(`${nom} doit être un texte`);
    }
    const net = String(v)
      .replace(/[\p{C}]/gu, "")
      .trim();
    if (net.length > max) throw new RequeteUssdIllisible(`${nom} est trop long`);
    return net;
  }
  if (obligatoire) throw new RequeteUssdIllisible(`${noms[0]} est obligatoire`);
  return "";
}

const IDENTIFIANT = /^[A-Za-z0-9._:-]{1,64}$/;

function identifiantSession(corps: Objet, noms: readonly string[]): string {
  const id = texte(corps, noms, 64, true);
  if (!IDENTIFIANT.test(id)) throw new RequeteUssdIllisible("identifiant de session invalide");
  return id;
}

/**
 * Les opérateurs envoient le numéro avec ou sans « + » (`237677012345`). Le service ne parle qu'aux
 * numéros camerounais : le paiement mobile et les SMS en dépendent.
 */
export function msisdnInternational(brut: string): string {
  const net = brut.replace(/[\s.\-()]/g, "");
  const avecPlus = /^\d{11,15}$/.test(net) ? `+${net}` : net;
  let tel: string;
  try {
    tel = normaliserTelephone(avecPlus);
  } catch (e) {
    if (e instanceof TelephoneInvalide) throw new RequeteUssdIllisible("numéro invalide");
    throw e;
  }
  if (!/^\+2376\d{8}$/.test(tel)) throw new RequeteUssdIllisible("numéro hors Cameroun");
  return tel;
}

/** Une réponse du voyageur : des chiffres, `*` et `#` ; tout autre caractère est retiré. */
function nettoyerSaisie(brut: string): string {
  return brut.replace(/[^0-9A-Za-z+*#\- ]/g, "").trim();
}

/**
 * MTN — échange à champs nommés (JSON ou formulaire), texte cumulé des réponses séparées par `*`
 * (`"1*2*1"`), réponse en texte brut préfixée `CON ` (la session continue) ou `END ` (elle se
 * termine).
 *
 *   entrée : { sessionId, msisdn, serviceCode, text }       text = "" à l'ouverture
 *   sortie : "CON AfriMove\n1 Billet…"   ou   "END Annule."
 */
export class ConnecteurMtn extends ConnecteurUssd {
  readonly operateur = "mtn" as const;

  lire(corps: unknown): EntreeUssd {
    const c = objet(corps);
    const cumul = texte(c, ["text", "ussdString"], 200, false);
    const dernier = cumul === "" ? "" : (cumul.split("*").pop() ?? "");
    return {
      operateur: "mtn",
      sessionId: identifiantSession(c, ["sessionId", "session_id"]),
      msisdn: msisdnInternational(texte(c, ["msisdn", "phoneNumber"], 20, true)),
      saisie: nettoyerSaisie(dernier),
      nouvelle: cumul === "",
      fermeture: false,
    };
  }

  ecrire(sortie: SortieUssd): ReponseUssd {
    return {
      contentType: "text/plain; charset=utf-8",
      corps: `${sortie.fin ? "END" : "CON"} ${sortie.texte}`,
    };
  }
}

/**
 * Orange — échange JSON avec le type de requête (`begin`, `continue`, `end` quand le voyageur
 * quitte), réponse JSON `{ message, action }`.
 *
 *   entrée : { session_id, msisdn, request_type, input }
 *   sortie : { "message": "AfriMove\n1 Billet…", "action": "continue" | "end" }
 */
export class ConnecteurOrange extends ConnecteurUssd {
  readonly operateur = "orange" as const;

  lire(corps: unknown): EntreeUssd {
    const c = objet(corps);
    const type = texte(c, ["request_type", "type"], 12, true).toLowerCase();
    if (!["begin", "continue", "end"].includes(type)) {
      throw new RequeteUssdIllisible("request_type : begin, continue ou end");
    }
    return {
      operateur: "orange",
      sessionId: identifiantSession(c, ["session_id", "sessionId"]),
      msisdn: msisdnInternational(texte(c, ["msisdn"], 20, true)),
      saisie: nettoyerSaisie(texte(c, ["input", "ussd_string"], 64, false)),
      nouvelle: type === "begin",
      fermeture: type === "end",
    };
  }

  ecrire(sortie: SortieUssd): ReponseUssd {
    return {
      contentType: "application/json; charset=utf-8",
      corps: JSON.stringify({ message: sortie.texte, action: sortie.fin ? "end" : "continue" }),
    };
  }
}

export const CONNECTEURS: Readonly<Record<OperateurUssd, ConnecteurUssd>> = {
  mtn: new ConnecteurMtn(),
  orange: new ConnecteurOrange(),
};
