// Calcul des rapports dans l'app (jour, semaine, mois), avec le noyau (mesuresDuPoint, formaterRapport). Fonctions pures.
// Même résolution des objectifs que le serveur (supabase/functions/generer-rapports/contenu.ts), étendue à une période.
import { TYPES } from '@core/metriques.ts';
import { formaterMesures, formaterRapport, mesuresDuPoint, type Langue, type MesureConfig, type MesureRapport, type PointRapport } from '@core/rapport.ts';
import type { MesurePoint, MetriqueLigne, PointRapportLigne, Projet, Rubrique, Saisie, SaisieValeur, SousProjetLigne } from '@core/lignes.ts';
import type { Jour, Metrique, TypeMetrique, ValeurSaisie } from '@core/types.ts';
import type { Periode } from './periodes.ts';

export interface DonneesRapport {
  points: PointRapportLigne[];
  sousProjets: SousProjetLigne[];
  metriques: MetriqueLigne[];
  saisies: Saisie[];
  valeurs: SaisieValeur[];
  projets: Projet[];
  rubriques: Rubrique[];
}

const STATUTS_SUIVIS = new Set(['en_cours', 'a_valider', 'termine']);

export function versMetrique(m: MetriqueLigne): Metrique {
  return { id: m.id, cle: m.cle, type: m.type, nom: m.nom, unite: m.unite, cible: m.cible == null ? null : Number(m.cible), periode: m.periode_cible, sens: m.sens, options: m.options ?? undefined, dansRapport: m.dans_rapport };
}

/** Métrique sans objectif, déduite de la clé (« nombre:chapitres » → nombre de chapitres). */
export function metriqueDeLaCle(cle: string): Metrique {
  const [prefixe, suite] = cle.split(':');
  const type = (prefixe in TYPES ? prefixe : 'nombre') as TypeMetrique;
  const unite = type === 'nombre' ? suite ?? '' : '';
  return { id: '', cle, type, nom: suite ?? prefixe, unite, cible: null, periode: 'jour', sens: 'plus', dansRapport: true };
}

/** Sous-projets du projet qui recouvrent la période, les plus récents d'abord. */
export function sousProjetsDeLaPeriode(d: DonneesRapport, projetId: string | null, debut: Jour, fin: Jour): SousProjetLigne[] {
  return d.sousProjets
    .filter((sp) => (!projetId || sp.projet_id === projetId) && STATUTS_SUIVIS.has(sp.statut) && sp.debut <= fin && (!sp.fin || sp.fin >= debut))
    .sort((a, b) => (a.debut < b.debut ? 1 : a.debut > b.debut ? -1 : 0));
}

const metriqueDe = (d: DonneesRapport, spId: string, cle: string) => d.metriques.find((m) => m.sous_projet_id === spId && m.cle === cle);

/** Métrique et période du sous-projet qui fournissent l'objectif d'une mesure du point. */
export function configDeMesure(mesure: MesurePoint, point: PointRapportLigne, d: DonneesRapport, debut: Jour, fin: Jour): MesureConfig {
  if (mesure.sous_projet_id) {
    const sp = d.sousProjets.find((s) => s.id === mesure.sous_projet_id);
    const m = sp && metriqueDe(d, sp.id, mesure.cle);
    if (sp && m) return { metrique: versMetrique(m), sousProjet: { debut: sp.debut, fin: sp.fin } };
  }
  for (const sp of sousProjetsDeLaPeriode(d, point.projet_id, debut, fin)) {
    const m = metriqueDe(d, sp.id, mesure.cle);
    if (m) return { metrique: versMetrique(m), sousProjet: { debut: sp.debut, fin: sp.fin } };
  }
  return { metrique: metriqueDeLaCle(mesure.cle), sousProjet: { debut, fin: null } };
}

/** Valeurs saisies pour le projet du point (toutes les saisies si le point n'a pas de projet). */
export function valeursDuPoint(point: PointRapportLigne, d: DonneesRapport, parSaisie = indexerValeurs(d)): ValeurSaisie[] {
  const res: ValeurSaisie[] = [];
  for (const s of d.saisies) {
    if (point.projet_id && s.projet_id !== point.projet_id) continue;
    for (const v of parSaisie.get(s.id) ?? []) res.push({ cle: v.cle, jour: s.jour, valeur: Number(v.valeur_num ?? 0), approx: s.approx || undefined, texte: v.valeur_txt ?? undefined });
  }
  return res;
}

function indexerValeurs(d: DonneesRapport): Map<string, SaisieValeur[]> {
  const m = new Map<string, SaisieValeur[]>();
  for (const v of d.valeurs) { const l = m.get(v.saisie_id); if (l) l.push(v); else m.set(v.saisie_id, [v]); }
  return m;
}

/** Part de l'objectif atteinte par un point : la plus faible de ses mesures chiffrées ; sans objectif, 1 si quelque chose est fait. */
export function ratioPoint(ms: MesureRapport[]): number | null {
  const chiffrees = ms.filter((m) => m.attendu != null && m.attendu > 0 && m.fait != null && TYPES[m.type].agregation === 'somme');
  if (chiffrees.length) return Math.min(...chiffrees.map((m) => m.fait! / m.attendu!));
  const faits = ms.filter((m) => m.type !== 'reference');
  if (!faits.length) return null;
  return faits.some((m) => (m.fait ?? 0) > 0) ? 1 : 0;
}

export interface PointPrepare { point: PointRapportLigne; couleur: string | null; valeurs: ValeurSaisie[] }
export interface PointCalcule extends PointPrepare { mesures: MesureRapport[]; ratio: number | null }

/** Prépare une fois les points actifs (valeurs saisies, couleur de rubrique) pour calculer ensuite plusieurs périodes. */
export function preparer(d: DonneesRapport): PointPrepare[] {
  const parSaisie = indexerValeurs(d);
  const rubriques = new Map(d.rubriques.map((r) => [r.id, r]));
  const projets = new Map(d.projets.map((p) => [p.id, p]));
  return d.points
    .filter((p) => p.actif)
    .sort((a, b) => a.ordre - b.ordre)
    .map((point) => {
      const projet = point.projet_id ? projets.get(point.projet_id) : undefined;
      return { point, couleur: (projet && rubriques.get(projet.rubrique_id)?.couleur) ?? null, valeurs: valeursDuPoint(point, d, parSaisie) };
    });
}

export function calculerPoint(pp: PointPrepare, d: DonneesRapport, debut: Jour, fin: Jour): PointCalcule {
  const configs = (pp.point.mesures ?? []).map((m) => configDeMesure(m, pp.point, d, debut, fin));
  const mesures = mesuresDuPoint(configs, pp.valeurs, debut, fin);
  return { ...pp, mesures, ratio: ratioPoint(mesures) };
}

export const calculerPoints = (prep: PointPrepare[], d: DonneesRapport, debut: Jour, fin: Jour) => prep.map((pp) => calculerPoint(pp, d, debut, fin));

export const atteint = (r: number | null) => r != null && r >= 1;

/** Texte WhatsApp du rapport (format de l'utilisateur, spec §9), pour les points choisis. */
export function texteDuRapport(o: { periode: Periode; nom: string; langue: Langue; points: { point: PointRapportLigne; mesures: MesureRapport[] }[] }): string {
  const points: PointRapport[] = o.points.map((p) => ({ code: p.point.code, mesures: p.mesures }));
  return formaterRapport({ langue: o.langue, nom: o.nom, entete: { type: o.periode.vue, debut: o.periode.debut, fin: o.periode.fin }, points });
}

/** Une ligne courte pour les listes : « DDEWG 2/3 · PA ~2h15 · BR 0/7 ch ». */
export function resumeCourt(points: PointCalcule[], langue: Langue = 'fr', max = 4): string {
  return points.slice(0, max).map((p) => `${p.point.code} ${p.mesures[0] ? formaterMesures([p.mesures[0]], langue) : '—'}`).join(' · ');
}

/** Contenu structuré enregistré dans la table `rapports` (même forme que celui du serveur). */
export interface ContenuRapport { version: 1; entete: { type: 'jour'; debut: Jour }; points: { point_id: string; code: string; libelle: string; mesures: MesureRapport[] }[] }

export function contenuDuJour(jour: Jour, points: PointCalcule[]): ContenuRapport {
  return { version: 1, entete: { type: 'jour', debut: jour }, points: points.map((p) => ({ point_id: p.point.id, code: p.point.code, libelle: p.point.libelle, mesures: p.mesures })) };
}

/** Vrai si le contenu enregistré diffère du calcul actuel (une saisie corrigée après l'envoi). */
export function modifieDepuis(enregistre: unknown, actuel: ContenuRapport): boolean {
  const e = enregistre as Partial<ContenuRapport> | null;
  if (!e?.points) return false;
  const cle = (c: Pick<ContenuRapport, 'points'>) => JSON.stringify(c.points.map((p) => [p.point_id, p.mesures.map((m) => [m.fait ?? null, m.attendu ?? null, m.texte ?? null])]));
  return cle(e as ContenuRapport) !== cle(actuel);
}

/** Texte d'un contenu enregistré (l'ancien texte reste consultable). */
export function texteDuContenu(c: unknown, nom: string, langue: Langue): string | null {
  const e = c as Partial<ContenuRapport> | null;
  if (!e?.points || !e.entete) return null;
  return formaterRapport({ langue, nom, entete: { type: 'jour', debut: e.entete.debut }, points: e.points.map((p) => ({ code: p.code, mesures: p.mesures })) });
}
