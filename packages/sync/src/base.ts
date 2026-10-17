import Dexie from "dexie";
import type { DexieOptions, Table } from "dexie";
import type { ConflitServeur, EvenementFile, VerificateurPin } from "./protocole";

/**
 * Base locale de l'appareil (IndexedDB via Dexie).
 *
 * - `file` : le journal d'événements en ajout seul. Une ligne n'est jamais supprimée avant que le
 *   serveur l'ait acquittée, et même alors elle reste (statut `acquitte`) jusqu'à `purger`.
 *   `ordre` est un compteur local croissant et sans trou : c'est l'ordre de rejeu.
 * - `meta` : petites valeurs (état du générateur de numéros, dernière synchronisation, verrou…).
 * - `conflits` : billets passés « à replacer » par le serveur, à montrer à l'agent.
 * - `verificateurs` : vérificateurs de PIN superviseur (déblocage sur place).
 */

export type StatutEntree = "en_attente" | "acquitte" | "rejete";

export interface EntreeFile {
  /** Rang local, croissant et sans trou (clé auto-incrémentée). */
  ordre: number;
  /** UUID de l'événement (clé d'idempotence côté serveur). */
  id: string;
  evenement: EvenementFile;
  /** Signature ECDSA ; `null` entre l'écriture et la signature (signée à l'envoi au plus tard). */
  signature: string | null;
  statut: StatutEntree;
  tentatives: number;
  /** Instant de création (ms depuis l'époque, horloge de l'appareil). */
  creeA: number;
  acquitteA: number | null;
  /** Réponse du serveur quand l'événement est acquitté. */
  resultat: "accepte" | "deja_recu" | null;
  erreur: { code: string; message: string } | null;
}

export interface LigneMeta {
  cle: string;
  valeur: unknown;
}

export interface ConflitLocal extends ConflitServeur {
  /** Heure à laquelle l'agent a vu l'alerte ; `null` tant qu'il ne l'a pas vue. */
  vuA: number | null;
}

export class BaseSync extends Dexie {
  file!: Table<EntreeFile, number>;
  meta!: Table<LigneMeta, string>;
  conflits!: Table<ConflitLocal, string>;
  verificateurs!: Table<VerificateurPin, string>;

  constructor(nom: string, options?: DexieOptions) {
    super(nom, options);
    this.version(1).stores({
      file: "++ordre, &id, statut, [statut+ordre]",
      meta: "cle",
      conflits: "evenementId",
      verificateurs: "superviseurId",
    });
  }
}

/** Clés de la table `meta`. */
export const META = {
  generateur: "generateur",
  plage: "plage",
  installeA: "installeA",
  derniereSyncA: "derniereSyncA",
  verrou: "verrou",
  debloqueJusqua: "debloqueJusqua",
  octroiAttendu: "octroiAttendu",
  partsHorsLigne: "partsHorsLigne",
  essaisPin: "essaisPin",
  cle: "cle",
} as const;

export async function lireMeta<T>(base: BaseSync, cle: string): Promise<T | undefined> {
  return (await base.meta.get(cle))?.valeur as T | undefined;
}

export async function ecrireMeta(base: BaseSync, cle: string, valeur: unknown): Promise<void> {
  await base.meta.put({ cle, valeur });
}
