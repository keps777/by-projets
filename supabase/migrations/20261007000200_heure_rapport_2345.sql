-- Le rapport du soir est proposé à 23:45 par défaut (modifiable dans Réglages › Notifications).
-- Les profils restés sur l'ancien défaut (21:15) passent à 23:45 ; un horaire choisi par l'utilisateur n'est pas touché.
alter table public.profils alter column heure_rapport set default '23:45';
update public.profils set heure_rapport = '23:45' where heure_rapport = '21:15';
