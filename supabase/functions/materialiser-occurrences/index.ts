// materialiser-occurrences : chaque nuit (pg_cron, 03:00 UTC) ou à la demande, avec un corps JSON facultatif
// { user_id?, tache_id?, jours?: 90 }. Crée les occurrences et rappels à venir, annule ceux des tâches retirées.
import { lireCorps, servir } from '../_shared/http.ts';
import { clientAdmin, secretCron } from '../_shared/supabase.ts';
import { depotOccurrences } from './depot.ts';
import { materialiser, type FiltreMaterialisation } from './logique.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(servir(secretCron, async (req) => {
  const corps = await lireCorps<FiltreMaterialisation>(req);
  const filtre: FiltreMaterialisation = {
    user_id: typeof corps.user_id === 'string' && UUID.test(corps.user_id) ? corps.user_id : undefined,
    tache_id: typeof corps.tache_id === 'string' && UUID.test(corps.tache_id) ? corps.tache_id : undefined,
    jours: typeof corps.jours === 'number' ? corps.jours : undefined
  };
  const bilan = await materialiser(depotOccurrences(clientAdmin()), filtre);
  return { bilan: { ...bilan, erreurs: bilan.erreurs.length } };
}));
