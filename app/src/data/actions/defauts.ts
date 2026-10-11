// Sous-projets présents par défaut (créés une fois, au premier démarrage qui les voit manquer).
import { uuidDeterministe } from '@core/ids.ts';
import { premierDuMois } from '@core/dates.ts';
import { cleMetrique } from '@core/metriques.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../magasin.svelte.ts';
import { FICHE_VIDE } from './projets.ts';

export const NOM_FINANCES_DU_MOIS = 'Gestion de mes finances du mois';
const CLE_FAIT = 'luther-life:defauts:finances-du-mois';

/**
 * « Gestion de mes finances du mois » dans le projet « La gestion de mes finances » : entrées, sorties et épargne, sans date de fin
 * (les objectifs sont mensuels, donc le sous-projet suit chaque mois). Identifiants déterministes : deux appareils ne le créent pas en double.
 * Une fois créé (ou trouvé, ou supprimé par l'utilisateur), il n'est plus recréé sur cet appareil.
 */
export function assurerFinancesDuMois(aujourdhui: Jour): void {
  try { if (localStorage.getItem(CLE_FAIT)) return; } catch { /* stockage indisponible : l'identifiant déterministe évite le doublon */ }
  const projet = magasin.lignes.projets.find((p) => p.numero === 16);
  if (!projet) return;
  const marquer = () => { try { localStorage.setItem(CLE_FAIT, '1'); } catch { /* sans importance */ } };
  const id = uuidDeterministe(`defaut:finances-du-mois:${projet.id}`);
  if (magasin.trouver('sous_projets', id) || magasin.lignes.sous_projets.some((s) => s.projet_id === projet.id && /finances du mois/i.test(s.nom))) { marquer(); return; }

  const mesures: { nom: string; sens: 'plus' | 'moins' }[] = [{ nom: 'Entrées', sens: 'plus' }, { nom: 'Sorties', sens: 'moins' }, { nom: 'Épargne', sens: 'plus' }];
  magasin.ecrire('sous_projets', {
    id, projet_id: projet.id, nom: NOM_FINANCES_DU_MOIS, debut: premierDuMois(aujourdhui.slice(0, 7)), fin: null, statut: 'en_cours',
    metrique_pilote_id: null, metriques_pilotes: [], reprise_passe: true, fiche: { ...FICHE_VIDE, quoi: 'Suivre mes entrées, mes sorties et mon épargne, mois après mois.' }, bilan: null, termine_le: null
  });
  mesures.forEach((m, i) => magasin.ecrire('metriques', {
    id: uuidDeterministe(`defaut:finances-du-mois:${id}:${m.nom}`), sous_projet_id: id, cle: cleMetrique('montant', '$', m.nom), type: 'montant', nom: m.nom, unite: '$',
    cible: null, periode_cible: 'mois', sens: m.sens, options: null, dans_rapport: false, ordre: i, pourcentage: null, montant_reference: null
  }));
  marquer();
}
