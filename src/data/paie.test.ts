import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from './store.svelte.ts';
import { fournirPrelevements, lignesDe, rattraperPaies } from './paie.ts';

describe('moteur de paie', () => {
  beforeEach(() => {
    reinitialiser('demo');
    app.compte!.cree = Date.parse('2026-06-01');
    app.dernierePaie = '2026-07-28';
    app.solde = 0;
    app.mouvements = [];
    let payees = 0;
    fournirPrelevements('test', () => [
      { id: 'pass', type: 'pass', libelle: 'Pass Famille', detail: '', montant: 12_500, appliquer: () => {} },
      { id: 'ecole', type: 'credit', libelle: 'École', detail: '', montant: 44_000, appliquer: () => { payees++; app.credits[0].payees = 2 + payees; } }
    ]);
  });
  it('rattrape 3 paies manquées (28 août, 28 sept., 28 oct.)', () => {
    const n = rattraperPaies(Date.parse('2026-10-29T10:00:00'));
    expect(n).toBe(3);
    expect(app.dernierePaie).toBe('2026-10-28');
    expect(app.solde).toBe(3 * (520_000 - 56_500));
    expect(app.credits[0].payees).toBe(5);
  });
  it('ne repasse pas une paie déjà traitée', () => {
    rattraperPaies(Date.parse('2026-10-29T10:00:00'));
    expect(rattraperPaies(Date.parse('2026-10-30T10:00:00'))).toBe(0);
  });
  it("l'aperçu ne modifie rien", () => {
    const l = lignesDe('2026-11-28'); expect(l.map((x) => x.montant)).toEqual([12_500, 44_000]); expect(app.solde).toBe(0);
  });
});
