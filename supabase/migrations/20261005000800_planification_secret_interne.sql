-- Secret partagé entre pg_cron et les fonctions serveur, créé DANS la base : sa valeur ne transite jamais hors de
-- Postgres (ni terminal, ni chat, ni tableau de bord). Les fonctions serveur le lisent par public.secret_cron(),
-- réservée à la clé de service. Remplace le secret CRON_SECRET des fonctions, qui n'est plus nécessaire.
-- Nom en « planification » : non exécuté par les tests PGlite (pas de supabase_vault).

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'cron_secret');
  end if;
end $$;

create or replace function public.secret_cron()
returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
$$;

revoke all on function public.secret_cron() from public, anon, authenticated;
grant execute on function public.secret_cron() to service_role;
