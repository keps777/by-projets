-- Schéma de Luther Life : les 16 tables du contrat supabase/functions/_shared/core/lignes.ts (spec §3).
-- Règles communes : id fourni par le client (aucune valeur par défaut), user_id = propriétaire, valeurs en unité de base (numeric),
-- suppression logique par supprime_le (pour que les autres appareils la voient).

-- Horodatage imposé par le serveur (synchronisation, spec §13) et propriétaire immuable.
create or replace function public.horodater() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Le propriétaire (user_id) d’une ligne ne peut pas changer.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create table public.profils (
  id uuid primary key,
  prenom text not null default '',
  nom_rapport text not null default '',
  langue_rapport text not null default 'fr' check (langue_rapport in ('en', 'fr')),
  fuseau text not null default 'America/Toronto',
  apparence text not null default 'nuit' check (apparence in ('nuit', 'jour', 'auto')),
  heure_rapport text not null default '21:15' check (heure_rapport ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  rappel_defaut_min integer not null default 10 check (rappel_defaut_min in (0, 5, 10, 15)),
  titres_visibles boolean not null default true,
  devise text not null default 'CAD',
  initialise boolean not null default false
);

create table public.rubriques (
  id uuid primary key,
  cle text,
  nom text not null,
  couleur text not null,
  ordre integer not null default 0,
  archivee boolean not null default false
);

create table public.projets (
  id uuid primary key,
  rubrique_id uuid not null references public.rubriques (id) on delete cascade,
  numero integer,
  nom text not null,
  ordre integer not null default 0,
  statut text not null default 'actif' check (statut in ('actif', 'pause', 'archive'))
);

create table public.sous_projets (
  id uuid primary key,
  projet_id uuid not null references public.projets (id) on delete cascade,
  nom text not null,
  debut date not null,
  fin date,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'en_cours', 'a_valider', 'termine', 'archive')),
  -- Pas de clé étrangère : la métrique est écrite APRÈS son sous-projet par la synchronisation (ordre de TABLES).
  metrique_pilote_id uuid,
  reprise_passe boolean not null default false,
  fiche jsonb not null default '{"quoi":"","pourquoi":"","qui":"","ou":"","quand":"","comment":"","combien":""}'
    check (jsonb_typeof(fiche) = 'object'),
  bilan text,
  termine_le timestamptz,
  check (fin is null or fin >= debut)
);

create table public.metriques (
  id uuid primary key,
  sous_projet_id uuid not null references public.sous_projets (id) on delete cascade,
  cle text not null,
  type text not null check (type in ('temps', 'fois', 'nombre', 'montant', 'oui_non', 'choix', 'distance', 'poids',
                                     'note', 'pourcentage', 'heure', 'reference')),
  nom text not null,
  unite text not null default '',
  cible numeric,
  periode_cible text not null default 'jour' check (periode_cible in ('jour', 'semaine', 'mois', 'total')),
  sens text not null default 'plus' check (sens in ('plus', 'moins')),
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  dans_rapport boolean not null default true,
  ordre integer not null default 0
);

create table public.taches (
  id uuid primary key,
  titre text not null,
  projet_id uuid references public.projets (id) on delete set null, -- nul = rendez-vous sans projet
  regle jsonb not null check (jsonb_typeof(regle) = 'object'
    and regle ->> 'frequence' in ('une_fois', 'quotidien', 'hebdo', 'mensuel')
    and regle -> 'fin' ->> 'type' in ('aucune', 'date', 'fois')),
  heure_debut integer not null check (heure_debut between 0 and 1439),
  duree_min integer not null check (duree_min > 0),
  rappel_min integer check (rappel_min is null or rappel_min >= 0),
  actif boolean not null default true
);

create table public.tache_alimente (
  id uuid primary key,
  tache_id uuid not null references public.taches (id) on delete cascade,
  sous_projet_id uuid not null references public.sous_projets (id) on delete cascade
);

create table public.tache_attendus (
  id uuid primary key,
  tache_id uuid not null references public.taches (id) on delete cascade,
  cle text not null,
  valeur_prevue numeric not null
);

create table public.occurrences (
  id uuid primary key,
  tache_id uuid not null references public.taches (id) on delete cascade,
  jour date not null,
  debut timestamptz not null,
  fin timestamptz not null,
  etat text not null default 'prevue' check (etat in ('prevue', 'en_cours', 'pause', 'faite', 'ignoree')),
  demarree_a timestamptz,
  pause_depuis timestamptz,
  pause_cumulee_s numeric not null default 0,
  terminee_a timestamptz,
  exception boolean not null default false,
  unique (tache_id, jour)
);

create table public.saisies (
  id uuid primary key,
  projet_id uuid references public.projets (id) on delete set null,
  occurrence_id uuid references public.occurrences (id) on delete set null,
  jour date not null,
  source text not null check (source in ('bloc', 'focus', 'minuteur', 'manuel', 'rattrapage')),
  note text,
  approx boolean not null default false
);

create table public.saisie_valeurs (
  id uuid primary key,
  saisie_id uuid not null references public.saisies (id) on delete cascade,
  cle text not null,
  valeur_num numeric,
  valeur_txt text,
  detail jsonb
);

create table public.points_rapport (
  id uuid primary key,
  ordre integer not null default 0,
  code text not null,
  libelle text not null default '',
  projet_id uuid references public.projets (id) on delete set null,
  mesures jsonb not null default '[]' check (jsonb_typeof(mesures) = 'array'),
  actif boolean not null default true
);

create table public.presets_export (
  id uuid primary key,
  nom text not null,
  points uuid[] not null default '{}',
  ordre integer not null default 0
);

create table public.rapports (
  id uuid primary key,
  jour date not null,
  contenu jsonb not null default '{}',
  genere_a timestamptz not null default now(),
  maj_a timestamptz not null default now(),
  envoye_a timestamptz
);

create table public.rappels (
  id uuid primary key,
  type text not null check (type in ('bloc', 'rapport', 'recap_semaine', 'recap_mois', 'valider')),
  occurrence_id uuid references public.occurrences (id) on delete cascade,
  rapport_id uuid references public.rapports (id) on delete cascade,
  envoyer_a timestamptz not null,
  etat text not null default 'en_attente' check (etat in ('en_attente', 'envoye', 'echec', 'annule')),
  cle_unique text not null,
  tentatives integer not null default 0,
  erreur text
);

create table public.abonnements_push (
  id uuid primary key,
  endpoint text not null,
  cle_p256dh text not null,
  cle_auth text not null,
  appareil text,
  dernier_succes timestamptz
);

-- Colonnes communes, déclencheur et index de synchronisation, ajoutés à chaque table.
do $$
declare t text;
begin
  foreach t in array array['profils', 'rubriques', 'projets', 'sous_projets', 'metriques', 'taches', 'tache_alimente',
    'tache_attendus', 'occurrences', 'saisies', 'saisie_valeurs', 'points_rapport', 'presets_export', 'rapports', 'rappels',
    'abonnements_push'] loop
    execute format('alter table public.%I
      add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(),
      add column supprime_le timestamptz', t);
    execute format('create trigger horodater before insert or update on public.%I for each row execute function public.horodater()', t);
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_sync_idx', t);
  end loop;
end $$;

-- Le profil porte l'identifiant de son utilisateur.
alter table public.profils add constraint profils_id_est_user_id check (id = user_id);

-- Unicités et index de lecture.
alter table public.rappels add constraint rappels_cle_unique unique (user_id, cle_unique);
alter table public.abonnements_push add constraint abonnements_push_endpoint_unique unique (user_id, endpoint);
create unique index metriques_cle_unique on public.metriques (sous_projet_id, cle) where supprime_le is null;
create index occurrences_jour_idx on public.occurrences (user_id, jour);
create index saisies_jour_idx on public.saisies (user_id, jour);
create index saisie_valeurs_saisie_idx on public.saisie_valeurs (saisie_id);
create index rappels_a_envoyer_idx on public.rappels (etat, envoyer_a);
create index rappels_occurrence_idx on public.rappels (occurrence_id);
create index rapports_jour_idx on public.rapports (user_id, jour);
