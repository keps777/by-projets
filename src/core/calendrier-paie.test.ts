import { describe, expect, it } from 'vitest';
import { calendrierPaies, etiquetteMois, pourcent, repartition } from './calendrier-paie.ts';
import type { LignePrelevement } from './prelevement.ts';

const L: LignePrelevement[] = [
  { id: 'pass', type: 'pass', libelle: 'Pass Famille', detail: '', montant: 12_500 },
  { id: 'ecole', type: 'credit', libelle: 'Crédit scolaire', detail: '', montant: 44_000 },
  { id: 'coffre', type: 'coffre', libelle: 'Coffre', detail: '', montant: 12_500 }
];
describe('calendrier des paies', () => {
  it('12 paies, quantième conservé, février compris', () => {
    const c = calendrierPaies('2026-10-28', 28, 12);
    expect(c).toHaveLength(12);
    expect(c[0]).toBe('2026-10-28'); expect(c[1]).toBe('2026-11-28'); expect(c[4]).toBe('2027-02-28'); expect(c[11]).toBe('2027-09-28');
    expect(calendrierPaies('2027-01-31', 31, 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
  it("étiquettes : année courante sans année, ensuite « JUIN 27 »", () => {
    expect(etiquetteMois('2026-11-28', 2026)).toBe('NOV');
    expect(etiquetteMois('2027-06-28', 2026)).toBe('JUIN 27');
  });
});
describe('répartition du salaire', () => {
  it('520 000 → 69 000 prélevés (13 %) → 451 000 versés', () => {
    const r = repartition(520_000, L);
    expect(r.preleve).toBe(69_000); expect(r.verse).toBe(451_000);
    expect(Math.round(r.part * 100)).toBe(13); expect(r.depassePlafond).toBe(false);
    expect(r.segments.map((s) => [s.type, s.montant])).toEqual([['pass', 12_500], ['credit', 44_000], ['coffre', 12_500], ['verse', 451_000]]);
    expect(r.segments.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6);
  });
  it('ignore les lignes reportées et signale un dépassement de 33 %', () => {
    const r = repartition(520_000, [{ ...L[1], reporte: true }, L[0]]);
    expect(r.preleve).toBe(12_500);
    expect(repartition(100_000, [{ id: 'x', type: 'credit', libelle: 'x', detail: '', montant: 34_000 }]).depassePlafond).toBe(true);
  });
  it('salaire nul ou aucune ligne : pas de division par zéro', () => {
    expect(repartition(0, L).part).toBe(0);
    const v = repartition(520_000, []);
    expect(v.segments).toEqual([{ type: 'verse', libelle: 'Versé sur votre solde', montant: 520_000, pct: 100 }]);
  });
});
describe('pourcentage', () => {
  it('une décimale sous 10 %, entier au-delà', () => {
    expect(pourcent(69_000 / 520_000)).toBe('13'); expect(pourcent(2438 / 520_000)).toBe('0,5'); expect(pourcent(0.33)).toBe('33'); expect(pourcent(0)).toBe('0');
  });
});
