import type { EtapeEffacement, RapportEffacement } from "./canal";

/**
 * Effacement des données de l'application sur l'appareil : stockage local, base hors ligne (IndexedDB,
 * donc le journal d'événements non synchronisés et la clé de signature de l'appareil), caches du service
 * worker, service worker lui-même, cookies lisibles par le script.
 *
 * Ce n'est PAS l'effacement de l'appareil : le retour aux réglages d'usine se commande par la gestion des
 * appareils Android Enterprise (README). Celui-ci est la première ligne : il agit en quelques secondes
 * dès que l'application est ouverte et en ligne, et il ne dépend d'aucun service tiers.
 *
 * Toutes les étapes sont tentées même si une échoue ; rien ne lève : le rapport dit ce qui est parti.
 */

interface BaseIdb {
  name?: string | undefined;
}

export interface EnvEffacement {
  localStorage?: Pick<Storage, "clear"> | undefined;
  sessionStorage?: Pick<Storage, "clear"> | undefined;
  indexedDB?:
    | {
        databases?: () => Promise<BaseIdb[]>;
        deleteDatabase: (nom: string) => {
          onsuccess: ((e: unknown) => void) | null;
          onerror: ((e: unknown) => void) | null;
          onblocked: ((e: unknown) => void) | null;
          error?: unknown;
        };
      }
    | undefined;
  caches?:
    | {
        keys: () => Promise<string[]>;
        delete: (cle: string) => Promise<boolean>;
      }
    | undefined;
  serviceWorker?:
    | { getRegistrations: () => Promise<readonly { unregister: () => Promise<boolean> }[]> }
    | undefined;
  /** Document dont on vide les cookies. */
  document?: { cookie: string } | undefined;
  maintenant?: () => Date;
  /** Durée maximale d'attente de la suppression d'une base IndexedDB (une connexion ouverte la retarde). */
  delaiBaseMs?: number;
}

export function envNavigateur(): EnvEffacement {
  const g = globalThis as Record<string, unknown>;
  const lire = <T>(nom: string): T | undefined => {
    try {
      return g[nom] as T | undefined;
    } catch {
      return undefined; // l'accès lui-même peut lever (stockage bloqué)
    }
  };
  return {
    localStorage: lire<Storage>("localStorage"),
    sessionStorage: lire<Storage>("sessionStorage"),
    indexedDB: lire<NonNullable<EnvEffacement["indexedDB"]>>("indexedDB"),
    caches: lire<NonNullable<EnvEffacement["caches"]>>("caches"),
    serviceWorker: lire<Navigator>("navigator")?.serviceWorker,
    document: lire<Document>("document"),
  };
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

async function supprimerBase(
  idb: NonNullable<EnvEffacement["indexedDB"]>,
  nom: string,
  delaiMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error(`suppression de ${nom} bloquée`)), delaiMs);
    const requete = idb.deleteDatabase(nom);
    requete.onsuccess = () => {
      clearTimeout(minuteur);
      resolve();
    };
    requete.onerror = () => {
      clearTimeout(minuteur);
      reject(new Error(message(requete.error ?? `suppression de ${nom} refusée`)));
    };
    // `onblocked` : une connexion ouverte doit se fermer (Dexie le fait sur `versionchange`). On attend
    // alors le succès jusqu'au délai ; passé ce délai, l'étape est comptée en échec.
  });
}

async function etapeIndexedDb(env: EnvEffacement): Promise<string | undefined> {
  const idb = env.indexedDB;
  if (!idb) return undefined;
  if (!idb.databases) return "liste des bases indisponible sur ce navigateur";
  const bases = await idb.databases();
  const echecs: string[] = [];
  for (const base of bases) {
    if (!base.name) continue;
    try {
      await supprimerBase(idb, base.name, env.delaiBaseMs ?? 5000);
    } catch (e) {
      echecs.push(message(e));
    }
  }
  if (echecs.length > 0) throw new Error(echecs.join(" ; "));
  return undefined;
}

async function etapeCookies(env: EnvEffacement): Promise<void> {
  const doc = env.document;
  if (!doc) return;
  for (const cookie of doc.cookie.split(";")) {
    const nom = cookie.split("=")[0]?.trim();
    if (nom) doc.cookie = `${nom}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

export async function effacerDonneesLocales(
  env: EnvEffacement = envNavigateur(),
): Promise<RapportEffacement> {
  const etapes: RapportEffacement["etapes"] = [];

  async function tenter(
    nom: EtapeEffacement,
    action: () => Promise<string | void> | string | void,
  ) {
    try {
      const detail = await action();
      etapes.push(detail ? { nom, ok: false, detail } : { nom, ok: true });
    } catch (e) {
      etapes.push({ nom, ok: false, detail: message(e) });
    }
  }

  await tenter("localStorage", () => env.localStorage?.clear());
  await tenter("sessionStorage", () => env.sessionStorage?.clear());
  await tenter("indexedDB", () => etapeIndexedDb(env));
  await tenter("caches", async () => {
    if (!env.caches) return;
    for (const cle of await env.caches.keys()) await env.caches.delete(cle);
  });
  await tenter("serviceWorkers", async () => {
    if (!env.serviceWorker) return;
    for (const inscription of await env.serviceWorker.getRegistrations()) {
      await inscription.unregister();
    }
  });
  await tenter("cookies", () => etapeCookies(env));

  return {
    effaceA: (env.maintenant?.() ?? new Date()).toISOString(),
    complet: etapes.every((e) => e.ok),
    etapes,
  };
}
