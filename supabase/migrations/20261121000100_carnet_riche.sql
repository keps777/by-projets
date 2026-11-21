-- Notes riches du Carnet (spec §18, nov. 2026) : contenu HTML nettoyé, et médias (images, vidéos) dans un bucket privé « carnet ».
-- Additif : une colonne facultative et un bucket ; rien n'est modifié ni supprimé.

alter table public.notes add column if not exists contenu text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carnet', 'carnet', false, 52428800,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Un média n'est lisible, écrit, remplacé ou supprimé que par son propriétaire : le premier dossier du chemin est son identifiant.
drop policy if exists carnet_lire on storage.objects;
drop policy if exists carnet_creer on storage.objects;
drop policy if exists carnet_modifier on storage.objects;
drop policy if exists carnet_supprimer on storage.objects;
create policy carnet_lire on storage.objects for select to authenticated
  using (bucket_id = 'carnet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy carnet_creer on storage.objects for insert to authenticated
  with check (bucket_id = 'carnet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy carnet_modifier on storage.objects for update to authenticated
  using (bucket_id = 'carnet' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'carnet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy carnet_supprimer on storage.objects for delete to authenticated
  using (bucket_id = 'carnet' and (storage.foldername(name))[1] = (select auth.uid())::text);
