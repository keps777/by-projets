// Accès à la base pour calendrier : le jeton du lien identifie l'utilisateur.
import { verifier, type Client } from '../_shared/supabase.ts';
import { alertesDuBloc, JOURS_APRES, JOURS_AVANT, type EvenementCalendrier, type TacheCalendrier } from './logique.ts';

export async function evenementsDuJeton(sb: Client, jeton: string, maintenant: Date): Promise<EvenementCalendrier[] | null> {
  const profils = verifier(await sb.from('profils').select('id, titres_visibles').eq('jeton_calendrier', jeton).is('supprime_le', null).limit(1), 'profils') as { id: string; titres_visibles: boolean }[];
  const profil = profils[0];
  if (!profil) return null;
  const de = new Date(maintenant.getTime() - JOURS_AVANT * 86_400_000).toISOString();
  const a = new Date(maintenant.getTime() + JOURS_APRES * 86_400_000).toISOString();
  const occs = verifier(await sb.from('occurrences').select('id, tache_id, debut, fin, etat').eq('user_id', profil.id).is('supprime_le', null)
    .neq('etat', 'ignoree').gte('debut', de).lte('debut', a).order('debut').limit(2000), 'occurrences') as { id: string; tache_id: string; debut: string; fin: string; etat: string }[];
  if (!occs.length) return [];
  const taches = verifier(await sb.from('taches').select('id, titre, projet_id, rappel_min, rappels_avant_min, alarme, actif').eq('user_id', profil.id).is('supprime_le', null), 'taches') as
    (TacheCalendrier & { id: string; projet_id: string | null; actif: boolean })[];
  const projets = verifier(await sb.from('projets').select('id, nom, rubrique_id').eq('user_id', profil.id), 'projets') as { id: string; nom: string; rubrique_id: string }[];
  const rubriques = verifier(await sb.from('rubriques').select('id, nom').eq('user_id', profil.id), 'rubriques') as { id: string; nom: string }[];
  const parTache = new Map(taches.filter((t) => t.actif).map((t) => [t.id, t]));
  const res: EvenementCalendrier[] = [];
  for (const o of occs) {
    const t = parTache.get(o.tache_id);
    if (!t) continue;
    const projet = projets.find((p) => p.id === t.projet_id);
    const rubrique = rubriques.find((r) => r.id === projet?.rubrique_id);
    res.push({
      uid: o.id, debut: o.debut, fin: o.fin, titre: t.titre,
      detail: [rubrique?.nom, projet?.nom].filter(Boolean).join(' · ') || null,
      alertes: alertesDuBloc(o.etat, t)
    });
  }
  return res;
}
