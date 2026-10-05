-- Le Carnet (spec §18) : un livre de notes numérotées, une page par jour. Table 17 du contrat lignes.ts.
create table public.notes (
  id uuid primary key,
  jour date not null,
  texte text not null,
  numero integer not null check (numero >= 1),
  origine text not null check (origine in ('libre', 'focus', 'bloc', 'saisie')),
  heure integer check (heure is null or (heure >= 0 and heure < 1440)),
  occurrence_id uuid references public.occurrences (id) on delete set null,
  projet_id uuid references public.projets (id) on delete set null,
  source_label text
);

alter table public.notes
  add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column supprime_le timestamptz;

create trigger horodater before insert or update on public.notes for each row execute function public.horodater();
create index notes_sync_idx on public.notes (user_id, updated_at);
create index notes_jour_idx on public.notes (user_id, jour);

alter table public.notes enable row level security;
alter table public.notes force row level security;
revoke all on public.notes from public, anon, authenticated;
grant select, insert, update, delete on public.notes to authenticated, service_role;

-- Écriture : propriétaire, et parents (bloc, projet) du même propriétaire.
create policy notes_lire on public.notes for select to authenticated using (user_id = (select auth.uid()));
create policy notes_creer on public.notes for insert to authenticated with check (
  user_id = (select auth.uid())
  and (occurrence_id is null or exists (select 1 from public.occurrences p where p.id = notes.occurrence_id and p.user_id = (select auth.uid())))
  and (projet_id is null or exists (select 1 from public.projets p where p.id = notes.projet_id and p.user_id = (select auth.uid())))
);
create policy notes_modifier on public.notes for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid())
  and (occurrence_id is null or exists (select 1 from public.occurrences p where p.id = notes.occurrence_id and p.user_id = (select auth.uid())))
  and (projet_id is null or exists (select 1 from public.projets p where p.id = notes.projet_id and p.user_id = (select auth.uid())))
);
create policy notes_supprimer on public.notes for delete to authenticated using (user_id = (select auth.uid()));
