// Lecture du réseau : bus en route, état et prochain départ de chaque ligne. Fonctions de lecture du monde (réactives si appelées dans un $derived).
import { app, maintenant } from '../../data/store.svelte.ts';
import { aujourdhui } from '../../data/horloge.ts';
import { ajouterJours } from '../../core/dates.ts';
import { etatLigne, type EtatLigne } from '../../core/carte.ts';
import { compagnieDe, departEnMs, ligneDe, remplissage } from '../../domain/actions.ts';
import type { Depart } from '../../domain/types.ts';

export interface LigneReseau { cle: string; de: string; vers: string; aujourdhui: number; enRoute: number; compagnies: string[]; prixMin: number; prochain: string; etat: EtatLigne; incidents: number }
export const busEnRoute = (compagnieId?: string): Depart[] => app.monde.departs.filter((d) => d.statut === 'parti' && (!compagnieId || ligneDe(d).compagnieId === compagnieId));

/** Lignes (sens par sens) du réseau avec leurs chiffres du jour ; `compagnieId` filtre par compagnie. */
export function lignesReseau(compagnieId?: string, now = maintenant()): LigneReseau[] {
  const jour = aujourdhui(), demain = ajouterJours(jour, 1), cles = new Map<string, Depart[]>();
  for (const d of app.monde.departs) {
    if (d.jour !== jour && d.jour !== demain && d.statut !== 'parti') continue;
    const l = ligneDe(d); if (compagnieId && l.compagnieId !== compagnieId) continue;
    const cle = `${l.de}|${l.vers}`; (cles.get(cle) ?? cles.set(cle, []).get(cle)!).push(d);
  }
  const res: LigneReseau[] = [];
  for (const [cle, ds] of cles) {
    const [de, vers] = cle.split('|'), duJour = ds.filter((d) => d.jour === jour), actifs = duJour.filter((d) => d.statut !== 'annule');
    if (actifs.length === 0 && !ds.some((d) => d.statut === 'parti')) continue;
    const avenir = [...ds].filter((d) => d.statut !== 'annule' && (d.statut === 'prevu' || d.statut === 'embarquement') && departEnMs(d) >= now - 10 * 60_000).sort((a, b) => departEnMs(a) - departEnMs(b))[0];
    const retardes = duJour.filter((d) => d.retardMin > 0 && d.statut !== 'arrive').length, annules = duJour.filter((d) => d.statut === 'annule').length;
    const prochain = avenir ? `${avenir.retardMin > 0 ? 'reporté' : avenir.jour === jour ? 'prochain' : 'demain'} ${new Date(departEnMs(avenir)).toTimeString().slice(0, 5)}` : 'plus de départ';
    res.push({ cle, de, vers, aujourdhui: actifs.length, enRoute: ds.filter((d) => d.statut === 'parti').length, compagnies: [...new Set(actifs.map((d) => compagnieDe(d).abrev))],
      prixMin: Math.min(...(actifs.length ? actifs : ds).map((d) => d.prix)), prochain, incidents: retardes + annules,
      etat: etatLigne({ retardes, annules, remplissageMax: Math.max(0, ...actifs.filter((d) => d.statut === 'prevu' || d.statut === 'embarquement').map(remplissage)) }) });
  }
  return res.sort((a, b) => b.enRoute - a.enRoute || b.aujourdhui - a.aujourdhui || a.cle.localeCompare(b.cle));
}
