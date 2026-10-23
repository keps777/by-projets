import { describe, expect, it } from 'vitest';
import { capaciteOctets, penalite, qrChemin, qrMatrice } from './qr.ts';

const motif = (m: boolean[][], x0: number, y0: number) => m.slice(y0, y0 + 7).map((l) => l.slice(x0, x0 + 7).map((c) => (c ? '#' : '.')).join(''));
const FINDER = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'];

describe('QR code maison', () => {
  it('choisit la plus petite version : 21, 25, 29 modules', () => {
    expect(qrMatrice('AM1|AM4821|483920', 'L')).toHaveLength(21);
    expect(qrMatrice('AM1|AM4821|483920', 'M')).toHaveLength(25);
    expect(qrMatrice('x'.repeat(30), 'M')).toHaveLength(29);
    expect(capaciteOctets(1, 'L')).toBe(17); expect(capaciteOctets(2, 'M')).toBe(26);
  });
  it('contient les trois repères et le motif de synchronisation', () => {
    const m = qrMatrice('AM1|AM4821|483920'), n = m.length;
    expect(motif(m, 0, 0)).toEqual(FINDER); expect(motif(m, n - 7, 0)).toEqual(FINDER); expect(motif(m, 0, n - 7)).toEqual(FINDER);
    for (let i = 8; i < n - 8; i++) { expect(m[6][i]).toBe(i % 2 === 0); expect(m[i][6]).toBe(i % 2 === 0); }
    expect(m[n - 8][8]).toBe(true);
  });
  it('est déterministe et change avec le contenu', () => {
    expect(qrMatrice('AM1|AM4821|111111')).toEqual(qrMatrice('AM1|AM4821|111111'));
    expect(qrMatrice('AM1|AM4821|111111')).not.toEqual(qrMatrice('AM1|AM4821|222222'));
  });
  it('refuse un texte trop long et accepte l’UTF-8', () => {
    expect(() => qrMatrice('x'.repeat(200))).toThrow();
    expect(qrMatrice('é'.repeat(10)).length).toBeGreaterThanOrEqual(25);
  });
  it('le tracé SVG recouvre exactement les modules noirs', () => {
    const m = qrMatrice('AM'), d = qrChemin(m);
    const aire = [...d.matchAll(/h(\d+)v1/g)].reduce((s, x) => s + Number(x[1]), 0);
    expect(aire).toBe(m.flat().filter(Boolean).length);
    expect(penalite(m)).toBeGreaterThan(0);
  });
});
