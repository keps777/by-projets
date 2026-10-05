// Tests de la base : règles d'accès, initialisation du compte, unicités, horodatage et réservation des rappels.
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { A, B, comme, creerBase, erreur, remplir, uid } from './outils.ts';
import { TABLES } from '../functions/_shared/core/lignes.ts';

let db: PGlite;
let a: Record<string, string>;
let b: Record<string, string>;

beforeAll(async () => {
  db = await creerBase();
  a = await remplir(db, A, 100);
  b = await remplir(db, B, 200);
}, 60_000);

const compter = async (qui: string, table: string) =>
  Number((await comme<{ n: number }>(db, qui, `select count(*)::int as n from ${table}`))[0].n);

describe('règles d’accès (RLS)', () => {
  it('chaque utilisateur ne voit que ses lignes, dans les 17 tables', async () => {
    for (const t of TABLES.filter((x) => x !== 'profils')) {
      expect(await compter(A, t), t).toBe(1);
      const autres = await comme(db, B, `select id from ${t} where user_id = $1`, [A]);
      expect(autres, t).toHaveLength(0);
    }
  });

  it('refuse l’insertion avec le user_id d’un autre', async () => {
    expect(await erreur(db, B, 'insert into rubriques (id, user_id, nom, couleur) values ($1, $2, $3, $4)', [uid(901), A, 'x', '#fff'])).toMatch(/row-level security/);
    expect(await erreur(db, B, 'insert into profils (id, user_id) values ($1, $1)', [A])).toMatch(/row-level security/);
  });

  it('ignore la modification et la suppression des lignes d’autrui', async () => {
    expect(await comme(db, B, 'update rubriques set nom = $2 where id = $1 returning id', [a.rubrique, 'piraté'])).toHaveLength(0);
    expect(await comme(db, B, 'delete from saisies where id = $1 returning id', [a.saisie])).toHaveLength(0);
    expect(await comme(db, B, 'delete from rapports returning user_id', [])).toEqual([{ user_id: B }]);
    const [r] = await comme<{ nom: string }>(db, A, 'select nom from rubriques where id = $1', [a.rubrique]);
    expect(r.nom).toBe('Rubrique');
    expect(await compter(A, 'saisies')).toBe(1);
  });

  it('refuse de rattacher ses lignes à un parent d’autrui', async () => {
    const cas: [string, unknown[]][] = [
      ['insert into projets (id, rubrique_id, nom) values ($1, $2, $3)', [uid(902), a.rubrique, 'x']],
      ['insert into metriques (id, sous_projet_id, cle, type, nom) values ($1, $2, $3, $4, $5)', [uid(903), a.sous_projet, 'fois', 'fois', 'x']],
      ['insert into occurrences (id, tache_id, jour, debut, fin) values ($1, $2, $3, $4, $4)', [uid(904), a.tache, '2026-10-09', '2026-10-09T09:00:00Z']],
      ['insert into tache_alimente (id, tache_id, sous_projet_id) values ($1, $2, $3)', [uid(905), b.tache, a.sous_projet]],
      ['insert into saisie_valeurs (id, saisie_id, cle) values ($1, $2, $3)', [uid(906), a.saisie, 'temps']],
      ['insert into rappels (id, type, occurrence_id, envoyer_a, cle_unique) values ($1, $2, $3, now(), $4)', [uid(907), 'bloc', a.occurrence, 'x']],
      ['insert into presets_export (id, nom, points) values ($1, $2, $3)', [uid(908), 'x', [b.point, a.point]]],
      ['update projets set rubrique_id = $2 where id = $1', [b.projet, a.rubrique]]
    ];
    for (const [sql, p] of cas) expect(await erreur(db, B, sql, p), sql).toMatch(/row-level security/);
  });

  it('n’accorde rien au visiteur anonyme ni aux fonctions de service', async () => {
    expect(await erreur(db, 'anon', 'select * from rubriques')).toMatch(/permission denied/);
    expect(await erreur(db, 'anon', 'select initialiser_compte($1)', ['x'])).toMatch(/permission denied/);
    expect(await erreur(db, A, 'select * from reserver_rappels(10)')).toMatch(/permission denied/);
    expect(await erreur(db, A, 'select inserer_rappels($1)', ['[]'])).toMatch(/permission denied/);
  });
});

describe('initialiser_compte', () => {
  const totaux = async (qui: string) => ({
    rubriques: await compter(qui, 'rubriques'), projets: await compter(qui, 'projets'),
    points: await compter(qui, 'points_rapport'), presets: await compter(qui, 'presets_export'), profils: await compter(qui, 'profils')
  });

  it('crée le profil, 5 rubriques, 24 projets, 12 points et 3 préréglages, sans doublon au second appel', async () => {
    const avantB = await totaux(B);
    const [p] = await comme<Record<string, unknown>>(db, A, 'select * from initialiser_compte($1)', ['Luther']);
    expect(p).toMatchObject({ id: A, prenom: 'Luther', nom_rapport: 'Luther', langue_rapport: 'fr', fuseau: 'America/Toronto', apparence: 'nuit',
      heure_rapport: '21:15', rappel_defaut_min: 10, titres_visibles: true, devise: 'CAD', initialise: true });
    const t1 = await totaux(A);
    expect(t1).toEqual({ rubriques: 6, projets: 25, points: 13, presets: 4, profils: 1 }); // + 1 ligne de remplir()
    await comme(db, A, 'select initialiser_compte($1)', ['Autre']);
    await comme(db, A, 'update profils set initialise = false');
    await comme(db, A, 'select initialiser_compte($1)', ['Autre']);
    expect(await totaux(A)).toEqual(t1);
    expect((await comme<{ prenom: string }>(db, A, 'select prenom from profils'))[0].prenom).toBe('Luther');
    expect(await totaux(B)).toEqual(avantB);
  });

  it('suit exactement les valeurs du noyau', async () => {
    const { RUBRIQUES_DEFAUT, POINTS_DEFAUT, PRESETS_DEFAUT } = await import('../functions/_shared/core/defauts.ts');
    const rubs = await comme<{ id: string; cle: string; nom: string; couleur: string; ordre: number }>(db, A, 'select * from rubriques where cle is not null order by ordre');
    expect(rubs.map(({ cle, nom, couleur, ordre }) => ({ cle, nom, couleur, ordre }))).toEqual(RUBRIQUES_DEFAUT.map((r, i) => ({ cle: r.cle, nom: r.nom, couleur: r.couleur, ordre: i })));
    for (const [i, r] of RUBRIQUES_DEFAUT.entries()) {
      const pr = await comme<{ numero: number; nom: string }>(db, A, 'select numero, nom from projets where rubrique_id = $1 order by ordre', [rubs[i].id]);
      expect(pr).toEqual(r.projets.map((x) => ({ numero: x.numero, nom: x.nom })));
    }
    expect((await comme(db, A, 'select 1 from projets where numero = 24'))).toHaveLength(0);
    const pts = await comme<{ id: string; code: string; libelle: string; numero: number; mesures: { cle: string }[] }>(db, A,
      'select pr.id, pr.code, pr.libelle, p.numero, pr.mesures from points_rapport pr join projets p on p.id = pr.projet_id where pr.code <> $1 order by pr.ordre', ['TEST']);
    expect(pts.map(({ code, libelle, numero }) => ({ code, nom: libelle, projet: numero }))).toEqual(POINTS_DEFAUT);
    expect(pts.find((p) => p.code === 'BR')!.mesures).toEqual([
      { cle: 'nombre:chapitres', sous_projet_id: null }, { cle: 'reference:passages', sous_projet_id: null }, { cle: 'temps', sous_projet_id: null }]);
    const code = new Map(pts.map((p) => [p.id, p.code]));
    const presets = await comme<{ nom: string; points: string[] }>(db, A, 'select nom, points from presets_export where nom <> $1 order by ordre', ['Essai']);
    expect(presets.map((p) => ({ nom: p.nom, points: p.points.map((id) => code.get(id)) }))).toEqual(PRESETS_DEFAUT);
  });

  it('exige une connexion', async () => {
    expect(await erreur(db, '', 'select initialiser_compte($1)', ['x'])).toMatch(/Connexion requise/);
    expect(await erreur(db, 'service', 'select initialiser_compte($1)', ['x'])).toMatch(/permission denied/);
  });
});

describe('unicités', () => {
  it('un rappel par clé, un abonnement par adresse ; une occurrence reportée peut rejoindre un jour déjà pris', async () => {
    expect(await erreur(db, A, 'insert into occurrences (id, tache_id, jour, debut, fin) values ($1, $2, $3, now(), now())', [uid(911), a.tache, '2026-10-05'])).toBeNull();
    expect(await erreur(db, A, 'insert into rappels (id, type, envoyer_a, cle_unique) values ($1, $2, now(), $3)', [uid(912), 'rapport', `${a.occurrence}:10`])).toMatch(/unique/);
    expect(await erreur(db, A, 'insert into abonnements_push (id, endpoint, cle_p256dh, cle_auth) values ($1, $2, $3, $3)', [uid(913), 'https://push.example/1', 'k'])).toMatch(/unique/);
    // La même clé chez un autre utilisateur est permise.
    expect(await erreur(db, B, 'insert into rappels (id, type, envoyer_a, cle_unique) values ($1, $2, now(), $3)', [uid(914), 'rapport', `${a.occurrence}:10`])).toBeNull();
  });

  it('une métrique par clé dans un sous-projet, en ignorant les lignes supprimées', async () => {
    const sql = 'insert into metriques (id, sous_projet_id, cle, type, nom) values ($1, $2, $3, $4, $5)';
    expect(await erreur(db, A, sql, [uid(915), a.sous_projet, 'temps', 'temps', 'Doublon'])).toMatch(/unique/);
    await comme(db, A, 'update metriques set supprime_le = now() where id = $1', [a.metrique]);
    expect(await erreur(db, A, sql, [uid(916), a.sous_projet, 'temps', 'temps', 'Remplaçante'])).toBeNull();
  });

  it('refuse les valeurs hors énumération', async () => {
    expect(await erreur(db, A, 'update occurrences set etat = $2 where id = $1', [a.occurrence, 'perdue'])).toMatch(/check/);
    expect(await erreur(db, A, 'update profils set heure_rapport = $1', ['25:00'])).toMatch(/check/);
    expect(await erreur(db, A, 'update taches set regle = $2 where id = $1', [a.tache, JSON.stringify({ frequence: 'annuel', fin: { type: 'aucune' } })])).toMatch(/check/);
  });
});

describe('horodatage', () => {
  it('updated_at avance à chaque modification, created_at et user_id ne bougent pas', async () => {
    const lire = async () => (await comme<{ created_at: Date; updated_at: Date }>(db, A, 'select created_at, updated_at from projets where id = $1', [a.projet]))[0];
    const avant = await lire();
    await new Promise((r) => setTimeout(r, 5));
    await comme(db, A, 'update projets set nom = $2, updated_at = $3, created_at = $3 where id = $1', [a.projet, 'Renommé', '2000-01-01T00:00:00Z']);
    const apres = await lire();
    expect(apres.updated_at.getTime()).toBeGreaterThan(avant.updated_at.getTime());
    expect(apres.created_at.getTime()).toBe(avant.created_at.getTime());
    expect(await erreur(db, A, 'update projets set user_id = $2 where id = $1', [a.projet, B])).toMatch(/user_id|row-level/);
    expect(await erreur(db, 'service', 'update projets set user_id = $2 where id = $1', [a.projet, B])).toMatch(/propriétaire/);
  });
});

describe('reserver_rappels', () => {
  it('ne rend que les rappels dus, une seule fois, avec de quoi composer la notification', async () => {
    const ins = 'insert into rappels (id, user_id, type, occurrence_id, envoyer_a, etat, cle_unique) values ($1, $2, $3, $4, $5, $6, $7)';
    await comme(db, 'service', ins, [uid(921), A, 'bloc', a.occurrence, '2999-01-01T00:00:00Z', 'en_attente', 'futur']);
    await comme(db, 'service', ins, [uid(922), A, 'bloc', a.occurrence, '2020-01-01T00:00:00Z', 'envoye', 'deja']);
    await comme(db, 'service', ins, [uid(923), A, 'bloc', a.occurrence, '2020-01-01T00:00:00Z', 'annule', 'annule']);
    const pris = await comme<Record<string, unknown>>(db, 'service', 'select * from reserver_rappels(10)');
    // Dus : les deux de remplir() et celui du test d'unicité (uid 914, envoyer_a = now()).
    expect(pris.map((r) => r.id).sort()).toEqual([a.rappel, b.rappel, uid(914)].sort());
    expect(pris.find((r) => r.id === a.rappel)).toMatchObject({ user_id: A, type: 'bloc', tentatives: 1, titre: 'RDQD du matin', rubrique: 'Rubrique',
      titres_visibles: true, fuseau: 'America/Toronto', bloc_annule: false, occ_etat: 'prevue' });
    expect(await comme(db, 'service', 'select * from reserver_rappels(10)')).toHaveLength(0);
    expect((await comme<{ etat: string }>(db, A, 'select etat from rappels where id = $1', [a.rappel]))[0].etat).toBe('echec');
  });
});
