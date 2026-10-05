// Synchronisation : on envoie d'abord les écritures locales (parents avant enfants), puis on récupère ce qui a changé.
import { TABLES, type NomTable } from '@core/lignes.ts';
import { magasin } from './magasin.svelte.ts';
import { supabase } from './supabase.ts';
import { modeServeur } from './config.ts';

const LOT = 200;
const PAGE = 500;
/**
 * Le serveur date chaque ligne au DÉBUT de sa transaction (now()) : une transaction lente peut donc rendre visible,
 * après coup, une ligne plus ancienne que le curseur. On relit toujours cette marge pour ne jamais la manquer.
 */
export const MARGE_TIRAGE_MS = 5 * 60_000;
const ID_NUL = '00000000-0000-0000-0000-000000000000';

interface Curseur { ts: string; id: string }
/** Erreur réseau (aucune réponse) : tout réessayer plus tard. Sinon le serveur a refusé des lignes précises. */
const estReseau = (e: { code?: string; message?: string }) => !e.code || /fetch|network|load failed/i.test(e.message ?? '');

class Synchro {
  etat = $state<'local' | 'synchronise' | 'en_attente' | 'hors_ligne' | 'erreur'>(modeServeur ? 'synchronise' : 'local');
  derniere = $state<string | null>(null);
  message = $state<string | null>(null);
  #enCours: Promise<void> | null = null;
  #retard: ReturnType<typeof setTimeout> | null = null;
  #demarre = false;
  #apres: (() => void)[] = [];

  /** Lance `fn` après la prochaine synchronisation réussie (tout de suite en mode local). */
  apresSynchro(fn: () => void): void {
    if (!modeServeur) { fn(); return; }
    this.#apres.push(fn);
  }

  demarrer(): void {
    if (!modeServeur || typeof window === 'undefined' || this.#demarre) return;
    this.#demarre = true;
    magasin.surChangement(() => this.programmer());
    window.addEventListener('online', () => void this.synchroniser());
    window.addEventListener('offline', () => { this.etat = 'hors_ligne'; });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.synchroniser(); });
    setInterval(() => { if (document.visibilityState === 'visible') void this.synchroniser(); }, 60_000);
    void this.synchroniser();
  }

  programmer(): void {
    if (!modeServeur) return;
    if (this.#retard) clearTimeout(this.#retard);
    this.#retard = setTimeout(() => void this.synchroniser(), 1500);
  }

  synchroniser(): Promise<void> {
    if (!modeServeur || !magasin.pret) return Promise.resolve();
    this.#enCours ??= this.#faire().finally(() => { this.#enCours = null; });
    return this.#enCours;
  }

  async #faire(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.etat = 'hors_ligne'; return; }
    try {
      const refus = await this.pousser();
      await this.tirer();
      this.etat = refus.length ? 'erreur' : magasin.enAttente > 0 ? 'en_attente' : 'synchronise';
      this.derniere = new Date().toISOString();
      this.message = refus.length ? `${refus.length} modification(s) refusée(s) par le serveur : ${refus[0]}` : null;
      const apres = this.#apres.splice(0);
      for (const fn of apres) fn();
    } catch (e) {
      this.etat = navigator.onLine ? 'erreur' : 'hors_ligne';
      this.message = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Envoie les lignes modifiées localement, les parents avant les enfants. Si le serveur refuse un lot, on renvoie ses
   * lignes une par une : une ligne refusée reste dans la file (rien n'est perdu) sans bloquer toutes les autres.
   * Rend les refus (« table id : message »).
   */
  async pousser(): Promise<string[]> {
    const sb = supabase(), db = magasin.db;
    const refus: string[] = [];
    if (!sb || !db) return refus;
    const sorties = await db.sortie.toArray();
    for (const t of TABLES) {
      const dues = sorties.filter((s) => s.table === t);
      for (let i = 0; i < dues.length; i += LOT) {
        const lot = dues.slice(i, i + LOT);
        const rows = (await db.lignes(t).bulkGet(lot.map((s) => s.id))).filter(Boolean) as { id: string; updated_at: string }[];
        if (!rows.length) { await db.sortie.bulkDelete(lot.map((s) => s.cle)); continue; }
        const envoyer = async (l: typeof rows) => {
          const { data, error } = await sb.from(t).upsert(l as never[], { onConflict: 'id' }).select('id, updated_at');
          if (error && estReseau(error)) throw new Error(`${t} : ${error.message}`);
          return error ? { error } : { data: (data ?? []) as { id: string; updated_at: string }[] };
        };
        let r = await envoyer(rows);
        let acceptees: { id: string; updated_at: string }[] = r.data ?? [];
        if (r.error) {
          acceptees = [];
          for (const ligne of rows) {
            r = await envoyer([ligne]);
            if (r.error) refus.push(`${t} ${ligne.id} : ${r.error.message}`); else acceptees.push(...(r.data ?? []));
          }
        }
        const maj = new Map(acceptees.map((d) => [d.id, d.updated_at]));
        const presentes = new Set(rows.map((x) => x.id));
        await db.transaction('rw', db.lignes(t), db.sortie, async () => {
          for (const [id, u] of maj) await db.lignes(t).update(id, { updated_at: u } as never);
          // On ne retire que les entrées acceptées et inchangées depuis la lecture : une écriture plus récente reste en file.
          for (const s of lot) { const cur = await db.sortie.get(s.cle); if (cur && cur.at === s.at && (maj.has(s.id) || !presentes.has(s.id))) await db.sortie.delete(s.cle); }
        });
      }
    }
    magasin.enAttente = await db.sortie.count();
    return refus;
  }

  /** Récupère les changements du serveur, page par page (curseur updated_at + id), en relisant une marge de temps. */
  async tirer(): Promise<void> {
    const sb = supabase(), db = magasin.db;
    if (!sb || !db) return;
    for (const t of TABLES) {
      const sauve = (await db.meta.get(`curseur:${t}`))?.valeur as Curseur | undefined;
      let curseur: Curseur = sauve ? { ts: new Date(Date.parse(sauve.ts) - MARGE_TIRAGE_MS).toISOString(), id: ID_NUL } : { ts: '1970-01-01T00:00:00Z', id: ID_NUL };
      for (;;) {
        const { data, error } = await sb.from(t).select('*')
          .or(`updated_at.gt.${curseur.ts},and(updated_at.eq.${curseur.ts},id.gt.${curseur.id})`)
          .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE);
        if (error) throw new Error(`${t} : ${error.message}`);
        if (!data?.length) break;
        await magasin.appliquerDuServeur(t as NomTable, data as never[]);
        const dernier = data[data.length - 1] as { updated_at: string; id: string };
        curseur = { ts: dernier.updated_at, id: dernier.id };
        if (!sauve || Date.parse(curseur.ts) >= Date.parse(sauve.ts)) await db.meta.put({ cle: `curseur:${t}`, valeur: curseur });
        if (data.length < PAGE) break;
      }
    }
  }
}

export const synchro = new Synchro();
