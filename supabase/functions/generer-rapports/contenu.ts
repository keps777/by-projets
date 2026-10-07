// Contenu structuré du rapport du jour (spec §9), calculé avec le noyau (mesuresDuPoint). L'app en compose le texte
// à l'affichage (formaterRapport), selon le préréglage et la langue. Fonctions pures.
import {
  TYPES, itemsDesLivres, mesuresDuPoint,
  type ItemRapport, type LectureLivre, type MesureConfig, type MesurePoint, type MesureRapport, type Metrique, type MetriqueLigne, type PointRapportLigne,
  type Saisie, type SaisieValeur, type SousProjetLigne, type TypeMetrique, type ValeurSaisie
} from '../_shared/core/index.ts';

/** Lignes non supprimées d'un utilisateur, utiles au rapport d'un jour. */
export interface DonneesJour {
  points: PointRapportLigne[];
  sousProjets: SousProjetLigne[];
  metriques: MetriqueLigne[];
  /** Saisies du jour. */
  saisies: Saisie[];
  /** Valeurs de ces saisies. */
  valeurs: SaisieValeur[];
  /** Pages lues par livre (clé « livre:<id> »), tous jours confondus jusqu'au jour du rapport, avec le projet de leur saisie. */
  lectures?: (LectureLivre & { projet_id: string })[];
}

export interface PointContenu { point_id: string; code: string; libelle: string; mesures: MesureRapport[]; items?: ItemRapport[] }
export interface ContenuRapport { version: 1; entete: { type: 'jour'; debut: string }; points: PointContenu[] }

const STATUTS_SUIVIS = new Set(['en_cours', 'a_valider', 'termine']);

export function versMetrique(m: MetriqueLigne): Metrique {
  return {
    id: m.id, cle: m.cle, type: m.type, nom: m.nom, unite: m.unite, cible: m.cible == null ? null : Number(m.cible),
    periode: m.periode_cible, sens: m.sens, options: m.options ?? undefined, dansRapport: m.dans_rapport
  };
}

/** Métrique sans objectif, déduite de la clé, quand aucun sous-projet ne la définit (« nombre:chapitres » → nombre). */
export function metriqueDeLaCle(cle: string): Metrique {
  const [prefixe, suite] = cle.split(':');
  const type = (prefixe in TYPES ? prefixe : 'nombre') as TypeMetrique;
  const unite = type === 'nombre' ? suite ?? '' : '';
  return { id: '', cle, type, nom: suite ?? prefixe, unite, cible: null, periode: 'jour', sens: 'plus', dansRapport: true };
}

/** Sous-projets du projet qui couvrent le jour, les plus récents d'abord. */
function sousProjetsDuJour(d: DonneesJour, projetId: string | null, jour: string): SousProjetLigne[] {
  return d.sousProjets
    .filter((sp) => !sp.supprime_le && (!projetId || sp.projet_id === projetId) && STATUTS_SUIVIS.has(sp.statut)
      && sp.debut <= jour && (!sp.fin || sp.fin >= jour))
    .sort((a, b) => (a.debut < b.debut ? 1 : a.debut > b.debut ? -1 : 0));
}

const metriqueDe = (d: DonneesJour, sousProjetId: string, cle: string) =>
  d.metriques.find((m) => !m.supprime_le && m.sous_projet_id === sousProjetId && m.cle === cle);

/** Métrique et période qui fournissent l'objectif d'une mesure du point. */
export function configDeMesure(mesure: MesurePoint, point: PointRapportLigne, d: DonneesJour, jour: string): MesureConfig {
  if (mesure.sous_projet_id) {
    const sp = d.sousProjets.find((s) => s.id === mesure.sous_projet_id && !s.supprime_le);
    const m = sp && metriqueDe(d, sp.id, mesure.cle);
    if (sp && m) return { metrique: versMetrique(m), sousProjet: { debut: sp.debut, fin: sp.fin } };
  }
  // L'objectif du jour vient d'abord d'un sous-projet à objectif quotidien (« 10 chapitres par jour », « 1 h par jour ») ;
  // à défaut, du plus récent qui a cette mesure (un objectif « au total » ou mensuel est alors réparti sur ses jours).
  const candidats = sousProjetsDuJour(d, point.projet_id, jour).flatMap((sp) => { const m = metriqueDe(d, sp.id, mesure.cle); return m ? [{ sp, m }] : []; });
  const choisi = candidats.find((c) => c.m.periode_cible === 'jour') ?? candidats[0];
  if (choisi) return { metrique: versMetrique(choisi.m), sousProjet: { debut: choisi.sp.debut, fin: choisi.sp.fin } };
  return { metrique: metriqueDeLaCle(mesure.cle), sousProjet: { debut: jour, fin: null } };
}

/** Valeurs saisies pour le projet du point (toutes les saisies du jour si le point n'a pas de projet). */
export function valeursDuPoint(point: PointRapportLigne, d: DonneesJour): ValeurSaisie[] {
  const saisies = new Map(d.saisies.filter((s) => !s.supprime_le && (!point.projet_id || s.projet_id === point.projet_id)).map((s) => [s.id, s]));
  return d.valeurs.filter((v) => !v.supprime_le && saisies.has(v.saisie_id)).map((v) => {
    const s = saisies.get(v.saisie_id)!;
    return { cle: v.cle, jour: s.jour, valeur: Number(v.valeur_num ?? 0), approx: s.approx || undefined, texte: v.valeur_txt ?? undefined };
  });
}

export function construireContenu(d: DonneesJour, jour: string): ContenuRapport {
  const points = d.points
    .filter((p) => p.actif && !p.supprime_le)
    .sort((a, b) => a.ordre - b.ordre)
    .map((p) => {
      const lectures = (d.lectures ?? []).filter((l) => !p.projet_id || l.projet_id === p.projet_id);
      const items = itemsDesLivres(p.livres, lectures, jour, jour);
      return {
        point_id: p.id, code: p.code, libelle: p.libelle,
        mesures: mesuresDuPoint((p.mesures ?? []).map((m) => configDeMesure(m, p, d, jour)), valeursDuPoint(p, d), jour, jour),
        ...(items.length ? { items } : {})
      };
    });
  return { version: 1, entete: { type: 'jour', debut: jour }, points };
}
