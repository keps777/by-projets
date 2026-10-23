// Seules écritures du portail : ses propres réglages (tranche « pilotage »). Les données des autres fonctionnalités ne sont jamais modifiées.
import { NB_PERIODES, PRODUITS, type FiltreProduit } from '../../core/pilotage.ts';
import { montrer } from '../../ui/toast.svelte.ts';
import { pilotage, type Panneau } from './etat.ts';

export const aller = (p: Panneau) => { pilotage().panneau = p; };
export const choisirPeriode = (i: number) => { if (Number.isInteger(i) && i >= 0 && i < NB_PERIODES) pilotage().periode = i; };
export const choisirProduit = (p: FiltreProduit) => { if (p === 'tous' || PRODUITS.some((x) => x.cle === p)) pilotage().produit = p; };
export const choisirMode = (m: 'mensuel' | 'cumule') => { pilotage().mode = m; };
export const regler = (cle: 'seuil' | 'ligne', v: number) => {
  const e = pilotage(); if (!Number.isFinite(v)) return;
  if (cle === 'seuil') e.seuil = Math.min(5, Math.max(1, Math.round(v * 2) / 2));
  else { e.ligne = Math.min(3, Math.max(0.5, Math.round(v * 10) / 10)); e.ligneDemandee = false; }
};
export const basculerRelance = (i: number) => { const e = pilotage(); if (i >= 0 && i < e.relances.length) e.relances[i] = !e.relances[i]; };
export const basculerConformite = (i: number) => { const e = pilotage(); if (i >= 0 && i < e.conformite.length) e.conformite[i] = !e.conformite[i]; };
export function signerConvention(i: number): boolean {
  const c = pilotage().conventions[i]; if (!c) return false;
  if (c.statut === 3) { montrer('Convention déjà signée'); return false; }
  c.statut = 3; montrer('Convention marquée comme signée'); return true;
}
export function demanderLigne(): boolean {
  const e = pilotage(); if (e.ligneDemandee) return false;
  e.ligneDemandee = true; montrer(`Demande de ligne de ${e.ligne.toFixed(1).replace('.', ',')} Md envoyée`); return true;
}
