-- Règles d'accès par ligne (spec §11) : chaque utilisateur ne lit et n'écrit que ses lignes.
-- Le rôle anon n'a aucun droit. Le rôle service_role (fonctions serveur) contourne les règles (BYPASSRLS).
-- Pour les tables enfants, l'écriture vérifie aussi que la ligne parente appartient au même utilisateur :
-- les clés étrangères ignorent les règles d'accès, sans cette vérification on pourrait se rattacher aux données d'autrui.

do $$
declare
  t text;
  col text;
  parent text;
  ecriture text;
  -- table -> { colonne : table parente }
  parents constant jsonb := '{
    "projets":        {"rubrique_id": "rubriques"},
    "sous_projets":   {"projet_id": "projets"},
    "metriques":      {"sous_projet_id": "sous_projets"},
    "taches":         {"projet_id": "projets"},
    "tache_alimente": {"tache_id": "taches", "sous_projet_id": "sous_projets"},
    "tache_attendus": {"tache_id": "taches"},
    "occurrences":    {"tache_id": "taches"},
    "saisies":        {"projet_id": "projets", "occurrence_id": "occurrences"},
    "saisie_valeurs": {"saisie_id": "saisies"},
    "points_rapport": {"projet_id": "projets"},
    "rappels":        {"occurrence_id": "occurrences", "rapport_id": "rapports"}
  }';
begin
  foreach t in array array['profils', 'rubriques', 'projets', 'sous_projets', 'metriques', 'taches', 'tache_alimente',
    'tache_attendus', 'occurrences', 'saisies', 'saisie_valeurs', 'points_rapport', 'presets_export', 'rapports', 'rappels',
    'abonnements_push'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);

    ecriture := 'user_id = (select auth.uid())';
    for col, parent in select key, value from jsonb_each_text(parents -> t) loop
      ecriture := ecriture || format(
        ' and (%1$I.%2$I is null or exists (select 1 from public.%3$I p where p.id = %1$I.%2$I and p.user_id = (select auth.uid())))',
        t, col, parent);
    end loop;
    if t = 'presets_export' then
      -- Chaque point listé doit appartenir à l'utilisateur.
      ecriture := ecriture || ' and not exists (select 1 from unnest(presets_export.points) x(id)'
        || ' where not exists (select 1 from public.points_rapport p where p.id = x.id and p.user_id = (select auth.uid())))';
    end if;

    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_lire', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_creer', t, ecriture);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (%s)',
      t || '_modifier', t, ecriture);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_supprimer', t);
  end loop;
end $$;

-- Fonction de déclencheur : jamais appelée directement.
revoke all on function public.horodater() from public, anon, authenticated;
