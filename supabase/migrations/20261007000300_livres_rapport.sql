-- Livres d'un point du rapport (CL · littérature chrétienne) : titre, auteur, pages au total, pages déjà lues.
-- Les pages lues chaque jour sont des valeurs de saisie dont la clé est « livre:<id> ».
alter table public.points_rapport add column livres jsonb not null default '[]'::jsonb check (jsonb_typeof(livres) = 'array');
