// envoyer-rappels : appelée chaque minute par pg_cron. Envoie les notifications des rappels dus (spec §10).
import { servir } from '../_shared/http.ts';
import { clientAdmin } from '../_shared/supabase.ts';
import { clesVapidDeLEnvironnement, envoyeurWebPush } from '../_shared/push.ts';
import { depotRappels } from './depot.ts';
import { envoyerRappels } from './logique.ts';

Deno.serve(servir(Deno.env.get('CRON_SECRET'), async () => {
  const bilan = await envoyerRappels(depotRappels(clientAdmin()), envoyeurWebPush(clesVapidDeLEnvironnement()), 200);
  return { bilan };
}));
