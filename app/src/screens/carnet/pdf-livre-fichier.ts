// Dessin du PDF d'un livre avec jsPDF (chargé seulement à l'export) : couverture colorée, sommaire numéroté, ouvertures de chapitre centrées, pages.
import { blocNote, Dessin, ENCRE, GRIS, HAUTEUR, LARGEUR, MARGE, PALE, UTILE, rgbDe, versWinAnsi, type ImagePdf } from '../fil/pdf-journee-fichier.ts';
import type { DocumentLivre, EntreeLivre } from './pdf-livre.ts';

const LIGNES_PAR_PAGE_SOMMAIRE = 34;

/** Une passe de dessin : rend le document et le numéro de page de chaque entrée (le sommaire en a besoin avant d'être écrit). */
async function dessiner(doc: DocumentLivre, images: Map<string, ImagePdf>, numeros: Map<string, number> | null) {
  const { jsPDF: PDF } = await import('jspdf');
  const d = new PDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  d.setProperties({ title: versWinAnsi(doc.titre), subject: 'Livre Luther Life', creator: 'Luther Life' });
  const g = new Dessin(d);
  const pages = new Map<string, number>();
  const couleur = rgbDe(doc.couleur);
  const sombre: [number, number, number] = [Math.round(couleur[0] * 0.55), Math.round(couleur[1] * 0.55), Math.round(couleur[2] * 0.55)];

  // Couverture (centrée dans la page sans la reliure de 12 mm)
  const CX = (LARGEUR + 12) / 2;
  g.fond(sombre); d.rect(0, 0, LARGEUR, HAUTEUR, 'F');
  g.fond(couleur); d.rect(0, 0, LARGEUR, HAUTEUR * 0.72, 'F');
  g.fond([255, 255, 255]); d.setGState?.(new (d as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.18 })); d.rect(0, 0, 12, HAUTEUR, 'F'); d.setGState?.(new (d as unknown as { GState: new (o: object) => object }).GState({ opacity: 1 }));
  g.d.setTextColor(255, 255, 255);
  g.police(30, 'bolditalic');
  const titre = g.mots(doc.titre, LARGEUR - 70);
  const y0 = 105 - (titre.length * 13) / 2;
  titre.slice(0, 6).forEach((t, i) => d.text(t, CX, y0 + i * 13, { align: 'center' }));
  g.fond([255, 255, 255]); d.rect(CX - 18, y0 + titre.length * 13 + 2, 36, 0.8, 'F');
  g.police(11, 'normal');
  if (doc.theme) d.text(versWinAnsi(doc.theme.toUpperCase()), CX, HAUTEUR * 0.72 - 14, { align: 'center', charSpace: 1.5 });
  g.police(10, 'normal'); g.d.setTextColor(235, 235, 235);
  d.text(`${doc.chapitres} chapitre${doc.chapitres > 1 ? 's' : ''} · ${doc.pages} page${doc.pages > 1 ? 's' : ''}`, CX, HAUTEUR * 0.72 + 24, { align: 'center' });
  if (doc.auteur) { g.police(14, 'normal'); d.text(versWinAnsi(doc.auteur), CX, HAUTEUR - 24, { align: 'center', charSpace: 1 }); }

  // Sommaire (pages réservées : leur nombre ne dépend que du nombre d'entrées)
  const nbSommaire = Math.max(1, Math.ceil(doc.entrees.length / LIGNES_PAR_PAGE_SOMMAIRE));
  for (let p = 0; p < nbSommaire; p++) {
    d.addPage(); g.y = MARGE + 6;
    if (p === 0) { g.police(20, 'bold'); g.texteCouleur(ENCRE); d.text('Table des matières', MARGE, g.y + 6); g.y += 16; }
    doc.entrees.slice(p * LIGNES_PAR_PAGE_SOMMAIRE, (p + 1) * LIGNES_PAR_PAGE_SOMMAIRE).forEach((e) => {
      const x = MARGE + e.niveau * 8;
      g.police(e.niveau ? 9.5 : 10.5, e.niveau ? 'normal' : 'bold'); g.texteCouleur(e.niveau ? GRIS : ENCRE);
      const num = `${e.numero}`;
      d.text(num, x, g.y + 4);
      const lib = g.mots(e.titre, UTILE - 30 - e.niveau * 8)[0] ?? '';
      d.text(lib, x + 12, g.y + 4);
      const n = String(numeros?.get(e.id) ?? '');
      d.text(n, MARGE + UTILE, g.y + 4, { align: 'right' });
      g.trait([225, 223, 217], 0.2); d.setLineDashPattern?.([0.6, 1.2], 0);
      const wl = g.largeur(lib);
      d.line(x + 13 + wl, g.y + 3.6, MARGE + UTILE - 8, g.y + 3.6);
      d.setLineDashPattern?.([], 0);
      g.y += 7.6;
    });
  }

  // Chapitres et pages
  const ecrire = (e: EntreeLivre) => {
    d.addPage(); g.y = MARGE + 4;
    pages.set(e.id, g.page());
    if (e.conteneur) {
      g.police(9, 'normal'); g.texteCouleur(couleur); d.text(`${e.niveau ? 'PARTIE' : 'CHAPITRE'} ${e.numero}`.split('').join(' '), LARGEUR / 2, HAUTEUR / 2 - 16, { align: 'center' });
      g.police(26, 'bold'); g.texteCouleur(ENCRE);
      const t = g.mots(e.titre, UTILE - 20);
      t.slice(0, 5).forEach((l, i) => d.text(l, LARGEUR / 2, HAUTEUR / 2 + i * 11, { align: 'center' }));
      g.fond(couleur); d.rect(LARGEUR / 2 - 10, HAUTEUR / 2 + Math.min(t.length, 5) * 11 + 2, 20, 0.8, 'F');
      return;
    }
    g.police(8, 'bold'); g.texteCouleur(couleur);
    d.text(`${e.niveau ? 'PAGE' : 'CHAPITRE'} ${e.numero}`.split('').join(' '), MARGE, g.y + 3);
    g.y += 9;
    for (const b of e.blocs) blocNote(g, b, images);
    if (e.signature) {
      g.y += 3; g.place(8);
      g.police(9.5, 'italic'); g.texteCouleur(GRIS);
      d.text(versWinAnsi(e.signature), MARGE + UTILE, g.y + 3, { align: 'right' });
      g.y += 6;
    }
  };
  doc.entrees.forEach(ecrire);

  // Pied de page (pas sur la couverture)
  const n = d.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    d.setPage(i);
    g.police(7.5, 'normal'); g.texteCouleur(PALE);
    d.text(versWinAnsi(doc.titre), MARGE, HAUTEUR - 8);
    d.text(String(i), MARGE + UTILE, HAUTEUR - 8, { align: 'right' });
  }
  return { d, pages };
}

/** Le livre en PDF : deux passes (la première donne les numéros de page du sommaire). */
export async function genererPdfLivre(doc: DocumentLivre, images: Map<string, ImagePdf> = new Map()): Promise<Blob> {
  const premiere = await dessiner(doc, images, null);
  const { d } = await dessiner(doc, images, premiere.pages);
  return d.output('blob');
}
