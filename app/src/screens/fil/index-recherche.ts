// Construit l'index de la recherche à partir du magasin : projets, sous-projets, tâches, saisies et notes, rapports.
import { decrire } from '@core/recurrence.ts';
import { dureeLisible } from '@core/units.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { COULEUR_SANS_PROJET, progressionProjet, sousProjetsDe } from '../../data/requetes.ts';
import { cap, dateCourte, dateJourMois, hm, nomCourtRubrique } from './format.ts';
import { progressionsDe } from './vue-blocs.ts';
import { entree, type Entree } from './recherche.ts';

/** Textes d'un rapport, pour la recherche (son contenu est du JSON libre). */
function textes(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textes).join(' ');
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).map(textes).join(' ');
  return '';
}

export function construireIndex(aujourdhui: Jour, couleur: (c: string) => string): Entree[] {
  const { rubriques, projets, sous_projets, taches, saisies, saisie_valeurs, occurrences, rapports, points_rapport } = magasin.lignes;
  const mois = aujourdhui.slice(0, 7);
  const rub = new Map(rubriques.map((r) => [r.id, r]));
  const proj = new Map(projets.map((p) => [p.id, p]));
  const couleurProjet = (pid: string | null | undefined) => couleur((pid && rub.get(proj.get(pid)?.rubrique_id ?? '')?.couleur) || COULEUR_SANS_PROJET);
  const res: Entree[] = [];

  for (const p of projets) {
    if (p.statut === 'archive') continue;
    const r = rub.get(p.rubrique_id);
    if (!r || r.archivee) continue;
    const n = sousProjetsDe(p.id).length;
    const pct = progressionProjet(p.id, mois, aujourdhui);
    const codes = points_rapport.filter((x) => x.projet_id === p.id).map((x) => x.code);
    res.push(entree('projets', p.nom, `${nomCourtRubrique(r.nom)} · ${n} sous-projet${n > 1 ? 's' : ''}${pct != null ? ` · ${pct} %` : ''}`, couleur(r.couleur), `/projets?projet=${p.id}`, [r.nom, ...codes]));
  }

  const sps = sous_projets.filter((s) => s.statut !== 'archive');
  for (const pr of progressionsDe(sps, mois, aujourdhui)) {
    const s = pr.sp, p = proj.get(s.projet_id);
    const f = s.fiche;
    res.push(entree('sous', s.nom, `${p?.nom ?? ''} · ${pr.texte} · ${pr.pct} %`, couleurProjet(s.projet_id), `/projets/sous-projet/${s.id}`,
      [f?.quoi, f?.pourquoi, f?.qui, f?.ou, f?.quand, f?.comment, f?.combien, s.bilan ?? ''].filter((x): x is string => !!x)));
  }

  for (const t of taches) {
    if (!t.actif) continue;
    const p = t.projet_id ? proj.get(t.projet_id) : undefined;
    res.push(entree('taches', t.titre, `${cap(decrire(t.regle))} · ${hm(t.heure_debut)} – ${hm(t.heure_debut + t.duree_min)} · ${p?.nom ?? 'sans projet'}`, couleurProjet(t.projet_id), `/tache/${t.id}`));
  }

  const tachesParOcc = new Map(occurrences.map((o) => [o.id, o.tache_id]));
  const tacheTitre = new Map(taches.map((t) => [t.id, t.titre]));
  const valeursPar = new Map<string, typeof saisie_valeurs>();
  for (const v of saisie_valeurs) { const l = valeursPar.get(v.saisie_id); if (l) l.push(v); else valeursPar.set(v.saisie_id, [v]); }
  for (const s of [...saisies].sort((a, b) => b.jour.localeCompare(a.jour))) {
    const quoi = (s.occurrence_id && tacheTitre.get(tachesParOcc.get(s.occurrence_id) ?? '')) || (s.projet_id && proj.get(s.projet_id)?.nom) || 'Saisie';
    const href = (s.jour === aujourdhui ? '/?' : `/?jour=${s.jour}&`) + (s.occurrence_id ? `bloc=${s.occurrence_id}` : '');
    const vals = valeursPar.get(s.id) ?? [];
    if (s.note) res.push(entree('notes', s.note, `${dateCourte(s.jour)} · ${quoi} · note`, couleurProjet(s.projet_id), href));
    const txt = vals.map((v) => v.valeur_txt).filter((x): x is string => !!x);
    if (txt.length) {
      const temps = vals.find((v) => v.cle === 'temps')?.valeur_num;
      res.push(entree('notes', txt.join(' · ') + (temps ? ` · ${dureeLisible(temps)}` : ''), `${dateCourte(s.jour)} · ${quoi} · saisie`, couleurProjet(s.projet_id), href));
    }
  }

  const couleurRapport = couleur(rubriques.find((r) => r.cle === 'transversal')?.couleur ?? COULEUR_SANS_PROJET);
  for (const r of [...rapports].sort((a, b) => b.jour.localeCompare(a.jour))) {
    const t = textes(r.contenu);
    res.push(entree('rapports', `Rapport du ${dateJourMois(r.jour)}`, t.slice(0, 80) || 'Rapport quotidien', couleurRapport, `/rapports?jour=${r.jour}`, [t, 'rapport']));
  }
  return res;
}
