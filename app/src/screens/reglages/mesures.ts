// Mesures d'un point du rapport : libellés, objectifs lisibles, mesures proposées. Fonctions pures.
import { TYPES } from '@core/metriques.ts';
import { formatMontantCourt, formatTemps, nombre } from '@core/units.ts';
import type { MetriqueLigne, PointRapportLigne, SousProjetLigne } from '@core/lignes.ts';
import type { PeriodeCible, TypeMetrique } from '@core/types.ts';

export function typeDeCle(cle: string): TypeMetrique {
  const p = cle.split(':')[0];
  return (p in TYPES ? p : 'nombre') as TypeMetrique;
}
const suite = (cle: string) => cle.split(':')[1] ?? '';

/** Étiquette courte d'une mesure, pour les puces de la liste des points. */
export function categorie(cle: string): string {
  switch (typeDeCle(cle)) {
    case 'fois': return 'Fois';
    case 'temps': return 'Temps';
    case 'nombre': case 'distance': case 'poids': return 'Quantité';
    case 'reference': return 'Détail';
    case 'montant': return 'Montant';
    case 'oui_non': return 'Oui / Non';
    case 'choix': return 'Choix';
    default: return TYPES[typeDeCle(cle)].nom;
  }
}

export function libelleCle(cle: string): { label: string; aide: string } {
  const s = suite(cle);
  switch (typeDeCle(cle)) {
    case 'fois': return { label: 'Nombre de fois', aide: 'ex. 2/3 rencontres' };
    case 'temps': return { label: 'Temps passé', aide: 'ex. ~0h28 (0h12; ~0h16)' };
    case 'nombre': return { label: s ? `Quantité · ${s}` : 'Quantité', aide: 'chapitres, pages, personnes…' };
    case 'reference': return { label: s ? `Détail · ${s}` : 'Détail', aide: 'passages lus, livre et auteur' };
    case 'montant': return { label: s && s !== 'total' ? `Montant · ${s}` : 'Montant', aide: 'ex. 50 $/50 $' };
    case 'oui_non': return { label: 'Oui / Non', aide: 'fait ou pas fait' };
    case 'choix': return { label: s ? `Choix · ${s}` : 'Choix', aide: 'ex. complet, partiel' };
    default: return { label: TYPES[typeDeCle(cle)].nom, aide: '' };
  }
}

const PERIODES: Record<PeriodeCible, string> = { jour: '/ jour', semaine: '/ semaine', mois: '/ mois', total: 'au total' };

/** « 2h00 / jour », « 7 ch / jour », « 50 $ / mois ». */
export function objectifLisible(m: Pick<MetriqueLigne, 'type' | 'cible' | 'unite' | 'periode_cible'>): string | null {
  if (m.cible == null) return null;
  const c = Number(m.cible);
  let v: string;
  switch (m.type) {
    case 'temps': v = formatTemps(c); break;
    case 'montant': v = formatMontantCourt(c).replace(/[  ]/g, ' '); break;
    case 'distance': v = `${nombre(c / 1000)} km`; break;
    case 'poids': v = `${nombre(c / 1000)} kg`; break;
    default: v = `${nombre(c)}${m.unite ? ` ${m.unite}` : ''}`;
  }
  return `${v} ${PERIODES[m.periode_cible]}`;
}

export interface SourceMesure { sp: SousProjetLigne; metrique: MetriqueLigne }
export interface MesureProposee { cle: string; label: string; aide: string; on: boolean; sousProjetId: string | null; sources: SourceMesure[] }

const ACTIFS = new Set(['brouillon', 'en_cours', 'a_valider']);
const BASE = ['fois', 'temps'];

/** Mesures proposées pour un point : celles qu'il a (dans l'ordre), puis celles des sous-projets du projet lié, puis Fois et Temps. */
export function mesuresProposees(point: PointRapportLigne, l: { sous_projets: SousProjetLigne[]; metriques: MetriqueLigne[] }): MesureProposee[] {
  const sps = point.projet_id ? l.sous_projets.filter((s) => s.projet_id === point.projet_id && ACTIFS.has(s.statut)) : [];
  const ids = new Set(sps.map((s) => s.id));
  const parId = new Map(sps.map((s) => [s.id, s]));
  const sources = new Map<string, SourceMesure[]>();
  for (const m of l.metriques) {
    if (!ids.has(m.sous_projet_id)) continue;
    const liste = sources.get(m.cle) ?? [];
    liste.push({ sp: parId.get(m.sous_projet_id)!, metrique: m });
    sources.set(m.cle, liste);
  }
  const ordre = [...(point.mesures ?? []).map((m) => m.cle), ...sources.keys(), ...BASE];
  const vues = new Set<string>();
  const res: MesureProposee[] = [];
  for (const cle of ordre) {
    if (vues.has(cle)) continue;
    vues.add(cle);
    const actuelle = point.mesures?.find((m) => m.cle === cle);
    const src = sources.get(cle) ?? [];
    const base = libelleCle(cle);
    const nom = src[0]?.metrique.nom?.trim();
    res.push({ cle, label: nom && nom !== cle ? nom : base.label, aide: base.aide, on: !!actuelle, sousProjetId: actuelle?.sous_projet_id ?? null, sources: src });
  }
  return res;
}

/** Source retenue pour l'objectif : celle choisie, sinon le sous-projet le plus récent qui définit la mesure. */
export function sourceRetenue(m: MesureProposee): SourceMesure | undefined {
  if (m.sousProjetId) { const s = m.sources.find((x) => x.sp.id === m.sousProjetId); if (s) return s; }
  return [...m.sources].sort((a, b) => (a.sp.debut < b.sp.debut ? 1 : -1))[0];
}
