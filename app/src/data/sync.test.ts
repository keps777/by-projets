import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; updated_at: string; user_id: string; [k: string]: unknown };
const serveur = vi.hoisted(() => ({ tables: new Map<string, Row[]>(), horloge: 0, journal: [] as string[] }));

vi.mock('./config.ts', () => ({ modeServeur: true, SUPABASE_URL: 'x', SUPABASE_CLE: 'y', ID_LOCAL: 'u1', VAPID_PUBLIQUE: undefined }));
vi.mock('./supabase.ts', () => ({
  supabase: () => ({
    from: (t: string) => ({
      upsert: (rows: Row[]) => {
        serveur.journal.push(t);
        const stock = serveur.tables.get(t) ?? [];
        const res: { id: string; updated_at: string }[] = [];
        for (const r of rows) {
          const ts = new Date(Date.UTC(2026, 9, 5, 12, 0, ++serveur.horloge)).toISOString();
          const ligne = { ...r, updated_at: ts };
          const i = stock.findIndex((x) => x.id === r.id);
          if (i >= 0) stock[i] = ligne; else stock.push(ligne);
          res.push({ id: r.id, updated_at: ts });
        }
        serveur.tables.set(t, stock);
        return { select: () => Promise.resolve({ data: res, error: null }) };
      },
      select: () => {
        let cur = { ts: '1970-01-01T00:00:00Z', id: '' }, lim = 1000;
        const b: Record<string, unknown> = {};
        b.or = (f: string) => { const m = /updated_at\.gt\.(.+?),and\(updated_at\.eq\.(.+?),id\.gt\.(.+?)\)/.exec(f)!; cur = { ts: m[1], id: m[3] }; return b; };
        b.order = () => b;
        b.limit = (n: number) => { lim = n; return b; };
        b.then = (ok: (v: unknown) => unknown) => {
          const data = (serveur.tables.get(t) ?? [])
            .filter((r) => r.updated_at > cur.ts || (r.updated_at === cur.ts && r.id > cur.id))
            .sort((a, c) => (a.updated_at === c.updated_at ? (a.id < c.id ? -1 : 1) : a.updated_at < c.updated_at ? -1 : 1)).slice(0, lim);
          return Promise.resolve({ data, error: null }).then(ok);
        };
        return b;
      }
    }),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) }
  })
}));

const { magasin } = await import('./magasin.svelte.ts');
const { synchro } = await import('./sync.svelte.ts');

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-u1');
  serveur.tables.clear(); serveur.horloge = 0; serveur.journal = [];
  await magasin.ouvrir('u1');
});

const rubrique = (id: string, nom: string) => ({ id, cle: null, nom, couleur: '#fff', ordre: 0, archivee: false });

describe('synchronisation', () => {
  it('envoie les parents avant les enfants et vide la file', async () => {
    magasin.ecrire('projets', { id: 'p1', rubrique_id: 'r1', numero: 1, nom: 'P', ordre: 0, statut: 'actif' });
    magasin.ecrire('rubriques', rubrique('r1', 'R'));
    await magasin.terminerEcritures();
    await synchro.pousser();
    expect(serveur.journal).toEqual(['rubriques', 'projets']);
    expect(magasin.enAttente).toBe(0);
    expect((await magasin.db!.lignes('rubriques').get('r1'))!.updated_at.startsWith('2026-10-05T12:00')).toBe(true);
  });

  it('récupère les lignes d’un autre appareil, page par page', async () => {
    const lignes = Array.from({ length: 1200 }, (_, i) => ({ ...rubrique('', 'R' + i), id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: 'u1', created_at: 'x', updated_at: '2026-10-05T11:00:00.000Z', supprime_le: null, ordre: i }));
    serveur.tables.set('rubriques', lignes.map((l) => ({ ...l, id: l.id })) as Row[]);
    await synchro.tirer();
    expect(magasin.lignes.rubriques).toHaveLength(1200);
    await synchro.tirer();
    expect(magasin.lignes.rubriques).toHaveLength(1200);
  });

  it('garde une écriture locale en attente quand le serveur a une version plus ancienne', async () => {
    serveur.tables.set('rubriques', [{ ...rubrique('r1', 'Serveur'), user_id: 'u1', created_at: 'x', updated_at: '2026-10-05T11:00:00.000Z', supprime_le: null } as Row]);
    magasin.ecrire('rubriques', rubrique('r1', 'Local'));
    await magasin.terminerEcritures();
    await synchro.tirer();
    expect(magasin.trouver('rubriques', 'r1')!.nom).toBe('Local');
    await synchro.pousser();
    expect((serveur.tables.get('rubriques')![0] as Row & { nom: string }).nom).toBe('Local');
  });

  it('propage une suppression venue du serveur', async () => {
    magasin.ecrire('rubriques', rubrique('r1', 'R'));
    await magasin.terminerEcritures();
    await synchro.pousser();
    const r = serveur.tables.get('rubriques')![0];
    serveur.tables.set('rubriques', [{ ...r, supprime_le: '2026-10-05T13:00:00.000Z', updated_at: '2026-10-05T13:00:00.000Z' }]);
    await synchro.tirer();
    expect(magasin.lignes.rubriques).toHaveLength(0);
  });
});
