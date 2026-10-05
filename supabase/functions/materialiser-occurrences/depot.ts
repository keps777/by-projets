// Accès à la base pour materialiser-occurrences, par le client Supabase de service (reçu en paramètre).
import { verifier, type Client } from '../_shared/supabase.ts';
import type { DepotOccurrences, OccurrenceExistante, TacheSource } from './logique.ts';

export function depotOccurrences(sb: Client): DepotOccurrences {
  return {
    async fuseaux(userId) {
      let q = sb.from('profils').select('id, fuseau').is('supprime_le', null);
      if (userId) q = q.eq('id', userId);
      const lignes = verifier(await q, 'profils') as { id: string; fuseau: string }[];
      return new Map(lignes.map((p) => [p.id, p.fuseau]));
    },
    async taches(filtre) {
      let q = sb.from('taches').select('id, user_id, regle, heure_debut, duree_min, rappel_min, rappels_avant_min, actif, supprime_le');
      if (filtre.user_id) q = q.eq('user_id', filtre.user_id);
      if (filtre.tache_id) q = q.eq('id', filtre.tache_id);
      return verifier(await q, 'taches') as TacheSource[];
    },
    async insererOccurrences(lignes) {
      return verifier(await sb.rpc('inserer_occurrences', { p_lignes: lignes }), 'inserer_occurrences') as string[];
    },
    async occurrences(ids) {
      const r = await sb.from('occurrences').select('id, user_id, tache_id, debut, etat, supprime_le').in('id', ids);
      return verifier(r, 'occurrences') as OccurrenceExistante[];
    },
    async insererRappels(lignes) {
      return verifier(await sb.rpc('inserer_rappels', { p_lignes: lignes }), 'inserer_rappels') as string[];
    },
    async annulerRappels(tacheIds) {
      return verifier(await sb.rpc('annuler_rappels_taches', { p_taches: tacheIds }), 'annuler_rappels_taches') as number;
    }
  };
}
