-- Plusieurs rappels par tâche : en plus du rappel principal (rappel_min), des rappels plus tôt (en minutes avant le début :
-- 60 = 1 h, 120 = 2 h, 1440 = la veille, 1560 = la veille et 2 h, 2880 = deux jours avant…).
alter table public.taches
  add column rappels_avant_min integer[] not null default '{}'::integer[],
  add constraint taches_rappels_avant_positifs check (0 <= all (rappels_avant_min));
