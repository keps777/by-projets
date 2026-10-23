// Encodeur de QR code maison (mode octets, versions 1 à 6, niveaux de correction L et M). Fonctions pures, sans dépendance.
export type NiveauQr = 'L' | 'M';
const ECC_PAR_BLOC: Record<NiveauQr, number[]> = { L: [7, 10, 15, 20, 26, 18], M: [10, 16, 26, 18, 24, 16] };
const NB_BLOCS: Record<NiveauQr, number[]> = { L: [1, 1, 1, 1, 1, 2], M: [1, 1, 1, 2, 2, 4] };
const BITS_FORMAT: Record<NiveauQr, number> = { L: 1, M: 0 };
export const VERSION_MAX = 6;

const taille = (v: number) => v * 4 + 17;
function modulesBruts(v: number): number {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; }
  return r;
}
const codesDonnees = (v: number, n: NiveauQr) => Math.floor(modulesBruts(v) / 8) - ECC_PAR_BLOC[n][v - 1] * NB_BLOCS[n][v - 1];
/** Nombre maximal d'octets qu'on peut coder pour cette version et ce niveau. */
export const capaciteOctets = (v: number, n: NiveauQr) => codesDonnees(v, n) - 2;

// ------------------------------------------------------------------ Reed-Solomon sur GF(256)
function mul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function diviseur(degre: number): number[] {
  const r = new Array<number>(degre).fill(0); r[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], racine); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    racine = mul(racine, 2);
  }
  return r;
}
function reste(donnees: number[], div: number[]): number[] {
  const r = new Array<number>(div.length).fill(0);
  for (const b of donnees) { const f = b ^ r.shift()!; r.push(0); div.forEach((c, i) => (r[i] ^= mul(c, f))); }
  return r;
}

// ------------------------------------------------------------------ construction
function codesAvecEcc(donnees: number[], v: number, n: NiveauQr): number[] {
  const nb = NB_BLOCS[n][v - 1], lenEcc = ECC_PAR_BLOC[n][v - 1], bruts = Math.floor(modulesBruts(v) / 8);
  const courts = nb - (bruts % nb), lenCourt = Math.floor(bruts / nb);
  const div = diviseur(lenEcc), blocs: number[][] = [];
  let k = 0;
  for (let i = 0; i < nb; i++) {
    const d = donnees.slice(k, k + lenCourt - lenEcc + (i < courts ? 0 : 1)); k += d.length;
    const ecc = reste(d, div);
    if (i < courts) d.push(0);
    blocs.push(d.concat(ecc));
  }
  const res: number[] = [];
  for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== lenCourt - lenEcc || j >= courts) res.push(b[i]); });
  return res;
}
function bitsDonnees(octets: number[], v: number, n: NiveauQr): number[] {
  const bits: number[] = [];
  const ajoute = (val: number, nbBits: number) => { for (let i = nbBits - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  ajoute(0b0100, 4); ajoute(octets.length, 8); octets.forEach((o) => ajoute(o, 8));
  const total = codesDonnees(v, n) * 8;
  ajoute(0, Math.min(4, total - bits.length));
  ajoute(0, (8 - (bits.length % 8)) % 8);
  const res: number[] = [];
  for (let i = 0; i < bits.length; i += 8) res.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; res.length < codesDonnees(v, n); pad ^= 0xec ^ 0x11) res.push(pad);
  return res;
}
const MASQUES: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

function positionsAlignement(v: number): number[] {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, pas = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
  for (let p = taille(v) - 7; r.length < n; p -= pas) r.splice(1, 0, p);
  return r;
}
class Grille {
  readonly t: number; m: boolean[][]; fonction: boolean[][];
  constructor(readonly v: number) {
    this.t = taille(v);
    this.m = Array.from({ length: this.t }, () => new Array<boolean>(this.t).fill(false));
    this.fonction = Array.from({ length: this.t }, () => new Array<boolean>(this.t).fill(false));
  }
  set(x: number, y: number, noir: boolean) { this.m[y][x] = noir; this.fonction[y][x] = true; }
  motifs() {
    const t = this.t;
    for (let i = 0; i < t; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [t - 4, 3], [3, t - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < t && y >= 0 && y < t) this.set(x, y, d !== 2 && d !== 4);
      }
    }
    const pos = positionsAlignement(this.v);
    for (const cy of pos) for (const cx of pos) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === t - 7) || (cx === t - 7 && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    this.format(0, 'L'); // réserve les cases du format (réécrites ensuite)
  }
  format(masque: number, n: NiveauQr) {
    const t = this.t, d = (BITS_FORMAT[n] << 3) | masque;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412, b = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.set(8, i, b(i));
    this.set(8, 7, b(6)); this.set(8, 8, b(7)); this.set(7, 8, b(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) this.set(t - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) this.set(8, t - 15 + i, b(i));
    this.set(8, t - 8, true);
  }
  placer(codes: number[]) {
    let i = 0;
    for (let droite = this.t - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < this.t; vert++) for (let j = 0; j < 2; j++) {
        const x = droite - j, y = ((droite + 1) & 2) === 0 ? this.t - 1 - vert : vert;
        if (!this.fonction[y][x] && i < codes.length * 8) { this.m[y][x] = ((codes[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
  }
  masquer(k: number) {
    for (let y = 0; y < this.t; y++) for (let x = 0; x < this.t; x++) if (!this.fonction[y][x] && MASQUES[k](x, y)) this.m[y][x] = !this.m[y][x];
  }
}

/** Pénalité de lisibilité d'une grille (règles 1 à 4 de la norme) : plus elle est basse, mieux c'est. */
export function penalite(m: boolean[][]): number {
  const t = m.length; let p = 0;
  const lignes = [...m, ...m.map((_, x) => m.map((r) => r[x]))];
  for (const l of lignes) {
    let run = 1;
    for (let i = 1; i <= t; i++) {
      if (i < t && l[i] === l[i - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; }
    }
    const s = l.map((c) => (c ? '1' : '0')).join('');
    for (const motif of ['00001011101', '10111010000']) for (let i = s.indexOf(motif); i >= 0; i = s.indexOf(motif, i + 1)) p += 40;
  }
  for (let y = 0; y < t - 1; y++) for (let x = 0; x < t - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  const noirs = m.flat().filter(Boolean).length, ecart = Math.abs((noirs * 20) / (t * t) - 10);
  return p + Math.floor(ecart) * 10;
}

/** Grille de modules (true = noir) du QR code qui encode `texte` en UTF-8. Lève une erreur si le texte dépasse la version 6. */
export function qrMatrice(texte: string, niveau: NiveauQr = 'M'): boolean[][] {
  const octets = [...new TextEncoder().encode(texte)];
  let v = 1;
  while (v <= VERSION_MAX && octets.length > capaciteOctets(v, niveau)) v++;
  if (v > VERSION_MAX) throw new Error('Texte trop long pour le QR code');
  const codes = codesAvecEcc(bitsDonnees(octets, v, niveau), v, niveau);
  let meilleure: boolean[][] | null = null, score = Infinity;
  for (let k = 0; k < 8; k++) {
    const g = new Grille(v); g.motifs(); g.placer(codes); g.masquer(k); g.format(k, niveau);
    const p = penalite(g.m);
    if (p < score) { score = p; meilleure = g.m; }
  }
  return meilleure!;
}

/** Tracé SVG (attribut `d`) des modules noirs, une unité par module : à afficher avec viewBox="0 0 n n". */
export function qrChemin(m: boolean[][]): string {
  const parts: string[] = [];
  m.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      if (!ligne[x]) continue;
      let fin = x; while (fin + 1 < ligne.length && ligne[fin + 1]) fin++;
      parts.push(`M${x} ${y}h${fin - x + 1}v1h${x - fin - 1}z`); x = fin;
    }
  });
  return parts.join('');
}
