// PDF de la journée (spec §9, nov. 2026) : recap de l'avancement des projets en cours, puis le tableau des créneaux effectués, vides compris.
// La construction des lignes est pure (testée) ; `documentJournee` lit le magasin ; `htmlJournee` écrit la page A4 imprimée par `imprimer`.
import { moyennePct } from '@core/progression.ts';
import type { Jour } from '@core/types.ts';
import { blocsDuJour, progressionProjet, projetsDe, rubriques, sousProjetsDe, profil } from '../../data/requetes.ts';
import { maintenantLocal } from '../../data/temps.svelte.ts';
import { couleurRubrique } from '../../ui/couleurs.ts';
import { cap, dateLongue, formatValeur } from './format.ts';
import { abreger, mesuresDuBloc, progressionsDe, tempsDuBloc } from './vue-blocs.ts';
import { projetEnCours } from './tache.ts';
import { notesDuJour } from '../../data/actions/notes.ts';
import { blocsDeNote, type BlocNote } from '../carnet/riche.ts';
import { provenance } from '../carnet/carnet.ts';

/** « 1h12 », « 14h05 », « 0h00 » : l'heure comme on la dit, sans zéro devant les heures. */
export const hmCourt = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min) % 60).padStart(2, '0')}`;
/** « 1h01 » à partir d'une heure, « 45 min » en dessous. */
export function dureeCourte(secondes: number): string {
  const min = Math.round(secondes / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export interface EntreeFait { debut: number; fin: number; titre: string; secondes: number; detail: string[]; projets: string[] }
export interface LigneJournee { type: 'fait' | 'vide'; creneau: string; activite: string; detail: string[]; projets: string; debut: number; fin: number }
/** Un trou plus court que cela n'est pas une ligne. */
export const VIDE_MIN = 5;

/** Les lignes du tableau, dans l'ordre de la journée : un bloc fait par ligne, un « vide » pour chaque trou d'au moins 5 min entre 0h00 et `finJournee`. */
export function construireLignes(entrees: EntreeFait[], finJournee: number): LigneJournee[] {
  const faits = [...entrees].sort((a, z) => a.debut - z.debut || a.fin - z.fin);
  const lignes: LigneJournee[] = faits.map((e) => ({
    type: 'fait', creneau: `${hmCourt(e.debut)}–${hmCourt(e.fin)}`, activite: `${dureeCourte(e.secondes)} de ${e.titre}`, detail: e.detail, projets: e.projets.length ? e.projets.join(' + ') : '--', debut: e.debut, fin: e.fin
  }));
  const vides: LigneJournee[] = [];
  let couvert = 0; // tout ce qui précède est couvert par un bloc ou déjà signalé
  // Un vide commence une minute après le bloc qui précède et finit une minute avant celui qui suit (« 1h12–2h13 », puis « 2h14–3h15 : vide ») ;
  // aux bords de la journée (0h00, maintenant ou 24h00), il va jusqu'au bord.
  const trou = (a: number, b: number, apresBloc: boolean, avantBloc: boolean) => {
    if (b - a < VIDE_MIN) return;
    const debut = apresBloc ? a + 1 : a, fin = avantBloc ? b - 1 : b;
    vides.push({ type: 'vide', creneau: `${hmCourt(debut)}–${hmCourt(fin)}`, activite: 'vide', detail: [], projets: '--', debut, fin });
  };
  for (const e of faits) { trou(couvert, Math.min(e.debut, finJournee), couvert > 0, true); couvert = Math.max(couvert, e.fin); }
  if (couvert < finJournee) trou(couvert, finJournee, couvert > 0, false);
  return [...lignes, ...vides].sort((a, z) => a.debut - z.debut || (a.type === 'vide' ? -1 : 1) - (z.type === 'vide' ? -1 : 1));
}

export interface BarreProjet { nom: string; pct: number | null; texte?: string; sousProjets?: BarreProjet[] }
export interface GroupeRubrique { nom: string; couleur: string; projets: BarreProjet[] }
/** Une note du Carnet de ce jour : numéro, provenance (« Note libre · 14:03 ») et contenu en blocs. */
export interface NotePdf { numero: number; provenance: string; blocs: BlocNote[] }
export interface DocumentJournee { notes: NotePdf[]; titre: string; sousTitre: string; nom: string; moyenne: number | null; groupes: GroupeRubrique[]; lignes: LigneJournee[]; nbFaits: number; totalSecondes: number; genereLe: string }

/** Le document d'un jour : avancement des projets en cours (à la date de ce jour) et créneaux effectués. */
export function documentJournee(jour: Jour, aujourdhui: Jour, maintenantMin = maintenantLocal().minutes): DocumentJournee {
  const mois = jour.slice(0, 7);
  const blocs = blocsDuJour(jour).filter((b) => b.fait);
  const entrees: EntreeFait[] = blocs.map((b) => {
    const fin = b.reelFinMin ?? b.finMin;
    const vivants = b.sousProjets.filter((s) => s.statut === 'en_cours' || s.statut === 'a_valider').map((s) => s.nom);
    const secondes = tempsDuBloc(b) || (fin - b.reelDebutMin) * 60;
    const detail = mesuresDuBloc(b).filter((m) => m.type !== 'temps' && m.type !== 'reference' && m.realise > 0).map((m) => `${m.label} : ${formatValeur(m.type, m.realise, abreger(m.unite), m.options)}`);
    return { debut: b.reelDebutMin, fin, titre: b.titre, secondes, detail, projets: vivants.length ? vivants : b.projet ? [b.projet.nom] : [] };
  });
  const groupes: GroupeRubrique[] = [];
  const toutes: (number | null)[] = [];
  for (const r of rubriques()) {
    const projets: BarreProjet[] = [];
    for (const p of projetsDe(r.id)) {
      const sps = sousProjetsDe(p.id);
      if (!projetEnCours(p.statut, sps.map((s) => s.statut))) continue;
      const vivants = sps.filter((s) => s.statut === 'en_cours' || s.statut === 'a_valider');
      if (!vivants.length) continue; // rien à mesurer : un projet sans sous-projet en cours n'a pas d'avancement
      const pct = progressionProjet(p.id, mois, jour);
      toutes.push(pct);
      projets.push({ nom: p.nom, pct, sousProjets: progressionsDe(vivants, mois, jour).map((x) => ({ nom: x.sp.nom, pct: x.pct, texte: x.texte })) });
    }
    if (projets.length) groupes.push({ nom: r.nom, couleur: couleurRubrique(r.couleur, 'jour'), projets });
  }
  const notes: NotePdf[] = notesDuJour(jour).map((n) => ({
    numero: n.numero, provenance: provenance(n),
    blocs: n.contenu ? blocsDeNote(n.contenu) : n.texte.split('\n').map((l): BlocNote => ({ type: 'p', segments: [{ texte: l }] }))
  }));
  return {
    notes, titre: `Ma journée · ${cap(dateLongue(jour))}`, sousTitre: 'Créneaux effectués et avancement des projets en cours', nom: `${profil()?.prenom ?? 'Luther'} Life`,
    moyenne: moyennePct(toutes), groupes, lignes: construireLignes(entrees, jour === aujourdhui ? maintenantMin : 1440),
    nbFaits: entrees.length, totalSecondes: entrees.reduce((t, e) => t + e.secondes, 0), genereLe: new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' })
  };
}

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const bornePct = (p: number | null) => Math.max(0, Math.min(100, Math.round(p ?? 0)));

function barre(b: BarreProjet, couleur: string, fine = false): string {
  const p = bornePct(b.pct);
  return `<div class="proj${fine ? ' sp' : ''}"><div class="ligne"><span class="nom">${echapper(b.nom)}${b.texte ? ` <small>· ${echapper(b.texte)}</small>` : ''}</span><b>${b.pct == null ? '—' : `${p} %`}</b></div>`
    + `<div class="piste"><div class="rempli" style="width:${p}%;background:${echapper(couleur)}"></div></div></div>`;
}

const texteDe = (segs: { texte: string }[]) => echapper(segs.map((x) => x.texte).join('')).replace(/\n/g, '<br>');
function notesHtml(notes: NotePdf[]): string {
  if (!notes.length) return '';
  const corps = notes.map((n) => `<section class="note"><div class="ref"><b>n° ${n.numero}</b> · ${echapper(n.provenance)}</div>` + n.blocs.map((b) => {
    if (b.type === 'sep') return '<hr>';
    if (b.type === 'media') return `<p class="med">[${b.media === 'video' ? 'Vidéo' : 'Image'}]</p>`;
    if (b.type === 'liste') return `<${b.ordonnee ? 'ol' : 'ul'}>${b.items.map((i) => `<li>${texteDe(i.segments)}</li>`).join('')}</${b.ordonnee ? 'ol' : 'ul'}>`;
    const tag = b.type === 'citation' ? 'blockquote' : b.type;
    return `<${tag}>${texteDe(b.segments)}</${tag}>`;
  }).join('') + '</section>').join('');
  return `<h2>Notes du jour</h2>${corps}`;
}

/** Page HTML autonome et imprimable (A4) : l'avancement des projets en cours, puis le tableau des créneaux. */
export function htmlJournee(doc: DocumentJournee): string {
  const recap = doc.groupes.map((g) => `<section class="groupe"><h3><span class="pastille" style="background:${echapper(g.couleur)}"></span>${echapper(g.nom)}</h3>`
    + g.projets.map((p) => barre(p, g.couleur) + (p.sousProjets ?? []).map((s) => barre(s, g.couleur, true)).join('')).join('') + '</section>').join('');
  const lignes = doc.lignes.map((l) => l.type === 'vide'
    ? `<tr class="vide"><td class="c">${echapper(l.creneau)}</td><td>vide</td><td>--</td></tr>`
    : `<tr><td class="c">${echapper(l.creneau)}</td><td><b>${echapper(l.activite)}</b>${l.detail.map((d) => `<br><small>${echapper(d)}</small>`).join('')}</td><td>${echapper(l.projets)}</td></tr>`).join('');
  const moyenne = doc.moyenne == null ? '' : `<div class="moyenne"><span>Avancement moyen des projets en cours</span><b>${bornePct(doc.moyenne)} %</b></div><div class="piste grande"><div class="rempli" style="width:${bornePct(doc.moyenne)}%;background:#16171b"></div></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(doc.titre)}</title><style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10.5pt/1.35 -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #16171b; background: #fff; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #16171b; padding-bottom: 7pt; margin-bottom: 10pt; }
h1 { margin: 0; font-size: 19pt; letter-spacing: -0.01em; }
.sous { color: #5e6068; font-size: 9.5pt; }
.total { text-align: right; font-size: 9.5pt; color: #5e6068; }
.total b { display: block; font-size: 16pt; color: #16171b; }
h2 { margin: 12pt 0 6pt; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.07em; color: #5e6068; }
.moyenne { display: flex; justify-content: space-between; align-items: baseline; font-size: 10pt; margin-bottom: 3pt; }
.moyenne b { font-size: 14pt; }
.piste { height: 6pt; border-radius: 3pt; background: #ebe9e3; overflow: hidden; }
.piste.grande { height: 9pt; border-radius: 4.5pt; margin-bottom: 8pt; }
.rempli { height: 100%; border-radius: inherit; }
.groupe { break-inside: avoid; margin-bottom: 7pt; }
h3 { margin: 0 0 3pt; font-size: 10pt; }
.pastille { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 5pt; }
.proj { margin: 0 0 4pt; }
.proj.sp { margin-left: 12pt; }
.proj.sp .piste { height: 3.5pt; }
.ligne { display: flex; justify-content: space-between; gap: 8pt; font-size: 9.5pt; margin-bottom: 1.5pt; }
.proj.sp .ligne { font-size: 8.5pt; color: #45474e; }
small { color: #5e6068; font-weight: 400; }
table { width: 100%; border-collapse: collapse; margin-top: 2pt; }
th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #5e6068; border-bottom: 1.5px solid #16171b; padding: 4pt 6pt; }
td { padding: 5pt 6pt; border-bottom: 1px solid #e3e1db; vertical-align: top; }
tr { break-inside: avoid; }
td.c { width: 78pt; font-family: ui-monospace, Menlo, monospace; font-size: 9.5pt; white-space: nowrap; }
tr.vide td { color: #8a8c93; font-style: italic; background: #f7f6f3; }
tr.vide td.c { font-style: normal; }
tfoot td { border-top: 2px solid #16171b; border-bottom: 0; padding-top: 7pt; font-size: 11pt; font-weight: 600; }
tfoot td b { font-size: 13pt; }
section.note { break-inside: avoid; margin-bottom: 9pt; }
.ref { font-size: 8.5pt; color: #5e6068; margin-bottom: 2pt; }
section.note p, section.note ul, section.note ol, section.note blockquote { margin: 0 0 4pt; }
section.note h1 { font-size: 14pt; } section.note h2 { font-size: 12pt; margin: 4pt 0 2pt; letter-spacing: 0; text-transform: none; color: #16171b; }
section.note blockquote { border-left: 2pt solid #c9c7c0; padding-left: 8pt; color: #5e6068; font-style: italic; }
.med { color: #8a8c93; font-style: italic; }
footer { margin-top: 12pt; font-size: 8pt; color: #8a8c93; }
</style></head><body>
<header><div><h1>${echapper(doc.titre)}</h1><div class="sous">${echapper(doc.sousTitre)} · ${echapper(doc.nom)}</div></div>
<div class="total"><b>${doc.totalSecondes ? echapper(dureeCourte(doc.totalSecondes)) : '0 min'}</b>${doc.nbFaits} activité${doc.nbFaits > 1 ? 's' : ''}</div></header>
${recap ? `<h2>Avancement des projets en cours</h2>${moyenne}${recap}` : ''}
<h2>Créneaux effectués</h2>
<table><thead><tr><th>Créneau</th><th>Activité effectuée</th><th>Projets en cours impliqués</th></tr></thead><tbody>${lignes}</tbody>
<tfoot><tr><td colspan="2">Temps total de travail investi sur 24 h</td><td><b>${doc.totalSecondes ? echapper(dureeCourte(doc.totalSecondes)) : '0 min'}</b></td></tr></tfoot></table>
${notesHtml(doc.notes)}
<footer>Luther Life · généré le ${echapper(doc.genereLe)}</footer>
</body></html>`;
}

/** Vrai si la journée peut s'exporter (pas un jour à venir). */
export const exportable = (jour: Jour, aujourdhui: Jour) => jour <= aujourdhui;
