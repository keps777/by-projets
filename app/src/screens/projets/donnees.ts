// Lectures et écritures propres aux écrans Projets, au-dessus du magasin (data/ n'a pas encore ces requêtes).
import { utcVersLocal } from '@core/dates.ts';
import { nouvelId, uuidDeterministe } from '@core/ids.ts';
import { TYPES } from '@core/metriques.ts';
import { formatHeure } from '@core/units.ts';
import type { Jour, TypeMetrique } from '@core/types.ts';
import type { DetailMouvement, Occurrence, Saisie, SaisieValeur, Tache } from '@core/lignes.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { fuseau } from '../../data/temps.svelte.ts';
import { refleterNoteDeSaisie } from '../../data/actions/notes.ts';

/** Code de rapport du projet (BR, DDEWG…), s'il y en a un. */
export function codeDuProjet(projetId: string): string | null {
  return magasin.lignes.points_rapport.find((p) => p.projet_id === projetId && p.actif)?.code ?? null;
}

/** Tâches actives qui alimentent ce sous-projet. */
export function tachesDuSousProjet(spId: string): Tache[] {
  const ids = new Set(magasin.lignes.tache_alimente.filter((a) => a.sous_projet_id === spId).map((a) => a.tache_id));
  return magasin.lignes.taches.filter((t) => ids.has(t.id) && t.actif).sort((a, b) => a.heure_debut - b.heure_debut);
}

export const heuresTache = (t: Tache) => `${formatHeure(t.heure_debut)}–${formatHeure(t.heure_debut + t.duree_min)}`;

/** « 05:30 – 06:15 » d'une occurrence, dans le fuseau de l'utilisateur. */
export function heuresOccurrence(o: Occurrence, reel = false): string {
  const tz = fuseau();
  const d = reel && o.demarree_a ? Date.parse(o.demarree_a) : Date.parse(o.debut);
  const f = reel && o.terminee_a ? Date.parse(o.terminee_a) : Date.parse(o.fin);
  return `${formatHeure(utcVersLocal(d, tz).minutes)} – ${formatHeure(utcVersLocal(f, tz).minutes)}`;
}

/** Prochaines occurrences prévues des tâches de ce sous-projet. */
export function prochainesOccurrences(spId: string, depuis: Jour, n = 5): { occ: Occurrence; tache: Tache }[] {
  const taches = new Map(tachesDuSousProjet(spId).map((t) => [t.id, t]));
  return magasin.lignes.occurrences
    .filter((o) => taches.has(o.tache_id) && o.jour >= depuis && (o.etat === 'prevue' || o.etat === 'en_cours' || o.etat === 'pause') && Date.parse(o.fin) > Date.now())
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, n)
    .map((occ) => ({ occ, tache: taches.get(occ.tache_id)! }));
}

export interface SaisieDetaillee { saisie: Saisie; valeurs: SaisieValeur[]; occ?: Occurrence; tache?: Tache }

/** Saisies d'un projet entre deux jours, avec leurs valeurs, de la plus récente à la plus ancienne. */
export function saisiesDuProjet(projetId: string, debut: Jour, fin: Jour): SaisieDetaillee[] {
  const { saisies, saisie_valeurs, occurrences, taches } = magasin.lignes;
  const parSaisie = new Map<string, SaisieValeur[]>();
  for (const v of saisie_valeurs) { const l = parSaisie.get(v.saisie_id); if (l) l.push(v); else parSaisie.set(v.saisie_id, [v]); }
  return saisies
    .filter((s) => s.projet_id === projetId && s.jour >= debut && s.jour <= fin)
    .map((saisie) => {
      const occ = saisie.occurrence_id ? occurrences.find((o) => o.id === saisie.occurrence_id) : undefined;
      return { saisie, valeurs: parSaisie.get(saisie.id) ?? [], occ, tache: occ ? taches.find((t) => t.id === occ.tache_id) : undefined };
    })
    .sort((a, b) => b.saisie.jour.localeCompare(a.saisie.jour) || (b.occ?.debut ?? b.saisie.created_at).localeCompare(a.occ?.debut ?? a.saisie.created_at));
}

// ------------------------------------------------------------------ saisie manuelle d'un jour (spec §8 : « Saisir un autre jour »)

/** Une seule saisie manuelle par projet et par jour : la corriger ne crée jamais de doublon. */
export const idSaisieManuelle = (projetId: string, jour: Jour) => uuidDeterministe(`manuel:${projetId}:${jour}`);
const idValeur = (saisieId: string, cle: string) => uuidDeterministe(`sv:${saisieId}:${cle}`);

export interface ValeurJour { cle: string; type: TypeMetrique; num?: number | null; txt?: string | null; /** Détail structuré d’une référence (passages de la Bible). */ detail?: unknown[] }

/** Ce que contient la journée pour une clé : total (selon l'agrégation du type) et texte. */
export function contenuDuJour(projetId: string, jour: Jour): Map<string, { nums: number[]; textes: string[]; manuel: number | null; manuelTxt: string | null }> {
  const { saisies, saisie_valeurs } = magasin.lignes;
  const ids = new Map(saisies.filter((s) => s.projet_id === projetId && s.jour === jour).map((s) => [s.id, s]));
  const idManuel = idSaisieManuelle(projetId, jour);
  const res = new Map<string, { nums: number[]; textes: string[]; manuel: number | null; manuelTxt: string | null }>();
  for (const v of saisie_valeurs) {
    if (!ids.has(v.saisie_id)) continue;
    const e = res.get(v.cle) ?? { nums: [], textes: [], manuel: null, manuelTxt: null };
    if (v.saisie_id === idManuel) { e.manuel = v.valeur_num; e.manuelTxt = v.valeur_txt; }
    else { if (v.valeur_num != null) e.nums.push(v.valeur_num); if (v.valeur_txt) e.textes.push(v.valeur_txt); }
    res.set(v.cle, e);
  }
  return res;
}

/**
 * Enregistre ce que l'utilisateur dit avoir fait ce jour-là. Pour les métriques qui s'additionnent, la saisie manuelle
 * porte la différence avec ce que les blocs ont déjà enregistré : le total du jour devient exactement la valeur tapée,
 * sans toucher aux saisies des blocs. Pour les autres (poids, note, heure…), elle porte la valeur elle-même.
 */
export function saisirJour(projetId: string, jour: Jour, valeurs: ValeurJour[], aujourdhui: Jour, note?: string | null): void {
  const sid = idSaisieManuelle(projetId, jour);
  const existante = magasin.trouver('saisies', sid);
  const contenu = contenuDuJour(projetId, jour);
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [];
  for (const v of valeurs) {
    const c = contenu.get(v.cle);
    if (v.type === 'reference') {
      const txt = v.txt?.trim() || null;
      if ((c?.manuelTxt ?? null) === txt) continue;
      ops.push(['saisie_valeurs', { id: idValeur(sid, v.cle), saisie_id: sid, cle: v.cle, valeur_num: null, valeur_txt: txt, detail: v.detail ?? null }]);
      continue;
    }
    if (v.num == null) continue;
    const autres = c?.nums ?? [];
    const somme = TYPES[v.type].agregation === 'somme';
    const manuel = somme ? v.num - autres.reduce((s, x) => s + x, 0) : v.num;
    if (c?.manuel === manuel || (c?.manuel == null && somme && manuel === 0)) continue;
    ops.push(['saisie_valeurs', { id: idValeur(sid, v.cle), saisie_id: sid, cle: v.cle, valeur_num: manuel, valeur_txt: null, detail: null }]);
  }
  const noteNette = note === undefined ? existante?.note ?? null : note?.trim() || null;
  if (!ops.length && (existante?.note ?? null) === noteNette) return;
  ops.unshift(['saisies', { id: sid, projet_id: projetId, occurrence_id: null, jour, source: jour < aujourdhui ? 'rattrapage' : 'manuel', note: noteNette, approx: existante?.approx ?? false }]);
  magasin.ecrireLot(ops);
  // La note de la saisie entre aussi au Carnet (spec §18), avec le nom du projet et, pour un autre jour, ce jour.
  if (note !== undefined) {
    const projet = magasin.trouver('projets', projetId);
    refleterNoteDeSaisie(sid, noteNette, projetId, `${projet?.nom ?? 'Saisie'}${jour === aujourdhui ? '' : ` · ${jour}`}`);
  }
}

// ------------------------------------------------------------------ finances

/** Ce que l'utilisateur tape pour un mouvement ; enregistré sous la forme `DetailMouvement` du noyau. */
export interface MouvementSaisi { libelle?: string; categorie?: string }

const texteOuNull = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

/** Un mouvement d'argent = une saisie à part, avec son libellé et sa catégorie (dans `detail`). */
export function ajouterMouvement(projetId: string, jour: Jour, cle: string, centimes: number, saisi: MouvementSaisi, aujourdhui: Jour): void {
  const sid = nouvelId();
  const detail: DetailMouvement = { libelle: texteOuNull(saisi.libelle), categorie: texteOuNull(saisi.categorie) };
  magasin.ecrireLot([
    ['saisies', { id: sid, projet_id: projetId, occurrence_id: null, jour, source: jour < aujourdhui ? 'rattrapage' : 'manuel', note: detail.libelle, approx: false }],
    ['saisie_valeurs', { id: idValeur(sid, cle), saisie_id: sid, cle, valeur_num: centimes, valeur_txt: null, detail }]
  ]);
}

export function retirerMouvement(saisieId: string, valeurId: string): void {
  magasin.supprimer('saisie_valeurs', valeurId);
  magasin.supprimer('saisies', saisieId);
}

/** Lit le détail d'un mouvement (forme `DetailMouvement` ; anciennes formes `catégorie` et `nom` tolérées). */
export function lireDetail(d: unknown): DetailMouvement {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { libelle: null, categorie: null };
  const o = d as Record<string, unknown>;
  return { categorie: texteOuNull(o.categorie) ?? texteOuNull(o['catégorie']), libelle: texteOuNull(o.libelle) ?? texteOuNull(o.nom) };
}

// ------------------------------------------------------------------ sous-projet

/** Désigne la métrique qui fait avancer la barre du sous-projet (spec §5). */
export function choisirPilote(spId: string, metriqueId: string): void { magasin.ecrire('sous_projets', { id: spId, metrique_pilote_id: metriqueId }); }
export function renommerSousProjet(spId: string, nom: string): void { if (nom.trim()) magasin.ecrire('sous_projets', { id: spId, nom: nom.trim() }); }
export function changerPeriode(spId: string, debut: Jour, fin: Jour | null): void { magasin.ecrire('sous_projets', { id: spId, debut, fin }); }

// ------------------------------------------------------------------ signature (aucune colonne prévue : gardée sur l'appareil)

const cleSignature = (spId: string) => `luther-life:signature:${spId}`;
export function lireSignature(spId: string): { image: string; le: string } | null {
  try { const t = localStorage.getItem(cleSignature(spId)); return t ? JSON.parse(t) : null; } catch { return null; }
}
export function enregistrerSignature(spId: string, image: string): void {
  try { localStorage.setItem(cleSignature(spId), JSON.stringify({ image, le: new Date().toISOString() })); } catch { /* stockage indisponible */ }
}
