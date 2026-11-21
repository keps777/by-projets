// PDF de la journée en vrai fichier (spec §9, nov. 2026) : dessiné avec jsPDF, chargé seulement à l'export. Recap des projets en cours avec barres,
// tableau des créneaux (vides compris), temps total, puis les notes du jour mises en forme, images comprises.
import type { jsPDF } from 'jspdf';
import { urlMedia } from '../../data/media.svelte.ts';
import type { BlocNote, Segment } from '../carnet/riche.ts';
import { dureeCourte, type BarreProjet, type DocumentJournee, type LigneJournee } from './pdf-journee.ts';

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

class Dessin {
  y = MARGE;
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
}

function barre(g: Dessin, x: number, y: number, w: number, h: number, pct: number | null, couleur: [number, number, number]) {
  g.fond(PISTE); g.d.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  const p = Math.max(0, Math.min(100, pct ?? 0));
  if (p > 0) { g.fond(couleur); g.d.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2, h / 2, 'F'); }
}

function ligneProjet(g: Dessin, p: BarreProjet, couleur: [number, number, number], fin: boolean) {
  const retrait = fin ? 5 : 0;
  g.place(fin ? 7.5 : 9.5);
  g.police(fin ? 8.5 : 10, 'normal');
  g.texteCouleur(fin ? GRIS : ENCRE);
  const nom = versWinAnsi(p.nom + (p.texte ? ` · ${p.texte}` : ''));
  const pct = p.pct == null ? '--' : `${Math.round(p.pct)} %`;
  g.d.setFont('helvetica', fin ? 'normal' : 'bold');
  const wPct = g.largeur(pct) + 2;
  g.d.setFont('helvetica', 'normal');
  g.d.text(g.mots(nom, UTILE - retrait - wPct)[0] ?? '', MARGE + retrait, g.y + 3.2);
  g.d.setFont('helvetica', 'bold');
  g.d.text(pct, MARGE + UTILE, g.y + 3.2, { align: 'right' });
  barre(g, MARGE + retrait, g.y + 4.6, UTILE - retrait, fin ? 1.4 : 2.2, p.pct, couleur);
  g.y += fin ? 7 : 9;
}

function recap(g: Dessin, doc: DocumentJournee) {
  if (!doc.groupes.length) return;
  g.place(30);
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('AVANCEMENT DES PROJETS EN COURS', MARGE, g.y + 3);
  g.y += 6;
  if (doc.moyenne != null) {
    g.police(10, 'normal'); g.texteCouleur(ENCRE);
    g.d.text('Avancement moyen des projets en cours', MARGE, g.y + 3.5);
    g.police(13, 'bold');
    g.d.text(`${Math.round(doc.moyenne)} %`, MARGE + UTILE, g.y + 4, { align: 'right' });
    barre(g, MARGE, g.y + 6, UTILE, 3.4, doc.moyenne, ENCRE);
    g.y += 13;
  }
  for (const groupe of doc.groupes) {
    const c = rgbDe(groupe.couleur);
    g.place(16);
    g.fond(c); g.d.circle(MARGE + 1.4, g.y + 2.4, 1.3, 'F');
    g.police(10, 'bold'); g.texteCouleur(ENCRE);
    g.d.text(versWinAnsi(groupe.nom), MARGE + 5, g.y + 3.2);
    g.y += 6;
    for (const p of groupe.projets) { ligneProjet(g, p, c, false); for (const s of p.sousProjets ?? []) ligneProjet(g, s, c, true); }
    g.y += 1.5;
  }
}

const COL = { creneau: 31, activite: 82, projets: UTILE - 31 - 82 };

function enteteTableau(g: Dessin) {
  g.police(7.5, 'bold'); g.texteCouleur(GRIS);
  g.d.text('CRÉNEAU', MARGE + 1.5, g.y + 3.6);
  g.d.text('ACTIVITÉ EFFECTUÉE', MARGE + COL.creneau + 1.5, g.y + 3.6);
  g.d.text('PROJETS EN COURS IMPLIQUÉS', MARGE + COL.creneau + COL.activite + 1.5, g.y + 3.6);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 5.4, MARGE + UTILE, g.y + 5.4);
  g.y += 6;
}

function ligneTableau(g: Dessin, l: LigneJournee) {
  const vide = l.type === 'vide';
  g.police(9.5, vide ? 'italic' : 'bold');
  const act = g.mots(l.activite, COL.activite - 3);
  g.police(9.5, 'normal');
  const proj = g.mots(l.projets, COL.projets - 3);
  g.police(8, 'normal');
  const detail = l.detail.flatMap((d) => g.mots(d, COL.activite - 3));
  const h = Math.max(act.length * 4.4 + detail.length * 3.7, proj.length * 4.4) + 3.6;
  if (g.place(h)) enteteTableau(g);
  if (vide) { g.fond([246, 245, 241]); g.d.rect(MARGE, g.y, UTILE, h, 'F'); }
  const y0 = g.y + 4.4;
  g.police(9, 'normal'); g.texteCouleur(vide ? PALE : ENCRE);
  g.d.setFont('courier', 'normal'); g.d.setFontSize(9);
  g.d.text(versWinAnsi(l.creneau), MARGE + 1.5, y0);
  g.police(9.5, vide ? 'italic' : 'bold'); g.texteCouleur(vide ? PALE : ENCRE);
  act.forEach((t, i) => g.d.text(t, MARGE + COL.creneau + 1.5, y0 + i * 4.4));
  g.police(8, 'normal'); g.texteCouleur(GRIS);
  detail.forEach((t, i) => g.d.text(t, MARGE + COL.creneau + 1.5, y0 + act.length * 4.4 + i * 3.7 - 0.4));
  g.police(9.5, 'normal'); g.texteCouleur(vide ? PALE : ENCRE);
  proj.forEach((t, i) => g.d.text(t, MARGE + COL.creneau + COL.activite + 1.5, y0 + i * 4.4));
  g.trait(FILET, 0.2); g.d.line(MARGE, g.y + h, MARGE + UTILE, g.y + h);
  g.y += h;
}

function tableau(g: Dessin, doc: DocumentJournee) {
  g.y += 2;
  g.place(30);
  g.police(8, 'bold'); g.texteCouleur(GRIS);
  g.d.text('CRÉNEAUX EFFECTUÉS', MARGE, g.y + 3);
  g.y += 6;
  enteteTableau(g);
  for (const l of doc.lignes) ligneTableau(g, l);
  g.place(11);
  g.trait(ENCRE, 0.45); g.d.line(MARGE, g.y + 1, MARGE + UTILE, g.y + 1);
  g.police(11, 'bold'); g.texteCouleur(ENCRE);
  g.d.text('Temps total de travail investi sur 24 h', MARGE + 1.5, g.y + 7.5);
  g.police(13, 'bold');
  g.d.text(doc.totalSecondes ? dureeCourte(doc.totalSecondes) : '0 min', MARGE + UTILE - 1.5, g.y + 7.7, { align: 'right' });
  g.y += 12;
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

  recap(g, doc);
  tableau(g, doc);
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
