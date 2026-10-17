import {
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  FournisseurWhatsApp,
  lireCorpsWebhookMeta,
  verifierAbonnementMeta,
  verifierSignatureWebhook,
  type DemandeAbonnement,
  type DemandeFournisseur,
  type EtatCompteFournisseur,
  type EvenementsWebhook,
  type GabaritDuCompte,
  type ReponseFournisseur,
  type RequeteWebhook,
  type StatutGabaritCompte,
} from "./fournisseur";

export interface ReponseHttp {
  statut: number;
  corps: string;
}

/** Appels HTTP sortants, remplaçables dans les tests (aucun réseau). Lèvent en cas de réseau ou de délai. */
export abstract class TransportHttp {
  abstract poster(
    url: string,
    corps: string,
    entetes: Readonly<Record<string, string>>,
    delaiMs: number,
  ): Promise<ReponseHttp>;

  abstract obtenir(
    url: string,
    entetes: Readonly<Record<string, string>>,
    delaiMs: number,
  ): Promise<ReponseHttp>;
}

/** Transport réel : `fetch` de Node, avec un délai maximal. */
export class TransportFetch extends TransportHttp {
  async poster(
    url: string,
    corps: string,
    entetes: Readonly<Record<string, string>>,
    delaiMs: number,
  ): Promise<ReponseHttp> {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...entetes },
      body: corps,
      signal: AbortSignal.timeout(delaiMs),
    });
    return { statut: reponse.status, corps: await reponse.text() };
  }

  async obtenir(
    url: string,
    entetes: Readonly<Record<string, string>>,
    delaiMs: number,
  ): Promise<ReponseHttp> {
    const reponse = await fetch(url, {
      method: "GET",
      headers: entetes,
      signal: AbortSignal.timeout(delaiMs),
    });
    return { statut: reponse.status, corps: await reponse.text() };
  }
}

export interface ConfigFournisseurHttp {
  /** Racine de l'API, version comprise, en https : `https://graph.facebook.com/v21.0`. */
  urlApi: string;
  jeton: string;
  /** « Phone number ID » du numéro d'envoi. */
  numeroId: string;
  /** « WABA ID » : compte WhatsApp Business (liste des gabarits). */
  compteId: string;
  secretApplication: string;
  jetonVerification: string;
  /** Délai maximal d'un appel. */
  delaiMs: number;
}

/**
 * Codes d'erreur de l'API Cloud qui disent que **ce message** ne partira jamais par WhatsApp : on
 * ne réessaie pas, la passerelle bascule sur le SMS. À confirmer avec le compte sandbox.
 */
const DEFINITIFS: Readonly<Record<number, string>> = {
  100: "parametre_invalide",
  131008: "parametre_manquant",
  131009: "parametre_invalide",
  131026: "pas_sur_whatsapp",
  131030: "numero_non_autorise", // compte de test : destinataire hors de la liste autorisée
  131047: "fenetre_fermee",
  131051: "type_non_pris_en_charge",
  132000: "gabarit_parametres",
  132001: "gabarit_inconnu",
  132005: "gabarit_traduction",
  132007: "gabarit_refuse",
  132012: "gabarit_parametres",
  132015: "gabarit_suspendu",
  132016: "gabarit_suspendu",
};

/** Codes à réessayer plus tard : débit, accès, service, paiement. */
const TEMPORAIRES: Readonly<Record<number, string>> = {
  1: "fournisseur_indisponible",
  2: "fournisseur_indisponible",
  4: "limite_debit",
  17: "limite_debit",
  80007: "limite_debit",
  130429: "limite_debit",
  131016: "fournisseur_indisponible",
  131042: "paiement_requis",
  131056: "limite_debit",
  133004: "fournisseur_indisponible",
  133005: "fournisseur_indisponible",
};

const GABARIT_STATUTS: Readonly<Record<string, StatutGabaritCompte>> = {
  APPROVED: "approuve",
  PENDING: "en_attente",
  IN_APPEAL: "en_attente",
  REJECTED: "refuse",
  PAUSED: "suspendu",
  DISABLED: "suspendu",
  FLAGGED: "suspendu",
};

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function lireJson(corps: string): unknown {
  try {
    return JSON.parse(corps);
  } catch {
    return null;
  }
}

function codeErreur(corps: string): number | null {
  const json = lireJson(corps);
  const erreur = estObjet(json) ? json["error"] : null;
  const code = estObjet(erreur) ? erreur["code"] : null;
  return typeof code === "number" ? code : null;
}

/**
 * Client de l'API Cloud de WhatsApp Business (Meta). Les formats suivent la documentation publique
 * de l'API ; **ils n'ont pas pu être vérifiés contre le compte sandbox** (pas d'accès réseau). Si
 * l'agrégateur retenu expose une autre API, seul ce fichier et `lireCorpsWebhookMeta` changent.
 *
 *  - Envoi : `POST {urlApi}/{numeroId}/messages`, `Authorization: Bearer <jeton>`, corps
 *    `{ messaging_product: "whatsapp", to, type: "template" | "text", biz_opaque_callback_data }` ;
 *    200 avec `{ messages: [{ id }] }`. L'API ne déduplique pas : si la réponse se perd, un réessai
 *    peut envoyer le message deux fois (en-tête `Idempotency-Key` ajouté pour les agrégateurs qui
 *    le respectent).
 *  - Erreurs : le code `error.code` du corps classe l'échec (`DEFINITIFS`, `TEMPORAIRES`) ; sinon
 *    408/429/5xx sont réessayés et les autres 4xx refusés pour de bon.
 *  - Webhook : signature `x-hub-signature-256`, vérification d'abonnement par GET.
 *
 * Aucune réponse de l'API n'est recopiée dans les erreurs : elle pourrait citer le message.
 */
export class FournisseurWhatsAppHttp extends FournisseurWhatsApp {
  readonly nom = "meta";
  readonly reel = true;

  constructor(
    private readonly config: ConfigFournisseurHttp,
    private readonly transport: TransportHttp,
  ) {
    super();
  }

  private url(chemin: string): string {
    return `${this.config.urlApi.replace(/\/+$/, "")}/${chemin}`;
  }

  private corpsEnvoi(demande: DemandeFournisseur): Objet {
    const base = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: demande.destinataire.replace(/^\+/, ""),
      biz_opaque_callback_data: demande.reference,
    };
    const c = demande.contenu;
    if (c.type === "texte") {
      return { ...base, type: "text", text: { preview_url: false, body: c.texte } };
    }
    const composants: Objet[] = [];
    if (c.parametres.length > 0) {
      composants.push({
        type: "body",
        parameters: c.parametres.map((texte) => ({ type: "text", text: texte })),
      });
    }
    if (c.boutonUrl !== null) {
      composants.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: c.boutonUrl }],
      });
    }
    return {
      ...base,
      type: "template",
      template: { name: c.nom, language: { code: c.langue }, components: composants },
    };
  }

  async envoyer(demande: DemandeFournisseur): Promise<ReponseFournisseur> {
    let reponse: ReponseHttp;
    try {
      reponse = await this.transport.poster(
        this.url(`${this.config.numeroId}/messages`),
        JSON.stringify(this.corpsEnvoi(demande)),
        {
          authorization: `Bearer ${this.config.jeton}`,
          "idempotency-key": demande.reference,
        },
        this.config.delaiMs,
      );
    } catch (e) {
      const delai = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ErreurFournisseurTemporaire(delai ? "delai_depasse" : "reseau");
    }

    const { statut } = reponse;
    if (statut >= 200 && statut < 300) {
      const id = lireIdMessage(reponse.corps);
      if (id === null) throw new ErreurFournisseurTemporaire("reponse_illisible");
      return { idFournisseur: id };
    }
    const code = codeErreur(reponse.corps);
    if (code !== null && DEFINITIFS[code]) throw new ErreurFournisseurDefinitive(DEFINITIFS[code]);
    if (code !== null && TEMPORAIRES[code])
      throw new ErreurFournisseurTemporaire(TEMPORAIRES[code]);
    if (statut === 401 || statut === 403 || code === 190) {
      throw new ErreurFournisseurTemporaire("acces_refuse");
    }
    if (statut === 429) throw new ErreurFournisseurTemporaire("limite_debit");
    if (statut >= 500 || statut === 408 || statut === 425) {
      throw new ErreurFournisseurTemporaire("fournisseur_indisponible");
    }
    throw new ErreurFournisseurDefinitive("refuse");
  }

  lireWebhook(requete: RequeteWebhook): EvenementsWebhook {
    return lireCorpsWebhookMeta(verifierSignatureWebhook(this.config.secretApplication, requete));
  }

  verifierAbonnement(demande: DemandeAbonnement): string {
    return verifierAbonnementMeta(this.config.jetonVerification, demande);
  }

  async etatCompte(): Promise<EtatCompteFournisseur> {
    const entetes = { authorization: `Bearer ${this.config.jeton}` };
    const lire = async (chemin: string): Promise<unknown> => {
      let reponse: ReponseHttp;
      try {
        reponse = await this.transport.obtenir(this.url(chemin), entetes, this.config.delaiMs);
      } catch {
        throw new ErreurFournisseurTemporaire("reseau");
      }
      if (reponse.statut < 200 || reponse.statut >= 300) {
        throw new ErreurFournisseurTemporaire("fournisseur_indisponible");
      }
      return lireJson(reponse.corps);
    };

    const numero = await lire(
      `${this.config.numeroId}?fields=verified_name,code_verification_status,name_status,quality_rating,display_phone_number`,
    );
    const modeles = await lire(
      `${this.config.compteId}/message_templates?fields=name,language,status&limit=100`,
    );

    const n = estObjet(numero) ? numero : {};
    const texte = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
    const nomStatut = texte(n["name_status"]);
    const codeStatut = texte(n["code_verification_status"]);
    const qualite = texte(n["quality_rating"]);
    const liste = estObjet(modeles) && Array.isArray(modeles["data"]) ? modeles["data"] : [];
    const gabarits: GabaritDuCompte[] = [];
    for (const brut of liste as unknown[]) {
      if (!estObjet(brut) || typeof brut["name"] !== "string") continue;
      gabarits.push({
        nom: brut["name"],
        langue: texte(brut["language"]) ?? "fr",
        statut: GABARIT_STATUTS[String(brut["status"])] ?? "en_attente",
      });
    }
    return {
      verifie:
        nomStatut === null && codeStatut === null
          ? null
          : nomStatut === "APPROVED" && codeStatut === "VERIFIED",
      nomAffiche: texte(n["verified_name"]),
      numeroAffiche: texte(n["display_phone_number"]),
      qualite:
        qualite === "GREEN"
          ? "haute"
          : qualite === "YELLOW"
            ? "moyenne"
            : qualite === "RED"
              ? "basse"
              : "inconnue",
      gabarits,
    };
  }
}

function lireIdMessage(corps: string): string | null {
  const json = lireJson(corps);
  const messages = estObjet(json) ? json["messages"] : null;
  const premier = Array.isArray(messages) ? (messages[0] as unknown) : null;
  const id = estObjet(premier) ? premier["id"] : null;
  return typeof id === "string" && id !== "" && id.length <= 200 ? id : null;
}
