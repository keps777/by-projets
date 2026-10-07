-- Plusieurs métriques peuvent piloter ensemble la barre d'un sous-projet (la barre est la moyenne de leurs progressions).
-- metrique_pilote_id reste la pilote principale ; metriques_pilotes liste toutes les pilotes (vide : la seule principale).
alter table public.sous_projets add column metriques_pilotes uuid[] not null default '{}'::uuid[];
