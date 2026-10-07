// calendrier : lien d'abonnement du calendrier de l'iPhone (Réglages → Calendrier de l'iPhone).
// Pas de connexion possible dans un abonnement de calendrier : le secret est le jeton du lien (régénérable dans l'app).
import { clientAdmin } from '../_shared/supabase.ts';
import { evenementsDuJeton } from './depot.ts';
import { construireCalendrier, jetonValide } from './logique.ts';

const REFUS = () => new Response('Lien invalide ou remplacé.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Méthode non permise.', { status: 405 });
  const jeton = new URL(req.url).searchParams.get('jeton');
  if (!jetonValide(jeton)) return REFUS();
  try {
    const maintenant = new Date();
    const evenements = await evenementsDuJeton(clientAdmin(), jeton, maintenant);
    if (!evenements) return REFUS();
    return new Response(req.method === 'HEAD' ? null : construireCalendrier(evenements, maintenant), {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'inline; filename="luther-life.ics"' }
    });
  } catch (e) {
    console.error('Échec du calendrier :', e instanceof Error ? e.message : String(e));
    return new Response('Erreur interne.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
});
