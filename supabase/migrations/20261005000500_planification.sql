-- Planification (architecture §2) : pg_cron appelle les fonctions serveur par HTTP (pg_net).
-- L'adresse du projet et le secret partagé sont lus dans supabase_vault. À lancer UNE FOIS dans l'éditeur SQL
-- (remplacer les valeurs ; ne jamais les écrire dans le dépôt) :
--   select vault.create_secret('https://<ref-du-projet>.supabase.co', 'project_url');
--   select vault.create_secret('<la même valeur que le secret CRON_SECRET des fonctions>', 'cron_secret');
-- Ce fichier n'est pas exécuté par les tests (PGlite n'a ni pg_cron ni pg_net).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.appeler_fonction(p_nom text, p_corps jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'appeler_fonction : secrets project_url ou cron_secret absents du coffre (vault).';
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_nom,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := p_corps,
    timeout_milliseconds := 30000
  );
end $$;

revoke all on function public.appeler_fonction(text, jsonb) from public, anon, authenticated;

-- cron.schedule remplace une tâche de même nom : ce fichier peut être rejoué.
select cron.schedule('envoyer-rappels', '* * * * *', $$select public.appeler_fonction('envoyer-rappels')$$);
select cron.schedule('generer-rapports', '* * * * *', $$select public.appeler_fonction('generer-rapports')$$);
select cron.schedule('materialiser-occurrences', '0 3 * * *', $$select public.appeler_fonction('materialiser-occurrences', '{"jours": 90}'::jsonb)$$);
