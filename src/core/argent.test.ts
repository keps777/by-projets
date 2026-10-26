import { describe, expect, it } from 'vitest';
import { ecart, fmt as fmtBrut, fmtPct as fmtPctBrut, fmtSigne as fmtSigneBrut } from './argent.ts';

/** Les montants utilisent des espaces insécables ; les tests les comparent à des espaces ordinaires. */
const ns = (s: string) => s.replace(/\u00A0/g, ' ');
const fmt: typeof fmtBrut = (x, o) => ns(fmtBrut(x, o)), fmtPct = (x: number) => ns(fmtPctBrut(x)), fmtSigne: typeof fmtSigneBrut = (x, o) => ns(fmtSigneBrut(x, o));
it('utilise bien des espaces insécables', () => { expect(fmtBrut(1480)).toBe('1\u00A0480\u00A0$'); });

describe('argent', () => {
  it('formate les dollars à la québécoise', () => {
    expect(fmt(1480)).toBe('1 480 $'); expect(fmt(1152, { centimes: true })).toBe('1 152,00 $'); expect(fmt(437.5)).toBe('437,50 $'); expect(fmt(-550)).toBe('−550 $'); expect(fmt(0)).toBe('0 $');
  });
  it('signe toujours les écarts', () => {
    expect(fmtSigne(1680)).toBe('+1 680 $'); expect(fmtSigne(-60)).toBe('−60 $'); expect(fmtPct(100)).toBe('+100 %'); expect(fmtPct(-3)).toBe('−3 %'); expect(fmtPct(-26.8)).toBe('−26,8 %');
  });
  it('calcule l\'écart entre payé et équivalent', () => {
    expect(ecart(1000, 2000)).toEqual({ abs: 1000, pct: 100, sens: 'hausse' });
    expect(ecart(1850, 1790)).toEqual({ abs: -60, pct: -3.2, sens: 'baisse' });
    expect(ecart(100, 100).sens).toBe('stable');
  });
});
