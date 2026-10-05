// « Quels rappels recevoir » : un choix par type de rappel, gardé dans le profil (colonnes recevoir_*) pour que le
// serveur le respecte. Les choix faits avant ces colonnes (gardés sur l'appareil) sont repris une fois, puis oubliés.
import type { Profil } from '@core/lignes.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { majProfil } from '../../data/actions/reglages.ts';

export type TypeRappelChoisi = 'bloc' | 'rapport' | 'recap_semaine' | 'recap_mois';
export type ChoixRappels = Record<TypeRappelChoisi, boolean>;

const ANCIENNE_CLE = 'luther-life:rappels-recus';
const colonne = (t: TypeRappelChoisi) => `recevoir_${t}` as const satisfies keyof Profil;

/** Choix du profil (vrai par défaut, y compris pour un profil enregistré avant ces colonnes). */
export function choixRappels(p: Partial<Profil> | undefined): ChoixRappels {
  return { bloc: p?.recevoir_bloc ?? true, rapport: p?.recevoir_rapport ?? true, recap_semaine: p?.recevoir_recap_semaine ?? true, recap_mois: p?.recevoir_recap_mois ?? true };
}

/** Reprend une seule fois les choix gardés sur l'appareil par l'ancienne version. */
export function reprendreAnciensChoix(): void {
  let brut: string | null = null;
  try { brut = localStorage.getItem(ANCIENNE_CLE); } catch { return; }
  if (!brut || !magasin.lignes.profils[0]) return;
  try {
    const ancien = JSON.parse(brut) as Partial<ChoixRappels>;
    const patch: Partial<Profil> = {};
    for (const t of ['bloc', 'rapport', 'recap_semaine', 'recap_mois'] as const) if (typeof ancien[t] === 'boolean') patch[colonne(t)] = ancien[t];
    if (Object.keys(patch).length) majProfil(patch);
  } catch { /* contenu illisible : on l'oublie */ }
  try { localStorage.removeItem(ANCIENNE_CLE); } catch { /* stockage indisponible */ }
}

export const rappelsRecus = {
  get choix(): ChoixRappels { return choixRappels(magasin.lignes.profils[0]); },
  basculer(t: TypeRappelChoisi): void { majProfil({ [colonne(t)]: !this.choix[t] }); }
};
