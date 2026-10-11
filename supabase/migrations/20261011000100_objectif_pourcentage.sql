-- Objectif « x % d'un montant » pour les métriques Montant : le pourcentage et le montant de référence (centimes) sont gardés ;
-- `cible` reste le résultat du calcul, donc toute la progression fonctionne sans changement.
alter table public.metriques add column pourcentage numeric;
alter table public.metriques add column montant_reference bigint;
