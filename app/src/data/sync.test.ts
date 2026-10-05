import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; updated_at: string; user_id: string; [k: string]: unknown };
const serveur = vi.hoisted(() => ({ tables: new Map<string, Row[]>(), horloge: 0, journal: [] as string[], refuses: new Set<string>(), panne: false }));

vi.mock('./config.ts', () => ({ modeServeur: true, SUPABASE_URL: 'x', SUPABASE_CLE: 'y', ID_LOCAL: 'u1', VAPID_PUBLIQUE: undefined }));
vi.mock('./supabase.ts', () => ({
  supabase: () => ({
    from: (t: string) => ({
      upsert: (rows: Row[]) => {
        serveur.journal.push(t);
        if (serveur.panne) return { select: () => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }) };
        const refus = rows.find((r) => serveur.refuses.has(r.id));
        if (refus) return { select: () => Promise.resolve({ data: null, error: { message: `refus de ${refus.id}`, code: '23505' } }) };
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
const { enregistrerAbonnement } = await import('../screens/accueil/push.ts');

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-u1');
  serveur.tables.clear(); serveur.horloge = 0; serveur.journal = []; serveur.refuses.clear(); serveur.panne = false;
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

const ligneServeur = (id: string, nom: string, updated_at: string, supprime_le: string | null = null) =>
  ({ ...rubrique(id, nom), user_id: 'u1', created_at: 'x', updated_at, supprime_le }) as Row;

describe('synchronisation : robustesse', () => {
  it('une ligne refusée par le serveur reste en file sans bloquer les autres', async () => {
    magasin.ecrire('rubriques', rubrique('r1', 'Refusée'));
    magasin.ecrire('rubriques', rubrique('r2', 'Acceptée'));
    magasin.ecrire('projets', { id: 'p2', rubrique_id: 'r2', numero: 2, nom: 'P', ordre: 0, statut: 'actif' });
    await magasin.terminerEcritures();
    serveur.refuses.add('r1');
    const refus = await synchro.pousser();
    expect(refus).toHaveLength(1);
    expect(serveur.tables.get('rubriques')!.map((r) => r.id)).toEqual(['r2']);
    expect(serveur.tables.get('projets')!.map((r) => r.id)).toEqual(['p2']);
    expect((await magasin.db!.sortie.toArray()).map((x) => x.id)).toEqual(['r1']);
  });

  it('une panne réseau interrompt l’envoi sans rien retirer de la file', async () => {
    magasin.ecrire('rubriques', rubrique('r1', 'R'));
    await magasin.terminerEcritures();
    serveur.panne = true;
    await expect(synchro.pousser()).rejects.toThrow(/fetch/);
    expect(await magasin.db!.sortie.count()).toBe(1);
  });

  it('ne manque pas une ligne validée en retard avec une date plus ancienne que le curseur', async () => {
    serveur.tables.set('rubriques', [ligneServeur('r1', 'A', '2026-10-05T12:00:10.000Z')]);
    await synchro.tirer();
    // Une transaction commencée à 12:00:05 n'est visible qu'après coup.
    serveur.tables.get('rubriques')!.push(ligneServeur('r2', 'B', '2026-10-05T12:00:05.000Z'));
    await synchro.tirer();
    expect(magasin.lignes.rubriques.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('une écriture locale faite pendant un tirage garde la main', async () => {
    const p = magasin.appliquerDuServeur('rubriques', [ligneServeur('r1', 'Serveur', '2026-10-05T12:00:00.000Z')] as never[]);
    magasin.ecrire('rubriques', rubrique('r1', 'Local'));
    await p;
    await magasin.terminerEcritures();
    expect(magasin.trouver('rubriques', 'r1')!.nom).toBe('Local');
    expect((await magasin.db!.lignes('rubriques').get('r1'))!.nom).toBe('Local');
    expect(await magasin.db!.sortie.count()).toBe(1);
  });

  it('une ligne supprimée ne renaît pas sous l’effet d’une écriture partielle', async () => {
    magasin.ecrire('rubriques', rubrique('r1', 'R'));
    magasin.supprimer('rubriques', 'r1');
    magasin.ecrire('rubriques', { id: 'r1', nom: 'Fantôme' });
    await magasin.appliquerDuServeur('rubriques', [ligneServeur('r2', 'R2', '2026-10-05T12:00:00.000Z', '2026-10-05T12:00:00.000Z')] as never[]);
    magasin.ecrire('rubriques', { id: 'r2', nom: 'Fantôme' });
    await magasin.terminerEcritures();
    expect(magasin.lignes.rubriques).toHaveLength(0);
    expect((await magasin.db!.lignes('rubriques').get('r1'))!.supprime_le).not.toBeNull();
    // Après réouverture, la suppression est toujours connue.
    await magasin.ouvrir('u1');
    expect(magasin.estSupprime('rubriques', 'r1')).toBe(true);
  });

  it('lance l’action différée après la première synchronisation réussie seulement', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const fn = vi.fn();
    synchro.apresSynchro(fn);
    serveur.panne = true;
    magasin.ecrire('rubriques', rubrique('r1', 'R'));
    await magasin.terminerEcritures();
    await synchro.synchroniser();
    expect(fn).not.toHaveBeenCalled();
    serveur.panne = false;
    await synchro.synchroniser();
    expect(fn).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('se réabonner sur le même appareil réactive sa ligne retirée par le serveur, sans doublon', async () => {
    const endpoint = 'https://web.push.apple.com/xyz';
    magasin.ecrire('abonnements_push', { id: 'ab1', endpoint, cle_p256dh: 'p', cle_auth: 'a', appareil: 'iPhone', dernier_succes: null });
    await magasin.terminerEcritures();
    await synchro.pousser();
    await magasin.appliquerDuServeur('abonnements_push', [{ ...serveur.tables.get('abonnements_push')![0], supprime_le: '2026-10-05T13:00:00.000Z', updated_at: '2026-10-05T13:00:00.000Z' }] as never[]);
    expect(magasin.lignes.abonnements_push).toHaveLength(0);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'P2', auth: 'A2' } }) } as unknown as PushSubscription;
    expect((await enregistrerAbonnement(sub))!.id).toBe('ab1');
    vi.unstubAllGlobals();
    await magasin.terminerEcritures();
    expect(magasin.lignes.abonnements_push.map((a) => [a.id, a.supprime_le, a.cle_p256dh])).toEqual([['ab1', null, 'P2']]);
    await synchro.pousser();
    expect(serveur.tables.get('abonnements_push')!.map((a) => [a.id, a.supprime_le])).toEqual([['ab1', null]]);
  });
});
