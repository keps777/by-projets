// Accès à la base pour generer-rapports, par le client Supabase de service (reçu en paramètre).
// La clé de service contourne les règles d'accès : chaque lecture filtre donc explicitement sur user_id.
import { verifier, type Client } from '../_shared/supabase.ts';
import type { LectureLivre, MetriqueLigne, PointRapportLigne, Saisie, SaisieValeur, SousProjetLigne } from '../_shared/core/index.ts';
import type { DepotRapports, ProfilRapport } from './logique.ts';

export function depotRapports(sb: Client): DepotRapports {
  return {
    async profils() {
      const r = await sb.from('profils').select('id, fuseau, heure_rapport').is('supprime_le', null);
      return verifier(r, 'profils') as ProfilRapport[];
    },
    async rapportExiste(userId, jour) {
      const r = await sb.from('rapports').select('id').eq('user_id', userId).eq('jour', jour).is('supprime_le', null).limit(1);
      return (verifier(r, 'rapports') as unknown[]).length > 0;
    },
    async donnees(userId, jour) {
      const base = (table: string) => sb.from(table).select('*').eq('user_id', userId).is('supprime_le', null);
      const saisies = verifier(await base('saisies').eq('jour', jour), 'saisies') as Saisie[];
      const ids = saisies.map((s) => s.id);
      // Pages lues par livre : tous les jours jusqu'à celui du rapport (le cumul), avec le projet de la saisie.
      const brutes = verifier(await sb.from('saisie_valeurs').select('cle, valeur_num, saisies!inner(jour, projet_id, supprime_le)').eq('user_id', userId)
        .is('supprime_le', null).like('cle', 'livre:%').is('saisies.supprime_le', null).lte('saisies.jour', jour), 'saisie_valeurs (livres)') as unknown as
        { cle: string; valeur_num: number | null; saisies: { jour: string; projet_id: string } | { jour: string; projet_id: string }[] }[];
      const lectures = brutes.map((b) => { const s = Array.isArray(b.saisies) ? b.saisies[0] : b.saisies; return { cle: b.cle, jour: s.jour, valeur: Number(b.valeur_num ?? 0), projet_id: s.projet_id }; }) as (LectureLivre & { projet_id: string })[];
      return {
        lectures,
        points: verifier(await base('points_rapport').eq('actif', true), 'points_rapport') as PointRapportLigne[],
        sousProjets: verifier(await base('sous_projets'), 'sous_projets') as SousProjetLigne[],
        metriques: verifier(await base('metriques'), 'metriques') as MetriqueLigne[],
        saisies,
        valeurs: ids.length ? (verifier(await base('saisie_valeurs').in('saisie_id', ids), 'saisie_valeurs') as SaisieValeur[]) : []
      };
    },
    async insererRapport(rapport) {
      verifier(await sb.from('rapports').upsert(rapport, { onConflict: 'id', ignoreDuplicates: true }), 'rapports');
    },
    async insererRappels(lignes) {
      return verifier(await sb.rpc('inserer_rappels', { p_lignes: lignes }), 'inserer_rappels') as string[];
    }
  };
}
