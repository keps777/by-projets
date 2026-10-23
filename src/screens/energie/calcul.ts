// Calculs purs de l'énergie solaire (testés dans energie.test.ts).
import { KITS, ecartEneo, mensualiteKit, type Kit } from '../../core/energie.ts';
import { PLAFONDS, tauxMensuel, type Niveau, type Pass } from '../../core/credit.ts';
import { ajouterJours, ajouterMois, ecartJours, type Jour } from '../../core/dates.ts';
import type { Plan } from './etat.ts';

export const DUREES = [12, 24, 36] as const;
export const kitDe = (id: Kit['id']) => KITS.find((k) => k.id === id)!;
/** Taux mensuel du crédit solaire (selon le Pass et le niveau). */
export const tauxSolaire = (pass: Pass, niveau: Niveau) => tauxMensuel(pass, niveau);
export const kitAccessible = (prix: number, niveau: Niveau) => prix <= PLAFONDS[niveau].credit;

export interface Apercu { mensualite: number; ecart: number | null; economie: boolean }
export function apercu(prix: number, duree: number, taux: number, facture: number): Apercu {
  const mensualite = mensualiteKit(prix, duree, taux);
  return { mensualite, ecart: facture > 0 ? ecartEneo(mensualite, facture) : null, economie: facture > 0 && mensualite < facture };
}
/** « −528 vs facture ENEO » / « +4 800 vs facture ENEO ». */
export function texteEcart(ecart: number | null): string {
  if (ecart === null) return '—';
  const f = (n: number) => Math.abs(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return ecart === 0 ? 'Autant que votre facture ENEO' : `${ecart < 0 ? '−' : '+'}${f(ecart)} vs facture ENEO`;
}
/** Dernière mensualité : le kit est à soi après. */
export const dateFinPlan = (p: Pick<Plan, 'premier' | 'duree'>, jourPaie: number): Jour => ajouterMois(p.premier, p.duree - 1, jourPaie);

export type EtatInstallation = 'planifiee' | 'installee';
export const etatInstallation = (p: Pick<Plan, 'installation'>, aujourdhui: Jour): EtatInstallation => (aujourdhui >= p.installation ? 'installee' : 'planifiee');
export const joursAvantInstallation = (p: Pick<Plan, 'installation'>, aujourdhui: Jour) => ecartJours(aujourdhui, p.installation);
export const finPose = (p: Pick<Plan, 'installation'>): Jour => ajouterJours(p.installation, 5);
