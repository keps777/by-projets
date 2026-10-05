// Lectures et écritures des rapports à partir du magasin (à appeler dans $derived : elles lisent `magasin.lignes`).
import { uuidDeterministe } from '@core/ids.ts';
import type { RapportLigne } from '@core/lignes.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { profil } from '../../data/requetes.ts';
import type { ContenuRapport, DonneesRapport } from './calcul.ts';

export function donneesRapport(): DonneesRapport {
  const l = magasin.lignes;
  return { points: l.points_rapport, sousProjets: l.sous_projets, metriques: l.metriques, saisies: l.saisies, valeurs: l.saisie_valeurs, projets: l.projets, rubriques: l.rubriques };
}

/** Identifiant stable du rapport d'un jour : un seul rapport par jour, même créé sur deux appareils. */
// Même formule que generer-rapports côté serveur : l'app et le serveur n'écrivent jamais deux rapports pour un même jour.
export const idRapport = (jour: Jour) => uuidDeterministe(`rapport:${profil()?.id}:${jour}`);

export function rapportDuJour(jour: Jour): RapportLigne | undefined {
  const l = magasin.lignes.rapports.filter((r) => r.jour === jour);
  return l.find((r) => r.id === idRapport(jour)) ?? l.sort((a, b) => (a.maj_a < b.maj_a ? 1 : -1))[0];
}

/** Enregistre le rapport du jour tel qu'il vient d'être partagé, et le marque « envoyé ». */
export function marquerEnvoye(jour: Jour, contenu: ContenuRapport): void {
  if (!magasin.userId) return;
  const existant = rapportDuJour(jour);
  const maintenant = new Date().toISOString();
  magasin.ecrire('rapports', { id: existant?.id ?? idRapport(jour), jour, contenu, genere_a: existant?.genere_a ?? maintenant, maj_a: maintenant, envoye_a: maintenant });
}

/** Rapports enregistrés, du plus récent au plus ancien. */
export const rapportsEnregistres = (): RapportLigne[] => [...magasin.lignes.rapports].sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));

/** Jour le plus ancien qui peut avoir un rapport : première saisie, premier rapport ou création du profil. */
export function premierJour(aujourdhui: Jour): Jour {
  const l = magasin.lignes;
  let min = l.profils[0]?.created_at?.slice(0, 10) ?? aujourdhui;
  for (const s of l.saisies) if (s.jour < min) min = s.jour;
  for (const r of l.rapports) if (r.jour < min) min = r.jour;
  return min > aujourdhui ? aujourdhui : min;
}
