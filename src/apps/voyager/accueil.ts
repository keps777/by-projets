// Ce que l'accueil sait du compte : prochain voyage, bagage inutilisé, intention d'achat, drop en direct.
import { echeanceDe } from '../../core/regles.ts';
import type { BagageDroit, Drop, Droit, Intention, Monde, Vol } from '../../domain/types.ts';
import { dureeHM } from './format.ts';
import { prochainDroit } from './portefeuille.ts';

export interface ProchainVoyage { droit: Droit; vol: Vol; departMs: number; echeanceMs: number; deVille: string; versVille: string; compagnie: string; numeroAffiche: string; trajet: string }
export function prochainVoyage(monde: Monde, compteId: string, now: number): ProchainVoyage | undefined {
  const p = prochainDroit(monde, compteId, now); if (!p) return undefined;
  const ville = (code: string) => monde.aeroports.find((a) => a.code === code)?.ville ?? code, cie = monde.compagnies.find((c) => c.id === p.vol.compagnieId)?.nom ?? '';
  const trajet = `${p.vol.escales.length ? `${p.vol.escales.length} escale${p.vol.escales.length > 1 ? 's' : ''} (${p.vol.escales.join(', ')})` : 'direct'} ${dureeHM(p.vol.dureeMin)}`;
  return { droit: p.droit, vol: p.vol, departMs: p.departMs, echeanceMs: echeanceDe(p.departMs), deVille: ville(p.vol.de), versVille: ville(p.vol.vers), compagnie: cie, numeroAffiche: `${cie} ${p.vol.numero.split(' ')[1] ?? p.vol.numero}`.trim(), trajet };
}
/** Le bagage du compte laissé libre sur ce vol (inclus ou proposé), s'il y en a un. */
export const bagageInutilise = (monde: Monde, compteId: string, volId: string): BagageDroit | undefined => monde.bagages.find((b) => b.detenteurId === compteId && b.volId === volId && (b.statut === 'inclus' || b.statut === 'en_vente'));
export interface IntentionAffichee { intention: Intention; recues: number; fondsReserves: boolean }
/** L'intention d'achat publiée la plus récente, avec le nombre de propositions reçues. */
export function intentionAffichee(monde: Monde, compteId: string): IntentionAffichee | undefined {
  const i = monde.intentions.filter((x) => x.compteId === compteId && x.statut === 'publiee').sort((a, b) => b.creeLe - a.creeLe)[0]; if (!i) return undefined;
  return { intention: i, recues: i.propositions.filter((p) => p.statut === 'recue').length, fondsReserves: i.fondsReserves > 0 };
}
/** Intentions d'achat publiées du compte (pour la ligne de la face nuit). */
export const nbIntentions = (monde: Monde, compteId: string): { nb: number; fondsReserves: boolean } => { const l = monde.intentions.filter((x) => x.compteId === compteId && x.statut !== 'annulee'); return { nb: l.length, fondsReserves: l.some((x) => x.fondsReserves > 0) }; };
/** Le drop membres ouvert maintenant (ouvert, places restantes, pas terminé). */
export const dropEnDirect = (monde: Monde, now: number): Drop | undefined => monde.drops.find((d) => d.ouvre <= now && now < d.fin && d.restantes > 0);
/** Le plus petit prix de la soute partagée du vol (« dès 90 $ »), et le nombre de bagages proposés. */
export function soute(monde: Monde, volId: string): { nb: number; des: number } | undefined {
  const l = monde.bagages.filter((b) => b.volId === volId && b.statut === 'en_vente'); return l.length ? { nb: l.length, des: Math.min(...l.map((b) => b.prix)) } : undefined;
}
