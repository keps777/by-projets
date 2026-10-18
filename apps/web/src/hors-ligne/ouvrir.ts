import { agence, jetonDepuisStockage, type ClientApi } from "@afrimove/api-client";
import {
  ErreurTransport,
  MoteurSync,
  creerTransportHttp,
  type OptionsMoteur,
  type TransportSync,
} from "@afrimove/sync";
import { cacheStockageLocal, type CacheLectures } from "./cache";
import { creerClientHorsLigne } from "./client-hors-ligne";

/**
 * Ouvre le moteur hors ligne de cet appareil, d'après l'identité que l'installation a déposée dans le stockage local
 * (`afrimove.appareil` : appareil, personne, agence, gare, plage), et décore le client d'API.
 *
 * Sans appareil installé, ou sans IndexedDB (navigation privée de certains navigateurs), il n'y a pas de moteur :
 * l'application fonctionne comme avant, en ligne seulement. Rien ici ne bloque le démarrage : l'enrôlement de la clé
 * publique et la première prise de nouvelles se font en arrière-plan.
 */

export const CLE_ENROLEMENT = "afrimove.hors-ligne.enrole";
/** Prise de nouvelles du serveur tant que l'écran est ouvert : part de sièges à jour, indicateur SYNC / HORS LIGNE réel. */
export const INTERVALLE_SYNCHRO_MS = 30_000;

export interface OptionsOuvertureHorsLigne {
  /** Racine de l'API (la même que le client HTTP). */
  urlBase: string;
  /** Transport imposé (tests). */
  transport?: TransportSync;
  /** Surcharges du moteur (tests : horloge, réseau, IndexedDB factice). */
  moteur?: Partial<OptionsMoteur>;
  cache?: CacheLectures;
  /** 0 : pas de prise de nouvelles régulière (tests). */
  intervalleMs?: number;
}

export interface HorsLigne {
  client: ClientApi;
  moteur: MoteurSync;
  arreter(): Promise<void>;
}

type Stockage = Pick<Storage, "getItem" | "setItem">;

function stockageLocal(): Stockage | undefined {
  try {
    return (globalThis as { localStorage?: Stockage }).localStorage;
  } catch {
    return undefined;
  }
}

/** La clé publique de l'appareil est enregistrée une fois ; un refus « déjà enregistrée » (409) vaut enregistrement. */
async function enroler(moteur: MoteurSync, appareilId: string): Promise<void> {
  const stockage = stockageLocal();
  const cle = `${CLE_ENROLEMENT}.${appareilId}`;
  try {
    if (stockage?.getItem(cle) === "1") return;
  } catch {
    // stockage bloqué : on retentera
  }
  if (!jetonDepuisStockage()) return;
  try {
    await moteur.enroler();
  } catch (e) {
    if (!(e instanceof ErreurTransport && e.statut === 409)) return;
  }
  try {
    stockage?.setItem(cle, "1");
  } catch {
    // stockage bloqué : on retentera
  }
}

export async function ouvrirHorsLigne(
  base: ClientApi,
  options: OptionsOuvertureHorsLigne,
): Promise<HorsLigne | null> {
  if (base.mode !== "http") return null;
  const prov = agence.lireProvisionnement();
  if (!prov) return null;
  if (typeof indexedDB === "undefined" && !options.moteur?.dexie) return null;

  let moteur: MoteurSync;
  try {
    moteur = await MoteurSync.ouvrir({
      appareilId: prov.appareilId,
      auteurId: prov.auteurId,
      agence: prov.agence,
      gare: prov.gare,
      plage: prov.plage,
      transport:
        options.transport ??
        creerTransportHttp({
          urlBase: options.urlBase,
          obtenirJeton: () => jetonDepuisStockage(),
        }),
      ...options.moteur,
    });
  } catch {
    // IndexedDB refusée ou corrompue : l'application reste utilisable en ligne.
    return null;
  }

  const client = creerClientHorsLigne(base, {
    moteur,
    cache: options.cache ?? cacheStockageLocal(),
    identite: { compagnie: prov.agence, gare: prov.gare },
  });

  void enroler(moteur, prov.appareilId)
    .then(() => moteur.synchroniser())
    .catch(() => undefined);

  const intervalle = options.intervalleMs ?? INTERVALLE_SYNCHRO_MS;
  const minuterie =
    intervalle > 0
      ? setInterval(() => {
          const visible = typeof document === "undefined" || document.visibilityState !== "hidden";
          if (visible) void moteur.synchroniser().catch(() => undefined);
        }, intervalle)
      : null;

  return {
    client,
    moteur,
    async arreter() {
      if (minuterie) clearInterval(minuterie);
      await moteur.arreter();
    },
  };
}
