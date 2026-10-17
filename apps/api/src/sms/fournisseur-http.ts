import {
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  FournisseurSms,
  lireCorpsRecus,
  verifierSignatureRecu,
  type DemandeFournisseur,
  type ReponseFournisseur,
  type RecuLivraison,
  type RequeteRecu,
} from "./fournisseur";

export interface ReponseHttp {
  statut: number;
  corps: string;
}

/** Appel HTTP sortant, remplaçable dans les tests (aucun réseau). Lève en cas de réseau ou de délai. */
export abstract class TransportHttp {
  abstract poster(
    url: string,
    corps: string,
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
}

export interface ConfigFournisseurHttp {
  nom: string;
  /** Racine de l'API de l'agrégateur, en https. */
  urlApi: string;
  cleApi: string;
  secretWebhook: string;
  /** Délai maximal d'un appel d'envoi. */
  delaiMs: number;
}

/**
 * Client d'un agrégateur SMS par API JSON. **Le format est générique** : il sera ajusté à
 * l'agrégateur retenu (tâche « compte et accès sandbox »), seuls ce fichier et `lireCorpsRecus`
 * changent. Contrat supposé :
 *
 *  - `POST {urlApi}/messages` avec `{ from, to, text, reference }`, en-têtes
 *    `Authorization: Bearer <clé>` et `Idempotency-Key: <reference>` ;
 *  - 200/201/202 avec `{ "id": "<identifiant fournisseur>" }` ;
 *  - 400/422 : message refusé pour de bon ; 401/402/403 : accès ou crédit (à corriger côté compte) ;
 *    408/425/429/5xx, réseau, délai : à réessayer.
 *
 * Aucune réponse du fournisseur n'est recopiée dans les erreurs : elle pourrait citer le message.
 */
export class FournisseurHttp extends FournisseurSms {
  readonly nom: string;
  readonly reel = true;

  constructor(
    private readonly config: ConfigFournisseurHttp,
    private readonly transport: TransportHttp,
  ) {
    super();
    this.nom = config.nom;
  }

  async envoyer(demande: DemandeFournisseur): Promise<ReponseFournisseur> {
    let reponse: ReponseHttp;
    try {
      reponse = await this.transport.poster(
        `${this.config.urlApi.replace(/\/+$/, "")}/messages`,
        JSON.stringify({
          from: demande.expediteur,
          to: demande.destinataire,
          text: demande.texte,
          reference: demande.reference,
        }),
        {
          authorization: `Bearer ${this.config.cleApi}`,
          "idempotency-key": demande.reference,
        },
        this.config.delaiMs,
      );
    } catch (e) {
      const delai = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ErreurFournisseurTemporaire(delai ? "delai_depasse" : "reseau");
    }

    const { statut } = reponse;
    if (statut === 200 || statut === 201 || statut === 202) {
      const id = lireId(reponse.corps);
      if (id === null) throw new ErreurFournisseurTemporaire("reponse_illisible");
      return { idFournisseur: id };
    }
    if (statut === 400 || statut === 422) throw new ErreurFournisseurDefinitive("refuse");
    if (statut === 401 || statut === 403) throw new ErreurFournisseurTemporaire("acces_refuse");
    if (statut === 402) throw new ErreurFournisseurTemporaire("credit_insuffisant");
    if (statut === 429) throw new ErreurFournisseurTemporaire("limite_debit");
    throw new ErreurFournisseurTemporaire(
      statut >= 500 || statut === 408 || statut === 425
        ? "fournisseur_indisponible"
        : "reponse_inattendue",
    );
  }

  lireRecus(requete: RequeteRecu): RecuLivraison[] {
    return lireCorpsRecus(verifierSignatureRecu(this.config.secretWebhook, requete));
  }
}

function lireId(corps: string): string | null {
  try {
    const id = (JSON.parse(corps) as { id?: unknown } | null)?.id;
    return typeof id === "string" && id !== "" && id.length <= 100 ? id : null;
  } catch {
    return null;
  }
}
