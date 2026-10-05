// generer-rapports : appelée chaque minute par pg_cron. Produit le rapport du soir à l'heure locale de chaque profil,
// avec son rappel « Ton rapport est prêt », et les rappels de récapitulatif de la semaine et du mois (spec §9, §10).
import { servir } from '../_shared/http.ts';
import { clientAdmin, secretCron } from '../_shared/supabase.ts';
import { depotRapports } from './depot.ts';
import { genererRapports } from './logique.ts';

Deno.serve(servir(secretCron, async () => ({ bilan: await genererRapports(depotRapports(clientAdmin())) })));
