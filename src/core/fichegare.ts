// Fiche d'une gare pour le patron : recette et billets sur une période, comparés à la période précédente, barres, moyens de paiement, quais, caisses.
import type { Caisse, MoyenPaiement } from '../domain/types.ts';
import { ajouterJours, type Jour } from './dates.ts';
import { decaler, derniersJours, fenetre, jourDeTs, minuteDe, remplissages, total, variation, ventes, type Donnees, type Periode, type Vente } from './indicateurs.ts';

export const NOM_MOYEN: Record<MoyenPaiement, string> = { especes: 'espèces', momo: 'MoMo', om: 'OM', carte: 'carte', visage: 'visage', proche: 'proche' };
export const LONGUEUR: Record<Periode, number> = { jour: 1, semaine: 7, mois: 28 };
export const REF_PERIODE: Record<Periode, string> = { jour: 'vs même jour la semaine passée', semaine: 'vs 7 jours précédents', mois: 'vs 28 jours précédents' };

export interface FicheGare {
  periode: Periode; recette: number; ref: number; variation: number | null; billets: number; billetsRef: number; bus: number; remplissage: number;
  serie: number[]; legendeSerie: string; paiements: { moyen: string; part: number }[];
}
/** Répartition en barres : 12 tranches de 90 min (jour), 7 jours (semaine), 4 semaines (mois) — hauteurs en % du maximum. */
export function barres(v: Vente[], periode: Periode, jour: Jour, jusquaMin: number): number[] {
  const bruts = periode === 'jour' ? Array.from({ length: 12 }, (_, i) => total(v.filter((x) => x.jour === jour && x.minute >= 300 + i * 90 && x.minute < 390 + i * 90 && x.minute <= jusquaMin)))
    : periode === 'semaine' ? derniersJours(jour, 7).map((j) => total(fenetre(v, [j], j === jour ? jusquaMin : 1440)))
      : [0, 1, 2, 3].map((s) => total(fenetre(v, derniersJours(ajouterJours(jour, -7 * (3 - s)), 7), s === 3 ? jusquaMin : 1440)));
  const max = Math.max(...bruts, 0);
  return bruts.map((x) => (max > 0 ? Math.round((x / max) * 100) : 0));
}
export function ficheGare(d: Donnees, gareId: string, o: { periode: Periode; jour: Jour; now: number; compagnieId?: string }): FicheGare {
  const v = ventes(d, o.compagnieId).filter((x) => x.ligne.gareDe === gareId), min = minuteDe(o.now);
  const jours = derniersJours(o.jour, LONGUEUR[o.periode]), precedents = decaler(jours, -LONGUEUR[o.periode]);
  const actuel = fenetre(v, o.periode === 'jour' ? [o.jour] : jours, min), ref = fenetre(v, o.periode === 'jour' ? [ajouterJours(o.jour, -7)] : precedents, min);
  const rempl = remplissages(d, o.now), ensemble = new Set(jours);
  const bus = d.departs.filter((x) => x.statut !== 'annule' && ensemble.has(x.jour) && d.lignes.find((l) => l.id === x.ligneId)?.gareDe === gareId && (!o.compagnieId || d.lignes.find((l) => l.id === x.ligneId)?.compagnieId === o.compagnieId));
  const moyens = new Map(d.paiements.map((p) => [p.id, p.moyen])), parts = new Map<string, number>();
  for (const x of actuel) { const m = NOM_MOYEN[moyens.get(x.billet.paiementId) ?? 'especes']; parts.set(m, (parts.get(m) ?? 0) + 1); }
  return {
    periode: o.periode, recette: total(actuel), ref: total(ref), variation: variation(total(actuel), total(ref)), billets: actuel.length, billetsRef: ref.length, bus: bus.length,
    remplissage: bus.length ? bus.reduce((s, x) => s + (rempl.get(x.id) ?? 0), 0) / bus.length : 0, serie: barres(v, o.periode, o.jour, min),
    legendeSerie: o.periode === 'jour' ? 'Par tranche de 90 min' : o.periode === 'semaine' ? 'Par jour' : 'Par semaine',
    paiements: [...parts.entries()].map(([moyen, n]) => ({ moyen, part: Math.round((n / Math.max(1, actuel.length)) * 100) })).sort((a, b) => b.part - a.part)
  };
}
export interface Quai { departId: string; heure: string; vers: string; compagnieId: string; remplissage: number; statut: string }
/** Prochains départs de la gare (les « quais maintenant »). */
export function quais(d: Donnees, gareId: string, o: { jour: Jour; now: number; compagnieId?: string }, n = 4): Quai[] {
  const rempl = remplissages(d, o.now), lignes = new Map(d.lignes.map((l) => [l.id, l])), min = minuteDe(o.now);
  return d.departs.filter((x) => x.jour === o.jour && x.statut !== 'annule' && x.statut !== 'arrive' && lignes.get(x.ligneId)?.gareDe === gareId && (!o.compagnieId || lignes.get(x.ligneId)?.compagnieId === o.compagnieId))
    .map((x) => ({ x, l: lignes.get(x.ligneId)!, h: Number(x.heure.slice(0, 2)) * 60 + Number(x.heure.slice(3, 5)) + x.retardMin }))
    .filter((e) => e.h >= min - 60).sort((a, b) => a.h - b.h).slice(0, n).map(({ x, l }) => ({ departId: x.id, heure: x.heure, vers: l.vers, compagnieId: l.compagnieId, remplissage: rempl.get(x.id) ?? 0, statut: x.statut }));
}
/** Caisses d'une gare ouvertes un jour donné. */
export const caissesDe = (d: Pick<Donnees, 'caisses'>, gareId: string, jour: Jour): Caisse[] => d.caisses.filter((c) => c.gareId === gareId && jourDeTs(c.ouvertA) === jour);
export type EtatRapport = { code: 'envoye' | 'retard' | 'en_cours' | 'aucun'; libelle: string };
/** Rapport du soir : « envoyé » quand toutes les caisses du jour sont clôturées ; « en retard » si l'une est encore ouverte après 21:00. */
export function etatRapport(caisses: Caisse[], now: number): EtatRapport {
  if (!caisses.length) return { code: 'aucun', libelle: 'pas de caisse' };
  if (caisses.every((c) => c.statut !== 'ouverte')) return { code: 'envoye', libelle: 'rapport envoyé' };
  return minuteDe(now) >= 21 * 60 ? { code: 'retard', libelle: 'rapport en retard' } : { code: 'en_cours', libelle: 'journée en cours' };
}
