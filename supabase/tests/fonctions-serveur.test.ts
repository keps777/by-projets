// Fonctions SQL utilisées par materialiser-occurrences et generer-rapports (clé de service).
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { A, B, comme, creerBase, erreur, remplir, uid } from './outils.ts';

let db: PGlite;
let a: Record<string, string>;

beforeAll(async () => {
  db = await creerBase();
  a = await remplir(db, A, 100);
  await remplir(db, B, 200);
}, 60_000);

const occ = (id: string, jour: string, debut: string) => ({ id, user_id: A, tache_id: a.tache, jour, debut, fin: debut });

describe('inserer_occurrences', () => {
  it('ignore tout conflit (identifiant ou jour déjà pris) et rend les identifiants créés', async () => {
    // a.occurrence existe déjà le 5 ; on la modifie pour en faire une exception.
    await comme(db, A, 'update occurrences set debut = $2, exception = true where id = $1', [a.occurrence, '2026-10-05T12:00:00Z']);
    const lignes = [
      occ(a.occurrence, '2026-10-05', '2026-10-05T09:00:00Z'), // même identifiant
      occ(uid(301), '2026-10-05', '2026-10-05T09:00:00Z'), // même tâche, même jour
      occ(uid(302), '2026-10-06', '2026-10-06T09:00:00Z')
    ];
    const crees = await comme<{ id: string }>(db, 'service', 'select inserer_occurrences($1) as id', [JSON.stringify(lignes)]);
    expect(crees.map((r) => r.id)).toEqual([uid(302)]);
    const [o] = await comme<{ debut: Date; exception: boolean }>(db, A, 'select debut, exception from occurrences where id = $1', [a.occurrence]);
    expect(o.debut.toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(o.exception).toBe(true);
  });
});

describe('inserer_rappels et annuler_rappels_taches', () => {
  it('ignore les rappels déjà connus, puis annule seulement les rappels futurs en attente de la tâche', async () => {
    const r = (id: string, cle: string, envoyer_a: string, occurrence_id: string | null = uid(302), user_id = A) =>
      ({ id, user_id, type: occurrence_id ? 'bloc' : 'rapport', occurrence_id, rapport_id: null, envoyer_a, cle_unique: cle });
    const lignes = [
      r(uid(311), `${uid(302)}:10`, '2999-10-06T08:50:00Z'),
      r(uid(312), `${uid(302)}:10`, '2999-10-06T08:50:00Z'), // même clé
      r(a.rappel, 'autre', '2999-10-06T08:50:00Z'), // même identifiant
      r(uid(313), `${a.occurrence}:5`, '2020-10-05T08:55:00Z', a.occurrence), // passé : ne sera pas annulé
      r(uid(314), 'rapport:2026-10-05', '2026-10-05T01:15:00Z', null, B)
    ];
    const crees = await comme<{ id: string }>(db, 'service', 'select inserer_rappels($1) as id', [JSON.stringify(lignes)]);
    expect(crees.map((x) => x.id).sort()).toEqual([uid(311), uid(313), uid(314)]);

    const [{ n }] = await comme<{ n: number }>(db, 'service', 'select annuler_rappels_taches($1) as n', [[a.tache]]);
    expect(n).toBe(1);
    const etats = await comme<{ id: string; etat: string }>(db, A, 'select id, etat from rappels order by id');
    expect(Object.fromEntries(etats.map((e) => [e.id, e.etat]))).toEqual({ [a.rappel]: 'en_attente', [uid(311)]: 'annule', [uid(313)]: 'en_attente' });
  });

  it('sont réservées à la clé de service', async () => {
    expect(await erreur(db, A, 'select annuler_rappels_taches($1)', [[a.tache]])).toMatch(/permission denied/);
    expect(await erreur(db, A, 'select inserer_occurrences($1)', ['[]'])).toMatch(/permission denied/);
  });
});
