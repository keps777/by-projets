// tester-notification : appelée par l'app (Réglages → Envoyer une notification de test) avec le jeton de l'utilisateur.
// Pas de secret partagé ici : l'identité vient du jeton, vérifié par Supabase Auth ; seuls les appareils de cet utilisateur reçoivent l'envoi.
import { clientAdmin } from '../_shared/supabase.ts';
import { clesVapidDeLEnvironnement, envoyeurWebPush } from '../_shared/push.ts';
import { depotTest } from './depot.ts';
import { envoyerTest } from './logique.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, erreur: 'Méthode non permise.' }, 405);
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jeton) return json({ ok: false, erreur: 'Connexion requise.' }, 401);
  try {
    const sb = clientAdmin();
    const { data, error } = await sb.auth.getUser(jeton);
    if (error || !data.user) return json({ ok: false, erreur: 'Connexion requise.' }, 401);
    const bilan = await envoyerTest(data.user.id, depotTest(sb), envoyeurWebPush(clesVapidDeLEnvironnement()));
    return json({ ok: true, ...bilan });
  } catch (e) {
    console.error('Échec du test de notification :', e instanceof Error ? e.message : String(e));
    return json({ ok: false, erreur: 'Erreur interne.' }, 500);
  }
});
