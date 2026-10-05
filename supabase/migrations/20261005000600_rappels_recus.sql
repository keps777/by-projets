-- « Quels rappels recevoir » (Réglages, spec §10) : un choix par type de rappel, gardé dans le profil pour que le
-- serveur le respecte (il était seulement sur l'appareil). Un rappel d'un type désactivé est annulé sans être envoyé.

alter table public.profils
  add column recevoir_bloc boolean not null default true,
  add column recevoir_rapport boolean not null default true,
  add column recevoir_recap_semaine boolean not null default true,
  add column recevoir_recap_mois boolean not null default true;

-- reserver_rappels rend en plus « recu » : faux si l'utilisateur a désactivé ce type de rappel.
-- Le type de retour change : il faut supprimer puis recréer la fonction.
drop function public.reserver_rappels(integer);

create function public.reserver_rappels(p_limit integer default 200)
returns table (
  id uuid, user_id uuid, type text, occurrence_id uuid, rapport_id uuid, envoyer_a timestamptz, cle_unique text,
  tentatives integer, titre text, debut timestamptz, fin timestamptz, occ_etat text, bloc_annule boolean,
  rubrique text, titres_visibles boolean, fuseau text, rapport_jour date, recu boolean
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
         rb.nom, pf.titres_visibles, pf.fuseau, ra.jour,
         coalesce(case pris.type
           when 'bloc' then pf.recevoir_bloc
           when 'rapport' then pf.recevoir_rapport
           when 'recap_semaine' then pf.recevoir_recap_semaine
           when 'recap_mois' then pf.recevoir_recap_mois
         end, true)
    from pris
    left join public.occurrences o on o.id = pris.occurrence_id
    left join public.taches t on t.id = o.tache_id
    left join public.projets pj on pj.id = t.projet_id
    left join public.rubriques rb on rb.id = pj.rubrique_id
    left join public.profils pf on pf.id = pris.user_id
    left join public.rapports ra on ra.id = pris.rapport_id
   order by pris.envoyer_a, pris.id
$$;

revoke all on function public.reserver_rappels(integer) from public, anon, authenticated;
grant execute on function public.reserver_rappels(integer) to service_role;
