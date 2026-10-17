import {
  AgregateurPaiement,
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  lireCorpsNotifications,
  verifierSignature,
  type DemandeEncaissement,
  type DemandeRemboursementAgregateur,
  type EtatTransaction,
  type NotificationAgregateur,
  type RequeteNotification,
  type ReponseEncaissement,
  type ReponseRemboursement,
  type StatutTransaction,
} from "./agregateur";
import type { OperateurMobile } from "./modeles";

export interface RequeteHttp {
  methode: "GET" | "POST";
  url: string;
  corps: string | null;
  entetes: Readonly<Record<string, string>>;
  delaiMs: number;
}

export interface ReponseHttp {
  statut: number;
  corps: string;
}

/** Appel HTTP sortant, remplaçable dans les tests (aucun réseau). Lève en cas de réseau ou de délai. */
export abstract class TransportPaiement {
  abstract appeler(requete: RequeteHttp): Promise<ReponseHttp>;
}

/** Transport réel : `fetch` de Node, avec un délai maximal. */
export class TransportFetch extends TransportPaiement {
  async appeler(requete: RequeteHttp): Promise<ReponseHttp> {
    const reponse = await fetch(requete.url, {
      method: requete.methode,
      headers: { "content-type": "application/json", ...requete.entetes },
      ...(requete.corps !== null ? { body: requete.corps } : {}),
      signal: AbortSignal.timeout(requete.delaiMs),
    });
    return { statut: reponse.status, corps: await reponse.text() };
  }
}

export interface ConfigAgregateurHttp {
  nom: string;
  /** Racine de l'API de l'agrégateur, en https. */
  urlApi: string;
  cleApi: string;
  secretWebhook: string;
  delaiMs: number;
}

const ETATS: readonly EtatTransaction[] = ["en_attente", "reussi", "echoue"];

function lireJson(corps: string): Record<string, unknown> | null {
  try {
    const json: unknown = JSON.parse(corps);
    return json !== null && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const texte = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v !== "" && v.length <= max ? v : null;

const etatDe = (v: unknown): EtatTransaction | null =>
  typeof v === "string" && (ETATS as readonly string[]).includes(v) ? (v as EtatTransaction) : null;

const operateurDe = (v: unknown): OperateurMobile | null =>
  v === "mtn" || v === "orange" ? v : null;

/**
 * Client d'un agrégateur de paiement par API JSON. **Le format est générique** : il sera ajusté à
 * l'agrégateur retenu (tâche « compte et accès sandbox »), seuls ce fichier et
 * `lireCorpsNotifications` changent. Contrat supposé, en-têtes `Authorization: Bearer <clé>` et
 * `Idempotency-Key: <référence>` :
 *
 *  - `POST {urlApi}/encaissements` avec `{ reference, moyen, montant, devise?, telephone?,
 *    jetonCarte?, libelle, repartition: [{ beneficiaire, compte, montant }] }`, réponse 200/201/202
 *    `{ id, etat, urlAuthentification?, referenceOperateur?, operateur?, code? }` ;
 *  - `GET {urlApi}/encaissements/{reference}` : `{ id, etat, montant?, referenceOperateur?,
 *    operateur?, code?, at? }`, 404 si inconnue ;
 *  - `POST {urlApi}/remboursements` avec `{ reference, encaissement, montant, lignes }` ;
 *  - `GET {urlApi}/taux/{devise}` : `{ taux }` en FCFA pour 1 unité ;
 *  - 400/422 : refusé pour de bon ; 401/402/403 : accès ou crédit (à corriger côté compte) ;
 *    408/425/429/5xx, réseau, délai : à réessayer.
 *
 * Aucune réponse de l'agrégateur n'est recopiée dans les erreurs, et ni le jeton de carte ni le
 * numéro de téléphone ne sont journalisés.
 */
export class AgregateurHttp extends AgregateurPaiement {
  readonly nom: string;
  readonly reel = true;

  constructor(
    private readonly config: ConfigAgregateurHttp,
    private readonly transport: TransportPaiement,
  ) {
    super();
    this.nom = config.nom;
  }

  private async appeler(
    methode: "GET" | "POST",
    chemin: string,
    corps: unknown,
    cleIdempotence?: string,
  ): Promise<ReponseHttp> {
    try {
      return await this.transport.appeler({
        methode,
        url: `${this.config.urlApi.replace(/\/+$/, "")}${chemin}`,
        corps: corps === null ? null : JSON.stringify(corps),
        entetes: {
          authorization: `Bearer ${this.config.cleApi}`,
          ...(cleIdempotence ? { "idempotency-key": cleIdempotence } : {}),
        },
        delaiMs: this.config.delaiMs,
      });
    } catch (e) {
      const delai = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ErreurAgregateurTemporaire(delai ? "delai_depasse" : "reseau");
    }
  }

  private erreurDeStatut(statut: number): Error {
    if (statut === 400 || statut === 422) return new ErreurAgregateurDefinitive("refuse");
    if (statut === 401 || statut === 403) return new ErreurAgregateurTemporaire("acces_refuse");
    if (statut === 402) return new ErreurAgregateurTemporaire("credit_insuffisant");
    if (statut === 429) return new ErreurAgregateurTemporaire("limite_debit");
    return new ErreurAgregateurTemporaire(
      statut >= 500 || statut === 408 || statut === 425
        ? "agregateur_indisponible"
        : "reponse_inattendue",
    );
  }

  async initier(demande: DemandeEncaissement): Promise<ReponseEncaissement> {
    const reponse = await this.appeler(
      "POST",
      "/encaissements",
      {
        reference: demande.reference,
        moyen: demande.moyen,
        montant: demande.montantFcfa,
        ...(demande.devise
          ? { devise: { code: demande.devise.code, montant: demande.devise.montantMineur } }
          : {}),
        ...(demande.telephone ? { telephone: demande.telephone } : {}),
        ...(demande.jetonCarte ? { jetonCarte: demande.jetonCarte } : {}),
        libelle: demande.libelle,
        repartition: demande.repartition.map((l) => ({
          beneficiaire: l.beneficiaire,
          compte: l.compteId,
          montant: l.montantFcfa,
        })),
      },
      demande.reference,
    );
    if (![200, 201, 202].includes(reponse.statut)) throw this.erreurDeStatut(reponse.statut);
    const json = lireJson(reponse.corps);
    const id = texte(json?.["id"], 100);
    const etat = etatDe(json?.["etat"]);
    if (!json || id === null || etat === null) {
      throw new ErreurAgregateurTemporaire("reponse_illisible");
    }
    const url = texte(json["urlAuthentification"], 2000);
    return {
      idFournisseur: id,
      etat,
      urlAuthentification: url !== null && url.startsWith("https://") ? url : null,
      referenceOperateur: texte(json["referenceOperateur"], 80),
      operateur: operateurDe(json["operateur"]),
      code: texte(json["code"], 40),
    };
  }

  async consulter(reference: string): Promise<StatutTransaction | null> {
    const reponse = await this.appeler(
      "GET",
      `/encaissements/${encodeURIComponent(reference)}`,
      null,
    );
    if (reponse.statut === 404) return null;
    if (reponse.statut !== 200) throw this.erreurDeStatut(reponse.statut);
    const json = lireJson(reponse.corps);
    const id = texte(json?.["id"], 100);
    const etat = etatDe(json?.["etat"]);
    if (!json || id === null || etat === null) {
      throw new ErreurAgregateurTemporaire("reponse_illisible");
    }
    const at = typeof json["at"] === "string" ? new Date(json["at"]) : new Date();
    return {
      idFournisseur: id,
      etat,
      montantFcfa: Number.isInteger(json["montant"]) ? (json["montant"] as number) : null,
      referenceOperateur: texte(json["referenceOperateur"], 80),
      operateur: operateurDe(json["operateur"]),
      code: texte(json["code"], 40),
      at: Number.isFinite(at.getTime()) ? at : new Date(),
    };
  }

  async rembourser(demande: DemandeRemboursementAgregateur): Promise<ReponseRemboursement> {
    const reponse = await this.appeler(
      "POST",
      "/remboursements",
      {
        reference: demande.reference,
        encaissement: demande.idFournisseurPaiement,
        montant: demande.montantFcfa,
        lignes: demande.lignes.map((l) => ({
          beneficiaire: l.beneficiaire,
          montant: l.montantFcfa,
        })),
      },
      demande.reference,
    );
    if (![200, 201, 202].includes(reponse.statut)) throw this.erreurDeStatut(reponse.statut);
    const json = lireJson(reponse.corps);
    const id = texte(json?.["id"], 100);
    const etat = etatDe(json?.["etat"]);
    if (!json || id === null || etat === null) {
      throw new ErreurAgregateurTemporaire("reponse_illisible");
    }
    return {
      idFournisseur: id,
      etat,
      referenceOperateur: texte(json["referenceOperateur"], 80),
      code: texte(json["code"], 40),
    };
  }

  async tauxMillieme(devise: string): Promise<number | null> {
    if (!/^[A-Z]{3}$/.test(devise)) return null;
    const reponse = await this.appeler("GET", `/taux/${devise}`, null);
    if (reponse.statut === 404) return null;
    if (reponse.statut !== 200) throw this.erreurDeStatut(reponse.statut);
    const taux = lireJson(reponse.corps)?.["taux"];
    if (typeof taux !== "number" || !Number.isFinite(taux) || taux <= 0) {
      throw new ErreurAgregateurTemporaire("reponse_illisible");
    }
    return Math.round(taux * 1000);
  }

  lireNotifications(requete: RequeteNotification): NotificationAgregateur[] {
    return lireCorpsNotifications(verifierSignature(this.config.secretWebhook, requete));
  }
}
