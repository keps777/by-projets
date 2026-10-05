// Base PostgreSQL en mémoire (PGlite) qui imite Supabase : schéma auth minimal, rôles anon / authenticated / service_role,
// puis les migrations du dépôt (sauf la planification, qui demande pg_cron et pg_net, absents de PGlite).
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOSSIER = fileURLToPath(new URL('../migrations/', import.meta.url));
export const MIGRATIONS = readdirSync(DOSSIER).filter((f) => f.endsWith('.sql') && !f.includes('planification')).sort();

const PREAMBULE = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to public;
`;

export const A = '0a0a0a0a-0000-4000-8000-00000000000a';
export const B = '0b0b0b0b-0000-4000-8000-00000000000b';

export async function creerBase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(PREAMBULE);
  // Les deux comptes de test existent avant les migrations : la base refuse ensuite toute nouvelle inscription.
  await db.query('insert into auth.users (id) values ($1), ($2)', [A, B]);
  for (const f of MIGRATIONS) await db.exec(readFileSync(DOSSIER + f, 'utf8'));
  return db;
}

/** Qui agit : un utilisateur connecté (son uuid ; '' = jeton sans utilisateur), le visiteur anonyme ou la clé de service. */
export type Acteur = string | 'anon' | 'service';

/** Exécute une requête dans une transaction, avec le rôle et le jeton de l'acteur (comme PostgREST). */
export async function comme<T = Record<string, unknown>>(db: PGlite, qui: Acteur, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx: Transaction) => {
    const role = qui === 'anon' ? 'anon' : qui === 'service' ? 'service_role' : 'authenticated';
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [qui === 'anon' || qui === 'service' ? '' : qui]);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}

/** Rend le message d'erreur de la requête, ou null si elle réussit. */
export async function erreur(db: PGlite, qui: Acteur, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await comme(db, qui, sql, params); return null; } catch (e) { return (e as Error).message; }
}

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Jeu de données minimal d'un utilisateur : rubrique → projet → sous-projet → métrique, tâche → occurrence, saisie… */
export async function remplir(db: PGlite, qui: string, base: number): Promise<Record<string, string>> {
  const ids = {
    rubrique: uid(base + 1), projet: uid(base + 2), sous_projet: uid(base + 3), metrique: uid(base + 4), tache: uid(base + 5),
    occurrence: uid(base + 6), saisie: uid(base + 7), valeur: uid(base + 8), point: uid(base + 9), rapport: uid(base + 10),
    rappel: uid(base + 11), abonnement: uid(base + 12), alimente: uid(base + 13), attendu: uid(base + 14), preset: uid(base + 15), note: uid(base + 16)
  };
  const regle = JSON.stringify({ frequence: 'quotidien', debut: '2026-10-01', fin: { type: 'aucune' } });
  const lignes: [string, unknown[]][] = [
    ['insert into rubriques (id, nom, couleur) values ($1, $2, $3)', [ids.rubrique, 'Rubrique', '#000000']],
    ['insert into projets (id, rubrique_id, numero, nom) values ($1, $2, 99, $3)', [ids.projet, ids.rubrique, 'Projet']],
    ['insert into sous_projets (id, projet_id, nom, debut, statut) values ($1, $2, $3, $4, $5)', [ids.sous_projet, ids.projet, 'SP', '2026-10-01', 'en_cours']],
    ['insert into metriques (id, sous_projet_id, cle, type, nom, cible) values ($1, $2, $3, $4, $5, 2700)', [ids.metrique, ids.sous_projet, 'temps', 'temps', 'Temps']],
    ['insert into taches (id, titre, projet_id, regle, heure_debut, duree_min, rappel_min) values ($1, $2, $3, $4, 300, 30, 10)', [ids.tache, 'RDQD du matin', ids.projet, regle]],
    ['insert into tache_alimente (id, tache_id, sous_projet_id) values ($1, $2, $3)', [ids.alimente, ids.tache, ids.sous_projet]],
    ['insert into tache_attendus (id, tache_id, cle, valeur_prevue) values ($1, $2, $3, 2700)', [ids.attendu, ids.tache, 'temps']],
    ['insert into occurrences (id, tache_id, jour, debut, fin) values ($1, $2, $3, $4, $5)', [ids.occurrence, ids.tache, '2026-10-05', '2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z']],
    ['insert into saisies (id, projet_id, occurrence_id, jour, source) values ($1, $2, $3, $4, $5)', [ids.saisie, ids.projet, ids.occurrence, '2026-10-05', 'bloc']],
    ['insert into saisie_valeurs (id, saisie_id, cle, valeur_num) values ($1, $2, $3, 1800)', [ids.valeur, ids.saisie, 'temps']],
    ['insert into points_rapport (id, code, projet_id) values ($1, $2, $3)', [ids.point, 'TEST', ids.projet]],
    ['insert into presets_export (id, nom, points) values ($1, $2, $3)', [ids.preset, 'Essai', [ids.point]]],
    ['insert into rapports (id, jour) values ($1, $2)', [ids.rapport, '2026-10-05']],
    ['insert into rappels (id, type, occurrence_id, envoyer_a, cle_unique) values ($1, $2, $3, $4, $5)', [ids.rappel, 'bloc', ids.occurrence, '2020-01-01T08:50:00Z', `${ids.occurrence}:10`]],
    ['insert into notes (id, jour, texte, numero, origine, occurrence_id) values ($1, $2, $3, 1, $4, $5)', [ids.note, '2026-10-05', 'Une note', 'focus', ids.occurrence]],
    ['insert into abonnements_push (id, endpoint, cle_p256dh, cle_auth) values ($1, $2, $3, $4)', [ids.abonnement, 'https://push.example/1', 'p', 'a']]
  ];
  for (const [sql, p] of lignes) await comme(db, qui, sql, p);
  return ids;
}
