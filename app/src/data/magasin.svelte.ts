// Le magasin : toutes les lignes en mémoire (réactives) + écriture locale + file d'envoi. Une seule source pour les écrans.
import { TABLES, type LignesParTable, type NomTable } from '@core/lignes.ts';
import { BaseLocale, nomBase } from './db.ts';

type Tout = { [K in NomTable]: LignesParTable[K][] };
export type Brouillon<K extends NomTable> = Partial<Omit<LignesParTable[K], 'id'>> & { id: string };

const vide = (): Tout => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tout;

class Magasin {
  pret = $state(false);
  userId = $state<string | null>(null);
  /** Remplacé à chaque modification : les écrans qui lisent `lignes` se recalculent. */
  lignes = $state.raw<Tout>(vide());
  enAttente = $state(0);

  db: BaseLocale | null = null;
  #file: Promise<unknown> = Promise.resolve();
  #auChangement = new Set<() => void>();

  /** Ouvre la base de cet utilisateur et charge ses lignes en mémoire. */
  async ouvrir(userId: string): Promise<void> {
    if (this.db) this.db.close();
    this.db = new BaseLocale(nomBase(userId));
    const tout = vide();
    for (const t of TABLES) {
      const rows = await this.db.lignes(t).toArray();
      (tout[t] as unknown[]) = rows.filter((r) => !r.supprime_le);
    }
    this.userId = userId;
    this.lignes = tout;
    this.enAttente = await this.db.sortie.count();
    this.pret = true;
  }

  async fermer(): Promise<void> {
    await this.#file;
    this.db?.close();
    this.db = null;
    this.pret = false;
    this.userId = null;
    this.lignes = vide();
    this.enAttente = 0;
  }

  surChangement(fn: () => void): () => void { this.#auChangement.add(fn); return () => this.#auChangement.delete(fn); }

  trouver<K extends NomTable>(t: K, id: string | null | undefined): LignesParTable[K] | undefined {
    return id ? (this.lignes[t] as LignesParTable[K][]).find((l) => l.id === id) : undefined;
  }

  /** Crée ou modifie une ligne. La mémoire change tout de suite ; IndexedDB et la file suivent. */
  ecrire<K extends NomTable>(t: K, b: Brouillon<K>): LignesParTable[K] { return this.ecrireLot([[t, b]])[0] as LignesParTable[K]; }

  ecrireLot(ops: { [K in NomTable]: [K, Brouillon<K>] }[NomTable][]): unknown[] {
    if (!this.userId) throw new Error('Aucun utilisateur ouvert');
    const maintenant = new Date().toISOString();
    const copie: Tout = { ...this.lignes };
    const finales: { t: NomTable; ligne: LignesParTable[NomTable] }[] = [];
    for (const [t, b] of ops) {
      const liste = [...(copie[t] as LignesParTable[NomTable][])];
      const i = liste.findIndex((l) => l.id === b.id);
      const ancien = i >= 0 ? liste[i] : undefined;
      const ligne = { ...ancien, ...b, user_id: this.userId, created_at: ancien?.created_at ?? maintenant, updated_at: maintenant, supprime_le: b.supprime_le ?? null } as LignesParTable[NomTable];
      if (i >= 0) liste[i] = ligne; else liste.push(ligne);
      (copie[t] as unknown[]) = liste;
      finales.push({ t, ligne });
    }
    this.lignes = copie;
    this.#persister(finales);
    return finales.map((f) => f.ligne);
  }

  /** Suppression : la ligne disparaît de l'écran et une « pierre tombale » part au serveur. */
  supprimer(t: NomTable, ids: string | string[]): void {
    const liste = Array.isArray(ids) ? ids : [ids];
    const maintenant = new Date().toISOString();
    const copie: Tout = { ...this.lignes };
    const tombes: { t: NomTable; ligne: LignesParTable[NomTable] }[] = [];
    const restantes = (copie[t] as LignesParTable[NomTable][]).filter((l) => {
      if (!liste.includes(l.id)) return true;
      tombes.push({ t, ligne: { ...l, supprime_le: maintenant, updated_at: maintenant } });
      return false;
    });
    (copie[t] as unknown[]) = restantes;
    this.lignes = copie;
    this.#persister(tombes);
  }

  #persister(items: { t: NomTable; ligne: LignesParTable[NomTable] }[]): void {
    const db = this.db;
    if (!db) return;
    this.#file = this.#file.then(async () => {
      await db.transaction('rw', [...TABLES.map((t) => db.lignes(t)), db.sortie], async () => {
        for (const { t, ligne } of items) {
          await db.lignes(t).put(ligne as never);
          await db.sortie.put({ cle: `${t}:${ligne.id}`, table: t, id: ligne.id, at: Date.now() });
        }
      });
      this.enAttente = await db.sortie.count();
      for (const fn of this.#auChangement) fn();
    }).catch((e) => console.error('Écriture locale impossible', e));
  }

  /** Attend que toutes les écritures locales soient terminées (tests, fermeture). */
  async terminerEcritures(): Promise<void> { await this.#file; }

  /** Applique des lignes venues du serveur (synchronisation). Les lignes avec une écriture locale en attente sont gardées. */
  async appliquerDuServeur(t: NomTable, rows: LignesParTable[NomTable][]): Promise<void> {
    const db = this.db;
    if (!db || !rows.length) return;
    const enAttente = new Set((await db.sortie.where('table').equals(t).toArray()).map((s) => s.id));
    const aprendre = rows.filter((r) => !enAttente.has(r.id));
    if (!aprendre.length) return;
    await db.lignes(t).bulkPut(aprendre as never[]);
    const copie: Tout = { ...this.lignes };
    const par = new Map((copie[t] as LignesParTable[NomTable][]).map((l) => [l.id, l]));
    for (const r of aprendre) { if (r.supprime_le) par.delete(r.id); else par.set(r.id, r); }
    (copie[t] as unknown[]) = [...par.values()];
    this.lignes = copie;
    for (const fn of this.#auChangement) fn();
  }
}

export const magasin = new Magasin();
