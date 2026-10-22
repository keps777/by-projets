-- Schéma cible d'AssureMe (NON appliqué : l'app tourne aujourd'hui sur un backend simulé en localStorage).
-- Il décrit la migration prévue vers Supabase/Postgres. Montants en FCFA (entiers), dates en UTC.
create extension if not exists pgcrypto;

create type niveau as enum ('START','PLUS','PRO','ELITE');
create type pass as enum ('essentiel','famille','premium');
create type produit as enum ('ecole','logement','auto','solaire','commerce','sante');

create table comptes (
  id uuid primary key references auth.users on delete cascade,
  prenom text not null, nom text not null, telephone text unique not null check (telephone ~ '^[62][0-9]{8}$'),
  ville text, quartier text, employeur_id uuid, salaire_net integer not null check (salaire_net >= 0), jour_paie smallint not null check (jour_paie between 1 and 28),
  pass pass not null default 'famille', numero_membre text unique not null, cree_le timestamptz not null default now()
);
create table appareils (id uuid primary key default gen_random_uuid(), compte_id uuid not null references comptes on delete cascade, nom text, lieu text, biometrie boolean default false, vu_le timestamptz default now());
create table mouvements (id uuid primary key default gen_random_uuid(), compte_id uuid not null references comptes on delete cascade, ts timestamptz not null default now(), titre text not null, sous text, montant integer not null, categorie text not null);
create table notifications (id uuid primary key default gen_random_uuid(), compte_id uuid not null references comptes on delete cascade, ts timestamptz not null default now(), titre text not null, sous text, lu boolean default false, lien text);
create table credits (
  id uuid primary key default gen_random_uuid(), compte_id uuid not null references comptes on delete cascade, produit produit not null,
  libelle text not null, capital integer not null, mensualite integer not null, duree smallint not null, payees smallint not null default 0,
  prochaine date, statut text not null default 'actif' check (statut in ('actif','termine','reporte'))
);
create table scores (compte_id uuid primary key references comptes on delete cascade, valeur smallint not null check (valeur between 400 and 900), signaux jsonb not null default '{}', historique jsonb not null default '[]');
create table coffres (id uuid primary key default gen_random_uuid(), compte_id uuid not null references comptes on delete cascade, genre text not null, nom text not null, objectif integer not null, epargne integer not null default 0, versement integer not null default 0, cree_le timestamptz default now());
create table partenaires (id uuid primary key default gen_random_uuid(), type text not null check (type in ('hopital','ecole','concession','entreprise','commerce')), nom text not null, ville text, lat double precision, lng double precision);

-- Règle des 33 % : appliquée côté serveur dans la fonction qui crée un crédit, jamais seulement côté client.
create function total_mensualites(c uuid) returns integer language sql stable as
  $$ select coalesce(sum(mensualite),0)::int from credits where compte_id = c and statut = 'actif' $$;
create function creer_credit_si_autorise(c uuid, p produit, lib text, cap integer, mens integer, duree smallint) returns uuid language plpgsql security definer as $$
declare salaire integer; nouveau uuid;
begin
  select salaire_net into salaire from comptes where id = c;
  if total_mensualites(c) + mens > floor(salaire * 0.33) then raise exception 'plafond_endettement_depasse'; end if;
  insert into credits(compte_id, produit, libelle, capital, mensualite, duree) values (c, p, lib, cap, mens, duree) returning id into nouveau;
  return nouveau;
end $$;

-- Accès : chaque membre ne voit que ses lignes.
alter table comptes enable row level security; alter table appareils enable row level security; alter table mouvements enable row level security;
alter table notifications enable row level security; alter table credits enable row level security; alter table scores enable row level security; alter table coffres enable row level security;
create policy "comptes_soi" on comptes for all using (id = auth.uid()) with check (id = auth.uid());
create policy "appareils_soi" on appareils for all using (compte_id = auth.uid());
create policy "mouvements_lecture" on mouvements for select using (compte_id = auth.uid());
create policy "notifications_soi" on notifications for all using (compte_id = auth.uid());
create policy "credits_lecture" on credits for select using (compte_id = auth.uid());
create policy "scores_lecture" on scores for select using (compte_id = auth.uid());
create policy "coffres_soi" on coffres for all using (compte_id = auth.uid());
-- Les écritures de mouvements, crédits et scores passent par des fonctions serveur (security definer), jamais par le client.
