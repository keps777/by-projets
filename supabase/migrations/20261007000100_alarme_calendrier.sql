-- Alarmes (rappels insistants) et calendrier de l'iPhone.
--  · taches.alarme : le rappel le plus proche du début est répété (toutes les 2 min, 5 fois) tant que le bloc n'est ni lancé, ni fait, ni reporté.
--  · profils.alarme_defaut : valeur proposée à l'ajout d'une tâche.
--  · profils.jeton_calendrier : secret du lien d'abonnement au calendrier (fonction « calendrier ») ; régénérable depuis les Réglages.
alter table public.taches add column alarme boolean not null default false;
alter table public.profils
  add column alarme_defaut boolean not null default false,
  add column jeton_calendrier text check (jeton_calendrier is null or length(jeton_calendrier) >= 32);
create unique index profils_jeton_calendrier_idx on public.profils (jeton_calendrier) where jeton_calendrier is not null;
