// Accès à la base pour tester-notification (client de service reçu en paramètre).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { verifier } from '../_shared/supabase.ts';
import type { AbonnementTest, DepotTest } from './logique.ts';

export function depotTest(sb: SupabaseClient): DepotTest {
  return {
    async abonnements(userId) {
      const r = await sb.from('abonnements_push').select('id, endpoint, cle_p256dh, cle_auth, appareil').eq('user_id', userId).is('supprime_le', null);
      return verifier(r, 'abonnements_push') as AbonnementTest[];
    },
    async retirer(ids) {
      verifier(await sb.from('abonnements_push').update({ supprime_le: new Date().toISOString() }).in('id', ids), 'abonnements_push');
    }
  };
}
