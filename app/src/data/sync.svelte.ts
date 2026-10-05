// Synchronisation : on envoie d'abord les écritures locales (parents avant enfants), puis on récupère ce qui a changé.
import { TABLES, type NomTable } from '@core/lignes.ts';
import { magasin } from './magasin.svelte.ts';
import { supabase } from './supabase.ts';
import { modeServeur } from './config.ts';

const LOT = 200;
const PAGE = 500;

interface Curseur { ts: string; id: string }

class Synchro {
  etat = $state<'local' | 'synchronise' | 'en_attente' | 'hors_ligne' | 'erreur'>(modeServeur ? 'synchronise' : 'local');
  derniere = $state<string | null>(null);
  message = $state<string | null>(null);
  #enCours: Promise<void> | null = null;
  #retard: ReturnType<typeof setTimeout> | null = null;

  demarrer(): void {
    if (!modeServeur || typeof window === 'undefined') return;
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
      await this.pousser();
      await this.tirer();
      this.etat = magasin.enAttente > 0 ? 'en_attente' : 'synchronise';
      this.derniere = new Date().toISOString();
      this.message = null;
    } catch (e) {
      this.etat = navigator.onLine ? 'erreur' : 'hors_ligne';
      this.message = e instanceof Error ? e.message : String(e);
    }
  }

  /** Envoie les lignes modifiées localement. */
  async pousser(): Promise<void> {
    const sb = supabase(), db = magasin.db;
    if (!sb || !db) return;
    const sorties = await db.sortie.toArray();
    for (const t of TABLES) {
      const dues = sorties.filter((s) => s.table === t);
      for (let i = 0; i < dues.length; i += LOT) {
        const lot = dues.slice(i, i + LOT);
        const rows = (await db.lignes(t).bulkGet(lot.map((s) => s.id))).filter(Boolean);
        if (rows.length) {
          const { data, error } = await sb.from(t).upsert(rows as never[], { onConflict: 'id' }).select('id, updated_at');
          if (error) throw new Error(`${t} : ${error.message}`);
          const maj = new Map((data ?? []).map((d: { id: string; updated_at: string }) => [d.id, d.updated_at]));
          await db.transaction('rw', db.lignes(t), db.sortie, async () => {
            for (const r of rows as { id: string; updated_at: string }[]) { const u = maj.get(r.id); if (u) await db.lignes(t).update(r.id, { updated_at: u } as never); }
            // On ne retire que les entrées inchangées depuis la lecture : une écriture plus récente reste en file.
            for (const s of lot) { const cur = await db.sortie.get(s.cle); if (cur && cur.at === s.at) await db.sortie.delete(s.cle); }
          });
        } else await db.sortie.bulkDelete(lot.map((s) => s.cle));
      }
    }
    magasin.enAttente = await db.sortie.count();
  }

  /** Récupère les changements du serveur, page par page (curseur updated_at + id). */
  async tirer(): Promise<void> {
    const sb = supabase(), db = magasin.db;
    if (!sb || !db) return;
    for (const t of TABLES) {
      let curseur = ((await db.meta.get(`curseur:${t}`))?.valeur as Curseur | undefined) ?? { ts: '1970-01-01T00:00:00Z', id: '00000000-0000-0000-0000-000000000000' };
      for (;;) {
        const { data, error } = await sb.from(t).select('*')
          .or(`updated_at.gt.${curseur.ts},and(updated_at.eq.${curseur.ts},id.gt.${curseur.id})`)
          .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE);
        if (error) throw new Error(`${t} : ${error.message}`);
        if (!data?.length) break;
        await magasin.appliquerDuServeur(t as NomTable, data as never[]);
        const dernier = data[data.length - 1] as { updated_at: string; id: string };
        curseur = { ts: dernier.updated_at, id: dernier.id };
        await db.meta.put({ cle: `curseur:${t}`, valeur: curseur });
        if (data.length < PAGE) break;
      }
    }
  }
}

export const synchro = new Synchro();
