// État et actions de l'entrée (ouverture, langue, promesses). Tranche `entree` : région et aéroport choisis avant la création du compte.
import { app, tranche } from '../../data/store.svelte.ts';
import { compteCourant, majCompte } from '../../domain/compte.ts';
import { AEROPORT_DEFAUT, codeAeroport, langueValide, regionDe, type Langue } from './dico.ts';

export interface Entree { region: 'ca' | 'us' | 'fr'; aeroport: string }
/** La tranche (créée à la première lecture, hors `$derived`). */
export const entree = (): Entree => tranche<Entree>('entree', () => ({ region: 'ca', aeroport: AEROPORT_DEFAUT }));

/** Change la langue de l'application (immédiat, mémorisé ; celle du compte connecté suit). */
export function choisirLangue(l: Langue): void {
  const v = langueValide(l); app.session.langue = v;
  const c = compteCourant(); if (c) majCompte(c.id, { langue: v });
}
export function enregistrerRegion(region: string, aeroport: string): void {
  const e = entree(); const r = regionDe(region); e.region = r.code; e.aeroport = aeroport.trim();
  const c = compteCourant();
  if (c) { const code = codeAeroport(aeroport); majCompte(c.id, code ? { region: r.compte, aeroport: code } : { region: r.compte }); }
}
export function marquerTutoVu(): void { app.session.vuTuto = true; }
