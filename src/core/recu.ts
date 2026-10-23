// Reçu téléchargeable (PDF minimal, sans bibliothèque) et QR visuel de démonstration (non scannable, aucun appel réseau).

/** Numéro de reçu : initiales des mots capitalisés du prestataire, année, compteur (« CLP-2026-1187 »). */
export function numeroRecu(prestataire: string, annee: number, n: number): string {
  const ini = prestataire.split(/\s+/).filter((m) => /^\p{Lu}/u.test(m)).map((m) => m[0]).join('').slice(0, 4) || 'AM';
  return `${ini.toUpperCase()}-${annee}-${n}`;
}

/** Texte en octets Latin-1 (WinAnsi) : les caractères hors plage sont remplacés. */
function latin1(s: string): string {
  return s.replace(/€/g, 'EUR').replace(/[  ]/g, ' ').replace(/→/g, '->').replace(/[−–—]/g, '-').replace(/[’]/g, "'")
    .replace(/[^\x00-\xff]/g, '?').replace(/[\\()]/g, (c) => '\\' + c);
}
/** PDF d'une page (Helvetica, une ligne de texte par entrée). Retourne les octets. */
export function pdfSimple(titre: string, lignes: string[]): Uint8Array {
  const flux = ['BT', '/F1 18 Tf', '56 780 Td', `(${latin1(titre)}) Tj`, '/F1 11 Tf', '0 -30 Td', '16 TL', ...lignes.map((l) => `(${latin1(l)}) Tj T*`), 'ET'].join('\n');
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`
  ];
  let sortie = '%PDF-1.4\n'; const pos: number[] = [];
  objets.forEach((o, i) => { pos.push(sortie.length); sortie += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = sortie.length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(sortie, (c) => c.charCodeAt(0) & 0xff);
}

/** Suite pseudo-aléatoire déterministe (même graine, même motif). */
const suivant = (s: number) => (s * 1_103_515_245 + 12_345) & 0x7fffffff;
/** Grille N×N : trois repères aux coins + données pseudo-aléatoires. Visuel seulement. */
export function motifQr(graine: number, N = 21): boolean[][] {
  const g: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
  let s = Math.abs(Math.floor(graine)) || 1;
  const repere = (ox: number, oy: number) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) g[oy + y][ox + x] = x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if ((x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8)) continue;
    s = suivant(s); g[y][x] = ((s >> 16) & 1) === 1;
  }
  repere(0, 0); repere(N - 7, 0); repere(0, N - 7);
  return g;
}
/** Code client à 6 chiffres, saisissable si le client ne peut pas scanner. */
export function codeClient(graine: number): string {
  let s = Math.abs(Math.floor(graine)) || 1; let c = '';
  for (let i = 0; i < 6; i++) { s = suivant(s); c += String((s >> 12) % 10); }
  return `${c.slice(0, 3)} ${c.slice(3)}`;
}
