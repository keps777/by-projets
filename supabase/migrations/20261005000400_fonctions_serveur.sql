-- Fonctions appelées par les fonctions serveur (clé de service uniquement) : rappels et matérialisation (spec §7, §10).

-- reserver_rappels : prend les rappels dus et les verrouille (FOR UPDATE SKIP LOCKED : deux envois simultanés ne
-- prennent jamais le même rappel). Comme l'appel HTTP (PostgREST) est une transaction à lui seul, la réservation
-- passe aussi le rappel à l'état provisoire « echec / envoi en cours » : il n'est donc jamais rendu deux fois.
-- envoyer-rappels le passe ensuite à « envoye », « echec » (avec l'erreur) ou de nouveau « en_attente » (nouvel essai).
-- Si la fonction serveur s'arrête en route, le rappel reste en « echec », ce qui dit la vérité.
create or replace function public.reserver_rappels(p_limit integer default 200)
returns table (
  id uuid, user_id uuid, type text, occurrence_id uuid, rapport_id uuid, envoyer_a timestamptz, cle_unique text,
  tentatives integer, titre text, debut timestamptz, fin timestamptz, occ_etat text, bloc_annule boolean,
  rubrique text, titres_visibles boolean, fuseau text, rapport_jour date
)
language sql volatile security definer set search_path = '' as $$
  with dus as (
    select r.id from public.rappels r
     where r.etat = 'en_attente' and r.envoyer_a <= now() and r.supprime_le is null
     order by r.envoyer_a, r.id
     limit greatest(coalesce(p_limit, 200), 0)
       for update skip locked
  ), pris as (
    update public.rappels r
       set etat = 'echec', erreur = 'envoi en cours', tentatives = r.tentatives + 1
      from dus
     where r.id = dus.id
    returning r.*
  )
  select pris.id, pris.user_id, pris.type, pris.occurrence_id, pris.rapport_id, pris.envoyer_a, pris.cle_unique,
         pris.tentatives, t.titre, o.debut, o.fin, o.etat,
         -- Bloc devenu sans objet : occurrence ou tâche supprimée, tâche désactivée, bloc déjà lancé ou terminé.
         (pris.type = 'bloc' and (o.id is null or o.supprime_le is not null or o.etat <> 'prevue'
           or t.supprime_le is not null or not t.actif)),
         rb.nom, pf.titres_visibles, pf.fuseau, ra.jour
    from pris
    left join public.occurrences o on o.id = pris.occurrence_id
    left join public.taches t on t.id = o.tache_id
    left join public.projets pj on pj.id = t.projet_id
    left join public.rubriques rb on rb.id = pj.rubrique_id
    left join public.profils pf on pf.id = pris.user_id
    left join public.rapports ra on ra.id = pris.rapport_id
   order by pris.envoyer_a, pris.id
$$;

-- inserer_occurrences : ajoute des occurrences en ignorant TOUT conflit (même identifiant, ou même tâche et même jour
-- déjà pris par une occurrence déplacée) : une occurrence existante ou une exception n'est jamais écrasée.
-- Rend les identifiants réellement créés.
create or replace function public.inserer_occurrences(p_lignes jsonb)
returns setof uuid
language sql volatile security definer set search_path = '' as $$
  insert into public.occurrences (id, user_id, tache_id, jour, debut, fin, etat, pause_cumulee_s, exception)
  select (x ->> 'id')::uuid, (x ->> 'user_id')::uuid, (x ->> 'tache_id')::uuid, (x ->> 'jour')::date,
         (x ->> 'debut')::timestamptz, (x ->> 'fin')::timestamptz, 'prevue', 0, false
    from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) x
  on conflict do nothing
  returning id
$$;

-- inserer_rappels : ajoute des rappels en ignorant les conflits (identifiant ou (user_id, cle_unique)).
create or replace function public.inserer_rappels(p_lignes jsonb)
returns setof uuid
language sql volatile security definer set search_path = '' as $$
  insert into public.rappels (id, user_id, type, occurrence_id, rapport_id, envoyer_a, etat, cle_unique, tentatives)
  select (x ->> 'id')::uuid, (x ->> 'user_id')::uuid, x ->> 'type', (x ->> 'occurrence_id')::uuid,
         (x ->> 'rapport_id')::uuid, (x ->> 'envoyer_a')::timestamptz, 'en_attente', x ->> 'cle_unique', 0
    from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) x
  on conflict do nothing
  returning id
$$;

-- annuler_rappels_taches : passe à « annule » les rappels futurs encore en attente des tâches données.
create or replace function public.annuler_rappels_taches(p_taches uuid[])
returns integer
language sql volatile security definer set search_path = '' as $$
  with annules as (
    update public.rappels r set etat = 'annule'
      from public.occurrences o
     where o.id = r.occurrence_id and o.tache_id = any (p_taches)
       and r.etat = 'en_attente' and r.envoyer_a > now()
    returning r.id
  )
  select count(*)::integer from annules
$$;

do $$
declare f text;
begin
  foreach f in array array['public.reserver_rappels(integer)', 'public.inserer_occurrences(jsonb)',
    'public.inserer_rappels(jsonb)', 'public.annuler_rappels_taches(uuid[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
