// Migrations 0600 (rappels choisis dans le profil) et 0700 (synchronisation, inscription fermée).
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { A, B, comme, creerBase, remplir, uid } from './outils.ts';

let db: PGlite;
let a: Record<string, string>;

beforeAll(async () => {
  db = await creerBase();
  a = await remplir(db, A, 100);
  await remplir(db, B, 200);
  await comme(db, A, 'select initialiser_compte($1)', ['Luther']);
  await comme(db, B, 'select initialiser_compte($1)', ['Autre']);
}, 60_000);

describe('quels rappels recevoir', () => {
  it('le profil reçoit tout par défaut', async () => {
    const [p] = await comme<Record<string, boolean>>(db, A, 'select recevoir_bloc, recevoir_rapport, recevoir_recap_semaine, recevoir_recap_mois from profils');
    expect(p).toEqual({ recevoir_bloc: true, recevoir_rapport: true, recevoir_recap_semaine: true, recevoir_recap_mois: true });
  });

  it('reserver_rappels dit si le type est voulu par son propriétaire', async () => {
    await comme(db, A, 'update profils set recevoir_bloc = false');
    const ins = 'insert into rappels (id, user_id, type, occurrence_id, envoyer_a, etat, cle_unique) values ($1, $2, $3, $4, $5, $6, $7)';
    await comme(db, 'service', ins, [uid(931), A, 'rapport', null, '2020-01-01T00:00:00Z', 'en_attente', 'rapport:a']);
    const pris = await comme<{ id: string; recu: boolean }>(db, 'service', 'select id, recu from reserver_rappels(50)');
    const recu = Object.fromEntries(pris.map((r) => [r.id, r.recu]));
    expect(recu[a.rappel]).toBe(false); // bloc de A : désactivé
    expect(recu[uid(931)]).toBe(true); // rapport de A : voulu
    expect(Object.values(recu).filter((v) => v === true).length).toBe(2); // + le bloc de B
  });
});

describe('synchronisation', () => {
  const lireOcc = async () => (await comme<{ supprime_le: Date | null }>(db, A, 'select supprime_le from occurrences where id = $1', [a.occurrence]))[0];

  it('une modification plus ancienne que la suppression ne ressuscite pas la ligne', async () => {
    await comme(db, A, 'update occurrences set supprime_le = $2 where id = $1', [a.occurrence, '2026-10-05T12:00:00Z']);
    // Un appareil resté hors ligne renvoie sa version, modifiée à 11:00, sans suppression.
    await comme(db, A, 'update occurrences set etat = $2, supprime_le = null, updated_at = $3 where id = $1', [a.occurrence, 'faite', '2026-10-05T11:00:00Z']);
    expect((await lireOcc()).supprime_le).not.toBeNull();
  });

  it('une recréation volontaire, plus récente que la suppression, est permise', async () => {
    await comme(db, A, 'update occurrences set supprime_le = null, updated_at = $2 where id = $1', [a.occurrence, '2026-10-05T13:00:00Z']);
    expect((await lireOcc()).supprime_le).toBeNull();
  });
});

describe('inscription', () => {
  it('la base refuse un deuxième compte', async () => {
    // Comme le service d'authentification de Supabase, qui écrit directement dans auth.users.
    await expect(db.query('insert into auth.users (id) values ($1)', [uid(999)])).rejects.toThrow(/inscriptions sont fermées/);
  });
});
