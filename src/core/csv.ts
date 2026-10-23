// CSV : lecture tolérante (séparateur détecté, guillemets, BOM) et écriture protégée contre l'injection de formules.

/** Séparateur le plus fréquent de la première ligne non vide, hors guillemets. */
export function detecterSeparateur(texte: string): ';' | ',' | '\t' {
  const t = texte.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/).find((l) => l.trim()) ?? '';
  let dansGuillemets = false;
  const n = { ';': 0, ',': 0, '\t': 0 };
  for (const c of premiere) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && (c === ';' || c === ',' || c === '\t')) n[c]++;
  }
  return n[';'] >= n[','] && n[';'] >= n['\t'] ? ';' : n[','] >= n['\t'] ? ',' : '\t';
}

/** Découpe un texte CSV en enregistrements (les lignes vides sont conservées, sous la forme `['']`). */
export function lireCsv(texte: string, separateur = detecterSeparateur(texte)): string[][] {
  const t = texte.replace(/^﻿/, '');
  const lignes: string[][] = [];
  let champ = '', ligne: string[] = [], guillemets = false;
  const finChamp = () => { ligne.push(champ); champ = ''; };
  const finLigne = () => { finChamp(); lignes.push(ligne); ligne = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; } else champ += c;
    } else if (c === '"' && champ === '') guillemets = true;
    else if (c === separateur) finChamp();
    else if (c === '\n') finLigne();
    else if (c === '\r') { if (t[i + 1] !== '\n') finLigne(); }
    else champ += c;
  }
  if (champ !== '' || ligne.length) finLigne();
  return lignes;
}

/** Une cellule qui commence par = + - @ serait interprétée comme une formule par un tableur : on la neutralise. */
export const neutraliser = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export function cellule(v: string | number, separateur = ';'): string {
  const s = typeof v === 'number' ? String(v) : neutraliser(v);
  return /["\r\n]/.test(s) || s.includes(separateur) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Texte CSV prêt à télécharger (BOM pour Excel, fins de ligne Windows). */
export function ecrireCsv(lignes: (string | number)[][], separateur = ';'): string {
  return '﻿' + lignes.map((l) => l.map((v) => cellule(v, separateur)).join(separateur)).join('\r\n') + '\r\n';
}
