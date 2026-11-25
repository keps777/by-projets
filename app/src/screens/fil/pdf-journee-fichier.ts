// PDF de la journée en vrai fichier (spec §9, nov. 2026) : dessiné avec jsPDF, chargé seulement à l'export. Recap des projets en cours avec barres,
// tableau des créneaux (vides compris), temps total, puis les notes du jour mises en forme, images comprises.
import type { jsPDF } from 'jspdf';
import { urlMedia } from '../../data/media.svelte.ts';
import type { BlocNote, Segment } from '../carnet/riche.ts';
import { dureeCourte, etatMetrique, LIBELLE_ETAT, type BarreProjet, type DocumentJournee, type EtatAvancement, type LigneJournee, type MetriqueJour } from './pdf-journee.ts';

/** Une image de note, prête à être posée dans le PDF (JPEG réduit). */
export interface ImagePdf { donnees: string; largeur: number; hauteur: number }

const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
/** Les polices de base d'un PDF n'ont que le latin (Windows-1252) : le reste est ramené à son équivalent simple, sinon retiré. */
export function versWinAnsi(texte: string): string {
  let sortie = '';
  for (const c of texte.replace(/ | /g, ' ')) {
    const n = c.codePointAt(0)!;
    if (c === '\n' || (n >= 0x20 && n <= 0x7e) || (n >= 0xa1 && n <= 0xff) || CP1252_EXTRA.has(c)) sortie += c;
    else if (n === 0xa0 || c === ' ') sortie += ' ';
    else { const base = c.normalize('NFKD').replace(/[^\x20-\x7e]/g, ''); sortie += base; }
  }
  return sortie;
}

/** « #8E7CFF » ou « rgb(…) » → [r, g, b] (gris foncé si illisible). */
export function rgbDe(couleur: string): [number, number, number] {
  const h = /^#([0-9a-f]{6})$/i.exec(couleur.trim());
  if (h) { const n = parseInt(h[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const r = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(couleur);
  return r ? [+r[1], +r[2], +r[3]] : [85, 87, 94];
}

const LARGEUR = 210, HAUTEUR = 297, MARGE = 14, UTILE = LARGEUR - 2 * MARGE, BAS = HAUTEUR - 16;
const ENCRE: [number, number, number] = [22, 23, 27], GRIS: [number, number, number] = [94, 96, 104], PALE: [number, number, number] = [138, 140, 147], FILET: [number, number, number] = [227, 225, 219], PISTE: [number, number, number] = [235, 233, 227];

const VERT: [number, number, number] = [30, 127, 79], ORANGE: [number, number, number] = [217, 140, 20], ROUGE: [number, number, number] = [194, 54, 43];
const COULEUR_ETAT: Record<EtatAvancement, [number, number, number]> = { atteint: VERT, rythme: VERT, leger: ORANGE, retard: ROUGE, neutre: PALE };
const COULEUR_METRIQUE = { bon: VERT, moyen: ORANGE, mauvais: ROUGE, neutre: PALE } as const;
/** Largeur du tableau quand l'encart des métriques est à sa droite (première page). */

class Dessin {
  y = MARGE;
  /** Largeur actuelle du tableau (réduite à côté de l'encart des métriques, pleine page ensuite). */
  largeurTable = UTILE;
  constructor(readonly d: jsPDF) {}

  texteCouleur(c: [number, number, number]) { this.d.setTextColor(c[0], c[1], c[2]); }
  fond(c: [number, number, number]) { this.d.setFillColor(c[0], c[1], c[2]); }
  trait(c: [number, number, number], e = 0.2) { this.d.setDrawColor(c[0], c[1], c[2]); this.d.setLineWidth(e); }
  police(taille: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal') { this.d.setFont('helvetica', style); this.d.setFontSize(taille); }
  /** Passe à la page suivante si `h` mm ne tiennent plus. Rend vrai quand une page a été ajoutée. */
  place(h: number): boolean { if (this.y + h <= BAS) return false; this.d.addPage(); this.y = MARGE; return true; }
  /** Largeur du texte en mm (police et taille courantes). */
  largeur(t: string): number { return this.d.getTextWidth(versWinAnsi(t)); }
  mots(t: string, w: number): string[] { return this.d.splitTextToSize(versWinAnsi(t), w) as string[]; }
  page(): number { return this.d.getCurrentPageInfo().pageNumber; }
}

/** Jauge arrondie ; `repere` (%) : petit trait là où l'on devrait être aujourd'hui. */
function barre(g: Dessin, x: number, y: number, w: number, h: number, pct: number | null, couleur: [number, number, number], repere: number | null = null) {
  g.fond(PISTE); g.d.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  const p = Math.max(0, Math.min(100, pct ?? 0));
  if (p > 0) { g.fond(couleur); g.d.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2, h / 2, 'F'); }
  if (repere != null && repere > 0 && repere < 100) {
    const rx = x + (w * repere) / 100;
    g.trait(ENCRE, 0.45); g.d.line(rx, y - 0.9, rx, y + h + 0.9);
  }
}


// ------------------------------------------------------------------ tableau de la journée (à gauche) et métriques du jour (à droite)

const colonnes = (w: number) => { const creneau = w < 150 ? 25 : 31; const activite = Math.round((w - creneau) * 0.55); return { creneau, activite, projets: w - creneau - activite }; };

function enteteTableau(g: Dessin) {
  const c = colonnes(g.largeurTable);
  g.police(7.5, 'bold'); g.texteCouleur(GRIS);
  g.d.text('CRÉNEAU', MARGE + 1.5, g.y + 3.6);
  g.d.text('ACTIVITÉ EFFECTUÉE', MARGE + c.creneau + 1.5, g.y + 3.6);
  g.d.text(g.largeurTable < 150 ? 'PROJETS EN COURS' : 'PROJETS EN COURS IMPLIQUÉS', MARGE + c.creneau + c.activite + 1.5, g.y + 3.6);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 5.4, MARGE + g.largeurTable, g.y + 5.4);
  g.y += 6;
}

function ligneTableau(g: Dessin, l: LigneJournee): void {
  const c = colonnes(g.largeurTable);
  const vide = l.type === 'vide';
  g.police(9.5, vide ? 'italic' : 'bold');
  const act = g.mots(l.activite, c.activite - 3);
  g.police(9.5, 'normal');
  const proj = g.mots(l.projets, c.projets - 3);
  g.police(8, 'normal');
  const detail = l.detail.flatMap((d) => g.mots(d, c.activite - 3));
  const h = Math.max(act.length * 4.4 + detail.length * 3.7, proj.length * 4.4) + 3.6;
  if (g.place(h)) { g.largeurTable = UTILE; enteteTableau(g); return ligneTableau(g, l); } // page suivante : le tableau reprend toute la largeur
  if (vide) { g.fond([246, 245, 241]); g.d.rect(MARGE, g.y, g.largeurTable, h, 'F'); }
  const y0 = g.y + 4.4;
  g.texteCouleur(vide ? PALE : ENCRE);
  g.d.setFont('courier', 'normal'); g.d.setFontSize(g.largeurTable < 150 ? 8.2 : 9);
  g.d.text(versWinAnsi(l.creneau), MARGE + 1.5, y0);
  g.police(9.5, vide ? 'italic' : 'bold'); g.texteCouleur(vide ? PALE : ENCRE);
  act.forEach((t, i) => g.d.text(t, MARGE + c.creneau + 1.5, y0 + i * 4.4));
  g.police(8, 'normal'); g.texteCouleur(GRIS);
  detail.forEach((t, i) => g.d.text(t, MARGE + c.creneau + 1.5, y0 + act.length * 4.4 + i * 3.7 - 0.4));
  g.police(9.5, 'normal'); g.texteCouleur(vide ? PALE : ENCRE);
  proj.forEach((t, i) => g.d.text(t, MARGE + c.creneau + c.activite + 1.5, y0 + i * 4.4));
  g.trait(FILET, 0.2); g.d.line(MARGE, g.y + h, MARGE + g.largeurTable, g.y + h);
  g.y += h;
}

function tableau(g: Dessin, doc: DocumentJournee) {
  g.place(30);
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('CRÉNEAUX EFFECTUÉS', MARGE, g.y + 3);
  g.y += 6;
  enteteTableau(g);
  for (const l of doc.lignes) ligneTableau(g, l);
  g.place(11);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 1, MARGE + g.largeurTable, g.y + 1);
  g.police(g.largeurTable < 150 ? 9.5 : 11, 'bold'); g.texteCouleur(ENCRE);
  g.d.text(g.mots('Temps total de travail investi sur 24 h', g.largeurTable - 30), MARGE + 1.5, g.y + 6.2);
  g.police(13, 'bold');
  g.d.text(doc.totalSecondes ? dureeCourte(doc.totalSecondes) : '0 min', MARGE + g.largeurTable - 1.5, g.y + 7.2, { align: 'right' });
  g.y += 12;
}

/** « Métriques du jour » sous le tableau, pleine largeur : les points du rapport en grille de 3 colonnes (code, état, mesure, jauge). */
function metriquesEnGrille(g: Dessin, ms: MetriqueJour[]) {
  if (!ms.length) return;
  const COLS = 3, GOUTTIERE = 5, w = (UTILE - 7 - GOUTTIERE * (COLS - 1)) / COLS;
  const mesure = (m: MetriqueJour) => { g.police(8, 'normal'); return g.mots(m.mesures, w - 5); };
  const hCell = (m: MetriqueJour) => 5.6 + mesure(m).length * 3.5 + 4.2;
  const rangs: MetriqueJour[][] = [];
  for (let i = 0; i < ms.length; i += COLS) rangs.push(ms.slice(i, i + COLS));
  const hRangs = rangs.map((r) => Math.max(...r.map(hCell)) + 1);
  const total = 14 + hRangs.reduce((a, b) => a + b, 0) + 2;
  g.place(total + 4);
  g.y += 2;
  const x0 = MARGE, y0 = g.y;
  g.fond([247, 246, 243]); g.trait(FILET, 0.2); g.d.roundedRect(x0, y0, UTILE, total, 2.5, 2.5, 'FD');
  const atteints = ms.filter((m) => m.ratio != null && m.ratio >= 1).length;
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('MÉTRIQUES DU JOUR', x0 + 3.5, y0 + 5);
  g.police(11, 'bold'); g.texteCouleur(ENCRE);
  const score = `${atteints} / ${ms.length}`;
  g.d.text(score, x0 + 3.5, y0 + 11);
  const wScore = g.largeur(score);
  g.police(8, 'normal'); g.texteCouleur(GRIS);
  g.d.text('points atteints', x0 + 3.5 + wScore + 2, y0 + 11);
  let y = y0 + 14;
  rangs.forEach((r, ri) => {
    r.forEach((m, k) => {
      const x = x0 + 3.5 + k * (w + GOUTTIERE);
      const e = etatMetrique(m.ratio);
      const couleur = COULEUR_METRIQUE[e.classe];
      g.fond(m.couleur ? rgbDe(m.couleur) : PALE); g.d.circle(x + 1.4, y + 2.5, 1.2, 'F');
      g.police(9.5, 'bold'); g.texteCouleur(ENCRE);
      g.d.text(versWinAnsi(m.code || m.libelle), x + 4, y + 3.2);
      g.police(8.5, 'bold'); g.texteCouleur(couleur);
      g.d.text(e.texte, x + w, y + 3.2, { align: 'right' });
      g.police(8, 'normal'); g.texteCouleur(GRIS);
      const lignes = mesure(m);
      lignes.forEach((t, j) => g.d.text(t, x + 4, y + 7 + j * 3.5));
      barre(g, x, y + 5.6 + lignes.length * 3.5 - 0.6, w, 1.5, e.classe === 'bon' ? 100 : (m.ratio ?? 0) * 100, couleur);
    });
    y += hRangs[ri];
  });
  g.y = y0 + total + 3;
}

// ------------------------------------------------------------------ suivi des projets, en cartes

const TEXTE_ETAT = (p: BarreProjet) => (p.etat === 'atteint' ? 'Atteint' : p.trait != null && p.etat !== 'neutre' ? `${LIBELLE_ETAT[p.etat]} · repère ${Math.round(p.trait)} %` : LIBELLE_ETAT[p.etat]);

/** Anneau de pourcentage (arc dessiné en petits traits à bouts ronds). */
function anneau(g: Dessin, cx: number, cy: number, r: number, pct: number, couleur: [number, number, number]) {
  g.trait(PISTE, 2.6); g.d.setLineCap('round'); g.d.circle(cx, cy, r, 'S');
  const p = Math.max(0, Math.min(100, pct));
  if (p > 0) {
    g.trait(couleur, 2.6);
    const fin = (p / 100) * 360, pas = 4;
    for (let a = 0; a < fin; a += pas) {
      const a1 = ((-90 + a) * Math.PI) / 180, a2 = ((-90 + Math.min(fin, a + pas + 0.5)) * Math.PI) / 180;
      g.d.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
    }
  }
  g.d.setLineCap('butt');
}

function synthese(g: Dessin, doc: DocumentJournee) {
  const serre = PAS_SP < 6; // suivi resserré : synthèse sur une ligne de moins (pas de légende)
  const h = serre ? 21 : 30;
  g.place(h + 6);
  g.fond([247, 246, 243]); g.trait(FILET, 0.2); g.d.roundedRect(MARGE, g.y, UTILE, h, 2.5, 2.5, 'FD');
  const moy = doc.moyenne ?? 0;
  anneau(g, MARGE + 15, g.y + h / 2, serre ? 6.8 : 8.5, moy, ENCRE);
  g.police(serre ? 10.5 : 13, 'bold'); g.texteCouleur(ENCRE);
  g.d.text(doc.moyenne == null ? '--' : `${Math.round(moy)}%`, MARGE + 15, g.y + h / 2 + (serre ? 1.4 : 1.8), { align: 'center' });
  g.police(9, 'bold'); g.texteCouleur(ENCRE);
  g.d.text('Avancement moyen des projets en cours', MARGE + 30, g.y + (serre ? 6.5 : 8));
  // Les états, en pastilles : le nombre de projets dans chaque cas.
  const ordre: EtatAvancement[] = ['rythme', 'leger', 'retard', 'atteint', 'neutre'];
  let x = MARGE + 30;
  for (const e of ordre) {
    const n = doc.etats[e];
    if (!n) continue;
    const c = COULEUR_ETAT[e];
    g.fond(c); g.d.roundedRect(x, g.y + (serre ? 9.5 : 11.5), 6.5, 6.5, 1.6, 1.6, 'F');
    g.police(10, 'bold'); g.d.setTextColor(255, 255, 255);
    g.d.text(String(n), x + 3.25, g.y + (serre ? 14.2 : 16.2), { align: 'center' });
    g.police(8.5, 'normal'); g.texteCouleur(ENCRE);
    g.d.text(LIBELLE_ETAT[e], x + 8, g.y + (serre ? 14.2 : 16.2));
    x += 8 + g.largeur(LIBELLE_ETAT[e]) + 5;
  }
  g.police(7.5, 'normal'); g.texteCouleur(GRIS);
  if (!serre) { g.fond(ENCRE); g.d.rect(MARGE + 30, g.y + 22.5, 0.5, 3.6, 'F'); }
  if (!serre) g.d.text('Repère : où l’on devrait être aujourd’hui.   Chaque carte : le projet, puis ses sous-projets en cours.', MARGE + 32, g.y + 25.3);
  g.y += h + 5;
}

/** Cartes de projet : 2 par ligne à l'aise, 3 par ligne quand le suivi doit tenir sur une seule page. */
let COLS_CARTES = 2;
let LARGEUR_CARTE = (UTILE - 5) / 2;
/** Pas d'une ligne de sous-projet : 6,8 mm à l'aise ; resserré quand le suivi doit tenir sur une seule page. */
let PAS_SP = 6.8;
/** Espace entre deux lignes de cartes (resserré avec le pas). */
const ecartCartes = () => (PAS_SP < 6 ? 2 : 3);
const hauteurCarte = (p: BarreProjet) => 18 + (p.sousProjets?.length ?? 0) * PAS_SP + 1.5;

function carte(g: Dessin, p: BarreProjet, x: number, y: number, h: number) {
  const c = COULEUR_ETAT[p.etat];
  g.fond([252, 251, 249]); g.trait(FILET, 0.25); g.d.roundedRect(x, y, LARGEUR_CARTE, h, 2.5, 2.5, 'FD');
  g.fond(c); g.d.roundedRect(x, y, 1.6, h, 0.8, 0.8, 'F');
  const pct = p.pct == null ? '--' : `${Math.round(p.pct)}%`;
  g.police(17, 'bold'); g.texteCouleur(c);
  g.d.text(pct, x + LARGEUR_CARTE - 3.5, y + 8, { align: 'right' });
  const wPct = g.largeur(pct) + 4;
  g.police(10, 'bold'); g.texteCouleur(ENCRE);
  g.d.text(g.mots(p.nom, LARGEUR_CARTE - 8 - wPct)[0] ?? '', x + 4.5, y + 5.4);
  g.police(8, 'bold'); g.texteCouleur(c);
  g.d.text(versWinAnsi(TEXTE_ETAT(p)), x + 4.5, y + 10.1);
  barre(g, x + 4.5, y + 12.6, LARGEUR_CARTE - 8, 3.4, p.pct, c, p.trait);
  let yy = y + 18.5;
  for (const s of p.sousProjets ?? []) {
    const cs = COULEUR_ETAT[s.etat];
    g.police(8, 'normal'); g.texteCouleur(GRIS);
    const pcs = s.pct == null ? '--' : `${Math.round(s.pct)}%`;
    g.d.setFont('helvetica', 'bold');
    const wp = g.largeur(pcs) + 3;
    g.d.setFont('helvetica', 'normal');
    g.d.text(g.mots(s.nom + (s.texte ? ` · ${s.texte}` : ''), LARGEUR_CARTE - 9 - wp)[0] ?? '', x + 4.5, yy + (PAS_SP < 6.5 ? (PAS_SP < 5.6 ? 2.2 : 2.4) : 2.6));
    g.d.setFont('helvetica', 'bold'); g.texteCouleur(cs);
    g.d.text(pcs, x + LARGEUR_CARTE - 3.5, yy + (PAS_SP < 6.5 ? (PAS_SP < 5.6 ? 2.2 : 2.4) : 2.6), { align: 'right' });
    barre(g, x + 4.5, yy + (PAS_SP < 6.5 ? (PAS_SP < 5.6 ? 3.2 : 3.5) : 3.9), LARGEUR_CARTE - 8, 1.5, s.pct, cs, s.trait);
    yy += PAS_SP;
  }
}

/** Hauteur du suivi complet (titre, synthèse, groupes et cartes) pour le pas courant. */
function hauteurSuivi(doc: DocumentJournee): number {
  let h = 8 + (PAS_SP < 6 ? 21 : 30) + 5;
  for (const groupe of doc.groupes) {
    h += 7;
    for (let i = 0; i < groupe.projets.length; i += COLS_CARTES) h += Math.max(...groupe.projets.slice(i, i + COLS_CARTES).map(hauteurCarte)) + ecartCartes();
    h += 2;
  }
  return h;
}

/** Le suivi commence sur sa propre page et tient sur une seule si possible : on resserre les sous-projets au besoin. */
function suivi(g: Dessin, doc: DocumentJournee) {
  if (!doc.groupes.length) return;
  g.d.addPage(); g.y = MARGE;
  g.police(9, 'normal'); g.texteCouleur(GRIS);
  g.d.text(versWinAnsi(`${doc.titre} · ${doc.sousTitre}`), MARGE, g.y + 3);
  g.y += 6;
  const dispo = BAS - g.y;
  for (const [cols, pas] of [[2, 6.8], [2, 5.8], [3, 6.8], [3, 5.8], [3, 5.2]] as const) {
    COLS_CARTES = cols; PAS_SP = pas; LARGEUR_CARTE = (UTILE - 5 * (cols - 1)) / cols;
    if (hauteurSuivi(doc) <= dispo) break;
  }
  g.place(46);
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('SUIVI DES PROJETS EN COURS', MARGE, g.y + 3);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 5, MARGE + UTILE, g.y + 5);
  g.y += 8;
  synthese(g, doc);
  for (const groupe of doc.groupes) {
    const c = rgbDe(groupe.couleur);
    g.place(7 + hauteurCarte(groupe.projets[0]) + ecartCartes());
    g.fond(c); g.d.circle(MARGE + 1.6, g.y + 2.6, 1.5, 'F');
    g.police(11, 'bold'); g.texteCouleur(ENCRE);
    g.d.text(versWinAnsi(groupe.nom), MARGE + 5.5, g.y + 3.6);
    const pcts = groupe.projets.map((p) => p.pct).filter((p): p is number => p != null);
    if (pcts.length) { g.police(8.5, 'normal'); g.texteCouleur(GRIS); g.d.text(`moyenne ${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)} %`, MARGE + UTILE, g.y + 3.6, { align: 'right' }); }
    g.y += 7;
    for (let i = 0; i < groupe.projets.length; i += COLS_CARTES) {
      const paire = groupe.projets.slice(i, i + COLS_CARTES);
      const h = Math.max(...paire.map(hauteurCarte));
      g.place(h + ecartCartes());
      paire.forEach((p, k) => carte(g, p, MARGE + k * (LARGEUR_CARTE + 5), g.y, h));
      g.y += h + ecartCartes();
    }
    g.y += 2;
  }
}

// ------------------------------------------------------------------ notes mises en forme

interface Mot { texte: string; style: 'normal' | 'bold' | 'italic' | 'bolditalic'; souligne: boolean; barre: boolean; lien: boolean; espace: boolean }

function motsDe(segments: Segment[], gras: boolean): (Mot | 'saut')[] {
  const res: (Mot | 'saut')[] = [];
  for (const s of segments) {
    const style = (gras || s.gras) && s.italique ? 'bolditalic' : gras || s.gras ? 'bold' : s.italique ? 'italic' : 'normal';
    for (const [i, morceau] of s.texte.split('\n').entries()) {
      if (i > 0) res.push('saut');
      for (const m of versWinAnsi(morceau).split(/(\s+)/)) {
        if (!m) continue;
        res.push({ texte: /^\s+$/.test(m) ? ' ' : m, style, souligne: !!s.souligne, barre: !!s.barre, lien: !!s.lien, espace: /^\s+$/.test(m) });
      }
    }
  }
  return res;
}

/** Écrit des segments mis en forme, à la ligne selon la largeur, à partir de (x, y courant). Rend la hauteur écrite. */
function paragraphe(g: Dessin, segments: Segment[], x: number, largeur: number, taille: number, opts: { gras?: boolean; couleur?: [number, number, number]; interligne?: number; apres?: number } = {}) {
  const inter = opts.interligne ?? taille * 0.42;
  const lignes: Mot[][] = [[]];
  let w = 0;
  g.police(taille, 'normal');
  for (const m of motsDe(segments, !!opts.gras)) {
    if (m === 'saut') { lignes.push([]); w = 0; continue; }
    g.d.setFont('helvetica', m.style);
    const mw = g.d.getTextWidth(m.texte);
    if (!m.espace && w + mw > largeur && lignes[lignes.length - 1].some((x2) => !x2.espace)) { lignes.push([]); w = 0; }
    if (m.espace && w === 0) continue;
    lignes[lignes.length - 1].push(m);
    w += mw;
  }
  for (const ligne of lignes) {
    while (ligne.length && ligne[ligne.length - 1].espace) ligne.pop();
    g.place(inter + 0.6);
    let cx = x;
    const base = g.y + taille * 0.3;
    for (const m of ligne) {
      g.d.setFont('helvetica', m.style); g.d.setFontSize(taille);
      const mw = g.d.getTextWidth(m.texte);
      g.texteCouleur(m.lien ? [37, 99, 180] : opts.couleur ?? ENCRE);
      if (!m.espace) g.d.text(m.texte, cx, base);
      if (m.souligne && !m.espace) { g.trait(m.lien ? [37, 99, 180] : opts.couleur ?? ENCRE, 0.15); g.d.line(cx, base + 0.6, cx + mw, base + 0.6); }
      if (m.barre && !m.espace) { g.trait(opts.couleur ?? ENCRE, 0.15); g.d.line(cx, base - taille * 0.12, cx + mw, base - taille * 0.12); }
      cx += mw;
    }
    g.y += inter;
  }
  g.y += opts.apres ?? 1.6;
}

function blocNote(g: Dessin, b: BlocNote, images: Map<string, ImagePdf>) {
  switch (b.type) {
    case 'h1': g.y += 1.2; paragraphe(g, b.segments, MARGE, UTILE, 14, { gras: true, apres: 1.8 }); break;
    case 'h2': g.y += 0.8; paragraphe(g, b.segments, MARGE, UTILE, 11.5, { gras: true, apres: 1.4 }); break;
    case 'h3': paragraphe(g, b.segments, MARGE, UTILE, 10.5, { gras: true, apres: 1.2 }); break;
    case 'p': paragraphe(g, b.segments, MARGE, UTILE, 10, { apres: 1.8 }); break;
    case 'citation': {
      const y0 = g.y;
      paragraphe(g, b.segments.map((s) => ({ ...s, italique: true })), MARGE + 6, UTILE - 6, 10, { couleur: GRIS, apres: 1 });
      g.trait([180, 178, 170], 0.7); g.d.line(MARGE + 2, y0, MARGE + 2, g.y - 1);
      g.y += 1; break;
    }
    case 'liste': {
      let n = 0;
      for (const it of b.items) {
        const x = MARGE + 3 + it.niveau * 5;
        const puce = b.ordonnee ? `${++n}.` : '•';
        const yAvant = g.y;
        g.police(10, 'normal'); g.texteCouleur(ENCRE);
        g.place(5);
        g.d.text(puce, x, g.y + 3.2);
        paragraphe(g, it.segments, x + 5, UTILE - 3 - it.niveau * 5 - 5, 10, { apres: 0.6 });
        if (g.y === yAvant) g.y += 4;
      }
      g.y += 1.2; break;
    }
    case 'sep': g.place(4); g.trait(FILET, 0.3); g.d.line(MARGE, g.y + 1.5, MARGE + UTILE, g.y + 1.5); g.y += 4; break;
    case 'media': {
      const im = b.media === 'image' ? images.get(b.id) : undefined;
      if (im) {
        const ratio = im.hauteur / im.largeur;
        let w = Math.min(120, UTILE), h = w * ratio;
        if (h > 95) { h = 95; w = h / ratio; }
        g.place(h + 3);
        g.d.addImage(im.donnees, 'JPEG', MARGE, g.y, w, h);
        g.y += h + 3;
      } else {
        g.police(9, 'italic'); g.texteCouleur(PALE); g.place(6);
        g.d.text(b.media === 'video' ? '[Vidéo — à voir dans l’application]' : '[Image indisponible]', MARGE, g.y + 3.5);
        g.y += 6;
      }
      break;
    }
  }
}

function notes(g: Dessin, doc: DocumentJournee, images: Map<string, ImagePdf>) {
  if (!doc.notes.length) return;
  g.y += 3;
  g.place(24);
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('NOTES DU JOUR', MARGE, g.y + 3);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 5, MARGE + UTILE, g.y + 5);
  g.y += 8;
  for (const n of doc.notes) {
    g.place(14);
    g.police(8.5, 'bold'); g.texteCouleur(GRIS);
    const num = `n° ${n.numero}`;
    g.d.text(num, MARGE, g.y + 3);
    g.police(8.5, 'normal');
    g.d.text(` · ${versWinAnsi(n.provenance)}`, MARGE + g.largeur(num) + 0.4, g.y + 3);
    g.y += 6;
    for (const b of n.blocs) blocNote(g, b, images);
    g.trait(FILET, 0.2); g.d.line(MARGE, g.y + 0.5, MARGE + UTILE, g.y + 0.5);
    g.y += 5;
  }
}

/** Dessine le PDF de la journée. `images` : les images des notes par identifiant de média (voir `chargerImages`). */
export async function genererPdf(doc: DocumentJournee, images: Map<string, ImagePdf> = new Map()): Promise<Blob> {
  const { jsPDF: PDF } = await import('jspdf');
  const d = new PDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  d.setProperties({ title: versWinAnsi(doc.titre), subject: 'Journée Luther Life', creator: 'Luther Life' });
  const g = new Dessin(d);

  // En-tête
  g.police(17, 'bold'); g.texteCouleur(ENCRE);
  g.d.text(versWinAnsi(doc.titre), MARGE, g.y + 6);
  g.police(9, 'normal'); g.texteCouleur(GRIS);
  g.d.text(versWinAnsi(`${doc.sousTitre} · ${doc.nom}`), MARGE, g.y + 11.5);
  g.police(16, 'bold'); g.texteCouleur(ENCRE);
  g.d.text(doc.totalSecondes ? dureeCourte(doc.totalSecondes) : '0 min', MARGE + UTILE, g.y + 6, { align: 'right' });
  g.police(9, 'normal'); g.texteCouleur(GRIS);
  g.d.text(`${doc.nbFaits} activité${doc.nbFaits > 1 ? 's' : ''}`, MARGE + UTILE, g.y + 11.5, { align: 'right' });
  g.trait(ENCRE, 0.7); g.d.line(MARGE, g.y + 14.5, MARGE + UTILE, g.y + 14.5);
  g.y += 19;

  // Page 1 : le tableau de la journée, puis les métriques du jour en dessous. Page 2 : le suivi des projets (sur une seule page). Ensuite, les notes.
  g.largeurTable = UTILE;
  tableau(g, doc);
  metriquesEnGrille(g, doc.metriques);
  suivi(g, doc);
  notes(g, doc, images);

  // Pied de page
  const n = d.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    d.setPage(i);
    g.police(7.5, 'normal'); g.texteCouleur(PALE);
    d.text(versWinAnsi(`Luther Life · généré le ${doc.genereLe}`), MARGE, HAUTEUR - 8);
    d.text(`${i} / ${n}`, MARGE + UTILE, HAUTEUR - 8, { align: 'right' });
  }
  return d.output('blob');
}

/** Les images citées par les notes du document, réduites en JPEG (1000 px au plus) pour garder un PDF léger. Une image introuvable est ignorée. */
export async function chargerImages(doc: DocumentJournee): Promise<Map<string, ImagePdf>> {
  const res = new Map<string, ImagePdf>();
  const ids = new Set(doc.notes.flatMap((n) => n.blocs.flatMap((b) => (b.type === 'media' && b.media === 'image' ? [b.id] : []))));
  for (const id of ids) {
    try {
      const url = await urlMedia(id);
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const echelle = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      const l = Math.max(1, Math.round(bitmap.width * echelle)), h = Math.max(1, Math.round(bitmap.height * echelle));
      const canvas = document.createElement('canvas');
      canvas.width = l; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, l, h);
      ctx.drawImage(bitmap, 0, 0, l, h);
      bitmap.close?.();
      res.set(id, { donnees: canvas.toDataURL('image/jpeg', 0.8), largeur: l, hauteur: h });
    } catch { /* image illisible : elle sera signalée dans le PDF */ }
  }
  return res;
}
