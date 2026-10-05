-- Corrections de la synchronisation (spec §13) et fermeture automatique des inscriptions (spec §11).

-- 1. Reporter une occurrence sur un jour qui a déjà son bloc régulier (ex. le bloc quotidien d'aujourd'hui reporté à
--    demain) est permis : la série reste intacte (spec §7.2). L'unicité (tâche, jour) refusait cette ligne et bloquait
--    toute la file d'envoi de l'appareil. L'identifiant déterministe (tâche + jour d'origine) suffit contre les doublons.
alter table public.occurrences drop constraint occurrences_tache_id_jour_key;
create index occurrences_tache_jour_idx on public.occurrences (tache_id, jour);

-- 2. Une suppression l'emporte sur une modification plus ancienne (spec §13). L'appareil envoie l'heure de SA
--    modification dans updated_at : si elle précède la suppression, la ligne reste supprimée (un appareil resté hors
--    ligne ne ressuscite pas une ligne effacée ailleurs). Une recréation volontaire, plus récente, reste possible.
create or replace function public.horodater() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Le propriétaire (user_id) d’une ligne ne peut pas changer.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    if old.supprime_le is not null and new.supprime_le is null and new.updated_at < old.supprime_le then
      new.supprime_le := old.supprime_le;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.horodater() from public, anon, authenticated;

-- 3. Un seul compte : toute inscription après la première est refusée par la base elle-même, même si l'option
--    « Allow new users to sign up » est restée ouverte dans Supabase.
create or replace function public.un_seul_compte() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Les inscriptions sont fermées : ce projet a déjà son compte.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.un_seul_compte() from public, anon, authenticated;

create trigger un_seul_compte before insert on auth.users
  for each row execute function public.un_seul_compte();
