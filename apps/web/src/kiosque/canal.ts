/**
 * Canal des ordres envoyés à l'appareil par le serveur (AM-172). Aujourd'hui un seul ordre existe :
 * « effacer » (effacement à distance des données de l'application). Le serveur correspondant n'existe
 * pas encore : les routes de `creerCanalHttp` sont celles que le serveur devra offrir (voir README),
 * elles ne figurent pas dans `@afrimove/contrats`.
 */

export interface CommandeAppareil {
  /** Identifiant de l'ordre, unique. */
  id: string;
  type: "effacer";
  /** Heure d'émission de l'ordre (ISO 8601). */
  emiseA: string;
  /**
   * Secret à usage unique, donné avec l'ordre : il authentifie l'accusé de réception. Après l'effacement
   * l'appareil n'a plus ni session ni clé, c'est donc la seule preuve qu'il puisse présenter.
   */
  secretAcquittement: string;
}

export type EtapeEffacement =
  | "localStorage"
  | "sessionStorage"
  | "indexedDB"
  | "caches"
  | "serviceWorkers"
  | "cookies";

export interface RapportEffacement {
  /** Heure de fin de l'effacement (ISO 8601). */
  effaceA: string;
  /** Vrai si toutes les étapes ont réussi. */
  complet: boolean;
  etapes: { nom: EtapeEffacement; ok: boolean; detail?: string }[];
}

export interface CanalCommandes {
  /** Le prochain ordre en attente pour cet appareil, ou `null`. Lève une erreur si le serveur est injoignable. */
  prochaineCommande(appareilId: string): Promise<CommandeAppareil | null>;
  /** Dit au serveur que l'ordre a été exécuté. Idempotent : un second accusé pour le même ordre est accepté. */
  acquitter(
    appareilId: string,
    commande: CommandeAppareil,
    rapport: RapportEffacement,
  ): Promise<void>;
}

/** Valide un ordre reçu du serveur : on n'exécute jamais un ordre mal formé ou d'un type inconnu. */
export function lireCommande(valeur: unknown): CommandeAppareil | null {
  if (typeof valeur !== "object" || valeur === null) return null;
  const { id, type, emiseA, secretAcquittement } = valeur as Record<string, unknown>;
  if (type !== "effacer") return null;
  if (typeof id !== "string" || id === "") return null;
  if (typeof emiseA !== "string" || Number.isNaN(Date.parse(emiseA))) return null;
  if (typeof secretAcquittement !== "string" || secretAcquittement === "") return null;
  return { id, type, emiseA, secretAcquittement };
}

export interface OptionsCanalHttp {
  /** Racine de l'API, par exemple `/api`. */
  urlBase: string;
  /** En-têtes d'authentification de l'appareil pour la consultation des ordres. */
  entetes?: () => Record<string, string>;
  fetch?: typeof fetch;
}

/**
 * Adaptateur HTTP.
 *
 * - `GET  {urlBase}/appareils/{id}/commande` : 200 `{ commande: {…} | null }`, ou 204 : rien en attente.
 * - `POST {urlBase}/appareils/{id}/commandes/{commandeId}/acquittement`, `Authorization: Bearer <secret>`,
 *   corps = le rapport d'effacement. 200/204 : enregistré ; 409/410 : déjà enregistré (accepté).
 */
export function creerCanalHttp(options: OptionsCanalHttp): CanalCommandes {
  const appeler = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = options.urlBase.replace(/\/+$/, "");

  return {
    async prochaineCommande(appareilId) {
      const reponse = await appeler(
        `${base}/appareils/${encodeURIComponent(appareilId)}/commande`,
        {
          headers: { Accept: "application/json", ...options.entetes?.() },
          cache: "no-store",
        },
      );
      if (reponse.status === 204 || reponse.status === 404) return null;
      if (!reponse.ok) throw new Error(`Consultation des ordres : HTTP ${reponse.status}`);
      const corps: unknown = await reponse.json();
      if (typeof corps !== "object" || corps === null) return null;
      return lireCommande((corps as { commande?: unknown }).commande);
    },

    async acquitter(appareilId, commande, rapport) {
      const reponse = await appeler(
        `${base}/appareils/${encodeURIComponent(appareilId)}/commandes/${encodeURIComponent(commande.id)}/acquittement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${commande.secretAcquittement}`,
          },
          body: JSON.stringify(rapport),
        },
      );
      if (reponse.ok || reponse.status === 409 || reponse.status === 410) return;
      throw new Error(`Accusé d'effacement : HTTP ${reponse.status}`);
    },
  };
}

/** Canal en mémoire pour les tests et le développement : le « serveur » est un tableau. */
export class CanalMemoire implements CanalCommandes {
  readonly enAttente: CommandeAppareil[] = [];
  readonly acquittements: { appareilId: string; commandeId: string; rapport: RapportEffacement }[] =
    [];
  /** Nombre de consultations faites. */
  consultations = 0;
  /** Quand c'est vrai, le serveur est injoignable (consultation et accusé échouent). */
  horsLigne = false;

  emettre(commande: CommandeAppareil): void {
    this.enAttente.push(commande);
  }

  async prochaineCommande(): Promise<CommandeAppareil | null> {
    this.consultations += 1;
    if (this.horsLigne) throw new Error("serveur injoignable");
    return this.enAttente[0] ?? null;
  }

  async acquitter(
    appareilId: string,
    commande: CommandeAppareil,
    rapport: RapportEffacement,
  ): Promise<void> {
    if (this.horsLigne) throw new Error("serveur injoignable");
    this.acquittements.push({ appareilId, commandeId: commande.id, rapport });
    const rang = this.enAttente.findIndex((c) => c.id === commande.id);
    if (rang >= 0) this.enAttente.splice(rang, 1);
  }
}
