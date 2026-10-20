-- Corrections locales à un sous-projet : une saisie dont `sous_projet_id` est renseigné n'est comptée que par ce sous-projet
-- (jamais par les autres sous-projets du projet, ni par le rapport). Sert à corriger un jour depuis l'onglet Suivi
-- sans toucher à la saisie partagée (blocs, chronos, rapport). Pas de clé étrangère : si le sous-projet disparaît, la saisie n'est plus lue par personne.
alter table public.saisies add column sous_projet_id uuid;
