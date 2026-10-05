// Accès à la base pour envoyer-rappels, par le client Supabase de service (reçu en paramètre).
import { verifier, type Client } from '../_shared/supabase.ts';
import type { Abonnement, DepotRappels, RappelReserve } from './logique.ts';

export function depotRappels(sb: Client): DepotRappels {
  return {
    async reserver(limite) {
      return verifier(await sb.rpc('reserver_rappels', { p_limit: limite }), 'reserver_rappels') as RappelReserve[];
    },
    async abonnements(userIds) {
      const r = await sb.from('abonnements_push').select('id, user_id, endpoint, cle_p256dh, cle_auth')
        .in('user_id', userIds).is('supprime_le', null);
      return verifier(r, 'abonnements_push') as Abonnement[];
    },
    async marquerRappel(id, etat, erreur) {
      verifier(await sb.from('rappels').update({ etat, erreur }).eq('id', id), 'rappels');
    },
    async abonnementReussi(id, quand) {
      verifier(await sb.from('abonnements_push').update({ dernier_succes: quand }).eq('id', id), 'abonnements_push');
    },
    async abonnementMort(id, quand) {
      verifier(await sb.from('abonnements_push').update({ supprime_le: quand }).eq('id', id), 'abonnements_push');
    }
  };
}
